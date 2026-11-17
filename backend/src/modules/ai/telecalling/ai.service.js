'use strict';

/**
 * Multi-tenant (/api/ai) service for Rimi Finance <-> AutoFinex Voice AI.
 *
 * Every query is strictly scoped by `finance_id = $1` (never trusting client body finance_id).
 * Enforces Situation A/B/C separation (callbacks NEVER mutate DNC suppressions),
 * normalizes Sarvam bulbul:v4 voices, reuses authoritative Risk Scoring (`scoreCustomer`),
 * separates `GET /api/ai/leads` (read-only) from `POST /api/ai/leads/refresh` (with cooldown),
 * and provides composite Voice AI health checks.
 */

const crypto = require('crypto');
const { db } = require('../../../config/database.config');
const { scoreCustomer, todayIso } = require('../../risk/risk.scoring');
const { getCustomerFinancialRollup } = require('../../finance/financialCalculation.service');
const {
  checkVoiceSystemHealth,
  dispatchManualCallToVoiceAgent,
  assertServerTelephonySafetyGates,
  assertDestinationAllowlistedIfRequired,
  classifyDispatchTransportError,
} = require('./voiceAgent.client');
const {
  presignCustomerPhoto,
  presignCallRecordingPlayback,
} = require('./voiceRecording.s3');
const {
  validateIdempotencyKey,
  toDbLifecycleStatus,
  fromDbCallRowToDomainState,
} = require('./callLifecycle.mapper');

const UUID_STRICT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_LEAD_REFRESH_COOLDOWN_SEC = 60;
const DEFAULT_LEADS_PAGE_SIZE = 25;
const MAX_LEADS_PAGE_SIZE = 100;

const SARVAM_V4_VOICES = new Set([
  'gokul_ta_narration',
  'vijay_ta_narration',
  'aravind_ta_ads',
  'kavitha_ta_narration',
  'shubh_enhi_ads',
  'priya_enhi_narration',
  'rahul_hi_narration',
  'sneha_te_narration',
]);

function normalizeSarvamV4Voice(requestedVoice, defaultLang = 'ta-IN') {
  const v = String(requestedVoice || '').trim();
  if (
    SARVAM_V4_VOICES.has(v) ||
    (v.includes('_') && (v.includes('_ta_') || v.includes('_enhi_') || v.includes('_hi_') || v.includes('_te_')))
  ) {
    return v;
  }
  const lang = String(defaultLang || 'ta-IN').toLowerCase();
  if (lang.startsWith('en') || lang.startsWith('hi')) return 'shubh_enhi_ads';
  if (lang.startsWith('te')) return 'sneha_te_narration';
  return 'gokul_ta_narration';
}

function createHttpError(statusCode, message, code = null, details = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-cyan-500',
];

function pickAvatarColor(seed) {
  const s = String(seed || '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatRelativeTime(ts) {
  if (!ts) return 'Never';
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return 'Never';
  const diffMin = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 60000));
  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDays = Math.floor(diffHr / 24);
  return diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
}

function formatDurationSeconds(sec) {
  const n = Number(sec || 0);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const mins = Math.floor(n / 60);
  const rem = Math.round(n % 60);
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

async function getAiSettings(financeId, opts = {}) {
  const runner = opts.queryRunner || db;
  const { rows } = await runner.query(
    `SELECT finance_id, company_rules, system_instructions, behavior_flags,
            escalation_policy, voice_config, COALESCE(config_version, 1) AS config_version
       FROM ai_settings
      WHERE finance_id = $1
      LIMIT 1`,
    [financeId]
  );

  if (rows.length === 0) {
    return {
      financeId,
      configVersion: 1,
      companyRules: { leaveDate: '', leaveReason: '', notificationsEnabled: true },
      aiInstructions: '',
      behavior: {
        autoReply: true,
        paymentReminder: true,
        followUpReminder: true,
        escalationAlerts: true,
      },
      escalation: {
        negativeAction: 'notify_admin',
        noResponseHours: '24',
        autoFollowUp: true,
      },
      voiceConfig: {
        enabled: true,
        default_language: 'ta-IN',
        tts_model: 'bulbul:v4',
        tts_voice: 'gokul_ta_narration',
        calling_window_start: '09:00',
        calling_window_end: '18:00',
        max_concurrent_calls: 3,
        memory_token_budget: 450,
      },
    };
  }

  const row = rows[0];
  const vc = row.voice_config || {};
  const esc = row.escalation_policy || {};
  return {
    financeId: String(row.finance_id),
    configVersion: Number(row.config_version || 1),
    companyRules: {
      leaveDate: row.company_rules?.leaveDate || '',
      leaveReason: row.company_rules?.leaveReason || '',
      notificationsEnabled: row.company_rules?.notificationsEnabled ?? true,
    },
    aiInstructions: row.system_instructions || '',
    behavior: {
      autoReply: row.behavior_flags?.autoReply ?? true,
      paymentReminder: row.behavior_flags?.paymentReminder ?? true,
      followUpReminder: row.behavior_flags?.followUpReminder ?? true,
      escalationAlerts: row.behavior_flags?.escalationAlerts ?? true,
    },
    escalation: {
      negativeAction: esc.negativeAction || 'notify_admin',
      noResponseHours: String(esc.noResponseHours ?? '24'),
      autoFollowUp: esc.autoFollowUp ?? true,
    },
    voiceConfig: {
      ...vc,
      tts_model: vc.tts_model || 'bulbul:v4',
      tts_voice: normalizeSarvamV4Voice(vc.tts_voice, vc.default_language),
    },
  };
}

async function updateAiSettings(financeId, payload = {}, opts = {}) {
  const runner = opts.queryRunner || db;
  const userId = opts.userId || null;

  const companyRules = {
    leaveDate: payload.companyRules?.leaveDate || null,
    leaveReason: payload.companyRules?.leaveReason || null,
    notificationsEnabled: Boolean(payload.companyRules?.notificationsEnabled ?? true),
  };
  const aiInstructions = String(payload.aiInstructions ?? '').slice(0, 4000);
  const behavior = {
    autoReply: Boolean(payload.behavior?.autoReply ?? true),
    paymentReminder: Boolean(payload.behavior?.paymentReminder ?? true),
    followUpReminder: Boolean(payload.behavior?.followUpReminder ?? true),
    escalationAlerts: Boolean(payload.behavior?.escalationAlerts ?? true),
  };
  const escalation = {
    negativeAction: String(payload.escalation?.negativeAction || 'notify_admin'),
    noResponseHours: Number(payload.escalation?.noResponseHours || 24),
    autoFollowUp: Boolean(payload.escalation?.autoFollowUp ?? true),
  };

  const rawVoice = payload.voiceConfig || {};
  const defaultLang = rawVoice.default_language || 'ta-IN';
  const voiceConfig = {
    enabled: Boolean(rawVoice.enabled ?? true),
    default_language: defaultLang,
    tts_model: rawVoice.tts_model || 'bulbul:v4',
    tts_voice: normalizeSarvamV4Voice(rawVoice.tts_voice, defaultLang),
    calling_window_start: rawVoice.calling_window_start || '09:00',
    calling_window_end: rawVoice.calling_window_end || '18:00',
    timezone: 'Asia/Kolkata',
    max_concurrent_calls: Math.min(25, Math.max(1, Number(rawVoice.max_concurrent_calls || 3))),
    memory_token_budget: Math.min(650, Math.max(50, Number(rawVoice.memory_token_budget || 450))),
  };

  const { rows } = await runner.query(
    `INSERT INTO ai_settings (
        finance_id, company_rules, system_instructions, behavior_flags,
        escalation_policy, voice_config, config_version, updated_by, updated_at
     ) VALUES ($1, $2::jsonb, $3, $4::jsonb, $5::jsonb, $6::jsonb, 1, $7, CURRENT_TIMESTAMP)
     ON CONFLICT (finance_id) DO UPDATE
       SET company_rules       = EXCLUDED.company_rules,
           system_instructions = EXCLUDED.system_instructions,
           behavior_flags      = EXCLUDED.behavior_flags,
           escalation_policy   = EXCLUDED.escalation_policy,
           voice_config        = EXCLUDED.voice_config,
           config_version      = COALESCE(ai_settings.config_version, 1) + 1,
           updated_by          = EXCLUDED.updated_by,
           updated_at          = CURRENT_TIMESTAMP
     RETURNING finance_id, company_rules, system_instructions, behavior_flags,
               escalation_policy, voice_config, config_version`,
    [
      financeId,
      JSON.stringify(companyRules),
      aiInstructions,
      JSON.stringify(behavior),
      JSON.stringify(escalation),
      JSON.stringify(voiceConfig),
      userId,
    ]
  );

  const saved = rows[0] || {};
  return {
    financeId,
    configVersion: Number(saved.config_version || 1),
    companyRules,
    aiInstructions,
    behavior,
    escalation: { ...escalation, noResponseHours: String(escalation.noResponseHours) },
    voiceConfig: saved.voice_config || voiceConfig,
  };
}

/**
 * Composite Voice AI Health Check (`GET /api/ai/voice-health`).
 * Requires both Dograh gateway (`https://voice.rimio.in/api/v1/health`) and
 * Python Voice Agent (`/health` RO-DB + Redis) to succeed before returning `ready`.
 */
async function getVoiceHealth(query = {}, opts = {}) {
  const forceRefresh = query.refresh === 'true' || query.refresh === true || Boolean(opts.forceRefresh);
  return checkVoiceSystemHealth({
    ...opts,
    forceRefresh,
  });
}

/**
 * Separate Lead Queue Refresh Endpoint (`POST /api/ai/leads/refresh`).
 *
 * Enforces a per-tenant cooldown via `ai_settings.leads_last_refreshed_at` so repeated
 * UI clicks cannot stampede `fn_refresh_daily_overdue_leads`.
 */
async function refreshTelecallingLeads(financeId, opts = {}) {
  const runner = opts.queryRunner || db;
  const cooldownSeconds = Math.max(
    5,
    Number(opts.cooldownSeconds ?? process.env.LEAD_REFRESH_COOLDOWN_SECONDS ?? DEFAULT_LEAD_REFRESH_COOLDOWN_SEC)
  );

  const { rows: settingRows } = await runner.query(
    `SELECT leads_last_refreshed_at
       FROM ai_settings
      WHERE finance_id = $1::uuid
      LIMIT 1`,
    [financeId]
  );

  const lastRefreshedRaw = settingRows[0]?.leads_last_refreshed_at || null;
  const nowMs = Date.now();

  if (lastRefreshedRaw && !opts.force) {
    const lastMs = new Date(lastRefreshedRaw).getTime();
    if (Number.isFinite(lastMs)) {
      const elapsedSec = Math.floor((nowMs - lastMs) / 1000);
      if (elapsedSec >= 0 && elapsedSec < cooldownSeconds) {
        const remainingSec = Math.max(1, cooldownSeconds - elapsedSec);
        const { rows: countRows } = await runner.query(
          `SELECT COUNT(*)::int AS active_lead_count
             FROM ai_telecalling_leads
            WHERE finance_id = $1::uuid
              AND COALESCE(overdue_amount, 0) > 0`,
          [financeId]
        );
        return {
          refreshed: false,
          cooldownActive: true,
          cooldownSeconds,
          cooldownRemainingSeconds: remainingSec,
          lastRefreshedAt: new Date(lastMs).toISOString(),
          refreshedCount: Number(countRows[0]?.active_lead_count || 0),
        };
      }
    }
  }

  const { rows: refreshRows } = await runner.query(
    `SELECT public.fn_refresh_daily_overdue_leads($1::uuid, true, NULL, NULL)::int AS refreshed_count`,
    [financeId]
  );

  // Reconcile `ai_telecalling_leads` directly against the authoritative Month-0 + IST + sub_due ledger
  // so false Oct/Nov leads are zeroed out immediately even prior to DDL 005 promotion.
  const { rows: reconciledRows } = await runner.query(
    `WITH ledger_calc AS (
       SELECT
         c.id AS customer_id,
         c.finance_id,
         l.id AS loan_id,
         c.loan_status::text AS loan_status,
         COALESCE(l.due_date, l.hp_date) AS anchor_date,
         GREATEST(0, COALESCE(l.due_month, 0))::int AS due_month,
         ROUND(COALESCE(l.due_amount, 0)::numeric, 2) AS inst_amt,
         CASE
           WHEN COALESCE(l.net_payable, 0) > 0 THEN ROUND(l.net_payable::numeric, 2)
           ELSE ROUND((GREATEST(0, COALESCE(l.due_month, 0)) * COALESCE(l.due_amount, 0))::numeric, 2)
         END AS contractual_due,
         ROUND((
           COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(p.amount, 0)))
             FROM public.payments p
             WHERE p.customer_id = c.id
               AND (p.finance_id IS NULL OR p.finance_id = c.finance_id)
               AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
               AND COALESCE(p.status::text, 'paid') <> 'cancelled'
           ), 0) +
           COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(sd.paid_amount, 0)))
             FROM public.sub_due sd
             JOIN public.payments p_sd ON p_sd.id = sd.payment_id
             WHERE sd.customer_id = c.id
               AND sd.finance_id = c.finance_id
               AND COALESCE(sd.status::text, 'active') <> 'cancelled'
               AND COALESCE(p_sd.payment_status::text, 'active') <> 'cancelled'
               AND COALESCE(p_sd.status::text, 'paid') <> 'cancelled'
           ), 0)
         )::numeric, 2) AS valid_emi_paid
       FROM public.customers c
       JOIN LATERAL (
         SELECT l_sub.*
         FROM public.loans l_sub
         WHERE l_sub.customer_id = c.id
           AND (l_sub.finance_id IS NULL OR l_sub.finance_id = c.finance_id)
         ORDER BY l_sub.due_date DESC NULLS LAST, l_sub.hp_date DESC NULLS LAST, l_sub.id DESC
         LIMIT 1
       ) l ON TRUE
       WHERE c.finance_id = $1::uuid
     ),
     sched AS (
       SELECT
         lc.*,
         (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today_ist,
         CASE
           WHEN lc.loan_status IN ('close', 'closed', 'completed', 'settled') THEN 0.00::numeric
           ELSE GREATEST(0.00, lc.contractual_due - lc.valid_emi_paid)
         END AS rem_sched_emi,
         CASE
           WHEN lc.inst_amt > 0 THEN LEAST(lc.due_month, FLOOR(lc.valid_emi_paid / lc.inst_amt)::int)
           ELSE 0
         END AS covered_cnt,
         COALESCE((
           SELECT COUNT(*)::int
           FROM generate_series(1, lc.due_month) AS gs(k)
           WHERE lc.anchor_date IS NOT NULL
             AND lc.due_month > 0
             AND public.fn_clamped_installment_date(lc.anchor_date, gs.k) < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
         ), 0) AS matured_cnt
       FROM ledger_calc lc
     ),
     resolved AS (
       SELECT
         s.customer_id,
         s.finance_id,
         s.loan_id,
         CASE
           WHEN s.rem_sched_emi <= 0 THEN 0.00::numeric
           ELSE LEAST(
             s.rem_sched_emi,
             GREATEST(0.00, LEAST(s.contractual_due, s.matured_cnt * s.inst_amt) - s.valid_emi_paid)
           )
         END AS overdue_amt,
         CASE
           WHEN s.anchor_date IS NOT NULL AND s.covered_cnt < s.due_month
             THEN public.fn_clamped_installment_date(s.anchor_date, s.covered_cnt + 1)
           ELSE NULL::date
         END AS cand_unpaid_date,
         s.inst_amt,
         s.today_ist
       FROM sched s
     ),
     updated_leads AS (
       UPDATE public.ai_telecalling_leads atl
          SET overdue_amount = r.overdue_amt,
              pending_emi_count = CASE
                WHEN r.overdue_amt > 0 AND r.inst_amt > 0 THEN CEIL(r.overdue_amt / r.inst_amt)::int
                ELSE 0
              END,
              earliest_unpaid_due_date = CASE
                WHEN r.overdue_amt > 0 AND r.cand_unpaid_date IS NOT NULL AND r.cand_unpaid_date < r.today_ist
                  THEN r.cand_unpaid_date
                ELSE NULL
              END,
              days_overdue = CASE
                WHEN r.overdue_amt > 0 AND r.cand_unpaid_date IS NOT NULL AND r.cand_unpaid_date < r.today_ist
                  THEN (r.today_ist - r.cand_unpaid_date)::int
                ELSE 0
              END,
              loan_id = COALESCE(r.loan_id, atl.loan_id),
              updated_at = NOW()
         FROM resolved r
        WHERE atl.finance_id = r.finance_id
          AND atl.customer_id = r.customer_id
       RETURNING atl.overdue_amount
     )
     SELECT COUNT(*) FILTER (WHERE overdue_amount > 0)::int AS reconciled_count
       FROM updated_leads`,
    [financeId]
  );

  const refreshedCount = Number(
    reconciledRows[0]?.reconciled_count ?? refreshRows[0]?.refreshed_count ?? 0
  );
  const { rows: stampRows } = await runner.query(
    `INSERT INTO ai_settings (finance_id, leads_last_refreshed_at, updated_at)
     VALUES ($1::uuid, NOW(), CURRENT_TIMESTAMP)
     ON CONFLICT (finance_id) DO UPDATE
       SET leads_last_refreshed_at = NOW(),
           updated_at = CURRENT_TIMESTAMP
     RETURNING leads_last_refreshed_at`,
    [financeId]
  );

  const stampedIso = stampRows[0]?.leads_last_refreshed_at
    ? new Date(stampRows[0].leads_last_refreshed_at).toISOString()
    : new Date(nowMs).toISOString();

  return {
    refreshed: true,
    cooldownActive: false,
    cooldownSeconds,
    cooldownRemainingSeconds: cooldownSeconds,
    lastRefreshedAt: stampedIso,
    refreshedCount,
  };
}

/**
 * Builds the SQL query for `getTelecallingLeads` (strictly read-only).
 * Joins `customers`, latest `loans`, `fn_calculate_customer_due_summary`, `ai_telecalling_leads`,
 * latest `ai_telecalling_call_logs`, today's call activity in `Asia/Kolkata`, `vehicle_detail`,
 * `vehicle_info`, `contacts`, `kyc_documents`, and risk-scoring payment/PTP/seizure history.
 */
const TELECALLING_LEADS_SQL = `
  SELECT
    c.id::text AS customer_id,
    COALESCE(atl.id, c.id)::text AS lead_id,
    atl.id::text AS raw_lead_id,
    c.cname AS customer_name,
    c.hplno,
    c.loan_status::text AS loan_status,
    TO_CHAR(c.created_at, 'YYYY-MM-DD') AS customer_created_at,
    l.id::text AS loan_uuid,
    COALESCE(l.loan_type, 'Vehicle Loan') AS loan_type,
    COALESCE(l.hp_amount, 0)::float8 AS hp_amount,
    TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS hp_date,
    TO_CHAR(l.due_date, 'YYYY-MM-DD') AS due_date,
    COALESCE(l.due_month, 0)::int AS due_month,
    COALESCE(l.interest_rate, 0)::float8 AS interest_rate,
    COALESCE(l.penalty_amount, 0)::float8 AS penalty_amount,
    COALESCE(l.due_amount, 0)::float8 AS emi_amount,
    COALESCE(l.net_payable, 0)::float8 AS net_payable,
    COALESCE(v.vehicle_number, '—') AS vehicle_number,
    COALESCE(vi.brand, '') AS vehicle_brand,
    COALESCE(vi.model_name, v.vehicle_modal, '') AS vehicle_model_name,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', NULLIF(vi.brand, ''), COALESCE(vi.model_name, v.vehicle_modal))), ''),
      v.vehicle_modal,
      'Two Wheeler'
    ) AS vehicle_display,
    COALESCE(atl.phone_e164, ds.phone_e164, ph.primary_phone, '') AS phone,
    COALESCE(ph.phones, '[]'::json) AS phones,
    kyc.file_path AS photo_s3_key,
    COALESCE(ds.overdue_amount, 0)::float8 AS overdue_amount,
    COALESCE(ds.outstanding_penalty_amount, l.penalty_amount, 0)::float8 AS pending_penalty_amount,
    (COALESCE(ds.overdue_amount, 0) + COALESCE(ds.outstanding_penalty_amount, l.penalty_amount, 0))::float8 AS total_overdue_with_penalty,
    COALESCE(ds.total_paid, pay.total_paid, 0)::float8 AS total_paid_amount,
    COALESCE(ds.total_balance_amount, 0)::float8 AS total_balance_amount,
    COALESCE(ds.pending_emi_count, 0)::int AS unpaid_months,
    COALESCE(ds.installments_covered, 0)::int AS paid_months,
    COALESCE(ds.days_overdue, 0)::int AS days_overdue,
    TO_CHAR(ds.earliest_unpaid_due_date, 'YYYY-MM-DD') AS earliest_unpaid_due_iso,
    COALESCE(
      TO_CHAR(ds.earliest_unpaid_due_date, 'DD Mon YYYY'),
      'Due'
    ) AS due_date_label,
    COALESCE(ds.total_paid, pay.total_paid, 0)::float8 AS risk_total_paid,
    COALESCE(pay.payment_count, 0)::int AS payment_count,
    COALESCE(pay.on_time_count, 0)::int AS on_time_count,
    COALESCE(pay.late_15_30, 0)::int AS late_15_30,
    COALESCE(pay.late_31_60, 0)::int AS late_31_60,
    COALESCE(pay.late_over_60, 0)::int AS late_over_60,
    COALESCE(ptp.broken_ptp_count, 0)::int AS broken_ptp_count,
    COALESCE(sz.has_seizure, false) AS has_seizure,
    COALESCE(atl.call_status::text, 'uncalled') AS lead_call_status,
    COALESCE(atl.attempt_count, 0)::int AS lead_attempt_count,
    COALESCE(last_log.started_at, atl.last_call_at) AS last_call_at,
    atl.last_call_duration AS lead_last_call_duration,
    atl.notes AS lead_notes,
    atl.call_outcome_note AS lead_call_outcome_note,
    atl.scheduled_time,
    COALESCE(atl.schedule_preset, TO_CHAR(atl.scheduled_time, 'DD Mon HH12:MI AM')) AS scheduled_time_label,
    (COALESCE(atl.is_suppressed, false) OR COALESCE(sup.is_suppressed, false)) AS is_suppressed,
    last_log.id::text AS last_call_id,
    last_log.call_status::text AS last_log_status,
    last_log.call_outcome AS last_call_outcome,
    last_log.disposition AS last_call_disposition,
    COALESCE(last_log.answered, false) AS last_call_answered,
    COALESCE(last_log.customer_spoke, false) AS last_call_customer_spoke,
    COALESCE(last_log.duration_sec, 0)::int AS last_call_duration_sec,
    last_log.summary_text AS last_call_summary,
    last_log.recording_s3_key AS last_recording_s3_key,
    last_log.recording_status AS last_recording_status,
    TO_CHAR(last_log.promised_date, 'YYYY-MM-DD') AS last_promised_date,
    last_log.promised_amount::float8 AS last_promised_amount,
    COALESCE(last_log.sentiment::text, 'neutral') AS last_call_sentiment,
    COALESCE(today_stats.total_logs, 0)::int AS total_call_logs_count,
    COALESCE(today_stats.attempts_today, 0)::int AS attempts_today,
    COALESCE(today_stats.spoken_today, false) AS called_and_spoken_today,
    COALESCE(today_stats.no_response_today, false) AS no_response_today
  FROM customers c
  JOIN LATERAL (
    SELECT l_sub.*
      FROM loans l_sub
     WHERE l_sub.customer_id = c.id
       AND (l_sub.finance_id = $1::uuid OR l_sub.finance_id IS NULL)
     ORDER BY l_sub.due_date DESC NULLS LAST, l_sub.hp_date DESC NULLS LAST, l_sub.id DESC
     LIMIT 1
  ) l ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      SUM(COALESCE(p.amount, 0)) AS main_paid,
      SUM(COALESCE(p.penalty, 0)) AS penalty_paid,
      COUNT(*) AS payment_count,
      COUNT(*) FILTER (
        WHERE (p.payment_date - COALESCE(p.due_date, public.fn_clamped_installment_date(COALESCE(l.due_date, l.hp_date, c.created_at::date), 1))) <= 5
      ) AS on_time_count,
      COUNT(*) FILTER (
        WHERE (p.payment_date - COALESCE(p.due_date, public.fn_clamped_installment_date(COALESCE(l.due_date, l.hp_date, c.created_at::date), 1))) BETWEEN 15 AND 30
      ) AS late_15_30,
      COUNT(*) FILTER (
        WHERE (p.payment_date - COALESCE(p.due_date, public.fn_clamped_installment_date(COALESCE(l.due_date, l.hp_date, c.created_at::date), 1))) BETWEEN 31 AND 60
      ) AS late_31_60,
      COUNT(*) FILTER (
        WHERE (p.payment_date - COALESCE(p.due_date, public.fn_clamped_installment_date(COALESCE(l.due_date, l.hp_date, c.created_at::date), 1))) > 60
      ) AS late_over_60
    FROM payments p
   WHERE p.customer_id = c.id
     AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
     AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
     AND COALESCE(p.status::text, 'paid') <> 'cancelled'
  ) pay_raw ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE(sd.paid_amount, 0)), 0) AS sub_paid
      FROM sub_due sd
      JOIN payments p_sd ON p_sd.id = sd.payment_id
     WHERE sd.customer_id = c.id
       AND sd.finance_id = $1::uuid
       AND COALESCE(sd.status::text, 'active') <> 'cancelled'
       AND COALESCE(p_sd.payment_status::text, 'active') <> 'cancelled'
       AND COALESCE(p_sd.status::text, 'paid') <> 'cancelled'
  ) sub_raw ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE(pen.total_penalty, 0)), 0) AS pending_penalties_rows
      FROM penalties pen
     WHERE pen.loan_id = l.id
       AND pen.settled_payment_id IS NULL
  ) pen_raw ON TRUE
  CROSS JOIN LATERAL (
    SELECT
      (COALESCE(pay_raw.main_paid, 0) + COALESCE(sub_raw.sub_paid, 0)) AS total_paid,
      pay_raw.payment_count,
      pay_raw.on_time_count,
      pay_raw.late_15_30,
      pay_raw.late_31_60,
      pay_raw.late_over_60
  ) pay
  CROSS JOIN LATERAL (
    WITH base AS (
      SELECT
        COALESCE(l.due_date, l.hp_date) AS anchor_date,
        GREATEST(0, COALESCE(l.due_month, 0))::int AS total_months,
        ROUND(COALESCE(l.due_amount, 0)::numeric, 2) AS inst_amt,
        CASE
          WHEN COALESCE(l.net_payable, 0) > 0 THEN ROUND(l.net_payable::numeric, 2)
          ELSE ROUND((GREATEST(0, COALESCE(l.due_month, 0)) * COALESCE(l.due_amount, 0))::numeric, 2)
        END AS contractual_due,
        ROUND(COALESCE(pay.total_paid, 0)::numeric, 2) AS emi_paid,
        GREATEST(
          COALESCE(pen_raw.pending_penalties_rows, 0)::numeric,
          GREATEST(0.00, ROUND((COALESCE(l.penalty_amount, 0) - COALESCE(pay_raw.penalty_paid, 0))::numeric, 2))
        ) AS out_penalty,
        (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today_ist
    ),
    sched AS (
      SELECT
        b.*,
        GREATEST(0.00, b.contractual_due - b.emi_paid) AS rem_sched_emi,
        CASE
          WHEN b.inst_amt > 0 THEN LEAST(b.total_months, FLOOR(b.emi_paid / b.inst_amt)::int)
          ELSE 0
        END AS covered_cnt,
        COALESCE((
          SELECT COUNT(*)::int
          FROM generate_series(1, b.total_months) AS gs(k)
          WHERE b.anchor_date IS NOT NULL
            AND b.total_months > 0
            AND public.fn_clamped_installment_date(b.anchor_date, gs.k) < b.today_ist
        ), 0) AS matured_cnt
      FROM base b
    ),
    calc AS (
      SELECT
        s.*,
        CASE
          WHEN s.rem_sched_emi <= 0 THEN 0.00::numeric
          ELSE LEAST(
            s.rem_sched_emi,
            GREATEST(0.00, LEAST(s.contractual_due, s.matured_cnt * s.inst_amt) - s.emi_paid)
          )
        END AS overdue_amt,
        CASE
          WHEN s.anchor_date IS NOT NULL AND s.covered_cnt < s.total_months
            THEN public.fn_clamped_installment_date(s.anchor_date, s.covered_cnt + 1)
          ELSE NULL::date
        END AS cand_unpaid_date
      FROM sched s
    )
    SELECT
      (SELECT ct_e164.phone_e164 FROM contacts ct_e164 WHERE ct_e164.customer_id = c.id ORDER BY CASE WHEN ct_e164.contact_type::text = 'customer' THEN 0 ELSE 1 END, ct_e164.id ASC LIMIT 1) AS phone_e164,
      calc.emi_paid AS total_paid,
      calc.out_penalty AS outstanding_penalty_amount,
      ROUND(calc.rem_sched_emi + calc.out_penalty, 2) AS total_balance_amount,
      calc.covered_cnt AS installments_covered,
      CASE
        WHEN calc.overdue_amt > 0 AND calc.inst_amt > 0 THEN CEIL(calc.overdue_amt / calc.inst_amt)::int
        ELSE 0
      END AS pending_emi_count,
      calc.overdue_amt AS overdue_amount,
      CASE
        WHEN calc.overdue_amt > 0 AND calc.cand_unpaid_date IS NOT NULL AND calc.cand_unpaid_date < calc.today_ist
          THEN calc.cand_unpaid_date
        ELSE NULL::date
      END AS earliest_unpaid_due_date,
      CASE
        WHEN calc.overdue_amt > 0 AND calc.cand_unpaid_date IS NOT NULL AND calc.cand_unpaid_date < calc.today_ist
          THEN (calc.today_ist - calc.cand_unpaid_date)::int
        ELSE 0
      END AS days_overdue
    FROM calc
  ) ds
  LEFT JOIN ai_telecalling_leads atl
    ON atl.finance_id = c.finance_id
   AND atl.customer_id = c.id
  LEFT JOIN vehicle_detail v ON v.id = COALESCE(l.vehicle_id, c.vehicle_id)
  LEFT JOIN vehicle_info vi ON vi.id = v.vehicle_info_id
  LEFT JOIN LATERAL (
    SELECT
      (
        SELECT ct_top.number
          FROM contacts ct_top
         WHERE ct_top.customer_id = c.id
           AND (ct_top.finance_id = $1::uuid OR ct_top.finance_id IS NULL)
         ORDER BY
           CASE WHEN ct_top.contact_type::text = 'customer' THEN 0 ELSE 1 END,
           CASE WHEN ct_top.type::text = 'mobile' THEN 0 ELSE 1 END,
           ct_top.id ASC
         LIMIT 1
      ) AS primary_phone,
      json_agg(
        json_build_object(
          'number', ct.number,
          'type', ct.type::text,
          'contactType', ct.contact_type::text
        )
        ORDER BY
          CASE WHEN ct.contact_type::text = 'customer' THEN 0 ELSE 1 END,
          CASE WHEN ct.type::text = 'mobile' THEN 0 ELSE 1 END,
          ct.id ASC
      ) AS phones
    FROM contacts ct
   WHERE ct.customer_id = c.id
     AND (ct.finance_id = $1::uuid OR ct.finance_id IS NULL)
  ) ph ON TRUE
  LEFT JOIN LATERAL (
    SELECT kd.file_path
      FROM kyc_documents kd
     WHERE kd.entity_type = 'customer'
       AND kd.entity_id = c.id::text
       AND kd.document_type = 'customer_photo'
       AND COALESCE(kd.is_current, true) = true
     ORDER BY kd.uploaded_at DESC NULLS LAST, kd.id DESC
     LIMIT 1
  ) kyc ON TRUE
  LEFT JOIN LATERAL (
    SELECT GREATEST(
      COUNT(*) FILTER (WHERE ptp_x.ptp_status::text = 'broken'),
      COALESCE(SUM(ptp_x.broken_count), 0)
    ) AS broken_ptp_count
    FROM promise_to_pay ptp_x
   WHERE ptp_x.customer_id = c.id
     AND ptp_x.finance_id = $1::uuid
  ) ptp ON TRUE
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
        FROM seizing_vehicle sv
       WHERE sv.customer_id = c.id
         AND sv.finance_id = $1::uuid
         AND COALESCE(sv.status::text, 'Pending') <> 'Cancelled'
    ) AS has_seizure
  ) sz ON TRUE
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
        FROM voice_contact_suppressions vcs
       WHERE vcs.finance_id = $1::uuid
         AND vcs.customer_id = c.id
         AND vcs.channel IN ('ai_voice_calls', 'all_automated')
         AND vcs.status = 'active'
    ) AS is_suppressed
  ) sup ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      cl.id,
      COALESCE(cl.call_lifecycle_status, cl.call_status::text) AS call_status,
      COALESCE(vcs_sum.outcome, cl.disposition) AS call_outcome,
      cl.disposition,
      cl.answered,
      cl.customer_spoke,
      COALESCE(cl.call_duration_seconds, cl.recording_duration_seconds, 0) AS duration_sec,
      COALESCE(vcs_sum.summary_short, cl.call_outcome_note) AS summary_text,
      cl.recording_s3_key,
      cl.recording_status,
      ptp_log.promised_date,
      ptp_log.promised_amount,
      cl.sentiment,
      cl.started_at
    FROM ai_telecalling_call_logs cl
    LEFT JOIN voice_call_summaries vcs_sum
      ON vcs_sum.call_log_id = cl.id
     AND vcs_sum.finance_id = cl.finance_id
    LEFT JOIN promise_to_pay ptp_log
      ON ptp_log.id = vcs_sum.ptp_id
     AND ptp_log.finance_id = cl.finance_id
   WHERE cl.finance_id = $1::uuid
     AND cl.customer_id = c.id
   ORDER BY cl.started_at DESC NULLS LAST, cl.created_at DESC NULLS LAST
   LIMIT 1
  ) last_log ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS total_logs,
      COUNT(*) FILTER (
        WHERE (cl_t.started_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
      )::int AS attempts_today,
      BOOL_OR(
        (cl_t.started_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        AND COALESCE(cl_t.answered, false) = true
        AND COALESCE(cl_t.customer_spoke, false) = true
      ) AS spoken_today,
      BOOL_OR(
        (cl_t.started_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        AND (COALESCE(cl_t.answered, false) = false OR COALESCE(cl_t.customer_spoke, false) = false)
      ) AS no_response_today
    FROM ai_telecalling_call_logs cl_t
   WHERE cl_t.finance_id = $1::uuid
     AND cl_t.customer_id = c.id
  ) today_stats ON TRUE
  WHERE c.finance_id = $1::uuid
    AND COALESCE(c.loan_status::text, 'active') NOT IN ('closed', 'settled', 'seized')
    AND COALESCE(ds.overdue_amount, atl.overdue_amount, 0) > 0
    AND COALESCE(ds.days_overdue, atl.days_overdue, 0) > 0
`;

/**
 * Classifies a row's call session state vs business outcome so that:
 * - Unanswered / ringing-only / failed attempts NEVER count as "Completed" or "Called Today".
 * - Never-called customers NEVER show a fake failure message.
 */
function classifyLeadCallState(row) {
  const totalAttempts = Math.max(
    Number(row.lead_attempt_count || 0),
    Number(row.total_call_logs_count || 0)
  );
  const hasCallLog = Boolean(row.last_call_id);
  const neverCalled = totalAttempts === 0 && !hasCallLog;
  const isSuppressed = Boolean(row.is_suppressed);
  const leadCallStatus = String(row.lead_call_status || 'uncalled').toLowerCase();
  const lastLogStatus = String(row.last_log_status || '').toLowerCase();

  const lastLogAgeMs = row.last_call_at ? Date.now() - new Date(row.last_call_at).getTime() : Infinity;
  const isActivelyCalling =
    leadCallStatus === 'calling' ||
    leadCallStatus === 'connecting' ||
    (['initiated', 'ringing', 'in_progress'].includes(lastLogStatus) && lastLogAgeMs < 15 * 60 * 1000);

  const isScheduled = leadCallStatus === 'scheduled';
  const calledAndSpokenToday = Boolean(row.called_and_spoken_today);
  const lastCallSpoke = Boolean(row.last_call_answered && row.last_call_customer_spoke);

  let callSessionStatus = 'uncalled';
  if (isSuppressed) {
    callSessionStatus = 'suppressed';
  } else if (isActivelyCalling) {
    callSessionStatus = 'calling';
  } else if (isScheduled) {
    callSessionStatus = 'scheduled';
  } else if (neverCalled) {
    callSessionStatus = 'uncalled';
  } else if (calledAndSpokenToday || lastCallSpoke) {
    callSessionStatus = 'completed';
  } else {
    callSessionStatus = 'failed';
  }

  let lastCallOutcome = 'never_called';
  if (!neverCalled) {
    if (row.last_call_outcome) {
      lastCallOutcome = String(row.last_call_outcome);
    } else if (lastCallSpoke) {
      lastCallOutcome = 'completed_general';
    } else if (lastLogStatus === 'failed') {
      lastCallOutcome = 'call_failed';
    } else {
      lastCallOutcome = 'no_response';
    }
  }

  const isNoResponse =
    !neverCalled &&
    !calledAndSpokenToday &&
    !lastCallSpoke &&
    (['no_response', 'unanswered', 'busy', 'call_failed', 'network_failed'].includes(lastCallOutcome) ||
      !row.last_call_customer_spoke);

  let callHistoryLabel = 'Never Called';
  if (isSuppressed) {
    callHistoryLabel = 'Opted Out (DNC)';
  } else if (isActivelyCalling) {
    callHistoryLabel = 'Calling...';
  } else if (isScheduled) {
    callHistoryLabel = 'Scheduled';
  } else if (neverCalled) {
    callHistoryLabel = 'Never Called';
  } else if (calledAndSpokenToday || lastCallSpoke) {
    callHistoryLabel = 'Completed';
  } else if (lastCallOutcome === 'call_failed' && lastLogStatus === 'failed') {
    callHistoryLabel = 'Call Failed';
  } else {
    callHistoryLabel = 'No Response';
  }

  // Backward-compatible `callStatus` for LeadCalling.tsx (`uncalled | calling | completed | failed | scheduled`)
  const legacyCallStatus =
    callSessionStatus === 'suppressed' ? 'failed' : callSessionStatus;

  const isFutureScheduled =
    isScheduled &&
    row.scheduled_time &&
    new Date(row.scheduled_time).getTime() > Date.now();

  const isReadyToCall =
    !isSuppressed &&
    !isActivelyCalling &&
    !calledAndSpokenToday &&
    !isFutureScheduled;

  return {
    totalAttempts,
    neverCalled,
    isSuppressed,
    isActivelyCalling,
    isScheduled,
    calledAndSpokenToday,
    lastCallSpoke,
    isNoResponse,
    isReadyToCall,
    callSessionStatus,
    lastCallOutcome,
    callHistoryLabel,
    legacyCallStatus,
  };
}

function computeLeadRisk(row, asOfDate) {
  const scored = scoreCustomer(
    {
      loanStatus: row.loan_status,
      dueAmount: row.emi_amount,
      netPayable: row.net_payable,
      hpAmount: row.hp_amount,
      dueMonth: row.due_month,
      totalPaid: row.risk_total_paid,
      hpDate: row.hp_date,
      dueDate: row.due_date,
      customerCreatedAt: row.customer_created_at,
      asOfDate,
    },
    {
      totalPayments: row.payment_count,
      onTimePayments: row.on_time_count,
      late15to30: row.late_15_30,
      late31to60: row.late_31_60,
      lateOver60: row.late_over_60,
      brokenPtpCount: row.broken_ptp_count,
      hasSeizure: row.has_seizure === true,
    }
  );

  return {
    riskLevel: scored.riskLevel, // 'critical' | 'high' | 'warning' | 'safe'
    riskScore: Number(scored.due?.dueRiskScore || 0),
    creditScore: Number(scored.credit?.creditScore || 0),
    creditBand: scored.credit?.creditBand || 'fair',
  };
}

function matchesOverdueBucket(daysOverdue, bucket) {
  const b = String(bucket || 'all').toLowerCase();
  if (!b || b === 'all') return true;
  const d = Number(daysOverdue || 0);
  if (b === '1-30') return d >= 1 && d <= 30;
  if (b === '31-60') return d >= 31 && d <= 60;
  if (b === '61-90') return d >= 61 && d <= 90;
  if (b === '90+' || b === '90_plus') return d > 90;
  return true;
}

/**
 * Strictly Read-Only `GET /api/ai/leads` implementation.
 *
 * - Never executes `fn_refresh_daily_overdue_leads` inline.
 * - Computes the 4 authoritative KPI summary cards across unique `customer_id`s for the tenant.
 * - Reuses `scoreCustomer` from `risk.scoring.js` so Risk Scores match `Alerts.tsx` 1:1.
 * - Separates `callSessionStatus` vs `lastCallOutcome` and never mislabels unanswered calls as Completed.
 * - Presigns KYC customer photos in parallel ONLY for the current paginated page (`<= 25` rows).
 */
async function getTelecallingLeads(financeId, query = {}, opts = {}) {
  const runner = opts.queryRunner || db;
  const asOfDate = opts.asOfDate || todayIso();

  const [{ rows }, { rows: settingRows }] = await Promise.all([
    runner.query(TELECALLING_LEADS_SQL, [financeId]),
    runner.query(
      `SELECT leads_last_refreshed_at
         FROM ai_settings
        WHERE finance_id = $1::uuid
        LIMIT 1`,
      [financeId]
    ),
  ]);

  const lastRefreshedAt = settingRows[0]?.leads_last_refreshed_at
    ? new Date(settingRows[0].leads_last_refreshed_at).toISOString()
    : null;

  // Deduplicate by customer_id (guaranteed 1 row per customer by LATERAL joins, guarded defensively)
  const seenCustomerIds = new Set();
  const allLeads = [];

  let unpaidLeadsCount = 0;
  let readyToCallCount = 0;
  let calledTodayCount = 0;
  let noResponseCount = 0;
  let scheduledCount = 0;
  let suppressedCount = 0;
  let totalOverdueAmount = 0;
  let totalBalanceAmount = 0;

  for (const r of rows) {
    if (seenCustomerIds.has(r.customer_id)) continue;
    seenCustomerIds.add(r.customer_id);

    const callState = classifyLeadCallState(r);
    const risk = computeLeadRisk(r, asOfDate);

    const dueAmount = Math.round(Number(r.overdue_amount || 0));
    const pendingPenalty = Math.round(Number(r.pending_penalty_amount || 0));
    const balanceAmount = Math.round(Number(r.total_balance_amount || 0));
    const emiAmount = Math.round(Number(r.emi_amount || 0));
    const daysOverdue = Number(r.days_overdue || 0);

    // Tenant-level KPI Summary Card aggregation (unique customer_id counts)
    unpaidLeadsCount += 1;
    totalOverdueAmount += dueAmount;
    totalBalanceAmount += balanceAmount;
    if (callState.isReadyToCall) readyToCallCount += 1;
    if (callState.calledAndSpokenToday) calledTodayCount += 1;
    if (callState.isNoResponse) noResponseCount += 1;
    if (callState.isScheduled) scheduledCount += 1;
    if (callState.isSuppressed) suppressedCount += 1;

    const rawHpl = r.hplno != null ? String(r.hplno) : String(r.loan_uuid || 'N/A');
    const loanId = rawHpl.startsWith('HPL') ? rawHpl : `HPL-${rawHpl}`;
    const rawPhone = String(r.phone || '').trim();
    const displayPhone = rawPhone.replace(/^\+91/, '');

    const durationLabel =
      formatDurationSeconds(r.last_call_duration_sec) ||
      r.lead_last_call_duration ||
      undefined;

    const outcomeNote =
      r.last_call_summary ||
      r.lead_call_outcome_note ||
      (callState.neverCalled
        ? undefined
        : callState.isNoResponse
          ? 'No response from customer on last attempt'
          : undefined);

    allLeads.push({
      id: r.lead_id,
      leadId: r.raw_lead_id || r.lead_id,
      customerId: r.customer_id,
      loanUuid: r.loan_uuid,
      customerName: r.customer_name || 'Customer',
      avatarColor: pickAvatarColor(r.customer_id),
      photoS3Key: r.photo_s3_key || null,
      photoUrl: null, // Populated via parallel presign for current page only
      loanId,
      hplno: r.hplno,
      loanType: r.loan_type || 'Vehicle Loan',
      phone: displayPhone,
      phoneE164: rawPhone.startsWith('+') ? rawPhone : displayPhone ? `+91${displayPhone}` : '',
      phones: Array.isArray(r.phones) ? r.phones : [],
      vehicleModel: r.vehicle_display || 'Two Wheeler',
      vehicleBrand: r.vehicle_brand || '',
      vehicleModelName: r.vehicle_model_name || '',
      vehiclePlate: r.vehicle_number || '—',
      dueAmount, // Overdue EMI amount
      overdueAmount: dueAmount,
      pendingPenaltyAmount: pendingPenalty,
      totalOverdueWithPenalty: Math.round(Number(r.total_overdue_with_penalty || dueAmount)),
      totalBalanceAmount: balanceAmount,
      emiAmount,
      unpaidMonths: Number(r.unpaid_months || 0),
      paidMonths: Number(r.paid_months || 0),
      dueDate: r.due_date_label,
      earliestUnpaidDueDate: r.earliest_unpaid_due_iso || null,
      daysOverdue,
      overdueDays: daysOverdue,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      creditScore: risk.creditScore,
      creditBand: risk.creditBand,
      lastCall: callState.neverCalled ? 'Never' : formatRelativeTime(r.last_call_at),
      lastCallAt: r.last_call_at ? new Date(r.last_call_at).toISOString() : null,
      callStatus: callState.legacyCallStatus,
      callSessionStatus: callState.callSessionStatus,
      lastCallOutcome: callState.lastCallOutcome,
      callHistoryLabel: callState.callHistoryLabel,
      attemptCount: callState.totalAttempts,
      attemptsToday: Number(r.attempts_today || 0),
      calledToday: callState.calledAndSpokenToday,
      noResponse: callState.isNoResponse,
      readyToCall: callState.isReadyToCall,
      isSuppressed: callState.isSuppressed,
      lastCallDuration: durationLabel,
      lastCallDurationSec: Number(r.last_call_duration_sec || 0),
      notes: r.lead_notes || undefined,
      callOutcomeNote: outcomeNote,
      scheduledTime: r.scheduled_time_label || undefined,
      scheduledAtIso: r.scheduled_time ? new Date(r.scheduled_time).toISOString() : null,
      lastCallDetails: r.last_call_id
        ? {
          callId: r.last_call_id,
          status: r.last_log_status,
          outcome: callState.lastCallOutcome,
          disposition: r.last_call_disposition || null,
          answered: Boolean(r.last_call_answered),
          customerSpoke: Boolean(r.last_call_customer_spoke),
          durationSec: Number(r.last_call_duration_sec || 0),
          summaryText: r.last_call_summary || null,
          promisedDate: r.last_promised_date || null,
          promisedAmount: r.last_promised_amount != null ? Number(r.last_promised_amount) : null,
          sentiment: r.last_call_sentiment || 'neutral',
          hasRecording: Boolean(
            r.last_recording_s3_key && ['ready', 'uploaded'].includes(r.last_recording_status)
          ),
          recordingStatus: r.last_recording_status || 'not_recorded',
        }
        : null,
    });
  }

  // Server-side search & filters
  const searchRaw = String(query.search || query.q || '').trim().toLowerCase();
  const statusFilter = String(query.status || 'all').trim().toLowerCase();
  const riskFilter = String(query.riskLevel || query.risk || 'all').trim().toLowerCase();
  const bucketFilter = String(query.overdueBucket || query.bucket || 'all').trim().toLowerCase();
  const minDue = query.minDue != null && query.minDue !== '' ? Number(query.minDue) : null;
  const maxDue = query.maxDue != null && query.maxDue !== '' ? Number(query.maxDue) : null;

  const filteredLeads = allLeads.filter((lead) => {
    // By default, hide DNC-suppressed leads unless explicitly filtering for 'suppressed'
    if (statusFilter !== 'suppressed' && lead.isSuppressed) {
      return false;
    }

    if (searchRaw) {
      const haystack = [
        lead.customerName,
        lead.phone,
        lead.phoneE164,
        lead.loanId,
        String(lead.hplno || ''),
        lead.vehiclePlate,
        lead.vehicleModel,
        lead.vehicleBrand,
        lead.vehicleModelName,
        lead.loanType,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchRaw)) return false;
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'ready' || statusFilter === 'ready_to_call') {
        if (!lead.readyToCall) return false;
      } else if (statusFilter === 'called_today') {
        if (!lead.calledToday) return false;
      } else if (statusFilter === 'no_response') {
        if (!lead.noResponse) return false;
      } else if (statusFilter === 'never_called' || statusFilter === 'uncalled') {
        if (lead.callSessionStatus !== 'uncalled') return false;
      } else if (statusFilter === 'completed') {
        if (lead.callSessionStatus !== 'completed') return false;
      } else if (statusFilter === 'scheduled') {
        if (lead.callSessionStatus !== 'scheduled') return false;
      } else if (statusFilter === 'calling') {
        if (lead.callSessionStatus !== 'calling') return false;
      } else if (statusFilter === 'failed') {
        if (lead.callSessionStatus !== 'failed') return false;
      } else if (statusFilter === 'suppressed') {
        if (!lead.isSuppressed) return false;
      }
    }

    if (riskFilter && riskFilter !== 'all') {
      if (lead.riskLevel !== riskFilter) return false;
    }

    if (!matchesOverdueBucket(lead.daysOverdue, bucketFilter)) {
      return false;
    }

    if (minDue != null && Number.isFinite(minDue) && lead.dueAmount < minDue) {
      return false;
    }
    if (maxDue != null && Number.isFinite(maxDue) && lead.dueAmount > maxDue) {
      return false;
    }

    return true;
  });

  // Server-side sorting
  const sortBy = String(query.sortBy || 'daysOverdue').trim();
  const sortDir = String(query.sortDir || 'desc').trim().toLowerCase() === 'asc' ? 1 : -1;

  filteredLeads.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'dueAmount' || sortBy === 'overdueAmount') {
          cmp = a.dueAmount - b.dueAmount;
        } else if (sortBy === 'totalBalance' || sortBy === 'totalBalanceAmount') {
          cmp = a.totalBalanceAmount - b.totalBalanceAmount;
        } else if (sortBy === 'riskScore') {
          cmp = a.riskScore - b.riskScore;
        } else if (sortBy === 'creditScore') {
          cmp = a.creditScore - b.creditScore;
        } else if (sortBy === 'lastCallAt') {
          const ta = a.lastCallAt ? new Date(a.lastCallAt).getTime() : 0;
          const tb = b.lastCallAt ? new Date(b.lastCallAt).getTime() : 0;
          cmp = ta - tb;
        } else if (sortBy === 'customerName' || sortBy === 'cname') {
          cmp = String(a.customerName).localeCompare(String(b.customerName));
        } else if (sortBy === 'loanId' || sortBy === 'hplno') {
          cmp = Number(a.hplno || 0) - Number(b.hplno || 0);
        } else {
          // Default: daysOverdue DESC, then dueAmount DESC
          cmp = a.daysOverdue - b.daysOverdue;
          if (cmp === 0) cmp = a.dueAmount - b.dueAmount;
        }
        return cmp * sortDir;
      });

      // Server-side pagination
      const page = Math.max(1, Number(query.page || 1));
      const limit = Math.min(
        MAX_LEADS_PAGE_SIZE,
        Math.max(1, Number(query.limit || query.pageSize || DEFAULT_LEADS_PAGE_SIZE))
      );
      const startIdx = (page - 1) * limit;
      const pageItems = filteredLeads.slice(startIdx, startIdx + limit);

      // Parallel S3 KYC photo presigning ONLY for the current page (<= 25 rows)
      const presignPhotoImpl = opts.presignPhotoFn || presignCustomerPhoto;
      const paginatedLeads = await Promise.all(
        pageItems.map(async (item) => {
          const photoUrl = item.photoS3Key
            ? await presignPhotoImpl(item.photoS3Key, 900)
            : null;
          const { photoS3Key, ...publicLead } = item;
          return {
            ...publicLead,
            photoUrl: photoUrl || null,
          };
        })
      );

      const totalItems = filteredLeads.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / limit));

      return {
        leads: paginatedLeads,
        summary: {
          unpaidLeads: unpaidLeadsCount,
          readyToCall: readyToCallCount,
          calledToday: calledTodayCount,
          noResponse: noResponseCount,
          scheduledCount,
          suppressedCount,
          totalOverdueAmount,
          totalBalanceAmount,
        },
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        meta: {
          lastRefreshedAt,
          asOfDate,
        },
      };
    }

    /**
     * Tenant-scoped S3 Presigned Call Recording Playback URL (`GET /api/ai/calls/:callId/recording-url`).
     * Enforces `finance_id = $1`, verifies recording status, and signs a 300-second `GetObject` URL.
     */
    async function getCallRecordingPlaybackUrl(financeId, callId, opts = {}) {
      const runner = opts.queryRunner || db;
      if (!callId) {
        throw createHttpError(400, 'callId is required');
      }

      const { rows } = await runner.query(
        `SELECT id::text AS call_id,
            customer_id::text AS customer_id,
            recording_s3_key,
            recording_status,
            COALESCE(recording_duration_seconds, call_duration_seconds, 0) AS recording_duration_sec
       FROM ai_telecalling_call_logs
      WHERE finance_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1`,
        [financeId, callId]
      );

      if (rows.length === 0) {
        throw createHttpError(404, 'Call log not found for this finance company');
      }

      const callRow = rows[0];
      if (!callRow.recording_s3_key || !['ready', 'uploaded'].includes(callRow.recording_status)) {
        throw createHttpError(404, 'Call recording is not available for this call');
      }

      const signed = await presignCallRecordingPlayback(callRow.recording_s3_key, {
        financeId,
        expiresInSeconds: 300,
        presignFn: opts.presignRecordingFn || null,
      });

      return {
        callId: callRow.call_id,
        customerId: callRow.customer_id,
        playbackUrl: signed.playbackUrl,
        expiresInSeconds: signed.expiresInSeconds,
        durationSec: Number(callRow.recording_duration_sec || 0),
      };
    }

    function formatCallReplayFromRow(existing, telephonyMode = 'live_allowlist') {
      const mapped = fromDbCallRowToDomainState(existing);
      return {
        callId: existing.call_id,
        leadId: existing.lead_id,
        customerId: existing.customer_id,
        loanId: existing.loan_id || null,
        providerCallId: existing.provider_call_id,
        callLifecycleStatus: mapped.transportLifecycleStatus,
        callDisplayState: mapped.domainState,
        needsReconcile: mapped.needsReconcile,
        telephonyMode,
        idempotencyReplay: true,
      };
    }

    /**
     * Zero-Trust Manual Single-Call Trigger (`POST /api/ai/calls/manual`).
     *
     * Security & reliability invariants (Phase 2 — Amendments A1, A3, A4, A5, A6):
     * 1. Client request body MUST contain ONLY `{ customerId: "<uuid>" }`; untrusted fields (`mock_telephony`, `phone`, etc.) -> `400`.
     * 2. Persistent `(finance_id, idempotency_key)` deduplication via `uq_atcl_finance_idem`:
     *    same customer -> replay with `idempotencyReplay: true`; different customer -> `422 idempotency_key_payload_mismatch`.
     * 3. Server-only `VOICE_TELEPHONY_MODE` (`mock` default; invalid/unconfirmed fails closed), `VOICE_AI_KILL_SWITCH`,
     *    `owner_features` (`ai_voice_agent` enabled & non-expired), and `TEST_ALLOWED_NUMBERS` in `live_allowlist` mode.
     * 4. Attempt counters (`attempt_count`, `daily_attempt_count`, `last_call_at`) increment ONLY after Python's `202` ack;
     *    pre-dial connect errors never burn attempts/cooldown, whereas ambiguous read timeouts mark `needs_reconcile` (`unknown`)
     *    without releasing cooldown or allowing auto-retry.
     */
    async function initiateManualCustomerCall(financeId, payload, opts = {}) {
      const runner = opts.queryRunner || db;
      const env = opts.env || process.env;

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw createHttpError(400, 'Request body must be a JSON object with { customerId }', 'invalid_body');
      }

      const keys = Object.keys(payload);
      const disallowedKeys = keys.filter((k) => k !== 'customerId');
      if (disallowedKeys.length > 0) {
        throw createHttpError(
          400,
          `Untrusted client fields rejected: ${disallowedKeys.join(', ')}. Send only { customerId }.`,
          'untrusted_client_fields'
        );
      }

      const customerId = String(payload.customerId || '').trim();
      if (!UUID_STRICT_REGEX.test(customerId)) {
        throw createHttpError(400, 'customerId must be a valid UUID', 'invalid_customer_id');
      }

      const idemKey = validateIdempotencyKey(opts.idempotencyKey, {
        required: Boolean(opts.requireIdempotencyKey),
      });

      // 1. Persistent Idempotency Lookup (`uq_atcl_finance_idem`)
      if (idemKey) {
        const { rows: existingRows } = await runner.query(
          `SELECT id::text AS call_id,
                  lead_id::text AS lead_id,
                  finance_id::text AS finance_id,
                  customer_id::text AS customer_id,
                  loan_id::text AS loan_id,
                  provider_call_id,
                  call_status::text AS call_status,
                  call_lifecycle_status,
                  answered,
                  customer_spoke,
                  disposition,
                  error_detail
             FROM ai_telecalling_call_logs
            WHERE finance_id = $1::uuid
              AND idempotency_key = $2
            LIMIT 1`,
          [financeId, idemKey]
        );

        if (existingRows.length > 0) {
          const existing = existingRows[0];
          if (String(existing.customer_id) !== customerId) {
            throw createHttpError(
              422,
              'Idempotency-Key has already been used for a different customerId',
              'idempotency_key_payload_mismatch'
            );
          }
          return formatCallReplayFromRow(existing);
        }
      }

      // 2. Fail-Closed Server Telephony Safety Gates (Amendment A5: kill switch, mode validity, live confirmation)
      const telephonyMode = assertServerTelephonySafetyGates(env);

      // 3. Composite Voice AI Health Gate (Dograh + Python Voice Agent RO-DB & Redis)
      const checkHealthImpl = opts.checkHealthFn || checkVoiceSystemHealth;
      const health = await checkHealthImpl(opts.healthOpts || {});
      if (!health || !health.online) {
        throw createHttpError(
          503,
          'Voice System Offline — cannot initiate AI call while gateway or Voice Agent is unavailable',
          'voice_system_offline',
          { health }
        );
      }

      // 4. Tenant `owner_features` Entitlement Gate (`ai_voice_agent` enabled & non-expired, Amendment A5)
      const { rows: entRows } = await runner.query(
        `SELECT fd.owner_id::text AS owner_id,
                EXISTS (
                  SELECT 1
                    FROM owner_features ofe
                   WHERE ofe.owner_id = fd.owner_id
                     AND ofe.feature_code = 'ai_voice_agent'
                     AND ofe.is_enabled = TRUE
                     AND (ofe.starts_at IS NULL OR ofe.starts_at <= CURRENT_TIMESTAMP)
                     AND (ofe.expires_at IS NULL OR ofe.expires_at > CURRENT_TIMESTAMP)
                ) AS entitled
           FROM finance_detail fd
          WHERE fd.id = $1::uuid
          LIMIT 1`,
        [financeId]
      );
      if (entRows.length === 0 || entRows[0].entitled !== true) {
        throw createHttpError(
          403,
          'Voice AI Agent entitlement (ai_voice_agent) is not enabled or has expired for this finance owner',
          'ai_voice_agent_entitlement_missing'
        );
      }

      // 5. Active Call Guard (`queued`, `initiated`, `ringing`, `in_progress` block concurrent dispatch, Amendment A3)
      const { rows: activeCallRows } = await runner.query(
        `SELECT id::text AS call_id, call_lifecycle_status
           FROM ai_telecalling_call_logs
          WHERE finance_id = $1::uuid
            AND customer_id = $2::uuid
            AND call_lifecycle_status IN ('initiated', 'queued', 'ringing', 'in_progress')
            AND started_at >= NOW() - INTERVAL '30 minutes'
          LIMIT 1`,
        [financeId, customerId]
      );
      if (activeCallRows.length > 0) {
        throw createHttpError(
          409,
          'A Voice AI call is already active for this customer',
          'call_already_in_progress',
          { activeCallId: activeCallRows[0].call_id }
        );
      }

      // 6. Server-Side Eligibility Gate (`fn_check_voice_call_eligibility`)
      const { rows: eligRows } = await runner.query(
        `SELECT public.fn_check_voice_call_eligibility($1::uuid, $2::uuid, NULL, NOW()) AS eligibility`,
        [financeId, customerId]
      );
      const elig = eligRows[0]?.eligibility || null;
      if (!elig || elig.eligible !== true) {
        const reasonCode = elig?.reason_code || 'call_not_eligible';
        const message = elig?.message || 'Customer is not eligible for a Voice AI call right now';
        let statusCode = 409;
        if (reasonCode === 'customer_not_found' || reasonCode === 'loan_not_found') {
          statusCode = 404;
        } else if (
          ['loan_closed', 'vehicle_seized', 'no_overdue_balance', 'invalid_or_missing_phone', 'tenant_inactive'].includes(
            reasonCode
          )
        ) {
          statusCode = 422;
        }
        throw createHttpError(statusCode, message, reasonCode, elig);
      }

      const ledgerRollup = await getCustomerFinancialRollup(financeId, customerId, {
        queryRunner: runner,
      });
      if (ledgerRollup && ledgerRollup.loanCount > 0 && ledgerRollup.currentOverdueEmiAmount <= 0) {
        throw createHttpError(
          422,
          'Customer has no matured overdue EMI balance as of today (IST)',
          'no_overdue_balance',
          {
            overdue_amount: 0,
            days_overdue: 0,
            next_emi_due_date: ledgerRollup.nextEmiDueDate,
          }
        );
      }

      const resolvedLoanId =
        (ledgerRollup && ledgerRollup.primaryLoanId) || elig.loan_id || null;
      const resolvedPhoneE164 = elig.phone_e164;
      const resolvedOverdue =
        ledgerRollup && ledgerRollup.loanCount > 0
          ? Number(ledgerRollup.currentOverdueEmiAmount || 0)
          : Number(elig.overdue_amount || 0);
      const resolvedDaysOverdue =
        ledgerRollup && ledgerRollup.loanCount > 0
          ? Number(ledgerRollup.overdueDays || 0)
          : Number(elig.days_overdue || 0);

      // 7. Node-Side Allowlist Enforcement in `live_allowlist` Mode (Amendment A5 — before inserting rows or calling Python!)
      assertDestinationAllowlistedIfRequired(telephonyMode, resolvedPhoneE164, env);

      // 8. Ensure `ai_telecalling_leads` row exists & mark `connecting` WITHOUT prematurely incrementing attempt counters (Amendment A3)
      const { rows: leadRows } = await runner.query(
        `INSERT INTO ai_telecalling_leads (
           finance_id, customer_id, loan_id, phone_e164,
           overdue_amount, days_overdue,
           call_status, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4,
           $5, $6,
           'connecting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT (finance_id, customer_id) DO UPDATE
           SET loan_id = COALESCE(EXCLUDED.loan_id, ai_telecalling_leads.loan_id),
               phone_e164 = COALESCE(EXCLUDED.phone_e164, ai_telecalling_leads.phone_e164),
               overdue_amount = EXCLUDED.overdue_amount,
               days_overdue = EXCLUDED.days_overdue,
               call_status = 'connecting',
               updated_at = CURRENT_TIMESTAMP
         RETURNING id::text AS lead_id`,
        [financeId, customerId, resolvedLoanId, resolvedPhoneE164, resolvedOverdue, resolvedDaysOverdue]
      );

      const leadId = leadRows[0].lead_id;
      const callId = opts.callId || crypto.randomUUID();
      const providerCallId = `af-call-${callId}`;
      const rawUserId = opts.userId && UUID_STRICT_REGEX.test(String(opts.userId)) ? String(opts.userId) : null;

      // 9. Insert `'queued'` call log row with `idempotency_key` (`uq_atcl_finance_idem`)
      try {
        await runner.query(
          `INSERT INTO ai_telecalling_call_logs (
             id, lead_id, finance_id, customer_id, loan_id,
             provider_call_id, phone_e164,
             call_status, call_lifecycle_status, answered, customer_spoke,
             call_duration_seconds, due_amount_at_call,
             caller_type, called_by_user_id,
             tts_model, stt_model, llm_model,
             idempotency_key,
             started_at, created_at
           ) VALUES (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
             $6, $7,
             'connecting', 'queued', FALSE, FALSE,
             0, $8,
             'ai_manual', (SELECT u.id FROM users u WHERE u.id = $9::uuid LIMIT 1),
             $10, $11, $12,
             $13,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           )`,
          [
            callId,
            leadId,
            financeId,
            customerId,
            resolvedLoanId,
            providerCallId,
            resolvedPhoneE164,
            resolvedOverdue,
            rawUserId,
            elig.tts_model || null,
            elig.stt_model || null,
            elig.llm_model || null,
            idemKey,
          ]
        );
      } catch (insertErr) {
        if (idemKey && insertErr && insertErr.code === '23505') {
          const { rows: racedRows } = await runner.query(
            `SELECT id::text AS call_id,
                    lead_id::text AS lead_id,
                    finance_id::text AS finance_id,
                    customer_id::text AS customer_id,
                    loan_id::text AS loan_id,
                    provider_call_id,
                    call_status::text AS call_status,
                    call_lifecycle_status,
                    answered,
                    customer_spoke,
                    disposition,
                    error_detail
               FROM ai_telecalling_call_logs
              WHERE finance_id = $1::uuid
                AND idempotency_key = $2
              LIMIT 1`,
            [financeId, idemKey]
          );
          if (racedRows.length > 0) {
            if (String(racedRows[0].customer_id) !== customerId) {
              throw createHttpError(
                422,
                'Idempotency-Key has already been used for a different customerId',
                'idempotency_key_payload_mismatch'
              );
            }
            return formatCallReplayFromRow(racedRows[0], telephonyMode);
          }
        }
        throw insertErr;
      }

      // 10. Dispatch HMAC-signed manual call request to Python Voice Agent
      const dispatchImpl = opts.dispatchFn || dispatchManualCallToVoiceAgent;
      const outboundPayload = {
        finance_id: financeId,
        customer_id: customerId,
        loan_id: resolvedLoanId,
        lead_id: leadId,
        call_id: callId,
        provider_call_id: providerCallId,
        ...(idemKey ? { idempotency_key: idemKey } : {}),
      };

      try {
        const agentAck = await dispatchImpl(outboundPayload, {
          ...(opts.dispatchOpts || {}),
          telephonyMode,
        });

        const ackDbLifecycle = toDbLifecycleStatus(agentAck?.call_lifecycle_status || 'initiated');
        const finalProviderCallId = agentAck?.provider_call_id || providerCallId;

        // Amendment A3: Increment attempt_count / daily_attempt_count / last_call_at ONLY on Python 202 ack (idempotent per callId)
        await runner.query(
          `UPDATE ai_telecalling_leads
              SET attempt_count = COALESCE(attempt_count, 0) + 1,
                  daily_attempt_count = CASE
                    WHEN daily_attempt_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                      THEN COALESCE(daily_attempt_count, 0) + 1
                    ELSE 1
                  END,
                  daily_attempt_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
                  last_call_at = CURRENT_TIMESTAMP,
                  locked_by = 'acked:' || $3,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $1::uuid
              AND finance_id = $2::uuid
              AND COALESCE(locked_by, '') IS DISTINCT FROM ('acked:' || $3)`,
          [leadId, financeId, callId]
        );

        await runner.query(
          `UPDATE ai_telecalling_call_logs
              SET call_lifecycle_status = CASE
                    WHEN call_lifecycle_status IN ('queued', 'initiated') THEN $3
                    ELSE call_lifecycle_status
                  END,
                  provider_call_id = COALESCE($4, provider_call_id)
            WHERE id = $1::uuid
              AND finance_id = $2::uuid`,
          [callId, financeId, ackDbLifecycle, agentAck?.provider_call_id || null]
        );

        const mappedAck = fromDbCallRowToDomainState({
          call_lifecycle_status: ackDbLifecycle,
          call_status: 'connecting',
        });

        return {
          callId,
          leadId,
          customerId,
          loanId: resolvedLoanId,
          providerCallId: finalProviderCallId,
          callLifecycleStatus: mappedAck.transportLifecycleStatus,
          callDisplayState: mappedAck.domainState,
          telephonyMode,
          idempotencyReplay: false,
        };
      } catch (dispatchErr) {
        const failureClass = classifyDispatchTransportError(dispatchErr);

        if (failureClass === 'ambiguous_timeout') {
          // Amendment A1: Read timeout / unknown upstream state -> mark `needs_reconcile` (`unknown`),
          // DO NOT release cooldown, and DO NOT allow auto-retry.
          const reconcileDetail = `dispatch_timeout_needs_reconcile: ${String(
            dispatchErr.message || 'Read timeout'
          ).slice(0, 450)}`;

          await runner.query(
            `UPDATE ai_telecalling_call_logs
                SET call_status = 'connecting',
                    call_lifecycle_status = 'initiated',
                    disposition = 'needs_reconcile',
                    error_detail = $3
              WHERE id = $1::uuid AND finance_id = $2::uuid`,
            [callId, financeId, reconcileDetail]
          );
          await runner.query(
            `UPDATE ai_telecalling_leads
                SET call_status = 'connecting',
                    locked_by = 'reconcile:' || $3,
                    lock_expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes',
                    last_call_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = $1::uuid AND finance_id = $2::uuid`,
            [leadId, financeId, callId]
          );

          throw createHttpError(
            504,
            'Voice AI dispatch timed out after request transmission; call state is unknown and queued for reconciliation (do not auto-retry)',
            'dispatch_timeout_ambiguous',
            {
              callId,
              leadId,
              callLifecycleStatus: 'unknown',
              needsReconcile: true,
            }
          );
        }

        // Amendment A1 + A3: Safe pre-dial connect/rejection failure -> mark `call_status = 'failed'` +
        // `call_lifecycle_status = 'cancelled'` + `disposition = 'pre_dial_failed'` so `fn_check_voice_call_eligibility`
        // NEVER burns daily attempts or cooldown (zero DDL), while `fromDbCallRowToDomainState` exposes `'failed'`.
        const preDialDetail = `pre_dial_failed: ${String(dispatchErr.message || 'Dispatch failed').slice(
          0,
          450
        )}`;
        await runner.query(
          `UPDATE ai_telecalling_call_logs
              SET call_status = 'failed',
                  call_lifecycle_status = 'cancelled',
                  disposition = 'pre_dial_failed',
                  error_detail = $3,
                  ended_at = CURRENT_TIMESTAMP
            WHERE id = $1::uuid AND finance_id = $2::uuid`,
          [callId, financeId, preDialDetail]
        );
        await runner.query(
          `UPDATE ai_telecalling_leads
              SET call_status = 'failed',
                  locked_by = NULL,
                  lock_expires_at = NULL,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $1::uuid AND finance_id = $2::uuid`,
          [leadId, financeId]
        );

        const isConnRefused =
          String(dispatchErr.cause?.code || dispatchErr.code || '').trim() === 'ECONNREFUSED';
        const statusCode = dispatchErr.statusCode || (isConnRefused ? 503 : 502);
        const errCode =
          dispatchErr.code && dispatchErr.code !== 'ECONNREFUSED'
            ? dispatchErr.code
            : isConnRefused
              ? 'voice_agent_unavailable'
              : 'voice_dispatch_failed';

        throw createHttpError(
          statusCode,
          dispatchErr.message || 'Failed to dispatch manual call to Voice AI Agent',
          errCode
        );
      }
    }

    function maskPhoneForDisplay(rawPhone) {
      const cleaned = String(rawPhone || '').replace(/[\s-]/g, '');
      if (!cleaned) return '—';
      if (cleaned.startsWith('+91') && cleaned.length >= 13) {
        return `+91 ******${cleaned.slice(-4)}`;
      }
      const digits = cleaned.replace(/\D/g, '');
      if (digits.length >= 4) {
        return `******${digits.slice(-4)}`;
      }
      return '—';
    }

    function deriveBusinessCallOutcome({
      lifecycle,
      isTerminal,
      answered,
      customerSpoke,
      rawOutcome,
      disposition,
    }) {
      if (!isTerminal) return 'in_progress';
      if (lifecycle === 'cancelled') return 'cancelled';
      const explicit = String(rawOutcome || disposition || '').trim().toLowerCase();
      if (lifecycle === 'failed') {
        return explicit && explicit !== 'completed' ? explicit : 'call_failed';
      }
      if (!answered) {
        return explicit && !['completed', 'completed_general'].includes(explicit)
          ? explicit
          : 'unanswered';
      }
      if (!customerSpoke) {
        return explicit && !['completed', 'completed_general'].includes(explicit)
          ? explicit
          : 'no_response';
      }
      return explicit || 'completed_general';
    }

    /**
     * Tenant-scoped Live Call Session & Full Call Details (`GET /api/ai/calls/:callId`).
     * Polled by `LeadCalling.tsx` during/after a call and rendered by `CallDetailsPage.tsx`.
     */
    async function getCallStatusById(financeId, callId, opts = {}) {
      const runner = opts.queryRunner || db;
      const cleanCallId = String(callId || '').trim();
      if (!UUID_STRICT_REGEX.test(cleanCallId)) {
        throw createHttpError(400, 'callId must be a valid UUID', 'invalid_call_id');
      }

      const { rows } = await runner.query(
        `SELECT
        cl.id::text AS call_id,
        cl.lead_id::text AS lead_id,
        cl.customer_id::text AS customer_id,
        cl.loan_id::text AS loan_id,
        c.cname AS customer_name,
        c.hplno,
        c.loan_status::text AS loan_status,
        cl.phone_e164,
        COALESCE(cl.identity_verified, false) AS identity_verified,
        cl.due_amount_at_call::float8 AS due_amount_at_call,
        COALESCE(cl.recording_size_bytes, 0)::bigint AS recording_size_bytes,
        cl.provider_call_id,
        COALESCE(v.vehicle_number, '—') AS vehicle_number,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', NULLIF(vi.brand, ''), COALESCE(vi.model_name, v.vehicle_modal))), ''),
          v.vehicle_modal,
          'Two Wheeler'
        ) AS vehicle_display,
        cl.call_status::text AS call_status,
        COALESCE(cl.call_lifecycle_status, cl.call_status::text) AS call_lifecycle_status,
        COALESCE(cl.answered, false) AS answered,
        COALESCE(cl.customer_spoke, false) AS customer_spoke,
        COALESCE(cl.call_duration_seconds, 0)::int AS duration_sec,
        cl.started_at,
        cl.ended_at,
        COALESCE(cl.transcript, '[]'::jsonb) AS transcript,
        COALESCE(vcs.summary_short, cl.call_outcome_note) AS summary_text,
        vcs.summary_short,
        vcs.customer_stated_reason,
        vcs.commitment_summary,
        vcs.observable_tone,
        vcs.aggression_level,
        COALESCE(vcs.requested_human, false) AS requested_human,
        COALESCE(vcs.outcome, cl.disposition) AS outcome,
        cl.disposition,
        COALESCE(cl.sentiment::text, 'neutral') AS sentiment,
        cl.language_used,
        cl.recording_s3_key,
        cl.recording_status,
        COALESCE(cl.recording_duration_seconds, cl.call_duration_seconds, 0)::int AS recording_duration_sec,
        cl.error_detail,
        COALESCE(cl.memory_tokens, 0)::int AS memory_tokens,
        COALESCE(cl.prompt_tokens, 0)::int AS prompt_tokens,
        COALESCE(cl.completion_tokens, 0)::int AS completion_tokens,
        COALESCE(cl.total_tokens, 0)::int AS total_tokens,
        COALESCE(cl.tts_characters, 0)::int AS tts_characters,
        COALESCE(cl.stt_seconds, 0)::float8 AS stt_seconds,
        cl.llm_model,
        cl.tts_model,
        cl.stt_model,
        TO_CHAR(ptp.promised_date, 'YYYY-MM-DD') AS promised_date,
        ptp.promised_amount::float8 AS promised_amount
       FROM ai_telecalling_call_logs cl
       JOIN customers c ON c.id = cl.customer_id AND c.finance_id = cl.finance_id
       LEFT JOIN loans l_ref ON l_ref.id = cl.loan_id
       LEFT JOIN vehicle_detail v ON v.id = COALESCE(l_ref.vehicle_id, c.vehicle_id)
       LEFT JOIN vehicle_info vi ON vi.id = v.vehicle_info_id
       LEFT JOIN LATERAL (
         SELECT
           s.ptp_id,
           s.summary_short,
           s.customer_stated_reason,
           s.commitment_summary,
           s.observable_tone,
           s.aggression_level,
           s.requested_human,
           s.outcome
         FROM voice_call_summaries s
         WHERE s.call_log_id = cl.id
           AND s.finance_id = cl.finance_id
           AND COALESCE(s.is_superseded, false) = false
         ORDER BY s.created_at DESC
         LIMIT 1
       ) vcs ON TRUE
       LEFT JOIN LATERAL (
         SELECT ptp_sub.promised_date, ptp_sub.promised_amount
         FROM promise_to_pay ptp_sub
         WHERE ptp_sub.finance_id = cl.finance_id
           AND (ptp_sub.id = vcs.ptp_id OR ptp_sub.call_log_id = cl.id)
           AND COALESCE(ptp_sub.is_superseded, false) = false
         ORDER BY
           CASE WHEN ptp_sub.id = vcs.ptp_id THEN 0 ELSE 1 END ASC,
           ptp_sub.created_at DESC
         LIMIT 1
       ) ptp ON TRUE
      WHERE cl.finance_id = $1::uuid
        AND cl.id = $2::uuid
      LIMIT 1`,
        [financeId, cleanCallId]
      );

      if (rows.length === 0) {
        throw createHttpError(404, 'Call session not found for this finance company', 'call_not_found');
      }

      const r = rows[0];
      const rawTurns = Array.isArray(r.transcript) ? r.transcript : [];
      const transcript = rawTurns.map((t) => ({
        speaker:
          String(t.speaker || t.sender || t.role || 'ai').toLowerCase() === 'customer' ||
            String(t.speaker || t.sender || t.role || '').toLowerCase() === 'user'
            ? 'customer'
            : 'ai',
        text: String(t.text || ''),
        time: String(t.time || ''),
      }));

      const mappedLifecycle = fromDbCallRowToDomainState(r);
      const lifecycle = mappedLifecycle.transportLifecycleStatus;
      const isTerminal = mappedLifecycle.isTerminal;
      const answered = Boolean(r.answered);
      const customerSpoke = Boolean(r.customer_spoke);
      const callOutcome = deriveBusinessCallOutcome({
        lifecycle,
        isTerminal,
        answered,
        customerSpoke,
        rawOutcome: r.outcome,
        disposition: r.disposition,
      });
      const maskedPhone = maskPhoneForDisplay(r.phone_e164);
      const loanRef = r.hplno != null ? `HPL-${r.hplno}` : 'N/A';

      let customerDetail = {
        customerId: r.customer_id,
        customerName: r.customer_name || 'Customer',
        hplno: r.hplno ?? null,
        loanRef,
        maskedPhone,
        loanStatus: r.loan_status || 'active',
        vehicleModel: r.vehicle_display || 'Two Wheeler',
        vehiclePlate: r.vehicle_number || '—',
        riskScore: 0,
        riskLevel: 'safe',
        creditScore: 75,
        creditBand: 'Good',
      };

      let loanLedgerDetail = {
        loanId: r.loan_id || null,
        loanRef,
        installmentAmount: 0,
        totalInstallments: 0,
        totalContractualDue: 0,
        validEmiPaid: 0,
        overdueAmount: Number(r.due_amount_at_call || 0),
        pendingPenaltyAmount: 0,
        totalOverdueWithPenalty: Number(r.due_amount_at_call || 0),
        totalBalanceAmount: Number(r.due_amount_at_call || 0),
        pendingEmiCount: 0,
        daysOverdue: 0,
        earliestUnpaidDueDate: null,
        nextEmiDueDate: null,
        dueAmountAtCall: r.due_amount_at_call != null ? Number(r.due_amount_at_call) : null,
      };

      let ptpCommitments = [];
      let callbacks = [];
      let previousSummaries = [];

      if (runner === db || opts.includeExtendedDetails === true) {
        const [rollup, riskHistRes, ptpRes, cbRes, prevSumRes] = await Promise.all([
          getCustomerFinancialRollup(financeId, r.customer_id, {
            queryRunner: runner,
            asOfDate: opts.asOfDate,
          }),
          runner.query(
            `SELECT
               COALESCE((
                 SELECT COUNT(*)::int
                 FROM payments p
                 WHERE p.customer_id = $2::uuid
                   AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
                   AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
                   AND COALESCE(p.status::text, 'paid') <> 'cancelled'
               ), 0) AS payment_count,
               COALESCE((
                 SELECT COUNT(*)::int
                 FROM payments p
                 WHERE p.customer_id = $2::uuid
                   AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
                   AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
                   AND COALESCE(p.status::text, 'paid') <> 'cancelled'
                   AND p.due_date IS NOT NULL
                   AND (p.payment_date - p.due_date) <= 5
               ), 0) AS on_time_count,
               COALESCE((
                 SELECT COUNT(*)::int
                 FROM payments p
                 WHERE p.customer_id = $2::uuid
                   AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
                   AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
                   AND COALESCE(p.status::text, 'paid') <> 'cancelled'
                   AND p.due_date IS NOT NULL
                   AND (p.payment_date - p.due_date) BETWEEN 15 AND 30
               ), 0) AS late_15_30,
               COALESCE((
                 SELECT COUNT(*)::int
                 FROM payments p
                 WHERE p.customer_id = $2::uuid
                   AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
                   AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
                   AND COALESCE(p.status::text, 'paid') <> 'cancelled'
                   AND p.due_date IS NOT NULL
                   AND (p.payment_date - p.due_date) BETWEEN 31 AND 60
               ), 0) AS late_31_60,
               COALESCE((
                 SELECT COUNT(*)::int
                 FROM payments p
                 WHERE p.customer_id = $2::uuid
                   AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
                   AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
                   AND COALESCE(p.status::text, 'paid') <> 'cancelled'
                   AND p.due_date IS NOT NULL
                   AND (p.payment_date - p.due_date) > 60
               ), 0) AS late_over_60,
               COALESCE((
                 SELECT GREATEST(
                   COUNT(*) FILTER (WHERE ptp_x.ptp_status::text = 'broken'),
                   COALESCE(SUM(ptp_x.broken_count), 0)
                 )::int
                 FROM promise_to_pay ptp_x
                 WHERE ptp_x.customer_id = $2::uuid
                   AND ptp_x.finance_id = $1::uuid
               ), 0) AS broken_ptp_count,
               EXISTS (
                 SELECT 1
                 FROM seizing_vehicle sv
                 WHERE sv.customer_id = $2::uuid
                   AND sv.finance_id = $1::uuid
                   AND COALESCE(sv.status::text, 'Pending') <> 'Cancelled'
               ) AS has_seizure`,
            [financeId, r.customer_id]
          ),
          runner.query(
            `SELECT
               ptp.id::text AS ptp_id,
               ptp.call_log_id::text AS call_log_id,
               ptp.loan_id::text AS loan_id,
               ptp.promised_amount::float8 AS promised_amount,
               TO_CHAR(ptp.promised_date, 'YYYY-MM-DD') AS promised_date,
               ptp.promised_time_text,
               COALESCE(ptp.ptp_status::text, 'pending') AS status,
               ptp.reason,
               ptp.note,
               COALESCE(ptp.is_superseded, false) AS is_superseded,
               ptp.created_at
             FROM promise_to_pay ptp
             WHERE ptp.finance_id = $1::uuid
               AND ptp.customer_id = $2::uuid
             ORDER BY
               CASE WHEN ptp.call_log_id = $3::uuid THEN 0 ELSE 1 END ASC,
               ptp.created_at DESC
             LIMIT 10`,
            [financeId, r.customer_id, cleanCallId]
          ),
          runner.query(
            `SELECT
               vc.id::text AS callback_id,
               vc.call_id::text AS call_id,
               vc.scheduled_at,
               COALESCE(vc.callback_status, 'scheduled') AS status,
               COALESCE(vc.source, 'manual') AS source,
               vc.customer_note AS note,
               vc.cancel_reason,
               vc.created_at
             FROM voice_callbacks vc
             WHERE vc.finance_id = $1::uuid
               AND vc.customer_id = $2::uuid
             ORDER BY
               CASE WHEN vc.call_id = $3::uuid THEN 0 ELSE 1 END ASC,
               vc.scheduled_at DESC NULLS LAST,
               vc.created_at DESC
             LIMIT 10`,
            [financeId, r.customer_id, cleanCallId]
          ),
          runner.query(
            `SELECT
               vcs.id::text AS summary_id,
               vcs.call_log_id::text AS call_log_id,
               vcs.loan_id::text AS loan_id,
               vcs.call_date,
               vcs.language_used,
               vcs.outcome,
               vcs.summary_short,
               vcs.customer_stated_reason,
               vcs.commitment_summary,
               vcs.observable_tone,
               COALESCE(vcs.requested_human, false) AS requested_human
             FROM voice_call_summaries vcs
             WHERE vcs.finance_id = $1::uuid
               AND vcs.customer_id = $2::uuid
               AND COALESCE(vcs.is_superseded, false) = false
               AND vcs.call_log_id IS DISTINCT FROM $3::uuid
               AND NOT EXISTS (
                 SELECT 1
                   FROM ai_telecalling_call_logs cl_m
                  WHERE cl_m.id = vcs.call_log_id
                    AND cl_m.finance_id = vcs.finance_id
                    AND cl_m.provider_call_id LIKE 'mock-%'
               )
             ORDER BY
               CASE WHEN $4::uuid IS NOT NULL AND vcs.loan_id = $4::uuid THEN 0 ELSE 1 END ASC,
               vcs.call_date DESC
             LIMIT 6`,
            [financeId, r.customer_id, cleanCallId, r.loan_id || null]
          ),
        ]);

        const targetLoan =
          (r.loan_id &&
            Array.isArray(rollup.loans) &&
            rollup.loans.find((x) => String(x.loanId) === String(r.loan_id))) ||
          (Array.isArray(rollup.loans) && rollup.loans[0]) ||
          null;

        const rh = riskHistRes.rows[0] || {};
        if (targetLoan) {
          const scored = scoreCustomer(
            {
              loanId: targetLoan.loanId,
              customerId: targetLoan.customerId,
              loanStatus: targetLoan.loanStatus || r.loan_status || 'active',
              dueAmount: targetLoan.installmentAmount,
              netPayable: targetLoan.totalContractualDue,
              dueMonth: targetLoan.totalInstallments,
              validEmiPaid: targetLoan.validEmiPaid,
              totalPenaltyPaid: targetLoan.totalPenaltyPaid,
              pendingPenaltiesTableSum: targetLoan.outstandingPenaltyAmount,
              dueDate: targetLoan.anchorDate,
              asOfDate: targetLoan.asOfDate,
            },
            {
              totalPayments: Number(rh.payment_count || 0),
              onTimePayments: Number(rh.on_time_count || 0),
              late15to30: Number(rh.late_15_30 || 0),
              late31to60: Number(rh.late_31_60 || 0),
              lateOver60: Number(rh.late_over_60 || 0),
              brokenPtpCount: Number(rh.broken_ptp_count || 0),
              hasSeizure: rh.has_seizure === true,
            }
          );

          customerDetail = {
            ...customerDetail,
            riskLevel: scored.riskLevel || 'safe',
            riskScore: Number(scored.due?.dueRiskScore || 0),
            creditScore: Number(scored.credit?.creditScore || 75),
            creditBand: scored.credit?.creditBand || 'Good',
          };

          const overdueAmt = Number(rollup.currentOverdueEmiAmount || 0);
          const pendingPenalty = Number(rollup.outstandingPenaltyAmount || 0);
          loanLedgerDetail = {
            loanId: targetLoan.loanId || r.loan_id || null,
            loanRef: targetLoan.hplno != null ? `HPL-${targetLoan.hplno}` : loanRef,
            installmentAmount: Number(targetLoan.installmentAmount || 0),
            totalInstallments: Number(targetLoan.totalInstallments || 0),
            totalContractualDue: Number(rollup.totalContractualDue || 0),
            validEmiPaid: Number(rollup.validEmiPaid || 0),
            overdueAmount: overdueAmt,
            pendingPenaltyAmount: pendingPenalty,
            totalOverdueWithPenalty: Math.round((overdueAmt + pendingPenalty) * 100) / 100,
            totalBalanceAmount: Number(rollup.totalOutstandingLoanBalance || 0),
            pendingEmiCount: Number(rollup.pendingEmiCount || 0),
            daysOverdue: Number(rollup.overdueDays || 0),
            earliestUnpaidDueDate: rollup.earliestUnpaidDueDate || null,
            nextEmiDueDate: rollup.nextEmiDueDate || null,
            dueAmountAtCall: r.due_amount_at_call != null ? Number(r.due_amount_at_call) : null,
          };
        }

        ptpCommitments = (ptpRes.rows || []).map((p) => ({
          ptpId: p.ptp_id,
          callLogId: p.call_log_id || null,
          isCurrentCall: p.call_log_id === cleanCallId,
          promisedAmount: p.promised_amount != null ? Number(p.promised_amount) : null,
          promisedDate: p.promised_date || null,
          promisedTimeText: p.promised_time_text || null,
          status: p.status || 'pending',
          reason: p.reason || null,
          note: p.note || null,
          isSuperseded: Boolean(p.is_superseded),
          createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
        }));

        callbacks = (cbRes.rows || []).map((cb) => ({
          callbackId: cb.callback_id,
          callId: cb.call_id || null,
          isCurrentCall: cb.call_id === cleanCallId,
          scheduledAt: cb.scheduled_at ? new Date(cb.scheduled_at).toISOString() : null,
          status: cb.status || 'scheduled',
          source: cb.source || 'manual',
          note: cb.note || null,
          cancelReason: cb.cancel_reason || null,
          createdAt: cb.created_at ? new Date(cb.created_at).toISOString() : null,
        }));

        previousSummaries = (prevSumRes.rows || []).map((ps) => ({
          summaryId: ps.summary_id,
          callLogId: ps.call_log_id || null,
          loanId: ps.loan_id || null,
          callDate: ps.call_date ? new Date(ps.call_date).toISOString() : null,
          languageUsed: ps.language_used || 'ta-IN',
          outcome: ps.outcome || 'completed',
          summaryShort: ps.summary_short || '',
          customerStatedReason: ps.customer_stated_reason || null,
          commitmentSummary: ps.commitment_summary || null,
          observableTone: ps.observable_tone || null,
          requestedHuman: Boolean(ps.requested_human),
        }));
      }

      return {
        call: {
          callId: r.call_id,
          leadId: r.lead_id,
          customerId: r.customer_id,
          loanId: r.loan_id,
          customerName: r.customer_name || 'Customer',
          hplno: r.hplno,
          maskedPhone,
          callStatus: r.call_status,
          callLifecycleStatus: lifecycle,
          callDisplayState: mappedLifecycle.domainState,
          needsReconcile: mappedLifecycle.needsReconcile,
          callOutcome,
          isTerminal,
          answered,
          customerSpoke,
          identityVerified: Boolean(r.identity_verified),
          durationSec: Number(r.duration_sec || 0),
          durationLabel: formatDurationSeconds(r.duration_sec) || '0:00',
          startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
          endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
          transcript,
          summaryText: r.summary_text || null,
          outcome: r.outcome || null,
          disposition: r.disposition || null,
          sentiment: r.sentiment || 'neutral',
          languageUsed: r.language_used || 'ta-IN',
          hasRecording: Boolean(
            r.recording_s3_key && ['ready', 'uploaded'].includes(r.recording_status)
          ),
          recordingStatus: r.recording_status || 'not_recorded',
          recordingDurationSec: Number(r.recording_duration_sec || 0),
          recordingSizeBytes: Number(r.recording_size_bytes || 0),
          providerCallId: r.provider_call_id || null,
          errorDetail: r.error_detail || null,
          promisedDate: r.promised_date || null,
          promisedAmount: r.promised_amount != null ? Number(r.promised_amount) : null,
          telemetry: {
            memoryTokens: Number(r.memory_tokens || 0),
            promptTokens: Number(r.prompt_tokens || 0),
            completionTokens: Number(r.completion_tokens || 0),
            totalTokens: Number(r.total_tokens || 0),
            ttsCharacters: Number(r.tts_characters || 0),
            sttSeconds: Number(r.stt_seconds || 0),
            llmModel: r.llm_model || null,
            ttsModel: r.tts_model || 'bulbul:v4',
            sttModel: r.stt_model || null,
          },
          details: {
            customer: customerDetail,
            loanLedger: loanLedgerDetail,
            summary: {
              summaryShort: r.summary_short || r.summary_text || null,
              customerStatedReason: r.customer_stated_reason || null,
              commitmentSummary: r.commitment_summary || null,
              observableTone: r.observable_tone || null,
              aggressionLevel: r.aggression_level || 'none',
              requestedHuman: Boolean(r.requested_human),
            },
            ptpCommitments,
            callbacks,
            previousSummaries,
          },
        },
      };
    }

    async function scheduleLeadCallbacks(financeId, payload = {}, opts = {}) {
      const runner = opts.queryRunner || db;
      const leadIds = Array.isArray(payload.leadIds) ? payload.leadIds.filter(Boolean) : [];
      if (leadIds.length === 0) {
        throw createHttpError(400, 'At least one leadId is required to schedule a callback');
      }

      const scheduledAtIso =
        payload.scheduledAtIso || new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const schedulePreset = String(payload.schedulePreset || 'Scheduled Callback').slice(0, 100);
      const note = String(payload.note || '').slice(0, 300);

      const { rows: leadRows } = await runner.query(
        `SELECT id, customer_id, loan_id, phone_e164 FROM ai_telecalling_leads
      WHERE finance_id = $1 AND (id = ANY($2::uuid[]) OR customer_id = ANY($2::uuid[]))`,
        [financeId, leadIds]
      );

      let scheduledCount = 0;
      for (const lead of leadRows) {
        // Situation A: strictly writes to voice_callbacks + ai_telecalling_leads ONLY (never DNC!)
        await runner.query(
          `INSERT INTO voice_callbacks (
          finance_id, customer_id, loan_id, phone_e164, scheduled_at,
          source, customer_note, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, 'manual_staff', $6, $7)
       ON CONFLICT (finance_id, customer_id) WHERE callback_status IN ('scheduled', 'claimed', 'dialing')
       DO UPDATE SET scheduled_at = EXCLUDED.scheduled_at,
                     customer_note = EXCLUDED.customer_note,
                     updated_at = NOW()
       RETURNING id`,
          [
            financeId,
            lead.customer_id,
            lead.loan_id,
            lead.phone_e164 || null,
            scheduledAtIso,
            note || schedulePreset,
            `ui-sched:${financeId}:${lead.id}:${scheduledAtIso}`,
          ]
        );

        await runner.query(
          `UPDATE ai_telecalling_leads
          SET call_status = 'scheduled',
              scheduled_time = $3::timestamp,
              schedule_preset = $4,
              callback_requested = TRUE,
              notes = COALESCE(NULLIF($5, ''), notes),
              updated_at = CURRENT_TIMESTAMP
        WHERE finance_id = $1 AND id = $2`,
          [financeId, lead.id, scheduledAtIso, schedulePreset, note]
        );
        scheduledCount += 1;
      }

      return { scheduledCount, scheduledAtIso, schedulePreset };
    }

    async function triggerLeadCall(_financeId, _leadId) {
      throw createHttpError(
        410,
        'POST /api/ai/leads/:leadId/call is deprecated and disabled. Use POST /api/ai/calls/manual with { customerId } and Idempotency-Key.',
        'endpoint_deprecated'
      );
    }

    async function getCallLogs(financeId, query = {}, opts = {}) {
      const runner = opts.queryRunner || db;
      const limit = Math.min(100, Math.max(1, Number(query.limit || 50)));

      const { rows } = await runner.query(
        `SELECT
        cl.id::text AS id,
        cl.customer_id::text AS customer_id,
        c.cname AS customer_name,
        COALESCE(cl.phone_e164, '') AS phone,
        COALESCE(c.hplno::text, 'N/A') AS hpl,
        COALESCE(vd.vehicle_number, '—') AS vehicle,
        TO_CHAR(cl.started_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS started_label,
        COALESCE(cl.sentiment::text, 'neutral') AS sentiment,
        COALESCE(cl.call_lifecycle_status, cl.call_status::text) AS call_status,
        COALESCE(vcs.outcome, cl.disposition) AS call_outcome,
        cl.disposition,
        COALESCE(cl.answered, false) AS answered,
        COALESCE(cl.customer_spoke, false) AS customer_spoke,
        COALESCE(cl.call_duration_seconds, cl.recording_duration_seconds, 0)::int AS duration_sec,
        COALESCE(vcs.summary_short, cl.call_outcome_note) AS summary_text,
        cl.recording_s3_key,
        cl.recording_status,
        cl.transcript
       FROM ai_telecalling_call_logs cl
       JOIN customers c ON c.id = cl.customer_id AND c.finance_id = cl.finance_id
       LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
       LEFT JOIN LATERAL (
         SELECT s.summary_short, s.outcome
           FROM voice_call_summaries s
          WHERE s.call_log_id = cl.id
            AND s.finance_id = cl.finance_id
            AND COALESCE(s.is_superseded, false) = false
          ORDER BY s.created_at DESC
          LIMIT 1
       ) vcs ON TRUE
      WHERE cl.finance_id = $1
      ORDER BY cl.started_at DESC
      LIMIT $2`,
        [financeId, limit]
      );

      const logs = rows.map((r, idx) => {
        const rawTurns = Array.isArray(r.transcript) ? r.transcript : [];
        const messages = rawTurns.map((m) => ({
          role: m.sender === 'customer' || m.role === 'customer' || m.speaker === 'customer' ? 'customer' : 'ai',
          text: String(m.text || ''),
          time: String(m.time || r.started_label || ''),
        }));
        const hasSpoken = Boolean(r.answered && r.customer_spoke);
        const normalizedOutcome = r.call_outcome || (hasSpoken ? 'completed_general' : 'no_response');
        return {
          id: idx + 1,
          callId: r.id,
          logUuid: r.id,
          customerId: r.customer_id,
          customer: r.customer_name || 'Customer',
          phone: String(r.phone || '').replace(/^\+91/, ''),
          hpl: r.hpl.startsWith('HPL') ? r.hpl : `HPL-${r.hpl}`,
          vehicle: r.vehicle,
          date: r.started_label,
          sentiment: ['positive', 'negative', 'neutral'].includes(r.sentiment) ? r.sentiment : 'neutral',
          status: r.call_status === 'completed' && hasSpoken ? 'Resolved' : 'Pending',
          callLifecycleStatus: r.call_status || 'completed',
          callOutcome: normalizedOutcome,
          answered: Boolean(r.answered),
          customerSpoke: Boolean(r.customer_spoke),
          durationSec: Number(r.duration_sec || 0),
          summaryText: r.summary_text || null,
          hasRecording: Boolean(
            r.recording_s3_key && ['ready', 'uploaded'].includes(r.recording_status)
          ),
          recordingStatus: r.recording_status || 'not_recorded',
          tags: [r.disposition || normalizedOutcome].filter(Boolean),
          messages,
        };
      });

      return { logs };
    }

    async function getDashboardOverview(financeId, opts = {}) {
      const runner = opts.queryRunner || db;
      const [kpiRes, cbRes, recentRes, dailyRes] = await Promise.all([
        runner.query(
          `SELECT
            COUNT(*)::int AS total_calls,
            COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours')::int AS active_conversations,
            COUNT(*) FILTER (WHERE sentiment = 'positive')::int AS positive_calls,
            COUNT(*) FILTER (WHERE sentiment = 'negative')::int AS negative_calls,
            COUNT(*) FILTER (WHERE answered = TRUE AND customer_spoke = TRUE)::int AS reminders_delivered
           FROM ai_telecalling_call_logs
          WHERE finance_id = $1`,
          [financeId]
        ),
        runner.query(
          `SELECT COUNT(*)::int AS pending_callbacks
             FROM voice_callbacks
            WHERE finance_id = $1 AND callback_status = 'scheduled'`,
          [financeId]
        ),
        runner.query(
          `SELECT
            cl.id::text AS id,
            c.cname AS customer,
            COALESCE(c.hplno::text, 'N/A') AS hpl,
            COALESCE(cl.sentiment::text, 'neutral') AS sentiment,
            COALESCE(cl.call_lifecycle_status, cl.call_status::text) AS call_status,
            COALESCE(cl.disposition, 'no_response') AS call_outcome,
            cl.started_at
           FROM ai_telecalling_call_logs cl
           JOIN customers c ON c.id = cl.customer_id AND c.finance_id = cl.finance_id
          WHERE cl.finance_id = $1
          ORDER BY cl.started_at DESC
          LIMIT 5`,
          [financeId]
        ),
        runner.query(
          `WITH days AS (
             SELECT generate_series(
               ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '6 days')::date,
               (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
               INTERVAL '1 day'
             )::date AS day_ist
           )
           SELECT
             TO_CHAR(d.day_ist, 'Dy') AS day_label,
             TO_CHAR(d.day_ist, 'YYYY-MM-DD') AS day_iso,
             COUNT(cl.id)::int AS calls,
             COUNT(cl.id) FILTER (WHERE cl.sentiment = 'positive')::int AS positive,
             COUNT(cl.id) FILTER (WHERE COALESCE(cl.sentiment::text, 'neutral') = 'neutral')::int AS neutral,
             COUNT(cl.id) FILTER (WHERE cl.sentiment = 'negative')::int AS negative
           FROM days d
           LEFT JOIN ai_telecalling_call_logs cl
             ON cl.finance_id = $1::uuid
            AND (cl.started_at AT TIME ZONE 'Asia/Kolkata')::date = d.day_ist
           GROUP BY d.day_ist
           ORDER BY d.day_ist ASC`,
          [financeId]
        ),
      ]);

      const k = kpiRes.rows[0] || {
        total_calls: 0,
        active_conversations: 0,
        positive_calls: 0,
        negative_calls: 0,
        reminders_delivered: 0,
      };
      const denom = Math.max(1, Number(k.total_calls || 0));
      const positivePct = k.total_calls > 0 ? Math.round((Number(k.positive_calls) * 100) / denom) : 0;
      const negativePct = k.total_calls > 0 ? Math.round((Number(k.negative_calls) * 100) / denom) : 0;

      const sentimentData = (dailyRes.rows || []).map((d) => ({
        date: d.day_label,
        dayIso: d.day_iso,
        positive: Number(d.positive || 0),
        neutral: Number(d.neutral || 0),
        negative: Number(d.negative || 0),
      }));

      const volumeData = (dailyRes.rows || []).map((d) => ({
        date: d.day_label,
        dayIso: d.day_iso,
        calls: Number(d.calls || 0),
      }));

      return {
        kpis: {
          totalCalls: Number(k.total_calls || 0),
          activeConversations: Number(k.active_conversations || 0),
          positivePct,
          negativePct,
          remindersSent: Number(k.reminders_delivered || 0),
          followUpPending: Number(cbRes.rows[0]?.pending_callbacks || 0),
        },
        sentimentData,
        volumeData,
        recentInteractions: (recentRes.rows || []).map((r, i) => ({
          id: i + 1,
          callId: r.id,
          customer: r.customer,
          hpl: r.hpl.startsWith('HPL') ? r.hpl : `HPL-${r.hpl}`,
          sentiment: r.sentiment,
          callStatus: r.call_status,
          callOutcome: r.call_outcome,
          time: formatRelativeTime(r.started_at),
        })),
      };
    }

    /**
     * Real-data AI Insights & Analytics (`GET /api/ai/insights`).
     * Reuses `getTelecallingLeads` + `scoreCustomer` + real PostgreSQL call/payment aggregations
     * with zero hardcoded mock numbers or demo customer names.
     */
    async function getInsightsOverview(financeId, opts = {}) {
      const runner = opts.queryRunner || db;
      const [leadsBundle, portfolioRiskRes, callStatsRes, outcomeRes, activeCustRes, monthlyTrendRes] = await Promise.all([
        getTelecallingLeads(
          financeId,
          { sortBy: 'riskScore', sortDir: 'desc', limit: 25, page: 1 },
          { ...opts, presignPhotoFn: async () => null }
        ),
        runner.query(
          `SELECT
             COUNT(*)::int AS total_customers,
             COUNT(*) FILTER (WHERE c.loan_status::text IN ('active', 'seized'))::int AS open_customers
            FROM customers c
           WHERE c.finance_id = $1::uuid`,
          [financeId]
        ),
        runner.query(
          `SELECT
             COUNT(*)::int AS total_calls,
             COUNT(*) FILTER (WHERE cl.answered = TRUE AND cl.customer_spoke = TRUE)::int AS connected_calls,
             COUNT(*) FILTER (
               WHERE cl.disposition = 'promise_to_pay'
                  OR EXISTS (
                    SELECT 1 FROM promise_to_pay ptp
                     WHERE ptp.call_log_id = cl.id
                       AND ptp.finance_id = cl.finance_id
                  )
             )::int AS ptp_calls,
             COUNT(*) FILTER (WHERE cl.started_at >= NOW() - INTERVAL '24 hours')::int AS calls_24h,
             ROUND(AVG(COALESCE(cl.call_duration_seconds, 0)) FILTER (WHERE cl.answered = TRUE))::int AS avg_duration_sec
            FROM ai_telecalling_call_logs cl
           WHERE cl.finance_id = $1::uuid`,
          [financeId]
        ),
        runner.query(
          `SELECT
             COALESCE(NULLIF(TRIM(COALESCE(vcs.outcome, cl.disposition)), ''), 'no_response') AS label,
             COUNT(*)::int AS count
            FROM ai_telecalling_call_logs cl
            LEFT JOIN voice_call_summaries vcs
              ON vcs.call_log_id = cl.id
             AND vcs.finance_id = cl.finance_id
             AND COALESCE(vcs.is_superseded, false) = false
           WHERE cl.finance_id = $1::uuid
           GROUP BY 1
           ORDER BY count DESC
           LIMIT 5`,
          [financeId]
        ),
        runner.query(
          `SELECT
             cl.customer_id::text AS customer_id,
             c.cname AS name,
             COUNT(cl.id)::int AS interactions,
             COALESCE((ARRAY_AGG(cl.sentiment::text ORDER BY cl.started_at DESC))[1], 'neutral') AS sentiment
            FROM ai_telecalling_call_logs cl
            JOIN customers c ON c.id = cl.customer_id AND c.finance_id = cl.finance_id
           WHERE cl.finance_id = $1::uuid
           GROUP BY cl.customer_id, c.cname
           ORDER BY interactions DESC, c.cname ASC
           LIMIT 5`,
          [financeId]
        ),
        runner.query(
          `WITH months AS (
             SELECT generate_series(
               date_trunc('month', (NOW() AT TIME ZONE 'Asia/Kolkata')) - INTERVAL '5 months',
               date_trunc('month', (NOW() AT TIME ZONE 'Asia/Kolkata')),
               INTERVAL '1 month'
             )::date AS month_start
           )
           SELECT
             TO_CHAR(m.month_start, 'Mon') AS month,
             COUNT(cl.id)::int AS total_calls,
             COUNT(cl.id) FILTER (WHERE cl.sentiment = 'positive')::int AS positive_calls,
             COUNT(DISTINCT p.customer_id)::int AS paying_customers
           FROM months m
           LEFT JOIN ai_telecalling_call_logs cl
             ON cl.finance_id = $1::uuid
            AND date_trunc('month', cl.started_at AT TIME ZONE 'Asia/Kolkata')::date = m.month_start
           LEFT JOIN payments p
             ON (p.finance_id = $1::uuid OR p.finance_id IS NULL)
            AND p.customer_id IN (SELECT id FROM customers WHERE finance_id = $1::uuid)
            AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
            AND COALESCE(p.status::text, 'paid') <> 'cancelled'
            AND date_trunc('month', p.payment_date)::date = m.month_start
           GROUP BY m.month_start
           ORDER BY m.month_start ASC`,
          [financeId]
        ),
      ]);

      const { leads, summary: leadSummary } = leadsBundle;
      const openCustomers = Math.max(
        Number(portfolioRiskRes.rows[0]?.open_customers || 0),
        Number(leadSummary?.unpaidLeads || 0)
      );
      const cs = callStatsRes.rows[0] || {};
      const totalCalls = Number(cs.total_calls || 0);
      const connectedCalls = Number(cs.connected_calls || 0);
      const ptpCalls = Number(cs.ptp_calls || 0);
      const calls24h = Number(cs.calls_24h || 0);
      const avgDurationSec = Number(cs.avg_duration_sec || 0);

      const highRiskOverdueCount = leads.filter(
        (l) => l.riskLevel === 'critical' || l.riskLevel === 'high'
      ).length;
      const mediumRiskCount = leads.filter((l) => l.riskLevel === 'warning').length;
      const lowRiskCount = Math.max(0, openCustomers - highRiskOverdueCount - mediumRiskCount);

      const denomPortfolio = Math.max(1, openCustomers);
      const highRiskPct = openCustomers > 0 ? Math.round((highRiskOverdueCount * 100) / denomPortfolio) : 0;
      const mediumRiskPct = openCustomers > 0 ? Math.round((mediumRiskCount * 100) / denomPortfolio) : 0;
      const lowRiskPct = openCustomers > 0 ? Math.max(0, 100 - highRiskPct - mediumRiskPct) : 0;

      const connectionRatePct = totalCalls > 0 ? Math.round((connectedCalls * 100) / totalCalls) : 0;
      const ptpRatePct = connectedCalls > 0 ? Math.round((ptpCalls * 100) / connectedCalls) : 0;

      const sentimentVsRecovery = (monthlyTrendRes.rows || []).map((m) => {
        const mCalls = Number(m.total_calls || 0);
        const mPos = Number(m.positive_calls || 0);
        const mPay = Number(m.paying_customers || 0);
        return {
          month: m.month,
          recovery: openCustomers > 0 ? Math.min(100, Math.round((mPay * 100) / denomPortfolio)) : 0,
          sentiment: mCalls > 0 ? Math.round((mPos * 100) / mCalls) : 0,
        };
      });

      return {
        topStats: {
          connectionRatePct,
          ptpConversionPct: ptpRatePct,
          highRiskPct,
          activeConversations: calls24h,
          totalCalls,
          connectedCalls,
          ptpCalls,
          avgDurationSec,
        },
        riskDistribution: [
          { name: 'Low Risk', value: lowRiskPct, count: lowRiskCount, color: '#22c55e' },
          { name: 'Medium Risk', value: mediumRiskPct, count: mediumRiskCount, color: '#eab308' },
          { name: 'High Risk', value: highRiskPct, count: highRiskOverdueCount, color: '#ef4444' },
        ],
        sentimentVsRecovery,
        topOutcomes: (outcomeRes.rows || []).map((o) => ({
          name: String(o.label).replace(/_/g, ' '),
          count: Number(o.count || 0),
        })),
        activeCustomers: (activeCustRes.rows || []).map((c) => ({
          customerId: c.customer_id,
          name: c.name,
          interactions: Number(c.interactions || 0),
          sentiment: c.sentiment || 'neutral',
        })),
        highRiskCustomers: leads.slice(0, 6).map((l) => ({
          customerId: l.customerId,
          name: l.customerName,
          hpl: l.loanId,
          score: l.riskScore,
          riskLevel: l.riskLevel,
          creditScore: l.creditScore,
          overdue: `₹${Math.round(Number(l.dueAmount || 0)).toLocaleString('en-IN')}`,
          days: Number(l.daysOverdue || 0),
        })),
      };
    }

    module.exports = {
      normalizeSarvamV4Voice,
      classifyLeadCallState,
      computeLeadRisk,
      getVoiceHealth,
      refreshTelecallingLeads,
      getCallRecordingPlaybackUrl,
      initiateManualCustomerCall,
      getCallStatusById,
      getAiSettings,
      updateAiSettings,
      getTelecallingLeads,
      scheduleLeadCallbacks,
      triggerLeadCall,
      getCallLogs,
      getDashboardOverview,
      getInsightsOverview,
    };

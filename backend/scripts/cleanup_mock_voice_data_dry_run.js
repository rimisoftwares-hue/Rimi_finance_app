'use strict';

/**
 * DRY-RUN-ONLY Audit Script for Mock / Synthetic Voice AI Rows (Amendment A4).
 *
 * SAFETY GUARANTEES:
 * - Executes inside `BEGIN TRANSACTION READ ONLY` and always `ROLLBACK`s in `finally`.
 * - Contains ZERO `DELETE`, `UPDATE`, `INSERT`, `TRUNCATE`, or DDL statements.
 * - Masks all phone numbers (`+91 ******XXXX`) and never prints secrets or raw PII.
 *
 * Usage:
 *   cd backend && node scripts/cleanup_mock_voice_data_dry_run.js
 */

const path = require('path');

function maskPhoneSafe(rawPhone) {
  const cleaned = String(rawPhone || '').replace(/[\s-]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('+91') && cleaned.length >= 13) {
    return `+91 ******${cleaned.slice(-4)}`;
  }
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `******${digits.slice(-4)}`;
  }
  return '******';
}

function createCliReadOnlyPool(env = process.env) {
  const { Pool } = require('pg');
  return new Pool({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    port: env.DB_PORT ? Number(env.DB_PORT) : 5432,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    ssl: env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  });
}

async function auditMockVoiceDataDryRun(opts = {}) {
  const ownsPool = !opts.pool;
  const activePool = opts.pool || createCliReadOnlyPool();

  let client;
  try {
    client = await activePool.connect();
    // Enforce PostgreSQL hardware/engine-level READ ONLY transaction (0 mutations possible)
    await client.query('BEGIN TRANSACTION READ ONLY');

    const { rows: stuckLeads } = await client.query(
      `SELECT id::text AS lead_id,
              finance_id::text AS finance_id,
              customer_id::text AS customer_id,
              phone_e164,
              call_status::text AS call_status,
              attempt_count,
              daily_attempt_count,
              last_call_at,
              updated_at
         FROM ai_telecalling_leads
        WHERE call_status IN ('connecting', 'speaking')
        ORDER BY updated_at DESC
        LIMIT 50`
    );

    const { rows: mockCallLogs } = await client.query(
      `SELECT id::text AS call_id,
              finance_id::text AS finance_id,
              customer_id::text AS customer_id,
              provider_call_id,
              phone_e164,
              call_status::text AS call_status,
              call_lifecycle_status,
              disposition,
              call_duration_seconds,
              caller_type,
              started_at
         FROM ai_telecalling_call_logs
        WHERE provider_call_id LIKE 'mock-%'
           OR (
             caller_type = 'ai_manual'
             AND COALESCE(call_duration_seconds, 0) <= 3
             AND disposition = 'ptp_confirmed'
           )
        ORDER BY started_at DESC
        LIMIT 50`
    );

    const { rows: aiLinkedPtps } = await client.query(
      `SELECT p.id::text AS ptp_id,
              p.finance_id::text AS finance_id,
              p.customer_id::text AS customer_id,
              p.call_log_id::text AS call_log_id,
              cl.provider_call_id,
              cl.call_duration_seconds,
              p.promised_amount,
              p.promised_date::text AS promised_date,
              p.ptp_status::text AS status,
              p.created_at
         FROM promise_to_pay p
         LEFT JOIN ai_telecalling_call_logs cl
           ON cl.id = p.call_log_id
          AND cl.finance_id = p.finance_id
        WHERE p.call_log_id IS NOT NULL
          AND (
            cl.provider_call_id LIKE 'mock-%'
            OR (cl.caller_type = 'ai_manual' AND COALESCE(cl.call_duration_seconds, 0) <= 3)
          )
        ORDER BY p.created_at DESC
        LIMIT 50`
    );

    const { rows: mockSummaries } = await client.query(
      `SELECT vcs.id::text AS summary_id,
              vcs.finance_id::text AS finance_id,
              vcs.customer_id::text AS customer_id,
              vcs.call_log_id::text AS call_log_id,
              cl.provider_call_id,
              cl.call_duration_seconds,
              vcs.outcome::text AS outcome,
              vcs.created_at
         FROM voice_call_summaries vcs
         LEFT JOIN ai_telecalling_call_logs cl
           ON cl.id = vcs.call_log_id
          AND cl.finance_id = vcs.finance_id
        WHERE cl.provider_call_id LIKE 'mock-%'
           OR (cl.caller_type = 'ai_manual' AND COALESCE(cl.call_duration_seconds, 0) <= 3)
        ORDER BY vcs.created_at DESC
        LIMIT 50`
    );

    const { rows: customerMemories } = await client.query(
      `SELECT vcm.id::text AS memory_id,
              vcm.finance_id::text AS finance_id,
              vcm.customer_id::text AS customer_id,
              vcm.total_calls AS total_calls_count,
              (vcm.ptp_kept_count + vcm.ptp_broken_count) AS promises_made_count,
              vcm.last_call_log_id::text AS last_call_log_id,
              cl.provider_call_id AS last_provider_call_id,
              vcm.updated_at
         FROM voice_customer_memory vcm
         LEFT JOIN ai_telecalling_call_logs cl
           ON cl.id = vcm.last_call_log_id
          AND cl.finance_id = vcm.finance_id
        WHERE cl.provider_call_id LIKE 'mock-%'
           OR (cl.caller_type = 'ai_manual' AND COALESCE(cl.call_duration_seconds, 0) <= 3)
        ORDER BY vcm.updated_at DESC
        LIMIT 50`
    );

    const { rows: legacyOutboxRows } = await client.query(
      `SELECT id::text AS outbox_id,
              finance_id::text AS finance_id,
              aggregate_type,
              aggregate_id::text AS aggregate_id,
              event_type,
              status::text AS status,
              created_at
         FROM voice_outbox_events
        WHERE event_type = 'dispatch_outbound_call'
        ORDER BY created_at DESC
        LIMIT 50`
    );

    return {
      mode: 'DRY_RUN_READ_ONLY',
      mutatedRows: 0,
      auditedAt: new Date().toISOString(),
      counts: {
        stuckConnectingOrSpeakingLeads: stuckLeads.length,
        mockOrSyntheticCallLogs: mockCallLogs.length,
        mockLinkedPromiseToPay: aiLinkedPtps.length,
        mockCallSummaries: mockSummaries.length,
        mockTouchedCustomerMemories: customerMemories.length,
        legacyOrphanOutboxEvents: legacyOutboxRows.length,
      },
      samples: {
        stuckLeads: stuckLeads.map((r) => ({
          ...r,
          phone_e164: maskPhoneSafe(r.phone_e164),
        })),
        mockCallLogs: mockCallLogs.map((r) => ({
          ...r,
          phone_e164: maskPhoneSafe(r.phone_e164),
        })),
        mockLinkedPromiseToPay: aiLinkedPtps,
        mockCallSummaries: mockSummaries,
        mockTouchedCustomerMemories: customerMemories,
        legacyOrphanOutboxEvents: legacyOutboxRows,
      },
    };
  } finally {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (ownsPool && activePool && typeof activePool.end === 'function') {
      await activePool.end().catch(() => {});
    }
  }
}

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

  auditMockVoiceDataDryRun()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error('Mock voice data dry-run audit failed:', err.message);
      process.exitCode = 1;
    });
}

module.exports = {
  auditMockVoiceDataDryRun,
  maskPhoneSafe,
};

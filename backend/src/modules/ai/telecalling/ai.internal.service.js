'use strict';

/**
 * Internal HMAC-Authenticated Write Service for AutoFinex Voice AI (`/api/internal/voice-ai/*`).
 *
 * Enforces Decision #1 (Strict Read/Write Separation):
 * - The Python Voice AI Agent (`autofinex_voice_ro`) has `SELECT`-only database access.
 * - ALL call lifecycle transitions, mid-call tool writes (Situation A callback, Situation B PTP,
 *   Situation C privacy/DNC opt-out, human escalations), and post-call completion (`fn_complete_voice_call`)
 *   execute through this Rimi Backend service with strict `(finance_id, customer_id)` ownership checks.
 */

const crypto = require('crypto');
const { db } = require('../../../config/database.config');
const { validateRecordingS3Key } = require('./voiceRecording.s3');
const {
  toDbLifecycleStatus,
  toLeadCallStatusEnum,
  fromDbCallRowToDomainState,
  validateLifecycleTransition,
  isMockProviderCallId,
  TERMINAL_DB_STATUSES,
} = require('./callLifecycle.mapper');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_CALLBACK_SOURCES = new Set([
  'customer_voice_request',
  'busy_momentary_deferral',
  'third_party_available_later',
  'worker_interrupted_retry',
  'manual_staff',
]);

const VALID_CALL_STATUS_ENUM = new Set([
  'uncalled',
  'connecting',
  'speaking',
  'completed',
  'not_responded',
  'failed',
  'scheduled',
  'suppressed',
]);

const VALID_SENTIMENTS = new Set(['positive', 'neutral', 'negative']);

function createHttpError(statusCode, message, code = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function assertUuid(value, fieldName) {
  const str = String(value || '').trim();
  if (!UUID_REGEX.test(str)) {
    throw createHttpError(400, `${fieldName} must be a valid UUID`, 'invalid_uuid');
  }
  return str;
}

function optionalUuid(value, fieldName) {
  if (value == null || value === '') return null;
  return assertUuid(value, fieldName);
}

async function assertTenantCustomerOwnership(runner, financeId, customerId) {
  const { rows } = await runner.query(
    `SELECT c.id::text AS customer_id,
            c.finance_id::text AS finance_id,
            (
              SELECT ct.phone_e164
                FROM contacts ct
               WHERE ct.customer_id = c.id
                 AND (ct.finance_id = c.finance_id OR ct.finance_id IS NULL)
                 AND ct.phone_e164 IS NOT NULL
               ORDER BY
                 CASE WHEN ct.contact_type::text = 'customer' THEN 0 ELSE 1 END,
                 ct.id ASC
               LIMIT 1
            ) AS phone_e164
       FROM customers c
      WHERE c.id = $1::uuid
        AND c.finance_id = $2::uuid
      LIMIT 1`,
    [customerId, financeId]
  );

  if (rows.length === 0) {
    throw createHttpError(
      404,
      'Customer not found for specified finance_id',
      'customer_tenant_mismatch'
    );
  }
  return rows[0];
}

async function isMockCallContext(runner, { financeId, callId, providerCallId, mockTelephony }) {
  if (mockTelephony === true || isMockProviderCallId(providerCallId)) {
    return true;
  }
  if (!callId) {
    return false;
  }
  const { rows } = await runner.query(
    `SELECT provider_call_id
       FROM ai_telecalling_call_logs
      WHERE id = $1::uuid
        AND finance_id = $2::uuid
      LIMIT 1`,
    [callId, financeId]
  );
  return isMockProviderCallId(rows[0]?.provider_call_id);
}

/**
 * 1. `POST /api/internal/voice-ai/calls/status`
 * Updates live call lifecycle status (`initiating`/`initiated`, `ringing`, `in_progress`, `failed`, etc.)
 * enforcing Amendment A6 forward-only progression and immutable terminal states.
 */
async function updateInternalCallStatus(payload = {}, opts = {}) {
  const runner = opts.queryRunner || db;
  const financeId = assertUuid(payload.finance_id || payload.financeId, 'finance_id');
  const callId = assertUuid(payload.call_id || payload.callId, 'call_id');
  const customerId = assertUuid(payload.customer_id || payload.customerId, 'customer_id');

  const rawLifecycleInput = String(
    payload.call_lifecycle_status || payload.callLifecycleStatus || ''
  )
    .trim()
    .toLowerCase();

  const lifecycleStatus = toDbLifecycleStatus(rawLifecycleInput);

  const { rows: currentRows } = await runner.query(
    `SELECT id::text AS call_id,
            lead_id::text AS lead_id,
            call_lifecycle_status,
            call_status::text AS call_status,
            answered,
            customer_spoke,
            disposition,
            provider_call_id
       FROM ai_telecalling_call_logs
      WHERE id = $1::uuid
        AND finance_id = $2::uuid
        AND customer_id = $3::uuid
      FOR UPDATE`,
    [callId, financeId, customerId]
  );

  if (currentRows.length === 0) {
    throw createHttpError(404, 'Call log not found for tenant and customer', 'call_not_found');
  }

  const current = currentRows[0];
  const transition = validateLifecycleTransition(current.call_lifecycle_status, rawLifecycleInput, {
    currentDisposition: current.disposition,
  });

  if (!transition.allowed) {
    const mappedCurrent = fromDbCallRowToDomainState(current);
    return {
      callId: current.call_id,
      leadId: current.lead_id || null,
      callLifecycleStatus: mappedCurrent.transportLifecycleStatus,
      callDisplayState: mappedCurrent.domainState,
      ignoredTransition: true,
      ignoreReason: transition.reason,
      answered: Boolean(current.answered),
      customerSpoke: Boolean(current.customer_spoke),
    };
  }

  const providerCallId = payload.provider_call_id
    ? String(payload.provider_call_id).trim().slice(0, 120)
    : null;
  const answered = typeof payload.answered === 'boolean' ? payload.answered : null;
  const customerSpoke =
    typeof payload.customer_spoke === 'boolean' ? payload.customer_spoke : null;
  const owningWorkerId = payload.owning_worker_id
    ? String(payload.owning_worker_id).trim().slice(0, 100)
    : null;
  const errorDetail = payload.error_detail
    ? String(payload.error_detail).slice(0, 1000)
    : null;
  const transcriptJson =
    Array.isArray(payload.transcript) && payload.transcript.length > 0
      ? JSON.stringify(payload.transcript)
      : null;

  const effectiveAnswered = answered !== null ? answered : Boolean(current.answered);
  const effectiveSpoke = customerSpoke !== null ? customerSpoke : Boolean(current.customer_spoke);
  const mappedCallEnum = toLeadCallStatusEnum(rawLifecycleInput, {
    answered: effectiveAnswered,
    customerSpoke: effectiveSpoke,
  });

  const { rows } = await runner.query(
    `UPDATE ai_telecalling_call_logs
        SET call_lifecycle_status = $4,
            call_status = $5::lead_call_status_enum,
            provider_call_id = CASE WHEN provider_call_id LIKE 'mock-%' THEN provider_call_id ELSE COALESCE($6, provider_call_id) END,
            answered = COALESCE($7, answered),
            customer_spoke = COALESCE($8, customer_spoke),
            owning_worker_id = COALESCE($9, owning_worker_id),
            error_detail = COALESCE($10, error_detail),
            transcript = COALESCE($11::jsonb, transcript),
            disposition = CASE
              WHEN disposition = 'needs_reconcile' THEN NULL
              ELSE disposition
            END,
            ended_at = CASE
              WHEN $4 IN ('completed', 'failed', 'cancelled') THEN COALESCE(ended_at, CURRENT_TIMESTAMP)
              ELSE ended_at
            END
      WHERE id = $1::uuid
        AND finance_id = $2::uuid
        AND customer_id = $3::uuid
      RETURNING id::text AS call_id,
                lead_id::text AS lead_id,
                call_lifecycle_status,
                call_status::text AS call_status,
                disposition,
                error_detail,
                answered,
                customer_spoke`,
    [
      callId,
      financeId,
      customerId,
      lifecycleStatus,
      mappedCallEnum,
      providerCallId,
      answered,
      customerSpoke,
      owningWorkerId,
      errorDetail,
      transcriptJson,
    ]
  );

  if (rows.length === 0) {
    throw createHttpError(404, 'Call log not found for tenant and customer', 'call_not_found');
  }

  const updated = rows[0];
  if (updated.lead_id) {
    await runner.query(
      `UPDATE ai_telecalling_leads
          SET call_status = $3::lead_call_status_enum,
              locked_by = CASE WHEN $4 THEN NULL ELSE locked_by END,
              lock_expires_at = CASE WHEN $4 THEN NULL ELSE lock_expires_at END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
          AND finance_id = $2::uuid`,
      [
        updated.lead_id,
        financeId,
        mappedCallEnum,
        TERMINAL_DB_STATUSES.has(lifecycleStatus),
      ]
    );
  }

  const mappedUpdated = fromDbCallRowToDomainState(updated);
  return {
    callId: updated.call_id,
    leadId: updated.lead_id || null,
    callLifecycleStatus: mappedUpdated.transportLifecycleStatus,
    callDisplayState: mappedUpdated.domainState,
    ignoredTransition: false,
    answered: Boolean(updated.answered),
    customerSpoke: Boolean(updated.customer_spoke),
  };
}

/**
 * 2. `POST /api/internal/voice-ai/tools/schedule-callback`
 * Situation A ONLY: Customer asked for a callback or is momentarily busy.
 * Writes strictly to `voice_callbacks` + `ai_telecalling_leads`. NEVER writes DNC suppressions.
 */
async function recordInternalScheduleCallback(payload = {}, opts = {}) {
  const runner = opts.queryRunner || db;
  const financeId = assertUuid(payload.finance_id || payload.financeId, 'finance_id');
  const customerId = assertUuid(payload.customer_id || payload.customerId, 'customer_id');
  const loanId = optionalUuid(payload.loan_id || payload.loanId, 'loan_id');
  const callId = optionalUuid(payload.call_id || payload.callId, 'call_id');

  const scheduledRaw = String(payload.scheduled_at || payload.scheduledAt || '').trim();
  const scheduledDate = new Date(scheduledRaw);
  if (!scheduledRaw || Number.isNaN(scheduledDate.getTime())) {
    throw createHttpError(400, 'scheduled_at must be a valid ISO-8601 timestamp', 'invalid_scheduled_at');
  }

  const cust = await assertTenantCustomerOwnership(runner, financeId, customerId);
  const rawSource = String(payload.source || 'customer_voice_request').trim();
  const source = VALID_CALLBACK_SOURCES.has(rawSource) ? rawSource : 'customer_voice_request';

  // Amendment A4: Mock calls must NEVER create real follow-up callbacks
  const isMock = await isMockCallContext(runner, {
    financeId,
    callId,
    providerCallId: payload.provider_call_id,
    mockTelephony: payload.mock_telephony,
  });
  if (isMock) {
    return {
      callbackId: null,
      scheduledAt: scheduledDate.toISOString(),
      source,
      mockIsolated: true,
    };
  }

  const note = payload.customer_note ? String(payload.customer_note).slice(0, 300) : null;
  const timezone = String(payload.timezone || 'Asia/Kolkata').slice(0, 40);
  const phoneE164 = payload.phone_e164
    ? String(payload.phone_e164).trim().slice(0, 20)
    : cust.phone_e164 || null;
  const idempotencyKey = String(
    payload.idempotency_key || `cbk:${financeId}:${customerId}:${scheduledDate.toISOString()}`
  ).slice(0, 120);

  // Supersede any open callback for this customer before inserting (respects `uq_vcbk_one_active`)
  await runner.query(
    `UPDATE voice_callbacks
        SET callback_status = 'superseded',
            updated_at = NOW()
      WHERE finance_id = $1::uuid
        AND customer_id = $2::uuid
        AND callback_status IN ('scheduled', 'claimed', 'dialing')
        AND idempotency_key IS DISTINCT FROM $3`,
    [financeId, customerId, idempotencyKey]
  );

  const { rows: cbRows } = await runner.query(
    `INSERT INTO voice_callbacks (
        finance_id, customer_id, loan_id, call_id, phone_e164,
        scheduled_at, timezone, callback_status, source, customer_note, idempotency_key
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::timestamptz, $7, 'scheduled', $8, $9, $10)
     ON CONFLICT (finance_id, idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET scheduled_at = EXCLUDED.scheduled_at,
                   customer_note = COALESCE(EXCLUDED.customer_note, voice_callbacks.customer_note),
                   updated_at = NOW()
     RETURNING id::text AS callback_id, scheduled_at`,
    [
      financeId,
      customerId,
      loanId,
      callId,
      phoneE164,
      scheduledDate.toISOString(),
      timezone,
      source,
      note,
      idempotencyKey,
    ]
  );

  await runner.query(
    `UPDATE ai_telecalling_leads
        SET call_status = 'scheduled',
            scheduled_time = ($3::timestamptz AT TIME ZONE 'Asia/Kolkata'),
            callback_requested = TRUE,
            updated_at = CURRENT_TIMESTAMP
      WHERE finance_id = $1::uuid
        AND customer_id = $2::uuid`,
    [financeId, customerId, scheduledDate.toISOString()]
  );

  return {
    callbackId: cbRows[0]?.callback_id || null,
    scheduledAt: scheduledDate.toISOString(),
    source,
  };
}

/**
 * 3. `POST /api/internal/voice-ai/tools/promise-to-pay`
 * Situation B: Customer committed to pay a concrete amount by a date.
 * Writes `promise_to_pay` + `voice_outbox_events` idempotently.
 */
async function recordInternalPromiseToPay(payload = {}, opts = {}) {
  const runner = opts.queryRunner || db;
  const financeId = assertUuid(payload.finance_id || payload.financeId, 'finance_id');
  const customerId = assertUuid(payload.customer_id || payload.customerId, 'customer_id');
  const loanId = optionalUuid(payload.loan_id || payload.loanId, 'loan_id');
  const callId = optionalUuid(payload.call_id || payload.callId, 'call_id');

  const promisedAmount = Number(payload.promised_amount ?? payload.promisedAmount);
  if (!Number.isFinite(promisedAmount) || promisedAmount <= 0) {
    throw createHttpError(400, 'promised_amount must be a positive number', 'invalid_promised_amount');
  }

  const promisedDate = String(payload.promised_date || payload.promisedDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(promisedDate)) {
    throw createHttpError(400, 'promised_date must be YYYY-MM-DD', 'invalid_promised_date');
  }

  await assertTenantCustomerOwnership(runner, financeId, customerId);

  // Amendment A4: Mock calls must NEVER create real Promise-to-Pay commitments
  const isMock = await isMockCallContext(runner, {
    financeId,
    callId,
    providerCallId: payload.provider_call_id,
    mockTelephony: payload.mock_telephony,
  });
  if (isMock) {
    return {
      ptpId: null,
      promisedAmount,
      promisedDate,
      mockIsolated: true,
    };
  }

  const promisedTimeText = payload.promised_time_text
    ? String(payload.promised_time_text).slice(0, 80)
    : null;
  const isPartialPayment = Boolean(payload.is_partial_payment ?? payload.isPartialPayment ?? false);
  const reason = String(payload.reason || 'Promised via Voice AI').slice(0, 255);
  const note = payload.note ? String(payload.note).slice(0, 500) : null;
  const policyVersion = payload.policy_version != null ? Number(payload.policy_version) : 1;
  const idempotencyKey = String(
    payload.idempotency_key || `ptp:${financeId}:${customerId}:${promisedDate}:${promisedAmount}`
  ).slice(0, 120);

  const { rows: ptpRows } = await runner.query(
    `INSERT INTO promise_to_pay (
        finance_id, customer_id, loan_id, call_log_id,
        promised_amount, promised_date, promised_time_text, is_partial_payment,
        ptp_status, reason, note, policy_version, idempotency_key,
        created_at, updated_at
     ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid,
        $5, $6::date, $7, $8,
        'pending', $9, $10, $11, $12,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )
     ON CONFLICT (finance_id, idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET promised_amount = EXCLUDED.promised_amount,
                   promised_date = EXCLUDED.promised_date,
                   updated_at = CURRENT_TIMESTAMP
     RETURNING id::text AS ptp_id`,
    [
      financeId,
      customerId,
      loanId,
      callId,
      promisedAmount,
      promisedDate,
      promisedTimeText,
      isPartialPayment,
      reason,
      note,
      policyVersion,
      idempotencyKey,
    ]
  );

  const ptpId = ptpRows[0]?.ptp_id;

  await runner.query(
    `INSERT INTO voice_outbox_events (
        finance_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
     ) VALUES (
        $1::uuid, 'promise_to_pay', $2::uuid, 'voice.ptp.recorded', $3::jsonb, $4
     )
     ON CONFLICT (finance_id, idempotency_key) DO NOTHING`,
    [
      financeId,
      ptpId,
      JSON.stringify({
        ptp_id: ptpId,
        customer_id: customerId,
        loan_id: loanId,
        call_id: callId,
        promised_amount: promisedAmount,
        promised_date: promisedDate,
      }),
      `outbox:${idempotencyKey}`.slice(0, 140),
    ]
  );

  return {
    ptpId,
    promisedAmount,
    promisedDate,
  };
}

/**
 * 4. `POST /api/internal/voice-ai/tools/privacy-optout`
 * Situation C: Strictly separates biometric voiceprint erasure vs automated DNC suppression:
 *   - `biometric_erase_only`: erases `voice_speaker_profiles.embedding`, keeps phone callable.
 *   - `dnc_only`: inserts `voice_contact_suppressions` (`status = 'active'`), suppressing calls.
 *   - `dnc_and_biometric_erase`: executes both.
 */
async function recordInternalPrivacyOptOut(payload = {}, opts = {}) {
  const runner = opts.queryRunner || db;
  const financeId = assertUuid(payload.finance_id || payload.financeId, 'finance_id');
  const customerId = assertUuid(payload.customer_id || payload.customerId, 'customer_id');
  const callId = optionalUuid(payload.call_id || payload.callId, 'call_id');

  const actionType = String(payload.action_type || payload.actionType || 'dnc_only')
    .trim()
    .toLowerCase();
  if (!['biometric_erase_only', 'dnc_only', 'dnc_and_biometric_erase'].includes(actionType)) {
    throw createHttpError(
      400,
      'action_type must be biometric_erase_only, dnc_only, or dnc_and_biometric_erase',
      'invalid_action_type'
    );
  }

  const cust = await assertTenantCustomerOwnership(runner, financeId, customerId);

  // Amendment A4: Mock calls must NEVER erase voiceprints or write active DNC suppressions
  const isMock = await isMockCallContext(runner, {
    financeId,
    callId,
    providerCallId: payload.provider_call_id,
    mockTelephony: payload.mock_telephony,
  });
  if (isMock) {
    return {
      actionType,
      biometricErased: false,
      suppressionId: null,
      mockIsolated: true,
    };
  }

  let biometricErased = false;
  let suppressionId = null;

  if (actionType === 'biometric_erase_only' || actionType === 'dnc_and_biometric_erase') {
    await runner.query(
      `UPDATE voice_speaker_profiles
          SET embedding = NULL,
              consent_status = 'revoked',
              revoked_at = NOW(),
              status = 'erased',
              updated_at = NOW()
        WHERE finance_id = $1::uuid
          AND customer_id = $2::uuid`,
      [financeId, customerId]
    );
    biometricErased = true;
  }

  if (actionType === 'dnc_only' || actionType === 'dnc_and_biometric_erase') {
    const phoneE164 = String(payload.phone_e164 || cust.phone_e164 || '').trim();
    if (!phoneE164) {
      throw createHttpError(
        400,
        'phone_e164 is required for DNC suppression when customer has no normalized phone',
        'missing_phone_e164'
      );
    }

    const rawChannel = String(payload.channel || 'ai_voice_calls').trim();
    const channel = ['ai_voice_calls', 'whatsapp_qr', 'all_automated'].includes(rawChannel)
      ? rawChannel
      : 'ai_voice_calls';
    const rawSource = String(payload.suppression_source || 'customer_explicit_opt_out').trim();
    const suppressionSource = [
      'customer_explicit_opt_out',
      'wrong_number',
      'regulatory_dnc',
      'admin_manual',
      'legal_hold',
    ].includes(rawSource)
      ? rawSource
      : 'customer_explicit_opt_out';
    const reasonExcerpt = payload.reason_excerpt
      ? String(payload.reason_excerpt).slice(0, 320)
      : null;
    const idempotencyKey = String(
      payload.idempotency_key || `supp:${financeId}:${customerId}:${phoneE164}:${channel}`
    ).slice(0, 120);

    const { rows: supRows } = await runner.query(
      `INSERT INTO voice_contact_suppressions (
          finance_id, customer_id, phone_e164, channel, status,
          suppression_source, reason_excerpt, source_call_id, idempotency_key
       ) VALUES (
          $1::uuid, $2::uuid, $3, $4, 'active',
          $5, $6, $7::uuid, $8
       )
       ON CONFLICT (finance_id, phone_e164, channel) WHERE status = 'active'
       DO UPDATE SET reason_excerpt = COALESCE(EXCLUDED.reason_excerpt, voice_contact_suppressions.reason_excerpt),
                     updated_at = NOW()
       RETURNING id::text AS suppression_id`,
      [
        financeId,
        customerId,
        phoneE164,
        channel,
        suppressionSource,
        reasonExcerpt,
        callId,
        idempotencyKey,
      ]
    );
    suppressionId = supRows[0]?.suppression_id || null;
  }

  return {
    actionType,
    biometricErased,
    suppressionId,
  };
}

/**
 * 5. `POST /api/internal/voice-ai/tools/escalation`
 * Emits a tenant-scoped human escalation event into `voice_outbox_events`.
 */
async function recordInternalEscalation(payload = {}, opts = {}) {
  const runner = opts.queryRunner || db;
  const financeId = assertUuid(payload.finance_id || payload.financeId, 'finance_id');
  const customerId = assertUuid(payload.customer_id || payload.customerId, 'customer_id');
  const loanId = optionalUuid(payload.loan_id || payload.loanId, 'loan_id');
  const callId = optionalUuid(payload.call_id || payload.callId, 'call_id');

  const reason = String(payload.reason || '').trim().slice(0, 240);
  if (!reason) {
    throw createHttpError(400, 'reason is required for escalation', 'missing_reason');
  }

  await assertTenantCustomerOwnership(runner, financeId, customerId);

  const severity = ['low', 'normal', 'high', 'critical'].includes(String(payload.severity || ''))
    ? String(payload.severity)
    : 'high';
  const notes = payload.notes ? String(payload.notes).slice(0, 600) : null;
  const aggregateId = callId || customerId;
  const idempotencyKey = String(
    payload.idempotency_key || `esc:${financeId}:${aggregateId}:${reason.slice(0, 40)}`
  ).slice(0, 140);

  const { rows } = await runner.query(
    `INSERT INTO voice_outbox_events (
        finance_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
     ) VALUES (
        $1::uuid, 'escalation', $2::uuid, 'voice.call.escalated', $3::jsonb, $4
     )
     ON CONFLICT (finance_id, idempotency_key)
     DO UPDATE SET payload = EXCLUDED.payload
     RETURNING id::text AS event_id`,
    [
      financeId,
      aggregateId,
      JSON.stringify({
        customer_id: customerId,
        loan_id: loanId,
        call_id: callId,
        reason,
        severity,
        notes,
      }),
      idempotencyKey,
    ]
  );

  return {
    escalationEventId: rows[0]?.event_id || null,
    severity,
  };
}

/**
 * 6. `POST /api/internal/voice-ai/calls/complete`
 * Atomically finalizes a Voice AI call via `public.fn_complete_voice_call` (52 parameters),
 * validating any S3 recording key against `voice-recordings/{finance_id}/...` first,
 * and preserving the pre-created `call_id` row by syncing `provider_call_id`.
 */
async function completeInternalVoiceCall(payload = {}, opts = {}) {
  const runner = opts.queryRunner || db;
  const financeId = assertUuid(payload.finance_id || payload.financeId, 'finance_id');
  const customerId = assertUuid(payload.customer_id || payload.customerId, 'customer_id');
  const callId = optionalUuid(payload.call_id || payload.callId, 'call_id');
  let leadId = optionalUuid(payload.lead_id || payload.leadId, 'lead_id');

  // Strict S3 recording prefix & tenant isolation validation
  let recordingS3Key = null;
  if (payload.recording_s3_key != null && String(payload.recording_s3_key).trim() !== '') {
    const keyCheck = validateRecordingS3Key(payload.recording_s3_key, financeId);
    if (!keyCheck.valid) {
      throw createHttpError(
        400,
        `Rejected recording_s3_key: ${keyCheck.reason}`,
        keyCheck.reason
      );
    }
    recordingS3Key = keyCheck.key;
  }

  let syncedProviderCallId = payload.provider_call_id
    ? String(payload.provider_call_id).trim().slice(0, 120)
    : null;

  // Sync `provider_call_id` on the initiated `ai_telecalling_call_logs` row so `fn_complete_voice_call`
  // updates the exact `call_id` row in-place rather than inserting a second row.
  let existingLifecycleStatus = null;
  let existingDisposition = null;
  if (callId) {
    const fallbackProviderId = syncedProviderCallId || `af-call-${callId}`;
    const { rows: logRows } = await runner.query(
      `UPDATE ai_telecalling_call_logs
          SET provider_call_id = CASE WHEN provider_call_id LIKE 'mock-%' THEN provider_call_id ELSE COALESCE(provider_call_id, $4) END
        WHERE id = $1::uuid
          AND finance_id = $2::uuid
          AND customer_id = $3::uuid
        RETURNING provider_call_id, lead_id::text AS lead_id, call_lifecycle_status, disposition`,
      [callId, financeId, customerId, fallbackProviderId]
    );
    if (logRows.length > 0) {
      syncedProviderCallId = logRows[0].provider_call_id;
      existingLifecycleStatus = logRows[0].call_lifecycle_status || null;
      existingDisposition = logRows[0].disposition || null;
      if (!leadId && logRows[0].lead_id) {
        leadId = logRows[0].lead_id;
      }
    }
  }

  const requestedLifecycle = payload.call_lifecycle_status
    ? toDbLifecycleStatus(payload.call_lifecycle_status)
    : 'completed';

  if (existingLifecycleStatus && TERMINAL_DB_STATUSES.has(String(existingLifecycleStatus).toLowerCase())) {
    const transition = validateLifecycleTransition(existingLifecycleStatus, requestedLifecycle, {
      currentDisposition: existingDisposition,
    });
    if (!transition.allowed && !transition.idempotentNoop) {
      return {
        status: 'ignored_terminal_immutable',
        call_log_id: callId,
        call_lifecycle_status: existingLifecycleStatus,
      };
    }
  }

  if (!leadId) {
    const { rows: leadRows } = await runner.query(
      `SELECT id::text AS lead_id
         FROM ai_telecalling_leads
        WHERE finance_id = $1::uuid
          AND customer_id = $2::uuid
        LIMIT 1`,
      [financeId, customerId]
    );
    if (leadRows.length === 0) {
      throw createHttpError(
        404,
        'Telecalling lead not found for finance_id and customer_id',
        'lead_not_found'
      );
    }
    leadId = leadRows[0].lead_id;
  } else {
    const { rows: verifyLead } = await runner.query(
      `SELECT id::text AS lead_id
         FROM ai_telecalling_leads
        WHERE id = $1::uuid
          AND finance_id = $2::uuid
          AND customer_id = $3::uuid
        LIMIT 1`,
      [leadId, financeId, customerId]
    );
    if (verifyLead.length === 0) {
      throw createHttpError(
        404,
        'lead_id does not belong to specified finance_id and customer_id',
        'lead_tenant_mismatch'
      );
    }
  }

  if (!syncedProviderCallId) {
    syncedProviderCallId = `af-call-${callId || crypto.randomUUID()}`;
  }

  // Amendment A4: Strict Mock Isolation — mock calls (`mock-*` or `mock_telephony: true`)
  // finalize `ai_telecalling_call_logs` ONLY and NEVER feed L2 summaries, L3 memory, PTPs, callbacks, or DNC!
  const isMockCall = isMockProviderCallId(syncedProviderCallId) || payload.mock_telephony === true;

  const rawCallStatus = String(payload.call_status || 'completed').trim().toLowerCase();
  const callStatus = VALID_CALL_STATUS_ENUM.has(rawCallStatus) ? rawCallStatus : 'completed';
  const durationSeconds = Math.max(0, Math.round(Number(payload.duration_seconds || 0)));
  const languageUsed = String(payload.language_used || 'ta-IN').slice(0, 16);
  const rawSentiment = String(payload.sentiment || 'neutral').trim().toLowerCase();
  const sentiment = VALID_SENTIMENTS.has(rawSentiment) ? rawSentiment : 'neutral';
  const identityVerified = isMockCall ? false : Boolean(payload.identity_verified ?? false);
  const transcript = Array.isArray(payload.transcript) ? payload.transcript : [];
  const rawDisposition = payload.disposition ? String(payload.disposition).slice(0, 60) : null;
  const disposition =
    isMockCall && (rawDisposition === 'opt_out' || rawDisposition === 'wrong_number')
      ? 'mock_simulated'
      : rawDisposition;
  const outcomeNote = payload.outcome_note ? String(payload.outcome_note).slice(0, 2000) : null;

  const memoryTokens = Math.max(0, Math.round(Number(payload.memory_tokens || 0)));
  const promptTokens = Math.max(0, Math.round(Number(payload.prompt_tokens || 0)));
  const completionTokens = Math.max(0, Math.round(Number(payload.completion_tokens || 0)));
  const summaryTokens = Math.max(0, Math.round(Number(payload.summary_tokens || 0)));
  const totalTokens = Math.max(
    Math.round(Number(payload.total_tokens || 0)),
    memoryTokens + promptTokens + completionTokens + summaryTokens
  );
  const ttsCharacters = Math.max(0, Math.round(Number(payload.tts_characters || 0)));
  const sttSeconds = Math.max(0, Number(payload.stt_seconds || 0));
  const llmModel = payload.llm_model ? String(payload.llm_model).slice(0, 80) : null;
  const ttsModel = String(payload.tts_model || 'bulbul:v4').slice(0, 80);
  const sttModel = payload.stt_model ? String(payload.stt_model).slice(0, 80) : null;

  const params = [
    leadId, // $1 p_lead_id
    syncedProviderCallId, // $2 p_provider_call_id
    callStatus, // $3 p_call_status
    durationSeconds, // $4 p_duration_seconds
    languageUsed, // $5 p_language_used
    sentiment, // $6 p_sentiment
    identityVerified, // $7 p_identity_verified
    JSON.stringify(transcript), // $8 p_transcript
    disposition, // $9 p_disposition
    outcomeNote, // $10 p_outcome_note
    payload.audio_url ? String(payload.audio_url).slice(0, 500) : null, // $11 p_audio_url
    isMockCall ? null : payload.summary_short ? String(payload.summary_short).slice(0, 320) : null, // $12 p_summary_short
    isMockCall ? null : payload.stated_reason ? String(payload.stated_reason).slice(0, 200) : null, // $13 p_stated_reason
    isMockCall ? null : payload.commitment_summary ? String(payload.commitment_summary).slice(0, 200) : null, // $14 p_commitment_summary
    payload.observable_tone ? String(payload.observable_tone).slice(0, 24) : 'calm', // $15 p_observable_tone
    JSON.stringify(isMockCall ? {} : payload.stated_facts || {}), // $16 p_stated_facts
    JSON.stringify(isMockCall ? {} : payload.ai_inferences || {}), // $17 p_ai_inferences
    summaryTokens, // $18 p_summary_tokens
    isMockCall ? null : payload.rolling_summary ? String(payload.rolling_summary).slice(0, 600) : null, // $19 p_rolling_summary
    isMockCall ? null : payload.communication_style ? String(payload.communication_style).slice(0, 200) : null, // $20 p_communication_style
    isMockCall ? null : payload.preferred_call_time ? String(payload.preferred_call_time).slice(0, 80) : null, // $21 p_preferred_call_time
    isMockCall ? null : typeof payload.language_confirmed === 'boolean' ? payload.language_confirmed : null, // $22 p_language_confirmed
    isMockCall ? null : payload.recent_interaction_digest ? String(payload.recent_interaction_digest).slice(0, 320) : null, // $23 p_recent_interaction_digest
    isMockCall ? false : Boolean(payload.explicit_opt_out ?? false), // $24 p_explicit_opt_out
    isMockCall ? null : payload.opt_out_excerpt ? String(payload.opt_out_excerpt).slice(0, 320) : null, // $25 p_opt_out_excerpt
    isMockCall ? null : payload.promised_amount != null ? Number(payload.promised_amount) : null, // $26 p_promised_amount
    isMockCall ? null : payload.promised_date || null, // $27 p_promised_date
    isMockCall ? null : payload.promised_time_text ? String(payload.promised_time_text).slice(0, 80) : null, // $28 p_promised_time_text
    isMockCall ? null : payload.callback_at || null, // $29 p_callback_at
    payload.observation ? JSON.stringify(payload.observation) : null, // $30 p_observation
    payload.config_version != null ? Number(payload.config_version) : null, // $31 p_config_version
    payload.policy_version != null ? Number(payload.policy_version) : null, // $32 p_policy_version
    memoryTokens, // $33 p_memory_tokens
    promptTokens, // $34 p_prompt_tokens
    completionTokens, // $35 p_completion_tokens
    payload.greeting_latency_ms != null ? Math.round(Number(payload.greeting_latency_ms)) : null, // $36 p_greeting_latency_ms
    payload.turn_latency_p50_ms != null ? Math.round(Number(payload.turn_latency_p50_ms)) : null, // $37 p_turn_latency_p50_ms
    Math.max(0, Math.round(Number(payload.barge_in_count || 0))), // $38 p_barge_in_count
    requestedLifecycle, // $39 p_call_lifecycle_status
    typeof payload.answered === 'boolean' ? payload.answered : null, // $40 p_answered
    typeof payload.customer_spoke === 'boolean' ? payload.customer_spoke : null, // $41 p_customer_spoke
    recordingS3Key, // $42 p_recording_s3_key
    payload.recording_status ? String(payload.recording_status).slice(0, 24) : null, // $43 p_recording_status
    payload.recording_duration_seconds != null
      ? Math.max(0, Math.round(Number(payload.recording_duration_seconds)))
      : null, // $44 p_recording_duration_seconds
    payload.recording_size_bytes != null
      ? Math.max(0, Math.round(Number(payload.recording_size_bytes)))
      : null, // $45 p_recording_size_bytes
    payload.error_detail ? String(payload.error_detail).slice(0, 1000) : null, // $46 p_error_detail
    totalTokens, // $47 p_total_tokens
    ttsCharacters, // $48 p_tts_characters
    sttSeconds, // $49 p_stt_seconds
    llmModel, // $50 p_llm_model
    ttsModel, // $51 p_tts_model
    sttModel, // $52 p_stt_model
  ];

  const { rows } = await runner.query(
    `SELECT public.fn_complete_voice_call(
        $1::uuid,
        $2::varchar,
        $3::lead_call_status_enum,
        $4::int,
        $5::varchar,
        $6::ai_sentiment_enum,
        $7::boolean,
        $8::jsonb,
        $9::varchar,
        $10::text,
        $11::varchar,
        $12::varchar,
        $13::varchar,
        $14::varchar,
        $15::varchar,
        $16::jsonb,
        $17::jsonb,
        $18::int,
        $19::text,
        $20::varchar,
        $21::varchar,
        $22::boolean,
        $23::varchar,
        $24::boolean,
        $25::varchar,
        $26::numeric,
        $27::date,
        $28::varchar,
        $29::timestamptz,
        $30::jsonb,
        $31::bigint,
        $32::int,
        $33::int,
        $34::int,
        $35::int,
        $36::int,
        $37::int,
        $38::int,
        $39::varchar,
        $40::boolean,
        $41::boolean,
        $42::varchar,
        $43::varchar,
        $44::int,
        $45::bigint,
        $46::text,
        $47::int,
        $48::int,
        $49::numeric,
        $50::varchar,
        $51::varchar,
        $52::varchar
     ) AS result`,
    params
  );

  const fnResult = rows[0]?.result || {};
  if (fnResult.status === 'error') {
    throw createHttpError(404, fnResult.message || 'Failed to complete call', 'complete_call_failed');
  }

  return fnResult;
}

module.exports = {
  updateInternalCallStatus,
  recordInternalScheduleCallback,
  recordInternalPromiseToPay,
  recordInternalPrivacyOptOut,
  recordInternalEscalation,
  completeInternalVoiceCall,
};


'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const FINANCE_A = '01a14ed2-5df9-7175-839b-3cbaca84f231';
const CUSTOMER_1 = 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111';
const CUSTOMER_2 = 'aaaaaaaa-bbbb-4ccc-8ddd-222222222222';
const LOAN_1 = 'bbbbbbbb-cccc-4ddd-8eee-111111111111';
const LEAD_1 = 'cccccccc-dddd-4eee-8fff-111111111111';
const CALL_1 = 'dddddddd-eeee-4fff-8000-111111111111';
const CALL_2 = 'dddddddd-eeee-4fff-8000-222222222222';
const ALLOWED_PHONE = '+919000001002';
const NON_ALLOWED_PHONE = '+919888887777';

function createMockExpressRes() {
  const headers = new Map();
  return {
    statusCode: 200,
    headers,
    jsonBody: null,
    setHeader(k, v) {
      headers.set(String(k).toLowerCase(), String(v));
      return this;
    },
    set(k, v) {
      return this.setHeader(k, v);
    },
    getHeader(k) {
      return headers.get(String(k).toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

/**
 * Stateful in-memory PostgreSQL queryRunner simulating `owner_features`,
 * `fn_check_voice_call_eligibility`, `ai_telecalling_leads`, `ai_telecalling_call_logs`,
 * and `voice_outbox_events` with real unique constraint semantics (`uq_atcl_finance_idem`, `uq_voe_finance_idem`).
 */
function createStatefulCallRunner(opts = {}) {
  const entitled = opts.entitled !== undefined ? Boolean(opts.entitled) : true;
  const phoneE164 = opts.phoneE164 || ALLOWED_PHONE;
  const sqlHistory = [];
  const callLogsById = new Map();
  const leadsByCustomer = new Map();
  const outboxRows = [];
  let seq = 1;

  const runner = {
    sqlHistory,
    callLogsById,
    leadsByCustomer,
    outboxRows,
    nowMs: Date.now(),

    async query(sql, params = []) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      sqlHistory.push({ sql: norm, params });

      // 0. Guard against latent bug: ai_telecalling_leads has NO `due_amount` column in live PostgreSQL!
      if (norm.includes('INSERT INTO ai_telecalling_leads') && /\bdue_amount\b/i.test(norm)) {
        const err = new Error('column "due_amount" of relation "ai_telecalling_leads" does not exist');
        err.code = '42703';
        throw err;
      }

      // 1. owner_features entitlement check (A5)
      if (norm.includes('owner_features') && norm.includes('ai_voice_agent')) {
        return {
          rows: [
            {
              owner_id: '01a14ed2-5c6e-79f3-b85f-29b6a3356c19',
              entitled,
            },
          ],
        };
      }

      // 2. Idempotency lookup on ai_telecalling_call_logs
      if (
        norm.includes('FROM ai_telecalling_call_logs') &&
        norm.includes('idempotency_key = $2') &&
        norm.startsWith('SELECT')
      ) {
        const [fid, idemKey] = params;
        for (const row of callLogsById.values()) {
          if (row.finance_id === fid && row.idempotency_key === idemKey) {
            return { rows: [{ ...row }] };
          }
        }
        return { rows: [] };
      }

      // 3. Active call guard on ai_telecalling_call_logs (A3)
      if (
        norm.includes('FROM ai_telecalling_call_logs') &&
        norm.includes("call_lifecycle_status IN ('initiated', 'queued', 'ringing', 'in_progress')") &&
        norm.startsWith('SELECT')
      ) {
        const [fid, cid] = params;
        for (const row of callLogsById.values()) {
          if (
            row.finance_id === fid &&
            row.customer_id === cid &&
            ['initiated', 'queued', 'ringing', 'in_progress'].includes(row.call_lifecycle_status)
          ) {
            return { rows: [{ call_id: row.call_id, call_lifecycle_status: row.call_lifecycle_status }] };
          }
        }
        return { rows: [] };
      }

      // 4. fn_check_voice_call_eligibility (mirrors real SQL filter `call_lifecycle_status <> 'cancelled'`)
      if (norm.includes('fn_check_voice_call_eligibility')) {
        const [fid, cid] = params;
        const lead = leadsByCustomer.get(`${fid}:${cid}`);
        let activeCall = false;
        let logAttemptsToday = 0;
        let lastAttemptAt = null;

        for (const row of callLogsById.values()) {
          if (row.finance_id === fid && row.customer_id === cid) {
            if (['initiated', 'queued', 'ringing', 'in_progress'].includes(row.call_lifecycle_status)) {
              activeCall = true;
            }
            if (row.call_lifecycle_status !== 'cancelled') {
              logAttemptsToday += 1;
              lastAttemptAt = row.ended_at || row.started_at;
            }
          }
        }

        if (activeCall || (lead && ['connecting', 'speaking'].includes(lead.call_status))) {
          return {
            rows: [
              {
                eligibility: {
                  eligible: false,
                  reason_code: 'call_already_in_progress',
                  message: 'A call is already active for this customer.',
                },
              },
            ],
          };
        }

        const effectiveAttempts = Math.max(logAttemptsToday, lead?.daily_attempt_count || 0);
        if (effectiveAttempts >= 2) {
          return {
            rows: [
              {
                eligibility: {
                  eligible: false,
                  reason_code: 'max_daily_attempts_reached',
                  message: 'Daily call attempt limit reached.',
                },
              },
            ],
          };
        }

        if (lastAttemptAt || lead?.last_call_at) {
          return {
            rows: [
              {
                eligibility: {
                  eligible: false,
                  reason_code: 'cooldown_active',
                  message: 'Attempt cooldown active.',
                  cooldown_remaining_seconds: 3600,
                },
              },
            ],
          };
        }

        return {
          rows: [
            {
              eligibility: {
                eligible: true,
                reason_code: 'ok',
                loan_id: LOAN_1,
                phone_e164: phoneE164,
                overdue_amount: 6500,
                days_overdue: 28,
                tts_model: 'bulbul:v4',
                stt_model: 'saaras:v4',
                llm_model: 'gpt-4o-mini',
              },
            },
          ],
        };
      }

      // 5. Financial rollup query (`WITH base_loans AS`)
      if (norm.includes('WITH base_loans AS')) {
        return { rows: [] };
      }

      // 6. Upsert ai_telecalling_leads
      if (norm.includes('INSERT INTO ai_telecalling_leads')) {
        const [fid, cid, loanId, phone, overdue, days] = params;
        const key = `${fid}:${cid}`;
        const existing = leadsByCustomer.get(key) || {
          lead_id: LEAD_1,
          finance_id: fid,
          customer_id: cid,
          attempt_count: 0,
          daily_attempt_count: 0,
          last_call_at: null,
          locked_by: null,
        };
        const updated = {
          ...existing,
          loan_id: loanId,
          phone_e164: phone,
          overdue_amount: overdue,
          days_overdue: days,
          call_status: 'connecting',
          // Check if query prematurely incremented attempt_count!
          attempt_count: norm.includes('attempt_count')
            ? existing.attempt_count + 1
            : existing.attempt_count,
          daily_attempt_count: norm.includes('daily_attempt_count')
            ? existing.daily_attempt_count + 1
            : existing.daily_attempt_count,
          last_call_at: norm.includes('last_call_at') ? new Date().toISOString() : existing.last_call_at,
        };
        leadsByCustomer.set(key, updated);
        return { rows: [{ lead_id: updated.lead_id }] };
      }

      // 7. Insert ai_telecalling_call_logs
      if (norm.includes('INSERT INTO ai_telecalling_call_logs')) {
        const [
          callId,
          leadId,
          fid,
          cid,
          loanId,
          providerCallId,
          phone,
          dueAmt,
          userId,
          ttsModel,
          sttModel,
          llmModel,
          idemKey,
        ] = params;

        if (idemKey) {
          for (const r of callLogsById.values()) {
            if (r.finance_id === fid && r.idempotency_key === idemKey) {
              const dup = new Error('duplicate key value violates unique constraint "uq_atcl_finance_idem"');
              dup.code = '23505';
              dup.constraint = 'uq_atcl_finance_idem';
              throw dup;
            }
          }
        }

        const lifecycleMatch = norm.match(/'(queued|initiated)'/);
        const initialLifecycle = lifecycleMatch ? lifecycleMatch[1] : 'initiated';

        const row = {
          call_id: callId,
          lead_id: leadId,
          finance_id: fid,
          customer_id: cid,
          loan_id: loanId,
          provider_call_id: providerCallId,
          phone_e164: phone,
          due_amount_at_call: dueAmt,
          called_by_user_id: userId,
          tts_model: ttsModel,
          stt_model: sttModel,
          llm_model: llmModel,
          idempotency_key: idemKey || null,
          call_status: 'connecting',
          call_lifecycle_status: initialLifecycle,
          answered: false,
          customer_spoke: false,
          disposition: null,
          error_detail: null,
          started_at: new Date().toISOString(),
          ended_at: null,
          transcript: [],
        };
        callLogsById.set(callId, row);
        return { rows: [row] };
      }

      // 8. Select call log for internal status update (`FOR UPDATE` or by id)
      if (
        norm.includes('FROM ai_telecalling_call_logs') &&
        norm.includes('WHERE id = $1::uuid') &&
        norm.startsWith('SELECT')
      ) {
        const [callId, fid, cid] = params;
        const row = callLogsById.get(callId);
        if (!row || row.finance_id !== fid || (cid && row.customer_id !== cid)) {
          return { rows: [] };
        }
        return { rows: [{ ...row }] };
      }

      // 9. Select call log for getCallStatusById (`FROM ai_telecalling_call_logs cl`)
      if (norm.includes('FROM ai_telecalling_call_logs cl') && norm.includes('WHERE cl.finance_id = $1::uuid')) {
        const [fid, callId] = params;
        const row = callLogsById.get(callId);
        if (!row || row.finance_id !== fid) return { rows: [] };
        return {
          rows: [
            {
              ...row,
              customer_name: 'Ramesh Kumar',
              hplno: 108,
              loan_status: 'active',
              vehicle_number: 'TN-09-AB-1234',
              vehicle_display: 'Honda Activa',
              duration_sec: 0,
              recording_status: 'not_recorded',
              recording_duration_sec: 0,
              recording_size_bytes: 0,
              sentiment: 'neutral',
              language_used: 'ta-IN',
            },
          ],
        };
      }

      // 10. Update ai_telecalling_call_logs
      if (norm.includes('UPDATE ai_telecalling_call_logs')) {
        const callId = params[0];
        const row = callLogsById.get(callId);
        if (!row) return { rows: [] };

        if (norm.includes("disposition = 'pre_dial_failed'")) {
          row.call_status = 'failed';
          row.call_lifecycle_status = 'cancelled';
          row.disposition = 'pre_dial_failed';
          row.error_detail = params[2];
          row.ended_at = new Date().toISOString();
        } else if (norm.includes("disposition = 'needs_reconcile'")) {
          row.call_status = 'connecting';
          row.call_lifecycle_status = 'initiated';
          row.disposition = 'needs_reconcile';
          row.error_detail = params[2];
        } else if (norm.includes('SET call_lifecycle_status = $4')) {
          row.call_lifecycle_status = params[3];
          row.call_status = params[4];
          if (params[5]) row.provider_call_id = params[5];
          if (typeof params[6] === 'boolean') row.answered = params[6];
          if (typeof params[7] === 'boolean') row.customer_spoke = params[7];
          if (params[9]) row.error_detail = params[9];
          if (row.disposition === 'needs_reconcile') row.disposition = null;
          if (['completed', 'failed', 'cancelled'].includes(row.call_lifecycle_status)) {
            row.ended_at = row.ended_at || new Date().toISOString();
          }
        } else if (norm.includes('provider_call_id = COALESCE')) {
          if (params[2] && ['queued', 'initiated'].includes(row.call_lifecycle_status)) {
            row.call_lifecycle_status = params[2];
          }
          if (params[3]) row.provider_call_id = params[3];
        }
        return { rows: [{ ...row }] };
      }

      // 11. Update ai_telecalling_leads
      if (norm.includes('UPDATE ai_telecalling_leads')) {
        const leadId = params[0];
        const fid = params[1];
        for (const lead of leadsByCustomer.values()) {
          if (lead.lead_id === leadId && lead.finance_id === fid) {
            if (norm.includes('attempt_count = COALESCE(attempt_count, 0) + 1')) {
              const ackTag = `acked:${params[2]}`;
              if (lead.locked_by !== ackTag) {
                lead.attempt_count += 1;
                lead.daily_attempt_count += 1;
                lead.last_call_at = new Date().toISOString();
                lead.locked_by = ackTag;
              }
            } else if (norm.includes("SET call_status = 'failed'")) {
              lead.call_status = 'failed';
              lead.locked_by = null;
            } else if (norm.includes('reconcile:')) {
              lead.call_status = 'connecting';
              lead.locked_by = `reconcile:${params[2]}`;
              lead.last_call_at = new Date().toISOString();
            }
            return { rows: [{ ...lead }] };
          }
        }
        return { rows: [] };
      }

      // 12. Customers & Queue Outbox queries for POST /api/ai/calls/queue
      if (norm.includes('FROM customers c') && norm.includes('ANY($2::uuid[])')) {
        const ids = params[1] || [];
        return {
          rows: ids.map((id, i) => ({ id, cname: `Customer ${i + 1}`, hplno: 200 + i })),
        };
      }

      if (norm.includes('FROM voice_outbox_events') && norm.includes('idempotency_key = $2')) {
        const [fid, idemKey] = params;
        const found = outboxRows.find((r) => r.finance_id === fid && r.idempotency_key === idemKey);
        return { rows: found ? [{ ...found }] : [] };
      }

      if (
        norm.includes('FROM voice_outbox_events') &&
        norm.includes("aggregate_type = 'manual_call_queue_item'") &&
        norm.startsWith('SELECT')
      ) {
        const fid = params[0];
        let matched = outboxRows.filter(
          (r) => r.finance_id === fid && r.aggregate_type === 'manual_call_queue_item'
        );
        if (norm.includes("payload->>'batch_id' = $2")) {
          matched = matched.filter((r) => r.payload?.batch_id === params[1]);
        }
        return { rows: matched };
      }

      if (norm.includes('INSERT INTO voice_outbox_events')) {
        const fid = params[0];
        const idemKey = params[params.length - 1];
        const existing = outboxRows.find((r) => r.finance_id === fid && r.idempotency_key === idemKey);
        if (existing) {
          if (norm.includes('ON CONFLICT')) return { rows: [existing] };
          const dup = new Error('duplicate key value violates unique constraint "uq_voe_finance_idem"');
          dup.code = '23505';
          throw dup;
        }
        const isBatchReceipt = norm.includes("'manual_call_queue_batch'");
        const row = {
          id: `01960000-0000-7000-9999-${String(seq++).padStart(12, '0')}`,
          finance_id: fid,
          aggregate_type: isBatchReceipt ? 'manual_call_queue_batch' : 'manual_call_queue_item',
          aggregate_id: params[1],
          event_type: isBatchReceipt ? 'manual_queue_batch_created' : 'manual_queue_dial',
          payload: JSON.parse(params[2]),
          status: isBatchReceipt ? 'published' : 'pending',
          attempt_count: 0,
          max_attempts: isBatchReceipt ? 1 : Number(params[3] || 2),
          next_retry_at: new Date().toISOString(),
          idempotency_key: idemKey,
          created_at: new Date().toISOString(),
        };
        outboxRows.push(row);
        return { rows: [row] };
      }

      if (norm.includes('FROM ai_settings')) {
        return { rows: [{ voice_config: { manual_queue_concurrency: 1 } }] };
      }

      if (norm.includes('UPDATE voice_outbox_events')) {
        const [fid, id, dbStatus, payloadJson, attemptCount, lockedBy, lockExpiresAt, nextRetryAt, lastError] =
          params;
        const target = outboxRows.find((r) => r.finance_id === fid && r.id === id);
        if (!target) return { rows: [] };
        target.status = dbStatus;
        target.payload = JSON.parse(payloadJson);
        target.attempt_count = attemptCount;
        target.locked_by = lockedBy;
        target.lock_expires_at = lockExpiresAt;
        target.next_retry_at = nextRetryAt;
        target.last_error = lastError;
        return { rows: [target] };
      }

      return { rows: [] };
    },
  };

  return runner;
}

test('Phase 2.1 (A6): Shared 10-state <-> DB status mapper enforces initiating->initiated, forward-only transitions, and immutable terminals', async () => {
  const mapper = require('./callLifecycle.mapper');
  const internalService = require('./ai.internal.service');

  assert.deepEqual(mapper.DOMAIN_CALL_STATES, [
    'idle',
    'submitting',
    'queued',
    'initiating',
    'ringing',
    'in_progress',
    'completed',
    'no_response',
    'failed',
    'cancelled',
  ]);

  // initiating <-> initiated DB mapping
  assert.equal(mapper.toDbLifecycleStatus('initiating'), 'initiated');
  assert.equal(mapper.toDbLifecycleStatus('initiated'), 'initiated');
  assert.equal(mapper.toDbLifecycleStatus('queued'), 'queued');
  assert.equal(mapper.toDbLifecycleStatus('no_response'), 'completed');

  const initMapped = mapper.fromDbCallRowToDomainState({
    call_lifecycle_status: 'initiated',
    call_status: 'connecting',
    answered: false,
    customer_spoke: false,
  });
  assert.equal(initMapped.domainState, 'initiating');
  assert.equal(initMapped.transportLifecycleStatus, 'initiating');
  assert.equal(initMapped.isTerminal, false);

  const noRespMapped = mapper.fromDbCallRowToDomainState({
    call_lifecycle_status: 'completed',
    call_status: 'not_responded',
    answered: false,
    customer_spoke: false,
  });
  assert.equal(noRespMapped.domainState, 'no_response');
  assert.equal(noRespMapped.transportLifecycleStatus, 'completed');
  assert.equal(noRespMapped.isTerminal, true);

  // Forward-only progression allowed
  assert.equal(mapper.validateLifecycleTransition('queued', 'initiating').allowed, true);
  assert.equal(mapper.validateLifecycleTransition('initiated', 'ringing').allowed, true);
  assert.equal(mapper.validateLifecycleTransition('ringing', 'in_progress').allowed, true);
  assert.equal(mapper.validateLifecycleTransition('in_progress', 'completed').allowed, true);

  // Backward transitions rejected
  const backward = mapper.validateLifecycleTransition('in_progress', 'ringing');
  assert.equal(backward.allowed, false);
  assert.equal(backward.reason, 'backward_lifecycle_transition');

  // Terminal states are strictly immutable
  for (const term of ['completed', 'failed', 'cancelled']) {
    const res = mapper.validateLifecycleTransition(term, 'in_progress');
    assert.equal(res.allowed, false);
    assert.equal(res.reason, 'terminal_state_immutable');
  }

  // Out-of-order webhook test: late `ringing` callback arriving after `completed` MUST NOT overwrite DB
  const runner = createStatefulCallRunner();
  runner.callLogsById.set(CALL_1, {
    call_id: CALL_1,
    lead_id: LEAD_1,
    finance_id: FINANCE_A,
    customer_id: CUSTOMER_1,
    call_status: 'completed',
    call_lifecycle_status: 'completed',
    answered: true,
    customer_spoke: true,
    disposition: 'ptp_confirmed',
  });

  const lateRes = await internalService.updateInternalCallStatus(
    {
      finance_id: FINANCE_A,
      call_id: CALL_1,
      customer_id: CUSTOMER_1,
      call_lifecycle_status: 'ringing',
    },
    { queryRunner: runner }
  );

  assert.equal(lateRes.ignoredTransition, true);
  assert.equal(runner.callLogsById.get(CALL_1).call_lifecycle_status, 'completed');
});

test('Phase 2.2: Idempotency-Key validation, replay (Idempotency-Replay: true), and 422 payload mismatch on /calls/manual and /calls/queue', async () => {
  const aiRoutes = require('./ai.routes');
  const aiService = require('./ai.service');
  const callQueue = require('./callQueue.service');

  // 1. Missing Idempotency-Key on POST /api/ai/calls/manual -> 400
  const missingRes = createMockExpressRes();
  await aiRoutes.handleInitiateManualCall(
    { financeId: FINANCE_A, headers: {}, body: { customerId: CUSTOMER_1 } },
    missingRes
  );
  assert.equal(missingRes.statusCode, 400);
  assert.equal(missingRes.jsonBody.code, 'invalid_idempotency_key');

  // 2. Manual call creation + replay + 422 mismatch
  const runner = createStatefulCallRunner();
  let pythonDispatchCount = 0;
  const idemKey = 'manual-call:01960000-1111-4222-8333-444444444444';

  const first = await aiService.initiateManualCustomerCall(
    FINANCE_A,
    { customerId: CUSTOMER_1 },
    {
      callId: CALL_1,
      idempotencyKey: idemKey,
      requireIdempotencyKey: true,
      queryRunner: runner,
      checkHealthFn: async () => ({ online: true, status: 'ready' }),
      dispatchFn: async () => {
        pythonDispatchCount += 1;
        return { accepted: true, call_lifecycle_status: 'initiated' };
      },
    }
  );
  assert.equal(first.callId, CALL_1);
  assert.equal(first.idempotencyReplay, false);
  assert.equal(pythonDispatchCount, 1);

  const replay = await aiService.initiateManualCustomerCall(
    FINANCE_A,
    { customerId: CUSTOMER_1 },
    {
      callId: CALL_2,
      idempotencyKey: idemKey,
      requireIdempotencyKey: true,
      queryRunner: runner,
      checkHealthFn: async () => ({ online: true, status: 'ready' }),
      dispatchFn: async () => {
        pythonDispatchCount += 1;
        return { accepted: true };
      },
    }
  );
  assert.equal(replay.idempotencyReplay, true);
  assert.equal(replay.callId, CALL_1);
  assert.equal(pythonDispatchCount, 1, 'Replay must NOT dispatch a second call to Python');
  assert.equal(runner.leadsByCustomer.get(`${FINANCE_A}:${CUSTOMER_1}`).attempt_count, 1);

  // Same key with DIFFERENT customerId -> 422
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_2 },
        {
          idempotencyKey: idemKey,
          requireIdempotencyKey: true,
          queryRunner: runner,
          checkHealthFn: async () => ({ online: true, status: 'ready' }),
        }
      ),
    (err) => err.statusCode === 422 && err.code === 'idempotency_key_payload_mismatch'
  );

  // Route header check for replay -> 200 + Idempotency-Replay: true
  const origManual = aiService.initiateManualCustomerCall;
  try {
    aiService.initiateManualCustomerCall = async (_fid, _body, opts) => {
      assert.equal(opts.idempotencyKey, idemKey);
      return { ...replay, idempotencyReplay: true };
    };
    const replayHttpRes = createMockExpressRes();
    await aiRoutes.handleInitiateManualCall(
      {
        financeId: FINANCE_A,
        headers: { 'idempotency-key': idemKey },
        body: { customerId: CUSTOMER_1 },
      },
      replayHttpRes
    );
    assert.equal(replayHttpRes.statusCode, 200);
    assert.equal(replayHttpRes.getHeader('idempotency-replay'), 'true');
  } finally {
    aiService.initiateManualCustomerCall = origManual;
  }

  // 3. Queue batch creation + replay + 422 mismatch
  const qKey = 'mqueue:01960000-5555-4666-8777-888888888888';
  const batch1 = await callQueue.enqueueManualCallBatch(
    FINANCE_A,
    { customerIds: [CUSTOMER_1, CUSTOMER_2] },
    {
      idempotencyKey: qKey,
      requireIdempotencyKey: true,
      queryRunner: runner,
      skipAutoStartWorker: true,
    }
  );
  assert.equal(batch1.idempotencyReplay, false);
  assert.equal(batch1.totalItems, 2);

  const batchReplay = await callQueue.enqueueManualCallBatch(
    FINANCE_A,
    { customerIds: [CUSTOMER_1, CUSTOMER_2] },
    {
      idempotencyKey: qKey,
      requireIdempotencyKey: true,
      queryRunner: runner,
      skipAutoStartWorker: true,
    }
  );
  assert.equal(batchReplay.idempotencyReplay, true);
  assert.equal(batchReplay.batchId, batch1.batchId);

  await assert.rejects(
    () =>
      callQueue.enqueueManualCallBatch(
        FINANCE_A,
        { customerIds: [CUSTOMER_1] },
        {
          idempotencyKey: qKey,
          requireIdempotencyKey: true,
          queryRunner: runner,
          skipAutoStartWorker: true,
        }
      ),
    (err) => err.statusCode === 422 && err.code === 'idempotency_key_payload_mismatch'
  );
});

test('Phase 2.3 (A1 + A3): Connect error never burns attempt/cooldown; read timeout marks unknown/needs_reconcile with NO auto-retry', async () => {
  const aiService = require('./ai.service');
  const callQueue = require('./callQueue.service');
  const runner = createStatefulCallRunner();

  // 1. Pre-dial connect error (`ECONNREFUSED`) -> 503/502, attempt = 0, cooldown NOT burned!
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_1 },
        {
          callId: CALL_1,
          idempotencyKey: 'manual-call:connect-err-001',
          requireIdempotencyKey: true,
          queryRunner: runner,
          checkHealthFn: async () => ({ online: true, status: 'ready' }),
          dispatchFn: async () => {
            const err = new Error('fetch failed');
            err.cause = { code: 'ECONNREFUSED' };
            throw err;
          },
        }
      ),
    (err) => [502, 503].includes(err.statusCode)
  );

  const leadAfterConnErr = runner.leadsByCustomer.get(`${FINANCE_A}:${CUSTOMER_1}`);
  assert.equal(leadAfterConnErr.attempt_count, 0, 'Pre-dial connect error must NOT count an attempt');
  assert.equal(leadAfterConnErr.daily_attempt_count, 0);
  assert.equal(leadAfterConnErr.last_call_at, null, 'Pre-dial connect error must NOT burn cooldown');

  // Immediate retry with a fresh Idempotency-Key succeeds cleanly without hitting cooldown!
  const retryOk = await aiService.initiateManualCustomerCall(
    FINANCE_A,
    { customerId: CUSTOMER_1 },
    {
      callId: CALL_2,
      idempotencyKey: 'manual-call:connect-retry-002',
      requireIdempotencyKey: true,
      queryRunner: runner,
      checkHealthFn: async () => ({ online: true, status: 'ready' }),
      dispatchFn: async () => ({ accepted: true, call_lifecycle_status: 'initiated' }),
    }
  );
  assert.equal(retryOk.callLifecycleStatus, 'initiating');
  assert.equal(runner.leadsByCustomer.get(`${FINANCE_A}:${CUSTOMER_1}`).attempt_count, 1);

  // Active call blocks concurrent dispatch for CUSTOMER_1 with 409 call_already_in_progress
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_1 },
        {
          idempotencyKey: 'manual-call:concurrent-003',
          requireIdempotencyKey: true,
          queryRunner: runner,
          checkHealthFn: async () => ({ online: true, status: 'ready' }),
        }
      ),
    (err) => err.statusCode === 409 && err.code === 'call_already_in_progress'
  );

  // 2. Read timeout (`AbortError` after send) on CUSTOMER_2 -> 504 dispatch_timeout_ambiguous, unknown/needsReconcile, NO queue retry!
  const timeoutCallId = 'dddddddd-eeee-4fff-8000-333333333333';
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_2 },
        {
          callId: timeoutCallId,
          idempotencyKey: 'manual-call:read-timeout-001',
          requireIdempotencyKey: true,
          queryRunner: runner,
          checkHealthFn: async () => ({ online: true, status: 'ready' }),
          dispatchFn: async () => {
            const abortErr = new Error('This operation was aborted');
            abortErr.name = 'AbortError';
            throw abortErr;
          },
        }
      ),
    (err) => err.statusCode === 504 && err.code === 'dispatch_timeout_ambiguous'
  );

  const statusAfterTimeout = await aiService.getCallStatusById(FINANCE_A, timeoutCallId, {
    queryRunner: runner,
  });
  assert.equal(statusAfterTimeout.call.callLifecycleStatus, 'unknown');
  assert.equal(statusAfterTimeout.call.needsReconcile, true);
  assert.equal(statusAfterTimeout.call.isTerminal, false);

  // Cooldown & active lock NOT released on CUSTOMER_2!
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_2 },
        {
          idempotencyKey: 'manual-call:read-timeout-second-dial',
          requireIdempotencyKey: true,
          queryRunner: runner,
          checkHealthFn: async () => ({ online: true, status: 'ready' }),
        }
      ),
    (err) => err.statusCode === 409
  );

  // Queue worker MUST NOT auto-retry `dispatch_timeout_ambiguous`
  const qRunner = createStatefulCallRunner();
  await callQueue.enqueueManualCallBatch(
    FINANCE_A,
    { customerIds: [CUSTOMER_1] },
    {
      idempotencyKey: 'mqueue:timeout-no-retry-001',
      requireIdempotencyKey: true,
      queryRunner: qRunner,
      maxAttempts: 3,
      skipAutoStartWorker: true,
    }
  );

  let queueDialCalls = 0;
  await callQueue.processTenantQueueTick(FINANCE_A, {
    queryRunner: qRunner,
    initiateCallFn: async () => {
      queueDialCalls += 1;
      const err = new Error('Dispatch read timeout; ambiguous upstream state');
      err.statusCode = 504;
      err.code = 'dispatch_timeout_ambiguous';
      err.details = { callId: timeoutCallId, needsReconcile: true };
      throw err;
    },
  });
  qRunner.nowMs += 120_000;
  await callQueue.processTenantQueueTick(FINANCE_A, {
    queryRunner: qRunner,
    initiateCallFn: async () => {
      queueDialCalls += 1;
      return { callId: CALL_1 };
    },
  });
  assert.equal(queueDialCalls, 1, 'Queue worker must NEVER auto-retry an ambiguous read timeout');
});

test('Phase 2.4 (Telephony Mode + A5 Gates): Fail-closed VOICE_TELEPHONY_MODE, kill switch, live confirm, allowlist, owner_features, and untrusted fields', async () => {
  const aiService = require('./ai.service');
  const voiceClient = require('./voiceAgent.client');

  const savedEnv = {
    VOICE_TELEPHONY_MODE: process.env.VOICE_TELEPHONY_MODE,
    VOICE_AI_KILL_SWITCH: process.env.VOICE_AI_KILL_SWITCH,
    VOICE_LIVE_CALLS_CONFIRMED: process.env.VOICE_LIVE_CALLS_CONFIRMED,
    TEST_ALLOWED_NUMBERS: process.env.TEST_ALLOWED_NUMBERS,
    VOICE_AI_INTERNAL_HMAC_SECRET: process.env.VOICE_AI_INTERNAL_HMAC_SECRET,
  };

  try {
    process.env.VOICE_AI_INTERNAL_HMAC_SECRET = 'phase2-test-hmac-secret';

    // 1. Browser-supplied `mock_telephony: false` rejected with 400
    await assert.rejects(
      () =>
        aiService.initiateManualCustomerCall(
          FINANCE_A,
          { customerId: CUSTOMER_1, mock_telephony: false },
          { idempotencyKey: 'manual-call:untrusted-mock-001', requireIdempotencyKey: true }
        ),
      (err) => err.statusCode === 400 && err.code === 'untrusted_client_fields'
    );

    // 2. Unset VOICE_TELEPHONY_MODE defaults to 'mock'
    delete process.env.VOICE_TELEPHONY_MODE;
    delete process.env.VOICE_AI_KILL_SWITCH;
    assert.equal(voiceClient.resolveVoiceTelephonyMode(), 'mock');

    // 3. Invalid VOICE_TELEPHONY_MODE fails closed with 503 invalid_telephony_mode
    process.env.VOICE_TELEPHONY_MODE = 'yolo_prod';
    await assert.rejects(
      () =>
        aiService.initiateManualCustomerCall(
          FINANCE_A,
          { customerId: CUSTOMER_1 },
          {
            idempotencyKey: 'manual-call:bad-mode-001',
            requireIdempotencyKey: true,
            queryRunner: createStatefulCallRunner(),
          }
        ),
      (err) => err.statusCode === 503 && err.code === 'invalid_telephony_mode'
    );

    // 4. Kill switch halts dispatch immediately with 503
    process.env.VOICE_TELEPHONY_MODE = 'mock';
    process.env.VOICE_AI_KILL_SWITCH = 'true';
    await assert.rejects(
      () =>
        aiService.initiateManualCustomerCall(
          FINANCE_A,
          { customerId: CUSTOMER_1 },
          {
            idempotencyKey: 'manual-call:kill-switch-001',
            requireIdempotencyKey: true,
            queryRunner: createStatefulCallRunner(),
          }
        ),
      (err) => err.statusCode === 503 && err.code === 'voice_ai_kill_switch_active'
    );
    process.env.VOICE_AI_KILL_SWITCH = 'false';

    // 5. Missing/expired owner_features (`ai_voice_agent`) -> 403 ai_voice_agent_entitlement_missing
    await assert.rejects(
      () =>
        aiService.initiateManualCustomerCall(
          FINANCE_A,
          { customerId: CUSTOMER_1 },
          {
            idempotencyKey: 'manual-call:no-entitlement-001',
            requireIdempotencyKey: true,
            queryRunner: createStatefulCallRunner({ entitled: false }),
            checkHealthFn: async () => ({ online: true, status: 'ready' }),
          }
        ),
      (err) => err.statusCode === 403 && err.code === 'ai_voice_agent_entitlement_missing'
    );

    // 6. live_allowlist blocks non-allowlisted phone BEFORE inserting call log or calling Python, and masks phone
    process.env.VOICE_TELEPHONY_MODE = 'live_allowlist';
    process.env.TEST_ALLOWED_NUMBERS = ALLOWED_PHONE;
    const nonAllowedRunner = createStatefulCallRunner({ phoneE164: NON_ALLOWED_PHONE });
    let pythonCalled = false;

    await assert.rejects(
      () =>
        aiService.initiateManualCustomerCall(
          FINANCE_A,
          { customerId: CUSTOMER_1 },
          {
            idempotencyKey: 'manual-call:not-allowlisted-001',
            requireIdempotencyKey: true,
            queryRunner: nonAllowedRunner,
            checkHealthFn: async () => ({ online: true, status: 'ready' }),
            dispatchFn: async () => {
              pythonCalled = true;
              return { accepted: true };
            },
          }
        ),
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'destination_not_in_test_allowlist');
        assert.equal(err.message.includes('988888'), false, 'Error message must never leak full phone');
        return true;
      }
    );
    assert.equal(pythonCalled, false);
    assert.equal(nonAllowedRunner.callLogsById.size, 0);

    // 7. dispatchManualCallToVoiceAgent removes hardcoded mock_telephony: true and derives from server mode
    let capturedWireBody = null;
    await voiceClient.dispatchManualCallToVoiceAgent(
      {
        finance_id: FINANCE_A,
        customer_id: CUSTOMER_1,
        call_id: CALL_1,
      },
      {
        telephonyMode: 'live_allowlist',
        fetchImpl: async (_url, init) => {
          capturedWireBody = JSON.parse(init.body);
          return {
            ok: true,
            status: 202,
            async json() {
              return { accepted: true, call_lifecycle_status: 'initiated' };
            },
          };
        },
      }
    );
    assert.equal(capturedWireBody.telephony_mode, 'live_allowlist');
    assert.equal(capturedWireBody.mock_telephony, false);

    // 8. VOICE_TELEPHONY_MODE=live without VOICE_LIVE_CALLS_CONFIRMED=true -> 503 live_calls_not_confirmed
    process.env.VOICE_TELEPHONY_MODE = 'live';
    delete process.env.VOICE_LIVE_CALLS_CONFIRMED;
    await assert.rejects(
      () =>
        aiService.initiateManualCustomerCall(
          FINANCE_A,
          { customerId: CUSTOMER_1 },
          {
            idempotencyKey: 'manual-call:live-unconfirmed-001',
            requireIdempotencyKey: true,
            queryRunner: createStatefulCallRunner(),
            checkHealthFn: async () => ({ online: true, status: 'ready' }),
          }
        ),
      (err) => err.statusCode === 503 && err.code === 'live_calls_not_confirmed'
    );
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('Phase 2.5 (A4 + Legacy 410): Mock calls tag mock-<callId>, isolate L2/L3/PTP/DNC, dry-run is strictly read-only, and /leads/:leadId/call returns 410 Gone', async () => {
  const aiService = require('./ai.service');
  const aiRoutes = require('./ai.routes');
  const internalService = require('./ai.internal.service');
  const { auditMockVoiceDataDryRun } = require('../../../scripts/cleanup_mock_voice_data_dry_run');

  // 1. Mock mode tags provider_call_id = `mock-${callId}`
  const runner = createStatefulCallRunner();
  const mockRes = await aiService.initiateManualCustomerCall(
    FINANCE_A,
    { customerId: CUSTOMER_1 },
    {
      callId: CALL_1,
      idempotencyKey: 'manual-call:mock-tag-001',
      requireIdempotencyKey: true,
      queryRunner: runner,
      checkHealthFn: async () => ({ online: true, status: 'ready' }),
      dispatchFn: async (payload) => {
        assert.equal(payload.provider_call_id, `mock-${CALL_1}`);
        return { accepted: true, call_lifecycle_status: 'initiated' };
      },
    }
  );
  assert.equal(mockRes.providerCallId, `mock-${CALL_1}`);
  assert.equal(mockRes.mockTelephony, true);

  // 2. completeInternalVoiceCall strips L2 summary, L3 memory, PTP, callback, and DNC writes for mock calls
  let capturedFnParams = null;
  const mockCompleteRunner = {
    async query(sql, params) {
      if (sql.includes('FROM ai_telecalling_call_logs') && sql.includes('SELECT')) {
        return {
          rows: [
            {
              call_id: CALL_1,
              lead_id: LEAD_1,
              provider_call_id: `mock-${CALL_1}`,
              call_lifecycle_status: 'in_progress',
            },
          ],
        };
      }
      if (sql.includes('UPDATE ai_telecalling_call_logs')) {
        return { rows: [{ provider_call_id: `mock-${CALL_1}`, lead_id: LEAD_1 }] };
      }
      if (sql.includes('FROM ai_telecalling_leads')) {
        return { rows: [{ lead_id: LEAD_1 }] };
      }
      if (sql.includes('fn_complete_voice_call')) {
        capturedFnParams = params;
        return { rows: [{ result: { status: 'success', mock_isolated: true } }] };
      }
      return { rows: [] };
    },
  };

  await internalService.completeInternalVoiceCall(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      call_id: CALL_1,
      lead_id: LEAD_1,
      call_status: 'completed',
      call_lifecycle_status: 'completed',
      disposition: 'ptp_confirmed',
      summary_short: 'Mock fabricated summary',
      rolling_summary: 'Mock fabricated rolling profile',
      promised_amount: 5000,
      promised_date: '2026-11-20',
      callback_at: '2026-11-15T10:00:00Z',
      explicit_opt_out: true,
    },
    { queryRunner: mockCompleteRunner }
  );

  assert.ok(capturedFnParams, 'fn_complete_voice_call should still finalize the call log row');
  assert.equal(capturedFnParams[11], null, 'p_summary_short ($12) must be NULL for mock calls');
  assert.equal(capturedFnParams[18], null, 'p_rolling_summary ($19) must be NULL for mock calls');
  assert.equal(capturedFnParams[23], false, 'p_explicit_opt_out ($24) must be FALSE for mock calls');
  assert.equal(capturedFnParams[25], null, 'p_promised_amount ($26) must be NULL for mock calls');
  assert.equal(capturedFnParams[26], null, 'p_promised_date ($27) must be NULL for mock calls');
  assert.equal(capturedFnParams[28], null, 'p_callback_at ($29) must be NULL for mock calls');

  // 3. recordInternalPromiseToPay skips DB insert when call is mock-*
  let ptpInserted = false;
  const mockPtpRunner = {
    async query(sql) {
      if (sql.includes('FROM ai_telecalling_call_logs')) {
        return { rows: [{ provider_call_id: `mock-${CALL_1}` }] };
      }
      if (sql.includes('INSERT INTO promise_to_pay')) {
        ptpInserted = true;
      }
      return { rows: [{ customer_id: CUSTOMER_1, finance_id: FINANCE_A }] };
    },
  };
  const ptpSkipRes = await internalService.recordInternalPromiseToPay(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      call_id: CALL_1,
      promised_amount: 5000,
      promised_date: '2026-11-20',
    },
    { queryRunner: mockPtpRunner }
  );
  assert.equal(ptpInserted, false, 'Mock call must NEVER insert into promise_to_pay');
  assert.equal(ptpSkipRes.mockIsolated, true);

  // 4. Dry-run cleanup audit executes strictly READ ONLY transaction + SELECTs (zero mutations)
  const dryRunSql = [];
  const dryRunClient = {
    async query(sql) {
      dryRunSql.push(sql.trim());
      return { rows: [] };
    },
    release() {},
  };
  await auditMockVoiceDataDryRun({
    pool: {
      async connect() {
        return dryRunClient;
      },
    },
  });
  assert.equal(dryRunSql[0], 'BEGIN TRANSACTION READ ONLY');
  assert.equal(
    dryRunSql.some((s) => /\b(DELETE|UPDATE|INSERT|ALTER|DROP|TRUNCATE)\b/i.test(s)),
    false,
    'Dry-run script must execute ZERO mutating SQL statements'
  );

  // 5. Legacy POST /api/ai/leads/:leadId/call returns 410 Gone
  const goneRes = createMockExpressRes();
  await aiRoutes.handleTriggerLeadCall(
    { financeId: FINANCE_A, params: { leadId: LEAD_1 } },
    goneRes
  );
  assert.equal(goneRes.statusCode, 410);
  assert.equal(goneRes.jsonBody.code, 'endpoint_deprecated');
});


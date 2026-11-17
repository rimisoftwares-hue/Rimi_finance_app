'use strict';

/**
 * Phase 1A Production Hardening TDD Suite (Node):
 * 1. Layered authentication on `/api/internal/voice-ai/*`:
 *    - Constant-time `X-Internal-API-Key` (`VOICE_INTERNAL_API_KEY` + `VOICE_INTERNAL_API_KEY_PREVIOUS`)
 *    - HMAC-SHA256 (`X-AutoFinex-Timestamp` + `X-AutoFinex-Signature`, <=300s skew)
 *    - Tenant binding (`X-Finance-Id === req.body.finance_id`, 403 `tenant_context_mismatch` on mismatch)
 * 2. Intra-300s replay idempotency across ALL 6 internal endpoints:
 *    - `/calls/status`
 *    - `/tools/schedule-callback`
 *    - `/tools/promise-to-pay`
 *    - `/tools/privacy-optout` (`dnc_only`)
 *    - `/tools/escalation`
 *    - `/calls/complete` (`SELECT ... FOR UPDATE` + terminal replay guard: `fn_complete_voice_call` runs ONCE,
 *      returns `already_completed_idempotent` on replay, while still allowing late `recording_s3_key` attachment!)
 * 3. `voiceAgent.client.js` fail-closed mode resolution (zero `'mock'` mode), layered outbound headers
 *    (`X-Internal-API-Key`, `X-Finance-Id`, `X-Request-Id`, `X-AutoFinex-Timestamp`, `X-AutoFinex-Signature`),
 *    and authenticated `GET /api/v1/health/deep` probe.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  signInternalPayload,
  resolveVoiceTelephonyMode,
  dispatchManualCallToVoiceAgent,
  checkVoiceSystemHealth,
  clearVoiceHealthCache,
} = require('../voiceAgent.client');
const internalRoutes = require('../../ai.internal.routes');
const internalService = require('../ai.internal.service');

const FINANCE_A = '01a14ed2-5df9-7175-839b-3cbaca84f231';
const FINANCE_B = '11111111-2222-4333-8444-555555555555';
const CUSTOMER_1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const LOAN_1 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const LEAD_1 = 'cccccccc-dddd-4eee-8fff-000000000001';
const CALL_1 = 'dddddddd-eeee-4fff-8000-000000000002';

const PRIMARY_KEY = 'a'.repeat(64);
const PREVIOUS_KEY = 'b'.repeat(64);
const HMAC_SECRET = 'c'.repeat(64);

function createMockRes() {
  return {
    statusCode: 200,
    jsonBody: null,
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

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = overrides[k];
    }
  }
  const restore = () => {
    for (const k of Object.keys(overrides)) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      return out.finally(restore);
    }
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

test('Phase 1A.1: requireVoiceAiHmacAuth enforces X-Internal-API-Key (primary + previous), HMAC, and X-Finance-Id', () => {
  withEnv(
    {
      VOICE_INTERNAL_API_KEY: PRIMARY_KEY,
      VOICE_INTERNAL_API_KEY_PREVIOUS: PREVIOUS_KEY,
      VOICE_AI_INTERNAL_HMAC_SECRET: HMAC_SECRET,
    },
    () => {
      const payload = { finance_id: FINANCE_A, customer_id: CUSTOMER_1, call_id: CALL_1 };
      const rawBody = JSON.stringify(payload);
      const signed = signInternalPayload(rawBody, HMAC_SECRET);

      // 1. Valid HMAC WITHOUT X-Internal-API-Key -> 401 unauthorized_api_key
      const resNoKey = createMockRes();
      internalRoutes.requireVoiceAiHmacAuth(
        {
          headers: {
            'x-autofinex-timestamp': signed.timestamp,
            'x-autofinex-signature': signed.signature,
            'x-finance-id': FINANCE_A,
          },
          rawBody,
          body: payload,
        },
        resNoKey,
        () => assert.fail('Missing API key must fail closed')
      );
      assert.equal(resNoKey.statusCode, 401);
      assert.equal(resNoKey.jsonBody.code, 'unauthorized_api_key');

      // 2. Wrong X-Internal-API-Key -> 401 unauthorized_api_key
      const resWrongKey = createMockRes();
      internalRoutes.requireVoiceAiHmacAuth(
        {
          headers: {
            'x-internal-api-key': 'wrong-key',
            'x-autofinex-timestamp': signed.timestamp,
            'x-autofinex-signature': signed.signature,
            'x-finance-id': FINANCE_A,
          },
          rawBody,
          body: payload,
        },
        resWrongKey,
        () => assert.fail('Wrong API key must fail closed')
      );
      assert.equal(resWrongKey.statusCode, 401);
      assert.equal(resWrongKey.jsonBody.code, 'unauthorized_api_key');

      // 3. Both PRIMARY_KEY and PREVIOUS_KEY pass cleanly during rotation
      for (const validKey of [PRIMARY_KEY, PREVIOUS_KEY]) {
        let passed = false;
        const resOk = createMockRes();
        internalRoutes.requireVoiceAiHmacAuth(
          {
            headers: {
              'x-internal-api-key': validKey,
              'x-autofinex-timestamp': signed.timestamp,
              'x-autofinex-signature': signed.signature,
              'x-finance-id': FINANCE_A,
            },
            rawBody,
            body: payload,
          },
          resOk,
          () => {
            passed = true;
          }
        );
        assert.equal(passed, true);
      }

      // 4. Missing or mismatched X-Finance-Id -> 403 tenant_context_mismatch
      const resMismatch = createMockRes();
      internalRoutes.requireVoiceAiHmacAuth(
        {
          headers: {
            'x-internal-api-key': PRIMARY_KEY,
            'x-autofinex-timestamp': signed.timestamp,
            'x-autofinex-signature': signed.signature,
            'x-finance-id': FINANCE_B,
          },
          rawBody,
          body: payload,
        },
        resMismatch,
        () => assert.fail('Tenant mismatch must fail closed with 403')
      );
      assert.equal(resMismatch.statusCode, 403);
      assert.equal(resMismatch.jsonBody.code, 'tenant_context_mismatch');
    }
  );
});

test('Phase 1A.2: Intra-300s replay across all 6 internal endpoints is idempotent and /calls/complete locks FOR UPDATE', async () => {
  // Stateful in-memory DB simulation verifying row locks and zero duplicate rows on replay
  const state = {
    callLog: {
      id: CALL_1,
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      lead_id: LEAD_1,
      provider_call_id: 'dograh-run-5501',
      call_lifecycle_status: 'initiated',
      call_status: 'connecting',
      answered: false,
      customer_spoke: false,
      disposition: null,
      recording_s3_key: null,
      recording_status: 'not_recorded',
    },
    forUpdateLocks: 0,
    completeFnInvocations: 0,
    callbacksByIdemKey: new Map(),
    ptpsByIdemKey: new Map(),
    suppressionsByPhoneChannel: new Map(),
    escalationsByIdemKey: new Map(),
    txCommands: [],
  };

  const clientQuery = async (sql, params = []) => {
    const trimmed = sql.trim();
    if (trimmed === 'BEGIN' || trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
      state.txCommands.push(trimmed);
      return { rows: [] };
    }
    if (sql.includes('FROM customers c')) {
      return {
        rows: [
          {
            customer_id: CUSTOMER_1,
            finance_id: FINANCE_A,
            phone_e164: '+919000001002',
          },
        ],
      };
    }
    if (sql.includes('FROM ai_telecalling_call_logs') && sql.includes('FOR UPDATE')) {
      state.forUpdateLocks += 1;
      return {
        rows: [
          {
            call_id: state.callLog.id,
            lead_id: state.callLog.lead_id,
            provider_call_id: state.callLog.provider_call_id,
            call_lifecycle_status: state.callLog.call_lifecycle_status,
            call_status: state.callLog.call_status,
            answered: state.callLog.answered,
            customer_spoke: state.callLog.customer_spoke,
            disposition: state.callLog.disposition,
            recording_s3_key: state.callLog.recording_s3_key,
            recording_status: state.callLog.recording_status,
          },
        ],
      };
    }
    if (sql.includes('UPDATE ai_telecalling_call_logs') && sql.includes('SET call_lifecycle_status')) {
      state.callLog.call_lifecycle_status = params[3];
      state.callLog.call_status = params[4];
      state.callLog.provider_call_id = params[5] || state.callLog.provider_call_id;
      return {
        rows: [
          {
            call_id: state.callLog.id,
            lead_id: state.callLog.lead_id,
            call_lifecycle_status: state.callLog.call_lifecycle_status,
            call_status: state.callLog.call_status,
            disposition: state.callLog.disposition,
            error_detail: null,
            answered: state.callLog.answered,
            customer_spoke: state.callLog.customer_spoke,
          },
        ],
      };
    }
    if (sql.includes('UPDATE ai_telecalling_call_logs') && sql.includes('SET recording_s3_key')) {
      state.callLog.recording_s3_key = params[3];
      state.callLog.recording_status = params[4] || 'ready';
      return { rows: [{ id: state.callLog.id }] };
    }
    if (sql.includes('UPDATE ai_telecalling_call_logs')) {
      return {
        rows: [
          {
            provider_call_id: state.callLog.provider_call_id,
            lead_id: state.callLog.lead_id,
            call_lifecycle_status: state.callLog.call_lifecycle_status,
            disposition: state.callLog.disposition,
          },
        ],
      };
    }
    if (sql.includes('FROM ai_telecalling_leads')) {
      return { rows: [{ lead_id: LEAD_1 }] };
    }
    if (sql.includes('INSERT INTO voice_callbacks')) {
      const idemKey = params[9];
      if (!state.callbacksByIdemKey.has(idemKey)) {
        state.callbacksByIdemKey.set(idemKey, `cbk-${state.callbacksByIdemKey.size + 1}`);
      }
      return {
        rows: [{ callback_id: state.callbacksByIdemKey.get(idemKey), scheduled_at: params[5] }],
      };
    }
    if (sql.includes('INSERT INTO promise_to_pay')) {
      const idemKey = params[11];
      if (!state.ptpsByIdemKey.has(idemKey)) {
        state.ptpsByIdemKey.set(idemKey, `ptp-${state.ptpsByIdemKey.size + 1}`);
      }
      return { rows: [{ ptp_id: state.ptpsByIdemKey.get(idemKey) }] };
    }
    if (sql.includes('INSERT INTO voice_contact_suppressions')) {
      const key = `${params[0]}:${params[2]}:${params[3]}`;
      if (!state.suppressionsByPhoneChannel.has(key)) {
        state.suppressionsByPhoneChannel.set(key, `sup-${state.suppressionsByPhoneChannel.size + 1}`);
      }
      return { rows: [{ suppression_id: state.suppressionsByPhoneChannel.get(key) }] };
    }
    if (sql.includes('INSERT INTO voice_outbox_events') && sql.includes("'escalation'")) {
      const idemKey = params[3];
      if (!state.escalationsByIdemKey.has(idemKey)) {
        state.escalationsByIdemKey.set(idemKey, `esc-${state.escalationsByIdemKey.size + 1}`);
      }
      return { rows: [{ event_id: state.escalationsByIdemKey.get(idemKey) }] };
    }
    if (sql.includes('fn_complete_voice_call')) {
      state.completeFnInvocations += 1;
      state.callLog.call_lifecycle_status = 'completed';
      state.callLog.disposition = 'ptp_confirmed';
      state.callLog.recording_s3_key = params[41] || null;
      state.callLog.recording_status = params[42] || 'not_recorded';
      return {
        rows: [
          {
            result: {
              status: 'success',
              call_log_id: CALL_1,
              lead_id: LEAD_1,
              call_lifecycle_status: 'completed',
            },
          },
        ],
      };
    }
    return { rows: [] };
  };

  const runner = {
    query: clientQuery,
    async connect() {
      return {
        query: clientQuery,
        release() {},
      };
    },
  };

  // 1. /calls/status replayed twice -> updates same row idempotently without regression
  const st1 = await internalService.updateInternalCallStatus(
    {
      finance_id: FINANCE_A,
      call_id: CALL_1,
      customer_id: CUSTOMER_1,
      call_lifecycle_status: 'ringing',
    },
    { queryRunner: runner }
  );
  const st2 = await internalService.updateInternalCallStatus(
    {
      finance_id: FINANCE_A,
      call_id: CALL_1,
      customer_id: CUSTOMER_1,
      call_lifecycle_status: 'ringing',
    },
    { queryRunner: runner }
  );
  assert.equal(st1.callLifecycleStatus, 'ringing');
  assert.equal(st2.callLifecycleStatus, 'ringing');
  assert.equal(st1.callId, CALL_1);
  assert.equal(st2.callId, CALL_1);

  // 2. /tools/schedule-callback replayed twice -> 1 row, zero mockIsolated
  const cbPayload = {
    finance_id: FINANCE_A,
    customer_id: CUSTOMER_1,
    loan_id: LOAN_1,
    call_id: CALL_1,
    scheduled_at: '2026-11-18T11:00:00+05:30',
    idempotency_key: `cbk:${FINANCE_A}:${CALL_1}`,
  };
  const cb1 = await internalService.recordInternalScheduleCallback(cbPayload, { queryRunner: runner });
  const cb2 = await internalService.recordInternalScheduleCallback(cbPayload, { queryRunner: runner });
  assert.equal(cb1.callbackId, 'cbk-1');
  assert.equal(cb2.callbackId, 'cbk-1');
  assert.equal(cb1.mockIsolated, undefined);
  assert.equal(state.callbacksByIdemKey.size, 1);

  // 3. /tools/promise-to-pay replayed twice -> 1 row
  const ptpPayload = {
    finance_id: FINANCE_A,
    customer_id: CUSTOMER_1,
    loan_id: LOAN_1,
    call_id: CALL_1,
    promised_amount: 4500,
    promised_date: '2026-11-20',
    idempotency_key: `ptp:${FINANCE_A}:${CALL_1}`,
  };
  const ptp1 = await internalService.recordInternalPromiseToPay(ptpPayload, { queryRunner: runner });
  const ptp2 = await internalService.recordInternalPromiseToPay(ptpPayload, { queryRunner: runner });
  assert.equal(ptp1.ptpId, 'ptp-1');
  assert.equal(ptp2.ptpId, 'ptp-1');
  assert.equal(state.ptpsByIdemKey.size, 1);

  // 4. /tools/privacy-optout (dnc_only) replayed twice -> 1 active suppression row
  const dncPayload = {
    finance_id: FINANCE_A,
    customer_id: CUSTOMER_1,
    call_id: CALL_1,
    action_type: 'dnc_only',
    reason_excerpt: 'Stop automated calls',
  };
  const dnc1 = await internalService.recordInternalPrivacyOptOut(dncPayload, { queryRunner: runner });
  const dnc2 = await internalService.recordInternalPrivacyOptOut(dncPayload, { queryRunner: runner });
  assert.equal(dnc1.suppressionId, 'sup-1');
  assert.equal(dnc2.suppressionId, 'sup-1');
  assert.equal(state.suppressionsByPhoneChannel.size, 1);

  // 5. /tools/escalation replayed twice -> 1 escalation outbox row
  const escPayload = {
    finance_id: FINANCE_A,
    customer_id: CUSTOMER_1,
    loan_id: LOAN_1,
    call_id: CALL_1,
    reason: 'Requested human manager',
    idempotency_key: `esc:${FINANCE_A}:${CALL_1}`,
  };
  const esc1 = await internalService.recordInternalEscalation(escPayload, { queryRunner: runner });
  const esc2 = await internalService.recordInternalEscalation(escPayload, { queryRunner: runner });
  assert.equal(esc1.escalationEventId, 'esc-1');
  assert.equal(esc2.escalationEventId, 'esc-1');
  assert.equal(state.escalationsByIdemKey.size, 1);

  // 6. /calls/complete replayed within 5s -> SELECT ... FOR UPDATE runs, fn_complete_voice_call runs ONCE!
  const locksBeforeComplete = state.forUpdateLocks;
  const completePayload = {
    finance_id: FINANCE_A,
    customer_id: CUSTOMER_1,
    call_id: CALL_1,
    lead_id: LEAD_1,
    provider_call_id: 'dograh-run-5501',
    call_status: 'completed',
    call_lifecycle_status: 'completed',
    disposition: 'ptp_confirmed',
    summary_short: 'Customer promised Rs 4500 on 2026-11-20.',
    promised_amount: 4500,
    promised_date: '2026-11-20',
  };
  const comp1 = await internalService.completeInternalVoiceCall(completePayload, {
    queryRunner: runner,
  });
  assert.equal(comp1.status, 'success');
  assert.equal(state.completeFnInvocations, 1);

  const comp2 = await internalService.completeInternalVoiceCall(completePayload, {
    queryRunner: runner,
  });
  assert.equal(comp2.status, 'already_completed_idempotent');
  assert.equal(state.completeFnInvocations, 1);
  assert.equal(state.forUpdateLocks >= locksBeforeComplete + 2, true);

  // Late S3 recording arrival on already-completed call attaches recording metadata ONLY without re-running fn_complete_voice_call
  const s3Key = `voice-recordings/${FINANCE_A}/2026/11/17/${CUSTOMER_1}/${CALL_1}.wav`;
  const compLateRec = await internalService.completeInternalVoiceCall(
    {
      ...completePayload,
      recording_s3_key: s3Key,
      recording_status: 'ready',
      recording_duration_seconds: 32,
      recording_size_bytes: 512000,
    },
    { queryRunner: runner }
  );
  assert.equal(compLateRec.status, 'already_completed_recording_attached');
  assert.equal(state.completeFnInvocations, 1);
  assert.equal(state.callLog.recording_s3_key, s3Key);
});

test('Phase 1A.3: voiceAgent.client rejects unset/mock modes, sends layered headers, and probes /api/v1/health/deep', async () => {
  // 1. Unset, empty, and 'mock' VOICE_TELEPHONY_MODE all fail closed with 503
  for (const invalidVal of [undefined, '', '   ', 'mock', 'MOCK', 'invalid']) {
    assert.throws(
      () => resolveVoiceTelephonyMode({ VOICE_TELEPHONY_MODE: invalidVal }),
      (err) => err.statusCode === 503
    );
  }
  assert.equal(
    resolveVoiceTelephonyMode({ VOICE_TELEPHONY_MODE: 'live_allowlist' }),
    'live_allowlist'
  );
  assert.equal(resolveVoiceTelephonyMode({ VOICE_TELEPHONY_MODE: 'live' }), 'live');

  // 2. dispatchManualCallToVoiceAgent sends X-Internal-API-Key + X-Finance-Id + X-Request-Id + HMAC and zero mock_telephony
  let capturedUrl = null;
  let capturedInit = null;
  await dispatchManualCallToVoiceAgent(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      loan_id: LOAN_1,
      lead_id: LEAD_1,
      call_id: CALL_1,
    },
    {
      voiceAgentBaseUrl: 'http://127.0.0.1:8100',
      apiKey: PRIMARY_KEY,
      hmacSecret: HMAC_SECRET,
      telephonyMode: 'live_allowlist',
      fetchImpl: async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return {
          ok: true,
          status: 202,
          json: async () => ({ accepted: true, workflow_run_id: 7701 }),
        };
      },
    }
  );

  assert.equal(capturedUrl, 'http://127.0.0.1:8100/api/v1/calls/outbound/manual');
  assert.equal(capturedInit.headers['X-Internal-API-Key'], PRIMARY_KEY);
  assert.equal(capturedInit.headers['X-Finance-Id'], FINANCE_A);
  assert.equal(typeof capturedInit.headers['X-Request-Id'], 'string');
  assert.equal(capturedInit.headers['X-Request-Id'].length >= 16, true);
  assert.equal(typeof capturedInit.headers['X-AutoFinex-Timestamp'], 'string');
  assert.equal(typeof capturedInit.headers['X-AutoFinex-Signature'], 'string');
  const sentBody = JSON.parse(capturedInit.body);
  assert.equal('mock_telephony' in sentBody, false);

  // 3. checkVoiceSystemHealth probes authenticated GET /api/v1/health/deep
  await withEnv(
    {
      VOICE_INTERNAL_API_KEY: PRIMARY_KEY,
      VOICE_AI_INTERNAL_HMAC_SECRET: HMAC_SECRET,
      VOICE_TELEPHONY_MODE: 'live_allowlist',
    },
    async () => {
      clearVoiceHealthCache();
      const probed = [];
      const health = await checkVoiceSystemHealth({
        forceRefresh: true,
        fetchImpl: async (url, init) => {
          probed.push({ url, headers: init.headers });
          if (url.includes('/api/v1/health/deep')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                status: 'ok',
                ready: true,
                db_read_only_ok: true,
                redis_ok: true,
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok' }),
          };
        },
      });
      assert.equal(health.online, true);
      const deepCall = probed.find((p) => p.url.endsWith('/api/v1/health/deep'));
      assert.ok(deepCall, 'Expected checkVoiceSystemHealth to probe /api/v1/health/deep');
      assert.equal(deepCall.headers['X-Internal-API-Key'], PRIMARY_KEY);
      assert.ok(deepCall.headers['X-AutoFinex-Timestamp']);
      assert.ok(deepCall.headers['X-AutoFinex-Signature']);
    }
  );
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { signInternalPayload } = require('../voiceAgent.client');
const internalRoutes = require('../../ai.internal.routes');
const internalService = require('../ai.internal.service');
const aiService = require('../ai.service');

const FINANCE_A = '01a14ed2-5df9-7175-839b-3cbaca84f231';
const FINANCE_B = '11111111-2222-3333-4444-555555555555';
const CUSTOMER_1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const LOAN_1 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const LEAD_1 = 'cccccccc-dddd-4eee-8fff-000000000001';
const CALL_1 = 'dddddddd-eeee-4fff-8000-000000000002';
const TEST_SECRET = 'test-hmac-secret-phase-cd-2026';

function createMockRes() {
  const res = {
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
  return res;
}

test('Phase C.1: requireVoiceAiHmacAuth enforces valid signature and ±300s replay window', () => {
  const prevSecret = process.env.VOICE_AI_INTERNAL_HMAC_SECRET;
  process.env.VOICE_AI_INTERNAL_HMAC_SECRET = TEST_SECRET;

  try {
    const payload = { finance_id: FINANCE_A, call_id: CALL_1, customer_id: CUSTOMER_1 };
    const rawBody = JSON.stringify(payload);
    const signed = signInternalPayload(rawBody, TEST_SECRET);

    // 1. Valid HMAC passes middleware
    let nextCalled = false;
    const okReq = {
      headers: {
        'x-autofinex-timestamp': signed.timestamp,
        'x-autofinex-signature': signed.signature,
      },
      rawBody,
      body: payload,
    };
    const okRes = createMockRes();
    internalRoutes.requireVoiceAiHmacAuth(okReq, okRes, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);

    // 2. Tampered body fails with 401 signature_mismatch
    const tamperedReq = {
      headers: {
        'x-autofinex-timestamp': signed.timestamp,
        'x-autofinex-signature': signed.signature,
      },
      rawBody: JSON.stringify({ ...payload, finance_id: FINANCE_B }),
      body: { ...payload, finance_id: FINANCE_B },
    };
    const tamperedRes = createMockRes();
    internalRoutes.requireVoiceAiHmacAuth(tamperedReq, tamperedRes, () => {
      assert.fail('Tampered payload must not pass HMAC check');
    });
    assert.equal(tamperedRes.statusCode, 401);
    assert.equal(tamperedRes.jsonBody.code, 'signature_mismatch');

    // 3. Stale timestamp (> 300s old) fails with 401 timestamp_out_of_bounds
    const oldTs = Math.floor(Date.now() / 1000) - 600;
    const oldSigned = signInternalPayload(rawBody, TEST_SECRET, oldTs);
    const replayReq = {
      headers: {
        'x-autofinex-timestamp': oldSigned.timestamp,
        'x-autofinex-signature': oldSigned.signature,
      },
      rawBody,
      body: payload,
    };
    const replayRes = createMockRes();
    internalRoutes.requireVoiceAiHmacAuth(replayReq, replayRes, () => {
      assert.fail('Replayed timestamp must not pass HMAC check');
    });
    assert.equal(replayRes.statusCode, 401);
    assert.equal(replayRes.jsonBody.code, 'timestamp_out_of_bounds');
  } finally {
    if (prevSecret === undefined) delete process.env.VOICE_AI_INTERNAL_HMAC_SECRET;
    else process.env.VOICE_AI_INTERNAL_HMAC_SECRET = prevSecret;
  }
});

test('Phase C.2: Situation A/B/C internal tool endpoints maintain strict separation', async () => {
  const executedQueries = [];
  const runner = {
    async query(sql, params) {
      executedQueries.push({ sql, params });
      if (sql.includes('FROM customers c')) {
        return {
          rows: [
            {
              customer_id: CUSTOMER_1,
              finance_id: FINANCE_A,
              phone_e164: '+919876543210',
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO voice_callbacks')) {
        return { rows: [{ callback_id: 'cbk-uuid-1', scheduled_at: '2026-11-12T12:30:00.000Z' }] };
      }
      if (sql.includes('INSERT INTO promise_to_pay')) {
        return { rows: [{ ptp_id: 'ptp-uuid-1' }] };
      }
      if (sql.includes('INSERT INTO voice_contact_suppressions')) {
        return { rows: [{ suppression_id: 'supp-uuid-1' }] };
      }
      return { rows: [] };
    },
  };

  // Situation A: schedule-callback NEVER writes to voice_contact_suppressions
  const cbRes = await internalService.recordInternalScheduleCallback(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      loan_id: LOAN_1,
      call_id: CALL_1,
      scheduled_at: '2026-11-12T12:30:00Z',
      source: 'busy_momentary_deferral',
      customer_note: 'Customer in meeting, call at 6 PM',
    },
    { queryRunner: runner }
  );
  assert.equal(cbRes.callbackId, 'cbk-uuid-1');
  assert.equal(
    executedQueries.some((q) => q.sql.includes('voice_contact_suppressions')),
    false,
    'Situation A callback must NEVER touch voice_contact_suppressions'
  );

  // Situation B: promise-to-pay writes promise_to_pay + voice_outbox_events
  executedQueries.length = 0;
  const ptpRes = await internalService.recordInternalPromiseToPay(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      loan_id: LOAN_1,
      call_id: CALL_1,
      promised_amount: 4500,
      promised_date: '2026-11-15',
      idempotency_key: 'ptp-idem-1',
    },
    { queryRunner: runner }
  );
  assert.equal(ptpRes.ptpId, 'ptp-uuid-1');
  assert.equal(executedQueries.some((q) => q.sql.includes('INSERT INTO promise_to_pay')), true);
  assert.equal(executedQueries.some((q) => q.sql.includes('INSERT INTO voice_outbox_events')), true);

  // Situation C (1): biometric_erase_only erases voiceprint WITHOUT suppressing calls
  executedQueries.length = 0;
  const bioRes = await internalService.recordInternalPrivacyOptOut(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      action_type: 'biometric_erase_only',
    },
    { queryRunner: runner }
  );
  assert.equal(bioRes.biometricErased, true);
  assert.equal(bioRes.suppressionId, null);
  assert.equal(executedQueries.some((q) => q.sql.includes('UPDATE voice_speaker_profiles')), true);
  assert.equal(executedQueries.some((q) => q.sql.includes('voice_contact_suppressions')), false);

  // Situation C (2): dnc_only inserts suppression WITHOUT touching biometric profile
  executedQueries.length = 0;
  const dncRes = await internalService.recordInternalPrivacyOptOut(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      action_type: 'dnc_only',
      reason_excerpt: 'Stop automated calls',
    },
    { queryRunner: runner }
  );
  assert.equal(dncRes.biometricErased, false);
  assert.equal(dncRes.suppressionId, 'supp-uuid-1');
  assert.equal(executedQueries.some((q) => q.sql.includes('INSERT INTO voice_contact_suppressions')), true);
});

test('Phase C.3: completeInternalVoiceCall validates S3 prefix and passes 52 params with token telemetry', async () => {
  let capturedCompleteParams = null;

  const runner = {
    async query(sql, params) {
      if (sql.includes('UPDATE ai_telecalling_call_logs')) {
        return {
          rows: [{ provider_call_id: `af-call-${CALL_1}`, lead_id: LEAD_1 }],
        };
      }
      if (sql.includes('FROM ai_telecalling_leads')) {
        return { rows: [{ lead_id: LEAD_1 }] };
      }
      if (sql.includes('fn_complete_voice_call')) {
        capturedCompleteParams = params;
        return {
          rows: [
            {
              result: {
                status: 'success',
                lead_id: LEAD_1,
                call_log_id: CALL_1,
                recording_status: 'ready',
                total_tokens: 740,
              },
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  // 1. Cross-tenant recording_s3_key is blocked with 400
  await assert.rejects(
    () =>
      internalService.completeInternalVoiceCall(
        {
          finance_id: FINANCE_A,
          customer_id: CUSTOMER_1,
          call_id: CALL_1,
          recording_s3_key: `voice-recordings/${FINANCE_B}/2026/11/12/${CUSTOMER_1}/${CALL_1}.wav`,
        },
        { queryRunner: runner }
      ),
    (err) => err.statusCode === 400 && err.code === 'cross_tenant_recording_key_mismatch'
  );

  // 2. Valid tenant recording_s3_key + full token & model telemetry succeeds
  const validKey = `voice-recordings/${FINANCE_A}/2026/11/12/${CUSTOMER_1}/${CALL_1}.wav`;
  const res = await internalService.completeInternalVoiceCall(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      call_id: CALL_1,
      lead_id: LEAD_1,
      call_status: 'completed',
      call_lifecycle_status: 'completed',
      answered: true,
      customer_spoke: true,
      duration_seconds: 68,
      language_used: 'ta-IN',
      disposition: 'ptp_confirmed',
      summary_short: 'Customer confirmed ₹4,500 EMI payment on 15 Nov.',
      recording_s3_key: validKey,
      recording_status: 'ready',
      recording_duration_seconds: 68,
      recording_size_bytes: 1088044,
      memory_tokens: 210,
      prompt_tokens: 380,
      completion_tokens: 110,
      summary_tokens: 40,
      tts_characters: 420,
      stt_seconds: 24.5,
      llm_model: 'gpt-4o-mini',
      tts_model: 'bulbul:v4',
      stt_model: 'saaras:v3',
    },
    { queryRunner: runner }
  );

  assert.equal(res.status, 'success');
  assert.equal(capturedCompleteParams.length, 52);
  assert.equal(capturedCompleteParams[1], `af-call-${CALL_1}`); // synced provider_call_id
  assert.equal(capturedCompleteParams[41], validKey); // $42 recording_s3_key
  assert.equal(capturedCompleteParams[46], 740); // $47 total_tokens (210+380+110+40)
  assert.equal(capturedCompleteParams[47], 420); // $48 tts_characters
  assert.equal(capturedCompleteParams[48], 24.5); // $49 stt_seconds
  assert.equal(capturedCompleteParams[49], 'gpt-4o-mini'); // $50 llm_model
  assert.equal(capturedCompleteParams[50], 'bulbul:v4'); // $51 tts_model
  assert.equal(capturedCompleteParams[51], 'saaras:v3'); // $52 stt_model
});

test('Phase D.1: Zero-Trust initiateManualCustomerCall rejects untrusted client fields, offline health, and ineligible calls', async () => {
  // 1. Rejects any extra client fields (`phone`, `financeId`, `dueAmount`, `loanId`)
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(FINANCE_A, {
        customerId: CUSTOMER_1,
        phone: '+919999999999',
      }),
    (err) => err.statusCode === 400 && err.code === 'untrusted_client_fields'
  );

  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(FINANCE_A, {
        customerId: CUSTOMER_1,
        financeId: FINANCE_B,
      }),
    (err) => err.statusCode === 400 && err.code === 'untrusted_client_fields'
  );

  // 2. Rejects with 503 when composite Voice AI health is offline
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_1 },
        {
          checkHealthFn: async () => ({ online: false, status: 'offline' }),
        }
      ),
    (err) => err.statusCode === 503 && err.code === 'voice_system_offline'
  );

  // 3. Rejects with 409 when fn_check_voice_call_eligibility blocks outside IST calling window
  const windowRunner = {
    async query(sql) {
      if (sql.includes('owner_features')) {
        return { rows: [{ owner_id: '01a14ed2-5c6e-79f3-b85f-29b6a3356c19', entitled: true }] };
      }
      if (sql.includes('FROM ai_telecalling_call_logs')) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            eligibility: {
              eligible: false,
              reason_code: 'outside_calling_window',
              message: 'Calls are allowed only between 09:00:00 and 18:00:00 (Asia/Kolkata).',
            },
          },
        ],
      };
    },
  };

  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_1 },
        {
          queryRunner: windowRunner,
          checkHealthFn: async () => ({ online: true, status: 'ready' }),
        }
      ),
    (err) => err.statusCode === 409 && err.code === 'outside_calling_window'
  );
});

test('Phase D.2: initiateManualCustomerCall dispatches server-resolved IDs with mock_telephony and rolls back on dispatch failure', async () => {
  let dispatchedPayload = null;
  const queries = [];

  const runner = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('owner_features')) {
        return { rows: [{ owner_id: '01a14ed2-5c6e-79f3-b85f-29b6a3356c19', entitled: true }] };
      }
      if (sql.includes('fn_check_voice_call_eligibility')) {
        return {
          rows: [
            {
              eligibility: {
                eligible: true,
                reason_code: 'ok',
                loan_id: LOAN_1,
                phone_e164: '+919876543210',
                overdue_amount: 6500,
                days_overdue: 28,
                tts_model: 'bulbul:v4',
                stt_model: 'saaras:v3',
                llm_model: 'gpt-4o-mini',
              },
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO ai_telecalling_leads')) {
        return { rows: [{ lead_id: LEAD_1 }] };
      }
      return { rows: [] };
    },
  };

  // Happy path
  const okResult = await aiService.initiateManualCustomerCall(
    FINANCE_A,
    { customerId: CUSTOMER_1 },
    {
      callId: CALL_1,
      queryRunner: runner,
      checkHealthFn: async () => ({ online: true, status: 'ready' }),
      dispatchFn: async (payload) => {
        dispatchedPayload = payload;
        return { accepted: true, call_lifecycle_status: 'ringing' };
      },
    }
  );

  assert.equal(okResult.callId, CALL_1);
  assert.equal(okResult.leadId, LEAD_1);
  assert.equal(okResult.mockTelephony, true);
  assert.deepEqual(dispatchedPayload, {
    finance_id: FINANCE_A,
    customer_id: CUSTOMER_1,
    loan_id: LOAN_1,
    lead_id: LEAD_1,
    call_id: CALL_1,
    provider_call_id: `mock-${CALL_1}`,
  });

  // Failure path rolls back stuck initiated/connecting status to failed
  queries.length = 0;
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_1 },
        {
          callId: CALL_1,
          queryRunner: runner,
          checkHealthFn: async () => ({ online: true, status: 'ready' }),
          dispatchFn: async () => {
            const e = new Error('Connection refused');
            e.statusCode = 502;
            throw e;
          },
        }
      ),
    (err) => err.statusCode === 502 && err.code === 'voice_dispatch_failed'
  );

  assert.equal(
    queries.some((q) => q.sql.includes("SET call_status = 'failed'") && q.sql.includes('ai_telecalling_call_logs')),
    true
  );
  assert.equal(
    queries.some((q) => q.sql.includes("SET call_status = 'failed'") && q.sql.includes('ai_telecalling_leads')),
    true
  );
});

test('Phase D.3: getCallStatusById returns normalized transcript, recording flag, and token telemetry', async () => {
  const runner = {
    async query() {
      return {
        rows: [
          {
            call_id: CALL_1,
            lead_id: LEAD_1,
            customer_id: CUSTOMER_1,
            loan_id: LOAN_1,
            customer_name: 'Ramesh Kumar',
            hplno: 108,
            call_status: 'completed',
            call_lifecycle_status: 'completed',
            answered: true,
            customer_spoke: true,
            duration_sec: 75,
            started_at: '2026-11-12T05:10:00.000Z',
            ended_at: '2026-11-12T05:11:15.000Z',
            transcript: [
              { sender: 'ai', text: 'வணக்கம் ரமேஷ் சார்', time: '10:40:02' },
              { sender: 'customer', text: 'நாளைக்கு கட்டிறேன் சார்', time: '10:40:15' },
            ],
            summary_text: 'Customer promised to pay tomorrow.',
            outcome: 'ptp_confirmed',
            disposition: 'ptp_confirmed',
            sentiment: 'positive',
            language_used: 'ta-IN',
            recording_s3_key: `voice-recordings/${FINANCE_A}/2026/11/12/${CUSTOMER_1}/${CALL_1}.wav`,
            recording_status: 'ready',
            recording_duration_sec: 75,
            error_detail: null,
            memory_tokens: 180,
            prompt_tokens: 340,
            completion_tokens: 95,
            total_tokens: 615,
            tts_characters: 390,
            stt_seconds: 18.2,
            llm_model: 'gpt-4o-mini',
            tts_model: 'bulbul:v4',
            stt_model: 'saaras:v3',
            promised_date: '2026-11-13',
            promised_amount: 4200,
          },
        ],
      };
    },
  };

  const res = await aiService.getCallStatusById(FINANCE_A, CALL_1, { queryRunner: runner });
  assert.equal(res.call.callId, CALL_1);
  assert.equal(res.call.isTerminal, true);
  assert.equal(res.call.hasRecording, true);
  assert.equal(res.call.transcript.length, 2);
  assert.equal(res.call.transcript[1].speaker, 'customer');
  assert.equal(res.call.telemetry.totalTokens, 615);
  assert.equal(res.call.telemetry.ttsModel, 'bulbul:v4');
});

test('Phase D.4: getCallStatusById separates callLifecycleStatus vs callOutcome, masks phone, and populates extended details', async () => {
  const runner = {
    async query(sql) {
      if (sql.includes('FROM ai_telecalling_call_logs cl')) {
        return {
          rows: [
            {
              call_id: CALL_1,
              lead_id: LEAD_1,
              customer_id: CUSTOMER_1,
              loan_id: LOAN_1,
              customer_name: 'Suresh Babu',
              hplno: 1,
              loan_status: 'active',
              phone_e164: '+919876543210',
              identity_verified: false,
              due_amount_at_call: 29000,
              recording_size_bytes: 0,
              provider_call_id: 'dograh-run-99',
              vehicle_number: 'TN-09-AB-1234',
              vehicle_display: 'Honda Activa',
              call_status: 'completed',
              call_lifecycle_status: 'completed',
              answered: false,
              customer_spoke: false,
              duration_sec: 0,
              started_at: '2026-11-12T05:10:00.000Z',
              ended_at: '2026-11-12T05:10:25.000Z',
              transcript: [],
              summary_text: null,
              summary_short: null,
              customer_stated_reason: null,
              commitment_summary: null,
              observable_tone: null,
              aggression_level: 'none',
              requested_human: false,
              outcome: 'completed',
              disposition: null,
              sentiment: 'neutral',
              language_used: 'ta-IN',
              recording_s3_key: null,
              recording_status: 'not_recorded',
              recording_duration_sec: 0,
              error_detail: null,
              memory_tokens: 120,
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 120,
              tts_characters: 0,
              stt_seconds: 0,
              llm_model: 'gpt-4o-mini',
              tts_model: 'bulbul:v4',
              stt_model: 'saaras:v3',
              promised_date: null,
              promised_amount: null,
            },
          ],
        };
      }
      if (sql.includes('WITH base_loans AS')) {
        return {
          rows: [
            {
              loan_id: LOAN_1,
              customer_id: CUSTOMER_1,
              hplno: 1,
              loan_status: 'active',
              loan_amount: 50000,
              hp_amount: 50000,
              hp_date: '2026-06-07',
              due_date: '2026-06-07',
              customer_created_at: '2026-06-07',
              due_month: 6,
              due_amount: 10000,
              net_payable: 60000,
              loan_penalty_amount: 0,
              paid_main: 10000,
              paid_sub: 9000,
              total_penalty_paid: 0,
              pending_penalties_sum: 0,
              last_payment_date: '2026-08-10',
            },
          ],
        };
      }
      if (sql.includes('broken_ptp_count') && sql.includes('payment_count')) {
        return {
          rows: [
            {
              payment_count: 2,
              on_time_count: 1,
              late_15_30: 1,
              late_31_60: 0,
              late_over_60: 0,
              broken_ptp_count: 1,
              has_seizure: false,
            },
          ],
        };
      }
      if (sql.includes('FROM promise_to_pay ptp')) {
        return {
          rows: [
            {
              ptp_id: '77777777-7777-4777-8777-777777777777',
              call_log_id: '88888888-8888-4888-8888-888888888888',
              loan_id: LOAN_1,
              promised_amount: 10000,
              promised_date: '2026-11-05',
              promised_time_text: 'evening',
              status: 'broken',
              reason: 'salary delay',
              note: null,
              is_superseded: false,
              created_at: '2026-11-01T10:00:00.000Z',
            },
          ],
        };
      }
      if (sql.includes('FROM voice_callbacks vc')) {
        return {
          rows: [
            {
              callback_id: '99999999-9999-4999-8999-999999999999',
              call_id: CALL_1,
              scheduled_at: '2026-11-13T04:30:00.000Z',
              status: 'scheduled',
              source: 'manual',
              note: 'Retry morning',
              cancel_reason: null,
              created_at: '2026-11-12T05:12:00.000Z',
            },
          ],
        };
      }
      if (sql.includes('FROM voice_call_summaries vcs')) {
        return {
          rows: [
            {
              summary_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              call_log_id: '88888888-8888-4888-8888-888888888888',
              loan_id: LOAN_1,
              call_date: '2026-11-01T10:00:00.000Z',
              language_used: 'ta-IN',
              outcome: 'ptp_confirmed',
              summary_short: 'Promised ₹10,000 by Nov 5.',
              customer_stated_reason: 'Salary delayed',
              commitment_summary: '₹10,000 on 2026-11-05',
              observable_tone: 'cooperative',
              requested_human: false,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const res = await aiService.getCallStatusById(FINANCE_A, CALL_1, {
    queryRunner: runner,
    includeExtendedDetails: true,
    asOfDate: '2026-11-12',
  });

  // Transport lifecycle completed, but customer never answered -> callOutcome must NOT be 'completed'
  assert.equal(res.call.callLifecycleStatus, 'completed');
  assert.equal(res.call.callOutcome, 'unanswered');
  assert.equal(res.call.maskedPhone, '+91 ******3210');
  assert.ok(!res.call.maskedPhone.includes('987654'));

  // Extended 9-section details (19,000 paid on 10,000 EMI covers EMI #1 Jul 7; EMI #2 Aug 7 is 97 days overdue on Nov 12)
  assert.ok(res.call.details);
  assert.equal(res.call.details.customer.vehiclePlate, 'TN-09-AB-1234');
  assert.equal(res.call.details.loanLedger.overdueAmount, 31000);
  assert.equal(res.call.details.loanLedger.totalBalanceAmount, 41000);
  assert.equal(res.call.details.loanLedger.daysOverdue, 97);
  assert.equal(res.call.details.ptpCommitments.length, 1);
  assert.equal(res.call.details.callbacks.length, 1);
  assert.equal(res.call.details.previousSummaries.length, 1);
});


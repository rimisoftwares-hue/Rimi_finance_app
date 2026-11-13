'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const FINANCE_A = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_1 = '22222222-2222-4222-8222-222222222222';
const LOAN_1 = '33333333-3333-4333-8333-333333333333';
const LEAD_1 = '44444444-4444-4444-8444-444444444444';
const CALL_1 = '55555555-5555-4555-8555-555555555555';

/**
 * Evaluates PostgreSQL UPDATE provider_call_id semantics faithfully against the SQL query text:
 * - If SQL guards `CASE WHEN provider_call_id LIKE 'mock-%' THEN provider_call_id ...`, mock-* is preserved.
 * - If SQL uses bare `provider_call_id = COALESCE($n, provider_call_id)`, a non-null param overwrites mock-*.
 */
function evalProviderCallIdSqlUpdate(sql, currentProviderCallId, incomingParamValue) {
  const norm = sql.replace(/\s+/g, ' ');
  const hasMockCaseGuard =
    /CASE\s+WHEN\s+provider_call_id\s+LIKE\s+'mock-%'\s+THEN\s+provider_call_id/i.test(norm);

  if (hasMockCaseGuard && String(currentProviderCallId || '').startsWith('mock-')) {
    return currentProviderCallId;
  }
  if (/SET\s+provider_call_id\s*=\s*COALESCE\(\s*provider_call_id\s*,/i.test(norm)) {
    return currentProviderCallId ?? incomingParamValue;
  }
  return incomingParamValue ?? currentProviderCallId;
}

test('Phase 4A.1: mock-* provider_call_id is immutable in SQL across ai.service.js and updateInternalCallStatus and blocks L2/L3/PTP/callbacks/suppressions', async () => {
  const prevMode = process.env.VOICE_TELEPHONY_MODE;
  const prevKill = process.env.VOICE_AI_KILL_SWITCH;
  process.env.VOICE_TELEPHONY_MODE = 'mock';
  process.env.VOICE_AI_KILL_SWITCH = 'false';

  try {
    const aiService = require('./ai.service');
    const internalService = require('./ai.internal.service');

    const executedUpdateSqls = [];
    let callRow = null;
    let ptpWrites = 0;
    let callbackWrites = 0;
    let suppressionWrites = 0;
    let capturedCompleteParams = null;

    const runner = {
      async query(sql, params = []) {
        const norm = sql.replace(/\s+/g, ' ').trim();

        if (norm.includes('owner_features') && norm.includes('ai_voice_agent')) {
          return {
            rows: [{ owner_id: '01a14ed2-5c6e-79f3-b85f-29b6a3356c19', entitled: true }],
          };
        }
        if (
          norm.includes('FROM ai_telecalling_call_logs') &&
          norm.includes("call_lifecycle_status IN ('initiated', 'queued', 'ringing', 'in_progress')") &&
          norm.startsWith('SELECT')
        ) {
          return { rows: [] };
        }
        if (norm.includes('fn_check_voice_call_eligibility')) {
          return {
            rows: [
              {
                eligibility: {
                  eligible: true,
                  reason_code: 'ok',
                  loan_id: LOAN_1,
                  phone_e164: '+919000000001',
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
        if (norm.includes('WITH base_loans AS')) {
          return { rows: [] };
        }
        if (norm.includes('FROM ai_telecalling_call_logs') && norm.includes('idempotency_key = $2')) {
          return { rows: [] };
        }
        if (norm.includes('FROM voice_outbox_events') && norm.includes('idempotency_key = $2')) {
          return { rows: [] };
        }
        if (norm.includes('voice_contact_suppressions')) {
          if (norm.startsWith('INSERT INTO voice_contact_suppressions')) {
            suppressionWrites += 1;
            return { rows: [{ suppression_id: '99999999-9999-4999-8999-999999999999' }] };
          }
          return { rows: [] };
        }
        if (norm.includes('INSERT INTO ai_telecalling_leads')) {
          return {
            rows: [
              {
                lead_id: LEAD_1,
                call_status: 'pending',
                attempt_count: 0,
                daily_attempt_count: 0,
                daily_attempt_date: null,
                last_call_at: null,
              },
            ],
          };
        }
        if (norm.includes('INSERT INTO ai_telecalling_call_logs')) {
          callRow = {
            call_id: params[0],
            finance_id: params[1],
            lead_id: params[2],
            customer_id: params[3],
            loan_id: params[4],
            provider_call_id: params[5],
            phone_e164: params[6],
            call_status: 'connecting',
            call_lifecycle_status: 'initiated',
            answered: false,
            customer_spoke: false,
            disposition: null,
          };
          return { rows: [{ ...callRow }] };
        }
        if (norm.includes('INSERT INTO voice_outbox_events')) {
          return { rows: [] };
        }
        if (norm.includes('UPDATE ai_telecalling_leads')) {
          return { rows: [{ lead_id: LEAD_1 }] };
        }
        if (norm.includes('SELECT') && norm.includes('FROM ai_telecalling_call_logs')) {
          return callRow ? { rows: [{ ...callRow }] } : { rows: [] };
        }
        if (norm.includes('UPDATE ai_telecalling_call_logs')) {
          executedUpdateSqls.push(norm);
          if (norm.includes('SET call_lifecycle_status = $4')) {
            // updateInternalCallStatus ($6 is providerCallId)
            callRow.call_lifecycle_status = params[3];
            callRow.call_status = params[4];
            callRow.provider_call_id = evalProviderCallIdSqlUpdate(
              norm,
              callRow.provider_call_id,
              params[5]
            );
          } else if (norm.includes('SET provider_call_id =')) {
            // completeInternalVoiceCall ($4 is fallbackProviderId)
            callRow.provider_call_id = evalProviderCallIdSqlUpdate(
              norm,
              callRow.provider_call_id,
              params[3]
            );
          } else {
            // ai.service.js ack update ($4 is agentAck?.provider_call_id)
            if (params[2] && ['queued', 'initiated'].includes(callRow.call_lifecycle_status)) {
              callRow.call_lifecycle_status = params[2];
            }
            callRow.provider_call_id = evalProviderCallIdSqlUpdate(
              norm,
              callRow.provider_call_id,
              params[3]
            );
          }
          return { rows: [{ ...callRow }] };
        }
        if (norm.includes('FROM customers c') && norm.includes('WHERE c.id = $1::uuid')) {
          return {
            rows: [
              {
                id: CUSTOMER_1,
                customer_id: CUSTOMER_1,
                finance_id: FINANCE_A,
                phone_e164: '+919000000001',
              },
            ],
          };
        }
        if (norm.includes('FROM ai_telecalling_leads')) {
          return { rows: [{ lead_id: LEAD_1 }] };
        }
        if (norm.includes('INSERT INTO promise_to_pay')) {
          ptpWrites += 1;
          return { rows: [{ ptp_id: '77777777-7777-4777-8777-777777777777' }] };
        }
        if (norm.includes('INSERT INTO voice_callbacks')) {
          callbackWrites += 1;
          return { rows: [{ callback_id: '88888888-8888-4888-8888-888888888888' }] };
        }
        if (norm.includes('fn_complete_voice_call')) {
          capturedCompleteParams = params;
          return { rows: [{ result: { status: 'success' } }] };
        }
        return { rows: [] };
      },
    };

    // 1. Initiate mock call while Python ack attempts to return a non-mock provider_call_id
    const initRes = await aiService.initiateManualCustomerCall(
      FINANCE_A,
      { customerId: CUSTOMER_1 },
      {
        callId: CALL_1,
        idempotencyKey: 'idem-hotfix-immutable-mock-001',
        requireIdempotencyKey: true,
        queryRunner: runner,
        checkHealthFn: async () => ({ online: true, status: 'ready' }),
        dispatchFn: async () => ({
          accepted: true,
          call_lifecycle_status: 'initiated',
          provider_call_id: 'dograh-run-ack-overwrite-attempt',
        }),
      }
    );

    assert.equal(initRes.providerCallId, `mock-${CALL_1}`);
    assert.equal(callRow.provider_call_id, `mock-${CALL_1}`);

    // 2. Later status callback attempts to overwrite provider_call_id with a non-mock ID
    await internalService.updateInternalCallStatus(
      {
        finance_id: FINANCE_A,
        customer_id: CUSTOMER_1,
        call_id: CALL_1,
        call_lifecycle_status: 'in_progress',
        answered: true,
        customer_spoke: true,
        provider_call_id: 'dograh-run-status-overwrite-attempt',
      },
      { queryRunner: runner }
    );

    assert.equal(
      callRow.provider_call_id,
      `mock-${CALL_1}`,
      'updateInternalCallStatus SQL must never overwrite a mock-* provider_call_id'
    );
    assert.ok(
      executedUpdateSqls.every((s) =>
        /CASE WHEN provider_call_id LIKE 'mock-%' THEN provider_call_id/i.test(s)
      ),
      'Both ai.service.js and ai.internal.service.js UPDATE statements must contain SQL CASE WHEN provider_call_id LIKE \'mock-%\''
    );

    // 3. Tool & completion endpoints called WITHOUT mock_telephony and WITH non-mock provider_call_id
    //    must STILL detect mock-* from the immutable DB row and isolate PTP, callbacks, suppressions, summaries & memory
    const ptpRes = await internalService.recordInternalPromiseToPay(
      {
        finance_id: FINANCE_A,
        customer_id: CUSTOMER_1,
        call_id: CALL_1,
        provider_call_id: 'dograh-run-status-overwrite-attempt',
        promised_amount: 2500,
        promised_date: '2026-11-25',
      },
      { queryRunner: runner }
    );
    assert.equal(ptpRes.mockIsolated, true);
    assert.equal(ptpWrites, 0);

    const cbRes = await internalService.recordInternalScheduleCallback(
      {
        finance_id: FINANCE_A,
        customer_id: CUSTOMER_1,
        call_id: CALL_1,
        provider_call_id: 'dograh-run-status-overwrite-attempt',
        scheduled_at: '2026-11-16T10:30:00Z',
      },
      { queryRunner: runner }
    );
    assert.equal(cbRes.mockIsolated, true);
    assert.equal(callbackWrites, 0);

    const supRes = await internalService.recordInternalPrivacyOptOut(
      {
        finance_id: FINANCE_A,
        customer_id: CUSTOMER_1,
        call_id: CALL_1,
        provider_call_id: 'dograh-run-status-overwrite-attempt',
        action_type: 'dnc_only',
        phone_e164: '+919000000001',
      },
      { queryRunner: runner }
    );
    assert.equal(supRes.mockIsolated, true);
    assert.equal(suppressionWrites, 0);

    await internalService.completeInternalVoiceCall(
      {
        finance_id: FINANCE_A,
        customer_id: CUSTOMER_1,
        call_id: CALL_1,
        lead_id: LEAD_1,
        provider_call_id: 'dograh-run-status-overwrite-attempt',
        call_status: 'completed',
        call_lifecycle_status: 'completed',
        disposition: 'opt_out',
        summary_short: 'Should never reach voice_call_summaries',
        rolling_summary: 'Should never reach voice_customer_memory',
        promised_amount: 2500,
        promised_date: '2026-11-25',
        callback_at: '2026-11-16T10:30:00Z',
        explicit_opt_out: true,
      },
      { queryRunner: runner }
    );

    assert.equal(callRow.provider_call_id, `mock-${CALL_1}`);
    assert.ok(capturedCompleteParams);
    assert.equal(capturedCompleteParams[1], `mock-${CALL_1}`);
    assert.equal(capturedCompleteParams[8], 'mock_simulated');
    assert.equal(capturedCompleteParams[11], null, 'summary_short isolated');
    assert.equal(capturedCompleteParams[18], null, 'rolling_summary isolated');
    assert.equal(capturedCompleteParams[23], false, 'explicit_opt_out isolated');
    assert.equal(capturedCompleteParams[25], null, 'promised_amount isolated');
    assert.equal(capturedCompleteParams[28], null, 'callback_at isolated');
  } finally {
    if (prevMode === undefined) delete process.env.VOICE_TELEPHONY_MODE;
    else process.env.VOICE_TELEPHONY_MODE = prevMode;
    if (prevKill === undefined) delete process.env.VOICE_AI_KILL_SWITCH;
    else process.env.VOICE_AI_KILL_SWITCH = prevKill;
  }
});

test('Phase 4A.2: cleanup_mock_voice_data_dry_run.js selects p.ptp_status (not p.status) and remains strictly read-only', async () => {
  const { auditMockVoiceDataDryRun } = require('../../../scripts/cleanup_mock_voice_data_dry_run');

  const executedQueries = [];
  const schemaStrictClient = {
    async query(sql) {
      executedQueries.push(sql);
      if (sql.includes('FROM promise_to_pay')) {
        if (/\bp\.status\b/.test(sql)) {
          throw new Error('column p.status does not exist');
        }
        assert.match(sql, /\bp\.ptp_status\b/);
      }
      return { rows: [] };
    },
    release() {},
  };

  const report = await auditMockVoiceDataDryRun({
    pool: {
      async connect() {
        return schemaStrictClient;
      },
    },
  });

  assert.equal(report.mode, 'DRY_RUN_READ_ONLY');
  assert.equal(report.mutatedRows, 0);
  assert.equal(executedQueries[0].trim(), 'BEGIN TRANSACTION READ ONLY');
  assert.equal(
    executedQueries.some((q) => /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i.test(q)),
    false
  );
});

test('Phase 4A.3: database.config.js refuses non-local DB hosts when NODE_ENV=test unless ALLOW_REMOTE_DB_IN_TESTS=true', () => {
  const backendDir = path.resolve(__dirname, '../../..');
  const dbConfigPath = path.resolve(__dirname, '../../config/database.config.js');

  // 1. Remote host in NODE_ENV=test without ALLOW_REMOTE_DB_IN_TESTS=true must fail closed immediately
  const blockedRun = spawnSync(
    process.execPath,
    [
      '-e',
      `
      const { db } = require(${JSON.stringify(dbConfigPath)});
      (async () => {
        try {
          await db.query('SELECT 1');
          console.log('UNEXPECTED_ALLOWED');
          process.exit(2);
        } catch (err) {
          console.log('BLOCKED_MSG:' + err.message);
          process.exit(0);
        }
      })();
      `,
    ],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DB_HOST: 'remote-prod-cluster.aivencloud.com',
        ALLOW_REMOTE_DB_IN_TESTS: '',
      },
      timeout: 3000,
      encoding: 'utf8',
    }
  );

  assert.equal(blockedRun.status, 0, `Expected exit 0, stderr=${blockedRun.stderr} stdout=${blockedRun.stdout}`);
  assert.match(blockedRun.stdout, /BLOCKED_MSG:.*ALLOW_REMOTE_DB_IN_TESTS/i);

  // 2. Local loopback hosts in NODE_ENV=test are permitted by the host guard
  const localCheckRun = spawnSync(
    process.execPath,
    [
      '-e',
      `
      const cfg = require(${JSON.stringify(dbConfigPath)});
      if (typeof cfg.assertSafeTestDbTarget !== 'function') {
        console.error('MISSING_HELPER');
        process.exit(3);
      }
      cfg.assertSafeTestDbTarget({ NODE_ENV: 'test', DB_HOST: '127.0.0.1' });
      cfg.assertSafeTestDbTarget({ NODE_ENV: 'test', DB_HOST: 'localhost' });
      cfg.assertSafeTestDbTarget({ NODE_ENV: 'test', DB_HOST: '::1' });
      cfg.assertSafeTestDbTarget({
        NODE_ENV: 'test',
        DB_HOST: 'remote-prod-cluster.aivencloud.com',
        ALLOW_REMOTE_DB_IN_TESTS: 'true',
      });
      console.log('GUARD_CHECKS_OK');
      `,
    ],
    {
      cwd: backendDir,
      env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1' },
      timeout: 3000,
      encoding: 'utf8',
    }
  );

  assert.equal(localCheckRun.status, 0, `Expected exit 0, stderr=${localCheckRun.stderr} stdout=${localCheckRun.stdout}`);
  assert.match(localCheckRun.stdout, /GUARD_CHECKS_OK/);
});

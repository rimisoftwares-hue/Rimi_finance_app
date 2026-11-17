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

function evalProviderCallIdSqlUpdate(sql, currentProviderCallId, incomingParamValue) {
  const norm = sql.replace(/\s+/g, ' ');
  if (/SET\s+provider_call_id\s*=\s*COALESCE\(\s*provider_call_id\s*,/i.test(norm)) {
    return currentProviderCallId ?? incomingParamValue;
  }
  return incomingParamValue ?? currentProviderCallId;
}

test('Phase 4A.1: VOICE_TELEPHONY_MODE=mock fails closed and live provider_call_id is preserved across status and completion', async () => {
  const aiService = require('../ai.service');
  const internalService = require('../ai.internal.service');

  // 1. Legacy VOICE_TELEPHONY_MODE='mock' is rejected fail-closed with 503 invalid_telephony_mode
  await assert.rejects(
    () =>
      aiService.initiateManualCustomerCall(
        FINANCE_A,
        { customerId: CUSTOMER_1 },
        {
          env: { VOICE_TELEPHONY_MODE: 'mock' },
          idempotencyKey: 'idem-hotfix-reject-mock-001',
          requireIdempotencyKey: true,
          queryRunner: { async query() { return { rows: [] }; } },
        }
      ),
    (err) => err.statusCode === 503 && err.code === 'invalid_telephony_mode'
  );

  // 2. Real dograh-run-* provider_call_id is persisted and never erased by null follow-ups
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
      if (norm.includes('FROM ai_telecalling_call_logs') && norm.includes('idempotency_key = $2')) {
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
          lead_id: params[1],
          finance_id: params[2],
          customer_id: params[3],
          loan_id: params[4],
          provider_call_id: params[5],
          phone_e164: params[6],
          call_status: 'connecting',
          call_lifecycle_status: 'initiated',
          answered: false,
          customer_spoke: false,
          disposition: null,
          recording_s3_key: null,
          recording_status: 'not_recorded',
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
        if (norm.includes('SET call_lifecycle_status = $4')) {
          callRow.call_lifecycle_status = params[3];
          callRow.call_status = params[4];
          callRow.provider_call_id = evalProviderCallIdSqlUpdate(
            norm,
            callRow.provider_call_id,
            params[5]
          );
        } else if (norm.includes('SET provider_call_id =')) {
          callRow.provider_call_id = evalProviderCallIdSqlUpdate(
            norm,
            callRow.provider_call_id,
            params[3]
          );
        } else {
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
        callRow.call_lifecycle_status = 'completed';
        return { rows: [{ result: { status: 'success' } }] };
      }
      return { rows: [] };
    },
  };

  const initRes = await aiService.initiateManualCustomerCall(
    FINANCE_A,
    { customerId: CUSTOMER_1 },
    {
      callId: CALL_1,
      env: {
        VOICE_TELEPHONY_MODE: 'live_allowlist',
        TEST_ALLOWED_NUMBERS: '+919000000001',
      },
      idempotencyKey: 'idem-hotfix-live-001',
      requireIdempotencyKey: true,
      queryRunner: runner,
      checkHealthFn: async () => ({ online: true, status: 'ready' }),
      dispatchFn: async () => ({
        accepted: true,
        call_lifecycle_status: 'initiated',
        provider_call_id: 'dograh-run-4201',
      }),
    }
  );

  assert.equal(initRes.providerCallId, 'dograh-run-4201');
  assert.equal(callRow.provider_call_id, 'dograh-run-4201');

  // Status update omitting provider_call_id preserves dograh-run-4201 via COALESCE
  await internalService.updateInternalCallStatus(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      call_id: CALL_1,
      call_lifecycle_status: 'in_progress',
      answered: true,
      customer_spoke: true,
    },
    { queryRunner: runner }
  );
  assert.equal(callRow.provider_call_id, 'dograh-run-4201');

  // Real call tool endpoints write PTP, callbacks, and suppressions cleanly without mockIsolated
  const ptpRes = await internalService.recordInternalPromiseToPay(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      call_id: CALL_1,
      promised_amount: 2500,
      promised_date: '2026-11-25',
    },
    { queryRunner: runner }
  );
  assert.equal(ptpRes.ptpId, '77777777-7777-4777-8777-777777777777');
  assert.equal(ptpWrites, 1);

  const cbRes = await internalService.recordInternalScheduleCallback(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      call_id: CALL_1,
      scheduled_at: '2026-11-16T10:30:00Z',
    },
    { queryRunner: runner }
  );
  assert.equal(cbRes.callbackId, '88888888-8888-4888-8888-888888888888');
  assert.equal(callbackWrites, 1);

  const supRes = await internalService.recordInternalPrivacyOptOut(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      call_id: CALL_1,
      action_type: 'dnc_only',
      phone_e164: '+919000000001',
    },
    { queryRunner: runner }
  );
  assert.equal(supRes.suppressionId, '99999999-9999-4999-8999-999999999999');
  assert.equal(suppressionWrites, 1);

  await internalService.completeInternalVoiceCall(
    {
      finance_id: FINANCE_A,
      customer_id: CUSTOMER_1,
      call_id: CALL_1,
      lead_id: LEAD_1,
      call_status: 'completed',
      call_lifecycle_status: 'completed',
      disposition: 'ptp_confirmed',
      summary_short: 'Customer promised Rs 2500 on 2026-11-25.',
      promised_amount: 2500,
      promised_date: '2026-11-25',
    },
    { queryRunner: runner }
  );

  assert.equal(callRow.provider_call_id, 'dograh-run-4201');
  assert.equal(capturedCompleteParams[1], 'dograh-run-4201');
  assert.equal(capturedCompleteParams[8], 'ptp_confirmed');
});

test('Phase 4A.2: cleanup_mock_voice_data_dry_run.js selects p.ptp_status (not p.status) and remains strictly read-only', async () => {
  const { auditMockVoiceDataDryRun } = require('../../../../../scripts/cleanup_mock_voice_data_dry_run');

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
  const backendDir = path.resolve(__dirname, '../../../../..');
  const dbConfigPath = path.resolve(__dirname, '../../../../config/database.config.js');

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

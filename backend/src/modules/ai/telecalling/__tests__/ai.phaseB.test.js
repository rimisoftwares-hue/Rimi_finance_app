'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreCustomer } = require('../../../risk/risk.scoring');
const aiService = require('../ai.service');
const aiRoutes = require('../../ai.routes');
const {
  checkVoiceSystemHealth,
  clearVoiceHealthCache,
  signInternalPayload,
  verifyInternalSignature,
} = require('../voiceAgent.client');
const {
  validateRecordingS3Key,
  buildVoiceRecordingS3Key,
  buildVoiceRecordingPutOnlyIamPolicy,
} = require('../voiceRecording.s3');

const TENANT_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '20000000-0000-4000-8000-000000000999';

function buildSampleLeadRows() {
  return [
    // Customer 1: Never called, high overdue (95 days), has KYC photo
    {
      customer_id: '10000000-0000-4000-8000-000000000001',
      lead_id: '30000000-0000-4000-8000-000000000001',
      raw_lead_id: '30000000-0000-4000-8000-000000000001',
      customer_name: 'Karthik Subramanian',
      hplno: 101,
      loan_status: 'active',
      customer_created_at: '2026-01-10',
      loan_uuid: '40000000-0000-4000-8000-000000000001',
      loan_type: 'Two Wheeler Loan',
      hp_amount: 80000,
      hp_date: '2026-01-10',
      due_date: '2026-02-10',
      due_month: 24,
      interest_rate: 14,
      penalty_amount: 500,
      emi_amount: 4200,
      net_payable: 100800,
      vehicle_number: 'TN-09-AB-1234',
      vehicle_brand: 'TVS',
      vehicle_model_name: 'Apache RTR 160',
      vehicle_display: 'TVS Apache RTR 160',
      phone: '+919876500001',
      phones: [{ number: '9876500001', type: 'mobile', contactType: 'customer' }],
      photo_s3_key: 'kyc/customers/10000000-0000-4000-8000-000000000001/photo.jpg',
      overdue_amount: 16800,
      pending_penalty_amount: 500,
      total_overdue_with_penalty: 17300,
      total_paid_amount: 21000,
      total_balance_amount: 79800,
      unpaid_months: 4,
      paid_months: 5,
      days_overdue: 95,
      earliest_unpaid_due_iso: '2026-08-08',
      due_date_label: '08 Aug 2026',
      risk_total_paid: 21000,
      payment_count: 5,
      on_time_count: 3,
      late_15_30: 1,
      late_31_60: 1,
      late_over_60: 0,
      broken_ptp_count: 1,
      has_seizure: false,
      lead_call_status: 'uncalled',
      lead_attempt_count: 0,
      last_call_at: null,
      lead_last_call_duration: null,
      lead_notes: null,
      lead_call_outcome_note: null,
      scheduled_time: null,
      scheduled_time_label: null,
      is_suppressed: false,
      last_call_id: null,
      last_log_status: null,
      last_call_outcome: null,
      last_call_disposition: null,
      last_call_answered: false,
      last_call_customer_spoke: false,
      last_call_duration_sec: 0,
      last_call_summary: null,
      last_recording_s3_key: null,
      last_recording_status: 'none',
      last_promised_date: null,
      last_promised_amount: null,
      last_call_sentiment: 'neutral',
      total_call_logs_count: 0,
      attempts_today: 0,
      called_and_spoken_today: false,
      no_response_today: false,
    },
    // Customer 2: Attempted today, rang out / no response (answered = false, customer_spoke = false)
    // MUST NOT count as "calledToday" or "Completed"! Must count as "noResponse" and "readyToCall".
    {
      customer_id: '10000000-0000-4000-8000-000000000002',
      lead_id: '30000000-0000-4000-8000-000000000002',
      raw_lead_id: '30000000-0000-4000-8000-000000000002',
      customer_name: 'Meena Lakshmi',
      hplno: 102,
      loan_status: 'active',
      customer_created_at: '2026-03-01',
      loan_uuid: '40000000-0000-4000-8000-000000000002',
      loan_type: 'Two Wheeler Loan',
      hp_amount: 60000,
      hp_date: '2026-03-01',
      due_date: '2026-04-01',
      due_month: 18,
      interest_rate: 12,
      penalty_amount: 0,
      emi_amount: 3800,
      net_payable: 68400,
      vehicle_number: 'TN-10-XY-5678',
      vehicle_brand: 'Honda',
      vehicle_model_name: 'Activa 6G',
      vehicle_display: 'Honda Activa 6G',
      phone: '+919876500002',
      phones: [{ number: '9876500002', type: 'mobile', contactType: 'customer' }],
      photo_s3_key: null,
      overdue_amount: 7600,
      pending_penalty_amount: 0,
      total_overdue_with_penalty: 7600,
      total_paid_amount: 19000,
      total_balance_amount: 49400,
      unpaid_months: 2,
      paid_months: 5,
      days_overdue: 42,
      earliest_unpaid_due_iso: '2026-09-30',
      due_date_label: '30 Sep 2026',
      risk_total_paid: 19000,
      payment_count: 5,
      on_time_count: 5,
      late_15_30: 0,
      late_31_60: 0,
      late_over_60: 0,
      broken_ptp_count: 0,
      has_seizure: false,
      lead_call_status: 'failed',
      lead_attempt_count: 1,
      last_call_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      lead_last_call_duration: '0:00',
      lead_notes: null,
      lead_call_outcome_note: null,
      scheduled_time: null,
      scheduled_time_label: null,
      is_suppressed: false,
      last_call_id: '50000000-0000-4000-8000-000000000002',
      last_log_status: 'no_answer',
      last_call_outcome: 'no_response',
      last_call_disposition: 'no_answer',
      last_call_answered: false,
      last_call_customer_spoke: false,
      last_call_duration_sec: 0,
      last_call_summary: null,
      last_recording_s3_key: null,
      last_recording_status: 'none',
      last_promised_date: null,
      last_promised_amount: null,
      last_call_sentiment: 'neutral',
      total_call_logs_count: 1,
      attempts_today: 1,
      called_and_spoken_today: false,
      no_response_today: true,
    },
    // Customer 3: Answered AND customer spoke today -> counts in `calledToday`, NOT `readyToCall`
    {
      customer_id: '10000000-0000-4000-8000-000000000003',
      lead_id: '30000000-0000-4000-8000-000000000003',
      raw_lead_id: '30000000-0000-4000-8000-000000000003',
      customer_name: 'Senthil Nathan',
      hplno: 103,
      loan_status: 'active',
      customer_created_at: '2026-05-01',
      loan_uuid: '40000000-0000-4000-8000-000000000003',
      loan_type: 'Two Wheeler Loan',
      hp_amount: 50000,
      hp_date: '2026-05-01',
      due_date: '2026-06-01',
      due_month: 12,
      interest_rate: 12,
      penalty_amount: 0,
      emi_amount: 4500,
      net_payable: 54000,
      vehicle_number: 'TN-22-CD-9012',
      vehicle_brand: 'Bajaj',
      vehicle_model_name: 'Pulsar 150',
      vehicle_display: 'Bajaj Pulsar 150',
      phone: '+919876500003',
      phones: [{ number: '9876500003', type: 'mobile', contactType: 'customer' }],
      photo_s3_key: null,
      overdue_amount: 4500,
      pending_penalty_amount: 0,
      total_overdue_with_penalty: 4500,
      total_paid_amount: 22500,
      total_balance_amount: 31500,
      unpaid_months: 1,
      paid_months: 5,
      days_overdue: 18,
      earliest_unpaid_due_iso: '2026-10-25',
      due_date_label: '25 Oct 2026',
      risk_total_paid: 22500,
      payment_count: 5,
      on_time_count: 5,
      late_15_30: 0,
      late_31_60: 0,
      late_over_60: 0,
      broken_ptp_count: 0,
      has_seizure: false,
      lead_call_status: 'completed',
      lead_attempt_count: 1,
      last_call_at: new Date(Date.now() - 1800 * 1000).toISOString(),
      lead_last_call_duration: '1:24',
      lead_notes: 'Promised to pay via UPI tomorrow',
      lead_call_outcome_note: 'Customer promised to pay ₹4,500 on 2026-11-13',
      scheduled_time: null,
      scheduled_time_label: null,
      is_suppressed: false,
      last_call_id: '50000000-0000-4000-8000-000000000003',
      last_log_status: 'completed',
      last_call_outcome: 'promise_to_pay',
      last_call_disposition: 'promise_to_pay',
      last_call_answered: true,
      last_call_customer_spoke: true,
      last_call_duration_sec: 84,
      last_call_summary: 'Customer promised to pay ₹4,500 on 2026-11-13',
      last_recording_s3_key: `voice-recordings/${TENANT_ID}/2026/11/12/10000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-000000000003.wav`,
      last_recording_status: 'uploaded',
      last_promised_date: '2026-11-13',
      last_promised_amount: 4500,
      last_call_sentiment: 'positive',
      total_call_logs_count: 1,
      attempts_today: 1,
      called_and_spoken_today: true,
      no_response_today: false,
    },
  ];
}

test('Phase B: Rimi Backend Read APIs, Risk Score Reuse, Separate Lead Refresh & Composite Voice Health', async (t) => {
  await t.test('1. GET /api/ai/leads is strictly read-only, computes accurate KPIs, separates status vs outcome, and matches scoreCustomer() 1:1', async () => {
    const executedSql = [];
    const presignedKeys = [];
    const sampleRows = buildSampleLeadRows();

    const mockRunner = {
      async query(sql, params) {
        executedSql.push({ sql, params });
        if (sql.includes('FROM customers c')) {
          return { rows: sampleRows };
        }
        if (sql.includes('SELECT leads_last_refreshed_at')) {
          return { rows: [{ leads_last_refreshed_at: '2026-11-12T04:00:00.000Z' }] };
        }
        return { rows: [] };
      },
    };

    const result = await aiService.getTelecallingLeads(
      TENANT_ID,
      { page: 1, limit: 25 },
      {
        queryRunner: mockRunner,
        asOfDate: '2026-11-12',
        presignPhotoFn: async (key, ttl) => {
          presignedKeys.push({ key, ttl });
          return `https://s3.signed.local/${key}?expires=${ttl}`;
        },
      }
    );

    // 1. Strictly read-only: never executes fn_refresh_daily_overdue_leads or DML inside GET /api/ai/leads
    assert.ok(
      !executedSql.some((q) => /fn_refresh_daily_overdue_leads|INSERT|UPDATE|DELETE/i.test(q.sql)),
      'GET /api/ai/leads must never run fn_refresh_daily_overdue_leads or DML inline'
    );

    // 2. KPI Summary Cards accuracy across unique customer_ids
    assert.equal(result.summary.unpaidLeads, 3);
    assert.equal(result.summary.calledToday, 1, 'Only answered + customer_spoke today counts as calledToday');
    assert.equal(result.summary.noResponse, 1, 'Unanswered attempt today counts as noResponse');
    assert.equal(result.summary.readyToCall, 2, 'Never-called + unanswered leads remain readyToCall');

    // 3. Lead status vs outcome separation
    const karthik = result.leads.find((l) => l.customerName === 'Karthik Subramanian');
    const meena = result.leads.find((l) => l.customerName === 'Meena Lakshmi');
    const senthil = result.leads.find((l) => l.customerName === 'Senthil Nathan');

    assert.equal(karthik.callSessionStatus, 'uncalled');
    assert.equal(karthik.lastCallOutcome, 'never_called');
    assert.equal(karthik.callHistoryLabel, 'Never Called');
    assert.equal(karthik.callOutcomeNote, undefined, 'Never-called lead must not have a fake failure note');
    assert.equal(
      karthik.photoUrl,
      'https://s3.signed.local/kyc/customers/10000000-0000-4000-8000-000000000001/photo.jpg?expires=900'
    );
    assert.equal(presignedKeys.length, 1, 'Only rows with photo_s3_key on the current page are presigned');

    assert.equal(meena.callSessionStatus, 'failed');
    assert.equal(meena.lastCallOutcome, 'no_response');
    assert.equal(meena.callHistoryLabel, 'No Response');
    assert.equal(meena.calledToday, false);
    assert.equal(meena.noResponse, true);

    assert.equal(senthil.callSessionStatus, 'completed');
    assert.equal(senthil.lastCallOutcome, 'promise_to_pay');
    assert.equal(senthil.callHistoryLabel, 'Completed');
    assert.equal(senthil.calledToday, true);
    assert.equal(senthil.lastCallDetails.hasRecording, true);

    // 4. Risk Score reuse matches risk.scoring.js 1:1
    const expectedKarthikScore = scoreCustomer(
      {
        loanStatus: 'active',
        dueAmount: 4200,
        netPayable: 100800,
        hpAmount: 80000,
        dueMonth: 24,
        totalPaid: 21000,
        hpDate: '2026-01-10',
        dueDate: '2026-02-10',
        customerCreatedAt: '2026-01-10',
        asOfDate: '2026-11-12',
      },
      {
        totalPayments: 5,
        onTimePayments: 3,
        late15to30: 1,
        late31to60: 1,
        lateOver60: 0,
        brokenPtpCount: 1,
        hasSeizure: false,
      }
    );
    assert.equal(karthik.riskScore, expectedKarthikScore.due.dueRiskScore);
    assert.equal(karthik.riskLevel, expectedKarthikScore.riskLevel);
    assert.equal(karthik.creditScore, expectedKarthikScore.credit.creditScore);
  });

  await t.test('2. GET /api/ai/leads supports server-side search, status/risk/bucket filters, sorting, and pagination', async () => {
    const sampleRows = buildSampleLeadRows();
    const mockRunner = {
      async query(sql) {
        if (sql.includes('FROM customers c')) return { rows: sampleRows };
        return { rows: [] };
      },
    };

    const searchRes = await aiService.getTelecallingLeads(
      TENANT_ID,
      { search: 'Activa', status: 'no_response' },
      { queryRunner: mockRunner, asOfDate: '2026-11-12', presignPhotoFn: async () => null }
    );
    assert.equal(searchRes.leads.length, 1);
    assert.equal(searchRes.leads[0].customerName, 'Meena Lakshmi');
    // Tenant summary KPIs remain global across all 3 overdue customers even when table is filtered
    assert.equal(searchRes.summary.unpaidLeads, 3);

    const bucketRes = await aiService.getTelecallingLeads(
      TENANT_ID,
      { overdueBucket: '90+' },
      { queryRunner: mockRunner, asOfDate: '2026-11-12', presignPhotoFn: async () => null }
    );
    assert.equal(bucketRes.leads.length, 1);
    assert.equal(bucketRes.leads[0].customerName, 'Karthik Subramanian');

    const pagedRes = await aiService.getTelecallingLeads(
      TENANT_ID,
      { sortBy: 'dueAmount', sortDir: 'asc', page: 2, limit: 1 },
      { queryRunner: mockRunner, asOfDate: '2026-11-12', presignPhotoFn: async () => null }
    );
    assert.equal(pagedRes.pagination.totalItems, 3);
    assert.equal(pagedRes.pagination.totalPages, 3);
    assert.equal(pagedRes.pagination.page, 2);
    assert.equal(pagedRes.leads[0].customerName, 'Meena Lakshmi');
  });

  await t.test('3. POST /api/ai/leads/refresh enforces per-tenant cooldown and calls fn_refresh_daily_overdue_leads when expired', async () => {
    let refreshSqlCalled = 0;
    const recentTs = new Date(Date.now() - 15 * 1000).toISOString(); // 15s ago (< 60s cooldown)

    const cooldownRunner = {
      async query(sql) {
        if (sql.includes('SELECT leads_last_refreshed_at')) {
          return { rows: [{ leads_last_refreshed_at: recentTs }] };
        }
        if (sql.includes('SELECT COUNT(*)::int AS active_lead_count')) {
          return { rows: [{ active_lead_count: 15 }] };
        }
        if (sql.includes('fn_refresh_daily_overdue_leads')) {
          refreshSqlCalled += 1;
          return { rows: [{ refreshed_count: 15 }] };
        }
        return { rows: [] };
      },
    };

    const blocked = await aiService.refreshTelecallingLeads(TENANT_ID, {
      queryRunner: cooldownRunner,
      cooldownSeconds: 60,
    });
    assert.equal(blocked.refreshed, false);
    assert.equal(blocked.cooldownActive, true);
    assert.ok(blocked.cooldownRemainingSeconds >= 40 && blocked.cooldownRemainingSeconds <= 60);
    assert.equal(refreshSqlCalled, 0, 'Must not run fn_refresh_daily_overdue_leads during cooldown');

    const expiredTs = new Date(Date.now() - 120 * 1000).toISOString(); // 120s ago (> 60s cooldown)
    const activeRunner = {
      async query(sql) {
        if (sql.includes('SELECT leads_last_refreshed_at')) {
          return { rows: [{ leads_last_refreshed_at: expiredTs }] };
        }
        if (sql.includes('fn_refresh_daily_overdue_leads')) {
          refreshSqlCalled += 1;
          return { rows: [{ refreshed_count: 12 }] };
        }
        if (sql.includes('INSERT INTO ai_settings')) {
          return { rows: [{ leads_last_refreshed_at: new Date().toISOString() }] };
        }
        return { rows: [] };
      },
    };

    const executed = await aiService.refreshTelecallingLeads(TENANT_ID, {
      queryRunner: activeRunner,
      cooldownSeconds: 60,
    });
    assert.equal(executed.refreshed, true);
    assert.equal(executed.cooldownActive, false);
    assert.equal(executed.refreshedCount, 12);
    assert.equal(refreshSqlCalled, 1);
  });

  await t.test('4. Composite Voice Health requires BOTH Dograh gateway and Python Voice Agent to succeed', async () => {
    clearVoiceHealthCache();

    // Case A: Both healthy -> status: 'ready', online: true
    const bothHealthyFetch = async (url) => ({
      ok: true,
      status: 200,
      async json() {
        if (url.includes('voice.rimio.in')) return { status: 'ok' };
        return { status: 'ok', ready: true, db_read_only_ok: true, redis_ok: true };
      },
    });

    const readyRes = await checkVoiceSystemHealth({
      forceRefresh: true,
      fetchImpl: bothHealthyFetch,
    });
    assert.equal(readyRes.status, 'ready');
    assert.equal(readyRes.online, true);
    assert.equal(readyRes.checks.dograhGateway.ok, true);
    assert.equal(readyRes.checks.voiceAgent.ok, true);

    // Case B: Dograh gateway healthy, Python Voice Agent down -> status: 'offline', online: false
    const agentDownFetch = async (url) => {
      if (url.includes('voice.rimio.in')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { status: 'ok' };
          },
        };
      }
      throw new Error('ECONNREFUSED');
    };

    const partialDownRes = await checkVoiceSystemHealth({
      forceRefresh: true,
      fetchImpl: agentDownFetch,
    });
    assert.equal(partialDownRes.status, 'offline');
    assert.equal(partialDownRes.online, false);
    assert.equal(partialDownRes.checks.dograhGateway.ok, true);
    assert.equal(partialDownRes.checks.voiceAgent.ok, false);

    // Case C: Both reachable, but Voice Agent reports RO-DB unhealthy -> status: 'offline'
    const dbDownFetch = async (url) => ({
      ok: true,
      status: 200,
      async json() {
        if (url.includes('voice.rimio.in')) return { status: 'ok' };
        return { status: 'ok', db_read_only_ok: false, redis_ok: true };
      },
    });

    const dbDownRes = await checkVoiceSystemHealth({
      forceRefresh: true,
      fetchImpl: dbDownFetch,
    });
    assert.equal(dbDownRes.status, 'offline');
    assert.equal(dbDownRes.online, false);
  });

  await t.test('5. S3 Recording Playback enforces tenant prefix isolation & PutObject-only IAM policy', async () => {
    const validKey = buildVoiceRecordingS3Key({
      financeId: TENANT_ID,
      customerId: '10000000-0000-4000-8000-000000000003',
      callId: '50000000-0000-4000-8000-000000000003',
      startedAt: new Date('2026-11-12T06:00:00Z'),
    });
    assert.equal(
      validKey,
      `voice-recordings/${TENANT_ID}/2026/11/12/10000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-000000000003.wav`
    );

    assert.equal(validateRecordingS3Key(validKey, TENANT_ID).valid, true);
    assert.equal(
      validateRecordingS3Key(validKey, OTHER_TENANT_ID).valid,
      false,
      'Must reject cross-tenant recording key'
    );
    assert.equal(
      validateRecordingS3Key('kyc/customers/secret.jpg', TENANT_ID).valid,
      false,
      'Must reject non-voice-recordings prefix'
    );

    const mockRunner = {
      async query() {
        return {
          rows: [
            {
              call_id: '50000000-0000-4000-8000-000000000003',
              customer_id: '10000000-0000-4000-8000-000000000003',
              recording_s3_key: validKey,
              recording_status: 'uploaded',
              recording_duration_sec: 84,
            },
          ],
        };
      },
    };

    const playback = await aiService.getCallRecordingPlaybackUrl(
      TENANT_ID,
      '50000000-0000-4000-8000-000000000003',
      {
        queryRunner: mockRunner,
        presignRecordingFn: async (key, ttl) => `https://s3.signed.local/${key}?ttl=${ttl}`,
      }
    );
    assert.equal(playback.expiresInSeconds, 300);
    assert.ok(playback.playbackUrl.includes('ttl=300'));

    const iamPolicy = buildVoiceRecordingPutOnlyIamPolicy('autofinex-prod-bucket');
    assert.deepEqual(iamPolicy.Statement[0].Action, ['s3:PutObject']);
    assert.deepEqual(iamPolicy.Statement[0].Resource, [
      'arn:aws:s3:::autofinex-prod-bucket/voice-recordings/*',
    ]);
  });

  await t.test('6. HMAC-SHA256 internal request signing and replay protection', async () => {
    const secret = 'test-hmac-secret-32-bytes-minimum-key';
    const payload = { finance_id: TENANT_ID, call_id: '50000000-0000-4000-8000-000000000003' };
    const nowSec = 1762920000;

    const signed = signInternalPayload(payload, secret, nowSec);
    const verified = verifyInternalSignature({
      rawBody: signed.rawBody,
      timestamp: signed.timestamp,
      signature: signed.signature,
      secret,
      nowSec: nowSec + 10,
    });
    assert.equal(verified.valid, true);

    const expired = verifyInternalSignature({
      rawBody: signed.rawBody,
      timestamp: signed.timestamp,
      signature: signed.signature,
      secret,
      nowSec: nowSec + 600,
    });
    assert.equal(expired.valid, false);
    assert.equal(expired.reason, 'timestamp_out_of_bounds');
  });

  await t.test('7. Route handlers expose /voice-health, /leads/refresh, and /calls/:callId/recording-url', async () => {
    assert.equal(typeof aiRoutes.handleGetVoiceHealth, 'function');
    assert.equal(typeof aiRoutes.handleRefreshLeads, 'function');
    assert.equal(typeof aiRoutes.handleGetCallRecordingUrl, 'function');
  });
});


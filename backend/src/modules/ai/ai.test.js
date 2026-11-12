'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Rimi Finance /api/ai Multi-Tenant Service & Routes Suite', async (t) => {
  const aiService = require('./ai.service');
  const aiRoutes = require('./ai.routes');

  const TENANT_A = '01960000-0000-7000-8000-000000000101';
  const TENANT_B = '01960000-0000-7000-8000-000000000202';

  await t.test('1. getAiSettings & updateAiSettings scope strictly by financeId and bump config_version', async () => {
    const executedQueries = [];
    const mockRunner = {
      async query(sql, params) {
        executedQueries.push({ sql, params });
        if (sql.includes('INSERT INTO ai_settings')) {
          return {
            rows: [
              {
                finance_id: params[0],
                company_rules: JSON.parse(params[1]),
                system_instructions: params[2],
                behavior_flags: JSON.parse(params[3]),
                escalation_policy: JSON.parse(params[4]),
                voice_config: JSON.parse(params[5]),
                config_version: 2,
              },
            ],
          };
        }
        if (sql.includes('FROM ai_settings')) {
          return {
            rows: [
              {
                finance_id: TENANT_A,
                company_rules: { leaveDate: '2026-11-15', leaveReason: 'Deepavali', notificationsEnabled: true },
                system_instructions: 'Speak polite Tamil.',
                behavior_flags: { autoReply: true, paymentReminder: true, followUpReminder: true, escalationAlerts: true },
                escalation_policy: { negativeAction: 'notify_admin', noResponseHours: 24, autoFollowUp: true },
                voice_config: { enabled: true, default_language: 'ta-IN', tts_voice: 'gokul_ta_narration' },
                config_version: 1,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const current = await aiService.getAiSettings(TENANT_A, { queryRunner: mockRunner });
    assert.equal(current.configVersion, 1);
    assert.equal(current.voiceConfig.tts_voice, 'gokul_ta_narration');

    const updated = await aiService.updateAiSettings(
      TENANT_A,
      {
        companyRules: { leaveDate: '2026-11-15', leaveReason: 'Deepavali', notificationsEnabled: true },
        aiInstructions: 'Speak polite Tamil and ask one question per turn.',
        behavior: { autoReply: true, paymentReminder: true, followUpReminder: true, escalationAlerts: true },
        escalation: { negativeAction: 'assign_agent', noResponseHours: '12', autoFollowUp: true },
        voiceConfig: { enabled: true, default_language: 'ta-IN', tts_voice: 'ritu' },
      },
      { queryRunner: mockRunner, userId: '01960000-0000-7000-8000-000000000999' }
    );

    assert.equal(updated.configVersion, 2);
    // Legacy v3 voice 'ritu' normalized automatically to Sarvam bulbul:v4-flash voice!
    assert.equal(updated.voiceConfig.tts_voice, 'gokul_ta_narration');
    assert.ok(executedQueries.every((q) => q.params.includes(TENANT_A)));
    assert.ok(!executedQueries.some((q) => q.params.includes(TENANT_B)));
  });

  await t.test('2. scheduleLeadCallbacks writes voice_callbacks and NEVER marks customer DNC', async () => {
    const sqlLog = [];
    const mockRunner = {
      async query(sql, params) {
        sqlLog.push({ sql, params });
        if (sql.includes('SELECT id, customer_id, loan_id, phone_e164 FROM ai_telecalling_leads')) {
          return {
            rows: [
              {
                id: 'lead-uuid-1',
                customer_id: 'cust-uuid-1',
                loan_id: 'loan-uuid-1',
                phone_e164: '+919876543210',
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO voice_callbacks')) {
          return { rows: [{ id: 'cb-uuid-1' }] };
        }
        return { rows: [] };
      },
    };

    const res = await aiService.scheduleLeadCallbacks(
      TENANT_A,
      {
        leadIds: ['lead-uuid-1'],
        scheduledAtIso: '2026-11-12T10:30:00+05:30',
        schedulePreset: 'Tomorrow 10:30 AM',
        note: 'Customer requested office break call',
      },
      { queryRunner: mockRunner }
    );

    assert.equal(res.scheduledCount, 1);
    assert.ok(sqlLog.some((q) => q.sql.includes('INSERT INTO voice_callbacks')));
    assert.ok(sqlLog.some((q) => q.sql.includes('UPDATE ai_telecalling_leads')));
    // HARD INVARIANT: Scheduling a callback must NEVER touch voice_contact_suppressions or is_dnc
    assert.ok(!sqlLog.some((q) => q.sql.includes('voice_contact_suppressions')));
    assert.ok(!sqlLog.some((q) => q.sql.includes('is_dnc')));
  });

  await t.test('3. triggerLeadCall is deprecated and fails closed with 410 Gone (endpoint_deprecated)', async () => {
    await assert.rejects(
      () => aiService.triggerLeadCall(TENANT_A, 'lead-active'),
      (err) => err.statusCode === 410 && err.code === 'endpoint_deprecated'
    );
  });

  await t.test('4. GET /dashboard route handler returns { success: true, ... } scoped to req.financeId', async () => {
    const orig = aiService.getDashboardOverview;
    try {
      let seenFinance = null;
      aiService.getDashboardOverview = async (fid) => {
        seenFinance = fid;
        return {
          kpis: { totalCalls: 42, activeConversations: 3, positivePct: 76, negativePct: 8, remindersSent: 30, followUpPending: 5 },
          sentimentData: [],
          volumeData: [],
          recentInteractions: [],
        };
      };

      let statusCode = 200;
      let body = null;
      const req = { financeId: TENANT_A };
      const res = {
        status(c) {
          statusCode = c;
          return this;
        },
        json(p) {
          body = p;
          return this;
        },
      };

      await aiRoutes.handleGetDashboard(req, res);
      assert.equal(statusCode, 200);
      assert.equal(seenFinance, TENANT_A);
      assert.equal(body.success, true);
      assert.equal(body.kpis.totalCalls, 42);
    } finally {
      aiService.getDashboardOverview = orig;
    }
  });
});


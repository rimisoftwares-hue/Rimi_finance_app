'use strict';

process.env.NODE_ENV = 'test';

const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const {
  checkRequiredAiEnv,
  assertRequiredAiEnvOnBoot,
} = require('../../../../config/env.loader');
const { db } = require('../../../../config/database.config');
const { getJwtSecret, computePasswordFingerprint } = require('../../../auth/sessionSecurity.service');
const aiService = require('../../telecalling/ai.service');
const { setSarvamHealthImplForTest } = require('../providers/sarvamClient');
const { setGeminiHealthImplForTest } = require('../providers/geminiStream.provider');
const { setReadOnlyRunnerForTest } = require('../security/readOnlyDbPool');
const { attachAssistantWebSocketGateway } = require('../gateway/assistantWs.gateway');

const TEST_OWNER_ID = '01960000-0000-7000-8000-000000000901';
const TEST_FINANCE_ID = '01960000-0000-7000-8000-000000000101';

test('Phase 1 Boot Smoke: env.loader lists missing variable NAMES only (never secret values)', () => {
  const fakeSecret = 'sk_SUPER_SECRET_NEVER_PRINT_123456';
  const check = checkRequiredAiEnv({
    SARVAM_API_KEY: fakeSecret,
    GEMINI_API_KEY: '',
  });
  assert.equal(check.ok, false);
  assert.deepEqual(check.missing, ['GEMINI_API_KEY']);

  const warnLogs = [];
  const errLogs = [];
  assert.throws(
    () =>
      assertRequiredAiEnvOnBoot(
        { SARVAM_API_KEY: fakeSecret, GEMINI_API_KEY: '' },
        {
          strict: true,
          logger: {
            warn: (m) => warnLogs.push(m),
            error: (m) => errLogs.push(m),
          },
        }
      ),
    (err) => {
      assert.equal(err.code, 'MISSING_AI_ENV_KEYS');
      assert.match(err.message, /GEMINI_API_KEY/);
      assert.ok(!err.message.includes(fakeSecret), 'Must never include secret values');
      return true;
    }
  );
  assert.ok(!errLogs.join(' ').includes(fakeSecret));
});

test('Phase 1 Boot Smoke: full Express app + WS gateway boots and GET /api/ai/dashboard + /api/ai/assistant/health return 200', async () => {
  // Importing full `src/app.js` verifies every `require()` across backend resolves cleanly
  const { app } = require('../../../../app');

  const origDbQuery = db.query;
  const origDashboard = aiService.getDashboardOverview;
  const pwdHash = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
  const pwdFp = computePasswordFingerprint(pwdHash);

  db.query = async (sql) => {
    const text = String(sql || '');
    if (text.includes('FROM owner')) {
      return {
        rows: [
          {
            id: TEST_OWNER_ID,
            username: 'smoke_owner',
            password: pwdHash,
            is_active: 1,
          },
        ],
      };
    }
    if (text.includes('FROM finance_detail')) {
      return {
        rows: [
          {
            id: TEST_FINANCE_ID,
            owner_id: TEST_OWNER_ID,
            is_active: 1,
            finance_name: 'Smoke Test Finance',
          },
        ],
      };
    }
    return { rows: [] };
  };

  aiService.getDashboardOverview = async (financeId) => ({
    kpis: {
      totalCalls: 18,
      activeConversations: 2,
      positivePct: 80,
      negativePct: 5,
      remindersSent: 15,
      followUpPending: 3,
    },
    sentimentData: [],
    volumeData: [],
    recentInteractions: [],
    verifiedFinanceId: financeId,
  });

  setGeminiHealthImplForTest(async () => ({
    ok: true,
    category: null,
    primaryModel: 'gemini-3.5-flash-lite',
    fallbackModel: 'gemini-3.5-flash',
    message: 'Gemini reachable',
  }));
  setSarvamHealthImplForTest(async () => ({
    ok: true,
    category: null,
    sttModel: 'saaras:v3',
    ttsModel: 'bulbul:v3',
    ttsVoice: 'priya',
    message: 'Sarvam STT/TTS reachable',
  }));
  setReadOnlyRunnerForTest(async () => ({ rows: [], rowCount: 0 }));

  const server = http.createServer(app);
  const wss = attachAssistantWebSocketGateway(server);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const token = jwt.sign(
    {
      owner: {
        id: TEST_OWNER_ID,
        username: 'smoke_owner',
        pwd_fp: pwdFp,
      },
      current_finance_id: TEST_FINANCE_ID,
    },
    getJwtSecret(),
    { expiresIn: '10m' }
  );

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Finance-ID': TEST_FINANCE_ID,
  };

  try {
    // 1. GET /api/ai/dashboard -> 200
    const dashRes = await fetch(`http://127.0.0.1:${port}/api/ai/dashboard`, {
      headers: authHeaders,
    });
    assert.equal(dashRes.status, 200);
    const dashJson = await dashRes.json();
    assert.equal(dashJson.success, true);
    assert.equal(dashJson.kpis.totalCalls, 18);

    // 2. GET /api/ai/assistant/health -> 200 (healthy)
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/ai/assistant/health`, {
      headers: authHeaders,
    });
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.success, true);
    assert.equal(healthJson.healthy, true);
    assert.equal(healthJson.status, 'healthy');
    assert.equal(healthJson.providers.gemini.ok, true);
    assert.equal(healthJson.providers.sarvam.ok, true);
    assert.equal(healthJson.providers.readOnlyDb.ok, true);

    // 3. Degraded provider category (`quota`) surfaces cleanly
    setSarvamHealthImplForTest(async () => ({
      ok: false,
      category: 'quota',
      sttModel: 'saaras:v3',
      ttsModel: 'bulbul:v3',
      ttsVoice: 'priya',
      message: 'Voice service quota or rate limit reached.',
    }));
    const degRes = await fetch(`http://127.0.0.1:${port}/api/ai/assistant/health`, {
      headers: authHeaders,
    });
    assert.equal(degRes.status, 200);
    const degJson = await degRes.json();
    assert.equal(degJson.healthy, false);
    assert.equal(degJson.status, 'degraded');
    assert.equal(degJson.providers.sarvam.category, 'quota');
    assert.match(degJson.message, /quota/i);
  } finally {
    db.query = origDbQuery;
    aiService.getDashboardOverview = origDashboard;
    setGeminiHealthImplForTest(null);
    setSarvamHealthImplForTest(null);
    setReadOnlyRunnerForTest(null);
    wss.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

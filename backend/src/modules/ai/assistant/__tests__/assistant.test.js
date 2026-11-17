'use strict';

process.env.NODE_ENV = 'test';

const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const { assertSafeSelectSql, SqlValidationError } = require('../security/sqlValidator');
const {
  verifyWebSocketUpgradeScope,
  sanitizeToolParameters,
  FinanceScopeError,
} = require('../security/financeScopeValidator');
const { setReadOnlyRunnerForTest } = require('../security/readOnlyDbPool');
const { resolveAndValidateToolCall, ALLOWED_QUERY_TOOLS } = require('../security/allowedQueryRegistry');
const {
  buildQueryCacheKey,
  getCachedQueryResult,
  setCachedQueryResult,
  resetCacheForTest,
  _getMemoryStoreForTest,
} = require('../services/aiCache.service');
const { detectTurnLanguage } = require('../services/languageDetection.service');
const { sanitizeForTts } = require('../services/ttsSanitizer');
const { StreamingClauseChunker } = require('../services/clauseChunker');
const { executeReadOnlyTool } = require('../services/readOnlyQuery.service');
const { setGeminiStreamImplForTest } = require('../providers/geminiStream.provider');
const { setTtsSynthesizeImplForTest } = require('../providers/sarvamTts.provider');
const { runAssistantTurn } = require('../services/aiOrchestrator.service');
const { attachAssistantWebSocketGateway } = require('../gateway/assistantWs.gateway');

const TENANT_A = '01960000-0000-7000-8000-000000000101';
const TENANT_B = '01960000-0000-7000-8000-000000000202';
const USER_1 = '01960000-0000-7000-8000-000000000999';

const SCOPE_A_OWNER = Object.freeze({
  financeId: TENANT_A,
  userId: USER_1,
  username: 'owner_a',
  role: 'owner',
  isOwner: true,
  authMode: 'license',
  financeName: 'Senthur Finance A',
});

const SCOPE_B_OWNER = Object.freeze({
  financeId: TENANT_B,
  userId: USER_1,
  username: 'owner_b',
  role: 'owner',
  isOwner: true,
  authMode: 'license',
  financeName: 'Rimi Finance B',
});

const SCOPE_A_AGENT = Object.freeze({
  financeId: TENANT_A,
  userId: '01960000-0000-7000-8000-000000000777',
  username: 'agent_ravi',
  role: 'agent',
  isOwner: false,
  authMode: 'direct_user',
  financeName: 'Senthur Finance A',
});

test('1. SQL Safety Validator: permits valid parameterized SELECT/CTE & blocks all mutations, catalogs, and secret columns', () => {
  assert.equal(
    assertSafeSelectSql(
      `SELECT COALESCE(SUM(p.amount), 0) AS total FROM payments p WHERE p.finance_id = $1::uuid AND p.payment_date = $2::date`
    ),
    true
  );

  assert.equal(
    assertSafeSelectSql(`
      WITH split_legs AS (
        SELECT LOWER(p.payment_mode::text) AS mode, p.amount FROM payments p WHERE p.finance_id = $1::uuid
      )
      SELECT mode, SUM(amount) FROM split_legs GROUP BY mode LIMIT 10
    `),
    true
  );

  const maliciousQueries = [
    'UPDATE customers SET cname = $1 WHERE id = $2',
    'DELETE FROM loans WHERE id = $1',
    'DROP TABLE customers',
    'TRUNCATE TABLE payments',
    'INSERT INTO payments (amount) VALUES (100)',
    'SELECT * FROM customers; DELETE FROM customers',
    'SELECT * INTO temp_copy FROM customers',
    'SELECT * FROM pg_catalog.pg_tables',
    'SELECT * FROM information_schema.columns',
    'SELECT pg_sleep(10) FROM customers',
    'SELECT id, password FROM users WHERE id = $1',
    'SELECT id, aadhar_id FROM customers WHERE finance_id = $1',
    'SELECT * FROM owner',
    'SELECT * FROM refresh_tokens',
    'SELECT * FROM ai_messages',
    'SELECT * FROM customers FOR UPDATE',
  ];

  for (const badSql of maliciousQueries) {
    assert.throws(
      () => assertSafeSelectSql(badSql),
      (err) => err instanceof SqlValidationError,
      `Expected SqlValidationError for query: ${badSql}`
    );
  }
});

test('2. Tenant & Role Isolation: strips LLM finance_id overrides, blocks unauthorized roles, & verifies WS handshake auth', async () => {
  const cleaned = sanitizeToolParameters({
    period: 'today',
    finance_id: TENANT_B,
    financeId: TENANT_B,
    role: 'owner',
    userId: 'spoofed',
  });
  assert.deepEqual(cleaned, { period: 'today' });

  // Agent cannot invoke owner/staff-only `get_expense_summary`
  assert.throws(
    () => resolveAndValidateToolCall(SCOPE_A_AGENT, 'get_expense_summary', { period: 'today' }),
    (err) => err.code === 'TOOL_ROLE_FORBIDDEN'
  );

  // Unknown tool rejected
  assert.throws(
    () => resolveAndValidateToolCall(SCOPE_A_OWNER, 'execute_raw_sql', { sql: 'SELECT 1' }),
    (err) => err.code === 'UNAPPROVED_TOOL'
  );

  // Missing token on WebSocket upgrade rejected with 401
  await assert.rejects(
    () => verifyWebSocketUpgradeScope({ url: '/ws/ai-assistant', headers: {} }),
    (err) => err instanceof FinanceScopeError && err.statusCode === 401
  );

  // Cross-tenant owner attempt on WebSocket upgrade rejected with 403
  await assert.rejects(
    () =>
      verifyWebSocketUpgradeScope(
        {
          url: `/ws/ai-assistant?token=valid_tok&financeId=${TENANT_B}`,
          headers: {},
        },
        {
          verifyJwt: () => ({ owner: { id: 'owner-1' } }),
          validateOwnerPrincipal: async () => ({
            valid: true,
            owner: { id: 'owner-1', username: 'senthur' },
          }),
          db: {
            query: async () => ({
              rows: [{ id: TENANT_B, owner_id: 'different-owner-999', is_active: 1, finance_name: 'Other Co' }],
            }),
          },
        }
      ),
    (err) => err instanceof FinanceScopeError && err.code === 'FINANCE_ACCESS_DENIED' && err.statusCode === 403
  );
});

test('3. Dual-Tier Query Cache: isolates tenants & roles, hits memory/Redis, supports bypass, & forbids transcript storage', async () => {
  resetCacheForTest(null);

  const keyA = buildQueryCacheKey(SCOPE_A_OWNER, 'get_today_collection', { date: '2026-11-15' });
  const keyB = buildQueryCacheKey(SCOPE_B_OWNER, 'get_today_collection', { date: '2026-11-15' });
  const keyAgent = buildQueryCacheKey(SCOPE_A_AGENT, 'get_today_collection', { date: '2026-11-15' });

  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyAgent);

  // Forbidden conversation/transcript cache keys must throw immediately
  assert.throws(() => buildQueryCacheKey(SCOPE_A_OWNER, 'save_chat_transcript', {}));
  assert.throws(() => buildQueryCacheKey(SCOPE_A_OWNER, 'conversation_history', {}));

  let sqlExecCount = 0;
  setReadOnlyRunnerForTest(async (scope, sql) => {
    // Also prove every SQL executed by readOnlyQuery.service passes assertSafeSelectSql!
    assertSafeSelectSql(sql);
    sqlExecCount += 1;
    return {
      rows: [
        {
          today_collection: scope.financeId === TENANT_A ? 245000 : 99000,
          today_receipt_count: 84,
          yesterday_collection: 225000,
          yesterday_receipt_count: 79,
        },
      ],
      rowCount: 1,
    };
  });

  const firstA = await executeReadOnlyTool(SCOPE_A_OWNER, 'get_today_collection', {});
  assert.equal(firstA.cacheHit, false);
  assert.equal(firstA.result.todayCollection, 245000);
  assert.equal(firstA.result.differenceFromYesterday, 20000);
  assert.equal(sqlExecCount, 1);

  // Second call for Tenant A hits cache (0 extra SQL executions)
  const secondA = await executeReadOnlyTool(SCOPE_A_OWNER, 'get_today_collection', {});
  assert.equal(secondA.cacheHit, true);
  assert.equal(secondA.result.todayCollection, 245000);
  assert.equal(sqlExecCount, 1);

  // Tenant B NEVER receives Tenant A's cached ₹2,45,000!
  const firstB = await executeReadOnlyTool(SCOPE_B_OWNER, 'get_today_collection', {});
  assert.equal(firstB.cacheHit, false);
  assert.equal(firstB.result.todayCollection, 99000);
  assert.equal(sqlExecCount, 2);

  // Explicit bypassCache forces fresh DB read
  const refreshedA = await executeReadOnlyTool(SCOPE_A_OWNER, 'get_today_collection', {}, { bypassCache: true });
  assert.equal(refreshedA.cacheHit, false);
  assert.equal(sqlExecCount, 3);

  // Simulate broken Redis client -> must NOT crash, falls back cleanly to memory tier
  resetCacheForTest({
    get: async () => {
      throw new Error('ECONNREFUSED redis');
    },
    set: async () => {
      throw new Error('ECONNREFUSED redis');
    },
  });
  await setCachedQueryResult(SCOPE_A_OWNER, 'get_today_collection', { date: '2026-11-15' }, { total: 100 }, 30);
  const degradedHit = await getCachedQueryResult(SCOPE_A_OWNER, 'get_today_collection', { date: '2026-11-15' });
  assert.equal(degradedHit.hit, true);
  assert.equal(degradedHit.tier, 'memory');

  resetCacheForTest(null);
  setReadOnlyRunnerForTest(null);
});

test('4. Multilingual Detection, Speech Sanitizer & Streaming Clause Chunker', () => {
  const ta = detectTurnLanguage('இன்னைக்கு எவ்வளவு collection வந்திருக்கு?');
  assert.equal(ta.code, 'ta-IN');
  assert.equal(ta.style, 'tamil');

  const tanglish = detectTurnLanguage('Today collection evlo vandhurukku?');
  assert.equal(tanglish.code, 'ta-IN');
  assert.equal(tanglish.style, 'tanglish');

  const en = detectTurnLanguage("Show today's collection report.");
  assert.equal(en.code, 'en-IN');
  assert.equal(en.style, 'english');

  const hi = detectTurnLanguage('आज कितना कलेक्शन आया है?');
  assert.equal(hi.code, 'hi-IN');
  assert.equal(hi.style, 'hindi');

  // Speech sanitizer converts ₹, HPL, ISO dates, and strips markdown ONLY for TTS
  assert.equal(
    sanitizeForTts('இன்னைக்கு **₹2,45,000** collection (HPL102, 2026-11-15).', 'ta-IN'),
    'இன்னைக்கு ரூபாய் 2,45,000 collection, H P L 102, நவம்பர் 15.'
  );
  assert.equal(
    sanitizeForTts('Total collected is **₹50,000.00** for HPL-45.', 'en-IN'),
    'Total collected is 50,000 rupees for H P L 45.'
  );
  assert.equal(
    sanitizeForTts('आज कुल ₹1,20,000 जमा हुए।', 'hi-IN'),
    'आज कुल 1,20,000 रुपये जमा हुए।'
  );

  // Streaming clause chunker splits sentence 1 without breaking ₹2,45,000 or 12.5%
  const chunker = new StreamingClauseChunker({ minFirstClauseChars: 15 });
  const c1 = chunker.push('இன்னைக்கு மொத்த collection ₹2,45,000 வந்திருக்கு. ');
  assert.deepEqual(c1, ['இன்னைக்கு மொத்த collection ₹2,45,000 வந்திருக்கு.']);
  const c2 = chunker.push('நேற்று 12.5% அதிகம்');
  assert.deepEqual(c2, []);
  assert.deepEqual(chunker.flush(), ['நேற்று 12.5% அதிகம்']);
});

test('5. AI Orchestrator: executes read-only tool call + streams Tamil text & TTS chunks + blocks write prompts', async () => {
  resetCacheForTest(null);
  setReadOnlyRunnerForTest(async () => ({
    rows: [
      {
        today_collection: 245000,
        today_receipt_count: 84,
        yesterday_collection: 225000,
        yesterday_receipt_count: 79,
      },
    ],
    rowCount: 1,
  }));

  let geminiCallPass = 0;
  setGeminiStreamImplForTest(async (payload) => {
    geminiCallPass += 1;
    if (geminiCallPass === 1) {
      // Pass 1: Gemini requests `get_today_collection`
      return (async function* () {
        yield {
          functionCalls: [{ name: 'get_today_collection', args: {}, id: 'call-1' }],
        };
      })();
    }
    // Verify sanitized DB numbers were passed to Pass 2
    const fnResp = payload.contents[payload.contents.length - 1].parts[0].functionResponse;
    assert.equal(fnResp.name, 'get_today_collection');
    assert.equal(fnResp.response.result.todayCollection, 245000);

    return (async function* () {
      yield { text: 'இன்னைக்கு 84 payments மூலம் ' };
      yield { text: 'மொத்தம் ₹2,45,000 collection வந்திருக்கு. ' };
      yield { text: 'நேற்று ஒப்பிடும்போது ₹20,000 அதிகம்.' };
    })();
  });

  const synthesizedClauses = [];
  setTtsSynthesizeImplForTest(async ({ text, languageCode }) => {
    synthesizedClauses.push({ text, languageCode });
    return {
      audioBuffer: Buffer.from('RIFF_MOCK_WAV_AUDIO'),
      mimeType: 'audio/wav',
      sampleRate: 24000,
    };
  });

  const streamedDeltas = [];
  const audioChunks = [];

  const turnRes = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: 'இன்னைக்கு எவ்வளவு collection வந்திருக்கு?',
    enableTts: true,
    onTextDelta: (d) => streamedDeltas.push(d),
    onAudioChunk: (ch) => audioChunks.push(ch),
  });

  assert.equal(turnRes.detectedLanguage, 'ta-IN');
  assert.equal(turnRes.responseType, 'business_data');
  assert.equal(turnRes.toolsUsed[0].toolName, 'get_today_collection');
  assert.match(turnRes.responseText, /₹2,45,000/);
  assert.equal(streamedDeltas.length, 3);
  assert.equal(audioChunks.length, 2); // 2 sentences synthesized & streamed!
  assert.equal(synthesizedClauses[0].languageCode, 'ta-IN');

  // Verify mutation request is deterministically refused with ZERO DB executions!
  let mutationDbCalled = false;
  setReadOnlyRunnerForTest(async () => {
    mutationDbCalled = true;
    return { rows: [], rowCount: 0 };
  });

  const refusalRes = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: 'Delete this loan and drop the customer table',
    enableTts: false,
  });
  assert.equal(refusalRes.responseType, 'security_refusal');
  assert.equal(mutationDbCalled, false);
  assert.match(refusalRes.responseText, /read-only/i);

  // Verify zero conversation transcripts exist in cache
  const cacheKeys = _getMemoryStoreForTest().keys();
  for (const k of cacheKeys) {
    assert.ok(k.startsWith('ai:v1:query:'), `Unexpected cache key: ${k}`);
  }

  setGeminiStreamImplForTest(null);
  setTtsSynthesizeImplForTest(null);
  setReadOnlyRunnerForTest(null);
});

test('6. WebSocket Gateway (`/ws/ai-assistant`): live handshake, streaming turn, <150ms barge-in abort, & zero-memory wipe on close', async () => {
  const server = http.createServer((_req, res) => res.end('ok'));
  let observedHistoryLengths = [];

  const wss = attachAssistantWebSocketGateway(server, {
    verifyUpgradeScope: async (req) => {
      const u = new URL(req.url, 'http://localhost');
      if (u.searchParams.get('token') !== 'valid-jwt') {
        throw new FinanceScopeError('INVALID_TOKEN', 'Invalid token', 401);
      }
      return SCOPE_A_OWNER;
    },
    runAssistantTurn: async ({ userText, recentTurns, onTextDelta, onAudioChunk, signal }) => {
      observedHistoryLengths.push(recentTurns.length);
      if (userText === 'SLOW_TURN') {
        onTextDelta('First partial... ');
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 2000);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              const e = new Error('aborted');
              e.code = 'CLIENT_ABORTED';
              reject(e);
            },
            { once: true }
          );
        });
      }
      onTextDelta(`Echo: ${userText}`);
      onAudioChunk({
        seq: 0,
        audioBuffer: Buffer.from('MOCK_PCM'),
        mimeType: 'audio/wav',
        sampleRate: 24000,
      });
      return {
        responseText: `Echo: ${userText}`,
        detectedLanguage: 'ta-IN',
        languageLabel: 'தமிழ்',
        responseType: 'general',
        toolsUsed: [],
      };
    },
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    // 1. Unauthenticated WS connection is rejected before upgrade
    await assert.rejects(
      () =>
        new Promise((resolve, reject) => {
          const badWs = new WebSocket(`ws://127.0.0.1:${port}/ws/ai-assistant?token=bad`);
          badWs.on('open', resolve);
          badWs.on('error', reject);
          badWs.on('unexpected-response', (_req, res) => {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
          });
        }),
      /HTTP 401/
    );

    // 2. Authenticated WS session: turn 1 -> turn 2 (in-RAM context) -> barge-in -> close & reopen (0 history!)
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws/ai-assistant?token=valid-jwt`);
    const events1 = [];

    await new Promise((resolve, reject) => {
      ws1.on('error', reject);
      ws1.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf8'));
        events1.push(msg);
        if (msg.type === 'session.ready') resolve();
      });
    });

    const waitForMsgType = (socket, targetType) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.off('message', handler);
          reject(new Error(`Timed out waiting for WS message type: ${targetType}`));
        }, 3000);
        const handler = (raw) => {
          const msg = JSON.parse(raw.toString('utf8'));
          if (msg.type === targetType) {
            clearTimeout(timer);
            socket.off('message', handler);
            resolve(msg);
          }
        };
        socket.on('message', handler);
      });

    // Turn 1
    const done1Promise = waitForMsgType(ws1, 'assistant.done');
    ws1.send(JSON.stringify({ type: 'text.message', text: 'வணக்கம்' }));
    await done1Promise;
    assert.ok(events1.some((e) => e.type === 'audio.chunk'));

    // Turn 2 (within same open socket -> has 2 recent messages in ephemeral RAM)
    const done2Promise = waitForMsgType(ws1, 'assistant.done');
    ws1.send(JSON.stringify({ type: 'text.message', text: 'நேத்தோட compare பண்ணு' }));
    await done2Promise;
    assert.deepEqual(observedHistoryLengths, [0, 2]);

    // Test <150ms Barge-In interruption on slow turn
    const startedSlowPromise = waitForMsgType(ws1, 'assistant.delta');
    ws1.send(JSON.stringify({ type: 'text.message', text: 'SLOW_TURN' }));
    await startedSlowPromise;

    const bargeStart = Date.now();
    const abortedPromise = waitForMsgType(ws1, 'turn.aborted');
    ws1.send(JSON.stringify({ type: 'turn.barge_in' }));
    await abortedPromise;
    assert.ok(Date.now() - bargeStart < 150, 'Barge-in should abort within <150ms');

    // Close socket 1 and open fresh socket 2 -> ephemeral memory MUST be 0!
    ws1.terminate();
    await new Promise((r) => setTimeout(r, 25));

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/ai-assistant?token=valid-jwt`);
    await waitForMsgType(ws2, 'session.ready');
    const done3Promise = waitForMsgType(ws2, 'assistant.done');
    ws2.send(JSON.stringify({ type: 'text.message', text: 'புது செஷன்' }));
    await done3Promise;
    assert.deepEqual(
      observedHistoryLengths,
      [0, 2, 4, 0],
      'Reopened session must start with 0 stored turns'
    );
    ws2.terminate();
  } finally {
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();
    server.close();
  }
});

test('7. Registry Coverage: all 12 declared tools normalize safely', () => {
  assert.equal(Object.keys(ALLOWED_QUERY_TOOLS).length, 12);
  for (const toolName of Object.keys(ALLOWED_QUERY_TOOLS)) {
    const sampleArgs =
      toolName === 'run_readonly_select_query'
        ? { sql: 'SELECT COUNT(*) FROM ai_ro.customers', reason: 'count customers' }
        : toolName === 'call_backend_get_api'
          ? { endpoint: '/api/finance/profile' }
          : {};
    const validated = resolveAndValidateToolCall(SCOPE_A_OWNER, toolName, sampleArgs);
    assert.equal(validated.toolName, toolName);
  }
});

test('8. Gemini 3.5 thoughtSignature preservation & Single Central Voice Config validation', async () => {
  const {
    validateAndResolveTtsConfig,
    validateAndResolveLlmModel,
    validateAndResolveSttModel,
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_VOICE,
    DEFAULT_BULBUL_V3_VOICE,
  } = require('../config/assistant.config');

  const warnMessages = [];
  const mockLogger = { warn: (msg) => warnMessages.push(msg) };

  assert.equal(DEFAULT_TTS_MODEL, 'bulbul:v4-flash');
  assert.equal(DEFAULT_TTS_VOICE, 'aarti_hi_customer');
  assert.equal(
    validateAndResolveLlmModel('gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'AI_ASSISTANT_GEMINI_MODEL', mockLogger),
    'gemini-3.5-flash-lite'
  );
  assert.equal(validateAndResolveSttModel('saaras:v3', mockLogger), 'saaras:v3');

  // Default single voice on bulbul:v4-flash
  assert.deepEqual(validateAndResolveTtsConfig('bulbul:v4-flash', 'aarti_hi_customer', mockLogger), {
    ttsModel: 'bulbul:v4-flash',
    ttsVoice: 'aarti_hi_customer',
    fellBack: false,
  });

  // Invalid speaker on bulbul:v4-flash logs warning and falls back to DEFAULT_TTS_VOICE ('aarti_hi_customer')
  const v4FallbackRes = validateAndResolveTtsConfig('bulbul:v4-flash', 'priya', mockLogger);
  assert.equal(v4FallbackRes.ttsModel, 'bulbul:v4-flash');
  assert.equal(v4FallbackRes.ttsVoice, DEFAULT_TTS_VOICE);
  assert.equal(v4FallbackRes.fellBack, true);

  // Valid universal speaker on bulbul:v3
  assert.deepEqual(validateAndResolveTtsConfig('bulbul:v3', 'priya', mockLogger), {
    ttsModel: 'bulbul:v3',
    ttsVoice: 'priya',
    fellBack: false,
  });

  // Invalid v4 persona speaker with bulbul:v3 logs warning and falls back to DEFAULT_BULBUL_V3_VOICE ('priya')
  const fallbackRes = validateAndResolveTtsConfig('bulbul:v3', 'gokul_ta_narration', mockLogger);
  assert.equal(fallbackRes.ttsModel, 'bulbul:v3');
  assert.equal(fallbackRes.ttsVoice, DEFAULT_BULBUL_V3_VOICE);
  assert.equal(fallbackRes.fellBack, true);
  assert.ok(warnMessages.length >= 2, 'Expected startup speaker mismatch warnings');

  resetCacheForTest(null);
  setReadOnlyRunnerForTest(async () => ({
    rows: [
      {
        today_collection: 310000,
        today_receipt_count: 92,
        yesterday_collection: 280000,
        yesterday_receipt_count: 85,
      },
    ],
    rowCount: 1,
  }));

  let passCount = 0;
  let capturedPass2ModelParts = null;

  setGeminiStreamImplForTest(async (payload) => {
    passCount += 1;
    if (passCount === 1) {
      return (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { text: 'Checking collection...', thought: true },
                  {
                    functionCall: { name: 'get_today_collection', args: {}, id: 'g35-call-1' },
                    thoughtSignature: 'SIG_GEMINI_3_5_VERIFIED_TOKEN',
                  },
                ],
              },
            },
          ],
        };
      })();
    }

    const modelTurn = payload.contents.find((c) => c.role === 'model');
    capturedPass2ModelParts = modelTurn?.parts || [];
    return (async function* () {
      yield {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'இன்று ₹3,10,000 வசூல் ஆகியுள்ளது.' }],
            },
          },
        ],
      };
    })();
  });

  try {
    const res = await runAssistantTurn({
      scope: SCOPE_A_OWNER,
      userText: 'இன்று வசூல் எவ்வளவு?',
      enableTts: false,
    });

    assert.equal(res.responseText, 'இன்று ₹3,10,000 வசூல் ஆகியுள்ளது.');
    assert.equal(capturedPass2ModelParts.length, 2);
    assert.equal(capturedPass2ModelParts[0].thought, true);
    assert.equal(capturedPass2ModelParts[1].thoughtSignature, 'SIG_GEMINI_3_5_VERIFIED_TOKEN');
  } finally {
    setGeminiStreamImplForTest(null);
    setReadOnlyRunnerForTest(null);
  }
});

test('9. Universal Multilingual Detection & Sanitizer: all 11 Indic languages + English default (zero Tamil bias)', () => {
  // Ambiguous Latin or numbers MUST default to English ('en-IN'), NEVER Tamil ('ta-IN')
  assert.equal(detectTurnLanguage('Hello').code, 'en-IN');
  assert.equal(detectTurnLanguage('102').code, 'en-IN');
  assert.equal(detectTurnLanguage('What is the overdue balance today?').code, 'en-IN');

  // All Indic scripts
  assert.equal(detectTurnLanguage('ഇന്നത്തെ കളക്ഷൻ എത്രയാണ്?').code, 'ml-IN');
  assert.equal(detectTurnLanguage('ಇವತ್ತಿನ ಕಲೆಕ್ಷನ್ ಎಷ್ಟು?').code, 'kn-IN');
  assert.equal(detectTurnLanguage('ఈరోజు కలెక్షన్ ఎంత వచ్చింది?').code, 'te-IN');
  assert.equal(detectTurnLanguage('আজকের কালেকশন কত হয়েছে?').code, 'bn-IN');
  assert.equal(detectTurnLanguage('आज किती थकबाकी आहे?').code, 'mr-IN');
  assert.equal(detectTurnLanguage('આજનું કલેક્শন કેટલું છે?').code, 'gu-IN');
  assert.equal(detectTurnLanguage('ਅੱਜ ਦੀ ਕਲੈਕਸ਼ਨ ਕਿੰਨੀ ਹੈ?').code, 'pa-IN');
  assert.equal(detectTurnLanguage('ଆଜିର କଲେକ୍ସନ କେତେ?').code, 'od-IN');

  // Explicit Sarvam saaras:v3 acoustic language detection
  assert.equal(detectTurnLanguage('collection report', { sttLanguageCode: 'ml-IN' }).code, 'ml-IN');
  assert.equal(detectTurnLanguage('collection report', { sttLanguageCode: 'kn-IN' }).code, 'kn-IN');
  assert.equal(detectTurnLanguage('collection report', { sttLanguageCode: 'or-IN' }).code, 'od-IN');

  // Sanitizer never forces Tamil 'ரூபாய்' onto non-Tamil languages
  assert.equal(sanitizeForTts('Total ₹15,000', 'ml-IN'), 'Total 15,000 രൂപ');
  assert.equal(sanitizeForTts('Total ₹15,000', 'kn-IN'), 'Total 15,000 ರೂಪಾಯಿ');
  assert.equal(sanitizeForTts('Total ₹15,000', 'te-IN'), 'Total 15,000 రూపాయలు');
  assert.equal(sanitizeForTts('Total ₹15,000', 'bn-IN'), 'Total 15,000 টাকা');
  assert.equal(sanitizeForTts('Total ₹15,000', 'mr-IN'), 'Total 15,000 रुपये');
  assert.equal(sanitizeForTts('Total ₹15,000', 'gu-IN'), 'Total 15,000 રૂપિયા');
  assert.equal(sanitizeForTts('Total ₹15,000', 'pa-IN'), 'Total 15,000 ਰੁਪਏ');
  assert.equal(sanitizeForTts('Total ₹15,000', 'od-IN'), 'Total 15,000 ଟଙ୍କା');
  assert.equal(sanitizeForTts('Total ₹15,000'), 'Total 15,000 rupees');
});

test('10. Streaming PCM16 Normalizer: strips 44-byte RIFF header, handles header-only chunks, and preserves 2-byte alignment across odd chunks', () => {
  const { normalizePcm16StreamChunk } = require('../providers/sarvamTts.provider');

  // Build fake 44-byte RIFF WAV header + 6 bytes of PCM samples ([10,20,30,40,50,60])
  const wavHeader = Buffer.alloc(44, 0);
  wavHeader.write('RIFF', 0, 'ascii');
  wavHeader.write('WAVE', 8, 'ascii');
  const pcmPayload = Buffer.from([10, 20, 30, 40, 50, 60]);

  // Header-only first chunk -> returns pcmBuffer: null, carryByte: null (no deadlock, no odd bytes)
  const outHeaderOnly = normalizePcm16StreamChunk(wavHeader, null);
  assert.equal(outHeaderOnly.pcmBuffer, null);
  assert.equal(outHeaderOnly.carryByte, null);

  // Header + 5 bytes (odd) -> emits 4 aligned bytes, carries 1 byte
  const combinedFirst = Buffer.concat([wavHeader, pcmPayload.subarray(0, 5)]);
  const out1 = normalizePcm16StreamChunk(combinedFirst, null);
  assert.ok(Buffer.isBuffer(out1.pcmBuffer));
  assert.equal(out1.pcmBuffer.length % 2, 0);
  assert.deepEqual([...out1.pcmBuffer], [10, 20, 30, 40]);
  assert.deepEqual([...out1.carryByte], [50]);

  // Remaining 1 byte arrives in next chunk -> combines with carryByte -> 2 aligned bytes!
  const out2 = normalizePcm16StreamChunk(pcmPayload.subarray(5, 6), out1.carryByte);
  assert.ok(Buffer.isBuffer(out2.pcmBuffer));
  assert.equal(out2.pcmBuffer.length % 2, 0);
  assert.deepEqual([...out2.pcmBuffer], [50, 60]);
  assert.equal(out2.carryByte, null);
});

test('11. Dynamic SQL Validator (`validateDynamicSelectSql`): enforces function allowlist, ai_ro schema lock, cross-tenant guard, & role-table guard', () => {
  const { validateDynamicSelectSql } = require('../security/sqlValidator');

  // Valid operational join + aggregate + date function -> wrapped in LIMIT 50
  const valid = validateDynamicSelectSql(
    `SELECT c.hplno, c.cname, COALESCE(SUM(p.amount), 0) AS paid
     FROM ai_ro.customers c
     LEFT JOIN ai_ro.payments p ON p.customer_id = c.id AND p.cancelled_by IS NULL
     WHERE DATE_TRUNC('month', c.created_at) <= CURRENT_DATE
     GROUP BY c.hplno, c.cname
     ORDER BY paid DESC;`,
    'staff',
    { financeId: TENANT_A }
  );
  assert.match(valid.wrappedSql, /^SELECT \* FROM \(/i);
  assert.match(valid.wrappedSql, /\) AS _ai_q LIMIT 50$/);

  // Owner/admin CAN query ai_ro.acc_* and ai_ro.office_expenses
  const ownerAcc = validateDynamicSelectSql(
    `SELECT ledger_name, closing_dr, closing_cr FROM ai_ro.acc_ledgers l JOIN ai_ro.acc_ledger_balances b ON b.ledger_id = l.id`,
    'owner',
    { financeId: TENANT_A }
  );
  assert.ok(ownerAcc.wrappedSql.includes('LIMIT 50'));

  const ownerExp = validateDynamicSelectSql(
    `SELECT category, SUM(amount) FROM ai_ro.office_expenses GROUP BY category`,
    'admin',
    { financeId: TENANT_A }
  );
  assert.ok(ownerExp.wrappedSql.includes('LIMIT 50'));

  // Condition 5 Mandatory Rejections:
  // (a) set_config tenant switch attempts
  assert.throws(
    () =>
      validateDynamicSelectSql(
        `SELECT set_config('app.current_finance_id', '${TENANT_B}', false), cname FROM ai_ro.customers`,
        'owner',
        { financeId: TENANT_A }
      ),
    (e) => e instanceof SqlValidationError
  );
  assert.throws(
    () =>
      validateDynamicSelectSql(
        `SELECT pg_catalog.set_config('app.current_finance_id', '${TENANT_B}', true) FROM ai_ro.customers`,
        'owner'
      ),
    (e) => e instanceof SqlValidationError
  );

  // (b) current_setting & pg_sleep & dblink & lo_* & pg_read_* & pg_ls_* & unlisted function
  for (const forbiddenQuery of [
    `SELECT current_setting('app.current_finance_id') FROM ai_ro.customers`,
    `SELECT pg_sleep(5) FROM ai_ro.customers`,
    `SELECT dblink('host=evil.com', 'SELECT 1') FROM ai_ro.customers`,
    `SELECT lo_import('/etc/passwd') FROM ai_ro.customers`,
    `SELECT pg_read_file('postgresql.conf') FROM ai_ro.customers`,
    `SELECT pg_ls_dir('.') FROM ai_ro.customers`,
    `SELECT version() FROM ai_ro.customers`,
  ]) {
    assert.throws(
      () => validateDynamicSelectSql(forbiddenQuery, 'owner'),
      (e) => e instanceof SqlValidationError,
      `Expected rejection for: ${forbiddenQuery}`
    );
  }

  // (c) public.customers & pg_catalog & information_schema access
  assert.throws(
    () => validateDynamicSelectSql(`SELECT cname FROM public.customers`, 'owner'),
    (e) => e instanceof SqlValidationError && e.code === 'SQL_FORBIDDEN_SCHEMA'
  );
  assert.throws(
    () => validateDynamicSelectSql(`SELECT relname FROM pg_catalog.pg_class`, 'owner'),
    (e) => e instanceof SqlValidationError
  );
  assert.throws(
    () => validateDynamicSelectSql(`SELECT table_name FROM information_schema.tables`, 'owner'),
    (e) => e instanceof SqlValidationError
  );

  // (d) UNION cross-tenant attempts (both public schema escape and foreign finance_id UUID)
  assert.throws(
    () =>
      validateDynamicSelectSql(
        `SELECT cname FROM ai_ro.customers UNION ALL SELECT cname FROM public.customers`,
        'owner',
        { financeId: TENANT_A }
      ),
    (e) => e instanceof SqlValidationError && e.code === 'SQL_FORBIDDEN_SCHEMA'
  );
  assert.throws(
    () =>
      validateDynamicSelectSql(
        `SELECT cname FROM ai_ro.customers UNION SELECT cname FROM ai_ro.customers WHERE finance_id = '${TENANT_B}'`,
        'owner',
        { financeId: TENANT_A }
      ),
    (e) => e instanceof SqlValidationError && e.code === 'SQL_CROSS_TENANT_ATTEMPT'
  );

  // (e) Multi-statement, comments, and SET/RESET/DO/COPY/CALL
  for (const badStmt of [
    `SELECT 1 FROM ai_ro.customers; SELECT 2 FROM ai_ro.loans`,
    `SELECT cname -- inline comment\nFROM ai_ro.customers`,
    `SET search_path = public`,
    `RESET ALL`,
    `DO $$ BEGIN END $$`,
    `COPY ai_ro.customers TO STDOUT`,
    `CALL some_proc()`,
  ]) {
    assert.throws(
      () => validateDynamicSelectSql(badStmt, 'owner'),
      (e) => e instanceof SqlValidationError
    );
  }

  // (f) Role-table guard: staff & agent CANNOT read acc_* or office_expenses / vehicle_expenses
  for (const restrictedRole of ['staff', 'agent']) {
    for (const restrictedView of ['acc_ledgers', 'acc_vouchers', 'office_expenses', 'vehicle_expenses']) {
      assert.throws(
        () =>
          validateDynamicSelectSql(`SELECT * FROM ai_ro.${restrictedView}`, restrictedRole, {
            financeId: TENANT_A,
          }),
        (e) => e instanceof SqlValidationError && e.code === 'SQL_ROLE_TABLE_FORBIDDEN',
        `Expected ${restrictedRole} to be blocked from ai_ro.${restrictedView}`
      );
    }
  }
});

test('12. Dynamic SQL Tool Execution, Audit Logging (no secrets), & 1-Retry SQL Self-Repair in Orchestrator', async () => {
  const {
    setDynamicSqlRunnerForTest,
    setDynamicSqlAuditSinkForTest,
  } = require('../security/readOnlyDbPool');

  const auditEntries = [];
  setDynamicSqlAuditSinkForTest((entry) => auditEntries.push(entry));

  let sqlAttempt = 0;
  setDynamicSqlRunnerForTest(async (_scope, wrappedSql) => {
    sqlAttempt += 1;
    if (wrappedSql.includes('non_existent_col')) {
      const dbErr = new Error('column "non_existent_col" does not exist');
      dbErr.code = '42703';
      throw dbErr;
    }
    return {
      rows: [
        { village: 'Tiruppur', customer_count: 14 },
        { village: 'Avinashi', customer_count: 9 },
      ],
      rowCount: 2,
    };
  });

  // 1. Verify blocked role query is ALSO audit-logged with error and never hits runner
  await assert.rejects(
    () =>
      executeReadOnlyTool(SCOPE_A_AGENT, 'run_readonly_select_query', {
        sql: 'SELECT * FROM ai_ro.office_expenses',
        reason: 'agent trying to read office expenses',
      }),
    (err) => err.code === 'SQL_ROLE_TABLE_FORBIDDEN'
  );
  assert.equal(sqlAttempt, 0);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].financeId, TENANT_A);
  assert.equal(auditEntries[0].role, 'agent');
  assert.match(auditEntries[0].error, /SQL_ROLE_TABLE_FORBIDDEN/);

  // 2. Verify Orchestrator 1-retry SQL self-repair loop when Pass 1 SQL has a column typo
  let geminiPass = 0;
  setGeminiStreamImplForTest(async () => {
    geminiPass += 1;
    if (geminiPass === 1) {
      return (async function* () {
        yield {
          functionCalls: [
            {
              name: 'run_readonly_select_query',
              args: {
                sql: 'SELECT non_existent_col FROM ai_ro.addresses',
                reason: 'count customers by village',
              },
              id: 'dyn-1',
            },
          ],
        };
      })();
    }
    if (geminiPass === 2) {
      // Repair pass fixes the column name
      return (async function* () {
        yield {
          functionCalls: [
            {
              name: 'run_readonly_select_query',
              args: {
                sql: 'SELECT village, COUNT(*) AS customer_count FROM ai_ro.addresses GROUP BY village ORDER BY customer_count DESC',
                reason: 'count customers by village fixed',
              },
              id: 'dyn-2',
            },
          ],
        };
      })();
    }
    return (async function* () {
      yield { text: 'Tiruppur leads with 14 customers, followed by Avinashi with 9 customers.' };
    })();
  });

  try {
    const turn = await runAssistantTurn({
      scope: SCOPE_A_OWNER,
      userText: 'Which villages have the most customers?',
      enableTts: false,
    });

    assert.equal(geminiPass, 3);
    assert.equal(sqlAttempt, 2);
    assert.equal(turn.detectedLanguage, 'en-IN');
    assert.match(turn.responseText, /Tiruppur leads with 14 customers/);
    assert.equal(auditEntries.length, 3); // 1 rejected agent + 1 column error + 1 repaired success
    assert.equal(auditEntries[2].rowCount, 2);
    assert.equal(auditEntries[2].error, null);
  } finally {
    setGeminiStreamImplForTest(null);
    setDynamicSqlRunnerForTest(null);
    setDynamicSqlAuditSinkForTest(null);
  }
});

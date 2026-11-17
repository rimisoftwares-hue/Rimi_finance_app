'use strict';

process.env.NODE_ENV = 'test';

const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const { attachAssistantWebSocketGateway, isAllowedUpgradeOrigin } = require('../gateway/assistantWs.gateway');
const { TERMINAL_TURN_EVENTS } = require('../config/eventContract');
const { RateLimitError, consumeTurnBudget, resetRateLimiterForTest } = require('../security/rateLimiter');
const { issueWsTicket, consumeWsTicket, resetWsTicketsForTest } = require('../security/wsTicket');
const { toClientError } = require('../services/clientErrors');
const { isMeaningfulTranscript } = require('../services/transcriptFilter');
const { getGeminiFunctionDeclarations } = require('../security/allowedQueryRegistry');
const { setGeminiStreamImplForTest } = require('../providers/geminiStream.provider');
const { runAssistantTurn } = require('../services/aiOrchestrator.service');

const SCOPE = Object.freeze({
  financeId: '01960000-0000-7000-8000-000000000101',
  userId: '01960000-0000-7000-8000-000000000999',
  username: 'owner_a',
  role: 'owner',
  isOwner: true,
  authMode: 'license',
  financeName: 'Finance A',
});

async function startGateway(runTurnImpl, extraDeps = {}) {
  const server = http.createServer((_req, res) => res.end('ok'));
  const wss = attachAssistantWebSocketGateway(server, {
    verifyUpgradeScope: async () => SCOPE,
    runAssistantTurn: runTurnImpl,
    consumeTurnBudget: () => ({ usedToday: 1 }),
    acquireSessionSlot: () => ({ ok: true, release: () => {} }),
    ...extraDeps,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const close = () => {
    for (const c of wss.clients) c.terminate();
    wss.close();
    server.close();
  };
  return { port, close };
}

/** Opens a socket, sends one text turn, collects events until a terminal event for that turn. */
async function runOneTextTurn(port, text, { afterStart } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ai-assistant?token=x`);
  const events = [];
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no terminal event; got ${events.map((e) => e.type)}`)), 4000);
    let turnId = null;
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      events.push(msg);
      if (msg.type === 'session.ready') {
        ws.send(JSON.stringify({ type: 'text.message', text }));
      } else if (msg.type === 'assistant.start') {
        turnId = msg.turnId;
        if (afterStart) afterStart(ws);
      } else if (TERMINAL_TURN_EVENTS.includes(msg.type) && msg.turnId && msg.turnId === turnId) {
        clearTimeout(timer);
        // give the gateway a moment to (incorrectly) send a second terminal event
        setTimeout(() => resolve({ terminal: msg, turnId }), 120);
      }
    });
  });
  ws.terminate();
  const terminalsForTurn = events.filter(
    (e) => TERMINAL_TURN_EVENTS.includes(e.type) && e.turnId === result.turnId
  );
  return { ...result, events, terminalsForTurn };
}

test('Turn lifecycle: success emits exactly one assistant.done', async () => {
  const gw = await startGateway(async ({ onTextDelta }) => {
    onTextDelta('Hello ');
    return { responseText: 'Hello there', detectedLanguage: 'en-IN', responseType: 'general', toolsUsed: [] };
  });
  try {
    const r = await runOneTextTurn(gw.port, 'hi');
    assert.equal(r.terminal.type, 'assistant.done');
    assert.equal(r.terminalsForTurn.length, 1);
  } finally {
    gw.close();
  }
});

test('Turn lifecycle: tool/provider exception emits exactly one sanitized error (no internals leaked)', async () => {
  const gw = await startGateway(async () => {
    const e = new Error('relation "public.secret_table" does not exist at SELECT * FROM ...');
    e.code = '42P01';
    throw e;
  });
  try {
    const r = await runOneTextTurn(gw.port, 'show data');
    assert.equal(r.terminal.type, 'error');
    assert.equal(r.terminalsForTurn.length, 1);
    assert.doesNotMatch(r.terminal.message, /secret_table|SELECT/);
  } finally {
    gw.close();
  }
});

test('Turn lifecycle: Gemini quota failure emits one error with readable quota message', async () => {
  const gw = await startGateway(async () => {
    const e = new Error('429 RESOURCE_EXHAUSTED key=AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE');
    e.code = 'GEMINI_QUOTA';
    e.category = 'quota';
    throw e;
  });
  try {
    const r = await runOneTextTurn(gw.port, 'hi');
    assert.equal(r.terminal.type, 'error');
    assert.equal(r.terminal.category, 'quota');
    assert.match(r.terminal.message, /quota/i);
    assert.doesNotMatch(r.terminal.message, /AIza/);
    assert.equal(r.terminalsForTurn.length, 1);
  } finally {
    gw.close();
  }
});

test('Turn lifecycle: backend timeout emits one TURN_TIMEOUT error even if the provider never returns', async () => {
  const gw = await startGateway(() => new Promise(() => {}), { turnTimeoutMs: 300 });
  try {
    const r = await runOneTextTurn(gw.port, 'slow');
    assert.equal(r.terminal.type, 'error');
    assert.equal(r.terminal.code, 'TURN_TIMEOUT');
    assert.equal(r.terminalsForTurn.length, 1);
  } finally {
    gw.close();
  }
});

test('Turn lifecycle: barge-in abort emits exactly one turn.aborted, never a late assistant.done', async () => {
  const gw = await startGateway(
    ({ signal }) =>
      new Promise((resolve) => {
        // Misbehaving provider: ignores abort and resolves later anyway
        setTimeout(() => resolve({ responseText: 'late', detectedLanguage: 'en-IN', responseType: 'general' }), 300);
        signal.addEventListener('abort', () => {}, { once: true });
      })
  );
  try {
    const r = await runOneTextTurn(gw.port, 'long question', {
      afterStart: (ws) => setTimeout(() => ws.send(JSON.stringify({ type: 'turn.barge_in' })), 30),
    });
    assert.equal(r.terminal.type, 'turn.aborted');
    await new Promise((res) => setTimeout(res, 400));
    assert.equal(r.events.filter((e) => e.type === 'assistant.done').length, 0);
    assert.equal(r.terminalsForTurn.length, 1);
  } finally {
    gw.close();
  }
});

test('Rate limits: per-user window throws RATE_LIMITED; gateway reports it as a readable error', async () => {
  resetRateLimiterForTest();
  const prev = process.env.AI_ASSISTANT_TURNS_PER_MIN_USER;
  process.env.AI_ASSISTANT_TURNS_PER_MIN_USER = '2';
  try {
    consumeTurnBudget(SCOPE, 1000);
    consumeTurnBudget(SCOPE, 1001);
    assert.throws(
      () => consumeTurnBudget(SCOPE, 1002),
      (e) => e instanceof RateLimitError && e.code === 'RATE_LIMITED' && e.statusCode === 429
    );
    // Window slides after 60 s
    assert.doesNotThrow(() => consumeTurnBudget(SCOPE, 62000));
  } finally {
    if (prev === undefined) delete process.env.AI_ASSISTANT_TURNS_PER_MIN_USER;
    else process.env.AI_ASSISTANT_TURNS_PER_MIN_USER = prev;
    resetRateLimiterForTest();
  }

  let calls = 0;
  const gw = await startGateway(
    async () => {
      calls += 1;
      return { responseText: 'x', detectedLanguage: 'en-IN', responseType: 'general' };
    },
    {
      consumeTurnBudget: () => {
        throw new RateLimitError('RATE_LIMITED', 'You are sending messages too quickly.', 10);
      },
    }
  );
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${gw.port}/ws/ai-assistant?token=x`);
    const err = await new Promise((resolve, reject) => {
      ws.on('error', reject);
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf8'));
        if (msg.type === 'session.ready') ws.send(JSON.stringify({ type: 'text.message', text: 'hi' }));
        if (msg.type === 'error') resolve(msg);
      });
    });
    ws.terminate();
    assert.equal(err.code, 'RATE_LIMITED');
    assert.match(err.message, /too quickly/);
    assert.equal(calls, 0, 'rate-limited turn must never reach Gemini');
  } finally {
    gw.close();
  }
});

test('Security: WS tickets are single-use and expire; foreign Origins are rejected', () => {
  resetWsTicketsForTest();
  const { ticket } = issueWsTicket(SCOPE, 1000);
  assert.equal(consumeWsTicket(ticket, 2000).financeId, SCOPE.financeId);
  assert.equal(consumeWsTicket(ticket, 2001), null, 'ticket must be single-use');
  const { ticket: t2 } = issueWsTicket(SCOPE, 1000);
  assert.equal(consumeWsTicket(t2, 1000 + 61000), null, 'ticket must expire after 60 s');

  assert.equal(isAllowedUpgradeOrigin({ headers: {} }), true, 'non-browser client (no Origin)');
  assert.equal(isAllowedUpgradeOrigin({ headers: { origin: 'http://localhost:3003', host: 'x:3004' } }), true);
  assert.equal(isAllowedUpgradeOrigin({ headers: { origin: 'https://evil.example', host: 'api.x' } }), false);
  assert.equal(isAllowedUpgradeOrigin({ headers: { origin: 'https://api.x', host: 'api.x' } }), true);
});

test('Sanitized client errors and noise filter', () => {
  assert.match(toClientError({ code: 'X', message: 'pg password=abc' }).message, /Unable to process/);
  assert.equal(toClientError({ code: 'TURN_TIMEOUT' }).code, 'TURN_TIMEOUT');
  assert.equal(isMeaningfulTranscript(''), false);
  assert.equal(isMeaningfulTranscript('hmm'), false);
  assert.equal(isMeaningfulTranscript('.'), false);
  assert.equal(isMeaningfulTranscript('a'), false);
  assert.equal(isMeaningfulTranscript('இன்று வசூல் எவ்வளவு?'), true);
  assert.equal(isMeaningfulTranscript('What is today collection?'), true);
});

test('Graceful degradation: without AI_SQL_RO credentials the dynamic SQL tool is hidden and turns still answer', async () => {
  const declsWithout = getGeminiFunctionDeclarations('owner', { dynamicSqlAvailable: false }).map((d) => d.name);
  assert.equal(declsWithout.includes('run_readonly_select_query'), false);
  assert.ok(declsWithout.includes('get_today_collection'), 'fast KPI tools remain available');

  // Even if the model hallucinates the hidden tool, the turn completes (tool error -> honest answer)
  let pass = 0;
  setGeminiStreamImplForTest(async () => {
    pass += 1;
    if (pass === 1) {
      return (async function* () {
        yield { functionCalls: [{ name: 'run_readonly_select_query', args: { sql: 'SELECT 1 FROM ai_ro.customers' } }] };
      })();
    }
    return (async function* () {
      yield { text: 'I could not fetch that detail right now.' };
    })();
  });
  try {
    const res = await runAssistantTurn({ scope: SCOPE, userText: 'list customers in Avinashi', enableTts: false });
    assert.match(res.responseText, /could not fetch/);
  } finally {
    setGeminiStreamImplForTest(null);
  }
});

test('SQL validator: multi-CTE dashboard queries (CASH_IN_HAND_SQL cb_groups) and dynamic multi-CTEs pass', () => {
  const {
    PORTFOLIO_RISK_SQL,
    VEHICLES_STATUS_SQL,
    CASH_IN_HAND_SQL,
    TODAY_COLLECTION_SQL,
    MONTHLY_INCOME_GROUPS_SQL,
    MONTHLY_OUTCOME_CTES_SQL,
  } = require('../../../dashboard/homeDashboard.service');
  const { assertSafeSelectSql, validateDynamicSelectSql } = require('../security/sqlValidator');

  for (const sql of [
    PORTFOLIO_RISK_SQL,
    VEHICLES_STATUS_SQL,
    CASH_IN_HAND_SQL,
    TODAY_COLLECTION_SQL,
    MONTHLY_INCOME_GROUPS_SQL,
    MONTHLY_OUTCOME_CTES_SQL,
  ]) {
    assert.equal(assertSafeSelectSql(sql), true);
  }

  const dynRes = validateDynamicSelectSql(
    `WITH active_cust AS (
       SELECT id, cname FROM ai_ro.customers WHERE loan_status = 'active'
     ),
     recent_pay AS (
       SELECT customer_id, SUM(amount) AS paid FROM ai_ro.payments GROUP BY customer_id
     )
     SELECT a.cname, COALESCE(r.paid, 0) AS paid
     FROM active_cust a
     LEFT JOIN recent_pay r ON r.customer_id = a.id`,
    'owner',
    { financeId: SCOPE.financeId }
  );
  assert.ok(dynRes.wrappedSql.includes('LIMIT 50'));
});

test('Post-tool Pass 2 sets functionCallingConfig mode=NONE and guarantees non-empty reply fallback', async () => {
  const { setReadOnlyRunnerForTest } = require('../security/readOnlyDbPool');
  const { resetCacheForTest } = require('../services/aiCache.service');
  resetCacheForTest(null);
  setReadOnlyRunnerForTest(async () => ({ rows: [], rowCount: 0 }));

  let pass = 0;
  let pass2Config = null;
  setGeminiStreamImplForTest(async (payload) => {
    pass += 1;
    if (pass === 1) {
      return (async function* () {
        yield { functionCalls: [{ name: 'get_finance_overview', args: {} }] };
      })();
    }
    pass2Config = payload.config;
    // Simulate empty model output on Pass 2
    return (async function* () {
      yield { candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'STOP' }] };
    })();
  });

  try {
    const res = await runAssistantTurn({
      scope: SCOPE,
      userText: 'How many active loans do we have?',
      enableTts: false,
    });
    assert.equal(pass2Config?.toolConfig?.functionCallingConfig?.mode, 'NONE');
    assert.ok(Array.isArray(pass2Config?.tools) && pass2Config.tools.length === 1);
    assert.ok(res.responseText.length > 10, 'Fallback must ensure non-empty responseText');
  } finally {
    setGeminiStreamImplForTest(null);
    setReadOnlyRunnerForTest(null);
  }
});

test('Hands-free VAD: trailing binary PCM frames after server VAD commit are ignored until next audio.start', async () => {
  let sttSessionsCreated = 0;
  let triggerVadEnd = null;
  const gw = await startGateway(
    async ({ onTextDelta }) => {
      onTextDelta('Active loans: 42.');
      return { responseText: 'Active loans: 42.', detectedLanguage: 'en-IN', responseType: 'business_data', toolsUsed: [] };
    },
    {
      createStreamingSttSession: ({ onVadSpeechEnd }) => {
        sttSessionsCreated += 1;
        triggerVadEnd = onVadSpeechEnd;
        return {
          pushPcmFrame: () => {},
          commit: async () => ({ text: 'How many active loans?', languageCode: 'en-IN' }),
          abort: () => {},
        };
      },
    }
  );

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${gw.port}/ws/ai-assistant?token=x`);
    await new Promise((resolve, reject) => {
      ws.on('error', reject);
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf8'));
        if (msg.type === 'session.ready') resolve();
      });
    });

    const donePromise = new Promise((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf8'));
        if (msg.type === 'assistant.done') resolve(msg);
      });
    });

    ws.send(JSON.stringify({ type: 'audio.start' }));
    ws.send(Buffer.alloc(1024));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sttSessionsCreated, 1);

    // Server VAD commits first
    triggerVadEnd();
    await donePromise;

    // Client sends trailing silence frames & late audio.commit before noticing server commit
    ws.send(Buffer.alloc(1024));
    ws.send(Buffer.alloc(1024));
    ws.send(JSON.stringify({ type: 'audio.commit' }));
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(sttSessionsCreated, 1, 'Trailing silence frames must NOT open a second STT session');

    // Next real utterance begins with audio.start -> opens session #2 cleanly
    ws.send(JSON.stringify({ type: 'audio.start' }));
    ws.send(Buffer.alloc(1024));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sttSessionsCreated, 2);

    ws.terminate();
  } finally {
    gw.close();
  }
});



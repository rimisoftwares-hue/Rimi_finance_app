'use strict';

/**
 * Phase 3 & Phase 4 Test Suite (`customerLookupAndCorrection.test.js`).
 *
 * Strictly synthetic fixtures — ZERO real customer PII, ZERO live credentials.
 */

process.env.NODE_ENV = 'test';

const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const { assertSafeSelectSql } = require('../security/sqlValidator');
const { resolveAndValidateToolCall } = require('../security/allowedQueryRegistry');
const { setReadOnlyRunnerForTest } = require('../security/readOnlyDbPool');
const { resetCacheForTest, buildQueryCacheKey } = require('../services/aiCache.service');
const { executeReadOnlyTool } = require('../services/readOnlyQuery.service');
const { detectTurnLanguage } = require('../services/languageDetection.service');
const { setGeminiStreamImplForTest } = require('../providers/geminiStream.provider');
const { runAssistantTurn, buildSystemInstruction } = require('../services/aiOrchestrator.service');
const { attachAssistantWebSocketGateway } = require('../gateway/assistantWs.gateway');

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

const SCOPE_A_OWNER = Object.freeze({
  financeId: TENANT_A,
  financeName: 'Synthetic Finance Alpha',
  role: 'owner',
  isOwner: true,
  userId: 'owner-alpha',
  userName: 'alpha_owner',
});

const SCOPE_A_AGENT = Object.freeze({
  financeId: TENANT_A,
  financeName: 'Synthetic Finance Alpha',
  role: 'agent',
  isOwner: false,
  userId: 'agent-alpha-1',
  userName: 'alpha_agent',
});

const SYNTHETIC_DB_ROWS = [
  {
    finance_id: TENANT_A,
    customer_id: 'cust-a-1',
    hplno: 1,
    cname: 'Synthetic Customer One',
    loan_status: 'active',
    vehicle_number: 'TN39AA1001',
    brand: 'Honda',
    model_name: 'Shine',
    color: 'Black',
    rc_status: 'original_received',
    insurance_expiry_date: '2027-02-10',
    fc_expiry_date: '2028-02-10',
    phone_digits: '9000001111',
    loan_id: 'loan-a-1',
    hp_amount: 90000,
    hp_date: '2026-01-01',
    due_date: '2026-02-01',
    first_due_date: '2026-02-01',
    due_month: 12,
    due_amount: 8500,
    net_payable: 102000,
    total_paid: 8500,
    payment_count: 1,
  },
  {
    finance_id: TENANT_A,
    customer_id: 'cust-a-3',
    hplno: 3,
    cname: 'Synthetic Customer HPL Three',
    loan_status: 'active',
    vehicle_number: 'TN39CD7788',
    brand: 'TVS',
    model_name: 'Jupiter',
    color: 'Grey',
    rc_status: 'original_received',
    insurance_expiry_date: '2027-05-15',
    fc_expiry_date: '2029-05-15',
    phone_digits: '9000004321',
    loan_id: 'loan-a-3',
    hp_amount: 60000,
    hp_date: '2026-05-01',
    due_date: '2026-06-01',
    first_due_date: '2026-06-01',
    due_month: 12,
    due_amount: 5500,
    net_payable: 66000,
    total_paid: 27500,
    payment_count: 5,
  },
  {
    finance_id: TENANT_A,
    customer_id: 'cust-a-10',
    hplno: 10,
    cname: 'Synthetic Plate Owner Ten',
    loan_status: 'active',
    vehicle_number: 'TN39AB1234',
    brand: 'Royal Enfield',
    model_name: 'Classic 350',
    color: 'Red',
    rc_status: 'pending',
    insurance_expiry_date: '2027-08-20',
    fc_expiry_date: '2030-08-20',
    phone_digits: '9000001010',
    loan_id: 'loan-a-10',
    hp_amount: 140000,
    hp_date: '2026-03-01',
    due_date: '2026-04-01',
    first_due_date: '2026-04-01',
    due_month: 24,
    due_amount: 7000,
    net_payable: 168000,
    total_paid: 21000,
    payment_count: 3,
  },
  {
    finance_id: TENANT_A,
    customer_id: 'cust-a-11',
    hplno: 11,
    cname: 'Synthetic Plate Owner Eleven',
    loan_status: 'active',
    vehicle_number: 'TN39XY1234',
    brand: 'Yamaha',
    model_name: 'FZ',
    color: 'Blue',
    rc_status: 'original_received',
    insurance_expiry_date: '2027-09-01',
    fc_expiry_date: '2029-09-01',
    phone_digits: '9000001112',
    loan_id: 'loan-a-11',
    hp_amount: 85000,
    hp_date: '2026-04-01',
    due_date: '2026-05-01',
    first_due_date: '2026-05-01',
    due_month: 18,
    due_amount: 5500,
    net_payable: 99000,
    total_paid: 16500,
    payment_count: 3,
  },
  {
    finance_id: TENANT_A,
    customer_id: 'cust-a-12',
    hplno: 12,
    cname: 'Synthetic Leading Zero Plate',
    loan_status: 'active',
    vehicle_number: 'TN09A0005',
    brand: 'Bajaj',
    model_name: 'Pulsar',
    color: 'Silver',
    rc_status: 'original_received',
    insurance_expiry_date: '2027-11-11',
    fc_expiry_date: '2029-11-11',
    phone_digits: '9000005555',
    loan_id: 'loan-a-12',
    hp_amount: 72000,
    hp_date: '2026-06-01',
    due_date: '2026-07-01',
    first_due_date: '2026-07-01',
    due_month: 12,
    due_amount: 6600,
    net_payable: 79200,
    total_paid: 19800,
    payment_count: 3,
  },
  {
    finance_id: TENANT_B,
    customer_id: 'cust-b-3',
    hplno: 3,
    cname: 'Foreign Tenant Customer',
    loan_status: 'active',
    vehicle_number: 'TN99ZZ8888',
    brand: 'Hero',
    model_name: 'Splendor',
    color: 'Black',
    rc_status: 'original_received',
    insurance_expiry_date: '2027-01-01',
    fc_expiry_date: '2029-01-01',
    phone_digits: '9000008888',
    loan_id: 'loan-b-3',
    hp_amount: 50000,
    hp_date: '2026-01-01',
    due_date: '2026-02-01',
    first_due_date: '2026-02-01',
    due_month: 12,
    due_amount: 4800,
    net_payable: 57600,
    total_paid: 9600,
    payment_count: 2,
  },
];

/**
 * Evaluates parameterized `CUSTOMER_SEARCH_SQL` against `SYNTHETIC_DB_ROWS` while asserting
 * `assertSafeSelectSql(sql)` and strict `$1 = scope.financeId` tenant isolation.
 */
function createSyntheticCustomerDbRunner() {
  return async (scope, sql, params) => {
    assertSafeSelectSql(sql);
    assert.equal(params[0], scope.financeId, 'First SQL parameter $1 must ALWAYS be scope.financeId');

    const [
      financeId,
      hplno,
      vehicleVariants,
      vehicleLast4,
      phoneFull,
      phoneLast4,
      customerName,
    ] = params;

    const tenantRows = SYNTHETIC_DB_ROWS.filter((r) => r.finance_id === financeId);
    const matched = [];

    for (const row of tenantRows) {
      const cleanPlate = String(row.vehicle_number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      let rank = 99;

      if (hplno !== null && hplno !== undefined && row.hplno === hplno) {
        rank = 1;
      } else if (Array.isArray(vehicleVariants) && vehicleVariants.length > 0 && vehicleVariants.includes(cleanPlate)) {
        rank = 2;
      } else if (vehicleLast4 && cleanPlate.endsWith(vehicleLast4)) {
        rank = 3;
      } else if (
        (phoneFull && row.phone_digits.slice(-10) === phoneFull) ||
        (phoneLast4 && row.phone_digits.slice(-4) === phoneLast4)
      ) {
        rank = 4;
      } else if (customerName && row.cname.toLowerCase().includes(String(customerName).toLowerCase())) {
        rank = 5;
      }

      if (rank < 99) {
        matched.push({
          ...row,
          phone_last4: row.phone_digits ? row.phone_digits.slice(-4) : null,
          match_rank: rank,
        });
      }
    }

    matched.sort((a, b) => a.match_rank - b.match_rank || a.hplno - b.hplno);
    const sliced = matched.slice(0, 5);
    return { rows: sliced, rowCount: sliced.length };
  };
}

test('Phase 3.1: search_customer_loan_status schema validates params, runs server-side normalizer backstop, and rejects unknown params', () => {
  // Spoken Tamil word in `hplno` backstop -> integer 3
  const v1 = resolveAndValidateToolCall(SCOPE_A_OWNER, 'search_customer_loan_status', {
    hplno: 'மூணாவது',
  });
  assert.equal(v1.parameters.hplno, 3);

  // Spoken Tamil plate in `vehicleNumber` backstop -> normalized TN39AB1234 + variants
  const v2 = resolveAndValidateToolCall(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: 'டி என் முப்பத்தி ஒன்பது ஏ பி ஒண்ணு ரெண்டு மூணு நாலு',
  });
  assert.equal(v2.parameters.vehicleNormalized, 'TN39AB1234');
  assert.ok(v2.parameters.vehicleVariants.includes('TN39AB1234'));

  // Leading-zero variant expansion (`TN 9 A 5` -> includes `TN09A0005` & `TN9A5`)
  const v3 = resolveAndValidateToolCall(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: 'TN 9 A 5',
  });
  assert.ok(v3.parameters.vehicleVariants.includes('TN09A0005'));
  assert.ok(v3.parameters.vehicleVariants.includes('TN9A5'));

  // Last-4 plate in `vehicleNumber`
  const v4 = resolveAndValidateToolCall(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: '1234',
  });
  assert.equal(v4.parameters.vehicleLast4, '1234');

  // Phone full & last-4
  const v5 = resolveAndValidateToolCall(SCOPE_A_OWNER, 'search_customer_loan_status', {
    phone: '+91 90000 43210',
  });
  assert.equal(v5.parameters.phoneFull, '9000043210');
  assert.equal(v5.parameters.phoneLast4, '3210');

  // Reject unknown parameters with INVALID_TOOL_PARAMS
  assert.throws(
    () =>
      resolveAndValidateToolCall(SCOPE_A_OWNER, 'search_customer_loan_status', {
        hplno: 3,
        unexpectedParam: 'boom',
      }),
    (err) => err.code === 'INVALID_TOOL_PARAMS' && err.statusCode === 400
  );

  // Reject non-primitive parameter value
  assert.throws(
    () =>
      resolveAndValidateToolCall(SCOPE_A_OWNER, 'search_customer_loan_status', {
        vehicleNumber: { bad: true },
      }),
    (err) => err.code === 'INVALID_TOOL_PARAMS' && err.statusCode === 400
  );
});

test('Phase 3.2: Synthetic DB integration — HPL 3 vs overdue list, full/leading-zero/last-4 plate ambiguity, masked phone, not_found, cross-tenant & cache bypass', async (t) => {
  t.after(() => {
    setReadOnlyRunnerForTest(null);
    resetCacheForTest(null);
  });

  resetCacheForTest(null);
  setReadOnlyRunnerForTest(createSyntheticCustomerDbRunner());

  // 1. Spoken HPL 3 -> exact hplno=3 customer (NEVER 3rd overdue row!)
  const hpl3Res = await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    hplno: 'மூணாவது',
  });
  assert.equal(hpl3Res.result.matchType, 'hplno');
  assert.equal(hpl3Res.result.ambiguous, false);
  assert.equal(hpl3Res.result.matches.length, 1);
  assert.equal(hpl3Res.result.matches[0].hplno, 3);
  assert.equal(hpl3Res.result.matches[0].customerName, 'Synthetic Customer HPL Three');
  // Masked phone only — never full phone digits!
  assert.equal(hpl3Res.result.matches[0].maskedPhone, '******4321');
  assert.ok(!JSON.stringify(hpl3Res.result).includes('9000004321'));

  // 2. Full vehicle plate lookup (`TN 39 AB 1234`) -> exact HPL 10 with vehicle metadata
  const plateFullRes = await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: 'TN 39 AB 1234',
  });
  assert.equal(plateFullRes.result.matchType, 'vehicle_full');
  assert.equal(plateFullRes.result.ambiguous, false);
  assert.equal(plateFullRes.result.matches.length, 1);
  assert.equal(plateFullRes.result.matches[0].hplno, 10);
  assert.equal(plateFullRes.result.matches[0].vehicleDetail.plateDisplay, 'TN 39 AB 1234');
  assert.equal(plateFullRes.result.matches[0].vehicleDetail.brand, 'Royal Enfield');
  assert.equal(plateFullRes.result.matches[0].vehicleDetail.color, 'Red');
  assert.equal(plateFullRes.result.matches[0].vehicleDetail.insuranceExpiryDate, '2027-08-20');

  // 3. Leading-zero plate (`TN 9 A 5` matches DB `TN09A0005`)
  const zeroPlateRes = await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: 'TN 9 A 5',
  });
  assert.equal(zeroPlateRes.result.matchType, 'vehicle_full');
  assert.equal(zeroPlateRes.result.matches.length, 1);
  assert.equal(zeroPlateRes.result.matches[0].hplno, 12);

  // 4. Two customers sharing last-4 `'1234'` -> `ambiguous: true`, `matches.length === 2`
  const last4AmbRes = await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: '1234',
  });
  assert.equal(last4AmbRes.result.matchType, 'vehicle_last4');
  assert.equal(last4AmbRes.result.ambiguous, true);
  assert.equal(last4AmbRes.result.matches.length, 2);
  assert.deepEqual(
    last4AmbRes.result.matches.map((m) => m.hplno),
    [10, 11]
  );

  // 5. Phone last-4 lookup -> `matchType: 'phone'`
  const phoneRes = await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    phone: '4321',
  });
  assert.equal(phoneRes.result.matchType, 'phone');
  assert.equal(phoneRes.result.matches[0].hplno, 3);

  // 6. Unknown plate -> `matchType: 'not_found'`, `matches: []`
  const notFoundRes = await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: 'TN 99 ZZ 0000',
  });
  assert.equal(notFoundRes.result.matchType, 'not_found');
  assert.equal(notFoundRes.result.ambiguous, false);
  assert.equal(notFoundRes.result.matches.length, 0);

  // 7. Cross-tenant attempt: Tenant A looking up Tenant B's plate `TN99ZZ8888` -> `not_found`
  const crossTenantRes = await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: 'TN 99 ZZ 8888',
  });
  assert.equal(crossTenantRes.result.matchType, 'not_found');
  assert.equal(crossTenantRes.result.matches.length, 0);

  // 8. Cache key isolation (financeId + roleScope + normalized params) & bypassCache
  const keyOwner = buildQueryCacheKey(SCOPE_A_OWNER, 'search_customer_loan_status', { hplno: 10 });
  const keyAgent = buildQueryCacheKey(SCOPE_A_AGENT, 'search_customer_loan_status', { hplno: 10 });
  assert.notEqual(keyOwner, keyAgent);

  const cachedHit = await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: 'tn39ab1234', // different casing/spacing -> same normalized cache key!
  });
  assert.equal(cachedHit.cacheHit, true);

  const bypassed = await executeReadOnlyTool(
    SCOPE_A_OWNER,
    'search_customer_loan_status',
    { vehicleNumber: 'tn39ab1234' },
    { bypassCache: true }
  );
  assert.equal(bypassed.cacheHit, false);
});

test('Phase 4.1: System prompt encodes AutoFinex HPL vs list-position rule, Indian RTO/BH plates, customer identity confirmation, self-correction, and zero guessing', () => {
  const langInfo = detectTurnLanguage('HP நம்பர் மூணாவது கஸ்டமர்');
  const prompt = buildSystemInstruction({
    scope: SCOPE_A_OWNER,
    langInfo,
    voiceMode: true,
    dynamicSqlEnabled: false,
  });

  // HPL vs list row distinction
  assert.match(prompt, /hplno\s*=\s*N|HPL loan account number/i);
  assert.match(prompt, /NEVER.*list|list.*position/i);
  // Indian RTO / BH vehicle plate awareness
  assert.match(prompt, /TN\s*39\s*AB\s*1234|RTO|BH/i);
  // Mandatory confirmation of Customer Name + HPL number + Vehicle
  assert.match(prompt, /customer name/i);
  assert.match(prompt, /HPL/i);
  assert.match(prompt, /vehicle/i);
  // Mid-conversation correction & zero guessing on not_found / ambiguous
  assert.match(prompt, /not_found/i);
  assert.match(prompt, /ambiguous/i);
  assert.match(prompt, /discard|ignore.*previous|correction/i);
});

test('Phase 4.2: Deterministic lookup guard forces search_customer_loan_status when Pass 1 skips tools on high-confidence HPL/plate, and NEVER triggers on bare amounts or dates', async (t) => {
  t.after(() => {
    setGeminiStreamImplForTest(null);
    setReadOnlyRunnerForTest(null);
    resetCacheForTest(null);
  });

  resetCacheForTest(null);
  setReadOnlyRunnerForTest(createSyntheticCustomerDbRunner());

  // Pre-populate cache with stale HPL 3 entry to prove deterministic guard uses `bypassCache: true`
  await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', { hplno: 3 });

  let llmCallCount = 0;
  setGeminiStreamImplForTest(async (payload) => {
    llmCallCount += 1;
    if (llmCallCount === 1) {
      // Simulate Gemini mistakenly skipping tool calls and trying to hallucinate/repeat old text!
      return (async function* () {
        yield { text: 'WRONG_UNGROUNDED_PASS1_HALLUCINATION' };
      })();
    }
    const lastTurn = payload.contents[payload.contents.length - 1];
    const lastText = lastTurn.parts[0].text || '';
    const jsonLine = lastText.split('\n').pop();
    const grounded = JSON.parse(jsonLine);
    assert.equal(grounded.tool, 'search_customer_loan_status');
    assert.equal(grounded.result.matchType, 'hplno');
    assert.equal(grounded.result.matches[0].hplno, 3);
    assert.equal(grounded.result.matches[0].customerName, 'Synthetic Customer HPL Three');

    return (async function* () {
      yield {
        text: 'HPL 3 கஸ்டமர் Synthetic Customer HPL Three, வண்டி TN 39 CD 7788, நிலுவை விவரம் சரிபார்க்கப்பட்டது.',
      };
    })();
  });

  const streamedChunks = [];
  const res = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: 'HP நம்பர் மூணாவது நம்பர் கஸ்டமர் விவரம் சொல்லுங்க',
    enableTts: false,
    onTextDelta: (delta) => streamedChunks.push(delta),
  });

  assert.equal(llmCallCount, 2, 'Deterministic guard must run bounded Pass 2 (<= 2 LLM passes)');
  assert.equal(res.responseType, 'business_data');
  assert.equal(res.toolsUsed.length, 1);
  assert.equal(res.toolsUsed[0].toolName, 'search_customer_loan_status');
  assert.equal(res.toolsUsed[0].cacheHit, false, 'Deterministic guard must bypass cache');
  assert.ok(
    !streamedChunks.join('').includes('WRONG_UNGROUNDED_PASS1_HALLUCINATION'),
    'Ungrounded Pass 1 text must NEVER be streamed to UI or TTS!'
  );
  assert.ok(!res.responseText.includes('WRONG_UNGROUNDED_PASS1_HALLUCINATION'));
  assert.match(res.responseText, /Synthetic Customer HPL Three/);

  // Negative check: bare amount `"1234 rupees"` and duration `"ரெண்டு நாள் லேட்"` must NOT trigger lookup tool!
  let negativeDbCalls = 0;
  setReadOnlyRunnerForTest(async () => {
    negativeDbCalls += 1;
    return { rows: [], rowCount: 0 };
  });
  setGeminiStreamImplForTest(async () => {
    return (async function* () {
      yield { text: 'Direct math/general reply without DB lookup.' };
    })();
  });

  const neg1 = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: '1234 rupees into 12 months evlo varum?',
    enableTts: false,
  });
  const neg2 = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: 'ரெண்டு நாள் லேட் ஆனா என்ன பண்ணலாம்?',
    enableTts: false,
  });

  assert.equal(negativeDbCalls, 0);
  assert.equal(neg1.toolsUsed.length, 0);
  assert.equal(neg2.toolsUsed.length, 0);
});

test('Phase 4.3: Multi-turn self-correction ("மாத்தி சொல்றேன், TN 39 AB 1234") supersedes old HPL 3 turn, bypasses cache, and answers HPL 10', async (t) => {
  t.after(() => {
    setGeminiStreamImplForTest(null);
    setReadOnlyRunnerForTest(null);
    resetCacheForTest(null);
  });

  resetCacheForTest(null);
  setReadOnlyRunnerForTest(createSyntheticCustomerDbRunner());

  // Turn 1: User asks HPL 3 -> returns Synthetic Customer HPL Three
  let t1Pass = 0;
  setGeminiStreamImplForTest(async () => {
    t1Pass += 1;
    if (t1Pass === 1) {
      return (async function* () {
        yield { functionCalls: [{ name: 'search_customer_loan_status', args: { hplno: 3 }, id: 't1-c1' }] };
      })();
    }
    return (async function* () {
      yield { text: 'HPL 3 கஸ்டமர் Synthetic Customer HPL Three (வண்டி TN 39 CD 7788) பாக்கி ₹38,500 உள்ளது.' };
    })();
  });

  const turn1 = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: 'HP நம்பர் மூணு கஸ்டமர் சொல்லுங்க',
    enableTts: false,
  });
  assert.match(turn1.responseText, /Synthetic Customer HPL Three/);

  const recentTurns = [
    { role: 'user', text: 'HP நம்பர் மூணு கஸ்டமர் சொல்லுங்க' },
    { role: 'assistant', text: turn1.responseText },
  ];

  // Pre-seed cache for TN 39 AB 1234 to prove correction turn forces `bypassCache: true`
  await executeReadOnlyTool(SCOPE_A_OWNER, 'search_customer_loan_status', {
    vehicleNumber: 'TN 39 AB 1234',
  });

  // Turn 2: User self-corrects -> `"மாத்தி சொல்றேன், வண்டி நம்பர் டி என் முப்பத்தி ஒன்பது ஏ பி ஒண்ணு ரெண்டு மூணு நாலு"`
  // Even if Gemini Pass 1 mistakenly tries to repeat HPL 3 without calling a tool, orchestrator supersedes Turn 1 & looks up TN39AB1234!
  let t2Pass = 0;
  let capturedPass2Contents = null;
  setGeminiStreamImplForTest(async (payload) => {
    t2Pass += 1;
    if (t2Pass === 1) {
      return (async function* () {
        yield { text: 'HPL 3 கஸ்டமர் Synthetic Customer HPL Three...' };
      })();
    }
    capturedPass2Contents = payload.contents;
    const lastTurn = payload.contents[payload.contents.length - 1];
    const jsonLine = (lastTurn.parts[0].text || '').split('\n').pop();
    const grounded = JSON.parse(jsonLine);
    assert.equal(grounded.tool, 'search_customer_loan_status');
    assert.equal(grounded.result.matchType, 'vehicle_full');
    assert.equal(grounded.result.matches[0].hplno, 10);
    assert.equal(grounded.result.matches[0].customerName, 'Synthetic Plate Owner Ten');

    return (async function* () {
      yield {
        text: 'சரி, மாற்றிப் பார்த்துவிட்டேன். வண்டி TN 39 AB 1234 கஸ்டமர் Synthetic Plate Owner Ten, HPL 10.',
      };
    })();
  });

  const turn2Deltas = [];
  const turn2 = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: 'மாத்தி சொல்றேன், வண்டி நம்பர் டி என் முப்பத்தி ஒன்பது ஏ பி ஒண்ணு ரெண்டு மூணு நாலு',
    recentTurns,
    enableTts: false,
    onTextDelta: (d) => turn2Deltas.push(d),
  });

  // Prior assistant turn in history must be marked superseded so Gemini knows not to reuse it
  const priorModelMsg = capturedPass2Contents.find((c) => c.role === 'model' && c.parts[0]?.text);
  assert.ok(priorModelMsg, 'Expected prior assistant message in contents');
  assert.match(priorModelMsg.parts[0].text, /SUPERSEDED/i);

  assert.equal(turn2.toolsUsed[0].toolName, 'search_customer_loan_status');
  assert.equal(turn2.toolsUsed[0].cacheHit, false, 'Self-correction must force fresh DB read (bypassCache)');
  assert.ok(!turn2Deltas.join('').includes('Synthetic Customer HPL Three'));
  assert.ok(!turn2.responseText.includes('Synthetic Customer HPL Three'));
  assert.match(turn2.responseText, /Synthetic Plate Owner Ten/);
  assert.match(turn2.responseText, /HPL 10/);

  // Sub-case B: Even if Gemini Pass 1 calls `search_customer_loan_status` with stale `{ hplno: 3 }`,
  // correction turn replaces stale args with `{ vehicleNumber: 'TN 39 AB 1234' }` -> matches HPL 10!
  let t3Pass = 0;
  setGeminiStreamImplForTest(async (payload) => {
    t3Pass += 1;
    if (t3Pass === 1) {
      return (async function* () {
        yield {
          functionCalls: [{ name: 'search_customer_loan_status', args: { hplno: 3 }, id: 'stale-hpl-call' }],
        };
      })();
    }
    const fnResp = payload.contents[payload.contents.length - 1].parts[0].functionResponse;
    assert.equal(fnResp.response.result.matchType, 'vehicle_full');
    assert.equal(fnResp.response.result.matches[0].hplno, 10);
    return (async function* () {
      yield { text: 'வண்டி TN 39 AB 1234 கஸ்டமர் Synthetic Plate Owner Ten (HPL 10).' };
    })();
  });

  const turn3 = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: 'இல்ல மாத்தி சொல்றேன், TN 39 AB 1234 பாருங்க',
    recentTurns,
    enableTts: false,
  });
  assert.match(turn3.responseText, /HPL 10/);
});

test('Phase 4.4: Ambiguous ordinal after a list injects clarification directive without guessing', async (t) => {
  t.after(() => {
    setGeminiStreamImplForTest(null);
    setReadOnlyRunnerForTest(null);
  });

  let dbCalled = false;
  setReadOnlyRunnerForTest(async () => {
    dbCalled = true;
    return { rows: [], rowCount: 0 };
  });

  let capturedSystemInstruction = '';
  setGeminiStreamImplForTest(async (payload) => {
    capturedSystemInstruction = payload?.config?.systemInstruction || payload?.systemInstruction || '';
    return (async function* () {
      yield {
        text: 'நீங்கள் HPL நம்பர் 3 கஸ்டமரைக் கேட்கிறீர்களா, அல்லது மேலே சொன்ன பட்டியலில் 3-வது கஸ்டமரைக் கேட்கிறீர்களா?',
      };
    })();
  });

  const recentTurns = [
    { role: 'user', text: 'டாப் பெண்டிங் கஸ்டமர்ஸ் யார்?' },
    {
      role: 'assistant',
      text: '1. HPL 12 Synthetic A — ₹18,000\n2. HPL 25 Synthetic B — ₹15,000\n3. HPL 44 Synthetic C — ₹12,000',
    },
  ];

  const res = await runAssistantTurn({
    scope: SCOPE_A_OWNER,
    userText: 'மூணாவது கஸ்டமர் பத்தி சொல்லு',
    recentTurns,
    enableTts: false,
  });

  assert.equal(dbCalled, false, 'Ambiguous ordinal must NOT force a guessed DB lookup');
  assert.match(capturedSystemInstruction, /AMBIGUOUS/i);
  assert.match(capturedSystemInstruction, /HPL #?3/i);
  assert.match(res.responseText, /HPL நம்பர் 3/);
});

test('Phase 4.5: WebSocket reconnect restores bounded sanitized recentTurns via session.config while preserving 0-memory default', async () => {
  const server = http.createServer((_req, res) => res.end('ok'));
  const observedHistories = [];

  const wss = attachAssistantWebSocketGateway(server, {
    verifyUpgradeScope: async () => SCOPE_A_OWNER,
    runAssistantTurn: async ({ userText, recentTurns, onTextDelta }) => {
      observedHistories.push(recentTurns.map((t) => ({ role: t.role, text: t.text })));
      const reply = `Ack: ${userText}`;
      onTextDelta(reply);
      return {
        responseText: reply,
        detectedLanguage: 'ta-IN',
        languageLabel: 'தமிழ்',
        responseType: 'general',
        toolsUsed: [],
      };
    },
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

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

  try {
    const wsReconnect = new WebSocket(`ws://127.0.0.1:${port}/ws/ai-assistant`);
    await waitForMsgType(wsReconnect, 'session.ready');

    wsReconnect.send(
      JSON.stringify({
        type: 'session.config',
        ttsEnabled: false,
        recentTurns: [
          { role: 'user', text: 'HP நம்பர் 3 கஸ்டமர்' },
          { role: 'assistant', text: 'HPL 3 Synthetic Customer HPL Three விவரம்.' },
          { role: 'system_injected', text: 'MUST_BE_IGNORED' },
        ],
      })
    );

    const donePromise = waitForMsgType(wsReconnect, 'assistant.done');
    wsReconnect.send(JSON.stringify({ type: 'text.message', text: 'மாத்தி சொல்றேன், TN 39 AB 1234' }));
    await donePromise;

    assert.equal(observedHistories.length, 1);
    assert.deepEqual(observedHistories[0], [
      { role: 'user', text: 'HP நம்பர் 3 கஸ்டமர்' },
      { role: 'assistant', text: 'HPL 3 Synthetic Customer HPL Three விவரம்.' },
    ]);

    wsReconnect.terminate();
  } finally {
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.close();
  }
});

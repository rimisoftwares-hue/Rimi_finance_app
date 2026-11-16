'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-existing-customer-check';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const dbConfig = require('../../config/database.config');
const riskService = require('./risk.service');
const {
  checkExistingCustomerIdentity,
  normalizeIdentityCheckInput,
  clearExistingCustomerCheckCache,
} = require('./existingCustomerCheck.service');
const customerRoutes = require('../customers/customer.routes');

const FINANCE_A = '11111111-1111-4111-8111-111111111111';
const FINANCE_B = '22222222-2222-4222-8222-222222222222';
const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUST_1 = 'c0000001-0000-4000-8000-000000000001';
const CUST_2 = 'c0000002-0000-4000-8000-000000000002';
const CUST_3_CONSULTING_NOLOAN = 'c0000003-0000-4000-8000-000000000003';
const LOAN_1 = 'd0000001-0000-4000-8000-000000000001';
const LOAN_2 = 'd0000002-0000-4000-8000-000000000002';

function makeRiskRow(overrides = {}) {
  return {
    customer_id: CUST_1,
    hplno: 101,
    cname: 'Murugan K',
    loan_status: 'active',
    customer_created_at: '2025-01-10',
    legacy_home_address: '12 Gandhi Rd, Madurai',
    home_latitude: null,
    home_longitude: null,
    finance_name: 'Senthur Finance',
    loan_id: LOAN_1,
    loan_type: 'two_wheeler',
    hp_amount: 60000,
    hp_date: '2025-01-10',
    due_date: '2025-02-10',
    due_month: 12,
    interest_rate: 2,
    penalty_amount: 200,
    due_amount: 5500,
    net_payable: 66000,
    vehicle_number: 'TN58AB1234',
    brand: 'Honda',
    model: 'Activa 6G',
    body_type: 'scooter',
    phones: [{ number: '9876543210', type: 'mobile', contactType: 'customer' }],
    agent_id: null,
    agent_name: null,
    total_paid: 11000,
    total_penalty: 0,
    payment_count: 2,
    on_time_count: 2,
    late_15_30: 0,
    late_31_60: 0,
    late_over_60: 0,
    broken_ptp_count: 0,
    has_seizure: false,
    distance_from_home: null,
    live_latitude: null,
    live_longitude: null,
    last_ping_at: null,
    live_is_online: false,
    curr_house_no: '12',
    curr_street: 'Gandhi Rd',
    curr_street_name: null,
    curr_village: null,
    curr_address: null,
    curr_city: 'Madurai',
    curr_district: 'Madurai',
    curr_state: 'Tamil Nadu',
    curr_pincode: '625001',
    curr_addr_latitude: null,
    curr_addr_longitude: null,
    ...overrides,
  };
}

function sendJsonRequest(server, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body !== undefined ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('1. normalizeIdentityCheckInput strips formatting, drops +91/0 prefixes, ignores invalid/short values, caps phones at 6', () => {
  const norm = normalizeIdentityCheckInput({
    phones: [
      '+91 98765-43210',
      '09876543210', // duplicate after prefix drop
      '9123456789',
      '12345', // invalid short phone -> ignored
      '0000000000', // all-zero -> ignored
      '9000000001',
      '9000000002',
      '9000000003',
      '9000000004',
      '9000000005', // 7th valid unique -> capped at 6
    ],
    aadhar: '1234 5678 9012',
    otherGovtIdType: 'PAN_CARD',
    otherGovtIdNumber: 'abcde-1234-f',
    excludeCustomerId: CUST_1,
  });

  assert.deepEqual(norm.phones, [
    '9876543210',
    '9123456789',
    '9000000001',
    '9000000002',
    '9000000003',
    '9000000004',
  ]);
  assert.equal(norm.aadhar, '123456789012');
  assert.equal(norm.otherGovtIdType, 'pan_card');
  assert.equal(norm.otherGovtIdNumber, 'ABCDE1234F');
  assert.equal(norm.excludeCustomerId, CUST_1);
  assert.equal(norm.hasValidInput, true);

  const invalidOnly = normalizeIdentityCheckInput({
    phones: ['98765', 'abc'],
    aadhar: '12345678', // < 12 digits
    otherGovtIdNumber: 'ab-1', // < 5 alphanumeric chars
    excludeCustomerId: 'not-a-uuid',
  });
  assert.equal(invalidOnly.hasValidInput, false);
  assert.equal(invalidOnly.excludeCustomerId, null);
});

test('2. Invalid/empty identifiers return { found: false, matchCount: 0, matches: [] } without querying DB', async () => {
  clearExistingCustomerCheckCache();
  let queryCount = 0;
  const fakeDb = {
    query: async () => {
      queryCount += 1;
      return { rows: [] };
    },
  };

  const res = await checkExistingCustomerIdentity(
    FINANCE_A,
    { phones: ['9999'], aadhar: '12345', otherGovtIdNumber: 'A12' },
    { dbClient: fakeDb }
  );

  assert.deepEqual(res, { found: false, matchCount: 0, matches: [] });
  assert.equal(queryCount, 0);
});

test('3. Matches customer phone, guardian phone, Aadhaar (with spaces), and govt ID (case/hyphens), excludes work phones, masks Aadhaar, and handles consulting customer with no loan', async () => {
  clearExistingCustomerCheckCache();
  const capturedQueries = [];

  const candidateRows = [
    {
      customer_id: CUST_1,
      hplno: 101,
      cname: 'Murugan K',
      cfname_unit: 'S/O',
      cfname_value: 'Karuppan',
      aadhar_id: '1234 5678 9012',
      other_govt_id_type: 'pan_card',
      other_govt_id_number: 'abcde-1234-f',
      contacts: [
        { number: '+91 98765-43210', type: 'mobile', contact_type: 'customer' },
        { number: '0452222333', type: 'work', contact_type: 'customer' },
      ],
      guardians: [
        {
          id: 'g-1',
          gname: 'Selvi M',
          gfname_unit: 'W/O',
          gfname_value: 'Murugan K',
          aadhar_id: '999988887777',
          other_govt_id_type: 'voter_id',
          other_govt_id_number: 'TN1234567',
        },
      ],
      total_match_count: 3,
    },
    {
      customer_id: CUST_2,
      hplno: 205,
      cname: 'Raja P',
      cfname_unit: 'S/O',
      cfname_value: 'Pandi',
      aadhar_id: null,
      other_govt_id_type: null,
      other_govt_id_number: null,
      contacts: [
        { number: '9111122222', type: 'mobile', contact_type: 'customer' },
        { number: '9876543210', type: 'mobile', contact_type: 'guardian' },
      ],
      guardians: [
        {
          id: 'g-2',
          gname: 'Murugan K',
          gfname_unit: 'S/O',
          gfname_value: 'Karuppan',
          aadhar_id: '123456789012',
          other_govt_id_type: 'driving_license',
          other_govt_id_number: 'TN58-20200099',
        },
      ],
      total_match_count: 3,
    },
    {
      customer_id: CUST_3_CONSULTING_NOLOAN,
      hplno: 310,
      cname: 'Suresh Consulting',
      cfname_unit: 'S/O',
      cfname_value: 'Velu',
      aadhar_id: null,
      other_govt_id_type: 'pan_card',
      other_govt_id_number: 'ABCDE1234F',
      contacts: [{ number: '9555566666', type: 'mobile', contact_type: 'customer' }],
      guardians: [],
      total_match_count: 3,
    },
  ];

  const riskRows = [
    makeRiskRow({
      customer_id: CUST_1,
      hplno: 101,
      cname: 'Murugan K',
      loan_status: 'active',
      due_date: '2025-02-10',
      total_paid: 11000,
    }),
    makeRiskRow({
      customer_id: CUST_2,
      hplno: 205,
      cname: 'Raja P',
      loan_status: 'seized',
      has_seizure: true,
      due_date: '2024-06-10',
      total_paid: 5500,
    }),
    makeRiskRow({
      customer_id: CUST_3_CONSULTING_NOLOAN,
      hplno: 310,
      cname: 'Suresh Consulting',
      loan_status: 'active',
      loan_id: null,
      loan_type: null,
      hp_amount: null,
      hp_date: null,
      due_date: null,
      due_month: null,
      interest_rate: null,
      penalty_amount: null,
      due_amount: null,
      net_payable: null,
      total_paid: 0,
      payment_count: 0,
      on_time_count: 0,
    }),
  ];

  const fakeDb = {
    query: async (sql, params) => {
      assert.equal(sql.includes('?'), false, 'SQL must never contain a literal question mark');
      capturedQueries.push({ sql, params });
      if (capturedQueries.length === 1) {
        assert.equal(params[0], FINANCE_A, '$1 must always be financeId');
        // Candidate SQL must filter out work phones
        assert.match(sql, /type::text\s*<>\s*'work'/i);
        return { rows: candidateRows };
      }
      return { rows: riskRows };
    },
  };

  const result = await checkExistingCustomerIdentity(
    FINANCE_A,
    {
      phones: ['+91 98765 43210', '0452222333'],
      aadhar: '1234 5678 9012',
      otherGovtIdType: 'pan_card',
      otherGovtIdNumber: 'abcde-1234-f',
      asOfDate: '2026-05-15',
    },
    { dbClient: fakeDb }
  );

  assert.equal(result.found, true);
  assert.equal(result.matchCount, 3);
  assert.equal(result.matches.length, 3);

  // Ordering: seized/active with highest dueRiskScore first -> CUST_2 (seized, older overdue) before CUST_1, and loan-less consulting last among open
  assert.equal(result.matches[0].customerId, CUST_2);
  assert.equal(result.matches[0].borrowerName, 'Raja P');
  assert.deepEqual(result.matches[0].matchedRoles, ['guardian']);
  assert.equal(
    result.matches[0].matchedFields.some(
      (f) => f.entityRole === 'guardian' && f.field === 'aadhar' && f.strength === 'strong' && f.maskedValue === 'XXXX-XXXX-9012'
    ),
    true
  );
  assert.equal(
    result.matches[0].matchedFields.some(
      (f) => f.entityRole === 'guardian' && f.field === 'phone' && f.strength === 'possible' && f.maskedValue === 'XXXXXX3210'
    ),
    true
  );
  assert.ok(result.matches[0].risk.dueRiskScore > 0);

  // CUST_1 matched as customer on phone, aadhar, and other_govt_id (work phone 0452222333 did NOT match)
  const m1 = result.matches.find((m) => m.customerId === CUST_1);
  assert.ok(m1);
  assert.deepEqual(m1.matchedRoles, ['customer']);
  assert.equal(m1.relationLabel, 'S/O Karuppan');
  assert.equal(m1.matchedFields.some((f) => f.maskedValue.endsWith('2333')), false, 'Work phone must never match');
  assert.equal(
    m1.matchedFields.some((f) => f.field === 'other_govt_id' && f.strength === 'strong' && f.maskedValue.endsWith('234F')),
    true
  );
  assert.equal(m1.guardianSummary.maskedAadhar, 'XXXX-XXXX-7777');

  // Consulting customer with no loan row returns cleanly with hasLoan: false and risk: null
  const m3 = result.matches.find((m) => m.customerId === CUST_3_CONSULTING_NOLOAN);
  assert.ok(m3);
  assert.equal(m3.hasLoan, false);
  assert.equal(m3.loanSummary, null);
  assert.equal(m3.risk, null);

  // Privacy check: raw 12-digit Aadhaar NEVER appears anywhere in serialized response
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('123456789012'), false);
  assert.equal(serialized.includes('999988887777'), false);
});

test('4. Tenant isolation, excludeCustomerId parameter, and max-10 limit with true matchCount', async () => {
  clearExistingCustomerCheckCache();
  let seenParams = null;
  let seenSql = '';

  const twelveCandidates = Array.from({ length: 12 }, (_, idx) => ({
    customer_id: `c0000099-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
    hplno: 500 + idx,
    cname: `Borrower ${idx + 1}`,
    cfname_unit: 'S/O',
    cfname_value: 'Parent',
    aadhar_id: null,
    other_govt_id_type: null,
    other_govt_id_number: null,
    contacts: [{ number: '9888877777', type: 'mobile', contact_type: 'customer' }],
    guardians: [],
    total_match_count: 14,
  }));

  const twelveRiskRows = twelveCandidates.map((c, idx) =>
    makeRiskRow({
      customer_id: c.customer_id,
      hplno: c.hplno,
      cname: c.cname,
      loan_status: idx === 11 ? 'close' : 'active',
    })
  );

  let callIdx = 0;
  const fakeDb = {
    query: async (sql, params) => {
      callIdx += 1;
      if (callIdx === 1) {
        seenSql = sql;
        seenParams = params;
        return { rows: twelveCandidates };
      }
      return { rows: twelveRiskRows };
    },
  };

  const res = await checkExistingCustomerIdentity(
    FINANCE_B,
    {
      phones: ['9888877777'],
      excludeCustomerId: CUST_1,
      financeId: FINANCE_A, // attacker-supplied financeId in body MUST be ignored
    },
    { dbClient: fakeDb }
  );

  assert.equal(seenParams[0], FINANCE_B);
  assert.equal(seenParams.includes(FINANCE_A), false);
  assert.equal(seenParams.includes(CUST_1), true);
  assert.match(seenSql, /c\.finance_id\s*=\s*\$1::uuid/);
  assert.match(seenSql, /c\.id\s*<>\s*\$/);

  assert.equal(res.found, true);
  assert.equal(res.matchCount, 14);
  assert.equal(res.matches.length, 10);
});

test('5. POST /api/customers/check-existing enforces auth, body validation, Cache-Control: no-store, 429 rate limit, and zero PII in logs', async () => {
  clearExistingCustomerCheckCache();

  // Stub db.query so enhancedCheckFinance (owner token) and checkExistingCustomerIdentity run offline
  const origQuery = dbConfig.db.query;
  const consoleLogs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...args) => consoleLogs.push(args.join(' '));
  console.warn = (...args) => consoleLogs.push(args.join(' '));
  console.error = (...args) => consoleLogs.push(args.join(' '));

  dbConfig.db.query = async (sql, params) => {
    const text = typeof sql === 'string' ? sql : sql.text;
    if (text.includes('FROM owner')) {
      return {
        rows: [{ id: OWNER_A, username: 'owner_test', password: 'hashed_password', is_active: 1 }],
      };
    }
    if (text.includes('FROM finance_detail')) {
      return {
        rows: [{ id: FINANCE_A, owner_id: OWNER_A, is_active: 1 }],
      };
    }
    return { rows: [] };
  };

  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/customers', customerRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const ownerToken = jwt.sign(
      { owner: { id: OWNER_A, username: 'owner_test' }, current_finance_id: FINANCE_A },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const authHeaders = {
      Authorization: `Bearer ${ownerToken}`,
      'finance-id': FINANCE_A,
    };

    // 5a. Unauthenticated -> 401
    const unauth = await sendJsonRequest(server, 'POST', '/api/customers/check-existing', {
      phones: ['9876543210'],
    });
    assert.equal(unauth.status, 401);

    // 5b. Invalid body (phones > 6) -> 400 without echoing phone numbers
    const tooManyPhones = await sendJsonRequest(
      server,
      'POST',
      '/api/customers/check-existing',
      {
        phones: [
          '9876543210',
          '9876543211',
          '9876543212',
          '9876543213',
          '9876543214',
          '9876543215',
          '9876543216',
        ],
      },
      authHeaders
    );
    assert.equal(tooManyPhones.status, 400);
    assert.equal(JSON.stringify(tooManyPhones.body).includes('9876543210'), false);

    // 5c. Valid check -> 200 + Cache-Control: no-store
    const okRes = await sendJsonRequest(
      server,
      'POST',
      '/api/customers/check-existing',
      { phones: ['9876543210'], aadhar: '1234 5678 9012', otherGovtIdNumber: 'ABCDE1234F' },
      authHeaders
    );
    assert.equal(okRes.status, 200);
    assert.equal(okRes.headers['cache-control'], 'no-store');
    assert.equal(okRes.body.success, true);
    assert.equal(okRes.body.found, false);

    // 5d. Rate limit -> >30 requests within 1 minute returns 429
    let got429 = false;
    for (let i = 0; i < 32; i++) {
      const r = await sendJsonRequest(
        server,
        'POST',
        '/api/customers/check-existing',
        { phones: ['9876543210'] },
        authHeaders
      );
      if (r.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.equal(got429, true, 'Expected 429 after exceeding 30 requests/minute');

    // 5e. Verify zero PII leaked to console logs
    const combinedLogs = consoleLogs.join('\n');
    assert.equal(combinedLogs.includes('9876543210'), false);
    assert.equal(combinedLogs.includes('123456789012'), false);
    assert.equal(combinedLogs.includes('ABCDE1234F'), false);
  } finally {
    dbConfig.db.query = origQuery;
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('6. Backward compatibility: buildCustomerRiskSql, getCustomerDeepView & getCreditCheck preserve exact defaults and support loan-optional mode', async () => {
  const defaultSql = riskService.buildCustomerRiskSql('c.id = $2::uuid');
  assert.match(defaultSql, /\n\s*JOIN LATERAL\s*\(/);
  assert.equal(defaultSql.includes('?'), false);

  const optionalSql = riskService.buildCustomerRiskSql('c.id = $2::uuid', { requireLoan: false });
  assert.match(optionalSql, /LEFT JOIN LATERAL\s*\(/);
  assert.equal(optionalSql.includes('?'), false);

  const origQuery = dbConfig.db.query;
  const capturedCreditSqls = [];
  dbConfig.db.query = async (sql) => {
    capturedCreditSqls.push(String(sql));
    return { rows: [] };
  };
  try {
    const defaultCheck = await riskService.getCreditCheck(FINANCE_A, { phone: '9876543210' });
    assert.equal(defaultCheck.found, false);
    assert.match(capturedCreditSqls[0], /\n\s*JOIN LATERAL\s*\(/);

    const loanOptionalCheck = await riskService.getCreditCheck(
      FINANCE_A,
      { phone: '9876543210' },
      { requireLoan: false }
    );
    assert.equal(loanOptionalCheck.found, false);
    assert.match(capturedCreditSqls[1], /LEFT JOIN LATERAL\s*\(/);
  } finally {
    dbConfig.db.query = origQuery;
  }
});

test('7. otherGovtIdType comparison: matches only matching type when otherGovtIdType is provided, and matches any type when omitted', async () => {
  clearExistingCustomerCheckCache();
  const voterRow = {
    customer_id: CUST_1,
    hplno: 101,
    cname: 'Voter Customer',
    cfname_unit: 'S/O',
    cfname_value: 'Father',
    aadhar_id: null,
    other_govt_id_type: 'voter_id',
    other_govt_id_number: 'XYZ9876543',
    contacts: [],
    guardians: [],
    total_match_count: 1,
  };

  // When caller specifies 'pan_card', SQL includes type filter and JS matcher also enforces type match
  const fakeDbTypeMismatch = {
    query: async () => ({ rows: [voterRow] }),
  };
  const mismatchRes = await checkExistingCustomerIdentity(
    FINANCE_A,
    { otherGovtIdType: 'pan_card', otherGovtIdNumber: 'xyz-9876543' },
    { dbClient: fakeDbTypeMismatch }
  );
  assert.equal(mismatchRes.found, false);
  assert.equal(mismatchRes.matches.length, 0);

  // When caller omits otherGovtIdType, it matches across any govt ID type
  let step = 0;
  const fakeDbAnyType = {
    query: async () => {
      step += 1;
      return step === 1 ? { rows: [voterRow] } : { rows: [makeRiskRow({ customer_id: CUST_1, cname: 'Voter Customer' })] };
    },
  };
  const anyTypeRes = await checkExistingCustomerIdentity(
    FINANCE_A,
    { otherGovtIdNumber: 'xyz-9876543' },
    { dbClient: fakeDbAnyType }
  );
  assert.equal(anyTypeRes.found, true);
  assert.equal(anyTypeRes.matches.length, 1);
  assert.equal(anyTypeRes.matches[0].matchedFields[0].field, 'other_govt_id');
});


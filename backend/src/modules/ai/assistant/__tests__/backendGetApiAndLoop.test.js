'use strict';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key-not-real';
process.env.SARVAM_API_KEY = process.env.SARVAM_API_KEY || 'test-sarvam-key-not-real';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-unit-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const {
  BACKEND_GET_API_CATALOG,
  validateAndNormalizeGetApiRequest,
  searchBackendGetApiCatalog,
} = require('../security/backendGetApiRegistry');
const {
  extractScopeFromHttpRequest,
  attachInternalAuthToScope,
  getInternalAuthHeaders,
} = require('../security/financeScopeValidator');
const { issueWsTicket, consumeWsTicket, resetWsTicketsForTest } = require('../security/wsTicket');
const { assertSafeSelectSql } = require('../security/sqlValidator');
const { setReadOnlyRunnerForTest } = require('../security/readOnlyDbPool');
const {
  executeBackendGetApi,
  closeInternalLoopbackServer,
  setExpressAppForTest,
  setBackendGetApiAuditSinkForTest,
} = require('../services/backendGetApiExecutor.service');
const { executeReadOnlyTool, CUSTOMER_SEARCH_SQL } = require('../services/readOnlyQuery.service');
const { resetCacheForTest } = require('../services/aiCache.service');
const { setGeminiStreamImplForTest } = require('../providers/geminiStream.provider');
const { runAssistantTurn } = require('../services/aiOrchestrator.service');

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

function makeAuthedScope(role = 'owner', financeId = TENANT_A) {
  return attachInternalAuthToScope(
    {
      financeId,
      userId: `user-${role}-1`,
      username: `${role}_user`,
      role,
      isOwner: role === 'owner',
      authMode: role === 'owner' ? 'license' : 'direct_user',
      financeName: 'Rimi Auto Finance',
    },
    {
      authorization: `Bearer fake-jwt-for-${role}`,
      ownerAuthorization: role === 'owner' ? 'Bearer fake-owner-jwt' : null,
    }
  );
}

test('Phase 5.1: backendGetApiRegistry enforces GET-only, SSRF/traversal guards, legacy route blocklist, RBAC, and tenant path binding', () => {
  const ownerScope = makeAuthedScope('owner');
  const adminScope = makeAuthedScope('admin');
  const staffScope = makeAuthedScope('staff');
  const agentScope = makeAuthedScope('agent');

  assert.ok(BACKEND_GET_API_CATALOG.length >= 60, 'Catalog should expose all tenant-safe GET endpoints');

  // 1. Non-GET methods rejected
  for (const badMethod of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.throws(
      () => validateAndNormalizeGetApiRequest(ownerScope, { endpoint: '/api/customers', method: badMethod }),
      (err) => err.code === 'FORBIDDEN_HTTP_METHOD' && err.statusCode === 403
    );
  }

  // 2. SSRF external schemes & protocol-relative URLs rejected
  for (const ssrfUrl of [
    'http://169.254.169.254/latest/meta-data/',
    'https://evil.example.com/api/customers',
    '//evil.example.com/api/customers',
    'file:///etc/passwd',
  ]) {
    assert.throws(
      () => validateAndNormalizeGetApiRequest(ownerScope, { endpoint: ssrfUrl }),
      (err) => err.code === 'EXTERNAL_URL_FORBIDDEN'
    );
  }

  // 3. Path traversal (raw and URL-encoded) rejected
  for (const trav of [
    '/api/customers/../internal/v1/health',
    '/api/customers/..%2f..%2fpayments',
    '/api/vehicles/%2e%2e/customers/search',
  ]) {
    assert.throws(
      () => validateAndNormalizeGetApiRequest(ownerScope, { endpoint: trav }),
      (err) => err.code === 'PATH_TRAVERSAL_FORBIDDEN'
    );
  }

  // 4. Explicit blocklist catches legacy un-scoped, recursive AI, internal HMAC, and signed media routes
  //    BEFORE `:customerId` or `:id` wildcards can match!
  const blockedPaths = [
    '/payments',
    '/lastduedate',
    '/api/lastduedate',
    '/api/customers/search',
    '/api/customers/search?query=ravi',
    'customers/search',
    '/api/customers/images/signed-url',
    '/api/vehicles/veh-123/refresh-images',
    '/api/ai/calls/call-99/recording-url',
    '/api/users/u-1/staff-details',
    '/api/ai/assistant/message',
    '/api/ai/assistant/ws-ticket',
    '/api/internal/v1/health',
    '/api/auth/login',
    '/uploads/secret.jpg',
  ];
  for (const bp of blockedPaths) {
    assert.throws(
      () => validateAndNormalizeGetApiRequest(ownerScope, { endpoint: bp }),
      (err) => err.code === 'FORBIDDEN_BACKEND_ENDPOINT' && err.statusCode === 403,
      `Expected ${bp} to be hard-blocked`
    );
  }

  // 5. RBAC enforcement across roles
  assert.throws(
    () => validateAndNormalizeGetApiRequest(agentScope, { endpoint: '/api/agents/login-report' }),
    (err) => err.code === 'ENDPOINT_ROLE_FORBIDDEN'
  );
  assert.throws(
    () => validateAndNormalizeGetApiRequest(staffScope, { endpoint: '/api/reports/pnl' }),
    (err) => err.code === 'ENDPOINT_ROLE_FORBIDDEN'
  );
  assert.throws(
    () => validateAndNormalizeGetApiRequest(adminScope, { endpoint: '/api/finance/banks' }),
    (err) => err.code === 'ENDPOINT_ROLE_FORBIDDEN'
  );

  // Admin can access login-report & accounting reports; Owner can access banks
  const adminLoginOk = validateAndNormalizeGetApiRequest(adminScope, {
    endpoint: '/api/agents/login-report?financeId=99999999-9999-4999-8999-999999999999',
    queryParams: { dateFrom: '2026-11-15', dateTo: '2026-11-15', ownerId: 'evil', token: 'steal' },
  });
  assert.equal(adminLoginOk.pathname, '/api/agents/login-report');
  assert.deepEqual(adminLoginOk.queryObject, { dateFrom: '2026-11-15', dateTo: '2026-11-15' });

  const ownerBanksOk = validateAndNormalizeGetApiRequest(ownerScope, { endpoint: '/api/finance/banks' });
  assert.equal(ownerBanksOk.pathname, '/api/finance/banks');

  // 6. `/api/finance/:id/address` always rebinds `:id` to verified `scope.financeId`
  const reboundAddr = validateAndNormalizeGetApiRequest(ownerScope, {
    endpoint: `/api/finance/${TENANT_B}/address`,
  });
  assert.equal(reboundAddr.pathname, `/api/finance/${TENANT_A}/address`);

  // 7. Catalog discovery filters by role and keyword
  const agentStaffApis = searchBackendGetApiCatalog(agentScope, { category: 'staff' });
  assert.ok(agentStaffApis.endpoints.some((e) => e.endpoint === '/api/auth/allUsers'));
  assert.ok(!agentStaffApis.endpoints.some((e) => e.endpoint === '/api/agents/login-report'));
});

test('Phase 5.2: INTERNAL_AUTH_SYMBOL survives HTTP -> WS ticket exchange without ever serializing into JSON or Object.keys', () => {
  resetWsTicketsForTest();
  const fakeReq = {
    financeId: TENANT_A,
    isOwner: true,
    authMode: 'license',
    user: { id: 'owner-1', username: 'boss', role: 'owner', finance_name: 'Rimi Finance' },
    headers: {
      authorization: 'Bearer secret-access-jwt-value',
      'owner-authorization': 'Bearer secret-owner-jwt-value',
    },
  };

  const httpScope = extractScopeFromHttpRequest(fakeReq);
  assert.ok(!JSON.stringify(httpScope).includes('secret-access-jwt-value'));
  assert.ok(!JSON.stringify(httpScope).includes('secret-owner-jwt-value'));
  assert.ok(!Object.keys(httpScope).some((k) => k.toLowerCase().includes('token') || k.toLowerCase().includes('auth') && k !== 'authMode'));

  const { ticket } = issueWsTicket(httpScope);
  const wsScope = consumeWsTicket(ticket);
  assert.ok(wsScope);
  assert.ok(!JSON.stringify(wsScope).includes('secret-access-jwt-value'));

  const internalHeaders = getInternalAuthHeaders(wsScope);
  assert.equal(internalHeaders['Finance-ID'], TENANT_A);
  assert.equal(internalHeaders.Authorization, 'Bearer secret-access-jwt-value');
  assert.equal(internalHeaders['Owner-Authorization'], 'Bearer secret-owner-jwt-value');
  resetWsTicketsForTest();
});

test('Phase 5.3: Loopback Express GET executor forwards auth headers, preserves full addresses & phones, strips secrets/Aadhaar/photos, filters large lists, and blocks cross-tenant payloads', async () => {
  resetCacheForTest(null);

  const auditEntries = [];
  setBackendGetApiAuditSinkForTest((entry) => auditEntries.push(entry));

  const mockApp = express();
  mockApp.get('/api/customers/:customerId', (req, res) => {
    const authHdr = req.headers.authorization;
    const finHdr = req.headers['finance-id'];
    if (!authHdr || !finHdr) {
      return res.status(401).json({ error: 'Missing auth headers' });
    }
    if (req.params.customerId === 'cross-tenant-uuid') {
      return res.json({
        customer: {
          id: 'cross-tenant-uuid',
          finance_id: TENANT_B,
          cname: 'Other Company Secret Customer',
        },
      });
    }
    return res.json({
      customer: {
        id: 'cust-105',
        finance_id: finHdr,
        hplno: 105,
        cname: 'Murugan S',
        aadhar_id: '1234-5678-9012',
        pan_number: 'ABCDE1234F',
        customer_photo: 'https://s3.amazonaws.com/bucket/private-photo.jpg',
        signature_blob: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
        account_number: '98765432101234',
        full_address: '12 Gandhi Road, RS Puram, Coimbatore, Tamil Nadu, 641002',
      },
      contacts: [
        { contact_type: 'customer', type: 'mobile', number: '9876543210' },
        { contact_type: 'customer', type: 'work', number: '9123456780' },
      ],
      guardian: {
        gname: 'Selvam K',
        guardian_phone: '9988776655',
        full_address: '45 Anna Nagar, Pollachi, Coimbatore, 642001',
        gphoto: 's3://guardian-photo.jpg',
      },
    });
  });

  mockApp.get('/api/customers', (req, res) => {
    const list = [];
    for (let i = 1; i <= 120; i += 1) {
      list.push({
        hplno: i,
        cname: i % 10 === 0 ? `Coimbatore Customer ${i}` : `Salem Customer ${i}`,
        caddress: i % 10 === 0 ? `${i} Avinashi Road, Coimbatore` : `${i} Omalur Main Road, Salem`,
        contacts_json: [{ type: 'mobile', number: `98420${String(10000 + i).slice(-5)}` }],
        aadhar_id: '999988887777',
        vehicleMediaPhoto: 'https://s3/photo.jpg',
      });
    }
    res.json(list);
  });

  setExpressAppForTest(mockApp);

  try {
    const staffScope = makeAuthedScope('staff', TENANT_A);
    const ownerScope = makeAuthedScope('owner', TENANT_A);

    // 1. Single customer full detail via staff scope
    const detailRes = await executeBackendGetApi(staffScope, {
      endpoint: '/api/customers/105',
    });

    assert.equal(detailRes.ok, true);
    assert.equal(detailRes.data.customer.cname, 'Murugan S');
    assert.equal(
      detailRes.data.customer.full_address,
      '12 Gandhi Road, RS Puram, Coimbatore, Tamil Nadu, 641002'
    );
    assert.equal(detailRes.data.contacts[0].number, '9876543210');
    assert.equal(detailRes.data.contacts[1].number, '9123456780');
    assert.equal(detailRes.data.guardian.guardian_phone, '9988776655');

    // Sensitive & noisy fields stripped; bank account masked for non-owner
    const serializedStaff = JSON.stringify(detailRes);
    assert.ok(!serializedStaff.includes('1234-5678-9012'), 'Aadhaar must be stripped');
    assert.ok(!serializedStaff.includes('ABCDE1234F'), 'PAN must be stripped');
    assert.ok(!serializedStaff.includes('private-photo.jpg'), 'Photo URLs must be stripped');
    assert.ok(!serializedStaff.includes('iVBORw0KGgo'), 'Base64 media blobs must be omitted');
    assert.equal(detailRes.data.customer.account_number, '******1234');

    // Owner sees unmasked account_number
    const ownerDetailRes = await executeBackendGetApi(ownerScope, {
      endpoint: '/api/customers/105',
    });
    assert.equal(ownerDetailRes.data.customer.account_number, '98765432101234');

    // 2. Large array with searchFilter + exact count preservation
    const filteredListRes = await executeBackendGetApi(staffScope, {
      endpoint: '/api/customers',
      searchFilter: 'Coimbatore',
      maxItems: 5,
    });
    assert.equal(filteredListRes.data.totalCount, 120);
    assert.equal(filteredListRes.data.matchedCount, 12);
    assert.equal(filteredListRes.data.returnedCount, 5);
    assert.equal(filteredListRes.data.truncated, true);
    assert.ok(filteredListRes.data.items.every((c) => c.caddress.includes('Coimbatore')));
    assert.ok(!JSON.stringify(filteredListRes.data.items).includes('999988887777'));

    // 3. Defense-in-depth cross-tenant response guard blocks mismatched finance_id
    await assert.rejects(
      () => executeBackendGetApi(staffScope, { endpoint: '/api/customers/cross-tenant-uuid' }),
      (err) => err.code === 'CROSS_TENANT_RESPONSE_BLOCKED' && err.statusCode === 404
    );

    // 4. Audit sink recorded calls with zero leaked JWT tokens
    assert.ok(auditEntries.length >= 3);
    assert.ok(!JSON.stringify(auditEntries).includes('fake-jwt-for-'));
  } finally {
    setBackendGetApiAuditSinkForTest(null);
    setExpressAppForTest(null);
    await closeInternalLoopbackServer();
  }
});

test('Phase 5.4: Upgraded CUSTOMER_SEARCH_SQL passes SQL safety validator and returns fullAddress + full customer & guardian phone numbers', async () => {
  resetCacheForTest(null);

  assert.doesNotThrow(() => assertSafeSelectSql(CUSTOMER_SEARCH_SQL));
  assert.ok(CUSTOMER_SEARCH_SQL.includes('addr_info.full_address'));
  assert.ok(CUSTOMER_SEARCH_SQL.includes('ct_info.customer_phones_csv'));

  setReadOnlyRunnerForTest(async (_scope, sql) => {
    assert.ok(sql.includes('FROM address_history ah'));
    return {
      rowCount: 1,
      rows: [
        {
          customer_id: 'cust-105',
          hplno: 105,
          cname: 'Karthik Raja',
          cfname_unit: 'S/O',
          cfname_value: 'Ramasamy',
          profession: 'Textile Weaver',
          work_office_address: 'SIDCO Industrial Estate, Tiruppur',
          broker_name: 'Senthil Motors',
          loan_status: 'active',
          full_address: '88 Kumaran Road, Tiruppur, Tamil Nadu, 641601',
          village: 'Kumaran Nagar',
          city: 'Tiruppur',
          district: 'Tiruppur',
          pincode: '641601',
          vehicle_number: 'TN39AB1234',
          brand: 'Honda',
          model_name: 'Activa 6G',
          make_year: 2024,
          phone_last4: '4321',
          customer_phones_csv: '9842204321,9443301122',
          guardian_phones_csv: '9789012345',
          hp_amount: 60000,
          hp_date: '2026-06-01',
          due_date: '2026-07-01',
          first_due_date: '2026-07-01',
          due_month: 12,
          due_amount: 5500,
          net_payable: 66000,
          total_paid: 22000,
          payment_count: 4,
          match_rank: 1,
        },
      ],
    };
  });

  try {
    const scope = makeAuthedScope('staff', TENANT_A);
    const out = await executeReadOnlyTool(scope, 'search_customer_loan_status', { hplno: 105 });
    assert.equal(out.result.matchCount, 1);
    const match = out.result.matches[0];
    assert.equal(match.customerName, 'Karthik Raja');
    assert.equal(match.relationName, 'S/O Ramasamy');
    assert.equal(match.primaryPhone, '9842204321');
    assert.deepEqual(match.phoneNumbers, ['9842204321', '9443301122']);
    assert.deepEqual(match.guardianPhoneNumbers, ['9789012345']);
    assert.equal(match.fullAddress, '88 Kumaran Road, Tiruppur, Tamil Nadu, 641601');
    assert.equal(match.addressDetail.city, 'Tiruppur');
    assert.equal(match.profession, 'Textile Weaver');
    assert.equal(match.brokerName, 'Senthil Motors');
  } finally {
    setReadOnlyRunnerForTest(null);
  }
});

test('Phase 5.5: Multi-round AUTO orchestrator chains customer lookup -> GET /api/customers/:id without streaming mid-chain chatter, AND handles parallel staff count + login-report GET APIs', async () => {
  resetCacheForTest(null);

  const mockApp = express();
  mockApp.get('/api/customers/105', (_req, res) => {
    res.json({
      customer: {
        id: 'cust-105',
        finance_id: TENANT_A,
        hplno: 105,
        cname: 'Murugan S',
        full_address: '12 Gandhi Road, RS Puram, Coimbatore - 641002',
      },
      contacts: [{ contact_type: 'customer', type: 'mobile', number: '9876543210' }],
      guardian: {
        gname: 'Selvam K',
        guardian_phone: '9988776655',
        full_address: '45 Anna Nagar, Pollachi',
      },
    });
  });

  mockApp.get('/api/auth/allUsers', (_req, res) => {
    res.json({
      total: 6,
      users: [
        { username: 'ravi_owner', role: 'owner', phone_no: '9000011111' },
        { username: 'priya_admin', role: 'admin', phone_no: '9000022222' },
        { username: 'kumar_staff', role: 'staff', phone_no: '9000033333' },
        { username: 'senthil_staff', role: 'staff', phone_no: '9000044444' },
        { username: 'arun_agent', role: 'agent', phone_no: '9000055555' },
        { username: 'bala_agent', role: 'agent', phone_no: '9000066666' },
      ],
    });
  });

  mockApp.get('/api/agents/login-report', (req, res) => {
    res.json({
      dateFrom: req.query.dateFrom || '2026-11-15',
      dateTo: req.query.dateTo || '2026-11-15',
      totalLoggedInUsers: 4,
      rows: [
        { username: 'priya_admin', role: 'admin', loginCount: 2 },
        { username: 'kumar_staff', role: 'staff', loginCount: 1 },
        { username: 'arun_agent', role: 'agent', loginCount: 3 },
        { username: 'bala_agent', role: 'agent', loginCount: 1 },
      ],
    });
  });

  setExpressAppForTest(mockApp);
  setReadOnlyRunnerForTest(async () => ({
    rowCount: 1,
    rows: [
      {
        customer_id: 'cust-105',
        hplno: 105,
        cname: 'Murugan S',
        loan_status: 'active',
        full_address: '12 Gandhi Road, RS Puram, Coimbatore - 641002',
        customer_phones_csv: '9876543210',
        vehicle_number: 'TN37CD9999',
        brand: 'TVS',
        model_name: 'Jupiter',
        hp_amount: 50000,
        due_month: 10,
        due_amount: 5500,
        total_paid: 11000,
        payment_count: 2,
        match_rank: 1,
      },
    ],
  }));

  try {
    const ownerScope = makeAuthedScope('owner', TENANT_A);

    // Scenario A: 2-round chain (`search_customer_loan_status` -> `call_backend_get_api('/api/customers/105')`)
    let chainPass = 0;
    setGeminiStreamImplForTest(async () => {
      chainPass += 1;
      if (chainPass === 1) {
        return (async function* () {
          yield {
            functionCalls: [{ id: 'c1', name: 'search_customer_loan_status', args: { hplno: 105 } }],
          };
        })();
      }
      if (chainPass === 2) {
        // Intermediate chatter + chained GET call for guardian name & full profile
        return (async function* () {
          yield { text: 'Let me also fetch guardian details...' };
          yield {
            functionCalls: [
              { id: 'c2', name: 'call_backend_get_api', args: { endpoint: '/api/customers/105' } },
            ],
          };
        })();
      }
      return (async function* () {
        yield {
          text: 'HP நம்பர் 105 முருகன் S (TVS Jupiter TN 37 CD 9999) அவர்களின் முகவரி: 12 காந்தி ரோடு, ஆர்.எஸ். புரம், கோயம்புத்தூர் - 641002. போன் நம்பர் 9876543210, கார்டியன் செல்வம் K போன் நம்பர் 9988776655.',
        };
      })();
    });

    const streamedCustomerDeltas = [];
    const turnA = await runAssistantTurn({
      scope: ownerScope,
      userText: 'HP நம்பர் 105 கஸ்டமரோட அட்ரஸ், போன் நம்பர், கார்டியன் பெயர் போன் நம்பர் சொல்லு',
      onTextDelta: (d) => streamedCustomerDeltas.push(d),
    });

    assert.equal(chainPass, 3);
    assert.deepEqual(
      turnA.toolsUsed.map((t) => t.toolName),
      ['search_customer_loan_status', 'call_backend_get_api']
    );
    assert.ok(
      !streamedCustomerDeltas.join('').includes('Let me also fetch guardian details'),
      'Intermediate chained-round chatter must NEVER leak to UI or TTS!'
    );
    assert.ok(turnA.responseText.includes('9876543210'));
    assert.ok(turnA.responseText.includes('9988776655'));

    // Scenario B: Parallel staff count + today's logged-in staff (`GET /api/auth/allUsers` + `GET /api/agents/login-report`)
    let staffPass = 0;
    setGeminiStreamImplForTest(async (payload) => {
      staffPass += 1;
      if (staffPass === 1) {
        return (async function* () {
          yield {
            functionCalls: [
              { id: 's1', name: 'call_backend_get_api', args: { endpoint: '/api/auth/allUsers' } },
              {
                id: 's2',
                name: 'call_backend_get_api',
                args: {
                  endpoint: '/api/agents/login-report',
                  queryParams: { dateFrom: '2026-11-15', dateTo: '2026-11-15' },
                },
              },
            ],
          };
        })();
      }
      // Verify both functionResponses arrived in Pass 2 contents
      const lastUserTurn = payload.contents[payload.contents.length - 1];
      assert.equal(lastUserTurn.parts.length, 2);
      const totalUsers = lastUserTurn.parts[0].functionResponse.response.result.data.total;
      const loggedInToday =
        lastUserTurn.parts[1].functionResponse.response.result.data.totalLoggedInUsers;

      return (async function* () {
        yield {
          text: `நம்ம கம்பெனில மொத்தம் ${totalUsers} ஸ்டாஃப் இருக்காங்க, அதுல இன்னைக்கு ${loggedInToday} பேர் லாகின் பண்ணிருக்காங்க.`,
        };
      })();
    });

    const turnB = await runAssistantTurn({
      scope: ownerScope,
      userText: 'நம்ம கம்பெனில மொத்தம் எவ்ளோ ஸ்டாஃப் இருக்காங்க, இன்னைக்கு எத்தனை பேர் லாகின் பண்ணிருக்காங்க?',
    });

    assert.equal(staffPass, 2);
    assert.equal(turnB.toolsUsed.length, 2);
    assert.ok(turnB.responseText.includes('6 ஸ்டாஃப்'));
    assert.ok(turnB.responseText.includes('4 பேர் லாகின்'));
  } finally {
    setGeminiStreamImplForTest(null);
    setReadOnlyRunnerForTest(null);
    setExpressAppForTest(null);
    await closeInternalLoopbackServer();
  }
});

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-customer-search-scoping';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const dbConfig = require('../../config/database.config');
const customerRoutes = require('./customer.routes');

const FINANCE_A = '11111111-1111-4111-8111-111111111111';
const FINANCE_B = '22222222-2222-4222-8222-222222222222';
const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUST_A = 'c0000001-0000-4000-8000-000000000001';
const CUST_B = 'c0000002-0000-4000-8000-000000000002';

function sendGetRequest(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: 'GET',
        headers,
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
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('GET /api/customers/search requires auth and scopes queries strictly to req.financeId', async () => {
  const origQuery = dbConfig.db.query;
  const capturedMainQueries = [];

  dbConfig.db.query = async (sql, params = []) => {
    const text = String(sql);
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
    if (text.includes('FROM customers c') && text.includes('AS contact_numbers')) {
      capturedMainQueries.push({ text, params });
      const hasTenantFilter = /c\.finance_id\s*=/.test(text);
      const financeParam = hasTenantFilter ? params[params.length - 1] : null;
      const requestedPhone = params[7]; // $8 mobileExact

      const dbRows = [
        {
          id: CUST_B,
          finance_id: FINANCE_B,
          hplno: 202,
          cname: 'Other Tenant Customer',
          cfname_value: 'Raman',
          cfname_unit: 'S/O',
          mobile: '9999988888',
        },
        {
          id: CUST_A,
          finance_id: FINANCE_A,
          hplno: 101,
          cname: 'Tenant A Customer',
          cfname_value: 'Kannan',
          cfname_unit: 'S/O',
          mobile: '9876543210',
        },
      ];

      const matched = dbRows.filter((row) => {
        if (hasTenantFilter && row.finance_id !== financeParam) return false;
        return row.mobile === requestedPhone;
      });
      return { rows: matched };
    }
    return { rows: [] };
  };

  const app = express();
  app.use('/api/customers', customerRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Unauthenticated request MUST be rejected with 401
    const unauthRes = await sendGetRequest(server, '/api/customers/search?mobile=9999988888');
    assert.equal(unauthRes.status, 401, 'Unauthenticated /customers/search must return 401');

    // 2. Authenticated as FINANCE_A searching FINANCE_B customer phone -> must NOT leak FINANCE_B
    const ownerToken = jwt.sign(
      { owner: { id: OWNER_A, username: 'owner_test' }, current_finance_id: FINANCE_A },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const authHeaders = {
      Authorization: `Bearer ${ownerToken}`,
      'finance-id': FINANCE_A,
    };

    const crossTenantRes = await sendGetRequest(
      server,
      '/api/customers/search?mobile=9999988888',
      authHeaders
    );
    assert.equal(crossTenantRes.status, 200);
    assert.equal(crossTenantRes.body.found, false, 'Must not return FINANCE_B customer to FINANCE_A');
    assert.equal(capturedMainQueries.length, 1);
    assert.equal(capturedMainQueries[0].params.includes(FINANCE_A), true);
    assert.equal(capturedMainQueries[0].text.includes('?'), false);

    // 3. Authenticated as FINANCE_A searching own customer phone -> returns found: true
    const sameTenantRes = await sendGetRequest(
      server,
      '/api/customers/search?mobile=9876543210',
      authHeaders
    );
    assert.equal(sameTenantRes.status, 200);
    assert.equal(sameTenantRes.body.found, true);
    assert.equal(sameTenantRes.body.customer.id, CUST_A);
  } finally {
    dbConfig.db.query = origQuery;
    await new Promise((resolve) => server.close(resolve));
  }
});

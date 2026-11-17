'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-payment-routes';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const dbConfig = require('../../../config/database.config');
const customerRoutes = require('../../customers/customer.routes');
const paymentRoutes = require('./payment.routes');

const FINANCE_A = '11111111-1111-4111-8111-111111111111';
const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUST_A = 'c0000001-0000-4000-8000-000000000001';
const PAY_A = 'd0000001-0000-4000-8000-000000000001';

function requestJson(server, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body !== null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // keep raw string
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function makeAuthHeaders() {
  const ownerToken = jwt.sign(
    { owner: { id: OWNER_A, username: 'owner_test' }, current_finance_id: FINANCE_A },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    Authorization: `Bearer ${ownerToken}`,
    'finance-id': FINANCE_A,
  };
}

test('POST /api/customers/:customerId/payments & /api/payments/customers/:customerId/payments delegate to fn_process_customer_payment and map SQLSTATE 23514 -> 400', async () => {
  const origQuery = dbConfig.db.query;
  const origConnect = dbConfig.db.connect;
  const capturedFnCalls = [];
  let simulateInvalidSplit = false;

  dbConfig.db.query = async (sql) => {
    const text = String(sql);
    if (text.includes('FROM owner')) {
      return { rows: [{ id: OWNER_A, username: 'owner_test', password: 'pw', is_active: 1 }] };
    }
    if (text.includes('FROM finance_detail')) {
      return { rows: [{ id: FINANCE_A, owner_id: OWNER_A, is_active: 1 }] };
    }
    return { rows: [] };
  };

  dbConfig.db.connect = async () => ({
    async query(sql, params = []) {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [] };
      }
      if (text.includes('FROM customers')) {
        return { rows: [{ id: CUST_A, hplno: 101 }] };
      }
      if (text.includes('fn_process_customer_payment')) {
        capturedFnCalls.push({ text, params });
        if (simulateInvalidSplit) {
          const err = new Error('Principal (5000.00) + Interest (2000.00) must equal Total Amount (6000.00)');
          err.code = '23514';
          throw err;
        }
        return {
          rows: [{
            result: {
              total_received: params[3],
              total_principal_allocated: params[4] ?? 5000,
              total_interest_allocated: params[5] ?? 1000,
              single_due_override_applied: params[4] !== null,
              old_due_cleared: 0,
              current_paid: params[3],
              payment_id: PAY_A,
              advance_split: 0,
              advance_ids: [],
            },
          }],
        };
      }
      throw new Error(`Unexpected SQL in POST payment route: ${text}`);
    },
    release() {},
  });

  const app = express();
  app.use(express.json());
  app.use('/api/customers', customerRoutes);
  app.use('/api/payments', paymentRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const headers = makeAuthHeaders();

    // 1. Customer route POST with explicit single-due P/I override (and owner principal -> collected_by_id = null)
    const okCust = await requestJson(
      server,
      'POST',
      '/api/customers/101/payments',
      {
        dueDate: '2026-11-10',
        paymentDate: '2026-11-17',
        billNumber: 'B-500',
        amount: 6000,
        principal_amount: 4800,
        interest_amount: 1200,
        dueAmount: 6000,
        penalty: 0,
        collected_by: 'owner_test',
        payment_mode: 'cash',
      },
      headers
    );
    assert.equal(okCust.status, 200);
    assert.equal(okCust.body.success, true);
    assert.equal(okCust.body.data.total_principal_allocated, 4800);
    assert.equal(okCust.body.data.total_interest_allocated, 1200);
    assert.equal(capturedFnCalls.length, 1);
    assert.equal(capturedFnCalls[0].params[1], CUST_A);
    assert.equal(capturedFnCalls[0].params[11], null, 'License owner principal must pass null collected_by_id');

    // 2. Payment route POST delegates to fn_process_customer_payment as well
    const okPay = await requestJson(
      server,
      'POST',
      `/api/payments/customers/${CUST_A}/payments`,
      {
        dueDate: '2026-11-10',
        paymentDate: '2026-11-17',
        billNumber: 'B-501',
        amount: 6000,
        dueAmount: 6000,
        collected_by: 'owner_test',
        payment_mode: 'upi',
      },
      headers
    );
    assert.equal(okPay.status, 200);
    assert.equal(okPay.body.success, true);
    assert.equal(capturedFnCalls.length, 2);

    // 3. SQLSTATE 23514 maps to HTTP 400
    simulateInvalidSplit = true;
    const badSplit = await requestJson(
      server,
      'POST',
      `/api/customers/${CUST_A}/payments`,
      {
        dueDate: '2026-11-10',
        paymentDate: '2026-11-17',
        amount: 6000,
        principal_amount: 5000,
        interest_amount: 2000,
      },
      headers
    );
    assert.equal(badSplit.status, 400);
    assert.equal(badSplit.body.success, false);
  } finally {
    dbConfig.db.query = origQuery;
    dbConfig.db.connect = origConnect;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('PUT /api/payments/:id updates explicit principal_amount & interest_amount and GET /api/payments/bill-report uses stored P/I + active sub_due sums', async () => {
  const origQuery = dbConfig.db.query;
  const origConnect = dbConfig.db.connect;
  const capturedUpdates = [];

  dbConfig.db.query = async (sql) => {
    const text = String(sql);
    if (text.includes('FROM owner')) {
      return { rows: [{ id: OWNER_A, username: 'owner_test', password: 'pw', is_active: 1 }] };
    }
    if (text.includes('FROM finance_detail')) {
      return { rows: [{ id: FINANCE_A, owner_id: OWNER_A, is_active: 1 }] };
    }
    if (text.includes('FROM payments p') && text.includes('formatted_created_time')) {
      return {
        rows: [
          {
            id: PAY_A,
            bill_number: 'B-777',
            amount: '2000.00',
            principal_amount: '1000.00',
            interest_amount: '1000.00',
            sub_paid_amount: '4000.00',
            sub_principal_amount: '4000.00',
            sub_interest_amount: '0.00',
            penalty: '150.00',
            payment_due_status: 'paid',
            payment_status: 'active',
            payment_mode: 'upi',
            collected_by: 'owner_test',
            edited_by: null,
            cancelled_by: null,
            formatted_date: '2026-11-17',
            formatted_created_time: '10:00:00 AM',
            formatted_edited_time: null,
            cname: 'Test Customer',
            hplno: 101,
          },
        ],
      };
    }
    return { rows: [] };
  };

  dbConfig.db.connect = async () => ({
    async query(sql, params = []) {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT id FROM payments')) {
        return { rows: [{ id: PAY_A }] };
      }
      if (text.includes('UPDATE payments SET')) {
        capturedUpdates.push({ text, params });
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('INSERT INTO recent_activity')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    },
    release() {},
  });

  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const headers = makeAuthHeaders();

    // 1. PUT with explicit principal_amount & interest_amount
    const putExplicit = await requestJson(
      server,
      'PUT',
      `/api/payments/${PAY_A}`,
      {
        dueDate: '2026-11-10',
        paymentDate: '2026-11-17',
        billNumber: 'B-777',
        amount: 6000,
        principal_amount: 4750,
        interest_amount: 1250,
        penalty: 150,
        collected_by: 'owner_test',
        payment_mode: 'upi',
      },
      headers
    );
    assert.equal(putExplicit.status, 200);
    assert.equal(capturedUpdates.length, 1);
    assert.match(capturedUpdates[0].text, /principal_amount\s*=\s*\$5/);
    assert.equal(capturedUpdates[0].params[4], 4750);
    assert.equal(capturedUpdates[0].params[5], 1250);

    // 2. GET /api/payments/bill-report uses stored P/I + active sub_due sums
    const billRes = await requestJson(server, 'GET', '/api/payments/bill-report', null, headers);
    assert.equal(billRes.status, 200);
    assert.equal(billRes.body.success, true);
    assert.equal(billRes.body.data.length, 1);
    assert.equal(billRes.body.data[0].principal, 5000);
    assert.equal(billRes.body.data[0].interest, 1000);
    assert.equal(billRes.body.data[0].penalty, 150);
    assert.equal(billRes.body.data[0].total, 6150);
  } finally {
    dbConfig.db.query = origQuery;
    dbConfig.db.connect = origConnect;
    await new Promise((resolve) => server.close(resolve));
  }
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const voiceRecordingS3 = require('../voiceRecording.s3');

function listenServer(expressApp) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(expressApp);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        port: addr.port,
        baseUrl: `http://127.0.0.1:${addr.port}`,
      });
    });
    server.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

test('Phase 1.1 (CORS): createCorsMiddleware allows configured origins + Idempotency-Key and blocks invalid/wildcard origins', async () => {
  const { createCorsMiddleware, resolveAllowedCorsOrigins } = require('../../../../config/cors.config');

  // 1. Wildcard '*' in env must never be added to credentialed allowlist
  const prodOrigins = resolveAllowedCorsOrigins({
    NODE_ENV: 'production',
    CORS_ORIGIN: '*, https://autofinex-desktop.rimio.in/',
    FRONTEND_URL: 'https://app.rimio.in',
  });
  assert.equal(prodOrigins.has('*'), false, 'Wildcard * must never be allowed with credentials');
  assert.equal(prodOrigins.has('https://autofinex-desktop.rimio.in'), true);
  assert.equal(prodOrigins.has('https://app.rimio.in'), true);
  assert.equal(
    prodOrigins.has('http://localhost:3003'),
    false,
    'Localhost dev port must not be implicitly added in production when unlisted'
  );

  const probeApp = express();
  probeApp.use(
    createCorsMiddleware({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://autofinex-desktop.rimio.in,http://localhost:3003',
      FRONTEND_URL: 'https://autofinex-desktop.rimio.in',
    })
  );
  probeApp.use(express.json());
  probeApp.post('/api/ai/calls/manual', (_req, res) => {
    res.setHeader('Idempotency-Replay', 'false');
    res.status(202).json({ success: true, accepted: true });
  });
  probeApp.get('/internal/ping', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const { server, baseUrl, port } = await listenServer(probeApp);
  try {
    // A. Valid dev origin preflight with Idempotency-Key + Authorization + finance-id
    const preflightValid = await fetch(`${baseUrl}/api/ai/calls/manual`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3003',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers':
          'authorization,content-type,finance-id,idempotency-key,owner-authorization',
      },
    });
    assert.equal(preflightValid.status, 204);
    assert.equal(preflightValid.headers.get('access-control-allow-origin'), 'http://localhost:3003');
    assert.equal(preflightValid.headers.get('access-control-allow-credentials'), 'true');
    const allowHeaders = (preflightValid.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert.ok(
      allowHeaders.includes('idempotency-key'),
      `Expected Idempotency-Key in Access-Control-Allow-Headers, got: ${allowHeaders}`
    );
    assert.ok(allowHeaders.includes('authorization'));
    assert.ok(allowHeaders.includes('finance-id'));
    assert.ok((preflightValid.headers.get('vary') || '').toLowerCase().includes('origin'));

    // B. Valid production origin actual POST exposes Idempotency-Replay header
    const postProd = await fetch(`${baseUrl}/api/ai/calls/manual`, {
      method: 'POST',
      headers: {
        Origin: 'https://autofinex-desktop.rimio.in',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'manual-call:1234567890',
      },
      body: JSON.stringify({ customerId: '00000000-0000-0000-0000-000000000001' }),
    });
    assert.equal(postProd.status, 202);
    assert.equal(
      postProd.headers.get('access-control-allow-origin'),
      'https://autofinex-desktop.rimio.in'
    );
    const exposeHeaders = (postProd.headers.get('access-control-expose-headers') || '').toLowerCase();
    assert.ok(exposeHeaders.includes('idempotency-replay'));
    assert.ok(exposeHeaders.includes('retry-after'));

    // C. Invalid origin preflight must be rejected with 403 and zero ACAO header
    const preflightEvil = await fetch(`${baseUrl}/api/ai/calls/manual`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,idempotency-key',
      },
    });
    assert.equal(preflightEvil.status, 403);
    assert.equal(preflightEvil.headers.get('access-control-allow-origin'), null);
    assert.equal(preflightEvil.headers.get('access-control-allow-credentials'), null);

    // D. Invalid origin direct POST (no-preflight CSRF attempt) must also be rejected with 403
    const postEvil = await fetch(`${baseUrl}/api/ai/calls/manual`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerId: '00000000-0000-0000-0000-000000000001' }),
    });
    assert.equal(postEvil.status, 403);
    assert.equal(postEvil.headers.get('access-control-allow-origin'), null);

    // E. Server-to-server request without Origin header passes through cleanly
    const s2s = await fetch(`${baseUrl}/internal/ping`);
    assert.equal(s2s.status, 200);
    assert.equal(s2s.headers.get('access-control-allow-origin'), null);

    // F. Same-origin browser POST (Origin host matches Host header) passes through cleanly
    const sameOriginPost = await fetch(`${baseUrl}/api/ai/calls/manual`, {
      method: 'POST',
      headers: {
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerId: '00000000-0000-0000-0000-000000000001' }),
    });
    assert.equal(sameOriginPost.status, 202);
  } finally {
    await closeServer(server);
  }
});

test('Phase 1.2 (Mounted Express App): src/app.js OPTIONS /api/ai/calls/manual allows Idempotency-Key and rejects untrusted Origin', async () => {
  const { app } = require('../../../../app');
  const { server, baseUrl } = await listenServer(app);
  try {
    const okPreflight = await fetch(`${baseUrl}/api/ai/calls/manual`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3003',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,finance-id,idempotency-key',
      },
    });
    assert.equal(okPreflight.status, 204);
    const allowHeaders = (okPreflight.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert.ok(
      allowHeaders.includes('idempotency-key'),
      `Mounted app must allow Idempotency-Key, got: ${allowHeaders}`
    );

    const blockedPreflight = await fetch(`${baseUrl}/api/ai/calls/manual`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://untrusted-attacker.invalid',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key',
      },
    });
    assert.equal(blockedPreflight.status, 403);
    assert.equal(blockedPreflight.headers.get('access-control-allow-origin'), null);
  } finally {
    await closeServer(server);
  }
});

test('Phase 1.3 (Private S3 KYC Presigning): presignCustomerPhoto signs same-bucket full S3 URLs and blocks foreign/recording/traversal keys', async () => {
  const signedCalls = [];
  const fakePresignFn = async (key, expiresIn) => {
    signedCalls.push({ key, expiresIn });
    return `https://test-kyc-bucket.s3.ap-southeast-2.amazonaws.com/${encodeURI(key)}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=deadbeef`;
  };

  // 1. Virtual-hosted full S3 HTTPS URL stored by uploadToS3 in kyc_documents.file_path
  const rawVirtualUrl =
    'https://test-kyc-bucket.s3.ap-southeast-2.amazonaws.com/customers/1792425187560-878839104.jpg';
  const signedVirtual = await voiceRecordingS3.presignCustomerPhoto(rawVirtualUrl, 900, {
    bucketName: 'test-kyc-bucket',
    presignFn: fakePresignFn,
  });
  assert.ok(
    signedVirtual && signedVirtual.includes('X-Amz-Signature=deadbeef'),
    `Expected presigned URL for virtual-hosted S3 URL, got: ${signedVirtual}`
  );
  assert.notEqual(signedVirtual, rawVirtualUrl, 'Must not return raw unsigned private S3 URL');
  assert.deepEqual(signedCalls[0], {
    key: 'customers/1792425187560-878839104.jpg',
    expiresIn: 900,
  });

  // 2. Path-style S3 HTTPS URL with URL-encoded filename
  const rawPathStyle =
    'https://s3.ap-southeast-2.amazonaws.com/test-kyc-bucket/vehicles/vehicle%20photo.jpg';
  const signedPathStyle = await voiceRecordingS3.presignCustomerPhoto(rawPathStyle, 900, {
    bucketName: 'test-kyc-bucket',
    presignFn: fakePresignFn,
  });
  assert.ok(signedPathStyle && signedPathStyle.includes('X-Amz-Signature=deadbeef'));
  assert.deepEqual(signedCalls[1], {
    key: 'vehicles/vehicle photo.jpg',
    expiresIn: 900,
  });

  // 3. Relative S3 object key still works with 900s default TTL
  const signedRelative = await voiceRecordingS3.presignCustomerPhoto(
    'customers/999-avatar.jpg',
    undefined,
    {
      bucketName: 'test-kyc-bucket',
      presignFn: fakePresignFn,
    }
  );
  assert.ok(signedRelative && signedRelative.includes('X-Amz-Signature=deadbeef'));
  assert.equal(signedCalls[2].key, 'customers/999-avatar.jpg');
  assert.equal(signedCalls[2].expiresIn, 900);

  // 4. Foreign bucket S3 URL must be rejected (null), never signed or passed raw
  const foreignBucket = await voiceRecordingS3.presignCustomerPhoto(
    'https://other-company-bucket.s3.ap-southeast-2.amazonaws.com/customers/1792425187560-878839104.jpg',
    900,
    { bucketName: 'test-kyc-bucket', presignFn: fakePresignFn }
  );
  assert.equal(foreignBucket, null);

  // 5. Non-S3 arbitrary HTTP URL must be rejected (null)
  const arbitraryHttp = await voiceRecordingS3.presignCustomerPhoto('http://example.com/test.jpg', 900, {
    bucketName: 'test-kyc-bucket',
    presignFn: fakePresignFn,
  });
  assert.equal(arbitraryHttp, null);

  // 6. Encoded path traversal must be rejected (null)
  const traversal = await voiceRecordingS3.presignCustomerPhoto(
    'https://test-kyc-bucket.s3.ap-southeast-2.amazonaws.com/customers/%2e%2e/secret.txt',
    900,
    { bucketName: 'test-kyc-bucket', presignFn: fakePresignFn }
  );
  assert.equal(traversal, null);

  // 7. voice-recordings/* prefix must NEVER be signable through presignCustomerPhoto
  const recordingRelative = await voiceRecordingS3.presignCustomerPhoto(
    'voice-recordings/11111111-1111-1111-1111-111111111111/2026/11/12/22222222-2222-2222-2222-222222222222/call.wav',
    900,
    { bucketName: 'test-kyc-bucket', presignFn: fakePresignFn }
  );
  assert.equal(recordingRelative, null);

  const recordingFullUrl = await voiceRecordingS3.presignCustomerPhoto(
    'https://test-kyc-bucket.s3.ap-southeast-2.amazonaws.com/voice-recordings/11111111-1111-1111-1111-111111111111/2026/11/12/22222222-2222-2222-2222-222222222222/call.wav',
    900,
    { bucketName: 'test-kyc-bucket', presignFn: fakePresignFn }
  );
  assert.equal(recordingFullUrl, null);

  // 8. getTelecallingLeads requests 900s (15m) short-lived TTL when presigning customer KYC photos
  const aiService = require('../ai.service');
  const observedLeadTtls = [];
  await aiService.getTelecallingLeads(
    '11111111-1111-4111-8111-111111111111',
    { page: 1, limit: 5 },
    {
      asOfDate: '2026-11-12',
      queryRunner: {
        async query(sql) {
          if (sql.includes('MAX(refreshed_at)')) {
            return { rows: [{ last_refreshed_at: '2026-11-12T04:00:00.000Z' }] };
          }
          if (sql.includes('FROM loans l')) {
            return {
              rows: [
                {
                  loan_id: '20000000-0000-4000-8000-000000000001',
                  customer_id: '10000000-0000-4000-8000-000000000001',
                  finance_id: '11111111-1111-4111-8111-111111111111',
                  cname: 'Test Customer',
                  hplno: 101,
                  loan_status: 'active',
                  hpamount: 50000,
                  hpdate: '2026-01-01',
                  due_month: 12,
                  dueamount: 5000,
                  penaltyamount: 0,
                  principle_part: 4000,
                  interest_part: 1000,
                  Preference: 'bike',
                  veh_type: 'Two Wheeler',
                  veh_model: '2025',
                  vehicle_number: 'TN01AB1234',
                  vehicle_name: 'Honda Activa',
                  phone_raw: '9876543210',
                  photo_s3_key:
                    'https://test-kyc-bucket.s3.ap-southeast-2.amazonaws.com/customers/1792425187560-878839104.jpg',
                  overdue_amount: 5000,
                  pending_due_count: 1,
                  earliest_unpaid_due_date: '2026-10-12',
                  days_overdue: 31,
                  total_remaining_balance: 45000,
                  total_scheduled_amount: 60000,
                  total_paid_due: 15000,
                  total_paid_penalty: 0,
                  paid_installments: 3,
                  total_installments: 12,
                  lead_id: '30000000-0000-4000-8000-000000000001',
                  lead_call_status: 'pending',
                  attempt_count: 0,
                  daily_attempt_count: 0,
                  daily_attempt_date: null,
                  last_call_at: null,
                  next_call_at: null,
                  call_outcome_note: null,
                  suppressed: false,
                  suppression_reason: null,
                },
              ],
            };
          }
          return { rows: [] };
        },
      },
      presignPhotoFn: async (key, ttl) => {
        observedLeadTtls.push({ key, ttl });
        return `https://s3.signed.local/photo?X-Amz-Expires=${ttl}`;
      },
    }
  );
  assert.equal(observedLeadTtls.length, 1);
  assert.equal(observedLeadTtls[0].ttl, 900, 'getTelecallingLeads must request 900s presign TTL');
});


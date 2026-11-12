'use strict';

/**
 * Environment-driven CORS Allowlist & Preflight Configuration (`cors.config.js`).
 *
 * Security Invariants:
 * 1. Never emits wildcard `Access-Control-Allow-Origin: *` or blind `origin: true`
 *    reflection on credentialed endpoints.
 * 2. Explicitly allows `Idempotency-Key` alongside existing AutoFinex auth headers
 *    and exposes `Idempotency-Replay` + `Retry-After` to browser clients.
 * 3. Rejects cross-origin preflight and browser requests from unlisted origins
 *    with `403 Forbidden` (`cors_origin_denied`) while allowing server-to-server
 *    requests (no `Origin` header) and same-host requests.
 */

const cors = require('cors');

const ALLOWED_METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

const ALLOWED_HEADERS = Object.freeze([
  'Content-Type',
  'Authorization',
  'Accept',
  'Idempotency-Key',
  'finance-authorization',
  'owner-authorization',
  'finance-id',
]);

const EXPOSED_HEADERS = Object.freeze(['Idempotency-Replay', 'Retry-After']);

const TAURI_ORIGINS = Object.freeze([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
]);

const DEV_LOCALHOST_ORIGINS = Object.freeze([
  'http://localhost:3003',
  'http://127.0.0.1:3003',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3004',
  'http://127.0.0.1:3004',
]);

function normalizeOrigin(rawOrigin) {
  const trimmed = String(rawOrigin || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '*' || trimmed.toLowerCase() === 'null') {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (!['http:', 'https:', 'tauri:'].includes(protocol) || !parsed.host) {
      return null;
    }
    return `${protocol}//${parsed.host.toLowerCase()}`;
  } catch (_err) {
    return null;
  }
}

function resolveAllowedCorsOrigins(env = process.env) {
  const origins = new Set(TAURI_ORIGINS);
  const rawSources = [
    env.CORS_ALLOWED_ORIGINS,
    env.CORS_ORIGIN,
    env.FRONTEND_URL,
    env.API_BASE_URL,
  ];

  for (const source of rawSources) {
    if (!source) continue;
    for (const entry of String(source).split(',')) {
      const normalized = normalizeOrigin(entry);
      if (normalized) {
        origins.add(normalized);
      }
    }
  }

  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
  if (nodeEnv !== 'production') {
    for (const devOrigin of DEV_LOCALHOST_ORIGINS) {
      origins.add(devOrigin);
    }
  }

  return origins;
}

function isSameHostOrigin(normalizedOrigin, req) {
  const reqHost = String(req.headers.host || '').trim().toLowerCase();
  if (!reqHost || !normalizedOrigin) return false;
  try {
    const parsed = new URL(normalizedOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return parsed.host.toLowerCase() === reqHost;
  } catch (_err) {
    return false;
  }
}

function createCorsMiddleware(env = process.env) {
  const allowedOrigins = resolveAllowedCorsOrigins(env);

  return function autofinexCorsMiddleware(req, res, next) {
    res.vary('Origin');

    const rawOrigin = req.headers.origin;
    if (!rawOrigin) {
      return next();
    }

    const normalizedOrigin = normalizeOrigin(rawOrigin);
    if (
      normalizedOrigin &&
      (allowedOrigins.has(normalizedOrigin) || isSameHostOrigin(normalizedOrigin, req))
    ) {
      const delegate = cors({
        origin: normalizedOrigin,
        credentials: true,
        methods: ALLOWED_METHODS,
        allowedHeaders: ALLOWED_HEADERS,
        exposedHeaders: EXPOSED_HEADERS,
        maxAge: 600,
        optionsSuccessStatus: 204,
      });
      return delegate(req, res, next);
    }

    return res.status(403).json({
      success: false,
      code: 'cors_origin_denied',
      error: 'Origin is not allowed by CORS policy',
    });
  };
}

module.exports = {
  ALLOWED_METHODS,
  ALLOWED_HEADERS,
  EXPOSED_HEADERS,
  normalizeOrigin,
  resolveAllowedCorsOrigins,
  createCorsMiddleware,
};

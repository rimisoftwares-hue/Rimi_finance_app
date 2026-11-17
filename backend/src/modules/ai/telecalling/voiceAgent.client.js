'use strict';

/**
 * Composite Voice AI Health Client, Telephony Safety Gatekeeper & HMAC-SHA256 Signer.
 *
 * Implements:
 * - Decision #4: `GET /api/ai/voice-health` requires BOTH Dograh gateway AND Python Voice Agent
 *   deep health (`db_read_only_ok` + `redis_ok`) before returning `status: "ready"`.
 * - Phase 2 Telephony Mode Plumbing & Amendment A5:
 *   - Server-only `VOICE_TELEPHONY_MODE` (`mock` | `live_allowlist` | `live`), default `mock`.
 *   - Unset -> `mock`; invalid value -> fails closed (`503 invalid_telephony_mode`, never `live`).
 *   - `VOICE_AI_KILL_SWITCH` halts all dispatches immediately (`503 voice_ai_kill_switch_active`).
 *   - `live` mode additionally requires `VOICE_LIVE_CALLS_CONFIRMED=true`.
 *   - `live_allowlist` mode enforces `TEST_ALLOWED_NUMBERS` in Node before DB/Python dispatch.
 * - Amendment A1: Classifies safe pre-dial connect errors vs ambiguous read timeouts.
 */

const crypto = require('crypto');

const DEFAULT_GATEWAY_HEALTH_URL = 'https://voice.rimio.in/api/v1/health';
const DEFAULT_VOICE_AGENT_BASE_URL = 'http://127.0.0.1:8100';
const DEFAULT_HEALTH_TIMEOUT_MS = 3000;
const DEFAULT_HEALTH_CACHE_TTL_MS = 15000;
const DEFAULT_HMAC_REPLAY_WINDOW_SEC = 300;

const VALID_TELEPHONY_MODES = new Set(['mock', 'live_allowlist', 'live']);

const CONNECT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'ERR_INVALID_URL',
]);

const AMBIGUOUS_TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const PRE_DIAL_HTTP_STATUSES = new Set([400, 401, 403, 404, 409, 422, 503]);

let cachedHealthResult = null;
let cachedHealthExpiresAt = 0;

function createSafetyError(statusCode, code, message, details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function maskPhoneSafe(rawPhone) {
  const cleaned = String(rawPhone || '').replace(/[\s-]/g, '');
  if (!cleaned) return '—';
  if (cleaned.startsWith('+91') && cleaned.length >= 13) {
    return `+91 ******${cleaned.slice(-4)}`;
  }
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `******${digits.slice(-4)}`;
  }
  return '—';
}

function normalizeE164Phone(rawPhone) {
  const cleaned = String(rawPhone || '').replace(/[\s()-]/g, '');
  if (!cleaned) return '';
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

/**
 * Resolves server-only `VOICE_TELEPHONY_MODE`.
 * - Unset / whitespace -> `'mock'`
 * - `'mock' | 'live_allowlist' | 'live'` -> valid
 * - Anything else -> throws `503 invalid_telephony_mode` (fail-closed, never `live`).
 */
function resolveVoiceTelephonyMode(env = process.env) {
  const raw = env?.VOICE_TELEPHONY_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 'mock';
  }
  const norm = String(raw).trim().toLowerCase();
  if (!VALID_TELEPHONY_MODES.has(norm)) {
    throw createSafetyError(
      503,
      'invalid_telephony_mode',
      'Server VOICE_TELEPHONY_MODE is invalid; failing closed and refusing Voice AI dispatch'
    );
  }
  return norm;
}

function isVoiceKillSwitchActive(env = process.env) {
  const raw = String(env?.VOICE_AI_KILL_SWITCH || '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function parseTestAllowedNumbers(env = process.env) {
  const raw = String(env?.TEST_ALLOWED_NUMBERS || '').trim();
  if (!raw) return new Set();
  const out = new Set();
  for (const part of raw.split(',')) {
    const norm = normalizeE164Phone(part);
    if (norm) out.add(norm);
  }
  return out;
}

/**
 * Enforces server-level kill switch, telephony mode validity, and live confirmation gate (Amendment A5).
 */
function assertServerTelephonySafetyGates(env = process.env) {
  if (isVoiceKillSwitchActive(env)) {
    throw createSafetyError(
      503,
      'voice_ai_kill_switch_active',
      'Voice AI kill switch is active — all outbound call dispatches are halted'
    );
  }

  const mode = resolveVoiceTelephonyMode(env);

  if (mode === 'live') {
    const confirmed =
      String(env?.VOICE_LIVE_CALLS_CONFIRMED || '')
        .trim()
        .toLowerCase() === 'true';
    if (!confirmed) {
      throw createSafetyError(
        503,
        'live_calls_not_confirmed',
        'VOICE_TELEPHONY_MODE=live requires explicit VOICE_LIVE_CALLS_CONFIRMED=true'
      );
    }
  }

  return mode;
}

/**
 * Enforces `TEST_ALLOWED_NUMBERS` in Node when `mode === 'live_allowlist'` (Amendment A5).
 * Never logs or exposes the unmasked customer phone number.
 */
function assertDestinationAllowlistedIfRequired(mode, phoneE164, env = process.env) {
  if (mode !== 'live_allowlist') return;

  const allowSet = parseTestAllowedNumbers(env);
  const normalizedTarget = normalizeE164Phone(phoneE164);

  if (allowSet.size === 0 || !normalizedTarget || !allowSet.has(normalizedTarget)) {
    throw createSafetyError(
      403,
      'destination_not_in_test_allowlist',
      `Destination ${maskPhoneSafe(phoneE164)} is not permitted while VOICE_TELEPHONY_MODE=live_allowlist`
    );
  }
}

/**
 * Classifies transport/dispatch errors per Amendment A1:
 * - `'connect_or_predial_error'`: TCP connect refused, DNS failure, connect timeout,
 *   or deterministic pre-dial HTTP rejection (`400/401/403/404/409/422/503`). Safe -> `failed`,
 *   attempt NOT counted, cooldown NOT burned.
 * - `'ambiguous_timeout'`: `AbortError`/read timeout after HTTP request sent, mid-stream socket
 *   reset, or upstream `504`. Ambiguous -> `unknown` / `needs_reconcile`, NO auto-retry, cooldown retained.
 */
function classifyDispatchTransportError(err) {
  if (!err) return 'connect_or_predial_error';
  if (err.transportClassification) return err.transportClassification;
  if (err.failureKind === 'read_timeout') return 'ambiguous_timeout';
  if (err.failureKind === 'connect_error' || err.isPreDialError === true) {
    return 'connect_or_predial_error';
  }

  const errCode = String(err.cause?.code || err.code || '').trim();
  const errName = String(err.name || '').trim();
  const msg = String(err.message || '').toLowerCase();
  const upstreamStatus = Number(err.upstreamStatus || 0);
  const statusCode = Number(err.statusCode || 0);

  if (CONNECT_ERROR_CODES.has(errCode)) {
    return 'connect_or_predial_error';
  }

  if (
    errName === 'AbortError' ||
    errName === 'TimeoutError' ||
    AMBIGUOUS_TIMEOUT_CODES.has(errCode) ||
    upstreamStatus === 504 ||
    statusCode === 504 ||
    msg.includes('operation was aborted') ||
    msg.includes('read timeout') ||
    msg.includes('headers timeout')
  ) {
    return 'ambiguous_timeout';
  }

  if (PRE_DIAL_HTTP_STATUSES.has(upstreamStatus) || PRE_DIAL_HTTP_STATUSES.has(statusCode)) {
    return 'connect_or_predial_error';
  }

  if (msg.includes('econnrefused') || msg.includes('connection refused') || msg.includes('unreachable')) {
    return 'connect_or_predial_error';
  }

  return 'connect_or_predial_error';
}

function clearVoiceHealthCache() {
  cachedHealthResult = null;
  cachedHealthExpiresAt = 0;
}

function getGatewayHealthUrl() {
  return String(process.env.VOICE_GATEWAY_HEALTH_URL || DEFAULT_GATEWAY_HEALTH_URL).trim();
}

function getVoiceAgentBaseUrl() {
  return String(process.env.VOICE_AGENT_BASE_URL || DEFAULT_VOICE_AGENT_BASE_URL)
    .trim()
    .replace(/\/+$/, '');
}

async function probeJsonEndpoint(url, timeoutMs, fetchImpl = global.fetch) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const latencyMs = Math.max(0, Date.now() - startedAt);
    if (!response.ok) {
      return {
        ok: false,
        status: `http_${response.status}`,
        latencyMs,
        body: null,
      };
    }

    let body = null;
    try {
      body = await response.json();
    } catch (_jsonErr) {
      return {
        ok: false,
        status: 'invalid_json',
        latencyMs,
        body: null,
      };
    }

    const rawStatus = String(body?.status || '').toLowerCase();
    const isHealthyStatus = rawStatus === 'ok' || rawStatus === 'ready' || rawStatus === 'healthy';
    const explicitNotReady = body?.ready === false || body?.ok === false;
    const ok = Boolean(isHealthyStatus && !explicitNotReady);

    return {
      ok,
      status: ok ? 'ok' : rawStatus || 'unhealthy',
      latencyMs,
      body,
    };
  } catch (err) {
    const latencyMs = Math.max(0, Date.now() - startedAt);
    const isTimeout = err && (err.name === 'AbortError' || String(err.message || '').includes('aborted'));
    return {
      ok: false,
      status: isTimeout ? 'timeout' : 'unreachable',
      latencyMs,
      body: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks both Dograh gateway (`https://voice.rimio.in/api/v1/health`) and
 * Python Voice Agent (`/health`) in parallel.
 *
 * Returns `status: 'ready'` (`online: true`) ONLY when both probes succeed.
 */
async function checkVoiceSystemHealth(opts = {}) {
  const forceRefresh = Boolean(opts.forceRefresh);
  const fetchImpl = opts.fetchImpl || global.fetch;
  const timeoutMs = Number(opts.timeoutMs || process.env.VOICE_HEALTH_TIMEOUT_MS || DEFAULT_HEALTH_TIMEOUT_MS);
  const cacheTtlMs = Number(opts.cacheTtlMs || process.env.VOICE_HEALTH_CACHE_TTL_MS || DEFAULT_HEALTH_CACHE_TTL_MS);

  const now = Date.now();
  if (!forceRefresh && cachedHealthResult && now < cachedHealthExpiresAt) {
    return {
      ...cachedHealthResult,
      cached: true,
    };
  }

  const gatewayUrl = opts.gatewayHealthUrl || getGatewayHealthUrl();
  const agentHealthUrl = opts.agentHealthUrl || `${getVoiceAgentBaseUrl()}/health`;

  const [gatewayProbe, agentProbe] = await Promise.all([
    probeJsonEndpoint(gatewayUrl, timeoutMs, fetchImpl),
    probeJsonEndpoint(agentHealthUrl, timeoutMs, fetchImpl),
  ]);

  const agentBody = agentProbe.body || {};
  const dbReadOnlyOk =
    typeof agentBody.db_read_only_ok === 'boolean'
      ? agentBody.db_read_only_ok
      : typeof agentBody.dbReadOnlyOk === 'boolean'
        ? agentBody.dbReadOnlyOk
        : agentProbe.ok
          ? true
          : null;
  const redisOk =
    typeof agentBody.redis_ok === 'boolean'
      ? agentBody.redis_ok
      : typeof agentBody.redisOk === 'boolean'
        ? agentBody.redisOk
        : agentProbe.ok
          ? true
          : null;

  const agentFullyHealthy = Boolean(
    agentProbe.ok && dbReadOnlyOk !== false && redisOk !== false
  );
  const online = Boolean(gatewayProbe.ok && agentFullyHealthy);

  let telephonyMode = 'mock';
  try {
    telephonyMode = resolveVoiceTelephonyMode();
  } catch (_modeErr) {
    telephonyMode = 'invalid_closed';
  }

  const result = {
    status: online ? 'ready' : 'offline',
    online,
    label: online ? 'Voice AI Ready' : 'Voice System Offline',
    telephonyMode,
    killSwitchActive: isVoiceKillSwitchActive(),
    checkedAt: new Date(now).toISOString(),
    cached: false,
    checks: {
      dograhGateway: {
        ok: gatewayProbe.ok,
        status: gatewayProbe.status,
        latencyMs: gatewayProbe.latencyMs,
      },
      voiceAgent: {
        ok: agentFullyHealthy,
        status: agentFullyHealthy ? 'ok' : agentProbe.status,
        latencyMs: agentProbe.latencyMs,
        dbReadOnlyOk,
        redisOk,
      },
    },
  };

  cachedHealthResult = result;
  cachedHealthExpiresAt = now + cacheTtlMs;
  return result;
}

/**
 * Generates an HMAC-SHA256 signature over `${timestampSec}.${rawBody}`.
 */
function signInternalPayload(rawBody, secret, timestampSec = Math.floor(Date.now() / 1000)) {
  const key = String(secret || process.env.VOICE_AI_INTERNAL_HMAC_SECRET || '').trim();
  if (!key) {
    throw new Error('VOICE_AI_INTERNAL_HMAC_SECRET is not configured');
  }
  const bodyStr = Buffer.isBuffer(rawBody)
    ? rawBody.toString('utf8')
    : typeof rawBody === 'string'
      ? rawBody
      : JSON.stringify(rawBody ?? {});
  const ts = String(timestampSec);
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${ts}.${bodyStr}`, 'utf8')
    .digest('hex');

  return {
    timestamp: ts,
    signature,
    rawBody: bodyStr,
  };
}

/**
 * Verifies an incoming HMAC-SHA256 signature and timestamp replay window.
 */
function verifyInternalSignature({
  rawBody,
  timestamp,
  signature,
  secret,
  nowSec = Math.floor(Date.now() / 1000),
  maxSkewSec = DEFAULT_HMAC_REPLAY_WINDOW_SEC,
}) {
  const key = String(secret || process.env.VOICE_AI_INTERNAL_HMAC_SECRET || '').trim();
  if (!key || !timestamp || !signature) {
    return { valid: false, reason: 'missing_hmac_headers_or_secret' };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > maxSkewSec) {
    return { valid: false, reason: 'timestamp_out_of_bounds' };
  }

  const expected = signInternalPayload(rawBody, key, tsNum).signature;
  const sigBuf = Buffer.from(String(signature), 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  return { valid: true, reason: null };
}

/**
 * Dispatches a manual outbound call request to the Python Voice Agent
 * (`POST /api/v1/calls/outbound/manual`) with HMAC-SHA256 headers and
 * server-derived `telephony_mode` / `mock_telephony` (never client-supplied).
 */
async function dispatchManualCallToVoiceAgent(payload, opts = {}) {
  const fetchImpl = opts.fetchImpl || global.fetch;
  const timeoutMs = Number(opts.timeoutMs || process.env.VOICE_DISPATCH_TIMEOUT_MS || 5000);
  const baseUrl = opts.voiceAgentBaseUrl || getVoiceAgentBaseUrl();
  const secret = opts.hmacSecret || process.env.VOICE_AI_INTERNAL_HMAC_SECRET;

  const mode = opts.telephonyMode
    ? resolveVoiceTelephonyMode({ VOICE_TELEPHONY_MODE: opts.telephonyMode })
    : resolveVoiceTelephonyMode();

  const safePayload = {
    ...payload,
    telephony_mode: mode,
    mock_telephony: mode === 'mock',
  };

  const { timestamp, signature, rawBody } = signInternalPayload(safePayload, secret);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/api/v1/calls/outbound/manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-AutoFinex-Timestamp': timestamp,
        'X-AutoFinex-Signature': signature,
      },
      body: rawBody,
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await response.json();
    } catch (_e) {
      body = null;
    }

    if (!response.ok) {
      const err = new Error(body?.detail || body?.error || `Voice Agent returned HTTP ${response.status}`);
      err.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
      err.upstreamStatus = response.status;
      err.code = body?.code || body?.detail || undefined;
      if (response.status === 504) {
        err.statusCode = 504;
        err.transportClassification = 'ambiguous_timeout';
      } else if (response.status === 503) {
        err.statusCode = 503;
        err.isPreDialError = true;
        err.transportClassification = 'connect_or_predial_error';
      } else {
        err.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
        err.isPreDialError = PRE_DIAL_HTTP_STATUSES.has(response.status);
        err.transportClassification = classifyDispatchTransportError(err);
      }
      throw err;
    }

    return body || { accepted: true };
  } catch (err) {
    const classification = classifyDispatchTransportError(err);
    err.transportClassification = classification;
    if (classification === 'ambiguous_timeout') {
      err.statusCode = 504;
      err.code = err.code || 'dispatch_timeout_ambiguous';
    } else if (!err.statusCode) {
      const code = String(err.cause?.code || err.code || '');
      err.statusCode = CONNECT_ERROR_CODES.has(code) ? 503 : 502;
      err.code = CONNECT_ERROR_CODES.has(code) ? 'voice_agent_unavailable' : 'voice_dispatch_failed';
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  checkVoiceSystemHealth,
  clearVoiceHealthCache,
  signInternalPayload,
  verifyInternalSignature,
  dispatchManualCallToVoiceAgent,
  resolveVoiceTelephonyMode,
  isVoiceKillSwitchActive,
  parseTestAllowedNumbers,
  assertServerTelephonySafetyGates,
  assertDestinationAllowlistedIfRequired,
  classifyDispatchTransportError,
  normalizeE164Phone,
};


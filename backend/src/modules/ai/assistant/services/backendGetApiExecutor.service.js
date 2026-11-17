'use strict';

/**
 * In-Process Authenticated `GET` API Executor & Smart JSON Sanitizer
 * (`backendGetApiExecutor.service.js`).
 *
 * Executes validated, tenant-safe AutoFinex Express `GET` routes in-process over an
 * ephemeral `127.0.0.1` loopback socket (unref'd so processes/tests exit cleanly),
 * forwarding the caller's verified JWT + `Finance-ID` headers so `enhancedCheckFinance`,
 * `ownerCheckFinance`, and route RBAC run identically to the frontend application.
 *
 * Before returning JSON to Gemini, `sanitizeAndCompactApiJson`:
 *   1. Strips credentials, tokens, government ID numbers (Aadhaar/PAN), and photo/image URLs/blobs.
 *   2. Preserves FULL customer & staff phone numbers and FULL addresses for authorized users.
 *   3. Applies optional case-insensitive `searchFilter` across array records before truncation.
 *   4. Caps large arrays at `maxItems` (default 25, max 50) while preserving 100% exact
 *      `totalCount` / `matchedCount` metadata so counting questions never under-count.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { redactSecrets } = require('../config/assistant.config');
const { isValidUuid, getInternalAuthHeaders } = require('../security/financeScopeValidator');
const {
  BackendGetApiValidationError,
  validateAndNormalizeGetApiRequest,
} = require('../security/backendGetApiRegistry');

const API_AUDIT_LOG_DIR = path.resolve(__dirname, '../../../../../logs');
const API_AUDIT_LOG_FILE = path.join(API_AUDIT_LOG_DIR, 'ai_api_audit.jsonl');

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RAW_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB safety ceiling before filtering/compaction
const MAX_COMPACTED_JSON_BYTES = 56 * 1024; // ~56 KB prompt budget per tool call

const SENSITIVE_OR_NOISY_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'pwdfp',
  'password_fingerprint',
  'refresh_token',
  'refreshtoken',
  'accesstoken',
  'access_token',
  'jwt',
  'secret',
  'api_key',
  'apikey',
  'aadhar_id',
  'aadhaar_id',
  'aadhar',
  'aadhaar',
  'other_govt_id_number',
  'pan',
  'pan_number',
  'cphoto',
  'gphoto',
  'customerphoto',
  'guardianphoto',
  'cvehiclephoto',
  'cpropertyphoto',
  'gpropertyphoto',
  'vehiclemediaphoto',
  'customer_photo',
  'guardian_photo',
  'cvehicle_photo',
  'cproperty_photo',
  'gproperty_photo',
  'finance_photo',
  'media_url',
  'signedurl',
  'signed_url',
  'file_path',
]);

let sharedLoopbackServer = null;
let sharedLoopbackOriginPromise = null;
let customExpressAppForTest = null;
let injectedGetApiRunnerForTest = null;
let customApiAuditSinkForTest = null;

function appendApiAuditLog(entry) {
  const safeEntry = {
    timestamp: new Date().toISOString(),
    financeId: entry.financeId || null,
    userId: entry.userId || null,
    role: entry.role || null,
    endpoint: redactSecrets(String(entry.endpoint || '').slice(0, 300)),
    searchFilter: entry.searchFilter ? redactSecrets(String(entry.searchFilter).slice(0, 120)) : null,
    statusCode: Number(entry.statusCode || 0),
    durationMs: Number(entry.durationMs || 0),
    truncated: Boolean(entry.truncated),
    error: entry.error ? redactSecrets(String(entry.error).slice(0, 400)) : null,
  };

  if (typeof customApiAuditSinkForTest === 'function') {
    customApiAuditSinkForTest(safeEntry);
  }

  if (String(process.env.NODE_ENV || '').trim() === 'test') {
    return;
  }

  try {
    fs.mkdirSync(API_AUDIT_LOG_DIR, { recursive: true });
    fs.appendFileSync(API_AUDIT_LOG_FILE, `${JSON.stringify(safeEntry)}\n`, 'utf8');
  } catch (err) {
    console.warn('[AI-API-Audit] Could not append audit file:', redactSecrets(err?.message || 'FS_ERR'));
  }
}

async function ensureLoopbackOrigin() {
  if (sharedLoopbackOriginPromise) {
    return sharedLoopbackOriginPromise;
  }

  sharedLoopbackOriginPromise = new Promise((resolve, reject) => {
    try {
      // Lazy require prevents circular initialization during `app.js` startup
      const targetApp = customExpressAppForTest || require('../../../../app').app;
      const srv = http.createServer(targetApp);
      srv.on('error', (err) => {
        sharedLoopbackOriginPromise = null;
        sharedLoopbackServer = null;
        reject(err);
      });
      srv.listen(0, '127.0.0.1', () => {
        if (typeof srv.unref === 'function') {
          srv.unref();
        }
        sharedLoopbackServer = srv;
        const addr = srv.address();
        resolve(`http://127.0.0.1:${addr.port}`);
      });
    } catch (err) {
      sharedLoopbackOriginPromise = null;
      reject(err);
    }
  });

  return sharedLoopbackOriginPromise;
}

async function closeInternalLoopbackServer() {
  const srv = sharedLoopbackServer;
  sharedLoopbackServer = null;
  sharedLoopbackOriginPromise = null;
  if (!srv) return;
  await new Promise((resolve) => {
    try {
      srv.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function setExpressAppForTest(appInstance) {
  customExpressAppForTest = appInstance || null;
  // Reset loopback server so next call binds to the injected/default app
  if (sharedLoopbackServer) {
    try {
      sharedLoopbackServer.close();
    } catch {
      // ignore
    }
  }
  sharedLoopbackServer = null;
  sharedLoopbackOriginPromise = null;
}

function setBackendGetApiRunnerForTest(runner) {
  injectedGetApiRunnerForTest = runner || null;
}

function setBackendGetApiAuditSinkForTest(sink) {
  customApiAuditSinkForTest = sink || null;
}

function recordMatchesSearchFilter(item, rawLowerFilter, compactAlnumFilter) {
  if (item === null || item === undefined) return false;
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    const str = String(item).toLowerCase();
    if (str.includes(rawLowerFilter)) return true;
    if (compactAlnumFilter.length >= 2) {
      const compact = str.replace(/[^a-z0-9]/g, '');
      if (compact.includes(compactAlnumFilter)) return true;
    }
    return false;
  }
  if (Array.isArray(item)) {
    return item.some((el) => recordMatchesSearchFilter(el, rawLowerFilter, compactAlnumFilter));
  }
  if (typeof item === 'object') {
    for (const [k, v] of Object.entries(item)) {
      if (SENSITIVE_OR_NOISY_KEYS.has(k.toLowerCase())) continue;
      if (recordMatchesSearchFilter(v, rawLowerFilter, compactAlnumFilter)) {
        return true;
      }
    }
  }
  return false;
}

function sanitizeNode(value, options, state, depth = 0) {
  if (depth > 8) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (/^data:(?:image|application|audio|video)\//i.test(value.trim())) {
      return '[MEDIA_BLOB_OMITTED]';
    }
    if (value.length > 1200) {
      return `${value.slice(0, 1200)}…`;
    }
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const isObjectRecordList = value.length > 0 && value.some((el) => el && typeof el === 'object' && !Array.isArray(el));
    let working = value;

    if (isObjectRecordList && options.rawLowerFilter && depth <= 2) {
      working = value.filter((el) =>
        recordMatchesSearchFilter(el, options.rawLowerFilter, options.compactAlnumFilter)
      );
      state.filterApplied = true;
    }

    const totalAfterFilter = working.length;
    const cap = depth === 0 || depth === 1 ? options.maxItems : Math.min(options.maxItems, 15);
    if (working.length > cap) {
      state.truncated = true;
      working = working.slice(0, cap);
    }

    const cleanedItems = working.map((item) => sanitizeNode(item, options, state, depth + 1));

    // At top-level array (e.g. GET /api/customers returning [...]), wrap with exact counts!
    if (depth === 0) {
      return {
        totalCount: value.length,
        ...(options.rawLowerFilter ? { matchedCount: totalAfterFilter, searchFilter: options.searchFilter } : {}),
        returnedCount: cleanedItems.length,
        truncated: value.length > cleanedItems.length && !options.rawLowerFilter
          ? true
          : totalAfterFilter > cleanedItems.length,
        items: cleanedItems,
      };
    }

    return cleanedItems;
  }

  if (typeof value === 'object') {
    const out = {};
    const arrayMeta = {};

    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_OR_NOISY_KEYS.has(lowerKey)) {
        continue;
      }

      // Mask raw bank account numbers for non-owners while keeping last 4 digits
      if ((lowerKey === 'account_number' || lowerKey === 'accountnumber') && !options.isOwner && val) {
        const s = String(val).trim();
        out[key] = s.length > 4 ? `******${s.slice(-4)}` : '******';
        continue;
      }

      if (Array.isArray(val) && depth <= 1) {
        const originalLen = val.length;
        const isObjArr = originalLen > 0 && val.some((el) => el && typeof el === 'object' && !Array.isArray(el));
        let filteredArr = val;
        if (isObjArr && options.rawLowerFilter) {
          filteredArr = val.filter((el) =>
            recordMatchesSearchFilter(el, options.rawLowerFilter, options.compactAlnumFilter)
          );
          state.filterApplied = true;
        }
        const matchedLen = filteredArr.length;
        const sliced = filteredArr.length > options.maxItems ? filteredArr.slice(0, options.maxItems) : filteredArr;
        if (filteredArr.length > options.maxItems) {
          state.truncated = true;
        }
        out[key] = sliced.map((el) => sanitizeNode(el, options, state, depth + 2));

        if (originalLen > out[key].length || options.rawLowerFilter) {
          arrayMeta[key] = {
            totalCount: originalLen,
            ...(options.rawLowerFilter ? { matchedCount: matchedLen } : {}),
            returnedCount: out[key].length,
            truncated: matchedLen > out[key].length,
          };
        }
        continue;
      }

      out[key] = sanitizeNode(val, options, state, depth + 1);
    }

    if (Object.keys(arrayMeta).length > 0) {
      out._arrayCounts = arrayMeta;
    }

    return out;
  }

  return String(value);
}

/**
 * Sanitizes, optionally filters (`searchFilter`), and compacts any Backend `GET` JSON
 * payload so it is safe, accurate, and fits comfortably inside Gemini's context window.
 */
function sanitizeAndCompactApiJson(rawPayload, rawOptions = {}) {
  const maxItems = Math.max(1, Math.min(50, Number.parseInt(String(rawOptions.maxItems ?? 25), 10) || 25));
  const searchFilter = typeof rawOptions.searchFilter === 'string' ? rawOptions.searchFilter.trim().slice(0, 100) : '';
  const rawLowerFilter = searchFilter.toLowerCase();
  const compactAlnumFilter = rawLowerFilter.replace(/[^a-z0-9]/g, '');
  const isOwner = Boolean(rawOptions.isOwner);

  const state = { truncated: false, filterApplied: false };
  let sanitized = sanitizeNode(
    rawPayload,
    { maxItems, searchFilter, rawLowerFilter, compactAlnumFilter, isOwner },
    state,
    0
  );

  // Final byte-budget backstop if individual records are unusually wide
  let serialized = JSON.stringify(sanitized);
  if (serialized && Buffer.byteLength(serialized, 'utf8') > MAX_COMPACTED_JSON_BYTES && maxItems > 8) {
    state.truncated = true;
    sanitized = sanitizeNode(
      rawPayload,
      { maxItems: 8, searchFilter, rawLowerFilter, compactAlnumFilter, isOwner },
      state,
      0
    );
  }

  return {
    data: sanitized,
    truncated: state.truncated,
    filterApplied: state.filterApplied,
  };
}

async function readBoundedResponseText(response, maxBytes = MAX_RAW_RESPONSE_BYTES) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const txt = await response.text();
    if (Buffer.byteLength(txt, 'utf8') > maxBytes) {
      const err = new Error('Backend GET response exceeded maximum safe payload size.');
      err.code = 'API_RESPONSE_TOO_LARGE';
      err.statusCode = 502;
      throw err;
    }
    return txt;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        const err = new Error('Backend GET response exceeded maximum safe payload size.');
        err.code = 'API_RESPONSE_TOO_LARGE';
        err.statusCode = 502;
        throw err;
      }
      chunks.push(Buffer.from(value));
    }
  }

  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Defense-in-depth post-response tenant guard: if any returned record or envelope
 * carries an explicit `finance_id` / `financeId` UUID belonging to a DIFFERENT
 * tenant (e.g. if a detail route allowed lookup by raw UUID across companies),
 * block the payload before it ever reaches the LLM.
 */
function assertResponseBelongsToTenant(parsedJson, expectedFinanceId) {
  if (!parsedJson || typeof parsedJson !== 'object' || !isValidUuid(expectedFinanceId)) {
    return;
  }
  const expectedLower = String(expectedFinanceId).trim().toLowerCase();
  const candidateSources = [
    parsedJson,
    parsedJson.customer,
    parsedJson.data,
    parsedJson.vehicle,
    parsedJson.loan,
    parsedJson.godown,
    parsedJson.ledger,
  ];
  for (const obj of candidateSources) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    const rawFid = obj.finance_id ?? obj.financeId ?? null;
    if (typeof rawFid === 'string' && isValidUuid(rawFid)) {
      if (rawFid.trim().toLowerCase() !== expectedLower) {
        throw new BackendGetApiValidationError(
          'CROSS_TENANT_RESPONSE_BLOCKED',
          'Requested record does not belong to the authenticated finance company.',
          404
        );
      }
    }
  }
}

/**
 * Validates and executes an authorized AutoFinex Backend `GET` endpoint, returning
 * sanitized, count-accurate JSON ready for Gemini tool synthesis.
 */
async function executeBackendGetApi(scope, rawParams = {}, options = {}) {
  const startedAt = Date.now();
  const role = scope?.isOwner ? 'owner' : String(scope?.role || 'staff').toLowerCase();
  const searchFilter =
    typeof rawParams.searchFilter === 'string' ? rawParams.searchFilter.trim().slice(0, 100) : '';
  const maxItems = Math.max(1, Math.min(50, Number.parseInt(String(rawParams.maxItems ?? 25), 10) || 25));

  let normalized;
  try {
    normalized = validateAndNormalizeGetApiRequest(scope, {
      endpoint: rawParams.endpoint,
      queryParams: rawParams.queryParams,
      method: rawParams.method,
    });
  } catch (valErr) {
    appendApiAuditLog({
      financeId: scope?.financeId,
      userId: scope?.userId,
      role,
      endpoint: rawParams?.endpoint,
      searchFilter,
      statusCode: valErr.statusCode || 403,
      durationMs: Date.now() - startedAt,
      truncated: false,
      error: `${valErr.code || 'VALIDATION_ERROR'}: ${valErr.message}`,
    });
    throw valErr;
  }

  if (options.signal && options.signal.aborted) {
    const abortErr = new Error('Backend GET API call aborted');
    abortErr.code = 'CLIENT_ABORTED';
    throw abortErr;
  }

  if (injectedGetApiRunnerForTest) {
    const rawTestPayload = await injectedGetApiRunnerForTest(scope, normalized, {
      searchFilter,
      maxItems,
      signal: options.signal,
    });
    assertResponseBelongsToTenant(rawTestPayload, scope.financeId);
    const compacted = sanitizeAndCompactApiJson(rawTestPayload, {
      searchFilter,
      maxItems,
      isOwner: Boolean(scope.isOwner || role === 'owner'),
    });
    appendApiAuditLog({
      financeId: scope.financeId,
      userId: scope.userId,
      role,
      endpoint: normalized.fullPathWithQuery,
      searchFilter,
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      truncated: compacted.truncated,
      error: null,
    });
    return {
      dataType: 'backend_get_api_response',
      endpoint: normalized.pathname,
      query: normalized.queryObject,
      statusCode: 200,
      truncated: compacted.truncated,
      ...(searchFilter ? { searchFilter } : {}),
      data: compacted.data,
    };
  }

  const headers = getInternalAuthHeaders(scope);
  if (!headers.Authorization && !headers['Owner-Authorization']) {
    const missingAuthErr = new Error(
      'Session authentication token is unavailable for internal GET API dispatch.'
    );
    missingAuthErr.code = 'MISSING_INTERNAL_AUTH_HEADER';
    missingAuthErr.statusCode = 401;
    appendApiAuditLog({
      financeId: scope.financeId,
      userId: scope.userId,
      role,
      endpoint: normalized.fullPathWithQuery,
      searchFilter,
      statusCode: 401,
      durationMs: Date.now() - startedAt,
      truncated: false,
      error: `${missingAuthErr.code}: ${missingAuthErr.message}`,
    });
    throw missingAuthErr;
  }

  const timeoutMs = Math.max(500, Math.min(10000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const fetchSignal =
    options.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

  try {
    const origin = await ensureLoopbackOrigin();
    const targetUrl = `${origin}${normalized.fullPathWithQuery}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: fetchSignal,
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('application/json') && !contentType.includes('text/json')) {
      const nonJsonErr = new Error(`Endpoint "${normalized.pathname}" did not return JSON.`);
      nonJsonErr.code = 'NON_JSON_API_RESPONSE';
      nonJsonErr.statusCode = 502;
      throw nonJsonErr;
    }

    const rawText = await readBoundedResponseText(response);
    let parsedJson = null;
    try {
      parsedJson = rawText ? JSON.parse(rawText) : null;
    } catch {
      const parseErr = new Error(`Endpoint "${normalized.pathname}" returned malformed JSON.`);
      parseErr.code = 'INVALID_JSON_API_RESPONSE';
      parseErr.statusCode = 502;
      throw parseErr;
    }

    if (response.ok) {
      assertResponseBelongsToTenant(parsedJson, scope.financeId);
    }

    const compacted = sanitizeAndCompactApiJson(parsedJson, {
      searchFilter,
      maxItems,
      isOwner: Boolean(scope.isOwner || role === 'owner'),
    });

    appendApiAuditLog({
      financeId: scope.financeId,
      userId: scope.userId,
      role,
      endpoint: normalized.fullPathWithQuery,
      searchFilter,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      truncated: compacted.truncated,
      error: response.ok ? null : `HTTP_${response.status}`,
    });

    if (!response.ok) {
      return {
        dataType: 'backend_get_api_error',
        endpoint: normalized.pathname,
        statusCode: response.status,
        ok: false,
        error: redactSecrets(
          compacted.data?.message || compacted.data?.error || `Endpoint returned HTTP ${response.status}`
        ),
      };
    }

    return {
      dataType: 'backend_get_api_response',
      endpoint: normalized.pathname,
      query: normalized.queryObject,
      statusCode: response.status,
      ok: true,
      truncated: compacted.truncated,
      ...(searchFilter ? { searchFilter } : {}),
      data: compacted.data,
    };
  } catch (err) {
    if (options.signal?.aborted || err?.name === 'AbortError') {
      const isCallerAbort = Boolean(options.signal?.aborted);
      const outErr = new Error(isCallerAbort ? 'Backend GET API call aborted' : 'Backend GET API timed out');
      outErr.code = isCallerAbort ? 'CLIENT_ABORTED' : 'API_TIMEOUT';
      outErr.statusCode = isCallerAbort ? 499 : 504;
      appendApiAuditLog({
        financeId: scope.financeId,
        userId: scope.userId,
        role,
        endpoint: normalized.fullPathWithQuery,
        searchFilter,
        statusCode: outErr.statusCode,
        durationMs: Date.now() - startedAt,
        truncated: false,
        error: outErr.code,
      });
      throw outErr;
    }

    appendApiAuditLog({
      financeId: scope.financeId,
      userId: scope.userId,
      role,
      endpoint: normalized.fullPathWithQuery,
      searchFilter,
      statusCode: Number(err?.statusCode) || 500,
      durationMs: Date.now() - startedAt,
      truncated: false,
      error: `${err?.code || 'API_EXEC_ERROR'}: ${err?.message || 'Execution failed'}`,
    });
    throw err;
  }
}

module.exports = {
  API_AUDIT_LOG_FILE,
  executeBackendGetApi,
  sanitizeAndCompactApiJson,
  closeInternalLoopbackServer,
  setExpressAppForTest,
  setBackendGetApiRunnerForTest,
  setBackendGetApiAuditSinkForTest,
};

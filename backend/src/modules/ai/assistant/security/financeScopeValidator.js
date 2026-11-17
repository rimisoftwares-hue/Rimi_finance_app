'use strict';

/**
 * Tenant (`financeId`) & Principal Scope Validator for AutoFinex AI Assistant.
 *
 * Enforces identical server-side JWT + Finance Company + Role + Login-Window
 * authorization on BOTH:
 *   1. Express HTTP routes (`/api/ai/assistant/*`, via `req.financeId` & `req.user`)
 *   2. WebSocket HTTP `upgrade` requests (`/ws/ai-assistant`)
 *
 * NEVER trusts `finance_id`, `user_id`, `owner_id`, or `role` supplied by Gemini
 * or unverified client payloads.
 */

const jwt = require('jsonwebtoken');
const { db } = require('../../../../config/database.config');
const {
  getJwtSecret,
  validateOwnerPrincipal,
  validateUserPrincipal,
} = require('../../../auth/sessionSecurity.service');

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const INTERNAL_AUTH_SYMBOL = Symbol.for('autofinex.assistant.internalAuth');

function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

function attachInternalAuthToScope(targetObj, authMeta = {}) {
  const authorization =
    typeof authMeta.authorization === 'string' && authMeta.authorization.trim()
      ? authMeta.authorization.trim()
      : null;
  const ownerAuthorization =
    typeof authMeta.ownerAuthorization === 'string' && authMeta.ownerAuthorization.trim()
      ? authMeta.ownerAuthorization.trim()
      : null;

  if (authorization || ownerAuthorization) {
    Object.defineProperty(targetObj, INTERNAL_AUTH_SYMBOL, {
      value: Object.freeze({ authorization, ownerAuthorization }),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(targetObj);
}

/**
 * Builds outbound request headers for internal read-only Express `GET` calls using the
 * caller's already-verified session credentials (stored on a non-enumerable Symbol so
 * tokens are never serialized in JSON, logs, or LLM outputs).
 */
function getInternalAuthHeaders(scope) {
  if (!scope || !isValidUuid(scope.financeId)) {
    throw new FinanceScopeError(
      'INVALID_FINANCE_ID',
      'Valid authenticated financeId required for internal GET API request',
      403
    );
  }

  const headers = {
    'Finance-ID': String(scope.financeId).trim(),
    Accept: 'application/json',
    'X-AI-Assistant-Internal-Read': '1',
  };

  const authMeta = scope[INTERNAL_AUTH_SYMBOL];
  if (authMeta?.authorization) {
    headers.Authorization = authMeta.authorization;
  }
  if (authMeta?.ownerAuthorization) {
    headers['Owner-Authorization'] = authMeta.ownerAuthorization;
  }

  return headers;
}

class FinanceScopeError extends Error {
  constructor(code, message, statusCode = 403) {
    super(message);
    this.name = 'FinanceScopeError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Builds an immutable verified scope object from an Express `req` that has already
 * passed `enhancedCheckFinance`.
 */
function extractScopeFromHttpRequest(req) {
  const financeId = req && req.financeId ? String(req.financeId).trim() : '';
  if (!isValidUuid(financeId)) {
    throw new FinanceScopeError('INVALID_FINANCE_ID', 'Authenticated finance context missing or invalid', 401);
  }

  const user = req.user || {};
  const isOwner = Boolean(req.isOwner || user.role === 'owner');
  const rawRole = String(user.role || (isOwner ? 'owner' : 'staff')).trim().toLowerCase();
  const role = ['owner', 'admin', 'staff', 'agent'].includes(rawRole) ? rawRole : 'staff';

  const rawAuthHeader = req.headers?.authorization ? String(req.headers.authorization) : null;
  const rawOwnerHeader =
    req.headers?.['owner-authorization'] || req.headers?.['Owner-Authorization'] || null;

  return attachInternalAuthToScope(
    {
      financeId,
      userId: user.id ? String(user.id) : null,
      username: user.username ? String(user.username) : 'user',
      role,
      isOwner,
      authMode: req.authMode || (isOwner ? 'license' : 'direct_user'),
      financeName: user.finance_name || null,
    },
    {
      authorization: rawAuthHeader,
      ownerAuthorization: rawOwnerHeader ? String(rawOwnerHeader) : null,
    }
  );
}

/**
 * Authenticates a WebSocket HTTP `upgrade` request (`IncomingMessage`) using the
 * exact same JWT + principal + active-company + login-window verification as
 * `enhancedCheckFinance` in `auth.middleware.js`.
 *
 * Token sources accepted (in priority order):
 *   0. `?ticket=<opaque>` single-use 60 s ticket (preferred for browsers; keeps JWTs out of URLs)
 *   1. `Authorization: Bearer <token>` / `Owner-Authorization: Bearer <token>` headers
 *   2. URL query params `?token=<jwt>&ownerToken=<jwt>&financeId=<uuid>` (legacy/non-browser
 *      clients only; JWTs in URLs can leak into proxy logs, so the frontend no longer uses this)
 */
async function verifyWebSocketUpgradeScope(upgradeReq, deps = {}) {
  const dbRunner = deps.db || db;
  const parsedUrl = new URL(upgradeReq.url || '/', 'http://localhost');

  // Preferred browser path: short-lived single-use ticket from POST /api/ai/assistant/ws-ticket
  const queryTicket = (parsedUrl.searchParams.get('ticket') || '').trim();
  if (queryTicket) {
    const consume = deps.consumeWsTicket || require('./wsTicket').consumeWsTicket;
    const ticketScope = consume(queryTicket);
    if (!ticketScope) {
      throw new FinanceScopeError('INVALID_WS_TICKET', 'WebSocket ticket is invalid or expired', 401);
    }
    return ticketScope;
  }

  const queryToken = (parsedUrl.searchParams.get('token') || '').trim();
  const queryOwnerToken = (parsedUrl.searchParams.get('ownerToken') || '').trim();
  const queryFinanceId = (parsedUrl.searchParams.get('financeId') || '').trim();

  let authHeader = upgradeReq.headers?.authorization || '';
  const ownerHeader =
    upgradeReq.headers?.['owner-authorization'] || upgradeReq.headers?.['Owner-Authorization'] || '';

  let rawToken = '';
  let usingOwnerToken = false;

  if (authHeader) {
    rawToken = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  } else if (queryToken) {
    rawToken = queryToken.replace(/^Bearer\s+/i, '').trim();
  } else if (ownerHeader) {
    rawToken = String(ownerHeader).replace(/^Bearer\s+/i, '').trim();
    usingOwnerToken = true;
  } else if (queryOwnerToken) {
    rawToken = queryOwnerToken.replace(/^Bearer\s+/i, '').trim();
    usingOwnerToken = true;
  }

  if (!rawToken) {
    throw new FinanceScopeError('AUTH_REQUIRED', 'Authorization token missing for WebSocket upgrade', 401);
  }

  let decoded;
  try {
    const verifyFn = deps.verifyJwt || ((tok) => jwt.verify(tok, getJwtSecret()));
    decoded = verifyFn(rawToken);
  } catch (err) {
    const isExpired = err && err.name === 'TokenExpiredError';
    throw new FinanceScopeError(
      usingOwnerToken ? 'INVALID_OWNER_TOKEN' : isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      'Invalid or expired authentication token',
      401
    );
  }

  if (decoded?.tokenType === 'user_refresh') {
    throw new FinanceScopeError('INVALID_TOKEN_TYPE', 'Refresh tokens cannot open assistant sessions', 401);
  }

  const rawHeaderFinanceId =
    upgradeReq.headers?.['finance-id'] || upgradeReq.headers?.['Finance-ID'] || queryFinanceId;
  const headerFinanceId =
    rawHeaderFinanceId !== undefined && rawHeaderFinanceId !== null ? String(rawHeaderFinanceId).trim() : '';

  if (
    headerFinanceId &&
    (headerFinanceId === 'undefined' || headerFinanceId === 'null' || !isValidUuid(headerFinanceId))
  ) {
    throw new FinanceScopeError('INVALID_FINANCE_ID', 'Invalid finance ID', 400);
  }

  // Branch A: License / Owner Principal
  if (decoded.owner) {
    const ownerValidator = deps.validateOwnerPrincipal || validateOwnerPrincipal;
    const ownerCheck = await ownerValidator(dbRunner, decoded);
    if (!ownerCheck.valid) {
      throw new FinanceScopeError(
        ownerCheck.error_code || 'INVALID_OWNER_TOKEN',
        ownerCheck.message || 'Owner session invalid',
        ownerCheck.status || 401
      );
    }

    let financeId =
      headerFinanceId || (decoded.current_finance_id ? String(decoded.current_finance_id).trim() : '');

    if (!financeId) {
      const defFin = await dbRunner.query(
        'SELECT id, finance_name FROM finance_detail WHERE owner_id = $1 AND is_active = 1 ORDER BY created_at ASC, id ASC LIMIT 1',
        [ownerCheck.owner.id]
      );
      if (defFin.rows.length > 0) {
        financeId = String(defFin.rows[0].id);
      }
    }

    if (!financeId || !isValidUuid(financeId)) {
      throw new FinanceScopeError('FINANCE_CONTEXT_MISSING', 'Active finance context missing', 400);
    }

    const finCheck = await dbRunner.query(
      'SELECT id, owner_id, is_active, finance_name FROM finance_detail WHERE id = $1 LIMIT 1',
      [financeId]
    );

    if (finCheck.rows.length === 0 || Number(finCheck.rows[0].is_active) !== 1) {
      throw new FinanceScopeError('FINANCE_NOT_FOUND', 'Finance company not found or inactive', 404);
    }

    if (String(finCheck.rows[0].owner_id) !== String(ownerCheck.owner.id)) {
      throw new FinanceScopeError('FINANCE_ACCESS_DENIED', 'Not authorized for this finance company', 403);
    }

    return attachInternalAuthToScope(
      {
        financeId,
        userId: String(ownerCheck.owner.id),
        username: String(ownerCheck.owner.username || 'owner'),
        role: 'owner',
        isOwner: true,
        authMode: 'license',
        financeName: finCheck.rows[0].finance_name || null,
      },
      {
        authorization: !usingOwnerToken ? `Bearer ${rawToken}` : null,
        ownerAuthorization: usingOwnerToken ? `Bearer ${rawToken}` : null,
      }
    );
  }

  // Branch B: Staff / Admin / Agent User Principal
  const candidateFinanceId =
    headerFinanceId || (decoded.user?.current_finance_id ? String(decoded.user.current_finance_id).trim() : '');

  if (
    candidateFinanceId &&
    (candidateFinanceId === 'undefined' || candidateFinanceId === 'null' || !isValidUuid(candidateFinanceId))
  ) {
    throw new FinanceScopeError('INVALID_FINANCE_ID', 'Invalid finance ID', 400);
  }

  const userValidator = deps.validateUserPrincipal || validateUserPrincipal;
  const userValidation = await userValidator(dbRunner, decoded, {
    targetFinanceId: candidateFinanceId || null,
    requireFinanceContext: true,
    enforceLoginWindow: true,
  });

  if (!userValidation.valid) {
    throw new FinanceScopeError(
      userValidation.error_code || 'AUTH_INVALID',
      userValidation.message || 'User authorization failed',
      userValidation.status || 401
    );
  }

  const membership = userValidation.selectedMembership;
  const resolvedFinanceId = String(membership.finance_id);
  const rawRole = String(membership.role || 'staff').trim().toLowerCase();
  const role = ['owner', 'admin', 'staff', 'agent'].includes(rawRole) ? rawRole : 'staff';

  return attachInternalAuthToScope(
    {
      financeId: resolvedFinanceId,
      userId: String(userValidation.userRow.id),
      username: String(userValidation.userRow.username || 'user'),
      role,
      isOwner: role === 'owner',
      authMode: userValidation.authMode || 'direct_user',
      financeName: membership.finance_name || null,
    },
    {
      authorization: !usingOwnerToken ? `Bearer ${rawToken}` : null,
      ownerAuthorization: usingOwnerToken ? `Bearer ${rawToken}` : null,
    }
  );
}

/**
 * Strips any untrusted tenant/identity override fields that Gemini might emit inside
 * tool arguments, ensuring only the server-verified `scope` governs tenant access.
 */
function sanitizeToolParameters(rawParams) {
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    return {};
  }
  const clean = { ...rawParams };
  delete clean.finance_id;
  delete clean.financeId;
  delete clean.owner_id;
  delete clean.ownerId;
  delete clean.user_id;
  delete clean.userId;
  delete clean.role;
  delete clean.company_id;
  return clean;
}

module.exports = {
  INTERNAL_AUTH_SYMBOL,
  FinanceScopeError,
  isValidUuid,
  attachInternalAuthToScope,
  getInternalAuthHeaders,
  extractScopeFromHttpRequest,
  verifyWebSocketUpgradeScope,
  sanitizeToolParameters,
};


/**
 * changePassword.service.js
 *
 * Handles password verification, policy validation, rate limiting,
 * transactional password update, other-session invalidation, and audit logging
 * for both `user` and `owner` principals.
 *
 * Security invariants:
 * - Never logs, returns, or stores plaintext passwords.
 * - Never returns password hashes or tokens.
 * - Never runs `SELECT *` on `users` or `owner`.
 * - Identifies principal strictly from verified JWT token, never from request body.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../../config/database.config');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Rate limiter: max 5 failed current-password attempts per 15 minutes per principal
const MAX_FAILED_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failedAttemptBuckets = new Map();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;

function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

/**
 * Formats a Date into YYYY-MM-DD in Asia/Kolkata timezone
 */
function formatIstDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Check if principal is currently rate-limited due to prior failed password attempts.
 */
function checkFailedAttemptLimit(key, now = Date.now()) {
  const bucket = failedAttemptBuckets.get(key);
  if (!bucket) return null;

  const validTimestamps = bucket.filter((ts) => now - ts < FAILURE_WINDOW_MS);
  if (validTimestamps.length === 0) {
    failedAttemptBuckets.delete(key);
    return null;
  }
  failedAttemptBuckets.set(key, validTimestamps);

  if (validTimestamps.length >= MAX_FAILED_ATTEMPTS) {
    const oldestTs = validTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestTs + FAILURE_WINDOW_MS - now) / 1000));
    return retryAfterSeconds;
  }

  return null;
}

/**
 * Record a failed current-password verification attempt.
 */
function recordFailedAttempt(key, now = Date.now()) {
  const bucket = failedAttemptBuckets.get(key) || [];
  const validTimestamps = bucket.filter((ts) => now - ts < FAILURE_WINDOW_MS);
  validTimestamps.push(now);
  failedAttemptBuckets.set(key, validTimestamps);
}

/**
 * Clear failed attempts for a principal upon successful password change.
 */
function clearFailedAttempts(key) {
  failedAttemptBuckets.delete(key);
}

function resetChangePasswordRateLimiterForTests() {
  failedAttemptBuckets.clear();
}

/**
 * Verify password using the same semantics as user-login / owner-login:
 * 1. Try bcrypt.compare
 * 2. If stored value is a legacy non-bcrypt plaintext string, compare using
 *    crypto.timingSafeEqual on equal-length UTF-8 buffers.
 */
async function verifyStoredPassword(candidatePassword, storedPassword) {
  if (typeof candidatePassword !== 'string' || typeof storedPassword !== 'string' || !storedPassword) {
    return false;
  }

  let isMatch = false;
  try {
    isMatch = await bcrypt.compare(candidatePassword, storedPassword);
  } catch {
    isMatch = false;
  }

  if (!isMatch && !BCRYPT_HASH_REGEX.test(storedPassword)) {
    const candBuf = Buffer.from(candidatePassword, 'utf8');
    const storedBuf = Buffer.from(storedPassword, 'utf8');
    if (candBuf.length === storedBuf.length) {
      isMatch = crypto.timingSafeEqual(candBuf, storedBuf);
    }
  }

  return isMatch;
}

/**
 * Extract and verify the caller principal from Authorization / Owner-Authorization headers.
 * Never trusts any principal identifier from the request body.
 */
function resolveCallerPrincipal(req) {
  if (req && req.principalType && req.principalId) {
    return {
      principalType: req.principalType,
      principalId: String(req.principalId).trim(),
      sessionId: req.sessionId || null,
      financeId: req.financeId || null,
    };
  }
  if (req?.user?.id && isValidUuid(String(req.user.id))) {
    return {
      principalType: 'user',
      principalId: String(req.user.id).trim(),
      sessionId: isValidUuid(String(req.user.sessionId || ''))
        ? String(req.user.sessionId).trim()
        : null,
      financeId: isValidUuid(String(req.financeId || req.user.current_finance_id || ''))
        ? String(req.financeId || req.user.current_finance_id).trim()
        : null,
    };
  }
  if (req?.owner?.id && isValidUuid(String(req.owner.id))) {
    return {
      principalType: 'owner',
      principalId: String(req.owner.id).trim(),
      sessionId: null,
      financeId: isValidUuid(String(req.financeId || ''))
        ? String(req.financeId).trim()
        : null,
    };
  }

  let token = null;
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const ownerAuthHeader = req.headers?.['owner-authorization'] || req.headers?.['Owner-Authorization'];

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof ownerAuthHeader === 'string' && ownerAuthHeader.startsWith('Bearer ')) {
    token = ownerAuthHeader.slice(7).trim();
  }

  if (!token) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    err.errorCode = 'UNAUTHORIZED';
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    const err = new Error('Invalid or expired authentication token');
    err.statusCode = 401;
    err.errorCode = 'UNAUTHORIZED';
    throw err;
  }

  if (decoded?.user?.id && isValidUuid(String(decoded.user.id))) {
    return {
      principalType: 'user',
      principalId: String(decoded.user.id).trim(),
      sessionId: isValidUuid(String(decoded.user.sessionId || ''))
        ? String(decoded.user.sessionId).trim()
        : null,
      financeId: isValidUuid(String(decoded.user.current_finance_id || req.headers?.['finance-id'] || ''))
        ? String(decoded.user.current_finance_id || req.headers?.['finance-id']).trim()
        : null,
    };
  }

  if (decoded?.owner?.id && isValidUuid(String(decoded.owner.id))) {
    return {
      principalType: 'owner',
      principalId: String(decoded.owner.id).trim(),
      sessionId: null,
      financeId: isValidUuid(String(req.headers?.['finance-id'] || ''))
        ? String(req.headers?.['finance-id']).trim()
        : null,
    };
  }

  const err = new Error('Invalid authentication token payload');
  err.statusCode = 401;
  err.errorCode = 'UNAUTHORIZED';
  throw err;
}

/**
 * Validate `currentPassword` and `newPassword` according to Decision E.
 * Never trims or mutates the password strings.
 */
function validatePasswordInput(body) {
  if (!body || typeof body !== 'object') {
    const err = new Error('Current and new passwords are required');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }

  const { currentPassword, newPassword } = body;

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    const err = new Error('Current and new passwords must be strings');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }

  if (currentPassword.length === 0) {
    const err = new Error('Current password is required');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }

  if (newPassword.length === 0) {
    const err = new Error('New password is required');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    const err = new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    err.statusCode = 400;
    err.errorCode = 'PASSWORD_TOO_SHORT';
    throw err;
  }

  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    const err = new Error(`New password must not exceed ${MAX_PASSWORD_LENGTH} characters`);
    err.statusCode = 400;
    err.errorCode = 'PASSWORD_TOO_LONG';
    throw err;
  }

  if (newPassword === currentPassword) {
    const err = new Error('New password must be different from your current password');
    err.statusCode = 400;
    err.errorCode = 'PASSWORD_SAME_AS_CURRENT';
    throw err;
  }

  return { currentPassword, newPassword };
}

/**
 * Main handler logic for POST /api/auth/change-password
 */
async function changePasswordForPrincipal(reqOrPrincipal, payloadOrQueryable = db, options = {}) {
  let req = reqOrPrincipal;
  let queryable = payloadOrQueryable;

  if (reqOrPrincipal && (reqOrPrincipal.principalType || reqOrPrincipal.user || reqOrPrincipal.owner)) {
    if (payloadOrQueryable && typeof payloadOrQueryable === 'object' && payloadOrQueryable.newPassword !== undefined) {
      req = {
        ...reqOrPrincipal,
        body: payloadOrQueryable,
      };
      queryable = options?.queryable || options?.db || db;
    }
  }

  if (queryable && queryable.queryable) {
    queryable = queryable.queryable;
  }

  const principal = resolveCallerPrincipal(req);
  const { currentPassword, newPassword } = validatePasswordInput(req.body);

  const rateLimitKey = `${principal.principalType}:${principal.principalId}`;
  const retryAfterSeconds = checkFailedAttemptLimit(rateLimitKey);
  if (retryAfterSeconds !== null) {
    const err = new Error('Too many failed password attempts. Please try again later.');
    err.statusCode = 429;
    err.errorCode = 'RATE_LIMIT_EXCEEDED';
    err.retryAfterSeconds = retryAfterSeconds;
    throw err;
  }

  // Explicitly select only required columns (never SELECT *)
  const selectSql =
    principal.principalType === 'owner'
      ? `SELECT id, username, password, is_active FROM owner WHERE id = $1::uuid LIMIT 1`
      : `SELECT id, username, password, is_active FROM users WHERE id = $1::uuid LIMIT 1`;

  const accountRes = await queryable.query(selectSql, [principal.principalId]);
  const rows = accountRes?.rows || [];

  if (rows.length === 0) {
    const err = new Error('Account not found');
    err.statusCode = 404;
    err.errorCode = 'ACCOUNT_NOT_FOUND';
    throw err;
  }

  const account = rows[0];
  const isCurrentValid = await verifyStoredPassword(currentPassword, account.password);

  if (!isCurrentValid) {
    recordFailedAttempt(rateLimitKey);
    const err = new Error('Current password is incorrect');
    err.statusCode = 401;
    err.errorCode = 'INVALID_CURRENT_PASSWORD';
    throw err;
  }

  const salt = await bcrypt.genSalt(BCRYPT_COST);
  const newPasswordHash = await bcrypt.hash(newPassword, salt);

  const client = typeof queryable.getConnection === 'function'
    ? await queryable.getConnection()
    : typeof queryable.connect === 'function'
      ? await queryable.connect()
      : queryable;

  let lastPasswordChange = formatIstDate(new Date());

  const beginTx = async () => {
    if (typeof client.beginTransaction === 'function') {
      await client.beginTransaction();
    } else if (typeof client.query === 'function') {
      await client.query('BEGIN');
    }
  };

  const commitTx = async () => {
    if (typeof client.commit === 'function') {
      await client.commit();
    } else if (typeof client.query === 'function') {
      await client.query('COMMIT');
    }
  };

  const rollbackTx = async () => {
    if (typeof client.rollback === 'function') {
      await client.rollback();
    } else if (typeof client.query === 'function') {
      await client.query('ROLLBACK');
    }
  };

  try {
    await beginTx();

    const updateTable = principal.principalType === 'owner' ? 'owner' : 'users';
    try {
      await client.query('SAVEPOINT sp_pw_update');
      const updateRes = await client.query(
        `UPDATE ${updateTable}
         SET password = $1,
             password_changed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2::uuid
         RETURNING TO_CHAR(password_changed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS last_password_change`,
        [newPasswordHash, principal.principalId]
      );
      if (updateRes?.rows?.[0]?.last_password_change) {
        lastPasswordChange = updateRes.rows[0].last_password_change;
      }
    } catch (colErr) {
      // Fallback if migration 008 has not been executed on the target DB yet
      if (colErr && (colErr.code === '42703' || String(colErr.message || '').includes('password_changed_at'))) {
        try {
          await client.query('ROLLBACK TO SAVEPOINT sp_pw_update');
        } catch {}
        await client.query(
          `UPDATE ${updateTable}
           SET password = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid`,
          [newPasswordHash, principal.principalId]
        );
      } else {
        throw colErr;
      }
    }

    // Invalidate other open login sessions for `user` principals while preserving the current session
    if (principal.principalType === 'user') {
      await client.query(
        `UPDATE agent_login_sessions
         SET logout_time = CURRENT_TIMESTAMP,
             duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))::int),
             logout_reason = 'password_changed'
         WHERE user_id = $1::uuid
           AND logout_time IS NULL
           AND ($2::uuid IS NULL OR id <> $2::uuid)`,
        [principal.principalId, principal.sessionId]
      );
    }

    await commitTx();
  } catch (txErr) {
    try {
      await rollbackTx();
    } catch {}
    throw txErr;
  } finally {
    if (typeof client.release === 'function') {
      client.release();
    }
  }

  clearFailedAttempts(rateLimitKey);

  // Event-only audit log (never log passwords, hashes, or request body)
  console.info('[AUDIT] password_changed', {
    principalType: principal.principalType,
    principalId: principal.principalId,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    message: 'Password changed successfully',
    lastPasswordChange,
  };
}

module.exports = {
  changePasswordForPrincipal,
  verifyStoredPassword,
  validatePasswordInput,
  resolveCallerPrincipal,
  resetChangePasswordRateLimiterForTests,
  formatIstDate,
};


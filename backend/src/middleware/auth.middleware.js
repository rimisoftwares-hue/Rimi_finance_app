const jwt = require('jsonwebtoken');
const { db } = require('../config/database.config');
const {
  getJwtSecret,
  computePasswordFingerprint,
  validateOwnerPrincipal,
  validateUserPrincipal,
} = require('../modules/auth/sessionSecurity.service');

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  if (Number.isNaN(h)) return String(timeStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
}

const enhancedCheckFinance = async (req, res, next) => {
  try {
    // Prefer standard User Authorization header; fall back to owner-authorization only when absent
    let authHeader = req.headers.authorization;
    let usingOwnerHeader = false;
    if (!authHeader && (req.headers['owner-authorization'] || req.headers['Owner-Authorization'])) {
      authHeader = req.headers['owner-authorization'] || req.headers['Owner-Authorization'];
      usingOwnerHeader = true;
    }

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token missing',
        error_code: 'AUTH_REQUIRED',
      });
    }

    const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token missing',
        error_code: 'AUTH_REQUIRED',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch (err) {
      const isExpired = err && err.name === 'TokenExpiredError';
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        error_code: usingOwnerHeader
          ? 'INVALID_OWNER_TOKEN'
          : isExpired
            ? 'TOKEN_EXPIRED'
            : 'INVALID_TOKEN',
      });
    }

    if (decoded?.tokenType === 'user_refresh') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token type',
        error_code: 'INVALID_TOKEN_TYPE',
      });
    }

    const rawHeaderFinanceId = req.headers['finance-id'] || req.headers['Finance-ID'];
    const headerFinanceId =
      rawHeaderFinanceId !== undefined && rawHeaderFinanceId !== null
        ? String(rawHeaderFinanceId).trim()
        : '';

    if (headerFinanceId && (headerFinanceId === 'undefined' || headerFinanceId === 'null' || !isValidUuid(headerFinanceId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid finance ID',
        error_code: 'INVALID_FINANCE_ID',
      });
    }

    // Branch A: License/Owner JWT
    if (decoded.owner) {
      const ownerCheck = await validateOwnerPrincipal(db, decoded);
      if (!ownerCheck.valid) {
        return res.status(ownerCheck.status || 401).json({
          success: false,
          error: ownerCheck.message,
          message: ownerCheck.message,
          error_code: ownerCheck.error_code,
        });
      }

      req.owner = ownerCheck.owner;
      req.user = {
        id: ownerCheck.owner.id,
        username: ownerCheck.owner.username,
        role: 'owner',
      };
      req.isOwner = true;
      req.authMode = 'license';
      req.principalType = 'owner';
      req.principalId = ownerCheck.owner.id;

      let financeId = headerFinanceId || (decoded.current_finance_id ? String(decoded.current_finance_id).trim() : '');

      if (!financeId) {
        const defFin = await db.query(
          'SELECT id FROM finance_detail WHERE owner_id = $1 AND is_active = 1 ORDER BY created_at ASC, id ASC LIMIT 1',
          [ownerCheck.owner.id]
        );
        if (defFin.rows.length > 0) {
          financeId = String(defFin.rows[0].id);
        }
      }

      if (!financeId) {
        return res.status(400).json({
          success: false,
          error: 'Finance context missing',
          error_code: 'FINANCE_CONTEXT_MISSING',
        });
      }

      if (!isValidUuid(financeId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid finance ID',
          error_code: 'INVALID_FINANCE_ID',
        });
      }

      // Enforce strict tenant isolation: finance must belong to this Owner License and be active
      const finCheck = await db.query(
        'SELECT id, owner_id, is_active FROM finance_detail WHERE id = $1 LIMIT 1',
        [financeId]
      );

      if (finCheck.rows.length === 0 || Number(finCheck.rows[0].is_active) !== 1) {
        return res.status(404).json({
          success: false,
          error: 'Finance company not found or inactive',
          error_code: 'FINANCE_NOT_FOUND',
        });
      }

      if (String(finCheck.rows[0].owner_id) !== String(ownerCheck.owner.id)) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized for this finance company',
          error_code: 'FINANCE_ACCESS_DENIED',
        });
      }

      req.financeId = financeId;
      return next();
    }

    // Branch B: User JWT (License Mode or Direct User Mode)
    const candidateFinanceId =
      headerFinanceId ||
      (decoded.user?.current_finance_id ? String(decoded.user.current_finance_id).trim() : '');

    if (
      candidateFinanceId &&
      (candidateFinanceId === 'undefined' || candidateFinanceId === 'null' || !isValidUuid(candidateFinanceId))
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid finance ID',
        error_code: 'INVALID_FINANCE_ID',
      });
    }

    const userValidation = await validateUserPrincipal(db, decoded, {
      targetFinanceId: candidateFinanceId || null,
      requireFinanceContext: true,
      enforceLoginWindow: true,
    });

    if (!userValidation.valid) {
      if (userValidation.error_code === 'LOGIN_TIME_RESTRICTED') {
        return res.status(403).json({
          success: false,
          message: `Your authorized working hours are ${formatTime12h(userValidation.allowed_from)} – ${formatTime12h(userValidation.allowed_to)}. Access is restricted outside this window.`,
          error: userValidation.message,
          error_code: 'LOGIN_TIME_RESTRICTED',
          allowed_from: userValidation.allowed_from,
          allowed_to: userValidation.allowed_to,
        });
      }

      return res.status(userValidation.status || 401).json({
        success: false,
        error: userValidation.message,
        message: userValidation.message,
        error_code: userValidation.error_code,
      });
    }

    const membership = userValidation.selectedMembership;
    const resolvedFinanceId = String(membership.finance_id);

    req.authMode = userValidation.authMode;
    req.financeId = resolvedFinanceId;
    req.principalType = 'user';
    req.principalId = userValidation.userRow.id;
    req.user = {
      ...decoded.user,
      id: userValidation.userRow.id,
      username: userValidation.userRow.username,
      email: userValidation.userRow.email,
      role: membership.role,
      allowed_companies: userValidation.allowedCompanies,
      current_finance_id: resolvedFinanceId,
      finance_name: membership.finance_name,
    };

    if (membership.role === 'owner') {
      req.owner = {
        id: membership.owner_id,
        username: membership.owner_username,
      };
      req.isOwner = true;
    }

    return next();
  } catch (error) {
    console.error('Finance middleware error:', error?.message || error);

    if (error && (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST')) {
      return res.status(503).json({
        success: false,
        error: 'Database connection lost. Please try again.',
        retry: true,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Finance verification failed',
    });
  }
};

// Middleware to authenticate User JWT token (used by /session-heartbeat, etc.)
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token, authorization denied',
      error_code: 'AUTH_REQUIRED',
    });
  }

  try {
    const token = authHeader.slice(7).trim();
    const decoded = jwt.verify(token, getJwtSecret());

    if (decoded?.tokenType === 'user_refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
        error_code: 'INVALID_TOKEN_TYPE',
      });
    }

    req.authDecoded = decoded;
    req.authMode = decoded.authMode === 'direct_user' ? 'direct_user' : 'license';
    req.user = decoded.user;
    return next();
  } catch (err) {
    const isExpired = err && err.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      message: isExpired ? 'Token has expired' : 'Token is not valid',
      error_code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    });
  }
};

const checkFinance = async (req, res, next) => {
  try {
    const authHeader = req.headers['finance-authorization'];
    if (authHeader) {
      const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
      const decoded = jwt.verify(token, getJwtSecret());
      req.financeId = decoded.finance?.id ? String(decoded.finance.id) : null;
      return next();
    }

    return enhancedCheckFinance(req, res, next);
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid finance token', error_code: 'INVALID_TOKEN' });
  }
};

/**
 * Resolves the authoritative Owner record (`owner.id`, `owner.username`) from
 * either a License/Owner JWT (`owner-authorization` / `Authorization`) OR an
 * authenticated Owner-role User JWT (`Authorization` -> `user_allowed_companies`
 * -> `finance_detail` -> `owner`).
 *
 * Never equates `users.id` with `owner.id`.
 */
const resolveOwnerFromRequest = async (req) => {
  const rawOwnerHeader = req.headers['owner-authorization'] || req.headers['Owner-Authorization'];
  const rawUserHeader = req.headers.authorization;

  const candidateTokens = [];
  if (rawUserHeader) {
    candidateTokens.push({
      token: String(rawUserHeader).replace(/^Bearer\s+/i, '').trim(),
      source: 'user',
    });
  }
  if (rawOwnerHeader) {
    const ownerTok = String(rawOwnerHeader).replace(/^Bearer\s+/i, '').trim();
    if (ownerTok && !candidateTokens.some((c) => c.token === ownerTok)) {
      candidateTokens.push({ token: ownerTok, source: 'owner' });
    }
  }

  if (candidateTokens.length === 0 || !candidateTokens[0].token) {
    return {
      status: 401,
      error: 'Authentication token missing. Owner access required.',
      error_code: 'AUTH_REQUIRED',
    };
  }

  let lastAuthFailure = null;

  const requestedFinanceCandidate =
    req.headers['finance-id'] ||
    req.headers['Finance-ID'] ||
    req.params?.financeId ||
    req.query?.financeId ||
    req.query?.finance_id ||
    req.body?.financeId ||
    req.body?.finance_id ||
    null;

  const scopedFinanceId =
    requestedFinanceCandidate && isValidUuid(String(requestedFinanceCandidate))
      ? String(requestedFinanceCandidate).trim()
      : null;

  for (const candidate of candidateTokens) {
    let decoded;
    try {
      decoded = jwt.verify(candidate.token, getJwtSecret());
    } catch (err) {
      const isExpired = err && err.name === 'TokenExpiredError';
      lastAuthFailure = {
        status: 401,
        error: 'Invalid or expired authorization token',
        error_code:
          candidate.source === 'owner'
            ? 'INVALID_OWNER_TOKEN'
            : isExpired
              ? 'TOKEN_EXPIRED'
              : 'INVALID_TOKEN',
      };
      continue;
    }

    if (decoded?.tokenType === 'user_refresh') {
      lastAuthFailure = {
        status: 401,
        error: 'Invalid token type',
        error_code: 'INVALID_TOKEN_TYPE',
      };
      continue;
    }

    // Case A: License/Owner token (`decoded.owner.id`)
    if (decoded?.owner?.id) {
      const ownerValidation = await validateOwnerPrincipal(db, decoded);
      if (ownerValidation.valid) {
        return {
          owner: ownerValidation.owner,
          user: {
            id: ownerValidation.owner.id,
            username: ownerValidation.owner.username,
            role: 'owner',
          },
          isOwner: true,
          authMode: 'license',
        };
      }
      lastAuthFailure = {
        status: ownerValidation.status || 401,
        error: ownerValidation.message,
        error_code: ownerValidation.error_code,
      };
      continue;
    }

    // Case B: User token — must be active in `users`, pass password/session checks,
    // AND hold active `role = 'owner'` in `user_allowed_companies` linked to an active
    // `finance_detail` and active `owner` License.
    if (decoded?.user?.id) {
      const preferredFinanceId =
        scopedFinanceId ||
        (decoded.user.current_finance_id && isValidUuid(String(decoded.user.current_finance_id))
          ? String(decoded.user.current_finance_id).trim()
          : null);

      const userValidation = await validateUserPrincipal(db, decoded, {
        targetFinanceId: preferredFinanceId,
        requireFinanceContext: false,
        enforceLoginWindow: false,
      });

      if (!userValidation.valid) {
        lastAuthFailure = {
          status: userValidation.status || 401,
          error: userValidation.message,
          error_code: userValidation.error_code,
        };
        continue;
      }

      // Resolve real `owner` record through verified `owner`-role finance membership
      const { rows } = await db.query(
        `SELECT o.id AS owner_id,
                o.username AS owner_username,
                fd.id AS finance_id
           FROM users u
           INNER JOIN user_allowed_companies uac
             ON uac.user_id = u.id
            AND uac.is_active = 1
            AND uac.role = 'owner'
           INNER JOIN finance_detail fd
             ON fd.id = uac.finance_id
            AND fd.is_active = 1
           INNER JOIN owner o
             ON o.id = fd.owner_id
            AND o.is_active = 1
          WHERE u.id = $1
            AND u.is_active = 1
            AND ($2::uuid IS NULL OR fd.id = $2::uuid)
          ORDER BY uac.last_accessed_at DESC NULLS LAST, fd.created_at ASC
          LIMIT 1`,
        [decoded.user.id, scopedFinanceId]
      );

      if (rows.length > 0) {
        const realOwner = {
          id: rows[0].owner_id,
          username: rows[0].owner_username,
        };
        return {
          owner: realOwner,
          user: {
            ...decoded.user,
            id: userValidation.userRow.id,
            username: userValidation.userRow.username,
            email: userValidation.userRow.email,
            role: 'owner',
          },
          isOwner: true,
          authMode: userValidation.authMode,
        };
      }

      // User token is valid, but user does NOT hold owner role for the requested/active finance
      lastAuthFailure = {
        status: 403,
        error: 'Access denied. Strictly restricted to account Owner.',
        error_code: 'OWNER_ROLE_REQUIRED',
      };
      continue;
    }

    // Case C: Legacy Owner ID in decoded root
    if (decoded?.id && !decoded.user && isValidUuid(String(decoded.id))) {
      const { rows } = await db.query(
        'SELECT id, username, password, is_active FROM owner WHERE id = $1 AND is_active = 1 LIMIT 1',
        [decoded.id]
      );
      if (rows.length > 0) {
        if (decoded.pwdFp && decoded.pwdFp !== computePasswordFingerprint(rows[0].password)) {
          lastAuthFailure = {
            status: 401,
            error: 'License password was changed. Please sign in again.',
            error_code: 'PASSWORD_CHANGED',
          };
          continue;
        }
        return {
          owner: { id: rows[0].id, username: rows[0].username },
          user: { id: rows[0].id, username: rows[0].username, role: 'owner' },
          isOwner: true,
          authMode: 'license',
        };
      }
    }
  }

  return (
    lastAuthFailure || {
      status: 403,
      error: 'Access denied. Strictly restricted to account Owner.',
      error_code: 'OWNER_ROLE_REQUIRED',
    }
  );
};

// ─── Owner-Only Access Control Middleware ────────────────────────────────────
const ownerOnly = async (req, res, next) => {
  try {
    const result = await resolveOwnerFromRequest(req);
    if (!result.isOwner) {
      return res.status(result.status || 403).json({
        success: false,
        error: result.error,
        message: result.error,
        error_code: result.error_code,
      });
    }

    req.owner = result.owner;
    req.user = result.user;
    req.isOwner = true;
    req.authMode = result.authMode || 'license';
    return next();
  } catch (error) {
    console.error('ownerOnly middleware error:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Owner authorization verification failed',
    });
  }
};

// ─── Owner Finance Context & Ownership Guard ──────────────────────────────────
const ownerCheckFinance = async (req, res, next) => {
  try {
    const result = await resolveOwnerFromRequest(req);
    if (!result.isOwner) {
      return res.status(result.status || 403).json({
        success: false,
        error: result.error,
        message: result.error,
        error_code: result.error_code,
      });
    }

    req.owner = result.owner;
    req.user = result.user;
    req.isOwner = true;
    req.authMode = result.authMode || 'license';

    // Resolve target finance ID from header, params, query, or body
    let financeId =
      req.headers['finance-id'] ||
      req.headers['Finance-ID'] ||
      req.params.financeId ||
      req.params.id ||
      req.query.financeId ||
      req.query.finance_id ||
      req.body?.financeId ||
      req.body?.finance_id;

    if (
      !financeId ||
      String(financeId).trim() === '' ||
      financeId === 'undefined' ||
      financeId === 'null' ||
      !isValidUuid(String(financeId))
    ) {
      const { rows: defaultFinances } = await db.query(
        'SELECT id, finance_name, is_active FROM finance_detail WHERE owner_id = $1 AND is_active = 1 ORDER BY created_at ASC LIMIT 1',
        [req.owner.id]
      );
      if (defaultFinances.length > 0) {
        financeId = defaultFinances[0].id;
      } else {
        return res.status(404).json({
          success: false,
          error: 'No active finance company found for this owner account.',
          error_code: 'FINANCE_NOT_FOUND',
        });
      }
    }

    const normalizedFinanceId = String(financeId).trim();

    // STRICT OWNERSHIP VERIFICATION: Finance MUST belong to this authenticated owner
    const { rows: financeRows } = await db.query(
      'SELECT id, finance_name, is_active, owner_id FROM finance_detail WHERE id = $1 AND owner_id = $2 AND is_active = 1',
      [normalizedFinanceId, req.owner.id]
    );

    if (financeRows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You do not have owner authority over this finance company or it is inactive.',
        error_code: 'FINANCE_ACCESS_DENIED',
      });
    }

    req.financeId = normalizedFinanceId;
    req.finance = financeRows[0];
    return next();
  } catch (err) {
    console.error('ownerCheckFinance error:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: 'Finance ownership verification failed',
    });
  }
};

module.exports = {
  authMiddleware,
  ownerOnly,
  ownerCheckFinance,
  checkFinance,
  enhancedCheckFinance,
  resolveOwnerFromRequest,
};

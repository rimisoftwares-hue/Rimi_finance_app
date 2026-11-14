const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const REVOKED_LOGOUT_REASONS = new Set(['manual', 'password_changed', 'revoked']);
const MAX_TRACKED_FAMILIES = 10000;

/**
 * In-memory refresh-token rotation & replay detection ledger.
 * Keyed by familyId -> {
 *   userId,
 *   anchorSessionId,
 *   activeJti,
 *   rotationGen,
 *   revoked,
 *   updatedAt
 * }
 * Persistent revocation across backend restarts is anchored in PostgreSQL
 * (`users.is_active`, `users.password` HMAC fingerprint, `user_allowed_companies.is_active`,
 * `finance_detail.is_active`, `owner.is_active`, and `agent_login_sessions.logout_reason`).
 */
const refreshFamilyLedger = new Map();

function getJwtSecret() {
  return process.env.JWT_SECRET || 'your-secret-key';
}

function getRefreshSecret() {
  if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.trim()) {
    return process.env.JWT_REFRESH_SECRET.trim();
  }
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update('autofinex:user-refresh-token:v1')
    .digest('hex');
}

function getDirectAccessTokenTtl() {
  return process.env.DIRECT_USER_ACCESS_TOKEN_TTL || '1h';
}

function getLicenseUserAccessTokenTtl() {
  return process.env.LICENSE_USER_ACCESS_TOKEN_TTL || '12h';
}

function getDirectRefreshTokenTtl() {
  return process.env.DIRECT_USER_REFRESH_TOKEN_TTL || '90d';
}

function getOwnerLicenseTokenTtl() {
  return process.env.OWNER_LICENSE_TOKEN_TTL || '90d';
}

/**
 * Computes a non-reversible keyed fingerprint of a stored password hash.
 * Any password change or reset produces a new bcrypt salt/hash and immediately
 * invalidates all previously issued access and refresh tokens without clock-skew issues.
 */
function computePasswordFingerprint(storedPasswordHash) {
  if (!storedPasswordHash) return null;
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`autofinex:pwd-fp:v1:${String(storedPasswordHash)}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Checks whether the current IST time falls within [fromStr, toStr].
 * Supports both normal windows (09:00 - 18:00) and overnight windows (22:00 - 06:00).
 */
function isWithinLoginWindow(fromStr, toStr, nowDate = new Date()) {
  if (!fromStr || !toStr) return true;

  const parseMinutes = (t) => {
    const parts = String(t).split(':').map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return null;
    }
    return parts[0] * 60 + parts[1];
  };

  const fromMin = parseMinutes(fromStr);
  const toMin = parseMinutes(toStr);
  if (fromMin === null || toMin === null) return true;

  const istString = nowDate.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [curH, curM] = istString.split(':').map(Number);
  const curMin = curH * 60 + curM;

  if (fromMin <= toMin) {
    return curMin >= fromMin && curMin <= toMin;
  }
  return curMin >= fromMin || curMin <= toMin;
}

function pruneFamilyLedgerIfNeeded() {
  if (refreshFamilyLedger.size <= MAX_TRACKED_FAMILIES) return;
  const entries = Array.from(refreshFamilyLedger.entries()).sort(
    (a, b) => a[1].updatedAt - b[1].updatedAt
  );
  const toDelete = Math.max(1, Math.floor(MAX_TRACKED_FAMILIES * 0.1));
  for (let i = 0; i < toDelete && i < entries.length; i += 1) {
    refreshFamilyLedger.delete(entries[i][0]);
  }
}

function issueOwnerLicenseToken(ownerRow) {
  const pwdFp = computePasswordFingerprint(ownerRow.password);
  return jwt.sign(
    {
      tokenType: 'owner_license',
      authMode: 'license',
      pwdFp,
      jti: crypto.randomUUID(),
      owner: {
        id: ownerRow.id,
        username: ownerRow.username,
      },
    },
    getJwtSecret(),
    { expiresIn: getOwnerLicenseTokenTtl() }
  );
}

function issueUserAccessToken({
  user,
  role,
  allowedCompanies,
  currentFinanceId,
  financeName,
  sessionId,
  anchorSessionId,
  authMode = 'license',
  pwdFp = null,
}) {
  const normalizedMode = authMode === 'direct_user' ? 'direct_user' : 'license';
  const effectiveAnchor = anchorSessionId || sessionId || null;
  const resolvedPwdFp =
    pwdFp || (user.password ? computePasswordFingerprint(user.password) : undefined);

  const payload = {
    tokenType: 'user_access',
    authMode: normalizedMode,
    jti: crypto.randomUUID(),
    ...(resolvedPwdFp ? { pwdFp: resolvedPwdFp } : {}),
    user: {
      id: user.id,
      sessionId: sessionId || null,
      anchorSessionId: effectiveAnchor,
      email: user.email,
      username: user.username,
      role,
      allowed_companies: Array.isArray(allowedCompanies) ? allowedCompanies : [],
      current_finance_id: currentFinanceId ? String(currentFinanceId) : null,
      finance_name: financeName || undefined,
    },
  };

  const expiresIn =
    normalizedMode === 'direct_user'
      ? getDirectAccessTokenTtl()
      : getLicenseUserAccessTokenTtl();

  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

function issueUserRefreshToken({
  userId,
  anchorSessionId,
  currentSessionId,
  currentFinanceId,
  passwordHash,
  pwdFp: explicitPwdFp,
  familyId: existingFamilyId,
  rotationGen = 1,
  deviceName = null,
  platform = null,
}) {
  const familyId = existingFamilyId || crypto.randomUUID();
  const jti = crypto.randomUUID();
  const pwdFp = explicitPwdFp || computePasswordFingerprint(passwordHash);

  pruneFamilyLedgerIfNeeded();
  refreshFamilyLedger.set(familyId, {
    userId: String(userId),
    anchorSessionId: anchorSessionId ? String(anchorSessionId) : null,
    activeJti: jti,
    rotationGen,
    revoked: false,
    updatedAt: Date.now(),
  });

  const token = jwt.sign(
    {
      tokenType: 'user_refresh',
      authMode: 'direct_user',
      sub: String(userId),
      anchorSessionId: anchorSessionId ? String(anchorSessionId) : null,
      currentSessionId: currentSessionId ? String(currentSessionId) : null,
      currentFinanceId: currentFinanceId ? String(currentFinanceId) : null,
      familyId,
      rotationGen,
      jti,
      ...(pwdFp ? { pwdFp } : {}),
      deviceName: deviceName || null,
      platform: platform || null,
    },
    getRefreshSecret(),
    { expiresIn: getDirectRefreshTokenTtl() }
  );

  return { refreshToken: token, familyId, jti, rotationGen };
}

function revokeFamiliesInMemory({ userId = null, anchorSessionId = null, familyId = null, excludeAnchorSessionId = null }) {
  if (familyId && refreshFamilyLedger.has(familyId)) {
    const entry = refreshFamilyLedger.get(familyId);
    entry.revoked = true;
    entry.updatedAt = Date.now();
  }

  for (const [, entry] of refreshFamilyLedger.entries()) {
    if (anchorSessionId && entry.anchorSessionId === String(anchorSessionId)) {
      entry.revoked = true;
      entry.updatedAt = Date.now();
    } else if (userId && entry.userId === String(userId)) {
      if (excludeAnchorSessionId && entry.anchorSessionId === String(excludeAnchorSessionId)) {
        continue;
      }
      entry.revoked = true;
      entry.updatedAt = Date.now();
    }
  }
}

/**
 * Marks session record(s) in `agent_login_sessions` as revoked/closed without
 * corrupting historical `logout_time` or `duration_seconds` on already-closed shifts.
 */
async function markSessionsRevokedInDb(dbClient, { userId, sessionIds = [], reason = 'revoked' }) {
  const validIds = Array.from(
    new Set(
      sessionIds
        .filter((id) => typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id.trim()))
        .map((id) => id.trim())
    )
  );
  if (!userId || validIds.length === 0) return;

  await dbClient.query(
    `UPDATE agent_login_sessions
        SET logout_time = COALESCE(logout_time, CURRENT_TIMESTAMP),
            duration_seconds = CASE
              WHEN logout_time IS NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))::int)
              ELSE duration_seconds
            END,
            logout_reason = $3
      WHERE user_id = $1::uuid
        AND id = ANY($2::uuid[])`,
    [userId, validIds, reason]
  );
}

/**
 * Validates an Owner/License JWT decoded payload against live PostgreSQL `owner` state.
 */
async function validateOwnerPrincipal(dbClient, decoded) {
  const ownerClaim = decoded?.owner;
  if (!ownerClaim?.id) {
    return { valid: false, status: 401, error_code: 'INVALID_OWNER_TOKEN', message: 'Invalid owner token' };
  }

  const { rows } = await dbClient.query(
    'SELECT id, username, password, is_active FROM owner WHERE id = $1 LIMIT 1',
    [ownerClaim.id]
  );

  if (rows.length === 0 || Number(rows[0].is_active) !== 1) {
    return {
      valid: false,
      status: 401,
      error_code: 'LICENSE_INACTIVE',
      message: 'License account is inactive or no longer valid',
    };
  }

  const ownerRow = rows[0];
  if (decoded.pwdFp) {
    const currentFp = computePasswordFingerprint(ownerRow.password);
    if (decoded.pwdFp !== currentFp) {
      return {
        valid: false,
        status: 401,
        error_code: 'PASSWORD_CHANGED',
        message: 'License password was changed. Please sign in again.',
      };
    }
  }

  return {
    valid: true,
    owner: {
      id: ownerRow.id,
      username: ownerRow.username,
    },
    ownerRow,
  };
}

/**
 * Validates a User decoded JWT payload against live PostgreSQL user, session,
 * company membership, finance company, and License (`owner`) status.
 */
async function validateUserPrincipal(
  dbClient,
  decoded,
  {
    targetFinanceId = null,
    requireFinanceContext = false,
    enforceLoginWindow = true,
    enforceOpenAttendanceInLicenseMode = false,
    allowZeroMemberships = false,
  } = {}
) {
  if (decoded?.tokenType === 'user_refresh') {
    return {
      valid: false,
      status: 401,
      error_code: 'INVALID_TOKEN_TYPE',
      message: 'Refresh token cannot be used as an access token',
    };
  }

  const userClaim = decoded?.user;
  if (!userClaim?.id) {
    return {
      valid: false,
      status: 401,
      error_code: 'INVALID_TOKEN',
      message: 'Invalid user token',
    };
  }

  const userRes = await dbClient.query(
    'SELECT id, username, email, phone_no, password, is_active, created_at FROM users WHERE id = $1 LIMIT 1',
    [userClaim.id]
  );

  if (userRes.rows.length === 0 || Number(userRes.rows[0].is_active) !== 1) {
    return {
      valid: false,
      status: 401,
      error_code: 'USER_INACTIVE',
      message: 'User account is inactive or disabled',
    };
  }

  const userRow = userRes.rows[0];

  if (decoded.pwdFp) {
    const currentFp = computePasswordFingerprint(userRow.password);
    if (decoded.pwdFp !== currentFp) {
      return {
        valid: false,
        status: 401,
        error_code: 'PASSWORD_CHANGED',
        message: 'Password has been changed. Please sign in again.',
      };
    }
  }

  const authMode = decoded.authMode === 'direct_user' ? 'direct_user' : 'license';
  const sessionId = userClaim.sessionId || null;
  const anchorSessionId = userClaim.anchorSessionId || sessionId || null;

  // Check session revocation in agent_login_sessions
  const sessionIdsToCheck = Array.from(
    new Set([sessionId, anchorSessionId].filter((id) => typeof id === 'string' && id.length > 0))
  );

  if (sessionIdsToCheck.length > 0) {
    const sessRes = await dbClient.query(
      `SELECT id, logout_time, logout_reason
         FROM agent_login_sessions
        WHERE user_id = $1::uuid
          AND id = ANY($2::uuid[])`,
      [userRow.id, sessionIdsToCheck]
    );
    const byId = new Map(sessRes.rows.map((r) => [String(r.id), r]));

    if (anchorSessionId) {
      const anchorRow = byId.get(String(anchorSessionId));
      if (!anchorRow) {
        return {
          valid: false,
          status: 401,
          error_code: 'SESSION_REVOKED',
          message: 'Session is no longer valid',
        };
      }
      if (anchorRow.logout_reason && REVOKED_LOGOUT_REASONS.has(String(anchorRow.logout_reason))) {
        return {
          valid: false,
          status: 401,
          error_code: 'SESSION_REVOKED',
          message: 'Session has been logged out or revoked',
        };
      }
    }

    if (sessionId) {
      const currentRow = byId.get(String(sessionId));
      if (!currentRow) {
        return {
          valid: false,
          status: 401,
          error_code: 'SESSION_REVOKED',
          message: 'Session is no longer valid',
        };
      }
      if (currentRow.logout_reason && REVOKED_LOGOUT_REASONS.has(String(currentRow.logout_reason))) {
        return {
          valid: false,
          status: 401,
          error_code: 'SESSION_REVOKED',
          message: 'Session has been logged out or revoked',
        };
      }
      if (authMode === 'license' && enforceOpenAttendanceInLicenseMode && currentRow.logout_time !== null) {
        return {
          valid: false,
          status: 401,
          error_code: 'SESSION_EXPIRED',
          message: 'User session has expired',
        };
      }
    }
  }

  // Resolve permitted active companies (and verify finance + owner license active status)
  const membershipsRes = await dbClient.query(
    `SELECT uac.finance_id,
            uac.role,
            uac.login_time_from,
            uac.login_time_to,
            uac.last_accessed_at,
            fd.finance_name,
            fd.owner_id,
            fd.is_active AS finance_is_active,
            o.username AS owner_username,
            o.is_active AS owner_is_active
       FROM user_allowed_companies uac
       INNER JOIN finance_detail fd ON fd.id = uac.finance_id
       INNER JOIN owner o ON o.id = fd.owner_id
      WHERE uac.user_id = $1
        AND uac.is_active = 1
      ORDER BY uac.last_accessed_at DESC NULLS LAST, fd.finance_name ASC`,
    [userRow.id]
  );

  const activeMemberships = membershipsRes.rows.filter(
    (m) => Number(m.finance_is_active) === 1 && Number(m.owner_is_active) === 1
  );

  if (activeMemberships.length === 0) {
    if (allowZeroMemberships && !requireFinanceContext && !targetFinanceId) {
      return {
        valid: true,
        authMode,
        userRow,
        memberships: [],
        selectedMembership: null,
        allowedCompanies: [],
      };
    }
    const hasInactiveOwner = membershipsRes.rows.some(
      (m) => Number(m.finance_is_active) === 1 && Number(m.owner_is_active) !== 1
    );
    return {
      valid: false,
      status: hasInactiveOwner ? 401 : 403,
      error_code: hasInactiveOwner ? 'LICENSE_INACTIVE' : 'NO_ACTIVE_FINANCE_ACCESS',
      message: hasInactiveOwner
        ? 'The associated License is inactive'
        : 'User does not have access to any active finance company',
    };
  }

  const effectiveFinanceId = targetFinanceId || userClaim.current_finance_id || null;
  if (!effectiveFinanceId && !requireFinanceContext) {
    return {
      valid: true,
      authMode,
      userRow,
      memberships: activeMemberships,
      selectedMembership: activeMemberships[0],
      allowedCompanies: activeMemberships.map((m) => String(m.finance_id)),
    };
  }

  if (!effectiveFinanceId && requireFinanceContext) {
    return {
      valid: false,
      status: 400,
      error_code: 'FINANCE_CONTEXT_MISSING',
      message: 'Finance context missing',
    };
  }

  const matchedMembership = activeMemberships.find(
    (m) => String(m.finance_id) === String(effectiveFinanceId)
  );

  if (!matchedMembership) {
    // Distinguish inactive license vs unauthorized/inactive finance company
    const rawMatch = membershipsRes.rows.find(
      (m) => String(m.finance_id) === String(effectiveFinanceId)
    );
    if (rawMatch && Number(rawMatch.owner_is_active) !== 1) {
      return {
        valid: false,
        status: 401,
        error_code: 'LICENSE_INACTIVE',
        message: 'The associated License is inactive',
      };
    }
    if (rawMatch && Number(rawMatch.finance_is_active) !== 1) {
      return {
        valid: false,
        status: 404,
        error_code: 'FINANCE_NOT_FOUND',
        message: 'Finance company not found or inactive',
      };
    }
    return {
      valid: false,
      status: 403,
      error_code: 'FINANCE_ACCESS_DENIED',
      message: 'Not authorized for this finance company',
    };
  }

  const role = matchedMembership.role;
  if (enforceLoginWindow && role !== 'owner' && role !== 'admin') {
    const allowedFrom = matchedMembership.login_time_from
      ? String(matchedMembership.login_time_from).slice(0, 5)
      : null;
    const allowedTo = matchedMembership.login_time_to
      ? String(matchedMembership.login_time_to).slice(0, 5)
      : null;

    if (!isWithinLoginWindow(matchedMembership.login_time_from, matchedMembership.login_time_to)) {
      return {
        valid: false,
        status: 403,
        error_code: 'LOGIN_TIME_RESTRICTED',
        message: `Access restricted outside allowed login hours (${allowedFrom} - ${allowedTo})`,
        allowed_from: allowedFrom,
        allowed_to: allowedTo,
      };
    }
  }

  return {
    valid: true,
    authMode,
    userRow,
    memberships: activeMemberships,
    selectedMembership: matchedMembership,
    allowedCompanies: activeMemberships.map((m) => String(m.finance_id)),
  };
}

/**
 * Verifies a Direct User refresh token, detects token replay, validates all live
 * database security invariants, ensures an active attendance session when requested,
 * and rotates the refresh token.
 */
async function verifyAndRotateRefreshSession(
  dbClient,
  rawRefreshToken,
  { ipAddress = null, ensureAttendanceSession = true } = {}
) {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    return {
      valid: false,
      status: 401,
      error_code: 'REFRESH_TOKEN_REQUIRED',
      message: 'Refresh token is required',
    };
  }

  let decoded;
  try {
    decoded = jwt.verify(rawRefreshToken, getRefreshSecret());
  } catch (err) {
    const isExpired = err && err.name === 'TokenExpiredError';
    return {
      valid: false,
      status: 401,
      error_code: isExpired ? 'REFRESH_TOKEN_EXPIRED' : 'INVALID_REFRESH_TOKEN',
      message: isExpired ? 'Session expired. Please sign in again.' : 'Invalid session token',
    };
  }

  if (decoded?.tokenType !== 'user_refresh' || !decoded?.sub || !decoded?.familyId || !decoded?.jti) {
    return {
      valid: false,
      status: 401,
      error_code: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token payload',
    };
  }

  const userId = String(decoded.sub);
  const familyId = String(decoded.familyId);
  const anchorSessionId = decoded.anchorSessionId ? String(decoded.anchorSessionId) : null;
  const currentSessionId = decoded.currentSessionId ? String(decoded.currentSessionId) : anchorSessionId;

  // Replay & family revocation check
  const trackedFamily = refreshFamilyLedger.get(familyId);
  if (trackedFamily) {
    if (trackedFamily.revoked) {
      return {
        valid: false,
        status: 401,
        error_code: 'SESSION_REVOKED',
        message: 'Session has been revoked',
      };
    }
    if (trackedFamily.activeJti !== decoded.jti) {
      // Refresh token replay detected -> revoke entire family & DB session immediately
      trackedFamily.revoked = true;
      trackedFamily.updatedAt = Date.now();
      await markSessionsRevokedInDb(dbClient, {
        userId,
        sessionIds: [anchorSessionId, currentSessionId],
        reason: 'revoked',
      });
      return {
        valid: false,
        status: 401,
        error_code: 'SESSION_REVOKED',
        message: 'Session revoked due to refresh token replay detection',
      };
    }
  }

  // Synthesize decoded user structure to run full DB validation
  const syntheticDecoded = {
    tokenType: 'user_access',
    authMode: 'direct_user',
    pwdFp: decoded.pwdFp,
    user: {
      id: userId,
      sessionId: currentSessionId,
      anchorSessionId,
      current_finance_id: decoded.currentFinanceId || null,
    },
  };

  let validation = await validateUserPrincipal(dbClient, syntheticDecoded, {
    targetFinanceId: decoded.currentFinanceId || null,
    requireFinanceContext: false,
    enforceLoginWindow: false,
  });

  // If previously selected finance was removed, check if user still has another active company
  if (
    !validation.valid &&
    validation.error_code === 'FINANCE_ACCESS_DENIED' &&
    decoded.currentFinanceId
  ) {
    validation = await validateUserPrincipal(dbClient, {
      ...syntheticDecoded,
      user: { ...syntheticDecoded.user, current_finance_id: null },
    }, {
      targetFinanceId: null,
      requireFinanceContext: false,
      enforceLoginWindow: false,
    });
  }

  if (!validation.valid) {
    if (['USER_INACTIVE', 'LICENSE_INACTIVE', 'PASSWORD_CHANGED', 'SESSION_REVOKED', 'NO_ACTIVE_FINANCE_ACCESS'].includes(validation.error_code)) {
      revokeFamiliesInMemory({ familyId, anchorSessionId });
      await markSessionsRevokedInDb(dbClient, {
        userId,
        sessionIds: [anchorSessionId, currentSessionId],
        reason: validation.error_code === 'PASSWORD_CHANGED' ? 'password_changed' : 'revoked',
      });
    }
    return validation;
  }

  // Pick a company that satisfies login window (preferring selectedMembership)
  let chosenMembership = validation.selectedMembership;
  if (
    chosenMembership.role !== 'owner' &&
    chosenMembership.role !== 'admin' &&
    !isWithinLoginWindow(chosenMembership.login_time_from, chosenMembership.login_time_to)
  ) {
    const openAlt = validation.memberships.find(
      (m) =>
        m.role === 'owner' ||
        m.role === 'admin' ||
        isWithinLoginWindow(m.login_time_from, m.login_time_to)
    );
    if (!openAlt) {
      const allowedFrom = chosenMembership.login_time_from
        ? String(chosenMembership.login_time_from).slice(0, 5)
        : null;
      const allowedTo = chosenMembership.login_time_to
        ? String(chosenMembership.login_time_to).slice(0, 5)
        : null;
      return {
        valid: false,
        status: 403,
        error_code: 'LOGIN_TIME_RESTRICTED',
        message: `Access restricted outside allowed login hours (${allowedFrom} - ${allowedTo})`,
        allowed_from: allowedFrom,
        allowed_to: allowedTo,
      };
    }
    chosenMembership = openAlt;
  }

  // Ensure an open attendance session row in `agent_login_sessions`
  let activeSessionId = currentSessionId;
  let attendanceRenewed = false;

  if (ensureAttendanceSession) {
    if (activeSessionId) {
      const touchRes = await dbClient.query(
        `UPDATE agent_login_sessions
            SET last_seen_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
            AND user_id = $2::uuid
            AND logout_time IS NULL`,
        [activeSessionId, userId]
      );
      if (touchRes.rowCount === 0) {
        activeSessionId = null;
      }
    }

    if (!activeSessionId) {
      const insertRes = await dbClient.query(
        `INSERT INTO agent_login_sessions (
           user_id, device_name, platform, ip_address, location_source, flagged
         ) VALUES ($1, $2, $3, $4, 'none', false)
         RETURNING id`,
        [
          userId,
          decoded.deviceName || 'Desktop App (Resumed)',
          decoded.platform || 'Web',
          ipAddress || null,
        ]
      );
      activeSessionId = insertRes.rows[0]?.id || anchorSessionId;
      attendanceRenewed = true;
    }
  }

  const effectiveAnchorId = anchorSessionId || activeSessionId;
  const pwdFp = computePasswordFingerprint(validation.userRow.password);
  const nextGen = (Number(decoded.rotationGen) || 1) + 1;

  const accessToken = issueUserAccessToken({
    user: validation.userRow,
    role: chosenMembership.role,
    allowedCompanies: validation.allowedCompanies,
    currentFinanceId: chosenMembership.finance_id,
    financeName: chosenMembership.finance_name,
    sessionId: activeSessionId,
    anchorSessionId: effectiveAnchorId,
    authMode: 'direct_user',
    pwdFp,
  });

  const rotated = issueUserRefreshToken({
    userId,
    anchorSessionId: effectiveAnchorId,
    currentSessionId: activeSessionId,
    currentFinanceId: chosenMembership.finance_id,
    pwdFp,
    familyId,
    rotationGen: nextGen,
    deviceName: decoded.deviceName || null,
    platform: decoded.platform || null,
  });

  return {
    valid: true,
    accessToken,
    refreshToken: rotated.refreshToken,
    sessionId: activeSessionId,
    anchorSessionId: effectiveAnchorId,
    attendanceRenewed,
    userRow: validation.userRow,
    selectedMembership: chosenMembership,
    memberships: validation.memberships,
    allowedCompanies: validation.allowedCompanies,
  };
}

module.exports = {
  REVOKED_LOGOUT_REASONS,
  getJwtSecret,
  getRefreshSecret,
  computePasswordFingerprint,
  isWithinLoginWindow,
  issueOwnerLicenseToken,
  issueUserAccessToken,
  issueUserRefreshToken,
  revokeFamiliesInMemory,
  markSessionsRevokedInDb,
  validateOwnerPrincipal,
  validateUserPrincipal,
  verifyAndRotateRefreshSession,
};

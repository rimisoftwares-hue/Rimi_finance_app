const crypto = require('crypto');
const { db } = require('../../config/database.config');

const MAX_ACTIVE_CODES_PER_COMPANY = 5;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_REGEX = /^AFX-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const VALID_INVITE_ROLES = new Set(['admin', 'agent', 'staff']);
const ADMIN_ALLOWED_INVITE_ROLES = new Set(['agent', 'staff']);

const GENERIC_REDEEM_ERROR = 'Invalid or expired invite code';

// ── Transaction Helper (using db.getConnection()) ──────────────────────────
async function beginTransaction() {
  const client = await db.getConnection();
  try {
    await client.beginTransaction();
  } catch (err) {
    client.release();
    throw err;
  }
  let released = false;
  const safeRelease = () => {
    if (!released) {
      released = true;
      client.release();
    }
  };
  return {
    query: (text, params) => client.query(text, params),
    commit: async () => {
      try {
        await client.commit();
      } finally {
        safeRelease();
      }
    },
    rollback: async () => {
      try {
        await client.rollback();
      } catch {
        // ignore rollback error
      } finally {
        safeRelease();
      }
    },
  };
}

// ── Custom HTTP Error ──────────────────────────────────────────────────────
class InvitationError extends Error {
  constructor(statusCode, message, code = 'INVITATION_ERROR') {
    super(message);
    this.name = 'InvitationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// ── In-Memory Rate Limiters ────────────────────────────────────────────────
const searchRateBuckets = new Map();
const redeemRateBuckets = new Map();

function checkRateLimit(bucketMap, key, maxRequests, windowMs, errorMessage) {
  const now = Date.now();
  const entry = bucketMap.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    bucketMap.set(key, { windowStart: now, count: 1 });
    return;
  }
  if (entry.count >= maxRequests) {
    throw new InvitationError(429, errorMessage, 'RATE_LIMITED');
  }
  entry.count += 1;
}

function resetRateLimitersForTests() {
  searchRateBuckets.clear();
  redeemRateBuckets.clear();
}

// ── Formatting & Masking Helpers ───────────────────────────────────────────
function normalizePhoneInput(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { valid: false, normalized: '' };
  }
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!/^\d{10}$/.test(digits)) {
    return { valid: false, normalized: digits };
  }
  return { valid: true, normalized: digits };
}

function normalizeEmailInput(raw) {
  if (typeof raw !== 'string') {
    return { valid: false, normalized: '' };
  }
  const normalized = raw.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    return { valid: false, normalized };
  }
  return { valid: true, normalized };
}

function maskPhone(phone) {
  if (!phone) return '**********';
  const digits = String(phone).replace(/\D/g, '');
  const clean = digits.length >= 10 ? digits.slice(-10) : digits;
  if (clean.length < 4) return '**********';
  return `${clean.slice(0, 2)}******${clean.slice(-2)}`;
}

function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return '***@***';
  }
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!local) return `***@${domain}`;
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function formatTimeHHMM(val) {
  if (!val) return undefined;
  const str = String(val).trim();
  const parts = str.split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return str;
}

function validateLoginWindow(loginTimeFrom, loginTimeTo) {
  const from = loginTimeFrom ? String(loginTimeFrom).trim() : null;
  const to = loginTimeTo ? String(loginTimeTo).trim() : null;

  if (from && !TIME_REGEX.test(from)) {
    throw new InvitationError(400, 'Invalid loginTimeFrom format (expected HH:MM)', 'INVALID_TIME');
  }
  if (to && !TIME_REGEX.test(to)) {
    throw new InvitationError(400, 'Invalid loginTimeTo format (expected HH:MM)', 'INVALID_TIME');
  }
  if (from && to) {
    const fromHHMM = formatTimeHHMM(from);
    const toHHMM = formatTimeHHMM(to);
    if (fromHHMM >= toHHMM) {
      throw new InvitationError(
        400,
        'Login end time must be later than login start time',
        'INVALID_TIME_RANGE'
      );
    }
  }
  return {
    from: from ? formatTimeHHMM(from) : null,
    to: to ? formatTimeHHMM(to) : null,
  };
}

function generateServerInviteCode() {
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i += 1) {
    part1 += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    part2 += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return `AFX-${part1}-${part2}`;
}

function generateInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

function toIsoString(val) {
  if (!val) return undefined;
  if (val instanceof Date) return val.toISOString();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toISOString();
}

// ── Derived Status Computation ─────────────────────────────────────────────
function computeDerivedStatusFromRow(row) {
  const inviteType = row.invite_type || 'direct';
  const dbStatus = row.status;
  const isExpiredByDb = Boolean(row.is_expired_now) || dbStatus === 'expired';
  const usedCount = Number(row.used_count || 0);
  const maxUses = row.max_uses !== null && row.max_uses !== undefined ? Number(row.max_uses) : null;

  if (inviteType === 'code') {
    if (dbStatus === 'cancelled' || row.revoked_at) {
      return 'deactivated_cancelled';
    }
    if (dbStatus === 'exhausted' || (maxUses !== null && usedCount >= maxUses)) {
      return 'deactivated_limit_reached';
    }
    if (isExpiredByDb) {
      return 'expired';
    }
    return 'active';
  }

  // Direct invite
  if (dbStatus === 'accepted') return 'accepted';
  if (dbStatus === 'declined') return 'declined';
  if (dbStatus === 'cancelled' || row.revoked_at) return 'cancelled';
  if (isExpiredByDb) return 'expired';
  return 'pending';
}

function serializeInvitationRow(row, redemptions = []) {
  const derivedStatus = computeDerivedStatusFromRow(row);
  const inviteType = row.invite_type || 'direct';
  const invitedByRole = row.invited_by_owner_id
    ? 'owner'
    : row.inviter_company_role === 'owner'
      ? 'owner'
      : 'admin';

  const invitedByName =
    row.inviter_staff_name ||
    row.inviter_username ||
    row.inviter_owner_username ||
    (invitedByRole === 'owner' ? 'Owner' : 'Admin');

  let targetUser;
  if (inviteType === 'direct' && row.user_id) {
    targetUser = {
      id: String(row.user_id),
      username: row.target_username || 'user',
      displayName: row.target_staff_name || row.target_username || 'User',
      maskedPhone: maskPhone(row.target_phone_no),
      maskedEmail: maskEmail(row.target_email),
    };
  }

  return {
    id: String(row.id),
    inviteType,
    financeId: String(row.finance_id),
    financeName: row.finance_name || 'Finance Company',
    role: row.assigned_role,
    assignedRole: row.assigned_role,
    status: derivedStatus,
    derivedStatus,
    dbStatus: row.status,
    code: inviteType === 'code' ? row.invitation_code || undefined : undefined,
    invitationCode: row.invitation_code || null,
    maxUses: row.max_uses !== null && row.max_uses !== undefined ? Number(row.max_uses) : null,
    usedCount: Number(row.used_count || 0),
    redemptions,
    targetUser,
    invitedByRole,
    invitedByName,
    createdByName: invitedByName,
    invitedByUserId: row.invited_by ? String(row.invited_by) : null,
    invitedByOwnerId: row.invited_by_owner_id ? String(row.invited_by_owner_id) : null,
    staffCode: row.staff_code || undefined,
    loginTimeFrom: formatTimeHHMM(row.login_time_from),
    loginTimeTo: formatTimeHHMM(row.login_time_to),
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    acceptedAt: toIsoString(row.accepted_at),
    respondedAt: toIsoString(row.accepted_at || row.revoked_at) || null,
    revokedAt: toIsoString(row.revoked_at),
  };
}

// ── Caller Context Verification (Company-Scoped) ───────────────────────────
async function resolveCompanyCallerContext(req, queryRunner = db) {
  const financeId = req.financeId ? String(req.financeId).trim() : '';
  if (!UUID_REGEX.test(financeId)) {
    throw new InvitationError(400, 'Valid finance-id header is required', 'INVALID_FINANCE_ID');
  }

  const [finRows] = await queryRunner.query(
    `SELECT id, owner_id, finance_name, is_active
     FROM finance_detail
     WHERE id = $1::uuid AND is_active = 1
     LIMIT 1`,
    [financeId]
  );

  if (finRows.length === 0) {
    throw new InvitationError(404, 'Finance company not found or inactive', 'FINANCE_NOT_FOUND');
  }
  const finance = finRows[0];

  // Case 1: Authenticated as an Owner account (owner table)
  if (req.isOwner && req.owner?.id) {
    const ownerId = String(req.owner.id).trim();
    if (String(finance.owner_id) !== ownerId) {
      throw new InvitationError(
        403,
        'You do not have permission to manage invitations for this finance company',
        'FORBIDDEN'
      );
    }

    const [ownerRows] = await queryRunner.query(
      `SELECT id, username, is_active FROM owner WHERE id = $1::uuid AND is_active = 1 LIMIT 1`,
      [ownerId]
    );
    if (ownerRows.length === 0) {
      throw new InvitationError(401, 'Owner account is inactive or not found', 'UNAUTHORIZED');
    }

    return {
      financeId: String(finance.id),
      financeName: finance.finance_name,
      financeOwnerId: String(finance.owner_id),
      callerRole: 'owner',
      callerUserId: null,
      callerOwnerId: String(ownerRows[0].id),
      callerDisplayName: ownerRows[0].username || 'Owner',
      rateLimitKey: `owner:${ownerRows[0].id}`,
    };
  }

  // Case 2: Authenticated as a User account (users table)
  const userId = req.user?.id ? String(req.user.id).trim() : '';
  if (!UUID_REGEX.test(userId)) {
    throw new InvitationError(401, 'Authentication required', 'UNAUTHORIZED');
  }

  const [userRows] = await queryRunner.query(
    `SELECT u.id, u.username, u.email, u.phone_no, u.is_active,
            uac.role AS direct_role, uac.is_active AS direct_active,
            EXISTS (
              SELECT 1
              FROM user_allowed_companies uac_owner
              JOIN finance_detail fd_owner ON fd_owner.id = uac_owner.finance_id
              WHERE uac_owner.user_id = u.id
                AND uac_owner.role = 'owner'
                AND uac_owner.is_active = 1
                AND fd_owner.owner_id = $2::uuid
            ) AS is_owner_across_group
     FROM users u
     LEFT JOIN user_allowed_companies uac
       ON uac.user_id = u.id AND uac.finance_id = $3::uuid AND uac.is_active = 1
     WHERE u.id = $1::uuid AND u.is_active = 1
     LIMIT 1`,
    [userId, finance.owner_id, financeId]
  );

  if (userRows.length === 0) {
    throw new InvitationError(401, 'User account is inactive or not found', 'UNAUTHORIZED');
  }

  const caller = userRows[0];
  let effectiveRole = null;
  if (caller.direct_role === 'owner' || caller.is_owner_across_group) {
    effectiveRole = 'owner';
  } else if (caller.direct_role === 'admin') {
    effectiveRole = 'admin';
  }

  if (!effectiveRole) {
    throw new InvitationError(
      403,
      'Only owners and admins of this finance company can manage invitations',
      'FORBIDDEN'
    );
  }

  return {
    financeId: String(finance.id),
    financeName: finance.finance_name,
    financeOwnerId: String(finance.owner_id),
    callerRole: effectiveRole,
    callerUserId: String(caller.id),
    callerOwnerId: null,
    callerDisplayName: caller.username || 'Admin',
    callerEmail: caller.email,
    callerPhone: caller.phone_no,
    rateLimitKey: `user:${caller.id}`,
  };
}

function assertRoleAllowedForCaller(callerRole, assignedRole, actionVerb = 'assign') {
  if (!VALID_INVITE_ROLES.has(assignedRole)) {
    throw new InvitationError(
      400,
      'Invalid role. Allowed invitation roles are admin, agent, or staff.',
      'INVALID_ROLE'
    );
  }
  if (callerRole === 'admin' && !ADMIN_ALLOWED_INVITE_ROLES.has(assignedRole)) {
    throw new InvitationError(
      403,
      `Admins can only ${actionVerb} agent or staff invitations`,
      'FORBIDDEN_ROLE'
    );
  }
}

// ── Target User State Computation ──────────────────────────────────────────
async function evaluateTargetUserState(queryRunner, { financeId, financeOwnerId, callerUserId, targetUser }) {
  const targetUserId = String(targetUser.id);

  // 1. Self check
  if (callerUserId && targetUserId === String(callerUserId)) {
    return { state: 'self' };
  }

  // 2. Check active membership in target finance OR owner status in the finance group
  const [memRows] = await queryRunner.query(
    `SELECT uac.role, uac.is_active,
            EXISTS (
              SELECT 1
              FROM user_allowed_companies uac_o
              JOIN finance_detail fd_o ON fd_o.id = uac_o.finance_id
              WHERE uac_o.user_id = $1::uuid
                AND uac_o.role = 'owner'
                AND uac_o.is_active = 1
                AND fd_o.owner_id = $3::uuid
            ) AS is_group_owner
     FROM (SELECT 1) dummy
     LEFT JOIN user_allowed_companies uac
       ON uac.user_id = $1::uuid AND uac.finance_id = $2::uuid`,
    [targetUserId, financeId, financeOwnerId]
  );

  const mem = memRows[0];
  if (mem?.is_group_owner) {
    // If target user is the group owner and caller is logged in via owner token, this is also self/owner
    if (!callerUserId) {
      return { state: 'self' };
    }
    return { state: 'already_in_company', existingRole: 'owner' };
  }
  if (mem && Number(mem.is_active) === 1) {
    return { state: 'already_in_company', existingRole: mem.role };
  }

  // 3. Check non-expired pending direct invite for (financeId, targetUserId)
  const [pendRows] = await queryRunner.query(
    `SELECT id
     FROM agent_invitations
     WHERE finance_id = $1::uuid
       AND user_id = $2::uuid
       AND invite_type = 'direct'
       AND status = 'pending'
       AND revoked_at IS NULL
       AND deleted_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [financeId, targetUserId]
  );

  if (pendRows.length > 0) {
    return {
      state: 'invite_pending',
      pendingInvitationId: String(pendRows[0].id),
    };
  }

  return { state: 'available' };
}

// ── Fetch Single Detailed Invitation Row ───────────────────────────────────
async function fetchInvitationById(queryRunner, invitationId, financeId = null) {
  const params = [invitationId];
  let financeFilter = '';
  if (financeId) {
    params.push(financeId);
    financeFilter = `AND ai.finance_id = $2::uuid`;
  }

  const [rows] = await queryRunner.query(
    `SELECT ai.*,
            (ai.expires_at <= NOW()) AS is_expired_now,
            fd.finance_name,
            fd.owner_id AS finance_owner_id,
            tu.username AS target_username,
            tu.email AS target_email,
            tu.phone_no AS target_phone_no,
            tud.staff_name AS target_staff_name,
            iu.username AS inviter_username,
            iud.staff_name AS inviter_staff_name,
            iuac.role AS inviter_company_role,
            io.username AS inviter_owner_username
     FROM agent_invitations ai
     JOIN finance_detail fd ON fd.id = ai.finance_id
     LEFT JOIN users tu ON tu.id = ai.user_id
     LEFT JOIN users_details tud ON tud.user_id = ai.user_id AND tud.finance_id = ai.finance_id
     LEFT JOIN users iu ON iu.id = ai.invited_by
     LEFT JOIN users_details iud ON iud.user_id = ai.invited_by AND iud.finance_id = ai.finance_id
     LEFT JOIN user_allowed_companies iuac ON iuac.user_id = ai.invited_by AND iuac.finance_id = ai.finance_id
     LEFT JOIN owner io ON io.id = ai.invited_by_owner_id
     WHERE ai.id = $1::uuid
       AND ai.deleted_at IS NULL
       ${financeFilter}
     LIMIT 1`,
    params
  );

  if (rows.length === 0) return null;

  const [redemptionRows] = await queryRunner.query(
    `SELECT air.user_id,
            air.redeemed_at,
            u.username,
            u.phone_no,
            ud.staff_name
     FROM agent_invitation_redemptions air
     JOIN users u ON u.id = air.user_id
     LEFT JOIN users_details ud ON ud.user_id = air.user_id AND ud.finance_id = air.finance_id
     WHERE air.invitation_id = $1::uuid
     ORDER BY air.redeemed_at DESC`,
    [invitationId]
  );

  const redemptions = redemptionRows.map(r => ({
    userId: String(r.user_id),
    username: r.username,
    displayName: r.staff_name || r.username,
    name: r.staff_name || r.username,
    maskedPhone: maskPhone(r.phone_no),
    redeemedAt: toIsoString(r.redeemed_at),
    joinedAt: toIsoString(r.redeemed_at),
  }));

  return serializeInvitationRow(rows[0], redemptions);
}

// ── 1. Search User (Exact Match Only) ──────────────────────────────────────
async function searchUserForInvite(req) {
  const ctx = await resolveCompanyCallerContext(req);

  checkRateLimit(
    searchRateBuckets,
    ctx.rateLimitKey,
    20,
    60 * 1000,
    'Too many search requests. Please wait a minute before searching again.'
  );

  const mode = String(req.query.mode || '').trim().toLowerCase();
  const rawValue = req.query.value !== undefined ? String(req.query.value) : '';

  if (mode !== 'phone' && mode !== 'email') {
    throw new InvitationError(400, 'Search mode must be "phone" or "email"', 'INVALID_SEARCH_MODE');
  }

  let userRows = [];
  if (mode === 'phone') {
    const check = normalizePhoneInput(rawValue);
    if (!check.valid) {
      throw new InvitationError(400, 'Enter a valid 10-digit mobile number', 'INVALID_PHONE');
    }
    const [rows] = await db.query(
      `SELECT u.id, u.username, u.email, u.phone_no, u.is_active,
              (SELECT ud.staff_name FROM users_details ud WHERE ud.user_id = u.id ORDER BY ud.created_at DESC LIMIT 1) AS staff_name
       FROM users u
       WHERE u.is_active = 1
         AND (
           u.phone_no = $1
           OR RIGHT(regexp_replace(u.phone_no, '[^0-9]', '', 'g'), 10) = $1
         )
       LIMIT 1`,
      [check.normalized]
    );
    userRows = rows;
  } else {
    const check = normalizeEmailInput(rawValue);
    if (!check.valid) {
      throw new InvitationError(400, 'Enter a valid email address', 'INVALID_EMAIL');
    }
    const [rows] = await db.query(
      `SELECT u.id, u.username, u.email, u.phone_no, u.is_active,
              (SELECT ud.staff_name FROM users_details ud WHERE ud.user_id = u.id ORDER BY ud.created_at DESC LIMIT 1) AS staff_name
       FROM users u
       WHERE u.is_active = 1
         AND LOWER(u.email) = $1
       LIMIT 1`,
      [check.normalized]
    );
    userRows = rows;
  }

  if (userRows.length === 0) {
    return { found: false, user: null };
  }

  const matchedUser = userRows[0];
  const stateInfo = await evaluateTargetUserState(db, {
    financeId: ctx.financeId,
    financeOwnerId: ctx.financeOwnerId,
    callerUserId: ctx.callerUserId,
    targetUser: matchedUser,
  });

  return {
    found: true,
    user: {
      id: String(matchedUser.id),
      username: matchedUser.username,
      displayName: matchedUser.staff_name || matchedUser.username,
      maskedPhone: maskPhone(matchedUser.phone_no),
      maskedEmail: maskEmail(matchedUser.email),
      state: stateInfo.state,
      ...(stateInfo.existingRole ? { existingRole: stateInfo.existingRole } : {}),
      ...(stateInfo.pendingInvitationId
        ? { pendingInvitationId: stateInfo.pendingInvitationId }
        : {}),
    },
  };
}

// ── 2. Generate Shareable Invite Code ──────────────────────────────────────
async function createInviteCode(req) {
  const ctx = await resolveCompanyCallerContext(req);
  const body = req.body || {};

  const assignedRole = String(body.role || 'agent').trim().toLowerCase();
  assertRoleAllowedForCaller(ctx.callerRole, assignedRole, 'create');

  // Validate maxUses (null or integer 1..500)
  let maxUses = null;
  if (body.maxUses !== null && body.maxUses !== undefined && body.maxUses !== '') {
    const parsed = Number(body.maxUses);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
      throw new InvitationError(
        400,
        'maxUses must be null (unlimited) or a whole number between 1 and 500',
        'INVALID_MAX_USES'
      );
    }
    maxUses = parsed;
  }

  // Validate expiryDays (integer 1..90, default 7)
  const rawExpiry = body.expiryDays !== undefined && body.expiryDays !== null ? Number(body.expiryDays) : 7;
  if (!Number.isInteger(rawExpiry) || rawExpiry < 1 || rawExpiry > 90) {
    throw new InvitationError(
      400,
      'expiryDays must be an integer between 1 and 90',
      'INVALID_EXPIRY_DAYS'
    );
  }
  const expiryDays = rawExpiry;

  const { from: loginTimeFrom, to: loginTimeTo } = validateLoginWindow(
    body.loginTimeFrom,
    body.loginTimeTo
  );

  const staffCode = body.staffCode ? String(body.staffCode).trim().toUpperCase() : null;
  if (staffCode && staffCode.length > 40) {
    throw new InvitationError(400, 'staffCode must be 40 characters or fewer', 'INVALID_STAFF_CODE');
  }

  const tx = await beginTransaction();
  try {
    // Take per-finance lock so concurrent code creations serialize
    await tx.query(`SELECT id FROM finance_detail WHERE id = $1::uuid FOR UPDATE`, [ctx.financeId]);

    if (staffCode) {
      const [existingCode] = await tx.query(
        `SELECT id FROM users_details WHERE finance_id = $1::uuid AND UPPER(staff_code) = $2 LIMIT 1`,
        [ctx.financeId, staffCode]
      );
      if (existingCode.length > 0) {
        throw new InvitationError(
          409,
          `Staff code "${staffCode}" is already assigned in this company`,
          'STAFF_CODE_EXISTS'
        );
      }
    }

    // Count currently active codes for this finance
    const [countRows] = await tx.query(
      `SELECT COUNT(*)::int AS active_count
       FROM agent_invitations
       WHERE finance_id = $1::uuid
         AND invite_type = 'code'
         AND status = 'pending'
         AND revoked_at IS NULL
         AND deleted_at IS NULL
         AND expires_at > NOW()
         AND (max_uses IS NULL OR used_count < max_uses)`,
      [ctx.financeId]
    );

    const activeCount = countRows[0]?.active_count || 0;
    if (activeCount >= MAX_ACTIVE_CODES_PER_COMPANY) {
      throw new InvitationError(
        409,
        `Active invite code limit reached (${MAX_ACTIVE_CODES_PER_COMPANY} of ${MAX_ACTIVE_CODES_PER_COMPANY}). Deactivate or delete an existing code first.`,
        'ACTIVE_CODE_CAP_REACHED'
      );
    }

    // Generate server-side AFX-XXXX-XXXX code with collision retry
    let insertedId = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const generatedCode = generateServerInviteCode();
      const inviteToken = generateInviteToken();

      await tx.query('SAVEPOINT sp_insert_code');
      try {
        const [ins] = await tx.query(
          `INSERT INTO agent_invitations (
             finance_id,
             invited_by,
             invited_by_owner_id,
             invite_type,
             user_id,
             invite_token,
             invitation_code,
             staff_code,
             assigned_role,
             status,
             login_time_from,
             login_time_to,
             max_uses,
             used_count,
             expires_at,
             created_at,
             updated_at
           ) VALUES (
             $1::uuid,
             $2::uuid,
             $3::uuid,
             'code',
             NULL,
             $4,
             $5,
             $6,
             $7::user_role_enum,
             'pending'::invitation_status_enum,
             $8::time,
             $9::time,
             $10::int,
             0,
             NOW() + ($11::int * INTERVAL '1 day'),
             NOW(),
             NOW()
           ) RETURNING id`,
          [
            ctx.financeId,
            ctx.callerUserId,
            ctx.callerOwnerId,
            inviteToken,
            generatedCode,
            staffCode,
            assignedRole,
            loginTimeFrom,
            loginTimeTo,
            maxUses,
            expiryDays,
          ]
        );
        await tx.query('RELEASE SAVEPOINT sp_insert_code');
        insertedId = ins[0].id;
        break;
      } catch (err) {
        await tx.query('ROLLBACK TO SAVEPOINT sp_insert_code');
        if (err.code === '23505') {
          continue;
        }
        throw err;
      }
    }

    if (!insertedId) {
      throw new InvitationError(500, 'Could not generate a unique invite code', 'CODE_GENERATION_FAILED');
    }

    const invitation = await fetchInvitationById(tx, insertedId, ctx.financeId);
    await tx.commit();
    return invitation;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ── 3. Send Direct Invitation ──────────────────────────────────────────────
async function createDirectInvite(req) {
  const ctx = await resolveCompanyCallerContext(req);
  const body = req.body || {};

  const targetUserId = body.targetUserId ? String(body.targetUserId).trim() : '';
  if (!UUID_REGEX.test(targetUserId)) {
    throw new InvitationError(400, 'Valid targetUserId is required', 'INVALID_TARGET_USER');
  }

  const assignedRole = String(body.role || 'agent').trim().toLowerCase();
  assertRoleAllowedForCaller(ctx.callerRole, assignedRole, 'create');

  const rawExpiry = body.expiryDays !== undefined && body.expiryDays !== null ? Number(body.expiryDays) : 7;
  if (!Number.isInteger(rawExpiry) || rawExpiry < 1 || rawExpiry > 90) {
    throw new InvitationError(
      400,
      'expiryDays must be an integer between 1 and 90',
      'INVALID_EXPIRY_DAYS'
    );
  }

  const { from: loginTimeFrom, to: loginTimeTo } = validateLoginWindow(
    body.loginTimeFrom,
    body.loginTimeTo
  );

  const staffCode = body.staffCode ? String(body.staffCode).trim().toUpperCase() : null;
  if (staffCode && staffCode.length > 40) {
    throw new InvitationError(400, 'staffCode must be 40 characters or fewer', 'INVALID_STAFF_CODE');
  }

  const tx = await beginTransaction();
  try {
    // Lock target user row
    const [targetRows] = await tx.query(
      `SELECT id, username, email, phone_no, is_active
       FROM users
       WHERE id = $1::uuid AND is_active = 1
       FOR UPDATE`,
      [targetUserId]
    );
    if (targetRows.length === 0) {
      throw new InvitationError(404, 'Target user not found or inactive', 'USER_NOT_FOUND');
    }
    const targetUser = targetRows[0];

    if (staffCode) {
      const [existingStaffCode] = await tx.query(
        `SELECT user_id FROM users_details
         WHERE finance_id = $1::uuid AND UPPER(staff_code) = $2 AND (user_id IS NULL OR user_id <> $3::uuid)
         LIMIT 1`,
        [ctx.financeId, staffCode, targetUserId]
      );
      if (existingStaffCode.length > 0) {
        throw new InvitationError(
          409,
          `Staff code "${staffCode}" is already assigned in this company`,
          'STAFF_CODE_EXISTS'
        );
      }
    }

    // Re-evaluate the 4 target user states inside the transaction
    const stateInfo = await evaluateTargetUserState(tx, {
      financeId: ctx.financeId,
      financeOwnerId: ctx.financeOwnerId,
      callerUserId: ctx.callerUserId,
      targetUser,
    });

    if (stateInfo.state === 'self') {
      throw new InvitationError(400, 'You cannot invite your own account', 'SELF_INVITE');
    }
    if (stateInfo.state === 'already_in_company') {
      throw new InvitationError(
        409,
        'This user is already an active member of this company',
        'ALREADY_MEMBER'
      );
    }
    if (stateInfo.state === 'invite_pending') {
      throw new InvitationError(
        409,
        'An invitation is already pending for this user',
        'INVITE_ALREADY_PENDING'
      );
    }

    // If an older pending row exists that has already expired (expires_at <= NOW()),
    // mark it expired so the partial unique index ux_ai_pending_direct allows the new pending invite.
    await tx.query(
      `UPDATE agent_invitations
       SET status = 'expired'::invitation_status_enum,
           updated_at = NOW()
       WHERE finance_id = $1::uuid
         AND user_id = $2::uuid
         AND invite_type = 'direct'
         AND status = 'pending'
         AND expires_at <= NOW()`,
      [ctx.financeId, targetUserId]
    );

    const inviteToken = generateInviteToken();
    let insertedId;
    try {
      const [ins] = await tx.query(
        `INSERT INTO agent_invitations (
           finance_id,
           invited_by,
           invited_by_owner_id,
           invite_type,
           user_id,
           invite_token,
           invitation_code,
           staff_code,
           assigned_role,
           status,
           login_time_from,
           login_time_to,
           max_uses,
           used_count,
           expires_at,
           created_at,
           updated_at
         ) VALUES (
           $1::uuid,
           $2::uuid,
           $3::uuid,
           'direct',
           $4::uuid,
           $5,
           NULL,
           $6,
           $7::user_role_enum,
           'pending'::invitation_status_enum,
           $8::time,
           $9::time,
           1,
           0,
           NOW() + ($10::int * INTERVAL '1 day'),
           NOW(),
           NOW()
         ) RETURNING id`,
        [
          ctx.financeId,
          ctx.callerUserId,
          ctx.callerOwnerId,
          targetUserId,
          inviteToken,
          staffCode,
          assignedRole,
          loginTimeFrom,
          loginTimeTo,
          rawExpiry,
        ]
      );
      insertedId = ins[0].id;
    } catch (err) {
      if (err.code === '23505') {
        throw new InvitationError(
          409,
          'An invitation is already pending for this user',
          'INVITE_ALREADY_PENDING'
        );
      }
      throw err;
    }

    const invitation = await fetchInvitationById(tx, insertedId, ctx.financeId);
    await tx.commit();
    return invitation;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ── 4. List Company Invitations (Read-Only, Zero Writes) ───────────────────
async function listCompanyInvitations(req) {
  const ctx = await resolveCompanyCallerContext(req);

  const typeFilter = String(req.query.type || 'all').trim().toLowerCase();
  const statusFilter = String(req.query.status || 'all').trim().toLowerCase();

  if (!['all', 'code', 'direct'].includes(typeFilter)) {
    throw new InvitationError(400, 'Invalid type filter (expected all, code, or direct)', 'INVALID_FILTER');
  }
  if (!['all', 'active', 'inactive'].includes(statusFilter)) {
    throw new InvitationError(
      400,
      'Invalid status filter (expected all, active, or inactive)',
      'INVALID_FILTER'
    );
  }

  const [rows] = await db.query(
    `SELECT ai.*,
            (ai.expires_at <= NOW()) AS is_expired_now,
            fd.finance_name,
            fd.owner_id AS finance_owner_id,
            tu.username AS target_username,
            tu.email AS target_email,
            tu.phone_no AS target_phone_no,
            tud.staff_name AS target_staff_name,
            iu.username AS inviter_username,
            iud.staff_name AS inviter_staff_name,
            iuac.role AS inviter_company_role,
            io.username AS inviter_owner_username
     FROM agent_invitations ai
     JOIN finance_detail fd ON fd.id = ai.finance_id
     LEFT JOIN users tu ON tu.id = ai.user_id
     LEFT JOIN users_details tud ON tud.user_id = ai.user_id AND tud.finance_id = ai.finance_id
     LEFT JOIN users iu ON iu.id = ai.invited_by
     LEFT JOIN users_details iud ON iud.user_id = ai.invited_by AND iud.finance_id = ai.finance_id
     LEFT JOIN user_allowed_companies iuac ON iuac.user_id = ai.invited_by AND iuac.finance_id = ai.finance_id
     LEFT JOIN owner io ON io.id = ai.invited_by_owner_id
     WHERE ai.finance_id = $1::uuid
       AND ai.deleted_at IS NULL
     ORDER BY ai.created_at DESC`,
    [ctx.financeId]
  );

  // Batch fetch all redemptions for this company's invitations
  const invitationIds = rows.map(r => r.id);
  const redemptionsByInviteId = new Map();

  if (invitationIds.length > 0) {
    const [redRows] = await db.query(
      `SELECT air.invitation_id,
              air.user_id,
              air.redeemed_at,
              u.username,
              u.phone_no,
              ud.staff_name
       FROM agent_invitation_redemptions air
       JOIN users u ON u.id = air.user_id
       LEFT JOIN users_details ud ON ud.user_id = air.user_id AND ud.finance_id = air.finance_id
       WHERE air.finance_id = $1::uuid
         AND air.invitation_id = ANY($2::uuid[])
       ORDER BY air.redeemed_at DESC`,
      [ctx.financeId, invitationIds]
    );

    for (const r of redRows) {
      const key = String(r.invitation_id);
      if (!redemptionsByInviteId.has(key)) {
        redemptionsByInviteId.set(key, []);
      }
      redemptionsByInviteId.get(key).push({
        userId: String(r.user_id),
        username: r.username,
        displayName: r.staff_name || r.username,
        name: r.staff_name || r.username,
        maskedPhone: maskPhone(r.phone_no),
        redeemedAt: toIsoString(r.redeemed_at),
        joinedAt: toIsoString(r.redeemed_at),
      });
    }
  }

  const allSerialized = rows.map(row =>
    serializeInvitationRow(row, redemptionsByInviteId.get(String(row.id)) || [])
  );

  const activeCodeCount = allSerialized.filter(
    inv => inv.inviteType === 'code' && inv.derivedStatus === 'active'
  ).length;

  const filtered = allSerialized.filter(inv => {
    if (typeFilter !== 'all' && inv.inviteType !== typeFilter) return false;
    if (statusFilter === 'active') {
      return inv.inviteType === 'code'
        ? inv.derivedStatus === 'active'
        : inv.derivedStatus === 'pending';
    }
    if (statusFilter === 'inactive') {
      return inv.inviteType === 'code'
        ? inv.derivedStatus !== 'active'
        : inv.derivedStatus !== 'pending';
    }
    return true;
  });

  return {
    invitations: filtered,
    activeCodeCount,
    maxActiveCodes: MAX_ACTIVE_CODES_PER_COMPANY,
  };
}

// ── 5. Revoke / Cancel Invitation ──────────────────────────────────────────
async function revokeInvitation(req) {
  const ctx = await resolveCompanyCallerContext(req);
  const invitationId = String(req.params.id || '').trim();
  if (!UUID_REGEX.test(invitationId)) {
    throw new InvitationError(400, 'Invalid invitation ID', 'INVALID_ID');
  }

  const tx = await beginTransaction();
  try {
    const [rows] = await tx.query(
      `SELECT *, (expires_at <= NOW()) AS is_expired_now
       FROM agent_invitations
       WHERE id = $1::uuid AND finance_id = $2::uuid AND deleted_at IS NULL
       FOR UPDATE`,
      [invitationId, ctx.financeId]
    );

    if (rows.length === 0) {
      throw new InvitationError(404, 'Invitation not found', 'NOT_FOUND');
    }

    const row = rows[0];
    // Decision D: admin cannot revoke an admin invitation
    assertRoleAllowedForCaller(ctx.callerRole, row.assigned_role, 'revoke');

    const derivedStatus = computeDerivedStatusFromRow(row);
    const isRevocable =
      (row.invite_type === 'code' && derivedStatus === 'active') ||
      (row.invite_type === 'direct' && derivedStatus === 'pending');

    if (!isRevocable) {
      throw new InvitationError(
        400,
        `Cannot revoke invitation because its current status is "${derivedStatus}"`,
        'NOT_REVOCABLE'
      );
    }

    await tx.query(
      `UPDATE agent_invitations
       SET status = 'cancelled'::invitation_status_enum,
           revoked_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [invitationId]
    );

    const updated = await fetchInvitationById(tx, invitationId, ctx.financeId);
    await tx.commit();
    return updated;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ── 6. Delete Invitation (Soft-delete if used, Hard-delete if unused) ──────
async function deleteInvitation(req) {
  const ctx = await resolveCompanyCallerContext(req);
  const invitationId = String(req.params.id || '').trim();
  if (!UUID_REGEX.test(invitationId)) {
    throw new InvitationError(400, 'Invalid invitation ID', 'INVALID_ID');
  }

  const tx = await beginTransaction();
  try {
    const [rows] = await tx.query(
      `SELECT *, (expires_at <= NOW()) AS is_expired_now
       FROM agent_invitations
       WHERE id = $1::uuid AND finance_id = $2::uuid AND deleted_at IS NULL
       FOR UPDATE`,
      [invitationId, ctx.financeId]
    );

    if (rows.length === 0) {
      throw new InvitationError(404, 'Invitation not found', 'NOT_FOUND');
    }

    const row = rows[0];
    // Decision D: admin cannot delete an admin invitation
    assertRoleAllowedForCaller(ctx.callerRole, row.assigned_role, 'delete');

    // Decision B: active codes and pending direct invites must be revoked first
    const derivedStatus = computeDerivedStatusFromRow(row);
    if (
      (row.invite_type === 'code' && derivedStatus === 'active') ||
      (row.invite_type === 'direct' && derivedStatus === 'pending')
    ) {
      throw new InvitationError(
        400,
        'Active or pending invitations must be deactivated or cancelled before deletion',
        'DELETE_ACTIVE_FORBIDDEN'
      );
    }

    const [redCountRows] = await tx.query(
      `SELECT COUNT(*)::int AS cnt FROM agent_invitation_redemptions WHERE invitation_id = $1::uuid`,
      [invitationId]
    );
    const redemptionCount = redCountRows[0]?.cnt || 0;

    if (Number(row.used_count || 0) > 0 || redemptionCount > 0) {
      // Soft-delete so redemption history in agent_invitation_redemptions is preserved
      await tx.query(
        `UPDATE agent_invitations
         SET deleted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [invitationId]
      );
    } else {
      await tx.query(`DELETE FROM agent_invitations WHERE id = $1::uuid`, [invitationId]);
    }

    await tx.commit();
    return { id: invitationId, deleted: true };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ── Caller Context Verification (User-Scoped) ──────────────────────────────
async function resolveUserCallerContext(req, queryRunner = db) {
  if (req.isOwner && !req.user?.id) {
    throw new InvitationError(
      403,
      'Owner accounts cannot accept or redeem staff invitations',
      'OWNER_NOT_ALLOWED'
    );
  }

  const userId = req.user?.id ? String(req.user.id).trim() : '';
  if (!UUID_REGEX.test(userId)) {
    throw new InvitationError(401, 'User authentication required', 'UNAUTHORIZED');
  }

  const [userRows] = await queryRunner.query(
    `SELECT id, username, email, phone_no, is_active
     FROM users
     WHERE id = $1::uuid AND is_active = 1
     LIMIT 1`,
    [userId]
  );

  if (userRows.length === 0) {
    throw new InvitationError(
      403,
      'Valid active user account required to respond to or redeem invitations',
      'USER_NOT_FOUND'
    );
  }

  return userRows[0];
}

// ── Shared Membership Provisioning Helper (Decision C) ─────────────────────
async function provisionMembershipInTransaction(tx, { user, invitation, isMultiUseCode }) {
  const userId = String(user.id);
  const financeId = String(invitation.finance_id);
  const assignedRole = invitation.assigned_role;

  if (assignedRole === 'owner') {
    throw new InvitationError(400, 'Cannot assign owner role via invitation', 'INVALID_ROLE');
  }

  // Verify finance is active and check group owner status
  const [finRows] = await tx.query(
    `SELECT fd.id, fd.finance_name, fd.owner_id,
            EXISTS (
              SELECT 1
              FROM user_allowed_companies uac_o
              JOIN finance_detail fd_o ON fd_o.id = uac_o.finance_id
              WHERE uac_o.user_id = $1::uuid
                AND uac_o.role = 'owner'
                AND uac_o.is_active = 1
                AND fd_o.owner_id = fd.owner_id
            ) AS is_group_owner
     FROM finance_detail fd
     WHERE fd.id = $2::uuid AND fd.is_active = 1
     LIMIT 1`,
    [userId, financeId]
  );

  if (finRows.length === 0) {
    throw new InvitationError(404, 'Finance company is no longer active', 'FINANCE_INACTIVE');
  }

  if (finRows[0].is_group_owner) {
    throw new InvitationError(409, 'You are already a member of this company', 'ALREADY_MEMBER');
  }

  // Lock existing user_allowed_companies row if present
  const [uacRows] = await tx.query(
    `SELECT id, role, is_active
     FROM user_allowed_companies
     WHERE user_id = $1::uuid AND finance_id = $2::uuid
     FOR UPDATE`,
    [userId, financeId]
  );

  if (uacRows.length > 0) {
    const existingUac = uacRows[0];
    if (Number(existingUac.is_active) === 1 || existingUac.role === 'owner') {
      throw new InvitationError(409, 'You are already a member of this company', 'ALREADY_MEMBER');
    }
    // Reactivate inactive membership (Decision C)
    await tx.query(
      `UPDATE user_allowed_companies
       SET is_active = 1,
           role = $3::user_role_enum,
           login_time_from = $4::time,
           login_time_to = $5::time,
           assigned_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid AND user_id = $2::uuid`,
      [
        existingUac.id,
        userId,
        assignedRole,
        invitation.login_time_from || null,
        invitation.login_time_to || null,
      ]
    );
  } else {
    await tx.query(
      `INSERT INTO user_allowed_companies (
         user_id, finance_id, role, login_time_from, login_time_to, is_active, assigned_at, created_at, updated_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::user_role_enum, $4::time, $5::time, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )`,
      [
        userId,
        financeId,
        assignedRole,
        invitation.login_time_from || null,
        invitation.login_time_to || null,
      ]
    );
  }

  // Provision / update users_details
  let effectiveStaffCode = invitation.staff_code
    ? String(invitation.staff_code).trim().toUpperCase()
    : null;

  if (effectiveStaffCode) {
    if (isMultiUseCode) {
      const seq = Number(invitation.used_count || 0) + 1;
      const candidate = `${effectiveStaffCode}-${seq}`.slice(0, 50);
      const [conflict] = await tx.query(
        `SELECT 1 FROM users_details
         WHERE finance_id = $1::uuid AND UPPER(staff_code) = $2 AND (user_id IS NULL OR user_id <> $3::uuid)
         LIMIT 1`,
        [financeId, candidate, userId]
      );
      effectiveStaffCode =
        conflict.length === 0
          ? candidate
          : `${effectiveStaffCode}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`.slice(0, 50);
    } else {
      const [conflict] = await tx.query(
        `SELECT 1 FROM users_details
         WHERE finance_id = $1::uuid AND UPPER(staff_code) = $2 AND (user_id IS NULL OR user_id <> $3::uuid)
         LIMIT 1`,
        [financeId, effectiveStaffCode, userId]
      );
      if (conflict.length > 0) {
        if (invitation.invite_type === 'direct') {
          throw new InvitationError(
            409,
            `Assigned staff code "${effectiveStaffCode}" is already in use in this company`,
            'STAFF_CODE_EXISTS'
          );
        }
        effectiveStaffCode = `${effectiveStaffCode}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`.slice(0, 50);
      }
    }
  }

  const [existingUd] = await tx.query(
    `SELECT id, staff_code FROM users_details
     WHERE user_id = $1::uuid AND finance_id = $2::uuid
     FOR UPDATE`,
    [userId, financeId]
  );

  if (existingUd.length > 0) {
    if (effectiveStaffCode) {
      await tx.query(
        `UPDATE users_details SET staff_code = $1 WHERE id = $2::uuid`,
        [effectiveStaffCode, existingUd[0].id]
      );
    }
  } else {
    await tx.query(
      `INSERT INTO users_details (
         user_id, finance_id, staff_name, staff_code, joining_date, created_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, CURRENT_DATE, CURRENT_TIMESTAMP
       )`,
      [userId, financeId, user.username, effectiveStaffCode]
    );
  }

  return {
    financeId,
    financeName: finRows[0].finance_name,
    role: assignedRole,
  };
}

// ── 7. List Pending Direct Invitations for Current User ────────────────────
async function listMyPendingInvitations(req) {
  const user = await resolveUserCallerContext(req);

  const [rows] = await db.query(
    `SELECT ai.*,
            (ai.expires_at <= NOW()) AS is_expired_now,
            fd.finance_name,
            fd.owner_id AS finance_owner_id,
            tu.username AS target_username,
            tu.email AS target_email,
            tu.phone_no AS target_phone_no,
            tud.staff_name AS target_staff_name,
            iu.username AS inviter_username,
            iud.staff_name AS inviter_staff_name,
            iuac.role AS inviter_company_role,
            io.username AS inviter_owner_username
     FROM agent_invitations ai
     JOIN finance_detail fd ON fd.id = ai.finance_id AND fd.is_active = 1
     LEFT JOIN users tu ON tu.id = ai.user_id
     LEFT JOIN users_details tud ON tud.user_id = ai.user_id AND tud.finance_id = ai.finance_id
     LEFT JOIN users iu ON iu.id = ai.invited_by
     LEFT JOIN users_details iud ON iud.user_id = ai.invited_by AND iud.finance_id = ai.finance_id
     LEFT JOIN user_allowed_companies iuac ON iuac.user_id = ai.invited_by AND iuac.finance_id = ai.finance_id
     LEFT JOIN owner io ON io.id = ai.invited_by_owner_id
     WHERE ai.user_id = $1::uuid
       AND ai.invite_type = 'direct'
       AND ai.status = 'pending'
       AND ai.revoked_at IS NULL
       AND ai.deleted_at IS NULL
       AND ai.expires_at > NOW()
     ORDER BY ai.created_at DESC`,
    [user.id]
  );

  return rows.map(row => serializeInvitationRow(row, []));
}

// ── 8. Respond to Direct Invitation (Accept / Decline) ─────────────────────
async function respondToDirectInvitation(req) {
  const user = await resolveUserCallerContext(req);
  const invitationId = String(req.params.id || '').trim();
  if (!UUID_REGEX.test(invitationId)) {
    throw new InvitationError(400, 'Invalid invitation ID', 'INVALID_ID');
  }

  const decision = String(req.body?.decision || '').trim().toLowerCase();
  if (decision !== 'accept' && decision !== 'decline') {
    throw new InvitationError(400, 'Decision must be "accept" or "decline"', 'INVALID_DECISION');
  }

  const tx = await beginTransaction();
  try {
    const [rows] = await tx.query(
      `SELECT *, (expires_at <= NOW()) AS is_expired_now
       FROM agent_invitations
       WHERE id = $1::uuid AND invite_type = 'direct' AND deleted_at IS NULL
       FOR UPDATE`,
      [invitationId]
    );

    if (rows.length === 0) {
      throw new InvitationError(404, 'Invitation not found', 'NOT_FOUND');
    }

    const inv = rows[0];
    if (String(inv.user_id) !== String(user.id)) {
      throw new InvitationError(403, 'This invitation does not belong to your account', 'FORBIDDEN');
    }

    if (inv.status === 'cancelled' || inv.revoked_at) {
      throw new InvitationError(410, 'This invitation was cancelled by the company', 'INVITATION_CANCELLED');
    }
    if (inv.status === 'accepted') {
      throw new InvitationError(409, 'This invitation has already been accepted', 'ALREADY_ACCEPTED');
    }
    if (inv.status === 'declined') {
      throw new InvitationError(409, 'This invitation has already been declined', 'ALREADY_DECLINED');
    }
    if (inv.status === 'expired' || inv.is_expired_now) {
      throw new InvitationError(410, 'This invitation has expired', 'INVITATION_EXPIRED');
    }

    if (decision === 'decline') {
      await tx.query(
        `UPDATE agent_invitations
         SET status = 'declined'::invitation_status_enum,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [invitationId]
      );
      const updated = await fetchInvitationById(tx, invitationId);
      await tx.commit();
      return { invitation: updated, membership: null };
    }

    // Verify stale inviter check on accept as well
    await verifyInviterStillAuthorized(tx, inv);

    const membership = await provisionMembershipInTransaction(tx, {
      user,
      invitation: inv,
      isMultiUseCode: false,
    });

    await tx.query(
      `UPDATE agent_invitations
       SET status = 'accepted'::invitation_status_enum,
           accepted_at = NOW(),
           used_count = 1,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [invitationId]
    );

    await tx.query(
      `INSERT INTO agent_invitation_redemptions (
         invitation_id, finance_id, user_id, invited_by_user_id, invited_by_owner_id, redeemed_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, NOW()
       ) ON CONFLICT (invitation_id, user_id) DO NOTHING`,
      [invitationId, inv.finance_id, user.id, inv.invited_by, inv.invited_by_owner_id]
    );

    const updated = await fetchInvitationById(tx, invitationId);
    await tx.commit();
    return { invitation: updated, membership };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ── Stale Inviter Authorization Verification ───────────────────────────────
async function verifyInviterStillAuthorized(tx, invitation) {
  const financeId = String(invitation.finance_id);

  const [finRows] = await tx.query(
    `SELECT id, owner_id, is_active FROM finance_detail WHERE id = $1::uuid AND is_active = 1 LIMIT 1`,
    [financeId]
  );
  if (finRows.length === 0) {
    throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
  }
  const finance = finRows[0];

  if (invitation.invited_by_owner_id) {
    const [ownerRows] = await tx.query(
      `SELECT id FROM owner WHERE id = $1::uuid AND is_active = 1 LIMIT 1`,
      [invitation.invited_by_owner_id]
    );
    if (
      ownerRows.length === 0 ||
      String(finance.owner_id) !== String(invitation.invited_by_owner_id)
    ) {
      throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
    }
    return;
  }

  if (invitation.invited_by) {
    const [inviterRows] = await tx.query(
      `SELECT u.id,
              uac.role AS direct_role,
              EXISTS (
                SELECT 1
                FROM user_allowed_companies uac_o
                JOIN finance_detail fd_o ON fd_o.id = uac_o.finance_id
                WHERE uac_o.user_id = u.id
                  AND uac_o.role = 'owner'
                  AND uac_o.is_active = 1
                  AND fd_o.owner_id = $2::uuid
              ) AS is_group_owner
       FROM users u
       LEFT JOIN user_allowed_companies uac
         ON uac.user_id = u.id AND uac.finance_id = $3::uuid AND uac.is_active = 1
       WHERE u.id = $1::uuid AND u.is_active = 1
       LIMIT 1`,
      [invitation.invited_by, finance.owner_id, financeId]
    );

    if (inviterRows.length === 0) {
      throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
    }
    const inviter = inviterRows[0];
    const stillOwnerOrAdmin =
      inviter.is_group_owner ||
      inviter.direct_role === 'owner' ||
      inviter.direct_role === 'admin';

    if (!stillOwnerOrAdmin) {
      throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
    }
    // If the code assigns 'admin' role, the inviter must still be 'owner'
    if (
      invitation.assigned_role === 'admin' &&
      !inviter.is_group_owner &&
      inviter.direct_role !== 'owner'
    ) {
      throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
    }
    return;
  }

  throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
}

// ── 9. Redeem Shareable Invite Code ────────────────────────────────────────
async function redeemInviteCode(req) {
  const user = await resolveUserCallerContext(req);

  checkRateLimit(
    redeemRateBuckets,
    `redeem:${user.id}`,
    10,
    10 * 60 * 1000,
    'Too many code redemption attempts. Please wait a few minutes and try again.'
  );

  const rawCode = req.body?.code !== undefined ? String(req.body.code) : '';
  const normalizedCode = rawCode.trim().toUpperCase();

  if (!CODE_REGEX.test(normalizedCode)) {
    throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
  }

  const tx = await beginTransaction();
  try {
    // 1. Lock the invitation row FOR UPDATE
    const [rows] = await tx.query(
      `SELECT *, (expires_at <= NOW()) AS is_expired_now
       FROM agent_invitations
       WHERE invitation_code = $1
         AND invite_type = 'code'
         AND deleted_at IS NULL
       FOR UPDATE`,
      [normalizedCode]
    );

    if (rows.length === 0) {
      throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
    }

    const inv = rows[0];
    const usedCount = Number(inv.used_count || 0);
    const maxUses = inv.max_uses !== null && inv.max_uses !== undefined ? Number(inv.max_uses) : null;

    // 2. Check status, revocation, expiry, and capacity with ONE generic message
    if (
      inv.status !== 'pending' ||
      inv.revoked_at !== null ||
      inv.is_expired_now ||
      (maxUses !== null && usedCount >= maxUses)
    ) {
      throw new InvitationError(400, GENERIC_REDEEM_ERROR, 'INVALID_OR_EXPIRED_CODE');
    }

    // 3. Stale-inviter check
    await verifyInviterStillAuthorized(tx, inv);

    // 4. Prevent self-redemption
    if (inv.invited_by && String(inv.invited_by) === String(user.id)) {
      throw new InvitationError(
        400,
        'You cannot redeem an invite code you created',
        'SELF_REDEMPTION'
      );
    }

    // 5. Check prior redemption by this user
    const [existingRedemption] = await tx.query(
      `SELECT id FROM agent_invitation_redemptions
       WHERE invitation_id = $1::uuid AND user_id = $2::uuid
       LIMIT 1`,
      [inv.id, user.id]
    );
    if (existingRedemption.length > 0) {
      throw new InvitationError(409, 'You are already a member of this company', 'ALREADY_MEMBER');
    }

    // 6. Provision membership & users_details (enforces Decision C)
    const isMultiUseCode = maxUses === null || maxUses > 1;
    const membership = await provisionMembershipInTransaction(tx, {
      user,
      invitation: inv,
      isMultiUseCode,
    });

    // 7. Insert redemption record
    await tx.query(
      `INSERT INTO agent_invitation_redemptions (
         invitation_id, finance_id, user_id, invited_by_user_id, invited_by_owner_id, redeemed_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, NOW()
       )`,
      [inv.id, inv.finance_id, user.id, inv.invited_by, inv.invited_by_owner_id]
    );

    // 8. Increment used_count and transition to 'exhausted' if max_uses reached
    await tx.query(
      `UPDATE agent_invitations
       SET used_count = used_count + 1,
           accepted_at = COALESCE(accepted_at, NOW()),
           status = CASE
                      WHEN max_uses IS NOT NULL AND used_count + 1 >= max_uses
                        THEN 'exhausted'::invitation_status_enum
                      ELSE status
                    END,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [inv.id]
    );

    const updated = await fetchInvitationById(tx, inv.id);
    await tx.commit();
    return {
      invitation: updated,
      membership,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = {
  InvitationError,
  MAX_ACTIVE_CODES_PER_COMPANY,
  GENERIC_REDEEM_ERROR,
  searchUserForInvite,
  createInviteCode,
  createDirectInvite,
  listCompanyInvitations,
  revokeInvitation,
  deleteInvitation,
  listMyPendingInvitations,
  respondToDirectInvitation,
  redeemInviteCode,
  resetRateLimitersForTests,
};

/**
 * userProfile.service.js
 *
 * Database-driven service for the logged-in user's own profile overview
 * (`GET /api/user/profile-overview`).
 *
 * Design & Decisions (A–F):
 * - Decision A: Self-only endpoint (`GET /api/user/profile-overview`). Never accepts a `userId` param.
 * - Decision B: Collections attributed to this user via `payments.collected_by_id = user.id`,
 *   or when `collected_by_id IS NULL` via an unambiguous case-insensitive trimmed match on
 *   `payments.collected_by` within the active finance. Excludes cancelled payments, penalty, and hand_loan.
 * - Decision C: Assignment recovery/completion follows `assignmentHistory.service.js` semantics
 *   plus visit records (`status IN ('collected', 'visited')`, or non-cancelled payment, seizure,
 *   or visit on/after the assignment date within the assignment window).
 * - Decision D: All performance KPIs are strictly user-scoped and finance-scoped for every role.
 *   Since `customer_agent_assignments` has no `loan_id` column, `assignedLoans` counts distinct
 *   latest loans (`loans` per assigned customer in this finance).
 * - Decision F: If an owner principal has no corresponding `users` row, serves read-only profile
 *   from `owner` + `finance_detail` with "-" fallbacks and empty sessions/assignments.
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { db } = require('../../config/database.config');
const { calculateCustomerFinancials } = require('../agents/agentAssignment.service');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;
const SENSITIVE_KEY_REGEX = /(password|hash|token|secret)/i;

// Active session recency threshold for today's `isActiveNow` badge & running duration (12 hours)
const ACTIVE_SESSION_THRESHOLD_HOURS = 12;
const ASSIGNED_CUSTOMERS_CAP = 50;

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.ACCESS_KEY || '',
    secretAccessKey: process.env.SECRET_ACCESS_KEY || '',
  },
  region: process.env.BUCKET_REGION || 'ap-south-1',
});

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

/**
 * Format a Date into YYYY-MM-DD in Asia/Kolkata timezone
 */
function getIstDateString(date = new Date()) {
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

function formatIstTime(date) {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function formatDurationDisplay(minutes) {
  if (minutes === null || minutes === undefined) return '-';
  const m = Math.max(0, Math.floor(minutes));
  const hrs = Math.floor(m / 60);
  const mins = m % 60;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

/**
 * Format role enum into human-readable display label
 */
function formatRoleDisplay(rawRole) {
  const norm = String(rawRole || 'agent').toLowerCase().trim();
  switch (norm) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'agent':
      return 'Agent';
    case 'staff':
      return 'Staff';
    default:
      return norm.charAt(0).toUpperCase() + norm.slice(1);
  }
}

/**
 * Compute experience string from prior experience_years + completed years since joiningDate (IST).
 * Clamps to 0 and ignores future joining dates.
 * Returns "Less than 1 Year" (0), "1 Year" (1), or "N Years" (N > 1).
 */
function computeExperienceDisplay(priorYearsRaw, joiningDateStr, todayIstStr) {
  const prior = Math.max(0, parseInt(priorYearsRaw, 10) || 0);
  let completedSinceJoin = 0;

  if (
    joiningDateStr &&
    /^\d{4}-\d{2}-\d{2}$/.test(joiningDateStr) &&
    /^\d{4}-\d{2}-\d{2}$/.test(todayIstStr) &&
    joiningDateStr <= todayIstStr
  ) {
    const [jY, jM, jD] = joiningDateStr.split('-').map(Number);
    const [tY, tM, tD] = todayIstStr.split('-').map(Number);
    let years = tY - jY;
    if (tM < jM || (tM === jM && tD < jD)) {
      years -= 1;
    }
    completedSinceJoin = Math.max(0, years);
  }

  const totalYears = Math.max(0, prior + completedSinceJoin);
  if (totalYears === 0) return 'Less than 1 Year';
  if (totalYears === 1) return '1 Year';
  return `${totalYears} Years`;
}

/**
 * Assemble clean human-readable address from `addresses` columns or return "-"
 */
function assembleAddress(row) {
  if (!row) return '-';
  const seen = new Set();
  const parts = [];

  const candidates = [
    row.house_no,
    row.street || row.street_name,
    row.village,
    row.land_mark,
    row.raw_address,
    row.city,
    row.district,
    row.state,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed.toLowerCase() === 'n/a') continue;
    const norm = trimmed.toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      parts.push(trimmed);
    }
  }

  const pincode = row.pincode ? String(row.pincode).trim() : '';
  if (parts.length === 0 && !pincode) return '-';
  if (parts.length === 0) return pincode;
  return pincode ? `${parts.join(', ')} - ${pincode}` : parts.join(', ');
}

/**
 * Resolve photo S3 key or URL to presigned URL (or null)
 */
async function resolvePhotoUrl(photoValue) {
  if (!photoValue || typeof photoValue !== 'string') return null;
  const trimmed = photoValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }
  if (!process.env.BUCKET_NAME || !process.env.ACCESS_KEY || !process.env.SECRET_ACCESS_KEY) {
    return null;
  }
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: trimmed,
    });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch {
    return null;
  }
}

/**
 * Deeply assert that no key or value in the response payload leaks passwords, hashes, tokens, or secrets.
 */
function assertNoSensitiveFields(value, path = 'root') {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (BCRYPT_HASH_REGEX.test(value)) {
      throw new Error(`Security assertion failed: bcrypt hash detected at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoSensitiveFields(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_REGEX.test(k) && k !== 'lastPasswordChange') {
        throw new Error(`Security assertion failed: sensitive key "${k}" detected at ${path}.${k}`);
      }
      assertNoSensitiveFields(v, `${path}.${k}`);
    }
  }
}

/**
 * Section 1 Query: Fetch profile & finance row (1 query)
 */
async function fetchProfileSection(queryable, { financeId, principalId, ownerUsername, isOwnerToken, nowDate }) {
  const buildSql = (includePasswordChangedAt) => `
    SELECT
      fd.id AS finance_id,
      fd.finance_name,
      u.id AS user_id,
      u.username AS user_username,
      u.email AS user_email,
      u.phone_no AS user_phone,
      u.is_active AS user_is_active,
      TO_CHAR((u.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS user_created_date,
      ${
        includePasswordChangedAt
          ? `TO_CHAR(u.password_changed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`
          : `NULL::text`
      } AS user_last_password_change,
      o.id AS owner_id,
      o.username AS owner_username,
      o.is_active AS owner_is_active,
      TO_CHAR((o.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS owner_created_date,
      ${
        includePasswordChangedAt
          ? `TO_CHAR(o.password_changed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`
          : `NULL::text`
      } AS owner_last_password_change,
      uac.role AS company_role,
      uac.is_active AS company_is_active,
      TO_CHAR((uac.assigned_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS company_assigned_date,
      TO_CHAR((uac.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS company_created_date,
      ud.staff_name,
      ud.staff_code,
      TO_CHAR(ud.joining_date, 'YYYY-MM-DD') AS ud_joining_date,
      ud.experience_years,
      ud.education_qualification,
      ud.photo,
      addr.house_no,
      addr.street,
      addr.street_name,
      addr.village,
      addr.land_mark,
      addr.address AS raw_address,
      addr.city,
      addr.district,
      addr.state,
      addr.pincode,
      (latest_als.login_time AT TIME ZONE current_setting('TimeZone')) AS last_login_timestamptz
    FROM finance_detail fd
    LEFT JOIN users u ON (
      CASE
        WHEN $4::boolean = false THEN u.id = $2::uuid
        ELSE (
          u.id = $2::uuid
          OR (
            $3::text IS NOT NULL
            AND LOWER(u.username) = LOWER($3::text)
            AND EXISTS (
              SELECT 1 FROM user_allowed_companies uac_match
              WHERE uac_match.user_id = u.id AND uac_match.finance_id = fd.id
            )
          )
        )
      END
    )
    LEFT JOIN owner o ON ($4::boolean = true AND o.id = $2::uuid)
    LEFT JOIN user_allowed_companies uac
      ON uac.user_id = u.id AND uac.finance_id = fd.id
    LEFT JOIN LATERAL (
      SELECT
        ud_sub.staff_name,
        ud_sub.staff_code,
        ud_sub.joining_date,
        ud_sub.experience_years,
        ud_sub.education_qualification,
        ud_sub.photo
      FROM users_details ud_sub
      WHERE ud_sub.finance_id = fd.id
        AND u.id IS NOT NULL
        AND (ud_sub.user_id = u.id OR ud_sub.id = u.id)
      ORDER BY (ud_sub.user_id = u.id) DESC, ud_sub.created_at DESC
      LIMIT 1
    ) ud ON true
    LEFT JOIN LATERAL (
      SELECT
        a_sub.house_no,
        a_sub.street,
        a_sub.street_name,
        a_sub.village,
        a_sub.land_mark,
        a_sub.address,
        a_sub.city,
        a_sub.district,
        a_sub.state,
        a_sub.pincode
      FROM address_history ah
      JOIN addresses a_sub ON a_sub.id = ah.address_id
      WHERE u.id IS NOT NULL
        AND ah.entity_type = 'user'
        AND ah.entity_id = u.id::text
        AND ah.is_current = 1
      ORDER BY ah.changed_at DESC, ah.id DESC
      LIMIT 1
    ) addr ON true
    LEFT JOIN LATERAL (
      SELECT als_sub.login_time
      FROM agent_login_sessions als_sub
      WHERE u.id IS NOT NULL
        AND als_sub.user_id = u.id
      ORDER BY als_sub.login_time DESC, als_sub.id DESC
      LIMIT 1
    ) latest_als ON true
    WHERE fd.id = $1::uuid
    LIMIT 1
  `;

  const params = [financeId, principalId, ownerUsername || null, Boolean(isOwnerToken)];
  let res;
  try {
    res = await queryable.query(buildSql(true), params);
  } catch (err) {
    if (err && err.code === '42703') {
      res = await queryable.query(buildSql(false), params);
    } else {
      throw err;
    }
  }

  const row = res?.rows?.[0];
  if (!row) {
    const err = new Error('Finance company not found');
    err.statusCode = 404;
    throw err;
  }

  const todayIstStr = getIstDateString(nowDate);

  // Case 1: Owner principal without a corresponding `users` row (Decision F)
  if (isOwnerToken && !row.user_id) {
    if (!row.owner_id) {
      const err = new Error('Owner account not found');
      err.statusCode = 404;
      throw err;
    }

    const joiningDate = row.owner_created_date || '-';
    const isActive = Number(row.owner_is_active) === 1;

    return {
      resolvedUserId: null,
      profile: {
        id: String(row.owner_id),
        name: row.owner_username,
        username: row.owner_username,
        email: '-',
        phone: '-',
        role: 'Owner',
        rawRole: 'owner',
        staffCode: '-',
        financeCompany: row.finance_name || '-',
        joiningDate,
        experience: computeExperienceDisplay(0, joiningDate, todayIstStr),
        qualification: '-',
        address: '-',
        photo: null,
        status: isActive ? 'Active' : 'Inactive',
        // Documented: isOnline is always true for the caller's own profile since they are making this request
        isOnline: true,
        lastLogin: null,
        lastPasswordChange: row.owner_last_password_change || '-',
      },
    };
  }

  // Case 2: Standard `users` row (or owner with a linked `users` row)
  if (!row.user_id) {
    const err = new Error('User profile not found');
    err.statusCode = 404;
    throw err;
  }

  const rawRole = isOwnerToken
    ? 'owner'
    : String(row.company_role || 'agent').toLowerCase();
  const joiningDate =
    row.ud_joining_date ||
    row.company_assigned_date ||
    row.company_created_date ||
    row.user_created_date ||
    '-';

  const isUserActive =
    Number(row.user_is_active) === 1 &&
    (row.company_is_active === null ||
      row.company_is_active === undefined ||
      Number(row.company_is_active) === 1);

  const photoUrl = await resolvePhotoUrl(row.photo);
  const lastLoginIso = row.last_login_timestamptz
    ? new Date(row.last_login_timestamptz).toISOString()
    : null;

  const lastPasswordChange =
    row.user_last_password_change ||
    row.owner_last_password_change ||
    '-';

  return {
    resolvedUserId: String(row.user_id),
    profile: {
      id: String(row.user_id),
      name: row.staff_name || row.user_username,
      username: row.user_username,
      email: row.user_email || '-',
      phone: row.user_phone || '-',
      role: formatRoleDisplay(rawRole),
      rawRole,
      staffCode: row.staff_code || '-',
      financeCompany: row.finance_name || '-',
      joiningDate,
      experience: computeExperienceDisplay(row.experience_years, joiningDate, todayIstStr),
      qualification: row.education_qualification || '-',
      address: assembleAddress(row),
      photo: photoUrl,
      status: isUserActive ? 'Active' : 'Inactive',
      // Documented: isOnline is always true for the caller's own profile since they are making this request
      isOnline: true,
      lastLogin: lastLoginIso,
      lastPasswordChange,
    },
  };
}

/**
 * Build empty 6-month arrays ending in the current IST month (used when owner has no `users` row)
 */
function buildEmptySixMonthPerformance(nowDate = new Date()) {
  const istDateStr = getIstDateString(nowDate);
  const [curYear, curMonth] = istDateStr.split('-').map(Number);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const collectionTrend = [];
  const performanceMonthly = [];

  for (let offset = 5; offset >= 0; offset--) {
    let y = curYear;
    let m = curMonth - offset;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    const monthLabel = monthNames[m - 1];
    collectionTrend.push({ monthKey, month: monthLabel, amount: 0, collected: 0 });
    performanceMonthly.push({ monthKey, month: monthLabel, rate: 0, score: 0 });
  }

  return {
    totalCustomers: 0,
    totalCollections: 0,
    monthlyPerformance: 0,
    assignedLoans: 0,
    recoveryRate: 0,
    collectionTrend,
    performanceMonthly,
  };
}

/**
 * Section 2 Query: Fetch all performance KPIs & both 6-month charts in ONE query
 */
async function fetchPerformanceSection(queryable, { financeId, userId, nowDate }) {
  if (!userId) {
    return buildEmptySixMonthPerformance(nowDate);
  }

  // Note on assignedLoans: `customer_agent_assignments` does not have a `loan_id` column,
  // so `assignedLoans` counts distinct latest loans (`loans` ordered by hp_date DESC, id DESC)
  // for customers assigned to this user in this finance.
  const sql = `
    WITH ist_anchor AS (
      SELECT
        DATE_TRUNC('month', ($3::timestamptz AT TIME ZONE 'Asia/Kolkata'))::date AS current_month_start,
        TO_CHAR(($3::timestamptz AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM') AS current_month_key
    ),
    month_spine AS (
      SELECT
        gs::date AS month_start,
        TO_CHAR(gs::date, 'YYYY-MM') AS month_key,
        TO_CHAR(gs::date, 'Mon') AS month_label
      FROM ist_anchor,
      LATERAL generate_series(
        (ist_anchor.current_month_start - INTERVAL '5 months')::date,
        ist_anchor.current_month_start,
        INTERVAL '1 month'
      ) AS gs
    ),
    user_identifiers AS (
      SELECT DISTINCT LOWER(TRIM(v.val)) AS norm_val
      FROM users u
      LEFT JOIN users_details ud
        ON (ud.user_id = u.id OR ud.id = u.id) AND ud.finance_id = $1::uuid
      CROSS JOIN LATERAL (
        VALUES (u.username), (ud.staff_name), (ud.staff_code)
      ) AS v(val)
      WHERE u.id = $2::uuid
        AND v.val IS NOT NULL
        AND TRIM(v.val) <> ''
    ),
    finance_identifier_counts AS (
      SELECT
        LOWER(TRIM(v.val)) AS norm_val,
        COUNT(DISTINCT u_all.id) AS user_cnt
      FROM users u_all
      LEFT JOIN user_allowed_companies uac_all
        ON uac_all.user_id = u_all.id AND uac_all.finance_id = $1::uuid
      LEFT JOIN users_details ud_all
        ON (ud_all.user_id = u_all.id OR ud_all.id = u_all.id) AND ud_all.finance_id = $1::uuid
      CROSS JOIN LATERAL (
        VALUES (u_all.username), (ud_all.staff_name), (ud_all.staff_code)
      ) AS v(val)
      WHERE (uac_all.finance_id = $1::uuid OR ud_all.finance_id = $1::uuid OR u_all.id = $2::uuid)
        AND v.val IS NOT NULL
        AND TRIM(v.val) <> ''
      GROUP BY LOWER(TRIM(v.val))
    ),
    unambiguous_user_identifiers AS (
      SELECT ui.norm_val
      FROM user_identifiers ui
      JOIN finance_identifier_counts fic ON fic.norm_val = ui.norm_val
      WHERE fic.user_cnt = 1
    ),
    attributed_payments AS (
      SELECT
        p.id,
        p.payment_date,
        TO_CHAR(p.payment_date, 'YYYY-MM') AS month_key,
        COALESCE(p.amount, 0)::numeric AS amount
      FROM payments p
      WHERE p.finance_id = $1::uuid
        AND p.payment_status IS DISTINCT FROM 'cancelled'
        AND (
          p.collected_by_id = $2::uuid
          OR (
            p.collected_by_id IS NULL
            AND p.collected_by IS NOT NULL
            AND LOWER(TRIM(p.collected_by)) IN (SELECT norm_val FROM unambiguous_user_identifiers)
          )
        )
    ),
    assign_windowed AS (
      SELECT
        caa.id AS assignment_id,
        caa.customer_id,
        caa.agent_id,
        caa.finance_id,
        caa.status AS raw_status,
        (caa.assigned_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date AS assigned_date_ist,
        TO_CHAR(
          (caa.assigned_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date,
          'YYYY-MM'
        ) AS assigned_month_key,
        (
          SELECT MIN((next_caa.assigned_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date)
          FROM customer_agent_assignments next_caa
          WHERE next_caa.customer_id = caa.customer_id
            AND next_caa.finance_id = caa.finance_id
            AND (next_caa.assigned_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date
                > (caa.assigned_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date
        ) AS next_assigned_date_ist
      FROM customer_agent_assignments caa
      WHERE caa.finance_id = $1::uuid
        AND caa.agent_id = $2::uuid
    ),
    assign_evaluated AS (
      SELECT
        aw.*,
        CASE
          WHEN aw.raw_status IN ('collected', 'visited') THEN true
          WHEN EXISTS (
            SELECT 1 FROM payments p
            WHERE p.customer_id = aw.customer_id
              AND p.finance_id = aw.finance_id
              AND p.payment_status IS DISTINCT FROM 'cancelled'
              AND COALESCE(p.amount, 0) > 0
              AND p.payment_date >= aw.assigned_date_ist
              AND (aw.next_assigned_date_ist IS NULL OR p.payment_date < aw.next_assigned_date_ist)
          ) THEN true
          WHEN EXISTS (
            SELECT 1 FROM seizing_vehicle sv
            WHERE sv.customer_id = aw.customer_id
              AND sv.finance_id = aw.finance_id
              AND sv.status IS DISTINCT FROM 'Cancelled'
              AND sv.seizing_date >= aw.assigned_date_ist
              AND (aw.next_assigned_date_ist IS NULL OR sv.seizing_date < aw.next_assigned_date_ist)
          ) THEN true
          WHEN EXISTS (
            SELECT 1 FROM staff_customer_visits scv
            WHERE scv.customer_id = aw.customer_id
              AND scv.user_id = aw.agent_id
              AND (scv.visit_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date >= aw.assigned_date_ist
              AND (
                aw.next_assigned_date_ist IS NULL
                OR (scv.visit_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date < aw.next_assigned_date_ist
              )
          ) THEN true
          WHEN EXISTS (
            SELECT 1 FROM assignment_history ah
            WHERE ah.assignment_id = aw.assignment_id
              AND ah.finance_id = aw.finance_id
              AND ah.status IN ('visited', 'collected')
              AND (ah.changed_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date >= aw.assigned_date_ist
          ) THEN true
          ELSE false
        END AS is_completed
      FROM assign_windowed aw
    ),
    assigned_loans_cte AS (
      SELECT COUNT(DISTINCT l.id)::int AS assigned_loans_count
      FROM (SELECT DISTINCT customer_id FROM assign_evaluated) ac
      JOIN LATERAL (
        SELECT l_sub.id
        FROM loans l_sub
        WHERE l_sub.customer_id = ac.customer_id
          AND l_sub.finance_id = $1::uuid
        ORDER BY l_sub.hp_date DESC NULLS LAST, l_sub.id DESC
        LIMIT 1
      ) l ON true
    ),
    monthly_collections AS (
      SELECT
        ms.month_key,
        ms.month_label,
        COALESCE(ROUND(SUM(ap.amount), 2), 0)::float AS amount
      FROM month_spine ms
      LEFT JOIN attributed_payments ap ON ap.month_key = ms.month_key
      GROUP BY ms.month_start, ms.month_key, ms.month_label
      ORDER BY ms.month_start ASC
    ),
    monthly_perf AS (
      SELECT
        ms.month_key,
        ms.month_label,
        CASE
          WHEN COUNT(ae.assignment_id) > 0
            THEN ROUND((COUNT(ae.assignment_id) FILTER (WHERE ae.is_completed)::numeric / COUNT(ae.assignment_id)::numeric) * 100)::int
          ELSE 0
        END AS rate
      FROM month_spine ms
      LEFT JOIN assign_evaluated ae ON ae.assigned_month_key = ms.month_key
      GROUP BY ms.month_start, ms.month_key, ms.month_label
      ORDER BY ms.month_start ASC
    )
    SELECT
      (SELECT COUNT(DISTINCT customer_id)::int FROM assign_evaluated) AS total_customers,
      (SELECT assigned_loans_count FROM assigned_loans_cte) AS assigned_loans,
      (SELECT COALESCE(ROUND(SUM(amount), 2), 0)::float FROM attributed_payments) AS total_collections,
      (
        SELECT
          CASE
            WHEN COUNT(*) > 0
              THEN ROUND((COUNT(*) FILTER (WHERE is_completed)::numeric / COUNT(*)::numeric) * 100)::int
            ELSE 0
          END
        FROM assign_evaluated ae, ist_anchor ia
        WHERE ae.assigned_month_key = ia.current_month_key
      ) AS monthly_performance,
      (
        SELECT
          CASE
            WHEN COUNT(*) > 0
              THEN ROUND((COUNT(*) FILTER (WHERE is_completed)::numeric / COUNT(*)::numeric) * 100)::int
            ELSE 0
          END
        FROM assign_evaluated
      ) AS recovery_rate,
      (
        SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'monthKey', mc.month_key,
            'month', mc.month_label,
            'amount', mc.amount
          )
        )
        FROM monthly_collections mc
      ) AS collection_trend,
      (
        SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'monthKey', mp.month_key,
            'month', mp.month_label,
            'rate', mp.rate
          )
        )
        FROM monthly_perf mp
      ) AS performance_monthly
  `;

  const res = await queryable.query(sql, [financeId, userId, nowDate.toISOString()]);
  const row = res?.rows?.[0];
  if (!row) {
    return buildEmptySixMonthPerformance(nowDate);
  }

  return {
    totalCustomers: Number(row.total_customers) || 0,
    totalCollections: Number(row.total_collections) || 0,
    monthlyPerformance: Number(row.monthly_performance) || 0,
    assignedLoans: Number(row.assigned_loans) || 0,
    recoveryRate: Number(row.recovery_rate) || 0,
    collectionTrend: Array.isArray(row.collection_trend)
      ? row.collection_trend.map((item) => {
          const amt = Number(item.amount) || 0;
          return {
            monthKey: item.monthKey,
            month: item.month,
            amount: amt,
            collected: amt,
          };
        })
      : buildEmptySixMonthPerformance(nowDate).collectionTrend,
    performanceMonthly: Array.isArray(row.performance_monthly)
      ? row.performance_monthly.map((item) => {
          const rVal = Number(item.rate) || 0;
          return {
            monthKey: item.monthKey,
            month: item.month,
            rate: rVal,
            score: rVal,
          };
        })
      : buildEmptySixMonthPerformance(nowDate).performanceMonthly,
  };
}

/**
 * Build empty 7-day activityLog ending today in IST (used when owner has no `users` row)
 */
function buildEmptySevenDayActivityLog(nowDate = new Date()) {
  const todayIstStr = getIstDateString(nowDate);
  const [tY, tM, tD] = todayIstStr.split('-').map(Number);
  const baseUtc = Date.UTC(tY, tM - 1, tD, 12, 0, 0);
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  });

  const items = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(baseUtc - offset * 24 * 60 * 60 * 1000);
    const dateStr = getIstDateString(d);
    const dayLabel = dayFormatter.format(d);
    items.push({
      date: dateStr,
      day: dayLabel,
      login: '-',
      logout: '-',
      duration: '-',
      firstLogin: null,
      lastLogout: null,
      loginAt: null,
      isActiveNow: false,
      durationMinutes: null,
      device: '-',
      ip: '-',
      sessions: 0,
    });
  }
  return items;
}

/**
 * Section 3 Query: Fetch 7-day IST login activity in ONE query
 */
async function fetchActivityLogSection(queryable, { userId, nowDate }) {
  if (!userId) {
    return buildEmptySevenDayActivityLog(nowDate);
  }

  const sql = `
    WITH ist_anchor AS (
      SELECT
        ($2::timestamptz AT TIME ZONE 'Asia/Kolkata') AS now_ist,
        ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AS today_ist
    ),
    day_spine AS (
      SELECT
        gs::date AS day_date,
        TO_CHAR(gs::date, 'YYYY-MM-DD') AS date_str,
        TO_CHAR(gs::date, 'Dy') AS day_label,
        (gs::date + INTERVAL '1 day')::timestamp AS day_end_ist
      FROM ist_anchor,
      LATERAL generate_series(
        (ist_anchor.today_ist - INTERVAL '6 days')::date,
        ist_anchor.today_ist,
        INTERVAL '1 day'
      ) AS gs
    ),
    user_sessions AS (
      SELECT
        als.id,
        (als.login_time AT TIME ZONE current_setting('TimeZone')) AS login_timestamptz,
        (als.logout_time AT TIME ZONE current_setting('TimeZone')) AS logout_timestamptz,
        (als.login_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata') AS login_ts_ist,
        (als.logout_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata') AS logout_ts_ist,
        (als.last_seen_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata') AS last_seen_ts_ist,
        (als.login_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date AS login_date_ist,
        als.device_name,
        als.platform,
        als.ip_address
      FROM agent_login_sessions als, ist_anchor ia
      WHERE als.user_id = $1::uuid
        AND (als.login_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date
            >= (ia.today_ist - INTERVAL '6 days')::date
        AND (als.login_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date
            <= ia.today_ist
    ),
    evaluated_sessions AS (
      SELECT
        us.*,
        ds.day_end_ist,
        ia.today_ist,
        ia.now_ist,
        (
          us.login_date_ist = ia.today_ist
          AND us.logout_ts_ist IS NULL
          AND (ia.now_ist - COALESCE(us.last_seen_ts_ist, us.login_ts_ist)) <= INTERVAL '${ACTIVE_SESSION_THRESHOLD_HOURS} hours'
        ) AS is_active_today,
        CASE
          -- 1. Closed session: cap logout at the login day's end (midnight IST)
          WHEN us.logout_ts_ist IS NOT NULL THEN
            GREATEST(0, EXTRACT(EPOCH FROM (LEAST(us.logout_ts_ist, ds.day_end_ist) - us.login_ts_ist)))
          -- 2. Today's open & recent session: count up to now_ist (capped at day's end)
          WHEN us.login_date_ist = ia.today_ist
               AND (ia.now_ist - COALESCE(us.last_seen_ts_ist, us.login_ts_ist)) <= INTERVAL '${ACTIVE_SESSION_THRESHOLD_HOURS} hours' THEN
            GREATEST(0, EXTRACT(EPOCH FROM (LEAST(ia.now_ist, ds.day_end_ist) - us.login_ts_ist)))
          -- 3. Past day (or stale today) session with NULL logout: use last_seen_at only if strictly after login_time; else 0
          WHEN us.last_seen_ts_ist IS NOT NULL AND us.last_seen_ts_ist > us.login_ts_ist THEN
            GREATEST(0, EXTRACT(EPOCH FROM (LEAST(us.last_seen_ts_ist, ds.day_end_ist) - us.login_ts_ist)))
          ELSE 0
        END AS session_duration_seconds,
        ROW_NUMBER() OVER (
          PARTITION BY us.login_date_ist
          ORDER BY us.login_ts_ist DESC, us.id DESC
        ) AS rn_latest
      FROM user_sessions us
      JOIN day_spine ds ON ds.day_date = us.login_date_ist
      CROSS JOIN ist_anchor ia
    )
    SELECT
      ds.date_str AS date,
      ds.day_label AS day,
      MIN(es.login_timestamptz) AS first_login,
      MAX(es.logout_timestamptz) AS last_logout,
      COALESCE(BOOL_OR(es.is_active_today), false) AS is_active_now,
      CASE
        WHEN COUNT(es.id) > 0 THEN ROUND(SUM(es.session_duration_seconds) / 60.0)::int
        ELSE NULL
      END AS duration_minutes,
      MAX(CASE WHEN es.rn_latest = 1 THEN COALESCE(es.platform, '') || ' ' || COALESCE(es.device_name, '') END) AS latest_device_raw,
      MAX(CASE WHEN es.rn_latest = 1 THEN es.ip_address END) AS latest_ip,
      COUNT(es.id)::int AS sessions
    FROM day_spine ds
    LEFT JOIN evaluated_sessions es ON es.login_date_ist = ds.day_date
    GROUP BY ds.day_date, ds.date_str, ds.day_label
    ORDER BY ds.day_date ASC
  `;

  const res = await queryable.query(sql, [userId, nowDate.toISOString()]);
  const rows = res?.rows || [];

  return rows.map((r) => {
    const sessions = Number(r.sessions) || 0;
    const isActiveNow = Boolean(r.is_active_now);
    let device = '-';
    if (sessions > 0) {
      const rawDev = String(r.latest_device_raw || '');
      device = /mobile|android|ios|iphone|ipad/i.test(rawDev) ? 'Mobile' : 'Desktop';
    }

    const firstLoginIso = r.first_login ? new Date(r.first_login).toISOString() : null;
    const lastLogoutIso = isActiveNow ? null : (r.last_logout ? new Date(r.last_logout).toISOString() : null);
    const durationMinutes = sessions > 0 && r.duration_minutes !== null ? Number(r.duration_minutes) : null;

    return {
      date: r.date,
      day: r.day,
      login: firstLoginIso ? formatIstTime(firstLoginIso) : '-',
      logout: isActiveNow ? '-' : (lastLogoutIso ? formatIstTime(lastLogoutIso) : '-'),
      duration: durationMinutes !== null ? formatDurationDisplay(durationMinutes) : '-',
      firstLogin: firstLoginIso,
      lastLogout: lastLogoutIso,
      loginAt: firstLoginIso,
      isActiveNow,
      durationMinutes,
      device,
      ip: sessions > 0 ? (r.latest_ip || '-') : '-',
      sessions,
    };
  });
}

/**
 * Section 4 Query: Fetch assignedAreas and assignedCustomers in ONE query (zero N+1)
 */
async function fetchAssignedDataSection(queryable, { financeId, userId, nowDate }) {
  if (!userId) {
    return {
      assignedAreas: [],
      areaCount: 0,
      assignedCustomers: [],
      customerCount: 0,
      loanCount: 0,
      hasMore: false,
    };
  }

  const sql = `
    WITH ist_anchor AS (
      SELECT TO_CHAR(($3::timestamptz AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM') AS current_month_key
    ),
    areas_cte AS (
      SELECT COALESCE(
        JSON_AGG(DISTINCT area_name ORDER BY area_name),
        '[]'::json
      ) AS areas_json
      FROM (
        SELECT
          CASE
            WHEN aaa.street_name IS NOT NULL AND TRIM(aaa.street_name) <> '' AND UPPER(TRIM(aaa.street_name)) <> 'N/A'
              THEN TRIM(aaa.street_name)
            ELSE TRIM(aaa.city)
          END AS area_name
        FROM agent_area_allocations aaa
        WHERE aaa.finance_id = $1::uuid
          AND aaa.user_id = $2::uuid
      ) sub
      WHERE area_name IS NOT NULL AND area_name <> ''
    ),
    eligible_assignments AS (
      SELECT DISTINCT ON (caa.customer_id)
        caa.customer_id,
        caa.assigned_at,
        caa.status AS assignment_status
      FROM customer_agent_assignments caa, ist_anchor ia
      WHERE caa.finance_id = $1::uuid
        AND caa.agent_id = $2::uuid
        AND (
          caa.status IN ('pending', 'visited')
          OR TO_CHAR(
            (caa.assigned_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date,
            'YYYY-MM'
          ) = ia.current_month_key
        )
      ORDER BY caa.customer_id, caa.assigned_at DESC, caa.id DESC
    ),
    customer_loan_rows AS (
      SELECT
        c.id AS customer_id,
        c.hplno,
        c.cname AS customer_name,
        c.loan_status,
        ea.assigned_at,
        l.id AS loan_id,
        l.hp_amount,
        l.net_payable,
        l.due_month AS total_installments,
        l.due_amount AS installment_amount,
        TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS hp_date,
        TO_CHAR(l.due_date, 'YYYY-MM-DD') AS first_due_date,
        COALESCE(pay_agg.total_paid, 0) AS total_paid,
        COALESCE(pay_agg.installments_paid, 0) AS installments_paid
      FROM eligible_assignments ea
      JOIN customers c ON c.id = ea.customer_id AND c.finance_id = $1::uuid
      LEFT JOIN LATERAL (
        SELECT l_sub.*
        FROM loans l_sub
        WHERE l_sub.customer_id = c.id
          AND l_sub.finance_id = $1::uuid
        ORDER BY l_sub.hp_date DESC NULLS LAST, l_sub.id DESC
        LIMIT 1
      ) l ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(p.amount) AS total_paid,
          COUNT(*) FILTER (WHERE p.status = 'paid') AS installments_paid
        FROM payments p
        WHERE p.customer_id = c.id
          AND p.finance_id = $1::uuid
          AND p.payment_status IS DISTINCT FROM 'cancelled'
      ) pay_agg ON true
      ORDER BY ea.assigned_at DESC, c.hplno ASC
    ),
    totals_cte AS (
      SELECT
        COUNT(*)::int AS customer_count,
        COUNT(DISTINCT loan_id) FILTER (WHERE loan_id IS NOT NULL)::int AS loan_count
      FROM customer_loan_rows
    ),
    capped_customers AS (
      SELECT *
      FROM customer_loan_rows
      LIMIT $4::int
    )
    SELECT
      (SELECT areas_json FROM areas_cte) AS assigned_areas,
      (SELECT customer_count FROM totals_cte) AS customer_count,
      (SELECT loan_count FROM totals_cte) AS loan_count,
      COALESCE(
        (SELECT JSON_AGG(row_to_json(cc)) FROM capped_customers cc),
        '[]'::json
      ) AS customers_json
  `;

  const res = await queryable.query(sql, [
    financeId,
    userId,
    nowDate.toISOString(),
    ASSIGNED_CUSTOMERS_CAP,
  ]);

  const row = res?.rows?.[0] || {};
  const assignedAreas = Array.isArray(row.assigned_areas) ? row.assigned_areas : [];
  const rawCustomers = Array.isArray(row.customers_json) ? row.customers_json : [];
  const customerCount = Number(row.customer_count) || 0;
  const loanCount = Number(row.loan_count) || 0;

  const todayIstStr = getIstDateString(nowDate);

  // Batch compute financial status in memory using existing `calculateCustomerFinancials` (zero N+1 queries)
  const assignedCustomers = rawCustomers.map((r) => {
    const fin = calculateCustomerFinancials(r, todayIstStr);
    let status = 'Active';
    if (String(r.loan_status || '').toLowerCase() === 'close' || fin.balance <= 0) {
      status = 'Closed';
    } else if (fin.overdueDays > 0) {
      status = 'Overdue';
    }

    const rawHpl = r.hplno !== null && r.hplno !== undefined ? String(r.hplno).trim() : '';
    const formattedHpl = rawHpl
      ? rawHpl.toUpperCase().startsWith('HPL')
        ? rawHpl
        : `HPL${rawHpl.padStart(3, '0')}`
      : '-';

    const loanAmount =
      Number(r.hp_amount) ||
      Number(r.net_payable) ||
      Number(fin.totalDue) ||
      0;

    return {
      id: String(r.customer_id),
      hplno: formattedHpl,
      name: r.customer_name || '-',
      loanAmount,
      status,
    };
  });

  return {
    assignedAreas,
    areaCount: assignedAreas.length,
    assignedCustomers,
    customerCount,
    loanCount,
    hasMore: customerCount > ASSIGNED_CUSTOMERS_CAP,
  };
}

/**
 * Main entry point for `GET /api/user/profile-overview`
 */
async function getUserProfileOverview(req, options = {}) {
  const queryable = options.queryable || db;
  const nowDate = options.now instanceof Date ? options.now : new Date();

  const financeId = req.financeId ? String(req.financeId).trim() : '';
  if (!isValidUuid(financeId)) {
    const err = new Error('Valid active finance context is required');
    err.statusCode = 400;
    throw err;
  }

  const isOwnerToken = Boolean(req.owner?.id);
  const principalId = isOwnerToken
    ? String(req.owner.id).trim()
    : req.user?.id
      ? String(req.user.id).trim()
      : '';

  if (!isValidUuid(principalId)) {
    const err = new Error('Authenticated user or owner context is required');
    err.statusCode = 401;
    throw err;
  }

  const ownerUsername = req.owner?.username || null;

  // 1. Fetch profile section (1 query)
  const { resolvedUserId, profile } = await fetchProfileSection(queryable, {
    financeId,
    principalId,
    ownerUsername,
    isOwnerToken,
    nowDate,
  });

  // 2–4. Fetch performance, activityLog, and assignedData (1 query per section)
  const [performance, activityLog, assignedData] = await Promise.all([
    fetchPerformanceSection(queryable, { financeId, userId: resolvedUserId, nowDate }),
    fetchActivityLogSection(queryable, { userId: resolvedUserId, nowDate }),
    fetchAssignedDataSection(queryable, { financeId, userId: resolvedUserId, nowDate }),
  ]);

  const responsePayload = {
    success: true,
    profile,
    performance,
    activityLog,
    assignedData,
  };

  assertNoSensitiveFields(responsePayload);

  return responsePayload;
}

module.exports = {
  getUserProfileOverview,
  computeExperienceDisplay,
  assembleAddress,
  assertNoSensitiveFields,
  getIstDateString,
  ACTIVE_SESSION_THRESHOLD_HOURS,
  ASSIGNED_CUSTOMERS_CAP,
};


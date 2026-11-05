/**
 * staffLoginReport.service.js
 *
 * PostgreSQL service for Staff Login Report.
 * Groups session logs by user and date, computes duration and office distances,
 * aggregates KPIs over the entire filtered scope, and enforces tenant isolation.
 */

const { db } = require('../../config/database.config');

const STALE_SESSION_HOURS = 16;
const MAX_SEARCH_LENGTH = 100;
const MAX_DATE_RANGE_DAYS = 366;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Cache for column availability in live DB
let cachedColumnsAvailable = null;

/**
 * Checks information_schema once to discover optional columns
 */
async function getColumnsAvailable(queryable = db) {
  if (cachedColumnsAvailable) {
    return cachedColumnsAvailable;
  }

  try {
    const { rows } = await queryable.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_name IN ('agent_login_sessions', 'finance_detail')
    `);

    const colSet = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));

    cachedColumnsAvailable = {
      coordinates:
        colSet.has('agent_login_sessions.login_lat') &&
        colSet.has('agent_login_sessions.login_lng'),
      officeDistance:
        colSet.has('agent_login_sessions.distance_from_office') ||
        (colSet.has('finance_detail.office_lat') && colSet.has('finance_detail.office_lng')),
      logoutReason: colSet.has('agent_login_sessions.logout_reason'),
    };
  } catch (err) {
    console.warn('⚠️ Unable to query information_schema for optional columns, defaulting to true:', err.message);
    cachedColumnsAvailable = {
      coordinates: true,
      officeDistance: true,
      logoutReason: true,
    };
  }

  return cachedColumnsAvailable;
}

/**
 * Helper to escape SQL LIKE wildcard characters (_, %, \)
 */
function escapeLike(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Validates a YYYY-MM-DD date string
 */
function isValidDateString(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

/**
 * Formats seconds into "Xh Ym"
 */
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

/**
 * Main query function for Staff Login Report.
 *
 * @param {Object} params
 * @param {string} params.financeId - Active finance UUID
 * @param {string} [params.dateFrom] - YYYY-MM-DD
 * @param {string} [params.dateTo] - YYYY-MM-DD
 * @param {string} [params.role] - Filter by staff role
 * @param {string} [params.search] - Search name, code, username
 * @param {boolean} [params.isOwner=false] - Whether requester is verified owner
 * @param {number} [params.limit=100] - Limit (max 500)
 * @param {number} [params.offset=0] - Offset
 * @param {Object} [queryable=db] - Database client or pool
 */
async function getStaffLoginReport(
  {
    financeId,
    dateFrom,
    dateTo,
    role,
    search,
    isOwner = false,
    limit = DEFAULT_LIMIT,
    offset = 0,
  },
  queryable = db
) {
  if (!financeId) {
    const error = new Error('Finance context is required');
    error.statusCode = 400;
    throw error;
  }

  // Column availability
  const columnsAvailable = await getColumnsAvailable(queryable);

  // Validate or default dates (last 7 days by default)
  const today = new Date();
  const currentTo = today.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  const currentFrom = sevenDaysAgo.toISOString().slice(0, 10);

  const effDateFrom = dateFrom ? String(dateFrom).trim() : currentFrom;
  const effDateTo = dateTo ? String(dateTo).trim() : currentTo;

  if (!isValidDateString(effDateFrom) || !isValidDateString(effDateTo)) {
    const error = new Error('Invalid date format. Expected YYYY-MM-DD.');
    error.statusCode = 400;
    throw error;
  }

  const dFrom = new Date(effDateFrom + 'T00:00:00Z');
  const dTo = new Date(effDateTo + 'T00:00:00Z');

  if (dFrom > dTo) {
    const error = new Error('dateFrom cannot be greater than dateTo');
    error.statusCode = 400;
    throw error;
  }

  const diffDays = Math.ceil((dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > MAX_DATE_RANGE_DAYS) {
    const error = new Error(`Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days`);
    error.statusCode = 400;
    throw error;
  }

  // Validate role if supplied
  const validRoles = ['owner', 'admin', 'agent', 'staff'];
  let effRole = null;
  if (role && role !== 'all') {
    const normalizedRole = String(role).trim().toLowerCase();
    if (!validRoles.includes(normalizedRole)) {
      const error = new Error(`Invalid role filter. Must be one of: ${validRoles.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }
    effRole = normalizedRole;
  }

  // Validate search
  let effSearch = null;
  if (search) {
    const trimmed = String(search).trim();
    if (trimmed.length > MAX_SEARCH_LENGTH) {
      const error = new Error(`Search term exceeds maximum of ${MAX_SEARCH_LENGTH} characters`);
      error.statusCode = 400;
      throw error;
    }
    if (trimmed.length > 0) {
      effSearch = escapeLike(trimmed);
    }
  }

  // Validate pagination
  const effLimit = Math.max(1, Math.min(MAX_LIMIT, parseInt(limit, 10) || DEFAULT_LIMIT));
  const effOffset = Math.max(0, parseInt(offset, 10) || 0);

  // Build parameterized query
  const queryParams = [financeId, effDateFrom, effDateTo];
  let filterConditions = '';

  if (effRole) {
    queryParams.push(effRole);
    filterConditions += ` AND uac.role = $${queryParams.length}`;
  }

  if (effSearch) {
    queryParams.push(`%${effSearch}%`);
    const pIdx = queryParams.length;
    filterConditions += ` AND (
      COALESCE(ud.staff_name, u.username) ILIKE $${pIdx} 
      OR COALESCE(ud.staff_code, '') ILIKE $${pIdx} 
      OR u.username ILIKE $${pIdx}
    )`;
  }

  // Main data query with CTE
  const dataSql = `
    WITH base_sessions AS (
      SELECT 
        als.id AS session_id,
        als.user_id,
        als.login_time,
        als.logout_time,
        als.device_name,
        als.platform,
        als.ip_address,
        als.login_lat,
        als.login_lng,
        als.location_label,
        als.logout_reason,
        als.last_seen_at,
        TO_CHAR(als.login_time, 'YYYY-MM-DD') AS login_date,
        TO_CHAR(als.login_time, 'HH12:MI AM') AS login_formatted,
        CASE 
          WHEN als.logout_time IS NOT NULL THEN TO_CHAR(als.logout_time, 'HH12:MI AM')
          ELSE 'Active'
        END AS logout_formatted,
        -- Duration calculation:
        GREATEST(0, CASE 
          WHEN als.duration_seconds IS NOT NULL AND als.duration_seconds > 0 THEN als.duration_seconds
          WHEN als.logout_time IS NOT NULL THEN EXTRACT(EPOCH FROM (als.logout_time - als.login_time))::integer
          WHEN (NOW() - als.login_time) < INTERVAL '${STALE_SESSION_HOURS} hours' 
            THEN EXTRACT(EPOCH FROM (COALESCE(als.last_seen_at, NOW()) - als.login_time))::integer
          ELSE 0
        END) AS duration_seconds,
        -- Reason calculation:
        CASE 
          WHEN als.logout_reason IS NOT NULL AND als.logout_reason <> '' THEN als.logout_reason
          WHEN als.logout_time IS NULL AND (NOW() - als.login_time) < INTERVAL '${STALE_SESSION_HOURS} hours' THEN 'active'
          WHEN als.logout_time IS NULL THEN 'no_logout'
          ELSE 'manual'
        END AS resolved_reason,
        -- Distance calculation:
        CASE 
          WHEN fd.office_lat IS NOT NULL AND fd.office_lng IS NOT NULL 
               AND als.login_lat IS NOT NULL AND als.login_lng IS NOT NULL 
          THEN fn_calculate_distance_km(fd.office_lat, fd.office_lng, als.login_lat, als.login_lng)
          WHEN als.distance_from_office IS NOT NULL THEN als.distance_from_office
          ELSE NULL
        END AS calculated_distance_km,
        u.username,
        uac.role,
        ud.staff_name,
        ud.staff_code,
        fd.finance_name,
        ROW_NUMBER() OVER (
          PARTITION BY als.user_id, TO_CHAR(als.login_time, 'YYYY-MM-DD') 
          ORDER BY als.login_time DESC, als.id DESC
        ) AS rn_latest
      FROM agent_login_sessions als
      JOIN users u ON u.id = als.user_id
      JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
      LEFT JOIN users_details ud ON ud.user_id = als.user_id AND ud.finance_id = $1::uuid
      JOIN finance_detail fd ON fd.id = $1::uuid
      WHERE als.login_time >= $2::date
        AND als.login_time < ($3::date + INTERVAL '1 day')
        ${filterConditions}
    ),
    aggregated_groups AS (
      SELECT 
        bs.login_date AS date,
        bs.user_id AS "userId",
        CONCAT(bs.login_date, '_', bs.user_id) AS "groupKey",
        COALESCE(MAX(bs.staff_name), MAX(bs.username)) AS "staffName",
        COALESCE(MAX(bs.staff_code), '—') AS "staffCode",
        MAX(bs.role)::text AS role,
        MAX(bs.finance_name) AS "financeName",
        MAX(bs.login_time) AS "latestLoginAt",
        SUM(bs.duration_seconds)::integer AS "totalDurationSeconds",
        COUNT(bs.session_id)::integer AS "sessionCount",
        BOOL_OR(bs.logout_time IS NULL AND (NOW() - bs.login_time) < INTERVAL '${STALE_SESSION_HOURS} hours') AS "hasActiveSession",
        ROUND(AVG(bs.calculated_distance_km)::numeric, 1)::float AS "avgDistanceKm",
        MAX(CASE WHEN bs.rn_latest = 1 THEN bs.platform END) AS "primaryPlatform",
        MAX(CASE WHEN bs.rn_latest = 1 THEN bs.device_name END) AS "primaryDevice",
        MAX(CASE WHEN bs.rn_latest = 1 THEN bs.ip_address END) AS "latestIp",
        MAX(CASE WHEN bs.rn_latest = 1 THEN bs.login_lat END)::float AS "latestLat",
        MAX(CASE WHEN bs.rn_latest = 1 THEN bs.login_lng END)::float AS "latestLng",
        MAX(CASE WHEN bs.rn_latest = 1 THEN bs.location_label END) AS "latestLocation",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', bs.session_id,
            'loginAt', bs.login_time,
            'login', bs.login_formatted,
            'logout', bs.logout_formatted,
            'durationSeconds', bs.duration_seconds,
            'duration', CONCAT(FLOOR(bs.duration_seconds / 3600), 'h ', LPAD((FLOOR((bs.duration_seconds % 3600) / 60))::text, 2, '0'), 'm'),
            'reason', bs.resolved_reason,
            'device', bs.device_name,
            'ip', bs.ip_address
          ) ORDER BY bs.login_time ASC, bs.session_id ASC
        ) AS timeline
      FROM base_sessions bs
      GROUP BY bs.login_date, bs.user_id
    )
    SELECT * FROM aggregated_groups
    ORDER BY date DESC, "latestLoginAt" DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
  `;

  // Server-side KPIs query over complete filtered scope
  const kpiSql = `
    WITH base_sessions AS (
      SELECT 
        als.id AS session_id,
        als.user_id,
        als.login_time,
        als.logout_time,
        TO_CHAR(als.login_time, 'YYYY-MM-DD') AS login_date,
        GREATEST(0, CASE 
          WHEN als.duration_seconds IS NOT NULL AND als.duration_seconds > 0 THEN als.duration_seconds
          WHEN als.logout_time IS NOT NULL THEN EXTRACT(EPOCH FROM (als.logout_time - als.login_time))::integer
          WHEN (NOW() - als.login_time) < INTERVAL '${STALE_SESSION_HOURS} hours' 
            THEN EXTRACT(EPOCH FROM (COALESCE(als.last_seen_at, NOW()) - als.login_time))::integer
          ELSE 0
        END) AS duration_seconds,
        CASE 
          WHEN fd.office_lat IS NOT NULL AND fd.office_lng IS NOT NULL 
               AND als.login_lat IS NOT NULL AND als.login_lng IS NOT NULL 
          THEN fn_calculate_distance_km(fd.office_lat, fd.office_lng, als.login_lat, als.login_lng)
          WHEN als.distance_from_office IS NOT NULL THEN als.distance_from_office
          ELSE NULL
        END AS calculated_distance_km
      FROM agent_login_sessions als
      JOIN users u ON u.id = als.user_id
      JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
      LEFT JOIN users_details ud ON ud.user_id = als.user_id AND ud.finance_id = $1::uuid
      JOIN finance_detail fd ON fd.id = $1::uuid
      WHERE als.login_time >= $2::date
        AND als.login_time < ($3::date + INTERVAL '1 day')
        ${filterConditions}
    )
    SELECT 
      COUNT(DISTINCT (user_id, login_date))::integer AS "staffDays",
      COUNT(session_id)::integer AS "totalSessions",
      ROUND(COALESCE(SUM(duration_seconds), 0) / 3600.0, 1)::float AS "totalHours",
      ROUND(AVG(calculated_distance_km)::numeric, 1)::float AS "avgDistanceKm",
      COUNT(*) FILTER (WHERE logout_time IS NULL AND (NOW() - login_time) < INTERVAL '${STALE_SESSION_HOURS} hours')::integer AS "activeSessions"
    FROM base_sessions;
  `;

  // Total count query for pagination
  const countSql = `
    WITH base_sessions AS (
      SELECT 
        als.user_id,
        TO_CHAR(als.login_time, 'YYYY-MM-DD') AS login_date
      FROM agent_login_sessions als
      JOIN users u ON u.id = als.user_id
      JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
      LEFT JOIN users_details ud ON ud.user_id = als.user_id AND ud.finance_id = $1::uuid
      JOIN finance_detail fd ON fd.id = $1::uuid
      WHERE als.login_time >= $2::date
        AND als.login_time < ($3::date + INTERVAL '1 day')
        ${filterConditions}
    )
    SELECT COUNT(DISTINCT (user_id, login_date))::integer AS total
    FROM base_sessions;
  `;

  // Execute sequentially to support single transaction clients cleanly
  const dataResult = await queryable.query(dataSql, [...queryParams, effLimit, effOffset]);
  const kpiResult = await queryable.query(kpiSql, queryParams);
  const countResult = await queryable.query(countSql, queryParams);

  const rawRows = dataResult.rows || [];
  const total = countResult.rows[0]?.total || 0;
  const kpis = kpiResult.rows[0] || {
    staffDays: 0,
    totalSessions: 0,
    totalHours: 0,
    avgDistanceKm: null,
    activeSessions: 0,
  };

  // Format rows and enforce server-side financeName removal for non-owners
  const data = rawRows.map((row) => {
    const item = {
      groupKey: row.groupKey,
      userId: row.userId,
      date: row.date,
      staffName: row.staffName,
      staffCode: row.staffCode,
      role: row.role,
      latestLoginAt: row.latestLoginAt,
      totalDurationSeconds: row.totalDurationSeconds || 0,
      sessionCount: row.sessionCount || 0,
      hasActiveSession: Boolean(row.hasActiveSession),
      avgDistanceKm: row.avgDistanceKm !== null ? Number(row.avgDistanceKm) : null,
      primaryPlatform: row.primaryPlatform || null,
      primaryDevice: row.primaryDevice || null,
      latestIp: row.latestIp || null,
      latestLat: row.latestLat !== null ? Number(row.latestLat) : null,
      latestLng: row.latestLng !== null ? Number(row.latestLng) : null,
      latestLocation: row.latestLocation || null,
      timeline: Array.isArray(row.timeline) ? row.timeline : [],
    };

    if (isOwner) {
      item.financeName = row.financeName || null;
    }

    return item;
  });

  return {
    success: true,
    data,
    total,
    kpis: {
      staffDays: kpis.staffDays || 0,
      totalSessions: kpis.totalSessions || 0,
      totalHours: Number(kpis.totalHours || 0),
      avgDistanceKm: kpis.avgDistanceKm !== null ? Number(kpis.avgDistanceKm) : null,
      activeSessions: kpis.activeSessions || 0,
    },
    columnsAvailable,
  };
}

module.exports = {
  getStaffLoginReport,
  getColumnsAvailable,
  STALE_SESSION_HOURS,
};

/**
 * Staff Dashboard Service — Real PostgreSQL-backed aggregation
 *
 * Powers `GET /api/dashboard/staff-overview` (`StaffDashboard.tsx`).
 *
 * Guarantees:
 * - Strictly READ-ONLY parameterized SELECT queries scoped by `finance_id = $1::uuid`.
 * - Reuses `PORTFOLIO_RISK_SQL` and `computeCustomerPendingSnapshot` from
 *   `homeDashboard.service.js` so `todayDues`, `unpaidCustomers`, and per-customer
 *   pending dues match the Home Dashboard and Pending Collections 100%.
 * - Reuses `calculateCustomerFinancials` from `agentAssignment.service.js` for
 *   risk classification (`high` / `medium` / `low`).
 */

const {
  PORTFOLIO_RISK_SQL,
  computeCustomerPendingSnapshot,
} = require('./homeDashboard.service');
const {
  calculateCustomerFinancials,
} = require('../agents/agentAssignment.service');

const CALL_STATUS_BUCKETS = ['Connected', 'Not Connected', 'Follow-up'];

/**
 * Returns YYYY-MM-DD in Asia/Kolkata timezone for a Date or date string.
 *
 * @param {Date|string} [now]
 * @returns {string}
 */
function getTodayIST(now = new Date()) {
  if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)) {
    return now;
  }
  const dt = now instanceof Date ? now : new Date(now);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

/**
 * Computes percentage change between today and yesterday:
 * - When `yesterday > 0`: `Math.round(((today - yesterday) / yesterday) * 100)`
 * - When `yesterday === 0 && today > 0`: `100`
 * - When both `0` (or `today === 0 && yesterday === 0`): `0`
 *
 * @param {number|string|null|undefined} todayVal
 * @param {number|string|null|undefined} yesterdayVal
 * @returns {number} Signed integer percentage
 */
function computeTrendPercent(todayVal, yesterdayVal) {
  const today = Number(todayVal) || 0;
  const yesterday = Number(yesterdayVal) || 0;

  if (yesterday > 0) {
    return Math.round(((today - yesterday) / yesterday) * 100);
  }
  if (yesterday === 0 && today > 0) {
    return 100;
  }
  return 0;
}

/**
 * Wraps `computeTrendPercent` into the `{ value: number, up: boolean }` shape
 * consumed by `StatCard` in `StaffDashboard.tsx`.
 *
 * @param {number|string|null|undefined} todayVal
 * @param {number|string|null|undefined} yesterdayVal
 * @returns {{ value: number, up: boolean }}
 */
function computeTrendBadge(todayVal, yesterdayVal) {
  const pct = computeTrendPercent(todayVal, yesterdayVal);
  return {
    value: Math.abs(pct),
    up: pct >= 0,
  };
}

/**
 * Deterministic mock call status derived from `history_entries.id` (UUID or numeric string).
 * Returns one of `'Connected' | 'Not Connected' | 'Follow-up'`.
 *
 * @param {string|number|null|undefined} id
 * @returns {'Connected' | 'Not Connected' | 'Follow-up'}
 */
function deriveMockCallStatus(id) {
  const str = String(id ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return CALL_STATUS_BUCKETS[hash % CALL_STATUS_BUCKETS.length];
}

/**
 * Formats payment delay days for the Staff Dashboard "Pending Collections" card:
 * - `0` days (or null/undefined/<= 0) -> `{ days: 0, label: 'On time', tone: 'income' }`
 * - `1..30` days                      -> `{ days: N, label: 'Overdue Nd', tone: 'pending' }`
 * - `> 30` days                       -> `{ days: N, label: 'Xm Yd delay', tone: 'expense' }`
 *
 * @param {number|string|null|undefined} days
 * @returns {{ days: number, label: string, tone: 'income' | 'pending' | 'expense' }}
 */
function formatDelay(days) {
  if (days === null || days === undefined || days === '') {
    return { days: 0, label: 'On time', tone: 'income' };
  }
  const parsed = Math.floor(Number(days));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { days: 0, label: 'On time', tone: 'income' };
  }
  if (parsed <= 30) {
    return {
      days: parsed,
      label: `Overdue ${parsed}d`,
      tone: 'pending',
    };
  }
  const months = Math.floor(parsed / 30);
  const remDays = parsed % 30;
  return {
    days: parsed,
    label: `${months}m ${remDays}d delay`,
    tone: 'expense',
  };
}

/**
 * Maps a risk level (`'high' | 'medium' | 'low'`) or customer financial row to
 * `{ riskLevel, riskLabel }` using `agentAssignment.service.js`'s rule.
 *
 * @param {object|string} rowOrLevel
 * @param {string} [asOfDate]
 * @returns {{ riskLevel: 'high' | 'medium' | 'low', riskLabel: 'High Risk' | 'Medium Risk' | 'Low Risk', overdueDays: number, balance: number }}
 */
function deriveTaskRisk(rowOrLevel, asOfDate) {
  let riskLevel = 'low';
  let overdueDays = 0;
  let balance = 0;

  if (typeof rowOrLevel === 'string') {
    const norm = rowOrLevel.trim().toLowerCase();
    if (norm === 'high' || norm === 'critical') riskLevel = 'high';
    else if (norm === 'medium') riskLevel = 'medium';
    else riskLevel = 'low';
  } else if (rowOrLevel && typeof rowOrLevel === 'object') {
    const fin = calculateCustomerFinancials(rowOrLevel, asOfDate);
    riskLevel = fin.riskLevel || 'low';
    overdueDays = Number(fin.overdueDays) || 0;
    balance = Number(fin.balance) || 0;
  }

  const riskLabel =
    riskLevel === 'high'
      ? 'High Risk'
      : riskLevel === 'medium'
        ? 'Medium Risk'
        : 'Low Risk';

  return { riskLevel, riskLabel, overdueDays, balance };
}

/**
 * Pure helper that deduplicates call-history rows by `id` (and ensures one vehicle
 * per call entry even if an ungrouped join returned multiple vehicle rows for the same entry).
 *
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
function mapCallHistoryRows(rows = []) {
  const seenIds = new Set();
  const result = [];

  for (const r of rows) {
    const id = String(r.id ?? '');
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const brandModel = [r.brand, r.model_name]
      .map((s) => (s ? String(s).trim() : ''))
      .filter(Boolean)
      .join(' ');
    const vehicle =
      brandModel ||
      (r.vehicle_modal ? String(r.vehicle_modal).trim() : '') ||
      (r.vehicle ? String(r.vehicle).trim() : '') ||
      '—';

    const rawType = String(r.entry_type ?? r.type ?? '').trim().toLowerCase();
    const type = rawType === 'rc_book' || rawType === 'rc' ? 'RC' : 'Call';

    result.push({
      id,
      customerId: r.customer_id ? String(r.customer_id) : null,
      customer: r.cname || r.customer || 'Unknown',
      hpl:
        r.hplno !== null && r.hplno !== undefined && r.hplno !== ''
          ? `HPL ${r.hplno}`
          : r.hpl || '—',
      type,
      vehicle,
      vehicleNo: r.vehicle_number || r.vehicleNo || '—',
      date: r.formatted_date || r.date || '',
      remarks: r.message ?? r.remarks ?? '',
      staff: r.created_by || r.staff || 'Staff',
      status: deriveMockCallStatus(id),
    });
  }

  return result;
}

/**
 * Pure helper to map assigned tasks with live due amounts and risk badges.
 * Enforces agent scoping: if `user.role === 'agent'` and `user.id` is present,
 * filters rows to `agent_id === user.id` (never falls back to other agents' rows).
 *
 * @param {Array<object>} rows
 * @param {Map<string, object>} pendingByCustomerId
 * @param {object} user
 * @param {string} todayDateIST
 * @param {number} [totalCountOverride]
 */
function mapAssignedTasks(rows = [], pendingByCustomerId = new Map(), user = {}, todayDateIST = getTodayIST(), totalCountOverride = null) {
  const role = String(user?.role || '').trim().toLowerCase();
  const userId = user?.id ? String(user.id) : null;

  const scopedRows =
    role === 'agent'
      ? rows.filter((r) => userId && String(r.agent_id ?? r.agentId ?? '') === userId)
      : rows;

  const totalAssigned =
    role === 'agent'
      ? (totalCountOverride !== null && userId ? Number(totalCountOverride) : scopedRows.length)
      : (totalCountOverride !== null ? Number(totalCountOverride) : scopedRows.length);

  const items = scopedRows.slice(0, 10).map((r) => {
    const cid = String(r.customer_id ?? r.customerId ?? '');
    const snap = pendingByCustomerId.get(cid);
    const fin = deriveTaskRisk(r, todayDateIST);

    // Live due amount from customer's current pending/balance, falling back to assignment snapshot
    const livePending =
      snap && snap.monthlyPending > 0
        ? snap.monthlyPending
        : snap && snap.balance > 0
          ? snap.balance
          : fin.balance > 0
            ? fin.balance
            : Number(r.assigned_due_amount ?? r.due_amount ?? 0) || 0;

    const areaParts = [r.village, r.city, r.street]
      .map((s) => (s ? String(s).trim() : ''))
      .filter(Boolean);
    const area = r.area || areaParts[0] || '—';

    return {
      id: String(r.assignment_id ?? r.id ?? cid),
      customerId: cid,
      customer: r.cname || r.customer || 'Unknown',
      hpl:
        r.hplno !== null && r.hplno !== undefined && r.hplno !== ''
          ? `HPL ${r.hplno}`
          : r.hpl || '—',
      hplno: r.hplno ?? null,
      dueAmount: Math.round(livePending),
      area,
      overdueDays: fin.overdueDays,
      riskLevel: fin.riskLevel,
      riskLabel: fin.riskLabel,
    };
  });

  return {
    totalAssigned: scopedRows.length === 0 && role === 'agent' ? 0 : totalAssigned,
    items,
  };
}

/**
 * Pure helper to map Today Visits from `staff_customer_visits` and today's
 * `customer_agent_assignments`.
 * Emits ONLY `'Completed'` and `'Pending'` (never `'Missed'`).
 *
 * @param {Array<object>} visitRows
 * @param {Array<object>} todayAssignmentRows
 * @param {object} user
 */
function mapTodayVisits(visitRows = [], todayAssignmentRows = [], user = {}) {
  const role = String(user?.role || '').trim().toLowerCase();
  const userId = user?.id ? String(user.id) : null;

  const scopedVisits =
    role === 'agent'
      ? visitRows.filter((r) => userId && String(r.user_id ?? r.agent_id ?? '') === userId)
      : visitRows;

  const scopedAssignments =
    role === 'agent'
      ? todayAssignmentRows.filter((r) => userId && String(r.agent_id ?? '') === userId)
      : todayAssignmentRows;

  const byCustomer = new Map();

  for (const v of scopedVisits) {
    const cid = String(v.customer_id ?? v.customerId ?? v.id ?? '');
    if (!cid || byCustomer.has(cid)) continue;
    const areaParts = [v.meeting_location, v.village, v.city, v.street]
      .map((s) => (s ? String(s).trim() : ''))
      .filter(Boolean);
    byCustomer.set(cid, {
      id: String(v.id ?? cid),
      customerId: String(v.customer_id ?? ''),
      customer: v.cname || v.customer || 'Unknown',
      hpl:
        v.hplno !== null && v.hplno !== undefined && v.hplno !== ''
          ? `HPL ${v.hplno}`
          : v.hpl || '—',
      location: v.location || areaParts[0] || '—',
      status: 'Completed',
    });
  }

  for (const a of scopedAssignments) {
    const cid = String(a.customer_id ?? a.customerId ?? a.id ?? '');
    if (!cid) continue;
    const rawStatus = String(a.status || 'pending').trim().toLowerCase();
    const isCompleted =
      rawStatus === 'visited' ||
      rawStatus === 'collected' ||
      Boolean(a.has_visit_today);

    if (byCustomer.has(cid)) {
      if (isCompleted) {
        byCustomer.get(cid).status = 'Completed';
      }
      continue;
    }

    // Only emit 'Completed' or 'Pending' (never 'Missed')
    if (rawStatus !== 'pending' && !isCompleted) {
      continue;
    }

    const areaParts = [a.meeting_location, a.village, a.city, a.street]
      .map((s) => (s ? String(s).trim() : ''))
      .filter(Boolean);

    byCustomer.set(cid, {
      id: String(a.id ?? cid),
      customerId: cid,
      customer: a.cname || a.customer || 'Unknown',
      hpl:
        a.hplno !== null && a.hplno !== undefined && a.hplno !== ''
          ? `HPL ${a.hplno}`
          : a.hpl || '—',
      location: a.location || areaParts[0] || '—',
      status: isCompleted ? 'Completed' : 'Pending',
    });
  }

  return Array.from(byCustomer.values()).slice(0, 10);
}

/**
 * Pure helper to map today's payments for the "Pending Collections" card on StaffDashboard.
 *
 * @param {Array<object>} paymentRows
 */
function mapTodayCollections(paymentRows = []) {
  return paymentRows.slice(0, 10).map((r) => {
    let rawDelay = r.delay_days ?? r.delayDays;
    if ((rawDelay === undefined || rawDelay === null) && r.payment_date && r.due_date) {
      const pMs = new Date(`${String(r.payment_date).slice(0, 10)}T00:00:00Z`).getTime();
      const dMs = new Date(`${String(r.due_date).slice(0, 10)}T00:00:00Z`).getTime();
      if (Number.isFinite(pMs) && Number.isFinite(dMs)) {
        rawDelay = Math.max(0, Math.round((pMs - dMs) / 86400000));
      }
    }
    const delayInfo = formatDelay(rawDelay);
    const amount =
      Number(r.amount ?? 0) +
      Number(r.penalty ?? 0) +
      Number(r.hand_loan ?? r.handLoan ?? 0);

    return {
      id: String(r.id ?? ''),
      customerId: r.customer_id ? String(r.customer_id) : null,
      customer: r.cname || r.customer || 'Unknown',
      hpl:
        r.hplno !== null && r.hplno !== undefined && r.hplno !== ''
          ? `HPL ${r.hplno}`
          : r.hpl || '—',
      hplno: r.hplno ?? null,
      amount: Math.round(amount * 100) / 100,
      billNumber:
        r.bill_number && String(r.bill_number).trim()
          ? String(r.bill_number).trim()
          : '—',
      delayDays: delayInfo.days,
      delayLabel: delayInfo.label,
      delayTone: delayInfo.tone,
    };
  });
}

// ============================================================================
// READ-ONLY PARAMETERIZED SQL QUERIES (all scoped by finance_id = $1::uuid)
// ============================================================================

const STAFF_PAYMENTS_KPI_SQL = `
  SELECT
    COUNT(DISTINCT COALESCE(NULLIF(TRIM(p.bill_number), ''), p.id::text))
      FILTER (WHERE p.payment_date = $2::date)::int AS today_receipts,
    COUNT(DISTINCT COALESCE(NULLIF(TRIM(p.bill_number), ''), p.id::text))
      FILTER (WHERE p.payment_date = ($2::date - INTERVAL '1 day')::date)::int AS yesterday_receipts,
    COALESCE(
      SUM(COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0))
      FILTER (WHERE p.payment_date = $2::date),
      0
    ) AS today_collection,
    COALESCE(
      SUM(COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0))
      FILTER (WHERE p.payment_date = ($2::date - INTERVAL '1 day')::date),
      0
    ) AS yesterday_collection
  FROM payments p
  WHERE p.finance_id = $1::uuid
    AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
    AND p.payment_date IN ($2::date, ($2::date - INTERVAL '1 day')::date)
`;

const STAFF_CLOSED_LOANS_TODAY_SQL = `
  SELECT COUNT(*)::int AS closed_loans_today
  FROM recent_activity ra
  WHERE ra.finance_id = $1::uuid
    AND ra.type = 'customer'
    AND (
      ra.description ILIKE '%status updated to close%'
      OR ra.description ILIKE 'Loan closed%'
    )
    AND (ra.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date = $2::date
`;

const STAFF_SEIZED_VEHICLES_TODAY_SQL = `
  SELECT COUNT(*)::int AS seized_vehicles_today
  FROM seizing_vehicle sv
  WHERE sv.finance_id = $1::uuid
    AND sv.seizing_date = $2::date
    AND COALESCE(sv.status::text, 'Pending') <> 'Cancelled'
`;

const STAFF_RELOANS_KPI_SQL = `
  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(
        (c.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date,
        l.hp_date
      ) = $2::date
    )::int AS today_reloans,
    COUNT(*) FILTER (
      WHERE COALESCE(
        (c.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date,
        l.hp_date
      ) = ($2::date - INTERVAL '1 day')::date
    )::int AS yesterday_reloans
  FROM loans l
  JOIN customers c ON c.id = l.customer_id AND c.finance_id = l.finance_id
  WHERE l.finance_id = $1::uuid
    AND (
      COALESCE(l.remarks, '') ILIKE '%reloan%'
      OR COALESCE(l.hand_loan_remarks, '') ILIKE '%reloan%'
    )
    AND COALESCE(
      (c.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date,
      l.hp_date
    ) IN ($2::date, ($2::date - INTERVAL '1 day')::date)
`;

const STAFF_TODAY_CALL_HISTORY_SQL = `
  SELECT
    he.id,
    he.customer_id,
    he.entry_type::text AS entry_type,
    he.message,
    he.created_by,
    TO_CHAR(
      he.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata',
      'YYYY-MM-DD HH24:MI'
    ) AS formatted_date,
    c.cname,
    c.hplno,
    veh.vehicle_number,
    veh.brand,
    veh.model_name,
    veh.vehicle_modal
  FROM history_entries he
  JOIN customers c
    ON c.id = he.customer_id
   AND c.finance_id = he.finance_id
  LEFT JOIN LATERAL (
    SELECT l.vehicle_id
    FROM loans l
    WHERE l.customer_id = c.id
      AND l.finance_id = $1::uuid
    ORDER BY l.hp_date DESC NULLS LAST, l.id DESC
    LIMIT 1
  ) latest_loan ON true
  LEFT JOIN LATERAL (
    SELECT
      vd.vehicle_number,
      vd.vehicle_modal,
      vi.brand,
      vi.model_name
    FROM vehicle_detail vd
    LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
    WHERE vd.finance_id = $1::uuid
      AND vd.id = COALESCE(latest_loan.vehicle_id, c.vehicle_id)
    LIMIT 1
  ) veh ON true
  WHERE he.finance_id = $1::uuid
    AND (
      (he.created_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date = $2::date
      OR he.entry_date = $2::date
    )
  ORDER BY he.created_at DESC, he.id DESC
`;

const STAFF_ASSIGNED_TASKS_SQL = `
  SELECT
    caa.id AS assignment_id,
    caa.customer_id,
    caa.agent_id,
    caa.status,
    caa.priority,
    caa.due_amount AS assigned_due_amount,
    caa.assigned_at,
    c.cname,
    c.hplno,
    c.loan_status::text AS loan_status,
    addr.city,
    addr.village,
    addr.street,
    TO_CHAR(ln.hp_date, 'YYYY-MM-DD') AS hp_date,
    TO_CHAR(ln.due_date, 'YYYY-MM-DD') AS first_due_date,
    ln.due_date,
    ln.due_month,
    ln.due_month AS total_installments,
    ln.due_amount,
    ln.due_amount AS installment_amount,
    ln.net_payable,
    COALESCE(pay.total_paid, 0) AS total_paid,
    COALESCE(pay.installments_paid, 0) AS installments_paid,
    COUNT(*) OVER()::int AS total_assigned_count
  FROM customer_agent_assignments caa
  JOIN customers c
    ON c.id = caa.customer_id
   AND c.finance_id = caa.finance_id
  LEFT JOIN LATERAL (
    SELECT a.city, a.village, a.street
    FROM address_history ah
    JOIN addresses a ON a.id = ah.address_id
    WHERE ah.entity_id = c.id::text
      AND ah.entity_type = 'customer'
    ORDER BY ah.is_current DESC NULLS LAST, ah.changed_at DESC NULLS LAST, ah.id DESC
    LIMIT 1
  ) addr ON true
  LEFT JOIN LATERAL (
    SELECT
      l.hp_date,
      l.due_date,
      l.due_month,
      l.due_amount,
      l.net_payable
    FROM loans l
    WHERE l.customer_id = c.id
      AND l.finance_id = $1::uuid
    ORDER BY l.hp_date DESC NULLS LAST, l.id DESC
    LIMIT 1
  ) ln ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(COALESCE(p.amount, 0)), 0) AS total_paid,
      COUNT(*) FILTER (WHERE p.status = 'paid')::int AS installments_paid
    FROM payments p
    WHERE p.customer_id = c.id
      AND p.finance_id = $1::uuid
      AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
  ) pay ON true
  WHERE caa.finance_id = $1::uuid
    AND caa.unassigned_at IS NULL
    AND caa.status IN ('pending', 'visited')
    AND ($2::uuid IS NULL OR caa.agent_id = $2::uuid)
  ORDER BY caa.assigned_at DESC, caa.id DESC
  LIMIT 10
`;

const STAFF_TODAY_VISITS_SQL = `
  SELECT
    scv.id,
    scv.customer_id,
    scv.user_id,
    scv.meeting_location,
    scv.visit_time,
    c.cname,
    c.hplno,
    addr.city,
    addr.village,
    addr.street
  FROM staff_customer_visits scv
  JOIN customers c
    ON c.id = scv.customer_id
   AND c.finance_id = $1::uuid
  LEFT JOIN LATERAL (
    SELECT a.city, a.village, a.street
    FROM address_history ah
    JOIN addresses a ON a.id = ah.address_id
    WHERE ah.entity_id = c.id::text
      AND ah.entity_type = 'customer'
    ORDER BY ah.is_current DESC NULLS LAST, ah.changed_at DESC NULLS LAST, ah.id DESC
    LIMIT 1
  ) addr ON true
  WHERE c.finance_id = $1::uuid
    AND (scv.visit_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date = $2::date
    AND ($3::uuid IS NULL OR scv.user_id = $3::uuid)
  ORDER BY scv.visit_time DESC, scv.id DESC
  LIMIT 15
`;

const STAFF_TODAY_ASSIGNMENT_VISITS_SQL = `
  SELECT
    caa.id,
    caa.customer_id,
    caa.agent_id,
    caa.status,
    c.cname,
    c.hplno,
    addr.city,
    addr.village,
    addr.street,
    EXISTS (
      SELECT 1
      FROM staff_customer_visits scv
      WHERE scv.customer_id = caa.customer_id
        AND scv.user_id = caa.agent_id
        AND (scv.visit_time AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date = $2::date
    ) AS has_visit_today
  FROM customer_agent_assignments caa
  JOIN customers c
    ON c.id = caa.customer_id
   AND c.finance_id = caa.finance_id
  LEFT JOIN LATERAL (
    SELECT a.city, a.village, a.street
    FROM address_history ah
    JOIN addresses a ON a.id = ah.address_id
    WHERE ah.entity_id = c.id::text
      AND ah.entity_type = 'customer'
    ORDER BY ah.is_current DESC NULLS LAST, ah.changed_at DESC NULLS LAST, ah.id DESC
    LIMIT 1
  ) addr ON true
  WHERE caa.finance_id = $1::uuid
    AND caa.unassigned_at IS NULL
    AND (
      (caa.assigned_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date = $2::date
      OR caa.target_date = $2::date
      OR (caa.completed_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Kolkata')::date = $2::date
    )
    AND ($3::uuid IS NULL OR caa.agent_id = $3::uuid)
  ORDER BY caa.assigned_at DESC, caa.id DESC
  LIMIT 15
`;

const STAFF_TODAY_COLLECTIONS_SQL = `
  SELECT
    p.id,
    p.customer_id,
    p.bill_number,
    p.amount,
    p.penalty,
    p.hand_loan,
    p.due_date,
    p.payment_date,
    CASE
      WHEN p.due_date IS NOT NULL THEN GREATEST(0, (p.payment_date::date - p.due_date::date))
      ELSE 0
    END::int AS delay_days,
    c.cname,
    c.hplno
  FROM payments p
  JOIN customers c
    ON c.id = p.customer_id
   AND c.finance_id = p.finance_id
  WHERE p.finance_id = $1::uuid
    AND p.payment_date = $2::date
    AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
  ORDER BY p.created_at DESC NULLS LAST, p.id DESC
  LIMIT 10
`;

/**
 * Fetches and computes the complete Staff Dashboard overview payload.
 *
 * @param {{ query: Function }} db - PostgreSQL pool / client
 * @param {string} financeId - UUID of the caller's finance
 * @param {{ id?: string, role?: string }} [user] - Authenticated user from `req.user`
 * @param {{ todayDateIST?: string }} [options]
 */
async function getStaffDashboardOverview(db, financeId, user = {}, options = {}) {
  if (!financeId) {
    throw new Error('financeId is required for getStaffDashboardOverview');
  }

  const todayDateIST = options.todayDateIST || getTodayIST();
  const role = String(user?.role || '').trim().toLowerCase();
  const isAgent = role === 'agent';
  const agentFilterId = isAgent ? (user?.id ? String(user.id) : '00000000-0000-0000-0000-000000000000') : null;

  const [
    paymentsKpiRes,
    closedLoansRes,
    seizedVehiclesRes,
    reloansKpiRes,
    portfolioRes,
    callHistoryRes,
    assignedTasksRes,
    todayVisitsRes,
    todayAssignmentVisitsRes,
    todayCollectionsRes,
  ] = await Promise.all([
    db.query(STAFF_PAYMENTS_KPI_SQL, [financeId, todayDateIST]),
    db.query(STAFF_CLOSED_LOANS_TODAY_SQL, [financeId, todayDateIST]),
    db.query(STAFF_SEIZED_VEHICLES_TODAY_SQL, [financeId, todayDateIST]),
    db.query(STAFF_RELOANS_KPI_SQL, [financeId, todayDateIST]),
    db.query(PORTFOLIO_RISK_SQL, [financeId]),
    db.query(STAFF_TODAY_CALL_HISTORY_SQL, [financeId, todayDateIST]),
    db.query(STAFF_ASSIGNED_TASKS_SQL, [financeId, agentFilterId]),
    db.query(STAFF_TODAY_VISITS_SQL, [financeId, todayDateIST, agentFilterId]),
    db.query(STAFF_TODAY_ASSIGNMENT_VISITS_SQL, [financeId, todayDateIST, agentFilterId]),
    db.query(STAFF_TODAY_COLLECTIONS_SQL, [financeId, todayDateIST]),
  ]);

  const payRow = paymentsKpiRes.rows?.[0] || {};
  const closedRow = closedLoansRes.rows?.[0] || {};
  const seizedRow = seizedVehiclesRes.rows?.[0] || {};
  const reloanRow = reloansKpiRes.rows?.[0] || {};

  const totalReceiptsToday = Number(payRow.today_receipts) || 0;
  const totalReceiptsYesterday = Number(payRow.yesterday_receipts) || 0;
  const collectedAmountToday = Math.round((Number(payRow.today_collection) || 0) * 100) / 100;
  const collectedAmountYesterday = Math.round((Number(payRow.yesterday_collection) || 0) * 100) / 100;

  const closedLoansToday = Number(closedRow.closed_loans_today) || 0;
  const seizedVehiclesToday = Number(seizedRow.seized_vehicles_today) || 0;

  const reloanCountToday = Number(reloanRow.today_reloans) || 0;
  const reloanCountYesterday = Number(reloanRow.yesterday_reloans) || 0;

  const pendingSnapshot = computeCustomerPendingSnapshot(portfolioRes.rows || [], todayDateIST);

  const taskRows = assignedTasksRes.rows || [];
  const totalAssignedFromWindow =
    taskRows.length > 0 && taskRows[0].total_assigned_count !== undefined
      ? Number(taskRows[0].total_assigned_count)
      : taskRows.length;

  const assignedTasks = mapAssignedTasks(
    taskRows,
    pendingSnapshot.byCustomerId,
    user,
    todayDateIST,
    totalAssignedFromWindow
  );

  const todayCallHistory = mapCallHistoryRows(callHistoryRes.rows || []);
  const todayVisits = mapTodayVisits(
    todayVisitsRes.rows || [],
    todayAssignmentVisitsRes.rows || [],
    user
  );
  const todayCollections = mapTodayCollections(todayCollectionsRes.rows || []);

  return {
    asOfDate: todayDateIST,
    kpis: {
      totalReceiptsToday,
      totalReceiptsTrend: computeTrendBadge(totalReceiptsToday, totalReceiptsYesterday),
      collectedAmount: collectedAmountToday,
      collectedAmountTrend: computeTrendBadge(collectedAmountToday, collectedAmountYesterday),
      closedLoans: closedLoansToday,
      seizedVehicles: seizedVehiclesToday,
      reloanCount: reloanCountToday,
      reloanCountTrend: computeTrendBadge(reloanCountToday, reloanCountYesterday),
      todayDues: pendingSnapshot.todayDues,
      unpaidCustomers: pendingSnapshot.unpaidCustomers,
      onlinePaymentsMock: '₹45K',
    },
    todayCallHistory,
    assignedTasks,
    todayVisits,
    todayCollections,
  };
}

module.exports = {
  getStaffDashboardOverview,
  // Pure helpers exported for unit testing
  getTodayIST,
  computeTrendPercent,
  computeTrendBadge,
  deriveMockCallStatus,
  formatDelay,
  deriveTaskRisk,
  mapCallHistoryRows,
  mapAssignedTasks,
  mapTodayVisits,
  mapTodayCollections,
  // SQL constants exported for verification
  STAFF_PAYMENTS_KPI_SQL,
  STAFF_CLOSED_LOANS_TODAY_SQL,
  STAFF_SEIZED_VEHICLES_TODAY_SQL,
  STAFF_RELOANS_KPI_SQL,
  STAFF_TODAY_CALL_HISTORY_SQL,
  STAFF_ASSIGNED_TASKS_SQL,
  STAFF_TODAY_VISITS_SQL,
  STAFF_TODAY_ASSIGNMENT_VISITS_SQL,
  STAFF_TODAY_COLLECTIONS_SQL,
};

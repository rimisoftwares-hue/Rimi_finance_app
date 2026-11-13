/**
 * risk.service.js
 *
 * Database layer for the dual-score customer risk system.
 * Runs read-only, finance-scoped SQL aggregations (one statement per data set,
 * no per-customer round-trips) and feeds plain values into the pure functions in
 * risk.scoring.js.
 *
 * Conventions:
 *  - Every query is parameterized; $1 is ALWAYS the caller's finance id (req.financeId).
 *  - SQL text is assembled only from constant fragments — user input never reaches it.
 *  - The shared db wrapper rewrites any literal question mark into a $n placeholder,
 *    so the SQL below must never contain one (not even in comments).
 *  - Dates are selected with TO_CHAR('YYYY-MM-DD') so date math never depends on the
 *    Node process timezone.
 */

'use strict';

const { db } = require('../../config/database.config');
const {
  computeLoanMetrics,
  computeCreditScore,
  creditBand,
  scoreCustomer,
  monthlyPaymentStatus,
  distanceRisk,
  creditRecommendation,
  todayIso,
  parseDate,
  formatDate,
  diffDays,
} = require('./risk.scoring');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RISK_TYPES = ['all', 'payment', 'credit', 'distance'];
const RISK_LEVELS = ['all', 'critical', 'high', 'warning', 'safe'];
const RISK_SEVERITY = { critical: 3, high: 2, warning: 1, safe: 0 };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TREND_MONTHS = 6;

// riskType thresholds (see Alerts filter)
const CREDIT_RISK_THRESHOLD = 65;   // below "Good" band
const DISTANCE_RISK_KM = 10;        // mock distances span 1.5–18 km

// Default map centre for mock current-location when no home coordinates exist.
const DEFAULT_HOME_COORDS = { lat: 13.0827, lng: 80.2707 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(value) {
  return Math.round(num(value) * 10) / 10;
}

function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

function humanize(value) {
  if (!value) return null;
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatRate(value) {
  return String(Number(num(value).toFixed(2)));
}

function monthLabel(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  if (!y || !m) return String(monthKey);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function normalizePhones(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((p) => p && p.number)
    .map((p) => ({
      number: String(p.number),
      type: p.type || null,
      contactType: p.contactType || null,
    }));
}

// ─── Shared customer risk query ───────────────────────────────────────────────

/**
 * Builds the per-customer risk aggregation query.
 * $1 = finance id. `whereSql` is a CONSTANT fragment chosen by the caller; any
 * values it needs are passed as $2.. parameters.
 *
 * Joins: finance_detail, latest loan, vehicle (loan.vehicle_id → customer.vehicle_id),
 * contacts (customer numbers first, mobile first), active agent assignment
 * (pending|visited), payment aggregates, broken PTPs, seizure flag, live location.
 *
 * @param {string}  whereSql
 * @param {object}  [opts]
 * @param {boolean} [opts.requireLoan=true]  INNER vs LEFT join on the latest loan
 */
function buildCustomerRiskSql(whereSql, { requireLoan = true } = {}) {
  const loanJoin = requireLoan ? 'JOIN LATERAL' : 'LEFT JOIN LATERAL';
  const baseDate = 'public.fn_clamped_installment_date(COALESCE(l.due_date, l.hp_date, c.created_at::date), 1)';
  const delay = `(p.payment_date - COALESCE(p.due_date, ${baseDate}))`;

  return `
    SELECT
      c.id AS customer_id,
      c.hplno,
      c.cname,
      c.loan_status::text AS loan_status,
      TO_CHAR(c.created_at, 'YYYY-MM-DD') AS customer_created_at,
      c.home_address AS legacy_home_address,
      c.home_latitude,
      c.home_longitude,
      f.finance_name,
      l.id AS loan_id,
      l.loan_type,
      l.hp_amount,
      TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS hp_date,
      TO_CHAR(l.due_date, 'YYYY-MM-DD') AS due_date,
      l.due_month,
      l.interest_rate,
      l.penalty_amount,
      l.due_amount,
      l.net_payable,
      v.vehicle_number,
      COALESCE(vi.brand, '') AS brand,
      COALESCE(vi.model_name, v.vehicle_modal, '') AS model,
      vi.body_type::text AS body_type,
      COALESCE(ph.phones, '[]'::json) AS phones,
      caa.agent_id,
      COALESCE(ud.staff_name, u.username) AS agent_name,
      (COALESCE(pay.total_paid, 0) + COALESCE(sub_pay.sub_paid, 0)) AS total_paid,
      COALESCE(pay.total_penalty, 0) AS total_penalty,
      COALESCE(pay.payment_count, 0)::int AS payment_count,
      COALESCE(pay.on_time_count, 0)::int AS on_time_count,
      COALESCE(pay.late_15_30, 0)::int AS late_15_30,
      COALESCE(pay.late_31_60, 0)::int AS late_31_60,
      COALESCE(pay.late_over_60, 0)::int AS late_over_60,
      COALESCE(ptp.broken_ptp_count, 0)::int AS broken_ptp_count,
      COALESCE(sz.has_seizure, false) AS has_seizure,
      cll.distance_from_home,
      cll.latitude AS live_latitude,
      cll.longitude AS live_longitude,
      cll.last_ping_at,
      cll.is_online AS live_is_online,
      addr_curr.house_no AS curr_house_no,
      addr_curr.street AS curr_street,
      addr_curr.street_name AS curr_street_name,
      addr_curr.village AS curr_village,
      addr_curr.address AS curr_address,
      addr_curr.city AS curr_city,
      addr_curr.district AS curr_district,
      addr_curr.state AS curr_state,
      addr_curr.pincode AS curr_pincode,
      addr_curr.latitude AS curr_addr_latitude,
      addr_curr.longitude AS curr_addr_longitude
    FROM customers c
    JOIN finance_detail f ON f.id = c.finance_id
    ${loanJoin} (
      SELECT l_sub.*
      FROM loans l_sub
      WHERE l_sub.customer_id = c.id
        AND (l_sub.finance_id = $1::uuid OR l_sub.finance_id IS NULL)
      ORDER BY l_sub.due_date DESC NULLS LAST, l_sub.hp_date DESC NULLS LAST, l_sub.id DESC
      LIMIT 1
    ) l ON true
    LEFT JOIN vehicle_detail v ON v.id = COALESCE(l.vehicle_id, c.vehicle_id)
    LEFT JOIN vehicle_info vi ON vi.id = v.vehicle_info_id
    LEFT JOIN LATERAL (
      SELECT json_agg(
               json_build_object(
                 'number', ct.number,
                 'type', ct.type::text,
                 'contactType', ct.contact_type::text
               )
               ORDER BY
                 CASE WHEN ct.contact_type::text = 'customer' THEN 0 ELSE 1 END,
                 CASE WHEN ct.type::text = 'mobile' THEN 0 ELSE 1 END,
                 ct.id
             ) AS phones
      FROM contacts ct
      WHERE ct.customer_id = c.id
        AND (ct.finance_id = $1::uuid OR ct.finance_id IS NULL)
    ) ph ON true
    LEFT JOIN LATERAL (
      SELECT caa_sub.agent_id
      FROM customer_agent_assignments caa_sub
      WHERE caa_sub.customer_id = c.id
        AND caa_sub.finance_id = $1::uuid
        AND caa_sub.status IN ('pending', 'visited')
      ORDER BY caa_sub.assigned_at DESC, caa_sub.id DESC
      LIMIT 1
    ) caa ON true
    LEFT JOIN users u ON u.id = caa.agent_id
    LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
    LEFT JOIN LATERAL (
      SELECT
        SUM(COALESCE(p.amount, 0)) AS total_paid,
        SUM(COALESCE(p.penalty, 0)) AS total_penalty,
        COUNT(*) AS payment_count,
        COUNT(*) FILTER (WHERE ${delay} <= 5) AS on_time_count,
        COUNT(*) FILTER (WHERE ${delay} BETWEEN 15 AND 30) AS late_15_30,
        COUNT(*) FILTER (WHERE ${delay} BETWEEN 31 AND 60) AS late_31_60,
        COUNT(*) FILTER (WHERE ${delay} > 60) AS late_over_60
      FROM payments p
      WHERE p.customer_id = c.id
        AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
        AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
        AND COALESCE(p.status::text, 'paid') <> 'cancelled'
    ) pay ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(sd.paid_amount, 0)), 0) AS sub_paid
      FROM sub_due sd
      JOIN payments p_sd ON p_sd.id = sd.payment_id
      WHERE sd.customer_id = c.id
        AND sd.finance_id = $1::uuid
        AND COALESCE(sd.status::text, 'active') <> 'cancelled'
        AND COALESCE(p_sd.payment_status::text, 'active') <> 'cancelled'
        AND COALESCE(p_sd.status::text, 'paid') <> 'cancelled'
    ) sub_pay ON true
    LEFT JOIN LATERAL (
      SELECT GREATEST(
               COUNT(*) FILTER (WHERE ptp_x.ptp_status::text = 'broken'),
               COALESCE(SUM(ptp_x.broken_count), 0)
             ) AS broken_ptp_count
      FROM promise_to_pay ptp_x
      WHERE ptp_x.customer_id = c.id
        AND ptp_x.finance_id = $1::uuid
    ) ptp ON true
    LEFT JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1
        FROM seizing_vehicle sv
        WHERE sv.customer_id = c.id
          AND sv.finance_id = $1::uuid
          AND COALESCE(sv.status::text, 'Pending') <> 'Cancelled'
      ) AS has_seizure
    ) sz ON true
    LEFT JOIN customer_live_locations cll ON cll.customer_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        a.house_no, a.street, a.street_name, a.village, a.address,
        a.city, a.district, a.state, a.pincode, a.latitude, a.longitude
      FROM address_history ah
      JOIN addresses a ON a.id = ah.address_id
      WHERE ah.entity_type = 'customer'
        AND ah.entity_id = c.id::text
        AND ah.is_current = 1
      ORDER BY ah.changed_at DESC NULLS LAST, ah.id DESC
      LIMIT 1
    ) addr_curr ON true
    WHERE c.finance_id = $1::uuid
      AND ${whereSql}
    ORDER BY c.hplno ASC NULLS LAST, c.id ASC
  `;
}

/** Active collection agents of the finance (same rule as the agent-assignment module). */
const AGENTS_SQL = `
  SELECT u.id, COALESCE(ud.staff_name, u.username) AS name
  FROM users u
  JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
  LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
  WHERE uac.role = 'agent'
    AND uac.is_active = 1
    AND u.is_active = 1
  ORDER BY name ASC
`;

/**
 * Scores one row of buildCustomerRiskSql.
 */
function scoreRow(r, asOfDate) {
  const { metrics, credit, due, riskLevel } = scoreCustomer(
    {
      loanStatus: r.loan_status,
      dueAmount: r.due_amount,
      netPayable: r.net_payable,
      hpAmount: r.hp_amount,
      dueMonth: r.due_month,
      totalPaid: r.total_paid,
      hpDate: r.hp_date,
      dueDate: r.due_date,
      customerCreatedAt: r.customer_created_at,
      asOfDate,
    },
    {
      totalPayments: r.payment_count,
      onTimePayments: r.on_time_count,
      late15to30: r.late_15_30,
      late31to60: r.late_31_60,
      lateOver60: r.late_over_60,
      brokenPtpCount: r.broken_ptp_count,
      hasSeizure: r.has_seizure === true,
    }
  );

  const hasLiveDistance = r.distance_from_home !== null && r.distance_from_home !== undefined;
  const distanceFromHome = hasLiveDistance ? round1(r.distance_from_home) : null;
  const allPhones = normalizePhones(r.phones);

  return {
    row: r,
    metrics,
    credit,
    due,
    riskLevel,
    allPhones,
    distanceFromHome,
    distanceIsMock: false,
    vehicleName: [r.brand, r.model].filter(Boolean).join(' ') || null,
    vehicleType: humanize(r.body_type || r.loan_type),
  };
}

function toCustomerSummary(s) {
  const r = s.row;
  return {
    id: r.customer_id,
    hplno: r.hplno,
    name: r.cname,
    phone: s.allPhones[0] ? s.allPhones[0].number : null,
    allPhones: s.allPhones,
    financeName: r.finance_name,
    vehicleNumber: r.vehicle_number || null,
    vehicleName: s.vehicleName,
    vehicleType: s.vehicleType,
    distanceFromHome: s.distanceFromHome,
    assignedAgent: r.agent_id ? (r.agent_name || null) : null,
    assignedAgentId: r.agent_id || null,
  };
}

// ─── 1. Alerts ────────────────────────────────────────────────────────────────

function validateAlertFilters(filters) {
  const riskType = String(filters.riskType || 'all').trim().toLowerCase();
  const riskLevel = String(filters.riskLevel || 'all').trim().toLowerCase();
  const agentRaw = String(filters.agentId || 'all').trim();
  const agentId = agentRaw.toLowerCase() === 'all' || agentRaw.toLowerCase() === 'unassigned'
    ? agentRaw.toLowerCase()
    : agentRaw;
  const search = String(filters.search || '').trim().slice(0, 100);

  if (!RISK_TYPES.includes(riskType)) {
    throw httpError(400, `Invalid riskType. Allowed: ${RISK_TYPES.join(', ')}`);
  }
  if (!RISK_LEVELS.includes(riskLevel)) {
    throw httpError(400, `Invalid riskLevel. Allowed: ${RISK_LEVELS.join(', ')}`);
  }
  if (agentId !== 'all' && agentId !== 'unassigned' && !isValidUuid(agentId)) {
    throw httpError(400, 'Invalid agentId. Use all, unassigned or an agent UUID');
  }
  return { riskType, riskLevel, agentId, search };
}

function matchesSearch(customer, search) {
  if (!search) return true;
  const term = search.toLowerCase();
  const compactTerm = term.replace(/[\s-]/g, '');
  const termDigits = digitsOnly(search);

  if ((customer.name || '').toLowerCase().includes(term)) return true;
  if (customer.hplno !== null && customer.hplno !== undefined && String(customer.hplno).includes(term)) return true;
  if (customer.vehicleNumber && customer.vehicleNumber.toLowerCase().replace(/[\s-]/g, '').includes(compactTerm)) return true;
  if (termDigits.length >= 3 && customer.allPhones.some((p) => digitsOnly(p.number).includes(termDigits))) return true;
  return false;
}

/**
 * GET /api/risk/alerts
 */
async function getRiskAlerts(financeId, filters = {}) {
  const { riskType, riskLevel, agentId, search } = validateAlertFilters(filters);
  const asOfDate = todayIso();

  // Portfolio = customers whose latest loan is still open (active or seized).
  const [customerResult, agentResult] = await Promise.all([
    db.query(buildCustomerRiskSql(`c.loan_status::text IN ('active', 'seized')`), [financeId]),
    db.query(AGENTS_SQL, [financeId]),
  ]);

  const all = customerResult.rows.map((r) => {
    const s = scoreRow(r, asOfDate);
    return {
      ...toCustomerSummary(s),
      riskLevel: s.riskLevel,
      creditScore: s.credit.creditScore,
      creditBand: s.credit.creditBand,
      dueRiskScore: s.due.dueRiskScore,
      overdueDays: s.metrics.overdueDays,
      overdueAmount: s.metrics.overdueAmount,
    };
  });

  // NOTE: Summary counts always reflect the FULL finance portfolio.
  // The riskType / riskLevel / agentId / search filters below only narrow the
  // `customers` array — they never change these totals.
  const summary = {
    criticalAlerts: all.filter((c) => c.riskLevel === 'critical').length,
    highAlerts: all.filter((c) => c.riskLevel === 'high').length,
    warnings: all.filter((c) => c.riskLevel === 'warning').length,
    safeCount: all.filter((c) => c.riskLevel === 'safe').length,
  };
  summary.totalAlerts = summary.criticalAlerts + summary.highAlerts + summary.warnings;

  let customers = all;
  if (riskLevel !== 'all') customers = customers.filter((c) => c.riskLevel === riskLevel);
  if (riskType === 'payment') customers = customers.filter((c) => c.overdueDays > 0);
  if (riskType === 'credit') customers = customers.filter((c) => c.creditScore < CREDIT_RISK_THRESHOLD);
  if (riskType === 'distance') customers = customers.filter((c) => c.distanceFromHome !== null && c.distanceFromHome > DISTANCE_RISK_KM);
  if (agentId === 'unassigned') customers = customers.filter((c) => !c.assignedAgentId);
  else if (agentId !== 'all') customers = customers.filter((c) => c.assignedAgentId === agentId);
  if (search) customers = customers.filter((c) => matchesSearch(c, search));

  customers.sort((a, b) =>
    (RISK_SEVERITY[b.riskLevel] - RISK_SEVERITY[a.riskLevel]) ||
    (b.dueRiskScore - a.dueRiskScore) ||
    (b.overdueDays - a.overdueDays) ||
    (a.creditScore - b.creditScore)
  );

  return {
    summary,
    agents: agentResult.rows.map((a) => ({ id: a.id, name: a.name })),
    customers,
  };
}

// ─── 2. Customer deep view ────────────────────────────────────────────────────

const MONTHLY_PAYMENTS_SQL = `
  SELECT
    TO_CHAR(COALESCE(p.payment_date, p.due_date), 'YYYY-MM') AS month_key,
    SUM(
      COALESCE(p.amount, 0) + COALESCE((
        SELECT SUM(COALESCE(sd.paid_amount, 0))
        FROM sub_due sd
        WHERE sd.payment_id = p.id
          AND sd.finance_id = $1::uuid
          AND COALESCE(sd.status::text, 'active') <> 'cancelled'
      ), 0)
    ) AS total_paid,
    SUM(COALESCE(p.penalty, 0)) AS total_penalty,
    COUNT(*)::int AS payment_count,
    MAX(GREATEST(0, COALESCE(p.payment_date - p.due_date, 0)))::int AS max_delay_days
  FROM payments p
  JOIN customers c ON c.id = p.customer_id AND c.finance_id = $1::uuid
  WHERE p.customer_id = $2::uuid
    AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
    AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
    AND COALESCE(p.status::text, 'paid') <> 'cancelled'
  GROUP BY 1
  ORDER BY 1 ASC
`;

const HOME_ADDRESS_SQL = `
  SELECT
    a.house_no, a.street, a.street_name, a.village, a.address,
    a.city, a.district, a.state, a.pincode, a.latitude, a.longitude
  FROM customers c
  JOIN address_history ah
    ON ah.entity_type = 'customer'
   AND ah.entity_id = c.id::text
   AND ah.is_current = 1
  JOIN addresses a ON a.id = ah.address_id
  WHERE c.id = $2::uuid
    AND c.finance_id = $1::uuid
  ORDER BY ah.changed_at DESC NULLS LAST, ah.id DESC
  LIMIT 1
`;

function formatAddress(a) {
  if (!a) return null;
  const seen = new Set();
  const parts = [a.house_no, a.address, a.street, a.street_name, a.village, a.city, a.district, a.state]
    .map((p) => (p === null || p === undefined ? '' : String(p).trim()))
    .filter((p) => {
      if (!p) return false;
      const key = p.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!parts.length && !a.pincode) return null;
  const pin = a.pincode ? String(a.pincode).trim() : '';
  return pin ? `${parts.join(', ')}${parts.length ? ' - ' : ''}${pin}` : parts.join(', ');
}

/**
 * GET /api/risk/customers/:customerId/deep-view
 */
async function getCustomerDeepView(financeId, customerId) {
  if (!isValidUuid(customerId)) throw httpError(400, 'Invalid customer id');
  const id = customerId.trim();
  const asOfDate = todayIso();

  const [customerResult, monthlyResult, addressResult] = await Promise.all([
    db.query(buildCustomerRiskSql('c.id = $2::uuid', { requireLoan: false }), [financeId, id]),
    db.query(MONTHLY_PAYMENTS_SQL, [financeId, id]),
    db.query(HOME_ADDRESS_SQL, [financeId, id]),
  ]);

  if (customerResult.rows.length === 0) throw httpError(404, 'Customer not found');

  const s = scoreRow(customerResult.rows[0], asOfDate);
  const r = s.row;
  const m = s.metrics;
  const addr = addressResult.rows[0] || null;

  const homeLat = addr && addr.latitude !== null ? Number(addr.latitude) : (r.home_latitude !== null ? Number(r.home_latitude) : NaN);
  const homeLng = addr && addr.longitude !== null ? Number(addr.longitude) : (r.home_longitude !== null ? Number(r.home_longitude) : NaN);
  const homeFormatted = formatAddress(addr) || r.legacy_home_address || null;

  const rate = r.interest_rate !== null && r.interest_rate !== undefined ? num(r.interest_rate) : null;
  const yearly = rate !== null ? round2(rate * 12) : null;

  const liveLat = r.live_latitude !== null && r.live_latitude !== undefined ? Number(r.live_latitude) : NaN;
  const liveLng = r.live_longitude !== null && r.live_longitude !== undefined ? Number(r.live_longitude) : NaN;
  const hasLiveGps = Number.isFinite(liveLat) && Number.isFinite(liveLng);

  const currentLocation = hasLiveGps
    ? {
      address: s.distanceFromHome !== null ? `${s.distanceFromHome} km from home` : 'Live GPS location',
      latitude: liveLat,
      longitude: liveLng,
      lastSeenHome: null,
      isMock: false,
    }
    : {
      address: 'Live GPS not available',
      latitude: Number.isFinite(homeLat) ? homeLat : null,
      longitude: Number.isFinite(homeLng) ? homeLng : null,
      lastSeenHome: null,
      isMock: false,
    };

  const locationHistory = [];
  if (hasLiveGps) {
    locationHistory.push({
      id: `live-${r.customer_id}`,
      address: currentLocation.address,
      latitude: liveLat,
      longitude: liveLng,
      distanceFromHome: s.distanceFromHome,
      timestamp: r.last_ping_at ? new Date(r.last_ping_at).toISOString() : asOfDate,
      isHomeLocation: s.distanceFromHome !== null ? s.distanceFromHome <= 0.5 : false,
    });
  }
  if (Number.isFinite(homeLat) && Number.isFinite(homeLng)) {
    locationHistory.push({
      id: `home-${r.customer_id}`,
      address: homeFormatted || 'Registered Home Address',
      latitude: homeLat,
      longitude: homeLng,
      distanceFromHome: 0,
      timestamp: 'Registered Home',
      isHomeLocation: true,
    });
  }

  const customer = {
    ...toCustomerSummary(s),
    homeAddress: homeFormatted,
    currentLocation,
  };

  const loan = r.loan_id
    ? {
      loanId: r.loan_id,
      loanType: humanize(r.loan_type),
      hpAmount: round2(r.hp_amount),
      totalLoan: m.totalLoan,
      paidAmount: m.totalPaid,
      pendingAmount: m.pendingAmount,
      emiAmount: m.emiAmount,
      dueMonth: r.due_month !== null ? num(r.due_month) : null,
      installmentsPaid: m.installmentsPaid,
      interestRateMonthly: rate,
      interestRateYearly: yearly,
      interestLabel: rate !== null ? `${formatRate(rate)}% / month (${formatRate(yearly)}% Yearly)` : null,
      hpDate: r.hp_date,
      nextDueDate: m.nextDueDate,
      overdueDays: m.overdueDays,
      overdueAmount: m.overdueAmount,
      penaltyAmount: round2(num(r.total_penalty) + num(r.penalty_amount)),
    }
    : null;

  const monthlyPayments = monthlyResult.rows.map((row) => ({
    monthKey: row.month_key,
    monthLabel: monthLabel(row.month_key),
    totalPaid: round2(row.total_paid),
    totalPenalty: round2(row.total_penalty),
    paymentCount: num(row.payment_count),
    status: monthlyPaymentStatus({
      totalPaid: row.total_paid,
      totalPenalty: row.total_penalty,
      maxDelayDays: row.max_delay_days,
      emiAmount: m.emiAmount,
    }),
  }));

  const risk = {
    creditScore: s.credit.creditScore,
    creditBand: s.credit.creditBand,
    dueRiskScore: s.due.dueRiskScore,
    riskLevel: s.riskLevel,
    breakdown: {
      dueDelayRisk: s.due.dueDelayRisk,
      creditScoreRisk: s.due.creditVulnerabilityRisk,
      distanceRisk: distanceRisk(s.distanceFromHome),
    },
    metrics: {
      onTimePaymentRatio: s.credit.onTimePaymentRatio,
      brokenPromises: num(r.broken_ptp_count),
      seizureHistory: r.has_seizure === true,
    },
  };

  return { customer, loan, monthlyPayments, risk, locationHistory };
}

// ─── 2b. Locator Overview (Track, LiveMap, Insights — zero mock data) ─────────

const LOCATOR_AGENTS_SQL = `
  SELECT
    u.id::text AS id,
    COALESCE(ud.staff_name, u.username) AS name,
    COALESCE(al.is_online, false) AS is_online,
    al.latitude,
    al.longitude,
    al.battery_level,
    al.last_updated_at,
    COALESCE(asgn.assigned_count, 0)::int AS assigned_count
  FROM users u
  JOIN user_allowed_companies uac
    ON uac.user_id = u.id
   AND uac.finance_id = $1::uuid
  LEFT JOIN users_details ud
    ON ud.user_id = u.id
   AND ud.finance_id = $1::uuid
  LEFT JOIN agent_locations al
    ON al.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS assigned_count
    FROM customer_agent_assignments caa
    WHERE caa.agent_id = u.id
      AND caa.finance_id = $1::uuid
      AND caa.status IN ('pending', 'visited')
  ) asgn ON true
  WHERE uac.role = 'agent'
    AND uac.is_active = 1
    AND u.is_active = 1
  ORDER BY name ASC
`;

const LOCATOR_ASSIGNMENT_EVENTS_SQL = `
  SELECT
    caa.id::text AS event_id,
    caa.status::text AS assignment_status,
    COALESCE(caa.completed_at, caa.assigned_at) AS event_at,
    c.cname AS customer_name,
    c.hplno,
    COALESCE(ud.staff_name, u.username, 'Agent') AS agent_name
  FROM customer_agent_assignments caa
  JOIN customers c
    ON c.id = caa.customer_id
   AND c.finance_id = caa.finance_id
  LEFT JOIN users u ON u.id = caa.agent_id
  LEFT JOIN users_details ud
    ON ud.user_id = u.id
   AND ud.finance_id = caa.finance_id
  WHERE caa.finance_id = $1::uuid
  ORDER BY COALESCE(caa.completed_at, caa.assigned_at) DESC NULLS LAST
  LIMIT 8
`;

/**
 * GET /api/risk/locator
 * Powers Track.tsx, LiveMap.tsx, and Insights.tsx strictly from tenant-scoped PostgreSQL data.
 */
async function getLocatorOverview(financeId, filters = {}) {
  const { riskType, riskLevel, agentId, search } = validateAlertFilters(filters);
  const asOfDate = todayIso();

  const [customerResult, agentResult, assignmentEventsResult] = await Promise.all([
    db.query(buildCustomerRiskSql(`c.loan_status::text IN ('active', 'seized')`), [financeId]),
    db.query(LOCATOR_AGENTS_SQL, [financeId]),
    db.query(LOCATOR_ASSIGNMENT_EVENTS_SQL, [financeId]),
  ]);

  const all = customerResult.rows.map((r) => {
    const s = scoreRow(r, asOfDate);
    const addrObj = {
      house_no: r.curr_house_no,
      street: r.curr_street,
      street_name: r.curr_street_name,
      village: r.curr_village,
      address: r.curr_address,
      city: r.curr_city,
      district: r.curr_district,
      state: r.curr_state,
      pincode: r.curr_pincode,
    };
    const formattedHome = formatAddress(addrObj) || r.legacy_home_address || null;
    const liveLat = r.live_latitude !== null && r.live_latitude !== undefined ? Number(r.live_latitude) : NaN;
    const liveLng = r.live_longitude !== null && r.live_longitude !== undefined ? Number(r.live_longitude) : NaN;
    const homeLat = r.curr_addr_latitude !== null && r.curr_addr_latitude !== undefined
      ? Number(r.curr_addr_latitude)
      : (r.home_latitude !== null && r.home_latitude !== undefined ? Number(r.home_latitude) : NaN);
    const homeLng = r.curr_addr_longitude !== null && r.curr_addr_longitude !== undefined
      ? Number(r.curr_addr_longitude)
      : (r.home_longitude !== null && r.home_longitude !== undefined ? Number(r.home_longitude) : NaN);

    const hasLiveGps = Number.isFinite(liveLat) && Number.isFinite(liveLng);
    const hasHomeCoords = Number.isFinite(homeLat) && Number.isFinite(homeLng);
    const currentLatitude = hasLiveGps ? liveLat : (hasHomeCoords ? homeLat : null);
    const currentLongitude = hasLiveGps ? liveLng : (hasHomeCoords ? homeLng : null);
    const areaLabel = [r.curr_city, r.curr_district, r.curr_village]
      .map((x) => (x ? String(x).trim() : ''))
      .find(Boolean) || null;

    return {
      ...toCustomerSummary(s),
      riskLevel: s.riskLevel,
      creditScore: s.credit.creditScore,
      creditBand: s.credit.creditBand,
      dueRiskScore: s.due.dueRiskScore,
      overdueDays: s.metrics.overdueDays,
      overdueAmount: s.metrics.overdueAmount,
      pendingAmount: s.metrics.pendingAmount,
      hasLiveGps,
      currentLatitude,
      currentLongitude,
      currentAddress: hasLiveGps
        ? (s.distanceFromHome !== null ? `${s.distanceFromHome} km from home` : 'Live GPS location')
        : (formattedHome || 'Location not recorded'),
      homeAddress: formattedHome,
      lastPingAt: r.last_ping_at ? new Date(r.last_ping_at).toISOString() : null,
      area: areaLabel,
    };
  });

  const totalCount = all.length;
  const distCounts = {
    safe: all.filter((c) => c.riskLevel === 'safe').length,
    warning: all.filter((c) => c.riskLevel === 'warning').length,
    high: all.filter((c) => c.riskLevel === 'high').length,
    critical: all.filter((c) => c.riskLevel === 'critical').length,
  };

  const riskDistribution = [
    { name: 'Safe', key: 'safe', value: distCounts.safe, pct: totalCount ? round1((distCounts.safe * 100) / totalCount) : 0, color: '#22c55e' },
    { name: 'Warning', key: 'warning', value: distCounts.warning, pct: totalCount ? round1((distCounts.warning * 100) / totalCount) : 0, color: '#eab308' },
    { name: 'High', key: 'high', value: distCounts.high, pct: totalCount ? round1((distCounts.high * 100) / totalCount) : 0, color: '#ef4444' },
    { name: 'Critical', key: 'critical', value: distCounts.critical, pct: totalCount ? round1((distCounts.critical * 100) / totalCount) : 0, color: '#991b1b' },
  ];

  // Real location distribution grouped by city/district/village
  const areaMap = new Map();
  for (const c of all) {
    const key = c.area || 'Unspecified';
    areaMap.set(key, (areaMap.get(key) || 0) + 1);
  }
  const topLocations = Array.from(areaMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([area, count]) => ({
      area,
      customers: count,
      pct: totalCount ? Math.round((count * 100) / totalCount) : 0,
    }));

  const agents = agentResult.rows.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.is_online ? 'online' : 'offline',
    isOnline: Boolean(a.is_online),
    currentLatitude: a.latitude !== null && a.latitude !== undefined ? Number(a.latitude) : null,
    currentLongitude: a.longitude !== null && a.longitude !== undefined ? Number(a.longitude) : null,
    batteryLevel: a.battery_level !== null && a.battery_level !== undefined ? Number(a.battery_level) : null,
    assignedCount: Number(a.assigned_count || 0),
    lastUpdatedAt: a.last_updated_at ? new Date(a.last_updated_at).toISOString() : null,
  }));

  // Real activity feed constructed from assignment events + live GPS pings + active critical alerts
  const activityFeed = [];
  for (const ev of assignmentEventsResult.rows) {
    const hplText = ev.hplno != null ? ` (HPL #${ev.hplno})` : '';
    const isVisit = ev.assignment_status === 'visited' || ev.assignment_status === 'completed';
    activityFeed.push({
      id: `asgn-${ev.event_id}`,
      type: isVisit ? 'visit' : 'move',
      message: isVisit
        ? `${ev.agent_name} visited ${ev.customer_name}${hplText}`
        : `${ev.agent_name} assigned to ${ev.customer_name}${hplText}`,
      timestamp: ev.event_at ? new Date(ev.event_at).toISOString() : null,
    });
  }
  for (const c of all.filter((x) => x.riskLevel === 'critical' || x.riskLevel === 'high').slice(0, 5)) {
    activityFeed.push({
      id: `risk-${c.id}`,
      type: 'alert',
      message: `${c.name}${c.hplno != null ? ` (HPL #${c.hplno})` : ''} — ${c.overdueDays}d overdue, ₹${Math.round(c.overdueAmount).toLocaleString('en-IN')} due (${c.riskLevel.toUpperCase()})`,
      timestamp: c.lastPingAt || asOfDate,
    });
  }

  let customers = all;
  if (riskLevel !== 'all') customers = customers.filter((c) => c.riskLevel === riskLevel);
  if (riskType === 'payment') customers = customers.filter((c) => c.overdueDays > 0);
  if (riskType === 'credit') customers = customers.filter((c) => c.creditScore < CREDIT_RISK_THRESHOLD);
  if (riskType === 'distance') customers = customers.filter((c) => c.distanceFromHome !== null && c.distanceFromHome > DISTANCE_RISK_KM);
  if (agentId === 'unassigned') customers = customers.filter((c) => !c.assignedAgentId);
  else if (agentId !== 'all') customers = customers.filter((c) => c.assignedAgentId === agentId);
  if (search) customers = customers.filter((c) => matchesSearch(c, search));

  customers.sort((a, b) =>
    (RISK_SEVERITY[b.riskLevel] - RISK_SEVERITY[a.riskLevel]) ||
    (b.dueRiskScore - a.dueRiskScore) ||
    (b.overdueDays - a.overdueDays) ||
    (a.creditScore - b.creditScore)
  );

  const trackedWithDistance = customers.filter((c) => c.distanceFromHome !== null);
  const avgDistanceKm = trackedWithDistance.length
    ? round1(trackedWithDistance.reduce((sum, c) => sum + Number(c.distanceFromHome || 0), 0) / trackedWithDistance.length)
    : null;

  return {
    asOfDate,
    summary: {
      totalPortfolio: totalCount,
      filteredCount: customers.length,
      gpsReportingCount: all.filter((c) => c.hasLiveGps).length,
      mappableCount: customers.filter((c) => c.currentLatitude !== null && c.currentLongitude !== null).length,
      criticalAlerts: distCounts.critical,
      highAlerts: distCounts.high,
      warnings: distCounts.warning,
      safeCount: distCounts.safe,
      totalAlerts: distCounts.critical + distCounts.high + distCounts.warning,
      avgDistanceKm,
      onlineAgentsCount: agents.filter((a) => a.isOnline).length,
    },
    riskDistribution,
    topLocations,
    agents,
    activityFeed: activityFeed.slice(0, 10),
    customers,
  };
}

// ─── 3. Due analysis ──────────────────────────────────────────────────────────

const AGING_BUCKETS = [
  { key: 'current', label: 'Current (0 Days)', match: (d) => d <= 0 },
  { key: '1_30', label: '1-30 Days', match: (d) => d >= 1 && d <= 30 },
  { key: '31_60', label: '31-60 Days', match: (d) => d >= 31 && d <= 60 },
  { key: '61_90', label: '61-90 Days', match: (d) => d >= 61 && d <= 90 },
  { key: 'npa', label: '90+ Days (NPA)', match: (d) => d > 90 },
];

/**
 * One row per customer (latest loan) for the whole finance. paid_asof_k holds the
 * cumulative active payments up to each trend snapshot date ($2 is a date[]), so
 * the 6-month history is reconstructed in a single pass over payments.
 * Column list is generated from the TREND_MONTHS constant — no user input.
 */
function buildDueAnalysisSql() {
  const asOfColumns = Array.from({ length: TREND_MONTHS }, (_, i) =>
    `COALESCE(SUM(COALESCE(p.amount, 0) + COALESCE((
          SELECT SUM(COALESCE(sd.paid_amount, 0))
          FROM sub_due sd
          WHERE sd.payment_id = p.id
            AND sd.finance_id = $1::uuid
            AND COALESCE(sd.status::text, 'active') <> 'cancelled'
        ), 0)) FILTER (WHERE p.payment_date <= ($2::date[])[${i + 1}]), 0) AS paid_asof_${i}`
  ).join(',\n        ');
  const asOfSelect = Array.from({ length: TREND_MONTHS }, (_, i) => `COALESCE(pay.paid_asof_${i}, 0) AS paid_asof_${i}`)
    .join(',\n      ');

  return `
    SELECT
      c.id AS customer_id,
      c.loan_status::text AS loan_status,
      TO_CHAR(c.created_at, 'YYYY-MM-DD') AS customer_created_at,
      l.hp_amount,
      TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS hp_date,
      TO_CHAR(l.due_date, 'YYYY-MM-DD') AS due_date,
      l.due_month,
      l.due_amount,
      l.net_payable,
      COALESCE(pay.total_paid, 0) AS total_paid,
      TO_CHAR(pay.last_payment_date, 'YYYY-MM-DD') AS last_payment_date,
      ${asOfSelect}
    FROM customers c
    JOIN LATERAL (
      SELECT l_sub.*
      FROM loans l_sub
      WHERE l_sub.customer_id = c.id
        AND (l_sub.finance_id = $1::uuid OR l_sub.finance_id IS NULL)
      ORDER BY l_sub.due_date DESC NULLS LAST, l_sub.hp_date DESC NULLS LAST, l_sub.id DESC
      LIMIT 1
    ) l ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(
          COALESCE(p.amount, 0) + COALESCE((
            SELECT SUM(COALESCE(sd.paid_amount, 0))
            FROM sub_due sd
            WHERE sd.payment_id = p.id
              AND sd.finance_id = $1::uuid
              AND COALESCE(sd.status::text, 'active') <> 'cancelled'
          ), 0)
        ) AS total_paid,
        MAX(p.payment_date) AS last_payment_date,
        ${asOfColumns}
      FROM payments p
      WHERE p.customer_id = c.id
        AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
        AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
        AND COALESCE(p.status::text, 'paid') <> 'cancelled'
    ) pay ON true
    WHERE c.finance_id = $1::uuid
  `;
}

/** Last TREND_MONTHS snapshot dates: month-ends for past months, today for the current one. */
function trendSnapshotDates(asOfDate) {
  const asOf = parseDate(asOfDate);
  const snapshots = [];
  for (let back = TREND_MONTHS - 1; back >= 0; back--) {
    const total = asOf.y * 12 + (asOf.m - 1) - back;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const date = back === 0
      ? asOfDate
      : formatDate({ y, m, d: new Date(Date.UTC(y, m, 0)).getUTCDate() });
    snapshots.push({ date, label: MONTH_NAMES[m - 1], monthKey: `${y}-${String(m).padStart(2, '0')}` });
  }
  return snapshots;
}

function loanInputFromRow(r, totalPaid, asOfDate, loanStatus) {
  return {
    loanStatus,
    dueAmount: r.due_amount,
    netPayable: r.net_payable,
    hpAmount: r.hp_amount,
    dueMonth: r.due_month,
    totalPaid,
    hpDate: r.hp_date,
    dueDate: r.due_date,
    customerCreatedAt: r.customer_created_at,
    asOfDate,
  };
}

/**
 * GET /api/risk/due-analysis
 */
async function getDueAnalysis(financeId) {
  const asOfDate = todayIso();
  const snapshots = trendSnapshotDates(asOfDate);
  const { rows } = await db.query(buildDueAnalysisSql(), [financeId, snapshots.map((s) => s.date)]);

  // ── Current aging: open portfolio only (active + seized) ──
  const portfolio = rows
    .filter((r) => r.loan_status === 'active' || r.loan_status === 'seized')
    .map((r) => computeLoanMetrics(loanInputFromRow(r, r.total_paid, asOfDate, r.loan_status)));

  const totalLoans = portfolio.length;
  const totalOutstanding = portfolio.reduce((sum, m) => sum + m.pendingAmount, 0);

  const buckets = AGING_BUCKETS.map((b) => {
    const inBucket = portfolio.filter((m) => b.match(m.overdueDays));
    const amount = round2(inBucket.reduce((sum, m) => sum + m.pendingAmount, 0));
    return {
      key: b.key,
      label: b.label,
      count: inBucket.length,
      amount,                                   // outstanding (pending) ₹ in this bucket
      amountLakhs: round2(amount / 100000),
      overdueAmount: round2(inBucket.reduce((sum, m) => sum + m.overdueAmount, 0)),
      percentage: totalLoans ? round1((inBucket.length / totalLoans) * 100) : 0,
    };
  });

  const npaBucket = buckets[buckets.length - 1];
  const overdueLoans = portfolio.filter((m) => m.overdueDays > 0).length;

  const kpis = {
    totalLoans,
    totalOutstanding: round2(totalOutstanding),
    totalOverdueAmount: round2(portfolio.reduce((sum, m) => sum + m.overdueAmount, 0)),
    overdueLoans,
    npaLoans: npaBucket.count,
    npaAmount: npaBucket.amount,
    npaPercentage: totalLoans ? round1((npaBucket.count / totalLoans) * 100) : 0,
    npaAmountPercentage: totalOutstanding > 0 ? round1((npaBucket.amount / totalOutstanding) * 100) : 0,
  };

  // ── 6-month trend ──
  // No historical snapshot table exists, so each month is reconstructed as-of its
  // month-end (today for the current month):
  //   - a loan is in the book once its base date (hp_date → due_date → created_at) is reached
  //   - paid amount = cumulative active payments with payment_date <= snapshot date
  //   - overdue days are recomputed with the same rules as today's aging
  //   - closed loans have no close date in the schema; their last payment date is used
  //     as the closure date (no payments at all → treated as closed throughout)
  // npa = % of book loans 90+ days overdue; overdue = count of book loans with overdue > 0.
  const trend = snapshots.map((snap, idx) => {
    let book = 0;
    let npa = 0;
    let overdue = 0;
    for (const r of rows) {
      const base = parseDate(r.hp_date) || parseDate(r.due_date) || parseDate(r.customer_created_at);
      if (!base || diffDays(parseDate(snap.date), base) < 0) continue;
      if (r.loan_status === 'close' && (!r.last_payment_date || r.last_payment_date <= snap.date)) continue;
      const m = computeLoanMetrics(loanInputFromRow(r, r[`paid_asof_${idx}`], snap.date, 'active'));
      book += 1;
      if (m.overdueDays > 90) npa += 1;
      if (m.overdueDays > 0) overdue += 1;
    }
    return {
      month: snap.label,
      monthKey: snap.monthKey,
      asOfDate: snap.date,
      npa: book ? round1((npa / book) * 100) : 0,
      overdue,
      npaCount: npa,
      bookSize: book,
    };
  });

  return { asOfDate, kpis, buckets, trend };
}

// ─── 4. Credit check ──────────────────────────────────────────────────────────

/**
 * GET /api/risk/credit-check
 * Looks up every customer record (incl. closed / previous loans) in the caller's
 * finance matching ANY of the supplied identifiers, and scores the combined history.
 */
async function getCreditCheck(financeId, query = {}) {
  const aadharRaw = query.aadhar !== undefined ? String(query.aadhar).trim() : '';
  const phoneRaw = query.phone !== undefined ? String(query.phone).trim() : '';
  const customerIdRaw = query.customerId !== undefined ? String(query.customerId).trim() : '';

  if (!aadharRaw && !phoneRaw && !customerIdRaw) {
    throw httpError(400, 'Provide at least one of: aadhar, phone, customerId');
  }

  const params = [financeId];
  const conditions = [];

  if (customerIdRaw) {
    if (!isValidUuid(customerIdRaw)) throw httpError(400, 'Invalid customerId');
    params.push(customerIdRaw);
    conditions.push(`c.id = $${params.length}::uuid`);
  }
  if (aadharRaw) {
    const aadhar = digitsOnly(aadharRaw);
    if (aadhar.length !== 12) throw httpError(400, 'aadhar must be 12 digits');
    params.push(aadhar);
    conditions.push(`c.aadhar_id = $${params.length}`);
  }
  if (phoneRaw) {
    const phone = digitsOnly(phoneRaw);
    if (phone.length < 10) throw httpError(400, 'phone must have at least 10 digits');
    params.push(phone.slice(-10));
    conditions.push(`EXISTS (
      SELECT 1 FROM contacts ctm
      WHERE ctm.customer_id = c.id
        AND ctm.contact_type::text = 'customer'
        AND RIGHT(regexp_replace(ctm.number, '[^0-9]', '', 'g'), 10) = $${params.length}
    )`);
  }

  const { rows } = await db.query(buildCustomerRiskSql(`(${conditions.join(' OR ')})`), params);

  if (rows.length === 0) {
    return {
      found: false,
      creditScore: 75,
      creditBand: 'Good',
      isNewCustomer: true,
      recommendation: creditRecommendation('Good'),
      pastLoans: [],
    };
  }

  const asOfDate = todayIso();
  const scored = rows.map((r) => scoreRow(r, asOfDate));

  const sumOf = (key) => scored.reduce((sum, s) => sum + num(s.row[key]), 0);
  const maxOverdueDays = scored.reduce((max, s) => Math.max(max, s.metrics.overdueDays), 0);
  const hasSeizure = scored.some((s) => s.row.has_seizure === true);

  const credit = computeCreditScore({
    totalPayments: sumOf('payment_count'),
    onTimePayments: sumOf('on_time_count'),
    late15to30: sumOf('late_15_30'),
    late31to60: sumOf('late_31_60'),
    lateOver60: sumOf('late_over_60'),
    overdueDays: maxOverdueDays,
    brokenPtpCount: sumOf('broken_ptp_count'),
    hasSeizure,
  });

  const pastLoans = scored
    .map((s) => ({
      customerId: s.row.customer_id,
      hplno: s.row.hplno,
      name: s.row.cname,
      loanId: s.row.loan_id,
      loanType: humanize(s.row.loan_type),
      loanStatus: s.row.loan_status,
      hpDate: s.row.hp_date,
      hpAmount: round2(s.row.hp_amount),
      totalLoan: s.metrics.totalLoan,
      paidAmount: s.metrics.totalPaid,
      pendingAmount: s.metrics.pendingAmount,
      overdueDays: s.metrics.overdueDays,
      vehicleNumber: s.row.vehicle_number || null,
    }))
    .sort((a, b) => String(b.hpDate || '').localeCompare(String(a.hpDate || '')));

  return {
    found: true,
    isNewCustomer: false,
    creditScore: credit.creditScore,
    creditBand: creditBand(credit.creditScore),
    components: credit.components,
    recommendation: creditRecommendation(credit.creditBand),
    summary: {
      totalLoans: pastLoans.length,
      activeLoans: pastLoans.filter((l) => l.loanStatus === 'active').length,
      closedLoans: pastLoans.filter((l) => l.loanStatus === 'close').length,
      seizedLoans: pastLoans.filter((l) => l.loanStatus === 'seized').length,
      totalBorrowed: round2(pastLoans.reduce((sum, l) => sum + l.totalLoan, 0)),
      totalRepaid: round2(pastLoans.reduce((sum, l) => sum + l.paidAmount, 0)),
      totalOutstanding: round2(pastLoans.reduce((sum, l) => sum + l.pendingAmount, 0)),
      maxOverdueDays,
      totalPayments: sumOf('payment_count'),
      onTimePaymentRatio: credit.onTimePaymentRatio,
      brokenPromises: sumOf('broken_ptp_count'),
      seizureHistory: hasSeizure,
    },
    pastLoans,
  };
}

module.exports = {
  getRiskAlerts,
  getLocatorOverview,
  getCustomerDeepView,
  getDueAnalysis,
  getCreditCheck,
  // exported for testing
  buildCustomerRiskSql,
  buildDueAnalysisSql,
  trendSnapshotDates,
  formatAddress,
};


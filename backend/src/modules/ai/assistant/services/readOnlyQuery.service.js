'use strict';

/**
 * Read-Only AutoFinex Business Intelligence Service (`readOnlyQuery.service.js`).
 *
 * Independent of Gemini. Executes ONLY pre-approved parameterized queries from
 * `allowedQueryRegistry.js` through `readOnlyDbPool.js` (`autofinex_voice_ro` +
 * `BEGIN TRANSACTION READ ONLY`), reusing `homeDashboard.service.js` and
 * `pendingCollectionsHelper.js` pure calculators so every rupee spoken by the AI
 * matches the AutoFinex Dashboard 100%.
 */

const {
  computePortfolioAndInsights,
  computeCustomerPendingSnapshot,
  computeVehicleCounts,
  computeCashInHand,
  PORTFOLIO_RISK_SQL,
  VEHICLES_STATUS_SQL,
  CASH_IN_HAND_SQL,
} = require('../../../dashboard/homeDashboard.service');
const { round2, getCurrentDateIST } = require('../../../accounting/reports/business.calculator');
const { getAssistantConfig } = require('../config/assistant.config');
const { executeReadOnlyQuery, executeDynamicReadOnlySql } = require('../security/readOnlyDbPool');
const { resolveAndValidateToolCall } = require('../security/allowedQueryRegistry');
const { searchBackendGetApiCatalog } = require('../security/backendGetApiRegistry');
const { executeBackendGetApi } = require('./backendGetApiExecutor.service');
const { getCachedQueryResult, setCachedQueryResult } = require('./aiCache.service');
const { parseVehiclePlate } = require('./entityNormalizer.service');

// Fallback portfolio SQL using only Migration-004 granted tables (`customers`, `loans`, `payments`, `promise_to_pay`)
// in case `005_ai_assistant_readonly_grants.sql` (`seizing_vehicle`) has not yet been applied on remote DB.
const PORTFOLIO_RISK_CORE_004_SQL = `
  SELECT
    c.id AS customer_id,
    c.hplno,
    c.cname,
    c.loan_status::text AS loan_status,
    TO_CHAR(c.created_at, 'YYYY-MM-DD') AS customer_created_at,
    l.id AS loan_id,
    l.loan_type,
    l.hp_amount,
    TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS hp_date,
    TO_CHAR(l.due_date, 'YYYY-MM-DD') AS due_date,
    COALESCE(TO_CHAR(l.due_date, 'YYYY-MM-DD'), TO_CHAR(l.hp_date, 'YYYY-MM-DD')) AS first_due_date,
    l.due_month,
    l.due_amount,
    l.net_payable,
    l.penalty_amount,
    COALESCE(pay.total_paid, 0) AS total_paid,
    COALESCE(pay.total_penalty, 0) AS total_penalty,
    COALESCE(pay.payment_count, 0)::int AS payment_count,
    COALESCE(pay.on_time_count, 0)::int AS on_time_count,
    COALESCE(pay.late_15_30, 0)::int AS late_15_30,
    COALESCE(pay.late_31_60, 0)::int AS late_31_60,
    COALESCE(pay.late_over_60, 0)::int AS late_over_60,
    COALESCE(ptp.broken_ptp_count, 0)::int AS broken_ptp_count,
    (c.loan_status::text = 'seized') AS has_seizure
  FROM customers c
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
      SUM(COALESCE(p.amount, 0)) AS total_paid,
      SUM(COALESCE(p.penalty, 0)) AS total_penalty,
      COUNT(*) AS payment_count,
      COUNT(*) FILTER (WHERE COALESCE(p.payment_date - p.due_date, 0) <= 5) AS on_time_count,
      COUNT(*) FILTER (WHERE COALESCE(p.payment_date - p.due_date, 0) BETWEEN 15 AND 30) AS late_15_30,
      COUNT(*) FILTER (WHERE COALESCE(p.payment_date - p.due_date, 0) BETWEEN 31 AND 60) AS late_31_60,
      COUNT(*) FILTER (WHERE COALESCE(p.payment_date - p.due_date, 0) > 60) AS late_over_60
    FROM payments p
    WHERE p.customer_id = c.id
      AND (p.finance_id = $1::uuid OR p.finance_id IS NULL)
      AND COALESCE(p.payment_status::text, 'active') = 'active'
  ) pay ON true
  LEFT JOIN LATERAL (
    SELECT GREATEST(
      COUNT(*) FILTER (WHERE ptp_x.ptp_status::text = 'broken'),
      COALESCE(SUM(ptp_x.broken_count), 0)
    ) AS broken_ptp_count
    FROM promise_to_pay ptp_x
    WHERE ptp_x.customer_id = c.id
      AND ptp_x.finance_id = $1::uuid
  ) ptp ON true
  WHERE c.finance_id = $1::uuid
  ORDER BY c.hplno ASC NULLS LAST, c.id ASC
`;

const TODAY_AND_YESTERDAY_COLLECTION_SQL = `
  SELECT
    COALESCE(
      SUM(COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0))
      FILTER (WHERE p.payment_date = $2::date),
      0
    ) AS today_collection,
    COUNT(*) FILTER (WHERE p.payment_date = $2::date)::int AS today_receipt_count,
    COALESCE(
      SUM(COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0))
      FILTER (WHERE p.payment_date = ($2::date - INTERVAL '1 day')::date),
      0
    ) AS yesterday_collection,
    COUNT(*) FILTER (WHERE p.payment_date = ($2::date - INTERVAL '1 day')::date)::int AS yesterday_receipt_count
  FROM payments p
  WHERE p.finance_id = $1::uuid
    AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
    AND p.payment_date IN ($2::date, ($2::date - INTERVAL '1 day')::date)
`;

const PERIOD_COLLECTION_SQL = `
  SELECT
    COALESCE(SUM(COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0)), 0) AS total_collection,
    COALESCE(SUM(COALESCE(p.amount, 0)), 0) AS emi_amount_total,
    COALESCE(SUM(COALESCE(p.penalty, 0)), 0) AS penalty_total,
    COALESCE(SUM(COALESCE(p.hand_loan, 0)), 0) AS hand_loan_total,
    COUNT(*)::int AS receipt_count,
    COUNT(DISTINCT p.customer_id)::int AS unique_customers_paid
  FROM payments p
  WHERE p.finance_id = $1::uuid
    AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
    AND p.payment_date >= $2::date
    AND p.payment_date <= $3::date
`;

// Uses `payments.collected_by` (granted in Migration 004) as primary collector label,
// with optional enrichment from `users_details` if Migration 005 grants are active.
const AGENT_COLLECTION_WITH_STAFF_SQL = `
  SELECT
    COALESCE(NULLIF(TRIM(ud.staff_name), ''), NULLIF(TRIM(p.collected_by), ''), u.username, 'Office / Direct') AS agent_name,
    COALESCE(SUM(COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0)), 0) AS total_collected,
    COUNT(*)::int AS receipt_count,
    COUNT(DISTINCT p.customer_id)::int AS customers_collected
  FROM payments p
  LEFT JOIN users u ON u.id = p.collected_by_id
  LEFT JOIN users_details ud ON ud.user_id = p.collected_by_id AND ud.finance_id = $1::uuid
  WHERE p.finance_id = $1::uuid
    AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
    AND p.payment_date >= $2::date
    AND p.payment_date <= $3::date
  GROUP BY 1
  ORDER BY total_collected DESC, receipt_count DESC
  LIMIT $4::int
`;

const AGENT_COLLECTION_CORE_004_SQL = `
  SELECT
    COALESCE(NULLIF(TRIM(p.collected_by), ''), 'Office / Direct') AS agent_name,
    COALESCE(SUM(COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0)), 0) AS total_collected,
    COUNT(*)::int AS receipt_count,
    COUNT(DISTINCT p.customer_id)::int AS customers_collected
  FROM payments p
  WHERE p.finance_id = $1::uuid
    AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
    AND p.payment_date >= $2::date
    AND p.payment_date <= $3::date
  GROUP BY 1
  ORDER BY total_collected DESC, receipt_count DESC
  LIMIT $4::int
`;

// Handles split payment modes (`payment_mode` + optional `payment_mode_1` / `payment_mode_1_amount`) accurately!
const PAYMENT_MODE_BREAKDOWN_SQL = `
  WITH split_legs AS (
    SELECT
      LOWER(COALESCE(p.payment_mode::text, 'cash')) AS mode,
      GREATEST(
        0,
        COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0)
        - CASE WHEN p.payment_mode_1 IS NOT NULL THEN COALESCE(p.payment_mode_1_amount, 0) ELSE 0 END
      ) AS leg_amount
    FROM payments p
    WHERE p.finance_id = $1::uuid
      AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
      AND p.payment_date >= $2::date
      AND p.payment_date <= $3::date
    UNION ALL
    SELECT
      LOWER(p.payment_mode_1::text) AS mode,
      COALESCE(p.payment_mode_1_amount, 0) AS leg_amount
    FROM payments p
    WHERE p.finance_id = $1::uuid
      AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
      AND p.payment_date >= $2::date
      AND p.payment_date <= $3::date
      AND p.payment_mode_1 IS NOT NULL
      AND COALESCE(p.payment_mode_1_amount, 0) > 0
  )
  SELECT
    mode,
    COALESCE(SUM(leg_amount), 0) AS total_amount,
    COUNT(*) FILTER (WHERE leg_amount > 0)::int AS transaction_count
  FROM split_legs
  GROUP BY mode
  ORDER BY total_amount DESC
  LIMIT 10
`;

const LOAN_DISBURSEMENT_SUMMARY_SQL = `
  SELECT
    COUNT(*)::int AS loans_disbursed_count,
    COALESCE(SUM(COALESCE(l.hp_amount, 0)), 0) AS total_disbursed_amount,
    COALESCE(SUM(COALESCE(l.net_payable, 0)), 0) AS total_net_payable
  FROM loans l
  LEFT JOIN customers c ON c.id = l.customer_id AND c.finance_id = l.finance_id
  LEFT JOIN vehicle_detail vd ON vd.id = COALESCE(l.vehicle_id, c.vehicle_id) AND vd.finance_id = l.finance_id
  WHERE l.finance_id = $1::uuid
    AND l.hp_date IS NOT NULL
    AND l.hp_date >= $2::date
    AND l.hp_date <= $3::date
    AND LOWER(COALESCE(l.loan_type, 'finance')) <> 'consulting'
    AND COALESCE(LOWER(vd.deal_type::text), 'finance') <> 'consulting'
`;

const OFFICE_EXPENSE_SUMMARY_SQL = `
  SELECT
    category,
    COALESCE(SUM(COALESCE(oe.amount, 0)), 0) AS category_total,
    COUNT(*)::int AS entry_count
  FROM office_expenses oe
  WHERE oe.finance_id = $1::uuid
    AND COALESCE(oe.transaction_type::text, 'Expense') = 'Expense'
    AND oe.expense_date >= $2::date
    AND oe.expense_date <= $3::date
  GROUP BY category
  ORDER BY category_total DESC
  LIMIT 8
`;

const VEHICLE_EXPENSE_TOTAL_SQL = `
  SELECT
    COALESCE(SUM(COALESCE(ve.amount, 0)), 0) AS vehicle_expense_total,
    COUNT(*)::int AS vehicle_expense_count
  FROM vehicle_expenses ve
  WHERE ve.finance_id = $1::uuid
    AND ve.expense_date >= $2::date
    AND ve.expense_date <= $3::date
`;

// Parameter contract:
//   $1::uuid   = finance_id
//   $2::int    = hplno (nullable)
//   $3::text[] = uppercase alphanumeric vehicle plate variants (e.g. ['TN09A0005', 'TN9A5'])
//   $4::text   = 4-digit vehicle plate suffix ('' when unused)
//   $5::text   = 10-digit customer phone number ('' when unused)
//   $6::text   = 4-digit customer phone suffix ('' when unused)
//   $7::text   = sanitized customer name substring ('' when unused)
//   $8::text[] = lowercase vehicle plate variants (leverages idx_vehicle_detail_number_unique when formatted identically)
const CUSTOMER_SEARCH_SQL = `
  SELECT
    c.id AS customer_id,
    c.hplno,
    c.cname,
    c.cfname_value,
    c.cfname_unit,
    c.profession,
    c.work_office_address,
    c.broker_name,
    c.loan_status::text AS loan_status,
    addr_info.full_address,
    addr_info.village,
    addr_info.city,
    addr_info.district,
    addr_info.pincode,
    vd.vehicle_number,
    vd.color,
    vd.rc_status::text AS rc_status,
    TO_CHAR(vd.insurance_expiry_date, 'YYYY-MM-DD') AS insurance_expiry_date,
    TO_CHAR(vd.fc_expiry_date, 'YYYY-MM-DD') AS fc_expiry_date,
    vi.brand,
    vi.model_name,
    vi.make_year,
    ct_info.phone_last4,
    ct_info.customer_phones_csv,
    ct_info.guardian_phones_csv,
    l.id AS loan_id,
    l.hp_amount,
    TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS hp_date,
    TO_CHAR(l.due_date, 'YYYY-MM-DD') AS due_date,
    COALESCE(TO_CHAR(l.due_date, 'YYYY-MM-DD'), TO_CHAR(l.hp_date, 'YYYY-MM-DD')) AS first_due_date,
    l.due_month,
    l.due_amount,
    l.net_payable,
    COALESCE(pay.total_paid, 0) AS total_paid,
    COALESCE(pay.payment_count, 0)::int AS payment_count,
    CASE
      WHEN $2::int IS NOT NULL AND c.hplno = $2::int THEN 1
      WHEN CARDINALITY($3::text[]) > 0
        AND vd.vehicle_number IS NOT NULL
        AND (
          LOWER(vd.vehicle_number) = ANY($8::text[])
          OR UPPER(REGEXP_REPLACE(vd.vehicle_number, '[^A-Za-z0-9]', '', 'g')) = ANY($3::text[])
        ) THEN 2
      WHEN $4::text <> ''
        AND vd.vehicle_number IS NOT NULL
        AND RIGHT(UPPER(REGEXP_REPLACE(vd.vehicle_number, '[^A-Za-z0-9]', '', 'g')), 4) = $4::text THEN 3
      WHEN ct_info.matched_phone THEN 4
      WHEN $7::text <> '' AND c.cname ILIKE ('%' || $7::text || '%') THEN 5
      ELSE 99
    END AS match_rank
  FROM customers c
  LEFT JOIN LATERAL (
    SELECT l_sub.*
    FROM loans l_sub
    WHERE l_sub.customer_id = c.id
      AND l_sub.finance_id = $1::uuid
    ORDER BY l_sub.hp_date DESC NULLS LAST, l_sub.id DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN vehicle_detail vd ON vd.id = COALESCE(l.vehicle_id, c.vehicle_id) AND vd.finance_id = $1::uuid
  LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(
        CONCAT_WS(', ',
          NULLIF(CONCAT_WS(' ', a.house_no, a.street), ''),
          NULLIF(a.street_name, ''),
          NULLIF(a.village, ''),
          NULLIF(a.land_mark, ''),
          NULLIF(a.address, ''),
          NULLIF(a.city, ''),
          NULLIF(a.district, ''),
          NULLIF(a.state, ''),
          NULLIF(a.pincode, '')
        ),
        ''
      ) AS full_address,
      a.village,
      a.city,
      a.district,
      a.pincode
    FROM address_history ah
    JOIN addresses a ON ah.address_id = a.id
    WHERE ah.entity_type = 'customer'
      AND ah.entity_id = c.id::text
      AND ah.is_current = 1
    ORDER BY ah.changed_at DESC NULLS LAST, ah.id DESC
    LIMIT 1
  ) addr_info ON true
  LEFT JOIN LATERAL (
    SELECT
      MAX(
        CASE
          WHEN LENGTH(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(ct.number), ''), COALESCE(ct.phone_e164, '')), '[^0-9]', '', 'g')) >= 4
          THEN RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(ct.number), ''), COALESCE(ct.phone_e164, '')), '[^0-9]', '', 'g'), 4)
          ELSE NULL
        END
      ) AS phone_last4,
      STRING_AGG(
        DISTINCT NULLIF(TRIM(COALESCE(NULLIF(TRIM(ct.number), ''), ct.phone_e164)), ''),
        ','
      ) FILTER (WHERE COALESCE(ct.contact_type::text, 'customer') = 'customer') AS customer_phones_csv,
      STRING_AGG(
        DISTINCT NULLIF(TRIM(COALESCE(NULLIF(TRIM(ct.number), ''), ct.phone_e164)), ''),
        ','
      ) FILTER (WHERE ct.contact_type::text = 'guardian') AS guardian_phones_csv,
      COALESCE(
        BOOL_OR(
          (
            $5::text <> ''
            AND LENGTH(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(ct.number), ''), COALESCE(ct.phone_e164, '')), '[^0-9]', '', 'g')) >= 10
            AND RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(ct.number), ''), COALESCE(ct.phone_e164, '')), '[^0-9]', '', 'g'), 10) = $5::text
          )
          OR (
            $5::text = ''
            AND $6::text <> ''
            AND LENGTH(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(ct.number), ''), COALESCE(ct.phone_e164, '')), '[^0-9]', '', 'g')) >= 4
            AND RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(ct.number), ''), COALESCE(ct.phone_e164, '')), '[^0-9]', '', 'g'), 4) = $6::text
          )
        ),
        false
      ) AS matched_phone
    FROM contacts ct
    WHERE ct.customer_id = c.id
      AND (ct.finance_id = $1::uuid OR ct.finance_id IS NULL)
  ) ct_info ON true
  LEFT JOIN LATERAL (
    SELECT
      SUM(COALESCE(p.amount, 0)) AS total_paid,
      COUNT(*) AS payment_count
    FROM payments p
    WHERE p.customer_id = c.id
      AND p.finance_id = $1::uuid
      AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
  ) pay ON true
  WHERE c.finance_id = $1::uuid
    AND (
      ($2::int IS NOT NULL AND c.hplno = $2::int)
      OR (
        CARDINALITY($3::text[]) > 0
        AND vd.vehicle_number IS NOT NULL
        AND (
          LOWER(vd.vehicle_number) = ANY($8::text[])
          OR UPPER(REGEXP_REPLACE(vd.vehicle_number, '[^A-Za-z0-9]', '', 'g')) = ANY($3::text[])
        )
      )
      OR (
        $4::text <> ''
        AND vd.vehicle_number IS NOT NULL
        AND RIGHT(UPPER(REGEXP_REPLACE(vd.vehicle_number, '[^A-Za-z0-9]', '', 'g')), 4) = $4::text
      )
      OR ct_info.matched_phone
      OR ($7::text <> '' AND c.cname ILIKE ('%' || $7::text || '%'))
    )
  ORDER BY match_rank ASC, c.hplno ASC NULLS LAST
  LIMIT 5
`;

async function queryPortfolioRowsSafe(scope, options) {
  try {
    const res = await executeReadOnlyQuery(scope, PORTFOLIO_RISK_SQL, [scope.financeId], options);
    return res.rows;
  } catch (err) {
    // Graceful fallback if Migration 005 (`seizing_vehicle` grant) hasn't been executed on remote DB yet
    if (err && err.code === '42501') {
      const fallback = await executeReadOnlyQuery(scope, PORTFOLIO_RISK_CORE_004_SQL, [scope.financeId], options);
      return fallback.rows;
    }
    throw err;
  }
}

function clampPayloadSize(obj) {
  const cfg = getAssistantConfig();
  const str = JSON.stringify(obj);
  if (Buffer.byteLength(str, 'utf8') <= cfg.dbReadOnly.maxResultBytes) {
    return obj;
  }
  // Trim oversized array fields deterministically if needed
  const trimmed = { ...obj, truncated: true };
  for (const key of Object.keys(trimmed)) {
    if (Array.isArray(trimmed[key]) && trimmed[key].length > 5) {
      trimmed[key] = trimmed[key].slice(0, 5);
    }
  }
  return trimmed;
}

function extractTodayCollectionSummary(row = {}) {
  const todayCollection = round2(Number(row.today_collection) || 0);
  const yesterdayCollection = round2(Number(row.yesterday_collection) || 0);
  const diff = round2(todayCollection - yesterdayCollection);
  let trendPercent = null;
  if (yesterdayCollection > 0) {
    trendPercent = round2((diff / yesterdayCollection) * 100);
  } else if (todayCollection > 0) {
    trendPercent = 100;
  }
  return { todayCollection, yesterdayCollection, diff, trendPercent };
}

const TOOL_HANDLERS = {
  async get_today_collection(scope, params, options) {
    const todayIST = params.date || getCurrentDateIST();
    const res = await executeReadOnlyQuery(
      scope,
      TODAY_AND_YESTERDAY_COLLECTION_SQL,
      [scope.financeId, todayIST],
      options
    );
    const row = res.rows[0] || {};
    const calc = extractTodayCollectionSummary(row);

    return {
      dataType: 'today_collection',
      currency: 'INR',
      date: todayIST,
      todayCollection: calc.todayCollection,
      todayReceiptCount: Number(row.today_receipt_count) || 0,
      yesterdayCollection: calc.yesterdayCollection,
      yesterdayReceiptCount: Number(row.yesterday_receipt_count) || 0,
      differenceFromYesterday: calc.diff,
      trendPercent: calc.trendPercent,
    };
  },

  async get_collection_by_period(scope, params, options) {
    const res = await executeReadOnlyQuery(
      scope,
      PERIOD_COLLECTION_SQL,
      [scope.financeId, params.startDate, params.endDate],
      options
    );
    const r = res.rows[0] || {};
    return {
      dataType: 'period_collection',
      currency: 'INR',
      period: params.period,
      startDate: params.startDate,
      endDate: params.endDate,
      totalCollection: round2(Number(r.total_collection) || 0),
      emiAmountTotal: round2(Number(r.emi_amount_total) || 0),
      penaltyTotal: round2(Number(r.penalty_total) || 0),
      handLoanTotal: round2(Number(r.hand_loan_total) || 0),
      receiptCount: Number(r.receipt_count) || 0,
      uniqueCustomersPaid: Number(r.unique_customers_paid) || 0,
    };
  },

  async get_finance_overview(scope, params, options) {
    const todayIST = params.asOfDate || getCurrentDateIST();
    const isOwnerOrAdmin = scope.isOwner || scope.role === 'owner' || scope.role === 'admin';

    const [customerRows, vehicleRes, todayRes, cashRes] = await Promise.all([
      queryPortfolioRowsSafe(scope, options),
      executeReadOnlyQuery(scope, VEHICLES_STATUS_SQL, [scope.financeId], options),
      executeReadOnlyQuery(scope, TODAY_AND_YESTERDAY_COLLECTION_SQL, [scope.financeId, todayIST], options),
      isOwnerOrAdmin
        ? executeReadOnlyQuery(scope, CASH_IN_HAND_SQL, [scope.financeId], options).catch((err) => {
            if (err && (err.code === '42501' || err.code === '42P01' || err.code === '42703')) {
              return null;
            }
            throw err;
          })
        : Promise.resolve(null),
    ]);

    const portfolio = computePortfolioAndInsights(customerRows, todayIST);
    const vehicles = computeVehicleCounts(vehicleRes.rows);
    const todayCalc = extractTodayCollectionSummary(todayRes.rows[0] || {});
    const cashInHand = cashRes && cashRes.rows?.[0] ? computeCashInHand(cashRes.rows[0]) : null;

    return {
      dataType: 'finance_overview',
      currency: 'INR',
      asOfDate: todayIST,
      totalCustomers: portfolio.totalCustomers,
      activeLoans: portfolio.activeLoans,
      unpaidCustomers: portfolio.unpaidCustomers,
      pendingDuesTotal: portfolio.pendingDues,
      seizedVehicles: portfolio.seizedVehicles,
      godownVehicles: vehicles.godownVehicles,
      totalVehicles: vehicles.totalVehicles,
      todayCollection: todayCalc.todayCollection,
      yesterdayCollection: todayCalc.yesterdayCollection,
      ...(cashInHand !== null ? { cashInHand } : {}),
      quickInsights: portfolio.quickInsights,
    };
  },

  async get_pending_and_overdue_summary(scope, params, options) {
    const todayIST = params.asOfDate || getCurrentDateIST();
    const topLimit = params.topLimit || 5;
    const customerRows = await queryPortfolioRowsSafe(scope, options);
    const portfolio = computePortfolioAndInsights(customerRows, todayIST);
    const pendingSnapshot = computeCustomerPendingSnapshot(customerRows, todayIST);

    const overdueAccounts = [];
    for (const r of customerRows) {
      const status = String(r.loan_status || 'active').trim().toLowerCase();
      if (status === 'close') continue;
      const cid = String(r.customer_id ?? r.id ?? '');
      const snap = pendingSnapshot.byCustomerId.get(cid);
      if (snap && snap.monthlyPending > 0) {
        overdueAccounts.push({
          hplno: r.hplno,
          customerName: r.cname,
          loanStatus: status,
          pendingAmount: round2(snap.monthlyPending),
          pendingInstallments: snap.overdueMonths,
          overdueDays: snap.overdueDays,
        });
      }
    }

    overdueAccounts.sort((a, b) => b.pendingAmount - a.pendingAmount || b.overdueDays - a.overdueDays);

    return {
      dataType: 'pending_and_overdue_summary',
      currency: 'INR',
      asOfDate: todayIST,
      unpaidCustomers: portfolio.unpaidCustomers,
      totalPendingDues: portfolio.pendingDues,
      todaysDueCount: portfolio.quickInsights.todaysDueCount,
      overdueOver30DaysCount: portfolio.quickInsights.overdueOver30Days,
      highRiskCustomers: portfolio.quickInsights.highRiskCustomers,
      topOverdueAccounts: overdueAccounts.slice(0, topLimit),
    };
  },

  async get_agent_collection_summary(scope, params, options) {
    let rows;
    try {
      const res = await executeReadOnlyQuery(
        scope,
        AGENT_COLLECTION_WITH_STAFF_SQL,
        [scope.financeId, params.startDate, params.endDate, params.limit],
        options
      );
      rows = res.rows;
    } catch (err) {
      if (err && err.code === '42501') {
        const fallback = await executeReadOnlyQuery(
          scope,
          AGENT_COLLECTION_CORE_004_SQL,
          [scope.financeId, params.startDate, params.endDate, params.limit],
          options
        );
        rows = fallback.rows;
      } else {
        throw err;
      }
    }

    const agents = rows.map((r, idx) => ({
      rank: idx + 1,
      agentName: r.agent_name,
      totalCollected: round2(Number(r.total_collected) || 0),
      receiptCount: Number(r.receipt_count) || 0,
      customersCollected: Number(r.customers_collected) || 0,
    }));

    const grandTotal = round2(agents.reduce((acc, a) => acc + a.totalCollected, 0));

    return {
      dataType: 'agent_collection_summary',
      currency: 'INR',
      period: params.period,
      startDate: params.startDate,
      endDate: params.endDate,
      topCollector: agents[0] || null,
      listedTotalCollected: grandTotal,
      agents,
    };
  },

  async get_payment_mode_breakdown(scope, params, options) {
    const res = await executeReadOnlyQuery(
      scope,
      PAYMENT_MODE_BREAKDOWN_SQL,
      [scope.financeId, params.startDate, params.endDate],
      options
    );
    const modes = res.rows.map((r) => ({
      mode: r.mode,
      totalAmount: round2(Number(r.total_amount) || 0),
      transactionCount: Number(r.transaction_count) || 0,
    }));
    const grandTotal = round2(modes.reduce((s, m) => s + m.totalAmount, 0));

    return {
      dataType: 'payment_mode_breakdown',
      currency: 'INR',
      period: params.period,
      startDate: params.startDate,
      endDate: params.endDate,
      totalCollection: grandTotal,
      modes,
    };
  },

  async get_loan_disbursement_summary(scope, params, options) {
    const res = await executeReadOnlyQuery(
      scope,
      LOAN_DISBURSEMENT_SUMMARY_SQL,
      [scope.financeId, params.startDate, params.endDate],
      options
    );
    const r = res.rows[0] || {};
    return {
      dataType: 'loan_disbursement_summary',
      currency: 'INR',
      period: params.period,
      startDate: params.startDate,
      endDate: params.endDate,
      loansDisbursedCount: Number(r.loans_disbursed_count) || 0,
      totalDisbursedAmount: round2(Number(r.total_disbursed_amount) || 0),
      totalNetPayable: round2(Number(r.total_net_payable) || 0),
    };
  },

  async get_expense_summary(scope, params, options) {
    try {
      const [officeRes, vehicleRes] = await Promise.all([
        executeReadOnlyQuery(
          scope,
          OFFICE_EXPENSE_SUMMARY_SQL,
          [scope.financeId, params.startDate, params.endDate],
          options
        ),
        executeReadOnlyQuery(
          scope,
          VEHICLE_EXPENSE_TOTAL_SQL,
          [scope.financeId, params.startDate, params.endDate],
          options
        ),
      ]);

      const categories = officeRes.rows.map((r) => ({
        category: r.category,
        amount: round2(Number(r.category_total) || 0),
        entries: Number(r.entry_count) || 0,
      }));
      const officeTotal = round2(categories.reduce((s, c) => s + c.amount, 0));
      const vehicleTotal = round2(Number(vehicleRes.rows[0]?.vehicle_expense_total) || 0);

      return {
        dataType: 'expense_summary',
        currency: 'INR',
        period: params.period,
        startDate: params.startDate,
        endDate: params.endDate,
        totalExpenses: round2(officeTotal + vehicleTotal),
        officeExpenseTotal: officeTotal,
        vehicleExpenseTotal: vehicleTotal,
        topOfficeCategories: categories,
      };
    } catch (err) {
      if (err && err.code === '42501') {
        return {
          dataType: 'expense_summary',
          available: false,
          reason:
            'Read-only role requires Migration 005 SELECT grant on office_expenses and vehicle_expenses to read expense totals.',
        };
      }
      throw err;
    }
  },

  async search_customer_loan_status(scope, params, options) {
    const upperVariants = Array.isArray(params.vehicleVariants)
      ? params.vehicleVariants.filter(Boolean).map((v) => String(v).toUpperCase())
      : [];
    const vehicleLast4 = params.vehicleLast4 ? String(params.vehicleLast4) : '';
    const phoneFull = params.phoneFull ? String(params.phoneFull) : '';
    const phoneLast4 = params.phoneLast4 ? String(params.phoneLast4) : '';
    const customerName = params.customerName ? String(params.customerName) : '';

    if (
      params.hplno === null &&
      upperVariants.length === 0 &&
      !vehicleLast4 &&
      !phoneFull &&
      !phoneLast4 &&
      !customerName
    ) {
      return {
        dataType: 'customer_loan_lookup',
        currency: 'INR',
        matchType: 'not_found',
        ambiguous: false,
        matchCount: 0,
        matches: [],
        note: 'Please provide an HPL loan number, vehicle plate number, phone number, or customer name.',
      };
    }

    const lowerVariantSet = new Set(upperVariants.map((v) => v.toLowerCase()));
    if (params.vehicleDisplay) {
      lowerVariantSet.add(String(params.vehicleDisplay).toLowerCase());
      lowerVariantSet.add(String(params.vehicleDisplay).replace(/\s+/g, '-').toLowerCase());
    }
    const lowerVariants = Array.from(lowerVariantSet);

    const todayIST = getCurrentDateIST();
    const res = await executeReadOnlyQuery(
      scope,
      CUSTOMER_SEARCH_SQL,
      [
        scope.financeId,
        params.hplno,
        upperVariants,
        vehicleLast4,
        phoneFull,
        phoneLast4,
        customerName,
        lowerVariants,
      ],
      options
    );

    if (!res.rows || res.rows.length === 0) {
      return {
        dataType: 'customer_loan_lookup',
        currency: 'INR',
        matchType: 'not_found',
        ambiguous: false,
        matchCount: 0,
        matches: [],
        note: 'No matching customer or vehicle was found in this finance company. Do NOT guess or substitute another customer.',
      };
    }

    const bestRank = Number(res.rows[0].match_rank) || 5;
    const bestRows = res.rows.filter((r) => (Number(r.match_rank) || 5) === bestRank);

    const RANK_TO_MATCH_TYPE = {
      1: 'hplno',
      2: 'vehicle_full',
      3: 'vehicle_last4',
      4: 'phone',
      5: 'customer_name',
    };
    const matchType = RANK_TO_MATCH_TYPE[bestRank] || 'customer_name';

    const pendingSnapshot = computeCustomerPendingSnapshot(bestRows, todayIST);
    const matches = bestRows.map((r) => {
      const cid = String(r.customer_id ?? r.id ?? '');
      const snap = pendingSnapshot.byCustomerId.get(cid);
      const parsedDbPlate = r.vehicle_number ? parseVehiclePlate(String(r.vehicle_number)) : null;
      const plateDisplay =
        parsedDbPlate?.display || (r.vehicle_number ? String(r.vehicle_number).trim() : null);
      const vehicleLabel =
        [r.brand, r.model_name, plateDisplay || r.vehicle_number].filter(Boolean).join(' ').trim() || null;
      const maskedPhone = r.phone_last4 ? `******${String(r.phone_last4).slice(-4)}` : null;
      const phoneNumbers =
        typeof r.customer_phones_csv === 'string' && r.customer_phones_csv.trim()
          ? r.customer_phones_csv
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      const guardianPhoneNumbers =
        typeof r.guardian_phones_csv === 'string' && r.guardian_phones_csv.trim()
          ? r.guardian_phones_csv
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      const relationName = r.cfname_value
        ? [r.cfname_unit, r.cfname_value].filter(Boolean).join(' ').trim()
        : null;

      return {
        customerId: cid || null,
        hplno: r.hplno,
        customerName: r.cname,
        ...(relationName ? { relationName } : {}),
        loanStatus: r.loan_status,
        vehicle: vehicleLabel,
        maskedPhone,
        ...(phoneNumbers.length > 0
          ? {
              primaryPhone: phoneNumbers[0],
              phoneNumbers,
            }
          : {}),
        ...(guardianPhoneNumbers.length > 0 ? { guardianPhoneNumbers } : {}),
        fullAddress: r.full_address || null,
        addressDetail:
          r.full_address || r.village || r.city || r.district || r.pincode
            ? {
                fullAddress: r.full_address || null,
                village: r.village || null,
                city: r.city || null,
                district: r.district || null,
                pincode: r.pincode || null,
                workOfficeAddress: r.work_office_address || null,
              }
            : null,
        ...(r.profession ? { profession: r.profession } : {}),
        ...(r.broker_name ? { brokerName: r.broker_name } : {}),
        vehicleDetail: {
          plateDisplay,
          vehicleNumberRaw: r.vehicle_number || null,
          brand: r.brand || null,
          modelName: r.model_name || null,
          makeYear: r.make_year ? Number(r.make_year) : null,
          color: r.color || null,
          rcStatus: r.rc_status || null,
          insuranceExpiryDate: r.insurance_expiry_date || null,
          fcExpiryDate: r.fc_expiry_date || null,
        },
        hpAmount: round2(Number(r.hp_amount) || 0),
        installmentAmount: round2(Number(r.due_amount) || 0),
        totalInstallments: Number(r.due_month) || 0,
        totalPaid: round2(Number(r.total_paid) || 0),
        remainingBalance: snap ? round2(snap.balance) : 0,
        pendingOverdueAmount: snap ? round2(snap.monthlyPending) : 0,
        pendingInstallments: snap ? snap.overdueMonths : 0,
        overdueDays: snap ? snap.overdueDays : 0,
      };
    });

    const ambiguous = matches.length > 1;

    return {
      dataType: 'customer_loan_lookup',
      currency: 'INR',
      matchType,
      ambiguous,
      matchCount: matches.length,
      matches,
      ...(ambiguous
        ? {
            note: 'Multiple customers matched. List the matching HPL numbers, customer names, and vehicle plates briefly and ask which one the user wants without guessing.',
          }
        : {}),
    };
  },

  async run_readonly_select_query(scope, params, options) {
    const execRes = await executeDynamicReadOnlySql(scope, params.sql, {
      reason: params.reason,
      signal: options?.signal,
    });
    return {
      dataType: 'dynamic_readonly_select',
      rowCount: execRes.rowCount,
      maxRowsCap: 50,
      truncatedAtRowCap: execRes.rowCount >= 50,
      rows: execRes.rows,
    };
  },

  async call_backend_get_api(scope, params, options) {
    return executeBackendGetApi(scope, params, options);
  },

  async list_backend_get_apis(scope, params) {
    return {
      dataType: 'backend_get_api_catalog',
      ...searchBackendGetApiCatalog(scope, params),
    };
  },
};

/**
 * Executes an approved read-only tool with Tenant-Scoped Dual-Tier Caching
 * (except `run_readonly_select_query`, which executes live & writes an audit log every call).
 *
 * @param {object} scope Immutable verified scope from `financeScopeValidator`
 * @param {string} rawToolName
 * @param {object} rawParameters
 * @param {{ bypassCache?: boolean, signal?: AbortSignal }} [options={}]
 */
async function executeReadOnlyTool(scope, rawToolName, rawParameters = {}, options = {}) {
  const { tool, toolName, parameters } = resolveAndValidateToolCall(scope, rawToolName, rawParameters);
  const handler = TOOL_HANDLERS[toolName];
  const cfg = getAssistantConfig();
  const ttlSec = cfg.cache.ttlsSec[tool.cacheCategory] || 30;
  const shouldCache = toolName !== 'run_readonly_select_query';

  if (shouldCache && !options.bypassCache) {
    const cached = await getCachedQueryResult(scope, toolName, parameters);
    if (cached.hit && cached.data) {
      return {
        toolName,
        result: cached.data,
        cacheHit: true,
        cacheTier: cached.tier,
      };
    }
  }

  const rawResult = await handler(scope, parameters, { signal: options.signal });
  const sanitizedResult =
    toolName === 'call_backend_get_api' ? rawResult : clampPayloadSize(rawResult);

  if (shouldCache && sanitizedResult?.ok !== false) {
    await setCachedQueryResult(scope, toolName, parameters, sanitizedResult, ttlSec);
  }

  return {
    toolName,
    result: sanitizedResult,
    cacheHit: false,
    cacheTier:
      toolName === 'call_backend_get_api' || toolName === 'list_backend_get_apis'
        ? 'backend_get_api'
        : 'postgres_ro',
  };
}

module.exports = {
  executeReadOnlyTool,
  TOOL_HANDLERS,
  CUSTOMER_SEARCH_SQL,
};

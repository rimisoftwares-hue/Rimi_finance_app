'use strict';

const {
  getCurrentDateIST,
  parseMonthKey,
  buildMonthSpine,
  getMonthStartEnd,
  formatMonthShortLabel,
  computeLoanRatio,
  splitPrincipalInterest,
  toPaise,
  fromPaise,
  round2,
  isValidPaymentStatus,
} = require('../accounting/reports/business.calculator');
const {
  computeLoanMetrics,
  scoreCustomer,
} = require('../risk/risk.scoring');
const {
  calculateInstallmentDueDates,
  mapPendingCollectionRow,
} = require('../customers/pendingCollectionsHelper');

function getShortMonthName(monthKey) {
  const label = formatMonthShortLabel(monthKey);
  return label ? label.split(' ')[0] : String(monthKey || '');
}

/**
 * Recursive Cash/Bank ledger CTE matching `daybook.service.js` (`CASH_BANK_CTE`).
 * Identifies all ledgers under 'Cash-in-hand', 'Bank Accounts', 'Bank OD A/c',
 * or flagged with `is_bank_account = TRUE` for `$1::uuid` (`finance_id`).
 */
const CASH_BANK_CTE = `
  WITH RECURSIVE cb_master AS (
    SELECT id FROM acc_group_master
    WHERE group_name IN ('Cash-in-hand', 'Bank Accounts', 'Bank OD A/c')
  ),
  cb_groups AS (
    SELECT g.id FROM acc_ledger_groups g
    WHERE g.finance_id = $1::uuid
      AND (
        g.system_parent_id IN (SELECT id FROM cb_master)
        OR g.root_master_id IN (SELECT id FROM cb_master)
        OR g.system_group_type IN ('Bank Accounts', 'Cash in Hand')
      )
    UNION
    SELECT c.id FROM acc_ledger_groups c
    JOIN cb_groups p ON c.custom_parent_id = p.id
    WHERE c.finance_id = $1::uuid
  ),
  cb_ledgers AS (
    SELECT l.id, l.opening_balance, l.ob_type FROM acc_ledgers l
    WHERE l.finance_id = $1::uuid
      AND (
        l.is_bank_account = TRUE
        OR l.master_group_id IN (SELECT id FROM cb_master)
        OR l.group_id IN (SELECT id FROM cb_groups)
      )
  )
`;

/**
 * Checks whether a loan/vehicle pair is a consulting deal (which must be excluded
 * from `loanDist` and unlinked loan cash-out).
 *
 * @param {object} row
 * @returns {boolean}
 */
function isConsultingDeal(row = {}) {
  const loanType = String(row.loan_type ?? row.loanType ?? 'finance').trim().toLowerCase();
  const dealType = String(row.deal_type ?? row.dealType ?? 'finance').trim().toLowerCase();
  return loanType === 'consulting' || dealType === 'consulting';
}

/**
 * Computes a real percentage trend badge `{ value: number, up: boolean }` when a
 * defensible non-zero baseline exists, or `null` when no comparison is meaningful.
 * Never returns fabricated numbers.
 *
 * @param {number|null|undefined} currentVal
 * @param {number|null|undefined} previousVal
 * @returns {{ value: number, up: boolean } | null}
 */
function computeKpiTrendBadge(currentVal, previousVal) {
  if (
    currentVal === null ||
    currentVal === undefined ||
    previousVal === null ||
    previousVal === undefined
  ) {
    return null;
  }
  const curr = Number(currentVal);
  const prev = Number(previousVal);
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev <= 0) {
    return null;
  }
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) {
    return null;
  }
  return {
    value: Math.abs(pct),
    up: pct > 0,
  };
}

/**
 * Pure portfolio, loan distribution, pending dues, and quick insights calculator.
 * Reuses `mapPendingCollectionRow` (`pendingCollectionsHelper.js`) and
 * `scoreCustomer` / `computeLoanMetrics` (`risk.scoring.js`) so numbers match
 * `/collections/pending`, `/locator/alerts`, and `/reports/due-analysis` to the paisa.
 *
 * @param {Array<object>} customerRows
 * @param {string} todayDateIST 'YYYY-MM-DD' in IST
 */
function computePortfolioAndInsights(customerRows = [], todayDateIST = getCurrentDateIST()) {
  let totalCustomers = 0;
  let activeLoans = 0;
  let seizedVehicles = 0;
  let unpaidCustomers = 0;
  let pendingDuesPaise = 0;

  let activeOnTimeCount = 0;
  let activeDefaultCount = 0;
  let closedCount = 0;
  let seizedCount = 0;

  let criticalAlerts = 0;
  let highAlerts = 0;
  let todaysDueCount = 0;
  let overdueOver30Days = 0;

  const currentMonthKey = todayDateIST.slice(0, 7);
  const parsedCurr = parseMonthKey(currentMonthKey);
  const prevMonthDateEnd = parsedCurr
    ? (() => {
        const prevYear = parsedCurr.month === 1 ? parsedCurr.year - 1 : parsedCurr.year;
        const prevMonth = parsedCurr.month === 1 ? 12 : parsedCurr.month - 1;
        const prevKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        return getMonthStartEnd(prevKey).endDate;
      })()
    : null;
  let customersAsOfPrevMonth = 0;

  for (const r of customerRows) {
    totalCustomers += 1;
    const status = String(r.loan_status ?? r.loanStatus ?? 'active').trim().toLowerCase();

    const createdDateStr = r.customer_created_at
      ? String(r.customer_created_at).slice(0, 10)
      : r.hp_date
        ? String(r.hp_date).slice(0, 10)
        : null;
    if (prevMonthDateEnd && createdDateStr && createdDateStr <= prevMonthDateEnd) {
      customersAsOfPrevMonth += 1;
    }

    if (status === 'close') {
      closedCount += 1;
      continue;
    }

    const isSeized = status === 'seized';
    if (isSeized) {
      seizedVehicles += 1;
      seizedCount += 1;
    } else {
      activeLoans += 1;
    }

    const hasLoan =
      r.loan_id !== undefined && r.loan_id !== null
        ? true
        : r.due_amount !== undefined || r.hp_amount !== undefined || r.net_payable !== undefined;

    if (!hasLoan) {
      if (!isSeized) {
        activeOnTimeCount += 1;
      }
      continue;
    }

    const firstDueDate =
      r.first_due_date ||
      r.due_date ||
      r.hp_date ||
      null;

    const totalInstallments = Number(r.total_installments ?? r.due_month ?? r.dueMonth) || 0;
    const installmentAmount = Number(r.installment_amount ?? r.due_amount ?? r.dueAmount) || 0;

    // 1. Pending Collections calculation (matches /collections/pending)
    const pendingMapped = mapPendingCollectionRow(
      {
        customer_id: r.customer_id ?? r.id,
        hplno: r.hplno,
        customer_name: r.cname ?? r.customer_name,
        loan_status: status,
        total_installments: totalInstallments,
        installment_amount: installmentAmount,
        due_amount: installmentAmount,
        due_month: totalInstallments,
        total_paid: r.total_paid ?? r.totalPaid ?? 0,
        first_due_date: firstDueDate,
        hp_date: r.hp_date ?? r.hpDate,
        hp_amount: r.hp_amount ?? r.hpAmount,
        net_payable: r.net_payable ?? r.netPayable,
        penalty_amount: r.penalty_amount ?? r.penaltyAmount ?? 0,
      },
      todayDateIST
    );

    const monthlyPending = Number(pendingMapped.pending ?? pendingMapped.monthlyPending) || 0;
    const balanceAmount = Number(pendingMapped.balance ?? pendingMapped.balanceAmount) || 0;

    const isUnpaid = monthlyPending > 0;
    if (isUnpaid) {
      unpaidCustomers += 1;
      pendingDuesPaise += toPaise(monthlyPending);
    }

    // 2. Risk & Aging calculation (matches /api/risk/alerts and /api/risk/due-analysis)
    const scored = scoreCustomer(
      {
        loanStatus: status,
        dueAmount: installmentAmount,
        netPayable: r.net_payable ?? r.netPayable,
        hpAmount: r.hp_amount ?? r.hpAmount,
        dueMonth: totalInstallments,
        totalPaid: r.total_paid ?? r.totalPaid ?? 0,
        hpDate: r.hp_date ?? r.hpDate,
        dueDate: r.due_date ?? r.dueDate ?? null,
        customerCreatedAt: r.customer_created_at ?? r.customerCreatedAt,
        asOfDate: todayDateIST,
      },
      {
        totalPayments: Number(r.payment_count ?? r.totalPayments) || 0,
        onTimePayments: Number(r.on_time_count ?? r.onTimePayments) || 0,
        late15to30: Number(r.late_15_30 ?? r.late15to30) || 0,
        late31to60: Number(r.late_31_60 ?? r.late31to60) || 0,
        lateOver60: Number(r.late_over_60 ?? r.lateOver60) || 0,
        brokenPtpCount: Number(r.broken_ptp_count ?? r.brokenPtpCount) || 0,
        hasSeizure: Boolean(r.has_seizure ?? r.hasSeizure),
      }
    );

    if (scored.riskLevel === 'critical') {
      criticalAlerts += 1;
    } else if (scored.riskLevel === 'high') {
      highAlerts += 1;
    }

    if (scored.metrics.overdueDays > 30) {
      overdueOver30Days += 1;
    }

    // 3. Today's Due Count: open loan with balance remaining whose current installment due date equals todayDateIST
    const hasRemainingBalance =
      scored.metrics.pendingAmount > 0 || balanceAmount > 0;
    if (hasRemainingBalance) {
      let hasInstallmentOnToday = scored.metrics.nextDueDate === todayDateIST;
      if (!hasInstallmentOnToday && firstDueDate && totalInstallments > 0) {
        const yesterdayDate = new Date(`${todayDateIST}T00:00:00Z`);
        yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
        const dueToday = calculateInstallmentDueDates(firstDueDate, totalInstallments, todayDateIST).dueSoFar;
        const dueYesterday = calculateInstallmentDueDates(firstDueDate, totalInstallments, yesterdayStr).dueSoFar;
        hasInstallmentOnToday = dueToday > dueYesterday;
      }
      if (hasInstallmentOnToday) {
        todaysDueCount += 1;
      }
    }

    // 4. Loan Distribution slice classification for 'active' loans
    if (!isSeized) {
      if (isUnpaid || scored.metrics.overdueDays > 0) {
        activeDefaultCount += 1;
      } else {
        activeOnTimeCount += 1;
      }
    }
  }

  // Active Loans KPI is all active loans, so it equals Active + Default on the pie.
  const loanDistribution = [
    { name: 'Active', value: activeOnTimeCount, color: 'hsl(var(--primary))' },
    { name: 'Closed', value: closedCount, color: 'hsl(var(--income))' },
    { name: 'Default', value: activeDefaultCount, color: 'hsl(var(--expense))' },
    { name: 'Seized', value: seizedCount, color: 'hsl(var(--pending))' },
  ];

  const totalCustomersTrend = computeKpiTrendBadge(totalCustomers, customersAsOfPrevMonth);

  return {
    totalCustomers,
    activeLoans,
    seizedVehicles,
    unpaidCustomers,
    pendingDues: fromPaise(pendingDuesPaise),
    loanDistribution,
    quickInsights: {
      highRiskCustomers: criticalAlerts + highAlerts,
      criticalAlerts,
      highAlerts,
      todaysDueCount,
      overdueOver30Days,
    },
    trends: {
      totalCustomers: totalCustomersTrend,
    },
  };
}

/**
 * Shared snapshot helper for Home & Staff dashboards:
 * Computes `todayDues`, `unpaidCustomers`, `pendingDues`, and a per-customer map
 * of `{ monthlyPending, balance, overdueDays, overdueMonths }` using the exact
 * same portfolio & pending-collection rules as `computePortfolioAndInsights`.
 *
 * @param {Array<Object>} customerRows
 * @param {string} todayDateIST - 'YYYY-MM-DD'
 */
function computeCustomerPendingSnapshot(customerRows = [], todayDateIST) {
  const portfolio = computePortfolioAndInsights(customerRows, todayDateIST);
  const byCustomerId = new Map();

  for (const r of customerRows) {
    const cid = String(r.customer_id ?? r.id ?? '');
    if (!cid) continue;
    const status = String(r.loan_status ?? r.loanStatus ?? '').trim().toLowerCase();
    if (status === 'close') {
      byCustomerId.set(cid, {
        customerId: cid,
        monthlyPending: 0,
        balance: 0,
        overdueDays: 0,
        overdueMonths: 0,
      });
      continue;
    }

    const firstDueDate = r.first_due_date || r.due_date || r.hp_date || null;
    const totalInstallments = Number(r.total_installments ?? r.due_month ?? r.dueMonth) || 0;
    const installmentAmount = Number(r.installment_amount ?? r.due_amount ?? r.dueAmount) || 0;

    const pendingMapped = mapPendingCollectionRow(
      {
        customer_id: cid,
        hplno: r.hplno,
        customer_name: r.cname ?? r.customer_name,
        loan_status: status,
        total_installments: totalInstallments,
        installment_amount: installmentAmount,
        due_amount: installmentAmount,
        due_month: totalInstallments,
        total_paid: r.total_paid ?? r.totalPaid ?? 0,
        first_due_date: firstDueDate,
        hp_date: r.hp_date ?? r.hpDate,
        hp_amount: r.hp_amount ?? r.hpAmount,
        net_payable: r.net_payable ?? r.netPayable,
        penalty_amount: r.penalty_amount ?? r.penaltyAmount ?? 0,
      },
      todayDateIST
    );

    const monthlyPending = Number(pendingMapped.pending ?? pendingMapped.monthlyPending) || 0;
    const balance = Number(pendingMapped.balance ?? pendingMapped.balanceAmount) || 0;
    const overdueDays = Number(pendingMapped.dueDays ?? pendingMapped.overdueDays) || 0;
    const overdueMonths =
      installmentAmount > 0 ? Math.floor(monthlyPending / installmentAmount) : 0;

    byCustomerId.set(cid, {
      customerId: cid,
      monthlyPending,
      balance,
      overdueDays,
      overdueMonths,
    });
  }

  return {
    todayDues: portfolio.quickInsights.todaysDueCount,
    unpaidCustomers: portfolio.unpaidCustomers,
    pendingDues: portfolio.pendingDues,
    byCustomerId,
  };
}

/**
 * Pure helper to compute godownVehicles ('available' + 'seized') and totalVehicles.
 *
 * @param {Array<{ status: string, cnt?: number, count?: number }>} statusRows
 */
function computeVehicleCounts(statusRows = []) {
  let godownVehicles = 0;
  let totalVehicles = 0;
  for (const r of statusRows) {
    const cnt = Number(r.cnt ?? r.count ?? 1) || 0;
    const status = String(r.status || '').trim().toLowerCase();
    totalVehicles += cnt;
    if (status === 'available' || status === 'seized') {
      godownVehicles += cnt;
    }
  }
  return { godownVehicles, totalVehicles };
}

/**
 * Pure helper to compute Today Collection from payment rows (`amount + penalty + hand_loan`),
 * excluding cancelled payments and never double-counting `sub_due` amounts.
 *
 * @param {Array<object>} paymentRows
 * @param {string} [todayDateIST] Optional filter if rows span multiple dates
 */
function computeTodayCollection(paymentRows = [], todayDateIST = null) {
  let totalPaise = 0;
  for (const p of paymentRows) {
    if (!isValidPaymentStatus(p.payment_status ?? p.paymentStatus)) continue;
    if (todayDateIST && p.payment_date) {
      const pDate = String(p.payment_date).slice(0, 10);
      if (pDate !== todayDateIST) continue;
    }
    totalPaise +=
      toPaise(p.amount) +
      toPaise(p.penalty) +
      toPaise(p.hand_loan ?? p.handLoan);
  }
  return fromPaise(totalPaise);
}

/**
 * Pure helper to compute Cash in Hand:
 *   ledgerClosingBalance (opening Dr-Cr + non-cancelled voucher Dr-Cr on Cash/Bank ledgers)
 * + unlinked operational cash in (non-cancelled payments with no non-cancelled voucher linked)
 * - unlinked operational cash out (finance loans' hp_amount, office_expenses, vehicle_expenses with no linked voucher)
 *
 * Accepts either pre-aggregated numeric totals from SQL OR raw arrays of records
 * (with `hasLinkedVoucher` / `linkedVoucherStatus` flags for unit tests).
 *
 * @param {object} input
 */
function computeCashInHand(input = {}) {
  const ledgerOpeningPaise = toPaise(input.openingBalance ?? input.opening_balance ?? 0);
  const ledgerVoucherPaise = toPaise(input.voucherMovement ?? input.voucher_movement ?? 0);

  let unlinkedPaymentsInPaise = 0;
  if (Array.isArray(input.payments)) {
    for (const p of input.payments) {
      if (!isValidPaymentStatus(p.payment_status ?? p.paymentStatus)) continue;
      const hasActiveVoucher =
        Boolean(p.hasLinkedVoucher ?? p.has_linked_voucher) ||
        (Boolean(p.voucher_id ?? p.voucherId) &&
          String(p.voucher_status ?? p.voucherStatus ?? 'Posted').toLowerCase() !== 'cancelled');
      if (hasActiveVoucher) continue;
      unlinkedPaymentsInPaise +=
        toPaise(p.amount) +
        toPaise(p.penalty) +
        toPaise(p.hand_loan ?? p.handLoan);
    }
  } else {
    unlinkedPaymentsInPaise = toPaise(
      input.unlinkedPaymentsIn ?? input.unlinked_payments_in ?? 0
    );
  }

  let unlinkedLoansOutPaise = 0;
  if (Array.isArray(input.loans)) {
    for (const l of input.loans) {
      if (isConsultingDeal(l)) continue;
      const hasActiveVoucher =
        Boolean(l.hasLinkedVoucher ?? l.has_linked_voucher) ||
        (Boolean(l.voucher_id ?? l.voucherId) &&
          String(l.voucher_status ?? l.voucherStatus ?? 'Posted').toLowerCase() !== 'cancelled');
      if (hasActiveVoucher) continue;
      unlinkedLoansOutPaise += toPaise(l.hp_amount ?? l.hpAmount);
    }
  } else {
    unlinkedLoansOutPaise = toPaise(
      input.unlinkedLoansOut ?? input.unlinked_loans_out ?? 0
    );
  }

  let unlinkedOfficeExpOutPaise = 0;
  if (Array.isArray(input.officeExpenses)) {
    for (const oe of input.officeExpenses) {
      const txnType = String(oe.transaction_type ?? oe.transactionType ?? 'Expense')
        .trim()
        .toLowerCase();
      if (txnType !== 'expense') continue;
      const hasActiveVoucher = Boolean(oe.hasLinkedVoucher ?? oe.has_linked_voucher);
      if (hasActiveVoucher) continue;
      unlinkedOfficeExpOutPaise += toPaise(oe.amount);
    }
  } else {
    unlinkedOfficeExpOutPaise = toPaise(
      input.unlinkedOfficeExpOut ?? input.unlinked_office_exp_out ?? 0
    );
  }

  let unlinkedVehicleExpOutPaise = 0;
  if (Array.isArray(input.vehicleExpenses)) {
    for (const ve of input.vehicleExpenses) {
      const hasActiveVoucher =
        Boolean(ve.hasLinkedVoucher ?? ve.has_linked_voucher) ||
        (Boolean(ve.voucher_id ?? ve.voucherId) &&
          String(ve.voucher_status ?? ve.voucherStatus ?? 'Posted').toLowerCase() !== 'cancelled');
      if (hasActiveVoucher) continue;
      unlinkedVehicleExpOutPaise += toPaise(ve.amount);
    }
  } else {
    unlinkedVehicleExpOutPaise = toPaise(
      input.unlinkedVehicleExpOut ?? input.unlinked_vehicle_exp_out ?? 0
    );
  }

  const totalPaise =
    ledgerOpeningPaise +
    ledgerVoucherPaise +
    unlinkedPaymentsInPaise -
    unlinkedLoansOutPaise -
    unlinkedOfficeExpOutPaise -
    unlinkedVehicleExpOutPaise;

  return fromPaise(totalPaise);
}

/**
 * Pure helper to compute 12-month `collectionTrend` (`{ month, monthKey, principal, interest, penalty }`)
 * using `computeLoanRatio` + `splitPrincipalInterest` in integer paise.
 *
 * @param {Array<string>} monthSpineKeys 12 'YYYY-MM' keys
 * @param {Array<object>} paymentGroups
 * @param {Map<string, { principalRatio: number, interestRatio: number }>|Object} [loansRatioById]
 */
function computeMonthlyIncomeTrend(
  monthSpineKeys = [],
  paymentGroups = [],
  loansRatioById = new Map()
) {
  const ratioLookup = (loanId, groupRow) => {
    if (loanId !== null && loanId !== undefined) {
      const key = String(loanId);
      if (loansRatioById instanceof Map && loansRatioById.has(key)) {
        return loansRatioById.get(key);
      }
      if (
        loansRatioById &&
        typeof loansRatioById === 'object' &&
        !(loansRatioById instanceof Map) &&
        loansRatioById[key]
      ) {
        return loansRatioById[key];
      }
    }
    if (
      groupRow &&
      (groupRow.hp_amount !== undefined ||
        groupRow.hpAmount !== undefined ||
        groupRow.principle_part !== undefined ||
        groupRow.due_amount !== undefined)
    ) {
      return computeLoanRatio(groupRow);
    }
    return { principalRatio: 1, interestRatio: 0 };
  };

  const buckets = new Map();
  for (const mk of monthSpineKeys) {
    const shortMonth = getShortMonthName(mk);
    buckets.set(mk, {
      month: shortMonth,
      monthKey: mk,
      principalPaise: 0,
      interestPaise: 0,
      penaltyPaise: 0,
    });
  }

  for (const pg of paymentGroups) {
    if (!isValidPaymentStatus(pg.payment_status ?? pg.paymentStatus)) continue;
    const mk =
      pg.monthKey ||
      pg.month_key ||
      (pg.payment_date ? String(pg.payment_date).slice(0, 7) : null);
    if (!mk || !buckets.has(mk)) continue;

    const amountPaise =
      pg.amountPaise !== undefined
        ? Math.round(Number(pg.amountPaise) || 0)
        : pg.amount_paise !== undefined
          ? Math.round(Number(pg.amount_paise) || 0)
          : toPaise(pg.amount);
    const penaltyPaise =
      pg.penaltyPaise !== undefined
        ? Math.round(Number(pg.penaltyPaise) || 0)
        : pg.penalty_paise !== undefined
          ? Math.round(Number(pg.penalty_paise) || 0)
          : toPaise(pg.penalty);

    const loanId = pg.loanId ?? pg.loan_id ?? null;
    const ratio = ratioLookup(loanId, pg);
    const { principalPaise, interestPaise } = splitPrincipalInterest(amountPaise, ratio);

    const bucket = buckets.get(mk);
    bucket.principalPaise += principalPaise;
    bucket.interestPaise += interestPaise;
    bucket.penaltyPaise += penaltyPaise;
  }

  return monthSpineKeys.map((mk) => {
    const b = buckets.get(mk);
    return {
      month: b.month,
      monthKey: b.monthKey,
      principal: fromPaise(b.principalPaise),
      interest: fromPaise(b.interestPaise),
      penalty: fromPaise(b.penaltyPaise),
    };
  });
}

/**
 * Pure helper to compute 12-month `outcomeTrend` (`{ month, monthKey, loanDist, otherExp }`).
 * Aggregates each source (`loanRows`, `officeExpenseRows`, `vehicleExpenseRows`, `voucherExpenseRows`)
 * independently by month key so multiple loans and multiple expenses in the same month never fan out.
 * Excludes consulting deals from `loanDist`.
 *
 * @param {Array<string>} monthSpineKeys 12 'YYYY-MM' keys
 * @param {object} sources
 */
function computeMonthlyOutcomeTrend(
  monthSpineKeys = [],
  {
    loanRows = [],
    officeExpenseRows = [],
    vehicleExpenseRows = [],
    voucherExpenseRows = [],
  } = {}
) {
  const buckets = new Map();
  for (const mk of monthSpineKeys) {
    const shortMonth = getShortMonthName(mk);
    buckets.set(mk, {
      month: shortMonth,
      monthKey: mk,
      loanDistPaise: 0,
      otherExpPaise: 0,
    });
  }

  for (const l of loanRows) {
    if (isConsultingDeal(l)) continue;
    const mk =
      l.monthKey ||
      l.month_key ||
      (l.hp_date ? String(l.hp_date).slice(0, 7) : null);
    if (!mk || !buckets.has(mk)) continue;
    const paise =
      l.amountPaise !== undefined
        ? Math.round(Number(l.amountPaise) || 0)
        : l.amount_paise !== undefined
          ? Math.round(Number(l.amount_paise) || 0)
          : toPaise(l.hp_amount ?? l.hpAmount ?? l.amount);
    buckets.get(mk).loanDistPaise += paise;
  }

  for (const oe of officeExpenseRows) {
    const txnType = String(oe.transaction_type ?? oe.transactionType ?? 'Expense')
      .trim()
      .toLowerCase();
    if (txnType !== 'expense') continue;
    const mk =
      oe.monthKey ||
      oe.month_key ||
      (oe.expense_date ? String(oe.expense_date).slice(0, 7) : null);
    if (!mk || !buckets.has(mk)) continue;
    const paise =
      oe.amountPaise !== undefined
        ? Math.round(Number(oe.amountPaise) || 0)
        : oe.amount_paise !== undefined
          ? Math.round(Number(oe.amount_paise) || 0)
          : toPaise(oe.amount);
    buckets.get(mk).otherExpPaise += paise;
  }

  for (const ve of vehicleExpenseRows) {
    const mk =
      ve.monthKey ||
      ve.month_key ||
      (ve.expense_date ? String(ve.expense_date).slice(0, 7) : null);
    if (!mk || !buckets.has(mk)) continue;
    const paise =
      ve.amountPaise !== undefined
        ? Math.round(Number(ve.amountPaise) || 0)
        : ve.amount_paise !== undefined
          ? Math.round(Number(ve.amount_paise) || 0)
          : toPaise(ve.amount);
    buckets.get(mk).otherExpPaise += paise;
  }

  for (const v of voucherExpenseRows) {
    if (v.status && String(v.status).toLowerCase() === 'cancelled') continue;
    if (v.vehicle_expense_id !== undefined && v.vehicle_expense_id !== null) continue;
    if (v.vehicleExpenseId !== undefined && v.vehicleExpenseId !== null) continue;
    if (v.nature && String(v.nature).toLowerCase() !== 'expenses') continue;
    const mk =
      v.monthKey ||
      v.month_key ||
      (v.voucher_date ? String(v.voucher_date).slice(0, 7) : null);
    if (!mk || !buckets.has(mk)) continue;
    const paise =
      v.amountPaise !== undefined
        ? Math.round(Number(v.amountPaise) || 0)
        : v.amount_paise !== undefined
          ? Math.round(Number(v.amount_paise) || 0)
          : toPaise(v.amount);
    buckets.get(mk).otherExpPaise += paise;
  }

  return monthSpineKeys.map((mk) => {
    const b = buckets.get(mk);
    return {
      month: b.month,
      monthKey: b.monthKey,
      loanDist: fromPaise(b.loanDistPaise),
      otherExp: fromPaise(b.otherExpPaise),
    };
  });
}

// ─── Read-Only Parameterized SQL Queries ($1::uuid = finance_id) ──────────────

const PORTFOLIO_RISK_SQL = `
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
    COALESCE(sz.has_seizure, false) AS has_seizure
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
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
      FROM seizing_vehicle sv
      WHERE sv.customer_id = c.id
        AND sv.finance_id = $1::uuid
        AND COALESCE(sv.status::text, 'Pending') <> 'Cancelled'
    ) AS has_seizure
  ) sz ON true
  WHERE c.finance_id = $1::uuid
  ORDER BY c.hplno ASC NULLS LAST, c.id ASC
`;

const VEHICLES_STATUS_SQL = `
  SELECT
    vd.status::text AS status,
    COUNT(*)::int AS cnt
  FROM vehicle_detail vd
  WHERE vd.finance_id = $1::uuid
  GROUP BY vd.status
`;

const TODAY_COLLECTION_SQL = `
  SELECT
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

const CASH_IN_HAND_SQL = `
  ${CASH_BANK_CTE}
  SELECT
    (
      SELECT COALESCE(SUM(CASE WHEN l.ob_type = 'Dr' THEN l.opening_balance ELSE -l.opening_balance END), 0)
      FROM cb_ledgers l
    ) AS opening_balance,
    (
      SELECT COALESCE(SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE -ve.amount END), 0)
      FROM acc_voucher_entries ve
      JOIN acc_vouchers v ON v.id = ve.voucher_id
      WHERE v.finance_id = $1::uuid
        AND v.status <> 'Cancelled'
        AND ve.ledger_id IN (SELECT id FROM cb_ledgers)
    ) AS voucher_movement,
    (
      SELECT COALESCE(SUM(COALESCE(p.amount, 0) + COALESCE(p.penalty, 0) + COALESCE(p.hand_loan, 0)), 0)
      FROM payments p
      WHERE p.finance_id = $1::uuid
        AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1
          FROM acc_vouchers v
          WHERE v.finance_id = $1::uuid
            AND v.payment_id = p.id
            AND v.status <> 'Cancelled'
        )
    ) AS unlinked_payments_in,
    (
      SELECT COALESCE(SUM(COALESCE(l.hp_amount, 0)), 0)
      FROM loans l
      LEFT JOIN customers c ON c.id = l.customer_id AND c.finance_id = l.finance_id
      LEFT JOIN vehicle_detail vd ON vd.id = COALESCE(l.vehicle_id, c.vehicle_id) AND vd.finance_id = l.finance_id
      WHERE l.finance_id = $1::uuid
        AND LOWER(COALESCE(l.loan_type, 'finance')) <> 'consulting'
        AND COALESCE(LOWER(vd.deal_type::text), 'finance') <> 'consulting'
        AND NOT EXISTS (
          SELECT 1
          FROM acc_vouchers v
          WHERE v.finance_id = $1::uuid
            AND v.loan_id = l.id
            AND v.status <> 'Cancelled'
        )
    ) AS unlinked_loans_out,
    (
      SELECT COALESCE(SUM(COALESCE(oe.amount, 0)), 0)
      FROM office_expenses oe
      WHERE oe.finance_id = $1::uuid
        AND COALESCE(oe.transaction_type::text, 'Expense') = 'Expense'
    ) AS unlinked_office_exp_out,
    (
      SELECT COALESCE(SUM(COALESCE(ve.amount, 0)), 0)
      FROM vehicle_expenses ve
      WHERE ve.finance_id = $1::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM acc_vouchers v
          WHERE v.finance_id = $1::uuid
            AND v.vehicle_expense_id = ve.id
            AND v.status <> 'Cancelled'
        )
    ) AS unlinked_vehicle_exp_out
`;

const MONTHLY_INCOME_GROUPS_SQL = `
  SELECT
    matched_loan.loan_id,
    p.customer_id,
    TO_CHAR(p.payment_date, 'YYYY-MM') AS month_key,
    COALESCE(ROUND(SUM(COALESCE(p.amount, 0)) * 100), 0)::bigint AS amount_paise,
    COALESCE(ROUND(SUM(COALESCE(p.penalty, 0)) * 100), 0)::bigint AS penalty_paise
  FROM payments p
  LEFT JOIN LATERAL (
    SELECT l.id AS loan_id
    FROM loans l
    WHERE l.finance_id = $1::uuid
      AND l.customer_id = p.customer_id
    ORDER BY
      CASE
        WHEN p.due_date IS NOT NULL
         AND COALESCE(l.due_date, l.hp_date) IS NOT NULL
         AND date_trunc('month', p.due_date)::date >= date_trunc('month', COALESCE(l.due_date, l.hp_date))::date
         AND date_trunc('month', p.due_date)::date <= (
           date_trunc('month', COALESCE(l.due_date, l.hp_date))
           + ((GREATEST(COALESCE(l.due_month, 1), 1) - 1) || ' months')::interval
         )::date
        THEN 0
        ELSE 1
      END ASC,
      CASE
        WHEN p.due_date IS NOT NULL AND l.due_date IS NOT NULL
         AND EXTRACT(DAY FROM p.due_date) = EXTRACT(DAY FROM l.due_date)
        THEN 0
        ELSE 1
      END ASC,
      CASE
        WHEN COALESCE(l.hp_date, l.due_date) <= COALESCE(p.due_date, p.payment_date)
        THEN 0
        ELSE 1
      END ASC,
      ABS(COALESCE(p.due_date, p.payment_date) - COALESCE(l.due_date, l.hp_date, COALESCE(p.due_date, p.payment_date))) ASC,
      l.hp_date ASC NULLS LAST,
      l.id ASC
    LIMIT 1
  ) matched_loan ON TRUE
  WHERE p.finance_id = $1::uuid
    AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
    AND p.payment_date IS NOT NULL
    AND p.payment_date >= $2::date
    AND p.payment_date <= $3::date
  GROUP BY matched_loan.loan_id, p.customer_id, TO_CHAR(p.payment_date, 'YYYY-MM')
  ORDER BY month_key ASC
`;

const LOAN_RATIOS_BY_IDS_SQL = `
  SELECT
    l.id,
    l.hp_amount,
    l.due_month,
    l.interest_rate,
    l.principle_part,
    l.interest_part,
    l.due_amount
  FROM loans l
  WHERE l.finance_id = $1::uuid
    AND l.id = ANY($2::uuid[])
`;

/**
 * Separate CTEs per source grouped by month_key to prevent Cartesian fan-out
 * when a month has multiple loans and multiple expenses.
 */
const MONTHLY_OUTCOME_CTES_SQL = `
  WITH spine AS (
    SELECT UNNEST($4::text[]) AS month_key
  ),
  loan_dist_by_month AS (
    SELECT
      TO_CHAR(l.hp_date, 'YYYY-MM') AS month_key,
      COALESCE(ROUND(SUM(COALESCE(l.hp_amount, 0)) * 100), 0)::bigint AS loan_dist_paise
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id AND c.finance_id = l.finance_id
    LEFT JOIN vehicle_detail vd ON vd.id = COALESCE(l.vehicle_id, c.vehicle_id) AND vd.finance_id = l.finance_id
    WHERE l.finance_id = $1::uuid
      AND l.hp_date IS NOT NULL
      AND l.hp_date >= $2::date
      AND l.hp_date <= $3::date
      AND LOWER(COALESCE(l.loan_type, 'finance')) <> 'consulting'
      AND COALESCE(LOWER(vd.deal_type::text), 'finance') <> 'consulting'
    GROUP BY TO_CHAR(l.hp_date, 'YYYY-MM')
  ),
  office_exp_by_month AS (
    SELECT
      TO_CHAR(oe.expense_date, 'YYYY-MM') AS month_key,
      COALESCE(ROUND(SUM(COALESCE(oe.amount, 0)) * 100), 0)::bigint AS office_exp_paise
    FROM office_expenses oe
    WHERE oe.finance_id = $1::uuid
      AND oe.expense_date IS NOT NULL
      AND oe.expense_date >= $2::date
      AND oe.expense_date <= $3::date
      AND COALESCE(oe.transaction_type::text, 'Expense') = 'Expense'
    GROUP BY TO_CHAR(oe.expense_date, 'YYYY-MM')
  ),
  vehicle_exp_by_month AS (
    SELECT
      TO_CHAR(ve.expense_date, 'YYYY-MM') AS month_key,
      COALESCE(ROUND(SUM(COALESCE(ve.amount, 0)) * 100), 0)::bigint AS vehicle_exp_paise
    FROM vehicle_expenses ve
    WHERE ve.finance_id = $1::uuid
      AND ve.expense_date IS NOT NULL
      AND ve.expense_date >= $2::date
      AND ve.expense_date <= $3::date
    GROUP BY TO_CHAR(ve.expense_date, 'YYYY-MM')
  ),
  voucher_exp_by_month AS (
    SELECT
      TO_CHAR(v.voucher_date, 'YYYY-MM') AS month_key,
      COALESCE(
        ROUND(
          SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE -ve.amount END) * 100
        ),
        0
      )::bigint AS voucher_exp_paise
    FROM acc_voucher_entries ve
    JOIN acc_vouchers v ON v.id = ve.voucher_id
    JOIN acc_ledgers al ON al.id = ve.ledger_id
    LEFT JOIN acc_ledger_groups alg ON alg.id = al.group_id
    LEFT JOIN acc_group_master agm ON agm.id = COALESCE(al.master_group_id, alg.root_master_id, alg.system_parent_id)
    WHERE v.finance_id = $1::uuid
      AND v.status <> 'Cancelled'
      AND v.vehicle_expense_id IS NULL
      AND v.voucher_date >= $2::date
      AND v.voucher_date <= $3::date
      AND COALESCE(alg.nature::text, agm.nature::text) = 'Expenses'
    GROUP BY TO_CHAR(v.voucher_date, 'YYYY-MM')
  )
  SELECT
    s.month_key,
    COALESCE(ld.loan_dist_paise, 0)::bigint AS loan_dist_paise,
    (
      COALESCE(oe.office_exp_paise, 0) +
      COALESCE(ve.vehicle_exp_paise, 0) +
      GREATEST(0, COALESCE(vxe.voucher_exp_paise, 0))
    )::bigint AS other_exp_paise
  FROM spine s
  LEFT JOIN loan_dist_by_month ld ON ld.month_key = s.month_key
  LEFT JOIN office_exp_by_month oe ON oe.month_key = s.month_key
  LEFT JOIN vehicle_exp_by_month ve ON ve.month_key = s.month_key
  LEFT JOIN voucher_exp_by_month vxe ON vxe.month_key = s.month_key
  ORDER BY s.month_key ASC
`;

/**
 * Fetches and computes the complete Home Dashboard overview for a finance.
 *
 * @param {string} financeId Authenticated finance UUID
 * @param {object} [options]
 * @param {string} [options.todayDateIST] Override 'YYYY-MM-DD' for deterministic tests
 * @param {object} [options.queryRunner] Optional DB runner with `.query(sql, params)` for testing
 */
async function getHomeDashboardOverview(financeId, options = {}) {
  const todayDateIST = options.todayDateIST || getCurrentDateIST();
  const runner = options.queryRunner || require('../../config/database.config').db;
  const currentMonthKey = todayDateIST.slice(0, 7);

  const spine = buildMonthSpine({
    from: null,
    to: null,
    earliestMonthKey: currentMonthKey,
    currentMonthKey,
  });
  const monthSpineKeys = spine.default12;
  const windowStartDate = getMonthStartEnd(monthSpineKeys[0]).startDate;
  const windowEndDate = getMonthStartEnd(monthSpineKeys[monthSpineKeys.length - 1]).endDate;

  const [
    portfolioRes,
    vehiclesRes,
    todayCollRes,
    cashRes,
    incomeGroupsRes,
    outcomeRes,
  ] = await Promise.all([
    runner.query(PORTFOLIO_RISK_SQL, [financeId]),
    runner.query(VEHICLES_STATUS_SQL, [financeId]),
    runner.query(TODAY_COLLECTION_SQL, [financeId, todayDateIST]),
    runner.query(CASH_IN_HAND_SQL, [financeId]),
    runner.query(MONTHLY_INCOME_GROUPS_SQL, [financeId, windowStartDate, windowEndDate]),
    runner.query(MONTHLY_OUTCOME_CTES_SQL, [
      financeId,
      windowStartDate,
      windowEndDate,
      monthSpineKeys,
    ]),
  ]);

  // Fetch loan ratios for all loans referenced in monthly income payment groups
  const referencedLoanIds = Array.from(
    new Set((incomeGroupsRes.rows || []).map((r) => r.loan_id).filter(Boolean))
  );
  const loansRatioById = new Map();
  if (referencedLoanIds.length > 0) {
    const { rows: ratioRows } = await runner.query(LOAN_RATIOS_BY_IDS_SQL, [
      financeId,
      referencedLoanIds,
    ]);
    for (const lr of ratioRows) {
      loansRatioById.set(String(lr.id), computeLoanRatio(lr));
    }
  }

  const portfolio = computePortfolioAndInsights(portfolioRes.rows || [], todayDateIST);
  const vehicles = computeVehicleCounts(vehiclesRes.rows || []);

  const todayCollRow = (todayCollRes.rows && todayCollRes.rows[0]) || {};
  const todayCollection = round2(Number(todayCollRow.today_collection) || 0);
  const yesterdayCollection = round2(Number(todayCollRow.yesterday_collection) || 0);
  const todayCollectionTrend = computeKpiTrendBadge(todayCollection, yesterdayCollection);

  const cashRow = (cashRes.rows && cashRes.rows[0]) || {};
  const cashInHand = computeCashInHand({
    openingBalance: cashRow.opening_balance,
    voucherMovement: cashRow.voucher_movement,
    unlinkedPaymentsIn: cashRow.unlinked_payments_in,
    unlinkedLoansOut: cashRow.unlinked_loans_out,
    unlinkedOfficeExpOut: cashRow.unlinked_office_exp_out,
    unlinkedVehicleExpOut: cashRow.unlinked_vehicle_exp_out,
  });

  const collectionTrend = computeMonthlyIncomeTrend(
    monthSpineKeys,
    incomeGroupsRes.rows || [],
    loansRatioById
  );

  const outcomeRowsMap = new Map();
  for (const r of outcomeRes.rows || []) {
    outcomeRowsMap.set(r.month_key, r);
  }
  const outcomeTrend = monthSpineKeys.map((mk) => {
    const shortMonth = getShortMonthName(mk);
    const row = outcomeRowsMap.get(mk);
    return {
      month: shortMonth,
      monthKey: mk,
      loanDist: fromPaise(Number(row?.loan_dist_paise) || 0),
      otherExp: fromPaise(Number(row?.other_exp_paise) || 0),
    };
  });

  return {
    asOfDate: todayDateIST,
    kpis: {
      activeLoans: portfolio.activeLoans,
      totalCustomers: portfolio.totalCustomers,
      unpaidCustomers: portfolio.unpaidCustomers,
      godownVehicles: vehicles.godownVehicles,
      totalVehicles: vehicles.totalVehicles,
      seizedVehicles: portfolio.seizedVehicles,
      cashInHand,
      todayCollection,
      pendingDues: portfolio.pendingDues,
      trends: {
        activeLoans: null,
        totalCustomers: portfolio.trends.totalCustomers,
        unpaidCustomers: null,
        godownVehicles: null,
        seizedVehicles: null,
        cashInHand: null,
        todayCollection: todayCollectionTrend,
        pendingDues: null,
      },
    },
    loanDistribution: portfolio.loanDistribution,
    monthly: {
      collectionTrend,
      outcomeTrend,
    },
    quickInsights: portfolio.quickInsights,
  };
}

module.exports = {
  getHomeDashboardOverview,
  // Pure functions exported for unit testing
  isConsultingDeal,
  computeKpiTrendBadge,
  computePortfolioAndInsights,
  computeCustomerPendingSnapshot,
  computeVehicleCounts,
  computeTodayCollection,
  computeCashInHand,
  computeMonthlyIncomeTrend,
  computeMonthlyOutcomeTrend,
  // SQL constants exported for inspection/testing
  PORTFOLIO_RISK_SQL,
  VEHICLES_STATUS_SQL,
  TODAY_COLLECTION_SQL,
  CASH_IN_HAND_SQL,
  MONTHLY_INCOME_GROUPS_SQL,
  MONTHLY_OUTCOME_CTES_SQL,
};

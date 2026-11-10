/**
 * demand.calculator.js
 * Pure calculation engine for the Accounts -> Demand Statement report.
 * Zero database dependencies.
 *
 * Guarantees on every installment, month row, and grand summary:
 *   1. Penalty is strictly excluded from Demand, Received, and Balance.
 *   2. total = round2(principal + interest) for Demand, Received, and Balance.
 *   3. balance = round2(demand - received) for Principal, Interest, and Total.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CLOSED_LOAN_STATUSES = new Set([
  'close',
  'closed',
  'settled',
  'foreclosed',
  'completed',
]);

/**
 * Round a numeric value to 2 decimal places using integer paise arithmetic.
 * Never returns -0 or NaN.
 *
 * @param {number|string|null|undefined} val
 * @returns {number}
 */
function round2(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round((n + Math.sign(n) * 1e-12) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Convert a 2-decimal number to integer paise.
 * @param {number|string|null|undefined} val
 * @returns {number}
 */
function toPaise(val) {
  return Math.round(round2(val) * 100);
}

/**
 * Convert integer paise back to 2-decimal rupees.
 * @param {number} paise
 * @returns {number}
 */
function fromPaise(paise) {
  const v = Math.round(paise) / 100;
  return v === 0 ? 0 : v;
}

/**
 * Check whether a loan status represents a closed/settled/foreclosed loan.
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
function isClosedLoanStatus(status) {
  if (!status || typeof status !== 'string') return false;
  return CLOSED_LOAN_STATUSES.has(status.trim().toLowerCase());
}

/**
 * Parse a date input (YYYY-MM-DD string or Date object) into UTC { year, month, day }
 * without local timezone drift.
 *
 * @param {string|Date|null|undefined} input
 * @returns {{ year: number, month: number, day: number, ymd: string } | null}
 */
function parseYmdParts(input) {
  if (!input) return null;
  let ymdStr = '';
  if (typeof input === 'string') {
    ymdStr = input.trim().split('T')[0];
  } else if (input instanceof Date && !isNaN(input.getTime())) {
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, '0');
    const d = String(input.getUTCDate()).padStart(2, '0');
    ymdStr = `${y}-${m}-${d}`;
  } else {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymdStr)) return null;
  const [year, month, day] = ymdStr.split('-').map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const maxDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > maxDays) return null;

  return { year, month, day, ymd: ymdStr };
}

/**
 * Format { year, month } into 'YYYY-MM' and 'Month YYYY'.
 * @param {number} year
 * @param {number} month 1..12
 */
function formatMonthMeta(year, month) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  return { monthKey, monthLabel };
}

/**
 * Compute per-installment contractual Demand (Principal, Interest, Total) for a loan.
 * Matches existing AutoFinex logic in Step2ConsultingLoan.tsx, calculations.ts,
 * payment.routes.js, and reports.service.js:
 *   - D_P: principle_part if > 0;
 *          else if due_amount > 0 and interest_part > 0, max(0, due_amount - interest_part);
 *          else round2(hp_amount / max(due_month, 1)).
 *   - D_I: interest_part if > 0;
 *          else if due_amount > 0, max(0, due_amount - D_P);
 *          else round2(hp_amount * interest_rate / 100).
 *   - D_Total = round2(D_P + D_I).
 *
 * @param {object} loan
 * @returns {{ demandPrincipal: number, demandInterest: number, demandTotal: number }}
 */
function computeInstallmentDemand(loan = {}) {
  const principlePart = Number(loan.principle_part ?? loan.principlePart) || 0;
  const interestPart = Number(loan.interest_part ?? loan.interestPart) || 0;
  const dueAmount = Number(loan.due_amount ?? loan.dueAmount) || 0;
  const hpAmount = Math.max(0, Number(loan.hp_amount ?? loan.hpAmount) || 0);
  const rawDueMonth = parseInt(loan.due_month ?? loan.dueMonth ?? loan.total_installments, 10);
  const dueMonth = Math.max(1, Number.isFinite(rawDueMonth) && rawDueMonth > 0 ? rawDueMonth : 1);
  const interestRate = Math.max(0, Number(loan.interest_rate ?? loan.interestRate) || 0);

  let demandPrincipal = 0;
  if (principlePart > 0) {
    demandPrincipal = round2(principlePart);
  } else if (dueAmount > 0 && interestPart > 0) {
    demandPrincipal = round2(Math.max(0, dueAmount - interestPart));
  } else {
    demandPrincipal = round2(hpAmount / dueMonth);
  }

  let demandInterest = 0;
  if (interestPart > 0) {
    demandInterest = round2(interestPart);
  } else if (dueAmount > 0) {
    demandInterest = round2(Math.max(0, dueAmount - demandPrincipal));
  } else {
    demandInterest = round2((hpAmount * interestRate) / 100);
  }

  const demandTotal = round2(demandPrincipal + demandInterest);

  return {
    demandPrincipal,
    demandInterest,
    demandTotal,
  };
}

/**
 * Build the full chronological installment schedule for a loan.
 * Mirrors the month-end clamping behavior of calculateInstallmentDueDates in pendingCollectionsHelper.js:
 *   e.g. Jan 31 -> Feb 28 (or 29 in leap year) -> Mar 31 -> Apr 30.
 *
 * @param {object} loan
 * @returns {Array<object>}
 */
function buildSchedule(loan = {}) {
  const totalMonths = parseInt(
    loan.due_month ?? loan.dueMonth ?? loan.total_installments ?? loan.totalInstallments,
    10
  );
  if (!Number.isFinite(totalMonths) || totalMonths <= 0) {
    return [];
  }

  const firstDueRaw =
    loan.due_date ||
    loan.dueDate ||
    loan.first_due_date ||
    loan.firstDueDate ||
    loan.hp_date ||
    loan.hpDate;

  const startParts = parseYmdParts(firstDueRaw);
  if (!startParts) {
    return [];
  }

  const { demandPrincipal, demandInterest, demandTotal } = computeInstallmentDemand(loan);
  const { year: startYear, month: startMonth, day: startDay } = startParts;

  const loanId = loan.id ?? loan.loan_id ?? loan.loanId ?? '';
  const customerId = loan.customer_id ?? loan.customerId ?? '';
  const loanNo = loan.loan_no ?? loan.loanNo ?? (loan.hplno != null ? `HPL ${loan.hplno}` : '');
  const customerName = loan.customer_name ?? loan.customerName ?? loan.cname ?? '';
  const loanStatus = loan.loan_status ?? loan.loanStatus ?? 'active';

  const schedule = [];

  for (let i = 0; i < totalMonths; i++) {
    let year = startYear;
    let month = startMonth + i;
    while (month > 12) {
      year += 1;
      month -= 12;
    }

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(startDay, daysInMonth);
    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const { monthKey, monthLabel } = formatMonthMeta(year, month);

    schedule.push({
      loanId: String(loanId),
      customerId: String(customerId),
      loanNo: String(loanNo),
      customerName: String(customerName),
      loanStatus: String(loanStatus),
      installmentNo: i + 1,
      totalInstallments: totalMonths,
      dueDate,
      monthKey,
      month: monthLabel,
      demandPrincipal,
      demandInterest,
      demandTotal,
    });
  }

  return schedule;
}

/**
 * Allocate valid payments across a loan's schedule in two passes:
 *   Pass 1: A payment with a valid due_date is allocated to the installment(s)
 *           matching that due_date's monthKey (YYYY-MM), up to each installment's remaining room.
 *   Pass 2: Leftover payment amounts (and payments without a matching due_date month)
 *           are allocated FIFO to the earliest installments with remaining room.
 *
 * Strictly excludes payment.penalty. Ignores cancelled payments.
 * Never allocates more than demandTotal to any installment.
 *
 * @param {Array<object>} installments Schedule rows from buildSchedule(loan)
 * @param {Array<object>} payments Payment rows for this loan
 * @returns {{ installments: Array<object>, unallocated: number, unallocatedCount: number }}
 */
function allocatePayments(installments = [], payments = []) {
  const working = installments.map((inst) => ({
    ...inst,
    _capacityPaise: toPaise(inst.demandTotal),
    _allocatedPaise: 0,
  }));

  // O(1) lookup map by monthKey (YYYY-MM)
  const monthMap = new Map();
  for (const inst of working) {
    const key = inst.monthKey || (inst.dueDate ? String(inst.dueDate).slice(0, 7) : '');
    if (!monthMap.has(key)) {
      monthMap.set(key, []);
    }
    monthMap.get(key).push(inst);
  }

  // Filter valid payments and extract purely payment.amount (penalty strictly excluded)
  const validPayments = [];
  for (const p of payments) {
    if (!p) continue;
    const payStatus = String(p.payment_status ?? p.paymentStatus ?? 'active').toLowerCase();
    if (payStatus === 'cancelled') continue;

    // Effective amount is p.amount + any active sub_due paid_amount if provided separately
    const baseAmount = Math.max(0, Number(p.amount) || 0);
    const subDueAmount = Math.max(0, Number(p.sub_due_amount ?? p.subDueAmount) || 0);
    const amountPaise = toPaise(baseAmount) + toPaise(subDueAmount);
    if (amountPaise <= 0) continue;

    const dueParts = parseYmdParts(p.due_date ?? p.dueDate);
    const dueMonthKey = dueParts
      ? `${dueParts.year}-${String(dueParts.month).padStart(2, '0')}`
      : null;

    validPayments.push({
      amountPaise,
      dueMonthKey,
    });
  }

  const pass2Queue = [];

  // Pass 1: Allocate to matching due_date monthKey
  for (const pay of validPayments) {
    let remainingPaise = pay.amountPaise;

    if (pay.dueMonthKey && monthMap.has(pay.dueMonthKey)) {
      const candidates = monthMap.get(pay.dueMonthKey);
      for (const inst of candidates) {
        if (remainingPaise <= 0) break;
        const roomPaise = inst._capacityPaise - inst._allocatedPaise;
        if (roomPaise > 0) {
          const takePaise = Math.min(remainingPaise, roomPaise);
          inst._allocatedPaise += takePaise;
          remainingPaise -= takePaise;
        }
      }
    }

    if (remainingPaise > 0) {
      pass2Queue.push(remainingPaise);
    }
  }

  // Pass 2: FIFO chronological allocation using a single advancing pointer (O(n + m))
  let fifoIdx = 0;
  let unallocatedPaise = 0;
  let unallocatedCount = 0;

  for (let remainingPaise of pass2Queue) {
    while (remainingPaise > 0 && fifoIdx < working.length) {
      const inst = working[fifoIdx];
      const roomPaise = inst._capacityPaise - inst._allocatedPaise;
      if (roomPaise <= 0) {
        fifoIdx++;
        continue;
      }
      const takePaise = Math.min(remainingPaise, roomPaise);
      inst._allocatedPaise += takePaise;
      remainingPaise -= takePaise;
      if (inst._allocatedPaise >= inst._capacityPaise) {
        fifoIdx++;
      }
    }

    if (remainingPaise > 0) {
      unallocatedPaise += remainingPaise;
      unallocatedCount += 1;
    }
  }

  const resultInstallments = working.map(({ _capacityPaise, _allocatedPaise, ...rest }) => ({
    ...rest,
    allocatedAmount: fromPaise(_allocatedPaise),
  }));

  return {
    installments: resultInstallments,
    unallocated: fromPaise(unallocatedPaise),
    unallocatedCount,
  };
}

/**
 * Split an installment's allocated payment into Received Principal and Interest,
 * and compute Balance Principal, Interest, and Total.
 *
 * Formula:
 *   R_I = min(D_I, round2(A * D_I / D_Total)) when D_Total > 0
 *   R_P = min(D_P, round2(A - R_I))
 *   R_Total = round2(R_P + R_I)
 *   B_P = round2(D_P - R_P)
 *   B_I = round2(D_I - R_I)
 *   B_Total = round2(D_Total - R_Total)
 *
 * Decision C (Closed/settled/foreclosed loans):
 *   If the loan is closed (`loanStatus` in ['close','closed','settled','foreclosed','completed']),
 *   any remaining uncollected balance on the installment was waived/settled at closure,
 *   so effective Demand equals Received and Balance is 0.
 *
 * @param {object} installment
 * @returns {object}
 */
function splitReceived(installment = {}) {
  let dP = round2(installment.demandPrincipal);
  let dI = round2(installment.demandInterest);
  let dTotal = round2(dP + dI);

  const rawA = Math.max(0, round2(installment.allocatedAmount ?? installment.receivedAmount ?? 0));
  const A = Math.min(dTotal, rawA);

  let rI = 0;
  let rP = 0;

  if (dTotal > 0 && A > 0) {
    if (toPaise(A) >= toPaise(dTotal)) {
      rI = dI;
      rP = dP;
    } else {
      rI = Math.min(dI, round2((A * dI) / dTotal));
      rP = Math.min(dP, round2(A - rI));
      // Guard: if clamping rP to dP left 1 paise unsplit, assign it to rI within dI
      const diffPaise = toPaise(A) - (toPaise(rP) + toPaise(rI));
      if (diffPaise > 0) {
        rI = Math.min(dI, fromPaise(toPaise(rI) + diffPaise));
      }
    }
  }

  const rTotal = fromPaise(toPaise(rP) + toPaise(rI));

  // Decision C: Closed / settled / foreclosed loans do not carry pending balance forever
  if (isClosedLoanStatus(installment.loanStatus)) {
    dP = rP;
    dI = rI;
    dTotal = rTotal;
  }

  const bP = fromPaise(toPaise(dP) - toPaise(rP));
  const bI = fromPaise(toPaise(dI) - toPaise(rI));
  const bTotal = fromPaise(toPaise(dTotal) - toPaise(rTotal));

  return {
    ...installment,
    demandPrincipal: dP,
    demandInterest: dI,
    demandTotal: dTotal,
    receivedPrincipal: rP,
    receivedInterest: rI,
    receivedTotal: rTotal,
    balancePrincipal: bP,
    balanceInterest: bI,
    balanceTotal: bTotal,
  };
}

/**
 * Aggregate split installment rows by monthKey ('YYYY-MM').
 *
 * @param {Array<object>} rows Split installment rows
 * @returns {Array<object>} Monthly aggregate rows sorted chronologically (monthKey ASC)
 */
function aggregateByMonth(rows = []) {
  const monthGroups = new Map();

  for (const r of rows) {
    if (!r) continue;
    const monthKey = r.monthKey || (r.dueDate ? String(r.dueDate).slice(0, 7) : '');
    if (!monthKey) continue;

    if (!monthGroups.has(monthKey)) {
      let monthLabel = r.month;
      if (!monthLabel && /^\d{4}-\d{2}$/.test(monthKey)) {
        const [y, m] = monthKey.split('-').map(Number);
        monthLabel = formatMonthMeta(y, m).monthLabel;
      }
      monthGroups.set(monthKey, {
        monthKey,
        month: monthLabel || monthKey,
        dPPaise: 0,
        dIPaise: 0,
        dTPaise: 0,
        rPPaise: 0,
        rIPaise: 0,
        rTPaise: 0,
        bPPaise: 0,
        bIPaise: 0,
        bTPaise: 0,
        loanIds: new Set(),
        installmentCount: 0,
      });
    }

    const g = monthGroups.get(monthKey);
    const dPP = toPaise(r.demandPrincipal);
    const dIP = toPaise(r.demandInterest);
    const dTP = dPP + dIP;
    const rPP = toPaise(r.receivedPrincipal);
    const rIP = toPaise(r.receivedInterest);
    const rTP = rPP + rIP;
    const bPP = dPP - rPP;
    const bIP = dIP - rIP;
    const bTP = dTP - rTP;

    g.dPPaise += dPP;
    g.dIPaise += dIP;
    g.dTPaise += dTP;
    g.rPPaise += rPP;
    g.rIPaise += rIP;
    g.rTPaise += rTP;
    g.bPPaise += bPP;
    g.bIPaise += bIP;
    g.bTPaise += bTP;
    g.installmentCount += 1;
    if (r.loanId) {
      g.loanIds.add(String(r.loanId));
    }
  }

  return Array.from(monthGroups.values())
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map((g) => ({
      monthKey: g.monthKey,
      month: g.month,
      demandPrincipal: fromPaise(g.dPPaise),
      demandInterest: fromPaise(g.dIPaise),
      demandTotal: fromPaise(g.dTPaise),
      receivedPrincipal: fromPaise(g.rPPaise),
      receivedInterest: fromPaise(g.rIPaise),
      receivedTotal: fromPaise(g.rTPaise),
      balancePrincipal: fromPaise(g.bPPaise),
      balanceInterest: fromPaise(g.bIPaise),
      balanceTotal: fromPaise(g.bTPaise),
      loanCount: g.loanIds.size > 0 ? g.loanIds.size : g.installmentCount,
    }));
}

/**
 * Produce grand totals across aggregated month rows.
 *
 * @param {Array<object>} months Output of aggregateByMonth(rows)
 * @param {number} [totalInstallmentsOverride] Optional explicit count of installments
 * @returns {object}
 */
function summarize(months = [], totalInstallmentsOverride) {
  let dPPaise = 0;
  let dIPaise = 0;
  let dTPaise = 0;
  let rPPaise = 0;
  let rIPaise = 0;
  let rTPaise = 0;
  let bPPaise = 0;
  let bIPaise = 0;
  let bTPaise = 0;
  let countedInstallments = 0;

  for (const m of months) {
    if (!m) continue;
    const dPP = toPaise(m.demandPrincipal);
    const dIP = toPaise(m.demandInterest);
    const dTP = dPP + dIP;
    const rPP = toPaise(m.receivedPrincipal);
    const rIP = toPaise(m.receivedInterest);
    const rTP = rPP + rIP;
    const bPP = dPP - rPP;
    const bIP = dIP - rIP;
    const bTP = dTP - rTP;

    dPPaise += dPP;
    dIPaise += dIP;
    dTPaise += dTP;
    rPPaise += rPP;
    rIPaise += rIP;
    rTPaise += rTP;
    bPPaise += bPP;
    bIPaise += bIP;
    bTPaise += bTP;
    countedInstallments += Number(m.installmentCount ?? m.loanCount ?? 0);
  }

  const demandPrincipal = fromPaise(dPPaise);
  const demandInterest = fromPaise(dIPaise);
  const demandTotal = fromPaise(dTPaise);
  const receivedPrincipal = fromPaise(rPPaise);
  const receivedInterest = fromPaise(rIPaise);
  const receivedTotal = fromPaise(rTPaise);
  const balancePrincipal = fromPaise(bPPaise);
  const balanceInterest = fromPaise(bIPaise);
  const balanceTotal = fromPaise(bTPaise);

  const totalInstallments =
    typeof totalInstallmentsOverride === 'number'
      ? totalInstallmentsOverride
      : countedInstallments;

  const collectionRate =
    dTPaise > 0 ? round2((rTPaise / dTPaise) * 100) : 0;

  return {
    demandPrincipal,
    demandInterest,
    demandTotal,
    receivedPrincipal,
    receivedInterest,
    receivedTotal,
    balancePrincipal,
    balanceInterest,
    balanceTotal,
    totalInstallments,
    collectionRate,
  };
}

module.exports = {
  round2,
  toPaise,
  fromPaise,
  isClosedLoanStatus,
  parseYmdParts,
  computeInstallmentDemand,
  buildSchedule,
  allocatePayments,
  splitReceived,
  aggregateByMonth,
  summarize,
};

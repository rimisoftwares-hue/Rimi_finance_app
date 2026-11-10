/**
 * Pure calculation engine for the Business & Revenue Report (Accounts -> Business).
 *
 * Basis & Accounting Rules (Decisions A-E):
 * - Decision A (Mixed Basis):
 *   - Collections (principal, interest, defaultAmt/penalty, handLoan) are bucketed
 *     by `payments.payment_date` calendar month in Asia/Kolkata (cash basis).
 *   - Disbursements (hpCount, loanAmount) and docCharge are bucketed by
 *     `loans.hp_date` calendar month in Asia/Kolkata (loan origination date basis).
 *   - Net Income (`interest + defaultAmt + docCharge`) therefore mixes cash-basis
 *     collections (interest, penalty) with loan-date revenue (documentation charges).
 * - Decision B (Hand Loan):
 *   - `handLoan` in HP RECEIPT = `SUM(payments.hand_loan)` collected in the month.
 *   - `loanAmount` in LOAN DISBURSED = `SUM(loans.hp_amount)` disbursed in the month
 *     (`loans.hand_loan` given out is tracked separately and not added to `hp_amount`).
 * - Decision C (Whole-Month Ranges):
 *   - Any custom `from`/`to` range is snapped to whole calendar months
 *     (`effectiveFrom` = 1st of `from` month, `effectiveTo` = last day of `to` month).
 * - Decision D (NULL `hp_date`):
 *   - Loans with `hp_date IS NULL` are excluded (existing code does not fall back to
 *     `customers.created_at`).
 * - Decision E (Settlement / Closing Payments):
 *   - Stored as regular rows in `payments` without pre-split columns; their `amount`
 *     is split using the loan's `computeInstallmentDemand` ratio.
 *
 * All internal money arithmetic uses integer paise (`Math.round(amount * 100)`),
 * converting to 2-decimal rupees via `fromPaise` only at the output boundary.
 */

const {
  round2,
  toPaise,
  fromPaise,
  computeInstallmentDemand,
} = require('./demand.calculator');

/**
 * Pure leap-year-aware number of days in a calendar month (1..12).
 *
 * @param {number} year
 * @param {number} month 1..12
 * @returns {number}
 */
function daysInMonth(year, month) {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

const EARLIEST_SANITY_DATE = '2000-01-01';
const EARLIEST_SANITY_MONTH = '2000-01';

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Returns today's calendar date ('YYYY-MM-DD') in Asia/Kolkata timezone.
 * Never uses UTC or local system getters.
 *
 * @param {Date} [now=new Date()]
 * @returns {string} 'YYYY-MM-DD'
 */
function getCurrentDateIST(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Returns the current month key ('YYYY-MM') in Asia/Kolkata timezone.
 *
 * @param {Date} [now=new Date()]
 * @returns {string} 'YYYY-MM'
 */
function getCurrentMonthKeyIST(now = new Date()) {
  return getCurrentDateIST(now).slice(0, 7);
}

/**
 * Converts a Date, ISO timestamp, 'YYYY-MM-DD', or 'YYYY-MM' into a 'YYYY-MM'
 * month key in Asia/Kolkata without using `new Date("YYYY-MM-DD")` local getters.
 *
 * @param {string|Date|null|undefined} input
 * @returns {string|null}
 */
function toMonthKeyIST(input) {
  if (!input) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return getCurrentMonthKeyIST(input);
  }
  const str = String(input).trim();
  if (/^\d{4}-\d{2}$/.test(str)) {
    const month = Number(str.slice(5, 7));
    if (month >= 1 && month <= 12) return str;
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const month = Number(str.slice(5, 7));
    if (month >= 1 && month <= 12) return str.slice(0, 7);
    return null;
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return getCurrentMonthKeyIST(parsed);
}

/**
 * Parse a 'YYYY-MM' month key into `{ year, month }`.
 *
 * @param {string} monthKey
 * @returns {{ year: number, month: number } | null}
 */
function parseMonthKey(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return null;
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Format `{ year, month }` as 'YYYY-MM'.
 *
 * @param {number} year
 * @param {number} month 1..12
 * @returns {string}
 */
function formatMonthKey(year, month) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Add `deltaMonths` (positive or negative) to a 'YYYY-MM' month key.
 *
 * @param {string} monthKey 'YYYY-MM'
 * @param {number} deltaMonths integer
 * @returns {string} 'YYYY-MM'
 */
function addMonthsToKey(monthKey, deltaMonths) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    throw new Error(`Invalid monthKey: ${monthKey}`);
  }
  const totalMonths = parsed.year * 12 + (parsed.month - 1) + Number(deltaMonths || 0);
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = ((totalMonths % 12) + 12) % 12 + 1;
  return formatMonthKey(newYear, newMonth);
}

/**
 * Number of months between `startMonthKey` and `endMonthKey` inclusive.
 * E.g. ('2026-08', '2026-08') => 1; ('2026-01', '2026-12') => 12.
 *
 * @param {string} startMonthKey 'YYYY-MM'
 * @param {string} endMonthKey 'YYYY-MM'
 * @returns {number}
 */
function diffMonthsInclusive(startMonthKey, endMonthKey) {
  const start = parseMonthKey(startMonthKey);
  const end = parseMonthKey(endMonthKey);
  if (!start || !end) return 0;
  return (end.year - start.year) * 12 + (end.month - start.month) + 1;
}

/**
 * Generate a continuous ascending array of 'YYYY-MM' keys from `startMonthKey`
 * to `endMonthKey` inclusive.
 *
 * @param {string} startMonthKey 'YYYY-MM'
 * @param {string} endMonthKey 'YYYY-MM'
 * @returns {string[]}
 */
function expandMonthRange(startMonthKey, endMonthKey) {
  const count = diffMonthsInclusive(startMonthKey, endMonthKey);
  if (count <= 0) return [];
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(addMonthsToKey(startMonthKey, i));
  }
  return result;
}

/**
 * Returns the first and last calendar date ('YYYY-MM-DD') of a 'YYYY-MM' month key.
 * Uses pure leap-year arithmetic via `daysInMonth`.
 *
 * @param {string} monthKey 'YYYY-MM'
 * @returns {{ startDate: string, endDate: string }}
 */
function getMonthStartEnd(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    throw new Error(`Invalid monthKey: ${monthKey}`);
  }
  const lastDay = daysInMonth(parsed.year, parsed.month);
  return {
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Format 'YYYY-MM' as short display label (e.g. 'Aug 2026').
 *
 * @param {string} monthKey 'YYYY-MM'
 * @returns {string}
 */
function formatMonthShortLabel(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return String(monthKey || '');
  return `${SHORT_MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

/**
 * Format 'YYYY-MM' as full display label (e.g. 'August 2026').
 *
 * @param {string} monthKey 'YYYY-MM'
 * @returns {string}
 */
function formatMonthFullLabel(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return String(monthKey || '');
  return `${FULL_MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

/**
 * Checks whether a payment row's `payment_status` is valid (active / non-cancelled).
 *
 * @param {string|null|undefined} paymentStatus
 * @returns {boolean}
 */
function isValidPaymentStatus(paymentStatus) {
  if (!paymentStatus) return true;
  return String(paymentStatus).toLowerCase() !== 'cancelled';
}

/**
 * Sanity-bounds candidate earliest dates ('YYYY-MM-DD' or 'YYYY-MM'):
 * Ignores dates before 2000-01-01 or after `todayDateIST` (IST).
 * If no valid candidate remains, returns `currentMonthKey`.
 *
 * @param {Array<string|Date|null|undefined>} candidates
 * @param {string} [todayDateIST] 'YYYY-MM-DD' in IST
 * @returns {string} 'YYYY-MM'
 */
function pickSanityBoundedEarliestMonth(candidates = [], todayDateIST = getCurrentDateIST()) {
  const currentMonthKey = todayDateIST.slice(0, 7);
  let minMonthKey = null;

  for (const raw of candidates) {
    if (!raw) continue;
    let dateStr = null;
    if (raw instanceof Date) {
      if (Number.isNaN(raw.getTime())) continue;
      dateStr = getCurrentDateIST(raw);
    } else {
      const s = String(raw).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        dateStr = s;
      } else if (/^\d{4}-\d{2}$/.test(s)) {
        if (s < EARLIEST_SANITY_MONTH || s > currentMonthKey) continue;
        if (!minMonthKey || s < minMonthKey) minMonthKey = s;
        continue;
      } else {
        const parsed = new Date(s);
        if (!Number.isNaN(parsed.getTime())) {
          dateStr = getCurrentDateIST(parsed);
        }
      }
    }

    if (!dateStr) continue;
    if (dateStr < EARLIEST_SANITY_DATE || dateStr > todayDateIST) continue;
    const mk = dateStr.slice(0, 7);
    if (!minMonthKey || mk < minMonthKey) {
      minMonthKey = mk;
    }
  }

  return minMonthKey || currentMonthKey;
}

/**
 * Compute per-installment demand ratio in paise for a loan using `computeInstallmentDemand`.
 *
 * @param {object} loan
 * @returns {{ demandPrincipalPaise: number, demandInterestPaise: number, demandTotalPaise: number, demandPrincipal: number, demandInterest: number, demandTotal: number }}
 */
function computeLoanRatio(loan) {
  if (!loan || typeof loan !== 'object') {
    return {
      demandPrincipalPaise: 0,
      demandInterestPaise: 0,
      demandTotalPaise: 0,
      demandPrincipal: 0,
      demandInterest: 0,
      demandTotal: 0,
    };
  }
  const { demandPrincipal, demandInterest, demandTotal } = computeInstallmentDemand(loan);
  return {
    demandPrincipalPaise: toPaise(demandPrincipal),
    demandInterestPaise: toPaise(demandInterest),
    demandTotalPaise: toPaise(demandTotal),
    demandPrincipal,
    demandInterest,
    demandTotal,
  };
}

/**
 * 1A. Split an amount (in integer paise) into `{ principalPaise, interestPaise }`
 * according to a loan's installment demand ratio:
 *   if D_Total > 0:
 *     interest = clamp(round(amount * D_I / D_Total), 0, amount)
 *     principal = amount - interest
 *   else:
 *     principal = amount, interest = 0
 *
 * Guarantees `principalPaise + interestPaise === amountPaise` for every integer input.
 *
 * @param {number} amountPaise integer paise
 * @param {object|null|undefined} ratio result of `computeLoanRatio`, `computeInstallmentDemand`, `{ D_I, D_Total }`, or raw loan row
 * @returns {{ principalPaise: number, interestPaise: number }}
 */
function splitPrincipalInterest(amountPaise, ratio) {
  const amt = Math.max(0, Math.round(Number(amountPaise) || 0));
  if (amt === 0) {
    return { principalPaise: 0, interestPaise: 0 };
  }

  if (!ratio || typeof ratio !== 'object') {
    return { principalPaise: amt, interestPaise: 0 };
  }

  let dTotalPaise = 0;
  let dInterestPaise = 0;

  if (ratio.demandTotalPaise !== undefined && ratio.demandInterestPaise !== undefined) {
    dTotalPaise = Number(ratio.demandTotalPaise) || 0;
    dInterestPaise = Number(ratio.demandInterestPaise) || 0;
  } else if (ratio.demandTotal !== undefined && ratio.demandInterest !== undefined) {
    dTotalPaise = toPaise(ratio.demandTotal);
    dInterestPaise = toPaise(ratio.demandInterest);
  } else if (ratio.D_Total !== undefined && ratio.D_I !== undefined) {
    dTotalPaise = Number(ratio.D_Total) || 0;
    dInterestPaise = Number(ratio.D_I) || 0;
  } else if (
    ratio.principle_part !== undefined ||
    ratio.interest_part !== undefined ||
    ratio.due_amount !== undefined ||
    ratio.hp_amount !== undefined
  ) {
    const computed = computeLoanRatio(ratio);
    dTotalPaise = computed.demandTotalPaise;
    dInterestPaise = computed.demandInterestPaise;
  }

  if (dTotalPaise <= 0 || dInterestPaise <= 0) {
    return { principalPaise: amt, interestPaise: 0 };
  }

  const rawInterest = Math.round((amt * dInterestPaise) / dTotalPaise);
  const interestPaise = Math.max(0, Math.min(amt, rawInterest));
  const principalPaise = amt - interestPaise;

  return { principalPaise, interestPaise };
}

/**
 * 1B. Build the month spine (`default12`, `default6`, `effective`) of 'YYYY-MM' keys
 * in ascending order.
 *
 * Rules:
 * - `earliestMonthKey` is sanity-bounded to `[2000-01, currentMonthKey]`.
 * - Default windows (no custom filter):
 *   - `spanMonths = diffMonthsInclusive(earliestMonthKey, currentMonthKey)`
 *   - `default12` (Stacked): if `spanMonths >= 12`, `currentMonth-11 .. currentMonth`;
 *     else `earliestMonth .. earliestMonth+11` (includes future months for young finances).
 *   - `default6` (Grouped): if `spanMonths >= 6`, `currentMonth-5 .. currentMonth`;
 *     else `earliestMonth .. earliestMonth+5` (includes future months for young finances).
 * - Custom range (`from` and/or `to` present):
 *   - `effective` = every month from `from`'s month through `to`'s month inclusive.
 *   - If only `from` is given, `to` defaults to `currentMonthKey` (or `from` if `from > currentMonthKey`).
 *   - If only `to` is given, `from` defaults to `earliestMonthKey` (or `to` if `to < earliestMonthKey`).
 *
 * @param {object} params
 * @param {string|null} [params.from] 'YYYY-MM-DD' or 'YYYY-MM'
 * @param {string|null} [params.to] 'YYYY-MM-DD' or 'YYYY-MM'
 * @param {string|null} [params.earliestMonthKey] 'YYYY-MM'
 * @param {string|null} [params.currentMonthKey] 'YYYY-MM'
 * @returns {{ default12: string[], default6: string[], effective: string[], earliestMonthKey: string, currentMonthKey: string }}
 */
function buildMonthSpine({
  from = null,
  to = null,
  earliestMonthKey = null,
  currentMonthKey = null,
} = {}) {
  const currKey = toMonthKeyIST(currentMonthKey) || getCurrentMonthKeyIST();
  let earliestKey = toMonthKeyIST(earliestMonthKey) || currKey;

  if (earliestKey < EARLIEST_SANITY_MONTH || earliestKey > currKey) {
    earliestKey = currKey;
  }

  const spanMonths = diffMonthsInclusive(earliestKey, currKey);

  // 12-month (Stacked) window
  const default12Start = spanMonths >= 12 ? addMonthsToKey(currKey, -11) : earliestKey;
  const default12End = spanMonths >= 12 ? currKey : addMonthsToKey(earliestKey, 11);
  const default12 = expandMonthRange(default12Start, default12End);

  // 6-month (Grouped) window
  const default6Start = spanMonths >= 6 ? addMonthsToKey(currKey, -5) : earliestKey;
  const default6End = spanMonths >= 6 ? currKey : addMonthsToKey(earliestKey, 5);
  const default6 = expandMonthRange(default6Start, default6End);

  // Effective window
  const hasFrom = Boolean(from && String(from).trim());
  const hasTo = Boolean(to && String(to).trim());

  let effective;
  if (!hasFrom && !hasTo) {
    effective = [...default12];
  } else {
    const fromKey = hasFrom ? toMonthKeyIST(from) : null;
    const toKey = hasTo ? toMonthKeyIST(to) : null;

    let startKey = fromKey || earliestKey;
    let endKey = toKey || currKey;

    if (!hasFrom && toKey && startKey > toKey) {
      startKey = toKey;
    }
    if (!hasTo && fromKey && fromKey > endKey) {
      endKey = fromKey;
    }

    effective = expandMonthRange(startKey, endKey);
  }

  return {
    default12,
    default6,
    effective,
    earliestMonthKey: earliestKey,
    currentMonthKey: currKey,
  };
}

/**
 * Compute derived business metrics from a month or totals record.
 * Matches `Business.tsx`'s `computeDerived`:
 *   - `totalCollection = principal + interest + defaultAmt + handLoan`
 *   - `netIncome = interest + defaultAmt + docCharge`
 *   - `netCashFlow = totalCollection - loanAmount`
 *
 * @param {object} row
 * @returns {{ totalCollection: number, netIncome: number, netCashFlow: number }}
 */
function computeDerived(row) {
  const principalPaise = toPaise(row?.principal);
  const interestPaise = toPaise(row?.interest);
  const defaultAmtPaise = toPaise(row?.defaultAmt);
  const handLoanPaise = toPaise(row?.handLoan);
  const loanAmountPaise = toPaise(row?.loanAmount);
  const docChargePaise = toPaise(row?.docCharge);

  const totalCollectionPaise = principalPaise + interestPaise + defaultAmtPaise + handLoanPaise;
  const netIncomePaise = interestPaise + defaultAmtPaise + docChargePaise;
  const netCashFlowPaise = totalCollectionPaise - loanAmountPaise;

  return {
    totalCollection: fromPaise(totalCollectionPaise),
    netIncome: fromPaise(netIncomePaise),
    netCashFlow: fromPaise(netCashFlowPaise),
  };
}

/**
 * Compute grand totals across an array of monthly business records.
 * Performs summation in integer paise and derives `totalCollection`, `netIncome`,
 * and `netCashFlow` from those exact sums so all accounting identities hold to the paisa.
 *
 * @param {Array<object>} rows
 * @returns {{
 *   principal: number,
 *   interest: number,
 *   defaultAmt: number,
 *   handLoan: number,
 *   hpCount: number,
 *   loanAmount: number,
 *   docCharge: number,
 *   totalCollection: number,
 *   netIncome: number,
 *   netCashFlow: number
 * }}
 */
function computeTotals(rows = []) {
  let principalPaise = 0;
  let interestPaise = 0;
  let defaultAmtPaise = 0;
  let handLoanPaise = 0;
  let hpCount = 0;
  let loanAmountPaise = 0;
  let docChargePaise = 0;

  for (const r of rows) {
    if (!r) continue;
    principalPaise += toPaise(r.principal);
    interestPaise += toPaise(r.interest);
    defaultAmtPaise += toPaise(r.defaultAmt);
    handLoanPaise += toPaise(r.handLoan);
    hpCount += Number(r.hpCount) || 0;
    loanAmountPaise += toPaise(r.loanAmount);
    docChargePaise += toPaise(r.docCharge);
  }

  const totalCollectionPaise = principalPaise + interestPaise + defaultAmtPaise + handLoanPaise;
  const netIncomePaise = interestPaise + defaultAmtPaise + docChargePaise;
  const netCashFlowPaise = totalCollectionPaise - loanAmountPaise;

  return {
    principal: fromPaise(principalPaise),
    interest: fromPaise(interestPaise),
    defaultAmt: fromPaise(defaultAmtPaise),
    handLoan: fromPaise(handLoanPaise),
    hpCount,
    loanAmount: fromPaise(loanAmountPaise),
    docCharge: fromPaise(docChargePaise),
    totalCollection: fromPaise(totalCollectionPaise),
    netIncome: fromPaise(netIncomePaise),
    netCashFlow: fromPaise(netCashFlowPaise),
  };
}

/**
 * 1C. Aggregate loan disbursements and payment groups across the month spine.
 *
 * @param {object} params
 * @param {Array<object>} [params.loanMonthRows=[]] `{ monthKey, hpCount, loanAmountPaise (or loanAmount), docChargePaise (or docCharge) }`
 * @param {Array<object>} [params.paymentGroups=[]] `{ monthKey, loanId, customerId, amountPaise (or amount), penaltyPaise (or penalty), handLoanPaise (or handLoan), payment_status }`
 * @param {Map|object} [params.loansRatioById={}] Map or object keyed by `loanId` (or `customerId`)
 * @param {object} [params.spine] prebuilt spine from `buildMonthSpine`
 * @param {string|null} [params.from]
 * @param {string|null} [params.to]
 * @param {string|null} [params.earliestMonthKey]
 * @param {string|null} [params.currentMonthKey]
 * @returns {object}
 */
function computeBusinessReport({
  loanMonthRows = [],
  paymentGroups = [],
  loansRatioById = {},
  spine = null,
  from = null,
  to = null,
  earliestMonthKey = null,
  currentMonthKey = null,
} = {}) {
  const resolvedSpine =
    spine ||
    buildMonthSpine({
      from,
      to,
      earliestMonthKey,
      currentMonthKey,
    });

  const currMonthKey = resolvedSpine.currentMonthKey || toMonthKeyIST(currentMonthKey) || getCurrentMonthKeyIST();
  const earliestKey = resolvedSpine.earliestMonthKey || toMonthKeyIST(earliestMonthKey) || currMonthKey;

  // Union of all month keys needed across effective, default12, and default6 windows
  const allMonthKeysSet = new Set([
    ...(resolvedSpine.effective || []),
    ...(resolvedSpine.default12 || []),
    ...(resolvedSpine.default6 || []),
  ]);

  const buckets = new Map();
  for (const mk of allMonthKeysSet) {
    buckets.set(mk, {
      principalPaise: 0,
      interestPaise: 0,
      defaultAmtPaise: 0,
      handLoanPaise: 0,
      hpCount: 0,
      loanAmountPaise: 0,
      docChargePaise: 0,
    });
  }

  const getRatio = (key) => {
    if (key === null || key === undefined) return null;
    if (loansRatioById instanceof Map) {
      return loansRatioById.get(key) || loansRatioById.get(String(key)) || null;
    }
    if (loansRatioById && typeof loansRatioById === 'object') {
      return loansRatioById[key] || loansRatioById[String(key)] || null;
    }
    return null;
  };

  // Aggregate payment groups
  for (const group of paymentGroups) {
    if (!group) continue;
    if (!isValidPaymentStatus(group.payment_status ?? group.paymentStatus)) {
      continue;
    }
    const mk = toMonthKeyIST(group.monthKey ?? group.month_key);
    if (!mk || !buckets.has(mk)) continue;

    const amountPaise =
      group.amountPaise !== undefined
        ? Math.max(0, Math.round(Number(group.amountPaise) || 0))
        : toPaise(group.amount);
    const penaltyPaise =
      group.penaltyPaise !== undefined
        ? Math.max(0, Math.round(Number(group.penaltyPaise) || 0))
        : toPaise(group.penalty ?? group.defaultAmt);
    const handLoanPaise =
      group.handLoanPaise !== undefined
        ? Math.max(0, Math.round(Number(group.handLoanPaise) || 0))
        : toPaise(group.handLoan ?? group.hand_loan);

    const lookupKey = group.loanId ?? group.loan_id ?? group.customerId ?? group.customer_id;
    const ratio = group.ratio || getRatio(lookupKey);
    const { principalPaise, interestPaise } = splitPrincipalInterest(amountPaise, ratio);

    const b = buckets.get(mk);
    b.principalPaise += principalPaise;
    b.interestPaise += interestPaise;
    b.defaultAmtPaise += penaltyPaise;
    b.handLoanPaise += handLoanPaise;
  }

  // Aggregate loan disbursement rows
  for (const row of loanMonthRows) {
    if (!row) continue;
    const mk = toMonthKeyIST(row.monthKey ?? row.month_key);
    if (!mk || !buckets.has(mk)) continue;

    const hpCount = Math.max(0, Math.trunc(Number(row.hpCount ?? row.hp_count) || 0));
    const loanAmountPaise =
      row.loanAmountPaise !== undefined
        ? Math.max(0, Math.round(Number(row.loanAmountPaise) || 0))
        : toPaise(row.loanAmount ?? row.loan_amount ?? row.hp_amount);
    const docChargePaise =
      row.docChargePaise !== undefined
        ? Math.max(0, Math.round(Number(row.docChargePaise) || 0))
        : toPaise(row.docCharge ?? row.doc_charge ?? row.documentation_charge);

    const b = buckets.get(mk);
    b.hpCount += hpCount;
    b.loanAmountPaise += loanAmountPaise;
    b.docChargePaise += docChargePaise;
  }

  // Build canonical month objects
  const monthsByKey = {};
  const sortedKeys = Array.from(allMonthKeysSet).sort();
  for (const mk of sortedKeys) {
    const b = buckets.get(mk);
    const totalCollectionPaise =
      b.principalPaise + b.interestPaise + b.defaultAmtPaise + b.handLoanPaise;
    const netIncomePaise = b.interestPaise + b.defaultAmtPaise + b.docChargePaise;
    const netCashFlowPaise = totalCollectionPaise - b.loanAmountPaise;

    monthsByKey[mk] = {
      id: mk,
      monthKey: mk,
      month: formatMonthShortLabel(mk),
      fullMonth: formatMonthFullLabel(mk),
      date: `${mk}-01`,
      principal: fromPaise(b.principalPaise),
      interest: fromPaise(b.interestPaise),
      defaultAmt: fromPaise(b.defaultAmtPaise),
      handLoan: fromPaise(b.handLoanPaise),
      hpCount: b.hpCount,
      loanAmount: fromPaise(b.loanAmountPaise),
      docCharge: fromPaise(b.docChargePaise),
      totalCollection: fromPaise(totalCollectionPaise),
      netIncome: fromPaise(netIncomePaise),
      netCashFlow: fromPaise(netCashFlowPaise),
      isFuture: mk > currMonthKey,
    };
  }

  const effectiveMonths = (resolvedSpine.effective || []).map((k) => monthsByKey[k]);
  const default12Months = (resolvedSpine.default12 || []).map((k) => monthsByKey[k]);
  const default6Months = (resolvedSpine.default6 || []).map((k) => monthsByKey[k]);

  // Totals are computed strictly from the effective month rows
  const totals = computeTotals(effectiveMonths);

  let effectiveFrom = null;
  let effectiveTo = null;
  if (resolvedSpine.effective && resolvedSpine.effective.length > 0) {
    effectiveFrom = getMonthStartEnd(resolvedSpine.effective[0]).startDate;
    effectiveTo = getMonthStartEnd(
      resolvedSpine.effective[resolvedSpine.effective.length - 1]
    ).endDate;
  }

  return {
    range: {
      from: from || null,
      to: to || null,
      effectiveFrom,
      effectiveTo,
    },
    earliestMonth: earliestKey,
    currentMonth: currMonthKey,
    monthKeys: {
      effective: resolvedSpine.effective || [],
      default12: resolvedSpine.default12 || [],
      default6: resolvedSpine.default6 || [],
    },
    monthsByKey,
    months: {
      effective: effectiveMonths,
      default12: default12Months,
      default6: default6Months,
    },
    totals,
  };
}

module.exports = {
  EARLIEST_SANITY_DATE,
  EARLIEST_SANITY_MONTH,
  round2,
  toPaise,
  fromPaise,
  getCurrentDateIST,
  getCurrentMonthKeyIST,
  toMonthKeyIST,
  parseMonthKey,
  formatMonthKey,
  addMonthsToKey,
  diffMonthsInclusive,
  expandMonthRange,
  getMonthStartEnd,
  formatMonthShortLabel,
  formatMonthFullLabel,
  isValidPaymentStatus,
  pickSanityBoundedEarliestMonth,
  computeLoanRatio,
  splitPrincipalInterest,
  buildMonthSpine,
  computeDerived,
  computeTotals,
  computeBusinessReport,
};

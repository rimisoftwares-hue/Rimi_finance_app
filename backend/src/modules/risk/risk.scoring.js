/**
 * risk.scoring.js
 *
 * Pure, side-effect-free scoring functions for the dual-score customer risk system.
 * NO database access lives here — risk.service.js runs the SQL aggregations and
 * feeds plain values into these functions, which keeps every rule unit-testable.
 *
 * Two scores:
 *   - creditScore  (30–100, higher = better)  CIBIL-style long-term reliability
 *   - dueRiskScore (0–100,  higher = riskier) current monthly delinquency risk
 *
 * Date handling: all dates are 'YYYY-MM-DD' strings (the service selects them with
 * TO_CHAR) and are evaluated as UTC calendar dates, so results never depend on the
 * server's local timezone.
 */

'use strict';

const {
  resolveIstDateString,
  computeAuthoritativeLoanLedger,
} = require('../finance/financialCalculation.service');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// customers.loan_status is loan_status_enum ('active' | 'close' | 'seized').
// The extra spellings keep the rule safe if the enum is ever extended.
const CLOSED_LOAN_STATUSES = ['close', 'closed', 'completed', 'settled'];

const CREDIT_BASE = 75;
const CREDIT_MIN = 30;
const CREDIT_MAX = 100;
const DEDUCTION_CAP = 25;
const ON_TIME_GRACE_DAYS = 5;

// ─── Small helpers ────────────────────────────────────────────────────────────

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toInt(value) {
  return Math.trunc(toNum(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round(toNum(value) * 100) / 100;
}

/** Today's calendar date as 'YYYY-MM-DD' in Asia/Kolkata (IST). */
function todayIso() {
  return resolveIstDateString();
}

/**
 * Parses 'YYYY-MM-DD' (or an ISO timestamp / Date) into { y, m, d }.
 * Returns null for empty or invalid input.
 */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // pg parses DATE columns as local midnight — use local components.
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function toUtcMs(parts) {
  return Date.UTC(parts.y, parts.m - 1, parts.d);
}

function formatDate(parts) {
  if (!parts) return null;
  return `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
}

/** Whole days from `from` to `to` (to − from). */
function diffDays(to, from) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/**
 * Adds calendar months, clamping the day to the target month's length.
 * Mirrors PostgreSQL `date + interval 'n months'` (Jan 31 + 1 month = Feb 28/29).
 */
function addMonths(parts, months) {
  const totalMonths = parts.y * 12 + (parts.m - 1) + months;
  const y = Math.floor(totalMonths / 12);
  const m = (totalMonths % 12) + 1;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: Math.min(parts.d, daysInMonth) };
}

function isClosedStatus(loanStatus) {
  return CLOSED_LOAN_STATUSES.includes(String(loanStatus || '').trim().toLowerCase());
}

// ─── Loan metrics ─────────────────────────────────────────────────────────────

/**
 * Derives repayment metrics for a customer's latest loan.
 *
 * @param {object} input
 * @param {string} [input.loanStatus]        customers.loan_status
 * @param {number} [input.dueAmount]         loans.due_amount (EMI)
 * @param {number} [input.netPayable]        loans.net_payable
 * @param {number} [input.hpAmount]          loans.hp_amount
 * @param {number} [input.dueMonth]          loans.due_month (tenure in months)
 * @param {number} [input.totalPaid]         SUM(active payments.amount)
 * @param {string} [input.hpDate]            loans.hp_date
 * @param {string} [input.dueDate]           loans.due_date
 * @param {string} [input.customerCreatedAt] customers.created_at::date
 * @param {string} [input.asOfDate]          evaluation date, defaults to today
 */
function computeLoanMetrics(input = {}) {
  const ledger = computeAuthoritativeLoanLedger({
    loanId: input.loanId,
    customerId: input.customerId,
    loanStatus: input.loanStatus,
    loanAmount: input.loanAmount ?? input.hpAmount,
    hpAmount: input.hpAmount,
    dueAmount: input.dueAmount,
    netPayable: input.netPayable,
    dueMonth: input.dueMonth,
    validEmiPaid: input.validEmiPaid !== undefined ? input.validEmiPaid : input.totalPaid,
    totalPenaltyPaid: input.totalPenaltyPaid,
    loanPenaltyAmount: input.loanPenaltyAmount ?? input.penaltyAmount,
    pendingPenaltiesTableSum: input.pendingPenaltiesTableSum,
    dueDate: input.dueDate,
    hpDate: input.hpDate,
    customerCreatedAt: input.customerCreatedAt,
    asOfDate: input.asOfDate,
  });

  return {
    totalPaid: ledger.validEmiPaid,
    emiAmount: ledger.installmentAmount,
    totalLoan: ledger.totalContractualDue,
    pendingAmount: ledger.remainingScheduledEmiAmount,
    totalOutstandingLoanBalance: ledger.totalOutstandingLoanBalance,
    outstandingPenaltyAmount: ledger.outstandingPenaltyAmount,
    installmentsPaid: ledger.installmentsCovered,
    baseDate: ledger.anchorDate,
    earliestUnpaidDueDate: ledger.earliestUnpaidDueDate,
    upcomingEmiDueDate: ledger.nextEmiDueDate,
    nextDueDate: ledger.earliestUnpaidDueDate || ledger.nextEmiDueDate,
    overdueDays: ledger.overdueDays,
    expectedInstallments: ledger.maturedInstallments,
    missedEmis: ledger.pendingEmiCount,
    overdueAmount: ledger.currentOverdueEmiAmount,
  };
}

// ─── Credit score ─────────────────────────────────────────────────────────────

/** 80–100 Excellent, 65–79 Good, 50–64 Fair, 30–49 Poor */
function creditBand(score) {
  const s = toNum(score);
  if (s >= 80) return 'Excellent';
  if (s >= 65) return 'Good';
  if (s >= 50) return 'Fair';
  return 'Poor';
}

/**
 * Lateness bucket for one historical payment, given its delay in days
 * (payment_date − COALESCE(due_date, base_date)).
 * @returns {'on_time'|'grace'|'late_15_30'|'late_31_60'|'late_over_60'}
 */
function paymentDelayBucket(delayDays) {
  const d = toNum(delayDays);
  if (d <= ON_TIME_GRACE_DAYS) return 'on_time';
  if (d < 15) return 'grace';
  if (d <= 30) return 'late_15_30';
  if (d <= 60) return 'late_31_60';
  return 'late_over_60';
}

/**
 * @param {object} input
 * @param {number} input.totalPayments   count of active payments
 * @param {number} input.onTimePayments  payment_date <= due + 5 days
 * @param {number} input.late15to30      delay 15–30 days
 * @param {number} input.late31to60      delay 31–60 days
 * @param {number} input.lateOver60      delay > 60 days
 * @param {number} input.overdueDays     current overdue days of the loan
 * @param {number} input.brokenPtpCount  broken promise-to-pay count
 * @param {boolean} input.hasSeizure     customer has a seizing_vehicle record
 */
function computeCreditScore(input = {}) {
  const totalPayments = Math.max(0, toInt(input.totalPayments));
  const onTimePayments = clamp(toInt(input.onTimePayments), 0, totalPayments);

  const onTimeBonus = totalPayments > 0 ? Math.round((onTimePayments / totalPayments) * 25) : 0;

  const lateDeduction = Math.min(
    DEDUCTION_CAP,
    Math.max(0, toInt(input.late15to30)) * 3 +
    Math.max(0, toInt(input.late31to60)) * 7 +
    Math.max(0, toInt(input.lateOver60)) * 15
  );

  const overdueDays = Math.max(0, toNum(input.overdueDays));
  const overdueDeduction = Math.min(DEDUCTION_CAP, Math.round((overdueDays / 90) * 25));

  const ptpSeizureDeduction = Math.min(
    DEDUCTION_CAP,
    Math.max(0, toInt(input.brokenPtpCount)) * 5 + (input.hasSeizure ? 20 : 0)
  );

  const creditScore = clamp(
    CREDIT_BASE + onTimeBonus - lateDeduction - overdueDeduction - ptpSeizureDeduction,
    CREDIT_MIN,
    CREDIT_MAX
  );

  return {
    creditScore,
    creditBand: creditBand(creditScore),
    onTimePaymentRatio: totalPayments > 0 ? Math.round((onTimePayments / totalPayments) * 10000) / 10000 : 0,
    components: {
      base: CREDIT_BASE,
      onTimeBonus,
      lateDeduction,
      overdueDeduction,
      ptpSeizureDeduction,
    },
  };
}

// ─── Due risk score ───────────────────────────────────────────────────────────

/** 0 → 0; 1–15 → 25; 16–30 → 45; 31–60 → 70; 61–90 → 88; > 90 → 100 */
function dueDelayRisk(overdueDays) {
  const d = toNum(overdueDays);
  if (d <= 0) return 0;
  if (d <= 15) return 25;
  if (d <= 30) return 45;
  if (d <= 60) return 70;
  if (d <= 90) return 88;
  return 100;
}

/**
 * @param {object} input
 * @param {number} input.overdueDays
 * @param {number} input.missedEmis
 * @param {number} input.creditScore
 */
function computeDueRisk(input = {}) {
  const overdueDays = Math.max(0, toNum(input.overdueDays));
  const missedEmis = Math.max(0, toNum(input.missedEmis));
  const creditScore = clamp(toNum(input.creditScore), CREDIT_MIN, CREDIT_MAX);

  const delayRisk = dueDelayRisk(overdueDays);
  const unpaidEmiRisk = Math.min(100, Math.round((missedEmis / 3) * 100));
  const creditVulnerabilityRisk = Math.round(((100 - creditScore) / 70) * 100);

  let dueRiskScore;
  if (overdueDays === 0 && creditScore >= 65) {
    dueRiskScore = Math.min(20, Math.round(creditVulnerabilityRisk * 0.25));
  } else {
    dueRiskScore = clamp(
      Math.round(delayRisk * 0.55 + unpaidEmiRisk * 0.2 + creditVulnerabilityRisk * 0.25),
      0,
      100
    );
  }

  return {
    dueRiskScore,
    dueDelayRisk: delayRisk,
    unpaidEmiRisk,
    creditVulnerabilityRisk,
  };
}

/**
 * Risk level — evaluated in order, first match wins.
 * @param {{dueRiskScore:number, overdueDays:number, creditScore:number}} input
 * @returns {'critical'|'high'|'warning'|'safe'}
 */
function classifyRisk(input = {}) {
  const dueRiskScore = toNum(input.dueRiskScore);
  const overdueDays = toNum(input.overdueDays);
  const creditScore = toNum(input.creditScore);

  if (dueRiskScore >= 75 || overdueDays > 60 || (overdueDays > 30 && creditScore < 50)) return 'critical';
  if (dueRiskScore >= 55 || overdueDays > 30 || (overdueDays > 15 && creditScore < 55)) return 'high';
  if (dueRiskScore >= 25 || (overdueDays >= 1 && overdueDays <= 30)) return 'warning';
  return 'safe';
}

// ─── Supporting helpers used by the service ───────────────────────────────────

/**
 * Monthly payment status for the deep-view payment table.
 *  - partial: month total is below one EMI
 *  - late:    any penalty was charged, or a payment came > 5 days after its due date
 *  - paid:    otherwise
 */
function monthlyPaymentStatus({ totalPaid, totalPenalty, maxDelayDays, emiAmount } = {}) {
  const emi = toNum(emiAmount);
  if (emi > 0 && toNum(totalPaid) < emi) return 'partial';
  if (toNum(totalPenalty) > 0 || toNum(maxDelayDays) > ON_TIME_GRACE_DAYS) return 'late';
  return 'paid';
}

/**
 * Deterministic mock distance (1.5–18.0 km) derived from the customer id.
 * Placeholder until live GPS (customer_live_locations) is populated.
 */
function mockDistanceKm(customerId) {
  const str = String(customerId || '');
  // FNV-1a 32-bit hash — stable across calls and processes
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return Math.round((1.5 + (hash % 1651) / 100) * 10) / 10;
}

/** Distance risk (0–100) — same scale the UI used before: 50 km = 100%. */
function distanceRisk(distanceKm) {
  return Math.round(Math.min(Math.max(0, toNum(distanceKm)) / 50, 1) * 100);
}

/** Lending recommendation per credit band. */
function creditRecommendation(band) {
  switch (band) {
    case 'Excellent':
      return {
        eligible: true,
        maxSuggestedAmountNote: 'Eligible for a higher amount or top-up loan',
        reason: 'Consistently strong repayment history',
      };
    case 'Good':
      return {
        eligible: true,
        maxSuggestedAmountNote: 'Standard loan amount',
        reason: 'Reliable repayment history with minor or no delays',
      };
    case 'Fair':
      return {
        eligible: true,
        maxSuggestedAmountNote: 'Smaller amount only — guarantor required',
        reason: 'Repayment history shows notable delays or broken promises',
      };
    default:
      return {
        eligible: false,
        maxSuggestedAmountNote: 'Avoid new loan',
        reason: 'Poor repayment history (heavy delays, overdue, broken promises or seizure)',
      };
  }
}

/**
 * Convenience composition: metrics → credit score → due risk → risk level.
 * @param {object} loanInput    see computeLoanMetrics
 * @param {object} historyInput see computeCreditScore (overdueDays is taken from the metrics)
 */
function scoreCustomer(loanInput = {}, historyInput = {}) {
  const metrics = computeLoanMetrics(loanInput);
  const credit = computeCreditScore({ ...historyInput, overdueDays: metrics.overdueDays });
  const due = computeDueRisk({
    overdueDays: metrics.overdueDays,
    missedEmis: metrics.missedEmis,
    creditScore: credit.creditScore,
  });
  const riskLevel = classifyRisk({
    dueRiskScore: due.dueRiskScore,
    overdueDays: metrics.overdueDays,
    creditScore: credit.creditScore,
  });
  return { metrics, credit, due, riskLevel };
}

module.exports = {
  computeLoanMetrics,
  computeCreditScore,
  computeDueRisk,
  classifyRisk,
  creditBand,
  // supporting helpers
  dueDelayRisk,
  paymentDelayBucket,
  monthlyPaymentStatus,
  mockDistanceKm,
  distanceRisk,
  creditRecommendation,
  scoreCustomer,
  // date utilities (exported for the service / tests)
  todayIso,
  parseDate,
  formatDate,
  addMonths,
  diffDays,
  isClosedStatus,
};


/**
 * pendingCollectionsHelper.js
 * Loan calculation and query construction utilities for AutoFinex Pending Collections.
 * Delegates all schedule clamping (`offset = 1..due_month`), `Asia/Kolkata` date handling,
 * partial EMI shortfall accounting, and balance arithmetic to `financialCalculation.service.js`.
 */

'use strict';

const {
  resolveIstDateString,
  clampedInstallmentDate,
  computeAuthoritativeLoanLedger,
} = require('../finance/financialCalculation.service');

/**
 * Calculates how many installments have matured (`D_k < asOfDate`) based on the
 * Month-0 loan cycle anchor (`loans.due_date`, fallback `hp_date`) for `k = 1..totalMonths`,
 * as well as the next upcoming scheduled due date.
 *
 * @param {string|Date} anchorDateStr Month-0 cycle anchor date (YYYY-MM-DD)
 * @param {number} totalMonths Total loan tenure in months (`due_month`)
 * @param {string|Date} asOfDateStr Current evaluation date in IST (YYYY-MM-DD)
 * @returns {{ dueSoFar: number, nextDueDate: string|null }}
 */
function calculateInstallmentDueDates(anchorDateStr, totalMonths, asOfDateStr = resolveIstDateString()) {
  const tenure = Math.max(0, parseInt(totalMonths, 10) || 0);
  if (!anchorDateStr || tenure <= 0) {
    return { dueSoFar: 0, nextDueDate: null };
  }

  const anchorIso = typeof anchorDateStr === 'string'
    ? anchorDateStr.split('T')[0]
    : resolveIstDateString(anchorDateStr);
  const asOfIso = resolveIstDateString(asOfDateStr);

  let dueSoFar = 0;
  let nextDueDate = null;

  for (let k = 1; k <= tenure; k += 1) {
    const dueIso = clampedInstallmentDate(anchorIso, k);
    if (!dueIso) break;
    if (dueIso < asOfIso) {
      dueSoFar += 1;
    } else if (!nextDueDate) {
      nextDueDate = dueIso;
    }
  }

  return { dueSoFar, nextDueDate };
}

/**
 * Calculates all loan, installment, pending overdue, and balance metrics for a customer loan row
 * via the authoritative `financialCalculation.service.js` engine.
 *
 * @param {object} row Raw database join row
 * @param {string} asOfDate Date string (YYYY-MM-DD)
 * @returns {object} Formatted and calculated record for Pending Collections
 */
function mapPendingCollectionRow(row, asOfDate = resolveIstDateString()) {
  const ledger = computeAuthoritativeLoanLedger({
    loanId: row.loan_id,
    customerId: row.customer_id,
    hplno: row.hplno,
    loanStatus: row.loan_status,
    loanAmount: row.loan_amount ?? row.hp_amount,
    hpAmount: row.hp_amount,
    dueMonth: row.total_installments,
    dueAmount: row.installment_amount,
    netPayable: row.net_payable,
    validEmiPaid: row.total_paid,
    totalPenaltyPaid: row.total_penalty_paid || 0,
    loanPenaltyAmount: row.penalty_amount || 0,
    pendingPenaltiesTableSum: row.pending_penalties_sum || 0,
    dueDate: row.first_due_date,
    hpDate: row.hp_date,
    asOfDate,
  });

  const totalInstallments = ledger.totalInstallments;
  const installmentAmount = ledger.installmentAmount;
  const totalDue = ledger.totalContractualDue;
  const totalPaid = ledger.validEmiPaid;
  const balance = ledger.remainingScheduledEmiAmount;
  const installmentsPaid = ledger.installmentsCovered;
  const dueSoFar = ledger.maturedInstallments;
  const nextDueDate = ledger.nextEmiDueDate;
  const monthlyPending = ledger.currentOverdueEmiAmount;
  const pendingEmi = ledger.pendingEmiCount;

  // Default Amount: unpaid amount for installments overdue by > 1 cycle
  const defaultDueSoFar = Math.max(0, dueSoFar - 1);
  const defaultAmountDueSoFar = Math.min(totalDue, defaultDueSoFar * installmentAmount);
  const defaultAmount =
    balance <= 0 ? 0 : Math.min(balance, Math.max(0, defaultAmountDueSoFar - totalPaid));
  const defaultEmi =
    defaultAmount > 0 && installmentAmount > 0 ? Math.ceil(defaultAmount / installmentAmount) : 0;

  const hpAmount = Math.max(0, parseFloat(row.hp_amount) || 0);

  let status = 'good';
  let statusLabel = 'On Time';
  let statusColor = 'green';

  if (row.loan_status === 'close' || (totalDue > 0 && balance <= 0)) {
    status = 'close';
    statusLabel = 'Close';
    statusColor = 'green';
  } else if (pendingEmi >= 2 || monthlyPending > installmentAmount) {
    status = 'pending';
    statusLabel = 'Pending';
    statusColor = 'red';
  } else if (monthlyPending > 0) {
    status = 'action';
    statusLabel = 'Action';
    statusColor = 'yellow';
  }

  const rawDealType = String(row.deal_type || '').toLowerCase();
  const dealType = rawDealType === 'finance' ? 'Finance' : 'Consulting';
  const loanNo = row.hplno ? `HPL ${row.hplno}` : '-';

  return {
    id: row.customer_id,
    customerId: row.customer_id,
    loanId: row.loan_id,
    vehicleId: row.vehicle_id || null,
    loanNo,
    hplno: row.hplno,
    name: row.customer_name || '',
    vehicle: row.vehicle_number || '-',
    vehicleName: [row.brand, row.model].filter(Boolean).join(' ') || row.vehicle_name || row.vehicle_modal || '-',
    vehicleType: row.vehicle_type || row.body_type || row.loan_type || '',
    phone: row.primary_phone || row.phone || '-',
    loanDate: row.hp_date || '',
    hpDate: row.hp_date || '',
    firstDueDate: row.first_due_date || null,
    earliestUnpaidDueDate: ledger.earliestUnpaidDueDate,
    lastPaymentDate: row.last_payment_date || null,
    nextDueDate: nextDueDate || null,
    overdueDays: ledger.overdueDays,
    totalEmi: totalInstallments,
    paidEmi: installmentsPaid,
    pendingEmi,
    defaultEmi,
    dueProgress: `${installmentsPaid}/${totalInstallments}`,
    totalDue,
    paid: totalPaid,
    pending: monthlyPending,
    balance,
    outstandingPenaltyAmount: ledger.outstandingPenaltyAmount,
    totalOutstandingLoanBalance: ledger.totalOutstandingLoanBalance,
    status,
    statusLabel,
    statusColor,
    street: row.street || row.street_name || '',
    village: row.village || '',
    city: row.city || '',
    state: row.state || '',
    fullAddress: row.full_address || '',
    dealType,
    hbAmount: hpAmount,
    hpAmount,
    defaultAmount,
    broker: row.broker_name || '',
    interestRate: parseFloat(row.interest_rate) || 0,
    installmentAmount,
  };
}

module.exports = {
  calculateInstallmentDueDates,
  mapPendingCollectionRow,
};

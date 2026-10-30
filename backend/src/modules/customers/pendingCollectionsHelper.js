/**
 * pendingCollectionsHelper.js
 * Loan calculation and query construction utilities for AutoFinex Pending Collections.
 * Ensures consistent loan calculations that mirror LoanSummary.tsx and CustomerDetails.tsx.
 */

/**
 * Calculates how many installments have become due so far based on the first due date and total months,
 * as well as the next upcoming due date.
 *
 * @param {string|Date} firstDueDateStr Starting due date of EMI #1 (YYYY-MM-DD)
 * @param {number} totalMonths Total loan tenure in months (due_month)
 * @param {string|Date} asOfDateStr Current evaluation date (YYYY-MM-DD)
 * @returns {{ dueSoFar: number, nextDueDate: string|null }}
 */
function calculateInstallmentDueDates(firstDueDateStr, totalMonths, asOfDateStr = new Date().toISOString().split('T')[0]) {
  if (!firstDueDateStr || totalMonths <= 0) {
    return { dueSoFar: 0, nextDueDate: null };
  }

  const str = typeof firstDueDateStr === 'string' ? firstDueDateStr.split('T')[0] : new Date(firstDueDateStr).toISOString().split('T')[0];
  const parts = str.split('-');
  const startYear = parseInt(parts[0], 10);
  const startMonth = parseInt(parts[1], 10);
  const startDay = parseInt(parts[2], 10);

  if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay)) {
    return { dueSoFar: 0, nextDueDate: null };
  }

  const asOfParts = (typeof asOfDateStr === 'string' ? asOfDateStr.split('T')[0] : new Date(asOfDateStr).toISOString().split('T')[0]).split('-');
  const asOfYear = parseInt(asOfParts[0], 10);
  const asOfMonth = parseInt(asOfParts[1], 10);
  const asOfDay = parseInt(asOfParts[2], 10);
  const asOfVal = asOfYear * 10000 + asOfMonth * 100 + asOfDay;

  let dueSoFar = 0;
  let nextDueDate = null;

  for (let i = 0; i < totalMonths; i++) {
    let year = startYear;
    let month = startMonth + i;
    while (month > 12) {
      year += 1;
      month -= 12;
    }
    // Days in target month (handles leap year and variable month lengths)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(startDay, daysInMonth);
    const dueDateVal = year * 10000 + month * 100 + day;
    const dueDateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    if (dueDateVal <= asOfVal) {
      dueSoFar++;
    } else if (!nextDueDate) {
      nextDueDate = dueDateStr;
    }
  }

  return { dueSoFar, nextDueDate };
}

/**
 * Calculates all loan, installment, pending overdue, and balance metrics for a customer loan row.
 * Strictly adheres to formulas established in LoanSummary.tsx and CustomerDetails.tsx.
 *
 * @param {object} row Raw database join row
 * @param {string} asOfDate Date string (YYYY-MM-DD)
 * @returns {object} Formatted and calculated record for Pending Collections
 */
function mapPendingCollectionRow(row, asOfDate = new Date().toISOString().split('T')[0]) {
  const totalInstallments = Math.max(0, parseInt(row.total_installments, 10) || 0);
  const installmentAmount = Math.max(0, parseFloat(row.installment_amount) || 0);
  const netPayable = parseFloat(row.net_payable) || 0;
  
  // Total Contractual Due: net_payable > 0 ? net_payable : (due_month * due_amount)
  // Matching LoanSummary.tsx line 37:
  // const totalAmount = netPayable > 0 ? netPayable : (dueMonthNum * dueAmount);
  const totalDue = netPayable > 0 ? netPayable : (totalInstallments * installmentAmount);
  
  // Total Successfully Paid: sum of payments where payment_status != 'cancelled' + active sub_dues
  // Matching CustomerDetails.tsx line 292
  const totalPaid = Math.max(0, parseFloat(row.total_paid) || 0);

  // Remaining Total Outstanding Loan Obligation (Balance):
  // Matching LoanSummary.tsx line 39:
  // const balanceAmount = Math.max(0, totalAmount - safeTotalPaid);
  const balance = Math.max(0, totalDue - totalPaid);

  // Number of installments fully paid
  const rawPaidInstallments = parseInt(row.installments_paid, 10) || 0;
  const installmentsPaid = Math.min(totalInstallments, Math.max(0, rawPaidInstallments));

  // Determine installments due so far up to asOfDate
  const firstDueDate = row.first_due_date || row.hp_date;
  const { dueSoFar, nextDueDate } = calculateInstallmentDueDates(firstDueDate, totalInstallments, asOfDate);

  // Contractual amount that should have been paid across all installments due by now:
  const amountDueSoFar = Math.min(totalDue, dueSoFar * installmentAmount);

  // Monthly Pending (Current Overdue Amount):
  // Overdue across installments whose due dates have passed, subtracting recognized payments.
  // Distinct from Total Outstanding Balance!
  const monthlyPending = Math.min(balance, Math.max(0, amountDueSoFar - totalPaid));

  // Default Amount:
  // Unpaid amount for installments overdue by > 1 cycle (> 30 days)
  const defaultDueSoFar = Math.max(0, dueSoFar - 1);
  const defaultAmountDueSoFar = Math.min(totalDue, defaultDueSoFar * installmentAmount);
  const defaultAmount = Math.min(balance, Math.max(0, defaultAmountDueSoFar - totalPaid));

  // Pending EMI count and Default EMI count
  const pendingEmi = Math.max(0, dueSoFar - installmentsPaid);
  const defaultEmi = Math.max(0, defaultDueSoFar - installmentsPaid);

  // HP Amount (Principal)
  const hpAmount = Math.max(0, parseFloat(row.hp_amount) || 0);

  // Collection Status Classification:
  // - 'close': loan is officially closed or balance is fully cleared
  // - 'pending': 2 or more missed EMIs (critical overdue)
  // - 'action': 1 missed EMI (collection follow-up needed)
  // - 'good': up-to-date on all due installments
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

  // Format deal type label ('Finance' or 'Consulting')
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
    lastPaymentDate: row.last_payment_date || null,
    nextDueDate: nextDueDate || null,
    totalEmi: totalInstallments,
    paidEmi: installmentsPaid,
    pendingEmi,
    defaultEmi,
    dueProgress: `${installmentsPaid}/${totalInstallments}`,
    totalDue,
    paid: totalPaid,
    pending: monthlyPending,
    balance,
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

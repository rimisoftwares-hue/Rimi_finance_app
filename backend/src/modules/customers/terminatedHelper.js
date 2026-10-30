/**
 * AutoFinex — Terminated Accounts Helper Module
 *
 * Implements authoritative business logic for identifying terminated/matured accounts,
 * calculating contractual final due dates, outstanding balances, and penalties
 * strictly reconciled with LoanSummary.tsx and CustomerDetails.tsx.
 */

/**
 * Calculates the contractual final installment due date from the first due date and loan tenure.
 * Correctly clamps month-end dates (e.g. 29th, 30th, 31st) across leap years and variable month lengths.
 *
 * Example:
 * - Start 2024-01-31, 2 months -> 2024-02-29 (leap year)
 * - Start 2023-01-31, 2 months -> 2023-02-28
 * - Start 2024-01-31, 4 months -> 2024-04-30
 * - Start 2024-01-31, 5 months -> 2024-05-31
 *
 * @param {string|Date} firstDueDateStr Starting due date (YYYY-MM-DD or Date)
 * @param {number} totalMonths Total loan tenure in months (due_month)
 * @returns {string|null} Contractual final due date (YYYY-MM-DD) or null
 */
function calculateContractualFinalDueDate(firstDueDateStr, totalMonths) {
  const months = parseInt(totalMonths, 10);
  if (!firstDueDateStr || isNaN(months) || months <= 0) {
    return null;
  }

  const str = typeof firstDueDateStr === 'string'
    ? firstDueDateStr.split('T')[0]
    : new Date(firstDueDateStr).toISOString().split('T')[0];

  const parts = str.split('-');
  const startYear = parseInt(parts[0], 10);
  const startMonth = parseInt(parts[1], 10);
  const startDay = parseInt(parts[2], 10);

  if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay)) {
    return null;
  }

  // The final scheduled installment index is (months - 1)
  const lastIndex = months - 1;
  let targetYear = startYear;
  let targetMonth = startMonth + lastIndex;

  while (targetMonth > 12) {
    targetYear += 1;
    targetMonth -= 12;
  }

  // Determine maximum days in the target month (1-indexed month in UTC)
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(startDay, daysInMonth);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/**
 * Evaluates a customer loan record to check if it qualifies as a terminated/matured account,
 * and performs authoritative calculations conforming to LoanSummary.tsx.
 *
 * @param {object} row Raw database row from customers left joined with loans, vehicle, payments
 * @param {string} asOfDate Evaluation date (YYYY-MM-DD)
 * @returns {object} Evaluated record with isTerminated flag and financial metrics
 */
function evaluateTerminatedAccount(row, asOfDate = new Date().toISOString().split('T')[0]) {
  const tenureMonths = Math.max(0, parseInt(row.due_month, 10) || 0);
  const installmentAmount = Math.max(0, parseFloat(row.due_amount) || 0);
  const netPayable = Math.max(0, parseFloat(row.net_payable) || 0);

  // Authoritative Total Due calculation (LoanSummary.tsx line 37)
  const totalDue = netPayable > 0 ? netPayable : (tenureMonths * installmentAmount);

  // Authoritative Total Paid calculation (CustomerDetails.tsx line 292)
  const totalPaid = Math.max(0, parseFloat(row.total_paid) || 0);

  // Remaining Total Outstanding Loan Balance (LoanSummary.tsx line 39)
  const outstandingAmount = Math.max(0, totalDue - totalPaid);

  // Contractual final due date from initial schedule
  const initialDueDate = row.due_date || row.hp_date;
  const contractualFinalDueDate = calculateContractualFinalDueDate(initialDueDate, tenureMonths);

  // Check termination eligibility
  const isStatusClosed = row.loan_status === 'close';
  const isStatusSeized = row.loan_status === 'seized';
  const isCancellationApproved = row.cancellation_status === 'approved' || row.cancellation_status === 'processed';
  const isContractMatured = !!(contractualFinalDueDate && contractualFinalDueDate <= asOfDate);

  const isTerminated = isStatusClosed || isStatusSeized || isCancellationApproved || isContractMatured;

  if (!isTerminated) {
    return {
      isTerminated: false,
      customerId: row.customer_id
    };
  }

  // Penalty Calculation adhering to LoanSummary.tsx lines 41-45:
  // penaltyAmount is per-day penalty rate
  const penaltyRate = Math.max(0, parseFloat(row.penalty_amount) || 0);
  const storedPenaltyDays = Math.max(0, parseInt(row.penalty_days, 10) || 0);
  const totalPenaltyPaid = Math.max(0, parseFloat(row.total_penalty_paid) || 0);

  // Calculate days overdue based on contractual final due date when balance > 0
  let daysOverdue = 0;
  if (contractualFinalDueDate && asOfDate > contractualFinalDueDate && outstandingAmount > 0) {
    const dueTime = new Date(contractualFinalDueDate).getTime();
    const asOfTime = new Date(asOfDate).getTime();
    daysOverdue = Math.max(0, Math.floor((asOfTime - dueTime) / (1000 * 60 * 60 * 24)));
  } else if (isStatusSeized && row.seizing_date) {
    const seizeTime = new Date(row.seizing_date).getTime();
    const asOfTime = new Date(asOfDate).getTime();
    daysOverdue = Math.max(0, Math.floor((asOfTime - seizeTime) / (1000 * 60 * 60 * 24)));
  }

  // Effective penalty days: stored penalty days or overdue duration if penalty rate > 0
  const effectivePenaltyDays = Math.max(storedPenaltyDays, (daysOverdue > 0 && penaltyRate > 0) ? daysOverdue : 0);
  const totalPenaltyAccrued = penaltyRate * effectivePenaltyDays;
  const outstandingPenalty = Math.max(0, totalPenaltyAccrued - totalPenaltyPaid);

  // Determine actual termination date and reason/status
  let actualTerminationDate = null;
  let terminationStatus = 'Terminated';
  let terminationReason = '—';

  if (isStatusClosed) {
    terminationStatus = 'Closed';
    terminationReason = row.cancellation_reason || (outstandingAmount === 0 ? 'Loan Settled / Paid Off' : 'Account Closed');
    actualTerminationDate = row.cancellation_processed_at || row.customer_updated_at || contractualFinalDueDate || null;
  } else if (isStatusSeized) {
    terminationStatus = 'Seized';
    terminationReason = row.seizing_description || 'Vehicle Seized';
    actualTerminationDate = row.seizing_date || row.customer_updated_at || null;
  } else if (isCancellationApproved) {
    terminationStatus = 'Cancelled';
    terminationReason = row.cancellation_reason || 'Cancellation Approved';
    actualTerminationDate = row.cancellation_processed_at || null;
  } else if (isContractMatured) {
    if (outstandingAmount <= 0) {
      terminationStatus = 'Completed';
      terminationReason = 'Tenure Completed (Fully Paid)';
    } else {
      terminationStatus = 'Matured';
      terminationReason = 'Contract Matured (Pending Balance)';
    }
    actualTerminationDate = contractualFinalDueDate;
  }

  // Format Dates cleanly to YYYY-MM-DD
  const formatIsoDate = (d) => {
    if (!d) return null;
    if (typeof d === 'string') return d.split('T')[0];
    try {
      return new Date(d).toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  const finalDueClean = formatIsoDate(contractualFinalDueDate);
  const termDateClean = formatIsoDate(actualTerminationDate) || finalDueClean;

  // Account identifier: use authentic stored hplno (e.g. HPL 1 or HPL-0001)
  const accountNumber = row.hplno ? `HPL ${row.hplno}` : '—';

  // Vehicle display string
  const vehicleModel = [row.brand, row.model_name].filter(Boolean).join(' ') || row.vehicle_modal || '—';
  const vehicleRegistration = row.vehicle_number || '—';

  return {
    isTerminated: true,
    id: `terminated-${row.customer_id}`,
    customerId: String(row.customer_id),
    loanId: row.loan_id ? String(row.loan_id) : null,
    customerName: row.cname || '—',
    accountNumber,
    hplno: row.hplno !== undefined && row.hplno !== null ? Number(row.hplno) : null,
    phone: row.phone || '—',
    photoUrl: row.signed_photo_url || row.photo_url || null,
    vehicleRegistration,
    vehicleModel,
    vehicleDisplay: vehicleRegistration !== '—' && vehicleModel !== '—'
      ? `${vehicleModel} (${vehicleRegistration})`
      : (vehicleRegistration !== '—' ? vehicleRegistration : vehicleModel),
    brokerName: row.broker_name || '—',
    contractualFinalDueDate: finalDueClean,
    actualTerminationDate: termDateClean,
    daysOverdue,
    outstandingAmount: Math.round(outstandingAmount * 100) / 100,
    penaltyAmount: Math.round(outstandingPenalty * 100) / 100,
    totalPenaltyAccrued: Math.round(totalPenaltyAccrued * 100) / 100,
    totalPenaltyPaid: Math.round(totalPenaltyPaid * 100) / 100,
    penaltyRate,
    totalDue: Math.round(totalDue * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    tenureMonths,
    installmentAmount,
    terminationStatus,
    terminationReason,
    street: row.street || row.street_name || '—',
    village: row.village || '—',
    city: row.city || '—',
    state: row.state || '—'
  };
}

/**
 * Filters a list of evaluated terminated accounts using combined multi-field criteria.
 *
 * @param {Array<object>} records List of evaluated terminated accounts
 * @param {object} filters Query filter object
 * @returns {Array<object>} Filtered records
 */
function filterTerminatedAccounts(records, filters = {}) {
  const {
    search,
    broker,
    street,
    village,
    city,
    state,
    dueMin,
    dueMax,
    dateFrom,
    dateTo,
    dateType = 'any', // 'contractual', 'actual', or 'any'
    status
  } = filters;

  const searchNormalized = (search || '').trim().toLowerCase();
  const brokerNormalized = (broker || '').trim().toLowerCase();
  const streetNormalized = (street || '').trim().toLowerCase();
  const villageNormalized = (village || '').trim().toLowerCase();
  const cityNormalized = (city || '').trim().toLowerCase();
  const stateNormalized = (state || '').trim().toLowerCase();
  const statusNormalized = (status || '').trim().toLowerCase();

  const minDue = dueMin !== undefined && dueMin !== '' && !isNaN(Number(dueMin)) ? Number(dueMin) : null;
  const maxDue = dueMax !== undefined && dueMax !== '' && !isNaN(Number(dueMax)) ? Number(dueMax) : null;

  return records.filter(rec => {
    // 1. Global search across customer name, account number, phone, vehicle reg, vehicle model
    if (searchNormalized) {
      const matchName = rec.customerName.toLowerCase().includes(searchNormalized);
      const matchAcc = rec.accountNumber.toLowerCase().includes(searchNormalized);
      const matchHpl = rec.hplno !== null && String(rec.hplno).toLowerCase().includes(searchNormalized);
      const matchPhone = rec.phone.toLowerCase().includes(searchNormalized);
      const matchVehReg = rec.vehicleRegistration.toLowerCase().includes(searchNormalized);
      const matchVehModel = rec.vehicleModel.toLowerCase().includes(searchNormalized);
      if (!matchName && !matchAcc && !matchHpl && !matchPhone && !matchVehReg && !matchVehModel) {
        return false;
      }
    }

    // 2. Broker filter
    if (brokerNormalized && brokerNormalized !== 'all') {
      if (rec.brokerName.toLowerCase() !== brokerNormalized) {
        return false;
      }
    }

    // 3. Street filter
    if (streetNormalized && streetNormalized !== 'all') {
      if (rec.street.toLowerCase() !== streetNormalized) {
        return false;
      }
    }

    // 4. Village filter
    if (villageNormalized && villageNormalized !== 'all') {
      if (rec.village.toLowerCase() !== villageNormalized) {
        return false;
      }
    }

    // 5. City filter
    if (cityNormalized && cityNormalized !== 'all') {
      if (rec.city.toLowerCase() !== cityNormalized) {
        return false;
      }
    }

    // 6. State filter
    if (stateNormalized && stateNormalized !== 'all') {
      if (rec.state.toLowerCase() !== stateNormalized) {
        return false;
      }
    }

    // 7. Outstanding due minimum
    if (minDue !== null) {
      if (rec.outstandingAmount < minDue) {
        return false;
      }
    }

    // 8. Outstanding due maximum
    if (maxDue !== null) {
      if (rec.outstandingAmount > maxDue) {
        return false;
      }
    }

    // 9. Date Range Filter
    if (dateFrom || dateTo) {
      const datesToCheck = [];
      if (dateType === 'contractual') {
        if (rec.contractualFinalDueDate) datesToCheck.push(rec.contractualFinalDueDate);
      } else if (dateType === 'actual') {
        if (rec.actualTerminationDate) datesToCheck.push(rec.actualTerminationDate);
      } else {
        // 'any' checks if either date falls within range
        if (rec.actualTerminationDate) datesToCheck.push(rec.actualTerminationDate);
        if (rec.contractualFinalDueDate && !datesToCheck.includes(rec.contractualFinalDueDate)) {
          datesToCheck.push(rec.contractualFinalDueDate);
        }
      }

      if (datesToCheck.length === 0) {
        return false;
      }

      const inRange = datesToCheck.some(d => {
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });

      if (!inRange) {
        return false;
      }
    }

    // 10. Status / Reason filter
    if (statusNormalized && statusNormalized !== 'all') {
      const matchStatus = rec.terminationStatus.toLowerCase() === statusNormalized;
      const matchReason = rec.terminationReason.toLowerCase().includes(statusNormalized);
      if (!matchStatus && !matchReason) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Computes aggregate summary totals across a set of terminated accounts.
 *
 * @param {Array<object>} records
 * @returns {object} Summary KPI totals
 */
function computeTerminatedAggregates(records) {
  let totalOutstanding = 0;
  let totalPenalty = 0;
  let overdueAccountsCount = 0;

  for (const r of records) {
    totalOutstanding += r.outstandingAmount || 0;
    totalPenalty += r.penaltyAmount || 0;
    if ((r.daysOverdue > 0 && r.outstandingAmount > 0) || r.daysOverdue > 0) {
      overdueAccountsCount++;
    }
  }

  return {
    totalTerminated: records.length,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalPenalty: Math.round(totalPenalty * 100) / 100,
    overdueAccounts: overdueAccountsCount
  };
}

/**
 * Extracts unique, sorted options for all filter dropdowns from real database records.
 *
 * @param {Array<object>} records
 * @returns {object} Filter dropdown option lists
 */
function extractTerminatedFilterOptions(records) {
  const brokers = new Set();
  const streets = new Set();
  const villages = new Set();
  const cities = new Set();
  const states = new Set();
  const statuses = new Set();

  for (const r of records) {
    if (r.brokerName && r.brokerName !== '—') brokers.add(r.brokerName);
    if (r.street && r.street !== '—') streets.add(r.street);
    if (r.village && r.village !== '—') villages.add(r.village);
    if (r.city && r.city !== '—') cities.add(r.city);
    if (r.state && r.state !== '—') states.add(r.state);
    if (r.terminationStatus && r.terminationStatus !== '—') statuses.add(r.terminationStatus);
  }

  return {
    brokers: Array.from(brokers).sort((a, b) => a.localeCompare(b)),
    streets: Array.from(streets).sort((a, b) => a.localeCompare(b)),
    villages: Array.from(villages).sort((a, b) => a.localeCompare(b)),
    cities: Array.from(cities).sort((a, b) => a.localeCompare(b)),
    states: Array.from(states).sort((a, b) => a.localeCompare(b)),
    statuses: Array.from(statuses).sort((a, b) => a.localeCompare(b))
  };
}

module.exports = {
  calculateContractualFinalDueDate,
  evaluateTerminatedAccount,
  filterTerminatedAccounts,
  computeTerminatedAggregates,
  extractTerminatedFilterOptions
};

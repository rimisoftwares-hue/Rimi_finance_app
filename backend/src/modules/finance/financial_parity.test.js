'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveIstDateString,
  clampedInstallmentDate,
  aggregateValidPaymentLedger,
  computeAuthoritativeLoanLedger,
  rollupCustomerLoanLedgers,
} = require('./financialCalculation.service');
const { computeLoanMetrics, scoreCustomer, distanceRisk } = require('../risk/risk.scoring');
const { mapPendingCollectionRow } = require('../customers/pendingCollectionsHelper');
const { computeBusinessReport } = require('../accounting/reports/business.calculator');

test('Phase 1 — Authoritative Financial Calculation & Cross-Module Parity Suite (12+ Edge Cases)', async (t) => {
  await t.test('Case 1: One overdue EMI (offset = 1..due_month from loans.due_date anchor)', () => {
    const ledger = computeAuthoritativeLoanLedger({
      loanId: 'loan-case-1',
      customerId: 'cust-case-1',
      loanStatus: 'active',
      loanAmount: 50000,
      dueDate: '2026-09-15', // Month-0 anchor -> EMI #1 = 2026-10-15, EMI #2 = 2026-11-15
      hpDate: '2026-09-12',
      dueMonth: 12,
      dueAmount: 5000,
      netPayable: 60000,
      validEmiPaid: 0,
      asOfDate: '2026-11-12',
    });

    assert.equal(ledger.maturedInstallments, 1);
    assert.equal(ledger.pendingEmiCount, 1);
    assert.equal(ledger.currentOverdueEmiAmount, 5000);
    assert.equal(ledger.earliestUnpaidDueDate, '2026-10-15');
    assert.equal(ledger.overdueDays, 28);
    assert.equal(ledger.nextEmiDueDate, '2026-11-15');
    assert.equal(ledger.remainingScheduledEmiAmount, 60000);
    assert.equal(ledger.totalOutstandingLoanBalance, 60000);
  });

  await t.test('Case 2: Multiple overdue EMIs (HPL #2 live regression — due_date prioritized over hp_date, no 30-day division)', () => {
    const input = {
      loanId: 'loan-hpl-2',
      customerId: 'cust-hpl-2',
      loanStatus: 'active',
      loanAmount: 180000,
      hpAmount: 180000,
      hpDate: '2026-03-05',
      dueDate: '2026-09-06', // EMI #1 = 2026-10-06, EMI #2 = 2026-11-06, EMI #3 = 2026-12-06
      dueMonth: 12,
      dueAmount: 18000,
      netPayable: 216000,
      validEmiPaid: 0,
      totalPaid: 0,
      asOfDate: '2026-11-12',
    };

    const ledger = computeAuthoritativeLoanLedger(input);
    assert.equal(ledger.maturedInstallments, 2);
    assert.equal(ledger.pendingEmiCount, 2);
    assert.equal(ledger.currentOverdueEmiAmount, 36000);
    assert.equal(ledger.earliestUnpaidDueDate, '2026-10-06');
    assert.equal(ledger.overdueDays, 37);
    assert.equal(ledger.remainingScheduledEmiAmount, 216000);

    // Risk scoring engine must produce the EXACT same overdue days & overdue amount (not 222d / ₹1,44,000!)
    const scored = scoreCustomer(input, { totalPayments: 0, onTimePayments: 0 });
    assert.equal(scored.metrics.overdueDays, 37);
    assert.equal(scored.metrics.overdueAmount, 36000);
    assert.equal(scored.metrics.missedEmis, 2);
    assert.equal(scored.riskLevel, 'high');
  });

  await t.test('Case 3: Partially paid EMI (HPL #1 live regression — ₹19,000 paid across 3 EMIs + ₹1,000 partial on EMI #4)', () => {
    const input = {
      loanId: 'loan-hpl-1',
      customerId: 'cust-hpl-1',
      loanStatus: 'active',
      loanAmount: 50000,
      hpAmount: 50000,
      hpDate: '2026-03-05',
      dueDate: '2026-03-07', // EMI #1=Apr 7, #2=May 7, #3=Jun 7, #4=Jul 7, #5=Aug 7, #6=Sep 7, #7=Oct 7, #8=Nov 7
      dueMonth: 10,
      dueAmount: 6000,
      netPayable: 60000,
      validEmiPaid: 19000, // 3*6000 + 1000 partial on Jul 7 -> 5000 shortfall + 4*6000 = 29000
      totalPaid: 19000,
      asOfDate: '2026-11-12',
    };

    const ledger = computeAuthoritativeLoanLedger(input);
    assert.equal(ledger.maturedInstallments, 8);
    assert.equal(ledger.installmentsCovered, 3);
    assert.equal(ledger.partialShortfallAmount, 5000);
    assert.equal(ledger.currentOverdueEmiAmount, 29000);
    assert.equal(ledger.pendingEmiCount, 5);
    assert.equal(ledger.earliestUnpaidDueDate, '2026-07-07');
    assert.equal(ledger.overdueDays, 128);
    assert.equal(ledger.remainingScheduledEmiAmount, 41000);
    assert.equal(ledger.totalOutstandingLoanBalance, 41000);
    assert.equal(
      Math.round((ledger.outstandingPrincipal + ledger.outstandingInterest) * 100) / 100,
      ledger.remainingScheduledEmiAmount
    );

    // Cross-check Risk & PendingCollectionsHelper parity on HPL #1
    const riskMetrics = computeLoanMetrics(input);
    assert.equal(riskMetrics.overdueDays, 128);
    assert.equal(riskMetrics.overdueAmount, 29000);
    assert.equal(riskMetrics.pendingAmount, 41000);

    const pcRow = mapPendingCollectionRow(
      {
        customer_id: 'cust-hpl-1',
        loan_id: 'loan-hpl-1',
        hplno: 1,
        loan_status: 'active',
        total_installments: 10,
        installment_amount: 6000,
        net_payable: 60000,
        hp_amount: 50000,
        hp_date: '2026-03-05',
        first_due_date: '2026-03-07',
        total_paid: 19000,
      },
      '2026-11-12'
    );
    assert.equal(pcRow.pending, 29000);
    assert.equal(pcRow.balance, 41000);
    assert.equal(pcRow.overdueDays, 128);
  });

  await t.test('Case 4: Fully paid current EMIs -> 0 overdue amount & 0 overdue days', () => {
    const ledger = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      dueDate: '2026-08-10', // EMI #1=Sep 10, #2=Oct 10, #3=Nov 10
      dueMonth: 12,
      dueAmount: 5000,
      netPayable: 60000,
      validEmiPaid: 15000,
      asOfDate: '2026-11-12',
    });

    assert.equal(ledger.maturedInstallments, 3);
    assert.equal(ledger.installmentsCovered, 3);
    assert.equal(ledger.currentOverdueEmiAmount, 0);
    assert.equal(ledger.overdueDays, 0);
    assert.equal(ledger.pendingEmiCount, 0);
    assert.equal(ledger.earliestUnpaidDueDate, null);
    assert.equal(ledger.nextEmiDueDate, '2026-12-10');
    assert.equal(ledger.remainingScheduledEmiAmount, 45000);
  });

  await t.test('Case 5: Cancelled / reversed payments and cancelled sub_due rows are strictly excluded', () => {
    const agg = aggregateValidPaymentLedger(
      [
        { id: 'p1', amount: 6000, penalty: 0, payment_status: 'active', payment_date: '2026-09-07' },
        { id: 'p2', amount: 6000, penalty: 200, payment_status: 'cancelled', payment_date: '2026-10-07' },
        { id: 'p3', amount: 2000, penalty: 150, status: 'partial', payment_status: 'active', payment_date: '2026-10-10' },
      ],
      [
        { id: 'sd1', payment_id: 'p3', paid_amount: 1500, status: 'active' },
        { id: 'sd2', payment_id: 'p3', paid_amount: 2500, status: 'cancelled' },
        { id: 'sd3', payment_id: 'p2', paid_amount: 1000, status: 'active', parent_payment_status: 'cancelled' },
      ]
    );

    assert.equal(agg.validEmiPaid, 9500); // 6000 + 2000 + 1500 (cancelled p2, sd2, sd3 excluded)
    assert.equal(agg.totalPenaltyPaid, 150); // 200 on cancelled p2 excluded
    assert.equal(agg.totalAmountPaid, 9650);
  });

  await t.test('Case 6: Customer with pending penalty separates EMI overdue from penalty & adds to total balance', () => {
    const ledger = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      loanAmount: 40000,
      dueDate: '2026-08-10',
      dueMonth: 10,
      dueAmount: 5000,
      netPayable: 50000,
      validEmiPaid: 5000, // Covers Sep 10; Oct 10 & Nov 10 unpaid = 10000
      loanPenaltyAmount: 1500,
      pendingPenaltiesTableSum: 1500,
      totalPenaltyPaid: 0,
      asOfDate: '2026-11-12',
    });

    assert.equal(ledger.currentOverdueEmiAmount, 10000);
    assert.equal(ledger.outstandingPenaltyAmount, 1500);
    assert.equal(ledger.remainingScheduledEmiAmount, 45000);
    assert.equal(ledger.totalOutstandingLoanBalance, 46500);
    assert.equal(ledger.remainingAmountPayable, 46500);
  });

  await t.test('Case 7: Customer with paid penalty never subtracts penalty payment from scheduled EMI balance', () => {
    const ledger = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      loanAmount: 40000,
      dueDate: '2026-09-10',
      dueMonth: 10,
      dueAmount: 5000,
      netPayable: 50000,
      validEmiPaid: 5000, // Oct 10 paid; Nov 10 unpaid
      loanPenaltyAmount: 800,
      totalPenaltyPaid: 800,
      asOfDate: '2026-11-12',
    });

    assert.equal(ledger.validEmiPaid, 5000);
    assert.equal(ledger.totalPenaltyPaid, 800);
    assert.equal(ledger.totalAmountPaid, 5800);
    assert.equal(ledger.outstandingPenaltyAmount, 0);
    assert.equal(ledger.remainingScheduledEmiAmount, 45000);
    assert.equal(ledger.currentOverdueEmiAmount, 5000);
    assert.equal(ledger.totalOutstandingLoanBalance, 45000);
  });

  await t.test('Case 8: Customer with multiple loans evaluates each loan independently and rolls up accurately', () => {
    const loanA = computeAuthoritativeLoanLedger({
      loanId: 'loan-a',
      customerId: 'cust-multi',
      loanStatus: 'active',
      dueDate: '2026-08-28', // EMI #1=Sep 28, #2=Oct 28 -> 2 unpaid = 12000, 45d overdue
      dueMonth: 8,
      dueAmount: 6000,
      netPayable: 48000,
      validEmiPaid: 0,
      asOfDate: '2026-11-12',
    });
    const loanB = computeAuthoritativeLoanLedger({
      loanId: 'loan-b',
      customerId: 'cust-multi',
      loanStatus: 'active',
      dueDate: '2026-09-30', // EMI #1=Oct 30 -> 1 unpaid = 5000, 13d overdue
      dueMonth: 12,
      dueAmount: 5000,
      netPayable: 60000,
      validEmiPaid: 0,
      asOfDate: '2026-11-12',
    });

    const rollup = rollupCustomerLoanLedgers([loanA, loanB]);
    assert.equal(rollup.primaryLoanId, 'loan-a');
    assert.equal(rollup.currentOverdueEmiAmount, 17000);
    assert.equal(rollup.overdueDays, 45);
    assert.equal(rollup.earliestUnpaidDueDate, '2026-09-28');
    assert.equal(rollup.remainingScheduledEmiAmount, 108000);
    assert.equal(rollup.totalOutstandingLoanBalance, 108000);
    assert.equal(rollup.overdueLoanCount, 2);
  });

  await t.test('Case 9: Future EMI / Oct 31–Nov 8 brand-new loans have 0 overdue days & ₹0 overdue balance', () => {
    const oct31Loan = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      dueDate: '2026-10-31', // Clamped EMI #1 = 2026-11-30 (> 2026-11-12!)
      hpDate: '2026-10-31',
      dueMonth: 12,
      dueAmount: 7500,
      netPayable: 90000,
      validEmiPaid: 0,
      asOfDate: '2026-11-12',
    });

    assert.equal(clampedInstallmentDate('2026-10-31', 1), '2026-11-30');
    assert.equal(clampedInstallmentDate('2026-10-31', 4), '2027-02-28');
    assert.equal(oct31Loan.maturedInstallments, 0);
    assert.equal(oct31Loan.currentOverdueEmiAmount, 0);
    assert.equal(oct31Loan.overdueDays, 0);
    assert.equal(oct31Loan.pendingEmiCount, 0);
    assert.equal(oct31Loan.earliestUnpaidDueDate, null);
    assert.equal(oct31Loan.nextEmiDueDate, '2026-11-30');
    assert.equal(oct31Loan.remainingScheduledEmiAmount, 90000);
  });

  await t.test('Case 10: Closed loan or zero remaining balance reports 0 overdue and 0 total balance', () => {
    const closedLoan = computeAuthoritativeLoanLedger({
      loanStatus: 'close',
      dueDate: '2026-01-10',
      dueMonth: 12,
      dueAmount: 5000,
      netPayable: 60000,
      validEmiPaid: 40000,
      loanPenaltyAmount: 500,
      asOfDate: '2026-11-12',
    });

    assert.equal(closedLoan.currentOverdueEmiAmount, 0);
    assert.equal(closedLoan.overdueDays, 0);
    assert.equal(closedLoan.remainingScheduledEmiAmount, 0);
    assert.equal(closedLoan.totalOutstandingLoanBalance, 0);
    assert.equal(closedLoan.remainingAmountPayable, 0);
  });

  await t.test('Case 11: Asia/Kolkata midnight boundary (23:55 IST vs 00:05 IST) & due-today = 0 days overdue', () => {
    // 2026-11-11T18:25:00Z = 2026-11-11 23:55:00 IST
    const beforeMidnightIst = resolveIstDateString(new Date('2026-11-11T18:25:00.000Z'));
    // 2026-11-11T18:35:00Z = 2026-11-12 00:05:00 IST
    const afterMidnightIst = resolveIstDateString(new Date('2026-11-11T18:35:00.000Z'));

    assert.equal(beforeMidnightIst, '2026-11-11');
    assert.equal(afterMidnightIst, '2026-11-12');

    // Installment due on 2026-11-11 is NOT overdue at 23:55 IST on 2026-11-11, and becomes 1 day overdue at 00:05 IST on 2026-11-12
    const dueTodayLedger = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      dueDate: '2026-10-11', // EMI #1 = 2026-11-11
      dueMonth: 12,
      dueAmount: 4000,
      netPayable: 48000,
      validEmiPaid: 0,
      asOfDate: beforeMidnightIst,
    });
    assert.equal(dueTodayLedger.overdueDays, 0);
    assert.equal(dueTodayLedger.currentOverdueEmiAmount, 0);

    const nextDayLedger = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      dueDate: '2026-10-11', // EMI #1 = 2026-11-11
      dueMonth: 12,
      dueAmount: 4000,
      netPayable: 48000,
      validEmiPaid: 0,
      asOfDate: afterMidnightIst,
    });
    assert.equal(nextDayLedger.overdueDays, 1);
    assert.equal(nextDayLedger.currentOverdueEmiAmount, 4000);
  });

  await t.test('Case 12: Old unpaid EMIs + recent partial sub_due payments + post-maturity tenure cap', () => {
    const postMaturityLedger = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      dueDate: '2025-01-10', // 6-month tenure: Feb 10..Jul 10, 2025
      dueMonth: 6,
      dueAmount: 5000,
      netPayable: 30000,
      validEmiPaid: 12000, // Covers Feb 10, Mar 10 + ₹2,000 toward Apr 10
      asOfDate: '2026-11-12',
    });

    assert.equal(postMaturityLedger.maturedInstallments, 6, 'Never exceeds due_month tenure');
    assert.equal(postMaturityLedger.currentOverdueEmiAmount, 18000, 'Capped at remainingScheduledEmiAmount');
    assert.equal(postMaturityLedger.remainingScheduledEmiAmount, 18000);
    assert.equal(postMaturityLedger.earliestUnpaidDueDate, '2025-04-10');
    assert.equal(postMaturityLedger.nextEmiDueDate, null);
  });

  await t.test('Case 13: Zero fabricated distance risk when GPS is NULL', () => {
    assert.equal(distanceRisk(null), 0);
    assert.equal(distanceRisk(undefined), 0);
    assert.equal(distanceRisk(25), 50);
  });

  await t.test('Case 14: Interest-First / Custom Principal Paid overrides proportional approximation in ledger & business report', () => {
    // 1. aggregateValidPaymentLedger aggregates stored principal_amount & interest_amount excluding cancelled rows
    const agg = aggregateValidPaymentLedger(
      [
        { id: 'p1', amount: 3000, principal_amount: 2000, interest_amount: 1000, penalty: 0, status: 'partial', payment_status: 'active', payment_date: '2026-10-10' },
        { id: 'p2', amount: 6000, principal_amount: 5000, interest_amount: 1000, penalty: 0, status: 'paid', payment_status: 'cancelled', payment_date: '2026-10-12' },
      ],
      [
        { id: 'sd1', payment_id: 'p1', paid_amount: 3000, principal_amount: 3000, interest_amount: 0, status: 'active' },
        { id: 'sd2', payment_id: 'p1', paid_amount: 1000, principal_amount: 1000, interest_amount: 0, status: 'cancelled' },
      ]
    );
    assert.equal(agg.validEmiPaid, 6000);
    assert.equal(agg.validPrincipalPaid, 5000);
    assert.equal(agg.validInterestPaid, 1000);

    // 2. Partial Interest-First payment: ₹3,000 paid on ₹50,000 HP / ₹60,000 Net Payable (10 * ₹6,000, ₹1,000 interest/mo)
    // Interest-First paid = 2000P + 1000I -> outstandingPrincipal = 50000 - 2000 = 48000, outstandingInterest = 57000 - 48000 = 9000
    // (Whereas proportional ratio would have yielded 50000 - 2500 = 47500!)
    const ledgerWithActualPI = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      loanAmount: 50000,
      hpAmount: 50000,
      dueDate: '2026-09-10',
      dueMonth: 10,
      dueAmount: 6000,
      netPayable: 60000,
      validEmiPaid: 3000,
      validPrincipalPaid: 2000,
      asOfDate: '2026-11-12',
    });
    assert.equal(ledgerWithActualPI.remainingScheduledEmiAmount, 57000);
    assert.equal(ledgerWithActualPI.outstandingPrincipal, 48000);
    assert.equal(ledgerWithActualPI.outstandingInterest, 9000);

    // Fallback when validPrincipalPaid is undefined keeps proportional calculation
    const ledgerFallback = computeAuthoritativeLoanLedger({
      loanStatus: 'active',
      loanAmount: 50000,
      hpAmount: 50000,
      dueDate: '2026-09-10',
      dueMonth: 10,
      dueAmount: 6000,
      netPayable: 60000,
      validEmiPaid: 3000,
      asOfDate: '2026-11-12',
    });
    assert.equal(ledgerFallback.outstandingPrincipal, 47500);
    assert.equal(ledgerFallback.outstandingInterest, 9500);

    // 3. computeBusinessReport honors stored principalPaise & interestPaise directly
    const report = computeBusinessReport({
      loanMonthRows: [],
      paymentGroups: [
        {
          monthKey: '2026-11',
          loanId: 'loan-1',
          customerId: 'cust-1',
          amountPaise: 300000,
          principalPaise: 200000,
          interestPaise: 100000,
          penaltyPaise: 5000,
          handLoanPaise: 0,
          payment_status: 'active',
        },
      ],
      loansRatioById: {
        'loan-1': { principalRatio: 5 / 6, interestRatio: 1 / 6 },
      },
      from: '2026-11-01',
      to: '2026-11-30',
      earliestMonthKey: '2026-11',
      currentMonthKey: '2026-11',
    });
    const novRow = report.monthsByKey['2026-11'];
    assert.ok(novRow);
    assert.equal(novRow.principal, 2000);
    assert.equal(novRow.interest, 1000);
    assert.equal(novRow.defaultAmt, 50);
  });
});


const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateInstallmentDueDates,
  mapPendingCollectionRow,
} = require('./pendingCollectionsHelper');

describe('AutoFinex Pending Collections Calculations & Helpers', () => {

  test('calculateInstallmentDueDates handles null/empty/zero duration gracefully', () => {
    assert.deepEqual(calculateInstallmentDueDates(null, 12), { dueSoFar: 0, nextDueDate: null });
    assert.deepEqual(calculateInstallmentDueDates('2026-01-01', 0), { dueSoFar: 0, nextDueDate: null });
    assert.deepEqual(calculateInstallmentDueDates('invalid-date', 12), { dueSoFar: 0, nextDueDate: null });
  });

  test('calculateInstallmentDueDates correctly counts matured installments and finds next due date', () => {
    // 10-month loan starting 2026-03-05 evaluated at 2026-10-28
    // Dues: Mar 5, Apr 5, May 5, Jun 5, Jul 5, Aug 5, Sep 5, Oct 5 (8 dues passed)
    // Next due: Nov 5
    const res = calculateInstallmentDueDates('2026-03-05', 10, '2026-10-28');
    assert.equal(res.dueSoFar, 8);
    assert.equal(res.nextDueDate, '2026-11-05');
  });

  test('calculateInstallmentDueDates does not count future installments as matured', () => {
    // Starts in future on 2026-11-05
    const res = calculateInstallmentDueDates('2026-11-05', 12, '2026-10-28');
    assert.equal(res.dueSoFar, 0);
    assert.equal(res.nextDueDate, '2026-11-05');
  });

  test('calculateInstallmentDueDates caps matured count at total loan tenure', () => {
    // 6-month loan starting 2025-01-01 evaluated at 2026-10-28
    const res = calculateInstallmentDueDates('2025-01-01', 6, '2026-10-28');
    assert.equal(res.dueSoFar, 6);
    assert.equal(res.nextDueDate, null);
  });

  test('calculateInstallmentDueDates properly handles month-end date variations (e.g., 31st)', () => {
    const res = calculateInstallmentDueDates('2026-01-31', 3, '2026-04-15');
    // Jan 31, Feb 28, Mar 31 -> all 3 matured
    assert.equal(res.dueSoFar, 3);
  });

  test('mapPendingCollectionRow calculates progress, total due, paid, pending, balance according to LoanSummary', () => {
    const row = {
      customer_id: 'cust-uuid-1',
      loan_id: 'loan-uuid-1',
      hplno: 10,
      customer_name: 'Rajesh Kumar',
      loan_status: 'active',
      total_installments: '20',
      installment_amount: '2000',
      net_payable: '40000',
      total_paid: '16000',
      installments_paid: '8',
      first_due_date: '2026-01-01',
      hp_date: '2025-12-15',
      hp_amount: '30000',
      deal_type: 'finance',
      vehicle_number: 'TN38 AA 1111',
      vehicle_name: 'Hero Splendor',
      phone: '9876543210',
      street: 'Gandhi Road',
      village: 'Kappalur',
      city: 'Madurai',
      state: 'Tamil Nadu',
      broker_name: 'Broker Raj',
    };

    // Evaluated at 2026-10-28:
    // 10 installments matured (Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct) = 10 * 2000 = 20,000 due so far
    // Paid: 16,000
    // Monthly Pending (overdue): 20,000 - 16,000 = 4,000 (2 missed EMIs)
    // Outstanding Balance: 40,000 - 16,000 = 24,000
    const mapped = mapPendingCollectionRow(row, '2026-10-28');

    assert.equal(mapped.loanNo, 'HPL 10');
    assert.equal(mapped.totalEmi, 20);
    assert.equal(mapped.paidEmi, 8);
    assert.equal(mapped.dueProgress, '8/20');
    assert.equal(mapped.totalDue, 40000);
    assert.equal(mapped.paid, 16000);
    assert.equal(mapped.pending, 4000); // 2 missed EMIs
    assert.equal(mapped.balance, 24000); // Remaining total obligation
    assert.equal(mapped.defaultAmount, 2000); // Severely overdue (> 30 days)
    assert.equal(mapped.dealType, 'Finance');
    assert.equal(mapped.status, 'pending'); // 2 missed EMIs -> status is 'pending'
    assert.equal(mapped.hpAmount, 30000);
    assert.equal(mapped.hbAmount, 30000);
  });

  test('mapPendingCollectionRow marks closed loan with status close and balance 0', () => {
    const row = {
      customer_id: 'cust-uuid-2',
      loan_id: 'loan-uuid-2',
      hplno: 25,
      customer_name: 'Suresh Babu',
      loan_status: 'close',
      total_installments: '12',
      installment_amount: '3000',
      net_payable: '36000',
      total_paid: '36000',
      installments_paid: '12',
      first_due_date: '2025-01-01',
      hp_date: '2024-12-01',
      deal_type: 'consulting',
    };

    const mapped = mapPendingCollectionRow(row, '2026-10-28');
    assert.equal(mapped.dueProgress, '12/12');
    assert.equal(mapped.balance, 0);
    assert.equal(mapped.pending, 0);
    assert.equal(mapped.status, 'close');
    assert.equal(mapped.dealType, 'Consulting');
  });

  test('mapPendingCollectionRow handles new future loan with zero pending', () => {
    const row = {
      customer_id: 'cust-uuid-3',
      loan_id: 'loan-uuid-3',
      hplno: 50,
      customer_name: 'Priya Devi',
      loan_status: 'active',
      total_installments: '18',
      installment_amount: '4500',
      net_payable: '81000',
      total_paid: '0',
      installments_paid: '0',
      first_due_date: '2026-11-15',
      hp_date: '2026-11-15',
      deal_type: 'finance',
    };

    const mapped = mapPendingCollectionRow(row, '2026-10-28');
    assert.equal(mapped.dueProgress, '0/18');
    assert.equal(mapped.paid, 0);
    assert.equal(mapped.pending, 0); // No EMIs due yet!
    assert.equal(mapped.balance, 81000);
    assert.equal(mapped.status, 'good');
  });

  test('mapPendingCollectionRow treats partial payments correctly', () => {
    const row = {
      customer_id: 'cust-uuid-4',
      loan_id: 'loan-uuid-4',
      hplno: 75,
      customer_name: 'Kumar',
      loan_status: 'active',
      total_installments: '10',
      installment_amount: '5000',
      net_payable: '50000',
      total_paid: '3500', // Partial payment on 1st EMI
      installments_paid: '0',
      first_due_date: '2026-10-01',
      hp_date: '2026-09-15',
      deal_type: 'finance',
    };

    // 1 EMI due so far = 5,000. Paid: 3,500. Pending = 1,500
    const mapped = mapPendingCollectionRow(row, '2026-10-28');
    assert.equal(mapped.paid, 3500);
    assert.equal(mapped.pending, 1500);
    assert.equal(mapped.balance, 46500);
    assert.equal(mapped.status, 'action'); // 1 overdue EMI with partial payment
  });

  test('customer.routes.js registers GET /pending-collections endpoint with tenant security', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'customer.routes.js'), 'utf-8');
    assert.ok(content.includes("router.get('/pending-collections', enhancedCheckFinance,"), 'Must register /pending-collections route with enhancedCheckFinance');
    assert.ok(content.includes("mapPendingCollectionRow"), 'Must use mapPendingCollectionRow helper');
  });

});


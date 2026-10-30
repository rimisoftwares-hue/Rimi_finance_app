const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateContractualFinalDueDate,
  evaluateTerminatedAccount,
  filterTerminatedAccounts,
  computeTerminatedAggregates,
  extractTerminatedFilterOptions
} = require('./terminatedHelper');

test('AutoFinex Terminated Accounts Business Logic & Helper Tests', async (t) => {

  await t.test('calculateContractualFinalDueDate handles null, invalid, or zero tenure', () => {
    assert.equal(calculateContractualFinalDueDate(null, 10), null);
    assert.equal(calculateContractualFinalDueDate('2026-01-01', 0), null);
    assert.equal(calculateContractualFinalDueDate('2026-01-01', -5), null);
    assert.equal(calculateContractualFinalDueDate('not-a-date', 12), null);
  });

  await t.test('calculateContractualFinalDueDate computes exact date for 1-month tenure', () => {
    // 1 month tenure means final due date is the 1st installment date
    assert.equal(calculateContractualFinalDueDate('2026-03-06', 1), '2026-03-06');
  });

  await t.test('calculateContractualFinalDueDate calculates multi-month schedule accurately', () => {
    // 10-month tenure starting 2026-03-06 -> Month 10 is Dec 06, 2026
    assert.equal(calculateContractualFinalDueDate('2026-03-06', 10), '2026-12-06');
    // 12-month tenure starting 2026-10-25 -> Month 12 is Sep 25, 2027
    assert.equal(calculateContractualFinalDueDate('2026-10-25', 12), '2027-09-25');
  });

  await t.test('calculateContractualFinalDueDate correctly handles month-end clamping (Jan 31)', () => {
    // Leap year 2024: Jan 31 + 1 month (Month 2) -> Feb 29, 2024
    assert.equal(calculateContractualFinalDueDate('2024-01-31', 2), '2024-02-29');

    // Non-leap year 2023: Jan 31 + 1 month (Month 2) -> Feb 28, 2023
    assert.equal(calculateContractualFinalDueDate('2023-01-31', 2), '2023-02-28');

    // April has 30 days: Jan 31 + 3 months (Month 4) -> Apr 30, 2024
    assert.equal(calculateContractualFinalDueDate('2024-01-31', 4), '2024-04-30');

    // May has 31 days: Jan 31 + 4 months (Month 5) -> May 31, 2024
    assert.equal(calculateContractualFinalDueDate('2024-01-31', 5), '2024-05-31');

    // Schedule beginning on the 30th into February
    assert.equal(calculateContractualFinalDueDate('2026-01-30', 2), '2026-02-28');
  });

  await t.test('evaluateTerminatedAccount ignores active loans whose contractual maturity is in future', () => {
    const raw = {
      customer_id: 'cust-1',
      cname: 'Sanjay Rithik',
      hplno: 1,
      loan_status: 'active',
      due_date: '2026-03-06',
      due_month: 10, // ends 2026-12-06
      due_amount: '6000.00',
      net_payable: '60000.00',
      total_paid: '12000.00'
    };
    const res = evaluateTerminatedAccount(raw, '2026-10-28');
    assert.equal(res.isTerminated, false);
    assert.equal(res.customerId, 'cust-1');
  });

  await t.test('evaluateTerminatedAccount identifies contractually matured loan with outstanding balance', () => {
    // 10-month loan starting 2025-01-15 ends 2025-10-15; asOfDate is 2026-10-28
    const raw = {
      customer_id: 'cust-2',
      cname: 'Gopal Krishna',
      hplno: 5,
      loan_status: 'active',
      due_date: '2025-01-15',
      due_month: 10,
      due_amount: '3000.00',
      net_payable: '30000.00',
      total_paid: '21000.00', // 7 of 10 paid -> 3 unpaid = 9000
      penalty_amount: '10.00',
      penalty_days: 15,
      total_penalty_paid: '50.00',
      brand: 'Bajaj',
      model_name: 'CT 110',
      vehicle_number: 'TN 38 AB 1234',
      phone: '9876543210',
      broker_name: 'Ramesh'
    };
    const res = evaluateTerminatedAccount(raw, '2026-10-28');
    assert.equal(res.isTerminated, true);
    assert.equal(res.accountNumber, 'HPL 5');
    assert.equal(res.customerName, 'Gopal Krishna');
    assert.equal(res.contractualFinalDueDate, '2025-10-15');
    assert.equal(res.totalDue, 30000);
    assert.equal(res.totalPaid, 21000);
    assert.equal(res.outstandingAmount, 9000); // 3 unpaid installments = ₹9,000 as per user requirement!
    assert.ok(res.daysOverdue > 300);
    assert.equal(res.terminationStatus, 'Matured');
    assert.equal(res.vehicleModel, 'Bajaj CT 110');
    assert.equal(res.vehicleRegistration, 'TN 38 AB 1234');
    // Penalty is calculated separately and not merged into outstandingAmount
    assert.ok(res.penaltyAmount > 0);
  });

  await t.test('evaluateTerminatedAccount identifies officially closed loan', () => {
    const raw = {
      customer_id: 'cust-3',
      cname: 'Saritha Bai',
      hplno: 3,
      loan_status: 'close',
      due_date: '2026-01-10',
      due_month: 12,
      due_amount: '4000.00',
      net_payable: '48000.00',
      total_paid: '48000.00',
      penalty_amount: '0.00',
      cancellation_reason: 'Voluntary Settlement',
      cancellation_processed_at: '2026-06-15'
    };
    const res = evaluateTerminatedAccount(raw, '2026-10-28');
    assert.equal(res.isTerminated, true);
    assert.equal(res.terminationStatus, 'Closed');
    assert.equal(res.terminationReason, 'Voluntary Settlement');
    assert.equal(res.actualTerminationDate, '2026-06-15');
    assert.equal(res.outstandingAmount, 0);
    assert.equal(res.penaltyAmount, 0);
  });

  await t.test('evaluateTerminatedAccount identifies seized vehicle account', () => {
    const raw = {
      customer_id: 'cust-4',
      cname: 'Murugan S',
      hplno: 19,
      loan_status: 'seized',
      due_date: '2026-02-01',
      due_month: 12,
      due_amount: '5000.00',
      net_payable: '60000.00',
      total_paid: '15000.00',
      seizing_date: '2026-08-10',
      seizing_description: 'Vehicle seized due to consecutive defaults'
    };
    const res = evaluateTerminatedAccount(raw, '2026-10-28');
    assert.equal(res.isTerminated, true);
    assert.equal(res.terminationStatus, 'Seized');
    assert.equal(res.terminationReason, 'Vehicle seized due to consecutive defaults');
    assert.equal(res.actualTerminationDate, '2026-08-10');
    assert.equal(res.outstandingAmount, 45000);
  });

  await t.test('filterTerminatedAccounts filters by global search, broker, and amounts', () => {
    const records = [
      {
        id: '1',
        customerName: 'Gopal Krishna',
        accountNumber: 'HPL 5',
        hplno: 5,
        phone: '9876543210',
        vehicleRegistration: 'TN 38 AB 1234',
        vehicleModel: 'Bajaj CT 110',
        brokerName: 'Broker A',
        street: 'Gandhi Road',
        village: 'Kovaipudur',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        outstandingAmount: 9000,
        penaltyAmount: 500,
        contractualFinalDueDate: '2025-10-15',
        actualTerminationDate: '2025-10-15',
        terminationStatus: 'Matured',
        terminationReason: 'Contract Matured (Pending Balance)',
        daysOverdue: 378
      },
      {
        id: '2',
        customerName: 'Saritha Bai',
        accountNumber: 'HPL 3',
        hplno: 3,
        phone: '9845023456',
        vehicleRegistration: 'TN 37 C 5678',
        vehicleModel: 'Honda Activa',
        brokerName: 'Broker B',
        street: 'Main Bazaar',
        village: 'Sulur',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        outstandingAmount: 48000,
        penaltyAmount: 0,
        contractualFinalDueDate: '2026-01-10',
        actualTerminationDate: '2026-06-15',
        terminationStatus: 'Closed',
        terminationReason: 'Voluntary Settlement',
        daysOverdue: 0
      }
    ];

    // Search by vehicle model
    const searchRes = filterTerminatedAccounts(records, { search: 'Bajaj' });
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].customerName, 'Gopal Krishna');

    // Search by HPL number
    const hplRes = filterTerminatedAccounts(records, { search: 'HPL 3' });
    assert.equal(hplRes.length, 1);
    assert.equal(hplRes[0].customerName, 'Saritha Bai');

    // Filter by dueMin and dueMax
    const dueRes = filterTerminatedAccounts(records, { dueMin: 10000, dueMax: 50000 });
    assert.equal(dueRes.length, 1);
    assert.equal(dueRes[0].customerName, 'Saritha Bai');

    // Filter by status
    const statusRes = filterTerminatedAccounts(records, { status: 'Closed' });
    assert.equal(statusRes.length, 1);
    assert.equal(statusRes[0].customerName, 'Saritha Bai');

    // Combined multi-filter
    const combined = filterTerminatedAccounts(records, {
      broker: 'Broker A',
      dueMin: 5000,
      dueMax: 15000
    });
    assert.equal(combined.length, 1);
    assert.equal(combined[0].customerName, 'Gopal Krishna');
  });

  await t.test('computeTerminatedAggregates accurately totals outstanding and penalty without duplication', () => {
    const records = [
      { outstandingAmount: 9000, penaltyAmount: 500, daysOverdue: 10 },
      { outstandingAmount: 48000, penaltyAmount: 200, daysOverdue: 0 },
      { outstandingAmount: 0, penaltyAmount: 0, daysOverdue: 0 }
    ];
    const aggs = computeTerminatedAggregates(records);
    assert.equal(aggs.totalTerminated, 3);
    assert.equal(aggs.totalOutstanding, 57000);
    assert.equal(aggs.totalPenalty, 700);
    assert.equal(aggs.overdueAccounts, 1);
  });

  await t.test('extractTerminatedFilterOptions returns unique, sorted lists', () => {
    const records = [
      { brokerName: 'Zeta', street: 'Street B', village: 'Village 2', city: 'City Y', state: 'State B', terminationStatus: 'Matured' },
      { brokerName: 'Alpha', street: 'Street A', village: 'Village 1', city: 'City X', state: 'State A', terminationStatus: 'Closed' },
      { brokerName: 'Alpha', street: 'Street B', village: 'Village 1', city: 'City X', state: 'State A', terminationStatus: 'Matured' }
    ];
    const opts = extractTerminatedFilterOptions(records);
    assert.deepEqual(opts.brokers, ['Alpha', 'Zeta']);
    assert.deepEqual(opts.streets, ['Street A', 'Street B']);
    assert.deepEqual(opts.villages, ['Village 1', 'Village 2']);
    assert.deepEqual(opts.cities, ['City X', 'City Y']);
    assert.deepEqual(opts.states, ['State A', 'State B']);
    assert.deepEqual(opts.statuses, ['Closed', 'Matured']);
  });

  await t.test('customer.routes.js registers GET /terminated-accounts endpoint with enhancedCheckFinance', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'customer.routes.js'), 'utf-8');
    assert.ok(
      content.includes("router.get('/terminated-accounts', enhancedCheckFinance,"),
      'Must register /terminated-accounts route with enhancedCheckFinance'
    );
    assert.ok(
      content.includes('evaluateTerminatedAccount'),
      'Must call evaluateTerminatedAccount in route'
    );
  });
});


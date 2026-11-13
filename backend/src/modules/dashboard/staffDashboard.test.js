/**
 * Unit Tests for Staff Dashboard Service (`staffDashboard.service.js`)
 *
 * Uses Node's built-in `node:test` and `node:assert/strict` with 100% mocked data
 * (never touches the live PostgreSQL database).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeTrendPercent,
  computeTrendBadge,
  deriveMockCallStatus,
  formatDelay,
  deriveTaskRisk,
  mapCallHistoryRows,
  mapAssignedTasks,
  mapTodayVisits,
  mapTodayCollections,
  getStaffDashboardOverview,
} = require('./staffDashboard.service');

const {
  computePortfolioAndInsights,
  computeCustomerPendingSnapshot,
} = require('./homeDashboard.service');

test('computeTrendPercent handles yesterday > 0, yesterday = 0 & today > 0, both 0, and decrease', () => {
  // yesterday > 0 (increase)
  assert.equal(computeTrendPercent(30, 20), 50);
  assert.deepEqual(computeTrendBadge(30, 20), { value: 50, up: true });

  // yesterday = 0 & today > 0 -> 100%
  assert.equal(computeTrendPercent(15, 0), 100);
  assert.deepEqual(computeTrendBadge(15, 0), { value: 100, up: true });

  // both 0 -> 0%
  assert.equal(computeTrendPercent(0, 0), 0);
  assert.deepEqual(computeTrendBadge(0, 0), { value: 0, up: true });

  // decrease (today < yesterday)
  assert.equal(computeTrendPercent(15, 20), -25);
  assert.deepEqual(computeTrendBadge(15, 20), { value: 25, up: false });

  // today = 0, yesterday > 0 -> -100%
  assert.equal(computeTrendPercent(0, 25), -100);
  assert.deepEqual(computeTrendBadge(0, 25), { value: 100, up: false });
});

test('deriveMockCallStatus is deterministic and returns valid status for UUID and numeric IDs', () => {
  const validStatuses = new Set(['Connected', 'Not Connected', 'Follow-up']);

  const uuidId = '019a01b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
  const status1 = deriveMockCallStatus(uuidId);
  const status2 = deriveMockCallStatus(uuidId);
  assert.equal(status1, status2, 'Must be deterministic for identical UUID');
  assert.ok(validStatuses.has(status1), `Unexpected status: ${status1}`);

  const numericId = 98471;
  const numStatus1 = deriveMockCallStatus(numericId);
  const numStatus2 = deriveMockCallStatus(String(numericId));
  assert.equal(numStatus1, numStatus2, 'Must be deterministic for numeric ID');
  assert.ok(validStatuses.has(numStatus1), `Unexpected status: ${numStatus1}`);

  // Empty/null fallback still returns a valid status
  assert.ok(validStatuses.has(deriveMockCallStatus(null)));
  assert.ok(validStatuses.has(deriveMockCallStatus('')));
});

test('formatDelay formats 0, 5, 45 days and null due date accurately', () => {
  // 0 days -> "On time" (green income tone)
  assert.deepEqual(formatDelay(0), {
    days: 0,
    label: 'On time',
    tone: 'income',
  });

  // null / undefined / negative -> "On time"
  assert.deepEqual(formatDelay(null), {
    days: 0,
    label: 'On time',
    tone: 'income',
  });
  assert.deepEqual(formatDelay(undefined), {
    days: 0,
    label: 'On time',
    tone: 'income',
  });
  assert.deepEqual(formatDelay(-4), {
    days: 0,
    label: 'On time',
    tone: 'income',
  });

  // 5 days (1..30) -> "Overdue 5d" (amber pending tone)
  assert.deepEqual(formatDelay(5), {
    days: 5,
    label: 'Overdue 5d',
    tone: 'pending',
  });

  // 30 days boundary -> "Overdue 30d"
  assert.deepEqual(formatDelay(30), {
    days: 30,
    label: 'Overdue 30d',
    tone: 'pending',
  });

  // 45 days (> 30) -> "1m 15d delay" (red expense tone)
  assert.deepEqual(formatDelay(45), {
    days: 45,
    label: '1m 15d delay',
    tone: 'expense',
  });

  // 60 days -> "2m 0d delay"
  assert.deepEqual(formatDelay(60), {
    days: 60,
    label: '2m 0d delay',
    tone: 'expense',
  });
});

test('Agent scoping: role === "agent" with no rows gets empty assignedTasks and todayVisits, never everyone\'s rows', () => {
  const otherAgentRows = [
    {
      assignment_id: '019a0000-0000-7000-8000-000000000001',
      customer_id: '019a0000-0000-7000-8000-000000000011',
      agent_id: '019a0000-0000-7000-8000-000000000099', // belongs to another agent
      cname: 'Raj Kumar',
      hplno: 847,
      loan_status: 'active',
      due_amount: 5000,
      due_month: 12,
      hp_date: '2026-01-10',
      total_paid: 5000,
      city: 'Anna Nagar',
    },
  ];

  const otherAgentVisits = [
    {
      id: '019a0000-0000-7000-8000-000000000021',
      customer_id: '019a0000-0000-7000-8000-000000000011',
      user_id: '019a0000-0000-7000-8000-000000000099',
      cname: 'Raj Kumar',
      hplno: 847,
      meeting_location: 'Anna Nagar',
      status: 'visited',
    },
  ];

  const agentUserWithNoAssignments = {
    id: '019a0000-0000-7000-8000-000000000055',
    role: 'agent',
  };

  const tasksForAgent = mapAssignedTasks(
    otherAgentRows,
    new Map(),
    agentUserWithNoAssignments,
    '2026-04-15'
  );
  assert.equal(tasksForAgent.totalAssigned, 0);
  assert.deepEqual(tasksForAgent.items, []);

  const visitsForAgent = mapTodayVisits(
    otherAgentVisits,
    otherAgentRows,
    agentUserWithNoAssignments
  );
  assert.deepEqual(visitsForAgent, []);

  // Verify owner role sees all finance rows
  const ownerUser = {
    id: '019a0000-0000-7000-8000-000000000001',
    role: 'owner',
  };
  const tasksForOwner = mapAssignedTasks(
    otherAgentRows,
    new Map(),
    ownerUser,
    '2026-04-15'
  );
  assert.equal(tasksForOwner.totalAssigned, 1);
  assert.equal(tasksForOwner.items.length, 1);
  assert.equal(tasksForOwner.items[0].customer, 'Raj Kumar');
});

test('Customer with two vehicles yields strictly one call-history row per history_entry', () => {
  const duplicateVehicleRowsForOneHistoryEntry = [
    {
      id: '019a1111-2222-7333-8444-555555555555',
      customer_id: '019a0000-0000-7000-8000-000000000011',
      entry_type: 'call',
      message: 'Promised to pay by Friday',
      created_by: 'Karthik',
      formatted_date: '2026-04-15 10:30',
      cname: 'Suresh B',
      hplno: 101,
      vehicle_number: 'TN 01 AB 1234',
      brand: 'Honda',
      model_name: 'Activa 6G',
    },
    {
      id: '019a1111-2222-7333-8444-555555555555', // same history_entries.id joined to 2nd vehicle
      customer_id: '019a0000-0000-7000-8000-000000000011',
      entry_type: 'call',
      message: 'Promised to pay by Friday',
      created_by: 'Karthik',
      formatted_date: '2026-04-15 10:30',
      cname: 'Suresh B',
      hplno: 101,
      vehicle_number: 'TN 09 XY 9876',
      brand: 'TVS',
      model_name: 'Jupiter',
    },
  ];

  const mapped = mapCallHistoryRows(duplicateVehicleRowsForOneHistoryEntry);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].id, '019a1111-2222-7333-8444-555555555555');
  assert.equal(mapped[0].customer, 'Suresh B');
  assert.equal(mapped[0].hpl, 'HPL 101');
  assert.equal(mapped[0].type, 'Call');
  assert.equal(mapped[0].vehicle, 'Honda Activa 6G');
  assert.equal(mapped[0].vehicleNo, 'TN 01 AB 1234');
});

test('todayDues and unpaidCustomers match homeDashboard.service.js on the same fixture', async () => {
  const todayDateIST = '2026-04-15';
  const portfolioFixture = [
    // Customer 1: Open active loan with an installment due today (2026-04-15) and unpaid balance
    {
      customer_id: '019a0000-0000-7000-8000-000000000101',
      cname: 'Anand K',
      hplno: 101,
      loan_status: 'active',
      loan_id: '019a0000-0000-7000-8000-000000000201',
      hp_date: '2026-01-15',
      due_date: '2026-02-15',
      first_due_date: '2026-02-15',
      due_month: 12,
      total_installments: 12,
      due_amount: 4000,
      installment_amount: 4000,
      hp_amount: 40000,
      net_payable: 48000,
      total_paid: 4000, // 1 installment paid (Feb), Mar & Apr unpaid -> due on Apr 15
      payment_count: 1,
      on_time_count: 1,
    },
    // Customer 2: Open active loan, fully up to date as of today
    {
      customer_id: '019a0000-0000-7000-8000-000000000102',
      cname: 'Bala M',
      hplno: 102,
      loan_status: 'active',
      loan_id: '019a0000-0000-7000-8000-000000000202',
      hp_date: '2026-02-01',
      due_date: '2026-03-01',
      first_due_date: '2026-03-01',
      due_month: 10,
      total_installments: 10,
      due_amount: 3000,
      installment_amount: 3000,
      hp_amount: 25000,
      net_payable: 30000,
      total_paid: 6000, // Mar & Apr paid
      payment_count: 2,
      on_time_count: 2,
    },
    // Customer 3: Closed loan
    {
      customer_id: '019a0000-0000-7000-8000-000000000103',
      cname: 'Chitra S',
      hplno: 103,
      loan_status: 'close',
      loan_id: '019a0000-0000-7000-8000-000000000203',
      hp_date: '2025-01-10',
      due_date: '2025-02-10',
      first_due_date: '2025-02-10',
      due_month: 12,
      total_installments: 12,
      due_amount: 5000,
      installment_amount: 5000,
      hp_amount: 50000,
      net_payable: 60000,
      total_paid: 60000,
    },
  ];

  const homeResult = computePortfolioAndInsights(portfolioFixture, todayDateIST);
  const snapshotResult = computeCustomerPendingSnapshot(portfolioFixture, todayDateIST);

  assert.equal(snapshotResult.todayDues, homeResult.quickInsights.todaysDueCount);
  assert.equal(snapshotResult.unpaidCustomers, homeResult.unpaidCustomers);
  assert.equal(snapshotResult.pendingDues, homeResult.pendingDues);

  // Also verify getStaffDashboardOverview produces identical todayDues & unpaidCustomers
  const mockDb = {
    query: async (sql) => {
      if (sql.includes('today_receipts')) {
        return {
          rows: [
            {
              today_receipts: 4,
              yesterday_receipts: 2,
              today_collection: 16500,
              yesterday_collection: 11000,
            },
          ],
        };
      }
      if (sql.includes('closed_loans_today')) {
        return { rows: [{ closed_loans_today: 1 }] };
      }
      if (sql.includes('seized_vehicles_today')) {
        return { rows: [{ seized_vehicles_today: 2 }] };
      }
      if (sql.includes('today_reloans')) {
        return { rows: [{ today_reloans: 3, yesterday_reloans: 2 }] };
      }
      if (sql.includes('FROM history_entries')) {
        return { rows: [] };
      }
      if (sql.includes('total_assigned_count')) {
        return { rows: [] };
      }
      if (sql.includes('FROM staff_customer_visits')) {
        return { rows: [] };
      }
      if (sql.includes('has_visit_today')) {
        return { rows: [] };
      }
      if (sql.includes('delay_days')) {
        return { rows: [] };
      }
      // PORTFOLIO_RISK_SQL
      return { rows: portfolioFixture };
    },
  };

  const overview = await getStaffDashboardOverview(
    mockDb,
    '019a0000-0000-7000-8000-ffffffffffff',
    { id: '019a0000-0000-7000-8000-000000000001', role: 'owner' },
    { todayDateIST }
  );

  assert.equal(overview.kpis.todayDues, homeResult.quickInsights.todaysDueCount);
  assert.equal(overview.kpis.unpaidCustomers, homeResult.unpaidCustomers);
  assert.equal(overview.kpis.totalReceiptsToday, 4);
  assert.deepEqual(overview.kpis.totalReceiptsTrend, { value: 100, up: true });
  assert.equal(overview.kpis.collectedAmount, 16500);
  assert.deepEqual(overview.kpis.collectedAmountTrend, { value: 50, up: true });
  assert.equal(overview.kpis.closedLoans, 1);
  assert.equal(overview.kpis.seizedVehicles, 2);
  assert.equal(overview.kpis.reloanCount, 3);
  assert.deepEqual(overview.kpis.reloanCountTrend, { value: 50, up: true });
  assert.equal(overview.kpis.onlinePaymentsMock, '₹45K');
});

test('mapTodayVisits never emits "Missed" status and mapTodayCollections computes delay labels', () => {
  const visits = mapTodayVisits(
    [],
    [
      {
        id: 'a1',
        customer_id: 'c1',
        agent_id: 'ag1',
        cname: 'Customer Pending',
        hplno: 11,
        city: 'Porur',
        status: 'pending',
      },
      {
        id: 'a2',
        customer_id: 'c2',
        agent_id: 'ag1',
        cname: 'Customer Visited',
        hplno: 12,
        city: 'Guindy',
        status: 'visited',
      },
      {
        id: 'a3',
        customer_id: 'c3',
        agent_id: 'ag1',
        cname: 'Customer Failed',
        hplno: 13,
        city: 'Tambaram',
        status: 'failed',
      },
    ],
    { id: 'owner1', role: 'owner' }
  );

  assert.equal(visits.length, 2);
  assert.ok(visits.every((v) => v.status === 'Completed' || v.status === 'Pending'));

  const collections = mapTodayCollections([
    {
      id: 'p1',
      customer_id: 'c1',
      cname: 'OnTime Payer',
      hplno: 501,
      amount: 3500,
      penalty: 0,
      hand_loan: 0,
      bill_number: 'RCP-101',
      delay_days: 0,
    },
    {
      id: 'p2',
      customer_id: 'c2',
      cname: 'Late Payer',
      hplno: 502,
      amount: 4000,
      penalty: 200,
      hand_loan: 0,
      bill_number: 'RCP-102',
      delay_days: 45,
    },
  ]);

  assert.equal(collections.length, 2);
  assert.equal(collections[0].delayLabel, 'On time');
  assert.equal(collections[0].delayTone, 'income');
  assert.equal(collections[0].amount, 3500);
  assert.equal(collections[1].delayLabel, '1m 15d delay');
  assert.equal(collections[1].delayTone, 'expense');
  assert.equal(collections[1].amount, 4200);
});

test('GET /staff-overview route handler returns { success: true, ...overview } on 200 and 500 on error', async () => {
  const staffDashboardService = require('./staffDashboard.service');
  const dashboardRouter = require('./dashboard.routes');

  const origFn = staffDashboardService.getStaffDashboardOverview;
  try {
    // 1. 200 OK path
    const fakePayload = {
      asOfDate: '2026-04-15',
      kpis: {
        totalReceiptsToday: 5,
        totalReceiptsTrend: { value: 25, up: true },
        collectedAmount: 22000,
        collectedAmountTrend: { value: 10, up: true },
        closedLoans: 1,
        seizedVehicles: 0,
        reloanCount: 2,
        reloanCountTrend: { value: 100, up: true },
        todayDues: 7,
        unpaidCustomers: 19,
        onlinePaymentsMock: '₹45K',
      },
      todayCallHistory: [],
      assignedTasks: { totalAssigned: 0, items: [] },
      todayVisits: [],
      todayCollections: [],
    };

    let capturedFinanceId = null;
    let capturedUser = null;
    staffDashboardService.getStaffDashboardOverview = async (_db, financeId, user) => {
      capturedFinanceId = financeId;
      capturedUser = user;
      return fakePayload;
    };

    let statusCode = 200;
    let jsonBody = null;
    const req = {
      financeId: '019a0000-0000-7000-8000-ffffffffffff',
      user: { id: '019a0000-0000-7000-8000-000000000010', role: 'agent' },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonBody = payload;
        return this;
      },
    };

    await dashboardRouter.handleGetStaffOverview(req, res);
    assert.equal(statusCode, 200);
    assert.equal(capturedFinanceId, '019a0000-0000-7000-8000-ffffffffffff');
    assert.deepEqual(capturedUser, { id: '019a0000-0000-7000-8000-000000000010', role: 'agent' });
    assert.equal(jsonBody.success, true);
    assert.equal(jsonBody.kpis.totalReceiptsToday, 5);
    assert.equal(jsonBody.kpis.onlinePaymentsMock, '₹45K');

    // 2. 500 error path
    staffDashboardService.getStaffDashboardOverview = async () => {
      throw new Error('Simulated DB error');
    };
    statusCode = 200;
    jsonBody = null;
    await dashboardRouter.handleGetStaffOverview(req, res);
    assert.equal(statusCode, 500);
    assert.equal(jsonBody.success, false);
    assert.equal(jsonBody.error, 'Failed to fetch staff dashboard overview');
    assert.equal(jsonBody.details, 'Simulated DB error');
  } finally {
    staffDashboardService.getStaffDashboardOverview = origFn;
  }
});


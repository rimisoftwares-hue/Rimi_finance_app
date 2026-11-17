'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const homeDashboardService = require('./homeDashboard.service');
const {
  getHomeDashboardOverview,
  computePortfolioAndInsights,
  computeVehicleCounts,
  computeTodayCollection,
  computeCashInHand,
  computeMonthlyIncomeTrend,
  computeMonthlyOutcomeTrend,
  computeKpiTrendBadge,
} = homeDashboardService;
const dashboardRouter = require('./dashboard.routes');
const {
  computeLoanRatio,
  toPaise,
  fromPaise,
} = require('../accounting/reports/business.calculator');

test('Home Dashboard Service Unit Tests', async (t) => {
  const spine12 = [
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
  ];

  await t.test('1. excludes consulting loans from loanDist in monthly outcome', () => {
    const outcome = computeMonthlyOutcomeTrend(spine12, {
      loanRows: [
        { monthKey: '2026-10', hp_amount: 100000, loan_type: 'finance', deal_type: 'finance' },
        { monthKey: '2026-10', hp_amount: 50000, loan_type: 'two_wheeler', deal_type: 'finance' },
        { monthKey: '2026-10', hp_amount: 75000, loan_type: 'consulting', deal_type: 'finance' },
        { monthKey: '2026-10', hp_amount: 80000, loan_type: 'finance', deal_type: 'consulting' },
      ],
      officeExpenseRows: [],
      vehicleExpenseRows: [],
      voucherExpenseRows: [],
    });

    const oct = outcome.find((m) => m.monthKey === '2026-10');
    assert.ok(oct);
    assert.equal(oct.loanDist, 150000);
    assert.equal(oct.otherExp, 0);
  });

  await t.test('2. prevents Cartesian fan-out when one month has multiple loans and multiple expenses', () => {
    // 3 finance loans (10k + 20k + 30k = 60,000) and 4 expenses (1k + 2k + 3k + 4k = 10,000) in the same month
    const outcome = computeMonthlyOutcomeTrend(spine12, {
      loanRows: [
        { monthKey: '2026-11', hp_amount: 10000, loan_type: 'finance', deal_type: 'finance' },
        { monthKey: '2026-11', hp_amount: 20000, loan_type: 'finance', deal_type: 'finance' },
        { monthKey: '2026-11', hp_amount: 30000, loan_type: 'finance', deal_type: 'finance' },
      ],
      officeExpenseRows: [
        { monthKey: '2026-11', amount: 1000, transaction_type: 'Expense' },
        { monthKey: '2026-11', amount: 2000, transaction_type: 'Expense' },
        { monthKey: '2026-11', amount: 9999, transaction_type: 'Income' }, // ignored in expenses
      ],
      vehicleExpenseRows: [
        { monthKey: '2026-11', amount: 3000 },
      ],
      voucherExpenseRows: [
        { monthKey: '2026-11', amount: 4000, nature: 'Expenses', status: 'Posted', vehicle_expense_id: null },
        // Voucher linked to vehicle_expense_id must be ignored so vehicle_expense is not counted twice
        { monthKey: '2026-11', amount: 3000, nature: 'Expenses', status: 'Posted', vehicle_expense_id: 've-1' },
      ],
    });

    const nov = outcome.find((m) => m.monthKey === '2026-11');
    assert.ok(nov);
    assert.equal(nov.loanDist, 60000);
    assert.equal(nov.otherExp, 10000);
  });

  await t.test('3. principal/interest/penalty split sums back to payment total to the exact paisa', () => {
    const loansRatioById = new Map([
      [
        'loan-odd-ratio',
        computeLoanRatio({
          hp_amount: 100000,
          due_month: 17,
          interest_rate: 1.75,
        }),
      ],
    ]);

    const paymentGroups = [
      {
        monthKey: '2026-09',
        loanId: 'loan-odd-ratio',
        amountPaise: toPaise(7632.35),
        penaltyPaise: toPaise(150.25),
        payment_status: 'active',
      },
      {
        monthKey: '2026-09',
        loanId: 'loan-odd-ratio',
        amountPaise: toPaise(3333.33),
        penaltyPaise: toPaise(49.75),
        payment_status: 'active',
      },
      {
        monthKey: '2026-09',
        loanId: 'loan-odd-ratio',
        amountPaise: toPaise(5000),
        penaltyPaise: toPaise(100),
        payment_status: 'cancelled', // must be excluded
      },
    ];

    const income = computeMonthlyIncomeTrend(spine12, paymentGroups, loansRatioById);
    const sep = income.find((m) => m.monthKey === '2026-09');
    assert.ok(sep);

    const expectedAmountPaise = toPaise(7632.35) + toPaise(3333.33);
    const expectedPenaltyPaise = toPaise(150.25) + toPaise(49.75);
    const actualSplitPaise = toPaise(sep.principal) + toPaise(sep.interest);

    assert.equal(actualSplitPaise, expectedAmountPaise);
    assert.equal(toPaise(sep.penalty), expectedPenaltyPaise);
    assert.equal(
      fromPaise(actualSplitPaise + toPaise(sep.penalty)),
      fromPaise(expectedAmountPaise + expectedPenaltyPaise)
    );
  });

  await t.test('4. cash in hand does not double-count a payment that has a linked voucher', () => {
    // Suppose Cash ledger opening balance is ₹50,000, and a ₹5,000 payment has a posted Receipt voucher
    // (so voucherMovement already includes +₹5,000). A second ₹3,000 payment has NO linked voucher.
    // A ₹20,000 finance loan has NO linked voucher, while a ₹40,000 finance loan HAS a linked voucher
    // (already inside voucherMovement as -₹40,000).
    const cash = computeCashInHand({
      openingBalance: 50000,
      voucherMovement: 5000 - 40000, // net -35,000 from posted vouchers
      payments: [
        { id: 'p-linked', amount: 5000, penalty: 0, hand_loan: 0, payment_status: 'active', hasLinkedVoucher: true },
        { id: 'p-unlinked', amount: 3000, penalty: 200, hand_loan: 100, payment_status: 'active', hasLinkedVoucher: false },
        { id: 'p-cancelled', amount: 9000, penalty: 0, hand_loan: 0, payment_status: 'cancelled', hasLinkedVoucher: false },
      ],
      loans: [
        { id: 'l-linked', hp_amount: 40000, loan_type: 'finance', deal_type: 'finance', hasLinkedVoucher: true },
        { id: 'l-unlinked', hp_amount: 20000, loan_type: 'finance', deal_type: 'finance', hasLinkedVoucher: false },
        { id: 'l-consulting', hp_amount: 99000, loan_type: 'consulting', deal_type: 'consulting', hasLinkedVoucher: false },
      ],
      officeExpenses: [
        { id: 'oe-1', amount: 500, transaction_type: 'Expense', hasLinkedVoucher: false },
      ],
      vehicleExpenses: [
        { id: 've-linked', amount: 1200, hasLinkedVoucher: true },
        { id: 've-unlinked', amount: 800, hasLinkedVoucher: false },
      ],
    });

    // Expected:
    // Ledger closing = 50,000 + (5,000 - 40,000) = 15,000
    // + Unlinked payment = 3,000 + 200 + 100 = 3,300
    // - Unlinked finance loan = 20,000
    // - Unlinked office expense = 500
    // - Unlinked vehicle expense = 800
    // Total = 15,000 + 3,300 - 20,000 - 500 - 800 = -3,000
    assert.equal(cash, -3000);
  });

  await t.test('5. pie slices sum to totalCustomers and activeLoans equals Active + Default', () => {
    const todayIST = '2026-11-10';
    const customerFixtures = [
      // 1. Active & on-time (first due in future or fully paid up to today)
      {
        customer_id: 'c-1',
        hplno: 1,
        cname: 'On Time 1',
        loan_status: 'active',
        loan_id: 'l-1',
        hp_amount: 50000,
        hp_date: '2026-10-10',
        due_date: '2026-11-10',
        due_month: 10,
        due_amount: 5500,
        net_payable: 55000,
        total_paid: 5500, // paid Nov 10 installment
        payment_count: 1,
        on_time_count: 1,
      },
      // 2. Active & unpaid/overdue (Default slice)
      {
        customer_id: 'c-2',
        hplno: 2,
        cname: 'Overdue Active',
        loan_status: 'active',
        loan_id: 'l-2',
        hp_amount: 60000,
        hp_date: '2026-08-05',
        due_date: '2026-09-05',
        due_month: 12,
        due_amount: 6000,
        net_payable: 72000,
        total_paid: 0, // missed Sep, Oct, Nov installments
        payment_count: 0,
        on_time_count: 0,
      },
      // 3. Closed loan
      {
        customer_id: 'c-3',
        hplno: 3,
        cname: 'Closed Customer',
        loan_status: 'close',
        loan_id: 'l-3',
        hp_amount: 40000,
        hp_date: '2025-01-10',
        due_date: '2025-02-10',
        due_month: 10,
        due_amount: 4500,
        net_payable: 45000,
        total_paid: 45000,
      },
      // 4. Seized loan
      {
        customer_id: 'c-4',
        hplno: 4,
        cname: 'Seized Customer',
        loan_status: 'seized',
        loan_id: 'l-4',
        hp_amount: 70000,
        hp_date: '2026-05-01',
        due_date: '2026-06-01',
        due_month: 12,
        due_amount: 7000,
        net_payable: 84000,
        total_paid: 7000,
        has_seizure: true,
      },
    ];

    const res = computePortfolioAndInsights(customerFixtures, todayIST);
    assert.equal(res.totalCustomers, 4);
    assert.equal(res.activeLoans, 2);
    assert.equal(res.seizedVehicles, 1);

    const sliceSum = res.loanDistribution.reduce((s, item) => s + item.value, 0);
    assert.equal(sliceSum, res.totalCustomers);

    const activeSlice = res.loanDistribution.find((s) => s.name === 'Active').value;
    const defaultSlice = res.loanDistribution.find((s) => s.name === 'Default').value;
    const closedSlice = res.loanDistribution.find((s) => s.name === 'Closed').value;
    const seizedSlice = res.loanDistribution.find((s) => s.name === 'Seized').value;

    assert.equal(activeSlice, 1);
    assert.equal(defaultSlice, 1);
    assert.equal(closedSlice, 1);
    assert.equal(seizedSlice, 1);
    assert.equal(res.activeLoans, activeSlice + defaultSlice);
  });

  await t.test('6. computes overdueOver30Days, todaysDueCount, and highRiskCustomers accurately on fixture data', () => {
    const todayIST = '2026-11-10';
    // Note: loans.due_date is the Month-0 cycle anchor (EMI #1 = clampedInstallmentDate(due_date, 1)).
    const fixtures = [
      // Customer A: Month-0 anchor 2026-10-10 -> EMI #1 due today (2026-11-10), balance remaining -> todaysDueCount = 1, safe
      {
        customer_id: 'cust-due-today',
        hplno: 101,
        cname: 'Due Today Customer',
        loan_status: 'active',
        loan_id: 'loan-101',
        hp_amount: 50000,
        hp_date: '2026-10-10',
        due_date: '2026-10-10',
        due_month: 10,
        due_amount: 5500,
        net_payable: 55000,
        total_paid: 0,
        payment_count: 0,
        on_time_count: 0,
      },
      // Customer B: Month-0 anchor 2026-07-01 -> EMI #1 due 2026-08-01, 0 paid -> 101 days overdue -> critical risk, overdueOver30Days
      {
        customer_id: 'cust-overdue-100',
        hplno: 102,
        cname: 'Critical Overdue Customer',
        loan_status: 'active',
        loan_id: 'loan-102',
        hp_amount: 60000,
        hp_date: '2026-07-01',
        due_date: '2026-07-01',
        due_month: 12,
        due_amount: 6000,
        net_payable: 72000,
        total_paid: 0,
        payment_count: 0,
        on_time_count: 0,
        broken_ptp_count: 2,
      },
      // Customer C: Month-0 anchor 2026-08-26 -> EMI #1 due 2026-09-26, 0 paid -> 45 days overdue -> high/critical risk, overdueOver30Days
      {
        customer_id: 'cust-overdue-45',
        hplno: 103,
        cname: 'High Risk Overdue Customer',
        loan_status: 'active',
        loan_id: 'loan-103',
        hp_amount: 40000,
        hp_date: '2026-08-26',
        due_date: '2026-08-26',
        due_month: 10,
        due_amount: 4500,
        net_payable: 45000,
        total_paid: 0,
        payment_count: 0,
        on_time_count: 0,
      },
      // Customer D: Month-0 anchor 2026-09-30 -> EMI #1 due 2026-10-30, 0 paid -> 11 days overdue -> NOT > 30 days
      {
        customer_id: 'cust-overdue-10',
        hplno: 104,
        cname: 'Mild Overdue Customer',
        loan_status: 'active',
        loan_id: 'loan-104',
        hp_amount: 30000,
        hp_date: '2026-09-30',
        due_date: '2026-09-30',
        due_month: 10,
        due_amount: 3300,
        net_payable: 33000,
        total_paid: 0,
        payment_count: 0,
        on_time_count: 0,
      },
    ];

    const res = computePortfolioAndInsights(fixtures, todayIST);
    assert.equal(res.quickInsights.todaysDueCount, 1);
    assert.equal(res.quickInsights.overdueOver30Days, 2);
    assert.equal(
      res.quickInsights.highRiskCustomers,
      res.quickInsights.criticalAlerts + res.quickInsights.highAlerts
    );
    assert.equal(res.quickInsights.highRiskCustomers, 2);
  });

  await t.test('7. getHomeDashboardOverview orchestrates mocked queries and returns expected shape', async () => {
    const fakeFinanceId = '01a14ed2-5df9-7175-839b-3cbaca84f231';
    const fixedToday = '2026-11-10';

    const mockRunner = {
      async query(sql) {
        if (sql.includes('FROM customers c')) {
          return {
            rows: [
              {
                customer_id: 'c-1',
                hplno: 1,
                cname: 'Test Cust',
                loan_status: 'active',
                customer_created_at: '2026-09-01',
                loan_id: 'l-1',
                loan_type: 'finance',
                hp_amount: 50000,
                hp_date: '2026-09-01',
                due_date: '2026-10-01',
                first_due_date: '2026-10-01',
                due_month: 10,
                due_amount: 5500,
                net_payable: 55000,
                penalty_amount: 0,
                total_paid: 5500,
                total_penalty: 0,
                payment_count: 1,
                on_time_count: 1,
                late_15_30: 0,
                late_31_60: 0,
                late_over_60: 0,
                broken_ptp_count: 0,
                has_seizure: false,
              },
            ],
          };
        }
        if (sql.includes('FROM vehicle_detail vd')) {
          return {
            rows: [
              { status: 'available', cnt: 3 },
              { status: 'seized', cnt: 1 },
              { status: 'sales', cnt: 10 },
            ],
          };
        }
        if (sql.includes('AS today_collection')) {
          return {
            rows: [{ today_collection: '5500.00', yesterday_collection: '5000.00' }],
          };
        }
        if (sql.includes('unlinked_payments_in')) {
          return {
            rows: [
              {
                opening_balance: '100000.00',
                voucher_movement: '0.00',
                unlinked_payments_in: '5500.00',
                unlinked_loans_out: '50000.00',
                unlinked_office_exp_out: '0.00',
                unlinked_vehicle_exp_out: '0.00',
              },
            ],
          };
        }
        if (sql.includes('matched_loan.loan_id')) {
          return {
            rows: [
              {
                loan_id: 'l-1',
                customer_id: 'c-1',
                month_key: '2026-10',
                amount_paise: '550000',
                penalty_paise: '0',
              },
            ],
          };
        }
        if (sql.includes('loan_dist_by_month')) {
          return {
            rows: [
              {
                month_key: '2026-09',
                loan_dist_paise: '5000000',
                other_exp_paise: '0',
              },
            ],
          };
        }
        if (sql.includes('ANY($2::uuid[])')) {
          return {
            rows: [
              {
                id: 'l-1',
                hp_amount: 50000,
                due_month: 10,
                interest_rate: 1,
                principle_part: 5000,
                interest_part: 500,
                due_amount: 5500,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const overview = await getHomeDashboardOverview(fakeFinanceId, {
      todayDateIST: fixedToday,
      queryRunner: mockRunner,
    });

    assert.equal(overview.asOfDate, fixedToday);
    assert.equal(overview.kpis.activeLoans, 1);
    assert.equal(overview.kpis.totalCustomers, 1);
    assert.equal(overview.kpis.godownVehicles, 4);
    assert.equal(overview.kpis.totalVehicles, 14);
    assert.equal(overview.kpis.todayCollection, 5500);
    assert.deepEqual(overview.kpis.trends.todayCollection, { value: 10, up: true });
    assert.equal(overview.kpis.cashInHand, 55500);
    assert.equal(overview.monthly.collectionTrend.length, 12);
    assert.equal(overview.monthly.outcomeTrend.length, 12);
    assert.equal( computeKpiTrendBadge(100, 0), null );
  });

  await t.test('8. GET /home-overview route handler returns { success: true, ...data } and handles 500 errors', async () => {
    const origFn = homeDashboardService.getHomeDashboardOverview;
    try {
      const mockOverview = {
        asOfDate: '2026-11-10',
        kpis: { activeLoans: 5, totalCustomers: 8 },
        loanDistribution: [],
        monthly: { collectionTrend: [], outcomeTrend: [] },
        quickInsights: { highRiskCustomers: 1, todaysDueCount: 2, overdueOver30Days: 1 },
      };

      let capturedFinanceId = null;
      homeDashboardService.getHomeDashboardOverview = async (fid) => {
        capturedFinanceId = fid;
        return mockOverview;
      };

      let statusCode = 200;
      let jsonBody = null;
      const req = { financeId: '01a14ed2-5df9-7175-839b-3cbaca84f231' };
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

      await dashboardRouter.handleGetHomeOverview(req, res);
      assert.equal(statusCode, 200);
      assert.equal(capturedFinanceId, '01a14ed2-5df9-7175-839b-3cbaca84f231');
      assert.equal(jsonBody.success, true);
      assert.equal(jsonBody.kpis.activeLoans, 5);

      // Verify 500 error shape
      homeDashboardService.getHomeDashboardOverview = async () => {
        throw new Error('DB timeout');
      };
      await dashboardRouter.handleGetHomeOverview(req, res);
      assert.equal(statusCode, 500);
      assert.equal(jsonBody.success, false);
      assert.equal(jsonBody.error, 'Failed to fetch home dashboard overview');
      assert.equal(jsonBody.details, 'DB timeout');
    } finally {
      homeDashboardService.getHomeDashboardOverview = origFn;
    }
  });
});

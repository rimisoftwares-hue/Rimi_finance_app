const express = require('express');
const router = express.Router();
const { db } = require('../../config/database.config');
const { checkFinance, enhancedCheckFinance } = require('../../middleware/auth.middleware');
const homeDashboardService = require('./homeDashboard.service');
const staffDashboardService = require('./staffDashboard.service');

// Home Dashboard Overview (MainDashboard.tsx)
const handleGetHomeOverview = async (req, res) => {
  try {
    const financeId = req.financeId;
    const overview = await homeDashboardService.getHomeDashboardOverview(financeId);
    res.json({
      success: true,
      ...overview,
    });
  } catch (err) {
    console.error('Error fetching home dashboard overview:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch home dashboard overview',
      details: err.message,
    });
  }
};

router.get(['/home-overview', '/dashboard/home-overview'], enhancedCheckFinance, handleGetHomeOverview);
router.handleGetHomeOverview = handleGetHomeOverview;

// Staff Dashboard Overview (StaffDashboard.tsx)
const handleGetStaffOverview = async (req, res) => {
  try {
    const financeId = req.financeId;
    const overview = await staffDashboardService.getStaffDashboardOverview(db, financeId, req.user);
    res.json({
      success: true,
      ...overview,
    });
  } catch (err) {
    console.error('Error fetching staff dashboard overview:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff dashboard overview',
      details: err.message,
    });
  }
};

router.get(['/staff-overview', '/dashboard/staff-overview'], enhancedCheckFinance, handleGetStaffOverview);
router.handleGetStaffOverview = handleGetStaffOverview;

// Dashboard Stats
router.get(['/stats', '/dashboard/stats'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    // 1. Total Active Customers
    const customerCount = await db.query(
      `SELECT COUNT(*) as count FROM customers WHERE finance_id = $1 AND loan_status = 'active'`,
      [financeId]
    );

    // 2. Unpaid Customers (customers with active loans but pending payments)
    const unpaidCount = await db.query(`
      SELECT COUNT(*) AS unpaid_customer_count
      FROM customers c
      WHERE c.loan_status = 'active' 
        AND c.finance_id = $1
        AND EXISTS (
          SELECT 1 
          FROM payments p 
          WHERE p.customer_id = c.id 
            AND p.due_date = (
              SELECT MAX(due_date) 
              FROM payments p2 
              WHERE p2.customer_id = c.id
            )
            AND p.status = 'pending'
        )
    `, [financeId]);

    // 3. Total Vehicles
    const vehicleCount = await db.query(
      'SELECT COUNT(*) as count FROM vehicle_detail WHERE finance_id = $1',
      [financeId]
    );

    // 4. Sales Amount (current month total payments + penalties)
    const currentMonthSales = await db.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as totalAmount,
        COALESCE(SUM(penalty), 0) as totalPenalty
      FROM payments 
      WHERE finance_id = $1 
        AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    `, [financeId]);

    // 5. Previous month sales for trend calculation
    const previousMonthSales = await db.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as totalAmount,
        COALESCE(SUM(penalty), 0) as totalPenalty
      FROM payments 
      WHERE finance_id = $1 
        AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
        AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
    `, [financeId]);

    // 6. Customer count trends (previous month)
    const previousMonthCustomers = await db.query(`
      SELECT COUNT(*) as count 
      FROM customers 
      WHERE finance_id = $1 
        AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
    `, [financeId]);

    // 7. Vehicle count trends (previous month)
    const previousMonthVehicles = await db.query(`
      SELECT COUNT(*) as count 
      FROM vehicle_detail 
      WHERE finance_id = $1 
        AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
    `, [financeId]);

    // Calculate trends
    const currentSales = Number(currentMonthSales.rows[0]?.totalamount || 0) +
      Number(currentMonthSales.rows[0]?.totalpenalty || 0);
    const previousSales = Number(previousMonthSales.rows[0]?.totalamount || 0) +
      Number(previousMonthSales.rows[0]?.totalpenalty || 0);
    const salesTrend = previousSales > 0 ? ((currentSales - previousSales) / previousSales) * 100 : 0;

    const currentCustomers = Number(customerCount.rows[0]?.count || 0);
    const previousCustomers = Number(previousMonthCustomers.rows[0]?.count || 0);
    const customersTrend = previousCustomers > 0 ? ((currentCustomers - previousCustomers) / previousCustomers) * 100 : 0;

    const currentVehicles = Number(vehicleCount.rows[0]?.count || 0);
    const previousVehicles = Number(previousMonthVehicles.rows[0]?.count || 0);
    const vehiclesTrend = previousVehicles > 0 ? ((currentVehicles - previousVehicles) / previousVehicles) * 100 : 0;

    // For unpaid customers trend (optional implementation)
    const unpaidTrend = 0;

    res.json({
      success: true,
      data: {
        totalCustomers: currentCustomers,
        unpaidCustomers: Number(unpaidCount.rows[0]?.unpaid_customer_count || 0),
        totalVehicles: currentVehicles,
        salesAmount: currentSales,
        trends: {
          customersTrend: Number(customersTrend.toFixed(1)),
          unpaidTrend: unpaidTrend,
          vehiclesTrend: Number(vehiclesTrend.toFixed(1)),
          salesTrend: Number(salesTrend.toFixed(1))
        }
      }
    });

  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      details: err.message
    });
  }
});

// Recent History Alerts
router.get(['/recent-history', '/dashboard/recent-history'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const today = new Date().toISOString().split('T')[0];

    const recentHistory = await db.query(`
      SELECT 
        he.*,
        c.cname as customer_name
      FROM history_entries he
      JOIN customers c ON he.customer_id = c.id
      WHERE he.finance_id = $1
        AND he.entry_date = $2::date
      ORDER BY he.created_at DESC
      LIMIT 20
    `, [financeId, today]);

    res.json({
      success: true,
      alerts: recentHistory.rows
    });

  } catch (err) {
    console.error('Error fetching recent history alerts:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent history alerts'
    });
  }
});

// Delete Alert
router.delete(['/history/alerts/:id', '/alerts/:id', '/history/:id'], enhancedCheckFinance, async (req, res) => {
  try {
    const { id } = req.params;
    const financeId = req.financeId;

    await db.query(
      'DELETE FROM history_entries WHERE id = $1 AND finance_id = $2',
      [id, financeId]
    );

    res.json({
      success: true,
      message: 'Alert deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting alert:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete alert'
    });
  }
});

// Delete Activity
router.delete(['/activity/:id', '/activities/:id'], enhancedCheckFinance, async (req, res) => {
  try {
    const { id } = req.params;
    const financeId = req.financeId;

    await db.query(
      'DELETE FROM recent_activity WHERE id = $1 AND finance_id = $2',
      [id, financeId]
    );

    res.json({
      success: true,
      message: 'Activity deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting activity:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete activity'
    });
  }
});

// Recent Activities
router.get(['/recent-activities', '/dashboard/recent-activities'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    const activities = await db.query(`
      SELECT 
        id,
        type,
        reference_id,
        description,
        amount,
        created_by,
        created_at
      FROM recent_activity 
      WHERE finance_id = $1
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 50
    `, [financeId]);

    res.json({
      success: true,
      activities: activities.rows || []
    });

  } catch (err) {
    console.error('Error fetching recent activities:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent activities'
    });
  }
});

// Monthly Income Breakdown
router.get(['/monthly-income-breakdown', '/income-breakdown'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    const monthlyRows = await db.query(`
      WITH months AS (
        SELECT 1 AS month_num, 'Jan' AS month_name UNION ALL
        SELECT 2, 'Feb' UNION ALL SELECT 3, 'Mar' UNION ALL
        SELECT 4, 'Apr' UNION ALL SELECT 5, 'May' UNION ALL
        SELECT 6, 'Jun' UNION ALL SELECT 7, 'Jul' UNION ALL
        SELECT 8, 'Aug' UNION ALL SELECT 9, 'Sep' UNION ALL
        SELECT 10, 'Oct' UNION ALL SELECT 11, 'Nov' UNION ALL
        SELECT 12, 'Dec'
      ),
      date_ranges AS (
        SELECT 
          CURRENT_DATE AS check_date,
          EXTRACT(YEAR FROM CURRENT_DATE) AS current_year,
          EXTRACT(MONTH FROM CURRENT_DATE) AS current_month
      )
      SELECT 
        m.month_name AS month,

        /* Total Income */
        COALESCE(SUM(p.amount), 0) AS total_income,

        /* Average Interest Rate of paid customers */
        COALESCE(
          SUM(l.interest_rate) / NULLIF(COUNT(DISTINCT p.customer_id), 0),
          0
        ) AS avg_interest_rate,

        /* Interest Amount */
        ROUND(
          COALESCE(SUM(p.amount), 0) *
          COALESCE(
            SUM(l.interest_rate) / NULLIF(COUNT(DISTINCT p.customer_id), 0),
            0
          ) / 100,
          2
        ) AS interest_amount,

        /* Principal Amount */
        ROUND(
          COALESCE(SUM(p.amount), 0) -
          (
            COALESCE(SUM(p.amount), 0) *
            COALESCE(
              SUM(l.interest_rate) / NULLIF(COUNT(DISTINCT p.customer_id), 0),
              0
            ) / 100
          ),
          2
        ) AS principal_amount,

        /* Penalty */
        COALESCE(SUM(p.penalty), 0) AS penalty,

        /* Financial Year Logic */
        CASE
          WHEN m.month_num > dr.current_month THEN dr.current_year - 1
          ELSE dr.current_year
        END AS year

      FROM months m
      CROSS JOIN date_ranges dr

      LEFT JOIN payments p 
        ON EXTRACT(MONTH FROM p.payment_date) = m.month_num
        AND EXTRACT(YEAR FROM p.payment_date) =
            CASE
              WHEN m.month_num > dr.current_month THEN dr.current_year - 1
              ELSE dr.current_year
            END
        AND p.payment_date <= dr.check_date
        AND p.finance_id = $1

      LEFT JOIN LATERAL (
        SELECT l_sub.interest_rate
        FROM loans l_sub
        WHERE l_sub.customer_id = p.customer_id
          AND l_sub.finance_id = p.finance_id
        ORDER BY l_sub.hp_date DESC NULLS LAST, l_sub.id DESC
        LIMIT 1
      ) l ON true

      GROUP BY m.month_num, m.month_name, dr.current_month, dr.current_year
      ORDER BY year, m.month_num
    `, [financeId]);

    const data = monthlyRows.rows.map(row => ({
      month: row.month,
      principal: Number(row.principal_amount) || 0,
      interest: Number(row.interest_amount) || 0,
      penalty: Number(row.penalty) || 0,
      total: Number(row.total_income) || 0,
      avgInterestRate: Number(row.avg_interest_rate) || 0
    }));

    res.json({
      success: true,
      data: data
    });

  } catch (err) {
    console.error('Error fetching monthly income breakdown:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch monthly income breakdown',
      details: err.message
    });
  }
});

// Monthly Outcome Breakdown
router.get(['/monthly-outcome-breakdown', '/outcome-breakdown'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    const monthlyRows = await db.query(`
      WITH months AS (
        SELECT 1 AS month_num, 'Jan' AS month_name UNION ALL
        SELECT 2, 'Feb' UNION ALL SELECT 3, 'Mar' UNION ALL
        SELECT 4, 'Apr' UNION ALL SELECT 5, 'May' UNION ALL
        SELECT 6, 'Jun' UNION ALL SELECT 7, 'Jul' UNION ALL
        SELECT 8, 'Aug' UNION ALL SELECT 9, 'Sep' UNION ALL
        SELECT 10, 'Oct' UNION ALL SELECT 11, 'Nov' UNION ALL
        SELECT 12, 'Dec'
      ),
      date_ranges AS (
        SELECT 
          CURRENT_DATE AS check_date,
          EXTRACT(YEAR FROM CURRENT_DATE) AS current_year,
          EXTRACT(MONTH FROM CURRENT_DATE) AS current_month
      ),
      loans_by_month AS (
        SELECT
          EXTRACT(MONTH FROM l.hp_date)::int AS month_num,
          EXTRACT(YEAR FROM l.hp_date)::int AS year_num,
          COALESCE(SUM(
            CASE
              WHEN v.deal_type = 'finance' THEN l.hp_amount
              ELSE 0
            END
          ), 0) AS loan_distributed
        FROM loans l
        LEFT JOIN customers c ON c.id = l.customer_id
        LEFT JOIN vehicle_detail v ON v.id = c.vehicle_id AND v.finance_id = l.finance_id
        CROSS JOIN date_ranges dr
        WHERE l.finance_id = $1
          AND l.hp_date IS NOT NULL
          AND l.hp_date <= dr.check_date
        GROUP BY EXTRACT(MONTH FROM l.hp_date)::int, EXTRACT(YEAR FROM l.hp_date)::int
      ),
      expenses_by_month AS (
        SELECT
          EXTRACT(MONTH FROM oe.expense_date)::int AS month_num,
          EXTRACT(YEAR FROM oe.expense_date)::int AS year_num,
          COALESCE(SUM(oe.amount), 0) AS other_expenses
        FROM office_expenses oe
        CROSS JOIN date_ranges dr
        WHERE oe.finance_id = $1
          AND oe.expense_date IS NOT NULL
          AND oe.expense_date <= dr.check_date
        GROUP BY EXTRACT(MONTH FROM oe.expense_date)::int, EXTRACT(YEAR FROM oe.expense_date)::int
      )
      SELECT
        m.month_name AS month,
        COALESCE(lbm.loan_distributed, 0) AS loan_distributed,
        COALESCE(ebm.other_expenses, 0) AS other_expenses,
        CASE
          WHEN m.month_num > dr.current_month THEN dr.current_year - 1
          ELSE dr.current_year
        END AS year
      FROM months m
      CROSS JOIN date_ranges dr
      LEFT JOIN loans_by_month lbm
        ON lbm.month_num = m.month_num
        AND lbm.year_num =
          CASE
            WHEN m.month_num > dr.current_month THEN dr.current_year - 1
            ELSE dr.current_year
          END
      LEFT JOIN expenses_by_month ebm
        ON ebm.month_num = m.month_num
        AND ebm.year_num =
          CASE
            WHEN m.month_num > dr.current_month THEN dr.current_year - 1
            ELSE dr.current_year
          END
      ORDER BY year, m.month_num
    `, [financeId]);

    const data = monthlyRows.rows.map(row => ({
      month: row.month,
      loanDisbursed: Number(row.loan_distributed) || 0,
      otherExpenses: Number(row.other_expenses) || 0,
      total: (Number(row.loan_distributed) || 0) + (Number(row.other_expenses) || 0)
    }));

    res.json({
      success: true,
      data: data
    });

  } catch (err) {
    console.error('Error fetching monthly outcome breakdown:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch monthly outcome breakdown',
      details: err.message
    });
  }
});

module.exports = router;
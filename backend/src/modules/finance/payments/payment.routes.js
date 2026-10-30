const express = require('express');
const router = express.Router();
const { db } = require('../../../config/database.config');
const { enhancedCheckFinance } = require('../../../middleware/auth.middleware');

async function maintainRecentActivityLimit(conn, financeId) {
  const { rows } = await conn.query(`
    SELECT COUNT(*) as count
    FROM recent_activity
    WHERE finance_id = $1
  `, [financeId]);

  const count = parseInt(rows[0]?.count, 10) || 0;
  if (count > 50) {
    await conn.query(`
      DELETE FROM recent_activity
      WHERE id IN (
        SELECT id FROM recent_activity
        WHERE finance_id = $1
        ORDER BY created_at ASC
        LIMIT $2
      )
    `, [financeId, count - 50]);
  }
}

router.get(['/filterPayments', '/payments/report', '/report'], enhancedCheckFinance, async (req, res) => {
  try {
    const { type, startDate, endDate, collectedBy } = req.query;
    const financeId = req.financeId;

    if (!type) {
      return res.status(400).json({ success: false, error: 'Report type is required' });
    }

    let dateFilter = '';
    let queryParams = [financeId]; // $1

    switch (type) {
      case 'today':
        dateFilter = 'p.created_at::date = CURRENT_DATE';
        break;
      case 'week':
        dateFilter = "DATE_TRUNC('week', p.created_at) = DATE_TRUNC('week', CURRENT_DATE)";
        break;
      case 'month':
        dateFilter = 'EXTRACT(YEAR FROM p.created_at) = EXTRACT(YEAR FROM CURRENT_DATE) AND EXTRACT(MONTH FROM p.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)';
        break;
      case 'year':
        dateFilter = 'EXTRACT(YEAR FROM p.created_at) = EXTRACT(YEAR FROM CURRENT_DATE)';
        break;
      case 'custom':
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            error: 'Start date and end date are required for custom report',
          });
        }
        queryParams.push(startDate, endDate);
        dateFilter = `p.created_at::date BETWEEN $${queryParams.length - 1} AND $${queryParams.length}`;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid report type',
        });
    }

    // Add collectedBy filter if provided
    let collectedByFilter = '';
    if (collectedBy && collectedBy !== 'all') {
      queryParams.push(collectedBy);
      collectedByFilter = `AND p.collected_by = $${queryParams.length}`;
    }

    const summaryQuery = `
      SELECT 
        COALESCE(SUM(p.amount), 0) as "totalPayment",
        COALESCE(SUM(p.penalty), 0) as "totalPenalty",
        COALESCE(SUM(p.amount + p.penalty), 0) as "grandTotal"
      FROM payments p
      WHERE p.finance_id = $1 AND ${dateFilter} ${collectedByFilter}
    `;

    const { rows: summaryResults } = await db.query(summaryQuery, queryParams);

    const paymentsQuery = `
      SELECT 
        p.id,
        c.cname AS "customerName",
        c.hplno AS "customerHplno",
        TO_CHAR(p.created_at, 'YYYY-MM-DD') AS date,
        p.amount AS payment,
        p.penalty,
        (p.amount + p.penalty) AS total,
        p.bill_number AS "billNumber",
        p.collected_by,
        p.payment_mode,
        v.vehicle_number AS "vehicleNumber"
      FROM payments p
      JOIN customers c 
          ON p.customer_id = c.id
      LEFT JOIN vehicle_detail v 
          ON c.vehicle_id = v.id
      WHERE 
          p.finance_id = $1
          AND ${dateFilter}
          ${collectedByFilter}
      ORDER BY p.created_at DESC;
    `;

    const { rows: paymentsResults } = await db.query(paymentsQuery, queryParams);

    // Get unique collectors for filter dropdown
    const collectorsQuery = `
      SELECT DISTINCT collected_by 
      FROM payments 
      WHERE finance_id = $1 AND collected_by IS NOT NULL AND collected_by != ''
      ORDER BY collected_by
    `;

    const { rows: collectorsResult } = await db.query(collectorsQuery, [financeId]);

    res.json({
      success: true,
      summary: {
        totalPayment: Number(summaryResults[0]?.totalPayment) || 0,
        totalPenalty: Number(summaryResults[0]?.totalPenalty) || 0,
        grandTotal: Number(summaryResults[0]?.grandTotal) || 0,
      },
      payments: paymentsResults.map(payment => ({
        ...payment,
        payment: Number(payment.payment) || 0,
        penalty: Number(payment.penalty) || 0,
        total: Number(payment.total) || 0,
      })),
      collectors: collectorsResult.map(row => row.collected_by),
    });
  } catch (err) {
    console.error('Error generating payment report:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate payment report',
      details: err.message,
    });
  }
});

// ─── Bill Report ─────────────────────────────────────────────────────────────
router.get('/bill-report', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const { fromDate, toDate, status, search } = req.query;

    const whereConditions = ['p.finance_id = $1'];
    const queryParams = [financeId];

    if (fromDate) {
      queryParams.push(fromDate);
      whereConditions.push(`p.payment_date >= $${queryParams.length}`);
    }

    if (toDate) {
      queryParams.push(toDate);
      whereConditions.push(`p.payment_date <= $${queryParams.length}`);
    }

    if (status && String(status).toLowerCase() !== 'all') {
      const s = String(status).toLowerCase();
      if (s === 'cancelled') {
        whereConditions.push(`p.payment_status = 'cancelled'`);
      } else if (s === 'paid' || s === 'partial' || s === 'pending') {
        queryParams.push(s);
        whereConditions.push(`p.payment_status != 'cancelled' AND p.status = $${queryParams.length}`);
      }
    }

    if (search && search.trim() !== '') {
      queryParams.push(`%${search.trim()}%`);
      const searchIdx = queryParams.length;
      whereConditions.push(`(
        p.bill_number ILIKE $${searchIdx}
        OR c.hplno::text ILIKE $${searchIdx}
        OR c.cname ILIKE $${searchIdx}
      )`);
    }

    const whereClause = whereConditions.join(' AND ');

    const sql = `
      SELECT 
        p.id,
        p.bill_number,
        p.amount,
        p.penalty,
        p.status AS payment_due_status,
        p.payment_status,
        p.payment_mode,
        p.collected_by,
        p.edited_by,
        p.cancelled_by,
        TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS formatted_date,
        TO_CHAR(p.created_at, 'HH12:MI:SS AM') AS formatted_created_time,
        TO_CHAR(p.edited_at, 'HH12:MI:SS AM') AS formatted_edited_time,
        c.cname,
        c.hplno,
        l.due_amount,
        l.interest_part,
        l.principle_part
      FROM payments p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN LATERAL (
        SELECT l.due_amount, l.interest_part, l.principle_part
        FROM loans l
        WHERE l.customer_id = p.customer_id AND l.finance_id = p.finance_id
        ORDER BY l.due_date DESC NULLS LAST, l.id DESC
        LIMIT 1
      ) l ON true
      WHERE ${whereClause}
      ORDER BY p.payment_date DESC, p.created_at DESC;
    `;

    const { rows } = await db.query(sql, queryParams);

    const capitalizeMode = (m) => {
      if (!m) return 'Cash';
      const lower = String(m).toLowerCase();
      if (lower === 'upi') return 'UPI';
      if (lower === 'cash') return 'Cash';
      if (lower === 'bank') return 'Bank';
      if (lower === 'online') return 'Online';
      if (lower === 'cheque') return 'Cheque';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    };

    const data = rows.map((row) => {
      const amt = parseFloat(row.amount) || 0;
      const penalty = parseFloat(row.penalty) || 0;
      const dueAmount = parseFloat(row.due_amount) || 0;
      const interestPart = parseFloat(row.interest_part) || 0;

      let interest = 0;
      if (dueAmount > 0 && interestPart > 0) {
        interest = Math.min(amt, Math.round((amt / dueAmount) * interestPart));
      }
      const principal = Math.max(0, amt - interest);
      const total = amt + penalty;

      let displayStatus = 'Pending';
      if (row.payment_status === 'cancelled') {
        displayStatus = 'Cancelled';
      } else if (row.payment_due_status === 'paid') {
        displayStatus = 'Paid';
      } else if (row.payment_due_status === 'partial') {
        displayStatus = 'Partial';
      } else {
        displayStatus = 'Pending';
      }

      return {
        id: row.id,
        receiptNo: row.bill_number || '',
        hpAcNo: row.hplno != null ? String(row.hplno) : '',
        customer: row.cname || '',
        status: displayStatus,
        date: row.formatted_date || '',
        total,
        principal,
        interest,
        penalty,
        mode: capitalizeMode(row.payment_mode),
        createdBy: row.collected_by || '',
        createdTime: row.formatted_created_time || '',
        alteredBy: row.edited_by || '',
        alteredTime: row.formatted_edited_time || '',
        cancelledBy: row.cancelled_by || '',
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('Error generating bill report:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate bill report',
    });
  }
});

router.get(['/paymentDeteils', '/details', '/paymentDetails'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    // 1. Income vs Penalty for current month
    const { rows: currentMonthTotal } = await db.query(`
      SELECT 
        COALESCE(SUM(p.amount), 0) AS "totalIncome",
        COALESCE(SUM(p.penalty), 0) AS "totalPenalty",
        COALESCE(AVG(l.interest_rate), 0) AS avg_interest_rate
      FROM payments p
      LEFT JOIN loans l ON p.customer_id = l.customer_id AND l.finance_id = $1
      WHERE p.finance_id = $2
        AND EXTRACT(MONTH FROM p.payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM p.payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    `, [financeId, financeId]);

    const { totalIncome, totalPenalty, avg_interest_rate } = currentMonthTotal[0] || {};

    const totalIncomeNum = Number(totalIncome) || 0;
    const totalPenaltyNum = Number(totalPenalty) || 0;
    const avgInterestNum = Number(avg_interest_rate) || 0;

    const totalSum = totalIncomeNum + totalPenaltyNum;
    const incomePercent = totalSum ? (totalIncomeNum / totalSum) * 100 : 0;
    const penaltyPercent = totalSum ? (totalPenaltyNum / totalSum) * 100 : 0;

    // 2. Monthly Income Data
    const { rows: monthlyRows } = await db.query(`
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
          EXTRACT(YEAR FROM CURRENT_DATE)::int AS current_year,
          EXTRACT(MONTH FROM CURRENT_DATE)::int AS current_month
      )
      SELECT 
        m.month_name AS month,
        COALESCE(SUM(p.amount), 0) AS income,
        COALESCE(SUM(p.penalty), 0) AS penalty,
        CASE
          WHEN m.month_num > dr.current_month THEN dr.current_year - 1
          ELSE dr.current_year
        END AS year
      FROM months m
      CROSS JOIN date_ranges dr
      LEFT JOIN payments p ON EXTRACT(MONTH FROM p.payment_date) = m.month_num 
        AND p.finance_id = $1
        AND p.payment_date IS NOT NULL
        AND EXTRACT(YEAR FROM p.payment_date) = 
          CASE 
            WHEN m.month_num > dr.current_month THEN dr.current_year - 1
            ELSE dr.current_year
          END
        AND p.payment_date <= dr.check_date
      GROUP BY m.month_num, m.month_name, dr.current_month, dr.current_year
      ORDER BY year, m.month_num;
    `, [financeId]);

    // 3. Planned vs Actual (Income vs Outcome)
    const { rows: plannedVsActualRows } = await db.query(`
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
          EXTRACT(YEAR FROM CURRENT_DATE)::int AS current_year,
          EXTRACT(MONTH FROM CURRENT_DATE)::int AS current_month
      )
      SELECT 
        m.month_name AS month,
        /* Total Income */
        COALESCE(SUM(p.amount + p.penalty), 0) AS actual_income,
        /* Total Outcome */
        COALESCE(SUM(
          CASE 
            WHEN v.deal_type = 'finance' THEN l.hp_amount
            ELSE 0
          END
        ), 0) + COALESCE(SUM(ve.amount), 0) AS total_outcome,
        CASE
          WHEN m.month_num > dr.current_month THEN dr.current_year - 1
          ELSE dr.current_year
        END AS year
      FROM months m
      CROSS JOIN date_ranges dr
      /* Income */
      LEFT JOIN payments p ON EXTRACT(MONTH FROM p.payment_date) = m.month_num 
        AND EXTRACT(YEAR FROM p.payment_date) =
          CASE
            WHEN m.month_num > dr.current_month THEN dr.current_year - 1
            ELSE dr.current_year
          END
        AND p.payment_date <= dr.check_date
        AND p.finance_id = $1
      /* Loans */
      LEFT JOIN loans l
        ON EXTRACT(MONTH FROM l.hp_date) = m.month_num
        AND EXTRACT(YEAR FROM l.hp_date) =
            CASE
              WHEN m.month_num > dr.current_month THEN dr.current_year - 1
              ELSE dr.current_year
            END
        AND l.hp_date <= dr.check_date
        AND l.finance_id = $2
      /* Vehicle Details */
      LEFT JOIN vehicle_detail v
        ON v.id = l.customer_id
        AND v.finance_id = l.finance_id
      /* Expenses */
      LEFT JOIN vehicle_expenses ve
        ON EXTRACT(MONTH FROM ve.expense_date) = m.month_num
        AND EXTRACT(YEAR FROM ve.expense_date) =
            CASE
              WHEN m.month_num > dr.current_month THEN dr.current_year - 1
              ELSE dr.current_year
            END
        AND ve.expense_date <= dr.check_date
        AND ve.finance_id = $3
      GROUP BY m.month_num, m.month_name, dr.current_month, dr.current_year
      ORDER BY year, m.month_num;
    `, [financeId, financeId, financeId]);

    const monthlyIncomeData = monthlyRows.map(row => ({
      month: row.month,
      income: Number(row.income) + Number(row.penalty),
    }));

    const plannedVsActualData = plannedVsActualRows.map(row => ({
      month: row.month,
      income: Number(row.actual_income) || 0,
      outcome: Number(row.total_outcome) || 0,
    }));

    const incomeVsPenaltyData = [
      { name: "Income", value: Number(incomePercent.toFixed(2)), color: "#22c55e" },
      { name: "Penalty", value: Number(penaltyPercent.toFixed(2)), color: "#ef4444" },
      { name: "Interest Rate", value: Number(avgInterestNum.toFixed(2)), color: "#3b82f6" },
    ];

    res.json({
      success: true,
      incomeVsPenaltyData,
      monthlyIncomeData,
      plannedVsActualData,
    });
  } catch (err) {
    console.error('Error fetching payment details:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to load payment details',
      details: err.message
    });
  }
});

router.post('/customers/:customerId/payments', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  const customerId = req.params.customerId;

  try {
    await conn.query('BEGIN');

    // 1. Verify customer
    const { rows: customerRows } = await conn.query(
      'SELECT hplno FROM customers WHERE id = $1',
      [customerId]
    );

    if (!customerRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const hplno = customerRows[0].hplno;

    // 2. Request data
    const {
      dueDate,
      dueAmount,
      paymentDate,
      billNumber,
      amount,
      last_payment_id,
      last_due_paid,
      penalty,
      collected_by,
      payment_mode,
      payment_mode_1,
      payment_mode_1_amount,
      hand_loan,
      hand_loan_remark,
      remarks,
    } = req.body;

    const totalReceived = Number(amount) || 0;
    const alreadyPaid = Number(last_due_paid) || 0;

    // 3. Payment mode buckets
    let mode1Remaining = totalReceived - Number(payment_mode_1_amount) || 0;
    let mode2Remaining = Number(payment_mode_1_amount) || 0;

    function deductFromModes(needed) {
      const mode1Used = Math.min(needed, mode1Remaining);
      needed -= mode1Used;
      mode1Remaining -= mode1Used;

      const mode2Used = Math.min(needed, mode2Remaining);
      mode2Remaining -= mode2Used;

      return { mode1Used, mode2Used };
    }

    // 4. Step 1 - Old Due Settlement
    const outstandingDebt = last_payment_id
      ? Math.max(0, dueAmount - alreadyPaid)
      : 0;

    let remainingAfterDebt = totalReceived;

    if (outstandingDebt > 0 && last_payment_id !== null) {
      const { mode1Used, mode2Used } = deductFromModes(outstandingDebt);

      await conn.query(`
        INSERT INTO sub_due (
          finance_id, customer_id, payment_id, bill_number, payment_date,
          paid_amount, payment_mode, payment_mode_amount, payment_mode_1,
          payment_mode_1_amount, status, collected_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        req.financeId,
        customerId,
        last_payment_id,
        billNumber,
        paymentDate,
        outstandingDebt,
        payment_mode || 'cash',
        mode1Used,
        payment_mode_1 || null,
        mode2Used,
        'active',
        collected_by || null,
      ]);

      remainingAfterDebt = totalReceived - outstandingDebt;

      const oldStatus = remainingAfterDebt > 0 ? 'paid' : 'partial';

      await conn.query(
        'UPDATE payments SET status = $1 WHERE id = $2',
        [oldStatus, last_payment_id]
      );
    }

    // 5. Step 2 - Current Due
    let remaining = remainingAfterDebt;
    let applyToCurrent = 0;
    let currentPaymentId = null;

    if (remaining > 0) {
      applyToCurrent = Math.min(remaining, dueAmount);
      const { mode1Used: curr1, mode2Used: curr2 } = deductFromModes(applyToCurrent);

      const currentStatus =
        applyToCurrent >= dueAmount
          ? 'paid'
          : applyToCurrent > 0
            ? 'partial'
            : 'pending';

      if (currentStatus !== 'pending') {
        const { rows: payRows } = await conn.query(`
          INSERT INTO payments (
            finance_id, customer_id, due_date, payment_date, bill_number,
            amount, penalty, status, payment_mode, payment_mode_1,
            payment_mode_1_amount, collected_by, hand_loan, hand_loan_remark, remarks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id
        `, [
          req.financeId,
          customerId,
          dueDate,
          paymentDate,
          billNumber,
          applyToCurrent,
          Number(penalty) || 0,
          currentStatus,
          payment_mode || 'cash',
          payment_mode_1 || null,
          curr2,
          collected_by || null,
          Number(hand_loan) || 0,
          hand_loan_remark || null,
          remarks || null,
        ]);

        currentPaymentId = payRows[0]?.id;
      }

      remaining -= applyToCurrent;
    }

    // 6. Step 3 - Multi-Month Advance Allocation
    let advancePaymentIds = [];
    if (remaining > 0) {
      let baseDate = dueDate;
      while (remaining > 0) {
        const parts = baseDate.split('-');
        let year = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
        const nextDueDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

        const payAmount = Math.min(remaining, dueAmount);
        const { mode1Used, mode2Used } = deductFromModes(payAmount);

        const status =
          payAmount >= dueAmount
            ? 'paid'
            : payAmount > 0
              ? 'partial'
              : 'pending';

        const { rows: advRows } = await conn.query(`
          INSERT INTO payments (
            finance_id, customer_id, due_date, payment_date, bill_number,
            amount, penalty, status, payment_mode, payment_mode_1,
            payment_mode_1_amount, collected_by, hand_loan, hand_loan_remark, remarks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id
        `, [
          req.financeId,
          customerId,
          nextDueDate,
          paymentDate,
          billNumber,
          payAmount,
          0,
          status,
          payment_mode || 'cash',
          payment_mode_1 || null,
          mode2Used,
          collected_by || null,
          0,
          null,
          `[Advance auto ₹${payAmount}]`,
        ]);

        if (advRows[0]?.id) {
          advancePaymentIds.push(advRows[0].id);
        }

        remaining -= payAmount;
        baseDate = nextDueDate;
      }
    }

    // 7. Activity log
    await conn.query(`
      INSERT INTO recent_activity (
        finance_id, type, reference_id, description, amount, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.financeId,
      'payment',
      String(hplno),
      `Payment ₹${totalReceived} for ${hplno}`,
      totalReceived,
      collected_by || 'System',
    ]);

    await maintainRecentActivityLimit(conn, req.financeId);

    await conn.query('COMMIT');

    // 8. Response
    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        total_received: totalReceived,
        old_due_cleared: outstandingDebt,
        current_paid: applyToCurrent,
        advance_split: advancePaymentIds.length,
        payment_id: currentPaymentId,
        advance_ids: advancePaymentIds,
      },
    });

  } catch (err) {
    await conn.query('ROLLBACK');
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Payment failed',
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

router.get('/customers/:customerId/payments', enhancedCheckFinance, async (req, res) => {
  try {
    const customerId = req.params.customerId;

    // First verify customer belongs to this finance
    const { rows: customerCheck } = await db.query(
      'SELECT hplno FROM customers WHERE id = $1',
      [customerId]
    );

    if (!customerCheck || customerCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found or not authorized'
      });
    }

    // Fetch all payment details including remarks and hand loan
    const { rows: payments } = await db.query(`
      SELECT 
        p.id,
        TO_CHAR(p.due_date, 'YYYY-MM-DD') AS "dueDate",
        TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS "paymentDate",
        p.bill_number AS "billNumber",
        p.amount,
        p.penalty,
        p.status,
        p.payment_status,
        p.collected_by,
        p.payment_mode,
        p.payment_mode_1,
        p.payment_mode_1_amount,
        p.cancelled_by,
        p.edited_by,
        p.edited_at,
        p.hand_loan,
        p.hand_loan_remark,
        p.remarks,
        p.created_at,
        sd.id AS sub_due_id,
        sd.bill_number AS sub_due_bill_number,
        TO_CHAR(sd.payment_date, 'YYYY-MM-DD') AS sub_due_payment_date,
        sd.paid_amount AS sub_due_paid_amount,
        sd.payment_mode AS sub_due_payment_mode,
        sd.payment_mode_amount AS sub_due_payment_mode_amount,
        sd.payment_mode_1 AS sub_due_payment_mode_1,
        sd.payment_mode_1_amount AS sub_due_payment_mode_1_amount,
        sd.status AS sub_due_status,
        sd.collected_by AS sub_due_collected_by,
        sd.cancelled_by AS sub_due_cancelled_by,
        sd.edited_by AS sub_due_edited_by,
        sd.edited_at AS sub_due_edited_at,
        sd.created_at AS sub_due_created_at,
        ROW_NUMBER() OVER (
          PARTITION BY sd.payment_id 
          ORDER BY sd.payment_date ASC
        ) AS sub_due_row_no
      FROM payments p
      LEFT JOIN sub_due sd ON sd.payment_id = p.id AND sd.customer_id = $1
      WHERE p.customer_id = $2 
      ORDER BY p.id`,
      [customerId, customerId]
    );

    // Group sub_due records under each payment
    const paymentsMap = new Map();

    for (const row of payments) {
      let payment = paymentsMap.get(row.id);

      if (!payment) {
        payment = {
          id: row.id,
          dueDate: row.dueDate,
          paymentDate: row.paymentDate,
          billNumber: row.billNumber,
          amount: parseFloat(row.amount),
          penalty: parseFloat(row.penalty) || 0,
          status: row.status,
          payment_status: row.payment_status,
          collected_by: row.collected_by,
          payment_mode: row.payment_mode,
          payment_mode_1: row.payment_mode_1,
          payment_mode_1_amount: row.payment_mode_1_amount ? parseFloat(row.payment_mode_1_amount) : 0,
          cancelled_by: row.cancelled_by,
          edited_by: row.edited_by,
          edited_at: row.edited_at,
          hand_loan: parseFloat(row.hand_loan) || 0,
          hand_loan_remark: row.hand_loan_remark,
          remarks: row.remarks,
          created_at: row.created_at,
          sub_due: []
        };
        paymentsMap.set(row.id, payment);
      }

      if (row.sub_due_id) {
        payment.sub_due.push({
          id: row.sub_due_id,
          bill_number: row.sub_due_bill_number,
          payment_date: row.sub_due_payment_date,
          paid_amount: parseFloat(row.sub_due_paid_amount),
          payment_mode: row.sub_due_payment_mode,
          payment_mode_amount: parseFloat(row.sub_due_payment_mode_amount) || 0,
          payment_mode_1: row.sub_due_payment_mode_1,
          payment_mode_1_amount: parseFloat(row.sub_due_payment_mode_1_amount) || 0,
          status: row.sub_due_status,
          collected_by: row.sub_due_collected_by,
          cancelled_by: row.sub_due_cancelled_by,
          edited_by: row.sub_due_edited_by,
          edited_at: row.sub_due_edited_at,
          created_at: row.sub_due_created_at,
          row_no: row.sub_due_row_no
        });
      }
    }

    const formattedPayments = Array.from(paymentsMap.values());

    res.json({
      success: true,
      payments: formattedPayments
    });

  } catch (err) {
    console.error('Error fetching payments:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments',
      details: err.message
    });
  }
});

router.get(['/customers/search', '/payment/customers/search'], enhancedCheckFinance, async (req, res) => {
  try {
    const { type, query } = req.query;
    const financeId = req.financeId;

    if (!type || !query) {
      return res.status(400).json({
        success: false,
        error: 'Type and query parameters are required'
      });
    }

    let searchQuery = '';
    let queryParams = [financeId];

    switch (type) {
      case 'hpl':
        searchQuery = `
          SELECT 
            c.id,
            c.hplno,
            c.cname,
            c.loan_status AS "loanStatus",
            vd.vehicle_number,
            l.hp_date AS "hpDate",
            l.due_amount AS "dueAmount",
            l.due_month AS "dueMonth",
            l.interest_rate AS "interestRate",
            COALESCE(
              (SELECT STRING_AGG(DISTINCT con.number, ',') 
               FROM contacts con 
               WHERE con.customer_id = c.id 
               AND con.finance_id = c.finance_id
               AND con.contact_type = 'customer'),
              ''
            ) as contact_numbers,
            COALESCE(
              (SELECT MAX(p.due_date) 
               FROM payments p 
               WHERE p.customer_id = c.id 
               AND p.finance_id = c.finance_id),
              l.hp_date
            ) as "lastDueDate"
          FROM customers c
          LEFT JOIN loans l ON c.id = l.customer_id AND l.finance_id = c.finance_id
          LEFT JOIN vehicle_detail vd ON c.vehicle_id = vd.id AND vd.finance_id = c.finance_id
          WHERE c.finance_id = $1 AND (c.id::text = $2 OR c.hplno::text = $2)
          LIMIT 1
        `;
        queryParams.push(String(query).trim());
        break;

      case 'vehicle':
        searchQuery = `
          SELECT 
            c.id,
            c.hplno,
            c.cname,
            c.loan_status AS "loanStatus",
            vd.vehicle_number,
            l.hp_date AS "hpDate",
            l.due_amount AS "dueAmount",
            l.due_month AS "dueMonth",
            l.interest_rate AS "interestRate",
            COALESCE(
              (SELECT STRING_AGG(DISTINCT con.number, ',') 
               FROM contacts con 
               WHERE con.customer_id = c.id
               AND con.finance_id = c.finance_id
               AND con.contact_type = 'customer'),
              ''
            ) as contact_numbers,
            COALESCE(
              (SELECT MAX(p.due_date) 
               FROM payments p 
               WHERE p.customer_id = c.id 
               AND p.finance_id = c.finance_id),
              l.hp_date
            ) as "lastDueDate"
          FROM customers c
          LEFT JOIN loans l ON c.id = l.customer_id AND l.finance_id = c.finance_id
          LEFT JOIN vehicle_detail vd ON c.vehicle_id = vd.id AND vd.finance_id = c.finance_id
          WHERE c.finance_id = $1 AND vd.vehicle_number ILIKE $2
          LIMIT 1
        `;
        queryParams.push(`%${query}%`);
        break;

      case 'contact':
        searchQuery = `
          SELECT 
            c.id,
            c.hplno,
            c.cname,
            c.loan_status AS "loanStatus",
            vd.vehicle_number,
            l.hp_date AS "hpDate",
            l.due_amount AS "dueAmount",
            l.due_month AS "dueMonth",
            l.interest_rate AS "interestRate",
            COALESCE(
              (SELECT STRING_AGG(DISTINCT con.number, ',') 
               FROM contacts con 
               WHERE con.customer_id = c.id 
               AND con.finance_id = c.finance_id
               AND con.contact_type = 'customer'),
              ''
            ) as contact_numbers,
            COALESCE(
              (SELECT MAX(p.due_date) 
               FROM payments p 
               WHERE p.customer_id = c.id 
               AND p.finance_id = c.finance_id),
              l.hp_date
            ) as "lastDueDate"
          FROM customers c
          LEFT JOIN loans l ON c.id = l.customer_id AND l.finance_id = c.finance_id
          LEFT JOIN vehicle_detail vd ON c.vehicle_id = vd.id AND vd.finance_id = c.finance_id
          WHERE c.finance_id = $1 
            AND EXISTS (
              SELECT 1 FROM contacts con 
              WHERE con.customer_id = c.id 
              AND con.finance_id = c.finance_id
              AND con.number LIKE $2
              AND con.contact_type = 'customer'
            )
          LIMIT 1
        `;
        queryParams.push(`%${query}%`);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid search type. Use: hpl, vehicle, or contact'
        });
    }

    const { rows: results } = await db.query(searchQuery, queryParams);

    if (results.length === 0) {
      return res.json({
        success: true,
        customer: null,
        message: 'No customer found'
      });
    }

    const customer = results[0];

    let contactNumbers = [];
    if (customer.contact_numbers && customer.contact_numbers.trim() !== '') {
      contactNumbers = customer.contact_numbers
        .split(',')
        .map(num => num.trim())
        .filter(num => num !== '');
    }

    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    };

    const responseCustomer = {
      id: customer.id.toString(),
      hplno: customer.hplno ? customer.hplno.toString() : '',
      cname: customer.cname || '',
      loanStatus: customer.loanStatus || 'active',
      vehicle_number: customer.vehicle_number || '',
      hpDate: formatDate(customer.hpDate),
      dueAmount: customer.dueAmount ? Number(customer.dueAmount) : 0,
      dueMonth: customer.dueMonth ? Number(customer.dueMonth) : 0,
      interestRate: customer.interestRate ? Number(customer.interestRate) : 0,
      contact_numbers: contactNumbers,
      lastDueDate: formatDate(customer.lastDueDate)
    };

    res.json({
      success: true,
      customer: responseCustomer,
      message: 'Customer found successfully'
    });

  } catch (err) {
    console.error('Error searching customer:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to search customer',
      details: err.message
    });
  }
});

router.put(['/:id', '/payments/:id'], enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const paymentId = req.params.id;
    const financeId = req.financeId;

    const {
      dueDate,
      paymentDate,
      billNumber,
      amount,
      penalty,
      collected_by,
      payment_mode,
      payment_mode_1,
      payment_mode_1_amount,
      hand_loan,
      hand_loan_remark,
      remarks
    } = req.body;

    const { rows: paymentCheck } = await conn.query(
      'SELECT id FROM payments WHERE id = $1 AND finance_id = $2',
      [paymentId, financeId]
    );

    if (!paymentCheck || paymentCheck.length === 0) {
      await conn.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Payment not found or not authorized'
      });
    }

    await conn.query(`
      UPDATE payments SET
        due_date = $1,
        payment_date = $2,
        bill_number = $3,
        amount = $4,
        penalty = $5,
        collected_by = $6,
        payment_mode = $7,
        payment_mode_1 = $8,
        payment_mode_1_amount = $9,
        hand_loan = $10,
        hand_loan_remark = $11,
        remarks = $12,
        edited_by = $13,
        edited_at = NOW()
      WHERE id = $14 AND finance_id = $15
    `, [
      dueDate,
      paymentDate,
      billNumber,
      Number(amount) || 0,
      Number(penalty) || 0,
      collected_by,
      payment_mode || 'cash',
      payment_mode_1 || null,
      Number(payment_mode_1_amount) || 0,
      Number(hand_loan) || 0,
      hand_loan_remark || null,
      remarks || null,
      collected_by,
      paymentId,
      financeId
    ]);

    await conn.query(`
      INSERT INTO recent_activity (
        finance_id, type, reference_id, description, amount, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      financeId,
      'payment',
      paymentId,
      `Payment updated: ₹${amount} for payment ID ${paymentId}`,
      Number(amount) || 0,
      collected_by || 'System'
    ]);

    await conn.query('COMMIT');

    res.json({
      success: true,
      message: 'Payment updated successfully'
    });

  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('Error updating payment:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment',
      details: err.message
    });
  } finally {
    conn.release();
  }
});

router.delete(['/:id', '/payments/:id'], enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const paymentId = req.params.id;
    const financeId = req.financeId;

    const { rows: paymentDetails } = await conn.query(
      `SELECT p.id, p.customer_id, p.amount, p.bill_number AS "billNumber", c.cname, c.hplno AS customer_hplno 
       FROM payments p
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE p.id = $1 AND p.finance_id = $2`,
      [paymentId, financeId]
    );

    if (!paymentDetails || paymentDetails.length === 0) {
      await conn.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Payment not found or not authorized'
      });
    }

    const payment = paymentDetails[0];

    const deleteResult = await conn.query(
      'DELETE FROM payments WHERE id = $1 AND finance_id = $2',
      [paymentId, financeId]
    );

    if (deleteResult.rowCount === 0) {
      await conn.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    await conn.query(`
      INSERT INTO recent_activity (
        finance_id, type, reference_id, description, amount, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      financeId,
      'payment',
      String(payment.customer_hplno || paymentId),
      `Payment deleted: ₹${payment.amount} (Bill: ${payment.billNumber}) for ${payment.cname}`,
      Number(payment.amount) || 0,
      req.user?.user_name || 'System'
    ]);

    await conn.query('COMMIT');

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });

  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('Error deleting payment:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete payment',
      details: err.message
    });
  } finally {
    conn.release();
  }
});

module.exports = router;

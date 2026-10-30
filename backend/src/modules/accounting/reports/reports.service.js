// routes/reports/reports.service.js
const { db } = require('../../../config/database.config');

// â”€â”€â”€ Trial Balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getTrialBalance = async (finance_id, financial_year) => {
  const [rows] = await db.query(
    `SELECT
       g.nature,
       g.group_name,
       g.sort_order    AS group_sort,
       l.id            AS ledger_id,
       l.ledger_name,
       COALESCE(b.opening_dr, 0)  AS opening_dr,
       COALESCE(b.opening_cr, 0)  AS opening_cr,
       COALESCE(b.period_dr,  0)  AS period_dr,
       COALESCE(b.period_cr,  0)  AS period_cr,
       COALESCE(b.closing_dr, 0)  AS closing_dr,
       COALESCE(b.closing_cr, 0)  AS closing_cr
     FROM acc_ledgers l
     JOIN acc_ledger_groups g ON g.id = l.group_id
     LEFT JOIN acc_ledger_balances b
       ON b.ledger_id = l.id
      AND b.finance_id = l.finance_id
      AND b.financial_year = ?
     WHERE l.finance_id = ? AND l.is_active = 1
       AND (COALESCE(b.closing_dr,0) > 0 OR COALESCE(b.closing_cr,0) > 0)
     ORDER BY g.sort_order, g.group_name, l.ledger_name`,
    [financial_year, finance_id]
  );

  // Group by nature â†’ group_name
  const grouped = {};
  let totalDr = 0, totalCr = 0;

  rows.forEach(r => {
    if (!grouped[r.group_name]) {
      grouped[r.group_name] = {
        group_name: r.group_name,
        nature: r.nature,
        ledgers: [],
        group_dr: 0,
        group_cr: 0,
      };
    }
    grouped[r.group_name].ledgers.push(r);
    grouped[r.group_name].group_dr += parseFloat(r.closing_dr);
    grouped[r.group_name].group_cr += parseFloat(r.closing_cr);
    totalDr += parseFloat(r.closing_dr);
    totalCr += parseFloat(r.closing_cr);
  });

  return {
    groups: Object.values(grouped),
    totalDr,
    totalCr,
    isBalanced: Math.abs(totalDr - totalCr) < 0.01,
  };
};

// â”€â”€â”€ Day Book â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getDayBook = async (finance_id, from_date, to_date) => {
  const [vouchers] = await db.query(
    `SELECT
       v.id,
       v.voucher_date,
       v.voucher_number,
       v.narration,
       v.total_amount,
       v.status,
       vt.type_name  AS voucher_type,
       vt.class      AS voucher_class,
       vt.type_code
     FROM acc_vouchers v
     JOIN acc_voucher_types vt ON vt.id = v.voucher_type_id
     WHERE v.finance_id = ?
       AND v.voucher_date BETWEEN ? AND ?
       AND v.status = 'Posted'
     ORDER BY v.voucher_date DESC, v.id DESC`,
    [finance_id, from_date, to_date]
  );

  if (vouchers.length === 0) {
    return { byDate: {}, totalDr: 0, totalCr: 0 };
  }

  const vids = vouchers.map(v => v.id);
  const [entries] = await db.query(
    `SELECT
       e.voucher_id,
       e.entry_type,
       e.amount,
       l.ledger_name
     FROM acc_voucher_entries e
     JOIN acc_ledgers l ON l.id = e.ledger_id
     WHERE e.voucher_id IN (?)`,
    [vids]
  );

  const entryMap = {};
  entries.forEach(e => {
    if (!entryMap[e.voucher_id]) entryMap[e.voucher_id] = [];
    entryMap[e.voucher_id].push(e);
  });

  // Group by date
  const byDate = {};
  let totalDr = 0, totalCr = 0;

  vouchers.forEach(v => {
    const date = typeof v.voucher_date === 'string'
      ? v.voucher_date
      : v.voucher_date.toISOString().split('T')[0];

    if (!byDate[date]) byDate[date] = [];
    const vEntries = entryMap[v.id] || [];
    const vDr = vEntries.filter(e => e.entry_type === 'Dr').reduce((s, e) => s + parseFloat(e.amount), 0);
    const vCr = vEntries.filter(e => e.entry_type === 'Cr').reduce((s, e) => s + parseFloat(e.amount), 0);
    totalDr += vDr;
    totalCr += vCr;
    byDate[date].push({ ...v, entries: vEntries });
  });

  return { byDate, totalDr, totalCr };
};

// â”€â”€â”€ Profit & Loss â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getPnL = async (finance_id, financial_year) => {
  const [rows] = await db.query(
    `SELECT
       g.nature,
       g.group_name,
       g.affects_gross_profit,
       g.sort_order,
       l.id            AS ledger_id,
       l.ledger_name,
       COALESCE(b.closing_dr, 0)  AS closing_dr,
       COALESCE(b.closing_cr, 0)  AS closing_cr
     FROM acc_ledgers l
     JOIN acc_ledger_groups g ON g.id = l.group_id
     LEFT JOIN acc_ledger_balances b
       ON b.ledger_id = l.id
      AND b.finance_id = l.finance_id
      AND b.financial_year = ?
     WHERE l.finance_id = ?
       AND g.nature IN ('Income','Expenses')
       AND l.is_active = 1
     ORDER BY g.nature DESC, g.sort_order, l.ledger_name`,
    [financial_year, finance_id]
  );

  const income   = { groups: {}, total: 0 };
  const expenses = { groups: {}, total: 0 };

  rows.forEach(r => {
    const amount = r.nature === 'Income'
      ? parseFloat(r.closing_cr) - parseFloat(r.closing_dr)   // income = net credit
      : parseFloat(r.closing_dr) - parseFloat(r.closing_cr);  // expense = net debit

    const bucket = r.nature === 'Income' ? income : expenses;
    if (!bucket.groups[r.group_name]) {
      bucket.groups[r.group_name] = {
        group_name: r.group_name,
        nature: r.nature,
        ledgers: [],
        total: 0,
      };
    }
    bucket.groups[r.group_name].ledgers.push({ ...r, amount });
    bucket.groups[r.group_name].total += amount;
    bucket.total += amount;
  });

  const netProfit = income.total - expenses.total;

  return {
    income:   { groups: Object.values(income.groups),   total: income.total },
    expenses: { groups: Object.values(expenses.groups), total: expenses.total },
    netProfit,
    isProfit: netProfit >= 0,
  };
};

// â”€â”€â”€ Balance Sheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getBalanceSheet = async (finance_id, financial_year) => {
  const [rows] = await db.query(
    `SELECT
       g.nature,
       g.group_name,
       g.sort_order,
       l.id            AS ledger_id,
       l.ledger_name,
       COALESCE(b.closing_dr, 0)  AS closing_dr,
       COALESCE(b.closing_cr, 0)  AS closing_cr
     FROM acc_ledgers l
     JOIN acc_ledger_groups g ON g.id = l.group_id
     LEFT JOIN acc_ledger_balances b
       ON b.ledger_id = l.id
      AND b.finance_id = l.finance_id
      AND b.financial_year = ?
     WHERE l.finance_id = ?
       AND g.nature IN ('Assets','Liabilities')
       AND l.is_active = 1
     ORDER BY g.sort_order, l.ledger_name`,
    [financial_year, finance_id]
  );

  const assets      = { groups: {}, total: 0 };
  const liabilities = { groups: {}, total: 0 };

  rows.forEach(r => {
    const amount = r.nature === 'Assets'
      ? parseFloat(r.closing_dr) - parseFloat(r.closing_cr)  // assets = net debit
      : parseFloat(r.closing_cr) - parseFloat(r.closing_dr); // liabilities = net credit

    const bucket = r.nature === 'Assets' ? assets : liabilities;
    if (!bucket.groups[r.group_name]) {
      bucket.groups[r.group_name] = {
        group_name: r.group_name,
        nature: r.nature,
        ledgers: [],
        total: 0,
      };
    }
    bucket.groups[r.group_name].ledgers.push({ ...r, amount });
    bucket.groups[r.group_name].total += amount;
    bucket.total += amount;
  });

  return {
    assets:      { groups: Object.values(assets.groups),      total: assets.total },
    liabilities: { groups: Object.values(liabilities.groups), total: liabilities.total },
  };
};

// â”€â”€â”€ Cash Flow (Cash & Bank ledgers only, grouped by month) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getCashFlow = async (finance_id, from_date, to_date) => {
  // Get all Cash/Bank ledger transactions in the period
  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(v.voucher_date, '%Y-%m') AS month_key,
       DATE_FORMAT(v.voucher_date, '%b %Y') AS month_label,
       e.entry_type,
       SUM(e.amount) AS total
     FROM acc_voucher_entries e
     JOIN acc_vouchers  v  ON v.id  = e.voucher_id
     JOIN acc_ledgers   l  ON l.id  = e.ledger_id
     WHERE e.finance_id = ?
       AND v.voucher_date BETWEEN ? AND ?
       AND v.status = 'Posted'
       AND (l.is_bank_account = 1 OR l.ledger_code = 'CASH')
     GROUP BY month_key, month_label, e.entry_type
     ORDER BY month_key`,
    [finance_id, from_date, to_date]
  );

  // Pivot: month â†’ { inflow (Dr into cash/bank), outflow (Cr out of cash/bank) }
  const monthMap = {};

  rows.forEach(r => {
    if (!monthMap[r.month_key]) {
      monthMap[r.month_key] = { month: r.month_label, inflow: 0, outflow: 0, net: 0 };
    }
    const amount = parseFloat(r.total);
    if (r.entry_type === 'Dr') {
      monthMap[r.month_key].inflow += amount;   // money coming in (Dr to cash/bank)
    } else {
      monthMap[r.month_key].outflow += amount;  // money going out (Cr from cash/bank)
    }
    monthMap[r.month_key].net = monthMap[r.month_key].inflow - monthMap[r.month_key].outflow;
  });

  const data = Object.values(monthMap);
  const totalInflow  = data.reduce((s, d) => s + d.inflow,  0);
  const totalOutflow = data.reduce((s, d) => s + d.outflow, 0);

  return { data, totalInflow, totalOutflow, netFlow: totalInflow - totalOutflow };
};

// ─── Balances Report ─────────────────────────────────────────────────────────
exports.getBalances = async (financeId, { fromDate, toDate, search } = {}) => {
  const whereClauses = ['c.finance_id = $1::uuid'];
  const queryParams = [financeId];

  if (fromDate && String(fromDate).trim()) {
    queryParams.push(String(fromDate).trim());
    whereClauses.push(`l.hp_date >= $${queryParams.length}::date`);
  }

  if (search && String(search).trim()) {
    queryParams.push(`%${String(search).trim()}%`);
    const pIdx = queryParams.length;
    whereClauses.push(`(c.cname ILIKE $${pIdx} OR c.hplno::text ILIKE $${pIdx})`);
  }

  let paymentToDateParam = '';
  if (toDate && String(toDate).trim()) {
    queryParams.push(String(toDate).trim());
    paymentToDateParam = `AND p.payment_date <= $${queryParams.length}::date`;
  }

  const sql = `
    SELECT 
      c.id AS customer_id,
      c.cname AS customer,
      COALESCE(c.hplno::text, '') AS loan_no,
      l.hp_amount,
      l.due_amount,
      l.due_month,
      l.interest_rate,
      l.interest_part,
      l.principle_part,
      l.penalty_amount,
      l.penalty_days,
      COALESCE(pay.total_amount_paid, 0) AS total_amount_paid,
      COALESCE(pay.total_interest_paid, 0) AS total_interest_paid,
      COALESCE(pay.total_penalty_paid, 0) AS total_penalty_paid,
      COALESCE(pay.late_days, 0) AS late_days,
      COALESCE(sz.total_seizing, 0) AS total_seizing,
      COALESCE(sz.paid_seizing, 0) AS paid_seizing
    FROM customers c
    LEFT JOIN loans l ON l.customer_id = c.id AND l.finance_id = c.finance_id
    LEFT JOIN (
      SELECT 
        p.customer_id,
        SUM(p.amount) AS total_amount_paid,
        SUM(p.penalty) AS total_penalty_paid,
        SUM(CASE 
          WHEN l_sub.due_amount > 0 AND l_sub.interest_part > 0 
          THEN LEAST(p.amount, ROUND((p.amount / l_sub.due_amount) * l_sub.interest_part)) 
          ELSE 0 
        END) AS total_interest_paid,
        SUM(CASE 
          WHEN p.payment_date > p.due_date AND p.amount > 0 
          THEN (p.payment_date - p.due_date) 
          ELSE 0 
        END) AS late_days
      FROM payments p
      LEFT JOIN LATERAL (
        SELECT l2.due_amount, l2.interest_part 
        FROM loans l2 
        WHERE l2.customer_id = p.customer_id AND l2.finance_id = p.finance_id
        ORDER BY l2.due_date DESC NULLS LAST, l2.id DESC LIMIT 1
      ) l_sub ON true
      WHERE p.finance_id = $1::uuid 
        AND p.payment_status IS DISTINCT FROM 'cancelled'
        ${paymentToDateParam}
      GROUP BY p.customer_id
    ) pay ON pay.customer_id = c.id
    LEFT JOIN (
      SELECT 
        customer_id,
        COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN seizing_charge ELSE 0 END), 0) AS total_seizing,
        COALESCE(SUM(CASE WHEN status = 'Paid' THEN seizing_charge ELSE 0 END), 0) AS paid_seizing
      FROM seizing_vehicle
      WHERE finance_id = $1::uuid
      GROUP BY customer_id
    ) sz ON sz.customer_id = c.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY c.hplno ASC
  `;

  const { rows } = await db.query(sql, queryParams);

  const principal = [];
  const interest = [];
  const penalty = [];
  const seizing = [];

  for (const row of rows) {
    const customer = row.customer || '';
    const loanNo = row.loan_no || '';

    // Principal & Interest (only when loan exists)
    if (row.hp_amount !== null) {
      const pTotal = Number(row.hp_amount) || 0;
      const pReceived = Math.max(0, (Number(row.total_amount_paid) || 0) - (Number(row.total_interest_paid) || 0));
      const pBalance = Math.max(0, pTotal - pReceived);
      principal.push({ customer, loanNo, total: pTotal, received: pReceived, balance: pBalance });

      const dueMonth = Number(row.due_month) || 0;
      const interestPart = Number(row.interest_part) || 0;
      const iTotal = interestPart > 0 
        ? interestPart * dueMonth 
        : ((pTotal * (Number(row.interest_rate) || 0) * dueMonth) / 100);
      const iReceived = Number(row.total_interest_paid) || 0;
      const iBalance = Math.max(0, iTotal - iReceived);
      interest.push({ customer, loanNo, total: iTotal, received: iReceived, balance: iBalance });
    }

    // Penalty (only total > 0)
    const penaltyRate = Number(row.penalty_amount) || 0;
    const penaltyDays = Number(row.penalty_days) || 0;
    const lateDays = Number(row.late_days) || 0;
    const effectiveDays = Math.max(penaltyDays, lateDays);
    const penReceived = Number(row.total_penalty_paid) || 0;
    const penTotal = Math.max(penaltyRate * effectiveDays, penReceived);
    const penBalance = Math.max(0, penTotal - penReceived);
    if (penTotal > 0) {
      penalty.push({ customer, loanNo, total: penTotal, received: penReceived, balance: penBalance });
    }

    // Seizing (only total > 0)
    const szTotal = Number(row.total_seizing) || 0;
    const szReceived = Number(row.paid_seizing) || 0;
    const szBalance = Math.max(0, szTotal - szReceived);
    if (szTotal > 0) {
      seizing.push({ customer, loanNo, total: szTotal, received: szReceived, balance: szBalance });
    }
  }

  return { principal, interest, penalty, seizing };
};

// ─── Charges Report ──────────────────────────────────────────────────────────
exports.getCharges = async (financeId, filters = {}) => {
  const {
    dateFrom,
    dateTo,
    loanNo,
    customer,
    amountMin,
    amountMax,
    street,
    village,
    city,
    dealType,
  } = filters;

  const whereClauses = ['c.finance_id = $1::uuid'];
  const queryParams = [financeId];

  if (dateFrom && String(dateFrom).trim()) {
    queryParams.push(String(dateFrom).trim());
    whereClauses.push(`l.hp_date >= $${queryParams.length}::date`);
  }
  if (dateTo && String(dateTo).trim()) {
    queryParams.push(String(dateTo).trim());
    whereClauses.push(`l.hp_date <= $${queryParams.length}::date`);
  }

  if (customer && String(customer).trim()) {
    queryParams.push(`%${String(customer).trim()}%`);
    whereClauses.push(`c.cname ILIKE $${queryParams.length}`);
  }

  if (loanNo && String(loanNo).trim()) {
    queryParams.push(`%${String(loanNo).trim()}%`);
    whereClauses.push(`c.hplno::text ILIKE $${queryParams.length}`);
  }

  if (street && String(street).trim()) {
    queryParams.push(`%${String(street).trim()}%`);
    whereClauses.push(`(a.street ILIKE $${queryParams.length} OR a.street_name ILIKE $${queryParams.length})`);
  }
  if (village && String(village).trim()) {
    queryParams.push(`%${String(village).trim()}%`);
    whereClauses.push(`a.village ILIKE $${queryParams.length}`);
  }
  if (city && String(city).trim()) {
    queryParams.push(`%${String(city).trim()}%`);
    whereClauses.push(`a.city ILIKE $${queryParams.length}`);
  }

  if (dealType && String(dealType).trim() && String(dealType).toLowerCase() !== 'all') {
    const dtLower = String(dealType).trim().toLowerCase();
    if (dtLower === 'finance') {
      whereClauses.push(`(l.loan_type = 'finance' OR l.loan_type IS NULL)`);
    } else if (dtLower === 'consulting') {
      whereClauses.push(`l.loan_type = 'consulting'`);
    }
  }

  const sql = `
    SELECT 
      c.id,
      c.cname AS customer,
      COALESCE(c.hplno::text, '') AS loan_no,
      CASE 
        WHEN LOWER(COALESCE(l.loan_type, '')) = 'consulting' THEN 'Consulting'
        ELSE 'Finance'
      END AS deal_type,
      COALESCE(l.documentation_charge, 0) AS doc_charges,
      0.00 AS processing_fee,
      COALESCE(pay.total_penalty_paid, 0) AS penalty,
      COALESCE(sz.total_seizing, 0) AS seizing_charges,
      (COALESCE(l.documentation_charge, 0) + COALESCE(pay.total_penalty_paid, 0) + COALESCE(sz.total_seizing, 0)) AS total,
      COALESCE(TO_CHAR(l.hp_date, 'YYYY-MM-DD'), TO_CHAR(c.created_at, 'YYYY-MM-DD'), '') AS date,
      COALESCE(a.street, a.street_name, '') AS street,
      COALESCE(a.village, '') AS village,
      COALESCE(a.city, '') AS city
    FROM customers c
    LEFT JOIN loans l ON l.customer_id = c.id AND l.finance_id = c.finance_id
    LEFT JOIN (
      SELECT 
        customer_id,
        SUM(penalty) AS total_penalty_paid
      FROM payments
      WHERE finance_id = $1::uuid AND payment_status IS DISTINCT FROM 'cancelled'
      GROUP BY customer_id
    ) pay ON pay.customer_id = c.id
    LEFT JOIN (
      SELECT 
        customer_id,
        COALESCE(SUM(seizing_charge), 0) AS total_seizing
      FROM seizing_vehicle
      WHERE finance_id = $1::uuid AND status != 'Cancelled'
      GROUP BY customer_id
    ) sz ON sz.customer_id = c.id
    LEFT JOIN addresses a ON a.id = (
      SELECT ah.address_id 
      FROM address_history ah 
      WHERE ah.entity_id = c.id::text AND ah.entity_type = 'customer' 
      ORDER BY ah.is_current DESC, ah.id DESC 
      LIMIT 1
    )
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY c.hplno ASC
  `;

  const { rows } = await db.query(sql, queryParams);

  let data = rows.map(r => ({
    id: r.id,
    customer: r.customer,
    loanNo: r.loan_no,
    dealType: r.deal_type,
    docCharges: parseFloat(r.doc_charges) || 0,
    processingFee: 0,
    penalty: parseFloat(r.penalty) || 0,
    seizingCharges: parseFloat(r.seizing_charges) || 0,
    total: parseFloat(r.total) || 0,
    date: r.date,
    street: r.street,
    village: r.village,
    city: r.city,
  }));

  const streets = [...new Set(data.map(r => r.street).filter(Boolean))].sort();
  const villages = [...new Set(data.map(r => r.village).filter(Boolean))].sort();
  const cities = [...new Set(data.map(r => r.city).filter(Boolean))].sort();

  if (amountMin !== undefined && amountMin !== '' && !isNaN(Number(amountMin))) {
    data = data.filter(r => r.total >= Number(amountMin));
  }
  if (amountMax !== undefined && amountMax !== '' && !isNaN(Number(amountMax))) {
    data = data.filter(r => r.total <= Number(amountMax));
  }

  return {
    rows: data,
    filters: { streets, villages, cities },
  };
};

// ─── Compliance Report ───────────────────────────────────────────────────────
exports.getCompliance = async (financeId, { mode = 'All', search, fromDate, toDate } = {}) => {
  const queryParams = [financeId];
  const customerWhere = `c.finance_id = $1::uuid AND c.loan_status = 'active'`;
  const inventoryWhere = `v.finance_id = $1::uuid AND (v.status = 'available' OR v.id NOT IN (
    SELECT vehicle_id FROM customers WHERE finance_id = $1::uuid AND loan_status = 'active' AND vehicle_id IS NOT NULL
  ))`;

  const customerSql = `
    SELECT 
      c.id AS entity_id,
      c.cname AS customer,
      COALESCE(c.hplno::text, '—') AS loan_no,
      TRIM(CONCAT(COALESCE(vi.brand, ''), ' ', COALESCE(vi.model_name, v.vehicle_modal, ''), ' (', v.vehicle_number, ')')) AS vehicle,
      TO_CHAR(v.insurance_expiry_date, 'YYYY-MM-DD') AS insurance_expiry,
      TO_CHAR(v.fc_expiry_date, 'YYYY-MM-DD') AS fc_expiry
    FROM customers c
    JOIN vehicle_detail v ON c.vehicle_id = v.id
    LEFT JOIN vehicle_info vi ON v.vehicle_info_id = vi.id
    WHERE ${customerWhere}
  `;

  const inventorySql = `
    SELECT 
      v.id AS entity_id,
      'Inventory / Dealership' AS customer,
      '—' AS loan_no,
      TRIM(CONCAT(COALESCE(vi.brand, ''), ' ', COALESCE(vi.model_name, v.vehicle_modal, ''), ' (', v.vehicle_number, ')')) AS vehicle,
      TO_CHAR(v.insurance_expiry_date, 'YYYY-MM-DD') AS insurance_expiry,
      TO_CHAR(v.fc_expiry_date, 'YYYY-MM-DD') AS fc_expiry
    FROM vehicle_detail v
    LEFT JOIN vehicle_info vi ON v.vehicle_info_id = vi.id
    WHERE ${inventoryWhere}
  `;

  let combinedRows = [];
  const normalizedMode = String(mode || 'All').toLowerCase();

  if (normalizedMode === 'customer') {
    const { rows } = await db.query(customerSql, queryParams);
    combinedRows = rows;
  } else if (normalizedMode === 'vehicle') {
    const { rows } = await db.query(inventorySql, queryParams);
    combinedRows = rows;
  } else {
    const [custRes, invRes] = await Promise.all([
      db.query(customerSql, queryParams),
      db.query(inventorySql, queryParams),
    ]);
    combinedRows = [...custRes.rows, ...invRes.rows];
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const todayMs = new Date(todayStr).getTime();
  const thirtyDaysMs = todayMs + (30 * 24 * 60 * 60 * 1000);

  const getStatus = (dateStr) => {
    const dMs = new Date(dateStr).getTime();
    if (dMs < todayMs) return 'Expired';
    if (dMs <= thirtyDaysMs) return 'Expiring Soon';
    return 'Valid';
  };

  const results = [];
  let rowId = 1;

  for (const r of combinedRows) {
    if (r.insurance_expiry) {
      results.push({
        id: `${r.entity_id}-ins-${rowId++}`,
        customer: r.customer,
        loanNo: r.loan_no,
        vehicle: r.vehicle,
        type: 'Insurance',
        expiryDate: r.insurance_expiry,
        status: getStatus(r.insurance_expiry),
      });
    }

    if (r.fc_expiry) {
      results.push({
        id: `${r.entity_id}-fc-${rowId++}`,
        customer: r.customer,
        loanNo: r.loan_no,
        vehicle: r.vehicle,
        type: 'FC',
        expiryDate: r.fc_expiry,
        status: getStatus(r.fc_expiry),
      });
    }
  }

  let filtered = results;
  if (fromDate && String(fromDate).trim()) {
    const fromStr = String(fromDate).trim();
    filtered = filtered.filter(item => item.expiryDate >= fromStr);
  }
  if (toDate && String(toDate).trim()) {
    const toStr = String(toDate).trim();
    filtered = filtered.filter(item => item.expiryDate <= toStr);
  }

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    filtered = filtered.filter(item => 
      item.customer.toLowerCase().includes(q) ||
      item.loanNo.toLowerCase().includes(q) ||
      item.vehicle.toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  return filtered;
};


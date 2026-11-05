// routes/reports/reports.service.js
const { db } = require('../../../config/database.config');

// â”€â”€â”€ Trial Balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getTrialBalance = async (financeId, options = {}) => {
  let fromDate, toDate;
  if (typeof options === 'string') {
    if (/^\d{4}-\d{4}$/.test(options)) {
      const [y1, y2] = options.split('-');
      fromDate = `${y1}-04-01`;
      toDate = `${y2}-03-31`;
    } else {
      fromDate = '2026-04-01';
      toDate = '2026-10-31';
    }
  } else {
    fromDate = options.from;
    toDate = options.to;
  }

  const query = `
    WITH fy_info AS (
      SELECT
        $2::date AS from_date,
        $3::date AS to_date,
        MAKE_DATE(
          CASE WHEN EXTRACT(MONTH FROM $2::date)::int >= 4 
               THEN EXTRACT(YEAR FROM $2::date)::int 
               ELSE EXTRACT(YEAR FROM $2::date)::int - 1 
          END, 4, 1
        ) AS fy_start_date
    ),
    prior_mov AS (
      SELECT
        ve.ledger_id,
        COALESCE(SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE 0 END), 0) AS prior_dr,
        COALESCE(SUM(CASE WHEN ve.entry_type = 'Cr' THEN ve.amount ELSE 0 END), 0) AS prior_cr
      FROM acc_voucher_entries ve
      JOIN acc_vouchers v ON v.id = ve.voucher_id
      CROSS JOIN fy_info fi
      JOIN acc_ledgers l ON l.id = ve.ledger_id
      LEFT JOIN acc_group_master gm ON gm.id = l.master_group_id
      LEFT JOIN acc_ledger_groups lg ON lg.id = l.group_id
      WHERE ve.finance_id = $1
        AND v.status != 'Cancelled'
        AND v.voucher_date < fi.from_date
        AND (
          COALESCE(gm.nature, lg.nature) IN ('Assets', 'Liabilities')
          OR (
            COALESCE(gm.nature, lg.nature) IN ('Income', 'Expenses')
            AND v.voucher_date >= fi.fy_start_date
          )
        )
      GROUP BY ve.ledger_id
    ),
    period_mov AS (
      SELECT
        ve.ledger_id,
        COALESCE(SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE 0 END), 0) AS period_dr,
        COALESCE(SUM(CASE WHEN ve.entry_type = 'Cr' THEN ve.amount ELSE 0 END), 0) AS period_cr
      FROM acc_voucher_entries ve
      JOIN acc_vouchers v ON v.id = ve.voucher_id
      CROSS JOIN fy_info fi
      WHERE ve.finance_id = $1
        AND v.status != 'Cancelled'
        AND v.voucher_date >= fi.from_date
        AND v.voucher_date <= fi.to_date
      GROUP BY ve.ledger_id
    )
    SELECT
      l.id AS ledger_id,
      l.ledger_name,
      COALESCE(gm.nature, lg.nature) AS nature,
      COALESCE(gm.group_name, lg.group_name) AS group_name,
      COALESCE(gm.id, lg.id) AS group_id,
      CASE 
        WHEN COALESCE(gm.nature, lg.nature) IN ('Income', 'Expenses') THEN 0
        WHEN l.ob_type = 'Cr' THEN -l.opening_balance
        ELSE l.opening_balance
      END AS master_opening,
      COALESCE(pm.prior_dr, 0) - COALESCE(pm.prior_cr, 0) AS prior_net,
      COALESCE(cur.period_dr, 0) AS period_dr,
      COALESCE(cur.period_cr, 0) AS period_cr
    FROM acc_ledgers l
    LEFT JOIN acc_group_master gm ON gm.id = l.master_group_id
    LEFT JOIN acc_ledger_groups lg ON lg.id = l.group_id
    LEFT JOIN prior_mov pm ON pm.ledger_id = l.id
    LEFT JOIN period_mov cur ON cur.ledger_id = l.id
    WHERE l.finance_id = $1
      AND l.is_active = true
      AND l.inactive = false
    ORDER BY 
      CASE COALESCE(gm.nature, lg.nature)
        WHEN 'Assets' THEN 1
        WHEN 'Liabilities' THEN 2
        WHEN 'Income' THEN 3
        WHEN 'Expenses' THEN 4
        ELSE 5
      END,
      COALESCE(gm.group_name, lg.group_name),
      l.ledger_name;
  `;

  const { rows } = await db.query(query, [financeId, fromDate, toDate]);

  const groupsMap = new Map();

  for (const r of rows) {
    const groupName = r.group_name || 'Unassigned';
    const nature = r.nature || 'Assets';
    const groupId = r.group_id ? String(r.group_id) : groupName;

    if (!groupsMap.has(groupName)) {
      groupsMap.set(groupName, {
        id: groupId,
        name: groupName,
        nature,
        gDebit: 0,
        gCredit: 0,
        ledgers: [],
      });
    }

    const g = groupsMap.get(groupName);

    // closingNet = masterOpening + priorNet + periodDr - periodCr
    const masterOpening = Number(r.master_opening) || 0;
    const priorNet = Number(r.prior_net) || 0;
    const periodDr = Number(r.period_dr) || 0;
    const periodCr = Number(r.period_cr) || 0;
    const closingNet = Math.round((masterOpening + priorNet + periodDr - periodCr) * 100) / 100;

    const debit = closingNet > 0 ? closingNet : 0;
    const credit = closingNet < 0 ? Math.abs(closingNet) : 0;

    g.ledgers.push({
      id: r.ledger_id,
      name: r.ledger_name,
      debit,
      credit,
    });

    g.gDebit = Math.round((g.gDebit + debit) * 100) / 100;
    g.gCredit = Math.round((g.gCredit + credit) * 100) / 100;
  }

  const groups = Array.from(groupsMap.values());
  const totalDebit = Math.round(groups.reduce((s, g) => s + g.gDebit, 0) * 100) / 100;
  const totalCredit = Math.round(groups.reduce((s, g) => s + g.gCredit, 0) * 100) / 100;
  const difference = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;
  const isBalanced = difference < 0.01;

  return {
    from: fromDate,
    to: toDate,
    isBalanced,
    difference,
    totalDebit,
    totalCredit,
    groups,
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

// ─── Profit & Loss ─────────────────────────────────────────────────────────────
exports.getPnL = async (financeId, options = {}) => {
  let fromDate, toDate;
  if (typeof options === 'string') {
    if (/^\d{4}-\d{4}$/.test(options)) {
      const [y1, y2] = options.split('-');
      fromDate = `${y1}-04-01`;
      toDate = `${y2}-03-31`;
    } else {
      fromDate = '2026-04-01';
      toDate = '2026-10-31';
    }
  } else {
    fromDate = options.from;
    toDate = options.to;
  }

  const query = `
    WITH mov AS (
      SELECT
        e.ledger_id,
        SUM(CASE WHEN e.entry_type = 'Dr' THEN e.amount ELSE 0 END) AS period_dr,
        SUM(CASE WHEN e.entry_type = 'Cr' THEN e.amount ELSE 0 END) AS period_cr
      FROM acc_voucher_entries e
      JOIN acc_vouchers v ON v.id = e.voucher_id
      WHERE v.finance_id = $1
        AND v.status != 'Cancelled'
        AND v.voucher_date >= $2::date
        AND v.voucher_date <= $3::date
      GROUP BY e.ledger_id
    )
    SELECT
      l.id AS id,
      l.ledger_name AS name,
      COALESCE(gm.group_name, lg.group_name, 'General') AS group_name,
      COALESCE(gm.nature, lg.nature) AS nature,
      COALESCE(gm.affects_gross_profit, lg.affects_gross_profit, false) AS affects_gross_profit,
      COALESCE(gm.sequence_order, 999) AS sort_order,
      COALESCE(m.period_dr, 0) AS period_dr,
      COALESCE(m.period_cr, 0) AS period_cr
    FROM acc_ledgers l
    LEFT JOIN acc_group_master gm ON gm.id = l.master_group_id
    LEFT JOIN acc_ledger_groups lg ON lg.id = l.group_id
    LEFT JOIN mov m ON m.ledger_id = l.id
    WHERE l.finance_id = $1
      AND l.is_active = true
      AND l.inactive = false
      AND COALESCE(gm.nature, lg.nature) IN ('Income', 'Expenses')
      AND (COALESCE(m.period_dr, 0) != 0 OR COALESCE(m.period_cr, 0) != 0)
    ORDER BY l.ledger_name ASC;
  `;

  const { rows } = await db.query(query, [financeId, fromDate, toDate]);

  const expenses = [];
  const incomes = [];
  const expenseGroups = {};
  const incomeGroups = {};

  let totalExpense = 0;
  let totalIncome = 0;
  let directExpense = 0;
  let directIncome = 0;

  rows.forEach((r) => {
    const dr = parseFloat(r.period_dr) || 0;
    const cr = parseFloat(r.period_cr) || 0;
    const isIncome = r.nature === 'Income';
    const amount = isIncome ? cr - dr : dr - cr;
    const isDirect = Boolean(r.affects_gross_profit);

    if (amount === 0) return;

    const item = {
      id: r.id,
      name: r.name,
      group: r.group_name,
      isDirect,
      amount: Math.round(amount * 100) / 100,
    };

    if (isIncome) {
      incomes.push(item);
      totalIncome += amount;
      if (isDirect) directIncome += amount;

      if (!incomeGroups[r.group_name]) {
        incomeGroups[r.group_name] = {
          group_name: r.group_name,
          nature: 'Income',
          ledgers: [],
          total: 0,
        };
      }
      incomeGroups[r.group_name].ledgers.push(item);
      incomeGroups[r.group_name].total = Math.round((incomeGroups[r.group_name].total + amount) * 100) / 100;
    } else {
      expenses.push(item);
      totalExpense += amount;
      if (isDirect) directExpense += amount;

      if (!expenseGroups[r.group_name]) {
        expenseGroups[r.group_name] = {
          group_name: r.group_name,
          nature: 'Expenses',
          ledgers: [],
          total: 0,
        };
      }
      expenseGroups[r.group_name].ledgers.push(item);
      expenseGroups[r.group_name].total = Math.round((expenseGroups[r.group_name].total + amount) * 100) / 100;
    }
  });

  totalExpense = Math.round(totalExpense * 100) / 100;
  totalIncome = Math.round(totalIncome * 100) / 100;
  directExpense = Math.round(directExpense * 100) / 100;
  directIncome = Math.round(directIncome * 100) / 100;

  const grossProfit = Math.round((directIncome - directExpense) * 100) / 100;
  const netProfit = Math.round((totalIncome - totalExpense) * 100) / 100;
  const marginPct = totalIncome !== 0 ? parseFloat(((netProfit / totalIncome) * 100).toFixed(1)) : 0;

  return {
    from: fromDate,
    to: toDate,
    expenses,
    incomes,
    totalExpense,
    totalIncome,
    grossProfit,
    netProfit,
    marginPct,
    isProfit: netProfit >= 0,
    income: { groups: Object.values(incomeGroups), total: totalIncome },
    expensesGroups: { groups: Object.values(expenseGroups), total: totalExpense },
  };
};

// ─── Balance Sheet ─────────────────────────────────────────────────────────────
exports.getBalanceSheet = async (financeId, options = {}) => {
  let asOfDate;
  if (typeof options === 'string') {
    if (/^\d{4}-\d{4}$/.test(options)) {
      const [y1, y2] = options.split('-');
      asOfDate = `${y2}-03-31`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(options)) {
      asOfDate = options;
    } else {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      asOfDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
  } else if (options && typeof options === 'object') {
    asOfDate = options.as_of_date || options.as_on_date || options.date || options.asOf;
    if (!asOfDate) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      asOfDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
  } else {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    asOfDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  // Determine local Indian FY start date for asOfDate
  const d = new Date(asOfDate + 'T00:00:00');
  const m = d.getMonth() + 1; // 1-12
  const y = d.getFullYear();
  const fyStartYear = m >= 4 ? y : y - 1;
  const fyStart = `${fyStartYear}-04-01`;

  // 1. Ledger balances and period P&L movements
  const query = `
    WITH mov AS (
      SELECT
        e.ledger_id,
        SUM(CASE WHEN e.entry_type = 'Dr' THEN e.amount ELSE 0 END) AS total_dr,
        SUM(CASE WHEN e.entry_type = 'Cr' THEN e.amount ELSE 0 END) AS total_cr,
        SUM(CASE WHEN v.voucher_date >= $3::date AND e.entry_type = 'Dr' THEN e.amount ELSE 0 END) AS cur_dr,
        SUM(CASE WHEN v.voucher_date >= $3::date AND e.entry_type = 'Cr' THEN e.amount ELSE 0 END) AS cur_cr,
        SUM(CASE WHEN v.voucher_date < $3::date AND e.entry_type = 'Dr' THEN e.amount ELSE 0 END) AS pri_dr,
        SUM(CASE WHEN v.voucher_date < $3::date AND e.entry_type = 'Cr' THEN e.amount ELSE 0 END) AS pri_cr
      FROM acc_voucher_entries e
      JOIN acc_vouchers v ON v.id = e.voucher_id
      WHERE v.finance_id = $1
        AND v.status != 'Cancelled'
        AND v.voucher_date <= $2::date
      GROUP BY e.ledger_id
    )
    SELECT
      l.id AS id,
      l.ledger_name AS name,
      COALESCE(gm.group_name, lg.group_name, 'General') AS group_name,
      COALESCE(gm.nature, lg.nature) AS nature,
      COALESCE(gm.sequence_order, 999) AS seq_order,
      l.opening_balance,
      l.ob_type,
      CASE 
        WHEN l.ob_type = 'Cr' THEN -l.opening_balance 
        ELSE l.opening_balance 
      END AS signed_ob,
      COALESCE(m.total_dr, 0) AS total_dr,
      COALESCE(m.total_cr, 0) AS total_cr,
      COALESCE(m.cur_dr, 0) AS cur_dr,
      COALESCE(m.cur_cr, 0) AS cur_cr,
      COALESCE(m.pri_dr, 0) AS pri_dr,
      COALESCE(m.pri_cr, 0) AS pri_cr
    FROM acc_ledgers l
    LEFT JOIN acc_group_master gm ON gm.id = l.master_group_id
    LEFT JOIN acc_ledger_groups lg ON lg.id = l.group_id
    LEFT JOIN mov m ON m.ledger_id = l.id
    WHERE l.finance_id = $1
      AND l.is_active = true
      AND l.inactive = false
    ORDER BY COALESCE(gm.sequence_order, 999), group_name, l.ledger_name;
  `;

  const { rows } = await db.query(query, [financeId, asOfDate, fyStart]);

  let currentPeriodIncome = 0;
  let currentPeriodExpense = 0;
  let priorPeriodIncome = 0;
  let priorPeriodExpense = 0;
  let nominalOpeningProfit = 0;

  const liabGroupsMap = {};
  const assetGroupsMap = {};

  let totalLiabilities = 0;
  let totalAssets = 0;

  rows.forEach((r) => {
    const ob = parseFloat(r.signed_ob) || 0;
    const totalDr = parseFloat(r.total_dr) || 0;
    const totalCr = parseFloat(r.total_cr) || 0;
    const net = ob + totalDr - totalCr; // net debit

    if (r.nature === 'Income' || r.nature === 'Expenses') {
      const curDr = parseFloat(r.cur_dr) || 0;
      const curCr = parseFloat(r.cur_cr) || 0;
      const priDr = parseFloat(r.pri_dr) || 0;
      const priCr = parseFloat(r.pri_cr) || 0;

      if (r.nature === 'Income') {
        currentPeriodIncome += (curCr - curDr);
        priorPeriodIncome += (priCr - priDr);
        nominalOpeningProfit += (r.ob_type === 'Cr' ? parseFloat(r.opening_balance) : -parseFloat(r.opening_balance));
      } else {
        currentPeriodExpense += (curDr - curCr);
        priorPeriodExpense += (priDr - priCr);
        nominalOpeningProfit += (r.ob_type === 'Cr' ? parseFloat(r.opening_balance) : -parseFloat(r.opening_balance));
      }
      return;
    }

    if (r.nature === 'Assets') {
      const amount = Math.round(net * 100) / 100;
      if (amount === 0) return;
      totalAssets += amount;
      if (!assetGroupsMap[r.group_name]) {
        assetGroupsMap[r.group_name] = { group: r.group_name, seq: r.seq_order, items: [] };
      }
      assetGroupsMap[r.group_name].items.push({ id: r.id, name: r.name, amount, drillable: true });
    } else if (r.nature === 'Liabilities') {
      const amount = Math.round((-net) * 100) / 100;
      if (amount === 0) return;
      totalLiabilities += amount;
      if (!liabGroupsMap[r.group_name]) {
        liabGroupsMap[r.group_name] = { group: r.group_name, seq: r.seq_order, items: [] };
      }
      liabGroupsMap[r.group_name].items.push({ id: r.id, name: r.name, amount, drillable: true });
    }
  });

  const currentPeriodProfit = Math.round((currentPeriodIncome - currentPeriodExpense) * 100) / 100;
  const priorPeriodProfit = Math.round((priorPeriodIncome - priorPeriodExpense) * 100) / 100;
  const openingProfit = Math.round((priorPeriodProfit + nominalOpeningProfit) * 100) / 100;

  // Add the two P&L items into Reserves & Surplus per Section 2.2
  const reservesItems = [];
  if (openingProfit !== 0) {
    reservesItems.push({
      name: openingProfit < 0 ? 'Profit & Loss A/c (Opening / Brought Forward Loss)' : 'Profit & Loss A/c (Opening / Brought Forward)',
      amount: openingProfit,
      drillable: false,
    });
    totalLiabilities += openingProfit;
  }

  if (currentPeriodProfit !== 0) {
    reservesItems.push({
      name: currentPeriodProfit < 0 ? 'Profit & Loss A/c (Current Period Net Loss)' : 'Profit & Loss A/c (Current Period)',
      amount: currentPeriodProfit,
      drillable: false,
    });
    totalLiabilities += currentPeriodProfit;
  }

  if (reservesItems.length > 0) {
    if (!liabGroupsMap['Reserves & Surplus']) {
      liabGroupsMap['Reserves & Surplus'] = { group: 'Reserves & Surplus', seq: 2, items: [] };
    }
    liabGroupsMap['Reserves & Surplus'].items.unshift(...reservesItems);
  }

  totalAssets = Math.round(totalAssets * 100) / 100;
  totalLiabilities = Math.round(totalLiabilities * 100) / 100;
  const difference = Math.round(Math.abs(totalLiabilities - totalAssets) * 100) / 100;
  const isBalanced = difference < 0.01;

  // Diagnostics per Section 2.3
  const diagObRes = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN l.ob_type = 'Cr' THEN -l.opening_balance ELSE l.opening_balance END), 0) AS net_master_ob
     FROM acc_ledgers l
     WHERE l.finance_id = $1 AND l.is_active = true AND l.inactive = false`,
    [financeId]
  );
  const netMasterOpeningBalance = Math.round(parseFloat(diagObRes.rows[0]?.net_master_ob || 0) * 100) / 100;

  const diagInvalidNaturesRes = await db.query(
    `SELECT l.id, l.ledger_name
     FROM acc_ledgers l
     LEFT JOIN acc_group_master gm ON gm.id = l.master_group_id
     LEFT JOIN acc_ledger_groups lg ON lg.id = l.group_id
     WHERE l.finance_id = $1
       AND (COALESCE(gm.nature, lg.nature) IS NULL 
            OR COALESCE(gm.nature, lg.nature) NOT IN ('Assets', 'Liabilities', 'Income', 'Expenses'))
       AND l.is_active = true AND l.inactive = false`,
    [financeId]
  );
  const invalidNatureLedgersCount = diagInvalidNaturesRes.rows.length;

  const diagnostics = {
    invalidNatureLedgersCount,
    netMasterOpeningBalance,
    openingProfit,
    currentPeriodProfit,
    unbalancedDifference: difference,
  };

  const liabilitiesList = Object.values(liabGroupsMap).sort((a, b) => a.seq - b.seq || a.group.localeCompare(b.group));
  const assetsList = Object.values(assetGroupsMap).sort((a, b) => a.seq - b.seq || a.group.localeCompare(b.group));

  return {
    asOfDate,
    fyStart,
    liabilities: liabilitiesList,
    assets: assetsList,
    totalLiabilities,
    totalAssets,
    difference,
    isBalanced,
    netProfit: currentPeriodProfit,
    diagnostics,
    liabilitiesGroups: { groups: liabilitiesList, total: totalLiabilities },
    assetsGroups: { groups: assetsList, total: totalAssets },
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


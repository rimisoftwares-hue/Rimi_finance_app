// backend/src/modules/accounting/daybook/daybook.service.js
//
// Day Book + drill-down data (PostgreSQL, `pg` driver, $n placeholders only).
//
// Conventions (verified against the live DB):
//   * acc_vouchers.status is acc_voucher_status_enum ('Draft','Posted','Cancelled').
//     Only 'Cancelled' vouchers are excluded — there is no approval workflow.
//   * acc_voucher_entries.entry_type is acc_entry_type_enum ('Dr','Cr').
//   * Cash / Bank ledgers = ledgers under the system groups 'Cash-in-hand',
//     'Bank Accounts' or 'Bank OD A/c' (directly via master_group_id, or via a
//     custom acc_ledger_groups chain rooted there), plus is_bank_account = TRUE.
//   * Day Book convention (from the existing UI): Credit = money IN (Dr on a
//     cash/bank ledger), Debit = money OUT (Cr on a cash/bank ledger),
//     balance = previous + credit - debit.
//   * Every query is scoped by finance_id (from enhancedCheckFinance).

const { db } = require('../../../config/database.config');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DASH = '—';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** pg returns NUMERIC as string → number rounded to 2 decimals. */
function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Number → integer paise (for drift-free running sums). */
function paise(v) {
  return Math.round(num(v) * 100);
}

function fromPaise(p) {
  return Math.round(p) / 100;
}

function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function requireText(value, name) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) throw httpError(400, `${name} is required`);
  return v;
}

function parseMonthKey(monthKey) {
  const mk = requireText(monthKey, 'monthKey');
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mk);
  if (!m) throw httpError(400, 'monthKey must be in YYYY-MM format');
  return { monthKey: mk, monthStart: `${mk}-01` };
}

/** Indian FY ("2026-2027") → { label, start, end }. Defaults to the current FY. */
function resolveFinancialYear(financialYear) {
  let startYear;
  if (financialYear !== undefined && financialYear !== null && String(financialYear).trim() !== '') {
    const m = /^(\d{4})-(\d{4})$/.exec(String(financialYear).trim());
    if (!m || Number(m[2]) !== Number(m[1]) + 1) {
      throw httpError(400, 'financialYear must be in YYYY-YYYY format (e.g. 2026-2027)');
    }
    startYear = Number(m[1]);
  } else {
    const now = new Date();
    startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  }
  return {
    label: `${startYear}-${startYear + 1}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

function monthLabelFromKey(monthKey) {
  const idx = Number(monthKey.slice(5, 7)) - 1;
  return MONTHS[idx] || monthKey;
}

function text(v) {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s ? s : DASH;
}

// Cash / Bank ledger set for finance $1 (used as a CTE fragment after WITH RECURSIVE).
const CASH_BANK_CTE = `
  cb_master AS (
    SELECT id
      FROM acc_group_master
     WHERE group_name IN ('Cash-in-hand', 'Bank Accounts', 'Bank OD A/c')
  ),
  cb_groups AS (
    SELECT g.id
      FROM acc_ledger_groups g
     WHERE g.finance_id = $1
       AND (
             g.system_parent_id IN (SELECT id FROM cb_master)
          OR g.system_group_type IN ('Bank Accounts', 'Cash in Hand')
       )
    UNION
    SELECT c.id
      FROM acc_ledger_groups c
      JOIN cb_groups p ON c.custom_parent_id = p.id
     WHERE c.finance_id = $1
  ),
  cb_ledgers AS (
    SELECT l.id
      FROM acc_ledgers l
     WHERE l.finance_id = $1
       AND (
             l.is_bank_account = TRUE
          OR l.master_group_id IN (SELECT id FROM cb_master)
          OR l.group_id        IN (SELECT id FROM cb_groups)
       )
  )`;

async function findLedgerByName(financeId, ledgerName) {
  const { rows } = await db.query(
    `SELECT l.id,
            l.ledger_name,
            l.opening_balance,
            l.ob_type::text                       AS ob_type,
            COALESCE(gm.nature, lg.nature)::text  AS nature
       FROM acc_ledgers l
       LEFT JOIN acc_group_master  gm ON gm.id = l.master_group_id
       LEFT JOIN acc_ledger_groups lg ON lg.id = l.group_id AND lg.finance_id = l.finance_id
      WHERE l.finance_id = $1
        AND l.ledger_name = $2
      LIMIT 1`,
    [financeId, ledgerName]
  );
  if (rows.length === 0) throw httpError(404, `Ledger "${ledgerName}" not found`);
  return rows[0];
}

/** Dr-nature (Assets/Expenses) → +1, Cr-nature (Liabilities/Income) → -1. */
function natureSign(nature) {
  return nature === 'Liabilities' || nature === 'Income' ? -1 : 1;
}

// ─── 2.1 Day Book transactions ────────────────────────────────────────────────

async function getTransactions(financeId, { from, to }) {
  if (!isValidDateStr(from) || !isValidDateStr(to)) {
    throw httpError(400, 'from and to are required valid dates (YYYY-MM-DD)');
  }
  if (from > to) throw httpError(400, 'from must be on or before to');

  const openingSql = `
    WITH RECURSIVE ${CASH_BANK_CTE}
    SELECT
      (SELECT COALESCE(SUM(CASE WHEN l.ob_type = 'Dr' THEN l.opening_balance ELSE -l.opening_balance END), 0)
         FROM acc_ledgers l
        WHERE l.finance_id = $1
          AND l.id IN (SELECT id FROM cb_ledgers))                       AS master_opening,
      (SELECT COALESCE(SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE -ve.amount END), 0)
         FROM acc_voucher_entries ve
         JOIN acc_vouchers v ON v.id = ve.voucher_id AND v.finance_id = ve.finance_id
        WHERE ve.finance_id = $1
          AND v.status <> 'Cancelled'
          AND v.voucher_date < $2::date
          AND ve.ledger_id IN (SELECT id FROM cb_ledgers))               AS prior_net`;

  const rowsSql = `
    WITH RECURSIVE ${CASH_BANK_CTE},
    vrange AS (
      SELECT v.id, v.voucher_number, v.voucher_date, v.narration, v.created_at, v.customer_id,
             vt.type_name, vt.type_code
        FROM acc_vouchers v
        JOIN acc_voucher_types vt ON vt.id = v.voucher_type_id AND vt.finance_id = v.finance_id
       WHERE v.finance_id = $1
         AND v.status <> 'Cancelled'
         AND v.voucher_date >= $2::date
         AND v.voucher_date <= $3::date
    )
    SELECT vr.id                                        AS voucher_id,
           TO_CHAR(vr.voucher_date, 'YYYY-MM-DD')       AS date,
           vr.type_name                                 AS voucher_type,
           vr.type_code                                 AS type_code,
           vr.voucher_number,
           vr.narration,
           c.cname                                      AS customer_name,
           COALESCE(SUM(CASE WHEN cb.id IS NOT NULL AND ve.entry_type = 'Dr' THEN ve.amount END), 0) AS cash_in,
           COALESCE(SUM(CASE WHEN cb.id IS NOT NULL AND ve.entry_type = 'Cr' THEN ve.amount END), 0) AS cash_out,
           COALESCE(ARRAY_AGG(DISTINCT l.ledger_name) FILTER (WHERE l.ledger_name IS NOT NULL), ARRAY[]::varchar[]) AS ledger_names,
           (ARRAY_AGG(l.ledger_name ORDER BY ve.sort_order, ve.created_at, ve.id)
              FILTER (WHERE cb.id IS NULL AND l.ledger_name IS NOT NULL))[1] AS first_other_ledger
      FROM vrange vr
      LEFT JOIN acc_voucher_entries ve ON ve.voucher_id = vr.id AND ve.finance_id = $1
      LEFT JOIN acc_ledgers l          ON l.id = ve.ledger_id AND l.finance_id = $1
      LEFT JOIN cb_ledgers cb          ON cb.id = ve.ledger_id
      LEFT JOIN customers c            ON c.id = vr.customer_id AND c.finance_id = $1
     GROUP BY vr.id, vr.voucher_date, vr.created_at, vr.type_name, vr.type_code,
              vr.voucher_number, vr.narration, c.cname
     ORDER BY vr.voucher_date, vr.created_at, vr.voucher_number, vr.id`;

  const [openingRes, rowsRes] = await Promise.all([
    db.query(openingSql, [financeId, from]),
    db.query(rowsSql, [financeId, from, to]),
  ]);

  const o = openingRes.rows[0] || {};
  const openingP = paise(o.master_opening) + paise(o.prior_net);

  let runningP = openingP;
  let totalCreditP = 0;
  let totalDebitP = 0;

  const rows = rowsRes.rows.map((r) => {
    const creditP = paise(r.cash_in);
    const debitP = paise(r.cash_out);
    totalCreditP += creditP;
    totalDebitP += debitP;
    runningP += creditP - debitP;
    return {
      voucherId: r.voucher_id,
      date: r.date,
      voucherType: r.voucher_type,
      typeCode: r.type_code,
      voucherNumber: r.voucher_number,
      narration: r.narration || '',
      party: r.customer_name || r.first_other_ledger || '',
      ledgerNames: Array.isArray(r.ledger_names) ? r.ledger_names : [],
      credit: fromPaise(creditP),
      debit: fromPaise(debitP),
      balance: fromPaise(runningP),
    };
  });

  return {
    from,
    to,
    openingBalance: fromPaise(openingP),
    totalCredit: fromPaise(totalCreditP),
    totalDebit: fromPaise(totalDebitP),
    closingBalance: fromPaise(openingP + totalCreditP - totalDebitP),
    rows,
  };
}

// ─── 2.2 Voucher detail ───────────────────────────────────────────────────────

async function getVoucherDetail(financeId, voucherNumber) {
  const no = requireText(voucherNumber, 'voucherNumber');

  const headerRes = await db.query(
    `SELECT v.id,
            v.voucher_number,
            TO_CHAR(v.voucher_date, 'YYYY-MM-DD')               AS date,
            vt.type_name,
            vt.type_code,
            v.narration,
            v.bank_ref,
            v.cheque_number,
            v.created_by,
            TO_CHAR(v.created_at, 'YYYY-MM-DD HH24:MI:SS')      AS created_at,
            v.updated_by,
            TO_CHAR(v.updated_at, 'YYYY-MM-DD HH24:MI:SS')      AS updated_at,
            c.cname                                             AS customer_name,
            lc.hplno::text                                      AS loan_hplno,
            ln.loan_type,
            vd.vehicle_number,
            cc.centre_name,
            p.collected_by,
            u.username                                          AS collector_username
       FROM acc_vouchers v
       JOIN acc_voucher_types vt ON vt.id = v.voucher_type_id AND vt.finance_id = v.finance_id
       LEFT JOIN customers c       ON c.id  = v.customer_id AND c.finance_id = v.finance_id
       LEFT JOIN loans ln          ON ln.id = v.loan_id     AND ln.finance_id = v.finance_id
       LEFT JOIN customers lc      ON lc.id = ln.customer_id AND lc.finance_id = v.finance_id
       LEFT JOIN vehicle_detail vd ON vd.id = COALESCE(v.vehicle_id, ln.vehicle_id) AND vd.finance_id = v.finance_id
       LEFT JOIN LATERAL (
              SELECT acc.centre_name
                FROM acc_cost_centres acc
               WHERE acc.finance_id = v.finance_id
                 AND acc.vehicle_id = COALESCE(v.vehicle_id, ln.vehicle_id)
                 AND acc.is_active IS NOT FALSE
               ORDER BY acc.created_at
               LIMIT 1
            ) cc ON TRUE
       LEFT JOIN payments p ON p.id = v.payment_id AND p.finance_id = v.finance_id
       LEFT JOIN users u    ON u.id = p.collected_by_id
      WHERE v.finance_id = $1
        AND v.voucher_number = $2
        AND v.status <> 'Cancelled'
      LIMIT 1`,
    [financeId, no]
  );

  if (headerRes.rows.length === 0) throw httpError(404, `Voucher "${no}" not found`);
  const h = headerRes.rows[0];

  const entriesRes = await db.query(
    `WITH RECURSIVE ${CASH_BANK_CTE}
     SELECT l.ledger_name,
            ve.entry_type::text AS entry_type,
            ve.amount,
            (cb.id IS NOT NULL) AS is_cash_bank
       FROM acc_voucher_entries ve
       JOIN acc_ledgers l     ON l.id = ve.ledger_id AND l.finance_id = ve.finance_id
       LEFT JOIN cb_ledgers cb ON cb.id = ve.ledger_id
      WHERE ve.finance_id = $1
        AND ve.voucher_id = $2
      ORDER BY ve.sort_order, ve.created_at, ve.id`,
    [financeId, h.id]
  );

  let totalDrP = 0;
  let totalCrP = 0;
  const entries = entriesRes.rows.map((e) => {
    const amtP = paise(e.amount);
    if (e.entry_type === 'Dr') totalDrP += amtP; else totalCrP += amtP;
    return {
      ledger: e.ledger_name,
      debit: e.entry_type === 'Dr' ? fromPaise(amtP) : 0,
      credit: e.entry_type === 'Cr' ? fromPaise(amtP) : 0,
    };
  });

  const firstDr = entriesRes.rows.find((e) => e.entry_type === 'Dr');
  const firstCr = entriesRes.rows.find((e) => e.entry_type === 'Cr');
  const firstOther = entriesRes.rows.find((e) => !e.is_cash_bank);

  const reference = h.bank_ref || (h.cheque_number ? `Chq ${h.cheque_number}` : null);
  const agent = h.collector_username || h.collected_by;
  const hasModification = !!(h.updated_by && String(h.updated_by).trim());

  return {
    id: h.id,
    no: h.voucher_number,
    date: h.date,
    type: h.type_name,
    typeCode: h.type_code,
    party: h.customer_name || (firstOther ? firstOther.ledger_name : '') || DASH,
    narration: h.narration || DASH,
    amount: fromPaise(Math.max(totalDrP, totalCrP)),
    totalDebit: fromPaise(totalDrP),
    totalCredit: fromPaise(totalCrP),
    drLedger: firstDr ? firstDr.ledger_name : '',
    crLedger: firstCr ? firstCr.ledger_name : '',
    reference: text(reference),
    costCentre: text(h.centre_name),
    branch: DASH,      // no branch concept in the schema
    employee: DASH,    // no employee link on acc_vouchers
    agent: text(agent),
    scheme: text(h.loan_type),
    vehicle: text(h.vehicle_number),
    loanAccount: text(h.loan_hplno),
    createdBy: text(h.created_by),
    createdAt: text(h.created_at),
    modifiedBy: hasModification ? String(h.updated_by) : undefined,
    modifiedAt: hasModification ? h.updated_at : undefined,
    approval: 'Approved',
    entries,
  };
}

// ─── 2.3 Ledger monthly (Level 2 + chart + Smart Analysis) ────────────────────

async function getLedgerMonthly(financeId, { ledgerName, financialYear }) {
  const name = requireText(ledgerName, 'ledgerName');
  const fy = resolveFinancialYear(financialYear);
  const ledger = await findLedgerByName(financeId, name);
  const sign = natureSign(ledger.nature);

  const [priorRes, monthsRes, perVoucherRes] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE -ve.amount END), 0) AS net
         FROM acc_voucher_entries ve
         JOIN acc_vouchers v ON v.id = ve.voucher_id AND v.finance_id = ve.finance_id
        WHERE ve.finance_id = $1
          AND ve.ledger_id = $2
          AND v.status <> 'Cancelled'
          AND v.voucher_date < $3::date`,
      [financeId, ledger.id, fy.start]
    ),
    db.query(
      `WITH months AS (
         SELECT gs::date AS m_start
           FROM generate_series($3::date, ($3::date + INTERVAL '11 months'), INTERVAL '1 month') AS gs
       ),
       mov AS (
         SELECT DATE_TRUNC('month', v.voucher_date)::date                              AS m_start,
                SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE 0 END)          AS dr,
                SUM(CASE WHEN ve.entry_type = 'Cr' THEN ve.amount ELSE 0 END)          AS cr,
                COUNT(DISTINCT v.id)                                                   AS vouchers
           FROM acc_voucher_entries ve
           JOIN acc_vouchers v ON v.id = ve.voucher_id AND v.finance_id = ve.finance_id
          WHERE ve.finance_id = $1
            AND ve.ledger_id = $2
            AND v.status <> 'Cancelled'
            AND v.voucher_date >= $3::date
            AND v.voucher_date <= $4::date
          GROUP BY 1
       )
       SELECT TO_CHAR(m.m_start, 'YYYY-MM')   AS month_key,
              COALESCE(mov.dr, 0)            AS dr,
              COALESCE(mov.cr, 0)            AS cr,
              COALESCE(mov.vouchers, 0)::int AS vouchers
         FROM months m
         LEFT JOIN mov ON mov.m_start = m.m_start
        ORDER BY m.m_start`,
      [financeId, ledger.id, fy.start, fy.end]
    ),
    db.query(
      `SELECT ve.voucher_id, SUM(ve.amount) AS amount
         FROM acc_voucher_entries ve
         JOIN acc_vouchers v ON v.id = ve.voucher_id AND v.finance_id = ve.finance_id
        WHERE ve.finance_id = $1
          AND ve.ledger_id = $2
          AND v.status <> 'Cancelled'
          AND v.voucher_date >= $3::date
          AND v.voucher_date <= $4::date
        GROUP BY ve.voucher_id`,
      [financeId, ledger.id, fy.start, fy.end]
    ),
  ]);

  // Opening in Dr terms (Dr positive), then expressed in the ledger's natural side.
  const masterObP = paise(ledger.opening_balance) * (ledger.ob_type === 'Cr' ? -1 : 1);
  const openingDrTermsP = masterObP + paise(priorRes.rows[0]?.net);
  const openingP = openingDrTermsP * sign;

  let runningP = openingP;
  let totalDrP = 0;
  let totalCrP = 0;
  let voucherCount = 0;

  const rows = monthsRes.rows.map((r) => {
    const drP = paise(r.dr);
    const crP = paise(r.cr);
    totalDrP += drP;
    totalCrP += crP;
    voucherCount += r.vouchers;
    runningP += (drP - crP) * sign;
    return {
      month: monthLabelFromKey(r.month_key),
      monthKey: r.month_key,
      debit: fromPaise(drP),
      credit: fromPaise(crP),
      closing: fromPaise(runningP),
      vouchers: r.vouchers,
    };
  });

  const amounts = perVoucherRes.rows.map((r) => num(r.amount));
  const distinctVouchers = amounts.length;

  return {
    ledger: ledger.ledger_name,
    nature: ledger.nature,
    financialYear: fy.label,
    opening: fromPaise(openingP),
    closing: fromPaise(runningP),
    totalDebit: fromPaise(totalDrP),
    totalCredit: fromPaise(totalCrP),
    rows,
    analysis: {
      opening: fromPaise(openingP),
      totalDebit: fromPaise(totalDrP),
      totalCredit: fromPaise(totalCrP),
      netMovement: fromPaise((totalDrP - totalCrP) * sign),
      closing: fromPaise(runningP),
      vouchers: distinctVouchers,
      monthlyVoucherSum: voucherCount,
      avg: distinctVouchers ? num((totalDrP + totalCrP) / 100 / distinctVouchers) : 0,
      largest: amounts.length ? Math.max(...amounts) : 0,
      smallest: amounts.length ? Math.min(...amounts) : 0,
    },
  };
}

// ─── 2.4 Month voucher types (Level 3) ────────────────────────────────────────

async function getMonthVoucherTypes(financeId, { ledgerName, monthKey }) {
  const name = requireText(ledgerName, 'ledgerName');
  const mk = parseMonthKey(monthKey);
  const ledger = await findLedgerByName(financeId, name);

  const { rows } = await db.query(
    `SELECT vt.type_code                                                    AS code,
            vt.type_name                                                    AS name,
            COUNT(DISTINCT v.id)::int                                       AS count,
            SUM(ve.amount)                                                  AS amount,
            SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE 0 END)   AS dr,
            SUM(CASE WHEN ve.entry_type = 'Cr' THEN ve.amount ELSE 0 END)   AS cr
       FROM acc_voucher_entries ve
       JOIN acc_vouchers v       ON v.id = ve.voucher_id AND v.finance_id = ve.finance_id
       JOIN acc_voucher_types vt ON vt.id = v.voucher_type_id AND vt.finance_id = v.finance_id
      WHERE ve.finance_id = $1
        AND ve.ledger_id = $2
        AND v.status <> 'Cancelled'
        AND v.voucher_date >= $3::date
        AND v.voucher_date <  ($3::date + INTERVAL '1 month')
      GROUP BY vt.type_code, vt.type_name
      ORDER BY vt.type_name`,
    [financeId, ledger.id, mk.monthStart]
  );

  return {
    ledger: ledger.ledger_name,
    monthKey: mk.monthKey,
    month: monthLabelFromKey(mk.monthKey),
    types: rows.map((r) => ({
      code: r.code,
      name: r.name,
      nature: num(r.dr) >= num(r.cr) ? 'Dr' : 'Cr',
      count: r.count,
      amount: num(r.amount),
    })),
  };
}

// ─── 2.5 Month voucher register (Level 4) ─────────────────────────────────────

async function getMonthVouchers(financeId, { ledgerName, monthKey, typeCode }) {
  const name = requireText(ledgerName, 'ledgerName');
  const mk = parseMonthKey(monthKey);
  const code = requireText(typeCode, 'typeCode');
  const ledger = await findLedgerByName(financeId, name);

  const { rows } = await db.query(
    `WITH reg AS (
       SELECT v.id,
              v.voucher_number,
              v.voucher_date,
              v.narration,
              vt.type_name,
              vt.type_code,
              c.cname                                                          AS customer_name,
              SUM(ve.amount)                                                   AS amount,
              SUM(CASE WHEN ve.entry_type = 'Dr' THEN ve.amount ELSE 0 END)    AS dr,
              SUM(CASE WHEN ve.entry_type = 'Cr' THEN ve.amount ELSE 0 END)    AS cr
         FROM acc_voucher_entries ve
         JOIN acc_vouchers v       ON v.id = ve.voucher_id AND v.finance_id = ve.finance_id
         JOIN acc_voucher_types vt ON vt.id = v.voucher_type_id AND vt.finance_id = v.finance_id
         LEFT JOIN customers c     ON c.id = v.customer_id AND c.finance_id = v.finance_id
        WHERE ve.finance_id = $1
          AND ve.ledger_id = $2
          AND v.status <> 'Cancelled'
          AND v.voucher_date >= $3::date
          AND v.voucher_date <  ($3::date + INTERVAL '1 month')
          AND vt.type_code = $4
        GROUP BY v.id, v.voucher_number, v.voucher_date, v.narration, vt.type_name, vt.type_code, c.cname
     )
     SELECT reg.voucher_number,
            TO_CHAR(reg.voucher_date, 'YYYY-MM-DD') AS date,
            reg.narration,
            reg.type_name,
            reg.type_code,
            reg.customer_name,
            reg.amount,
            reg.dr,
            reg.cr,
            opp.ledger_name                         AS opposite_ledger
       FROM reg
       LEFT JOIN LATERAL (
              SELECT l2.ledger_name
                FROM acc_voucher_entries ve2
                JOIN acc_ledgers l2 ON l2.id = ve2.ledger_id AND l2.finance_id = ve2.finance_id
               WHERE ve2.finance_id = $1
                 AND ve2.voucher_id = reg.id
                 AND ve2.ledger_id <> $2
               ORDER BY (ve2.entry_type::text = CASE WHEN reg.dr >= reg.cr THEN 'Cr' ELSE 'Dr' END) DESC,
                        ve2.sort_order, ve2.created_at, ve2.id
               LIMIT 1
            ) opp ON TRUE
      ORDER BY reg.voucher_date, reg.voucher_number`,
    [financeId, ledger.id, mk.monthStart, code]
  );

  return {
    ledger: ledger.ledger_name,
    monthKey: mk.monthKey,
    month: monthLabelFromKey(mk.monthKey),
    typeCode: code,
    vouchers: rows.map((r) => {
      const ledgerIsDr = num(r.dr) >= num(r.cr);
      const opposite = r.opposite_ledger || '';
      return {
        no: r.voucher_number,
        date: r.date,
        type: r.type_name,
        typeCode: r.type_code,
        party: r.customer_name || opposite || DASH,
        narration: r.narration || '',
        amount: num(r.amount),
        drLedger: ledgerIsDr ? ledger.ledger_name : opposite,
        crLedger: ledgerIsDr ? opposite : ledger.ledger_name,
      };
    }),
  };
}

module.exports = {
  getTransactions,
  getVoucherDetail,
  getLedgerMonthly,
  getMonthVoucherTypes,
  getMonthVouchers,
};

// routes/voucher/voucher.service.js
const { db } = require('../../../config/database.config');

// â”€â”€â”€ Helper: derive financial year (Aprâ€“Mar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getFinancialYear(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// â”€â”€â”€ Validate Dr = Cr â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function validateEntries(entries) {
  if (!entries || entries.length < 2) {
    throw new Error('A voucher must have at least one Dr and one Cr entry');
  }
  const totalDr = entries
    .filter(e => e.type === 'Dr')
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const totalCr = entries
    .filter(e => e.type === 'Cr')
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  if (Math.abs(totalDr - totalCr) > 0.01) {
    throw new Error(`Debit and Credit mismatch: Dr â‚¹${totalDr.toFixed(2)} â‰  Cr â‚¹${totalCr.toFixed(2)}`);
  }
  return totalDr;
}

// â”€â”€â”€ Create single voucher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.createVoucher = async (data) => {
  const conn = await db.getConnection();
  try {
    const totalAmount = validateEntries(data.entries);
    const financial_year = getFinancialYear(data.date);

    await conn.beginTransaction();

    const [voucher] = await conn.query(
      `INSERT INTO acc_vouchers
        (finance_id, voucher_type_id, voucher_date, financial_year,
         narration, total_amount, status, created_by)
       VALUES (?,?,?,?,?,?,'Posted',?)`,
      [
        data.finance_id,
        data.voucher_type_id,
        data.date,
        financial_year,
        data.narration || null,
        totalAmount,
        data.created_by || null,
      ]
    );

    const voucher_id = voucher.insertId;

    for (let i = 0; i < data.entries.length; i++) {
      const e = data.entries[i];
      await conn.query(
        `INSERT INTO acc_voucher_entries
          (finance_id, voucher_id, ledger_id, entry_type, amount, narration, sort_order, created_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [data.finance_id, voucher_id, e.ledger_id, e.type,
         parseFloat(e.amount), e.narration || null, i, data.created_by || null]
      );
    }

    await conn.commit();
    return voucher_id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// â”€â”€â”€ Multi create vouchers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.multiCreateVoucher = async (finance_id, vouchers, created_by) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const ids = [];

    for (const v of vouchers) {
      const totalAmount = validateEntries(v.entries);
      const financial_year = getFinancialYear(v.date);

      const [result] = await conn.query(
        `INSERT INTO acc_vouchers
          (finance_id, voucher_type_id, voucher_date, financial_year,
           narration, total_amount, status, created_by)
         VALUES (?,?,?,?,?,?,'Posted',?)`,
        [finance_id, v.voucher_type_id, v.date, financial_year,
         v.narration || null, totalAmount, created_by || null]
      );

      const vid = result.insertId;
      ids.push(vid);

      for (let i = 0; i < v.entries.length; i++) {
        const e = v.entries[i];
        await conn.query(
          `INSERT INTO acc_voucher_entries
            (finance_id, voucher_id, ledger_id, entry_type, amount, narration, sort_order, created_by)
           VALUES (?,?,?,?,?,?,?,?)`,
          [finance_id, vid, e.ledger_id, e.type,
           parseFloat(e.amount), e.narration || null, i, created_by || null]
        );
      }
    }

    await conn.commit();
    return ids;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// â”€â”€â”€ List vouchers with entries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.listVouchers = async (finance_id, { from, to, type_id, status } = {}) => {
  let sql = `
    SELECT
      v.id,
      v.voucher_number,
      v.voucher_date,
      v.financial_year,
      v.narration,
      v.total_amount,
      v.status,
      vt.id        AS voucher_type_id,
      vt.type_name AS voucher_type,
      vt.class     AS voucher_class,
      vt.type_code
    FROM acc_vouchers v
    JOIN acc_voucher_types vt ON vt.id = v.voucher_type_id
    WHERE v.finance_id = ?
  `;
  const params = [finance_id];

  if (from)    { sql += ' AND v.voucher_date >= ?'; params.push(from); }
  if (to)      { sql += ' AND v.voucher_date <= ?'; params.push(to); }
  if (type_id) { sql += ' AND v.voucher_type_id = ?'; params.push(type_id); }
  if (status)  { sql += ' AND v.status = ?'; params.push(status); }

  sql += ' ORDER BY v.voucher_date DESC, v.id DESC';

  const [vouchers] = await db.query(sql, params);

  if (vouchers.length === 0) return [];

  // Fetch entries for all vouchers in one query
  const vids = vouchers.map(v => v.id);
  const [entries] = await db.query(
    `SELECT
       e.voucher_id,
       e.entry_type,
       e.amount,
       e.narration,
       l.id   AS ledger_id,
       l.ledger_name
     FROM acc_voucher_entries e
     JOIN acc_ledgers l ON l.id = e.ledger_id
     WHERE e.voucher_id IN (?)
     ORDER BY e.sort_order`,
    [vids]
  );

  // Map entries to vouchers
  const entryMap = {};
  entries.forEach(e => {
    if (!entryMap[e.voucher_id]) entryMap[e.voucher_id] = [];
    entryMap[e.voucher_id].push(e);
  });

  return vouchers.map(v => ({
    ...v,
    entries: entryMap[v.id] || [],
  }));
};

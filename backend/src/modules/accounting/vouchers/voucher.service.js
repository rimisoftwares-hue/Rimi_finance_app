// backend/src/modules/accounting/vouchers/voucher.service.js
const { db } = require('../../../config/database.config');

// ─── Predefined Voucher Types for Lazy Provisioning ──────────────────────────
const DEFAULT_VOUCHER_TYPES = [
  { type_code: 'REC',  type_name: 'Receipt',           class: 'Receipt',          prefix: 'REC' },
  { type_code: 'PAY',  type_name: 'Payment',           class: 'Payment',          prefix: 'PAY' },
  { type_code: 'CON',  type_name: 'Contra',            class: 'Contra',           prefix: 'CON' },
  { type_code: 'JRN',  type_name: 'Journal',           class: 'Journal',          prefix: 'JRN' },
  { type_code: 'SAL',  type_name: 'Sales',             class: 'Sales',            prefix: 'SAL' },
  { type_code: 'PUR',  type_name: 'Purchase',          class: 'Purchase',         prefix: 'PUR' },
  { type_code: 'DRN',  type_name: 'Debit Note',        class: 'Debit Note',       prefix: 'DRN' },
  { type_code: 'CRN',  type_name: 'Credit Note',       class: 'Credit Note',      prefix: 'CRN' },
  { type_code: 'LOAN', type_name: 'Loan Disbursement',  class: 'LoanDisbursement', prefix: 'LOAN' },
  { type_code: 'EMI',  type_name: 'Loan Repayment',    class: 'LoanRepayment',    prefix: 'EMI' },
  { type_code: 'VEX',  type_name: 'Vehicle Expense',   class: 'VehicleExpense',   prefix: 'VEX' },
];

// ─── Helper: derive financial year (Apr 1 – Mar 31) ──────────────────────────
function getFinancialYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan ... 3 = Apr

  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;

  return `${startYear}-${endYear}`;
}

// ─── Helper: resolve financial year and check if locked ──────────────────────
async function resolveFinancialYear(runner, finance_id, date) {
  const year_label = getFinancialYear(date);

  const res = await runner.query(
    `SELECT year_label, is_locked
       FROM acc_financial_years
      WHERE finance_id = $1 AND year_label = $2
      LIMIT 1`,
    [finance_id, year_label]
  );

  const fy = res.rows[0];
  if (fy && fy.is_locked) {
    const err = new Error(`Financial year ${year_label} is locked for this company`);
    err.statusCode = 409;
    err.code = 'FY_LOCKED';
    throw err;
  }

  return year_label;
}

// ─── Helper: lazily provision default voucher types for a finance company ────
async function ensureVoucherTypes(runner, finance_id) {
  for (const vt of DEFAULT_VOUCHER_TYPES) {
    await runner.query(
      `INSERT INTO acc_voucher_types
        (finance_id, type_code, type_name, class, prefix, numbering_mode, last_number, is_system, is_active)
       VALUES ($1, $2, $3, $4, $5, 'Auto', 0, true, true)
       ON CONFLICT (finance_id, type_code) DO NOTHING`,
      [finance_id, vt.type_code, vt.type_name, vt.class, vt.prefix]
    );
  }
}

// ─── 1. Get Voucher Types for Active Finance ─────────────────────────────────
exports.getVoucherTypes = async (finance_id) => {
  if (!finance_id) throw new Error('finance_id is required');

  // Check if voucher types exist; if not, lazily provision
  const countRes = await db.query(
    `SELECT COUNT(*) FROM acc_voucher_types WHERE finance_id = $1`,
    [finance_id]
  );

  if (parseInt(countRes.rows[0].count, 10) === 0) {
    await ensureVoucherTypes(db, finance_id);
  }

  const res = await db.query(
    `SELECT id, finance_id, type_code, type_name, class, prefix, numbering_mode, last_number, is_active
       FROM acc_voucher_types
      WHERE finance_id = $1 AND is_active = true
      ORDER BY
        CASE type_code
          WHEN 'REC' THEN 1
          WHEN 'PAY' THEN 2
          WHEN 'CON' THEN 3
          WHEN 'JRN' THEN 4
          WHEN 'SAL' THEN 5
          WHEN 'PUR' THEN 6
          WHEN 'DRN' THEN 7
          WHEN 'CRN' THEN 8
          WHEN 'LOAN' THEN 9
          WHEN 'EMI' THEN 10
          WHEN 'VEX' THEN 11
          ELSE 99
        END, type_name ASC`,
    [finance_id]
  );

  return res.rows;
};

// ─── 2. Get Next Voucher Number Suggestion (read-only, does not increment) ────
exports.getNextVoucherNumber = async (finance_id, { type_id, date } = {}) => {
  if (!finance_id) throw new Error('finance_id is required');
  if (!type_id) throw new Error('type_id is required');

  let typeRes = await db.query(
    `SELECT id, type_code, prefix, last_number, numbering_mode
       FROM acc_voucher_types
      WHERE finance_id = $1 AND (id::text = $2::text OR type_code = $2) AND is_active = true
      LIMIT 1`,
    [finance_id, String(type_id)]
  );

  if (typeRes.rows.length === 0) {
    // Attempt lazy provision and re-check
    await ensureVoucherTypes(db, finance_id);
    typeRes = await db.query(
      `SELECT id, type_code, prefix, last_number, numbering_mode
         FROM acc_voucher_types
        WHERE finance_id = $1 AND (id::text = $2::text OR type_code = $2) AND is_active = true
        LIMIT 1`,
      [finance_id, String(type_id)]
    );
  }

  if (typeRes.rows.length === 0) {
    const err = new Error('Voucher type not found for this company');
    err.statusCode = 400;
    throw err;
  }

  const vt = typeRes.rows[0];
  const voucherDate = date ? new Date(date) : new Date();
  const fy = getFinancialYear(voucherDate);
  const nextSeq = (parseInt(vt.last_number, 10) || 0) + 1;
  const prefix = vt.prefix || vt.type_code || 'VOUCH';
  const voucher_number = `${prefix}/${fy}/${String(nextSeq).padStart(4, '0')}`;

  return {
    voucher_number,
    sequence: nextSeq,
    financial_year: fy,
    prefix,
  };
};

// ─── 3. Create Voucher (Atomic Transaction with Validation) ──────────────────
exports.createVoucher = async ({ finance_id, voucher_type_id, voucher_number, date, narration, entries, created_by }) => {
  if (!finance_id) throw new Error('finance_id is required');
  if (!voucher_type_id) throw new Error('voucher_type_id is required');
  if (!date) throw new Error('date is required');

  // 1. Entry structure validation
  if (!Array.isArray(entries) || entries.length < 2) {
    const err = new Error('A voucher must contain at least 2 entries (at least one Dr and one Cr)');
    err.statusCode = 400;
    throw err;
  }

  let hasDr = false;
  let hasCr = false;
  let paiseDr = 0;
  let paiseCr = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.ledger_id) {
      const err = new Error(`Entry line ${i + 1}: Ledger is required`);
      err.statusCode = 400;
      throw err;
    }
    if (e.type !== 'Dr' && e.type !== 'Cr') {
      const err = new Error(`Entry line ${i + 1}: Entry type must be "Dr" or "Cr"`);
      err.statusCode = 400;
      throw err;
    }

    const numAmount = Number(e.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      const err = new Error(`Entry line ${i + 1}: Amount must be a positive number greater than zero`);
      err.statusCode = 400;
      throw err;
    }

    // Check at most 2 decimal places
    const paise = Math.round(numAmount * 100);
    if (Math.abs(numAmount * 100 - paise) > 1e-4) {
      const err = new Error(`Entry line ${i + 1}: Amount cannot have more than 2 decimal places`);
      err.statusCode = 400;
      throw err;
    }

    if (e.type === 'Dr') {
      hasDr = true;
      paiseDr += paise;
    } else {
      hasCr = true;
      paiseCr += paise;
    }
  }

  if (!hasDr || !hasCr) {
    const err = new Error('A voucher must contain at least one Debit (Dr) and one Credit (Cr) entry');
    err.statusCode = 400;
    throw err;
  }

  if (paiseDr !== paiseCr) {
    const totalDrStr = (paiseDr / 100).toFixed(2);
    const totalCrStr = (paiseCr / 100).toFixed(2);
    const err = new Error(`Debit and Credit mismatch: Total Dr ₹${totalDrStr} does not equal Total Cr ₹${totalCrStr}`);
    err.statusCode = 400;
    throw err;
  }

  const totalAmount = paiseDr / 100;

  // 2. Validate Date
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    const err = new Error(`Invalid date format "${date}". Expected YYYY-MM-DD`);
    err.statusCode = 400;
    throw err;
  }
  const dateStr = parsedDate.toISOString().slice(0, 10);

  // 3. Acquire Pooled Connection for Atomic Transaction
  const client = await db.getConnection();
  try {
    await client.query('BEGIN');

    // Financial year resolution & lock check
    const financial_year = await resolveFinancialYear(client, finance_id, parsedDate);

    // Validate all ledger_ids belong to this finance and are active
    const ledgerIds = Array.from(new Set(entries.map(e => e.ledger_id)));
    const ledgerCheck = await client.query(
      `SELECT id FROM acc_ledgers
        WHERE finance_id = $1
          AND id = ANY($2::uuid[])
          AND is_active = true
          AND NOT inactive`,
      [finance_id, ledgerIds]
    );

    const foundLedgerIds = new Set(ledgerCheck.rows.map(r => r.id));
    for (const lid of ledgerIds) {
      if (!foundLedgerIds.has(lid)) {
        const err = new Error(`Ledger "${lid}" does not exist or is inactive in this company`);
        err.statusCode = 400;
        err.code = '23503';
        throw err;
      }
    }

    // Voucher type check (with lazy provisioning if needed)
    let vtRes = await client.query(
      `SELECT id, type_code, prefix, last_number, numbering_mode
         FROM acc_voucher_types
        WHERE finance_id = $1 AND (id::text = $2::text OR type_code = $2) AND is_active = true
        FOR UPDATE`,
      [finance_id, String(voucher_type_id)]
    );

    if (vtRes.rows.length === 0) {
      await ensureVoucherTypes(client, finance_id);
      vtRes = await client.query(
        `SELECT id, type_code, prefix, last_number, numbering_mode
           FROM acc_voucher_types
          WHERE finance_id = $1 AND (id::text = $2::text OR type_code = $2) AND is_active = true
          FOR UPDATE`,
        [finance_id, String(voucher_type_id)]
      );
    }

    if (vtRes.rows.length === 0) {
      const err = new Error('Voucher type does not exist or is inactive in this company');
      err.statusCode = 400;
      err.code = '23503';
      throw err;
    }

    const vt = vtRes.rows[0];
    const resolvedTypeId = vt.id;

    // Resolve Voucher Number
    let finalVoucherNumber;
    const manualNumber = typeof voucher_number === 'string' ? voucher_number.trim() : '';

    if (manualNumber) {
      if (manualNumber.length < 1 || manualNumber.length > 50) {
        const err = new Error('Voucher number must be between 1 and 50 characters');
        err.statusCode = 400;
        throw err;
      }

      // Check duplicate within company
      const dupCheck = await client.query(
        `SELECT id FROM acc_vouchers
          WHERE finance_id = $1 AND LOWER(voucher_number) = LOWER($2)
          LIMIT 1`,
        [finance_id, manualNumber]
      );

      if (dupCheck.rows.length > 0) {
        const err = new Error(`Voucher number "${manualNumber}" already exists in this company`);
        err.statusCode = 409;
        err.code = '23505';
        throw err;
      }

      finalVoucherNumber = manualNumber;
    } else {
      // Auto-increment voucher type counter atomically with row lock
      const bumpRes = await client.query(
        `UPDATE acc_voucher_types
            SET last_number = last_number + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND finance_id = $2
          RETURNING last_number, prefix, type_code`,
        [resolvedTypeId, finance_id]
      );

      const bumped = bumpRes.rows[0];
      const nextSeq = bumped.last_number;
      const prefix = bumped.prefix || bumped.type_code || 'VOUCH';
      finalVoucherNumber = `${prefix}/${financial_year}/${String(nextSeq).padStart(4, '0')}`;
    }

    // Step 2: Insert into acc_vouchers as 'Draft'
    const insVoucher = await client.query(
      `INSERT INTO acc_vouchers
        (finance_id, voucher_number, voucher_type_id, voucher_date, financial_year,
         narration, total_amount, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Draft', $8)
       RETURNING id, voucher_number`,
      [
        finance_id,
        finalVoucherNumber,
        resolvedTypeId,
        dateStr,
        financial_year,
        narration ? narration.trim() : null,
        totalAmount,
        created_by || null,
      ]
    );

    const voucherId = insVoucher.rows[0].id;

    // Step 3: Insert all entries in sort order
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      await client.query(
        `INSERT INTO acc_voucher_entries
          (finance_id, voucher_id, ledger_id, entry_type, amount, narration, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          finance_id,
          voucherId,
          e.ledger_id,
          e.type,
          parseFloat(e.amount),
          e.narration ? e.narration.trim() : null,
          i,
          created_by || null,
        ]
      );
    }

    // Step 4: Update voucher to 'Posted'
    await client.query(
      `UPDATE acc_vouchers
          SET status = 'Posted',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND finance_id = $2`,
      [voucherId, finance_id]
    );

    await client.query('COMMIT');

    return {
      id: voucherId,
      voucher_number: finalVoucherNumber,
      financial_year,
      total_amount: totalAmount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── 4. Multi Create Vouchers (Atomic Batch) ─────────────────────────────────
exports.multiCreateVoucher = async (finance_id, vouchers, created_by) => {
  if (!finance_id) throw new Error('finance_id is required');
  if (!Array.isArray(vouchers) || !vouchers.length) {
    throw new Error('vouchers array is required and must not be empty');
  }

  const results = [];
  const client = await db.getConnection();
  try {
    await client.query('BEGIN');

    for (let idx = 0; idx < vouchers.length; idx++) {
      const v = vouchers[idx];
      if (!Array.isArray(v.entries) || v.entries.length < 2) {
        throw new Error(`Row ${idx + 1}: At least 2 entries required`);
      }

      let paiseDr = 0;
      let paiseCr = 0;
      let hasDr = false;
      let hasCr = false;

      for (const e of v.entries) {
        if (!e.ledger_id) throw new Error(`Row ${idx + 1}: Ledger ID is required`);
        if (e.type !== 'Dr' && e.type !== 'Cr') throw new Error(`Row ${idx + 1}: Entry type must be Dr or Cr`);
        const numAmount = Number(e.amount);
        if (!Number.isFinite(numAmount) || numAmount <= 0) throw new Error(`Row ${idx + 1}: Amount must be > 0`);
        const paise = Math.round(numAmount * 100);
        if (e.type === 'Dr') { hasDr = true; paiseDr += paise; }
        else { hasCr = true; paiseCr += paise; }
      }

      if (!hasDr || !hasCr) throw new Error(`Row ${idx + 1}: Must contain at least one Dr and one Cr`);
      if (paiseDr !== paiseCr) throw new Error(`Row ${idx + 1}: Debit total must equal Credit total`);

      const totalAmount = paiseDr / 100;
      const parsedDate = new Date(v.date);
      if (isNaN(parsedDate.getTime())) throw new Error(`Row ${idx + 1}: Invalid date`);
      const dateStr = parsedDate.toISOString().slice(0, 10);
      const financial_year = await resolveFinancialYear(client, finance_id, parsedDate);

      // Voucher type
      let vtRes = await client.query(
        `SELECT id, type_code, prefix, last_number FROM acc_voucher_types WHERE finance_id = $1 AND (id::text = $2::text OR type_code = $2) AND is_active = true FOR UPDATE`,
        [finance_id, String(v.voucher_type_id)]
      );
      if (vtRes.rows.length === 0) {
        await ensureVoucherTypes(client, finance_id);
        vtRes = await client.query(
          `SELECT id, type_code, prefix, last_number FROM acc_voucher_types WHERE finance_id = $1 AND (id::text = $2::text OR type_code = $2) AND is_active = true FOR UPDATE`,
          [finance_id, String(v.voucher_type_id)]
        );
      }
      if (vtRes.rows.length === 0) throw new Error(`Row ${idx + 1}: Voucher type not found`);
      const vt = vtRes.rows[0];

      let finalNumber = v.voucher_number ? String(v.voucher_number).trim() : '';
      if (!finalNumber) {
        const bumpRes = await client.query(
          `UPDATE acc_voucher_types SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND finance_id = $2 RETURNING last_number, prefix, type_code`,
          [vt.id, finance_id]
        );
        const seq = bumpRes.rows[0].last_number;
        const pfx = bumpRes.rows[0].prefix || bumpRes.rows[0].type_code || 'VOUCH';
        finalNumber = `${pfx}/${financial_year}/${String(seq).padStart(4, '0')}`;
      }

      const insVoucher = await client.query(
        `INSERT INTO acc_vouchers
          (finance_id, voucher_number, voucher_type_id, voucher_date, financial_year,
           narration, total_amount, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Draft', $8)
         RETURNING id, voucher_number`,
        [finance_id, finalNumber, vt.id, dateStr, financial_year, v.narration || null, totalAmount, created_by || null]
      );
      const voucherId = insVoucher.rows[0].id;

      for (let i = 0; i < v.entries.length; i++) {
        const e = v.entries[i];
        await client.query(
          `INSERT INTO acc_voucher_entries
            (finance_id, voucher_id, ledger_id, entry_type, amount, narration, sort_order, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [finance_id, voucherId, e.ledger_id, e.type, parseFloat(e.amount), e.narration || null, i, created_by || null]
        );
      }

      await client.query(
        `UPDATE acc_vouchers SET status = 'Posted', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND finance_id = $2`,
        [voucherId, finance_id]
      );

      results.push({ id: voucherId, voucher_number: finalNumber, financial_year, total_amount: totalAmount });
    }

    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── 5. List Vouchers (Register with Filters, Search & Entries) ───────────────
exports.listVouchers = async (finance_id, { from, to, type_id, status, search, limit = 100, offset = 0 } = {}) => {
  if (!finance_id) throw new Error('finance_id is required');

  const safeLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const whereClauses = ['v.finance_id = $1'];
  const params = [finance_id];

  if (from) {
    params.push(from);
    whereClauses.push(`v.voucher_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    whereClauses.push(`v.voucher_date <= $${params.length}`);
  }
  if (type_id && type_id !== 'all') {
    params.push(type_id);
    whereClauses.push(`(v.voucher_type_id::text = $${params.length}::text OR vt.type_code = $${params.length})`);
  }
  if (status) {
    params.push(status);
    whereClauses.push(`v.status = $${params.length}`);
  } else {
    // Default: show Posted and Cancelled, hide Draft
    whereClauses.push(`v.status IN ('Posted', 'Cancelled')`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    const sIdx = params.length;
    whereClauses.push(`(
      v.voucher_number ILIKE $${sIdx}
      OR v.narration ILIKE $${sIdx}
      OR EXISTS (
        SELECT 1 FROM acc_voucher_entries se
        JOIN acc_ledgers sl ON sl.id = se.ledger_id
        WHERE se.voucher_id = v.id AND sl.ledger_name ILIKE $${sIdx}
      )
    )`);
  }

  const whereSQL = whereClauses.join(' AND ');

  // 1. Total count for pagination
  const countRes = await db.query(
    `SELECT COUNT(*)
       FROM acc_vouchers v
       JOIN acc_voucher_types vt ON vt.id = v.voucher_type_id
      WHERE ${whereSQL}`,
    params
  );
  const total = parseInt(countRes.rows[0].count, 10) || 0;

  if (total === 0) {
    return { data: [], total: 0 };
  }

  // 2. Fetch page of vouchers
  params.push(safeLimit);
  const lIdx = params.length;
  params.push(safeOffset);
  const oIdx = params.length;

  const voucherRes = await db.query(
    `SELECT
       v.id,
       v.voucher_number,
       TO_CHAR(v.voucher_date, 'YYYY-MM-DD') AS voucher_date,
       v.voucher_type_id,
       v.financial_year,
       v.narration,
       v.total_amount,
       v.status,
       vt.type_name,
       vt.class AS type_class,
       vt.type_code
     FROM acc_vouchers v
     JOIN acc_voucher_types vt ON vt.id = v.voucher_type_id
     WHERE ${whereSQL}
     ORDER BY v.voucher_date DESC, v.created_at DESC
     LIMIT $${lIdx} OFFSET $${oIdx}`,
    params
  );

  const vouchers = voucherRes.rows;
  if (vouchers.length === 0) {
    return { data: [], total };
  }

  // 3. Batch fetch all entries for these vouchers in one query
  const voucherIds = vouchers.map(v => v.id);
  const entriesRes = await db.query(
    `SELECT
       e.voucher_id,
       e.ledger_id,
       e.entry_type AS type,
       e.amount,
       e.narration,
       e.sort_order,
       l.ledger_name
     FROM acc_voucher_entries e
     JOIN acc_ledgers l ON l.id = e.ledger_id
     WHERE e.voucher_id = ANY($1::uuid[])
     ORDER BY e.sort_order ASC`,
    [voucherIds]
  );

  const entriesByVoucher = new Map();
  for (const entry of entriesRes.rows) {
    if (!entriesByVoucher.has(entry.voucher_id)) {
      entriesByVoucher.set(entry.voucher_id, []);
    }
    entriesByVoucher.get(entry.voucher_id).push({
      ledger_id: entry.ledger_id,
      ledger_name: entry.ledger_name,
      type: entry.type,
      amount: parseFloat(entry.amount),
      narration: entry.narration,
    });
  }

  const data = vouchers.map(v => ({
    id: v.id,
    voucher_number: v.voucher_number,
    voucher_date: v.voucher_date,
    type_id: v.voucher_type_id,
    type_name: v.type_name,
    type_class: v.type_class,
    type_code: v.type_code,
    financial_year: v.financial_year,
    narration: v.narration,
    total_amount: parseFloat(v.total_amount),
    status: v.status,
    entries: entriesByVoucher.get(v.id) || [],
  }));

  return { data, total };
};

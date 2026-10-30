// (ledger_code generation removed — acc_ledgers no longer has a ledger_code column)
const { db } = require('../../../config/database.config');

function getFinancialYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan ... 3 = Apr

  const startYear = month >= 3 ? year : year - 1; // Apr(3) or later → FY starts this year
  const endYear = startYear + 1;

  return `${startYear}-${endYear}`;
}

// ─── Helper: resolve the active fiscal year for a finance company from DB ──
//     Looks up acc_financial_years for the row marked is_current = 1.
//     Falls back to the date-based calculation above if no row exists yet
//     (e.g. company hasn't configured financial years in the system).
// ─────────────────────────────────────────────────────────────────────────
async function resolveCurrentFinancialYear(conn, finance_id) {
  const [[fy]] = await conn.query(
    `SELECT year_label, start_date, end_date, is_locked
       FROM acc_financial_years
      WHERE finance_id = ? AND is_current = 1
      LIMIT 1`,
    [finance_id]
  );

  if (fy) {
    if (fy.is_locked) {
      throw new Error(`Financial year ${fy.year_label} is locked for this company`);
    }
    return fy.year_label;
  }

  // No configured financial years for this company yet — fall back to
  // calendar-derived label so ledger creation isn't blocked.
  return getFinancialYear(new Date());
}

// ─── Helper: resolve "Under" selection into the mutually-exclusive ─────────
//     group_id (custom group) / master_group_id (system group) columns.
//
//     The frontend "Under" picker (getUnderDropdown) returns rows tagged
//     with `source: 'system' | 'custom'`. Whichever was picked, only ONE
//     of group_id / master_group_id may ever be written — the other is
//     always NULL. This mirrors the DB-level CHECK constraint
//     (chk_ledger_under_exclusivity) added in
//     migration_ledger_group_exclusivity.sql.
// ─────────────────────────────────────────────────────────────────────────

async function resolveUnderGroupColumns(conn, finance_id, { under_id, under_source, group_id, master_group_id }) {
  // Back-compat: callers may still pass explicit group_id / master_group_id
  // directly instead of under_id/under_source — accept either shape, but
  // always re-derive and re-validate so the two columns can never both end
  // up populated.
  let id = under_id;
  let source = under_source;
  if (!id && group_id) { id = group_id; source = 'custom'; }
  if (!id && master_group_id) { id = master_group_id; source = 'system'; }

  if (!id || !source) {
    throw new Error('Under group is required: provide under_id and under_source ("system" | "custom")');
  }
  if (!['system', 'custom'].includes(source)) {
    throw new Error('under_source must be either "system" or "custom"');
  }

  if (source === 'custom') {
    // Custom group → acc_ledger_groups, scoped to this finance/company
    const [[grp]] = await conn.query(
      `SELECT id, nature FROM acc_ledger_groups WHERE id = ? AND finance_id = ? AND is_active = 1`,
      [id, finance_id]
    );
    if (!grp) throw new Error(`Custom group id ${id} not found for this company`);
    return { group_id: grp.id, master_group_id: null, nature: grp.nature };
  }

  // system → acc_group_master (global, not finance-scoped)
  const [[grp]] = await conn.query(
    `SELECT id, nature FROM acc_group_master WHERE id = ? AND is_active = 1`,
    [id]
  );
  if (!grp) throw new Error(`Master group id ${id} not found`);
  return { group_id: null, master_group_id: grp.id, nature: grp.nature };
}

// ─── Helper: persist Advanced Ledger satellite details ─────────────────────
//     Mailing / Banking / Tax / Statutory / Bill-wise blocks captured by the
//     Advanced Ledger dialog. Each table is 1:1 with the ledger, so we use
//     INSERT ... ON DUPLICATE KEY UPDATE to keep create + update idempotent.
//     All blocks are optional — only persisted when the caller supplied
//     relevant data for that section.
// ─────────────────────────────────────────────────────────────────────────
async function saveLedgerAdvancedDetails(conn, finance_id, ledgerId, d, created_by) {
  // ── Mailing ────────────────────────────────────────────────
  if (
    d.mailingName !== undefined || d.addr1 !== undefined || d.addr2 !== undefined ||
    d.city !== undefined || d.state !== undefined || d.pincode !== undefined ||
    d.provideContactDetails !== undefined || d.contactPerson !== undefined ||
    d.mobile !== undefined || d.email !== undefined
  ) {
    await conn.query(
      `INSERT INTO acc_ledger_mailing
        (finance_id, ledger_id, mailing_name, addr_line1, addr_line2, addr_line3, addr_line4,
         city, district, state, country, pin_code, show_mailing_details,
         provide_contact, contact_person, telephone, mobile, primary_mobile, fax, email, email_cc, website, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         mailing_name=VALUES(mailing_name), addr_line1=VALUES(addr_line1), addr_line2=VALUES(addr_line2),
         addr_line3=VALUES(addr_line3), addr_line4=VALUES(addr_line4), city=VALUES(city), district=VALUES(district),
         state=VALUES(state), country=VALUES(country), pin_code=VALUES(pin_code),
         show_mailing_details=VALUES(show_mailing_details), provide_contact=VALUES(provide_contact),
         contact_person=VALUES(contact_person), telephone=VALUES(telephone), mobile=VALUES(mobile),
         primary_mobile=VALUES(primary_mobile), fax=VALUES(fax), email=VALUES(email),
         email_cc=VALUES(email_cc), website=VALUES(website)`,
      [
        finance_id, ledgerId, d.mailingName || null, d.addr1 || null, d.addr2 || null, d.addr3 || null, d.addr4 || null,
        d.city || null, d.district || null, d.state || null, d.country || 'India', d.pincode || null,
        d.showMailingDetails === undefined ? 1 : (d.showMailingDetails ? 1 : 0),
        d.provideContactDetails ? 1 : 0, d.contactPerson || null, d.telephone || null, d.mobile || null,
        d.primaryMobile || null, d.fax || null, d.email || null, d.emailCC || null, d.website || null, created_by,
      ]
    );
  }

  // ── Banking (primary account only — multiple accounts handled separately) ──
  if (d.provideBankDetails || d.bankName || d.accountNumber || d.ifsc) {
    await conn.query(
      `INSERT INTO acc_ledger_banking
        (finance_id, ledger_id, provide_bank_details, account_holder_name, bank_name, account_number,
         ifsc_code, swift_code, branch_name, acc_type, upi_id, is_primary, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         provide_bank_details=VALUES(provide_bank_details), account_holder_name=VALUES(account_holder_name),
         bank_name=VALUES(bank_name), account_number=VALUES(account_number), ifsc_code=VALUES(ifsc_code),
         swift_code=VALUES(swift_code), branch_name=VALUES(branch_name), acc_type=VALUES(acc_type),
         upi_id=VALUES(upi_id)`,
      [
        finance_id, ledgerId, d.provideBankDetails ? 1 : 0, d.accountHolderName || d.ledger_name || null,
        d.bankName || null, d.accountNumber || null, d.ifsc || null, d.swift || null, d.branch || null,
        d.accountType || 'Current', d.upiId || null, 1, created_by,
      ]
    );
  }

  // ── Tax ────────────────────────────────────────────────────
  if (d.panIt || d.gstin || d.registrationType || d.taxType) {
    await conn.query(
      `INSERT INTO acc_ledger_tax
        (finance_id, ledger_id, pan_number, gstin, reg_type, assessee_other_territory, territory,
         tan_number, deductor_category, collection_account_no, tax_type, deductee_type, buyer_type, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         pan_number=VALUES(pan_number), gstin=VALUES(gstin), reg_type=VALUES(reg_type),
         assessee_other_territory=VALUES(assessee_other_territory), territory=VALUES(territory),
         tan_number=VALUES(tan_number), deductor_category=VALUES(deductor_category),
         collection_account_no=VALUES(collection_account_no), tax_type=VALUES(tax_type),
         deductee_type=VALUES(deductee_type), buyer_type=VALUES(buyer_type)`,
      [
        finance_id, ledgerId, d.panIt || null, d.gstin || null, d.registrationType || 'Unregistered',
        d.assesseeOtherTerritory ? 1 : 0, d.territory || null, d.tanNumber || null, d.deductorCategory || null,
        d.collectionAccountNo || null, d.taxType || 'None', d.deducteeType || null, d.buyerType || null, created_by,
      ]
    );
  }

  // ── Statutory (MSME / e-Invoice / e-Way Bill) ─────────────────
  if (d.msmeRegistered || d.einvoiceApplicable || d.ewayBillApplicable) {
    await conn.query(
      `INSERT INTO acc_ledger_statutory
        (finance_id, ledger_id, msme_registered, udyam_number, einvoice_applicable, default_supply_type,
         eway_bill_applicable, default_transport_mode, default_distance_km, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         msme_registered=VALUES(msme_registered), udyam_number=VALUES(udyam_number),
         einvoice_applicable=VALUES(einvoice_applicable), default_supply_type=VALUES(default_supply_type),
         eway_bill_applicable=VALUES(eway_bill_applicable), default_transport_mode=VALUES(default_transport_mode),
         default_distance_km=VALUES(default_distance_km)`,
      [
        finance_id, ledgerId, d.msmeRegistered ? 1 : 0, d.udyamNumber || null,
        d.einvoiceApplicable ? 1 : 0, d.defaultSupplyType || 'B2B',
        d.ewayBillApplicable ? 1 : 0, d.defaultTransportMode || 'Road', d.defaultDistance || null, created_by,
      ]
    );
  }

  // ── Bill-wise / credit period ─────────────────────────────────
  if (d.maintainBillWise !== undefined || d.defaultCreditPeriod !== undefined) {
    await conn.query(
      `INSERT INTO acc_ledger_billwise
        (finance_id, ledger_id, bill_wise, credit_days, check_credit_days, created_by)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         bill_wise=VALUES(bill_wise), credit_days=VALUES(credit_days), check_credit_days=VALUES(check_credit_days)`,
      [
        finance_id, ledgerId, d.maintainBillWise ? 1 : 0,
        d.defaultCreditPeriod !== undefined && d.defaultCreditPeriod !== '' ? Number(d.defaultCreditPeriod) : 30,
        d.checkCreditDaysDuringEntry ? 1 : 0, created_by,
      ]
    );
  }
}

// ─── 1. Create single ledger ────────────────────────────────────────────────
exports.createLedger = async (data) => {
  const {
    finance_id,
    ledger_name,
    alias = null,
    alias_regional = null,
    reporting_under = null,
    inactive = 0,
    opening_balance = 0,
    ob_type = 'Dr',
    effective_date = null,
    freeze_balance = 0,
    inv_values_affected = 0,
    type_of_ledger = 'Not Applicable',
    rounding_method = 'Not Applicable',
    rounding_limit = null,
    appropriation_method = 'Not Applicable',
    method_to_allocate = 0,
    is_additional_cost = 0,
    cost_centre_applicable = 0,
    cost_centre_allocation = 0,
    ledger_flushing_method = 'Default',
    include_in_buyer_ledger = 0,
    include_in_seller_ledger = 0,
    is_bank_account = 0,
    created_by = null,
  } = data;

  if (!finance_id || !ledger_name?.trim()) {
    throw new Error('finance_id and ledger_name are required');
  }

  // Duplicate check
  const [[dup]] = await db.query(
    `SELECT id FROM acc_ledgers WHERE finance_id = ? AND LOWER(ledger_name) = LOWER(?) LIMIT 1`,
    [finance_id, ledger_name.trim()]
  );
  if (dup) throw new Error(`Ledger "${ledger_name}" already exists in this finance`);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── Conditional mapping: exactly one of group_id / master_group_id ──
    const { group_id, master_group_id } = await resolveUnderGroupColumns(conn, finance_id, data);

    const [result] = await conn.query(
      `INSERT INTO acc_ledgers
        (finance_id, ledger_name, alias, alias_regional, group_id, master_group_id, reporting_under, inactive,
         opening_balance, ob_type, effective_date, freeze_balance,
         inv_values_affected, type_of_ledger, rounding_method, rounding_limit,
         appropriation_method, method_to_allocate, is_additional_cost,
         cost_centre_applicable, cost_centre_allocation,
         ledger_flushing_method, include_in_buyer_ledger, include_in_seller_ledger,
         is_bank_account, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        finance_id, ledger_name.trim(), alias, alias_regional, group_id, master_group_id, reporting_under, inactive ? 1 : 0,
        opening_balance, ob_type, effective_date, freeze_balance ? 1 : 0,
        inv_values_affected ? 1 : 0, type_of_ledger, rounding_method, rounding_limit,
        appropriation_method, method_to_allocate ? 1 : 0, is_additional_cost ? 1 : 0,
        cost_centre_applicable ? 1 : 0, cost_centre_allocation ? 1 : 0,
        ledger_flushing_method, include_in_buyer_ledger ? 1 : 0, include_in_seller_ledger ? 1 : 0,
        is_bank_account ? 1 : 0, created_by,
      ]
    );
    const ledgerId = result.insertId;

    // Create opening balance entry in acc_ledger_balances
    const fy = getFinancialYear(new Date());
    const ob_dr = ob_type === 'Dr' ? opening_balance : 0;
    const ob_cr = ob_type === 'Cr' ? opening_balance : 0;
    await conn.query(
      `INSERT INTO acc_ledger_balances (finance_id, ledger_id, financial_year, opening_dr, opening_cr)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE opening_dr = VALUES(opening_dr), opening_cr = VALUES(opening_cr)`,
      [finance_id, ledgerId, fy, ob_dr, ob_cr]
    );

    // Persist Advanced Ledger details (mailing / banking / tax / statutory / bill-wise)
    await saveLedgerAdvancedDetails(conn, finance_id, ledgerId, data, created_by);

    await conn.commit();
    return ledgerId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── 2. Multi create ledgers ─────────────────────────────────────────────────
exports.multiCreateLedger = async (finance_id, ledgers) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const ids = [];
    const fy = getFinancialYear(new Date());

    for (const l of ledgers) {
      if (!l.ledger_name?.trim()) throw new Error('ledger_name is required for every row');

      // ── Conditional mapping: exactly one of group_id / master_group_id ──
      const { group_id, master_group_id } = await resolveUnderGroupColumns(conn, finance_id, l);

      const opening_balance = l.opening_balance || 0;
      const ob_type = l.ob_type || 'Dr';

      const [result] = await conn.query(
        `INSERT INTO acc_ledgers
          (finance_id, ledger_name, alias, alias_regional, group_id, master_group_id, reporting_under, inactive,
           opening_balance, ob_type, effective_date, freeze_balance, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          finance_id, l.ledger_name.trim(), l.alias || null, l.alias_regional || null,
          group_id, master_group_id, l.reporting_under || null, l.inactive ? 1 : 0,
          opening_balance, ob_type, l.effective_date || null, l.freeze_balance ? 1 : 0, l.created_by || null,
        ]
      );
      const ledgerId = result.insertId;
      ids.push(ledgerId);

      const ob_dr = ob_type === 'Dr' ? opening_balance : 0;
      const ob_cr = ob_type === 'Cr' ? opening_balance : 0;
      await conn.query(
        `INSERT INTO acc_ledger_balances (finance_id, ledger_id, financial_year, opening_dr, opening_cr)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE opening_dr = VALUES(opening_dr), opening_cr = VALUES(opening_cr)`,
        [finance_id, ledgerId, fy, ob_dr, ob_cr]
      );

      // Persist Advanced Ledger details for this row, if supplied
      await saveLedgerAdvancedDetails(conn, finance_id, ledgerId, l, l.created_by || null);
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

// â”€â”€â”€ 3. Update ledger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.updateLedger = async (id, finance_id, data) => {
  const fields = [
    'ledger_name', 'alias', 'alias_regional', 'reporting_under', 'inactive',
    'opening_balance', 'ob_type', 'effective_date', 'freeze_balance',
    'inv_values_affected', 'type_of_ledger', 'rounding_method', 'rounding_limit',
    'appropriation_method', 'method_to_allocate', 'is_additional_cost',
    'cost_centre_applicable', 'cost_centre_allocation',
    'ledger_flushing_method', 'include_in_buyer_ledger', 'include_in_seller_ledger',
    'is_bank_account', 'is_active',
  ];

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const updates = [];
    const values = [];
    fields.forEach(f => {
      if (data[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(data[f]);
      }
    });

    // ── Conditional mapping: only re-resolve group_id/master_group_id if the
    //    caller is actually changing the "Under" selection ─────────────────
    if (data.under_id !== undefined || data.group_id !== undefined || data.master_group_id !== undefined) {
      const { group_id, master_group_id } = await resolveUnderGroupColumns(conn, finance_id, data);
      updates.push('group_id = ?', 'master_group_id = ?');
      values.push(group_id, master_group_id);
    }

    if (updates.length === 0) throw new Error('Nothing to update');

    values.push(id, finance_id);
    await conn.query(
      `UPDATE acc_ledgers SET ${updates.join(', ')} WHERE id = ? AND finance_id = ?`,
      values
    );

    // Persist Advanced Ledger details, if any were sent in this update
    await saveLedgerAdvancedDetails(conn, finance_id, id, data, data.updated_by || data.created_by || null);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Re-sync opening balance in acc_ledger_balances if changed
  if (data.opening_balance !== undefined || data.ob_type !== undefined) {
    const [[ledger]] = await db.query(
      `SELECT opening_balance, ob_type FROM acc_ledgers WHERE id = ? AND finance_id = ?`,
      [id, finance_id]
    );
    if (ledger) {
      const fy = getFinancialYear(new Date());
      await db.query(
        `INSERT INTO acc_ledger_balances (finance_id, ledger_id, financial_year, opening_dr, opening_cr)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           opening_dr = VALUES(opening_dr),
           opening_cr = VALUES(opening_cr)`,
        [
          finance_id, id, fy,
          ledger.ob_type === 'Dr' ? ledger.opening_balance : 0,
          ledger.ob_type === 'Cr' ? ledger.opening_balance : 0,
        ]
      );
    }
  }
  return true;
};

// â”€â”€â”€ 4. Delete ledger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.deleteLedger = async (id, finance_id) => {
  const [[ledger]] = await db.query(
    `SELECT is_system FROM acc_ledgers WHERE id = ? AND finance_id = ?`,
    [id, finance_id]
  );
  if (!ledger) throw new Error('Ledger not found');
  if (ledger.is_system) throw new Error('System ledgers cannot be deleted');

  // Check for posted vouchers
  const [[{ cnt }]] = await db.query(
    `SELECT COUNT(*) AS cnt FROM acc_voucher_entries WHERE ledger_id = ? AND finance_id = ?`,
    [id, finance_id]
  );
  if (cnt > 0) throw new Error('Cannot delete ledger with posted entries. Consider deactivating instead.');

  await db.query(`DELETE FROM acc_ledger_balances WHERE ledger_id = ? AND finance_id = ?`, [id, finance_id]);
  await db.query(`DELETE FROM acc_ledgers WHERE id = ? AND finance_id = ?`, [id, finance_id]);
  return true;
};

// â”€â”€â”€ 5. List ledgers with group + balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.listLedgers = async (finance_id, financial_year) => {
  const fy = financial_year || getFinancialYear(new Date());

  const [rows] = await db.query(
    `SELECT
      l.id,
      l.finance_id,
      l.ledger_name,
      l.alias,
      l.alias_regional,
      l.group_id,
      l.master_group_id,
      l.reporting_under,
      l.opening_balance,
      l.ob_type,
      l.effective_date,
      l.freeze_balance,
      l.inactive,

      COALESCE(g.group_name, gm.group_name) AS group_name,
      g.alias AS group_alias,
      COALESCE(g.nature, gm.nature) AS nature,
      g.custom_parent_id,
      CASE WHEN l.master_group_id IS NOT NULL THEN 'system' ELSE 'custom' END AS group_source,

      COALESCE(b.opening_dr,0) AS opening_dr,
      COALESCE(b.opening_cr,0) AS opening_cr,
      COALESCE(b.period_dr,0)  AS period_dr,
      COALESCE(b.period_cr,0)  AS period_cr,
      COALESCE(b.closing_dr,0) AS closing_dr,
      COALESCE(b.closing_cr,0) AS closing_cr

  FROM acc_ledgers l

  LEFT JOIN acc_ledger_groups g
        ON g.id = l.group_id

  LEFT JOIN acc_group_master gm
        ON gm.id = l.master_group_id

  LEFT JOIN acc_ledger_balances b
        ON b.ledger_id = l.id
        AND b.finance_id = l.finance_id
        AND b.financial_year = ?

  WHERE l.finance_id = ?
    AND l.inactive = 0

  ORDER BY
      COALESCE(g.group_name, gm.group_name),
      l.ledger_name`,
    [fy, finance_id]
  );

  return rows;
};

// â”€â”€â”€ 6. List ledger groups (flat) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.listLedgerGroups = async (finance_id) => {
  const [rows] = await db.query(
    `SELECT id, group_code, group_name, parent_group_id, nature,
            sort_order, is_system, is_active, description
     FROM acc_ledger_groups
     WHERE finance_id = ? AND is_active = 1
     ORDER BY sort_order, group_name`,
    [finance_id]
  );
  return rows;
};

// â”€â”€â”€ 7. Get group by id with ledgers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getGroupWithLedgers = async (group_id, finance_id) => {
  const [[group]] = await db.query(
    `SELECT * FROM acc_ledger_groups WHERE id = ? AND finance_id = ?`,
    [group_id, finance_id]
  );
  if (!group) throw new Error('Group not found');

  // Fetch all sub-group ids (recursive via app-level BFS)
  const allGroupIds = [group_id];
  const queue = [group_id];
  while (queue.length) {
    const parentId = queue.shift();
    const [children] = await db.query(
      `SELECT id FROM acc_ledger_groups WHERE parent_group_id = ? AND finance_id = ?`,
      [parentId, finance_id]
    );
    children.forEach(c => { allGroupIds.push(c.id); queue.push(c.id); });
  }

  const placeholders = allGroupIds.map(() => '?').join(',');
  const [ledgers] = await db.query(
    `SELECT l.id, l.ledger_name, l.opening_balance, l.ob_type, l.is_active, l.group_id, l.master_group_id
     FROM acc_ledgers l
     WHERE l.group_id IN (${placeholders}) AND l.finance_id = ? AND l.is_active = 1
     ORDER BY l.ledger_name`,
    [...allGroupIds, finance_id]
  );

  return { group, ledgers };
};

// â”€â”€â”€ 8. Create ledger group â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.createLedgerGroup = async (data) => {
  const {
    finance_id,
    group_name,
    parent_group_id = null,
    nature,
    description = null,
    sort_order = 99,
    created_by = null,
  } = data;

  if (!finance_id || !group_name?.trim() || !nature) {
    throw new Error('finance_id, group_name, and nature are required');
  }

  const [[dup]] = await db.query(
    `SELECT id FROM acc_ledger_groups WHERE finance_id = ? AND LOWER(group_name) = LOWER(?) LIMIT 1`,
    [finance_id, group_name.trim()]
  );
  if (dup) throw new Error(`Group "${group_name}" already exists`);

  const group_code = group_name.substring(0, 8).toUpperCase().replace(/\s+/g, '-') + '-' + Date.now().toString().slice(-4);

  const [result] = await db.query(
    `INSERT INTO acc_ledger_groups
      (finance_id, group_code, group_name, parent_group_id, nature, description, sort_order, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [finance_id, group_code, group_name.trim(), parent_group_id, nature, description, sort_order, created_by]
  );
  return result.insertId;
};

// â”€â”€â”€ 9. Ledger balance summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getLedgerSummary = async (finance_id, financial_year) => {
  const fy = financial_year || getFinancialYear(new Date());
  const [[summary]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN l.ob_type = 'Dr' THEN l.opening_balance ELSE 0 END), 0) AS totalDr,
       COALESCE(SUM(CASE WHEN l.ob_type = 'Cr' THEN l.opening_balance ELSE 0 END), 0) AS totalCr,
       COALESCE(SUM(CASE WHEN l.ob_type = 'Dr' THEN l.opening_balance ELSE -l.opening_balance END), 0) AS netBalance,
       COALESCE(SUM(COALESCE(b.closing_dr, 0)), 0) AS closingDr,
       COALESCE(SUM(COALESCE(b.closing_cr, 0)), 0) AS closingCr
     FROM acc_ledgers l
     LEFT JOIN acc_ledger_balances b
       ON b.ledger_id = l.id AND b.finance_id = l.finance_id AND b.financial_year = ?
     WHERE l.finance_id = ? AND l.is_active = 1`,
    [fy, finance_id]
  );

  const net = summary.netBalance;
  return {
    totalDr: summary.totalDr,
    totalCr: summary.totalCr,
    openingBalance: Math.abs(net),
    openingType: net >= 0 ? 'Dr' : 'Cr',
    closingBalance: Math.abs(summary.closingDr - summary.closingCr),
    closingType: summary.closingDr >= summary.closingCr ? 'Dr' : 'Cr',
  };
};

// â”€â”€â”€ 10. List voucher types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.listVoucherTypes = async (finance_id) => {
  const [rows] = await db.query(
    `SELECT id, type_code, type_name, class, prefix, numbering_mode
     FROM acc_voucher_types
     WHERE finance_id = ? AND is_active = 1
     ORDER BY type_name`,
    [finance_id]
  );
  return rows;
};

// â”€â”€â”€ 11. Ledger statement (running balance) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getLedgerStatement = async (ledger_id, finance_id, from_date, to_date) => {
  const [[{ ob_dr, ob_cr }]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN e.entry_type='Dr' THEN e.amount ELSE 0 END), 0) AS ob_dr,
       COALESCE(SUM(CASE WHEN e.entry_type='Cr' THEN e.amount ELSE 0 END), 0) AS ob_cr
     FROM acc_voucher_entries e
     JOIN acc_vouchers v ON e.voucher_id = v.id
     WHERE e.ledger_id = ? AND e.finance_id = ?
       AND v.voucher_date < ? AND v.status = 'Posted'`,
    [ledger_id, finance_id, from_date]
  );

  const [entries] = await db.query(
    `SELECT
       v.voucher_date,
       v.voucher_number,
       vt.type_name  AS voucher_type,
       e.entry_type,
       e.amount
     FROM acc_voucher_entries e
     JOIN acc_vouchers v  ON e.voucher_id = v.id
     JOIN acc_voucher_types vt ON v.voucher_type_id = vt.id
     WHERE e.ledger_id = ? AND e.finance_id = ?
       AND v.voucher_date BETWEEN ? AND ?
       AND v.status = 'Posted'
     ORDER BY v.voucher_date, v.id`,
    [ledger_id, finance_id, from_date, to_date]
  );

  const [[ledger]] = await db.query(
    `SELECT l.ledger_name, l.alias, l.opening_balance, l.ob_type,
            COALESCE(g.group_name, gm.group_name) AS group_name,
            COALESCE(g.nature, gm.nature) AS nature
     FROM acc_ledgers l
     LEFT JOIN acc_ledger_groups g ON l.group_id = g.id
     LEFT JOIN acc_group_master gm ON l.master_group_id = gm.id
     WHERE l.id = ? AND l.finance_id = ?`,
    [ledger_id, finance_id]
  );

  return { ledger, opening: { dr: ob_dr, cr: ob_cr }, entries };
};


/**
 * Get recent active ledgers for a finance company
 * @param {number} finance_id - The finance company ID
 * @param {number} limit - Maximum number of records to return (default: 10)
 * @returns {Promise<Array>} Array of ledger objects with group information
 */
exports.getRecentLedgers = async (finance_id, limit = 10) => {
  try {
    // Validate inputs
    if (!finance_id || isNaN(finance_id)) {
      throw new Error('Invalid finance_id provided');
    }

    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      limit = 10;
    } else {
      limit = parsedLimit;
    }

    const sql = `
      SELECT 
        l.id, 
        l.finance_id,
        l.ledger_name,
        l.alias,
        l.alias_regional,
        l.group_id,
        l.master_group_id,
        l.reporting_under,
        l.opening_balance,
        l.ob_type,
        l.effective_date,
        l.freeze_balance,
        l.inactive,
        l.is_active,
        l.is_bank_account,
        l.is_system,
        l.created_at,
        l.updated_at,
        l.created_by,
        gm.id AS system_group_id,
        gm.group_name AS system_group_name,
        gm.nature AS system_group_nature,
        lg.id AS custom_group_id,
        lg.group_name AS custom_group_name,
        lg.nature AS custom_group_nature
      FROM acc_ledgers l
      LEFT JOIN acc_group_master gm ON gm.id = l.master_group_id
      LEFT JOIN acc_ledger_groups lg ON lg.id = l.group_id
      WHERE l.finance_id = ? AND l.is_active = 1
      ORDER BY l.created_at DESC
      LIMIT ${parseInt(limit)}
    `;

    const [rows] = await db.execute(sql, [parseInt(finance_id)]);

    if (!rows || !rows.length) {
      return [];
    }

    // Transform each row with proper group resolution
    return rows.map(row => {
      let group = null;

      if (row.master_group_id) {
        group = {
          source: 'system',
          id: row.system_group_id,
          name: row.system_group_name,
          nature: row.system_group_nature,
        };
      } else if (row.group_id) {
        group = {
          source: 'custom',
          id: row.custom_group_id,
          name: row.custom_group_name,
          nature: row.custom_group_nature
        };
      }

      return {
        id: row.id,
        finance_id: row.finance_id,
        ledger_name: row.ledger_name,
        alias: row.alias,
        alias_regional: row.alias_regional,
        reporting_under: row.reporting_under,
        opening_balance: parseFloat(row.opening_balance || 0),
        ob_type: row.ob_type || 'Dr',
        effective_date: row.effective_date,
        freeze_balance: row.freeze_balance === 1,
        is_active: row.is_active === 1,
        inactive: row.inactive === 1,
        is_bank_account: row.is_bank_account === 1,
        is_system: row.is_system === 1,
        group: group,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });

  } catch (error) {
    console.error('Error in getRecentLedgers:', error);
    throw error;
  }
};


exports.getLedgerDetails = async (ledgerId, finance_id) => {
  const sql = `
      SELECT
          l.id AS ledger_id,
          l.finance_id,
          l.ledger_name,
          l.alias,
          l.alias_regional,
          l.group_id,
          l.master_group_id,
          l.reporting_under,
          l.inactive,
          l.is_active,
          l.opening_balance,
          l.ob_type,
          l.effective_date,
          l.freeze_balance,
          l.inv_values_affected,
          l.type_of_ledger,
          l.rounding_method,
          l.rounding_limit,
          l.appropriation_method,
          l.method_to_allocate,
          l.is_additional_cost,
          l.cost_centre_applicable,
          l.cost_centre_allocation,
          l.ledger_flushing_method,
          l.include_in_buyer_ledger,
          l.include_in_seller_ledger,
          l.is_bank_account,
          l.is_system,
          l.created_by,
          l.created_at,
          l.updated_at,

          gm.group_name AS system_group_name,
          gm.nature AS system_group_nature,

          lg.group_name AS custom_group_name,
          lg.nature AS custom_group_nature,
          lg.affects_gross_profit AS custom_affects_gross_profit,
          lg.behaves_like_subledger AS custom_behaves_like_subledger,
          lg.nett_balance_report AS custom_nett_balance_report,
          lg.used_for_calculation AS custom_used_for_calculation,
          lg.allocation_method AS custom_allocation_method,

          lb.opening_dr AS balance_opening_dr,
          lb.opening_cr AS balance_opening_cr,
          lb.period_dr AS balance_period_dr,
          lb.period_cr AS balance_period_cr,
          lb.closing_dr AS balance_closing_dr,
          lb.closing_cr AS balance_closing_cr,
          lb.financial_year AS balance_financial_year,

          lm.mailing_name,
          lm.addr_line1 AS mailing_address1,
          lm.addr_line2 AS mailing_address2,
          lm.addr_line3 AS mailing_address3,
          lm.addr_line4 AS mailing_address4,
          lm.city AS mailing_city,
          lm.district AS mailing_district,
          lm.state AS mailing_state,
          lm.country AS mailing_country,
          lm.pin_code AS mailing_pincode,
          lm.show_mailing_details,
          lm.provide_contact,
          lm.contact_person,
          lm.telephone AS mailing_telephone,
          lm.mobile AS mailing_mobile,
          lm.primary_mobile AS mailing_primary_mobile,
          lm.fax AS mailing_fax,
          lm.email AS mailing_email,
          lm.email_cc AS mailing_email_cc,
          lm.website AS mailing_website,

          bk.id AS banking_id,
          bk.provide_bank_details,
          bk.account_holder_name,
          bk.bank_name,
          bk.account_number,
          bk.ifsc_code AS banking_ifsc,
          bk.swift_code AS banking_swift,
          bk.branch_name AS banking_branch,
          bk.acc_type AS banking_account_type,
          bk.upi_id AS banking_upi_id,
          bk.is_primary AS banking_is_primary,

          tx.id AS tax_id,
          tx.pan_number AS tax_pan_number,
          tx.gstin AS tax_gstin,
          tx.reg_type AS tax_registration_type,
          tx.assessee_other_territory AS tax_assessee_other_territory,
          tx.territory AS tax_territory,
          tx.tan_number AS tax_tan_number,
          tx.deductor_category AS tax_deductor_category,
          tx.collection_account_no AS tax_collection_account_no,
          tx.tax_type AS tax_tax_type,
          tx.deductee_type AS tax_deductee_type,
          tx.buyer_type AS tax_buyer_type,
          tx.tds_applicable AS tax_tds_applicable,
          tx.tcs_applicable AS tax_tcs_applicable,

          st.id AS statutory_id,
          st.msme_registered,
          st.udyam_number,
          st.einvoice_applicable,
          st.default_supply_type,
          st.eway_bill_applicable,
          st.default_transport_mode,
          st.default_distance_km AS statutory_default_distance,

          bw.id AS billwise_id,
          bw.bill_wise AS billwise_maintain_bill_wise,
          bw.credit_days AS billwise_default_credit_period,
          bw.check_credit_days AS billwise_check_credit_days

      FROM acc_ledgers l

      LEFT JOIN acc_group_master gm
          ON gm.id = l.master_group_id

      LEFT JOIN acc_ledger_groups lg
          ON lg.id = l.group_id

      LEFT JOIN acc_ledger_balances lb
          ON lb.ledger_id = l.id
          AND lb.finance_id = l.finance_id

      LEFT JOIN acc_ledger_mailing lm
          ON lm.ledger_id = l.id
          AND lm.finance_id = l.finance_id

      LEFT JOIN acc_ledger_banking bk
          ON bk.ledger_id = l.id
          AND bk.finance_id = l.finance_id

      LEFT JOIN acc_ledger_tax tx
          ON tx.ledger_id = l.id
          AND tx.finance_id = l.finance_id

      LEFT JOIN acc_ledger_statutory st
          ON st.ledger_id = l.id
          AND st.finance_id = l.finance_id

      LEFT JOIN acc_ledger_billwise bw
          ON bw.ledger_id = l.id
          AND bw.finance_id = l.finance_id

      WHERE
          l.finance_id = ?
          AND l.id = ?

      LIMIT 1;
  `;

  const [rows] = await db.execute(sql, [finance_id, ledgerId]);

  if (!rows.length) return null;

  const row = rows[0];

  // Group logic
  const group =
    row.master_group_id
      ? {
        source: "system",
        group_id: row.master_group_id,
        group_name: row.system_group_name,
        nature: row.system_group_nature
      }
      : row.group_id
        ? {
          source: "custom",
          group_id: row.group_id,
          group_name: row.custom_group_name,
          nature: row.custom_group_nature,
          affects_gross_profit: row.custom_affects_gross_profit,
          behaves_like_subledger: row.custom_behaves_like_subledger,
          nett_balance_report: row.custom_nett_balance_report,
          used_for_calculation: row.custom_used_for_calculation,
          allocation_method: row.custom_allocation_method
        }
        : null;

  return {
    ledger: {
      id: row.ledger_id,
      finance_id: row.finance_id,
      ledger_name: row.ledger_name,
      alias: row.alias,
      alias_regional: row.alias_regional,
      group_id: row.group_id,
      master_group_id: row.master_group_id,
      reporting_under: row.reporting_under,
      inactive: row.inactive,
      is_active: row.is_active,
      opening_balance: row.opening_balance,
      ob_type: row.ob_type,
      effective_date: row.effective_date,
      freeze_balance: row.freeze_balance,
      inv_values_affected: row.inv_values_affected,
      type_of_ledger: row.type_of_ledger,
      rounding_method: row.rounding_method,
      rounding_limit: row.rounding_limit,
      appropriation_method: row.appropriation_method,
      method_to_allocate: row.method_to_allocate,
      is_additional_cost: row.is_additional_cost,
      cost_centre_applicable: row.cost_centre_applicable,
      cost_centre_allocation: row.cost_centre_allocation,
      ledger_flushing_method: row.ledger_flushing_method,
      include_in_buyer_ledger: row.include_in_buyer_ledger,
      include_in_seller_ledger: row.include_in_seller_ledger,
      is_bank_account: row.is_bank_account,
      is_system: row.is_system,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    },

    group: group,

    balance: {
      opening_dr: row.balance_opening_dr,
      opening_cr: row.balance_opening_cr,
      period_dr: row.balance_period_dr,
      period_cr: row.balance_period_cr,
      closing_dr: row.balance_closing_dr,
      closing_cr: row.balance_closing_cr,
      financial_year: row.balance_financial_year
    },

    mailing: {
      mailing_name: row.mailing_name,
      address1: row.mailing_address1,
      address2: row.mailing_address2,
      address3: row.mailing_address3,
      address4: row.mailing_address4,
      city: row.mailing_city,
      district: row.mailing_district,
      state: row.mailing_state,
      country: row.mailing_country,
      pincode: row.mailing_pincode,
      show_mailing_details: row.show_mailing_details,
      provide_contact: row.provide_contact,
      contact_person: row.contact_person,
      telephone: row.mailing_telephone,
      mobile: row.mailing_mobile,
      primary_mobile: row.mailing_primary_mobile,
      fax: row.mailing_fax,
      email: row.mailing_email,
      email_cc: row.mailing_email_cc,
      website: row.mailing_website
    },

    banking: {
      id: row.banking_id,
      provide_bank_details: row.provide_bank_details,
      account_holder_name: row.account_holder_name,
      bank_name: row.bank_name,
      account_number: row.account_number,
      ifsc: row.banking_ifsc,
      swift: row.banking_swift,
      branch: row.banking_branch,
      account_type: row.banking_account_type,
      upi_id: row.banking_upi_id,
      is_primary: row.banking_is_primary
    },

    tax: {
      id: row.tax_id,
      pan_number: row.tax_pan_number,
      gstin: row.tax_gstin,
      registration_type: row.tax_registration_type,
      assessee_other_territory: row.tax_assessee_other_territory,
      territory: row.tax_territory,
      tan_number: row.tax_tan_number,
      deductor_category: row.tax_deductor_category,
      collection_account_no: row.tax_collection_account_no,
      tax_type: row.tax_tax_type,
      deductee_type: row.tax_deductee_type,
      buyer_type: row.tax_buyer_type,
      tds_applicable: row.tax_tds_applicable,
      tcs_applicable: row.tax_tcs_applicable
    },

    statutory: {
      id: row.statutory_id,
      msme_registered: row.msme_registered,
      udyam_number: row.udyam_number,
      einvoice_applicable: row.einvoice_applicable,
      default_supply_type: row.default_supply_type,
      eway_bill_applicable: row.eway_bill_applicable,
      default_transport_mode: row.default_transport_mode,
      default_distance: row.statutory_default_distance
    },

    billwise: {
      id: row.billwise_id,
      maintain_bill_wise: row.billwise_maintain_bill_wise,
      default_credit_period: row.billwise_default_credit_period,
      check_credit_days_during_entry: row.billwise_check_credit_days
    }
  };
};
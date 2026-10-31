const { db } = require('../../../config/database.config');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const FY_LABEL_REGEX = /^(\d{4})-(\d{4})$/;

function createBadParamError(message = 'Invalid id or date') {
  const err = new Error(message);
  err.code = '22P02';
  err.statusCode = 400;
  return err;
}

function createNotFoundError(message = 'Ledger not found') {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function isValidUUID(val) {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

function isValidISODate(dateStr) {
  if (typeof dateStr !== 'string' || !ISO_DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

/**
 * Returns Indian financial year formatted as YYYY-YYYY (e.g. 2026-2027)
 */
function getFinancialYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan ... 3 = Apr

  const startYear = month >= 3 ? year : year - 1; // Apr(3) or later → FY starts this year
  const endYear = startYear + 1;

  return `${startYear}-${endYear}`;
}

function fyLabelToDateRange(fyLabel) {
  const match = typeof fyLabel === 'string' ? fyLabel.trim().match(FY_LABEL_REGEX) : null;
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (endYear !== startYear + 1) return null;
  return {
    fyLabel: `${startYear}-${endYear}`,
    from: `${startYear}-04-01`,
    to: `${endYear}-03-31`,
  };
}

// ─── Helper: resolve the active fiscal year for a finance company from DB ──
async function resolveCurrentFinancialYear(client, finance_id) {
  const runner = client && typeof client.query === 'function' ? client : db;
  const res = await runner.query(
    `SELECT year_label,
            TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
            TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
            is_locked
       FROM acc_financial_years
      WHERE finance_id = $1 AND is_current = true
      LIMIT 1`,
    [finance_id]
  );

  const fy = res.rows[0];
  if (fy) {
    if (fy.is_locked) {
      throw new Error(`Financial year ${fy.year_label} is locked for this company`);
    }
    return fy.year_label;
  }

  return getFinancialYear(new Date());
}

/**
 * Resolves a period { from, to, fyLabel } from options or defaults to the active FY.
 * Validates YYYY-MM-DD dates and enforces from <= to.
 */
async function resolvePeriodRange(runner, finance_id, opts = {}) {
  const normalizedOpts =
    typeof opts === 'string' ? { financial_year: opts } : opts || {};
  const { from, to, financial_year } = normalizedOpts;

  if (from !== undefined || to !== undefined) {
    if (!from || !to || !isValidISODate(String(from)) || !isValidISODate(String(to))) {
      throw createBadParamError('Invalid id or date');
    }
    const fromStr = String(from);
    const toStr = String(to);
    if (fromStr > toStr) {
      const err = new Error('from date must be on or before to date');
      err.statusCode = 400;
      throw err;
    }
    const [y, m] = fromStr.split('-').map(Number);
    const fyStartYear = m >= 4 ? y : y - 1;
    return {
      from: fromStr,
      to: toStr,
      fyLabel: `${fyStartYear}-${fyStartYear + 1}`,
      fyStart: `${fyStartYear}-04-01`,
    };
  }

  if (financial_year) {
    const parsed = fyLabelToDateRange(String(financial_year));
    if (!parsed) {
      throw createBadParamError('Invalid id or date');
    }
    return {
      from: parsed.from,
      to: parsed.to,
      fyLabel: parsed.fyLabel,
      fyStart: parsed.from,
    };
  }

  const qRunner = runner && typeof runner.query === 'function' ? runner : db;
  const res = await qRunner.query(
    `SELECT year_label,
            TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
            TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date
       FROM acc_financial_years
      WHERE finance_id = $1 AND is_current = true
      LIMIT 1`,
    [finance_id]
  );

  const fy = res.rows[0];
  if (fy && fy.start_date && fy.end_date) {
    return {
      from: fy.start_date,
      to: fy.end_date,
      fyLabel: fy.year_label,
      fyStart: fy.start_date,
    };
  }

  const fallbackFy = getFinancialYear(new Date());
  const parsedFallback = fyLabelToDateRange(fallbackFy);
  return {
    from: parsedFallback.from,
    to: parsedFallback.to,
    fyLabel: parsedFallback.fyLabel,
    fyStart: parsedFallback.from,
  };
}

// ─── Helper: resolve "Under" selection into group_id / master_group_id ─────
async function resolveUnderGroupColumns(client, finance_id, { under_id, under_source, group_id, master_group_id }) {
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
    // Custom group → acc_ledger_groups, scoped to this finance
    const res = await client.query(
      `SELECT id, nature FROM acc_ledger_groups WHERE id = $1 AND finance_id = $2 AND is_active = true`,
      [id, finance_id]
    );
    const grp = res.rows[0];
    if (!grp) throw new Error(`Custom group id ${id} not found for this company`);
    return { group_id: grp.id, master_group_id: null, nature: grp.nature };
  }

  // system → acc_group_master (global)
  const res = await client.query(
    `SELECT id, nature FROM acc_group_master WHERE id = $1 AND is_active = true`,
    [id]
  );
  const grp = res.rows[0];
  if (!grp) throw new Error(`Master group id ${id} not found`);
  return { group_id: null, master_group_id: grp.id, nature: grp.nature };
}

// ─── Helper: persist Advanced Ledger satellite details ─────────────────────
async function saveLedgerAdvancedDetails(client, finance_id, ledgerId, d, created_by) {
  // ── 1. Mailing ─────────────────────────────────────────────
  if (
    d.mailingName !== undefined || d.addr1 !== undefined || d.addr2 !== undefined ||
    d.addr3 !== undefined || d.addr4 !== undefined || d.city !== undefined ||
    d.state !== undefined || d.pincode !== undefined || d.provideContactDetails !== undefined ||
    d.contactPerson !== undefined || d.mobile !== undefined || d.email !== undefined ||
    d.primaryMobile !== undefined || d.website !== undefined || d.district !== undefined
  ) {
    await client.query(
      `INSERT INTO acc_ledger_mailing
        (finance_id, ledger_id, mailing_name, addr_line1, addr_line2, addr_line3, addr_line4,
         city, district, state, country, pin_code, show_mailing_details,
         provide_contact, contact_person, telephone, mobile, primary_mobile, fax, email, email_cc, website, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       ON CONFLICT (ledger_id) DO UPDATE SET
         mailing_name = EXCLUDED.mailing_name,
         addr_line1 = EXCLUDED.addr_line1,
         addr_line2 = EXCLUDED.addr_line2,
         addr_line3 = EXCLUDED.addr_line3,
         addr_line4 = EXCLUDED.addr_line4,
         city = EXCLUDED.city,
         district = EXCLUDED.district,
         state = EXCLUDED.state,
         country = EXCLUDED.country,
         pin_code = EXCLUDED.pin_code,
         show_mailing_details = EXCLUDED.show_mailing_details,
         provide_contact = EXCLUDED.provide_contact,
         contact_person = EXCLUDED.contact_person,
         telephone = EXCLUDED.telephone,
         mobile = EXCLUDED.mobile,
         primary_mobile = EXCLUDED.primary_mobile,
         fax = EXCLUDED.fax,
         email = EXCLUDED.email,
         email_cc = EXCLUDED.email_cc,
         website = EXCLUDED.website,
         updated_at = CURRENT_TIMESTAMP`,
      [
        finance_id,
        ledgerId,
        d.mailingName || null,
        d.addr1 || null,
        d.addr2 || null,
        d.addr3 || null,
        d.addr4 || null,
        d.city || null,
        d.district || null,
        d.state || null,
        d.country || 'India',
        d.pincode || null,
        d.showMailingDetails === undefined ? true : Boolean(d.showMailingDetails),
        Boolean(d.provideContactDetails),
        d.contactPerson || null,
        d.telephone || null,
        d.mobile || null,
        d.primaryMobile || null,
        d.fax || null,
        d.email || null,
        d.emailCC || d.email_cc || null,
        d.website || null,
        created_by,
      ]
    );
  }

  // ── 2. Banking (Primary party bank account) ────────────────
  if (d.provideBankDetails || d.bankName || d.accountNumber || d.ifsc) {
    // Check if an existing primary bank row exists for this ledger
    const existingBank = await client.query(
      `SELECT id FROM acc_ledger_banking WHERE ledger_id = $1 AND is_primary = true FOR UPDATE`,
      [ledgerId]
    );

    let bankingId;
    const accType = ['Savings', 'Current', 'Cash Credit', 'Overdraft', 'Loan A/c'].includes(d.accountType)
      ? d.accountType
      : 'Current';

    if (existingBank.rows.length > 0) {
      bankingId = existingBank.rows[0].id;
      await client.query(
        `UPDATE acc_ledger_banking
            SET provide_bank_details = $1,
                account_holder_name = $2,
                bank_name = $3,
                account_number = $4,
                ifsc_code = $5,
                swift_code = $6,
                branch_name = $7,
                acc_type = $8,
                upi_id = $9,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $10`,
        [
          Boolean(d.provideBankDetails),
          d.accountHolderName || d.ledger_name || null,
          d.bankName || null,
          d.accountNumber || null,
          d.ifsc || null,
          d.swift || null,
          d.branch || null,
          accType,
          d.upiId || null,
          bankingId,
        ]
      );
    } else {
      const insBank = await client.query(
        `INSERT INTO acc_ledger_banking
          (finance_id, ledger_id, provide_bank_details, account_holder_name, bank_name, account_number,
           ifsc_code, swift_code, branch_name, acc_type, upi_id, is_primary, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)
         RETURNING id`,
        [
          finance_id,
          ledgerId,
          Boolean(d.provideBankDetails),
          d.accountHolderName || d.ledger_name || null,
          d.bankName || null,
          d.accountNumber || null,
          d.ifsc || null,
          d.swift || null,
          d.branch || null,
          accType,
          d.upiId || null,
          created_by,
        ]
      );
      bankingId = insBank.rows[0].id;
    }

    // If transaction types provided in d.bankTransactionTypes
    if (Array.isArray(d.bankTransactionTypes) && d.bankTransactionTypes.length > 0) {
      await client.query(
        `DELETE FROM acc_ledger_banking_txn_types WHERE ledger_banking_id = $1`,
        [bankingId]
      );
      for (const txnType of d.bankTransactionTypes) {
        const insTxn = await client.query(
          `INSERT INTO acc_ledger_banking_txn_types (finance_id, ledger_banking_id, txn_type)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [finance_id, bankingId, txnType]
        );
        const txnTypeId = insTxn.rows[0].id;

        // Sub-dialog config for this txn type if present
        if (d.txnConfigs && d.txnConfigs[txnType]) {
          const cfg = d.txnConfigs[txnType];
          await client.query(
            `INSERT INTO acc_ledger_txn_type_config
              (finance_id, txn_type_id, txn_type, atm_id, card_type, card_number,
               cheque_no, mandate_no, ref_no, eft_account_number, eft_ifsc,
               bank_name, branch, narration, description, reference, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
              finance_id, txnTypeId, txnType,
              cfg.atmId || null, cfg.cardType || null, cfg.cardNumber || null,
              cfg.chequeNo || null, cfg.mandateNo || null, cfg.refNo || null,
              cfg.accountNo || null, cfg.ifsc || null,
              cfg.bankName || null, cfg.branch || null, cfg.narration || null,
              cfg.description || null, cfg.reference || null, cfg.remarks || null,
            ]
          );
        }
      }
    }
  }

  // ── 3. Tax (GST / PAN / TDS / TCS) ─────────────────────────
  if (d.panIt || d.gstin || d.registrationType || d.taxType || d.tanNumber) {
    const regType = [
      'Regular', 'Composition', 'Unregistered', 'Consumer', 'SEZ Unit', 'SEZ Developer',
      'Deemed Export', 'Tax Deductor', 'Tax Collector (E-Commerce)', 'Input Service Distributor',
      'Overseas', 'UIN Holder'
    ].includes(d.registrationType) ? d.registrationType : 'Unregistered';

    const taxType = ['None', 'TDS', 'TCS'].includes(d.taxType) ? d.taxType : 'None';
    const tdsApplicable = taxType === 'TDS' || Boolean(d.tdsApplicable);
    const tcsApplicable = taxType === 'TCS' || Boolean(d.tcsApplicable);

    await client.query(
      `INSERT INTO acc_ledger_tax
        (finance_id, ledger_id, pan_number, gstin, reg_type, assessee_other_territory, territory,
         tan_number, deductor_category, collection_account_no, tax_type, deductee_type, buyer_type,
         tds_applicable, tcs_applicable, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (ledger_id) DO UPDATE SET
         pan_number = EXCLUDED.pan_number,
         gstin = EXCLUDED.gstin,
         reg_type = EXCLUDED.reg_type,
         assessee_other_territory = EXCLUDED.assessee_other_territory,
         territory = EXCLUDED.territory,
         tan_number = EXCLUDED.tan_number,
         deductor_category = EXCLUDED.deductor_category,
         collection_account_no = EXCLUDED.collection_account_no,
         tax_type = EXCLUDED.tax_type,
         deductee_type = EXCLUDED.deductee_type,
         buyer_type = EXCLUDED.buyer_type,
         tds_applicable = EXCLUDED.tds_applicable,
         tcs_applicable = EXCLUDED.tcs_applicable,
         updated_at = CURRENT_TIMESTAMP`,
      [
        finance_id,
        ledgerId,
        d.panIt || null,
        d.gstin || null,
        regType,
        Boolean(d.assesseeOtherTerritory),
        d.territory || null,
        d.tanNumber || null,
        d.deductorCategory || null,
        d.collectionAccountNo || null,
        taxType,
        d.deducteeType || null,
        d.buyerType || null,
        tdsApplicable,
        tcsApplicable,
        created_by,
      ]
    );
  }

  // ── 4. Statutory (MSME / e-Invoice / e-Way Bill) ─────────────
  if (d.msmeRegistered || d.einvoiceApplicable || d.ewayBillApplicable || d.udyamNumber) {
    const supplyType = ['B2B', 'SEZ', 'Export', 'Deemed Export'].includes(d.defaultSupplyType)
      ? d.defaultSupplyType
      : 'B2B';
    const transportMode = ['Road', 'Rail', 'Air', 'Ship'].includes(d.defaultTransportMode)
      ? d.defaultTransportMode
      : 'Road';

    await client.query(
      `INSERT INTO acc_ledger_statutory
        (finance_id, ledger_id, msme_registered, udyam_number, einvoice_applicable, default_supply_type,
         eway_bill_applicable, default_transport_mode, default_distance_km, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (ledger_id) DO UPDATE SET
         msme_registered = EXCLUDED.msme_registered,
         udyam_number = EXCLUDED.udyam_number,
         einvoice_applicable = EXCLUDED.einvoice_applicable,
         default_supply_type = EXCLUDED.default_supply_type,
         eway_bill_applicable = EXCLUDED.eway_bill_applicable,
         default_transport_mode = EXCLUDED.default_transport_mode,
         default_distance_km = EXCLUDED.default_distance_km,
         updated_at = CURRENT_TIMESTAMP`,
      [
        finance_id,
        ledgerId,
        Boolean(d.msmeRegistered),
        d.udyamNumber || null,
        Boolean(d.einvoiceApplicable),
        supplyType,
        Boolean(d.ewayBillApplicable),
        transportMode,
        d.defaultDistance ? parseFloat(d.defaultDistance) : null,
        created_by,
      ]
    );
  }

  // ── 5. Bill-wise / Credit period / Credit limits ──────────────
  if (d.maintainBillWise !== undefined || d.defaultCreditPeriod !== undefined || d.creditLimit !== undefined) {
    const creditDays = (d.defaultCreditPeriod !== undefined && d.defaultCreditPeriod !== '' && !isNaN(Number(d.defaultCreditPeriod)))
      ? Math.max(0, parseInt(d.defaultCreditPeriod, 10))
      : 30;

    const creditLimit = (d.creditLimit !== undefined && d.creditLimit !== '' && !isNaN(Number(d.creditLimit)))
      ? parseFloat(d.creditLimit)
      : null;

    await client.query(
      `INSERT INTO acc_ledger_billwise
        (finance_id, ledger_id, bill_wise, credit_limit, credit_days, check_credit_limit, separate_discount, check_credit_days, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (ledger_id) DO UPDATE SET
         bill_wise = EXCLUDED.bill_wise,
         credit_limit = EXCLUDED.credit_limit,
         credit_days = EXCLUDED.credit_days,
         check_credit_limit = EXCLUDED.check_credit_limit,
         separate_discount = EXCLUDED.separate_discount,
         check_credit_days = EXCLUDED.check_credit_days,
         updated_at = CURRENT_TIMESTAMP`,
      [
        finance_id,
        ledgerId,
        Boolean(d.maintainBillWise),
        creditLimit,
        creditDays,
        Boolean(d.checkCreditLimit),
        Boolean(d.separateDiscount),
        Boolean(d.checkCreditDaysDuringEntry || d.check_credit_days),
        created_by,
      ]
    );
  }

  // ── 6. Tax Config (GST rate / HSN / Taxability details) ───────
  if (d.isGstApplicable || d.gstHsnSacCode || d.gstIgstRate || d.gstDescription) {
    const gstApplicable = ['Applicable', 'Not Applicable', 'Undefined'].includes(d.isGstApplicable)
      ? d.isGstApplicable
      : 'Undefined';
    const hsnMode = ['As per Company', 'As per Stock Group', 'Specify Details Here'].includes(d.hsnSacDetailsMode)
      ? d.hsnSacDetailsMode
      : 'As per Company';
    const sourceMode = ['As per Company', 'As per Stock Group', 'As per Stock Item', 'Specify Details Here'].includes(d.hsnSacSourceMode)
      ? d.hsnSacSourceMode
      : 'As per Company';
    const supplyType = ['Goods', 'Services'].includes(d.gstTypeOfSupply) ? d.gstTypeOfSupply : null;
    const taxability = ['Taxable', 'Exempt', 'Nil Rated'].includes(d.gstTaxability) ? d.gstTaxability : null;
    const cessType = ['Valorem', 'Quantum'].includes(d.gstCessType) ? d.gstCessType : 'Valorem';
    const gstStatus = ['Active', 'Cancelled', 'Suspended'].includes(d.gstStatus) ? d.gstStatus : 'Active';

    await client.query(
      `INSERT INTO acc_ledger_tax_config
        (finance_id, ledger_id, gst_applicable, set_alter_gst_details, gst_description, applicable_from,
         hsn_sac_code, hsn_sac_details, source_of_details, hsn_description, type_of_supply, taxability,
         igst_rate, cgst_rate, sgst_rate, cess_rate, cess_type, cess_per_unit, cess_unit,
         reverse_charge, include_in_assessable, gst_status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       ON CONFLICT (ledger_id) DO UPDATE SET
         gst_applicable = EXCLUDED.gst_applicable,
         set_alter_gst_details = EXCLUDED.set_alter_gst_details,
         gst_description = EXCLUDED.gst_description,
         applicable_from = EXCLUDED.applicable_from,
         hsn_sac_code = EXCLUDED.hsn_sac_code,
         hsn_sac_details = EXCLUDED.hsn_sac_details,
         source_of_details = EXCLUDED.source_of_details,
         hsn_description = EXCLUDED.hsn_description,
         type_of_supply = EXCLUDED.type_of_supply,
         taxability = EXCLUDED.taxability,
         igst_rate = EXCLUDED.igst_rate,
         cgst_rate = EXCLUDED.cgst_rate,
         sgst_rate = EXCLUDED.sgst_rate,
         cess_rate = EXCLUDED.cess_rate,
         cess_type = EXCLUDED.cess_type,
         cess_per_unit = EXCLUDED.cess_per_unit,
         cess_unit = EXCLUDED.cess_unit,
         reverse_charge = EXCLUDED.reverse_charge,
         include_in_assessable = EXCLUDED.include_in_assessable,
         gst_status = EXCLUDED.gst_status,
         updated_at = CURRENT_TIMESTAMP`,
      [
        finance_id,
        ledgerId,
        gstApplicable,
        Boolean(d.setAlterGst),
        d.gstDescription || null,
        d.gstApplicableFrom || null,
        d.gstHsnSacCode || d.hsnCode || null,
        hsnMode,
        sourceMode,
        d.hsnDescription || null,
        supplyType,
        taxability,
        d.gstIgstRate ? parseFloat(d.gstIgstRate) : 0.00,
        d.gstCgstRate ? parseFloat(d.gstCgstRate) : 0.00,
        d.gstSgstRate ? parseFloat(d.gstSgstRate) : 0.00,
        d.gstCessRate ? parseFloat(d.gstCessRate) : 0.00,
        cessType,
        d.cessPerUnit ? parseFloat(d.cessPerUnit) : null,
        d.cessUnit || null,
        Boolean(d.gstReverseCharge),
        Boolean(d.includeInAssessable),
        gstStatus,
        created_by,
      ]
    );
  }

  // ── 7. Bank Config (Reconciliation / Cheque Books) ────────────
  if (d.effectiveDateForReconciliation || d.setAlterChequeBooks || d.enableChequePrinting || d.chequePrintBank) {
    await client.query(
      `INSERT INTO acc_ledger_bank_config
        (finance_id, ledger_id, recon_effective_date, set_alter_cheque_books, enable_cheque_printing, cheque_print_bank_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (ledger_id) DO UPDATE SET
         recon_effective_date = EXCLUDED.recon_effective_date,
         set_alter_cheque_books = EXCLUDED.set_alter_cheque_books,
         enable_cheque_printing = EXCLUDED.enable_cheque_printing,
         cheque_print_bank_name = EXCLUDED.cheque_print_bank_name,
         updated_at = CURRENT_TIMESTAMP`,
      [
        finance_id,
        ledgerId,
        d.effectiveDateForReconciliation || null,
        Boolean(d.setAlterChequeBooks),
        Boolean(d.enableChequePrinting),
        d.chequePrintBank || null,
        created_by,
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
    inactive = false,
    opening_balance = 0,
    ob_type = 'Dr',
    effective_date = null,
    freeze_balance = false,
    inv_values_affected = false,
    type_of_ledger = 'Not Applicable',
    rounding_method = 'Not Applicable',
    rounding_limit = null,
    appropriation_method = 'Not Applicable',
    method_to_allocate = false,
    is_additional_cost = false,
    cost_centre_applicable = false,
    cost_centre_allocation = false,
    ledger_flushing_method = 'Default',
    include_in_buyer_ledger = false,
    include_in_seller_ledger = false,
    is_bank_account = false,
    created_by = null,
  } = data;

  if (!finance_id || !ledger_name?.trim()) {
    throw new Error('finance_id and ledger_name are required');
  }

  const client = await db.getConnection();
  try {
    await client.query('BEGIN');

    // Duplicate name check in the same finance company
    const dupCheck = await client.query(
      `SELECT id FROM acc_ledgers WHERE finance_id = $1 AND LOWER(ledger_name) = LOWER($2) LIMIT 1`,
      [finance_id, ledger_name.trim()]
    );
    if (dupCheck.rows.length > 0) {
      const err = new Error(`Ledger "${ledger_name.trim()}" already exists in this company`);
      err.code = '23505';
      throw err;
    }

    // Conditional mapping: exactly one of group_id / master_group_id
    const { group_id, master_group_id } = await resolveUnderGroupColumns(client, finance_id, data);

    const safeObType = ob_type === 'Cr' ? 'Cr' : 'Dr';
    const numOpeningBalance = parseFloat(opening_balance) || 0;

    const insLedger = await client.query(
      `INSERT INTO acc_ledgers
        (finance_id, ledger_name, alias, alias_regional, group_id, master_group_id, reporting_under, inactive,
         opening_balance, ob_type, effective_date, freeze_balance,
         inv_values_affected, type_of_ledger, rounding_method, rounding_limit,
         appropriation_method, method_to_allocate, is_additional_cost,
         cost_centre_applicable, cost_centre_allocation,
         ledger_flushing_method, include_in_buyer_ledger, include_in_seller_ledger,
         is_bank_account, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
       RETURNING id`,
      [
        finance_id,
        ledger_name.trim(),
        alias || null,
        alias_regional || null,
        group_id,
        master_group_id,
        reporting_under || null,
        Boolean(inactive),
        numOpeningBalance,
        safeObType,
        effective_date || null,
        Boolean(freeze_balance),
        Boolean(inv_values_affected),
        type_of_ledger,
        rounding_method,
        rounding_limit ? parseFloat(rounding_limit) : null,
        appropriation_method,
        Boolean(method_to_allocate),
        Boolean(is_additional_cost),
        Boolean(cost_centre_applicable),
        Boolean(cost_centre_allocation),
        ledger_flushing_method,
        Boolean(include_in_buyer_ledger),
        Boolean(include_in_seller_ledger),
        Boolean(is_bank_account),
        true, // is_active
        created_by,
      ]
    );

    const ledgerId = insLedger.rows[0].id;

    // Create opening balance entry in acc_ledger_balances
    const fy = await resolveCurrentFinancialYear(client, finance_id);
    const ob_dr = safeObType === 'Dr' ? numOpeningBalance : 0.00;
    const ob_cr = safeObType === 'Cr' ? numOpeningBalance : 0.00;

    await client.query(
      `INSERT INTO acc_ledger_balances (finance_id, ledger_id, financial_year, opening_dr, opening_cr)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (finance_id, ledger_id, financial_year)
       DO UPDATE SET
         opening_dr = EXCLUDED.opening_dr,
         opening_cr = EXCLUDED.opening_cr,
         last_updated_at = CURRENT_TIMESTAMP`,
      [finance_id, ledgerId, fy, ob_dr, ob_cr]
    );

    // Persist Advanced Ledger details
    await saveLedgerAdvancedDetails(client, finance_id, ledgerId, data, created_by);

    await client.query('COMMIT');
    return ledgerId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── 2. Multi create ledgers (Atomic Batch) ──────────────────────────────────
exports.multiCreateLedger = async (finance_id, ledgers) => {
  const client = await db.getConnection();
  try {
    await client.query('BEGIN');
    const ids = [];
    const fy = await resolveCurrentFinancialYear(client, finance_id);

    for (let i = 0; i < ledgers.length; i++) {
      const l = ledgers[i];
      if (!l.ledger_name?.trim()) {
        throw new Error(`Row ${i + 1}: Ledger name is required`);
      }

      // Check duplicate
      const dupCheck = await client.query(
        `SELECT id FROM acc_ledgers WHERE finance_id = $1 AND LOWER(ledger_name) = LOWER($2) LIMIT 1`,
        [finance_id, l.ledger_name.trim()]
      );
      if (dupCheck.rows.length > 0) {
        const err = new Error(`Row ${i + 1}: Ledger "${l.ledger_name.trim()}" already exists`);
        err.code = '23505';
        throw err;
      }

      const { group_id, master_group_id } = await resolveUnderGroupColumns(client, finance_id, l);
      const opening_balance = parseFloat(l.opening_balance) || 0;
      const ob_type = l.ob_type === 'Cr' ? 'Cr' : 'Dr';

      const insLedger = await client.query(
        `INSERT INTO acc_ledgers
          (finance_id, ledger_name, alias, alias_regional, group_id, master_group_id, reporting_under, inactive,
           opening_balance, ob_type, effective_date, freeze_balance, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13)
         RETURNING id`,
        [
          finance_id,
          l.ledger_name.trim(),
          l.alias || null,
          l.alias_regional || null,
          group_id,
          master_group_id,
          l.reporting_under || null,
          Boolean(l.inactive),
          opening_balance,
          ob_type,
          l.effective_date || null,
          Boolean(l.freeze_balance),
          l.created_by || null,
        ]
      );

      const ledgerId = insLedger.rows[0].id;
      ids.push(ledgerId);

      const ob_dr = ob_type === 'Dr' ? opening_balance : 0.00;
      const ob_cr = ob_type === 'Cr' ? opening_balance : 0.00;
      await client.query(
        `INSERT INTO acc_ledger_balances (finance_id, ledger_id, financial_year, opening_dr, opening_cr)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (finance_id, ledger_id, financial_year)
         DO UPDATE SET
           opening_dr = EXCLUDED.opening_dr,
           opening_cr = EXCLUDED.opening_cr,
           last_updated_at = CURRENT_TIMESTAMP`,
        [finance_id, ledgerId, fy, ob_dr, ob_cr]
      );

      // Persist satellites (including credit limit if provided in multi-ledger row)
      await saveLedgerAdvancedDetails(client, finance_id, ledgerId, l, l.created_by || null);
    }

    await client.query('COMMIT');
    return ids;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── 3. Update single ledger ────────────────────────────────────────────────
exports.updateLedger = async (id, finance_id, data) => {
  const client = await db.getConnection();
  try {
    await client.query('BEGIN');

    // Verify ledger exists and belongs to this finance company
    const existCheck = await client.query(
      `SELECT id, is_system, group_id, master_group_id, opening_balance, ob_type
         FROM acc_ledgers
        WHERE id = $1 AND finance_id = $2
        FOR UPDATE`,
      [id, finance_id]
    );

    const existing = existCheck.rows[0];
    if (!existing) {
      throw new Error('Ledger not found for this company');
    }
    if (existing.is_system) {
      throw new Error('System ledgers cannot be modified');
    }

    // Name uniqueness check if ledger_name is changing
    if (data.ledger_name && data.ledger_name.trim()) {
      const dupCheck = await client.query(
        `SELECT id FROM acc_ledgers
          WHERE finance_id = $1 AND LOWER(ledger_name) = LOWER($2) AND id != $3
          LIMIT 1`,
        [finance_id, data.ledger_name.trim(), id]
      );
      if (dupCheck.rows.length > 0) {
        const err = new Error(`Ledger "${data.ledger_name.trim()}" already exists in this company`);
        err.code = '23505';
        throw err;
      }
    }

    const fields = [
      'ledger_name', 'alias', 'alias_regional', 'reporting_under', 'inactive',
      'opening_balance', 'ob_type', 'effective_date', 'freeze_balance',
      'inv_values_affected', 'type_of_ledger', 'rounding_method', 'rounding_limit',
      'appropriation_method', 'method_to_allocate', 'is_additional_cost',
      'cost_centre_applicable', 'cost_centre_allocation',
      'ledger_flushing_method', 'include_in_buyer_ledger', 'include_in_seller_ledger',
      'is_bank_account', 'is_active',
    ];

    const updates = [];
    const values = [];
    let paramIdx = 1;

    fields.forEach((f) => {
      if (data[f] !== undefined) {
        updates.push(`${f} = $${paramIdx++}`);
        let val = data[f];
        // Normalize boolean fields
        if ([
          'inactive', 'freeze_balance', 'inv_values_affected', 'method_to_allocate',
          'is_additional_cost', 'cost_centre_applicable', 'cost_centre_allocation',
          'include_in_buyer_ledger', 'include_in_seller_ledger', 'is_bank_account', 'is_active'
        ].includes(f)) {
          val = Boolean(val);
        } else if (f === 'opening_balance') {
          val = parseFloat(val) || 0;
        } else if (f === 'rounding_limit') {
          val = val ? parseFloat(val) : null;
        }
        values.push(val);
      }
    });

    // Under selection update if provided
    if (data.under_id !== undefined || data.group_id !== undefined || data.master_group_id !== undefined) {
      const { group_id, master_group_id } = await resolveUnderGroupColumns(client, finance_id, data);
      updates.push(`group_id = $${paramIdx++}`, `master_group_id = $${paramIdx++}`);
      values.push(group_id, master_group_id);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, finance_id);
      await client.query(
        `UPDATE acc_ledgers
            SET ${updates.join(', ')}
          WHERE id = $${paramIdx++} AND finance_id = $${paramIdx++}`,
        values
      );
    }

    // Re-sync opening balance in acc_ledger_balances if opening balance or ob_type supplied
    if (data.opening_balance !== undefined || data.ob_type !== undefined) {
      const newOb = data.opening_balance !== undefined ? (parseFloat(data.opening_balance) || 0) : existing.opening_balance;
      const newType = data.ob_type !== undefined ? (data.ob_type === 'Cr' ? 'Cr' : 'Dr') : existing.ob_type;
      const fy = await resolveCurrentFinancialYear(client, finance_id);
      const ob_dr = newType === 'Dr' ? newOb : 0.00;
      const ob_cr = newType === 'Cr' ? newOb : 0.00;

      await client.query(
        `INSERT INTO acc_ledger_balances (finance_id, ledger_id, financial_year, opening_dr, opening_cr)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (finance_id, ledger_id, financial_year)
         DO UPDATE SET
           opening_dr = EXCLUDED.opening_dr,
           opening_cr = EXCLUDED.opening_cr,
           last_updated_at = CURRENT_TIMESTAMP`,
        [finance_id, id, fy, ob_dr, ob_cr]
      );
    }

    // Persist Advanced details
    await saveLedgerAdvancedDetails(client, finance_id, id, data, data.updated_by || data.created_by || null);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── 4. Delete ledger ───────────────────────────────────────────────────────
exports.deleteLedger = async (id, finance_id) => {
  const client = await db.getConnection();
  try {
    await client.query('BEGIN');

    const ledgerCheck = await client.query(
      `SELECT is_system FROM acc_ledgers WHERE id = $1 AND finance_id = $2 FOR UPDATE`,
      [id, finance_id]
    );
    const ledger = ledgerCheck.rows[0];
    if (!ledger) throw new Error('Ledger not found');
    if (ledger.is_system) throw new Error('System ledgers cannot be deleted');

    // Check for posted vouchers
    const entriesCheck = await client.query(
      `SELECT COUNT(*) AS cnt FROM acc_voucher_entries WHERE ledger_id = $1 AND finance_id = $2`,
      [id, finance_id]
    );
    const cnt = parseInt(entriesCheck.rows[0]?.cnt, 10) || 0;
    if (cnt > 0) {
      throw new Error('Cannot delete ledger with posted entries. Consider deactivating instead.');
    }

    await client.query(`DELETE FROM acc_ledger_balances WHERE ledger_id = $1 AND finance_id = $2`, [id, finance_id]);
    await client.query(`DELETE FROM acc_ledgers WHERE id = $1 AND finance_id = $2`, [id, finance_id]);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── 5. List ledgers with group + period balances ───────────────────────────
exports.listLedgers = async (finance_id, periodOpts = {}) => {
  const { from, to } = await resolvePeriodRange(db, finance_id, periodOpts);

  const res = await db.query(
    `WITH v_agg AS (
       SELECT
         e.ledger_id,
         COALESCE(SUM(CASE WHEN v.voucher_date < $2::date AND e.entry_type = 'Dr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS prior_dr,
         COALESCE(SUM(CASE WHEN v.voucher_date < $2::date AND e.entry_type = 'Cr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS prior_cr,
         COALESCE(SUM(CASE WHEN v.voucher_date BETWEEN $2::date AND $3::date AND e.entry_type = 'Dr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS period_dr,
         COALESCE(SUM(CASE WHEN v.voucher_date BETWEEN $2::date AND $3::date AND e.entry_type = 'Cr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS period_cr
       FROM acc_voucher_entries e
       JOIN acc_vouchers v
         ON v.id = e.voucher_id
        AND v.finance_id = e.finance_id
       WHERE e.finance_id = $1
         AND v.status = 'Posted'
         AND v.voucher_date <= $3::date
       GROUP BY e.ledger_id
     )
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

       COALESCE(g.group_name, gm.group_name) AS group_name,
       g.alias AS group_alias,
       COALESCE(g.nature, gm.nature) AS nature,
       g.custom_parent_id,
       CASE WHEN l.master_group_id IS NOT NULL THEN 'system' ELSE 'custom' END AS group_source,

       ROUND(
         (CASE WHEN l.ob_type = 'Cr' THEN -COALESCE(l.opening_balance, 0) ELSE COALESCE(l.opening_balance, 0) END)::numeric(18,2)
         + COALESCE(va.prior_dr, 0) - COALESCE(va.prior_cr, 0),
         2
       ) AS opening_signed,
       ROUND(COALESCE(va.period_dr, 0)::numeric(18,2), 2) AS period_dr_calc,
       ROUND(COALESCE(va.period_cr, 0)::numeric(18,2), 2) AS period_cr_calc

     FROM acc_ledgers l
     LEFT JOIN acc_ledger_groups g
            ON g.id = l.group_id
           AND g.finance_id = l.finance_id
     LEFT JOIN acc_group_master gm
            ON gm.id = l.master_group_id
     LEFT JOIN v_agg va
            ON va.ledger_id = l.id
     WHERE l.finance_id = $1
       AND NOT l.inactive
       AND l.is_active = true
     ORDER BY
       COALESCE(g.group_name, gm.group_name),
       l.ledger_name`,
    [finance_id, from, to]
  );

  return res.rows.map((row) => {
    const openingPaise = Math.round(Number(row.opening_signed || 0) * 100);
    const periodDrPaise = Math.round(Number(row.period_dr_calc || 0) * 100);
    const periodCrPaise = Math.round(Number(row.period_cr_calc || 0) * 100);
    const closingPaise = openingPaise + periodDrPaise - periodCrPaise;

    const openingAbs = Number((Math.abs(openingPaise) / 100).toFixed(2));
    const openingSide = openingPaise >= 0 ? 'Dr' : 'Cr';
    const periodDr = Number((periodDrPaise / 100).toFixed(2));
    const periodCr = Number((periodCrPaise / 100).toFixed(2));
    const closingAbs = Number((Math.abs(closingPaise) / 100).toFixed(2));
    const closingSide = closingPaise >= 0 ? 'Dr' : 'Cr';

    return {
      id: row.id,
      finance_id: row.finance_id,
      ledger_name: row.ledger_name,
      alias: row.alias,
      alias_regional: row.alias_regional,
      group_id: row.group_id,
      master_group_id: row.master_group_id,
      reporting_under: row.reporting_under,
      opening_balance: Number(parseFloat(row.opening_balance || 0).toFixed(2)),
      ob_type: row.ob_type || 'Dr',
      effective_date: row.effective_date,
      freeze_balance: row.freeze_balance,
      inactive: row.inactive,
      is_active: row.is_active,
      group_name: row.group_name,
      group_alias: row.group_alias,
      nature: row.nature,
      custom_parent_id: row.custom_parent_id,
      group_source: row.group_source,

      opening: openingAbs,
      opening_net: Number((openingPaise / 100).toFixed(2)),
      opening_side: openingSide,
      opening_dr: openingPaise > 0 ? openingAbs : 0,
      opening_cr: openingPaise < 0 ? openingAbs : 0,
      period_dr: periodDr,
      period_cr: periodCr,
      closing: closingAbs,
      closing_net: Number((closingPaise / 100).toFixed(2)),
      closing_side: closingSide,
      closing_dr: closingPaise > 0 ? closingAbs : 0,
      closing_cr: closingPaise < 0 ? closingAbs : 0,
    };
  });
};

// ─── 6. List ledger groups (flat summary) ───────────────────────────────────
exports.listLedgerGroups = async (finance_id) => {
  const res = await db.query(
    `SELECT id, group_name, alias, nature, is_active
       FROM acc_ledger_groups
      WHERE finance_id = $1 AND is_active = true
      ORDER BY group_name`,
    [finance_id]
  );
  return res.rows;
};

// ─── 7. Get group with ledgers ──────────────────────────────────────────────
exports.getGroupWithLedgers = async (group_id, finance_id) => {
  const groupRes = await db.query(
    `SELECT * FROM acc_ledger_groups WHERE id = $1 AND finance_id = $2`,
    [group_id, finance_id]
  );
  const group = groupRes.rows[0];
  if (!group) throw new Error('Group not found');

  // Fetch all sub-group ids (recursive BFS)
  const allGroupIds = [group_id];
  const queue = [group_id];
  while (queue.length) {
    const parentId = queue.shift();
    const childrenRes = await db.query(
      `SELECT id FROM acc_ledger_groups WHERE custom_parent_id = $1 AND finance_id = $2`,
      [parentId, finance_id]
    );
    childrenRes.rows.forEach(c => { allGroupIds.push(c.id); queue.push(c.id); });
  }

  const ledgersRes = await db.query(
    `SELECT l.id, l.ledger_name, l.opening_balance, l.ob_type, l.is_active, l.group_id, l.master_group_id
     FROM acc_ledgers l
     WHERE l.group_id = ANY($1::uuid[]) AND l.finance_id = $2 AND l.is_active = true
     ORDER BY l.ledger_name`,
    [allGroupIds, finance_id]
  );

  return { group, ledgers: ledgersRes.rows };
};

// ─── 8. Create ledger group ─────────────────────────────────────────────────
exports.createLedgerGroup = async (data) => {
  const {
    finance_id,
    group_name,
    parent_group_id = null,
    nature,
    created_by = null,
  } = data;

  if (!finance_id || !group_name?.trim() || !nature) {
    throw new Error('finance_id, group_name, and nature are required');
  }

  const dupCheck = await db.query(
    `SELECT id FROM acc_ledger_groups WHERE finance_id = $1 AND LOWER(group_name) = LOWER($2) LIMIT 1`,
    [finance_id, group_name.trim()]
  );
  if (dupCheck.rows.length > 0) throw new Error(`Group "${group_name}" already exists`);

  const res = await db.query(
    `INSERT INTO acc_ledger_groups
      (finance_id, group_name, custom_parent_id, nature, is_active, created_by)
     VALUES ($1, $2, $3, $4, true, $5)
     RETURNING id`,
    [finance_id, group_name.trim(), parent_group_id, nature, created_by]
  );
  return res.rows[0].id;
};

// ─── 9. Ledger balance summary (set-based for active period) ────────────────
exports.getLedgerSummary = async (finance_id, periodOpts = {}) => {
  const { from, to } = await resolvePeriodRange(db, finance_id, periodOpts);

  const res = await db.query(
    `WITH v_agg AS (
       SELECT
         e.ledger_id,
         COALESCE(SUM(CASE WHEN v.voucher_date < $2::date AND e.entry_type = 'Dr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS prior_dr,
         COALESCE(SUM(CASE WHEN v.voucher_date < $2::date AND e.entry_type = 'Cr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS prior_cr,
         COALESCE(SUM(CASE WHEN v.voucher_date BETWEEN $2::date AND $3::date AND e.entry_type = 'Dr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS period_dr,
         COALESCE(SUM(CASE WHEN v.voucher_date BETWEEN $2::date AND $3::date AND e.entry_type = 'Cr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS period_cr
       FROM acc_voucher_entries e
       JOIN acc_vouchers v
         ON v.id = e.voucher_id
        AND v.finance_id = e.finance_id
       WHERE e.finance_id = $1
         AND v.status = 'Posted'
         AND v.voucher_date <= $3::date
       GROUP BY e.ledger_id
     ),
     ledger_calc AS (
       SELECT
         l.id,
         (CASE WHEN l.ob_type = 'Cr' THEN -COALESCE(l.opening_balance, 0) ELSE COALESCE(l.opening_balance, 0) END)::numeric(18,2)
           + COALESCE(va.prior_dr, 0) - COALESCE(va.prior_cr, 0) AS opening_signed,
         COALESCE(va.period_dr, 0)::numeric(18,2) AS period_dr,
         COALESCE(va.period_cr, 0)::numeric(18,2) AS period_cr,
         (CASE WHEN l.ob_type = 'Cr' THEN -COALESCE(l.opening_balance, 0) ELSE COALESCE(l.opening_balance, 0) END)::numeric(18,2)
           + COALESCE(va.prior_dr, 0) - COALESCE(va.prior_cr, 0)
           + COALESCE(va.period_dr, 0) - COALESCE(va.period_cr, 0) AS closing_signed
       FROM acc_ledgers l
       LEFT JOIN v_agg va ON va.ledger_id = l.id
       WHERE l.finance_id = $1
         AND l.is_active = true
         AND NOT l.inactive
     )
     SELECT
       ROUND(COALESCE(SUM(CASE WHEN closing_signed > 0 THEN closing_signed ELSE 0 END), 0)::numeric(18,2), 2) AS total_dr_closing,
       ROUND(COALESCE(SUM(CASE WHEN closing_signed < 0 THEN ABS(closing_signed) ELSE 0 END), 0)::numeric(18,2), 2) AS total_cr_closing,
       ROUND(COALESCE(SUM(opening_signed), 0)::numeric(18,2), 2) AS opening_net,
       ROUND(COALESCE(SUM(period_dr), 0)::numeric(18,2), 2) AS period_dr,
       ROUND(COALESCE(SUM(period_cr), 0)::numeric(18,2), 2) AS period_cr
     FROM ledger_calc`,
    [finance_id, from, to]
  );

  const row = res.rows[0] || {};
  const totalDrPaise = Math.round(Number(row.total_dr_closing || 0) * 100);
  const totalCrPaise = Math.round(Number(row.total_cr_closing || 0) * 100);
  const diffPaise = totalDrPaise - totalCrPaise;
  const openingNetPaise = Math.round(Number(row.opening_net || 0) * 100);
  const periodDrPaise = Math.round(Number(row.period_dr || 0) * 100);
  const periodCrPaise = Math.round(Number(row.period_cr || 0) * 100);

  const total_dr_closing = Number((totalDrPaise / 100).toFixed(2));
  const total_cr_closing = Number((totalCrPaise / 100).toFixed(2));
  const difference = Number((Math.abs(diffPaise) / 100).toFixed(2));
  const difference_side = diffPaise >= 0 ? 'Dr' : 'Cr';
  const opening_net = Number((openingNetPaise / 100).toFixed(2));
  const period_dr = Number((periodDrPaise / 100).toFixed(2));
  const period_cr = Number((periodCrPaise / 100).toFixed(2));

  return {
    total_dr_closing,
    total_cr_closing,
    difference,
    difference_side,
    opening_net,
    period_dr,
    period_cr,
    period: { from, to },
    // Legacy compatibility aliases
    totalDr: total_dr_closing,
    totalCr: total_cr_closing,
    openingBalance: Math.abs(opening_net),
    openingType: opening_net >= 0 ? 'Dr' : 'Cr',
    closingBalance: difference,
    closingType: difference_side,
  };
};

// ─── 10. List voucher types ─────────────────────────────────────────────────
exports.listVoucherTypes = async (finance_id) => {
  const res = await db.query(
    `SELECT id, type_code, type_name, class, prefix, numbering_mode
     FROM acc_voucher_types
     WHERE finance_id = $1 AND is_active = true
     ORDER BY type_name`,
    [finance_id]
  );
  return res.rows;
};

// ─── 11. Ledger statement (running balance) ─────────────────────────────────
exports.getLedgerStatement = async (ledger_id, finance_id, fromOrOpts, maybeTo) => {
  if (!isValidUUID(ledger_id)) {
    throw createBadParamError('Invalid id or date');
  }

  const periodOpts =
    typeof fromOrOpts === 'object' && fromOrOpts !== null
      ? fromOrOpts
      : { from: fromOrOpts, to: maybeTo };

  const { from, to } = await resolvePeriodRange(db, finance_id, periodOpts);

  // 1. Verify ledger belongs to finance_id
  const ledgerRes = await db.query(
    `SELECT l.id,
            l.ledger_name,
            l.alias,
            ROUND(COALESCE(l.opening_balance, 0)::numeric, 2) AS opening_balance,
            l.ob_type,
            COALESCE(g.group_name, gm.group_name) AS group_name,
            COALESCE(g.nature, gm.nature) AS nature
       FROM acc_ledgers l
       LEFT JOIN acc_ledger_groups g
              ON l.group_id = g.id
             AND g.finance_id = l.finance_id
       LEFT JOIN acc_group_master gm
              ON l.master_group_id = gm.id
      WHERE l.id = $1 AND l.finance_id = $2
      LIMIT 1`,
    [ledger_id, finance_id]
  );

  const ledgerRow = ledgerRes.rows[0];
  if (!ledgerRow) {
    throw createNotFoundError('Ledger not found');
  }

  // 2. Compute prior voucher totals, period voucher totals, and total count (Posted only)
  const aggRes = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN v.voucher_date < $3::date AND e.entry_type = 'Dr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS prior_dr,
       COALESCE(SUM(CASE WHEN v.voucher_date < $3::date AND e.entry_type = 'Cr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS prior_cr,
       COALESCE(SUM(CASE WHEN v.voucher_date BETWEEN $3::date AND $4::date AND e.entry_type = 'Dr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS period_dr,
       COALESCE(SUM(CASE WHEN v.voucher_date BETWEEN $3::date AND $4::date AND e.entry_type = 'Cr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS period_cr,
       COUNT(*) FILTER (WHERE v.voucher_date BETWEEN $3::date AND $4::date) AS total_entries
     FROM acc_voucher_entries e
     JOIN acc_vouchers v
       ON v.id = e.voucher_id
      AND v.finance_id = e.finance_id
     WHERE e.ledger_id = $1
       AND e.finance_id = $2
       AND v.status = 'Posted'
       AND v.voucher_date <= $4::date`,
    [ledger_id, finance_id, from, to]
  );

  const agg = aggRes.rows[0] || {};
  const baseObPaise =
    Math.round(Number(ledgerRow.opening_balance || 0) * 100) *
    (ledgerRow.ob_type === 'Cr' ? -1 : 1);
  const priorDrPaise = Math.round(Number(agg.prior_dr || 0) * 100);
  const priorCrPaise = Math.round(Number(agg.prior_cr || 0) * 100);
  const openingNetPaise = baseObPaise + priorDrPaise - priorCrPaise;

  const periodDrPaise = Math.round(Number(agg.period_dr || 0) * 100);
  const periodCrPaise = Math.round(Number(agg.period_cr || 0) * 100);
  const closingNetPaise = openingNetPaise + periodDrPaise - periodCrPaise;
  const totalEntries = parseInt(agg.total_entries, 10) || 0;

  // 3. Fetch up to 2000 entries in period with aggregated counter_ledgers
  const entriesRes = await db.query(
    `SELECT
       v.id AS voucher_id,
       TO_CHAR(v.voucher_date, 'YYYY-MM-DD') AS voucher_date,
       v.voucher_number,
       vt.type_name AS voucher_type,
       e.entry_type,
       ROUND(e.amount::numeric, 2) AS amount,
       COALESCE(v.narration, e.narration) AS narration,
       COALESCE(
         (
           SELECT ARRAY_AGG(cl.ledger_name ORDER BY ce.sort_order ASC, ce.id ASC)
             FROM acc_voucher_entries ce
             JOIN acc_ledgers cl
               ON cl.id = ce.ledger_id
              AND cl.finance_id = ce.finance_id
            WHERE ce.voucher_id = v.id
              AND ce.finance_id = v.finance_id
              AND ce.id <> e.id
              AND ce.ledger_id <> e.ledger_id
         ),
         ARRAY[]::text[]
       ) AS counter_ledgers
     FROM acc_voucher_entries e
     JOIN acc_vouchers v
       ON v.id = e.voucher_id
      AND v.finance_id = e.finance_id
     JOIN acc_voucher_types vt
       ON vt.id = v.voucher_type_id
      AND vt.finance_id = v.finance_id
     WHERE e.ledger_id = $1
       AND e.finance_id = $2
       AND v.voucher_date BETWEEN $3::date AND $4::date
       AND v.status = 'Posted'
     ORDER BY v.voucher_date ASC, v.created_at ASC, v.voucher_number ASC, e.sort_order ASC
     LIMIT 2000`,
    [ledger_id, finance_id, from, to]
  );

  const entries = entriesRes.rows.map((r) => ({
    voucher_id: r.voucher_id,
    voucher_date: r.voucher_date,
    voucher_number: r.voucher_number,
    voucher_type: r.voucher_type,
    entry_type: r.entry_type,
    amount: Number(parseFloat(r.amount || 0).toFixed(2)),
    narration: r.narration || null,
    counter_ledgers: Array.isArray(r.counter_ledgers) ? r.counter_ledgers : [],
  }));

  return {
    ledger: {
      id: ledgerRow.id,
      name: ledgerRow.ledger_name,
      ledger_name: ledgerRow.ledger_name,
      alias: ledgerRow.alias,
      alias_name: ledgerRow.alias,
      opening_balance: Number(parseFloat(ledgerRow.opening_balance || 0).toFixed(2)),
      ob_type: ledgerRow.ob_type || 'Dr',
      group_name: ledgerRow.group_name,
      nature: ledgerRow.nature,
    },
    period: { from, to },
    opening: {
      dr: openingNetPaise > 0 ? Number((openingNetPaise / 100).toFixed(2)) : 0,
      cr: openingNetPaise < 0 ? Number((Math.abs(openingNetPaise) / 100).toFixed(2)) : 0,
      net: Number((openingNetPaise / 100).toFixed(2)),
      side: openingNetPaise >= 0 ? 'Dr' : 'Cr',
    },
    entries,
    period_total: {
      dr: Number((periodDrPaise / 100).toFixed(2)),
      cr: Number((periodCrPaise / 100).toFixed(2)),
    },
    closing: {
      dr: closingNetPaise > 0 ? Number((closingNetPaise / 100).toFixed(2)) : 0,
      cr: closingNetPaise < 0 ? Number((Math.abs(closingNetPaise) / 100).toFixed(2)) : 0,
      net: Number((closingNetPaise / 100).toFixed(2)),
      side: closingNetPaise >= 0 ? 'Dr' : 'Cr',
    },
    truncated: totalEntries > 2000,
    total: totalEntries,
  };
};

// ─── 11b. Ledger monthly summary (12 months April..March) ───────────────────
exports.getLedgerMonthly = async (ledger_id, finance_id, fyParam) => {
  if (!isValidUUID(ledger_id)) {
    throw createBadParamError('Invalid id or date');
  }

  let fyRange = null;
  if (fyParam !== undefined && fyParam !== null && String(fyParam).trim() !== '') {
    fyRange = fyLabelToDateRange(String(fyParam));
    if (!fyRange) {
      throw createBadParamError('Invalid id or date');
    }
  } else {
    const resolved = await resolvePeriodRange(db, finance_id, {});
    fyRange = fyLabelToDateRange(resolved.fyLabel) || {
      fyLabel: resolved.fyLabel,
      from: resolved.from,
      to: resolved.to,
    };
  }

  // 1. Verify ledger belongs to finance_id
  const ledgerRes = await db.query(
    `SELECT l.id,
            l.ledger_name,
            l.alias,
            ROUND(COALESCE(l.opening_balance, 0)::numeric, 2) AS opening_balance,
            l.ob_type,
            COALESCE(g.group_name, gm.group_name) AS group_name,
            COALESCE(g.nature, gm.nature) AS nature
       FROM acc_ledgers l
       LEFT JOIN acc_ledger_groups g
              ON l.group_id = g.id
             AND g.finance_id = l.finance_id
       LEFT JOIN acc_group_master gm
              ON l.master_group_id = gm.id
      WHERE l.id = $1 AND l.finance_id = $2
      LIMIT 1`,
    [ledger_id, finance_id]
  );

  const ledgerRow = ledgerRes.rows[0];
  if (!ledgerRow) {
    throw createNotFoundError('Ledger not found');
  }

  // 2. Compute FY opening (ledger opening_balance + Posted entries prior to FY start)
  const priorRes = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN e.entry_type = 'Dr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS prior_dr,
       COALESCE(SUM(CASE WHEN e.entry_type = 'Cr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS prior_cr
     FROM acc_voucher_entries e
     JOIN acc_vouchers v
       ON v.id = e.voucher_id
      AND v.finance_id = e.finance_id
     WHERE e.ledger_id = $1
       AND e.finance_id = $2
       AND v.status = 'Posted'
       AND v.voucher_date < $3::date`,
    [ledger_id, finance_id, fyRange.from]
  );

  const priorRow = priorRes.rows[0] || {};
  const baseObPaise =
    Math.round(Number(ledgerRow.opening_balance || 0) * 100) *
    (ledgerRow.ob_type === 'Cr' ? -1 : 1);
  const priorDrPaise = Math.round(Number(priorRow.prior_dr || 0) * 100);
  const priorCrPaise = Math.round(Number(priorRow.prior_cr || 0) * 100);
  const fyOpeningPaise = baseObPaise + priorDrPaise - priorCrPaise;

  // 3. Generate 12 months April..March and aggregate Posted vouchers
  const monthsRes = await db.query(
    `WITH months AS (
       SELECT
         gs::date AS month_start,
         TO_CHAR(gs, 'YYYY-MM') AS month_key,
         TO_CHAR(gs, 'Mon YYYY') AS month_label
       FROM generate_series($3::date, $4::date, INTERVAL '1 month') AS gs
     ),
     m_agg AS (
       SELECT
         TO_CHAR(DATE_TRUNC('month', v.voucher_date), 'YYYY-MM') AS month_key,
         COALESCE(SUM(CASE WHEN e.entry_type = 'Dr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS debit,
         COALESCE(SUM(CASE WHEN e.entry_type = 'Cr' THEN e.amount ELSE 0 END), 0)::numeric(18,2) AS credit
       FROM acc_voucher_entries e
       JOIN acc_vouchers v
         ON v.id = e.voucher_id
        AND v.finance_id = e.finance_id
       WHERE e.ledger_id = $1
         AND e.finance_id = $2
         AND v.status = 'Posted'
         AND v.voucher_date BETWEEN $3::date AND $4::date
       GROUP BY 1
     )
     SELECT
       m.month_key AS month,
       m.month_label,
       ROUND(COALESCE(ma.debit, 0)::numeric(18,2), 2) AS debit,
       ROUND(COALESCE(ma.credit, 0)::numeric(18,2), 2) AS credit
     FROM months m
     LEFT JOIN m_agg ma ON ma.month_key = m.month_key
     ORDER BY m.month_key ASC`,
    [ledger_id, finance_id, fyRange.from, fyRange.to]
  );

  let runningPaise = fyOpeningPaise;
  const months = monthsRes.rows.map((r) => {
    const monthOpeningPaise = runningPaise;
    const drPaise = Math.round(Number(r.debit || 0) * 100);
    const crPaise = Math.round(Number(r.credit || 0) * 100);
    runningPaise = monthOpeningPaise + drPaise - crPaise;
    return {
      month: r.month,
      month_label: r.month_label,
      opening: Number((monthOpeningPaise / 100).toFixed(2)),
      debit: Number((drPaise / 100).toFixed(2)),
      credit: Number((crPaise / 100).toFixed(2)),
      closing: Number((runningPaise / 100).toFixed(2)),
      closing_abs: Number((Math.abs(runningPaise) / 100).toFixed(2)),
      closing_side: runningPaise >= 0 ? 'Dr' : 'Cr',
    };
  });

  return {
    ledger: {
      id: ledgerRow.id,
      name: ledgerRow.ledger_name,
      ledger_name: ledgerRow.ledger_name,
      group_name: ledgerRow.group_name,
      nature: ledgerRow.nature,
      opening_balance: Number(parseFloat(ledgerRow.opening_balance || 0).toFixed(2)),
      ob_type: ledgerRow.ob_type || 'Dr',
    },
    fy: fyRange.fyLabel,
    opening: {
      net: Number((fyOpeningPaise / 100).toFixed(2)),
      abs: Number((Math.abs(fyOpeningPaise) / 100).toFixed(2)),
      side: fyOpeningPaise >= 0 ? 'Dr' : 'Cr',
    },
    months,
  };
};

// ─── 11c. GST and Contact view details (one-to-one LEFT JOINs) ──────────────
exports.getLedgerViewDetails = async (finance_id) => {
  const res = await db.query(
    `SELECT
       l.id,
       l.ledger_name,
       COALESCE(g.group_name, gm.group_name) AS group_name,
       COALESCE(g.nature, gm.nature) AS nature,
       tx.gstin,
       tx.reg_type,
       tx.pan_number,
       lm.contact_person,
       lm.mobile,
       lm.primary_mobile,
       lm.email,
       lm.city,
       lm.state
     FROM acc_ledgers l
     LEFT JOIN acc_ledger_groups g
       ON g.id = l.group_id
      AND g.finance_id = l.finance_id
     LEFT JOIN acc_group_master gm
       ON gm.id = l.master_group_id
     LEFT JOIN acc_ledger_tax tx
       ON tx.ledger_id = l.id
      AND tx.finance_id = l.finance_id
     LEFT JOIN acc_ledger_mailing lm
       ON lm.ledger_id = l.id
      AND lm.finance_id = l.finance_id
     WHERE l.finance_id = $1
       AND l.is_active = true
       AND NOT l.inactive
     ORDER BY l.ledger_name ASC`,
    [finance_id]
  );

  return res.rows;
};

/**
 * Get recent active ledgers for a finance company
 */
exports.getRecentLedgers = async (finance_id, limit = 10) => {
  if (!finance_id) {
    throw new Error('finance_id is required');
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

  const res = await db.query(
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
    LEFT JOIN acc_ledger_groups lg ON lg.id = l.group_id AND lg.finance_id = l.finance_id
    WHERE l.finance_id = $1 AND l.is_active = true AND NOT l.inactive
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT $2`,
    [finance_id, safeLimit]
  );

  return res.rows.map(row => {
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
        nature: row.custom_group_nature,
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
      freeze_balance: Boolean(row.freeze_balance),
      is_active: Boolean(row.is_active),
      inactive: Boolean(row.inactive),
      is_bank_account: Boolean(row.is_bank_account),
      is_system: Boolean(row.is_system),
      group,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
};

/**
 * Get full ledger details for editing (including all satellites)
 */
exports.getLedgerDetails = async (ledgerId, finance_id) => {
  const res = await db.query(
    `SELECT
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
        bw.credit_limit AS billwise_credit_limit,
        bw.credit_days AS billwise_default_credit_period,
        bw.check_credit_days AS billwise_check_credit_days,
        bw.check_credit_limit AS billwise_check_credit_limit,
        bw.separate_discount AS billwise_separate_discount,

        tc.gst_applicable AS tax_config_gst_applicable,
        tc.set_alter_gst_details AS tax_config_set_alter_gst_details,
        tc.gst_description AS tax_config_gst_description,
        tc.applicable_from AS tax_config_applicable_from,
        tc.hsn_sac_code AS tax_config_hsn_sac_code,
        tc.type_of_supply AS tax_config_type_of_supply,
        tc.taxability AS tax_config_taxability,
        tc.igst_rate AS tax_config_igst_rate,
        tc.cgst_rate AS tax_config_cgst_rate,
        tc.sgst_rate AS tax_config_sgst_rate,
        tc.cess_rate AS tax_config_cess_rate,
        tc.cess_type AS tax_config_cess_type,
        tc.cess_per_unit AS tax_config_cess_per_unit,
        tc.cess_unit AS tax_config_cess_unit,
        tc.reverse_charge AS tax_config_reverse_charge,
        tc.include_in_assessable AS tax_config_include_in_assessable,
        tc.gst_status AS tax_config_gst_status,

        bc.recon_effective_date AS bank_config_recon_effective_date,
        bc.set_alter_cheque_books AS bank_config_set_alter_cheque_books,
        bc.enable_cheque_printing AS bank_config_enable_cheque_printing,
        bc.cheque_print_bank_name AS bank_config_cheque_print_bank_name

    FROM acc_ledgers l

    LEFT JOIN acc_group_master gm
        ON gm.id = l.master_group_id

    LEFT JOIN acc_ledger_groups lg
        ON lg.id = l.group_id
        AND lg.finance_id = l.finance_id

    LEFT JOIN acc_ledger_balances lb
        ON lb.ledger_id = l.id
        AND lb.finance_id = l.finance_id

    LEFT JOIN acc_ledger_mailing lm
        ON lm.ledger_id = l.id
        AND lm.finance_id = l.finance_id

    LEFT JOIN acc_ledger_banking bk
        ON bk.ledger_id = l.id
        AND bk.finance_id = l.finance_id
        AND bk.is_primary = true

    LEFT JOIN acc_ledger_tax tx
        ON tx.ledger_id = l.id
        AND tx.finance_id = l.finance_id

    LEFT JOIN acc_ledger_statutory st
        ON st.ledger_id = l.id
        AND st.finance_id = l.finance_id

    LEFT JOIN acc_ledger_billwise bw
        ON bw.ledger_id = l.id
        AND bw.finance_id = l.finance_id

    LEFT JOIN acc_ledger_tax_config tc
        ON tc.ledger_id = l.id
        AND tc.finance_id = l.finance_id

    LEFT JOIN acc_ledger_bank_config bc
        ON bc.ledger_id = l.id
        AND bc.finance_id = l.finance_id

    WHERE
        l.finance_id = $1
        AND l.id = $2

    LIMIT 1`,
    [finance_id, ledgerId]
  );

  if (!res.rows.length) return null;

  const row = res.rows[0];

  const group = row.master_group_id
    ? {
        source: 'system',
        group_id: row.master_group_id,
        group_name: row.system_group_name,
        nature: row.system_group_nature,
      }
    : row.group_id
    ? {
        source: 'custom',
        group_id: row.group_id,
        group_name: row.custom_group_name,
        nature: row.custom_group_nature,
        affects_gross_profit: Boolean(row.custom_affects_gross_profit),
        behaves_like_subledger: Boolean(row.custom_behaves_like_subledger),
        nett_balance_report: row.custom_nett_balance_report,
        used_for_calculation: Boolean(row.custom_used_for_calculation),
        allocation_method: row.custom_allocation_method,
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
      inactive: Boolean(row.inactive),
      is_active: Boolean(row.is_active),
      opening_balance: parseFloat(row.opening_balance || 0),
      ob_type: row.ob_type,
      effective_date: row.effective_date,
      freeze_balance: Boolean(row.freeze_balance),
      inv_values_affected: Boolean(row.inv_values_affected),
      type_of_ledger: row.type_of_ledger,
      rounding_method: row.rounding_method,
      rounding_limit: row.rounding_limit ? parseFloat(row.rounding_limit) : null,
      appropriation_method: row.appropriation_method,
      method_to_allocate: Boolean(row.method_to_allocate),
      is_additional_cost: Boolean(row.is_additional_cost),
      cost_centre_applicable: Boolean(row.cost_centre_applicable),
      cost_centre_allocation: Boolean(row.cost_centre_allocation),
      ledger_flushing_method: row.ledger_flushing_method,
      include_in_buyer_ledger: Boolean(row.include_in_buyer_ledger),
      include_in_seller_ledger: Boolean(row.include_in_seller_ledger),
      is_bank_account: Boolean(row.is_bank_account),
      is_system: Boolean(row.is_system),
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },

    group,

    balance: {
      opening_dr: parseFloat(row.balance_opening_dr || 0),
      opening_cr: parseFloat(row.balance_opening_cr || 0),
      period_dr: parseFloat(row.balance_period_dr || 0),
      period_cr: parseFloat(row.balance_period_cr || 0),
      closing_dr: parseFloat(row.balance_closing_dr || 0),
      closing_cr: parseFloat(row.balance_closing_cr || 0),
      financial_year: row.balance_financial_year,
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
      show_mailing_details: Boolean(row.show_mailing_details),
      provide_contact: Boolean(row.provide_contact),
      contact_person: row.contact_person,
      telephone: row.mailing_telephone,
      mobile: row.mailing_mobile,
      primary_mobile: row.mailing_primary_mobile,
      fax: row.mailing_fax,
      email: row.mailing_email,
      email_cc: row.mailing_email_cc,
      website: row.mailing_website,
    },

    banking: {
      id: row.banking_id,
      provide_bank_details: Boolean(row.provide_bank_details),
      account_holder_name: row.account_holder_name,
      bank_name: row.bank_name,
      account_number: row.account_number,
      ifsc: row.banking_ifsc,
      swift: row.banking_swift,
      branch: row.banking_branch,
      account_type: row.banking_account_type,
      upi_id: row.banking_upi_id,
      is_primary: Boolean(row.banking_is_primary),
    },

    tax: {
      id: row.tax_id,
      pan_number: row.tax_pan_number,
      gstin: row.tax_gstin,
      registration_type: row.tax_registration_type,
      assessee_other_territory: Boolean(row.tax_assessee_other_territory),
      territory: row.tax_territory,
      tan_number: row.tax_tan_number,
      deductor_category: row.tax_deductor_category,
      collection_account_no: row.tax_collection_account_no,
      tax_type: row.tax_tax_type,
      deductee_type: row.tax_deductee_type,
      buyer_type: row.tax_buyer_type,
      tds_applicable: Boolean(row.tax_tds_applicable),
      tcs_applicable: Boolean(row.tax_tcs_applicable),
    },

    statutory: {
      id: row.statutory_id,
      msme_registered: Boolean(row.msme_registered),
      udyam_number: row.udyam_number,
      einvoice_applicable: Boolean(row.einvoice_applicable),
      default_supply_type: row.default_supply_type,
      eway_bill_applicable: Boolean(row.eway_bill_applicable),
      default_transport_mode: row.default_transport_mode,
      default_distance: row.statutory_default_distance ? parseFloat(row.statutory_default_distance) : null,
    },

    billwise: {
      id: row.billwise_id,
      maintain_bill_wise: Boolean(row.billwise_maintain_bill_wise),
      credit_limit: row.billwise_credit_limit ? parseFloat(row.billwise_credit_limit) : null,
      default_credit_period: row.billwise_default_credit_period,
      check_credit_days_during_entry: Boolean(row.billwise_check_credit_days),
      check_credit_limit: Boolean(row.billwise_check_credit_limit),
      separate_discount: Boolean(row.billwise_separate_discount),
    },

    taxConfig: {
      gst_applicable: row.tax_config_gst_applicable,
      set_alter_gst_details: Boolean(row.tax_config_set_alter_gst_details),
      gst_description: row.tax_config_gst_description,
      applicable_from: row.tax_config_applicable_from,
      hsn_sac_code: row.tax_config_hsn_sac_code,
      type_of_supply: row.tax_config_type_of_supply,
      taxability: row.tax_config_taxability,
      igst_rate: parseFloat(row.tax_config_igst_rate || 0),
      cgst_rate: parseFloat(row.tax_config_cgst_rate || 0),
      sgst_rate: parseFloat(row.tax_config_sgst_rate || 0),
      cess_rate: parseFloat(row.tax_config_cess_rate || 0),
      cess_type: row.tax_config_cess_type,
      cess_per_unit: row.tax_config_cess_per_unit ? parseFloat(row.tax_config_cess_per_unit) : null,
      cess_unit: row.tax_config_cess_unit,
      reverse_charge: Boolean(row.tax_config_reverse_charge),
      include_in_assessable: Boolean(row.tax_config_include_in_assessable),
      gst_status: row.tax_config_gst_status,
    },

    bankConfig: {
      recon_effective_date: row.bank_config_recon_effective_date,
      set_alter_cheque_books: Boolean(row.bank_config_set_alter_cheque_books),
      enable_cheque_printing: Boolean(row.bank_config_enable_cheque_printing),
      cheque_print_bank_name: row.bank_config_cheque_print_bank_name,
    },
  };
};

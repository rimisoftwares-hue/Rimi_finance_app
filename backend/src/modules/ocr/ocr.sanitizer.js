'use strict';

/**
 * OCR sanitizer + multi-image merger for the ledger_v1 schema.
 * Pure functions (no I/O). Never logs values.
 */

const fs = require('fs');
const path = require('path');
const { OcrError } = require('./gemini.service');

// ── Skeleton derived from the SCHEMA line of the prompt (single source of truth) ──
let SKELETON = null;
const getSkeleton = () => {
  if (SKELETON) return SKELETON;
  const txt = fs.readFileSync(path.join(__dirname, 'prompts', 'ledger_extraction.v1.txt'), 'utf8');
  const idx = txt.lastIndexOf('SCHEMA:');
  SKELETON = JSON.parse(txt.slice(idx + 'SCHEMA:'.length).trim());
  return SKELETON;
};

const MAX_PAYMENTS = 300;
const MAX_CONTACTS = 10;

const TAMIL_DIGITS = { '௦': '0', '௧': '1', '௨': '2', '௩': '3', '௪': '4', '௫': '5', '௬': '6', '௭': '7', '௮': '8', '௯': '9' };
const tamilToWestern = (s) => (typeof s === 'string' ? s.replace(/[௦-௯]/g, (d) => TAMIL_DIGITS[d] || d) : s);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const isEmptyValue = (v) => {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) return Object.values(v).every(isEmptyValue);
  return false;
};

// ── 1. Parse with one repair attempt ─────────────────────────────────────────
const parseModelOutput = (text) => {
  if (typeof text !== 'string' || !text.trim()) throw new OcrError('INVALID_JSON_AFTER_REPAIR', false);
  let t = text.trim();
  // Strip accidental code fences
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const v = JSON.parse(t);
    if (isPlainObject(v)) return v;
  } catch { /* fall through to repair */ }
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      const v = JSON.parse(t.slice(first, last + 1));
      if (isPlainObject(v)) return v;
    } catch { /* fall through */ }
  }
  throw new OcrError('INVALID_JSON_AFTER_REPAIR', false);
};

// ── 2. Shape: every skeleton key present, wrong types replaced ───────────────
const conformToSkeleton = (value, skel) => {
  if (Array.isArray(skel)) return Array.isArray(value) ? value : [];
  if (isPlainObject(skel)) {
    const src = isPlainObject(value) ? value : {};
    const out = {};
    for (const key of Object.keys(skel)) out[key] = conformToSkeleton(src[key], skel[key]);
    // Keep the "cols" free-form object of payments etc. untouched; extra keys at top level are dropped
    return out;
  }
  // scalar slot
  if (value === undefined) return null;
  if (isPlainObject(value) || Array.isArray(value)) return null;
  return value;
};

const trimDeep = (v) => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (Array.isArray(v)) return v.map(trimDeep);
  if (isPlainObject(v)) {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = trimDeep(val);
    return out;
  }
  return v;
};

// ── 3. Field normalizers ─────────────────────────────────────────────────────
const addUncertain = (ctx, fieldPath, rawText, reason, options = []) => {
  ctx.uncertain.push({ field_path: fieldPath, raw_text: rawText == null ? null : String(rawText), options, reason });
};

/** Clean a phone to a 10-digit Indian mobile string, or null. */
const cleanMobile = (raw) => {
  if (raw === null || raw === undefined) return null;
  let d = tamilToWestern(String(raw)).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? d : null;
};

const FORMULA_RE = /[+x×*=]/i;

/**
 * Parse an amount: JSON number or strings like "₹1,20,000/-", "Rs. 4500".
 * Returns { value: number|null, formula: boolean }.
 */
const parseAmount = (raw) => {
  if (raw === null || raw === undefined) return { value: null, formula: false };
  if (typeof raw === 'number') return { value: Number.isFinite(raw) ? raw : null, formula: false };
  let s = tamilToWestern(String(raw)).trim();
  s = s.replace(/\/-\s*$/, '').replace(/₹|rs\.?|inr/gi, '').replace(/,/g, '').replace(/\s+/g, '').replace(/%$/, '');
  if (/^\d+(\.\d+)?$/.test(s)) return { value: Number(s), formula: false };
  if (FORMULA_RE.test(s) && /\d/.test(s)) return { value: null, formula: true };
  return { value: null, formula: false };
};

const pivotYear = (yy) => {
  const currentYY = new Date().getFullYear() % 100;
  return yy <= currentYY + 1 ? 2000 + yy : 1900 + yy;
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Convert Indian dates (DD/MM/YY, DD-MM-YYYY, DD.MM.YYYY) or ISO to YYYY-MM-DD; null if not a full date. */
const toIsoDate = (raw) => {
  if (raw === null || raw === undefined) return null;
  const s = tamilToWestern(String(raw)).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDate(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  }
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = m[3].length === 2 ? pivotYear(Number(m[3])) : Number(m[3]);
    return validDate(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  }
  return null;
};

const validDate = (y, mo, d) => {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};

const normalizeVehicleNumber = (raw) => {
  if (raw === null || raw === undefined) return null;
  const v = tamilToWestern(String(raw)).toUpperCase().replace(/[\s\-.]/g, '');
  return v || null;
};

const digitsOnly = (raw) => (raw === null || raw === undefined ? '' : tamilToWestern(String(raw)).replace(/[\s\-]/g, ''));

const LOAN_AMOUNT_FIELDS = [
  'down_payment', 'pay_mode_1_amount', 'net_payment', 'hpAmount', 'interestRate', 'principle_part',
  'interest_part', 'dueAmount', 'book_binding_amount', 'net_payable', 'penaltyAmount', 'hand_loan',
  'documentation_charge', 'broker_commission',
];
const LOAN_INT_FIELDS = ['dueMonth', 'penalty_days'];

const normalizeContacts = (list, contactType, basePath, ctx) => {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!isPlainObject(item) || isEmptyValue(item)) continue;
    const raw = item.number === null || item.number === undefined ? null : String(item.number);
    if (!raw) continue;
    const cleaned = cleanMobile(raw);
    const type = ['mobile', 'landline', 'work'].includes(item.type) ? item.type : 'mobile';
    if (!cleaned) addUncertain(ctx, `${basePath}[${out.length}].number`, raw, 'Not a 10-digit mobile number');
    out.push({
      contact_type: contactType,
      type,
      number: cleaned,
      number_raw: raw,
      label: item.label ?? null,
    });
    if (out.length >= MAX_CONTACTS) break;
  }
  return out;
};

const normalizeRelationUnit = (u) => {
  if (u === null || u === undefined) return null;
  const raw = String(u).trim();
  if (!raw) return null;
  const noSpace = raw.replace(/\s+/g, '');
  if (noSpace === 'த/பெ' || noSpace === 'தபெ') return 'S/O';
  if (noSpace === 'ம/பெ' || noSpace === 'மபெ') return 'W/O';
  const compact = raw.toUpperCase().replace(/[\s.\\/-]/g, '');
  const valid = ['S/O', 'W/O', 'D/O', 'H/O', 'M/O', 'F/O'];
  const match = valid.find((v) => v.replace('/', '') === compact);
  return match || raw;
};

const normalizePerson = (p, prefix, ctx) => {
  const rel = p.cfname || p.gfname;
  if (rel && rel.unit !== null && rel.unit !== undefined) {
    rel.unit = normalizeRelationUnit(rel.unit);
  }
  if (p.work_office_phone !== null) {
    const raw = String(p.work_office_phone);
    const cleaned = cleanMobile(raw);
    if (!cleaned) {
      const d = digitsOnly(raw).replace(/\D/g, '');
      if (!d) addUncertain(ctx, `${prefix}.work_office_phone`, raw, 'Unreadable phone number');
      p.work_office_phone = d || null;
    } else {
      p.work_office_phone = cleaned;
    }
  }
  if (p.aadhar_id !== null) {
    const raw = String(p.aadhar_id);
    const d = digitsOnly(raw);
    if (/^\d{12}$/.test(d)) p.aadhar_id = d;
    else {
      addUncertain(ctx, `${prefix}.aadhar_id`, raw, 'Aadhaar must be 12 digits');
      p.aadhar_id = null;
    }
  }
  const addr = p.caddress || p.gaddress;
  const addrKey = p.caddress ? 'caddress' : 'gaddress';
  if (addr) {
    addr.location = null;
    addr.latitude = null;
    addr.longitude = null;
    if (addr.pincode !== null) {
      const raw = String(addr.pincode);
      const d = digitsOnly(raw);
      if (/^\d{6}$/.test(d)) addr.pincode = d;
      else {
        addUncertain(ctx, `${prefix}.${addrKey}.pincode`, raw, 'Pincode must be 6 digits');
        addr.pincode = null;
      }
    }
  }
};

const normalizeHplno = (raw, fieldPath, ctx) => {
  if (raw === null || raw === undefined) return null;
  const d = digitsOnly(String(raw));
  if (/^\d{1,9}$/.test(d)) return d;
  addUncertain(ctx, fieldPath, raw, 'Account / HPL number must be digits only');
  return null;
};

/**
 * Sanitize a parsed model object into a clean ledger_v1 object.
 * @param {object} parsed
 * @param {{ extractPayments?: boolean }} [opts]
 */
const sanitizeExtraction = (parsed, opts = {}) => {
  const skel = getSkeleton();
  const data = trimDeep(conformToSkeleton(parsed, skel));
  const ai = data.ai_predictions_and_options;
  const ctx = { uncertain: [] };

  // Drop empty items from lists
  for (const key of ['name_mismatches', 'shifted_field_corrections', 'uncertain_fields']) {
    ai[key] = (ai[key] || []).filter((it) => isPlainObject(it) && !isEmptyValue(it));
  }
  data.notes = (data.notes || []).filter((n) => !isEmptyValue(n));

  // Customer
  const c = data.customer;
  c.hplno = normalizeHplno(c.hplno, 'customer.hplno', ctx);
  c.ccontacts = normalizeContacts(c.ccontacts || [], 'customer', 'customer.ccontacts', ctx);
  normalizePerson(c, 'customer', ctx);

  // Guardian
  const g = data.guardian;
  g.customer_hplno = normalizeHplno(g.customer_hplno, 'guardian.customer_hplno', ctx);
  g.gcontacts = normalizeContacts(g.gcontacts || [], 'guardian', 'guardian.gcontacts', ctx);
  normalizePerson(g, 'guardian', ctx);

  // Vehicle
  const v = data.vehicle;
  v.vehicleNumber = normalizeVehicleNumber(v.vehicleNumber);
  if (v.manufacture_year !== null) {
    const raw = String(v.manufacture_year);
    const d = digitsOnly(raw);
    if (/^(19|20)\d{2}$/.test(d)) v.manufacture_year = d;
    else {
      addUncertain(ctx, 'vehicle.manufacture_year', raw, 'Year must be 4 digits');
      v.manufacture_year = null;
    }
  }
  if (v.engine_number !== null) v.engine_number = String(v.engine_number).toUpperCase().replace(/\s+/g, '') || null;
  if (v.chassis_number !== null) v.chassis_number = String(v.chassis_number).toUpperCase().replace(/\s+/g, '') || null;

  // Loan
  const l = data.loan;
  for (const f of LOAN_AMOUNT_FIELDS) {
    if (l[f] === null) continue;
    const raw = l[f];
    const { value, formula } = parseAmount(raw);
    if (value === null) {
      if (formula && f === 'dueAmount' && !l.raw_due_amount_text) {
        l.raw_due_amount_text = String(raw);
      } else {
        addUncertain(ctx, `loan.${f}`, raw, formula ? 'Amount written as a formula' : 'Not a number');
      }
    }
    l[f] = value;
  }
  for (const f of LOAN_INT_FIELDS) {
    if (l[f] === null) continue;
    const raw = l[f];
    const { value } = parseAmount(raw);
    if (value === null || !Number.isInteger(value)) {
      addUncertain(ctx, `loan.${f}`, raw, 'Not a whole number');
      l[f] = null;
    } else {
      l[f] = value;
    }
  }
  if (l.hpDate !== null) {
    const iso = toIsoDate(l.hpDate);
    if (!iso) addUncertain(ctx, 'loan.hpDate', l.hpDate, 'Not a full date');
    l.hpDate = iso;
  }
  if (l.due_date !== null) {
    const iso = toIsoDate(l.due_date);
    // A bare day number ("21", "22.4") is kept as text, per the prompt rules
    l.due_date = iso || tamilToWestern(String(l.due_date));
  }

  // Payments (off by default)
  if (!opts.extractPayments) {
    data.payments = [];
    data.table_headers = [];
  } else {
    data.payments = (data.payments || []).filter((p) => isPlainObject(p) && !isEmptyValue(p)).slice(0, MAX_PAYMENTS).map((p) => ({
      ...p,
      due_amount: parseAmount(p.due_amount).value,
      due_date: p.due_date ? (toIsoDate(p.due_date) || tamilToWestern(String(p.due_date))) : null,
      paid_date: p.paid_date ? (toIsoDate(p.paid_date) || tamilToWestern(String(p.paid_date))) : null,
    }));
  }

  ai.uncertain_fields = [...ai.uncertain_fields, ...ctx.uncertain];
  ai.review_required = true;
  return data;
};

// ── 4. Multi-image merge ─────────────────────────────────────────────────────
const LIST_KEYS_DEDUPE_CONTACTS = new Set(['ccontacts', 'gcontacts']);

const mergeInto = (target, src, pathPrefix, conflicts) => {
  for (const key of Object.keys(target)) {
    const t = target[key];
    const s = src[key];
    const p = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (Array.isArray(t)) {
      if (!Array.isArray(s) || s.length === 0) continue;
      if (LIST_KEYS_DEDUPE_CONTACTS.has(key)) {
        const seen = new Set(t.map((it) => it.number || it.number_raw));
        for (const it of s) {
          const k = it.number || it.number_raw;
          if (!seen.has(k) && t.length < MAX_CONTACTS) {
            t.push(it);
            seen.add(k);
          }
        }
      } else if (key === 'payments') {
        target[key] = [...t, ...s].slice(0, MAX_PAYMENTS);
      } else if (key === 'table_headers') {
        if (t.length === 0) target[key] = s;
      } else {
        target[key] = [...t, ...s];
      }
    } else if (isPlainObject(t)) {
      if (isPlainObject(s)) mergeInto(t, s, p, conflicts);
    } else if (t === null || t === undefined) {
      if (s !== null && s !== undefined) target[key] = s;
    } else if (s !== null && s !== undefined && String(s) !== String(t)) {
      conflicts.push({ field_path: p, raw_text: null, options: [String(t), String(s)], reason: 'Different values on different images' });
    }
  }
};

/**
 * @param {Array<{ sequence_no: number, extracted_data: object|null }>} jobs
 * @returns {object|null}
 */
const mergeJobExtractions = (jobs) => {
  const usable = (jobs || [])
    .filter((j) => j && isPlainObject(j.extracted_data))
    .sort((a, b) => a.sequence_no - b.sequence_no);
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0].extracted_data;
  const base = JSON.parse(JSON.stringify(usable[0].extracted_data));
  const conflicts = [];
  for (let i = 1; i < usable.length; i++) {
    const src = usable[i].extracted_data;
    // ai_predictions lists are concatenated by mergeInto; suggested_vehicle fills nulls
    mergeInto(base, src, '', conflicts);
  }
  base.ai_predictions_and_options.uncertain_fields = [
    ...(base.ai_predictions_and_options.uncertain_fields || []),
    ...conflicts.filter((c) => !c.field_path.startsWith('ai_predictions_and_options')),
  ];
  base.ai_predictions_and_options.review_required = true;
  return base;
};

module.exports = {
  parseModelOutput,
  sanitizeExtraction,
  mergeJobExtractions,
  // exported for tests
  tamilToWestern,
  cleanMobile,
  parseAmount,
  toIsoDate,
  normalizeVehicleNumber,
  getSkeleton,
  MAX_PAYMENTS,
  MAX_CONTACTS,
};

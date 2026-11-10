// Pure OCR -> form-store mapper and apply policy. No React, no store access.
// Field mapping follows OCR_IMPLEMENTATION_PLAN.md section 5.2 with the owner's
// confirmed semantics: vehicle_modal = year of manufacture, model_name / modelName = model
// (e.g. "Pulsar"), vehicleName = "Brand Model" (e.g. "Bajaj Pulsar").
// Only erasable TypeScript syntax is used so `node --test` can run the tests directly.

import type {
  CustomerDetails,
  VehicleDetails,
  LoanDetails,
  GuardianDetails,
  Addresses,
  CustomerContact,
} from '../types/formStore';
import type { LedgerV1, LedgerAddress, LedgerContact, LedgerRelation } from '../types/ocr';

export type OcrLoanType = 'consulting' | 'vehicle';
export type OcrSection = 'customer' | 'vehicle' | 'loan' | 'guardian';

export interface OcrWarning {
  section: OcrSection;
  field: string;
  message: string;
}

export interface MappedOcr {
  customer: Partial<CustomerDetails>;
  vehicle: Partial<VehicleDetails>;
  loan: Partial<LoanDetails>;
  guardian: Partial<GuardianDetails>;
  warnings: OcrWarning[];
}

// ── Primitive normalizers ────────────────────────────────────────────────────
const TAMIL_DIGITS: Record<string, string> = {
  '௦': '0', '௧': '1', '௨': '2', '௩': '3', '௪': '4', '௫': '5', '௬': '6', '௭': '7', '௮': '8', '௯': '9',
};
export const tamilToWestern = (s: string): string => s.replace(/[௦-௯]/g, (d) => TAMIL_DIGITS[d] || d);

const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

/** Number parsing: JSON numbers or "₹1,20,000/-". Formulas ("3000+1200") -> { formula: true }. */
export const parseAmount = (v: unknown): { value?: number; formula: boolean } => {
  if (v === null || v === undefined || v === '') return { formula: false };
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? { value: v, formula: false } : { formula: false };
  let s = tamilToWestern(String(v)).trim();
  s = s.replace(/\/-\s*$/, '').replace(/₹|rs\.?|inr/gi, '').replace(/,/g, '').replace(/\s+/g, '').replace(/%$/, '');
  if (/^\d+(\.\d+)?$/.test(s)) return { value: Number(s), formula: false };
  if (/[+x×*=]/i.test(s) && /\d/.test(s)) return { formula: true };
  return { formula: false };
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const validDate = (y: number, m: number, d: number): boolean => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** ISO YYYY-MM-DD from ISO or Indian DD/MM/YY(YY). Two-digit years: yy <= currentYY + 1 -> 20yy, else 19yy. */
export const toIsoDate = (v: unknown, now: Date = new Date()): string | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const s = tamilToWestern(raw);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDate(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : undefined;
  }
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (m[3].length === 2) {
      const currentYY = now.getFullYear() % 100;
      y = y <= currentYY + 1 ? 2000 + y : 1900 + y;
    }
    return validDate(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : undefined;
  }
  return undefined;
};

export const cleanMobile = (v: unknown): string | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  let d = tamilToWestern(raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? d : undefined;
};

export const normalizeVehicleNumber = (v: unknown): string | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  return tamilToWestern(raw).toUpperCase().replace(/[\s\-.]/g, '') || undefined;
};

// ── Enum maps (unknown -> omit + warning, never invent) ─────────────────────
const RELATION_UNITS = ['S/O', 'W/O', 'D/O', 'H/O', 'M/O', 'F/O'] as const;
type RelationUnit = (typeof RELATION_UNITS)[number];

export const mapRelationUnit = (v: unknown): RelationUnit | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const compact = raw.toUpperCase().replace(/[\s.\\/-]/g, '');
  const tamil: Record<string, RelationUnit> = { 'த/பெ': 'S/O', 'தபெ': 'S/O', 'ம/பெ': 'W/O', 'மபெ': 'W/O' };
  if (tamil[raw.replace(/\s/g, '')]) return tamil[raw.replace(/\s/g, '')];
  const found = RELATION_UNITS.find((u) => u.replace('/', '') === compact);
  return found;
};

/** Vehicle type per mode. Vehicle Loan Step 2 is a select (two/three/four_wheeler, heavy_vehicle, commercial);
 *  Consulting Step 2 is free text, so Bike / Scooter keep their own value there. */
export const mapVehicleType = (v: unknown, loanType: OcrLoanType): string | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (/^(2|two)wheeler$|^2w$/.test(s)) return 'two_wheeler';
  if (/^(3|three)wheeler$|^3w$|^auto$/.test(s)) return 'three_wheeler';
  if (/^(4|four)wheeler$|^4w$|^car$/.test(s)) return 'four_wheeler';
  if (s === 'bike' || s === 'motorcycle') return loanType === 'consulting' ? 'bike' : 'two_wheeler';
  if (s === 'scooter' || s === 'scooty') return loanType === 'consulting' ? 'scooter' : 'two_wheeler';
  return undefined;
};

const LOAN_TYPES = [
  'refinance', 'two_wheeler', 'four_wheeler', 'three_wheeler', 'rc_book_loan', 'duplicate_rc_loan',
  'insurance_loan', 'noc_loan', 'document_security', 'vehicle_security', 'guarantor_security',
];

/** loan.loan_type: explicit known value from the card, else derived from the vehicle type. */
export const deriveLoanType = (explicit: unknown, vehicleType: string | undefined): string | undefined => {
  const e = str(explicit);
  if (e) {
    const norm = e.toLowerCase().replace(/[\s-]+/g, '_');
    if (LOAN_TYPES.includes(norm)) return norm;
  }
  if (vehicleType === 'bike' || vehicleType === 'scooter') return 'two_wheeler';
  if (vehicleType && LOAN_TYPES.includes(vehicleType)) return vehicleType;
  return undefined;
};

type PayMode = LoanDetails['pay_mode'];
export const mapPayMode = (v: unknown): PayMode | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/[\s.-]+/g, '');
  if (['cash', 'காசு', 'ரொக்கம்'].includes(s)) return 'cash';
  if (['online', 'netbanking'].includes(s)) return 'online';
  if (['upi', 'gpay', 'googlepay', 'phonepe', 'paytm'].includes(s)) return 'upi';
  if (['bank', 'neft', 'rtgs', 'imps', 'banktransfer'].includes(s)) return 'bank';
  if (['cheque', 'check', 'chq'].includes(s)) return 'cheque';
  return undefined;
};

export const mapRcStatus = (v: unknown): VehicleDetails['rc_status'] | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'original' || s === 'org') return 'original';
  if (s === 'duplicate' || s === 'dup') return 'duplicate';
  if (['notavailable', 'na', 'norc', 'nil'].includes(s)) return 'not_available';
  return undefined;
};

export const mapRcHolder = (v: unknown): VehicleDetails['rc_holder'] | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'company' || s === 'finance') return 'Company';
  if (s === 'customer' || s === 'party' || s === 'owner') return 'customer';
  if (s === 'thirdparty') return 'third_party';
  if (s === 'pending') return 'pending';
  return undefined;
};

type GovtIdType = CustomerDetails['other_govt_id_type'];
export const mapGovtIdType = (v: unknown): GovtIdType | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'pan' || s === 'pancard') return 'pan_card';
  if (s === 'voter' || s === 'voterid' || s === 'epic') return 'voter_id';
  if (['dl', 'drivinglicense', 'drivinglicence', 'license', 'licence'].includes(s)) return 'driving_license';
  if (s === 'other') return 'other';
  return undefined;
};

// ── Section mappers ──────────────────────────────────────────────────────────
const mapAddress = (a: LedgerAddress | null | undefined): Partial<Addresses> | undefined => {
  if (!a) return undefined;
  const out: Partial<Addresses> = {};
  const keys: Array<keyof Addresses> = ['house_no', 'street', 'street_name', 'village', 'land_mark', 'address', 'city', 'district', 'state'];
  for (const k of keys) {
    const v = str((a as unknown as Record<string, unknown>)[k]);
    if (v) (out as Record<string, string>)[k] = v;
  }
  const pin = str(a.pincode);
  if (pin) {
    const d = tamilToWestern(pin).replace(/\s/g, '');
    if (/^\d{6}$/.test(d)) out.pincode = d;
  }
  return Object.keys(out).length ? out : undefined;
};

const mapContacts = (
  list: LedgerContact[] | null | undefined,
  contactType: 'customer' | 'guardian',
  section: OcrSection,
  warnings: OcrWarning[]
): CustomerContact[] | undefined => {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const out: CustomerContact[] = [];
  const seen = new Set<string>();
  list.forEach((c, i) => {
    const number = cleanMobile(c?.number) || cleanMobile(c?.number_raw);
    if (!number) {
      if (str(c?.number_raw)) {
        warnings.push({ section, field: `contacts[${i}]`, message: `Phone "${c.number_raw}" is not a 10-digit mobile number` });
      }
      return;
    }
    if (seen.has(number)) return;
    seen.add(number);
    const type = c.type === 'landline' || c.type === 'work' ? c.type : 'mobile';
    out.push({ contact_type: contactType, type, number });
  });
  return out.length ? out : undefined;
};

const mapRelation = (
  r: LedgerRelation | null | undefined,
  section: OcrSection,
  field: string,
  warnings: OcrWarning[]
): { value: string; unit: RelationUnit } | undefined => {
  const value = str(r?.value);
  if (!value) return undefined;
  const unit = mapRelationUnit(r?.unit);
  if (!unit && str(r?.unit)) warnings.push({ section, field, message: `Unknown relation "${r?.unit}"; defaulted to S/O, please check` });
  return { value, unit: unit || 'S/O' };
};

const digitsOnly = (v: unknown, len?: number): string | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  const d = tamilToWestern(raw).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(d)) return undefined;
  if (len && d.length !== len) return undefined;
  return d;
};

const setIf = <T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined) => {
  if (value !== undefined) obj[key] = value;
};

/**
 * Map a sanitized ledger_v1 result to partial store objects.
 * Only fields with a usable value are returned; problems become warnings.
 */
export const mapOcrToStore = (result: LedgerV1, loanType: OcrLoanType, now: Date = new Date()): MappedOcr => {
  const warnings: OcrWarning[] = [];
  const customer: Partial<CustomerDetails> = {};
  const vehicle: Partial<VehicleDetails> = {};
  const loan: Partial<LoanDetails> = {};
  const guardian: Partial<GuardianDetails> = {};

  // Customer
  const c = result?.customer;
  if (c) {
    const hpl = digitsOnly(c.hplno);
    if (str(c.hplno) && !hpl) warnings.push({ section: 'customer', field: 'hplno', message: `HPL number "${c.hplno}" is not numeric` });
    setIf(customer, 'hplno', hpl);
    setIf(customer, 'cname', str(c.cname));
    setIf(customer, 'cfname', mapRelation(c.cfname, 'customer', 'cfname', warnings));
    setIf(customer, 'ccontacts', mapContacts(c.ccontacts, 'customer', 'customer', warnings));
    setIf(customer, 'caddress', mapAddress(c.caddress) as Addresses | undefined);
    setIf(customer, 'profession', str(c.profession));
    setIf(customer, 'work_office_address', str(c.work_office_address));
    setIf(customer, 'work_office_phone', digitsOnly(c.work_office_phone));
    const aad = digitsOnly(c.aadhar_id, 12);
    if (str(c.aadhar_id) && !aad) warnings.push({ section: 'customer', field: 'aadhar_id', message: 'Aadhaar is not 12 digits' });
    setIf(customer, 'aadhar_id', aad);
    const idType = mapGovtIdType(c.other_govt_id_type);
    if (str(c.other_govt_id_type) && !idType) warnings.push({ section: 'customer', field: 'other_govt_id_type', message: `Unknown ID type "${c.other_govt_id_type}"` });
    setIf(customer, 'other_govt_id_type', idType);
    setIf(customer, 'other_govt_id_number', str(c.other_govt_id_number));
  }

  // Vehicle (prices are NEVER set from OCR or from the HP amount)
  const v = result?.vehicle;
  let vehicleType: string | undefined;
  if (v) {
    setIf(vehicle, 'vehicleNumber', normalizeVehicleNumber(v.vehicleNumber));
    const brand = str(v.brand);
    const model = str(v.model_name);
    setIf(vehicle, 'brand', brand);
    setIf(vehicle, 'model_name', model);
    setIf(vehicle, 'modelName', model);
    const name = str(v.vehicleName) || (brand || model ? [brand, model].filter(Boolean).join(' ') : undefined);
    setIf(vehicle, 'vehicleName', name);
    const year = digitsOnly(v.manufacture_year, 4);
    if (str(v.manufacture_year) && !year) warnings.push({ section: 'vehicle', field: 'vehicle_modal', message: `Year "${v.manufacture_year}" is not a 4-digit year` });
    setIf(vehicle, 'vehicle_modal', year);
    setIf(vehicle, 'color', str(v.color));
    vehicleType = mapVehicleType(v.type, loanType);
    if (str(v.type) && !vehicleType) warnings.push({ section: 'vehicle', field: 'type', message: `Unknown vehicle type "${v.type}"` });
    setIf(vehicle, 'type', vehicleType);
    const eng = str(v.engine_number);
    setIf(vehicle, 'engine_number', eng ? eng.toUpperCase().replace(/\s+/g, '') : undefined);
    const chs = str(v.chassis_number);
    setIf(vehicle, 'chassis_number', chs ? chs.toUpperCase().replace(/\s+/g, '') : undefined);
    const rcs = mapRcStatus(v.rc_status);
    if (str(v.rc_status) && !rcs) warnings.push({ section: 'vehicle', field: 'rc_status', message: `Unknown RC status "${v.rc_status}"` });
    setIf(vehicle, 'rc_status', rcs);
    const rch = mapRcHolder(v.rc_holder);
    if (str(v.rc_holder) && !rch) warnings.push({ section: 'vehicle', field: 'rc_holder', message: `Unknown RC holder "${v.rc_holder}"` });
    setIf(vehicle, 'rc_holder', rch);
    setIf(vehicle, 'remarks', str(v.remarks));
    if (loanType === 'consulting') vehicle.deal_type = 'consulting';
  }

  // Loan
  const l = result?.loan;
  if (l) {
    setIf(loan, 'loan_type', deriveLoanType(l.loan_type, vehicleType));
    const amountFields: Array<keyof LoanDetails & keyof LedgerV1['loan']> = [
      'hpAmount', 'dueAmount', 'down_payment', 'pay_mode_1_amount', 'net_payment', 'net_payable',
      'penaltyAmount', 'principle_part', 'interest_part', 'hand_loan', 'documentation_charge', 'broker_commission',
    ];
    for (const f of amountFields) {
      const { value, formula } = parseAmount(l[f]);
      if (value !== undefined) (loan as Record<string, unknown>)[f] = value;
      else if (formula) warnings.push({ section: 'loan', field: f, message: `"${l[f]}" is written as a formula; please enter the amount` });
    }
    const due = parseAmount(l.dueMonth);
    if (due.value !== undefined && Number.isInteger(due.value)) loan.dueMonth = due.value;
    const pd = parseAmount(l.penalty_days);
    if (pd.value !== undefined && Number.isInteger(pd.value)) loan.penalty_days = pd.value;
    const rate = parseAmount(l.interestRate);
    if (rate.value !== undefined) loan.interestRate = rate.value; // only when written on the card; never calculated
    const hpDate = toIsoDate(l.hpDate, now);
    if (str(l.hpDate) && !hpDate) warnings.push({ section: 'loan', field: 'hpDate', message: `HP date "${l.hpDate}" is not a full date` });
    setIf(loan, 'hpDate', hpDate);
    const dueDate = toIsoDate(l.due_date, now);
    if (str(l.due_date) && !dueDate) warnings.push({ section: 'loan', field: 'due_date', message: `Due date written as "${l.due_date}"; please pick the full date` });
    setIf(loan, 'due_date', dueDate);
    if (str(l.raw_due_amount_text)) {
      warnings.push({ section: 'loan', field: 'dueAmount', message: `Due amount written as "${l.raw_due_amount_text}"; please enter the installment` });
    }
    const pm = mapPayMode(l.pay_mode);
    if (str(l.pay_mode) && !pm) warnings.push({ section: 'loan', field: 'pay_mode', message: `Unknown pay mode "${l.pay_mode}"` });
    setIf(loan, 'pay_mode', pm);
    const pm1 = mapPayMode(l.pay_mode_1);
    if (str(l.pay_mode_1) && !pm1) warnings.push({ section: 'loan', field: 'pay_mode_1', message: `Unknown pay mode "${l.pay_mode_1}"` });
    setIf(loan, 'pay_mode_1', pm1);
    setIf(loan, 'hand_loan_remarks', str(l.hand_loan_remarks));
    setIf(loan, 'broker_name', str(l.broker_name));
    setIf(loan, 'dealer_name', str(l.dealer_name));
    setIf(loan, 'remarks', str(l.remarks));
  }

  // Guardian
  const g = result?.guardian;
  if (g) {
    setIf(guardian, 'gname', str(g.gname));
    setIf(guardian, 'gfname', mapRelation(g.gfname, 'guardian', 'gfname', warnings));
    setIf(guardian, 'gcontacts', mapContacts(g.gcontacts, 'guardian', 'guardian', warnings));
    setIf(guardian, 'gaddress', mapAddress(g.gaddress) as Addresses | undefined);
    setIf(guardian, 'profession', str(g.profession));
    setIf(guardian, 'work_office_address', str(g.work_office_address));
    setIf(guardian, 'work_office_phone', digitsOnly(g.work_office_phone));
    const aad = digitsOnly(g.aadhar_id, 12);
    if (str(g.aadhar_id) && !aad) warnings.push({ section: 'guardian', field: 'aadhar_id', message: 'Aadhaar is not 12 digits' });
    setIf(guardian, 'aadhar_id', aad);
    const idType = mapGovtIdType(g.other_govt_id_type);
    setIf(guardian, 'other_govt_id_type', idType);
    setIf(guardian, 'other_govt_id_number', str(g.other_govt_id_number));
    setIf(guardian, 'remarks', str(g.remarks));
  }
  if (customer.hplno) guardian.customer_hplno = customer.hplno;

  return { customer, vehicle, loan, guardian, warnings };
};

// ── Apply policy ─────────────────────────────────────────────────────────────
export type ApplyMode = 'fill_empty' | 'overwrite';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof File);

const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || v === 0 || (typeof v === 'string' && v.trim() === '');

const sameValue = (a: unknown, b: unknown) => a === b || (isBlank(a) && isBlank(b));

/** A field is "empty" when blank or still equal to its untouched default value. */
const isEmptyField = (current: unknown, def: unknown): boolean => isBlank(current) || (def !== undefined && sameValue(current, def));

const contactsEmpty = (list: unknown): boolean =>
  !Array.isArray(list) || list.every((c) => !c || isBlank((c as CustomerContact).number));

/**
 * Compute the patch to apply for one section.
 * fill_empty: only fields that are blank or still at their default are filled.
 * overwrite:  every incoming field replaces the current value.
 * Nested objects (address, relation) are merged per sub-field; contact lists are replaced only when empty (fill_empty).
 */
export const computeApplyPatch = <T extends object>(
  current: T,
  incoming: Partial<T>,
  mode: ApplyMode,
  defaults: Partial<T> = {}
): Partial<T> => {
  const patch: Partial<T> = {};
  const cur = current as Record<string, unknown>;
  const def = defaults as Record<string, unknown>;
  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (mode === 'overwrite' || contactsEmpty(cur[key])) (patch as Record<string, unknown>)[key] = value;
      continue;
    }
    if (isPlainObject(value)) {
      const curObj = isPlainObject(cur[key]) ? (cur[key] as Record<string, unknown>) : {};
      const defObj = isPlainObject(def[key]) ? (def[key] as Record<string, unknown>) : {};
      const sub = computeApplyPatch(curObj, value, mode, defObj);
      if (Object.keys(sub).length) (patch as Record<string, unknown>)[key] = { ...curObj, ...sub };
      continue;
    }
    if (mode === 'overwrite' || isEmptyField(cur[key], def[key])) (patch as Record<string, unknown>)[key] = value;
  }
  return patch;
};

/**
 * Apply user-selected uncertain field candidate readings and optional suggested_vehicle
 * onto a deep copy of the LedgerV1 object before running mapOcrToStore.
 */
export const applyLedgerOverrides = (
  base: LedgerV1,
  overrides: Record<string, string>,
  useSuggestedVehicle = false
): LedgerV1 => {
  const clone: LedgerV1 = JSON.parse(JSON.stringify(base));

  if (useSuggestedVehicle && clone.ai_predictions_and_options?.suggested_vehicle) {
    const sv = clone.ai_predictions_and_options.suggested_vehicle;
    if (sv.brand) clone.vehicle.brand = sv.brand;
    if (sv.vehicleName) clone.vehicle.vehicleName = sv.vehicleName;
    if (sv.model_name) clone.vehicle.model_name = sv.model_name;
    if (sv.manufacture_year) clone.vehicle.manufacture_year = sv.manufacture_year;
    if (sv.type) clone.vehicle.type = sv.type;
  }

  for (const [rawPath, chosen] of Object.entries(overrides)) {
    if (!rawPath || chosen === undefined || chosen === '') continue;
    const parts = rawPath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    if (!parts.length) continue;

    let cursor: unknown = clone;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cursor === null || typeof cursor !== 'object') {
        cursor = null;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[parts[i]];
    }
    if (cursor !== null && typeof cursor === 'object') {
      const leaf = parts[parts.length - 1];
      (cursor as Record<string, unknown>)[leaf] = chosen;
      // If user explicitly picked a dueAmount reading, clear raw_due_amount_text if numeric
      if (rawPath === 'loan.dueAmount' && parseAmount(chosen).value !== undefined) {
        clone.loan.raw_due_amount_text = null;
      }
    }
  }

  return clone;
};

export interface OcrApplyRequest {
  targetLoanType: OcrLoanType;
  mode: ApplyMode;
  sections: {
    customer: boolean;
    vehicle: boolean;
    loan: boolean;
    guardian: boolean;
  };
  applyHplno: boolean;
  customer: Partial<CustomerDetails>;
  vehicle: Partial<VehicleDetails>;
  loan: Partial<LoanDetails>;
  guardian: Partial<GuardianDetails>;
}

export interface AtomicApplyStoreSlice {
  customer: CustomerDetails;
  vehicle: VehicleDetails;
  loan: LoanDetails;
  guardian: GuardianDetails;
  completedSteps: number[];
}

export interface AtomicApplyDefaults {
  customer: Partial<CustomerDetails>;
  guardian: Partial<GuardianDetails>;
  vehicle: Record<OcrLoanType, Partial<VehicleDetails>>;
  loan: Record<OcrLoanType, Partial<LoanDetails>>;
}

export interface AtomicApplyResult {
  loanType: OcrLoanType;
  switchedLoanType: boolean;
  customerPatch: Partial<CustomerDetails>;
  vehiclePatch: Partial<VehicleDetails>;
  loanPatch: Partial<LoanDetails>;
  guardianPatch: Partial<GuardianDetails>;
  completedSteps: number[];
}

/**
 * Pure atomic apply computation across Step 1 (customer), Step 2 (vehicle + loan), and Step 3 (guardian).
 * Handles switching loanType without losing Step 1/3 data and without racing mode defaults.
 */
export const buildAtomicApplyPatch = (
  currentStore: AtomicApplyStoreSlice,
  currentLoanType: OcrLoanType,
  req: OcrApplyRequest,
  defaults: AtomicApplyDefaults
): AtomicApplyResult => {
  const switchedLoanType = req.targetLoanType !== currentLoanType;

  // Step 1: Customer
  let customerPatch: Partial<CustomerDetails> = {};
  if (req.sections.customer) {
    const incomingCustomer: Partial<CustomerDetails> = { ...req.customer };
    if (!req.applyHplno) {
      delete incomingCustomer.hplno;
    }
    customerPatch = computeApplyPatch(currentStore.customer, incomingCustomer, req.mode, defaults.customer);
  }

  const effectiveHplno =
    customerPatch.hplno !== undefined ? customerPatch.hplno : currentStore.customer.hplno;

  // Step 3: Guardian
  let guardianPatch: Partial<GuardianDetails> = {};
  if (req.sections.guardian) {
    const incomingGuardian: Partial<GuardianDetails> = { ...req.guardian };
    if (!req.applyHplno) {
      delete incomingGuardian.customer_hplno;
    }
    guardianPatch = computeApplyPatch(currentStore.guardian, incomingGuardian, req.mode, defaults.guardian);
  }
  if (effectiveHplno && (req.sections.guardian || req.applyHplno)) {
    guardianPatch.customer_hplno = effectiveHplno;
  }

  // Step 2: Vehicle & Loan
  const targetVehDefaults = defaults.vehicle[req.targetLoanType];
  const targetLoanDefaults = defaults.loan[req.targetLoanType];

  let vehiclePatch: Partial<VehicleDetails> = {};
  let loanPatch: Partial<LoanDetails> = {};

  if (switchedLoanType) {
    // Switching loan type resets Step 2 to target defaults first, then overlays selected OCR sections
    vehiclePatch = req.sections.vehicle
      ? {
          ...targetVehDefaults,
          ...computeApplyPatch(targetVehDefaults as VehicleDetails, req.vehicle, 'overwrite', targetVehDefaults),
        }
      : { ...targetVehDefaults };
    loanPatch = req.sections.loan
      ? {
          ...targetLoanDefaults,
          ...computeApplyPatch(targetLoanDefaults as LoanDetails, req.loan, 'overwrite', targetLoanDefaults),
        }
      : { ...targetLoanDefaults };
  } else {
    if (req.sections.vehicle) {
      vehiclePatch = computeApplyPatch(currentStore.vehicle, req.vehicle, req.mode, targetVehDefaults);
    }
    if (req.sections.loan) {
      loanPatch = computeApplyPatch(currentStore.loan, req.loan, req.mode, targetLoanDefaults);
    }
  }

  const step2Touched = switchedLoanType || req.sections.vehicle || req.sections.loan;
  const completedSteps = step2Touched
    ? currentStore.completedSteps.filter((s) => s !== 2)
    : [...currentStore.completedSteps];

  return {
    loanType: req.targetLoanType,
    switchedLoanType,
    customerPatch,
    vehiclePatch,
    loanPatch,
    guardianPatch,
    completedSteps,
  };
};



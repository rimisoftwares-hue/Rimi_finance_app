// Voucher Type Master + Rule Engine (Tally Prime style)
// Frontend definitions used by the Voucher Entry / Register screens.

export type VoucherNature =
  | "Receipt"
  | "Payment"
  | "Contra"
  | "Journal"
  | "Sales"
  | "Purchase"
  | "Special";

export type EntryType = "Dr" | "Cr";

export interface VoucherRuleLine {
  type: EntryType;
  /** Allowed ledger groups for this side */
  allowed: string[];
  /** Hint shown to user */
  hint: string;
  optional?: boolean;
}

export interface VoucherTypeMaster {
  id: number | string;
  name: string;
  code: string;            // short code used as prefix
  nature: VoucherNature;
  affects_cash_flow: boolean;
  affects_profit_loss: boolean;
  system_type: boolean;    // built-in, cannot delete
  is_active: boolean;
  /** Predefined Dr/Cr rule */
  rule: VoucherRuleLine[];
  /** Business module that auto-creates this voucher */
  auto_source?: "payments" | "loans" | "vehicle_expenses" | "office_expenses";
  description: string;
  dbId?: string;
}

export const VOUCHER_TYPES: VoucherTypeMaster[] = [
  {
    id: 1, name: "Receipt", code: "REC", nature: "Receipt",
    affects_cash_flow: true, affects_profit_loss: false, system_type: true, is_active: true,
    description: "Money In",
    rule: [
      { type: "Dr", allowed: ["Cash", "Bank"], hint: "Cash / Bank" },
      { type: "Cr", allowed: ["Customer", "Income"], hint: "Customer / Income" },
    ],
  },
  {
    id: 2, name: "Payment", code: "PAY", nature: "Payment",
    affects_cash_flow: true, affects_profit_loss: false, system_type: true, is_active: true,
    description: "Money Out",
    auto_source: "office_expenses",
    rule: [
      { type: "Dr", allowed: ["Expense", "Vendor"], hint: "Expense / Vendor" },
      { type: "Cr", allowed: ["Cash", "Bank"], hint: "Cash / Bank" },
    ],
  },
  {
    id: 3, name: "Contra", code: "CON", nature: "Contra",
    affects_cash_flow: false, affects_profit_loss: false, system_type: true, is_active: true,
    description: "Cash ↔ Bank Transfer",
    rule: [
      { type: "Dr", allowed: ["Cash", "Bank"], hint: "Cash / Bank" },
      { type: "Cr", allowed: ["Cash", "Bank"], hint: "Cash / Bank" },
    ],
  },
  {
    id: 4, name: "Journal", code: "JRN", nature: "Journal",
    affects_cash_flow: false, affects_profit_loss: true, system_type: true, is_active: true,
    description: "Adjustments",
    rule: [
      { type: "Dr", allowed: ["*"], hint: "Any ledger" },
      { type: "Cr", allowed: ["*"], hint: "Any ledger" },
    ],
  },
  {
    id: 5, name: "Sales", code: "SAL", nature: "Sales",
    affects_cash_flow: false, affects_profit_loss: true, system_type: true, is_active: true,
    description: "Vehicle Sale Invoice",
    rule: [
      { type: "Dr", allowed: ["Customer"], hint: "Customer" },
      { type: "Cr", allowed: ["Sales Income"], hint: "Sales Income" },
    ],
  },
  {
    id: 6, name: "Purchase", code: "PUR", nature: "Purchase",
    affects_cash_flow: false, affects_profit_loss: false, system_type: true, is_active: true,
    description: "Vehicle Purchase",
    rule: [
      { type: "Dr", allowed: ["Vehicle", "Asset"], hint: "Vehicle / Asset" },
      { type: "Cr", allowed: ["Vendor", "Cash", "Bank"], hint: "Vendor / Cash / Bank" },
    ],
  },
  {
    id: 7, name: "Debit Note", code: "DRN", nature: "Special",
    affects_cash_flow: false, affects_profit_loss: true, system_type: true, is_active: true,
    description: "Additional Charges (Dr)",
    rule: [
      { type: "Dr", allowed: ["Customer", "Expense"], hint: "Customer / Expense Adjustment" },
      { type: "Cr", allowed: ["Adjustment"], hint: "Adjustment Ledger" },
    ],
  },
  {
    id: 8, name: "Credit Note", code: "CRN", nature: "Special",
    affects_cash_flow: false, affects_profit_loss: true, system_type: true, is_active: true,
    description: "Reductions / Discounts (Cr)",
    rule: [
      { type: "Dr", allowed: ["Adjustment"], hint: "Adjustment Ledger" },
      { type: "Cr", allowed: ["Customer", "Income"], hint: "Customer / Income" },
    ],
  },
  {
    id: 9, name: "Loan Disbursement", code: "LOAN", nature: "Special",
    affects_cash_flow: true, affects_profit_loss: false, system_type: true, is_active: true,
    description: "Loan given to customer",
    auto_source: "loans",
    rule: [
      { type: "Dr", allowed: ["Customer"], hint: "Customer Ledger" },
      { type: "Cr", allowed: ["Cash", "Bank"], hint: "Cash / Bank" },
    ],
  },
  {
    id: 10, name: "Loan Repayment", code: "EMI", nature: "Special",
    affects_cash_flow: true, affects_profit_loss: true, system_type: true, is_active: true,
    description: "EMI received",
    auto_source: "payments",
    rule: [
      { type: "Dr", allowed: ["Cash", "Bank"], hint: "Cash / Bank" },
      { type: "Cr", allowed: ["Customer"], hint: "Customer Ledger (Principal)" },
      { type: "Cr", allowed: ["Interest Income"], hint: "Interest Income", optional: true },
    ],
  },
  {
    id: 11, name: "Vehicle Expense", code: "VEX", nature: "Special",
    affects_cash_flow: true, affects_profit_loss: false, system_type: true, is_active: true,
    description: "Cost added to vehicle",
    auto_source: "vehicle_expenses",
    rule: [
      { type: "Dr", allowed: ["Vehicle"], hint: "Vehicle Ledger" },
      { type: "Cr", allowed: ["Cash", "Bank"], hint: "Cash / Bank" },
    ],
  },
];

/** Ledger group registry — used to validate Dr/Cr placement */
export const LEDGER_GROUPS: Record<string, string> = {
  "Cash": "Cash",
  "SBI Current A/c": "Bank",
  "HDFC Bank": "Bank",
  "Rajesh Kumar": "Customer",
  "Priya Devi": "Customer",
  "Suresh Vehicle Loan": "Customer",
  "ABC Suppliers": "Vendor",
  "XYZ Motors": "Vendor",
  "Office Rent": "Expense",
  "Staff Salary": "Expense",
  "Telephone Expense": "Expense",
  "Electricity": "Expense",
  "Stationery": "Expense",
  "Vehicle Insurance": "Expense",
  "Interest Income": "Interest Income",
  "Sales Income": "Sales Income",
  "Capital – Partner A": "Capital",
  "Furniture & Fixtures": "Asset",
  "Vehicle - TN09 AB 1234": "Vehicle",
  "Vehicle - TN10 CD 5678": "Vehicle",
  "Sundry Debtors": "Customer",
  "Sundry Creditors": "Vendor",
  "Discount Adjustment": "Adjustment",
  "Charges Adjustment": "Adjustment",
};

export const ALL_LEDGERS = Object.keys(LEDGER_GROUPS);

/** Returns ledgers allowed for a given rule-line */
export function ledgersForRule(allowed: string[]): string[] {
  if (allowed.includes("*")) return ALL_LEDGERS;
  return ALL_LEDGERS.filter(l => allowed.includes(LEDGER_GROUPS[l]));
}

/** Tally-style numbering: PREFIX/YYYY/NNN */
export function generateVoucherNumber(code: string, sequence: number, date: Date = new Date()) {
  return `${code}/${date.getFullYear()}/${String(sequence).padStart(3, "0")}`;
}

/** STRICT validation: Dr must equal Cr and ledgers must be set */
export interface ValidationResult { ok: boolean; error?: string; }
export function validateEntries(
  lines: { type: EntryType; ledger: string; amount: number }[],
  opts?: { allowFutureDate?: boolean; date?: Date }
): ValidationResult {
  if (lines.some(l => !l.ledger)) return { ok: false, error: "Mandatory ledger missing" };
  const dr = lines.filter(l => l.type === "Dr").reduce((s, l) => s + l.amount, 0);
  const cr = lines.filter(l => l.type === "Cr").reduce((s, l) => s + l.amount, 0);
  if (dr <= 0 || cr <= 0) return { ok: false, error: "Amount must be greater than zero" };
  if (Math.round((dr - cr) * 100) !== 0) return { ok: false, error: `Dr ≠ Cr (diff ₹${Math.abs(dr - cr)})` };
  if (opts && !opts.allowFutureDate && opts.date && opts.date.getTime() > Date.now()) {
    return { ok: false, error: "Future date not allowed" };
  }
  return { ok: true };
}

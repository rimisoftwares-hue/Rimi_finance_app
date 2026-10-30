// Mock accounting engine: generates vouchers, monthly summaries, analyses
// All amounts are deterministic per ledger so drill-down feels consistent.

export const MONTHS = [
  "April","May","June","July","August","September",
  "October","November","December","January","February","March",
];

export const VOUCHER_TYPES = [
  { code: "REC", name: "Receipt", nature: "Cr" as const },
  { code: "PAY", name: "Payment", nature: "Dr" as const },
  { code: "JNL", name: "Journal", nature: "Dr" as const },
  { code: "CON", name: "Contra", nature: "Dr" as const },
  { code: "SAL", name: "Sales", nature: "Cr" as const },
  { code: "PUR", name: "Purchase", nature: "Dr" as const },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface MonthlyRow {
  month: string;
  debit: number;
  credit: number;
  closing: number;
  vouchers: number;
}

export function getLedgerMonthly(ledger: string, opening = 0): MonthlyRow[] {
  const seed = hash(ledger);
  let running = opening;
  return MONTHS.map((m, i) => {
    const d = ((seed + i * 7) % 9 + 1) * 5000 + (seed % 1000);
    const c = ((seed + i * 11) % 8 + 1) * 4500 + (seed % 800);
    running += d - c;
    return { month: m, debit: d, credit: c, closing: running, vouchers: ((seed + i) % 6) + 2 };
  });
}

export interface VoucherSummary {
  no: string;
  date: string;
  type: string;
  typeCode: string;
  party: string;
  narration: string;
  amount: number;
  drLedger: string;
  crLedger: string;
}

const PARTIES = ["Rajesh Kumar","Priya Devi","Suresh Babu","Arun Prakash","Deepa Kumari","Manoj Singh","ABC Suppliers","XYZ Traders"];
const NARRS = ["Being EMI collected","Being payment made","Being expense booked","Being adjustment entry","Being interest charged","Being charges collected"];

export function getVouchersForMonth(ledger: string, month: string, typeCode?: string): VoucherSummary[] {
  const seed = hash(ledger + month);
  const monthIdx = MONTHS.indexOf(month);
  const baseYear = monthIdx < 9 ? 2025 : 2026;
  const monthNum = ((monthIdx + 3) % 12) + 1;
  const types = typeCode ? VOUCHER_TYPES.filter(t => t.code === typeCode) : VOUCHER_TYPES;
  const out: VoucherSummary[] = [];
  types.forEach((t, ti) => {
    const count = ((seed + ti) % 4) + 2;
    for (let i = 0; i < count; i++) {
      const idx = (seed + ti * 13 + i * 17) % 1000;
      out.push({
        no: `${t.code}/${baseYear}/${String(100 + (seed + ti * 7 + i) % 900).padStart(3, "0")}`,
        date: `${baseYear}-${String(monthNum).padStart(2, "0")}-${String(((seed + i * 3) % 27) + 1).padStart(2, "0")}`,
        type: t.name,
        typeCode: t.code,
        party: PARTIES[(seed + i) % PARTIES.length],
        narration: NARRS[(seed + ti + i) % NARRS.length],
        amount: ((idx % 9) + 1) * 1500 + (seed % 500),
        drLedger: t.nature === "Dr" ? ledger : PARTIES[(seed + i) % PARTIES.length],
        crLedger: t.nature === "Cr" ? ledger : PARTIES[(seed + i + 1) % PARTIES.length],
      });
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface VoucherDetail extends VoucherSummary {
  reference: string;
  costCentre: string;
  branch: string;
  employee: string;
  agent: string;
  vehicle?: string;
  scheme?: string;
  loanAccount?: string;
  createdBy: string;
  createdAt: string;
  modifiedBy?: string;
  modifiedAt?: string;
  approval: "Approved" | "Pending" | "Draft";
  entries: { ledger: string; debit: number; credit: number }[];
}

export function getVoucherDetail(v: VoucherSummary): VoucherDetail {
  const seed = hash(v.no);
  return {
    ...v,
    reference: `REF-${(seed % 9000) + 1000}`,
    costCentre: ["Head Office","Branch-1","Branch-2","Field Ops"][seed % 4],
    branch: ["Chennai","Madurai","Coimbatore","Trichy"][seed % 4],
    employee: ["Karthik","Vimal","Suresh","Ravi"][seed % 4],
    agent: ["Mohan","Ganesh","Anbu","Selva"][seed % 4],
    vehicle: v.type.includes("Loan") || seed % 3 === 0 ? `TN${(seed % 99) + 1}AB${(seed % 9000) + 1000}` : undefined,
    scheme: ["Gold","Vehicle","Personal"][seed % 3],
    loanAccount: seed % 2 === 0 ? `LN-${(seed % 9000) + 1000}` : undefined,
    createdBy: ["accountant1","admin","clerk2"][seed % 3],
    createdAt: `${v.date} 10:${String((seed % 50) + 10)}:00`,
    modifiedBy: seed % 3 === 0 ? "supervisor" : undefined,
    modifiedAt: seed % 3 === 0 ? `${v.date} 14:22:10` : undefined,
    approval: (["Approved","Approved","Approved","Pending","Draft"] as const)[seed % 5],
    entries: [
      { ledger: v.drLedger, debit: v.amount, credit: 0 },
      { ledger: v.crLedger, debit: 0, credit: v.amount },
    ],
  };
}

export function getLedgerAnalysis(ledger: string) {
  const rows = getLedgerMonthly(ledger);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const vouchers = rows.reduce((s, r) => s + r.vouchers, 0);
  const all: number[] = [];
  rows.forEach(r => { for (let i = 0; i < r.vouchers; i++) all.push(((hash(ledger + r.month + i) % 9) + 1) * 1500); });
  return {
    opening: 0,
    totalDebit,
    totalCredit,
    netMovement: totalDebit - totalCredit,
    closing: totalDebit - totalCredit,
    vouchers,
    avg: vouchers ? Math.round((totalDebit + totalCredit) / vouchers) : 0,
    largest: Math.max(...all, 0),
    smallest: Math.min(...all, 0),
  };
}

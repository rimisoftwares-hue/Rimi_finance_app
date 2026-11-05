// frontend/src/types/daybook.ts

export interface DayBookRow {
  voucherId: string;
  date: string;
  voucherType: string;
  typeCode: string;
  voucherNumber: string;
  narration: string;
  party: string;
  ledgerNames: string[];
  credit: number;
  debit: number;
  balance: number;
}

export interface DayBookTransactionsResponse {
  from: string;
  to: string;
  openingBalance: number;
  totalCredit: number;
  totalDebit: number;
  closingBalance: number;
  rows: DayBookRow[];
}

export interface VoucherEntryItem {
  ledger: string;
  debit: number;
  credit: number;
}

export interface VoucherDetailData {
  id?: string;
  no: string;
  date: string;
  type: string;
  typeCode: string;
  party: string;
  narration: string;
  amount: number;
  totalDebit?: number;
  totalCredit?: number;
  drLedger?: string;
  crLedger?: string;
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
  entries: VoucherEntryItem[];
}

export interface MonthlyRowData {
  month: string;
  monthKey: string;
  debit: number;
  credit: number;
  closing: number;
  vouchers: number;
}

export interface LedgerMonthlyAnalysisData {
  opening: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  closing: number;
  vouchers: number;
  monthlyVoucherSum: number;
  avg: number;
  largest: number;
  smallest: number;
}

export interface LedgerMonthlyResponse {
  ledger: string;
  nature: string;
  financialYear: string;
  opening: number;
  closing: number;
  totalDebit: number;
  totalCredit: number;
  rows: MonthlyRowData[];
  analysis: LedgerMonthlyAnalysisData;
}

export interface MonthVoucherTypeItem {
  code: string;
  name: string;
  nature: "Dr" | "Cr";
  count: number;
  amount: number;
}

export interface MonthVoucherTypesResponse {
  ledger: string;
  monthKey: string;
  month: string;
  types: MonthVoucherTypeItem[];
}

export interface MonthVoucherRegisterItem {
  no: string;
  date: string;
  type: string;
  typeCode: string;
  party: string;
  narration: string;
  amount: number;
  drLedger?: string;
  crLedger?: string;
}

export type VoucherSummary = MonthVoucherRegisterItem;

export interface MonthVouchersResponse {
  ledger: string;
  monthKey: string;
  month: string;
  typeCode: string;
  vouchers: MonthVoucherRegisterItem[];
}

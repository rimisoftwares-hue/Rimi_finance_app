// Predefined default Tally-style ledger group names used as auto-suggestions
// in the "Under (Parent Group)" combobox across the application.

export interface PredefinedGroup {
  id: number;
  name: string;
  nature: "Assets" | "Liabilities" | "Income" | "Expenses";
}

export const PREDEFINED_GROUPS: PredefinedGroup[] = [
  { id: 1, name: "Capital Account", nature: "Liabilities" },
  { id: 2, name: "Loans (Liability)", nature: "Liabilities" },
  { id: 3, name: "Current Liabilities", nature: "Liabilities" },
  { id: 4, name: "Branch / Divisions", nature: "Liabilities" },
  { id: 5, name: "Suspense A/c", nature: "Liabilities" },
  { id: 6, name: "Fixed Assets", nature: "Assets" },
  { id: 7, name: "Investments", nature: "Assets" },
  { id: 8, name: "Current Assets", nature: "Assets" },
  { id: 9, name: "Misc. Expenses (Asset)", nature: "Assets" },
  { id: 10, name: "Sales Accounts", nature: "Income" },
  { id: 11, name: "Direct Income", nature: "Income" },
  { id: 12, name: "Indirect Income", nature: "Income" },
  { id: 13, name: "Purchase Accounts", nature: "Expenses" },
  { id: 14, name: "Direct Expenses", nature: "Expenses" },
  { id: 15, name: "Indirect Expenses", nature: "Expenses" },
  { id: 16, name: "Reserves & Surplus", nature: "Liabilities" },
  { id: 17, name: "Partners Capital A/c", nature: "Liabilities" },
  { id: 18, name: "Partners Loan A/c", nature: "Liabilities" },
  { id: 19, name: "Secured Loans", nature: "Liabilities" },
  { id: 20, name: "Unsecured Loans", nature: "Liabilities" },
  { id: 21, name: "Bank OD Accounts", nature: "Liabilities" },
  { id: 22, name: "Sundry Creditors", nature: "Liabilities" },
  { id: 23, name: "Duties & Taxes", nature: "Liabilities" },
  { id: 24, name: "Provisions", nature: "Liabilities" },
  { id: 25, name: "Advance Received", nature: "Liabilities" },
  { id: 26, name: "Sundry Debtors", nature: "Assets" },
  { id: 27, name: "Cash in Hand", nature: "Assets" },
  { id: 28, name: "Bank Accounts", nature: "Assets" },
];
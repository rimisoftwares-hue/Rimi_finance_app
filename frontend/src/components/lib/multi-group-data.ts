export type Nature = "Assets" | "Liabilities" | "Income" | "Expenses";

export interface ParentGroup {
  name: string;
  nature: Nature;
  source: "system" | "custom";
}

export const SEED_PARENTS: ParentGroup[] = [
  { name: "Primary", nature: "Liabilities", source: "system" },
  { name: "Capital Account", nature: "Liabilities", source: "system" },
  { name: "Loans (Liability)", nature: "Liabilities", source: "system" },
  { name: "Current Liabilities", nature: "Liabilities", source: "system" },
  { name: "Sundry Creditors", nature: "Liabilities", source: "system" },
  { name: "Duties & Taxes", nature: "Liabilities", source: "system" },
  { name: "Provisions", nature: "Liabilities", source: "system" },
  { name: "Fixed Assets", nature: "Assets", source: "system" },
  { name: "Current Assets", nature: "Assets", source: "system" },
  { name: "Investments", nature: "Assets", source: "system" },
  { name: "Bank Accounts", nature: "Assets", source: "system" },
  { name: "Cash-in-Hand", nature: "Assets", source: "system" },
  { name: "Sundry Debtors", nature: "Assets", source: "system" },
  { name: "Stock-in-Hand", nature: "Assets", source: "system" },
  { name: "Loans & Advances (Asset)", nature: "Assets", source: "system" },
  { name: "Sales Accounts", nature: "Income", source: "system" },
  { name: "Direct Incomes", nature: "Income", source: "system" },
  { name: "Indirect Incomes", nature: "Income", source: "system" },
  { name: "Purchase Accounts", nature: "Expenses", source: "system" },
  { name: "Direct Expenses", nature: "Expenses", source: "system" },
  { name: "Indirect Expenses", nature: "Expenses", source: "system" },
];

export interface ExistingGroup {
  id: number;
  name: string;
  alias: string;
  parent: string;
  nature: Nature;
}

// Demo existing user-created groups (in a real app these come from the DB).
export const EXISTING_GROUPS: ExistingGroup[] = [
  { id: 101, name: "Local Debtors",      alias: "LD",  parent: "Sundry Debtors",     nature: "Assets" },
  { id: 102, name: "Export Debtors",     alias: "ED",  parent: "Sundry Debtors",     nature: "Assets" },
  { id: 103, name: "Domestic Creditors", alias: "DC",  parent: "Sundry Creditors",   nature: "Liabilities" },
  { id: 104, name: "Foreign Creditors",  alias: "FC",  parent: "Sundry Creditors",   nature: "Liabilities" },
  { id: 105, name: "Petty Cash",         alias: "",    parent: "Cash-in-Hand",       nature: "Assets" },
  { id: 106, name: "Main Cash",          alias: "",    parent: "Cash-in-Hand",       nature: "Assets" },
  { id: 107, name: "HDFC Current A/c",   alias: "",    parent: "Bank Accounts",      nature: "Assets" },
  { id: 108, name: "ICICI Current A/c",  alias: "",    parent: "Bank Accounts",      nature: "Assets" },
  { id: 109, name: "Office Rent",        alias: "",    parent: "Indirect Expenses",  nature: "Expenses" },
  { id: 110, name: "Salaries",           alias: "",    parent: "Indirect Expenses",  nature: "Expenses" },
  { id: 111, name: "Freight Inward",     alias: "",    parent: "Direct Expenses",    nature: "Expenses" },
  { id: 112, name: "GST Payable",        alias: "",    parent: "Duties & Taxes",     nature: "Liabilities" },
  { id: 113, name: "TDS Payable",        alias: "",    parent: "Duties & Taxes",     nature: "Liabilities" },
];

/** Returns the list of parent-group names that have at least one existing group under them. */
export function parentsWithExisting(): string[] {
  const set = new Set(EXISTING_GROUPS.map(g => g.parent));
  return SEED_PARENTS.map(p => p.name).filter(n => set.has(n));
}

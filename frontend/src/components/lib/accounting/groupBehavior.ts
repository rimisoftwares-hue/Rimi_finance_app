// Tally-style group behavior inference

export type DrCr = "Dr" | "Cr";

const DR_GROUPS = [
  "current assets", "fixed assets", "bank accounts", "cash-in-hand", "cash in hand",
  "sundry debtors", "purchase accounts", "loans & advances (asset)", "investments",
  "stock-in-hand", "deposits (asset)", "misc. expenses (asset)",
  "direct expense", "direct expenses", "indirect expense", "indirect expenses",
];

const CR_GROUPS = [
  "capital account", "loans (liability)", "current liabilities", "sundry creditors",
  "sales accounts", "direct income", "indirect income", "bank od a/c",
  "secured loans", "unsecured loans", "duties & taxes", "provisions",
  "branch / divisions", "suspense a/c",
];

export function defaultDrCrFor(group: string): DrCr {
  const g = (group || "").trim().toLowerCase();
  if (CR_GROUPS.some(x => g.includes(x))) return "Cr";
  if (DR_GROUPS.some(x => g.includes(x))) return "Dr";
  return "Dr";
}

export function isSundryGroup(group: string): boolean {
  const g = (group || "").trim().toLowerCase();
  return g === "sundry debtors" || g === "sundry creditors";
}

export function natureOf(group: string): "Assets" | "Liabilities" | "Income" | "Expenses" {
  const g = (group || "").trim().toLowerCase();
  if (g.includes("income")) return "Income";
  if (g.includes("expense")) return "Expenses";
  if (CR_GROUPS.some(x => g.includes(x))) return "Liabilities";
  return "Assets";
}

// Sub-dialog inference for Tally-style auto-prompts
export type ConfigDialogKind =
  | "billwise"
  | "bank"
  | "gst"
  | "tds"
  | "tcs"
  | "costcentre"
  | "costCentre"
  | "payroll"
  | "inventory"
  | "interest"
  | "asset"
  | "loan"
  | null;

export interface FeatureFlags {
  billwise?: boolean;
  banking?: boolean;
  gst?: boolean;
  tds?: boolean;
  tcs?: boolean;
  costCentres?: boolean;
  costCentre?: boolean;
  payroll?: boolean;
  inventory?: boolean;
  interest?: boolean;
  assetInfo?: boolean;
  loanInfo?: boolean;
}

const BANK_GROUPS = ["bank accounts", "bank od a/c"];
const DUTIES_GROUPS = ["duties & taxes"];
const LOAN_GROUPS = ["loans (liability)", "secured loans", "unsecured loans", "loans & advances (asset)"];
const ASSET_GROUPS = ["fixed assets"];

export function isBankGroup(group: string): boolean {
  const g = (group || "").trim().toLowerCase();
  return BANK_GROUPS.some(x => g.includes(x));
}

export function isDutiesTaxesGroup(group: string): boolean {
  const g = (group || "").trim().toLowerCase();
  return DUTIES_GROUPS.some(x => g.includes(x));
}

export function isLoanGroup(group: string): boolean {
  const g = (group || "").trim().toLowerCase();
  return LOAN_GROUPS.some(x => g.includes(x));
}

export function isFixedAssetGroup(group: string): boolean {
  const g = (group || "").trim().toLowerCase();
  return ASSET_GROUPS.some(x => g.includes(x));
}

export function dialogForGroup(
  group: string,
  opening: number,
  flags: FeatureFlags = {}
): ConfigDialogKind {
  if (isSundryGroup(group)) return flags.billwise !== false && opening > 0 ? "billwise" : null;
  if (isBankGroup(group) && flags.banking !== false) return "bank";
  if (isDutiesTaxesGroup(group) && flags.gst !== false) return "gst";
  if (isFixedAssetGroup(group) && flags.assetInfo !== false) return "asset";
  if (isLoanGroup(group) && flags.loanInfo !== false) return "loan";
  return null;
}


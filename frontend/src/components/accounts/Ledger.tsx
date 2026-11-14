import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ChevronDown, ChevronRight, Settings, Save,
  Eye, ArrowLeft, ArrowRight, Building2, Calendar, LayoutList,
  TreePine, RefreshCw, FileText, Layers,
} from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Skeleton } from "../ui/skeleton";
import { toast } from "sonner";
import { MultiLedger, MultiLedgerSelector, MultiRow, SelectorChoice } from "../multiCreation/MultiLedger";
import { AdvancedLedgerFormPanel, AdvancedLedgerForm, UnderGroupOption } from "../accounts/AdvancedLedgerDialog";
import { ConfigDialog, ConfigProvider, useConfig } from "./ConfigDialog";
import {
  getUnderDropdown,
  getLedgers as apiGetLedgers,
  createLedger as apiCreateLedger,
  updateLedger as apiUpdateLedger,
  multiCreateLedger as apiMultiCreateLedger,
  getRecentledgers,
  Recentledger,
  getLedgerDetails as apiGetLedgerDetails,
  getLedgerStatement as apiGetLedgerStatement,
  getLedgerSummary as apiGetLedgerSummary,
  getLedgerMonthly as apiGetLedgerMonthly,
  getLedgerViewDetails as apiGetLedgerViewDetails,
  getCurrentFYRange,
  getFinancialYear,
  LedgerDetails,
  LedgerStatement,
  LedgerSummary,
  LedgerMonthlyResponse,
  LedgerViewDetailRow,
  UnderDropdownItem,
  type Ledger,
} from "../../api/accounting";
import { useAuth } from "@/contexts/AuthContext";
import { RecentActivityCard, RecentActivityItem } from "./RecentActivityCard";
import { RecentlyCreatedCard, RecentlyCreatedItem } from "./RecentlyCreatedCard";

/** Maps the Advanced Ledger form (UI field names) onto the create/update
 *  ledger API payload (DB column / form-comment names). The "Under" group
 *  is sent as { under_id, under_source } only — the backend resolves this
 *  into the mutually-exclusive group_id / master_group_id columns. */
function ledgerFormToPayload(l: AdvancedLedgerForm) {
  if (!l.groupId || !l.groupSource) {
    throw new Error('Select a valid "Under" group before saving');
  }
  return {
    ledger_name: l.name.trim(),
    alias: l.alias || null,
    alias_regional: l.aliasRegional || null,
    under_id: l.groupId,
    under_source: l.groupSource,
    reporting_under: l.reportingUnder || null,
    inactive: l.inactive ? 1 : 0,
    opening_balance: parseFloat(l.openingBalance) || 0,
    ob_type: l.drCr,
    effective_date: l.effectiveDate || null,
    freeze_balance: l.freezeBalance ? 1 : 0,
    inv_values_affected: l.inventoryAffected ? 1 : 0,
    type_of_ledger: l.typeOfLedger || "Not Applicable",
    rounding_method: l.roundingMethod || "Not Applicable",
    rounding_limit: parseFloat(l.roundingLimit) || 0,
    method_to_allocate: l.methodToAllocate ? 1 : 0,
    is_additional_cost: l.useAsAdditionalCost ? 1 : 0,
    cost_centre_applicable: l.maintainCostCenters ? 1 : 0,
    cost_centre_allocation: l.costCentreAllocation ? 1 : 0,
    ledger_flushing_method: l.ledgerFlushingMethod || "Default",
    include_in_buyer_ledger: l.includeInBuyerLedger ? 1 : 0,
    include_in_seller_ledger: l.includeInSellerLedger ? 1 : 0,

    // Bill-wise
    maintainBillWise: l.maintainBillWise,
    defaultCreditPeriod: l.defaultCreditPeriod,
    checkCreditDaysDuringEntry: l.checkCreditDaysDuringEntry,

    // Mailing
    showMailingDetails: l.showMailingDetails,
    mailingName: l.mailingName, addr1: l.addr1, addr2: l.addr2, addr3: l.addr3, addr4: l.addr4,
    city: l.city, district: l.district, state: l.state, pincode: l.pincode, country: l.country,
    provideContactDetails: l.provideContactDetails, contactPerson: l.contactPerson,
    telephone: l.telephone, mobile: l.mobile, primaryMobile: l.primaryMobile,
    email: l.email, website: l.website,

    // Banking
    provideBankDetails: l.provideBankDetails, accountHolderName: l.accountHolderName,
    bankName: l.bankName, accountNumber: l.accountNumber, ifsc: l.ifsc, swift: l.swift,
    branch: l.branch, accountType: l.accountType,
    bankTransactionTypes: l.bankTransactionTypes,
    txnConfigs: l.txnConfigs,

    // Tax Registration & Deductions
    panIt: l.panIt, gstin: l.gstin, registrationType: l.registrationType,
    assesseeOtherTerritory: l.assesseeOtherTerritory,
    territory: l.territory,
    tanNumber: l.tanNumber,
    deductorCategory: l.deductorCategory,
    collectionAccountNo: l.collectionAccountNo,
    taxType: l.taxType,
    deducteeType: l.deducteeType,
    buyerType: l.buyerType,

    // Statutory
    msmeRegistered: l.msmeRegistered, udyamNumber: l.udyamNumber,
    einvoiceApplicable: l.einvoiceApplicable, defaultSupplyType: l.defaultSupplyType,
    ewayBillApplicable: l.ewayBillApplicable, defaultTransportMode: l.defaultTransportMode,
    defaultDistance: l.defaultDistance,

    // Tax Config (GST)
    isGstApplicable: l.isGstApplicable,
    setAlterGst: l.setAlterGst,
    gstDescription: l.gstDescription,
    gstApplicableFrom: l.gstApplicableFrom,
    gstHsnSacCode: l.gstHsnSacCode,
    gstTypeOfSupply: l.gstTypeOfSupply,
    gstTaxability: l.gstTaxability,
    gstIgstRate: l.gstIgstRate,
    gstCgstRate: l.gstCgstRate,
    gstSgstRate: l.gstSgstRate,
    gstCessRate: l.gstCessRate,
    gstCessType: l.gstCessType,
    gstReverseCharge: l.gstReverseCharge,
    includeInAssessable: l.includeInAssessable,
    cessPerUnit: l.cessPerUnit,
    cessUnit: l.cessUnit,
    gstStatus: l.gstStatus,

    // Bank Config (Reconciliation / Cheque printing)
    effectiveDateForReconciliation: l.effectiveDateForReconciliation,
    setAlterChequeBooks: l.setAlterChequeBooks,
    chequeBookName: l.chequeBookName,
    chequeFrom: l.chequeFrom,
    chequeTo: l.chequeTo,
    chequeNumberLength: l.chequeNumberLength,
    enableChequePrinting: l.enableChequePrinting,
    chequePrintBank: l.chequePrintBank,
  };
}

/** Maps the nested GET /ledger/:id/details response onto the flat
 *  AdvancedLedgerForm shape the panel expects, so an existing ledger can be
 *  loaded back into the form for editing. Only fields present in the
 *  response are mapped — the panel merges this over DEFAULTS, so anything
 *  omitted here just falls back to its default. */
function ledgerDetailsToForm(d: LedgerDetails): Partial<AdvancedLedgerForm> {
  const l = d.ledger || {};
  const g = d.group;
  const m = d.mailing || {};
  const bk = d.banking || {};
  const tx = d.tax || {};
  const st = d.statutory || {};
  const bw = d.billwise || {};
  const tc = d.taxConfig || {};
  const bc = d.bankConfig || {};

  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const b = (v: unknown) => v === 1 || v === true;

  return {
    name: s(l.ledger_name),
    alias: s(l.alias),
    aliasRegional: s(l.alias_regional),
    group: g ? s(g.group_name) : "",
    groupId: g ? ((g.group_id as string | number | null | undefined) ?? null) : null,
    groupSource: g ? (g.source as "system" | "custom" | null) : null,
    reportingUnder: s(l.reporting_under),
    inactive: b(l.inactive),
    openingBalance: s(l.opening_balance),
    drCr: (l.ob_type === "Cr" ? "Cr" : "Dr"),
    effectiveDate: l.effective_date ? String(l.effective_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    freezeBalance: b(l.freeze_balance),
    inventoryAffected: b(l.inv_values_affected),
    typeOfLedger: (l.type_of_ledger as AdvancedLedgerForm["typeOfLedger"]) || "Not Applicable",
    roundingMethod: (l.rounding_method as AdvancedLedgerForm["roundingMethod"]) || "Not Applicable",
    roundingLimit: s(l.rounding_limit) || "1",
    methodToAllocate: b(l.method_to_allocate),
    useAsAdditionalCost: b(l.is_additional_cost),
    maintainCostCenters: b(l.cost_centre_applicable),
    costCentreAllocation: b(l.cost_centre_allocation),
    ledgerFlushingMethod: (l.ledger_flushing_method as AdvancedLedgerForm["ledgerFlushingMethod"]) || "Default",
    includeInBuyerLedger: b(l.include_in_buyer_ledger),
    includeInSellerLedger: b(l.include_in_seller_ledger),

    // Mailing
    showMailingDetails: m.show_mailing_details === undefined ? true : b(m.show_mailing_details),
    mailingName: s(m.mailing_name),
    addr1: s(m.address1), addr2: s(m.address2), addr3: s(m.address3), addr4: s(m.address4),
    city: s(m.city), district: s(m.district), state: s(m.state) || "Tamil Nadu",
    country: s(m.country) || "India", pincode: s(m.pincode),
    provideContactDetails: b(m.provide_contact),
    contactPerson: s(m.contact_person), telephone: s(m.telephone), mobile: s(m.mobile),
    primaryMobile: s(m.primary_mobile), email: s(m.email), website: s(m.website),

    // Banking
    provideBankDetails: b(bk.provide_bank_details),
    accountHolderName: s(bk.account_holder_name), bankName: s(bk.bank_name),
    accountNumber: s(bk.account_number), ifsc: s(bk.ifsc), swift: s(bk.swift),
    branch: s(bk.branch), accountType: (bk.account_type as AdvancedLedgerForm["accountType"]) || "Current",

    // Tax
    panIt: s(tx.pan_number), gstin: s(tx.gstin),
    registrationType: (tx.registration_type as AdvancedLedgerForm["registrationType"]) || "Regular",
    assesseeOtherTerritory: b(tx.assessee_other_territory), territory: s(tx.territory),
    tanNumber: s(tx.tan_number), deductorCategory: s(tx.deductor_category),
    collectionAccountNo: s(tx.collection_account_no),
    taxType: (tx.tax_type as AdvancedLedgerForm["taxType"]) || "None",
    deducteeType: (tx.deductee_type as AdvancedLedgerForm["deducteeType"]) || "Company",
    buyerType: (tx.buyer_type as AdvancedLedgerForm["buyerType"]) || "Company",

    // Statutory
    msmeRegistered: b(st.msme_registered), udyamNumber: s(st.udyam_number),
    einvoiceApplicable: b(st.einvoice_applicable),
    defaultSupplyType: (st.default_supply_type as AdvancedLedgerForm["defaultSupplyType"]) || "B2B",
    ewayBillApplicable: b(st.eway_bill_applicable),
    defaultTransportMode: (st.default_transport_mode as AdvancedLedgerForm["defaultTransportMode"]) || "Road",
    defaultDistance: s(st.default_distance),

    // Bill-wise
    maintainBillWise: b(bw.maintain_bill_wise),
    defaultCreditPeriod: s(bw.default_credit_period) || "30",
    checkCreditDaysDuringEntry: b(bw.check_credit_days_during_entry),

    // Tax Config
    isGstApplicable: (tc.gst_applicable as AdvancedLedgerForm["isGstApplicable"]) || "Undefined",
    setAlterGst: b(tc.set_alter_gst_details),
    gstDescription: s(tc.gst_description),
    gstApplicableFrom: tc.applicable_from ? String(tc.applicable_from).slice(0, 10) : "",
    gstHsnSacCode: s(tc.hsn_sac_code),
    gstTypeOfSupply: (tc.type_of_supply as AdvancedLedgerForm["gstTypeOfSupply"]) || "Goods",
    gstTaxability: (tc.taxability as AdvancedLedgerForm["gstTaxability"]) || "Taxable",
    gstIgstRate: s(tc.igst_rate),
    gstCgstRate: s(tc.cgst_rate),
    gstSgstRate: s(tc.sgst_rate),
    gstCessRate: s(tc.cess_rate),
    gstCessType: (tc.cess_type as AdvancedLedgerForm["gstCessType"]) || "Valorem",
    gstReverseCharge: b(tc.reverse_charge),
    includeInAssessable: b(tc.include_in_assessable),
    cessPerUnit: s(tc.cess_per_unit),
    cessUnit: s(tc.cess_unit),
    gstStatus: (tc.gst_status as AdvancedLedgerForm["gstStatus"]) || "Active",

    // Bank Config
    effectiveDateForReconciliation: bc.recon_effective_date ? String(bc.recon_effective_date).slice(0, 10) : "",
    setAlterChequeBooks: b(bc.set_alter_cheque_books),
    enableChequePrinting: b(bc.enable_cheque_printing),
    chequePrintBank: s(bc.cheque_print_bank_name),
  };
}

// ─── Default Groups — full flat list (shown in create/edit dropdown) ───────────
const DEFAULT_GROUPS = [
  // ── Primary Groups (15) ──────────────────────────────────────────────────────
  "Capital Account",
  "Current Assets",
  "Current Liabilities",
  "Direct Expenses",
  "Direct Incomes",
  "Fixed Assets",
  "Indirect Expenses",
  "Indirect Incomes",
  "Investments",
  "Loans (Liability)",
  "Misc. Expenses (ASSET)",
  "Purchase Accounts",
  "Sales Accounts",
  "Suspense A/c",
  "Branch/Divisions",

  // ── Sub Groups (13) ──────────────────────────────────────────────────────────
  "Bank Accounts",
  "Bank OD A/c",
  "Cash-in-hand",
  "Deposits (Asset)",
  "Duties & Taxes",
  "Loans & Advances (Asset)",
  "Provisions",
  "Reserves & Surplus",
  "Secured Loans",
  "Stock-in-hand",
  "Sundry Creditors",
  "Sundry Debtors",
  "Unsecured Loans",
];

// ─── Seed ledgers ───
interface LedgerEntry {
  id: number | string;
  name: string;
  group: string;          // display name — used for flat/ledger view
  groupId: string | number | null;    // acc_group_master.id  OR  acc_ledger_groups.id
  groupSource: "system" | "custom" | null; // which table groupId refers to
  nature?: string;
  openingBalance: number;
  balanceType: "Dr" | "Cr";
  opening?: number;
  openingSide?: "Dr" | "Cr";
  periodDr?: number;
  periodCr?: number;
  closing?: number;
  closingSide?: "Dr" | "Cr";
  effectiveDate: string;
  billWise?: boolean;
  creditPeriod?: number;
  address?: string;
  contact?: string;
  createdAt: number | string;
}


// ─── Sample data (replace with GET /api/ledgers/recent-activity) ───
const SAMPLE_RECENT_ACTIVITY: RecentActivityItem[] = [
  { id: "ra-1", name: "Cash", group: "Cash-in-Hand", lastUsedAt: "2025-04-20T15:42:00", voucherType: "Receipt", entries: 24 },
  { id: "ra-2", name: "SBI Current A/c", group: "Bank Accounts", lastUsedAt: "2025-04-20T12:10:00", voucherType: "Payment", entries: 18 },
  { id: "ra-3", name: "Rajesh Kumar", group: "Sundry Debtors", lastUsedAt: "2025-04-19T18:05:00", voucherType: "Receipt", entries: 9 },
  { id: "ra-4", name: "ABC Suppliers", group: "Sundry Creditors", lastUsedAt: "2025-04-19T11:20:00", voucherType: "Purchase", entries: 12 },
  { id: "ra-5", name: "Office Rent", group: "Indirect Expense", lastUsedAt: "2025-04-18T10:00:00", voucherType: "Payment", entries: 3 },
];


// ─── Hierarchical Group Structure ─────────────────────────────────────────────
// Matches the exact structure specified: Primary / Assets / Liabilities / Income / Expenses / Others
type HierNature = "Assets" | "Liabilities" | "Income" | "Expense";
interface HierGroup { id: number; name: string; parent: string | null; nature: HierNature; }


const HIER_GROUPS: HierGroup[] = (() => {
  let id = 0;

  const mk = (
    name: string,
    parent: string | null,
    nature: HierNature
  ): HierGroup => ({
    id: ++id,
    name,
    parent,
    nature,
  });

  return [
    // ───────────────── Assets ─────────────────
    mk("Assets", null, "Assets"),

    mk("Fixed Assets", "Assets", "Assets"),
    mk("Investments", "Assets", "Assets"),
    mk("Current Assets", "Assets", "Assets"),
    mk("Misc. Expenses (Asset)", "Assets", "Assets"),

    // Current Assets
    mk("Sundry Debtors", "Current Assets", "Assets"),
    mk("Cash in Hand", "Current Assets", "Assets"),
    mk("Bank Accounts", "Current Assets", "Assets"),
    mk("Stock in Hand", "Current Assets", "Assets"),
    mk("Deposits (Asset)", "Current Assets", "Assets"),
    mk("Loans & Advances (Asset)", "Current Assets", "Assets"),

    // ───────────────── Liabilities ─────────────────
    mk("Liabilities", null, "Liabilities"),

    mk("Capital Account", "Liabilities", "Liabilities"),
    mk("Loans (Liability)", "Liabilities", "Liabilities"),
    mk("Current Liabilities", "Liabilities", "Liabilities"),
    mk("Branch / Divisions", "Liabilities", "Liabilities"),
    mk("Suspense A/c", "Liabilities", "Liabilities"),

    // Capital Account
    mk("Reserves & Surplus", "Capital Account", "Liabilities"),
    mk("Partners Capital A/c", "Capital Account", "Liabilities"),
    mk("Partners Loan A/c", "Capital Account", "Liabilities"),

    // Loans
    mk("Secured Loans", "Loans (Liability)", "Liabilities"),
    mk("Unsecured Loans", "Loans (Liability)", "Liabilities"),
    mk("Bank OD Accounts", "Loans (Liability)", "Liabilities"),

    // Current Liabilities
    mk("Sundry Creditors", "Current Liabilities", "Liabilities"),
    mk("Duties & Taxes", "Current Liabilities", "Liabilities"),
    mk("Provisions", "Current Liabilities", "Liabilities"),

    // ───────────────── Income ─────────────────
    mk("Income", null, "Income"),

    mk("Sales Accounts", "Income", "Income"),
    mk("Direct Income", "Income", "Income"),
    mk("Indirect Income", "Income", "Income"),

    // ───────────────── Expenses ─────────────────
    mk("Expenses", null, "Expense"),

    mk("Purchase Accounts", "Expenses", "Expense"),
    mk("Direct Expenses", "Expenses", "Expense"),
    mk("Indirect Expenses", "Expenses", "Expense"),
  ];
})();

const HIER_NATURE_COLORS: Record<HierNature, string> = {
  Assets: "border-primary/40 text-primary",
  Liabilities: "border-red-400/40 text-red-600 dark:text-red-400",
  Income: "border-green-400/40 text-green-600 dark:text-green-400",
  Expense: "border-amber-400/40 text-amber-600 dark:text-amber-400",
};

// ─── View period ───
interface PeriodState {
  from: string;
  to: string;
}

// ─── Available views ───
const AVAILABLE_VIEWS = [
  { key: "ledger", label: "Ledger-wise" },
  { key: "group", label: "Group-wise" },
  { key: "gst", label: "Ledger GST Details" },
  { key: "contact", label: "Ledger Contact Details" },
  { key: "voucher", label: "Voucher Analysis" },
  { key: "monthly", label: "Monthly Summary" },
  { key: "outstanding", label: "Outstanding Analysis" },
];

const SAVED_VIEWS = [
  "Chart Of Accounts - My View",
  "Sales Ledger Analysis",
  "Collection View",
  "Finance Outstanding View",
];

const RELATED_REPORTS = [
  "Ledger Contact Details",
  "Voucher Register",
  "Outstanding Analysis",
  "Monthly Summary",
];

type ViewModeKey = "ledger" | "group" | "gst" | "contact" | "monthly";

const VIEW_MODE_LABELS: Record<ViewModeKey, string> = {
  ledger: "Ledger Wise",
  group: "Group Wise",
  gst: "Ledger GST Details",
  contact: "Ledger Contact Details",
  monthly: "Monthly Summary",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Helpers ───
function fmtDate(iso: string): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso).trim());
  if (m) {
    const year = m[1];
    const monthIdx = parseInt(m[2], 10) - 1;
    const day = m[3];
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${day} ${MONTH_NAMES[monthIdx]} ${year}`;
    }
  }
  return String(iso);
}

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// Helper to find the top-level parent (root category) for any group
function getGroupCategory(
  groupName: string,
  knownNature?: string,
  viewGroups?: UnderDropdownItem[]
): "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS" {
  if (knownNature) {
    const norm = knownNature.trim().toUpperCase();
    if (norm === "ASSETS") return "ASSETS";
    if (norm === "LIABILITIES") return "LIABILITIES";
    if (norm === "INCOME") return "INCOME";
    if (norm === "EXPENSES" || norm === "EXPENSE") return "EXPENSES";
  }

  if (viewGroups && viewGroups.length > 0) {
    const vg = viewGroups.find(g => g.group_name.toLowerCase() === groupName.toLowerCase());
    if (vg?.nature) {
      const norm = vg.nature.trim().toUpperCase();
      if (norm === "ASSETS") return "ASSETS";
      if (norm === "LIABILITIES") return "LIABILITIES";
      if (norm === "INCOME") return "INCOME";
      if (norm === "EXPENSES" || norm === "EXPENSE") return "EXPENSES";
    }
  }

  const findNode = (name: string) => HIER_GROUPS.find(g => g.name.toLowerCase() === name.toLowerCase());
  let current = findNode(groupName);
  if (!current) return "OTHERS";
  let limit = 0;
  while (current.parent && limit < 10) {
    const parentNode = findNode(current.parent);
    if (!parentNode) break;
    current = parentNode;
    limit++;
  }
  const rootName = current.name.toUpperCase();
  if (rootName === "ASSETS") return "ASSETS";
  if (rootName === "LIABILITIES") return "LIABILITIES";
  if (rootName === "INCOME") return "INCOME";
  if (rootName === "EXPENSES" || rootName === "EXPENSE") return "EXPENSES";
  if (rootName === "PRIMARY") return "LIABILITIES"; // Primary groups are liabilities/equity
  return "OTHERS";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Ledger() {
  return (
    <ConfigProvider>
      <LedgerInner />
    </ConfigProvider>
  );
}

function LedgerInner() {
  const { config } = useConfig();
  const [activeTab, setActiveTab] = useState<"create" | "view">("create");
  const [ledgers, setLedgers] = useState<LedgerEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  // Bumped on every reset so AdvancedLedgerFormPanel remounts with a clean internal form state
  const [formKey, setFormKey] = useState(0);
  const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [groupOptions, setGroupOptions] = useState<UnderGroupOption[]>([]);
  const [recentCreated, setRecentCreated] = useState<RecentlyCreatedItem[]>([]);
  const [recentCreatedLoading, setRecentCreatedLoading] = useState(false);
  // Ledger currently being edited via "Recently Created" (fetched by id from
  // GET /ledger/:id/details). Non-null => AdvancedLedgerFormPanel is in edit
  // mode: "Under" is locked and Save calls updateLedger instead of createLedger.
  const [editingLedgerId, setEditingLedgerId] = useState<number | string | null>(null);
  const [editingLedgerInitial, setEditingLedgerInitial] = useState<Partial<AdvancedLedgerForm> | undefined>(undefined);
  const [editingLedgerLoading, setEditingLedgerLoading] = useState(false);

  // ─── View-tab: real ledgers + groups fetched from the API ────────────────────
  const [viewLedgers, setViewLedgers] = useState<LedgerEntry[]>([]);
  const [viewGroups, setViewGroups] = useState<UnderDropdownItem[]>([]);
  const [viewDetails, setViewDetails] = useState<LedgerViewDetailRow[]>([]);
  const [viewDataLoading, setViewDataLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<LedgerSummary | null>(null);

  const { currentFinance, financeList, switchFinance } = useAuth();
  const financeId = currentFinance?.id ? String(currentFinance.id) : "";
  const activeCompanyName =
    currentFinance?.name || currentFinance?.finance_name || "Select Company";
  const availableFinances = useMemo(
    () =>
      financeList && financeList.length > 0
        ? financeList
        : currentFinance
        ? [currentFinance]
        : [],
    [financeList, currentFinance]
  );

  const activeFinanceIdRef = useRef(financeId);
  activeFinanceIdRef.current = financeId;
  useEffect(() => {
    activeFinanceIdRef.current = financeId;
  }, [financeId]);

  const recentReqIdRef = useRef(0);
  const viewReqIdRef = useRef(0);
  const summaryReqIdRef = useRef(0);

  // Period — persisted, defaulting to current FY (Apr 1 – Mar 31)
  const [period, setPeriod] = useState<PeriodState>(() => {
    const saved = loadPref<PeriodState | null>("ledger:period", null);
    if (saved && saved.from && saved.to && saved.from <= saved.to) {
      return saved;
    }
    return getCurrentFYRange();
  });

  // On mount & finance switch: fetch all available parent groups (system + custom) from the DB
  useEffect(() => {
    if (!financeId) return;
    const reqFinanceId = financeId;
    getUnderDropdown()
      .then(res => {
        if (activeFinanceIdRef.current !== reqFinanceId) return;
        if (res.data?.success && Array.isArray(res.data?.data)) {
          const opts: UnderGroupOption[] = res.data.data.map((g: UnderDropdownItem) => ({
            id: g.id,
            group_name: g.group_name as string,
            source: g.source as "system" | "custom",
          }));
          setGroupOptions(opts);
          const dbGroupNames: string[] = opts.map(g => g.group_name);
          setGroups(prev => {
            const merged = Array.from(new Set([...prev, ...dbGroupNames]));
            return merged.sort((a, b) => a.localeCompare(b));
          });
        }
      })
      .catch(() => { /* silently fall back to DEFAULT_GROUPS */ });
  }, [financeId]);

  // Maps a backend Recentledger record onto the shape RecentlyCreatedCard expects
  const mapRecentLedger = (r: Recentledger): RecentlyCreatedItem => {
    const grp = r.group as Record<string, string> | undefined;
    return {
      id: r.id,
      name: r.ledger_name,
      group: r.reporting_under || grp?.group_name || grp?.name || "—",
      createdAt: r.created_at || new Date().toISOString(),
    };
  };

  // Fetches the most recently created ledgers for the active company from the DB
  const fetchRecentCreated = useCallback(() => {
    if (!financeId) return;
    const reqFinanceId = financeId;
    const reqId = ++recentReqIdRef.current;
    setRecentCreatedLoading(true);
    getRecentledgers()
      .then(res => {
        if (activeFinanceIdRef.current !== reqFinanceId || recentReqIdRef.current !== reqId) return;
        if (res.data?.success && Array.isArray(res.data?.data)) {
          setRecentCreated(res.data.data.map(mapRecentLedger));
        }
      })
      .catch(() => { /* silently keep whatever list we already have */ })
      .finally(() => {
        if (activeFinanceIdRef.current === reqFinanceId && recentReqIdRef.current === reqId) {
          setRecentCreatedLoading(false);
        }
      });
  }, [financeId]);

  // Fetch header summary for active finance and period
  const fetchSummary = useCallback(() => {
    if (!financeId) return;
    const reqFinanceId = financeId;
    const reqId = ++summaryReqIdRef.current;
    apiGetLedgerSummary({ from: period.from, to: period.to })
      .then(res => {
        if (activeFinanceIdRef.current !== reqFinanceId || summaryReqIdRef.current !== reqId) return;
        if (res.data?.success && res.data?.data) {
          setSummaryData(res.data.data);
        }
      })
      .catch(() => {
        if (activeFinanceIdRef.current === reqFinanceId && summaryReqIdRef.current === reqId) {
          setSummaryData(null);
        }
      });
  }, [financeId, period.from, period.to]);

  // On mount, and whenever the active company changes, refresh the "Recently Created" list
  useEffect(() => {
    fetchRecentCreated();
  }, [fetchRecentCreated]);

  // Refresh header summary whenever finance or period changes
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // ─── Fetch real ledger list + group tree + view details for the View tab ─────
  const fetchViewData = useCallback(async () => {
    if (!financeId) return;
    const reqFinanceId = financeId;
    const reqId = ++viewReqIdRef.current;
    setViewDataLoading(true);
    try {
      const [ledgersRes, groupsRes, detailsRes] = await Promise.all([
        apiGetLedgers({ from: period.from, to: period.to }),
        getUnderDropdown(),
        apiGetLedgerViewDetails(),
      ]);

      if (activeFinanceIdRef.current !== reqFinanceId || viewReqIdRef.current !== reqId) return;

      if (groupsRes.data?.success && Array.isArray(groupsRes.data?.data)) {
        setViewGroups(groupsRes.data.data);
      }

      if (detailsRes.data?.success && Array.isArray(detailsRes.data?.data)) {
        setViewDetails(detailsRes.data.data);
      }

      if (ledgersRes.data?.success && Array.isArray(ledgersRes.data?.data)) {
        const mapped: LedgerEntry[] = ledgersRes.data.data.map((r: Ledger) => ({
          id: String(r.id),
          name: r.ledger_name,
          group: r.group_name || r.reporting_under || "—",
          groupId: r.master_group_id ?? r.group_id ?? null,
          groupSource: r.group_source ?? (r.master_group_id ? "system" : r.group_id ? "custom" : null),
          nature: r.nature ?? undefined,
          openingBalance: Number(r.opening_balance) || 0,
          balanceType: (r.ob_type === "Cr" ? "Cr" : "Dr") as "Dr" | "Cr",
          opening: Number(r.opening ?? (r.opening_dr || r.opening_cr || r.opening_balance || 0)),
          openingSide: (r.opening_side ?? (Number(r.opening_cr) > 0 ? "Cr" : r.ob_type === "Cr" ? "Cr" : "Dr")) as "Dr" | "Cr",
          periodDr: Number(r.period_dr) || 0,
          periodCr: Number(r.period_cr) || 0,
          closing: Number(r.closing ?? (r.closing_dr || r.closing_cr || 0)),
          closingSide: (r.closing_side ?? (Number(r.closing_cr) > 0 ? "Cr" : "Dr")) as "Dr" | "Cr",
          effectiveDate: r.effective_date ? String(r.effective_date).slice(0, 10) : "",
          createdAt: 0,
        }));
        setViewLedgers(mapped);
      }
    } catch {
      // silently keep state on transient error
    } finally {
      if (activeFinanceIdRef.current === reqFinanceId && viewReqIdRef.current === reqId) {
        setViewDataLoading(false);
      }
    }
  }, [financeId, period.from, period.to]);

  useEffect(() => {
    if (activeTab === "view") fetchViewData();
  }, [activeTab, fetchViewData]);

  // Fetches full details for a ledger by id and loads it into the Advanced
  // Ledger form for editing (used by RecentlyCreatedCard's onSelect).
  const openLedgerForEdit = useCallback((ledgerId: string | number) => {
    if (!financeId) return;
    setEditingLedgerLoading(true);
    apiGetLedgerDetails(String(ledgerId))
      .then(res => {
        if (res.data?.success && res.data?.data) {
          setCurrentIndex(-1);
          setEditingLedgerId(String(ledgerId));
          setEditingLedgerInitial(ledgerDetailsToForm(res.data.data));
          setFormKey(k => k + 1);
          setActiveTab("create");
        } else {
          toast.error("Could not load ledger details");
        }
      })
      .catch((err: { response?: { data?: { message?: string } }; message?: string }) => {
        toast.error(err?.response?.data?.message || err?.message || "Could not load ledger details");
      })
      .finally(() => setEditingLedgerLoading(false));
  }, [financeId]);

  // Form state
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [, setGroupSearch] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [balanceType, setBalanceType] = useState<"Dr" | "Cr">("Dr");
  const [effectiveDate, setEffectiveDate] = useState("2025-04-01");

  // Sundry extra fields
  const [billWise, setBillWise] = useState(false);
  const [creditPeriod, setCreditPeriod] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");

  // Dialogs
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [, setShowSundryDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showConfigDialog, setShowConfigDialog] = useState(false);

  // View mode — persisted; defaults to group view
  const [viewMode, setViewMode] = useState<ViewModeKey>(() => {
    const saved = loadPref<string>("ledger:viewMode", "group");
    if (saved === "ledger" || saved === "group" || saved === "gst" || saved === "contact" || saved === "monthly") {
      return saved;
    }
    return "group";
  });

  // Selected ledger for Monthly Summary view
  const [monthlyLedgerId, setMonthlyLedgerId] = useState<string>("");

  // View search — persisted
  const [viewSearch, setViewSearch] = useState<string>(
    () => loadPref("ledger:viewSearch", "")
  );

  // Category tab filter — standard state
  const [category, setCategory] = useState<"ALL" | "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS">("ALL");

  // View mode dialogs
  const [showChangeView, setShowChangeView] = useState(false);   // Alt+H
  const [showPeriodDlg, setShowPeriodDlg] = useState(false);     // F2
  const [showCompanyDlg, setShowCompanyDlg] = useState(false);   // F3

  // Skeleton / transition loading
  const [viewLoading, setViewLoading] = useState(false);

  // Period dialog local state
  const [periodPreset, setPeriodPreset] = useState<"month" | "quarter" | "year" | "custom">("year");
  const [periodFrom, setPeriodFrom] = useState(period.from);
  const [periodTo, setPeriodTo] = useState(period.to);

  // Day-wise view
  const [viewLedger, setViewLedger] = useState<LedgerEntry | null>(null);
  const [viewGroupFilter, setViewGroupFilter] = useState("all");

  // Multi-ledger
  const [multiSelector, setMultiSelector] = useState(false);
  const [multiChoice, setMultiChoice] = useState<SelectorChoice | null>(null);
  const [, setShowAdvLedger] = useState(false);

  // Refs
  const nameRef = useRef<HTMLInputElement>(null);

  const isSundryGroup = group === "Sundry Debtors" || group === "Sundry Creditors";

  // Header summary pills bound to getLedgerSummary(period)
  const summaryTotalDr = Number.isFinite(summaryData?.total_dr_closing)
    ? Number(summaryData!.total_dr_closing)
    : 0;
  const summaryTotalCr = Number.isFinite(summaryData?.total_cr_closing)
    ? Number(summaryData!.total_cr_closing)
    : 0;
  const summaryDiff = Number.isFinite(summaryData?.difference)
    ? Number(summaryData!.difference)
    : 0;
  const summaryDiffSide: "Dr" | "Cr" =
    summaryData?.difference_side === "Cr" ? "Cr" : "Dr";

  const groupedLedgers = useMemo(() => {
    const map: Record<string, LedgerEntry[]> = {};
    viewLedgers.forEach(l => {
      if (!map[l.group]) map[l.group] = [];
      map[l.group].push(l);
    });
    return map;
  }, [viewLedgers]);

  // Filtered ledger list for view tab (flat ledger-wise view)
  const filteredViewLedgers = useMemo(() => {
    const q = viewSearch.toLowerCase().trim();
    let list = viewLedgers;
    if (q) {
      list = list.filter(
        l => l.name.toLowerCase().includes(q) || l.group.toLowerCase().includes(q)
      );
    }
    if (category !== "ALL") {
      list = list.filter(l => getGroupCategory(l.group, l.nature, viewGroups) === category);
    }
    return list;
  }, [viewLedgers, viewSearch, category, viewGroups]);

  // Filtered view details for GST and Contact views
  const filteredViewDetails = useMemo(() => {
    const q = viewSearch.toLowerCase().trim();
    let list = viewDetails;
    if (q) {
      list = list.filter(d => {
        const hay = [
          d.ledger_name,
          d.group_name,
          d.gstin,
          d.pan_number,
          d.reg_type,
          d.contact_person,
          d.mobile,
          d.primary_mobile,
          d.email,
          d.city,
          d.state,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (category !== "ALL") {
      list = list.filter(
        d => getGroupCategory(d.group_name || "", d.nature || undefined, viewGroups) === category
      );
    }
    return list;
  }, [viewDetails, viewSearch, category, viewGroups]);

  // ─── Persist view preferences ───────────────────────────────────────────────
  useEffect(() => { savePref("ledger:viewMode", viewMode); }, [viewMode]);
  useEffect(() => { savePref("ledger:period", period); }, [period]);
  useEffect(() => { savePref("ledger:viewSearch", viewSearch); }, [viewSearch]);

  // ─── Trigger skeleton on company / period / viewMode change ────────────────
  const triggerViewLoading = useCallback(() => {
    setViewLoading(true);
    const t = setTimeout(() => setViewLoading(false), 180);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (activeTab === "view") triggerViewLoading();
  }, [financeId, period, viewMode, category, activeTab, triggerViewLoading]);

  // ─── Load ledger into form ───────────────────────────────────────────────────
  const loadLedger = useCallback((index: number) => {
    if (index < 0 || index >= ledgers.length) return;
    const l = ledgers[index];
    setEditingLedgerId(null);
    setEditingLedgerInitial(undefined);
    setCurrentIndex(index);
    setName(l.name);
    setGroup(l.group);
    setGroupSearch(l.group);
    setOpeningBalance(l.openingBalance.toString());
    setBalanceType(l.balanceType);
    setEffectiveDate(l.effectiveDate);
    setBillWise(l.billWise ?? false);
    setCreditPeriod(l.creditPeriod?.toString() ?? "");
    setAddress(l.address ?? "");
    setContact(l.contact ?? "");
  }, [ledgers]);

  const resetForm = useCallback(() => {
    setCurrentIndex(-1);
    setFormKey(k => k + 1);
    setName("");
    setGroup("");
    setGroupSearch("");
    setOpeningBalance("");
    setBalanceType("Dr");
    setEffectiveDate("2025-04-01");
    setBillWise(false);
    setCreditPeriod("");
    setAddress("");
    setContact("");
    setEditingLedgerId(null);
    setEditingLedgerInitial(undefined);
    nameRef.current?.focus();
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim() || !group.trim()) {
      toast.error("Ledger Name and Group are required");
      return;
    }
    const entry: LedgerEntry = {
      id: currentIndex >= 0 ? ledgers[currentIndex].id : Date.now(),
      name: name.trim(),
      group,
      groupId: currentIndex >= 0 ? ledgers[currentIndex].groupId : null,
      groupSource: currentIndex >= 0 ? ledgers[currentIndex].groupSource : null,
      openingBalance: parseFloat(openingBalance) || 0,
      balanceType,
      effectiveDate,
      createdAt: currentIndex >= 0 ? ledgers[currentIndex].createdAt : Date.now(),
      ...(isSundryGroup && { billWise, creditPeriod: parseInt(creditPeriod) || 0, address, contact }),
    };
    if (currentIndex >= 0) {
      setLedgers(prev => prev.map((l, i) => i === currentIndex ? entry : l));
      toast.success(`Ledger "${name}" updated`);
    } else {
      setLedgers(prev => [...prev, entry]);
      toast.success(`Ledger "${name}" created`);
    }
    resetForm();
  }, [name, group, openingBalance, balanceType, effectiveDate, billWise, creditPeriod, address, contact, currentIndex, ledgers, isSundryGroup, resetForm]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Escape closes the topmost dialog/view only
      if (e.key === "Escape") {
        if (showConfigDialog) return; // ConfigDialog handles its own Escape
        if (multiChoice) {
          e.preventDefault();
          setMultiChoice(null);
          return;
        }
        if (multiSelector) {
          e.preventDefault();
          setMultiSelector(false);
          return;
        }
        if (showNewGroup) {
          e.preventDefault();
          setShowNewGroup(false);
          return;
        }
        if (showCompanyDlg) {
          e.preventDefault();
          setShowCompanyDlg(false);
          return;
        }
        if (showPeriodDlg) {
          e.preventDefault();
          setShowPeriodDlg(false);
          return;
        }
        if (showChangeView) {
          e.preventDefault();
          setShowChangeView(false);
          return;
        }
        if (activeTab === "view" && viewLedger) {
          e.preventDefault();
          setViewLedger(null);
          return;
        }
        return;
      }

      if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setShowNewGroup(true);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setShowNewGroup(true);
        return;
      }
      if (e.key === "F12" || (e.altKey && e.key === "F12")) {
        e.preventDefault();
        setShowConfigDialog(true);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "a") {
        if (showConfigDialog) return;
        e.preventDefault();
        handleSave();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setMultiSelector(true);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setShowAdvLedger(true);
        return;
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (ledgers.length) loadLedger(currentIndex >= 0 ? currentIndex : 0);
        return;
      }
      if (!isEditable && e.key === "PageUp") {
        e.preventDefault();
        const idx = currentIndex <= 0 ? ledgers.length - 1 : currentIndex - 1;
        loadLedger(idx);
        return;
      }
      if (!isEditable && e.key === "PageDown") {
        e.preventDefault();
        const idx = currentIndex >= ledgers.length - 1 ? 0 : currentIndex + 1;
        loadLedger(idx);
        return;
      }

      // ── View-tab shortcuts ──────────────────────────────────────────────
      if (e.key === "F5") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setViewMode(prev => {
          const next = prev === "ledger" ? "group" : "ledger";
          toast.info(`View Mode: ${next === "ledger" ? "Ledger Wise" : "Group Wise"}`);
          return next;
        });
        setViewLedger(null);
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setPeriodFrom(period.from);
        setPeriodTo(period.to);
        setShowPeriodDlg(true);
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setShowCompanyDlg(true);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "h") {
        if (!showNewGroup) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setShowChangeView(true);
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    handleSave,
    currentIndex,
    ledgers.length,
    loadLedger,
    period,
    showNewGroup,
    showConfigDialog,
    multiChoice,
    multiSelector,
    showCompanyDlg,
    showPeriodDlg,
    showChangeView,
    activeTab,
    viewLedger,
  ]);

  // Auto-open sundry dialog
  useEffect(() => {
    if (isSundryGroup && activeTab === "create") {
      setShowSundryDialog(true);
    }
  }, [group, isSundryGroup, activeTab]);

  // Pre-fill group from sessionStorage (when navigated from Ledger Groups tree)
  useEffect(() => {
    try {
      const preset = sessionStorage.getItem("ledger:presetGroup");
      if (preset) {
        setGroup(preset);
        setGroupSearch(preset);
        sessionStorage.removeItem("ledger:presetGroup");
        setTimeout(() => nameRef.current?.focus(), 100);
        toast.success(`Creating ledger under "${preset}"`);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const selectedLedgerForForm = useMemo(() => {
    if (editingLedgerId !== null) return editingLedgerInitial;
    if (currentIndex < 0 || currentIndex >= ledgers.length) return undefined;
    const l = ledgers[currentIndex];
    return {
      name: l.name,
      group: l.group,
      openingBalance: l.openingBalance.toString(),
      drCr: l.balanceType,
      effectiveDate: l.effectiveDate,
      maintainBillWise: l.billWise,
      defaultCreditPeriod: l.creditPeriod?.toString(),
      mobile: l.contact,
      addr1: l.address,
      showMailingDetails: !!l.address || !!l.contact,
    } as Partial<AdvancedLedgerForm>;
  }, [currentIndex, ledgers, editingLedgerId, editingLedgerInitial]);

  // ─── Period preset helpers (no UTC timezone shift) ───────────────────────────
  const applyPeriodPreset = (preset: "month" | "quarter" | "year" | "custom") => {
    setPeriodPreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0..11
    const pad = (n: number) => String(n).padStart(2, "0");
    if (preset === "year") {
      const fy = m >= 3 ? y : y - 1;
      setPeriodFrom(`${fy}-04-01`);
      setPeriodTo(`${fy + 1}-03-31`);
    } else if (preset === "month") {
      const lastDay = new Date(y, m + 1, 0).getDate();
      setPeriodFrom(`${y}-${pad(m + 1)}-01`);
      setPeriodTo(`${y}-${pad(m + 1)}-${pad(lastDay)}`);
    } else if (preset === "quarter") {
      const qStart = Math.floor(m / 3) * 3;
      const qEnd = qStart + 2;
      const lastDay = new Date(y, qEnd + 1, 0).getDate();
      setPeriodFrom(`${y}-${pad(qStart + 1)}-01`);
      setPeriodTo(`${y}-${pad(qEnd + 1)}-${pad(lastDay)}`);
    }
  };

  const applyPeriod = () => {
    if (!periodFrom || !periodTo) {
      toast.error("Please select both From and To dates");
      return;
    }
    if (periodFrom > periodTo) {
      toast.error("From date must be on or before To date");
      return;
    }
    setPeriod({ from: periodFrom, to: periodTo });
    setShowPeriodDlg(false);
    toast.success(`Period set: ${fmtDate(periodFrom)} – ${fmtDate(periodTo)}`);
  };

  // ─── Live Company switch (F3) ────────────────────────────────────────────────
  const handleSwitchCompany = async (targetId: string | number, displayName: string) => {
    if (String(targetId) === String(currentFinance?.id)) {
      setShowCompanyDlg(false);
      return;
    }
    try {
      const ok = await switchFinance(String(targetId));
      if (!ok) {
        toast.error("Failed to switch company");
        return;
      }
      setShowCompanyDlg(false);
      setViewLedger(null);
      setMonthlyLedgerId("");
      setViewLedgers([]);
      setViewDetails([]);
      setSummaryData(null);
      setRecentCreated([]);
      toast.success(`Company: ${displayName}`);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(apiErr?.response?.data?.message || apiErr?.message || "Failed to switch company");
    }
  };

  return (
    <div className="space-y-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Ledger Master</h1>
            <p className="text-muted-foreground mt-1 text-sm">Tally-style ledger management</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="dashboard-card !p-2 !rounded-lg flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">Total Dr:</span>
              <span className="font-bold text-foreground">₹{summaryTotalDr.toLocaleString("en-IN")}</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">Total Cr:</span>
              <span className="font-bold text-foreground">₹{summaryTotalCr.toLocaleString("en-IN")}</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">Opening:</span>
              <span className={`font-bold ${summaryDiffSide === "Dr" ? "text-foreground" : "text-expense"}`}>
                ₹{summaryDiff.toLocaleString("en-IN")} {summaryDiffSide}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Shortcuts bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="flex flex-wrap gap-1.5 text-[10px]">
          {[
            ["Ctrl+L", "Adv Ledger"], ["Alt+C", "New Group"], ["F12", "Config"], ["Ctrl+A", "Save"],
            ["Ctrl+H", "Multi Create"], ["PgUp", "Prev"], ["PgDn", "Next"], ["Enter", "Next Field"],
            ["F5", "Toggle View"], ["F2", "Period"], ["F3", "Company"], ["Alt+H", "Change View"],
          ].map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary text-muted-foreground">
              <kbd className="font-mono font-semibold text-foreground">{k}</kbd> {v}
            </span>
          ))}
        </motion.div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "view")} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="create">Create / Edit</TabsTrigger>
            <TabsTrigger value="view">View Ledgers</TabsTrigger>
          </TabsList>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfigDialog(true)}
            className="gap-1.5"
          >
            <Settings className="h-3.5 w-3.5" /> Config
          </Button>

          {/* ═══════ CREATE TAB ═══════ */}
          <TabsContent value="create">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
              {/* Left column: Advanced Ledger Form */}
              <motion.div
                key={`${currentIndex}-${formKey}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="xl:col-span-3 dashboard-card"
              >
                <AdvancedLedgerFormPanel
                  key={editingLedgerId ?? "new"}
                  groups={groups}
                  groupOptions={groupOptions}
                  onCreateGroup={() => setShowNewGroup(true)}
                  onClose={resetForm}
                  onOpenConfig={() => setShowConfigDialog(true)}
                  initial={selectedLedgerForForm}
                  lockUnderField={editingLedgerId !== null}
                  onSave={async (l: AdvancedLedgerForm) => {
                    let payload;
                    try {
                      payload = ledgerFormToPayload(l);
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : "Select a valid Under group before saving";
                      toast.error(msg);
                      return;
                    }

                    const isEditingRecent = editingLedgerId !== null;
                    const targetId = isEditingRecent ? editingLedgerId! : (currentIndex >= 0 ? ledgers[currentIndex].id : null);

                    try {
                      if (targetId !== null) {
                        await apiUpdateLedger(String(targetId), payload);
                      } else {
                        const res = await apiCreateLedger(payload);
                        if (!res.data?.success) throw new Error(res.data?.message || "Failed to create ledger");
                      }
                    } catch (err: unknown) {
                      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
                      toast.error(apiErr?.response?.data?.message || apiErr?.message || "Failed to save ledger");
                      return;
                    }

                    // Keep the local `ledgers` list (used for prev/next navigation) in
                    // sync only when the entry we saved actually came from that list.
                    if (currentIndex >= 0) {
                      const entry: LedgerEntry = {
                        id: ledgers[currentIndex].id,
                        name: l.name.trim(),
                        group: l.group,
                        groupId: l.groupId ?? null,
                        groupSource: l.groupSource ?? null,
                        openingBalance: parseFloat(l.openingBalance) || 0,
                        balanceType: l.drCr,
                        effectiveDate: l.effectiveDate,
                        billWise: l.maintainBillWise,
                        creditPeriod: parseInt(l.defaultCreditPeriod) || 0,
                        address: [l.addr1, l.addr2, l.city, l.state, l.pincode].filter(Boolean).join(", "),
                        contact: l.mobile,
                        createdAt: ledgers[currentIndex].createdAt,
                      };
                      setLedgers(prev => prev.map((item, i) => i === currentIndex ? entry : item));
                    } else if (targetId === null) {
                      const entry: LedgerEntry = {
                        id: Date.now(),
                        name: l.name.trim(),
                        group: l.group,
                        groupId: l.groupId ?? null,
                        groupSource: l.groupSource ?? null,
                        openingBalance: parseFloat(l.openingBalance) || 0,
                        balanceType: l.drCr,
                        effectiveDate: l.effectiveDate,
                        billWise: l.maintainBillWise,
                        creditPeriod: parseInt(l.defaultCreditPeriod) || 0,
                        address: [l.addr1, l.addr2, l.city, l.state, l.pincode].filter(Boolean).join(", "),
                        contact: l.mobile,
                        createdAt: Date.now(),
                      };
                      setLedgers(prev => [...prev, entry]);
                    }

                    toast.success(`Ledger "${l.name}" ${targetId !== null ? "updated" : "created"}`);
                    fetchRecentCreated();
                    fetchSummary();
                    fetchViewData();
                    resetForm();
                  }}
                />
              </motion.div>

              {/* Right column: Dashboard cards */}
              <div className="space-y-4">
                <RecentlyCreatedCard
                  items={recentCreated}
                  loading={recentCreatedLoading || editingLedgerLoading}
                  onSelect={(it) => openLedgerForEdit(it.id)}
                  onViewAll={() => setActiveTab("view")}
                />
                <RecentActivityCard
                  items={SAMPLE_RECENT_ACTIVITY}
                  onSelect={(it) => {
                    const existing = ledgers.find(l => l.name.toLowerCase() === it.name.toLowerCase());
                    const target: LedgerEntry = existing ?? {
                      id: -1,
                      name: it.name,
                      group: it.group,
                      groupId: null,
                      groupSource: null,
                      openingBalance: 0,
                      balanceType: "Dr",
                      effectiveDate: new Date().toISOString().slice(0, 10),
                      createdAt: 0,
                    };
                    setViewLedger(target);
                    setActiveTab("view");
                  }}
                />
              </div>
            </div>

            {/* Recently Created Ledgers Table - Full width below */}
            {/* <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="dashboard-card mt-4 p-0 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Recently Created <span className="text-muted-foreground font-normal">({Math.min(ledgers.length, 15)} of {ledgers.length})</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      {["#", "Name", "Group", "Opening Bal", "Type", "Actions"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...ledgers]
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .slice(0, 15)
                      .map((l) => {
                        const i = ledgers.findIndex(e => e.id === l.id);
                        return (
                          <tr key={l.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer ${currentIndex === i ? "bg-primary/5" : ""}`}
                            onClick={() => loadLedger(i)}>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="px-4 py-2.5 text-sm font-medium text-foreground">{l.name}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.group}</td>
                            <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-foreground">₹{l.openingBalance.toLocaleString()}</td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={`text-xs ${l.balanceType === "Dr" ? "border-primary/40 text-primary" : "border-income/40 text-income"}`}>
                                {l.balanceType}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              <button onClick={(e) => { e.stopPropagation(); setViewLedger(l); setActiveTab("view"); }} className="text-xs text-primary hover:underline">View</button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </motion.div> */}
          </TabsContent>

          {/* ═══════ VIEW TAB — TALLY PRIME STYLE ═══════ */}
          <TabsContent value="view">
            <div className="space-y-3">

              {/* ── Top info bar: Company + Period + View Mode ────────────────────── */}
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="dashboard-card !p-3 flex flex-wrap items-center justify-between gap-3"
              >
                {/* Company display */}
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <button
                    onClick={() => setShowCompanyDlg(true)}
                    className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                    title="Press F3 to change company"
                  >
                    {activeCompanyName}
                  </button>
                  <Badge variant="outline" className="text-[9px] border-muted">F3</Badge>
                </div>

                {/* Period display */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <button
                    onClick={() => { setPeriodFrom(period.from); setPeriodTo(period.to); setShowPeriodDlg(true); }}
                    className="text-xs text-foreground hover:text-primary transition-colors font-mono"
                    title="Press F2 to change period"
                  >
                    <span className="text-muted-foreground">From : </span>{fmtDate(period.from)}
                    <span className="text-muted-foreground mx-2">To : </span>{fmtDate(period.to)}
                  </button>
                  <Badge variant="outline" className="text-[9px] border-muted">F2</Badge>
                </div>

                {/* View mode badge */}
                <div className="flex items-center gap-2">
                  {viewMode === "group"
                    ? <TreePine className="h-4 w-4 text-primary shrink-0" />
                    : <LayoutList className="h-4 w-4 text-primary shrink-0" />
                  }
                  <span className="text-xs font-semibold text-primary">
                    View Mode : {VIEW_MODE_LABELS[viewMode]}
                  </span>
                  <Badge variant="outline" className="text-[9px] border-muted">F5</Badge>
                </div>
              </motion.div>

              {/* ── Category tabs ── */}
              <div className="flex gap-1 flex-wrap border-b border-border">
                {(["ALL", "ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "OTHERS"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`relative px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${category === c ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {c}
                    {category === c && (
                      <motion.div layoutId="ledger-cat-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              {/* ── Action bar ────────────────────────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={viewSearch}
                    onChange={e => setViewSearch(e.target.value)}
                    placeholder="Search ledgers…"
                    className="pl-9 h-8 text-xs"
                  />
                </div>

                {/* F5 Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => {
                    setViewMode(prev => prev === "ledger" ? "group" : "ledger");
                    setViewLedger(null);
                  }}
                >
                  {viewMode === "ledger" ? <TreePine className="h-3.5 w-3.5" /> : <LayoutList className="h-3.5 w-3.5" />}
                  F5 – {viewMode === "ledger" ? "Group View" : "Ledger View"}
                </Button>

                {/* Alt+H Change View */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setShowChangeView(true)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Alt+H – Change View
                </Button>

                {/* Group filter — only in ledger view */}
                {viewMode === "ledger" && !viewLedger && (
                  <Select value={viewGroupFilter} onValueChange={setViewGroupFilter}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Filter by Group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Groups</SelectItem>
                      {Object.keys(groupedLedgers).sort().map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Ledger selector — in monthly summary view */}
                {viewMode === "monthly" && !viewLedger && (
                  <Select
                    value={monthlyLedgerId || "__none__"}
                    onValueChange={val => setMonthlyLedgerId(val === "__none__" ? "" : val)}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Select Ledger" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select Ledger…</SelectItem>
                      {filteredViewLedgers.map(l => (
                        <SelectItem key={String(l.id)} value={String(l.id)}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* ── Main view area ─────────────────────────────────────────────────── */}
              <AnimatePresence mode="wait">
                {viewLoading ? (
                  /* Skeleton loading */
                  <motion.div
                    key="skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="dashboard-card p-0 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-border bg-secondary/50">
                      <Skeleton className="h-4 w-48" />
                    </div>
                    <div className="divide-y divide-border/50">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-3">
                          <Skeleton className="h-3 w-6" />
                          <Skeleton className="h-3 flex-1 max-w-[200px]" />
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-24 ml-auto" />
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2 border-t border-border bg-secondary/30 text-center">
                      <span className="text-xs text-muted-foreground animate-pulse">Loading Ledger Data…</span>
                    </div>
                  </motion.div>
                ) : viewLedger ? (
                  /* Day-wise ledger drill-down */
                  <motion.div
                    key="dayview"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <LedgerDayView
                      ledger={viewLedger}
                      period={period}
                      financeId={financeId}
                      onBack={() => setViewLedger(null)}
                    />
                  </motion.div>
                ) : viewMode === "ledger" ? (
                  /* ── LEDGER VIEW — flat Tally Prime table ── */
                  <motion.div
                    key="ledger-view"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="dashboard-card p-0 overflow-hidden"
                  >
                    {(() => {
                      const rows = filteredViewLedgers.filter(
                        l => viewGroupFilter === "all" || l.group === viewGroupFilter
                      );
                      const showObCol = config.generalDetails.provideOpeningBalances;
                      const colCount = showObCol ? 7 : 6;

                      const totalOpeningNet = rows.reduce((s, l) => {
                        const ob = l.opening ?? l.openingBalance ?? 0;
                        const side = l.openingSide ?? l.balanceType;
                        return s + (side === "Cr" ? -ob : ob);
                      }, 0);
                      const totalPeriodDr = rows.reduce((s, l) => s + (l.periodDr ?? 0), 0);
                      const totalPeriodCr = rows.reduce((s, l) => s + (l.periodCr ?? 0), 0);
                      const totalClosingNet = rows.reduce((s, l) => {
                        const cl = l.closing ?? l.openingBalance ?? 0;
                        const side = l.closingSide ?? l.balanceType;
                        return s + (side === "Cr" ? -cl : cl);
                      }, 0);

                      return (
                        <>
                          <div className="px-4 py-2.5 border-b border-border bg-secondary/50 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              List of Ledgers
                              {viewGroupFilter !== "all" && (
                                <span className="ml-2 text-primary">— {viewGroupFilter}</span>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {rows.length} entries
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-border bg-secondary/30">
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-14">Sl. No.</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Name of Ledger</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Under</th>
                                  {showObCol && (
                                    <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Opening Balance</th>
                                  )}
                                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Debit</th>
                                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Credit</th>
                                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Closing Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((l, i) => {
                                  const obVal = l.opening ?? l.openingBalance ?? 0;
                                  const obSide = l.openingSide ?? l.balanceType;
                                  const pDr = l.periodDr ?? 0;
                                  const pCr = l.periodCr ?? 0;
                                  const clVal = l.closing ?? l.openingBalance ?? 0;
                                  const clSide = l.closingSide ?? l.balanceType;

                                  return (
                                    <tr
                                      key={l.id}
                                      className="border-b border-border/40 hover:bg-secondary/30 transition-colors cursor-pointer"
                                      onClick={() => setViewLedger(l)}
                                    >
                                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                                      <td className="px-4 py-2.5 text-sm text-foreground font-medium">{l.name}</td>
                                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.group}</td>
                                      {showObCol && (
                                        <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-right">
                                          {obVal === 0 ? (
                                            <span className="text-muted-foreground">—</span>
                                          ) : (
                                            <span className={obSide === "Dr" ? "text-foreground" : "text-income"}>
                                              ₹{obVal.toLocaleString("en-IN")} {obSide}
                                            </span>
                                          )}
                                        </td>
                                      )}
                                      <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-right">
                                        {pDr === 0 ? (
                                          <span className="text-muted-foreground">—</span>
                                        ) : (
                                          <span className="text-expense">₹{pDr.toLocaleString("en-IN")}</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-right">
                                        {pCr === 0 ? (
                                          <span className="text-muted-foreground">—</span>
                                        ) : (
                                          <span className="text-income">₹{pCr.toLocaleString("en-IN")}</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-right">
                                        {clVal === 0 ? (
                                          <span className="text-muted-foreground">—</span>
                                        ) : (
                                          <span className={clSide === "Dr" ? "text-foreground" : "text-income"}>
                                            ₹{clVal.toLocaleString("en-IN")} {clSide}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {rows.length === 0 && (
                                  <tr>
                                    <td colSpan={colCount} className="px-4 py-10 text-center text-sm text-muted-foreground">
                                      No ledgers found{viewSearch ? ` for "${viewSearch}"` : ""}.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                              {rows.length > 0 && (
                                <tfoot>
                                  <tr className="border-t-2 border-border bg-secondary/40">
                                    <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                                      Total
                                    </td>
                                    {showObCol && (
                                      <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
                                        ₹{Math.abs(totalOpeningNet).toLocaleString("en-IN")} {totalOpeningNet >= 0 ? "Dr" : "Cr"}
                                      </td>
                                    )}
                                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
                                      ₹{totalPeriodDr.toLocaleString("en-IN")}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
                                      ₹{totalPeriodCr.toLocaleString("en-IN")}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
                                      ₹{Math.abs(totalClosingNet).toLocaleString("en-IN")} {totalClosingNet >= 0 ? "Dr" : "Cr"}
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                ) : viewMode === "gst" ? (
                  /* ── GST DETAILS VIEW (Alt+H) ── */
                  <motion.div
                    key="gst-view"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="dashboard-card p-0 overflow-hidden"
                  >
                    {(() => {
                      const showGstCols = config.partyTaxRegistrationDetails.gstRegistrationDetails;
                      const colCount = showGstCols ? 6 : 4;
                      return (
                        <>
                          <div className="px-4 py-2.5 border-b border-border bg-secondary/50 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Ledger GST Details
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {filteredViewDetails.length} entries
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-border bg-secondary/30">
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-14">Sl. No.</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Name of Ledger</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Under</th>
                                  {showGstCols && (
                                    <>
                                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">GSTIN/UIN</th>
                                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Registration Type</th>
                                    </>
                                  )}
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">PAN / IT No.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredViewDetails.map((d, i) => (
                                  <tr
                                    key={d.id}
                                    className="border-b border-border/40 hover:bg-secondary/30 transition-colors cursor-pointer"
                                    onClick={() => {
                                      const found = viewLedgers.find(l => String(l.id) === String(d.id));
                                      if (found) setViewLedger(found);
                                    }}
                                  >
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                                    <td className="px-4 py-2.5 text-sm text-foreground font-medium">{d.ledger_name}</td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{d.group_name || "—"}</td>
                                    {showGstCols && (
                                      <>
                                        <td className="px-4 py-2.5 text-sm font-mono tabular-nums">
                                          {d.gstin ? (
                                            <span className="text-foreground">{d.gstin}</span>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                          {d.reg_type ? (
                                            <Badge variant="outline" className="text-[10px]">{d.reg_type}</Badge>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </td>
                                      </>
                                    )}
                                    <td className="px-4 py-2.5 text-sm font-mono tabular-nums">
                                      {d.pan_number ? (
                                        <span className="text-foreground">{d.pan_number}</span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {filteredViewDetails.length === 0 && (
                                  <tr>
                                    <td colSpan={colCount} className="px-4 py-10 text-center text-sm text-muted-foreground">
                                      No ledgers found{viewSearch ? ` for "${viewSearch}"` : ""}.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                ) : viewMode === "contact" ? (
                  /* ── CONTACT DETAILS VIEW (Alt+H) ── */
                  <motion.div
                    key="contact-view"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="dashboard-card p-0 overflow-hidden"
                  >
                    {(() => {
                      const showMailing = config.partyDetails.provideMailingDetails;
                      const colCount = showMailing ? 7 : 6;
                      return (
                        <>
                          <div className="px-4 py-2.5 border-b border-border bg-secondary/50 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Ledger Contact Details
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {filteredViewDetails.length} entries
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-border bg-secondary/30">
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-14">Sl. No.</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Name of Ledger</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Under</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Contact Person</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Mobile</th>
                                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Email</th>
                                  {showMailing && (
                                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">City / State</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {filteredViewDetails.map((d, i) => {
                                  const phone = d.mobile || d.primary_mobile || null;
                                  const cityState = [d.city, d.state].filter(Boolean).join(", ");
                                  return (
                                    <tr
                                      key={d.id}
                                      className="border-b border-border/40 hover:bg-secondary/30 transition-colors cursor-pointer"
                                      onClick={() => {
                                        const found = viewLedgers.find(l => String(l.id) === String(d.id));
                                        if (found) setViewLedger(found);
                                      }}
                                    >
                                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                                      <td className="px-4 py-2.5 text-sm text-foreground font-medium">{d.ledger_name}</td>
                                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{d.group_name || "—"}</td>
                                      <td className="px-4 py-2.5 text-sm">
                                        {d.contact_person ? (
                                          <span className="text-foreground">{d.contact_person}</span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-sm font-mono tabular-nums">
                                        {phone ? (
                                          <span className="text-foreground">{phone}</span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-xs">
                                        {d.email ? (
                                          <span className="text-foreground">{d.email}</span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      {showMailing && (
                                        <td className="px-4 py-2.5 text-xs">
                                          {cityState ? (
                                            <span className="text-foreground">{cityState}</span>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                                {filteredViewDetails.length === 0 && (
                                  <tr>
                                    <td colSpan={colCount} className="px-4 py-10 text-center text-sm text-muted-foreground">
                                      No ledgers found{viewSearch ? ` for "${viewSearch}"` : ""}.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                ) : viewMode === "monthly" ? (
                  /* ── MONTHLY SUMMARY VIEW (Alt+H) ── */
                  <motion.div
                    key="monthly-view"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <LedgerMonthlyView
                      ledgers={filteredViewLedgers}
                      allLedgers={viewLedgers}
                      selectedLedgerId={monthlyLedgerId}
                      onSelectLedgerId={setMonthlyLedgerId}
                      period={period}
                      financeId={financeId}
                    />
                  </motion.div>
                ) : (
                  /* ── GROUP VIEW — hierarchical tree (like LedgerGroups.tsx) ── */
                  <motion.div
                    key="group-view"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {viewDataLoading ? (
                      <div className="dashboard-card p-8 text-center text-sm text-muted-foreground animate-pulse">
                        Loading group tree…
                      </div>
                    ) : (
                      <LedgerHierarchyView
                        ledgers={viewLedgers}
                        groups={viewGroups}
                        search={viewSearch}
                        onSelectLedger={(l) => setViewLedger(l)}
                        category={category}
                        onRefresh={fetchViewData}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </TabsContent>
        </Tabs>

        {/* ═══════ NEW GROUP DIALOG ═══════ */}
        <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
              <DialogDescription>Add a new ledger group (Alt+C)</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Group Name</Label>
                <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Bank OD Accounts" autoFocus />
              </div>
              <Button onClick={() => {
                if (newGroupName.trim()) {
                  setGroups(prev => [...prev, newGroupName.trim()].sort());
                  setGroup(newGroupName.trim());
                  setGroupSearch(newGroupName.trim());
                  toast.success(`Group "${newGroupName}" created`);
                  setNewGroupName("");
                  setShowNewGroup(false);
                }
              }} className="w-full">Create Group</Button>
            </div>
          </DialogContent>
        </Dialog>


        {/* ═══════ ConfigDialog F12 ═══════ */}
        <ConfigDialog open={showConfigDialog} onClose={() => setShowConfigDialog(false)} />

        {/* ═══════ MULTI LEDGER (Ctrl+H) ═══════ */}
        <MultiLedgerSelector
          open={multiSelector}
          onClose={() => setMultiSelector(false)}
          onSelect={(c) => { setMultiSelector(false); setMultiChoice(c); }}
        />
        {multiChoice && (
          <MultiLedger
            mode={multiChoice.mode}
            presetGroup={multiChoice.presetGroup}
            titleOverride={multiChoice.titleOverride}
            groups={groups}
            existing={viewLedgers.length ? viewLedgers : ledgers}
            onClose={() => setMultiChoice(null)}
            onSave={async (rows: MultiRow[]) => {
              if (multiChoice.mode === "alter") {
                try {
                  const updates = rows.filter(r => r.id && r.name.trim());
                  for (const r of updates) {
                    const groupName = (r.group.trim() || multiChoice.presetGroup || "").trim();
                    const match = groupOptions.find(g => g.group_name.toLowerCase() === groupName.toLowerCase());
                    const payload: Record<string, unknown> = {
                      ledger_name: r.name.trim(),
                      opening_balance: parseFloat(r.opening) || 0,
                      ob_type: r.drCr,
                    };
                    if (match) {
                      payload.under_id = match.id;
                      payload.under_source = match.source;
                    }
                    if (r.creditLimit !== undefined) {
                      payload.creditLimit = parseFloat(r.creditLimit) || null;
                    }
                    if (r.dueDays !== undefined) {
                      payload.defaultCreditPeriod = r.dueDays;
                    }
                    await apiUpdateLedger(String(r.id), payload);
                  }
                  toast.success(`${updates.length} ledger(s) updated`);
                  fetchViewData();
                  fetchSummary();
                  fetchRecentCreated();
                  setMultiChoice(null);
                } catch (err: unknown) {
                  const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
                  toast.error(apiErr?.response?.data?.message || apiErr?.message || "Failed to update ledgers");
                }
              } else {
                const unresolved: string[] = [];
                const apiRows = rows.map(r => {
                  const groupName = (r.group.trim() || multiChoice.presetGroup || "").trim();
                  const match = groupOptions.find(g => g.group_name.toLowerCase() === groupName.toLowerCase());
                  if (!match) unresolved.push(r.name || groupName);
                  return {
                    ledger_name: r.name.trim(),
                    opening_balance: parseFloat(r.opening) || 0,
                    ob_type: r.drCr,
                    under_id: match?.id,
                    under_source: match?.source,
                    creditLimit: r.creditLimit ? parseFloat(r.creditLimit) : undefined,
                    creditDays: r.dueDays ? parseInt(r.dueDays, 10) : undefined,
                    maintainBillWise: Boolean(r.creditLimit || r.dueDays),
                  };
                });

                if (unresolved.length) {
                  toast.error(`Could not resolve "Under" group for: ${unresolved.join(", ")}`);
                  return;
                }

                try {
                  const res = await apiMultiCreateLedger(apiRows as unknown as Parameters<typeof apiMultiCreateLedger>[0]);
                  if (!res.data?.success) throw new Error(res.data?.message || "Failed to create ledgers");
                } catch (err: unknown) {
                  const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
                  toast.error(apiErr?.response?.data?.message || apiErr?.message || "Failed to create ledgers");
                  return;
                }

                const newOnes: LedgerEntry[] = rows.map((r, i) => {
                  const gName = (r.group.trim() || multiChoice.presetGroup || "").trim();
                  const match = groupOptions.find(g => g.group_name.toLowerCase() === gName.toLowerCase());
                  return {
                    id: Date.now() + i,
                    name: r.name.trim(),
                    group: gName,
                    groupId: match?.id ?? null,
                    groupSource: (match?.source as "system" | "custom" | null) ?? null,
                    openingBalance: parseFloat(r.opening) || 0,
                    balanceType: r.drCr,
                    effectiveDate: "2025-04-01",
                    createdAt: Date.now() + i,
                  };
                });
                setLedgers(prev => [...prev, ...newOnes]);
                toast.success(`${newOnes.length} ledger(s) created`);
                fetchRecentCreated();
                fetchSummary();
                fetchViewData();
                setMultiChoice(null);
              }
            }}
          />
        )}

        {/* ═══════ CHANGE VIEW DIALOG (Alt+H) ═══════ */}
        <Dialog open={showChangeView} onOpenChange={setShowChangeView}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Change View (Alt+H)
              </DialogTitle>
              <DialogDescription>Select a view to apply instantly. Period and company are preserved.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Available Views */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Available Views</p>
                {AVAILABLE_VIEWS.map(v => (
                  <button
                    key={v.key}
                    onClick={() => {
                      setActiveTab("view");
                      if (v.key === "monthly") {
                        if (viewLedger) {
                          setMonthlyLedgerId(String(viewLedger.id));
                        }
                        setViewMode("monthly");
                        setViewLedger(null);
                      } else if (
                        v.key === "ledger" ||
                        v.key === "group" ||
                        v.key === "gst" ||
                        v.key === "contact"
                      ) {
                        setViewMode(v.key as ViewModeKey);
                        setViewLedger(null);
                      } else {
                        setViewMode("ledger");
                        setViewLedger(null);
                      }
                      setShowChangeView(false);
                    }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors
                      ${(v.key === viewMode) ? "bg-primary/10 text-primary border border-primary/30" : "hover:bg-secondary/50 text-foreground border border-transparent"}`}
                  >
                    {(v.key === viewMode) && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    {v.label}
                  </button>
                ))}
              </div>

              {/* Saved Views */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Saved Views</p>
                {SAVED_VIEWS.map(sv => (
                  <button
                    key={sv}
                    onClick={() => {
                      setActiveTab("view");
                      setViewLedger(null);
                      if (sv.toLowerCase().includes("chart")) {
                        setViewMode("group");
                      } else {
                        setViewMode("ledger");
                      }
                      setShowChangeView(false);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary/50 text-foreground border border-transparent transition-colors"
                  >
                    <Save className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{sv}</span>
                  </button>
                ))}
              </div>

              {/* Related Reports */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Related Reports</p>
                {RELATED_REPORTS.map(rr => (
                  <button
                    key={rr}
                    onClick={() => {
                      setActiveTab("view");
                      if (rr === "Ledger Contact Details") {
                        setViewLedger(null);
                        setViewMode("contact");
                      } else if (rr === "Monthly Summary") {
                        if (viewLedger) setMonthlyLedgerId(String(viewLedger.id));
                        setViewLedger(null);
                        setViewMode("monthly");
                      } else {
                        setViewLedger(null);
                        setViewMode("ledger");
                      }
                      setShowChangeView(false);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary/50 text-foreground border border-transparent transition-colors"
                  >
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    {rr}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowChangeView(false)}>Close (Esc)</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ═══════ PERIOD SELECTION DIALOG (F2) ═══════ */}
        <Dialog open={showPeriodDlg} onOpenChange={setShowPeriodDlg}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Period Selection (F2)
              </DialogTitle>
              <DialogDescription>Select a preset or enter a custom date range.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Preset options */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["month", "Current Month"],
                  ["quarter", "Current Quarter"],
                  ["year", "Current Year"],
                  ["custom", "Custom Period"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => applyPeriodPreset(key)}
                    className={`px-3 py-2.5 rounded-lg text-sm border transition-colors text-left font-medium
                      ${periodPreset === key ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary/50 text-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Date inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
                  <DatePicker
                    value={periodFrom}
                    onChange={e => { setPeriodFrom(e.target.value); setPeriodPreset("custom"); }}
                    placeholder="From Date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
                  <DatePicker
                    value={periodTo}
                    onChange={e => { setPeriodTo(e.target.value); setPeriodPreset("custom"); }}
                    placeholder="To Date"
                  />
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs font-mono text-muted-foreground">
                <span className="text-foreground font-semibold">Selected: </span>
                {fmtDate(periodFrom)} → {fmtDate(periodTo)}
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowPeriodDlg(false)}>Cancel (Esc)</Button>
                <Button size="sm" onClick={applyPeriod}>Apply Period</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ═══════ COMPANY SELECTION DIALOG (F3) ═══════ */}
        <Dialog open={showCompanyDlg} onOpenChange={setShowCompanyDlg}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Company Selection (F3)
              </DialogTitle>
              <DialogDescription>Switching company refreshes ledger data. View, filters, and search are preserved.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-2">
              {availableFinances.map(f => {
                const isSelected = String(currentFinance?.id) === String(f.id);
                const displayName = f.name || f.finance_name || `Company ${f.id}`;
                return (
                  <button
                    key={String(f.id)}
                    onClick={() => handleSwitchCompany(f.id, displayName)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors
                      ${isSelected ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-secondary/50 text-foreground"}`}
                  >
                    <Building2 className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    {displayName}
                    {isSelected && <Badge className="ml-auto text-[10px]">Active</Badge>}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowCompanyDlg(false)}>Close (Esc)</Button>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}

// ─── LedgerHierarchyView ─────────────────────────────────────────────────────
// Builds the group tree from the real API data (UnderDropdownItem[]) rather
// than the static HIER_GROUPS hardcode.  Ledgers are placed under their group
// by (groupId, groupSource) — an exact id-based match — so they appear in the
// correct node even when group names differ slightly from the master list.

/** A single node in the live group tree */
interface LiveGroup {
  key: string;                       // "<source>:<id>" — unique within the tree
  id: string | number;
  source: "system" | "custom";
  name: string;
  nature: HierNature;
  parentKey: string | null;
}

function toLiveGroup(g: UnderDropdownItem): LiveGroup {
  const parentKey = g.system_parent_id
    ? `system:${g.system_parent_id}`
    : g.custom_parent_id
      ? `custom:${g.custom_parent_id}`
      : null;
  return {
    key: `${g.source}:${g.id}`,
    id: g.id,
    source: g.source,
    name: g.group_name,
    // UnderDropdownItem uses 'Expenses' (plural); HierNature uses 'Expense' (singular)
    nature: (g.nature === "Expenses" ? "Expense" : g.nature) as HierNature,
    parentKey,
  };
}

// Category-based root filter using nature field from the API
const CAT_NATURE: Record<string, HierNature | null> = {
  ASSETS: "Assets",
  LIABILITIES: "Liabilities",
  INCOME: "Income",
  EXPENSES: "Expense",
  OTHERS: null,
  ALL: null,
};

function LedgerHierarchyView({
  ledgers,
  groups,
  search,
  onSelectLedger,
  category,
  onRefresh,
}: {
  ledgers: LedgerEntry[];
  groups: UnderDropdownItem[];
  search: string;
  onSelectLedger: (l: LedgerEntry) => void;
  category: "ALL" | "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS";
  onRefresh?: () => void;
}) {
  // Convert flat UnderDropdownItem[] into LiveGroup[] keyed by "<source>:<id>"
  const liveGroups = useMemo<Record<string, LiveGroup>>(() => {
    const map: Record<string, LiveGroup> = {};
    groups.forEach(g => {
      const lg = toLiveGroup(g);
      map[lg.key] = lg;
    });
    return map;
  }, [groups]);

  // parent-key → sorted children
  const childMap = useMemo<Record<string, LiveGroup[]>>(() => {
    const map: Record<string, LiveGroup[]> = {};
    Object.values(liveGroups).forEach(lg => {
      const pk = lg.parentKey ?? "__root__";
      if (!map[pk]) map[pk] = [];
      map[pk].push(lg);
    });
    // Sort each bucket alphabetically
    Object.values(map).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [liveGroups]);

  // group-key → ledgers that belong directly to that group
  const ledgersByGroupKey = useMemo<Record<string, LedgerEntry[]>>(() => {
    const map: Record<string, LedgerEntry[]> = {};
    ledgers.forEach(l => {
      if (!l.groupId || !l.groupSource) return;
      const key = `${l.groupSource}:${l.groupId}`;
      if (!map[key]) map[key] = [];
      map[key].push(l);
    });
    return map;
  }, [ledgers]);

  // Root groups (no parent in our tree)
  const roots = useMemo(
    () => (childMap["__root__"] || []).filter(g => !g.parentKey),
    [childMap]
  );

  const q = search.toLowerCase().trim();

  // Recursive check — true if the subtree rooted at `key` has anything matching q
  const hasMatch = useCallback((key: string): boolean => {
    if (!q) return true;
    const lg = liveGroups[key];
    if (!lg) return false;
    if (lg.name.toLowerCase().includes(q)) return true;
    const leds = ledgersByGroupKey[key] || [];
    if (leds.some(l => l.name.toLowerCase().includes(q))) return true;
    return (childMap[key] || []).some(c => hasMatch(c.key));
  }, [q, liveGroups, ledgersByGroupKey, childMap]);

  const visibleRoots = useMemo(() => {
    return roots.filter(r => {
      if (category === "ALL") return hasMatch(r.key);
      if (category === "OTHERS") {
        const known: HierNature[] = ["Assets", "Liabilities", "Income", "Expense"];
        return !known.includes(r.nature) && hasMatch(r.key);
      }
      const needed = CAT_NATURE[category];
      return r.nature === needed && hasMatch(r.key);
    });
  }, [roots, category, hasMatch]);

  const isEmpty = visibleRoots.length === 0;

  return (
    <div className="space-y-2">
      {/* Refresh + count bar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {ledgers.length} ledger{ledgers.length !== 1 ? "s" : ""} across {Object.keys(ledgersByGroupKey).length} group{Object.keys(ledgersByGroupKey).length !== 1 ? "s" : ""}
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        )}
      </div>

      {visibleRoots.map(root => (
        <LedgerTreeNode
          key={root.key}
          groupKey={root.key}
          liveGroups={liveGroups}
          childMap={childMap}
          ledgersByGroupKey={ledgersByGroupKey}
          onSelectLedger={onSelectLedger}
          level={0}
          search={search}
          hasMatch={hasMatch}
        />
      ))}

      {isEmpty && (
        <div className="text-center text-sm text-muted-foreground py-12">
          {q ? `No results found for "${search}".` : "No ledgers to display in this category."}
        </div>
      )}
    </div>
  );
}

// ─── LedgerTreeNode ───────────────────────────────────────────────────────────
// Recursive node.  Uses (source:id) keys throughout — no name-based lookups.

function LedgerTreeNode({
  groupKey,
  liveGroups,
  childMap,
  ledgersByGroupKey,
  onSelectLedger,
  level,
  search,
  hasMatch,
  ancestorMatched = false,
}: {
  groupKey: string;
  liveGroups: Record<string, LiveGroup>;
  childMap: Record<string, LiveGroup[]>;
  ledgersByGroupKey: Record<string, LedgerEntry[]>;
  onSelectLedger: (l: LedgerEntry) => void;
  level: number;
  search: string;
  hasMatch: (key: string) => boolean;
  ancestorMatched?: boolean;
}) {
  const [open, setOpen] = useState(level === 0 || !!search);
  useEffect(() => { if (search) setOpen(true); }, [search]);

  const group = liveGroups[groupKey];
  if (!group) return null;

  const children = (childMap[groupKey] || []);
  const allLedgers = ledgersByGroupKey[groupKey] || [];
  const q = search.toLowerCase().trim();
  const selfOrAncestorMatched = ancestorMatched || (!!q && group.name.toLowerCase().includes(q));

  const visibleLedgers = q
    ? selfOrAncestorMatched
      ? allLedgers
      : allLedgers.filter(l => l.name.toLowerCase().includes(q))
    : allLedgers;

  const visibleChildren = q
    ? selfOrAncestorMatched
      ? children
      : children.filter(c => hasMatch(c.key))
    : children;
  const hasContent = visibleChildren.length > 0 || allLedgers.length > 0;

  if (q && !selfOrAncestorMatched && !hasMatch(groupKey)) return null;

  // Group-level totals across the entire subtree (direct ledgers + child groups)
  const collectSubtreeLedgers = (k: string): LedgerEntry[] => {
    const direct = ledgersByGroupKey[k] || [];
    const sub = (childMap[k] || []).flatMap(c => collectSubtreeLedgers(c.key));
    return [...direct, ...sub];
  };
  const subtreeLedgers = collectSubtreeLedgers(groupKey);
  const totalDr = subtreeLedgers
    .filter(l => (l.closingSide ?? l.balanceType) === "Dr")
    .reduce((s, l) => s + (l.closing ?? l.openingBalance ?? 0), 0);
  const totalCr = subtreeLedgers
    .filter(l => (l.closingSide ?? l.balanceType) === "Cr")
    .reduce((s, l) => s + (l.closing ?? l.openingBalance ?? 0), 0);

  return (
    <div style={{ marginLeft: level * 16 }}>
      <div className={`dashboard-card !p-0 overflow-hidden ${level > 0 ? "!rounded-lg" : ""}`}>
        <button
          onClick={() => hasContent && setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors text-sm group/node"
        >
          <div className="flex items-center gap-2">
            {hasContent ? (
              open
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
            <span className="font-medium text-foreground">{group.name}</span>
            {visibleChildren.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">{visibleChildren.length} sub</Badge>
            )}
            {allLedgers.length > 0 && (
              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                {allLedgers.length} ledger{allLedgers.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-3 text-xs font-mono tabular-nums">
              {totalDr > 0 && <span className="text-foreground">Dr ₹{totalDr.toLocaleString("en-IN")}</span>}
              {totalCr > 0 && <span className="text-income">Cr ₹{totalCr.toLocaleString("en-IN")}</span>}
            </div>
            <Badge variant="outline" className={`text-[9px] ${HIER_NATURE_COLORS[group.nature]}`}>
              {group.nature}
            </Badge>
          </div>
        </button>
      </div>

      <AnimatePresence>
        {open && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-1 mt-1 overflow-hidden"
          >
            {/* Child sub-groups */}
            {visibleChildren.map(c => (
              <LedgerTreeNode
                key={c.key}
                groupKey={c.key}
                liveGroups={liveGroups}
                childMap={childMap}
                ledgersByGroupKey={ledgersByGroupKey}
                onSelectLedger={onSelectLedger}
                level={level + 1}
                search={search}
                hasMatch={hasMatch}
                ancestorMatched={selfOrAncestorMatched}
              />
            ))}

            {/* Leaf ledgers under this group */}
            {visibleLedgers.length > 0 && (
              <div
                style={{ marginLeft: (level + 1) * 16 + 8 }}
                className="space-y-0.5 border-l border-border/40 pl-1"
              >
                {visibleLedgers
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(l => {
                    const bal = l.closing ?? l.openingBalance ?? 0;
                    const side = l.closingSide ?? l.balanceType;
                    return (
                      <button
                        key={l.id}
                        onClick={() => onSelectLedger(l)}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs hover:bg-secondary/50 transition-colors group/leaf"
                      >
                        <span className="flex items-center gap-2 text-muted-foreground group-hover/leaf:text-foreground">
                          <FileText className="h-3 w-3 opacity-50" />
                          {l.name}
                        </span>
                        <span className="font-mono tabular-nums">
                          {bal > 0 ? (
                            <span className={side === "Dr" ? "text-foreground" : "text-income"}>
                              {side} ₹{bal.toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Monthly Summary View (Alt+H) ────────────────────────────────────────────
function LedgerMonthlyView({
  ledgers,
  allLedgers,
  selectedLedgerId,
  onSelectLedgerId,
  period,
  financeId,
}: {
  ledgers: LedgerEntry[];
  allLedgers: LedgerEntry[];
  selectedLedgerId: string;
  onSelectLedgerId: (id: string) => void;
  period: PeriodState;
  financeId: string;
}) {
  const [monthlyData, setMonthlyData] = useState<LedgerMonthlyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  // Derive FY label from period.from (Apr–Mar)
  const fyLabel = useMemo(() => {
    const m = /^(\d{4})-(\d{2})/.exec(period.from || "");
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const startY = mo >= 4 ? y : y - 1;
      return `${startY}-${startY + 1}`;
    }
    return getFinancialYear();
  }, [period.from]);

  useEffect(() => {
    if (!selectedLedgerId || !financeId) {
      setMonthlyData(null);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setMonthlyData(null);
    apiGetLedgerMonthly(selectedLedgerId, fyLabel)
      .then(res => {
        if (reqIdRef.current !== reqId) return;
        if (res.data?.success && res.data?.data) {
          setMonthlyData(res.data.data);
        }
      })
      .catch((err: { response?: { data?: { message?: string } }; message?: string }) => {
        if (reqIdRef.current !== reqId) return;
        toast.error(err?.response?.data?.message || err?.message || "Failed to load monthly summary");
      })
      .finally(() => {
        if (reqIdRef.current === reqId) {
          setLoading(false);
        }
      });
  }, [selectedLedgerId, fyLabel, financeId]);

  const selectedLedger = useMemo(
    () => allLedgers.find(l => String(l.id) === String(selectedLedgerId)) || null,
    [allLedgers, selectedLedgerId]
  );

  if (!selectedLedgerId) {
    return (
      <div className="dashboard-card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-secondary/50 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Monthly Summary — Select a Ledger ({fyLabel})
          </span>
          <span className="text-xs text-muted-foreground">
            {ledgers.length} ledgers
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-14">Sl. No.</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Name of Ledger</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Under</th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.map((l, i) => {
                const cl = l.closing ?? l.openingBalance ?? 0;
                const side = l.closingSide ?? l.balanceType;
                return (
                  <tr
                    key={l.id}
                    className="border-b border-border/40 hover:bg-secondary/30 transition-colors cursor-pointer"
                    onClick={() => onSelectLedgerId(String(l.id))}
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground font-medium">{l.name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.group}</td>
                    <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-right">
                      {cl === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={side === "Dr" ? "text-foreground" : "text-income"}>
                          ₹{cl.toLocaleString("en-IN")} {side}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {ledgers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No ledgers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const months = monthlyData?.months || [];
  const totalDr = months.reduce((s, m) => s + (m.debit || 0), 0);
  const totalCr = months.reduce((s, m) => s + (m.credit || 0), 0);
  const lastMonth = months[months.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => onSelectLedgerId("")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="text-lg font-bold text-foreground">
            {monthlyData?.ledger?.ledger_name || selectedLedger?.name || "Monthly Summary"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {monthlyData?.ledger?.group_name || selectedLedger?.group || "—"} • FY {fyLabel} • Opening: ₹
            {(monthlyData?.opening?.abs ?? 0).toLocaleString("en-IN")} {monthlyData?.opening?.side ?? "Dr"}
          </p>
        </div>
      </div>

      <div className="dashboard-card p-0 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border/50">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-24 ml-auto" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50 sticky top-0">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Month</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Debit</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Credit</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {months.map(m => (
                  <tr key={m.month} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-2 text-sm text-foreground font-medium">{m.month_label || m.month}</td>
                    <td className="px-4 py-2 text-sm font-mono tabular-nums text-right">
                      {m.debit > 0 ? <span className="text-expense">₹{m.debit.toLocaleString("en-IN")}</span> : "—"}
                    </td>
                    <td className="px-4 py-2 text-sm font-mono tabular-nums text-right">
                      {m.credit > 0 ? <span className="text-income">₹{m.credit.toLocaleString("en-IN")}</span> : "—"}
                    </td>
                    <td className="px-4 py-2 text-sm font-mono tabular-nums font-semibold text-right">
                      {m.closing_abs > 0 ? (
                        <span className={m.closing_side === "Dr" ? "text-foreground" : "text-income"}>
                          ₹{m.closing_abs.toLocaleString("en-IN")} {m.closing_side}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {months.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/40">
                    <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Total / Closing</td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
                      ₹{totalDr.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
                      ₹{totalCr.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
                      ₹{(lastMonth?.closing_abs ?? 0).toLocaleString("en-IN")} {lastMonth?.closing_side ?? "Dr"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day-wise Ledger View ─────────────────────────────────────────────────────
function LedgerDayView({
  ledger,
  period,
  financeId,
  onBack,
}: {
  ledger: LedgerEntry;
  period: PeriodState;
  financeId: string;
  onBack: () => void;
}) {
  const [statement, setStatement] = useState<LedgerStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const ledgerId = String(ledger.id || "");
    if (!ledgerId || ledgerId === "-1" || !financeId) {
      setStatement(null);
      setLoading(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setStatement(null);

    apiGetLedgerStatement(ledgerId, { from: period.from, to: period.to })
      .then(res => {
        if (reqIdRef.current !== reqId) return;
        if (res.data?.success && res.data?.data) {
          setStatement(res.data.data);
        }
      })
      .catch((err: { response?: { data?: { message?: string } }; message?: string }) => {
        if (reqIdRef.current !== reqId) return;
        toast.error(err?.response?.data?.message || err?.message || "Failed to load ledger statement");
      })
      .finally(() => {
        if (reqIdRef.current === reqId) {
          setLoading(false);
        }
      });
  }, [ledger.id, period.from, period.to, financeId]);

  const openingDr = statement?.opening?.dr ?? 0;
  const openingCr = statement?.opening?.cr ?? 0;
  const openingNet = statement?.opening?.net ?? (openingDr - openingCr);
  const openingAbs = Math.abs(openingNet);
  const openingSide: "Dr" | "Cr" = openingNet >= 0 ? "Dr" : "Cr";

  const computedRows = useMemo(() => {
    const entries = statement?.entries || [];
    let runningPaise = Math.round(openingNet * 100);
    return entries.map(e => {
      const amt = Number(e.amount) || 0;
      const amtPaise = Math.round(amt * 100);
      const debit = e.entry_type === "Dr" ? amt : 0;
      const credit = e.entry_type === "Cr" ? amt : 0;
      runningPaise += e.entry_type === "Dr" ? amtPaise : -amtPaise;
      const balance = Number((Math.abs(runningPaise) / 100).toFixed(2));
      const side: "Dr" | "Cr" = runningPaise >= 0 ? "Dr" : "Cr";
      const particulars =
        e.counter_ledgers && e.counter_ledgers.length > 1
          ? "As per Details"
          : e.counter_ledgers && e.counter_ledgers.length === 1
          ? e.counter_ledgers[0]
          : e.narration || "—";

      return {
        voucherId: e.voucher_id,
        date: e.voucher_date,
        particular: particulars,
        voucherType: e.voucher_type,
        voucherNumber: e.voucher_number,
        debit,
        credit,
        balance,
        type: side,
      };
    });
  }, [statement, openingNet]);

  const periodTotalDr = statement?.period_total?.dr ?? 0;
  const periodTotalCr = statement?.period_total?.cr ?? 0;
  const closingDr = statement?.closing?.dr ?? 0;
  const closingCr = statement?.closing?.cr ?? 0;
  const closingNet = statement?.closing?.net ?? (closingDr - closingCr);
  const closingAbs = Math.abs(closingNet);
  const closingSide: "Dr" | "Cr" = closingNet >= 0 ? "Dr" : "Cr";

  const displayName = statement?.ledger?.ledger_name || ledger.name;
  const displayGroup = statement?.ledger?.group_name || ledger.group;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h3 className="text-lg font-bold text-foreground">{displayName}</h3>
          <p className="text-xs text-muted-foreground">
            {displayGroup} • Opening: ₹{openingAbs.toLocaleString("en-IN")} {openingSide} • Closing: ₹{closingAbs.toLocaleString("en-IN")} {closingSide}
          </p>
        </div>
      </div>
      <div className="dashboard-card p-0 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border/50">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 flex-1 max-w-[200px]" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24 ml-auto" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 sticky top-0">
                    {["Date", "Particulars", "Voucher Type", "Voucher No.", "Debit", "Credit", "Balance"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50 bg-secondary/20">
                    <td className="px-4 py-2 text-sm text-muted-foreground">{fmtDate(period.from)}</td>
                    <td className="px-4 py-2 text-sm font-medium text-foreground" colSpan={3}>Opening Balance</td>
                    <td className="px-4 py-2 text-sm font-mono tabular-nums">{openingDr > 0 ? `₹${openingDr.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-2 text-sm font-mono tabular-nums">{openingCr > 0 ? `₹${openingCr.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-2 text-sm font-mono tabular-nums font-semibold">₹{openingAbs.toLocaleString("en-IN")} {openingSide}</td>
                  </tr>
                  {computedRows.length === 0 ? (
                    <tr className="border-b border-border/50">
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No transactions found for this period.
                      </td>
                    </tr>
                  ) : (
                    computedRows.map((r, i) => (
                      <tr key={`${r.voucherId}-${i}`} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-2 text-sm text-muted-foreground">{fmtDate(r.date)}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{r.particular}</td>
                        <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.voucherType}</Badge></td>
                        <td className="px-4 py-2 text-sm font-mono tabular-nums text-muted-foreground">{r.voucherNumber}</td>
                        <td className="px-4 py-2 text-sm font-mono tabular-nums">{r.debit > 0 ? <span className="text-expense">₹{r.debit.toLocaleString("en-IN")}</span> : "—"}</td>
                        <td className="px-4 py-2 text-sm font-mono tabular-nums">{r.credit > 0 ? <span className="text-income">₹{r.credit.toLocaleString("en-IN")}</span> : "—"}</td>
                        <td className="px-4 py-2 text-sm font-mono tabular-nums font-semibold">₹{r.balance.toLocaleString("en-IN")} {r.type}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/40">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                      Period Total
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-foreground">
                      {periodTotalDr > 0 ? `₹${periodTotalDr.toLocaleString("en-IN")}` : "₹0"}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-foreground">
                      {periodTotalCr > 0 ? `₹${periodTotalCr.toLocaleString("en-IN")}` : "₹0"}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-muted-foreground">
                      —
                    </td>
                  </tr>
                  <tr className="border-t border-border bg-secondary/30">
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{fmtDate(period.to)}</td>
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                      Closing Balance
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-foreground">
                      {closingDr > 0 ? `₹${closingDr.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-foreground">
                      {closingCr > 0 ? `₹${closingCr.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-foreground">
                      ₹{closingAbs.toLocaleString("en-IN")} {closingSide}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {statement?.truncated && (
              <div className="px-4 py-2 border-t border-border bg-secondary/30 text-center">
                <span className="text-xs text-muted-foreground">
                  Showing only the first 2000 entries (of {statement.total}).
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
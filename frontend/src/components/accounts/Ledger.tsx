import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, ChevronDown, ChevronRight, Settings, Save, Trash2,
  Eye, ArrowLeft, ArrowRight, Keyboard, Building2, Calendar, LayoutList,
  TreePine, RefreshCw, FileText, Layers,
} from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Skeleton } from "../ui/skeleton";
import { toast } from "sonner";
import { MultiLedger, MultiLedgerSelector, MultiMode, MultiRow, SelectorChoice } from "../multiCreation/MultiLedger";
import { AdvancedLedgerFormPanel, AdvancedLedgerForm, UnderGroupOption } from "../accounts/AdvancedLedgerDialog";
import { ConfigDialog, ConfigProvider } from "./ConfigDialog";
import { getUnderDropdown, getLedgers as apiGetLedgers, createLedger as apiCreateLedger, updateLedger as apiUpdateLedger, multiCreateLedger as apiMultiCreateLedger, getRecentledgers, Recentledger, getLedgerDetails as apiGetLedgerDetails, LedgerDetails, UnderDropdownItem } from "../../api/accounting";
import { useAuth } from "@/contexts/AuthContext";
import { RecentActivityCard, RecentActivityItem } from "./RecentActivityCard";
import { RecentlyCreatedCard, RecentlyCreatedItem } from "./RecentlyCreatedCard";

/** Maps the Advanced Ledger form (UI field names) onto the create/update
 *  ledger API payload (DB column / form-comment names). The "Under" group
 *  is sent as { under_id, under_source } only — the backend resolves this
 *  into the mutually-exclusive group_id / master_group_id columns. */
function ledgerFormToPayload(l: AdvancedLedgerForm, finance_id: number | string) {
  if (!l.groupId || !l.groupSource) {
    throw new Error('Select a valid "Under" group before saving');
  }
  return {
    finance_id,
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
    maintainBillWise: l.maintainBillWise,
    defaultCreditPeriod: l.defaultCreditPeriod,
    checkCreditDaysDuringEntry: l.checkCreditDaysDuringEntry,
    mailingName: l.mailingName, addr1: l.addr1, addr2: l.addr2, addr3: l.addr3, addr4: l.addr4,
    city: l.city, state: l.state, pincode: l.pincode, country: l.country,
    provideContactDetails: l.provideContactDetails, contactPerson: l.contactPerson,
    telephone: l.telephone, mobile: l.mobile, primaryMobile: l.primaryMobile,
    email: l.email, website: l.website,
    provideBankDetails: l.provideBankDetails, accountHolderName: l.accountHolderName,
    bankName: l.bankName, accountNumber: l.accountNumber, ifsc: l.ifsc, swift: l.swift,
    branch: l.branch, accountType: l.accountType,
    panIt: l.panIt, gstin: l.gstin, registrationType: l.registrationType,
    taxType: l.taxType,
    msmeRegistered: l.msmeRegistered, udyamNumber: l.udyamNumber,
    einvoiceApplicable: l.einvoiceApplicable, defaultSupplyType: l.defaultSupplyType,
    ewayBillApplicable: l.ewayBillApplicable, defaultTransportMode: l.defaultTransportMode,
    defaultDistance: l.defaultDistance,
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

  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const b = (v: unknown) => v === 1 || v === true;

  return {
    name: s(l.ledger_name),
    alias: s(l.alias),
    aliasRegional: s(l.alias_regional),
    group: g ? s(g.group_name) : "",
    groupId: g ? (g.group_id ?? null) : null,
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
  id: number;
  name: string;
  group: string;          // display name — used for flat/ledger view
  groupId: string | number | null;    // acc_group_master.id  OR  acc_ledger_groups.id
  groupSource: "system" | "custom" | null; // which table groupId refers to
  openingBalance: number;
  balanceType: "Dr" | "Cr";
  effectiveDate: string;
  billWise?: boolean;
  creditPeriod?: number;
  address?: string;
  contact?: string;
  createdAt: number;
}


// ─── Sample data (replace with GET /api/ledgers/recent-activity) ───
const SAMPLE_RECENT_ACTIVITY: RecentActivityItem[] = [
  { id: "ra-1", name: "Cash", group: "Cash-in-Hand", lastUsedAt: "2025-04-20T15:42:00", voucherType: "Receipt", entries: 24 },
  { id: "ra-2", name: "SBI Current A/c", group: "Bank Accounts", lastUsedAt: "2025-04-20T12:10:00", voucherType: "Payment", entries: 18 },
  { id: "ra-3", name: "Rajesh Kumar", group: "Sundry Debtors", lastUsedAt: "2025-04-19T18:05:00", voucherType: "Receipt", entries: 9 },
  { id: "ra-4", name: "ABC Suppliers", group: "Sundry Creditors", lastUsedAt: "2025-04-19T11:20:00", voucherType: "Purchase", entries: 12 },
  { id: "ra-5", name: "Office Rent", group: "Indirect Expense", lastUsedAt: "2025-04-18T10:00:00", voucherType: "Payment", entries: 3 },
];


// ─── Ledger day-wise view data ───
const LEDGER_ENTRIES = [
  { date: "2025-04-02", particular: "Sales – Invoice #301", voucherType: "Receipt", debit: 0, credit: 15000 },
  { date: "2025-04-05", particular: "Purchase – Bill #201", voucherType: "Payment", debit: 8000, credit: 0 },
  { date: "2025-04-08", particular: "EMI Collection", voucherType: "Receipt", debit: 0, credit: 12000 },
  { date: "2025-04-10", particular: "Salary Payment", voucherType: "Payment", debit: 18000, credit: 0 },
  { date: "2025-04-12", particular: "Office Rent", voucherType: "Payment", debit: 25000, credit: 0 },
  { date: "2025-04-15", particular: "Penalty Collection", voucherType: "Receipt", debit: 0, credit: 5000 },
  { date: "2025-04-18", particular: "Vehicle Insurance", voucherType: "Journal", debit: 8500, credit: 0 },
  { date: "2025-04-20", particular: "Interest Received", voucherType: "Receipt", debit: 0, credit: 20000 },
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

// ─── Config options ───
interface ConfigState {
  billWise: boolean;
  gst: boolean;
  costCenters: boolean;
  multipleAddresses: boolean;
  bankDetails: boolean;
  billByBill: boolean;
}

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

const COMPANIES = ["Rimi Software", "Branch – Coimbatore", "Branch – Madurai"];

// ─── Helpers ───
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
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
function getGroupCategory(groupName: string): "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS" {
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
  const [editingLedgerId, setEditingLedgerId] = useState<number | null>(null);
  const [editingLedgerInitial, setEditingLedgerInitial] = useState<Partial<AdvancedLedgerForm> | undefined>(undefined);
  const [editingLedgerLoading, setEditingLedgerLoading] = useState(false);

  // ─── View-tab: real ledgers + groups fetched from the API ────────────────────
  // `viewLedgers`  — raw rows from GET /ledger/list (includes group_id, master_group_id, group_source)
  // `viewGroups`   — flat list from GET /ledger-groups/under-dropdown (system + custom, with parent ids)
  // Both are fetched whenever the View tab becomes active or financeId changes.
  const [viewLedgers, setViewLedgers] = useState<LedgerEntry[]>([]);
  const [viewGroups, setViewGroups] = useState<UnderDropdownItem[]>([]);
  const [viewDataLoading, setViewDataLoading] = useState(false);

  // TODO: replace with real finance/company id from auth/company context
  const { currentFinance } = useAuth();
  const financeId = currentFinance?.id ?? 0;

  // On mount: fetch all available parent groups (system + custom) from the DB
  // and merge with DEFAULT_GROUPS so the "Under" autocomplete always includes
  // both Tally predefined groups and any custom groups the user has created.
  useEffect(() => {
    getUnderDropdown()
      .then(res => {
        if (res.data?.success && Array.isArray(res.data?.data)) {
          const opts: UnderGroupOption[] = res.data.data.map((g: any) => ({
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
  }, []);

  // Maps a backend Recentledger record onto the shape RecentlyCreatedCard expects
  const mapRecentLedger = (r: Recentledger): RecentlyCreatedItem => ({
    id: r.id,
    name: r.ledger_name,
    group: r.reporting_under || (r.group as any)?.group_name || (r.group as any)?.name || "—",
    createdAt: r.created_at || new Date().toISOString(),
  });

  // Fetches the most recently created ledgers for the active company from the DB
  const fetchRecentCreated = useCallback(() => {
    if (!financeId) return;
    setRecentCreatedLoading(true);
    getRecentledgers()
      .then(res => {
        if (res.data?.success && Array.isArray(res.data?.data)) {
          setRecentCreated(res.data.data.map(mapRecentLedger));
          console.log('recentledgerCreation:', res.data.data)
        }
      })
      .catch(() => { /* silently keep whatever list we already have */ })
      .finally(() => setRecentCreatedLoading(false));
  }, [financeId]);

  // On mount, and whenever the active company changes, refresh the "Recently Created" list
  useEffect(() => {
    fetchRecentCreated();
  }, [fetchRecentCreated]);

  // ─── Fetch real ledger list + group tree for the View tab ────────────────────
  // Runs whenever the view tab is opened or financeId changes.
  const fetchViewData = useCallback(async () => {
    if (!financeId) return;
    setViewDataLoading(true);
    try {
      const [ledgersRes, groupsRes] = await Promise.all([
        apiGetLedgers(financeId),
        getUnderDropdown(),
      ]);

      if (groupsRes.data?.success && Array.isArray(groupsRes.data?.data)) {
        setViewGroups(groupsRes.data.data);
      }

      if (ledgersRes.data?.success && Array.isArray(ledgersRes.data?.data)) {
        // Map the raw API rows onto LedgerEntry so the rest of the view
        // layer (flat table, hierarchy tree, day-wise drill-down) can
        // consume a single unified shape.
        const mapped: LedgerEntry[] = ledgersRes.data.data.map((r: any) => ({
          id: r.id,
          name: r.ledger_name,
          group: r.group_name || r.reporting_under || "—",
          groupId: r.master_group_id ?? r.group_id ?? null,
          groupSource: r.group_source ?? (r.master_group_id ? "system" : r.group_id ? "custom" : null),
          openingBalance: r.opening_balance ?? 0,
          balanceType: (r.ob_type === "Cr" ? "Cr" : "Dr") as "Dr" | "Cr",
          effectiveDate: r.effective_date ? String(r.effective_date).slice(0, 10) : "",
          createdAt: 0,
        }));
        setViewLedgers(mapped);
      }
    } catch {
      // silently keep stale data — toast is noisy for a background refresh
    } finally {
      setViewDataLoading(false);
    }
  }, [financeId]);

  useEffect(() => {
    if (activeTab === "view") fetchViewData();
  }, [activeTab, fetchViewData]);

  // Fetches full details for a ledger by id and loads it into the Advanced
  // Ledger form for editing (used by RecentlyCreatedCard's onSelect).
  const openLedgerForEdit = useCallback((ledgerId: number) => {
    if (!financeId) return;
    setEditingLedgerLoading(true);
    apiGetLedgerDetails(ledgerId)
      .then(res => {
        if (res.data?.success && res.data?.data) {
          setCurrentIndex(-1); // this ledger isn't part of the local `ledgers` list
          setEditingLedgerId(ledgerId);
          setEditingLedgerInitial(ledgerDetailsToForm(res.data.data));
          setFormKey(k => k + 1); // remount AdvancedLedgerFormPanel with the new `initial`
          setActiveTab("create");
        } else {
          toast.error("Could not load ledger details");
        }
      })
      .catch((err: any) => {
        toast.error(err?.response?.data?.message || "Could not load ledger details");
      })
      .finally(() => setEditingLedgerLoading(false));
  }, [financeId]);

  // Form state
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [balanceType, setBalanceType] = useState<"Dr" | "Cr">("Dr");
  const [effectiveDate, setEffectiveDate] = useState("2025-04-01");

  // Sundry extra fields
  const [billWise, setBillWise] = useState(false);
  const [creditPeriod, setCreditPeriod] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");

  // Dialogs
  const [showConfig, setShowConfig] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showSundryDialog, setShowSundryDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showConfigDialog, setShowConfigDialog] = useState(false);

  // View mode (Ledger or Group) — persisted; defaults to group view
  const [viewMode, setViewMode] = useState<"ledger" | "group">(
    () => loadPref<"ledger" | "group">("ledger:viewMode", "group")
  );

  // Period — persisted
  const [period, setPeriod] = useState<PeriodState>(
    () => loadPref("ledger:period", { from: "2025-04-01", to: "2026-03-31" })
  );

  // Company — persisted
  const [selectedCompany, setSelectedCompany] = useState<string>(
    () => loadPref("ledger:company", "Rimi Software")
  );

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
  const [showAdvLedger, setShowAdvLedger] = useState(false);

  // Refs
  const nameRef = useRef<HTMLInputElement>(null);

  const isSundryGroup = group === "Sundry Debtors" || group === "Sundry Creditors";

  const filteredGroups = useMemo(() =>
    groups.filter(g => g.toLowerCase().includes(groupSearch.toLowerCase())),
    [groups, groupSearch]
  );

  const totalDr = useMemo(() => ledgers.filter(l => l.balanceType === "Dr").reduce((s, l) => s + l.openingBalance, 0), [ledgers]);
  const totalCr = useMemo(() => ledgers.filter(l => l.balanceType === "Cr").reduce((s, l) => s + l.openingBalance, 0), [ledgers]);

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
      list = list.filter(l => getGroupCategory(l.group) === category);
    }
    return list;
  }, [viewLedgers, viewSearch, category]);

  // ─── Persist view preferences ───────────────────────────────────────────────
  useEffect(() => { savePref("ledger:viewMode", viewMode); }, [viewMode]);
  useEffect(() => { savePref("ledger:period", period); }, [period]);
  useEffect(() => { savePref("ledger:company", selectedCompany); }, [selectedCompany]);
  useEffect(() => { savePref("ledger:viewSearch", viewSearch); }, [viewSearch]);

  // ─── Trigger skeleton on company / period / viewMode change ────────────────
  const triggerViewLoading = useCallback(() => {
    setViewLoading(true);
    const t = setTimeout(() => setViewLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (activeTab === "view") triggerViewLoading();
  }, [selectedCompany, period, viewMode, category, activeTab]);

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
      // Existing shortcuts (unchanged)
      if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setShowNewGroup(true);
      }
      if (e.ctrlKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setShowNewGroup(true);
      }
      if (e.key === "F12") {
        e.preventDefault();
        setShowConfigDialog(true);
      }
      if (e.ctrlKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSave();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setMultiSelector(true);
      }
      if (e.ctrlKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setShowAdvLedger(true);
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (ledgers.length) loadLedger(currentIndex >= 0 ? currentIndex : 0);
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        const idx = currentIndex <= 0 ? ledgers.length - 1 : currentIndex - 1;
        loadLedger(idx);
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        const idx = currentIndex >= ledgers.length - 1 ? 0 : currentIndex + 1;
        loadLedger(idx);
      }
      if (e.key === "F12" || (e.altKey && e.key === "F12")) {
        e.preventDefault();
        setShowConfigDialog(true);
      }

      // ── New View-tab shortcuts ──────────────────────────────────────────────
      if (e.key === "F5") {
        e.preventDefault();
        setViewMode(prev => {
          const next = prev === "ledger" ? "group" : "ledger";
          toast.info(`View Mode: ${next === "ledger" ? "Ledger Wise" : "Group Wise"}`);
          return next;
        });
        setViewLedger(null);
      }
      if (e.key === "F2") {
        e.preventDefault();
        setPeriodFrom(period.from);
        setPeriodTo(period.to);
        setShowPeriodDlg(true);
      }
      if (e.key === "F3") {
        e.preventDefault();
        setShowCompanyDlg(true);
      }
      if (e.altKey && e.key.toLowerCase() === "h") {
        // Only if not already intercepted by existing Alt+C
        if (!showNewGroup) {
          e.preventDefault();
          setShowChangeView(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, currentIndex, ledgers.length, loadLedger, period, showNewGroup]);

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
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ─── Period preset helpers ───────────────────────────────────────────────────
  const applyPeriodPreset = (preset: "month" | "quarter" | "year" | "custom") => {
    setPeriodPreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    // Indian fiscal year starts Apr 1
    if (preset === "year") {
      const fy = m >= 3 ? y : y - 1;
      setPeriodFrom(`${fy}-04-01`);
      setPeriodTo(`${fy + 1}-03-31`);
    } else if (preset === "month") {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      setPeriodFrom(start.toISOString().slice(0, 10));
      setPeriodTo(end.toISOString().slice(0, 10));
    } else if (preset === "quarter") {
      const qStart = Math.floor(m / 3) * 3;
      const start = new Date(y, qStart, 1);
      const end = new Date(y, qStart + 3, 0);
      setPeriodFrom(start.toISOString().slice(0, 10));
      setPeriodTo(end.toISOString().slice(0, 10));
    }
    // custom: keep existing dates
  };

  const applyPeriod = () => {
    setPeriod({ from: periodFrom, to: periodTo });
    setShowPeriodDlg(false);
    toast.success(`Period set: ${fmtDate(periodFrom)} – ${fmtDate(periodTo)}`);
  };

  // ─── Company switch ──────────────────────────────────────────────────────────
  const switchCompany = (c: string) => {
    setSelectedCompany(c);
    setShowCompanyDlg(false);
    toast.success(`Company: ${c}`);
  };

  return (
    <ConfigProvider>
      <div className="space-y-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ledger Master</h1>
            <p className="text-sm text-muted-foreground">Tally-style ledger management</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="dashboard-card !p-2 !rounded-lg flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">Total Dr:</span>
              <span className="font-bold text-foreground">₹{totalDr.toLocaleString()}</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">Total Cr:</span>
              <span className="font-bold text-foreground">₹{totalCr.toLocaleString()}</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">Opening:</span>
              <span className={`font-bold ${totalDr >= totalCr ? "text-foreground" : "text-expense"}`}>
                ₹{Math.abs(totalDr - totalCr).toLocaleString()} {totalDr >= totalCr ? "Dr" : "Cr"}
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
                      payload = ledgerFormToPayload(l, financeId);
                      console.log('Ledger Payload:', payload)
                    } catch (err: any) {
                      toast.error(err.message || "Select a valid Under group before saving");
                      return;
                    }

                    const isEditingRecent = editingLedgerId !== null;
                    const targetId = isEditingRecent ? editingLedgerId! : (currentIndex >= 0 ? ledgers[currentIndex].id : null);

                    try {
                      if (targetId !== null) {
                        await apiUpdateLedger(targetId, financeId, payload);
                      } else {
                        const res = await apiCreateLedger(payload);
                        if (!res.data?.success) throw new Error(res.data?.message || "Failed to create ledger");
                      }
                    } catch (err: any) {
                      toast.error(err?.response?.data?.message || err.message || "Failed to save ledger");
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
                    // Refresh "Recently Created" so the change (new ledger, or an
                    // edited name/group) is reflected immediately without a page reload.
                    fetchRecentCreated();
                    resetForm();
                  }}
                />
              </motion.div>

              {/* Right column: Dashboard cards */}
              <div className="space-y-4">
                <RecentlyCreatedCard
                  items={recentCreated}
                  loading={recentCreatedLoading || editingLedgerLoading}
                  onSelect={(it) => openLedgerForEdit(Number(it.id))}
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
                    {selectedCompany}
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
                  {viewMode === "ledger"
                    ? <LayoutList className="h-4 w-4 text-primary shrink-0" />
                    : <TreePine className="h-4 w-4 text-primary shrink-0" />
                  }
                  <span className="text-xs font-semibold text-primary">
                    View Mode : {viewMode === "ledger" ? "Ledger Wise" : "Group Wise"}
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
                    <LedgerDayView ledger={viewLedger} onBack={() => setViewLedger(null)} />
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
                    <div className="px-4 py-2.5 border-b border-border bg-secondary/50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        List of Ledgers
                        {viewGroupFilter !== "all" && (
                          <span className="ml-2 text-primary">— {viewGroupFilter}</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {filteredViewLedgers.filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter).length} entries
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-secondary/30">
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-14">Sl. No.</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Name of Ledger</th>
                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Under</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Opening Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredViewLedgers
                            .filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter)
                            .map((l, i) => (
                              <tr
                                key={l.id}
                                className="border-b border-border/40 hover:bg-secondary/30 transition-colors cursor-pointer"
                                onClick={() => setViewLedger(l)}
                              >
                                <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                                <td className="px-4 py-2.5 text-sm text-foreground font-medium">{l.name}</td>
                                <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.group}</td>
                                <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-right">
                                  {l.openingBalance === 0 ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (
                                    <span className={l.balanceType === "Dr" ? "text-foreground" : "text-income"}>
                                      ₹{l.openingBalance.toLocaleString()} {l.balanceType}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          {filteredViewLedgers.filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter).length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                                No ledgers found{viewSearch ? ` for "${viewSearch}"` : ""}.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        {/* Total row */}
                        {filteredViewLedgers.filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter).length > 0 && (
                          <tfoot>
                            <tr className="border-t-2 border-border bg-secondary/40">
                              <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                                Total
                              </td>
                              <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
                                ₹{filteredViewLedgers
                                  .filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter)
                                  .reduce((s, l) => s + (l.balanceType === "Dr" ? l.openingBalance : -l.openingBalance), 0)
                                  .toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
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
            existing={ledgers}
            onClose={() => setMultiChoice(null)}
            onSave={async (rows: MultiRow[]) => {
              if (multiChoice.mode === "alter") {
                setLedgers(prev => prev.map(l => {
                  const upd = rows.find(r => r.id === l.id);
                  if (!upd) return l;
                  return {
                    ...l,
                    name: upd.name.trim() || l.name,
                    group: upd.group.trim() || l.group,
                    openingBalance: parseFloat(upd.opening) || 0,
                    balanceType: upd.drCr,
                  };
                }));
              } else {
                // Resolve each row's group name → { under_id, under_source } so the
                // backend can apply the same mutually-exclusive group_id /
                // master_group_id mapping used for single-ledger creation.
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
                  };
                });

                if (unresolved.length) {
                  toast.error(`Could not resolve "Under" group for: ${unresolved.join(", ")}`);
                  return;
                }

                try {
                  const res = await apiMultiCreateLedger(financeId, apiRows as any);
                  if (!res.data?.success) throw new Error(res.data?.message || "Failed to create ledgers");
                } catch (err: any) {
                  toast.error(err?.response?.data?.message || err.message || "Failed to create ledgers");
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
                      if (v.key === "ledger" || v.key === "group") {
                        setViewMode(v.key as "ledger" | "group");
                        setViewLedger(null);
                      } else {
                        toast.info(`${v.label} — coming soon`);
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
                    onClick={() => { toast.info(`${sv} — custom view`); setShowChangeView(false); }}
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
                    onClick={() => { toast.info(`${rr} — opening report`); setShowChangeView(false); }}
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
              {COMPANIES.map(c => (
                <button
                  key={c}
                  onClick={() => switchCompany(c)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors
                    ${selectedCompany === c ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-secondary/50 text-foreground"}`}
                >
                  <Building2 className={`h-4 w-4 shrink-0 ${selectedCompany === c ? "text-primary" : "text-muted-foreground"}`} />
                  {c}
                  {selectedCompany === c && <Badge className="ml-auto text-[10px]">Active</Badge>}
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowCompanyDlg(false)}>Close (Esc)</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ConfigProvider>
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
  id: number;
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

  // Category-based root filter using nature field from the API
  const catNature: Record<string, HierNature | null> = {
    ASSETS: "Assets",
    LIABILITIES: "Liabilities",
    INCOME: "Income",
    EXPENSES: "Expense",
    OTHERS: null,
    ALL: null,
  };

  const visibleRoots = useMemo(() => {
    return roots.filter(r => {
      if (category === "ALL") return hasMatch(r.key);
      if (category === "OTHERS") {
        const known: HierNature[] = ["Assets", "Liabilities", "Income", "Expense"];
        return !known.includes(r.nature) && hasMatch(r.key);
      }
      const needed = catNature[category];
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
}: {
  groupKey: string;
  liveGroups: Record<string, LiveGroup>;
  childMap: Record<string, LiveGroup[]>;
  ledgersByGroupKey: Record<string, LedgerEntry[]>;
  onSelectLedger: (l: LedgerEntry) => void;
  level: number;
  search: string;
  hasMatch: (key: string) => boolean;
}) {
  const group = liveGroups[groupKey];
  if (!group) return null;

  const children = (childMap[groupKey] || []);
  const allLedgers = ledgersByGroupKey[groupKey] || [];
  const q = search.toLowerCase().trim();

  const visibleLedgers = q
    ? allLedgers.filter(l => l.name.toLowerCase().includes(q) || group.name.toLowerCase().includes(q))
    : allLedgers;

  const visibleChildren = children.filter(c => hasMatch(c.key));
  const hasContent = visibleChildren.length > 0 || allLedgers.length > 0;

  const [open, setOpen] = useState(level === 0 || !!search);
  useEffect(() => { if (search) setOpen(true); }, [search]);

  if (q && !hasMatch(groupKey)) return null;

  const totalDr = allLedgers.filter(l => l.balanceType === "Dr").reduce((s, l) => s + l.openingBalance, 0);
  const totalCr = allLedgers.filter(l => l.balanceType === "Cr").reduce((s, l) => s + l.openingBalance, 0);

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
              {totalDr > 0 && <span className="text-foreground">Dr ₹{totalDr.toLocaleString()}</span>}
              {totalCr > 0 && <span className="text-income">Cr ₹{totalCr.toLocaleString()}</span>}
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
                  .map(l => (
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
                        {l.openingBalance > 0 ? (
                          <span className={l.balanceType === "Dr" ? "text-foreground" : "text-income"}>
                            {l.balanceType} ₹{l.openingBalance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Day-wise Ledger View ─────────────────────────────────────────────────────
function LedgerDayView({ ledger, onBack }: { ledger: LedgerEntry; onBack: () => void }) {
  let running = ledger.openingBalance * (ledger.balanceType === "Dr" ? 1 : -1);
  const rows = LEDGER_ENTRIES.map(e => {
    running += (e.debit - e.credit);
    return { ...e, balance: Math.abs(running), type: running >= 0 ? "Dr" as const : "Cr" as const };
  });

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h3 className="text-lg font-bold text-foreground">{ledger.name}</h3>
          <p className="text-xs text-muted-foreground">{ledger.group} • Opening: ₹{ledger.openingBalance.toLocaleString()} {ledger.balanceType}</p>
        </div>
      </div>
      <div className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50 sticky top-0">
                {["Date", "Particulars", "Voucher Type", "Debit", "Credit", "Balance"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50 bg-secondary/20">
                <td className="px-4 py-2 text-sm text-muted-foreground">{ledger.effectiveDate}</td>
                <td className="px-4 py-2 text-sm font-medium text-foreground" colSpan={2}>Opening Balance</td>
                <td className="px-4 py-2 text-sm font-mono tabular-nums">{ledger.balanceType === "Dr" ? `₹${ledger.openingBalance.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-2 text-sm font-mono tabular-nums">{ledger.balanceType === "Cr" ? `₹${ledger.openingBalance.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-2 text-sm font-mono tabular-nums font-semibold">₹{ledger.openingBalance.toLocaleString()} {ledger.balanceType}</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-2 text-sm text-muted-foreground">{r.date}</td>
                  <td className="px-4 py-2 text-sm text-foreground">{r.particular}</td>
                  <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.voucherType}</Badge></td>
                  <td className="px-4 py-2 text-sm font-mono tabular-nums">{r.debit > 0 ? <span className="text-expense">₹{r.debit.toLocaleString()}</span> : "—"}</td>
                  <td className="px-4 py-2 text-sm font-mono tabular-nums">{r.credit > 0 ? <span className="text-income">₹{r.credit.toLocaleString()}</span> : "—"}</td>
                  <td className="px-4 py-2 text-sm font-mono tabular-nums font-semibold">₹{r.balance.toLocaleString()} {r.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
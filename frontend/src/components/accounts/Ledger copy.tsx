// import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import {
//   Plus, Search, ChevronDown, ChevronRight, Settings, Save, Trash2,
//   Eye, ArrowLeft, ArrowRight, Keyboard, Building2, Calendar, LayoutList,
//   TreePine, RefreshCw, FileText, Layers,
// } from "lucide-react";
// import { Input } from "../ui/input";
// import { Button } from "../ui/button";
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
// import { Switch } from "../ui/switch";
// import { Label } from "../ui/label";
// import { Badge } from "../ui/badge";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
// import { Skeleton } from "../ui/skeleton";
// import { toast } from "sonner";
// import { MultiLedger, MultiLedgerSelector, MultiMode, MultiRow, SelectorChoice } from "../multiCreation/MultiLedger";
// import { AdvancedLedgerFormPanel, AdvancedLedgerForm, UnderGroupOption } from "../accounts/AdvancedLedgerDialog";
// import { ConfigDialog, ConfigProvider } from "./ConfigDialog";
// import { getUnderDropdown, createLedger as apiCreateLedger, updateLedger as apiUpdateLedger, multiCreateLedger as apiMultiCreateLedger } from "../../api/accounting";

// /** Maps the Advanced Ledger form (UI field names) onto the create/update
//  *  ledger API payload (DB column / form-comment names). The "Under" group
//  *  is sent as { under_id, under_source } only — the backend resolves this
//  *  into the mutually-exclusive group_id / master_group_id columns. */
// function ledgerFormToPayload(l: AdvancedLedgerForm, finance_id: number) {
//   if (!l.groupId || !l.groupSource) {
//     throw new Error('Select a valid "Under" group before saving');
//   }
//   return {
//     finance_id,
//     ledger_name: l.name.trim(),
//     alias: l.alias || null,
//     alias_regional: l.aliasRegional || null,
//     under_id: l.groupId,
//     under_source: l.groupSource,
//     reporting_under: l.reportingUnder || null,
//     inactive: l.inactive ? 1 : 0,
//     opening_balance: parseFloat(l.openingBalance) || 0,
//     ob_type: l.drCr,
//     effective_date: l.effectiveDate || null,
//     freeze_balance: l.freezeBalance ? 1 : 0,
//     inv_values_affected: l.inventoryAffected ? 1 : 0,
//     maintainBillWise: l.maintainBillWise,
//     defaultCreditPeriod: l.defaultCreditPeriod,
//     checkCreditDaysDuringEntry: l.checkCreditDaysDuringEntry,
//     mailingName: l.mailingName, addr1: l.addr1, addr2: l.addr2, addr3: l.addr3, addr4: l.addr4,
//     city: l.city, state: l.state, pincode: l.pincode, country: l.country,
//     provideContactDetails: l.provideContactDetails, contactPerson: l.contactPerson,
//     telephone: l.telephone, mobile: l.mobile, primaryMobile: l.primaryMobile,
//     email: l.email, website: l.website,
//     provideBankDetails: l.provideBankDetails, accountHolderName: l.accountHolderName,
//     bankName: l.bankName, accountNumber: l.accountNumber, ifsc: l.ifsc, swift: l.swift,
//     branch: l.branch, accountType: l.accountType,
//     panIt: l.panIt, gstin: l.gstin, registrationType: l.registrationType,
//     taxType: l.taxType,
//     msmeRegistered: l.msmeRegistered, udyamNumber: l.udyamNumber,
//     einvoiceApplicable: l.einvoiceApplicable, defaultSupplyType: l.defaultSupplyType,
//     ewayBillApplicable: l.ewayBillApplicable, defaultTransportMode: l.defaultTransportMode,
//     defaultDistance: l.defaultDistance,
//   };
// }

// // ─── Default Groups — full flat list (shown in create/edit dropdown) ───────────
// const DEFAULT_GROUPS = [
//   // ── Primary Groups (15) ──────────────────────────────────────────────────────
//   "Capital Account",
//   "Current Assets",
//   "Current Liabilities",
//   "Direct Expenses",
//   "Direct Incomes",
//   "Fixed Assets",
//   "Indirect Expenses",
//   "Indirect Incomes",
//   "Investments",
//   "Loans (Liability)",
//   "Misc. Expenses (ASSET)",
//   "Purchase Accounts",
//   "Sales Accounts",
//   "Suspense A/c",
//   "Branch/Divisions",

//   // ── Sub Groups (13) ──────────────────────────────────────────────────────────
//   "Bank Accounts",
//   "Bank OD A/c",
//   "Cash-in-hand",
//   "Deposits (Asset)",
//   "Duties & Taxes",
//   "Loans & Advances (Asset)",
//   "Provisions",
//   "Reserves & Surplus",
//   "Secured Loans",
//   "Stock-in-hand",
//   "Sundry Creditors",
//   "Sundry Debtors",
//   "Unsecured Loans",
// ];

// // ─── Seed ledgers ───
// interface LedgerEntry {
//   id: number;
//   name: string;
//   group: string;
//   openingBalance: number;
//   balanceType: "Dr" | "Cr";
//   effectiveDate: string;
//   billWise?: boolean;
//   creditPeriod?: number;
//   address?: string;
//   contact?: string;
// }

// const SEED_LEDGERS: LedgerEntry[] = [
//   { id: 1, name: "Cash", group: "Cash-in-Hand", openingBalance: 285000, balanceType: "Dr", effectiveDate: "2025-04-01" },
//   { id: 2, name: "SBI Current A/c", group: "Bank Accounts", openingBalance: 1250000, balanceType: "Dr", effectiveDate: "2025-04-01" },
//   { id: 3, name: "Rajesh Kumar", group: "Sundry Debtors", openingBalance: 45000, balanceType: "Dr", effectiveDate: "2025-04-01", billWise: true, creditPeriod: 30, address: "12, Anna Nagar, Chennai", contact: "9876543210" },
//   { id: 4, name: "Priya Devi", group: "Sundry Debtors", openingBalance: 32000, balanceType: "Dr", effectiveDate: "2025-04-01", billWise: true, creditPeriod: 45, address: "5, MG Road, Coimbatore", contact: "9123456789" },
//   { id: 5, name: "ABC Suppliers", group: "Sundry Creditors", openingBalance: 180000, balanceType: "Cr", effectiveDate: "2025-04-01", billWise: true, creditPeriod: 60, address: "Industrial Area, Madurai", contact: "9012345678" },
//   { id: 6, name: "Office Rent", group: "Indirect Expenses", openingBalance: 0, balanceType: "Dr", effectiveDate: "2025-04-01" },
//   { id: 7, name: "Staff Salary", group: "Direct Expenses", openingBalance: 0, balanceType: "Dr", effectiveDate: "2025-04-01" },
//   { id: 8, name: "Interest Income", group: "Direct Income", openingBalance: 0, balanceType: "Cr", effectiveDate: "2025-04-01" },
//   { id: 9, name: "Capital – Partner A", group: "Capital Account", openingBalance: 2000000, balanceType: "Cr", effectiveDate: "2025-04-01" },
//   { id: 10, name: "Furniture & Fixtures", group: "Tangible Assets", openingBalance: 125000, balanceType: "Dr", effectiveDate: "2025-04-01" },
// ];

// // ─── Ledger day-wise view data ───
// const LEDGER_ENTRIES = [
//   { date: "2025-04-02", particular: "Sales – Invoice #301", voucherType: "Receipt", debit: 0, credit: 15000 },
//   { date: "2025-04-05", particular: "Purchase – Bill #201", voucherType: "Payment", debit: 8000, credit: 0 },
//   { date: "2025-04-08", particular: "EMI Collection", voucherType: "Receipt", debit: 0, credit: 12000 },
//   { date: "2025-04-10", particular: "Salary Payment", voucherType: "Payment", debit: 18000, credit: 0 },
//   { date: "2025-04-12", particular: "Office Rent", voucherType: "Payment", debit: 25000, credit: 0 },
//   { date: "2025-04-15", particular: "Penalty Collection", voucherType: "Receipt", debit: 0, credit: 5000 },
//   { date: "2025-04-18", particular: "Vehicle Insurance", voucherType: "Journal", debit: 8500, credit: 0 },
//   { date: "2025-04-20", particular: "Interest Received", voucherType: "Receipt", debit: 0, credit: 20000 },
// ];

// // ─── Hierarchical Group Structure ─────────────────────────────────────────────
// // Matches the exact structure specified: Primary / Assets / Liabilities / Income / Expenses / Others
// type HierNature = "Assets" | "Liabilities" | "Income" | "Expense";
// interface HierGroup { id: number; name: string; parent: string | null; nature: HierNature; }

// // const HIER_GROUPS: HierGroup[] = (() => {
// //   let id = 0;
// //   const mk = (name: string, parent: string | null, nature: HierNature): HierGroup =>
// //     ({ id: ++id, name, parent, nature });
// //   return [
// //     // ── Primary ──
// //     mk("Primary", null, "Liabilities"),
// //     mk("Capital Account", "Primary", "Liabilities"),
// //     mk("Profit & Loss A/c", "Primary", "Liabilities"),
// //     mk("Drawing Account", "Primary", "Liabilities"),
// //     // ── Assets ──
// //     mk("Assets", null, "Assets"),
// //     mk("Current Assets", "Assets", "Assets"),
// //     mk("Cash-in-Hand", "Current Assets", "Assets"),
// //     mk("Bank Accounts", "Current Assets", "Assets"),
// //     mk("Sundry Debtors", "Current Assets", "Assets"),
// //     mk("Stock-in-Hand", "Current Assets", "Assets"),
// //     mk("Loans & Advances (Asset)", "Current Assets", "Assets"),
// //     mk("Deposits (Asset)", "Current Assets", "Assets"),
// //     mk("Fixed Assets", "Assets", "Assets"),
// //     mk("Tangible Assets", "Fixed Assets", "Assets"),
// //     mk("Intangible Assets", "Fixed Assets", "Assets"),
// //     mk("Capital Work-in-Progress", "Fixed Assets", "Assets"),
// //     // ── Liabilities ──
// //     mk("Liabilities", null, "Liabilities"),
// //     mk("Current Liabilities", "Liabilities", "Liabilities"),
// //     mk("Sundry Creditors", "Current Liabilities", "Liabilities"),
// //     mk("Duties & Taxes", "Current Liabilities", "Liabilities"),
// //     mk("Provisions", "Current Liabilities", "Liabilities"),
// //     mk("Bank Overdraft", "Current Liabilities", "Liabilities"),
// //     mk("Unclaimed Deposits", "Current Liabilities", "Liabilities"),
// //     mk("Long Term Liabilities", "Liabilities", "Liabilities"),
// //     mk("Secured Loans", "Long Term Liabilities", "Liabilities"),
// //     mk("Unsecured Loans", "Long Term Liabilities", "Liabilities"),
// //     mk("Deferred Tax Liability", "Long Term Liabilities", "Liabilities"),
// //     // ── Income ──
// //     mk("Income", null, "Income"),
// //     mk("Direct Income", "Income", "Income"),
// //     mk("Indirect Income", "Income", "Income"),
// //     // ── Expenses ──
// //     mk("Expenses", null, "Expense"),
// //     mk("Direct Expenses", "Expenses", "Expense"),
// //     mk("Indirect Expenses", "Expenses", "Expense"),
// //     mk("Administrative Expenses", "Indirect Expenses", "Expense"),
// //     mk("Selling & Distribution Expenses", "Indirect Expenses", "Expense"),
// //     mk("Financial Expenses", "Indirect Expenses", "Expense"),
// //     mk("Depreciation", "Indirect Expenses", "Expense"),
// //     mk("Miscellaneous Expenses", "Indirect Expenses", "Expense"),
// //     // ── Others ──
// //     mk("Suspense Account", null, "Assets"),
// //     mk("Miscellaneous Expenses (Asset)", null, "Assets"),
// //   ];
// // })();

// const HIER_GROUPS: HierGroup[] = (() => {
//   let id = 0;
//   const mk = (name: string, parent: string | null, nature: HierNature): HierGroup =>
//     ({ id: ++id, name, parent, nature });
//   return [
//     // ── Primary Groups ──────────────────────────────────────────────────────────
//     // Assets
//     mk("Assets", null, "Assets"),
//     mk("Current Assets", "Assets", "Assets"),
//     mk("Fixed Assets", "Assets", "Assets"),
//     mk("Investments", "Assets", "Assets"),
//     mk("Misc. Expenses (ASSET)", "Assets", "Assets"),
//     mk("Suspense A/c", "Assets", "Assets"),
//     mk("Branch / Divisions", "Assets", "Assets"),

//     // Liabilities
//     mk("Liabilities", null, "Liabilities"),
//     mk("Capital Account", "Liabilities", "Liabilities"),
//     mk("Current Liabilities", "Liabilities", "Liabilities"),
//     mk("Loans (Liability)", "Liabilities", "Liabilities"),
//     mk("Reserves & Surplus", "Liabilities", "Liabilities"),

//     // Income
//     mk("Income", null, "Income"),
//     mk("Direct Incomes", "Income", "Income"),
//     mk("Indirect Incomes", "Income", "Income"),
//     mk("Sales Accounts", "Income", "Income"),

//     // Expenses
//     mk("Expenses", null, "Expense"),
//     mk("Direct Expenses", "Expenses", "Expense"),
//     mk("Indirect Expenses", "Expenses", "Expense"),
//     mk("Purchase Accounts", "Expenses", "Expense"),

//     // ── Sub Groups (13) ─────────────────────────────────────────────────────────
//     // Current Assets Sub Groups
//     mk("Bank Accounts", "Current Assets", "Assets"),
//     mk("Cash-in-hand", "Current Assets", "Assets"),
//     mk("Sundry Debtors", "Current Assets", "Assets"),
//     mk("Stock-in-hand", "Current Assets", "Assets"),
//     mk("Loans & Advances (Asset)", "Current Assets", "Assets"),
//     mk("Deposits (Asset)", "Current Assets", "Assets"),

//     // Current Liabilities Sub Groups
//     mk("Sundry Creditors", "Current Liabilities", "Liabilities"),
//     mk("Duties & Taxes", "Current Liabilities", "Liabilities"),
//     mk("Provisions", "Current Liabilities", "Liabilities"),
//     mk("Bank OD A/c", "Current Liabilities", "Liabilities"),

//     // Loans (Liability) Sub Groups
//     mk("Secured Loans", "Loans (Liability)", "Liabilities"),
//     mk("Unsecured Loans", "Loans (Liability)", "Liabilities"),
//   ];
// })();

// const HIER_NATURE_COLORS: Record<HierNature, string> = {
//   Assets: "border-primary/40 text-primary",
//   Liabilities: "border-red-400/40 text-red-600 dark:text-red-400",
//   Income: "border-green-400/40 text-green-600 dark:text-green-400",
//   Expense: "border-amber-400/40 text-amber-600 dark:text-amber-400",
// };

// // ─── Config options ───
// interface ConfigState {
//   billWise: boolean;
//   gst: boolean;
//   costCenters: boolean;
//   multipleAddresses: boolean;
//   bankDetails: boolean;
//   billByBill: boolean;
// }

// // ─── View period ───
// interface PeriodState {
//   from: string;
//   to: string;
// }

// // ─── Available views ───
// const AVAILABLE_VIEWS = [
//   { key: "ledger", label: "Ledger-wise" },
//   { key: "group", label: "Group-wise" },
//   { key: "gst", label: "Ledger GST Details" },
//   { key: "contact", label: "Ledger Contact Details" },
//   { key: "voucher", label: "Voucher Analysis" },
//   { key: "monthly", label: "Monthly Summary" },
//   { key: "outstanding", label: "Outstanding Analysis" },
// ];

// const SAVED_VIEWS = [
//   "Chart Of Accounts - My View",
//   "Sales Ledger Analysis",
//   "Collection View",
//   "Finance Outstanding View",
// ];

// const RELATED_REPORTS = [
//   "Ledger Contact Details",
//   "Voucher Register",
//   "Outstanding Analysis",
//   "Monthly Summary",
// ];

// const COMPANIES = ["Rimi Software", "Branch – Coimbatore", "Branch – Madurai"];

// // ─── Helpers ───
// function fmtDate(iso: string): string {
//   try {
//     const d = new Date(iso);
//     return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
//   } catch {
//     return iso;
//   }
// }

// function loadPref<T>(key: string, fallback: T): T {
//   try {
//     const v = localStorage.getItem(key);
//     return v ? JSON.parse(v) : fallback;
//   } catch {
//     return fallback;
//   }
// }

// function savePref(key: string, value: unknown) {
//   try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
// }

// // Helper to find the top-level parent (root category) for any group
// function getGroupCategory(groupName: string): "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS" {
//   const findNode = (name: string) => HIER_GROUPS.find(g => g.name.toLowerCase() === name.toLowerCase());
//   let current = findNode(groupName);
//   if (!current) return "OTHERS";
//   let limit = 0;
//   while (current.parent && limit < 10) {
//     const parentNode = findNode(current.parent);
//     if (!parentNode) break;
//     current = parentNode;
//     limit++;
//   }
//   const rootName = current.name.toUpperCase();
//   if (rootName === "ASSETS") return "ASSETS";
//   if (rootName === "LIABILITIES") return "LIABILITIES";
//   if (rootName === "INCOME") return "INCOME";
//   if (rootName === "EXPENSES" || rootName === "EXPENSE") return "EXPENSES";
//   if (rootName === "PRIMARY") return "LIABILITIES"; // Primary groups are liabilities/equity
//   return "OTHERS";
// }

// // ─── Main Component ───────────────────────────────────────────────────────────

// export default function Ledger() {
//   const [activeTab, setActiveTab] = useState<"create" | "view">("create");
//   const [ledgers, setLedgers] = useState<LedgerEntry[]>(SEED_LEDGERS);
//   const [currentIndex, setCurrentIndex] = useState(-1);
//   const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS);
//   const [groupOptions, setGroupOptions] = useState<UnderGroupOption[]>([]);
//   // TODO: replace with real finance/company id from auth/company context
//   const financeId = Number(loadPref<string>("ledger:financeId", "1"));

//   // On mount: fetch all available parent groups (system + custom) from the DB
//   // and merge with DEFAULT_GROUPS so the "Under" autocomplete always includes
//   // both Tally predefined groups and any custom groups the user has created.
//   useEffect(() => {
//     getUnderDropdown()
//       .then(res => {
//         if (res.data?.success && Array.isArray(res.data?.data)) {
//           const opts: UnderGroupOption[] = res.data.data.map((g: any) => ({
//             id: g.id,
//             group_name: g.group_name as string,
//             source: g.source as "system" | "custom",
//           }));
//           setGroupOptions(opts);
//           const dbGroupNames: string[] = opts.map(g => g.group_name);
//           setGroups(prev => {
//             const merged = Array.from(new Set([...prev, ...dbGroupNames]));
//             return merged.sort((a, b) => a.localeCompare(b));
//           });
//         }
//       })
//       .catch(() => { /* silently fall back to DEFAULT_GROUPS */ });
//   }, []);

//   // Form state
//   const [name, setName] = useState("");
//   const [group, setGroup] = useState("");
//   const [groupSearch, setGroupSearch] = useState("");
//   const [showGroupDropdown, setShowGroupDropdown] = useState(false);
//   const [openingBalance, setOpeningBalance] = useState("");
//   const [balanceType, setBalanceType] = useState<"Dr" | "Cr">("Dr");
//   const [effectiveDate, setEffectiveDate] = useState("2025-04-01");

//   // Sundry extra fields
//   const [billWise, setBillWise] = useState(false);
//   const [creditPeriod, setCreditPeriod] = useState("");
//   const [address, setAddress] = useState("");
//   const [contact, setContact] = useState("");

//   // Dialogs
//   const [showConfig, setShowConfig] = useState(false);
//   const [showNewGroup, setShowNewGroup] = useState(false);
//   const [showSundryDialog, setShowSundryDialog] = useState(false);
//   const [newGroupName, setNewGroupName] = useState("");
//   const [showConfigDialog, setShowConfigDialog] = useState(false);

//   // View mode (Ledger or Group) — persisted; defaults to group view
//   const [viewMode, setViewMode] = useState<"ledger" | "group">(
//     () => loadPref<"ledger" | "group">("ledger:viewMode", "group")
//   );

//   // Period — persisted
//   const [period, setPeriod] = useState<PeriodState>(
//     () => loadPref("ledger:period", { from: "2025-04-01", to: "2026-03-31" })
//   );

//   // Company — persisted
//   const [selectedCompany, setSelectedCompany] = useState<string>(
//     () => loadPref("ledger:company", "Rimi Software")
//   );

//   // View search — persisted
//   const [viewSearch, setViewSearch] = useState<string>(
//     () => loadPref("ledger:viewSearch", "")
//   );

//   // Category tab filter — standard state
//   const [category, setCategory] = useState<"ALL" | "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS">("ALL");

//   // View mode dialogs
//   const [showChangeView, setShowChangeView] = useState(false);   // Alt+H
//   const [showPeriodDlg, setShowPeriodDlg] = useState(false);     // F2
//   const [showCompanyDlg, setShowCompanyDlg] = useState(false);   // F3

//   // Skeleton / transition loading
//   const [viewLoading, setViewLoading] = useState(false);

//   // Period dialog local state
//   const [periodPreset, setPeriodPreset] = useState<"month" | "quarter" | "year" | "custom">("year");
//   const [periodFrom, setPeriodFrom] = useState(period.from);
//   const [periodTo, setPeriodTo] = useState(period.to);

//   // Day-wise view
//   const [viewLedger, setViewLedger] = useState<LedgerEntry | null>(null);
//   const [viewGroupFilter, setViewGroupFilter] = useState("all");

//   // Multi-ledger
//   const [multiSelector, setMultiSelector] = useState(false);
//   const [multiChoice, setMultiChoice] = useState<SelectorChoice | null>(null);
//   const [showAdvLedger, setShowAdvLedger] = useState(false);

//   // Refs
//   const nameRef = useRef<HTMLInputElement>(null);

//   const isSundryGroup = group === "Sundry Debtors" || group === "Sundry Creditors";

//   const filteredGroups = useMemo(() =>
//     groups.filter(g => g.toLowerCase().includes(groupSearch.toLowerCase())),
//     [groups, groupSearch]
//   );

//   const totalDr = useMemo(() => ledgers.filter(l => l.balanceType === "Dr").reduce((s, l) => s + l.openingBalance, 0), [ledgers]);
//   const totalCr = useMemo(() => ledgers.filter(l => l.balanceType === "Cr").reduce((s, l) => s + l.openingBalance, 0), [ledgers]);

//   const groupedLedgers = useMemo(() => {
//     const map: Record<string, LedgerEntry[]> = {};
//     ledgers.forEach(l => {
//       if (!map[l.group]) map[l.group] = [];
//       map[l.group].push(l);
//     });
//     return map;
//   }, [ledgers]);

//   // Filtered ledger list for view tab
//   const filteredViewLedgers = useMemo(() => {
//     const q = viewSearch.toLowerCase().trim();
//     let list = ledgers;
//     if (q) {
//       list = list.filter(
//         l => l.name.toLowerCase().includes(q) || l.group.toLowerCase().includes(q)
//       );
//     }
//     if (category !== "ALL") {
//       list = list.filter(l => getGroupCategory(l.group) === category);
//     }
//     return list;
//   }, [ledgers, viewSearch, category]);

//   // ─── Persist view preferences ───────────────────────────────────────────────
//   useEffect(() => { savePref("ledger:viewMode", viewMode); }, [viewMode]);
//   useEffect(() => { savePref("ledger:period", period); }, [period]);
//   useEffect(() => { savePref("ledger:company", selectedCompany); }, [selectedCompany]);
//   useEffect(() => { savePref("ledger:viewSearch", viewSearch); }, [viewSearch]);

//   // ─── Trigger skeleton on company / period / viewMode change ────────────────
//   const triggerViewLoading = useCallback(() => {
//     setViewLoading(true);
//     const t = setTimeout(() => setViewLoading(false), 300);
//     return () => clearTimeout(t);
//   }, []);

//   useEffect(() => {
//     if (activeTab === "view") triggerViewLoading();
//   }, [selectedCompany, period, viewMode, category, activeTab]);

//   // ─── Load ledger into form ───────────────────────────────────────────────────
//   const loadLedger = useCallback((index: number) => {
//     if (index < 0 || index >= ledgers.length) return;
//     const l = ledgers[index];
//     setCurrentIndex(index);
//     setName(l.name);
//     setGroup(l.group);
//     setGroupSearch(l.group);
//     setOpeningBalance(l.openingBalance.toString());
//     setBalanceType(l.balanceType);
//     setEffectiveDate(l.effectiveDate);
//     setBillWise(l.billWise ?? false);
//     setCreditPeriod(l.creditPeriod?.toString() ?? "");
//     setAddress(l.address ?? "");
//     setContact(l.contact ?? "");
//   }, [ledgers]);

//   const resetForm = useCallback(() => {
//     setCurrentIndex(-1);
//     setName("");
//     setGroup("");
//     setGroupSearch("");
//     setOpeningBalance("");
//     setBalanceType("Dr");
//     setEffectiveDate("2025-04-01");
//     setBillWise(false);
//     setCreditPeriod("");
//     setAddress("");
//     setContact("");
//     nameRef.current?.focus();
//   }, []);

//   const handleSave = useCallback(() => {
//     if (!name.trim() || !group.trim()) {
//       toast.error("Ledger Name and Group are required");
//       return;
//     }
//     const entry: LedgerEntry = {
//       id: currentIndex >= 0 ? ledgers[currentIndex].id : Date.now(),
//       name: name.trim(),
//       group,
//       openingBalance: parseFloat(openingBalance) || 0,
//       balanceType,
//       effectiveDate,
//       ...(isSundryGroup && { billWise, creditPeriod: parseInt(creditPeriod) || 0, address, contact }),
//     };
//     if (currentIndex >= 0) {
//       setLedgers(prev => prev.map((l, i) => i === currentIndex ? entry : l));
//       toast.success(`Ledger "${name}" updated`);
//     } else {
//       setLedgers(prev => [...prev, entry]);
//       toast.success(`Ledger "${name}" created`);
//     }
//     resetForm();
//   }, [name, group, openingBalance, balanceType, effectiveDate, billWise, creditPeriod, address, contact, currentIndex, ledgers, isSundryGroup, resetForm]);

//   // ─── Keyboard shortcuts ──────────────────────────────────────────────────────
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => {
//       // Existing shortcuts (unchanged)
//       if (e.altKey && e.key.toLowerCase() === "c") {
//         e.preventDefault();
//         setShowNewGroup(true);
//       }
//       if (e.ctrlKey && e.key.toLowerCase() === "g") {
//         e.preventDefault();
//         setShowNewGroup(true);
//       }
//       if (e.key === "F12") {
//         e.preventDefault();
//         setShowConfigDialog(true);
//       }
//       if (e.ctrlKey && e.key.toLowerCase() === "a") {
//         e.preventDefault();
//         handleSave();
//       }
//       if (e.ctrlKey && e.key.toLowerCase() === "h") {
//         e.preventDefault();
//         setMultiSelector(true);
//       }
//       if (e.ctrlKey && e.key.toLowerCase() === "l") {
//         e.preventDefault();
//         setShowAdvLedger(true);
//       }
//       if (e.ctrlKey && e.key === "Enter") {
//         e.preventDefault();
//         if (ledgers.length) loadLedger(currentIndex >= 0 ? currentIndex : 0);
//       }
//       if (e.key === "PageUp") {
//         e.preventDefault();
//         const idx = currentIndex <= 0 ? ledgers.length - 1 : currentIndex - 1;
//         loadLedger(idx);
//       }
//       if (e.key === "PageDown") {
//         e.preventDefault();
//         const idx = currentIndex >= ledgers.length - 1 ? 0 : currentIndex + 1;
//         loadLedger(idx);
//       }
//       if (e.key === "F12" || (e.altKey && e.key === "F12")) {
//         e.preventDefault();
//         setShowConfigDialog(true);
//       }

//       // ── New View-tab shortcuts ──────────────────────────────────────────────
//       if (e.key === "F5") {
//         e.preventDefault();
//         setViewMode(prev => {
//           const next = prev === "ledger" ? "group" : "ledger";
//           toast.info(`View Mode: ${next === "ledger" ? "Ledger Wise" : "Group Wise"}`);
//           return next;
//         });
//         setViewLedger(null);
//       }
//       if (e.key === "F2") {
//         e.preventDefault();
//         setPeriodFrom(period.from);
//         setPeriodTo(period.to);
//         setShowPeriodDlg(true);
//       }
//       if (e.key === "F3") {
//         e.preventDefault();
//         setShowCompanyDlg(true);
//       }
//       if (e.altKey && e.key.toLowerCase() === "h") {
//         // Only if not already intercepted by existing Alt+C
//         if (!showNewGroup) {
//           e.preventDefault();
//           setShowChangeView(true);
//         }
//       }
//     };
//     window.addEventListener("keydown", handler);
//     return () => window.removeEventListener("keydown", handler);
//   }, [handleSave, currentIndex, ledgers.length, loadLedger, period, showNewGroup]);

//   // Auto-open sundry dialog
//   useEffect(() => {
//     if (isSundryGroup && activeTab === "create") {
//       setShowSundryDialog(true);
//     }
//   }, [group, isSundryGroup, activeTab]);

//   // Pre-fill group from sessionStorage (when navigated from Ledger Groups tree)
//   useEffect(() => {
//     try {
//       const preset = sessionStorage.getItem("ledger:presetGroup");
//       if (preset) {
//         setGroup(preset);
//         setGroupSearch(preset);
//         sessionStorage.removeItem("ledger:presetGroup");
//         setTimeout(() => nameRef.current?.focus(), 100);
//         toast.success(`Creating ledger under "${preset}"`);
//       }
//     } catch { }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   const selectedLedgerForForm = useMemo(() => {
//     if (currentIndex < 0 || currentIndex >= ledgers.length) return undefined;
//     const l = ledgers[currentIndex];
//     return {
//       name: l.name,
//       group: l.group,
//       openingBalance: l.openingBalance.toString(),
//       drCr: l.balanceType,
//       effectiveDate: l.effectiveDate,
//       maintainBillWise: l.billWise,
//       defaultCreditPeriod: l.creditPeriod?.toString(),
//       mobile: l.contact,
//       addr1: l.address,
//       showMailingDetails: !!l.address || !!l.contact,
//     } as Partial<AdvancedLedgerForm>;
//   }, [currentIndex, ledgers]);

//   // ─── Period preset helpers ───────────────────────────────────────────────────
//   const applyPeriodPreset = (preset: "month" | "quarter" | "year" | "custom") => {
//     setPeriodPreset(preset);
//     const now = new Date();
//     const y = now.getFullYear();
//     const m = now.getMonth();
//     // Indian fiscal year starts Apr 1
//     if (preset === "year") {
//       const fy = m >= 3 ? y : y - 1;
//       setPeriodFrom(`${fy}-04-01`);
//       setPeriodTo(`${fy + 1}-03-31`);
//     } else if (preset === "month") {
//       const start = new Date(y, m, 1);
//       const end = new Date(y, m + 1, 0);
//       setPeriodFrom(start.toISOString().slice(0, 10));
//       setPeriodTo(end.toISOString().slice(0, 10));
//     } else if (preset === "quarter") {
//       const qStart = Math.floor(m / 3) * 3;
//       const start = new Date(y, qStart, 1);
//       const end = new Date(y, qStart + 3, 0);
//       setPeriodFrom(start.toISOString().slice(0, 10));
//       setPeriodTo(end.toISOString().slice(0, 10));
//     }
//     // custom: keep existing dates
//   };

//   const applyPeriod = () => {
//     setPeriod({ from: periodFrom, to: periodTo });
//     setShowPeriodDlg(false);
//     toast.success(`Period set: ${fmtDate(periodFrom)} – ${fmtDate(periodTo)}`);
//   };

//   // ─── Company switch ──────────────────────────────────────────────────────────
//   const switchCompany = (c: string) => {
//     setSelectedCompany(c);
//     setShowCompanyDlg(false);
//     toast.success(`Company: ${c}`);
//   };

//   return (
//     <ConfigProvider>
//       <div className="space-y-4">
//         {/* Header */}
//         <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
//           <div>
//             <h1 className="text-2xl font-bold text-foreground">Ledger Master</h1>
//             <p className="text-sm text-muted-foreground">Tally-style ledger management</p>
//           </div>
//           <div className="flex items-center gap-2 flex-wrap">
//             <div className="dashboard-card !p-2 !rounded-lg flex items-center gap-3 text-xs">
//               <span className="text-muted-foreground">Total Dr:</span>
//               <span className="font-bold text-foreground">₹{totalDr.toLocaleString()}</span>
//               <span className="text-muted-foreground">|</span>
//               <span className="text-muted-foreground">Total Cr:</span>
//               <span className="font-bold text-foreground">₹{totalCr.toLocaleString()}</span>
//               <span className="text-muted-foreground">|</span>
//               <span className="text-muted-foreground">Opening:</span>
//               <span className={`font-bold ${totalDr >= totalCr ? "text-foreground" : "text-expense"}`}>
//                 ₹{Math.abs(totalDr - totalCr).toLocaleString()} {totalDr >= totalCr ? "Dr" : "Cr"}
//               </span>
//             </div>
//           </div>
//         </motion.div>

//         {/* Shortcuts bar */}
//         <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="flex flex-wrap gap-1.5 text-[10px]">
//           {[
//             ["Ctrl+L", "Adv Ledger"], ["Alt+C", "New Group"], ["F12", "Config"], ["Ctrl+A", "Save"],
//             ["Ctrl+H", "Multi Create"], ["PgUp", "Prev"], ["PgDn", "Next"], ["Enter", "Next Field"],
//             ["F5", "Toggle View"], ["F2", "Period"], ["F3", "Company"], ["Alt+H", "Change View"],
//           ].map(([k, v]) => (
//             <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary text-muted-foreground">
//               <kbd className="font-mono font-semibold text-foreground">{k}</kbd> {v}
//             </span>
//           ))}
//         </motion.div>

//         <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "view")} className="w-full">
//           <TabsList className="mb-4">
//             <TabsTrigger value="create">Create / Edit</TabsTrigger>
//             <TabsTrigger value="view">View Ledgers</TabsTrigger>
//           </TabsList>

//           <Button
//             variant="outline"
//             size="sm"
//             onClick={() => setShowConfigDialog(true)}
//             className="gap-1.5"
//           >
//             <Settings className="h-3.5 w-3.5" /> Config
//           </Button>

//           {/* ═══════ CREATE TAB ═══════ */}
//           <TabsContent value="create">
//             <motion.div
//               key={currentIndex}
//               initial={{ opacity: 0, y: 10 }}
//               animate={{ opacity: 1, y: 0 }}
//               className="dashboard-card "
//             >
//               <AdvancedLedgerFormPanel
//                 groups={groups}
//                 groupOptions={groupOptions}
//                 onCreateGroup={() => setShowNewGroup(true)}
//                 onClose={resetForm}
//                 onOpenConfig={() => setShowConfigDialog(true)}
//                 initial={selectedLedgerForForm}
//                 onSave={async (l: AdvancedLedgerForm) => {
//                   let payload;
//                   try {
//                     payload = ledgerFormToPayload(l, financeId);
//                   } catch (err: any) {
//                     toast.error(err.message || "Select a valid Under group before saving");
//                     return;
//                   }

//                   try {
//                     if (currentIndex >= 0) {
//                       await apiUpdateLedger(ledgers[currentIndex].id, financeId, payload);
//                     } else {
//                       const res = await apiCreateLedger(payload);
//                       if (!res.data?.success) throw new Error(res.data?.message || "Failed to create ledger");
//                     }
//                   } catch (err: any) {
//                     toast.error(err?.response?.data?.message || err.message || "Failed to save ledger");
//                     return;
//                   }

//                   const entry: LedgerEntry = {
//                     id: currentIndex >= 0 ? ledgers[currentIndex].id : Date.now(),
//                     name: l.name.trim(),
//                     group: l.group,
//                     openingBalance: parseFloat(l.openingBalance) || 0,
//                     balanceType: l.drCr,
//                     effectiveDate: l.effectiveDate,
//                     billWise: l.maintainBillWise,
//                     creditPeriod: parseInt(l.defaultCreditPeriod) || 0,
//                     address: [l.addr1, l.addr2, l.city, l.state, l.pincode].filter(Boolean).join(", "),
//                     contact: l.mobile,
//                   };

//                   if (currentIndex >= 0) {
//                     setLedgers(prev => prev.map((item, i) => i === currentIndex ? entry : item));
//                     toast.success(`Ledger "${l.name}" updated`);
//                   } else {
//                     setLedgers(prev => [...prev, entry]);
//                     toast.success(`Ledger "${l.name}" created`);
//                   }
//                   resetForm();
//                 }}
//               />
//             </motion.div>

//             {/* Existing Ledgers List */}
//             <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card mt-4 p-0 overflow-hidden">
//               <div className="px-4 py-3 border-b border-border flex items-center justify-between">
//                 <h3 className="text-sm font-semibold text-foreground">{ledgers.length} Ledgers</h3>
//               </div>
//               <div className="overflow-x-auto">
//                 <table className="w-full">
//                   <thead>
//                     <tr className="border-b border-border bg-secondary/50">
//                       {["#", "Name", "Group", "Opening Bal", "Type", "Actions"].map(h => (
//                         <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
//                       ))}
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {ledgers.map((l, i) => (
//                       <tr key={l.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer ${currentIndex === i ? "bg-primary/5" : ""}`}
//                         onClick={() => loadLedger(i)}>
//                         <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
//                         <td className="px-4 py-2.5 text-sm font-medium text-foreground">{l.name}</td>
//                         <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.group}</td>
//                         <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-foreground">₹{l.openingBalance.toLocaleString()}</td>
//                         <td className="px-4 py-2.5">
//                           <Badge variant="outline" className={`text-xs ${l.balanceType === "Dr" ? "border-primary/40 text-primary" : "border-income/40 text-income"}`}>
//                             {l.balanceType}
//                           </Badge>
//                         </td>
//                         <td className="px-4 py-2.5">
//                           <button onClick={(e) => { e.stopPropagation(); setViewLedger(l); setActiveTab("view"); }} className="text-xs text-primary hover:underline">View</button>
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//             </motion.div>
//           </TabsContent>

//           {/* ═══════ VIEW TAB — TALLY PRIME STYLE ═══════ */}
//           <TabsContent value="view">
//             <div className="space-y-3">

//               {/* ── Top info bar: Company + Period + View Mode ────────────────────── */}
//               <motion.div
//                 initial={{ opacity: 0, y: -6 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 className="dashboard-card !p-3 flex flex-wrap items-center justify-between gap-3"
//               >
//                 {/* Company display */}
//                 <div className="flex items-center gap-2">
//                   <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
//                   <button
//                     onClick={() => setShowCompanyDlg(true)}
//                     className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
//                     title="Press F3 to change company"
//                   >
//                     {selectedCompany}
//                   </button>
//                   <Badge variant="outline" className="text-[9px] border-muted">F3</Badge>
//                 </div>

//                 {/* Period display */}
//                 <div className="flex items-center gap-2">
//                   <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
//                   <button
//                     onClick={() => { setPeriodFrom(period.from); setPeriodTo(period.to); setShowPeriodDlg(true); }}
//                     className="text-xs text-foreground hover:text-primary transition-colors font-mono"
//                     title="Press F2 to change period"
//                   >
//                     <span className="text-muted-foreground">From : </span>{fmtDate(period.from)}
//                     <span className="text-muted-foreground mx-2">To : </span>{fmtDate(period.to)}
//                   </button>
//                   <Badge variant="outline" className="text-[9px] border-muted">F2</Badge>
//                 </div>

//                 {/* View mode badge */}
//                 <div className="flex items-center gap-2">
//                   {viewMode === "ledger"
//                     ? <LayoutList className="h-4 w-4 text-primary shrink-0" />
//                     : <TreePine className="h-4 w-4 text-primary shrink-0" />
//                   }
//                   <span className="text-xs font-semibold text-primary">
//                     View Mode : {viewMode === "ledger" ? "Ledger Wise" : "Group Wise"}
//                   </span>
//                   <Badge variant="outline" className="text-[9px] border-muted">F5</Badge>
//                 </div>
//               </motion.div>

//               {/* ── Category tabs ── */}
//               <div className="flex gap-1 flex-wrap border-b border-border">
//                 {(["ALL", "ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "OTHERS"] as const).map(c => (
//                   <button
//                     key={c}
//                     onClick={() => setCategory(c)}
//                     className={`relative px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${category === c ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
//                   >
//                     {c}
//                     {category === c && (
//                       <motion.div layoutId="ledger-cat-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
//                     )}
//                   </button>
//                 ))}
//               </div>

//               {/* ── Action bar ────────────────────────────────────────────────────── */}
//               <div className="flex flex-wrap items-center gap-2">
//                 {/* Search */}
//                 <div className="relative flex-1 min-w-[200px] max-w-xs">
//                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
//                   <Input
//                     value={viewSearch}
//                     onChange={e => setViewSearch(e.target.value)}
//                     placeholder="Search ledgers…"
//                     className="pl-9 h-8 text-xs"
//                   />
//                 </div>

//                 {/* F5 Toggle */}
//                 <Button
//                   variant="outline"
//                   size="sm"
//                   className="h-8 gap-1.5 text-xs"
//                   onClick={() => {
//                     setViewMode(prev => prev === "ledger" ? "group" : "ledger");
//                     setViewLedger(null);
//                   }}
//                 >
//                   {viewMode === "ledger" ? <TreePine className="h-3.5 w-3.5" /> : <LayoutList className="h-3.5 w-3.5" />}
//                   F5 – {viewMode === "ledger" ? "Group View" : "Ledger View"}
//                 </Button>

//                 {/* Alt+H Change View */}
//                 <Button
//                   variant="outline"
//                   size="sm"
//                   className="h-8 gap-1.5 text-xs"
//                   onClick={() => setShowChangeView(true)}
//                 >
//                   <Eye className="h-3.5 w-3.5" />
//                   Alt+H – Change View
//                 </Button>

//                 {/* Group filter — only in ledger view */}
//                 {viewMode === "ledger" && !viewLedger && (
//                   <Select value={viewGroupFilter} onValueChange={setViewGroupFilter}>
//                     <SelectTrigger className="h-8 w-44 text-xs">
//                       <SelectValue placeholder="Filter by Group" />
//                     </SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="all">All Groups</SelectItem>
//                       {Object.keys(groupedLedgers).sort().map(g => (
//                         <SelectItem key={g} value={g}>{g}</SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                 )}
//               </div>

//               {/* ── Main view area ─────────────────────────────────────────────────── */}
//               <AnimatePresence mode="wait">
//                 {viewLoading ? (
//                   /* Skeleton loading */
//                   <motion.div
//                     key="skeleton"
//                     initial={{ opacity: 0 }}
//                     animate={{ opacity: 1 }}
//                     exit={{ opacity: 0 }}
//                     transition={{ duration: 0.15 }}
//                     className="dashboard-card p-0 overflow-hidden"
//                   >
//                     <div className="px-4 py-3 border-b border-border bg-secondary/50">
//                       <Skeleton className="h-4 w-48" />
//                     </div>
//                     <div className="divide-y divide-border/50">
//                       {[...Array(8)].map((_, i) => (
//                         <div key={i} className="flex items-center gap-4 px-4 py-3">
//                           <Skeleton className="h-3 w-6" />
//                           <Skeleton className="h-3 flex-1 max-w-[200px]" />
//                           <Skeleton className="h-3 w-32" />
//                           <Skeleton className="h-3 w-24 ml-auto" />
//                         </div>
//                       ))}
//                     </div>
//                     <div className="px-4 py-2 border-t border-border bg-secondary/30 text-center">
//                       <span className="text-xs text-muted-foreground animate-pulse">Loading Ledger Data…</span>
//                     </div>
//                   </motion.div>
//                 ) : viewLedger ? (
//                   /* Day-wise ledger drill-down */
//                   <motion.div
//                     key="dayview"
//                     initial={{ opacity: 0, x: 20 }}
//                     animate={{ opacity: 1, x: 0 }}
//                     exit={{ opacity: 0, x: -20 }}
//                     transition={{ duration: 0.2 }}
//                   >
//                     <LedgerDayView ledger={viewLedger} onBack={() => setViewLedger(null)} />
//                   </motion.div>
//                 ) : viewMode === "ledger" ? (
//                   /* ── LEDGER VIEW — flat Tally Prime table ── */
//                   <motion.div
//                     key="ledger-view"
//                     initial={{ opacity: 0, y: 8 }}
//                     animate={{ opacity: 1, y: 0 }}
//                     exit={{ opacity: 0, y: -8 }}
//                     transition={{ duration: 0.2 }}
//                     className="dashboard-card p-0 overflow-hidden"
//                   >
//                     <div className="px-4 py-2.5 border-b border-border bg-secondary/50 flex items-center justify-between">
//                       <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
//                         List of Ledgers
//                         {viewGroupFilter !== "all" && (
//                           <span className="ml-2 text-primary">— {viewGroupFilter}</span>
//                         )}
//                       </span>
//                       <span className="text-xs text-muted-foreground">
//                         {filteredViewLedgers.filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter).length} entries
//                       </span>
//                     </div>
//                     <div className="overflow-x-auto">
//                       <table className="w-full">
//                         <thead>
//                           <tr className="border-b border-border bg-secondary/30">
//                             <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-14">Sl. No.</th>
//                             <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Name of Ledger</th>
//                             <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Under</th>
//                             <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Opening Balance</th>
//                           </tr>
//                         </thead>
//                         <tbody>
//                           {filteredViewLedgers
//                             .filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter)
//                             .map((l, i) => (
//                               <tr
//                                 key={l.id}
//                                 className="border-b border-border/40 hover:bg-secondary/30 transition-colors cursor-pointer"
//                                 onClick={() => setViewLedger(l)}
//                               >
//                                 <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
//                                 <td className="px-4 py-2.5 text-sm text-foreground font-medium">{l.name}</td>
//                                 <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.group}</td>
//                                 <td className="px-4 py-2.5 text-sm font-mono tabular-nums text-right">
//                                   {l.openingBalance === 0 ? (
//                                     <span className="text-muted-foreground">—</span>
//                                   ) : (
//                                     <span className={l.balanceType === "Dr" ? "text-foreground" : "text-income"}>
//                                       ₹{l.openingBalance.toLocaleString()} {l.balanceType}
//                                     </span>
//                                   )}
//                                 </td>
//                               </tr>
//                             ))}
//                           {filteredViewLedgers.filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter).length === 0 && (
//                             <tr>
//                               <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
//                                 No ledgers found{viewSearch ? ` for "${viewSearch}"` : ""}.
//                               </td>
//                             </tr>
//                           )}
//                         </tbody>
//                         {/* Total row */}
//                         {filteredViewLedgers.filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter).length > 0 && (
//                           <tfoot>
//                             <tr className="border-t-2 border-border bg-secondary/40">
//                               <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
//                                 Total
//                               </td>
//                               <td className="px-4 py-2.5 text-sm font-bold font-mono tabular-nums text-right text-foreground">
//                                 ₹{filteredViewLedgers
//                                   .filter(l => viewGroupFilter === "all" || l.group === viewGroupFilter)
//                                   .reduce((s, l) => s + (l.balanceType === "Dr" ? l.openingBalance : -l.openingBalance), 0)
//                                   .toLocaleString()}
//                               </td>
//                             </tr>
//                           </tfoot>
//                         )}
//                       </table>
//                     </div>
//                   </motion.div>
//                 ) : (
//                   /* ── GROUP VIEW — hierarchical tree (like LedgerGroups.tsx) ── */
//                   <motion.div
//                     key="group-view"
//                     initial={{ opacity: 0, y: 8 }}
//                     animate={{ opacity: 1, y: 0 }}
//                     exit={{ opacity: 0, y: -8 }}
//                     transition={{ duration: 0.2 }}
//                   >
//                     <LedgerHierarchyView
//                       ledgers={ledgers}
//                       search={viewSearch}
//                       onSelectLedger={(l) => setViewLedger(l)}
//                       category={category}
//                     />
//                   </motion.div>
//                 )}
//               </AnimatePresence>
//             </div>
//           </TabsContent>
//         </Tabs>

//         {/* ═══════ NEW GROUP DIALOG ═══════ */}
//         <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
//           <DialogContent className="max-w-md">
//             <DialogHeader>
//               <DialogTitle>Create New Group</DialogTitle>
//               <DialogDescription>Add a new ledger group (Alt+C)</DialogDescription>
//             </DialogHeader>
//             <div className="space-y-4 pt-2">
//               <div className="space-y-1.5">
//                 <Label className="text-xs uppercase tracking-wider text-muted-foreground">Group Name</Label>
//                 <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Bank OD Accounts" autoFocus />
//               </div>
//               <Button onClick={() => {
//                 if (newGroupName.trim()) {
//                   setGroups(prev => [...prev, newGroupName.trim()].sort());
//                   setGroup(newGroupName.trim());
//                   setGroupSearch(newGroupName.trim());
//                   toast.success(`Group "${newGroupName}" created`);
//                   setNewGroupName("");
//                   setShowNewGroup(false);
//                 }
//               }} className="w-full">Create Group</Button>
//             </div>
//           </DialogContent>
//         </Dialog>

//         {/* ═══════ SUNDRY DIALOG ═══════ */}
//         <Dialog open={showSundryDialog} onOpenChange={setShowSundryDialog}>
//           <DialogContent className="max-w-lg">
//             <DialogHeader>
//               <DialogTitle>{group} – Additional Details</DialogTitle>
//               <DialogDescription>Configure bill-wise tracking and contact details</DialogDescription>
//             </DialogHeader>
//             <div className="space-y-4 pt-2">
//               <div className="flex items-center justify-between">
//                 <Label>Bill-wise Tracking</Label>
//                 <Switch checked={billWise} onCheckedChange={setBillWise} />
//               </div>
//               <div className="space-y-1.5">
//                 <Label className="text-xs uppercase tracking-wider text-muted-foreground">Credit Period (days)</Label>
//                 <Input type="number" value={creditPeriod} onChange={e => setCreditPeriod(e.target.value)} placeholder="30" />
//               </div>
//               <div className="space-y-1.5">
//                 <Label className="text-xs uppercase tracking-wider text-muted-foreground">Address</Label>
//                 <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full address" />
//               </div>
//               <div className="space-y-1.5">
//                 <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact</Label>
//                 <Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Phone number" />
//               </div>
//               <Button onClick={() => setShowSundryDialog(false)} className="w-full">Done</Button>
//             </div>
//           </DialogContent>
//         </Dialog>

//         {/* ═══════ ConfigDialog F12 ═══════ */}
//         <ConfigDialog open={showConfigDialog} onClose={() => setShowConfigDialog(false)} />

//         {/* ═══════ MULTI LEDGER (Ctrl+H) ═══════ */}
//         <MultiLedgerSelector
//           open={multiSelector}
//           onClose={() => setMultiSelector(false)}
//           onSelect={(c) => { setMultiSelector(false); setMultiChoice(c); }}
//         />
//         {multiChoice && (
//           <MultiLedger
//             mode={multiChoice.mode}
//             presetGroup={multiChoice.presetGroup}
//             titleOverride={multiChoice.titleOverride}
//             groups={groups}
//             existing={ledgers}
//             onClose={() => setMultiChoice(null)}
//             onSave={async (rows: MultiRow[]) => {
//               if (multiChoice.mode === "alter") {
//                 setLedgers(prev => prev.map(l => {
//                   const upd = rows.find(r => r.id === l.id);
//                   if (!upd) return l;
//                   return {
//                     ...l,
//                     name: upd.name.trim() || l.name,
//                     group: upd.group.trim() || l.group,
//                     openingBalance: parseFloat(upd.opening) || 0,
//                     balanceType: upd.drCr,
//                   };
//                 }));
//               } else {
//                 // Resolve each row's group name → { under_id, under_source } so the
//                 // backend can apply the same mutually-exclusive group_id /
//                 // master_group_id mapping used for single-ledger creation.
//                 const unresolved: string[] = [];
//                 const apiRows = rows.map(r => {
//                   const groupName = (r.group.trim() || multiChoice.presetGroup || "").trim();
//                   const match = groupOptions.find(g => g.group_name.toLowerCase() === groupName.toLowerCase());
//                   if (!match) unresolved.push(r.name || groupName);
//                   return {
//                     ledger_name: r.name.trim(),
//                     opening_balance: parseFloat(r.opening) || 0,
//                     ob_type: r.drCr,
//                     under_id: match?.id,
//                     under_source: match?.source,
//                   };
//                 });

//                 if (unresolved.length) {
//                   toast.error(`Could not resolve "Under" group for: ${unresolved.join(", ")}`);
//                   return;
//                 }

//                 try {
//                   const res = await apiMultiCreateLedger(financeId, apiRows as any);
//                   if (!res.data?.success) throw new Error(res.data?.message || "Failed to create ledgers");
//                 } catch (err: any) {
//                   toast.error(err?.response?.data?.message || err.message || "Failed to create ledgers");
//                   return;
//                 }

//                 const newOnes: LedgerEntry[] = rows.map((r, i) => ({
//                   id: Date.now() + i,
//                   name: r.name.trim(),
//                   group: r.group.trim() || multiChoice.presetGroup || "",
//                   openingBalance: parseFloat(r.opening) || 0,
//                   balanceType: r.drCr,
//                   effectiveDate: "2025-04-01",
//                 }));
//                 setLedgers(prev => [...prev, ...newOnes]);
//                 toast.success(`${newOnes.length} ledger(s) created`);
//               }
//             }}
//           />
//         )}

//         {/* ═══════ CHANGE VIEW DIALOG (Alt+H) ═══════ */}
//         <Dialog open={showChangeView} onOpenChange={setShowChangeView}>
//           <DialogContent className="max-w-2xl">
//             <DialogHeader>
//               <DialogTitle className="flex items-center gap-2">
//                 <Eye className="h-5 w-5 text-primary" />
//                 Change View (Alt+H)
//               </DialogTitle>
//               <DialogDescription>Select a view to apply instantly. Period and company are preserved.</DialogDescription>
//             </DialogHeader>
//             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
//               {/* Available Views */}
//               <div className="space-y-2">
//                 <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Available Views</p>
//                 {AVAILABLE_VIEWS.map(v => (
//                   <button
//                     key={v.key}
//                     onClick={() => {
//                       if (v.key === "ledger" || v.key === "group") {
//                         setViewMode(v.key as "ledger" | "group");
//                         setViewLedger(null);
//                       } else {
//                         toast.info(`${v.label} — coming soon`);
//                       }
//                       setShowChangeView(false);
//                     }}
//                     className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors
//                       ${(v.key === viewMode) ? "bg-primary/10 text-primary border border-primary/30" : "hover:bg-secondary/50 text-foreground border border-transparent"}`}
//                   >
//                     {(v.key === viewMode) && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
//                     {v.label}
//                   </button>
//                 ))}
//               </div>

//               {/* Saved Views */}
//               <div className="space-y-2">
//                 <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Saved Views</p>
//                 {SAVED_VIEWS.map(sv => (
//                   <button
//                     key={sv}
//                     onClick={() => { toast.info(`${sv} — custom view`); setShowChangeView(false); }}
//                     className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary/50 text-foreground border border-transparent transition-colors"
//                   >
//                     <Save className="h-3 w-3 text-muted-foreground shrink-0" />
//                     <span className="truncate">{sv}</span>
//                   </button>
//                 ))}
//               </div>

//               {/* Related Reports */}
//               <div className="space-y-2">
//                 <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Related Reports</p>
//                 {RELATED_REPORTS.map(rr => (
//                   <button
//                     key={rr}
//                     onClick={() => { toast.info(`${rr} — opening report`); setShowChangeView(false); }}
//                     className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary/50 text-foreground border border-transparent transition-colors"
//                   >
//                     <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
//                     {rr}
//                   </button>
//                 ))}
//               </div>
//             </div>
//             <div className="flex justify-end pt-3 border-t border-border">
//               <Button variant="outline" size="sm" onClick={() => setShowChangeView(false)}>Close (Esc)</Button>
//             </div>
//           </DialogContent>
//         </Dialog>

//         {/* ═══════ PERIOD SELECTION DIALOG (F2) ═══════ */}
//         <Dialog open={showPeriodDlg} onOpenChange={setShowPeriodDlg}>
//           <DialogContent className="max-w-md">
//             <DialogHeader>
//               <DialogTitle className="flex items-center gap-2">
//                 <Calendar className="h-5 w-5 text-primary" />
//                 Period Selection (F2)
//               </DialogTitle>
//               <DialogDescription>Select a preset or enter a custom date range.</DialogDescription>
//             </DialogHeader>
//             <div className="space-y-4 pt-2">
//               {/* Preset options */}
//               <div className="grid grid-cols-2 gap-2">
//                 {([
//                   ["month", "Current Month"],
//                   ["quarter", "Current Quarter"],
//                   ["year", "Current Year"],
//                   ["custom", "Custom Period"],
//                 ] as const).map(([key, label]) => (
//                   <button
//                     key={key}
//                     onClick={() => applyPeriodPreset(key)}
//                     className={`px-3 py-2.5 rounded-lg text-sm border transition-colors text-left font-medium
//                       ${periodPreset === key ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary/50 text-foreground"}`}
//                   >
//                     {label}
//                   </button>
//                 ))}
//               </div>

//               {/* Date inputs */}
//               <div className="grid grid-cols-2 gap-3">
//                 <div className="space-y-1.5">
//                   <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
//                   <Input
//                     type="date"
//                     value={periodFrom}
//                     onChange={e => { setPeriodFrom(e.target.value); setPeriodPreset("custom"); }}
//                   />
//                 </div>
//                 <div className="space-y-1.5">
//                   <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
//                   <Input
//                     type="date"
//                     value={periodTo}
//                     onChange={e => { setPeriodTo(e.target.value); setPeriodPreset("custom"); }}
//                   />
//                 </div>
//               </div>

//               {/* Preview */}
//               <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs font-mono text-muted-foreground">
//                 <span className="text-foreground font-semibold">Selected: </span>
//                 {fmtDate(periodFrom)} → {fmtDate(periodTo)}
//               </div>

//               <div className="flex gap-2 justify-end">
//                 <Button variant="outline" size="sm" onClick={() => setShowPeriodDlg(false)}>Cancel (Esc)</Button>
//                 <Button size="sm" onClick={applyPeriod}>Apply Period</Button>
//               </div>
//             </div>
//           </DialogContent>
//         </Dialog>

//         {/* ═══════ COMPANY SELECTION DIALOG (F3) ═══════ */}
//         <Dialog open={showCompanyDlg} onOpenChange={setShowCompanyDlg}>
//           <DialogContent className="max-w-sm">
//             <DialogHeader>
//               <DialogTitle className="flex items-center gap-2">
//                 <Building2 className="h-5 w-5 text-primary" />
//                 Company Selection (F3)
//               </DialogTitle>
//               <DialogDescription>Switching company refreshes ledger data. View, filters, and search are preserved.</DialogDescription>
//             </DialogHeader>
//             <div className="space-y-2 pt-2">
//               {COMPANIES.map(c => (
//                 <button
//                   key={c}
//                   onClick={() => switchCompany(c)}
//                   className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors
//                     ${selectedCompany === c ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-secondary/50 text-foreground"}`}
//                 >
//                   <Building2 className={`h-4 w-4 shrink-0 ${selectedCompany === c ? "text-primary" : "text-muted-foreground"}`} />
//                   {c}
//                   {selectedCompany === c && <Badge className="ml-auto text-[10px]">Active</Badge>}
//                 </button>
//               ))}
//             </div>
//             <div className="flex justify-end pt-2 border-t border-border">
//               <Button variant="outline" size="sm" onClick={() => setShowCompanyDlg(false)}>Close (Esc)</Button>
//             </div>
//           </DialogContent>
//         </Dialog>
//       </div>
//     </ConfigProvider>
//   );
// }

// // ─── LedgerHierarchyView ─────────────────────────────────────────────────────
// // Full hierarchical tree identical in structure to LedgerGroups.tsx TreeNode.

// function LedgerHierarchyView({
//   ledgers,
//   search,
//   onSelectLedger,
//   category,
// }: {
//   ledgers: LedgerEntry[];
//   search: string;
//   onSelectLedger: (l: LedgerEntry) => void;
//   category: "ALL" | "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS";
// }) {
//   // Build parent→children map from HIER_GROUPS
//   const childMap = useMemo(() => {
//     const map: Record<string, HierGroup[]> = {};
//     HIER_GROUPS.filter(g => g.parent).forEach(g => {
//       if (!map[g.parent!]) map[g.parent!] = [];
//       map[g.parent!].push(g);
//     });
//     return map;
//   }, []);

//   // Build group-name → ledgers map from current ledgers state
//   const ledgersByGroup = useMemo(() => {
//     const map: Record<string, LedgerEntry[]> = {};
//     ledgers.forEach(l => {
//       if (!map[l.group]) map[l.group] = [];
//       map[l.group].push(l);
//     });
//     // Orphaned groups (not in HIER_GROUPS) get their own root-level entry
//     return map;
//   }, [ledgers]);

//   // Known group names (lowercase) from hierarchy
//   const knownGroups = useMemo(
//     () => new Set(HIER_GROUPS.map(g => g.name.toLowerCase())),
//     []
//   );

//   const roots = useMemo(
//     () => HIER_GROUPS.filter(g => !g.parent),
//     []
//   );

//   // Orphaned ledger groups not covered by HIER_GROUPS
//   const orphanGroups = useMemo(() => {
//     return Object.keys(ledgersByGroup).filter(
//       g => !knownGroups.has(g.toLowerCase())
//     );
//   }, [ledgersByGroup, knownGroups]);

//   const q = search.toLowerCase().trim();

//   // Recursive match check — true if any node/ledger in subtree matches query
//   const hasMatch = useCallback((groupName: string): boolean => {
//     if (!q) return true;
//     if (groupName.toLowerCase().includes(q)) return true;
//     const childGroups = childMap[groupName] || [];
//     if (childGroups.some(c => hasMatch(c.name))) return true;
//     const leds = ledgersByGroup[groupName] || [];
//     return leds.some(l => l.name.toLowerCase().includes(q));
//   }, [q, childMap, ledgersByGroup]);

//   // Filter roots by category & query match
//   const visibleRoots = useMemo(() => {
//     const PRIMARY_NAMES = ["Assets", "Liabilities", "Income", "Expenses"];
//     const catFilter = (r: HierGroup) => {
//       switch (category) {
//         case "ASSETS": return r.name === "Assets";
//         case "LIABILITIES": return r.name === "Liabilities" || r.name === "Primary";
//         case "INCOME": return r.name === "Income";
//         case "EXPENSES": return r.name === "Expenses";
//         case "OTHERS": return !PRIMARY_NAMES.includes(r.name) && r.name !== "Primary";
//         default: return true;
//       }
//     };
//     return roots.filter(catFilter).filter(r => hasMatch(r.name));
//   }, [roots, category, hasMatch]);

//   // Filter orphan groups to display only in ALL or OTHERS category
//   const visibleOrphanGroups = useMemo(() => {
//     if (category !== "ALL" && category !== "OTHERS") return [];
//     return orphanGroups.filter(
//       g => !q || g.toLowerCase().includes(q) || (ledgersByGroup[g] || []).some(l => l.name.toLowerCase().includes(q))
//     );
//   }, [orphanGroups, category, q, ledgersByGroup]);

//   return (
//     <div className="space-y-2">
//       {visibleRoots.map(root => (
//         <LedgerTreeNode
//           key={root.id}
//           group={root}
//           childMap={childMap}
//           ledgersByGroup={ledgersByGroup}
//           onSelectLedger={onSelectLedger}
//           level={0}
//           search={search}
//           hasMatch={hasMatch}
//         />
//       ))}

//       {/* Orphaned ledger groups that aren't in the standard hierarchy */}
//       {visibleOrphanGroups.map(g => {
//         return (
//           <LedgerTreeNode
//             key={`orphan-${g}`}
//             group={{ id: -1, name: g, parent: null, nature: "Assets" }}
//             childMap={childMap}
//             ledgersByGroup={ledgersByGroup}
//             onSelectLedger={onSelectLedger}
//             level={0}
//             search={search}
//             hasMatch={hasMatch}
//           />
//         );
//       })}

//       {visibleRoots.length === 0 && visibleOrphanGroups.length === 0 && (
//         <div className="text-center text-sm text-muted-foreground py-12">
//           {q ? `No results found for "${search}".` : "No ledgers to display in this category."}
//         </div>
//       )}
//     </div>
//   );
// }

// // ─── LedgerTreeNode ───────────────────────────────────────────────────────────
// // Recursive node — mirrors TreeNode in LedgerGroups.tsx.

// function LedgerTreeNode({
//   group, childMap, ledgersByGroup, onSelectLedger, level, search, hasMatch,
// }: {
//   group: HierGroup;
//   childMap: Record<string, HierGroup[]>;
//   ledgersByGroup: Record<string, LedgerEntry[]>;
//   onSelectLedger: (l: LedgerEntry) => void;
//   level: number;
//   search: string;
//   hasMatch: (name: string) => boolean;
// }) {
//   const children = (childMap[group.name] || []).sort((a, b) => a.name.localeCompare(b.name));
//   const allLedgers = ledgersByGroup[group.name] || [];
//   const q = search.toLowerCase().trim();

//   const visibleLedgers = q
//     ? allLedgers.filter(l => l.name.toLowerCase().includes(q) || group.name.toLowerCase().includes(q))
//     : allLedgers;

//   const visibleChildren = children.filter(c => hasMatch(c.name));
//   const hasContent = visibleChildren.length > 0 || allLedgers.length > 0;

//   // Auto-expand root nodes or when searching
//   const [open, setOpen] = useState(level === 0 || !!search);
//   useEffect(() => { if (search) setOpen(true); }, [search]);

//   // Skip rendering if nothing matches under this node during search
//   if (q && !hasMatch(group.name)) return null;

//   const totalDr = allLedgers.filter(l => l.balanceType === "Dr").reduce((s, l) => s + l.openingBalance, 0);
//   const totalCr = allLedgers.filter(l => l.balanceType === "Cr").reduce((s, l) => s + l.openingBalance, 0);

//   return (
//     <div style={{ marginLeft: level * 16 }}>
//       <div className={`dashboard-card !p-0 overflow-hidden ${level > 0 ? "!rounded-lg" : ""}`}>
//         <button
//           onClick={() => hasContent && setOpen(o => !o)}
//           className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors text-sm group/node"
//         >
//           <div className="flex items-center gap-2">
//             {hasContent ? (
//               open
//                 ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
//                 : <ChevronRight className="h-4 w-4 text-muted-foreground" />
//             ) : (
//               <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
//             )}
//             <span className="font-medium text-foreground">{group.name}</span>
//             {visibleChildren.length > 0 && (
//               <Badge variant="secondary" className="text-[10px]">{visibleChildren.length} sub</Badge>
//             )}
//             {allLedgers.length > 0 && (
//               <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">
//                 {allLedgers.length} ledger{allLedgers.length > 1 ? "s" : ""}
//               </Badge>
//             )}
//           </div>
//           <div className="flex items-center gap-3">
//             <div className="flex gap-3 text-xs font-mono tabular-nums">
//               {totalDr > 0 && <span className="text-foreground">Dr ₹{totalDr.toLocaleString()}</span>}
//               {totalCr > 0 && <span className="text-income">Cr ₹{totalCr.toLocaleString()}</span>}
//             </div>
//             <Badge variant="outline" className={`text-[9px] ${HIER_NATURE_COLORS[group.nature]}`}>
//               {group.nature}
//             </Badge>
//           </div>
//         </button>
//       </div>

//       <AnimatePresence>
//         {open && hasContent && (
//           <motion.div
//             initial={{ height: 0, opacity: 0 }}
//             animate={{ height: "auto", opacity: 1 }}
//             exit={{ height: 0, opacity: 0 }}
//             transition={{ duration: 0.18 }}
//             className="space-y-1 mt-1 overflow-hidden"
//           >
//             {/* Child sub-groups */}
//             {visibleChildren.map(c => (
//               <LedgerTreeNode
//                 key={c.id}
//                 group={c}
//                 childMap={childMap}
//                 ledgersByGroup={ledgersByGroup}
//                 onSelectLedger={onSelectLedger}
//                 level={level + 1}
//                 search={search}
//                 hasMatch={hasMatch}
//               />
//             ))}

//             {/* Leaf ledgers under this group */}
//             {visibleLedgers.length > 0 && (
//               <div
//                 style={{ marginLeft: (level + 1) * 16 + 8 }}
//                 className="space-y-0.5 border-l border-border/40 pl-1"
//               >
//                 {visibleLedgers
//                   .sort((a, b) => a.name.localeCompare(b.name))
//                   .map(l => (
//                     <button
//                       key={l.id}
//                       onClick={() => onSelectLedger(l)}
//                       className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs hover:bg-secondary/50 transition-colors group/leaf"
//                     >
//                       <span className="flex items-center gap-2 text-muted-foreground group-hover/leaf:text-foreground">
//                         <FileText className="h-3 w-3 opacity-50" />
//                         {l.name}
//                       </span>
//                       <span className="font-mono tabular-nums">
//                         {l.openingBalance > 0 ? (
//                           <span className={l.balanceType === "Dr" ? "text-foreground" : "text-income"}>
//                             {l.balanceType} ₹{l.openingBalance.toLocaleString()}
//                           </span>
//                         ) : (
//                           <span className="text-muted-foreground">—</span>
//                         )}
//                       </span>
//                     </button>
//                   ))}
//               </div>
//             )}
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// // ─── Day-wise Ledger View ─────────────────────────────────────────────────────
// function LedgerDayView({ ledger, onBack }: { ledger: LedgerEntry; onBack: () => void }) {
//   let running = ledger.openingBalance * (ledger.balanceType === "Dr" ? 1 : -1);
//   const rows = LEDGER_ENTRIES.map(e => {
//     running += (e.debit - e.credit);
//     return { ...e, balance: Math.abs(running), type: running >= 0 ? "Dr" as const : "Cr" as const };
//   });

//   return (
//     <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//       <div className="flex items-center gap-3">
//         <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
//         <div>
//           <h3 className="text-lg font-bold text-foreground">{ledger.name}</h3>
//           <p className="text-xs text-muted-foreground">{ledger.group} • Opening: ₹{ledger.openingBalance.toLocaleString()} {ledger.balanceType}</p>
//         </div>
//       </div>
//       <div className="dashboard-card p-0 overflow-hidden">
//         <div className="overflow-x-auto">
//           <table className="w-full">
//             <thead>
//               <tr className="border-b border-border bg-secondary/50 sticky top-0">
//                 {["Date", "Particulars", "Voucher Type", "Debit", "Credit", "Balance"].map(h => (
//                   <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               <tr className="border-b border-border/50 bg-secondary/20">
//                 <td className="px-4 py-2 text-sm text-muted-foreground">{ledger.effectiveDate}</td>
//                 <td className="px-4 py-2 text-sm font-medium text-foreground" colSpan={2}>Opening Balance</td>
//                 <td className="px-4 py-2 text-sm font-mono tabular-nums">{ledger.balanceType === "Dr" ? `₹${ledger.openingBalance.toLocaleString()}` : "—"}</td>
//                 <td className="px-4 py-2 text-sm font-mono tabular-nums">{ledger.balanceType === "Cr" ? `₹${ledger.openingBalance.toLocaleString()}` : "—"}</td>
//                 <td className="px-4 py-2 text-sm font-mono tabular-nums font-semibold">₹{ledger.openingBalance.toLocaleString()} {ledger.balanceType}</td>
//               </tr>
//               {rows.map((r, i) => (
//                 <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
//                   <td className="px-4 py-2 text-sm text-muted-foreground">{r.date}</td>
//                   <td className="px-4 py-2 text-sm text-foreground">{r.particular}</td>
//                   <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.voucherType}</Badge></td>
//                   <td className="px-4 py-2 text-sm font-mono tabular-nums">{r.debit > 0 ? <span className="text-expense">₹{r.debit.toLocaleString()}</span> : "—"}</td>
//                   <td className="px-4 py-2 text-sm font-mono tabular-nums">{r.credit > 0 ? <span className="text-income">₹{r.credit.toLocaleString()}</span> : "—"}</td>
//                   <td className="px-4 py-2 text-sm font-mono tabular-nums font-semibold">₹{r.balance.toLocaleString()} {r.type}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </motion.div>
//   );
// }

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, ChevronDown, ChevronRight, Settings, Save, Trash2,
  Eye, ArrowLeft, ArrowRight, Keyboard, Building2, Calendar, LayoutList,
  TreePine, RefreshCw, FileText, Layers,
} from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
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
import { getUnderDropdown, createLedger as apiCreateLedger, updateLedger as apiUpdateLedger, multiCreateLedger as apiMultiCreateLedger } from "../../api/accounting";
import { useAuth } from "@/contexts/AuthContext";
import { RecentActivityCard, RecentActivityItem } from "./RecentActivityCard";
import { RecentlyCreatedCard, RecentlyCreatedItem } from "./RecentlyCreatedCard";
import { any } from "zod";

/** Maps the Advanced Ledger form (UI field names) onto the create/update
 *  ledger API payload (DB column / form-comment names). The "Under" group
 *  is sent as { under_id, under_source } only — the backend resolves this
 *  into the mutually-exclusive group_id / master_group_id columns. */
function ledgerFormToPayload(l: AdvancedLedgerForm, finance_id: number) {
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
  group: string;
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

// ─── Sample data (replace with GET /api/ledgers/recent-created) ───
const SAMPLE_RECENT_CREATED: RecentlyCreatedItem[] = [
  { id: "rc-1", name: "ICICI Bank", group: "Bank Accounts", createdAt: "2025-04-20" },
  { id: "rc-2", name: "John Traders", group: "Sundry Debtors", createdAt: "2025-04-19" },
  { id: "rc-3", name: "New Customer", group: "Sundry Debtors", createdAt: "2025-04-18" },
  { id: "rc-4", name: "GST Output 18%", group: "Duties & Taxes", createdAt: "2025-04-17" },
  { id: "rc-5", name: "Transport Charges", group: "Indirect Expense", createdAt: "2025-04-16" },
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
    ledgers.forEach(l => {
      if (!map[l.group]) map[l.group] = [];
      map[l.group].push(l);
    });
    return map;
  }, [ledgers]);

  // Filtered ledger list for view tab
  const filteredViewLedgers = useMemo(() => {
    const q = viewSearch.toLowerCase().trim();
    let list = ledgers;
    if (q) {
      list = list.filter(
        l => l.name.toLowerCase().includes(q) || l.group.toLowerCase().includes(q)
      );
    }
    if (category !== "ALL") {
      list = list.filter(l => getGroupCategory(l.group) === category);
    }
    return list;
  }, [ledgers, viewSearch, category]);

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
  }, [currentIndex, ledgers]);

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
                  groups={groups}
                  groupOptions={groupOptions}
                  onCreateGroup={() => setShowNewGroup(true)}
                  onClose={resetForm}
                  onOpenConfig={() => setShowConfigDialog(true)}
                  initial={selectedLedgerForForm}
                  onSave={async (l: AdvancedLedgerForm) => {
                    let payload;
                    try {
                      payload = ledgerFormToPayload(l, financeId);
                      console.log('Ledger Payload:', payload)
                    } catch (err: any) {
                      toast.error(err.message || "Select a valid Under group before saving");
                      return;
                    }

                    try {
                      if (currentIndex >= 0) {
                        await apiUpdateLedger(ledgers[currentIndex].id, financeId, payload);
                      } else {
                        const res = await apiCreateLedger(payload);
                        if (!res.data?.success) throw new Error(res.data?.message || "Failed to create ledger");
                      }
                    } catch (err: any) {
                      toast.error(err?.response?.data?.message || err.message || "Failed to save ledger");
                      return;
                    }

                    const entry: LedgerEntry = {
                      id: currentIndex >= 0 ? ledgers[currentIndex].id : Date.now(),
                      name: l.name.trim(),
                      group: l.group,
                      openingBalance: parseFloat(l.openingBalance) || 0,
                      balanceType: l.drCr,
                      effectiveDate: l.effectiveDate,
                      billWise: l.maintainBillWise,
                      creditPeriod: parseInt(l.defaultCreditPeriod) || 0,
                      address: [l.addr1, l.addr2, l.city, l.state, l.pincode].filter(Boolean).join(", "),
                      contact: l.mobile,
                      createdAt: currentIndex >= 0 ? ledgers[currentIndex].createdAt : Date.now(),
                    };

                    if (currentIndex >= 0) {
                      setLedgers(prev => prev.map((item, i) => i === currentIndex ? entry : item));
                      toast.success(`Ledger "${l.name}" updated`);
                    } else {
                      setLedgers(prev => [...prev, entry]);
                      toast.success(`Ledger "${l.name}" created`);
                    }
                    resetForm();
                  }}
                />
              </motion.div>

              {/* Right column: Dashboard cards */}
              <div className="space-y-4">
                <RecentlyCreatedCard
                  items={SAMPLE_RECENT_CREATED}
                  onSelect={(it) => {
                    const idx = ledgers.findIndex(l => l.name.toLowerCase() === it.name.toLowerCase());
                    if (idx >= 0) {
                      loadLedger(idx);
                    } else {
                      resetForm();
                      setName(it.name);
                      setGroup(it.group);
                      setGroupSearch(it.group);
                    }
                  }}
                />
                <RecentActivityCard
                  items={SAMPLE_RECENT_ACTIVITY}
                  onSelect={(it) => {
                    const existing = ledgers.find(l => l.name.toLowerCase() === it.name.toLowerCase());
                    const target: LedgerEntry = existing ?? {
                      id: -1,
                      name: it.name,
                      group: it.group,
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
                    <LedgerHierarchyView
                      ledgers={ledgers}
                      search={viewSearch}
                      onSelectLedger={(l) => setViewLedger(l)}
                      category={category}
                    />
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

                const newOnes: LedgerEntry[] = rows.map((r, i) => ({
                  id: Date.now() + i,
                  name: r.name.trim(),
                  group: r.group.trim() || multiChoice.presetGroup || "",
                  openingBalance: parseFloat(r.opening) || 0,
                  balanceType: r.drCr,
                  effectiveDate: "2025-04-01",
                  createdAt: Date.now() + i,
                }));
                setLedgers(prev => [...prev, ...newOnes]);
                toast.success(`${newOnes.length} ledger(s) created`);
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
                  <Input
                    type="date"
                    value={periodFrom}
                    onChange={e => { setPeriodFrom(e.target.value); setPeriodPreset("custom"); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    value={periodTo}
                    onChange={e => { setPeriodTo(e.target.value); setPeriodPreset("custom"); }}
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
// Full hierarchical tree identical in structure to LedgerGroups.tsx TreeNode.

function LedgerHierarchyView({
  ledgers,
  search,
  onSelectLedger,
  category,
}: {
  ledgers: LedgerEntry[];
  search: string;
  onSelectLedger: (l: LedgerEntry) => void;
  category: "ALL" | "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS";
}) {
  // Build parent→children map from HIER_GROUPS
  const childMap = useMemo(() => {
    const map: Record<string, HierGroup[]> = {};
    HIER_GROUPS.filter(g => g.parent).forEach(g => {
      if (!map[g.parent!]) map[g.parent!] = [];
      map[g.parent!].push(g);
    });
    return map;
  }, []);

  // Build group-name → ledgers map from current ledgers state
  const ledgersByGroup = useMemo(() => {
    const map: Record<string, LedgerEntry[]> = {};
    ledgers.forEach(l => {
      if (!map[l.group]) map[l.group] = [];
      map[l.group].push(l);
    });
    // Orphaned groups (not in HIER_GROUPS) get their own root-level entry
    return map;
  }, [ledgers]);

  // Known group names (lowercase) from hierarchy
  const knownGroups = useMemo(
    () => new Set(HIER_GROUPS.map(g => g.name.toLowerCase())),
    []
  );

  const roots = useMemo(
    () => HIER_GROUPS.filter(g => !g.parent),
    []
  );

  // Orphaned ledger groups not covered by HIER_GROUPS
  const orphanGroups = useMemo(() => {
    return Object.keys(ledgersByGroup).filter(
      g => !knownGroups.has(g.toLowerCase())
    );
  }, [ledgersByGroup, knownGroups]);

  const q = search.toLowerCase().trim();

  // Recursive match check — true if any node/ledger in subtree matches query
  const hasMatch = useCallback((groupName: string): boolean => {
    if (!q) return true;
    if (groupName.toLowerCase().includes(q)) return true;
    const childGroups = childMap[groupName] || [];
    if (childGroups.some(c => hasMatch(c.name))) return true;
    const leds = ledgersByGroup[groupName] || [];
    return leds.some(l => l.name.toLowerCase().includes(q));
  }, [q, childMap, ledgersByGroup]);

  // Filter roots by category & query match
  const visibleRoots = useMemo(() => {
    const PRIMARY_NAMES = ["Assets", "Liabilities", "Income", "Expenses"];
    const catFilter = (r: HierGroup) => {
      switch (category) {
        case "ASSETS": return r.name === "Assets";
        case "LIABILITIES": return r.name === "Liabilities" || r.name === "Primary";
        case "INCOME": return r.name === "Income";
        case "EXPENSES": return r.name === "Expenses";
        case "OTHERS": return !PRIMARY_NAMES.includes(r.name) && r.name !== "Primary";
        default: return true;
      }
    };
    return roots.filter(catFilter).filter(r => hasMatch(r.name));
  }, [roots, category, hasMatch]);

  // Filter orphan groups to display only in ALL or OTHERS category
  const visibleOrphanGroups = useMemo(() => {
    if (category !== "ALL" && category !== "OTHERS") return [];
    return orphanGroups.filter(
      g => !q || g.toLowerCase().includes(q) || (ledgersByGroup[g] || []).some(l => l.name.toLowerCase().includes(q))
    );
  }, [orphanGroups, category, q, ledgersByGroup]);

  return (
    <div className="space-y-2">
      {visibleRoots.map(root => (
        <LedgerTreeNode
          key={root.id}
          group={root}
          childMap={childMap}
          ledgersByGroup={ledgersByGroup}
          onSelectLedger={onSelectLedger}
          level={0}
          search={search}
          hasMatch={hasMatch}
        />
      ))}

      {/* Orphaned ledger groups that aren't in the standard hierarchy */}
      {visibleOrphanGroups.map(g => {
        return (
          <LedgerTreeNode
            key={`orphan-${g}`}
            group={{ id: -1, name: g, parent: null, nature: "Assets" }}
            childMap={childMap}
            ledgersByGroup={ledgersByGroup}
            onSelectLedger={onSelectLedger}
            level={0}
            search={search}
            hasMatch={hasMatch}
          />
        );
      })}

      {visibleRoots.length === 0 && visibleOrphanGroups.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12">
          {q ? `No results found for "${search}".` : "No ledgers to display in this category."}
        </div>
      )}
    </div>
  );
}

// ─── LedgerTreeNode ───────────────────────────────────────────────────────────
// Recursive node — mirrors TreeNode in LedgerGroups.tsx.

function LedgerTreeNode({
  group, childMap, ledgersByGroup, onSelectLedger, level, search, hasMatch,
}: {
  group: HierGroup;
  childMap: Record<string, HierGroup[]>;
  ledgersByGroup: Record<string, LedgerEntry[]>;
  onSelectLedger: (l: LedgerEntry) => void;
  level: number;
  search: string;
  hasMatch: (name: string) => boolean;
}) {
  const children = (childMap[group.name] || []).sort((a, b) => a.name.localeCompare(b.name));
  const allLedgers = ledgersByGroup[group.name] || [];
  const q = search.toLowerCase().trim();

  const visibleLedgers = q
    ? allLedgers.filter(l => l.name.toLowerCase().includes(q) || group.name.toLowerCase().includes(q))
    : allLedgers;

  const visibleChildren = children.filter(c => hasMatch(c.name));
  const hasContent = visibleChildren.length > 0 || allLedgers.length > 0;

  // Auto-expand root nodes or when searching
  const [open, setOpen] = useState(level === 0 || !!search);
  useEffect(() => { if (search) setOpen(true); }, [search]);

  // Skip rendering if nothing matches under this node during search
  if (q && !hasMatch(group.name)) return null;

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
                key={c.id}
                group={c}
                childMap={childMap}
                ledgersByGroup={ledgersByGroup}
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
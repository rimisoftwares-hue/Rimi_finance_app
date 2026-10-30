
// import { useState, useEffect, useCallback, useMemo } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import { motion, AnimatePresence } from "framer-motion";
// import { MultiGroupSelector, type MultiGroupChoice } from "@/components/multiCreation/MultiGroupSelector";
// import { MultiGroupPanel } from "@/components/multiCreation/MultiGroupPanel";
// import {
//   Plus, ChevronDown, ChevronRight, Settings, FolderTree,
//   Layers, Search, FileText, Building2, Calendar, RefreshCw, Loader2,
// } from "lucide-react";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Switch } from "@/components/ui/switch";
// import { Label } from "@/components/ui/label";
// import { Badge } from "@/components/ui/badge";
// import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
// import { Skeleton } from "@/components/ui/skeleton";
// import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
// import { Check } from "lucide-react";
// import { toast } from "sonner";
// import { AdvancedGroupDialog } from "@/components/accounts/AdvancedGroupDialog";
// import { getAccLedgerGroups, UnderDropdownItem, getUnderDropdown } from "@/api/accounting";
// import { useAuth } from "@/contexts/AuthContext";

// // ─── Types ────────────────────────────────────────────────────────────────────

// type Nature = "Assets" | "Liabilities" | "Income" | "Expense";

// interface LedgerGroup {
//   id: number;
//   dbId?: number;
//   name: string;
//   alias?: string;
//   parent: string | null;
//   nature: Nature;
//   isCustom?: boolean;
// }

// // ─── SEED_GROUPS ──────────────────────────────────────────────────────────────
// // Exact Tally-style Chart of Accounts hierarchy.
// // Shown instantly on page load. DB custom groups are merged on top.

// const SEED_GROUPS: LedgerGroup[] = (() => {
//   let id = 0;
//   const mk = (name: string, parent: string | null, nature: Nature): LedgerGroup =>
//     ({ id: ++id, name, parent, nature, isCustom: false });
//   return [
//     // ── Primary Groups (Liabilities) ──
//     mk("Capital Account", null, "Liabilities"),
//     mk("Reserves & Surplus", "Capital Account", "Liabilities"),
//     mk("Loans (Liability)", null, "Liabilities"),
//     mk("Secured Loans", "Loans (Liability)", "Liabilities"),
//     mk("Unsecured Loans", "Loans (Liability)", "Liabilities"),
//     mk("Bank OD A/c", "Loans (Liability)", "Liabilities"),
//     mk("Current Liabilities", null, "Liabilities"),
//     mk("Sundry Creditors", "Current Liabilities", "Liabilities"),
//     mk("Duties & Taxes", "Current Liabilities", "Liabilities"),
//     mk("Provisions", "Current Liabilities", "Liabilities"),
//     mk("Branch / Divisions", null, "Liabilities"),

//     // ── Primary Groups (Assets) ──
//     mk("Fixed Assets", null, "Assets"),
//     mk("Investments", null, "Assets"),
//     mk("Current Assets", null, "Assets"),
//     mk("Sundry Debtors", "Current Assets", "Assets"),
//     mk("Cash-in-hand", "Current Assets", "Assets"),
//     mk("Bank Accounts", "Current Assets", "Assets"),
//     mk("Stock-in-hand", "Current Assets", "Assets"),
//     mk("Deposits (Asset)", "Current Assets", "Assets"),
//     mk("Loans & Advances (Asset)", "Current Assets", "Assets"),
//     mk("Misc. Expenses (Asset)", null, "Assets"),
//     mk("Suspense A/c", null, "Assets"),

//     // ── Primary Groups (Income) ──
//     mk("Sales Accounts", null, "Income"),
//     mk("Direct Incomes", null, "Income"),
//     mk("Indirect Incomes", null, "Income"),

//     // ── Primary Groups (Expenses) ──
//     mk("Purchase Accounts", null, "Expense"),
//     mk("Direct Expenses", null, "Expense"),
//     mk("Indirect Expenses", null, "Expense"),
//   ];
// })();

// const NATURE_COLORS: Record<Nature, string> = {
//   Assets: "border-primary/40 text-primary",
//   Liabilities: "border-red-400/40 text-red-600 dark:text-red-400",
//   Income: "border-green-400/40 text-green-600 dark:text-green-400",
//   Expense: "border-amber-400/40 text-amber-600 dark:text-amber-400",
// };

// // ─── Merge DB custom groups into the seed tree ────────────────────────────────

// function mergeCustomGroups(
//   customGroups: { id: number; group_name: string; nature: string; system_parent_id: number | null; custom_parent_id: number | null; alias?: string | null }[],
//   underItems: UnderDropdownItem[],
// ): LedgerGroup[] {
//   const seedNames = new Set(SEED_GROUPS.map(g => g.name.toLowerCase()));
//   // Build id→name for resolving parent names
//   const idToName = new Map<number, string>();
//   underItems.forEach(item => idToName.set(item.id, item.group_name));

//   const extras: LedgerGroup[] = [];
//   let tempId = 10_000;
//   customGroups.forEach(g => {
//     if (seedNames.has(g.group_name.toLowerCase())) return; // already covered by seed
//     const parentName = g.system_parent_id != null
//       ? idToName.get(g.system_parent_id) ?? null
//       : g.custom_parent_id != null
//         ? idToName.get(g.custom_parent_id) ?? null
//         : null;
//     extras.push({
//       id: tempId++,
//       dbId: g.id,
//       name: g.group_name,
//       alias: g.alias || "",
//       parent: parentName,
//       nature: (g.nature === "Expenses" ? "Expense" : g.nature) as Nature,
//       isCustom: true,
//     });
//   });

//   return [...SEED_GROUPS, ...extras];
// }

// // ─── Config state ─────────────────────────────────────────────────────────────

// interface ConfigState {
//   showHierarchy: boolean;
//   enableSubLedger: boolean;
//   nettReporting: boolean;
//   enableAutoInheritance: boolean;
//   allowAliases: boolean;
//   enableTallyShortcuts: boolean;
//   allowAdvancedMasters: boolean;
// }

// const DEFAULT_CONFIG: ConfigState = {
//   showHierarchy: true,
//   enableSubLedger: false,
//   nettReporting: false,
//   enableAutoInheritance: true,
//   allowAliases: false,
//   enableTallyShortcuts: true,
//   allowAdvancedMasters: true,
// };

// // ─── Main Component ───────────────────────────────────────────────────────────

// export default function LedgerGroups() {
//   const { currentFinance } = useAuth();
//   const financeId = currentFinance?.id ?? 0;

//   // groups starts with SEED_GROUPS → tree is visible immediately
//   const [groups, setGroups] = useState<LedgerGroup[]>(SEED_GROUPS);
//   const [dbFetching, setDbFetching] = useState(false);
//   const [showCreate, setShowCreate] = useState(false);
//   const [showAdvCreate, setShowAdvCreate] = useState(false);
//   const [showConfig, setShowConfig] = useState(false);
//   // ── Multi Group (Alt+H) ──
//   const [multiGroupSelectorOpen, setMultiGroupSelectorOpen] = useState(false);
//   const [multiGroupChoice, setMultiGroupChoice] = useState<MultiGroupChoice | null>(null);
//   const [search, setSearch] = useState("");
//   const [category, setCategory] = useState<"ALL" | "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS">("ALL");
//   const [company, setCompany] = useState(currentFinance?.name ?? "Main Finance Co.");
//   const [period, setPeriod] = useState("FY 2025-26");
//   const [skelLoading, setSkelLoading] = useState(false);

//   // Skeleton flash on category/company/period switch — Tally Prime style
//   useEffect(() => {
//     setSkelLoading(true);
//     const t = setTimeout(() => setSkelLoading(false), 280);
//     return () => clearTimeout(t);
//   }, [category, company, period]);

//   // Quick-create form
//   const [formName, setFormName] = useState("");
//   const [formAlias, setFormAlias] = useState("");
//   const [formParent, setFormParent] = useState<string>("__none__");
//   const [formNature, setFormNature] = useState<Nature>("Assets");
//   const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
//   const [draftConfig, setDraftConfig] = useState<ConfigState>(DEFAULT_CONFIG);
//   useEffect(() => { if (showConfig) setDraftConfig(config); }, [showConfig, config]);

//   const navigate = useNavigate();

//   // Auto-inherit nature from selected parent in Quick Create
//   useEffect(() => {
//     if (!config.enableAutoInheritance || formParent === "__none__") return;
//     const p = groups.find(g => g.name === formParent);
//     if (p) setFormNature(p.nature);
//   }, [formParent, groups, config.enableAutoInheritance]);

//   const isQuickPrimary = formParent === "__none__";

//   // ─── Fetch DB custom groups and merge with SEED_GROUPS ──────────────────────
//   const fetchAndMerge = useCallback(async () => {
//     if (!financeId) return;
//     setDbFetching(true);
//     try {
//       const [groupsRes, underRes] = await Promise.all([
//         getAccLedgerGroups(),
//         getUnderDropdown(),
//       ]);

//       if (groupsRes.data.success && underRes.data.success) {
//         const customGroups = (groupsRes.data.data as any).customGroups || (Array.isArray(groupsRes.data.data) ? groupsRes.data.data : []);
//         setGroups(mergeCustomGroups(customGroups, underRes.data.data));
//       }
//     } catch (err: any) {
//       toast.error(err?.response?.data?.message || "Failed to sync groups from server");
//     } finally {
//       setDbFetching(false);
//     }
//   }, [financeId]);

//   useEffect(() => { fetchAndMerge(); }, [fetchAndMerge]);

//   // ─── Keyboard shortcuts — Tally Prime style ─────────────────────────────────
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => {
//       const tag = (e.target as HTMLElement)?.tagName;
//       const inField = tag === "INPUT" || tag === "TEXTAREA";
//       if (e.ctrlKey && e.key.toLowerCase() === "g") { e.preventDefault(); setShowAdvCreate(true); return; }
//       if (e.altKey && e.key.toLowerCase() === "c") { e.preventDefault(); setShowCreate(true); return; }
//       // Alt+H → Multi Group Operations (same as Ledger page)
//       if (e.altKey && e.key.toLowerCase() === "h") {
//         // Don't open if the Multi Group panel itself is active
//         if (multiGroupChoice) return;
//         e.preventDefault();
//         setMultiGroupSelectorOpen(true);
//         return;
//       }
//       if (e.key === "F12") { e.preventDefault(); setShowConfig(true); return; }
//       if (!config.enableTallyShortcuts || inField || e.altKey) return;
//       if (e.ctrlKey && !e.shiftKey) {
//         const map: Record<string, { path?: string; msg: string }> = {
//           l: { path: "/accounts/ledger", msg: "Create Ledger" },
//           v: { path: "/accounts/vouchers", msg: "Create Voucher Type" },
//         };
//         const m = map[e.key.toLowerCase()];
//         if (m) { e.preventDefault(); if (m.path) navigate(m.path); else toast.info(m.msg); }
//       }
//     };
//     window.addEventListener("keydown", handler);
//     return () => window.removeEventListener("keydown", handler);
//   }, [navigate, config.enableTallyShortcuts, multiGroupChoice]);

//   // ─── AdvancedGroupDialog callback ─────────────────────────────────────────
//   const handleGroupsSaved = useCallback((newGroups: { id: number; name: string; nature: string; parentName: string }[]) => {
//     setGroups(prev => {
//       const existingNames = new Set(prev.map(g => g.name.toLowerCase()));
//       const toAdd = newGroups
//         .filter(g => !existingNames.has(g.name.toLowerCase()))
//         .map((g, i) => ({
//           id: Date.now() + i,
//           name: g.name,
//           parent: g.parentName === "__none__" ? null : g.parentName,
//           nature: (g.nature === "Expenses" ? "Expense" : g.nature) as Nature,
//           isCustom: true,
//         }));
//       return [...prev, ...toAdd];
//     });
//   }, []);

//   // ─── Quick create (local state only — no API call since dialog sends the correct parent) ─
//   const handleCreate = useCallback(() => {
//     const name = formName.trim();
//     if (!name) { toast.error("Group name is required"); return; }
//     if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) { toast.error(`"${name}" already exists`); return; }
//     if (formParent !== "__none__" && formParent.toLowerCase() === name.toLowerCase()) { toast.error("Parent cannot reference itself"); return; }
//     setGroups(prev => [...prev, {
//       id: Date.now(),
//       name,
//       parent: formParent === "__none__" ? null : formParent,
//       nature: formNature,
//       isCustom: true,
//     }]);
//     toast.success(`Group "${name}" created`);
//     setFormName(""); setFormAlias("");
//     setFormParent("__none__");
//     setShowCreate(false);
//   }, [formName, formParent, formNature, groups]);

//   // ─── Ledger leaves (fetched from backend) ────────────────────────────────────
//   const [ledgersByGroup, setLedgersByGroup] = useState<Record<string, { name: string; group: string }[]>>({});

//   useEffect(() => {
//     if (!financeId) return;
//     import("@/api/accounting").then(({ getLedgers }) => {
//       getLedgers(financeId)
//         .then((res: any) => {
//           if (res?.data?.success) {
//             const map: Record<string, { name: string; group: string }[]> = {};
//             (res.data.data as { ledger_name: string; group_name: string }[]).forEach(l => {
//               const grp = l.group_name;
//               if (!map[grp]) map[grp] = [];
//               map[grp].push({ name: l.ledger_name, group: grp });
//             });
//             setLedgersByGroup(map);
//           }
//         })
//         .catch(() => {/* silently ignore — tree still renders without leaf ledgers */ });
//     });
//   }, [financeId]);

//   // ─── Build tree ────────────────────────────────────────────────────────────
//   const tree = useMemo(() => {
//     const q = search.toLowerCase().trim();

//     // Find root groups (groups without parent)
//     const allRoots = groups.filter(g => !g.parent);

//     // Define PRIMARY category names
//     const PRIMARY = ["Assets", "Liabilities", "Income", "Expenses"];

//     // Filter roots based on selected category
//     const catFilter = (r: LedgerGroup) => {
//       switch (category) {
//         case "ASSETS":
//           return r.name === "Assets" || r.nature === "Assets";
//         case "LIABILITIES":
//           return r.name === "Liabilities" || r.nature === "Liabilities";
//         case "INCOME":
//           return r.name === "Income" || r.nature === "Income";
//         case "EXPENSES":
//           return r.name === "Expenses" || r.nature === "Expense";
//         case "OTHERS":
//           // Show all groups that are NOT under the primary categories
//           // A group is "Others" if it's not under Assets, Liabilities, Income, or Expenses
//           // OR if it's a root group that doesn't match any primary category
//           return !PRIMARY.includes(r.name) && !["Assets", "Liabilities", "Income", "Expense"].includes(r.nature);
//         default: // ALL
//           return true;
//       }
//     };

//     const roots = allRoots.filter(catFilter);

//     // Build child map
//     const childMap: Record<string, LedgerGroup[]> = {};
//     groups.filter(g => g.parent).forEach(g => {
//       if (!childMap[g.parent!]) childMap[g.parent!] = [];
//       childMap[g.parent!].push(g);
//     });

//     // Filter child groups based on category as well
//     const filteredChildMap: Record<string, LedgerGroup[]> = {};

//     // If category is ALL, show all children
//     if (category === "ALL") {
//       Object.keys(childMap).forEach(parent => {
//         filteredChildMap[parent] = childMap[parent];
//       });
//     } else {
//       // For specific categories, filter children by nature
//       const allowedNatures: Nature[] = [];
//       if (category === "ASSETS") allowedNatures.push("Assets");
//       else if (category === "LIABILITIES") allowedNatures.push("Liabilities");
//       else if (category === "INCOME") allowedNatures.push("Income");
//       else if (category === "EXPENSES") allowedNatures.push("Expense");
//       else if (category === "OTHERS") {
//         // For OTHERS, show children that are not in primary categories
//         Object.keys(childMap).forEach(parent => {
//           filteredChildMap[parent] = childMap[parent].filter(c =>
//             !["Assets", "Liabilities", "Income", "Expense"].includes(c.nature)
//           );
//         });
//         return { roots: roots.filter(r => r.name !== "Assets" && r.name !== "Liabilities" && r.name !== "Income" && r.name !== "Expenses"), childMap: filteredChildMap };
//       }

//       // For ASSETS, LIABILITIES, INCOME, EXPENSES - filter children by nature
//       Object.keys(childMap).forEach(parent => {
//         filteredChildMap[parent] = childMap[parent].filter(c =>
//           allowedNatures.includes(c.nature)
//         );
//       });
//     }

//     // Search matching function
//     const matches = (name: string): boolean => {
//       if (!q) return true;
//       if (name.toLowerCase().includes(q)) return true;
//       if ((ledgersByGroup[name] || []).some(l => l.name.toLowerCase().includes(q))) return true;
//       return (filteredChildMap[name] || []).some(c => matches(c.name));
//     };

//     return {
//       roots: roots.filter(r => matches(r.name)),
//       childMap: filteredChildMap
//     };
//   }, [groups, search, ledgersByGroup, category]);

//   // Nature summary counts
//   const natureCounts = useMemo(() => {
//     const map: Record<string, number> = { Assets: 0, Liabilities: 0, Income: 0, Expense: 0 };
//     groups.forEach(g => { map[g.nature] = (map[g.nature] || 0) + 1; });
//     return map;
//   }, [groups]);

//   const customCount = useMemo(() => groups.filter(g => g.isCustom).length, [groups]);

//   const createLedgerInGroup = useCallback((groupName: string) => {
//     try { sessionStorage.setItem("ledger:presetGroup", groupName); } catch { }
//     navigate("/accounts/ledger");
//   }, [navigate]);

//   return (
//     <div className="space-y-4">
//       {/* ── Header ── */}
//       <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
//         <div>
//           <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
//             <FolderTree className="h-6 w-6 text-primary" /> Ledger Groups
//           </h1>
//           <p className="text-sm text-muted-foreground">
//             Hierarchical group management —
//             <span className="text-primary font-medium"> {groups.length} groups</span>
//             {customCount > 0 && <span className="text-muted-foreground"> ({customCount} custom)</span>}
//           </p>
//         </div>
//         <div className="flex gap-2 flex-wrap">
//           {config.allowAdvancedMasters && (
//             <Button onClick={() => setShowAdvCreate(true)} size="sm" className="gap-1">
//               <Plus className="h-3.5 w-3.5" /> Create Group (Ctrl+G)
//             </Button>
//           )}
//           <Button onClick={() => setShowCreate(true)} size="sm" variant="outline" className="gap-1">
//             <Plus className="h-3.5 w-3.5" /> Quick (Alt+C)
//           </Button>
//           <Button variant="outline" size="sm" onClick={fetchAndMerge} disabled={dbFetching} title="Refresh from server">
//             {dbFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
//           </Button>
//           <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
//             <Settings className="h-3.5 w-3.5 mr-1" /> F12
//           </Button>
//         </div>
//       </motion.div>

//       {/* ── Shortcuts ── */}
//       <div className="flex gap-1.5 text-[10px] flex-wrap">
//         {[["Ctrl+G", "Group"], ["Ctrl+Alt+G", "Multi"], ["Alt+C", "Quick"], ["Alt+H", "Multi Group"], ["F12", "Config"]].map(([k, v]) => (
//           <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary text-muted-foreground">
//             <kbd className="font-mono font-semibold text-foreground">{k}</kbd> {v}
//           </span>
//         ))}
//         {dbFetching && (
//           <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-[10px]">
//             <Loader2 className="h-2.5 w-2.5 animate-spin" /> Syncing…
//           </span>
//         )}
//       </div>

//       {/* ── Company + Period ── */}
//       <div className="flex flex-wrap items-center gap-2">
//         <div className="flex items-center gap-1.5">
//           <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
//           <Select value={company} onValueChange={setCompany}>
//             <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue /></SelectTrigger>
//             <SelectContent>
//               {[currentFinance?.name ?? "Main Finance Co.", "Branch – Coimbatore", "Branch – Madurai"].filter(Boolean).map(c => (
//                 <SelectItem key={c} value={c!}>{c}</SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         </div>
//         <div className="flex items-center gap-1.5">
//           <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
//           <Select value={period} onValueChange={setPeriod}>
//             <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
//             <SelectContent>
//               {["FY 2025-26", "FY 2024-25", "Q1 2025-26", "Q2 2025-26"].map(p => (
//                 <SelectItem key={p} value={p}>{p}</SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         </div>
//       </div>

//       {/* ── Category tabs ── */}
//       <div className="flex gap-1 flex-wrap border-b border-border">
//         {(["ALL", "ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "OTHERS"] as const).map(c => (
//           <button
//             key={c}
//             onClick={() => setCategory(c)}
//             className={`relative px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${category === c ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
//           >
//             {c}
//             {category === c && (
//               <motion.div layoutId="cat-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
//             )}
//           </button>
//         ))}
//       </div>

//       {/* ── Search ── */}
//       <div className="relative max-w-sm">
//         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//         <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups or ledgers…" className="pl-9" />
//       </div>

//       {/* ── Nature summary ── */}
//       <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
//         {(["Assets", "Liabilities", "Income", "Expense"] as Nature[]).map(n => (
//           <motion.div key={n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card !p-4 text-center">
//             <p className="text-xs text-muted-foreground uppercase tracking-wider">{n}</p>
//             <p className="text-2xl font-bold text-foreground mt-1">{natureCounts[n] ?? 0}</p>
//           </motion.div>
//         ))}
//       </div>

//       {/* ── Tree ── */}
//       <AnimatePresence mode="wait">
//         {skelLoading ? (
//           <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
//             {[0, 1, 2, 3, 4].map(i => (
//               <div key={i} className="dashboard-card !p-3 flex items-center gap-3" style={{ marginLeft: (i % 3) * 16 }}>
//                 <Skeleton className="h-4 w-4 rounded" />
//                 <Skeleton className="h-4 flex-1 max-w-[40%]" />
//                 <Skeleton className="h-4 w-16" />
//               </div>
//             ))}
//           </motion.div>
//         ) : (
//           <motion.div key={`tree-${category}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-2">
//             {tree.roots.length === 0 && (
//               <div className="text-center text-sm text-muted-foreground py-12">No groups found in this category.</div>
//             )}
//             {tree.roots.sort((a, b) => a.name.localeCompare(b.name)).map(root => (
//               <TreeNode
//                 key={`${category}-${root.id}`}
//                 group={root}
//                 childMap={tree.childMap}
//                 ledgersByGroup={ledgersByGroup}
//                 onAddLedger={createLedgerInGroup}
//                 level={0}
//                 search={search}
//                 autoExpand={category !== "ALL"}
//               />
//             ))}
//           </motion.div>
//         )}
//       </AnimatePresence>

//       {/* ── Quick Create Dialog ── */}
//       <Dialog open={showCreate} onOpenChange={setShowCreate}>
//         <DialogContent className="max-w-md">
//           <DialogHeader>
//             <DialogTitle>Quick Create Ledger Group</DialogTitle>
//             <DialogDescription>Add a new group to the local hierarchy</DialogDescription>
//           </DialogHeader>
//           <div className="space-y-4 pt-2">
//             <div className="space-y-1.5">
//               <Label className="text-xs uppercase tracking-wider text-muted-foreground">Group Name</Label>
//               <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Bank OD Accounts" autoFocus onKeyDown={e => e.key === "Enter" && handleCreate()} />
//             </div>
//             {config.allowAliases && (
//               <div className="space-y-1.5">
//                 <Label className="text-xs uppercase tracking-wider text-muted-foreground">Alias</Label>
//                 <Input value={formAlias} onChange={e => setFormAlias(e.target.value)} placeholder="Short name" />
//               </div>
//             )}
//             <div className="space-y-1.5">
//               <Label className="text-xs uppercase tracking-wider text-muted-foreground">Under (Parent Group)</Label>
//               <SearchableParentSelect value={formParent} onChange={setFormParent} groups={groups} />
//             </div>
//             {(isQuickPrimary || !config.enableAutoInheritance) && (
//               <div className="space-y-1.5">
//                 <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nature</Label>
//                 <Select value={formNature} onValueChange={(v) => setFormNature(v as Nature)}>
//                   <SelectTrigger><SelectValue /></SelectTrigger>
//                   <SelectContent>
//                     {(["Assets", "Liabilities", "Income", "Expense"] as Nature[]).map(n => (
//                       <SelectItem key={n} value={n}>{n}</SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//               </div>
//             )}
//             <Button onClick={handleCreate} className="w-full">Create Group</Button>
//           </div>
//         </DialogContent>
//       </Dialog>

//       {/* ── Config Dialog (F12) ── */}
//       <Dialog open={showConfig} onOpenChange={setShowConfig}>
//         <DialogContent
//           className="max-w-md"
//           onKeyDown={(e) => {
//             if (e.ctrlKey && e.key.toLowerCase() === "a") {
//               e.preventDefault(); setConfig(draftConfig); toast.success("Configuration saved"); setShowConfig(false);
//             }
//           }}
//         >
//           <DialogHeader>
//             <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> Configuration (F12)</DialogTitle>
//             <DialogDescription>General Settings — Ctrl+A to save, Esc to close</DialogDescription>
//           </DialogHeader>
//           <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto">
//             <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Display</p>
//             {([
//               ["showHierarchy", "Show Hierarchy"],
//               ["allowAliases", "Allow Aliases Along With Names"],
//               ["allowAdvancedMasters", "Allow Advanced Group Creation"],
//             ] as const).map(([key, label]) => (
//               <div key={key} className="flex items-center justify-between">
//                 <Label className="text-sm">{label}</Label>
//                 <Switch checked={draftConfig[key]} onCheckedChange={(v) => setDraftConfig(prev => ({ ...prev, [key]: v }))} />
//               </div>
//             ))}
//             <div className="h-px bg-border my-1" />
//             <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Behavior</p>
//             {([
//               ["enableAutoInheritance", "Enable Auto Nature Inheritance"],
//               ["enableTallyShortcuts", "Enable Tally Shortcut Keys"],
//               ["enableSubLedger", "Enable Sub-Ledger"],
//               ["nettReporting", "Nett Debit/Credit Reporting"],
//             ] as const).map(([key, label]) => (
//               <div key={key} className="flex items-center justify-between">
//                 <Label className="text-sm">{label}</Label>
//                 <Switch checked={draftConfig[key]} onCheckedChange={(v) => setDraftConfig(prev => ({ ...prev, [key]: v }))} />
//               </div>
//             ))}
//           </div>
//           <div className="flex justify-end gap-2 pt-3 border-t border-border">
//             <Button variant="outline" size="sm" onClick={() => setShowConfig(false)}>Cancel (Esc)</Button>
//             <Button size="sm" onClick={() => { setConfig(draftConfig); toast.success("Configuration saved"); setShowConfig(false); }}>Save (Ctrl+A)</Button>
//           </div>
//         </DialogContent>
//       </Dialog>

//       {/* ── Advanced Group Dialogs ── */}
//       {config.allowAdvancedMasters && (
//         <>
//           <AdvancedGroupDialog
//             open={showAdvCreate}
//             onClose={() => setShowAdvCreate(false)}
//             onSaved={handleGroupsSaved}
//             financeId={financeId}
//           />
//         </>
//       )}

//       {/* ── Multi Group Selector (Alt+H) ── */}
//       <MultiGroupSelector
//         open={multiGroupSelectorOpen}
//         customGroups={groups.filter(g => g.isCustom)}
//         onClose={() => setMultiGroupSelectorOpen(false)}
//         onSelect={(choice) => {
//           setMultiGroupSelectorOpen(false);
//           setMultiGroupChoice(choice);
//         }}
//       />

//       {/* ── Multi Group Panel (create / alter) ── */}
//       <AnimatePresence>
//         {multiGroupChoice && (
//           <MultiGroupPanel
//             key={`${multiGroupChoice.mode}-${multiGroupChoice.presetGroup ?? ""}`}
//             mode={multiGroupChoice.mode}
//             presetGroup={multiGroupChoice.presetGroup}
//             customGroups={groups.filter(g => g.isCustom)}
//             onClose={() => setMultiGroupChoice(null)}
//             onSaved={fetchAndMerge}
//           />
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// // ─── TreeNode ─────────────────────────────────────────────────────────────────

// function TreeNode({
//   group, childMap, ledgersByGroup, onAddLedger, level, search, autoExpand,
// }: {
//   group: LedgerGroup;
//   childMap: Record<string, LedgerGroup[]>;
//   ledgersByGroup: Record<string, { name: string; group: string }[]>;
//   onAddLedger: (groupName: string) => void;
//   level: number;
//   search: string;
//   autoExpand?: boolean;
// }) {
//   const children = (childMap[group.name] || []).sort((a, b) => a.name.localeCompare(b.name));
//   const ledgers = ledgersByGroup[group.name] || [];
//   const q = search.toLowerCase().trim();
//   const visibleLedgers = q ? ledgers.filter(l => l.name.toLowerCase().includes(q) || group.name.toLowerCase().includes(q)) : ledgers;
//   const hasChildren = children.length > 0 || ledgers.length > 0;
//   const [open, setOpen] = useState(!!search || (autoExpand && level < 2));
//   const navigate = useNavigate();

//   useEffect(() => { if (search) setOpen(true); }, [search]);

//   const openLedgerView = () => {
//     try { sessionStorage.setItem("ledger:filterGroup", group.name); } catch { }
//     navigate("/accounts/ledger");
//   };

//   return (
//     <div style={{ marginLeft: level * 16 }}>
//       <ContextMenu>
//         <ContextMenuTrigger asChild>
//           <div className={`dashboard-card !p-0 overflow-hidden ${level > 0 ? "!rounded-lg" : ""}`}>
//             <div
//               className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors text-sm group/node"
//               onDoubleClick={openLedgerView}
//             >
//               <button onClick={() => hasChildren && setOpen(!open)} className="flex items-center gap-2 flex-1 text-left">
//                 {hasChildren ? (
//                   open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
//                 ) : (
//                   <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
//                 )}
//                 <span className={`font-medium text-foreground ${group.isCustom ? "text-primary/90" : ""}`}>{group.name}</span>
//                 {children.length > 0 && <Badge variant="secondary" className="text-[10px]">{children.length} sub</Badge>}
//                 {ledgers.length > 0 && <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">{ledgers.length} ledger{ledgers.length > 1 ? "s" : ""}</Badge>}
//                 {group.isCustom && <Badge variant="outline" className="text-[10px] border-primary/20 text-primary/60">custom</Badge>}
//               </button>
//               <div className="flex items-center gap-2">
//                 <button
//                   onClick={e => { e.stopPropagation(); onAddLedger(group.name); }}
//                   className="opacity-0 group-hover/node:opacity-100 transition-opacity text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
//                   title={`Create ledger under ${group.name}`}
//                 >
//                   <Plus className="h-3 w-3" /> Ledger
//                 </button>
//                 <Badge variant="outline" className={`text-[10px] ${NATURE_COLORS[group.nature] || ""}`}>{group.nature}</Badge>
//               </div>
//             </div>
//           </div>
//         </ContextMenuTrigger>
//         <ContextMenuContent className="w-56">
//           <ContextMenuItem onClick={() => hasChildren && setOpen(!open)}>
//             {open ? "Collapse" : "Expand"} Node
//           </ContextMenuItem>
//           <ContextMenuItem onClick={openLedgerView}>Open Group (Display)</ContextMenuItem>
//           <ContextMenuSeparator />
//           <ContextMenuItem onClick={() => onAddLedger(group.name)}>Create Ledger Here</ContextMenuItem>
//           <ContextMenuItem onClick={() => toast.info(`Alter "${group.name}" — use Create dialog`)}>Alter Group</ContextMenuItem>
//           <ContextMenuSeparator />
//           <ContextMenuItem onClick={() => { navigator.clipboard?.writeText(group.name); toast.success("Group name copied"); }}>Copy Name</ContextMenuItem>
//         </ContextMenuContent>
//       </ContextMenu>
//       <AnimatePresence>
//         {open && hasChildren && (
//           <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1 mt-1 overflow-hidden">
//             {children.map(c => (
//               <TreeNode key={c.id} group={c} childMap={childMap} ledgersByGroup={ledgersByGroup} onAddLedger={onAddLedger} level={level + 1} search={search} autoExpand={autoExpand} />
//             ))}
//             {visibleLedgers.length > 0 && (
//               <div style={{ marginLeft: 16 }} className="space-y-0.5 pl-1 border-l border-border/40 ml-2">
//                 {visibleLedgers.sort((a, b) => a.name.localeCompare(b.name)).map(l => (
//                   <Link
//                     key={l.name}
//                     to="/accounts/ledger"
//                     className="flex items-center justify-between px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
//                   >
//                     <span className="flex items-center gap-2">
//                       <FileText className="h-3 w-3 opacity-60" />
//                       {l.name}
//                     </span>
//                     <Badge variant="outline" className="text-[9px] opacity-60">Ledger</Badge>
//                   </Link>
//                 ))}
//               </div>
//             )}
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// // ─── SearchableParentSelect ───────────────────────────────────────────────────

// function SearchableParentSelect({
//   value, onChange, groups,
// }: {
//   value: string;
//   onChange: (v: string) => void;
//   groups: LedgerGroup[];
// }) {
//   const [open, setOpen] = useState(false);
//   const label = value === "__none__" ? "Primary (No parent)" : value;
//   const sorted = useMemo(() => [...groups].sort((a, b) => a.name.localeCompare(b.name)), [groups]);
//   return (
//     <Popover open={open} onOpenChange={setOpen}>
//       <PopoverTrigger asChild>
//         <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
//           <span className="truncate">{label}</span>
//           <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
//         </Button>
//       </PopoverTrigger>
//       <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
//         <Command>
//           <CommandInput placeholder="Search group..." autoFocus />
//           <CommandList>
//             <CommandEmpty>No group found.</CommandEmpty>
//             <CommandGroup>
//               <CommandItem value="Primary" onSelect={() => { onChange("__none__"); setOpen(false); }}>
//                 <Check className={`mr-2 h-4 w-4 ${value === "__none__" ? "opacity-100" : "opacity-0"}`} />
//                 Primary (No parent)
//               </CommandItem>
//               {sorted.map(g => (
//                 <CommandItem key={g.id} value={g.name} onSelect={() => { onChange(g.name); setOpen(false); }}>
//                   <Check className={`mr-2 h-4 w-4 ${value === g.name ? "opacity-100" : "opacity-0"}`} />
//                   <span className="flex-1">{g.name}</span>
//                   <Badge variant="outline" className="text-[9px] ml-2 opacity-60">{g.nature}</Badge>
//                 </CommandItem>
//               ))}
//             </CommandGroup>
//           </CommandList>
//         </Command>
//       </PopoverContent>
//     </Popover>
//   );
// }

//===========================================================================

// import { useState, useEffect, useCallback, useMemo } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import { motion, AnimatePresence } from "framer-motion";
// import { MultiGroupSelector, type MultiGroupChoice } from "@/components/multiCreation/MultiGroupSelector";
// import { MultiGroupPanel } from "@/components/multiCreation/MultiGroupPanel";
// import {
//   Plus, ChevronDown, ChevronRight, Settings, FolderTree,
//   Layers, Search, FileText, Building2, Calendar, RefreshCw, Loader2,
// } from "lucide-react";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Switch } from "@/components/ui/switch";
// import { Label } from "@/components/ui/label";
// import { Badge } from "@/components/ui/badge";
// import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
// import { Skeleton } from "@/components/ui/skeleton";
// import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
// import { Check } from "lucide-react";
// import { toast } from "sonner";
// import { AdvancedGroupDialog } from "@/components/accounts/AdvancedGroupDialog";
// import { getAccLedgerGroups, UnderDropdownItem, getUnderDropdown } from "@/api/accounting";
// import { useAuth } from "@/contexts/AuthContext";

// // ─── Types ────────────────────────────────────────────────────────────────────

// type Nature = "Assets" | "Liabilities" | "Income" | "Expense";

// interface LedgerGroup {
//   id: number;
//   dbId?: number;
//   name: string;
//   alias?: string;
//   parent: string | null;
//   nature: Nature;
//   isCustom?: boolean;
// }

// // ─── SEED_GROUPS ──────────────────────────────────────────────────────────────
// // Exact Tally-style Chart of Accounts hierarchy.
// // Shown instantly on page load. DB custom groups are merged on top.

// // const SEED_GROUPS: LedgerGroup[] = (() => {
// //   let id = 0;
// //   const mk = (name: string, parent: string | null, nature: Nature): LedgerGroup =>
// //     ({ id: ++id, name, parent, nature, isCustom: false });
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

// const SEED_GROUPS: LedgerGroup[] = (() => {
//   let id = 0;
//   const mk = (name: string, parent: string | null, nature: Nature): LedgerGroup =>
//     ({ id: ++id, name, parent, nature, isCustom: false });
//   return [
//     // ── Primary Groups (Liabilities) ──
//     mk("Capital Account", null, "Liabilities"),
//     mk("Reserves & Surplus", "Capital Account", "Liabilities"),
//     mk("Loans (Liability)", null, "Liabilities"),
//     mk("Secured Loans", "Loans (Liability)", "Liabilities"),
//     mk("Unsecured Loans", "Loans (Liability)", "Liabilities"),
//     mk("Bank OD A/c", "Loans (Liability)", "Liabilities"),
//     mk("Current Liabilities", null, "Liabilities"),
//     mk("Sundry Creditors", "Current Liabilities", "Liabilities"),
//     mk("Duties & Taxes", "Current Liabilities", "Liabilities"),
//     mk("Provisions", "Current Liabilities", "Liabilities"),
//     mk("Branch / Divisions", null, "Liabilities"),

//     // ── Primary Groups (Assets) ──
//     mk("Fixed Assets", null, "Assets"),
//     mk("Investments", null, "Assets"),
//     mk("Current Assets", null, "Assets"),
//     mk("Sundry Debtors", "Current Assets", "Assets"),
//     mk("Cash-in-hand", "Current Assets", "Assets"),
//     mk("Bank Accounts", "Current Assets", "Assets"),
//     mk("Stock-in-hand", "Current Assets", "Assets"),
//     mk("Deposits (Asset)", "Current Assets", "Assets"),
//     mk("Loans & Advances (Asset)", "Current Assets", "Assets"),
//     mk("Misc. Expenses (Asset)", null, "Assets"),
//     mk("Suspense A/c", null, "Assets"),

//     // ── Primary Groups (Income) ──
//     mk("Sales Accounts", null, "Income"),
//     mk("Direct Incomes", null, "Income"),
//     mk("Indirect Incomes", null, "Income"),

//     // ── Primary Groups (Expenses) ──
//     mk("Purchase Accounts", null, "Expense"),
//     mk("Direct Expenses", null, "Expense"),
//     mk("Indirect Expenses", null, "Expense"),
//   ];
// })();



// const NATURE_COLORS: Record<Nature, string> = {
//   Assets: "border-primary/40 text-primary",
//   Liabilities: "border-red-400/40 text-red-600 dark:text-red-400",
//   Income: "border-green-400/40 text-green-600 dark:text-green-400",
//   Expense: "border-amber-400/40 text-amber-600 dark:text-amber-400",
// };

// // ─── Merge DB custom groups into the seed tree ────────────────────────────────

// function mergeCustomGroups(
//   customGroups: { id: number; group_name: string; nature: string; system_parent_id: number | null; custom_parent_id: number | null; alias?: string | null }[],
//   underItems: UnderDropdownItem[],
// ): LedgerGroup[] {
//   const seedNames = new Set(SEED_GROUPS.map(g => g.name.toLowerCase()));
//   // Build id→name for resolving parent names
//   const idToName = new Map<number, string>();
//   underItems.forEach(item => idToName.set(item.id, item.group_name));

//   const extras: LedgerGroup[] = [];
//   let tempId = 10_000;
//   customGroups.forEach(g => {
//     if (seedNames.has(g.group_name.toLowerCase())) return; // already covered by seed
//     const parentName = g.system_parent_id != null
//       ? idToName.get(g.system_parent_id) ?? null
//       : g.custom_parent_id != null
//         ? idToName.get(g.custom_parent_id) ?? null
//         : null;
//     extras.push({
//       id: tempId++,
//       dbId: g.id,
//       name: g.group_name,
//       alias: g.alias || "",
//       parent: parentName,
//       nature: (g.nature === "Expenses" ? "Expense" : g.nature) as Nature,
//       isCustom: true,
//     });
//   });

//   return [...SEED_GROUPS, ...extras];
// }

// // ─── Config state ─────────────────────────────────────────────────────────────

// interface ConfigState {
//   showHierarchy: boolean;
//   enableSubLedger: boolean;
//   nettReporting: boolean;
//   enableAutoInheritance: boolean;
//   allowAliases: boolean;
//   enableTallyShortcuts: boolean;
//   allowAdvancedMasters: boolean;
// }

// const DEFAULT_CONFIG: ConfigState = {
//   showHierarchy: true,
//   enableSubLedger: false,
//   nettReporting: false,
//   enableAutoInheritance: true,
//   allowAliases: false,
//   enableTallyShortcuts: true,
//   allowAdvancedMasters: true,
// };

// // ─── Main Component ───────────────────────────────────────────────────────────

// export default function LedgerGroups() {
//   const { currentFinance } = useAuth();
//   const financeId = currentFinance?.id ?? 0;

//   // groups starts with SEED_GROUPS → tree is visible immediately
//   const [groups, setGroups] = useState<LedgerGroup[]>(SEED_GROUPS);
//   const [dbFetching, setDbFetching] = useState(false);
//   const [showCreate, setShowCreate] = useState(false);
//   const [showAdvCreate, setShowAdvCreate] = useState(false);
//   const [showConfig, setShowConfig] = useState(false);
//   // ── Multi Group (Alt+H) ──
//   const [multiGroupSelectorOpen, setMultiGroupSelectorOpen] = useState(false);
//   const [multiGroupChoice, setMultiGroupChoice] = useState<MultiGroupChoice | null>(null);
//   const [search, setSearch] = useState("");
//   const [category, setCategory] = useState<"ALL" | "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS">("ALL");
//   const [company, setCompany] = useState(currentFinance?.name ?? "Main Finance Co.");
//   const [period, setPeriod] = useState("FY 2025-26");
//   const [skelLoading, setSkelLoading] = useState(false);

//   // Skeleton flash on category/company/period switch — Tally Prime style
//   useEffect(() => {
//     setSkelLoading(true);
//     const t = setTimeout(() => setSkelLoading(false), 280);
//     return () => clearTimeout(t);
//   }, [category, company, period]);

//   // Quick-create form
//   const [formName, setFormName] = useState("");
//   const [formAlias, setFormAlias] = useState("");
//   const [formParent, setFormParent] = useState<string>("__none__");
//   const [formNature, setFormNature] = useState<Nature>("Assets");
//   const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
//   const [draftConfig, setDraftConfig] = useState<ConfigState>(DEFAULT_CONFIG);
//   useEffect(() => { if (showConfig) setDraftConfig(config); }, [showConfig, config]);

//   const navigate = useNavigate();

//   // Auto-inherit nature from selected parent in Quick Create
//   useEffect(() => {
//     if (!config.enableAutoInheritance || formParent === "__none__") return;
//     const p = groups.find(g => g.name === formParent);
//     if (p) setFormNature(p.nature);
//   }, [formParent, groups, config.enableAutoInheritance]);

//   const isQuickPrimary = formParent === "__none__";

//   // ─── Fetch DB custom groups and merge with SEED_GROUPS ──────────────────────
//   const fetchAndMerge = useCallback(async () => {
//     if (!financeId) return;
//     setDbFetching(true);
//     try {
//       const [groupsRes, underRes] = await Promise.all([
//         getAccLedgerGroups(),
//         getUnderDropdown(),
//       ]);
//       if (groupsRes.data.success && underRes.data.success) {
//         const customGroups = (groupsRes.data.data as any).customGroups || (Array.isArray(groupsRes.data.data) ? groupsRes.data.data : []);
//         setGroups(mergeCustomGroups(customGroups, underRes.data.data));
//       }
//     } catch (err: any) {
//       toast.error(err?.response?.data?.message || "Failed to sync groups from server");
//     } finally {
//       setDbFetching(false);
//     }
//   }, [financeId]);

//   useEffect(() => { fetchAndMerge(); }, [fetchAndMerge]);

//   // ─── Keyboard shortcuts — Tally Prime style ─────────────────────────────────
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => {
//       const tag = (e.target as HTMLElement)?.tagName;
//       const inField = tag === "INPUT" || tag === "TEXTAREA";
//       if (e.ctrlKey && e.key.toLowerCase() === "g") { e.preventDefault(); setShowAdvCreate(true); return; }
//       if (e.altKey && e.key.toLowerCase() === "c") { e.preventDefault(); setShowCreate(true); return; }
//       // Alt+H → Multi Group Operations (same as Ledger page)
//       if (e.altKey && e.key.toLowerCase() === "h") {
//         // Don't open if the Multi Group panel itself is active
//         if (multiGroupChoice) return;
//         e.preventDefault();
//         setMultiGroupSelectorOpen(true);
//         return;
//       }
//       if (e.key === "F12") { e.preventDefault(); setShowConfig(true); return; }
//       if (!config.enableTallyShortcuts || inField || e.altKey) return;
//       if (e.ctrlKey && !e.shiftKey) {
//         const map: Record<string, { path?: string; msg: string }> = {
//           l: { path: "/accounts/ledger", msg: "Create Ledger" },
//           v: { path: "/accounts/vouchers", msg: "Create Voucher Type" },
//         };
//         const m = map[e.key.toLowerCase()];
//         if (m) { e.preventDefault(); if (m.path) navigate(m.path); else toast.info(m.msg); }
//       }
//     };
//     window.addEventListener("keydown", handler);
//     return () => window.removeEventListener("keydown", handler);
//   }, [navigate, config.enableTallyShortcuts, multiGroupChoice]);

//   // ─── AdvancedGroupDialog callback ─────────────────────────────────────────
//   const handleGroupsSaved = useCallback((newGroups: { id: number; name: string; nature: string; parentName: string }[]) => {
//     setGroups(prev => {
//       const existingNames = new Set(prev.map(g => g.name.toLowerCase()));
//       const toAdd = newGroups
//         .filter(g => !existingNames.has(g.name.toLowerCase()))
//         .map((g, i) => ({
//           id: Date.now() + i,
//           name: g.name,
//           parent: g.parentName === "__none__" ? null : g.parentName,
//           nature: (g.nature === "Expenses" ? "Expense" : g.nature) as Nature,
//           isCustom: true,
//         }));
//       return [...prev, ...toAdd];
//     });
//   }, []);

//   // ─── Quick create (local state only — no API call since dialog sends the correct parent) ─
//   const handleCreate = useCallback(() => {
//     const name = formName.trim();
//     if (!name) { toast.error("Group name is required"); return; }
//     if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) { toast.error(`"${name}" already exists`); return; }
//     if (formParent !== "__none__" && formParent.toLowerCase() === name.toLowerCase()) { toast.error("Parent cannot reference itself"); return; }
//     setGroups(prev => [...prev, {
//       id: Date.now(),
//       name,
//       parent: formParent === "__none__" ? null : formParent,
//       nature: formNature,
//       isCustom: true,
//     }]);
//     toast.success(`Group "${name}" created`);
//     setFormName(""); setFormAlias("");
//     setFormParent("__none__");
//     setShowCreate(false);
//   }, [formName, formParent, formNature, groups]);

//   // ─── Ledger leaves (fetched from backend) ────────────────────────────────────
//   const [ledgersByGroup, setLedgersByGroup] = useState<Record<string, { name: string; group: string }[]>>({});

//   useEffect(() => {
//     if (!financeId) return;
//     import("@/api/accounting").then(({ getLedgers }) => {
//       getLedgers(financeId)
//         .then((res: any) => {
//           if (res?.data?.success) {
//             const map: Record<string, { name: string; group: string }[]> = {};
//             (res.data.data as { ledger_name: string; group_name: string }[]).forEach(l => {
//               const grp = l.group_name;
//               if (!map[grp]) map[grp] = [];
//               map[grp].push({ name: l.ledger_name, group: grp });
//             });
//             setLedgersByGroup(map);
//           }
//         })
//         .catch(() => {/* silently ignore — tree still renders without leaf ledgers */ });
//     });
//   }, [financeId]);

//   // ─── Build tree ────────────────────────────────────────────────────────────
//   const tree = useMemo(() => {
//     const q = search.toLowerCase().trim();
//     const allRoots = groups.filter(g => !g.parent);
//     const PRIMARY = ["Assets", "Liabilities", "Income", "Expenses"];
//     const catFilter = (r: LedgerGroup) => {
//       switch (category) {
//         case "ASSETS": return r.name === "Assets";
//         case "LIABILITIES": return r.name === "Liabilities";
//         case "INCOME": return r.name === "Income";
//         case "EXPENSES": return r.name === "Expenses";
//         case "OTHERS": return !PRIMARY.includes(r.name);
//         default: return true;
//       }
//     };
//     const roots = allRoots.filter(catFilter);
//     const childMap: Record<string, LedgerGroup[]> = {};
//     groups.filter(g => g.parent).forEach(g => {
//       if (!childMap[g.parent!]) childMap[g.parent!] = [];
//       childMap[g.parent!].push(g);
//     });
//     const matches = (name: string): boolean => {
//       if (!q) return true;
//       if (name.toLowerCase().includes(q)) return true;
//       if ((ledgersByGroup[name] || []).some(l => l.name.toLowerCase().includes(q))) return true;
//       return (childMap[name] || []).some(c => matches(c.name));
//     };
//     return { roots: roots.filter(r => matches(r.name)), childMap };
//   }, [groups, search, ledgersByGroup, category]);

//   // Nature summary counts
//   const natureCounts = useMemo(() => {
//     const map: Record<string, number> = { Assets: 0, Liabilities: 0, Income: 0, Expense: 0 };
//     groups.forEach(g => { map[g.nature] = (map[g.nature] || 0) + 1; });
//     return map;
//   }, [groups]);

//   const customCount = useMemo(() => groups.filter(g => g.isCustom).length, [groups]);

//   const createLedgerInGroup = useCallback((groupName: string) => {
//     try { sessionStorage.setItem("ledger:presetGroup", groupName); } catch { }
//     navigate("/accounts/ledger");
//   }, [navigate]);

//   return (
//     <div className="space-y-4">
//       {/* ── Header ── */}
//       <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
//         <div>
//           <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
//             <FolderTree className="h-6 w-6 text-primary" /> Ledger Groups
//           </h1>
//           <p className="text-sm text-muted-foreground">
//             Hierarchical group management —
//             <span className="text-primary font-medium"> {groups.length} groups</span>
//             {customCount > 0 && <span className="text-muted-foreground"> ({customCount} custom)</span>}
//           </p>
//         </div>
//         <div className="flex gap-2 flex-wrap">
//           {config.allowAdvancedMasters && (
//             <Button onClick={() => setShowAdvCreate(true)} size="sm" className="gap-1">
//               <Plus className="h-3.5 w-3.5" /> Create Group (Ctrl+G)
//             </Button>
//           )}
//           <Button onClick={() => setShowCreate(true)} size="sm" variant="outline" className="gap-1">
//             <Plus className="h-3.5 w-3.5" /> Quick (Alt+C)
//           </Button>
//           <Button variant="outline" size="sm" onClick={fetchAndMerge} disabled={dbFetching} title="Refresh from server">
//             {dbFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
//           </Button>
//           <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
//             <Settings className="h-3.5 w-3.5 mr-1" /> F12
//           </Button>
//         </div>
//       </motion.div>

//       {/* ── Shortcuts ── */}
//       <div className="flex gap-1.5 text-[10px] flex-wrap">
//         {[["Ctrl+G", "Group"], ["Ctrl+Alt+G", "Multi"], ["Alt+C", "Quick"], ["Alt+H", "Multi Group"], ["F12", "Config"]].map(([k, v]) => (
//           <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary text-muted-foreground">
//             <kbd className="font-mono font-semibold text-foreground">{k}</kbd> {v}
//           </span>
//         ))}
//         {dbFetching && (
//           <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-[10px]">
//             <Loader2 className="h-2.5 w-2.5 animate-spin" /> Syncing…
//           </span>
//         )}
//       </div>

//       {/* ── Company + Period ── */}
//       <div className="flex flex-wrap items-center gap-2">
//         <div className="flex items-center gap-1.5">
//           <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
//           <Select value={company} onValueChange={setCompany}>
//             <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue /></SelectTrigger>
//             <SelectContent>
//               {[currentFinance?.name ?? "Main Finance Co.", "Branch – Coimbatore", "Branch – Madurai"].filter(Boolean).map(c => (
//                 <SelectItem key={c} value={c!}>{c}</SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         </div>
//         <div className="flex items-center gap-1.5">
//           <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
//           <Select value={period} onValueChange={setPeriod}>
//             <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
//             <SelectContent>
//               {["FY 2025-26", "FY 2024-25", "Q1 2025-26", "Q2 2025-26"].map(p => (
//                 <SelectItem key={p} value={p}>{p}</SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         </div>
//       </div>

//       {/* ── Category tabs ── */}
//       <div className="flex gap-1 flex-wrap border-b border-border">
//         {(["ALL", "ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "OTHERS"] as const).map(c => (
//           <button
//             key={c}
//             onClick={() => setCategory(c)}
//             className={`relative px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${category === c ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
//           >
//             {c}
//             {category === c && (
//               <motion.div layoutId="cat-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
//             )}
//           </button>
//         ))}
//       </div>

//       {/* ── Search ── */}
//       <div className="relative max-w-sm">
//         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//         <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups or ledgers…" className="pl-9" />
//       </div>

//       {/* ── Nature summary ── */}
//       <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
//         {(["Assets", "Liabilities", "Income", "Expense"] as Nature[]).map(n => (
//           <motion.div key={n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card !p-4 text-center">
//             <p className="text-xs text-muted-foreground uppercase tracking-wider">{n}</p>
//             <p className="text-2xl font-bold text-foreground mt-1">{natureCounts[n] ?? 0}</p>
//           </motion.div>
//         ))}
//       </div>

//       {/* ── Tree ── */}
//       <AnimatePresence mode="wait">
//         {skelLoading ? (
//           <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
//             {[0, 1, 2, 3, 4].map(i => (
//               <div key={i} className="dashboard-card !p-3 flex items-center gap-3" style={{ marginLeft: (i % 3) * 16 }}>
//                 <Skeleton className="h-4 w-4 rounded" />
//                 <Skeleton className="h-4 flex-1 max-w-[40%]" />
//                 <Skeleton className="h-4 w-16" />
//               </div>
//             ))}
//           </motion.div>
//         ) : (
//           <motion.div key={`tree-${category}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-2">
//             {tree.roots.length === 0 && (
//               <div className="text-center text-sm text-muted-foreground py-12">No groups found in this category.</div>
//             )}
//             {tree.roots.sort((a, b) => a.name.localeCompare(b.name)).map(root => (
//               <TreeNode
//                 key={`${category}-${root.id}`}
//                 group={root}
//                 childMap={tree.childMap}
//                 ledgersByGroup={ledgersByGroup}
//                 onAddLedger={createLedgerInGroup}
//                 level={0}
//                 search={search}
//                 autoExpand={category !== "ALL"}
//               />
//             ))}
//           </motion.div>
//         )}
//       </AnimatePresence>

//       {/* ── Quick Create Dialog ── */}
//       <Dialog open={showCreate} onOpenChange={setShowCreate}>
//         <DialogContent className="max-w-md">
//           <DialogHeader>
//             <DialogTitle>Quick Create Ledger Group</DialogTitle>
//             <DialogDescription>Add a new group to the local hierarchy</DialogDescription>
//           </DialogHeader>
//           <div className="space-y-4 pt-2">
//             <div className="space-y-1.5">
//               <Label className="text-xs uppercase tracking-wider text-muted-foreground">Group Name</Label>
//               <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Bank OD Accounts" autoFocus onKeyDown={e => e.key === "Enter" && handleCreate()} />
//             </div>
//             {config.allowAliases && (
//               <div className="space-y-1.5">
//                 <Label className="text-xs uppercase tracking-wider text-muted-foreground">Alias</Label>
//                 <Input value={formAlias} onChange={e => setFormAlias(e.target.value)} placeholder="Short name" />
//               </div>
//             )}
//             <div className="space-y-1.5">
//               <Label className="text-xs uppercase tracking-wider text-muted-foreground">Under (Parent Group)</Label>
//               <SearchableParentSelect value={formParent} onChange={setFormParent} groups={groups} />
//             </div>
//             {(isQuickPrimary || !config.enableAutoInheritance) && (
//               <div className="space-y-1.5">
//                 <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nature</Label>
//                 <Select value={formNature} onValueChange={(v) => setFormNature(v as Nature)}>
//                   <SelectTrigger><SelectValue /></SelectTrigger>
//                   <SelectContent>
//                     {(["Assets", "Liabilities", "Income", "Expense"] as Nature[]).map(n => (
//                       <SelectItem key={n} value={n}>{n}</SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//               </div>
//             )}
//             <Button onClick={handleCreate} className="w-full">Create Group</Button>
//           </div>
//         </DialogContent>
//       </Dialog>

//       {/* ── Config Dialog (F12) ── */}
//       <Dialog open={showConfig} onOpenChange={setShowConfig}>
//         <DialogContent
//           className="max-w-md"
//           onKeyDown={(e) => {
//             if (e.ctrlKey && e.key.toLowerCase() === "a") {
//               e.preventDefault(); setConfig(draftConfig); toast.success("Configuration saved"); setShowConfig(false);
//             }
//           }}
//         >
//           <DialogHeader>
//             <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> Configuration (F12)</DialogTitle>
//             <DialogDescription>General Settings — Ctrl+A to save, Esc to close</DialogDescription>
//           </DialogHeader>
//           <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto">
//             <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Display</p>
//             {([
//               ["showHierarchy", "Show Hierarchy"],
//               ["allowAliases", "Allow Aliases Along With Names"],
//               ["allowAdvancedMasters", "Allow Advanced Group Creation"],
//             ] as const).map(([key, label]) => (
//               <div key={key} className="flex items-center justify-between">
//                 <Label className="text-sm">{label}</Label>
//                 <Switch checked={draftConfig[key]} onCheckedChange={(v) => setDraftConfig(prev => ({ ...prev, [key]: v }))} />
//               </div>
//             ))}
//             <div className="h-px bg-border my-1" />
//             <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Behavior</p>
//             {([
//               ["enableAutoInheritance", "Enable Auto Nature Inheritance"],
//               ["enableTallyShortcuts", "Enable Tally Shortcut Keys"],
//               ["enableSubLedger", "Enable Sub-Ledger"],
//               ["nettReporting", "Nett Debit/Credit Reporting"],
//             ] as const).map(([key, label]) => (
//               <div key={key} className="flex items-center justify-between">
//                 <Label className="text-sm">{label}</Label>
//                 <Switch checked={draftConfig[key]} onCheckedChange={(v) => setDraftConfig(prev => ({ ...prev, [key]: v }))} />
//               </div>
//             ))}
//           </div>
//           <div className="flex justify-end gap-2 pt-3 border-t border-border">
//             <Button variant="outline" size="sm" onClick={() => setShowConfig(false)}>Cancel (Esc)</Button>
//             <Button size="sm" onClick={() => { setConfig(draftConfig); toast.success("Configuration saved"); setShowConfig(false); }}>Save (Ctrl+A)</Button>
//           </div>
//         </DialogContent>
//       </Dialog>

//       {/* ── Advanced Group Dialogs ── */}
//       {config.allowAdvancedMasters && (
//         <>
//           <AdvancedGroupDialog
//             open={showAdvCreate}
//             onClose={() => setShowAdvCreate(false)}
//             onSaved={handleGroupsSaved}
//             financeId={financeId}
//           />
//         </>
//       )}

//       {/* ── Multi Group Selector (Alt+H) ── */}
//       <MultiGroupSelector
//         open={multiGroupSelectorOpen}
//         customGroups={groups.filter(g => g.isCustom)}
//         onClose={() => setMultiGroupSelectorOpen(false)}
//         onSelect={(choice) => {
//           setMultiGroupSelectorOpen(false);
//           setMultiGroupChoice(choice);
//         }}
//       />

//       {/* ── Multi Group Panel (create / alter) ── */}
//       <AnimatePresence>
//         {multiGroupChoice && (
//           <MultiGroupPanel
//             key={`${multiGroupChoice.mode}-${multiGroupChoice.presetGroup ?? ""}`}
//             mode={multiGroupChoice.mode}
//             presetGroup={multiGroupChoice.presetGroup}
//             customGroups={groups.filter(g => g.isCustom)}
//             onClose={() => setMultiGroupChoice(null)}
//             onSaved={fetchAndMerge}
//           />
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// // ─── TreeNode ─────────────────────────────────────────────────────────────────

// function TreeNode({
//   group, childMap, ledgersByGroup, onAddLedger, level, search, autoExpand,
// }: {
//   group: LedgerGroup;
//   childMap: Record<string, LedgerGroup[]>;
//   ledgersByGroup: Record<string, { name: string; group: string }[]>;
//   onAddLedger: (groupName: string) => void;
//   level: number;
//   search: string;
//   autoExpand?: boolean;
// }) {
//   const children = (childMap[group.name] || []).sort((a, b) => a.name.localeCompare(b.name));
//   const ledgers = ledgersByGroup[group.name] || [];
//   const q = search.toLowerCase().trim();
//   const visibleLedgers = q ? ledgers.filter(l => l.name.toLowerCase().includes(q) || group.name.toLowerCase().includes(q)) : ledgers;
//   const hasChildren = children.length > 0 || ledgers.length > 0;
//   const [open, setOpen] = useState(!!search || (autoExpand && level < 2));
//   const navigate = useNavigate();

//   useEffect(() => { if (search) setOpen(true); }, [search]);

//   const openLedgerView = () => {
//     try { sessionStorage.setItem("ledger:filterGroup", group.name); } catch { }
//     navigate("/accounts/ledger");
//   };

//   return (
//     <div style={{ marginLeft: level * 16 }}>
//       <ContextMenu>
//         <ContextMenuTrigger asChild>
//           <div className={`dashboard-card !p-0 overflow-hidden ${level > 0 ? "!rounded-lg" : ""}`}>
//             <div
//               className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors text-sm group/node"
//               onDoubleClick={openLedgerView}
//             >
//               <button onClick={() => hasChildren && setOpen(!open)} className="flex items-center gap-2 flex-1 text-left">
//                 {hasChildren ? (
//                   open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
//                 ) : (
//                   <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
//                 )}
//                 <span className={`font-medium text-foreground ${group.isCustom ? "text-primary/90" : ""}`}>{group.name}</span>
//                 {children.length > 0 && <Badge variant="secondary" className="text-[10px]">{children.length} sub</Badge>}
//                 {ledgers.length > 0 && <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">{ledgers.length} ledger{ledgers.length > 1 ? "s" : ""}</Badge>}
//                 {group.isCustom && <Badge variant="outline" className="text-[10px] border-primary/20 text-primary/60">custom</Badge>}
//               </button>
//               <div className="flex items-center gap-2">
//                 <button
//                   onClick={e => { e.stopPropagation(); onAddLedger(group.name); }}
//                   className="opacity-0 group-hover/node:opacity-100 transition-opacity text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
//                   title={`Create ledger under ${group.name}`}
//                 >
//                   <Plus className="h-3 w-3" /> Ledger
//                 </button>
//                 <Badge variant="outline" className={`text-[10px] ${NATURE_COLORS[group.nature] || ""}`}>{group.nature}</Badge>
//               </div>
//             </div>
//           </div>
//         </ContextMenuTrigger>
//         <ContextMenuContent className="w-56">
//           <ContextMenuItem onClick={() => hasChildren && setOpen(!open)}>
//             {open ? "Collapse" : "Expand"} Node
//           </ContextMenuItem>
//           <ContextMenuItem onClick={openLedgerView}>Open Group (Display)</ContextMenuItem>
//           <ContextMenuSeparator />
//           <ContextMenuItem onClick={() => onAddLedger(group.name)}>Create Ledger Here</ContextMenuItem>
//           <ContextMenuItem onClick={() => toast.info(`Alter "${group.name}" — use Create dialog`)}>Alter Group</ContextMenuItem>
//           <ContextMenuSeparator />
//           <ContextMenuItem onClick={() => { navigator.clipboard?.writeText(group.name); toast.success("Group name copied"); }}>Copy Name</ContextMenuItem>
//         </ContextMenuContent>
//       </ContextMenu>
//       <AnimatePresence>
//         {open && hasChildren && (
//           <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1 mt-1 overflow-hidden">
//             {children.map(c => (
//               <TreeNode key={c.id} group={c} childMap={childMap} ledgersByGroup={ledgersByGroup} onAddLedger={onAddLedger} level={level + 1} search={search} autoExpand={autoExpand} />
//             ))}
//             {visibleLedgers.length > 0 && (
//               <div style={{ marginLeft: 16 }} className="space-y-0.5 pl-1 border-l border-border/40 ml-2">
//                 {visibleLedgers.sort((a, b) => a.name.localeCompare(b.name)).map(l => (
//                   <Link
//                     key={l.name}
//                     to="/accounts/ledger"
//                     className="flex items-center justify-between px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
//                   >
//                     <span className="flex items-center gap-2">
//                       <FileText className="h-3 w-3 opacity-60" />
//                       {l.name}
//                     </span>
//                     <Badge variant="outline" className="text-[9px] opacity-60">Ledger</Badge>
//                   </Link>
//                 ))}
//               </div>
//             )}
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// // ─── SearchableParentSelect ───────────────────────────────────────────────────

// function SearchableParentSelect({
//   value, onChange, groups,
// }: {
//   value: string;
//   onChange: (v: string) => void;
//   groups: LedgerGroup[];
// }) {
//   const [open, setOpen] = useState(false);
//   const label = value === "__none__" ? "Primary (No parent)" : value;
//   const sorted = useMemo(() => [...groups].sort((a, b) => a.name.localeCompare(b.name)), [groups]);
//   return (
//     <Popover open={open} onOpenChange={setOpen}>
//       <PopoverTrigger asChild>
//         <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
//           <span className="truncate">{label}</span>
//           <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
//         </Button>
//       </PopoverTrigger>
//       <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
//         <Command>
//           <CommandInput placeholder="Search group..." autoFocus />
//           <CommandList>
//             <CommandEmpty>No group found.</CommandEmpty>
//             <CommandGroup>
//               <CommandItem value="Primary" onSelect={() => { onChange("__none__"); setOpen(false); }}>
//                 <Check className={`mr-2 h-4 w-4 ${value === "__none__" ? "opacity-100" : "opacity-0"}`} />
//                 Primary (No parent)
//               </CommandItem>
//               {sorted.map(g => (
//                 <CommandItem key={g.id} value={g.name} onSelect={() => { onChange(g.name); setOpen(false); }}>
//                   <Check className={`mr-2 h-4 w-4 ${value === g.name ? "opacity-100" : "opacity-0"}`} />
//                   <span className="flex-1">{g.name}</span>
//                   <Badge variant="outline" className="text-[9px] ml-2 opacity-60">{g.nature}</Badge>
//                 </CommandItem>
//               ))}
//             </CommandGroup>
//           </CommandList>
//         </Command>
//       </PopoverContent>
//     </Popover>
//   );
// }

import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MultiGroupSelector, type MultiGroupChoice } from "@/components/multiCreation/MultiGroupSelector";
import { MultiGroupPanel } from "@/components/multiCreation/MultiGroupPanel";
import {
  Plus, ChevronDown, ChevronRight, Settings, FolderTree,
  Layers, Search, FileText, Building2, Calendar, RefreshCw, Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { AdvancedGroupDialog } from "@/components/accounts/AdvancedGroupDialog";
import { getAccLedgerGroups } from "@/api/accounting";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Nature = "Assets" | "Liabilities" | "Income" | "Expense";

interface LedgerGroup {
  id: number;
  dbId?: number;
  name: string;
  alias?: string;
  parent: string | null;
  nature: Nature;
  isCustom?: boolean;
}

// ─── SEED_GROUPS ──────────────────────────────────────────────────────────────
// Exact Tally-style Chart of Accounts hierarchy.
// Shown instantly on page load. DB custom groups are merged on top.

const SEED_GROUPS: LedgerGroup[] = (() => {
  let id = 0;
  const mk = (name: string, parent: string | null, nature: Nature): LedgerGroup =>
    ({ id: ++id, name, parent, nature, isCustom: false });
  return [
    // ── Primary Groups (Liabilities) ──
    mk("Capital Account", null, "Liabilities"),
    mk("Reserves & Surplus", "Capital Account", "Liabilities"),
    mk("Loans (Liability)", null, "Liabilities"),
    mk("Secured Loans", "Loans (Liability)", "Liabilities"),
    mk("Unsecured Loans", "Loans (Liability)", "Liabilities"),
    mk("Bank OD A/c", "Loans (Liability)", "Liabilities"),
    mk("Current Liabilities", null, "Liabilities"),
    mk("Sundry Creditors", "Current Liabilities", "Liabilities"),
    mk("Duties & Taxes", "Current Liabilities", "Liabilities"),
    mk("Provisions", "Current Liabilities", "Liabilities"),
    mk("Branch / Divisions", null, "Liabilities"),

    // ── Primary Groups (Assets) ──
    mk("Fixed Assets", null, "Assets"),
    mk("Investments", null, "Assets"),
    mk("Current Assets", null, "Assets"),
    mk("Sundry Debtors", "Current Assets", "Assets"),
    mk("Cash-in-hand", "Current Assets", "Assets"),
    mk("Bank Accounts", "Current Assets", "Assets"),
    mk("Stock-in-hand", "Current Assets", "Assets"),
    mk("Deposits (Asset)", "Current Assets", "Assets"),
    mk("Loans & Advances (Asset)", "Current Assets", "Assets"),
    mk("Misc. Expenses (Asset)", null, "Assets"),
    mk("Suspense A/c", null, "Assets"),

    // ── Primary Groups (Income) ──
    mk("Sales Accounts", null, "Income"),
    mk("Direct Incomes", null, "Income"),
    mk("Indirect Incomes", null, "Income"),

    // ── Primary Groups (Expenses) ──
    mk("Purchase Accounts", null, "Expense"),
    mk("Direct Expenses", null, "Expense"),
    mk("Indirect Expenses", null, "Expense"),
  ];
})();

const NATURE_COLORS: Record<Nature, string> = {
  Assets: "border-primary/40 text-primary",
  Liabilities: "border-red-400/40 text-red-600 dark:text-red-400",
  Income: "border-green-400/40 text-green-600 dark:text-green-400",
  Expense: "border-amber-400/40 text-amber-600 dark:text-amber-400",
};

// ─── Merge DB groups (system + custom) into the seed tree ────────────────────
//
// Strategy:
//  1. Build a unified id→name map from BOTH systemGroups and customGroups so
//     that resolving system_parent_id or custom_parent_id always finds a name.
//  2. System groups from the DB ARE the seed groups — we match them by name
//     (case-insensitive) to avoid duplicates while preserving the seed's
//     local `id` for the tree-key stability.
//  3. Custom groups are appended as `isCustom: true` entries. Their `parent`
//     field is resolved to the group name via the unified map.

function mergeCustomGroups(
  systemGroups: { id: number; group_name: string; nature: string; system_parent_id: number | null }[],
  customGroups: { id: number; group_name: string; nature: string; system_parent_id: number | null; custom_parent_id: number | null; alias?: string | null }[],
): LedgerGroup[] {
  // ── Step 1: build a unified id→name map covering both tables ──────────────
  //   System group ids come from acc_group_master; custom group ids from
  //   acc_ledger_groups. We key the map with a source-prefixed composite so
  //   there are no accidental collisions between the two id spaces.
  //   However, the parent fields already distinguish the table:
  //     system_parent_id  → acc_group_master
  //     custom_parent_id  → acc_ledger_groups
  //   So we keep two separate maps.
  const systemIdToName = new Map<number, string>();
  systemGroups.forEach(g => systemIdToName.set(g.id, g.group_name));

  const customIdToName = new Map<number, string>();
  customGroups.forEach(g => customIdToName.set(g.id, g.group_name));

  // ── Step 2: resolve parent name for a custom group ────────────────────────
  const resolveParent = (g: { system_parent_id: number | null; custom_parent_id: number | null }): string | null => {
    if (g.system_parent_id != null) return systemIdToName.get(g.system_parent_id) ?? null;
    if (g.custom_parent_id != null) return customIdToName.get(g.custom_parent_id) ?? null;
    return null;
  };

  // ── Step 3: seed names set for dedup check ────────────────────────────────
  const seedNames = new Set(SEED_GROUPS.map(g => g.name.toLowerCase()));

  // ── Step 4: append custom groups not already in the seed ──────────────────
  const extras: LedgerGroup[] = [];
  let tempId = 10_000;
  customGroups.forEach(g => {
    if (seedNames.has(g.group_name.toLowerCase())) return; // seed already covers it
    extras.push({
      id: tempId++,
      dbId: g.id,
      name: g.group_name,
      alias: g.alias ?? "",
      parent: resolveParent(g),
      nature: (g.nature === "Expenses" ? "Expense" : g.nature) as Nature,
      isCustom: true,
    });
  });

  return [...SEED_GROUPS, ...extras];
}

// ─── Config state ─────────────────────────────────────────────────────────────

interface ConfigState {
  showHierarchy: boolean;
  enableSubLedger: boolean;
  nettReporting: boolean;
  enableAutoInheritance: boolean;
  allowAliases: boolean;
  enableTallyShortcuts: boolean;
  allowAdvancedMasters: boolean;
}

const DEFAULT_CONFIG: ConfigState = {
  showHierarchy: true,
  enableSubLedger: false,
  nettReporting: false,
  enableAutoInheritance: true,
  allowAliases: false,
  enableTallyShortcuts: true,
  allowAdvancedMasters: true,
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LedgerGroups() {
  const { currentFinance } = useAuth();
  const financeId = currentFinance?.id ?? 0;

  // groups starts with SEED_GROUPS → tree is visible immediately
  const [groups, setGroups] = useState<LedgerGroup[]>(SEED_GROUPS);
  const [dbFetching, setDbFetching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdvCreate, setShowAdvCreate] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  // ── Multi Group (Alt+H) ──
  const [multiGroupSelectorOpen, setMultiGroupSelectorOpen] = useState(false);
  const [multiGroupChoice, setMultiGroupChoice] = useState<MultiGroupChoice | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"ALL" | "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "OTHERS">("ALL");
  const [company, setCompany] = useState(currentFinance?.name ?? "Main Finance Co.");
  const [period, setPeriod] = useState("FY 2025-26");
  const [skelLoading, setSkelLoading] = useState(false);

  // Skeleton flash on category/company/period switch — Tally Prime style
  useEffect(() => {
    setSkelLoading(true);
    const t = setTimeout(() => setSkelLoading(false), 280);
    return () => clearTimeout(t);
  }, [category, company, period]);

  // Quick-create form
  const [formName, setFormName] = useState("");
  const [formAlias, setFormAlias] = useState("");
  const [formParent, setFormParent] = useState<string>("__none__");
  const [formNature, setFormNature] = useState<Nature>("Assets");
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [draftConfig, setDraftConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  useEffect(() => { if (showConfig) setDraftConfig(config); }, [showConfig, config]);

  const navigate = useNavigate();

  // Auto-inherit nature from selected parent in Quick Create
  useEffect(() => {
    if (!config.enableAutoInheritance || formParent === "__none__") return;
    const p = groups.find(g => g.name === formParent);
    if (p) setFormNature(p.nature);
  }, [formParent, groups, config.enableAutoInheritance]);

  const isQuickPrimary = formParent === "__none__";

  // ─── Fetch DB groups and merge with SEED_GROUPS ─────────────────────────────
  //
  // getAccLedgerGroups() → GET /ledger-groups/list
  // Backend (group.service.getGroups) returns:
  //   { success: true, data: { systemGroups: [...], customGroups: [...] } }
  //
  // systemGroups  — rows from acc_group_master  (global, id-keyed)
  // customGroups  — rows from acc_ledger_groups (finance-scoped, id-keyed)
  //
  // mergeCustomGroups uses both arrays to build two separate id→name maps so
  // that system_parent_id and custom_parent_id are always resolved correctly.
  const fetchAndMerge = useCallback(async () => {
    if (!financeId) return;
    setDbFetching(true);
    try {
      const res = await getAccLedgerGroups();

      if (!res.data.success) {
        toast.error("Server returned an error while loading groups");
        return;
      }

      // The backend always returns an object with both arrays.
      // Cast via unknown to satisfy TS while remaining explicit about shape.
      const payload = res.data.data as unknown as {
        systemGroups: { id: number; group_name: string; nature: string; system_parent_id: number | null }[];
        customGroups: { id: number; group_name: string; nature: string; system_parent_id: number | null; custom_parent_id: number | null; alias?: string | null }[];
      };

      const systemGroups = Array.isArray(payload?.systemGroups) ? payload.systemGroups : [];
      const customGroups = Array.isArray(payload?.customGroups) ? payload.customGroups : [];

      setGroups(mergeCustomGroups(systemGroups, customGroups));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to sync groups from server");
    } finally {
      setDbFetching(false);
    }
  }, [financeId]);

  useEffect(() => { fetchAndMerge(); }, [fetchAndMerge]);

  // ─── Keyboard shortcuts — Tally Prime style ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if (e.ctrlKey && e.key.toLowerCase() === "g") { e.preventDefault(); setShowAdvCreate(true); return; }
      if (e.altKey && e.key.toLowerCase() === "c") { e.preventDefault(); setShowCreate(true); return; }
      // Alt+H → Multi Group Operations (same as Ledger page)
      if (e.altKey && e.key.toLowerCase() === "h") {
        // Don't open if the Multi Group panel itself is active
        if (multiGroupChoice) return;
        e.preventDefault();
        setMultiGroupSelectorOpen(true);
        return;
      }
      if (e.key === "F12") { e.preventDefault(); setShowConfig(true); return; }
      if (!config.enableTallyShortcuts || inField || e.altKey) return;
      if (e.ctrlKey && !e.shiftKey) {
        const map: Record<string, { path?: string; msg: string }> = {
          l: { path: "/accounts/ledger", msg: "Create Ledger" },
          v: { path: "/accounts/vouchers", msg: "Create Voucher Type" },
        };
        const m = map[e.key.toLowerCase()];
        if (m) { e.preventDefault(); if (m.path) navigate(m.path); else toast.info(m.msg); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, config.enableTallyShortcuts, multiGroupChoice]);

  // ─── AdvancedGroupDialog callback ─────────────────────────────────────────
  const handleGroupsSaved = useCallback((newGroups: { id: number; name: string; nature: string; parentName: string }[]) => {
    setGroups(prev => {
      const existingNames = new Set(prev.map(g => g.name.toLowerCase()));
      const toAdd = newGroups
        .filter(g => !existingNames.has(g.name.toLowerCase()))
        .map((g, i) => ({
          id: Date.now() + i,
          name: g.name,
          parent: g.parentName === "__none__" ? null : g.parentName,
          nature: (g.nature === "Expenses" ? "Expense" : g.nature) as Nature,
          isCustom: true,
        }));
      return [...prev, ...toAdd];
    });
  }, []);

  // ─── Quick create (local state only — no API call since dialog sends the correct parent) ─
  const handleCreate = useCallback(() => {
    const name = formName.trim();
    if (!name) { toast.error("Group name is required"); return; }
    if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) { toast.error(`"${name}" already exists`); return; }
    if (formParent !== "__none__" && formParent.toLowerCase() === name.toLowerCase()) { toast.error("Parent cannot reference itself"); return; }
    setGroups(prev => [...prev, {
      id: Date.now(),
      name,
      parent: formParent === "__none__" ? null : formParent,
      nature: formNature,
      isCustom: true,
    }]);
    toast.success(`Group "${name}" created`);
    setFormName(""); setFormAlias("");
    setFormParent("__none__");
    setShowCreate(false);
  }, [formName, formParent, formNature, groups]);


  // ─── Ledger leaves (fetched from backend) ────────────────────────────────────
  const [ledgersByGroup, setLedgersByGroup] = useState<Record<string, { name: string; group: string }[]>>({});

  useEffect(() => {
    if (!financeId) return;
    import("@/api/accounting").then(({ getLedgers }) => {
      getLedgers(financeId)
        .then((res: any) => {
          if (res?.data?.success) {
            const map: Record<string, { name: string; group: string }[]> = {};
            (res.data.data as { ledger_name: string; group_name: string }[]).forEach(l => {
              const grp = l.group_name;
              if (!map[grp]) map[grp] = [];
              map[grp].push({ name: l.ledger_name, group: grp });
            });
            setLedgersByGroup(map);
          }
        })
        .catch(() => {/* silently ignore — tree still renders without leaf ledgers */ });
    });
  }, [financeId]);

  // ─── Build tree ────────────────────────────────────────────────────────────
  const tree = useMemo(() => {
    const q = search.toLowerCase().trim();

    // Find root groups (groups without parent)
    const allRoots = groups.filter(g => !g.parent);

    // Define PRIMARY category names
    const PRIMARY = ["Assets", "Liabilities", "Income", "Expenses"];

    // Filter roots based on selected category
    const catFilter = (r: LedgerGroup) => {
      switch (category) {
        case "ASSETS":
          return r.name === "Assets" || r.nature === "Assets";
        case "LIABILITIES":
          return r.name === "Liabilities" || r.nature === "Liabilities";
        case "INCOME":
          return r.name === "Income" || r.nature === "Income";
        case "EXPENSES":
          return r.name === "Expenses" || r.nature === "Expense";
        case "OTHERS":
          // Show all groups that are NOT under the primary categories
          // A group is "Others" if it's not under Assets, Liabilities, Income, or Expenses
          // OR if it's a root group that doesn't match any primary category
          return !PRIMARY.includes(r.name) && !["Assets", "Liabilities", "Income", "Expense"].includes(r.nature);
        default: // ALL
          return true;
      }
    };

    const roots = allRoots.filter(catFilter);

    // Build child map
    const childMap: Record<string, LedgerGroup[]> = {};
    groups.filter(g => g.parent).forEach(g => {
      if (!childMap[g.parent!]) childMap[g.parent!] = [];
      childMap[g.parent!].push(g);
    });

    // Filter child groups based on category as well
    const filteredChildMap: Record<string, LedgerGroup[]> = {};

    // If category is ALL, show all children
    if (category === "ALL") {
      Object.keys(childMap).forEach(parent => {
        filteredChildMap[parent] = childMap[parent];
      });
    } else {
      // For specific categories, filter children by nature
      const allowedNatures: Nature[] = [];
      if (category === "ASSETS") allowedNatures.push("Assets");
      else if (category === "LIABILITIES") allowedNatures.push("Liabilities");
      else if (category === "INCOME") allowedNatures.push("Income");
      else if (category === "EXPENSES") allowedNatures.push("Expense");
      else if (category === "OTHERS") {
        // For OTHERS, show children that are not in primary categories
        Object.keys(childMap).forEach(parent => {
          filteredChildMap[parent] = childMap[parent].filter(c =>
            !["Assets", "Liabilities", "Income", "Expense"].includes(c.nature)
          );
        });
        return { roots: roots.filter(r => r.name !== "Assets" && r.name !== "Liabilities" && r.name !== "Income" && r.name !== "Expenses"), childMap: filteredChildMap };
      }

      // For ASSETS, LIABILITIES, INCOME, EXPENSES - filter children by nature
      Object.keys(childMap).forEach(parent => {
        filteredChildMap[parent] = childMap[parent].filter(c =>
          allowedNatures.includes(c.nature)
        );
      });
    }

    // Search matching function
    const matches = (name: string): boolean => {
      if (!q) return true;
      if (name.toLowerCase().includes(q)) return true;
      if ((ledgersByGroup[name] || []).some(l => l.name.toLowerCase().includes(q))) return true;
      return (filteredChildMap[name] || []).some(c => matches(c.name));
    };

    return {
      roots: roots.filter(r => matches(r.name)),
      childMap: filteredChildMap
    };
  }, [groups, search, ledgersByGroup, category]);

  // Nature summary counts
  const natureCounts = useMemo(() => {
    const map: Record<string, number> = { Assets: 0, Liabilities: 0, Income: 0, Expense: 0 };
    groups.forEach(g => { map[g.nature] = (map[g.nature] || 0) + 1; });
    return map;
  }, [groups]);

  const customCount = useMemo(() => groups.filter(g => g.isCustom).length, [groups]);

  const createLedgerInGroup = useCallback((groupName: string) => {
    try { sessionStorage.setItem("ledger:presetGroup", groupName); } catch { }
    navigate("/accounts/ledger");
  }, [navigate]);

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            {/* <FolderTree className="h-6 w-6 text-primary" /> Ledger Groups */}
            Ledger Groups
          </h1>
          <p className="text-sm text-muted-foreground">
            Hierarchical group management —
            <span className="text-primary font-medium"> {groups.length} groups</span>
            {customCount > 0 && <span className="text-muted-foreground"> ({customCount} custom)</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {config.allowAdvancedMasters && (
            <Button onClick={() => setShowAdvCreate(true)} size="sm" className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Create Group (Ctrl+G)
            </Button>
          )}
          <Button onClick={() => setShowCreate(true)} size="sm" variant="outline" className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Quick (Alt+C)
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAndMerge} disabled={dbFetching} title="Refresh from server">
            {dbFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
            <Settings className="h-3.5 w-3.5 mr-1" /> F12
          </Button>
        </div>
      </motion.div>

      {/* ── Shortcuts ── */}
      <div className="flex gap-1.5 text-[10px] flex-wrap">
        {[["Ctrl+G", "Group"], ["Ctrl+Alt+G", "Multi"], ["Alt+C", "Quick"], ["Alt+H", "Multi Group"], ["F12", "Config"]].map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary text-muted-foreground">
            <kbd className="font-mono font-semibold text-foreground">{k}</kbd> {v}
          </span>
        ))}
        {dbFetching && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-[10px]">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Syncing…
          </span>
        )}
      </div>

      {/* ── Company + Period ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentFinance?.name ?? "Main Finance Co.", "Branch – Coimbatore", "Branch – Madurai"].filter(Boolean).map(c => (
                <SelectItem key={c} value={c!}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["FY 2025-26", "FY 2024-25", "Q1 2025-26", "Q2 2025-26"].map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
              <motion.div layoutId="cat-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups or ledgers…" className="pl-9" />
      </div>

      {/* ── Nature summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["Assets", "Liabilities", "Income", "Expense"] as Nature[]).map(n => (
          <motion.div key={n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card !p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{n}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{natureCounts[n] ?? 0}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Tree ── */}
      <AnimatePresence mode="wait">
        {skelLoading ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="dashboard-card !p-3 flex items-center gap-3" style={{ marginLeft: (i % 3) * 16 }}>
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[40%]" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div key={`tree-${category}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-2">
            {tree.roots.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">No groups found in this category.</div>
            )}
            {tree.roots.sort((a, b) => a.name.localeCompare(b.name)).map(root => (
              <TreeNode
                key={`${category}-${root.id}`}
                group={root}
                childMap={tree.childMap}
                ledgersByGroup={ledgersByGroup}
                onAddLedger={createLedgerInGroup}
                level={0}
                search={search}
                autoExpand={category !== "ALL"}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick Create Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Create Ledger Group</DialogTitle>
            <DialogDescription>Add a new group to the local hierarchy</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Group Name</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Bank OD Accounts" autoFocus onKeyDown={e => e.key === "Enter" && handleCreate()} />
            </div>
            {config.allowAliases && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Alias</Label>
                <Input value={formAlias} onChange={e => setFormAlias(e.target.value)} placeholder="Short name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Under (Parent Group)</Label>
              <SearchableParentSelect value={formParent} onChange={setFormParent} groups={groups} />
            </div>
            {(isQuickPrimary || !config.enableAutoInheritance) && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nature</Label>
                <Select value={formNature} onValueChange={(v) => setFormNature(v as Nature)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["Assets", "Liabilities", "Income", "Expense"] as Nature[]).map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleCreate} className="w-full">Create Group</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Config Dialog (F12) ── */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent
          className="max-w-md"
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key.toLowerCase() === "a") {
              e.preventDefault(); setConfig(draftConfig); toast.success("Configuration saved"); setShowConfig(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> Configuration (F12)</DialogTitle>
            <DialogDescription>General Settings — Ctrl+A to save, Esc to close</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Display</p>
            {([
              ["showHierarchy", "Show Hierarchy"],
              ["allowAliases", "Allow Aliases Along With Names"],
              ["allowAdvancedMasters", "Allow Advanced Group Creation"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-sm">{label}</Label>
                <Switch checked={draftConfig[key]} onCheckedChange={(v) => setDraftConfig(prev => ({ ...prev, [key]: v }))} />
              </div>
            ))}
            <div className="h-px bg-border my-1" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Behavior</p>
            {([
              ["enableAutoInheritance", "Enable Auto Nature Inheritance"],
              ["enableTallyShortcuts", "Enable Tally Shortcut Keys"],
              ["enableSubLedger", "Enable Sub-Ledger"],
              ["nettReporting", "Nett Debit/Credit Reporting"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-sm">{label}</Label>
                <Switch checked={draftConfig[key]} onCheckedChange={(v) => setDraftConfig(prev => ({ ...prev, [key]: v }))} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setShowConfig(false)}>Cancel (Esc)</Button>
            <Button size="sm" onClick={() => { setConfig(draftConfig); toast.success("Configuration saved"); setShowConfig(false); }}>Save (Ctrl+A)</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Advanced Group Dialogs ── */}
      {config.allowAdvancedMasters && (
        <>
          <AdvancedGroupDialog
            open={showAdvCreate}
            onClose={() => setShowAdvCreate(false)}
            onSaved={handleGroupsSaved}
            financeId={financeId}
          />
        </>
      )}

      {/* ── Multi Group Selector (Alt+H) ── */}
      <MultiGroupSelector
        open={multiGroupSelectorOpen}
        customGroups={groups.filter(g => g.isCustom)}
        onClose={() => setMultiGroupSelectorOpen(false)}
        onSelect={(choice) => {
          setMultiGroupSelectorOpen(false);
          setMultiGroupChoice(choice);
        }}
      />

      {/* ── Multi Group Panel (create / alter) ── */}
      <AnimatePresence>
        {multiGroupChoice && (
          <MultiGroupPanel
            key={`${multiGroupChoice.mode}-${multiGroupChoice.presetGroup ?? ""}`}
            mode={multiGroupChoice.mode}
            presetGroup={multiGroupChoice.presetGroup}
            customGroups={groups.filter(g => g.isCustom)}
            onClose={() => setMultiGroupChoice(null)}
            onSaved={fetchAndMerge}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── TreeNode ─────────────────────────────────────────────────────────────────

function TreeNode({
  group, childMap, ledgersByGroup, onAddLedger, level, search, autoExpand,
}: {
  group: LedgerGroup;
  childMap: Record<string, LedgerGroup[]>;
  ledgersByGroup: Record<string, { name: string; group: string }[]>;
  onAddLedger: (groupName: string) => void;
  level: number;
  search: string;
  autoExpand?: boolean;
}) {
  const children = (childMap[group.name] || []).sort((a, b) => a.name.localeCompare(b.name));
  const ledgers = ledgersByGroup[group.name] || [];
  const q = search.toLowerCase().trim();
  const visibleLedgers = q ? ledgers.filter(l => l.name.toLowerCase().includes(q) || group.name.toLowerCase().includes(q)) : ledgers;
  const hasChildren = children.length > 0 || ledgers.length > 0;
  const [open, setOpen] = useState(!!search || (autoExpand && level < 2));
  const navigate = useNavigate();

  useEffect(() => { if (search) setOpen(true); }, [search]);

  const openLedgerView = () => {
    try { sessionStorage.setItem("ledger:filterGroup", group.name); } catch { }
    navigate("/accounts/ledger");
  };

  return (
    <div style={{ marginLeft: level * 16 }}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={`dashboard-card !p-0 overflow-hidden ${level > 0 ? "!rounded-lg" : ""}`}>
            <div
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors text-sm group/node"
              onDoubleClick={openLedgerView}
            >
              <button onClick={() => hasChildren && setOpen(!open)} className="flex items-center gap-2 flex-1 text-left">
                {hasChildren ? (
                  open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
                <span className={`font-medium text-foreground ${group.isCustom ? "text-primary/90" : ""}`}>{group.name}</span>
                {children.length > 0 && <Badge variant="secondary" className="text-[10px]">{children.length} sub</Badge>}
                {ledgers.length > 0 && <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">{ledgers.length} ledger{ledgers.length > 1 ? "s" : ""}</Badge>}
                {group.isCustom && <Badge variant="outline" className="text-[10px] border-primary/20 text-primary/60">custom</Badge>}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); onAddLedger(group.name); }}
                  className="opacity-0 group-hover/node:opacity-100 transition-opacity text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                  title={`Create ledger under ${group.name}`}
                >
                  <Plus className="h-3 w-3" /> Ledger
                </button>
                <Badge variant="outline" className={`text-[10px] ${NATURE_COLORS[group.nature] || ""}`}>{group.nature}</Badge>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={() => hasChildren && setOpen(!open)}>
            {open ? "Collapse" : "Expand"} Node
          </ContextMenuItem>
          <ContextMenuItem onClick={openLedgerView}>Open Group (Display)</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onAddLedger(group.name)}>Create Ledger Here</ContextMenuItem>
          <ContextMenuItem onClick={() => toast.info(`Alter "${group.name}" — use Create dialog`)}>Alter Group</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => { navigator.clipboard?.writeText(group.name); toast.success("Group name copied"); }}>Copy Name</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <AnimatePresence>
        {open && hasChildren && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1 mt-1 overflow-hidden">
            {children.map(c => (
              <TreeNode key={c.id} group={c} childMap={childMap} ledgersByGroup={ledgersByGroup} onAddLedger={onAddLedger} level={level + 1} search={search} autoExpand={autoExpand} />
            ))}
            {visibleLedgers.length > 0 && (
              <div style={{ marginLeft: 16 }} className="space-y-0.5 pl-1 border-l border-border/40 ml-2">
                {visibleLedgers.sort((a, b) => a.name.localeCompare(b.name)).map(l => (
                  <Link
                    key={l.name}
                    to="/accounts/ledger"
                    className="flex items-center justify-between px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="h-3 w-3 opacity-60" />
                      {l.name}
                    </span>
                    <Badge variant="outline" className="text-[9px] opacity-60">Ledger</Badge>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SearchableParentSelect ───────────────────────────────────────────────────

function SearchableParentSelect({
  value, onChange, groups,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: LedgerGroup[];
}) {
  const [open, setOpen] = useState(false);
  const label = value === "__none__" ? "Primary (No parent)" : value;
  const sorted = useMemo(() => [...groups].sort((a, b) => a.name.localeCompare(b.name)), [groups]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Search group..." autoFocus />
          <CommandList>
            <CommandEmpty>No group found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="Primary" onSelect={() => { onChange("__none__"); setOpen(false); }}>
                <Check className={`mr-2 h-4 w-4 ${value === "__none__" ? "opacity-100" : "opacity-0"}`} />
                Primary (No parent)
              </CommandItem>
              {sorted.map(g => (
                <CommandItem key={g.id} value={g.name} onSelect={() => { onChange(g.name); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === g.name ? "opacity-100" : "opacity-0"}`} />
                  <span className="flex-1">{g.name}</span>
                  <Badge variant="outline" className="text-[9px] ml-2 opacity-60">{g.nature}</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { getAccLedgerGroups, createAccLedgerGroup, getLedgers, getFinancialYear } from "@/api/accounting";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupConfig, GroupF12Config } from "@/components/lib/accounting/groupConfig";

// ─── Types ────────────────────────────────────────────────────────────────────

type Nature = "Assets" | "Liabilities" | "Income" | "Expense";

interface LedgerGroup {
  id: number;
  dbId?: string | number;
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
  systemGroups: { id: string | number; group_name: string; nature: string; system_parent_id?: string | number | null; parent_group_id?: string | number | null }[],
  customGroups: { id: string | number; group_name: string; nature: string; system_parent_id?: string | number | null; custom_parent_id?: string | number | null; parent_group_id?: string | number | null; alias?: string | null }[],
): LedgerGroup[] {
  // ── Step 1: build a unified id→name map covering both sets ───────────────
  const idToName = new Map<string, string>();
  [...systemGroups, ...customGroups].forEach(g => {
    idToName.set(String(g.id), g.group_name);
  });

  // ── Step 2: match DB system rows to SEED_GROUPS by name and attach dbId ──
  const sysMapByName = new Map<string, { id: string | number; group_name: string; nature: string }>();
  systemGroups.forEach(g => sysMapByName.set(g.group_name.toLowerCase(), g));

  const enrichedSeed: LedgerGroup[] = SEED_GROUPS.map(seed => {
    const matched = sysMapByName.get(seed.name.toLowerCase());
    return {
      ...seed,
      dbId: matched ? matched.id : undefined,
      nature: matched?.nature ? (matched.nature === "Expenses" ? "Expense" : matched.nature as Nature) : seed.nature,
    };
  });

  // ── Step 3: resolve parent name for a custom group ────────────────────────
  const resolveParent = (g: { system_parent_id?: string | number | null; custom_parent_id?: string | number | null; parent_group_id?: string | number | null }): string | null => {
    const pId = g.parent_group_id || g.custom_parent_id || g.system_parent_id;
    if (pId != null) return idToName.get(String(pId)) ?? null;
    return null;
  };

  // ── Step 4: append custom groups not already in seed ──────────────────────
  const seedNames = new Set(SEED_GROUPS.map(g => g.name.toLowerCase()));
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

  return [...enrichedSeed, ...extras];
}

// ─── Nature comparison helper (normalizes Expense vs Expenses, etc.) ─────────
function matchesNature(nature: string | undefined | null, target: string): boolean {
  if (!nature) return false;
  const n = nature.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (n === t) return true;
  if ((n === "expense" || n === "expenses") && (t === "expense" || t === "expenses")) return true;
  if ((n === "asset" || n === "assets") && (t === "asset" || t === "assets")) return true;
  if ((n === "liability" || n === "liabilities") && (t === "liability" || t === "liabilities")) return true;
  if ((n === "income" || n === "incomes") && (t === "income" || t === "incomes")) return true;
  return false;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LedgerGroups() {
  const { currentFinance, financeList, switchFinance } = useAuth();
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

  // Dynamic FY options based on current financial year
  const fyOptions = useMemo(() => {
    const curFY = getFinancialYear();
    const startYear = parseInt(curFY.split("-")[0], 10) || new Date().getFullYear();
    const years = [startYear + 1, startYear, startYear - 1, startYear - 2];
    return years.map(y => {
      const nextY = y + 1;
      const shortNext = String(nextY).slice(-2);
      return {
        value: `${y}-${nextY}`,
        label: `FY ${y}-${shortNext}`,
      };
    });
  }, []);

  const [period, setPeriod] = useState<string>(() => getFinancialYear());
  const [skelLoading, setSkelLoading] = useState(false);

  // Skeleton flash on category/company/period switch — Tally Prime style
  useEffect(() => {
    setSkelLoading(true);
    const t = setTimeout(() => setSkelLoading(false), 280);
    return () => clearTimeout(t);
  }, [category, financeId, period]);

  // Quick-create form
  const [formName, setFormName] = useState("");
  const [formAlias, setFormAlias] = useState("");
  const [formParent, setFormParent] = useState<string>("__none__");
  const [formNature, setFormNature] = useState<Nature>("Assets");
  const [config, setConfig] = useGroupConfig();
  const [draftConfig, setDraftConfig] = useState<GroupF12Config>(config);
  useEffect(() => { if (showConfig) setDraftConfig(config); }, [showConfig, config]);

  const navigate = useNavigate();

  // Auto-inherit nature from selected parent in Quick Create
  useEffect(() => {
    if (!config.enableAutoInheritance || formParent === "__none__") return;
    const p = groups.find(g => g.name === formParent);
    if (p) setFormNature(p.nature);
  }, [formParent, groups, config.enableAutoInheritance]);

  const isQuickPrimary = formParent === "__none__";
  const [createLoading, setCreateLoading] = useState(false);

  const fetchSeqRef = useRef(0);

  // ─── Fetch DB groups and merge with SEED_GROUPS ─────────────────────────────
  const fetchAndMerge = useCallback(async () => {
    if (!financeId) return;
    const seq = ++fetchSeqRef.current;
    setDbFetching(true);
    try {
      const res = await getAccLedgerGroups();
      if (seq !== fetchSeqRef.current) return;

      if (!res.data.success) {
        toast.error("Server returned an error while loading groups");
        return;
      }

      const payload = res.data.data as unknown as {
        systemGroups: { id: string | number; group_name: string; nature: string; system_parent_id?: string | number | null; parent_group_id?: string | number | null }[];
        customGroups: { id: string | number; group_name: string; nature: string; system_parent_id?: string | number | null; custom_parent_id?: string | number | null; parent_group_id?: string | number | null; alias?: string | null }[];
      };

      const systemGroups = Array.isArray(payload?.systemGroups) ? payload.systemGroups : [];
      const customGroups = Array.isArray(payload?.customGroups) ? payload.customGroups : [];

      setGroups(mergeCustomGroups(systemGroups, customGroups));
    } catch (err: any) {
      if (seq !== fetchSeqRef.current) return;
      toast.error(err?.response?.data?.message || "Failed to sync groups from server");
    } finally {
      if (seq === fetchSeqRef.current) {
        setDbFetching(false);
      }
    }
  }, [financeId]);

  useEffect(() => { fetchAndMerge(); }, [fetchAndMerge]);

  // Listen to autofinex:finance-switched event
  useEffect(() => {
    const handler = () => {
      fetchAndMerge();
    };
    window.addEventListener("autofinex:finance-switched", handler);
    return () => window.removeEventListener("autofinex:finance-switched", handler);
  }, [fetchAndMerge]);

  const handleCompanyChange = async (newFinanceId: string) => {
    if (!newFinanceId || String(newFinanceId) === String(currentFinance?.id)) return;
    try {
      await switchFinance(newFinanceId);
      toast.success("Switched company successfully");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to switch company");
    }
  };

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
  const handleGroupsSaved = useCallback(async () => {
    await fetchAndMerge();
  }, [fetchAndMerge]);

  // ─── Quick create — calls real API with parent UUID and refreshes tree ─────
  const handleCreate = useCallback(async () => {
    const name = formName.trim();
    if (!name) { toast.error("Group name is required"); return; }
    if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`);
      return;
    }
    if (formParent !== "__none__" && formParent.toLowerCase() === name.toLowerCase()) {
      toast.error("Parent cannot reference itself");
      return;
    }

    const parentGroup = formParent !== "__none__" ? groups.find(g => g.name === formParent) : null;
    const parentDbId = parentGroup?.dbId ?? null;

    if (formParent !== "__none__" && !parentDbId) {
      toast.error("Parent group database ID not resolved yet. Please wait for groups to load.");
      return;
    }

    setCreateLoading(true);
    try {
      const normNature = (formNature === "Expense" ? "Expenses" : formNature) as "Assets" | "Liabilities" | "Income" | "Expenses";
      const res = await createAccLedgerGroup({
        group_name: name,
        alias: formAlias.trim() || null,
        parent_group_id: parentDbId,
        nature: normNature,
      });

      if (res.data?.success) {
        toast.success(`Group "${name}" created successfully`);
        setFormName("");
        setFormAlias("");
        setFormParent("__none__");
        setShowCreate(false);
        await fetchAndMerge();
      } else {
        toast.error((res.data as any)?.message || "Failed to create group");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to create group");
    } finally {
      setCreateLoading(false);
    }
  }, [formName, formAlias, formParent, formNature, groups, fetchAndMerge]);

  // ─── Ledger leaves (fetched from backend) ────────────────────────────────────
  const [ledgersByGroup, setLedgersByGroup] = useState<Record<string, { name: string; group: string }[]>>({});

  useEffect(() => {
    if (!financeId) return;
    getLedgers(financeId, period)
      .then((res: any) => {
        if (res?.data?.success && Array.isArray(res?.data?.data)) {
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
  }, [financeId, period]);

  // ─── Build tree ────────────────────────────────────────────────────────────
  const tree = useMemo(() => {
    const q = search.toLowerCase().trim();

    // Fast lookup map by group name
    const groupByName = new Map<string, LedgerGroup>();
    groups.forEach(g => groupByName.set(g.name.toLowerCase(), g));

    // Full child map
    const childMap: Record<string, LedgerGroup[]> = {};
    groups.filter(g => g.parent).forEach(g => {
      if (!childMap[g.parent!]) childMap[g.parent!] = [];
      childMap[g.parent!].push(g);
    });

    let roots: LedgerGroup[] = [];
    const filteredChildMap: Record<string, LedgerGroup[]> = {};

    if (category === "ALL") {
      roots = groups.filter(g => !g.parent);
      Object.keys(childMap).forEach(parent => {
        filteredChildMap[parent] = childMap[parent];
      });
    } else if (category === "ASSETS") {
      roots = groups.filter(g => !g.parent && matchesNature(g.nature, "Assets"));
      Object.keys(childMap).forEach(parent => {
        filteredChildMap[parent] = childMap[parent].filter(c => matchesNature(c.nature, "Assets"));
      });
    } else if (category === "LIABILITIES") {
      roots = groups.filter(g => !g.parent && matchesNature(g.nature, "Liabilities"));
      Object.keys(childMap).forEach(parent => {
        filteredChildMap[parent] = childMap[parent].filter(c => matchesNature(c.nature, "Liabilities"));
      });
    } else if (category === "INCOME") {
      roots = groups.filter(g => !g.parent && matchesNature(g.nature, "Income"));
      Object.keys(childMap).forEach(parent => {
        filteredChildMap[parent] = childMap[parent].filter(c => matchesNature(c.nature, "Income"));
      });
    } else if (category === "EXPENSES") {
      roots = groups.filter(g => !g.parent && matchesNature(g.nature, "Expenses"));
      Object.keys(childMap).forEach(parent => {
        filteredChildMap[parent] = childMap[parent].filter(c => matchesNature(c.nature, "Expenses"));
      });
    } else if (category === "OTHERS") {
      // In OTHERS:
      // Show custom groups (or non-primary nature groups).
      // If a custom group has no parent, or its parent is a system group (not custom),
      // treat it as a root in this view so the user can easily see their custom groups.
      roots = groups.filter(g => {
        if (!g.isCustom) {
          return !g.parent && !["Assets", "Liabilities", "Income", "Expenses"].some(n => matchesNature(g.nature, n));
        }
        if (!g.parent) return true;
        const parentGrp = groupByName.get(g.parent.toLowerCase());
        return !parentGrp || !parentGrp.isCustom;
      });

      Object.keys(childMap).forEach(parent => {
        filteredChildMap[parent] = childMap[parent].filter(c => c.isCustom || !["Assets", "Liabilities", "Income", "Expenses"].some(n => matchesNature(c.nature, n)));
      });
    }

    // Search matching function: matches name, alias, or ledger leaves, or any descendant matching
    const matches = (g: LedgerGroup): boolean => {
      if (!q) return true;
      if (g.name.toLowerCase().includes(q)) return true;
      if (g.alias && g.alias.toLowerCase().includes(q)) return true;
      if ((ledgersByGroup[g.name] || []).some(l => l.name.toLowerCase().includes(q))) return true;
      return (filteredChildMap[g.name] || []).some(c => matches(c));
    };

    return {
      roots: roots.filter(r => matches(r)),
      childMap: filteredChildMap,
    };
  }, [groups, search, ledgersByGroup, category]);

  // Nature summary counts
  const natureCounts = useMemo(() => {
    const map: Record<string, number> = { Assets: 0, Liabilities: 0, Income: 0, Expense: 0 };
    groups.forEach(g => {
      const n = (g.nature === "Expenses" ? "Expense" : g.nature) as Nature;
      map[n] = (map[n] || 0) + 1;
    });
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
          <Select value={currentFinance?.id ? String(currentFinance.id) : ""} onValueChange={handleCompanyChange}>
            <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue placeholder="Select company" /></SelectTrigger>
            <SelectContent>
              {financeList && financeList.length > 0 ? (
                financeList.map(f => (
                  <SelectItem key={String(f.id)} value={String(f.id)}>
                    {f.finance_name || f.name || `Finance ${f.id}`}
                  </SelectItem>
                ))
              ) : currentFinance ? (
                <SelectItem value={String(currentFinance.id)}>
                  {currentFinance.finance_name || currentFinance.name || "Default Company"}
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fyOptions.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
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
                showHierarchy={config.showHierarchy}
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
            <Button onClick={handleCreate} disabled={createLoading} className="w-full">
              {createLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Group...
                </>
              ) : (
                "Create Group"
              )}
            </Button>
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
  group, childMap, ledgersByGroup, onAddLedger, level, search, autoExpand, showHierarchy = true,
}: {
  group: LedgerGroup;
  childMap: Record<string, LedgerGroup[]>;
  ledgersByGroup: Record<string, { name: string; group: string }[]>;
  onAddLedger: (groupName: string) => void;
  level: number;
  search: string;
  autoExpand?: boolean;
  showHierarchy?: boolean;
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
    <div style={{ marginLeft: showHierarchy ? level * 16 : 0 }}>
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
              <TreeNode key={c.id} group={c} childMap={childMap} ledgersByGroup={ledgersByGroup} onAddLedger={onAddLedger} level={level + 1} search={search} autoExpand={autoExpand} showHierarchy={showHierarchy} />
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
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
          onKeyDown={e => {
            if (e.key === "F4" || e.key === "ArrowDown" || e.key === "Enter") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
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
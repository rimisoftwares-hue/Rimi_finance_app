import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { FolderTree, Save, Loader2, ChevronRight, Database, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import {
  createAccLedgerGroup, multiCreateAccLedgerGroup,
  getUnderDropdown, UnderDropdownItem,
} from "@/api/accounting";
import { useGroupConfig } from "../lib/accounting/groupConfig";
import { PREDEFINED_GROUPS } from "../lib/accounting/predefinedGroups";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupNature = "Assets" | "Liabilities" | "Income" | "Expenses";

export interface AdvancedGroupForm {
  name: string;
  alias: string;
  /** Display label for the "Under" combobox — "__none__" means Primary */
  parentName: string;
  /** Set when parent is a system group (acc_group_master or is_system group) */
  system_parent_id: string | number | null;
  /** Set when parent is a custom group (acc_ledger_groups) */
  custom_parent_id: string | number | null;
  nature: GroupNature;
  behavesLikeSubLedger: boolean;
  nettBalances: boolean;
  usedForCalculation: boolean;
  allocationMethod: "Not Applicable" | "By Value" | "By Quantity";
  affectsGrossProfit: boolean;
}

const DEFAULTS: AdvancedGroupForm = {
  name: "",
  alias: "",
  parentName: "__none__",
  system_parent_id: null,
  custom_parent_id: null,
  nature: "Assets",
  behavesLikeSubLedger: false,
  nettBalances: false,
  usedForCalculation: false,
  allocationMethod: "Not Applicable",
  affectsGrossProfit: false,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (groups: { id: string | number; name: string; nature: GroupNature; parentName: string }[]) => void;
  financeId: string | number;
  /** Unused — kept for API compat, all groups now come from getUnderDropdown */
  existingGroups?: unknown[];
  multi?: boolean;
}

// ─── Nature colour tokens ─────────────────────────────────────────────────────
const NATURE_BADGE: Record<GroupNature, string> = {
  Assets: "bg-blue-500/10 text-blue-600 border-blue-400/30 dark:text-blue-400",
  Liabilities: "bg-red-500/10 text-red-600 border-red-400/30 dark:text-red-400",
  Income: "bg-green-500/10 text-green-600 border-green-400/30 dark:text-green-400",
  Expenses: "bg-amber-500/10 text-amber-600 border-amber-400/30 dark:text-amber-400",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdvancedGroupDialog({
  open, onClose, onSaved, financeId, multi = false,
}: Props) {
  const [cfg] = useGroupConfig();
  const [form, setForm] = useState<AdvancedGroupForm>(DEFAULTS);
  const [rows, setRows] = useState<AdvancedGroupForm[]>([{ ...DEFAULTS }]);
  const [defaultParentName, setDefaultParentName] = useState<string>("__none__");
  const [defaultSystemParentId, setDefaultSystemParentId] = useState<string | number | null>(null);
  const [defaultCustomParentId, setDefaultCustomParentId] = useState<string | number | null>(null);
  const [defaultNature, setDefaultNature] = useState<GroupNature>("Assets");
  const [saving, setSaving] = useState(false);

  // ── Under dropdown data (system + custom groups) ────────────────────────────
  const [underItems, setUnderItems] = useState<UnderDropdownItem[]>([]);
  const [underLoading, setUnderLoading] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  /**
   * mergedUnderItems — uses real DB items as soon as loaded.
   * Predefined static groups only act as temporary placeholders while fetching.
   */
  const mergedUnderItems = useMemo<UnderDropdownItem[]>(() => {
    if (underItems.length > 0) return underItems;
    return PREDEFINED_GROUPS.map((pg, idx) => ({
      id: -(idx + 1),
      group_name: pg.name,
      system_parent_id: null,
      custom_parent_id: null,
      nature: pg.nature,
      source: "system" as const,
      sequence_order: 9000 + idx,
    }));
  }, [underItems]);

  // Fetch under-dropdown when dialog opens
  useEffect(() => {
    if (!open) return;
    setForm(DEFAULTS);
    setRows([{ ...DEFAULTS }]);
    setDefaultParentName("__none__");
    setDefaultSystemParentId(null);
    setDefaultCustomParentId(null);
    setDefaultNature("Assets");
    setTimeout(() => nameInputRef.current?.focus(), 120);

    // Load groups for the Under picker (system + custom from acc_ledger_groups)
    setUnderLoading(true);
    getUnderDropdown()
      .then(res => { if (res.data.success) setUnderItems(res.data.data); })
      .catch(() => toast.error("Failed to load parent groups"))
      .finally(() => setUnderLoading(false));
  }, [open]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const set = <K extends keyof AdvancedGroupForm>(k: K, v: AdvancedGroupForm[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  /**
   * Called when user picks a parent from the Under combobox (single mode).
   */
  const handleParentSelect = (item: UnderDropdownItem | null) => {
    if (!item) {
      setForm(p => ({ ...p, parentName: "__none__", system_parent_id: null, custom_parent_id: null }));
      return;
    }
    setForm(p => ({
      ...p,
      parentName: item.group_name,
      system_parent_id: item.source === "system" ? item.id : null,
      custom_parent_id: item.source === "custom" ? item.id : null,
      nature: item.nature,
    }));
  };

  /** Called when user picks a parent in multi mode (per-row) */
  const handleRowParentSelect = (i: number, item: UnderDropdownItem | null) => {
    setRows(prev => prev.map((r, j) => j !== i ? r : {
      ...r,
      parentName: item ? item.group_name : "__none__",
      system_parent_id: item?.source === "system" ? item.id : null,
      custom_parent_id: item?.source === "custom" ? item.id : null,
      nature: item ? item.nature : r.nature,
    }));
  };

  /** Called when default parent changes in multi-mode header */
  const handleDefaultParentSelect = (item: UnderDropdownItem | null) => {
    const name = item ? item.group_name : "__none__";
    const sys = item?.source === "system" ? item.id : null;
    const cust = item?.source === "custom" ? item.id : null;
    const nat = item ? item.nature : defaultNature;
    setDefaultParentName(name);
    setDefaultSystemParentId(sys);
    setDefaultCustomParentId(cust);
    if (item) setDefaultNature(nat);
    // Apply to empty-name rows
    setRows(prev => prev.map(r => r.name.trim() ? r : {
      ...r, parentName: name, system_parent_id: sys, custom_parent_id: cust, nature: nat,
    }));
  };

  const isPrimary = !form.system_parent_id && !form.custom_parent_id;
  const showGrossProfit = form.nature === "Income" || form.nature === "Expenses";
  const showAllocation = form.usedForCalculation;

  const validate = (g: AdvancedGroupForm): string | null => {
    if (!g.name.trim()) return "Group name required";
    return null;
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (multi) {
        const valid = rows.filter(r => r.name.trim());
        if (!valid.length) { toast.error("Add at least one group"); return; }
        for (const r of valid) {
          const err = validate(r);
          if (err) { toast.error(err); return; }
          if (r.parentName !== "__none__" && !r.system_parent_id && !r.custom_parent_id) {
            toast.error(`"${r.name}": Select a parent group (required)`);
            return;
          }
          if (
            (r.system_parent_id && typeof r.system_parent_id === "number" && r.system_parent_id < 0) ||
            (r.custom_parent_id && typeof r.custom_parent_id === "number" && r.custom_parent_id < 0)
          ) {
            toast.error(`"${r.name}": Parent group is still loading. Please wait a moment.`);
            return;
          }
        }

        const payloads = valid.map(g => {
          const nettReport: "Debit" | "Credit" | "Both" = g.nettBalances
            ? (g.nature === "Assets" || g.nature === "Expenses" ? "Debit" : "Credit")
            : "Both";
          return {
            group_name: g.name.trim(),
            alias: g.alias.trim() || null,
            system_parent_id: g.system_parent_id,
            custom_parent_id: g.custom_parent_id,
            nature: g.nature,
            affects_gross_profit: g.affectsGrossProfit,
            behaves_like_subledger: g.behavesLikeSubLedger,
            nett_balance_report: nettReport,
            used_for_calculation: g.usedForCalculation,
            allocation_method: g.allocationMethod,
          };
        });

        const res = await multiCreateAccLedgerGroup(payloads);
        if (!res.data.success) throw new Error("Failed to save groups");

        onSaved(valid.map((g, i) => ({
          id: res.data.ids[i],
          name: g.name.trim(),
          nature: g.nature,
          parentName: g.parentName,
        })));
        toast.success(`${valid.length} group(s) created`);
      } else {
        const err = validate(form);
        if (err) { toast.error(err); return; }
        if (form.parentName !== "__none__" && !form.system_parent_id && !form.custom_parent_id) {
          toast.error("Select a parent group (required by the system)");
          return;
        }
        if (
          (form.system_parent_id && typeof form.system_parent_id === "number" && form.system_parent_id < 0) ||
          (form.custom_parent_id && typeof form.custom_parent_id === "number" && form.custom_parent_id < 0)
        ) {
          toast.error("Parent group is still loading. Please wait a moment.");
          return;
        }

        const nettReport: "Debit" | "Credit" | "Both" = form.nettBalances
          ? (form.nature === "Assets" || form.nature === "Expenses" ? "Debit" : "Credit")
          : "Both";

        const payload = {
          group_name: form.name.trim(),
          alias: form.alias.trim() || null,
          system_parent_id: form.system_parent_id,
          custom_parent_id: form.custom_parent_id,
          nature: form.nature,
          affects_gross_profit: form.affectsGrossProfit,
          behaves_like_subledger: form.behavesLikeSubLedger,
          nett_balance_report: nettReport,
          used_for_calculation: form.usedForCalculation,
          allocation_method: form.allocationMethod,
        };

        const res = await createAccLedgerGroup(payload);
        if (!res.data.success) throw new Error("Failed to save group");

        onSaved([{ id: res.data.id, name: form.name.trim(), nature: form.nature, parentName: form.parentName }]);
        toast.success(`Group "${form.name}" created`);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [form, rows, multi, onSaved, onClose, saving]);

  // Keyboard: Ctrl+A = save, F4 = focus parent
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "a") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, handleSave]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            {multi ? "Multi Group Creation (Ctrl+Alt+G)" : "Group Creation (Ctrl+G)"}
            <Badge variant="outline" className="ml-2 text-[10px]">Tally Style</Badge>
          </DialogTitle>
          <DialogDescription>
            {multi
              ? "Create multiple groups in bulk — select a parent from the Under dropdown"
              : "Select parent to auto-inherit nature. Right side shows inherited properties."}
          </DialogDescription>
        </DialogHeader>

        <SingleModeContent
          form={form}
          set={set}
          nameInputRef={nameInputRef}
          underItems={mergedUnderItems}
          underLoading={underLoading}
          isPrimary={isPrimary}
          showGrossProfit={showGrossProfit}
          showAllocation={showAllocation}
          cfg={cfg}
          onParentSelect={handleParentSelect}
        />

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel (Esc)</Button>
          <Button onClick={handleSave} className="gap-1.5" disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save (Ctrl+A)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Under Combobox ───────────────────────────────────────────────────────────

function UnderCombobox({
  value,
  items,
  loading,
  onSelect,
  placeholder = "Primary (No parent)",
  className = "",
}: {
  value: string;
  items: UnderDropdownItem[];
  loading: boolean;
  onSelect: (item: UnderDropdownItem | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const systemItems = useMemo(() =>
    items.filter(i => i.source === "system" && (!query || i.group_name.toLowerCase().includes(query.toLowerCase())))
    , [items, query]);

  const customItems = useMemo(() =>
    items.filter(i => i.source === "custom" && (!query || i.group_name.toLowerCase().includes(query.toLowerCase())))
    , [items, query]);

  const flatOptions = useMemo(() => {
    const list: { key: string; item: UnderDropdownItem | null; label: string; isPrimary?: boolean; source?: string }[] = [];
    list.push({ key: "primary", item: null, label: "Primary (No parent)", isPrimary: true });
    systemItems.forEach(i => list.push({ key: `sys-${i.id}`, item: i, label: i.group_name, source: "system" }));
    customItems.forEach(i => list.push({ key: `cust-${i.id}`, item: i, label: i.group_name, source: "custom" }));
    return list;
  }, [systemItems, customItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Scroll active item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-active="true"]`);
    if (activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (!open) {
        setOpen(true);
      } else if (flatOptions.length > 0) {
        setActiveIndex(i => (i + 1) % flatOptions.length);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (!open) {
        setOpen(true);
      } else if (flatOptions.length > 0) {
        setActiveIndex(i => (i - 1 + flatOptions.length) % flatOptions.length);
      }
      return;
    }
    if (e.key === "Enter") {
      if (open && flatOptions.length > 0 && activeIndex >= 0 && activeIndex < flatOptions.length) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(flatOptions[activeIndex].item);
        setOpen(false);
        setQuery("");
      }
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setQuery("");
      }
      return;
    }
    if (e.key === "F4") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
      return;
    }
  };

  // Global F4 shortcut to focus and open this combobox
  useEffect(() => {
    const handleGlobalF4 = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 60);
      }
    };
    window.addEventListener("keydown", handleGlobalF4);
    return () => window.removeEventListener("keydown", handleGlobalF4);
  }, []);

  const label = value === "__none__" || !value ? placeholder : value;
  const isSet = value && value !== "__none__";

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 h-10 text-sm rounded-md border bg-background transition-all
          ${open ? "border-primary ring-1 ring-primary/30" : "border-input"}
          ${!isSet ? "text-muted-foreground" : "text-foreground"}
          hover:bg-secondary/30 cursor-pointer`}
      >
        <span className="truncate">{loading ? "Loading…" : label}</span>
        <ChevronRight className={`h-4 w-4 text-muted-foreground ml-2 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/30">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search groups… (Arrow keys to navigate, Enter to select)"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onKeyDown={handleKeyDown}
            />
          </div>
          <div ref={listRef} className="max-h-72 overflow-y-auto">
            {/* Primary */}
            {(() => {
              const optIndex = flatOptions.findIndex(o => o.key === "primary");
              const isActive = activeIndex === optIndex;
              return (
                <div
                  data-active={isActive}
                  onClick={() => { onSelect(null); setOpen(false); setQuery(""); }}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors
                    ${isActive ? "bg-accent text-accent-foreground font-medium" : "hover:bg-secondary/60"}
                    ${!isSet && !isActive ? "text-primary font-medium" : ""}`}
                >
                  <span>Primary (No parent)</span>
                </div>
              );
            })()}

            {/* System groups */}
            {systemItems.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-secondary/20 border-y border-border/40">
                  <Database className="h-3 w-3" /> Default Tally Groups
                </div>
                {systemItems.map(item => {
                  const itemKey = `sys-${item.id}`;
                  const optIndex = flatOptions.findIndex(o => o.key === itemKey);
                  const isActive = activeIndex === optIndex;
                  const isFallback = typeof item.id === "number" && item.id < 0;
                  return (
                    <div
                      key={itemKey}
                      data-active={isActive}
                      onClick={() => {
                        onSelect(item); setOpen(false); setQuery("");
                      }}
                      title={isFallback ? `"${item.group_name}" is predefined but not yet seeded in acc_group_master` : undefined}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer transition-colors
                        ${isActive ? "bg-accent text-accent-foreground font-medium" : "hover:bg-secondary/60 text-foreground"}
                        ${isSet && value === item.group_name && !isActive ? "bg-primary/5 text-primary" : ""}`}
                    >
                      <span className="truncate">{item.group_name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isFallback && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded border border-orange-400/40 bg-orange-500/10 text-orange-500">
                            Predefined
                          </span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${(item.nature && NATURE_BADGE[item.nature as GroupNature]) || ""}`}>
                          {item.nature}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Custom groups */}
            {customItems.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-secondary/20 border-y border-border/40">
                  <Sparkles className="h-3 w-3" /> Your Custom Groups
                </div>
                {customItems.map(item => {
                  const itemKey = `cust-${item.id}`;
                  const optIndex = flatOptions.findIndex(o => o.key === itemKey);
                  const isActive = activeIndex === optIndex;
                  return (
                    <div
                      key={itemKey}
                      data-active={isActive}
                      onClick={() => { onSelect(item); setOpen(false); setQuery(""); }}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer transition-colors
                        ${isActive ? "bg-accent text-accent-foreground font-medium" : "hover:bg-secondary/60 text-foreground"}
                        ${isSet && value === item.group_name && !isActive ? "bg-primary/5 text-primary" : ""}`}
                    >
                      <span className="truncate">{item.group_name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${(item.nature && NATURE_BADGE[item.nature as GroupNature]) || ""}`}>
                        {item.nature}
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {systemItems.length === 0 && customItems.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">No groups found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single Mode ──────────────────────────────────────────────────────────────

function SingleModeContent({
  form, set, nameInputRef, underItems, underLoading, isPrimary, showGrossProfit, showAllocation, cfg, onParentSelect,
}: {
  form: AdvancedGroupForm;
  set: <K extends keyof AdvancedGroupForm>(k: K, v: AdvancedGroupForm[K]) => void;
  nameInputRef: React.RefObject<HTMLInputElement>;
  underItems: UnderDropdownItem[];
  underLoading: boolean;
  isPrimary: boolean;
  showGrossProfit: boolean;
  showAllocation: boolean;
  cfg: ReturnType<typeof useGroupConfig>[0];
  onParentSelect: (item: UnderDropdownItem | null) => void;
}) {
  return (
    // Tally Prime style: two-column layout — left = form, right = inherited properties panel
    <div className="flex gap-4 pt-2">
      {/* ── Left: Form ──────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-4 min-w-0">
        <div className="border-l-2 border-primary pl-2">
          <h3 className="text-sm font-semibold">Basic Information</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Group Name *">
            <Input
              ref={nameInputRef}
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="e.g. Bank OD Accounts"
            />
          </Field>
          {cfg.allowAliases && (
            <Field label="Alias Name">
              <Input value={form.alias} onChange={e => set("alias", e.target.value)} placeholder="Short name" />
            </Field>
          )}
          <div className={cfg.allowAliases ? "col-span-2" : ""}>
            <Field label="Under (Parent Group) — F4">
              <UnderCombobox
                value={form.parentName}
                items={underItems}
                loading={underLoading}
                onSelect={onParentSelect}
                placeholder="Primary (No parent)"
              />
            </Field>
          </div>
          {isPrimary ? (
            <Field label="Nature of Group *">
              <Select value={form.nature} onValueChange={v => set("nature", v as GroupNature)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Assets", "Liabilities", "Income", "Expenses"] as GroupNature[]).map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Nature (auto-inherited)">
              <div className="h-10 flex items-center px-3 rounded-md border border-border/60 bg-secondary/30 text-sm gap-2">
                <Badge variant="outline" className={`text-[10px] ${NATURE_BADGE[form.nature] || ""}`}>{form.nature}</Badge>
                <span className="text-muted-foreground text-xs truncate">from {form.parentName}</span>
              </div>
            </Field>
          )}
        </div>

        <div className="border-l-2 border-primary pl-2">
          <h3 className="text-sm font-semibold">Advanced Settings (F12)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Toggle label="Behaves Like Sub-Ledger?" v={form.behavesLikeSubLedger} onC={v => set("behavesLikeSubLedger", v)} />
          <Toggle label="Nett Debit/Credit Balances?" v={form.nettBalances} onC={v => set("nettBalances", v)} />
          <Toggle label="Used for Calculation?" v={form.usedForCalculation} onC={v => set("usedForCalculation", v)} />
        </div>
        {showAllocation && (
          <Field label="Method to Allocate (Purchase Invoice)">
            <Select value={form.allocationMethod} onValueChange={v => set("allocationMethod", v as AdvancedGroupForm["allocationMethod"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Not Applicable", "By Value", "By Quantity"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        {showGrossProfit && (
          <Toggle label="Affects Gross Profit?" v={form.affectsGrossProfit} onC={v => set("affectsGrossProfit", v)} />
        )}
      </div>

      {/* ── Right: Tally Prime-style inherited properties panel ──────── */}
      <div className="w-56 shrink-0 border-l border-border/40 pl-4 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Group Properties</p>

        <PropRow label="Nature">
          <Badge variant="outline" className={`text-[9px] ${NATURE_BADGE[form.nature] || ""}`}>{form.nature}</Badge>
        </PropRow>
        <PropRow label="Under">
          <span className="text-xs">{form.parentName === "__none__" ? "Primary" : form.parentName}</span>
        </PropRow>
        <PropRow label="Parent Type">
          {form.system_parent_id ? (
            <span className="text-xs flex items-center gap-1"><Database className="h-2.5 w-2.5 opacity-60" />System</span>
          ) : form.custom_parent_id ? (
            <span className="text-xs flex items-center gap-1"><Sparkles className="h-2.5 w-2.5 opacity-60" />Custom</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </PropRow>
        <PropRow label="Sub-Ledger">
          <Badge variant={form.behavesLikeSubLedger ? "default" : "secondary"} className="text-[9px]">
            {form.behavesLikeSubLedger ? "Yes" : "No"}
          </Badge>
        </PropRow>
        <PropRow label="Calc Group">
          <Badge variant={form.usedForCalculation ? "default" : "secondary"} className="text-[9px]">
            {form.usedForCalculation ? "Yes" : "No"}
          </Badge>
        </PropRow>
        {form.usedForCalculation && (
          <PropRow label="Allocation">
            <span className="text-xs">{form.allocationMethod}</span>
          </PropRow>
        )}
        {(form.nature === "Income" || form.nature === "Expenses") && (
          <PropRow label="Gross Profit">
            <Badge variant={form.affectsGrossProfit ? "default" : "secondary"} className="text-[9px]">
              {form.affectsGrossProfit ? "Yes" : "No"}
            </Badge>
          </PropRow>
        )}

        {/* Summary of what will be sent to DB */}
        {(form.system_parent_id || form.custom_parent_id) && (
          <div className="mt-4 pt-3 border-t border-border/40">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">DB Payload Preview</p>
            <div className="space-y-0.5 text-[9px] text-muted-foreground font-mono">
              {form.system_parent_id && <div>system_parent_id: {form.system_parent_id}</div>}
              {form.custom_parent_id && <div>custom_parent_id: {form.custom_parent_id}</div>}
              <div>nature: {form.nature} (auto)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, v, onC }: { label: string; v: boolean; onC: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 hover:bg-secondary/30">
      <Label className="text-xs cursor-pointer">{label}</Label>
      <Switch checked={v} onCheckedChange={onC} />
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
      {children}
    </div>
  );
}
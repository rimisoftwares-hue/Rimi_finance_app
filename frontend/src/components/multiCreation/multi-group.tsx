import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, FolderTree, Keyboard, Plus, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";


export type MultiMode = "create" | "alter";

// ─── Types & seed parent groups ───────────────────────────────────
type Nature = "Assets" | "Liabilities" | "Income" | "Expenses";

interface ParentGroup {
  name: string;
  nature: Nature;
  source: "system" | "custom";
}

const SEED_PARENTS: ParentGroup[] = [
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

interface GroupRow {
  id: number;
  name: string;
  alias: string;
  parent: string;
  nature: Nature;
}

const emptyRow = (id: number, parent = "", nature: Nature = "Assets"): GroupRow => ({
  id, name: "", alias: "", parent, nature,
});

const NATURE_STYLE: Record<Nature, string> = {
  Assets: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  Liabilities: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
  Income: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  Expenses: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

function MultiGroupPage() {
  const [defaultParent, setDefaultParent] = useState("");
  const [defaultNature, setDefaultNature] = useState<Nature>("Assets");
  const [rows, setRows] = useState<GroupRow[]>(() =>
    Array.from({ length: 8 }, (_, i) => emptyRow(i + 1)),
  );
  const [filter, setFilter] = useState("");

  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const topUnderRef = useRef<HTMLInputElement>(null);

  // Under autosuggest (top)
  const [underQuery, setUnderQuery] = useState("");
  const [underOpen, setUnderOpen] = useState(false);
  const [underActive, setUnderActive] = useState(0);
  const parentNames = useMemo(() => SEED_PARENTS.map(p => p.name), []);
  const parentByName = useMemo(() => {
    const m = new Map<string, ParentGroup>();
    SEED_PARENTS.forEach(p => m.set(p.name.toLowerCase(), p));
    return m;
  }, []);
  const underSuggestions = useMemo(() => {
    const q = underQuery.trim().toLowerCase();
    const list = q
      ? parentNames.filter(n => n.toLowerCase().includes(q))
        .sort((a, b) => a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q))
      : parentNames;
    return list.slice(0, 12);
  }, [parentNames, underQuery]);

  const cols: { key: keyof GroupRow; label: string; w: string; required?: boolean }[] = [
    { key: "name", label: "Name of Group", w: "min-w-[260px]", required: true },
    { key: "alias", label: "Alias", w: "min-w-[180px]" },
    { key: "parent", label: "Under", w: "min-w-[220px]", required: true },
  ];

  useEffect(() => {
    setTimeout(() => topUnderRef.current?.focus(), 60);
  }, []);

  // Global shortcuts
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault(); save(); return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault(); save(); return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        topUnderRef.current?.focus();
        topUnderRef.current?.select();
        setUnderOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, defaultParent]);

  const setCell = (idx: number, key: keyof GroupRow, value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [key]: value } as GroupRow;
      if (key === "parent") {
        const p = parentByName.get(value.toLowerCase());
        if (p) next.nature = p.nature;
      }
      return next;
    }));
  };

  const focusCell = (rowIdx: number, key?: string) => {
    if (!key) return;
    setTimeout(() => cellRefs.current[`${rowIdx}-${key}`]?.focus(), 0);
  };

  const advanceAfterRow = (rowIdx: number) => {
    const next = rowIdx + 1;
    if (next >= rows.length) {
      setRows(prev => [...prev, emptyRow(Date.now(), defaultParent, defaultNature)]);
    }
    focusCell(next, cols[0].key);
  };

  const handleCellKey = (e: KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const col = cols[colIdx];
    const nextCol = cols[colIdx + 1];
    const prevCol = cols[colIdx - 1];
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      if (colIdx === cols.length - 1) advanceAfterRow(rowIdx);
      else focusCell(rowIdx, nextCol?.key);
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (prevCol) focusCell(rowIdx, prevCol.key);
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); focusCell(rowIdx + 1, col.key);
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); if (rowIdx > 0) focusCell(rowIdx - 1, col.key);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.length);
    setRows(prev => {
      const next = [...prev];
      lines.forEach((line, li) => {
        const cells = line.split("\t");
        const target = rowIdx + li;
        while (next.length <= target) next.push(emptyRow(Date.now() + target, defaultParent, defaultNature));
        const r = { ...next[target] };
        cells.forEach((cell, ci) => {
          const c = cols[colIdx + ci];
          if (!c) return;
          (r as any)[c.key] = cell.trim();
        });
        const p = parentByName.get(r.parent.toLowerCase());
        if (p) r.nature = p.nature;
        next[target] = r;
      });
      return next;
    });
    toast.success(`Pasted ${lines.length} rows`);
  };

  const addRow = () => setRows(p => [...p, emptyRow(Date.now(), defaultParent, defaultNature)]);
  const deleteRow = (idx: number) => setRows(p => p.filter((_, i) => i !== idx));

  const applyDefaultParent = (name: string) => {
    setDefaultParent(name);
    setUnderQuery(name);
    const p = parentByName.get(name.toLowerCase());
    const nat = p?.nature ?? defaultNature;
    if (p) setDefaultNature(p.nature);
    setRows(prev => prev.map(r => r.name.trim() ? r : { ...r, parent: name, nature: nat }));
  };

  const visibleRows = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.parent.toLowerCase().includes(q) ||
      r.alias.toLowerCase().includes(q));
  }, [rows, filter]);

  const validate = (): GroupRow[] | null => {
    const valid = rows.filter(r => r.name.trim());
    if (!valid.length) { toast.error("Nothing to save"); return null; }
    for (let i = 0; i < valid.length; i++) {
      if (!valid[i].parent.trim()) {
        toast.error(`Row ${i + 1}: Under (parent group) is required`);
        return null;
      }
    }
    const names = new Set<string>();
    for (const r of valid) {
      const key = r.name.trim().toLowerCase();
      if (names.has(key)) { toast.error(`Duplicate group name: ${r.name}`); return null; }
      names.add(key);
    }
    return valid;
  };

  const save = () => {
    const v = validate();
    if (!v) return;
    toast.success(`${v.length} group${v.length > 1 ? "s" : ""} created`);
    // Reset to fresh rows
    setRows(Array.from({ length: 8 }, (_, i) => emptyRow(i + 1, defaultParent, defaultNature)));
  };

  const filledCount = rows.filter(r => r.name.trim()).length;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Toaster />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-input hover:bg-accent"
            aria-label="Back home"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            CREATE
          </Badge>
          <FolderTree className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Multi Group Creation</h1>
          <Badge variant="outline" className="text-[10px]">Tally Style</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-muted-foreground mr-3">
            <Keyboard className="h-3 w-3" />
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono">Enter/Tab</kbd> next ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono">↑↓</kbd> move ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono">Ctrl+A</kbd> save ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono">F4</kbd> Under
          </div>
          <Button size="sm" onClick={save} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save (Ctrl+A)
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/"><X className="h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </header>

      {/* Default Under row */}
      <div className="px-6 py-2 border-b border-border bg-secondary/30 flex flex-wrap items-center gap-3 relative">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">
          Under (F4)
        </Label>
        <div className="w-72 relative">
          <Input
            ref={topUnderRef}
            value={underQuery}
            placeholder="Start typing parent group..."
            onFocus={() => { setUnderOpen(true); setUnderActive(0); }}
            onBlur={() => setTimeout(() => setUnderOpen(false), 150)}
            onChange={e => { setUnderQuery(e.target.value); setUnderOpen(true); setUnderActive(0); }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setUnderActive(p => Math.min(p + 1, underSuggestions.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setUnderActive(p => Math.max(p - 1, 0)); }
              else if (e.key === "Enter" || e.key === "Tab") {
                const pick = underSuggestions[underActive] ?? underQuery.trim();
                if (pick) {
                  e.preventDefault();
                  applyDefaultParent(pick);
                  setUnderOpen(false);
                  setTimeout(() => cellRefs.current["0-name"]?.focus(), 0);
                }
              } else if (e.key === "Escape") setUnderOpen(false);
            }}
            className="h-8 text-sm"
          />
          {underOpen && underSuggestions.length > 0 && (
            <div className="absolute z-30 top-full left-0 mt-1 w-full max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
              {underSuggestions.map((g, i) => {
                const p = parentByName.get(g.toLowerCase());
                return (
                  <button
                    key={g}
                    type="button"
                    onMouseDown={() => {
                      applyDefaultParent(g);
                      setUnderOpen(false);
                      setTimeout(() => cellRefs.current["0-name"]?.focus(), 0);
                    }}
                    onMouseEnter={() => setUnderActive(i)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-xs ${i === underActive ? "bg-accent" : "hover:bg-secondary"}`}
                  >
                    <span className="font-medium">{g}</span>
                    {p && (
                      <span className={`ml-2 px-1.5 py-0.5 rounded border text-[10px] ${NATURE_STYLE[p.nature]}`}>
                        {p.nature}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {defaultParent && (
          <Badge variant="outline" className={`text-[10px] ${NATURE_STYLE[defaultNature]}`}>
            Default Nature: {defaultNature}
          </Badge>
        )}
        <div className="ml-auto relative max-w-xs w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter rows…"
            className="pl-9 h-8 text-sm"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-secondary/80 border-b border-border">
                <th className="w-10 px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase">#</th>
                {cols.map(c => (
                  <th key={c.key} className={`${c.w} text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider`}>
                    {c.label}{c.required && <span className="text-destructive ml-0.5">*</span>}
                  </th>
                ))}
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rIdx) => {
                const realIdx = rows.indexOf(row);
                return (
                  <tr key={row.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors group">
                    <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums text-center">{rIdx + 1}</td>
                    {cols.map((c, cIdx) => (
                      <td key={c.key} className="px-1 py-1 relative">
                        {c.key === "nature" ? (
                          <select
                            ref={el => { cellRefs.current[`${realIdx}-${c.key}`] = el as unknown as HTMLInputElement; }}
                            value={row.nature}
                            onChange={e => setCell(realIdx, "nature", e.target.value)}
                            onKeyDown={e => handleCellKey(e as unknown as KeyboardEvent<HTMLInputElement>, realIdx, cIdx)}
                            className={`h-8 w-full rounded-md border bg-background px-2 text-xs font-medium ${NATURE_STYLE[row.nature]}`}
                          >
                            <option value="Assets">Assets</option>
                            <option value="Liabilities">Liabilities</option>
                            <option value="Income">Income</option>
                            <option value="Expenses">Expenses</option>
                          </select>
                        ) : c.key === "parent" ? (
                          <ParentCell
                            value={row.parent}
                            parents={parentNames}
                            parentByName={parentByName}
                            onChange={v => setCell(realIdx, "parent", v)}
                            onCommit={v => { setCell(realIdx, "parent", v); focusCell(realIdx, cols[cIdx + 1]?.key); }}
                            inputRef={el => { cellRefs.current[`${realIdx}-${c.key}`] = el; }}
                            onKeyDown={e => handleCellKey(e, realIdx, cIdx)}
                            required={!row.parent && !!row.name}
                          />
                        ) : (
                          <Input
                            ref={el => { cellRefs.current[`${realIdx}-${c.key}`] = el; }}
                            value={(row as any)[c.key]}
                            onChange={e => setCell(realIdx, c.key, e.target.value)}
                            onKeyDown={e => handleCellKey(e, realIdx, cIdx)}
                            onPaste={e => handlePaste(e, realIdx, cIdx)}
                            placeholder={c.required ? "Required" : ""}
                            className={`h-8 text-sm border-transparent focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-md ${c.required && !(row as any)[c.key] && row.name ? "border-destructive/50" : ""
                              }`}
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-1">
                      <button
                        type="button"
                        onClick={() => deleteRow(realIdx)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-destructive hover:bg-destructive/10"
                        aria-label="Delete row"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-border bg-secondary/30">
            <button
              type="button"
              onClick={addRow}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add Row (or press Enter on last cell)
            </button>
          </div>
        </div>
      </div>

      {/* Footer summary */}
      <footer className="border-t border-border bg-card px-6 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground tabular-nums">{filledCount}</span> group{filledCount === 1 ? "" : "s"} to be created
          {defaultParent && <span> · Under <span className="text-foreground font-medium">{defaultParent}</span></span>}
        </div>
        <div>Tally Prime–style bulk create</div>
      </footer>
    </div>
  );
}

// ─── Parent (Under) cell ──────────────────────────────────────────
function ParentCell({
  value, parents, parentByName, onChange, onCommit, inputRef, onKeyDown, required,
}: {
  value: string;
  parents: string[];
  parentByName: Map<string, ParentGroup>;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  required: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? parents.filter(n => n.toLowerCase().includes(q))
        .sort((a, b) => a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q))
      : parents;
    return list.slice(0, 10);
  }, [parents, value]);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        placeholder="Select parent…"
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={e => {
          if (open && e.key === "ArrowDown") { e.preventDefault(); setActive(p => Math.min(p + 1, suggestions.length - 1)); return; }
          if (open && e.key === "ArrowUp") { e.preventDefault(); setActive(p => Math.max(p - 1, 0)); return; }
          if (open && (e.key === "Enter" || e.key === "Tab")) {
            const pick = suggestions[active];
            if (pick) {
              e.preventDefault();
              onCommit(pick);
              setOpen(false);
              return;
            }
          }
          if (e.key === "Escape") { setOpen(false); return; }
          onKeyDown(e);
        }}
        className={`h-8 text-sm border-transparent focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-md ${required ? "border-destructive/50" : ""
          }`}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 top-full left-0 mt-1 w-72 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
          {suggestions.map((g, i) => {
            const p = parentByName.get(g.toLowerCase());
            return (
              <button
                key={g}
                type="button"
                onMouseDown={() => { onCommit(g); setOpen(false); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-xs ${i === active ? "bg-accent" : "hover:bg-secondary"}`}
              >
                <span className="font-medium">{g}</span>
                {p && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded border text-[10px] ${NATURE_STYLE[p.nature]}`}>
                    {p.nature}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface SelectorChoice {
  mode: MultiMode;
  presetGroup?: string;
  titleOverride?: string;
}

interface SelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (choice: SelectorChoice) => void;
}

type MenuItem = { kind: "leaf"; label: string; desc: string; choice: SelectorChoice };

const MAIN_MENU: MenuItem[] = [
  { kind: "leaf", label: "Multi Create", desc: "Create multiple group in a single grid", choice: { mode: "create" } },
  { kind: "leaf", label: "Multi Alter", desc: "Bulk edit existing group inline", choice: { mode: "alter" } },
];

export function MultiGroupSelector({ open, onClose, onSelect }: SelectorProps) {
  const [active, setActive] = useState(0);
  const [submenuIdx, setSubmenuIdx] = useState<number | null>(null);
  const [subActive, setSubActive] = useState(0);

  useEffect(() => {
    if (!open) { setSubmenuIdx(null); setActive(0); return; }
    setActive(0); setSubmenuIdx(null); setSubActive(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (submenuIdx !== null) setSubmenuIdx(null);
        else onClose();
        return;
      }
      if (submenuIdx === null) {
        if (e.key === "ArrowDown") { e.preventDefault(); setActive(p => (p + 1) % MAIN_MENU.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive(p => (p - 1 + MAIN_MENU.length) % MAIN_MENU.length); }
        else if (e.key === "Enter" || e.key === "ArrowRight") {
          e.preventDefault();
          const it = MAIN_MENU[active];
          if (it.kind === "leaf") onSelect(it.choice);
          else { setSubmenuIdx(active); setSubActive(0); }
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, active, submenuIdx, subActive, onClose, onSelect]);

  const submenu = submenuIdx !== null ? (MAIN_MENU[submenuIdx] as Extract<MenuItem, { kind: "submenu" }>) : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] backdrop-blur-[1px] bg-black/25 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-2">
              {!submenu && MAIN_MENU.map((o, i) => (
                <button
                  key={o.label}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    if (o.kind === "leaf") onSelect(o.choice);
                    else { setSubmenuIdx(i); setSubActive(0); }
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-3 ${active === i ? "bg-primary/10 text-foreground" : "hover:bg-secondary/50"
                    }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">{o.label}</div>
                    <div className="text-[11px] text-muted-foreground">{o.desc}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">{i + 1}</Badge>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

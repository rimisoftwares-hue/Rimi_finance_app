import { useEffect, useMemo, useRef, useState, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Plus, Search, Trash2, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  defaultDrCrFor, isSundryGroup, natureOf, dialogForGroup,
  type ConfigDialogKind, type FeatureFlags,
} from "../lib/accounting/groupBehavior";

export type MultiMode = "create" | "createCredit" | "alter";

export interface MultiRow {
  id: number;
  name: string;
  group: string;
  opening: string;
  drCr: "Dr" | "Cr";
  /** Optional sidecar data captured via sub-dialogs (not shown in grid) */
  creditLimit?: string;
  dueDays?: string;
  remarks?: string;
  extras?: Record<string, unknown>;
}

const emptyRow = (id: number, group = ""): MultiRow => ({
  id, name: "", group, opening: "",
  drCr: group ? defaultDrCrFor(group) : "Dr",
});

interface Props {
  mode: MultiMode;
  groups: string[];
  existing?: { id: number; name: string; group: string; openingBalance: number; balanceType: "Dr" | "Cr" }[];
  onClose: () => void;
  onSave: (rows: MultiRow[]) => void;
  presetGroup?: string;
  titleOverride?: string;
  /** Feature flags toggling which sub-dialogs auto-open. Defaults on for standard ones. */
  features?: FeatureFlags;
}

export function MultiLedger({
  mode, groups, existing = [], onClose, onSave, presetGroup, titleOverride,
  features = { banking: true, gst: true, assetInfo: true, loanInfo: true, costCentre: true },
}: Props) {
  const isAlter = mode === "alter";

  const [defaultGroup, setDefaultGroup] = useState<string>(presetGroup || "");
  const [rows, setRows] = useState<MultiRow[]>(() => {
    if (isAlter) {
      return existing
        .filter(e => !presetGroup || e.group === presetGroup)
        .map(e => ({
          id: e.id, name: e.name, group: e.group,
          opening: e.openingBalance.toString(), drCr: e.balanceType,
        }));
    }
    return Array.from({ length: 5 }, (_, i) => emptyRow(i + 1, presetGroup || ""));
  });
  const [filter, setFilter] = useState("");
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const topUnderRef = useRef<HTMLInputElement>(null);

  // ── Auto-suggest state for the top "Under" field ───────────────
  const [underQuery, setUnderQuery] = useState<string>(presetGroup || "");
  const [underOpen, setUnderOpen] = useState(false);
  const [underActive, setUnderActive] = useState(0);
  const underSuggestions = useMemo(() => {
    const q = underQuery.trim().toLowerCase();
    if (!q) return groups.slice(0, 15);
    return groups
      .filter(g => g.toLowerCase().includes(q))
      .sort((a, b) => {
        const ai = a.toLowerCase().indexOf(q);
        const bi = b.toLowerCase().indexOf(q);
        return ai - bi || a.localeCompare(b);
      })
      .slice(0, 15);
  }, [groups, underQuery]);

  // Grid columns — Credit Limit / Due Days / Remarks removed per Tally Prime spec.
  const cols: { key: keyof MultiRow; label: string; w: string; type?: string; required?: boolean }[] = [
    { key: "name", label: "Ledger Name", w: "min-w-[260px]", required: true },
    { key: "group", label: "Under", w: "min-w-[200px]", required: true },
    { key: "opening", label: "Opening Bal", w: "w-[160px]", type: "number" },
    { key: "drCr", label: "Dr/Cr", w: "w-[80px]" },
  ];

  const visibleRows = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q));
  }, [rows, filter]);

  // Focus the top Under field first if empty, else first name cell.
  useEffect(() => {
    setTimeout(() => {
      if (!isAlter && !defaultGroup) topUnderRef.current?.focus();
      else cellRefs.current["0-name"]?.focus();
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts (Tally Prime style)
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      // Esc closes
      if (e.key === "Escape") { onClose(); return; }
      // Ctrl+A → save (Tally accept). Don't fire when an input has selection.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
          // allow Select-All when modifier pressed inside fields by ignoring
        }
        e.preventDefault(); save(); return;
      }
      // Ctrl+S also saves (common alt)
      if (e.ctrlKey && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
      // F4 → focus Under
      if (e.key === "F4") {
        e.preventDefault();
        topUnderRef.current?.focus();
        topUnderRef.current?.select();
        setUnderOpen(true);
      }
      // F2 / F3 → reserved (Period / Company) — bubble as no-op to avoid browser default
      if (e.key === "F2" || e.key === "F3") e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, defaultGroup]);

  const setCell = (idx: number, key: keyof MultiRow, value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [key]: value } as MultiRow;
      if (key === "group") next.drCr = defaultDrCrFor(value);
      return next;
    }));
  };

  const focusCell = (rowIdx: number, key?: string) => {
    if (!key) return;
    setTimeout(() => cellRefs.current[`${rowIdx}-${key}`]?.focus(), 0);
  };

  // ── Sub-dialog plumbing ────────────────────────────────────────
  const [activeDialog, setActiveDialog] = useState<{ kind: ConfigDialogKind; rowIdx: number } | null>(null);

  const maybeOpenDialogFor = (rowIdx: number) => {
    const r = rows[rowIdx];
    if (!r || !r.name.trim()) return false;
    const opening = parseFloat(r.opening) || 0;
    const kind = dialogForGroup(r.group || defaultGroup, opening, features);
    if (kind) {
      setActiveDialog({ kind, rowIdx });
      return true;
    }
    return false;
  };

  const advanceAfterRow = (rowIdx: number) => {
    const nextRow = rowIdx + 1;
    if (!isAlter && nextRow >= rows.length) {
      setRows(prev => [...prev, emptyRow(Date.now(), defaultGroup)]);
    }
    focusCell(nextRow, cols[0].key);
  };

  const handleCellKey = (e: KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const col = cols[colIdx];
    const nextCol = cols[colIdx + 1];
    const prevCol = cols[colIdx - 1];

    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      // Opening Balance is the workflow trigger: after entering it, try to open a dialog.
      if (col.key === "opening") {
        const opened = maybeOpenDialogFor(rowIdx);
        if (opened) return;
        advanceAfterRow(rowIdx);
        return;
      }
      if (nextCol) focusCell(rowIdx, nextCol.key);
      else advanceAfterRow(rowIdx);
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (prevCol) focusCell(rowIdx, prevCol.key);
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); focusCell(rowIdx + 1, col.key);
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); if (rowIdx > 0) focusCell(rowIdx - 1, col.key);
    } else if (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) {
      e.preventDefault(); if (nextCol) focusCell(rowIdx, nextCol.key);
    } else if (e.key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault(); if (prevCol) focusCell(rowIdx, prevCol.key);
    }
  };

  // Excel paste support (covers only visible columns now)
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
        while (next.length <= target) next.push(emptyRow(Date.now() + target, defaultGroup));
        const r = { ...next[target] };
        cells.forEach((cell, ci) => {
          const c = cols[colIdx + ci];
          if (!c) return;
          if (c.key === "drCr") (r as any)[c.key] = cell.toLowerCase().startsWith("c") ? "Cr" : "Dr";
          else (r as any)[c.key] = cell.trim();
        });
        if (r.group) r.drCr = defaultDrCrFor(r.group);
        next[target] = r;
      });
      return next;
    });
    toast.success(`Pasted ${lines.length} rows`);
  };

  const addRow = () => setRows(p => [...p, emptyRow(Date.now(), defaultGroup)]);
  const deleteRow = (idx: number) => setRows(p => p.filter((_, i) => i !== idx));

  const applyDefaultUnder = (ng: string) => {
    setDefaultGroup(ng);
    setUnderQuery(ng);
    setRows(prev => prev.map(r => r.name.trim() ? r : {
      ...r,
      group: ng || r.group,
      drCr: ng ? defaultDrCrFor(ng) : r.drCr,
    }));
  };

  const validate = (): MultiRow[] | null => {
    const valid = rows.filter(r => r.name.trim());
    const errors: string[] = [];
    valid.forEach((r, i) => {
      if (!r.group.trim()) errors.push(`Row ${i + 1}: Under group required`);
    });
    if (errors.length) { toast.error(errors[0]); return null; }
    if (!valid.length) { toast.error("Nothing to save"); return null; }
    return valid;
  };

  const save = () => {
    const v = validate();
    if (!v) return;
    onSave(v);
    toast.success(`${v.length} ledger${v.length > 1 ? "s" : ""} ${isAlter ? "updated" : "created"}`);
    onClose();
  };

  const title = titleOverride
    ?? (mode === "create" ? "Multi Ledger Create"
      : mode === "createCredit" ? "Multi Ledger Create (Credit Limits)"
        : "Multi Ledger Alter (Bulk Edit)");

  // ── Render ─────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Badge className="bg-primary/10 text-primary border-primary/30">{isAlter ? "ALTER" : "CREATE"}</Badge>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground mr-3">
            <Keyboard className="h-3 w-3" />
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Enter/Tab</kbd> next ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">↑↓</kbd> move ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Ctrl+A</kbd> save ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">F4</kbd> Under ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Esc</kbd> close
          </div>
          <Button size="sm" onClick={save} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Save (Ctrl+A)</Button>
          <Button size="sm" variant="outline" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Tally-style top header: Under : <auto-suggest> */}
      {!isAlter && (
        <div className="px-6 py-2 border-b border-border bg-secondary/30 flex items-center gap-3 relative">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">
            Under (F4)
          </Label>
          <div className="w-72 relative">
            <Input
              ref={topUnderRef}
              value={underQuery}
              placeholder="Start typing group name..."
              onFocus={() => { setUnderOpen(true); setUnderActive(0); }}
              onBlur={() => setTimeout(() => setUnderOpen(false), 150)}
              onChange={(e) => { setUnderQuery(e.target.value); setUnderOpen(true); setUnderActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setUnderActive(p => Math.min(p + 1, underSuggestions.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setUnderActive(p => Math.max(p - 1, 0)); }
                else if (e.key === "Enter" || e.key === "Tab") {
                  const pick = underSuggestions[underActive] ?? (groups.includes(underQuery.trim()) ? underQuery.trim() : "");
                  if (pick) {
                    e.preventDefault();
                    applyDefaultUnder(pick);
                    setUnderOpen(false);
                    setTimeout(() => cellRefs.current["0-name"]?.focus(), 0);
                  }
                } else if (e.key === "Escape") { setUnderOpen(false); }
              }}
              className="h-8 text-sm"
            />
            {underOpen && underSuggestions.length > 0 && (
              <div className="absolute z-30 top-full left-0 mt-0.5 w-full max-h-56 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                {underSuggestions.map((g, i) => (
                  <button
                    key={g}
                    onMouseDown={() => { applyDefaultUnder(g); setUnderOpen(false); setTimeout(() => cellRefs.current["0-name"]?.focus(), 0); }}
                    onMouseEnter={() => setUnderActive(i)}
                    className={`block w-full text-left px-3 py-1.5 text-xs ${i === underActive ? "bg-primary/10 text-foreground" : "hover:bg-secondary"}`}
                  >
                    {g}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {natureOf(g) || "—"} · {defaultDrCrFor(g)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {defaultGroup && (
            <Badge variant="outline" className="text-[10px]">
              {natureOf(defaultGroup) || "—"} · Default Dr/Cr: {defaultDrCrFor(defaultGroup)}
            </Badge>
          )}
        </div>
      )}

      {/* Filter bar (alter only) */}
      {isAlter && (
        <div className="px-6 py-2 border-b border-border bg-card/50">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Search ledger or group..."
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="dashboard-card !p-0 overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-secondary/80 border-b border-border">
                <th className="w-10 px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase">#</th>
                {cols.map(c => (
                  <th key={c.key} className={`${c.w} text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider`}>
                    {c.label}
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
                        {c.key === "drCr" ? (
                          <button
                            ref={el => (cellRefs.current[`${realIdx}-${c.key}`] = el as any)}
                            onClick={() => setCell(realIdx, "drCr", row.drCr === "Dr" ? "Cr" : "Dr")}
                            onKeyDown={(e: any) => {
                              if (e.key === " " || e.key === "Enter") {
                                e.preventDefault();
                                setCell(realIdx, "drCr", row.drCr === "Dr" ? "Cr" : "Dr");
                              } else handleCellKey(e, realIdx, cIdx);
                            }}
                            className={`w-full h-8 rounded-md text-xs font-bold border ${row.drCr === "Dr" ? "bg-primary/10 text-primary border-primary/30" : "bg-income/10 text-income border-income/30"
                              }`}
                          >
                            {row.drCr}
                          </button>
                        ) : c.key === "group" ? (
                          <GroupCell
                            value={row.group}
                            groups={groups}
                            onChange={(v) => setCell(realIdx, "group", v)}
                            onCommit={(v) => { setCell(realIdx, "group", v); focusCell(realIdx, cols[cIdx + 1]?.key); }}
                            inputRef={(el) => (cellRefs.current[`${realIdx}-${c.key}`] = el)}
                            onKeyDown={(e) => handleCellKey(e, realIdx, cIdx)}
                            onPaste={(e) => handlePaste(e, realIdx, cIdx)}
                          />
                        ) : (
                          <Input
                            ref={el => { cellRefs.current[`${realIdx}-${c.key}`] = el; }}
                            type={c.type || "text"}
                            value={(row as any)[c.key]}
                            onChange={e => setCell(realIdx, c.key, e.target.value)}
                            onKeyDown={e => handleCellKey(e, realIdx, cIdx)}
                            onPaste={e => handlePaste(e, realIdx, cIdx)}
                            placeholder={c.required ? "Required" : ""}
                            className={`h-8 text-sm border-transparent focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-md ${c.type === "number" ? "font-mono tabular-nums text-right" : ""
                              } ${c.required && !(row as any)[c.key] && row.name ? "border-expense/40" : ""}`}
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-1">
                      <button
                        onClick={() => deleteRow(realIdx)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-expense hover:bg-expense/10"
                      ><Trash2 className="h-3 w-3" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!isAlter && (
            <div className="px-3 py-2 border-t border-border bg-secondary/30">
              <button onClick={addRow} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add Row (or press Enter on last cell)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer summary */}
      <div className="px-6 py-2 border-t border-border bg-card flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {rows.filter(r => r.name.trim()).length} ledger{rows.filter(r => r.name.trim()).length !== 1 ? "s" : ""} ready · {rows.length} rows
        </span>
        <span className="text-muted-foreground">
          Tip: Paste from Excel directly into any cell
        </span>
      </div>

      {/* ── Configuration sub-dialogs ─────────────────────────── */}
      {activeDialog && (
        <ConfigDialogHost
          kind={activeDialog.kind}
          row={rows[activeDialog.rowIdx]}
          onCancel={() => setActiveDialog(null)}
          onSave={(extras) => {
            setRows(prev => prev.map((r, i) => i === activeDialog.rowIdx
              ? { ...r, extras: { ...(r.extras || {}), ...extras } } : r));
            const idx = activeDialog.rowIdx;
            setActiveDialog(null);
            setTimeout(() => advanceAfterRow(idx), 0);
          }}
        />
      )}
    </motion.div>
  );
}

/* ─────────────── Per-row Group cell with auto-suggest ────────────── */
function GroupCell({
  value, groups, onChange, onCommit, inputRef, onKeyDown, onPaste,
}: {
  value: string;
  groups: string[];
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? groups.filter(g => g.toLowerCase().includes(q))
      : groups;
    return list.slice(0, 12);
  }, [groups, value]);

  return (
    <>
      <Input
        ref={inputRef}
        value={value}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (open && suggestions.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(p => Math.min(p + 1, suggestions.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive(p => Math.max(p - 1, 0)); return; }
            if (e.key === "Enter" || e.key === "Tab") {
              const pick = suggestions[active];
              if (pick) { e.preventDefault(); setOpen(false); onCommit(pick); return; }
            }
          }
          onKeyDown(e);
        }}
        onPaste={onPaste}
        placeholder="Under..."
        className="h-8 text-sm border-transparent focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-md"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 top-full left-0 mt-0.5 w-56 max-h-44 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
          {suggestions.map((g, i) => (
            <button
              key={g}
              onMouseDown={() => { setOpen(false); onCommit(g); }}
              onMouseEnter={() => setActive(i)}
              className={`block w-full text-left px-3 py-1.5 text-xs ${i === active ? "bg-primary/10 text-foreground" : "hover:bg-secondary"}`}
            >{g}</button>
          ))}
        </div>
      )}
    </>
  );
}

/* ─────────────── Config Dialog Host (renders correct dialog) ─────────────── */
function ConfigDialogHost({
  kind, row, onCancel, onSave,
}: {
  kind: ConfigDialogKind;
  row: MultiRow;
  onCancel: () => void;
  onSave: (extras: Record<string, unknown>) => void;
}) {
  if (!kind) return null;
  if (kind === "billwise") return <BillwiseDialog row={row} onCancel={onCancel} onSave={onSave} />;
  if (kind === "bank") return <SimpleFormDialog
    title={`Bank Details – ${row.name}`}
    fields={[
      { k: "bankName", label: "Bank Name" },
      { k: "branchName", label: "Branch Name" },
      { k: "accountNumber", label: "Account Number" },
      { k: "ifsc", label: "IFSC Code" },
      { k: "accountType", label: "Account Type" },
      { k: "openingBankBalance", label: "Opening Bank Balance", type: "number" },
      { k: "chequeBookConfig", label: "Cheque Book Configuration" },
    ]} onCancel={onCancel} onSave={onSave} />;
  if (kind === "gst") return <SimpleFormDialog
    title={`GST / Tax Configuration – ${row.name}`}
    fields={[
      { k: "gstType", label: "GST Type" },
      { k: "taxNature", label: "Tax Nature" },
      { k: "taxPercent", label: "Tax Percentage", type: "number" },
      { k: "cgst", label: "CGST %", type: "number" },
      { k: "sgst", label: "SGST %", type: "number" },
      { k: "igst", label: "IGST %", type: "number" },
      { k: "cess", label: "Cess %", type: "number" },
      { k: "applicableFrom", label: "Applicable From", type: "date" },
      { k: "reverseCharge", label: "Reverse Charge Applicability" },
    ]} onCancel={onCancel} onSave={onSave} />;
  if (kind === "asset") return <SimpleFormDialog
    title={`Asset Information – ${row.name}`}
    fields={[
      { k: "assetCategory", label: "Asset Category" },
      { k: "assetCode", label: "Asset Code" },
      { k: "purchaseDate", label: "Purchase Date", type: "date" },
      { k: "depMethod", label: "Depreciation Method" },
      { k: "depRate", label: "Depreciation Rate", type: "number" },
      { k: "usefulLife", label: "Useful Life (years)", type: "number" },
    ]} onCancel={onCancel} onSave={onSave} />;
  if (kind === "loan") return <SimpleFormDialog
    title={`Loan Details – ${row.name}`}
    fields={[
      { k: "loanType", label: "Loan Type" },
      { k: "loanReference", label: "Loan Reference" },
      { k: "interestRate", label: "Interest Rate", type: "number" },
      { k: "interestMethod", label: "Interest Calculation Method" },
      { k: "counterparty", label: "Lender / Borrower" },
      { k: "startDate", label: "Start Date", type: "date" },
    ]} onCancel={onCancel} onSave={onSave} />;
  if (kind === "costCentre") return <SimpleFormDialog
    title={`Cost Centre Configuration – ${row.name}`}
    fields={[
      { k: "allocRevenue", label: "Allocate Revenue Items" },
      { k: "allocNonRevenue", label: "Allocate Non-Revenue Items" },
      { k: "ccCategory", label: "Cost Centre Category" },
      { k: "defaultCC", label: "Default Cost Centre" },
      { k: "branchCode", label: "Branch Code" },
      { k: "reporting", label: "Reporting Structure" },
    ]} onCancel={onCancel} onSave={onSave} />;
  if (kind === "payroll") return <SimpleFormDialog
    title={`Payroll Configuration – ${row.name}`}
    fields={[
      { k: "employeeGroup", label: "Employee Group" },
      { k: "salaryStructure", label: "Salary Structure" },
      { k: "attendanceType", label: "Attendance Type" },
      { k: "ccAllocation", label: "Cost Centre Allocation" },
      { k: "payrollCategory", label: "Payroll Category" },
    ]} onCancel={onCancel} onSave={onSave} />;
  if (kind === "inventory") return <SimpleFormDialog
    title={`Inventory Configuration – ${row.name}`}
    fields={[
      { k: "inventoryIntegration", label: "Inventory Integration" },
      { k: "defaultStockGroup", label: "Default Stock Group" },
      { k: "valuationMethod", label: "Valuation Method" },
      { k: "costingMethod", label: "Costing Method" },
    ]} onCancel={onCancel} onSave={onSave} />;
  if (kind === "interest") return <SimpleFormDialog
    title={`Interest Configuration – ${row.name}`}
    fields={[
      { k: "calcInterest", label: "Calculate Interest" },
      { k: "interestRate", label: "Interest Rate", type: "number" },
      { k: "calcStyle", label: "Calculation Style" },
      { k: "fromDate", label: "From Date", type: "date" },
      { k: "rounding", label: "Rounding Method" },
    ]} onCancel={onCancel} onSave={onSave} />;
  return null;
}

/* ─────────────── Generic keyboard-friendly form dialog ─────────────── */
function SimpleFormDialog({
  title, fields, onCancel, onSave,
}: {
  title: string;
  fields: { k: string; label: string; type?: string }[];
  onCancel: () => void;
  onSave: (extras: Record<string, unknown>) => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => { setTimeout(() => refs.current[fields[0]?.k]?.focus(), 30); }, []); // eslint-disable-line

  const submit = () => onSave(vals);
  const handleKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = fields[i + 1];
      if (next) refs.current[next.k]?.focus();
      else submit();
    } else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2">
          {fields.map((f, i) => (
            <div key={f.k} className="grid grid-cols-[160px_1fr] items-center gap-3">
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                ref={el => { refs.current[f.k] = el; }}
                type={f.type || "text"}
                value={vals[f.k] || ""}
                onChange={e => setVals(p => ({ ...p, [f.k]: e.target.value }))}
                onKeyDown={e => handleKey(e, i)}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel (Esc)</Button>
          <Button size="sm" onClick={submit}>Save & Continue (Ctrl+A)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── Bill-wise Breakup Dialog (Tally style) ─────────────── */
interface BillRow {
  id: number;
  date: string;
  reference: string;
  dueDays: string;
  amount: string;
  drCr: "Dr" | "Cr";
}

function BillwiseDialog({
  row, onCancel, onSave,
}: {
  row: MultiRow;
  onCancel: () => void;
  onSave: (extras: Record<string, unknown>) => void;
}) {
  const opening = parseFloat(row.opening) || 0;
  const today = new Date().toISOString().slice(0, 10);
  const [bills, setBills] = useState<BillRow[]>([
    { id: 1, date: today, reference: "", dueDays: "", amount: "", drCr: row.drCr },
  ]);
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const fieldOrder: (keyof BillRow)[] = ["date", "reference", "dueDays", "amount", "drCr"];

  useEffect(() => { setTimeout(() => refs.current["0-reference"]?.focus(), 30); }, []);

  const total = bills.reduce((s, b) => {
    const a = parseFloat(b.amount) || 0;
    return s + (b.drCr === row.drCr ? a : -a);
  }, 0);
  const onAccount = +(opening - total).toFixed(2);

  const setBill = (i: number, k: keyof BillRow, v: string) =>
    setBills(prev => prev.map((b, idx) => idx === i ? { ...b, [k]: v } as BillRow : b));

  const focusBill = (i: number, k: keyof BillRow) =>
    setTimeout(() => refs.current[`${i}-${k}`]?.focus(), 0);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>, rowIdx: number, fIdx: number) => {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      const next = fieldOrder[fIdx + 1];
      if (next) focusBill(rowIdx, next);
      else {
        // last col → next bill row
        const nextRow = rowIdx + 1;
        if (nextRow >= bills.length) {
          setBills(prev => [...prev, { id: Date.now(), date: today, reference: "", dueDays: "", amount: "", drCr: row.drCr }]);
        }
        focusBill(nextRow, "reference");
      }
    } else if (e.key === "Escape") { onCancel(); }
  };

  const submit = () => {
    const filled = bills.filter(b => b.reference.trim() && parseFloat(b.amount));
    if (!filled.length) { toast.error("Add at least one bill reference"); return; }
    if (Math.abs(total - opening) > 0.01) {
      toast.error(`Sum of bills (${total.toFixed(2)}) must equal Opening Balance (${opening.toFixed(2)})`);
      return;
    }
    onSave({ billwise: filled });
  };

  // Ctrl+A inside dialog → save
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "a") { e.preventDefault(); submit(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line
  }, [bills]);

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-3xl z-[80]">

        <DialogHeader>
          <DialogTitle>Bill-wise Breakup of {row.name}</DialogTitle>
        </DialogHeader>
        <div className="text-[11px] text-muted-foreground mb-2">
          Opening Balance: <span className="font-mono">{opening.toFixed(2)} {row.drCr}</span>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr>
                <th className="px-2 py-1 text-left text-[10px] uppercase text-muted-foreground">Date</th>
                <th className="px-2 py-1 text-left text-[10px] uppercase text-muted-foreground">Reference / Bill Name</th>
                <th className="px-2 py-1 text-left text-[10px] uppercase text-muted-foreground">Due Days</th>
                <th className="px-2 py-1 text-right text-[10px] uppercase text-muted-foreground">Amount</th>
                <th className="px-2 py-1 text-left text-[10px] uppercase text-muted-foreground">Dr/Cr</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b, i) => (
                <tr key={b.id} className="border-t border-border/40">
                  {fieldOrder.map((k, fIdx) => (
                    <td key={k} className="p-1">
                      {k === "drCr" ? (
                        <button
                          ref={el => (refs.current[`${i}-${k}`] = el as any)}
                          onClick={() => setBill(i, "drCr", b.drCr === "Dr" ? "Cr" : "Dr")}
                          onKeyDown={(e: any) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              setBill(i, "drCr", b.drCr === "Dr" ? "Cr" : "Dr");
                            } else handleKey(e, i, fIdx);
                          }}
                          className={`w-full h-7 rounded text-xs font-bold border ${b.drCr === "Dr" ? "bg-primary/10 text-primary border-primary/30" : "bg-income/10 text-income border-income/30"
                            }`}
                        >{b.drCr}</button>
                      ) : (
                        <Input
                          ref={el => { refs.current[`${i}-${k}`] = el; }}
                          type={k === "amount" || k === "dueDays" ? "number" : k === "date" ? "date" : "text"}
                          value={b[k] as string}
                          onChange={e => setBill(i, k, e.target.value)}
                          onKeyDown={e => handleKey(e, i, fIdx)}
                          className={`h-7 text-xs border-transparent focus:border-primary ${k === "amount" ? "text-right font-mono" : ""
                            }`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-secondary/30">
              <tr>
                <td colSpan={3} className="px-2 py-1 text-right text-[11px] text-muted-foreground">Total Allocated</td>
                <td className="px-2 py-1 text-right font-mono text-xs">{total.toFixed(2)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2 py-1 text-right text-[11px] text-muted-foreground">On Account</td>
                <td className={`px-2 py-1 text-right font-mono text-xs ${Math.abs(onAccount) > 0.01 ? "text-expense" : "text-income"}`}>{onAccount.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel (Esc)</Button>
          <Button size="sm" onClick={submit}>Accept (Ctrl+A)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Selector Popup (Ctrl+H) ── */
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

type MenuItem =
  | { kind: "leaf"; label: string; desc: string; choice: SelectorChoice }
  | { kind: "submenu"; label: string; desc: string; items: { label: string; desc: string; choice: SelectorChoice }[] };

const MAIN_MENU: MenuItem[] = [
  { kind: "leaf", label: "Multi Create", desc: "Create multiple ledgers in a single grid", choice: { mode: "create" } },
  { kind: "leaf", label: "Multi Alter", desc: "Bulk edit existing ledgers inline", choice: { mode: "alter" } },
  {
    kind: "submenu", label: "Credit Limit", desc: "Set credit limits in bulk by group",
    items: [
      { label: "Branch / Division", desc: "Apply credit limits to branch ledgers", choice: { mode: "createCredit", titleOverride: "Credit Limit – Branch / Division" } },
      { label: "Sundry Creditor", desc: "Set credit limit for creditors", choice: { mode: "alter", presetGroup: "Sundry Creditors", titleOverride: "Credit Limit – Sundry Creditors" } },
      { label: "Sundry Debtor", desc: "Set credit limit for debtors", choice: { mode: "alter", presetGroup: "Sundry Debtors", titleOverride: "Credit Limit – Sundry Debtors" } },
    ],
  },
];

export function MultiLedgerSelector({ open, onClose, onSelect }: SelectorProps) {
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
      } else {
        const items = (MAIN_MENU[submenuIdx] as Extract<MenuItem, { kind: "submenu" }>).items;
        if (e.key === "ArrowDown") { e.preventDefault(); setSubActive(p => (p + 1) % items.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSubActive(p => (p - 1 + items.length) % items.length); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); setSubmenuIdx(null); }
        else if (e.key === "Enter") { e.preventDefault(); onSelect(items[subActive].choice); }
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
          className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4"
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
            <div className="px-5 py-3 border-b border-border bg-secondary/40">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">
                  {submenu ? submenu.label : "Multi Ledger Creation"}
                </h3>
                <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-card font-mono text-muted-foreground border border-border">Ctrl+H</kbd>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {submenu ? "← Back · ↑ ↓ navigate · Enter select · Esc close" : "↑ ↓ navigate · Enter / → select · Esc close"}
              </p>
            </div>
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
                  {o.kind === "submenu"
                    ? <span className="text-muted-foreground text-xs">›</span>
                    : <Badge variant="outline" className="text-[10px] font-mono">{i + 1}</Badge>}
                </button>
              ))}
              {submenu && submenu.items.map((s, i) => (
                <button
                  key={s.label}
                  onMouseEnter={() => setSubActive(i)}
                  onClick={() => onSelect(s.choice)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-3 ${subActive === i ? "bg-primary/10 text-foreground" : "hover:bg-secondary/50"
                    }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">{i + 1}</Badge>
                </button>
              ))}
              {submenu && (
                <button
                  onClick={() => setSubmenuIdx(null)}
                  className="w-full text-left px-3 py-2 mt-1 rounded-lg text-[11px] text-muted-foreground hover:bg-secondary/40 border-t border-border"
                >
                  ← Back to Multi Ledger menu
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

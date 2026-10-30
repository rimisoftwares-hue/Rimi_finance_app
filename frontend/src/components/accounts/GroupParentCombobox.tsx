/**
 * GroupParentCombobox
 *
 * A searchable dropdown for the "Under (Parent Group)" field.
 * Shows two sections:
 *   1. Live DB groups (from existingGroups prop) — filtered by behaves_like_subledger if filterSubLedger=true
 *   2. Predefined default group suggestions (not yet in DB)
 *
 * On selection:
 *   - If a DB group → calls onSelect(group.id, group.group_name, group.nature)
 *   - If a predefined suggestion → calls onSelect(null, name, nature)
 *   - If "Primary" → calls onSelect(null, "__none__", null)
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Database, Sparkles, Check, X } from "lucide-react";
import { AccLedgerGroup } from "@/api/accounting";
import { PREDEFINED_GROUPS, PredefinedGroup } from "@/components/lib/accounting/predefinedGroups";

type GroupNature = "Assets" | "Liabilities" | "Income" | "Expenses";

interface Props {
  /** Currently selected display label (group_name or "__none__") */
  value: string;
  /** All existing DB groups to offer as options */
  existingGroups: AccLedgerGroup[];
  /**
   * When true, only shows DB groups where behaves_like_subledger === 1 or true.
   * When false (default), shows all existing groups.
   */
  filterSubLedger?: boolean;
  onSelect: (id: string | number | null, name: string, nature: GroupNature | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const NATURE_BADGE: Record<GroupNature, string> = {
  Assets:      "bg-blue-500/10 text-blue-600 border-blue-400/30",
  Liabilities: "bg-red-500/10  text-red-600  border-red-400/30",
  Income:      "bg-green-500/10 text-green-600 border-green-400/30",
  Expenses:    "bg-amber-500/10 text-amber-600 border-amber-400/30",
};

export function GroupParentCombobox({
  value,
  existingGroups,
  filterSubLedger = false,
  onSelect,
  placeholder = "Primary (No parent)",
  className = "",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // DB groups to display
  const dbOptions = useMemo(() => {
    const base = filterSubLedger
      ? existingGroups.filter(g => Boolean(g.behaves_like_subledger))
      : existingGroups;
    return base.sort((a, b) => a.group_name.localeCompare(b.group_name));
  }, [existingGroups, filterSubLedger]);

  // Predefined suggestions not already in DB (by name, case-insensitive)
  const dbNames = useMemo(
    () => new Set(existingGroups.map(g => g.group_name.toLowerCase())),
    [existingGroups]
  );

  const filteredDB = useMemo(() => {
    if (!query.trim()) return dbOptions;
    return dbOptions.filter(g =>
      g.group_name.toLowerCase().includes(query.toLowerCase())
    );
  }, [dbOptions, query]);

  const filteredPredefined = useMemo<PredefinedGroup[]>(() => {
    return PREDEFINED_GROUPS.filter(p => {
      const matchesQuery = !query.trim() || p.name.toLowerCase().includes(query.toLowerCase());
      const notInDB = !dbNames.has(p.name.toLowerCase());
      return matchesQuery && notInDB;
    });
  }, [query, dbNames]);

  const hasResults = filteredDB.length > 0 || filteredPredefined.length > 0;

  // Close on outside click
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

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
  };

  const selectDB = (g: AccLedgerGroup) => {
    onSelect(g.id, g.group_name, g.nature as GroupNature);
    setOpen(false);
    setQuery("");
  };

  const selectPredefined = (p: PredefinedGroup) => {
    onSelect(null, p.name, p.nature);
    setOpen(false);
    setQuery("");
  };

  const selectPrimary = () => {
    onSelect(null, "__none__", null);
    setOpen(false);
    setQuery("");
  };

  const displayLabel = value === "__none__" || !value ? placeholder : value;
  const isSet = value && value !== "__none__";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between
          px-3 py-2 h-10 text-sm rounded-md border
          bg-background transition-all duration-150
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-secondary/40"}
          ${open ? "border-primary ring-1 ring-primary/30" : "border-input"}
          ${!isSet ? "text-muted-foreground" : "text-foreground"}
        `}
      >
        <span className="truncate">{displayLabel}</span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {isSet && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); selectPrimary(); }}
              onKeyDown={e => e.key === "Enter" && selectPrimary()}
              className="rounded-full hover:bg-secondary p-0.5 text-muted-foreground hover:text-foreground"
              title="Clear"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="
          absolute z-50 top-full left-0 right-0 mt-1
          bg-popover border border-border rounded-lg shadow-xl
          overflow-hidden
          animate-in fade-in-0 zoom-in-95 duration-100
        ">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/30">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search groups..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onKeyDown={e => {
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
              }}
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {/* Primary option */}
            <div
              className={`
                flex items-center gap-2 px-3 py-2 text-sm cursor-pointer
                hover:bg-secondary/60 transition-colors
                ${!isSet ? "text-primary font-medium" : "text-muted-foreground"}
              `}
              onClick={selectPrimary}
            >
              {!isSet && <Check className="h-3.5 w-3.5 shrink-0" />}
              {isSet && <span className="w-3.5 shrink-0" />}
              <span>Primary (No parent)</span>
            </div>

            {/* DB Groups section */}
            {filteredDB.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-secondary/20 border-y border-border/40">
                  <Database className="h-3 w-3" /> Your Groups
                </div>
                {filteredDB.map(g => {
                  const selected = isSet && value === g.group_name;
                  return (
                    <div
                      key={g.id}
                      onClick={() => selectDB(g)}
                      className={`
                        flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer
                        hover:bg-secondary/60 transition-colors
                        ${selected ? "bg-primary/5 text-primary" : "text-foreground"}
                      `}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                        <span className="truncate">{g.group_name}</span>
                        {g.alias && <span className="text-[10px] text-muted-foreground shrink-0">({g.alias})</span>}
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${NATURE_BADGE[g.nature as GroupNature] || ""}`}>
                        {g.nature}
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {/* Predefined suggestions section */}
            {filteredPredefined.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-secondary/20 border-y border-border/40">
                  <Sparkles className="h-3 w-3" /> Suggested Groups
                </div>
                {filteredPredefined.map(p => {
                  const selected = isSet && value === p.name;
                  return (
                    <div
                      key={p.name}
                      onClick={() => selectPredefined(p)}
                      className={`
                        flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer
                        hover:bg-secondary/60 transition-colors
                        ${selected ? "bg-primary/5 text-primary" : "text-foreground"}
                      `}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                        <span className="truncate">{p.name}</span>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${NATURE_BADGE[p.nature] || ""}`}>
                        {p.nature}
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {/* Empty state */}
            {!hasResults && (
              <div className="flex flex-col items-center py-6 text-muted-foreground text-sm gap-1">
                <Search className="h-5 w-5 opacity-40" />
                <span>No groups match "{query}"</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

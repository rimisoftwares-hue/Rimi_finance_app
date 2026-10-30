// import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import { FolderTree, Keyboard, Plus, Save, Search, Trash2, X, Loader2 } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Badge } from "@/components/ui/badge";
// import { Label } from "@/components/ui/label";
// import { toast } from "sonner";
// import {
//   type Nature,
//   type ParentGroup,
// } from "@/components/lib/multi-group-data";
// import { PREDEFINED_GROUPS } from "@/components/lib/accounting/predefinedGroups";
// import {
//   getUnderDropdown,
//   multiCreateAccLedgerGroup,
//   multiUpdateAccLedgerGroup,
//   type UnderDropdownItem,
// } from "@/api/accounting";

// // ─── Types ──────────────────────────────────────────────────────────────────

// export type MultiGroupMode = "create" | "alter";

// interface GroupRow {
//   id: number;
//   dbId?: number;
//   name: string;
//   alias: string;
//   parent: string;
//   nature: Nature;
// }

// // ─── Helpers ─────────────────────────────────────────────────────────────────

// const emptyRow = (id: number, parent = "", nature: Nature = "Assets"): GroupRow => ({
//   id, name: "", alias: "", parent, nature,
// });

// const NATURE_STYLE: Record<Nature, string> = {
//   Assets: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
//   Liabilities: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
//   Income: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
//   Expenses: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
// };

// const COLS: { key: keyof GroupRow; label: string; w: string; required?: boolean }[] = [
//   { key: "name", label: "Name of Group", w: "min-w-[260px]", required: true },
//   { key: "alias", label: "Alias", w: "min-w-[180px]" },
//   { key: "parent", label: "Under", w: "min-w-[220px]", required: true },
// ];

// // ─── Props ───────────────────────────────────────────────────────────────────

// interface Props {
//   mode: MultiGroupMode;
//   presetGroup?: string;
//   customGroups?: Array<{
//     id: number;
//     dbId?: number;
//     name: string;
//     alias?: string;
//     parent: string | null;
//     nature: string;
//   }>;
//   onClose: () => void;
//   onSaved?: () => void;
// }

// // ─── Main Component ───────────────────────────────────────────────────────────

// export function MultiGroupPanel({ mode, presetGroup, customGroups = [], onClose, onSaved }: Props) {
//   const isAlter = mode === "alter";
//   const [underItems, setUnderItems] = useState<UnderDropdownItem[]>([]);
//   const [loadingParents, setLoadingParents] = useState(true);
//   const [saving, setSaving] = useState(false);

//   // Fetch under dropdown items (possible parents)
//   useEffect(() => {
//     setLoadingParents(true);
//     getUnderDropdown()
//       .then(res => {
//         if (res.data.success) {
//           setUnderItems(res.data.data);
//         }
//       })
//       .catch(err => {
//         toast.error("Failed to load parent groups list");
//         console.error(err);
//       })
//       .finally(() => {
//         setLoadingParents(false);
//       });
//   }, []);

//   // Merge PREDEFINED_GROUPS with API items: DB data takes priority, predefined fill the gaps.
//   const mergedParents = useMemo(() => {
//     const dbNames = new Set(underItems.map(i => i.group_name.toLowerCase()));
//     const predefinedOnly = PREDEFINED_GROUPS
//       .filter(p => !dbNames.has(p.name.toLowerCase()))
//       .map(p => ({ group_name: p.name, nature: p.nature as Nature, source: "predefined" as const }));
//     return [
//       ...underItems.map(i => ({ group_name: i.group_name, nature: i.nature as Nature, source: i.source })),
//       ...predefinedOnly,
//     ].sort((a, b) => a.group_name.localeCompare(b.group_name));
//   }, [underItems]);

//   const parentNames = useMemo(() => mergedParents.map(p => p.group_name), [mergedParents]);

//   const parentByNameMap = useMemo(() => {
//     const m = new Map<string, { nature: Nature }>();
//     mergedParents.forEach(item => {
//       m.set(item.group_name.toLowerCase(), { nature: item.nature });
//     });
//     return m;
//   }, [mergedParents]);

//   // ── Default parent (top "Under" field) ──────────────────────────────────────
//   const [defaultParent, setDefaultParent] = useState(presetGroup ?? "");
//   const [defaultNature, setDefaultNature] = useState<Nature>("Assets");

//   // ── Row initialisation ──────────────────────────────────────────────────────
//   const [rows, setRows] = useState<GroupRow[]>(() => {
//     if (isAlter) {
//       const source = presetGroup
//         ? customGroups.filter(g => g.parent === presetGroup)
//         : customGroups;
//       return source.map(g => ({
//         id: g.id,
//         dbId: g.dbId,
//         name: g.name,
//         alias: g.alias || "",
//         parent: g.parent || "",
//         nature: (g.nature === "Expense" ? "Expenses" : g.nature) as Nature
//       }));
//     }
//     return Array.from({ length: 8 }, (_, i) => emptyRow(i + 1, presetGroup ?? ""));
//   });

//   const [filter, setFilter] = useState("");

//   // ── Under auto-suggest (top field) ─────────────────────────────────────────
//   const [underQuery, setUnderQuery] = useState(presetGroup ?? "");
//   const [underOpen, setUnderOpen] = useState(false);
//   const [underActive, setUnderActive] = useState(0);
//   const topUnderRef = useRef<HTMLInputElement>(null);

//   const underSuggestions = useMemo(() => {
//     const q = underQuery.trim().toLowerCase();
//     const list = q
//       ? mergedParents.filter(p => p.group_name.toLowerCase().includes(q))
//         .sort((a, b) => a.group_name.toLowerCase().indexOf(q) - b.group_name.toLowerCase().indexOf(q))
//       : mergedParents;
//     return list.slice(0, 15);
//   }, [mergedParents, underQuery]);

//   // ── Cell refs ───────────────────────────────────────────────────────────────
//   const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

//   // ── Focus on mount ──────────────────────────────────────────────────────────
//   useEffect(() => {
//     setTimeout(() => {
//       if (!isAlter && !defaultParent) {
//         topUnderRef.current?.focus();
//       } else {
//         cellRefs.current["0-name"]?.focus();
//       }
//     }, 60);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // ── Global keyboard shortcuts ───────────────────────────────────────────────
//   useEffect(() => {
//     const h = (e: globalThis.KeyboardEvent) => {
//       if (e.key === "Escape") { onClose(); return; }
//       if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "a") {
//         e.preventDefault(); handleSave(); return;
//       }
//       if (e.ctrlKey && e.key.toLowerCase() === "s") {
//         e.preventDefault(); handleSave(); return;
//       }
//       if (e.key === "F4") {
//         e.preventDefault();
//         topUnderRef.current?.focus();
//         topUnderRef.current?.select();
//         setUnderOpen(true);
//       }
//     };
//     window.addEventListener("keydown", h);
//     return () => window.removeEventListener("keydown", h);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [rows, defaultParent]);

//   // ── Cell helpers ─────────────────────────────────────────────────────────────
//   const setCell = (idx: number, key: keyof GroupRow, value: string) => {
//     setRows(prev => prev.map((r, i) => {
//       if (i !== idx) return r;
//       const next = { ...r, [key]: value } as GroupRow;
//       if (key === "parent") {
//         const p = parentByNameMap.get(value.toLowerCase());
//         if (p) next.nature = p.nature;
//       }
//       return next;
//     }));
//   };

//   const focusCell = (rowIdx: number, key?: string) => {
//     if (!key) return;
//     setTimeout(() => cellRefs.current[`${rowIdx}-${key}`]?.focus(), 0);
//   };

//   const advanceAfterRow = (rowIdx: number) => {
//     const next = rowIdx + 1;
//     if (!isAlter && next >= rows.length) {
//       setRows(prev => [...prev, emptyRow(Date.now(), defaultParent, defaultNature)]);
//     }
//     focusCell(next, COLS[0].key);
//   };

//   const handleCellKey = (e: KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
//     const col = COLS[colIdx];
//     const nextCol = COLS[colIdx + 1];
//     const prevCol = COLS[colIdx - 1];
//     if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
//       e.preventDefault();
//       if (colIdx === COLS.length - 1) advanceAfterRow(rowIdx);
//       else focusCell(rowIdx, nextCol?.key);
//     } else if (e.key === "Tab" && e.shiftKey) {
//       e.preventDefault();
//       if (prevCol) focusCell(rowIdx, prevCol.key);
//     } else if (e.key === "ArrowDown") {
//       e.preventDefault(); focusCell(rowIdx + 1, col.key);
//     } else if (e.key === "ArrowUp") {
//       e.preventDefault(); if (rowIdx > 0) focusCell(rowIdx - 1, col.key);
//     }
//   };

//   const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
//     const text = e.clipboardData.getData("text");
//     if (!text.includes("\t") && !text.includes("\n")) return;
//     e.preventDefault();
//     const lines = text.replace(/\r/g, "").split("\n").filter(l => l.length);
//     setRows(prev => {
//       const next = [...prev];
//       lines.forEach((line, li) => {
//         const cells = line.split("\t");
//         const target = rowIdx + li;
//         while (next.length <= target) next.push(emptyRow(Date.now() + target, defaultParent, defaultNature));
//         const r = { ...next[target] };
//         cells.forEach((cell, ci) => {
//           const c = COLS[colIdx + ci];
//           if (!c) return;
//           (r as any)[c.key] = cell.trim();
//         });
//         const p = parentByNameMap.get(r.parent.toLowerCase());
//         if (p) r.nature = p.nature;
//         next[target] = r;
//       });
//       return next;
//     });
//     toast.success(`Pasted ${lines.length} rows`);
//   };

//   // ── Apply default parent ────────────────────────────────────────────────────
//   const applyDefaultParent = (name: string) => {
//     setDefaultParent(name);
//     setUnderQuery(name);
//     const p = parentByNameMap.get(name.toLowerCase());
//     const nat = p?.nature ?? defaultNature;
//     if (p) setDefaultNature(p.nature);
//     setRows(prev => prev.map(r => r.name.trim() ? r : { ...r, parent: name, nature: nat }));
//   };

//   // ── Row actions ─────────────────────────────────────────────────────────────
//   const addRow = () => setRows(p => [...p, emptyRow(Date.now(), defaultParent, defaultNature)]);
//   const deleteRow = (idx: number) => setRows(p => p.filter((_, i) => i !== idx));

//   // ── Visible rows (filtered) ─────────────────────────────────────────────────
//   const visibleRows = useMemo(() => {
//     if (!filter) return rows;
//     const q = filter.toLowerCase();
//     return rows.filter(r =>
//       r.name.toLowerCase().includes(q) ||
//       r.parent.toLowerCase().includes(q) ||
//       r.alias.toLowerCase().includes(q)
//     );
//   }, [rows, filter]);

//   // ── Validate & save ─────────────────────────────────────────────────────────
//   const validate = (): GroupRow[] | null => {
//     const valid = rows.filter(r => r.name.trim());
//     if (!valid.length) { toast.error("Nothing to save"); return null; }
//     for (let i = 0; i < valid.length; i++) {
//       if (!valid[i].parent.trim()) {
//         toast.error(`Row ${i + 1}: Under (parent group) is required`);
//         return null;
//       }
//     }
//     const names = new Set<string>();
//     for (const r of valid) {
//       const key = r.name.trim().toLowerCase();
//       if (names.has(key)) { toast.error(`Duplicate group name: ${r.name}`); return null; }
//       names.add(key);
//     }
//     return valid;
//   };

//   const handleSave = async () => {
//     if (saving) return;
//     const v = validate();
//     if (!v) return;

//     // Resolve parent names to system_parent_id or custom_parent_id
//     const payloads = [];
//     for (let i = 0; i < v.length; i++) {
//       const row = v[i];
//       const parentItem = underItems.find(
//         item => item.group_name.toLowerCase() === row.parent.trim().toLowerCase()
//       );
//       if (!parentItem) {
//         toast.error(`Row ${i + 1}: Parent group "${row.parent}" is invalid. Please select from suggestions.`);
//         return;
//       }

//       let system_parent_id: number | null = null;
//       let custom_parent_id: number | null = null;
//       if (parentItem.source === "system") {
//         system_parent_id = parentItem.id;
//       } else {
//         custom_parent_id = parentItem.id;
//       }

//       payloads.push({
//         id: row.dbId,
//         group_name: row.name.trim(),
//         alias: row.alias.trim() || null,
//         system_parent_id,
//         custom_parent_id,
//         nature: row.nature === "Expenses" ? "Expenses" : row.nature,
//       });
//     }

//     setSaving(true);
//     try {
//       if (isAlter) {
//         const updates = payloads.map(p => {
//           if (!p.id) throw new Error(`Missing database ID for altering group "${p.group_name}"`);
//           return {
//             id: p.id,
//             group_name: p.group_name,
//             alias: p.alias,
//             system_parent_id: p.system_parent_id,
//             custom_parent_id: p.custom_parent_id,
//             nature: p.nature,
//           };
//         });
//         const res = await multiUpdateAccLedgerGroup(updates);
//         if (!res.data.success) throw new Error("Failed to update groups in DB");
//         toast.success(`Updated ${updates.length} groups successfully`);
//       } else {
//         const creates = payloads.map(p => ({
//           group_name: p.group_name,
//           alias: p.alias,
//           system_parent_id: p.system_parent_id,
//           custom_parent_id: p.custom_parent_id,
//           nature: p.nature,
//         }));
//         const res = await multiCreateAccLedgerGroup(creates);
//         if (!res.data.success) throw new Error("Failed to create groups in DB");
//         toast.success(`Created ${creates.length} groups successfully`);
//       }
//       onSaved?.();
//       onClose();
//     } catch (err: any) {
//       toast.error(err?.response?.data?.message || err?.message || "Failed to save groups");
//       console.error(err);
//     } finally {
//       setSaving(false);
//     }
//   };

//   const filledCount = rows.filter(r => r.name.trim()).length;
//   const title = isAlter
//     ? presetGroup ? `Multi Group Alter – ${presetGroup}` : "Multi Group Alter"
//     : "Multi Group Creation";

//   // ── Render ──────────────────────────────────────────────────────────────────
//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       exit={{ opacity: 0 }}
//       className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex flex-col"
//     >
//       {/* Header */}
//       <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
//         <div className="flex items-center gap-3">
//           <Badge className={`border ${isAlter ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" : "bg-primary/10 text-primary border-primary/30"}`}>
//             {isAlter ? "ALTER" : "CREATE"}
//           </Badge>
//           <FolderTree className="h-5 w-5 text-primary" />
//           <h1 className="text-lg font-bold text-foreground">{title}</h1>
//           <Badge variant="outline" className="text-[10px]">Tally Style</Badge>
//         </div>
//         <div className="flex items-center gap-2">
//           <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-muted-foreground mr-3">
//             <Keyboard className="h-3 w-3" />
//             <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Enter/Tab</kbd> next ·
//             <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">↑↓</kbd> move ·
//             <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Ctrl+A</kbd> save ·
//             <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">F4</kbd> Under ·
//             <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Esc</kbd> close
//           </div>
//           <Button size="sm" onClick={handleSave} className="gap-1.5" disabled={saving}>
//             {saving ? (
//               <Loader2 className="h-3.5 w-3.5 animate-spin" />
//             ) : (
//               <Save className="h-3.5 w-3.5" />
//             )}
//             Save (Ctrl+A)
//           </Button>
//           <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>
//             <X className="h-3.5 w-3.5" />
//           </Button>
//         </div>
//       </div>

//       {/* Default Under row (create mode only) */}
//       {!isAlter && (
//         <div className="px-6 py-2 border-b border-border bg-secondary/30 flex flex-wrap items-center gap-3 relative">
//           <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">
//             Under (F4)
//           </Label>
//           <div className="w-72 relative">
//             <Input
//               ref={topUnderRef}
//               value={underQuery}
//               placeholder="Start typing parent group..."
//               onFocus={() => { setUnderOpen(true); setUnderActive(0); }}
//               onBlur={() => setTimeout(() => setUnderOpen(false), 150)}
//               onChange={e => { setUnderQuery(e.target.value); setUnderOpen(true); setUnderActive(0); }}
//               onKeyDown={e => {
//                 if (e.key === "ArrowDown") { e.preventDefault(); setUnderActive(p => Math.min(p + 1, underSuggestions.length - 1)); }
//                 else if (e.key === "ArrowUp") { e.preventDefault(); setUnderActive(p => Math.max(p - 1, 0)); }
//                 else if (e.key === "Enter" || e.key === "Tab") {
//                   const pick = underSuggestions[underActive]?.group_name ?? underQuery.trim();
//                   if (pick) {
//                     e.preventDefault();
//                     applyDefaultParent(pick);
//                     setUnderOpen(false);
//                     setTimeout(() => cellRefs.current["0-name"]?.focus(), 0);
//                   }
//                 } else if (e.key === "Escape") setUnderOpen(false);
//               }}
//               className="h-8 text-sm"
//             />
//             {underOpen && underSuggestions.length > 0 && (
//               <div className="absolute z-30 top-full left-0 mt-1 w-full max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
//                 {underSuggestions.map((item, i) => (
//                   <button
//                     key={item.group_name}
//                     type="button"
//                     onMouseDown={() => {
//                       applyDefaultParent(item.group_name);
//                       setUnderOpen(false);
//                       setTimeout(() => cellRefs.current["0-name"]?.focus(), 0);
//                     }}
//                     onMouseEnter={() => setUnderActive(i)}
//                     className={`flex w-full items-center justify-between px-3 py-1.5 text-xs ${i === underActive ? "bg-accent" : "hover:bg-secondary"}`}
//                   >
//                     <span className="font-medium">{item.group_name}</span>
//                     <span className="flex items-center gap-1">
//                       {item.source === "predefined" && (
//                         <span className="px-1 py-0.5 rounded border text-[9px] border-dashed border-muted-foreground/50 text-muted-foreground">predefined</span>
//                       )}
//                       <span className={`px-1.5 py-0.5 rounded border text-[10px] ${NATURE_STYLE[item.nature]}`}>
//                         {item.nature}
//                       </span>
//                     </span>
//                   </button>
//                 ))}
//               </div>
//             )}
//           </div>
//           {defaultParent && (
//             <Badge variant="outline" className={`text-[10px] ${NATURE_STYLE[defaultNature]}`}>
//               Default Nature: {defaultNature}
//             </Badge>
//           )}
//           <div className="ml-auto relative max-w-xs w-full sm:w-72">
//             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
//             <Input
//               value={filter}
//               onChange={e => setFilter(e.target.value)}
//               placeholder="Filter rows…"
//               className="pl-9 h-8 text-sm"
//             />
//           </div>
//         </div>
//       )}

//       {/* Filter bar (alter mode only) */}
//       {isAlter && (
//         <div className="px-6 py-2 border-b border-border bg-card/50">
//           <div className="relative max-w-sm">
//             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
//             <Input
//               value={filter}
//               onChange={e => setFilter(e.target.value)}
//               placeholder="Search group or parent..."
//               className="pl-9 h-8 text-sm"
//             />
//           </div>
//         </div>
//       )}

//       {/* Grid */}
//       <div className="flex-1 overflow-auto p-4">
//         <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
//           <table className="w-full border-collapse">
//             <thead className="sticky top-0 z-10">
//               <tr className="bg-secondary/80 border-b border-border">
//                 <th className="w-10 px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase">#</th>
//                 {COLS.map(c => (
//                   <th key={c.key} className={`${c.w} text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider`}>
//                     {c.label}{c.required && <span className="text-destructive ml-0.5">*</span>}
//                   </th>
//                 ))}
//                 <th className="w-10"></th>
//               </tr>
//             </thead>
//             <tbody>
//               {visibleRows.map((row, rIdx) => {
//                 const realIdx = rows.indexOf(row);
//                 return (
//                   <tr key={row.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors group">
//                     <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums text-center">{rIdx + 1}</td>
//                     {COLS.map((c, cIdx) => (
//                       <td key={c.key} className="px-1 py-1 relative">
//                         {c.key === "parent" ? (
//                           <ParentCell
//                             value={row.parent}
//                             mergedParents={mergedParents}
//                             parentByNameMap={parentByNameMap}
//                             onChange={v => setCell(realIdx, "parent", v)}
//                             onCommit={v => { setCell(realIdx, "parent", v); focusCell(realIdx, COLS[cIdx + 1]?.key); }}
//                             inputRef={el => { cellRefs.current[`${realIdx}-${c.key}`] = el; }}
//                             onKeyDown={e => handleCellKey(e, realIdx, cIdx)}
//                             required={!row.parent && !!row.name}
//                           />
//                         ) : (
//                           <Input
//                             ref={el => { cellRefs.current[`${realIdx}-${c.key}`] = el; }}
//                             value={(row as any)[c.key]}
//                             onChange={e => setCell(realIdx, c.key, e.target.value)}
//                             onKeyDown={e => handleCellKey(e, realIdx, cIdx)}
//                             onPaste={e => handlePaste(e, realIdx, cIdx)}
//                             placeholder={c.required ? "Required" : ""}
//                             className={`h-8 text-sm border-transparent focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-md ${c.required && !(row as any)[c.key] && row.name ? "border-destructive/50" : ""
//                               }`}
//                           />
//                         )}
//                       </td>
//                     ))}
//                     <td className="px-1">
//                       <button
//                         type="button"
//                         onClick={() => deleteRow(realIdx)}
//                         className="opacity-0 group-hover:opacity-100 p-1 rounded text-destructive hover:bg-destructive/10"
//                         aria-label="Delete row"
//                       >
//                         <Trash2 className="h-3 w-3" />
//                       </button>
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//           </table>
//           {!isAlter && (
//             <div className="px-3 py-2 border-t border-border bg-secondary/30">
//               <button
//                 type="button"
//                 onClick={addRow}
//                 className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
//               >
//                 <Plus className="h-3 w-3" /> Add Row (or press Enter on last cell)
//               </button>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Footer summary */}
//       <footer className="border-t border-border bg-card px-6 py-2 flex items-center justify-between text-xs text-muted-foreground">
//         <div>
//           <span className="font-semibold text-foreground tabular-nums">{filledCount}</span>{" "}
//           group{filledCount === 1 ? "" : "s"} {isAlter ? "to be updated" : "to be created"}
//           {defaultParent && !isAlter && (
//             <span> · Under <span className="text-foreground font-medium">{defaultParent}</span></span>
//           )}
//           {presetGroup && isAlter && (
//             <span> · Parent: <span className="text-foreground font-medium">{presetGroup}</span></span>
//           )}
//         </div>
//         <div>Tally Prime–style bulk {isAlter ? "alter" : "create"}</div>
//       </footer>
//     </motion.div>
//   );
// }

// // ─── ParentCell (Under column with autosuggest) ───────────────────────────────

// type MergedParent = { group_name: string; nature: Nature; source: string };

// function ParentCell({
//   value, mergedParents, parentByNameMap, onChange, onCommit, inputRef, onKeyDown, required,
// }: {
//   value: string;
//   mergedParents: MergedParent[];
//   parentByNameMap: Map<string, { nature: Nature }>;
//   onChange: (v: string) => void;
//   onCommit: (v: string) => void;
//   inputRef: (el: HTMLInputElement | null) => void;
//   onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
//   required: boolean;
// }) {
//   const [open, setOpen] = useState(false);
//   const [active, setActive] = useState(0);
//   const suggestions = useMemo(() => {
//     const q = value.trim().toLowerCase();
//     const list = q
//       ? mergedParents.filter(p => p.group_name.toLowerCase().includes(q))
//         .sort((a, b) => a.group_name.toLowerCase().indexOf(q) - b.group_name.toLowerCase().indexOf(q))
//       : mergedParents;
//     return list.slice(0, 12);
//   }, [mergedParents, value]);

//   return (
//     <div className="relative">
//       <Input
//         ref={inputRef}
//         value={value}
//         placeholder="Select parent…"
//         onFocus={() => { setOpen(true); setActive(0); }}
//         onBlur={() => setTimeout(() => setOpen(false), 120)}
//         onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
//         onKeyDown={e => {
//           if (open && e.key === "ArrowDown") { e.preventDefault(); setActive(p => Math.min(p + 1, suggestions.length - 1)); return; }
//           if (open && e.key === "ArrowUp") { e.preventDefault(); setActive(p => Math.max(p - 1, 0)); return; }
//           if (open && (e.key === "Enter" || e.key === "Tab")) {
//             const pick = suggestions[active];
//             if (pick) { e.preventDefault(); onCommit(pick.group_name); setOpen(false); return; }
//           }
//           if (e.key === "Escape") { setOpen(false); return; }
//           onKeyDown(e);
//         }}
//         className={`h-8 text-sm border-transparent focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-md ${required ? "border-destructive/50" : ""
//           }`}
//       />
//       <AnimatePresence>
//         {open && suggestions.length > 0 && (
//           <motion.div
//             initial={{ opacity: 0, y: -4 }}
//             animate={{ opacity: 1, y: 0 }}
//             exit={{ opacity: 0, y: -4 }}
//             transition={{ duration: 0.1 }}
//             className="absolute z-20 top-full left-0 mt-1 w-72 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg"
//           >
//             {suggestions.map((item, i) => (
//               <button
//                 key={item.group_name}
//                 type="button"
//                 onMouseDown={() => { onCommit(item.group_name); setOpen(false); }}
//                 onMouseEnter={() => setActive(i)}
//                 className={`flex w-full items-center justify-between px-3 py-1.5 text-xs ${i === active ? "bg-accent" : "hover:bg-secondary"}`}
//               >
//                 <span className="font-medium">{item.group_name}</span>
//                 <span className="flex items-center gap-1">
//                   {item.source === "predefined" && (
//                     <span className="px-1 py-0.5 rounded border text-[9px] border-dashed border-muted-foreground/50 text-muted-foreground">predefined</span>
//                   )}
//                   <span className={`px-1.5 py-0.5 rounded border text-[10px] ${NATURE_STYLE[item.nature]}`}>
//                     {item.nature}
//                   </span>
//                 </span>
//               </button>
//             ))}
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FolderTree, Keyboard, Plus, Save, Search, Trash2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  type Nature,
} from "@/components/lib/multi-group-data";
import {
  getUnderDropdown,
  multiCreateAccLedgerGroup,
  multiUpdateAccLedgerGroup,
  type UnderDropdownItem,
} from "@/api/accounting";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MultiGroupMode = "create" | "alter";

interface GroupRow {
  id: number;
  dbId?: number;
  name: string;
  alias: string;
  parent: string;
  nature: Nature;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const emptyRow = (id: number, parent = "", nature: Nature = "Assets"): GroupRow => ({
  id, name: "", alias: "", parent, nature,
});

const NATURE_STYLE: Record<Nature, string> = {
  Assets: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  Liabilities: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
  Income: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  Expenses: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

const COLS: { key: keyof GroupRow; label: string; w: string; required?: boolean }[] = [
  { key: "name", label: "Name of Group", w: "min-w-[260px]", required: true },
  { key: "alias", label: "Alias", w: "min-w-[180px]" },
  { key: "parent", label: "Under", w: "min-w-[220px]", required: true },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  mode: MultiGroupMode;
  presetGroup?: string;
  customGroups?: Array<{
    id: number;
    dbId?: number;
    name: string;
    alias?: string;
    parent: string | null;
    nature: string;
  }>;
  onClose: () => void;
  onSaved?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MultiGroupPanel({ mode, presetGroup, customGroups = [], onClose, onSaved }: Props) {
  const isAlter = mode === "alter";
  const [underItems, setUnderItems] = useState<UnderDropdownItem[]>([]);
  const [loadingParents, setLoadingParents] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch under dropdown items (possible parents)
  useEffect(() => {
    setLoadingParents(true);
    getUnderDropdown()
      .then(res => {
        if (res.data.success) {
          setUnderItems(res.data.data);
        }
      })
      .catch(err => {
        toast.error("Failed to load parent groups list");
        console.error(err);
      })
      .finally(() => {
        setLoadingParents(false);
      });
  }, []);

  // Use underItems directly from the API — system groups + company custom groups.
  // Do NOT merge local PREDEFINED_GROUPS: their names differ from acc_group_master
  // (e.g. "Direct Income" vs "Direct Incomes"), causing phantom entries in the dropdown
  // and breaking the id-lookup in handleSave (save fails with "Parent group X is invalid").
  const mergedParents = useMemo(() => {
    return underItems.map(i => ({
      group_name: i.group_name,
      nature: i.nature as Nature,
      source: i.source,
    }));
  }, [underItems]);


  const parentByNameMap = useMemo(() => {
    const m = new Map<string, { nature: Nature }>();
    mergedParents.forEach(item => {
      m.set(item.group_name.toLowerCase(), { nature: item.nature });
    });
    return m;
  }, [mergedParents]);

  // ── Default parent (top "Under" field) ──────────────────────────────────────
  const [defaultParent, setDefaultParent] = useState(presetGroup ?? "");
  const [defaultNature, setDefaultNature] = useState<Nature>("Assets");

  // ── Row initialisation ──────────────────────────────────────────────────────
  const [rows, setRows] = useState<GroupRow[]>(() => {
    if (isAlter) {
      const source = presetGroup
        ? customGroups.filter(g => g.parent === presetGroup)
        : customGroups;
      return source.map(g => ({
        id: g.id,
        dbId: g.dbId,
        name: g.name,
        alias: g.alias || "",
        parent: g.parent || "",
        nature: (g.nature === "Expense" ? "Expenses" : g.nature) as Nature
      }));
    }
    return Array.from({ length: 8 }, (_, i) => emptyRow(i + 1, presetGroup ?? ""));
  });

  const [filter, setFilter] = useState("");

  // ── Under auto-suggest (top field) ─────────────────────────────────────────
  const [underQuery, setUnderQuery] = useState(presetGroup ?? "");
  const [underOpen, setUnderOpen] = useState(false);
  const [underActive, setUnderActive] = useState(0);
  const topUnderRef = useRef<HTMLInputElement>(null);

  const underSuggestions = useMemo(() => {
    const q = underQuery.trim().toLowerCase();
    const list = q
      ? mergedParents.filter(p => p.group_name.toLowerCase().includes(q))
        .sort((a, b) => a.group_name.toLowerCase().indexOf(q) - b.group_name.toLowerCase().indexOf(q))
      : mergedParents;
    return list.slice(0, 50);
  }, [mergedParents, underQuery]);

  // ── Cell refs ───────────────────────────────────────────────────────────────
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Focus on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => {
      if (!isAlter && !defaultParent) {
        topUnderRef.current?.focus();
      } else {
        cellRefs.current["0-name"]?.focus();
      }
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Global keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault(); handleSave(); return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault(); handleSave(); return;
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

  // ── Cell helpers ─────────────────────────────────────────────────────────────
  const setCell = (idx: number, key: keyof GroupRow, value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [key]: value } as GroupRow;
      if (key === "parent") {
        const p = parentByNameMap.get(value.toLowerCase());
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
    if (!isAlter && next >= rows.length) {
      setRows(prev => [...prev, emptyRow(Date.now(), defaultParent, defaultNature)]);
    }
    focusCell(next, COLS[0].key);
  };

  const handleCellKey = (e: KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const col = COLS[colIdx];
    const nextCol = COLS[colIdx + 1];
    const prevCol = COLS[colIdx - 1];
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      if (colIdx === COLS.length - 1) advanceAfterRow(rowIdx);
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
          const c = COLS[colIdx + ci];
          if (!c) return;
          (r as any)[c.key] = cell.trim();
        });
        const p = parentByNameMap.get(r.parent.toLowerCase());
        if (p) r.nature = p.nature;
        next[target] = r;
      });
      return next;
    });
    toast.success(`Pasted ${lines.length} rows`);
  };

  // ── Apply default parent ────────────────────────────────────────────────────
  const applyDefaultParent = (name: string) => {
    setDefaultParent(name);
    setUnderQuery(name);
    const p = parentByNameMap.get(name.toLowerCase());
    const nat = p?.nature ?? defaultNature;
    if (p) setDefaultNature(p.nature);
    setRows(prev => prev.map(r => r.name.trim() ? r : { ...r, parent: name, nature: nat }));
  };

  // ── Row actions ─────────────────────────────────────────────────────────────
  const addRow = () => setRows(p => [...p, emptyRow(Date.now(), defaultParent, defaultNature)]);
  const deleteRow = (idx: number) => setRows(p => p.filter((_, i) => i !== idx));

  // ── Visible rows (filtered) ─────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.parent.toLowerCase().includes(q) ||
      r.alias.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  // ── Validate & save ─────────────────────────────────────────────────────────
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

  const handleSave = async () => {
    if (saving) return;
    const v = validate();
    if (!v) return;

    // Resolve parent names to system_parent_id or custom_parent_id
    const payloads = [];
    for (let i = 0; i < v.length; i++) {
      const row = v[i];
      const parentItem = underItems.find(
        item => item.group_name.toLowerCase() === row.parent.trim().toLowerCase()
      );
      if (!parentItem) {
        toast.error(`Row ${i + 1}: Parent group "${row.parent}" not found — please select a value from the dropdown suggestions.`);
        return;
      }

      let system_parent_id: number | null = null;
      let custom_parent_id: number | null = null;
      if (parentItem.source === "system") {
        system_parent_id = parentItem.id;
      } else {
        custom_parent_id = parentItem.id;
      }

      payloads.push({
        id: row.dbId,
        group_name: row.name.trim(),
        alias: row.alias.trim() || null,
        system_parent_id,
        custom_parent_id,
        nature: row.nature === "Expenses" ? "Expenses" : row.nature,
      });
    }

    setSaving(true);
    try {
      if (isAlter) {
        const updates = payloads.map(p => {
          if (!p.id) throw new Error(`Missing database ID for altering group "${p.group_name}"`);
          return {
            id: p.id,
            group_name: p.group_name,
            alias: p.alias,
            system_parent_id: p.system_parent_id,
            custom_parent_id: p.custom_parent_id,
            nature: p.nature,
          };
        });
        const res = await multiUpdateAccLedgerGroup(updates);
        if (!res.data.success) throw new Error("Failed to update groups in DB");
        toast.success(`Updated ${updates.length} groups successfully`);
      } else {
        const creates = payloads.map(p => ({
          group_name: p.group_name,
          alias: p.alias,
          system_parent_id: p.system_parent_id,
          custom_parent_id: p.custom_parent_id,
          nature: p.nature,
        }));
        const res = await multiCreateAccLedgerGroup(creates);
        if (!res.data.success) throw new Error("Failed to create groups in DB");
        toast.success(`Created ${creates.length} groups successfully`);
      }
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to save groups");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const filledCount = rows.filter(r => r.name.trim()).length;
  const title = isAlter
    ? presetGroup ? `Multi Group Alter – ${presetGroup}` : "Multi Group Alter"
    : "Multi Group Creation";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Badge className={`border ${isAlter ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" : "bg-primary/10 text-primary border-primary/30"}`}>
            {isAlter ? "ALTER" : "CREATE"}
          </Badge>
          <FolderTree className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
          <Badge variant="outline" className="text-[10px]">Tally Style</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-muted-foreground mr-3">
            <Keyboard className="h-3 w-3" />
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Enter/Tab</kbd> next ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">↑↓</kbd> move ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Ctrl+A</kbd> save ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">F4</kbd> Under ·
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-foreground">Esc</kbd> close
          </div>
          <Button size="sm" onClick={handleSave} className="gap-1.5" disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save (Ctrl+A)
          </Button>
          <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Default Under row (create mode only) */}
      {!isAlter && (
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
                  const pick = underSuggestions[underActive]?.group_name ?? underQuery.trim();
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
                {underSuggestions.map((item, i) => (
                  <button
                    key={item.group_name}
                    type="button"
                    onMouseDown={() => {
                      applyDefaultParent(item.group_name);
                      setUnderOpen(false);
                      setTimeout(() => cellRefs.current["0-name"]?.focus(), 0);
                    }}
                    onMouseEnter={() => setUnderActive(i)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-xs ${i === underActive ? "bg-accent" : "hover:bg-secondary"}`}
                  >
                    <span className="font-medium">{item.group_name}</span>
                    <span className="flex items-center gap-1">
                      {item.source === "system" && (
                        <span className="px-1 py-0.5 rounded border text-[9px] border-dashed border-muted-foreground/50 text-muted-foreground">system</span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] ${NATURE_STYLE[item.nature]}`}>
                        {item.nature}
                      </span>
                    </span>
                  </button>
                ))}
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
      )}

      {/* Filter bar (alter mode only) */}
      {isAlter && (
        <div className="px-6 py-2 border-b border-border bg-card/50">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search group or parent..."
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-secondary/80 border-b border-border">
                <th className="w-10 px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase">#</th>
                {COLS.map(c => (
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
                    {COLS.map((c, cIdx) => (
                      <td key={c.key} className="px-1 py-1 relative">
                        {c.key === "parent" ? (
                          <ParentCell
                            value={row.parent}
                            mergedParents={mergedParents}
                            parentByNameMap={parentByNameMap}
                            onChange={v => setCell(realIdx, "parent", v)}
                            onCommit={v => { setCell(realIdx, "parent", v); focusCell(realIdx, COLS[cIdx + 1]?.key); }}
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
          {!isAlter && (
            <div className="px-3 py-2 border-t border-border bg-secondary/30">
              <button
                type="button"
                onClick={addRow}
                className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Row (or press Enter on last cell)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer summary */}
      <footer className="border-t border-border bg-card px-6 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground tabular-nums">{filledCount}</span>{" "}
          group{filledCount === 1 ? "" : "s"} {isAlter ? "to be updated" : "to be created"}
          {defaultParent && !isAlter && (
            <span> · Under <span className="text-foreground font-medium">{defaultParent}</span></span>
          )}
          {presetGroup && isAlter && (
            <span> · Parent: <span className="text-foreground font-medium">{presetGroup}</span></span>
          )}
        </div>
        <div>Tally Prime–style bulk {isAlter ? "alter" : "create"}</div>
      </footer>
    </motion.div>
  );
}

// ─── ParentCell (Under column with autosuggest) ───────────────────────────────

type MergedParent = { group_name: string; nature: Nature; source: string };

function ParentCell({
  value, mergedParents, parentByNameMap, onChange, onCommit, inputRef, onKeyDown, required,
}: {
  value: string;
  mergedParents: MergedParent[];
  parentByNameMap: Map<string, { nature: Nature }>;
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
      ? mergedParents.filter(p => p.group_name.toLowerCase().includes(q))
        .sort((a, b) => a.group_name.toLowerCase().indexOf(q) - b.group_name.toLowerCase().indexOf(q))
      : mergedParents;
    return list.slice(0, 50);
  }, [mergedParents, value]);

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
            if (pick) { e.preventDefault(); onCommit(pick.group_name); setOpen(false); return; }
          }
          if (e.key === "Escape") { setOpen(false); return; }
          onKeyDown(e);
        }}
        className={`h-8 text-sm border-transparent focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-md ${required ? "border-destructive/50" : ""
          }`}
      />
      <AnimatePresence>
        {open && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute z-20 top-full left-0 mt-1 w-72 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg"
          >
            {suggestions.map((item, i) => (
              <button
                key={item.group_name}
                type="button"
                onMouseDown={() => { onCommit(item.group_name); setOpen(false); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-xs ${i === active ? "bg-accent" : "hover:bg-secondary"}`}
              >
                <span className="font-medium">{item.group_name}</span>
                <span className="flex items-center gap-1">
                  {item.source === "system" && (
                    <span className="px-1 py-0.5 rounded border text-[9px] border-dashed border-muted-foreground/50 text-muted-foreground">system</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] ${NATURE_STYLE[item.nature]}`}>
                    {item.nature}
                  </span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
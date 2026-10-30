// import { useEffect, useMemo, useRef, useState } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import { FolderTree, Layers, Pencil, Plus, Search, X } from "lucide-react";
// import { Badge } from "@/components/ui/badge";
// import {
//   SEED_PARENTS,
// } from "@/components/lib/multi-group-data";
// import type { MultiGroupMode } from "./MultiGroupPanel";

// // ─── Types ────────────────────────────────────────────────────────────────────

// export interface MultiGroupChoice {
//   mode: MultiGroupMode;
//   presetGroup?: string;
// }

// interface Props {
//   open: boolean;
//   customGroups: Array<{
//     id: number;
//     name: string;
//     alias?: string;
//     parent: string | null;
//     nature: string;
//     dbId?: number;
//   }>;
//   onClose: () => void;
//   onSelect: (choice: MultiGroupChoice) => void;
// }

// type Stage = "ops" | "selectGroup";

// const OPS = [
//   { key: "create" as const, label: "Multi Create", desc: "Create multiple groups in a single grid", icon: Plus },
//   { key: "alter" as const, label: "Multi Alter", desc: "Bulk edit existing groups inline", icon: Pencil },
// ];

// // ─── Component ────────────────────────────────────────────────────────────────

// export function MultiGroupSelector({ open, customGroups, onClose, onSelect }: Props) {
//   const [stage, setStage] = useState<Stage>("ops");
//   const [opsIdx, setOpsIdx] = useState(0);
//   const [groupQuery, setGroupQuery] = useState("");
//   const [groupIdx, setGroupIdx] = useState(0);
//   const groupInputRef = useRef<HTMLInputElement>(null);

//   // Build the parent-group map for nature display
//   const parentByName = useMemo(() => {
//     const m = new Map<string, (typeof SEED_PARENTS)[number]>();
//     SEED_PARENTS.forEach(p => m.set(p.name.toLowerCase(), p));
//     return m;
//   }, []);

//   // Groups available for alter
//   const existingGroupNames = useMemo(
//     () => customGroups.map(g => g.name),
//     [customGroups]
//   );

//   const filteredGroups = useMemo(() => {
//     const q = groupQuery.trim().toLowerCase();
//     if (!q) return existingGroupNames;
//     return existingGroupNames
//       .filter(n => n.toLowerCase().includes(q))
//       .sort((a, b) => a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q));
//   }, [existingGroupNames, groupQuery]);

//   // Reset state whenever dialog opens
//   useEffect(() => {
//     if (!open) return;
//     setStage("ops");
//     setOpsIdx(0);
//     setGroupQuery("");
//     setGroupIdx(0);
//   }, [open]);

//   // Focus the group search input when entering selectGroup stage
//   useEffect(() => {
//     if (stage === "selectGroup") {
//       setGroupQuery("");
//       setGroupIdx(0);
//       setTimeout(() => groupInputRef.current?.focus(), 30);
//     }
//   }, [stage]);

//   // Global keyboard handler
//   useEffect(() => {
//     if (!open) return;
//     const h = (e: KeyboardEvent) => {
//       if (e.key === "Escape") {
//         e.preventDefault();
//         if (stage === "selectGroup") setStage("ops");
//         else onClose();
//         return;
//       }
//       if (stage === "ops") {
//         if (e.key === "ArrowDown") { e.preventDefault(); setOpsIdx(i => Math.min(i + 1, OPS.length - 1)); }
//         else if (e.key === "ArrowUp") { e.preventDefault(); setOpsIdx(i => Math.max(i - 1, 0)); }
//         else if (e.key === "Enter") { e.preventDefault(); pickOp(OPS[opsIdx].key); }
//       }
//       // Note: selectGroup keyboard events are handled by the input itself
//     };
//     window.addEventListener("keydown", h);
//     return () => window.removeEventListener("keydown", h);
//   }, [open, stage, opsIdx, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

//   const pickOp = (key: MultiGroupMode) => {
//     if (key === "create") {
//       onClose();
//       onSelect({ mode: "create" });
//     } else {
//       setStage("selectGroup");
//     }
//   };

//   const pickGroup = (name: string) => {
//     onClose();
//     // Find the parent for this group from customGroups
//     const eg = customGroups.find(g => g.name === name);
//     onSelect({ mode: "alter", presetGroup: eg?.parent ?? name });
//   };

//   if (!open) return null;

//   return (
//     <AnimatePresence>
//       {open && (
//         <motion.div
//           initial={{ opacity: 0 }}
//           animate={{ opacity: 1 }}
//           exit={{ opacity: 0 }}
//           className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-24 px-4"
//           onClick={onClose}
//         >
//           <motion.div
//             initial={{ opacity: 0, scale: 0.96, y: 8 }}
//             animate={{ opacity: 1, scale: 1, y: 0 }}
//             exit={{ opacity: 0, scale: 0.96, y: 8 }}
//             transition={{ duration: 0.15 }}
//             onClick={e => e.stopPropagation()}
//             className="w-full max-w-md rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
//             role="dialog"
//             aria-modal="true"
//           >
//             {/* Dialog header */}
//             <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/40">
//               <div className="flex items-center gap-2">
//                 {stage === "ops"
//                   ? <FolderTree className="h-4 w-4 text-primary" />
//                   : <Layers className="h-4 w-4 text-primary" />
//                 }
//                 <h2 className="text-sm font-semibold">
//                   {stage === "ops" ? "Multi Group Operations" : "Select Group to Alter"}
//                 </h2>
//                 <Badge variant="outline" className="text-[10px] font-mono ml-1">Alt+H</Badge>
//               </div>
//               <button
//                 type="button"
//                 onClick={onClose}
//                 className="p-1 rounded hover:bg-accent"
//                 aria-label="Close"
//               >
//                 <X className="h-3.5 w-3.5" />
//               </button>
//             </div>

//             {/* ── Operations list ── */}
//             {stage === "ops" && (
//               <ul
//                 tabIndex={0}
//                 autoFocus
//                 className="py-1 outline-none"
//                 onKeyDown={e => {
//                   if (e.key === "ArrowDown") { e.preventDefault(); setOpsIdx(i => Math.min(i + 1, OPS.length - 1)); }
//                   else if (e.key === "ArrowUp") { e.preventDefault(); setOpsIdx(i => Math.max(i - 1, 0)); }
//                   else if (e.key === "Enter") { e.preventDefault(); pickOp(OPS[opsIdx].key); }
//                 }}
//               >
//                 {OPS.map((op, i) => {
//                   const Icon = op.icon;
//                   return (
//                     <li key={op.key}>
//                       <button
//                         type="button"
//                         onMouseEnter={() => setOpsIdx(i)}
//                         onClick={() => pickOp(op.key)}
//                         className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${i === opsIdx ? "bg-accent" : "hover:bg-secondary"
//                           }`}
//                       >
//                         <span className="w-6 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
//                         <Icon className="h-4 w-4 text-primary" />
//                         <span className="flex-1">
//                           <span className="font-medium">{op.label}</span>
//                           <span className="block text-[11px] text-muted-foreground">{op.desc}</span>
//                         </span>
//                       </button>
//                     </li>
//                   );
//                 })}
//                 <li className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border mt-1">
//                   ↑↓ navigate · Enter select · Esc cancel
//                 </li>
//               </ul>
//             )}

//             {/* ── Group selection (alter mode) ── */}
//             {stage === "selectGroup" && (
//               <div className="flex flex-col">
//                 {/* Search input */}
//                 <div className="relative px-3 py-2 border-b border-border">
//                   <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
//                   <input
//                     ref={groupInputRef}
//                     value={groupQuery}
//                     onChange={e => { setGroupQuery(e.target.value); setGroupIdx(0); }}
//                     placeholder="Search group…"
//                     className="w-full h-9 pl-8 pr-3 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
//                     onKeyDown={e => {
//                       if (e.key === "ArrowDown") { e.preventDefault(); setGroupIdx(i => Math.min(i + 1, filteredGroups.length - 1)); }
//                       else if (e.key === "ArrowUp") { e.preventDefault(); setGroupIdx(i => Math.max(i - 1, 0)); }
//                       else if (e.key === "Enter") {
//                         e.preventDefault();
//                         const pick = filteredGroups[groupIdx];
//                         if (pick) pickGroup(pick);
//                       } else if (e.key === "Escape") {
//                         e.preventDefault();
//                         setStage("ops");
//                       }
//                     }}
//                   />
//                 </div>

//                 {/* Group list */}
//                 <ul className="max-h-72 overflow-y-auto py-1">
//                   {filteredGroups.length === 0 && (
//                     <li className="px-4 py-6 text-center text-xs text-muted-foreground">No matching groups</li>
//                   )}
//                   {filteredGroups.map((name, i) => {
//                     const eg = customGroups.find(g => g.name === name);
//                     return (
//                       <li key={name}>
//                         <button
//                           type="button"
//                           onMouseEnter={() => setGroupIdx(i)}
//                           onMouseDown={e => { e.preventDefault(); pickGroup(name); }}
//                           className={`w-full flex items-center justify-between px-4 py-1.5 text-left text-sm transition-colors ${i === groupIdx ? "bg-accent" : "hover:bg-secondary"
//                             }`}
//                         >
//                           <div>
//                             <span className="font-medium">{name}</span>
//                             {eg?.alias && (
//                               <span className="ml-2 text-[10px] text-muted-foreground font-mono">({eg.alias})</span>
//                             )}
//                           </div>
//                           <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
//                             {eg && <span>{eg.parent}</span>}
//                             {eg && (
//                               <Badge variant="outline" className="text-[9px]">{eg.nature}</Badge>
//                             )}
//                           </div>
//                         </button>
//                       </li>
//                     );
//                   })}
//                 </ul>

//                 {/* Footer hint */}
//                 <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">
//                   Type to search · ↑↓ navigate · Enter select · Esc back
//                 </div>
//               </div>
//             )}
//           </motion.div>
//         </motion.div>
//       )}
//     </AnimatePresence>
//   );
// }


import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FolderTree, Layers, Pencil, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MultiGroupMode } from "./MultiGroupPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MultiGroupChoice {
  mode: MultiGroupMode;
  presetGroup?: string;
}

interface Props {
  open: boolean;
  customGroups: Array<{
    id: number;
    name: string;
    alias?: string;
    parent: string | null;
    nature: string;
    dbId?: number;
  }>;
  onClose: () => void;
  onSelect: (choice: MultiGroupChoice) => void;
}

type Stage = "ops" | "selectGroup";

const OPS = [
  { key: "create" as const, label: "Multi Create", desc: "Create multiple groups in a single grid", icon: Plus },
  { key: "alter" as const, label: "Multi Alter", desc: "Bulk edit existing groups inline", icon: Pencil },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MultiGroupSelector({ open, customGroups, onClose, onSelect }: Props) {
  const [stage, setStage] = useState<Stage>("ops");
  const [opsIdx, setOpsIdx] = useState(0);
  const [groupQuery, setGroupQuery] = useState("");
  const [groupIdx, setGroupIdx] = useState(0);
  const groupInputRef = useRef<HTMLInputElement>(null);

  // Groups available for alter
  const existingGroupNames = useMemo(
    () => customGroups.map(g => g.name),
    [customGroups]
  );

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return existingGroupNames;
    return existingGroupNames
      .filter(n => n.toLowerCase().includes(q))
      .sort((a, b) => a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q));
  }, [existingGroupNames, groupQuery]);

  // Reset state whenever dialog opens
  useEffect(() => {
    if (!open) return;
    setStage("ops");
    setOpsIdx(0);
    setGroupQuery("");
    setGroupIdx(0);
  }, [open]);

  // Focus the group search input when entering selectGroup stage
  useEffect(() => {
    if (stage === "selectGroup") {
      setGroupQuery("");
      setGroupIdx(0);
      setTimeout(() => groupInputRef.current?.focus(), 30);
    }
  }, [stage]);

  // Global keyboard handler
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (stage === "selectGroup") setStage("ops");
        else onClose();
        return;
      }
      if (stage === "ops") {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpsIdx(i => Math.min(i + 1, OPS.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setOpsIdx(i => Math.max(i - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); pickOp(OPS[opsIdx].key); }
      }
      // Note: selectGroup keyboard events are handled by the input itself
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, stage, opsIdx, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickOp = (key: MultiGroupMode) => {
    if (key === "create") {
      onClose();
      onSelect({ mode: "create" });
    } else {
      setStage("selectGroup");
    }
  };

  const pickGroup = (name: string) => {
    onClose();
    // Find the parent for this group from customGroups
    const eg = customGroups.find(g => g.name === name);
    onSelect({ mode: "alter", presetGroup: eg?.parent ?? name });
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-24 px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/40">
              <div className="flex items-center gap-2">
                {stage === "ops"
                  ? <FolderTree className="h-4 w-4 text-primary" />
                  : <Layers className="h-4 w-4 text-primary" />
                }
                <h2 className="text-sm font-semibold">
                  {stage === "ops" ? "Multi Group Operations" : "Select Group to Alter"}
                </h2>
                <Badge variant="outline" className="text-[10px] font-mono ml-1">Alt+H</Badge>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded hover:bg-accent"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* ── Operations list ── */}
            {stage === "ops" && (
              <ul
                tabIndex={0}
                autoFocus
                className="py-1 outline-none"
                onKeyDown={e => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setOpsIdx(i => Math.min(i + 1, OPS.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setOpsIdx(i => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); pickOp(OPS[opsIdx].key); }
                }}
              >
                {OPS.map((op, i) => {
                  const Icon = op.icon;
                  return (
                    <li key={op.key}>
                      <button
                        type="button"
                        onMouseEnter={() => setOpsIdx(i)}
                        onClick={() => pickOp(op.key)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${i === opsIdx ? "bg-accent" : "hover:bg-secondary"
                          }`}
                      >
                        <span className="w-6 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="flex-1">
                          <span className="font-medium">{op.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{op.desc}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border mt-1">
                  ↑↓ navigate · Enter select · Esc cancel
                </li>
              </ul>
            )}

            {/* ── Group selection (alter mode) ── */}
            {stage === "selectGroup" && (
              <div className="flex flex-col">
                {/* Search input */}
                <div className="relative px-3 py-2 border-b border-border">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    ref={groupInputRef}
                    value={groupQuery}
                    onChange={e => { setGroupQuery(e.target.value); setGroupIdx(0); }}
                    placeholder="Search group…"
                    className="w-full h-9 pl-8 pr-3 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    onKeyDown={e => {
                      if (e.key === "ArrowDown") { e.preventDefault(); setGroupIdx(i => Math.min(i + 1, filteredGroups.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setGroupIdx(i => Math.max(i - 1, 0)); }
                      else if (e.key === "Enter") {
                        e.preventDefault();
                        const pick = filteredGroups[groupIdx];
                        if (pick) pickGroup(pick);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setStage("ops");
                      }
                    }}
                  />
                </div>

                {/* Group list */}
                <ul className="max-h-72 overflow-y-auto py-1">
                  {filteredGroups.length === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-muted-foreground">No matching groups</li>
                  )}
                  {filteredGroups.map((name, i) => {
                    const eg = customGroups.find(g => g.name === name);
                    return (
                      <li key={name}>
                        <button
                          type="button"
                          onMouseEnter={() => setGroupIdx(i)}
                          onMouseDown={e => { e.preventDefault(); pickGroup(name); }}
                          className={`w-full flex items-center justify-between px-4 py-1.5 text-left text-sm transition-colors ${i === groupIdx ? "bg-accent" : "hover:bg-secondary"
                            }`}
                        >
                          <div>
                            <span className="font-medium">{name}</span>
                            {eg?.alias && (
                              <span className="ml-2 text-[10px] text-muted-foreground font-mono">({eg.alias})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {eg && <span>{eg.parent}</span>}
                            {eg && (
                              <Badge variant="outline" className="text-[9px]">{eg.nature}</Badge>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* Footer hint */}
                <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">
                  Type to search · ↑↓ navigate · Enter select · Esc back
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
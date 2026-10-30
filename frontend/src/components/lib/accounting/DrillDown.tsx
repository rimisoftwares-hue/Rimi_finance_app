// import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import { Dialog, DialogContent } from "../../ui/dialog";
// import { ChevronRight, ArrowLeft, X, BarChart3, FileText, Calendar, Layers, Receipt, ScrollText, Activity } from "lucide-react";
// import { Button } from "../../ui/button";
// import { Badge } from "../../ui/badge";
// import {
//   MONTHS, VOUCHER_TYPES, getLedgerMonthly, getVouchersForMonth, getVoucherDetail, getLedgerAnalysis,
//   type VoucherSummary,
// } from "./mockData";

// // -------- Types --------
// export type DrillLevel =
//   | { kind: "group"; name: string; nature?: string; ledgers: { name: string; debit: number; credit: number }[] }
//   | { kind: "ledger"; name: string; opening?: number }
//   | { kind: "monthly"; ledger: string; month: string }
//   | { kind: "voucherRegister"; ledger: string; month: string; typeCode: string; typeName: string }
//   | { kind: "voucher"; voucher: VoucherSummary }
//   | { kind: "analysis"; ledger: string };

// interface DrillCtx {
//   open: (level: DrillLevel) => void;
//   push: (level: DrillLevel) => void;
//   pop: () => void;
//   jumpTo: (index: number) => void;
//   close: () => void;
//   stack: DrillLevel[];
// }

// const Ctx = createContext<DrillCtx | null>(null);
// export const useDrillDown = () => {
//   const c = useContext(Ctx);
//   if (!c) throw new Error("DrillDownProvider missing");
//   return c;
// };

// // -------- Provider --------
// export function DrillDownProvider({ children }: { children: ReactNode }) {
//   const [stack, setStack] = useState<DrillLevel[]>([]);
//   const api = useMemo<DrillCtx>(() => ({
//     stack,
//     open: (l) => setStack([l]),
//     push: (l) => setStack((s) => [...s, l]),
//     pop: () => setStack((s) => s.slice(0, -1)),
//     jumpTo: (i) => setStack((s) => s.slice(0, i + 1)),
//     close: () => setStack([]),
//   }), [stack]);

//   useEffect(() => {
//     if (stack.length === 0) return;
//     const handler = (e: KeyboardEvent) => {
//       if (e.key === "Escape" || (e.key === "Backspace" && (e.target as HTMLElement)?.tagName !== "INPUT")) {
//         if (stack.length > 1) { e.preventDefault(); api.pop(); }
//       }
//     };
//     window.addEventListener("keydown", handler);
//     return () => window.removeEventListener("keydown", handler);
//   }, [stack, api]);

//   return (
//     <Ctx.Provider value={api}>
//       {children}
//       <DrillHost />
//     </Ctx.Provider>
//   );
// }

// // -------- Clickable amount helper --------
// export function DrillAmount({ value, level, className = "" }: { value: number; level: DrillLevel; className?: string }) {
//   const { open } = useDrillDown();
//   return (
//     <button
//       onClick={(e) => { e.stopPropagation(); open(level); }}
//       className={`hover:underline hover:text-primary transition-colors cursor-pointer text-left ${className}`}
//     >
//       {value < 0 ? `(₹${Math.abs(value).toLocaleString()})` : `₹${value.toLocaleString()}`}
//     </button>
//   );
// }

// export function DrillLink({ children, level, className = "" }: { children: ReactNode; level: DrillLevel; className?: string }) {
//   const { open } = useDrillDown();
//   return (
//     <button
//       onClick={(e) => { e.stopPropagation(); open(level); }}
//       className={`hover:underline hover:text-primary transition-colors cursor-pointer text-left ${className}`}
//     >
//       {children}
//     </button>
//   );
// }

// // -------- Host Modal --------
// function levelLabel(l: DrillLevel): string {
//   switch (l.kind) {
//     case "group": return l.name;
//     case "ledger": return l.name;
//     case "monthly": return `${l.ledger} – ${l.month}`;
//     case "voucherRegister": return `${l.typeName} (${l.month})`;
//     case "voucher": return l.voucher.no;
//     case "analysis": return `Analysis: ${l.ledger}`;
//   }
// }

// function levelIcon(l: DrillLevel) {
//   switch (l.kind) {
//     case "group": return Layers;
//     case "ledger": return FileText;
//     case "monthly": return Calendar;
//     case "voucherRegister": return ScrollText;
//     case "voucher": return Receipt;
//     case "analysis": return Activity;
//   }
// }

// function DrillHost() {
//   const { stack, pop, jumpTo, close } = useDrillDown();
//   const open = stack.length > 0;
//   const current = stack[stack.length - 1];

//   return (
//     <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
//       <DialogContent className="max-w-6xl w-[95vw] p-0 max-h-[90vh] flex flex-col gap-0">
//         {/* Header / Breadcrumb */}
//         <div className="px-5 py-3 border-b bg-secondary/40 flex items-center gap-2 flex-wrap">
//           <Button size="sm" variant="ghost" disabled={stack.length <= 1} onClick={pop} className="h-7 px-2">
//             <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
//           </Button>
//           <div className="flex items-center gap-1 flex-wrap text-sm">
//             {stack.map((s, i) => {
//               const Icon = levelIcon(s);
//               const isLast = i === stack.length - 1;
//               return (
//                 <span key={i} className="flex items-center gap-1">
//                   {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
//                   <button
//                     onClick={() => jumpTo(i)}
//                     className={`flex items-center gap-1 px-2 py-0.5 rounded ${isLast ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
//                   >
//                     <Icon className="h-3 w-3" />
//                     {levelLabel(s)}
//                   </button>
//                 </span>
//               );
//             })}
//           </div>
//           <Button size="sm" variant="ghost" onClick={close} className="ml-auto h-7 w-7 p-0"><X className="h-4 w-4" /></Button>
//         </div>

//         {/* Body */}
//         <div className="flex-1 overflow-auto">
//           <AnimatePresence mode="wait">
//             <motion.div
//               key={stack.length + (current ? current.kind : "")}
//               initial={{ opacity: 0, x: 10 }}
//               animate={{ opacity: 1, x: 0 }}
//               exit={{ opacity: 0, x: -10 }}
//               transition={{ duration: 0.18 }}
//               className="p-5"
//             >
//               {current && <LevelView level={current} />}
//             </motion.div>
//           </AnimatePresence>
//         </div>

//         <div className="px-5 py-2 border-t bg-secondary/30 text-[11px] text-muted-foreground flex justify-between">
//           <span>Enter = Drill Down • Esc / Backspace = Back</span>
//           <span>{stack.length} level{stack.length > 1 ? "s" : ""} deep</span>
//         </div>
//       </DialogContent>
//     </Dialog>
//   );
// }

// // -------- Levels --------
// function LevelView({ level }: { level: DrillLevel }) {
//   switch (level.kind) {
//     case "group": return <GroupLevel l={level} />;
//     case "ledger": return <LedgerMonthlyLevel l={level} />;
//     case "monthly": return <VoucherTypeLevel l={level} />;
//     case "voucherRegister": return <VoucherRegisterLevel l={level} />;
//     case "voucher": return <VoucherDetailLevel l={level} />;
//     case "analysis": return <AnalysisLevel l={level} />;
//   }
// }

// function GroupLevel({ l }: { l: Extract<DrillLevel, { kind: "group" }> }) {
//   const { push } = useDrillDown();
//   const totalD = l.ledgers.reduce((s, x) => s + x.debit, 0);
//   const totalC = l.ledgers.reduce((s, x) => s + x.credit, 0);
//   return (
//     <div className="space-y-3">
//       <div className="flex items-center gap-2">
//         <h2 className="text-xl font-bold">{l.name}</h2>
//         {l.nature && <Badge variant="outline">{l.nature}</Badge>}
//       </div>
//       <p className="text-xs text-muted-foreground">Click any ledger to drill into monthly summary.</p>
//       <div className="rounded-lg border overflow-hidden">
//         <table className="w-full text-sm">
//           <thead className="bg-secondary/50">
//             <tr>
//               <th className="text-left px-3 py-2">Ledger</th>
//               <th className="text-right px-3 py-2 w-40">Debit</th>
//               <th className="text-right px-3 py-2 w-40">Credit</th>
//             </tr>
//           </thead>
//           <tbody>
//             {l.ledgers.map((row) => (
//               <tr key={row.name} className="border-t hover:bg-secondary/30 cursor-pointer"
//                 onClick={() => push({ kind: "ledger", name: row.name })}>
//                 <td className="px-3 py-2 text-primary hover:underline">{row.name}</td>
//                 <td className="px-3 py-2 text-right font-mono">{row.debit ? `₹${row.debit.toLocaleString()}` : "—"}</td>
//                 <td className="px-3 py-2 text-right font-mono">{row.credit ? `₹${row.credit.toLocaleString()}` : "—"}</td>
//               </tr>
//             ))}
//           </tbody>
//           <tfoot className="bg-secondary/50 font-bold">
//             <tr>
//               <td className="px-3 py-2">Total</td>
//               <td className="px-3 py-2 text-right font-mono">₹{totalD.toLocaleString()}</td>
//               <td className="px-3 py-2 text-right font-mono">₹{totalC.toLocaleString()}</td>
//             </tr>
//           </tfoot>
//         </table>
//       </div>
//     </div>
//   );
// }

// function LedgerMonthlyLevel({ l }: { l: Extract<DrillLevel, { kind: "ledger" }> }) {
//   const { push } = useDrillDown();
//   const rows = useMemo(() => getLedgerMonthly(l.name, l.opening || 0), [l.name, l.opening]);
//   const totalD = rows.reduce((s, r) => s + r.debit, 0);
//   const totalC = rows.reduce((s, r) => s + r.credit, 0);

//   return (
//     <div className="space-y-3">
//       <div className="flex items-center justify-between flex-wrap gap-2">
//         <h2 className="text-xl font-bold">{l.name} – Monthly Summary</h2>
//         <Button size="sm" variant="outline" onClick={() => push({ kind: "analysis", ledger: l.name })}>
//           <BarChart3 className="h-3.5 w-3.5 mr-1" /> Smart Analysis
//         </Button>
//       </div>
//       <div className="rounded-lg border overflow-hidden">
//         <table className="w-full text-sm">
//           <thead className="bg-secondary/50">
//             <tr>
//               <th className="text-left px-3 py-2">Month</th>
//               <th className="text-right px-3 py-2">Debit</th>
//               <th className="text-right px-3 py-2">Credit</th>
//               <th className="text-right px-3 py-2">Closing</th>
//               <th className="text-right px-3 py-2 w-24">Vouchers</th>
//             </tr>
//           </thead>
//           <tbody>
//             <tr className="bg-secondary/30 border-t">
//               <td className="px-3 py-2 font-medium">Opening Balance</td>
//               <td colSpan={2}></td>
//               <td className="px-3 py-2 text-right font-mono">₹{(l.opening || 0).toLocaleString()}</td>
//               <td></td>
//             </tr>
//             {rows.map((r) => (
//               <tr key={r.month} className="border-t hover:bg-secondary/30 cursor-pointer"
//                 onClick={() => push({ kind: "monthly", ledger: l.name, month: r.month })}>
//                 <td className="px-3 py-2 text-primary hover:underline">{r.month}</td>
//                 <td className="px-3 py-2 text-right font-mono">₹{r.debit.toLocaleString()}</td>
//                 <td className="px-3 py-2 text-right font-mono">₹{r.credit.toLocaleString()}</td>
//                 <td className="px-3 py-2 text-right font-mono">₹{r.closing.toLocaleString()}</td>
//                 <td className="px-3 py-2 text-right text-muted-foreground">{r.vouchers}</td>
//               </tr>
//             ))}
//           </tbody>
//           <tfoot className="bg-secondary/50 font-bold">
//             <tr>
//               <td className="px-3 py-2">Grand Total</td>
//               <td className="px-3 py-2 text-right font-mono">₹{totalD.toLocaleString()}</td>
//               <td className="px-3 py-2 text-right font-mono">₹{totalC.toLocaleString()}</td>
//               <td className="px-3 py-2 text-right font-mono">₹{(totalD - totalC + (l.opening || 0)).toLocaleString()}</td>
//               <td></td>
//             </tr>
//           </tfoot>
//         </table>
//       </div>
//     </div>
//   );
// }

// function VoucherTypeLevel({ l }: { l: Extract<DrillLevel, { kind: "monthly" }> }) {
//   const { push } = useDrillDown();
//   const counts = useMemo(() => {
//     const vs = getVouchersForMonth(l.ledger, l.month);
//     return VOUCHER_TYPES.map(t => {
//       const list = vs.filter(v => v.typeCode === t.code);
//       return { ...t, count: list.length, amount: list.reduce((s, v) => s + v.amount, 0) };
//     });
//   }, [l.ledger, l.month]);

//   return (
//     <div className="space-y-3">
//       <h2 className="text-xl font-bold">{l.month} – Voucher Types</h2>
//       <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
//         {counts.map((t) => (
//           <button key={t.code}
//             onClick={() => push({ kind: "voucherRegister", ledger: l.ledger, month: l.month, typeCode: t.code, typeName: t.name })}
//             className="dashboard-card text-left hover:border-primary hover:shadow-md transition-all">
//             <div className="flex items-center justify-between mb-2">
//               <span className="font-semibold">{t.name}</span>
//               <Badge variant="outline">{t.code}</Badge>
//             </div>
//             <p className="text-2xl font-bold text-primary">{t.count}</p>
//             <p className="text-xs text-muted-foreground mt-1">₹{t.amount.toLocaleString()}</p>
//           </button>
//         ))}
//       </div>
//     </div>
//   );
// }

// function VoucherRegisterLevel({ l }: { l: Extract<DrillLevel, { kind: "voucherRegister" }> }) {
//   const { push } = useDrillDown();
//   const list = useMemo(() => getVouchersForMonth(l.ledger, l.month, l.typeCode), [l.ledger, l.month, l.typeCode]);
//   return (
//     <div className="space-y-3">
//       <h2 className="text-xl font-bold">{l.typeName} Register – {l.month}</h2>
//       <div className="rounded-lg border overflow-hidden">
//         <table className="w-full text-sm">
//           <thead className="bg-secondary/50">
//             <tr>
//               <th className="text-left px-3 py-2">Date</th>
//               <th className="text-left px-3 py-2">Voucher No</th>
//               <th className="text-left px-3 py-2">Party</th>
//               <th className="text-left px-3 py-2">Narration</th>
//               <th className="text-right px-3 py-2 w-32">Amount</th>
//             </tr>
//           </thead>
//           <tbody>
//             {list.map((v) => (
//               <tr key={v.no} className="border-t hover:bg-secondary/30 cursor-pointer"
//                 onClick={() => push({ kind: "voucher", voucher: v })}>
//                 <td className="px-3 py-2 text-muted-foreground">{v.date}</td>
//                 <td className="px-3 py-2 text-primary font-mono hover:underline">{v.no}</td>
//                 <td className="px-3 py-2">{v.party}</td>
//                 <td className="px-3 py-2 text-muted-foreground">{v.narration}</td>
//                 <td className="px-3 py-2 text-right font-mono font-medium">₹{v.amount.toLocaleString()}</td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }

// function VoucherDetailLevel({ l }: { l: Extract<DrillLevel, { kind: "voucher" }> }) {
//   const { push } = useDrillDown();
//   const d = useMemo(() => getVoucherDetail(l.voucher), [l.voucher]);
//   return (
//     <div className="space-y-4">
//       <div className="flex items-center justify-between flex-wrap gap-2">
//         <div>
//           <h2 className="text-xl font-bold">{d.no}</h2>
//           <p className="text-xs text-muted-foreground">{d.type} • {d.date}</p>
//         </div>
//         <Badge variant={d.approval === "Approved" ? "default" : d.approval === "Pending" ? "secondary" : "outline"}>{d.approval}</Badge>
//       </div>

//       <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
//         {[
//           ["Reference", d.reference], ["Cost Centre", d.costCentre], ["Branch", d.branch],
//           ["Employee", d.employee], ["Agent", d.agent], ["Scheme", d.scheme || "—"],
//           ["Vehicle", d.vehicle || "—"], ["Loan A/c", d.loanAccount || "—"],
//         ].map(([k, v]) => (
//           <div key={k} className="dashboard-card !p-3">
//             <p className="text-muted-foreground">{k}</p>
//             <p className="font-medium text-foreground mt-0.5">{v}</p>
//           </div>
//         ))}
//       </div>

//       <div>
//         <h3 className="text-sm font-semibold mb-2">Ledger Allocation</h3>
//         <div className="rounded-lg border overflow-hidden">
//           <table className="w-full text-sm">
//             <thead className="bg-secondary/50">
//               <tr>
//                 <th className="text-left px-3 py-2">Ledger</th>
//                 <th className="text-right px-3 py-2 w-32">Debit</th>
//                 <th className="text-right px-3 py-2 w-32">Credit</th>
//               </tr>
//             </thead>
//             <tbody>
//               {d.entries.map((e, i) => (
//                 <tr key={i} className="border-t hover:bg-secondary/30 cursor-pointer"
//                   onClick={() => push({ kind: "ledger", name: e.ledger })}>
//                   <td className="px-3 py-2 text-primary hover:underline">{e.ledger}</td>
//                   <td className="px-3 py-2 text-right font-mono">{e.debit ? `₹${e.debit.toLocaleString()}` : "—"}</td>
//                   <td className="px-3 py-2 text-right font-mono">{e.credit ? `₹${e.credit.toLocaleString()}` : "—"}</td>
//                 </tr>
//               ))}
//             </tbody>
//             <tfoot className="bg-secondary/50 font-bold">
//               <tr>
//                 <td className="px-3 py-2">Total</td>
//                 <td className="px-3 py-2 text-right font-mono">₹{d.amount.toLocaleString()}</td>
//                 <td className="px-3 py-2 text-right font-mono">₹{d.amount.toLocaleString()}</td>
//               </tr>
//             </tfoot>
//           </table>
//         </div>
//       </div>

//       <div>
//         <h3 className="text-sm font-semibold mb-2">Audit Trail</h3>
//         <div className="dashboard-card !p-3 text-xs space-y-1">
//           <div className="flex justify-between"><span className="text-muted-foreground">Created By</span><span>{d.createdBy} @ {d.createdAt}</span></div>
//           {d.modifiedBy && <div className="flex justify-between"><span className="text-muted-foreground">Modified By</span><span>{d.modifiedBy} @ {d.modifiedAt}</span></div>}
//           <div className="flex justify-between"><span className="text-muted-foreground">Approval</span><span>{d.approval}</span></div>
//           <div className="flex justify-between"><span className="text-muted-foreground">Narration</span><span>{d.narration}</span></div>
//         </div>
//       </div>
//     </div>
//   );
// }

// function AnalysisLevel({ l }: { l: Extract<DrillLevel, { kind: "analysis" }> }) {
//   const a = useMemo(() => getLedgerAnalysis(l.ledger), [l.ledger]);
//   const stats = [
//     ["Opening Balance", a.opening], ["Total Debit", a.totalDebit], ["Total Credit", a.totalCredit],
//     ["Net Movement", a.netMovement], ["Closing Balance", a.closing],
//     ["Total Vouchers", a.vouchers], ["Avg Voucher", a.avg],
//     ["Largest Txn", a.largest], ["Smallest Txn", a.smallest],
//   ];
//   return (
//     <div className="space-y-3">
//       <h2 className="text-xl font-bold">Smart Analysis – {l.ledger}</h2>
//       <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
//         {stats.map(([k, v]) => (
//           <div key={k as string} className="dashboard-card">
//             <p className="text-xs text-muted-foreground">{k}</p>
//             <p className="text-xl font-bold mt-1 font-mono">
//               {typeof v === "number" && (k as string).includes("Voucher") && !(k as string).includes("Avg")
//                 ? v.toLocaleString()
//                 : `₹${(v as number).toLocaleString()}`}
//             </p>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronRight, ArrowLeft, X, BarChart3, FileText, Calendar, Layers, Receipt, ScrollText, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MonthlyAnalysisChart } from "@/components/accounts/MonthlyAnalysisChart";
import {
  MONTHS, VOUCHER_TYPES, getLedgerMonthly, getVouchersForMonth, getVoucherDetail, getLedgerAnalysis,
  type VoucherSummary,
} from "./mockData";

// -------- Types --------
export type DrillLevel =
  | { kind: "group"; name: string; nature?: string; ledgers: { name: string; debit: number; credit: number }[] }
  | { kind: "ledger"; name: string; opening?: number }
  | { kind: "monthly"; ledger: string; month: string }
  | { kind: "voucherRegister"; ledger: string; month: string; typeCode: string; typeName: string }
  | { kind: "voucher"; voucher: VoucherSummary }
  | { kind: "analysis"; ledger: string };

interface DrillCtx {
  open: (level: DrillLevel) => void;
  push: (level: DrillLevel) => void;
  pop: () => void;
  jumpTo: (index: number) => void;
  close: () => void;
  stack: DrillLevel[];
}

const Ctx = createContext<DrillCtx | null>(null);
export const useDrillDown = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("DrillDownProvider missing");
  return c;
};

// -------- Provider --------
export function DrillDownProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<DrillLevel[]>([]);
  const api = useMemo<DrillCtx>(() => ({
    stack,
    open: (l) => setStack([l]),
    push: (l) => setStack((s) => [...s, l]),
    pop: () => setStack((s) => s.slice(0, -1)),
    jumpTo: (i) => setStack((s) => s.slice(0, i + 1)),
    close: () => setStack([]),
  }), [stack]);

  useEffect(() => {
    if (stack.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === "Backspace" && (e.target as HTMLElement)?.tagName !== "INPUT")) {
        if (stack.length > 1) { e.preventDefault(); api.pop(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stack, api]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <DrillHost />
    </Ctx.Provider>
  );
}

// -------- Clickable amount helper --------
export function DrillAmount({ value, level, className = "" }: { value: number; level: DrillLevel; className?: string }) {
  const { open } = useDrillDown();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); open(level); }}
      className={`hover:underline hover:text-primary transition-colors cursor-pointer text-left ${className}`}
    >
      {value < 0 ? `(₹${Math.abs(value).toLocaleString()})` : `₹${value.toLocaleString()}`}
    </button>
  );
}

export function DrillLink({ children, level, className = "" }: { children: ReactNode; level: DrillLevel; className?: string }) {
  const { open } = useDrillDown();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); open(level); }}
      className={`hover:underline hover:text-primary transition-colors cursor-pointer text-left ${className}`}
    >
      {children}
    </button>
  );
}

// -------- Host Modal --------
function levelLabel(l: DrillLevel): string {
  switch (l.kind) {
    case "group": return l.name;
    case "ledger": return l.name;
    case "monthly": return `${l.ledger} – ${l.month}`;
    case "voucherRegister": return `${l.typeName} (${l.month})`;
    case "voucher": return l.voucher.no;
    case "analysis": return `Analysis: ${l.ledger}`;
  }
}

function levelIcon(l: DrillLevel) {
  switch (l.kind) {
    case "group": return Layers;
    case "ledger": return FileText;
    case "monthly": return Calendar;
    case "voucherRegister": return ScrollText;
    case "voucher": return Receipt;
    case "analysis": return Activity;
  }
}

function DrillHost() {
  const { stack, pop, jumpTo, close } = useDrillDown();
  const open = stack.length > 0;
  const current = stack[stack.length - 1];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-6xl w-[95vw] p-0 max-h-[90vh] flex flex-col gap-0">
        {/* Header / Breadcrumb */}
        <div className="px-5 py-3 border-b bg-secondary/40 flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" disabled={stack.length <= 1} onClick={pop} className="h-7 px-2">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-1 flex-wrap text-sm">
            {stack.map((s, i) => {
              const Icon = levelIcon(s);
              const isLast = i === stack.length - 1;
              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <button
                    onClick={() => jumpTo(i)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded ${isLast ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                  >
                    <Icon className="h-3 w-3" />
                    {levelLabel(s)}
                  </button>
                </span>
              );
            })}
          </div>
          <Button size="sm" variant="ghost" onClick={close} className="ml-auto h-7 w-7 p-0"><X className="h-4 w-4" /></Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={stack.length + (current ? current.kind : "")}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="p-5"
            >
              {current && <LevelView level={current} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="px-5 py-2 border-t bg-secondary/30 text-[11px] text-muted-foreground flex justify-between">
          <span>Enter = Drill Down • Esc / Backspace = Back</span>
          <span>{stack.length} level{stack.length > 1 ? "s" : ""} deep</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -------- Levels --------
function LevelView({ level }: { level: DrillLevel }) {
  switch (level.kind) {
    case "group": return <GroupLevel l={level} />;
    case "ledger": return <LedgerMonthlyLevel l={level} />;
    case "monthly": return <VoucherTypeLevel l={level} />;
    case "voucherRegister": return <VoucherRegisterLevel l={level} />;
    case "voucher": return <VoucherDetailLevel l={level} />;
    case "analysis": return <AnalysisLevel l={level} />;
  }
}

function GroupLevel({ l }: { l: Extract<DrillLevel, { kind: "group" }> }) {
  const { push } = useDrillDown();
  const totalD = l.ledgers.reduce((s, x) => s + x.debit, 0);
  const totalC = l.ledgers.reduce((s, x) => s + x.credit, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold">{l.name}</h2>
        {l.nature && <Badge variant="outline">{l.nature}</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">Click any ledger to drill into monthly summary.</p>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr>
              <th className="text-left px-3 py-2">Ledger</th>
              <th className="text-right px-3 py-2 w-40">Debit</th>
              <th className="text-right px-3 py-2 w-40">Credit</th>
            </tr>
          </thead>
          <tbody>
            {l.ledgers.map((row) => (
              <tr key={row.name} className="border-t hover:bg-secondary/30 cursor-pointer"
                onClick={() => push({ kind: "ledger", name: row.name })}>
                <td className="px-3 py-2 text-primary hover:underline">{row.name}</td>
                <td className="px-3 py-2 text-right font-mono">{row.debit ? `₹${row.debit.toLocaleString()}` : "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{row.credit ? `₹${row.credit.toLocaleString()}` : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-secondary/50 font-bold">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right font-mono">₹{totalD.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-mono">₹{totalC.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function LedgerMonthlyLevel({ l }: { l: Extract<DrillLevel, { kind: "ledger" }> }) {
  const { push } = useDrillDown();
  const rows = useMemo(() => getLedgerMonthly(l.name, l.opening || 0), [l.name, l.opening]);
  const totalD = rows.reduce((s, r) => s + r.debit, 0);
  const totalC = rows.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">{l.name} – Monthly Summary</h2>
        <Button size="sm" variant="outline" onClick={() => push({ kind: "analysis", ledger: l.name })}>
          <BarChart3 className="h-3.5 w-3.5 mr-1" /> Smart Analysis
        </Button>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr>
              <th className="text-left px-3 py-2">Month</th>
              <th className="text-right px-3 py-2">Debit</th>
              <th className="text-right px-3 py-2">Credit</th>
              <th className="text-right px-3 py-2">Closing</th>
              <th className="text-right px-3 py-2 w-24">Vouchers</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-secondary/30 border-t">
              <td className="px-3 py-2 font-medium">Opening Balance</td>
              <td colSpan={2}></td>
              <td className="px-3 py-2 text-right font-mono">₹{(l.opening || 0).toLocaleString()}</td>
              <td></td>
            </tr>
            {rows.map((r) => (
              <tr key={r.month} className="border-t hover:bg-secondary/30 cursor-pointer"
                onClick={() => push({ kind: "monthly", ledger: l.name, month: r.month })}>
                <td className="px-3 py-2 text-primary hover:underline">{r.month}</td>
                <td className="px-3 py-2 text-right font-mono">₹{r.debit.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">₹{r.credit.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">₹{r.closing.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{r.vouchers}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-secondary/50 font-bold">
            <tr>
              <td className="px-3 py-2">Grand Total</td>
              <td className="px-3 py-2 text-right font-mono">₹{totalD.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-mono">₹{totalC.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-mono">₹{(totalD - totalC + (l.opening || 0)).toLocaleString()}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <MonthlyAnalysisChart
        title="Monthly Debit vs Credit Analysis"
        subtitle="Click a month to drill: Voucher Type → Register → Detail"
        data={rows.map(r => ({ month: r.month, Debit: r.debit, Credit: r.credit, Closing: r.closing }))}
        xKey="month"
        bars={[
          { key: "Debit", label: "Debit", color: "hsl(var(--primary))" },
          { key: "Credit", label: "Credit", color: "hsl(var(--income))" },
        ]}
        lineKey="Closing"
        lineColor="hsl(var(--expense))"
        onBarClick={(row) => push({ kind: "monthly", ledger: l.name, month: row.month })}
      />
    </div>
  );
}


function VoucherTypeLevel({ l }: { l: Extract<DrillLevel, { kind: "monthly" }> }) {
  const { push } = useDrillDown();
  const counts = useMemo(() => {
    const vs = getVouchersForMonth(l.ledger, l.month);
    return VOUCHER_TYPES.map(t => {
      const list = vs.filter(v => v.typeCode === t.code);
      return { ...t, count: list.length, amount: list.reduce((s, v) => s + v.amount, 0) };
    });
  }, [l.ledger, l.month]);

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">{l.month} – Voucher Types</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {counts.map((t) => (
          <button key={t.code}
            onClick={() => push({ kind: "voucherRegister", ledger: l.ledger, month: l.month, typeCode: t.code, typeName: t.name })}
            className="dashboard-card text-left hover:border-primary hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{t.name}</span>
              <Badge variant="outline">{t.code}</Badge>
            </div>
            <p className="text-2xl font-bold text-primary">{t.count}</p>
            <p className="text-xs text-muted-foreground mt-1">₹{t.amount.toLocaleString()}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function VoucherRegisterLevel({ l }: { l: Extract<DrillLevel, { kind: "voucherRegister" }> }) {
  const { push } = useDrillDown();
  const list = useMemo(() => getVouchersForMonth(l.ledger, l.month, l.typeCode), [l.ledger, l.month, l.typeCode]);
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">{l.typeName} Register – {l.month}</h2>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Voucher No</th>
              <th className="text-left px-3 py-2">Party</th>
              <th className="text-left px-3 py-2">Narration</th>
              <th className="text-right px-3 py-2 w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.no} className="border-t hover:bg-secondary/30 cursor-pointer"
                onClick={() => push({ kind: "voucher", voucher: v })}>
                <td className="px-3 py-2 text-muted-foreground">{v.date}</td>
                <td className="px-3 py-2 text-primary font-mono hover:underline">{v.no}</td>
                <td className="px-3 py-2">{v.party}</td>
                <td className="px-3 py-2 text-muted-foreground">{v.narration}</td>
                <td className="px-3 py-2 text-right font-mono font-medium">₹{v.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VoucherDetailLevel({ l }: { l: Extract<DrillLevel, { kind: "voucher" }> }) {
  const { push } = useDrillDown();
  const d = useMemo(() => getVoucherDetail(l.voucher), [l.voucher]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold">{d.no}</h2>
          <p className="text-xs text-muted-foreground">{d.type} • {d.date}</p>
        </div>
        <Badge variant={d.approval === "Approved" ? "default" : d.approval === "Pending" ? "secondary" : "outline"}>{d.approval}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {[
          ["Reference", d.reference], ["Cost Centre", d.costCentre], ["Branch", d.branch],
          ["Employee", d.employee], ["Agent", d.agent], ["Scheme", d.scheme || "—"],
          ["Vehicle", d.vehicle || "—"], ["Loan A/c", d.loanAccount || "—"],
        ].map(([k, v]) => (
          <div key={k} className="dashboard-card !p-3">
            <p className="text-muted-foreground">{k}</p>
            <p className="font-medium text-foreground mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Ledger Allocation</h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-3 py-2">Ledger</th>
                <th className="text-right px-3 py-2 w-32">Debit</th>
                <th className="text-right px-3 py-2 w-32">Credit</th>
              </tr>
            </thead>
            <tbody>
              {d.entries.map((e, i) => (
                <tr key={i} className="border-t hover:bg-secondary/30 cursor-pointer"
                  onClick={() => push({ kind: "ledger", name: e.ledger })}>
                  <td className="px-3 py-2 text-primary hover:underline">{e.ledger}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.debit ? `₹${e.debit.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.credit ? `₹${e.credit.toLocaleString()}` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-secondary/50 font-bold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right font-mono">₹{d.amount.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">₹{d.amount.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Audit Trail</h3>
        <div className="dashboard-card !p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Created By</span><span>{d.createdBy} @ {d.createdAt}</span></div>
          {d.modifiedBy && <div className="flex justify-between"><span className="text-muted-foreground">Modified By</span><span>{d.modifiedBy} @ {d.modifiedAt}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Approval</span><span>{d.approval}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Narration</span><span>{d.narration}</span></div>
        </div>
      </div>
    </div>
  );
}

function AnalysisLevel({ l }: { l: Extract<DrillLevel, { kind: "analysis" }> }) {
  const a = useMemo(() => getLedgerAnalysis(l.ledger), [l.ledger]);
  const stats = [
    ["Opening Balance", a.opening], ["Total Debit", a.totalDebit], ["Total Credit", a.totalCredit],
    ["Net Movement", a.netMovement], ["Closing Balance", a.closing],
    ["Total Vouchers", a.vouchers], ["Avg Voucher", a.avg],
    ["Largest Txn", a.largest], ["Smallest Txn", a.smallest],
  ];
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">Smart Analysis – {l.ledger}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map(([k, v]) => (
          <div key={k as string} className="dashboard-card">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-xl font-bold mt-1 font-mono">
              {typeof v === "number" && (k as string).includes("Voucher") && !(k as string).includes("Avg")
                ? v.toLocaleString()
                : `₹${(v as number).toLocaleString()}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}


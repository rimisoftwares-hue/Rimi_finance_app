import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import { useDrillDown } from "../lib/accounting/DrillDown";
import type { VoucherSummary } from "../lib/accounting/mockData";

const allTransactions = [
  { id: 1, date: "2025-02-26", refNo: "TXN-001", description: "EMI Collection - Rajesh Kumar (OWN-0001)", credit: 15000, debit: 0 },
  { id: 2, date: "2025-02-26", refNo: "TXN-002", description: "Office Rent Payment", credit: 0, debit: 25000 },
  { id: 3, date: "2025-02-26", refNo: "TXN-003", description: "EMI Collection - Suresh Babu (FR-0012)", credit: 8500, debit: 0 },
  { id: 4, date: "2025-02-26", refNo: "TXN-004", description: "Staff Salary - Raju", credit: 0, debit: 18000 },
  { id: 5, date: "2025-02-26", refNo: "TXN-005", description: "Loan Disbursement - New Customer", credit: 0, debit: 150000 },
  { id: 6, date: "2025-02-26", refNo: "TXN-006", description: "EMI Collection - Priya Devi (OWN-0034)", credit: 12000, debit: 0 },
  { id: 7, date: "2025-02-26", refNo: "TXN-007", description: "Doc Charges Received", credit: 3500, debit: 0 },
  { id: 8, date: "2025-02-26", refNo: "TXN-008", description: "Vehicle Insurance Payment", credit: 0, debit: 8500 },
  { id: 9, date: "2025-02-25", refNo: "TXN-009", description: "Penalty Collection - Manoj Singh", credit: 5000, debit: 0 },
  { id: 10, date: "2025-02-25", refNo: "TXN-010", description: "Electricity Bill", credit: 0, debit: 4200 },
  { id: 11, date: "2025-02-24", refNo: "TXN-011", description: "EMI Collection - Arun Prakash", credit: 9500, debit: 0 },
  { id: 12, date: "2025-02-24", refNo: "TXN-012", description: "Fuel Expenses", credit: 0, debit: 3200 },
  { id: 13, date: "2025-02-20", refNo: "TXN-013", description: "EMI Collection - Deepa Kumari", credit: 8700, debit: 0 },
  { id: 14, date: "2025-02-20", refNo: "TXN-014", description: "Internet Bill", credit: 0, debit: 1800 },
];

const baseOpeningBalance = 485000;

type QuickFilter = "today" | "week" | "month" | "custom";

function getQuickDates(qf: QuickFilter): { from: string; to: string } {
  const today = new Date("2025-02-26");
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  if (qf === "today") return { from: fmt(today), to: fmt(today) };
  if (qf === "week") { const w = new Date(today); w.setDate(today.getDate() - 6); return { from: fmt(w), to: fmt(today) }; }
  if (qf === "month") return { from: "2025-02-01", to: fmt(today) };
  return { from: "", to: "" };
}

export default function DayBook() {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("today");
  const [dateFrom, setDateFrom] = useState("2025-02-26");
  const [dateTo, setDateTo] = useState("2025-02-26");
  const { open } = useDrillDown();

  const handleQuickFilter = (qf: QuickFilter) => {
    setQuickFilter(qf);
    if (qf !== "custom") { const d = getQuickDates(qf); setDateFrom(d.from); setDateTo(d.to); }
  };

  const openVoucher = (t: typeof allTransactions[number]) => {
    const isCredit = t.credit > 0;
    const v: VoucherSummary = {
      no: t.refNo, date: t.date,
      type: isCredit ? "Receipt" : "Payment",
      typeCode: isCredit ? "REC" : "PAY",
      party: t.description, narration: t.description,
      amount: t.credit || t.debit,
      drLedger: isCredit ? "Cash in Hand" : t.description,
      crLedger: isCredit ? t.description : "Cash in Hand",
    };
    open({ kind: "voucher", voucher: v });
  };

  const filtered = useMemo(() => allTransactions.filter(t => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  }), [dateFrom, dateTo]);

  const priorTransactions = useMemo(() => allTransactions.filter(t => dateFrom && t.date < dateFrom), [dateFrom]);
  const openingBalance = baseOpeningBalance + priorTransactions.reduce((s, t) => s + t.credit - t.debit, 0);
  const totalCredit = filtered.reduce((s, t) => s + t.credit, 0);
  const totalDebit = filtered.reduce((s, t) => s + t.debit, 0);
  const closingBalance = openingBalance + totalCredit - totalDebit;

  let runningBalance = openingBalance;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Day Book</h1>
        <p className="text-muted-foreground mt-1">Daily transaction register</p>
      </motion.div>

      {/* Quick Filters + Date Range */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            {([["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["custom", "Custom"]] as [QuickFilter, string][]).map(([key, label]) => (
              <Button key={key} size="sm" variant={quickFilter === key ? "default" : "ghost"} className="text-xs" onClick={() => handleQuickFilter(key)}>{label}</Button>
            ))}
          </div>
          {quickFilter === "custom" && (
            <div className="flex items-center gap-2">
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">From</label><DatePicker value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From Date" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">To</label><DatePicker value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To Date" /></div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Opening Balance", value: openingBalance, color: "border-t-primary" },
          { label: "Total Credit", value: totalCredit, color: "border-t-income", icon: ArrowUpRight },
          { label: "Total Debit", value: totalDebit, color: "border-t-expense", icon: ArrowDownRight },
          { label: "Closing Balance", value: closingBalance, color: "border-t-primary" },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className={`dashboard-card border-t-4 ${item.color}`}>
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">₹{item.value.toLocaleString()}</p>
          </motion.div>
        ))}
      </div>

      {/* Transaction Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Date", "Ref No", "Description", "Credit", "Debit", "Balance"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-secondary/30">
                <td colSpan={5} className="px-4 py-2 text-sm font-medium text-foreground">Opening Balance</td>
                <td className="px-4 py-2 text-sm font-bold text-foreground">₹{openingBalance.toLocaleString()}</td>
              </tr>
              {filtered.map((t, i) => {
                runningBalance += t.credit - t.debit;
                return (
                  <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * i }} onClick={() => openVoucher(t)} className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-sm text-muted-foreground">{t.date}</td>
                    <td className="px-4 py-3 text-sm text-primary font-medium font-mono hover:underline">{t.refNo}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{t.description}</td>
                    <td className="px-4 py-3 text-sm font-medium text-income">{t.credit > 0 ? `₹${t.credit.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-expense">{t.debit > 0 ? `₹${t.debit.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">₹{runningBalance.toLocaleString()}</td>
                  </motion.tr>
                );
              })}
              <tr className="bg-secondary/50 font-bold">
                <td colSpan={3} className="px-4 py-3 text-sm text-foreground">Closing Balance</td>
                <td className="px-4 py-3 text-sm text-income">₹{totalCredit.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-expense">₹{totalDebit.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-foreground">₹{closingBalance.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

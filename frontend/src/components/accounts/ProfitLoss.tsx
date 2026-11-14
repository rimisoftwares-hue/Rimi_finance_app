import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { DrillLink, DrillAmount } from "../lib/accounting/DrillDown";
import { DatePicker } from "../ui/date-picker";
import { Label } from "../ui/label";
import { useAuth } from "../../contexts/AuthContext";
import { fetchProfitLoss } from "../../api/profitLossApi";
import type { ProfitLossData } from "../../types/profitLoss";

function getDefaultDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fyStartYear = month >= 4 ? year : year - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${fyStartYear}-04-01`,
    to: `${year}-${pad(month)}-${pad(now.getDate())}`,
  };
}

export default function ProfitLoss() {
  const { currentFinance } = useAuth();
  const def = useMemo(() => getDefaultDates(), []);
  const [dateFrom, setDateFrom] = useState(def.from);
  const [dateTo, setDateTo] = useState(def.to);
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchProfitLoss({ from: dateFrom, to: dateTo }, controller.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("fetchProfitLoss error:", err);
        setError(err?.response?.data?.message || err?.message || "Failed to load Profit & Loss statement");
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [currentFinance?.id, dateFrom, dateTo]);

  const expenses = data?.expenses || [];
  const incomes = data?.incomes || [];
  const totalExpense = data?.totalExpense ?? 0;
  const totalIncome = data?.totalIncome ?? 0;
  const netProfit = data?.netProfit ?? (totalIncome - totalExpense);
  const isProfit = data?.isProfit ?? (netProfit >= 0);
  const marginPct = data?.marginPct ?? (totalIncome !== 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : "0.0");

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Profit & Loss Statement</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {data ? `For the period ${dateFrom} to ${dateTo}` : "Profit & Loss statement"} · Click any ledger / amount to drill down
          </p>
        </div>
      </motion.div>

      {/* Date filter bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="dashboard-card !p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <DatePicker
            value={dateFrom}
            onChange={(e) => setDateFrom(e?.target?.value || e)}
            placeholder="From Date"
            className="min-w-[160px] w-auto"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <DatePicker
            value={dateTo}
            onChange={(e) => setDateTo(e?.target?.value || e)}
            placeholder="To Date"
            className="min-w-[160px] w-auto"
          />
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Updating...</span>
          </div>
        )}
      </motion.div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card border-t-4 border-t-expense">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-expense" />
            <p className="text-sm text-muted-foreground">Total Expenses</p>
          </div>
          <p className="text-2xl font-bold text-expense">₹{totalExpense.toLocaleString()}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card border-t-4 border-t-income">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-income" />
            <p className="text-sm text-muted-foreground">Total Income</p>
          </div>
          <p className="text-2xl font-bold text-income">₹{totalIncome.toLocaleString()}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`dashboard-card border-t-4 ${isProfit ? "border-t-income" : "border-t-expense"}`}
        >
          <p className="text-sm text-muted-foreground mb-1">{isProfit ? "Net Profit" : "Net Loss"}</p>
          <p className={`text-2xl font-bold ${isProfit ? "text-income" : "text-expense"}`}>
            {netProfit < 0 ? `-₹${Math.abs(netProfit).toLocaleString()}` : `₹${netProfit.toLocaleString()}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Margin: {marginPct}%</p>
        </motion.div>
      </div>

      {/* Two-column Expenses & Income tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-expense/5 border-b border-border">
            <DrillLink level={{ kind: "group", name: "Expenses", nature: "Expense", ledgers: expenses.map(e => ({ name: e.name, debit: e.amount, credit: 0 })) }} className="text-base font-semibold text-foreground">Expenses</DrillLink>
          </div>
          <table className="w-full">
            <tbody>
              {loading && expenses.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                    Loading expenses...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No expense records found for this period
                  </td>
                </tr>
              ) : (
                expenses.map((item) => (
                  <tr key={item.id || item.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <DrillLink level={{ kind: "ledger", name: item.name }} className="text-foreground">
                        {item.name}
                      </DrillLink>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      <DrillAmount value={item.amount} level={{ kind: "ledger", name: item.name }} className="text-expense" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/50 font-bold">
                <td className="px-4 py-3 text-sm text-foreground">Total Expenses</td>
                <td className="px-4 py-3 text-sm text-right text-expense">₹{totalExpense.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-income/5 border-b border-border">
            <DrillLink level={{ kind: "group", name: "Income", nature: "Income", ledgers: incomes.map(e => ({ name: e.name, debit: 0, credit: e.amount })) }} className="text-base font-semibold text-foreground">Income</DrillLink>
          </div>
          <table className="w-full">
            <tbody>
              {loading && incomes.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                    Loading income...
                  </td>
                </tr>
              ) : incomes.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No income records found for this period
                  </td>
                </tr>
              ) : (
                incomes.map((item) => (
                  <tr key={item.id || item.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <DrillLink level={{ kind: "ledger", name: item.name }} className="text-foreground">
                        {item.name}
                      </DrillLink>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      <DrillAmount value={item.amount} level={{ kind: "ledger", name: item.name }} className="text-income" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/50 font-bold">
                <td className="px-4 py-3 text-sm text-foreground">Total Income</td>
                <td className="px-4 py-3 text-sm text-right text-income">₹{totalIncome.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </motion.div>
      </div>
    </div>
  );
}

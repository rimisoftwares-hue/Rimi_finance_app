import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { CalendarIcon, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useAuth } from "../../contexts/AuthContext";
import { fetchDemandStatement } from "../../api/demandApi";
import type { DemandMonthRow, DemandSummary } from "../../types/demand";

const fmt = (v: number) =>
  v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Demand() {
  const { currentFinance } = useAuth();
  const financeId = currentFinance?.id;

  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [appliedRange, setAppliedRange] = useState<{ from?: string; to?: string }>({});

  const [months, setMonths] = useState<DemandMonthRow[]>([]);
  const [summary, setSummary] = useState<DemandSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDemand = useCallback(
    async (range: { from?: string; to?: string }, signal?: AbortSignal) => {
      if (!financeId) {
        setMonths([]);
        setSummary(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetchDemandStatement(range, signal);
        setMonths(res.months);
        setSummary(res.summary);
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
          return;
        }
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to load Demand Statement"
        );
      } finally {
        setLoading(false);
      }
    },
    [financeId]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadDemand(appliedRange, controller.signal);
    return () => controller.abort();
  }, [loadDemand, appliedRange]);

  const handleSubmit = () => {
    if (fromDate && toDate && fromDate > toDate) {
      setError("From Date must be on or before To Date");
      return;
    }
    setError(null);
    setAppliedRange({
      from: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
      to: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
    });
  };

  const handleClear = () => {
    setFromDate(undefined);
    setToDate(undefined);
    setError(null);
    setAppliedRange({});
  };

  const grandDemandP =
    summary?.demandPrincipal ??
    months.reduce((s, r) => s + r.demandPrincipal, 0);
  const grandDemandI =
    summary?.demandInterest ??
    months.reduce((s, r) => s + r.demandInterest, 0);
  const grandReceivedP =
    summary?.receivedPrincipal ??
    months.reduce((s, r) => s + r.receivedPrincipal, 0);
  const grandReceivedI =
    summary?.receivedInterest ??
    months.reduce((s, r) => s + r.receivedInterest, 0);
  const grandBalP =
    summary?.balancePrincipal ?? grandDemandP - grandReceivedP;
  const grandBalI =
    summary?.balanceInterest ?? grandDemandI - grandReceivedI;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Demand Statement</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Grouped demand, received & balance breakdown
          </p>
        </div>
      </motion.div>

      {/* Date Range Filter */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="dashboard-card"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              From Date
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] justify-start text-left font-normal",
                    !fromDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDate ? format(fromDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDate}
                  onSelect={setFromDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              To Date
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] justify-start text-left font-normal",
                    !toDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toDate ? format(toDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={toDate}
                  onSelect={setToDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={handleSubmit} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}{" "}
            Submit
          </Button>
          {(fromDate || toDate || appliedRange.from || appliedRange.to) && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>
        {error && (
          <p className="mt-3 text-xs font-medium text-destructive">{error}</p>
        )}
      </motion.div>

      {/* Grand Total at Top */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="dashboard-card bg-secondary/50"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-3 py-2"></th>
                <th
                  colSpan={3}
                  className="text-center px-3 py-1 text-xs font-bold text-primary uppercase border-b-2 border-primary"
                >
                  Demand
                </th>
                <th
                  colSpan={3}
                  className="text-center px-3 py-1 text-xs font-bold text-income uppercase border-b-2 border-income"
                >
                  Received
                </th>
                <th
                  colSpan={2}
                  className="text-center px-3 py-1 text-xs font-bold text-expense uppercase border-b-2 border-expense"
                >
                  Balance
                </th>
              </tr>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-semibold">
                  Grand Total
                </th>
                <th className="text-right px-3 py-2">Principal</th>
                <th className="text-right px-3 py-2">Interest</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Principal</th>
                <th className="text-right px-3 py-2">Interest</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Principal</th>
                <th className="text-right px-3 py-2">Interest</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-bold">
                <td className="px-3 py-2 text-foreground">All Months</td>
                <td className="px-3 py-2 text-right text-primary">
                  ₹{fmt(grandDemandP)}
                </td>
                <td className="px-3 py-2 text-right text-primary">
                  ₹{fmt(grandDemandI)}
                </td>
                <td className="px-3 py-2 text-right text-primary font-bold">
                  ₹{fmt(grandDemandP + grandDemandI)}
                </td>
                <td className="px-3 py-2 text-right text-income">
                  ₹{fmt(grandReceivedP)}
                </td>
                <td className="px-3 py-2 text-right text-income">
                  ₹{fmt(grandReceivedI)}
                </td>
                <td className="px-3 py-2 text-right text-income font-bold">
                  ₹{fmt(grandReceivedP + grandReceivedI)}
                </td>
                <td className="px-3 py-2 text-right text-expense">
                  ₹{fmt(grandBalP)}
                </td>
                <td className="px-3 py-2 text-right text-expense">
                  ₹{fmt(grandBalI)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Monthly Rows */}
      <div className="space-y-3">
        {loading && months.length === 0 ? (
          <div className="dashboard-card py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading demand statement...
          </div>
        ) : months.length === 0 ? (
          <div className="dashboard-card py-8 text-center text-sm text-muted-foreground">
            No demand records found for the selected period.
          </div>
        ) : (
          months.map((m, i) => {
            const dTotal = m.demandPrincipal + m.demandInterest;
            const rTotal = m.receivedPrincipal + m.receivedInterest;
            const balP = m.demandPrincipal - m.receivedPrincipal;
            const balI = m.demandInterest - m.receivedInterest;
            return (
              <motion.div
                key={m.monthKey || m.month}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i }}
                className="dashboard-card p-0 overflow-hidden"
              >
                <div className="grid grid-cols-10 gap-1 px-4 py-3 text-sm items-center">
                  <div className="col-span-2 flex items-center gap-2 font-semibold text-foreground text-left">
                    {m.month}
                  </div>
                  {/* Demand */}
                  <div className="text-right text-primary">
                    ₹{m.demandPrincipal.toLocaleString()}
                  </div>
                  <div className="text-right text-primary">
                    ₹{m.demandInterest.toLocaleString()}
                  </div>
                  <div className="text-right text-primary font-bold">
                    ₹{dTotal.toLocaleString()}
                  </div>
                  {/* Received */}
                  <div className="text-right text-income">
                    ₹{m.receivedPrincipal.toLocaleString()}
                  </div>
                  <div className="text-right text-income">
                    ₹{m.receivedInterest.toLocaleString()}
                  </div>
                  <div className="text-right text-income font-bold">
                    ₹{rTotal.toLocaleString()}
                  </div>
                  {/* Balance */}
                  <div className="text-right text-expense">
                    {balP > 0 ? `₹${balP.toLocaleString()}` : "—"}
                  </div>
                  <div className="text-right text-expense">
                    {balI > 0 ? `₹${balI.toLocaleString()}` : "—"}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

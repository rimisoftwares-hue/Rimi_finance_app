import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Loader2, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { DatePicker } from "../ui/date-picker";
import { useDrillDown } from "../lib/accounting/DrillDown";
import { useAuth } from "../../contexts/AuthContext";
import { fetchDayBookTransactions } from "../../api/daybookApi";
import type { DayBookRow, DayBookTransactionsResponse } from "../../types/daybook";

type QuickFilter = "today" | "week" | "month" | "custom";

function getQuickDates(qf: QuickFilter): { from: string; to: string } {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (qf === "today") {
    return { from: fmt(today), to: fmt(today) };
  }
  if (qf === "week") {
    const w = new Date(today);
    w.setDate(today.getDate() - 6);
    return { from: fmt(w), to: fmt(today) };
  }
  if (qf === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(start), to: fmt(today) };
  }
  return { from: "", to: "" };
}

export default function DayBook() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qFrom = searchParams.get("from");
  const qTo = searchParams.get("to");

  const initialDates = useMemo(() => {
    if (qFrom && qTo) {
      return { from: qFrom, to: qTo };
    }
    return getQuickDates("today");
  }, [qFrom, qTo]);

  const [quickFilter, setQuickFilter] = useState<QuickFilter>(() => {
    if (qFrom && qTo) return "custom";
    return "today";
  });
  const [dateFrom, setDateFrom] = useState(initialDates.from);
  const [dateTo, setDateTo] = useState(initialDates.to);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<DayBookTransactionsResponse>({
    from: initialDates.from,
    to: initialDates.to,
    openingBalance: 0,
    totalCredit: 0,
    totalDebit: 0,
    closingBalance: 0,
    rows: [],
  });

  const { open } = useDrillDown();
  const { currentFinance } = useAuth();

  const handleQuickFilter = (qf: QuickFilter) => {
    setQuickFilter(qf);
    if (qf !== "custom") {
      const d = getQuickDates(qf);
      setDateFrom(d.from);
      setDateTo(d.to);
      setSearchParams({ from: d.from, to: d.to });
    }
  };

  const handleDateFromChange = (newFrom: string) => {
    setDateFrom(newFrom);
    if (newFrom && dateTo) {
      setSearchParams({ from: newFrom, to: dateTo });
    }
  };

  const handleDateToChange = (newTo: string) => {
    setDateTo(newTo);
    if (dateFrom && newTo) {
      setSearchParams({ from: dateFrom, to: newTo });
    }
  };

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchDayBookTransactions(dateFrom, dateTo, controller.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err?.response?.data?.message || err?.message || "Failed to load Day Book transactions");
        setLoading(false);
      });

    return () => controller.abort();
  }, [dateFrom, dateTo, currentFinance?.id]);

  const openVoucher = (t: DayBookRow) => {
    open({
      kind: "voucher",
      voucher: {
        no: t.voucherNumber,
        date: t.date,
        type: t.voucherType,
        typeCode: t.typeCode,
        party: t.party,
        narration: t.narration,
        amount: Math.max(t.credit, t.debit),
        drLedger: "",
        crLedger: "",
      },
    });
  };

  const filteredRows = useMemo(() => {
    if (!search.trim()) return data.rows;
    const q = search.toLowerCase().trim();
    return data.rows.filter((t) => {
      const matchNo = t.voucherNumber.toLowerCase().includes(q);
      const matchType = t.voucherType.toLowerCase().includes(q);
      const matchNarr = (t.narration || "").toLowerCase().includes(q);
      const matchParty = (t.party || "").toLowerCase().includes(q);
      const matchLedgers = Array.isArray(t.ledgerNames) && t.ledgerNames.some((l) => l.toLowerCase().includes(q));
      return matchNo || matchType || matchNarr || matchParty || matchLedgers;
    });
  }, [data.rows, search]);

  const openingBalance = data.openingBalance;
  const totalCredit = data.totalCredit;
  const totalDebit = data.totalDebit;
  const closingBalance = data.closingBalance;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Day Book</h1>
          <p className="text-muted-foreground mt-1 text-sm">Daily transaction register</p>
        </div>
      </motion.div>

      {/* Quick Filters + Date Range + Search */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            {([["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["custom", "Custom"]] as [QuickFilter, string][]).map(([key, label]) => (
              <Button key={key} size="sm" variant={quickFilter === key ? "default" : "ghost"} className="text-xs" onClick={() => handleQuickFilter(key)}>{label}</Button>
            ))}
          </div>
          {quickFilter === "custom" && (
            <div className="flex items-center gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">From</label>
                <DatePicker value={dateFrom} onChange={e => handleDateFromChange(e?.target?.value || e)} placeholder="From Date" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
                <DatePicker value={dateTo} onChange={e => handleDateToChange(e?.target?.value || e)} placeholder="To Date" />
              </div>
            </div>
          )}
          <div className="ml-auto w-full md:w-64 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search vouchers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 text-xs pl-8"
            />
          </div>
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
            <p className="text-2xl font-bold text-foreground mt-1">₹{item.value.toLocaleString("en-IN")}</p>
          </motion.div>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Transaction Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Date", "Voucher Type", "Voucher Number", "Narration", "Credit", "Debit", "Balance"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-secondary/30">
                <td colSpan={6} className="px-4 py-2 text-sm font-medium text-foreground">Opening Balance</td>
                <td className="px-4 py-2 text-sm font-bold text-foreground">₹{openingBalance.toLocaleString("en-IN")}</td>
              </tr>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Loading Day Book...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {search ? `No vouchers found matching "${search}".` : "No vouchers found"}
                  </td>
                </tr>
              ) : (
                filteredRows.map((t, i) => (
                  <motion.tr
                    key={t.voucherId || t.voucherNumber}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.02 * Math.min(i, 20) }}
                    onClick={() => openVoucher(t)}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-sm text-muted-foreground">{t.date}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px] font-medium">
                        {t.voucherType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-primary font-medium font-mono hover:underline">{t.voucherNumber}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      <span>{t.narration || "—"}</span>
                      {t.party ? <span className="text-xs text-muted-foreground block">{t.party}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-income">{t.credit > 0 ? `₹${t.credit.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-expense">{t.debit > 0 ? `₹${t.debit.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">₹{t.balance.toLocaleString("en-IN")}</td>
                  </motion.tr>
                ))
              )}
              <tr className="bg-secondary/50 font-bold">
                <td colSpan={4} className="px-4 py-3 text-sm text-foreground">Closing Balance</td>
                <td className="px-4 py-3 text-sm text-income">₹{totalCredit.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-sm text-expense">₹{totalDebit.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-sm text-foreground">₹{closingBalance.toLocaleString("en-IN")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

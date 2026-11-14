import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ChevronDown,
  ChevronUp,
  Search,
  IndianRupee,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Receipt,
  Landmark,
  RotateCcw,
  LucideIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { fetchBusinessReport } from "../../api/businessApi";
import type {
  MonthlyBusinessRecord,
  DerivedBusinessMetrics,
  BusinessTotals,
  BusinessReportResponse,
} from "../../types/business";

export type { MonthlyBusinessRecord, DerivedBusinessMetrics };

const FULL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toPaise(val: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Math.sign(n) * 1e-12) * 100);
}

function fromPaise(paise: number): number {
  const v = Math.round(paise) / 100;
  return v === 0 ? 0 : v;
}

/**
 * Single source of truth for derived formulas using exact integer paise arithmetic:
 *   - totalCollection = principal + interest + defaultAmt + handLoan
 *   - netIncome       = interest + defaultAmt + docCharge
 *   - netCashFlow     = totalCollection - loanAmount
 */
export function computeDerived(row: MonthlyBusinessRecord): DerivedBusinessMetrics {
  const principalPaise = toPaise(row.principal);
  const interestPaise = toPaise(row.interest);
  const defaultAmtPaise = toPaise(row.defaultAmt);
  const handLoanPaise = toPaise(row.handLoan);
  const loanAmountPaise = toPaise(row.loanAmount);
  const docChargePaise = toPaise(row.docCharge);

  const totalCollectionPaise =
    principalPaise + interestPaise + defaultAmtPaise + handLoanPaise;
  const netIncomePaise = interestPaise + defaultAmtPaise + docChargePaise;
  const netCashFlowPaise = totalCollectionPaise - loanAmountPaise;

  return {
    totalCollection: fromPaise(totalCollectionPaise),
    netIncome: fromPaise(netIncomePaise),
    netCashFlow: fromPaise(netCashFlowPaise),
  };
}

export function computeTotals(rows: readonly MonthlyBusinessRecord[]): BusinessTotals {
  let principalPaise = 0;
  let interestPaise = 0;
  let defaultAmtPaise = 0;
  let handLoanPaise = 0;
  let hpCount = 0;
  let loanAmountPaise = 0;
  let docChargePaise = 0;

  for (const r of rows) {
    principalPaise += toPaise(r.principal);
    interestPaise += toPaise(r.interest);
    defaultAmtPaise += toPaise(r.defaultAmt);
    handLoanPaise += toPaise(r.handLoan);
    hpCount += Number(r.hpCount) || 0;
    loanAmountPaise += toPaise(r.loanAmount);
    docChargePaise += toPaise(r.docCharge);
  }

  const base = {
    principal: fromPaise(principalPaise),
    interest: fromPaise(interestPaise),
    defaultAmt: fromPaise(defaultAmtPaise),
    handLoan: fromPaise(handLoanPaise),
    hpCount,
    loanAmount: fromPaise(loanAmountPaise),
    docCharge: fromPaise(docChargePaise),
  };

  const derived = computeDerived({
    id: "total",
    month: "Grand Total",
    date: "",
    ...base,
  });

  return {
    ...base,
    ...derived,
  };
}

function getFullMonthLabel(row: MonthlyBusinessRecord): string {
  if (row.fullMonth) return row.fullMonth;
  const parts = row.id.split("-");
  if (parts.length === 2) {
    const year = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10);
    if (month >= 1 && month <= 12 && !Number.isNaN(year)) {
      return `${FULL_MONTH_NAMES[month - 1]} ${year}`;
    }
  }
  return row.month;
}

/**
 * Smart month search over loaded monthly records:
 * - Case-insensitive, whitespace-normalized.
 * - Matches short label ("aug 2026"), full label ("august 2026"), ISO ("2026-08"),
 *   month name alone ("aug", "august"), two-digit month number ("08"), and partial
 *   substrings ("aug 20").
 * - Note: a bare two-digit input "20" matches every 2020s month via the year ("202x").
 */
export function matchesMonthSearch(
  row: MonthlyBusinessRecord,
  rawQuery: string
): boolean {
  const q = rawQuery.toLowerCase().trim().replace(/\s+/g, " ");
  if (!q) return true;

  const iso = row.id.toLowerCase().trim(); // e.g. "2026-08"
  const monthNum = iso.length >= 7 ? iso.slice(5, 7) : ""; // e.g. "08"
  const shortLabel = row.month.toLowerCase().trim().replace(/\s+/g, " "); // e.g. "aug 2026"
  const fullLabel = getFullMonthLabel(row)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " "); // e.g. "august 2026"

  if (/^\d{2}$/.test(q) && q === monthNum) {
    return true;
  }

  return (
    shortLabel.includes(q) ||
    fullLabel.includes(q) ||
    iso.includes(q)
  );
}

function hasMonthActivity(row: MonthlyBusinessRecord): boolean {
  if (row.isFuture) return false;
  return (
    row.principal > 0 ||
    row.interest > 0 ||
    row.defaultAmt > 0 ||
    row.handLoan > 0 ||
    row.hpCount > 0 ||
    row.loanAmount > 0 ||
    row.docCharge > 0
  );
}

const fmt = (v: number) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtInt = (v: number) => v.toLocaleString("en-IN");

interface KpiCardItem {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  borderClass: string;
  iconClass: string;
}

export default function Business() {
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [chartMode, setChartMode] = useState<"grouped" | "stacked">("grouped");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const [reportData, setReportData] = useState<BusinessReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Validate date order using timezone-safe string comparison
  const isInvalidDateRange = useMemo(() => {
    if (!fromDate || !toDate) return false;
    return fromDate.trim() > toDate.trim();
  }, [fromDate, toDate]);

  const hasCustomRange = Boolean(appliedRange.from || appliedRange.to);

  const hasActiveFilter = Boolean(
    fromDate || toDate || appliedRange.from || appliedRange.to || searchTerm.trim()
  );

  const loadBusinessReport = useCallback(async (from: string, to: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await fetchBusinessReport(
        {
          from: from || undefined,
          to: to || undefined,
        },
        controller.signal
      );

      if (controller.signal.aborted) return;

      setReportData(data);

      // Default expandedMonth: the latest month that has activity (not a future month)
      const activeMonths = data.months.effective || [];
      let latestActiveId: string | null = null;
      for (let i = activeMonths.length - 1; i >= 0; i -= 1) {
        if (hasMonthActivity(activeMonths[i])) {
          latestActiveId = activeMonths[i].id;
          break;
        }
      }
      setExpandedMonth(latestActiveId);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const errObj = err as {
        name?: string;
        code?: string;
        response?: { data?: { message?: string } };
        message?: string;
      };
      if (
        errObj?.name === "CanceledError" ||
        errObj?.name === "AbortError" ||
        errObj?.code === "ERR_CANCELED"
      ) {
        return;
      }
      setErrorMessage(
        errObj?.response?.data?.message ||
          errObj?.message ||
          "Failed to load Business & Revenue Report"
      );
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadBusinessReport(appliedRange.from, appliedRange.to);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [appliedRange.from, appliedRange.to, loadBusinessReport]);

  const handleApplyFilter = () => {
    if (isInvalidDateRange) return;
    setAppliedRange({ from: fromDate, to: toDate });
  };

  const handleClearFilter = () => {
    setFromDate("");
    setToDate("");
    setAppliedRange({ from: "", to: "" });
    setSearchTerm("");
  };

  // Base months for the table and KPI cards:
  // - No custom range: 12-month window (`default12`)
  // - Custom range applied: `effective` window
  const baseTableMonths = useMemo<MonthlyBusinessRecord[]>(() => {
    if (!reportData) return [];
    return hasCustomRange
      ? reportData.months.effective
      : reportData.months.default12;
  }, [reportData, hasCustomRange]);

  const hasSearch = Boolean(searchTerm.trim());

  // Visible rows in the table (and KPI cards / Grand Total)
  const filteredData = useMemo<MonthlyBusinessRecord[]>(() => {
    if (!hasSearch) return baseTableMonths;
    return baseTableMonths.filter((row) => matchesMonthSearch(row, searchTerm));
  }, [baseTableMonths, hasSearch, searchTerm]);

  // Chart months:
  // - Search active: follows the filtered months (`filteredData`)
  // - Custom range applied (no search): `effective` window in both Grouped and Stacked modes
  // - Default (no custom range, no search): 6-month window (`default6`) in Grouped mode,
  //   12-month window (`default12`) in Stacked mode
  const chartData = useMemo<MonthlyBusinessRecord[]>(() => {
    if (!reportData) return [];
    if (hasSearch) return filteredData;
    if (hasCustomRange) return reportData.months.effective;
    return chartMode === "grouped"
      ? reportData.months.default6
      : reportData.months.default12;
  }, [reportData, hasSearch, filteredData, hasCustomRange, chartMode]);

  const totals = useMemo(() => computeTotals(filteredData), [filteredData]);

  // Dev-only check: when no search is active, client-side totals must equal API totals to the paisa
  useEffect(() => {
    if (!import.meta.env.DEV || !reportData || hasSearch) return;
    const apiTotals = reportData.totals;
    const keys: Array<keyof BusinessTotals> = [
      "principal",
      "interest",
      "defaultAmt",
      "handLoan",
      "hpCount",
      "loanAmount",
      "docCharge",
      "totalCollection",
      "netIncome",
      "netCashFlow",
    ];
    for (const k of keys) {
      if (totals[k] !== apiTotals[k]) {
        console.warn(
          `[Business.tsx] Totals mismatch on '${k}': computed=${totals[k]} vs api=${apiTotals[k]}`
        );
      }
    }
  }, [reportData, hasSearch, totals]);

  const effectiveRangeLabel = useMemo(() => {
    if (!reportData || baseTableMonths.length === 0) return null;
    const first = baseTableMonths[0];
    const last = baseTableMonths[baseTableMonths.length - 1];
    if (first.id === last.id) {
      return `Showing ${first.month} (whole month)`;
    }
    return `Showing ${first.month} – ${last.month} (whole months)`;
  }, [reportData, baseTableMonths]);

  const kpiCards: KpiCardItem[] = useMemo(
    () => [
      {
        title: "Total Collection",
        value: `₹${fmt(totals.totalCollection)}`,
        subtitle: "Principal + Interest + Penalty + Hand Loan",
        icon: IndianRupee,
        borderClass: "border-t-income",
        iconClass: "bg-income/10 text-income",
      },
      {
        title: "Principal Received",
        value: `₹${fmt(totals.principal)}`,
        subtitle: "HP capital recovered",
        icon: Wallet,
        borderClass: "border-t-primary",
        iconClass: "bg-primary/10 text-primary",
      },
      {
        title: "Interest Received",
        value: `₹${fmt(totals.interest)}`,
        subtitle: "HP interest earned",
        icon: TrendingUp,
        borderClass: "border-t-income",
        iconClass: "bg-income/10 text-income",
      },
      {
        title: "Default (Penalty)",
        value: `₹${fmt(totals.defaultAmt)}`,
        subtitle: "Overdue penalty collected",
        icon: AlertTriangle,
        borderClass: "border-t-warning",
        iconClass: "bg-warning/10 text-warning",
      },
      {
        title: "Net Income",
        value: `₹${fmt(totals.netIncome)}`,
        subtitle: "Interest + Penalty + Doc Charge",
        icon: Receipt,
        borderClass: "border-t-income",
        iconClass: "bg-income/10 text-income",
      },
      {
        title: "Total Loan Disbursed",
        value: `₹${fmt(totals.loanAmount)}`,
        subtitle: `${totals.hpCount} HP Loans | Doc: ₹${fmtInt(totals.docCharge)}`,
        icon: Landmark,
        borderClass: "border-t-expense",
        iconClass: "bg-expense/10 text-expense",
      },
    ],
    [totals]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Business &amp; Revenue Report</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            HP Receipt collections, revenue breakdown, loan disbursement &amp; monthly cash flow
            {effectiveRangeLabel ? ` • ${effectiveRangeLabel}` : ""}
          </p>
        </div>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="dashboard-card"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full sm:w-44">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              From Date
            </label>
            <DatePicker
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="From Date"
            />
          </div>
          <div className="w-full sm:w-44">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              To Date
            </label>
            <DatePicker
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="To Date"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={isInvalidDateRange || isLoading}
              onClick={handleApplyFilter}
              style={{ background: "var(--gradient-primary)" }}
            >
              Show
            </Button>
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilter}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
          <div className="ml-auto relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search month (e.g. Aug, 2025)..."
              aria-label="Search month"
              className="input-field text-sm py-2 pl-9 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        {isInvalidDateRange && (
          <p role="alert" className="error-message mt-2">
            From Date cannot be later than To Date. Please adjust the date range.
          </p>
        )}
      </motion.div>

      {/* Error Banner with Retry */}
      {errorMessage && (
        <div className="dashboard-card border border-destructive/40 bg-destructive/5 py-4 px-5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-destructive font-medium">{errorMessage}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadBusinessReport(appliedRange.from, appliedRange.to)}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Six KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.25, delay: 0.04 * i }}
              className={`dashboard-card p-4 border-t-4 ${card.borderClass}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground font-medium leading-snug">
                  {card.title}
                </p>
                <div className={`p-2 rounded-xl shrink-0 ${card.iconClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p
                className="text-lg font-bold text-foreground mt-2 tabular-nums truncate"
                title={card.value}
              >
                {isLoading && !reportData ? "..." : card.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {card.subtitle}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Bar Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="dashboard-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Monthly Collection &amp; Revenue Comparison
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {chartMode === "grouped"
                ? "Side-by-side Principal, Interest & Default (Penalty)"
                : "Stacked collection composition including Hand Loan"}
            </p>
          </div>
          <Tabs
            value={chartMode}
            onValueChange={(v) => setChartMode(v as "grouped" | "stacked")}
          >
            <TabsList className="bg-secondary h-9">
              <TabsTrigger value="grouped" className="text-xs px-3 py-1">
                Grouped
              </TabsTrigger>
              <TabsTrigger value="stacked" className="text-xs px-3 py-1">
                Stacked
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="h-80">
          {isLoading && !reportData ? (
            <div className="h-full flex items-center justify-center border border-dashed border-border rounded-xl bg-secondary/20 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                Loading monthly collection and revenue data...
              </p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center border border-dashed border-border rounded-xl bg-secondary/20 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                No monthly records found for the selected date range or search query.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={chartMode === "grouped" ? 4 : 2}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `₹${v / 1000}K`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.75rem",
                    color: "hsl(var(--foreground))",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  formatter={(v: number, name: string) => [`₹${fmt(Number(v))}`, name]}
                />
                <Legend />
                {chartMode === "grouped" ? (
                  <>
                    <Bar
                      dataKey="principal"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      name="Principal"
                    />
                    <Bar
                      dataKey="interest"
                      fill="hsl(var(--income))"
                      radius={[4, 4, 0, 0]}
                      name="Interest"
                    />
                    <Bar
                      dataKey="defaultAmt"
                      fill="hsl(var(--warning))"
                      radius={[4, 4, 0, 0]}
                      name="Default (Penalty)"
                    />
                  </>
                ) : (
                  <>
                    <Bar
                      dataKey="principal"
                      stackId="collection"
                      fill="hsl(var(--primary))"
                      radius={[0, 0, 0, 0]}
                      name="Principal"
                    />
                    <Bar
                      dataKey="interest"
                      stackId="collection"
                      fill="hsl(var(--income))"
                      radius={[0, 0, 0, 0]}
                      name="Interest"
                    />
                    <Bar
                      dataKey="defaultAmt"
                      stackId="collection"
                      fill="hsl(var(--warning))"
                      radius={[0, 0, 0, 0]}
                      name="Default (Penalty)"
                    />
                    <Bar
                      dataKey="handLoan"
                      stackId="collection"
                      fill="hsl(var(--primary-light))"
                      radius={[4, 4, 0, 0]}
                      name="Hand Loan"
                    />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Expandable Monthly Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="overflow-x-auto pb-2"
      >
        <div className="min-w-[960px] space-y-3">
          {/* Table Group Header */}
          <div className="dashboard-card bg-secondary/50 py-4">
            <div className="grid grid-cols-12 gap-2 text-xs font-bold text-foreground">
              <div className="col-span-2">Month</div>
              <div className="col-span-5 text-center border-b-2 border-primary pb-1 mb-1">
                HP RECEIPT (COLLECTIONS)
              </div>
              <div className="col-span-5 text-center border-b-2 border-income pb-1 mb-1">
                HP LEDGER &amp; INCOME
              </div>
            </div>
            <div className="grid grid-cols-12 gap-2 text-xs font-bold text-muted-foreground mt-1">
              <div className="col-span-2"></div>
              <div className="text-right">Principal</div>
              <div className="text-right">Interest</div>
              <div className="text-right">Default (Penalty)</div>
              <div className="text-right">Hand Loan</div>
              <div className="text-right">Total Collection</div>
              <div className="text-right">HP Count</div>
              <div className="text-right">Loan Amt</div>
              <div className="text-right">Doc Charge</div>
              <div className="col-span-2 text-right">Net Income</div>
            </div>
          </div>

          {/* Monthly Rows, Loading State, or Empty State */}
          {isLoading && !reportData ? (
            <div className="dashboard-card py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Loading monthly records...
              </p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="dashboard-card py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No monthly records found for the selected date range or search query.
              </p>
            </div>
          ) : (
            filteredData.map((row, i) => {
              const derived = computeDerived(row);
              const isExpanded = expandedMonth === row.id;

              return (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * i }}
                  className={`dashboard-card p-0 overflow-hidden ${
                    row.isFuture ? "opacity-60" : ""
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedMonth(isExpanded ? null : row.id)}
                    className="w-full px-6 py-3.5 hover:bg-secondary/30 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="grid grid-cols-12 gap-2 text-sm items-center tabular-nums">
                      <div className="col-span-2 flex items-center gap-2 font-semibold text-foreground">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        {row.month}
                      </div>
                      {/* HP Receipt (Collections) */}
                      <div className="text-right text-foreground">
                        ₹{fmtInt(row.principal)}
                      </div>
                      <div className="text-right text-foreground">
                        ₹{fmtInt(row.interest)}
                      </div>
                      <div className="text-right text-warning">
                        ₹{fmtInt(row.defaultAmt)}
                      </div>
                      <div className="text-right text-foreground">
                        ₹{fmtInt(row.handLoan)}
                      </div>
                      <div className="text-right font-bold text-primary">
                        ₹{fmtInt(derived.totalCollection)}
                      </div>
                      {/* HP Ledger & Income */}
                      <div className="text-right text-foreground">{row.hpCount}</div>
                      <div className="text-right text-foreground">
                        ₹{fmtInt(row.loanAmount)}
                      </div>
                      <div className="text-right text-foreground">
                        ₹{fmtInt(row.docCharge)}
                      </div>
                      <div className="col-span-2 text-right font-semibold text-income">
                        ₹{fmtInt(derived.netIncome)}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-6 py-4 bg-secondary/20">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        {/* Section 1: Collection & Revenue Breakdown */}
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5">
                            Collection &amp; Revenue Breakdown
                          </h4>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Principal:</span>
                              <span className="font-semibold text-foreground tabular-nums">
                                ₹{fmt(row.principal)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Interest:</span>
                              <span className="font-semibold text-foreground tabular-nums">
                                ₹{fmt(row.interest)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Default (Penalty):</span>
                              <span className="font-semibold text-warning tabular-nums">
                                ₹{fmt(row.defaultAmt)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Hand Loan:</span>
                              <span className="font-semibold text-foreground tabular-nums">
                                ₹{fmt(row.handLoan)}
                              </span>
                            </div>
                            <div className="flex justify-between col-span-2 pt-1 border-t border-border/60">
                              <span className="text-muted-foreground font-medium">
                                Total Collection:
                              </span>
                              <span className="text-primary font-bold tabular-nums">
                                ₹{fmt(derived.totalCollection)}
                              </span>
                            </div>
                            <div className="flex justify-between col-span-2">
                              <span className="text-muted-foreground font-medium">
                                Net Income (Interest + Penalty + Doc Charge):
                              </span>
                              <span className="text-income font-bold tabular-nums">
                                ₹{fmt(derived.netIncome)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Section 2: HP Ledger & Disbursement */}
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5">
                            HP Ledger &amp; Disbursement
                          </h4>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                HP Loans Disbursed:
                              </span>
                              <span className="font-semibold text-foreground tabular-nums">
                                {row.hpCount}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Document Charges:
                              </span>
                              <span className="font-semibold text-foreground tabular-nums">
                                ₹{fmt(row.docCharge)}
                              </span>
                            </div>
                            <div className="flex justify-between col-span-2">
                              <span className="text-muted-foreground">
                                Loan Amount Disbursed:
                              </span>
                              <span className="font-semibold text-foreground tabular-nums">
                                ₹{fmt(row.loanAmount)}
                              </span>
                            </div>
                            <div className="flex justify-between col-span-2 pt-1 border-t border-border/60">
                              <span className="text-muted-foreground font-medium">
                                Net Monthly Cash Flow:
                              </span>
                              <span
                                className={`font-bold tabular-nums ${
                                  derived.netCashFlow < 0 ? "text-expense" : "text-income"
                                }`}
                              >
                                {derived.netCashFlow < 0
                                  ? `-₹${fmt(Math.abs(derived.netCashFlow))}`
                                  : `+₹${fmt(derived.netCashFlow)}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}

          {/* Grand Total Row */}
          <div className="dashboard-card bg-income/10 py-4">
            <div className="grid grid-cols-12 gap-2 text-sm font-bold tabular-nums">
              <div className="col-span-2 text-foreground">Grand Total</div>
              <div className="text-right text-foreground">
                ₹{fmtInt(totals.principal)}
              </div>
              <div className="text-right text-foreground">
                ₹{fmtInt(totals.interest)}
              </div>
              <div className="text-right text-warning">
                ₹{fmtInt(totals.defaultAmt)}
              </div>
              <div className="text-right text-foreground">
                ₹{fmtInt(totals.handLoan)}
              </div>
              <div className="text-right text-primary">
                ₹{fmtInt(totals.totalCollection)}
              </div>
              <div className="text-right text-foreground">{totals.hpCount}</div>
              <div className="text-right text-foreground">
                ₹{fmtInt(totals.loanAmount)}
              </div>
              <div className="text-right text-foreground">
                ₹{fmtInt(totals.docCharge)}
              </div>
              <div className="col-span-2 text-right text-income">
                ₹{fmtInt(totals.netIncome)}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

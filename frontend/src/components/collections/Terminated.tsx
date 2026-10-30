import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Phone,
  Loader2,
  AlertCircle,
  X,
  ExternalLink,
  Download,
  Printer,
  User,
  LayoutGrid,
  Table as TableIcon,
  IndianRupee,
  Clock,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import {
  TerminatedAccountItem,
  TerminatedAccountsFilterParams,
  TerminatedAccountsFilterOptions,
  TerminatedAccountsPagination,
  TerminatedAccountsAggregates,
} from "../../types/terminatedAccounts";
import { fetchTerminatedAccounts } from "../../api/terminatedApi";

// Status badge color and badge styles
const statusBadgeStyles: Record<string, { bg: string; text: string; border: string }> = {
  Closed: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20"
  },
  Completed: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20"
  },
  Seized: {
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500/20"
  },
  Cancelled: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/20"
  },
  Matured: {
    bg: "bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/20"
  },
  Default: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border"
  }
};

export default function Terminated() {
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<TerminatedAccountItem[]>([]);
  const [pagination, setPagination] = useState<TerminatedAccountsPagination>({
    page: 1,
    limit: 12,
    totalCount: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [aggregates, setAggregates] = useState<TerminatedAccountsAggregates>({
    totalTerminated: 0,
    totalOutstanding: 0,
    totalPenalty: 0,
    overdueAccounts: 0,
  });
  const [filterOptions, setFilterOptions] = useState<TerminatedAccountsFilterOptions>({
    brokers: [],
    streets: [],
    villages: [],
    cities: [],
    states: [],
    statuses: [],
  });

  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [filters, setFilters] = useState<TerminatedAccountsFilterParams>({
    broker: "All",
    status: "All",
    street: "All",
    village: "All",
    city: "All",
    state: "All",
    dueMin: "",
    dueMax: "",
    dateFrom: "",
    dateTo: "",
    dateType: "any",
    page: 1,
    limit: 12,
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setFilters((prev) => ({ ...prev, page: 1 }));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Request counter to avoid race conditions
  const requestIdRef = useRef(0);

  // Fetch real terminated accounts data
  const loadData = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetchTerminatedAccounts({
        search: debouncedSearch,
        broker: filters.broker,
        status: filters.status,
        street: filters.street,
        village: filters.village,
        city: filters.city,
        state: filters.state,
        dueMin: filters.dueMin,
        dueMax: filters.dueMax,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        dateType: filters.dateType,
        page: filters.page,
        limit: filters.limit,
      });

      if (reqId !== requestIdRef.current) return;

      if (response && response.success) {
        setRecords(response.data || []);
        if (response.pagination) setPagination(response.pagination);
        if (response.aggregates) setAggregates(response.aggregates);
        if (response.filterOptions) setFilterOptions(response.filterOptions);
      } else {
        setError(response?.error || "Failed to load terminated accounts from database");
      }
    } catch (err: any) {
      if (reqId !== requestIdRef.current) return;
      console.error("Error fetching terminated accounts:", err);
      const msg = err.response?.data?.details || err.response?.data?.error || err.message || "Failed to connect to AutoFinex database";
      setError(msg);
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Format currency in Indian Rupees
  const formatCurrency = (val: number | string | null | undefined): string => {
    const num = Number(val);
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Format dates to DD/MM/YYYY
  const formatDate = (val: string | null | undefined): string => {
    if (!val || val === "—") return "—";
    const parts = val.split("T")[0].split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return val;
  };

  // Reset all filters to default
  const handleClearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setFilters({
      broker: "All",
      status: "All",
      street: "All",
      village: "All",
      city: "All",
      state: "All",
      dueMin: "",
      dueMax: "",
      dateFrom: "",
      dateTo: "",
      dateType: "any",
      page: 1,
      limit: filters.limit,
    });
  };

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return Boolean(
      debouncedSearch ||
      (filters.broker && filters.broker !== "All") ||
      (filters.status && filters.status !== "All") ||
      (filters.street && filters.street !== "All") ||
      (filters.village && filters.village !== "All") ||
      (filters.city && filters.city !== "All") ||
      (filters.state && filters.state !== "All") ||
      filters.dueMin ||
      filters.dueMax ||
      filters.dateFrom ||
      filters.dateTo
    );
  }, [debouncedSearch, filters]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedSearch) count++;
    if (filters.broker && filters.broker !== "All") count++;
    if (filters.status && filters.status !== "All") count++;
    if (filters.street && filters.street !== "All") count++;
    if (filters.village && filters.village !== "All") count++;
    if (filters.city && filters.city !== "All") count++;
    if (filters.state && filters.state !== "All") count++;
    if (filters.dueMin) count++;
    if (filters.dueMax) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    return count;
  }, [debouncedSearch, filters]);

  // CSV Export with authentic database data
  const handleExportCSV = () => {
    if (records.length === 0) return;

    const headers = [
      "Customer Name",
      "Account Number",
      "Phone",
      "Vehicle Registration",
      "Vehicle Model",
      "Broker",
      "Contractual Final Due Date",
      "Actual Termination Date",
      "Days Overdue",
      "Outstanding Amount",
      "Penalty Amount",
      "Total Due",
      "Total Paid",
      "Status",
      "Termination Reason",
      "Street",
      "Village",
      "City",
      "State",
    ];

    const rows = records.map((r) => [
      `"${r.customerName.replace(/"/g, '""')}"`,
      `"${r.accountNumber}"`,
      `"${r.phone}"`,
      `"${r.vehicleRegistration}"`,
      `"${r.vehicleModel.replace(/"/g, '""')}"`,
      `"${r.brokerName.replace(/"/g, '""')}"`,
      `"${formatDate(r.contractualFinalDueDate)}"`,
      `"${formatDate(r.actualTerminationDate)}"`,
      r.daysOverdue,
      r.outstandingAmount,
      r.penaltyAmount,
      r.totalDue,
      r.totalPaid,
      `"${r.terminationStatus}"`,
      `"${(r.terminationReason || "").replace(/"/g, '""')}"`,
      `"${(r.street || "").replace(/"/g, '""')}"`,
      `"${(r.village || "").replace(/"/g, '""')}"`,
      `"${(r.city || "").replace(/"/g, '""')}"`,
      `"${(r.state || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `AutoFinex_Terminated_Accounts_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  // Navigate to customer details
  const handleViewCustomer = (customerId: string) => {
    if (!customerId) return;
    navigate(`/customers/${customerId}`);
  };

  return (
    <div className="space-y-6 max-w-full">
      {/* ─── Header & Top Actions ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Terminated Accounts
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-destructive/10 text-destructive border border-destructive/20">
              Live Ledger
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Contractually matured, closed, and seized loan accounts from verified database records
          </p>
        </motion.div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-2 shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={records.length === 0}
            className="gap-2 shadow-sm"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>

          {/* Print */}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={records.length === 0}
            className="gap-2 shadow-sm"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>

          {/* Table / Grid Toggle */}
          <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-8 px-2.5 gap-1.5"
            >
              <TableIcon className="h-4 w-4" />
              <span className="text-xs hidden sm:inline">Table</span>
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="h-8 px-2.5 gap-1.5"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="text-xs hidden sm:inline">Cards</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Real Database KPI Summary Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Terminated */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="dashboard-card border border-border/80 shadow-sm relative overflow-hidden group hover:border-primary/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Terminated Accounts
              </p>
              <h3 className="text-2xl font-bold text-foreground mt-1">
                {aggregates.totalTerminated}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Matured, closed & seized
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0 border border-destructive/20">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        {/* Total Outstanding Scheduled Balance */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="dashboard-card border border-border/80 shadow-sm relative overflow-hidden group hover:border-amber-500/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Outstanding Dues
              </p>
              <h3 className="text-2xl font-bold text-expense mt-1">
                ₹{formatCurrency(aggregates.totalOutstanding)}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Unpaid scheduled dues
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        {/* Total Separate Penalty Dues */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="dashboard-card border border-border/80 shadow-sm relative overflow-hidden group hover:border-destructive/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Penalty Obligation
              </p>
              <h3 className="text-2xl font-bold text-destructive mt-1">
                ₹{formatCurrency(aggregates.totalPenalty)}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accrued late-payment penalties
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0 border border-destructive/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        {/* Accounts with Overdue Dues */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="dashboard-card border border-border/80 shadow-sm relative overflow-hidden group hover:border-primary/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Overdue Accounts
              </p>
              <h3 className="text-2xl font-bold text-foreground mt-1">
                {aggregates.overdueAccounts}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Past maturity with dues
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* ─── Search & Combined Multi-Field Filters Bar ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="dashboard-card border border-border/80 shadow-sm p-4 space-y-4"
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Global Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer name, account / HPL no, phone, vehicle reg, vehicle model..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-8 h-10 w-full"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filters Toggle Button */}
          <Button
            variant={hasActiveFilters ? "default" : "outline"}
            size="default"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="gap-2 shrink-0 h-10"
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-primary-foreground text-primary rounded-full px-1.5 py-0.2 text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
            {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="default"
              onClick={handleClearFilters}
              className="gap-1.5 shrink-0 text-muted-foreground hover:text-foreground h-10"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Filters
            </Button>
          )}
        </div>

        {/* Collapsible Combined Filters Panel */}
        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* Broker Filter */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Broker
                  </label>
                  <select
                    value={filters.broker || "All"}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, broker: e.target.value, page: 1 }))
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="All">All Brokers</option>
                    {filterOptions.brokers.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Termination Status / Reason
                  </label>
                  <select
                    value={filters.status || "All"}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, status: e.target.value, page: 1 }))
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="All">All Statuses</option>
                    {filterOptions.statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Due Amount (Min) */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Outstanding Min (₹)
                  </label>
                  <Input
                    type="number"
                    placeholder="Min amount"
                    value={filters.dueMin ?? ""}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, dueMin: e.target.value, page: 1 }))
                    }
                    className="h-9 text-sm"
                  />
                </div>

                {/* Due Amount (Max) */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Outstanding Max (₹)
                  </label>
                  <Input
                    type="number"
                    placeholder="Max amount"
                    value={filters.dueMax ?? ""}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, dueMax: e.target.value, page: 1 }))
                    }
                    className="h-9 text-sm"
                  />
                </div>

                {/* Date Type Selector */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Date Range Type
                  </label>
                  <select
                    value={filters.dateType || "any"}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        dateType: e.target.value as any,
                        page: 1,
                      }))
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="any">Any Date (Final Due or Termination)</option>
                    <option value="contractual">Contractual Final Due Date</option>
                    <option value="actual">Actual Termination Date</option>
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Date From
                  </label>
                  <DatePicker
                    value={filters.dateFrom || null}
                    onChange={(e: any) => {
                      const val = e?.target?.value !== undefined ? e.target.value : e;
                      setFilters((prev) => ({ ...prev, dateFrom: val || "", page: 1 }));
                    }}
                    placeholder="From Date"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Date To
                  </label>
                  <DatePicker
                    value={filters.dateTo || null}
                    onChange={(e: any) => {
                      const val = e?.target?.value !== undefined ? e.target.value : e;
                      setFilters((prev) => ({ ...prev, dateTo: val || "", page: 1 }));
                    }}
                    placeholder="To Date"
                  />
                </div>

                {/* Street Filter */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Street
                  </label>
                  <select
                    value={filters.street || "All"}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, street: e.target.value, page: 1 }))
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="All">All Streets</option>
                    {filterOptions.streets.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Village Filter */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Village
                  </label>
                  <select
                    value={filters.village || "All"}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, village: e.target.value, page: 1 }))
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="All">All Villages</option>
                    {filterOptions.villages.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {/* City Filter */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    City
                  </label>
                  <select
                    value={filters.city || "All"}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, city: e.target.value, page: 1 }))
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="All">All Cities</option>
                    {filterOptions.cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* State Filter */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    State
                  </label>
                  <select
                    value={filters.state || "All"}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, state: e.target.value, page: 1 }))
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="All">All States</option>
                    {filterOptions.states.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ─── Main Content Area: Loading, Error, Empty, and Data ───────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-border shadow-sm">
          <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
          <p className="text-base font-semibold text-foreground">
            Loading terminated accounts from PostgreSQL...
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Computing contractual installment schedules and penalty balances
          </p>
        </div>
      ) : error ? (
        <div className="p-8 bg-destructive/10 border border-destructive/20 rounded-xl text-center shadow-sm">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
          <h3 className="text-lg font-bold text-foreground">
            Failed to Load Terminated Accounts
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1 mb-4">
            {error}
          </p>
          <Button onClick={loadData} variant="default" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry Connection
          </Button>
        </div>
      ) : records.length === 0 ? (
        <div className="py-16 px-4 text-center bg-card rounded-xl border border-border shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto mb-4 border border-border">
            {hasActiveFilters ? <Search className="h-8 w-8" /> : <Clock className="h-8 w-8" />}
          </div>
          <h3 className="text-lg font-bold text-foreground">
            {hasActiveFilters
              ? "No Matching Terminated Accounts Found"
              : "No Terminated Accounts in Database"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1.5 mb-5">
            {hasActiveFilters
              ? "None of the terminated loan accounts match your current filter criteria. Try adjusting or resetting filters."
              : "All customer loans are currently active and running. Closed, seized, or contractually matured loans will be recorded here automatically."}
          </p>
          {hasActiveFilters && (
            <Button onClick={handleClearFilters} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset All Filters
            </Button>
          )}
        </div>
      ) : viewMode === "table" ? (
        /* ─── Table View (Standard Accounting Ledger) ────────────────────────── */
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 px-4">Customer & Account</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Vehicle & Broker</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4">Overdue</th>
                  <th className="py-3 px-4 text-right">Outstanding & Penalty</th>
                  <th className="py-3 px-4">Status & Reason</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {records.map((customer) => {
                  const badge =
                    statusBadgeStyles[customer.terminationStatus] ||
                    statusBadgeStyles.Default;

                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => handleViewCustomer(customer.customerId)}
                    >
                      {/* Customer Photo, Name, and HPL Number */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border">
                            {customer.photoUrl ? (
                              <img
                                src={customer.photoUrl}
                                alt={customer.customerName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback to avatar icon on image load failure
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <User className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                              {customer.customerName}
                            </div>
                            <div className="text-xs font-medium text-primary tracking-wide">
                              {customer.accountNumber}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs sm:text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
                          <span>{customer.phone}</span>
                        </div>
                      </td>

                      {/* Vehicle & Broker */}
                      <td className="py-3 px-4">
                        <div className="text-foreground font-medium text-xs sm:text-sm">
                          {customer.vehicleModel}
                        </div>
                        {customer.vehicleRegistration !== "—" && (
                          <div className="text-xs text-muted-foreground">
                            {customer.vehicleRegistration}
                          </div>
                        )}
                        {customer.brokerName !== "—" && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Broker: <span className="font-medium text-foreground">{customer.brokerName}</span>
                          </div>
                        )}
                      </td>

                      {/* Final Due / Actual Termination Dates */}
                      <td className="py-3 px-4 text-xs space-y-1">
                        <div>
                          <span className="text-muted-foreground">Final Due: </span>
                          <span className="font-medium text-foreground">
                            {formatDate(customer.contractualFinalDueDate)}
                          </span>
                        </div>
                        {customer.actualTerminationDate && customer.actualTerminationDate !== customer.contractualFinalDueDate && (
                          <div>
                            <span className="text-muted-foreground">Terminated: </span>
                            <span className="font-medium text-foreground">
                              {formatDate(customer.actualTerminationDate)}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Days Overdue */}
                      <td className="py-3 px-4">
                        {customer.daysOverdue > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                            {customer.daysOverdue} days
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            On Time / 0 d
                          </span>
                        )}
                      </td>

                      {/* Outstanding Amount & Penalty Displayed Directly Underneath */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-bold text-expense text-sm sm:text-base">
                          ₹{formatCurrency(customer.outstandingAmount)}
                        </div>
                        <div className="text-xs font-medium text-destructive mt-0.5 flex items-center justify-end gap-1">
                          <span>Penalty:</span>
                          <span className="font-bold">
                            ₹{formatCurrency(customer.penaltyAmount)}
                          </span>
                        </div>
                      </td>

                      {/* Status & Reason */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {customer.terminationStatus}
                        </span>
                        {customer.terminationReason && customer.terminationReason !== "—" && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-[180px] truncate" title={customer.terminationReason}>
                            {customer.terminationReason}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewCustomer(customer.customerId);
                          }}
                          className="h-8 px-2.5 text-xs gap-1 hover:text-primary"
                        >
                          <span>View</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ─── Grid Cards View ────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {records.map((customer, i) => {
            const badge =
              statusBadgeStyles[customer.terminationStatus] ||
              statusBadgeStyles.Default;

            return (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i }}
                onClick={() => handleViewCustomer(customer.customerId)}
                className="dashboard-card border border-border hover:border-primary/50 transition-all cursor-pointer relative overflow-hidden group shadow-sm flex flex-col justify-between"
              >
                <div>
                  {/* Top: Photo, Name, HPL, Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border">
                        {customer.photoUrl ? (
                          <img
                            src={customer.photoUrl}
                            alt={customer.customerName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <User className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {customer.customerName}
                        </h3>
                        <p className="text-xs font-semibold text-primary tracking-wide">
                          {customer.accountNumber}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {customer.terminationStatus}
                    </span>
                  </div>

                  {/* Details section */}
                  <div className="mt-4 space-y-2 text-xs sm:text-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {customer.vehicleModel}
                      </span>
                      <span>{customer.vehicleRegistration}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{customer.phone}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Final Due: {formatDate(customer.contractualFinalDueDate)}</span>
                    </div>

                    {customer.actualTerminationDate && customer.actualTerminationDate !== customer.contractualFinalDueDate && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Terminated: {formatDate(customer.actualTerminationDate)}</span>
                      </div>
                    )}

                    {customer.daysOverdue > 0 && (
                      <div className="flex items-center gap-1.5 text-destructive font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>{customer.daysOverdue} days overdue</span>
                      </div>
                    )}

                    {customer.terminationReason && customer.terminationReason !== "—" && (
                      <div className="p-2 bg-muted/40 rounded-md text-xs text-muted-foreground mt-2 border border-border/60">
                        <span className="font-semibold text-foreground">Reason: </span>
                        {customer.terminationReason}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom: Outstanding & Penalty */}
                <div className="mt-4 pt-3 border-t border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <IndianRupee className="h-3.5 w-3.5" /> Outstanding
                    </span>
                    <span className="font-bold text-expense text-base">
                      ₹{formatCurrency(customer.outstandingAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">Penalty Dues</span>
                    <span className="font-bold text-destructive">
                      ₹{formatCurrency(customer.penaltyAmount)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ─── Pagination Footer ───────────────────────────────────────────────── */}
      {!loading && !error && records.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Showing{" "}
              <strong className="text-foreground">
                {(pagination.page - 1) * pagination.limit + 1}
              </strong>{" "}
              to{" "}
              <strong className="text-foreground">
                {Math.min(pagination.page * pagination.limit, pagination.totalCount)}
              </strong>{" "}
              of <strong className="text-foreground">{pagination.totalCount}</strong>{" "}
              records
            </span>
            <span className="mx-1">•</span>
            <span>Items per page:</span>
            <select
              value={filters.limit || 12}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  limit: Number(e.target.value),
                  page: 1,
                }))
              }
              className="h-7 rounded border border-input bg-background px-2 text-xs shadow-sm focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={12}>12</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrevPage}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }))
              }
              className="h-8 px-3 text-xs"
            >
              Previous
            </Button>
            <span className="text-xs font-medium text-foreground px-2">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage}
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  page: Math.min(pagination.totalPages, (prev.page || 1) + 1),
                }))
              }
              className="h-8 px-3 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

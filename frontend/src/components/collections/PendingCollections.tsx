import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Download,
  Printer,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Phone,
  Loader2,
  AlertCircle,
  FileX,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import {
  PendingCollectionRecord,
  PendingCollectionsFilterParams,
  PendingCollectionsFilterOptions,
  PendingCollectionsPagination,
  PendingCollectionsAggregates,
} from "../../types/pendingCollections";
import { fetchPendingCollections } from "../../api/collectionsApi";

const dealTypeColors: Record<string, string> = {
  Consulting: "bg-primary/10 text-primary border border-primary/20",
  Finance: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
};

const statusBadgeStyles: Record<string, string> = {
  close: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  good: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  action: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  pending: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

const initialFilters: PendingCollectionsFilterParams = {
  hpDateFrom: "",
  hpDateTo: "",
  pendingMin: "",
  pendingMax: "",
  dueDaysMin: "",
  dueDaysMax: "",
  broker: "",
  vehicleType: "",
  street: "",
  village: "",
  city: "",
  statusFilter: "",
  dealType: "",
  hbAmountMin: "",
  hbAmountMax: "",
  defaultAmountMin: "",
  defaultAmountMax: "",
};

function EmiProgressBar({ paid, total }: { paid: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden max-w-[120px]">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        {paid}/{total}
      </span>
    </div>
  );
}

export default function PendingCollections() {
  const navigate = useNavigate();

  // State
  const [loans, setLoans] = useState<PendingCollectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<PendingCollectionsFilterParams>(initialFilters);

  // Pagination & Aggregates from Backend
  const [pagination, setPagination] = useState<PendingCollectionsPagination>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });

  const [aggregates, setAggregates] = useState<PendingCollectionsAggregates>({
    totalCount: 0,
    totalDueSum: 0,
    totalPaidSum: 0,
    totalPendingSum: 0,
    totalBalanceSum: 0,
  });

  const [filterOptions, setFilterOptions] = useState<PendingCollectionsFilterOptions>({
    brokers: [],
    streets: [],
    villages: [],
    cities: [],
  });

  // AutoSuggest Dropdown UI States
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);
  const [villageSuggestions, setVillageSuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);

  // Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load Real Data from Backend
  const loadCollections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: PendingCollectionsFilterParams = {
        ...filters,
        search: debouncedSearch.trim() || undefined,
        page: pagination.page,
        limit: pagination.limit,
      };

      const res = await fetchPendingCollections(params);

      if (res && res.success) {
        setLoans(res.data || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
        if (res.aggregates) {
          setAggregates(res.aggregates);
        }
        if (res.filters) {
          setFilterOptions({
            brokers: res.filters.brokers || [],
            streets: res.filters.streets || [],
            villages: res.filters.villages || [],
            cities: res.filters.cities || [],
          });
        }
      } else {
        throw new Error("Unable to fetch collection records");
      }
    } catch (err: any) {
      console.error("Error loading pending collections:", err);
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to load pending collections from database."
      );
      setLoans([]);
    } finally {
      setLoading(false);
    }
  }, [filters, debouncedSearch, pagination.page, pagination.limit]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  // Filter Handler
  const handleFilterChange = (key: keyof PendingCollectionsFilterParams, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));

    // Update AutoSuggest suggestions dynamically
    if (key === "street") {
      setStreetSuggestions(
        value
          ? filterOptions.streets.filter(s => s.toLowerCase().includes(value.toLowerCase()))
          : []
      );
    }
    if (key === "village") {
      setVillageSuggestions(
        value
          ? filterOptions.villages.filter(s => s.toLowerCase().includes(value.toLowerCase()))
          : []
      );
    }
    if (key === "city") {
      setCitySuggestions(
        value
          ? filterOptions.cities.filter(s => s.toLowerCase().includes(value.toLowerCase()))
          : []
      );
    }
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setSearchTerm("");
    setDebouncedSearch("");
    setStreetSuggestions([]);
    setVillageSuggestions([]);
    setCitySuggestions([]);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== "" && v !== undefined && v !== null && k !== "page" && k !== "limit") count++;
    });
    return count;
  }, [filters, searchTerm]);

  // Navigate to Customer Details page on row click
  const handleRowClick = (record: PendingCollectionRecord) => {
    const targetId = record.customerId || record.id;
    if (targetId) {
      navigate(`/customers/${targetId}`);
    }
  };

  // Export to CSV
  const handleExport = () => {
    if (loans.length === 0) return;
    const headers = [
      "S.No",
      "HPL No",
      "Customer Name",
      "Phone",
      "Vehicle Number",
      "Vehicle Model",
      "Loan Date",
      "Paid EMIs",
      "Total EMIs",
      "Total Due (Rs)",
      "Paid Amount (Rs)",
      "Monthly Pending (Rs)",
      "Balance (Rs)",
      "Deal Type",
      "Status",
      "Street",
      "Village",
      "City",
    ];

    const csvRows = [
      headers.join(","),
      ...loans.map((l, i) => [
        (pagination.page - 1) * pagination.limit + i + 1,
        `"${l.loanNo}"`,
        `"${(l.name || "").replace(/"/g, '""')}"`,
        `"${l.phone || ""}"`,
        `"${l.vehicle || ""}"`,
        `"${(l.vehicleName || "").replace(/"/g, '""')}"`,
        `"${l.loanDate || l.hpDate || ""}"`,
        l.paidEmi,
        l.totalEmi,
        l.totalDue,
        l.paid,
        l.pending,
        l.balance,
        `"${l.dealType || ""}"`,
        `"${l.statusLabel || l.status || ""}"`,
        `"${(l.street || "").replace(/"/g, '""')}"`,
        `"${(l.village || "").replace(/"/g, '""')}"`,
        `"${(l.city || "").replace(/"/g, '""')}"`,
      ].join(",")),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Pending_Collections_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  // AutoSuggest Input Component
  const AutoSuggestInput = ({
    label,
    value,
    suggestions,
    filterKey,
  }: {
    label: string;
    value: string;
    suggestions: string[];
    filterKey: keyof PendingCollectionsFilterParams;
  }) => (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {value && (
          <button
            type="button"
            onClick={() => handleFilterChange(filterKey, "")}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            <X className="h-2.5 w-2.5" /> clear
          </button>
        )}
      </div>
      <Input
        value={value}
        onChange={e => handleFilterChange(filterKey, e.target.value)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="text-sm h-9"
      />
      {suggestions.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-36 overflow-y-auto py-1">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/70 transition-colors text-foreground"
              onClick={() => {
                handleFilterChange(filterKey, s);
                if (filterKey === "street") setStreetSuggestions([]);
                if (filterKey === "village") setVillageSuggestions([]);
                if (filterKey === "city") setCitySuggestions([]);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pending Collections</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage real-time overdue loan schedules, installment progress, and customer dues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={loading || loans.length === 0}
            className="gap-2 shadow-sm"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={loading || loans.length === 0}
            className="gap-2 shadow-sm"
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </motion.div>

      {/* Aggregate KPI Summary Pills */}
      {!loading && !error && aggregates.totalCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
            <span className="text-xs text-muted-foreground font-medium">Total Contractual Due</span>
            <p className="text-lg font-bold text-foreground mt-0.5">
              ₹{aggregates.totalDueSum.toLocaleString()}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
            <span className="text-xs text-muted-foreground font-medium">Total Collected Paid</span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              ₹{aggregates.totalPaidSum.toLocaleString()}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
            <span className="text-xs text-muted-foreground font-medium">Total Monthly Pending</span>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">
              ₹{aggregates.totalPendingSum.toLocaleString()}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
            <span className="text-xs text-muted-foreground font-medium">Total Outstanding Balance</span>
            <p className="text-lg font-bold text-foreground mt-0.5">
              ₹{aggregates.totalBalanceSum.toLocaleString()}
            </p>
          </div>
        </motion.div>
      )}

      {/* Search & Filter Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="dashboard-card border border-border shadow-sm p-4"
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name, HPL no, vehicle..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-8 h-9 text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`gap-2 h-9 ${activeFiltersCount > 0 ? "border-primary text-primary font-medium" : ""}`}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-primary text-primary-foreground rounded-full text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
              {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-9 text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible Filter Panel */}
        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 mt-4 pt-4 border-t border-border">
                {/* HP Date Filters */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">HP Date (From)</label>
                  <DatePicker
                    value={filters.hpDateFrom}
                    onValueChange={val => handleFilterChange("hpDateFrom", val)}
                    onChange={e => handleFilterChange("hpDateFrom", e?.target?.value || "")}
                    placeholder="From Date"
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">HP Date (To)</label>
                  <DatePicker
                    value={filters.hpDateTo}
                    onValueChange={val => handleFilterChange("hpDateTo", val)}
                    onChange={e => handleFilterChange("hpDateTo", e?.target?.value || "")}
                    placeholder="To Date"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Monthly Pending Min / Max */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Pending Min (₹)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="text-sm h-9"
                    value={filters.pendingMin ?? ""}
                    onChange={e => handleFilterChange("pendingMin", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Pending Max (₹)</label>
                  <Input
                    type="number"
                    placeholder="100000"
                    className="text-sm h-9"
                    value={filters.pendingMax ?? ""}
                    onChange={e => handleFilterChange("pendingMax", e.target.value)}
                  />
                </div>

                {/* Broker Filter */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Broker</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={filters.broker ?? ""}
                    onChange={e => handleFilterChange("broker", e.target.value)}
                  >
                    <option value="">All Brokers</option>
                    {filterOptions.brokers.map(b => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vehicle Type Filter */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Vehicle Type</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={filters.vehicleType ?? ""}
                    onChange={e => handleFilterChange("vehicleType", e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="bike">Two Wheeler (Bike)</option>
                    <option value="scooter">Scooter</option>
                    <option value="car">Four Wheeler (Car)</option>
                    <option value="three_wheeler">Three Wheeler</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>

                {/* Address AutoSuggests */}
                <AutoSuggestInput
                  label="Street"
                  value={String(filters.street ?? "")}
                  suggestions={streetSuggestions}
                  filterKey="street"
                />
                <AutoSuggestInput
                  label="Village"
                  value={String(filters.village ?? "")}
                  suggestions={villageSuggestions}
                  filterKey="village"
                />
                <AutoSuggestInput
                  label="City"
                  value={String(filters.city ?? "")}
                  suggestions={citySuggestions}
                  filterKey="city"
                />

                {/* Status Filter */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={filters.statusFilter ?? ""}
                    onChange={e => handleFilterChange("statusFilter", e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="Action">Action (1 Due)</option>
                    <option value="Pending">Pending (2+ Dues)</option>
                    <option value="Close">Close (Paid / Inactive)</option>
                  </select>
                </div>

                {/* HP / HB Amount Range */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">HB Amount (From)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="text-sm h-9"
                    value={filters.hbAmountMin ?? ""}
                    onChange={e => handleFilterChange("hbAmountMin", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">HB Amount (To)</label>
                  <Input
                    type="number"
                    placeholder="500000"
                    className="text-sm h-9"
                    value={filters.hbAmountMax ?? ""}
                    onChange={e => handleFilterChange("hbAmountMax", e.target.value)}
                  />
                </div>

                {/* Default Amount Range */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Amount (From)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="text-sm h-9"
                    value={filters.defaultAmountMin ?? ""}
                    onChange={e => handleFilterChange("defaultAmountMin", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Amount (To)</label>
                  <Input
                    type="number"
                    placeholder="100000"
                    className="text-sm h-9"
                    value={filters.defaultAmountMax ?? ""}
                    onChange={e => handleFilterChange("defaultAmountMax", e.target.value)}
                  />
                </div>

                {/* Deal Type Filter */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Deal Type</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={filters.dealType ?? ""}
                    onChange={e => handleFilterChange("dealType", e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="Finance">Finance</option>
                    <option value="Consulting">Consulting</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Main Table Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="dashboard-card p-0 overflow-hidden border border-border shadow-sm"
      >
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3 font-medium">
              Loading collection records from PostgreSQL database...
            </p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="h-12 w-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Error Loading Records</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
            <Button size="sm" variant="outline" onClick={loadCollections} className="mt-4 gap-2">
              <RotateCcw className="h-4 w-4" /> Try Again
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && loans.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-3 text-muted-foreground">
              <FileX className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No Collection Records Found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {activeFiltersCount > 0
                ? "No customer loans match your current search and filter criteria. Try clearing some filters."
                : "There are currently no active customer loan records in the database for your company."}
            </p>
            {activeFiltersCount > 0 && (
              <Button size="sm" variant="outline" onClick={clearFilters} className="mt-4 gap-2">
                <RotateCcw className="h-4 w-4" /> Clear All Filters
              </Button>
            )}
          </div>
        )}

        {/* Success Data Table */}
        {!loading && !error && loans.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">
                    S.No
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">
                    HPL / Customer
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">
                    Vehicle
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">
                    Phone
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">
                    Loan Date
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">
                    Due Progress
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">
                    Total Due
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">
                    Paid
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">
                    Pending
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">
                    Balance
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-center">
                    Type
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loans.map((loan, i) => (
                  <motion.tr
                    key={loan.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.02 * i }}
                    onClick={() => handleRowClick(loan)}
                    className="hover:bg-secondary/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {(pagination.page - 1) * pagination.limit + i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-primary group-hover:underline">
                        {loan.loanNo}
                      </p>
                      <p className="text-xs font-medium text-foreground mt-0.5">{loan.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{loan.vehicle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {loan.vehicleName && loan.vehicleName !== "-" ? loan.vehicleName : "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {loan.phone && loan.phone !== "-" ? (
                        <span className="flex items-center gap-1.5 text-foreground/90 font-mono text-xs">
                          <Phone className="h-3 w-3 text-muted-foreground" /> {loan.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono text-xs">
                      {loan.loanDate || loan.hpDate || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <EmiProgressBar paid={loan.paidEmi} total={loan.totalEmi} />
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                      ₹{loan.totalDue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-emerald-600 dark:text-emerald-400">
                      ₹{loan.paid.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-rose-600 dark:text-rose-400">
                      ₹{loan.pending.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground font-medium">
                      ₹{loan.balance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          dealTypeColors[loan.dealType] || "bg-secondary text-foreground"
                        }`}
                      >
                        {loan.dealType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                          statusBadgeStyles[loan.status] || "bg-secondary text-muted-foreground border-border"
                        }`}
                      >
                        {loan.statusLabel || loan.status}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer with Pagination */}
        {!loading && !error && pagination.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3.5 border-t border-border bg-card">
            <span className="text-xs sm:text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {(pagination.page - 1) * pagination.limit + 1}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{" "}
              of <span className="font-medium text-foreground">{pagination.total}</span> records
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page <= 1}
                className="h-8 px-2.5 text-xs"
              >
                Previous
              </Button>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter(p => {
                  if (pagination.totalPages <= 5) return true;
                  return Math.abs(p - pagination.page) <= 1 || p === 1 || p === pagination.totalPages;
                })
                .map((p, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && p - prevPage > 1;
                  return (
                    <div key={p} className="flex items-center">
                      {showEllipsis && <span className="px-1 text-xs text-muted-foreground">...</span>}
                      <Button
                        variant={p === pagination.page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPagination(prev => ({ ...prev, page: p }))}
                        className={`h-8 w-8 p-0 text-xs ${
                          p === pagination.page ? "bg-primary text-primary-foreground font-bold shadow-sm" : ""
                        }`}
                      >
                        {p}
                      </Button>
                    </div>
                  );
                })}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))
                }
                disabled={pagination.page >= pagination.totalPages}
                className="h-8 px-2.5 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

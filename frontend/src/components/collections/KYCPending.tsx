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
  AlertCircle,
  X,
  Camera,
  FileText,
  MapPin,
  ExternalLink,
  Download,
  Printer,
  User,
  ShieldAlert,
  CheckCircle2,
  LayoutGrid,
  Table as TableIcon,
  Car,
  IndianRupee,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AppSelect, TablePagination, TableSkeletonRows, CardGridSkeleton } from "../common";
import {
  KycPendingItem,
  KycPendingType,
  KycPendingFilterParams,
  KycPendingFilterOptions,
  KycPendingPagination,
  KycPendingAggregates,
} from "../../types/kycPending";
import { fetchKycPending } from "../../api/kycApi";

const pendingBadgeStyles: Record<KycPendingType, { bg: string; text: string; icon: React.ElementType }> = {
  Photo: {
    bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    text: "Photo",
    icon: Camera,
  },
  "Govt ID": {
    bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    text: "Govt ID",
    icon: FileText,
  },
  Location: {
    bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    text: "Location",
    icon: MapPin,
  },
};

const entityTypeStyles: Record<string, string> = {
  Customer: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  Staff: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  Agent: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
};

export default function KYCPending() {
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<KycPendingItem[]>([]);
  const [pagination, setPagination] = useState<KycPendingPagination>({
    page: 1,
    limit: 15,
    totalCount: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [aggregates, setAggregates] = useState<KycPendingAggregates>({
    totalCount: 0,
    photoPendingCount: 0,
    govtIdPendingCount: 0,
    locationPendingCount: 0,
    customerPendingCount: 0,
    staffPendingCount: 0,
  });
  const [filterOptions, setFilterOptions] = useState<KycPendingFilterOptions>({
    streets: [],
    villages: [],
    cities: [],
    states: [],
    brokers: [],
    entityTypes: ["Customer", "Staff", "Agent"],
    pendingTypes: ["Photo", "Govt ID", "Location"],
  });

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [filters, setFilters] = useState<KycPendingFilterParams>({
    pendingType: "All",
    entityType: "All",
    street: "",
    village: "",
    city: "",
    state: "",
    broker: "",
    page: 1,
    limit: 15,
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setFilters((prev) => ({ ...prev, page: 1 }));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchKycPending({
        ...filters,
        search: debouncedSearch,
      });

      if (response && response.success) {
        setRecords(response.data || []);
        if (response.pagination) setPagination(response.pagination);
        if (response.aggregates) setAggregates(response.aggregates);
        if (response.filterOptions) setFilterOptions(response.filterOptions);
      } else {
        setError(response.error || "Failed to load KYC pending records");
      }
    } catch (err: any) {
      console.error("KYC Pending fetch error:", err);
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Network error while connecting to server"
      );
    } finally {
      setLoading(false);
    }
  }, [filters, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle single filter changes
  const handleFilterChange = (key: keyof KycPendingFilterParams, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // reset page on filter change
    }));
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setFilters({
      pendingType: "All",
      entityType: "All",
      street: "",
      village: "",
      city: "",
      state: "",
      broker: "",
      page: 1,
      limit: 15,
    });
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedSearch) count++;
    if (filters.pendingType && filters.pendingType !== "All") count++;
    if (filters.entityType && filters.entityType !== "All") count++;
    if (filters.street) count++;
    if (filters.village) count++;
    if (filters.city) count++;
    if (filters.state) count++;
    if (filters.broker) count++;
    return count;
  }, [filters, debouncedSearch]);

  // Open Google Maps
  const openGoogleMaps = (location: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!location || location === "—") return;
    const query = encodeURIComponent(location);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  };

  // Row / card click navigation
  const handleRowClick = (item: KycPendingItem) => {
    if (item.entityType === "Customer") {
      navigate(`/customers/${item.entityId}`);
    } else {
      navigate("/UserProfile");
    }
  };

  // Export CSV
  const exportCSV = () => {
    if (records.length === 0) return;
    const headers = [
      "ID",
      "Entity Type",
      "Account Number",
      "Name",
      "Phone",
      "Pending Items",
      "Vehicle",
      "HP Amount",
      "Govt ID",
      "Street",
      "Village",
      "City",
      "State",
      "Location Coordinates",
    ];

    const rows = records.map((r) => [
      `"${r.id}"`,
      `"${r.entityType}"`,
      `"${r.accountNumber}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.phone}"`,
      `"${r.pendingItems.join(", ")}"`,
      `"${(r.vehicle || "").replace(/"/g, '""')}"`,
      r.hpAmount ? `"${r.hpAmount}"` : '""',
      `"${r.govtIdNumber || ""}"`,
      `"${(r.street || "").replace(/"/g, '""')}"`,
      `"${(r.village || "").replace(/"/g, '""')}"`,
      `"${(r.city || "").replace(/"/g, '""')}"`,
      `"${(r.state || "").replace(/"/g, '""')}"`,
      `"${(r.location || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `KYC_Pending_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // AutoSuggest Component
  const AutoSuggest = ({
    label,
    value,
    options,
    filterKey,
  }: {
    label: string;
    value: string;
    options: string[];
    filterKey: keyof KycPendingFilterParams;
  }) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const filteredSuggestions = useMemo(() => {
      if (!value) return options.slice(0, 8);
      return options.filter((o) => o.toLowerCase().includes(value.toLowerCase())).slice(0, 8);
    }, [options, value]);

    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div className="relative" ref={wrapperRef}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
          {label}
        </label>
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => {
              handleFilterChange(filterKey, e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={`Filter ${label.toLowerCase()}...`}
            className="text-xs h-9 pr-7"
          />
          {value && (
            <button
              onClick={() => {
                handleFilterChange(filterKey, "");
                setOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {open && filteredSuggestions.length > 0 && (
          <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-36 overflow-y-auto py-1">
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/70 transition-colors text-foreground truncate"
                onClick={() => {
                  handleFilterChange(filterKey, s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground tracking-tight">
              KYC Pending
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              {aggregates.totalCount} Pending
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Real database records with incomplete photograph, government identity, or location compliance
          </p>
        </motion.div>

        {/* View and Export Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-secondary/60 rounded-lg p-1 border border-border">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "grid"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "table"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
              title="Data Table View"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={records.length === 0}
            className="gap-1.5 text-xs h-9"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5 text-xs h-9 hidden sm:inline-flex"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Pending */}
        <div className="card-elevated p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total KYC Pending
            </span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-foreground">
              {aggregates.totalCount}
            </span>
            <span className="text-xs text-muted-foreground">
              ({aggregates.customerPendingCount} Cust, {aggregates.staffPendingCount} Staff)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">Requires document or photo upload</div>
        </div>

        {/* Card 2: Photo Pending */}
        <div className="card-elevated p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Photo Pending
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <Camera className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-foreground">
              {aggregates.photoPendingCount}
            </span>
            <span className="text-xs text-muted-foreground">
              / {aggregates.totalCount}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">Missing or unverified photograph</div>
        </div>

        {/* Card 3: Govt ID Pending */}
        <div className="card-elevated p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Govt ID Pending
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-foreground">
              {aggregates.govtIdPendingCount}
            </span>
            <span className="text-xs text-muted-foreground">
              / {aggregates.totalCount}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">Aadhaar, PAN or Voter ID doc needed</div>
        </div>

        {/* Card 4: Location Pending */}
        <div className="card-elevated p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Location Pending
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-foreground">
              {aggregates.locationPendingCount}
            </span>
            <span className="text-xs text-muted-foreground">
              / {aggregates.totalCount}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">GPS pin or verified address missing</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-elevated p-4 rounded-xl border border-border bg-card">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Free Text Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, HPL no, phone, vehicle reg, or model..."
              className="pl-9 text-xs sm:text-sm h-10 w-full"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Pending Type Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {(["All", "Photo", "Govt ID", "Location"] as const).map((pt) => {
              const active = (filters.pendingType || "All") === pt;
              return (
                <button
                  key={pt}
                  onClick={() => handleFilterChange("pendingType", pt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-secondary/40 text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                    }`}
                >
                  {pt}
                </button>
              );
            })}
          </div>

          {/* Advanced Filter Toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="gap-2 h-10 text-xs px-3.5 border-border"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="gap-1.5 h-10 text-xs text-muted-foreground hover:text-foreground"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-border">
                {/* Entity Type */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                    Entity Type
                  </label>
                  <AppSelect
                    value={filters.entityType || "All"}
                    onValueChange={(val) => handleFilterChange("entityType", val)}
                    options={[
                      { value: "All", label: "All Entities" },
                      { value: "Customer", label: "Customer" },
                      { value: "Staff", label: "Staff" },
                      { value: "Agent", label: "Agent" },
                    ]}
                  />
                </div>

                {/* Street AutoSuggest */}
                <AutoSuggest
                  label="Street"
                  value={filters.street || ""}
                  options={filterOptions.streets}
                  filterKey="street"
                />

                {/* Village AutoSuggest */}
                <AutoSuggest
                  label="Village"
                  value={filters.village || ""}
                  options={filterOptions.villages}
                  filterKey="village"
                />

                {/* City AutoSuggest */}
                <AutoSuggest
                  label="City"
                  value={filters.city || ""}
                  options={filterOptions.cities}
                  filterKey="city"
                />

                {/* State AutoSuggest */}
                <AutoSuggest
                  label="State"
                  value={filters.state || ""}
                  options={filterOptions.states}
                  filterKey="state"
                />

                {/* Broker AutoSuggest */}
                <AutoSuggest
                  label="Broker"
                  value={filters.broker || ""}
                  options={filterOptions.brokers}
                  filterKey="broker"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Content Area: Loading / Error / Empty / Data */}
      {!loading && error ? (
        <div className="py-16 px-4 flex flex-col items-center justify-center text-center space-y-3 bg-destructive/5 rounded-2xl border border-destructive/20">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <h3 className="text-base font-semibold text-foreground">Failed to Load KYC Pending Records</h3>
          <p className="text-xs text-muted-foreground max-w-md">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2 mt-2">
            <RotateCcw className="w-3.5 h-3.5" /> Retry Request
          </Button>
        </div>
      ) : !loading && records.length === 0 ? (
        <div className="py-20 px-4 flex flex-col items-center justify-center text-center space-y-3 bg-secondary/20 rounded-2xl border border-dashed border-border">
          <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          <h3 className="text-lg font-semibold text-foreground">
            {activeFilterCount > 0 ? "No Matching Records Found" : "All Entities Fully Verified"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md">
            {activeFilterCount > 0
              ? "No records matched your active filter combinations. Try adjusting your search criteria or resetting filters."
              : "Great! All customers and staff have complete, verified photographs, government identity documents, and location records."}
          </p>
          {activeFilterCount > 0 && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5 mt-2">
              <RotateCcw className="w-3.5 h-3.5" /> Clear All Filters
            </Button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        loading ? (
          <CardGridSkeleton count={6} />
        ) : (
          /* Card Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {records.map((item, idx) => {
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * Math.min(idx, 12) }}
                onClick={() => handleRowClick(item)}
                className="card-elevated p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  {/* Top Row: Avatar/Photo + Entity Badge & Account No */}
                  <div className="flex items-start gap-3.5">
                    <div className="relative shrink-0">
                      {item.hasPhoto && item.photoUrl ? (
                        <img
                          src={item.photoUrl}
                          alt={item.name}
                          className="w-14 h-14 rounded-2xl object-cover border border-border shadow-sm group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            // Fallback to placeholder on broken image
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-secondary flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border group-hover:scale-105 transition-transform">
                          <User className="w-6 h-6 text-muted-foreground/80" />
                          <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter mt-0.5">
                            No Photo
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${entityTypeStyles[item.entityType] || "bg-secondary text-foreground"
                            }`}
                        >
                          {item.entityType}
                        </span>
                        <span className="text-xs font-bold text-primary tracking-wide">
                          {item.accountNumber}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-foreground truncate mt-1 group-hover:text-primary transition-colors">
                        {item.name}
                      </h3>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Phone className="w-3 h-3 text-muted-foreground/70" />
                        <span className="font-mono">{item.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vehicle & HP Loan Info (for Customer) */}
                  {item.entityType === "Customer" && (
                    <div className="mt-3.5 pt-3 border-t border-border/60 space-y-1.5 text-xs">
                      {item.vehicle && item.vehicle !== "—" && (
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Car className="w-3.5 h-3.5 text-primary" />
                            <span className="truncate max-w-[170px]">{item.vehicle}</span>
                          </span>
                          {item.hpAmount !== null && (
                            <span className="font-semibold text-foreground flex items-center">
                              <IndianRupee className="w-3 h-3" />
                              {item.hpAmount.toLocaleString("en-IN")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Location Info */}
                  <div className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <div className="truncate">
                      {item.hasLocation ? (
                        item.location && item.location.includes(",") && /\d/.test(item.location) ? (
                          <button
                            onClick={(e) => openGoogleMaps(item.location, e)}
                            className="hover:text-primary hover:underline transition-colors text-left truncate block font-mono text-[11px]"
                            title="Click to view on Google Maps"
                          >
                            GPS: {item.location}
                          </button>
                        ) : (
                          <span>
                            {[item.street, item.village, item.city].filter((x) => x && x !== "—").join(", ") ||
                              item.location}
                          </span>
                        )
                      ) : (
                        <span className="text-rose-500 font-medium">Location Missing</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Pending Badges + Action Button */}
                <div className="mt-4 pt-3.5 border-t border-border/80 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {item.pendingItems.map((p) => {
                      const badge = pendingBadgeStyles[p];
                      const Icon = badge?.icon || AlertCircle;
                      return (
                        <span
                          key={p}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge?.bg || "bg-secondary text-foreground"
                            }`}
                        >
                          <Icon className="w-3 h-3" /> {badge?.text || p}
                        </span>
                      );
                    })}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(item);
                    }}
                    className="text-xs h-7 px-2 text-primary hover:text-primary gap-1 group-hover:bg-primary/10 transition-colors"
                  >
                    <span>View</span>
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
        )
      ) : (
        /* Table View */
        <div className="card-elevated rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-secondary/50 border-b border-border text-muted-foreground uppercase text-[11px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Entity & Name</th>
                  <th className="py-3.5 px-4">Account No</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4">Vehicle / Details</th>
                  <th className="py-3.5 px-4">Pending Items</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <TableSkeletonRows columns={8} rows={6} />
                ) : (
                  records.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleRowClick(item)}
                    className="hover:bg-secondary/40 transition-colors cursor-pointer group"
                  >
                    {/* Entity & Name with Photo */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {item.hasPhoto && item.photoUrl ? (
                          <img
                            src={item.photoUrl}
                            alt={item.name}
                            className="w-9 h-9 rounded-xl object-cover border border-border shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0 border border-dashed border-border text-muted-foreground">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-foreground group-hover:text-primary transition-colors text-sm">
                            {item.name}
                          </div>
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold border mt-0.5 ${entityTypeStyles[item.entityType] || "bg-secondary text-foreground"
                              }`}
                          >
                            {item.entityType}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Account Number */}
                    <td className="py-3 px-4 font-bold text-primary font-mono">
                      {item.accountNumber}
                    </td>

                    {/* Phone */}
                    <td className="py-3 px-4 text-foreground font-mono">
                      {item.phone}
                    </td>

                    {/* Vehicle & HP Amount */}
                    <td className="py-3 px-4">
                      {item.entityType === "Customer" ? (
                        <div>
                          <div className="font-medium text-foreground truncate max-w-[180px]">
                            {item.vehicle}
                          </div>
                          {item.hpAmount && (
                            <div className="text-muted-foreground text-[11px]">
                              HP: ₹{item.hpAmount.toLocaleString("en-IN")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Pending Items Badges */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {item.pendingItems.map((p) => {
                          const badge = pendingBadgeStyles[p];
                          const Icon = badge?.icon || AlertCircle;
                          return (
                            <span
                              key={p}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge?.bg || "bg-secondary text-foreground"
                                }`}
                            >
                              <Icon className="w-2.5 h-2.5" /> {p}
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* Location */}
                    <td className="py-3 px-4 text-muted-foreground max-w-[160px] truncate">
                      {item.hasLocation ? (
                        item.location && item.location.includes(",") && /\d/.test(item.location) ? (
                          <button
                            onClick={(e) => openGoogleMaps(item.location, e)}
                            className="hover:text-primary hover:underline transition-colors font-mono text-[11px]"
                          >
                            GPS: {item.location}
                          </button>
                        ) : (
                          [item.street, item.city].filter((x) => x && x !== "—").join(", ") || item.location
                        )
                      ) : (
                        <span className="text-rose-500 font-medium">Missing</span>
                      )}
                    </td>

                    {/* Verification Status */}
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 capitalize">
                        {item.verificationStatus}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(item);
                        }}
                        className="text-xs h-7 px-2 text-primary hover:text-primary gap-1"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Footer */}
      {!loading && !error && records.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={filters.limit || pagination.limit || 15}
            totalItems={pagination.totalCount}
            startIndex={(pagination.page - 1) * (filters.limit || pagination.limit || 15) + 1}
            endIndex={Math.min(
              pagination.page * (filters.limit || pagination.limit || 15),
              pagination.totalCount
            )}
            onPageChange={(p) => setFilters((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(limit) =>
              setFilters((prev) => ({ ...prev, limit, page: 1 }))
            }
            pageSizeOptions={[15, 25, 50]}
            disabled={loading}
          />
        </div>
      )}
    </div>
  );
}

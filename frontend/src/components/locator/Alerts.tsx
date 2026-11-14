import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Search, Filter, X, User, Users, ChevronRight, RefreshCw,
} from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { CustomerDeepView, DeepViewCustomerSeed } from "../CustomerDeepView";
import { getRiskBadgeVariant } from "../data/customerLocatorData";
import {
  fetchRiskAlerts, getRiskErrorMessage, RiskAlertsResponse, RiskAlertCustomer, RiskTypeFilter,
} from "../../api/riskApi";
import { useClientPagination } from "../../hooks/useClientPagination";
import { TablePagination } from "../common/table/TablePagination";

const SEARCH_DEBOUNCE_MS = 400;
const TABLE_HEADERS = ["Customer", "HPL No", "Distance", "Risk Level", "Overdue", "Agent", ""];

const formatINR = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

export default function Alerts() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [riskType, setRiskType] = useState<RiskTypeFilter>("all");
  const [agentId, setAgentId] = useState("all");
  const [data, setData] = useState<RiskAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<DeepViewCustomerSeed | null>(null);
  const [deepViewOpen, setDeepViewOpen] = useState(false);

  // Debounce search input before hitting the API
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchRiskAlerts(
      { riskType, agentId, search: debouncedSearch || undefined },
      controller.signal
    )
      .then((res) => setData(res))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getRiskErrorMessage(err, "Failed to load risk alerts"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedSearch, riskType, agentId, reloadKey]);

  // The Alerts screen lists only customers needing attention (warning / high / critical)
  const alertCustomers = useMemo(
    () => (data?.customers ?? []).filter((c) => c.riskLevel !== "safe"),
    [data]
  );
  const summary = data?.summary;
  const agents = data?.agents ?? [];
  const initialLoading = loading && !data;
  const hasFilters = search !== "" || riskType !== "all" || agentId !== "all";

  const {
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    paginatedItems,
    startIndex,
    endIndex,
  } = useClientPagination(alertCustomers, {
    initialPageSize: 15,
    resetKey: `${debouncedSearch}|${riskType}|${agentId}`,
  });

  const openDeepView = (c: RiskAlertCustomer) => {
    setSelectedCustomer({
      id: c.id,
      name: c.name,
      hplNumber: c.hplno !== null ? `HPL ${c.hplno}` : undefined,
      vehicleNumber: c.vehicleNumber ?? undefined,
      riskLevel: c.riskLevel,
    });
    setDeepViewOpen(true);
  };

  const countText = (value: number | undefined) => (initialLoading || value === undefined ? "—" : value);

  return (
    <div className="space-y-5 p-1">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Customer Locator — Alerts</h1>
          <p className="text-muted-foreground mt-1 text-sm">High-risk customers requiring immediate attention</p>
        </div>
      </motion.div>

      {/* Summary — counts cover the full portfolio, independent of filters */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center"><AlertTriangle className="h-5 w-5" /></div>
            <div>
              <p className="text-2xl font-black text-red-700 dark:text-red-400">{countText(summary?.criticalAlerts)}</p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 flex items-center gap-1.5">
                Critical Alerts
                {summary && summary.highAlerts > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30">
                    +{summary.highAlerts} High
                  </span>
                )}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-amber-500/30 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center"><AlertTriangle className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black text-amber-700 dark:text-amber-400">{countText(summary?.warnings)}</p><p className="text-xs text-amber-700/80 dark:text-amber-400/80">Warnings</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><User className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black text-foreground">{countText(summary?.totalAlerts)}</p><p className="text-xs text-muted-foreground">Total Alerts</p></div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customer, HPL, phone or vehicle..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={riskType} onValueChange={(v) => setRiskType(v as RiskTypeFilter)}>
          <SelectTrigger className="w-48"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Types</SelectItem>
            <SelectItem value="payment">Payment Delay</SelectItem>
            <SelectItem value="credit">Credit Risk</SelectItem>
            <SelectItem value="distance">Distance Risk</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger className="w-48"><Users className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => { setSearch(""); setRiskType("all"); setAgentId("all"); }}>
            <X className="h-3 w-3" />Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className={`overflow-x-auto transition-opacity ${loading && data ? "opacity-60" : ""}`}>
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                {TABLE_HEADERS.map(h => (
                  <th key={h} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {initialLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {TABLE_HEADERS.map((h, idx) => (
                    <td key={`${h}-${idx}`} className="px-4 py-3 text-sm"><Skeleton className="h-4 w-full max-w-[120px]" /></td>
                  ))}
                </tr>
              ))}
              {!initialLoading && error && (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="text-center py-12 px-4 text-sm">
                    <p className="text-sm text-destructive mb-3">{error}</p>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setReloadKey((k) => k + 1)}>
                      <RefreshCw className="h-3.5 w-3.5" />Retry
                    </Button>
                  </td>
                </tr>
              )}
              {!initialLoading && !error && paginatedItems.map((c) => (
                <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="hover:bg-secondary/40 transition-colors cursor-pointer"
                  onClick={() => openDeepView(c)}>
                  <td className="px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{c.hplno ?? "—"}</td>
                  <td className="px-4 py-3 text-sm font-bold">
                    {c.distanceFromHome !== null && c.distanceFromHome !== undefined ? (
                      <span className={c.distanceFromHome > 10 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}>{c.distanceFromHome} KM</span>
                    ) : (
                      <span className="text-muted-foreground font-normal">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${getRiskBadgeVariant(c.riskLevel)}`}>
                      {c.riskLevel}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">
                      Credit: {c.creditScore}/100 · Due Risk: {c.dueRiskScore}%
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`font-bold ${c.overdueDays > 30 ? "text-red-600 dark:text-red-400" : c.overdueDays > 10 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                      {c.overdueDays} days
                    </span>
                    <p className="text-xs text-muted-foreground">{formatINR(c.overdueAmount)}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{c.assignedAgent ?? "Unassigned"}</td>
                  <td className="px-4 py-3 text-sm"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                </motion.tr>
              ))}
              {!initialLoading && !error && alertCustomers.length === 0 && (
                <tr><td colSpan={TABLE_HEADERS.length} className="text-center py-12 px-4 text-sm text-muted-foreground">No alerts matching current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          disabled={loading}
        />
      </div>

      <CustomerDeepView customer={selectedCustomer} open={deepViewOpen} onClose={() => setDeepViewOpen(false)} />
    </div>
  );
}

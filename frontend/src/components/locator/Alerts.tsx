import { useEffect, useState } from "react";
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
  const alertCustomers = (data?.customers ?? []).filter((c) => c.riskLevel !== "safe");
  const summary = data?.summary;
  const agents = data?.agents ?? [];
  const initialLoading = loading && !data;
  const hasFilters = search !== "" || riskType !== "all" || agentId !== "all";

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
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black text-foreground">Customer Locator — Alerts</h1>
        <p className="text-sm text-muted-foreground">High-risk customers requiring immediate attention</p>
      </motion.div>

      {/* Summary — counts cover the full portfolio, independent of filters */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 border-red-200 bg-red-50/50 dark:bg-red-950/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center"><AlertTriangle className="h-5 w-5" /></div>
            <div>
              <p className="text-2xl font-black text-red-700">{countText(summary?.criticalAlerts)}</p>
              <p className="text-xs text-red-600/70 flex items-center gap-1.5">
                Critical Alerts
                {summary && summary.highAlerts > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-red-500/15 text-red-700 border-red-300">
                    +{summary.highAlerts} High
                  </span>
                )}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center"><AlertTriangle className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black text-yellow-700">{countText(summary?.warnings)}</p><p className="text-xs text-yellow-600/70">Warnings</p></div>
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
      <Card className="p-0 overflow-hidden">
        <div className={`overflow-x-auto transition-opacity ${loading && data ? "opacity-60" : ""}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {TABLE_HEADERS.map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border">
                  {TABLE_HEADERS.map((h) => (
                    <td key={h} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[120px]" /></td>
                  ))}
                </tr>
              ))}
              {!initialLoading && error && (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="text-center py-12">
                    <p className="text-sm text-red-600 mb-3">{error}</p>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setReloadKey((k) => k + 1)}>
                      <RefreshCw className="h-3.5 w-3.5" />Retry
                    </Button>
                  </td>
                </tr>
              )}
              {!initialLoading && !error && alertCustomers.map((c) => (
                <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => openDeepView(c)}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.hplno ?? "—"}</td>
                  <td className="px-4 py-3 font-bold">
                    <span className={c.distanceFromHome > 10 ? "text-red-600" : "text-yellow-600"}>{c.distanceFromHome} KM</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${getRiskBadgeVariant(c.riskLevel)}`}>
                      {c.riskLevel}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">
                      Credit: {c.creditScore}/100 · Due Risk: {c.dueRiskScore}%
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${c.overdueDays > 30 ? "text-red-600" : c.overdueDays > 10 ? "text-yellow-600" : "text-foreground"}`}>
                      {c.overdueDays} days
                    </span>
                    <p className="text-xs text-muted-foreground">{formatINR(c.overdueAmount)}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.assignedAgent ?? "Unassigned"}</td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                </motion.tr>
              ))}
              {!initialLoading && !error && alertCustomers.length === 0 && (
                <tr><td colSpan={TABLE_HEADERS.length} className="text-center py-12 text-muted-foreground">No alerts matching current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CustomerDeepView customer={selectedCustomer} open={deepViewOpen} onClose={() => setDeepViewOpen(false)} />
    </div>
  );
}

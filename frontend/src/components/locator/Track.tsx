import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, MapPin, AlertTriangle, Navigation, Users,
  Phone, ExternalLink, X, Filter, RefreshCw,
} from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { CustomerDeepView, DeepViewCustomerSeed } from "../CustomerDeepView";
import { getRiskBadgeVariant } from "../data/customerLocatorData";
import {
  fetchLocatorOverview, getRiskErrorMessage, LocatorCustomer, LocatorOverviewResponse, RiskLevelFilter,
} from "../../api/riskApi";

const formatINR = (val: number) => `₹${Math.round(Number(val || 0)).toLocaleString("en-IN")}`;

function KPICard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-black text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

function MapViewport({
  customers,
  onSelect,
}: {
  customers: LocatorCustomer[];
  onSelect: (c: LocatorCustomer) => void;
}) {
  const gridSize = 300;
  const mappable = customers.filter(
    (c): c is LocatorCustomer & { currentLatitude: number; currentLongitude: number } =>
      c.currentLatitude !== null && c.currentLongitude !== null
  );

  const markerColor = (level: LocatorCustomer["riskLevel"]) => {
    switch (level) {
      case "safe": return "#22c55e";
      case "warning": return "#eab308";
      case "high": return "#ef4444";
      case "critical": return "#991b1b";
    }
  };

  if (mappable.length === 0) {
    return (
      <div className="relative w-full rounded-2xl border border-border bg-muted/30 flex flex-col items-center justify-center text-center p-6" style={{ height: gridSize }}>
        <MapPin className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm font-medium text-foreground">No GPS coordinates reported yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Select any customer in the table below to inspect their full risk & loan profile.
        </p>
      </div>
    );
  }

  const minLat = Math.min(...mappable.map((c) => c.currentLatitude)) - 0.05;
  const maxLat = Math.max(...mappable.map((c) => c.currentLatitude)) + 0.05;
  const minLng = Math.min(...mappable.map((c) => c.currentLongitude)) - 0.05;
  const maxLng = Math.max(...mappable.map((c) => c.currentLongitude)) + 0.05;

  const toXY = (lat: number, lng: number) => ({
    x: ((lng - minLng) / Math.max(0.0001, maxLng - minLng)) * (gridSize - 40) + 20,
    y: gridSize - ((lat - minLat) / Math.max(0.0001, maxLat - minLat)) * (gridSize - 40) - 20,
  });

  return (
    <div className="relative w-full rounded-2xl border border-border bg-muted/30 overflow-hidden" style={{ height: gridSize }}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      <div className="absolute top-3 left-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border">
        <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-primary" /> Customer Map View ({mappable.length} mapped)
        </p>
      </div>
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${gridSize} ${gridSize}`}>
        {mappable.map((c) => {
          const { x, y } = toXY(c.currentLatitude, c.currentLongitude);
          return (
            <g key={c.id} className="cursor-pointer" onClick={() => onSelect(c)}>
              <circle cx={x} cy={y} r={12} fill={markerColor(c.riskLevel)} opacity={0.2} />
              <circle cx={x} cy={y} r={6} fill={markerColor(c.riskLevel)} stroke="white" strokeWidth={2} />
              <title>
                {c.name} — {c.distanceFromHome !== null ? `${c.distanceFromHome} KM` : c.currentAddress}
              </title>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border flex flex-col gap-1">
        {[
          { label: "Safe", color: "#22c55e" },
          { label: "Warning", color: "#eab308" },
          { label: "High", color: "#ef4444" },
          { label: "Critical", color: "#991b1b" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerTrack() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskLevelFilter>("all");
  const [data, setData] = useState<LocatorOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<LocatorCustomer | null>(null);
  const [deepViewSeed, setDeepViewSeed] = useState<DeepViewCustomerSeed | null>(null);
  const [deepViewOpen, setDeepViewOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchLocatorOverview(
      { riskLevel: riskFilter, search: debouncedSearch || undefined },
      controller.signal
    )
      .then((res) => setData(res))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getRiskErrorMessage(err, "Failed to load customer locator data"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedSearch, riskFilter, reloadKey]);

  const openDeepView = useCallback((c: LocatorCustomer) => {
    setDeepViewSeed({
      id: c.id,
      name: c.name,
      hplNumber: c.hplno !== null ? `HPL ${c.hplno}` : undefined,
      vehicleNumber: c.vehicleNumber ?? undefined,
      riskLevel: c.riskLevel,
    });
    setDeepViewOpen(true);
  }, []);

  const customers = data?.customers ?? [];
  const summary = data?.summary;
  const initialLoading = loading && !data;

  return (
    <div className="space-y-5 p-1">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Customer Locator — Track</h1>
          <p className="text-sm text-muted-foreground">Live portfolio location intelligence & verified overdue risk</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </motion.div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search HPL / Vehicle / Phone / Name..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskLevelFilter)}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="safe">Safe</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="high">High Risk</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        {(debouncedSearch || riskFilter !== "all") && (
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => { setSearch(""); setDebouncedSearch(""); setRiskFilter("all"); }}>
            <X className="h-3 w-3" /> Clear All
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Active Portfolio" value={initialLoading ? "—" : (summary?.filteredCount ?? 0)} icon={Users} color="bg-primary/10 text-primary" />
        <KPICard label="High / Critical Risk" value={initialLoading ? "—" : ((summary?.criticalAlerts ?? 0) + (summary?.highAlerts ?? 0))} icon={AlertTriangle} color="bg-red-100 text-red-600" />
        <KPICard label="Avg GPS Distance" value={initialLoading ? "—" : (summary?.avgDistanceKm != null ? `${summary.avgDistanceKm} KM` : "—")} icon={Navigation} color="bg-yellow-100 text-yellow-700" />
        <KPICard label="Active Risk Alerts" value={initialLoading ? "—" : (summary?.totalAlerts ?? 0)} icon={AlertTriangle} color="bg-orange-100 text-orange-600" />
      </div>

      {/* Split: Map + Customer Card */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <MapViewport customers={customers} onSelect={setSelectedCustomer} />
        </div>

        <div className="lg:col-span-2 space-y-3 max-h-[340px] overflow-y-auto pr-1">
          {selectedCustomer ? (
            <CustomerCard
              customer={selectedCustomer}
              onDeepView={openDeepView}
              onClose={() => setSelectedCustomer(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 text-muted-foreground rounded-2xl border border-border bg-card/50">
              <MapPin className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Select a marker or table row to inspect customer details</p>
            </div>
          )}
        </div>
      </div>

      {/* Customer Table */}
      <Card className="p-0 overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Customer", "HPL No", "Vehicle", "Distance", "Risk", "Overdue EMI", "Agent", "Action"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialLoading && Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  ))}
                </tr>
              ))}
              {!initialLoading && error && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-red-600">{error}</td>
                </tr>
              )}
              {!initialLoading && !error && customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedCustomer(c);
                    openDeepView(c);
                  }}
                >
                  <td className="px-4 py-3 font-medium">
                    <div>
                      <p>{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.hplno != null ? `HPL-${c.hplno}` : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.vehicleNumber ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.distanceFromHome !== null ? (
                      <span className={`font-bold ${c.distanceFromHome > 25 ? "text-red-600" : c.distanceFromHome > 10 ? "text-yellow-600" : "text-green-600"}`}>
                        {c.distanceFromHome} KM
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${getRiskBadgeVariant(c.riskLevel)}`}>
                      {c.riskLevel}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Credit {c.creditScore}/100</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className={c.overdueAmount > 0 ? "font-semibold text-red-600" : ""}>{formatINR(c.overdueAmount)}</span>
                    {c.overdueDays > 0 && <p className="text-[11px] text-muted-foreground">{c.overdueDays}d overdue</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.assignedAgent || "—"}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); openDeepView(c); }}>
                      View <ExternalLink className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!initialLoading && !error && customers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No customers match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CustomerDeepView customer={deepViewSeed} open={deepViewOpen} onClose={() => setDeepViewOpen(false)} />
    </div>
  );
}

function CustomerCard({
  customer: c,
  onDeepView,
  onClose,
}: {
  customer: LocatorCustomer;
  onDeepView: (c: LocatorCustomer) => void;
  onClose: () => void;
}) {
  const openMaps = (lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) return;
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-2xl border border-border bg-card shadow-sm space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-foreground">{c.name}</p>
          <p className="text-xs text-muted-foreground">
            {c.hplno != null ? `HPL-${c.hplno}` : "—"} · {c.vehicleNumber ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${getRiskBadgeVariant(c.riskLevel)}`}>
            {c.riskLevel}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-muted/50">
          <span className="text-muted-foreground">Distance</span>
          <p className="font-bold">{c.distanceFromHome != null ? `${c.distanceFromHome} KM` : "—"}</p>
        </div>
        <div className="p-2 rounded-lg bg-muted/50">
          <span className="text-muted-foreground">Overdue EMI</span>
          <p className="font-bold">{formatINR(c.overdueAmount)}</p>
        </div>
        <div className="p-2 rounded-lg bg-muted/50">
          <span className="text-muted-foreground">Overdue Days</span>
          <p className="font-bold">{c.overdueDays}d</p>
        </div>
        <div className="p-2 rounded-lg bg-muted/50">
          <span className="text-muted-foreground">Credit / Due Risk</span>
          <p className="font-bold">{c.creditScore}/100 · {c.dueRiskScore}%</p>
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{c.currentAddress}</span>
        {c.currentLatitude != null && c.currentLongitude != null && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs ml-auto" onClick={() => openMaps(c.currentLatitude, c.currentLongitude)}>
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
      </div>
      {c.phone && (
        <div className="flex flex-wrap gap-1.5">
          <a href={`tel:${c.phone}`}>
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
              <Phone className="h-3 w-3" /> {c.phone}
            </Button>
          </a>
        </div>
      )}
      <Button size="sm" className="w-full text-xs gap-1" onClick={() => onDeepView(c)}>
        View Full Profile <ExternalLink className="h-3 w-3" />
      </Button>
    </motion.div>
  );
}

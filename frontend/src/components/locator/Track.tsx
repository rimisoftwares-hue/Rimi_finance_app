import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, MapPin, AlertTriangle, Navigation, Users,
  Phone, MessageSquare, UserPlus, ClipboardList, ExternalLink,
  X, Home, Filter,
} from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { CustomerDeepView } from "../CustomerDeepView";
import {
  Customer, mockCustomers, getRiskBadgeVariant, getRiskColor,
} from "../data/customerLocatorData";

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

function MapPlaceholder({ customers, onSelect }: { customers: Customer[]; onSelect: (c: Customer) => void }) {
  const gridSize = 300;
  const minLat = Math.min(...customers.map(c => c.currentLatitude)) - 0.5;
  const maxLat = Math.max(...customers.map(c => c.currentLatitude)) + 0.5;
  const minLng = Math.min(...customers.map(c => c.currentLongitude)) - 0.5;
  const maxLng = Math.max(...customers.map(c => c.currentLongitude)) + 0.5;

  const toXY = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * (gridSize - 40) + 20,
    y: gridSize - ((lat - minLat) / (maxLat - minLat)) * (gridSize - 40) - 20,
  });

  const markerColor = (level: Customer["riskLevel"]) => {
    switch (level) {
      case "safe": return "#22c55e";
      case "warning": return "#eab308";
      case "high": return "#ef4444";
      case "critical": return "#991b1b";
    }
  };

  return (
    <div className="relative w-full rounded-2xl border border-border bg-muted/30 overflow-hidden" style={{ height: gridSize }}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      <div className="absolute top-3 left-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border">
        <p className="text-xs font-medium text-foreground flex items-center gap-1.5"><MapPin className="h-3 w-3 text-primary" />Customer Map View</p>
      </div>
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${gridSize} ${gridSize}`}>
        {customers.map((c) => {
          const { x, y } = toXY(c.currentLatitude, c.currentLongitude);
          return (
            <g key={c.id} className="cursor-pointer" onClick={() => onSelect(c)}>
              <circle cx={x} cy={y} r={12} fill={markerColor(c.riskLevel)} opacity={0.2} />
              <circle cx={x} cy={y} r={6} fill={markerColor(c.riskLevel)} stroke="white" strokeWidth={2} />
              <title>{c.name} — {c.distanceFromHome} KM</title>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border flex flex-col gap-1">
        {[{ label: "Safe < 10 KM", color: "#22c55e" }, { label: "Warning 10-25", color: "#eab308" }, { label: "High > 25", color: "#ef4444" }, { label: "Critical > 50", color: "#991b1b" }].map(l => (
          <div key={l.label} className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerTrack() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [deepViewOpen, setDeepViewOpen] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => setDebouncedSearch(val), 300));
  }, [searchTimeout]);

  const filtered = useMemo(() => {
    let result = mockCustomers;
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      result = result.filter(c =>
        c.hplNumber.toLowerCase().includes(s) ||
        c.vehicleNumber.toLowerCase().includes(s) ||
        c.phone.includes(s) ||
        c.name.toLowerCase().includes(s)
      );
    }
    if (riskFilter !== "all") result = result.filter(c => c.riskLevel === riskFilter);
    return result;
  }, [debouncedSearch, riskFilter]);

  const kpis = useMemo(() => ({
    total: filtered.length,
    highRisk: filtered.filter(c => c.riskLevel === "high" || c.riskLevel === "critical").length,
    avgDist: filtered.length ? Math.round(filtered.reduce((a, c) => a + c.distanceFromHome, 0) / filtered.length * 10) / 10 : 0,
    alerts: filtered.filter(c => c.riskScore > 60).length,
  }), [filtered]);

  const openDeepView = (c: Customer) => { setSelectedCustomer(c); setDeepViewOpen(true); };

  return (
    <div className="space-y-5 p-1">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black text-foreground">Customer Locator — Track</h1>
        <p className="text-sm text-muted-foreground">Real-time location intelligence & risk monitoring</p>
      </motion.div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search HPL / Vehicle / Phone / Name..." className="pl-9" value={search} onChange={(e) => handleSearch(e.target.value)} />
        </div>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="safe">🟢 Safe</SelectItem>
            <SelectItem value="warning">🟡 Warning</SelectItem>
            <SelectItem value="high">🔴 High Risk</SelectItem>
            <SelectItem value="critical">🚨 Critical</SelectItem>
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
        <KPICard label="Total Tracked" value={kpis.total} icon={Users} color="bg-primary/10 text-primary" />
        <KPICard label="High Risk" value={kpis.highRisk} icon={AlertTriangle} color="bg-red-100 text-red-600" />
        <KPICard label="Avg Distance (KM)" value={kpis.avgDist} icon={Navigation} color="bg-yellow-100 text-yellow-700" />
        <KPICard label="Active Alerts" value={kpis.alerts} icon={AlertTriangle} color="bg-orange-100 text-orange-600" />
      </div>

      {/* Split: Map + Customer List */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Map */}
        <div className="lg:col-span-3">
          <MapPlaceholder customers={filtered} onSelect={(c) => { setSelectedCustomer(c); }} />
        </div>

        {/* Customer Card Panel */}
        <div className="lg:col-span-2 space-y-3 max-h-[340px] overflow-y-auto pr-1">
          {selectedCustomer ? (
            <CustomerCard customer={selectedCustomer} onDeepView={openDeepView} onClose={() => setSelectedCustomer(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 text-muted-foreground">
              <MapPin className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Click a marker on the map to view customer details</p>
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
                {["Customer", "HPL No", "Vehicle", "Distance", "Risk", "Overdue", "Agent", "Action"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openDeepView(c)}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.hplNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.vehicleNumber}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${c.distanceFromHome > 25 ? "text-red-600" : c.distanceFromHome > 10 ? "text-yellow-600" : "text-green-600"}`}>
                      {c.distanceFromHome} KM
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${getRiskBadgeVariant(c.riskLevel)}`}>
                      {c.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">₹{c.overdueAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.assignedAgent || "—"}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); openDeepView(c); }}>
                      View <ExternalLink className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CustomerDeepView customer={selectedCustomer} open={deepViewOpen} onClose={() => setDeepViewOpen(false)} />
    </div>
  );
}

function CustomerCard({ customer: c, onDeepView, onClose }: { customer: Customer; onDeepView: (c: Customer) => void; onClose: () => void }) {
  const openMaps = (lat: number, lng: number) => window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-2xl border border-border bg-card shadow-sm space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-foreground">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.hplNumber} · {c.vehicleNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${getRiskBadgeVariant(c.riskLevel)}`}>
            {c.riskLevel}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-muted/50"><span className="text-muted-foreground">Distance</span><p className="font-bold">{c.distanceFromHome} KM</p></div>
        <div className="p-2 rounded-lg bg-muted/50"><span className="text-muted-foreground">Overdue</span><p className="font-bold">₹{c.overdueAmount.toLocaleString()}</p></div>
        <div className="p-2 rounded-lg bg-muted/50"><span className="text-muted-foreground">Last Home</span><p className="font-bold">{c.lastSeenHome.split(" ")[0]}</p></div>
        <div className="p-2 rounded-lg bg-muted/50"><span className="text-muted-foreground">Score</span><p className="font-bold">{c.riskScore}/100</p></div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <MapPin className="h-3 w-3" />{c.currentAddress}
        <Button variant="link" size="sm" className="h-auto p-0 text-xs ml-auto" onClick={() => openMaps(c.currentLatitude, c.currentLongitude)}>
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1"><UserPlus className="h-3 w-3" />Assign Agent</Button>
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1"><Phone className="h-3 w-3" />Call</Button>
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1"><MessageSquare className="h-3 w-3" />WhatsApp</Button>
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1"><ClipboardList className="h-3 w-3" />Task</Button>
      </div>
      <Button size="sm" className="w-full text-xs gap-1" onClick={() => onDeepView(c)}>View Full Profile <ExternalLink className="h-3 w-3" /></Button>
    </motion.div>
  );
}

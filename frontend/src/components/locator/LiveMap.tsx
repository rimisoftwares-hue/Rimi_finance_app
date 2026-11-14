import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  MapPin, Radio, Users, Activity, Clock, Navigation, Filter, RefreshCw,
} from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { CustomerDeepView, DeepViewCustomerSeed } from "../CustomerDeepView";
import {
  fetchLocatorOverview,
  getRiskErrorMessage,
  LocatorActivityItem,
  LocatorCustomer,
  LocatorOverviewResponse,
  RiskLevelFilter,
} from "../../api/riskApi";

export default function LiveMap() {
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<RiskLevelFilter>("all");
  const [data, setData] = useState<LocatorOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepViewSeed, setDeepViewSeed] = useState<DeepViewCustomerSeed | null>(null);
  const [deepViewOpen, setDeepViewOpen] = useState(false);

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetchLocatorOverview(
          {
            agentId: agentFilter,
            riskLevel: riskFilter,
          },
          signal
        );
        setData(res);
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(getRiskErrorMessage(err, "Failed to load live field map"));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [agentFilter, riskFilter]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadData(controller.signal);
    const interval = setInterval(() => {
      loadData(controller.signal);
    }, 15000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [loadData]);

  const agents = data?.agents ?? [];
  const filteredAgents = agentFilter === "all" ? agents : agents.filter((a) => a.id === agentFilter);
  const customers = data?.customers ?? [];
  const activityFeed = data?.activityFeed ?? [];

  const mappableCustomers = customers.filter(
    (c): c is LocatorCustomer & { currentLatitude: number; currentLongitude: number } =>
      c.currentLatitude !== null && c.currentLongitude !== null
  );
  const mappableAgents = filteredAgents.filter(
    (a): a is typeof filteredAgents[number] & { currentLatitude: number; currentLongitude: number } =>
      a.currentLatitude !== null && a.currentLongitude !== null
  );

  const gridSize = 360;
  const allPoints = [
    ...mappableCustomers.map((c) => ({ lat: c.currentLatitude, lng: c.currentLongitude })),
    ...mappableAgents.map((a) => ({ lat: a.currentLatitude, lng: a.currentLongitude })),
  ];
  const minLat = allPoints.length ? Math.min(...allPoints.map((p) => p.lat)) - 0.05 : 11.0;
  const maxLat = allPoints.length ? Math.max(...allPoints.map((p) => p.lat)) + 0.05 : 11.2;
  const minLng = allPoints.length ? Math.min(...allPoints.map((p) => p.lng)) - 0.05 : 77.2;
  const maxLng = allPoints.length ? Math.max(...allPoints.map((p) => p.lng)) + 0.05 : 77.4;

  const toXY = (lat: number, lng: number) => ({
    x: ((lng - minLng) / Math.max(0.0001, maxLng - minLng)) * (gridSize - 40) + 20,
    y: gridSize - ((lat - minLat) / Math.max(0.0001, maxLat - minLat)) * (gridSize - 40) - 20,
  });

  const markerColor = (level: LocatorCustomer["riskLevel"]) => {
    switch (level) {
      case "safe": return "#22c55e";
      case "warning": return "#eab308";
      case "high": return "#ef4444";
      case "critical": return "#991b1b";
    }
  };

  const activityIcon = (type: LocatorActivityItem["type"]) => {
    switch (type) {
      case "alert": return <div className="h-6 w-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><Activity className="h-3 w-3" /></div>;
      case "move": return <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><Navigation className="h-3 w-3" /></div>;
      case "visit": return <div className="h-6 w-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><MapPin className="h-3 w-3" /></div>;
      default: return <div className="h-6 w-6 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center"><Clock className="h-3 w-3" /></div>;
    }
  };

  return (
    <div className="space-y-5 p-1">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Customer Locator — Live Map
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Real-time field monitoring · Auto-refresh every 15s</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5 text-green-500" />
            {data?.summary.onlineAgentsCount ?? 0} agents online
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </motion.div>

      {error && (
        <Card className="p-3 border-red-300 bg-red-50/50 text-xs text-red-600">{error}</Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-48"><Users className="h-4 w-4 mr-2" /><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskLevelFilter)}>
          <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="All Risk" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk</SelectItem>
            <SelectItem value="safe">Safe</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Split: Map + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="relative w-full rounded-2xl border border-border bg-muted/30 overflow-hidden" style={{ height: gridSize }}>
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
            <div className="absolute top-3 left-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border flex items-center gap-2 z-10">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>
              <p className="text-xs font-medium text-foreground">
                Live Tracking ({mappableCustomers.length} customers · {mappableAgents.length} agents mapped)
              </p>
            </div>
            {allPoints.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-foreground">No live GPS coordinates reported right now</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Coordinates appear automatically when field agents or customer devices report GPS pings.
                </p>
              </div>
            ) : (
              <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${gridSize} ${gridSize}`}>
                {mappableCustomers.map((c) => {
                  const { x, y } = toXY(c.currentLatitude, c.currentLongitude);
                  return (
                    <g
                      key={`c-${c.id}`}
                      className="cursor-pointer"
                      onClick={() => {
                        setDeepViewSeed({
                          id: c.id,
                          name: c.name,
                          hplNumber: c.hplno !== null ? `HPL ${c.hplno}` : undefined,
                          vehicleNumber: c.vehicleNumber ?? undefined,
                          riskLevel: c.riskLevel,
                        });
                        setDeepViewOpen(true);
                      }}
                    >
                      <circle cx={x} cy={y} r={14} fill={markerColor(c.riskLevel)} opacity={0.15} />
                      <circle cx={x} cy={y} r={7} fill={markerColor(c.riskLevel)} stroke="white" strokeWidth={2} />
                      <title>{c.name} ({c.riskLevel}) — {c.currentAddress}</title>
                    </g>
                  );
                })}
                {mappableAgents.map((a) => {
                  const { x, y } = toXY(a.currentLatitude, a.currentLongitude);
                  return (
                    <g key={`a-${a.id}`}>
                      <rect x={x - 8} y={y - 8} width={16} height={16} rx={4} fill="hsl(var(--primary))" stroke="white" strokeWidth={2} />
                      <text x={x} y={y + 4} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">{a.name.charAt(0)}</text>
                      <text x={x} y={y + 22} textAnchor="middle" fontSize="8" fill="hsl(var(--muted-foreground))" fontWeight="600">{a.name.split(" ")[0]}</text>
                      <title>{a.name} ({a.status})</title>
                    </g>
                  );
                })}
              </svg>
            )}
            <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><div className="h-3 w-3 rounded bg-primary" />Agent</div>
              {[{ label: "Safe", color: "#22c55e" }, { label: "Warning", color: "#eab308" }, { label: "High", color: "#ef4444" }, { label: "Critical", color: "#991b1b" }].map((l) => (
                <div key={l.label} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.label}
                </div>
              ))}
            </div>
          </div>

          {/* Agent Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {filteredAgents.length === 0 ? (
              <Card className="p-4 col-span-full text-center text-xs text-muted-foreground">
                No active field agents configured for this finance company
              </Card>
            ) : (
              filteredAgents.map((a) => (
                <Card key={a.id} className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      {a.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{a.status}</p>
                    </div>
                    <span className={`ml-auto h-2 w-2 rounded-full ${a.isOnline ? "bg-green-500" : "bg-gray-400"}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.assignedCount} assigned
                    {a.batteryLevel != null ? ` · ${a.batteryLevel}%` : ""}
                  </p>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Live Activity & Risk Feed */}
        <div>
          <Card className="p-4 h-full">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-primary" /> Live Field & Risk Feed
            </h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {activityFeed.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No field assignments or risk alerts recorded yet
                </p>
              ) : (
                activityFeed.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {activityIcon(item.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">{item.message}</p>
                      {item.timestamp && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.timestamp.slice(0, 16).replace("T", " ")}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <CustomerDeepView customer={deepViewSeed} open={deepViewOpen} onClose={() => setDeepViewOpen(false)} />
    </div>
  );
}

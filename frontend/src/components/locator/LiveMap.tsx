import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MapPin, Radio, Users, Activity, Clock, Navigation,
  ChevronRight, Phone, ExternalLink, Filter,
} from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { CustomerDeepView } from "../CustomerDeepView";
import {
  Customer, Agent, mockCustomers, mockAgents, getRiskBadgeVariant,
} from "../data/customerLocatorData";

interface ActivityItem {
  id: number;
  time: string;
  type: "move" | "alert" | "visit" | "update";
  message: string;
}

const activityFeed: ActivityItem[] = [
  { id: 1, time: "10:15 AM", type: "alert", message: "Priya Sharma moved >50 KM from home — Critical alert triggered" },
  { id: 2, time: "10:12 AM", type: "move", message: "Suresh M (Agent) reached T. Nagar, Chennai" },
  { id: 3, time: "10:05 AM", type: "visit", message: "Meena R completed visit to Mohammed Ali" },
  { id: 4, time: "09:58 AM", type: "update", message: "Lakshmi Narayanan risk score updated to 95 (Critical)" },
  { id: 5, time: "09:45 AM", type: "move", message: "Arun K en route to Tumkur for Priya Sharma visit" },
  { id: 6, time: "09:30 AM", type: "alert", message: "Deepa Venkatesh — 135 KM from home, overdue 75 days" },
  { id: 7, time: "09:20 AM", type: "visit", message: "Suresh M checked in at Rajesh Kumar's location" },
  { id: 8, time: "09:00 AM", type: "update", message: "Morning tracking cycle started — 4 agents online" },
];

export default function LiveMap() {
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [deepViewOpen, setDeepViewOpen] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Simulated live refresh
  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredAgents = agentFilter === "all" ? mockAgents : mockAgents.filter(a => a.id.toString() === agentFilter);
  const filteredCustomers = riskFilter === "all" ? mockCustomers : mockCustomers.filter(c => c.riskLevel === riskFilter);

  const gridSize = 360;
  const allPoints = [
    ...filteredCustomers.map(c => ({ lat: c.currentLatitude, lng: c.currentLongitude })),
    ...filteredAgents.map(a => ({ lat: a.currentLatitude, lng: a.currentLongitude })),
  ];
  const minLat = Math.min(...allPoints.map(p => p.lat)) - 0.5;
  const maxLat = Math.max(...allPoints.map(p => p.lat)) + 0.5;
  const minLng = Math.min(...allPoints.map(p => p.lng)) - 0.5;
  const maxLng = Math.max(...allPoints.map(p => p.lng)) + 0.5;
  const toXY = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * (gridSize - 40) + 20,
    y: gridSize - ((lat - minLat) / (maxLat - minLat)) * (gridSize - 40) - 20,
  });

  const markerColor = (level: Customer["riskLevel"]) => {
    switch (level) {
      case "safe": return "#22c55e"; case "warning": return "#eab308";
      case "high": return "#ef4444"; case "critical": return "#991b1b";
    }
  };

  const activityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "alert": return <div className="h-6 w-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><Activity className="h-3 w-3" /></div>;
      case "move": return <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><Navigation className="h-3 w-3" /></div>;
      case "visit": return <div className="h-6 w-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><MapPin className="h-3 w-3" /></div>;
      case "update": return <div className="h-6 w-6 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center"><Clock className="h-3 w-3" /></div>;
    }
  };

  return (
    <div className="space-y-5 p-1">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            Customer Locator — Live Map
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75`} />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">Real-time field monitoring · Auto-refresh every 5s</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="h-3.5 w-3.5 text-green-500" />
          {mockAgents.filter(a => a.status === "online").length} agents online
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-44"><Users className="h-4 w-4 mr-2" /><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {mockAgents.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="All Risk" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk</SelectItem>
            <SelectItem value="safe">🟢 Safe</SelectItem>
            <SelectItem value="warning">🟡 Warning</SelectItem>
            <SelectItem value="high">🔴 High</SelectItem>
            <SelectItem value="critical">🚨 Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Split: Map + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map */}
        <div className="lg:col-span-2">
          <div className="relative w-full rounded-2xl border border-border bg-muted/30 overflow-hidden" style={{ height: gridSize }}>
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
            <div className="absolute top-3 left-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border flex items-center gap-2">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>
              <p className="text-xs font-medium text-foreground">Live Tracking</p>
            </div>
            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${gridSize} ${gridSize}`}>
              {/* Customer markers */}
              {filteredCustomers.map((c) => {
                const { x, y } = toXY(c.currentLatitude, c.currentLongitude);
                return (
                  <g key={`c-${c.id}`} className="cursor-pointer" onClick={() => { setSelectedCustomer(c); setDeepViewOpen(true); }}>
                    <circle cx={x} cy={y} r={14} fill={markerColor(c.riskLevel)} opacity={0.15} />
                    <circle cx={x} cy={y} r={7} fill={markerColor(c.riskLevel)} stroke="white" strokeWidth={2} />
                    <title>{c.name} ({c.riskLevel}) — {c.distanceFromHome} KM</title>
                  </g>
                );
              })}
              {/* Agent markers */}
              {filteredAgents.map((a) => {
                const { x, y } = toXY(a.currentLatitude, a.currentLongitude);
                return (
                  <g key={`a-${a.id}`}>
                    <rect x={x - 8} y={y - 8} width={16} height={16} rx={4} fill="hsl(var(--primary))" stroke="white" strokeWidth={2} />
                    <text x={x} y={y + 4} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">{a.name.charAt(0)}</text>
                    <text x={x} y={y + 22} textAnchor="middle" fontSize="8" fill="hsl(var(--muted-foreground))" fontWeight="600">{a.name.split(" ")[0]}</text>
                    <title>{a.name} — {a.assignedZone} ({a.status})</title>
                  </g>
                );
              })}
            </svg>
            {/* Legend */}
            <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><div className="h-3 w-3 rounded bg-primary" />Agent</div>
              {[{ label: "Safe", color: "#22c55e" }, { label: "Warning", color: "#eab308" }, { label: "High", color: "#ef4444" }, { label: "Critical", color: "#991b1b" }].map(l => (
                <div key={l.label} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.label}
                </div>
              ))}
            </div>
          </div>

          {/* Agent Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {filteredAgents.map(a => (
              <Card key={a.id} className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                    {a.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-[10px] text-muted-foreground">{a.assignedZone}</p>
                  </div>
                  <span className={`ml-auto h-2 w-2 rounded-full ${a.status === "online" ? "bg-green-500" : "bg-gray-400"}`} />
                </div>
                <p className="text-xs text-muted-foreground">{a.assignedCustomers.length} assigned · Last: {a.lastUpdate.split(" ").slice(1).join(" ")}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div>
          <Card className="p-4 h-full">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><Activity className="h-4 w-4 text-primary" />Live Activity Feed</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {activityFeed.map((item, i) => (
                <motion.div key={item.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  {activityIcon(item.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">{item.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <CustomerDeepView customer={selectedCustomer} open={deepViewOpen} onClose={() => setDeepViewOpen(false)} />
    </div>
  );
}

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Search, Filter, X, ExternalLink, MapPin,
  User, Calendar, ChevronRight,
} from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { CustomerDeepView } from "../CustomerDeepView";
import { Customer, mockCustomers, getRiskBadgeVariant } from "../data/customerLocatorData";

type RiskType = "all" | "distance" | "payment" | "long_stay";

export default function Alerts() {
  const [search, setSearch] = useState("");
  const [riskType, setRiskType] = useState<RiskType>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [deepViewOpen, setDeepViewOpen] = useState(false);

  const alertCustomers = useMemo(() => {
    let result = mockCustomers.filter(c => c.riskLevel === "high" || c.riskLevel === "critical" || c.riskLevel === "warning");
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(s) || c.hplNumber.toLowerCase().includes(s));
    }
    if (riskType === "distance") result = result.filter(c => c.distanceFromHome > 25);
    if (riskType === "payment") result = result.filter(c => c.overdueDays > 30);
    if (riskType === "long_stay") result = result.filter(c => c.riskScore > 70);
    return result.sort((a, b) => b.riskScore - a.riskScore);
  }, [search, riskType]);

  const criticalCount = alertCustomers.filter(c => c.riskLevel === "critical").length;
  const warningCount = alertCustomers.filter(c => c.riskLevel === "warning").length;

  return (
    <div className="space-y-5 p-1">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black text-foreground">Customer Locator — Alerts</h1>
        <p className="text-sm text-muted-foreground">High-risk customers requiring immediate attention</p>
      </motion.div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 border-red-200 bg-red-50/50 dark:bg-red-950/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center"><AlertTriangle className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black text-red-700">{criticalCount}</p><p className="text-xs text-red-600/70">Critical Alerts</p></div>
          </div>
        </Card>
        <Card className="p-4 border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center"><AlertTriangle className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black text-yellow-700">{warningCount}</p><p className="text-xs text-yellow-600/70">Warnings</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><User className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black text-foreground">{alertCustomers.length}</p><p className="text-xs text-muted-foreground">Total Alerts</p></div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customer or HPL..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={riskType} onValueChange={(v) => setRiskType(v as RiskType)}>
          <SelectTrigger className="w-48"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Types</SelectItem>
            <SelectItem value="distance">Distance Risk</SelectItem>
            <SelectItem value="payment">Payment Delay</SelectItem>
            <SelectItem value="long_stay">Long Stay Away</SelectItem>
          </SelectContent>
        </Select>
        {(search || riskType !== "all") && (
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => { setSearch(""); setRiskType("all"); }}>
            <X className="h-3 w-3" />Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Customer", "HPL No", "Distance", "Risk Level", "Last Location", "Overdue Days", "Agent", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alertCustomers.map((c) => (
                <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => { setSelectedCustomer(c); setDeepViewOpen(true); }}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.hplNumber}</td>
                  <td className="px-4 py-3 font-bold">
                    <span className={c.distanceFromHome > 25 ? "text-red-600" : "text-yellow-600"}>{c.distanceFromHome} KM</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${getRiskBadgeVariant(c.riskLevel)}`}>
                      {c.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />{c.currentAddress}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${c.overdueDays > 30 ? "text-red-600" : c.overdueDays > 10 ? "text-yellow-600" : "text-foreground"}`}>
                      {c.overdueDays}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.assignedAgent || "—"}</td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                </motion.tr>
              ))}
              {alertCustomers.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No alerts matching current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CustomerDeepView customer={selectedCustomer} open={deepViewOpen} onClose={() => setDeepViewOpen(false)} />
    </div>
  );
}

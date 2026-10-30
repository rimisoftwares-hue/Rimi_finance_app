import { motion } from "framer-motion";
import {
  TrendingUp, AlertTriangle, MapPin, BarChart3, PieChart as PieChartIcon,
  Download, FileText, FileSpreadsheet,
} from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LineChart, Line, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { mockCustomers } from "../data/customerLocatorData";

const riskDist = [
  { name: "Safe", value: mockCustomers.filter(c => c.riskLevel === "safe").length, color: "#22c55e" },
  { name: "Warning", value: mockCustomers.filter(c => c.riskLevel === "warning").length, color: "#eab308" },
  { name: "High", value: mockCustomers.filter(c => c.riskLevel === "high").length, color: "#ef4444" },
  { name: "Critical", value: mockCustomers.filter(c => c.riskLevel === "critical").length, color: "#991b1b" },
];

const movementTrend = [
  { day: "Mon", distance: 45 }, { day: "Tue", distance: 32 }, { day: "Wed", distance: 58 },
  { day: "Thu", distance: 41 }, { day: "Fri", distance: 67 }, { day: "Sat", distance: 28 }, { day: "Sun", distance: 15 },
];

const peakHours = [
  { hour: "6AM", count: 2 }, { hour: "8AM", count: 8 }, { hour: "10AM", count: 15 }, { hour: "12PM", count: 12 },
  { hour: "2PM", count: 18 }, { hour: "4PM", count: 14 }, { hour: "6PM", count: 9 }, { hour: "8PM", count: 5 },
];

const topLocations = [
  { area: "Chennai", pct: 35, customers: 3 },
  { area: "Bangalore", pct: 25, customers: 2 },
  { area: "Hyderabad", pct: 15, customers: 1 },
  { area: "Coimbatore", pct: 12, customers: 1 },
  { area: "Madurai", pct: 8, customers: 1 },
  { area: "Vizag", pct: 5, customers: 1 },
];

const paymentMovement = mockCustomers.map(c => ({
  name: c.name,
  movement: c.distanceFromHome,
  overdueDays: c.overdueDays,
  risk: c.riskScore,
}));

export default function Insights() {
  return (
    <div className="space-y-5 p-1">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Customer Locator — Insights</h1>
          <p className="text-sm text-muted-foreground">Analytics, patterns & business intelligence</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />PDF</Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs"><FileSpreadsheet className="h-3.5 w-3.5" />Excel</Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />CSV</Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk Distribution */}
        <Card className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><PieChartIcon className="h-4 w-4 text-primary" />Risk Distribution</h3>
          <div className="flex items-center gap-6">
            <div className="h-48 w-48">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={riskDist} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4}>
                    {riskDist.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {riskDist.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                  <span className="text-sm">{d.name}</span>
                  <span className="text-sm font-bold ml-auto">{d.value}</span>
                  <span className="text-xs text-muted-foreground">({Math.round(d.value / mockCustomers.length * 100)}%)</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Movement Trend */}
        <Card className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><TrendingUp className="h-4 w-4 text-primary" />Daily Movement Trend (Avg KM)</h3>
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={movementTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Line type="monotone" dataKey="distance" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Peak Hours */}
        <Card className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><BarChart3 className="h-4 w-4 text-primary" />Peak Movement Hours</h3>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={peakHours}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Payment vs Movement Scatter */}
        <Card className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><AlertTriangle className="h-4 w-4 text-red-500" />Payment Delay vs Movement</h3>
          <div className="h-48">
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="movement" name="Distance (KM)" className="text-xs" />
                <YAxis dataKey="overdueDays" name="Overdue Days" className="text-xs" />
                <ZAxis dataKey="risk" range={[40, 200]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={paymentMovement} fill="hsl(var(--destructive))" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">⚠️ High movement + no payment = High risk flag</p>
        </Card>
      </div>

      {/* Top Locations */}
      <Card className="p-5">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><MapPin className="h-4 w-4 text-primary" />Top Customer Locations</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {topLocations.map((loc) => (
            <motion.div key={loc.area} whileHover={{ scale: 1.03 }} className="p-3 rounded-xl border border-border bg-muted/30 text-center">
              <p className="text-lg font-black text-foreground">{loc.pct}%</p>
              <p className="text-sm font-medium">{loc.area}</p>
              <p className="text-xs text-muted-foreground">{loc.customers} customer{loc.customers > 1 ? "s" : ""}</p>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* High Risk Watch */}
      <Card className="p-5">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><AlertTriangle className="h-4 w-4 text-red-500" />High-Risk Customer Watch</h3>
        <div className="space-y-2">
          {mockCustomers.filter(c => c.riskScore > 60).sort((a, b) => b.riskScore - a.riskScore).map(c => (
            <div key={c.id} className="flex items-center gap-4 p-3 rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20">
              <div className="h-8 w-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-black">{c.riskScore}</div>
              <div className="flex-1">
                <p className="text-sm font-medium">{c.name} — {c.hplNumber}</p>
                <p className="text-xs text-muted-foreground">{c.distanceFromHome} KM away · {c.overdueDays} days overdue · ₹{c.overdueAmount.toLocaleString()}</p>
              </div>
              <p className="text-xs text-red-600 font-bold">
                {c.riskScore > 90 ? "Immediate Action" : "Schedule Visit"}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

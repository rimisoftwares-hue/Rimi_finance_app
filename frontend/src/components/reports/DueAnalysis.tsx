import { motion } from "framer-motion";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

const riskData = [
  { name: "Current (0 Days)", value: 780, amount: 2340000, color: "hsl(142, 76%, 36%)" },
  { name: "1-30 Days", value: 220, amount: 880000, color: "hsl(38, 92%, 50%)" },
  { name: "30-60 Days", value: 150, amount: 750000, color: "hsl(25, 95%, 53%)" },
  { name: "60-90 Days", value: 85, amount: 510000, color: "hsl(0, 84%, 60%)" },
  { name: "90+ Days (NPA)", value: 49, amount: 392000, color: "hsl(0, 0%, 20%)" },
];

const trendData = [
  { month: "Aug", npa: 3.2, overdue: 28 },
  { month: "Sep", npa: 3.5, overdue: 30 },
  { month: "Oct", npa: 3.1, overdue: 27 },
  { month: "Nov", npa: 3.8, overdue: 32 },
  { month: "Dec", npa: 4.0, overdue: 35 },
  { month: "Jan", npa: 3.6, overdue: 31 },
  { month: "Feb", npa: 3.8, overdue: 34 },
];

const total = riskData.reduce((s, r) => s + r.value, 0);

export default function DueAnalysis() {
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Due Analysis</h1>
        <p className="text-muted-foreground mt-1">Portfolio risk distribution and NPA tracking</p>
      </motion.div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {riskData.map((item, i) => (
          <motion.div key={item.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="dashboard-card text-center">
            <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ background: item.color }} />
            <p className="text-2xl font-bold text-foreground">{item.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.name}</p>
            <p className="text-xs font-medium text-foreground mt-1">₹{(item.amount / 100000).toFixed(1)}L</p>
          </motion.div>
        ))}
      </div>

      {/* Summary Bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">Portfolio Distribution</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Total Portfolio:</span>
            <span className="font-bold text-foreground">{total} Loans</span>
            <span className="mx-2 text-border">|</span>
            <span className="text-muted-foreground">NPA:</span>
            <span className="font-bold text-expense">3.8%</span>
          </div>
        </div>
        <div className="h-4 rounded-full overflow-hidden flex">
          {riskData.map(item => (
            <div key={item.name} style={{ width: `${(item.value / total) * 100}%`, background: item.color }} className="transition-all duration-500" />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          {riskData.map(item => (
            <div key={item.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
              {item.name}: {((item.value / total) * 100).toFixed(1)}%
            </div>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="dashboard-card">
          <h3 className="text-lg font-semibold text-foreground mb-4">Risk Distribution</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                  {riskData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [v, "Loans"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Trend Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="dashboard-card">
          <h3 className="text-lg font-semibold text-foreground mb-4">NPA & Overdue Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 6%, 90%)" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} />
                <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(240,6%,90%)", borderRadius: "0.75rem" }} />
                <Line type="monotone" dataKey="npa" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={{ r: 4 }} name="NPA %" />
                <Line type="monotone" dataKey="overdue" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={{ r: 4 }} name="Overdue Count" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

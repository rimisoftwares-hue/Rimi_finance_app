import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const cashFlowData = [
  { month: "Aug", inflow: 320000, outflow: 250000, net: 70000 },
  { month: "Sep", inflow: 350000, outflow: 280000, net: 70000 },
  { month: "Oct", inflow: 390000, outflow: 340000, net: 50000 },
  { month: "Nov", inflow: 420000, outflow: 310000, net: 110000 },
  { month: "Dec", inflow: 460000, outflow: 380000, net: 80000 },
  { month: "Jan", inflow: 430000, outflow: 350000, net: 80000 },
  { month: "Feb", inflow: 445000, outflow: 320000, net: 125000 },
];

export default function CashFlow() {
  const totalInflow = cashFlowData.reduce((s, r) => s + r.inflow, 0);
  const totalOutflow = cashFlowData.reduce((s, r) => s + r.outflow, 0);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Cash Flow</h1>
          <p className="text-muted-foreground mt-1 text-sm">Cash inflow vs outflow analysis</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Inflow", value: totalInflow, color: "border-t-income" },
          { label: "Total Outflow", value: totalOutflow, color: "border-t-expense" },
          { label: "Net Cash Flow", value: totalInflow - totalOutflow, color: "border-t-primary" },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className={`dashboard-card border-t-4 ${item.color}`}>
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">₹{(item.value / 100000).toFixed(1)}L</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card">
        <h3 className="text-lg font-semibold text-foreground mb-4">Cash Flow Trend</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cashFlowData}>
              <defs>
                <linearGradient id="inflowG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="outflowG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 6%, 90%)" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} tickFormatter={v => `₹${v / 1000}K`} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(240,6%,90%)", borderRadius: "0.75rem" }} formatter={(v: number) => [`₹${v.toLocaleString()}`, ""]} />
              <Area type="monotone" dataKey="inflow" stroke="hsl(142, 76%, 36%)" fill="url(#inflowG)" strokeWidth={2} name="Inflow" />
              <Area type="monotone" dataKey="outflow" stroke="hsl(0, 84%, 60%)" fill="url(#outflowG)" strokeWidth={2} name="Outflow" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Month", "Inflow", "Outflow", "Net"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cashFlowData.map((r, i) => (
                <tr key={r.month} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{r.month}</td>
                  <td className="px-4 py-3 text-sm text-income">₹{r.inflow.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-expense">₹{r.outflow.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">₹{r.net.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

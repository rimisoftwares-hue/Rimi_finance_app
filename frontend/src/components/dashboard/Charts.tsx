import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const monthlyData = [
  { month: "Jul", collection: 245000, disbursed: 180000 },
  { month: "Aug", collection: 312000, disbursed: 220000 },
  { month: "Sep", collection: 278000, disbursed: 195000 },
  { month: "Oct", collection: 356000, disbursed: 250000 },
  { month: "Nov", collection: 389000, disbursed: 280000 },
  { month: "Dec", collection: 425000, disbursed: 310000 },
  { month: "Jan", collection: 398000, disbursed: 275000 },
];

const portfolioData = [
  { name: "Current", value: 62, color: "hsl(142, 76%, 36%)" },
  { name: "1-30 Days", value: 18, color: "hsl(38, 92%, 50%)" },
  { name: "30-60 Days", value: 12, color: "hsl(25, 95%, 53%)" },
  { name: "60+ Days", value: 8, color: "hsl(0, 84%, 60%)" },
];

export function MonthlyCollectionChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="dashboard-card"
    >
      <h3 className="text-lg font-semibold text-foreground mb-1">Monthly Collection</h3>
      <p className="text-sm text-muted-foreground mb-4">Collection vs Disbursement trend</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 6%, 90%)" vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} tickFormatter={(v) => `₹${v / 1000}K`} />
            <Tooltip
              contentStyle={{
                background: "hsl(0, 0%, 100%)",
                border: "1px solid hsl(240, 6%, 90%)",
                borderRadius: "0.75rem",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
              }}
              formatter={(value: number) => [`₹${value.toLocaleString()}`, ""]}
            />
            <Bar dataKey="collection" fill="hsl(230, 85%, 55%)" radius={[6, 6, 0, 0]} name="Collection" />
            <Bar dataKey="disbursed" fill="hsl(230, 85%, 55%, 0.3)" radius={[6, 6, 0, 0]} name="Disbursed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

export function PortfolioRiskChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="dashboard-card"
    >
      <h3 className="text-lg font-semibold text-foreground mb-1">Portfolio Risk</h3>
      <p className="text-sm text-muted-foreground mb-4">Due distribution by aging</p>
      <div className="h-72 flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={portfolioData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
            >
              {portfolioData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => [`${value}%`, ""]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {portfolioData.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
            <span className="text-xs text-muted-foreground">{item.name}: {item.value}%</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

const trendData = [
  { month: "Jul", income: 180000, expense: 45000 },
  { month: "Aug", income: 220000, expense: 52000 },
  { month: "Sep", income: 195000, expense: 48000 },
  { month: "Oct", income: 250000, expense: 55000 },
  { month: "Nov", income: 280000, expense: 60000 },
  { month: "Dec", income: 310000, expense: 58000 },
  { month: "Jan", income: 275000, expense: 62000 },
];

export function IncomeExpenseChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="dashboard-card"
    >
      <h3 className="text-lg font-semibold text-foreground mb-1">Income vs Expense</h3>
      <p className="text-sm text-muted-foreground mb-4">Trend analysis over months</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 6%, 90%)" vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} tickFormatter={(v) => `₹${v / 1000}K`} />
            <Tooltip
              contentStyle={{
                background: "hsl(0, 0%, 100%)",
                border: "1px solid hsl(240, 6%, 90%)",
                borderRadius: "0.75rem",
              }}
              formatter={(value: number) => [`₹${value.toLocaleString()}`, ""]}
            />
            <Area type="monotone" dataKey="income" stroke="hsl(142, 76%, 36%)" fill="url(#incomeGrad)" strokeWidth={2} name="Income" />
            <Area type="monotone" dataKey="expense" stroke="hsl(0, 84%, 60%)" fill="url(#expenseGrad)" strokeWidth={2} name="Expense" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

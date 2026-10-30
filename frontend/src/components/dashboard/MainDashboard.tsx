import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserX, Car, IndianRupee, Wallet, AlertTriangle, Calendar, TrendingUp,
  FileText, CreditCard, BarChart3, LucideIcon, TrendingDown, UserPlus, Building2, UserCog,
  ArrowDownCircle, ArrowUpCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useOwnerAuth } from "../../contexts/OwnerAuthContext";

/* ── Animated counter ── */
function AnimatedNum({ value }: { value: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const steps = 30, inc = value / steps;
    let cur = 0;
    const t = setInterval(() => {
      cur += inc;
      if (cur >= value) { setCount(value); clearInterval(t); }
      else setCount(Math.floor(cur));
    }, 33);
    return () => clearInterval(t);
  }, [value]);
  return <span>{count.toLocaleString()}</span>;
}

/* ── KPI Card ── */
interface KpiProps {
  title: string; value: number | string; icon: LucideIcon;
  trend?: { value: number; up: boolean }; color: string;
  onClick?: () => void;
}
function KpiCard({ title, value, icon: Icon, trend, color, onClick }: KpiProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }} transition={{ duration: 0.3 }}
      onClick={onClick}
      className={`dashboard-card ${onClick ? "cursor-pointer hover:border-primary/40 transition-all" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-foreground">
            {typeof value === "number" ? <AnimatedNum value={value} /> : value}
          </p>
        </div>
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-2">
          {trend.up
            ? <TrendingUp className="h-3 w-3 text-income" />
            : <TrendingDown className="h-3 w-3 text-expense" />}
          <span className={`text-xs font-medium ${trend.up ? "text-income" : "text-expense"}`}>
            {trend.value}%
          </span>
          <span className="text-xs text-muted-foreground">vs last month</span>
        </div>
      )}
    </motion.div>
  );
}

/* ── Mock data ── */
const loanDistribution = [
  { name: "Active", value: 652, color: "hsl(var(--primary))" },
  { name: "Closed", value: 312, color: "hsl(var(--income))" },
  { name: "Default", value: 86, color: "hsl(var(--expense))" },
  { name: "Seized", value: 34, color: "hsl(var(--pending))" },
];

const collectionTrend = [
  { month: "Jan", principal: 180000, interest: 52000, penalty: 8000 },
  { month: "Feb", principal: 165000, interest: 48000, penalty: 6500 },
  { month: "Mar", principal: 210000, interest: 61000, penalty: 9200 },
  { month: "Apr", principal: 195000, interest: 56000, penalty: 7800 },
  { month: "May", principal: 225000, interest: 64000, penalty: 10500 },
  { month: "Jun", principal: 240000, interest: 68000, penalty: 11200 },
  { month: "Jul", principal: 218000, interest: 62000, penalty: 9500 },
  { month: "Aug", principal: 235000, interest: 66000, penalty: 10800 },
  { month: "Sep", principal: 248000, interest: 70000, penalty: 11800 },
  { month: "Oct", principal: 262000, interest: 74000, penalty: 12500 },
  { month: "Nov", principal: 275000, interest: 78000, penalty: 13200 },
  { month: "Dec", principal: 290000, interest: 82000, penalty: 14000 },
];

const outcomeTrend = [
  { month: "Jan", loanDist: 320000, otherExp: 42000 },
  { month: "Feb", loanDist: 285000, otherExp: 38000 },
  { month: "Mar", loanDist: 410000, otherExp: 51000 },
  { month: "Apr", loanDist: 365000, otherExp: 46000 },
  { month: "May", loanDist: 425000, otherExp: 54000 },
  { month: "Jun", loanDist: 480000, otherExp: 58000 },
  { month: "Jul", loanDist: 398000, otherExp: 49000 },
  { month: "Aug", loanDist: 442000, otherExp: 56000 },
  { month: "Sep", loanDist: 468000, otherExp: 60000 },
  { month: "Oct", loanDist: 512000, otherExp: 64000 },
  { month: "Nov", loanDist: 545000, otherExp: 68000 },
  { month: "Dec", loanDist: 580000, otherExp: 72000 },
];

type Mode = "income" | "outcome";
type IncomeKey = "principal" | "interest" | "penalty";
type OutcomeKey = "loanDist" | "otherExp";

const incomeMeta: { key: IncomeKey; label: string; color: string }[] = [
  { key: "principal", label: "Principal", color: "hsl(var(--primary))" },
  { key: "interest",  label: "Interest",  color: "hsl(var(--income))" },
  { key: "penalty",   label: "Penalty",   color: "hsl(var(--expense))" },
];
const outcomeMeta: { key: OutcomeKey; label: string; color: string }[] = [
  { key: "loanDist", label: "Loan Distribution", color: "hsl(var(--primary))" },
  { key: "otherExp", label: "Other Expenses",    color: "hsl(var(--pending))" },
];

/* ── Shimmer Skeleton (YouTube-style) ── */
function ShimmerBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-secondary/60 ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />
    </div>
  );
}

function MonthlyDashboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 mb-3">
        <ShimmerBlock className="h-6 w-20" />
        <ShimmerBlock className="h-6 w-20" />
        <ShimmerBlock className="h-6 w-20" />
      </div>
      <div className="h-64 flex items-end gap-2 px-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <ShimmerBlock
            key={i}
            className="flex-1 rounded-t-md"
            // varied bar heights
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
        <ShimmerBlock className="h-16" />
        <ShimmerBlock className="h-16" />
      </div>
    </div>
  );
}

/* ── Monthly Dashboard (Income / Outcome toggle) ── */
function MonthlyDashboard() {
  const [mode, setMode] = useState<Mode>("income");
  const [loading, setLoading] = useState(false);
  const [incomeActive, setIncomeActive]   = useState<Record<IncomeKey, boolean>>({ principal: true, interest: true, penalty: true });
  const [outcomeActive, setOutcomeActive] = useState<Record<OutcomeKey, boolean>>({ loanDist: true, otherExp: true });

  const handleModeChange = (m: Mode) => {
    if (m === mode) return;
    setLoading(true);
    setMode(m);
    setTimeout(() => setLoading(false), 700);
  };

  const summary = useMemo(() => {
    if (mode === "income") {
      const total = collectionTrend.reduce(
        (s, m) =>
          s +
          (incomeActive.principal ? m.principal : 0) +
          (incomeActive.interest  ? m.interest  : 0) +
          (incomeActive.penalty   ? m.penalty   : 0),
        0,
      );
      return { total, months: collectionTrend.length };
    }
    const total = outcomeTrend.reduce(
      (s, m) =>
        s +
        (outcomeActive.loanDist ? m.loanDist : 0) +
        (outcomeActive.otherExp ? m.otherExp : 0),
      0,
    );
    return { total, months: outcomeTrend.length };
  }, [mode, incomeActive, outcomeActive]);

  const data = mode === "income" ? collectionTrend : outcomeTrend;
  const meta = mode === "income" ? incomeMeta : outcomeMeta;
  const active: Record<string, boolean> = mode === "income" ? incomeActive : outcomeActive;
  const toggleKey = (k: string) => {
    if (mode === "income") setIncomeActive(s => ({ ...s, [k]: !s[k as IncomeKey] }));
    else setOutcomeActive(s => ({ ...s, [k]: !s[k as OutcomeKey] }));
  };
  const visibleKeys = meta.filter(m => active[m.key]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="dashboard-card">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Monthly Dashboard</h3>
          <p className="text-sm text-muted-foreground">
            {mode === "income" ? "Income breakdown by category" : "Outcome breakdown by category"}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50 border border-border">
          {(["income", "outcome"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                mode === m ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "income" ? <ArrowDownCircle className="h-3.5 w-3.5" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
              {m === "income" ? "Income" : "Outcome"}
            </button>
          ))}
        </div>
      </div>

      {/* Category toggles */}
      <div className="flex flex-wrap gap-2 mb-3">
        {meta.map(m => {
          const on = active[m.key];
          return (
            <button
              key={m.key}
              onClick={() => toggleKey(m.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                on ? "border-border bg-card text-foreground" : "border-border/50 bg-secondary/40 text-muted-foreground line-through"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? m.color : "hsl(240,5%,75%)" }} />
              {m.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MonthlyDashboardSkeleton />
          </motion.div>
        ) : (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} barCategoryGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(240,6%,90%)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(240,3%,46%)" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(240,3%,46%)" }} tickFormatter={v => `₹${v / 1000}K`} />
                  <Tooltip
                    formatter={(v: number, n: string) => [`₹${v.toLocaleString()}`, n]}
                    contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(240,6%,90%)", borderRadius: "0.75rem", fontSize: 12 }}
                    cursor={{ fill: "hsl(240,6%,95%)", opacity: 0.5 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                  {visibleKeys.map((m, i) => (
                    <Bar
                      key={m.key}
                      dataKey={m.key}
                      stackId="a"
                      fill={m.color}
                      name={m.label}
                      radius={i === visibleKeys.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
              <div className={`p-3 rounded-xl border ${mode === "income" ? "bg-income/5 border-income/10" : "bg-expense/5 border-expense/10"}`}>
                <p className="text-xs text-muted-foreground mb-0.5">{mode === "income" ? "Total Income" : "Total Outcome"}</p>
                <p className={`text-lg font-bold ${mode === "income" ? "text-income" : "text-expense"}`}>
                  ₹{(summary.total / 100000).toFixed(2)}L
                </p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/50 border border-border">
                <p className="text-xs text-muted-foreground mb-0.5">Months</p>
                <p className="text-lg font-bold text-foreground">{summary.months}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
function InsightCard({ icon: Icon, label, value, color, onClick }: { icon: LucideIcon; label: string; value: number; color: string; onClick?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-xl border border-border bg-card ${onClick ? "cursor-pointer hover:border-primary/40 transition-all" : ""}`}
    >
      <div className={`p-2 rounded-lg ${color}`}><Icon className="h-4 w-4" /></div>
      <div>
        <p className="text-lg font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </motion.div>
  );
}

/* ── Quick Action ── */
function QuickAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 cursor-pointer"
    >
      <Icon className="h-4 w-4 text-primary" /> {label}
    </motion.button>
  );
}

/* ── MAIN DASHBOARD ── */
export function MainDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { owner } = useOwnerAuth();
  const isOwner = Boolean(owner && (!user || user.role === 'owner'));

  return (
    <motion.div
      key="main-dashboard"
      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Active Loans"
          value={652}
          icon={CreditCard}
          trend={{ value: 8, up: true }}
          color="bg-primary/10 text-primary"
          onClick={() => navigate("/loans")}
        />
        <KpiCard
          title="Total Customers"
          value={1284}
          icon={Users}
          trend={{ value: 12, up: true }}
          color="bg-income/10 text-income"
          onClick={() => navigate("/customers")}
        />
        <KpiCard
          title="Unpaid Customers"
          value={186}
          icon={UserX}
          trend={{ value: 5, up: false }}
          color="bg-expense/10 text-expense"
          onClick={() => navigate("/unpaidloans")}
        />
        <KpiCard
          title="Godown Vehicles"
          value={47}
          icon={Car}
          trend={{ value: 3, up: true }}
          color="bg-pending/10 text-pending"
          onClick={() => navigate("/collections/godown")}
        />
        <KpiCard
          title="Seized Vehicles"
          value={34}
          icon={AlertTriangle}
          color="bg-expense/10 text-expense"
          onClick={() => navigate("/collections/godown")}
        />
        <KpiCard
          title="Cash in Hand"
          value="₹8.2L"
          icon={Wallet}
          color="bg-income/10 text-income"
          onClick={() => navigate("/accounts/daybook")}
        />
        <KpiCard
          title="Today Collection"
          value="₹2.4L"
          icon={IndianRupee}
          trend={{ value: 15, up: true }}
          color="bg-primary/10 text-primary"
          onClick={() => navigate("/paymentReport")}
        />
        <KpiCard
          title="Pending Dues"
          value="₹18.6L"
          icon={Calendar}
          color="bg-pending/10 text-pending"
          onClick={() => navigate("/collections/pending")}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loan Distribution Pie */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card">
          <h3 className="text-lg font-semibold text-foreground mb-1">Loan Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">Active vs Closed vs Default vs Seized</p>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={loanDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                  {loanDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [v, ""]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {loanDistribution.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                <span className="text-xs text-muted-foreground">{d.name}: {d.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Monthly Dashboard - Income / Outcome */}
        <MonthlyDashboard />
      </div>

      {/* Quick Insights + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Quick Insights</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InsightCard
              icon={AlertTriangle}
              label="High Risk Customers"
              value={23}
              color="bg-expense/10 text-expense"
              onClick={() => navigate("/unpaidloans")}
            />
            <InsightCard
              icon={Calendar}
              label="Today's Due Count"
              value={42}
              color="bg-pending/10 text-pending"
              onClick={() => navigate("/collections/pending")}
            />
            <InsightCard
              icon={TrendingUp}
              label="Overdue > 30 Days"
              value={67}
              color="bg-expense/10 text-expense"
              onClick={() => navigate("/reports/due-analysis")}
            />
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickAction icon={UserPlus} label="Assign Customer" onClick={() => navigate("/agents/assign")} />
            <QuickAction icon={UserCog} label="Create User" onClick={() => navigate("/AgentManagement")} />
            {isOwner && (
              <QuickAction icon={Building2} label="Company Profile" onClick={() => navigate("/master/company")} />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

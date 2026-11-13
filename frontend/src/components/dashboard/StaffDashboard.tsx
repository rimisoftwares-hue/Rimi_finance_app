import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt, IndianRupee, CheckCircle, Car, RefreshCw, Calendar,
  UserX, Smartphone, FileText, BookOpen,
  LucideIcon, TrendingUp, TrendingDown, Calculator, ClipboardList, MapPin, Clock,
  Phone, PhoneCall, PhoneOff, PhoneForwarded, Search, X, User, AlertCircle,
} from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  fetchStaffDashboardOverview,
  formatCompactINR,
  type StaffDashboardOverviewResponse,
  type StaffCallHistoryRecord,
} from "../../api/dashboardApi";

/* ── Animated counter ── */
function AnimatedNum({ value }: { value: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (value <= 0) {
      setCount(0);
      return;
    }
    const steps = 30, inc = value / steps;
    let cur = 0;
    const t = setInterval(() => {
      cur += inc;
      if (cur >= value) { setCount(value); clearInterval(t); }
      else setCount(Math.floor(cur));
    }, 33);
    return () => clearInterval(t);
  }, [value]);
  return <span>{count.toLocaleString("en-IN")}</span>;
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
          {trend.up ? <TrendingUp className="h-3 w-3 text-income" /> : <TrendingDown className="h-3 w-3 text-expense" />}
          <span className={`text-xs font-medium ${trend.up ? "text-income" : "text-expense"}`}>{trend.value}%</span>
          <span className="text-xs text-muted-foreground">vs yesterday</span>
        </div>
      )}
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

/* ── Interest Calculator ── */
function InterestCalculator() {
  const [amount, setAmount] = useState<string>("100000");
  const [rate, setRate] = useState<string>("12");
  const [months, setMonths] = useState<string>("12");

  const P = parseFloat(amount) || 0;
  const R = (parseFloat(rate) || 0) / 12 / 100;
  const N = parseInt(months) || 1;
  const emi = R > 0 ? (P * R * Math.pow(1 + R, N)) / (Math.pow(1 + R, N) - 1) : P / N;
  const totalPayable = emi * N;
  const totalInterest = totalPayable - P;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="dashboard-card"
    >
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">EMI Calculator</h3>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Loan Amount (₹)</label>
          <input
            type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Interest (%)</label>
          <input
            type="number" value={rate} onChange={e => setRate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Duration (months)</label>
          <input
            type="number" value={months} onChange={e => setMonths(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
          <p className="text-xs text-muted-foreground mb-1">Monthly EMI</p>
          <p className="text-lg font-bold text-primary">₹{Math.round(emi).toLocaleString("en-IN")}</p>
        </div>
        <div className="p-3 rounded-xl bg-pending/5 border border-pending/10 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total Interest</p>
          <p className="text-lg font-bold text-pending">₹{Math.round(totalInterest).toLocaleString("en-IN")}</p>
        </div>
        <div className="p-3 rounded-xl bg-income/5 border border-income/10 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total Payable</p>
          <p className="text-lg font-bold text-income">₹{Math.round(totalPayable).toLocaleString("en-IN")}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Task Item ── */
function TaskItem({
  title,
  subtitle,
  riskLevel,
  riskLabel,
  onClick,
}: {
  title: string;
  subtitle: string;
  riskLevel: "high" | "medium" | "low";
  riskLabel: "High Risk" | "Medium Risk" | "Low Risk";
  onClick?: () => void;
}) {
  const riskStyleMap = {
    high: { dot: "bg-expense", badge: "bg-expense/10 text-expense" },
    medium: { dot: "bg-pending", badge: "bg-pending/10 text-pending" },
    low: { dot: "bg-income", badge: "bg-income/10 text-income" },
  };
  const s = riskStyleMap[riskLevel] || riskStyleMap.low;
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors ${onClick ? "cursor-pointer hover:border-primary/40" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${s.dot}`} />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${s.badge}`}>{riskLabel}</span>
      </div>
    </div>
  );
}

/* ── Today Call History ── */
type CallType = "RC" | "Call";
type CallStatus = "Connected" | "Not Connected" | "Follow-up";

function statusStyle(s: CallStatus) {
  return s === "Connected"     ? "bg-income/10 text-income border-income/20" :
         s === "Not Connected" ? "bg-expense/10 text-expense border-expense/20" :
                                 "bg-pending/10 text-pending border-pending/20";
}
function statusIconFor(s: CallStatus) {
  return s === "Connected" ? PhoneCall : s === "Not Connected" ? PhoneOff : PhoneForwarded;
}

function CallCard({ c }: { c: StaffCallHistoryRecord }) {
  const Icon = statusIconFor(c.status);
  const time = c.date.length >= 16 ? c.date.slice(11, 16) : c.date;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all"
    >
      {/* Top Row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <p className="text-sm font-semibold text-foreground truncate">{c.customer}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium whitespace-nowrap">
            {c.hpl}
          </span>
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${statusStyle(c.status)}`}>
          <Icon className="h-3 w-3" />
          {c.status}
        </span>
      </div>

      {/* Vehicle Row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5 gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Car className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{c.vehicle}</span>
        </div>
        <span className="text-[11px] font-mono text-foreground/70 whitespace-nowrap">{c.vehicleNo}</span>
      </div>

      {/* Created By */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{c.staff}</span>
      </div>

      {/* Bottom Row */}
      <div className="pt-2 border-t border-border/60">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
          <Clock className="h-3 w-3" />
          <span>{time}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide">
            {c.type === "RC" ? "RC Call" : "Call"}
          </span>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed">
          {c.remarks || "—"}
        </p>
      </div>
    </motion.div>
  );
}

function CallHistorySection({ records }: { records: StaffCallHistoryRecord[] }) {
  const [filter, setFilter] = useState<"All" | CallType>("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const data = useMemo(() => {
    const byType = filter === "All" ? records : records.filter(c => c.type === filter);
    const q = query.trim().toLowerCase();
    const searched = !q ? byType : byType.filter(c =>
      c.customer.toLowerCase().includes(q) ||
      c.hpl.toLowerCase().includes(q) ||
      c.vehicleNo.toLowerCase().includes(q) ||
      c.vehicle.toLowerCase().includes(q),
    );
    return [...searched].sort((a, b) => b.date.localeCompare(a.date));
  }, [records, filter, query]);

  const visible = data.slice(0, 6);
  const filters: ("All" | CallType)[] = ["All", "RC", "Call"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
      className="dashboard-card"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Today Call History</h3>
          <span className="text-xs text-muted-foreground">({data.length})</span>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50 border border-border">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                filter === f
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "All" ? "All" : f === "RC" ? "RC Calls" : "Regular Calls"}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by customer, HPL or vehicle number..."
          className="w-full pl-9 pr-9 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-secondary text-muted-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AnimatePresence>
          {visible.map(c => <CallCard key={c.id} c={c} />)}
        </AnimatePresence>
        {data.length === 0 && (
          <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {records.length === 0 ? "No call history recorded today" : "No matching call records"}
          </div>
        )}
      </div>

      {data.length > 6 && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setOpen(true)}
            className="text-xs font-medium px-4 py-2 rounded-lg border border-border bg-card text-primary hover:bg-primary/5 hover:border-primary/30 transition-all"
          >
            View Full History ({data.length})
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Today Call History
              <span className="text-xs font-normal text-muted-foreground">({data.length})</span>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-auto pr-1">
            {data.map(c => <CallCard key={c.id} c={c} />)}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/* ── STAFF DASHBOARD ── */
export function StaffDashboard() {
  const navigate = useNavigate();
  const { currentFinance } = useAuth();

  const [overview, setOverview] = useState<StaffDashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStaffDashboardOverview(signal);
      if (!signal?.aborted) {
        setOverview(data);
        setLoading(false);
      }
    } catch (err: unknown) {
      if (signal?.aborted) return;
      const e = err as { name?: string; code?: string; message?: string };
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return;
      setError(e?.message || "Failed to load Staff Dashboard data");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOverview(controller.signal);
    return () => controller.abort();
  }, [currentFinance?.id, loadOverview]);

  const kpis = overview?.kpis;
  const callHistory = overview?.todayCallHistory ?? [];
  const assignedTasks = overview?.assignedTasks ?? { totalAssigned: 0, items: [] };
  const todayVisits = overview?.todayVisits ?? [];
  const todayCollections = overview?.todayCollections ?? [];

  return (
    <motion.div
      key="staff-dashboard"
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {error && (
        <div className="flex items-center justify-between p-3 rounded-xl border border-expense/30 bg-expense/10 text-expense text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadOverview()}
            className="px-3 py-1 rounded-lg bg-card text-foreground text-xs font-medium border border-border hover:bg-secondary transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Receipts (Today)"
          value={kpis ? kpis.totalReceiptsToday : 0}
          icon={Receipt}
          trend={kpis?.totalReceiptsTrend}
          color="bg-primary/10 text-primary"
          onClick={() => navigate("/paymentReport")}
        />
        <KpiCard
          title="Collected Amount"
          value={kpis ? formatCompactINR(kpis.collectedAmount) : "₹0"}
          icon={IndianRupee}
          trend={kpis?.collectedAmountTrend}
          color="bg-income/10 text-income"
          onClick={() => navigate("/reports/collection")}
        />
        <KpiCard
          title="Closed Loans"
          value={kpis ? kpis.closedLoans : 0}
          icon={CheckCircle}
          color="bg-income/10 text-income"
          onClick={() => navigate("/closeloancustomer")}
        />
        <KpiCard
          title="Seized Vehicles"
          value={kpis ? kpis.seizedVehicles : 0}
          icon={Car}
          color="bg-expense/10 text-expense"
          onClick={() => navigate("/collections/godown")}
        />
        <KpiCard
          title="Reloan Count"
          value={kpis ? kpis.reloanCount : 0}
          icon={RefreshCw}
          trend={kpis?.reloanCountTrend}
          color="bg-primary/10 text-primary"
          onClick={() => navigate("/customers")}
        />
        <KpiCard
          title="Today Dues"
          value={kpis ? kpis.todayDues : 0}
          icon={Calendar}
          color="bg-pending/10 text-pending"
          onClick={() => navigate("/collections/pending")}
        />
        <KpiCard
          title="Unpaid Customers"
          value={kpis ? kpis.unpaidCustomers : 0}
          icon={UserX}
          color="bg-expense/10 text-expense"
          onClick={() => navigate("/unpaidloans")}
        />
        <KpiCard
          title="Online Payments"
          value={kpis?.onlinePaymentsMock || "₹45K"}
          icon={Smartphone}
          color="bg-primary/10 text-primary"
          onClick={() => navigate("/payments/online")}
        />
      </div>

      {/* Calculator + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <InterestCalculator />
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-3">
            <QuickAction icon={FileText} label="Generate Bill" onClick={() => navigate("/reports/bill")} />
            <QuickAction icon={BookOpen} label="Add Ledger" onClick={() => navigate("/accounts/ledger")} />
            <QuickAction icon={Car} label="Add Vehicle" onClick={() => navigate("/loanForm?type=vehicle")} />
          </div>
        </div>
      </div>

      {/* Call History */}
      <CallHistorySection records={callHistory} />

      {/* Tasks */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Tasks</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {assignedTasks.totalAssigned} Assigned Customers
          </span>
        </div>
        <div className="space-y-2">
          {loading && !overview ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading assigned customers...</div>
          ) : assignedTasks.items.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No customers assigned</div>
          ) : (
            assignedTasks.items.map((t) => (
              <TaskItem
                key={t.id}
                title={`${t.customer} – ${t.hpl}`}
                subtitle={`Due ₹${t.dueAmount.toLocaleString("en-IN")}${t.area && t.area !== "—" ? ` • ${t.area}` : ""}`}
                riskLevel={t.riskLevel}
                riskLabel={t.riskLabel}
                onClick={() => navigate(`/customers/${t.customerId}`)}
              />
            ))
          )}
        </div>
      </motion.div>

      {/* Today Visits + Pending Collections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="dashboard-card">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Today Visits</h3>
          </div>
          <div className="space-y-3">
            {loading && !overview ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading visits...</div>
            ) : todayVisits.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No visits recorded today</div>
            ) : (
              todayVisits.map((v) => (
                <div
                  key={v.id}
                  onClick={() => navigate("/locator/track")}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 hover:border-primary/40 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{v.customer} ({v.hpl})</p>
                    <p className="text-xs text-muted-foreground">{v.location}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    v.status === "Completed" ? "bg-income/10 text-income" : "bg-pending/10 text-pending"
                  }`}>{v.status}</span>
                </div>
              ))
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="dashboard-card">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Pending Collections</h3>
          </div>
          <div className="space-y-3">
            {loading && !overview ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading today's collections...</div>
            ) : todayCollections.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No payments collected today</div>
            ) : (
              todayCollections.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate("/collections/pending")}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 hover:border-primary/40 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.hpl} – {c.customer}</p>
                    <p className="text-xs text-muted-foreground">
                      Paid: ₹{c.amount.toLocaleString("en-IN")}
                      {c.billNumber && c.billNumber !== "—" ? ` • Bill #${c.billNumber}` : ""}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    c.delayTone === "expense" ? "bg-expense/10 text-expense" :
                    c.delayTone === "pending" ? "bg-pending/10 text-pending" :
                    "bg-income/10 text-income"
                  }`}>{c.delayLabel}</span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

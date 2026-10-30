import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt, IndianRupee, CheckCircle, Car, RefreshCw, Calendar,
  UserX, Smartphone, FileText, BookOpen,
  LucideIcon, TrendingUp, TrendingDown, Calculator, ClipboardList, MapPin, Clock,
  Phone, PhoneCall, PhoneOff, PhoneForwarded, Search, X, User,
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useNavigate } from "react-router-dom";

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
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
          <p className="text-xs text-muted-foreground mb-1">Monthly EMI</p>
          <p className="text-lg font-bold text-primary">₹{Math.round(emi).toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-xl bg-pending/5 border border-pending/10 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total Interest</p>
          <p className="text-lg font-bold text-pending">₹{Math.round(totalInterest).toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-xl bg-income/5 border border-income/10 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total Payable</p>
          <p className="text-lg font-bold text-income">₹{Math.round(totalPayable).toLocaleString()}</p>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <MonthlyBreakdown principal={P} rate={R} months={N} emi={emi} />
    </motion.div>
  );
}

/* ── Monthly EMI Breakdown ── */
function MonthlyBreakdown({ principal, rate, months, emi }: { principal: number; rate: number; months: number; emi: number }) {
  const schedule = useMemo(() => {
    const rows: { m: number; principal: number; interest: number; balance: number }[] = [];
    let bal = principal;
    for (let i = 1; i <= months; i++) {
      const interest = bal * rate;
      const principalPart = emi - interest;
      bal = Math.max(0, bal - principalPart);
      rows.push({ m: i, principal: principalPart, interest, balance: bal });
    }
    return rows;
  }, [principal, rate, months, emi]);

  if (!isFinite(emi) || emi <= 0 || months <= 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-foreground">Monthly Breakdown</p>
        <span className="text-[11px] text-muted-foreground">Principal vs Interest per EMI</span>
      </div>
      <div className="max-h-60 overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-secondary/60 sticky top-0">
            <tr className="text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Month</th>
              <th className="text-right px-3 py-2 font-medium">Principal</th>
              <th className="text-right px-3 py-2 font-medium">Interest</th>
              <th className="text-right px-3 py-2 font-medium">EMI</th>
              <th className="text-right px-3 py-2 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map(r => (
              <tr key={r.m} className="border-t border-border/60 hover:bg-secondary/40">
                <td className="px-3 py-1.5 text-foreground font-medium">{r.m}</td>
                <td className="px-3 py-1.5 text-right text-primary">₹{Math.round(r.principal).toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right text-pending">₹{Math.round(r.interest).toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right text-foreground">₹{Math.round(r.principal + r.interest).toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">₹{Math.round(r.balance).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Task Item ── */
function TaskItem({
  title,
  subtitle,
  status,
  time,
  onClick,
}: {
  title: string;
  subtitle: string;
  status: "pending" | "done" | "overdue";
  time: string;
  onClick?: () => void;
}) {
  const statusMap = {
    pending: { bg: "bg-pending/10 text-pending", label: "Pending" },
    done: { bg: "bg-income/10 text-income", label: "Done" },
    overdue: { bg: "bg-expense/10 text-expense", label: "Overdue" },
  };
  const s = statusMap[status];
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors ${onClick ? "cursor-pointer hover:border-primary/40" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${status === "done" ? "bg-income" : status === "overdue" ? "bg-expense" : "bg-pending"}`} />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${s.bg}`}>{s.label}</span>
        <span className="text-xs text-muted-foreground">{time}</span>
      </div>
    </div>
  );
}

/* ── Today Call History ── */
type CallType = "RC" | "Call";
type CallStatus = "Connected" | "Not Connected" | "Follow-up";
interface CallRecord {
  id: number;
  customer: string;
  hpl: string;
  vehicle: string;     // model
  vehicleNo: string;   // registration number
  createdBy: string;
  type: CallType;
  datetime: string;   // ISO-like "YYYY-MM-DD HH:mm"
  status: CallStatus;
  notes?: string;
}

// Today's date prefix to ensure "today only" filtering works in mock data
const TODAY = new Date().toISOString().slice(0, 10);
const callRecords: CallRecord[] = [
  { id: 1,  customer: "Raj Kumar",   hpl: "HPL 847", vehicle: "Bajaj Pulsar 150",     vehicleNo: "TN 09 BX 4521", createdBy: "Arun (Collection)", type: "RC",   datetime: `${TODAY} 10:42`, status: "Connected",     notes: "Promised to pay ₹12,500 by Monday evening." },
  { id: 2,  customer: "Muthu S",     hpl: "HPL 923", vehicle: "TVS Apache RTR 160",   vehicleNo: "TN 22 AC 8890", createdBy: "Vimal (Field)",     type: "Call", datetime: `${TODAY} 10:15`, status: "Not Connected", notes: "Phone switched off — retry after lunch." },
  { id: 3,  customer: "Selva P",     hpl: "HPL 415", vehicle: "Honda Shine",          vehicleNo: "TN 18 BJ 1247", createdBy: "Arun (Collection)", type: "Call", datetime: `${TODAY} 09:50`, status: "Follow-up",     notes: "Asked to call back at 4 PM today." },
  { id: 4,  customer: "Gopi M",      hpl: "HPL 612", vehicle: "Hero Splendor Plus",   vehicleNo: "TN 07 CK 3382", createdBy: "Karthik (Branch)",  type: "RC",   datetime: `${TODAY} 09:20`, status: "Connected",     notes: "EMI ₹8,200 confirmed — receipt to be issued." },
  { id: 5,  customer: "Anbu K",      hpl: "HPL 756", vehicle: "Yamaha FZ-S",          vehicleNo: "TN 11 DM 9981", createdBy: "Vimal (Field)",     type: "Call", datetime: `${TODAY} 08:30`, status: "Not Connected", notes: "No response on registered number." },
  { id: 6,  customer: "Senthil V",   hpl: "HPL 891", vehicle: "Royal Enfield Classic",vehicleNo: "TN 02 EF 6610", createdBy: "Arun (Collection)", type: "RC",   datetime: `${TODAY} 08:05`, status: "Follow-up",     notes: "Requesting 7-day extension — pending approval." },
  { id: 7,  customer: "Karthi R",    hpl: "HPL 308", vehicle: "Bajaj CT 100",         vehicleNo: "TN 14 GH 2207", createdBy: "Karthik (Branch)",  type: "Call", datetime: `${TODAY} 07:45`, status: "Connected",     notes: "Will visit branch tomorrow with cash." },
  { id: 8,  customer: "Prabhu D",    hpl: "HPL 552", vehicle: "TVS Jupiter",          vehicleNo: "TN 33 KL 4498", createdBy: "Vimal (Field)",     type: "RC",   datetime: `${TODAY} 07:20`, status: "Not Connected", notes: "Number temporarily unavailable." },
  { id: 9,  customer: "Suresh N",    hpl: "HPL 119", vehicle: "Honda Activa 6G",      vehicleNo: "TN 19 PR 7732", createdBy: "Arun (Collection)", type: "Call", datetime: `${TODAY} 07:05`, status: "Follow-up",     notes: "Customer requested EMI rescheduling." },
  { id: 10, customer: "Mani V",      hpl: "HPL 467", vehicle: "Hero Glamour",         vehicleNo: "TN 25 ST 5519", createdBy: "Karthik (Branch)",  type: "RC",   datetime: `${TODAY} 06:50`, status: "Connected",     notes: "Paid ₹6,800 via UPI — receipt sent." },
];

function statusStyle(s: CallStatus) {
  return s === "Connected"     ? "bg-income/10 text-income border-income/20" :
         s === "Not Connected" ? "bg-expense/10 text-expense border-expense/20" :
                                 "bg-pending/10 text-pending border-pending/20";
}
function statusIconFor(s: CallStatus) {
  return s === "Connected" ? PhoneCall : s === "Not Connected" ? PhoneOff : PhoneForwarded;
}

function CallCard({ c }: { c: CallRecord }) {
  const Icon = statusIconFor(c.status);
  const time = c.datetime.slice(11);
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
        <span className="truncate">{c.createdBy}</span>
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
          {c.notes || "—"}
        </p>
      </div>
    </motion.div>
  );
}

function CallHistorySection() {
  const [filter, setFilter] = useState<"All" | CallType>("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const data = useMemo(() => {
    const todayOnly = callRecords.filter(c => c.datetime.startsWith(TODAY));
    const byType = filter === "All" ? todayOnly : todayOnly.filter(c => c.type === filter);
    const q = query.trim().toLowerCase();
    const searched = !q ? byType : byType.filter(c =>
      c.customer.toLowerCase().includes(q) ||
      c.hpl.toLowerCase().includes(q) ||
      c.vehicleNo.toLowerCase().includes(q) ||
      c.vehicle.toLowerCase().includes(q),
    );
    return [...searched].sort((a, b) => b.datetime.localeCompare(a.datetime));
  }, [filter, query]);

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
            No matching call records
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

  return (
    <motion.div
      key="staff-dashboard"
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Receipts (Today)"
          value={24}
          icon={Receipt}
          trend={{ value: 12, up: true }}
          color="bg-primary/10 text-primary"
          onClick={() => navigate("/paymentReport")}
        />
        <KpiCard
          title="Collected Amount"
          value="₹1.8L"
          icon={IndianRupee}
          trend={{ value: 8, up: true }}
          color="bg-income/10 text-income"
          onClick={() => navigate("/reports/collection")}
        />
        <KpiCard
          title="Closed Loans"
          value={3}
          icon={CheckCircle}
          color="bg-income/10 text-income"
          onClick={() => navigate("/loans")}
        />
        <KpiCard
          title="Seized Vehicles"
          value={2}
          icon={Car}
          color="bg-expense/10 text-expense"
          onClick={() => navigate("/collections/godown")}
        />
        <KpiCard
          title="Reloan Count"
          value={5}
          icon={RefreshCw}
          trend={{ value: 20, up: true }}
          color="bg-primary/10 text-primary"
          onClick={() => navigate("/loans")}
        />
        <KpiCard
          title="Today Dues"
          value={38}
          icon={Calendar}
          color="bg-pending/10 text-pending"
          onClick={() => navigate("/collections/pending")}
        />
        <KpiCard
          title="Unpaid Customers"
          value={14}
          icon={UserX}
          trend={{ value: 3, up: false }}
          color="bg-expense/10 text-expense"
          onClick={() => navigate("/unpaidloans")}
        />
        <KpiCard
          title="Online Payments"
          value="₹45K"
          icon={Smartphone}
          color="bg-primary/10 text-primary"
          onClick={() => navigate("/paymentReport")}
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
            <QuickAction icon={Car} label="Add Vehicle" onClick={() => navigate("/VehicleLoanForm")} />
          </div>
        </div>
      </div>

      {/* Call History */}
      <CallHistorySection />

      {/* Tasks */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Today's Tasks</h3>
          </div>
          <span className="text-xs text-muted-foreground">6 tasks</span>
        </div>
        <div className="space-y-2">
          <TaskItem title="Visit Raj Kumar – HPL 847" subtitle="Collection due ₹12,500" status="pending" time="10:30 AM" onClick={() => navigate("/collections/pending")} />
          <TaskItem title="Collect from Muthu – HPL 923" subtitle="EMI ₹8,200" status="done" time="11:00 AM" onClick={() => navigate("/paymentReport")} />
          <TaskItem title="Seize Vehicle – HPL 612" subtitle="Overdue 45 days" status="overdue" time="2:00 PM" onClick={() => navigate("/collections/godown")} />
          <TaskItem title="KYC Update – Selva Prabu" subtitle="Documents pending" status="pending" time="3:30 PM" onClick={() => navigate("/collections/kyc")} />
          <TaskItem title="Follow-up – HPL 756" subtitle="Payment promise" status="pending" time="4:00 PM" onClick={() => navigate("/collections/pending")} />
          <TaskItem title="Deliver Notice – HPL 891" subtitle="Legal notice" status="overdue" time="5:00 PM" onClick={() => navigate("/notices")} />
        </div>
      </motion.div>

      {/* Finance Access + Pending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="dashboard-card">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Today Visits</h3>
          </div>
          <div className="space-y-3">
            {[
              { name: "Raj Kumar", area: "Anna Nagar", status: "Pending" },
              { name: "Muthu S", area: "T. Nagar", status: "Completed" },
              { name: "Selva P", area: "Adyar", status: "Pending" },
              { name: "Kumar R", area: "Velachery", status: "Missed" },
            ].map((v, i) => (
              <div
                key={i}
                onClick={() => navigate("/locator/track")}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 hover:border-primary/40 transition-colors cursor-pointer"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.area}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  v.status === "Completed" ? "bg-income/10 text-income" :
                  v.status === "Missed" ? "bg-expense/10 text-expense" :
                  "bg-pending/10 text-pending"
                }`}>{v.status}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="dashboard-card">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Pending Collections</h3>
          </div>
          <div className="space-y-3">
            {[
              { hpl: "HPL 847", name: "Raj Kumar", due: "₹12,500", days: 5 },
              { hpl: "HPL 612", name: "Gopi M", due: "₹18,200", days: 45 },
              { hpl: "HPL 756", name: "Anbu K", due: "₹9,800", days: 12 },
              { hpl: "HPL 891", name: "Senthil V", due: "₹22,000", days: 30 },
            ].map((c, i) => (
              <div
                key={i}
                onClick={() => navigate("/collections/pending")}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 hover:border-primary/40 transition-colors cursor-pointer"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{c.hpl} – {c.name}</p>
                  <p className="text-xs text-muted-foreground">Due: {c.due}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  c.days > 30 ? "bg-expense/10 text-expense" :
                  c.days > 10 ? "bg-pending/10 text-pending" :
                  "bg-income/10 text-income"
                }`}>{c.days}d overdue</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

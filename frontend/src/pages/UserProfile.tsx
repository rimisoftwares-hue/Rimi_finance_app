import { motion, AnimatePresence } from "framer-motion";
import {
  User, Mail, Phone, MapPin, Briefcase, Shield, Clock, DollarSign, Key,
  Calendar, Award, TrendingUp, Activity, Lock, Monitor, Smartphone,
  ChevronRight, Users, FileText, Target, BarChart3, Edit, Eye, Trash2, Plus,
  CheckCircle2, XCircle, LogIn, LogOut, Building2, UserPlus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ── Data ──────────────────────────────────────────────────
const profileData = {
  name: "Admin User",
  username: "admin",
  email: "admin@abcfinance.com",
  phone: "+91 98765 43210",
  role: "Super Admin",
  staffCode: "STF001",
  department: "Administration",
  financeCompany: "ABC Finance Pvt Ltd",
  joiningDate: "2020-01-15",
  experience: "6 Years",
  qualification: "MBA Finance",
  dob: "1992-06-15",
  loginTime: "09:00 AM",
  logoutTime: "06:30 PM",
  salary: 45000,
  incentives: 5000,
  commission: 2.5,
  address: "No. 12, 3rd Street, RS Puram, Coimbatore - 641002",
  status: "Active" as const,
  lastLogin: "Today 09:02 AM",
  lastPasswordChange: "2025-12-10",
  isOnline: true,
};

const performanceData = {
  totalCustomers: 245,
  totalCollections: 1850000,
  monthlyPerformance: 92,
  assignedLoans: 38,
  recoveryRate: 87,
  assignedAreas: ["RS Puram", "Gandhipuram", "Peelamedu"],
};

const activityLog = [
  { day: "Mon", login: "09:00 AM", logout: "06:30 PM", duration: "9h 30m", device: "Desktop", ip: "192.168.1.10" },
  { day: "Tue", login: "08:45 AM", logout: "06:15 PM", duration: "9h 30m", device: "Desktop", ip: "192.168.1.10" },
  { day: "Wed", login: "09:10 AM", logout: "07:00 PM", duration: "9h 50m", device: "Mobile", ip: "10.0.0.5" },
  { day: "Thu", login: "09:00 AM", logout: "06:30 PM", duration: "9h 30m", device: "Desktop", ip: "192.168.1.10" },
  { day: "Fri", login: "08:50 AM", logout: "06:00 PM", duration: "9h 10m", device: "Desktop", ip: "192.168.1.10" },
  { day: "Sat", login: "10:00 AM", logout: "02:00 PM", duration: "4h 00m", device: "Mobile", ip: "10.0.0.5" },
  { day: "Sun", login: "-", logout: "-", duration: "-", device: "-", ip: "-" },
];

const collectionTrend = [
  { month: "Jan", amount: 120000 },
  { month: "Feb", amount: 145000 },
  { month: "Mar", amount: 160000 },
  { month: "Apr", amount: 138000 },
  { month: "May", amount: 175000 },
  { month: "Jun", amount: 185000 },
];

const performanceMonthly = [
  { month: "Jan", rate: 78 },
  { month: "Feb", rate: 82 },
  { month: "Mar", rate: 85 },
  { month: "Apr", rate: 80 },
  { month: "May", rate: 90 },
  { month: "Jun", rate: 92 },
];

const pages = [
  "Dashboard", "Loans", "Collections", "Accounts", "Reports",
  "Master", "Agent Mgmt", "Notices", "Profile",
];
const actions = ["View", "Create", "Edit", "Delete"];
const actionIcons = [Eye, Plus, Edit, Trash2];

const permissions: Record<string, boolean[]> = {};
pages.forEach((p) => {
  permissions[p] = p === "Profile" ? [true, false, true, false] : [true, true, true, true];
});

const assignedCustomers = [
  { id: "HPL001", name: "Rajesh Kumar", loan: "₹2,50,000", status: "Active" },
  { id: "HPL002", name: "Priya Sharma", loan: "₹1,80,000", status: "Active" },
  { id: "HPL003", name: "Suresh Babu", loan: "₹3,20,000", status: "Overdue" },
  { id: "HPL004", name: "Meena Devi", loan: "₹95,000", status: "Closed" },
];

// ── Helpers ───────────────────────────────────────────────
const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay },
});

function StatMini({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────
export default function UserProfile() {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="space-y-6 pb-8">
      {/* ───── HEADER ───── */}
      <motion.div {...fade()} className="rounded-2xl overflow-hidden" style={{ background: "var(--gradient-primary)" }}>
        <div className="px-6 py-8 md:px-10 md:py-10 flex flex-col md:flex-row items-center gap-6 backdrop-blur-sm bg-primary/10">
          <Avatar className="w-28 h-28 border-4 border-primary-foreground/30 shadow-xl">
            <AvatarFallback
              className="text-4xl font-bold bg-primary-foreground/20 text-primary-foreground"
            >
              {profileData.name.charAt(0)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold text-primary-foreground">
                {profileData.name}
              </h1>
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <Badge className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/30">
                  {profileData.role}
                </Badge>
                <Badge className={`border-0 ${profileData.status === "Active" ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}>
                  <span className={`w-2 h-2 rounded-full mr-1.5 ${profileData.isOnline ? "bg-success-foreground animate-pulse" : "bg-destructive-foreground"}`} />
                  {profileData.isOnline ? "Online" : "Offline"}
                </Badge>
              </div>
            </div>
            <p className="text-primary-foreground/70 text-sm">
              @{profileData.username} · {profileData.staffCode} · {profileData.financeCompany}
            </p>
            <div className="flex flex-wrap gap-4 justify-center md:justify-start text-xs text-primary-foreground/60">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last login: {profileData.lastLogin}</span>
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined: {profileData.joiningDate}</span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="secondary" className="text-xs">
              <Edit className="h-3 w-3 mr-1" /> Edit Profile
            </Button>
            <Button size="sm" variant="secondary" className="text-xs">
              <UserPlus className="h-3 w-3 mr-1" /> Invite to Company
            </Button>
            <Button size="sm" variant="secondary" className="text-xs">
              <Lock className="h-3 w-3 mr-1" /> Change Password
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ───── BODY GRID ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Basic Info */}
          <motion.div {...fade(0.05)}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow icon={Mail} label="Email" value={profileData.email} />
                <InfoRow icon={Phone} label="Phone" value={profileData.phone} />
                <InfoRow icon={Calendar} label="Date of Birth" value={profileData.dob} />
                <InfoRow icon={MapPin} label="Address" value={profileData.address} />
              </CardContent>
            </Card>
          </motion.div>

          {/* Work Details */}
          <motion.div {...fade(0.1)}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" /> Work Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow icon={Shield} label="Role" value={profileData.role} />
                <InfoRow icon={Users} label="Department" value={profileData.department} />
                <InfoRow icon={Key} label="Staff Code" value={profileData.staffCode} />
                <InfoRow icon={Calendar} label="Joining Date" value={profileData.joiningDate} />
                <InfoRow icon={Award} label="Experience" value={profileData.experience} />
                <InfoRow icon={FileText} label="Qualification" value={profileData.qualification} />
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Salary Details</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-muted p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Salary</p>
                      <p className="text-sm font-bold text-foreground">₹{profileData.salary.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Incentives</p>
                      <p className="text-sm font-bold text-income">₹{profileData.incentives.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Commission</p>
                      <p className="text-sm font-bold text-primary">{profileData.commission}%</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Security */}
          <motion.div {...fade(0.15)}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" /> Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Last Password Change</span>
                  <span className="text-sm font-medium text-foreground">{profileData.lastPasswordChange}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Account Status</span>
                  <Badge className="bg-success/10 text-success border-success/20">{profileData.status}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Two-Factor Auth</span>
                  <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
                </div>
                <Separator />
                <Button variant="outline" size="sm" className="w-full text-xs">
                  <Lock className="h-3 w-3 mr-1" /> Change Password
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* RIGHT 2 COLUMNS */}
        <div className="lg:col-span-2 space-y-6">

          {/* Performance Stats */}
          <motion.div {...fade(0.05)}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Performance Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                  <StatMini icon={Users} label="Customers" value={performanceData.totalCustomers} color="bg-primary/10 text-primary" />
                  <StatMini icon={DollarSign} label="Collections" value={`₹${(performanceData.totalCollections / 100000).toFixed(1)}L`} color="bg-income/10 text-income" />
                  <StatMini icon={Target} label="Monthly" value={`${performanceData.monthlyPerformance}%`} color="bg-pending/10 text-pending" />
                  <StatMini icon={FileText} label="Loans" value={performanceData.assignedLoans} color="bg-accent text-accent-foreground" />
                  <StatMini icon={TrendingUp} label="Recovery" value={`${performanceData.recoveryRate}%`} color="bg-success/10 text-success" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Collection Trend */}
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Collection Trend</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={collectionTrend}>
                        <defs>
                          <linearGradient id="profColGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${v / 1000}K`} />
                        <Tooltip formatter={(v: number) => [`₹${v.toLocaleString()}`, "Collection"]} />
                        <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="url(#profColGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Recovery Rate */}
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Recovery Rate</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={performanceMonthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                        <Tooltip formatter={(v: number) => [`${v}%`, "Rate"]} />
                        <Bar dataKey="rate" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Activity Timeline */}
          <motion.div {...fade(0.1)}>
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Login Activity (Last 7 Days)
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowHistory(!showHistory)}>
                  {showHistory ? "Hide Details" : "View Full History"} <ChevronRight className={`h-3 w-3 transition-transform ${showHistory ? "rotate-90" : ""}`} />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activityLog.map((a, i) => (
                    <motion.div
                      key={a.day}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors ${a.duration === "-" ? "opacity-40" : ""}`}
                    >
                      <span className="text-xs font-bold text-primary w-8">{a.day}</span>
                      <div className="flex items-center gap-1 text-xs text-income"><LogIn className="h-3 w-3" />{a.login}</div>
                      <div className="flex items-center gap-1 text-xs text-expense"><LogOut className="h-3 w-3" />{a.logout}</div>
                      <Badge variant="outline" className="text-[10px] ml-auto">{a.duration}</Badge>

                      <AnimatePresence>
                        {showHistory && a.device !== "-" && (
                          <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: "auto", opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="flex items-center gap-2 overflow-hidden"
                          >
                            {a.device === "Desktop" ? <Monitor className="h-3 w-3 text-muted-foreground" /> : <Smartphone className="h-3 w-3 text-muted-foreground" />}
                            <span className="text-[10px] text-muted-foreground font-mono">{a.ip}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Assigned Customers */}
          <motion.div {...fade(0.15)}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Assigned Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{assignedCustomers.length}</p>
                    <p className="text-[10px] text-muted-foreground">Customers</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{performanceData.assignedLoans}</p>
                    <p className="text-[10px] text-muted-foreground">Loans</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{performanceData.assignedAreas.length}</p>
                    <p className="text-[10px] text-muted-foreground">Areas</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {assignedCustomers.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">{c.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.id} · {c.loan}</p>
                        </div>
                      </div>
                      <Badge className={`text-[10px] ${c.status === "Active" ? "bg-success/10 text-success border-success/20" : c.status === "Overdue" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-muted text-muted-foreground"}`}>
                        {c.status}
                      </Badge>
                    </div>
                  ))}
                </div>

                <Separator className="my-3" />
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                  <span>Assigned Areas:</span>
                  {performanceData.assignedAreas.map((a) => (
                    <Badge key={a} variant="outline" className="text-[10px] mx-0.5">{a}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ───── PERMISSIONS ───── */}
      <motion.div {...fade(0.2)}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Permission Matrix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pages.map((page) => (
                <div key={page} className="border border-border rounded-xl p-3 hover:shadow-sm transition-shadow">
                  <p className="text-sm font-semibold text-foreground mb-2">{page}</p>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action, idx) => {
                      const allowed = permissions[page]?.[idx] ?? false;
                      const ActionIcon = actionIcons[idx];
                      return (
                        <div
                          key={action}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${allowed
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                            }`}
                        >
                          {allowed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          <ActionIcon className="h-3 w-3" />
                          {action}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ── Small sub-component ──
function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

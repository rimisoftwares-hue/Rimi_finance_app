import { motion, AnimatePresence } from "framer-motion";
import {
  User, Mail, Phone, MapPin, Briefcase, Shield, Clock, DollarSign, Key,
  Calendar, Award, TrendingUp, Activity, Lock, Monitor, Smartphone,
  ChevronRight, Users, FileText, Target, BarChart3, Edit, Eye, Trash2, Plus,
  CheckCircle2, XCircle, LogIn, LogOut, KeyRound, UserPlus, AlertCircle, RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { JoinWithCodeDialog } from "../components/invitations/JoinWithCodeDialog";
import { ChangePasswordDialog } from "../components/auth/ChangePasswordDialog";
import {
  fetchUserProfileOverview,
  type UserProfileOverviewData,
  type ActivityLogItem,
} from "../api/userProfileApi";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ── Static / Mock Sections (explicitly kept static per specification) ────────
// MOCK: Salary details stay static
const MOCK_SALARY_DETAILS = {
  salary: 45000,
  incentives: 5000,
  commission: 2.5,
};

// MOCK: Permission Matrix stays static
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

// ── Helpers ───────────────────────────────────────────────
const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay },
});

function formatIndianCurrency(amount: number): string {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString("en-IN")}`;
}

function formatCollectionsKpi(totalCollections: number): string {
  const val = Number(totalCollections) || 0;
  if (val >= 100000) {
    return `₹${(val / 100000).toFixed(1)}L`;
  }
  return formatIndianCurrency(val);
}

function formatLastLoginIST(iso: string | null): string {
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";

  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const now = new Date();
  const todayStr = dateFmt.format(now);
  const yesterdayStr = dateFmt.format(new Date(now.getTime() - 86400000));
  const targetDateStr = dateFmt.format(parsed);
  const timeStr = timeFmt.format(parsed);

  if (targetDateStr === todayStr) {
    return `Today ${timeStr}`;
  }
  if (targetDateStr === yesterdayStr) {
    return `Yesterday ${timeStr}`;
  }
  return `${targetDateStr} ${timeStr}`;
}

function computeLiveDuration(item: ActivityLogItem, nowMs: number): string {
  if (!item.isActiveNow || !item.loginAt) {
    return item.duration || "-";
  }
  const loginMs = new Date(item.loginAt).getTime();
  if (Number.isNaN(loginMs)) return item.duration || "-";
  const totalMinutes = Math.max(0, Math.floor((nowMs - loginMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

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

// ── Loading Skeleton ──────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div className="space-y-6 pb-8 animate-pulse">
      <div className="rounded-2xl overflow-hidden bg-muted/60 border border-border">
        <div className="px-6 py-8 md:px-10 md:py-10 flex flex-col md:flex-row items-center gap-6">
          <div className="w-28 h-28 rounded-full bg-muted" />
          <div className="flex-1 space-y-3 w-full">
            <div className="h-7 w-56 bg-muted rounded-md mx-auto md:mx-0" />
            <div className="h-4 w-72 bg-muted rounded-md mx-auto md:mx-0" />
            <div className="h-3 w-48 bg-muted rounded-md mx-auto md:mx-0" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-24 bg-muted rounded-md" />
            <div className="h-8 w-28 bg-muted rounded-md" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-5 w-36 bg-muted rounded" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-4 w-5/6 bg-muted rounded" />
                <div className="h-4 w-2/3 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="lg:col-span-2 space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-5 w-44 bg-muted rounded" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-28 w-full bg-muted rounded-xl" />
                <div className="h-20 w-full bg-muted rounded-xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Header Action Button Style (matches CompanyProfile header action buttons) ──
const headerActionBtn =
  "bg-white/20 text-primary-foreground border-white/30 hover:bg-white/30 backdrop-blur-sm shadow-sm text-xs font-medium";

// ── Component ─────────────────────────────────────────────
export default function UserProfile() {
  const [showHistory, setShowHistory] = useState(false);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [overview, setOverview] = useState<UserProfileOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const navigate = useNavigate();
  const { currentFinance } = useAuth();

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchUserProfileOverview(signal);
      if (!signal?.aborted) {
        setOverview(data);
        setNowMs(Date.now());
      }
    } catch (err: any) {
      if (err?.name === "CanceledError" || err?.name === "AbortError" || signal?.aborted) {
        return;
      }
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Unable to load profile overview.";
      setErrorMessage(msg);
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadProfile(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadProfile, currentFinance?.id]);

  // Refresh live duration once per minute if today's session is active
  useEffect(() => {
    const hasActiveSession = overview?.activityLog?.some((a) => a.isActiveNow);
    if (!hasActiveSession) return;
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);
    return () => window.clearInterval(interval);
  }, [overview?.activityLog]);

  const handlePasswordChanged = (lastPasswordChange: string) => {
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            profile: {
              ...prev.profile,
              lastPasswordChange,
            },
          }
        : prev
    );
  };

  if (isLoading && !overview) {
    return <ProfileSkeleton />;
  }

  if (errorMessage && !overview) {
    return (
      <div className="py-12">
        <Card className="max-w-lg mx-auto">
          <CardContent className="p-6 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">Failed to load profile</p>
              <p className="text-xs text-muted-foreground">{errorMessage}</p>
            </div>
            <Button
              size="sm"
              onClick={() => loadProfile()}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  const { profile, performance, activityLog, assignedData } = overview;
  const canInvite = profile.rawRole === "owner" || profile.rawRole === "admin";
  const avatarInitial = (profile.name && profile.name !== "-" ? profile.name : "U")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="space-y-6 pb-8">
      {/* ───── HEADER ───── */}
      <motion.div {...fade()} className="rounded-2xl overflow-hidden" style={{ background: "var(--gradient-primary)" }}>
        <div className="px-6 py-8 md:px-10 md:py-10 flex flex-col md:flex-row items-center gap-6 backdrop-blur-sm bg-primary/10">
          <Avatar className="w-28 h-28 border-4 border-primary-foreground/30 shadow-xl">
            {profile.photo ? (
              <AvatarImage src={profile.photo} alt={profile.name} className="object-cover" />
            ) : null}
            <AvatarFallback
              className="text-4xl font-bold bg-primary-foreground/20 text-primary-foreground"
            >
              {avatarInitial}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold text-primary-foreground">
                {profile.name}
              </h1>
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <Badge className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/30">
                  {profile.role}
                </Badge>
                <Badge className={`border-0 ${profile.status === "Active" ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}>
                  <span className={`w-2 h-2 rounded-full mr-1.5 ${profile.isOnline ? "bg-success-foreground animate-pulse" : "bg-destructive-foreground"}`} />
                  {profile.isOnline ? "Online" : "Offline"}
                </Badge>
              </div>
            </div>
            <p className="text-primary-foreground/70 text-sm">
              @{profile.username} · {profile.staffCode} · {profile.financeCompany}
            </p>
            <div className="flex flex-wrap gap-4 justify-center md:justify-start text-xs text-primary-foreground/60">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Last login: {formatLastLoginIST(profile.lastLogin)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Joined: {profile.joiningDate}
              </span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="secondary" className={headerActionBtn}>
              <Edit className="h-4 w-4 mr-1.5" /> Edit Profile
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className={headerActionBtn}
              onClick={() => setJoinCodeOpen(true)}
            >
              <KeyRound className="h-4 w-4 mr-1.5" /> Join with Code
            </Button>
            {canInvite && (
              <Button
                size="sm"
                variant="secondary"
                className={headerActionBtn}
                onClick={() => navigate("/invite")}
              >
                <UserPlus className="h-4 w-4 mr-1.5" /> Invite Agent
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className={headerActionBtn}
              onClick={() => setChangePasswordOpen(true)}
            >
              <Lock className="h-4 w-4 mr-1.5" /> Change Password
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
                <InfoRow icon={Mail} label="Email" value={profile.email} />
                <InfoRow icon={Phone} label="Phone" value={profile.phone} />
                <InfoRow icon={MapPin} label="Address" value={profile.address} />
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
                <InfoRow icon={Shield} label="Role" value={profile.role} />
                <InfoRow icon={Key} label="Staff Code" value={profile.staffCode} />
                <InfoRow icon={Calendar} label="Joining Date" value={profile.joiningDate} />
                <InfoRow icon={Award} label="Experience" value={profile.experience} />
                <InfoRow icon={FileText} label="Qualification" value={profile.qualification} />
                <Separator />
                {/* MOCK: Salary Details stay static */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Salary Details</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-muted p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Salary</p>
                      <p className="text-sm font-bold text-foreground">₹{MOCK_SALARY_DETAILS.salary.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Incentives</p>
                      <p className="text-sm font-bold text-income">₹{MOCK_SALARY_DETAILS.incentives.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Commission</p>
                      <p className="text-sm font-bold text-primary">{MOCK_SALARY_DETAILS.commission}%</p>
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
                  <span className="text-sm font-medium text-foreground">{profile.lastPasswordChange || "-"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Account Status</span>
                  <Badge
                    className={
                      profile.status === "Active"
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    }
                  >
                    {profile.status}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Two-Factor Auth</span>
                  {/* MOCK: Two-Factor Auth stays static Disabled */}
                  <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
                </div>
                <Separator />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setChangePasswordOpen(true)}
                >
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
                  <StatMini icon={Users} label="Customers" value={performance.totalCustomers} color="bg-primary/10 text-primary" />
                  <StatMini icon={DollarSign} label="Collections" value={formatCollectionsKpi(performance.totalCollections)} color="bg-income/10 text-income" />
                  <StatMini icon={Target} label="Monthly" value={`${performance.monthlyPerformance}%`} color="bg-pending/10 text-pending" />
                  <StatMini icon={FileText} label="Loans" value={performance.assignedLoans} color="bg-accent text-accent-foreground" />
                  <StatMini icon={TrendingUp} label="Recovery" value={`${performance.recoveryRate}%`} color="bg-success/10 text-success" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Collection Trend */}
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Collection Trend</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={performance.collectionTrend}>
                        <defs>
                          <linearGradient id="profColGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          stroke="hsl(var(--muted-foreground))"
                          tickFormatter={(v) => (v >= 1000 ? `₹${Math.round(v / 1000)}K` : `₹${v}`)}
                        />
                        <Tooltip formatter={(v) => [`₹${Number(v ?? 0).toLocaleString("en-IN")}`, "Collection"]} />
                        <Area type="monotone" dataKey="collected" stroke="hsl(var(--primary))" fill="url(#profColGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Recovery Rate */}
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Recovery Rate</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={performance.performanceMonthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                        <Tooltip formatter={(v) => [`${v ?? 0}%`, "Rate"]} />
                        <Bar dataKey="score" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
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
                  {activityLog.map((a, i) => {
                    const displayDuration = computeLiveDuration(a, nowMs);
                    return (
                      <motion.div
                        key={a.date || `${a.day}-${i}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors ${displayDuration === "-" ? "opacity-40" : ""}`}
                      >
                        <span className="text-xs font-bold text-primary w-8">{a.day}</span>
                        <div className="flex items-center gap-1 text-xs text-income"><LogIn className="h-3 w-3" />{a.login || "-"}</div>
                        <div className="flex items-center gap-1 text-xs text-expense"><LogOut className="h-3 w-3" />{a.logout || "-"}</div>
                        <Badge variant="outline" className="text-[10px] ml-auto">{displayDuration}</Badge>

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
                    );
                  })}
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
                    <p className="text-lg font-bold text-foreground">{assignedData.customerCount}</p>
                    <p className="text-[10px] text-muted-foreground">Customers</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{assignedData.loanCount}</p>
                    <p className="text-[10px] text-muted-foreground">Loans</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{assignedData.areaCount}</p>
                    <p className="text-[10px] text-muted-foreground">Areas</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {assignedData.assignedCustomers.length === 0 ? (
                    <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
                      No customer assigned
                    </div>
                  ) : (
                    assignedData.assignedCustomers.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {(c.name || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {c.hplno} · {formatIndianCurrency(c.loanAmount)}
                            </p>
                          </div>
                        </div>
                        <Badge className={`text-[10px] ${c.status === "Active" ? "bg-success/10 text-success border-success/20" : c.status === "Overdue" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-muted text-muted-foreground"}`}>
                          {c.status}
                        </Badge>
                      </div>
                    ))
                  )}
                  {assignedData.hasMore && (
                    <p className="text-[11px] text-muted-foreground text-center pt-1">
                      Showing {assignedData.assignedCustomers.length} of {assignedData.customerCount} assigned customers
                    </p>
                  )}
                </div>

                <Separator className="my-3" />
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                  <span>Assigned Areas:</span>
                  {assignedData.assignedAreas.length === 0 ? (
                    <span className="text-foreground font-medium ml-1">Not Assigned</span>
                  ) : (
                    assignedData.assignedAreas.map((a) => (
                      <Badge key={a} variant="outline" className="text-[10px] mx-0.5">{a}</Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ───── PERMISSIONS (MOCK / STATIC) ───── */}
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

      <JoinWithCodeDialog
        open={joinCodeOpen}
        onOpenChange={setJoinCodeOpen}
        onSuccess={() => {
          loadProfile();
        }}
      />

      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
        onPasswordChanged={handlePasswordChanged}
      />
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

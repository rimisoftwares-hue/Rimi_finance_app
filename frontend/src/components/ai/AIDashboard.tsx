import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bot, MessageSquare, ThumbsUp, ThumbsDown, Bell, Clock, Eye, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { aiApi, AIDashboardResponse } from "../../api/aiApi";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const baseKpiCards = [
  { key: "totalCalls" as const, title: "Total AI Calls", icon: Bot, color: "from-blue-500 to-indigo-600", suffix: "" },
  { key: "activeConversations" as const, title: "Calls (Last 24h)", icon: MessageSquare, color: "from-emerald-500 to-teal-600", suffix: "" },
  { key: "positivePct" as const, title: "Positive %", icon: ThumbsUp, color: "from-green-500 to-emerald-600", suffix: "%" },
  { key: "negativePct" as const, title: "Negative %", icon: ThumbsDown, color: "from-red-500 to-rose-600", suffix: "%" },
  { key: "remindersSent" as const, title: "Connected Reminders", icon: Bell, color: "from-amber-500 to-orange-600", suffix: "" },
  { key: "followUpPending" as const, title: "Callbacks Pending", icon: Clock, color: "from-purple-500 to-violet-600", suffix: "" },
];

const sentimentBadge = (s: string) => {
  if (s === "positive") return <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Positive</Badge>;
  if (s === "negative") return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">Negative</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30">Neutral</Badge>;
};

export default function AIDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<AIDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    aiApi
      .getDashboard()
      .then((res) => {
        if (!mounted) return;
        setData(res);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.response?.data?.error || err?.message || "Failed to load AI dashboard metrics");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const kpiValues = data?.kpis ?? {
    totalCalls: 0,
    activeConversations: 0,
    positivePct: 0,
    negativePct: 0,
    remindersSent: 0,
    followUpPending: 0,
  };
  const sentimentData = data?.sentimentData ?? [];
  const volumeData = data?.volumeData ?? [];
  const interactions = data?.recentInteractions ?? [];

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" /> AI Assistant Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Live AI call telemetry, sentiment & customer interactions</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </motion.div>

      {error && (
        <Card className="border-red-300 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4 text-sm text-red-600">{error}</CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {baseKpiCards.map((kpi, i) => {
          const val = kpiValues[kpi.key];
          return (
            <motion.div key={kpi.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Card className="relative overflow-hidden hover:shadow-lg transition-all duration-300 group">
                <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-[0.06] group-hover:opacity-[0.1] transition-opacity`} />
                <CardContent className="p-4 relative">
                  <div className="flex items-center justify-between mb-2">
                    <kpi.icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {loading && !data ? "—" : `${Number(val || 0).toLocaleString("en-IN")}${kpi.suffix}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.title}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2"><CardTitle className="text-base">7-Day Sentiment Trend (IST)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={sentimentData}>
                  <defs>
                    <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="100%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gNeu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eab308" stopOpacity={0.3} /><stop offset="100%" stopColor="#eab308" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Area type="monotone" dataKey="positive" stroke="#22c55e" fill="url(#gPos)" strokeWidth={2} />
                  <Area type="monotone" dataKey="neutral" stroke="#eab308" fill="url(#gNeu)" strokeWidth={2} />
                  <Area type="monotone" dataKey="negative" stroke="#ef4444" fill="url(#gNeg)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2"><CardTitle className="text-base">7-Day Call Volume (IST)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Interactions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Call Interactions</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate("/ai/logs")}>View All</Button>
            </div>
          </CardHeader>
          <CardContent>
            {interactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No AI call interactions recorded yet for this finance company.
              </p>
            ) : (
              <div className="space-y-3">
                {interactions.map((item) => (
                  <div
                    key={item.callId || item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors cursor-pointer"
                    onClick={() => item.callId && navigate(`/ai/calls/${encodeURIComponent(item.callId)}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {item.customer.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.customer}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.hpl}
                          {item.callOutcome ? ` • ${item.callOutcome.replace(/_/g, " ")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {sentimentBadge(item.sentiment)}
                      <span className="text-xs text-muted-foreground">{item.time}</span>
                      {item.callId && (
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

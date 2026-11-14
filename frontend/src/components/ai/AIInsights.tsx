import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Brain, TrendingUp, AlertTriangle, Users, BarChart3, ShieldAlert, Award, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { TablePagination, TableSkeletonRows } from "../common";
import { useClientPagination } from "../../hooks/useClientPagination";
import { aiApi, RiskLevel } from "../../api/aiApi";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const riskColor = (score: number) => (score >= 80 ? "text-red-600 dark:text-red-400" : score >= 50 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400");

const riskBadge = (level?: RiskLevel, score = 0) => {
  const effective = level || (score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "warning" : "safe");
  if (effective === "critical") return <Badge className="bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/30">Critical</Badge>;
  if (effective === "high") return <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30">High</Badge>;
  if (effective === "warning") return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Warning</Badge>;
  return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">Safe</Badge>;
};

export default function AIInsights() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof aiApi.getInsights>> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    aiApi
      .getInsights()
      .then((res) => {
        if (!mounted) return;
        setInsights(res);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.response?.data?.error || err?.message || "Failed to load AI insights");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const topStats = insights?.topStats ?? {
    connectionRatePct: 0,
    ptpConversionPct: 0,
    highRiskPct: 0,
    activeConversations: 0,
    totalCalls: 0,
    connectedCalls: 0,
    ptpCalls: 0,
    avgDurationSec: 0,
  };
  const riskDistribution = insights?.riskDistribution ?? [];
  const sentimentVsRecovery = insights?.sentimentVsRecovery ?? [];
  const topOutcomes = insights?.topOutcomes ?? [];
  const activeCustomers = insights?.activeCustomers ?? [];
  const watchList = useMemo(() => insights?.highRiskCustomers ?? [], [insights]);
  const maxOutcomeCount = Math.max(1, ...topOutcomes.map((o) => o.count));

  const {
    paginatedItems: paginatedWatchList,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
  } = useClientPagination(watchList, { initialPageSize: 15 });

  return (
    <div className="space-y-6 w-full">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" /> AI Insights & Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Live portfolio risk, PTP conversion & call outcome intelligence</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </motion.div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Call Connection Rate", value: loading && !insights ? "—" : `${topStats.connectionRatePct}%`, icon: Award, color: "text-green-600 dark:text-green-400" },
          { label: "PTP Conversion Rate", value: loading && !insights ? "—" : `${topStats.ptpConversionPct}%`, icon: TrendingUp, color: "text-blue-600 dark:text-blue-400" },
          { label: "High / Critical Risk Share", value: loading && !insights ? "—" : `${topStats.highRiskPct}%`, icon: AlertTriangle, color: "text-red-600 dark:text-red-400" },
          { label: "Calls in Last 24h", value: loading && !insights ? "—" : String(topStats.activeConversations), icon: Users, color: "text-purple-600 dark:text-purple-400" },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className="hover:shadow-lg transition-all">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment vs Recovery */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Monthly Payment Activity vs Positive Sentiment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sentimentVsRecovery}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="recovery" name="Paying Portfolio %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sentiment" name="Positive Call %" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Risk Distribution */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> Portfolio Risk Score Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {riskDistribution.every((d) => d.value === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-20">No active loan portfolio records found</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={riskDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={55}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}%`}
                    >
                      {riskDistribution.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Outcomes */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base">Top Call Outcomes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {topOutcomes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No completed call outcomes recorded yet</p>
              ) : (
                topOutcomes.map((c) => (
                  <div key={c.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground capitalize">{c.name}</span>
                      <span className="text-muted-foreground">{c.count}</span>
                    </div>
                    <Progress value={(c.count / maxOutcomeCount) * 100} className="h-2" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Most Contacted */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base">Most Contacted Customers</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {activeCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No customer AI calls recorded yet</p>
              ) : (
                activeCustomers.map((c) => (
                  <div key={c.customerId || c.name} className="flex items-center justify-between p-2 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                        {c.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{c.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.interactions} call{c.interactions === 1 ? "" : "s"}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Call Telemetry Summary */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base">Voice AI Telemetry Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { metric: "Total Calls Attempted", val: String(topStats.totalCalls) },
                { metric: "Connected & Spoken", val: String(topStats.connectedCalls) },
                { metric: "Promise-to-Pay Captured", val: String(topStats.ptpCalls) },
                { metric: "Avg Connected Duration", val: topStats.avgDurationSec > 0 ? `${topStats.avgDurationSec}s` : "—" },
              ].map((row) => (
                <div key={row.metric} className="p-2.5 rounded-xl border border-border/60 bg-muted/30 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{row.metric}</p>
                  <span className="text-sm font-bold text-primary">{row.val}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* High Risk Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="space-y-4">
        <div className="dashboard-card !p-4 hover:translate-y-0 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" /> High-Risk Overdue Customer Watch
          </h2>
          <Badge variant="secondary" className="text-xs">{watchList.length}</Badge>
        </div>

        <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Customer</th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">HPL No</th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Due Risk</th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Credit Score</th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Overdue EMI</th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Overdue Days</th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading && watchList.length === 0 ? (
                  <TableSkeletonRows columns={7} rows={6} />
                ) : watchList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No overdue customers found
                    </td>
                  </tr>
                ) : (
                  paginatedWatchList.map((c) => (
                    <tr key={c.customerId || c.hpl} className="hover:bg-secondary/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{c.hpl}</td>
                      <td className={`px-4 py-3 text-sm font-bold ${riskColor(c.score)}`}>{c.score}%</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{c.creditScore != null ? `${c.creditScore}/100` : "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground font-medium">{c.overdue}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{c.days}d</td>
                      <td className="px-4 py-3 text-sm">{riskBadge(c.riskLevel, c.score)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </motion.div>
    </div>
  );
}

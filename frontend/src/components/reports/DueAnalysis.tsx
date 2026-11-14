import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";
import { fetchDueAnalysis, getRiskErrorMessage, DueAnalysisResponse } from "../../api/riskApi";

// Colours follow bucket order: Current, 1-30, 31-60, 61-90, 90+ (NPA)
const BUCKET_COLORS = [
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(25, 95%, 53%)",
  "hsl(0, 84%, 60%)",
  "hsl(0, 0%, 20%)",
];

export default function DueAnalysis() {
  const [data, setData] = useState<DueAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchDueAnalysis(controller.signal)
      .then((res) => setData(res))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getRiskErrorMessage(err, "Failed to load due analysis"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const riskData = (data?.buckets ?? []).map((b, i) => ({
    name: b.label,
    value: b.count,
    amount: b.amount,
    percentage: b.percentage,
    color: BUCKET_COLORS[i % BUCKET_COLORS.length],
  }));
  const trendData = data?.trend ?? [];
  const total = data?.kpis.totalLoans ?? 0;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Due Analysis</h1>
          <p className="text-muted-foreground mt-1 text-sm">Portfolio risk distribution and NPA tracking</p>
        </div>
      </motion.div>

      {loading ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="dashboard-card text-center space-y-2">
                <Skeleton className="w-3 h-3 rounded-full mx-auto" />
                <Skeleton className="h-7 w-12 mx-auto" />
                <Skeleton className="h-3 w-20 mx-auto" />
                <Skeleton className="h-3 w-10 mx-auto" />
              </div>
            ))}
          </div>
          <div className="dashboard-card space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full rounded-full" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="dashboard-card"><Skeleton className="h-6 w-40 mb-4" /><Skeleton className="h-72 w-full" /></div>
            <div className="dashboard-card"><Skeleton className="h-6 w-40 mb-4" /><Skeleton className="h-72 w-full" /></div>
          </div>
        </>
      ) : error || !data ? (
        <div className="dashboard-card text-center py-12 space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error ?? "No data available"}</p>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="h-3.5 w-3.5" />Retry
          </Button>
        </div>
      ) : (
        <>
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
                <span className="font-bold text-expense">{data.kpis.npaPercentage}%</span>
              </div>
            </div>
            <div className="h-4 rounded-full overflow-hidden flex bg-muted">
              {total > 0 && riskData.map(item => (
                <div key={item.name} style={{ width: `${(item.value / total) * 100}%`, background: item.color }} className="transition-all duration-500" />
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              {riskData.map(item => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  {item.name}: {item.percentage.toFixed(1)}%
                </div>
              ))}
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="dashboard-card">
              <h3 className="text-lg font-semibold text-foreground mb-4">Risk Distribution</h3>
              <div className="h-72">
                {total > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={riskData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                        {riskData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [v, "Loans"]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No active loans</div>
                )}
              </div>
            </motion.div>

            {/* Trend Chart */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="dashboard-card">
              <h3 className="text-lg font-semibold text-foreground mb-4">NPA &amp; Overdue Trend</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem" }} />
                    <Line type="monotone" dataKey="npa" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={{ r: 4 }} name="NPA %" />
                    <Line type="monotone" dataKey="overdue" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={{ r: 4 }} name="Overdue Count" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}

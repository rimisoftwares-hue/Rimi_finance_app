import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, AlertTriangle, MapPin, BarChart3, PieChart as PieChartIcon, RefreshCw,
} from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LineChart, Line, ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  fetchLocatorOverview,
  fetchDueAnalysis,
  getRiskErrorMessage,
  LocatorOverviewResponse,
  DueAnalysisResponse,
} from "../../api/riskApi";

const formatINR = (val: number) => `₹${Math.round(Number(val || 0)).toLocaleString("en-IN")}`;

export default function Insights() {
  const [locator, setLocator] = useState<LocatorOverviewResponse | null>(null);
  const [dueAnalysis, setDueAnalysis] = useState<DueAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      fetchLocatorOverview(undefined, controller.signal),
      fetchDueAnalysis(controller.signal),
    ])
      .then(([locRes, dueRes]) => {
        setLocator(locRes);
        setDueAnalysis(dueRes);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getRiskErrorMessage(err, "Failed to load locator insights"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const riskDist = locator?.riskDistribution ?? [];
  const topLocations = locator?.topLocations ?? [];
  const customers = locator?.customers ?? [];
  const agingBuckets = dueAnalysis?.buckets ?? [];
  const trendData = dueAnalysis?.trend ?? [];

  const scatterPoints = customers
    .filter((c) => c.overdueDays > 0 || c.distanceFromHome !== null)
    .map((c) => ({
      name: c.name,
      movement: c.distanceFromHome ?? 0,
      overdueDays: c.overdueDays,
      risk: c.dueRiskScore,
    }));

  const highRiskWatch = customers
    .filter((c) => c.riskLevel === "critical" || c.riskLevel === "high")
    .slice(0, 8);

  return (
    <div className="space-y-5 p-1">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Customer Locator — Insights</h1>
          <p className="text-sm text-muted-foreground">Live portfolio risk distribution, aging buckets & location concentration</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </motion.div>

      {error && (
        <Card className="p-4 border-red-300 bg-red-50/50 text-xs text-red-600">{error}</Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk Distribution */}
        <Card className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
            <PieChartIcon className="h-4 w-4 text-primary" /> Portfolio Risk Distribution
          </h3>
          {riskDist.every((d) => d.value === 0) ? (
            <p className="text-xs text-muted-foreground text-center py-16">No active portfolio customers found</p>
          ) : (
            <div className="flex items-center gap-6">
              <div className="h-48 w-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={riskDist} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4}>
                      {riskDist.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 flex-1">
                {riskDist.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                    <span className="text-sm">{d.name}</span>
                    <span className="text-sm font-bold ml-auto">{d.value}</span>
                    <span className="text-xs text-muted-foreground">({d.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* 6-Month Overdue Trend */}
        <Card className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" /> 6-Month Overdue Loan Trend
          </h3>
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip />
                <Line type="monotone" dataKey="overdue" name="Overdue Loans" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Aging Buckets */}
        <Card className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-primary" /> Delinquency Aging Buckets
          </h3>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={agingBuckets}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip />
                <Bar dataKey="count" name="Loans" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Overdue Days vs Due Risk Scatter */}
        <Card className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-500" /> Overdue Days vs Due Risk Score
          </h3>
          <div className="h-48">
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="overdueDays" name="Overdue Days" className="text-xs" />
                <YAxis dataKey="risk" name="Due Risk Score" className="text-xs" />
                <ZAxis dataKey="movement" range={[50, 180]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatterPoints} fill="hsl(var(--destructive))" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Authoritative NBFC delinquency days vs composite Due Risk Score
          </p>
        </Card>
      </div>

      {/* Top Customer Locations */}
      <Card className="p-5">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4 text-primary" /> Top Customer Areas (Registered Addresses)
        </h3>
        {topLocations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No customer address locations recorded yet</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {topLocations.map((loc) => (
              <motion.div key={loc.area} whileHover={{ scale: 1.03 }} className="p-3 rounded-xl border border-border bg-muted/30 text-center">
                <p className="text-lg font-black text-foreground">{loc.pct}%</p>
                <p className="text-sm font-medium truncate">{loc.area}</p>
                <p className="text-xs text-muted-foreground">
                  {loc.customers} customer{loc.customers === 1 ? "" : "s"}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      {/* High Risk Watch */}
      <Card className="p-5">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-red-500" /> High-Risk Customer Watch
        </h3>
        <div className="space-y-2">
          {highRiskWatch.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No high or critical risk customers in portfolio right now
            </p>
          ) : (
            highRiskWatch.map((c) => (
              <div key={c.id} className="flex items-center gap-4 p-3 rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20">
                <div className="h-8 w-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-black">
                  {c.dueRiskScore}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.name} {c.hplno != null ? `— HPL-${c.hplno}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.distanceFromHome != null ? `${c.distanceFromHome} KM away · ` : ""}
                    {c.overdueDays} days overdue · {formatINR(c.overdueAmount)} · Credit {c.creditScore}/100
                  </p>
                </div>
                <p className="text-xs text-red-600 font-bold capitalize">
                  {c.riskLevel === "critical" ? "Immediate Action" : "Schedule Visit"}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

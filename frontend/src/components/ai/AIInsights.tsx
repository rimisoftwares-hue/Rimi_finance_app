import { motion } from "framer-motion";
import { Brain, TrendingUp, AlertTriangle, Users, BarChart3, ShieldAlert, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const complaints = [
  { name: "Late Charges", count: 45 },
  { name: "Agent Behavior", count: 32 },
  { name: "Wrong Amount", count: 28 },
  { name: "Repeated Calls", count: 22 },
  { name: "Loan Closure", count: 18 },
];

const activeCustomers = [
  { name: "Rajesh Kumar", interactions: 24, sentiment: "positive" },
  { name: "Mohit Singh", interactions: 19, sentiment: "negative" },
  { name: "Priya Sharma", interactions: 17, sentiment: "negative" },
  { name: "Sunita Devi", interactions: 15, sentiment: "positive" },
  { name: "Anil Verma", interactions: 12, sentiment: "neutral" },
];

const sentimentVsRecovery = [
  { month: "Oct", recovery: 78, sentiment: 65 },
  { month: "Nov", recovery: 82, sentiment: 70 },
  { month: "Dec", recovery: 75, sentiment: 58 },
  { month: "Jan", recovery: 88, sentiment: 72 },
  { month: "Feb", recovery: 85, sentiment: 68 },
  { month: "Mar", recovery: 91, sentiment: 75 },
];

const riskDistribution = [
  { name: "Low Risk", value: 58, color: "#22c55e" },
  { name: "Medium Risk", value: 28, color: "#eab308" },
  { name: "High Risk", value: 14, color: "#ef4444" },
];

const highRiskCustomers = [
  { name: "Mohit Singh", hpl: "HPL-2024-058", score: 87, overdue: "₹32,400", days: 15 },
  { name: "Priya Sharma", hpl: "HPL-2024-015", score: 79, overdue: "₹18,600", days: 5 },
  { name: "Ravi Yadav", hpl: "HPL-2024-093", score: 72, overdue: "₹45,200", days: 22 },
  { name: "Deepak Jha", hpl: "HPL-2024-107", score: 68, overdue: "₹12,800", days: 8 },
];

const agentVsAI = [
  { metric: "Avg Response", agent: "4.2 min", ai: "0.3 sec" },
  { metric: "Resolution Rate", agent: "72%", ai: "68%" },
  { metric: "Customer Satisfaction", agent: "78%", ai: "82%" },
  { metric: "Cost per Interaction", agent: "₹45", ai: "₹2" },
];

const riskColor = (score: number) => score >= 80 ? "text-red-600" : score >= 60 ? "text-amber-600" : "text-green-600";
const riskBadge = (score: number) => {
  if (score >= 80) return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">High</Badge>;
  if (score >= 60) return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">Medium</Badge>;
  return <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Low</Badge>;
};

export default function AIInsights() {
  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="h-7 w-7 text-primary" /> AI Insights & Analytics
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Advanced business intelligence from AI interactions</p>
      </motion.div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "AI Success Rate", value: "84%", icon: Award, color: "text-green-600" },
          { label: "Avg Recovery Improvement", value: "+12%", icon: TrendingUp, color: "text-blue-600" },
          { label: "High Risk Customers", value: "14%", icon: AlertTriangle, color: "text-red-600" },
          { label: "Active AI Conversations", value: "284", icon: Users, color: "text-purple-600" },
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
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Sentiment vs Payment Recovery</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sentimentVsRecovery}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="recovery" name="Recovery %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sentiment" name="Positive %" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Risk Distribution */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> AI Risk Score Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={riskDistribution} cx="50%" cy="50%" outerRadius={90} innerRadius={55} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                    {riskDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Common Complaints */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base">Top Complaints</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {complaints.map((c) => (
                <div key={c.name} className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-foreground">{c.name}</span><span className="text-muted-foreground">{c.count}</span></div>
                  <Progress value={(c.count / 45) * 100} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Most Active */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base">Most Active Customers</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {activeCustomers.map((c) => (
                <div key={c.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">{c.name.charAt(0)}</div>
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{c.interactions} chats</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Agent vs AI */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base">Agent vs AI Comparison</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {agentVsAI.map((row) => (
                <div key={row.metric} className="p-2 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">{row.metric}</p>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-foreground">👤 {row.agent}</span>
                    <span className="text-primary">🤖 {row.ai}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* High Risk Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> High-Risk Customer Watch</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">HPL No</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Risk Score</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Overdue</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Days</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {highRiskCustomers.map((c) => (
                    <tr key={c.hpl} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-3 font-medium text-foreground">{c.name}</td>
                      <td className="p-3 text-muted-foreground">{c.hpl}</td>
                      <td className={`p-3 font-bold ${riskColor(c.score)}`}>{c.score}</td>
                      <td className="p-3 text-foreground">{c.overdue}</td>
                      <td className="p-3 text-foreground">{c.days}</td>
                      <td className="p-3">{riskBadge(c.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

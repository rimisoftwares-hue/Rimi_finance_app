import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, MessageSquare, ThumbsUp, ThumbsDown, Bell, Clock, TrendingUp, TrendingDown, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const sentimentData = [
  { date: "Mon", positive: 42, neutral: 18, negative: 8 },
  { date: "Tue", positive: 38, neutral: 22, negative: 12 },
  { date: "Wed", positive: 50, neutral: 15, negative: 6 },
  { date: "Thu", positive: 45, neutral: 20, negative: 10 },
  { date: "Fri", positive: 55, neutral: 12, negative: 5 },
  { date: "Sat", positive: 35, neutral: 25, negative: 14 },
  { date: "Sun", positive: 48, neutral: 17, negative: 9 },
];

const volumeData = [
  { date: "Mon", calls: 68 },
  { date: "Tue", calls: 72 },
  { date: "Wed", calls: 71 },
  { date: "Thu", calls: 75 },
  { date: "Fri", calls: 72 },
  { date: "Sat", calls: 74 },
  { date: "Sun", calls: 74 },
];

const recentInteractions = [
  { id: 1, customer: "Rajesh Kumar", hpl: "HPL-2024-001", sentiment: "positive", time: "2 min ago" },
  { id: 2, customer: "Priya Sharma", hpl: "HPL-2024-015", sentiment: "negative", time: "8 min ago" },
  { id: 3, customer: "Anil Verma", hpl: "HPL-2024-032", sentiment: "neutral", time: "15 min ago" },
  { id: 4, customer: "Sunita Devi", hpl: "HPL-2024-044", sentiment: "positive", time: "22 min ago" },
  { id: 5, customer: "Mohit Singh", hpl: "HPL-2024-058", sentiment: "negative", time: "30 min ago" },
];

function AnimatedNum({ value }: { value: number }) {
  const [count, setCount] = useState(0);
  useState(() => {
    let start = 0;
    const end = value;
    const duration = 1200;
    const step = Math.max(1, Math.floor(end / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); } else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  });
  return <span>{count.toLocaleString()}</span>;
}

const kpis = [
  { title: "Total AI Calls", value: 12847, icon: Bot, trend: 12.5, color: "from-blue-500 to-indigo-600" },
  { title: "Active Conversations", value: 284, icon: MessageSquare, trend: 8.3, color: "from-emerald-500 to-teal-600" },
  { title: "Positive %", value: 72, icon: ThumbsUp, trend: 3.2, color: "from-green-500 to-emerald-600", suffix: "%" },
  { title: "Negative %", value: 11, icon: ThumbsDown, trend: -2.1, color: "from-red-500 to-rose-600", suffix: "%" },
  { title: "Reminders Sent", value: 3420, icon: Bell, trend: 15.7, color: "from-amber-500 to-orange-600" },
  { title: "Follow-up Pending", value: 156, icon: Clock, trend: -4.3, color: "from-purple-500 to-violet-600" },
];

const sentimentBadge = (s: string) => {
  if (s === "positive") return <Badge className="bg-green-500/15 text-green-700 border-green-500/30 hover:bg-green-500/25">Positive</Badge>;
  if (s === "negative") return <Badge className="bg-red-500/15 text-red-700 border-red-500/30 hover:bg-red-500/25">Negative</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30 hover:bg-yellow-500/25">Neutral</Badge>;
};

export default function AIDashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" /> AI Assistant Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor AI performance, sentiment & customer interactions</p>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="relative overflow-hidden hover:shadow-lg transition-all duration-300 group">
              <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-[0.06] group-hover:opacity-[0.1] transition-opacity`} />
              <CardContent className="p-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <kpi.icon className="h-5 w-5 text-primary" />
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${kpi.trend > 0 ? "text-green-600" : "text-red-600"}`}>
                    {kpi.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(kpi.trend)}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground"><AnimatedNum value={kpi.value} />{kpi.suffix || ""}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.title}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2"><CardTitle className="text-base">Sentiment Trend</CardTitle></CardHeader>
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
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
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

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2"><CardTitle className="text-base">Conversation Volume</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Interactions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Interactions</CardTitle>
              <Button variant="outline" size="sm">View All</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentInteractions.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                      {item.customer.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.customer}</p>
                      <p className="text-xs text-muted-foreground">{item.hpl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {sentimentBadge(item.sentiment)}
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                    <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
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

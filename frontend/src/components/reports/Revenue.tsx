import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { IndianRupee, TrendingUp, Receipt, AlertTriangle, Wallet, CalendarIcon, Search } from "lucide-react";
import { SummaryCard } from "../dashboard/SummaryCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const allRevenue = [
  { month: "Jan", year: 2025, date: new Date(2025, 0, 1), collection: 398000, principal: 255000, interest: 103000, penalty: 40000 },
  { month: "Feb", year: 2025, date: new Date(2025, 1, 1), collection: 410000, principal: 265000, interest: 105000, penalty: 40000 },
  { month: "Mar", year: 2025, date: new Date(2025, 2, 1), collection: 345000, principal: 220000, interest: 90000, penalty: 35000 },
  { month: "Apr", year: 2025, date: new Date(2025, 3, 1), collection: 378000, principal: 240000, interest: 98000, penalty: 40000 },
  { month: "May", year: 2025, date: new Date(2025, 4, 1), collection: 425000, principal: 270000, interest: 110000, penalty: 45000 },
  { month: "Jun", year: 2025, date: new Date(2025, 5, 1), collection: 450000, principal: 290000, interest: 115000, penalty: 45000 },
  { month: "Jul", year: 2024, date: new Date(2024, 6, 1), collection: 285000, principal: 180000, interest: 75000, penalty: 30000 },
  { month: "Aug", year: 2024, date: new Date(2024, 7, 1), collection: 312000, principal: 200000, interest: 82000, penalty: 30000 },
  { month: "Sep", year: 2024, date: new Date(2024, 8, 1), collection: 345000, principal: 220000, interest: 90000, penalty: 35000 },
  { month: "Oct", year: 2024, date: new Date(2024, 9, 1), collection: 378000, principal: 240000, interest: 98000, penalty: 40000 },
  { month: "Nov", year: 2024, date: new Date(2024, 10, 1), collection: 425000, principal: 270000, interest: 110000, penalty: 45000 },
  { month: "Dec", year: 2024, date: new Date(2024, 11, 1), collection: 398000, principal: 255000, interest: 103000, penalty: 40000 },
];

export default function Revenue() {
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [applied, setApplied] = useState(false);

  const filtered = useMemo(() => {
    if (!applied || (!fromDate && !toDate)) return allRevenue;
    return allRevenue.filter(r => {
      if (fromDate && r.date < new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)) return false;
      if (toDate && r.date > new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0)) return false;
      return true;
    });
  }, [applied, fromDate, toDate]);

  const totalCollection = filtered.reduce((s, r) => s + r.collection, 0);
  const totalPrincipal = filtered.reduce((s, r) => s + r.principal, 0);
  const totalInterest = filtered.reduce((s, r) => s + r.interest, 0);
  const totalPenalty = filtered.reduce((s, r) => s + r.penalty, 0);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Revenue Report</h1>
        <p className="text-muted-foreground mt-1">Monthly revenue breakdown and trends</p>
      </motion.div>

      {/* Date Range Filter */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDate ? format(fromDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toDate ? format(toDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <Button className="gap-2" onClick={() => setApplied(true)}>
            <Search className="h-4 w-4" /> Show
          </Button>
          {(fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setFromDate(undefined); setToDate(undefined); setApplied(false); }}>
              Clear
            </Button>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard title="Total Collection" value={`₹${(totalCollection / 100000).toFixed(1)}L`} subtitle="Selected period" icon={IndianRupee} trend={{ value: 12, isPositive: true }} variant="income" />
        <SummaryCard title="Principal Received" value={`₹${(totalPrincipal / 100000).toFixed(1)}L`} subtitle="Selected period" icon={Wallet} variant="default" />
        <SummaryCard title="Interest Received" value={`₹${(totalInterest / 100000).toFixed(1)}L`} subtitle="Selected period" icon={TrendingUp} variant="default" />
        <SummaryCard title="Penalty Collected" value={`₹${(totalPenalty / 100000).toFixed(1)}L`} subtitle="Recovery charges" icon={AlertTriangle} variant="expense" />
        <SummaryCard title="Net Income" value={`₹${((totalInterest + totalPenalty) / 100000).toFixed(1)}L`} subtitle="Interest + Penalty" icon={Receipt} trend={{ value: 8, isPositive: true }} variant="income" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card">
        <h3 className="text-lg font-semibold text-foreground mb-1">Monthly Revenue Breakdown</h3>
        <p className="text-sm text-muted-foreground mb-4">Principal, Interest & Penalty collection</p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filtered} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 6%, 90%)" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(240, 3%, 46%)" }} tickFormatter={v => `₹${v / 1000}K`} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(240,6%,90%)", borderRadius: "0.75rem" }} formatter={(v: number) => [`₹${v.toLocaleString()}`, ""]} />
              <Bar dataKey="principal" fill="hsl(230, 85%, 55%)" radius={[4, 4, 0, 0]} name="Principal" stackId="a" />
              <Bar dataKey="interest" fill="hsl(142, 76%, 36%)" radius={[0, 0, 0, 0]} name="Interest" stackId="a" />
              <Bar dataKey="penalty" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} name="Penalty" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                {["Month", "Collection", "Principal", "Interest", "Penalty"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={`${row.month}-${row.year}`} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{row.month} {row.year}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-income">₹{row.collection.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-foreground">₹{row.principal.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-foreground">₹{row.interest.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-warning">₹{row.penalty.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/50 font-semibold">
                <td className="px-4 py-3 text-sm text-foreground">Total</td>
                <td className="px-4 py-3 text-sm text-income">₹{totalCollection.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-foreground">₹{totalPrincipal.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-foreground">₹{totalInterest.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-warning">₹{totalPenalty.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

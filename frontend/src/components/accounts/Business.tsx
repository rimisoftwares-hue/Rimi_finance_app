import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";

const businessData = [
  { month: "Aug 2024", principal: 280000, interest: 120000, defaultAmt: 35000, handLoan: 15000, hpCount: 8, loanAmount: 450000, docCharge: 12000 },
  { month: "Sep 2024", principal: 310000, interest: 140000, defaultAmt: 28000, handLoan: 18000, hpCount: 6, loanAmount: 380000, docCharge: 15000 },
  { month: "Oct 2024", principal: 345000, interest: 155000, defaultAmt: 42000, handLoan: 22000, hpCount: 10, loanAmount: 520000, docCharge: 18000 },
  { month: "Nov 2024", principal: 370000, interest: 165000, defaultAmt: 38000, handLoan: 12000, hpCount: 7, loanAmount: 480000, docCharge: 14000 },
  { month: "Dec 2024", principal: 420000, interest: 185000, defaultAmt: 52000, handLoan: 25000, hpCount: 11, loanAmount: 550000, docCharge: 20000 },
  { month: "Jan 2025", principal: 395000, interest: 170000, defaultAmt: 45000, handLoan: 20000, hpCount: 9, loanAmount: 420000, docCharge: 16000 },
  { month: "Feb 2025", principal: 410000, interest: 178000, defaultAmt: 48000, handLoan: 17000, hpCount: 8, loanAmount: 380000, docCharge: 17000 },
];

const fmt = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Business() {
  const [fromDate, setFromDate] = useState("2024-08-01");
  const [toDate, setToDate] = useState("2025-02-28");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedMonth, setExpandedMonth] = useState<string | null>("Feb 2025");

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return businessData;
    const q = searchTerm.toLowerCase().trim();
    return businessData.filter(r => r.month.toLowerCase().includes(q));
  }, [searchTerm]);

  const totals = useMemo(() => filteredData.reduce((a, r) => ({
    principal: a.principal + r.principal,
    interest: a.interest + r.interest,
    defaultAmt: a.defaultAmt + r.defaultAmt,
    handLoan: a.handLoan + r.handLoan,
    hpTotal: a.hpTotal + (r.principal + r.interest + r.defaultAmt + r.handLoan),
    hpCount: a.hpCount + r.hpCount,
    loanAmount: a.loanAmount + r.loanAmount,
    docCharge: a.docCharge + r.docCharge,
  }), { principal: 0, interest: 0, defaultAmt: 0, handLoan: 0, hpTotal: 0, hpCount: 0, loanAmount: 0, docCharge: 0 }), [filteredData]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Business Report</h1>
        <p className="text-muted-foreground mt-1">HP Receipt, Loan Disbursement & charges overview</p>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">From Date</label>
            <DatePicker value={fromDate} onChange={e => setFromDate(e.target.value)} placeholder="From Date" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">To Date</label>
            <DatePicker value={toDate} onChange={e => setToDate(e.target.value)} placeholder="To Date" />
          </div>
          <Button size="sm" style={{ background: "var(--gradient-primary)" }}>Show</Button>
          <div className="ml-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search..." className="input-field text-sm py-2 pl-9 w-48" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Principal", value: totals.principal, color: "border-t-primary" },
          { label: "Total Interest", value: totals.interest, color: "border-t-income" },
          { label: "Total Default", value: totals.defaultAmt, color: "border-t-warning" },
          { label: "Total Loan Amount", value: totals.loanAmount, color: "border-t-expense" },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className={`dashboard-card border-t-4 ${item.color}`}>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-xl font-bold text-foreground mt-1">₹{fmt(item.value)}</p>
          </motion.div>
        ))}
      </div>

      {/* Bar Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="dashboard-card">
        <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Comparison</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `₹${v / 1000}K`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem" }} formatter={(v: number) => [`₹${v.toLocaleString()}`, ""]} />
              <Legend />
              <Bar dataKey="principal" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Principal" />
              <Bar dataKey="interest" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} name="Interest" />
              <Bar dataKey="defaultAmt" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} name="Default" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Expandable Monthly Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
        {/* Sticky Total Row */}
        <div className="dashboard-card bg-secondary/50">
          <div className="grid grid-cols-12 gap-2 text-xs font-bold text-foreground">
            <div className="col-span-2">Month</div>
            <div className="col-span-5 text-center border-b-2 border-primary pb-1 mb-1">HP RECEIPT</div>
            <div className="col-span-5 text-center border-b-2 border-income pb-1 mb-1">HP LEDGER</div>
          </div>
          <div className="grid grid-cols-12 gap-2 text-xs font-bold text-muted-foreground mt-1">
            <div className="col-span-2"></div>
            <div className="text-right">Principal</div>
            <div className="text-right">Interest</div>
            <div className="text-right">Default</div>
            <div className="text-right">Hand Loan</div>
            <div className="text-right">Total</div>
            <div className="text-right">HP Count</div>
            <div className="text-right">Loan Amt</div>
            <div className="text-right">Doc Charge</div>
            <div className="col-span-2"></div>
          </div>
        </div>

        {filteredData.map((row, i) => {
          const hpTotal = row.principal + row.interest + row.defaultAmt + row.handLoan;
          const isExpanded = expandedMonth === row.month;
          return (
            <motion.div key={row.month} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }} className="dashboard-card p-0 overflow-hidden">
              <button
                onClick={() => setExpandedMonth(isExpanded ? null : row.month)}
                className="w-full px-4 py-3 hover:bg-secondary/30 transition-colors"
              >
                <div className="grid grid-cols-12 gap-2 text-sm items-center">
                  <div className="col-span-2 flex items-center gap-2 font-semibold text-foreground">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {row.month}
                  </div>
                  {/* HP Receipt */}
                  <div className="text-right text-foreground">₹{row.principal.toLocaleString()}</div>
                  <div className="text-right text-foreground">₹{row.interest.toLocaleString()}</div>
                  <div className="text-right text-warning">₹{row.defaultAmt.toLocaleString()}</div>
                  <div className="text-right text-foreground">₹{row.handLoan.toLocaleString()}</div>
                  <div className="text-right font-bold text-primary">₹{hpTotal.toLocaleString()}</div>
                  {/* HP Ledger */}
                  <div className="text-right text-foreground">{row.hpCount}</div>
                  <div className="text-right text-foreground">₹{row.loanAmount.toLocaleString()}</div>
                  <div className="text-right text-foreground">₹{row.docCharge.toLocaleString()}</div>
                  <div className="col-span-2"></div>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3 bg-secondary/20">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Principal:</span> <span className="font-semibold text-foreground ml-1">₹{fmt(row.principal)}</span></div>
                    <div><span className="text-muted-foreground">Interest:</span> <span className="font-semibold text-foreground ml-1">₹{fmt(row.interest)}</span></div>
                    <div><span className="text-muted-foreground">Default:</span> <span className="font-semibold text-warning ml-1">₹{fmt(row.defaultAmt)}</span></div>
                    <div><span className="text-muted-foreground">Hand Loan:</span> <span className="font-semibold text-foreground ml-1">₹{fmt(row.handLoan)}</span></div>
                    <div><span className="text-muted-foreground">HP Count:</span> <span className="font-semibold text-foreground ml-1">{row.hpCount}</span></div>
                    <div><span className="text-muted-foreground">Loan Amount:</span> <span className="font-semibold text-foreground ml-1">₹{fmt(row.loanAmount)}</span></div>
                    <div><span className="text-muted-foreground">Doc Charge:</span> <span className="font-semibold text-foreground ml-1">₹{fmt(row.docCharge)}</span></div>
                    <div><span className="text-muted-foreground">HP Total:</span> <span className="font-bold text-primary ml-1">₹{fmt(hpTotal)}</span></div>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Grand Total */}
        <div className="dashboard-card bg-income/10">
          <div className="grid grid-cols-12 gap-2 text-sm font-bold">
            <div className="col-span-2 text-foreground">Grand Total</div>
            <div className="text-right text-foreground">₹{totals.principal.toLocaleString()}</div>
            <div className="text-right text-foreground">₹{totals.interest.toLocaleString()}</div>
            <div className="text-right text-warning">₹{totals.defaultAmt.toLocaleString()}</div>
            <div className="text-right text-foreground">₹{totals.handLoan.toLocaleString()}</div>
            <div className="text-right text-primary">₹{totals.hpTotal.toLocaleString()}</div>
            <div className="text-right text-foreground">{totals.hpCount}</div>
            <div className="text-right text-foreground">₹{totals.loanAmount.toLocaleString()}</div>
            <div className="text-right text-foreground">₹{totals.docCharge.toLocaleString()}</div>
            <div className="col-span-2"></div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

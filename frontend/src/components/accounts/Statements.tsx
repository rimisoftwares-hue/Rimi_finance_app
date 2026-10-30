import { motion } from "framer-motion";
import { useState } from "react";
import { Printer, Search } from "lucide-react";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";

const summaryData = {
  totalCollection: 1918000,
  totalVehicleLoanAmount: 4500000,
  newVehicleLoanCount: 12,
  closedVehicleLoanCount: 4,
  seizingVehicleCount: 3,
  underLoanVehicleCount: 85,
  interestReceived: 825000,
  principalReceived: 1093000,
  documentCharge: 45000,
  defaultAmount: 112000,
  handLoan: 35000,
  commissionCharge: 18000,
  expenses: 92000,
  netProfit: 733000,
  totalOutstandingPrincipal: 3200000,
};

const monthlyStatements = [
  {
    month: "February 2025", demand: 425000, received: 398000, balance: 27000, entries: [
      { date: "2025-02-26", particular: "EMI Collection", demand: 15000, received: 15000, balance: 0 },
      { date: "2025-02-24", particular: "EMI Collection", demand: 20000, received: 12000, balance: 8000 },
      { date: "2025-02-20", particular: "EMI Collection", demand: 15000, received: 15000, balance: 0 },
      { date: "2025-02-15", particular: "Penalty", demand: 5000, received: 5000, balance: 0 },
    ]
  },
  {
    month: "January 2025", demand: 398000, received: 375000, balance: 23000, entries: [
      { date: "2025-01-28", particular: "EMI Collection", demand: 22000, received: 22000, balance: 0 },
      { date: "2025-01-20", particular: "EMI Collection", demand: 18000, received: 15000, balance: 3000 },
      { date: "2025-01-15", particular: "Penalty Recovery", demand: 8000, received: 8000, balance: 0 },
    ]
  },
  {
    month: "December 2024", demand: 380000, received: 365000, balance: 15000, entries: [
      { date: "2024-12-28", particular: "EMI Collection", demand: 25000, received: 25000, balance: 0 },
      { date: "2024-12-20", particular: "EMI + Penalty", demand: 18000, received: 18000, balance: 0 },
    ]
  },
  { month: "November 2024", demand: 365000, received: 342000, balance: 23000, entries: [] },
  { month: "October 2024", demand: 350000, received: 345000, balance: 5000, entries: [] },
];

const fmt = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Statements() {
  const [expanded, setExpanded] = useState<string | null>("February 2025");
  const [fromDate, setFromDate] = useState("2024-10-01");
  const [toDate, setToDate] = useState("2025-02-28");
  const [showSummary, setShowSummary] = useState(true);

  const s = summaryData;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Statements</h1>
        <p className="text-muted-foreground mt-1">Monthly demand vs received breakdown</p>
      </motion.div>

      {/* Date Filter */}
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
          <Button size="sm" className="gap-2" style={{ background: "var(--gradient-primary)" }} onClick={() => setShowSummary(true)}>
            <Search className="h-4 w-4" /> Submit
          </Button>
          <Button variant="outline" size="sm" className="gap-2 ml-auto" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </motion.div>

      {/* Monthly Statement Summary */}
      {showSummary && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.85))" }}>
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-primary-foreground">MONTHLY STATEMENT</h2>
            <p className="text-primary-foreground/70 text-sm mt-1">{fromDate} to {toDate}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-3">
              {[
                { label: "Total Collection", value: s.totalCollection },
                { label: "Total Vehicle Loan Amount", value: s.totalVehicleLoanAmount },
                { label: "New Vehicle Loan Count", value: s.newVehicleLoanCount, isCount: true },
                { label: "Closed Vehicle Loan Count", value: s.closedVehicleLoanCount, isCount: true },
                { label: "Seizing Vehicle Count", value: s.seizingVehicleCount, isCount: true },
                { label: "Under Loan Vehicle Count", value: s.underLoanVehicleCount, isCount: true },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-primary-foreground/20">
                  <span className="text-sm text-primary-foreground/80">{item.label}</span>
                  <span className="text-sm font-bold text-primary-foreground">{item.isCount ? item.value : `₹${fmt(item.value)}`}</span>
                </div>
              ))}
            </div>
            {/* Right Column */}
            <div className="space-y-3">
              {[
                { label: "Interest Received", value: s.interestReceived },
                { label: "Principal Received", value: s.principalReceived },
                { label: "Document Charge", value: s.documentCharge },
                { label: "Default Amount", value: s.defaultAmount },
                { label: "Hand Loan", value: s.handLoan },
                { label: "Commission Charge", value: s.commissionCharge },
                { label: "Expenses", value: s.expenses },
                { label: "Net Profit", value: s.netProfit, highlight: true },
                { label: "Total Outstanding Principal", value: s.totalOutstandingPrincipal },
              ].map(item => (
                <div key={item.label} className={`flex items-center justify-between py-2 border-b border-primary-foreground/20 ${item.highlight ? "bg-primary-foreground/10 rounded px-2" : ""}`}>
                  <span className={`text-sm ${item.highlight ? "font-bold text-primary-foreground" : "text-primary-foreground/80"}`}>{item.label}</span>
                  <span className={`text-sm font-bold text-primary-foreground ${item.highlight ? "text-lg" : ""}`}>₹{fmt(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Monthly Rows */}
      <div className="space-y-3">
        {monthlyStatements.map((stmt, i) => (
          <motion.div key={stmt.month} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="dashboard-card p-0 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === stmt.month ? null : stmt.month)}
              className="w-full flex items-center justify-between px-4 py-4 hover:bg-secondary/30 transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">{stmt.month}</span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Demand</p>
                  <p className="text-sm font-medium text-foreground">₹{stmt.demand.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Received</p>
                  <p className="text-sm font-medium text-income">₹{stmt.received.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="text-sm font-semibold text-expense">₹{stmt.balance.toLocaleString()}</p>
                </div>
              </div>
            </button>
            {expanded === stmt.month && stmt.entries.length > 0 && (
              <div className="border-t border-border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-secondary/30">
                      {["Date", "Particular", "Demand", "Received", "Balance"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stmt.entries.map((e, j) => (
                      <tr key={j} className="border-b border-border/30">
                        <td className="px-4 py-2 text-sm text-muted-foreground">{e.date}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{e.particular}</td>
                        <td className="px-4 py-2 text-sm text-foreground">₹{e.demand.toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm text-income">₹{e.received.toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm text-expense">{e.balance > 0 ? `₹${e.balance.toLocaleString()}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Grand Total */}
      <div className="dashboard-card bg-secondary/50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-foreground">Grand Total</span>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Demand</p>
              <p className="text-sm font-bold text-foreground">₹{monthlyStatements.reduce((s, r) => s + r.demand, 0).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Received</p>
              <p className="text-sm font-bold text-income">₹{monthlyStatements.reduce((s, r) => s + r.received, 0).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Balance</p>
              <p className="text-sm font-bold text-expense">₹{monthlyStatements.reduce((s, r) => s + r.balance, 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

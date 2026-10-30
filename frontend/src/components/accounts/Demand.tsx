import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const demandMonths = [
  {
    month: "February 2025",
    demandPrincipal: 185000, demandInterest: 95000,
    receivedPrincipal: 170000, receivedInterest: 88000,
    entries: [
      { loanNo: "OWN-0001", customer: "Rajesh Kumar", dP: 15000, dI: 8000, rP: 15000, rI: 8000 },
      { loanNo: "FR-0012", customer: "Suresh Babu", dP: 12000, dI: 6500, rP: 10000, rI: 5000 },
      { loanNo: "OWN-0034", customer: "Priya Devi", dP: 18000, dI: 9500, rP: 18000, rI: 9500 },
      { loanNo: "OWN-0056", customer: "Manoj Singh", dP: 20000, dI: 11000, rP: 8000, rI: 5000 },
    ],
  },
  {
    month: "January 2025",
    demandPrincipal: 178000, demandInterest: 92000,
    receivedPrincipal: 165000, receivedInterest: 85000,
    entries: [
      { loanNo: "FR-0023", customer: "Lakshmi Narasimhan", dP: 20000, dI: 12000, rP: 18000, rI: 10000 },
      { loanNo: "OWN-0078", customer: "Arun Prakash", dP: 8000, dI: 4500, rP: 8000, rI: 4500 },
      { loanNo: "FR-0045", customer: "Deepa Kumari", dP: 8500, dI: 4200, rP: 8500, rI: 4200 },
    ],
  },
  {
    month: "December 2024",
    demandPrincipal: 172000, demandInterest: 88000,
    receivedPrincipal: 160000, receivedInterest: 82000,
    entries: [
      { loanNo: "OWN-0091", customer: "Venkatesh Raman", dP: 15000, dI: 8500, rP: 6000, rI: 4000 },
      { loanNo: "OWN-0005", customer: "Gopal Krishna", dP: 10000, dI: 5500, rP: 10000, rI: 5500 },
    ],
  },
  {
    month: "November 2024",
    demandPrincipal: 165000, demandInterest: 85000,
    receivedPrincipal: 155000, receivedInterest: 78000,
    entries: [],
  },
];

const fmt = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Demand() {
  const [expanded, setExpanded] = useState<string | null>("February 2025");
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();

  const filteredMonths = demandMonths.filter((m) => {
    if (!fromDate && !toDate) return true;
    const monthDate = new Date(m.month + " 1");
    if (fromDate && monthDate < new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)) return false;
    if (toDate && monthDate > new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0)) return false;
    return true;
  });
  const grandDemandP = filteredMonths.reduce((s, r) => s + r.demandPrincipal, 0);
  const grandDemandI = filteredMonths.reduce((s, r) => s + r.demandInterest, 0);
  const grandReceivedP = filteredMonths.reduce((s, r) => s + r.receivedPrincipal, 0);
  const grandReceivedI = filteredMonths.reduce((s, r) => s + r.receivedInterest, 0);
  const grandBalP = grandDemandP - grandReceivedP;
  const grandBalI = grandDemandI - grandReceivedI;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Demand Statement</h1>
        <p className="text-muted-foreground mt-1">Grouped demand, received & balance breakdown</p>
      </motion.div>

      {/* Date Range Filter */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="dashboard-card">
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
          <Button onClick={() => { /* trigger filter */ }} className="gap-2">
            <Search className="h-4 w-4" /> Submit
          </Button>
          {(fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setFromDate(undefined); setToDate(undefined); }}>
              Clear
            </Button>
          )}
        </div>
      </motion.div>

      {/* Grand Total at Top */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card bg-secondary/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-3 py-2"></th>
                <th colSpan={3} className="text-center px-3 py-1 text-xs font-bold text-primary uppercase border-b-2 border-primary">Demand</th>
                <th colSpan={3} className="text-center px-3 py-1 text-xs font-bold text-income uppercase border-b-2 border-income">Received</th>
                <th colSpan={2} className="text-center px-3 py-1 text-xs font-bold text-expense uppercase border-b-2 border-expense">Balance</th>
              </tr>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-semibold">Grand Total</th>
                <th className="text-right px-3 py-2">Principal</th>
                <th className="text-right px-3 py-2">Interest</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Principal</th>
                <th className="text-right px-3 py-2">Interest</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Principal</th>
                <th className="text-right px-3 py-2">Interest</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-bold">
                <td className="px-3 py-2 text-foreground">All Months</td>
                <td className="px-3 py-2 text-right text-primary">₹{fmt(grandDemandP)}</td>
                <td className="px-3 py-2 text-right text-primary">₹{fmt(grandDemandI)}</td>
                <td className="px-3 py-2 text-right text-primary font-bold">₹{fmt(grandDemandP + grandDemandI)}</td>
                <td className="px-3 py-2 text-right text-income">₹{fmt(grandReceivedP)}</td>
                <td className="px-3 py-2 text-right text-income">₹{fmt(grandReceivedI)}</td>
                <td className="px-3 py-2 text-right text-income font-bold">₹{fmt(grandReceivedP + grandReceivedI)}</td>
                <td className="px-3 py-2 text-right text-expense">₹{fmt(grandBalP)}</td>
                <td className="px-3 py-2 text-right text-expense">₹{fmt(grandBalI)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Monthly Expandable Rows */}
      <div className="space-y-3">
        {filteredMonths.map((m, i) => {
          const dTotal = m.demandPrincipal + m.demandInterest;
          const rTotal = m.receivedPrincipal + m.receivedInterest;
          const balP = m.demandPrincipal - m.receivedPrincipal;
          const balI = m.demandInterest - m.receivedInterest;
          const isOpen = expanded === m.month;
          return (
            <motion.div key={m.month} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }} className="dashboard-card p-0 overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : m.month)} className="w-full hover:bg-secondary/30 transition-colors">
                <div className="grid grid-cols-10 gap-1 px-4 py-3 text-sm items-center">
                  <div className="col-span-2 flex items-center gap-2 font-semibold text-foreground text-left">
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {m.month}
                  </div>
                  {/* Demand */}
                  <div className="text-right text-primary">₹{m.demandPrincipal.toLocaleString()}</div>
                  <div className="text-right text-primary">₹{m.demandInterest.toLocaleString()}</div>
                  <div className="text-right text-primary font-bold">₹{dTotal.toLocaleString()}</div>
                  {/* Received */}
                  <div className="text-right text-income">₹{m.receivedPrincipal.toLocaleString()}</div>
                  <div className="text-right text-income">₹{m.receivedInterest.toLocaleString()}</div>
                  <div className="text-right text-income font-bold">₹{rTotal.toLocaleString()}</div>
                  {/* Balance */}
                  <div className="text-right text-expense">{balP > 0 ? `₹${balP.toLocaleString()}` : "—"}</div>
                  <div className="text-right text-expense">{balI > 0 ? `₹${balI.toLocaleString()}` : "—"}</div>
                </div>
              </button>
              {isOpen && m.entries.length > 0 && (
                <div className="border-t border-border">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-secondary/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-2">Loan No</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-2">Customer</th>
                        <th className="text-right text-xs font-semibold text-primary uppercase px-4 py-2">D.Principal</th>
                        <th className="text-right text-xs font-semibold text-primary uppercase px-4 py-2">D.Interest</th>
                        <th className="text-right text-xs font-semibold text-income uppercase px-4 py-2">R.Principal</th>
                        <th className="text-right text-xs font-semibold text-income uppercase px-4 py-2">R.Interest</th>
                        <th className="text-right text-xs font-semibold text-expense uppercase px-4 py-2">Bal.P</th>
                        <th className="text-right text-xs font-semibold text-expense uppercase px-4 py-2">Bal.I</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.entries.map((e, j) => (
                        <tr key={j} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-2 text-sm text-primary font-medium">{e.loanNo}</td>
                          <td className="px-4 py-2 text-sm text-foreground">{e.customer}</td>
                          <td className="px-4 py-2 text-sm text-right text-primary">₹{e.dP.toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm text-right text-primary">₹{e.dI.toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm text-right text-income">₹{e.rP.toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm text-right text-income">₹{e.rI.toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm text-right text-expense">{e.dP - e.rP > 0 ? `₹${(e.dP - e.rP).toLocaleString()}` : "—"}</td>
                          <td className="px-4 py-2 text-sm text-right text-expense">{e.dI - e.rI > 0 ? `₹${(e.dI - e.rI).toLocaleString()}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

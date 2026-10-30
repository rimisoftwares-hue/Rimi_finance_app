import { motion } from "framer-motion";
import { CreditCard, Search, Plus, Eye } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useState } from "react";

const loans = [
  { id: 1, loanNo: "OWN-0001", type: "OWN", customer: "Rajesh Kumar", vehicle: "Yamaha FZ-S", principal: 180000, rate: 24, emi: 15000, tenure: 12, paid: 6, status: "Active" },
  { id: 2, loanNo: "FR-0012", type: "FRANCHISE", customer: "Suresh Babu", vehicle: "Honda Activa 6G", principal: 120000, rate: 24, emi: 12000, tenure: 10, paid: 3, status: "Active" },
  { id: 3, loanNo: "OWN-0034", type: "OWN", customer: "Priya Devi", vehicle: "TVS Jupiter", principal: 95000, rate: 24, emi: 8500, tenure: 12, paid: 10, status: "Active" },
  { id: 4, loanNo: "OWN-0056", type: "OWN", customer: "Manoj Singh", vehicle: "Bajaj Pulsar 150", principal: 250000, rate: 24, emi: 12000, tenure: 24, paid: 8, status: "Overdue" },
  { id: 5, loanNo: "FR-0023", type: "FRANCHISE", customer: "Lakshmi Narasimhan", vehicle: "Royal Enfield Classic", principal: 350000, rate: 24, emi: 20000, tenure: 18, paid: 5, status: "Active" },
  { id: 6, loanNo: "OWN-0078", type: "OWN", customer: "Arun Prakash", vehicle: "Hero Splendor Plus", principal: 85000, rate: 24, emi: 8000, tenure: 12, paid: 7, status: "Active" },
  { id: 7, loanNo: "FR-0045", type: "FRANCHISE", customer: "Deepa Kumari", vehicle: "Honda Shine", principal: 110000, rate: 24, emi: 8500, tenure: 14, paid: 9, status: "Active" },
  { id: 8, loanNo: "OWN-0091", type: "OWN", customer: "Venkatesh Raman", vehicle: "TVS Apache RTR", principal: 280000, rate: 24, emi: 15000, tenure: 20, paid: 4, status: "NPA" },
];

const typeColors: Record<string, string> = {
  OWN: "bg-primary/10 text-primary",
  FRANCHISE: "bg-income/10 text-income",
};

const statusColors: Record<string, string> = {
  Active: "badge-success",
  Overdue: "badge-warning",
  NPA: "badge-destructive",
  Closed: "badge-default",
};

export default function Loans() {
  const [searchTerm, setSearchTerm] = useState("");
  const filtered = loans.filter(l =>
    l.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.loanNo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Loans</h1>
          <p className="text-muted-foreground mt-1">All loan accounts — OWN & FRANCHISE</p>
        </div>
        <Button className="gap-2" style={{ background: "var(--gradient-primary)" }}>
          <Plus className="h-4 w-4" /> New Loan
        </Button>
      </motion.div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Loans", value: 8, color: "border-t-primary" },
          { label: "OWN Loans", value: 5, color: "border-t-primary" },
          { label: "Franchise Loans", value: 3, color: "border-t-income" },
          { label: "Total Portfolio", value: "₹14.7L", color: "border-t-warning" },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className={`dashboard-card border-t-4 ${item.color}`}>
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{item.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div className="dashboard-card">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or loan number..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Loan No", "Type", "Customer", "Vehicle", "Principal", "Rate", "EMI", "Progress", "Status", "Action"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((loan, i) => (
                <motion.tr key={loan.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 * i }} className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-sm font-medium text-primary">{loan.loanNo}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${typeColors[loan.type]}`}>{loan.type}</span></td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{loan.customer}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{loan.vehicle}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">₹{loan.principal.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{loan.rate}%</td>
                  <td className="px-4 py-3 text-sm text-foreground">₹{loan.emi.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(loan.paid / loan.tenure) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{loan.paid}/{loan.tenure}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={statusColors[loan.status]}>{loan.status}</span></td>
                  <td className="px-4 py-3"><Button size="sm" variant="ghost" className="gap-1 text-xs"><Eye className="h-3 w-3" /> View</Button></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

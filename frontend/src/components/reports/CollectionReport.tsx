import { motion } from "framer-motion";
import { Receipt, Search } from "lucide-react";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import { useState } from "react";

const collections = [
  { id: 1, date: "2025-02-26", loanNo: "OWN-0001", customer: "Rajesh Kumar", emiNo: 7, amount: 15000, mode: "Cash", collector: "Raju" },
  { id: 2, date: "2025-02-26", loanNo: "FR-0012", customer: "Suresh Babu", emiNo: 4, amount: 8500, mode: "UPI", collector: "Admin" },
  { id: 3, date: "2025-02-25", loanNo: "OWN-0034", customer: "Priya Devi", emiNo: 11, amount: 12000, mode: "Bank Transfer", collector: "Priya" },
  { id: 4, date: "2025-02-25", loanNo: "FR-0023", customer: "Lakshmi Narasimhan", emiNo: 6, amount: 20000, mode: "Cash", collector: "Raju" },
  { id: 5, date: "2025-02-24", loanNo: "OWN-0078", customer: "Arun Prakash", emiNo: 8, amount: 8000, mode: "UPI", collector: "Admin" },
  { id: 6, date: "2025-02-24", loanNo: "FR-0045", customer: "Deepa Kumari", emiNo: 10, amount: 8500, mode: "Cash", collector: "Raju" },
  { id: 7, date: "2025-02-23", loanNo: "OWN-0001", customer: "Rajesh Kumar", emiNo: 6, amount: 15000, mode: "Bank Transfer", collector: "Admin" },
  { id: 8, date: "2025-02-23", loanNo: "OWN-0056", customer: "Manoj Singh", emiNo: 9, amount: 12000, mode: "Cash", collector: "Priya" },
];

const modeColors: Record<string, string> = {
  Cash: "badge-success",
  UPI: "bg-primary/10 text-primary",
  "Bank Transfer": "bg-accent text-accent-foreground",
};

export default function CollectionReport() {
  const [search, setSearch] = useState("");
  const filtered = collections.filter(c => c.customer.toLowerCase().includes(search.toLowerCase()) || c.loanNo.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Collection Report</h1>
        <p className="text-muted-foreground mt-1">Daily EMI collection records</p>
      </motion.div>

      <div className="dashboard-card flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <DatePicker className="max-w-xs" defaultValue="2025-02-26" />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Date", "Loan No", "Customer", "EMI #", "Amount", "Mode", "Collector"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * i }} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-muted-foreground">{c.date}</td>
                  <td className="px-4 py-3 text-sm text-primary font-medium">{c.loanNo}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{c.customer}</td>
                  <td className="px-4 py-3 text-sm text-foreground text-center">{c.emiNo}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-income">₹{c.amount.toLocaleString()}</td>
                  <td className="px-4 py-3"><span className={modeColors[c.mode]}>{c.mode}</span></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{c.collector}</td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/50 font-bold">
                <td colSpan={4} className="px-4 py-3 text-sm text-foreground">Total</td>
                <td className="px-4 py-3 text-sm text-income">₹{filtered.reduce((s, c) => s + c.amount, 0).toLocaleString()}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

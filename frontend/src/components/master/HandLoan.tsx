import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { TablePagination } from "../common";
import { useClientPagination } from "../../hooks/useClientPagination";

interface HandLoanEntry {
  id: number;
  hplNo: string;
  customerName: string;
  amount: number;
  reason: string;
  date: string;
  status: string;
}

const mockData: HandLoanEntry[] = [
  { id: 1, hplNo: "HPL 931", customerName: "SELVA PRABU", amount: 5000, reason: "Seizing Charges", date: "2026-03-15", status: "Pending" },
  { id: 2, hplNo: "HPL 845", customerName: "MURUGAN S", amount: 12000, reason: "Vehicle Repair", date: "2026-03-10", status: "Included" },
  { id: 3, hplNo: "HPL 720", customerName: "KARTHIK R", amount: 3500, reason: "Document Charges", date: "2026-03-08", status: "Paid" },
  { id: 4, hplNo: "HPL 612", customerName: "LAKSHMI N", amount: 8000, reason: "Seizing Charges", date: "2026-02-28", status: "Pending" },
  { id: 5, hplNo: "HPL 503", customerName: "ANAND K", amount: 15000, reason: "Vehicle Repair", date: "2026-02-20", status: "Included" },
];

const reasons = ["Seizing Charges", "Vehicle Repair", "Document Charges", "Legal Charges", "Transport Charges", "Other"];

export default function HandLoan() {
  const [data, setData] = useState(mockData);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<Partial<HandLoanEntry>>({});

  const filtered = useMemo(
    () =>
      data.filter(
        (d) =>
          d.hplNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.customerName.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [data, searchTerm]
  );

  const {
    paginatedItems,
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  } = useClientPagination(filtered, { initialPageSize: 15, resetKey: searchTerm });

  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);
  const pendingAmount = data.filter((d) => d.status === "Pending").reduce((sum, d) => sum + d.amount, 0);

  const addEntry = () => {
    if (form.hplNo && form.amount) {
      setData([...data, { ...form, id: Date.now(), status: "Pending" } as HandLoanEntry]);
      setForm({});
      setShowDialog(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "Paid") return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    if (s === "Included") return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Hand Loan</h1>
          <p className="text-muted-foreground mt-1 text-sm">Record and track internal hand loans and cash borrowings</p>
        </div>
        <Button size="sm" onClick={() => { setForm({}); setShowDialog(true); }}><Plus className="h-4 w-4 mr-1" />Add Entry</Button>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total Hand Loans</p><p className="text-xl font-bold text-foreground">₹{totalAmount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Pending Amount</p><p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">₹{pendingAmount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total Entries</p><p className="text-xl font-bold text-foreground">{data.length}</p></CardContent></Card>
      </div>

      <div className="dashboard-card !p-4 hover:translate-y-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search HPL No or Customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">HPL No</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Customer</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Amount</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Reason</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Date</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No hand loan entries found
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-primary">{item.hplNo}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">{item.customerName}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-medium text-foreground">₹{item.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.reason}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.date}</td>
                    <td className="px-4 py-3 text-sm"><Badge variant="outline" className={`text-xs ${statusColor(item.status)}`}>{item.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Hand Loan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">HPL No</Label><Input placeholder="HPL 931" value={form.hplNo || ""} onChange={(e) => setForm({ ...form, hplNo: e.target.value })} /></div>
            <div><Label className="text-xs">Customer Name</Label><Input value={form.customerName || ""} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
            <div><Label className="text-xs">Amount (₹)</Label><Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Select value={form.reason || ""} onValueChange={(v) => setForm({ ...form, reason: v })}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>{reasons.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs mb-1 block">Date</Label><DatePicker value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="Date" /></div>
            <Button onClick={addEntry} className="w-full">Add Hand Loan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

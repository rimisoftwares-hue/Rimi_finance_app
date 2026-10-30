import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";

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

  const filtered = data.filter((d) =>
    d.hplNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    if (s === "Paid") return "bg-green-500/10 text-green-600 border-green-500/20";
    if (s === "Included") return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hand Loan</h1>
          <p className="text-sm text-muted-foreground">Track extra expenses given to customers</p>
        </div>
        <Button size="sm" onClick={() => { setForm({}); setShowDialog(true); }}><Plus className="h-4 w-4 mr-1" />Add Entry</Button>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total Hand Loans</p><p className="text-xl font-bold text-foreground">₹{totalAmount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Pending Amount</p><p className="text-xl font-bold text-yellow-600">₹{pendingAmount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total Entries</p><p className="text-xl font-bold text-foreground">{data.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search HPL No or Customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">HPL No</TableHead>
                <TableHead className="text-xs">Customer</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/50">
                  <TableCell className="text-xs font-mono text-primary">{item.hplNo}</TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">{item.customerName}</TableCell>
                  <TableCell className="text-sm text-right font-mono font-medium">₹{item.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.reason}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.date}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-xs ${statusColor(item.status)}`}>{item.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

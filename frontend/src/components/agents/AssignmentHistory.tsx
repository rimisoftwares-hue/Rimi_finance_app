import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CapitalizedInput } from "../common/CapitalizedInput";
import { DatePicker } from "../ui/date-picker";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Search, Calendar, Eye, RefreshCw, CheckCircle2, Clock, XCircle, AlertTriangle, Download } from "lucide-react";

const mockHistory = [
  { id: 1, date: "2026-04-05 10:30", agentName: "Suresh Kumar", customerName: "SELVA PRABU", hplNo: "HPL 931", assignedBy: "Admin", status: "pending" as const, priority: "high", area: "Anna Nagar", dueAmount: 15200, notes: "Urgent collection needed" },
  { id: 2, date: "2026-04-05 09:15", agentName: "Ramesh S", customerName: "MURUGAN K", hplNo: "HPL 932", assignedBy: "Admin", status: "visited" as const, priority: "medium", area: "T Nagar", dueAmount: 8500, notes: "Customer requested callback" },
  { id: 3, date: "2026-04-04 16:45", agentName: "Vijay R", customerName: "LAKSHMI S", hplNo: "HPL 933", assignedBy: "Manager", status: "collected" as const, priority: "high", area: "Velachery", dueAmount: 22000, notes: "Full amount collected" },
  { id: 4, date: "2026-04-04 14:20", agentName: "Ganesh M", customerName: "RAJESH M", hplNo: "HPL 934", assignedBy: "Admin", status: "failed" as const, priority: "low", area: "Tambaram", dueAmount: 5000, notes: "Customer not available" },
  { id: 5, date: "2026-04-04 11:00", agentName: "Suresh Kumar", customerName: "PRIYA V", hplNo: "HPL 935", assignedBy: "Admin", status: "visited" as const, priority: "medium", area: "Porur", dueAmount: 18500, notes: "Partial payment promised" },
  { id: 6, date: "2026-04-03 15:30", agentName: "Ramesh S", customerName: "KARTHIK R", hplNo: "HPL 936", assignedBy: "Manager", status: "collected" as const, priority: "high", area: "Adyar", dueAmount: 32000, notes: "EMI paid via UPI" },
  { id: 7, date: "2026-04-03 10:00", agentName: "Vijay R", customerName: "DEEPA N", hplNo: "HPL 937", assignedBy: "Admin", status: "pending" as const, priority: "low", area: "Chrompet", dueAmount: 7800, notes: "" },
  { id: 8, date: "2026-04-02 09:30", agentName: "Ganesh M", customerName: "ARUN P", hplNo: "HPL 938", assignedBy: "Admin", status: "failed" as const, priority: "high", area: "Avadi", dueAmount: 25000, notes: "Door locked, neighbor says out of town" },
];

const statusConfig = {
  pending: { label: "Pending", icon: Clock, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  visited: { label: "Visited", icon: CheckCircle2, color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  collected: { label: "Collected", icon: CheckCircle2, color: "bg-green-500/10 text-green-600 border-green-500/20" },
  failed: { label: "Failed", icon: XCircle, color: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function AssignmentHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailItem, setDetailItem] = useState<(typeof mockHistory)[0] | null>(null);

  const filtered = useMemo(() => {
    return mockHistory.filter((h) => {
      const s = searchTerm.toLowerCase();
      if (s && !h.customerName.toLowerCase().includes(s) && !h.hplNo.toLowerCase().includes(s) && !h.agentName.toLowerCase().includes(s)) return false;
      if (statusFilter !== "all" && h.status !== statusFilter) return false;
      if (agentFilter !== "all" && h.agentName !== agentFilter) return false;
      if (dateFrom && h.date < dateFrom) return false;
      if (dateTo && h.date > dateTo + " 23:59") return false;
      return true;
    });
  }, [searchTerm, statusFilter, agentFilter, dateFrom, dateTo]);

  const kpis = [
    { label: "Total Assignments", value: mockHistory.length, icon: RefreshCw, color: "text-primary" },
    { label: "Pending", value: mockHistory.filter((h) => h.status === "pending").length, icon: Clock, color: "text-yellow-500" },
    { label: "Collected", value: mockHistory.filter((h) => h.status === "collected").length, icon: CheckCircle2, color: "text-green-500" },
    { label: "Failed", value: mockHistory.filter((h) => h.status === "failed").length, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assignment History</h1>
          <p className="text-sm text-muted-foreground">Track all customer-agent assignments</p>
        </div>
        <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />Export</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}><kpi.icon className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold text-foreground">{kpi.value}</p><p className="text-xs text-muted-foreground">{kpi.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <CapitalizedInput casing="none" placeholder="Search customer, HPL, agent..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="visited">Visited</SelectItem>
                <SelectItem value="collected">Collected</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {[...new Set(mockHistory.map((h) => h.agentName))].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <DatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From Date" className="w-36" />
              <span className="text-xs text-muted-foreground">to</span>
              <DatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To Date" className="w-36" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[55vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>HPL No</TableHead>
                  <TableHead>Assigned By</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((h, i) => {
                  const sc = statusConfig[h.status];
                  return (
                    <motion.tr key={h.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="border-b transition-colors hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{h.date}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{h.agentName}</TableCell>
                      <TableCell className="text-sm">{h.customerName}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{h.hplNo}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.assignedBy}</TableCell>
                      <TableCell className="text-right font-semibold text-sm">₹{h.dueAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[10px] ${sc.color}`}>
                          <sc.icon className="h-2.5 w-2.5 mr-0.5" />{sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailItem(h)}><Eye className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assignment Details</DialogTitle>
            <DialogDescription>{detailItem?.hplNo} — {detailItem?.customerName}</DialogDescription>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3">
              {[
                ["Date", detailItem.date],
                ["Agent", detailItem.agentName],
                ["Customer", detailItem.customerName],
                ["HPL No", detailItem.hplNo],
                ["Area", detailItem.area],
                ["Priority", detailItem.priority],
                ["Assigned By", detailItem.assignedBy],
                ["Due Amount", `₹${detailItem.dueAmount.toLocaleString()}`],
                ["Status", detailItem.status],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm border-b border-border pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium text-foreground">{v}</span>
                </div>
              ))}
              {detailItem.notes && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{detailItem.notes}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1"><RefreshCw className="h-3 w-3 mr-1" />Reassign</Button>
                <Button size="sm" className="flex-1"><Eye className="h-3 w-3 mr-1" />View Customer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

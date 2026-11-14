import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, AlertTriangle, FileWarning } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { TablePagination } from "../common";
import { useClientPagination } from "../../hooks/useClientPagination";

interface BadDebtEntry {
  id: number;
  hplNo: string;
  customerName: string;
  phone: string;
  vehicleNumber: string;
  loanAmount: number;
  outstandingAmount: number;
  lastPaymentDate: string;
  defaultDays: number;
  status: string;
}

const mockData: BadDebtEntry[] = [
  { id: 1, hplNo: "HPL 445", customerName: "RAVI KUMAR", phone: "9876543210", vehicleNumber: "TN38 AB 1234", loanAmount: 250000, outstandingAmount: 185000, lastPaymentDate: "2025-11-15", defaultDays: 127, status: "Write-off" },
  { id: 2, hplNo: "HPL 312", customerName: "SENTHIL M", phone: "9123456789", vehicleNumber: "TN43 CD 5678", loanAmount: 180000, outstandingAmount: 142000, lastPaymentDate: "2025-12-01", defaultDays: 110, status: "Legal" },
  { id: 3, hplNo: "HPL 278", customerName: "GANESH P", phone: "9988776655", vehicleNumber: "TN38 EF 9012", loanAmount: 320000, outstandingAmount: 267000, lastPaymentDate: "2025-10-20", defaultDays: 152, status: "Police Case" },
  { id: 4, hplNo: "HPL 567", customerName: "KUMAR S", phone: "8877665544", vehicleNumber: "TN38 GH 3456", loanAmount: 150000, outstandingAmount: 98000, lastPaymentDate: "2026-01-05", defaultDays: 75, status: "Legal" },
  { id: 5, hplNo: "HPL 189", customerName: "VELU R", phone: "9556677889", vehicleNumber: "TN43 JK 7890", loanAmount: 420000, outstandingAmount: 350000, lastPaymentDate: "2025-09-10", defaultDays: 192, status: "Write-off" },
];

export default function BadDebts() {
  const [data] = useState(mockData);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(
    () =>
      data.filter((d) => {
        if (statusFilter && statusFilter !== "all" && d.status !== statusFilter) return false;
        if (searchTerm) {
          const s = searchTerm.toLowerCase();
          return (
            d.hplNo.toLowerCase().includes(s) ||
            d.customerName.toLowerCase().includes(s) ||
            d.phone.includes(s) ||
            d.vehicleNumber.toLowerCase().includes(s)
          );
        }
        return true;
      }),
    [data, searchTerm, statusFilter]
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
  } = useClientPagination(filtered, {
    initialPageSize: 15,
    resetKey: `${searchTerm}|${statusFilter}`,
  });

  const totalOutstanding = data.reduce((sum, d) => sum + d.outstandingAmount, 0);

  const statusColor = (s: string) => {
    if (s === "Write-off") return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    if (s === "Legal") return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileWarning className="h-6 w-6 text-destructive" />Bad Debts
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Track written-off accounts, defaulting loans, and debt recovery</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total Cases</p><p className="text-xl font-bold text-foreground">{data.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-xl font-bold text-destructive">₹{totalOutstanding.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Write-off</p><p className="text-xl font-bold text-red-600 dark:text-red-400">{data.filter((d) => d.status === "Write-off").length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Legal Cases</p><p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{data.filter((d) => d.status === "Legal").length}</p></CardContent></Card>
      </div>

      <div className="dashboard-card !p-4 hover:translate-y-0 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search HPL, Customer, Phone, Vehicle..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Write-off">Write-off</SelectItem>
            <SelectItem value="Legal">Legal</SelectItem>
            <SelectItem value="Police Case">Police Case</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">HPL No</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Customer</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Phone</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Vehicle</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Loan Amt</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Outstanding</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Last Payment</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Default Days</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No bad debt entries found
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-primary">{item.hplNo}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">{item.customerName}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{item.phone}</td>
                    <td className="px-4 py-3 text-xs font-mono text-foreground">{item.vehicleNumber}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-foreground">₹{item.loanAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-medium text-destructive">₹{item.outstandingAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.lastPaymentDate}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <Badge variant={item.defaultDays > 120 ? "destructive" : "secondary"} className="text-xs">
                        {item.defaultDays > 120 && <AlertTriangle className="h-3 w-3 mr-1" />}{item.defaultDays}d
                      </Badge>
                    </td>
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
    </div>
  );
}

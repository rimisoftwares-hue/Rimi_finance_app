import { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Download, Printer, Copy, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { DatePicker } from "../ui/date-picker";
import { AppSelect, TablePagination, TableSkeletonRows } from "../common";
import { useClientPagination } from "../../hooks/useClientPagination";
import apiClient from "../../api/apiClient";
import { useToast } from "../../hooks/use-toast";

interface BillRecord {
  id: string | number;
  receiptNo: string;
  hpAcNo: string;
  customer: string;
  status: string;
  date: string;
  total: number;
  principal: number;
  interest: number;
  penalty: number;
  mode: string;
  createdBy: string;
  createdTime: string;
  alteredBy: string;
  alteredTime: string;
  cancelledBy: string;
}

const statusBadge: Record<string, string> = {
  Paid: "badge-success",
  Partial: "badge-warning",
  Pending: "badge-pending",
  Cancelled: "bg-expense/10 text-expense",
};

const getDefaultDates = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${day}`,
  };
};

export default function Bill() {
  const defaultDates = useMemo(() => getDefaultDates(), []);
  const [fromDate, setFromDate] = useState(defaultDates.from);
  const [toDate, setToDate] = useState(defaultDates.to);
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/payments/bill-report', {
        params: {
          fromDate,
          toDate,
          status: statusFilter,
          search: search.trim() || undefined,
        },
      });
      if (res.data?.success && Array.isArray(res.data?.data)) {
        setBills(res.data.data);
      } else {
        setBills([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch bill report:', err);
      setError(err?.response?.data?.error || 'Failed to fetch bill report');
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, statusFilter, search]);

  useEffect(() => {
    fetchBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return bills.filter(b => {
      if (statusFilter !== "All" && b.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (fromDate && b.date < fromDate) return false;
      if (toDate && b.date > toDate) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !b.customer.toLowerCase().includes(q) &&
          !b.hpAcNo.toLowerCase().includes(q) &&
          !b.receiptNo.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [bills, fromDate, toDate, statusFilter, search]);

  const {
    paginatedItems: paginatedBills,
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  } = useClientPagination(filtered, { initialPageSize: 15 });

  const totals = useMemo(() => {
    return filtered
      .filter(r => r.status !== 'Cancelled')
      .reduce((a, r) => ({
        total: a.total + (Number(r.total) || 0),
        principal: a.principal + (Number(r.principal) || 0),
        interest: a.interest + (Number(r.interest) || 0),
        penalty: a.penalty + (Number(r.penalty) || 0),
      }), { total: 0, principal: 0, interest: 0, penalty: 0 });
  }, [filtered]);

  const fmt = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCopy = async () => {
    try {
      const headers = [
        "Receipt No",
        "HPL No",
        "Customer",
        "Status",
        "Date",
        "Total",
        "Principal",
        "Interest",
        "Penalty",
        "Mode",
        "Created By"
      ];
      const rows = filtered.map(r => [
        r.receiptNo,
        r.hpAcNo,
        r.customer,
        r.status,
        r.date,
        r.total,
        r.principal,
        r.interest,
        r.penalty,
        r.mode,
        r.createdBy
      ].join("\t"));

      const tsv = [headers.join("\t"), ...rows].join("\n");
      await navigator.clipboard.writeText(tsv);
      toast({
        title: "Copied to clipboard",
        description: `${filtered.length} record(s) copied as TSV`,
      });
    } catch (err) {
      console.error("Failed to copy:", err);
      toast({
        title: "Failed to copy",
        description: "Could not copy data to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleCsv = () => {
    try {
      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };

      const headers = [
        "Receipt No",
        "HPL No",
        "Customer",
        "Status",
        "Date",
        "Total",
        "Principal",
        "Interest",
        "Penalty",
        "Mode",
        "Created By"
      ];

      const rows = filtered.map(r => [
        escapeCsv(r.receiptNo),
        escapeCsv(r.hpAcNo),
        escapeCsv(r.customer),
        escapeCsv(r.status),
        escapeCsv(r.date),
        escapeCsv(r.total),
        escapeCsv(r.principal),
        escapeCsv(r.interest),
        escapeCsv(r.penalty),
        escapeCsv(r.mode),
        escapeCsv(r.createdBy)
      ].join(","));

      const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Bill_Report_${fromDate || "all"}_to_${toDate || "all"}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "CSV Downloaded",
        description: `Exported ${filtered.length} record(s)`,
      });
    } catch (err) {
      console.error("Failed to export CSV:", err);
      toast({
        title: "Export Failed",
        description: "Could not export CSV file",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Bill Report</h1>
          <p className="text-muted-foreground mt-1 text-sm">Receipt-wise billing breakdown with status tracking</p>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card !p-4 hover:translate-y-0">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">From Date</label>
            <DatePicker value={fromDate} onChange={e => setFromDate(e.target.value)} placeholder="From Date" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">To Date</label>
            <DatePicker value={toDate} onChange={e => setToDate(e.target.value)} placeholder="To Date" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <AppSelect
              value={statusFilter}
              onValueChange={setStatusFilter}
              triggerClassName="w-[140px]"
              options={[
                { value: "All", label: "All" },
                { value: "Paid", label: "Paid" },
                { value: "Partial", label: "Partial" },
                { value: "Pending", label: "Pending" },
                { value: "Cancelled", label: "Cancelled" },
              ]}
            />
          </div>
          <Button size="sm" className="gap-2" style={{ background: "var(--gradient-primary)" }} onClick={fetchBills}>Show</Button>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                className="input-field text-sm py-2 pl-9 w-48"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}><Copy className="h-3.5 w-3.5" /> Copy</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCsv}><Download className="h-3.5 w-3.5" /> CSV</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}><Printer className="h-3.5 w-3.5" /> Print</Button>
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                {["Receipt No", "HPL No", "Customer", "Status", "Date", "Total", "Principal", "Interest", "Penalty", "Mode", "Options", "Created By", "Altered By"].map(h => {
                  const isNumeric = ["Total", "Principal", "Interest", "Penalty"].includes(h);
                  return (
                    <th key={h} className={`${isNumeric ? "text-right" : "text-left"} text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 whitespace-nowrap`}>{h}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <TableSkeletonRows columns={13} rows={6} />
              ) : error ? (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-center text-sm text-expense">{error}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-center text-sm text-muted-foreground">No records found</td>
                </tr>
              ) : (
                paginatedBills.map((r, i) => (
                  <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * i }} className="hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{r.receiptNo}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{r.hpAcNo}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{r.customer}</td>
                    <td className="px-4 py-3 text-sm"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge[r.status] || ""}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{r.date}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">₹{fmt(r.total)}</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">₹{fmt(r.principal)}</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">₹{fmt(r.interest)}</td>
                    <td className="px-4 py-3 text-sm text-warning text-right">{r.penalty > 0 ? `₹${fmt(r.penalty)}` : "—"}</td>
                    <td className="px-4 py-3 text-sm"><Badge variant={r.mode === "Cash" ? "default" : "secondary"} className="text-xs">{r.mode}</Badge></td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-xs text-muted-foreground">—</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="text-sm font-medium text-foreground">{r.createdBy || "—"}</div>
                      {r.createdTime && <div className="text-xs text-muted-foreground">{r.createdTime}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {r.status === "Cancelled" && r.cancelledBy ? (
                        <div>
                          <div className="text-sm font-medium text-expense">Cancelled by {r.cancelledBy}</div>
                        </div>
                      ) : r.alteredBy ? (
                        <div>
                          <div className="text-sm font-medium text-foreground">{r.alteredBy}</div>
                          {r.alteredTime && <div className="text-xs text-muted-foreground">{r.alteredTime}</div>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
            {!loading && !error && filtered.length > 0 && (
              <tfoot className="bg-secondary/60 border-t-2 border-border font-bold">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm text-foreground">Total ({filtered.length} records)</td>
                  <td className="px-4 py-3 text-sm text-foreground text-right font-bold">₹{fmt(totals.total)}</td>
                  <td className="px-4 py-3 text-sm text-foreground text-right font-bold">₹{fmt(totals.principal)}</td>
                  <td className="px-4 py-3 text-sm text-foreground text-right font-bold">₹{fmt(totals.interest)}</td>
                  <td className="px-4 py-3 text-sm text-warning text-right font-bold">₹{fmt(totals.penalty)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!loading && !error && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            disabled={loading}
          />
        )}
      </motion.div>
    </div>
  );
}

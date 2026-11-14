import { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Clock, Download, Printer, Copy, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import { TablePagination, TableSkeletonRows } from "../common";
import { useClientPagination } from "../../hooks/useClientPagination";
import apiClient from "../../api/apiClient";
import { useToast } from "../../hooks/use-toast";

interface ComplianceItem {
  id: string | number;
  customer: string;
  loanNo: string;
  vehicle: string;
  type: string;
  expiryDate: string;
  status: "Expired" | "Expiring Soon" | "Valid" | string;
}

const statusStyles: Record<string, { className: string; icon: React.ElementType }> = {
  Valid: { className: "badge-success", icon: CheckCircle },
  "Expiring Soon": { className: "badge-warning", icon: Clock },
  Expired: { className: "badge-destructive", icon: AlertTriangle },
};

type FilterMode = "All" | "Customer" | "Vehicle";

export default function Compliance() {
  const [filterMode, setFilterMode] = useState<FilterMode>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchCompliance = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get("/reports/compliance", {
        params: {
          mode: filterMode,
          search: searchTerm.trim() || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        },
      });

      if (res.data?.success && Array.isArray(res.data?.data)) {
        setItems(res.data.data);
      } else {
        setItems([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch compliance records:", err);
      setError(err?.response?.data?.message || err?.response?.data?.error || "Failed to fetch compliance records");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterMode, searchTerm, fromDate, toDate]);

  useEffect(() => {
    fetchCompliance();
  }, [fetchCompliance]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.trim().toLowerCase();
    if (filterMode === "Customer") {
      return items.filter(item => item.customer.toLowerCase().includes(term) || item.loanNo.toLowerCase().includes(term));
    }
    if (filterMode === "Vehicle") {
      return items.filter(item => item.vehicle.toLowerCase().includes(term));
    }
    return items.filter(
      item =>
        item.customer.toLowerCase().includes(term) ||
        item.vehicle.toLowerCase().includes(term) ||
        item.loanNo.toLowerCase().includes(term)
    );
  }, [items, searchTerm, filterMode]);

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
    resetKey: `${filterMode}|${searchTerm}`,
  });

  const counts = useMemo(
    () => ({
      expired: filtered.filter(i => i.status === "Expired").length,
      expiring: filtered.filter(i => i.status === "Expiring Soon").length,
      valid: filtered.filter(i => i.status === "Valid").length,
    }),
    [filtered]
  );

  const handleCopy = async () => {
    try {
      const headers = ["Customer", "HP Number", "Vehicle", "Type", "Expiry Date", "Status"];
      const rows = filtered.map(r =>
        [r.customer, r.loanNo || "—", r.vehicle, r.type, r.expiryDate, r.status].join("\t")
      );
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

      const headers = ["Customer", "HP Number", "Vehicle", "Type", "Expiry Date", "Status"];
      const rows = filtered.map(r =>
        [
          escapeCsv(r.customer),
          escapeCsv(r.loanNo || "—"),
          escapeCsv(r.vehicle),
          escapeCsv(r.type),
          escapeCsv(r.expiryDate),
          escapeCsv(r.status),
        ].join(",")
      );

      const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const todayStr = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `Compliance_Report_${todayStr}.csv`);
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Compliance</h1>
          <p className="text-muted-foreground mt-1 text-sm">Insurance & FC expiry tracking</p>
        </div>
      </motion.div>

      {/* Filter Buttons + Search */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card !p-4 hover:translate-y-0">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
            {(["All", "Customer", "Vehicle"] as FilterMode[]).map(mode => (
              <Button
                key={mode}
                size="sm"
                variant={filterMode === mode ? "default" : "ghost"}
                className="text-xs"
                onClick={() => setFilterMode(mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
          <div>
            <DatePicker value={fromDate} onChange={e => setFromDate(e.target.value)} placeholder="From Date" />
          </div>
          <div>
            <DatePicker value={toDate} onChange={e => setToDate(e.target.value)} placeholder="To Date" />
          </div>
          <Button size="sm" className="gap-2" style={{ background: "var(--gradient-primary)" }} onClick={fetchCompliance}>
            Show
          </Button>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${filterMode === "Customer" ? "customer or HP number" : filterMode === "Vehicle" ? "vehicle" : "..."}`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCsv}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Expired", value: counts.expired, icon: AlertTriangle, color: "border-t-expense" },
          { label: "Expiring Soon", value: counts.expiring, icon: Clock, color: "border-t-warning" },
          { label: "Valid", value: counts.valid, icon: CheckCircle, color: "border-t-income" },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className={`dashboard-card border-t-4 ${item.color}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{item.value}</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary"><item.icon className="h-5 w-5 text-muted-foreground" /></div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                {["Customer", "HP Number", "Vehicle", "Type", "Expiry Date", "Status"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <TableSkeletonRows columns={6} rows={6} />
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-expense">{error}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No records found</td>
                </tr>
              ) : (
                paginatedItems.map((item, i) => {
                  const st = statusStyles[item.status] || { className: "badge-pending", icon: Clock };
                  return (
                    <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 * i }} className="hover:bg-secondary/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{item.customer}</td>
                      <td className="px-4 py-3 text-sm text-primary font-medium">{item.loanNo}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.vehicle}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{item.type}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.expiryDate}</td>
                      <td className="px-4 py-3 text-sm"><span className={`${st.className} inline-flex items-center gap-1`}><st.icon className="h-3 w-3" /> {item.status}</span></td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
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

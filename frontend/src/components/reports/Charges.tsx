import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, ChevronDown, ChevronUp, RotateCcw, Search, Download, Printer, Copy } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import { AppSelect, TableSkeletonRows } from "../common";
import apiClient from "../../api/apiClient";

const DEAL_TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "Consulting", label: "Consulting" },
  { value: "Finance", label: "Finance" },
];
import { useToast } from "../../hooks/use-toast";

interface ChargeRecord {
  id: string | number;
  loanNo: string;
  customer: string;
  docCharges: number;
  processingFee: number;
  penalty: number;
  seizingCharges: number;
  total: number;
  date: string;
  street: string;
  village: string;
  city: string;
  dealType: string;
}

const initialFilters = {
  dateFrom: "",
  dateTo: "",
  customer: "",
  loanNo: "",
  amountMin: "",
  amountMax: "",
  street: "",
  village: "",
  city: "",
  dealType: "",
};

export default function Charges() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [charges, setCharges] = useState<ChargeRecord[]>([]);
  const [filterOptions, setFilterOptions] = useState<{ streets: string[]; villages: string[]; cities: string[] }>({
    streets: [],
    villages: [],
    cities: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFilter = (key: string, val: string) => setFilters(p => ({ ...p, [key]: val }));
  const clearFilters = () => setFilters(initialFilters);

  const fetchCharges = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get("/reports/charges", {
        params: {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          customer: filters.customer.trim() || undefined,
          loanNo: filters.loanNo.trim() || undefined,
          amountMin: filters.amountMin !== "" ? filters.amountMin : undefined,
          amountMax: filters.amountMax !== "" ? filters.amountMax : undefined,
          street: filters.street.trim() || undefined,
          village: filters.village.trim() || undefined,
          city: filters.city.trim() || undefined,
          dealType: filters.dealType || undefined,
        },
      });

      if (res.data?.success && Array.isArray(res.data?.data)) {
        setCharges(res.data.data);
        if (res.data.filters) {
          setFilterOptions({
            streets: Array.isArray(res.data.filters.streets) ? res.data.filters.streets : [],
            villages: Array.isArray(res.data.filters.villages) ? res.data.filters.villages : [],
            cities: Array.isArray(res.data.filters.cities) ? res.data.filters.cities : [],
          });
        }
      } else {
        setCharges([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch charges:", err);
      setError(err?.response?.data?.message || err?.response?.data?.error || "Failed to fetch charges");
      setCharges([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchCharges();
  }, [fetchCharges]);

  const filtered = charges;

  const totals = useMemo(() => {
    return filtered.reduce(
      (a, r) => ({
        doc: a.doc + (Number(r.docCharges) || 0),
        proc: a.proc + (Number(r.processingFee) || 0),
        late: a.late + (Number(r.penalty) || 0),
        seize: a.seize + (Number(r.seizingCharges) || 0),
        total: a.total + (Number(r.total) || 0),
      }),
      { doc: 0, proc: 0, late: 0, seize: 0, total: 0 }
    );
  }, [filtered]);

  const handleCopy = async () => {
    try {
      const headers = ["Loan No", "Customer", "Doc Charges", "Processing Fee", "Penalty", "Seizing Charges", "Total"];
      const rows = filtered.map(r =>
        [
          r.loanNo || "—",
          r.customer,
          r.docCharges,
          r.processingFee,
          r.penalty,
          r.seizingCharges,
          r.total,
        ].join("\t")
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

      const headers = ["Loan No", "Customer", "Doc Charges", "Processing Fee", "Penalty", "Seizing Charges", "Total"];
      const rows = filtered.map(r =>
        [
          escapeCsv(r.loanNo || "—"),
          escapeCsv(r.customer),
          escapeCsv(r.docCharges),
          escapeCsv(r.processingFee),
          escapeCsv(r.penalty),
          escapeCsv(r.seizingCharges),
          escapeCsv(r.total),
        ].join(",")
      );

      const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const todayStr = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `Charges_Report_${todayStr}.csv`);
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
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Charges Report</h1>
        <p className="text-muted-foreground mt-1">All charges and fees breakdown per loan</p>
      </motion.div>

      {/* Datalists for AutoSuggest */}
      <datalist id="charges-streets-list">
        {filterOptions.streets.map(s => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="charges-villages-list">
        {filterOptions.villages.map(v => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="charges-cities-list">
        {filterOptions.cities.map(c => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Filter Panel */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search customer..." value={filters.customer} onChange={e => handleFilter("customer", e.target.value)} className="pl-10" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} className="gap-2">
            <Filter className="h-4 w-4" /> Filters {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" className="gap-2" onClick={clearFilters}><RotateCcw className="h-4 w-4" /> Clear</Button>
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
        <AnimatePresence>
          {filtersOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Date (From)</label><DatePicker value={filters.dateFrom} onChange={e => handleFilter("dateFrom", e.target.value)} placeholder="From Date" /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Date (To)</label><DatePicker value={filters.dateTo} onChange={e => handleFilter("dateTo", e.target.value)} placeholder="To Date" /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Loan No</label><Input className="text-sm" value={filters.loanNo} onChange={e => handleFilter("loanNo", e.target.value)} placeholder="Search loan..." /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (Min)</label><Input type="number" className="text-sm" value={filters.amountMin} onChange={e => handleFilter("amountMin", e.target.value)} placeholder="0" /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (Max)</label><Input type="number" className="text-sm" value={filters.amountMax} onChange={e => handleFilter("amountMax", e.target.value)} placeholder="50000" /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Street</label><Input list="charges-streets-list" className="text-sm" value={filters.street} onChange={e => handleFilter("street", e.target.value)} placeholder="Street..." /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Village</label><Input list="charges-villages-list" className="text-sm" value={filters.village} onChange={e => handleFilter("village", e.target.value)} placeholder="Village..." /></div>
                <div><label className="text-xs font-medium text-muted-foreground mb-1 block">City</label><Input list="charges-cities-list" className="text-sm" value={filters.city} onChange={e => handleFilter("city", e.target.value)} placeholder="City..." /></div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Deal Type</label>
                  <AppSelect
                    value={filters.dealType}
                    onValueChange={val => handleFilter("dealType", val)}
                    options={DEAL_TYPE_OPTIONS}
                    placeholder="All"
                    triggerClassName="w-full"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Doc Charges", value: totals.doc },
          { label: "Processing Fee", value: totals.proc },
          { label: "Penalty", value: totals.late },
          { label: "Seizing Charges", value: totals.seize },
          { label: "Total Charges", value: totals.total },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="dashboard-card text-center">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-xl font-bold text-foreground mt-1">₹{item.value.toLocaleString("en-IN")}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Loan No", "Customer", "Doc Charges", "Processing Fee", "Penalty", "Seizing Charges", "Total"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeletonRows columns={7} rows={6} />
              ) : error ? (
                <tr className="border-b border-border/50">
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-expense">{error}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr className="border-b border-border/50">
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">No records found</td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <motion.tr key={r.id || `${r.loanNo}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * i }} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-primary font-medium">{r.loanNo || "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{r.customer}</td>
                    <td className="px-4 py-3 text-sm text-foreground">₹{Number(r.docCharges || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-sm text-foreground">₹{Number(r.processingFee || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-sm text-warning">₹{Number(r.penalty || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-sm text-expense">{r.seizingCharges > 0 ? `₹${Number(r.seizingCharges).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3 text-sm font-bold text-foreground">₹{Number(r.total || 0).toLocaleString("en-IN")}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
            {!loading && !error && filtered.length > 0 && (
              <tfoot>
                <tr className="bg-secondary/50 font-bold">
                  <td colSpan={2} className="px-4 py-3 text-sm text-foreground">Total</td>
                  <td className="px-4 py-3 text-sm text-foreground">₹{totals.doc.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-sm text-foreground">₹{totals.proc.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-sm text-warning">₹{totals.late.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-sm text-expense">₹{totals.seize.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-sm text-foreground">₹{totals.total.toLocaleString("en-IN")}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </motion.div>
    </div>
  );
}

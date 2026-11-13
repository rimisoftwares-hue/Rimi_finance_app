import { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Download, Printer, Copy, Search } from "lucide-react";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { TableSkeletonRows } from "../common";
import apiClient from "../../api/apiClient";
import { useToast } from "../../hooks/use-toast";

interface BalanceRow {
  customer: string;
  loanNo: string;
  total: number;
  received: number;
  balance: number;
}

interface BalanceData {
  principal: BalanceRow[];
  interest: BalanceRow[];
  penalty: BalanceRow[];
  seizing: BalanceRow[];
}

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

function BalanceTable({
  data,
  loading,
  error,
}: {
  data: BalanceRow[];
  loading: boolean;
  error: string | null;
}) {
  const totals = useMemo(
    () =>
      data.reduce(
        (acc, r) => ({
          total: acc.total + r.total,
          received: acc.received + r.received,
          balance: acc.balance + r.balance,
        }),
        { total: 0, received: 0, balance: 0 }
      ),
    [data]
  );

  return (
    <div className="dashboard-card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              {["Customer", "Loan No", "Total", "Received", "Balance"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeletonRows columns={5} rows={6} />
            ) : error ? (
              <tr className="border-b border-border/50">
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-expense">
                  {error}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr className="border-b border-border/50">
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No records found
                </td>
              </tr>
            ) : (
              data.map((r, i) => (
                <tr key={`${r.loanNo || "loan"}-${r.customer}-${i}`} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{r.customer}</td>
                  <td className="px-4 py-3 text-sm text-primary font-medium">{r.loanNo || "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground">₹{r.total.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-sm text-income">₹{r.received.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-expense">₹{r.balance.toLocaleString("en-IN")}</td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && !error && data.length > 0 && (
            <tfoot>
              <tr className="bg-secondary/50 font-bold">
                <td colSpan={2} className="px-4 py-3 text-sm text-foreground">Total</td>
                <td className="px-4 py-3 text-sm text-foreground">₹{totals.total.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-sm text-income">₹{totals.received.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-sm text-expense">₹{totals.balance.toLocaleString("en-IN")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function Balances() {
  const defaultDates = useMemo(() => getDefaultDates(), []);
  const [fromDate, setFromDate] = useState(defaultDates.from);
  const [toDate, setToDate] = useState(defaultDates.to);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"principal" | "interest" | "penalty" | "seizing">("principal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceData, setBalanceData] = useState<BalanceData>({
    principal: [],
    interest: [],
    penalty: [],
    seizing: [],
  });

  const { toast } = useToast();

  const fetchBalances = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get("/reports/balances", {
        params: {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          search: search.trim() || undefined,
        },
      });
      if (res.data?.success && res.data?.data) {
        setBalanceData({
          principal: Array.isArray(res.data.data.principal) ? res.data.data.principal : [],
          interest: Array.isArray(res.data.data.interest) ? res.data.data.interest : [],
          penalty: Array.isArray(res.data.data.penalty) ? res.data.data.penalty : [],
          seizing: Array.isArray(res.data.data.seizing) ? res.data.data.seizing : [],
        });
      } else {
        setBalanceData({ principal: [], interest: [], penalty: [], seizing: [] });
      }
    } catch (err: any) {
      console.error("Failed to fetch balances:", err);
      setError(err?.response?.data?.message || err?.response?.data?.error || "Failed to fetch balances");
      setBalanceData({ principal: [], interest: [], penalty: [], seizing: [] });
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, search]);

  useEffect(() => {
    fetchBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTabRecords = useMemo(() => {
    const list = balanceData[activeTab] || [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      r => r.customer.toLowerCase().includes(q) || r.loanNo.toLowerCase().includes(q)
    );
  }, [balanceData, activeTab, search]);

  const handleCopy = async () => {
    try {
      const headers = ["Customer", "Loan No", "Total", "Received", "Balance"];
      const rows = currentTabRecords.map(r =>
        [r.customer, r.loanNo || "—", r.total, r.received, r.balance].join("\t")
      );
      const tsv = [headers.join("\t"), ...rows].join("\n");
      await navigator.clipboard.writeText(tsv);
      toast({
        title: "Copied to clipboard",
        description: `${currentTabRecords.length} record(s) copied from ${activeTab} tab`,
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

      const headers = ["Customer", "Loan No", "Total", "Received", "Balance"];
      const rows = currentTabRecords.map(r =>
        [
          escapeCsv(r.customer),
          escapeCsv(r.loanNo || "—"),
          escapeCsv(r.total),
          escapeCsv(r.received),
          escapeCsv(r.balance),
        ].join(",")
      );

      const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Balances_${activeTab}_${fromDate || "all"}_to_${toDate || "all"}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "CSV Downloaded",
        description: `Exported ${currentTabRecords.length} record(s) from ${activeTab} tab`,
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
        <h1 className="text-3xl font-bold text-foreground">Balances</h1>
        <p className="text-muted-foreground mt-1">Outstanding balance breakdown by category</p>
      </motion.div>

      {/* Filters Toolbar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">From Date</label>
            <DatePicker value={fromDate} onChange={e => setFromDate(e.target.value)} placeholder="From Date" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">To Date</label>
            <DatePicker value={toDate} onChange={e => setToDate(e.target.value)} placeholder="To Date" />
          </div>
          <Button size="sm" className="gap-2" style={{ background: "var(--gradient-primary)" }} onClick={fetchBalances}>
            Show
          </Button>
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

      <Tabs
        defaultValue="principal"
        value={activeTab}
        onValueChange={v => setActiveTab(v as any)}
        className="w-full"
      >
        <TabsList className="bg-secondary">
          <TabsTrigger value="principal">Principal</TabsTrigger>
          <TabsTrigger value="interest">Interest</TabsTrigger>
          <TabsTrigger value="penalty">Penalty</TabsTrigger>
          <TabsTrigger value="seizing">Seizing</TabsTrigger>
        </TabsList>
        <TabsContent value="principal" className="mt-4">
          <BalanceTable data={balanceData.principal} loading={loading} error={error} />
        </TabsContent>
        <TabsContent value="interest" className="mt-4">
          <BalanceTable data={balanceData.interest} loading={loading} error={error} />
        </TabsContent>
        <TabsContent value="penalty" className="mt-4">
          <BalanceTable data={balanceData.penalty} loading={loading} error={error} />
        </TabsContent>
        <TabsContent value="seizing" className="mt-4">
          <BalanceTable data={balanceData.seizing} loading={loading} error={error} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

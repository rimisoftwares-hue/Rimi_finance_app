import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, ChevronDown, ChevronRight, Settings, Download, Printer, FileText, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { toast } from "sonner";
import { DrillLink, DrillAmount } from "../lib/accounting/DrillDown";
import { useAuth } from "../../contexts/AuthContext";
import { fetchTrialBalance } from "../../api/trialBalanceApi";
import type { TrialBalanceData, TrialBalanceGroup } from "../../types/trialBalance";

interface ConfigState {
  showGroupSummary: boolean;
  showLedgerDetails: boolean;
  hideZeroBalance: boolean;
  showOpeningClosing: boolean;
}

function getDefaultDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fyStartYear = month >= 4 ? year : year - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${fyStartYear}-04-01`,
    to: `${year}-${pad(month)}-${pad(now.getDate())}`,
  };
}

export default function TrialBalance() {
  const { currentFinance } = useAuth();
  const def = useMemo(() => getDefaultDates(), []);
  const [showConfig, setShowConfig] = useState(false);
  const [dateFrom, setDateFrom] = useState(def.from);
  const [dateTo, setDateTo] = useState(def.to);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<ConfigState>({
    showGroupSummary: true,
    showLedgerDetails: true,
    hideZeroBalance: true,
    showOpeningClosing: false,
  });

  const [data, setData] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        setShowConfig(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchTrialBalance({ from: dateFrom, to: dateTo }, controller.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err?.response?.data?.message || err?.message || "Failed to load Trial Balance");
        setLoading(false);
      });

    return () => controller.abort();
  }, [dateFrom, dateTo, currentFinance?.id]);

  const visibleGroups = useMemo(() => {
    if (!data?.groups) return [];
    if (!config.hideZeroBalance) {
      return data.groups;
    }
    return data.groups
      .map((g) => ({
        ...g,
        ledgers: g.ledgers.filter((l) => l.debit !== 0 || l.credit !== 0),
      }))
      .filter((g) => g.ledgers.length > 0);
  }, [data?.groups, config.hideZeroBalance]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const expandAll = () => setExpandedGroups(new Set(visibleGroups.map((g) => g.name)));
  const collapseAll = () => setExpandedGroups(new Set());

  const totalDebit = data?.totalDebit ?? 0;
  const totalCredit = data?.totalCredit ?? 0;
  const isBalanced = data?.isBalanced ?? true;
  const difference = data?.difference ?? 0;

  const handleExport = (fmt: string) => {
    if (fmt === "CSV") {
      if (!data) {
        toast.error("No data to export");
        return;
      }
      let csv = "Particulars,Debit,Credit\n";
      for (const g of visibleGroups) {
        csv += `"${g.name} (${g.nature})",${g.gDebit},${g.gCredit}\n`;
        for (const l of g.ledgers) {
          csv += `"  ${l.name}",${l.debit},${l.credit}\n`;
        }
      }
      csv += `"Total",${totalDebit},${totalCredit}\n`;
      if (!isBalanced) {
        csv += `"Difference",${difference},\n`;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Trial_Balance_${dateFrom}_to_${dateTo}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Trial Balance exported to CSV");
    } else {
      toast.info(`${fmt} export is not implemented. CSV export is fully supported.`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Page Header with Balanced/Mismatch badge and moved Export/Print buttons */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Trial Balance</h1>
          <p className="text-muted-foreground mt-1 text-sm">Group-wise with drill-down</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium ${isBalanced ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>
            {isBalanced ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {isBalanced ? "Balanced" : "Mismatch"}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {["PDF", "Excel", "CSV", "XML"].map((f) => (
                <DropdownMenuItem key={f} onClick={() => handleExport(f)}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> {f}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
        </div>
      </motion.div>

      {/* Filters & actions: DatePickers with min-w-[160px] w-auto in a flex-wrap container */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="dashboard-card !p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <DatePicker
            value={dateFrom}
            onChange={(e) => setDateFrom(e?.target?.value || e)}
            placeholder="From Date"
            className="min-w-[160px] w-auto"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <DatePicker
            value={dateTo}
            onChange={(e) => setDateTo(e?.target?.value || e)}
            placeholder="To Date"
            className="min-w-[160px] w-auto"
          />
        </div>
        <Button size="sm" variant="outline" onClick={expandAll}>Expand All</Button>
        <Button size="sm" variant="outline" onClick={collapseAll}>Collapse All</Button>
        <Button size="sm" variant="outline" onClick={() => setShowConfig(true)}>
          <Settings className="h-3.5 w-3.5 mr-1" /> F12
        </Button>
      </motion.div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50 sticky top-0 z-10">
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Particulars</th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 w-40">Debit (₹)</th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 w-40">Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span>Loading Trial Balance...</span>
                    </div>
                  </td>
                </tr>
              ) : visibleGroups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No ledger entries found for the selected period.
                  </td>
                </tr>
              ) : (
                visibleGroups.map((group) => {
                  const isExpanded = expandedGroups.has(group.name);
                  return (
                    <GroupRow
                      key={group.id || group.name}
                      group={group}
                      isExpanded={isExpanded}
                      onToggle={() => toggleGroup(group.name)}
                      showLedgers={config.showLedgerDetails}
                    />
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className={`font-bold sticky bottom-0 ${isBalanced ? "bg-income/5" : "bg-expense/5"}`}>
                <td className="px-4 py-3 text-sm text-foreground">Total</td>
                <td className="px-4 py-3 text-sm text-right text-foreground font-mono tabular-nums">
                  ₹{totalDebit.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-sm text-right text-foreground font-mono tabular-nums">
                  ₹{totalCredit.toLocaleString("en-IN")}
                </td>
              </tr>
              {!isBalanced && (
                <tr className="bg-expense/5">
                  <td className="px-4 py-2 text-xs text-expense" colSpan={3}>
                    Difference: ₹{difference.toLocaleString("en-IN")} ({totalDebit > totalCredit ? "Debit excess" : "Credit excess"})
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </motion.div>

      {/* Config Dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" /> Configuration (F12)
            </DialogTitle>
            <DialogDescription>Trial Balance display settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {([
              ["showGroupSummary", "Show Group Summary"],
              ["showLedgerDetails", "Show Ledger Details"],
              ["hideZeroBalance", "Hide Zero Balance"],
              ["showOpeningClosing", "Show Opening / Closing"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-sm">{label}</Label>
                <Switch
                  checked={config[key]}
                  onCheckedChange={(v) => setConfig((prev) => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupRow({
  group,
  isExpanded,
  onToggle,
  showLedgers,
}: {
  group: TrialBalanceGroup;
  isExpanded: boolean;
  onToggle: () => void;
  showLedgers: boolean;
}) {
  const gDebit = group.gDebit ?? group.ledgers.reduce((s, l) => s + l.debit, 0);
  const gCredit = group.gCredit ?? group.ledgers.reduce((s, l) => s + l.credit, 0);

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-secondary/30 transition-colors bg-secondary/10 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
          <div className="flex items-center gap-2">
            {showLedgers ? (
              <span className="text-muted-foreground">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            ) : null}
            <span className="hover:text-primary">{group.name}</span>
            <Badge variant="outline" className="text-[10px] ml-1">{group.nature}</Badge>
          </div>
        </td>
        <td className="px-4 py-2.5 text-sm text-right font-mono tabular-nums font-semibold">
          {gDebit > 0 ? `₹${gDebit.toLocaleString("en-IN")}` : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-2.5 text-sm text-right font-mono tabular-nums font-semibold">
          {gCredit > 0 ? `₹${gCredit.toLocaleString("en-IN")}` : <span className="text-muted-foreground">—</span>}
        </td>
      </tr>
      <AnimatePresence>
        {isExpanded && showLedgers && group.ledgers.map((l) => (
          <motion.tr
            key={l.id || l.name}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-border/30 hover:bg-secondary/20 transition-colors"
          >
            <td className="px-4 pl-10 py-2 text-sm">
              <DrillLink level={{ kind: "ledger", name: l.name }} className="text-foreground">
                {l.name}
              </DrillLink>
            </td>
            <td className="px-4 py-2 text-sm text-right font-mono tabular-nums">
              {l.debit > 0 ? (
                <DrillAmount value={l.debit} level={{ kind: "ledger", name: l.name }} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="px-4 py-2 text-sm text-right font-mono tabular-nums">
              {l.credit > 0 ? (
                <DrillAmount value={l.credit} level={{ kind: "ledger", name: l.name }} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
          </motion.tr>
        ))}
      </AnimatePresence>
    </>
  );
}

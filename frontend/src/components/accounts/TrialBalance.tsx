import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, ChevronDown, ChevronRight, Settings, Download, Printer, FileText, Filter } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { toast } from "sonner";
import { DrillLink, DrillAmount, useDrillDown } from "../lib/accounting/DrillDown";

interface LedgerItem {
  name: string;
  debit: number;
  credit: number;
}

interface GroupData {
  name: string;
  nature: string;
  ledgers: LedgerItem[];
}

const trialGroups: GroupData[] = [
  {
    name: "Current Assets", nature: "Assets", ledgers: [
      { name: "Cash in Hand", debit: 285000, credit: 0 },
      { name: "SBI Current A/c", debit: 1250000, credit: 0 },
      { name: "Rajesh Kumar", debit: 45000, credit: 0 },
      { name: "Priya Devi", debit: 32000, credit: 0 },
    ]
  },
  {
    name: "Fixed Assets", nature: "Assets", ledgers: [
      { name: "Furniture & Fixtures", debit: 125000, credit: 0 },
      { name: "Office Equipment", debit: 85000, credit: 0 },
      { name: "Vehicles", debit: 320000, credit: 0 },
    ]
  },
  {
    name: "Loan Portfolio", nature: "Assets", ledgers: [
      { name: "Gold Loans", debit: 2850000, credit: 0 },
      { name: "Vehicle Loans", debit: 1500000, credit: 0 },
      { name: "Personal Loans", debit: 500000, credit: 0 },
    ]
  },
  {
    name: "Capital Account", nature: "Liabilities", ledgers: [
      { name: "Capital – Partner A", debit: 0, credit: 2000000 },
      { name: "Capital – Partner B", debit: 0, credit: 1500000 },
    ]
  },
  {
    name: "Direct Income", nature: "Income", ledgers: [
      { name: "Interest Income", debit: 0, credit: 680000 },
      { name: "Processing Fee", debit: 0, credit: 120000 },
    ]
  },
  {
    name: "Indirect Income", nature: "Income", ledgers: [
      { name: "Penalty Income", debit: 0, credit: 245000 },
      { name: "Doc Charges Income", debit: 0, credit: 180000 },
    ]
  },
  {
    name: "Direct Expense", nature: "Expense", ledgers: [
      { name: "Salary Expenses", debit: 360000, credit: 0 },
      { name: "Commission", debit: 45000, credit: 0 },
    ]
  },
  {
    name: "Indirect Expense", nature: "Expense", ledgers: [
      { name: "Rent Expenses", debit: 300000, credit: 0 },
      { name: "Office Expenses", debit: 95000, credit: 0 },
      { name: "Insurance Premium", debit: 42000, credit: 0 },
      { name: "Depreciation", debit: 28000, credit: 0 },
      { name: "Telephone", debit: 18000, credit: 0 },
    ]
  },
  {
    name: "Secured Loans", nature: "Liabilities", ledgers: [
      { name: "Loan from Bank", debit: 0, credit: 1500000 },
    ]
  },
  {
    name: "Current Liabilities", nature: "Liabilities", ledgers: [
      { name: "Sundry Creditors", debit: 0, credit: 315000 },
      { name: "ABC Suppliers", debit: 0, credit: 180000 },
      { name: "Duties & Taxes Payable", debit: 0, credit: 125000 },
    ]
  },
];

interface ConfigState {
  showGroupSummary: boolean;
  showLedgerDetails: boolean;
  hideZeroBalance: boolean;
  showOpeningClosing: boolean;
}

export default function TrialBalance() {
  const [showConfig, setShowConfig] = useState(false);
  const [dateFrom, setDateFrom] = useState("2025-04-01");
  const [dateTo, setDateTo] = useState("2025-04-30");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<ConfigState>({
    showGroupSummary: true, showLedgerDetails: true, hideZeroBalance: true, showOpeningClosing: false,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F12") { e.preventDefault(); setShowConfig(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const expandAll = () => setExpandedGroups(new Set(trialGroups.map(g => g.name)));
  const collapseAll = () => setExpandedGroups(new Set());

  const totalDebit = useMemo(() => trialGroups.reduce((s, g) => s + g.ledgers.reduce((ss, l) => ss + l.debit, 0), 0), []);
  const totalCredit = useMemo(() => trialGroups.reduce((s, g) => s + g.ledgers.reduce((ss, l) => ss + l.credit, 0), 0), []);
  const isBalanced = totalDebit === totalCredit;

  const handleExport = (fmt: string) => toast.success(`Exporting as ${fmt}...`);

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Trial Balance</h1>
          <p className="text-sm text-muted-foreground">Group-wise with drill-down</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium ${isBalanced ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>
            {isBalanced ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {isBalanced ? "Balanced" : "Mismatch"}
          </div>
        </div>
      </motion.div>

      {/* Filters & actions */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="dashboard-card !p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <DatePicker value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From Date" className="w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <DatePicker value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To Date" className="w-36" />
        </div>
        <Button size="sm" variant="outline" onClick={expandAll}>Expand All</Button>
        <Button size="sm" variant="outline" onClick={collapseAll}>Collapse All</Button>
        <Button size="sm" variant="outline" onClick={() => setShowConfig(true)}><Settings className="h-3.5 w-3.5 mr-1" /> F12</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1" /> Export</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {["PDF", "Excel", "CSV", "XML"].map(f => (
              <DropdownMenuItem key={f} onClick={() => handleExport(f)}><FileText className="h-3.5 w-3.5 mr-2" /> {f}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="outline" onClick={() => toast.info("Opening print preview...")}><Printer className="h-3.5 w-3.5 mr-1" /> Print</Button>
      </motion.div>

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
              {trialGroups.map(group => {
                const gDebit = group.ledgers.reduce((s, l) => s + l.debit, 0);
                const gCredit = group.ledgers.reduce((s, l) => s + l.credit, 0);
                const isExpanded = expandedGroups.has(group.name);

                return (
                  <GroupRow key={group.name} group={group} gDebit={gDebit} gCredit={gCredit}
                    isExpanded={isExpanded} onToggle={() => toggleGroup(group.name)}
                    showLedgers={config.showLedgerDetails} />
                );
              })}
            </tbody>
            <tfoot>
              <tr className={`font-bold sticky bottom-0 ${isBalanced ? "bg-income/5" : "bg-expense/5"}`}>
                <td className="px-4 py-3 text-sm text-foreground">Total</td>
                <td className="px-4 py-3 text-sm text-right text-foreground font-mono tabular-nums">₹{totalDebit.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-right text-foreground font-mono tabular-nums">₹{totalCredit.toLocaleString()}</td>
              </tr>
              {!isBalanced && (
                <tr className="bg-expense/5">
                  <td className="px-4 py-2 text-xs text-expense" colSpan={3}>
                    Difference: ₹{Math.abs(totalDebit - totalCredit).toLocaleString()} ({totalDebit > totalCredit ? "Debit excess" : "Credit excess"})
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
            <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> Configuration (F12)</DialogTitle>
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
                <Switch checked={config[key]} onCheckedChange={(v) => setConfig(prev => ({ ...prev, [key]: v }))} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupRow({ group, gDebit, gCredit, isExpanded, onToggle, showLedgers }: {
  group: GroupData; gDebit: number; gCredit: number; isExpanded: boolean; onToggle: () => void; showLedgers: boolean;
}) {
  const { open } = useDrillDown();
  const groupLevel = { kind: "group" as const, name: group.name, nature: group.nature, ledgers: group.ledgers };
  return (
    <>
      <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors bg-secondary/10">
        <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
          <div className="flex items-center gap-2">
            {showLedgers ? (
              <button onClick={onToggle} className="cursor-pointer">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            ) : null}
            <button onClick={() => open(groupLevel)} className="hover:text-primary hover:underline">{group.name}</button>
            <Badge variant="outline" className="text-[10px] ml-1">{group.nature}</Badge>
          </div>
        </td>
        <td className="px-4 py-2.5 text-sm text-right font-mono tabular-nums font-semibold">
          {gDebit > 0 ? <DrillAmount value={gDebit} level={groupLevel} /> : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-2.5 text-sm text-right font-mono tabular-nums font-semibold">
          {gCredit > 0 ? <DrillAmount value={gCredit} level={groupLevel} /> : <span className="text-muted-foreground">—</span>}
        </td>
      </tr>
      <AnimatePresence>
        {isExpanded && showLedgers && group.ledgers.map((l) => (
          <motion.tr key={l.name} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
            <td className="px-4 pl-10 py-2 text-sm"><DrillLink level={{ kind: "ledger", name: l.name }} className="text-foreground">{l.name}</DrillLink></td>
            <td className="px-4 py-2 text-sm text-right font-mono tabular-nums">
              {l.debit > 0 ? <DrillAmount value={l.debit} level={{ kind: "ledger", name: l.name }} /> : <span className="text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-2 text-sm text-right font-mono tabular-nums">
              {l.credit > 0 ? <DrillAmount value={l.credit} level={{ kind: "ledger", name: l.name }} /> : <span className="text-muted-foreground">—</span>}
            </td>
          </motion.tr>
        ))}
      </AnimatePresence>
    </>
  );
}

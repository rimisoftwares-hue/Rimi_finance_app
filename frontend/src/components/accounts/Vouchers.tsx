import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Save, Settings, Search, Calendar, FileText, Zap, ShieldCheck, Layers } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar as CalendarComp } from "../ui/calendar";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  VOUCHER_TYPES, VoucherTypeMaster, EntryType,
  ledgersForRule, generateVoucherNumber, validateEntries, LEDGER_GROUPS,
} from "../data/voucherTypes";

const NATURE_COLORS: Record<string, string> = {
  Receipt: "bg-income/10 text-income border-income/30",
  Payment: "bg-expense/10 text-expense border-expense/30",
  Contra: "bg-pending/10 text-pending border-pending/30",
  Journal: "bg-primary/10 text-primary border-primary/30",
  Sales: "bg-income/10 text-income border-income/30",
  Purchase: "bg-expense/10 text-expense border-expense/30",
  Special: "bg-accent/10 text-accent-foreground border-accent/30",
};

interface VoucherLine {
  id: number;
  type: EntryType;
  ledger: string;
  amount: number;
  narration: string;
}

interface Voucher {
  id: number;
  voucher_type_id: number;
  voucher_number: string;
  voucher_date: string;
  reference_id?: string;
  reference_type?: string;
  finance_id: number;
  created_by: string;
  lines: VoucherLine[];
  narration: string;
}

const SEED_VOUCHERS: Voucher[] = [
  {
    id: 1, voucher_type_id: 1, voucher_number: "REC/2026/001", voucher_date: "2026-04-02",
    finance_id: 1, created_by: "admin", reference_type: "payments", reference_id: "PMT-1021",
    narration: "EMI collection from Rajesh Kumar",
    lines: [
      { id: 1, type: "Dr", ledger: "Cash", amount: 15000, narration: "" },
      { id: 2, type: "Cr", ledger: "Rajesh Kumar", amount: 15000, narration: "" },
    ]
  },
  {
    id: 2, voucher_type_id: 9, voucher_number: "LOAN/2026/001", voucher_date: "2026-04-05",
    finance_id: 1, created_by: "admin", reference_type: "loans", reference_id: "LN-3001",
    narration: "Loan disbursed to Suresh – TN09 AB 1234",
    lines: [
      { id: 1, type: "Dr", ledger: "Suresh Vehicle Loan", amount: 250000, narration: "" },
      { id: 2, type: "Cr", ledger: "SBI Current A/c", amount: 250000, narration: "" },
    ]
  },
  {
    id: 3, voucher_type_id: 10, voucher_number: "EMI/2026/001", voucher_date: "2026-04-10",
    finance_id: 1, created_by: "agent_05", reference_type: "payments", reference_id: "PMT-1045",
    narration: "EMI #2 – Suresh",
    lines: [
      { id: 1, type: "Dr", ledger: "Cash", amount: 12500, narration: "" },
      { id: 2, type: "Cr", ledger: "Suresh Vehicle Loan", amount: 10000, narration: "Principal" },
      { id: 3, type: "Cr", ledger: "Interest Income", amount: 2500, narration: "Interest" },
    ]
  },
  {
    id: 4, voucher_type_id: 11, voucher_number: "VEX/2026/001", voucher_date: "2026-04-12",
    finance_id: 1, created_by: "admin", reference_type: "vehicle_expenses", reference_id: "VE-501",
    narration: "Tyre replacement – TN09 AB 1234",
    lines: [
      { id: 1, type: "Dr", ledger: "Vehicle - TN09 AB 1234", amount: 8500, narration: "" },
      { id: 2, type: "Cr", ledger: "Cash", amount: 8500, narration: "" },
    ]
  },
];

interface ConfigState {
  enableNarration: boolean;
  enableBillWise: boolean;
  autoNumbering: boolean;
  allowFutureDate: boolean;
  enforceRuleEngine: boolean;
}

export default function Vouchers() {
  const [activeTab, setActiveTab] = useState<"entry" | "register" | "types">("entry");
  const [vouchers, setVouchers] = useState<Voucher[]>(SEED_VOUCHERS);

  const [voucherTypeId, setVoucherTypeId] = useState<number>(1);
  const voucherType = useMemo<VoucherTypeMaster>(
    () => VOUCHER_TYPES.find(v => v.id === voucherTypeId) || VOUCHER_TYPES[0],
    [voucherTypeId]
  );

  const [voucherNumber, setVoucherNumber] = useState("");
  const [voucherDate, setVoucherDate] = useState<Date>(new Date(2026, 3, 15));
  const [narration, setNarration] = useState("");

  const initialLines = useCallback((vt: VoucherTypeMaster): VoucherLine[] =>
    vt.rule.filter(r => !r.optional).map((r, i) => ({
      id: Date.now() + i, type: r.type, ledger: "", amount: 0, narration: "",
    })), []);

  const [lines, setLines] = useState<VoucherLine[]>(() => initialLines(VOUCHER_TYPES[0]));

  const [showConfig, setShowConfig] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Register filters
  const [filterTypeId, setFilterTypeId] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const [config, setConfig] = useState<ConfigState>({
    enableNarration: true, enableBillWise: false, autoNumbering: true,
    allowFutureDate: false, enforceRuleEngine: true,
  });

  // Reset lines when voucher type changes
  useEffect(() => { setLines(initialLines(voucherType)); }, [voucherType, initialLines]);

  // Auto numbering with year prefix
  useEffect(() => {
    if (config.autoNumbering) {
      const count = vouchers.filter(v => v.voucher_type_id === voucherType.id).length + 1;
      setVoucherNumber(generateVoucherNumber(voucherType.code, count, voucherDate));
    }
  }, [voucherType, vouchers, config.autoNumbering, voucherDate]);

  const totalDr = useMemo(() => lines.filter(l => l.type === "Dr").reduce((s, l) => s + l.amount, 0), [lines]);
  const totalCr = useMemo(() => lines.filter(l => l.type === "Cr").reduce((s, l) => s + l.amount, 0), [lines]);
  const isBalanced = Math.round((totalDr - totalCr) * 100) === 0 && totalDr > 0;
  const diff = Math.abs(totalDr - totalCr);

  const addLine = (type: EntryType = "Cr") =>
    setLines(prev => [...prev, { id: Date.now(), type, ledger: "", amount: 0, narration: "" }]);
  const removeLine = (id: number) => setLines(prev => prev.filter(l => l.id !== id));
  const updateLine = (id: number, field: keyof VoucherLine, value: string | number) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const handleSave = useCallback(() => {
    const v = validateEntries(lines, { allowFutureDate: config.allowFutureDate, date: voucherDate });
    if (!v.ok) { toast.error(v.error!); return; }
    // Rule engine check
    if (config.enforceRuleEngine) {
      for (const line of lines) {
        const grp = LEDGER_GROUPS[line.ledger];
        const rule = voucherType.rule.find(r => r.type === line.type);
        if (rule && !rule.allowed.includes("*") && grp && !rule.allowed.includes(grp)) {
          toast.error(`${line.type} of "${line.ledger}" violates ${voucherType.name} rule (expected: ${rule.allowed.join("/")})`);
          return;
        }
      }
    }
    const voucher: Voucher = {
      id: Date.now(),
      voucher_type_id: voucherType.id,
      voucher_number: voucherNumber,
      voucher_date: format(voucherDate, "yyyy-MM-dd"),
      finance_id: 1,
      created_by: "admin",
      lines: [...lines],
      narration,
    };
    setVouchers(prev => [...prev, voucher]);
    toast.success(`${voucherType.name} voucher ${voucherNumber} saved`);
    setLines(initialLines(voucherType));
    setNarration("");
  }, [lines, voucherType, voucherNumber, voucherDate, narration, config, initialLines]);

  // Tally shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "F4") { e.preventDefault(); setVoucherTypeId(2); }
      if (e.ctrlKey && e.key === "F5") { e.preventDefault(); setVoucherTypeId(1); }
      if (e.ctrlKey && e.key === "F7") { e.preventDefault(); setVoucherTypeId(4); }
      if (e.ctrlKey && e.key === "F6") { e.preventDefault(); setVoucherTypeId(3); }
      if (e.ctrlKey && e.key === "F8") { e.preventDefault(); setVoucherTypeId(5); }
      if (e.ctrlKey && e.key === "F9") { e.preventDefault(); setVoucherTypeId(6); }
      if (e.ctrlKey && e.key.toLowerCase() === "a") { e.preventDefault(); handleSave(); }
      if (e.key === "F2") { e.preventDefault(); setShowDatePicker(true); }
      if (e.key === "F12") { e.preventDefault(); setShowConfig(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      if (filterTypeId !== "all" && v.voucher_type_id !== Number(filterTypeId)) return false;
      if (filterFrom && v.voucher_date < filterFrom) return false;
      if (filterTo && v.voucher_date > filterTo) return false;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const inLedger = v.lines.some(l => l.ledger.toLowerCase().includes(q));
        if (!v.narration.toLowerCase().includes(q) && !v.voucher_number.toLowerCase().includes(q) && !inLedger) return false;
      }
      return true;
    });
  }, [vouchers, filterTypeId, filterFrom, filterTo, filterSearch]);

  const activeRule = voucherType.rule;

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Voucher Entry
            {/* Voucher Entry */}
          </h1>
          <p className="text-sm text-muted-foreground">
            Tally-style double-entry · {VOUCHER_TYPES.length} voucher types · auto-posting enabled
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
          <Settings className="h-3.5 w-3.5 mr-1" /> F12
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-1.5 text-[10px]">
        {[
          ["Ctrl+F5", "Receipt"], ["Ctrl+F4", "Payment"], ["Ctrl+F6", "Contra"], ["Ctrl+F7", "Journal"],
          ["Ctrl+F8", "Sales"], ["Ctrl+F9", "Purchase"], ["Ctrl+A", "Save"], ["F2", "Date"], ["F12", "Config"],
        ].map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary text-muted-foreground">
            <kbd className="font-mono font-semibold text-foreground">{k}</kbd> {v}
          </span>
        ))}
      </motion.div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="entry">Voucher Entry</TabsTrigger>
          <TabsTrigger value="register">Voucher Register</TabsTrigger>
          <TabsTrigger value="types">Voucher Types</TabsTrigger>
        </TabsList>

        {/* ENTRY */}
        <TabsContent value="entry">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card space-y-5">
            {/* Top row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Voucher Type</Label>
                <Select value={String(voucherTypeId)} onValueChange={(v) => setVoucherTypeId(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VOUCHER_TYPES.map(vt => (
                      <SelectItem key={vt.id} value={String(vt.id)}>
                        <span className="font-mono text-xs text-muted-foreground mr-2">{vt.code}</span>
                        {vt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Badge variant="outline" className={`text-[10px] ${NATURE_COLORS[voucherType.nature]}`}>{voucherType.nature}</Badge>
                  {voucherType.affects_cash_flow && <Badge variant="outline" className="text-[10px]">Cash Flow</Badge>}
                  {voucherType.affects_profit_loss && <Badge variant="outline" className="text-[10px]">P&amp;L</Badge>}
                  {voucherType.auto_source && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Zap className="h-2.5 w-2.5" /> auto: {voucherType.auto_source}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Voucher No</Label>
                <Input value={voucherNumber} onChange={e => setVoucherNumber(e.target.value)} className="font-mono" readOnly={config.autoNumbering} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date (F2)</Label>
                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <Calendar className="h-4 w-4 mr-2" />
                      {format(voucherDate, "dd-MM-yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComp mode="single" selected={voucherDate} onSelect={(d) => { if (d) { setVoucherDate(d); setShowDatePicker(false); } }} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Rule preview */}
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider text-[10px]">
                <ShieldCheck className="h-3 w-3" /> Rule Engine — {voucherType.name}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeRule.map((r, i) => (
                  <span key={i} className={`px-2 py-0.5 rounded font-mono ${r.type === "Dr" ? "bg-primary/10 text-primary" : "bg-income/10 text-income"}`}>
                    {r.type} → {r.hint}{r.optional && " (optional)"}
                  </span>
                ))}
              </div>
            </div>

            {/* Entries */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Entries</Label>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => addLine("Dr")}><Plus className="h-3.5 w-3.5 mr-1" /> Dr</Button>
                  <Button variant="outline" size="sm" onClick={() => addLine("Cr")}><Plus className="h-3.5 w-3.5 mr-1" /> Cr</Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-secondary/50 border-b border-border">
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 w-20">Type</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">Ledger</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 w-36">Amount</th>
                      {config.enableNarration && <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">Narration</th>}
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const rule = activeRule.find(r => r.type === line.type);
                      const allowed = rule ? ledgersForRule(rule.allowed) : ledgersForRule(["*"]);
                      return (
                        <tr key={line.id} className="border-b border-border/50">
                          <td className="px-3 py-2">
                            <button onClick={() => updateLine(line.id, "type", line.type === "Dr" ? "Cr" : "Dr")}
                              className={`px-3 py-1 rounded text-xs font-bold ${line.type === "Dr" ? "bg-primary/10 text-primary" : "bg-income/10 text-income"}`}>
                              {line.type}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <Select value={line.ledger} onValueChange={(v) => updateLine(line.id, "ledger", v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={rule?.hint || "Select ledger"} /></SelectTrigger>
                              <SelectContent>
                                {allowed.map(l => (
                                  <SelectItem key={l} value={l}>
                                    <span>{l}</span>
                                    <span className="text-[10px] text-muted-foreground ml-2">{LEDGER_GROUPS[l]}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" value={line.amount || ""} onChange={e => updateLine(line.id, "amount", parseFloat(e.target.value) || 0)}
                              className="h-8 font-mono tabular-nums text-sm" placeholder="0.00" />
                          </td>
                          {config.enableNarration && (
                            <td className="px-3 py-2">
                              <Input value={line.narration} onChange={e => updateLine(line.id, "narration", e.target.value)} className="h-8 text-sm" placeholder="Narration" />
                            </td>
                          )}
                          <td className="px-2 py-2">
                            {lines.length > 2 && (
                              <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-expense transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`flex items-center justify-between p-3 rounded-lg border ${isBalanced ? "bg-income/5 border-income/20" : diff > 0 ? "bg-expense/5 border-expense/20" : "bg-secondary/50 border-border"}`}>
              <div className="flex gap-6 text-sm">
                <span>Total Dr: <strong className="font-mono tabular-nums">₹{totalDr.toLocaleString()}</strong></span>
                <span>Total Cr: <strong className="font-mono tabular-nums">₹{totalCr.toLocaleString()}</strong></span>
              </div>
              <div>
                {isBalanced ? (
                  <Badge className="bg-income/10 text-income border-income/30">✓ Balanced</Badge>
                ) : totalDr > 0 || totalCr > 0 ? (
                  <Badge variant="destructive" className="bg-expense/10 text-expense border-expense/30">
                    Difference: ₹{diff.toLocaleString()} {totalDr > totalCr ? "(Dr excess)" : "(Cr excess)"}
                  </Badge>
                ) : null}
              </div>
            </div>

            {config.enableNarration && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Voucher Narration</Label>
                <Input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Description of this transaction..." />
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={!isBalanced} className="gap-2">
                <Save className="h-4 w-4" /> Save (Ctrl+A)
              </Button>
              <Button variant="outline" onClick={() => { setLines(initialLines(voucherType)); setNarration(""); }}>Clear</Button>
            </div>
          </motion.div>
        </TabsContent>

        {/* REGISTER */}
        <TabsContent value="register">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="dashboard-card !p-4 flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={filterTypeId} onValueChange={setFilterTypeId}>
                  <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {VOUCHER_TYPES.map(vt => <SelectItem key={vt.id} value={String(vt.id)}>{vt.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <DatePicker value={filterFrom} onChange={e => setFilterFrom(e.target.value)} placeholder="From Date" className="w-36" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <DatePicker value={filterTo} onChange={e => setFilterTo(e.target.value)} placeholder="To Date" className="w-36" />
              </div>
              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="No, ledger or narration..." className="h-8 pl-8" />
                </div>
              </div>
            </div>

            <div className="dashboard-card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50 sticky top-0">
                      {["Date", "No", "Type", "Ref", "Ledgers", "Amount", "Narration"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVouchers.map(v => <VoucherRow key={v.id} voucher={v} />)}
                    {filteredVouchers.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No vouchers found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </TabsContent>

        {/* TYPES MASTER */}
        <TabsContent value="types">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Voucher Type Master</h3>
              <span className="text-xs text-muted-foreground">— predefined Tally-style behaviors</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50 border-b border-border">
                    {["Code", "Name", "Nature", "Cash Flow", "P&L", "Auto Source", "Rule (Dr / Cr)"].map(h =>
                      <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {VOUCHER_TYPES.map(vt => (
                    <tr key={vt.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-2 font-mono text-xs text-primary">{vt.code}</td>
                      <td className="px-4 py-2 font-medium">{vt.name}<div className="text-[10px] text-muted-foreground">{vt.description}</div></td>
                      <td className="px-4 py-2"><Badge variant="outline" className={`text-[10px] ${NATURE_COLORS[vt.nature]}`}>{vt.nature}</Badge></td>
                      <td className="px-4 py-2 text-xs">{vt.affects_cash_flow ? "✓" : "—"}</td>
                      <td className="px-4 py-2 text-xs">{vt.affects_profit_loss ? "✓" : "—"}</td>
                      <td className="px-4 py-2 text-xs">{vt.auto_source ? <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-accent/20">{vt.auto_source}</span> : "—"}</td>
                      <td className="px-4 py-2 text-[11px] space-y-0.5">
                        {vt.rule.map((r, i) => (
                          <div key={i} className="font-mono">
                            <span className={r.type === "Dr" ? "text-primary" : "text-income"}>{r.type}</span> → {r.hint}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Config */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> Configuration (F12)</DialogTitle>
            <DialogDescription>Voucher settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {([
              ["enableNarration", "Enable Narration"],
              ["enableBillWise", "Enable Bill-wise tracking"],
              ["autoNumbering", "Auto Numbering (PREFIX/YYYY/NNN)"],
              ["allowFutureDate", "Allow Future-dated Vouchers"],
              ["enforceRuleEngine", "Enforce Rule Engine (Dr/Cr ledger groups)"],
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

function VoucherRow({ voucher }: { voucher: Voucher }) {
  const [expanded, setExpanded] = useState(false);
  const vt = VOUCHER_TYPES.find(t => t.id === voucher.voucher_type_id)!;
  const total = voucher.lines.filter(l => l.type === "Dr").reduce((s, l) => s + l.amount, 0);

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <td className="px-4 py-2.5 text-sm text-muted-foreground">{voucher.voucher_date}</td>
        <td className="px-4 py-2.5 text-sm font-mono text-primary">{voucher.voucher_number}</td>
        <td className="px-4 py-2.5"><Badge variant="outline" className={`text-[10px] ${NATURE_COLORS[vt.nature]}`}>{vt.name}</Badge></td>
        <td className="px-4 py-2.5 text-[10px] text-muted-foreground">
          {voucher.reference_type ? <span className="font-mono">{voucher.reference_type}:{voucher.reference_id}</span> : "—"}
        </td>
        <td className="px-4 py-2.5 text-sm text-foreground">{voucher.lines.map(l => l.ledger).join(", ")}</td>
        <td className="px-4 py-2.5 text-sm font-mono tabular-nums font-medium">₹{total.toLocaleString()}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{voucher.narration}</td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <td colSpan={7} className="px-4 pb-3 pt-0">
              <div className="ml-4 p-3 rounded-lg bg-secondary/30 border border-border/50">
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground"><th className="text-left py-1 w-16">Type</th><th className="text-left py-1">Ledger</th><th className="text-left py-1">Narration</th><th className="text-right py-1">Amount</th></tr></thead>
                  <tbody>
                    {voucher.lines.map(l => (
                      <tr key={l.id}>
                        <td className="py-1"><Badge variant="outline" className={`text-[10px] ${l.type === "Dr" ? "text-primary" : "text-income"}`}>{l.type}</Badge></td>
                        <td className="py-1 text-foreground">{l.ledger}</td>
                        <td className="py-1 text-muted-foreground">{l.narration || "—"}</td>
                        <td className="py-1 text-right font-mono tabular-nums">₹{l.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Save, Settings, Search, Calendar, FileText, Zap, ShieldCheck, Layers, Loader2 } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import {
  VOUCHER_TYPES as STATIC_VOUCHER_TYPES,
  VoucherTypeMaster,
  EntryType,
  LEDGER_GROUPS,
  type VoucherNature,
} from "../data/voucherTypes";
import {
  getVoucherTypes as apiGetVoucherTypes,
  getNextVoucherNumber as apiGetNextVoucherNumber,
  createVoucher as apiCreateVoucher,
  listVouchers as apiListVouchers,
  getLedgers as apiGetLedgers,
  type VoucherListItem,
  type VoucherType as ApiVoucherType,
  type Ledger as ApiLedger,
} from "../../api/accounting";

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
  ledger_id: string;
  ledger: string;
  amount: number;
  narration: string;
}

interface ConfigState {
  enableNarration: boolean;
  enableBillWise: boolean;
  autoNumbering: boolean;
  allowFutureDate: boolean;
  enforceRuleEngine: boolean;
}

interface LiveLedger {
  id: string;
  ledger_name: string;
  group: string;
  nature: string;
}

const CONFIG_KEY = "vouchers:config";

function loadConfig(): ConfigState {
  try {
    const raw = localStorage.getItem(CONFIG_KEY) || localStorage.getItem("voucher:config");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enableNarration: parsed.enableNarration ?? true,
        enableBillWise: parsed.enableBillWise ?? false,
        autoNumbering: parsed.autoNumbering ?? true,
        allowFutureDate: parsed.allowFutureDate ?? false,
        enforceRuleEngine: parsed.enforceRuleEngine ?? true,
      };
    }
  } catch {
    // fallback
  }
  return {
    enableNarration: true,
    enableBillWise: false,
    autoNumbering: true,
    allowFutureDate: false,
    enforceRuleEngine: true,
  };
}

function isLedgerAllowedForRule(ledger: LiveLedger, allowedRuleGroups: string[]): boolean {
  if (allowedRuleGroups.includes("*")) return true;

  const staticGroup = LEDGER_GROUPS[ledger.ledger_name];
  if (staticGroup && allowedRuleGroups.includes(staticGroup)) return true;

  const grp = (ledger.group || "").toLowerCase();
  const name = ledger.ledger_name.toLowerCase();
  const nat = (ledger.nature || "").toLowerCase();

  for (const allowed of allowedRuleGroups) {
    const a = allowed.toLowerCase();
    if (grp.includes(a)) return true;
    if (a === "cash" && (grp.includes("cash") || name.includes("cash"))) return true;
    if (a === "bank" && (grp.includes("bank") || name.includes("bank"))) return true;
    if (a === "customer" && (grp.includes("debtor") || grp.includes("customer") || grp.includes("sundry debtors"))) return true;
    if (a === "vendor" && (grp.includes("creditor") || grp.includes("vendor") || grp.includes("supplier") || grp.includes("sundry creditors"))) return true;
    if (a === "expense" && (nat === "expenses" || nat === "expense" || grp.includes("expense") || grp.includes("purchase"))) return true;
    if (a === "income" || a === "sales income" || a === "interest income") {
      if (nat === "income" || grp.includes("income") || grp.includes("sales")) return true;
    }
    if (a === "vehicle" && (name.includes("vehicle") || grp.includes("fixed assets") || grp.includes("asset"))) return true;
    if (a === "asset" && (nat === "assets" || grp.includes("asset"))) return true;
    if (a === "adjustment") return true;
  }

  return false;
}

export default function Vouchers() {
  const { currentFinance } = useAuth();
  const financeId = currentFinance?.id;
  const activeFinanceIdRef = useRef(financeId);
  activeFinanceIdRef.current = financeId;

  const [activeTab, setActiveTab] = useState<"entry" | "register" | "types">("entry");

  // Voucher Types loaded from backend and merged with rules
  const [dbVoucherTypes, setDbVoucherTypes] = useState<ApiVoucherType[]>([]);
  const [liveLedgers, setLiveLedgers] = useState<LiveLedger[]>([]);

  // Merged voucher types
  const mergedVoucherTypes = useMemo<VoucherTypeMaster[]>(() => {
    return STATIC_VOUCHER_TYPES.map((st) => {
      const dbMatch = dbVoucherTypes.find(
        (dt) => dt.type_code?.toUpperCase() === st.code.toUpperCase() || dt.class === st.nature
      );
      return {
        ...st,
        dbId: dbMatch ? String(dbMatch.id) : undefined,
      };
    });
  }, [dbVoucherTypes]);

  // Selected voucher type identifier (code or id)
  const [selectedTypeCode, setSelectedTypeCode] = useState<string>("REC");
  const voucherType = useMemo<VoucherTypeMaster>(() => {
    return (
      mergedVoucherTypes.find(
        (v) => v.code === selectedTypeCode || String(v.id) === selectedTypeCode || v.dbId === selectedTypeCode
      ) || mergedVoucherTypes[0]
    );
  }, [mergedVoucherTypes, selectedTypeCode]);

  const [voucherNumber, setVoucherNumber] = useState("");
  const [userEditedNumber, setUserEditedNumber] = useState(false);
  const [voucherDate, setVoucherDate] = useState<Date>(() => new Date());
  const [narration, setNarration] = useState("");

  const initialLines = useCallback((vt: VoucherTypeMaster): VoucherLine[] => {
    return vt.rule
      .filter((r) => !r.optional)
      .map((r, i) => ({
        id: Date.now() + i,
        type: r.type,
        ledger_id: "",
        ledger: "",
        amount: 0,
        narration: "",
      }));
  }, []);

  const [lines, setLines] = useState<VoucherLine[]>(() => initialLines(STATIC_VOUCHER_TYPES[0]));
  const [isSaving, setIsSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Configuration (F12)
  const [config, setConfig] = useState<ConfigState>(() => loadConfig());

  const handleConfigChange = (key: keyof ConfigState, val: boolean) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Register state & filters
  const [registerVouchers, setRegisterVouchers] = useState<VoucherListItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [filterTypeId, setFilterTypeId] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input (~300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filterSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [filterSearch]);

  // Fetch Voucher Types & Ledgers when company changes
  const fetchMetadata = useCallback(async () => {
    const reqFinance = activeFinanceIdRef.current;
    if (!reqFinance) return;

    try {
      const [typesRes, ledgersRes] = await Promise.all([
        apiGetVoucherTypes(reqFinance),
        apiGetLedgers(reqFinance),
      ]);

      if (activeFinanceIdRef.current !== reqFinance) return;

      if (typesRes.data?.success && Array.isArray(typesRes.data.data)) {
        setDbVoucherTypes(typesRes.data.data);
      }

      if (ledgersRes.data?.success && Array.isArray(ledgersRes.data.data)) {
        const mappedLedgers: LiveLedger[] = ledgersRes.data.data.map((l: ApiLedger) => ({
          id: String(l.id),
          ledger_name: l.ledger_name,
          group: l.group_name || l.reporting_under || "",
          nature: l.nature || "",
        }));
        setLiveLedgers(mappedLedgers);
      }
    } catch (err) {
      console.error("Failed to load voucher metadata:", err);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [financeId, fetchMetadata]);

  // Fetch Next Number suggestion from server
  const fetchNextNumber = useCallback(async () => {
    const targetTypeId = voucherType.dbId || voucherType.code;
    if (!targetTypeId) return;

    try {
      const dateStr = format(voucherDate, "yyyy-MM-dd");
      const res = await apiGetNextVoucherNumber({
        type_id: targetTypeId,
        date: dateStr,
      });

      if (res.data?.success && res.data.data?.voucher_number) {
        setVoucherNumber(res.data.data.voucher_number);
      }
    } catch (err) {
      console.warn("Failed to fetch next voucher number:", err);
    }
  }, [voucherType.dbId, voucherType.code, voucherDate]);

  // Reset lines and update voucher number when voucher type changes
  useEffect(() => {
    setLines(initialLines(voucherType));
    if (!userEditedNumber && config.autoNumbering) {
      fetchNextNumber();
    } else if (!config.autoNumbering && !userEditedNumber) {
      setVoucherNumber("");
    }
  }, [voucherType, initialLines, config.autoNumbering, userEditedNumber, fetchNextNumber]);

  // When date changes, update number suggestion if autoNumbering is on and not edited
  useEffect(() => {
    if (!userEditedNumber && config.autoNumbering) {
      fetchNextNumber();
    }
  }, [voucherDate, config.autoNumbering, userEditedNumber, fetchNextNumber]);

  // Calculation in integer paise
  const paiseDr = useMemo(() => {
    return lines
      .filter((l) => l.type === "Dr")
      .reduce((s, l) => s + Math.round((Number(l.amount) || 0) * 100), 0);
  }, [lines]);

  const paiseCr = useMemo(() => {
    return lines
      .filter((l) => l.type === "Cr")
      .reduce((s, l) => s + Math.round((Number(l.amount) || 0) * 100), 0);
  }, [lines]);

  const totalDr = paiseDr / 100;
  const totalCr = paiseCr / 100;
  const diffPaise = Math.abs(paiseDr - paiseCr);
  const diff = diffPaise / 100;
  const isBalanced = diffPaise === 0 && paiseDr > 0;
  const balanceSuffix = paiseDr >= paiseCr ? "Dr" : "Cr";

  const addLine = (type: EntryType = "Cr") =>
    setLines((prev) => [...prev, { id: Date.now(), type, ledger_id: "", ledger: "", amount: 0, narration: "" }]);

  const removeLine = (id: number) => setLines((prev) => prev.filter((l) => l.id !== id));

  const updateLine = (id: number, field: keyof VoucherLine, value: string | number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (field === "ledger_id") {
          const chosen = liveLedgers.find((ld) => ld.id === value);
          return { ...l, ledger_id: String(value), ledger: chosen ? chosen.ledger_name : l.ledger };
        }
        return { ...l, [field]: value };
      })
    );
  };

  // Fetch Voucher Register
  const fetchRegister = useCallback(async () => {
    const reqFinance = activeFinanceIdRef.current;
    if (!reqFinance) return;

    setRegisterLoading(true);
    try {
      const typeParam = filterTypeId !== "all" ? filterTypeId : undefined;
      const res = await apiListVouchers({
        from: filterFrom || undefined,
        to: filterTo || undefined,
        type_id: typeParam,
        search: debouncedSearch || undefined,
        limit: 100,
      });

      if (activeFinanceIdRef.current !== reqFinance) return;

      if (res.data?.success) {
        setRegisterVouchers(res.data.data || []);
        setTotalCount(res.data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load voucher register:", err);
      toast.error("Failed to load voucher register");
    } finally {
      if (activeFinanceIdRef.current === reqFinance) {
        setRegisterLoading(false);
      }
    }
  }, [filterFrom, filterTo, filterTypeId, debouncedSearch]);

  useEffect(() => {
    if (activeTab === "register") {
      fetchRegister();
    }
  }, [activeTab, fetchRegister]);

  // Save Voucher
  const handleSave = useCallback(async () => {
    if (isSaving) return;

    // Validate date
    if (!config.allowFutureDate && voucherDate.getTime() > Date.now()) {
      toast.error("Future date not allowed");
      return;
    }

    // Validate entries
    if (lines.length < 2) {
      toast.error("A voucher must have at least one Dr and one Cr entry");
      return;
    }

    const missingLedger = lines.find((l) => !l.ledger_id || !l.ledger);
    if (missingLedger) {
      toast.error("Mandatory ledger missing on one or more lines");
      return;
    }

    const invalidAmount = lines.find((l) => !l.amount || l.amount <= 0);
    if (invalidAmount) {
      toast.error("Amount must be greater than zero on all lines");
      return;
    }

    if (!isBalanced) {
      toast.error(`Dr ≠ Cr (difference ₹${diff.toFixed(2)})`);
      return;
    }

    if (!config.autoNumbering && !voucherNumber.trim()) {
      toast.error("Voucher number is required");
      return;
    }

    // Rule engine check
    if (config.enforceRuleEngine) {
      for (const line of lines) {
        const currentLedger = liveLedgers.find((ld) => ld.id === line.ledger_id);
        const rule = voucherType.rule.find((r) => r.type === line.type);
        if (rule && currentLedger && !isLedgerAllowedForRule(currentLedger, rule.allowed)) {
          toast.error(
            `${line.type} of "${line.ledger}" violates ${voucherType.name} rule (expected: ${rule.allowed.join("/")})`
          );
          return;
        }
      }
    }

    const targetTypeId = voucherType.dbId || voucherType.code;
    if (!targetTypeId) {
      toast.error("Voucher type not resolved");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        voucher_type_id: targetTypeId,
        voucher_number: voucherNumber.trim() || undefined,
        date: format(voucherDate, "yyyy-MM-dd"),
        narration: narration.trim() || undefined,
        entries: lines.map((l) => ({
          ledger_id: l.ledger_id,
          type: l.type,
          amount: Number(l.amount),
          narration: l.narration.trim() || undefined,
        })),
      };

      const res = await apiCreateVoucher(payload);

      if (res.data?.success) {
        const postedNumber = res.data.data?.voucher_number || voucherNumber;
        toast.success(`Voucher ${postedNumber} posted`);

        // Reset form
        setLines(initialLines(voucherType));
        setNarration("");
        setUserEditedNumber(false);

        // Refresh suggestion & register
        if (config.autoNumbering) {
          fetchNextNumber();
        } else {
          setVoucherNumber("");
        }

        if (activeTab === "register") {
          fetchRegister();
        }
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      const message = axiosErr.response?.data?.message || axiosErr.message || "Failed to save voucher";
      toast.error(message);

      // On duplicate number error, re-fetch fresh suggestion
      if (axiosErr.response?.status === 409) {
        setUserEditedNumber(false);
        if (config.autoNumbering) {
          fetchNextNumber();
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    config.allowFutureDate,
    config.autoNumbering,
    config.enforceRuleEngine,
    voucherDate,
    lines,
    isBalanced,
    diff,
    voucherNumber,
    liveLedgers,
    voucherType,
    narration,
    initialLines,
    fetchNextNumber,
    activeTab,
    fetchRegister,
  ]);

  // Keyboard Shortcuts (Tally Prime style)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showConfig) return; // Managed by config dialog
      if (e.ctrlKey && e.key === "F5") { e.preventDefault(); setSelectedTypeCode("REC"); }
      if (e.ctrlKey && e.key === "F4") { e.preventDefault(); setSelectedTypeCode("PAY"); }
      if (e.ctrlKey && e.key === "F6") { e.preventDefault(); setSelectedTypeCode("CON"); }
      if (e.ctrlKey && e.key === "F7") { e.preventDefault(); setSelectedTypeCode("JRN"); }
      if (e.ctrlKey && e.key === "F8") { e.preventDefault(); setSelectedTypeCode("SAL"); }
      if (e.ctrlKey && e.key === "F9") { e.preventDefault(); setSelectedTypeCode("PUR"); }
      if (e.ctrlKey && e.key.toLowerCase() === "a") { e.preventDefault(); handleSave(); }
      if (e.key === "F2") { e.preventDefault(); setShowDatePicker(true); }
      if (e.key === "F12") { e.preventDefault(); setShowConfig(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, showConfig]);

  // Config Dialog Keyboard Shortcuts (Ctrl+A save, Esc close)
  useEffect(() => {
    if (!showConfig) return;
    const handleConfigKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowConfig(false);
      }
      if (e.ctrlKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setShowConfig(false);
        toast.success("Configuration saved");
      }
    };
    window.addEventListener("keydown", handleConfigKey);
    return () => window.removeEventListener("keydown", handleConfigKey);
  }, [showConfig]);

  const activeRule = voucherType.rule;

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Voucher Entry
          </h1>
          <p className="text-sm text-muted-foreground">
            Tally-style double-entry · {mergedVoucherTypes.length} voucher types · auto-posting enabled
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Header Dr / Cr / Balance Summary Pills */}
          <div className="dashboard-card !p-2 !rounded-lg flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Total Dr:</span>
            <span className="font-bold text-foreground">
              ₹{totalDr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">Total Cr:</span>
            <span className="font-bold text-foreground">
              ₹{totalCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">Balance:</span>
            <span className={`font-bold ${isBalanced ? "text-income" : "text-expense"}`}>
              ₹{diff.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {balanceSuffix}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
            <Settings className="h-3.5 w-3.5 mr-1" /> F12
          </Button>
        </div>
      </motion.div>

      {/* Keyboard Hint Badges */}
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="entry">Voucher Entry</TabsTrigger>
          <TabsTrigger value="register">Voucher Register</TabsTrigger>
          <TabsTrigger value="types">Voucher Types</TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: ENTRY ─── */}
        <TabsContent value="entry">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card space-y-5">
            {/* Top row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Voucher Type</Label>
                <Select value={voucherType.code} onValueChange={(v) => setSelectedTypeCode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mergedVoucherTypes.map((vt) => (
                      <SelectItem key={vt.code} value={vt.code}>
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
                <Input
                  value={voucherNumber}
                  onChange={(e) => {
                    setUserEditedNumber(true);
                    setVoucherNumber(e.target.value);
                  }}
                  placeholder={config.autoNumbering ? "Auto-generated on save" : "Enter voucher number"}
                  className="font-mono"
                />
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
                    <CalendarComp
                      mode="single"
                      selected={voucherDate}
                      disabled={(d) => (!config.allowFutureDate ? d.getTime() > Date.now() : false)}
                      onSelect={(d) => {
                        if (d) {
                          if (!config.allowFutureDate && d.getTime() > Date.now()) {
                            toast.error("Future date not allowed");
                            return;
                          }
                          setVoucherDate(d);
                          setShowDatePicker(false);
                        }
                      }}
                    />
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

            {/* Entries Table */}
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
                      const rule = activeRule.find((r) => r.type === line.type);
                      const allowedLedgers = liveLedgers.filter((l) => {
                        if (!config.enforceRuleEngine) return true;
                        if (!rule || rule.allowed.includes("*")) return true;
                        return isLedgerAllowedForRule(l, rule.allowed);
                      });

                      return (
                        <tr key={line.id} className="border-b border-border/50">
                          <td className="px-3 py-2">
                            <button
                              onClick={() => updateLine(line.id, "type", line.type === "Dr" ? "Cr" : "Dr")}
                              className={`px-3 py-1 rounded text-xs font-bold ${line.type === "Dr" ? "bg-primary/10 text-primary" : "bg-income/10 text-income"}`}
                            >
                              {line.type}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={line.ledger_id || ""}
                              onValueChange={(v) => updateLine(line.id, "ledger_id", v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder={rule?.hint || "Select ledger"} />
                              </SelectTrigger>
                              <SelectContent>
                                {allowedLedgers.map((l) => (
                                  <SelectItem key={l.id} value={l.id}>
                                    <span>{l.ledger_name}</span>
                                    <span className="text-[10px] text-muted-foreground ml-2">
                                      {l.group ? `(${l.group})` : ""}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={line.amount || ""}
                              onChange={(e) => updateLine(line.id, "amount", parseFloat(e.target.value) || 0)}
                              className="h-8 font-mono tabular-nums text-sm"
                              placeholder="0.00"
                            />
                          </td>
                          {config.enableNarration && (
                            <td className="px-3 py-2">
                              <Input
                                value={line.narration}
                                onChange={(e) => updateLine(line.id, "narration", e.target.value)}
                                className="h-8 text-sm"
                                placeholder="Narration"
                              />
                            </td>
                          )}
                          <td className="px-2 py-2">
                            {lines.length > 2 && (
                              <button
                                onClick={() => removeLine(line.id)}
                                className="text-muted-foreground hover:text-expense transition-colors"
                              >
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

            {/* Total & Balance Badge */}
            <div className={`flex items-center justify-between p-3 rounded-lg border ${isBalanced ? "bg-income/5 border-income/20" : diff > 0 ? "bg-expense/5 border-expense/20" : "bg-secondary/50 border-border"}`}>
              <div className="flex gap-6 text-sm">
                <span>Total Dr: <strong className="font-mono tabular-nums">₹{totalDr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                <span>Total Cr: <strong className="font-mono tabular-nums">₹{totalCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              </div>
              <div>
                {isBalanced ? (
                  <Badge className="bg-income/10 text-income border-income/30">✓ Balanced</Badge>
                ) : totalDr > 0 || totalCr > 0 ? (
                  <Badge variant="destructive" className="bg-expense/10 text-expense border-expense/30">
                    Difference: ₹{diff.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {totalDr > totalCr ? "(Dr excess)" : "(Cr excess)"}
                  </Badge>
                ) : null}
              </div>
            </div>

            {config.enableNarration && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Voucher Narration</Label>
                <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Description of this transaction..." />
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={!isBalanced || isSaving || lines.some((l) => !l.ledger_id || !l.amount)}
                className="gap-2"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Posting..." : "Save (Ctrl+A)"}
              </Button>
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={() => {
                  setLines(initialLines(voucherType));
                  setNarration("");
                  setUserEditedNumber(false);
                  if (config.autoNumbering) fetchNextNumber();
                  else setVoucherNumber("");
                }}
              >
                Clear
              </Button>
            </div>
          </motion.div>
        </TabsContent>

        {/* ─── TAB 2: REGISTER ─── */}
        <TabsContent value="register">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="dashboard-card !p-4 flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={filterTypeId} onValueChange={setFilterTypeId}>
                  <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {mergedVoucherTypes.map((vt) => (
                      <SelectItem key={vt.code} value={vt.dbId || vt.code}>
                        {vt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <DatePicker value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} placeholder="From Date" className="w-36" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <DatePicker value={filterTo} onChange={(e) => setFilterTo(e.target.value)} placeholder="To Date" className="w-36" />
              </div>
              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="No, ledger or narration..." className="h-8 pl-8" />
                </div>
              </div>
            </div>

            {/* Record count notice */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Showing {registerVouchers.length} of {totalCount} vouchers</span>
              {registerLoading && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</span>}
            </div>

            <div className="dashboard-card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50 sticky top-0">
                      {["Date", "No", "Type", "Ref", "Ledgers", "Amount", "Narration"].map((h) => (
                        <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {registerVouchers.map((v) => (
                      <VoucherRow key={v.id} voucher={v} voucherTypes={mergedVoucherTypes} />
                    ))}
                    {registerVouchers.length === 0 && !registerLoading && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No vouchers found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </TabsContent>

        {/* ─── TAB 3: TYPES MASTER ─── */}
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
                    {["Code", "Name", "Nature", "Cash Flow", "P&L", "Auto Source", "Rule (Dr / Cr)"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mergedVoucherTypes.map((vt) => (
                    <tr key={vt.code} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-2 font-mono text-xs text-primary">{vt.code}</td>
                      <td className="px-4 py-2 font-medium">
                        {vt.name}
                        <div className="text-[10px] text-muted-foreground">{vt.description}</div>
                      </td>
                      <td className="px-4 py-2"><Badge variant="outline" className={`text-[10px] ${NATURE_COLORS[vt.nature]}`}>{vt.nature}</Badge></td>
                      <td className="px-4 py-2 text-xs">{vt.affects_cash_flow ? "✓" : "—"}</td>
                      <td className="px-4 py-2 text-xs">{vt.affects_profit_loss ? "✓" : "—"}</td>
                      <td className="px-4 py-2 text-xs">
                        {vt.auto_source ? <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-accent/20">{vt.auto_source}</span> : "—"}
                      </td>
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

      {/* ─── F12 Configuration Dialog ─── */}
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
                <Switch
                  checked={config[key]}
                  onCheckedChange={(v) => handleConfigChange(key, v)}
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoucherRow({ voucher, voucherTypes }: { voucher: VoucherListItem; voucherTypes: VoucherTypeMaster[] }) {
  const [expanded, setExpanded] = useState(false);
  const vt = voucherTypes.find(
    (t) => t.dbId === voucher.type_id || t.code === voucher.type_code || t.name === voucher.type_name
  );
  const nature = vt?.nature || (voucher.type_class as VoucherNature) || "Special";
  const typeName = vt?.name || voucher.type_name || voucher.type_code;
  const total = voucher.total_amount;

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5 text-sm text-muted-foreground">{voucher.voucher_date}</td>
        <td className="px-4 py-2.5 text-sm font-mono text-primary">{voucher.voucher_number}</td>
        <td className="px-4 py-2.5">
          <Badge variant="outline" className={`text-[10px] ${NATURE_COLORS[nature] || NATURE_COLORS.Special}`}>
            {typeName}
          </Badge>
        </td>
        <td className="px-4 py-2.5 text-[10px] text-muted-foreground">
          <span className="font-mono">{voucher.financial_year || "—"}</span>
        </td>
        <td className="px-4 py-2.5 text-sm text-foreground">
          {voucher.entries.map((l) => l.ledger_name).join(", ") || "—"}
        </td>
        <td className="px-4 py-2.5 text-sm font-mono tabular-nums font-medium">
          ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{voucher.narration || "—"}</td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <td colSpan={7} className="px-4 pb-3 pt-0">
              <div className="ml-4 p-3 rounded-lg bg-secondary/30 border border-border/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left py-1 w-16">Type</th>
                      <th className="text-left py-1">Ledger</th>
                      <th className="text-left py-1">Narration</th>
                      <th className="text-right py-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voucher.entries.map((l, idx) => (
                      <tr key={idx}>
                        <td className="py-1">
                          <Badge variant="outline" className={`text-[10px] ${l.type === "Dr" ? "text-primary" : "text-income"}`}>
                            {l.type}
                          </Badge>
                        </td>
                        <td className="py-1 text-foreground">{l.ledger_name}</td>
                        <td className="py-1 text-muted-foreground">{l.narration || "—"}</td>
                        <td className="py-1 text-right font-mono tabular-nums">
                          ₹{l.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
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

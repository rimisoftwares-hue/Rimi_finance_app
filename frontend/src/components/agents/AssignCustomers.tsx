import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CapitalizedInput } from "../common/CapitalizedInput";
import { TableSkeletonRows } from "../common";
import { DatePicker } from "../ui/date-picker";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { useToast } from "../ui/use-toast";
import { useAuth } from "../../contexts/AuthContext";
import apiClient from "../../api/apiClient";
import {
  fetchAssignableCustomers,
  fetchAgentsWorkload,
  assignCustomers,
  fetchRunSheet,
} from "../../api/agentAssignmentApi";
import {
  AssignableCustomer,
  AgentWorkload,
  AssignmentPriority,
  RunSheetData,
} from "../../types/agentAssignment";
import {
  Search, Filter, ChevronDown, UserPlus, Users, AlertTriangle,
  CheckCircle2, X, Zap, Download, Printer, Loader2,
} from "lucide-react";

const riskColors = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  low: "bg-green-500/10 text-green-600 border-green-500/20",
};

const riskRowColors = {
  high: "bg-destructive/5",
  medium: "bg-yellow-500/5",
  low: "",
};

function formatIndianCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function printRunSheetHtml(htmlContent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement("iframe");
      iframe.id = "__run_sheet_print_frame__";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.setAttribute("title", "RunSheetPrintFrame");

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (!frameDoc || !iframe.contentWindow) {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        throw new Error("Unable to open print frame window");
      }

      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      let resolved = false;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          try {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          } catch {
            // Ignore frame removal errors
          }
        }
      };

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            cleanup();
            resolve();
          }, 1000);
        } catch (printErr) {
          cleanup();
          reject(printErr);
        }
      };

      // Fallback in case onload does not trigger
      setTimeout(() => {
        if (!resolved) {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              cleanup();
              resolve();
            }, 1000);
          } catch (e) {
            cleanup();
            reject(e);
          }
        }
      }, 500);
    } catch (err) {
      reject(err);
    }
  });
}

function generateRunSheetHtml(sheet: RunSheetData): string {
  const finPhones = sheet.finance.phones.length > 0 ? sheet.finance.phones.join(", ") : "—";
  const rowsHtml = sheet.rows
    .map(
      (r) => `
    <tr>
      <td class="text-center font-mono">${escapeHtml(r.sNo)}</td>
      <td class="font-semibold font-mono">${escapeHtml(r.hplNo)}</td>
      <td>
        <div class="font-semibold">${escapeHtml(r.customerName)}</div>
      </td>
      <td class="font-mono text-center">${escapeHtml(r.phone)}</td>
      <td>
        <div class="font-mono font-semibold">${escapeHtml(r.vehicleNumber)}</div>
        <div class="sub-text">${escapeHtml(r.vehicleModel)}</div>
      </td>
      <td class="address-cell">${escapeHtml(r.fullAddress)}</td>
      <td class="text-right font-semibold font-mono">₹${escapeHtml(formatIndianCurrency(r.balance))}</td>
      <td class="text-center font-mono">${escapeHtml(r.overdueDays)}d</td>
      <td class="text-center text-upper">${escapeHtml(r.priority)}</td>
      <td class="text-center font-mono">${escapeHtml(r.targetDate || "—")}</td>
      <td class="writing-box">${escapeHtml(r.notes || "")}</td>
      <td class="writing-box"></td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Agent Run-Sheet - ${escapeHtml(sheet.agent.name)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Latha", "Mukta Malar", "Tamil Sangam MN", Helvetica, Arial, sans-serif;
    }
    body {
      background: #fff;
      color: #111;
      font-size: 10.5px;
      line-height: 1.25;
      padding: 4px;
    }
    .header-box {
      border-bottom: 2px solid #222;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .fin-title-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .fin-name {
      font-size: 17px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .sheet-badge {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #111;
      text-transform: uppercase;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      font-size: 10.5px;
      color: #333;
    }
    .summary-pills {
      display: flex;
      gap: 12px;
      align-items: center;
      background: #f4f4f4;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 4px 10px;
      font-weight: 600;
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    th {
      background: #f0f0f0;
      color: #111;
      font-weight: 700;
      font-size: 9.5px;
      text-transform: uppercase;
      border: 1px solid #888;
      padding: 4px 3px;
      text-align: left;
    }
    td {
      border: 1px solid #bbb;
      padding: 4px 3px;
      font-size: 10px;
      vertical-align: top;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-upper { text-transform: uppercase; }
    .font-semibold { font-weight: 600; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .sub-text { font-size: 8.5px; color: #555; }
    .address-cell { max-width: 170px; word-break: break-word; font-size: 9.5px; }
    .writing-box { min-width: 80px; height: 28px; }
    .totals-row td {
      background: #f0f0f0;
      font-weight: 700;
      border-top: 2px solid #222;
      border-bottom: 2px solid #222;
      font-size: 11px;
    }
    .footer-signatures {
      margin-top: 25px;
      display: flex;
      justify-content: space-between;
      padding: 0 50px;
      page-break-inside: avoid;
    }
    .sig-line {
      border-top: 1px solid #333;
      width: 220px;
      text-align: center;
      padding-top: 5px;
      font-weight: 600;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header-box">
    <div class="fin-title-row">
      <div class="fin-name">${escapeHtml(sheet.finance.name)}</div>
      <div class="sheet-badge">AGENT FIELD COLLECTION RUN-SHEET</div>
    </div>
    <div class="meta-row">
      <div>
        <span><strong>Address:</strong> ${escapeHtml(sheet.finance.address)}</span>
        <span style="margin-left: 12px;"><strong>Phone:</strong> ${escapeHtml(finPhones)}</span>
      </div>
      <div><strong>Printed:</strong> ${escapeHtml(sheet.printedAt.replace("T", " ").split(".")[0])}</div>
    </div>
    <div class="meta-row" style="margin-top: 5px;">
      <div>
        <span><strong>Agent:</strong> ${escapeHtml(sheet.agent.name)} (${escapeHtml(sheet.agent.phone || "—")})</span>
        <span style="margin-left: 14px;"><strong>Territory:</strong> ${escapeHtml(sheet.agent.area)}</span>
      </div>
      <div class="summary-pills">
        <span>Total Accounts: ${escapeHtml(sheet.totals.customersCount)}</span>
        <span>|</span>
        <span>Total Due: ₹${escapeHtml(formatIndianCurrency(sheet.totals.totalBalance))}</span>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 25px;" class="text-center">S.No</th>
        <th style="width: 60px;">HPL No</th>
        <th style="width: 110px;">Customer</th>
        <th style="width: 75px;" class="text-center">Phone</th>
        <th style="width: 100px;">Vehicle & Model</th>
        <th>Address</th>
        <th style="width: 75px;" class="text-right">Due Amount</th>
        <th style="width: 50px;" class="text-center">Overdue</th>
        <th style="width: 50px;" class="text-center">Priority</th>
        <th style="width: 70px;" class="text-center">Target Date</th>
        <th style="width: 85px;">Remarks</th>
        <th style="width: 85px;">Customer Sign</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="totals-row">
        <td colspan="6" class="text-right font-semibold">TOTAL DUE (${escapeHtml(sheet.totals.customersCount)} Accounts)</td>
        <td class="text-right font-mono font-semibold">₹${escapeHtml(formatIndianCurrency(sheet.totals.totalBalance))}</td>
        <td colspan="5"></td>
      </tr>
    </tbody>
  </table>

  <div class="footer-signatures">
    <div class="sig-line">Agent Signature</div>
    <div class="sig-line">Manager Signature</div>
  </div>
</body>
</html>`;
}

export default function AssignCustomers() {
  const { toast } = useToast();
  const { currentFinance } = useAuth();

  // Data states
  const [customers, setCustomers] = useState<AssignableCustomer[]>([]);
  const [agents, setAgents] = useState<AgentWorkload[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [printingAgentId, setPrintingAgentId] = useState<string | null>(null);

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    city: "",
    village: "",
    street: "",
    broker: "",
    vehicleType: "",
    dealer: "",
    financeName: "",
    hpDateFrom: "",
    hpDateTo: "",
    dueDaysFrom: "",
    dueDaysTo: "",
    pendingFrom: "",
    pendingTo: "",
    riskLevel: "all" as "all" | "low" | "medium" | "high",
    assignment: "all" as "all" | "assigned" | "unassigned",
  });

  // Dynamic suggestions for city, village, street
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [villageSuggestions, setVillageSuggestions] = useState<string[]>([]);
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  // Assignment form state
  const [assignAgent, setAssignAgent] = useState("");
  const [assignPriority, setAssignPriority] = useState<AssignmentPriority>("medium");
  const [assignTargetDate, setAssignTargetDate] = useState("");
  const [assignNotes, setAssignNotes] = useState("");

  const reqIdRef = useRef(0);

  // 350 ms debounce for search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load assignable customers from API
  const loadCustomers = useCallback(
    async (signal?: AbortSignal) => {
      const currentReqId = ++reqIdRef.current;

      try {
        setLoading(true);

        const params = {
          search: debouncedSearch.trim() || undefined,
          city: filters.city || undefined,
          street: filters.street || undefined,
          village: filters.village || undefined,
          broker: filters.broker || undefined,
          vehicleType: filters.vehicleType || undefined,
          hpDateFrom: filters.hpDateFrom || undefined,
          hpDateTo: filters.hpDateTo || undefined,
          dueDaysMin: filters.dueDaysFrom || undefined,
          dueDaysMax: filters.dueDaysTo || undefined,
          dueAmountMin: filters.pendingFrom || undefined,
          dueAmountMax: filters.pendingTo || undefined,
          riskLevel: filters.riskLevel !== "all" ? filters.riskLevel : undefined,
          assignment: filters.assignment !== "all" ? filters.assignment : undefined,
          limit: 200,
          offset: 0,
        };

        const res = await fetchAssignableCustomers(params, signal);

        // Guard against race conditions / stale responses
        if (currentReqId !== reqIdRef.current) return;

        if (res && res.success) {
          const loadedRows = res.data || [];
          setCustomers(loadedRows);
          setTotalCustomers(res.total ?? loadedRows.length);

          // Keep selected ids that are still in the loaded list; drop the rest
          setSelectedIds((prev) => prev.filter((id) => loadedRows.some((c) => c.customerId === id)));
        } else {
          setCustomers([]);
          setTotalCustomers(0);
        }
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.name === "AbortError") return;
        if (currentReqId !== reqIdRef.current) return;
        console.error("Error loading assignable customers:", err);
        toast({
          title: "Error",
          description: err?.response?.data?.error || err?.message || "Failed to load customers",
          variant: "destructive",
        });
        setCustomers([]);
        setTotalCustomers(0);
      } finally {
        if (currentReqId === reqIdRef.current) {
          setLoading(false);
        }
      }
    },
    [debouncedSearch, filters, toast]
  );

  // Load assignable agents workload from API
  const loadAgents = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetchAgentsWorkload(signal);
        if (res && res.success) {
          setAgents(res.data || []);
        } else {
          setAgents([]);
        }
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.name === "AbortError") return;
        console.error("Error loading agents:", err);
        toast({
          title: "Error",
          description: err?.response?.data?.error || err?.message || "Failed to load agents",
          variant: "destructive",
        });
        setAgents([]);
      }
    },
    [toast]
  );

  // Refetch when currentFinance?.id changes
  useEffect(() => {
    if (!currentFinance?.id) return;
    const controller = new AbortController();
    loadCustomers(controller.signal);
    loadAgents(controller.signal);

    return () => {
      controller.abort();
    };
  }, [currentFinance?.id, loadCustomers, loadAgents]);

  // Fetch address suggestions dynamically
  const fetchAddressSuggestions = useCallback(async (field: "street_name" | "village" | "city", query: string) => {
    if (!query || query.trim().length < 2) {
      if (field === "city") setCitySuggestions([]);
      if (field === "village") setVillageSuggestions([]);
      if (field === "street_name") setStreetSuggestions([]);
      return;
    }
    try {
      const res = await apiClient.get<{ success: boolean; suggestions: Array<{ value: string; label: string }> }>(
        `/address/suggestions/${field}?q=${encodeURIComponent(query.trim())}`
      );
      const values = (res.data?.suggestions || []).map((s) => s.value).filter(Boolean);
      if (field === "city") setCitySuggestions(values);
      if (field === "village") setVillageSuggestions(values);
      if (field === "street_name") setStreetSuggestions(values);
    } catch {
      // Ignore suggestion errors
    }
  }, []);

  // Filter validation and change handler
  const handleFilterChange = (key: string, value: string) => {
    // Validate range min <= max
    if (key === "dueDaysTo" && value && filters.dueDaysFrom && Number(value) < Number(filters.dueDaysFrom)) {
      toast({
        title: "Validation Warning",
        description: "Due Days 'To' cannot be less than 'From'",
        variant: "destructive",
      });
      return;
    }
    if (key === "pendingTo" && value && filters.pendingFrom && Number(value) < Number(filters.pendingFrom)) {
      toast({
        title: "Validation Warning",
        description: "Due Amount 'To' cannot be less than 'From'",
        variant: "destructive",
      });
      return;
    }
    if (key === "hpDateTo" && value && filters.hpDateFrom && value < filters.hpDateFrom) {
      toast({
        title: "Validation Warning",
        description: "HP Date 'To' cannot be earlier than 'From'",
        variant: "destructive",
      });
      return;
    }

    setFilters((prev) => ({ ...prev, [key]: value }));

    // Trigger suggestions
    if (key === "city") fetchAddressSuggestions("city", value);
    if (key === "village") fetchAddressSuggestions("village", value);
    if (key === "street") fetchAddressSuggestions("street_name", value);
  };

  const clearAllFilters = () => {
    setFilters({
      city: "",
      village: "",
      street: "",
      broker: "",
      vehicleType: "",
      dealer: "",
      financeName: "",
      hpDateFrom: "",
      hpDateTo: "",
      dueDaysFrom: "",
      dueDaysTo: "",
      pendingFrom: "",
      pendingTo: "",
      riskLevel: "all",
      assignment: "all",
    });
    setSearchTerm("");
    setDebouncedSearch("");
    setCitySuggestions([]);
    setVillageSuggestions([]);
    setStreetSuggestions([]);
  };

  // Selection handlers
  const toggleSelect = (customerId: string) => {
    setSelectedIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  };

  const selectAll = () => {
    setSelectedIds(customers.map((c) => c.customerId));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const allSelected = customers.length > 0 && customers.every((c) => selectedIds.includes(c.customerId));

  // Area-match suggestion: preserved from original file, now operating on real data
  const suggestedAgent = useMemo(() => {
    if (selectedIds.length === 0 || agents.length === 0) return null;
    const areas = customers
      .filter((c) => selectedIds.includes(c.customerId))
      .map((c) => c.area.toLowerCase());

    const matched = agents.find((a) =>
      areas.some((area) => a.area.toLowerCase().includes(area) || area.includes(a.area.toLowerCase()))
    );

    return (
      matched ||
      agents.reduce(
        (min, a) => (a.pendingCount < min.pendingCount ? a : min),
        agents[0]
      )
    );
  }, [selectedIds, customers, agents]);

  // Selected customers details
  const selectedCustomers = useMemo(
    () => customers.filter((c) => selectedIds.includes(c.customerId)),
    [customers, selectedIds]
  );

  // How many selected customers are currently assigned to a DIFFERENT agent
  const reassignmentsCount = useMemo(() => {
    if (!assignAgent) return 0;
    return selectedCustomers.filter(
      (c) => c.currentAgentId && c.currentAgentId !== assignAgent
    ).length;
  }, [selectedCustomers, assignAgent]);

  // Handle assignment submission
  const handleAssignSubmit = async () => {
    if (!assignAgent || selectedIds.length === 0 || submitting) return;

    // Validate target date not in the past
    if (assignTargetDate) {
      const todayStr = new Date().toISOString().split("T")[0];
      if (assignTargetDate < todayStr) {
        toast({
          title: "Invalid Target Date",
          description: "Target completion date cannot be in the past.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      setSubmitting(true);

      const payload = {
        customerIds: selectedIds,
        agentId: assignAgent,
        priority: assignPriority,
        targetDate: assignTargetDate || undefined,
        notes: assignNotes.trim() || undefined,
      };

      const res = await assignCustomers(payload);

      if (res && res.success) {
        setShowConfirm(false);

        // Build descriptive summary toast
        let desc = `Successfully assigned ${res.assignedCount} customer(s).`;
        if (res.reassignedFromOthers > 0) {
          desc += ` (${res.reassignedFromOthers} reassigned from other agents).`;
        }
        if (res.skipped && res.skipped.length > 0) {
          const reasons = [...new Set(res.skipped.map((s) => s.reason))].join(", ");
          desc += ` ${res.skipped.length} skipped (${reasons}).`;
        }

        toast({
          title: "Assignment Updated",
          description: desc,
        });

        // Reset inputs and selection
        setSelectedIds([]);
        setAssignAgent("");
        setAssignPriority("medium");
        setAssignTargetDate("");
        setAssignNotes("");

        // Refetch customers and agents
        loadCustomers();
        loadAgents();
      } else {
        throw new Error(res?.error || "Assignment request failed");
      }
    } catch (err: any) {
      console.error("Assignment error:", err);
      const isConflict = err?.response?.status === 409;
      toast({
        title: isConflict ? "Assignment Conflict" : "Assignment Error",
        description:
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to assign customers to agent.",
        variant: "destructive",
      });

      // On 409 conflict, refetch to sync live assignments
      if (isConflict) {
        loadCustomers();
        loadAgents();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Handle printing field run-sheet
  const handlePrintRunSheet = async (agent: AgentWorkload) => {
    if (agent.assignedCount === 0) {
      toast({
        title: "No customers assigned",
        description: `${agent.name} currently has no assigned customers to print.`,
      });
      return;
    }

    try {
      setPrintingAgentId(agent.id);
      const res = await fetchRunSheet(agent.id);
      if (res && res.success && res.data) {
        const html = generateRunSheetHtml(res.data);
        await printRunSheetHtml(html);
      } else {
        throw new Error(res?.error || "Unable to load run-sheet data");
      }
    } catch (err: any) {
      console.error("Run-sheet printing error:", err);
      toast({
        title: "Print Failed",
        description:
          err?.response?.data?.error ||
          err?.message ||
          "Could not open print window for run-sheet.",
        variant: "destructive",
      });
    } finally {
      setPrintingAgentId(null);
    }
  };

  // Distinct brokers from current loaded customers
  const brokerOptions = useMemo(() => {
    return [...new Set(customers.map((c) => c.broker).filter(Boolean))].sort();
  }, [customers]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assign Customers</h1>
          <p className="text-sm text-muted-foreground">Select customers and assign to collection agents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadCustomers(); loadAgents(); }} disabled={loading}>
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
        </div>
      </div>

      {/* Search + Filter */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <CapitalizedInput
                casing="none"
                placeholder="Search HPL No, Name, Phone, Vehicle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => setFiltersOpen(!filtersOpen)}>
              <Filter className="h-4 w-4 mr-1" />Filters
              <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>
          <AnimatePresence>
            {filtersOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border">
                  {/* City with suggestions */}
                  <div className="relative">
                    <CapitalizedInput
                      casing="words"
                      placeholder="City"
                      value={filters.city}
                      onChange={(e) => handleFilterChange("city", e.target.value)}
                    />
                    {citySuggestions.length > 0 && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-36 overflow-y-auto py-1">
                        {citySuggestions.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/70 transition-colors text-foreground"
                            onClick={() => {
                              handleFilterChange("city", c);
                              setCitySuggestions([]);
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Street with suggestions */}
                  <div className="relative">
                    <CapitalizedInput
                      casing="words"
                      placeholder="Street"
                      value={filters.street}
                      onChange={(e) => handleFilterChange("street", e.target.value)}
                    />
                    {streetSuggestions.length > 0 && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-36 overflow-y-auto py-1">
                        {streetSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/70 transition-colors text-foreground"
                            onClick={() => {
                              handleFilterChange("street", s);
                              setStreetSuggestions([]);
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Village with suggestions */}
                  <div className="relative">
                    <CapitalizedInput
                      casing="words"
                      placeholder="Village"
                      value={filters.village}
                      onChange={(e) => handleFilterChange("village", e.target.value)}
                    />
                    {villageSuggestions.length > 0 && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-36 overflow-y-auto py-1">
                        {villageSuggestions.map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/70 transition-colors text-foreground"
                            onClick={() => {
                              handleFilterChange("village", v);
                              setVillageSuggestions([]);
                            }}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Broker select */}
                  <Select value={filters.broker || "all"} onValueChange={(v) => handleFilterChange("broker", v === "all" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Broker" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Brokers</SelectItem>
                      {brokerOptions.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Vehicle Type */}
                  <Select value={filters.vehicleType || "all"} onValueChange={(v) => handleFilterChange("vehicleType", v === "all" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Vehicle Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Vehicle Types</SelectItem>
                      <SelectItem value="Two Wheeler">Two Wheeler</SelectItem>
                      <SelectItem value="Four Wheeler">Four Wheeler</SelectItem>
                      <SelectItem value="Three Wheeler">Three Wheeler</SelectItem>
                      <SelectItem value="Commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Risk Level */}
                  <Select value={filters.riskLevel} onValueChange={(v: "all" | "low" | "medium" | "high") => handleFilterChange("riskLevel", v)}>
                    <SelectTrigger><SelectValue placeholder="Risk Level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Risk Levels</SelectItem>
                      <SelectItem value="low">🟢 Low (0-30d)</SelectItem>
                      <SelectItem value="medium">🟡 Medium (31-60d)</SelectItem>
                      <SelectItem value="high">🔴 High (&gt;60d)</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Assignment Status */}
                  <Select value={filters.assignment} onValueChange={(v: "all" | "assigned" | "unassigned") => handleFilterChange("assignment", v)}>
                    <SelectTrigger><SelectValue placeholder="Assignment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assignments</SelectItem>
                      <SelectItem value="unassigned">Unassigned Only</SelectItem>
                      <SelectItem value="assigned">Assigned Only</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* HP Date Range */}
                  <div className="flex gap-2">
                    <DatePicker
                      placeholder="HP From"
                      value={filters.hpDateFrom}
                      onValueChange={(v) => handleFilterChange("hpDateFrom", v)}
                    />
                    <DatePicker
                      placeholder="To"
                      value={filters.hpDateTo}
                      onValueChange={(v) => handleFilterChange("hpDateTo", v)}
                    />
                  </div>

                  {/* Due Days Range */}
                  <div className="flex gap-2">
                    <CapitalizedInput
                      casing="none"
                      placeholder="Due Days From"
                      type="number"
                      value={filters.dueDaysFrom}
                      onChange={(e) => handleFilterChange("dueDaysFrom", e.target.value)}
                    />
                    <CapitalizedInput
                      casing="none"
                      placeholder="To"
                      type="number"
                      value={filters.dueDaysTo}
                      onChange={(e) => handleFilterChange("dueDaysTo", e.target.value)}
                    />
                  </div>

                  {/* Amount Range */}
                  <div className="flex gap-2">
                    <CapitalizedInput
                      casing="none"
                      placeholder="Amount From"
                      type="number"
                      value={filters.pendingFrom}
                      onChange={(e) => handleFilterChange("pendingFrom", e.target.value)}
                    />
                    <CapitalizedInput
                      casing="none"
                      placeholder="To"
                      type="number"
                      value={filters.pendingTo}
                      onChange={(e) => handleFilterChange("pendingTo", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                    <X className="h-3 w-3 mr-1" />Clear All
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer Table */}
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[60vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => (allSelected ? clearSelection() : selectAll())}
                        />
                      </TableHead>
                      <TableHead className="w-12">S.No</TableHead>
                      <TableHead>HPL No</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-center">Overdue</TableHead>
                      <TableHead className="text-center">Risk</TableHead>
                      <TableHead>Assigned To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeletonRows columns={10} rows={6} />
                    ) : customers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-32 text-center text-muted-foreground text-sm">
                          No unpaid customers found matching criteria
                        </TableCell>
                      </TableRow>
                    ) : (
                      customers.map((c, i) => (
                        <TableRow
                          key={c.customerId}
                          className={`cursor-pointer transition-colors ${selectedIds.includes(c.customerId) ? "bg-primary/5" : riskRowColors[c.riskLevel]
                            }`}
                          onClick={() => toggleSelect(c.customerId)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.includes(c.customerId)}
                              onCheckedChange={() => toggleSelect(c.customerId)}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="font-semibold text-foreground text-xs">{c.hplNo}</div>
                            <div className="text-[11px] text-muted-foreground">{c.name}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{c.vehicleNumber}</div>
                            <div className="text-[10px] text-muted-foreground">{c.vehicleName}</div>
                          </TableCell>
                          <TableCell className="text-xs">{c.phone}</TableCell>
                          <TableCell className="text-xs">{c.area}</TableCell>
                          <TableCell className="text-right font-semibold text-xs">
                            ₹{formatIndianCurrency(c.balance)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-medium">{c.overdueDays}d</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[10px] capitalize ${riskColors[c.riskLevel]}`}>
                              {c.riskLevel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {c.currentAgentName ? (
                              <span className="font-medium text-foreground">{c.currentAgentName}</span>
                            ) : (
                              <span className="text-muted-foreground italic">Unassigned</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalCustomers > customers.length && (
                <div className="p-2.5 text-xs text-muted-foreground text-center border-t border-border">
                  Showing {customers.length} of {totalCustomers} accounts
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Assignment Panel */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />Assign Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestedAgent && selectedIds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-2.5 rounded-lg bg-primary/5 border border-primary/20"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1">
                    <Zap className="h-3 w-3" />AI Suggestion
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {suggestedAgent.name} — {suggestedAgent.pendingCount} pending, covers {suggestedAgent.area}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() => setAssignAgent(String(suggestedAgent.id))}
                  >
                    Use Suggestion
                  </Button>
                </motion.div>
              )}

              <Select value={assignAgent} onValueChange={setAssignAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      <div className="flex items-center justify-between w-full">
                        <span>{a.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">({a.pendingCount} pending)</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={assignPriority} onValueChange={(v: AssignmentPriority) => setAssignPriority(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">🔴 Urgent</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="low">🟢 Low</SelectItem>
                </SelectContent>
              </Select>

              <DatePicker
                placeholder="Target Completion Date"
                value={assignTargetDate}
                onValueChange={setAssignTargetDate}
                min={new Date().toISOString().split("T")[0]}
              />

              <Textarea
                placeholder="Notes / Instructions..."
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value.slice(0, 1000))}
                className="min-h-[60px]"
                maxLength={1000}
              />

              <Button
                className="w-full"
                disabled={selectedIds.length === 0 || !assignAgent || submitting}
                onClick={() => setShowConfirm(true)}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                Assign {selectedIds.length > 0 ? `(${selectedIds.length})` : ""} Customers
              </Button>
            </CardContent>
          </Card>

          {/* Workload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />Agent Workload
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No active agents found</p>
              ) : (
                agents.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{a.area}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{a.assignedCount}</p>
                        <p className="text-[10px] text-muted-foreground">{a.pendingCount} pending</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        disabled={printingAgentId === a.id}
                        onClick={() => handlePrintRunSheet(a)}
                        title="Print Agent Run-Sheet"
                      >
                        {printingAgentId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Printer className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky Selection Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-lg rounded-xl px-6 py-3 flex items-center gap-4"
          >
            <span className="text-sm font-semibold text-foreground">{selectedIds.length} Customers Selected</span>
            <Button size="sm" variant="outline" onClick={clearSelection}>
              <X className="h-3 w-3 mr-1" />Clear
            </Button>
            <Button size="sm" disabled={!assignAgent || submitting} onClick={() => setShowConfirm(true)}>
              <UserPlus className="h-3 w-3 mr-1" />Assign
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Assignment</DialogTitle>
            <DialogDescription>Review and confirm the agent assignment details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Customers</span>
              <span className="font-semibold">{selectedIds.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Agent</span>
              <span className="font-semibold">
                {agents.find((a) => String(a.id) === assignAgent)?.name || "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Priority</span>
              <Badge variant="outline" className="capitalize">{assignPriority}</Badge>
            </div>
            {assignTargetDate && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Target Date</span>
                <span className="font-semibold">{assignTargetDate}</span>
              </div>
            )}
            {assignNotes && (
              <div className="text-sm">
                <span className="text-muted-foreground">Notes: </span>
                {assignNotes}
              </div>
            )}
            {reassignmentsCount > 0 && (
              <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Notice:</strong> {reassignmentsCount} of the selected customer(s) are currently assigned to another agent and will be reassigned.
                </span>
              </div>
            )}
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Selected Customers:</p>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {selectedCustomers.map((c) => (
                  <Badge key={c.customerId} variant="secondary" className="text-[10px]">
                    {c.hplNo}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleAssignSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Confirm Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

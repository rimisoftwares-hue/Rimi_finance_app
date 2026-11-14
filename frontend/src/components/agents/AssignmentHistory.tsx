import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { CapitalizedInput } from "../common/CapitalizedInput";
import { TableSkeletonRows, TablePagination } from "../common";
import { DatePicker } from "../ui/date-picker";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useClientPagination } from "../../hooks/useClientPagination";
import {
  Search,
  Calendar,
  Eye,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Download,
  ArrowLeft,
  Printer,
  MapPin,
  User,
  Phone,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../ui/use-toast";
import {
  AssignmentBatch,
  AssignmentHistoryKpis,
  AssignmentBatchDetails,
  BatchDetailCustomer,
  EffectiveStatus,
} from "../../types/agentAssignment";
import {
  fetchAssignmentHistory,
  fetchAssignmentHistoryDetails,
} from "../../api/agentAssignmentApi";

function formatCurrency(num: number): string {
  return Number(num || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20" },
  visited: { label: "Visited", icon: CheckCircle2, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  collected: { label: "Collected", icon: CheckCircle2, color: "bg-green-500/10 text-green-600 dark:text-emerald-400 border-green-500/20" },
  partial: { label: "Partial", icon: Clock, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  failed: { label: "Failed", icon: XCircle, color: "bg-destructive/10 text-destructive border-destructive/20" },
  reassigned: { label: "Reassigned", icon: RefreshCw, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  seized: { label: "Bike Seized", icon: AlertTriangle, color: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function AssignmentHistory() {
  const { user, currentFinance } = useAuth();
  const { toast } = useToast();
  const isAgent = user?.role === "agent";

  // Local date defaults (last 30 days to today)
  const defaultDates = useMemo(() => {
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    return {
      from: formatDate(past),
      to: formatDate(now),
    };
  }, []);

  const [dateFrom, setDateFrom] = useState(defaultDates.from);
  const [dateTo, setDateTo] = useState(defaultDates.to);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");

  // Server data states
  const [batches, setBatches] = useState<AssignmentBatch[]>([]);
  const [kpis, setKpis] = useState<AssignmentHistoryKpis>({
    totalAssignments: 0,
    pendingCount: 0,
    collectedCount: 0,
    seizedCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Detail view state
  const [selectedBatch, setSelectedBatch] = useState<AssignmentBatch | null>(null);
  const [batchDetails, setBatchDetails] = useState<AssignmentBatchDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load batches and KPIs from server
  const loadHistory = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    try {
      const res = await fetchAssignmentHistory(
        {
          dateFrom,
          dateTo,
          agentId: agentFilter !== "all" ? agentFilter : undefined,
        },
        controller.signal
      );

      if (res.success && res.data) {
        setBatches(res.data.batches || []);
        setKpis(res.data.kpis || { totalAssignments: 0, pendingCount: 0, collectedCount: 0, seizedCount: 0 });
      } else {
        toast({
          title: "Failed to load history",
          description: res.error || "Could not retrieve assignment history.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      console.error("Error loading assignment history:", err);
      toast({
        title: "Error",
        description: err?.response?.data?.error || err?.message || "Failed to load assignment history.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, agentFilter, toast]);

  useEffect(() => {
    loadHistory();
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [loadHistory, currentFinance?.id]);

  // Load detail view for a batch
  const openBatchDetails = async (batch: AssignmentBatch) => {
    setSelectedBatch(batch);
    setIsLoadingDetails(true);
    try {
      const res = await fetchAssignmentHistoryDetails({
        agentId: batch.agentId,
        date: batch.assignedDate,
        targetDate: batch.targetDate,
        assignedBy: batch.assignedBy,
      });

      if (res.success && res.data) {
        setBatchDetails(res.data);
      } else {
        toast({
          title: "Error",
          description: res.error || "Failed to load batch details.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("Error fetching batch details:", err);
      toast({
        title: "Failed to load batch details",
        description: err?.response?.data?.error || err?.message || "Could not load batch records.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Distinct agent names for dropdown
  const agentOptions = useMemo(() => {
    return Array.from(new Set(batches.map((b) => b.agentName))).sort();
  }, [batches]);

  // Client-side filtering over loaded batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const s = searchTerm.toLowerCase().trim();
      if (s) {
        const matchAgent = b.agentName.toLowerCase().includes(s);
        const matchAssignedBy = b.assignedByName.toLowerCase().includes(s);
        const matchArea = b.allocatedAreas.some((a) => a.toLowerCase().includes(s));
        const matchPhone = b.agentPhone.toLowerCase().includes(s);
        if (!matchAgent && !matchAssignedBy && !matchArea && !matchPhone) return false;
      }
      if (statusFilter !== "all" && b.batchStatus !== statusFilter) return false;
      if (agentFilter !== "all" && b.agentName !== agentFilter) return false;
      return true;
    });
  }, [batches, searchTerm, statusFilter, agentFilter]);

  const batchCustomers = useMemo(() => batchDetails?.customers ?? [], [batchDetails]);

  const mainPagination = useClientPagination(filteredBatches, {
    initialPageSize: 15,
    resetKey: `${searchTerm}|${statusFilter}|${agentFilter}|${dateFrom}|${dateTo}`,
  });

  const detailPagination = useClientPagination(batchCustomers, {
    initialPageSize: 15,
    resetKey: `${selectedBatch?.agentId ?? ""}|${selectedBatch?.assignedDate ?? ""}`,
  });

  // CSV Export for current filtered batches
  const handleExportCsv = () => {
    if (filteredBatches.length === 0) {
      toast({ title: "No data to export", description: "There are no batches matching current filters." });
      return;
    }

    const headers = [
      "Date",
      "Target Date",
      "Agent Name",
      "Phone",
      "Allocated Areas",
      "Customers",
      "Seized",
      "Assigned By",
      "Target Due",
      "Collected Due",
      "Penalty Collected",
      "Status",
    ];

    const rows = filteredBatches.map((b) => [
      b.assignedDate,
      b.targetDate || "—",
      `"${b.agentName.replace(/"/g, '""')}"`,
      b.agentPhone || "—",
      `"${b.allocatedAreas.join(", ").replace(/"/g, '""')}"`,
      b.customerCount,
      b.seizedCount,
      `"${b.assignedByName.replace(/"/g, '""')}"`,
      b.targetDueAmount,
      b.collectedDueAmount,
      b.penaltyCollected,
      b.batchStatus,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `assignment_batches_${dateFrom}_to_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Batch Run-Sheet
  const handlePrintBatch = () => {
    if (!batchDetails) return;
    setIsPrinting(true);
    try {
      const financeName = currentFinance?.name || "Finance Company";
      const rowsHtml = batchDetails.customers
        .map(
          (c, idx) => `
        <tr>
          <td style="text-align: center; font-family: monospace;">${idx + 1}</td>
          <td style="font-weight: 600; font-family: monospace;">HPL ${c.hplno}</td>
          <td><strong>${c.customerName}</strong></td>
          <td style="font-family: monospace; text-align: center;">${c.phone}</td>
          <td>
            <div style="font-family: monospace; font-weight: 600;">${c.vehicleNumber}</div>
            <div style="font-size: 9px; color: #666;">${c.vehicleModel}</div>
          </td>
          <td>${c.customerAddress}</td>
          <td style="text-align: right; font-weight: 600; font-family: monospace;">₹${formatCurrency(c.targetDue)}</td>
          <td style="text-align: center; font-weight: 600; text-transform: uppercase;">${c.priority}</td>
          <td style="font-size: 10px;">${c.notes || ""}</td>
          <td style="width: 40px; border: 1px solid #333;"></td>
          <td style="width: 80px; border: 1px solid #333;"></td>
        </tr>`
        )
        .join("");

      const areasText =
        batchDetails.agent.allocatedAreas.length > 0
          ? batchDetails.agent.allocatedAreas.join(", ")
          : "All Areas";

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Batch Run-Sheet - ${batchDetails.agent.name}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #fff; color: #111; font-size: 10.5px; padding: 8px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 8px; }
    .header h1 { font-size: 18px; font-weight: bold; }
    .header .meta { font-size: 11px; color: #333; }
    .agent-box { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f4f4f4; padding: 8px; border-radius: 4px; margin-bottom: 10px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #e5e5e5; font-weight: bold; text-align: left; padding: 5px 6px; font-size: 10px; border: 1px solid #ccc; }
    td { padding: 5px 6px; border: 1px solid #ccc; font-size: 10px; vertical-align: middle; }
    .footer { margin-top: 24px; display: flex; justify-content: space-between; font-size: 11px; padding-top: 16px; border-top: 1px dashed #999; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${financeName}</h1>
      <div class="meta">Assignment Run-Sheet — Batch Date: ${batchDetails.assignmentMeta.assignedDate}</div>
    </div>
    <div style="text-align: right;">
      <div class="meta">Target Date: ${batchDetails.assignmentMeta.targetDate || "—"}</div>
      <div class="meta">Printed: ${new Date().toLocaleString()}</div>
    </div>
  </div>

  <div class="agent-box">
    <div><strong>Agent:</strong> ${batchDetails.agent.name}</div>
    <div><strong>Phone:</strong> ${batchDetails.agent.phone || "—"}</div>
    <div><strong>Assigned By:</strong> ${batchDetails.assignmentMeta.assignedByName}</div>
    <div><strong>Areas:</strong> ${areasText}</div>
  </div>

  <div style="display: flex; gap: 16px; margin-bottom: 8px; font-size: 11px; font-weight: 600;">
    <span>Total Customers: ${batchDetails.totals.customerCount}</span>
    <span>Target Due: ₹${formatCurrency(batchDetails.totals.targetDue)}</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px; text-align: center;">S.No</th>
        <th style="width: 70px;">HPL No</th>
        <th>Customer</th>
        <th style="width: 80px; text-align: center;">Phone</th>
        <th style="width: 140px;">Vehicle</th>
        <th>Address</th>
        <th style="width: 80px; text-align: right;">Target Due</th>
        <th style="width: 50px; text-align: center;">Priority</th>
        <th>Notes</th>
        <th style="width: 40px; text-align: center;">Visited</th>
        <th style="width: 80px; text-align: center;">Sign / Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">
    <div>Agent Signature: _______________________</div>
    <div>Supervisor Signature: _______________________</div>
    <div>Manager Signature: _______________________</div>
  </div>
</body>
</html>`;

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) return;
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1000);
      }, 500);
    } catch (err) {
      console.error("Print error:", err);
      toast({ title: "Print Failed", description: "Unable to print run-sheet.", variant: "destructive" });
    } finally {
      setIsPrinting(false);
    }
  };

  // 4 KPI Cards: Total Assignments, Pending, Collected, Seized (replaces Failed)
  const kpiCards = [
    { label: "Total Assignments", value: kpis.totalAssignments, icon: RefreshCw, color: "text-primary" },
    { label: "Pending", value: kpis.pendingCount, icon: Clock, color: "text-yellow-500" },
    { label: "Collected", value: kpis.collectedCount, icon: CheckCircle2, color: "text-green-500" },
    { label: "Seized", value: kpis.seizedCount, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-4 w-full">
      {/* ─── Detail View (when a batch row is clicked) ───────────────────────── */}
      {selectedBatch ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedBatch(null);
                  setBatchDetails(null);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Batches
              </Button>
              <h1 className="text-xl font-bold text-foreground">
                Batch Details — {selectedBatch.agentName} ({selectedBatch.assignedDate})
              </h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintBatch}
              disabled={isPrinting || isLoadingDetails || !batchDetails}
            >
              <Printer className="h-4 w-4 mr-1" />
              {isPrinting ? "Printing..." : "Print Run-Sheet"}
            </Button>
          </div>

          {isLoadingDetails || !batchDetails ? (
            <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Customer</th>
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Phone</th>
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Area</th>
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Vehicle</th>
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Target Due</th>
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Collected Due</th>
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Penalty</th>
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-center">Status</th>
                      <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    <TableSkeletonRows columns={9} rows={6} />
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              {/* Agent & Batch Header Card */}
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-foreground">{batchDetails.agent.name}</span>
                        {batchDetails.agent.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Phone className="h-3 w-3" />
                            {batchDetails.agent.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {batchDetails.agent.allocatedAreas.length > 0 ? (
                          batchDetails.agent.allocatedAreas.map((area) => (
                            <Badge key={area} variant="secondary" className="text-[10px]">
                              <MapPin className="h-2.5 w-2.5 mr-0.5" />
                              {area}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No areas assigned</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground pt-1">
                        Assigned on: <strong className="text-foreground">{batchDetails.assignmentMeta.assignedDate}</strong>
                        {batchDetails.assignmentMeta.targetDate && (
                          <>
                            {" "}· Target Date: <strong className="text-foreground">{batchDetails.assignmentMeta.targetDate}</strong>
                          </>
                        )}
                        {" "}· Assigned By: <strong className="text-foreground">{batchDetails.assignmentMeta.assignedByName}</strong>
                      </div>
                    </div>

                    {/* Mini Totals */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-secondary/30 p-3 rounded-xl border border-border/60">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Target Due</div>
                        <div className="text-sm font-bold text-foreground">
                          ₹{formatCurrency(batchDetails.totals.targetDue)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Collected</div>
                        <div className="text-sm font-bold text-green-600 dark:text-emerald-400">
                          ₹{formatCurrency(batchDetails.totals.collectedAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Penalty</div>
                        <div className="text-sm font-semibold text-foreground">
                          ₹{formatCurrency(batchDetails.totals.penaltyAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Seized</div>
                        <div className="text-sm font-bold text-destructive">
                          {batchDetails.totals.seizedCount}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Customers in this Batch Toolbar + Table */}
              <div className="dashboard-card !p-4 hover:translate-y-0 flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">
                  Customers in this Batch ({batchDetails.customers.length})
                </h2>
              </div>

              <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Customer</th>
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Phone</th>
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Area</th>
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Vehicle</th>
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Target Due</th>
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Collected Due</th>
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Penalty</th>
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-center">Status</th>
                        <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {detailPagination.paginatedItems.map((c, i) => {
                        const sc = statusConfig[c.effectiveStatus] || statusConfig.pending;
                        return (
                          <motion.tr
                            key={c.assignmentId}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="hover:bg-secondary/40 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm">
                              <Link
                                to={`/customers/${c.customerId}`}
                                className="font-semibold text-sm text-primary hover:underline block"
                              >
                                {c.customerName}
                              </Link>
                              <Badge variant="outline" className="text-[10px] mt-0.5">
                                HPL {c.hplno}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                              {c.phone}
                            </td>
                            <td className="px-4 py-3 text-sm max-w-[180px] truncate" title={c.customerAddress}>
                              {c.customerAddress}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="text-xs font-medium font-mono text-foreground">
                                {c.vehicleNumber}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                {c.vehicleModel}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold">
                              ₹{formatCurrency(c.targetDue)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold">
                              {c.isSeized && c.collectedAmount === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="text-green-600 dark:text-emerald-400">₹{formatCurrency(c.collectedAmount)}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {c.penaltyAmount > 0 ? (
                                <span className="text-foreground">₹{formatCurrency(c.penaltyAmount)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              {c.isSeized ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold"
                                >
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                  Bike Seized
                                </Badge>
                              ) : (
                                <Badge variant="outline" className={`text-[10px] ${sc.color}`}>
                                  <sc.icon className="h-2.5 w-2.5 mr-0.5" />
                                  {sc.label}
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground max-w-[160px] truncate" title={c.notes}>
                              {c.notes || "—"}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={detailPagination.page}
                  totalPages={detailPagination.totalPages}
                  pageSize={detailPagination.pageSize}
                  onPageChange={detailPagination.setPage}
                  onPageSizeChange={detailPagination.setPageSize}
                  totalItems={detailPagination.totalItems}
                  startIndex={detailPagination.startIndex}
                  endIndex={detailPagination.endIndex}
                  disabled={isLoadingDetails}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        /* ─── Batch Table View ─────────────────────────────────────────────────── */
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Assignment History</h1>
              <p className="text-muted-foreground mt-1 text-sm">Track all customer-agent assignments</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>

          {/* 4 KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpiCards.map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-xl bg-muted ${kpi.color}`}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filter Bar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <CapitalizedInput
                    casing="none"
                    placeholder="Search agent, area, assigned by..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="visited">Visited</SelectItem>
                    <SelectItem value="collected">Collected</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="seized">Bike Seized</SelectItem>
                  </SelectContent>
                </Select>
                {!isAgent && (
                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {agentOptions.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex items-center gap-2">
                  <DatePicker
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    placeholder="From Date"
                    className="w-36"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <DatePicker
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    placeholder="To Date"
                    className="w-36"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Batch Table */}
          <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Date</th>
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Target Date</th>
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Agent</th>
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-center">Customers</th>
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-center">Seized</th>
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Assigned By</th>
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Target Due</th>
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Collected Due</th>
                    <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <TableSkeletonRows columns={9} rows={6} />
                  ) : filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-sm text-center text-muted-foreground">
                        {searchTerm || statusFilter !== "all" || agentFilter !== "all"
                          ? "No assignment batches match your filter."
                          : "No assignment batches found for the selected date range."}
                      </td>
                    </tr>
                  ) : (
                    mainPagination.paginatedItems.map((b, i) => {
                      const sc = statusConfig[b.batchStatus] || statusConfig.pending;
                      return (
                        <motion.tr
                          key={`${b.agentId}-${b.assignedDate}-${b.targetDate || "none"}-${b.assignedBy || "none"}`}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => openBatchDetails(b)}
                          className="hover:bg-secondary/40 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap font-mono">
                            {b.assignedDate}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap font-mono">
                            {b.targetDate || "—"}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="font-semibold text-sm text-foreground">{b.agentName}</div>
                            <div className="text-xs text-muted-foreground">{b.agentPhone || "—"}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {b.allocatedAreas.map((area) => (
                                <Badge key={area} variant="secondary" className="text-[10px]">
                                  <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                  {area}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className="font-semibold text-sm text-foreground">
                              {b.customerCount} {b.customerCount === 1 ? "Customer" : "Customers"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {b.seizedCount > 0 ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold"
                              >
                                {b.seizedCount} Seized
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {b.assignedByName}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold">
                            ₹{formatCurrency(b.targetDueAmount)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-green-600 dark:text-emerald-400">
                            ₹{formatCurrency(b.collectedDueAmount)}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <Badge variant="outline" className={`text-[10px] ${sc.color}`}>
                              <sc.icon className="h-2.5 w-2.5 mr-0.5" />
                              {sc.label}
                            </Badge>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={mainPagination.page}
              totalPages={mainPagination.totalPages}
              pageSize={mainPagination.pageSize}
              onPageChange={mainPagination.setPage}
              onPageSizeChange={mainPagination.setPageSize}
              totalItems={mainPagination.totalItems}
              startIndex={mainPagination.startIndex}
              endIndex={mainPagination.endIndex}
              disabled={isLoading}
            />
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  Smartphone,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar as CalendarIcon,
  Download,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { format } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../ui/use-toast";
import {
  StaffLoginReportItem,
  StaffLoginReportKpis,
} from "../../types/staffLoginReport";
import { fetchStaffLoginReport } from "../../api/staffLoginReportApi";
import { useClientPagination } from "../../hooks/useClientPagination";
import { TablePagination, TableSkeletonRows } from "../common";

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}

function formatDateString(isoDate: string): string {
  if (!isoDate) return "—";
  // Avoid JS Date timezone drift by string splitting
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val);

  // Neutralize formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }

  // Quote if contains comma, quote, or newline
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function StaffLoginReport() {
  const { currentFinance } = useAuth();
  const { toast } = useToast();

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Default dates: last 7 days
  const defaultDates = useMemo(() => {
    const now = new Date();
    const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      from: past,
      to: now,
    };
  }, []);

  const [fromDate, setFromDate] = useState<Date | undefined>(defaultDates.from);
  const [toDate, setToDate] = useState<Date | undefined>(defaultDates.to);

  // Data & State
  const [items, setItems] = useState<StaffLoginReportItem[]>([]);
  const [kpis, setKpis] = useState<StaffLoginReportKpis>({
    staffDays: 0,
    totalSessions: 0,
    totalHours: 0,
    avgDistanceKm: null,
    activeSessions: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 300ms search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Format dates for API query
  const dateFromStr = fromDate ? format(fromDate, "yyyy-MM-dd") : undefined;
  const dateToStr = toDate ? format(toDate, "yyyy-MM-dd") : undefined;

  // Load report data from server
  const loadReport = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (fromDate && toDate && fromDate > toDate) {
      toast({
        title: "Invalid date range",
        description: "From Date cannot be later than To Date.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetchStaffLoginReport(
        {
          dateFrom: dateFromStr,
          dateTo: dateToStr,
          role: roleFilter !== "all" ? roleFilter : undefined,
          search: debouncedSearch || undefined,
        },
        controller.signal
      );

      if (res.success) {
        setItems(res.data || []);
        setKpis(
          res.kpis || {
            staffDays: 0,
            totalSessions: 0,
            totalHours: 0,
            avgDistanceKm: null,
            activeSessions: 0,
          }
        );
      } else {
        toast({
          title: "Failed to load report",
          description: res.error || "Could not retrieve staff login report.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return;
      }
      console.error("Error loading staff login report:", err);
      toast({
        title: "Error",
        description:
          err?.response?.data?.error ||
          err?.message ||
          "Failed to load staff login report.",
        variant: "destructive",
      });
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [dateFromStr, dateToStr, roleFilter, debouncedSearch, fromDate, toDate, toast]);

  useEffect(() => {
    loadReport();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadReport, currentFinance?.id]);

  // Open map coordinates in external browser tab
  const openMaps = (lat: number, lng: number) => {
    window.open(
      `https://www.google.com/maps?q=${lat},${lng}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Determine whether any row contains financeName (server-side owner verification)
  const hasFinanceColumn = useMemo(() => {
    return items.some((item) => item.financeName !== undefined);
  }, [items]);

  const {
    paginatedItems: pagedItems,
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  } = useClientPagination(items, { initialPageSize: 15 });

  // CSV Export across all filtered records (up to 5000 max)
  const handleExportCsv = async () => {
    if (items.length === 0 || isExporting) return;

    setIsExporting(true);
    try {
      const allRows: StaffLoginReportItem[] = [];
      const pageSize = 500;
      let offset = 0;
      let hasMore = true;

      while (hasMore && allRows.length < 5000) {
        const res = await fetchStaffLoginReport({
          dateFrom: dateFromStr,
          dateTo: dateToStr,
          role: roleFilter !== "all" ? roleFilter : undefined,
          search: debouncedSearch || undefined,
          limit: pageSize,
          offset,
        });

        if (!res.success || !res.data || res.data.length === 0) {
          break;
        }

        allRows.push(...res.data);
        offset += res.data.length;
        if (allRows.length >= (res.total || 0) || res.data.length < pageSize) {
          hasMore = false;
        }
      }

      if (allRows.length === 0) {
        toast({ title: "No data", description: "No records found to export." });
        return;
      }

      const headers = [
        "Date",
        "Time",
        "Staff Name",
        "Role",
        "Staff Code",
        "Duration",
        ...(hasFinanceColumn ? ["Finance"] : []),
        "Device",
        "IP Address",
        "Office Distance (KM)",
        "Location",
        "Sessions Count",
      ];

      const csvRows = allRows.map((entry) => {
        const latestTime =
          entry.timeline && entry.timeline.length > 0
            ? entry.timeline[entry.timeline.length - 1].login
            : "—";

        const row = [
          escapeCsvField(entry.date),
          escapeCsvField(latestTime),
          escapeCsvField(entry.staffName),
          escapeCsvField(entry.role),
          escapeCsvField(entry.staffCode),
          escapeCsvField(formatDuration(entry.totalDurationSeconds)),
          ...(hasFinanceColumn ? [escapeCsvField(entry.financeName || "")] : []),
          escapeCsvField(entry.primaryDevice || entry.primaryPlatform || "—"),
          escapeCsvField(entry.latestIp || "—"),
          escapeCsvField(
            entry.avgDistanceKm !== null ? entry.avgDistanceKm.toFixed(1) : "—"
          ),
          escapeCsvField(entry.latestLocation || "—"),
          escapeCsvField(entry.sessionCount),
        ];
        return row.join(",");
      });

      const csvContent =
        "\uFEFF" + [headers.join(","), ...csvRows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `Staff_Login_Report_${dateFromStr || "all"}_to_${dateToStr || "all"}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export complete",
        description: `Exported ${allRows.length} records to CSV.`,
      });
    } catch (err: any) {
      console.error("CSV Export error:", err);
      toast({
        title: "Export failed",
        description: err?.message || "Could not generate CSV export.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const kpiCards = [
    {
      label: "Staff Days",
      value: kpis.staffDays,
      icon: CalendarIcon,
      color: "text-primary",
    },
    {
      label: "Total Sessions",
      value: kpis.totalSessions,
      icon: RefreshCw,
      color: "text-blue-500",
    },
    {
      label: "Total Hours",
      value: `${kpis.totalHours}h`,
      icon: Clock,
      color: "text-yellow-500",
    },
    {
      label: "Avg Distance",
      value:
        kpis.avgDistanceKm !== null ? `${kpis.avgDistanceKm} km` : "—",
      icon: MapPin,
      color: "text-green-500",
    },
    {
      label: "Active Sessions",
      value: kpis.activeSessions,
      icon: CheckCircle2,
      color: "text-emerald-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Staff App Login Report</h1>
          <p className="text-muted-foreground mt-1 text-sm">Monitor staff login activity and session duration</p>
        </motion.div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={items.length === 0 || isExporting}
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1" />
          )}
          {isExporting ? "Exporting..." : "Export"}
        </Button>
      </div>

      {/* Server-Side KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff, code..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 min-w-[130px] bg-background border-input">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDate ? format(fromDate, "dd/MM/yyyy") : "From Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={fromDate}
                  onSelect={setFromDate}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toDate ? format(toDate, "dd/MM/yyyy") : "To Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={toDate}
                  onSelect={setToDate}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-10 px-3 py-3.5"></th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Date</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Time</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Staff</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Code</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Duration</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Device</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">IP Address</th>
                {hasFinanceColumn && <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Finance</th>}
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Office Dist.</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <TableSkeletonRows columns={hasFinanceColumn ? 11 : 10} rows={6} />
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={hasFinanceColumn ? 11 : 10}
                    className="px-4 py-12 text-sm text-center text-muted-foreground"
                  >
                    No login sessions found for the selected criteria.
                  </td>
                </tr>
              ) : (
                pagedItems.map((entry) => {
                  const latestLoginTime =
                    entry.timeline && entry.timeline.length > 0
                      ? entry.timeline[entry.timeline.length - 1].login
                      : "—";

                  return (
                    <Fragment key={entry.groupKey}>
                      <tr
                        className="hover:bg-secondary/40 transition-colors cursor-pointer"
                        onClick={() =>
                          setExpandedRow(
                            expandedRow === entry.groupKey ? null : entry.groupKey
                          )
                        }
                      >
                        <td className="px-3 py-3 text-sm">
                          {expandedRow === entry.groupKey ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          {formatDateString(entry.date)}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">
                          {latestLoginTime}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {entry.staffName}
                            </p>
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {entry.role}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                          {entry.staffCode}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatDuration(entry.totalDurationSeconds)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {entry.primaryPlatform?.toLowerCase().includes("mobile") ||
                            entry.primaryDevice?.toLowerCase().includes("mobile") ? (
                              <Smartphone className="h-3 w-3 shrink-0" />
                            ) : (
                              <Monitor className="h-3 w-3 shrink-0" />
                            )}
                            <span className="truncate max-w-[120px]">
                              {entry.primaryDevice || entry.primaryPlatform || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                          {entry.latestIp || "—"}
                        </td>
                        {hasFinanceColumn && (
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {entry.financeName || "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm">
                          {entry.avgDistanceKm !== null ? (
                            <Badge
                              variant={entry.avgDistanceKm > 10 ? "destructive" : "outline"}
                              className="text-xs"
                            >
                              {entry.avgDistanceKm.toFixed(1)} KM
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {entry.latestLat !== null &&
                          entry.latestLng !== null &&
                          Number.isFinite(entry.latestLat) &&
                          Number.isFinite(entry.latestLng) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openMaps(entry.latestLat!, entry.latestLng!);
                              }}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[140px]">
                                {entry.latestLocation ||
                                  `${entry.latestLat.toFixed(4)}, ${entry.latestLng.toFixed(4)}`}
                              </span>
                            </button>
                          ) : entry.latestLocation ? (
                            <span
                              className="text-xs text-muted-foreground truncate max-w-[140px] block"
                              title={entry.latestLocation}
                            >
                              {entry.latestLocation}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Timeline */}
                      <AnimatePresence>
                        {expandedRow === entry.groupKey && (
                          <tr key={`${entry.groupKey}-timeline`}>
                            <td
                              colSpan={hasFinanceColumn ? 11 : 10}
                              className="p-0"
                            >
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="p-4 bg-secondary/20 border-t border-border/50">
                                  <p className="text-xs font-semibold text-foreground mb-3">
                                    Login Timeline ({entry.timeline.length}{" "}
                                    {entry.timeline.length === 1
                                      ? "session"
                                      : "sessions"}
                                    )
                                  </p>
                                  <div className="space-y-2">
                                    {entry.timeline.map((t) => (
                                      <div
                                        key={t.id}
                                        className="flex flex-wrap items-center gap-4 text-xs"
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full bg-green-500" />
                                          <span className="text-muted-foreground">
                                            Login:
                                          </span>
                                          <span className="font-mono font-medium text-foreground">
                                            {t.login}
                                          </span>
                                        </div>
                                        <span className="text-muted-foreground">→</span>
                                        <div className="flex items-center gap-2">
                                          <div
                                            className={`w-2 h-2 rounded-full ${
                                              t.logout === "Active"
                                                ? "bg-emerald-500 animate-pulse"
                                                : "bg-red-500"
                                            }`}
                                          />
                                          <span className="text-muted-foreground">
                                            Logout:
                                          </span>
                                          <span className="font-mono font-medium text-foreground">
                                            {t.logout}
                                          </span>
                                        </div>
                                        <Badge
                                          variant="secondary"
                                          className="text-[10px]"
                                        >
                                          {t.duration}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] capitalize"
                                        >
                                          {t.reason?.replace(/_/g, " ")}
                                        </Badge>
                                        {t.device && (
                                          <span className="text-muted-foreground text-[11px] font-mono">
                                            {t.device}
                                          </span>
                                        )}
                                        {t.ip && (
                                          <span className="text-muted-foreground text-[11px] font-mono">
                                            ({t.ip})
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

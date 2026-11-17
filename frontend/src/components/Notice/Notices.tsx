import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Search, Printer, Download, Mail, MessageCircle, Link2,
  Eye, X, Users, FileType, Filter, RotateCcw,
  ChevronDown, ChevronLeft, ChevronRight, Loader2, CheckSquare, SlidersHorizontal,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { useToast } from "../../hooks/use-toast";
import { useAuth } from "../../contexts/AuthContext";
import {
  fetchPendingCollections,
  fetchPrintBatch,
  PrintBatchItem,
  PrintBatchFinance,
} from "../../api/collectionsApi";
import {
  PendingCollectionRecord,
  PendingCollectionsFilterOptions,
} from "../../types/pendingCollections";
import {
  PrintDocTypeId,
  PrintThemeId,
  getPrintStylesheet,
  buildCompletePrintHtml,
  inlineImageAsDataUri,
  triggerPrintDocument,
  exportWordDocument,
} from "@/components/common/print";
import { AppSelect, TablePagination, TableSkeletonRows } from "../common";
import { NoticeTemplateDrawer, NOTICE_THEMES } from "./NoticeTemplateDrawer";
import { useTemplateSettings } from "./useTemplateSettings";

// ---------- 5 Unified Document Types ----------
const docTypes: { id: PrintDocTypeId; name: string; desc: string }[] = [
  { id: "ledger", name: "Ledger Print", desc: "Full ledger account statement & EMI history" },
  { id: "due_card", name: "Due Card Print", desc: "EMI schedule & installment receipt card" },
  { id: "seizing_letter", name: "Seizing Letter Print", desc: "Final notice for vehicle seizure" },
  { id: "defaulter_customer", name: "Defaulter Notice - Customer", desc: "Loan defaulter demand notice to customer" },
  { id: "defaulter_coapplicant", name: "Defaulter Notice - Co-Applicant", desc: "Loan defaulter notice to guarantor / co-applicant" },
];

const statusColors: Record<string, string> = {
  Active: "bg-income/10 text-income",
  active: "bg-income/10 text-income",
  Due: "badge-warning",
  pending: "badge-warning",
  overdue: "bg-expense/10 text-expense",
  seized: "bg-expense/15 text-expense",
  Closed: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
};

interface FilterState {
  search: string;
  hpDateFrom: string;
  hpDateTo: string;
  pendingMin: string;
  pendingMax: string;
  broker: string;
  vehicleType: string;
  street: string;
  village: string;
  city: string;
  statusFilter: string;
  hbAmountMin: string;
  hbAmountMax: string;
  defaultAmountMin: string;
  defaultAmountMax: string;
  dealType: string;
}

const initialFilters: FilterState = {
  search: "",
  hpDateFrom: "",
  hpDateTo: "",
  pendingMin: "",
  pendingMax: "",
  broker: "",
  vehicleType: "all",
  street: "",
  village: "",
  city: "",
  statusFilter: "all",
  hbAmountMin: "",
  hbAmountMax: "",
  defaultAmountMin: "",
  defaultAmountMax: "",
  dealType: "all",
};

// ---------- Main ----------
export default function Notices() {
  const { toast } = useToast();
  const { currentFinance } = useAuth();

  const {
    settings: templateSettings,
    selectedDocTypeId,
    setSelectedDocTypeId,
    activeConfig,
    activePrintOptions,
    updateDocSettings,
    resetDocSettings,
  } = useTemplateSettings(currentFinance?.id);

  const docType = docTypes.find((d) => d.id === selectedDocTypeId) || docTypes[0];
  const theme = NOTICE_THEMES.find((t) => t.id === activeConfig.theme) || NOTICE_THEMES[0];

  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const topTemplateBtnRef = useRef<HTMLButtonElement | null>(null);
  const bottomTemplateBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastTemplateTriggerRef = useRef<HTMLButtonElement | null>(null);

  const openTemplateDrawer = (triggerEl: HTMLButtonElement | null) => {
    lastTemplateTriggerRef.current = triggerEl;
    setPreviewOpen(false);
    setShareOpen(false);
    setTemplateDrawerOpen(true);
  };

  // Filter & Pagination state (matching PendingCollections.tsx)
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Server data state
  const [records, setRecords] = useState<PendingCollectionRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPagesCount, setTotalPagesCount] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [selectingAllMatching, setSelectingAllMatching] = useState(false);
  const [filterOptions, setFilterOptions] = useState<PendingCollectionsFilterOptions>({
    brokers: [],
    streets: [],
    villages: [],
    cities: [],
  });

  // Persistent selection across pages and filter changes
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRecordsMap, setSelectedRecordsMap] = useState<Record<string, PendingCollectionRecord>>({});

  // Auto-suggest state for Street / Village / City
  const [streetSugg, setStreetSugg] = useState<string[]>([]);
  const [villageSugg, setVillageSugg] = useState<string[]>([]);
  const [citySugg, setCitySugg] = useState<string[]>([]);

  // Batch print / preview state
  const [batchLoading, setBatchLoading] = useState(false);
  const [previewBatchItems, setPreviewBatchItems] = useState<PrintBatchItem[]>([]);
  const [previewFinance, setPreviewFinance] = useState<PrintBatchFinance | null>(null);
  const [previewPagesHtml, setPreviewPagesHtml] = useState<string[]>([]);
  const [previewAppliedTheme, setPreviewAppliedTheme] = useState<PrintThemeId>(activeConfig.theme);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);

  // Debounce search input
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 350);
  };

  const buildFilterParams = useCallback(
    (targetPage: number, targetLimit: number) => ({
      search: debouncedSearch || undefined,
      hpDateFrom: filters.hpDateFrom || undefined,
      hpDateTo: filters.hpDateTo || undefined,
      pendingMin: filters.pendingMin !== "" ? Number(filters.pendingMin) : undefined,
      pendingMax: filters.pendingMax !== "" ? Number(filters.pendingMax) : undefined,
      broker: filters.broker || undefined,
      vehicleType: filters.vehicleType !== "all" ? filters.vehicleType : undefined,
      street: filters.street || undefined,
      village: filters.village || undefined,
      city: filters.city || undefined,
      statusFilter: filters.statusFilter !== "all" ? filters.statusFilter : undefined,
      hbAmountMin: filters.hbAmountMin !== "" ? Number(filters.hbAmountMin) : undefined,
      hbAmountMax: filters.hbAmountMax !== "" ? Number(filters.hbAmountMax) : undefined,
      defaultAmountMin: filters.defaultAmountMin !== "" ? Number(filters.defaultAmountMin) : undefined,
      defaultAmountMax: filters.defaultAmountMax !== "" ? Number(filters.defaultAmountMax) : undefined,
      dealType: filters.dealType !== "all" ? filters.dealType : undefined,
      page: targetPage,
      limit: targetLimit,
    }),
    [debouncedSearch, filters]
  );

  // Fetch paginated customer list
  const loadCustomers = useCallback(async () => {
    try {
      setLoadingList(true);
      const res = await fetchPendingCollections(buildFilterParams(page, itemsPerPage));
      if (res.success) {
        const list = res.data || [];
        setRecords(list);
        setTotalRecords(res.pagination?.total ?? list.length);
        setTotalPagesCount(Math.max(1, res.pagination?.totalPages ?? 1));
        if (res.filters) {
          setFilterOptions(res.filters);
        }
        // Refresh cached records for any already-selected IDs on this page
        setSelectedRecordsMap((prev) => {
          const next = { ...prev };
          for (const r of list) {
            const key = String(r.customerId || r.id);
            if (next[key]) {
              next[key] = r;
            }
          }
          return next;
        });
      }
    } catch (err: any) {
      console.error("Failed to fetch customers for Notices:", err);
      toast({
        title: "Failed to load customers",
        description: err?.response?.data?.error || err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
    }
  }, [buildFilterParams, page, itemsPerPage, toast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers, currentFinance?.id]);

  // Listen for global finance switch
  useEffect(() => {
    const onSwitch = () => {
      setSelectedIds([]);
      setSelectedRecordsMap({});
      setPage(1);
    };
    window.addEventListener("autofinex:finance-switched", onSwitch);
    return () => window.removeEventListener("autofinex:finance-switched", onSwitch);
  }, []);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);

    if (key === "street") {
      const q = String(value).toLowerCase();
      setStreetSugg(
        q ? filterOptions.streets.filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q) : []
      );
    } else if (key === "village") {
      const q = String(value).toLowerCase();
      setVillageSugg(
        q ? filterOptions.villages.filter((v) => v.toLowerCase().includes(q) && v.toLowerCase() !== q) : []
      );
    } else if (key === "city") {
      const q = String(value).toLowerCase();
      setCitySugg(
        q ? filterOptions.cities.filter((c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q) : []
      );
    }
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setDebouncedSearch("");
    setStreetSugg([]);
    setVillageSugg([]);
    setCitySugg([]);
    setPage(1);
  };

  const activeFilterCount = [
    filters.hpDateFrom,
    filters.hpDateTo,
    filters.pendingMin,
    filters.pendingMax,
    filters.broker,
    filters.vehicleType !== "all" ? filters.vehicleType : "",
    filters.street,
    filters.village,
    filters.city,
    filters.statusFilter !== "all" ? filters.statusFilter : "",
    filters.hbAmountMin,
    filters.hbAmountMax,
    filters.defaultAmountMin,
    filters.defaultAmountMax,
    filters.dealType !== "all" ? filters.dealType : "",
  ].filter(Boolean).length;

  // Selection helpers
  const getRecordKey = (r: PendingCollectionRecord): string => String(r.customerId || r.id);

  const toggleOne = (record: PendingCollectionRecord) => {
    const id = getRecordKey(record);
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        setSelectedRecordsMap((m) => {
          const copy = { ...m };
          delete copy[id];
          return copy;
        });
        return prev.filter((x) => x !== id);
      } else {
        setSelectedRecordsMap((m) => ({ ...m, [id]: record }));
        return [...prev, id];
      }
    });
  };

  const currentPageIds = records.map(getRecordKey);
  const isCurrentPageAllSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id));

  const toggleCurrentPage = () => {
    if (isCurrentPageAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
      setSelectedRecordsMap((prev) => {
        const copy = { ...prev };
        for (const id of currentPageIds) delete copy[id];
        return copy;
      });
    } else {
      setSelectedIds((prev) => {
        const set = new Set(prev);
        for (const id of currentPageIds) set.add(id);
        return Array.from(set);
      });
      setSelectedRecordsMap((prev) => {
        const copy = { ...prev };
        for (const r of records) {
          copy[getRecordKey(r)] = r;
        }
        return copy;
      });
    }
  };

  const handleSelectAllMatching = async () => {
    if (totalRecords === 0 || selectingAllMatching) return;
    try {
      setSelectingAllMatching(true);
      const res = await fetchPendingCollections(buildFilterParams(1, 200));
      if (res.success && Array.isArray(res.data)) {
        const ids: string[] = [];
        const map: Record<string, PendingCollectionRecord> = {};
        for (const r of res.data.slice(0, 200)) {
          const k = getRecordKey(r);
          if (!map[k]) {
            ids.push(k);
            map[k] = r;
          }
        }
        setSelectedIds(ids);
        setSelectedRecordsMap(map);

        if (totalRecords > 200) {
          toast({
            title: "Selected first 200 matching customers",
            description: `${totalRecords} customers matched your filters. Batch printing is capped at 200 customers per run.`,
          });
        } else {
          toast({
            title: `Selected all ${ids.length} matching customer(s)`,
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "Could not select all matching customers",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSelectingAllMatching(false);
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectedRecordsMap({});
  };

  // Live metrics: Selected / Found / Pages / Size
  const pagesPerCustomer = docType.id === "due_card" ? 2 : 1;
  const totalPages = selectedIds.length * pagesPerCustomer;
  const fileSize = `${(totalPages * 42).toFixed(0)} KB`;

  // Fetch batch data from POST /api/customers/print-batch and inline print logo once
  const loadBatchPrintData = useCallback(
    async (idsToFetch: string[]) => {
      const batchRes = await fetchPrintBatch(idsToFetch);
      if (!batchRes.success || !batchRes.items || batchRes.items.length === 0) {
        throw new Error("No customer print records returned for the selected IDs.");
      }

      const rawLogo =
        batchRes.finance?.print_logo_url ||
        currentFinance?.print_logo_url ||
        batchRes.finance?.logo_url ||
        currentFinance?.logo_url ||
        currentFinance?.finance_photo ||
        null;

      const logoDataUri = await inlineImageAsDataUri(rawLogo);
      const resolvedFinance: PrintBatchFinance = {
        id: batchRes.finance?.id || String(currentFinance?.id || ""),
        name: batchRes.finance?.name || currentFinance?.name || "RIMI SOFTWARE",
        address: batchRes.finance?.address || currentFinance?.address || "",
        phone_numbers: batchRes.finance?.phone_numbers || currentFinance?.phone_numbers || [],
        emails: batchRes.finance?.emails || currentFinance?.emails || [],
        print_logo_url: logoDataUri,
        logo_url: batchRes.finance?.logo_url || currentFinance?.logo_url || null,
      };

      const built = buildCompletePrintHtml(
        batchRes.items,
        resolvedFinance,
        docType.id,
        activePrintOptions,
        docType.name
      );

      return {
        items: batchRes.items,
        finance: resolvedFinance,
        built,
      };
    },
    [currentFinance, docType, activePrintOptions]
  );

  // Re-build preview pages (debounced ~200ms) when docType or template settings change while preview is open
  useEffect(() => {
    if (!previewOpen || previewBatchItems.length === 0 || !previewFinance) return;
    const timer = setTimeout(() => {
      const built = buildCompletePrintHtml(
        previewBatchItems,
        previewFinance,
        docType.id,
        activePrintOptions,
        docType.name
      );
      setPreviewPagesHtml(built.pagesHtml);
      setPreviewAppliedTheme(activeConfig.theme);
      setPreviewPageIndex((prev) => Math.min(prev, Math.max(0, built.pagesHtml.length - 1)));
    }, 200);
    return () => clearTimeout(timer);
  }, [previewOpen, previewBatchItems, previewFinance, docType, activePrintOptions, activeConfig.theme]);

  const handleOpenPreview = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "No customers selected",
        description: "Please select at least one customer to preview.",
        variant: "destructive",
      });
      return;
    }

    try {
      setBatchLoading(true);
      const { items, finance, built } = await loadBatchPrintData(selectedIds);
      setPreviewBatchItems(items);
      setPreviewFinance(finance);
      setPreviewPagesHtml(built.pagesHtml);
      setPreviewAppliedTheme(activeConfig.theme);
      setPreviewPageIndex(0);
      setTemplateDrawerOpen(false);
      setShareOpen(false);
      setPreviewOpen(true);
    } catch (err: any) {
      console.error("Preview batch fetch error:", err);
      toast({
        title: "Failed to load preview",
        description: err?.response?.data?.error || err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleTriggerPrintOrPdf = async (mode: "Print" | "PDF") => {
    if (selectedIds.length === 0) {
      toast({
        title: "No customers selected",
        description: "Please select at least one customer.",
        variant: "destructive",
      });
      return;
    }

    try {
      setBatchLoading(true);
      const { built } = await loadBatchPrintData(selectedIds);
      const title =
        mode === "PDF"
          ? `${docType.name} (Save as PDF) — ${selectedIds.length} Customer(s)`
          : `${docType.name} — ${selectedIds.length} Customer(s)`;
      await triggerPrintDocument(title, built.html, toast);
    } catch (err: any) {
      console.error(`${mode} batch error:`, err);
      toast({
        title: `${mode} Error`,
        description: err?.response?.data?.error || err?.message || "Failed to generate document.",
        variant: "destructive",
      });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleExportWord = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "No customers selected",
        description: "Please select at least one customer.",
        variant: "destructive",
      });
      return;
    }

    try {
      setBatchLoading(true);
      const { built } = await loadBatchPrintData(selectedIds);
      const filename = `${docType.id}_${selectedIds.length}_customers_${new Date()
        .toISOString()
        .slice(0, 10)}.doc`;
      exportWordDocument(filename, built.html, activeConfig.theme);
      toast({
        title: "Exported as Word (.doc)",
        description: `${selectedIds.length} customer(s) • ${built.pageCount} page(s)`,
      });
    } catch (err: any) {
      console.error("Word export error:", err);
      toast({
        title: "Word Export Error",
        description: err?.response?.data?.error || err?.message || "Failed to export Word document.",
        variant: "destructive",
      });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleShare = (channel: string) => {
    if (selectedIds.length === 0) {
      toast({ title: "No customers selected", variant: "destructive" });
      return;
    }
    const firstRec = selectedRecordsMap[selectedIds[0]] || records[0];
    const companyName = currentFinance?.name || "Finance ERP";
    if (channel === "WhatsApp") {
      const phoneDigits = firstRec?.phone ? firstRec.phone.replace(/\D/g, "") : "";
      const waTarget = phoneDigits.length === 10 ? `91${phoneDigits}` : "";
      const text = `${docType.name} from ${companyName} – ${selectedIds.length} document(s)`;
      window.open(`https://wa.me/${waTarget}?text=${encodeURIComponent(text)}`, "_blank");
    } else if (channel === "Email") {
      window.open(
        `mailto:?subject=${encodeURIComponent(`${docType.name} - ${companyName}`)}&body=${encodeURIComponent(
          `Please find attached the ${docType.name} for ${selectedIds.length} account(s).`
        )}`,
        "_blank"
      );
    } else if (channel === "Copy Link") {
      navigator.clipboard.writeText(`${window.location.origin}/notices?type=${docType.id}`);
    }
    toast({ title: `Shared via ${channel}`, description: `${selectedIds.length} document(s) sent` });
    setShareOpen(false);
  };

  const totalPreviewPages = Math.max(1, previewPagesHtml.length);

  const previewStylesheet = getPrintStylesheet(previewAppliedTheme);
  const singlePageIframeDoc = previewPagesHtml[previewPageIndex]
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${previewStylesheet} body { padding: 8mm; background: #fff; }</style></head><body>${previewPagesHtml[previewPageIndex]}</body></html>`
    : "";

  const startIndex = totalRecords === 0 ? 0 : (page - 1) * itemsPerPage + 1;
  const endIndex = Math.min(page * itemsPerPage, totalRecords);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Notices & Print</h1>
          <p className="text-muted-foreground mt-1 text-sm">Premium document generator & sharing system</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            ref={topTemplateBtnRef}
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => openTemplateDrawer(topTemplateBtnRef.current)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Template</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary/10 text-primary">
              {theme.name}
            </span>
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleOpenPreview}
            disabled={batchLoading || selectedIds.length === 0}
          >
            {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Live Preview
          </Button>
        </div>
      </motion.div>

      {/* SECTION 1 — TEMPLATE SELECTION */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Document Template
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Choose document type to generate</p>
          </div>
        </div>

        {/* 5 Unified Doc Type Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {docTypes.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDocTypeId(d.id)}
              className={`text-left rounded-lg border-2 p-3 transition-all ${
                docType.id === d.id
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{d.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{d.desc}</p>
            </button>
          ))}
        </div>
      </motion.section>

      {/* SECTION 2 — CUSTOMER FILTER & TABLE (Synced with PendingCollections.tsx) */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Customer Selection
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Filter and select customers for document generation</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {totalRecords > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleSelectAllMatching}
                disabled={selectingAllMatching}
              >
                {selectingAllMatching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckSquare className="h-3.5 w-3.5 text-primary" />
                )}
                Select all {Math.min(200, totalRecords)} matching
              </Button>
            )}
            {selectedIds.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearSelection}>
                Clear ({selectedIds.length})
              </Button>
            )}
            <div className="badge-success text-xs px-3 py-1.5 rounded-full font-semibold">
              {selectedIds.length} Selected
            </div>
            <div className="bg-secondary text-xs px-3 py-1.5 rounded-full font-semibold text-muted-foreground">
              {totalRecords} Found
            </div>
          </div>
        </div>

        {/* Search + Collapsible Filter Bar (same filter keys as PendingCollections.tsx) */}
        <div className="space-y-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by loan no, customer name, mobile, or vehicle number..."
                value={filters.search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="input-field pl-10 pr-8 w-full text-sm"
              />
              {filters.search && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant={filtersOpen ? "default" : "outline"}
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="gap-2 relative"
              >
                <Filter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary-foreground text-primary">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
              </Button>

              {(activeFilterCount > 0 || filters.search) && (
                <Button variant="ghost" onClick={resetFilters} className="gap-1.5 text-muted-foreground hover:text-foreground">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {filtersOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* HP Date From */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">HP Date (From)</label>
                    <Input
                      type="date"
                      value={filters.hpDateFrom}
                      onChange={(e) => updateFilter("hpDateFrom", e.target.value)}
                      className="text-sm h-9"
                    />
                  </div>
                  {/* HP Date To */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">HP Date (To)</label>
                    <Input
                      type="date"
                      value={filters.hpDateTo}
                      onChange={(e) => updateFilter("hpDateTo", e.target.value)}
                      className="text-sm h-9"
                    />
                  </div>
                  {/* Pending Amount Range */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Pending Amount (₹)</label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={filters.pendingMin}
                        onChange={(e) => updateFilter("pendingMin", e.target.value)}
                        className="text-sm h-9"
                      />
                      <Input
                        type="number"
                        placeholder="Max"
                        value={filters.pendingMax}
                        onChange={(e) => updateFilter("pendingMax", e.target.value)}
                        className="text-sm h-9"
                      />
                    </div>
                  </div>
                  {/* HP Amount Range */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">HP Loan Amount (₹)</label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={filters.hbAmountMin}
                        onChange={(e) => updateFilter("hbAmountMin", e.target.value)}
                        className="text-sm h-9"
                      />
                      <Input
                        type="number"
                        placeholder="Max"
                        value={filters.hbAmountMax}
                        onChange={(e) => updateFilter("hbAmountMax", e.target.value)}
                        className="text-sm h-9"
                      />
                    </div>
                  </div>
                  {/* Default Amount Range */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Amount (₹)</label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={filters.defaultAmountMin}
                        onChange={(e) => updateFilter("defaultAmountMin", e.target.value)}
                        className="text-sm h-9"
                      />
                      <Input
                        type="number"
                        placeholder="Max"
                        value={filters.defaultAmountMax}
                        onChange={(e) => updateFilter("defaultAmountMax", e.target.value)}
                        className="text-sm h-9"
                      />
                    </div>
                  </div>
                  {/* Broker */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Broker</label>
                    <AppSelect
                      value={filters.broker || ""}
                      onValueChange={(val) => updateFilter("broker", val)}
                      options={[
                        { value: "", label: "All Brokers" },
                        ...filterOptions.brokers.map((b) => ({ value: b, label: b })),
                      ]}
                    />
                  </div>
                  {/* Vehicle Type */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Vehicle Type</label>
                    <AppSelect
                      value={filters.vehicleType}
                      onValueChange={(val) => updateFilter("vehicleType", val)}
                      options={[
                        { value: "all", label: "All Vehicles" },
                        { value: "two_wheeler", label: "Two Wheeler" },
                        { value: "three_wheeler", label: "Three Wheeler" },
                        { value: "four_wheeler", label: "Four Wheeler" },
                        { value: "commercial", label: "Commercial" },
                      ]}
                    />
                  </div>
                  {/* Deal Type */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Deal Type</label>
                    <AppSelect
                      value={filters.dealType}
                      onValueChange={(val) => updateFilter("dealType", val)}
                      options={[
                        { value: "all", label: "All Deal Types" },
                        { value: "finance", label: "Finance" },
                        { value: "consulting", label: "Consulting" },
                      ]}
                    />
                  </div>
                  {/* Status Filter */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                    <AppSelect
                      value={filters.statusFilter}
                      onValueChange={(val) => updateFilter("statusFilter", val)}
                      options={[
                        { value: "all", label: "All Status" },
                        { value: "active", label: "Active" },
                        { value: "pending", label: "Pending" },
                        { value: "overdue", label: "Overdue" },
                        { value: "seized", label: "Seized" },
                        { value: "closed", label: "Closed" },
                      ]}
                    />
                  </div>
                  {/* Street */}
                  <div className="relative">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Street</label>
                    <Input
                      className="text-sm h-9"
                      placeholder="Type street..."
                      value={filters.street}
                      onChange={(e) => updateFilter("street", e.target.value)}
                    />
                    {streetSugg.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                        {streetSugg.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 text-foreground"
                            onClick={() => {
                              updateFilter("street", s);
                              setStreetSugg([]);
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Village */}
                  <div className="relative">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Village / Area</label>
                    <Input
                      className="text-sm h-9"
                      placeholder="Type village..."
                      value={filters.village}
                      onChange={(e) => updateFilter("village", e.target.value)}
                    />
                    {villageSugg.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                        {villageSugg.map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 text-foreground"
                            onClick={() => {
                              updateFilter("village", v);
                              setVillageSugg([]);
                            }}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* City */}
                  <div className="relative">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
                    <Input
                      className="text-sm h-9"
                      placeholder="Type city..."
                      value={filters.city}
                      onChange={(e) => updateFilter("city", e.target.value)}
                    />
                    {citySugg.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                        {citySugg.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 text-foreground"
                            onClick={() => {
                              updateFilter("city", c);
                              setCitySugg([]);
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Customer Table (max-h-80 overflow-y-auto, 10 rows per page) */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-secondary/80 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 w-10">
                    <Checkbox
                      checked={isCurrentPageAllSelected}
                      onCheckedChange={toggleCurrentPage}
                    />
                  </th>
                  {["HPL", "Name", "Phone", "Vehicle", "Status", "Amount"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2.5"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <TableSkeletonRows columns={7} rows={6} />
                ) : records.length > 0 ? (
                  records.map((c) => {
                    const rowKey = getRecordKey(c);
                    const isChecked = selectedIds.includes(rowKey);
                    return (
                      <tr
                        key={rowKey}
                        className={`border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors ${
                          isChecked ? "bg-primary/5" : ""
                        }`}
                        onClick={() => toggleOne(c)}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(c)} />
                        </td>
                        <td className="px-3 py-2.5 text-sm font-medium text-primary">{c.loanNo}</td>
                        <td className="px-3 py-2.5 text-sm font-medium text-foreground">{c.name}</td>
                        <td className="px-3 py-2.5 text-sm text-muted-foreground">{c.phone}</td>
                        <td className="px-3 py-2.5 text-sm text-foreground">{c.vehicle}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`${
                              statusColors[c.status] || statusColors[c.statusLabel] || "badge-warning"
                            } text-xs px-2 py-0.5 rounded-full`}
                          >
                            {c.statusLabel || c.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-sm font-semibold text-expense">
                          ₹{Number(c.balance || 0).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                      No customers match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <TablePagination
            page={page}
            totalPages={totalPagesCount}
            pageSize={itemsPerPage}
            totalItems={totalRecords}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(sz) => {
              setItemsPerPage(sz);
              setPage(1);
            }}
            pageSizeOptions={[15, 25, 50]}
            disabled={loadingList}
          />
        </div>
      </motion.section>

      {/* SECTION 3 — EXPORT & SHARE */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" /> Export & Share
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Generate, download or share documents instantly</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Pages: <strong className="text-foreground">{totalPages}</strong></span>
            <span>Size: <strong className="text-foreground">{fileSize}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Export As (2-column grid: PDF and Word, Excel removed) */}
          <div className="border border-border rounded-xl p-4 bg-card">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Export As</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="gap-2 h-auto py-3 flex-col"
                disabled={batchLoading || selectedIds.length === 0}
                onClick={() => handleTriggerPrintOrPdf("PDF")}
              >
                <FileText className="h-5 w-5 text-expense" />
                <span className="text-xs">PDF</span>
              </Button>
              <Button
                variant="outline"
                className="gap-2 h-auto py-3 flex-col"
                disabled={batchLoading || selectedIds.length === 0}
                onClick={handleExportWord}
              >
                <FileType className="h-5 w-5 text-primary" />
                <span className="text-xs">Word</span>
              </Button>
            </div>
          </div>

          {/* Share Via */}
          <div className="border border-border rounded-xl p-4 bg-card">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Share Via</p>
            <div className="grid grid-cols-4 gap-2">
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleShare("WhatsApp")}>
                <MessageCircle className="h-5 w-5 text-income" />
                <span className="text-xs">WhatsApp</span>
              </Button>
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleShare("Email")}>
                <Mail className="h-5 w-5 text-primary" />
                <span className="text-xs">Email</span>
              </Button>
              <Button
                variant="outline"
                className="gap-2 h-auto py-3 flex-col"
                disabled={batchLoading || selectedIds.length === 0}
                onClick={() => handleTriggerPrintOrPdf("PDF")}
              >
                <Download className="h-5 w-5 text-foreground" />
                <span className="text-xs">Download</span>
              </Button>
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleShare("Copy Link")}>
                <Link2 className="h-5 w-5 text-warning" />
                <span className="text-xs">Copy Link</span>
              </Button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Sticky action bar */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 lg:left-64 z-40 bg-card/95 backdrop-blur border-t border-border shadow-lg"
      >
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-foreground">{docType.name}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{theme.name} theme</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-semibold text-primary">{selectedIds.length} customer(s)</span>
          </div>
          <div className="flex gap-2">
            <Button
              ref={bottomTemplateBtnRef}
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => openTemplateDrawer(bottomTemplateBtnRef.current)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Template
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={batchLoading || selectedIds.length === 0}
              onClick={handleOpenPreview}
            >
              {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={batchLoading || selectedIds.length === 0}
              onClick={() => handleTriggerPrintOrPdf("Print")}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              style={{ background: "var(--gradient-primary)" }}
              disabled={batchLoading || selectedIds.length === 0}
              onClick={() => {
                setTemplateDrawerOpen(false);
                setPreviewOpen(false);
                setShareOpen(true);
              }}
            >
              <Download className="h-4 w-4" /> Generate & Share
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Live Preview Dialog */}
      <Dialog
        open={previewOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setTemplateDrawerOpen(false);
            setShareOpen(false);
          }
          setPreviewOpen(nextOpen);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" /> Live Preview — {docType.name} ({theme.name})
              </DialogTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={previewPageIndex <= 0}
                  onClick={() => setPreviewPageIndex((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="font-medium text-foreground">
                  Page {previewPageIndex + 1} of {totalPreviewPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={previewPageIndex >= totalPreviewPages - 1}
                  onClick={() => setPreviewPageIndex((p) => Math.min(totalPreviewPages - 1, p + 1))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="border border-border rounded-xl overflow-hidden bg-white shadow-inner">
            <iframe
              title="Live Document Preview"
              srcDoc={singlePageIframeDoc}
              className="w-full h-[65vh] border-0 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button
              variant="outline"
              className="gap-2"
              disabled={batchLoading}
              onClick={() => handleTriggerPrintOrPdf("Print")}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={batchLoading}
              onClick={handleExportWord}
            >
              <FileType className="h-4 w-4" /> Export Word
            </Button>
            <Button
              className="gap-2"
              style={{ background: "var(--gradient-primary)" }}
              disabled={batchLoading}
              onClick={() => handleTriggerPrintOrPdf("PDF")}
            >
              <Download className="h-4 w-4" /> Export PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog
        open={shareOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setTemplateDrawerOpen(false);
            setPreviewOpen(false);
          }
          setShareOpen(nextOpen);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Document</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Generating <strong>{selectedIds.length}</strong> customer document(s) • <strong>{totalPages}</strong> page(s) • <strong>{fileSize}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => handleShare("WhatsApp")}>
              <MessageCircle className="h-6 w-6 text-income" /> WhatsApp
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => handleShare("Email")}>
              <Mail className="h-6 w-6 text-primary" /> Email
            </Button>
            <Button
              variant="outline"
              className="gap-2 h-auto py-4 flex-col"
              onClick={() => {
                handleTriggerPrintOrPdf("PDF");
                setShareOpen(false);
              }}
            >
              <Download className="h-6 w-6" /> Download
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => handleShare("Copy Link")}>
              <Link2 className="h-6 w-6 text-warning" /> Copy Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Right-Side Template Customization Drawer */}
      <NoticeTemplateDrawer
        open={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
        docTypes={docTypes}
        activeDocTypeId={selectedDocTypeId}
        onSelectDocType={setSelectedDocTypeId}
        settings={templateSettings}
        onUpdateSettings={updateDocSettings}
        onResetDocSettings={resetDocSettings}
        returnFocusRef={lastTemplateTriggerRef}
      />
    </div>
  );
}

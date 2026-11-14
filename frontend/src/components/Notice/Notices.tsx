import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Search, Printer, Download, Mail, MessageCircle, Link2,
  Eye, X, Check, Users, FileType, Stamp, Award, Filter, RotateCcw,
  ChevronDown, ChevronLeft, ChevronRight, Loader2, CheckSquare,
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
  PRINT_A4_STYLESHEET,
  buildCompletePrintHtml,
  inlineImageAsDataUri,
  triggerPrintDocument,
  exportWordDocument,
} from "@/components/common/print";
import { AppSelect, TablePagination, TableSkeletonRows } from "../common";

// ---------- 5 Unified Document Types ----------
const docTypes: { id: PrintDocTypeId; name: string; desc: string }[] = [
  { id: "ledger", name: "Ledger Print", desc: "Full ledger account statement & EMI history" },
  { id: "due_card", name: "Due Card Print", desc: "EMI schedule & installment receipt card" },
  { id: "seizing_letter", name: "Seizing Letter Print", desc: "Final notice for vehicle seizure" },
  { id: "defaulter_customer", name: "Defaulter Notice - Customer", desc: "Loan defaulter demand notice to customer" },
  { id: "defaulter_coapplicant", name: "Defaulter Notice - Co-Applicant", desc: "Loan defaulter notice to guarantor / co-applicant" },
];

const themes = [
  { id: "classic", name: "Classic", desc: "Simple white", accent: "bg-white border-foreground/20" },
  { id: "modern", name: "Modern", desc: "Clean blue", accent: "bg-primary/5 border-primary/40" },
  { id: "premium", name: "Premium", desc: "Gradient + logo", accent: "border-warning/40", style: { background: "var(--gradient-primary)", color: "white" } },
  { id: "compact", name: "Compact", desc: "Minimal print", accent: "bg-secondary/30 border-border" },
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

// ---------- Mini Template Card Preview ----------
function TemplateThumb({ theme, docName }: { theme: typeof themes[0]; docName: string }) {
  const isPremium = theme.id === "premium";
  return (
    <div
      className={`relative h-32 rounded-lg border-2 ${theme.accent} overflow-hidden p-2.5 flex flex-col gap-1`}
      style={theme.style}
    >
      <div className="flex items-center gap-1.5">
        <div className={`h-4 w-4 rounded ${isPremium ? "bg-white/30" : "bg-primary"}`} />
        <div className={`h-1.5 flex-1 rounded ${isPremium ? "bg-white/40" : "bg-foreground/30"}`} />
      </div>
      <div className={`text-[8px] font-bold tracking-wider ${isPremium ? "text-white" : "text-foreground"} text-center mt-1`}>
        {docName.toUpperCase()}
      </div>
      <div className="space-y-0.5 mt-1">
        <div className={`h-1 rounded w-3/4 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
        <div className={`h-1 rounded w-2/3 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
        <div className={`h-1 rounded w-1/2 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
      </div>
      <div className={`mt-auto h-3 rounded ${isPremium ? "bg-white/40" : theme.id === "modern" ? "bg-primary/30" : "bg-foreground/20"}`} />
    </div>
  );
}

// ---------- Live Preview (Modern / Premium / Compact visual design unchanged) ----------
function DocumentPreview({ docType, theme, customer, finance, watermark, footer }: any) {
  const isPremium = theme.id === "premium";
  const isModern = theme.id === "modern";
  const isCompact = theme.id === "compact";

  const companyName = finance?.name || "FINANCE ERP COMPANY";
  const companyPhone = Array.isArray(finance?.phone_numbers) && finance.phone_numbers.length > 0
    ? finance.phone_numbers[0]
    : finance?.phone || "+91 98765 43210";
  const companySub = [finance?.address || "Main Branch", companyPhone].filter(Boolean).join(" | ");
  const logoUrl = finance?.print_logo_url || finance?.logo_url || null;

  return (
    <div className="relative bg-white text-black rounded-xl border border-border overflow-hidden shadow-lg">
      {watermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <span className="text-6xl font-black text-black/5 -rotate-45 select-none">CONFIDENTIAL</span>
        </div>
      )}

      {/* Header */}
      <div
        className={`px-6 py-4 ${isPremium ? "text-white" : isModern ? "bg-primary/10" : "bg-white border-b-2 border-black"}`}
        style={isPremium ? { background: "var(--gradient-primary)" } : {}}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold overflow-hidden ${isPremium ? "bg-white/20" : "bg-primary text-white"}`}>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain bg-white p-0.5" />
              ) : (
                "FE"
              )}
            </div>
            <div>
              <h2 className={`${isCompact ? "text-base" : "text-xl"} font-bold`}>{companyName}</h2>
              <p className="text-xs opacity-80">{companySub}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 relative z-10">
        <div className="text-center mb-5">
          <h3 className={`${isCompact ? "text-sm" : "text-lg"} font-bold uppercase ${isModern ? "text-primary" : ""}`}>
            {docType.name}
          </h3>
          <p className="text-xs text-gray-500 mt-1">Date: {new Date().toLocaleDateString("en-IN")}</p>
        </div>

        <div className={`grid grid-cols-2 gap-3 mb-5 ${isCompact ? "text-xs" : "text-sm"}`}>
          <div><span className="text-gray-500">Customer:</span> <span className="font-semibold ml-1">{customer.name}</span></div>
          <div><span className="text-gray-500">Loan No:</span> <span className="font-semibold ml-1">{customer.hpl}</span></div>
          <div><span className="text-gray-500">Phone:</span> <span className="font-semibold ml-1">{customer.phone}</span></div>
          <div><span className="text-gray-500">Vehicle:</span> <span className="font-semibold ml-1">{customer.vehicle}</span></div>
          <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="font-semibold ml-1">{customer.address || [customer.street, customer.village, customer.city].filter(Boolean).join(", ") || "N/A"}</span></div>
        </div>

        <div className={`rounded-lg p-4 mb-4 ${isPremium ? "bg-blue-50" : isModern ? "bg-primary/5" : "border border-gray-300"}`}>
          <h4 className="font-semibold mb-2 text-sm">Loan Summary</h4>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-gray-500">Principal:</span> <div className="font-bold">₹{Number(customer.principal || 0).toLocaleString("en-IN")}</div></div>
            <div><span className="text-gray-500">EMI:</span> <div className="font-bold">₹{Number(customer.emi || 0).toLocaleString("en-IN")}</div></div>
            <div><span className="text-gray-500">Rate:</span> <div className="font-bold">{customer.rate ?? 0}%</div></div>
            <div><span className="text-gray-500">Paid:</span> <div className="font-bold text-green-600">₹{Number(customer.paid || 0).toLocaleString("en-IN")}</div></div>
            <div><span className="text-gray-500">Due:</span> <div className="font-bold text-red-600">₹{Number(customer.amount || 0).toLocaleString("en-IN")}</div></div>
            <div><span className="text-gray-500">Status:</span> <div className="font-bold">{customer.status}</div></div>
          </div>
        </div>

        {!isCompact && (
          <p className="text-xs text-gray-600 leading-relaxed mb-6">
            This is to inform you that an amount of <strong>₹{Number(customer.amount || 0).toLocaleString("en-IN")}</strong> is overdue against the above loan account. Kindly remit the dues immediately to avoid further action.
          </p>
        )}

        <div className="flex justify-between mt-8 pt-4">
          <div className="text-center">
            <div className="border-t border-gray-400 w-32 mb-1" />
            <p className="text-[10px] text-gray-500">Customer Signature</p>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 w-32 mb-1" />
            <p className="text-[10px] text-gray-500">Authorised Signatory</p>
          </div>
        </div>

        {footer && (
          <div className={`mt-5 pt-3 border-t text-center text-[10px] ${isPremium ? "text-gray-600" : "text-gray-500"}`}>
            <Stamp className="inline h-3 w-3 mr-1" />
            {companyName} • Authorised Seal & Signature
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main ----------
export default function Notices() {
  const { toast } = useToast();
  const { currentFinance } = useAuth();

  const [docType, setDocType] = useState(docTypes[0]);
  const [theme, setTheme] = useState(themes[0]); // Default theme = Classic (themes[0])
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [footer, setFooter] = useState(true);

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
        { watermark, footer },
        docType.name
      );

      return {
        items: batchRes.items,
        finance: resolvedFinance,
        built,
      };
    },
    [currentFinance, docType, watermark, footer]
  );

  // Re-build preview pages when docType, watermark, or footer changes while preview is open
  useEffect(() => {
    if (!previewOpen || previewBatchItems.length === 0 || !previewFinance) return;
    const built = buildCompletePrintHtml(
      previewBatchItems,
      previewFinance,
      docType.id,
      { watermark, footer },
      docType.name
    );
    setPreviewPagesHtml(built.pagesHtml);
    setPreviewPageIndex((prev) => Math.min(prev, Math.max(0, built.pagesHtml.length - 1)));
  }, [previewOpen, previewBatchItems, previewFinance, docType, watermark, footer]);

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
      setPreviewPageIndex(0);
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
      exportWordDocument(filename, built.html);
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

  // Map current preview item for Modern / Premium / Compact DocumentPreview
  const currentModernPreviewCustomer = (() => {
    const item = previewBatchItems[previewPageIndex] || previewBatchItems[0];
    if (item) {
      const c = item.customer || {};
      const l = item.loan || {};
      const v = item.vehicle || {};
      const pList = Array.isArray(item.payments) ? item.payments : [];
      const paidSum = pList.reduce((s: number, p: any) => s + (Number(p?.amount) || 0), 0);
      const totalDue = (Number(l.dueMonth ?? l.due_month) || 0) * (Number(l.dueAmount ?? l.due_amount) || 0);
      const balance = Math.max(0, totalDue - paidSum);
      return {
        name: c.cname || "N/A",
        hpl: c.hplno ? `HPL ${c.hplno}` : "N/A",
        phone: Array.isArray(c.ccontacts) && c.ccontacts[0]?.number ? c.ccontacts[0].number : "N/A",
        vehicle: v.vehicle_number || "N/A",
        address: c.full_address || "N/A",
        principal: Number(l.hpAmount ?? l.hp_amount) || 0,
        emi: Number(l.dueAmount ?? l.due_amount) || 0,
        rate: Number(l.interestRate ?? l.interest_rate) || 0,
        paid: paidSum,
        amount: balance,
        status: c.loanStatus ? String(c.loanStatus).toUpperCase() : "ACTIVE",
      };
    }
    const fallbackRec =
      (selectedIds.length > 0 ? selectedRecordsMap[selectedIds[0]] : null) || records[0];
    return {
      name: fallbackRec?.name || "N/A",
      hpl: fallbackRec?.loanNo || "N/A",
      phone: fallbackRec?.phone || "N/A",
      vehicle: fallbackRec?.vehicle || "N/A",
      street: fallbackRec?.street || "",
      village: fallbackRec?.village || "",
      city: fallbackRec?.city || "",
      principal: fallbackRec?.hpAmount || 0,
      emi: fallbackRec?.installmentAmount || 0,
      rate: fallbackRec?.interestRate || 0,
      paid: fallbackRec?.paid || 0,
      amount: fallbackRec?.balance || 0,
      status: fallbackRec?.statusLabel || "Active",
    };
  })();

  const totalPreviewPages =
    theme.id === "classic"
      ? Math.max(1, previewPagesHtml.length)
      : Math.max(1, previewBatchItems.length);

  const singlePageIframeDoc =
    theme.id === "classic" && previewPagesHtml[previewPageIndex]
      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PRINT_A4_STYLESHEET} body { padding: 8mm; background: #fff; }</style></head><body>${previewPagesHtml[previewPageIndex]}</body></html>`
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
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleOpenPreview}
          disabled={batchLoading || selectedIds.length === 0}
        >
          {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Live Preview
        </Button>
      </motion.div>

      {/* SECTION 1 — TEMPLATE SELECTION */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Document Template
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Choose document type and visual theme</p>
          </div>
        </div>

        {/* 5 Unified Doc Type Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-5">
          {docTypes.map((d) => (
            <button
              key={d.id}
              onClick={() => setDocType(d)}
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

        {/* Theme variants */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Template Variants</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {themes.map((t) => (
            <motion.button
              key={t.id}
              whileHover={{ y: -3 }}
              onClick={() => setTheme(t)}
              className={`rounded-xl border-2 transition-all overflow-hidden text-left ${
                theme.id === t.id
                  ? "border-primary ring-2 ring-primary/20 shadow-md"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <TemplateThumb theme={t} docName={docType.name} />
              <div className="p-2.5 bg-card">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  {theme.id === t.id && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground">{t.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Watermark / Footer toggles */}
        <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-border">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={watermark} onCheckedChange={(v) => setWatermark(!!v)} />
            <Award className="h-4 w-4 text-warning" /> Confidential Watermark
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={footer} onCheckedChange={(v) => setFooter(!!v)} />
            <Stamp className="h-4 w-4 text-primary" /> Company Seal & Footer
          </label>
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
              onClick={() => setShareOpen(true)}
            >
              <Download className="h-4 w-4" /> Generate & Share
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Live Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
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

          {theme.id === "classic" ? (
            <div className="border border-border rounded-xl overflow-hidden bg-white shadow-inner">
              <iframe
                title={`Preview Page ${previewPageIndex + 1}`}
                srcDoc={singlePageIframeDoc}
                className="w-full h-[65vh] border-0 bg-white"
              />
            </div>
          ) : (
            <DocumentPreview
              docType={docType}
              theme={theme}
              customer={currentModernPreviewCustomer}
              finance={previewFinance || currentFinance}
              watermark={watermark}
              footer={footer}
            />
          )}

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
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
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
    </div>
  );
}

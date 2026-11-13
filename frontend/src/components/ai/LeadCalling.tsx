import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneCall,
  PhoneMissed,
  CheckCircle2,
  Clock,
  Calendar,
  CalendarClock,
  Search,
  RefreshCw,
  Bot,
  Sparkles,
  Users,
  Volume2,
  X,
  AlertCircle,
  Copy,
  Settings as SettingsIcon,
  ShieldAlert,
  Play,
  ChevronLeft,
  ChevronRight,
  Lock,
  Info,
  ExternalLink,
  ListOrdered,
  Ban,
} from "lucide-react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AppSelect, TablePagination, TableSkeletonRows, CardGridSkeleton } from "../common";
import { toast } from "../../hooks/use-toast";
import {
  aiApi,
  type LeadItem,
  type LeadCallStatus,
  type LeadsSummary,
  type LeadsPagination,
  type VoiceHealthResponse,
  type LiveCallSession,
  type ManualCallInitResponse,
  type CallQueueBatch,
  type RiskLevel,
} from "../../api/aiApi";
import {
  TEST_MODE_BADGE_TEXT,
  STATUS_UNKNOWN_TEXT,
  MAX_CALL_POLL_DURATION_MS,
  createIdempotencyKeySession,
  acquireIdempotencyKey,
  recordIdempotencyOutcome,
  resolveCallLifecycleState,
  mapCallStateToUi,
  mapLeadRowToUiStatus,
  isMockTelephonyActive,
  classifyCallInitError,
  computeNextPollDelayMs,
  type IdempotencyKeySession,
  type ClassifiedCallInitError,
  type LeadRowBadgeTone,
} from "./callLifecycleModel";

export type { LeadItem as Lead, LeadCallStatus };

const EMPTY_SUMMARY: LeadsSummary = {
  unpaidLeads: 0,
  readyToCall: 0,
  calledToday: 0,
  noResponse: 0,
  scheduledCount: 0,
  suppressedCount: 0,
  totalOverdueAmount: 0,
  totalBalanceAmount: 0,
};

const DEFAULT_PAGINATION: LeadsPagination = {
  page: 1,
  limit: 25,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatOutcomeLabel(outcome?: string | null): string {
  if (!outcome || outcome === "never_called") return "Never Called";
  return outcome
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function getRiskBadgeStyle(level: RiskLevel): string {
  switch (level) {
    case "critical":
      return "bg-red-600/20 text-red-800 dark:text-red-300 border-red-500/40";
    case "high":
      return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/40";
    case "warning":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40";
    case "safe":
    default:
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40";
  }
}

function getBadgeToneClasses(tone: LeadRowBadgeTone): string {
  switch (tone) {
    case "emerald":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "blue":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
    case "indigo":
      return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30";
    case "amber":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35";
    case "rose":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
    case "purple":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
    case "neutral":
    default:
      return "bg-secondary text-secondary-foreground border-border";
  }
}

function extractApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: string; message?: string; details?: { message?: string } }
      | undefined;
    return (
      data?.details?.message ||
      data?.error ||
      data?.message ||
      err.message ||
      fallback
    );
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function buildScheduleIsoFromPreset(preset: string): string {
  const now = new Date();
  const target = new Date(now);
  if (preset.includes("Today")) {
    target.setHours(18, 0, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
      target.setHours(10, 0, 0, 0);
    }
  } else if (preset.includes("02:30 PM")) {
    target.setDate(target.getDate() + 1);
    target.setHours(14, 30, 0, 0);
  } else if (preset.includes("2 Days")) {
    target.setDate(target.getDate() + 2);
    target.setHours(11, 0, 0, 0);
  } else {
    target.setDate(target.getDate() + 1);
    target.setHours(10, 0, 0, 0);
  }
  return target.toISOString();
}

function VoiceWaveform({ isSpeaking }: { isSpeaking: boolean }) {
  const heights = [40, 80, 55, 95, 70, 85, 45, 90, 60, 75, 50, 65];
  return (
    <div className="flex items-center gap-1 h-8 px-2">
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-primary"
          animate={
            isSpeaking
              ? {
                  height: [`${Math.max(15, h * 0.3)}%`, `${h}%`, `${Math.max(20, h * 0.5)}%`],
                  opacity: [0.7, 1, 0.7],
                }
              : { height: "20%", opacity: 0.3 }
          }
          transition={{
            repeat: Infinity,
            duration: 0.6 + (i % 4) * 0.15,
            ease: "easeInOut",
            delay: (i * 0.05) % 0.4,
          }}
        />
      ))}
    </div>
  );
}

function CustomerAvatar({
  lead,
  sizeClass = "h-9 w-9 text-xs",
}: {
  lead: Pick<LeadItem, "customerName" | "avatarColor" | "photoUrl">;
  sizeClass?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [lead.photoUrl]);

  const initials = (lead.customerName || "C")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (lead.photoUrl && !imgFailed) {
    return (
      <img
        src={lead.photoUrl}
        alt={lead.customerName}
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-full object-cover shrink-0 border border-border shadow-sm`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full ${lead.avatarColor || "bg-blue-600"} text-white flex items-center justify-center font-bold shrink-0 shadow-sm`}
    >
      {initials || "CU"}
    </div>
  );
}

export default function LeadCalling() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [summary, setSummary] = useState<LeadsSummary>(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState<LeadsPagination>(DEFAULT_PAGINATION);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [isLoadingLeads, setIsLoadingLeads] = useState<boolean>(true);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState<boolean>(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  // Composite Voice AI Health State (`Dograh` + `Python Voice Agent`)
  const [voiceHealth, setVoiceHealth] = useState<VoiceHealthResponse | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(true);

  // Selection State (for scheduling callbacks / sequential call queue)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  // Server-Side Query Filters & Pagination State
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [overdueBucket, setOverdueBucket] = useState<string>("all");
  const [sortOption, setSortOption] = useState<string>("daysOverdue:desc");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Single-Customer Manual Call Modal & Lifecycle State
  const [activeLead, setActiveLead] = useState<LeadItem | null>(null);
  const [callModalOpen, setCallModalOpen] = useState<boolean>(false);
  const [isStartingCall, setIsStartingCall] = useState<boolean>(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [initCallMeta, setInitCallMeta] = useState<ManualCallInitResponse | null>(null);
  const [liveCall, setLiveCall] = useState<LiveCallSession | null>(null);
  const [callInitError, setCallInitError] = useState<ClassifiedCallInitError | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollCapReached, setPollCapReached] = useState<boolean>(false);
  const [modalAmbiguousUnknown, setModalAmbiguousUnknown] = useState<boolean>(false);

  // Customers locked in `'unknown'` (`needs_reconcile` / `504 dispatch_timeout_ambiguous`)
  // until the backend reports a terminal state
  const [verifyingCustomers, setVerifyingCustomers] = useState<
    Record<string, { callId: string | null; lockedAtMs: number }>
  >({});

  const verifyingCustomerIds = useMemo(
    () => new Set(Object.keys(verifyingCustomers)),
    [verifyingCustomers]
  );

  // Dialog-scoped Idempotency-Key sessions & synchronous double-click locks
  const singleCallIdemRef = useRef<IdempotencyKeySession | null>(null);
  const manualSubmitLockRef = useRef<boolean>(false);
  const queueCallIdemRef = useRef<IdempotencyKeySession | null>(null);
  const queueSubmitLockRef = useRef<boolean>(false);

  // Backoff Polling & Abort refs (`GET /api/ai/calls/:id`)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollGenerationRef = useRef<number>(0);

  // Recording Audio Playback State (shared safely for active call modal & detail drawer)
  const [recordingCallId, setRecordingCallId] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [isLoadingRecording, setIsLoadingRecording] = useState<boolean>(false);

  // Customer & Last Call Details Modal State
  const [detailLead, setDetailLead] = useState<LeadItem | null>(null);

  // Schedule Callback Modal State
  const [scheduleModalOpen, setScheduleModalOpen] = useState<boolean>(false);
  const [schedulingLeads, setSchedulingLeads] = useState<LeadItem[]>([]);
  const [selectedSchedulePreset, setSelectedSchedulePreset] = useState<string>("Tomorrow 10:00 AM");
  const [customScheduleDate, setCustomScheduleDate] = useState<string>("");
  const [scheduleNote, setScheduleNote] = useState<string>("");
  const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);

  // Persistent Multi-Customer Manual Call Queue State (`POST /api/ai/calls/queue`)
  const [queueModalOpen, setQueueModalOpen] = useState<boolean>(false);
  const [queueCandidates, setQueueCandidates] = useState<LeadItem[]>([]);
  const [activeQueueBatch, setActiveQueueBatch] = useState<CallQueueBatch | null>(null);
  const [queueMockMode, setQueueMockMode] = useState<boolean>(false);
  const [queueInitError, setQueueInitError] = useState<ClassifiedCallInitError | null>(null);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState<boolean>(false);
  const [isCancellingQueue, setIsCancellingQueue] = useState<boolean>(false);
  const [dismissedBatchId, setDismissedBatchId] = useState<string | null>(null);

  const lockCustomerVerifying = useCallback((customerId: string, callId: string | null) => {
    setVerifyingCustomers((prev) => ({
      ...prev,
      [customerId]: {
        callId: callId || prev[customerId]?.callId || null,
        lockedAtMs: prev[customerId]?.lockedAtMs || Date.now(),
      },
    }));
  }, []);

  const clearCustomerVerifying = useCallback((customerId: string) => {
    setVerifyingCustomers((prev) => {
      if (!prev[customerId]) return prev;
      const next = { ...prev };
      delete next[customerId];
      return next;
    });
  }, []);

  // Debounce search input (`300ms`) and reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch composite Voice AI health (`GET /api/ai/voice-health`)
  const fetchVoiceHealth = useCallback(async (forceRefresh = false) => {
    try {
      setIsCheckingHealth(true);
      const data = await aiApi.getVoiceHealth(forceRefresh);
      setVoiceHealth(data);
    } catch {
      setVoiceHealth({
        success: false,
        status: "offline",
        online: false,
        label: "Voice System Offline",
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    void fetchVoiceHealth(false);
    const interval = setInterval(() => {
      void fetchVoiceHealth(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchVoiceHealth]);

  // Fetch strictly read-only tenant leads (`GET /api/ai/leads`)
  const fetchLeads = useCallback(async () => {
    setIsLoadingLeads(true);
    setLeadsError(null);
    const [sortBy, sortDirRaw] = sortOption.split(":");
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    try {
      const response = await aiApi.getLeads({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        riskLevel: riskFilter !== "all" ? riskFilter : undefined,
        overdueBucket: overdueBucket !== "all" ? overdueBucket : undefined,
        sortBy,
        sortDir,
      });

      const fetchedLeads = Array.isArray(response.leads) ? response.leads : [];
      setLeads(fetchedLeads);
      if (response.summary) setSummary(response.summary);
      if (response.pagination) setPagination(response.pagination);
      setLastRefreshedAt(response.meta?.lastRefreshedAt || null);

      // Reconcile client-locked `'unknown'` customers against fresh server lead state:
      // release lock ONLY when server reports a terminal call log (no longer calling / needs_reconcile).
      setVerifyingCustomers((prev) => {
        const keys = Object.keys(prev);
        if (keys.length === 0) return prev;
        let mutated = false;
        const next = { ...prev };
        for (const cid of keys) {
          const match = fetchedLeads.find((l) => l.customerId === cid);
          if (!match) continue;
          const last = match.lastCallDetails;
          const stillActiveOrAmbiguous =
            match.callSessionStatus === "calling" ||
            last?.needsReconcile === true ||
            last?.disposition === "needs_reconcile" ||
            last?.status === "unknown";
          if (last && !stillActiveOrAmbiguous) {
            const lastCallMs = match.lastCallAt ? new Date(match.lastCallAt).getTime() : 0;
            if (!next[cid].callId || last.callId === next[cid].callId || lastCallMs >= next[cid].lockedAtMs - 5000) {
              delete next[cid];
              mutated = true;
            }
          }
        }
        return mutated ? next : prev;
      });
    } catch (err) {
      const msg = extractApiErrorMessage(err, "Failed to load overdue customer leads.");
      setLeadsError(msg);
    } finally {
      setIsLoadingLeads(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, riskFilter, overdueBucket, sortOption]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  // Explicit Lead Queue Refresh (`POST /api/ai/leads/refresh` with cooldown)
  const handleRefreshQueue = async () => {
    setIsRefreshingQueue(true);
    try {
      const [refreshRes] = await Promise.all([
        aiApi.refreshLeads(),
        fetchVoiceHealth(true),
      ]);
      await fetchLeads();

      if (refreshRes.cooldownActive) {
        toast({
          title: "Leads Up to Date",
          description: `Queue was refreshed recently. Next full sync available in ${refreshRes.cooldownRemainingSeconds}s.`,
        });
      } else {
        toast({
          title: "Lead Queue Synced",
          description: `Synchronized ${refreshRes.refreshedCount} overdue customer record(s) from live loan ledger.`,
        });
      }
    } catch (err) {
      toast({
        title: "Refresh Failed",
        description: extractApiErrorMessage(err, "Unable to refresh telecalling queue right now."),
        variant: "destructive",
      });
    } finally {
      setIsRefreshingQueue(false);
    }
  };

  // Stop & clean up any active `GET /api/ai/calls/:id` timer and in-flight HTTP request
  const stopCallPolling = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCallPolling();
    };
  }, [stopCallPolling]);

  // Progressive backoff poller for `GET /api/ai/calls/:callId` with ~12-minute hard cap
  const startCallPolling = useCallback(
    (callId: string, customerId: string) => {
      stopCallPolling();
      const generation = pollGenerationRef.current;
      const startedAtMs = Date.now();
      let attemptIndex = 0;
      let consecutiveErrors = 0;

      const scheduleTick = (delayMs: number) => {
        pollTimeoutRef.current = setTimeout(async () => {
          if (generation !== pollGenerationRef.current) return;

          const controller = new AbortController();
          pollAbortRef.current = controller;

          try {
            const res = await aiApi.getCallStatus(callId, controller.signal);
            if (generation !== pollGenerationRef.current) return;

            consecutiveErrors = 0;
            setPollError(null);
            setLiveCall(res.call);

            const resolvedState = resolveCallLifecycleState({
              callDisplayState: res.call.callDisplayState,
              callLifecycleStatus: res.call.callLifecycleStatus,
              callStatus: res.call.callStatus,
              needsReconcile: res.call.needsReconcile,
              disposition: res.call.disposition,
              errorDetail: res.call.errorDetail,
              answered: res.call.answered,
              customerSpoke: res.call.customerSpoke,
            });

            if (resolvedState === "unknown") {
              setModalAmbiguousUnknown(true);
              lockCustomerVerifying(customerId, callId);
            }

            if (res.call.isTerminal) {
              setModalAmbiguousUnknown(false);
              clearCustomerVerifying(customerId);
              stopCallPolling();
              void fetchLeads();
              return;
            }

            const elapsedMs = Date.now() - startedAtMs;
            const nextDelay = computeNextPollDelayMs(attemptIndex, elapsedMs, {
              isTerminal: res.call.isTerminal,
              maxDurationMs: MAX_CALL_POLL_DURATION_MS,
            });
            attemptIndex += 1;

            if (nextDelay === null) {
              stopCallPolling();
              setPollCapReached(true);
              void fetchLeads();
              return;
            }

            scheduleTick(nextDelay);
          } catch (err) {
            if (generation !== pollGenerationRef.current || controller.signal.aborted) {
              return;
            }
            consecutiveErrors += 1;
            const status = axios.isAxiosError(err) ? err.response?.status : undefined;
            if (status === 401 || status === 403 || status === 404 || consecutiveErrors >= 4) {
              stopCallPolling();
              setPollError(
                extractApiErrorMessage(
                  err,
                  "Lost connection while polling call status. Refresh leads to check latest status."
                )
              );
              return;
            }

            const elapsedMs = Date.now() - startedAtMs;
            const retryDelay = computeNextPollDelayMs(
              attemptIndex + consecutiveErrors * 8,
              elapsedMs,
              { maxDurationMs: MAX_CALL_POLL_DURATION_MS }
            );
            if (retryDelay === null) {
              stopCallPolling();
              setPollCapReached(true);
              return;
            }
            scheduleTick(retryDelay);
          }
        }, delayMs);
      };

      // First poll immediately (`250ms` initial check, then progressive backoff)
      scheduleTick(250);
    },
    [clearCustomerVerifying, fetchLeads, lockCustomerVerifying, stopCallPolling]
  );

  // Open single-customer call modal — mints ONE fresh Idempotency-Key for this dialog session
  const handleOpenCallModal = (lead: LeadItem) => {
    const rowStatus = mapLeadRowToUiStatus(lead, verifyingCustomerIds);
    if (rowStatus.isUnknownVerifying) {
      toast({
        title: STATUS_UNKNOWN_TEXT,
        description:
          "A previous call request for this customer is still being verified by the backend reconciler. New calls are blocked until a terminal state is confirmed.",
        variant: "destructive",
      });
      return;
    }

    stopCallPolling();
    singleCallIdemRef.current = createIdempotencyKeySession("mcall");
    setActiveLead(lead);
    setActiveCallId(null);
    setInitCallMeta(null);
    setLiveCall(null);
    setCallInitError(null);
    setPollError(null);
    setPollCapReached(false);
    setModalAmbiguousUnknown(false);
    setRecordingCallId(null);
    setRecordingUrl(null);
    setCallModalOpen(true);
  };

  // Zero-Trust Manual Call Trigger (`POST /api/ai/calls/manual` sending `{ customerId }` + `Idempotency-Key`)
  const handleConfirmManualCall = async () => {
    if (!activeLead || manualSubmitLockRef.current) return;

    const rowStatus = mapLeadRowToUiStatus(activeLead, verifyingCustomerIds);
    if (rowStatus.isUnknownVerifying) {
      setModalAmbiguousUnknown(true);
      return;
    }

    manualSubmitLockRef.current = true;
    stopCallPolling();
    setIsStartingCall(true);
    setCallInitError(null);
    setPollError(null);
    setPollCapReached(false);
    setActiveCallId(null);
    setInitCallMeta(null);
    setLiveCall(null);

    const baseSession =
      singleCallIdemRef.current || createIdempotencyKeySession("mcall");
    const { key: idempotencyKey, session: activeKeySession } =
      acquireIdempotencyKey(baseSession);
    singleCallIdemRef.current = activeKeySession;

    try {
      const initRes = await aiApi.initiateManualCall(
        activeLead.customerId,
        idempotencyKey
      );
      // Definitive HTTP response received -> mark current key consumed so any future attempt mints a NEW key
      singleCallIdemRef.current = recordIdempotencyOutcome(activeKeySession, {
        hasServerResponse: true,
      });

      setInitCallMeta(initRes);
      setActiveCallId(initRes.callId);

      const initialState = resolveCallLifecycleState({
        callDisplayState: initRes.callDisplayState,
        callLifecycleStatus: initRes.callLifecycleStatus,
        needsReconcile: initRes.needsReconcile,
      });

      if (initialState === "unknown") {
        setModalAmbiguousUnknown(true);
        lockCustomerVerifying(activeLead.customerId, initRes.callId);
      }

      startCallPolling(initRes.callId, activeLead.customerId);
    } catch (err) {
      const classified = classifyCallInitError(err);
      // Reuse SAME key ONLY when no HTTP response was received; mint NEW key on next attempt after ANY server response
      singleCallIdemRef.current = recordIdempotencyOutcome(activeKeySession, {
        hasServerResponse: classified.hasServerResponse,
      });

      setCallInitError(classified);

      if (classified.isAmbiguousUnknown) {
        setModalAmbiguousUnknown(true);
        lockCustomerVerifying(activeLead.customerId, classified.ambiguousCallId);
        if (classified.ambiguousCallId) {
          setActiveCallId(classified.ambiguousCallId);
          startCallPolling(classified.ambiguousCallId, activeLead.customerId);
        }
        toast({
          title: STATUS_UNKNOWN_TEXT,
          description: classified.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: classified.title,
          description: classified.message,
          variant: "destructive",
        });
      }
    } finally {
      manualSubmitLockRef.current = false;
      setIsStartingCall(false);
    }
  };

  const closeSingleCallModal = () => {
    stopCallPolling();
    singleCallIdemRef.current = null;
    setCallModalOpen(false);
    setActiveLead(null);
    setActiveCallId(null);
    setInitCallMeta(null);
    setLiveCall(null);
    setCallInitError(null);
    setPollError(null);
    setPollCapReached(false);
    setModalAmbiguousUnknown(false);
    void fetchLeads();
  };

  // Load 300s presigned S3 audio URL (`GET /api/ai/calls/:callId/recording-url`)
  const handlePlayRecording = async (callId: string) => {
    setIsLoadingRecording(true);
    setRecordingCallId(callId);
    setRecordingUrl(null);
    try {
      const res = await aiApi.getCallRecordingUrl(callId);
      setRecordingUrl(res.playbackUrl);
    } catch (err) {
      setRecordingCallId(null);
      toast({
        title: "Recording Unavailable",
        description: extractApiErrorMessage(
          err,
          "Could not generate playback link for this call recording."
        ),
        variant: "destructive",
      });
    } finally {
      setIsLoadingRecording(false);
    }
  };

  // Multi-select helpers
  const isAllSelected =
    leads.length > 0 && leads.every((l) => selectedLeadIds.includes(l.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map((l) => l.id));
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const clearSelection = () => setSelectedLeadIds([]);

  // Copy Phone Number
  const copyPhoneNumber = (phone: string) => {
    if (!phone) return;
    void navigator.clipboard.writeText(phone);
    toast({
      title: "Phone Copied",
      description: `Copied +91 ${phone} to clipboard.`,
    });
  };

  // Schedule Callbacks (`POST /api/ai/leads/schedule`)
  const handleOpenScheduleModal = (leadsToSchedule: LeadItem[]) => {
    setSchedulingLeads(leadsToSchedule);
    setSelectedSchedulePreset("Tomorrow 10:00 AM");
    setCustomScheduleDate("");
    setScheduleNote("");
    setScheduleModalOpen(true);
  };

  const confirmScheduleCall = async () => {
    if (schedulingLeads.length === 0) return;
    setIsSavingSchedule(true);
    const scheduledTimeText = customScheduleDate || selectedSchedulePreset;
    const scheduledAtIso = customScheduleDate
      ? new Date(customScheduleDate).toISOString()
      : buildScheduleIsoFromPreset(selectedSchedulePreset);

    try {
      const res = await aiApi.scheduleLeads({
        leadIds: schedulingLeads.map((sl) => sl.leadId || sl.customerId),
        scheduledAtIso,
        schedulePreset: scheduledTimeText,
        note: scheduleNote || undefined,
      });

      toast({
        title: "Callbacks Scheduled",
        description: `Scheduled ${res.scheduledCount} customer callback(s) for ${scheduledTimeText}.`,
      });
      setScheduleModalOpen(false);
      clearSelection();
      await fetchLeads();
    } catch (err) {
      toast({
        title: "Schedule Failed",
        description: extractApiErrorMessage(err, "Unable to schedule callbacks right now."),
        variant: "destructive",
      });
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Fetch active / recent multi-customer manual call queue (`GET /api/ai/calls/queue/active`)
  const fetchActiveQueue = useCallback(
    async (batchId?: string | null) => {
      try {
        const res = await aiApi.getActiveCallQueue(batchId);
        const prevActive = Boolean(
          activeQueueBatch &&
            activeQueueBatch.pendingCount + activeQueueBatch.processingCount > 0
        );
        const nextActive = Boolean(
          res.batch && res.batch.pendingCount + res.batch.processingCount > 0
        );
        setActiveQueueBatch(res.batch || null);
        if (prevActive && !nextActive) {
          void fetchLeads();
        }
      } catch {
        // Silent background poll tolerance
      }
    },
    [activeQueueBatch, fetchLeads]
  );

  useEffect(() => {
    void fetchActiveQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isQueueRunning = Boolean(
    activeQueueBatch && activeQueueBatch.pendingCount + activeQueueBatch.processingCount > 0
  );

  useEffect(() => {
    if (!isQueueRunning) return;
    const timer = setInterval(() => {
      void fetchActiveQueue(activeQueueBatch?.batchId || null);
    }, 2500);
    return () => clearInterval(timer);
  }, [isQueueRunning, activeQueueBatch?.batchId, fetchActiveQueue]);

  const handleOpenQueueModal = (selected: LeadItem[]) => {
    const eligible = selected.filter((l) => {
      const rowStatus = mapLeadRowToUiStatus(l, verifyingCustomerIds);
      return !l.isSuppressed && Boolean(l.phone) && !rowStatus.blocksNewCall;
    });
    if (eligible.length === 0) {
      toast({
        title: "No Callable Customers Selected",
        description:
          "Selected leads are opted out (DNC), missing a valid phone number, or already have an active/verifying call.",
        variant: "destructive",
      });
      return;
    }
    queueCallIdemRef.current = createIdempotencyKeySession("mqueue");
    setQueueInitError(null);
    setQueueCandidates(eligible);
    setQueueModalOpen(true);
  };

  const handleConfirmQueueBatch = async () => {
    if (queueCandidates.length === 0 || queueSubmitLockRef.current) return;
    queueSubmitLockRef.current = true;
    setIsQueueSubmitting(true);
    setQueueInitError(null);

    const baseSession =
      queueCallIdemRef.current || createIdempotencyKeySession("mqueue");
    const { key: idempotencyKey, session: activeKeySession } =
      acquireIdempotencyKey(baseSession);
    queueCallIdemRef.current = activeKeySession;

    try {
      const customerIds = queueCandidates.map((l) => l.customerId);
      const res = await aiApi.enqueueCallBatch(customerIds, idempotencyKey);
      queueCallIdemRef.current = recordIdempotencyOutcome(activeKeySession, {
        hasServerResponse: true,
      });

      setQueueMockMode(isMockTelephonyActive(res));
      setDismissedBatchId(null);
      setActiveQueueBatch(res);
      setQueueModalOpen(false);
      queueCallIdemRef.current = null;
      clearSelection();
      toast({
        title: "Call Queue Accepted",
        description:
          res.skippedAlreadyQueued.length > 0
            ? `Accepted ${res.totalItems} customer(s) into sequential queue (${res.skippedAlreadyQueued.length} already queued).`
            : `Accepted ${res.totalItems} customer(s) for sequential server-verified Voice AI calling.`,
      });
    } catch (err) {
      const classified = classifyCallInitError(err);
      queueCallIdemRef.current = recordIdempotencyOutcome(activeKeySession, {
        hasServerResponse: classified.hasServerResponse,
      });
      setQueueInitError(classified);
      toast({
        title: classified.title,
        description: classified.message,
        variant: "destructive",
      });
    } finally {
      queueSubmitLockRef.current = false;
      setIsQueueSubmitting(false);
    }
  };

  const closeQueueModal = () => {
    if (isQueueSubmitting) return;
    queueCallIdemRef.current = null;
    setQueueInitError(null);
    setQueueModalOpen(false);
  };

  const handleCancelQueueBatch = async () => {
    if (!activeQueueBatch?.batchId) return;
    setIsCancellingQueue(true);
    try {
      const res = await aiApi.cancelCallQueue(activeQueueBatch.batchId);
      if (res.batch) setActiveQueueBatch(res.batch);
      toast({
        title: "Pending Queue Cancelled",
        description: `Cancelled ${res.cancelledCount} waiting customer call(s). Any live call in progress will finish safely.`,
      });
      await fetchLeads();
    } catch (err) {
      toast({
        title: "Cancel Failed",
        description: extractApiErrorMessage(err, "Unable to cancel pending queue items."),
        variant: "destructive",
      });
    } finally {
      setIsCancellingQueue(false);
    }
  };

  const isVoiceOnline = Boolean(voiceHealth?.online);

  // Compute authoritative 10-state + `'unknown'` UI descriptor for the Single-Customer Call Modal
  const isDefinitePreDialFailure = Boolean(
    (callInitError && callInitError.isDefinitePreDialFailure) ||
      liveCall?.disposition === "pre_dial_failed"
  );

  const modalLifecycleState = useMemo(() => {
    if (isStartingCall) return "submitting" as const;
    if (modalAmbiguousUnknown && (!liveCall || !liveCall.isTerminal)) {
      return "unknown" as const;
    }
    if (liveCall) {
      return resolveCallLifecycleState({
        callDisplayState: liveCall.callDisplayState,
        callLifecycleStatus: liveCall.callLifecycleStatus,
        callStatus: liveCall.callStatus,
        needsReconcile: liveCall.needsReconcile,
        disposition: liveCall.disposition,
        errorDetail: liveCall.errorDetail,
        answered: liveCall.answered,
        customerSpoke: liveCall.customerSpoke,
        isDefinitePreDialFailure,
      });
    }
    if (activeCallId && initCallMeta) {
      return resolveCallLifecycleState({
        callDisplayState: initCallMeta.callDisplayState,
        callLifecycleStatus: initCallMeta.callLifecycleStatus,
        needsReconcile: initCallMeta.needsReconcile,
      });
    }
    if (callInitError && callInitError.isDefinitePreDialFailure) {
      return "failed" as const;
    }
    return "idle" as const;
  }, [
    activeCallId,
    callInitError,
    initCallMeta,
    isDefinitePreDialFailure,
    isStartingCall,
    liveCall,
    modalAmbiguousUnknown,
  ]);

  const modalUi = useMemo(
    () => mapCallStateToUi(modalLifecycleState, { isDefinitePreDialFailure }),
    [modalLifecycleState, isDefinitePreDialFailure]
  );

  const showModalMockBadge = useMemo(
    () => isMockTelephonyActive(liveCall) || isMockTelephonyActive(initCallMeta),
    [liveCall, initCallMeta]
  );

  const isActivelyInCall = Boolean(
    modalUi.isActive && (isStartingCall || activeCallId || modalAmbiguousUnknown)
  );

  const activeLeadRowStatus = useMemo(
    () => (activeLead ? mapLeadRowToUiStatus(activeLead, verifyingCustomerIds) : null),
    [activeLead, verifyingCustomerIds]
  );

  const hasActiveFilters =
    Boolean(searchInput.trim()) ||
    statusFilter !== "all" ||
    riskFilter !== "all" ||
    overdueBucket !== "all" ||
    sortOption !== "daysOverdue:desc";

  // Shared Lead Row Badge using the authoritative 10-state + `'unknown'` mapper
  const renderSessionBadge = (lead: LeadItem) => {
    const rowUi = mapLeadRowToUiStatus(lead, verifyingCustomerIds);
    const toneClasses = getBadgeToneClasses(rowUi.tone);

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${toneClasses} ${
          rowUi.pulse ? "font-semibold" : ""
        }`}
      >
        {rowUi.pulse ? (
          <span
            className={`h-2 w-2 rounded-full animate-ping ${
              rowUi.isUnknownVerifying ? "bg-amber-600" : "bg-blue-600"
            }`}
          />
        ) : rowUi.lifecycleState === "suppressed" ? (
          <ShieldAlert className="h-3 w-3" />
        ) : rowUi.lifecycleState === "scheduled" ? (
          <CalendarClock className="h-3 w-3 text-purple-600" />
        ) : rowUi.lifecycleState === "completed" ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
        ) : rowUi.lifecycleState === "no_response" || rowUi.lifecycleState === "cancelled" ? (
          <PhoneMissed className="h-3 w-3 text-amber-600" />
        ) : rowUi.lifecycleState === "failed" ? (
          <AlertCircle className="h-3 w-3 text-rose-600" />
        ) : (
          <Clock className="h-3 w-3 text-muted-foreground" />
        )}
        {rowUi.badgeLabel}
      </span>
    );
  };

  const renderCallButton = (lead: LeadItem) => {
    const rowUi = mapLeadRowToUiStatus(lead, verifyingCustomerIds);
    const disabled =
      !isVoiceOnline || rowUi.blocksNewCall || lead.isSuppressed || !lead.phone;

    const tooltip = lead.isSuppressed
      ? "Customer opted out of automated calls (DNC)"
      : !lead.phone
      ? "Customer has no valid phone number on file"
      : rowUi.isUnknownVerifying
      ? `${STATUS_UNKNOWN_TEXT} — new calls blocked until backend confirms terminal state`
      : rowUi.blocksNewCall
      ? rowUi.blockReason || "Call already active for this customer"
      : !isVoiceOnline
      ? "Voice System Offline — check Dograh gateway & Voice Agent health"
      : "Place single-customer AI collection call";

    if (rowUi.isUnknownVerifying) {
      return (
        <Button
          size="sm"
          disabled
          title={tooltip}
          className="h-8 text-xs font-medium gap-1.5 bg-amber-600/85 text-white disabled:opacity-80"
        >
          <span className="h-2 w-2 rounded-full bg-white animate-ping" />
          Verifying...
        </Button>
      );
    }

    if (rowUi.blocksNewCall && !lead.isSuppressed) {
      return (
        <Button
          size="sm"
          disabled
          title={tooltip}
          className="h-8 text-xs font-medium gap-1.5 bg-blue-600 text-white disabled:opacity-80"
        >
          <span className="h-2 w-2 rounded-full bg-white animate-ping" />
          {rowUi.badgeLabel}
        </Button>
      );
    }

    return (
      <span title={tooltip} className="inline-block">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => handleOpenCallModal(lead)}
          className="h-8 text-xs font-medium gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm disabled:opacity-50"
        >
          <PhoneCall className="h-3 w-3" /> Call
        </Button>
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-24">
      {/* 1. Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
            <PhoneCall className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Lead Calling
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Live overdue loan accounts with AI-assisted Tamil &amp; English voice collection.
            </p>
          </div>
        </div>

        {/* Top-Right Controls */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
          {/* Composite Voice AI Health Indicator */}
          <div
            title={
              voiceHealth
                ? `Gateway: ${voiceHealth.gateway?.status || "unknown"} | Voice Agent: ${voiceHealth.voiceAgent?.status || "unknown"}`
                : "Checking Voice AI health..."
            }
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border shadow-sm"
          >
            <div className="flex items-center gap-1.5">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Voice AI</span>
            </div>
            <div className="h-3.5 w-px bg-border mx-0.5" />
            {isActivelyInCall ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                {modalUi.badgeLabel}
              </span>
            ) : isCheckingHealth && !voiceHealth ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-pulse" />
                Checking...
              </span>
            ) : isVoiceOnline ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm" />
                Voice AI Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Voice System Offline
              </span>
            )}
          </div>

          {/* Auto-Call Queue Button (Visible & Disabled per Manual Calling Mode Decision #3) */}
          <span title="Manual calling mode — trigger calls per customer using the row Call button">
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-1.5 rounded-xl border-border opacity-65 cursor-not-allowed"
            >
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Auto-Call</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
                Manual calling mode
              </span>
            </Button>
          </span>

          {/* Refresh Queue Button (`POST /api/ai/leads/refresh`) */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshQueue}
            disabled={isRefreshingQueue || isLoadingLeads}
            className="gap-1.5 rounded-xl border-border hover:bg-secondary"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshingQueue || isLoadingLeads ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* AI Settings Link */}
          <Link to="/ai/settings">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl border-border hover:bg-secondary"
            >
              <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">AI Settings</span>
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Offline Banner when Voice AI System is unreachable */}
      {voiceHealth && !voiceHealth.online && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>Voice System Offline:</strong> Live customer data, Risk Scores, callback
              scheduling, and call recordings remain available, while outbound AI dialing is paused
              until both the Dograh gateway and AutoFinex Voice Agent report healthy.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchVoiceHealth(true)}
            className="h-7 text-xs shrink-0 border-amber-500/40 hover:bg-amber-500/20"
          >
            Re-check Health
          </Button>
        </div>
      )}

      {/* Live Multi-Customer Call Queue Status Banner */}
      {activeQueueBatch &&
        activeQueueBatch.totalItems > 0 &&
        activeQueueBatch.batchId !== dismissedBatchId && (
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/15 text-primary shrink-0">
                  <ListOrdered className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-foreground">
                      {isQueueRunning
                        ? `Sequential Call Queue Running (${activeQueueBatch.currentPosition} of ${activeQueueBatch.totalItems})`
                        : `Sequential Call Queue ${
                            activeQueueBatch.status === "cancelled" ? "Cancelled" : "Completed"
                          } (${activeQueueBatch.completedCount}/${activeQueueBatch.totalItems} completed)`}
                    </span>
                    {queueMockMode && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/40">
                        {TEST_MODE_BADGE_TEXT}
                      </span>
                    )}
                    {isQueueRunning && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
                        Active: {activeQueueBatch.activeCustomerName || "Processing..."}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pending: {activeQueueBatch.pendingCount} • Processing:{" "}
                    {activeQueueBatch.processingCount} • Completed:{" "}
                    {activeQueueBatch.completedCount}
                    {activeQueueBatch.cancelledCount > 0
                      ? ` • Skipped/Cancelled: ${activeQueueBatch.cancelledCount}`
                      : ""}
                    {activeQueueBatch.failedCount > 0
                      ? ` • Failed: ${activeQueueBatch.failedCount}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeQueueBatch.pendingCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isCancellingQueue}
                    onClick={() => void handleCancelQueueBatch()}
                    className="h-8 text-xs gap-1.5 border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    {isCancellingQueue ? "Cancelling..." : "Cancel Pending"}
                  </Button>
                )}
                {!isQueueRunning && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDismissedBatchId(activeQueueBatch.batchId)}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {activeQueueBatch.items.map((qItem) => {
                const pillStyle =
                  qItem.status === "processing"
                    ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
                    : qItem.status === "completed"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                    : qItem.status === "failed"
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                    : qItem.status === "cancelled"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    : "bg-secondary text-muted-foreground border-border";

                const inner = (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${pillStyle}`}
                  >
                    <span className="font-mono font-bold">#{qItem.queuePosition}</span>
                    <span>{qItem.customerName}</span>
                    {qItem.hplno ? (
                      <span className="opacity-75 font-mono">(HPL {qItem.hplno})</span>
                    ) : null}
                    <span className="opacity-85">
                      •{" "}
                      {qItem.status === "completed" && qItem.callOutcome
                        ? formatOutcomeLabel(qItem.callOutcome)
                        : qItem.status === "cancelled" && qItem.skipReason
                        ? formatOutcomeLabel(qItem.skipReason)
                        : qItem.status}
                    </span>
                    {qItem.callId && <ExternalLink className="h-3 w-3 opacity-75" />}
                  </span>
                );

                return qItem.callId ? (
                  <Link
                    key={qItem.id}
                    to={`/ai/calls/${qItem.callId}`}
                    title="Open Full Call Details"
                  >
                    {inner}
                  </Link>
                ) : (
                  <span key={qItem.id}>{inner}</span>
                );
              })}
            </div>
          </div>
        )}

      {/* 2. Authoritative KPI Summary Cards (Click to filter) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Unpaid Leads */}
        <motion.button
          type="button"
          onClick={() => {
            setStatusFilter("all");
            setPage(1);
          }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`dashboard-card p-4 text-left relative overflow-hidden transition-all ${
            statusFilter === "all" ? "ring-2 ring-primary/40" : "hover:border-primary/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Unpaid Leads
            </span>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{summary.unpaidLeads}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            <span className="text-primary font-semibold">
              {formatINR(summary.totalOverdueAmount)}
            </span>{" "}
            total overdue
          </p>
        </motion.button>

        {/* Ready to Call */}
        <motion.button
          type="button"
          onClick={() => {
            setStatusFilter("ready_to_call");
            setPage(1);
          }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`dashboard-card p-4 text-left relative overflow-hidden transition-all ${
            statusFilter === "ready_to_call"
              ? "ring-2 ring-emerald-500/50"
              : "hover:border-emerald-500/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Ready to Call
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
              <PhoneCall className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{summary.readyToCall}</p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="text-emerald-600 font-medium">Eligible</span> for manual AI call
          </p>
        </motion.button>

        {/* Called Today */}
        <motion.button
          type="button"
          onClick={() => {
            setStatusFilter("called_today");
            setPage(1);
          }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={`dashboard-card p-4 text-left relative overflow-hidden transition-all ${
            statusFilter === "called_today"
              ? "ring-2 ring-blue-500/50"
              : "hover:border-blue-500/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Called Today
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{summary.calledToday}</p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="text-blue-600 font-medium">Answered &amp; spoken</span> today (IST)
          </p>
        </motion.button>

        {/* No Response */}
        <motion.button
          type="button"
          onClick={() => {
            setStatusFilter("no_response");
            setPage(1);
          }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`dashboard-card p-4 text-left relative overflow-hidden transition-all ${
            statusFilter === "no_response"
              ? "ring-2 ring-amber-500/50"
              : "hover:border-amber-500/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              No Response
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
              <PhoneMissed className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{summary.noResponse}</p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="text-amber-600 font-medium">Unanswered</span> on last attempt
          </p>
        </motion.button>
      </div>

      {/* 3. Server-Side Filter and Search Controls */}
      <div className="dashboard-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, phone, HPL, plate, vehicle..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          {/* Call Status Filter */}
          <div>
            <AppSelect
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              triggerClassName="h-10"
              options={[
                { value: "all", label: "Status: All Active" },
                { value: "ready_to_call", label: "Ready to Call" },
                { value: "uncalled", label: "Never Called" },
                { value: "called_today", label: "Called Today" },
                { value: "no_response", label: "No Response" },
                { value: "completed", label: "Completed" },
                { value: "scheduled", label: "Scheduled" },
                { value: "failed", label: "Failed" },
                { value: "suppressed", label: "Opted Out (DNC)" },
              ]}
            />
          </div>

          {/* Authoritative Risk Level Filter */}
          <div>
            <AppSelect
              value={riskFilter}
              onValueChange={(val) => {
                setRiskFilter(val);
                setPage(1);
              }}
              triggerClassName="h-10"
              options={[
                { value: "all", label: "Risk: All Levels" },
                { value: "critical", label: "Critical Risk" },
                { value: "high", label: "High Risk" },
                { value: "warning", label: "Warning" },
                { value: "safe", label: "Safe" },
              ]}
            />
          </div>

          {/* Overdue Bucket Filter */}
          <div>
            <AppSelect
              value={overdueBucket}
              onValueChange={(val) => {
                setOverdueBucket(val);
                setPage(1);
              }}
              triggerClassName="h-10"
              options={[
                { value: "all", label: "Overdue: All Days" },
                { value: "1-30", label: "1–30 days" },
                { value: "31-60", label: "31–60 days" },
                { value: "61-90", label: "61–90 days" },
                { value: "90+", label: "90+ days" },
              ]}
            />
          </div>

          {/* Sort By Selector */}
          <div>
            <AppSelect
              value={sortOption}
              onValueChange={(val) => {
                setSortOption(val);
                setPage(1);
              }}
              triggerClassName="h-10"
              options={[
                { value: "daysOverdue:desc", label: "Most Days Overdue" },
                { value: "dueAmount:desc", label: "Highest Overdue Amount" },
                { value: "dueAmount:asc", label: "Lowest Overdue Amount" },
                { value: "riskScore:desc", label: "Highest Risk Score" },
                { value: "totalBalance:desc", label: "Highest Total Balance" },
                { value: "lastCallAt:desc", label: "Recently Called" },
              ]}
            />
          </div>
        </div>

        {/* Filter Summary & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs text-muted-foreground">
          <span>
            Showing{" "}
            <strong className="text-foreground">{leads.length}</strong> of{" "}
            <strong className="text-foreground">{pagination.totalItems}</strong> matching overdue
            customer(s)
            {lastRefreshedAt && (
              <span className="ml-2 text-muted-foreground/80">
                • Synced{" "}
                {new Date(lastRefreshedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setDebouncedSearch("");
                setStatusFilter("all");
                setRiskFilter("all");
                setOverdueBucket("all");
                setSortOption("daysOverdue:desc");
                setPage(1);
              }}
              className="text-primary hover:underline font-medium flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Error State if Backend Fetch Failed */}
      {leadsError && (
        <div className="dashboard-card p-4 border-rose-500/30 bg-rose-500/5 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{leadsError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchLeads()} className="h-7 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* 4. Desktop & Tablet Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="dashboard-card p-0 overflow-hidden hidden md:block"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Customer / HPL
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Vehicle
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Overdue / Balance
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Overdue Age
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Risk Score
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Phone
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Last Call &amp; Outcome
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Call Status
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoadingLeads && leads.length === 0 ? (
                <TableSkeletonRows columns={10} rows={6} />
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-muted-foreground">
                    <div className="max-w-sm mx-auto flex flex-col items-center">
                      <div className="p-3 rounded-full bg-secondary mb-3">
                        <Search className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-base font-semibold text-foreground">
                        No matching overdue leads
                      </p>
                      <p className="text-xs mt-1">
                        Adjust your search or filters, or click Refresh to sync the overdue queue.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                leads.map((lead, i) => {
                  const isSelected = selectedLeadIds.includes(lead.id);
                  const hasRec = Boolean(lead.lastCallDetails?.hasRecording);
                  return (
                    <motion.tr
                      key={lead.customerId || lead.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(0.25, 0.012 * i) }}
                      className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${
                        isSelected ? "bg-primary/5 hover:bg-primary/10" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </td>

                      {/* Customer + KYC Avatar + HPL */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <CustomerAvatar lead={lead} />
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setDetailLead(lead);
                                setRecordingCallId(null);
                                setRecordingUrl(null);
                              }}
                              className="text-sm font-semibold text-foreground hover:text-primary leading-tight text-left transition-colors"
                            >
                              {lead.customerName}
                            </button>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs font-mono text-muted-foreground">
                                {lead.loanId}
                              </span>
                              {lead.unpaidMonths > 0 && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                                  {lead.unpaidMonths} EMI due
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Vehicle */}
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-foreground truncate max-w-[170px]">
                          {lead.vehicleModel}
                        </p>
                        <span className="text-xs text-muted-foreground font-mono">
                          {lead.vehiclePlate}
                        </span>
                      </td>

                      {/* Overdue / Total Balance */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-bold text-sm text-foreground block">
                          {formatINR(lead.dueAmount)}
                        </span>
                        <span className="text-[11px] text-muted-foreground block">
                          Bal: {formatINR(lead.totalBalanceAmount)}
                        </span>
                      </td>

                      {/* Overdue Age & Earliest Unpaid Date */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            lead.daysOverdue > 60
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                              : lead.daysOverdue > 30
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                          }`}
                        >
                          {lead.daysOverdue} {lead.daysOverdue === 1 ? "day" : "days"}
                        </span>
                        <span className="block text-[11px] text-muted-foreground mt-0.5">
                          Due: {lead.dueDate}
                        </span>
                      </td>

                      {/* Authoritative Risk Score Badge (1:1 parity with Alerts.tsx) */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold capitalize ${getRiskBadgeStyle(
                            lead.riskLevel
                          )}`}
                        >
                          {lead.riskLevel} · {lead.riskScore}
                        </span>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3.5">
                        {lead.phone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-foreground">
                              +91 {lead.phone}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyPhoneNumber(lead.phone)}
                              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
                              title="Copy phone number"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No phone</span>
                        )}
                      </td>

                      {/* Last Call & Outcome */}
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground">
                            {lead.lastCall}
                          </span>
                          {lead.lastCallDuration && (
                            <span className="text-[11px] font-mono text-muted-foreground">
                              ({lead.lastCallDuration})
                            </span>
                          )}
                        </div>
                        {lead.callOutcomeNote ? (
                          <p
                            className="text-[11px] text-muted-foreground truncate mt-0.5"
                            title={lead.callOutcomeNote}
                          >
                            {lead.callOutcomeNote}
                          </p>
                        ) : lead.scheduledTime ? (
                          <p className="text-[11px] text-purple-600 dark:text-purple-400 truncate mt-0.5">
                            Callback: {lead.scheduledTime}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            {formatOutcomeLabel(lead.lastCallOutcome)}
                          </p>
                        )}
                      </td>

                      {/* Call Session Status Badge */}
                      <td className="px-4 py-3.5">{renderSessionBadge(lead)}</td>

                      {/* Action Buttons */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {hasRec && lead.lastCallDetails?.callId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              title="Play last call recording"
                              onClick={() => {
                                setDetailLead(lead);
                                void handlePlayRecording(lead.lastCallDetails!.callId);
                              }}
                              className="h-8 w-8 p-0 border-border hover:bg-secondary"
                            >
                              <Play className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="View customer & call details"
                            onClick={() => {
                              setDetailLead(lead);
                              setRecordingCallId(null);
                              setRecordingUrl(null);
                            }}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                          {renderCallButton(lead)}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalItems > 0 && (
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pageSize}
            totalItems={pagination.totalItems}
            startIndex={(pagination.page - 1) * pageSize + 1}
            endIndex={Math.min(pagination.page * pageSize, pagination.totalItems)}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            pageSizeOptions={[15, 25, 50]}
            disabled={isLoadingLeads}
          />
        )}
      </motion.div>

      {/* 5. Mobile Cards View */}
      <div className="md:hidden space-y-3">
        {isLoadingLeads && leads.length === 0 ? (
          <CardGridSkeleton count={3} />
        ) : leads.length === 0 ? (
          <div className="dashboard-card text-center py-8 text-muted-foreground">
            <p className="text-sm font-medium text-foreground">No matching overdue leads</p>
          </div>
        ) : (
          leads.map((lead) => {
            const isSelected = selectedLeadIds.includes(lead.id);
            return (
              <div
                key={lead.customerId || lead.id}
                className={`dashboard-card p-4 space-y-3 transition-all ${
                  isSelected ? "ring-2 ring-primary/50 bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectLead(lead.id)}
                      className="h-4 w-4 rounded border-border accent-primary mt-0.5"
                    />
                    <CustomerAvatar lead={lead} />
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailLead(lead);
                          setRecordingCallId(null);
                          setRecordingUrl(null);
                        }}
                        className="font-semibold text-sm text-foreground hover:text-primary text-left"
                      >
                        {lead.customerName}
                      </button>
                      <span className="block text-xs font-mono text-muted-foreground">
                        {lead.loanId} • +91 {lead.phone || "N/A"}
                      </span>
                    </div>
                  </div>
                  {renderSessionBadge(lead)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-secondary/40 p-2.5 rounded-lg">
                  <div>
                    <span className="text-muted-foreground block">Overdue EMI:</span>
                    <span className="font-bold text-foreground">{formatINR(lead.dueAmount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Total Balance:</span>
                    <span className="font-semibold text-foreground">
                      {formatINR(lead.totalBalanceAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Days Overdue:</span>
                    <span className="font-semibold text-rose-600">{lead.daysOverdue} days</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Risk Score:</span>
                    <span className="font-semibold capitalize text-foreground">
                      {lead.riskLevel} ({lead.riskScore}/100)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    Last call: {lead.lastCall}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {lead.lastCallDetails?.hasRecording && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDetailLead(lead);
                          void handlePlayRecording(lead.lastCallDetails!.callId);
                        }}
                        className="h-8 px-2 text-xs"
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    )}
                    {renderCallButton(lead)}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {pagination.totalItems > 0 && (
          <div className="flex items-center justify-between pt-2 text-xs">
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrevPage || isLoadingLeads}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2.5 text-xs gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="text-muted-foreground">
              Page <strong className="text-foreground">{pagination.page}</strong> of{" "}
              <strong className="text-foreground">{pagination.totalPages}</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage || isLoadingLeads}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 px-2.5 text-xs gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* 6. Sticky Bulk Action Bar */}
      <AnimatePresence>
        {selectedLeadIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-foreground text-background dark:bg-card dark:text-card-foreground shadow-2xl rounded-2xl px-5 py-3.5 border border-border flex items-center gap-4 flex-wrap max-w-[95vw] sm:max-w-2xl"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 rounded-full bg-primary text-primary-foreground font-bold text-xs items-center justify-center">
                {selectedLeadIds.length}
              </span>
              <span className="text-sm font-semibold whitespace-nowrap">
                {selectedLeadIds.length} Lead{selectedLeadIds.length > 1 ? "s" : ""} Selected
              </span>
            </div>

            <div className="h-4 w-px bg-muted-foreground/30 hidden sm:block" />

            <div className="flex items-center gap-2 ml-auto">
              <span
                title={
                  !isVoiceOnline
                    ? "Voice System Offline — check Dograh gateway & Voice Agent health"
                    : "Queue selected customers for sequential server-verified AI calling"
                }
              >
                <Button
                  size="sm"
                  disabled={!isVoiceOnline}
                  onClick={() => {
                    const selected = leads.filter((l) => selectedLeadIds.includes(l.id));
                    handleOpenQueueModal(selected);
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs gap-1.5 disabled:opacity-50"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  Call Selected ({selectedLeadIds.length})
                </Button>
              </span>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const selected = leads.filter((l) => selectedLeadIds.includes(l.id));
                  handleOpenScheduleModal(selected);
                }}
                className="text-foreground bg-background border-border/50 hover:bg-secondary text-xs gap-1.5 font-medium"
              >
                <Calendar className="h-3.5 w-3.5" />
                Schedule Callback
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                className="text-muted-foreground hover:text-foreground text-xs p-1 sm:px-2"
                title="Clear Selection"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Clear</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* 7. Single-Customer Manual AI Call Modal              */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {callModalOpen && activeLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[1px] bg-black/30">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="dashboard-card w-full max-w-lg p-0 overflow-hidden shadow-2xl border-border bg-card"
            >
              {/* Modal Header — Truthful per 10-state model + 'unknown' */}
              <div className="p-5 border-b border-border bg-secondary/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">
                      {callInitError && !activeCallId && !modalUi.isUnknownVerifying
                        ? callInitError.title
                        : modalUi.modalTitle}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      AutoFinex Voice AI • Server-Verified Context
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeSingleCallModal}
                  disabled={isStartingCall}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
                {/* Visible Mock Telephony Badge when server reports `telephonyMode === "mock"` */}
                {showModalMockBadge && (
                  <div
                    role="status"
                    className="px-3.5 py-2.5 rounded-lg border border-amber-500/45 bg-amber-500/15 text-amber-950 dark:text-amber-200 text-xs font-bold flex items-center gap-2"
                  >
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{TEST_MODE_BADGE_TEXT}</span>
                  </div>
                )}

                {/* Customer Snapshot Card */}
                <div className="p-4 rounded-xl bg-secondary/50 border border-border flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CustomerAvatar lead={activeLead} sizeClass="h-10 w-10 text-sm" />
                    <div>
                      <h4 className="font-bold text-foreground text-base leading-tight">
                        {activeLead.customerName}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        +91 {activeLead.phone} • {activeLead.loanId}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {activeLead.vehicleModel} ({activeLead.vehiclePlate})
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs text-muted-foreground block">Overdue EMI</span>
                    <span className="text-base font-bold text-foreground">
                      {formatINR(activeLead.dueAmount)}
                    </span>
                    <span className="block text-[11px] text-rose-600 font-medium">
                      {activeLead.daysOverdue} days overdue
                    </span>
                  </div>
                </div>

                {/* --- AMBIGUOUS `'unknown'` (`needs_reconcile` / `504`) STATE --- */}
                {modalUi.isUnknownVerifying && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-950 dark:text-amber-200 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-600 animate-ping shrink-0" />
                        <span>{STATUS_UNKNOWN_TEXT}</span>
                      </div>
                      <p className="leading-relaxed">
                        {callInitError?.message || modalUi.description}
                      </p>
                    </div>

                    {pollCapReached && (
                      <div className="p-3 rounded-lg border border-border bg-secondary/40 text-xs text-muted-foreground">
                        Live status polling reached its 12-minute cap. This customer remains locked
                        from new calls until the backend reconciler records a terminal outcome.
                      </div>
                    )}

                    {/* Strictly NO Retry button and NO Call Now button while `'unknown'` */}
                    <div className="flex items-center justify-end pt-2">
                      <Button
                        variant="outline"
                        onClick={closeSingleCallModal}
                        className="border-border text-foreground text-xs"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}

                {/* --- DEFINITE PRE-CALL / REQUEST ERROR ALERT (non-ambiguous) --- */}
                {callInitError && !modalUi.isUnknownVerifying && !activeCallId && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{callInitError.title}</p>
                        <p className="mt-0.5 leading-relaxed">{callInitError.message}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-1">
                      <Button
                        variant="outline"
                        onClick={closeSingleCallModal}
                        disabled={isStartingCall}
                        className="border-border text-foreground text-xs"
                      >
                        Close
                      </Button>
                      {/* Retry is offered ONLY for definite pre-dial failures */}
                      {callInitError.canRetry && (
                        <Button
                          onClick={() => void handleConfirmManualCall()}
                          disabled={
                            isStartingCall ||
                            !isVoiceOnline ||
                            Boolean(activeLeadRowStatus?.blocksNewCall)
                          }
                          className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium gap-1.5 shadow-md"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${isStartingCall ? "animate-spin" : ""}`}
                          />
                          {isStartingCall ? "Submitting..." : "Retry Call"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* --- PHASE 1: PRE-CALL CONFIRMATION (`idle` / `submitting` before HTTP response) --- */}
                {!activeCallId && !callInitError && !modalUi.isUnknownVerifying && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-lg border border-blue-500/20 bg-blue-500/5 text-xs space-y-1.5">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Server-Resolved Collection Context
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        Clicking <strong>Call Now</strong> sends only{" "}
                        <code className="px-1 py-0.5 rounded bg-secondary font-mono">
                          customerId
                        </code>{" "}
                        and a dialog-scoped{" "}
                        <code className="px-1 py-0.5 rounded bg-secondary font-mono">
                          Idempotency-Key
                        </code>{" "}
                        to Rimi Backend. Live EMI balance ({formatINR(activeLead.dueAmount)}),
                        calling-window eligibility, customer memory, and Sarvam{" "}
                        <code className="px-1 py-0.5 rounded bg-secondary font-mono">
                          bulbul:v4
                        </code>{" "}
                        voice settings are verified server-side.
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Button
                        variant="outline"
                        onClick={closeSingleCallModal}
                        disabled={isStartingCall}
                        className="border-border text-foreground"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void handleConfirmManualCall()}
                        disabled={
                          isStartingCall ||
                          !isVoiceOnline ||
                          Boolean(activeLeadRowStatus?.blocksNewCall)
                        }
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2 shadow-md"
                      >
                        {isStartingCall ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <PhoneCall className="h-4 w-4" />
                            Call Now
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* --- PHASE 2: ACTIVE NON-TERMINAL CALL (`queued` / `initiating` / `ringing` / `in_progress`) --- */}
                {activeCallId &&
                  !modalUi.isTerminal &&
                  !modalUi.isUnknownVerifying && (
                    <div className="space-y-4">
                      <div
                        className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${getBadgeToneClasses(
                          modalUi.tone
                        )}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-3 w-3 rounded-full animate-ping shrink-0 ${
                              modalUi.isSpeaking ? "bg-emerald-500" : "bg-blue-500"
                            }`}
                          />
                          <div>
                            <p className="text-xs font-bold">
                              Status: {modalUi.statusLabel}
                            </p>
                            <p className="text-[11px] opacity-85 mt-0.5">
                              {modalUi.description}
                            </p>
                            {liveCall && (
                              <p className="text-xs font-mono opacity-80 mt-1">
                                Duration: {liveCall.durationLabel}
                              </p>
                            )}
                          </div>
                        </div>
                        <VoiceWaveform isSpeaking={modalUi.isSpeaking} />
                      </div>

                      {pollError && (
                        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200">
                          {pollError}
                        </div>
                      )}

                      {pollCapReached && (
                        <div className="p-3 rounded-lg border border-border bg-secondary/40 text-xs text-muted-foreground">
                          Live call polling stopped after reaching the 12-minute maximum window.
                          Close this dialog or refresh leads to inspect updated status.
                        </div>
                      )}

                      {liveCall && liveCall.transcript.length > 0 && (
                        <div className="p-3 rounded-xl bg-secondary/40 border border-border max-h-48 overflow-y-auto space-y-2.5 text-xs">
                          {liveCall.transcript.map((turn, idx) => (
                            <div
                              key={idx}
                              className={`flex flex-col ${
                                turn.speaker === "ai" ? "items-start" : "items-end"
                              }`}
                            >
                              <span className="font-semibold text-foreground text-[11px] mb-0.5">
                                {turn.speaker === "ai" ? "AI Agent" : activeLead.customerName}
                              </span>
                              <div
                                className={`p-2.5 rounded-xl max-w-[88%] leading-relaxed ${
                                  turn.speaker === "ai"
                                    ? "bg-primary/10 text-foreground border border-primary/20 rounded-tl-none"
                                    : "bg-card text-foreground border border-border rounded-tr-none shadow-sm"
                                }`}
                              >
                                {turn.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                {/* --- PHASE 3: TERMINAL CALL SUMMARY (`completed` / `no_response` / `failed` / `cancelled`) --- */}
                {activeCallId && liveCall && modalUi.isTerminal && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-secondary/30">
                      {modalUi.state === "completed" ? (
                        <div className="h-10 w-10 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                      ) : modalUi.state === "failed" ? (
                        <div className="h-10 w-10 rounded-full bg-rose-500/15 text-rose-600 flex items-center justify-center shrink-0">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                          <PhoneMissed className="h-5 w-5" />
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-foreground">
                          {modalUi.statusLabel}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Duration: {liveCall.durationLabel} • Outcome:{" "}
                          {formatOutcomeLabel(
                            liveCall.callOutcome || liveCall.outcome || liveCall.disposition
                          )}
                        </p>
                      </div>
                    </div>

                    {liveCall.errorDetail && modalUi.state === "failed" && (
                      <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300">
                        {liveCall.errorDetail}
                      </div>
                    )}

                    {liveCall.summaryText && (
                      <div className="p-3 rounded-lg bg-secondary/40 border border-border text-xs space-y-1">
                        <span className="font-semibold text-foreground block">Call Summary</span>
                        <p className="text-muted-foreground leading-relaxed">
                          {liveCall.summaryText}
                        </p>
                      </div>
                    )}

                    {(liveCall.promisedDate || liveCall.promisedAmount != null) && (
                      <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs flex items-center justify-between">
                        <span className="text-muted-foreground">Promise to Pay Recorded:</span>
                        <strong className="text-emerald-700 dark:text-emerald-300">
                          {liveCall.promisedAmount != null
                            ? formatINR(liveCall.promisedAmount)
                            : ""}{" "}
                          {liveCall.promisedDate ? `on ${liveCall.promisedDate}` : ""}
                        </strong>
                      </div>
                    )}

                    {/* Transcript */}
                    {liveCall.transcript.length > 0 && (
                      <div className="p-3 rounded-xl bg-secondary/40 border border-border max-h-48 overflow-y-auto space-y-2 text-xs">
                        {liveCall.transcript.map((turn, idx) => (
                          <div
                            key={idx}
                            className={`flex flex-col ${
                              turn.speaker === "ai" ? "items-start" : "items-end"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-semibold text-foreground text-[11px]">
                                {turn.speaker === "ai" ? "AI Agent" : activeLead.customerName}
                              </span>
                              {turn.time && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {turn.time}
                                </span>
                              )}
                            </div>
                            <div
                              className={`p-2 rounded-xl max-w-[88%] ${
                                turn.speaker === "ai"
                                  ? "bg-primary/10 text-foreground border border-primary/20"
                                  : "bg-card text-foreground border border-border"
                              }`}
                            >
                              {turn.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* S3 Recording Playback */}
                    {liveCall.hasRecording && (
                      <div className="p-3 rounded-xl border border-border bg-secondary/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Volume2 className="h-3.5 w-3.5 text-primary" />
                            Call Audio Recording
                          </span>
                          {recordingCallId !== liveCall.callId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isLoadingRecording}
                              onClick={() => void handlePlayRecording(liveCall.callId)}
                              className="h-7 text-xs gap-1.5"
                            >
                              <Play className="h-3 w-3" />
                              {isLoadingRecording ? "Loading..." : "Play Recording"}
                            </Button>
                          )}
                        </div>
                        {recordingCallId === liveCall.callId && recordingUrl && (
                          <audio controls autoPlay src={recordingUrl} className="w-full h-9" />
                        )}
                      </div>
                    )}

                    {/* Token & Model Telemetry Footer + Pre-Dial Retry Gate */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-[11px] text-muted-foreground font-mono">
                      <span>TTS: {liveCall.telemetry.ttsModel || "bulbul:v4"}</span>
                      <span>Tokens: {liveCall.telemetry.totalTokens}</span>
                      <div className="flex items-center gap-2 font-sans">
                        {modalUi.canRetry && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isStartingCall || !isVoiceOnline}
                            onClick={() => void handleConfirmManualCall()}
                            className="text-xs gap-1.5"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${isStartingCall ? "animate-spin" : ""}`}
                            />
                            Retry Call
                          </Button>
                        )}
                        <Link to={`/ai/calls/${liveCall.callId}`}>
                          <Button variant="outline" size="sm" className="text-xs gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Full Call Details
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          onClick={closeSingleCallModal}
                          className="bg-primary text-primary-foreground text-xs"
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* 8. Customer & Last Call Detail Modal + Audio Player   */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {detailLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[1px] bg-black/30">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="dashboard-card w-full max-w-lg p-0 overflow-hidden shadow-2xl border-border bg-card"
            >
              <div className="p-5 border-b border-border bg-secondary/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CustomerAvatar lead={detailLead} sizeClass="h-10 w-10 text-sm" />
                  <div>
                    <h3 className="font-bold text-foreground text-base">
                      {detailLead.customerName}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      {detailLead.loanId} • +91 {detailLead.phone || "N/A"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDetailLead(null);
                    setRecordingCallId(null);
                    setRecordingUrl(null);
                  }}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <span className="text-muted-foreground block">Overdue EMI</span>
                    <strong className="text-sm text-foreground">
                      {formatINR(detailLead.dueAmount)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <span className="text-muted-foreground block">Pending Penalty</span>
                    <strong className="text-sm text-foreground">
                      {formatINR(detailLead.pendingPenaltyAmount)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <span className="text-muted-foreground block">Total Balance</span>
                    <strong className="text-sm text-foreground">
                      {formatINR(detailLead.totalBalanceAmount)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <span className="text-muted-foreground block">Days Overdue</span>
                    <strong className="text-sm text-rose-600">
                      {detailLead.daysOverdue} days
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <span className="text-muted-foreground block">Due Risk Score</span>
                    <strong className="text-sm capitalize text-foreground">
                      {detailLead.riskLevel} ({detailLead.riskScore}/100)
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <span className="text-muted-foreground block">Credit Score</span>
                    <strong className="text-sm capitalize text-foreground">
                      {detailLead.creditScore} ({detailLead.creditBand})
                    </strong>
                  </div>
                </div>

                {/* Last Call Details */}
                <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Last AI Call Activity</span>
                    {renderSessionBadge(detailLead)}
                  </div>
                  {detailLead.lastCallDetails ? (
                    <>
                      <p className="text-muted-foreground">
                        Last attempt: <strong>{detailLead.lastCall}</strong> • Duration:{" "}
                        <strong>{detailLead.lastCallDuration || "0:00"}</strong> • Outcome:{" "}
                        <strong>{formatOutcomeLabel(detailLead.lastCallDetails.outcome)}</strong>
                      </p>
                      {detailLead.lastCallDetails.summaryText && (
                        <p className="text-foreground bg-card p-2.5 rounded-lg border border-border">
                          {detailLead.lastCallDetails.summaryText}
                        </p>
                      )}
                      {detailLead.lastCallDetails.hasRecording && (
                        <div className="pt-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground flex items-center gap-1.5">
                              <Volume2 className="h-3.5 w-3.5 text-primary" />
                              Recorded Call Audio
                            </span>
                            {recordingCallId !== detailLead.lastCallDetails.callId && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isLoadingRecording}
                                onClick={() =>
                                  void handlePlayRecording(detailLead.lastCallDetails!.callId)
                                }
                                className="h-7 text-xs gap-1"
                              >
                                <Play className="h-3 w-3" />
                                {isLoadingRecording ? "Signing URL..." : "Play Recording"}
                              </Button>
                            )}
                          </div>
                          {recordingCallId === detailLead.lastCallDetails.callId &&
                            recordingUrl && (
                              <audio controls autoPlay src={recordingUrl} className="w-full h-9" />
                            )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      This overdue customer has never been called by the Voice AI Agent yet.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                  {detailLead.lastCallDetails?.callId && (
                    <Link to={`/ai/calls/${detailLead.lastCallDetails.callId}`}>
                      <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Full Call Details
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const target = detailLead;
                      setDetailLead(null);
                      handleOpenScheduleModal([target]);
                    }}
                    className="text-xs gap-1.5"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Schedule Callback
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      !isVoiceOnline ||
                      detailLead.isSuppressed ||
                      !detailLead.phone ||
                      mapLeadRowToUiStatus(detailLead, verifyingCustomerIds).blocksNewCall
                    }
                    onClick={() => {
                      const target = detailLead;
                      setDetailLead(null);
                      handleOpenCallModal(target);
                    }}
                    className="bg-primary text-primary-foreground text-xs gap-1.5"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    Call Customer
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* 9. Schedule Call Modal (`POST /api/ai/leads/schedule`) */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {scheduleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[1px] bg-black/25">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="dashboard-card w-full max-w-md p-0 overflow-hidden shadow-2xl border-border bg-card"
            >
              {/* Header */}
              <div className="p-5 border-b border-border bg-secondary/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">Schedule Callback</h3>
                    <p className="text-xs text-muted-foreground">
                      Saving callback appointment for {schedulingLeads.length} customer(s)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                    Quick Time Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "Today, 06:00 PM",
                      "Tomorrow 10:00 AM",
                      "Tomorrow 02:30 PM",
                      "In 2 Days, 11:00 AM",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setSelectedSchedulePreset(preset);
                          setCustomScheduleDate("");
                        }}
                        className={`p-2.5 rounded-lg border text-xs font-medium text-left transition-all ${
                          selectedSchedulePreset === preset && !customScheduleDate
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border hover:bg-secondary/60 text-foreground"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Or Custom Date &amp; Time
                  </label>
                  <Input
                    type="datetime-local"
                    value={customScheduleDate}
                    onChange={(e) => setCustomScheduleDate(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Internal Note / Context (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Customer requested evening callback after shift"
                    value={scheduleNote}
                    onChange={(e) => setScheduleNote(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    disabled={isSavingSchedule}
                    onClick={() => setScheduleModalOpen(false)}
                    className="text-xs border-border text-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={isSavingSchedule}
                    onClick={() => void confirmScheduleCall()}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium gap-1.5"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {isSavingSchedule ? "Saving..." : "Confirm Schedule"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* 10. Confirm Multi-Customer Sequential Queue Call Modal */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {queueModalOpen && queueCandidates.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[1px] bg-black/30">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="dashboard-card w-full max-w-lg p-0 overflow-hidden shadow-2xl border-border bg-card"
            >
              <div className="p-5 border-b border-border bg-secondary/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <ListOrdered className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">
                      Confirm Multi-Customer Queue Call ({queueCandidates.length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Sequential Manual Queue • 1 Call at a Time • Server-Verified Ledger
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeQueueModal}
                  disabled={isQueueSubmitting}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="p-3.5 rounded-lg border border-blue-500/20 bg-blue-500/5 text-xs text-muted-foreground leading-relaxed">
                  Selected customers are placed in a persistent PostgreSQL queue and dialed{" "}
                  <strong className="text-foreground">one by one</strong>. Before each call, Rimi
                  Backend re-verifies live EMI overdue balance, DNC status, IST calling window, and
                  daily attempt limits. Only{" "}
                  <code className="px-1 py-0.5 rounded bg-secondary font-mono">customerIds</code>{" "}
                  and{" "}
                  <code className="px-1 py-0.5 rounded bg-secondary font-mono">
                    Idempotency-Key
                  </code>{" "}
                  are transmitted.
                </div>

                {queueInitError && (
                  <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">{queueInitError.title}</p>
                      <p className="mt-0.5 leading-relaxed">{queueInitError.message}</p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border divide-y divide-border max-h-60 overflow-y-auto">
                  {queueCandidates.map((cand, idx) => (
                    <div
                      key={cand.customerId}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs bg-card"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-6 w-6 rounded-full bg-secondary text-foreground font-mono font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {cand.customerName}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {cand.loanId} • +91 {cand.phone}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-foreground">{formatINR(cand.dueAmount)}</p>
                        <p className="text-[11px] text-rose-600 font-medium">
                          {cand.daysOverdue}d overdue
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    disabled={isQueueSubmitting}
                    onClick={closeQueueModal}
                    className="text-xs border-border text-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={isQueueSubmitting || !isVoiceOnline}
                    onClick={() => void handleConfirmQueueBatch()}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium gap-1.5 shadow-md"
                  >
                    {isQueueSubmitting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <PhoneCall className="h-3.5 w-3.5" />
                        Start Sequential Queue ({queueCandidates.length})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

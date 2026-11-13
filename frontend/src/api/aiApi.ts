import apiClient from "./apiClient";
import type {
  CallLifecycleState,
  VoiceTelephonyMode,
} from "../components/ai/callLifecycleModel";

export type { CallLifecycleState, VoiceTelephonyMode };

export interface AIDashboardResponse {
  success: boolean;
  kpis: {
    totalCalls: number;
    activeConversations: number;
    positivePct: number;
    negativePct: number;
    remindersSent: number;
    followUpPending: number;
  };
  sentimentData?: {
    date: string;
    dayIso?: string;
    positive: number;
    neutral: number;
    negative: number;
  }[];
  volumeData?: {
    date: string;
    dayIso?: string;
    calls: number;
  }[];
  recentInteractions: {
    id: number;
    callId?: string;
    customer: string;
    hpl: string;
    sentiment: string;
    callStatus?: string;
    callOutcome?: string;
    time: string;
  }[];
}

export interface AISettingsPayload {
  companyRules: {
    leaveDate: string;
    leaveReason: string;
    notificationsEnabled: boolean;
  };
  aiInstructions: string;
  behavior: {
    autoReply: boolean;
    paymentReminder: boolean;
    followUpReminder: boolean;
    escalationAlerts: boolean;
  };
  escalation: {
    negativeAction: string;
    noResponseHours: string;
    autoFollowUp: boolean;
  };
  voiceConfig?: Record<string, unknown>;
}

export type RiskLevel = "safe" | "warning" | "high" | "critical";

export type LeadCallStatus =
  | "uncalled"
  | "calling"
  | "connecting"
  | "speaking"
  | "not_responded"
  | "completed"
  | "failed"
  | "scheduled"
  | "suppressed";

export type LeadCallSessionStatus =
  | "uncalled"
  | "calling"
  | "scheduled"
  | "completed"
  | "failed"
  | "suppressed";

export interface VoiceHealthProbeInfo {
  ok: boolean;
  status: string;
  latencyMs: number;
  dbReadOnlyOk?: boolean | null;
  redisOk?: boolean | null;
}

export interface VoiceHealthResponse {
  success: boolean;
  status: "ready" | "offline";
  online: boolean;
  label: string;
  checkedAt: string;
  cached?: boolean;
  gateway?: VoiceHealthProbeInfo;
  voiceAgent?: VoiceHealthProbeInfo;
}

export interface LeadLastCallDetails {
  callId: string;
  status: string;
  displayState?: CallLifecycleState;
  needsReconcile?: boolean;
  outcome: string;
  disposition: string | null;
  answered: boolean;
  customerSpoke: boolean;
  durationSec: number;
  summaryText: string | null;
  promisedDate: string | null;
  promisedAmount: number | null;
  sentiment: string;
  hasRecording: boolean;
  recordingStatus: string;
}

export interface LeadItem {
  id: string;
  leadId: string;
  customerId: string;
  loanUuid: string | null;
  customerName: string;
  avatarColor: string;
  photoUrl: string | null;
  loanId: string;
  hplno: number | string | null;
  loanType: string;
  phone: string;
  phoneE164: string;
  phones?: { number: string; type?: string }[];
  vehicleModel: string;
  vehicleBrand?: string;
  vehicleModelName?: string;
  vehiclePlate: string;
  dueAmount: number;
  overdueAmount: number;
  pendingPenaltyAmount: number;
  totalOverdueWithPenalty: number;
  totalBalanceAmount: number;
  emiAmount: number;
  unpaidMonths: number;
  paidMonths: number;
  dueDate: string;
  earliestUnpaidDueDate: string | null;
  daysOverdue: number;
  riskLevel: RiskLevel;
  riskScore: number;
  creditScore: number;
  creditBand: string;
  lastCall: string;
  lastCallAt: string | null;
  callStatus: LeadCallStatus;
  callSessionStatus: LeadCallSessionStatus;
  lastCallOutcome: string;
  callHistoryLabel: string;
  attemptCount: number;
  attemptsToday: number;
  calledToday: boolean;
  noResponse: boolean;
  readyToCall: boolean;
  isSuppressed: boolean;
  lastCallDuration?: string;
  lastCallDurationSec?: number;
  notes?: string;
  callOutcomeNote?: string;
  scheduledTime?: string;
  scheduledAtIso?: string | null;
  lastCallDetails?: LeadLastCallDetails | null;
}

export type Lead = LeadItem;

export interface LeadsSummary {
  unpaidLeads: number;
  readyToCall: number;
  calledToday: number;
  noResponse: number;
  scheduledCount: number;
  suppressedCount: number;
  totalOverdueAmount: number;
  totalBalanceAmount: number;
}

export interface LeadsPagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface LeadsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  riskLevel?: string;
  overdueBucket?: string;
  minDue?: number | string;
  maxDue?: number | string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export interface LeadsListResponse {
  success: boolean;
  leads: LeadItem[];
  summary: LeadsSummary;
  pagination: LeadsPagination;
  meta: {
    lastRefreshedAt: string | null;
    asOfDate: string;
  };
}

export interface LeadRefreshResponse {
  success: boolean;
  refreshed: boolean;
  cooldownActive: boolean;
  cooldownSeconds: number;
  cooldownRemainingSeconds: number;
  lastRefreshedAt: string | null;
  refreshedCount: number;
}

export interface ManualCallInitResponse {
  success: boolean;
  callId: string;
  leadId: string;
  customerId: string;
  loanId: string | null;
  providerCallId: string;
  callLifecycleStatus: CallLifecycleState | string;
  callDisplayState?: CallLifecycleState;
  needsReconcile?: boolean;
  telephonyMode?: VoiceTelephonyMode;
  mockTelephony: boolean;
  idempotencyReplay?: boolean;
}

export interface LiveCallTranscriptTurn {
  speaker: "ai" | "customer";
  text: string;
  time: string;
}

export interface LiveCallTelemetry {
  memoryTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ttsCharacters: number;
  sttSeconds: number;
  llmModel: string | null;
  ttsModel: string | null;
  sttModel: string | null;
}

export interface CallDetailCustomerInfo {
  customerId: string;
  customerName: string;
  hplno: number | string | null;
  loanRef: string;
  maskedPhone: string;
  loanStatus: string;
  vehicleModel: string;
  vehiclePlate: string;
  riskScore: number;
  riskLevel: RiskLevel | string;
  creditScore: number;
  creditBand: string;
}

export interface CallDetailLoanLedger {
  loanId: string | null;
  loanRef: string;
  installmentAmount: number;
  totalInstallments: number;
  totalContractualDue: number;
  validEmiPaid: number;
  overdueAmount: number;
  pendingPenaltyAmount: number;
  totalOverdueWithPenalty: number;
  totalBalanceAmount: number;
  pendingEmiCount: number;
  daysOverdue: number;
  earliestUnpaidDueDate: string | null;
  nextEmiDueDate: string | null;
  dueAmountAtCall: number | null;
}

export interface CallDetailSummaryInfo {
  summaryShort: string | null;
  customerStatedReason: string | null;
  commitmentSummary: string | null;
  observableTone: string | null;
  aggressionLevel: string;
  requestedHuman: boolean;
}

export interface CallDetailPtpCommitment {
  ptpId: string;
  callLogId: string | null;
  isCurrentCall: boolean;
  promisedAmount: number | null;
  promisedDate: string | null;
  promisedTimeText: string | null;
  status: string;
  reason: string | null;
  note: string | null;
  isSuperseded: boolean;
  createdAt: string | null;
}

export interface CallDetailCallbackItem {
  callbackId: string;
  callId: string | null;
  isCurrentCall: boolean;
  scheduledAt: string | null;
  status: string;
  source: string;
  note: string | null;
  cancelReason: string | null;
  createdAt: string | null;
}

export interface CallDetailPreviousSummary {
  summaryId: string;
  callLogId: string | null;
  loanId: string | null;
  callDate: string | null;
  languageUsed: string;
  outcome: string;
  summaryShort: string;
  customerStatedReason: string | null;
  commitmentSummary: string | null;
  observableTone: string | null;
  requestedHuman: boolean;
}

export interface CallSessionExtendedDetails {
  customer: CallDetailCustomerInfo;
  loanLedger: CallDetailLoanLedger;
  summary: CallDetailSummaryInfo;
  ptpCommitments: CallDetailPtpCommitment[];
  callbacks: CallDetailCallbackItem[];
  previousSummaries: CallDetailPreviousSummary[];
}

export interface LiveCallSession {
  callId: string;
  leadId: string;
  customerId: string;
  loanId: string | null;
  customerName: string;
  hplno: number | string | null;
  maskedPhone?: string;
  callStatus: string;
  callLifecycleStatus: CallLifecycleState | string;
  callDisplayState?: CallLifecycleState;
  needsReconcile?: boolean;
  telephonyMode?: VoiceTelephonyMode;
  mockTelephony?: boolean;
  callOutcome?: string;
  isTerminal: boolean;
  answered: boolean;
  customerSpoke: boolean;
  identityVerified?: boolean;
  durationSec: number;
  durationLabel: string;
  startedAt: string | null;
  endedAt: string | null;
  transcript: LiveCallTranscriptTurn[];
  summaryText: string | null;
  outcome: string | null;
  disposition: string | null;
  sentiment: string;
  languageUsed: string;
  hasRecording: boolean;
  recordingStatus: string;
  recordingDurationSec: number;
  recordingSizeBytes?: number;
  providerCallId?: string | null;
  errorDetail: string | null;
  promisedDate: string | null;
  promisedAmount: number | null;
  telemetry: LiveCallTelemetry;
  details?: CallSessionExtendedDetails;
}

export interface LiveCallStatusResponse {
  success: boolean;
  call: LiveCallSession;
}

export interface RecordingPlaybackResponse {
  success: boolean;
  callId: string;
  customerId: string;
  playbackUrl: string;
  expiresInSeconds: number;
  durationSec: number;
}

export interface CallQueueItem {
  id: string;
  batchId: string | null;
  customerId: string;
  customerName: string;
  hplno: number | string | null;
  queuePosition: number;
  totalInBatch: number;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  attemptCount: number;
  maxAttempts: number;
  callId: string | null;
  callLifecycleStatus: CallLifecycleState | string | null;
  callOutcome: string | null;
  skipReason: string | null;
  lastError: string | null;
  createdAt: string | null;
  processedAt: string | null;
}

export interface CallQueueBatch {
  batchId: string;
  status: "queued" | "in_progress" | "completed" | "cancelled" | "failed";
  totalItems: number;
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  doneCount: number;
  currentPosition: number;
  activeCustomerName: string | null;
  activeCallId: string | null;
  items: CallQueueItem[];
}

export interface EnqueueCallBatchResponse extends CallQueueBatch {
  success: boolean;
  skippedAlreadyQueued: string[];
  idempotencyReplay?: boolean;
  telephonyMode?: VoiceTelephonyMode;
  mockTelephony?: boolean;
}

export interface ActiveCallQueueResponse {
  success: boolean;
  active: boolean;
  batch: CallQueueBatch | null;
}

export interface CancelCallQueueResponse {
  success: boolean;
  batchId: string;
  cancelledCount: number;
  batch: CallQueueBatch | null;
}

export const aiApi = {
  async getVoiceHealth(forceRefresh = false): Promise<VoiceHealthResponse> {
    const { data } = await apiClient.get<VoiceHealthResponse>("/ai/voice-health", {
      params: forceRefresh ? { refresh: "true" } : undefined,
    });
    return data;
  },

  async getDashboard(): Promise<AIDashboardResponse> {
    const { data } = await apiClient.get<AIDashboardResponse>("/ai/dashboard");
    return data;
  },

  async getInsights(): Promise<{
    success: boolean;
    topStats?: {
      connectionRatePct: number;
      ptpConversionPct: number;
      highRiskPct: number;
      activeConversations: number;
      totalCalls: number;
      connectedCalls: number;
      ptpCalls: number;
      avgDurationSec: number;
    };
    riskDistribution?: {
      name: string;
      value: number;
      count?: number;
      color: string;
    }[];
    sentimentVsRecovery?: {
      month: string;
      recovery: number;
      sentiment: number;
    }[];
    topOutcomes?: {
      name: string;
      count: number;
    }[];
    activeCustomers?: {
      customerId?: string;
      name: string;
      interactions: number;
      sentiment: string;
    }[];
    highRiskCustomers: {
      customerId?: string;
      name: string;
      hpl: string;
      score: number;
      riskLevel?: RiskLevel;
      creditScore?: number;
      overdue: string;
      days: number;
    }[];
  }> {
    const { data } = await apiClient.get("/ai/insights");
    return data;
  },

  async getLogs(limit = 50): Promise<{
    success: boolean;
    logs: {
      id: number;
      callId?: string;
      logUuid?: string;
      customerId?: string;
      customer: string;
      phone: string;
      hpl: string;
      vehicle: string;
      date: string;
      sentiment: "positive" | "negative" | "neutral";
      status: "Resolved" | "Pending";
      callLifecycleStatus?: CallLifecycleState | string;
      callOutcome?: string;
      answered?: boolean;
      customerSpoke?: boolean;
      durationSec?: number;
      summaryText?: string | null;
      hasRecording?: boolean;
      recordingStatus?: string;
      tags: string[];
      messages: { role: "ai" | "customer"; text: string; time: string }[];
    }[];
  }> {
    const { data } = await apiClient.get("/ai/logs", { params: { limit } });
    return data;
  },

  async getSettings(): Promise<{
    success: boolean;
    settings: AISettingsPayload & { configVersion: number };
  }> {
    const { data } = await apiClient.get("/ai/settings");
    return data;
  },

  async updateSettings(
    payload: AISettingsPayload
  ): Promise<{ success: boolean; settings: AISettingsPayload & { configVersion: number } }> {
    const { data } = await apiClient.put("/ai/settings", payload);
    return data;
  },

  async getLeads(params?: LeadsQueryParams | number): Promise<LeadsListResponse> {
    const queryParams: LeadsQueryParams =
      typeof params === "number" ? { limit: params } : params || {};
    const { data } = await apiClient.get<LeadsListResponse>("/ai/leads", {
      params: queryParams,
    });
    return data;
  },

  async refreshLeads(): Promise<LeadRefreshResponse> {
    const { data } = await apiClient.post<LeadRefreshResponse>("/ai/leads/refresh");
    return data;
  },

  /**
   * Zero-Trust Manual Single-Call Trigger (`POST /api/ai/calls/manual`).
   * Strictly sends ONLY `{ customerId }` plus the caller-managed `Idempotency-Key` header.
   */
  async initiateManualCall(
    customerId: string,
    idempotencyKey: string
  ): Promise<ManualCallInitResponse> {
    const cleanKey = String(idempotencyKey || "").trim();
    if (!cleanKey) {
      throw new Error("Idempotency-Key is required to initiate a manual call");
    }
    const res = await apiClient.post<ManualCallInitResponse>(
      "/ai/calls/manual",
      { customerId },
      {
        headers: {
          "Idempotency-Key": cleanKey,
        },
      }
    );
    const replayHeader = String(res.headers?.["idempotency-replay"] || "").toLowerCase();
    return {
      ...res.data,
      idempotencyReplay:
        res.data.idempotencyReplay ?? (replayHeader === "true" ? true : undefined),
    };
  },

  /**
   * Zero-Trust Manual Multi-Customer Queue Batch (`POST /api/ai/calls/queue`).
   * Strictly sends ONLY `{ customerIds }` plus the caller-managed `Idempotency-Key` header.
   */
  async enqueueCallBatch(
    customerIds: string[],
    idempotencyKey: string
  ): Promise<EnqueueCallBatchResponse> {
    const cleanKey = String(idempotencyKey || "").trim();
    if (!cleanKey) {
      throw new Error("Idempotency-Key is required to enqueue a manual call batch");
    }
    const res = await apiClient.post<EnqueueCallBatchResponse>(
      "/ai/calls/queue",
      { customerIds },
      {
        headers: {
          "Idempotency-Key": cleanKey,
        },
      }
    );
    const replayHeader = String(res.headers?.["idempotency-replay"] || "").toLowerCase();
    return {
      ...res.data,
      idempotencyReplay:
        res.data.idempotencyReplay ?? (replayHeader === "true" ? true : undefined),
    };
  },

  async getActiveCallQueue(batchId?: string | null): Promise<ActiveCallQueueResponse> {
    const { data } = await apiClient.get<ActiveCallQueueResponse>("/ai/calls/queue/active", {
      params: batchId ? { batchId } : undefined,
    });
    return data;
  },

  async cancelCallQueue(batchId: string): Promise<CancelCallQueueResponse> {
    const { data } = await apiClient.post<CancelCallQueueResponse>(
      `/ai/calls/queue/${encodeURIComponent(batchId)}/cancel`
    );
    return data;
  },

  async getCallStatus(callId: string, signal?: AbortSignal): Promise<LiveCallStatusResponse> {
    const { data } = await apiClient.get<LiveCallStatusResponse>(
      `/ai/calls/${encodeURIComponent(callId)}`,
      signal ? { signal } : undefined
    );
    return data;
  },

  async getCallRecordingUrl(callId: string): Promise<RecordingPlaybackResponse> {
    const { data } = await apiClient.get<RecordingPlaybackResponse>(
      `/ai/calls/${encodeURIComponent(callId)}/recording-url`
    );
    return data;
  },

  async triggerLeadCall(
    leadId: string
  ): Promise<{
    success: boolean;
    status: string;
    leadId: string;
    outboxEventId: string | null;
  }> {
    const { data } = await apiClient.post(`/ai/leads/${encodeURIComponent(leadId)}/call`);
    return data;
  },

  async scheduleLeads(payload: {
    leadIds: string[];
    scheduledAtIso?: string;
    schedulePreset: string;
    note?: string;
  }): Promise<{
    success: boolean;
    scheduledCount: number;
    scheduledAtIso?: string;
    schedulePreset?: string;
  }> {
    const { data } = await apiClient.post("/ai/leads/schedule", payload);
    return data;
  },
};

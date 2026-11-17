/**
 * Authoritative 10-State + 'unknown' Frontend Call Lifecycle, Idempotency-Key Session,
 * Structured Error Classifier, and Backoff Polling Policy (Phase 4B).
 */

export type VoiceTelephonyMode = "live_allowlist" | "live";

export type CallLifecycleState =
  | "idle"
  | "submitting"
  | "queued"
  | "initiating"
  | "ringing"
  | "in_progress"
  | "completed"
  | "no_response"
  | "failed"
  | "cancelled"
  | "unknown";

export type LeadRowBadgeTone =
  | "neutral"
  | "blue"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "purple";

export interface CallUiDescriptor {
  state: CallLifecycleState;
  modalTitle: string;
  statusLabel: string;
  badgeLabel: string;
  description: string;
  tone: LeadRowBadgeTone;
  isActive: boolean;
  isTerminal: boolean;
  isSpeaking: boolean;
  isUnknownVerifying: boolean;
  canRetry: boolean;
  blocksNewCallForCustomer: boolean;
}

export interface ResolveLifecycleInput {
  isSubmitting?: boolean;
  callDisplayState?: string | null;
  callLifecycleStatus?: string | null;
  callStatus?: string | null;
  needsReconcile?: boolean | null;
  disposition?: string | null;
  errorDetail?: string | null;
  answered?: boolean | null;
  customerSpoke?: boolean | null;
  isDefinitePreDialFailure?: boolean;
}

export interface LeadRowStatusInput {
  customerId: string;
  isSuppressed?: boolean;
  callSessionStatus?: string | null;
  callStatus?: string | null;
  noResponse?: boolean;
  lastCallDetails?: {
    callId: string;
    status?: string | null;
    displayState?: string | null;
    needsReconcile?: boolean | null;
    disposition?: string | null;
    answered?: boolean;
    customerSpoke?: boolean;
  } | null;
}

export interface LeadRowUiStatus {
  lifecycleState: CallLifecycleState | "scheduled" | "suppressed";
  badgeLabel: string;
  tone: LeadRowBadgeTone;
  pulse: boolean;
  isUnknownVerifying: boolean;
  blocksNewCall: boolean;
  blockReason: string | null;
}

export interface IdempotencyKeySession {
  prefix: string;
  currentKey: string;
  consumedByServerResponse: boolean;
  mintCount: number;
}

export interface ClassifiedCallInitError {
  httpStatus: number | null;
  hasServerResponse: boolean;
  code: string;
  title: string;
  message: string;
  isAmbiguousUnknown: boolean;
  isDefinitePreDialFailure: boolean;
  canRetry: boolean;
  blocksNewCallForCustomer: boolean;
  retryAfterSeconds: number | null;
  ambiguousCallId: string | null;
}

export const STATUS_UNKNOWN_TEXT = "Status unknown - verifying";
export const MAX_CALL_POLL_DURATION_MS = 12 * 60 * 1000;

const IDEMPOTENCY_KEY_VALID_RE = /^[A-Za-z0-9:._-]{8,120}$/;

function randomToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Generates an ASCII-safe Idempotency-Key matching backend `IDEMPOTENCY_KEY_REGEX` (`8..120` chars).
 */
export function mintClientIdempotencyKey(prefix = "mcall"): string {
  const safePrefix =
    String(prefix || "mcall")
      .replace(/[^A-Za-z0-9:._-]/g, "")
      .slice(0, 48) || "mcall";
  const candidate = `${safePrefix}:${randomToken()}`.slice(0, 120);
  if (IDEMPOTENCY_KEY_VALID_RE.test(candidate)) {
    return candidate;
  }
  return `mcall:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Creates a confirm-dialog-scoped Idempotency-Key session.
 * Mints ONE key when the dialog opens.
 */
export function createIdempotencyKeySession(prefix = "mcall"): IdempotencyKeySession {
  return {
    prefix,
    currentKey: mintClientIdempotencyKey(prefix),
    consumedByServerResponse: false,
    mintCount: 1,
  };
}

/**
 * Returns the key to send for an explicit user submit attempt:
 * - Reuses `currentKey` ONLY when no definitive server HTTP response was received yet.
 * - Mints a NEW key if the prior attempt received ANY HTTP response (success or error).
 */
export function acquireIdempotencyKey(session: IdempotencyKeySession): {
  key: string;
  session: IdempotencyKeySession;
} {
  if (!session.consumedByServerResponse) {
    return { key: session.currentKey, session };
  }
  const freshKey = mintClientIdempotencyKey(session.prefix);
  const nextSession: IdempotencyKeySession = {
    prefix: session.prefix,
    currentKey: freshKey,
    consumedByServerResponse: false,
    mintCount: session.mintCount + 1,
  };
  return { key: freshKey, session: nextSession };
}

/**
 * Records whether the server returned an HTTP response for the attempt.
 * - `hasServerResponse: false` (network error / client timeout) -> keeps key unconsumed for safe replay.
 * - `hasServerResponse: true` (any 2xx/4xx/5xx HTTP response) -> marks key consumed so next attempt mints a NEW key.
 */
export function recordIdempotencyOutcome(
  session: IdempotencyKeySession,
  outcome: { hasServerResponse: boolean }
): IdempotencyKeySession {
  return {
    ...session,
    consumedByServerResponse: outcome.hasServerResponse ? true : false,
  };
}

/**
 * Resolves raw backend / UI call fields into the authoritative 10-state model + `'unknown'`.
 */
export function resolveCallLifecycleState(input: ResolveLifecycleInput): CallLifecycleState {
  if (input.isSubmitting) {
    return "submitting";
  }

  const display = String(input.callDisplayState || "")
    .trim()
    .toLowerCase();
  const lifecycle = String(input.callLifecycleStatus || "")
    .trim()
    .toLowerCase();
  const callStatus = String(input.callStatus || "")
    .trim()
    .toLowerCase();
  const disposition = String(input.disposition || "")
    .trim()
    .toLowerCase();
  const errorDetail = String(input.errorDetail || "");

  // Pre-dial failure stored as cancelled + failed / disposition = pre_dial_failed -> 'failed'
  if (
    disposition === "pre_dial_failed" ||
    (lifecycle === "cancelled" && callStatus === "failed")
  ) {
    return "failed";
  }

  // Terminal states take precedence over stale reconcile markers once resolved
  if (display === "no_response") return "no_response";
  if (display === "completed") return "completed";
  if (lifecycle === "completed") {
    const engaged =
      Boolean(input.answered) &&
      Boolean(input.customerSpoke) &&
      callStatus !== "not_responded";
    return engaged ? "completed" : "no_response";
  }
  if (display === "failed" || lifecycle === "failed") return "failed";
  if (display === "cancelled" || lifecycle === "cancelled") return "cancelled";

  // Ambiguous read-timeout / reconciliation state ('unknown')
  if (
    display === "unknown" ||
    lifecycle === "unknown" ||
    input.needsReconcile === true ||
    disposition === "needs_reconcile" ||
    errorDetail.startsWith("dispatch_timeout_needs_reconcile:")
  ) {
    return "unknown";
  }

  if (display === "in_progress" || lifecycle === "in_progress" || callStatus === "speaking") {
    return "in_progress";
  }
  if (display === "ringing" || lifecycle === "ringing") {
    return "ringing";
  }
  if (display === "initiating" || lifecycle === "initiating" || lifecycle === "initiated") {
    return "initiating";
  }
  if (display === "queued" || lifecycle === "queued") {
    return "queued";
  }
  if (display === "submitting" || lifecycle === "submitting") {
    return "submitting";
  }
  if (
    display === "idle" ||
    lifecycle === "idle" ||
    (!display && !lifecycle && (!callStatus || callStatus === "uncalled"))
  ) {
    return "idle";
  }

  return "initiating";
}

/**
 * Maps each of the 10 states + `'unknown'` to truthful UI titles, labels, and action gates.
 *
 * Key invariants:
 * - HTTP 202 (`queued`) means Accepted/Queued, NEVER "Ringing..." or "Voice AI Call in Progress".
 * - `initiating` means Initiating, NEVER "Ringing..." or "Voice AI Call in Progress".
 * - Waveform (`isSpeaking`) and "Voice AI Call in Progress" ONLY appear in `in_progress`.
 * - `'unknown'` shows `"Status unknown - verifying"` with `canRetry: false` and `blocksNewCallForCustomer: true`.
 * - `failed` offers `canRetry: true` ONLY for definite pre-dial failures.
 */
export function mapCallStateToUi(
  state: CallLifecycleState,
  opts?: { isDefinitePreDialFailure?: boolean }
): CallUiDescriptor {
  switch (state) {
    case "idle":
      return {
        state: "idle",
        modalTitle: "Confirm Manual AI Call",
        statusLabel: "Never Called",
        badgeLabel: "Never Called",
        description: "Ready for explicit manual AI call confirmation.",
        tone: "neutral",
        isActive: false,
        isTerminal: false,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: false,
      };
    case "submitting":
      return {
        state: "submitting",
        modalTitle: "Submitting Call Request",
        statusLabel: "Submitting",
        badgeLabel: "Submitting",
        description: "Sending request to AutoFinex backend — awaiting server acceptance...",
        tone: "blue",
        isActive: true,
        isTerminal: false,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: true,
      };
    case "queued":
      return {
        state: "queued",
        modalTitle: "Call Request Accepted",
        statusLabel: "Accepted / Queued",
        badgeLabel: "Queued",
        description:
          "Request accepted (HTTP 202) and queued — waiting for Voice AI Agent to start dialing.",
        tone: "indigo",
        isActive: true,
        isTerminal: false,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: true,
      };
    case "initiating":
      return {
        state: "initiating",
        modalTitle: "Initiating Outbound Call",
        statusLabel: "Initiating",
        badgeLabel: "Initiating",
        description:
          "Voice AI Agent accepted request — requesting telephony carrier to place the call.",
        tone: "blue",
        isActive: true,
        isTerminal: false,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: true,
      };
    case "ringing":
      return {
        state: "ringing",
        modalTitle: "Customer Phone Ringing",
        statusLabel: "Ringing",
        badgeLabel: "Ringing",
        description: "Telephony carrier reports customer handset is ringing — waiting for answer.",
        tone: "blue",
        isActive: true,
        isTerminal: false,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: true,
      };
    case "in_progress":
      return {
        state: "in_progress",
        modalTitle: "Voice AI Call in Progress",
        statusLabel: "In Progress",
        badgeLabel: "In Progress",
        description: "Customer connected — live Voice AI conversation active.",
        tone: "emerald",
        isActive: true,
        isTerminal: false,
        isSpeaking: true,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: true,
      };
    case "completed":
      return {
        state: "completed",
        modalTitle: "Voice AI Call Summary",
        statusLabel: "Completed",
        badgeLabel: "Completed",
        description: "Call completed with customer conversation.",
        tone: "emerald",
        isActive: false,
        isTerminal: true,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: false,
      };
    case "no_response":
      return {
        state: "no_response",
        modalTitle: "Voice AI Call Summary",
        statusLabel: "No Response",
        badgeLabel: "No Response",
        description: "Call ended without customer response.",
        tone: "amber",
        isActive: false,
        isTerminal: true,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: false,
      };
    case "failed": {
      const canRetry = Boolean(opts?.isDefinitePreDialFailure);
      return {
        state: "failed",
        modalTitle: "Call Failed",
        statusLabel: "Failed",
        badgeLabel: "Failed",
        description: canRetry
          ? "Call failed before dialing; safe to retry with a new request key."
          : "Call attempt failed.",
        tone: "rose",
        isActive: false,
        isTerminal: true,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry,
        blocksNewCallForCustomer: false,
      };
    }
    case "cancelled":
      return {
        state: "cancelled",
        modalTitle: "Call Cancelled",
        statusLabel: "Cancelled",
        badgeLabel: "Cancelled",
        description: "Call was cancelled before completion.",
        tone: "amber",
        isActive: false,
        isTerminal: true,
        isSpeaking: false,
        isUnknownVerifying: false,
        canRetry: false,
        blocksNewCallForCustomer: false,
      };
    case "unknown":
      return {
        state: "unknown",
        modalTitle: STATUS_UNKNOWN_TEXT,
        statusLabel: STATUS_UNKNOWN_TEXT,
        badgeLabel: STATUS_UNKNOWN_TEXT,
        description:
          "Dispatch timed out after sending request. Backend reconciler is verifying carrier status — new calls and retries are blocked until resolved.",
        tone: "amber",
        isActive: true,
        isTerminal: false,
        isSpeaking: false,
        isUnknownVerifying: true,
        canRetry: false,
        blocksNewCallForCustomer: true,
      };
  }
}

/**
 * Shared lead-row status mapper using `resolveCallLifecycleState` + `mapCallStateToUi`
 * so table & mobile row badges stay 100% aligned with modal lifecycle states (including `'unknown'`).
 */
export function mapLeadRowToUiStatus(
  lead: LeadRowStatusInput,
  verifyingCustomerIds?: ReadonlySet<string>
): LeadRowUiStatus {
  if (lead.isSuppressed || lead.callSessionStatus === "suppressed") {
    return {
      lifecycleState: "suppressed",
      badgeLabel: "Opted Out (DNC)",
      tone: "rose",
      pulse: false,
      isUnknownVerifying: false,
      blocksNewCall: true,
      blockReason: "Customer opted out of automated calls (DNC)",
    };
  }

  if (verifyingCustomerIds?.has(lead.customerId)) {
    const unknownUi = mapCallStateToUi("unknown");
    return {
      lifecycleState: "unknown",
      badgeLabel: unknownUi.badgeLabel,
      tone: unknownUi.tone,
      pulse: true,
      isUnknownVerifying: true,
      blocksNewCall: true,
      blockReason:
        "Status unknown - verifying with backend reconciler; new calls blocked until terminal state",
    };
  }

  const last = lead.lastCallDetails || null;

  if (lead.callSessionStatus === "calling") {
    const resolved = resolveCallLifecycleState({
      callDisplayState: last?.displayState,
      callLifecycleStatus:
        last?.status || (lead.callStatus === "speaking" ? "in_progress" : "initiating"),
      callStatus: lead.callStatus,
      needsReconcile: last?.needsReconcile,
      disposition: last?.disposition,
      answered: last?.answered,
      customerSpoke: last?.customerSpoke,
    });
    const activeState: CallLifecycleState =
      resolved === "queued" ||
      resolved === "initiating" ||
      resolved === "ringing" ||
      resolved === "in_progress" ||
      resolved === "unknown"
        ? resolved
        : "initiating";
    const ui = mapCallStateToUi(activeState);
    return {
      lifecycleState: ui.state,
      badgeLabel: ui.badgeLabel,
      tone: ui.tone,
      pulse: true,
      isUnknownVerifying: ui.isUnknownVerifying,
      blocksNewCall: true,
      blockReason: ui.isUnknownVerifying
        ? "Status unknown - verifying with backend reconciler"
        : `Call already ${ui.badgeLabel.toLowerCase()}`,
    };
  }

  if (lead.callSessionStatus === "scheduled") {
    return {
      lifecycleState: "scheduled",
      badgeLabel: "Scheduled",
      tone: "purple",
      pulse: false,
      isUnknownVerifying: false,
      blocksNewCall: false,
      blockReason: null,
    };
  }

  if (lead.callSessionStatus === "uncalled" && !last) {
    const ui = mapCallStateToUi("idle");
    return {
      lifecycleState: "idle",
      badgeLabel: ui.badgeLabel,
      tone: ui.tone,
      pulse: false,
      isUnknownVerifying: false,
      blocksNewCall: false,
      blockReason: null,
    };
  }

  let resolvedTerminal: CallLifecycleState = "idle";
  if (lead.callSessionStatus === "completed") {
    resolvedTerminal = "completed";
  } else if (last?.status || last?.displayState || last?.needsReconcile || last?.disposition) {
    resolvedTerminal = resolveCallLifecycleState({
      callDisplayState: last.displayState,
      callLifecycleStatus: last.status || "failed",
      callStatus: lead.noResponse ? "not_responded" : lead.callStatus,
      needsReconcile: last.needsReconcile,
      disposition: last.disposition,
      answered: last.answered,
      customerSpoke: last.customerSpoke,
    });
  } else if (lead.noResponse) {
    resolvedTerminal = "no_response";
  } else if (lead.callSessionStatus === "failed") {
    resolvedTerminal = "failed";
  }

  const ui = mapCallStateToUi(resolvedTerminal);
  return {
    lifecycleState: ui.state,
    badgeLabel: ui.badgeLabel,
    tone: ui.tone,
    pulse: ui.isUnknownVerifying,
    isUnknownVerifying: ui.isUnknownVerifying,
    blocksNewCall: ui.blocksNewCallForCustomer,
    blockReason: ui.blocksNewCallForCustomer ? STATUS_UNKNOWN_TEXT : null,
  };
}

function parseRetryAfterHeader(
  headers?: Record<string, unknown> | null,
  fallbackSeconds?: unknown
): number | null {
  if (headers && typeof headers === "object") {
    const rawHeader =
      (headers["retry-after"] as string | number | undefined) ??
      (headers["Retry-After"] as string | number | undefined);
    if (rawHeader !== undefined && rawHeader !== null && String(rawHeader).trim() !== "") {
      const asNum = Number(String(rawHeader).trim());
      if (Number.isFinite(asNum) && asNum > 0) {
        return Math.ceil(asNum);
      }
      const parsedDateMs = Date.parse(String(rawHeader));
      if (Number.isFinite(parsedDateMs)) {
        const diffSec = Math.ceil((parsedDateMs - Date.now()) / 1000);
        if (diffSec > 0) return diffSec;
      }
    }
  }
  const fb = Number(fallbackSeconds);
  if (Number.isFinite(fb) && fb > 0) {
    return Math.ceil(fb);
  }
  return null;
}

function formatRetryWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (mins < 60) {
    return rem > 0 ? `${mins}m ${rem}s (${seconds}s)` : `${mins}m (${seconds}s)`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

interface AxiosLikeErrorShape {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: {
    status?: number;
    headers?: Record<string, unknown>;
    data?: {
      error?: string;
      message?: string;
      code?: string;
      details?: {
        reason_code?: string;
        message?: string;
        cooldown_remaining_seconds?: number;
        callId?: string;
        activeCallId?: string;
        needsReconcile?: boolean;
      };
    };
  };
}

/**
 * Classifies manual call / batch queue HTTP errors into clear, truthful UI messages.
 * Never claims a call was initiated on error, honours `Retry-After` on cooldown (`429`),
 * and locks the customer in `'unknown'` (`Status unknown - verifying`) with NO Retry on `504`.
 */
export function classifyCallInitError(err: unknown): ClassifiedCallInitError {
  const ax = (err && typeof err === "object" ? err : {}) as AxiosLikeErrorShape;
  const response = ax.response;
  const status = typeof response?.status === "number" ? response.status : null;

  if (status === null) {
    return {
      httpStatus: null,
      hasServerResponse: false,
      code: String(ax.code || "network_error"),
      title: "Connection Lost — No Response Received",
      message:
        "No HTTP response was received from the server (network error or timeout). Retrying will safely reuse the same Idempotency-Key so a duplicate call cannot be placed.",
      isAmbiguousUnknown: false,
      isDefinitePreDialFailure: true,
      canRetry: true,
      blocksNewCallForCustomer: false,
      retryAfterSeconds: null,
      ambiguousCallId: null,
    };
  }

  const data = response?.data || {};
  const details = data.details || {};
  const rawCode = String(data.code || details.reason_code || "").trim();
  const serverText = String(details.message || data.error || data.message || "").trim();
  const retryAfterSeconds = parseRetryAfterHeader(
    response?.headers || null,
    details.cooldown_remaining_seconds
  );

  // 504 / dispatch_timeout_ambiguous -> Status unknown - verifying (NO Retry, block new call)
  if (
    status === 504 ||
    rawCode === "dispatch_timeout_ambiguous" ||
    rawCode === "dograh_dispatch_timeout_ambiguous" ||
    details.needsReconcile === true
  ) {
    return {
      httpStatus: status,
      hasServerResponse: true,
      code: rawCode || "dispatch_timeout_ambiguous",
      title: STATUS_UNKNOWN_TEXT,
      message:
        "Status unknown - verifying: the dispatch request timed out after transmission. Do not retry — new calls for this customer are blocked until the backend reconciler confirms the final call state.",
      isAmbiguousUnknown: true,
      isDefinitePreDialFailure: false,
      canRetry: false,
      blocksNewCallForCustomer: true,
      retryAfterSeconds: null,
      ambiguousCallId: details.callId ? String(details.callId) : null,
    };
  }

  // 429 or cooldown_active -> honour Retry-After
  if (status === 429 || rawCode === "cooldown_active" || rawCode === "max_daily_attempts_reached") {
    const waitClause = retryAfterSeconds
      ? ` Please wait ${formatRetryWait(retryAfterSeconds)} before trying again.`
      : "";
    const baseMsg =
      rawCode === "max_daily_attempts_reached"
        ? "Daily Voice AI call attempt limit reached for this customer. No call was placed."
        : `Call cooldown is active for this customer.${waitClause} No call was placed.`;
    return {
      httpStatus: status,
      hasServerResponse: true,
      code: rawCode || "cooldown_active",
      title: "Call Cooldown Active",
      message: baseMsg,
      isAmbiguousUnknown: false,
      isDefinitePreDialFailure: false,
      canRetry: false,
      blocksNewCallForCustomer: false,
      retryAfterSeconds,
      ambiguousCallId: null,
    };
  }

  // 400 Invalid key / untrusted fields / bad request
  if (status === 400) {
    let msg = serverText || "Invalid call request parameters.";
    if (rawCode === "invalid_idempotency_key" || rawCode === "missing_idempotency_key") {
      msg = "Invalid or missing Idempotency-Key header. No call was placed.";
    } else if (rawCode === "untrusted_client_fields") {
      msg =
        "Request rejected because unexpected client fields were sent (only customerId is permitted). No call was placed.";
    } else if (!/no call was placed/i.test(msg)) {
      msg = `${msg} No call was placed.`;
    }
    return {
      httpStatus: 400,
      hasServerResponse: true,
      code: rawCode || "bad_request",
      title: "Request Rejected (400)",
      message: msg,
      isAmbiguousUnknown: false,
      isDefinitePreDialFailure: false,
      canRetry: false,
      blocksNewCallForCustomer: false,
      retryAfterSeconds: null,
      ambiguousCallId: null,
    };
  }

  // 403 Entitlement / allowlist / forbidden
  if (status === 403) {
    let msg = serverText || "Access denied for Voice AI calling.";
    if (rawCode === "ai_voice_agent_entitlement_missing") {
      msg =
        "Voice AI Agent feature (ai_voice_agent entitlement) is not enabled or has expired for this finance account. No call was placed.";
    } else if (rawCode === "destination_not_in_test_allowlist") {
      msg =
        "Safety block: this customer's phone number is not in the configured test allowlist (live_allowlist mode). No call was placed.";
    } else if (!/no call was placed/i.test(msg)) {
      msg = `${msg} No call was placed.`;
    }
    return {
      httpStatus: 403,
      hasServerResponse: true,
      code: rawCode || "forbidden",
      title: "Call Not Permitted (403)",
      message: msg,
      isAmbiguousUnknown: false,
      isDefinitePreDialFailure: false,
      canRetry: false,
      blocksNewCallForCustomer: false,
      retryAfterSeconds: null,
      ambiguousCallId: null,
    };
  }

  // 409 Policy / state conflicts (DNC, already in progress, no overdue, outside calling window)
  if (status === 409) {
    let msg = serverText || "Customer is not currently eligible for a call.";
    if (rawCode === "suppressed_dnc") {
      msg =
        "Customer has opted out of automated calls (Do Not Call suppression active). No call was placed.";
    } else if (rawCode === "call_already_in_progress") {
      msg = "A Voice AI call is already active for this customer. No duplicate call was placed.";
    } else if (rawCode === "no_overdue_balance") {
      msg = "Customer has no matured overdue EMI balance right now. No call was placed.";
    } else if (rawCode === "outside_calling_window") {
      msg =
        "Current IST time is outside the configured calling window. Schedule a callback instead; no call was placed.";
    } else if (!/no.*call was placed/i.test(msg)) {
      msg = `${msg} No call was placed.`;
    }
    return {
      httpStatus: 409,
      hasServerResponse: true,
      code: rawCode || "call_conflict",
      title: "Cannot Place Call Right Now",
      message: msg,
      isAmbiguousUnknown: false,
      isDefinitePreDialFailure: false,
      canRetry: false,
      blocksNewCallForCustomer: rawCode === "call_already_in_progress",
      retryAfterSeconds: null,
      ambiguousCallId: null,
    };
  }

  // 422 Idempotency-Key payload mismatch or unprocessable eligibility state
  if (status === 422) {
    let msg = serverText || "Request could not be processed.";
    if (rawCode === "idempotency_key_payload_mismatch") {
      msg =
        "Idempotency-Key mismatch: this request key was already used for a different customer. Start a new attempt to mint a fresh key; no call was placed.";
    } else if (rawCode === "no_overdue_balance") {
      msg = "Customer has no matured overdue EMI balance as of today (IST). No call was placed.";
    } else if (!/no call was placed/i.test(msg)) {
      msg = `${msg} No call was placed.`;
    }
    return {
      httpStatus: 422,
      hasServerResponse: true,
      code: rawCode || "unprocessable_request",
      title:
        rawCode === "idempotency_key_payload_mismatch"
          ? "Request Key Mismatch (422)"
          : "Customer Not Eligible (422)",
      message: msg,
      isAmbiguousUnknown: false,
      isDefinitePreDialFailure: false,
      canRetry: rawCode === "idempotency_key_payload_mismatch",
      blocksNewCallForCustomer: false,
      retryAfterSeconds: null,
      ambiguousCallId: null,
    };
  }

  // 502 / 503 Upstream Voice AI / Gateway unavailable or kill switch (definite pre-dial failure)
  if (status === 502 || status === 503) {
    const isKillSwitch = rawCode === "kill_switch_active";
    const msg = isKillSwitch
      ? "Voice AI kill switch is active on the server. Outbound calls are paused; no call was placed."
      : `${
          serverText || "Voice AI Agent or telephony gateway is temporarily unavailable."
        } Failed before dialing — no call was placed and no daily attempt was used.`;
    return {
      httpStatus: status,
      hasServerResponse: true,
      code: rawCode || "voice_service_unavailable",
      title: isKillSwitch ? "Voice AI Paused (503)" : "Voice Service Unavailable",
      message: msg,
      isAmbiguousUnknown: false,
      isDefinitePreDialFailure: !isKillSwitch,
      canRetry: !isKillSwitch,
      blocksNewCallForCustomer: false,
      retryAfterSeconds: null,
      ambiguousCallId: null,
    };
  }

  return {
    httpStatus: status,
    hasServerResponse: true,
    code: rawCode || `http_${status}`,
    title: "Call Request Failed",
    message: `${serverText || "Unable to place Voice AI call."} No call was placed.`,
    isAmbiguousUnknown: false,
    isDefinitePreDialFailure: false,
    canRetry: false,
    blocksNewCallForCustomer: false,
    retryAfterSeconds: null,
    ambiguousCallId: null,
  };
}

/**
 * Computes progressive backoff delay (in ms) for `GET /api/ai/calls/:id` polling.
 * Returns `null` immediately when `isTerminal` is true or `elapsedMs >= maxDurationMs` (~12 min).
 */
export function computeNextPollDelayMs(
  attemptIndex: number,
  elapsedMs: number,
  opts?: { isTerminal?: boolean; maxDurationMs?: number }
): number | null {
  if (opts?.isTerminal) return null;
  const maxDurationMs = opts?.maxDurationMs ?? MAX_CALL_POLL_DURATION_MS;
  if (elapsedMs >= maxDurationMs) return null;

  let baseDelayMs: number;
  if (attemptIndex < 8) {
    baseDelayMs = 1500;
  } else if (attemptIndex < 25) {
    baseDelayMs = 3000;
  } else if (attemptIndex < 60) {
    baseDelayMs = 5000;
  } else {
    baseDelayMs = 10000;
  }

  const remainingMs = maxDurationMs - elapsedMs;
  return Math.max(250, Math.min(baseDelayMs, remainingMs));
}

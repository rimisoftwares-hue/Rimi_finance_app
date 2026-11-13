import test from "node:test";
import assert from "node:assert/strict";
import {
  STATUS_UNKNOWN_TEXT,
  TEST_MODE_BADGE_TEXT,
  MAX_CALL_POLL_DURATION_MS,
  mintClientIdempotencyKey,
  createIdempotencyKeySession,
  acquireIdempotencyKey,
  recordIdempotencyOutcome,
  resolveCallLifecycleState,
  mapCallStateToUi,
  mapLeadRowToUiStatus,
  isMockTelephonyActive,
  classifyCallInitError,
  computeNextPollDelayMs,
  type CallLifecycleState,
} from "../src/components/ai/callLifecycleModel.ts";

test("1. 10-state + unknown UI mapping: truthful labels, HTTP 202 queued != ringing/in_progress, waveform only in_progress", () => {
  const allStates: CallLifecycleState[] = [
    "idle",
    "submitting",
    "queued",
    "initiating",
    "ringing",
    "in_progress",
    "completed",
    "no_response",
    "failed",
    "cancelled",
    "unknown",
  ];

  for (const state of allStates) {
    const ui = mapCallStateToUi(state);
    assert.equal(ui.state, state);
    assert.ok(ui.modalTitle.length > 0);
    assert.ok(ui.statusLabel.length > 0);
  }

  // Submitting
  const submitting = mapCallStateToUi("submitting");
  assert.match(submitting.statusLabel, /Submitting/i);
  assert.equal(submitting.isSpeaking, false);
  assert.doesNotMatch(submitting.modalTitle, /In Progress|Ringing/i);

  // HTTP 202 Accepted / Queued -> NEVER "Voice AI Call in Progress" or "Ringing..."
  const queuedState = resolveCallLifecycleState({
    callLifecycleStatus: "queued",
    callDisplayState: "queued",
  });
  assert.equal(queuedState, "queued");
  const queued = mapCallStateToUi(queuedState);
  assert.match(queued.statusLabel, /Accepted|Queued/i);
  assert.doesNotMatch(queued.modalTitle, /Voice AI Call in Progress|Ringing/i);
  assert.doesNotMatch(queued.statusLabel, /Voice AI Call in Progress|Ringing/i);
  assert.equal(queued.isSpeaking, false);

  // Initiating (DB 'initiated' or wire 'initiating') -> NEVER "Voice AI Call in Progress" or "Ringing..."
  const initState = resolveCallLifecycleState({ callLifecycleStatus: "initiated" });
  assert.equal(initState, "initiating");
  const initiating = mapCallStateToUi(initState);
  assert.equal(initiating.statusLabel, "Initiating");
  assert.doesNotMatch(initiating.modalTitle, /Voice AI Call in Progress|Ringing/i);
  assert.doesNotMatch(initiating.statusLabel, /Voice AI Call in Progress|Ringing/i);
  assert.equal(initiating.isSpeaking, false);

  // Ringing -> truthful Ringing, still not "Voice AI Call in Progress" or speaking
  const ringing = mapCallStateToUi("ringing");
  assert.equal(ringing.statusLabel, "Ringing");
  assert.doesNotMatch(ringing.modalTitle, /Voice AI Call in Progress/i);
  assert.equal(ringing.isSpeaking, false);

  // In Progress -> ONLY state where speaking waveform & "Voice AI Call in Progress" appear
  const inProgress = mapCallStateToUi("in_progress");
  assert.equal(inProgress.modalTitle, "Voice AI Call in Progress");
  assert.equal(inProgress.statusLabel, "In Progress");
  assert.equal(inProgress.isSpeaking, true);
  assert.equal(inProgress.isTerminal, false);

  // Completed vs No Response
  assert.equal(
    resolveCallLifecycleState({
      callLifecycleStatus: "completed",
      answered: true,
      customerSpoke: true,
    }),
    "completed"
  );
  assert.equal(
    resolveCallLifecycleState({
      callLifecycleStatus: "completed",
      answered: false,
      customerSpoke: false,
    }),
    "no_response"
  );
  assert.equal(mapCallStateToUi("completed").statusLabel, "Completed");
  assert.equal(mapCallStateToUi("completed").isTerminal, true);
  assert.equal(mapCallStateToUi("no_response").statusLabel, "No Response");
  assert.equal(mapCallStateToUi("no_response").isTerminal, true);

  // Failed: Retry offered ONLY for definite pre-dial failures
  const postDialFailed = mapCallStateToUi("failed", { isDefinitePreDialFailure: false });
  assert.equal(postDialFailed.statusLabel, "Failed");
  assert.equal(postDialFailed.isTerminal, true);
  assert.equal(postDialFailed.canRetry, false);

  const preDialFailed = mapCallStateToUi("failed", { isDefinitePreDialFailure: true });
  assert.equal(preDialFailed.statusLabel, "Failed");
  assert.equal(preDialFailed.canRetry, true);

  // Cancelled
  const cancelled = mapCallStateToUi("cancelled");
  assert.equal(cancelled.statusLabel, "Cancelled");
  assert.equal(cancelled.isTerminal, true);
  assert.equal(cancelled.canRetry, false);
});

test("2. 'unknown' / needsReconcile mapping: shows 'Status unknown - verifying', NO Retry, blocks new call for customer", () => {
  const fromNeedsReconcile = resolveCallLifecycleState({
    callLifecycleStatus: "initiated",
    needsReconcile: true,
  });
  assert.equal(fromNeedsReconcile, "unknown");

  const fromDisposition = resolveCallLifecycleState({
    callLifecycleStatus: "initiated",
    disposition: "needs_reconcile",
  });
  assert.equal(fromDisposition, "unknown");

  const unknownUi = mapCallStateToUi("unknown");
  assert.equal(unknownUi.statusLabel, STATUS_UNKNOWN_TEXT);
  assert.equal(unknownUi.badgeLabel, STATUS_UNKNOWN_TEXT);
  assert.equal(unknownUi.isUnknownVerifying, true);
  assert.equal(unknownUi.canRetry, false);
  assert.equal(unknownUi.blocksNewCallForCustomer, true);
  assert.equal(unknownUi.isTerminal, false);

  // Once backend reconciles to a terminal state, unknown is cleared
  const resolvedTerminal = resolveCallLifecycleState({
    callLifecycleStatus: "failed",
    disposition: "needs_reconcile",
    needsReconcile: false,
  });
  assert.equal(resolvedTerminal, "failed");
});

test("3. Lead row badge mapper uses the same status mapper including 'unknown' and blocks row Call button", () => {
  const verifyingSet = new Set<string>(["cust-ambig-1"]);

  // Client-locked ambiguous customer
  const ambigClientRow = mapLeadRowToUiStatus(
    {
      customerId: "cust-ambig-1",
      callSessionStatus: "uncalled",
      lastCallDetails: null,
    },
    verifyingSet
  );
  assert.equal(ambigClientRow.lifecycleState, "unknown");
  assert.equal(ambigClientRow.badgeLabel, STATUS_UNKNOWN_TEXT);
  assert.equal(ambigClientRow.isUnknownVerifying, true);
  assert.equal(ambigClientRow.blocksNewCall, true);

  // Server-reported needs_reconcile row on GET /api/ai/leads
  const ambigServerRow = mapLeadRowToUiStatus({
    customerId: "cust-ambig-2",
    callSessionStatus: "calling",
    lastCallDetails: {
      callId: "call-2",
      status: "initiated",
      disposition: "needs_reconcile",
      answered: false,
      customerSpoke: false,
    },
  });
  assert.equal(ambigServerRow.lifecycleState, "unknown");
  assert.equal(ambigServerRow.badgeLabel, STATUS_UNKNOWN_TEXT);
  assert.equal(ambigServerRow.blocksNewCall, true);

  // Server reconciled to terminal completed -> client lock should NOT override if caller cleared or if server row is terminal without client lock
  const completedRow = mapLeadRowToUiStatus({
    customerId: "cust-done-1",
    callSessionStatus: "completed",
    lastCallDetails: {
      callId: "call-3",
      status: "completed",
      answered: true,
      customerSpoke: true,
    },
  });
  assert.equal(completedRow.lifecycleState, "completed");
  assert.equal(completedRow.badgeLabel, "Completed");
  assert.equal(completedRow.blocksNewCall, false);

  // Queued / Initiating / Ringing / In Progress active rows
  assert.equal(
    mapLeadRowToUiStatus({
      customerId: "c-q",
      callSessionStatus: "calling",
      lastCallDetails: { callId: "1", status: "queued" },
    }).badgeLabel,
    "Queued"
  );
  assert.equal(
    mapLeadRowToUiStatus({
      customerId: "c-i",
      callSessionStatus: "calling",
      lastCallDetails: { callId: "2", status: "initiated" },
    }).badgeLabel,
    "Initiating"
  );
  assert.equal(
    mapLeadRowToUiStatus({
      customerId: "c-r",
      callSessionStatus: "calling",
      lastCallDetails: { callId: "3", status: "ringing" },
    }).badgeLabel,
    "Ringing"
  );
  assert.equal(
    mapLeadRowToUiStatus({
      customerId: "c-p",
      callSessionStatus: "calling",
      lastCallDetails: { callId: "4", status: "in_progress" },
    }).badgeLabel,
    "In Progress"
  );

  // No Response, Cancelled, Failed, Suppressed, Scheduled, Never Called
  assert.equal(
    mapLeadRowToUiStatus({
      customerId: "c-nr",
      callSessionStatus: "failed",
      noResponse: true,
      lastCallDetails: { callId: "5", status: "completed", answered: false, customerSpoke: false },
    }).badgeLabel,
    "No Response"
  );
  assert.equal(
    mapLeadRowToUiStatus({
      customerId: "c-can",
      callSessionStatus: "failed",
      lastCallDetails: { callId: "6", status: "cancelled", disposition: "manual_cancel" },
    }).badgeLabel,
    "Cancelled"
  );
  assert.equal(
    mapLeadRowToUiStatus({
      customerId: "c-fail",
      callSessionStatus: "failed",
      lastCallDetails: { callId: "7", status: "cancelled", disposition: "pre_dial_failed" },
    }).badgeLabel,
    "Failed"
  );
  assert.equal(
    mapLeadRowToUiStatus({
      customerId: "c-dnc",
      isSuppressed: true,
      callSessionStatus: "suppressed",
    }).blocksNewCall,
    true
  );
});

test("4. Idempotency-Key lifecycle: one key per dialog open, SAME key on network/no-HTTP-response error, NEW key after ANY HTTP response", () => {
  const sampleKey = mintClientIdempotencyKey("mcall");
  assert.match(sampleKey, /^[A-Za-z0-9:._-]{8,120}$/);

  // Dialog opens -> mints key #1
  let session = createIdempotencyKeySession("mcall");
  const firstKey = session.currentKey;
  assert.equal(session.mintCount, 1);

  // User clicks Call Now -> acquires key #1
  const attempt1 = acquireIdempotencyKey(session);
  assert.equal(attempt1.key, firstKey);
  session = attempt1.session;

  // Attempt 1 fails with NO HTTP response (network drop / client timeout)
  session = recordIdempotencyOutcome(session, { hasServerResponse: false });
  assert.equal(session.consumedByServerResponse, false);

  // User retries -> MUST reuse the EXACT SAME key #1
  const attempt2 = acquireIdempotencyKey(session);
  assert.equal(attempt2.key, firstKey);
  assert.equal(attempt2.session.mintCount, 1);
  session = attempt2.session;

  // Attempt 2 receives a definitive 503 HTTP response from server
  session = recordIdempotencyOutcome(session, { hasServerResponse: true });
  assert.equal(session.consumedByServerResponse, true);

  // User clicks Retry again -> MUST mint a NEW key #2
  const attempt3 = acquireIdempotencyKey(session);
  assert.notEqual(attempt3.key, firstKey);
  assert.equal(attempt3.session.mintCount, 2);
  session = attempt3.session;

  // Attempt 3 receives HTTP 202 Accepted -> marks consumed so any subsequent attempt mints key #3
  session = recordIdempotencyOutcome(session, { hasServerResponse: true });
  const attempt4 = acquireIdempotencyKey(session);
  assert.notEqual(attempt4.key, attempt3.key);
  assert.equal(attempt4.session.mintCount, 3);
});

test("5. Error handling covers 400, 403, 409, 422, 429 (Retry-After), 502/503, 504 ambiguous, and network errors without ever claiming call initiated", () => {
  const makeAxiosLike = (
    status: number,
    data: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) => ({
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    response: { status, data, headers },
  });

  // 400 untrusted_client_fields
  const e400 = classifyCallInitError(
    makeAxiosLike(400, { code: "untrusted_client_fields", error: "Untrusted fields" })
  );
  assert.equal(e400.httpStatus, 400);
  assert.equal(e400.hasServerResponse, true);
  assert.equal(e400.canRetry, false);
  assert.doesNotMatch(e400.message, /call has been initiated|calling customer/i);

  // 403 entitlement & allowlist
  const e403Ent = classifyCallInitError(
    makeAxiosLike(403, { code: "ai_voice_agent_entitlement_missing", error: "Missing entitlement" })
  );
  assert.equal(e403Ent.httpStatus, 403);
  assert.match(e403Ent.message, /ai_voice_agent|entitlement|not enabled/i);
  assert.equal(e403Ent.canRetry, false);

  const e403Allow = classifyCallInitError(
    makeAxiosLike(403, {
      code: "destination_not_in_test_allowlist",
      error: "Destination not allowlisted",
    })
  );
  assert.equal(e403Allow.httpStatus, 403);
  assert.match(e403Allow.message, /allowlist/i);
  assert.equal(e403Allow.canRetry, false);

  // 409 DNC, already in progress, no overdue, outside window
  for (const code of [
    "suppressed_dnc",
    "call_already_in_progress",
    "no_overdue_balance",
    "outside_calling_window",
  ]) {
    const e409 = classifyCallInitError(makeAxiosLike(409, { code, error: code }));
    assert.equal(e409.httpStatus, 409);
    assert.equal(e409.canRetry, false);
    assert.equal(e409.isAmbiguousUnknown, false);
  }

  // 422 idempotency_key_payload_mismatch
  const e422 = classifyCallInitError(
    makeAxiosLike(422, {
      code: "idempotency_key_payload_mismatch",
      error: "Idempotency-Key reused with different customer",
    })
  );
  assert.equal(e422.httpStatus, 422);
  assert.match(e422.message, /Idempotency-Key|mismatch|different customer/i);

  // 429 cooldown honouring Retry-After header
  const e429 = classifyCallInitError(
    makeAxiosLike(
      429,
      { code: "cooldown_active", error: "Cooldown active" },
      { "retry-after": "125" }
    )
  );
  assert.equal(e429.httpStatus, 429);
  assert.equal(e429.retryAfterSeconds, 125);
  assert.match(e429.message, /2m 5s|125s/);
  assert.equal(e429.canRetry, false);

  // 503 pre-dial failure -> Retry IS allowed (new key will be minted)
  const e503 = classifyCallInitError(
    makeAxiosLike(503, { code: "voice_agent_unavailable", error: "ECONNREFUSED" })
  );
  assert.equal(e503.httpStatus, 503);
  assert.equal(e503.isDefinitePreDialFailure, true);
  assert.equal(e503.canRetry, true);

  // 504 dispatch_timeout_ambiguous -> Status unknown - verifying, NO Retry, blocks new call!
  const e504 = classifyCallInitError(
    makeAxiosLike(504, {
      code: "dispatch_timeout_ambiguous",
      error: "Timed out after transmission",
      details: {
        callId: "00000000-0000-4000-8000-000000000504",
        callLifecycleStatus: "unknown",
        needsReconcile: true,
      },
    })
  );
  assert.equal(e504.httpStatus, 504);
  assert.equal(e504.hasServerResponse, true);
  assert.equal(e504.isAmbiguousUnknown, true);
  assert.equal(e504.canRetry, false);
  assert.equal(e504.blocksNewCallForCustomer, true);
  assert.equal(e504.ambiguousCallId, "00000000-0000-4000-8000-000000000504");
  assert.match(e504.title, /Status unknown - verifying/i);

  // Pure network drop (no HTTP response) -> hasServerResponse = false, retry reuses same key
  const netErr = classifyCallInitError({
    isAxiosError: true,
    code: "ERR_NETWORK",
    message: "Network Error",
    response: undefined,
  });
  assert.equal(netErr.httpStatus, null);
  assert.equal(netErr.hasServerResponse, false);
  assert.equal(netErr.canRetry, true);
});

test("6. Mock telephony detection & polling backoff with 12-minute hard cap", () => {
  assert.equal(TEST_MODE_BADGE_TEXT, "TEST MODE - no real call is placed");
  assert.equal(isMockTelephonyActive({ telephonyMode: "mock" }), true);
  assert.equal(isMockTelephonyActive({ mockTelephony: true }), true);
  assert.equal(isMockTelephonyActive({ providerCallId: "mock-abc-123" }), true);
  assert.equal(
    isMockTelephonyActive({
      telephonyMode: "live_allowlist",
      mockTelephony: false,
      providerCallId: "af-call-123",
    }),
    false
  );

  // Backoff increases monotonically and stops at terminal or 12-min cap
  assert.equal(MAX_CALL_POLL_DURATION_MS, 12 * 60 * 1000);
  const d0 = computeNextPollDelayMs(0, 0);
  const d10 = computeNextPollDelayMs(10, 20_000);
  const d30 = computeNextPollDelayMs(30, 120_000);
  const d70 = computeNextPollDelayMs(70, 360_000);
  assert.ok(d0 !== null && d10 !== null && d30 !== null && d70 !== null);
  assert.ok(d0 <= d10 && d10 <= d30 && d30 <= d70);

  // Clamps near 12-minute cap
  assert.equal(computeNextPollDelayMs(80, MAX_CALL_POLL_DURATION_MS - 2500), 2500);
  // Stops at or past 12-minute cap
  assert.equal(computeNextPollDelayMs(81, MAX_CALL_POLL_DURATION_MS), null);
  // Stops immediately when terminal
  assert.equal(computeNextPollDelayMs(2, 3000, { isTerminal: true }), null);
});


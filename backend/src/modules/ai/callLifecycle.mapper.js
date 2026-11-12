'use strict';

/**
 * Authoritative 10-State Call Lifecycle <-> PostgreSQL Status Mapper (Amendment A6).
 *
 * Keeps transport/telephony lifecycle (`call_lifecycle_status`) strictly separated from
 * business outcome, maps API `'initiating'` <-> DB `'initiated'`, enforces forward-only
 * progression, and guarantees terminal states (`completed`, `failed`, `cancelled`) are immutable.
 */

const DOMAIN_CALL_STATES = Object.freeze([
  'idle',
  'submitting',
  'queued',
  'initiating',
  'ringing',
  'in_progress',
  'completed',
  'no_response',
  'failed',
  'cancelled',
]);

const AMBIGUOUS_CALL_STATE = 'unknown';

const DB_LIFECYCLE_STATUSES = new Set([
  'initiated',
  'queued',
  'ringing',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);

const TERMINAL_DB_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const ACTIVE_DB_STATUSES = new Set(['queued', 'initiated', 'ringing', 'in_progress']);

const LIFECYCLE_RANK = Object.freeze({
  queued: 1,
  initiated: 2,
  ringing: 3,
  in_progress: 4,
  completed: 5,
  failed: 5,
  cancelled: 5,
});

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9:._-]{8,120}$/;

function mapperHttpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/**
 * Validates and normalizes `Idempotency-Key` header values (8..120 ASCII safe chars).
 */
function validateIdempotencyKey(rawKey, { required = false } = {}) {
  if (rawKey === undefined || rawKey === null || String(rawKey).trim() === '') {
    if (required) {
      throw mapperHttpError(
        400,
        'invalid_idempotency_key',
        'Idempotency-Key header is required and must be 8-120 ASCII characters'
      );
    }
    return null;
  }

  if (Array.isArray(rawKey)) {
    throw mapperHttpError(
      400,
      'invalid_idempotency_key',
      'Multiple Idempotency-Key headers are not allowed'
    );
  }

  const trimmed = String(rawKey).trim();
  if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) {
    throw mapperHttpError(
      400,
      'invalid_idempotency_key',
      'Idempotency-Key must be 8-120 characters matching [A-Za-z0-9:._-]'
    );
  }

  return trimmed;
}

/**
 * Maps a domain or wire lifecycle state into PostgreSQL `chk_atcl_lifecycle_status`.
 * Notably maps `'initiating'` -> `'initiated'`, `'no_response'` -> `'completed'`,
 * and `'unknown'` -> `'initiated'` (tagged separately via `disposition = 'needs_reconcile'`).
 */
function toDbLifecycleStatus(inputState) {
  const norm = String(inputState || '')
    .trim()
    .toLowerCase();

  if (norm === 'initiating' || norm === 'initiated' || norm === AMBIGUOUS_CALL_STATE) {
    return 'initiated';
  }
  if (norm === 'no_response' || norm === 'completed') {
    return 'completed';
  }
  if (norm === 'queued' || norm === 'ringing' || norm === 'in_progress' || norm === 'failed' || norm === 'cancelled') {
    return norm;
  }

  throw mapperHttpError(
    400,
    'invalid_lifecycle_status',
    `Invalid call lifecycle status: ${inputState}`
  );
}

/**
 * Maps a domain or DB lifecycle state into PostgreSQL `lead_call_status_enum`.
 */
function toLeadCallStatusEnum(
  inputState,
  { answered = false, customerSpoke = false, isScheduled = false, isSuppressed = false } = {}
) {
  if (isSuppressed) return 'suppressed';
  if (isScheduled) return 'scheduled';

  const norm = String(inputState || '')
    .trim()
    .toLowerCase();

  if (norm === 'idle') return 'uncalled';
  if (norm === 'in_progress') return 'speaking';
  if (norm === 'no_response') return 'not_responded';
  if (norm === 'completed') {
    return answered && customerSpoke ? 'completed' : 'not_responded';
  }
  if (norm === 'failed' || norm === 'cancelled') {
    return 'failed';
  }
  if (
    norm === 'queued' ||
    norm === 'initiating' ||
    norm === 'initiated' ||
    norm === 'ringing' ||
    norm === AMBIGUOUS_CALL_STATE
  ) {
    return 'connecting';
  }

  throw mapperHttpError(400, 'invalid_lifecycle_status', `Invalid call state for lead enum: ${inputState}`);
}

/**
 * Maps a persisted `ai_telecalling_call_logs` row back into the authoritative 10-state
 * domain model (plus `'unknown'` when `needs_reconcile` is set per Amendment A1).
 */
function fromDbCallRowToDomainState(row = {}) {
  const rawLifecycle = String(row.call_lifecycle_status || row.callLifecycleStatus || 'initiated')
    .trim()
    .toLowerCase();
  const rawCallStatus = String(row.call_status || row.callStatus || '')
    .trim()
    .toLowerCase();
  const disposition = String(row.disposition || '')
    .trim()
    .toLowerCase();
  const errorDetail = String(row.error_detail || row.errorDetail || '');
  const answered = Boolean(row.answered);
  const customerSpoke = Boolean(row.customer_spoke ?? row.customerSpoke);

  // Pre-dial connect/refusal failures store `call_lifecycle_status = 'cancelled'` +
  // `call_status = 'failed'` + `disposition = 'pre_dial_failed'` so `fn_check_voice_call_eligibility`
  // never burns daily attempts or cooldown without requiring DDL.
  if (disposition === 'pre_dial_failed' || (rawLifecycle === 'cancelled' && rawCallStatus === 'failed')) {
    return {
      domainState: 'failed',
      transportLifecycleStatus: 'failed',
      isTerminal: true,
      needsReconcile: false,
    };
  }

  // Amendment A1: Ambiguous read-timeout after HTTP request sent -> `unknown` (`needsReconcile = true`)
  if (
    !TERMINAL_DB_STATUSES.has(rawLifecycle) &&
    (disposition === 'needs_reconcile' || errorDetail.startsWith('dispatch_timeout_needs_reconcile:'))
  ) {
    return {
      domainState: AMBIGUOUS_CALL_STATE,
      transportLifecycleStatus: AMBIGUOUS_CALL_STATE,
      isTerminal: false,
      needsReconcile: true,
    };
  }

  if (rawLifecycle === 'queued') {
    return {
      domainState: 'queued',
      transportLifecycleStatus: 'queued',
      isTerminal: false,
      needsReconcile: false,
    };
  }

  if (rawLifecycle === 'initiated' || rawLifecycle === 'initiating') {
    return {
      domainState: 'initiating',
      transportLifecycleStatus: 'initiating',
      isTerminal: false,
      needsReconcile: false,
    };
  }

  if (rawLifecycle === 'ringing') {
    return {
      domainState: 'ringing',
      transportLifecycleStatus: 'ringing',
      isTerminal: false,
      needsReconcile: false,
    };
  }

  if (rawLifecycle === 'in_progress') {
    return {
      domainState: 'in_progress',
      transportLifecycleStatus: 'in_progress',
      isTerminal: false,
      needsReconcile: false,
    };
  }

  if (rawLifecycle === 'completed') {
    const engaged = answered && customerSpoke && rawCallStatus !== 'not_responded';
    return {
      domainState: engaged ? 'completed' : 'no_response',
      transportLifecycleStatus: 'completed',
      isTerminal: true,
      needsReconcile: false,
    };
  }

  if (rawLifecycle === 'failed') {
    return {
      domainState: 'failed',
      transportLifecycleStatus: 'failed',
      isTerminal: true,
      needsReconcile: false,
    };
  }

  if (rawLifecycle === 'cancelled') {
    return {
      domainState: 'cancelled',
      transportLifecycleStatus: 'cancelled',
      isTerminal: true,
      needsReconcile: false,
    };
  }

  return {
    domainState: 'initiating',
    transportLifecycleStatus: 'initiating',
    isTerminal: false,
    needsReconcile: false,
  };
}

/**
 * Validates state transitions:
 * - Terminal states (`completed`, `failed`, `cancelled`) are strictly immutable.
 * - Non-terminal states can only stay in the same rank (e.g. partial transcript updates)
 *   or advance forward (`queued` -> `initiated` -> `ringing` -> `in_progress` -> terminal).
 */
function validateLifecycleTransition(currentDbStatus, nextInputState, { currentDisposition = null } = {}) {
  const nextDbStatus = toDbLifecycleStatus(nextInputState);
  const currNorm = String(currentDbStatus || 'initiated')
    .trim()
    .toLowerCase();

  if (TERMINAL_DB_STATUSES.has(currNorm)) {
    const isPreDialFailed =
      currNorm === 'cancelled' && String(currentDisposition || '').toLowerCase() === 'pre_dial_failed';
    const effectiveCurr = isPreDialFailed ? 'failed' : currNorm;
    if (effectiveCurr === nextDbStatus) {
      return {
        allowed: false,
        idempotentNoop: true,
        reason: 'already_in_terminal_state',
        nextDbStatus,
      };
    }
    return {
      allowed: false,
      idempotentNoop: false,
      reason: 'terminal_state_immutable',
      nextDbStatus,
    };
  }

  const currRank = LIFECYCLE_RANK[currNorm] || LIFECYCLE_RANK.initiated;
  const nextRank = LIFECYCLE_RANK[nextDbStatus];

  if (nextRank < currRank) {
    return {
      allowed: false,
      idempotentNoop: false,
      reason: 'backward_lifecycle_transition',
      nextDbStatus,
    };
  }

  return {
    allowed: true,
    idempotentNoop: false,
    sameState: nextRank === currRank,
    reason: null,
    nextDbStatus,
  };
}

function isMockProviderCallId(providerCallId) {
  return Boolean(
    providerCallId &&
      String(providerCallId)
        .trim()
        .toLowerCase()
        .startsWith('mock-')
  );
}

module.exports = {
  DOMAIN_CALL_STATES,
  AMBIGUOUS_CALL_STATE,
  DB_LIFECYCLE_STATUSES,
  TERMINAL_DB_STATUSES,
  ACTIVE_DB_STATUSES,
  validateIdempotencyKey,
  toDbLifecycleStatus,
  toLeadCallStatusEnum,
  fromDbCallRowToDomainState,
  validateLifecycleTransition,
  isMockProviderCallId,
};


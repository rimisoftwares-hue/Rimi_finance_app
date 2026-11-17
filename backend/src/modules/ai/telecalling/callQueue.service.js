'use strict';

/**
 * Persistent Multi-Customer Manual Call Queue Service (`callQueue.service.js`)
 *
 * Implements explicit user-confirmed batch calling (`POST /api/ai/calls/queue`)
 * backed by PostgreSQL `voice_outbox_events` (`aggregate_type = 'manual_call_queue_item'`).
 *
 * Guarantees:
 *   1. Zero-Trust payload validation (`{ customerIds }` ONLY; max 50 UUIDs per batch).
 *   2. Strict tenant isolation (`finance_id` from authenticated middleware ONLY).
 *   3. Duplicate guard (within batch + skips customers already `pending` or `processing`).
 *   4. Sequential execution by default (`manual_queue_concurrency = 1`), waiting for
 *      the active call to reach a terminal lifecycle state before dialing the next customer.
 *   5. Just-In-Time (JIT) server-side eligibility re-verification via `aiService.initiateManualCustomerCall`
 *      at the exact moment each item is popped (paid / DNC / seized / outside IST window -> cancelled, next dialed).
 *   6. Crash-safe lease recovery (`lock_expires_at`) without double-dialing live calls.
 *   7. Exponential backoff (`15s`, `30s`) on transient `503` Voice Agent errors, then `failed` + advance.
 *
 * NOTE: Never place a literal question-mark character inside any SQL string or comment
 * because `database.config.js` rewrites question marks into positional parameters.
 */

const crypto = require('node:crypto');
const os = require('node:os');
const { db } = require('../../../config/database.config');
const aiService = require('./ai.service');
const { validateIdempotencyKey } = require('./callLifecycle.mapper');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 50;
const DEFAULT_MAX_ATTEMPTS = 2;
const CLAIM_LEASE_MS = 90 * 1000;
const LIVE_CALL_MAX_AGE_MS = 10 * 60 * 1000;
const BASE_BACKOFF_MS = 15 * 1000;
const WORKER_POLL_INTERVAL_MS = 2500;

const PERMANENT_SKIP_CODES = new Set([
  'no_overdue_balance',
  'outside_calling_window',
  'suppressed_dnc',
  'loan_closed',
  'vehicle_seized',
  'max_daily_attempts_reached',
  'cooldown_active',
  'invalid_phone_number',
  'customer_not_found',
  'call_already_in_progress',
]);

const activeTenantTimers = new Map();

function httpError(statusCode, code, message, details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function getLogicalQueueStatus(row) {
  if (row?.payload?.queue_status) {
    return String(row.payload.queue_status);
  }
  if (row?.status === 'published') return 'completed';
  if (row?.status === 'dead_letter') return 'failed';
  return String(row?.status || 'pending');
}

function mapQueueItemForResponse(row) {
  const payload = row.payload || {};
  const status = getLogicalQueueStatus(row);
  return {
    id: row.id,
    batchId: payload.batch_id || null,
    customerId: row.aggregate_id,
    customerName: row.customer_name || payload.customer_name || 'Customer',
    hplno: row.hplno ?? payload.hplno ?? null,
    queuePosition: Number(payload.queue_position || 1),
    totalInBatch: Number(payload.total_in_batch || 1),
    status,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || DEFAULT_MAX_ATTEMPTS),
    callId: payload.call_id || null,
    callLifecycleStatus: row.call_log_status || (payload.call_id && status === 'processing' ? 'initiated' : null),
    callOutcome: payload.call_outcome || row.call_log_disposition || null,
    skipReason: payload.skip_reason || null,
    lastError: row.last_error || null,
    createdAt: row.created_at || payload.enqueued_at || null,
    processedAt: row.processed_at || payload.completed_at || null,
  };
}

function summarizeBatchRows(batchId, rows) {
  const items = rows
    .slice()
    .sort((a, b) => Number(a.payload?.queue_position || 0) - Number(b.payload?.queue_position || 0))
    .map(mapQueueItemForResponse);

  let pendingCount = 0;
  let processingCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;

  for (const item of items) {
    if (item.status === 'pending') pendingCount += 1;
    else if (item.status === 'processing') processingCount += 1;
    else if (item.status === 'completed') completedCount += 1;
    else if (item.status === 'failed') failedCount += 1;
    else if (item.status === 'cancelled') cancelledCount += 1;
  }

  const totalItems = items.length;
  const activeItem =
    items.find((i) => i.status === 'processing') ||
    items.find((i) => i.status === 'pending') ||
    null;

  let batchStatus = 'completed';
  if (processingCount > 0) {
    batchStatus = 'in_progress';
  } else if (pendingCount > 0) {
    batchStatus = completedCount + failedCount + cancelledCount > 0 ? 'in_progress' : 'queued';
  } else if (totalItems > 0 && cancelledCount === totalItems) {
    batchStatus = 'cancelled';
  } else if (totalItems > 0 && failedCount === totalItems) {
    batchStatus = 'failed';
  }

  return {
    batchId,
    status: batchStatus,
    totalItems,
    pendingCount,
    processingCount,
    completedCount,
    failedCount,
    cancelledCount,
    doneCount: completedCount + failedCount + cancelledCount,
    currentPosition: activeItem ? activeItem.queuePosition : totalItems,
    activeCustomerName: activeItem ? activeItem.customerName : null,
    activeCallId: activeItem ? activeItem.callId : null,
    items,
  };
}

async function fetchOutboxQueueRows(runner, financeId, batchId = null) {
  if (batchId) {
    const { rows } = await runner.query(
      `SELECT
         voe.id,
         voe.finance_id,
         voe.aggregate_type,
         voe.aggregate_id,
         voe.event_type,
         voe.payload,
         voe.status,
         voe.attempt_count,
         voe.max_attempts,
         voe.next_retry_at,
         voe.locked_by,
         voe.lock_expires_at,
         voe.last_error,
         voe.idempotency_key,
         voe.created_at,
         voe.processed_at,
         c.cname AS customer_name,
         c.hplno AS hplno,
         COALESCE(cl.call_lifecycle_status, cl.call_status::text) AS call_log_status,
         COALESCE(cl.answered, FALSE) AS call_log_answered,
         COALESCE(cl.customer_spoke, FALSE) AS call_log_spoke,
         COALESCE(vcs.outcome, cl.disposition) AS call_log_disposition
       FROM voice_outbox_events voe
       LEFT JOIN customers c
         ON c.id = voe.aggregate_id
        AND c.finance_id = voe.finance_id
       LEFT JOIN ai_telecalling_call_logs cl
         ON cl.finance_id = voe.finance_id
        AND (voe.payload->>'call_id') IS NOT NULL
        AND cl.id::text = (voe.payload->>'call_id')
       LEFT JOIN LATERAL (
         SELECT s.outcome
           FROM voice_call_summaries s
          WHERE s.finance_id = voe.finance_id
            AND s.call_log_id = cl.id
            AND COALESCE(s.is_superseded, FALSE) = FALSE
          ORDER BY s.created_at DESC
          LIMIT 1
       ) vcs ON TRUE
      WHERE voe.finance_id = $1::uuid
        AND voe.aggregate_type = 'manual_call_queue_item'
        AND voe.payload->>'batch_id' = $2
      ORDER BY voe.created_at ASC`,
      [financeId, batchId]
    );
    return rows;
  }

  const { rows } = await runner.query(
    `SELECT
       voe.id,
       voe.finance_id,
       voe.aggregate_type,
       voe.aggregate_id,
       voe.event_type,
       voe.payload,
       voe.status,
       voe.attempt_count,
       voe.max_attempts,
       voe.next_retry_at,
       voe.locked_by,
       voe.lock_expires_at,
       voe.last_error,
       voe.idempotency_key,
       voe.created_at,
       voe.processed_at,
       c.cname AS customer_name,
       c.hplno AS hplno,
       COALESCE(cl.call_lifecycle_status, cl.call_status::text) AS call_log_status,
       COALESCE(cl.answered, FALSE) AS call_log_answered,
       COALESCE(cl.customer_spoke, FALSE) AS call_log_spoke,
       COALESCE(vcs.outcome, cl.disposition) AS call_log_disposition
     FROM voice_outbox_events voe
     LEFT JOIN customers c
       ON c.id = voe.aggregate_id
      AND c.finance_id = voe.finance_id
     LEFT JOIN ai_telecalling_call_logs cl
       ON cl.finance_id = voe.finance_id
      AND (voe.payload->>'call_id') IS NOT NULL
      AND cl.id::text = (voe.payload->>'call_id')
     LEFT JOIN LATERAL (
       SELECT s.outcome
         FROM voice_call_summaries s
        WHERE s.finance_id = voe.finance_id
          AND s.call_log_id = cl.id
          AND COALESCE(s.is_superseded, FALSE) = FALSE
        ORDER BY s.created_at DESC
        LIMIT 1
     ) vcs ON TRUE
    WHERE voe.finance_id = $1::uuid
      AND voe.aggregate_type = 'manual_call_queue_item'
      AND voe.created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY voe.created_at ASC`,
    [financeId]
  );
  return rows;
}

async function updateOutboxQueueRow(runner, financeId, row, updates) {
  const nextDbStatus = updates.dbStatus || row.status;
  const nextPayload = updates.payload || row.payload || {};
  const nextAttemptCount = updates.attemptCount ?? Number(row.attempt_count || 0);
  const nextLockedBy = updates.lockedBy !== undefined ? updates.lockedBy : row.locked_by;
  const nextLockExpiresAt = updates.lockExpiresAt !== undefined ? updates.lockExpiresAt : row.lock_expires_at;
  const nextRetryAt = updates.nextRetryAt || row.next_retry_at || new Date().toISOString();
  const nextLastError = updates.lastError !== undefined ? updates.lastError : row.last_error;

  const { rows } = await runner.query(
    `UPDATE voice_outbox_events
        SET status = $3,
            payload = $4::jsonb,
            attempt_count = $5::int,
            locked_by = $6,
            lock_expires_at = $7::timestamptz,
            next_retry_at = $8::timestamptz,
            last_error = $9,
            processed_at = CASE WHEN $3 IN ('published', 'dead_letter') THEN NOW() ELSE processed_at END
      WHERE finance_id = $1::uuid
        AND id = $2::uuid
      RETURNING *`,
    [
      financeId,
      row.id,
      nextDbStatus,
      JSON.stringify(nextPayload),
      nextAttemptCount,
      nextLockedBy,
      nextLockExpiresAt,
      nextRetryAt,
      nextLastError,
    ]
  );
  return rows[0] || null;
}

/**
 * Enqueue an explicit user-confirmed multi-customer call batch (`POST /api/ai/calls/queue`).
 */
async function enqueueManualCallBatch(financeId, body, opts = {}) {
  const runner = opts.queryRunner || db;

  if (!financeId || !UUID_RE.test(String(financeId))) {
    throw httpError(401, 'missing_tenant', 'Missing or invalid tenant financeId');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_payload', 'Request body must be a JSON object with customerIds');
  }

  const extraKeys = Object.keys(body).filter((k) => k !== 'customerIds');
  if (extraKeys.length > 0) {
    throw httpError(
      400,
      'untrusted_client_fields',
      `Untrusted client fields rejected: ${extraKeys.join(', ')}. Send only { customerIds }.`
    );
  }

  if (!Array.isArray(body.customerIds) || body.customerIds.length === 0) {
    throw httpError(400, 'empty_customer_ids', 'Select at least one customer to start a queue call');
  }
  if (body.customerIds.length > MAX_BATCH_SIZE) {
    throw httpError(
      400,
      'batch_too_large',
      `A manual call batch cannot exceed ${MAX_BATCH_SIZE} customers at once`
    );
  }

  const uniqueRequestedIds = [];
  const seen = new Set();
  for (const rawId of body.customerIds) {
    const id = String(rawId || '').trim();
    if (!UUID_RE.test(id)) {
      throw httpError(400, 'invalid_customer_id', `Invalid customer UUID: ${id}`);
    }
    if (!seen.has(id)) {
      seen.add(id);
      uniqueRequestedIds.push(id);
    }
  }

  const batchIdemKey = validateIdempotencyKey(opts.idempotencyKey, {
    required: Boolean(opts.requireIdempotencyKey),
  });

  if (batchIdemKey) {
    const { rows: existingReceiptRows } = await runner.query(
      `SELECT id, finance_id, aggregate_type, aggregate_id, payload, status, idempotency_key, created_at
         FROM voice_outbox_events
        WHERE finance_id = $1::uuid
          AND idempotency_key = $2
        LIMIT 1`,
      [financeId, batchIdemKey]
    );

    if (existingReceiptRows.length > 0) {
      const receipt = existingReceiptRows[0];
      const prevIds = Array.isArray(receipt.payload?.request_customer_ids)
        ? receipt.payload.request_customer_ids.map(String)
        : [];
      const samePayload =
        prevIds.length === uniqueRequestedIds.length &&
        prevIds.every((id, idx) => id === uniqueRequestedIds[idx]);

      if (!samePayload) {
        throw httpError(
          422,
          'idempotency_key_payload_mismatch',
          'Idempotency-Key has already been used for a different customerIds batch payload'
        );
      }

      const existingBatchId = String(receipt.payload?.batch_id || receipt.aggregate_id);
      const batchRows = await fetchOutboxQueueRows(runner, financeId, existingBatchId);
      const replaySummary = summarizeBatchRows(existingBatchId, batchRows);
      return {
        ...replaySummary,
        skippedAlreadyQueued: receipt.payload?.skipped_already_queued || [],
        idempotencyReplay: true,
      };
    }
  }

  // Verify every customer belongs to this tenant
  const { rows: customerRows } = await runner.query(
    `SELECT c.id, c.cname, c.hplno
       FROM customers c
      WHERE c.finance_id = $1::uuid
        AND c.id = ANY($2::uuid[])`,
    [financeId, uniqueRequestedIds]
  );
  const customerMap = new Map(customerRows.map((c) => [String(c.id), c]));
  for (const cid of uniqueRequestedIds) {
    if (!customerMap.has(cid)) {
      throw httpError(404, 'customer_not_found', `Customer ${cid} not found in current tenant`);
    }
  }

  // Check active (`pending` or `processing`) queue items for this tenant so we never double-queue
  const existingRows = await fetchOutboxQueueRows(runner, financeId, null);
  const activeCustomerSet = new Set(
    existingRows
      .filter((r) => r.status === 'pending' || r.status === 'processing')
      .map((r) => String(r.aggregate_id))
  );

  const skippedAlreadyQueued = [];
  const toEnqueue = [];
  for (const cid of uniqueRequestedIds) {
    if (activeCustomerSet.has(cid)) {
      skippedAlreadyQueued.push(cid);
    } else {
      toEnqueue.push(cid);
    }
  }

  const batchId = opts.batchId && UUID_RE.test(String(opts.batchId)) ? String(opts.batchId) : crypto.randomUUID();
  const maxAttempts = Math.max(1, Math.min(5, Number(opts.maxAttempts || DEFAULT_MAX_ATTEMPTS)));
  const nowIso = new Date(Number.isFinite(runner.nowMs) ? runner.nowMs : Date.now()).toISOString();

  if (batchIdemKey) {
    const receiptPayload = {
      batch_id: batchId,
      request_customer_ids: uniqueRequestedIds,
      skipped_already_queued: skippedAlreadyQueued,
      requested_by: opts.userId || null,
      created_at: nowIso,
    };
    try {
      await runner.query(
        `INSERT INTO voice_outbox_events (
           finance_id,
           aggregate_type,
           aggregate_id,
           event_type,
           payload,
           status,
           attempt_count,
           max_attempts,
           next_retry_at,
           idempotency_key
         ) VALUES (
           $1::uuid,
           'manual_call_queue_batch',
           $2::uuid,
           'manual_queue_batch_created',
           $3::jsonb,
           'published',
           0,
           $4::int,
           NOW(),
           $5
         )`,
        [financeId, batchId, JSON.stringify(receiptPayload), 1, batchIdemKey]
      );
    } catch (dupErr) {
      if (dupErr && dupErr.code === '23505') {
        const { rows: raced } = await runner.query(
          `SELECT id, finance_id, aggregate_type, aggregate_id, payload, status, idempotency_key, created_at
             FROM voice_outbox_events
            WHERE finance_id = $1::uuid
              AND idempotency_key = $2
            LIMIT 1`,
          [financeId, batchIdemKey]
        );
        if (raced.length > 0) {
          const prevIds = Array.isArray(raced[0].payload?.request_customer_ids)
            ? raced[0].payload.request_customer_ids.map(String)
            : [];
          const samePayload =
            prevIds.length === uniqueRequestedIds.length &&
            prevIds.every((id, idx) => id === uniqueRequestedIds[idx]);
          if (!samePayload) {
            throw httpError(
              422,
              'idempotency_key_payload_mismatch',
              'Idempotency-Key has already been used for a different customerIds batch payload'
            );
          }
          const existingBatchId = String(raced[0].payload?.batch_id || raced[0].aggregate_id);
          const batchRows = await fetchOutboxQueueRows(runner, financeId, existingBatchId);
          const replaySummary = summarizeBatchRows(existingBatchId, batchRows);
          return {
            ...replaySummary,
            skippedAlreadyQueued: raced[0].payload?.skipped_already_queued || [],
            idempotencyReplay: true,
          };
        }
      }
      throw dupErr;
    }
  }

  const insertedRows = [];
  for (let idx = 0; idx < toEnqueue.length; idx += 1) {
    const cid = toEnqueue[idx];
    const cust = customerMap.get(cid);
    const payload = {
      batch_id: batchId,
      queue_position: idx + 1,
      total_in_batch: toEnqueue.length,
      queue_status: 'pending',
      customer_name: cust?.cname || 'Customer',
      hplno: cust?.hplno ?? null,
      requested_by: opts.userId || null,
      call_id: null,
      call_outcome: null,
      skip_reason: null,
      enqueued_at: nowIso,
    };
    const idemKey = `mqueue:${batchId}:${cid}`;

    const { rows } = await runner.query(
      `INSERT INTO voice_outbox_events (
         finance_id,
         aggregate_type,
         aggregate_id,
         event_type,
         payload,
         status,
         attempt_count,
         max_attempts,
         next_retry_at,
         idempotency_key
       ) VALUES (
         $1::uuid,
         'manual_call_queue_item',
         $2::uuid,
         'manual_queue_dial',
         $3::jsonb,
         'pending',
         0,
         $4::int,
         NOW(),
         $5
       )
       ON CONFLICT (finance_id, idempotency_key)
       DO UPDATE SET payload = voice_outbox_events.payload
       RETURNING *`,
      [financeId, cid, JSON.stringify(payload), maxAttempts, idemKey]
    );
    if (rows[0]) {
      insertedRows.push({
        ...rows[0],
        customer_name: cust?.cname || 'Customer',
        hplno: cust?.hplno ?? null,
      });
    }
  }

  if (insertedRows.length > 0 && !opts.skipAutoStartWorker && process.env.NODE_ENV !== 'test') {
    startQueueWorkerIfNeeded(financeId);
    // Kick off first tick asynchronously so customer #1 dials immediately
    setImmediate(() => {
      processTenantQueueTick(financeId).catch((err) => {
        console.error(`[CallQueue] Initial tick error for tenant ${financeId}:`, err.message);
      });
    });
  }

  const summary = summarizeBatchRows(batchId, insertedRows);
  return {
    ...summary,
    skippedAlreadyQueued,
    idempotencyReplay: false,
  };
}

/**
 * Execute one deterministic reconciliation + dispatch tick for a tenant's manual call queue.
 */
async function processTenantQueueTick(financeId, opts = {}) {
  const runner = opts.queryRunner || db;
  const initiateCallFn =
    opts.initiateCallFn ||
    ((fid, body, callOpts) => aiService.initiateManualCustomerCall(fid, body, callOpts));
  const workerId = opts.workerId || `rimi-queue-${os.hostname()}-${process.pid}`;

  const { rows: settingRows } = await runner.query(
    `SELECT voice_config
       FROM ai_settings
      WHERE finance_id = $1::uuid
      LIMIT 1`,
    [financeId]
  );
  const maxConcurrency = Math.max(
    1,
    Math.min(3, Number(settingRows[0]?.voice_config?.manual_queue_concurrency || 1))
  );

  // Loop allows immediate advancement to customer k+1 in the same tick when customer k
  // finishes, is skipped for JIT ineligibility, or exhausts retries.
  for (let step = 0; step < 10; step += 1) {
    const nowMs = Number.isFinite(runner.nowMs) ? runner.nowMs : Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const rows = await fetchOutboxQueueRows(runner, financeId, null);

    let activeInFlight = 0;
    let stateChanged = false;

    for (const row of rows) {
      if (row.status !== 'processing') continue;
      const payload = row.payload || {};

      if (payload.call_id) {
        const callStatus = row.call_log_status ? String(row.call_log_status) : null;
        if (callStatus === 'completed' || callStatus === 'no_answer' || callStatus === 'busy') {
          const isNoResponse =
            callStatus === 'no_answer' ||
            callStatus === 'busy' ||
            row.call_log_disposition === 'no_answer' ||
            row.call_log_disposition === 'busy';
          const outcome = isNoResponse
            ? 'no_response'
            : row.call_log_disposition ||
              (row.call_log_answered && row.call_log_spoke ? 'completed_general' : 'no_response');

          await updateOutboxQueueRow(runner, financeId, row, {
            dbStatus: 'published',
            payload: {
              ...payload,
              queue_status: 'completed',
              call_outcome: outcome,
              completed_at: nowIso,
            },
            lockedBy: null,
            lockExpiresAt: null,
          });
          stateChanged = true;
        } else if (callStatus === 'failed' || callStatus === 'cancelled') {
          const isCancelled = callStatus === 'cancelled';
          await updateOutboxQueueRow(runner, financeId, row, {
            dbStatus: isCancelled ? 'published' : 'dead_letter',
            payload: {
              ...payload,
              queue_status: isCancelled ? 'cancelled' : 'failed',
              completed_at: nowIso,
            },
            lockedBy: null,
            lockExpiresAt: null,
            lastError: row.last_error || `Call ended with status ${callStatus}`,
          });
          stateChanged = true;
        } else {
          // Check stale hung call lease (> 10 minutes)
          const lockExpMs = row.lock_expires_at ? new Date(row.lock_expires_at).getTime() : nowMs + LIVE_CALL_MAX_AGE_MS;
          if (lockExpMs <= nowMs) {
            await updateOutboxQueueRow(runner, financeId, row, {
              dbStatus: 'dead_letter',
              payload: {
                ...payload,
                queue_status: 'failed',
                completed_at: nowIso,
              },
              lockedBy: null,
              lockExpiresAt: null,
              lastError: 'Live call lease timed out after 10 minutes without webhook completion',
            });
            stateChanged = true;
          } else {
            activeInFlight += 1;
          }
        }
      } else {
        // Processing row WITHOUT call_id -> check if claiming worker crashed before saving call_id
        const lockExpMs = row.lock_expires_at ? new Date(row.lock_expires_at).getTime() : 0;
        if (!lockExpMs || lockExpMs <= nowMs) {
          await updateOutboxQueueRow(runner, financeId, row, {
            dbStatus: 'pending',
            payload: {
              ...payload,
              queue_status: 'pending',
            },
            lockedBy: null,
            lockExpiresAt: null,
          });
          stateChanged = true;
        } else {
          activeInFlight += 1;
        }
      }
    }

    if (stateChanged) {
      // Reload fresh state before deciding next dispatch
      continue;
    }

    if (activeInFlight >= maxConcurrency) {
      break;
    }

    // Pick lowest-order pending item whose next_retry_at <= nowMs
    const pendingCandidates = rows
      .filter((r) => {
        if (r.status !== 'pending') return false;
        const retryMs = r.next_retry_at ? new Date(r.next_retry_at).getTime() : 0;
        return retryMs <= nowMs;
      })
      .sort((a, b) => {
        const tDiff = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        if (tDiff !== 0) return tDiff;
        return Number(a.payload?.queue_position || 0) - Number(b.payload?.queue_position || 0);
      });

    const nextRow = pendingCandidates[0];
    if (!nextRow) {
      break;
    }

    const nextAttempt = Number(nextRow.attempt_count || 0) + 1;
    const maxAttempts = Number(nextRow.max_attempts || DEFAULT_MAX_ATTEMPTS);
    const payload = nextRow.payload || {};

    await updateOutboxQueueRow(runner, financeId, nextRow, {
      dbStatus: 'processing',
      payload: {
        ...payload,
        queue_status: 'processing',
      },
      attemptCount: nextAttempt,
      lockedBy: workerId,
      lockExpiresAt: new Date(nowMs + CLAIM_LEASE_MS).toISOString(),
    });

    try {
      const callResult = await initiateCallFn(
        financeId,
        { customerId: nextRow.aggregate_id },
        {
          userId: payload.requested_by || null,
          idempotencyKey: `qcall:${nextRow.id}:a${nextAttempt}`,
        }
      );
      const callId = callResult?.callId || callResult?.call?.id || null;

      await updateOutboxQueueRow(runner, financeId, nextRow, {
        dbStatus: 'processing',
        payload: {
          ...payload,
          queue_status: 'processing',
          call_id: callId,
          started_at: nowIso,
        },
        attemptCount: nextAttempt,
        lockedBy: workerId,
        lockExpiresAt: new Date(nowMs + LIVE_CALL_MAX_AGE_MS).toISOString(),
        lastError: null,
      });

      activeInFlight += 1;
      if (activeInFlight >= maxConcurrency) {
        break;
      }
    } catch (err) {
      const statusCode = Number(err.statusCode || 500);

      // Amendment A1: Ambiguous read timeout (`504 dispatch_timeout_ambiguous`) MUST NEVER auto-retry!
      if (err.code === 'dispatch_timeout_ambiguous' || statusCode === 504) {
        const ambiguousCallId = err.details?.callId || null;
        if (ambiguousCallId) {
          await updateOutboxQueueRow(runner, financeId, nextRow, {
            dbStatus: 'processing',
            payload: {
              ...payload,
              queue_status: 'processing',
              call_id: ambiguousCallId,
              needs_reconcile: true,
              started_at: nowIso,
            },
            attemptCount: maxAttempts,
            lockedBy: workerId,
            lockExpiresAt: new Date(nowMs + LIVE_CALL_MAX_AGE_MS).toISOString(),
            lastError: err.message,
          });
          activeInFlight += 1;
          if (activeInFlight >= maxConcurrency) {
            break;
          }
          continue;
        }

        await updateOutboxQueueRow(runner, financeId, nextRow, {
          dbStatus: 'dead_letter',
          payload: {
            ...payload,
            queue_status: 'failed',
            needs_reconcile: true,
            completed_at: nowIso,
          },
          attemptCount: maxAttempts,
          lockedBy: null,
          lockExpiresAt: null,
          lastError: err.message,
        });
        continue;
      }

      const isPermanentSkip =
        PERMANENT_SKIP_CODES.has(err.code) || [400, 403, 404, 409, 422].includes(statusCode);

      if (isPermanentSkip) {
        await updateOutboxQueueRow(runner, financeId, nextRow, {
          dbStatus: 'published',
          payload: {
            ...payload,
            queue_status: 'cancelled',
            skip_reason: err.code || 'ineligible',
            completed_at: nowIso,
          },
          attemptCount: nextAttempt,
          lockedBy: null,
          lockExpiresAt: null,
          lastError: err.message,
        });
        // Immediately advance to next customer in queue
        continue;
      }

      if (nextAttempt < maxAttempts) {
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, nextAttempt - 1);
        await updateOutboxQueueRow(runner, financeId, nextRow, {
          dbStatus: 'pending',
          payload: {
            ...payload,
            queue_status: 'pending',
          },
          attemptCount: nextAttempt,
          lockedBy: null,
          lockExpiresAt: null,
          nextRetryAt: new Date(nowMs + backoffMs).toISOString(),
          lastError: err.message,
        });
        // Preserve sequential order while waiting for retry window
        break;
      }

      // Retries exhausted -> mark failed (`dead_letter`) and advance immediately to next customer
      await updateOutboxQueueRow(runner, financeId, nextRow, {
        dbStatus: 'dead_letter',
        payload: {
          ...payload,
          queue_status: 'failed',
          completed_at: nowIso,
        },
        attemptCount: nextAttempt,
        lockedBy: null,
        lockExpiresAt: null,
        lastError: err.message,
      });
    }
  }

  const finalRows = await fetchOutboxQueueRows(runner, financeId, null);
  let pendingCount = 0;
  let processingCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;

  for (const r of finalRows) {
    const st = getLogicalQueueStatus(r);
    if (st === 'pending') pendingCount += 1;
    else if (st === 'processing') processingCount += 1;
    else if (st === 'completed') completedCount += 1;
    else if (st === 'failed') failedCount += 1;
    else if (st === 'cancelled') cancelledCount += 1;
  }

  return {
    pendingCount,
    processingCount,
    completedCount,
    failedCount,
    cancelledCount,
    hasActiveItems: pendingCount + processingCount > 0,
  };
}

/**
 * Retrieve the active (or specified `batchId`) manual call queue status (`GET /api/ai/calls/queue/active`).
 * Also triggers a lightweight non-blocking reconciliation tick when active items exist.
 */
async function getActiveQueueStatus(financeId, opts = {}) {
  const runner = opts.queryRunner || db;
  const requestedBatchId = opts.batchId && UUID_RE.test(String(opts.batchId)) ? String(opts.batchId) : null;

  if (opts.reconcileOnRead && process.env.NODE_ENV !== 'test') {
    try {
      await processTenantQueueTick(financeId, { queryRunner: runner });
    } catch (err) {
      console.warn(`[CallQueue] Reconcile-on-read warning for tenant ${financeId}:`, err.message);
    }
  }

  if (requestedBatchId) {
    const batchRows = await fetchOutboxQueueRows(runner, financeId, requestedBatchId);
    if (batchRows.length === 0) {
      return { active: false, batch: null };
    }
    const batch = summarizeBatchRows(requestedBatchId, batchRows);
    return {
      active: batch.pendingCount + batch.processingCount > 0,
      batch,
    };
  }

  const allRows = await fetchOutboxQueueRows(runner, financeId, null);
  if (allRows.length === 0) {
    return { active: false, batch: null };
  }

  // Group by batch_id preserving chronological order; return the latest active batch (or latest recent batch)
  const byBatch = new Map();
  for (const r of allRows) {
    const bid = r.payload?.batch_id;
    if (!bid) continue;
    if (!byBatch.has(bid)) byBatch.set(bid, []);
    byBatch.get(bid).push(r);
  }

  let latestActiveSummary = null;
  let latestAnySummary = null;
  for (const [bid, bRows] of byBatch.entries()) {
    const summary = summarizeBatchRows(bid, bRows);
    latestAnySummary = summary;
    if (summary.pendingCount + summary.processingCount > 0) {
      latestActiveSummary = summary;
    }
  }

  const chosen = latestActiveSummary || latestAnySummary;
  if (!chosen) {
    return { active: false, batch: null };
  }

  return {
    active: chosen.pendingCount + chosen.processingCount > 0,
    batch: chosen,
  };
}

/**
 * Cancel all remaining `pending` items in a batch (`POST /api/ai/calls/queue/:batchId/cancel`)
 * without killing an already live `processing` call.
 */
async function cancelQueueBatch(financeId, batchId, opts = {}) {
  const runner = opts.queryRunner || db;
  if (!batchId || !UUID_RE.test(String(batchId))) {
    throw httpError(400, 'invalid_batch_id', 'Invalid queue batchId UUID');
  }

  const nowIso = new Date(Number.isFinite(runner.nowMs) ? runner.nowMs : Date.now()).toISOString();
  const patchPayload = {
    queue_status: 'cancelled',
    skip_reason: 'cancelled_by_user',
    cancelled_by: opts.userId || null,
    completed_at: nowIso,
  };

  const { rows: updated } = await runner.query(
    `UPDATE voice_outbox_events
        SET status = 'published',
            payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb,
            locked_by = NULL,
            lock_expires_at = NULL,
            processed_at = NOW()
      WHERE finance_id = $1::uuid
        AND aggregate_type = 'manual_call_queue_item'
        AND payload->>'batch_id' = $2
        AND status = 'pending'
      RETURNING *`,
    [financeId, batchId, JSON.stringify(patchPayload)]
  );

  const batchRows = await fetchOutboxQueueRows(runner, financeId, batchId);
  return {
    batchId,
    cancelledCount: updated.length,
    batch: batchRows.length > 0 ? summarizeBatchRows(batchId, batchRows) : null,
  };
}

/**
 * Per-tenant background interval worker that automatically stops itself once all items
 * in the tenant's queue reach a terminal state (zero idle polling overhead).
 */
function startQueueWorkerIfNeeded(financeId) {
  if (!financeId || activeTenantTimers.has(financeId)) {
    return;
  }

  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const res = await processTenantQueueTick(financeId);
      if (!res.hasActiveItems) {
        clearInterval(timer);
        activeTenantTimers.delete(financeId);
      }
    } catch (err) {
      console.error(`[CallQueue] Worker tick failed for tenant ${financeId}:`, err.message);
    } finally {
      running = false;
    }
  }, WORKER_POLL_INTERVAL_MS);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  activeTenantTimers.set(financeId, timer);
}

function stopAllQueueWorkers() {
  for (const [, timer] of activeTenantTimers.entries()) {
    clearInterval(timer);
  }
  activeTenantTimers.clear();
}

module.exports = {
  enqueueManualCallBatch,
  processTenantQueueTick,
  getActiveQueueStatus,
  cancelQueueBatch,
  startQueueWorkerIfNeeded,
  stopAllQueueWorkers,
};


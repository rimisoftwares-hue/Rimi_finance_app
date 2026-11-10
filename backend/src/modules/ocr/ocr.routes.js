'use strict';

/**
 * OCR API (mounted at /api/ocr behind enhancedCheckFinance).
 * Every query is scoped by finance_id = req.financeId. s3_key / s3_bucket are never returned.
 * Role rule: same as creating a customer (POST /customers), i.e. any authenticated user
 * with a valid finance context.
 */

const express = require('express');
const { db } = require('../../config/database.config');
const { getOcrConfig, ALLOWED_MIME } = require('./ocr.config');
const { OcrError, hasApiKey, ensureModelVerified, getModelState, extractLedger } = require('./gemini.service');
const { parseModelOutput, sanitizeExtraction, mergeJobExtractions } = require('./ocr.sanitizer');
const {
  buildOcrKey,
  presignPut,
  putOcrObject,
  headObject,
  deleteOcrObject,
  cacheJobBuffer,
  clearCachedJobBuffer,
} = require('./ocr.s3');
const { wake, refreshBatchStatus, detectImageMime, looksComplete, readImageHeader } = require('./ocr.worker');

let sharpLib = null;
try {
  sharpLib = require('sharp');
} catch {
  sharpLib = null;
}

const setSharpForTest = (customSharp) => {
  sharpLib = customSharp;
};

const router = express.Router();

const DIRECT_ROUTE_TIMEOUT_MS = 90000;

// ── In-process Direct Scan Concurrency Guard (Semaphore + Bounded Queue) ────
// NOTE: This limiter is per-process. Running multiple server instances multiplies
// the effective concurrency and token-bucket rate towards the provider.
class DirectScanSemaphore {
  constructor() {
    this.active = 0;
    this.queue = [];
  }

  _pump() {
    const maxConc = getOcrConfig().directConcurrency;
    while (this.active < maxConc && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next.grant();
    }
  }

  acquire(signal) {
    const cfg = getOcrConfig();
    if (signal && signal.aborted) {
      return Promise.reject(new OcrError('CLIENT_ABORTED', false));
    }

    const enqueuedAt = Date.now();
    const makeRelease = () => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
        this._pump();
      };
    };

    if (this.active < cfg.directConcurrency) {
      this.active += 1;
      return Promise.resolve({ waitMs: 0, release: makeRelease() });
    }

    if (this.queue.length >= cfg.directQueueMax) {
      const busyErr = new OcrError('OCR_BUSY', true, 'AI is busy, try again in a few seconds');
      busyErr.retryAfterSec = 5;
      return Promise.reject(busyErr);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        grant: () => {
          cleanup();
          this.active += 1;
          resolve({ waitMs: Date.now() - enqueuedAt, release: makeRelease() });
        },
      };

      const removeFromQueue = () => {
        const idx = this.queue.indexOf(waiter);
        if (idx !== -1) this.queue.splice(idx, 1);
      };

      const onTimeout = () => {
        removeFromQueue();
        cleanup();
        const busyErr = new OcrError('OCR_BUSY', true, 'AI is busy, try again in a few seconds');
        busyErr.retryAfterSec = 5;
        reject(busyErr);
      };

      const onAbort = () => {
        removeFromQueue();
        cleanup();
        reject(new OcrError('CLIENT_ABORTED', false));
      };

      const timer = setTimeout(onTimeout, cfg.directQueueWaitMs);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      };

      this.queue.push(waiter);
    });
  }

  stats() {
    return { active: this.active, queued: this.queue.length };
  }
}

const directSemaphore = new DirectScanSemaphore();

/**
 * Prepare image in memory using sharp (EXIF auto-orient + downscale to maxEdge, JPEG 85%).
 * Skips re-encoding only when the image is a supported type, within maxEdge, and has no EXIF rotation.
 */
const prepareImageDirect = async (buf, realMime, maxEdge) => {
  if (!ALLOWED_MIME.includes(realMime) || !looksComplete(buf, realMime)) {
    throw new OcrError('INVALID_IMAGE', false);
  }

  if (!sharpLib) {
    const hdr = readImageHeader(buf, realMime);
    if (!hdr || !hdr.width || !hdr.height) {
      throw new OcrError('INVALID_IMAGE', false);
    }
    if (Math.max(hdr.width, hdr.height) > maxEdge || (hdr.orientation && hdr.orientation !== 1)) {
      throw new OcrError(
        'FILE_TOO_LARGE',
        false,
        `Image dimensions exceed maximum allowed edge (${maxEdge}px) and sharp is unavailable.`
      );
    }
    return { data: buf, mimeType: realMime, reencoded: false };
  }

  let meta;
  try {
    meta = await sharpLib(buf, { failOn: 'error' }).metadata();
  } catch {
    throw new OcrError('INVALID_IMAGE', false);
  }
  if (!meta || !meta.width || !meta.height) {
    throw new OcrError('INVALID_IMAGE', false);
  }

  const withinEdge = Math.max(meta.width, meta.height) <= maxEdge;
  const noRotation = !meta.orientation || meta.orientation === 1;
  if (ALLOWED_MIME.includes(realMime) && withinEdge && noRotation) {
    return { data: buf, mimeType: realMime, reencoded: false };
  }

  try {
    const out = await sharpLib(buf, { failOn: 'error' })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data: out, mimeType: 'image/jpeg', reencoded: true };
  } catch {
    throw new OcrError('INVALID_IMAGE', false);
  }
};

const logDirectScan = (fields) => {
  const allowed = [
    'event',
    'batchId',
    'status',
    'errorCode',
    'modelUsed',
    'fallbackUsed',
    'tokensIn',
    'tokensOut',
    'queue_wait',
    'body_read',
    'prepare',
    'gemini',
    'sanitize',
    'total',
  ];
  const out = {};
  for (const k of allowed) {
    if (fields[k] !== undefined) out[k] = fields[k];
  }
  console.log('[OCR]', JSON.stringify(out));
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

const REASON_MESSAGES = {
  OCR_DISABLED: 'AI Scan is not enabled on this server.',
  OCR_NOT_PROVISIONED: 'AI Scan database tables are not provisioned.',
  NO_API_KEY: 'AI Scan API key is not configured on this server.',
  WORKER_DISABLED: 'AI Scan background worker is disabled on this server.',
  MODEL_UNAVAILABLE: 'The configured AI model is currently unavailable.',
};

const fail = (res, status, code, message) => {
  const msg = message || code;
  return res.status(status).json({ success: false, code, message: msg, error: msg });
};

/** created_by_user_id only when the token belongs to a users row (owner tokens do not). */
const userIdOf = (req) => (!req.isOwner && isUuid(req.user && req.user.id) ? req.user.id : null);

// Feature & readiness guard: everything except /config returns 503 when OCR is not usable
// Boot-time model verification is non-blocking (warning only, never returns 503 by itself).
router.use(async (req, res, next) => {
  if (req.path === '/config') return next();
  const cfg = getOcrConfig();
  if (!cfg.enabled) return fail(res, 503, 'OCR_DISABLED', REASON_MESSAGES.OCR_DISABLED);
  if (!hasApiKey()) {
    return fail(
      res,
      503,
      'NO_API_KEY',
      req.path === '/scan'
        ? 'AI service is not configured correctly, please contact your administrator'
        : REASON_MESSAGES.NO_API_KEY
    );
  }
  if (req.path !== '/scan' && req.path !== '/duplicates' && !cfg.workerEnabled) {
    return fail(res, 503, 'WORKER_DISABLED', REASON_MESSAGES.WORKER_DISABLED);
  }
  if (!cfg.geminiModel) {
    return fail(
      res,
      503,
      'MODEL_UNAVAILABLE',
      req.path === '/scan'
        ? 'AI service is not configured correctly, please contact your administrator'
        : REASON_MESSAGES.MODEL_UNAVAILABLE
    );
  }
  const model = getModelState();
  if (model.state === 'unchecked' || model.state === 'unreachable') {
    ensureModelVerified().catch(() => {});
  }
  return next();
});

const dailyCount = async (financeId) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM ocr_batches
      WHERE finance_id = $1 AND created_at >= date_trunc('day', CURRENT_TIMESTAMP)`,
    [financeId]
  );
  return rows[0].n;
};

// ── GET /ocr/config ──────────────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  const cfg = getOcrConfig();
  if (!cfg.enabled) {
    return res.json({ success: true, data: { enabled: false, reason: 'OCR_DISABLED' } });
  }
  let dailyRemaining = null;
  try {
    dailyRemaining = Math.max(0, cfg.dailyLimitPerFinance - (await dailyCount(req.financeId)));
  } catch {
    // Tables missing (migration not applied) -> feature reported as disabled
    return res.json({ success: true, data: { enabled: false, reason: 'OCR_NOT_PROVISIONED' } });
  }
  if (!hasApiKey()) {
    return res.json({ success: true, data: { enabled: false, reason: 'NO_API_KEY', providerReady: false } });
  }
  if (!cfg.geminiModel) {
    return res.json({ success: true, data: { enabled: false, reason: 'MODEL_UNAVAILABLE', providerReady: false } });
  }
  const model = getModelState();
  if (model.state === 'unchecked' || model.state === 'unreachable') {
    ensureModelVerified().catch(() => {});
  }
  return res.json({
    success: true,
    data: {
      enabled: true,
      directScan: true,
      providerReady: model.state === 'ok' || Boolean(cfg.geminiModel && hasApiKey()),
      maxImages: cfg.maxImages,
      allowedMime: cfg.allowedMime,
      maxFileBytes: cfg.maxFileBytes,
      imageMaxEdge: cfg.imageMaxEdgePx,
      retentionDays: cfg.retentionDays,
      extractPayments: cfg.extractPayments,
      dailyRemaining,
    },
  });
});

// ── POST /ocr/scan?loanType=consulting|vehicle ───────────────────────────────
// Direct single-image scan in memory. No S3 upload, no ocr_jobs rows, no persisted JSON.
const mapDirectScanError = (err) => {
  const code = (err && err.code) || 'OCR_UNAVAILABLE';
  switch (code) {
    case 'INVALID_IMAGE':
      return {
        status: 400,
        code: 'INVALID_IMAGE',
        message: 'This file is not a readable image. Please use a JPEG or PNG photo.',
      };
    case 'FILE_TOO_LARGE':
      return {
        status: 413,
        code: 'FILE_TOO_LARGE',
        message: 'The photo is too large. Please use a smaller JPEG or PNG photo.',
      };
    case 'UNSUPPORTED_TYPE':
      return {
        status: 415,
        code: 'UNSUPPORTED_TYPE',
        message: 'Please use a JPEG, PNG, or WebP photo.',
      };
    case 'OCR_QUOTA_EXCEEDED':
    case 'PROVIDER_QUOTA_EXHAUSTED':
      return {
        status: 429,
        code,
        message: 'Scan limit reached, try later or contact admin',
      };
    case 'OCR_RATE_LIMITED':
      return {
        status: 429,
        code: 'OCR_RATE_LIMITED',
        message: 'Too many scans, please wait a minute',
        retryAfterSec: 60,
      };
    case 'OCR_BUSY':
    case 'PROVIDER_RATE_LIMITED':
      return {
        status: 429,
        code,
        message: 'AI is busy, try again in a few seconds',
        retryAfterSec: (err && err.retryAfterSec) || (code === 'OCR_BUSY' ? 5 : undefined),
      };
    case 'PROVIDER_TIMEOUT':
      return {
        status: 504,
        code: 'PROVIDER_TIMEOUT',
        message: 'The AI scan timed out. Please try again.',
      };
    case 'INVALID_JSON_AFTER_REPAIR':
      return {
        status: 422,
        code: 'INVALID_JSON_AFTER_REPAIR',
        message: 'The AI could not read this card reliably. Please try "Scan again".',
      };
    case 'OUTPUT_TRUNCATED':
      return {
        status: 422,
        code: 'OUTPUT_TRUNCATED',
        message: 'The card has too much text to read in one go. Try a closer, clearer photo.',
      };
    case 'BLOCKED_BY_PROVIDER':
      return {
        status: 422,
        code: 'BLOCKED_BY_PROVIDER',
        message: 'The AI service declined to read this image. Please enter the details manually.',
      };
    case 'PROVIDER_AUTH_FAILED':
    case 'PROVIDER_NOT_READY':
    case 'NO_API_KEY':
    case 'MODEL_UNAVAILABLE':
    case 'PROVIDER_REQUEST_REJECTED':
      console.error('[OCR] Provider configuration/auth error during direct scan:', code);
      return {
        status: 503,
        code: 'OCR_CONFIG_ERROR',
        message: 'AI service is not configured correctly, please contact your administrator',
      };
    case 'PROVIDER_UNAVAILABLE':
    case 'OCR_UNAVAILABLE':
    case 'NETWORK_ERROR':
    case 'PROVIDER_BAD_RESPONSE':
    default:
      return {
        status: 503,
        code: code === 'PROVIDER_UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : 'OCR_UNAVAILABLE',
        message: 'The AI scan service is temporarily unavailable. Please try again.',
      };
  }
};

router.post('/scan', async (req, res) => {
  req.setTimeout(DIRECT_ROUTE_TIMEOUT_MS);
  res.setTimeout(DIRECT_ROUTE_TIMEOUT_MS);
  res.set('Cache-Control', 'no-store');

  const totalStart = Date.now();
  const cfg = getOcrConfig();
  const financeId = req.financeId;
  const userId = userIdOf(req);
  const loanType = String((req.query && req.query.loanType) || '').trim();

  // 1. OCR enabled (already checked by middleware), role allowed, loanType valid, early header checks
  if (!['consulting', 'vehicle'].includes(loanType)) {
    return fail(res, 400, 'INVALID_LOAN_TYPE', 'loanType must be consulting or vehicle');
  }

  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > cfg.maxFileBytes) {
    return fail(res, 413, 'FILE_TOO_LARGE', 'The photo is too large. Please use a smaller JPEG or PNG photo.');
  }

  const rawContentType = String(req.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (rawContentType && !cfg.allowedMime.includes(rawContentType) && rawContentType !== 'application/octet-stream') {
    return fail(res, 415, 'UNSUPPORTED_TYPE', 'Please use a JPEG, PNG, or WebP photo.');
  }

  // 2. Quota and rate (mandatory, same rules as batch creation; fail closed with 503 OCR_UNAVAILABLE)
  try {
    if ((await dailyCount(financeId)) >= cfg.dailyLimitPerFinance) {
      return fail(res, 429, 'OCR_QUOTA_EXCEEDED', 'Scan limit reached, try later or contact admin');
    }
    if (userId) {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM ocr_batches
          WHERE created_by_user_id = $1 AND created_at >= CURRENT_TIMESTAMP - interval '1 minute'`,
        [userId]
      );
      if (rows[0].n >= cfg.userBatchesPerMinute) {
        res.set('Retry-After', '60');
        return fail(res, 429, 'OCR_RATE_LIMITED', 'Too many scans, please wait a minute');
      }
    }
  } catch {
    return fail(res, 503, 'OCR_UNAVAILABLE', 'The AI scan service is temporarily unavailable. Please try again.');
  }

  // 3. Insert metadata-only row in ocr_batches (context_type='direct_scan', merged_result=NULL, no job rows)
  let batchId = null;
  try {
    const { rows: bRows } = await db.query(
      `INSERT INTO ocr_batches (finance_id, created_by_user_id, context_type, loan_type, expected_images, status, merged_result)
       VALUES ($1, (SELECT id FROM users WHERE id = $2::uuid), 'direct_scan', $3, 1, 'processing', NULL)
       RETURNING id`,
      [financeId, userId, loanType]
    );
    batchId = bRows[0] && bRows[0].id;
  } catch {
    return fail(res, 503, 'OCR_UNAVAILABLE', 'The AI scan service is temporarily unavailable. Please try again.');
  }

  const updateBatchOutcome = async (nextStatus) => {
    if (!batchId) return;
    try {
      await db.query(
        `UPDATE ocr_batches
            SET status = $2, merged_result = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [batchId, nextStatus]
      );
    } catch {
      /* best effort */
    }
  };

  const abortCtrl = new AbortController();
  let clientDisconnected = false;
  const onClose = () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      abortCtrl.abort();
    }
  };
  req.on('aborted', onClose);
  res.on('close', onClose);

  let slot = null;
  let buf = null;
  let prepared = null;
  const timers = {
    queue_wait: 0,
    body_read: 0,
    prepare: 0,
    gemini: 0,
    sanitize: 0,
    total: 0,
  };
  let tokensIn = null;
  let tokensOut = null;
  let modelUsed = null;
  let fallbackUsed = false;

  try {
    // 4. Acquire a concurrency slot before reading body into memory
    const qStart = Date.now();
    slot = await directSemaphore.acquire(abortCtrl.signal);
    timers.queue_wait = slot.waitMs ?? Date.now() - qStart;

    // 5. Read the raw body with streaming size cap
    const rStart = Date.now();
    buf = await readRawBody(req, cfg.maxFileBytes, abortCtrl.signal);
    timers.body_read = Date.now() - rStart;

    if (!buf || buf.length === 0) {
      throw new OcrError('INVALID_IMAGE', false);
    }

    // 6. Validate real type by magic bytes (JPEG/PNG/WebP only)
    const realMime = detectImageMime(buf);
    if (!realMime) {
      throw new OcrError('INVALID_IMAGE', false);
    }

    // 7. Image preparation with sharp (EXIF orientation + downscale to OCR_IMAGE_MAX_EDGE_PX)
    const pStart = Date.now();
    prepared = await prepareImageDirect(buf, realMime, cfg.imageMaxEdgePx);
    timers.prepare = Date.now() - pStart;
    buf = null; // Drop raw input buffer reference immediately

    // 8. Call Gemini in memory, then parseModelOutput -> sanitizeExtraction -> mergeJobExtractions
    const imageBase64 = prepared.data.toString('base64');
    const preparedMime = prepared.mimeType;
    prepared = null; // Drop prepared buffer reference before awaiting network

    const remainingTimeoutMs = Math.min(
      cfg.geminiTimeoutMs,
      Math.max(5000, DIRECT_ROUTE_TIMEOUT_MS - 5000 - timers.queue_wait)
    );

    const gStart = Date.now();
    const gemRes = await extractLedger({
      imageBase64,
      mimeType: preparedMime,
      signal: abortCtrl.signal,
      timeoutMs: remainingTimeoutMs,
    });
    timers.gemini = Date.now() - gStart;
    tokensIn = gemRes.tokensIn;
    tokensOut = gemRes.tokensOut;
    modelUsed = gemRes.modelUsed || gemRes.model;
    fallbackUsed = Boolean(gemRes.fallbackUsed);

    const sStart = Date.now();
    const parsed = parseModelOutput(gemRes.text);
    const clean = sanitizeExtraction(parsed, { extractPayments: cfg.extractPayments });
    const mergedResult = mergeJobExtractions([{ sequence_no: 1, extracted_data: clean }]);
    timers.sanitize = Date.now() - sStart;

    if (clientDisconnected || abortCtrl.signal.aborted) {
      throw new OcrError('CLIENT_ABORTED', false);
    }

    timers.total = Date.now() - totalStart;
    await updateBatchOutcome('complete');

    logDirectScan({
      event: 'direct_scan',
      batchId,
      status: 'complete',
      modelUsed,
      fallbackUsed,
      tokensIn,
      tokensOut,
      ...timers,
    });

    // 9. Respond 200 with Cache-Control: no-store
    return res.status(200).json({
      success: true,
      data: {
        loanType,
        modelUsed,
        fallbackUsed,
        durationMs: timers.total,
        mergedResult,
      },
    });
  } catch (err) {
    timers.total = Date.now() - totalStart;
    if (clientDisconnected || (err && err.code === 'CLIENT_ABORTED')) {
      await updateBatchOutcome('cancelled');
      logDirectScan({
        event: 'direct_scan',
        batchId,
        status: 'cancelled',
        errorCode: 'CLIENT_ABORTED',
        ...timers,
      });
      return;
    }

    await updateBatchOutcome('failed');
    const mapped = mapDirectScanError(err);
    logDirectScan({
      event: 'direct_scan',
      batchId,
      status: 'failed',
      errorCode: (err && err.code) || mapped.code,
      modelUsed,
      fallbackUsed,
      tokensIn,
      tokensOut,
      ...timers,
    });

    if (mapped.retryAfterSec) {
      res.set('Retry-After', String(mapped.retryAfterSec));
    }
    return fail(res, mapped.status, mapped.code, mapped.message);
  } finally {
    buf = null;
    prepared = null;
    if (slot) slot.release();
    req.removeListener('aborted', onClose);
    res.removeListener('close', onClose);
  }
});

// ── POST /ocr/batches ────────────────────────────────────────────────────────
router.post('/batches', async (req, res) => {
  const cfg = getOcrConfig();
  const financeId = req.financeId;
  const userId = userIdOf(req);
  const { loanType, files, forceRescan } = req.body || {};

  if (!['consulting', 'vehicle'].includes(loanType)) return fail(res, 400, 'INVALID_LOAN_TYPE', 'loanType must be consulting or vehicle');
  if (!Array.isArray(files) || files.length < 1 || files.length > cfg.maxImages) {
    return fail(res, 400, 'INVALID_FILE_COUNT', `Upload between 1 and ${cfg.maxImages} image(s)`);
  }
  for (const f of files) {
    if (!f || !cfg.allowedMime.includes(f.contentType)) return fail(res, 400, 'UNSUPPORTED_TYPE', 'Please use a JPEG, PNG or WebP photo');
    const size = Number(f.size);
    if (!Number.isInteger(size) || size <= 0) return fail(res, 400, 'INVALID_FILE_SIZE', 'Invalid file size');
    if (size > cfg.maxFileBytes) return fail(res, 400, 'FILE_TOO_LARGE', 'The photo is too large');
  }
  if (!cfg.bucket) return fail(res, 500, 'STORAGE_NOT_CONFIGURED', 'Storage is not configured');

  try {
    if ((await dailyCount(financeId)) >= cfg.dailyLimitPerFinance) {
      return fail(res, 429, 'OCR_QUOTA_EXCEEDED', 'Daily AI scan limit reached for this company');
    }
    if (userId) {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM ocr_batches
          WHERE created_by_user_id = $1 AND created_at >= CURRENT_TIMESTAMP - interval '1 minute'`,
        [userId]
      );
      if (rows[0].n >= cfg.userBatchesPerMinute) {
        return fail(res, 429, 'OCR_RATE_LIMITED', 'Too many scans, please wait a minute');
      }
    }
  } catch (err) {
    return fail(res, 503, 'OCR_NOT_PROVISIONED', 'AI scan is not available yet');
  }

  const client = await db.connect();
  let batchId;
  let expiresAt;
  const jobs = [];
  try {
    await client.query('BEGIN');
    const { rows: bRows } = await client.query(
      `INSERT INTO ocr_batches (finance_id, created_by_user_id, loan_type, expected_images, force_rescan, status)
       VALUES ($1, (SELECT id FROM users WHERE id = $2::uuid), $3, $4, $5, 'created')
       RETURNING id`,
      [financeId, userId, loanType, files.length, forceRescan === true]
    );
    batchId = bRows[0].id;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const { rows: idRow } = await client.query('SELECT uuidv7() AS id');
      const jobId = idRow[0].id;
      const key = buildOcrKey(financeId, batchId, jobId, f.contentType);
      const fileName = typeof f.fileName === 'string' ? f.fileName.slice(0, 255) : null;
      const { rows: jRows } = await client.query(
        `INSERT INTO ocr_jobs (id, batch_id, finance_id, sequence_no, file_name, mime_type, declared_size_bytes,
                               s3_bucket, s3_key, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'created',
                 CURRENT_TIMESTAMP + ($10 || ' days')::interval)
         RETURNING expires_at`,
        [jobId, batchId, financeId, i + 1, fileName, f.contentType, Number(f.size), cfg.bucket, key, String(cfg.retentionDays)]
      );
      expiresAt = jRows[0].expires_at;
      jobs.push({ jobId, sequenceNo: i + 1, key, contentType: f.contentType, size: Number(f.size) });
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[OCR] create batch failed', err && err.code ? err.code : '');
    return fail(res, 500, 'OCR_CREATE_FAILED', 'Could not start the scan');
  } finally {
    client.release();
  }

  try {
    const out = [];
    for (const j of jobs) {
      const uploadUrl = await presignPut({ key: j.key, contentType: j.contentType, contentLength: j.size });
      out.push({ jobId: j.jobId, sequenceNo: j.sequenceNo, uploadUrl, contentType: j.contentType });
    }
    return res.status(201).json({ success: true, data: { batchId, expiresAt, jobs: out } });
  } catch {
    return fail(res, 500, 'PRESIGN_FAILED', 'Could not prepare the upload');
  }
});

// Helper: load a job of THIS finance (404 otherwise)
const loadJob = async (jobId, financeId) => {
  if (!isUuid(jobId)) return null;
  const { rows } = await db.query(
    `SELECT id, batch_id, status, retry_count, mime_type, declared_size_bytes, s3_bucket, s3_key, s3_deleted_at, expires_at
       FROM ocr_jobs WHERE id = $1 AND finance_id = $2`,
    [jobId, financeId]
  );
  return rows[0] || null;
};

const readRawBody = (req, maxBytes, signal) =>
  new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      return reject(new OcrError('CLIENT_ABORTED', false));
    }
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      if (req.body.length > maxBytes) {
        return reject(new OcrError('FILE_TOO_LARGE', false));
      }
      return resolve(req.body);
    }
    const chunks = [];
    let total = 0;
    let settled = false;

    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      cleanup();
      reject(new OcrError('CLIENT_ABORTED', false));
    };

    const onData = (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        settled = true;
        chunks.length = 0;
        cleanup();
        reject(new OcrError('FILE_TOO_LARGE', false));
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      cleanup();
      reject(err);
    };

    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });

// ── PUT /ocr/jobs/:jobId/upload ──────────────────────────────────────────────
// Server-relayed S3 upload so browsers never fail on S3 bucket CORS preflight (403).
const handleJobUpload = async (req, res) => {
  const cfg = getOcrConfig();
  try {
    const job = await loadJob(req.params.jobId, req.financeId);
    if (!job) return fail(res, 404, 'NOT_FOUND', 'Not found');
    if (job.status !== 'created') {
      return fail(res, 409, 'INVALID_STATE', 'This upload can no longer be modified');
    }
    if (new Date(job.expires_at) <= new Date()) {
      return fail(res, 409, 'INVALID_STATE', 'This upload has expired');
    }

    let buf;
    try {
      buf = await readRawBody(req, cfg.maxFileBytes);
    } catch (err) {
      if (err && err.code === 'FILE_TOO_LARGE') {
        return fail(res, 400, 'FILE_TOO_LARGE', 'The photo is too large');
      }
      throw err;
    }

    if (!buf || buf.length === 0) {
      return fail(res, 400, 'INVALID_FILE_SIZE', 'Empty upload body');
    }
    if (job.declared_size_bytes && buf.length !== Number(job.declared_size_bytes)) {
      return fail(res, 400, 'UPLOAD_MISMATCH', 'Upload could not be verified, please try again');
    }

    await putOcrObject(job.s3_bucket, job.s3_key, buf, job.mime_type || 'image/jpeg');
    cacheJobBuffer(job.id, buf);

    await db.query(
      `UPDATE ocr_jobs
          SET status = 'queued', uploaded_at = CURRENT_TIMESTAMP, next_attempt_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'created'`,
      [job.id]
    );
    await db.query(
      `UPDATE ocr_batches SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('created','processing')`,
      [job.batch_id]
    );
    wake();
    return res.json({ success: true, data: { jobId: job.id, uploaded: true, status: 'queued', size: buf.length } });
  } catch (err) {
    if (err && err.code === '42P01') return fail(res, 503, 'OCR_NOT_PROVISIONED', REASON_MESSAGES.OCR_NOT_PROVISIONED);
    return fail(res, 500, 'UPLOAD_FAILED', 'Upload failed. Please check your connection and try again.');
  }
};

router.put('/jobs/:jobId/upload', handleJobUpload);
router.post('/jobs/:jobId/upload', handleJobUpload);

// ── POST /ocr/jobs/:jobId/complete ───────────────────────────────────────────
router.post('/jobs/:jobId/complete', async (req, res) => {
  const cfg = getOcrConfig();
  try {
    const job = await loadJob(req.params.jobId, req.financeId);
    if (!job) return fail(res, 404, 'NOT_FOUND', 'Not found');
    if (['queued', 'processing', 'complete'].includes(job.status)) {
      return res.json({ success: true, data: { jobId: job.id, status: job.status } });
    }
    if (job.status !== 'created') return fail(res, 409, 'INVALID_STATE', 'This upload can no longer be completed');

    const head = await headObject(job.s3_bucket, job.s3_key);
    let violation = null;
    if (!head.exists) violation = 'UPLOAD_MISMATCH';
    else if (head.size > cfg.maxFileBytes) violation = 'FILE_TOO_LARGE';
    else if (job.declared_size_bytes && head.size !== Number(job.declared_size_bytes)) violation = 'UPLOAD_MISMATCH';

    if (violation) {
      if (head.exists) {
        try {
          await deleteOcrObject(job.s3_bucket, job.s3_key);
          await db.query('UPDATE ocr_jobs SET s3_deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [job.id]);
        } catch { /* sweep will retry */ }
      }
      await db.query(
        `UPDATE ocr_jobs SET status = 'failed', error_code = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [job.id, violation]
      );
      await refreshBatchStatus(job.batch_id);
      return fail(res, 400, violation, violation === 'FILE_TOO_LARGE' ? 'The photo is too large' : 'Upload could not be verified, please try again');
    }

    await db.query(
      `UPDATE ocr_jobs
          SET status = 'queued', uploaded_at = CURRENT_TIMESTAMP, next_attempt_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'created'`,
      [job.id]
    );
    await db.query(
      `UPDATE ocr_batches SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('created','processing')`,
      [job.batch_id]
    );
    wake();
    return res.json({ success: true, data: { jobId: job.id, status: 'queued' } });
  } catch (err) {
    if (err && err.code === '42P01') return fail(res, 503, 'OCR_NOT_PROVISIONED', REASON_MESSAGES.OCR_NOT_PROVISIONED);
    return fail(res, 500, 'OCR_COMPLETE_FAILED', 'Could not confirm the upload');
  }
});

// ── GET /ocr/batches/:batchId ────────────────────────────────────────────────
router.get('/batches/:batchId', async (req, res) => {
  try {
    if (!isUuid(req.params.batchId)) return fail(res, 404, 'NOT_FOUND', 'Not found');
    const { rows: bRows } = await db.query(
      `SELECT id, loan_type, status, expected_images, merged_result, created_at
         FROM ocr_batches WHERE id = $1 AND finance_id = $2`,
      [req.params.batchId, req.financeId]
    );
    if (!bRows.length) return fail(res, 404, 'NOT_FOUND', 'Not found');
    const batch = bRows[0];
    const { rows: jobs } = await db.query(
      `SELECT sequence_no, status, error_code, retry_count, id,
              (expires_at <= CURRENT_TIMESTAMP OR data_purged_at IS NOT NULL) AS expired
         FROM ocr_jobs WHERE batch_id = $1 AND finance_id = $2 ORDER BY sequence_no`,
      [batch.id, req.financeId]
    );
    const expired = jobs.length > 0 && jobs.some((j) => j.expired);
    const doneCount = jobs.filter((j) => j.status === 'complete' || j.status === 'needs_review').length;
    const totalExpected = Math.max(1, Number(batch.expected_images) || jobs.length || 1);
    let percent = 45;
    if (batch.status === 'complete' || batch.status === 'needs_review') {
      percent = 100;
    } else if (batch.status === 'created') {
      percent = 20;
    } else if (batch.status === 'processing') {
      percent = Math.min(90, 45 + Math.round((doneCount / totalExpected) * 40));
    } else if (batch.status === 'failed' || batch.status === 'cancelled' || expired) {
      percent = 0;
    }
    const base = {
      batchId: batch.id,
      loanType: batch.loan_type,
      expectedImages: batch.expected_images,
      progress: { percent },
      jobs: jobs.map((j) => ({ jobId: j.id, sequenceNo: j.sequence_no, status: j.status, errorCode: j.error_code, retryCount: j.retry_count })),
    };
    if (expired) return res.json({ success: true, data: { ...base, status: 'expired', mergedResult: null } });
    const withResult = batch.status === 'complete' || batch.status === 'needs_review';
    return res.json({
      success: true,
      data: { ...base, status: batch.status, mergedResult: withResult ? batch.merged_result : null },
    });
  } catch (err) {
    if (err && err.code === '42P01') return fail(res, 503, 'OCR_NOT_PROVISIONED', REASON_MESSAGES.OCR_NOT_PROVISIONED);
    return fail(res, 500, 'OCR_STATUS_FAILED', 'Could not load scan status');
  }
});

// ── POST /ocr/jobs/:jobId/retry ──────────────────────────────────────────────
router.post('/jobs/:jobId/retry', async (req, res) => {
  const cfg = getOcrConfig();
  try {
    const job = await loadJob(req.params.jobId, req.financeId);
    if (!job) return fail(res, 404, 'NOT_FOUND', 'Not found');
    if (job.status !== 'failed') return fail(res, 409, 'INVALID_STATE', 'Only failed scans can be retried');
    if (job.retry_count >= cfg.maxRetries) return fail(res, 409, 'RETRY_LIMIT', 'Retry limit reached, please scan again');
    if (job.s3_deleted_at || new Date(job.expires_at) <= new Date()) return fail(res, 409, 'SOURCE_MISSING', 'The photo is no longer available, please scan again');
    const head = await headObject(job.s3_bucket, job.s3_key);
    if (!head.exists) return fail(res, 409, 'SOURCE_MISSING', 'The photo is no longer available, please scan again');

    await db.query(
      `UPDATE ocr_jobs
          SET status = 'queued', retry_count = retry_count + 1, error_code = NULL, next_attempt_at = NULL,
              locked_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'failed'`,
      [job.id]
    );
    await db.query(
      `UPDATE ocr_batches SET status = 'processing', merged_result = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status <> 'cancelled'`,
      [job.batch_id]
    );
    wake();
    return res.json({ success: true, data: { jobId: job.id, status: 'queued' } });
  } catch (err) {
    if (err && err.code === '42P01') return fail(res, 503, 'OCR_NOT_PROVISIONED', REASON_MESSAGES.OCR_NOT_PROVISIONED);
    return fail(res, 500, 'OCR_RETRY_FAILED', 'Could not retry the scan');
  }
});

// ── POST /ocr/batches/:batchId/cancel ────────────────────────────────────────
router.post('/batches/:batchId/cancel', async (req, res) => {
  try {
    if (!isUuid(req.params.batchId)) return fail(res, 404, 'NOT_FOUND', 'Not found');
    const { rows } = await db.query(
      `UPDATE ocr_batches SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND finance_id = $2 AND status IN ('created','processing')
        RETURNING id`,
      [req.params.batchId, req.financeId]
    );
    if (!rows.length) {
      const { rows: exists } = await db.query('SELECT status FROM ocr_batches WHERE id = $1 AND finance_id = $2', [req.params.batchId, req.financeId]);
      if (!exists.length) return fail(res, 404, 'NOT_FOUND', 'Not found');
      return res.json({ success: true, data: { batchId: req.params.batchId, status: exists[0].status } });
    }
    // Unfinished jobs are cancelled and become eligible for the next sweep immediately
    const { rows: cancelledJobs } = await db.query(
      `UPDATE ocr_jobs
          SET status = 'cancelled', locked_at = NULL,
               expires_at = LEAST(expires_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = $1 AND finance_id = $2 AND status IN ('created','uploaded','queued','processing')
        RETURNING id`,
      [req.params.batchId, req.financeId]
    );
    for (const cj of cancelledJobs) {
      clearCachedJobBuffer(cj.id);
    }
    return res.json({ success: true, data: { batchId: req.params.batchId, status: 'cancelled' } });
  } catch (err) {
    if (err && err.code === '42P01') return fail(res, 503, 'OCR_NOT_PROVISIONED', REASON_MESSAGES.OCR_NOT_PROVISIONED);
    return fail(res, 500, 'OCR_CANCEL_FAILED', 'Could not cancel the scan');
  }
});

// ── GET /ocr/duplicates?hplno=&aadhar= ───────────────────────────────────────
// Minimal review-time duplicate check (no existing endpoint for this). Booleans only.
router.get('/duplicates', async (req, res) => {
  try {
    const hpl = String(req.query.hplno || '').trim();
    const aadhar = String(req.query.aadhar || '').replace(/\s+/g, '');
    let hplnoExists = false;
    let aadharExists = false;
    if (/^\d{1,9}$/.test(hpl)) {
      const { rows } = await db.query('SELECT 1 FROM customers WHERE finance_id = $1 AND hplno = $2::int LIMIT 1', [req.financeId, hpl]);
      hplnoExists = rows.length > 0;
    }
    if (/^\d{12}$/.test(aadhar)) {
      const { rows } = await db.query('SELECT 1 FROM customers WHERE finance_id = $1 AND aadhar_id = $2 LIMIT 1', [req.financeId, aadhar]);
      aadharExists = rows.length > 0;
    }
    return res.json({ success: true, data: { hplnoExists, aadharExists } });
  } catch {
    return fail(res, 500, 'OCR_DUPLICATE_CHECK_FAILED', 'Could not check duplicates');
  }
});

router.DirectScanSemaphore = DirectScanSemaphore;
router.directSemaphore = directSemaphore;
router.prepareImageDirect = prepareImageDirect;
router.setSharpForTest = setSharpForTest;
router.DIRECT_ROUTE_TIMEOUT_MS = DIRECT_ROUTE_TIMEOUT_MS;

module.exports = router;

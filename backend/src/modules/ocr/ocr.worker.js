'use strict';

/**
 * OCR worker: fair-share claim, per-job pipeline, retries with backoff,
 * reaper for stuck jobs, and the retention sweep (dry-run by default).
 *
 * Runs inside the API process when OCR_WORKER_ENABLED=true, or standalone:
 *   node src/modules/ocr/ocr.worker.js
 * Run only ONE worker process per environment (claims are also serialized
 * with a transaction-level advisory lock).
 *
 * Logging: only batchId, jobId, status, errorCode, durationMs, tokensIn, tokensOut and counts.
 */

const dns = require('dns');
const net = require('net');
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

const crypto = require('crypto');
const { db } = require('../../config/database.config');
const { getOcrConfig } = require('./ocr.config');
const { OcrError, isRetryable, verifyModel, ensureModelVerified, getModelState, extractLedger } = require('./gemini.service');
const { parseModelOutput, sanitizeExtraction, mergeJobExtractions } = require('./ocr.sanitizer');
const ocrS3 = require('./ocr.s3'); // accessed via the module object so tests can stub it

const CLAIM_LOCK_KEY = 727001;
const FALLBACK_POLL_MS = 2000;
const REAPER_MS = 60 * 1000;
const SWEEP_MS = 60 * 60 * 1000;
const MODEL_RECHECK_MS = 5 * 60 * 1000;
const STALL_MINUTES = 5;
const SWEEP_BATCH = 50;
const TERMINAL = new Set(['complete', 'needs_review', 'failed', 'cancelled']);

const log = (fields) => {
  // Whitelisted fields only (privacy rule)
  const allowed = [
    'event',
    'batchId',
    'jobId',
    'status',
    'errorCode',
    'durationMs',
    's3DownloadMs',
    'prepMs',
    'geminiMs',
    'cacheHit',
    'tokensIn',
    'tokensOut',
    'count',
    'dryRun',
  ];
  const out = {};
  for (const k of allowed) if (fields[k] !== undefined) out[k] = fields[k];
  console.log('[OCR]', JSON.stringify(out));
};

// ── Image helpers ────────────────────────────────────────────────────────────
/** Detect the real image type from magic bytes. The client-declared MIME is never trusted. */
const detectImageMime = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
};

const JIMP_TIMEOUT_MS = 20000;

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new OcrError('INVALID_IMAGE', false)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });

/** Truncated-file check before decoding (JPEG needs an EOI marker, PNG an IEND chunk). */
const looksComplete = (buf, mime) => {
  if (mime === 'image/jpeg') {
    const tail = buf.slice(Math.max(0, buf.length - 4096));
    for (let i = tail.length - 2; i >= 0; i--) if (tail[i] === 0xff && tail[i + 1] === 0xd9) return true;
    return false;
  }
  if (mime === 'image/png') {
    return buf.slice(Math.max(0, buf.length - 64)).includes(Buffer.from('IEND', 'ascii'));
  }
  return true;
};

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

const parseExifOrientation = (buf, app1Start, app1Length) => {
  const end = Math.min(buf.length, app1Start + app1Length);
  if (end - app1Start < 14) return 1;
  if (buf.slice(app1Start, app1Start + 6).toString('ascii') !== 'Exif\0\0') return 1;
  const tiff = app1Start + 6;
  const endian = buf.slice(tiff, tiff + 2).toString('ascii');
  const le = endian === 'II';
  if (!le && endian !== 'MM') return 1;
  const u16 = (off) => (le ? buf.readUInt16LE(off) : buf.readUInt16BE(off));
  const u32 = (off) => (le ? buf.readUInt32LE(off) : buf.readUInt32BE(off));
  if (tiff + 8 > end || u16(tiff + 2) !== 0x002a) return 1;
  const ifdOffset = u32(tiff + 4);
  const ifd = tiff + ifdOffset;
  if (ifd + 2 > end) return 1;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entryOff = ifd + 2 + i * 12;
    if (entryOff + 12 > end) break;
    if (u16(entryOff) === 0x0112) {
      const val = u16(entryOff + 8);
      return val >= 1 && val <= 8 ? val : 1;
    }
  }
  return 1;
};

/**
 * Fast header parser for JPEG, PNG, and WebP that extracts { width, height, orientation }
 * without decoding pixels. Returns null if headers cannot be parsed cleanly.
 */
const readImageHeader = (buf, mime) => {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  try {
    if (mime === 'image/png') {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return width > 0 && height > 0 ? { width, height, orientation: 1 } : null;
    }
    if (mime === 'image/webp') {
      const chunk = buf.slice(12, 16).toString('ascii');
      if (chunk === 'VP8 ' && buf.length >= 30) {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, orientation: 1 };
      }
      if (chunk === 'VP8L' && buf.length >= 25) {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, orientation: 1 };
      }
      if (chunk === 'VP8X' && buf.length >= 30) {
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), orientation: 1 };
      }
      return null;
    }
    if (mime === 'image/jpeg') {
      let pos = 2;
      let orientation = 1;
      while (pos + 4 <= buf.length) {
        if (buf[pos] !== 0xff) {
          pos++;
          continue;
        }
        while (pos < buf.length && buf[pos] === 0xff) pos++;
        if (pos >= buf.length) break;
        const marker = buf[pos];
        pos++;
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (marker === 0xd9 || marker === 0xda) break;
        if (pos + 2 > buf.length) break;
        const segLen = buf.readUInt16BE(pos);
        if (segLen < 2 || pos + segLen > buf.length) break;
        if (marker === 0xe1) {
          orientation = parseExifOrientation(buf, pos + 2, segLen - 2);
        } else if (SOF_MARKERS.has(marker) && segLen >= 7) {
          const height = buf.readUInt16BE(pos + 3);
          const width = buf.readUInt16BE(pos + 5);
          if (width > 0 && height > 0) return { width, height, orientation };
        }
        pos += segLen;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const PASS_THROUGH_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);

/**
 * Fix EXIF orientation and downscale to maxEdge (JPEG ~85%).
 * Fast pass-through (<1ms) when the image is already <= maxEdge, orientation 1, and <= 1.5 MB.
 * Uses jimp (already a project dependency) otherwise.
 */
const prepareImage = async (buf, mime, maxEdge) => {
  if (!looksComplete(buf, mime)) throw new OcrError('INVALID_IMAGE', false);
  const hdr = readImageHeader(buf, mime);
  if (
    hdr &&
    hdr.width > 0 &&
    hdr.height > 0 &&
    Math.max(hdr.width, hdr.height) <= maxEdge &&
    (!hdr.orientation || hdr.orientation === 1) &&
    buf.length <= PASS_THROUGH_MAX_BYTES
  ) {
    return { data: buf, mimeType: mime };
  }
  if (mime === 'image/webp') return { data: buf, mimeType: mime };
  let Jimp;
  try {
    Jimp = require('jimp');
  } catch {
    return { data: buf, mimeType: mime };
  }
  try {
    // jimp applies EXIF orientation on read for JPEG. Some malformed inputs make jimp
    // reject internally without settling its promise, so a timeout guards the call.
    const img = await withTimeout(Jimp.read(buf), JIMP_TIMEOUT_MS);
    const { width, height } = img.bitmap;
    if (Math.max(width, height) > maxEdge) img.scaleToFit(maxEdge, maxEdge);
    img.quality(85);
    const out = await img.getBufferAsync(Jimp.MIME_JPEG);
    return { data: out, mimeType: 'image/jpeg' };
  } catch {
    throw new OcrError('INVALID_IMAGE', false);
  }
};

// ── Batch status ─────────────────────────────────────────────────────────────
/** Pure decision used by refreshBatchStatus (exported for tests). */
const decideBatchStatus = (jobStatuses) => {
  if (!jobStatuses.length) return 'created';
  if (jobStatuses.some((s) => !TERMINAL.has(s))) return 'processing';
  const complete = jobStatuses.filter((s) => s === 'complete').length;
  if (complete === jobStatuses.length) return 'complete';
  if (complete > 0) return 'needs_review';
  if (jobStatuses.every((s) => s === 'cancelled')) return 'cancelled';
  return 'failed';
};

const refreshBatchStatus = async (batchId) => {
  const { rows: batchRows } = await db.query('SELECT status FROM ocr_batches WHERE id = $1', [batchId]);
  if (!batchRows.length || batchRows[0].status === 'cancelled') return;
  const { rows: jobs } = await db.query(
    'SELECT sequence_no, status, extracted_data FROM ocr_jobs WHERE batch_id = $1 ORDER BY sequence_no',
    [batchId]
  );
  const next = decideBatchStatus(jobs.map((j) => j.status));
  let merged = null;
  if (next === 'complete' || next === 'needs_review') {
    merged = mergeJobExtractions(jobs.filter((j) => j.status === 'complete'));
  }
  await db.query(
    `UPDATE ocr_batches
        SET status = $2, merged_result = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status <> 'cancelled'`,
    [batchId, next, merged ? JSON.stringify(merged) : null]
  );
};

// ── Claim (fair share, per-finance cap, serialized by advisory lock) ────────
const CLAIM_SQL = `
WITH active AS (
  SELECT finance_id, COUNT(*) AS cnt
  FROM ocr_jobs WHERE status = 'processing' GROUP BY finance_id
),
cand AS (
  SELECT j.id, j.finance_id, j.created_at,
         ROW_NUMBER() OVER (PARTITION BY j.finance_id ORDER BY j.created_at) AS rn
  FROM ocr_jobs j
  WHERE j.status = 'queued'
    AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= CURRENT_TIMESTAMP)
),
eligible AS (
  SELECT c.id
  FROM cand c LEFT JOIN active a ON a.finance_id = c.finance_id
  WHERE c.rn + COALESCE(a.cnt, 0) <= $1
  ORDER BY c.rn ASC, c.created_at ASC
  LIMIT $2
)
UPDATE ocr_jobs
SET status = 'processing', locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT id FROM ocr_jobs WHERE id IN (SELECT id FROM eligible) FOR UPDATE SKIP LOCKED
)
RETURNING id, batch_id, finance_id, s3_bucket, s3_key, retry_count`;

const claimJobs = async (slots) => {
  if (slots <= 0) return [];
  const cfg = getOcrConfig();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [CLAIM_LOCK_KEY]);
    const { rows } = await client.query(CLAIM_SQL, [cfg.perFinanceConcurrency, slots]);
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

// ── Failure handling ─────────────────────────────────────────────────────────
/** Backoff: 5 s * 2^retry_count. */
const backoffMs = (retryCount) => 5000 * Math.pow(2, retryCount);

const failOrRetry = async (job, err) => {
  const cfg = getOcrConfig();
  const code = (err && err.code) || 'PROCESSING_ERROR';
  const retry = isRetryable(err) && job.retry_count < cfg.maxRetries;
  if (retry) {
    await db.query(
      `UPDATE ocr_jobs
          SET status = 'queued', retry_count = retry_count + 1, error_code = $2,
              next_attempt_at = CURRENT_TIMESTAMP + ($3 || ' milliseconds')::interval,
              locked_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'processing'`,
      [job.id, code, String(backoffMs(job.retry_count))]
    );
  } else {
    await db.query(
      `UPDATE ocr_jobs
          SET status = 'failed', error_code = $2, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'processing'`,
      [job.id, code]
    );
  }
  return { code, retry };
};

// ── Per-job pipeline ─────────────────────────────────────────────────────────
const processJob = async (job) => {
  const started = Date.now();
  const cfg = getOcrConfig();
  let tokensIn = null;
  let tokensOut = null;
  let s3DownloadMs = 0;
  let prepMs = 0;
  let geminiMs = 0;
  let cacheHit = false;
  try {
    const { rows: b } = await db.query('SELECT force_rescan FROM ocr_batches WHERE id = $1', [job.batch_id]);
    const forceRescan = !!(b[0] && b[0].force_rescan);

    let original = typeof ocrS3.takeCachedJobBuffer === 'function' ? ocrS3.takeCachedJobBuffer(job.id) : null;
    if (original) {
      cacheHit = true;
      s3DownloadMs = 0;
    } else {
      const dlStart = Date.now();
      try {
        original = await ocrS3.downloadObject(job.s3_bucket, job.s3_key, cfg.maxFileBytes);
        s3DownloadMs = Date.now() - dlStart;
      } catch (err) {
        s3DownloadMs = Date.now() - dlStart;
        if (err && err.code === 'FILE_TOO_LARGE') throw new OcrError('FILE_TOO_LARGE', false);
        if (err && (err.name === 'NoSuchKey' || (err.$metadata && err.$metadata.httpStatusCode === 404))) {
          throw new OcrError('SOURCE_MISSING', false);
        }
        throw new OcrError('STORAGE_ERROR', true);
      }
    }

    const realMime = detectImageMime(original);
    if (!realMime) throw new OcrError('INVALID_IMAGE', false);

    const sha256 = crypto.createHash('sha256').update(original).digest('hex');
    await db.query('UPDATE ocr_jobs SET sha256_hex = $2, mime_type = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [job.id, sha256, realMime]);

    const model = getModelState().activeModel || cfg.geminiModel;

    // Dedup cache (same finance + hash + prompt version + model, not purged, not expired)
    if (!forceRescan && model) {
      const { rows: hit } = await db.query(
        `SELECT extracted_data FROM ocr_jobs
          WHERE finance_id = $1 AND sha256_hex = $2 AND id <> $3
            AND status = 'complete' AND extracted_data IS NOT NULL AND data_purged_at IS NULL
            AND expires_at > CURRENT_TIMESTAMP
            AND prompt_version = $4 AND model_used = $5
          ORDER BY processed_at DESC NULLS LAST
          LIMIT 1`,
        [job.finance_id, sha256, job.id, cfg.promptVersion, model]
      );
      if (hit.length) {
        await db.query(
          `UPDATE ocr_jobs
              SET status = 'complete', extracted_data = $2, model_used = $3, prompt_version = $4,
                  tokens_in = 0, tokens_out = 0, error_code = NULL, processed_at = CURRENT_TIMESTAMP,
                  locked_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'processing'`,
          [job.id, JSON.stringify(hit[0].extracted_data), model, cfg.promptVersion]
        );
        log({
          event: 'job_done',
          batchId: job.batch_id,
          jobId: job.id,
          status: 'complete_dedup',
          durationMs: Date.now() - started,
          s3DownloadMs,
          prepMs: 0,
          geminiMs: 0,
          cacheHit,
          tokensIn: 0,
          tokensOut: 0,
        });
        return;
      }
    }

    const prepStart = Date.now();
    const prepared = await prepareImage(original, realMime, cfg.imageMaxEdgePx);
    prepMs = Date.now() - prepStart;

    const gemStart = Date.now();
    const result = await extractLedger({ imageBase64: prepared.data.toString('base64'), mimeType: prepared.mimeType });
    geminiMs = Date.now() - gemStart;
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;

    const parsed = parseModelOutput(result.text);
    const clean = sanitizeExtraction(parsed, { extractPayments: cfg.extractPayments });

    await db.query(
      `UPDATE ocr_jobs
          SET status = 'complete', extracted_data = $2, model_used = $3, prompt_version = $4,
              tokens_in = $5, tokens_out = $6, error_code = NULL, processed_at = CURRENT_TIMESTAMP,
              locked_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'processing'`,
      [job.id, JSON.stringify(clean), result.model, cfg.promptVersion, tokensIn, tokensOut]
    );
    log({
      event: 'job_done',
      batchId: job.batch_id,
      jobId: job.id,
      status: 'complete',
      durationMs: Date.now() - started,
      s3DownloadMs,
      prepMs,
      geminiMs,
      cacheHit,
      tokensIn,
      tokensOut,
    });
  } catch (err) {
    let outcome = { code: 'PROCESSING_ERROR', retry: false };
    try {
      outcome = await failOrRetry(job, err);
    } catch {
      /* DB unavailable: the reaper will requeue the job */
    }
    log({
      event: 'job_error',
      batchId: job.batch_id,
      jobId: job.id,
      status: outcome.retry ? 'requeued' : 'failed',
      errorCode: outcome.code,
      durationMs: Date.now() - started,
      s3DownloadMs,
      prepMs,
      geminiMs,
      cacheHit,
      tokensIn,
      tokensOut,
    });
  } finally {
    try {
      await refreshBatchStatus(job.batch_id);
    } catch {
      /* next refresh will fix it */
    }
  }
};

// ── Scheduler ────────────────────────────────────────────────────────────────
let running = false;
let inFlight = 0;
let pumping = false;
const timers = [];

const providerReady = () => getModelState().state === 'ok';

const processAvailableJobs = async () => {
  if (!running || pumping) return;
  pumping = true;
  try {
    if (!providerReady()) {
      const st = getModelState();
      if (st.state === 'unchecked' || st.state === 'unreachable') {
        await ensureModelVerified();
      }
      if (!providerReady()) return;
    }
    const cfg = getOcrConfig();
    const free = cfg.workerConcurrency - inFlight;
    if (free <= 0) return;
    const jobs = await claimJobs(free);
    for (const job of jobs) {
      inFlight++;
      Promise.allSettled([processJob(job)]).then(() => {
        inFlight--;
        setImmediate(processAvailableJobs);
      });
    }
  } catch (err) {
    log({ event: 'claim_error', errorCode: (err && err.code) || 'CLAIM_FAILED' });
  } finally {
    pumping = false;
  }
};

/** Wake the worker right away (called by POST /ocr/jobs/:id/complete and /retry). */
const wake = () => {
  if (running) setImmediate(processAvailableJobs);
};

// ── Reaper ───────────────────────────────────────────────────────────────────
const reapStuckJobs = async () => {
  const cfg = getOcrConfig();
  const { rows } = await db.query(
    `UPDATE ocr_jobs
        SET status = CASE WHEN retry_count >= $1 THEN 'failed' ELSE 'queued' END,
            error_code = CASE WHEN retry_count >= $1 THEN 'WORKER_STALLED' ELSE error_code END,
            retry_count = CASE WHEN retry_count >= $1 THEN retry_count ELSE retry_count + 1 END,
            next_attempt_at = CASE WHEN retry_count >= $1 THEN next_attempt_at ELSE CURRENT_TIMESTAMP END,
            locked_at = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processing'
        AND locked_at < CURRENT_TIMESTAMP - ($2 || ' minutes')::interval
      RETURNING batch_id`,
    [cfg.maxRetries, String(STALL_MINUTES)]
  );
  const batches = [...new Set(rows.map((r) => r.batch_id))];
  for (const id of batches) await refreshBatchStatus(id);
  if (rows.length) log({ event: 'reaper', count: rows.length });
  return rows.length;
};

// ── Retention sweep (image delete + data erase), dry-run by default ─────────
const cleanupExpiredOcr = async () => {
  const cfg = getOcrConfig();
  const dryRun = cfg.sweepDryRun;

  // 1. Images
  const { rows: imgRows } = await db.query(
    `SELECT id, s3_bucket, s3_key FROM ocr_jobs
      WHERE s3_deleted_at IS NULL
        AND (expires_at <= CURRENT_TIMESTAMP
             OR (status IN ('created','cancelled') AND created_at <= CURRENT_TIMESTAMP - interval '24 hours'))
      ORDER BY expires_at ASC
      LIMIT ${SWEEP_BATCH}`
  );
  let imagesDeleted = 0;
  let guardRejected = 0;
  for (const row of imgRows) {
    if (!ocrS3.isDeletableOcrObject(row.s3_bucket, row.s3_key, cfg.bucket)) {
      guardRejected++;
      log({ event: 'sweep_guard_rejected', jobId: row.id });
      continue;
    }
    if (dryRun) continue;
    try {
      await ocrS3.deleteOcrObject(row.s3_bucket, row.s3_key);
      await db.query('UPDATE ocr_jobs SET s3_deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);
      imagesDeleted++;
    } catch {
      log({ event: 'sweep_delete_error', jobId: row.id });
    }
  }

  // 2. Personal data (extracted JSON + client file name)
  const { rows: dataRows } = await db.query(
    `SELECT id, batch_id FROM ocr_jobs
      WHERE expires_at <= CURRENT_TIMESTAMP AND data_purged_at IS NULL
      ORDER BY expires_at ASC
      LIMIT ${SWEEP_BATCH}`
  );
  let dataPurged = 0;
  if (!dryRun && dataRows.length) {
    const ids = dataRows.map((r) => r.id);
    const { rowCount } = await db.query(
      `UPDATE ocr_jobs
          SET extracted_data = NULL, file_name = NULL, data_purged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::uuid[]) AND data_purged_at IS NULL`,
      [ids]
    );
    dataPurged = rowCount;
    const batchIds = [...new Set(dataRows.map((r) => r.batch_id))];
    await db.query(
      `UPDATE ocr_batches b
          SET merged_result = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE b.id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM ocr_jobs j WHERE j.batch_id = b.id AND j.data_purged_at IS NULL)`,
      [batchIds]
    );
  }

  log({
    event: 'sweep',
    dryRun,
    count: dryRun ? imgRows.length - guardRejected + dataRows.length : imagesDeleted + dataPurged,
  });
  return {
    dryRun,
    imageCandidates: imgRows.length,
    imagesDeleted,
    guardRejected,
    dataCandidates: dataRows.length,
    dataPurged,
  };
};

// ── Lifecycle ────────────────────────────────────────────────────────────────
const safe = (fn, event) => async () => {
  try {
    await fn();
  } catch (err) {
    log({ event, errorCode: (err && err.code) || 'ERROR' });
  }
};

const startOcrWorker = async () => {
  if (running) return;
  running = true;
  console.log('[OCR] Worker starting');

  // Retention sweep + reaper run even when the provider is not ready
  safe(cleanupExpiredOcr, 'sweep_error')();
  timers.push(setInterval(safe(cleanupExpiredOcr, 'sweep_error'), SWEEP_MS));
  timers.push(setInterval(safe(reapStuckJobs, 'reaper_error'), REAPER_MS));

  await verifyModel();
  timers.push(
    setInterval(async () => {
      // Re-check only when the provider was unreachable; a missing model (S2) stays disabled.
      if (getModelState().state === 'unreachable') {
        await verifyModel();
        if (providerReady()) wake();
      }
    }, MODEL_RECHECK_MS)
  );
  timers.push(setInterval(processAvailableJobs, FALLBACK_POLL_MS));
  wake();
};

const stopOcrWorker = () => {
  running = false;
  while (timers.length) clearInterval(timers.pop());
};

module.exports = {
  startOcrWorker,
  stopOcrWorker,
  wake,
  processAvailableJobs,
  refreshBatchStatus,
  cleanupExpiredOcr,
  reapStuckJobs,
  // exported for tests
  detectImageMime,
  readImageHeader,
  prepareImage,
  looksComplete,
  decideBatchStatus,
  backoffMs,
  CLAIM_SQL,
};

// Standalone entry: node src/modules/ocr/ocr.worker.js
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
  // Standalone process: never die on a stray rejection from an image library
  process.on('unhandledRejection', () => log({ event: 'unhandled_rejection' }));
  startOcrWorker();
  process.on('SIGTERM', () => {
    stopOcrWorker();
    process.exit(0);
  });
}

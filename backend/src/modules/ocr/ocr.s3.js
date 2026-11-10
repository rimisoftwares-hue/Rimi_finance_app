'use strict';

/**
 * Private S3 helpers for OCR images.
 * Keys are always server generated: ocr/<financeId>/<batchId>/<jobId>.<ext>
 * Deletes are guarded: only the configured bucket and only keys under "ocr/".
 */

const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getOcrConfig, MIME_EXT } = require('./ocr.config');

const OCR_PREFIX = 'ocr/';

// ── Bounded in-memory cache for freshly uploaded job buffers ────────────────
// Eliminates redundant S3 download hop when worker runs in-process, while S3
// remains the durable source of truth for retries and multi-image batches.
const CACHE_MAX_ENTRIES = 10;
const CACHE_MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const CACHE_TTL_MS = 90000; // 90 seconds
const jobBufferCache = new Map();
let cachedTotalBytes = 0;

const evictExpiredJobBuffers = (now = Date.now()) => {
  for (const [id, entry] of jobBufferCache.entries()) {
    if (entry.expiresAt <= now) {
      cachedTotalBytes = Math.max(0, cachedTotalBytes - entry.size);
      jobBufferCache.delete(id);
    }
  }
};

const clearCachedJobBuffer = (jobId) => {
  if (!jobId) return;
  const entry = jobBufferCache.get(jobId);
  if (entry) {
    cachedTotalBytes = Math.max(0, cachedTotalBytes - entry.size);
    jobBufferCache.delete(jobId);
  }
};

const cacheJobBuffer = (jobId, buf) => {
  if (!jobId || !Buffer.isBuffer(buf) || buf.length === 0 || buf.length > CACHE_MAX_BYTES) return false;
  const now = Date.now();
  evictExpiredJobBuffers(now);
  clearCachedJobBuffer(jobId);

  while (
    jobBufferCache.size >= CACHE_MAX_ENTRIES ||
    (jobBufferCache.size > 0 && cachedTotalBytes + buf.length > CACHE_MAX_BYTES)
  ) {
    const oldestKey = jobBufferCache.keys().next().value;
    if (!oldestKey) break;
    clearCachedJobBuffer(oldestKey);
  }

  if (cachedTotalBytes + buf.length > CACHE_MAX_BYTES) return false;
  jobBufferCache.set(jobId, {
    buf,
    size: buf.length,
    expiresAt: now + CACHE_TTL_MS,
  });
  cachedTotalBytes += buf.length;
  return true;
};

const takeCachedJobBuffer = (jobId) => {
  if (!jobId) return null;
  evictExpiredJobBuffers();
  const entry = jobBufferCache.get(jobId);
  if (!entry) return null;
  cachedTotalBytes = Math.max(0, cachedTotalBytes - entry.size);
  jobBufferCache.delete(jobId);
  return entry.buf;
};

let client = null;
const getS3 = () => {
  if (!client) {
    const cfg = getOcrConfig();
    client = new S3Client({
      region: cfg.bucketRegion,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: process.env.ACCESS_KEY,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
};

const buildOcrKey = (financeId, batchId, jobId, mimeType) => {
  const ext = MIME_EXT[mimeType];
  if (!ext) throw new Error('Unsupported MIME type');
  return `${OCR_PREFIX}${financeId}/${batchId}/${jobId}.${ext}`;
};

/** Guard used before ANY destructive operation. */
const isDeletableOcrObject = (bucket, key, configuredBucket) =>
  typeof bucket === 'string' &&
  typeof key === 'string' &&
  !!configuredBucket &&
  bucket === configuredBucket &&
  key.startsWith(OCR_PREFIX) &&
  !key.includes('..');

/**
 * Presigned PUT bound to Content-Type.
 */
const presignPut = async ({ key, contentType }) => {
  const cfg = getOcrConfig();
  const cmd = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3(), cmd, {
    expiresIn: cfg.presignTtlSeconds,
    signableHeaders: new Set(['content-type']),
  });
};

/** Server-side upload to S3 (avoids browser S3 CORS preflight issues). */
const putOcrObject = async (bucket, key, body, contentType) => {
  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
};

/** HeadObject; returns { exists, size } (NotFound -> exists:false). */
const headObject = async (bucket, key) => {
  try {
    const out = await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { exists: true, size: Number(out.ContentLength) };
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    if (status === 404 || (err && (err.name === 'NotFound' || err.name === 'NoSuchKey'))) {
      return { exists: false, size: 0 };
    }
    throw err;
  }
};

/** Download with a hard byte cap enforced while streaming. */
const downloadObject = async (bucket, key, maxBytes) => {
  const out = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  let total = 0;
  for await (const chunk of out.Body) {
    total += chunk.length;
    if (total > maxBytes) {
      if (typeof out.Body.destroy === 'function') out.Body.destroy();
      const e = new Error('FILE_TOO_LARGE');
      e.code = 'FILE_TOO_LARGE';
      throw e;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

/** Guarded delete. NoSuchKey counts as success. */
const deleteOcrObject = async (bucket, key) => {
  const cfg = getOcrConfig();
  if (!isDeletableOcrObject(bucket, key, cfg.bucket)) {
    const e = new Error('DELETE_GUARD_REJECTED');
    e.code = 'DELETE_GUARD_REJECTED';
    throw e;
  }
  try {
    await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (err && (err.name === 'NoSuchKey' || (err.$metadata && err.$metadata.httpStatusCode === 404))) return;
    throw err;
  }
};

module.exports = {
  OCR_PREFIX,
  buildOcrKey,
  isDeletableOcrObject,
  presignPut,
  putOcrObject,
  headObject,
  downloadObject,
  deleteOcrObject,
  cacheJobBuffer,
  takeCachedJobBuffer,
  clearCachedJobBuffer,
};

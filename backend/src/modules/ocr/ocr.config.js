'use strict';

/**
 * OCR configuration read from environment variables.
 * Values are read lazily (getOcrConfig()) so tests can override process.env.
 * Never expose GEMINI_API_KEY outside gemini.service.js.
 */

const intEnv = (name, def, min, max) => {
  const raw = process.env[name];
  const n = raw === undefined || raw === '' ? def : parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

const boolEnv = (name, def) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  return String(raw).trim().toLowerCase() === 'true';
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const PROMPT_VERSION = 'ledger_v1';

const getOcrConfig = () => ({
  enabled: boolEnv('OCR_ENABLED', false),
  workerEnabled: boolEnv('OCR_WORKER_ENABLED', false),
  maxImages: intEnv('OCR_MAX_IMAGES', 1, 1, 5),
  maxFileBytes: intEnv('OCR_MAX_FILE_BYTES', 8 * 1024 * 1024, 1024, 20 * 1024 * 1024),
  workerConcurrency: intEnv('OCR_WORKER_CONCURRENCY', 5, 1, 50),
  perFinanceConcurrency: intEnv('OCR_PER_FINANCE_CONCURRENCY', 3, 1, 20),
  directConcurrency: intEnv('OCR_DIRECT_CONCURRENCY', 8, 1, 50),
  directQueueMax: intEnv('OCR_DIRECT_QUEUE_MAX', 20, 0, 200),
  directQueueWaitMs: intEnv('OCR_DIRECT_QUEUE_WAIT_MS', 20000, 1000, 120000),
  maxRps: intEnv('OCR_MAX_RPS', 10, 1, 1000),
  imageMaxEdgePx: intEnv('OCR_IMAGE_MAX_EDGE_PX', 2048, 512, 8192),
  retentionDays: intEnv('OCR_S3_RETENTION_DAYS', 7, 1, 90),
  sweepDryRun: boolEnv('OCR_S3_SWEEP_DRY_RUN', true),
  extractPayments: boolEnv('OCR_EXTRACT_PAYMENTS', false),
  dailyLimitPerFinance: intEnv('OCR_DAILY_LIMIT_PER_FINANCE', 200, 1, 100000),
  userBatchesPerMinute: intEnv('OCR_USER_BATCHES_PER_MINUTE', 6, 1, 1000),
  geminiModel: (process.env.GEMINI_MODEL || '').trim(),
  geminiFallbackModel: (process.env.GEMINI_FALLBACK_MODEL || '').trim(),
  geminiThinkingLevel: (process.env.GEMINI_THINKING_LEVEL || 'LOW').trim().toUpperCase(),
  geminiTimeoutMs: intEnv('GEMINI_TIMEOUT_MS', 90000, 5000, 600000),
  geminiMaxOutputTokens: intEnv('GEMINI_MAX_OUTPUT_TOKENS', 8192, 1024, 65536),
  bucket: (process.env.BUCKET_NAME || '').trim(),
  bucketRegion: (process.env.BUCKET_REGION || '').trim(),
  allowedMime: ALLOWED_MIME,
  presignTtlSeconds: 600,
  promptVersion: PROMPT_VERSION,
  maxRetries: 3,
});

module.exports = { getOcrConfig, ALLOWED_MIME, MIME_EXT, PROMPT_VERSION };


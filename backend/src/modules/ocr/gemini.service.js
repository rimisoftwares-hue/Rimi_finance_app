'use strict';

/**
 * Gemini service: model verification, extraction request, error classification
 * and a small in-process token-bucket rate limiter.
 *
 * Privacy rules: never log or throw the API key, the image bytes, the prompt text
 * or the model output. Errors carry only a code and a short generic message.
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { getOcrConfig } = require('./ocr.config');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const VALID_THINKING_LEVELS = new Set(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']);

const PAYMENTS_SKIP = 'Do NOT extract payment rows. Set "payments" to [] and "table_headers" to [].';
const PAYMENTS_EXTRACT = 'If the document has a payment ledger table, put its column headers in "table_headers" and its rows in "payments". Otherwise use [].';

class OcrError extends Error {
  constructor(code, retryable = false, message = code) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

// ── Permanent vs retryable classification ───────────────────────────────────
const PERMANENT_CODES = new Set([
  'OUTPUT_TRUNCATED',
  'BLOCKED_BY_PROVIDER',
  'INVALID_IMAGE',
  'INVALID_JSON_AFTER_REPAIR',
  'FILE_TOO_LARGE',
  'UPLOAD_MISMATCH',
  'PROVIDER_REQUEST_REJECTED',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_QUOTA_EXHAUSTED',
  'CLIENT_ABORTED',
]);

/** Parse Retry-After seconds from provider error message or headers if present. */
const parseRetryAfterSec = (err) => {
  if (!err) return null;
  if (Number.isFinite(err.retryAfterSec) && err.retryAfterSec > 0) {
    return Math.ceil(err.retryAfterSec);
  }
  const hdr =
    (err.headers && typeof err.headers.get === 'function' && err.headers.get('retry-after')) ||
    (err.headers && (err.headers['retry-after'] || err.headers['Retry-After']));
  if (hdr !== undefined && hdr !== null) {
    const n = Number(hdr);
    if (Number.isFinite(n) && n > 0) return Math.ceil(n);
  }
  const msg = String(err.message || '');
  const m1 = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (m1) return Math.max(1, Math.ceil(Number(m1[1])));
  const m2 = msg.match(/retry\s+in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (m2) return Math.max(1, Math.ceil(Number(m2[1])));
  return null;
};

/** Classify a 429 error into PROVIDER_QUOTA_EXHAUSTED (non-retryable) vs PROVIDER_RATE_LIMITED. */
const classify429Error = (err) => {
  const msg = String((err && err.message) || '');
  const retryAfterSec = parseRetryAfterSec(err);
  const isDailyOrFreeQuota =
    /PerDay|per\s+day|daily\s+quota|daily\s+limit|FreeTier|free_tier|quota\s+exhausted|limit\s*[:=]\s*0\b|quota_limit_value["':\s]+0\b/i.test(
      msg
    ) || (retryAfterSec !== null && retryAfterSec > 300);

  if (isDailyOrFreeQuota) {
    const qErr = new OcrError('PROVIDER_QUOTA_EXHAUSTED', false);
    qErr.httpStatus = 429;
    return qErr;
  }
  const rErr = new OcrError('PROVIDER_RATE_LIMITED', true);
  rErr.httpStatus = 429;
  if (retryAfterSec !== null) rErr.retryAfterSec = retryAfterSec;
  return rErr;
};

/** Map an HTTP status from the provider to an OcrError. */
const classifyHttpStatus = (status, err = null) => {
  if (status === 429) return err ? classify429Error(err) : new OcrError('PROVIDER_RATE_LIMITED', true);
  if (status >= 500) return new OcrError('PROVIDER_UNAVAILABLE', true);
  if (status === 401 || status === 403) return new OcrError('PROVIDER_AUTH_FAILED', false);
  if (status === 400 || status === 404 || status === 413) return new OcrError('PROVIDER_REQUEST_REJECTED', false);
  return new OcrError('PROVIDER_ERROR', true);
};

/** Map a provider finishReason to an OcrError (or null when the output is usable). */
const classifyFinishReason = (finishReason) => {
  const r = String(finishReason || '').toUpperCase();
  if (r === 'MAX_TOKENS') return new OcrError('OUTPUT_TRUNCATED', false);
  if (['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'].includes(r)) {
    return new OcrError('BLOCKED_BY_PROVIDER', false);
  }
  return null;
};

const isRetryable = (err) => {
  if (!err) return false;
  if (err.code && PERMANENT_CODES.has(err.code)) return false;
  if (typeof err.retryable === 'boolean') return err.retryable;
  // Network / abort errors from fetch are retryable
  return true;
};

// ── Token bucket rate limiter (per process) ─────────────────────────────────
// NOTE: limits are per process. If more than one worker process is started,
// divide OCR_MAX_RPS between them. A distributed limiter is Phase 2.
class TokenBucket {
  constructor(ratePerSec) {
    this.capacity = Math.max(1, ratePerSec);
    this.tokens = this.capacity;
    this.ratePerMs = this.capacity / 1000;
    this.last = Date.now();
  }
  _refill() {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.ratePerMs);
    this.last = now;
  }
  async take() {
    for (;;) {
      this._refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) / this.ratePerMs);
      await new Promise((r) => setTimeout(r, Math.max(5, waitMs)));
    }
  }
}

let bucket = null;
const getBucket = () => {
  if (!bucket) bucket = new TokenBucket(getOcrConfig().maxRps);
  return bucket;
};

// ── System instruction ──────────────────────────────────────────────────────
let promptTemplate = null;
const buildSystemInstruction = (extractPayments) => {
  if (promptTemplate === null) {
    promptTemplate = fs.readFileSync(path.join(__dirname, 'prompts', 'ledger_extraction.v1.txt'), 'utf8');
  }
  return promptTemplate.replace('{{PAYMENTS_RULE}}', extractPayments ? PAYMENTS_EXTRACT : PAYMENTS_SKIP);
};

// ── Model verification (boot check, STOP condition S2) ──────────────────────
// state: 'unchecked' | 'ok' | 'missing' (permanent: model not in provider list) | 'unreachable' (retry later)
const modelState = {
  state: 'unchecked',
  activeModel: null,
  checkedAt: null,
  checkedPrimary: null,
  checkedFallback: null,
};

const apiKey = () => (process.env.GEMINI_API_KEY || '').trim();
const hasApiKey = () => Boolean(apiKey());

const listModels = async (timeoutMs) => {
  const names = [];
  let pageToken = '';
  do {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      const url = `${API_BASE}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      res = await fetch(url, { headers: { 'x-goog-api-key': apiKey() }, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) throw classifyHttpStatus(res.status);
    const body = await res.json();
    for (const m of body.models || []) {
      if (m && m.name) names.push(String(m.name).replace(/^models\//, ''));
    }
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return names;
};

/**
 * Verify GEMINI_MODEL exists. Falls back to GEMINI_FALLBACK_MODEL (with a warning)
 * only if that one exists. Never guesses another model id.
 */
const verifyModel = async () => {
  const cfg = getOcrConfig();
  modelState.checkedAt = new Date();
  modelState.checkedPrimary = cfg.geminiModel;
  modelState.checkedFallback = cfg.geminiFallbackModel;
  if (!apiKey() || !cfg.geminiModel) {
    modelState.state = 'missing';
    modelState.activeModel = null;
    console.error('[OCR] Gemini model check failed: GEMINI_API_KEY or GEMINI_MODEL is not configured. OCR worker disabled.');
    return modelState;
  }
  let names;
  try {
    names = await listModels(15000);
  } catch (err) {
    if (err && err.code === 'PROVIDER_AUTH_FAILED') {
      modelState.state = 'missing';
      modelState.activeModel = null;
      console.error('[OCR] Gemini model check failed: provider rejected the API key. OCR worker disabled.');
      return modelState;
    }
    modelState.state = 'unreachable';
    modelState.activeModel = null;
    console.warn(`[OCR] Gemini model check could not reach the provider (${err && err.code ? err.code : 'NETWORK_ERROR'}). Will retry.`);
    return modelState;
  }
  if (names.includes(cfg.geminiModel)) {
    modelState.state = 'ok';
    modelState.activeModel = cfg.geminiModel;
    console.log(`[OCR] Gemini model check OK: ${cfg.geminiModel}`);
  } else if (cfg.geminiFallbackModel && names.includes(cfg.geminiFallbackModel)) {
    modelState.state = 'ok';
    modelState.activeModel = cfg.geminiFallbackModel;
    console.warn(`[OCR] GEMINI_MODEL "${cfg.geminiModel}" not found; using GEMINI_FALLBACK_MODEL "${cfg.geminiFallbackModel}".`);
  } else {
    modelState.state = 'missing';
    modelState.activeModel = null;
    console.error(
      `[OCR] Gemini model check failed: "${cfg.geminiModel}"${
        cfg.geminiFallbackModel ? ` and fallback "${cfg.geminiFallbackModel}"` : ''
      } not found in provider model list. State: MODEL_UNAVAILABLE.`
    );
  }
  return modelState;
};

let verifyInFlight = null;
const ensureModelVerified = async () => {
  const cfg = getOcrConfig();
  if (!hasApiKey() || !cfg.geminiModel) {
    modelState.state = 'missing';
    modelState.activeModel = null;
    modelState.checkedPrimary = cfg.geminiModel;
    modelState.checkedFallback = cfg.geminiFallbackModel;
    return { ...modelState };
  }
  const configChanged =
    modelState.checkedPrimary !== cfg.geminiModel ||
    modelState.checkedFallback !== cfg.geminiFallbackModel;
  if (modelState.state === 'unchecked' || configChanged) {
    if (!verifyInFlight) {
      verifyInFlight = verifyModel().finally(() => {
        verifyInFlight = null;
      });
    }
    await verifyInFlight;
  }
  return { ...modelState };
};

const getModelState = () => ({ ...modelState });

// ── Extraction request ──────────────────────────────────────────────────────
let genAiClient = null;
let genAiClientKey = null;
let testGenerateContentImpl = null;
const modelsWithoutThinking = new Set();

const setGenerateContentImplForTest = (fn) => {
  testGenerateContentImpl = fn;
};

const clearModelsWithoutThinkingForTest = () => {
  modelsWithoutThinking.clear();
};

const getGenAiClient = () => {
  const key = apiKey();
  if (!genAiClient || genAiClientKey !== key) {
    genAiClient = new GoogleGenAI({ apiKey: key, apiVersion: 'v1beta' });
    genAiClientKey = key;
  }
  return genAiClient;
};

const invokeGenerateContent = async ({ model, imageBase64, mimeType, cfg, thinkingLevel, signal, timeoutMs }) => {
  const systemInstructionText = buildSystemInstruction(cfg.extractPayments);
  const effectiveTimeoutMs = timeoutMs || cfg.geminiTimeoutMs;

  if (signal && signal.aborted) {
    throw new OcrError('CLIENT_ABORTED', false);
  }

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, effectiveTimeoutMs);

  const onCallerAbort = () => ctrl.abort();
  if (signal) {
    signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  try {
    const reqPayload = {
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: 'Extract the ledger card in this image into the JSON schema. Return only JSON.' },
          ],
        },
      ],
      config: {
        systemInstruction: systemInstructionText,
        responseMimeType: 'application/json',
        temperature: 0,
        maxOutputTokens: cfg.geminiMaxOutputTokens,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
        abortSignal: ctrl.signal,
      },
    };
    if (typeof testGenerateContentImpl === 'function') {
      return await testGenerateContentImpl(reqPayload);
    }
    return await getGenAiClient().models.generateContent(reqPayload);
  } catch (err) {
    if (signal && signal.aborted && !timedOut) {
      throw new OcrError('CLIENT_ABORTED', false);
    }
    if (timedOut || (err && err.name === 'AbortError') || ctrl.signal.aborted) {
      throw new OcrError('PROVIDER_TIMEOUT', true);
    }
    if (err instanceof OcrError) {
      throw err;
    }
    if (err && typeof err.status === 'number') {
      const classified = classifyHttpStatus(err.status, err);
      classified.httpStatus = err.status;
      throw classified;
    }
    throw new OcrError('NETWORK_ERROR', true);
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', onCallerAbort);
    }
  }
};

const callModelOnce = async ({ model, imageBase64, mimeType, cfg, signal, timeoutMs }) => {
  const configuredThinking = VALID_THINKING_LEVELS.has(cfg.geminiThinkingLevel) ? cfg.geminiThinkingLevel : null;
  const useThinking = configuredThinking && !modelsWithoutThinking.has(model) ? configuredThinking : null;

  let json;
  try {
    json = await invokeGenerateContent({
      model,
      imageBase64,
      mimeType,
      cfg,
      thinkingLevel: useThinking,
      signal,
      timeoutMs,
    });
  } catch (err) {
    // If a thinking-level parameter is rejected with 400 for a model, retry once without it and remember that for the model.
    if (useThinking && err && err.httpStatus === 400 && (!signal || !signal.aborted)) {
      modelsWithoutThinking.add(model);
      json = await invokeGenerateContent({
        model,
        imageBase64,
        mimeType,
        cfg,
        thinkingLevel: null,
        signal,
        timeoutMs,
      });
    } else {
      throw err;
    }
  }

  if (!json || typeof json !== 'object') {
    throw new OcrError('PROVIDER_BAD_RESPONSE', true);
  }
  if (json.promptFeedback && json.promptFeedback.blockReason) {
    throw new OcrError('BLOCKED_BY_PROVIDER', false);
  }
  const cand = Array.isArray(json.candidates) ? json.candidates[0] : null;
  if (!cand) throw new OcrError('PROVIDER_BAD_RESPONSE', true);

  const finishErr = classifyFinishReason(cand.finishReason);
  if (finishErr) throw finishErr;

  const text = (cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [])
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('');

  const usage = json.usageMetadata || {};
  return {
    text,
    model,
    modelUsed: model,
    tokensIn: Number.isFinite(usage.promptTokenCount) ? usage.promptTokenCount : null,
    tokensOut: Number.isFinite(usage.candidatesTokenCount) ? usage.candidatesTokenCount : null,
  };
};

/**
 * @param {{ imageBase64: string, mimeType: string, signal?: AbortSignal, timeoutMs?: number }} input
 * @returns {Promise<{ text: string, model: string, modelUsed: string, fallbackUsed: boolean, tokensIn: number|null, tokensOut: number|null }>}
 */
const extractLedger = async ({ imageBase64, mimeType, signal, timeoutMs }) => {
  const cfg = getOcrConfig();
  if (!hasApiKey() || !cfg.geminiModel) {
    throw new OcrError('PROVIDER_AUTH_FAILED', false);
  }
  // Boot-time model verification is non-blocking; trigger background check if still unchecked.
  if (modelState.state === 'unchecked') {
    ensureModelVerified().catch(() => {});
  }
  const primaryModel = modelState.activeModel || cfg.geminiModel;
  await getBucket().take();

  try {
    const res = await callModelOnce({ model: primaryModel, imageBase64, mimeType, cfg, signal, timeoutMs });
    return { ...res, model: res.modelUsed, modelUsed: res.modelUsed, fallbackUsed: false };
  } catch (err) {
    if (err && err.code === 'CLIENT_ABORTED') throw err;
    if (signal && signal.aborted) throw new OcrError('CLIENT_ABORTED', false);

    const canFallback =
      Boolean(cfg.geminiFallbackModel) &&
      cfg.geminiFallbackModel !== primaryModel &&
      (err.code === 'PROVIDER_RATE_LIMITED' ||
        err.code === 'PROVIDER_QUOTA_EXHAUSTED' ||
        err.code === 'PROVIDER_UNAVAILABLE' ||
        err.code === 'PROVIDER_TIMEOUT' ||
        err.httpStatus === 404);
    if (!canFallback) throw err;

    await getBucket().take();
    const res = await callModelOnce({
      model: cfg.geminiFallbackModel,
      imageBase64,
      mimeType,
      cfg,
      signal,
      timeoutMs,
    });
    return { ...res, model: res.modelUsed, modelUsed: res.modelUsed, fallbackUsed: true };
  }
};

module.exports = {
  OcrError,
  PERMANENT_CODES,
  classifyHttpStatus,
  classify429Error,
  parseRetryAfterSec,
  classifyFinishReason,
  isRetryable,
  TokenBucket,
  buildSystemInstruction,
  hasApiKey,
  verifyModel,
  ensureModelVerified,
  getModelState,
  extractLedger,
  setGenerateContentImplForTest,
  clearModelsWithoutThinkingForTest,
  PAYMENTS_SKIP,
  PAYMENTS_EXTRACT,
};


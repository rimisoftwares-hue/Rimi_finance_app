'use strict';

/**
 * Shared Sarvam AI SDK Client & Provider Health Classifier (`sarvamClient.js`).
 *
 * Centralizes `SarvamAIClient` instantiation (`sarvamai` SDK), redacts secrets from all
 * provider errors, and classifies failures into actionable categories:
 *   `'auth' | 'quota' | 'model_not_found' | 'network'`
 */

const { SarvamAIClient } = require('sarvamai');
const { getAssistantConfig, redactSecrets } = require('../config/assistant.config');

let cachedClient = null;
let cachedApiKey = null;
let injectedHealthImpl = null;
let healthCache = { checkedAt: 0, result: null };
const HEALTH_CACHE_TTL_MS = 60 * 1000;

function getSarvamClient() {
  const cfg = getAssistantConfig();
  if (!cfg.sarvamConfigured) {
    const err = new Error('SARVAM_API_KEY is not configured');
    err.code = 'SARVAM_NOT_CONFIGURED';
    err.category = 'auth';
    err.statusCode = 503;
    throw err;
  }

  if (!cachedClient || cachedApiKey !== cfg.sarvamApiKey) {
    cachedClient = new SarvamAIClient({
      apiSubscriptionKey: cfg.sarvamApiKey,
    });
    cachedApiKey = cfg.sarvamApiKey;
  }
  return cachedClient;
}

function classifySarvamError(err) {
  const status = Number(err?.statusCode || err?.status || err?.response?.status || 0);
  const rawMessage = redactSecrets(
    err?.body?.error?.message ||
      err?.body?.message ||
      err?.message ||
      'Sarvam voice service request failed'
  );

  if (
    status === 401 ||
    status === 403 ||
    err?.code === 'SARVAM_NOT_CONFIGURED' ||
    /unauthorized|forbidden|invalid.*(?:key|token)|subscription[-_\s]?key/i.test(rawMessage)
  ) {
    return {
      category: 'auth',
      message: 'Voice service authentication failed (check SARVAM_API_KEY or plan access).',
      detail: rawMessage,
    };
  }

  if (
    status === 402 ||
    status === 429 ||
    /quota|credit|insufficient|balance|rate[-_\s]?limit|too many requests/i.test(rawMessage)
  ) {
    return {
      category: 'quota',
      message: 'Voice service quota or rate limit reached.',
      detail: rawMessage,
    };
  }

  if (
    status === 404 ||
    status === 422 ||
    (status === 400 && /model|speaker|voice/i.test(rawMessage)) ||
    /model.*not found|invalid.*(?:model|speaker)|unsupported.*(?:model|speaker)/i.test(rawMessage)
  ) {
    return {
      category: 'model_not_found',
      message: 'Configured voice model or speaker is unavailable on Sarvam.',
      detail: rawMessage,
    };
  }

  return {
    category: 'network',
    message: 'Voice service is temporarily unreachable.',
    detail: rawMessage,
  };
}

function setSarvamHealthImplForTest(fn) {
  injectedHealthImpl = fn;
  healthCache = { checkedAt: 0, result: null };
}

/**
 * Checks Sarvam reachability & subscription validity with zero TTS character burn by
 * verifying the `speechToTextStreaming` WebSocket handshake (`waitForOpen` -> `close`),
 * cached for 60s.
 */
async function checkSarvamHealth({ forceRefresh = false } = {}) {
  if (injectedHealthImpl) {
    return injectedHealthImpl();
  }

  const cfg = getAssistantConfig();
  if (!cfg.sarvamConfigured) {
    return {
      ok: false,
      category: 'auth',
      sttModel: cfg.sttModel,
      ttsModel: cfg.ttsModel,
      ttsVoice: cfg.ttsVoice,
      message: 'SARVAM_API_KEY is missing.',
    };
  }

  if (String(process.env.NODE_ENV || '').trim() === 'test' && !forceRefresh) {
    return {
      ok: true,
      category: null,
      sttModel: cfg.sttModel,
      ttsModel: cfg.ttsModel,
      ttsVoice: cfg.ttsVoice,
      message: 'Sarvam configured (isolated test mode)',
    };
  }

  const now = Date.now();
  if (!forceRefresh && healthCache.result && now - healthCache.checkedAt < HEALTH_CACHE_TTL_MS) {
    return healthCache.result;
  }

  let socket = null;
  let timer = null;
  try {
    const client = getSarvamClient();
    socket = await client.speechToTextStreaming.connect({
      model: cfg.sttModel,
      'language-code': 'unknown',
      input_audio_codec: 'pcm_s16le',
      sample_rate: '16000',
      reconnectAttempts: 0,
    });

    await Promise.race([
      socket.waitForOpen(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Sarvam streaming handshake timed out')), 4500);
      }),
    ]);

    const okResult = {
      ok: true,
      category: null,
      sttModel: cfg.sttModel,
      ttsModel: cfg.ttsModel,
      ttsVoice: cfg.ttsVoice,
      message: 'Sarvam STT/TTS reachable',
    };
    healthCache = { checkedAt: now, result: okResult };
    return okResult;
  } catch (err) {
    const classified = classifySarvamError(err);
    const failResult = {
      ok: false,
      category: classified.category,
      sttModel: cfg.sttModel,
      ttsModel: cfg.ttsModel,
      ttsVoice: cfg.ttsVoice,
      message: classified.message,
    };
    healthCache = { checkedAt: now, result: failResult };
    return failResult;
  } finally {
    if (timer) clearTimeout(timer);
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore close error
      }
    }
  }
}

module.exports = {
  getSarvamClient,
  classifySarvamError,
  checkSarvamHealth,
  setSarvamHealthImplForTest,
};


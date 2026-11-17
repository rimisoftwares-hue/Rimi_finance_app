'use strict';

/**
 * Single Central Configuration for AutoFinex AI Assistant (`assistant.config.js`).
 *
 * ONE voice & model configuration source of truth:
 *   - Default TTS Model : `bulbul:v4-flash` (streaming HTTP `convertStream` across 11 Indian languages + English)
 *   - Default TTS Voice : `aarti_hi_customer` (change `DEFAULT_TTS_VOICE` below to switch the voice globally)
 *   - Default TTS Pace  : `1` (`24000` Hz mono PCM16)
 *   - Default STT Model : `saaras:v3` (streaming WebSocket STT + server VAD + auto language detect)
 *   - Default LLM Models: `gemini-3.5-flash-lite` (primary) -> `gemini-3.5-flash` (fallback)
 *
 * Legacy `.env.local` keys (`SARVAM_TTS_MODEL`, `SARVAM_TTS_VOICE_TA`, `SARVAM_TTS_VOICE_DEFAULT`,
 * `SARVAM_STT_MODEL`) are intentionally ignored so old persona names never conflict with the
 * single assistant voice config.
 */

const { SarvamAI } = require('sarvamai');
const { loadBackendEnv } = require('../../../../config/env.loader');

loadBackendEnv();

// ─── CHANGE `DEFAULT_TTS_VOICE` HERE TO SWITCH THE VOICE GLOBALLY ────────────
// Default: `bulbul:v4-flash` + `aarti_hi_customer` (verified across all 11 Sarvam TTS languages).
// Other valid `bulbul:v4-flash` speakers follow `<name>_<lang>_<style>` from `SarvamAI.TextToSpeechSpeaker`
// (e.g. 'simran_en_conversation', 'priya_enhi_narration', 'dev_en_conversational').
const DEFAULT_TTS_MODEL = 'bulbul:v4-flash';
const DEFAULT_TTS_VOICE = 'aarti_hi_customer'; // change the voice here
const DEFAULT_TTS_PACE = 1;
const DEFAULT_TTS_SAMPLE_RATE = 24000;
const DEFAULT_BULBUL_V3_VOICE = 'priya';
const DEFAULT_STT_MODEL = 'saaras:v3';
const DEFAULT_LLM_PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_LLM_FALLBACK_MODEL = 'gemini-3.5-flash';

const SDK_SPEAKER_VALUES = new Set(Object.values(SarvamAI.TextToSpeechSpeaker || {}));
const SDK_TTS_LANGUAGES = new Set(Object.values(SarvamAI.TextToSpeechLanguage || {}));
const BULBUL_V4_SPEAKERS = new Set(
  Array.from(SDK_SPEAKER_VALUES).filter((s) => typeof s === 'string' && s.includes('_'))
);

const BULBUL_V3_UNIVERSAL_SPEAKERS = new Set(
  [
    'aditya',
    'ritu',
    'priya',
    'neha',
    'rahul',
    'pooja',
    'rohan',
    'simran',
    'kavya',
    'amit',
    'dev',
    'ishita',
    'shreya',
    'ratan',
    'varun',
    'manan',
    'sumit',
    'roopa',
    'kabir',
    'aayan',
    'shubh',
    'ashutosh',
    'advait',
    'anand',
    'tanya',
    'tarun',
    'sunny',
    'mani',
    'gokul',
    'vijay',
    'shruti',
    'suhani',
    'mohit',
    'kavitha',
    'rehan',
    'soham',
    'rupali',
  ].filter((s) => SDK_SPEAKER_VALUES.size === 0 || SDK_SPEAKER_VALUES.has(s))
);

const VALID_TTS_MODELS = new Set(['bulbul:v3', 'bulbul:v4-flash']);
const VALID_STT_MODELS = new Set(['saaras:v3', 'saaras:v4']);
const VERIFIED_GEMINI_MODELS = new Set([
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
]);

let startupValidationLogged = false;

function clampInt(raw, fallback, min, max) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(raw, fallback, min, max) {
  const n = Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Validates TTS model + speaker compatibility against `sarvamai` SDK definitions.
 * Logs a clear warning and falls back to a known-valid default if misconfigured.
 */
function validateAndResolveTtsConfig(rawModel, rawVoice, logger = console) {
  let ttsModel = String(rawModel || DEFAULT_TTS_MODEL).trim() || DEFAULT_TTS_MODEL;
  if (!VALID_TTS_MODELS.has(ttsModel)) {
    logger.warn(
      `[AI-Assistant] Unsupported AI_ASSISTANT_TTS_MODEL "${ttsModel}"; falling back to "${DEFAULT_TTS_MODEL}".`
    );
    ttsModel = DEFAULT_TTS_MODEL;
  }

  const candidateVoice = String(rawVoice || DEFAULT_TTS_VOICE).trim().toLowerCase() || DEFAULT_TTS_VOICE;

  if (ttsModel === 'bulbul:v3') {
    if (BULBUL_V3_UNIVERSAL_SPEAKERS.has(candidateVoice)) {
      return { ttsModel, ttsVoice: candidateVoice, fellBack: false };
    }
    logger.warn(
      `[AI-Assistant] Configured ttsVoice "${candidateVoice}" is not compatible with ttsModel "bulbul:v3"; falling back to "${DEFAULT_BULBUL_V3_VOICE}".`
    );
    return { ttsModel: 'bulbul:v3', ttsVoice: DEFAULT_BULBUL_V3_VOICE, fellBack: true };
  }

  // `bulbul:v4-flash` uses `<name>_<lang>_<style>` persona speaker IDs
  const isV4Persona =
    BULBUL_V4_SPEAKERS.size > 0
      ? BULBUL_V4_SPEAKERS.has(candidateVoice)
      : candidateVoice.includes('_');
  if (isV4Persona) {
    return { ttsModel, ttsVoice: candidateVoice, fellBack: false };
  }

  logger.warn(
    `[AI-Assistant] Configured ttsVoice "${candidateVoice}" is not compatible with ttsModel "${ttsModel}"; falling back to "${DEFAULT_TTS_VOICE}".`
  );
  return { ttsModel, ttsVoice: DEFAULT_TTS_VOICE, fellBack: true };
}

function validateAndResolveSttModel(rawSttModel, logger = console) {
  const candidate = String(rawSttModel || DEFAULT_STT_MODEL).trim() || DEFAULT_STT_MODEL;
  if (VALID_STT_MODELS.has(candidate)) {
    return candidate;
  }
  logger.warn(
    `[AI-Assistant] Unsupported AI_ASSISTANT_STT_MODEL "${candidate}"; falling back to "${DEFAULT_STT_MODEL}".`
  );
  return DEFAULT_STT_MODEL;
}

function validateAndResolveLlmModel(rawModel, fallbackDefault, envName, logger = console) {
  const candidate = String(rawModel || fallbackDefault).trim() || fallbackDefault;
  if (VERIFIED_GEMINI_MODELS.has(candidate)) {
    return candidate;
  }
  logger.warn(
    `[AI-Assistant] Unsupported ${envName} "${candidate}"; falling back to "${fallbackDefault}".`
  );
  return fallbackDefault;
}

/**
 * Redacts API keys, DB passwords, JWT secrets, Bearer tokens, and connection URLs from
 * any error message or log string before logging or returning to callers.
 */
function redactSecrets(input, env = process.env) {
  let out = String(input ?? '');
  if (!out) return '';

  const secretEnvNames = [
    'SARVAM_API_KEY',
    'GEMINI_API_KEY',
    'DB_PASSWORD',
    'VOICE_RO_DB_PASSWORD',
    'AI_SQL_RO_DB_PASSWORD',
    'JWT_SECRET',
    'JWT_FINANCE_SECRET',
    'VOICE_AI_INTERNAL_HMAC_SECRET',
    'AWS_SECRET_ACCESS_KEY',
    'SECRET_ACCESS_KEY',
  ];

  for (const name of secretEnvNames) {
    const val = env[name];
    if (typeof val === 'string' && val.trim().length >= 6) {
      out = out.split(val.trim()).join('[REDACTED]');
    }
  }

  out = out
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/sk_[0-9A-Za-z_-]{16,}/g, '[REDACTED_SARVAM_KEY]')
    .replace(/(api[-_]?key|api[-_]?subscription[-_]?key|password|token)=([^&\s]+)/gi, '$1=[REDACTED]');

  return out;
}

function buildAssistantConfig(env = process.env, options = {}) {
  const silentLogger = { warn: () => { } };
  const logger =
    options.logger ||
    (!startupValidationLogged && env === process.env ? console : silentLogger);

  // Intentionally ignores legacy SARVAM_TTS_MODEL / SARVAM_TTS_VOICE_* / SARVAM_STT_MODEL
  const { ttsModel, ttsVoice } = validateAndResolveTtsConfig(
    env.AI_ASSISTANT_TTS_MODEL || DEFAULT_TTS_MODEL,
    env.AI_ASSISTANT_TTS_VOICE || DEFAULT_TTS_VOICE,
    logger
  );
  const sttModel = validateAndResolveSttModel(
    env.AI_ASSISTANT_STT_MODEL || DEFAULT_STT_MODEL,
    logger
  );
  const llmPrimaryModel = validateAndResolveLlmModel(
    env.AI_ASSISTANT_GEMINI_MODEL || DEFAULT_LLM_PRIMARY_MODEL,
    DEFAULT_LLM_PRIMARY_MODEL,
    'AI_ASSISTANT_GEMINI_MODEL',
    logger
  );
  const llmFallbackModel = validateAndResolveLlmModel(
    env.AI_ASSISTANT_GEMINI_FALLBACK_MODEL || DEFAULT_LLM_FALLBACK_MODEL,
    DEFAULT_LLM_FALLBACK_MODEL,
    'AI_ASSISTANT_GEMINI_FALLBACK_MODEL',
    logger
  );

  if (env === process.env && !startupValidationLogged) {
    startupValidationLogged = true;
  }

  const geminiApiKey = String(env.GEMINI_API_KEY || '').trim();
  const sarvamApiKey = String(env.SARVAM_API_KEY || '').trim();

  const roUser = String(env.VOICE_RO_DB_USER || '').trim();
  const roPassword = String(env.VOICE_RO_DB_PASSWORD || '').trim();

  const dynamicSqlRoUser = String(env.AI_SQL_RO_DB_USER || '').trim();
  const dynamicSqlRoPassword = String(env.AI_SQL_RO_DB_PASSWORD || '').trim();

  const dbHost = String(env.DB_HOST || '127.0.0.1').trim();
  const dbPort = Number(env.DB_PORT || 5432);
  const dbName = String(env.DB_NAME || 'defaultdb').trim();
  const sslMode = String(env.DB_SSLMODE || 'require').trim().toLowerCase();

  const ttsPace = clampFloat(env.AI_ASSISTANT_TTS_PACE, DEFAULT_TTS_PACE, 0.5, 2.0);

  return Object.freeze({
    ttsModel,
    ttsVoice,
    ttsPace,
    ttsSampleRate: DEFAULT_TTS_SAMPLE_RATE,
    ttsSupportedLanguages: SDK_TTS_LANGUAGES,
    sttModel,
    sttSampleRate: 16000,
    llmPrimaryModel,
    llmFallbackModel,
    llmMaxOutputTokens: Math.max(128, Math.min(2048, Number(env.AI_ASSISTANT_MAX_TOKENS) || 700)),
    llmTimeoutMs: Math.max(3000, Math.min(30000, Number(env.GEMINI_TIMEOUT_MS) || 15000)),
    geminiApiKey,
    sarvamApiKey,
    geminiConfigured: geminiApiKey.length > 0,
    sarvamConfigured: sarvamApiKey.length > 0,
    session: Object.freeze({
      maxContextTurns: 8,
      maxUserMessageChars: 1500,
    }),
    // Abuse / cost-control limits (in-memory, per backend process)
    limits: Object.freeze({
      turnTimeoutMs: clampInt(env.AI_ASSISTANT_TURN_TIMEOUT_MS, 45000, 10000, 120000),
      turnsPerMinutePerUser: clampInt(env.AI_ASSISTANT_TURNS_PER_MIN_USER, 20, 1, 200),
      turnsPerMinutePerFinance: clampInt(env.AI_ASSISTANT_TURNS_PER_MIN_FINANCE, 60, 1, 1000),
      dailyTurnCapPerFinance: clampInt(env.AI_ASSISTANT_DAILY_TURN_CAP, 3000, 10, 100000),
      maxConcurrentSessionsPerUser: clampInt(env.AI_ASSISTANT_MAX_WS_SESSIONS_USER, 3, 1, 20),
      maxUtteranceSeconds: clampInt(env.AI_ASSISTANT_MAX_UTTERANCE_SEC, 30, 5, 120),
      wsTicketTtlMs: 60000,
      heartbeatIntervalMs: 25000,
    }),
    cache: Object.freeze({
      redisUrl: String(env.REDIS_URL || '').trim() || null,
      maxMemoryEntries: 500,
      ttlsSec: Object.freeze({
        todayCollection: 20,
        periodCollection: 45,
        overview: 30,
        pendingSummary: 45,
        agentSummary: 45,
        paymentModes: 45,
        loanDisbursement: 60,
        expenseSummary: 60,
        cashSnapshot: 20,
        customerLookup: 15,
        dynamicSelect: 15,
        backendGetApi: 15,
        backendGetCatalog: 300,
      }),
    }),
    // Existing fast parameterized KPI pool (`autofinex_voice_ro` — kept unchanged)
    dbReadOnly: Object.freeze({
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: roUser,
      password: roPassword,
      sslMode,
      dedicatedRoleConfigured: Boolean(roUser && roPassword),
      statementTimeoutMs: 3000,
      lockTimeoutMs: 1000,
      maxResultBytes: 65536,
    }),
    // Dedicated dynamic SQL tool pool (`autofinex_ai_sql_ro` — `ai_ro` views ONLY, zero `public.*` grants)
    dbDynamicSqlReadOnly: Object.freeze({
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dynamicSqlRoUser,
      password: dynamicSqlRoPassword,
      sslMode,
      dedicatedRoleConfigured: Boolean(dynamicSqlRoUser && dynamicSqlRoPassword),
      statementTimeoutMs: 3000,
      lockTimeoutMs: 1000,
      maxRows: 50,
    }),
  });
}

// Run validation once on module import so startup misconfigurations warn immediately
buildAssistantConfig(process.env);

function getAssistantConfig(env = process.env) {
  return buildAssistantConfig(env, { logger: { warn: () => { } } });
}

module.exports = {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_PACE,
  DEFAULT_TTS_SAMPLE_RATE,
  DEFAULT_BULBUL_V3_VOICE,
  DEFAULT_STT_MODEL,
  DEFAULT_LLM_PRIMARY_MODEL,
  DEFAULT_LLM_FALLBACK_MODEL,
  BULBUL_V3_UNIVERSAL_SPEAKERS,
  BULBUL_V4_SPEAKERS,
  SDK_TTS_LANGUAGES,
  VERIFIED_GEMINI_MODELS,
  validateAndResolveTtsConfig,
  validateAndResolveSttModel,
  validateAndResolveLlmModel,
  buildAssistantConfig,
  getAssistantConfig,
  redactSecrets,
};

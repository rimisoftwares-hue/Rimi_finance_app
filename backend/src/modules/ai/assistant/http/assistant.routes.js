'use strict';

/**
 * Authenticated Express HTTP Routes for AutoFinex AI Assistant (`assistant.routes.js`).
 *
 * Mounted under `/api/ai/assistant` behind `enhancedCheckFinance` in `ai.routes.js`.
 * Endpoints:
 *   - `GET  /health`           : Live/cached provider reachability (Sarvam, Gemini, Read-Only DB)
 *                                with explicit error categories (`auth`, `quota`, `model_not_found`, `network`).
 *   - `POST /message`          : Chat/HTTP fallback turn (ignores any client-sent model/voice overrides).
 *   - `POST /voice/transcribe` : Memory-buffered audio upload (10 MB max) -> Sarvam STT.
 *   - `POST /voice/synthesize` : Text -> Sarvam TTS using single server-configured voice.
 */

const express = require('express');
const multer = require('multer');
const { getAssistantConfig, redactSecrets } = require('../config/assistant.config');
const { extractScopeFromHttpRequest, FinanceScopeError } = require('../security/financeScopeValidator');
const { checkReadOnlyDbHealth } = require('../security/readOnlyDbPool');
const { checkSarvamHealth } = require('../providers/sarvamClient');
const { checkGeminiHealth } = require('../providers/geminiStream.provider');
const { transcribeAudioBuffer } = require('../providers/sarvamStt.provider');
const { synthesizeSpeechBuffer } = require('../providers/sarvamTts.provider');
const { runAssistantTurn } = require('../services/aiOrchestrator.service');
const { getCacheModeStatus } = require('../services/aiCache.service');
const { toClientError } = require('../services/clientErrors');
const { consumeTurnBudget, consumeVoiceCallBudget } = require('../security/rateLimiter');
const { issueWsTicket } = require('../security/wsTicket');

const router = express.Router();

const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB memory cap
const uploadAudioMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AUDIO_UPLOAD_BYTES,
    files: 1,
  },
});

/**
 * Builds a single user-readable summary when any AI provider is degraded so the frontend
 * surfaces clear feedback instead of failing silently.
 */
function buildDegradedSummary({ gemini, sarvam, readOnlyDb }) {
  const issues = [];
  if (!gemini.ok) {
    issues.push(gemini.message || `AI language model error (${gemini.category || 'unknown'})`);
  }
  if (!sarvam.ok) {
    issues.push(sarvam.message || `Voice service error (${sarvam.category || 'unknown'})`);
  }
  if (!readOnlyDb.ok) {
    issues.push(readOnlyDb.message || `Database read-only connection error (${readOnlyDb.category || 'unknown'})`);
  }
  return issues.length > 0 ? issues.join(' ') : null;
}

// GET /api/ai/assistant/health
router.get('/health', async (req, res) => {
  try {
    extractScopeFromHttpRequest(req);
    const cfg = getAssistantConfig();
    const forceRefresh = req.query?.refresh === 'true';

    const [gemini, sarvam, readOnlyDb] = await Promise.all([
      checkGeminiHealth({ forceRefresh }),
      checkSarvamHealth({ forceRefresh }),
      checkReadOnlyDbHealth(),
    ]);

    const cacheStatus = getCacheModeStatus();
    const degradedMessage = buildDegradedSummary({ gemini, sarvam, readOnlyDb });
    const allHealthy = Boolean(gemini.ok && sarvam.ok && readOnlyDb.ok);

    return res.status(200).json({
      success: true,
      healthy: allHealthy,
      status: allHealthy ? 'healthy' : 'degraded',
      message: degradedMessage,
      geminiConfigured: cfg.geminiConfigured,
      sttConfigured: cfg.sarvamConfigured,
      ttsConfigured: cfg.sarvamConfigured,
      dedicatedReadOnlyDbRole: cfg.dbReadOnly.dedicatedRoleConfigured,
      cacheMode: cacheStatus.activeTier,
      websocketPath: '/ws/ai-assistant',
      providers: {
        gemini: {
          ok: gemini.ok,
          category: gemini.category,
          message: gemini.message,
        },
        sarvam: {
          ok: sarvam.ok,
          category: sarvam.category,
          message: sarvam.message,
        },
        readOnlyDb: {
          ok: readOnlyDb.ok,
          category: readOnlyDb.category,
          dedicatedRoleConfigured: readOnlyDb.dedicatedRoleConfigured,
          message: readOnlyDb.message,
        },
      },
    });
  } catch (err) {
    const status = err instanceof FinanceScopeError ? err.statusCode : 500;
    return res.status(status).json({
      success: false,
      error: err?.code || 'HEALTH_CHECK_ERROR',
      message: redactSecrets(err?.message || 'Assistant health check failed'),
    });
  }
});

// POST /api/ai/assistant/ws-ticket
// Issues a 60 s single-use ticket so the browser never puts its JWT in the WebSocket URL.
router.post('/ws-ticket', (req, res) => {
  try {
    const scope = extractScopeFromHttpRequest(req);
    const { ticket, expiresInSec } = issueWsTicket(scope);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, ticket, expiresInSec, websocketPath: '/ws/ai-assistant' });
  } catch (err) {
    const status = err instanceof FinanceScopeError ? err.statusCode : 500;
    return res.status(status).json({
      success: false,
      error: err?.code || 'WS_TICKET_ERROR',
      message: status === 500 ? 'Unable to start a voice session right now.' : redactSecrets(err?.message || ''),
    });
  }
});

// POST /api/ai/assistant/message
router.post('/message', async (req, res) => {
  const turnCtrl = new AbortController();
  let timeoutHandle = null;
  try {
    const scope = extractScopeFromHttpRequest(req);
    const cfg = getAssistantConfig();

    const rawMessage = String(req.body?.message || '').trim();
    if (!rawMessage) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_MESSAGE',
        message: 'Message text is required.',
      });
    }
    if (rawMessage.length > cfg.session.maxUserMessageChars) {
      return res.status(400).json({
        success: false,
        error: 'MESSAGE_TOO_LONG',
        message: `Message exceeds maximum length of ${cfg.session.maxUserMessageChars} characters.`,
      });
    }

    consumeTurnBudget(scope);

    req.on('close', () => {
      if (!res.writableEnded) turnCtrl.abort();
    });
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        turnCtrl.abort();
        const e = new Error('turn timeout');
        e.code = 'TURN_TIMEOUT';
        e.statusCode = 504;
        reject(e);
      }, cfg.limits.turnTimeoutMs);
    });

    // Intentionally ignore client-sent llmModel / ttsModel / ttsVoice overrides
    const turnResult = await Promise.race([
      runAssistantTurn({
        scope,
        userText: rawMessage,
        recentTurns: Array.isArray(req.body?.recentTurns) ? req.body.recentTurns.slice(-16) : [],
        sttLanguageCode: req.body?.sttLanguageCode ? String(req.body.sttLanguageCode).slice(0, 12) : null,
        preferredLanguage: req.body?.preferredLanguage ? String(req.body.preferredLanguage).slice(0, 12) : null,
        enableTts: false,
        bypassCache: Boolean(req.body?.bypassCache),
        signal: turnCtrl.signal,
      }),
      timeoutPromise,
    ]);

    return res.status(200).json({
      success: true,
      responseText: turnResult.responseText,
      detectedLanguage: turnResult.detectedLanguage,
      languageLabel: turnResult.languageLabel,
      responseType: turnResult.responseType,
      diagnostics: {
        toolsUsed: turnResult.toolsUsed || [],
      },
    });
  } catch (err) {
    if (res.headersSent) return undefined;
    const status = Number(err?.statusCode) || 500;
    const clientErr = toClientError(err, 'ASSISTANT_MESSAGE_ERROR');
    if (err?.retryAfterSec) res.setHeader('Retry-After', String(err.retryAfterSec));
    return res.status(status).json({
      success: false,
      error: clientErr.code,
      category: clientErr.category,
      message: clientErr.message,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
});

// POST /api/ai/assistant/voice/transcribe
router.post(
  '/voice/transcribe',
  (req, res, next) => {
    uploadAudioMemory.single('audio')(req, res, (uploadErr) => {
      if (!uploadErr) return next();
      const isTooLarge = uploadErr.code === 'LIMIT_FILE_SIZE';
      return res.status(isTooLarge ? 413 : 400).json({
        success: false,
        error: isTooLarge ? 'AUDIO_TOO_LARGE' : 'INVALID_AUDIO_UPLOAD',
        message: isTooLarge
          ? 'Audio clip exceeds the 10 MB maximum upload limit.'
          : redactSecrets(uploadErr.message || 'Invalid audio upload.'),
      });
    });
  },
  async (req, res) => {
    try {
      const scope = extractScopeFromHttpRequest(req);
      consumeVoiceCallBudget(scope);
      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_AUDIO_FILE',
          message: 'Audio file is required in multipart field "audio".',
        });
      }

      const languageHint = req.body?.language ? String(req.body.language).trim() : 'unknown';
      const sttResult = await transcribeAudioBuffer(req.file.buffer, {
        mimeType: req.file.mimetype || 'audio/wav',
        languageHint,
      });

      return res.status(200).json({
        success: true,
        text: sttResult.text,
        detectedLanguage: sttResult.languageCode,
      });
    } catch (err) {
      const status = Number(err?.statusCode) || 502;
      const clientErr = toClientError(err, 'STT_FAILED');
      return res.status(status).json({
        success: false,
        error: clientErr.code,
        category: clientErr.category || 'network',
        message: clientErr.message,
      });
    }
  }
);

// POST /api/ai/assistant/voice/synthesize
router.post('/voice/synthesize', async (req, res) => {
  try {
    const scope = extractScopeFromHttpRequest(req);
    consumeVoiceCallBudget(scope);
    const text = String(req.body?.text || '').trim().slice(0, 2500);
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_TTS_TEXT',
        message: 'Text is required for speech synthesis.',
      });
    }

    // Intentionally ignore client-sent `voice` and `ttsModel` (single configured speaker)
    const languageCode = req.body?.language ? String(req.body.language).trim() : 'en-IN';
    const synthesized = await synthesizeSpeechBuffer({
      text,
      languageCode,
    });

    if (!synthesized || !synthesized.audioBuffer || synthesized.audioBuffer.length === 0) {
      return res.status(204).end();
    }

    res.setHeader('Content-Type', synthesized.mimeType || 'audio/wav');
    res.setHeader('Content-Length', String(synthesized.audioBuffer.length));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(synthesized.audioBuffer);
  } catch (err) {
    const status = Number(err?.statusCode) || 502;
    const clientErr = toClientError(err, 'TTS_FAILED');
    return res.status(status).json({
      success: false,
      error: clientErr.code,
      category: clientErr.category || 'network',
      message: clientErr.message,
    });
  }
});

module.exports = router;

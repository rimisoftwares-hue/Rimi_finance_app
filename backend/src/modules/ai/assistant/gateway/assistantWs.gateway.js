'use strict';

/**
 * Bidirectional Real-Time Voice & Chat WebSocket Gateway (`assistantWs.gateway.js`).
 *
 * Path: `/ws/ai-assistant` — event names come from `config/eventContract.js`.
 *
 * Guarantees:
 *   - Auth on every HTTP `upgrade` (single-use ticket or JWT, same checks as `enhancedCheckFinance`)
 *     plus an `Origin` allow-list check for browser clients.
 *   - Every `assistant.start` is followed by EXACTLY ONE terminal event for that `turnId`
 *     (`assistant.done` | `error` | `turn.aborted`), including on timeout, tool/provider failure,
 *     barge-in, supersede and unexpected exceptions.
 *   - Server-side turn timeout (`limits.turnTimeoutMs`), per-user/per-finance rate limits,
 *     per-user concurrent session cap, max utterance length, 1 MB max frame.
 *   - Hands-free friendly: starting to speak never cancels the answer being prepared; only a
 *     real (meaningful) new transcript supersedes it, or an explicit `turn.barge_in`.
 *   - Server ping/pong heartbeat keeps the socket alive when the browser tab is hidden.
 *   - Zero leaked provider sockets on disconnect; ephemeral RAM history wiped on close.
 *   - Logs never contain transcripts, message text, tokens or customer data.
 */

const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { getAssistantConfig, redactSecrets } = require('../config/assistant.config');
const { SERVER_EVENTS, CLIENT_EVENTS, WS_CLOSE_CODES } = require('../config/eventContract');
const { aiDebug } = require('../config/aiDebug');
const { verifyWebSocketUpgradeScope } = require('../security/financeScopeValidator');
const { consumeTurnBudget, acquireSessionSlot } = require('../security/rateLimiter');
const { createStreamingSttSession } = require('../providers/sarvamStt.provider');
const { runAssistantTurn } = require('../services/aiOrchestrator.service');
const { toClientError } = require('../services/clientErrors');
const { isMeaningfulTranscript } = require('../services/transcriptFilter');
const { normalizeOrigin, resolveAllowedCorsOrigins } = require('../../../../config/cors.config');

const PCM16_BYTES_PER_SEC = 16000 * 2;

function makeId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeSendJson(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Browser clients always send `Origin`; reject unknown origins (CSWSH protection).
 * Non-browser clients (tests, internal tools) omit it and rely on token/ticket auth.
 */
function isAllowedUpgradeOrigin(req, env = process.env) {
  const rawOrigin = req.headers?.origin;
  if (!rawOrigin) return true;
  const normalized = normalizeOrigin(rawOrigin);
  if (!normalized) return false;
  if (resolveAllowedCorsOrigins(env).has(normalized)) return true;
  const host = String(req.headers?.host || '').toLowerCase();
  try {
    return Boolean(host) && new URL(normalized).host === host;
  } catch {
    return false;
  }
}

function attachAssistantWebSocketGateway(httpServer, deps = {}) {
  const verifyUpgrade = deps.verifyUpgradeScope || verifyWebSocketUpgradeScope;
  const runTurn = deps.runAssistantTurn || runAssistantTurn;
  const makeSttSession = deps.createStreamingSttSession || createStreamingSttSession;
  const consumeBudget = deps.consumeTurnBudget || consumeTurnBudget;
  const acquireSlot = deps.acquireSessionSlot || acquireSessionSlot;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024, // 1 MB max single frame
  });

  const rejectUpgrade = (socket, status, code, message) => {
    const statusText =
      status === 403 ? 'Forbidden' : status === 400 ? 'Bad Request' : status === 429 ? 'Too Many Requests' : 'Unauthorized';
    try {
      socket.write(
        `HTTP/1.1 ${status} ${statusText}\r\n` +
          `Content-Type: application/json\r\n` +
          `Connection: close\r\n\r\n` +
          JSON.stringify({ error: code, message })
      );
    } catch {
      // ignore socket write error
    }
    socket.destroy();
  };

  httpServer.on('upgrade', async (req, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      pathname = '';
    }
    if (pathname !== '/ws/ai-assistant') {
      return;
    }

    if (!isAllowedUpgradeOrigin(req)) {
      aiDebug('ws.upgrade.rejected', { reason: 'origin' });
      rejectUpgrade(socket, 403, 'ORIGIN_NOT_ALLOWED', 'Origin not allowed');
      return;
    }

    try {
      const scope = await verifyUpgrade(req);
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, scope);
      });
    } catch (err) {
      const status = Number(err?.statusCode) || 401;
      aiDebug('ws.upgrade.rejected', { reason: err?.code || 'AUTH_FAILED', status });
      rejectUpgrade(socket, status, err?.code || 'AUTH_FAILED', redactSecrets(err?.message || 'Authentication failed'));
    }
  });

  // Server-driven heartbeat: browser answers pings natively even in hidden/background tabs.
  const heartbeatMs = getAssistantConfig().limits.heartbeatIntervalMs;
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.__afAlive === false) {
        try {
          client.close(WS_CLOSE_CODES.HEARTBEAT_TIMEOUT, 'heartbeat timeout');
        } catch {
          // ignore
        }
        client.terminate();
        continue;
      }
      client.__afAlive = false;
      try {
        client.ping();
      } catch {
        // ignore
      }
    }
  }, heartbeatMs);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws, _req, scope) => {
    const cfg = getAssistantConfig();
    const maxHistoryItems = cfg.session.maxContextTurns * 2;
    const maxUtteranceBytes = cfg.limits.maxUtteranceSeconds * PCM16_BYTES_PER_SEC;
    const connId = makeId().slice(0, 8);

    ws.__afAlive = true;
    ws.on('pong', () => {
      ws.__afAlive = true;
    });

    const slot = acquireSlot(scope);
    if (!slot.ok) {
      safeSendJson(ws, {
        type: SERVER_EVENTS.ERROR,
        code: 'TOO_MANY_SESSIONS',
        message: 'Too many open AI assistant sessions. Close other windows and try again.',
      });
      ws.close(WS_CLOSE_CODES.TOO_MANY_SESSIONS, 'too many sessions');
      return;
    }

    let recentTurns = [];
    let ttsEnabled = true;
    let activeTurn = null; // { id, ctrl, terminalSent, timer, abortReason }
    let activeSttSession = null;
    let sttBytes = 0;
    let sttCommitting = false;
    let clientUsesExplicitAudioStart = false;
    let awaitingNextAudioStart = false;
    let closed = false;
    let binaryFrames = 0;
    let binaryBytes = 0;

    aiDebug('ws.open', { connId, role: scope?.role });

    const send = (payload) => {
      if (
        payload.type !== SERVER_EVENTS.AUDIO_CHUNK &&
        payload.type !== SERVER_EVENTS.ASSISTANT_DELTA &&
        payload.type !== SERVER_EVENTS.TRANSCRIPT_PARTIAL
      ) {
        aiDebug('ws.out', { connId, type: payload.type, code: payload.code, status: payload.status });
      }
      return safeSendJson(ws, payload);
    };

    /** STT-level status updates must never clobber the status of an in-flight answer. */
    const sendSttStatus = (status) => {
      if (activeTurn) return;
      send({ type: SERVER_EVENTS.STATUS_CHANGE, status });
    };

    const pushHistoryPair = (userText, assistantText) => {
      const u = String(userText || '').trim();
      const a = String(assistantText || '').trim();
      if (u) recentTurns.push({ role: 'user', text: u });
      if (a) recentTurns.push({ role: 'assistant', text: a });
      if (recentTurns.length > maxHistoryItems) {
        recentTurns = recentTurns.slice(-maxHistoryItems);
      }
    };

    const abortActiveStt = () => {
      sttCommitting = false;
      sttBytes = 0;
      if (activeSttSession) {
        const s = activeSttSession;
        activeSttSession = null;
        try {
          s.abort();
        } catch {
          // ignore
        }
      }
    };

    /** Emits the single terminal event of `turn` (idempotent). */
    const finishTurn = (turn, payload) => {
      if (!turn || turn.terminalSent) return false;
      turn.terminalSent = true;
      clearTimeout(turn.timer);
      if (activeTurn === turn) activeTurn = null;
      send({ ...payload, turnId: turn.id });
      send({ type: SERVER_EVENTS.STATUS_CHANGE, turnId: turn.id, status: 'idle' });
      return true;
    };

    const abortActiveTurn = (reason = 'barge_in') => {
      const turn = activeTurn;
      if (!turn) {
        if (reason === 'barge_in') {
          send({ type: SERVER_EVENTS.TURN_ABORTED, turnId: null, reason });
        }
        return;
      }
      turn.abortReason = reason;
      try {
        turn.ctrl.abort();
      } catch {
        // ignore
      }
      finishTurn(turn, { type: SERVER_EVENTS.TURN_ABORTED, reason });
    };

    const executeConversationTurn = async ({
      userText,
      sttLanguageCode = null,
      speak = ttsEnabled,
      bypassCache = false,
      sttFinalMs = null,
    }) => {
      const cleanText = String(userText || '').trim();
      if (!cleanText || closed) return;

      if (cleanText.length > cfg.session.maxUserMessageChars) {
        send({
          type: SERVER_EVENTS.ERROR,
          code: 'MESSAGE_TOO_LONG',
          message: toClientError({ code: 'MESSAGE_TOO_LONG' }).message,
        });
        return;
      }

      try {
        consumeBudget(scope);
      } catch (limitErr) {
        const clientErr = toClientError(limitErr, 'RATE_LIMITED');
        send({ type: SERVER_EVENTS.ERROR, code: clientErr.code, message: clientErr.message });
        return;
      }

      // A newer question supersedes the previous answer (terminal `turn.aborted` for the old one)
      abortActiveTurn('superseded');

      const turn = {
        id: makeId(),
        ctrl: new AbortController(),
        terminalSent: false,
        timer: null,
        abortReason: null,
      };
      activeTurn = turn;
      const turnId = turn.id;
      const historySnapshot = recentTurns.slice();
      const turnStartedAt = Date.now();
      let firstDeltaMs = null;
      let firstAudioMs = null;

      turn.timer = setTimeout(() => {
        turn.abortReason = 'timeout';
        try {
          turn.ctrl.abort();
        } catch {
          // ignore
        }
        aiDebug('turn.timeout', { connId, turnId: turnId.slice(0, 8), ms: Date.now() - turnStartedAt });
        finishTurn(turn, {
          type: SERVER_EVENTS.ERROR,
          code: 'TURN_TIMEOUT',
          message: toClientError({ code: 'TURN_TIMEOUT' }).message,
        });
      }, deps.turnTimeoutMs || cfg.limits.turnTimeoutMs);
      if (typeof turn.timer.unref === 'function') turn.timer.unref();

      const isLive = () => !turn.terminalSent && !turn.ctrl.signal.aborted;

      send({ type: SERVER_EVENTS.ASSISTANT_START, turnId });
      send({ type: SERVER_EVENTS.STATUS_CHANGE, turnId, status: 'thinking' });

      try {
        const result = await runTurn({
          scope,
          userText: cleanText,
          recentTurns: historySnapshot,
          sttLanguageCode,
          enableTts: Boolean(speak),
          bypassCache: Boolean(bypassCache),
          signal: turn.ctrl.signal,
          onStatusChange: (status) => {
            if (isLive()) send({ type: SERVER_EVENTS.STATUS_CHANGE, turnId, status });
          },
          onTextDelta: (delta) => {
            if (!isLive()) return;
            if (firstDeltaMs === null) firstDeltaMs = Date.now() - turnStartedAt;
            send({ type: SERVER_EVENTS.ASSISTANT_DELTA, turnId, delta });
          },
          onAudioChunk: (chunk) => {
            if (!isLive()) return;
            if (firstAudioMs === null) firstAudioMs = Date.now() - turnStartedAt;
            const audioBase64 =
              chunk.audioBase64 ||
              (Buffer.isBuffer(chunk.audioBuffer) ? chunk.audioBuffer.toString('base64') : '');
            if (!audioBase64) return;
            send({
              type: SERVER_EVENTS.AUDIO_CHUNK,
              turnId,
              seq: chunk.seq,
              mimeType: chunk.mimeType || 'audio/pcm',
              sampleRate: chunk.sampleRate || cfg.ttsSampleRate,
              audioBase64,
            });
          },
          onTtsError: (ttsErr) => {
            if (!isLive()) return;
            const clientErr = toClientError(ttsErr, 'TTS_FAILED');
            send({
              type: SERVER_EVENTS.ERROR,
              code: clientErr.code,
              category: clientErr.category,
              message: clientErr.message,
            });
          },
        });

        if (!isLive()) {
          // Aborted (barge-in / supersede / timeout) while the provider was unwinding.
          pushHistoryPair(cleanText, '');
          finishTurn(turn, { type: SERVER_EVENTS.TURN_ABORTED, reason: turn.abortReason || 'aborted' });
          return;
        }

        pushHistoryPair(cleanText, result?.responseText);

        if (process.env.NODE_ENV !== 'test') {
          console.info(
            `[AI-WS] turn complete lang=${result?.detectedLanguage} type=${result?.responseType}` +
              (sttFinalMs !== null ? ` sttMs=${sttFinalMs}` : '') +
              (firstDeltaMs !== null ? ` firstTokenMs=${firstDeltaMs}` : '') +
              (firstAudioMs !== null ? ` firstAudioMs=${firstAudioMs}` : '')
          );
        }

        finishTurn(turn, {
          type: SERVER_EVENTS.ASSISTANT_DONE,
          responseText: String(result?.responseText || ''),
          detectedLanguage: result?.detectedLanguage || 'en-IN',
          languageLabel: result?.languageLabel || '',
          responseType: result?.responseType || 'general',
          toolsUsed: result?.toolsUsed || [],
        });
      } catch (err) {
        if (turn.ctrl.signal.aborted || err?.code === 'CLIENT_ABORTED') {
          pushHistoryPair(cleanText, '');
          finishTurn(turn, { type: SERVER_EVENTS.TURN_ABORTED, reason: turn.abortReason || 'aborted' });
          return;
        }
        const clientErr = toClientError(err);
        if (process.env.NODE_ENV !== 'test') {
          console.warn(`[AI-WS] turn failed code=${clientErr.code} category=${clientErr.category || 'none'}`);
        }
        finishTurn(turn, {
          type: SERVER_EVENTS.ERROR,
          code: clientErr.code,
          category: clientErr.category,
          message: clientErr.message,
        });
      } finally {
        // Absolute safety net: no turn may ever stay open.
        finishTurn(turn, {
          type: SERVER_EVENTS.ERROR,
          code: 'ASSISTANT_TURN_ERROR',
          message: toClientError({}).message,
        });
      }
    };

    const commitCurrentSttUtterance = async () => {
      if (sttCommitting || !activeSttSession || closed) return;
      sttCommitting = true;
      if (clientUsesExplicitAudioStart) {
        awaitingNextAudioStart = true;
      }
      const sessionToCommit = activeSttSession;
      activeSttSession = null;
      sttBytes = 0;
      const commitStartedAt = Date.now();

      try {
        sendSttStatus('thinking');
        const { text, languageCode } = await sessionToCommit.commit();
        const sttFinalMs = Date.now() - commitStartedAt;
        if (closed) return;

        const cleanTranscript = String(text || '').trim();
        if (!isMeaningfulTranscript(cleanTranscript)) {
          aiDebug('stt.ignored', { connId, chars: cleanTranscript.length });
          send({ type: SERVER_EVENTS.TRANSCRIPT_EMPTY });
          sendSttStatus('idle');
          return;
        }

        send({
          type: SERVER_EVENTS.TRANSCRIPT_FINAL,
          text: cleanTranscript,
          detectedLanguage: languageCode || null,
        });

        sttCommitting = false;
        await executeConversationTurn({
          userText: cleanTranscript,
          sttLanguageCode: languageCode || null,
          speak: ttsEnabled,
          sttFinalMs,
        });
      } catch (err) {
        if (!closed) {
          const clientErr = toClientError(err, 'STT_ERROR');
          send({ type: SERVER_EVENTS.ERROR, code: clientErr.code, message: clientErr.message });
          sendSttStatus('idle');
        }
      } finally {
        sttCommitting = false;
      }
    };

    const startFreshSttUtterance = () => {
      abortActiveStt();
      sendSttStatus('listening');

      activeSttSession = makeSttSession({
        onPartialTranscript: ({ text, languageCode }) => {
          if (!closed && text) {
            send({
              type: SERVER_EVENTS.TRANSCRIPT_PARTIAL,
              text,
              detectedLanguage: languageCode || null,
            });
          }
        },
        onVadSpeechStart: () => {
          if (!closed) sendSttStatus('listening');
        },
        onVadSpeechEnd: () => {
          // Server VAD is the primary end-of-turn signal (client silence timer is the fallback)
          commitCurrentSttUtterance();
        },
        onError: (err) => {
          if (closed) return;
          aiDebug('stt.error', { connId, code: err?.code || 'STT_STREAM_ERROR' });
          abortActiveStt();
          send({
            type: SERVER_EVENTS.ERROR,
            code: 'STT_STREAM_ERROR',
            message: toClientError({ code: 'STT_STREAM_ERROR' }).message,
          });
          sendSttStatus('idle');
        },
      });
    };

    send({
      type: SERVER_EVENTS.SESSION_READY,
      financeName: scope.financeName,
      role: scope.role,
      ttsConfigured: cfg.sarvamConfigured,
      sttConfigured: cfg.sarvamConfigured,
      geminiConfigured: cfg.geminiConfigured,
    });

    ws.on('message', (rawData, isBinary) => {
      if (closed) return;

      if (isBinary) {
        const frame = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
        binaryFrames += 1;
        binaryBytes += frame.length;
        if (binaryFrames === 1 || binaryFrames % 100 === 0) {
          aiDebug('ws.in.binary', { connId, binaryFrames, binaryBytes });
        }
        if (sttCommitting || awaitingNextAudioStart) return; // trailing frames after server VAD commit are dropped
        if (!activeSttSession) {
          startFreshSttUtterance();
        }
        if (activeSttSession) {
          sttBytes += frame.length;
          activeSttSession.pushPcmFrame(frame);
          if (sttBytes >= maxUtteranceBytes) {
            aiDebug('stt.max_utterance', { connId, sttBytes });
            commitCurrentSttUtterance();
          }
        }
        return;
      }

      let msg;
      try {
        msg = JSON.parse(rawData.toString('utf8'));
      } catch {
        send({ type: SERVER_EVENTS.ERROR, code: 'INVALID_JSON', message: 'Malformed WebSocket message payload.' });
        return;
      }

      if (!msg || typeof msg.type !== 'string') return;
      aiDebug('ws.in', { connId, type: msg.type });

      switch (msg.type) {
        case CLIENT_EVENTS.PING: {
          send({ type: SERVER_EVENTS.PONG, ts: Date.now() });
          break;
        }
        case CLIENT_EVENTS.SESSION_CONFIG: {
          // Intentionally ignore client-sent llmModel / ttsModel / ttsVoice (single server config)
          if (typeof msg.ttsEnabled === 'boolean') {
            ttsEnabled = msg.ttsEnabled;
          }
          // Restore bounded client-held conversation context on WebSocket reconnect when server RAM is empty
          if (recentTurns.length === 0 && Array.isArray(msg.recentTurns)) {
            const restored = [];
            for (const item of msg.recentTurns.slice(-maxHistoryItems)) {
              if (!item || typeof item.text !== 'string') continue;
              const role =
                item.role === 'assistant'
                  ? 'assistant'
                  : item.role === 'user'
                    ? 'user'
                    : null;
              const text = item.text.trim().slice(0, 1500);
              if (role && text) {
                restored.push({ role, text });
              }
            }
            if (restored.length > 0) {
              recentTurns = restored.slice(-maxHistoryItems);
            }
          }
          break;
        }
        case CLIENT_EVENTS.AUDIO_START: {
          clientUsesExplicitAudioStart = true;
          awaitingNextAudioStart = false;
          // Never cancels the answer being prepared (hands-free noise must not kill replies)
          if (!sttCommitting) startFreshSttUtterance();
          break;
        }
        case CLIENT_EVENTS.AUDIO_COMMIT: {
          commitCurrentSttUtterance();
          break;
        }
        case CLIENT_EVENTS.AUDIO_CANCEL: {
          abortActiveStt();
          sendSttStatus('idle');
          break;
        }
        case CLIENT_EVENTS.TURN_BARGE_IN: {
          abortActiveTurn('barge_in');
          break;
        }
        case CLIENT_EVENTS.TEXT_MESSAGE: {
          abortActiveStt();
          const speak = typeof msg.speak === 'boolean' ? msg.speak : ttsEnabled;
          executeConversationTurn({
            userText: typeof msg.text === 'string' ? msg.text : '',
            speak,
            bypassCache: Boolean(msg.bypassCache),
          });
          break;
        }
        case CLIENT_EVENTS.SESSION_CLEAR: {
          abortActiveStt();
          abortActiveTurn('session_clear');
          recentTurns = [];
          send({ type: SERVER_EVENTS.SESSION_CLEARED });
          break;
        }
        default:
          break;
      }
    });

    const cleanupConnection = () => {
      if (closed) return;
      closed = true;
      abortActiveStt();
      if (activeTurn) {
        activeTurn.abortReason = 'socket_closed';
        try {
          activeTurn.ctrl.abort();
        } catch {
          // ignore
        }
        clearTimeout(activeTurn.timer);
        activeTurn.terminalSent = true;
        activeTurn = null;
      }
      recentTurns = [];
      slot.release();
    };

    ws.on('close', (code) => {
      aiDebug('ws.close', { connId, code, binaryFrames, binaryBytes });
      cleanupConnection();
    });
    ws.on('error', cleanupConnection);
  });

  return wss;
}

module.exports = {
  attachAssistantWebSocketGateway,
  isAllowedUpgradeOrigin,
};

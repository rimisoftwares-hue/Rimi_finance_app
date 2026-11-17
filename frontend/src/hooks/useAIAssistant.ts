// src/hooks/useAIAssistant.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistantChatMessage,
  AssistantVisualState,
  EphemeralTurnRef,
  WsServerEvent,
  buildAssistantWsUrlWithTicket,
  encodePcm16ToWavBlob,
  fetchAssistantHealth,
  fetchAssistantWsTicket,
  formatAssistantProviderError,
  getActiveFinanceIdSafe,
  resolveAssistantWebSocketEndpoint,
  sendAssistantMessageHttp,
  synthesizeVoiceHttp,
  transcribeVoiceHttp,
} from '../services/aiAssistant.service';
import { CLIENT_EVENTS, SERVER_EVENTS, WS_CLOSE_CODES } from '../services/aiAssistant.events';
import { useSpeechPlayback } from './useSpeechPlayback';
import { useRealtimeVoiceSession } from './useRealtimeVoiceSession';
import { usePermissionFlow } from './usePermissionFlow';

const SESSION_TURNS_KEY_PREFIX = 'af_ai_session_turns:';
const MIC_NOTICE_ACK_KEY = 'af_ai_mic_notice_ack';
const MAX_CACHED_SESSION_MESSAGES = 30;

/** Frontend watchdog: backend times out at 45 s, so this only fires if the server goes silent. */
export const TURN_WATCHDOG_MS = 60000;
/** Always-on mic auto-stops after this long without any detected speech. */
export const MIC_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const WS_CONNECT_TIMEOUT_MS = 8000;
const MAX_RECONNECT_ATTEMPTS = 6;

export type VoicePhase = 'off' | 'connecting' | 'listening' | 'hearing' | 'thinking' | 'speaking';

function makeEphemeralId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadSessionMessagesForFinance(financeId: string): AssistantChatMessage[] {
  if (typeof window === 'undefined' || !financeId) return [];
  try {
    const raw = sessionStorage.getItem(`${SESSION_TURNS_KEY_PREFIX}${financeId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0
      )
      .slice(-MAX_CACHED_SESSION_MESSAGES)
      .map((m) => ({ ...m, streaming: false }));
  } catch {
    return [];
  }
}

function saveSessionMessagesForFinance(financeId: string, msgs: AssistantChatMessage[]) {
  if (typeof window === 'undefined' || !financeId) return;
  try {
    const cleanCompleted = msgs
      .filter((m) => !m.streaming && m.content.trim().length > 0)
      .slice(-MAX_CACHED_SESSION_MESSAGES);
    if (cleanCompleted.length === 0) {
      sessionStorage.removeItem(`${SESSION_TURNS_KEY_PREFIX}${financeId}`);
    } else {
      sessionStorage.setItem(`${SESSION_TURNS_KEY_PREFIX}${financeId}`, JSON.stringify(cleanCompleted));
    }
  } catch {
    // ignore storage quota errors
  }
}

function clearAllSessionTurnCaches() {
  if (typeof window === 'undefined') return;
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_TURNS_KEY_PREFIX)) keysToDelete.push(k);
    }
    keysToDelete.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}

function readMicNoticeAck(): boolean {
  try {
    return localStorage.getItem(MIC_NOTICE_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Primary AutoFinex AI Voice & Chat Assistant session (mounted ONCE by `AIAssistantProvider`).
 *
 * Root-cause fix (2026-11): connections are released ONLY on unmount / explicit stop. Every
 * callback reads the latest playback / mic controllers through refs, so re-renders can never
 * close the WebSocket or stop the microphone again.
 *
 * Delivers:
 *   - WebSocket (`/ws/ai-assistant`, single-use ticket auth) + automatic HTTP fallback for text.
 *   - Hands-free continuous voice: mic stays on across panel minimise and route changes until the
 *     user stops it, logs out, switches company, loses mic permission, or after 5 min of silence.
 *   - Auto-reconnect with backoff while the voice session is on; mic re-acquire on device loss.
 *   - Turn watchdog: the UI always leaves "thinking" with a readable error.
 */
export function useAIAssistant() {
  const initialFinanceId = getActiveFinanceIdSafe();
  const [activeFinanceId, setActiveFinanceId] = useState<string>(initialFinanceId);
  const [messages, setMessages] = useState<AssistantChatMessage[]>(() =>
    loadSessionMessagesForFinance(initialFinanceId)
  );
  const [partialTranscript, setPartialTranscript] = useState<string>('');
  const [serverStatus, setServerStatus] = useState<AssistantVisualState>('idle');
  const [handsFree, setHandsFree] = useState<boolean>(true);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceSessionActive, setVoiceSessionActive] = useState<boolean>(false);
  const [voiceConnecting, setVoiceConnecting] = useState<boolean>(false);
  const [awaitingReply, setAwaitingReply] = useState<boolean>(false);
  const [micNoticeVisible, setMicNoticeVisible] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const connectPromiseRef = useRef<Promise<WebSocket | null> | null>(null);
  const intentionallyClosedRef = useRef<WeakSet<WebSocket>>(new WeakSet());
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const voiceSessionActiveRef = useRef<boolean>(false);
  const awaitingReplyRef = useRef<boolean>(false);
  const watchdogTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const httpAbortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<AssistantChatMessage[]>(messages);
  messagesRef.current = messages;

  const speech = useSpeechPlayback({
    onPlaybackError: (msg) => setError(msg),
  });
  const speechRef = useRef(speech);
  speechRef.current = speech;

  const micPermissionFlow = usePermissionFlow('microphone');

  useEffect(() => {
    saveSessionMessagesForFinance(activeFinanceId, messages);
  }, [activeFinanceId, messages]);

  // ─── Small helpers (all stable) ──────────────────────────────────────────────
  const sendWsJson = useCallback((payload: Record<string, unknown>): boolean => {
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      try {
        sock.send(JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  const finalizeStreamingMessages = useCallback(() => {
    setMessages((prev) =>
      prev
        .map((m) => (m.streaming ? { ...m, streaming: false } : m))
        .filter((m) => !(m.role === 'assistant' && !m.content.trim()))
    );
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current !== null) {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const setAwaiting = useCallback(
    (next: boolean) => {
      awaitingReplyRef.current = next;
      setAwaitingReply(next);
      if (!next) clearWatchdog();
    },
    [clearWatchdog]
  );

  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogTimerRef.current = window.setTimeout(() => {
      watchdogTimerRef.current = null;
      if (!awaitingReplyRef.current) return;
      awaitingReplyRef.current = false;
      setAwaitingReply(false);
      finalizeStreamingMessages();
      setServerStatus('idle');
      setError('The AI took too long to answer. Please try again.');
    }, TURN_WATCHDOG_MS);
  }, [clearWatchdog, finalizeStreamingMessages]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // `voice` is created below; callbacks reach it through this ref.
  const voiceRef = useRef<ReturnType<typeof useRealtimeVoiceSession> | null>(null);
  const stopVoiceSessionRef = useRef<(reason: 'user' | 'idle' | 'error' | 'system') => void>(() => {});

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (!voiceSessionActiveRef.current) return;
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      if (!voiceSessionActiveRef.current) return;
      stopVoiceSessionRef.current('idle');
      setNotice('Microphone turned off after 5 minutes without speech.');
    }, MIC_IDLE_TIMEOUT_MS);
  }, [clearIdleTimer]);

  // ─── Server event handling (always the latest closure via ref) ───────────────
  const handleWsServerEvent = useCallback(
    (event: WsServerEvent) => {
      switch (event.type) {
        case SERVER_EVENTS.SESSION_READY: {
          setWsConnected(true);
          break;
        }
        case SERVER_EVENTS.STATUS_CHANGE: {
          setServerStatus(event.status);
          if (event.turnId && awaitingReplyRef.current) armWatchdog();
          break;
        }
        case SERVER_EVENTS.TRANSCRIPT_PARTIAL: {
          setPartialTranscript(event.text || '');
          armIdleTimer();
          break;
        }
        case SERVER_EVENTS.TRANSCRIPT_FINAL: {
          voiceRef.current?.notifyServerVadCommitted();
          setPartialTranscript('');
          armIdleTimer();
          if (event.text?.trim()) {
            // A new spoken question supersedes whatever the AI is still saying
            speechRef.current.stopPlayback();
            setError(null);
            setNotice(null);
            setMessages((prev) => [
              ...prev,
              {
                id: makeEphemeralId(),
                role: 'user',
                content: event.text.trim(),
                createdAt: Date.now(),
                languageCode: event.detectedLanguage || undefined,
                viaVoice: true,
              },
            ]);
            setAwaiting(true);
            armWatchdog();
          }
          break;
        }
        case SERVER_EVENTS.TRANSCRIPT_EMPTY: {
          voiceRef.current?.notifyServerVadCommitted();
          setPartialTranscript('');
          if (!awaitingReplyRef.current) setServerStatus('idle');
          break;
        }
        case SERVER_EVENTS.ASSISTANT_START: {
          setError(null);
          if (awaitingReplyRef.current) armWatchdog();
          setMessages((prev) => [
            ...prev,
            { id: event.turnId, role: 'assistant', content: '', createdAt: Date.now(), streaming: true },
          ]);
          break;
        }
        case SERVER_EVENTS.ASSISTANT_DELTA: {
          if (awaitingReplyRef.current) armWatchdog();
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === event.turnId);
            if (idx === -1) {
              return [
                ...prev,
                { id: event.turnId, role: 'assistant', content: event.delta, createdAt: Date.now(), streaming: true },
              ];
            }
            const next = [...prev];
            next[idx] = { ...next[idx], content: next[idx].content + event.delta };
            return next;
          });
          break;
        }
        case SERVER_EVENTS.AUDIO_CHUNK: {
          if (awaitingReplyRef.current) armWatchdog();
          speechRef.current.enqueueAudioChunk({
            turnId: event.turnId,
            seq: event.seq,
            audioBase64: event.audioBase64,
            mimeType: event.mimeType,
            sampleRate: event.sampleRate,
          });
          break;
        }
        case SERVER_EVENTS.ASSISTANT_DONE: {
          setAwaiting(false);
          armIdleTimer();
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === event.turnId);
            const finalMsg: AssistantChatMessage = {
              id: event.turnId,
              role: 'assistant',
              content: event.responseText,
              createdAt: Date.now(),
              streaming: false,
              languageCode: event.detectedLanguage,
              languageLabel: event.languageLabel,
              responseType: event.responseType,
            };
            if (idx === -1) return [...prev, finalMsg];
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              content: event.responseText || next[idx].content,
              streaming: false,
              languageCode: event.detectedLanguage,
              languageLabel: event.languageLabel,
              responseType: event.responseType,
            };
            return next;
          });
          break;
        }
        case SERVER_EVENTS.TURN_ABORTED: {
          if (event.turnId) {
            setMessages((prev) =>
              prev
                .map((m) => (m.id === event.turnId ? { ...m, streaming: false, aborted: true } : m))
                .filter((m) => !(m.id === event.turnId && !m.content.trim()))
            );
            // A superseded turn is replaced by the next one; keep waiting in that case.
            if (event.reason !== 'superseded') setAwaiting(false);
          }
          if (!awaitingReplyRef.current) setServerStatus('idle');
          break;
        }
        case SERVER_EVENTS.SESSION_CLEARED: {
          setMessages([]);
          setPartialTranscript('');
          setServerStatus('idle');
          break;
        }
        case SERVER_EVENTS.ERROR: {
          setError(event.message || 'Unable to process AI request right now.');
          if (event.turnId) {
            setMessages((prev) =>
              prev
                .map((m) => (m.id === event.turnId ? { ...m, streaming: false } : m))
                .filter((m) => !(m.id === event.turnId && !m.content.trim()))
            );
          }
          setAwaiting(false);
          setServerStatus('idle');
          break;
        }
        default:
          break;
      }
    },
    [armIdleTimer, armWatchdog, setAwaiting]
  );
  const handleWsServerEventRef = useRef(handleWsServerEvent);
  handleWsServerEventRef.current = handleWsServerEvent;

  // ─── WebSocket connection management ─────────────────────────────────────────
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const ensureWebSocket = useCallback((): Promise<WebSocket | null> => {
    const current = wsRef.current;
    if (current && current.readyState === WebSocket.OPEN) return Promise.resolve(current);
    if (connectPromiseRef.current) return connectPromiseRef.current;

    const resolved = resolveAssistantWebSocketEndpoint();
    if (resolved.configError) {
      setError(resolved.configError);
      return Promise.resolve(null);
    }
    if (!resolved.url || typeof WebSocket === 'undefined') {
      return Promise.resolve(null);
    }
    const baseUrl = resolved.url;

    const connectPromise = (async (): Promise<WebSocket | null> => {
      let ticket: string;
      try {
        ticket = await fetchAssistantWsTicket();
      } catch (ticketErr: unknown) {
        const status = (ticketErr as { response?: { status?: number } })?.response?.status;
        console.warn('[AI-WS] ticket request failed', status || 'network');
        return null;
      }

      return new Promise<WebSocket | null>((resolve) => {
        let settled = false;
        const socket = new WebSocket(buildAssistantWsUrlWithTicket(baseUrl, ticket));
        socket.binaryType = 'arraybuffer';

        const settle = (value: WebSocket | null) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve(value);
        };

        const timeout = window.setTimeout(() => {
          intentionallyClosedRef.current.add(socket);
          try {
            socket.close();
          } catch {
            // ignore
          }
          settle(null);
        }, WS_CONNECT_TIMEOUT_MS);

        socket.onopen = () => {
          wsRef.current = socket;
          reconnectAttemptRef.current = 0;
          setWsConnected(true);
          try {
            const syncedTurns: EphemeralTurnRef[] = messagesRef.current
              .filter((m) => !m.streaming && !m.aborted && m.content.trim().length > 0)
              .slice(-16)
              .map((m) => ({ role: m.role, text: m.content.slice(0, 1500) }));
            socket.send(
              JSON.stringify({
                type: CLIENT_EVENTS.SESSION_CONFIG,
                ttsEnabled: !speechRef.current.muted,
                ...(syncedTurns.length > 0 ? { recentTurns: syncedTurns } : {}),
              })
            );
          } catch {
            // ignore
          }
          settle(socket);
        };

        socket.onmessage = (ev) => {
          if (typeof ev.data !== 'string') return;
          let parsed: WsServerEvent;
          try {
            parsed = JSON.parse(ev.data) as WsServerEvent;
          } catch {
            return; // ignore malformed JSON
          }
          handleWsServerEventRef.current(parsed);
        };

        socket.onerror = () => {
          console.warn('[AI-WS] socket error');
        };

        socket.onclose = (ev) => {
          const wasIntentional = intentionallyClosedRef.current.has(socket);
          if (wsRef.current === socket) {
            wsRef.current = null;
            setWsConnected(false);
          }
          settle(null);
          if (wasIntentional) return;

          console.warn('[AI-WS] connection closed', ev.code);
          if (awaitingReplyRef.current) {
            awaitingReplyRef.current = false;
            setAwaitingReply(false);
            if (watchdogTimerRef.current !== null) {
              window.clearTimeout(watchdogTimerRef.current);
              watchdogTimerRef.current = null;
            }
            setMessages((prev) =>
              prev
                .map((m) => (m.streaming ? { ...m, streaming: false } : m))
                .filter((m) => !(m.role === 'assistant' && !m.content.trim()))
            );
            setServerStatus('idle');
            setError('Connection to the AI was interrupted. Please ask again.');
          }
          if (ev.code === WS_CLOSE_CODES.TOO_MANY_SESSIONS) {
            setError('Too many AI assistant windows are open. Close the others and try again.');
            stopVoiceSessionRef.current('error');
            return;
          }
          if (voiceSessionActiveRef.current) {
            scheduleReconnectRef.current();
          }
        };
      });
    })();

    const tracked = connectPromise.finally(() => {
      if (connectPromiseRef.current === tracked) connectPromiseRef.current = null;
    });
    connectPromiseRef.current = tracked;
    return tracked;
  }, []);

  scheduleReconnectRef.current = () => {
    if (reconnectTimerRef.current !== null || !voiceSessionActiveRef.current) return;
    const attempt = reconnectAttemptRef.current;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      setError('Lost connection to the AI voice service. Please turn the microphone on again.');
      stopVoiceSessionRef.current('error');
      return;
    }
    reconnectAttemptRef.current = attempt + 1;
    const delay = Math.min(15000, 1000 * 2 ** attempt);
    setVoiceConnecting(true);
    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null;
      if (!voiceSessionActiveRef.current) return;
      const sock = await ensureWebSocket();
      if (sock) {
        setVoiceConnecting(false);
        setError(null);
      } else {
        scheduleReconnectRef.current();
      }
    }, delay);
  };

  const closeWebSocket = useCallback(() => {
    const sock = wsRef.current;
    wsRef.current = null;
    if (sock) {
      intentionallyClosedRef.current.add(sock);
      try {
        sock.close(1000, 'client closed');
      } catch {
        // ignore
      }
    }
    connectPromiseRef.current = null;
    setWsConnected(false);
  }, []);

  const verifyProviderHealth = useCallback(async () => {
    try {
      const health = await fetchAssistantHealth();
      const readableIssue = formatAssistantProviderError(health);
      if (readableIssue) setError(readableIssue);
    } catch {
      // Do not overwrite active turn errors if background health ping fails transiently
    }
  }, []);

  const interruptTurn = useCallback(() => {
    speechRef.current.stopPlayback();
    if (httpAbortRef.current) {
      httpAbortRef.current.abort();
      httpAbortRef.current = null;
    }
    sendWsJson({ type: CLIENT_EVENTS.TURN_BARGE_IN });
  }, [sendWsJson]);

  // ─── HTTP fallback (text) ────────────────────────────────────────────────────
  const executeHttpFallbackTurn = useCallback(
    async (userText: string, sttLanguageCode?: string | null, speakResponse = true) => {
      if (httpAbortRef.current) httpAbortRef.current.abort();
      const ctrl = new AbortController();
      httpAbortRef.current = ctrl;

      const recentTurns: EphemeralTurnRef[] = messagesRef.current
        .filter((m) => m.content.trim() && !m.streaming)
        .slice(-12)
        .map((m) => ({ role: m.role, text: m.content }));

      const turnId = makeEphemeralId();
      setServerStatus('thinking');
      setMessages((prev) => [
        ...prev,
        { id: turnId, role: 'assistant', content: '', createdAt: Date.now(), streaming: true },
      ]);

      try {
        const res = await sendAssistantMessageHttp(
          { message: userText, recentTurns, sttLanguageCode: sttLanguageCode || null },
          ctrl.signal
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === turnId
              ? {
                  ...m,
                  content: res.responseText,
                  streaming: false,
                  languageCode: res.detectedLanguage,
                  languageLabel: res.languageLabel,
                  responseType: res.responseType,
                }
              : m
          )
        );
        setAwaiting(false);

        if (speakResponse && !speechRef.current.muted && res.responseText) {
          setServerStatus('speaking');
          const audioBuf = await synthesizeVoiceHttp(
            { text: res.responseText, language: res.detectedLanguage },
            ctrl.signal
          );
          if (audioBuf) {
            await speechRef.current.enqueueRawAudioBuffer({
              turnId,
              seq: 0,
              arrayBuffer: audioBuf,
              mimeType: 'audio/wav',
              sampleRate: 24000,
            });
          }
        }
      } catch (err: unknown) {
        setMessages((prev) => prev.filter((m) => !(m.id === turnId && !m.content.trim())));
        if (!((err as { name?: string })?.name === 'CanceledError' || ctrl.signal.aborted)) {
          const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setError(apiMsg || 'Unable to reach AutoFinex AI right now. Please try again.');
        }
      } finally {
        if (httpAbortRef.current === ctrl) httpAbortRef.current = null;
        setAwaiting(false);
        setServerStatus('idle');
      }
    },
    [setAwaiting]
  );

  // ─── Microphone capture ──────────────────────────────────────────────────────
  const voice = useRealtimeVoiceSession({
    isAiSpeakingRef: speech.isPlayingRef,
    handsFree,
    onBargeIn: () => {
      speechRef.current.stopPlayback();
      sendWsJson({ type: CLIENT_EVENTS.TURN_BARGE_IN });
    },
    onSpeechStart: () => {
      setPartialTranscript('');
      armIdleTimer();
      sendWsJson({ type: CLIENT_EVENTS.AUDIO_START });
    },
    onPcmFrame: (pcm16) => {
      const sock = wsRef.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        try {
          sock.send(pcm16.buffer.slice(pcm16.byteOffset, pcm16.byteOffset + pcm16.byteLength));
        } catch {
          // frames are kept in memory for the commit-time HTTP fallback
        }
      }
    },
    onSpeechCommit: async (allFrames) => {
      if (sendWsJson({ type: CLIENT_EVENTS.AUDIO_COMMIT })) return;
      if (allFrames.length === 0) return;
      // WebSocket down (reconnecting): resilient HTTP STT + chat fallback for this utterance
      try {
        setServerStatus('thinking');
        const wavBlob = encodePcm16ToWavBlob(allFrames, 16000);
        const sttRes = await transcribeVoiceHttp(wavBlob);
        const cleanText = (sttRes.text || '').trim();
        if (!cleanText) {
          setServerStatus('idle');
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: makeEphemeralId(),
            role: 'user',
            content: cleanText,
            createdAt: Date.now(),
            languageCode: sttRes.detectedLanguage || undefined,
            viaVoice: true,
          },
        ]);
        setAwaiting(true);
        armWatchdog();
        await executeHttpFallbackTurn(cleanText, sttRes.detectedLanguage, !speechRef.current.muted);
      } catch (err: unknown) {
        setServerStatus('idle');
        const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(apiMsg || 'Voice recognition could not complete. Please try again.');
      }
    },
    onError: (msg) => {
      setError(msg);
    },
    onMicLost: () => {
      if (!voiceSessionActiveRef.current) return;
      // Try to re-acquire once (e.g. Bluetooth headset reconnect); otherwise stop cleanly.
      window.setTimeout(async () => {
        if (!voiceSessionActiveRef.current) return;
        const ok = await voiceRef.current?.startMic();
        if (!ok) {
          setError('Microphone disconnected. Please turn the microphone on again.');
          stopVoiceSessionRef.current('error');
        }
      }, 1000);
    },
  });
  voiceRef.current = voice;

  // ─── Voice session lifecycle ─────────────────────────────────────────────────
  const stopVoiceSession = useCallback(
    (_reason: 'user' | 'idle' | 'error' | 'system') => {
      voiceSessionActiveRef.current = false;
      setVoiceSessionActive(false);
      setVoiceConnecting(false);
      clearIdleTimer();
      clearReconnectTimer();
      reconnectAttemptRef.current = 0;
      voiceRef.current?.stopMic();
      setPartialTranscript('');
      sendWsJson({ type: CLIENT_EVENTS.AUDIO_CANCEL });
    },
    [clearIdleTimer, clearReconnectTimer, sendWsJson]
  );
  stopVoiceSessionRef.current = stopVoiceSession;

  const startVoiceSession = useCallback(async () => {
    if (voiceSessionActiveRef.current) return;
    speechRef.current.primeAudioContext();
    setError(null);
    setNotice(null);

    const perm = await micPermissionFlow.ensure();
    if (!perm.granted) {
      if (perm.error && !perm.blocked) setError(perm.error);
      return;
    }

    voiceSessionActiveRef.current = true;
    setVoiceSessionActive(true);
    setVoiceConnecting(true);
    if (!readMicNoticeAck()) setMicNoticeVisible(true);

    const sock = await ensureWebSocket();
    if (!voiceSessionActiveRef.current) return; // stopped while connecting
    if (!sock) {
      setError('Could not connect to the AI voice service. Check your connection and try again.');
      stopVoiceSession('error');
      return;
    }

    const ok = await voiceRef.current?.startMic();
    if (!voiceSessionActiveRef.current) {
      voiceRef.current?.stopMic();
      return;
    }
    setVoiceConnecting(false);
    if (!ok) {
      stopVoiceSession('error');
      return;
    }
    armIdleTimer();
  }, [armIdleTimer, ensureWebSocket, micPermissionFlow, stopVoiceSession]);

  /** Mic button: ONE click starts the hands-free session, the next click stops it. */
  const toggleVoiceConversation = useCallback(async () => {
    if (voiceSessionActiveRef.current) {
      stopVoiceSession('user');
      return;
    }
    await startVoiceSession();
  }, [startVoiceSession, stopVoiceSession]);

  const acknowledgeMicNotice = useCallback(() => {
    try {
      localStorage.setItem(MIC_NOTICE_ACK_KEY, '1');
    } catch {
      // ignore
    }
    setMicNoticeVisible(false);
  }, []);

  // ─── Text chat ───────────────────────────────────────────────────────────────
  const sendTextMessage = useCallback(
    async (rawText: string, options?: { speak?: boolean; bypassCache?: boolean }) => {
      const clean = rawText.trim();
      if (!clean) return;

      speechRef.current.primeAudioContext();
      speechRef.current.stopPlayback();
      if (httpAbortRef.current) {
        httpAbortRef.current.abort();
        httpAbortRef.current = null;
      }
      setError(null);
      setNotice(null);

      setMessages((prev) => [
        ...prev,
        { id: makeEphemeralId(), role: 'user', content: clean, createdAt: Date.now(), viaVoice: false },
      ]);
      setAwaiting(true);
      armWatchdog();
      setServerStatus('thinking');

      const shouldSpeak = typeof options?.speak === 'boolean' ? options.speak : !speechRef.current.muted;

      const sock = await ensureWebSocket();
      if (sock && sock.readyState === WebSocket.OPEN) {
        sock.send(
          JSON.stringify({
            type: CLIENT_EVENTS.TEXT_MESSAGE,
            text: clean,
            speak: shouldSpeak,
            bypassCache: Boolean(options?.bypassCache),
          })
        );
        return;
      }
      await executeHttpFallbackTurn(clean, null, shouldSpeak);
    },
    [armWatchdog, ensureWebSocket, executeHttpFallbackTurn, setAwaiting]
  );

  const toggleTtsMuted = useCallback(() => {
    const nextMuted = !speechRef.current.muted;
    speechRef.current.setMuted(nextMuted);
    sendWsJson({ type: CLIENT_EVENTS.SESSION_CONFIG, ttsEnabled: !nextMuted });
  }, [sendWsJson]);

  const clearConversationMemory = useCallback(() => {
    interruptTurn();
    sendWsJson({ type: CLIENT_EVENTS.SESSION_CLEAR });
    setMessages([]);
    setActiveFinanceId((fid) => {
      saveSessionMessagesForFinance(fid, []);
      return fid;
    });
    setPartialTranscript('');
    setError(null);
    setAwaiting(false);
    setServerStatus('idle');
  }, [interruptTurn, sendWsJson, setAwaiting]);

  /** Releases EVERYTHING (mic, playback, socket, timers). Stable: safe in unmount-only effects. */
  const releaseRuntimeConnections = useCallback(() => {
    stopVoiceSessionRef.current('system');
    speechRef.current.stopPlayback();
    if (httpAbortRef.current) {
      httpAbortRef.current.abort();
      httpAbortRef.current = null;
    }
    closeWebSocket();
    clearWatchdog();
    clearIdleTimer();
    clearReconnectTimer();
    awaitingReplyRef.current = false;
    setAwaitingReply(false);
    setPartialTranscript('');
    setServerStatus('idle');
  }, [clearIdleTimer, clearReconnectTimer, clearWatchdog, closeWebSocket]);

  const destroySessionAndWipeCache = useCallback(() => {
    sendWsJson({ type: CLIENT_EVENTS.SESSION_CLEAR });
    releaseRuntimeConnections();
    clearAllSessionTurnCaches();
    setMessages([]);
    setError(null);
  }, [releaseRuntimeConnections, sendWsJson]);

  // Company switch / logout always turn the microphone off
  useEffect(() => {
    const handleFinanceSwitched = () => {
      releaseRuntimeConnections();
      const nextFinId = getActiveFinanceIdSafe();
      setActiveFinanceId(nextFinId);
      setMessages(loadSessionMessagesForFinance(nextFinId));
      setError(null);
    };
    const handleSessionRevoked = () => {
      destroySessionAndWipeCache();
    };
    window.addEventListener('autofinex:finance-switched', handleFinanceSwitched);
    window.addEventListener('autofinex:session-revoked', handleSessionRevoked);
    return () => {
      window.removeEventListener('autofinex:finance-switched', handleFinanceSwitched);
      window.removeEventListener('autofinex:session-revoked', handleSessionRevoked);
    };
  }, [destroySessionAndWipeCache, releaseRuntimeConnections]);

  // Unmount ONLY (releaseRuntimeConnections is stable). Root cause of the 2026-11 bug was this
  // effect depending on per-render objects, which closed the socket and mic after every render.
  useEffect(() => {
    return () => {
      releaseRuntimeConnections();
    };
  }, [releaseRuntimeConnections]);

  const voicePhase: VoicePhase = useMemo(() => {
    if (!voiceSessionActive) return 'off';
    if (voiceConnecting || !voice.isMicActive) return 'connecting';
    if (speech.isPlaying) return 'speaking';
    if (voice.isSpeakingUtterance) return 'hearing';
    if (awaitingReply || serverStatus === 'thinking') return 'thinking';
    return 'listening';
  }, [
    awaitingReply,
    serverStatus,
    speech.isPlaying,
    voice.isMicActive,
    voice.isSpeakingUtterance,
    voiceConnecting,
    voiceSessionActive,
  ]);

  const visualState: AssistantVisualState = useMemo(() => {
    if (speech.isPlaying) return 'speaking';
    if (voice.isSpeakingUtterance) return 'listening';
    if (awaitingReply || serverStatus === 'thinking') return 'thinking';
    if (serverStatus === 'speaking') return 'speaking';
    if (voice.isMicActive) return 'listening';
    return 'idle';
  }, [awaitingReply, serverStatus, speech.isPlaying, voice.isMicActive, voice.isSpeakingUtterance]);

  const activeAudioLevel = useMemo(() => {
    if (speech.isPlaying) return speech.playbackLevel;
    if (voice.isMicActive) return voice.micLevel;
    return 0;
  }, [speech.isPlaying, speech.playbackLevel, voice.isMicActive, voice.micLevel]);

  return {
    messages,
    partialTranscript,
    visualState,
    voicePhase,
    activeAudioLevel,
    isMicActive: voiceSessionActive,
    isSpeakingUtterance: voice.isSpeakingUtterance,
    isAiSpeaking: speech.isPlaying,
    ttsMuted: speech.muted,
    awaitingReply,
    handsFree,
    setHandsFree,
    wsConnected,
    error,
    setError,
    notice,
    setNotice,
    micNoticeVisible,
    acknowledgeMicNotice,
    micPermissionFlow,
    verifyProviderHealth,
    ensureWebSocket,
    sendTextMessage,
    toggleVoiceConversation,
    startVoiceSession,
    stopVoiceSession: () => stopVoiceSession('user'),
    commitVoiceUtterance: voice.commitUtteranceNow,
    interruptTurn,
    toggleTtsMuted,
    clearConversationMemory,
    destroySession: destroySessionAndWipeCache,
  };
}

export type AIAssistantSession = ReturnType<typeof useAIAssistant>;

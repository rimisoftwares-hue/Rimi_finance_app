'use strict';

/**
 * Single source of truth for the `/ws/ai-assistant` WebSocket event contract (backend side).
 *
 * The frontend mirror lives in `frontend/src/services/aiAssistant.events.ts`.
 * `assistant/__tests__/eventContract.test.js` fails if the two files drift apart.
 *
 * Turn lifecycle guarantee: every `assistant.start` is followed by EXACTLY ONE terminal
 * event for the same `turnId`: `assistant.done`, `error` or `turn.aborted`.
 */

const SERVER_EVENTS = Object.freeze({
  SESSION_READY: 'session.ready',
  STATUS_CHANGE: 'status.change',
  TRANSCRIPT_PARTIAL: 'transcript.partial',
  TRANSCRIPT_FINAL: 'transcript.final',
  TRANSCRIPT_EMPTY: 'transcript.empty',
  ASSISTANT_START: 'assistant.start',
  ASSISTANT_DELTA: 'assistant.delta',
  AUDIO_CHUNK: 'audio.chunk',
  ASSISTANT_DONE: 'assistant.done',
  TURN_ABORTED: 'turn.aborted',
  SESSION_CLEARED: 'session.cleared',
  PONG: 'pong',
  ERROR: 'error',
});

const CLIENT_EVENTS = Object.freeze({
  PING: 'ping',
  SESSION_CONFIG: 'session.config',
  AUDIO_START: 'audio.start',
  AUDIO_COMMIT: 'audio.commit',
  AUDIO_CANCEL: 'audio.cancel',
  TURN_BARGE_IN: 'turn.barge_in',
  TEXT_MESSAGE: 'text.message',
  SESSION_CLEAR: 'session.clear',
});

const TERMINAL_TURN_EVENTS = Object.freeze([
  SERVER_EVENTS.ASSISTANT_DONE,
  SERVER_EVENTS.ERROR,
  SERVER_EVENTS.TURN_ABORTED,
]);

/** Close codes sent by the gateway (4000-4999 = application range). */
const WS_CLOSE_CODES = Object.freeze({
  TOO_MANY_SESSIONS: 4429,
  HEARTBEAT_TIMEOUT: 4408,
});

module.exports = {
  SERVER_EVENTS,
  CLIENT_EVENTS,
  TERMINAL_TURN_EVENTS,
  WS_CLOSE_CODES,
};


// src/services/aiAssistant.events.ts
// Frontend mirror of `backend/src/modules/ai/assistant/config/eventContract.js`.
// `backend/src/modules/ai/assistant/__tests__/eventContract.test.js` fails if these drift apart.
//
// Turn lifecycle guarantee: every `assistant.start` is followed by EXACTLY ONE terminal event
// for the same `turnId`: `assistant.done`, `error` or `turn.aborted`.

export const SERVER_EVENTS = {
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
} as const;

export const CLIENT_EVENTS = {
  PING: 'ping',
  SESSION_CONFIG: 'session.config',
  AUDIO_START: 'audio.start',
  AUDIO_COMMIT: 'audio.commit',
  AUDIO_CANCEL: 'audio.cancel',
  TURN_BARGE_IN: 'turn.barge_in',
  TEXT_MESSAGE: 'text.message',
  SESSION_CLEAR: 'session.clear',
} as const;

export const WS_CLOSE_CODES = {
  TOO_MANY_SESSIONS: 4429,
  HEARTBEAT_TIMEOUT: 4408,
} as const;

export type ServerEventType = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
export type ClientEventType = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];


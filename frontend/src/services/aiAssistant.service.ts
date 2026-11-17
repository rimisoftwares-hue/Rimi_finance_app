// src/services/aiAssistant.service.ts
import apiClient, { API_BASE, API_ORIGIN } from '../api/apiClient';
import { getActiveFinanceRaw, isDirectUserMode } from '../utils/authStorage';

export type AssistantVisualState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface EphemeralTurnRef {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  streaming?: boolean;
  aborted?: boolean;
  languageCode?: string;
  languageLabel?: string;
  responseType?: 'business_data' | 'general' | 'security_refusal';
  viaVoice?: boolean;
}

export type ProviderErrorCategory =
  | 'auth'
  | 'quota'
  | 'model_not_found'
  | 'network'
  | 'permission'
  | null;

export interface ProviderStatusDetail {
  ok: boolean;
  category: ProviderErrorCategory;
  message: string;
  dedicatedRoleConfigured?: boolean;
}

export interface AssistantHealthStatus {
  success: boolean;
  healthy?: boolean;
  status?: 'healthy' | 'degraded';
  message?: string | null;
  geminiConfigured: boolean;
  sttConfigured: boolean;
  ttsConfigured: boolean;
  dedicatedReadOnlyDbRole: boolean;
  cacheMode: string;
  websocketPath: string;
  providers?: {
    gemini: ProviderStatusDetail;
    sarvam: ProviderStatusDetail;
    readOnlyDb: ProviderStatusDetail;
  };
}

export function formatAssistantProviderError(health: AssistantHealthStatus): string | null {
  if (!health) return null;
  if (health.healthy === true) return null;
  const p = health.providers;
  if (p) {
    const parts: string[] = [];
    if (!p.gemini.ok) {
      parts.push(
        p.gemini.category === 'quota'
          ? 'AI quota exceeded.'
          : p.gemini.category === 'auth'
            ? 'AI service authentication error.'
            : p.gemini.category === 'model_not_found'
              ? 'Configured AI model is unavailable.'
              : p.gemini.message || 'AI language service unavailable.'
      );
    }
    if (!p.sarvam.ok) {
      parts.push(
        p.sarvam.category === 'quota'
          ? 'Voice service quota exceeded.'
          : p.sarvam.category === 'auth'
            ? 'Voice service authentication error.'
            : p.sarvam.category === 'model_not_found'
              ? 'Configured voice service model unavailable.'
              : p.sarvam.message || 'Voice service unavailable.'
      );
    }
    if (!p.readOnlyDb.ok) {
      parts.push(p.readOnlyDb.message || 'Read-only analytics database unavailable.');
    }
    if (parts.length > 0) return parts.join(' ');
  }
  return health.message || null;
}

export interface AssistantHttpTurnResponse {
  success: boolean;
  responseText: string;
  detectedLanguage: string;
  languageLabel: string;
  responseType: 'business_data' | 'general' | 'security_refusal';
  diagnostics?: {
    toolsUsed?: Array<{
      toolName: string;
      cacheHit: boolean;
      cacheTier: string;
    }>;
  };
}

export type WsServerEvent =
  | {
    type: 'session.ready';
    financeName: string | null;
    role: string;
    ttsConfigured: boolean;
    sttConfigured: boolean;
    geminiConfigured: boolean;
  }
  | {
    type: 'status.change';
    turnId?: string;
    status: AssistantVisualState;
  }
  | {
    type: 'transcript.partial';
    text: string;
    detectedLanguage?: string | null;
  }
  | {
    type: 'transcript.final';
    text: string;
    detectedLanguage?: string | null;
  }
  | {
    type: 'transcript.empty';
  }
  | {
    type: 'assistant.start';
    turnId: string;
  }
  | {
    type: 'assistant.delta';
    turnId: string;
    delta: string;
  }
  | {
    type: 'audio.chunk';
    turnId: string;
    seq: number;
    mimeType: string;
    sampleRate: number;
    audioBase64: string;
  }
  | {
    type: 'assistant.done';
    turnId: string;
    responseText: string;
    detectedLanguage: string;
    languageLabel: string;
    responseType: 'business_data' | 'general' | 'security_refusal';
    toolsUsed?: Array<{ toolName: string; cacheHit: boolean; cacheTier: string }>;
  }
  | {
    type: 'turn.aborted';
    turnId?: string | null;
    reason?: string;
  }
  | {
    type: 'session.cleared';
  }
  | {
    type: 'pong';
    ts: number;
  }
  | {
    type: 'error';
    turnId?: string | null;
    code: string;
    category?: ProviderErrorCategory;
    message: string;
  };

export function getActiveFinanceIdSafe(): string {
  const financeRaw = getActiveFinanceRaw();
  if (!financeRaw) return 'default';
  try {
    const parsed = JSON.parse(financeRaw) as { id?: string | number };
    return parsed?.id ? String(parsed.id) : 'default';
  } catch {
    return 'default';
  }
}

export interface ResolvedWsUrlResult {
  url: string | null;
  configError: string | null;
}

/**
 * Resolves the base WebSocket URL (`/ws/ai-assistant`) strictly from the configured API base
 * URL (`API_BASE` / `API_ORIGIN`, mapping `http:` -> `ws:` and `https:` -> `wss:`).
 *
 * NEVER falls back to `window.location.origin` (which produces an invalid `tauri://` URL in
 * packaged Tauri desktop builds). Returns a clear `configError` if the API base URL is empty
 * or not an HTTP(S) URL. The returned URL carries NO credentials: authentication uses a
 * short-lived single-use ticket appended by `buildAssistantWsUrlWithTicket`.
 */
export function resolveAssistantWebSocketEndpoint(): ResolvedWsUrlResult {
  const candidateHttpUrl = (API_BASE || API_ORIGIN || '').trim();
  if (!candidateHttpUrl || !/^https?:\/\//i.test(candidateHttpUrl)) {
    return {
      url: null,
      configError:
        'Real-time voice connection unavailable: API base URL is empty or invalid (set VITE_API_URL to http:// or https://).',
    };
  }

  try {
    const parsedApi = new URL(candidateHttpUrl);
    const wsProtocol = parsedApi.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL('/ws/ai-assistant', `${wsProtocol}//${parsedApi.host}`);

    const hasAnyToken = isDirectUserMode()
      ? Boolean(localStorage.getItem('authToken'))
      : Boolean(sessionStorage.getItem('authToken') || localStorage.getItem('ownerToken'));
    if (!hasAnyToken) {
      return { url: null, configError: null };
    }
    return { url: url.toString(), configError: null };
  } catch {
    return {
      url: null,
      configError:
        'Real-time voice connection unavailable: configured API base URL could not be parsed.',
    };
  }
}

/** Requests a 60 s single-use WebSocket ticket through the normal authenticated API client. */
export async function fetchAssistantWsTicket(signal?: AbortSignal): Promise<string> {
  const res = await apiClient.post<{ success: boolean; ticket: string }>(
    '/ai/assistant/ws-ticket',
    {},
    { signal, timeout: 10000 }
  );
  if (!res.data?.success || !res.data.ticket) {
    throw new Error('Voice session ticket unavailable');
  }
  return res.data.ticket;
}

export function buildAssistantWsUrlWithTicket(baseUrl: string, ticket: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

export async function fetchAssistantHealth(signal?: AbortSignal): Promise<AssistantHealthStatus> {
  const res = await apiClient.get<AssistantHealthStatus>('/ai/assistant/health', { signal });
  return res.data;
}

export async function sendAssistantMessageHttp(
  payload: {
    message: string;
    recentTurns?: EphemeralTurnRef[];
    sttLanguageCode?: string | null;
    preferredLanguage?: string | null;
    bypassCache?: boolean;
  },
  signal?: AbortSignal
): Promise<AssistantHttpTurnResponse> {
  const res = await apiClient.post<AssistantHttpTurnResponse>('/ai/assistant/message', payload, {
    signal,
  });
  return res.data;
}

export async function transcribeVoiceHttp(
  audioBlob: Blob,
  languageHint?: string | null,
  signal?: AbortSignal
): Promise<{ success: boolean; text: string; detectedLanguage: string | null }> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'utterance.wav');
  if (languageHint) {
    formData.append('language', languageHint);
  }
  const res = await apiClient.post<{
    success: boolean;
    text: string;
    detectedLanguage: string | null;
  }>('/ai/assistant/voice/transcribe', formData, { signal });
  return res.data;
}

export async function synthesizeVoiceHttp(
  payload: { text: string; language?: string },
  signal?: AbortSignal
): Promise<ArrayBuffer | null> {
  const res = await apiClient.post<ArrayBuffer>('/ai/assistant/voice/synthesize', payload, {
    responseType: 'arraybuffer',
    signal,
  });
  if (res.status === 204 || !res.data || res.data.byteLength === 0) {
    return null;
  }
  return res.data;
}

/**
 * Encodes an array of 16-bit signed LE mono PCM frames into a standard 44-byte RIFF WAV Blob
 * (used strictly in-memory for resilient HTTP fallback if WebSocket drops mid-utterance).
 */
export function encodePcm16ToWavBlob(chunks: Int16Array[], sampleRate = 16000): Blob {
  let totalSamples = 0;
  for (const c of chunks) totalSamples += c.length;

  const dataBytes = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let byteOffset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      view.setInt16(byteOffset, chunk[i], true);
      byteOffset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

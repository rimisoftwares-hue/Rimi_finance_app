# AutoFinex Real-Time AI Assistant (`backend/src/modules/ai/assistant`)

Real-time multilingual Voice + Chat Assistant for AutoFinex, separated cleanly from the outbound telecalling submodule (`../telecalling`).

## Directory Structure

```text
backend/src/modules/ai/assistant/
├── config/
│   ├── aiDebug.js              # Opt-in non-sensitive debug logger (AI_DEBUG=1, off by default)
│   ├── assistant.config.js     # SINGLE central config for voice, models, timeouts & rate limits
│   ├── eventContract.js        # Shared WebSocket event names & close codes (tested against frontend)
│   └── schemaPrompt.config.js  # Verified ai_ro.* view schema guide for dynamic read-only SQL
├── gateway/
│   └── assistantWs.gateway.js  # /ws/ai-assistant bidirectional WS gateway (single-terminal invariant)
├── http/
│   └── assistant.routes.js     # /api/ai/assistant/* HTTP routes (ws-ticket, health, message, STT, TTS)
├── providers/
│   ├── geminiStream.provider.js# @google/genai streaming + thoughtSignature preservation + fallback
│   ├── sarvamClient.js         # Singleton SarvamAI SDK client + health probe
│   ├── sarvamStt.provider.js   # saaras:v3 WebSocket streaming STT + server VAD + auto language detect
│   └── sarvamTts.provider.js   # bulbul:v3 WebSocket streaming PCM16 TTS (24 kHz)
├── security/
│   ├── allowedQueryRegistry.js # Declarative read-only KPI tool schemas + role guards
│   ├── financeScopeValidator.js# WS ticket/JWT tenant isolation + parameter sanitizer
│   ├── rateLimiter.js          # Per-user/min, per-finance/min, daily cap & concurrent WS slot cap
│   ├── readOnlyDbPool.js       # Isolated read-only PG pools (autofinex_voice_ro & autofinex_ai_sql_ro)
│   ├── sqlValidator.js         # Multi-rule SELECT/CTE AST-free validator + function/schema allowlists
│   └── wsTicket.js             # 60s single-use opaque random ticket store (keeps JWTs out of WS URLs)
├── services/
│   ├── aiCache.service.js      # Tenant/role-isolated dual-tier KPI cache (RAM + optional Redis)
│   ├── aiOrchestrator.service.js# Multi-pass streaming LLM + tool execution + clause-level TTS pipeline
│   ├── clauseChunker.js        # Streams natural spoken clauses to TTS before full LLM reply ends
│   ├── clientErrors.js         # Maps internal/SQL/provider errors to safe user-facing messages
│   ├── languageDetection.service.js # 11 Indic languages + English + code-mix detection (zero Tamil bias)
│   ├── readOnlyQuery.service.js# Reuses homeDashboard.service.js calculators for 100% KPI parity
│   ├── transcriptFilter.js     # Drops sub-2-char noise and filler sounds (hmm/uh) in hands-free mode
│   └── ttsSanitizer.js         # Strips Markdown/tables and formats ₹ amounts for spoken TTS
└── __tests__/
    ├── assistant.test.js       # SQL validator, tenant isolation, cache, orchestrator, multilingual, PCM16
    ├── bootSmoke.test.js       # Full Express + WS boot smoke & env.loader secret-redaction check
    ├── eventContract.test.js   # Zero-drift check between backend eventContract.js & frontend .events.ts
    └── gatewayLifecycle.test.js# Single-terminal turn guarantee, timeout, rate limits, WS ticket, multi-CTE
```

---

## Changing the Voice or Models (Single Source of Truth)

All model and voice selections live in **one place** — [`config/assistant.config.js`](./config/assistant.config.js) lines `29–33`:

```js
const DEFAULT_TTS_MODEL = 'bulbul:v3';
const DEFAULT_TTS_VOICE = 'priya'; // <-- Change ONLY this string to switch the voice globally
const DEFAULT_STT_MODEL = 'saaras:v3';
const DEFAULT_LLM_PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_LLM_FALLBACK_MODEL = 'gemini-3.5-flash';
```

- Compatible `bulbul:v3` universal cross-lingual voices (speak English, Tamil, Hindi, Malayalam, Telugu, Kannada, Marathi, Bengali, Gujarati, Punjabi, and Odia with one speaker):
  - **Female**: `priya`, `ritu`, `neha`, `pooja`, `simran`, `kavya`, `ishita`, `shreya`, `roopa`, `tanya`, `shruti`, `suhani`, `kavitha`, `rupali`
  - **Male**: `shubh`, `rahul`, `rohan`, `amit`, `dev`, `ratan`, `varun`, `manan`, `sumit`, `kabir`, `aayan`, `ashutosh`, `advait`, `anand`, `tarun`, `sunny`, `mani`, `gokul`, `vijay`, `mohit`, `rehan`, `soham`, `aditya`
- Any client-sent `llmModel`, `ttsModel`, or `ttsVoice` fields are ignored by the server.

---

## WebSocket & HTTP Contract

Shared source of truth: [`config/eventContract.js`](./config/eventContract.js) and `frontend/src/services/aiAssistant.events.ts` (enforced by `__tests__/eventContract.test.js`).

### WebSocket Handshake
1. Client calls `POST /api/ai/assistant/ws-ticket` (authenticated via `Authorization` + `x-owner-token` headers) to mint a 60-second single-use opaque ticket.
2. Client opens `ws(s)://<host>/ws/ai-assistant?ticket=<ticket>`.
3. Server validates `Origin`, consumes the single-use ticket, acquires a session slot (`maxConcurrentSessionsPerUser`), and emits `session.ready`.

### Client -> Server Events (`CLIENT_EVENTS`)
| Event / Frame | Payload | Purpose |
| --- | --- | --- |
| Binary frame | Raw `Int16LE` mono PCM @ `16000 Hz` | Live microphone audio stream (512-sample / 32 ms frames) |
| `audio.start` | `{ type: "audio.start" }` | Marks onset of a new spoken utterance |
| `audio.commit` | `{ type: "audio.commit" }` | Client-side silence fallback commit (Sarvam server VAD is primary) |
| `audio.cancel` | `{ type: "audio.cancel" }` | Cancels uncommitted STT utterance |
| `turn.barge_in` | `{ type: "turn.barge_in" }` | Aborts in-flight LLM + TTS generation immediately (`<150 ms`) |
| `text.message` | `{ type: "text.message", text, speak?, bypassCache? }` | Typed question over the open WebSocket |
| `session.config` | `{ type: "session.config", ttsEnabled? }` | Toggles spoken audio output for the session |
| `session.clear` | `{ type: "session.clear" }` | Wipes ephemeral RAM conversation history |
| `ping` | `{ type: "ping" }` | Application-level ping (`pong` reply); server also runs native WS `ping`/`pong` |

### Server -> Client Events (`SERVER_EVENTS`)
| Event | Terminal? | Purpose |
| --- | --- | --- |
| `session.ready` | No | Handshake succeeded; reports provider readiness flags |
| `status.change` | No | Visual state (`idle` \| `listening` \| `thinking` \| `speaking`) |
| `transcript.partial` | No | Live partial STT text while user speaks |
| `transcript.final` | No | Committed meaningful user transcript + `detectedLanguage` |
| `transcript.empty` | No | Noise/filler ignored in hands-free mode |
| `assistant.start` | No | Opens a turn (`turnId`) |
| `assistant.delta` | No | Streamed text token delta (`turnId`, `delta`) |
| `audio.chunk` | No | Base64 24 kHz mono PCM16 audio chunk (`turnId`, `seq`, `audioBase64`) |
| `assistant.done` | **Yes** | Final completed reply (`turnId`, `responseText`, `detectedLanguage`, `toolsUsed`) |
| `turn.aborted` | **Yes** | Turn cancelled (`barge_in`, `superseded`, `session_clear`) |
| `error` | **Yes** (when `turnId` set) | Sanitized client-safe error (`code`, `category`, `message`) |
| `session.cleared` | No | Confirms RAM history reset |
| `pong` | No | Reply to client `ping` |

**Single-Terminal Invariant**: Every `assistant.start(turnId)` is guaranteed to be followed by **exactly one** terminal event (`assistant.done` | `error` | `turn.aborted`) with that `turnId`, enforced idempotently in `try/catch/finally` plus `limits.turnTimeoutMs` (`45s`).

### HTTP Endpoints (`/api/ai/assistant/*`)
- `GET /api/ai/assistant/health` — Live Gemini + Sarvam + Read-Only DB readiness probe.
- `POST /api/ai/assistant/ws-ticket` — Issues a 60s single-use WebSocket upgrade ticket.
- `POST /api/ai/assistant/message` — Stateless HTTP fallback for text chat.
- `POST /api/ai/assistant/voice/transcribe` — Multipart WAV fallback transcription (`25 MB` cap).
- `POST /api/ai/assistant/voice/synthesize` — Stateless TTS synthesis fallback.

---

## Environment Variables (Names Only)

Never commit secret values; configure these in `backend/.env` or `backend/.env.local`:

### Required Provider Keys & Auth
- `GEMINI_API_KEY` — Google GenAI API key.
- `SARVAM_API_KEY` — Sarvam AI subscription key for `saaras:v3` STT and `bulbul:v3` TTS.
- `JWT_SECRET`, `OWNER_JWT_SECRET` — Application auth token verification secrets.

### Read-Only Fast KPI Database Role (`autofinex_voice_ro`)
- `VOICE_RO_DB_HOST`, `VOICE_RO_DB_PORT`, `VOICE_RO_DB_NAME`, `VOICE_RO_DB_USER`, `VOICE_RO_DB_PASSWORD`, `VOICE_RO_DB_SSLMODE` (falls back to `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_SSLMODE` if host/name omitted; enforces `BEGIN TRANSACTION READ ONLY` + `statement_timeout`).

### Optional Dynamic SQL Role (`autofinex_ai_sql_ro` — `ai_ro.*` Security-Barrier Views)
- `AI_SQL_RO_DB_USER`, `AI_SQL_RO_DB_PASSWORD` (and optional `AI_SQL_RO_DB_HOST`, `AI_SQL_RO_DB_PORT`, `AI_SQL_RO_DB_NAME`, `AI_SQL_RO_DB_SSLMODE`).
- If unset, `run_readonly_select_query` degrades gracefully (hidden from tool declarations while all 9 fast KPI tools remain active).

### Optional Overrides & Rate Limits
- `AI_ASSISTANT_GEMINI_MODEL`, `AI_ASSISTANT_GEMINI_FALLBACK_MODEL`
- `AI_ASSISTANT_TTS_MODEL`, `AI_ASSISTANT_TTS_VOICE`, `AI_ASSISTANT_STT_MODEL`
- `AI_ASSISTANT_TURN_TIMEOUT_MS` (default `45000`)
- `AI_ASSISTANT_TURNS_PER_MIN_USER` (default `20`), `AI_ASSISTANT_TURNS_PER_MIN_FINANCE` (default `60`), `AI_ASSISTANT_DAILY_TURN_CAP` (default `3000`)
- `AI_ASSISTANT_MAX_SESSIONS_USER` (default `3`), `AI_ASSISTANT_MAX_UTTERANCE_SEC` (default `30`)
- `AI_DEBUG` (`1` enables redacted event/timing telemetry; off by default)

---

## Running Tests

```bash
cd backend

# Run AI Assistant unit, contract, lifecycle & boot-smoke suites
node --test src/modules/ai/assistant/__tests__/*.test.js

# Run both AI Assistant and Telecalling suites together
node --test src/modules/ai/assistant/__tests__/*.test.js src/modules/ai/telecalling/__tests__/*.test.js
```


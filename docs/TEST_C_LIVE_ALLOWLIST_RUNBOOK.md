# Phase 5 — Test C (`live_allowlist`) Controlled Single-Call Runbook

> **STATUS**: DOCUMENT ONLY — DO NOT EXECUTE UNTIL OPERATOR EXPLICITLY AUTHORIZES `"RUN TEST C"`.
> **DEFAULT POSTURE**: `VOICE_TELEPHONY_MODE=mock`, `MOCK_TELEPHONY_ONLY=true`, `VOICE_LIVE_CALLS_CONFIRMED=false`.
> **PII / SECRET POLICY**: Never print, log, paste, or commit raw API keys, HMAC secrets, JWTs, or full E.164 phone numbers.

---

## 1. Preconditions Checklist (All Must Be Green Before Switching Off `mock`)

- [ ] **1.1 Secrets Rotated & `.env` Untracked**
  - `git rm --cached backend/.env` committed and `backend/.env` listed in `.gitignore`.
  - Compromised/previously tracked credentials rotated across Node, Python, and Dograh (`VOICE_AI_INTERNAL_HMAC_SECRET`, DB user passwords, AWS IAM keys, Sarvam API key, Vobiz auth token, Dograh `OSS_JWT_SECRET` / `TELEPHONY_WS_TOKEN_SECRET` / service `DOGRAH_API_KEY`).
- [ ] **1.2 Tenant Entitlement & Clean State Applied by Operator**
  - `owner_features` has an active, non-expired row for `owner_id = '01a14ed2-5c6e-79f3-b85f-29b6a3356c19'` and `feature_code = 'ai_voice_agent'`.
  - Stuck lead `01a1cb43-d29a-7b5a-b4d0-5c46c5cbbbf3` (`finance_id = '01a14ed2-5df9-7175-839b-3cbaca84f231'`) reset from `'connecting'` to `'uncalled'`.
  - Orphan legacy outbox event `01a1cbfb-f74d-780a-9c38-bb58e298b271` neutralized (`status = 'dead_letter'`, `queue_status = 'cancelled'`).
- [ ] **1.3 Calling Window (IST)**
  - Current wall-clock time in `Asia/Kolkata` (`TZ=Asia/Kolkata date`) is strictly inside the tenant's configured calling window (default `09:00:00` – `18:00:00` IST) with at least 15 minutes remaining before window close.
- [ ] **1.4 Cloudflare Tunnel Restricted & Signup Disabled**
  - `voice.rimio.in` forwards **only** `/api/v1/telephony/*` to `http://127.0.0.1:8000`; external requests to `/docs`, `/openapi.json`, `/api/v1/auth/*`, and `/api/v1/public/agent/*` return `404` or `403`.
  - `dograh_api` runs with `ENABLE_SIGNUP="false"`.
  - Node backend uses loopback health URL `VOICE_GATEWAY_HEALTH_URL=http://127.0.0.1:8000/api/v1/health`.
- [ ] **1.5 Dograh Workflow Published & Validated**
  - Workflow `id = 1` (`workflow_uuid = afb4d06e-da79-4a58-8b7f-11b34c450bc0`) has a validated `published` definition (`v11` with tuned turn-taking + `max_call_duration = 600`, and either Option (i) `confirm_identity_and_load_due` HTTP tool attached or Option (ii) `ALLOW_NONPROD_PROMPT_DUE=true` explicitly chosen for this allowlist test only).
  - Vobiz telephony configuration ID verified in `dograh_postgres`: `telephony_configurations.id = 2` (`provider = 'vobiz'`), `telephony_phone_numbers.id = 1` (`telephony_configuration_id = 2`).
- [ ] **1.6 Loopback Services Healthy**
  - `dograh_api` (`127.0.0.1:8000`), `autofinex_voice` (`127.0.0.1:8100`), and Rimi Node backend (`127.0.0.1:3004`) are bound to `127.0.0.1` and report healthy.
  - Operator is physically holding the allowlisted handset (`+91 ******1002`) with cellular signal ready to answer.

---

## 2. Exact Environment Variables Operator Sets for `live_allowlist`

### 2.1 Rimi Node Backend (`Rimi_finance_app/backend/.env`)

```dotenv
# Telephony safety gates (server-only)
VOICE_TELEPHONY_MODE=live_allowlist
VOICE_LIVE_CALLS_CONFIRMED=true
VOICE_AI_KILL_SWITCH=false
TEST_ALLOWED_NUMBERS=<OPERATOR_E164_PHONE_ENDING_1002>

# Loopback gateway & control-plane endpoints (required once tunnel blocks /api/v1/health externally)
VOICE_GATEWAY_HEALTH_URL=http://127.0.0.1:8000/api/v1/health
VOICE_AGENT_BASE_URL=http://127.0.0.1:8100

# Recording playback bucket (must match KYC bucket `autofinex`)
BUCKET_NAME=autofinex
```

### 2.2 Python Voice AI Control Plane (`Voice_call_agent/.env`)

```dotenv
# Loopback bind (Amendment A8 — never 0.0.0.0)
AUTOFINEX_HOST=127.0.0.1
AUTOFINEX_PORT=8100

# Telephony safety gates (all four required to open DograhLiveCallDispatcher)
MOCK_TELEPHONY_ONLY=false
VOICE_TELEPHONY_MODE=live_allowlist
VOICE_LIVE_CALLS_CONFIRMED=true
VOICE_AI_KILL_SWITCH=false
TEST_ALLOWED_NUMBERS=<OPERATOR_E164_PHONE_ENDING_1002>

# Identity gate (Amendment A7):
# - Set `false` when Workflow v11 includes the `confirm_identity_and_load_due` HTTP tool (Recommended).
# - Set `true` ONLY for non-production `live_allowlist` testing if testing without mid-call HTTP tools.
#   (Hard-blocked at startup and dispatch whenever VOICE_TELEPHONY_MODE=live.)
ALLOW_NONPROD_PROMPT_DUE=false

# Provisioned Dograh v1.51.0 resource identifiers (verified in dograh_postgres: id=2 is Vobiz, id=1 is Cloudonix!)
DOGRAH_API_URL=http://127.0.0.1:8000
DOGRAH_WORKFLOW_ID=1
DOGRAH_WORKFLOW_UUID=afb4d06e-da79-4a58-8b7f-11b34c450bc0
DOGRAH_TELEPHONY_CONFIG_ID=2
DOGRAH_PHONE_NUMBER_ID=1
DOGRAH_API_KEY=<REDACTED_DOGRAH_SERVICE_API_KEY>

# Recording upload bucket (must match Node BUCKET_NAME)
BUCKET_NAME=autofinex
```

### 2.3 Verify Health After Restarting `:8100` and `:3004`

```bash
curl -s http://127.0.0.1:8100/health | python3 -m json.tool
```

Expected on `:8100/health` (zero secrets):
- `"status": "ok"`, `"ready": true`
- `"telephony_mode": "live_allowlist"`
- `"mock_telephony_only": false`
- `"dograh_dispatcher_ready": true`
- `"db_read_only_ok": true`, `"redis_ok": true`

---

## 3. Kill-Switch Rehearsal (Mandatory Before Any Live Call)

1. Record pre-rehearsal Dograh run count:
   ```bash
   docker exec dograh_postgres psql -U postgres -d postgres -t -A \
     -c "SELECT COUNT(*), COALESCE(MAX(id), 0) FROM workflow_runs;"
   ```
2. Set `VOICE_AI_KILL_SWITCH=true` in `Rimi_finance_app/backend/.env` (and/or `Voice_call_agent/.env`) and restart `:3004` and `:8100`.
3. Trigger a manual call attempt from the Lead Calling UI on the allowlisted customer.
4. **Expected Result**:
   - HTTP `503` with `code: "voice_ai_kill_switch_active"`.
   - UI shows error message (`Voice AI kill switch is active`) and **never** shows `Accepted`, `Ringing`, or `In Progress`.
   - Zero new rows in `ai_telecalling_call_logs` and zero new rows in Dograh `workflow_runs`.
5. Set `VOICE_AI_KILL_SWITCH=false` and restart `:3004` and `:8100` before proceeding to Step 4.

---

## 4. Negative Test — Non-Allowlisted Number Must Be Blocked Pre-Dial

1. Record baseline counts before negative test:
   ```bash
   docker exec dograh_postgres psql -U postgres -d postgres -t -A \
     -c "SELECT COUNT(*) AS dograh_runs FROM workflow_runs;"
   ```
2. In the Lead Calling UI (`finance_id = '01a14ed2-5df9-7175-839b-3cbaca84f231'`), select **any overdue customer whose phone is NOT in `TEST_ALLOWED_NUMBERS`**, open the confirm dialog, and click **Call Now**.
3. **Expected Result**:
   - Node `assertDestinationAllowlistedIfRequired` (`voiceAgent.client.js:158-171`) rejects immediately with HTTP `403` (`code: "destination_not_in_test_allowlist"`, phone masked as `+91 ******XXXX`).
   - Zero rows inserted into `ai_telecalling_call_logs` for that customer.
   - `attempt_count` and `daily_attempt_count` on `ai_telecalling_leads` remain `0` (cooldown not burned).
   - Re-run the Dograh query above: `workflow_runs` count is **strictly unchanged** (zero Dograh API calls made).

---

## 5. Single Live Allowlist Call Procedure (Operator Present)

1. Confirm baseline Dograh `MAX(id)` in `workflow_runs`.
2. In the Lead Calling UI, locate the allowlisted test customer (`customer_id = '01a154dd-f89f-7a33-83ab-71119d9c4590'`, phone `+91 ******1002`).
3. Click the phone action button to open the call confirmation dialog:
   - Verify **Call Now** is enabled and no stale error banner is shown.
4. Click **Call Now** **once**:
   - Button disables immediately (`Submitting...`) — double-click lock active.
   - Upon HTTP `202`, status transitions to **Accepted / Initiating** (never `"Ringing..."` prematurely, and **no** `"TEST MODE"` badge).
   - Once Dograh creates the run and Vobiz rings the handset, status transitions to **Ringing** -> **In Progress** on answer.
5. **On the Handset (`+91 ******1002`)**:
   - Answer the incoming Vobiz PSTN call.
   - Listen to Stage-1 Tamil/Tanglish greeting (confirm **zero** loan amount or loan ref is spoken before you confirm your name — Amendment A7).
   - Confirm identity ("ஆமா, நான் தான் பேசுறேன்" / "Yes, speaking").
   - Verify the agent states the overdue EMI amount accurately and politely, state a clear Promise-to-Pay date/amount (e.g., tomorrow), and let the agent close the call cleanly.
6. Wait ~10–20 seconds after hangup for `DograhRunMonitor` to finalize post-call artifacts, upload the recording to S3 (`autofinex`), and invoke `/api/internal/ai/calls/complete`.
7. Verify UI dialog transitions to **Completed** and polling stops automatically.

---

## 6. Emergency Abort Procedure (Kill Switch + Vobiz Active Call Hangup)

If the phone rings unexpectedly, loops, or needs immediate termination mid-call:

1. **Hang up on handset** (immediate PSTN disconnect) **AND** run server-side Vobiz hangup without printing credentials:
   ```bash
   /run/media/omerchy/A23F-9E6F/PROJECT/Voice_call_agent/.venv/bin/python - <<'PY'
   import httpx
   from dotenv import dotenv_values

   env = dotenv_values("/run/media/omerchy/A23F-9E6F/PROJECT/Voice_call_agent/.env")
   auth_id = env["VOBIZ_AUTH_ID"].strip()
   auth_token = env["VOBIZ_AUTH_TOKEN"].strip()
   headers = {"X-Auth-ID": auth_id, "X-Auth-Token": auth_token}

   # List active live calls on Vobiz and terminate all in-flight legs immediately
   with httpx.Client(base_url="https://api.vobiz.ai", timeout=10.0) as client:
       resp = client.get(f"/api/v1/Account/{auth_id}/Call/?status=live", headers=headers)
       print("Active lookup HTTP:", resp.status_code)
       data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
       calls = data.get("calls") or data.get("objects") or []
       for call_item in calls:
           call_uuid = call_item if isinstance(call_item, str) else call_item.get("call_uuid") or call_item.get("request_uuid")
           if call_uuid:
               del_resp = client.delete(f"/api/v1/Account/{auth_id}/Call/{call_uuid}/", headers=headers)
               print("Terminated call_uuid prefix:", str(call_uuid)[:8], "HTTP:", del_resp.status_code)
   PY
   ```
2. **Flip Kill Switch Immediately**:
   - Set `VOICE_AI_KILL_SWITCH=true` and `MOCK_TELEPHONY_ONLY=true` in both `.env` files and restart `:3004` and `:8100`.
3. Verify `/health` on `:8100` reports `"telephony_mode": "mock"` and `"dograh_dispatcher_ready": false`.

---

## 7. Read-Only Post-Call Verification Queries

Run all queries below in read-only mode (`BEGIN TRANSACTION READ ONLY; ... ROLLBACK;`) — mask phone digits in any shared output:

```sql
BEGIN TRANSACTION READ ONLY;

-- 7.1 Call log row: verify mock flag ABSENT, lifecycle terminal, duration, models, recording key
SELECT id,
       lead_id,
       provider_call_id,
       (provider_call_id LIKE 'mock-%') AS has_mock_prefix,
       LEFT(phone_e164, 3) || '******' || RIGHT(phone_e164, 4) AS phone_masked,
       call_status,
       call_lifecycle_status,
       answered,
       customer_spoke,
       call_duration_seconds,
       disposition,
       recording_status,
       recording_s3_key,
       llm_model,
       tts_model,
       stt_model,
       idempotency_key,
       started_at,
       ended_at
  FROM ai_telecalling_call_logs
 WHERE finance_id = '01a14ed2-5df9-7175-839b-3cbaca84f231'
   AND customer_id = '01a154dd-f89f-7a33-83ab-71119d9c4590'
 ORDER BY created_at DESC
 LIMIT 3;

-- 7.2 Post-call summary & L2 customer memory (must populate ONLY because provider_call_id is NOT mock-*)
SELECT id,
       call_log_id,
       disposition,
       sentiment,
       promised_amount,
       promised_date,
       LEFT(summary_text, 160) AS summary_preview,
       created_at
  FROM voice_call_summaries
 WHERE finance_id = '01a14ed2-5df9-7175-839b-3cbaca84f231'
   AND customer_id = '01a154dd-f89f-7a33-83ab-71119d9c4590'
 ORDER BY created_at DESC
 LIMIT 3;

SELECT customer_id,
       total_calls_count,
       answered_calls_count,
       promises_made_count,
       preferred_language,
       last_disposition,
       updated_at
  FROM voice_customer_memory
 WHERE finance_id = '01a14ed2-5df9-7175-839b-3cbaca84f231'
   AND customer_id = '01a154dd-f89f-7a33-83ab-71119d9c4590';

-- 7.3 Promise-to-Pay row (if customer promised payment during call)
SELECT id,
       call_log_id,
       promised_amount,
       promised_date,
       ptp_status,
       source,
       created_at
  FROM promise_to_pay
 WHERE finance_id = '01a14ed2-5df9-7175-839b-3cbaca84f231'
   AND customer_id = '01a154dd-f89f-7a33-83ab-71119d9c4590'
 ORDER BY created_at DESC
 LIMIT 3;

-- 7.4 Token / TTS / STT usage metering & lead attempt counter (must increment by exactly +1)
SELECT id,
       call_status,
       attempt_count,
       daily_attempt_count,
       daily_attempt_date,
       last_call_at
  FROM ai_telecalling_leads
 WHERE id = '01a1cb43-d29a-7b5a-b4d0-5c46c5cbbbf3';

ROLLBACK;
```

### 7.5 Verify Recording Uploaded to `autofinex` Bucket & Playback Presigning Works

1. Check object metadata in S3 bucket `autofinex` (without printing credentials or raw presigned query strings):
   ```bash
   # Replace <RECORDING_S3_KEY> with recording_s3_key from Query 7.1
   aws s3api head-object --bucket autofinex --key "<RECORDING_S3_KEY>" \
     --query '{ContentType:ContentType,ContentLength:ContentLength,ServerSideEncryption:ServerSideEncryption}'
   ```
2. In the Lead Calling UI -> Call History / Logs tab, click **Play Recording** on the completed call and confirm `GET /api/ai/calls/:callId/recording-url` returns HTTP `200` and streams audio without `403` / `NoSuchBucket`.

---

## 8. Immediate Post-Test Rollback to `mock` Mode

Immediately after completing the single Test C verification:

1. Reset `Rimi_finance_app/backend/.env`:
   ```dotenv
   VOICE_TELEPHONY_MODE=mock
   VOICE_LIVE_CALLS_CONFIRMED=false
   VOICE_AI_KILL_SWITCH=false
   ```
2. Reset `Voice_call_agent/.env`:
   ```dotenv
   MOCK_TELEPHONY_ONLY=true
   VOICE_TELEPHONY_MODE=mock
   VOICE_LIVE_CALLS_CONFIRMED=false
   ALLOW_NONPROD_PROMPT_DUE=false
   VOICE_AI_KILL_SWITCH=false
   ```
3. Restart `:8100` and `:3004`.
4. Confirm fail-closed `mock` state:
   ```bash
   curl -s http://127.0.0.1:8100/health | python3 -m json.tool
   ```
   Must report `"telephony_mode": "mock"`, `"mock_telephony_only": true`, and `"dograh_dispatcher_ready": false`.

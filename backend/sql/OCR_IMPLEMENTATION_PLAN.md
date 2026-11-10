# OCR Ledger-Card Import: Implementation Plan v2
(Unified Multi-Step Loan Entry + Private S3 with Auto-Expiry + Gemini Flash)

You have NO memory of earlier work. Everything needed is in this file. Work in the phases of section 1.3: Discovery -> Backend -> Frontend -> Verify. Stop and ask ONLY under the STOP conditions in section 1.2. Anything this file calls "verify" or "re-verify" must be read from the real code before you rely on it; if reality differs from this file, reality wins and you report the difference.

---

## 0. SCOPE, ENVIRONMENT AND DECISIONS

### 0.1 Objectives
1. **Handwritten ledger extraction with Gemini Flash**: Extract customer, guardian, vehicle and loan details from handwritten Tamil / English / Tanglish ledger cards into strict `ledger_v1` JSON using the system prompt in **Appendix A (section 8)**.
2. **Single image now, up to 5 later**: `OCR_MAX_IMAGES=1` today. Tables, upload flow, queue and merger already support 1 to 5 images (`CHECK (expected_images BETWEEN 1 AND 5)`). Raising the env value later must need no schema or backend rewrite.
3. **Private S3 storage with automatic expiry**: Images are stored under `ocr/<financeId>/<batchId>/<jobId>.<ext>`. Image AND extracted personal data expire together (`expires_at`, default 7 days, `OCR_S3_RETENTION_DAYS`). After expiry the sweep deletes the S3 object and erases the extracted JSON (section 4.4). Only non-personal metadata stays for audit (status, timings, tokens, model, prompt version, error codes).
4. **Unified Loan Entry integration**: Consulting Loan and Vehicle Loan live in `frontend/src/components/form/MultiStepLoanEntryForm.tsx` (switched by `LoanTypeToggle`). The **"AI Scan"** button belongs to the create flow only and must never appear on edit pages. Replace the mock timer in `AiEntryDialog.tsx` (`MOCK_LEDGER_DATA`) with the real pipeline and an interactive **Review & Apply** step.
5. **Consulting vehicle intelligence (deferred write)**: When OCR reads a registration number, the app checks availability (section 4.7). Existing and available in this finance -> link it. Not found -> keep the vehicle in the form store as `isNewVehicle: true` and insert it atomically inside `POST /customers` (section 6). OCR never writes to `vehicle_detail` by itself.

### 0.2 Environment variables (NAMES ONLY, never put real values in this file or in git)
Real values live only in the developer's local `backend/.env` and the server's secret store. Document these names with EMPTY values in `backend/.env.example`:
```env
GEMINI_API_KEY=                 # never committed, never logged, never sent to the frontend
GEMINI_MODEL=                   # confirmed against the provider's model list at boot (section 4.3)
GEMINI_FALLBACK_MODEL=          # optional; used only if the primary model is unavailable
GEMINI_TIMEOUT_MS=90000
GEMINI_MAX_OUTPUT_TOKENS=8192   # use 16384 only when OCR_EXTRACT_PAYMENTS=true
OCR_ENABLED=true                # feature flag: routes + AI Scan button
OCR_MAX_IMAGES=1
OCR_MAX_FILE_BYTES=8388608
OCR_WORKER_ENABLED=true
OCR_WORKER_CONCURRENCY=5
OCR_PER_FINANCE_CONCURRENCY=3
OCR_MAX_RPS=10
OCR_IMAGE_MAX_EDGE_PX=2048
OCR_S3_RETENTION_DAYS=7
OCR_S3_SWEEP_DRY_RUN=true       # stays true until the owner flips it (STOP condition S3)
OCR_EXTRACT_PAYMENTS=false      # payment-table rows are not used by the forms (decision D3)
OCR_DAILY_LIMIT_PER_FINANCE=200
OCR_USER_BATCHES_PER_MINUTE=6
```
`GEMINI_PROJECT_NAME` / `GEMINI_PROJECT_NUMBER` are NOT needed for API-key calls; do not add code that depends on them.
If the previous version of this plan (which contained a partially masked key) was ever committed, shared or pasted anywhere, the owner must rotate that key. Mention this in the final report.

### 0.3 Repo facts to RE-VERIFY (read the real schema/code, do not trust this list blindly)
- PostgreSQL 18 with `uuidv7()`; `pg` pool in `backend/src/config/database.config.js` (never modify it).
- `customers`: `id, finance_id, hplno INT, loan_status, cname, cfname_value, cfname_unit, vehicle_id, aadhar_id VARCHAR(12), other_govt_id_type, other_govt_id_number, profession, work_office_address`.
- `vehicle_detail`: `id, finance_id, vehicle_info_id, vehicle_number UNIQUE (GLOBAL, not per finance), vehicle_modal VARCHAR(10), chassis_number UNIQUE, engine_number UNIQUE, color, variant, selling_price, base_price, final_price, emi_from, status, deal_type ('finance'|'consulting'), rc_holder, rc_status, fc_expiry_date, insurance_expiry_date, remarks`. Check which of these are NOT NULL and which have defaults.
- `vehicle_info` master catalog resolved by `resolveVehicleInfoId(conn, vehicle)` in `backend/src/modules/customers/customer.routes.js`.
- `guardians`, `contacts`, `addresses`, `address_history` as in the existing schema file.
- S3: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` already installed; env `BUCKET_NAME`, `BUCKET_REGION`, `ACCESS_KEY`, `SECRET_ACCESS_KEY`.
- Routing: `backend/src/app.js` mounts `/api` -> `backend/src/routes/index.js`. The frontend `apiClient` already contains `/api` in its baseURL, so frontend calls use `/ocr/...` with no `/api` prefix.
- New dependencies you must add and justify in the report: an image library (e.g. `sharp`) for orientation fix + resize, and `@google/genai` only if you choose the SDK over `fetch`.

### 0.4 Decisions already made (do not re-litigate)
- **D1 Vehicle writes**: The OCR path never calls `POST /vehicles`. The manual "Add Vehicle" dialog (`AddConsultingVehicleDialog`, if present) may keep saving immediately and returns a real UUID; `POST /customers` treats a real UUID as an existing vehicle and a `temp_` / `isNewVehicle` vehicle as a deferred insert. Both paths coexist.
- **D2 Retention**: Image and extracted data expire together at `expires_at`. After that only non-personal metadata remains.
- **D3 Payment rows**: Not extracted by default (`OCR_EXTRACT_PAYMENTS=false`); no form field uses them.
- **D4 Scale**: Phase-1 design is simple and correct (durable queue, fair-share claim, retry, reaper, in-process rate limiter). A multi-key pool and distributed rate limiting are Phase 2 and are NOT built now.
- **D5 Vehicle prices**: Never derive vehicle `base_price` / `final_price` from the loan HP amount.

---

## 1. HARD RULES, STOP CONDITIONS AND PHASES

### 1.1 Hard rules
1. **SQL**: parameterized `$1, $2...` only, read `result.rows`. Never modify `database.config.js`.
2. **Schema**: ONE additive, idempotent migration file (section 3). No `DROP` and no `ALTER` of existing tables. Run migrations only through the project's migration runner or manually; NEVER auto-run DDL at app or worker startup.
3. **Tenancy**: every OCR query enforces `finance_id = req.financeId` (from `enhancedCheckFinance`). Never accept `finance_id` or `user_id` from body/query/params. Return 404 for another tenant's batch/job.
4. **Secrets**: `GEMINI_API_KEY` only in env. Never in the frontend, logs, URL query strings, error messages, or this file. Send via SDK or the `x-goog-api-key` header.
5. **Privacy**: never log base64 images, prompts, extracted JSON, Aadhaar numbers, phone numbers or addresses. Log only `batchId, jobId, status, errorCode, durationMs, tokensIn, tokensOut`.
6. **Retention is mandatory**: every job has `expires_at`; the sweep (section 4.4) deletes the image and erases the extracted data after it.
7. **Vehicle writes**: see D1. OCR scan, worker, review and apply never insert into `vehicle_detail`.
8. **HPL number**: OCR reads `hplno` so the user can see it in the review. Applying it is a per-field choice; unchecked by default when the form already has a value (section 5.5).
9. **Destructive operations are dry-run first**: the S3 delete + data erase sweep runs with `OCR_S3_SWEEP_DRY_RUN=true` by default and logs counts only.
10. **No guessing**: field names, enum values, endpoints and store shapes come from the real code. Where this plan says "verify", write down what you found.

### 1.2 STOP conditions (stop and ask the owner; do not improvise)
- **S1**: Any target database for the migration is not clearly a local/dev database. Do not run the migration there; give the owner the SQL file and wait.
- **S2**: The Gemini model check at boot fails (model id not in the provider list and no valid fallback). Do not silently switch to another model name.
- **S3**: Before setting `OCR_S3_SWEEP_DRY_RUN=false` anywhere other than a local test bucket. The owner flips this, not you.
- **S4**: The real schema contradicts section 0.3 in a way that changes the design (e.g. `vehicle_info_id` NOT NULL with no resolvable value, `hplno` not numeric, no uniqueness guarantees you assumed).
- **S5**: The `POST /customers` transaction structure cannot take the deferred vehicle insert without a risky rewrite.
- **S6**: You find a real API key or password in the repo or its history. Do not copy it; report where it is.
- **S7**: The existing Step 2 / vehicle store semantics differ from the mapping table in section 5.2 (especially what `modelName` holds). Report the real semantics and propose the corrected mapping before coding the mapper.
- **S8**: The owner's data-handling position on sending customer documents (including Aadhaar) to Gemini is unknown. Build the feature behind `OCR_ENABLED` and note in the report that the owner must confirm the provider's data-use terms and add a user notice before enabling it in production.

Routine decisions (file names, helper structure, minor naming) are yours; do not stop for them.

### 1.3 Phases
- **Phase 0 Discovery**: read the code listed in each section, write a short findings note (real names, enums, nullability, existing helpers) in your working notes and in the final report.
- **Phase 1 Backend**: migration file -> routes -> worker -> Gemini service -> sanitizer -> availability endpoint -> `POST /customers` change -> unit tests.
- **Phase 2 Frontend**: API client -> mapper + tests -> AiEntryDialog -> apply flow.
- **Phase 3 Verify**: section 7 (automated tests, manual checklist, accuracy evaluation).

---

## 2. END-TO-END ARCHITECTURE

```
1. FRONTEND  AiEntryDialog (opened by "AI Scan" in MultiStepLoanEntryForm, create flow only)
   - GET /ocr/config -> { enabled, maxImages, allowedMime, maxFileBytes, retentionDays, dailyRemaining }
   - user picks loan category + image(s)
2. CREATE BATCH  POST /ocr/batches
   - quota + rate checks, validates files, one transaction: 1 ocr_batches row + N ocr_jobs rows
   - presigned PUT URL per job (600 s, ContentType and ContentLength signed)
3. DIRECT S3 UPLOAD + COMPLETE
   - browser PUTs to S3, then POST /ocr/jobs/:jobId/complete
   - HeadObject verifies size; on violation the object is deleted and the job fails
   - job -> 'queued' and the worker is woken immediately (setImmediate)
4. WORKER (+ Gemini)
   - fair-share claim (advisory lock), download, magic-byte check, sha256, dedup lookup,
     orientation fix + resize, Gemini call, sanitize, save, refresh batch status
   - reaper requeues stuck jobs; retries use backoff
5. REVIEW & APPLY (AiEntryDialog -> form)
   - GET /ocr/batches/:id polled with limits; review screen with per-section / per-field choices
   - duplicate checks (HPL no, Aadhaar if an existing check exists) + GET /vehicles/availability
   - one atomic applyOcrResult(): sets loan type and data together, no setTimeout hacks
6. SWEEP (hourly + on startup, dry-run by default)
   - delete expired / abandoned S3 objects (prefix-guarded), erase extracted JSON, keep metadata
```

---

## 3. DATABASE MIGRATION (`backend/sql/migrations/20261108_create_ocr_tables.sql`)

First check the folder's existing naming and runner convention and follow it. The migration is additive and idempotent. Do NOT run it unless STOP condition S1 is cleared.

```sql
-- Migration: OCR batches and jobs (additive, idempotent). Target: PostgreSQL 18 (uuidv7)

CREATE TABLE IF NOT EXISTS ocr_batches (
  id                  UUID          PRIMARY KEY DEFAULT uuidv7(),
  finance_id          UUID          NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE,
  created_by_user_id  UUID          REFERENCES users(id) ON DELETE SET NULL,
  context_type        VARCHAR(30)   NOT NULL DEFAULT 'direct_form',
  context_id          UUID          DEFAULT NULL,
  loan_type           VARCHAR(30)   NOT NULL,            -- 'consulting' | 'vehicle'
  expected_images     SMALLINT      NOT NULL DEFAULT 1,
  force_rescan        BOOLEAN       NOT NULL DEFAULT FALSE, -- bypass the dedup cache
  status              VARCHAR(20)   NOT NULL DEFAULT 'created',
  merged_result       JSONB         DEFAULT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ocrb_status CHECK (status IN ('created','processing','complete','needs_review','failed','cancelled')),
  CONSTRAINT chk_ocrb_images CHECK (expected_images BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS ocr_jobs (
  id                  UUID          PRIMARY KEY DEFAULT uuidv7(),
  batch_id            UUID          NOT NULL REFERENCES ocr_batches(id) ON DELETE CASCADE,
  finance_id          UUID          NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE,
  sequence_no         SMALLINT      NOT NULL DEFAULT 1,
  file_name           VARCHAR(255),
  mime_type           VARCHAR(100)  NOT NULL,
  declared_size_bytes INT,
  s3_bucket           VARCHAR(100)  NOT NULL,
  s3_key              VARCHAR(1024) NOT NULL,
  sha256_hex          CHAR(64),
  status              VARCHAR(20)   NOT NULL DEFAULT 'created',
  extracted_data      JSONB         DEFAULT NULL,
  error_code          VARCHAR(80)   DEFAULT NULL,
  retry_count         SMALLINT      NOT NULL DEFAULT 0,
  next_attempt_at     TIMESTAMPTZ   DEFAULT NULL,
  locked_at           TIMESTAMPTZ   DEFAULT NULL,
  model_used          VARCHAR(100)  DEFAULT NULL,
  prompt_version      VARCHAR(30)   DEFAULT NULL,
  tokens_in           INT           DEFAULT NULL,
  tokens_out          INT           DEFAULT NULL,
  uploaded_at         TIMESTAMPTZ   DEFAULT NULL,
  processed_at        TIMESTAMPTZ   DEFAULT NULL,
  expires_at          TIMESTAMPTZ   NOT NULL,              -- set by the API from OCR_S3_RETENTION_DAYS
  s3_deleted_at       TIMESTAMPTZ   DEFAULT NULL,
  data_purged_at      TIMESTAMPTZ   DEFAULT NULL,          -- extracted_data erased
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ocrj_s3 UNIQUE (s3_bucket, s3_key),
  CONSTRAINT uq_ocrj_batch_seq UNIQUE (batch_id, sequence_no),
  CONSTRAINT chk_ocrj_status CHECK (status IN ('created','uploaded','queued','processing','complete','needs_review','failed','cancelled')),
  CONSTRAINT chk_ocrj_json CHECK (extracted_data IS NULL OR jsonb_typeof(extracted_data) = 'object')
);

-- Worker claim: only queued rows
CREATE INDEX IF NOT EXISTS idx_ocrj_queue
  ON ocr_jobs (next_attempt_at, created_at) WHERE status = 'queued';

-- Reaper: jobs stuck in processing
CREATE INDEX IF NOT EXISTS idx_ocrj_processing
  ON ocr_jobs (locked_at) WHERE status = 'processing';

-- Tenant lookups and daily quota counts
CREATE INDEX IF NOT EXISTS idx_ocrb_finance ON ocr_batches (finance_id, created_at DESC);

-- Sweep: expired objects / data not yet cleaned
CREATE INDEX IF NOT EXISTS idx_ocrj_expiry
  ON ocr_jobs (expires_at) WHERE s3_deleted_at IS NULL OR data_purged_at IS NULL;

-- Dedup cache lookup
CREATE INDEX IF NOT EXISTS idx_ocrj_dedup
  ON ocr_jobs (finance_id, sha256_hex)
  WHERE status = 'complete' AND extracted_data IS NOT NULL;
```

---

## 4. BACKEND (`backend/src/modules/ocr/`)

### 4.1 Structure
```
backend/src/modules/ocr/
  prompts/ledger_extraction.v1.txt   # Appendix A, with the {{PAYMENTS_RULE}} marker
  ocr.routes.js                      # mounted at /ocr behind enhancedCheckFinance (+ OCR_ENABLED flag)
  ocr.worker.js                      # claim loop, reaper, retries, cleanup sweep
  gemini.service.js                  # model check, request, error classification, simple rate limiter
  ocr.sanitizer.js                   # defensive parse, normalization, multi-image merge
backend/scripts/ocr_eval.js          # accuracy evaluation (section 7)
```
Mount `/ocr` in `backend/src/routes/index.js` the same way other modules are mounted. When `OCR_ENABLED` is not `true`, the routes return 404 and `GET /ocr/config` returns `enabled:false`. Apply the same role rule used for creating loans (find it in discovery) so only roles that may create a customer can scan.

### 4.2 Queue, worker, retries (Phase-1 scale: correct and simple)
Run the worker in the API process only when `OCR_WORKER_ENABLED=true`; keep it startable as a separate entry (`node backend/src/modules/ocr/ocr.worker.js` or a script) so it can be split out later. Run ONE worker process per environment (the claim also takes an advisory lock, below).

1. **Wake-up**: `POST /ocr/jobs/:jobId/complete` calls `setImmediate(processAvailableJobs)`. A 2-second timer is only a fallback.
2. **Concurrency**: at most `OCR_WORKER_CONCURRENCY` jobs at once (default 5), at most `OCR_PER_FINANCE_CONCURRENCY` in flight per finance (default 3), use `Promise.allSettled`.
3. **Fair-share claim (correct version)**. The per-finance cap must hold inside a single claim, so rank candidates per finance with a window function, and serialize claims with an advisory lock:
```sql
-- inside one transaction:
SELECT pg_advisory_xact_lock(727001);

WITH active AS (
  SELECT finance_id, COUNT(*) AS cnt
  FROM ocr_jobs WHERE status = 'processing' GROUP BY finance_id
),
cand AS (
  SELECT j.id, j.finance_id, j.created_at,
         ROW_NUMBER() OVER (PARTITION BY j.finance_id ORDER BY j.created_at) AS rn
  FROM ocr_jobs j
  WHERE j.status = 'queued'
    AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= CURRENT_TIMESTAMP)
),
eligible AS (
  SELECT c.id
  FROM cand c LEFT JOIN active a ON a.finance_id = c.finance_id
  WHERE c.rn + COALESCE(a.cnt, 0) <= $1          -- OCR_PER_FINANCE_CONCURRENCY
  ORDER BY c.rn ASC, c.created_at ASC            -- round-robin across finances
  LIMIT $2                                       -- free worker slots
)
UPDATE ocr_jobs
SET status = 'processing', locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT id FROM ocr_jobs WHERE id IN (SELECT id FROM eligible) FOR UPDATE SKIP LOCKED
)
RETURNING *;
```
4. **Reaper (every 60 s)**: jobs with `status='processing' AND locked_at < now() - interval '5 minutes'` go back to `queued` with `retry_count + 1` (or to `failed` with `error_code='WORKER_STALLED'` when `retry_count >= 3`).
5. **Retry and backoff**: retryable errors = provider 429, 5xx, network timeout. Set `status='queued'`, `retry_count+1`, `next_attempt_at = now() + (5 s * 2^retry_count)`; after 3 retries -> `failed`. Permanent errors (no retry): `OUTPUT_TRUNCATED`, `BLOCKED_BY_PROVIDER`, `INVALID_IMAGE`, `INVALID_JSON_AFTER_REPAIR`, `FILE_TOO_LARGE`. Manual `retry` endpoint obeys `retry_count < 3` and only when the S3 object still exists.
6. **Per-job steps**: download from S3 (enforce `OCR_MAX_FILE_BYTES` while streaming) -> **magic-byte check** (JPEG/PNG/WebP only; the client-declared MIME is never trusted) -> `sha256` of the original bytes -> **dedup lookup** -> fix EXIF orientation and downscale to `OCR_IMAGE_MAX_EDGE_PX` (JPEG ~85%) -> Gemini -> sanitize -> save `extracted_data`, tokens, `model_used`, `prompt_version`, `processed_at` -> `refreshBatchStatus(batchId)`.
7. **Dedup cache**: reuse a result ONLY when ALL hold: same `finance_id`, same `sha256_hex`, `status='complete'`, `extracted_data IS NOT NULL`, `data_purged_at IS NULL`, same `prompt_version`, same `model_used`, and the batch was NOT created with `force_rescan = true`. `POST /ocr/batches` accepts `forceRescan: true` (the UI exposes it as "Scan again") so a wrong result can be re-extracted.
8. **Batch status**: when every job of a batch is terminal: all `complete` -> batch `complete` and `merged_result` built; some complete + some failed -> `needs_review`; all failed -> `failed`. (`review_required` inside the JSON is only a UI hint; it does not set the batch status.)
9. **Rate limiting to the provider**: a small in-process token bucket (`OCR_MAX_RPS`, default 10) plus retry-with-backoff on 429. Document that more than one worker process requires dividing the limit. A multi-key pool is Phase 2.

### 4.3 Gemini service (`gemini.service.js`)
- Uses `GEMINI_API_KEY` and `GEMINI_MODEL` from env. On startup call the provider's model-list endpoint with the `x-goog-api-key` header and confirm `GEMINI_MODEL` exists. If it does not: use `GEMINI_FALLBACK_MODEL` if it exists and log a warning; otherwise **STOP condition S2** (log a clear error and disable the worker; do not guess another name). The plan does not assert that any specific model id exists; the boot check is the proof.
- Build the system instruction from `ledger_extraction.v1.txt`, replacing `{{PAYMENTS_RULE}}` with the "skip payments" or "extract payments" sentence defined in Appendix A according to `OCR_EXTRACT_PAYMENTS`.
- Request: `systemInstruction`, one `inlineData` image part + a short user text, `generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS }`. If the model supports `responseSchema`, pass a schema derived from Appendix A as well; otherwise rely on the prompt + sanitizer.
- Timeout `GEMINI_TIMEOUT_MS` with `AbortController`.
- Inspect `candidates[0].finishReason`: `MAX_TOKENS` -> `OUTPUT_TRUNCATED`; `SAFETY` / `RECITATION` -> `BLOCKED_BY_PROVIDER`. Read `usageMetadata` for `tokens_in` / `tokens_out`.
- Never include the key, image data or prompt text in thrown errors or logs.
- Do not hardcode provider rate-limit numbers in code comments or docs; they change.

### 4.4 S3 security, retention and cleanup
1. **Keys**: server-generated `ocr/${financeId}/${batchId}/${jobId}.${ext}` (client file name never used in the path). `ext` comes from the validated MIME.
2. **Presigned PUT** (600 s): bind `ContentType` and **sign `ContentLength`** using the size declared at batch creation, so S3 rejects any other size. Allowed MIME: `image/jpeg`, `image/png`, `image/webp` (HEIC is not accepted: the UI shows "please use a JPEG or PNG photo" and, if the project already converts HEIC in the browser, reuse that).
3. **Verify after upload** (`/complete`): `HeadObject`; if the object is missing, larger than `OCR_MAX_FILE_BYTES`, or its size differs from the declared size, **delete the object**, mark the job `failed` (`FILE_TOO_LARGE` / `UPLOAD_MISMATCH`) and return 400.
4. **Expiry**: `expires_at = now() + OCR_S3_RETENTION_DAYS` days, with the value clamped to 1..90, computed in the API when the job row is inserted.
5. **Cleanup sweep** `cleanupExpiredOcr()` on startup and every 60 minutes, max 50 rows per run, covering two steps:
   - **Images**: rows with `s3_deleted_at IS NULL AND (expires_at <= now() OR (status IN ('created','cancelled') AND created_at <= now() - interval '24 hours'))`.
   - **Data**: rows with `expires_at <= now() AND data_purged_at IS NULL`: set `extracted_data = NULL`, `data_purged_at = now()`, and set the batch `merged_result = NULL` once all of its jobs are purged. Keep all non-personal columns.
   - **Guards**: only delete when `row.s3_bucket` equals the configured bucket AND `row.s3_key` starts with `ocr/`. Treat `NoSuchKey` as success. Log only job ids and counts.
   - **Dry-run**: while `OCR_S3_SWEEP_DRY_RUN=true`, nothing is deleted or erased; the sweep logs how many rows it WOULD process. STOP condition S3 controls the flip.
6. After expiry `GET /ocr/batches/:id` returns `status: 'expired'` with no data.
7. **Infrastructure checklist** (the app cannot do these; list them in the final report as manual steps for the owner, with the exact JSON/config you used in testing):
   - Bucket CORS allowing `PUT` from the frontend origins (browser upload fails without it).
   - Block Public Access ON; server-side encryption ON.
   - Lifecycle rule on prefix `ocr/` that expires objects after `OCR_S3_RETENTION_DAYS + 1` days as a backstop. (An `Expires` header is only a caching header and does NOT delete anything; do not rely on it.)

### 4.5 API endpoints (`ocr.routes.js`)
All scoped by `finance_id = req.financeId`. Standard response envelope of the project. Never return `s3_key` or `s3_bucket`.

1. **`GET /ocr/config`** -> `{ enabled, maxImages (1..5 from OCR_MAX_IMAGES), allowedMime, maxFileBytes, retentionDays, extractPayments, dailyRemaining }`.
2. **`POST /ocr/batches`** body `{ loanType: 'consulting'|'vehicle', files: [{ fileName, contentType, size }], forceRescan?: boolean }`.
   - Validate: `1 <= files.length <= maxImages`; MIME allowed; `0 < size <= maxFileBytes`; `loanType` valid.
   - **Quota and rate**: reject with 429 `OCR_QUOTA_EXCEEDED` when the finance already created `OCR_DAILY_LIMIT_PER_FINANCE` batches today, and with 429 `OCR_RATE_LIMITED` when the user exceeded `OCR_USER_BATCHES_PER_MINUTE`. Count from `ocr_batches` (no extra table).
   - One transaction creates the batch and N jobs (`sequence_no` 1..N, `expires_at` set), then returns presigned URLs: `{ batchId, expiresAt, jobs: [{ jobId, sequenceNo, uploadUrl, contentType }] }`.
3. **`POST /ocr/jobs/:jobId/complete`**: verifies the object (4.4.3), sets job `queued` + `uploaded_at`, batch `processing`, wakes the worker. Idempotent if already `queued` / `processing` / `complete`.
4. **`GET /ocr/batches/:batchId`**: batch status, per-job `{ sequenceNo, status, errorCode }`, and `mergedResult` only when complete / needs_review.
5. **`POST /ocr/jobs/:jobId/retry`**: only `failed` jobs with `retry_count < 3` whose S3 object still exists.
6. **`POST /ocr/batches/:batchId/cancel`**: marks the batch and unfinished jobs `cancelled` and makes their images eligible for the next sweep immediately.

### 4.6 Sanitizer and merger (`ocr.sanitizer.js`)
- Strip accidental code fences, parse JSON; on failure make ONE repair attempt (trim to the outermost braces); otherwise `INVALID_JSON_AFTER_REPAIR`.
- Ensure every top-level section exists; set `review_required: true`.
- **Drop empty items**: any element of `ccontacts`, `gcontacts`, `payments`, `name_mismatches`, `shifted_field_corrections`, `uncertain_fields` whose values are all null/empty is removed (the model sometimes copies the schema example).
- Normalize: trim strings; convert Tamil digits (௦-௯) to 0-9 in phone, amount, year, vehicle number and date fields; phones -> keep raw + a cleaned 10-digit mobile string; vehicle number -> uppercase, no spaces; amounts -> JSON numbers (strip currency symbols, commas, trailing "/-"); formulas stay in `raw_due_amount_text` and leave the number null.
- Caps: `payments` max 300, contacts max 10.
- Never throw away a field silently: when a value cannot be normalized, keep the raw text in `ai_predictions_and_options.uncertain_fields`.
- **Multi-image merge** `mergeJobExtractions(jobs)`: one image -> its `extracted_data`; several -> merge by `sequence_no`, fill nulls from later images, concatenate `payments`, and record conflicting non-null values in `uncertain_fields`.

### 4.7 Vehicle availability endpoint (new, in the vehicles module)
`GET /vehicles/availability?number=<regNo>[&engine=<no>][&chassis=<no>]`, behind `enhancedCheckFinance`. It must IGNORE the filters used by `/vehicles/search` (status, deal type) because `vehicle_number`, `engine_number` and `chassis_number` are unique across the whole table.
- Normalize inputs (uppercase, strip spaces). Look up all three columns globally.
- Response `{ state, vehicleId?, vehicle?, conflicts? }`:
  - `not_found`: nothing exists -> safe to create later.
  - `available`: exists in THIS finance, `status = 'available'`, not referenced by any customer or loan -> `vehicleId` + display fields so it can be linked.
  - `in_use`: exists in this finance but sold or referenced -> block linking.
  - `unavailable`: exists in ANOTHER finance -> return only `state` (no details, no ids).
  - `conflicts: ['engine_number' | 'chassis_number']` when those collide with a different vehicle.
- Read-only. Never creates anything.

---

## 5. FRONTEND

### 5.1 Form store (re-verify against `frontend/src/types/formStore.ts` and the real components)
Hook: `useFormStore()` with `customer, vehicle, loan, guardian, updateCustomer, updateVehicle, updateLoan, updateGuardian`. Shapes (as of this plan; the real file wins):
- **Customer**: `hplno, cname, loanStatus, brokerName, cfname{value,unit}, ccontacts[{contact_type,type,number}], caddress{house_no,street,street_name,village,land_mark,address,city,district,state,pincode,location,latitude,longitude}, aadhar_id, other_govt_id_type, other_govt_id_number, profession, work_office_address, work_office_phone`.
- **Vehicle**: `id, vehicle_info_id, vehicleNumber, vehicleName, modelName, model_name, brand, color, type, selling_price, base_price, emi_from, engine_number, chassis_number, rc_holder, rc_status, deal_type, fuel_type, remarks, variant, isNewVehicle?`.
- **Loan**: `loan_type, hpAmount, hpDate, due_date, dueMonth, interestRate, penaltyAmount, penalty_days, principle_part, interest_part, dueAmount, net_payable, down_payment, pay_mode, net_payment, pay_mode_1, pay_mode_1_amount, hand_loan, hand_loan_remarks, broker_name, dealer_name, documentation_charge, broker_commission, remarks`.
- **Guardian**: `customer_hplno, gname, gfname{value,unit}, gcontacts[...], gaddress, aadhar_id, other_govt_id_type, other_govt_id_number, profession, work_office_address, work_office_phone, remarks`.

### 5.2 Field mapping table (the single source of truth for the mapper)
Before writing the mapper, read `Step2ConsultingLoan.tsx` (`handleVehicleSelect`) and the vehicle Step 2 and CONFIRM what each vehicle store field holds. Existing code is believed to put the vehicle's year (`vehicle_modal`) into `modelName` and the model into `model_name`. If this differs, STOP condition S7.

| OCR JSON field | Form store field | Database column / note |
|---|---|---|
| customer.hplno | customer.hplno (string) | `customers.hplno` INT; digits only, non-numeric -> leave empty + uncertain |
| customer.cname | customer.cname | `customers.cname` |
| customer.cfname.unit / value | customer.cfname | `cfname_unit` / `cfname_value` |
| customer.ccontacts[] | customer.ccontacts (number = cleaned 10 digits) | `contacts`; the handwritten `label` is shown in the review only (store has no label) |
| customer.caddress.* | customer.caddress.* | `addresses`; `address` = raw text; location/lat/lng stay empty |
| customer.profession / work_office_* | same names | `customers.*` |
| customer.aadhar_id | customer.aadhar_id | 12 digits else empty + uncertain |
| vehicle.vehicleNumber | vehicle.vehicleNumber | `vehicle_detail.vehicle_number` |
| vehicle.brand | vehicle.brand | via `resolveVehicleInfoId` |
| vehicle.vehicleName | vehicle.vehicleName | display; "brand model_name" |
| vehicle.model_name | vehicle.model_name | via `resolveVehicleInfoId` |
| vehicle.manufacture_year | vehicle.modelName (year) | `vehicle_detail.vehicle_modal` |
| vehicle.type | vehicle.type (mapped enum) | see 5.3 |
| vehicle.color / engine_number / chassis_number / rc_status / rc_holder / remarks | same names | `vehicle_detail.*`; empty values become NULL on save (section 6) |
| loan.* | loan.* (numbers, ISO dates) | `loans`; `loan.loan_type` derived from the vehicle type map |
| guardian.* | guardian.* | `guardians`; `guardian.customer_hplno` = customer.hplno |

The OCR prompt no longer returns `modelName` or `vehicle_info_id`. `suggested_vehicle` (Appendix A) is never mapped automatically.

### 5.3 `mapOcrToStore(result, loanType)` (pure function + unit tests)
Put it in its own file (e.g. `frontend/src/utils/ocrMapper.ts`), no React, no store access. It returns `{ customer, vehicle, loan, guardian, warnings[] }` containing only fields that have a usable value.
- **Enums**: vehicle type: "2 Wheeler" -> `two_wheeler`, "3 Wheeler" -> `three_wheeler`, "4 Wheeler" -> `four_wheeler`, "Bike" -> `bike`, "Scooter" -> `scooter`; relation units `S/O W/O D/O H/O M/O F/O`; `pay_mode` synonyms -> `cash|online|bank|cheque`; `rc_status`, `rc_holder`. Unknown value -> omit the field and add a warning (never invent).
- **Numbers**: only real numbers; strings like "3000+1200" produce no number and a warning that shows `raw_due_amount_text`.
- **Dates**: ISO `YYYY-MM-DD`. For two-digit years: `yy <= currentYY + 1` -> 20yy, else 19yy. A bare day number such as "21" is kept as text in `due_date` only if the existing field accepts it; otherwise omit with a warning.
- **Interest rate**: do NOT auto-calculate. Only if the project already has an interest calculation helper used by the form, call that helper and mark the value "estimated" in the review (unchecked by default). Otherwise leave it empty.
- **Vehicle prices**: never set `base_price` / `final_price` from OCR or from `hpAmount`.
- **Deal type**: for consulting set `vehicle.deal_type = 'consulting'`.
- Unit tests cover: Tamil digits, "₹1,20,000/-", relation units, date pivots, formula amounts, unknown enums, empty arrays, label-shifted vehicle numbers.

### 5.4 API client (`frontend/src/api/ocrApi.ts`)
- `apiClient` for `/ocr/config`, `/ocr/batches`, `/ocr/jobs/:id/complete`, `/ocr/batches/:id`, retry, cancel, and `/vehicles/availability`.
- Direct S3 upload with native `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })`; never send the backend `Authorization` header to S3. If you signed `ContentLength`, the browser sends it automatically.
- Map backend error codes (`OCR_QUOTA_EXCEEDED`, `OCR_RATE_LIMITED`, `FILE_TOO_LARGE`, `OUTPUT_TRUNCATED`, `BLOCKED_BY_PROVIDER`, `INVALID_IMAGE`) to clear user messages.

### 5.5 `AiEntryDialog.tsx`
Remove `MOCK_LEDGER_DATA` and the timer simulation.
1. **Open**: call `getOcrConfig()`. If `enabled` is false, hide the AI Scan button. With `maxImages === 1` show the single-image dropzone; with more, show thumbnails and remove buttons up to `maxImages`. Show `dailyRemaining`.
2. **Progress**: creating batch + upload (0-25%), confirm + queue (25-45%), polling (45-90%), availability + duplicate checks (90-100%).
3. **Polling rules**: every 2 s for the first 20 s, then every 5 s; stop after 120 s with a "taking longer than usual, try again" state; stop on unmount; if the dialog is closed before Apply, call `cancel` for unfinished batches. Show a "Scan again" action that sends `forceRescan: true`.
4. **Review screen** (before touching the form): sections Customer, Vehicle, Loan, Guardian. Every section has an "Apply" checkbox (default on). Every field shows the OCR value and warnings; uncertain fields from `ai_predictions_and_options.uncertain_fields` are listed with their candidate readings and the user may pick one.
   - Vehicle section badge (Consulting): `Matched in inventory` (availability `available`), `New vehicle (saved when the loan is submitted)` (`not_found`), `Vehicle already in use` (`in_use`, apply is blocked for the vehicle fields), `Registration number belongs to another record` (`unavailable`, block). Engine/chassis conflicts are shown as field warnings.
   - Loan section: show a warning when `raw_due_amount_text` exists (formula written).
   - `suggested_vehicle` is displayed as a suggestion with an unchecked "Use suggestion" box.
5. **Duplicate checks** at review time (reuse the existing endpoints/hooks that Step 1 already uses; add a minimal one only if none exists): HPL number already used in this finance, Aadhaar already used if such a check exists. Show warnings; do not block silently.
6. **Apply policy**: default mode is **"fill empty fields only"**. A toggle "Overwrite filled fields" is off by default. `hplno` has its own checkbox: unchecked by default when the form already has a value.
7. **Atomic apply**: implement ONE `applyOcrResult(loanType, mappedData, mode)` in the form container. It sets the loan type and the data together without `setTimeout`: store the payload as pending, switch the loan type, and apply it in an effect when the loan type matches. Applying must not trigger the "Step 2 will be reset" confirmation of the loan type toggle (the review screen already told the user that Step 2 data will be replaced when the type differs). Customer (Step 1) and Guardian (Step 3) data follow the fill-empty policy; Step 2 data is replaced only if the user confirmed that in the review.
8. The AI Scan button and dialog exist only in the create flow. Edit pages must not import them.

---

## 6. CONSULTING VEHICLE PERSISTENCE (`backend/src/modules/customers/customer.routes.js`)

Find the `POST /` handler and its `BEGIN ... COMMIT` block (do not rely on line numbers). Today it expects `vehicle.id` to be an existing `vehicle_detail` row. Extend it, inside the same transaction:

A vehicle is **deferred** when `vehicle.isNewVehicle === true`, or `String(vehicle.id).startsWith('temp_')`, or `!vehicle.id` with a registration number present. A real UUID keeps today's behavior untouched.

For a deferred vehicle:
1. Normalize `vehicle_number` (uppercase, no spaces). Normalize `engine_number` / `chassis_number` (uppercase, trimmed) and convert empty strings to `NULL` (these columns are UNIQUE; empty strings would collide on the second customer).
2. `SELECT id, finance_id, status, deal_type FROM vehicle_detail WHERE vehicle_number = $1 FOR UPDATE` (GLOBAL, not filtered by finance).
   - **Not found**: also pre-check non-null engine and chassis numbers globally; on conflict return 409 with the conflicting field name. Resolve `vehicle_info_id` with `resolveVehicleInfoId(conn, vehicle)`; if the column is NOT NULL and cannot be resolved, return 422 asking the user to choose brand/model. `INSERT INTO vehicle_detail` with `finance_id` from the middleware, `deal_type = 'consulting'`, `status = 'sales'`, `vehicle_modal` from the year, `base_price` = master price from `vehicle_info` if resolved else the schema default / NULL, `final_price` = `selling_price` if provided else the same fallback. Never use `loan.hpAmount` for prices.
   - **Found in the same finance**, `status = 'available'`, and not referenced by any customer or loan: reuse its id and set `status = 'sales'`.
   - **Found in the same finance but sold / referenced**: 409 `VEHICLE_ALREADY_LINKED`.
   - **Found in another finance**: 409 `VEHICLE_NUMBER_TAKEN` with a generic message (no details).
3. Use the resulting `finalVehicleId` for `customers.vehicle_id` and `loans.vehicle_id`.
4. As a backstop, map PostgreSQL unique violations (`23505`) on these columns to the same 409 responses instead of a 500.
5. Because errors would otherwise appear only at the last step, the frontend already calls `/vehicles/availability` at apply time (5.5) and again when the user moves from Step 2 to Step 3.

---

## 7. TESTING AND VERIFICATION

### 7.1 Automated
- Backend unit tests: sanitizer (fences, repair, Tamil digits, empty-item removal, amounts, formulas, caps, merge conflicts); claim query per-finance cap with several tenants; reaper; retry/backoff classification; sweep guards (wrong bucket, key without `ocr/` prefix, dry-run does nothing); availability states; `POST /customers` deferred-vehicle paths (not found, reuse, in use, other finance, empty engine/chassis -> NULL, unique-violation mapping).
- Frontend unit tests: `mapOcrToStore` cases listed in 5.3; apply policy (fill-empty vs overwrite); atomic apply with a loan-type switch.
- Use SYNTHETIC mock Gemini JSON for tests. Do not invent or commit real customer documents.

### 7.2 Accuracy evaluation (gate before any rollout)
The owner provides 20-30 real, anonymized ledger card images with a hand-labelled JSON each (put them OUTSIDE git, e.g. a local folder passed by path). Write `backend/scripts/ocr_eval.js` that runs the pipeline on them and prints per-field accuracy (customer name, relation, phone numbers, address parts, vehicle number, brand/model/year, HP amount, due amount, due months, dates, guardian name/phone). Suggested targets before enabling for staff: vehicle number and phone >= 90 %, names >= 85 %, amounts >= 85 % exact. If a field is below target, adjust the prompt (new `ledger_extraction.v2.txt`, bump `prompt_version`) and re-run. Report the numbers.

### 7.3 Manual checklist
- [ ] `backend/.env.example` lists all variable NAMES with empty values; no real key anywhere in the repo or this file.
- [ ] Migration file exists, is additive/idempotent, and was applied only to a dev database (S1).
- [ ] `GET /api/ocr/config` returns `enabled`, `maxImages: 1`, `retentionDays`, `dailyRemaining`.
- [ ] Boot log confirms the Gemini model check result; failure path disables the worker (S2).
- [ ] Upload -> presigned PUT -> complete -> worker -> review works end to end with a real card; oversize or wrong-size upload is rejected and the object is deleted.
- [ ] Two finances queueing many jobs: no finance exceeds `OCR_PER_FINANCE_CONCURRENCY`; the other finance is not starved.
- [ ] Killing the worker mid-job: the reaper requeues it and it completes.
- [ ] A 429 from the provider leads to backoff retries, then `failed` after 3 attempts.
- [ ] Same image scanned twice: second is instant (dedup); "Scan again" forces a new extraction.
- [ ] Review: fill-empty-only default, per-section checkboxes, per-field uncertain choices, HPL checkbox, duplicate warnings.
- [ ] Applying with a different loan type than the current mode switches mode and fills Step 1, Step 2, Step 3 without race or reset prompt.
- [ ] Consulting: registration found + available -> linked; not found -> `isNewVehicle: true` and the vehicle is inserted only when Step 3 is submitted; sold/other-finance numbers are blocked with clear messages; cancelling the loan leaves NO new vehicle row.
- [ ] Empty engine/chassis on two consecutive new vehicles does not collide (stored as NULL).
- [ ] Sweep in dry-run only logs counts; with a local test bucket and the flag off, expired images are deleted, `extracted_data` is NULL, `data_purged_at` set, metadata kept; an object outside `ocr/` is never touched.
- [ ] Daily quota and per-minute limits return the documented 429 codes; unauthorized roles cannot scan.
- [ ] The AI Scan button is absent on all edit pages.
- [ ] No console errors; `npm run build` passes with zero TypeScript errors; backend tests pass.

### 7.4 Final report (required)
Files created/changed; real names/enums found in discovery; any mismatch with this plan; new dependencies and why; model check result; mapping decisions (especially `modelName`); infra steps for the owner (CORS, lifecycle rule, encryption, Block Public Access, key rotation, provider data-use terms and user notice per S8); accuracy numbers from 7.2; known limitations; Phase-2 list (multi-key pool, distributed rate limiting, separate worker deployment, payment-row import if ever needed).

---

## 8. APPENDIX A: GEMINI SYSTEM INSTRUCTION (`backend/src/modules/ocr/prompts/ledger_extraction.v1.txt`)

Store this text verbatim in the file. The worker replaces the line `{{PAYMENTS_RULE}}` before sending:
- when `OCR_EXTRACT_PAYMENTS=false`: `Do NOT extract payment rows. Set "payments" to [] and "table_headers" to [].`
- when `true`: `If the document has a payment ledger table, put its column headers in "table_headers" and its rows in "payments". Otherwise use [].`

```text
You extract data from handwritten Indian vehicle-finance documents (ledger pages, Party/Gur cards, HP slips, collection cards) to auto-fill our Vehicle Loan and Consulting Loan forms. Layouts vary. Tamil, English, and Tanglish are mixed. Return ONLY minified valid JSON (no markdown, no explanation).

GENERAL RULES:
- Every key in the SCHEMA must be present. If a value is not visible on the document, use null. If a list has no items, use [] (never a list containing an object full of nulls).
- Write ONLY what is actually written on the document in the main fields. Never invent or infer values to fill gaps. If handwriting is unclear, set the field to null and describe the possible readings in ai_predictions_and_options.uncertain_fields.
- Convert Tamil digits (௦ ௧ ௨ ௩ ௪ ௫ ௬ ௭ ௮ ௯) to Western digits 0-9 in phone numbers, amounts, years, dates, account numbers and vehicle numbers.
- Amounts are JSON numbers without currency symbols, commas or "/-" (example: 120000). If an amount is written as a formula or split (example: "3000+1200", "5000x4=20000"), copy the exact text to loan.raw_due_amount_text and set the numeric field to null unless a single base installment is clearly written.
- Keep names and addresses in the original script (Tamil stays Tamil). Do not translate.

FIELD RULES:
1. ACCOUNT / HPL NUMBER (customer.hplno and guardian.customer_hplno): labels like "MEAKER NUMBER", "A/c No.", "AC No", "HPL No", "HP No", "Loan No", "LON", or "Card No." when used as the account number. Digits only. Writers often put the vehicle registration number or the vehicle name next to the "A/c No." label by mistake. If the value looks like a registration (starts with a state code such as TN, KL, KA) or a vehicle name (such as PULSAR 150, Activa), do NOT use it as hplno: move it to the vehicle fields and record the move in ai_predictions_and_options.shifted_field_corrections.

2. CUSTOMER vs GUARDIAN:
   - customer.cname comes from "Party Name", "ACCOUNT NAME" or "Name". If an Account Name heading and a Party Name both exist and differ, put the primary borrower in cname and list both in ai_predictions_and_options.name_mismatches.
   - Relation (cfname, gfname) is {"unit": "S/O"|"W/O"|"D/O"|"H/O"|"M/O"|"F/O"|null, "value": name|null}. Convert Tamil markers such as "த/பெ" to "S/O" and "ம/பெ" to "W/O" in unit; keep the person's name in the original script in value.
   - guardian.gname comes from "Gur Name", "Co-obligant", "Guarantor", "C/O" or "ஜாமீன்".

3. CONTACTS AND WORK: capture every phone number as a string. In ccontacts / gcontacts set contact_type to "customer" or "guardian" and type to "mobile", "landline" or "work". Keep the handwritten relationship tag (for example "மனைவி", "அப்பா", "செல்", "வேலை") in label. From "Work Add:", "வேலை" or "வே-" extract profession, work_office_address and work_office_phone.

4. ADDRESS (caddress, gaddress): split into house_no (Door No / D.No), street, street_name, village, land_mark (text after "L.M", "Landmark", "எதிரில்", "அருகில்", "பின்புறம்", "backside"), city, district (for example "திருப்பூர்" / "TRP" / "Tup" means Tiruppur), state, pincode. Put the full unedited address text in address. location, latitude and longitude are always null.

5. VEHICLE (vehicle): the right-hand block is often shifted (for example the registration number written near "A/c No", the vehicle name near "Vehicle No", the year near "Colour"). Classify each value by what it IS, not by the printed label beside it.
   - vehicleNumber: registration format such as "TN 39 CM 1234", "TN 24 P 5332". Output uppercase without spaces (TN39CM1234).
   - brand, vehicleName, model_name: only from the vehicle name written on the card (example "Honda Dio": brand "Honda", vehicleName "Honda Dio", model_name "Dio"). If no name is written, use null.
   - manufacture_year: 4-digit year written on the card.
   - color: the written colour.
   - type: "2 Wheeler", "3 Wheeler", "4 Wheeler", "Scooter", "Bike" or null.
   - engine_number, chassis_number, rc_status, rc_holder, remarks: only if written.

6. LOAN (loan): extract hpAmount, dueMonth (number of dues/months), hpDate, due_date, dueAmount, interestRate, book_binding_amount, hand_loan, documentation_charge, broker_name, dealer_name, pay_mode, down_payment, pay_mode_1, pay_mode_1_amount, net_payment, net_payable, penaltyAmount, penalty_days, principle_part, interest_part, loan_type, remarks, hand_loan_remarks, broker_commission when visible; otherwise null. Convert clear Indian dates (DD/MM/YY or DD-MM-YYYY) to "YYYY-MM-DD". If only a day number is written for due_date (for example "21" or "22.4"), keep the exact text.

7. {{PAYMENTS_RULE}}

8. UNCERTAINTY AND SUGGESTIONS (ai_predictions_and_options):
   - uncertain_fields: one item per unclear field {"field_path","raw_text","options":[...],"reason"}.
   - suggested_vehicle: only when the card has a partial or misspelled vehicle name, give your best normalized brand / vehicleName / model_name / manufacture_year / type with a short confidence_note. This is a SUGGESTION for a human to confirm; never copy it into the main vehicle fields.
   - shifted_field_corrections: one item per label-shift correction {"printed_label","written_value","mapped_to_field"}.
   - review_required is always true.

ITEM SHAPES (lists contain items of these shapes, or are empty):
ccontacts / gcontacts item: {"contact_type":"customer"|"guardian","type":"mobile"|"landline"|"work","number":string,"label":string|null}
payments item: {"no":string|null,"due_date":string|null,"due_amount":number|null,"receipt_no":string|null,"paid_date":string|null,"cols":{},"remark":string|null}
name_mismatches item: {"field":string,"account_heading_name":string|null,"party_name":string|null,"selected_for_form":string|null}

SCHEMA:
{"form_type_detected":null,"doc_meta":{"company":null,"card_no":null,"raw_acc_no":null,"doc_type":null},"customer":{"hplno":null,"cname":null,"cfname":{"unit":null,"value":null},"ccontacts":[],"caddress":{"house_no":null,"street":null,"street_name":null,"village":null,"land_mark":null,"address":null,"pincode":null,"city":null,"district":null,"state":null,"location":null,"latitude":null,"longitude":null},"profession":null,"work_office_phone":null,"work_office_address":null,"aadhar_id":null,"other_govt_id_type":null,"other_govt_id_number":null},"vehicle":{"brand":null,"vehicleName":null,"model_name":null,"manufacture_year":null,"vehicleNumber":null,"type":null,"color":null,"rc_status":null,"rc_holder":null,"engine_number":null,"chassis_number":null,"remarks":null},"loan":{"loan_type":null,"pay_mode":null,"down_payment":null,"pay_mode_1":null,"pay_mode_1_amount":null,"net_payment":null,"hpAmount":null,"dueMonth":null,"hpDate":null,"due_date":null,"interestRate":null,"principle_part":null,"interest_part":null,"dueAmount":null,"raw_due_amount_text":null,"book_binding_amount":null,"net_payable":null,"penaltyAmount":null,"penalty_days":null,"hand_loan":null,"documentation_charge":null,"hand_loan_remarks":null,"broker_name":null,"broker_commission":null,"dealer_name":null,"remarks":null},"guardian":{"customer_hplno":null,"gname":null,"gfname":{"unit":null,"value":null},"gcontacts":[],"gaddress":{"house_no":null,"street":null,"street_name":null,"village":null,"land_mark":null,"address":null,"pincode":null,"city":null,"district":null,"state":null,"location":null,"latitude":null,"longitude":null},"profession":null,"work_office_phone":null,"work_office_address":null,"aadhar_id":null,"other_govt_id_type":null,"other_govt_id_number":null,"remarks":null},"table_headers":[],"payments":[],"notes":[],"ai_predictions_and_options":{"suggested_vehicle":{"brand":null,"vehicleName":null,"model_name":null,"manufacture_year":null,"type":null,"confidence_note":null},"name_mismatches":[],"shifted_field_corrections":[],"uncertain_fields":[],"review_required":true}}
```

---

## 9. APPENDIX B: CHANGES FROM v1 (for the owner)
1. Removed the (partially masked) API key and project number; env section now lists names only; key rotation noted.
2. Added real STOP conditions and phases; destructive sweep is dry-run by default and prefix/bucket guarded; no auto-DDL at startup.
3. Resolved the Add Vehicle dialog vs deferred vehicle write contradiction (D1).
4. Vehicle checks are global (UNIQUE columns), empty engine/chassis become NULL, reuse only when available and unlinked, new availability endpoint ignores search filters.
5. Personal data now expires with the image; only metadata remains. Aadhaar and other personal data are no longer kept forever.
6. Added the OCR -> store -> DB mapping table (incl. the `modelName` year/model confusion), a tested mapper, enum/Tamil-digit/amount/date normalization, and removed interest-rate guessing and vehicle price = HP amount.
7. Apply flow: fill-empty default, per-section/field choices, duplicate warnings, one atomic apply instead of `setTimeout`.
8. Queue: fixed fair-share claim, reaper, retry/backoff, dedup keyed by prompt version + model with force rescan, batch status rules.
9. Upload safety: signed ContentLength, post-upload verification with delete, magic-byte check, image library named, CORS/lifecycle/encryption checklist, daily and per-minute quotas, role check.
10. Prompt v1 fixes: no null-object samples, payments off by default, suggestions separated from real fields, Tamil digits, no `modelName` / `vehicle_info_id` from the model.
11. Added tests and a 20-30 card accuracy gate; simplified scale design (multi-key pool deferred to Phase 2); model id is verified at boot, not assumed.

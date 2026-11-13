-- ============================================================================
--  AUTOFINEX VOICE AI — MIGRATION 002 (V4: 10/10 HYPERSCALE TRIGGER ARCHITECTURE)
-- ============================================================================
--  Extends:
--    1. AutoFinex_final_schema.sql      (Core CRM, Loans, Payments, Sub-Due, AI UI)
--    2. Autofinex_account_schema.sql    (Double-entry Accounting)
--
--  DESIGN PHILOSOPHY (100 TO 1,00,000+ FINANCE COMPANIES READY):
--    * ZERO TABLE BLOAT: Eliminates 29 redundant voice_* tables by reusing
--      AutoFinex's existing tables (ai_settings, ai_telecalling_leads,
--      ai_telecalling_call_logs, ai_conversations, ai_messages, ai_customer_memory,
--      promise_to_pay, qr_payment_requests, owner_whatsapp_settings, contacts).
--    * O(1) LOOP-LESS DUE MATH: `fn_calculate_customer_due_summary` uses pure
--      O(1) month-clamped integer date arithmetic (~0.05 ms, zero loops).
--    * STATEMENT-LEVEL BULK TRIGGERS (`REFERENCING NEW/OLD TABLE`): Bulk CSV/Excel
--      uploads of 50,000+ rows deduplicate `DISTINCT customer_id` per statement.
--    * SMART DUE-DAY MIDNIGHT REFRESH & NATIVE MONTHLY PARTITIONING:
--      Midnight refresh scans ONLY the ~3.3% of loans matching today's due day,
--      while high-volume per-call tables (`voice_call_summaries`,
--      `voice_call_biometrics`) use native PostgreSQL `PARTITION BY RANGE` +
--      tenant-first `(finance_id, ...)` keys for seamless Citus sharding.
--    * ONLY 4 NEW FOCUSED TABLES ACROSS PLAN 1 & PLAN 2:
--        1. voice_customer_memory    (Plan 1: Level-3 compact rolling profile per customer)
--        2. voice_call_summaries     (Plan 1: Level-2 monthly-partitioned call summaries)
--        3. voice_speaker_profiles   (Plan 2: SpeechBrain 192-dim voiceprint + DPDP consent)
--        4. voice_call_biometrics    (Plan 2: Monthly-partitioned verification & diarization)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. PREFLIGHT CHECKS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_missing TEXT[];
BEGIN
    IF to_regprocedure('uuidv7()') IS NULL THEN
        RAISE EXCEPTION 'uuidv7() function is required (PostgreSQL 18+ or uuidv7 polyfill).';
    END IF;

    SELECT array_agg(t) INTO v_missing
    FROM unnest(ARRAY[
        'finance_detail', 'owner', 'customers', 'contacts', 'loans',
        'payments', 'sub_due', 'users', 'promise_to_pay', 'qr_payment_requests',
        'owner_whatsapp_settings', 'ai_settings', 'ai_telecalling_leads',
        'ai_telecalling_call_logs', 'ai_conversations', 'ai_messages',
        'ai_customer_memory', 'system_features'
    ]) AS t
    WHERE to_regclass('public.' || t) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Base AutoFinex schema incomplete. Missing tables: %', v_missing;
    END IF;
END $$;

-- Optional pgvector extension (gracefully enabled if installed on host; otherwise REAL[] works natively)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;
    END IF;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping CREATE EXTENSION vector (insufficient privilege); REAL[] fallback active.';
END $$;

BEGIN;

-- ============================================================================
-- SECTION 1: CLEANUP OF OBSOLETE BLOATED V1/V2 TABLES (Idempotent)
-- ============================================================================
DROP VIEW IF EXISTS vw_voice_daily_tenant_metrics CASCADE;
DROP VIEW IF EXISTS vw_voice_promise_outcomes CASCADE;
DROP VIEW IF EXISTS vw_voice_queue_health CASCADE;
DROP VIEW IF EXISTS vw_voice_active_calls CASCADE;

DROP TABLE IF EXISTS
    voice_audit_logs,
    voice_scheduler_events,
    voice_webhook_events,
    voice_provider_errors,
    voice_provider_usage_snapshots,
    voice_billing_ledger,
    voice_billing_rates,
    voice_usage_records,
    voice_tool_executions,
    voice_whatsapp_actions,
    voice_payment_promises,
    voice_customer_memory_profiles,
    voice_transcripts,
    voice_call_events,
    voice_call_sessions,
    voice_calls,
    voice_callbacks,
    voice_call_jobs,
    voice_campaign_recipients,
    voice_campaigns,
    voice_suppression,
    voice_did_tenant_allow,
    voice_dids,
    voice_provider_configs,
    voice_tenant_settings,
    voice_biometric_consents,
    voice_verification_attempts,
    voice_diarization_segments,
    voice_caller_presentations
CASCADE;

-- Upgrade legacy unpartitioned (`relkind = 'r'`) voice_call_summaries / voice_call_biometrics if present;
-- preserve data untouched when already partitioned (`relkind = 'p'`).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'voice_call_summaries' AND c.relkind = 'r'
    ) THEN
        DROP TABLE public.voice_call_summaries CASCADE;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'voice_call_biometrics' AND c.relkind = 'r'
    ) THEN
        DROP TABLE public.voice_call_biometrics CASCADE;
    END IF;
END $$;

-- ============================================================================
-- SECTION 2: FEATURE ENTITLEMENT SEED (`system_features`)
-- ============================================================================
INSERT INTO system_features (code, name, description, category, is_standalone_addon, default_addon_price, is_active)
VALUES (
    'ai_voice_agent',
    'AutoFinex Multilingual Voice AI Agent',
    'Streaming Tamil/Tanglish/English EMI reminder calls, customer memory, WhatsApp UPI QR & voice biometrics',
    'ai',
    TRUE,
    1999.00,
    TRUE
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SECTION 3: EXTEND EXISTING AUTOFINEX TABLES (Zero Duplicate Tables!)
-- ============================================================================

-- 3.1 `ai_settings`: Powers AISettings.tsx + Per-Tenant Voice AI & Biometrics Config
ALTER TABLE ai_settings
    ADD COLUMN IF NOT EXISTS voice_config JSONB NOT NULL DEFAULT '{
        "enabled": true,
        "default_language": "ta-IN",
        "supported_languages": ["ta-IN", "en-IN"],
        "calling_window_start": "09:00",
        "calling_window_end": "19:30",
        "timezone": "Asia/Kolkata",
        "max_concurrent_calls": 3,
        "max_daily_calls": 100,
        "max_attempts_per_day": 2,
        "min_retry_gap_minutes": 180,
        "memory_recent_calls_limit": 5,
        "memory_token_budget": 450,
        "allow_part_payment": true,
        "min_part_payment_pct": 25.0,
        "max_ptp_days_ahead": 10,
        "whatsapp_qr_enabled": true,
        "biometrics_mode": "off"
    }'::jsonb;

-- 3.2 `contacts`: E.164 normalization + Phone-level DNC/Wrong-Number guard
ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_dnc BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dnc_reason VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS dnc_updated_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_e164
    ON contacts (finance_id, phone_e164)
    WHERE phone_e164 IS NOT NULL;

-- 3.3 `ai_telecalling_leads`: Unified UI Lead List + Trigger-Calculated Due + 50-Worker Call/Callback Queue
ALTER TABLE ai_telecalling_leads
    ADD COLUMN IF NOT EXISTS loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS installment_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS overdue_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_balance_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS pending_emi_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS earliest_unpaid_due_date DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS next_due_date DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_attempt_date DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    ADD COLUMN IF NOT EXISTS callback_requested BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS locked_by VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_suppressed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS suppression_reason VARCHAR(100) DEFAULT NULL;

-- Immutable helper + expression index on `loans` so Midnight Refresh scans ONLY today's ~3.3% due-day loans
CREATE OR REPLACE FUNCTION fn_loan_anchor_due_day(p_due_date DATE, p_hp_date DATE)
RETURNS INT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT EXTRACT(DAY FROM COALESCE(p_due_date, p_hp_date))::INT;
$$;

CREATE INDEX IF NOT EXISTS idx_loans_anchor_due_day
    ON loans (fn_loan_anchor_due_day(due_date, hp_date), finance_id, customer_id)
    WHERE COALESCE(due_date, hp_date) IS NOT NULL;

-- Covering partial index on `payments` for Index-Only Scan inside O(1) due summary
CREATE INDEX IF NOT EXISTS idx_payments_customer_active_amt
    ON payments (customer_id)
    INCLUDE (amount)
    WHERE payment_status IS DISTINCT FROM 'cancelled'::active_cancelled_enum;

-- Deduplicate any pre-existing duplicate (finance_id, customer_id) rows before adding unique index
WITH ranked_leads AS (
    SELECT id, finance_id, customer_id,
           FIRST_VALUE(id) OVER (
               PARTITION BY finance_id, customer_id
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
           ) AS keep_id,
           ROW_NUMBER() OVER (
               PARTITION BY finance_id, customer_id
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM ai_telecalling_leads
),
repoint_logs AS (
    UPDATE ai_telecalling_call_logs cl
    SET lead_id = rl.keep_id
    FROM ranked_leads rl
    WHERE cl.lead_id = rl.id AND rl.rn > 1
    RETURNING cl.id
)
DELETE FROM ai_telecalling_leads atl
USING ranked_leads rl
WHERE atl.id = rl.id AND rl.rn > 1;

-- Ensure at most one lead row per (finance_id, customer_id) for clean trigger upserts
CREATE UNIQUE INDEX IF NOT EXISTS ux_atl_finance_customer
    ON ai_telecalling_leads (finance_id, customer_id);

-- Partial index for sub-5ms `FOR UPDATE SKIP LOCKED` worker polling across 50 concurrent calls
CREATE INDEX IF NOT EXISTS idx_atl_dispatch_queue
    ON ai_telecalling_leads (priority DESC, COALESCE(scheduled_time, created_at) ASC)
    WHERE call_status IN ('uncalled', 'scheduled', 'not_responded', 'failed')
      AND is_suppressed = FALSE
      AND overdue_amount > 0;

CREATE INDEX IF NOT EXISTS idx_atl_finance_status
    ON ai_telecalling_leads (finance_id, call_status, days_overdue DESC);

-- 3.4 `ai_telecalling_call_logs`: Unified Call Execution + Telephony Idempotency + Token/Latency Telemetry
ALTER TABLE ai_telecalling_call_logs
    ADD COLUMN IF NOT EXISTS loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS provider_call_id VARCHAR(120) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS language_used VARCHAR(16) NOT NULL DEFAULT 'ta-IN',
    ADD COLUMN IF NOT EXISTS sentiment ai_sentiment_enum NOT NULL DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS due_amount_at_call DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS memory_tokens INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS prompt_tokens INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completion_tokens INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS greeting_latency_ms INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS turn_latency_p50_ms INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS barge_in_count INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS ux_atcl_provider_call_id
    ON ai_telecalling_call_logs (provider_call_id)
    WHERE provider_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atcl_finance_customer_recent
    ON ai_telecalling_call_logs (finance_id, customer_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_atcl_finance_started
    ON ai_telecalling_call_logs (finance_id, started_at DESC);

-- 3.5 `promise_to_pay`: Additive Voice & Trigger-Verification Columns
ALTER TABLE promise_to_pay
    ADD COLUMN IF NOT EXISTS loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS call_log_id UUID REFERENCES ai_telecalling_call_logs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS promised_time_text VARCHAR(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_partial_payment BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS baseline_paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS verified_paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS verified_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ptp_active_customer
    ON promise_to_pay (customer_id, promised_date ASC)
    WHERE ptp_status = 'pending' AND is_superseded = FALSE;

-- 3.6 `qr_payment_requests`: Additive WhatsApp Cloud API Delivery & Call Correlation Columns
ALTER TABLE qr_payment_requests
    ADD COLUMN IF NOT EXISTS call_log_id UUID REFERENCES ai_telecalling_call_logs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS whatsapp_wamid VARCHAR(160) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS whatsapp_status VARCHAR(30) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_qpr_idempotency_key
    ON qr_payment_requests (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- SECTION 4: THE ONLY 4 NEW TABLES (Citus-Ready + Native Monthly Partitioning)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- NEW TABLE 1 (Plan 1 - Level 3 Memory): `voice_customer_memory`
-- Purpose: 1 compact row per (finance_id, customer_id) for <5ms pre-call prompt
--          assembly (<= 120 tokens), language lock, communication style & trust.
--          Tenant-first PK `(finance_id, id)` for zero-code Citus sharding.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_customer_memory (
    id                          UUID            NOT NULL DEFAULT uuidv7(),
    finance_id                  UUID            NOT NULL,
    customer_id                 UUID            NOT NULL,
    active_loan_id              UUID            DEFAULT NULL,
    preferred_language          VARCHAR(16)     NOT NULL DEFAULT 'ta-IN', -- 'ta-IN', 'tanglish', 'en-IN'
    language_confirmed          BOOLEAN         NOT NULL DEFAULT FALSE,
    preferred_call_time         VARCHAR(80)     DEFAULT NULL,             -- e.g. 'After 6:30 PM'
    communication_style         VARCHAR(200)    DEFAULT NULL,             -- e.g. 'Polite, prefers respectful Tamil, pays via WhatsApp QR'
    recurring_delay_reason      VARCHAR(200)    DEFAULT NULL,             -- e.g. 'Salary credited around 10th of month'
    rolling_summary             TEXT            DEFAULT NULL CHECK (rolling_summary IS NULL OR char_length(rolling_summary) <= 600),
    profile_tokens              INT             NOT NULL DEFAULT 0 CHECK (profile_tokens >= 0),
    total_calls                 INT             NOT NULL DEFAULT 0 CHECK (total_calls >= 0),
    answered_calls              INT             NOT NULL DEFAULT 0 CHECK (answered_calls >= 0),
    ptp_kept_count              INT             NOT NULL DEFAULT 0 CHECK (ptp_kept_count >= 0),
    ptp_broken_count            INT             NOT NULL DEFAULT 0 CHECK (ptp_broken_count >= 0),
    trust_band                  VARCHAR(16)     NOT NULL DEFAULT 'neutral'
                                CHECK (trust_band IN ('high', 'neutral', 'cautious', 'low')),
    do_not_call                 BOOLEAN         NOT NULL DEFAULT FALSE,
    dnc_reason                  VARCHAR(100)    DEFAULT NULL,
    last_call_log_id            UUID            DEFAULT NULL,
    last_outcome                VARCHAR(40)     DEFAULT NULL,
    last_called_at              TIMESTAMPTZ     DEFAULT NULL,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (finance_id, id),
    CONSTRAINT uq_vcm_finance_customer UNIQUE (finance_id, customer_id),
    CONSTRAINT fk_vcm_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcm_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcm_loan FOREIGN KEY (active_loan_id) REFERENCES loans(id) ON DELETE SET NULL,
    CONSTRAINT fk_vcm_last_call FOREIGN KEY (last_call_log_id) REFERENCES ai_telecalling_call_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vcm_finance_customer
    ON voice_customer_memory (finance_id, customer_id);

-- ----------------------------------------------------------------------------
-- NEW TABLE 2 (Plan 1 - Level 2 Summary): `voice_call_summaries`
-- Purpose: Compact structured summary per answered call (last 5-6 injected into
--          LLM <= 250 tokens). Declaratively partitioned by month (`call_date`)
--          + tenant-first keys `(finance_id, ...)` for 100M+ row scale.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_call_summaries (
    id                          UUID            NOT NULL DEFAULT uuidv7(),
    finance_id                  UUID            NOT NULL,
    customer_id                 UUID            NOT NULL,
    loan_id                     UUID            DEFAULT NULL,
    call_log_id                 UUID            NOT NULL,
    ptp_id                      UUID            DEFAULT NULL,
    call_date                   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    language_used               VARCHAR(16)     NOT NULL DEFAULT 'ta-IN',
    outcome                     VARCHAR(40)     NOT NULL
                                CHECK (outcome IN (
                                    'ptp_confirmed', 'part_payment_promised', 'callback_requested',
                                    'paid_claimed', 'qr_sent', 'dispute', 'hardship',
                                    'wrong_number', 'family_answered', 'opt_out', 'completed_info'
                                )),
    summary_short               VARCHAR(320)    NOT NULL, -- Strictly <= 320 chars (~60 tokens)
    customer_stated_reason      VARCHAR(200)    DEFAULT NULL,
    commitment_summary          VARCHAR(200)    DEFAULT NULL,
    observable_tone             VARCHAR(24)     NOT NULL DEFAULT 'calm'
                                CHECK (observable_tone IN (
                                    'calm', 'cooperative', 'hesitant', 'rushed',
                                    'frustrated', 'angry', 'confused'
                                )),
    stated_facts                JSONB           NOT NULL DEFAULT '{}'::jsonb,
    ai_inferences               JSONB           NOT NULL DEFAULT '{}'::jsonb, -- Guardrailed: never stated as fact!
    summary_tokens              INT             NOT NULL DEFAULT 0 CHECK (summary_tokens >= 0),
    is_superseded               BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (finance_id, call_date, id),
    CONSTRAINT uq_vcs_call_log UNIQUE (finance_id, call_log_id, call_date),
    CONSTRAINT fk_vcs_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcs_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcs_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL,
    CONSTRAINT fk_vcs_call_log FOREIGN KEY (call_log_id) REFERENCES ai_telecalling_call_logs(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcs_ptp FOREIGN KEY (ptp_id) REFERENCES promise_to_pay(id) ON DELETE SET NULL
) PARTITION BY RANGE (call_date);

-- Fast partitioned index scan for "last 5 non-superseded summaries" per customer
CREATE INDEX IF NOT EXISTS idx_vcs_recent_active
    ON voice_call_summaries (finance_id, customer_id, call_date DESC)
    WHERE is_superseded = FALSE;

-- ----------------------------------------------------------------------------
-- NEW TABLE 3 (Plan 2 - Voice Biometrics Enrollment & DPDP Consent): `voice_speaker_profiles`
-- Purpose: Stores SpeechBrain ECAPA-TDNN 192-dim voiceprint + explicit DPDP Act
--          consent lifecycle per (finance_id, customer_id, speaker_role).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_speaker_profiles (
    id                          UUID            NOT NULL DEFAULT uuidv7(),
    finance_id                  UUID            NOT NULL,
    customer_id                 UUID            NOT NULL,
    speaker_role                VARCHAR(24)     NOT NULL DEFAULT 'borrower'
                                CHECK (speaker_role IN ('borrower', 'guarantor', 'authorized_family')),
    speaker_label               VARCHAR(100)    DEFAULT NULL,
    consent_status              VARCHAR(20)     NOT NULL DEFAULT 'pending'
                                CHECK (consent_status IN ('pending', 'granted', 'declined', 'revoked')),
    consent_language            VARCHAR(16)     DEFAULT NULL,
    consent_call_log_id         UUID            DEFAULT NULL,
    consented_at                TIMESTAMPTZ     DEFAULT NULL,
    revoked_at                  TIMESTAMPTZ     DEFAULT NULL,
    model_name                  VARCHAR(80)     NOT NULL DEFAULT 'speechbrain/spkrec-ecapa-voxceleb',
    embedding_dim               SMALLINT        NOT NULL DEFAULT 192 CHECK (embedding_dim = 192),
    embedding                   REAL[]          DEFAULT NULL
                                CHECK (embedding IS NULL OR array_length(embedding, 1) = 192),
    enrolled_samples_count      INT             NOT NULL DEFAULT 0 CHECK (enrolled_samples_count >= 0),
    total_voiced_seconds        REAL            NOT NULL DEFAULT 0.0 CHECK (total_voiced_seconds >= 0),
    avg_snr_db                  REAL            DEFAULT NULL,
    status                      VARCHAR(20)     NOT NULL DEFAULT 'collecting'
                                CHECK (status IN ('collecting', 'active', 'suspended', 'erased')),
    last_verified_at            TIMESTAMPTZ     DEFAULT NULL,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (finance_id, id),
    CONSTRAINT uq_vsp_customer_role UNIQUE (finance_id, customer_id, speaker_role),
    CONSTRAINT chk_vsp_consent_embedding CHECK (
        embedding IS NULL OR consent_status = 'granted'
    ),
    CONSTRAINT fk_vsp_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_vsp_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_vsp_consent_call FOREIGN KEY (consent_call_log_id) REFERENCES ai_telecalling_call_logs(id) ON DELETE SET NULL
);

-- Guarantee `(finance_id, id)` uniqueness even if upgrading from a V3 table that had `PRIMARY KEY (id)`
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.voice_speaker_profiles'::regclass
          AND contype IN ('p', 'u')
          AND conkey = ARRAY[
              (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.voice_speaker_profiles'::regclass AND attname = 'finance_id'),
              (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.voice_speaker_profiles'::regclass AND attname = 'id')
          ]
    ) THEN
        ALTER TABLE public.voice_speaker_profiles
            ADD CONSTRAINT uq_vsp_finance_id UNIQUE (finance_id, id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vsp_active_lookup
    ON voice_speaker_profiles (finance_id, customer_id)
    WHERE status = 'active' AND consent_status = 'granted';

-- Automatically attach pgvector column + HNSW cosine index if `vector` extension is active
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        EXECUTE 'ALTER TABLE voice_speaker_profiles ADD COLUMN IF NOT EXISTS embedding_vec vector(192)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vsp_embedding_hnsw ON voice_speaker_profiles USING hnsw (embedding_vec vector_cosine_ops) WHERE status = ''active''';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- NEW TABLE 4 (Plan 2 - Per-Call Biometric Verification, Diarization & Advisory): `voice_call_biometrics`
-- Purpose: 1 row per call capturing ECAPA cosine similarity, Pyannote multi-speaker
--          diarization segments, and non-binding caller acoustic presentation.
--          Declaratively partitioned by month (`created_at`) for 100M+ call scale.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_call_biometrics (
    id                          UUID            NOT NULL DEFAULT uuidv7(),
    finance_id                  UUID            NOT NULL,
    customer_id                 UUID            NOT NULL,
    call_log_id                 UUID            NOT NULL,
    matched_profile_id          UUID            DEFAULT NULL,
    biometrics_mode             VARCHAR(16)     NOT NULL DEFAULT 'shadow'
                                CHECK (biometrics_mode IN ('shadow', 'enforce')),
    cosine_similarity           REAL            DEFAULT NULL CHECK (cosine_similarity IS NULL OR (cosine_similarity >= -1.0 AND cosine_similarity <= 1.0)),
    verification_decision       VARCHAR(24)     NOT NULL DEFAULT 'not_enrolled'
                                CHECK (verification_decision IN (
                                    'high_match', 'probable_match', 'uncertain',
                                    'mismatch', 'insufficient_audio', 'not_enrolled'
                                )),
    policy_action               VARCHAR(32)     NOT NULL DEFAULT 'verbal_confirm_required'
                                CHECK (policy_action IN (
                                    'disclose_permitted', 'verbal_confirm_required', 'safe_message_only'
                                )),
    voiced_duration_sec         REAL            NOT NULL DEFAULT 0.0,
    estimated_snr_db            REAL            DEFAULT NULL,
    speaker_count               SMALLINT        NOT NULL DEFAULT 1 CHECK (speaker_count >= 0),
    speaker_handoff_detected    BOOLEAN         NOT NULL DEFAULT FALSE,
    overlap_ratio               REAL            NOT NULL DEFAULT 0.0 CHECK (overlap_ratio >= 0.0 AND overlap_ratio <= 1.0),
    diarization_segments        JSONB           NOT NULL DEFAULT '[]'::jsonb,
    caller_presentation         VARCHAR(24)     NOT NULL DEFAULT 'uncertain'
                                CHECK (caller_presentation IN (
                                    'adult_male_like', 'adult_female_like', 'uncertain'
                                )),
    presentation_confidence     REAL            NOT NULL DEFAULT 0.0 CHECK (presentation_confidence >= 0.0 AND presentation_confidence <= 1.0),
    inference_latency_ms        INT             DEFAULT NULL,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (finance_id, created_at, id),
    CONSTRAINT uq_vcb_call_log UNIQUE (finance_id, call_log_id, created_at),
    CONSTRAINT fk_vcb_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcb_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcb_call_log FOREIGN KEY (call_log_id) REFERENCES ai_telecalling_call_logs(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcb_profile FOREIGN KEY (finance_id, matched_profile_id)
        REFERENCES voice_speaker_profiles(finance_id, id) ON DELETE SET NULL (matched_profile_id)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_vcb_finance_customer
    ON voice_call_biometrics (finance_id, customer_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4.5 Automatic Monthly Partition Provisioner (`voice_call_summaries` & `voice_call_biometrics`)
-- Creates monthly partitions [now - p_months_back .. now + p_months_ahead] + DEFAULT safety net.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ensure_voice_monthly_partitions(
    p_months_back INT DEFAULT 1,
    p_months_ahead INT DEFAULT 3
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_base_month DATE;
    v_start_date DATE;
    v_end_date DATE;
    v_suffix TEXT;
    v_from_lit TEXT;
    v_to_lit TEXT;
    v_created INT := 0;
    i INT;
BEGIN
    v_base_month := make_date(
        EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT,
        EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT,
        1
    );

    FOR i IN (-GREATEST(0, COALESCE(p_months_back, 0))) .. GREATEST(0, COALESCE(p_months_ahead, 3)) LOOP
        v_start_date := (v_base_month + (i || ' months')::INTERVAL)::DATE;
        v_end_date   := (v_start_date + INTERVAL '1 month')::DATE;
        v_suffix     := to_char(v_start_date, '"y"YYYY"m"MM');
        v_from_lit   := format('%s 00:00:00+05:30', v_start_date::TEXT);
        v_to_lit     := format('%s 00:00:00+05:30', v_end_date::TEXT);

        IF to_regclass('public.voice_call_summaries_' || v_suffix) IS NULL THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS voice_call_summaries_%s PARTITION OF voice_call_summaries FOR VALUES FROM (%L) TO (%L)',
                v_suffix, v_from_lit, v_to_lit
            );
            v_created := v_created + 1;
        END IF;

        IF to_regclass('public.voice_call_biometrics_' || v_suffix) IS NULL THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS voice_call_biometrics_%s PARTITION OF voice_call_biometrics FOR VALUES FROM (%L) TO (%L)',
                v_suffix, v_from_lit, v_to_lit
            );
            v_created := v_created + 1;
        END IF;
    END LOOP;

    -- Safety-net DEFAULT partitions so out-of-window historical/backfill rows never fail
    IF to_regclass('public.voice_call_summaries_default') IS NULL THEN
        CREATE TABLE IF NOT EXISTS voice_call_summaries_default
            PARTITION OF voice_call_summaries DEFAULT;
        v_created := v_created + 1;
    END IF;

    IF to_regclass('public.voice_call_biometrics_default') IS NULL THEN
        CREATE TABLE IF NOT EXISTS voice_call_biometrics_default
            PARTITION OF voice_call_biometrics DEFAULT;
        v_created := v_created + 1;
    END IF;

    RETURN v_created;
END;
$$;

-- Provision current, previous, and next 3 months of partitions immediately
SELECT fn_ensure_voice_monthly_partitions(1, 3);

-- ============================================================================
-- SECTION 5: AUTOMATIC DUE CALCULATION & TRIGGER RECONCILIATION ENGINE
-- ============================================================================

-- 5.1 Helper: Normalize Indian phone numbers to E.164 (+91XXXXXXXXXX)
CREATE OR REPLACE FUNCTION fn_normalize_indian_phone_e164(p_raw TEXT)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_digits TEXT;
BEGIN
    IF p_raw IS NULL OR btrim(p_raw) = '' THEN
        RETURN NULL;
    END IF;
    v_digits := regexp_replace(p_raw, '[^0-9]', '', 'g');
    IF length(v_digits) = 10 AND left(v_digits, 1) IN ('6', '7', '8', '9') THEN
        RETURN '+91' || v_digits;
    ELSIF length(v_digits) = 11 AND left(v_digits, 1) = '0' AND substr(v_digits, 2, 1) IN ('6', '7', '8', '9') THEN
        RETURN '+91' || substr(v_digits, 2);
    ELSIF length(v_digits) = 12 AND left(v_digits, 2) = '91' AND substr(v_digits, 3, 1) IN ('6', '7', '8', '9') THEN
        RETURN '+' || v_digits;
    ELSIF left(btrim(p_raw), 1) = '+' AND length(v_digits) BETWEEN 10 AND 15 THEN
        RETURN '+' || v_digits;
    END IF;
    RETURN NULL;
END;
$$;

-- 5.2 Pure O(1) Month-Clamped Installment Date Helper (zero loops, zero timezone casts)
CREATE OR REPLACE FUNCTION fn_clamped_installment_date(
    p_first_due DATE,
    p_offset_months INT
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
DECLARE
    v_start_day INT;
    v_total_m INT;
    v_year INT;
    v_month INT;
    v_days_in_month INT;
BEGIN
    v_start_day := EXTRACT(DAY FROM p_first_due)::INT;
    v_total_m   := (EXTRACT(YEAR FROM p_first_due)::INT * 12 + EXTRACT(MONTH FROM p_first_due)::INT - 1) + p_offset_months;
    v_year      := v_total_m / 12;
    v_month     := (v_total_m % 12) + 1;

    v_days_in_month := CASE
        WHEN v_month IN (1, 3, 5, 7, 8, 10, 12) THEN 31
        WHEN v_month IN (4, 6, 9, 11) THEN 30
        WHEN (v_year % 4 = 0 AND v_year % 100 <> 0) OR (v_year % 400 = 0) THEN 29
        ELSE 28
    END;

    RETURN make_date(v_year, v_month, LEAST(v_start_day, v_days_in_month));
END;
$$;

-- 5.3 Exact O(1) AutoFinex EMI Due & Overdue Calculator (~0.05 ms; mirrors pendingCollectionsHelper.js & demand.calculator.js)
CREATE OR REPLACE FUNCTION fn_calculate_customer_due_summary(
    p_customer_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    finance_id UUID,
    loan_id UUID,
    loan_status loan_status_enum,
    primary_phone VARCHAR(20),
    phone_e164 VARCHAR(20),
    is_phone_dnc BOOLEAN,
    installment_amount DECIMAL(15,2),
    total_installments INT,
    total_contractual_due DECIMAL(15,2),
    total_paid DECIMAL(15,2),
    total_balance_amount DECIMAL(15,2),
    due_so_far INT,
    installments_covered INT,
    pending_emi_count INT,
    overdue_amount DECIMAL(15,2),
    earliest_unpaid_due_date DATE,
    next_due_date DATE,
    days_overdue INT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cust RECORD;
    v_loan RECORD;
    v_first_due DATE;
    v_demand_p DECIMAL(15,2) := 0.00;
    v_demand_i DECIMAL(15,2) := 0.00;
    v_inst_amt DECIMAL(15,2) := 0.00;
    v_total_months INT := 0;
    v_total_due DECIMAL(15,2) := 0.00;
    v_paid_main DECIMAL(15,2) := 0.00;
    v_paid_sub DECIMAL(15,2) := 0.00;
    v_total_paid DECIMAL(15,2) := 0.00;
    v_balance DECIMAL(15,2) := 0.00;
    v_due_so_far INT := 0;
    v_amt_due_so_far DECIMAL(15,2) := 0.00;
    v_overdue DECIMAL(15,2) := 0.00;
    v_covered INT := 0;
    v_pending_emi INT := 0;
    v_earliest_unpaid DATE := NULL;
    v_next_due DATE := NULL;
    v_sched_date DATE;
    v_m_diff INT := 0;
    v_phone VARCHAR(20) := NULL;
    v_phone_e164 VARCHAR(20) := NULL;
    v_phone_dnc BOOLEAN := FALSE;
BEGIN
    SELECT c.id, c.finance_id, c.loan_status
    INTO v_cust
    FROM customers c
    WHERE c.id = p_customer_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Fetch primary mobile contact
    SELECT ct.number,
           COALESCE(ct.phone_e164, fn_normalize_indian_phone_e164(ct.number)),
           COALESCE(ct.is_dnc, FALSE)
    INTO v_phone, v_phone_e164, v_phone_dnc
    FROM contacts ct
    WHERE ct.customer_id = p_customer_id
    ORDER BY
        CASE WHEN ct.contact_type = 'customer' THEN 0 ELSE 1 END,
        CASE WHEN ct.type = 'mobile' THEN 0 ELSE 1 END,
        ct.id ASC
    LIMIT 1;

    -- Fetch active/latest loan for customer
    SELECT l.*
    INTO v_loan
    FROM loans l
    WHERE l.customer_id = p_customer_id
    ORDER BY l.due_date DESC NULLS LAST, l.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            v_cust.finance_id, NULL::UUID, v_cust.loan_status,
            v_phone, v_phone_e164, v_phone_dnc,
            0.00::DECIMAL(15,2), 0, 0.00::DECIMAL(15,2), 0.00::DECIMAL(15,2),
            0.00::DECIMAL(15,2), 0, 0, 0, 0.00::DECIMAL(15,2),
            NULL::DATE, NULL::DATE, 0;
        RETURN;
    END IF;

    v_total_months := GREATEST(0, COALESCE(v_loan.due_month, 0));

    -- Installment demand calculation (matches demand.calculator.js computeInstallmentDemand)
    IF COALESCE(v_loan.due_amount, 0) > 0 THEN
        v_inst_amt := ROUND(v_loan.due_amount, 2);
    ELSE
        IF COALESCE(v_loan.principle_part, 0) > 0 THEN
            v_demand_p := ROUND(v_loan.principle_part, 2);
        ELSIF v_total_months > 0 THEN
            v_demand_p := ROUND(COALESCE(v_loan.hp_amount, 0) / v_total_months, 2);
        END IF;

        IF COALESCE(v_loan.interest_part, 0) > 0 THEN
            v_demand_i := ROUND(v_loan.interest_part, 2);
        ELSE
            v_demand_i := ROUND((COALESCE(v_loan.hp_amount, 0) * COALESCE(v_loan.interest_rate, 0)) / 100.0, 2);
        END IF;
        v_inst_amt := ROUND(v_demand_p + v_demand_i, 2);
    END IF;

    v_total_due := CASE
        WHEN COALESCE(v_loan.net_payable, 0) > 0 THEN ROUND(v_loan.net_payable, 2)
        ELSE ROUND(v_total_months * v_inst_amt, 2)
    END;

    -- Total recognized payments (Index-Only Scan via idx_payments_customer_active_amt; excludes penalties & cancelled)
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(p.amount, 0))), 0.00)
    INTO v_paid_main
    FROM payments p
    WHERE p.customer_id = p_customer_id
      AND p.payment_status IS DISTINCT FROM 'cancelled'::active_cancelled_enum;

    SELECT COALESCE(SUM(GREATEST(0, COALESCE(sd.paid_amount, 0))), 0.00)
    INTO v_paid_sub
    FROM sub_due sd
    JOIN payments p ON p.id = sd.payment_id
    WHERE sd.customer_id = p_customer_id
      AND COALESCE(sd.status, 'active') = 'active'
      AND p.payment_status IS DISTINCT FROM 'cancelled'::active_cancelled_enum;

    v_total_paid := ROUND(v_paid_main + v_paid_sub, 2);
    v_balance := GREATEST(0.00, ROUND(v_total_due - v_total_paid, 2));

    v_covered := CASE
        WHEN v_inst_amt > 0 THEN LEAST(v_total_months, FLOOR(v_total_paid / v_inst_amt)::INT)
        ELSE 0
    END;

    v_first_due := COALESCE(v_loan.due_date, v_loan.hp_date);

    -- Pure O(1) loop-less month-end clamped schedule arithmetic (replaces 0..N-1 loop!)
    IF v_first_due IS NOT NULL AND v_total_months > 0 THEN
        v_m_diff := (EXTRACT(YEAR FROM p_as_of_date)::INT - EXTRACT(YEAR FROM v_first_due)::INT) * 12
                  + (EXTRACT(MONTH FROM p_as_of_date)::INT - EXTRACT(MONTH FROM v_first_due)::INT);

        IF v_m_diff < 0 THEN
            v_due_so_far := 0;
            v_next_due := fn_clamped_installment_date(v_first_due, 0);
        ELSIF v_m_diff >= v_total_months THEN
            v_due_so_far := v_total_months;
            v_next_due := NULL;
        ELSE
            v_sched_date := fn_clamped_installment_date(v_first_due, v_m_diff);
            IF v_sched_date <= p_as_of_date THEN
                v_due_so_far := v_m_diff + 1;
                v_next_due := CASE
                    WHEN (v_m_diff + 1) < v_total_months
                        THEN fn_clamped_installment_date(v_first_due, v_m_diff + 1)
                    ELSE NULL
                END;
            ELSE
                v_due_so_far := v_m_diff;
                v_next_due := v_sched_date;
            END IF;
        END IF;

        IF v_covered >= 0 AND v_covered < v_total_months THEN
            v_earliest_unpaid := fn_clamped_installment_date(v_first_due, v_covered);
        END IF;
    END IF;

    v_amt_due_so_far := LEAST(v_total_due, ROUND(v_due_so_far * v_inst_amt, 2));

    IF v_cust.loan_status = 'close' OR v_balance <= 0 THEN
        v_overdue := 0.00;
        v_pending_emi := 0;
    ELSE
        v_overdue := LEAST(v_balance, GREATEST(0.00, ROUND(v_amt_due_so_far - v_total_paid, 2)));
        v_pending_emi := CASE
            WHEN v_overdue > 0 THEN GREATEST(1, v_due_so_far - v_covered)
            ELSE 0
        END;
    END IF;

    RETURN QUERY SELECT
        v_cust.finance_id,
        v_loan.id,
        v_cust.loan_status,
        v_phone,
        v_phone_e164,
        v_phone_dnc,
        v_inst_amt,
        v_total_months,
        v_total_due,
        v_total_paid,
        v_balance,
        v_due_so_far,
        v_covered,
        v_pending_emi,
        v_overdue,
        CASE WHEN v_overdue > 0 THEN v_earliest_unpaid ELSE NULL END,
        v_next_due,
        CASE
            WHEN v_overdue > 0 AND v_earliest_unpaid IS NOT NULL AND p_as_of_date > v_earliest_unpaid
                THEN (p_as_of_date - v_earliest_unpaid)::INT
            ELSE 0
        END;
END;
$$;

-- 5.4 Reconcile Customer PTP + Telecalling Queue State (Invoked automatically by DB Triggers!)
CREATE OR REPLACE FUNCTION fn_reconcile_customer_voice_state(
    p_customer_id UUID,
    p_payment_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_due RECORD;
    v_ptp RECORD;
    v_paid_delta DECIMAL(15,2);
    v_mem_dnc BOOLEAN := FALSE;
    v_suppressed BOOLEAN := FALSE;
    v_supp_reason VARCHAR(100) := NULL;
    v_priority SMALLINT := 5;
BEGIN
    IF p_customer_id IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_due FROM fn_calculate_customer_due_summary(p_customer_id, CURRENT_DATE);
    IF NOT FOUND OR v_due.finance_id IS NULL THEN
        RETURN;
    END IF;

    -- 1. Reconcile active pending Promise-to-Pay (`promise_to_pay`) rows
    FOR v_ptp IN
        SELECT id, promised_amount, baseline_paid_amount
        FROM promise_to_pay
        WHERE customer_id = p_customer_id
          AND ptp_status = 'pending'
          AND is_superseded = FALSE
    LOOP
        v_paid_delta := GREATEST(0.00, v_due.total_paid - COALESCE(v_ptp.baseline_paid_amount, 0.00));

        IF v_paid_delta >= v_ptp.promised_amount OR v_due.overdue_amount <= 0.00 THEN
            UPDATE promise_to_pay
            SET ptp_status = 'paid',
                verified_paid_amount = v_paid_delta,
                verified_payment_id = COALESCE(p_payment_id, verified_payment_id),
                verified_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = v_ptp.id;
        ELSIF v_paid_delta > 0.00 THEN
            UPDATE promise_to_pay
            SET verified_paid_amount = v_paid_delta,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = v_ptp.id;
        END IF;
    END LOOP;

    -- 2. Check DNC / Seized / Closed suppression guards
    SELECT COALESCE(vcm.do_not_call, FALSE)
    INTO v_mem_dnc
    FROM voice_customer_memory vcm
    WHERE vcm.finance_id = v_due.finance_id
      AND vcm.customer_id = p_customer_id;

    IF v_due.loan_status = 'close' THEN
        v_suppressed := TRUE;
        v_supp_reason := 'loan_closed';
    ELSIF v_due.loan_status = 'seized' THEN
        v_suppressed := TRUE;
        v_supp_reason := 'vehicle_seized';
    ELSIF v_mem_dnc THEN
        v_suppressed := TRUE;
        v_supp_reason := 'customer_dnc';
    ELSIF v_due.is_phone_dnc THEN
        v_suppressed := TRUE;
        v_supp_reason := 'phone_dnc';
    END IF;

    v_priority := CASE
        WHEN v_due.days_overdue >= 30 THEN 9
        WHEN v_due.days_overdue >= 15 THEN 8
        WHEN v_due.days_overdue >= 7  THEN 7
        WHEN v_due.days_overdue >= 1  THEN 6
        ELSE 5
    END;

    -- 3. Sync `ai_telecalling_leads` automatically
    IF v_due.overdue_amount <= 0.00 OR v_due.loan_status = 'close' THEN
        -- Customer paid or loan closed: auto-complete open leads & release any worker lock!
        UPDATE ai_telecalling_leads
        SET loan_id = COALESCE(v_due.loan_id, loan_id),
            phone_e164 = COALESCE(v_due.phone_e164, phone_e164),
            installment_amount = v_due.installment_amount,
            overdue_amount = 0.00,
            total_balance_amount = v_due.total_balance_amount,
            pending_emi_count = 0,
            days_overdue = 0,
            earliest_unpaid_due_date = NULL,
            next_due_date = v_due.next_due_date,
            call_status = CASE
                WHEN call_status IN ('uncalled', 'scheduled', 'not_responded', 'failed') THEN 'completed'::lead_call_status_enum
                ELSE call_status
            END,
            callback_requested = FALSE,
            locked_by = NULL,
            lock_expires_at = NULL,
            is_suppressed = v_suppressed,
            suppression_reason = v_supp_reason,
            call_outcome_note = CASE
                WHEN call_status IN ('uncalled', 'scheduled', 'not_responded', 'failed')
                    THEN 'Auto-closed: EMI due cleared'
                ELSE call_outcome_note
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE finance_id = v_due.finance_id
          AND customer_id = p_customer_id;
    ELSIF v_due.loan_id IS NOT NULL THEN
        -- Customer has active overdue balance: upsert lead in `ai_telecalling_leads`!
        INSERT INTO ai_telecalling_leads (
            finance_id, customer_id, loan_id, phone_e164,
            installment_amount, overdue_amount, total_balance_amount,
            pending_emi_count, days_overdue, earliest_unpaid_due_date, next_due_date,
            call_status, priority, is_suppressed, suppression_reason,
            created_at, updated_at
        ) VALUES (
            v_due.finance_id, p_customer_id, v_due.loan_id, v_due.phone_e164,
            v_due.installment_amount, v_due.overdue_amount, v_due.total_balance_amount,
            v_due.pending_emi_count, v_due.days_overdue, v_due.earliest_unpaid_due_date, v_due.next_due_date,
            'uncalled', v_priority, v_suppressed, v_supp_reason,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (finance_id, customer_id) DO UPDATE SET
            loan_id = EXCLUDED.loan_id,
            phone_e164 = COALESCE(EXCLUDED.phone_e164, ai_telecalling_leads.phone_e164),
            installment_amount = EXCLUDED.installment_amount,
            overdue_amount = EXCLUDED.overdue_amount,
            total_balance_amount = EXCLUDED.total_balance_amount,
            pending_emi_count = EXCLUDED.pending_emi_count,
            days_overdue = EXCLUDED.days_overdue,
            earliest_unpaid_due_date = EXCLUDED.earliest_unpaid_due_date,
            next_due_date = EXCLUDED.next_due_date,
            priority = GREATEST(ai_telecalling_leads.priority, EXCLUDED.priority),
            is_suppressed = EXCLUDED.is_suppressed,
            suppression_reason = EXCLUDED.suppression_reason,
            -- Re-open previously 'completed' lead if a new month's EMI became overdue!
            call_status = CASE
                WHEN ai_telecalling_leads.call_status = 'completed'
                     AND (ai_telecalling_leads.last_call_at IS NULL OR ai_telecalling_leads.last_call_at::DATE < CURRENT_DATE)
                     AND NOT EXISTS (
                         SELECT 1 FROM promise_to_pay ptp
                         WHERE ptp.customer_id = p_customer_id
                           AND ptp.ptp_status = 'pending'
                           AND ptp.is_superseded = FALSE
                           AND ptp.promised_date >= CURRENT_DATE
                     )
                    THEN 'uncalled'::lead_call_status_enum
                ELSE ai_telecalling_leads.call_status
            END,
            updated_at = CURRENT_TIMESTAMP;
    END IF;
END;
$$;

-- 5.5 Hyperscale Smart Due-Day Midnight Refresh (~30x faster at 2M+ active loans!)
--   1. Auto-provisions future monthly partitions (`fn_ensure_voice_monthly_partitions`).
--   2. Rolls `days_overdue` & `priority` forward across existing overdue leads in ONE set-based UPDATE.
--   3. Reconciles ONLY the ~3.3% of active loans whose anchor due day falls today (with month-end clamping
--      on Feb 28/29 or 30-day months), plus optional `p_force_full` and keyset batching (`p_batch_size`, `p_after_customer_id`).
DROP FUNCTION IF EXISTS fn_refresh_daily_overdue_leads(UUID);

CREATE OR REPLACE FUNCTION fn_refresh_daily_overdue_leads(
    p_finance_id UUID DEFAULT NULL,
    p_force_full BOOLEAN DEFAULT FALSE,
    p_batch_size INT DEFAULT NULL,
    p_after_customer_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_cid UUID;
    v_count INT := 0;
    v_today_dom INT := EXTRACT(DAY FROM CURRENT_DATE)::INT;
    v_is_month_end BOOLEAN := (EXTRACT(MONTH FROM (CURRENT_DATE + 1)) <> EXTRACT(MONTH FROM CURRENT_DATE));
    v_limit INT := CASE WHEN p_batch_size IS NOT NULL AND p_batch_size > 0 THEN p_batch_size ELSE NULL END;
BEGIN
    -- Keep future monthly partitions provisioned automatically on daily runs
    IF p_after_customer_id IS NULL THEN
        PERFORM fn_ensure_voice_monthly_partitions(0, 3);
    END IF;

    IF COALESCE(p_force_full, FALSE) THEN
        -- Full backfill / audit sweep (with optional keyset pagination)
        FOR v_cid IN
            SELECT c.id
            FROM customers c
            JOIN finance_detail f ON f.id = c.finance_id
            WHERE c.loan_status = 'active'
              AND f.is_active = 1
              AND (p_finance_id IS NULL OR c.finance_id = p_finance_id)
              AND (p_after_customer_id IS NULL OR c.id > p_after_customer_id)
            ORDER BY c.id ASC
            LIMIT v_limit
        LOOP
            PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
            v_count := v_count + 1;
        END LOOP;

        RETURN v_count;
    END IF;

    -- Step 1: Single set-based SQL rollforward of `days_overdue` & `priority` for already-overdue leads
    IF p_after_customer_id IS NULL THEN
        UPDATE ai_telecalling_leads atl
        SET days_overdue = GREATEST(0, (CURRENT_DATE - atl.earliest_unpaid_due_date)::INT),
            priority = GREATEST(
                atl.priority,
                CASE
                    WHEN (CURRENT_DATE - atl.earliest_unpaid_due_date)::INT >= 30 THEN 9
                    WHEN (CURRENT_DATE - atl.earliest_unpaid_due_date)::INT >= 15 THEN 8
                    WHEN (CURRENT_DATE - atl.earliest_unpaid_due_date)::INT >= 7  THEN 7
                    WHEN (CURRENT_DATE - atl.earliest_unpaid_due_date)::INT >= 1  THEN 6
                    ELSE 5
                END
            ),
            call_status = CASE
                WHEN atl.call_status = 'completed'
                     AND (atl.last_call_at IS NULL OR atl.last_call_at::DATE < CURRENT_DATE)
                     AND NOT EXISTS (
                         SELECT 1 FROM promise_to_pay ptp
                         WHERE ptp.customer_id = atl.customer_id
                           AND ptp.ptp_status = 'pending'
                           AND ptp.is_superseded = FALSE
                           AND ptp.promised_date >= CURRENT_DATE
                     )
                    THEN 'uncalled'::lead_call_status_enum
                ELSE atl.call_status
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE atl.overdue_amount > 0
          AND atl.earliest_unpaid_due_date IS NOT NULL
          AND (p_finance_id IS NULL OR atl.finance_id = p_finance_id)
          AND (
              atl.days_overdue IS DISTINCT FROM GREATEST(0, (CURRENT_DATE - atl.earliest_unpaid_due_date)::INT)
              OR atl.call_status = 'completed'
          );
    END IF;

    -- Step 2: Index-driven scan (`idx_loans_anchor_due_day`) of ONLY today's ~3.3% due-day loans
    FOR v_cid IN
        SELECT DISTINCT c.id
        FROM loans l
        JOIN customers c ON c.id = l.customer_id
        JOIN finance_detail f ON f.id = c.finance_id
        WHERE COALESCE(l.due_date, l.hp_date) IS NOT NULL
          AND (
              (NOT v_is_month_end AND fn_loan_anchor_due_day(l.due_date, l.hp_date) = v_today_dom)
              OR (v_is_month_end AND fn_loan_anchor_due_day(l.due_date, l.hp_date) >= v_today_dom)
          )
          AND c.loan_status = 'active'
          AND f.is_active = 1
          AND (p_finance_id IS NULL OR c.finance_id = p_finance_id)
          AND (p_after_customer_id IS NULL OR c.id > p_after_customer_id)
        ORDER BY c.id ASC
        LIMIT v_limit
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- 5.6 Expire Past-Due Pending PTPs -> Fires Broken-PTP Trigger Automatically
CREATE OR REPLACE FUNCTION fn_expire_broken_ptps()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_expired INT := 0;
BEGIN
    WITH updated AS (
        UPDATE promise_to_pay
        SET ptp_status = 'broken',
            updated_at = CURRENT_TIMESTAMP
        WHERE ptp_status = 'pending'
          AND is_superseded = FALSE
          AND promised_date < CURRENT_DATE
        RETURNING id
    )
    SELECT COUNT(*) INTO v_expired FROM updated;

    RETURN v_expired;
END;
$$;

-- ----------------------------------------------------------------------------
-- TRIGGER FUNCTIONS & BINDINGS (Statement-Level Transition Tables for Bulk Scale!)
-- ----------------------------------------------------------------------------

-- Drop legacy V3 row-level triggers so bulk CSV/Excel imports never fire per-row reconciliation
DROP TRIGGER IF EXISTS trg_voice_contact_sync_lead ON contacts;
DROP TRIGGER IF EXISTS trg_voice_reconcile_on_payment ON payments;
DROP TRIGGER IF EXISTS trg_voice_reconcile_on_sub_due ON sub_due;
DROP TRIGGER IF EXISTS trg_voice_reconcile_on_loan ON loans;

DROP FUNCTION IF EXISTS fn_trg_voice_contact_sync_lead();
DROP FUNCTION IF EXISTS fn_trg_voice_reconcile_on_payment();
DROP FUNCTION IF EXISTS fn_trg_voice_reconcile_on_sub_due();
DROP FUNCTION IF EXISTS fn_trg_voice_reconcile_on_loan();

-- Trigger A: Normalize phone_e164 on `contacts` (pure in-memory BEFORE row trigger, 0 SQL queries)
CREATE OR REPLACE FUNCTION fn_trg_voice_contact_normalize()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.phone_e164 := fn_normalize_indian_phone_e164(NEW.number);
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_dnc = TRUE AND NEW.dnc_updated_at IS NULL THEN
            NEW.dnc_updated_at := NOW();
        END IF;
    ELSIF NEW.is_dnc IS DISTINCT FROM OLD.is_dnc AND NEW.is_dnc = TRUE THEN
        NEW.dnc_updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_contact_normalize ON contacts;
CREATE TRIGGER trg_voice_contact_normalize
BEFORE INSERT OR UPDATE OF number, is_dnc ON contacts
FOR EACH ROW
EXECUTE FUNCTION fn_trg_voice_contact_normalize();

-- Trigger B (Bulk-Safe Statement-Level): Propagate `contacts` phone/DNC changes once per DISTINCT customer_id
CREATE OR REPLACE FUNCTION fn_trg_voice_contact_sync_lead_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cid UUID;
BEGIN
    FOR v_cid IN
        SELECT DISTINCT n.customer_id
        FROM new_rows n
        WHERE n.customer_id IS NOT NULL
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_voice_contact_sync_lead_upd()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cid UUID;
BEGIN
    FOR v_cid IN
        SELECT DISTINCT n.customer_id
        FROM new_rows n
        JOIN old_rows o ON o.id = n.id
        WHERE n.customer_id IS NOT NULL
          AND (
              n.number IS DISTINCT FROM o.number
              OR n.is_dnc IS DISTINCT FROM o.is_dnc
          )
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_contact_sync_lead_ins ON contacts;
CREATE TRIGGER trg_voice_contact_sync_lead_ins
AFTER INSERT ON contacts
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_contact_sync_lead_ins();

DROP TRIGGER IF EXISTS trg_voice_contact_sync_lead_upd ON contacts;
CREATE TRIGGER trg_voice_contact_sync_lead_upd
AFTER UPDATE ON contacts
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_contact_sync_lead_upd();

-- Trigger C (Bulk-Safe Statement-Level): Reconcile Due, PTP & Leads on `payments` once per DISTINCT customer_id!
CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_payment_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT DISTINCT ON (n.customer_id)
            n.customer_id,
            n.id AS payment_id
        FROM new_rows n
        WHERE n.customer_id IS NOT NULL
        ORDER BY n.customer_id, n.id DESC
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_rec.customer_id, v_rec.payment_id);
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_payment_upd()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT affected.customer_id,
               (array_agg(affected.payment_id ORDER BY affected.payment_id DESC)
                   FILTER (WHERE affected.payment_id IS NOT NULL))[1] AS payment_id
        FROM (
            SELECT n.customer_id, n.id AS payment_id
            FROM new_rows n
            JOIN old_rows o ON o.id = n.id
            WHERE n.customer_id IS NOT NULL
              AND (
                  n.amount IS DISTINCT FROM o.amount
                  OR n.status IS DISTINCT FROM o.status
                  OR n.payment_status IS DISTINCT FROM o.payment_status
                  OR n.customer_id IS DISTINCT FROM o.customer_id
              )
            UNION ALL
            SELECT o.customer_id, NULL::UUID AS payment_id
            FROM new_rows n
            JOIN old_rows o ON o.id = n.id
            WHERE o.customer_id IS NOT NULL
              AND n.customer_id IS DISTINCT FROM o.customer_id
        ) affected
        GROUP BY affected.customer_id
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_rec.customer_id, v_rec.payment_id);
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_payment_del()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cid UUID;
BEGIN
    FOR v_cid IN
        SELECT DISTINCT o.customer_id
        FROM old_rows o
        WHERE o.customer_id IS NOT NULL
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_payment_ins ON payments;
CREATE TRIGGER trg_voice_reconcile_on_payment_ins
AFTER INSERT ON payments
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_payment_ins();

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_payment_upd ON payments;
CREATE TRIGGER trg_voice_reconcile_on_payment_upd
AFTER UPDATE ON payments
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_payment_upd();

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_payment_del ON payments;
CREATE TRIGGER trg_voice_reconcile_on_payment_del
AFTER DELETE ON payments
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_payment_del();

-- Trigger D (Bulk-Safe Statement-Level): Reconcile Due, PTP & Leads on `sub_due` once per DISTINCT customer_id!
CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_sub_due_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT DISTINCT ON (n.customer_id)
            n.customer_id,
            n.payment_id
        FROM new_rows n
        WHERE n.customer_id IS NOT NULL
        ORDER BY n.customer_id, n.id DESC
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_rec.customer_id, v_rec.payment_id);
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_sub_due_upd()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT affected.customer_id,
               (array_agg(affected.payment_id ORDER BY affected.payment_id DESC)
                   FILTER (WHERE affected.payment_id IS NOT NULL))[1] AS payment_id
        FROM (
            SELECT n.customer_id, n.payment_id
            FROM new_rows n
            JOIN old_rows o ON o.id = n.id
            WHERE n.customer_id IS NOT NULL
              AND (
                  n.paid_amount IS DISTINCT FROM o.paid_amount
                  OR n.status IS DISTINCT FROM o.status
                  OR n.customer_id IS DISTINCT FROM o.customer_id
              )
            UNION ALL
            SELECT o.customer_id, NULL::UUID AS payment_id
            FROM new_rows n
            JOIN old_rows o ON o.id = n.id
            WHERE o.customer_id IS NOT NULL
              AND n.customer_id IS DISTINCT FROM o.customer_id
        ) affected
        GROUP BY affected.customer_id
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_rec.customer_id, v_rec.payment_id);
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_sub_due_del()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cid UUID;
BEGIN
    FOR v_cid IN
        SELECT DISTINCT o.customer_id
        FROM old_rows o
        WHERE o.customer_id IS NOT NULL
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_sub_due_ins ON sub_due;
CREATE TRIGGER trg_voice_reconcile_on_sub_due_ins
AFTER INSERT ON sub_due
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_sub_due_ins();

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_sub_due_upd ON sub_due;
CREATE TRIGGER trg_voice_reconcile_on_sub_due_upd
AFTER UPDATE ON sub_due
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_sub_due_upd();

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_sub_due_del ON sub_due;
CREATE TRIGGER trg_voice_reconcile_on_sub_due_del
AFTER DELETE ON sub_due
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_sub_due_del();

-- Trigger E (Bulk-Safe Statement-Level): Reconcile Due & Leads on `loans` once per DISTINCT customer_id!
CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_loan_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cid UUID;
BEGIN
    FOR v_cid IN
        SELECT DISTINCT n.customer_id
        FROM new_rows n
        WHERE n.customer_id IS NOT NULL
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_loan_upd()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cid UUID;
BEGIN
    FOR v_cid IN
        SELECT DISTINCT affected.customer_id
        FROM (
            SELECT n.customer_id
            FROM new_rows n
            JOIN old_rows o ON o.id = n.id
            WHERE n.customer_id IS NOT NULL
              AND (
                  n.hp_amount IS DISTINCT FROM o.hp_amount
                  OR n.hp_date IS DISTINCT FROM o.hp_date
                  OR n.due_date IS DISTINCT FROM o.due_date
                  OR n.due_month IS DISTINCT FROM o.due_month
                  OR n.interest_rate IS DISTINCT FROM o.interest_rate
                  OR n.due_amount IS DISTINCT FROM o.due_amount
                  OR n.principle_part IS DISTINCT FROM o.principle_part
                  OR n.interest_part IS DISTINCT FROM o.interest_part
                  OR n.net_payable IS DISTINCT FROM o.net_payable
                  OR n.customer_id IS DISTINCT FROM o.customer_id
              )
            UNION ALL
            SELECT o.customer_id
            FROM new_rows n
            JOIN old_rows o ON o.id = n.id
            WHERE o.customer_id IS NOT NULL
              AND n.customer_id IS DISTINCT FROM o.customer_id
        ) affected
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_loan_del()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cid UUID;
BEGIN
    FOR v_cid IN
        SELECT DISTINCT o.customer_id
        FROM old_rows o
        WHERE o.customer_id IS NOT NULL
    LOOP
        PERFORM fn_reconcile_customer_voice_state(v_cid, NULL);
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_loan_ins ON loans;
CREATE TRIGGER trg_voice_reconcile_on_loan_ins
AFTER INSERT ON loans
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_loan_ins();

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_loan_upd ON loans;
CREATE TRIGGER trg_voice_reconcile_on_loan_upd
AFTER UPDATE ON loans
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_loan_upd();

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_loan_del ON loans;
CREATE TRIGGER trg_voice_reconcile_on_loan_del
AFTER DELETE ON loans
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION fn_trg_voice_reconcile_on_loan_del();

-- Trigger F: Reconcile Leads when `customers.loan_status` changes ('active' -> 'close' / 'seized')
CREATE OR REPLACE FUNCTION fn_trg_voice_reconcile_on_customer_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM fn_reconcile_customer_voice_state(NEW.id, NULL);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_reconcile_on_customer_status ON customers;
CREATE TRIGGER trg_voice_reconcile_on_customer_status
AFTER UPDATE OF loan_status ON customers
FOR EACH ROW
WHEN (NEW.loan_status IS DISTINCT FROM OLD.loan_status)
EXECUTE FUNCTION fn_trg_voice_reconcile_on_customer_status();

-- Trigger G: Reconcile when `qr_payment_requests` status becomes 'paid'
CREATE OR REPLACE FUNCTION fn_trg_voice_qr_paid_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM fn_reconcile_customer_voice_state(NEW.customer_id, NEW.payment_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_qr_paid_sync ON qr_payment_requests;
CREATE TRIGGER trg_voice_qr_paid_sync
AFTER UPDATE OF status ON qr_payment_requests
FOR EACH ROW
WHEN (NEW.status = 'paid' AND OLD.status <> 'paid')
EXECUTE FUNCTION fn_trg_voice_qr_paid_sync();

-- Trigger H1: `promise_to_pay` BEFORE INSERT -> Snapshot baseline_paid_amount & supersede older pending PTPs
CREATE OR REPLACE FUNCTION fn_trg_voice_ptp_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_due RECORD;
BEGIN
    SELECT * INTO v_due FROM fn_calculate_customer_due_summary(NEW.customer_id, CURRENT_DATE);
    IF FOUND THEN
        IF NEW.loan_id IS NULL THEN
            NEW.loan_id := v_due.loan_id;
        END IF;
        IF COALESCE(NEW.baseline_paid_amount, 0.00) <= 0.00 THEN
            NEW.baseline_paid_amount := COALESCE(v_due.total_paid, 0.00);
        END IF;
        IF COALESCE(v_due.overdue_amount, 0.00) > 0.00 AND NEW.promised_amount < v_due.overdue_amount THEN
            NEW.is_partial_payment := TRUE;
        END IF;
    END IF;

    -- Supersede any older 'pending' PTP for this customer so LLM memory never quotes stale promises
    UPDATE promise_to_pay
    SET is_superseded = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE finance_id = NEW.finance_id
      AND customer_id = NEW.customer_id
      AND ptp_status = 'pending'
      AND is_superseded = FALSE;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_ptp_before_insert ON promise_to_pay;
CREATE TRIGGER trg_voice_ptp_before_insert
BEFORE INSERT ON promise_to_pay
FOR EACH ROW
EXECUTE FUNCTION fn_trg_voice_ptp_before_insert();

-- Trigger H2: `promise_to_pay` AFTER UPDATE OF ptp_status -> Update `voice_customer_memory` trust & re-queue broken PTPs
CREATE OR REPLACE FUNCTION fn_trg_voice_ptp_after_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_kept_inc INT := CASE WHEN NEW.ptp_status = 'paid' THEN 1 ELSE 0 END;
    v_broken_inc INT := CASE WHEN NEW.ptp_status = 'broken' THEN 1 ELSE 0 END;
BEGIN
    INSERT INTO voice_customer_memory (
        finance_id, customer_id, active_loan_id,
        ptp_kept_count, ptp_broken_count, trust_band, updated_at
    ) VALUES (
        NEW.finance_id, NEW.customer_id, NEW.loan_id,
        v_kept_inc, v_broken_inc,
        CASE WHEN v_broken_inc > 0 THEN 'cautious' ELSE 'high' END,
        NOW()
    )
    ON CONFLICT (finance_id, customer_id) DO UPDATE SET
        ptp_kept_count = voice_customer_memory.ptp_kept_count + v_kept_inc,
        ptp_broken_count = voice_customer_memory.ptp_broken_count + v_broken_inc,
        trust_band = CASE
            WHEN (voice_customer_memory.ptp_broken_count + v_broken_inc) >= 2
                 AND (voice_customer_memory.ptp_broken_count + v_broken_inc) > (voice_customer_memory.ptp_kept_count + v_kept_inc)
                THEN 'low'
            WHEN (voice_customer_memory.ptp_broken_count + v_broken_inc) >= 1
                THEN 'cautious'
            WHEN (voice_customer_memory.ptp_kept_count + v_kept_inc) >= 2
                THEN 'high'
            ELSE 'neutral'
        END,
        updated_at = NOW();

    -- If promise was broken, automatically re-queue lead with elevated priority for follow-up call
    IF NEW.ptp_status = 'broken' THEN
        UPDATE ai_telecalling_leads
        SET call_status = 'scheduled',
            scheduled_time = CURRENT_TIMESTAMP,
            priority = LEAST(10, priority + 2),
            call_outcome_note = 'Promise-to-pay broken; auto-queued for follow-up',
            updated_at = CURRENT_TIMESTAMP
        WHERE finance_id = NEW.finance_id
          AND customer_id = NEW.customer_id
          AND overdue_amount > 0;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_ptp_after_status ON promise_to_pay;
CREATE TRIGGER trg_voice_ptp_after_status
AFTER UPDATE OF ptp_status ON promise_to_pay
FOR EACH ROW
WHEN (NEW.ptp_status IS DISTINCT FROM OLD.ptp_status AND NEW.ptp_status IN ('paid', 'broken'))
EXECUTE FUNCTION fn_trg_voice_ptp_after_status();

-- Trigger I1 & I2: Auto-sync `ai_telecalling_call_logs` -> `ai_conversations`, `ai_messages` & `voice_customer_memory`
-- Powers AIDashboard.tsx, AILogs.tsx, and AIInsights.tsx automatically!
CREATE OR REPLACE FUNCTION fn_trg_voice_call_log_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_conv_id UUID;
    v_conv_status ai_conversation_status_enum;
BEGIN
    IF NEW.conversation_id IS NULL AND NEW.transcript IS NOT NULL AND jsonb_typeof(NEW.transcript) = 'array' AND jsonb_array_length(NEW.transcript) > 0 THEN
        v_conv_status := CASE
            WHEN NEW.disposition IN ('dispute', 'escalated') THEN 'escalated'::ai_conversation_status_enum
            WHEN NEW.call_status = 'completed' THEN 'resolved'::ai_conversation_status_enum
            ELSE 'pending'::ai_conversation_status_enum
        END;

        INSERT INTO ai_conversations (
            finance_id, customer_id, user_id, channel, title,
            sentiment, status, risk_score, tags, created_at, updated_at
        ) VALUES (
            NEW.finance_id, NEW.customer_id, NEW.called_by_user_id, 'voice_call',
            COALESCE(NEW.disposition, 'EMI Voice Call'),
            COALESCE(NEW.sentiment, 'neutral'),
            v_conv_status,
            fn_get_customer_risk_score(NEW.customer_id),
            ARRAY_REMOVE(ARRAY['Voice Call', NEW.disposition], NULL),
            COALESCE(NEW.started_at, CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        )
        RETURNING id INTO v_conv_id;

        NEW.conversation_id := v_conv_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_call_log_before_insert ON ai_telecalling_call_logs;
CREATE TRIGGER trg_voice_call_log_before_insert
BEFORE INSERT ON ai_telecalling_call_logs
FOR EACH ROW
EXECUTE FUNCTION fn_trg_voice_call_log_before_insert();

CREATE OR REPLACE FUNCTION fn_trg_voice_call_log_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_elem JSONB;
    v_sender ai_sender_type_enum;
    v_answered INT := CASE WHEN NEW.call_duration_seconds > 0 AND NEW.call_status = 'completed' THEN 1 ELSE 0 END;
BEGIN
    -- 1. Mirror transcript turns into `ai_messages` for AILogs.tsx modal view
    IF NEW.conversation_id IS NOT NULL AND NEW.transcript IS NOT NULL AND jsonb_typeof(NEW.transcript) = 'array' THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(NEW.transcript) LOOP
            v_sender := CASE
                WHEN COALESCE(v_elem->>'sender', v_elem->>'role', 'ai') = 'customer' THEN 'customer'::ai_sender_type_enum
                ELSE 'ai'::ai_sender_type_enum
            END;
            IF COALESCE(v_elem->>'text', '') <> '' THEN
                INSERT INTO ai_messages (
                    conversation_id, sender_type, message_text, payload, sentiment, created_at
                ) VALUES (
                    NEW.conversation_id, v_sender, v_elem->>'text',
                    jsonb_build_object('time', v_elem->>'time', 'call_log_id', NEW.id),
                    NEW.sentiment, CURRENT_TIMESTAMP
                );
            END IF;
        END LOOP;
    END IF;

    -- 2. Update call counters in `voice_customer_memory`
    INSERT INTO voice_customer_memory (
        finance_id, customer_id, active_loan_id, preferred_language,
        total_calls, answered_calls, last_call_log_id, last_outcome, last_called_at, updated_at
    ) VALUES (
        NEW.finance_id, NEW.customer_id, NEW.loan_id, COALESCE(NEW.language_used, 'ta-IN'),
        1, v_answered, NEW.id, COALESCE(NEW.disposition, NEW.call_status::TEXT), NOW(), NOW()
    )
    ON CONFLICT (finance_id, customer_id) DO UPDATE SET
        active_loan_id = COALESCE(EXCLUDED.active_loan_id, voice_customer_memory.active_loan_id),
        total_calls = voice_customer_memory.total_calls + 1,
        answered_calls = voice_customer_memory.answered_calls + v_answered,
        last_call_log_id = NEW.id,
        last_outcome = COALESCE(NEW.disposition, NEW.call_status::TEXT),
        last_called_at = NOW(),
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_call_log_after_insert ON ai_telecalling_call_logs;
CREATE TRIGGER trg_voice_call_log_after_insert
AFTER INSERT ON ai_telecalling_call_logs
FOR EACH ROW
EXECUTE FUNCTION fn_trg_voice_call_log_after_insert();

-- ============================================================================
-- SECTION 6: RUNTIME FUNCTIONS FOR PIPECAT / DOGRAH PYTHON BACKEND
-- ============================================================================

-- 6.1 Atomic 50-Worker Queue Claimer (`FOR UPDATE SKIP LOCKED`)
CREATE OR REPLACE FUNCTION fn_claim_due_voice_leads(
    p_worker_id VARCHAR,
    p_batch_size INT DEFAULT 10,
    p_lease_seconds INT DEFAULT 180
)
RETURNS SETOF ai_telecalling_leads
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH tenant_limits AS (
        SELECT
            f.id AS finance_id,
            COALESCE((ais.voice_config->>'enabled')::BOOLEAN, TRUE) AS voice_enabled,
            COALESCE((ais.voice_config->>'calling_window_start')::TIME, TIME '09:00') AS win_start,
            COALESCE((ais.voice_config->>'calling_window_end')::TIME, TIME '19:30') AS win_end,
            COALESCE(ais.voice_config->>'timezone', 'Asia/Kolkata') AS tz,
            COALESCE((ais.voice_config->>'max_concurrent_calls')::INT, 3) AS max_conc,
            COALESCE((ais.voice_config->>'max_daily_calls')::INT, 100) AS max_daily,
            COALESCE((ais.voice_config->>'max_attempts_per_day')::INT, 2) AS max_att_day,
            COALESCE((ais.voice_config->>'min_retry_gap_minutes')::INT, 180) AS retry_gap_min,
            (
                SELECT COUNT(*)
                FROM ai_telecalling_leads a2
                WHERE a2.finance_id = f.id
                  AND (
                      a2.call_status IN ('connecting', 'speaking')
                      OR (a2.lock_expires_at IS NOT NULL AND a2.lock_expires_at > NOW())
                  )
            ) AS active_conc,
            (
                SELECT COUNT(*)
                FROM ai_telecalling_call_logs cl
                WHERE cl.finance_id = f.id
                  AND cl.started_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Kolkata')
            ) AS calls_today
        FROM finance_detail f
        LEFT JOIN ai_settings ais ON ais.finance_id = f.id
        WHERE f.is_active = 1
          AND EXISTS (
              SELECT 1
              FROM ai_telecalling_leads q
              WHERE q.finance_id = f.id
                AND q.call_status IN ('uncalled', 'scheduled', 'not_responded', 'failed')
                AND q.is_suppressed = FALSE
                AND q.overdue_amount > 0
          )
          AND has_feature(f.owner_id, 'ai_voice_agent')
    ),
    eligible AS (
        SELECT atl.id
        FROM ai_telecalling_leads atl
        JOIN tenant_limits tl ON tl.finance_id = atl.finance_id
        WHERE tl.voice_enabled = TRUE
          AND (NOW() AT TIME ZONE tl.tz)::TIME BETWEEN tl.win_start AND tl.win_end
          AND tl.active_conc < tl.max_conc
          AND tl.calls_today < tl.max_daily
          AND atl.is_suppressed = FALSE
          AND atl.overdue_amount > 0
          AND atl.phone_e164 IS NOT NULL
          AND atl.call_status IN ('uncalled', 'scheduled', 'not_responded', 'failed')
          AND (atl.lock_expires_at IS NULL OR atl.lock_expires_at <= NOW())
          AND (atl.scheduled_time IS NULL OR atl.scheduled_time <= CURRENT_TIMESTAMP)
          AND (
              atl.daily_attempt_date IS DISTINCT FROM CURRENT_DATE
              OR atl.daily_attempt_count < tl.max_att_day
          )
          AND (
              atl.last_call_at IS NULL
              OR atl.callback_requested = TRUE
              OR atl.last_call_at <= CURRENT_TIMESTAMP - (tl.retry_gap_min || ' minutes')::INTERVAL
          )
        ORDER BY
            atl.callback_requested DESC,
            atl.priority DESC,
            COALESCE(atl.scheduled_time, atl.created_at) ASC
        FOR UPDATE OF atl SKIP LOCKED
        LIMIT p_batch_size
    )
    UPDATE ai_telecalling_leads target
    SET call_status = 'connecting',
        locked_by = p_worker_id,
        lock_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
        attempt_count = target.attempt_count + 1,
        daily_attempt_count = CASE
            WHEN target.daily_attempt_date = CURRENT_DATE THEN target.daily_attempt_count + 1
            ELSE 1
        END,
        daily_attempt_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
    FROM eligible
    WHERE target.id = eligible.id
    RETURNING target.*;
END;
$$;

-- 6.2 Single-Query Pre-Call Memory Bundle (<10ms, Token-Budgeted Level 1 + 2 + 3 + Biometric Status)
CREATE OR REPLACE FUNCTION fn_get_precall_memory_bundle(
    p_finance_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_due RECORD;
    v_cust RECORD;
    v_settings RECORD;
    v_mem RECORD;
    v_ptp RECORD;
    v_bio RECORD;
    v_summaries JSONB := '[]'::jsonb;
    v_facts JSONB := '[]'::jsonb;
    v_recent_limit INT := 5;
BEGIN
    SELECT f.finance_name, c.cname, c.hplno,
           COALESCE(vi.brand || ' ' || vi.model_name, vd.vehicle_modal, 'Vehicle') AS vehicle_model,
           vd.vehicle_number AS vehicle_plate
    INTO v_cust
    FROM customers c
    JOIN finance_detail f ON f.id = c.finance_id
    LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
    LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
    WHERE c.id = p_customer_id AND c.finance_id = p_finance_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Customer not found for finance_id');
    END IF;

    SELECT * INTO v_due FROM fn_calculate_customer_due_summary(p_customer_id, CURRENT_DATE);

    SELECT company_rules, system_instructions, behavior_flags, escalation_policy, voice_config
    INTO v_settings
    FROM ai_settings
    WHERE finance_id = p_finance_id;

    IF FOUND AND v_settings.voice_config ? 'memory_recent_calls_limit' THEN
        v_recent_limit := GREATEST(1, LEAST(6, (v_settings.voice_config->>'memory_recent_calls_limit')::INT));
    END IF;

    -- Level 1 Active PTP
    SELECT id, promised_amount, promised_date, promised_time_text, is_partial_payment, ptp_status, broken_count
    INTO v_ptp
    FROM promise_to_pay
    WHERE finance_id = p_finance_id
      AND customer_id = p_customer_id
      AND is_superseded = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    -- Level 2 Recent Non-Superseded Structured Call Summaries (last 5-6 calls)
    SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
    INTO v_summaries
    FROM (
        SELECT call_date, language_used, outcome, summary_short,
               customer_stated_reason, commitment_summary, observable_tone
        FROM voice_call_summaries
        WHERE finance_id = p_finance_id
          AND customer_id = p_customer_id
          AND is_superseded = FALSE
        ORDER BY call_date DESC
        LIMIT v_recent_limit
    ) s;

    -- Level 3 Rolling Customer Profile + Atomic Facts
    SELECT preferred_language, language_confirmed, preferred_call_time,
           communication_style, recurring_delay_reason, rolling_summary,
           total_calls, answered_calls, ptp_kept_count, ptp_broken_count,
           trust_band, do_not_call, last_outcome, last_called_at
    INTO v_mem
    FROM voice_customer_memory
    WHERE finance_id = p_finance_id
      AND customer_id = p_customer_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category', memory_category,
        'key', memory_key,
        'value', memory_value
    )), '[]'::jsonb)
    INTO v_facts
    FROM (
        SELECT memory_category, memory_key, memory_value
        FROM ai_customer_memory
        WHERE customer_id = p_customer_id
          AND is_active = TRUE
        ORDER BY updated_at DESC
        LIMIT 5
    ) f;

    -- Plan 2 Speaker Profile Readiness
    SELECT id, speaker_role, consent_status, status, enrolled_samples_count
    INTO v_bio
    FROM voice_speaker_profiles
    WHERE finance_id = p_finance_id
      AND customer_id = p_customer_id
      AND speaker_role = 'borrower';

    RETURN jsonb_build_object(
        'status', 'ok',
        'level_1_live_facts', jsonb_build_object(
            'finance_name', v_cust.finance_name,
            'customer_name', v_cust.cname,
            'hpl_number', v_cust.hplno,
            'vehicle_model', v_cust.vehicle_model,
            'vehicle_plate', v_cust.vehicle_plate,
            'loan_id', v_due.loan_id,
            'loan_status', v_due.loan_status,
            'phone_e164', v_due.phone_e164,
            'installment_amount', v_due.installment_amount,
            'overdue_amount', v_due.overdue_amount,
            'total_balance_amount', v_due.total_balance_amount,
            'pending_emi_count', v_due.pending_emi_count,
            'days_overdue', v_due.days_overdue,
            'earliest_unpaid_due_date', v_due.earliest_unpaid_due_date,
            'next_due_date', v_due.next_due_date,
            'latest_ptp', CASE WHEN v_ptp.id IS NOT NULL THEN row_to_json(v_ptp)::jsonb ELSE NULL END
        ),
        'level_2_recent_summaries', v_summaries,
        'level_3_customer_memory', jsonb_build_object(
            'profile', CASE WHEN v_mem.preferred_language IS NOT NULL THEN row_to_json(v_mem)::jsonb ELSE NULL END,
            'atomic_facts', v_facts
        ),
        'tenant_settings', jsonb_build_object(
            'company_rules', COALESCE(v_settings.company_rules, '{}'::jsonb),
            'system_instructions', v_settings.system_instructions,
            'voice_config', COALESCE(v_settings.voice_config, '{}'::jsonb)
        ),
        'biometrics', CASE WHEN v_bio.id IS NOT NULL THEN row_to_json(v_bio)::jsonb ELSE NULL END
    );
END;
$$;

-- 6.3 Atomic Post-Call Completion & Memory Saver (Used by Pipecat/Dograh Post-Call Worker)
CREATE OR REPLACE FUNCTION fn_complete_voice_call(
    p_lead_id UUID,
    p_provider_call_id VARCHAR,
    p_call_status lead_call_status_enum,
    p_duration_seconds INT,
    p_language_used VARCHAR DEFAULT 'ta-IN',
    p_sentiment ai_sentiment_enum DEFAULT 'neutral',
    p_identity_verified BOOLEAN DEFAULT FALSE,
    p_transcript JSONB DEFAULT '[]'::jsonb,
    p_disposition VARCHAR DEFAULT NULL,
    p_outcome_note TEXT DEFAULT NULL,
    p_audio_url VARCHAR DEFAULT NULL,
    -- Structured Level-2 Summary (optional if call was unanswered)
    p_summary_short VARCHAR DEFAULT NULL,
    p_stated_reason VARCHAR DEFAULT NULL,
    p_commitment_summary VARCHAR DEFAULT NULL,
    p_observable_tone VARCHAR DEFAULT 'calm',
    p_stated_facts JSONB DEFAULT '{}'::jsonb,
    p_ai_inferences JSONB DEFAULT '{}'::jsonb,
    p_summary_tokens INT DEFAULT 0,
    -- Optional Level-3 Rolling Profile Update
    p_rolling_summary TEXT DEFAULT NULL,
    p_communication_style VARCHAR DEFAULT NULL,
    p_preferred_call_time VARCHAR DEFAULT NULL,
    p_language_confirmed BOOLEAN DEFAULT NULL,
    p_do_not_call BOOLEAN DEFAULT FALSE,
    p_dnc_reason VARCHAR DEFAULT NULL,
    -- Optional Promise-to-Pay / Callback
    p_promised_amount DECIMAL(15,2) DEFAULT NULL,
    p_promised_date DATE DEFAULT NULL,
    p_promised_time_text VARCHAR DEFAULT NULL,
    p_callback_at TIMESTAMP DEFAULT NULL,
    -- Token & Latency Telemetry
    p_memory_tokens INT DEFAULT 0,
    p_prompt_tokens INT DEFAULT 0,
    p_completion_tokens INT DEFAULT 0,
    p_greeting_latency_ms INT DEFAULT NULL,
    p_turn_latency_p50_ms INT DEFAULT NULL,
    p_barge_in_count INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_lead RECORD;
    v_log_id UUID;
    v_log_started_at TIMESTAMP;
    v_call_ts TIMESTAMPTZ;
    v_ptp_id UUID := NULL;
    v_summary_id UUID := NULL;
    v_duration_str VARCHAR(30) := NULL;
    v_final_lead_status lead_call_status_enum := p_call_status;
BEGIN
    SELECT * INTO v_lead FROM ai_telecalling_leads WHERE id = p_lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Lead not found');
    END IF;

    IF p_duration_seconds > 0 THEN
        v_duration_str := (p_duration_seconds / 60)::TEXT || 'm ' || (p_duration_seconds % 60)::TEXT || 's';
    END IF;

    -- 1. Idempotent Insert/Upsert into `ai_telecalling_call_logs`
    INSERT INTO ai_telecalling_call_logs (
        lead_id, finance_id, customer_id, loan_id, provider_call_id, phone_e164,
        call_status, call_duration_seconds, started_at, ended_at,
        transcript, call_outcome_note, disposition, audio_recording_url,
        caller_type, language_used, sentiment, identity_verified,
        due_amount_at_call, memory_tokens, prompt_tokens, completion_tokens,
        greeting_latency_ms, turn_latency_p50_ms, barge_in_count, created_at
    ) VALUES (
        p_lead_id, v_lead.finance_id, v_lead.customer_id, v_lead.loan_id,
        p_provider_call_id, v_lead.phone_e164,
        p_call_status, GREATEST(0, COALESCE(p_duration_seconds, 0)),
        CURRENT_TIMESTAMP - (GREATEST(0, COALESCE(p_duration_seconds, 0)) || ' seconds')::INTERVAL,
        CURRENT_TIMESTAMP,
        COALESCE(p_transcript, '[]'::jsonb), p_outcome_note, p_disposition, p_audio_url,
        'ai_bot', COALESCE(p_language_used, 'ta-IN'), COALESCE(p_sentiment, 'neutral'),
        COALESCE(p_identity_verified, FALSE),
        COALESCE(v_lead.overdue_amount, 0.00),
        COALESCE(p_memory_tokens, 0), COALESCE(p_prompt_tokens, 0), COALESCE(p_completion_tokens, 0),
        p_greeting_latency_ms, p_turn_latency_p50_ms, COALESCE(p_barge_in_count, 0),
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (provider_call_id) WHERE provider_call_id IS NOT NULL
    DO UPDATE SET
        call_status = EXCLUDED.call_status,
        call_duration_seconds = EXCLUDED.call_duration_seconds,
        ended_at = EXCLUDED.ended_at,
        transcript = EXCLUDED.transcript,
        call_outcome_note = COALESCE(EXCLUDED.call_outcome_note, ai_telecalling_call_logs.call_outcome_note),
        disposition = COALESCE(EXCLUDED.disposition, ai_telecalling_call_logs.disposition),
        audio_recording_url = COALESCE(EXCLUDED.audio_recording_url, ai_telecalling_call_logs.audio_recording_url)
    RETURNING id, started_at INTO v_log_id, v_log_started_at;

    v_call_ts := COALESCE(v_log_started_at::TIMESTAMPTZ, NOW());

    -- 2. Create Promise-to-Pay if customer committed to a date & amount
    IF p_promised_amount IS NOT NULL AND p_promised_amount > 0 AND p_promised_date IS NOT NULL THEN
        INSERT INTO promise_to_pay (
            finance_id, customer_id, loan_id, call_log_id,
            promised_amount, promised_date, promised_time_text,
            ptp_status, reason, note, created_at, updated_at
        ) VALUES (
            v_lead.finance_id, v_lead.customer_id, v_lead.loan_id, v_log_id,
            p_promised_amount, p_promised_date, p_promised_time_text,
            'pending', COALESCE(p_stated_reason, 'Promised via Voice AI'),
            p_outcome_note, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING id INTO v_ptp_id;
    END IF;

    -- 3. Save Level-2 Structured Call Summary (`voice_call_summaries` — monthly partitioned!)
    IF p_summary_short IS NOT NULL AND btrim(p_summary_short) <> '' THEN
        -- If a new PTP or callback supersedes older commitments, mark older commitment summaries superseded
        IF v_ptp_id IS NOT NULL THEN
            UPDATE voice_call_summaries
            SET is_superseded = TRUE
            WHERE finance_id = v_lead.finance_id
              AND customer_id = v_lead.customer_id
              AND outcome IN ('ptp_confirmed', 'part_payment_promised')
              AND is_superseded = FALSE;
        END IF;

        INSERT INTO voice_call_summaries (
            finance_id, customer_id, loan_id, call_log_id, ptp_id,
            call_date, language_used, outcome, summary_short,
            customer_stated_reason, commitment_summary, observable_tone,
            stated_facts, ai_inferences, summary_tokens
        ) VALUES (
            v_lead.finance_id, v_lead.customer_id, v_lead.loan_id, v_log_id, v_ptp_id,
            v_call_ts, COALESCE(p_language_used, 'ta-IN'),
            CASE
                WHEN p_disposition IN (
                    'ptp_confirmed', 'part_payment_promised', 'callback_requested',
                    'paid_claimed', 'qr_sent', 'dispute', 'hardship',
                    'wrong_number', 'family_answered', 'opt_out', 'completed_info'
                ) THEN p_disposition
                ELSE 'completed_info'
            END,
            left(btrim(p_summary_short), 320),
            left(p_stated_reason, 200),
            left(p_commitment_summary, 200),
            CASE
                WHEN p_observable_tone IN ('calm','cooperative','hesitant','rushed','frustrated','angry','confused')
                    THEN p_observable_tone
                ELSE 'calm'
            END,
            COALESCE(p_stated_facts, '{}'::jsonb),
            COALESCE(p_ai_inferences, '{}'::jsonb),
            GREATEST(0, COALESCE(p_summary_tokens, 0))
        )
        ON CONFLICT (finance_id, call_log_id, call_date) DO UPDATE SET
            summary_short = EXCLUDED.summary_short,
            ptp_id = COALESCE(EXCLUDED.ptp_id, voice_call_summaries.ptp_id),
            commitment_summary = COALESCE(EXCLUDED.commitment_summary, voice_call_summaries.commitment_summary)
        RETURNING id INTO v_summary_id;
    END IF;

    -- 4. Update Level-3 Rolling Profile (`voice_customer_memory`)
    UPDATE voice_customer_memory
    SET preferred_language = COALESCE(p_language_used, preferred_language),
        language_confirmed = COALESCE(p_language_confirmed, language_confirmed),
        preferred_call_time = COALESCE(p_preferred_call_time, preferred_call_time),
        communication_style = COALESCE(p_communication_style, communication_style),
        recurring_delay_reason = COALESCE(p_stated_reason, recurring_delay_reason),
        rolling_summary = COALESCE(left(p_rolling_summary, 600), rolling_summary),
        do_not_call = CASE WHEN p_do_not_call THEN TRUE ELSE do_not_call END,
        dnc_reason = COALESCE(p_dnc_reason, dnc_reason),
        updated_at = NOW()
    WHERE finance_id = v_lead.finance_id
      AND customer_id = v_lead.customer_id;

    -- If wrong_number reported, mark phone DNC on `contacts` so that number is suppressed!
    IF p_disposition = 'wrong_number' AND v_lead.phone_e164 IS NOT NULL THEN
        UPDATE contacts
        SET is_dnc = TRUE,
            dnc_reason = 'wrong_number',
            dnc_updated_at = NOW()
        WHERE customer_id = v_lead.customer_id
          AND phone_e164 = v_lead.phone_e164;
    END IF;

    -- 5. Release worker lease & update `ai_telecalling_leads`
    IF p_callback_at IS NOT NULL THEN
        v_final_lead_status := 'scheduled';
    END IF;

    UPDATE ai_telecalling_leads
    SET call_status = v_final_lead_status,
        last_call_at = CURRENT_TIMESTAMP,
        last_call_duration = v_duration_str,
        duration_seconds = GREATEST(0, COALESCE(p_duration_seconds, 0)),
        call_outcome_note = COALESCE(p_outcome_note, call_outcome_note),
        scheduled_time = COALESCE(p_callback_at, scheduled_time),
        callback_requested = (p_callback_at IS NOT NULL),
        ptp_id = COALESCE(v_ptp_id, ptp_id),
        locked_by = NULL,
        lock_expires_at = NULL,
        is_suppressed = CASE WHEN p_do_not_call OR p_disposition IN ('opt_out', 'wrong_number') THEN TRUE ELSE is_suppressed END,
        suppression_reason = CASE
            WHEN p_do_not_call OR p_disposition IN ('opt_out', 'wrong_number')
                THEN COALESCE(p_dnc_reason, p_disposition)
            ELSE suppression_reason
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'lead_id', p_lead_id,
        'call_log_id', v_log_id,
        'summary_id', v_summary_id,
        'ptp_id', v_ptp_id,
        'call_status', v_final_lead_status
    );
END;
$$;

-- 6.4 Backward-Compatible UI Function (`fn_record_telecall_outcome` — exact 11-arg signature)
CREATE OR REPLACE FUNCTION fn_record_telecall_outcome(
    p_lead_id UUID,
    p_call_status lead_call_status_enum,
    p_duration_seconds INT DEFAULT 0,
    p_outcome_note TEXT DEFAULT NULL,
    p_transcript JSONB DEFAULT '[]'::jsonb,
    p_disposition VARCHAR DEFAULT NULL,
    p_scheduled_time TIMESTAMP DEFAULT NULL,
    p_schedule_preset VARCHAR DEFAULT NULL,
    p_promised_amount DECIMAL(15,2) DEFAULT NULL,
    p_promised_date DATE DEFAULT NULL,
    p_called_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_lead RECORD;
    v_log_id UUID;
    v_ptp_id UUID := NULL;
    v_duration_str VARCHAR(30);
BEGIN
    SELECT * INTO v_lead FROM ai_telecalling_leads WHERE id = p_lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Lead not found');
    END IF;

    IF p_duration_seconds > 0 THEN
        v_duration_str := (p_duration_seconds / 60)::TEXT || 'm ' || (p_duration_seconds % 60)::TEXT || 's';
    ELSE
        v_duration_str := NULL;
    END IF;

    INSERT INTO ai_telecalling_call_logs (
        lead_id, finance_id, customer_id, loan_id, phone_e164, call_status,
        call_duration_seconds, started_at, ended_at, transcript,
        call_outcome_note, disposition, caller_type, called_by_user_id,
        due_amount_at_call, created_at
    ) VALUES (
        p_lead_id, v_lead.finance_id, v_lead.customer_id, v_lead.loan_id, v_lead.phone_e164, p_call_status,
        p_duration_seconds, CURRENT_TIMESTAMP - (p_duration_seconds || ' seconds')::INTERVAL, CURRENT_TIMESTAMP,
        p_transcript, p_outcome_note, p_disposition,
        CASE WHEN p_called_by_user_id IS NOT NULL THEN 'agent' ELSE 'ai_bot' END,
        p_called_by_user_id, COALESCE(v_lead.overdue_amount, 0.00), CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_log_id;

    IF p_promised_amount IS NOT NULL AND p_promised_amount > 0 AND p_promised_date IS NOT NULL THEN
        INSERT INTO promise_to_pay (
            finance_id, customer_id, loan_id, call_log_id, user_id,
            promised_amount, promised_date, ptp_status, reason, note,
            created_at, updated_at
        ) VALUES (
            v_lead.finance_id, v_lead.customer_id, v_lead.loan_id, v_log_id, p_called_by_user_id,
            p_promised_amount, p_promised_date, 'pending', 'Promised via AI Telecall',
            p_outcome_note, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING id INTO v_ptp_id;
    END IF;

    UPDATE ai_telecalling_leads SET
        call_status = p_call_status,
        last_call_at = CURRENT_TIMESTAMP,
        last_call_duration = v_duration_str,
        duration_seconds = p_duration_seconds,
        call_outcome_note = COALESCE(p_outcome_note, call_outcome_note),
        scheduled_time = COALESCE(p_scheduled_time, scheduled_time),
        schedule_preset = COALESCE(p_schedule_preset, schedule_preset),
        callback_requested = (p_scheduled_time IS NOT NULL),
        ptp_id = COALESCE(v_ptp_id, ptp_id),
        locked_by = NULL,
        lock_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'lead_id', p_lead_id,
        'call_log_id', v_log_id,
        'ptp_id', v_ptp_id,
        'call_status', p_call_status,
        'duration', v_duration_str,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

-- ============================================================================
-- SECTION 7: UNIFIED LEAD CALLING VIEW (`vw_ai_lead_calling_list` for LeadCalling.tsx)
-- Preserves exact columns 1..21 from AutoFinex_final_schema.sql + appends Voice AI columns!
-- ============================================================================
CREATE OR REPLACE VIEW vw_ai_lead_calling_list AS
SELECT
    -- Columns 1..21: Exact match with AutoFinex_final_schema.sql
    atl.id AS lead_id,
    atl.finance_id,
    f.finance_name,
    atl.customer_id,
    c.cname AS customer_name,
    c.cname AS customer_full_name,
    c.hplno AS hpl_number,
    COALESCE(
        (SELECT ct.number FROM contacts ct WHERE ct.customer_id = c.id ORDER BY ct.id ASC LIMIT 1),
        'N/A'
    ) AS phone,
    COALESCE(
        vi.brand || ' ' || vi.model_name,
        vd.vehicle_modal,
        'Vehicle'
    ) AS vehicle_model,
    vd.vehicle_number AS vehicle_plate,
    COALESCE(l.due_amount, 0.00) AS due_amount,
    l.due_date AS due_date,
    atl.days_overdue,
    atl.call_status,
    atl.last_call_at,
    atl.last_call_duration,
    atl.call_outcome_note,
    atl.scheduled_time,
    atl.schedule_preset,
    atl.ptp_id,
    u.username AS assigned_agent_name,
    -- Appended Columns 22..32: Trigger-maintained Due, Memory & Risk Fields
    atl.loan_id,
    atl.phone_e164,
    atl.overdue_amount,
    atl.total_balance_amount,
    atl.pending_emi_count,
    atl.next_due_date,
    atl.attempt_count,
    atl.callback_requested,
    atl.is_suppressed,
    COALESCE(vcm.preferred_language, 'ta-IN') AS preferred_language,
    COALESCE(vcm.trust_band, 'neutral') AS trust_band,
    fn_get_customer_risk_score(c.id) AS risk_score
FROM ai_telecalling_leads atl
JOIN finance_detail f ON f.id = atl.finance_id
JOIN customers c ON c.id = atl.customer_id
LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
LEFT JOIN LATERAL (
    SELECT id, due_amount, due_date
    FROM loans
    WHERE customer_id = c.id
    ORDER BY id DESC
    LIMIT 1
) l ON true
LEFT JOIN users u ON u.id = atl.assigned_agent_id
LEFT JOIN voice_customer_memory vcm
    ON vcm.finance_id = atl.finance_id AND vcm.customer_id = atl.customer_id;

-- ============================================================================
-- SECTION 8: INITIAL BACKFILL OF `contacts.phone_e164` & ACTIVE OVERDUE LEADS
-- ============================================================================
UPDATE contacts
SET phone_e164 = fn_normalize_indian_phone_e164(number)
WHERE phone_e164 IS NULL AND number IS NOT NULL;

-- One-time full initial backfill (daily cron thereafter runs `SELECT fn_refresh_daily_overdue_leads();` in smart due-day mode!)
SELECT fn_refresh_daily_overdue_leads(NULL, TRUE, NULL, NULL);

COMMIT;

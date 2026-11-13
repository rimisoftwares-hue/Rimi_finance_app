-- ============================================================================
--  AUTOFINEX VOICE AI — MIGRATION 003 (LEAN PRODUCTION EDITION)
--  (CALLBACKS, AUTHORITATIVE DNC SUPPRESSIONS & TRANSACTIONAL OUTBOX)
-- ============================================================================
--  Additive refinement over:
--    1. Autofinex_account_schema.sql
--    2. AutoFinex_final_schema.sql
--    3. 002_voice_ai_migration.sql
--
--  ZERO TABLE BLOAT ARCHITECTURE:
--    * Creates ONLY the 3 essential operational tables required by `/api/ai`
--      and the Python Dograh/Pipecat worker:
--        1. `voice_callbacks`            (Separate callback queue vs `promise_to_pay`)
--        2. `voice_contact_suppressions` (Authoritative TRAI DNC / opt-out / wrong-number)
--        3. `voice_outbox_events`        (Reliable call dispatch & settlement sync)
--    * Collection policy rules live on `ai_settings.collection_policy` (JSONB)
--      instead of a separate policy table.
--    * Objective call tone/interaction flags live directly on `voice_call_summaries`
--      instead of spawning extra partitioned observation/usage/audit/privacy tables.
-- ============================================================================

-- Clear any open/aborted transaction state in the current pgAdmin session before running
ROLLBACK;

-- Add 'suppressed' enum value outside transaction block so it can be referenced
-- immediately inside functions and triggers within BEGIN ... COMMIT.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_call_status_enum') THEN
        ALTER TYPE lead_call_status_enum ADD VALUE IF NOT EXISTS 'suppressed';
    END IF;
END $$;

BEGIN;

-- ============================================================================
-- SECTION 0: DROP UNNECESSARY BLOAT TABLES (Idempotent Cleanup)
-- ============================================================================
DROP FUNCTION IF EXISTS fn_resolve_voice_privacy_request(UUID, UUID, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS fn_trg_voice_audit_immutable();

DROP TABLE IF EXISTS
    voice_collection_policies,
    voice_interaction_observations,
    voice_consent_records,
    voice_privacy_requests,
    voice_usage_metering,
    voice_usage_events,
    voice_audit_events
CASCADE;

-- ============================================================================
-- SECTION 1: EXTEND EXISTING TABLES (Zero Duplicate Tables)
-- ============================================================================

-- 1.1 `ai_settings`: Config Versioning + Per-Tenant Collection Policy JSONB
ALTER TABLE ai_settings
    ADD COLUMN IF NOT EXISTS config_version BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS collection_policy JSONB NOT NULL DEFAULT '{
        "policy_version": 1,
        "overdue_threshold_days": 30,
        "allow_extension": true,
        "maximum_extension_days": 7,
        "allow_partial_payment": true,
        "minimum_partial_payment_amount": 0,
        "minimum_partial_payment_pct": 25.0,
        "require_at_least_one_emi_on_partial": true,
        "immediate_payment_required": true,
        "escalation_enabled": true,
        "escalation_action": "assign_agent_callback",
        "repossession_eligibility_policy": {
            "communication_authorized": false,
            "min_overdue_days": 60,
            "require_verified_notice": true,
            "approved_notice_text_ta": "",
            "approved_notice_text_en": ""
        }
    }'::jsonb;

-- 1.2 `contacts`: Fast-lookup E.164 & DNC columns (synced from `voice_contact_suppressions`)
ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_dnc BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dnc_reason VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS dnc_updated_at TIMESTAMPTZ DEFAULT NULL;

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

-- 1.3 `ai_telecalling_call_logs` & `promise_to_pay`: Snapshot Version & Idempotency Columns
ALTER TABLE ai_telecalling_call_logs
    ADD COLUMN IF NOT EXISTS config_version BIGINT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS policy_version INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS callback_id UUID DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS owning_worker_id VARCHAR(100) DEFAULT NULL;

ALTER TABLE promise_to_pay
    ADD COLUMN IF NOT EXISTS policy_version INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ptp_finance_idem
    ON promise_to_pay (finance_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 1.4 `voice_customer_memory`: Remove subjective demeanor labels; keep objective preferences
DROP VIEW IF EXISTS vw_ai_lead_calling_list;

ALTER TABLE voice_customer_memory
    DROP COLUMN IF EXISTS trust_band,
    DROP COLUMN IF EXISTS do_not_call,
    DROP COLUMN IF EXISTS dnc_reason,
    DROP COLUMN IF EXISTS customer_behavior,
    DROP COLUMN IF EXISTS used_bad_words,
    DROP COLUMN IF EXISTS bad_words_count,
    DROP COLUMN IF EXISTS customer_feedback,
    DROP COLUMN IF EXISTS payment_reliability,
    ADD COLUMN IF NOT EXISTS communication_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS recent_interaction_digest VARCHAR(320) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_vcm_finance_updated
    ON voice_customer_memory (finance_id, updated_at DESC);

-- 1.5 `voice_call_summaries`: Fold objective call observation fields directly into Level-2 summary
ALTER TABLE voice_call_summaries
    ADD COLUMN IF NOT EXISTS aggression_level VARCHAR(20) NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS requested_human BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS observation_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- SECTION 2: THE 3 ESSENTIAL MULTI-TENANT TABLES
-- ============================================================================

-- 2.1 Dedicated Callback Requests (`voice_callbacks` — Strictly Separate from `promise_to_pay`)
CREATE TABLE IF NOT EXISTS voice_callbacks (
    id                          UUID            NOT NULL DEFAULT uuidv7(),
    finance_id                  UUID            NOT NULL,
    customer_id                 UUID            NOT NULL,
    loan_id                     UUID            DEFAULT NULL,
    call_id                     UUID            DEFAULT NULL,
    phone_e164                  VARCHAR(20)     DEFAULT NULL,
    requested_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    scheduled_at                TIMESTAMPTZ     NOT NULL,
    timezone                    VARCHAR(40)     NOT NULL DEFAULT 'Asia/Kolkata',
    callback_status             VARCHAR(28)     NOT NULL DEFAULT 'scheduled'
                                CHECK (callback_status IN (
                                    'scheduled', 'claimed', 'dialing', 'completed',
                                    'cancelled_paid', 'cancelled_suppressed',
                                    'superseded', 'failed_max_retries', 'expired'
                                )),
    source                      VARCHAR(36)     NOT NULL DEFAULT 'customer_voice_request'
                                CHECK (source IN (
                                    'customer_voice_request', 'busy_momentary_deferral',
                                    'third_party_available_later', 'worker_interrupted_retry',
                                    'manual_staff'
                                )),
    customer_note               VARCHAR(300)    DEFAULT NULL,
    attempt_count               INT             NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts                INT             NOT NULL DEFAULT 2 CHECK (max_attempts >= 1),
    claimed_by_worker           VARCHAR(100)    DEFAULT NULL,
    lease_expires_at            TIMESTAMPTZ     DEFAULT NULL,
    superseded_by_id            UUID            DEFAULT NULL,
    cancel_reason               VARCHAR(160)    DEFAULT NULL,
    idempotency_key             VARCHAR(120)    DEFAULT NULL,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (finance_id, id),
    CONSTRAINT fk_vcbk_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcbk_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcbk_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL,
    CONSTRAINT fk_vcbk_call FOREIGN KEY (call_id) REFERENCES ai_telecalling_call_logs(id) ON DELETE SET NULL,
    CONSTRAINT fk_vcbk_superseded FOREIGN KEY (finance_id, superseded_by_id)
        REFERENCES voice_callbacks(finance_id, id) ON DELETE SET NULL (superseded_by_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vcbk_idem
    ON voice_callbacks (finance_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vcbk_one_active
    ON voice_callbacks (finance_id, customer_id)
    WHERE callback_status IN ('scheduled', 'claimed', 'dialing');

CREATE INDEX IF NOT EXISTS idx_vcbk_due
    ON voice_callbacks (scheduled_at ASC, finance_id)
    WHERE callback_status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_vcbk_finance_cust
    ON voice_callbacks (finance_id, customer_id, created_at DESC);

-- 2.2 Authoritative Contact Permissions & Suppression (`voice_contact_suppressions`)
CREATE TABLE IF NOT EXISTS voice_contact_suppressions (
    id                          UUID            NOT NULL DEFAULT uuidv7(),
    finance_id                  UUID            NOT NULL,
    customer_id                 UUID            NOT NULL,
    phone_e164                  VARCHAR(20)     NOT NULL,
    channel                     VARCHAR(24)     NOT NULL DEFAULT 'ai_voice_calls'
                                CHECK (channel IN ('ai_voice_calls', 'whatsapp_qr', 'all_automated')),
    status                      VARCHAR(20)     NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'lifted')),
    suppression_source          VARCHAR(32)     NOT NULL DEFAULT 'customer_explicit_opt_out'
                                CHECK (suppression_source IN (
                                    'customer_explicit_opt_out', 'wrong_number',
                                    'regulatory_dnc', 'admin_manual', 'legal_hold'
                                )),
    reason_excerpt              VARCHAR(320)    DEFAULT NULL,
    source_call_id              UUID            DEFAULT NULL,
    lifted_by_user_id           UUID            DEFAULT NULL,
    lifted_reason               VARCHAR(240)    DEFAULT NULL,
    lifted_at                   TIMESTAMPTZ     DEFAULT NULL,
    idempotency_key             VARCHAR(120)    DEFAULT NULL,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (finance_id, id),
    CONSTRAINT fk_vcsup_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcsup_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_vcsup_call FOREIGN KEY (source_call_id) REFERENCES ai_telecalling_call_logs(id) ON DELETE SET NULL,
    CONSTRAINT fk_vcsup_lifted_by FOREIGN KEY (lifted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vcsup_active_phone
    ON voice_contact_suppressions (finance_id, phone_e164, channel)
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vcsup_idem
    ON voice_contact_suppressions (finance_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vcsup_lookup
    ON voice_contact_suppressions (finance_id, customer_id, phone_e164)
    WHERE status = 'active';

-- Sync authoritative suppression to `contacts.is_dnc`, `voice_callbacks`, and `ai_telecalling_leads`
CREATE OR REPLACE FUNCTION fn_trg_voice_suppression_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.channel IN ('ai_voice_calls', 'all_automated') THEN
        IF NEW.status = 'active' THEN
            UPDATE contacts
            SET is_dnc = TRUE,
                dnc_reason = NEW.suppression_source,
                dnc_updated_at = NOW()
            WHERE finance_id = NEW.finance_id
              AND customer_id = NEW.customer_id
              AND phone_e164 = NEW.phone_e164
              AND is_dnc IS DISTINCT FROM TRUE;

            UPDATE voice_callbacks
            SET callback_status = 'cancelled_suppressed',
                cancel_reason = NEW.suppression_source,
                updated_at = NOW()
            WHERE finance_id = NEW.finance_id
              AND customer_id = NEW.customer_id
              AND callback_status IN ('scheduled', 'claimed');

            UPDATE ai_telecalling_leads
            SET is_suppressed = TRUE,
                suppression_reason = NEW.suppression_source,
                callback_requested = FALSE,
                locked_by = NULL,
                lock_expires_at = NULL,
                call_status = CASE
                    WHEN call_status IN ('uncalled', 'scheduled', 'not_responded', 'failed')
                        THEN 'suppressed'::lead_call_status_enum
                    ELSE call_status
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE finance_id = NEW.finance_id
              AND customer_id = NEW.customer_id;
        ELSIF NEW.status = 'lifted' THEN
            IF NOT EXISTS (
                SELECT 1
                FROM voice_contact_suppressions s
                WHERE s.finance_id = NEW.finance_id
                  AND s.phone_e164 = NEW.phone_e164
                  AND s.channel IN ('ai_voice_calls', 'all_automated')
                  AND s.status = 'active'
            ) THEN
                UPDATE contacts
                SET is_dnc = FALSE,
                    dnc_reason = NULL,
                    dnc_updated_at = NOW()
                WHERE finance_id = NEW.finance_id
                  AND phone_e164 = NEW.phone_e164
                  AND is_dnc = TRUE;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_suppression_sync ON voice_contact_suppressions;
CREATE TRIGGER trg_voice_suppression_sync
AFTER INSERT OR UPDATE OF status ON voice_contact_suppressions
FOR EACH ROW
EXECUTE FUNCTION fn_trg_voice_suppression_sync();

-- 2.3 Transactional Outbox Events (`voice_outbox_events`)
CREATE TABLE IF NOT EXISTS voice_outbox_events (
    id                          UUID            NOT NULL DEFAULT uuidv7(),
    finance_id                  UUID            NOT NULL,
    aggregate_type              VARCHAR(40)     NOT NULL,
    aggregate_id                UUID            NOT NULL,
    event_type                  VARCHAR(60)     NOT NULL,
    payload                     JSONB           NOT NULL DEFAULT '{}'::jsonb,
    status                      VARCHAR(20)     NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'published', 'dead_letter')),
    attempt_count               INT             NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts                INT             NOT NULL DEFAULT 6 CHECK (max_attempts >= 1),
    next_retry_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    locked_by                   VARCHAR(100)    DEFAULT NULL,
    lock_expires_at             TIMESTAMPTZ     DEFAULT NULL,
    last_error                  TEXT            DEFAULT NULL,
    idempotency_key             VARCHAR(140)    NOT NULL,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    processed_at                TIMESTAMPTZ     DEFAULT NULL,

    PRIMARY KEY (finance_id, id),
    CONSTRAINT uq_voe_finance_idem UNIQUE (finance_id, idempotency_key),
    CONSTRAINT fk_voe_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_voe_pending
    ON voice_outbox_events (next_retry_at ASC, id)
    WHERE status = 'pending';

-- ============================================================================
-- SECTION 3: MONTHLY PARTITION PROVISIONER (Active Partitioned Tables Only)
-- ============================================================================
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
    v_tbl TEXT;
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

        FOREACH v_tbl IN ARRAY ARRAY['voice_call_summaries', 'voice_call_biometrics'] LOOP
            IF to_regclass('public.' || v_tbl) IS NOT NULL
               AND to_regclass('public.' || v_tbl || '_' || v_suffix) IS NULL THEN
                EXECUTE format(
                    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                    v_tbl || '_' || v_suffix, v_tbl, v_from_lit, v_to_lit
                );
                v_created := v_created + 1;
            END IF;
        END LOOP;
    END LOOP;

    FOREACH v_tbl IN ARRAY ARRAY['voice_call_summaries', 'voice_call_biometrics'] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL
           AND to_regclass('public.' || v_tbl || '_default') IS NULL THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I DEFAULT',
                v_tbl || '_default', v_tbl
            );
            v_created := v_created + 1;
        END IF;
    END LOOP;

    RETURN v_created;
END;
$$;

SELECT fn_ensure_voice_monthly_partitions(1, 3);

-- ============================================================================
-- SECTION 4: UPDATED TRIGGERS & RUNTIME FUNCTIONS
-- ============================================================================

-- 4.1 Exact O(1) AutoFinex EMI Due & Overdue Calculator (Drop first to prevent 42P13)
DROP FUNCTION IF EXISTS public.fn_calculate_customer_due_summary(UUID, DATE);

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

    -- Total recognized payments (excludes penalties & cancelled payments)
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

    IF v_cust.loan_status = 'close' OR v_balance <= 0.00 THEN
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

-- 4.2 PTP Status Trigger Function — Factual Counters ONLY (Zero `trust_band`)
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
        ptp_kept_count, ptp_broken_count, updated_at
    ) VALUES (
        NEW.finance_id, NEW.customer_id, NEW.loan_id,
        v_kept_inc, v_broken_inc, NOW()
    )
    ON CONFLICT (finance_id, customer_id) DO UPDATE SET
        ptp_kept_count = voice_customer_memory.ptp_kept_count + v_kept_inc,
        ptp_broken_count = voice_customer_memory.ptp_broken_count + v_broken_inc,
        updated_at = NOW();

    IF NEW.ptp_status = 'broken' THEN
        UPDATE ai_telecalling_leads
        SET call_status = CASE WHEN is_suppressed THEN call_status ELSE 'scheduled'::lead_call_status_enum END,
            scheduled_time = CURRENT_TIMESTAMP,
            priority = LEAST(10, priority + 2),
            call_outcome_note = 'Promise-to-pay broken; auto-queued for follow-up',
            updated_at = CURRENT_TIMESTAMP
        WHERE finance_id = NEW.finance_id
          AND customer_id = NEW.customer_id
          AND overdue_amount > 0
          AND is_suppressed = FALSE;
    END IF;

    RETURN NEW;
END;
$$;

-- 4.3 Customer Reconciliation (`fn_reconcile_customer_voice_state` — Cancels Callbacks & Emits Outbox on Settlement)
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
    v_active_suppression BOOLEAN := FALSE;
    v_suppressed BOOLEAN := FALSE;
    v_supp_reason VARCHAR(100) := NULL;
    v_priority SMALLINT := 5;
    v_cancelled_cb INT := 0;
BEGIN
    IF p_customer_id IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_due FROM fn_calculate_customer_due_summary(p_customer_id, CURRENT_DATE);
    IF NOT FOUND OR v_due.finance_id IS NULL THEN
        RETURN;
    END IF;

    -- 1. Reconcile active pending Promise-to-Pay rows
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

    -- 2. Authoritative Contact Suppression + Loan Status Guards
    SELECT EXISTS (
        SELECT 1
        FROM voice_contact_suppressions vcs
        WHERE vcs.finance_id = v_due.finance_id
          AND vcs.customer_id = p_customer_id
          AND vcs.channel IN ('ai_voice_calls', 'all_automated')
          AND vcs.status = 'active'
    ) INTO v_active_suppression;

    IF v_due.loan_status = 'close' THEN
        v_suppressed := TRUE;
        v_supp_reason := 'loan_closed';
    ELSIF v_due.loan_status = 'seized' THEN
        v_suppressed := TRUE;
        v_supp_reason := 'vehicle_seized';
    ELSIF v_active_suppression OR v_due.is_phone_dnc THEN
        v_suppressed := TRUE;
        v_supp_reason := 'contact_suppressed';
    END IF;

    v_priority := CASE
        WHEN v_due.days_overdue >= 30 THEN 9
        WHEN v_due.days_overdue >= 15 THEN 8
        WHEN v_due.days_overdue >= 7  THEN 7
        WHEN v_due.days_overdue >= 1  THEN 6
        ELSE 5
    END;

    -- 3. Sync `voice_callbacks`, `voice_outbox_events`, and `ai_telecalling_leads`
    IF v_due.overdue_amount <= 0.00 OR v_due.loan_status = 'close' THEN
        UPDATE voice_callbacks
        SET callback_status = 'cancelled_paid',
            cancel_reason = 'overdue_cleared',
            updated_at = NOW()
        WHERE finance_id = v_due.finance_id
          AND customer_id = p_customer_id
          AND callback_status IN ('scheduled', 'claimed');
        GET DIAGNOSTICS v_cancelled_cb = ROW_COUNT;

        IF p_payment_id IS NOT NULL OR v_cancelled_cb > 0 THEN
            INSERT INTO voice_outbox_events (
                finance_id, aggregate_type, aggregate_id, event_type,
                payload, idempotency_key
            ) VALUES (
                v_due.finance_id, 'customer', p_customer_id, 'customer.payment.reconciled',
                jsonb_build_object(
                    'customer_id', p_customer_id,
                    'payment_id', p_payment_id,
                    'overdue_amount', 0.00,
                    'callbacks_cancelled', v_cancelled_cb
                ),
                'reconciled:' || p_customer_id::TEXT || ':' || COALESCE(p_payment_id::TEXT, CURRENT_DATE::TEXT)
            )
            ON CONFLICT (finance_id, idempotency_key) DO NOTHING;
        END IF;

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
                WHEN call_status IN ('uncalled', 'scheduled', 'not_responded', 'failed')
                    THEN 'completed'::lead_call_status_enum
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
            CASE WHEN v_suppressed THEN 'suppressed'::lead_call_status_enum ELSE 'uncalled'::lead_call_status_enum END,
            v_priority, v_suppressed, v_supp_reason,
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
            call_status = CASE
                WHEN EXCLUDED.is_suppressed THEN 'suppressed'::lead_call_status_enum
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

-- 4.4 Fair Multi-Tenant Queue Claimer (`fn_claim_due_voice_leads` — Enforces TRAI Hours & Suppressions)
DROP FUNCTION IF EXISTS public.fn_claim_due_voice_leads(VARCHAR, INT, INT);

CREATE OR REPLACE FUNCTION fn_claim_due_voice_leads(
    p_worker_id VARCHAR,
    p_batch_size INT DEFAULT 10,
    p_lease_seconds INT DEFAULT 180,
    p_finance_id UUID DEFAULT NULL
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
            GREATEST(TIME '08:00', COALESCE((ais.voice_config->>'calling_window_start')::TIME, TIME '09:00')) AS win_start,
            LEAST(TIME '19:00', COALESCE((ais.voice_config->>'calling_window_end')::TIME, TIME '19:00')) AS win_end,
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
          AND (p_finance_id IS NULL OR f.id = p_finance_id)
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
    ranked_candidates AS (
        SELECT
            atl.id,
            atl.priority,
            atl.callback_requested,
            COALESCE(atl.scheduled_time, atl.created_at) AS due_ts,
            ROW_NUMBER() OVER (
                PARTITION BY atl.finance_id
                ORDER BY atl.callback_requested DESC, atl.priority DESC, COALESCE(atl.scheduled_time, atl.created_at) ASC
            ) AS tenant_rank,
            GREATEST(0, tl.max_conc - tl.active_conc) AS avail_tenant_slots
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
          AND NOT EXISTS (
              SELECT 1
              FROM voice_contact_suppressions vcs
              WHERE vcs.finance_id = atl.finance_id
                AND vcs.phone_e164 = atl.phone_e164
                AND vcs.channel IN ('ai_voice_calls', 'all_automated')
                AND vcs.status = 'active'
          )
          AND (
              atl.daily_attempt_date IS DISTINCT FROM CURRENT_DATE
              OR atl.daily_attempt_count < tl.max_att_day
          )
          AND (
              atl.last_call_at IS NULL
              OR atl.callback_requested = TRUE
              OR atl.last_call_at <= CURRENT_TIMESTAMP - (tl.retry_gap_min || ' minutes')::INTERVAL
          )
    ),
    eligible AS (
        SELECT a.id
        FROM ai_telecalling_leads a
        JOIN ranked_candidates rc ON rc.id = a.id
        WHERE rc.tenant_rank <= rc.avail_tenant_slots
        ORDER BY
            rc.tenant_rank ASC,
            rc.callback_requested DESC,
            rc.priority DESC,
            rc.due_ts ASC
        FOR UPDATE OF a SKIP LOCKED
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

-- 4.5 Identity-Gated Pre-Call Memory Bundle (`fn_get_precall_memory_bundle`)
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
    v_cb RECORD;
    v_summaries JSONB := '[]'::jsonb;
    v_facts JSONB := '[]'::jsonb;
    v_recent_limit INT := 5;
    v_token_budget INT := 450;
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

    SELECT company_rules, system_instructions, behavior_flags, escalation_policy,
           voice_config, collection_policy, COALESCE(config_version, 1) AS config_version
    INTO v_settings
    FROM ai_settings
    WHERE finance_id = p_finance_id;

    IF FOUND AND v_settings.voice_config IS NOT NULL THEN
        IF v_settings.voice_config ? 'memory_recent_calls_limit' THEN
            v_recent_limit := GREATEST(1, LEAST(6, (v_settings.voice_config->>'memory_recent_calls_limit')::INT));
        END IF;
        IF v_settings.voice_config ? 'memory_token_budget' THEN
            v_token_budget := GREATEST(150, LEAST(1000, (v_settings.voice_config->>'memory_token_budget')::INT));
        END IF;
    END IF;

    SELECT id, promised_amount, promised_date, promised_time_text, is_partial_payment, ptp_status, broken_count
    INTO v_ptp
    FROM promise_to_pay
    WHERE finance_id = p_finance_id
      AND customer_id = p_customer_id
      AND is_superseded = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT id, scheduled_at, callback_status, source, customer_note
    INTO v_cb
    FROM voice_callbacks
    WHERE finance_id = p_finance_id
      AND customer_id = p_customer_id
      AND callback_status IN ('scheduled', 'claimed', 'dialing')
    ORDER BY scheduled_at ASC
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
    INTO v_summaries
    FROM (
        SELECT call_date, language_used, outcome, summary_short,
               customer_stated_reason, commitment_summary, observable_tone,
               aggression_level, requested_human, observation_flags
        FROM voice_call_summaries
        WHERE finance_id = p_finance_id
          AND customer_id = p_customer_id
          AND is_superseded = FALSE
        ORDER BY call_date DESC
        LIMIT v_recent_limit
    ) s;

    SELECT preferred_language, language_confirmed, preferred_call_time,
           communication_style, communication_preferences, recent_interaction_digest,
           recurring_delay_reason, rolling_summary,
           total_calls, answered_calls, ptp_kept_count, ptp_broken_count,
           last_outcome, last_called_at
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

    RETURN jsonb_build_object(
        'status', 'ok',
        'memory_token_budget', v_token_budget,
        'stage_1_pre_auth', jsonb_build_object(
            'finance_name', v_cust.finance_name,
            'customer_name', v_cust.cname,
            'preferred_language', COALESCE(v_mem.preferred_language, 'ta-IN'),
            'config_version', COALESCE(v_settings.config_version, 1),
            'policy_version', COALESCE((v_settings.collection_policy->>'policy_version')::INT, 1)
        ),
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
            'latest_ptp', CASE WHEN v_ptp.id IS NOT NULL THEN row_to_json(v_ptp)::jsonb ELSE NULL END,
            'active_callback', CASE WHEN v_cb.id IS NOT NULL THEN row_to_json(v_cb)::jsonb ELSE NULL END
        ),
        'level_2_recent_summaries', v_summaries,
        'level_3_customer_memory', jsonb_build_object(
            'profile', CASE WHEN v_mem.preferred_language IS NOT NULL THEN row_to_json(v_mem)::jsonb ELSE NULL END,
            'atomic_facts', v_facts
        ),
        'collection_policy', COALESCE(v_settings.collection_policy, '{}'::jsonb),
        'tenant_settings', jsonb_build_object(
            'config_version', COALESCE(v_settings.config_version, 1),
            'company_rules', COALESCE(v_settings.company_rules, '{}'::jsonb),
            'system_instructions', v_settings.system_instructions,
            'voice_config', COALESCE(v_settings.voice_config, '{}'::jsonb)
        )
    );
END;
$$;

-- 4.6 Atomic Post-Call Completion (`fn_complete_voice_call`)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure AS sig
        FROM pg_proc
        WHERE proname = 'fn_complete_voice_call'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

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
    -- Structured Level-2 Summary
    p_summary_short VARCHAR DEFAULT NULL,
    p_stated_reason VARCHAR DEFAULT NULL,
    p_commitment_summary VARCHAR DEFAULT NULL,
    p_observable_tone VARCHAR DEFAULT 'calm',
    p_stated_facts JSONB DEFAULT '{}'::jsonb,
    p_ai_inferences JSONB DEFAULT '{}'::jsonb,
    p_summary_tokens INT DEFAULT 0,
    -- Level-3 Objective Profile Update
    p_rolling_summary TEXT DEFAULT NULL,
    p_communication_style VARCHAR DEFAULT NULL,
    p_preferred_call_time VARCHAR DEFAULT NULL,
    p_language_confirmed BOOLEAN DEFAULT NULL,
    p_recent_interaction_digest VARCHAR DEFAULT NULL,
    -- Optional Explicit Contact Suppression (Situation C ONLY)
    p_explicit_opt_out BOOLEAN DEFAULT FALSE,
    p_opt_out_excerpt VARCHAR DEFAULT NULL,
    -- Optional Promise-to-Pay / Callback
    p_promised_amount DECIMAL(15,2) DEFAULT NULL,
    p_promised_date DATE DEFAULT NULL,
    p_promised_time_text VARCHAR DEFAULT NULL,
    p_callback_at TIMESTAMPTZ DEFAULT NULL,
    -- Optional Structured Interaction Observation JSONB (folded into `voice_call_summaries`)
    p_observation JSONB DEFAULT NULL,
    -- Version & Telemetry
    p_config_version BIGINT DEFAULT NULL,
    p_policy_version INT DEFAULT NULL,
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
    v_cb_id UUID := NULL;
    v_summary_id UUID := NULL;
    v_duration_str VARCHAR(30) := NULL;
    v_final_lead_status lead_call_status_enum := p_call_status;
    v_aggression VARCHAR(20) := 'none';
    v_req_human BOOLEAN := FALSE;
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
        due_amount_at_call, config_version, policy_version,
        memory_tokens, prompt_tokens, completion_tokens,
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
        COALESCE(v_lead.overdue_amount, 0.00), p_config_version, p_policy_version,
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

    -- 2. Save Promise-to-Pay if customer committed to a date & amount
    IF p_promised_amount IS NOT NULL AND p_promised_amount > 0 AND p_promised_date IS NOT NULL THEN
        INSERT INTO promise_to_pay (
            finance_id, customer_id, loan_id, call_log_id,
            promised_amount, promised_date, promised_time_text,
            ptp_status, reason, note, policy_version, idempotency_key,
            created_at, updated_at
        ) VALUES (
            v_lead.finance_id, v_lead.customer_id, v_lead.loan_id, v_log_id,
            p_promised_amount, p_promised_date, p_promised_time_text,
            'pending', COALESCE(p_stated_reason, 'Promised via Voice AI'),
            p_outcome_note, p_policy_version, 'postcall_ptp:' || v_log_id::TEXT,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (finance_id, idempotency_key) WHERE idempotency_key IS NOT NULL
        DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id INTO v_ptp_id;
    END IF;

    -- 3. Save Callback in `voice_callbacks` if customer requested a callback
    IF p_callback_at IS NOT NULL AND NOT COALESCE(p_explicit_opt_out, FALSE) THEN
        UPDATE voice_callbacks
        SET callback_status = 'superseded',
            updated_at = NOW()
        WHERE finance_id = v_lead.finance_id
          AND customer_id = v_lead.customer_id
          AND callback_status IN ('scheduled', 'claimed', 'dialing')
          AND call_id IS DISTINCT FROM v_log_id;

        INSERT INTO voice_callbacks (
            finance_id, customer_id, loan_id, call_id, phone_e164,
            scheduled_at, callback_status, source, customer_note, idempotency_key
        ) VALUES (
            v_lead.finance_id, v_lead.customer_id, v_lead.loan_id, v_log_id, v_lead.phone_e164,
            p_callback_at, 'scheduled', 'customer_voice_request', left(p_outcome_note, 300),
            'postcall_cbk:' || v_log_id::TEXT
        )
        ON CONFLICT (finance_id, idempotency_key) WHERE idempotency_key IS NOT NULL
        DO UPDATE SET scheduled_at = EXCLUDED.scheduled_at, updated_at = NOW()
        RETURNING id INTO v_cb_id;
    END IF;

    -- 4. Save Level-2 Structured Call Summary + Observation Flags (`voice_call_summaries`)
    IF p_observation IS NOT NULL THEN
        IF COALESCE(p_observation->>'aggression_level', 'none') IN ('none', 'mild', 'moderate', 'high', 'severe_threat') THEN
            v_aggression := p_observation->>'aggression_level';
        END IF;
        v_req_human := COALESCE((p_observation->>'requested_human')::BOOLEAN, FALSE);
    END IF;

    IF p_summary_short IS NOT NULL AND btrim(p_summary_short) <> '' THEN
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
            aggression_level, requested_human, observation_flags,
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
            v_aggression,
            v_req_human,
            COALESCE(p_observation, '{}'::jsonb),
            COALESCE(p_stated_facts, '{}'::jsonb),
            COALESCE(p_ai_inferences, '{}'::jsonb),
            GREATEST(0, COALESCE(p_summary_tokens, 0))
        )
        ON CONFLICT (finance_id, call_log_id, call_date) DO UPDATE SET
            summary_short = EXCLUDED.summary_short,
            ptp_id = COALESCE(EXCLUDED.ptp_id, voice_call_summaries.ptp_id),
            commitment_summary = COALESCE(EXCLUDED.commitment_summary, voice_call_summaries.commitment_summary),
            aggression_level = EXCLUDED.aggression_level,
            requested_human = EXCLUDED.requested_human,
            observation_flags = EXCLUDED.observation_flags
        RETURNING id INTO v_summary_id;
    END IF;

    -- 5. Update Level-3 Rolling Profile (`voice_customer_memory`)
    UPDATE voice_customer_memory
    SET preferred_language = COALESCE(p_language_used, preferred_language),
        language_confirmed = COALESCE(p_language_confirmed, language_confirmed),
        preferred_call_time = COALESCE(p_preferred_call_time, preferred_call_time),
        communication_style = COALESCE(p_communication_style, communication_style),
        recent_interaction_digest = COALESCE(left(p_recent_interaction_digest, 320), recent_interaction_digest),
        recurring_delay_reason = COALESCE(p_stated_reason, recurring_delay_reason),
        rolling_summary = COALESCE(left(p_rolling_summary, 600), rolling_summary),
        updated_at = NOW()
    WHERE finance_id = v_lead.finance_id
      AND customer_id = v_lead.customer_id;

    -- 6. Explicit Opt-Out or Wrong Number -> Authoritative `voice_contact_suppressions`
    IF (COALESCE(p_explicit_opt_out, FALSE) OR p_disposition IN ('opt_out', 'wrong_number'))
       AND v_lead.phone_e164 IS NOT NULL THEN
        INSERT INTO voice_contact_suppressions (
            finance_id, customer_id, phone_e164, channel, status,
            suppression_source, reason_excerpt, source_call_id, idempotency_key
        ) VALUES (
            v_lead.finance_id, v_lead.customer_id, v_lead.phone_e164,
            'ai_voice_calls', 'active',
            CASE WHEN p_disposition = 'wrong_number' THEN 'wrong_number' ELSE 'customer_explicit_opt_out' END,
            left(COALESCE(p_opt_out_excerpt, p_outcome_note), 320),
            v_log_id,
            'supp:' || v_log_id::TEXT
        )
        ON CONFLICT (finance_id, phone_e164, channel) WHERE status = 'active'
        DO NOTHING;

        v_final_lead_status := 'suppressed';
    ELSIF p_callback_at IS NOT NULL THEN
        v_final_lead_status := 'scheduled';
    END IF;

    -- 7. Release worker lease & update `ai_telecalling_leads`
    UPDATE ai_telecalling_leads
    SET call_status = v_final_lead_status,
        last_call_at = CURRENT_TIMESTAMP,
        last_call_duration = v_duration_str,
        duration_seconds = GREATEST(0, COALESCE(p_duration_seconds, 0)),
        call_outcome_note = COALESCE(p_outcome_note, call_outcome_note),
        scheduled_time = COALESCE(p_callback_at::TIMESTAMP, scheduled_time),
        callback_requested = (p_callback_at IS NOT NULL AND NOT COALESCE(p_explicit_opt_out, FALSE)),
        ptp_id = COALESCE(v_ptp_id, ptp_id),
        locked_by = NULL,
        lock_expires_at = NULL,
        is_suppressed = CASE
            WHEN COALESCE(p_explicit_opt_out, FALSE) OR p_disposition IN ('opt_out', 'wrong_number') THEN TRUE
            ELSE is_suppressed
        END,
        suppression_reason = CASE
            WHEN COALESCE(p_explicit_opt_out, FALSE) OR p_disposition IN ('opt_out', 'wrong_number')
                THEN COALESCE(p_disposition, 'customer_explicit_opt_out')
            ELSE suppression_reason
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_lead_id;

    -- 8. Emit Transactional Outbox Event for Downstream Worker Sync
    INSERT INTO voice_outbox_events (
        finance_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
    ) VALUES (
        v_lead.finance_id, 'call_log', v_log_id, 'voice.call.completed',
        jsonb_build_object(
            'call_log_id', v_log_id,
            'lead_id', p_lead_id,
            'customer_id', v_lead.customer_id,
            'duration_seconds', GREATEST(0, COALESCE(p_duration_seconds, 0)),
            'prompt_tokens', COALESCE(p_prompt_tokens, 0),
            'completion_tokens', COALESCE(p_completion_tokens, 0),
            'callback_id', v_cb_id,
            'ptp_id', v_ptp_id
        ),
        'call_completed:' || v_log_id::TEXT
    )
    ON CONFLICT (finance_id, idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'status', 'success',
        'lead_id', p_lead_id,
        'call_log_id', v_log_id,
        'summary_id', v_summary_id,
        'ptp_id', v_ptp_id,
        'callback_id', v_cb_id,
        'call_status', v_final_lead_status
    );
END;
$$;

-- ============================================================================
-- SECTION 5: RECREATE `vw_ai_lead_calling_list` WITHOUT `trust_band`
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
    -- Appended Voice AI Columns
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
    vcm.recent_interaction_digest,
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
-- SECTION 6: ENABLE & FORCE ROW LEVEL SECURITY ON ALL ACTIVE VOICE TABLES
-- ============================================================================
DO $$
DECLARE
    v_tbl TEXT;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'voice_customer_memory',
        'voice_call_summaries',
        'voice_callbacks',
        'voice_contact_suppressions',
        'voice_outbox_events',
        'voice_speaker_profiles',
        'voice_call_biometrics'
    ] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', v_tbl);
            EXECUTE format(
                $f$CREATE POLICY tenant_isolation ON public.%I
                    USING (
                        NULLIF(current_setting('app.current_finance_id', true), '') IS NULL
                        OR finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
                    )
                    WITH CHECK (
                        NULLIF(current_setting('app.current_finance_id', true), '') IS NULL
                        OR finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
                    )$f$,
                v_tbl
            );
        END IF;
    END LOOP;
END $$;

COMMIT;

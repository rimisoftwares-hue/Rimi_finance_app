-- ============================================================================
--  AUTOFINEX VOICE AI — MIGRATION 004:
--  LEAD CALLING LIFECYCLE, S3 RECORDING METADATA, SERVER-SIDE ELIGIBILITY,
--  DUE-SUMMARY SUB_DUE GUARD & SELECT-ONLY ROLE (`autofinex_voice_ro`)
-- ============================================================================
--  Adapted directly to the verified live PostgreSQL 18.6 schema after:
--    1. 001_core_schema_fixes.sql
--    2. Autofinex_account_schema.sql + AutoFinex_final_schema.sql
--    3. 002_voice_ai_migration.sql
--    4. 003_voice_ai_policy_callbacks_outbox.sql (Lean Production Edition)
--
--  KEY GUARANTEES:
--    * 100% Idempotent: safe to run repeatedly (`IF NOT EXISTS`, guarded DDL).
--    * Atomic: wrapped inside a single `BEGIN ... COMMIT` transaction.
--    * Zero Table Bloat: adds columns/constraints/indexes to existing tables only.
--    * Run as schema owner / admin role (`avnadmin` in pgAdmin or psql).
--      After running, set a strong login password for `autofinex_voice_ro`:
--        ALTER ROLE autofinex_voice_ro WITH LOGIN PASSWORD '<strong-secret>';
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ADDITIVE COLUMNS, CONSTRAINTS & INDEXES ON EXISTING TABLES
-- ============================================================================

-- 1.1 Separate Call Lifecycle Status, Answered/Spoke Flags, Private S3 Recording
--     Metadata, Idempotency & Token/Model Telemetry on `ai_telecalling_call_logs`
ALTER TABLE public.ai_telecalling_call_logs
    ADD COLUMN IF NOT EXISTS call_lifecycle_status VARCHAR(24) NOT NULL DEFAULT 'initiated',
    ADD COLUMN IF NOT EXISTS answered BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS customer_spoke BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS recording_s3_key VARCHAR(512) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS recording_status VARCHAR(24) NOT NULL DEFAULT 'not_recorded',
    ADD COLUMN IF NOT EXISTS recording_duration_seconds INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS recording_size_bytes BIGINT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS error_detail TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS total_tokens INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tts_characters INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stt_seconds NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS llm_model VARCHAR(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS tts_model VARCHAR(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS stt_model VARCHAR(80) DEFAULT NULL;

-- Idempotent CHECK constraints on `ai_telecalling_call_logs`
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_atcl_lifecycle_status'
          AND conrelid = 'public.ai_telecalling_call_logs'::regclass
    ) THEN
        ALTER TABLE public.ai_telecalling_call_logs
            ADD CONSTRAINT chk_atcl_lifecycle_status
            CHECK (call_lifecycle_status IN (
                'initiated', 'queued', 'ringing', 'in_progress',
                'completed', 'failed', 'cancelled'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_atcl_recording_status'
          AND conrelid = 'public.ai_telecalling_call_logs'::regclass
    ) THEN
        ALTER TABLE public.ai_telecalling_call_logs
            ADD CONSTRAINT chk_atcl_recording_status
            CHECK (recording_status IN (
                'not_recorded', 'pending', 'uploading', 'ready', 'failed'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_atcl_recording_s3_prefix'
          AND conrelid = 'public.ai_telecalling_call_logs'::regclass
    ) THEN
        ALTER TABLE public.ai_telecalling_call_logs
            ADD CONSTRAINT chk_atcl_recording_s3_prefix
            CHECK (
                recording_s3_key IS NULL
                OR (
                    recording_s3_key LIKE 'voice-recordings/%'
                    AND recording_s3_key NOT LIKE '%..%'
                    AND recording_s3_key NOT LIKE 'http://%'
                    AND recording_s3_key NOT LIKE 'https://%'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_atcl_telemetry_nonneg'
          AND conrelid = 'public.ai_telecalling_call_logs'::regclass
    ) THEN
        ALTER TABLE public.ai_telecalling_call_logs
            ADD CONSTRAINT chk_atcl_telemetry_nonneg
            CHECK (
                (recording_duration_seconds IS NULL OR recording_duration_seconds >= 0)
                AND (recording_size_bytes IS NULL OR recording_size_bytes >= 0)
                AND total_tokens >= 0
                AND tts_characters >= 0
                AND stt_seconds >= 0
            );
    END IF;
END $$;

-- 1.2 Per-Tenant Lead Refresh Cooldown Tracking on `ai_settings`
--     (Supports dedicated POST /api/ai/leads/refresh cooldown; AISettings UI unchanged)
ALTER TABLE public.ai_settings
    ADD COLUMN IF NOT EXISTS leads_last_refreshed_at TIMESTAMPTZ DEFAULT NULL;

-- 1.3 Indexes for Idempotency, Active Call Lookup, KPI Summary & Server-Side Search
CREATE UNIQUE INDEX IF NOT EXISTS uq_atcl_finance_idem
    ON public.ai_telecalling_call_logs (finance_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atcl_active_lifecycle
    ON public.ai_telecalling_call_logs (finance_id, customer_id, started_at DESC)
    WHERE call_lifecycle_status IN ('initiated', 'queued', 'ringing', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_atcl_spoken_calls
    ON public.ai_telecalling_call_logs (finance_id, started_at DESC, customer_id)
    WHERE answered = TRUE AND customer_spoke = TRUE;

CREATE INDEX IF NOT EXISTS idx_customers_finance_hplno
    ON public.customers (finance_id, hplno);

CREATE INDEX IF NOT EXISTS idx_customers_finance_cname_lower
    ON public.customers (finance_id, LOWER(cname));

CREATE INDEX IF NOT EXISTS idx_vehicle_detail_finance_vehno_lower
    ON public.vehicle_detail (finance_id, LOWER(vehicle_number));

-- ============================================================================
-- SECTION 2: PATCH `fn_calculate_customer_due_summary` (CREATE OR REPLACE)
--   * Exact same parameter & RETURNS TABLE signature as live 003 schema.
--   * Strictly excludes cancelled `sub_due` (`sd.status = 'cancelled'`) and
--     cancelled `payments` (`p.payment_status = 'cancelled'`).
--   * Enforces tenant match (`finance_id = v_cust.finance_id`) on payment sums.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_calculate_customer_due_summary(
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
    installment_amount NUMERIC,
    total_installments INT,
    total_contractual_due NUMERIC,
    total_paid NUMERIC,
    total_balance_amount NUMERIC,
    due_so_far INT,
    installments_covered INT,
    pending_emi_count INT,
    overdue_amount NUMERIC,
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
    FROM public.customers c
    WHERE c.id = p_customer_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT ct.number,
           COALESCE(ct.phone_e164, public.fn_normalize_indian_phone_e164(ct.number)),
           COALESCE(ct.is_dnc, FALSE)
    INTO v_phone, v_phone_e164, v_phone_dnc
    FROM public.contacts ct
    WHERE ct.customer_id = p_customer_id
    ORDER BY
        CASE WHEN ct.contact_type = 'customer' THEN 0 ELSE 1 END,
        CASE WHEN ct.type = 'mobile' THEN 0 ELSE 1 END,
        ct.id ASC
    LIMIT 1;

    SELECT l.*
    INTO v_loan
    FROM public.loans l
    WHERE l.customer_id = p_customer_id
      AND (l.finance_id IS NULL OR l.finance_id = v_cust.finance_id)
    ORDER BY l.due_date DESC NULLS LAST, l.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            v_cust.finance_id, NULL::UUID, v_cust.loan_status,
            v_phone, v_phone_e164, v_phone_dnc,
            0.00::NUMERIC, 0, 0.00::NUMERIC, 0.00::NUMERIC,
            0.00::NUMERIC, 0, 0, 0, 0.00::NUMERIC,
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

    -- Total recognized payments (strictly excludes penalties & cancelled receipts)
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(p.amount, 0))), 0.00)
    INTO v_paid_main
    FROM public.payments p
    WHERE p.customer_id = p_customer_id
      AND (p.finance_id IS NULL OR p.finance_id = v_cust.finance_id)
      AND p.payment_status IS DISTINCT FROM 'cancelled'::active_cancelled_enum;

    -- Total recognized sub_due top-ups (strictly excludes sd.status = 'cancelled' & cancelled parent payments)
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(sd.paid_amount, 0))), 0.00)
    INTO v_paid_sub
    FROM public.sub_due sd
    JOIN public.payments p ON p.id = sd.payment_id
    WHERE sd.customer_id = p_customer_id
      AND sd.finance_id = v_cust.finance_id
      AND sd.status IS DISTINCT FROM 'cancelled'::active_cancelled_enum
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
            v_next_due := public.fn_clamped_installment_date(v_first_due, 0);
        ELSIF v_m_diff >= v_total_months THEN
            v_due_so_far := v_total_months;
            v_next_due := NULL;
        ELSE
            v_sched_date := public.fn_clamped_installment_date(v_first_due, v_m_diff);
            IF v_sched_date <= p_as_of_date THEN
                v_due_so_far := v_m_diff + 1;
                v_next_due := CASE
                    WHEN (v_m_diff + 1) < v_total_months
                        THEN public.fn_clamped_installment_date(v_first_due, v_m_diff + 1)
                    ELSE NULL
                END;
            ELSE
                v_due_so_far := v_m_diff;
                v_next_due := v_sched_date;
            END IF;
        END IF;

        IF v_covered >= 0 AND v_covered < v_total_months THEN
            v_earliest_unpaid := public.fn_clamped_installment_date(v_first_due, v_covered);
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
        v_inst_amt::NUMERIC,
        v_total_months,
        v_total_due::NUMERIC,
        v_total_paid::NUMERIC,
        v_balance::NUMERIC,
        v_due_so_far,
        v_covered,
        v_pending_emi,
        v_overdue::NUMERIC,
        CASE WHEN v_overdue > 0 THEN v_earliest_unpaid ELSE NULL END,
        v_next_due,
        CASE
            WHEN v_overdue > 0 AND v_earliest_unpaid IS NOT NULL AND p_as_of_date > v_earliest_unpaid
                THEN (p_as_of_date - v_earliest_unpaid)::INT
            ELSE 0
        END;
END;
$$;

-- ============================================================================
-- SECTION 3: SERVER-SIDE CALL ELIGIBILITY & RATE-LIMIT FUNCTION
--   Enforces:
--     1. Tenant & customer/loan ownership
--     2. Live unpaid overdue balance & valid mobile number
--     3. DNC / contact suppression (`contacts`, `ai_telecalling_leads`, `voice_contact_suppressions`)
--     4. In-flight active call lock
--     5. Calling window in tenant timezone (IST default 09:00-18:00, configurable per tenant)
--     6. Max attempts per customer per day (default 2, configurable per tenant)
--     7. Cooldown between attempts (default 120m, configurable per tenant)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_check_voice_call_eligibility(
    p_finance_id UUID,
    p_customer_id UUID,
    p_loan_id UUID DEFAULT NULL,
    p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cust RECORD;
    v_due RECORD;
    v_lead RECORD;
    v_voice_cfg JSONB := '{}'::jsonb;
    v_tz TEXT := 'Asia/Kolkata';
    v_win_start TIME := TIME '09:00';
    v_win_end TIME := TIME '18:00';
    v_max_attempts_day INT := 2;
    v_cooldown_minutes INT := 120;
    v_local_date DATE;
    v_local_time TIME;
    v_is_suppressed BOOLEAN := FALSE;
    v_has_active_call BOOLEAN := FALSE;
    v_log_attempts_today INT := 0;
    v_effective_attempts_today INT := 0;
    v_last_attempt_at TIMESTAMPTZ := NULL;
    v_lead_last_at TIMESTAMPTZ := NULL;
    v_next_eligible_at TIMESTAMPTZ := NULL;
    v_cooldown_rem_sec INT := 0;
    v_db_tz TEXT := current_setting('TIMEZONE');
    v_ctx_fin TEXT := NULLIF(current_setting('app.current_finance_id', true), '');
BEGIN
    -- 0. Fail-closed tenant context guard (especially for `autofinex_voice_ro` under RESTRICTIVE RLS)
    IF v_ctx_fin IS NOT NULL AND v_ctx_fin::UUID IS DISTINCT FROM p_finance_id THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'tenant_context_mismatch',
            'message', 'Session app.current_finance_id does not match requested finance_id.'
        );
    END IF;

    IF current_user = 'autofinex_voice_ro' AND v_ctx_fin IS NULL THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'missing_tenant_context',
            'message', 'autofinex_voice_ro must set app.current_finance_id before checking call eligibility.'
        );
    END IF;

    -- 1. Validate tenant & customer ownership
    SELECT c.id, c.finance_id, c.loan_status, f.is_active AS tenant_active
    INTO v_cust
    FROM public.customers c
    JOIN public.finance_detail f ON f.id = c.finance_id
    WHERE c.id = p_customer_id
      AND c.finance_id = p_finance_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'customer_not_found',
            'message', 'Customer not found for authorized finance tenant.'
        );
    END IF;

    IF COALESCE(v_cust.tenant_active, 0) <> 1 THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'tenant_inactive',
            'message', 'Finance company tenant is inactive.'
        );
    END IF;

    IF p_loan_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.loans l
        WHERE l.id = p_loan_id
          AND l.customer_id = p_customer_id
          AND (l.finance_id IS NULL OR l.finance_id = p_finance_id)
    ) THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'loan_not_found',
            'message', 'Specified loan does not belong to this customer and tenant.'
        );
    END IF;

    -- 2. Resolve configurable per-tenant calling policy from `ai_settings.voice_config`
    SELECT COALESCE(ais.voice_config, '{}'::jsonb)
    INTO v_voice_cfg
    FROM public.ai_settings ais
    WHERE ais.finance_id = p_finance_id;

    IF v_voice_cfg ? 'timezone' AND EXISTS (
        SELECT 1 FROM pg_timezone_names WHERE name = btrim(v_voice_cfg->>'timezone')
    ) THEN
        v_tz := btrim(v_voice_cfg->>'timezone');
    END IF;

    IF (v_voice_cfg->>'calling_window_start') ~ '^\d{2}:\d{2}(:\d{2})?$' THEN
        v_win_start := (v_voice_cfg->>'calling_window_start')::TIME;
    END IF;

    IF (v_voice_cfg->>'calling_window_end') ~ '^\d{2}:\d{2}(:\d{2})?$' THEN
        v_win_end := (v_voice_cfg->>'calling_window_end')::TIME;
    END IF;

    IF (v_voice_cfg->>'max_attempts_per_day') ~ '^\d+$' THEN
        v_max_attempts_day := GREATEST(1, LEAST(10, (v_voice_cfg->>'max_attempts_per_day')::INT));
    END IF;

    IF (v_voice_cfg->>'attempt_cooldown_minutes') ~ '^\d+$' THEN
        v_cooldown_minutes := GREATEST(0, LEAST(1440, (v_voice_cfg->>'attempt_cooldown_minutes')::INT));
    ELSIF (v_voice_cfg->>'min_retry_gap_minutes') ~ '^\d+$' THEN
        v_cooldown_minutes := GREATEST(0, LEAST(1440, (v_voice_cfg->>'min_retry_gap_minutes')::INT));
    END IF;

    v_local_date := (p_now AT TIME ZONE v_tz)::DATE;
    v_local_time := (p_now AT TIME ZONE v_tz)::TIME;

    -- 3. Live financial & phone check
    SELECT * INTO v_due
    FROM public.fn_calculate_customer_due_summary(p_customer_id, v_local_date);

    IF v_due.loan_status = 'close' THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'loan_closed',
            'message', 'Customer loan is already closed.'
        );
    END IF;

    IF v_due.loan_status = 'seized' THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'vehicle_seized',
            'message', 'Vehicle is marked seized; automated calling is blocked.'
        );
    END IF;

    IF COALESCE(v_due.overdue_amount, 0) <= 0 THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'no_overdue_balance',
            'message', 'Customer has no overdue EMI balance.'
        );
    END IF;

    IF v_due.phone_e164 IS NULL THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'invalid_or_missing_phone',
            'message', 'Customer does not have a valid Indian mobile number.'
        );
    END IF;

    -- 4. Load optional `ai_telecalling_leads` row & check suppressions
    SELECT * INTO v_lead
    FROM public.ai_telecalling_leads atl
    WHERE atl.finance_id = p_finance_id
      AND atl.customer_id = p_customer_id;

    SELECT (
        COALESCE(v_due.is_phone_dnc, FALSE)
        OR COALESCE(v_lead.is_suppressed, FALSE)
        OR EXISTS (
            SELECT 1
            FROM public.voice_contact_suppressions vcs
            WHERE vcs.finance_id = p_finance_id
              AND (vcs.customer_id = p_customer_id OR vcs.phone_e164 = v_due.phone_e164)
              AND vcs.channel IN ('ai_voice_calls', 'all_automated')
              AND vcs.status = 'active'
        )
    ) INTO v_is_suppressed;

    IF v_is_suppressed THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'contact_suppressed',
            'message', 'Customer or phone number is on Do-Not-Call / suppression list.'
        );
    END IF;

    -- 5. Check active in-flight call
    SELECT (
        COALESCE(v_lead.call_status IN ('connecting', 'speaking'), FALSE)
        OR (v_lead.lock_expires_at IS NOT NULL AND v_lead.lock_expires_at > p_now)
        OR EXISTS (
            SELECT 1
            FROM public.ai_telecalling_call_logs cl
            WHERE cl.finance_id = p_finance_id
              AND cl.customer_id = p_customer_id
              AND cl.call_lifecycle_status IN ('initiated', 'queued', 'ringing', 'in_progress')
              AND (cl.started_at AT TIME ZONE v_db_tz) >= (p_now - INTERVAL '30 minutes')
        )
    ) INTO v_has_active_call;

    IF v_has_active_call THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'call_already_in_progress',
            'message', 'A call is already active for this customer.'
        );
    END IF;

    -- 6. Calling window check (default 09:00-18:00 IST, configurable per tenant)
    IF NOT (v_local_time >= v_win_start AND v_local_time <= v_win_end) THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'outside_calling_window',
            'message', format('Calls are allowed only between %s and %s (%s).', v_win_start, v_win_end, v_tz),
            'timezone', v_tz,
            'local_time', v_local_time::TEXT,
            'calling_window_start', v_win_start::TEXT,
            'calling_window_end', v_win_end::TEXT
        );
    END IF;

    -- 7. Max attempts per customer per day & cooldown between attempts
    SELECT
        COUNT(*) FILTER (
            WHERE ((cl.started_at AT TIME ZONE v_db_tz) AT TIME ZONE v_tz)::DATE = v_local_date
              AND cl.call_lifecycle_status <> 'cancelled'
        ),
        MAX(COALESCE(cl.ended_at, cl.started_at) AT TIME ZONE v_db_tz)
            FILTER (WHERE cl.call_lifecycle_status <> 'cancelled')
    INTO v_log_attempts_today, v_last_attempt_at
    FROM public.ai_telecalling_call_logs cl
    WHERE cl.finance_id = p_finance_id
      AND cl.customer_id = p_customer_id;

    v_effective_attempts_today := GREATEST(
        COALESCE(v_log_attempts_today, 0),
        CASE
            WHEN v_lead.daily_attempt_date = v_local_date THEN COALESCE(v_lead.daily_attempt_count, 0)
            ELSE 0
        END
    );

    IF v_effective_attempts_today >= v_max_attempts_day THEN
        RETURN jsonb_build_object(
            'eligible', FALSE,
            'reason_code', 'max_daily_attempts_reached',
            'message', format('Daily call attempt limit reached (%s/%s today).', v_effective_attempts_today, v_max_attempts_day),
            'attempts_today', v_effective_attempts_today,
            'max_attempts_per_day', v_max_attempts_day
        );
    END IF;

    IF v_lead.last_call_at IS NOT NULL THEN
        v_lead_last_at := (v_lead.last_call_at AT TIME ZONE v_db_tz);
        IF v_last_attempt_at IS NULL OR v_lead_last_at > v_last_attempt_at THEN
            v_last_attempt_at := v_lead_last_at;
        END IF;
    END IF;

    IF v_cooldown_minutes > 0 AND v_last_attempt_at IS NOT NULL THEN
        v_next_eligible_at := v_last_attempt_at + make_interval(mins => v_cooldown_minutes);
        IF p_now < v_next_eligible_at THEN
            v_cooldown_rem_sec := CEIL(EXTRACT(EPOCH FROM (v_next_eligible_at - p_now)))::INT;
            RETURN jsonb_build_object(
                'eligible', FALSE,
                'reason_code', 'cooldown_active',
                'message', format('Attempt cooldown active. Retry allowed in %s minutes.', CEIL(v_cooldown_rem_sec / 60.0)::INT),
                'cooldown_minutes', v_cooldown_minutes,
                'cooldown_remaining_seconds', v_cooldown_rem_sec,
                'next_eligible_at', v_next_eligible_at
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'eligible', TRUE,
        'reason_code', 'ok',
        'loan_id', COALESCE(p_loan_id, v_due.loan_id),
        'phone_e164', v_due.phone_e164,
        'overdue_amount', v_due.overdue_amount,
        'days_overdue', v_due.days_overdue,
        'attempts_today', v_effective_attempts_today,
        'max_attempts_per_day', v_max_attempts_day,
        'cooldown_minutes', v_cooldown_minutes,
        'timezone', v_tz,
        'calling_window_start', v_win_start::TEXT,
        'calling_window_end', v_win_end::TEXT,
        'tts_model', COALESCE(NULLIF(btrim(v_voice_cfg->>'tts_model'), ''), 'bulbul:v4'),
        'stt_model', NULLIF(btrim(v_voice_cfg->>'stt_model'), ''),
        'llm_model', NULLIF(btrim(v_voice_cfg->>'llm_model'), '')
    );
END;
$$;

-- Align `fn_claim_due_voice_leads` default calling_window_end to 18:00 IST as well
CREATE OR REPLACE FUNCTION public.fn_claim_due_voice_leads(
    p_worker_id VARCHAR,
    p_batch_size INT DEFAULT 10,
    p_lease_seconds INT DEFAULT 180,
    p_finance_id UUID DEFAULT NULL
)
RETURNS SETOF public.ai_telecalling_leads
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH tenant_limits AS (
        SELECT
            f.id AS finance_id,
            COALESCE((ais.voice_config->>'enabled')::BOOLEAN, TRUE) AS voice_enabled,
            GREATEST(TIME '08:00', COALESCE((ais.voice_config->>'calling_window_start')::TIME, TIME '09:00')) AS win_start,
            LEAST(TIME '19:00', COALESCE((ais.voice_config->>'calling_window_end')::TIME, TIME '18:00')) AS win_end,
            COALESCE(ais.voice_config->>'timezone', 'Asia/Kolkata') AS tz,
            COALESCE((ais.voice_config->>'max_concurrent_calls')::INT, 3) AS max_conc,
            COALESCE((ais.voice_config->>'max_daily_calls')::INT, 100) AS max_daily,
            COALESCE((ais.voice_config->>'max_attempts_per_day')::INT, 2) AS max_att_day,
            COALESCE(
                (ais.voice_config->>'attempt_cooldown_minutes')::INT,
                (ais.voice_config->>'min_retry_gap_minutes')::INT,
                180
            ) AS retry_gap_min,
            (
                SELECT COUNT(*)
                FROM public.ai_telecalling_leads a2
                WHERE a2.finance_id = f.id
                  AND (
                      a2.call_status IN ('connecting', 'speaking')
                      OR (a2.lock_expires_at IS NOT NULL AND a2.lock_expires_at > NOW())
                  )
            ) AS active_conc,
            (
                SELECT COUNT(*)
                FROM public.ai_telecalling_call_logs cl
                WHERE cl.finance_id = f.id
                  AND ((cl.started_at AT TIME ZONE current_setting('TIMEZONE')) AT TIME ZONE 'Asia/Kolkata')::DATE
                      = (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
            ) AS calls_today
        FROM public.finance_detail f
        LEFT JOIN public.ai_settings ais ON ais.finance_id = f.id
        WHERE f.is_active = 1
          AND (p_finance_id IS NULL OR f.id = p_finance_id)
          AND EXISTS (
              SELECT 1
              FROM public.ai_telecalling_leads q
              WHERE q.finance_id = f.id
                AND q.call_status IN ('uncalled', 'scheduled', 'not_responded', 'failed')
                AND q.is_suppressed = FALSE
                AND q.overdue_amount > 0
          )
          AND public.has_feature(f.owner_id, 'ai_voice_agent')
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
        FROM public.ai_telecalling_leads atl
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
              FROM public.voice_contact_suppressions vcs
              WHERE vcs.finance_id = atl.finance_id
                AND vcs.phone_e164 = atl.phone_e164
                AND vcs.channel IN ('ai_voice_calls', 'all_automated')
                AND vcs.status = 'active'
          )
          AND (
              atl.daily_attempt_date IS DISTINCT FROM (NOW() AT TIME ZONE tl.tz)::DATE
              OR atl.daily_attempt_count < tl.max_att_day
          )
          AND (
              atl.last_call_at IS NULL
              OR atl.callback_requested = TRUE
              OR (atl.last_call_at AT TIME ZONE current_setting('TIMEZONE'))
                 <= NOW() - make_interval(mins => tl.retry_gap_min)
          )
    ),
    eligible AS (
        SELECT a.id
        FROM public.ai_telecalling_leads a
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
    UPDATE public.ai_telecalling_leads target
    SET call_status = 'connecting',
        locked_by = p_worker_id,
        lock_expires_at = NOW() + make_interval(secs => p_lease_seconds),
        attempt_count = target.attempt_count + 1,
        daily_attempt_count = CASE
            WHEN target.daily_attempt_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
                THEN target.daily_attempt_count + 1
            ELSE 1
        END,
        daily_attempt_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE,
        updated_at = CURRENT_TIMESTAMP
    FROM eligible
    WHERE target.id = eligible.id
    RETURNING target.*;
END;
$$;

-- ============================================================================
-- SECTION 3.3: TWO-STEP CALL LIFECYCLE TRIGGERS & `fn_complete_voice_call`
--   * Supports inserting an `'initiated'` row when "Call Now" starts and
--     updating it to `'completed'` / `'failed'` on post-call completion.
--   * Ensures `ai_conversations`, `ai_messages`, `voice_customer_memory`,
--     S3 recording metadata, model names, and token telemetry stay accurate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_trg_voice_call_log_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_conv_id UUID;
    v_conv_status ai_conversation_status_enum;
BEGIN
    NEW.total_tokens := GREATEST(
        COALESCE(NEW.total_tokens, 0),
        COALESCE(NEW.memory_tokens, 0) + COALESCE(NEW.prompt_tokens, 0) + COALESCE(NEW.completion_tokens, 0)
    );

    IF NEW.conversation_id IS NULL
       AND NEW.transcript IS NOT NULL
       AND jsonb_typeof(NEW.transcript) = 'array'
       AND jsonb_array_length(NEW.transcript) > 0 THEN
        v_conv_status := CASE
            WHEN NEW.disposition IN ('dispute', 'escalated') THEN 'escalated'::ai_conversation_status_enum
            WHEN NEW.call_status = 'completed' THEN 'resolved'::ai_conversation_status_enum
            ELSE 'pending'::ai_conversation_status_enum
        END;

        INSERT INTO public.ai_conversations (
            finance_id, customer_id, user_id, channel, title,
            sentiment, status, risk_score, tags, created_at, updated_at
        ) VALUES (
            NEW.finance_id, NEW.customer_id, NEW.called_by_user_id, 'voice_call',
            COALESCE(NEW.disposition, 'EMI Voice Call'),
            COALESCE(NEW.sentiment, 'neutral'),
            v_conv_status,
            public.fn_get_customer_risk_score(NEW.customer_id),
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

DROP TRIGGER IF EXISTS trg_voice_call_log_before_insert ON public.ai_telecalling_call_logs;
CREATE TRIGGER trg_voice_call_log_before_insert
BEFORE INSERT OR UPDATE ON public.ai_telecalling_call_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_voice_call_log_before_insert();

CREATE OR REPLACE FUNCTION public.fn_trg_voice_call_log_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_elem JSONB;
    v_sender ai_sender_type_enum;
    v_new_ans BOOLEAN := (COALESCE(NEW.answered, FALSE) OR (COALESCE(NEW.call_duration_seconds, 0) > 0 AND NEW.call_status = 'completed'));
    v_old_ans BOOLEAN := FALSE;
    v_calls_inc INT := CASE WHEN NEW.call_lifecycle_status = 'cancelled' THEN 0 ELSE 1 END;
    v_ans_inc INT := CASE WHEN v_new_ans THEN 1 ELSE 0 END;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.conversation_id IS NOT NULL AND NEW.transcript IS NOT NULL AND jsonb_typeof(NEW.transcript) = 'array' THEN
            FOR v_elem IN SELECT * FROM jsonb_array_elements(NEW.transcript) LOOP
                v_sender := CASE
                    WHEN lower(COALESCE(v_elem->>'speaker', v_elem->>'sender', v_elem->>'role', 'ai')) IN ('customer', 'user')
                        THEN 'customer'::ai_sender_type_enum
                    ELSE 'ai'::ai_sender_type_enum
                END;
                IF COALESCE(v_elem->>'text', '') <> '' THEN
                    INSERT INTO public.ai_messages (
                        conversation_id, sender_type, message_text, payload, sentiment, created_at
                    ) VALUES (
                        NEW.conversation_id, v_sender, v_elem->>'text',
                        jsonb_build_object('time', v_elem->>'time', 'call_log_id', NEW.id),
                        NEW.sentiment, CURRENT_TIMESTAMP
                    );
                END IF;
            END LOOP;
        END IF;

        INSERT INTO public.voice_customer_memory (
            finance_id, customer_id, active_loan_id, preferred_language,
            total_calls, answered_calls, last_call_log_id, last_outcome, last_called_at, updated_at
        ) VALUES (
            NEW.finance_id, NEW.customer_id, NEW.loan_id, COALESCE(NEW.language_used, 'ta-IN'),
            v_calls_inc, v_ans_inc, NEW.id, COALESCE(NEW.disposition, NEW.call_status::TEXT), NOW(), NOW()
        )
        ON CONFLICT (finance_id, customer_id) DO UPDATE SET
            active_loan_id = COALESCE(EXCLUDED.active_loan_id, public.voice_customer_memory.active_loan_id),
            total_calls = public.voice_customer_memory.total_calls + v_calls_inc,
            answered_calls = public.voice_customer_memory.answered_calls + v_ans_inc,
            last_call_log_id = NEW.id,
            last_outcome = COALESCE(NEW.disposition, NEW.call_status::TEXT),
            last_called_at = NOW(),
            updated_at = NOW();
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.conversation_id IS NULL
           AND NEW.conversation_id IS NOT NULL
           AND NEW.transcript IS NOT NULL
           AND jsonb_typeof(NEW.transcript) = 'array' THEN
            FOR v_elem IN SELECT * FROM jsonb_array_elements(NEW.transcript) LOOP
                v_sender := CASE
                    WHEN lower(COALESCE(v_elem->>'speaker', v_elem->>'sender', v_elem->>'role', 'ai')) IN ('customer', 'user')
                        THEN 'customer'::ai_sender_type_enum
                    ELSE 'ai'::ai_sender_type_enum
                END;
                IF COALESCE(v_elem->>'text', '') <> '' THEN
                    INSERT INTO public.ai_messages (
                        conversation_id, sender_type, message_text, payload, sentiment, created_at
                    ) VALUES (
                        NEW.conversation_id, v_sender, v_elem->>'text',
                        jsonb_build_object('time', v_elem->>'time', 'call_log_id', NEW.id),
                        NEW.sentiment, CURRENT_TIMESTAMP
                    );
                END IF;
            END LOOP;
        END IF;

        v_old_ans := (COALESCE(OLD.answered, FALSE) OR (COALESCE(OLD.call_duration_seconds, 0) > 0 AND OLD.call_status = 'completed'));
        v_ans_inc := CASE WHEN (NOT v_old_ans AND v_new_ans) THEN 1 ELSE 0 END;

        UPDATE public.voice_customer_memory
        SET answered_calls = answered_calls + v_ans_inc,
            last_call_log_id = NEW.id,
            last_outcome = COALESCE(NEW.disposition, NEW.call_status::TEXT, last_outcome),
            updated_at = NOW()
        WHERE finance_id = NEW.finance_id
          AND customer_id = NEW.customer_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_call_log_after_insert ON public.ai_telecalling_call_logs;
CREATE TRIGGER trg_voice_call_log_after_insert
AFTER INSERT OR UPDATE ON public.ai_telecalling_call_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_voice_call_log_after_insert();

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_complete_voice_call'
          AND p.pronargs <> 52
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fn_complete_voice_call(
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
    p_barge_in_count INT DEFAULT 0,
    -- 004 Lifecycle, Private S3 Recording & Model/Token Telemetry
    p_call_lifecycle_status VARCHAR DEFAULT NULL,
    p_answered BOOLEAN DEFAULT NULL,
    p_customer_spoke BOOLEAN DEFAULT NULL,
    p_recording_s3_key VARCHAR DEFAULT NULL,
    p_recording_status VARCHAR DEFAULT NULL,
    p_recording_duration_seconds INT DEFAULT NULL,
    p_recording_size_bytes BIGINT DEFAULT NULL,
    p_error_detail TEXT DEFAULT NULL,
    p_total_tokens INT DEFAULT NULL,
    p_tts_characters INT DEFAULT 0,
    p_stt_seconds NUMERIC DEFAULT 0.00,
    p_llm_model VARCHAR DEFAULT NULL,
    p_tts_model VARCHAR DEFAULT NULL,
    p_stt_model VARCHAR DEFAULT NULL
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
    v_lifecycle VARCHAR(24);
    v_answered BOOLEAN;
    v_spoke BOOLEAN;
    v_rec_status VARCHAR(24);
    v_tot_tokens INT;
BEGIN
    SELECT * INTO v_lead FROM public.ai_telecalling_leads WHERE id = p_lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Lead not found');
    END IF;

    IF p_duration_seconds > 0 THEN
        v_duration_str := (p_duration_seconds / 60)::TEXT || 'm ' || (p_duration_seconds % 60)::TEXT || 's';
    END IF;

    v_lifecycle := CASE
        WHEN p_call_lifecycle_status IN ('completed', 'failed', 'cancelled') THEN p_call_lifecycle_status
        WHEN p_call_status = 'failed' THEN 'failed'
        ELSE 'completed'
    END;

    v_spoke := COALESCE(
        p_customer_spoke,
        EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
                CASE WHEN p_transcript IS NOT NULL AND jsonb_typeof(p_transcript) = 'array'
                     THEN p_transcript ELSE '[]'::jsonb END
            ) elem
            WHERE lower(COALESCE(elem->>'speaker', elem->>'sender', elem->>'role', '')) IN ('customer', 'user')
              AND COALESCE(btrim(elem->>'text'), '') <> ''
        )
    );

    v_answered := COALESCE(
        p_answered,
        (v_spoke OR COALESCE(p_duration_seconds, 0) > 0 OR p_call_status = 'completed')
    );

    v_rec_status := CASE
        WHEN p_recording_status IN ('not_recorded', 'pending', 'uploading', 'ready', 'failed') THEN p_recording_status
        WHEN p_recording_s3_key IS NOT NULL THEN 'ready'
        ELSE 'not_recorded'
    END;

    v_tot_tokens := GREATEST(
        COALESCE(p_total_tokens, 0),
        COALESCE(p_memory_tokens, 0) + COALESCE(p_prompt_tokens, 0) + COALESCE(p_completion_tokens, 0) + COALESCE(p_summary_tokens, 0)
    );

    -- 1. Idempotent Insert/Upsert into `ai_telecalling_call_logs`
    INSERT INTO public.ai_telecalling_call_logs (
        lead_id, finance_id, customer_id, loan_id, provider_call_id, phone_e164,
        call_status, call_lifecycle_status, answered, customer_spoke,
        call_duration_seconds, started_at, ended_at,
        transcript, call_outcome_note, disposition, audio_recording_url,
        recording_s3_key, recording_status, recording_duration_seconds, recording_size_bytes, error_detail,
        caller_type, language_used, sentiment, identity_verified,
        due_amount_at_call, config_version, policy_version,
        memory_tokens, prompt_tokens, completion_tokens, total_tokens,
        tts_characters, stt_seconds, llm_model, tts_model, stt_model,
        greeting_latency_ms, turn_latency_p50_ms, barge_in_count, created_at
    ) VALUES (
        p_lead_id, v_lead.finance_id, v_lead.customer_id, v_lead.loan_id,
        p_provider_call_id, v_lead.phone_e164,
        p_call_status, v_lifecycle, v_answered, v_spoke,
        GREATEST(0, COALESCE(p_duration_seconds, 0)),
        CURRENT_TIMESTAMP - make_interval(secs => GREATEST(0, COALESCE(p_duration_seconds, 0))),
        CURRENT_TIMESTAMP,
        COALESCE(p_transcript, '[]'::jsonb), p_outcome_note, p_disposition, p_audio_url,
        p_recording_s3_key, v_rec_status, p_recording_duration_seconds, p_recording_size_bytes, p_error_detail,
        'ai_bot', COALESCE(p_language_used, 'ta-IN'), COALESCE(p_sentiment, 'neutral'),
        COALESCE(p_identity_verified, FALSE),
        COALESCE(v_lead.overdue_amount, 0.00), p_config_version, p_policy_version,
        GREATEST(0, COALESCE(p_memory_tokens, 0)),
        GREATEST(0, COALESCE(p_prompt_tokens, 0)),
        GREATEST(0, COALESCE(p_completion_tokens, 0)),
        v_tot_tokens,
        GREATEST(0, COALESCE(p_tts_characters, 0)),
        GREATEST(0.00, COALESCE(p_stt_seconds, 0.00)),
        p_llm_model, COALESCE(p_tts_model, 'bulbul:v4'), p_stt_model,
        p_greeting_latency_ms, p_turn_latency_p50_ms, GREATEST(0, COALESCE(p_barge_in_count, 0)),
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (provider_call_id) WHERE provider_call_id IS NOT NULL
    DO UPDATE SET
        call_status = EXCLUDED.call_status,
        call_lifecycle_status = EXCLUDED.call_lifecycle_status,
        answered = (public.ai_telecalling_call_logs.answered OR EXCLUDED.answered),
        customer_spoke = (public.ai_telecalling_call_logs.customer_spoke OR EXCLUDED.customer_spoke),
        call_duration_seconds = GREATEST(public.ai_telecalling_call_logs.call_duration_seconds, EXCLUDED.call_duration_seconds),
        ended_at = EXCLUDED.ended_at,
        transcript = CASE
            WHEN jsonb_typeof(EXCLUDED.transcript) = 'array' AND jsonb_array_length(EXCLUDED.transcript) > 0
                THEN EXCLUDED.transcript
            ELSE public.ai_telecalling_call_logs.transcript
        END,
        call_outcome_note = COALESCE(EXCLUDED.call_outcome_note, public.ai_telecalling_call_logs.call_outcome_note),
        disposition = COALESCE(EXCLUDED.disposition, public.ai_telecalling_call_logs.disposition),
        audio_recording_url = COALESCE(EXCLUDED.audio_recording_url, public.ai_telecalling_call_logs.audio_recording_url),
        recording_s3_key = COALESCE(EXCLUDED.recording_s3_key, public.ai_telecalling_call_logs.recording_s3_key),
        recording_status = CASE
            WHEN EXCLUDED.recording_status <> 'not_recorded' THEN EXCLUDED.recording_status
            ELSE public.ai_telecalling_call_logs.recording_status
        END,
        recording_duration_seconds = COALESCE(EXCLUDED.recording_duration_seconds, public.ai_telecalling_call_logs.recording_duration_seconds),
        recording_size_bytes = COALESCE(EXCLUDED.recording_size_bytes, public.ai_telecalling_call_logs.recording_size_bytes),
        error_detail = COALESCE(EXCLUDED.error_detail, public.ai_telecalling_call_logs.error_detail),
        language_used = COALESCE(EXCLUDED.language_used, public.ai_telecalling_call_logs.language_used),
        sentiment = COALESCE(EXCLUDED.sentiment, public.ai_telecalling_call_logs.sentiment),
        identity_verified = (public.ai_telecalling_call_logs.identity_verified OR EXCLUDED.identity_verified),
        config_version = COALESCE(EXCLUDED.config_version, public.ai_telecalling_call_logs.config_version),
        policy_version = COALESCE(EXCLUDED.policy_version, public.ai_telecalling_call_logs.policy_version),
        memory_tokens = GREATEST(public.ai_telecalling_call_logs.memory_tokens, EXCLUDED.memory_tokens),
        prompt_tokens = GREATEST(public.ai_telecalling_call_logs.prompt_tokens, EXCLUDED.prompt_tokens),
        completion_tokens = GREATEST(public.ai_telecalling_call_logs.completion_tokens, EXCLUDED.completion_tokens),
        total_tokens = GREATEST(public.ai_telecalling_call_logs.total_tokens, EXCLUDED.total_tokens),
        tts_characters = GREATEST(public.ai_telecalling_call_logs.tts_characters, EXCLUDED.tts_characters),
        stt_seconds = GREATEST(public.ai_telecalling_call_logs.stt_seconds, EXCLUDED.stt_seconds),
        llm_model = COALESCE(EXCLUDED.llm_model, public.ai_telecalling_call_logs.llm_model),
        tts_model = COALESCE(EXCLUDED.tts_model, public.ai_telecalling_call_logs.tts_model),
        stt_model = COALESCE(EXCLUDED.stt_model, public.ai_telecalling_call_logs.stt_model),
        greeting_latency_ms = COALESCE(EXCLUDED.greeting_latency_ms, public.ai_telecalling_call_logs.greeting_latency_ms),
        turn_latency_p50_ms = COALESCE(EXCLUDED.turn_latency_p50_ms, public.ai_telecalling_call_logs.turn_latency_p50_ms),
        barge_in_count = GREATEST(public.ai_telecalling_call_logs.barge_in_count, EXCLUDED.barge_in_count)
    RETURNING id, started_at INTO v_log_id, v_log_started_at;

    v_call_ts := COALESCE((v_log_started_at AT TIME ZONE current_setting('TIMEZONE')), NOW());

    -- 2. Save Promise-to-Pay if customer committed to a date & amount
    IF p_promised_amount IS NOT NULL AND p_promised_amount > 0 AND p_promised_date IS NOT NULL THEN
        INSERT INTO public.promise_to_pay (
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
        UPDATE public.voice_callbacks
        SET callback_status = 'superseded',
            updated_at = NOW()
        WHERE finance_id = v_lead.finance_id
          AND customer_id = v_lead.customer_id
          AND callback_status IN ('scheduled', 'claimed', 'dialing')
          AND call_id IS DISTINCT FROM v_log_id;

        INSERT INTO public.voice_callbacks (
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
            UPDATE public.voice_call_summaries
            SET is_superseded = TRUE
            WHERE finance_id = v_lead.finance_id
              AND customer_id = v_lead.customer_id
              AND outcome IN ('ptp_confirmed', 'part_payment_promised')
              AND is_superseded = FALSE;
        END IF;

        INSERT INTO public.voice_call_summaries (
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
            ptp_id = COALESCE(EXCLUDED.ptp_id, public.voice_call_summaries.ptp_id),
            commitment_summary = COALESCE(EXCLUDED.commitment_summary, public.voice_call_summaries.commitment_summary),
            aggression_level = EXCLUDED.aggression_level,
            requested_human = EXCLUDED.requested_human,
            observation_flags = EXCLUDED.observation_flags
        RETURNING id INTO v_summary_id;
    END IF;

    -- 5. Update Level-3 Rolling Profile (`voice_customer_memory`)
    UPDATE public.voice_customer_memory
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
        INSERT INTO public.voice_contact_suppressions (
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
    UPDATE public.ai_telecalling_leads
    SET call_status = v_final_lead_status,
        last_call_at = CURRENT_TIMESTAMP,
        last_call_duration = v_duration_str,
        duration_seconds = GREATEST(0, COALESCE(p_duration_seconds, 0)),
        call_outcome_note = COALESCE(p_outcome_note, call_outcome_note),
        scheduled_time = COALESCE((p_callback_at AT TIME ZONE current_setting('TIMEZONE')), scheduled_time),
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
    INSERT INTO public.voice_outbox_events (
        finance_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
    ) VALUES (
        v_lead.finance_id, 'call_log', v_log_id, 'voice.call.completed',
        jsonb_build_object(
            'call_log_id', v_log_id,
            'lead_id', p_lead_id,
            'customer_id', v_lead.customer_id,
            'call_lifecycle_status', v_lifecycle,
            'answered', v_answered,
            'customer_spoke', v_spoke,
            'duration_seconds', GREATEST(0, COALESCE(p_duration_seconds, 0)),
            'recording_s3_key', p_recording_s3_key,
            'recording_status', v_rec_status,
            'prompt_tokens', GREATEST(0, COALESCE(p_prompt_tokens, 0)),
            'completion_tokens', GREATEST(0, COALESCE(p_completion_tokens, 0)),
            'total_tokens', v_tot_tokens,
            'tts_characters', GREATEST(0, COALESCE(p_tts_characters, 0)),
            'stt_seconds', GREATEST(0.00, COALESCE(p_stt_seconds, 0.00)),
            'llm_model', p_llm_model,
            'tts_model', COALESCE(p_tts_model, 'bulbul:v4'),
            'stt_model', p_stt_model,
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
        'call_status', v_final_lead_status,
        'call_lifecycle_status', v_lifecycle,
        'recording_status', v_rec_status,
        'total_tokens', v_tot_tokens
    );
END;
$$;

-- ============================================================================
-- SECTION 4: STRICT SELECT-ONLY ROLE (`autofinex_voice_ro`) & RESTRICTIVE RLS
-- ============================================================================

-- 4.1 Idempotent Role Creation (compatible with PostgreSQL 18 non-superuser `avnadmin` CREATEROLE)
--     Note: In PostgreSQL 16-18, non-superusers cannot specify SUPERUSER/NOSUPERUSER/REPLICATION/BYPASSRLS
--     inside `ALTER ROLE`; newly created roles default to NOSUPERUSER NOREPLICATION NOBYPASSRLS automatically.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_voice_ro') THEN
        CREATE ROLE autofinex_voice_ro WITH
            LOGIN
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT;
    ELSE
        ALTER ROLE autofinex_voice_ro WITH
            LOGIN
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT;
    END IF;
END $$;

-- Enforce read-only session mode (`SQLSTATE 25006` on any write) & safe timeouts
ALTER ROLE autofinex_voice_ro SET default_transaction_read_only = on;
ALTER ROLE autofinex_voice_ro SET statement_timeout = '5s';
ALTER ROLE autofinex_voice_ro SET idle_in_transaction_session_timeout = '10s';

-- 4.2 Strip all write/sequence privileges from `autofinex_voice_ro` & grant SELECT
--     ONLY on the exact verified tables that exist in `001` + `002` + `003` (Lean).
--     Zero access to `users`, `owner`, `refresh_tokens`, `otp_verifications`,
--     `kyc_documents`, `voice_outbox_events`, `voice_speaker_profiles`, `voice_call_biometrics`.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM autofinex_voice_ro;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM autofinex_voice_ro;
GRANT USAGE ON SCHEMA public TO autofinex_voice_ro;

DO $$
DECLARE
    v_tbl TEXT;
    v_part RECORD;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'finance_detail',
        'customers',
        'contacts',
        'vehicle_detail',
        'vehicle_info',
        'loans',
        'payments',
        'sub_due',
        'penalties',
        'promise_to_pay',
        'ai_settings',
        'ai_telecalling_leads',
        'ai_telecalling_call_logs',
        'ai_customer_memory',
        'voice_customer_memory',
        'voice_call_summaries',
        'voice_callbacks',
        'voice_contact_suppressions'
    ] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            EXECUTE format('GRANT SELECT ON TABLE public.%I TO autofinex_voice_ro', v_tbl);
            -- Also grant SELECT on any child partitions (e.g. voice_call_summaries_y2026m11)
            FOR v_part IN
                SELECT c.relname AS child_name
                FROM pg_inherits inh
                JOIN pg_class c ON c.oid = inh.inhrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE inh.inhparent = to_regclass('public.' || v_tbl)
                  AND n.nspname = 'public'
            LOOP
                EXECUTE format('GRANT SELECT ON TABLE public.%I TO autofinex_voice_ro', v_part.child_name);
            END LOOP;
        END IF;
    END LOOP;

    -- Preserve full DML access for existing backend role (`autofinex_developer`) if present
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_developer') THEN
        GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_telecalling_call_logs TO autofinex_developer;
        GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_settings TO autofinex_developer;
        GRANT EXECUTE ON FUNCTION public.fn_calculate_customer_due_summary(UUID, DATE) TO autofinex_developer;
        GRANT EXECUTE ON FUNCTION public.fn_check_voice_call_eligibility(UUID, UUID, UUID, TIMESTAMPTZ) TO autofinex_developer;
        GRANT EXECUTE ON FUNCTION public.fn_claim_due_voice_leads(VARCHAR, INT, INT, UUID) TO autofinex_developer;
    END IF;
END $$;

-- 4.3 Grant EXECUTE to `autofinex_voice_ro` on STABLE/IMMUTABLE read-only functions,
--     and explicitly REVOKE EXECUTE on volatile write functions from `PUBLIC` / `autofinex_voice_ro`
DO $$
DECLARE
    v_write_fn TEXT;
    r RECORD;
BEGIN
    FOREACH v_write_fn IN ARRAY ARRAY[
        'fn_complete_voice_call',
        'fn_claim_due_voice_leads',
        'fn_reconcile_customer_voice_state',
        'fn_refresh_daily_overdue_leads',
        'fn_record_telecall_outcome',
        'fn_expire_broken_ptps',
        'fn_ensure_voice_monthly_partitions'
    ] LOOP
        FOR r IN
            SELECT p.oid::regprocedure AS sig
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = v_write_fn
        LOOP
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, autofinex_voice_ro', r.sig);
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_developer') THEN
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO autofinex_developer', r.sig);
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinance_developer') THEN
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO autofinance_developer', r.sig);
            END IF;
        END LOOP;
    END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION
    public.fn_calculate_customer_due_summary(UUID, DATE),
    public.fn_get_precall_memory_bundle(UUID, UUID),
    public.fn_check_voice_call_eligibility(UUID, UUID, UUID, TIMESTAMPTZ),
    public.fn_normalize_indian_phone_e164(TEXT),
    public.fn_clamped_installment_date(DATE, INT),
    public.fn_loan_anchor_due_day(DATE, DATE)
TO autofinex_voice_ro;

-- 4.4 RESTRICTIVE RLS Policies for `autofinex_voice_ro`:
--     Unlike the backend role (where unset `app.current_finance_id` falls back to explicit WHERE clauses),
--     `autofinex_voice_ro` MUST set `app.current_finance_id` on every transaction to read `voice_*` tables.
DO $$
DECLARE
    v_tbl TEXT;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'voice_customer_memory',
        'voice_call_summaries',
        'voice_callbacks',
        'voice_contact_suppressions'
    ] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
            EXECUTE format('DROP POLICY IF EXISTS voice_ro_require_tenant_ctx ON public.%I', v_tbl);
            EXECUTE format(
                $p$CREATE POLICY voice_ro_require_tenant_ctx ON public.%I
                    AS RESTRICTIVE
                    FOR SELECT
                    TO autofinex_voice_ro
                    USING (
                        NULLIF(current_setting('app.current_finance_id', true), '') IS NOT NULL
                        AND finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
                    )$p$,
                v_tbl
            );
        END IF;
    END LOOP;
END $$;

COMMIT;

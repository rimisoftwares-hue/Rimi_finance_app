-- ============================================================================
-- AutoFinex — Migration 005: Shared Authoritative Financial Ledger,
-- Verified Voice AI Financial Facts & Persistent Manual Batch Call Queue
--
-- Idempotent & Transactional (BEGIN ... COMMIT).
-- Security Invariants:
--   1. `autofinex_voice_ro` retains STRICT SELECT/EXECUTE-ONLY privileges
--      (default_transaction_read_only = on; ZERO INSERT/UPDATE/DELETE/DDL).
--   2. Every function and table enforces explicit `finance_id` multi-tenant scope.
--   3. Installment schedule uses Month-0 anchor (`loans.due_date`, fallback `hp_date`)
--      with EMI #k = fn_clamped_installment_date(anchor, k) for k = 1..due_month,
--      evaluated against `Asia/Kolkata` calendar date (`D_k < v_today_ist`).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Set-Based Authoritative Per-Loan Financial Ledger Function
--    Computes all 8 financial concepts without N+1 loops:
--      1) current_overdue_emi_amount
--      2) remaining_scheduled_emi_amount
--      3) outstanding_principal
--      4) outstanding_interest
--      5) outstanding_penalty_amount
--      6) total_outstanding_loan_balance
--      7) total_amount_paid (valid_emi_paid + total_penalty_paid)
--      8) remaining_amount_payable
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_calculate_loan_ledger_summary(
    p_finance_id UUID,
    p_customer_id UUID DEFAULT NULL,
    p_loan_id UUID DEFAULT NULL,
    p_as_of_date DATE DEFAULT NULL
)
RETURNS TABLE (
    finance_id UUID,
    customer_id UUID,
    loan_id UUID,
    hplno BIGINT,
    loan_status loan_status_enum,
    anchor_date DATE,
    installment_amount NUMERIC(15,2),
    total_installments INT,
    total_contractual_due NUMERIC(15,2),
    valid_emi_paid NUMERIC(15,2),
    total_penalty_paid NUMERIC(15,2),
    total_amount_paid NUMERIC(15,2),
    matured_installments INT,
    installments_covered INT,
    partial_shortfall_amount NUMERIC(15,2),
    pending_emi_count INT,
    current_overdue_emi_amount NUMERIC(15,2),
    remaining_scheduled_emi_amount NUMERIC(15,2),
    outstanding_principal NUMERIC(15,2),
    outstanding_interest NUMERIC(15,2),
    outstanding_penalty_amount NUMERIC(15,2),
    total_outstanding_loan_balance NUMERIC(15,2),
    remaining_amount_payable NUMERIC(15,2),
    earliest_unpaid_due_date DATE,
    next_emi_due_date DATE,
    days_overdue INT
)
LANGUAGE sql
STABLE
AS $$
    WITH eval_ctx AS (
        SELECT COALESCE(p_as_of_date, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE) AS today_ist
    ),
    base_loans AS (
        SELECT
            c.finance_id,
            c.id AS customer_id,
            l.id AS loan_id,
            c.hplno AS hplno,
            c.loan_status,
            COALESCE(l.due_date, l.hp_date) AS anchor_date,
            GREATEST(0, COALESCE(l.due_month, 0))::INT AS total_installments,
            ROUND(COALESCE(l.hp_amount, 0)::NUMERIC, 2) AS principal_advanced,
            ROUND(
                CASE
                    WHEN COALESCE(l.due_amount, 0) > 0 THEN l.due_amount::NUMERIC
                    WHEN COALESCE(l.due_month, 0) > 0 AND COALESCE(l.net_payable, l.hp_amount, 0) > 0
                        THEN COALESCE(NULLIF(l.net_payable, 0), l.hp_amount, 0)::NUMERIC / l.due_month
                    ELSE 0::NUMERIC
                END,
                2
            ) AS inst_amt,
            ROUND(COALESCE(l.net_payable, 0)::NUMERIC, 2) AS raw_net_payable,
            ROUND(COALESCE(l.penalty_amount, 0)::NUMERIC, 2) AS loan_penalty_accrued,
            ROW_NUMBER() OVER (
                PARTITION BY c.id
                ORDER BY l.due_date DESC NULLS LAST, l.hp_date DESC NULLS LAST, l.id DESC
            ) AS loan_rank
        FROM public.customers c
        JOIN public.loans l
          ON l.customer_id = c.id
         AND (l.finance_id IS NULL OR l.finance_id = c.finance_id)
        WHERE c.finance_id = p_finance_id
          AND (p_customer_id IS NULL OR c.id = p_customer_id)
          AND (p_loan_id IS NULL OR l.id = p_loan_id)
    ),
    pay_agg AS (
        SELECT
            bl.loan_id,
            CASE
                WHEN bl.loan_rank = 1 THEN COALESCE((
                    SELECT ROUND(SUM(GREATEST(0, COALESCE(p.amount, 0)))::NUMERIC, 2)
                    FROM public.payments p
                    WHERE p.customer_id = bl.customer_id
                      AND (p.finance_id IS NULL OR p.finance_id = bl.finance_id)
                      AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
                      AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'
                ), 0.00)::NUMERIC(15,2)
                ELSE 0.00::NUMERIC(15,2)
            END AS paid_main,
            CASE
                WHEN bl.loan_rank = 1 THEN COALESCE((
                    SELECT ROUND(SUM(GREATEST(0, COALESCE(sd.paid_amount, 0)))::NUMERIC, 2)
                    FROM public.sub_due sd
                    JOIN public.payments p ON p.id = sd.payment_id
                    WHERE sd.customer_id = bl.customer_id
                      AND sd.finance_id = bl.finance_id
                      AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled'
                      AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
                      AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'
                ), 0.00)::NUMERIC(15,2)
                ELSE 0.00::NUMERIC(15,2)
            END AS paid_sub,
            CASE
                WHEN bl.loan_rank = 1 THEN COALESCE((
                    SELECT ROUND(SUM(GREATEST(0, COALESCE(p.penalty, 0)))::NUMERIC, 2)
                    FROM public.payments p
                    WHERE p.customer_id = bl.customer_id
                      AND (p.finance_id IS NULL OR p.finance_id = bl.finance_id)
                      AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
                      AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'
                ), 0.00)::NUMERIC(15,2)
                ELSE 0.00::NUMERIC(15,2)
            END AS penalty_paid_receipts,
            COALESCE((
                SELECT ROUND(SUM(GREATEST(0, COALESCE(pen.total_penalty, 0)))::NUMERIC, 2)
                FROM public.penalties pen
                WHERE pen.loan_id = bl.loan_id
                  AND pen.settled_payment_id IS NULL
            ), 0.00)::NUMERIC(15,2) AS pending_penalties_rows
        FROM base_loans bl
    ),
    sched AS (
        SELECT
            bl.*,
            ec.today_ist,
            CASE
                WHEN bl.raw_net_payable > 0 THEN bl.raw_net_payable
                ELSE ROUND(bl.total_installments * bl.inst_amt, 2)
            END AS contractual_due,
            ROUND(pa.paid_main + pa.paid_sub, 2) AS emi_paid,
            pa.penalty_paid_receipts AS pen_paid,
            GREATEST(
                pa.pending_penalties_rows,
                GREATEST(0.00, ROUND(bl.loan_penalty_accrued - pa.penalty_paid_receipts, 2))
            )::NUMERIC(15,2) AS pen_outstanding,
            COALESCE((
                SELECT COUNT(*)::INT
                FROM generate_series(1, bl.total_installments) AS gs(k)
                WHERE bl.anchor_date IS NOT NULL
                  AND bl.total_installments > 0
                  AND public.fn_clamped_installment_date(bl.anchor_date, gs.k) < ec.today_ist
            ), 0) AS matured_cnt
        FROM base_loans bl
        CROSS JOIN eval_ctx ec
        JOIN pay_agg pa ON pa.loan_id = bl.loan_id
    ),
    calc AS (
        SELECT
            s.*,
            CASE
                WHEN s.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') THEN 0.00::NUMERIC(15,2)
                ELSE GREATEST(0.00, ROUND(s.contractual_due - s.emi_paid, 2))::NUMERIC(15,2)
            END AS rem_sched_emi,
            CASE
                WHEN s.inst_amt > 0 THEN LEAST(s.total_installments, FLOOR(s.emi_paid / s.inst_amt)::INT)
                ELSE 0
            END AS covered_cnt
        FROM sched s
    ),
    final_calc AS (
        SELECT
            c.*,
            CASE
                WHEN c.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') OR c.rem_sched_emi <= 0.00
                    THEN 0.00::NUMERIC(15,2)
                ELSE LEAST(
                    c.rem_sched_emi,
                    GREATEST(
                        0.00,
                        ROUND(LEAST(c.contractual_due, c.matured_cnt * c.inst_amt) - c.emi_paid, 2)
                    )
                )::NUMERIC(15,2)
            END AS overdue_emi_amt,
            CASE
                WHEN c.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') THEN 0.00::NUMERIC(15,2)
                ELSE c.pen_outstanding
            END AS eff_pen_outstanding,
            CASE
                WHEN c.anchor_date IS NOT NULL AND c.covered_cnt < c.total_installments
                    THEN public.fn_clamped_installment_date(c.anchor_date, c.covered_cnt + 1)
                ELSE NULL::DATE
            END AS candidate_unpaid_date,
            CASE
                WHEN c.anchor_date IS NOT NULL
                     AND GREATEST(c.matured_cnt + 1, c.covered_cnt + 1) <= c.total_installments
                    THEN public.fn_clamped_installment_date(
                        c.anchor_date,
                        GREATEST(c.matured_cnt + 1, c.covered_cnt + 1)
                    )
                ELSE NULL::DATE
            END AS next_sched_date,
            CASE
                WHEN c.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') OR c.rem_sched_emi <= 0.00
                    THEN 0.00::NUMERIC(15,2)
                WHEN c.contractual_due > 0 AND c.principal_advanced > 0
                    THEN LEAST(
                        c.rem_sched_emi,
                        GREATEST(
                            0.00,
                            ROUND(c.principal_advanced - (c.emi_paid * (c.principal_advanced / c.contractual_due)), 2)
                        )
                    )::NUMERIC(15,2)
                ELSE c.rem_sched_emi
            END AS out_principal
        FROM calc c
    )
    SELECT
        fc.finance_id,
        fc.customer_id,
        fc.loan_id,
        fc.hplno,
        fc.loan_status,
        fc.anchor_date,
        fc.inst_amt::NUMERIC(15,2) AS installment_amount,
        fc.total_installments,
        fc.contractual_due::NUMERIC(15,2) AS total_contractual_due,
        fc.emi_paid::NUMERIC(15,2) AS valid_emi_paid,
        fc.pen_paid::NUMERIC(15,2) AS total_penalty_paid,
        ROUND(fc.emi_paid + fc.pen_paid, 2)::NUMERIC(15,2) AS total_amount_paid,
        fc.matured_cnt AS matured_installments,
        fc.covered_cnt AS installments_covered,
        CASE
            WHEN fc.inst_amt > 0 AND (fc.emi_paid - (fc.covered_cnt * fc.inst_amt)) > 0
                 AND fc.covered_cnt < fc.total_installments
                THEN ROUND(fc.inst_amt - (fc.emi_paid - (fc.covered_cnt * fc.inst_amt)), 2)::NUMERIC(15,2)
            ELSE 0.00::NUMERIC(15,2)
        END AS partial_shortfall_amount,
        CASE
            WHEN fc.overdue_emi_amt > 0 AND fc.inst_amt > 0
                THEN CEIL(fc.overdue_emi_amt / fc.inst_amt)::INT
            ELSE 0
        END AS pending_emi_count,
        fc.overdue_emi_amt AS current_overdue_emi_amount,
        fc.rem_sched_emi AS remaining_scheduled_emi_amount,
        fc.out_principal AS outstanding_principal,
        GREATEST(0.00, ROUND(fc.rem_sched_emi - fc.out_principal, 2))::NUMERIC(15,2) AS outstanding_interest,
        fc.eff_pen_outstanding AS outstanding_penalty_amount,
        ROUND(fc.rem_sched_emi + fc.eff_pen_outstanding, 2)::NUMERIC(15,2) AS total_outstanding_loan_balance,
        ROUND(fc.rem_sched_emi + fc.eff_pen_outstanding, 2)::NUMERIC(15,2) AS remaining_amount_payable,
        CASE
            WHEN fc.overdue_emi_amt > 0
                 AND fc.candidate_unpaid_date IS NOT NULL
                 AND fc.candidate_unpaid_date < fc.today_ist
                THEN fc.candidate_unpaid_date
            ELSE NULL::DATE
        END AS earliest_unpaid_due_date,
        CASE
            WHEN fc.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') OR fc.rem_sched_emi <= 0.00
                THEN NULL::DATE
            ELSE fc.next_sched_date
        END AS next_emi_due_date,
        CASE
            WHEN fc.overdue_emi_amt > 0
                 AND fc.candidate_unpaid_date IS NOT NULL
                 AND fc.candidate_unpaid_date < fc.today_ist
                THEN (fc.today_ist - fc.candidate_unpaid_date)::INT
            ELSE 0
        END AS days_overdue
    FROM final_calc fc;
$$;

-- ============================================================================
-- 2. Patch `fn_calculate_customer_due_summary` In-Place (Same 18-Col Signature)
--    Delegates directly to `fn_calculate_loan_ledger_summary` and rolls up
--    multi-loan customers (`SUM(overdue)`, `MAX(days_overdue)`, primary overdue loan).
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
    v_eval_date DATE;
    v_phone VARCHAR(20) := NULL;
    v_phone_e164 VARCHAR(20) := NULL;
    v_phone_dnc BOOLEAN := FALSE;
    v_rollup RECORD;
BEGIN
    SELECT c.id, c.finance_id, c.loan_status
    INTO v_cust
    FROM public.customers c
    WHERE c.id = p_customer_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_eval_date := COALESCE(p_as_of_date, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE);

    SELECT ct.number,
           COALESCE(ct.phone_e164, public.fn_normalize_indian_phone_e164(ct.number)),
           COALESCE(ct.is_dnc, FALSE)
    INTO v_phone, v_phone_e164, v_phone_dnc
    FROM public.contacts ct
    WHERE ct.customer_id = p_customer_id
      AND (ct.finance_id IS NULL OR ct.finance_id = v_cust.finance_id)
    ORDER BY
        CASE WHEN ct.contact_type = 'customer' THEN 0 ELSE 1 END,
        CASE WHEN ct.type = 'mobile' THEN 0 ELSE 1 END,
        ct.id ASC
    LIMIT 1;

    SELECT
        (ARRAY_AGG(ls.loan_id ORDER BY ls.current_overdue_emi_amount DESC, ls.days_overdue DESC, ls.anchor_date DESC NULLS LAST))[1] AS primary_loan_id,
        (ARRAY_AGG(ls.installment_amount ORDER BY ls.current_overdue_emi_amount DESC, ls.days_overdue DESC, ls.anchor_date DESC NULLS LAST))[1] AS primary_inst_amt,
        COALESCE(SUM(ls.total_installments), 0)::INT AS sum_total_installments,
        COALESCE(SUM(ls.total_contractual_due), 0.00)::NUMERIC AS sum_contractual_due,
        COALESCE(SUM(ls.valid_emi_paid), 0.00)::NUMERIC AS sum_valid_paid,
        COALESCE(SUM(ls.total_outstanding_loan_balance), 0.00)::NUMERIC AS sum_total_balance,
        COALESCE(SUM(ls.matured_installments), 0)::INT AS sum_matured,
        COALESCE(SUM(ls.installments_covered), 0)::INT AS sum_covered,
        COALESCE(SUM(ls.pending_emi_count), 0)::INT AS sum_pending_emi,
        COALESCE(SUM(ls.current_overdue_emi_amount), 0.00)::NUMERIC AS sum_overdue_amt,
        MIN(ls.earliest_unpaid_due_date) FILTER (WHERE ls.current_overdue_emi_amount > 0) AS min_unpaid_due_date,
        MIN(ls.next_emi_due_date) AS min_next_due_date,
        COALESCE(MAX(ls.days_overdue), 0)::INT AS max_days_overdue
    INTO v_rollup
    FROM public.fn_calculate_loan_ledger_summary(v_cust.finance_id, p_customer_id, NULL, v_eval_date) ls;

    IF v_rollup.primary_loan_id IS NULL THEN
        RETURN QUERY SELECT
            v_cust.finance_id, NULL::UUID, v_cust.loan_status,
            v_phone, v_phone_e164, v_phone_dnc,
            0.00::NUMERIC, 0, 0.00::NUMERIC, 0.00::NUMERIC,
            0.00::NUMERIC, 0, 0, 0, 0.00::NUMERIC,
            NULL::DATE, NULL::DATE, 0;
        RETURN;
    END IF;

    RETURN QUERY SELECT
        v_cust.finance_id,
        v_rollup.primary_loan_id,
        v_cust.loan_status,
        v_phone,
        v_phone_e164,
        v_phone_dnc,
        v_rollup.primary_inst_amt,
        v_rollup.sum_total_installments,
        v_rollup.sum_contractual_due,
        v_rollup.sum_valid_paid,
        v_rollup.sum_total_balance,
        v_rollup.sum_matured,
        v_rollup.sum_covered,
        v_rollup.sum_pending_emi,
        v_rollup.sum_overdue_amt,
        v_rollup.min_unpaid_due_date,
        v_rollup.min_next_due_date,
        v_rollup.max_days_overdue;
END;
$$;

-- ============================================================================
-- 3. Read-Only Voice AI Financial Q&A Facts Bundle (`SELECT`-Only Safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_get_voice_loan_financial_facts(
    p_finance_id UUID,
    p_customer_id UUID,
    p_loan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_ledger RECORD;
    v_recent_payments JSONB := '[]'::JSONB;
    v_last_payment JSONB := NULL;
BEGIN
    SELECT ls.*
    INTO v_ledger
    FROM public.fn_calculate_loan_ledger_summary(
        p_finance_id,
        p_customer_id,
        p_loan_id,
        (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
    ) ls
    ORDER BY ls.current_overdue_emi_amount DESC, ls.days_overdue DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(rp)::JSONB ORDER BY rp.payment_date DESC), '[]'::JSONB)
    INTO v_recent_payments
    FROM (
        SELECT
            TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS payment_date,
            ROUND(
                COALESCE(p.amount, 0)::NUMERIC + COALESCE((
                    SELECT SUM(COALESCE(sd.paid_amount, 0))
                    FROM public.sub_due sd
                    WHERE sd.payment_id = p.id
                      AND sd.finance_id = p_finance_id
                      AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled'
                ), 0)::NUMERIC,
                2
            ) AS emi_amount_paid,
            ROUND(COALESCE(p.penalty, 0)::NUMERIC, 2) AS penalty_paid,
            COALESCE(p.payment_mode::TEXT, 'cash') AS payment_mode,
            COALESCE(p.status::TEXT, 'paid') AS status
        FROM public.payments p
        WHERE p.customer_id = p_customer_id
          AND (p.finance_id IS NULL OR p.finance_id = p_finance_id)
          AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
          AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'
        ORDER BY p.payment_date DESC NULLS LAST, p.id DESC
        LIMIT 5
    ) rp;

    IF jsonb_array_length(v_recent_payments) > 0 THEN
        v_last_payment := v_recent_payments -> 0;
    END IF;

    RETURN jsonb_build_object(
        'finance_id', v_ledger.finance_id,
        'customer_id', v_ledger.customer_id,
        'loan_id', v_ledger.loan_id,
        'hplno', v_ledger.hplno,
        'installment_amount', v_ledger.installment_amount,
        'total_installments', v_ledger.total_installments,
        'valid_emi_paid', v_ledger.valid_emi_paid,
        'total_penalty_paid', v_ledger.total_penalty_paid,
        'total_amount_paid', v_ledger.total_amount_paid,
        'outstanding_penalty_amount', v_ledger.outstanding_penalty_amount,
        'current_overdue_emi_amount', v_ledger.current_overdue_emi_amount,
        'pending_emi_count', v_ledger.pending_emi_count,
        'days_overdue', v_ledger.days_overdue,
        'earliest_unpaid_due_date', TO_CHAR(v_ledger.earliest_unpaid_due_date, 'YYYY-MM-DD'),
        'next_emi_due_date', TO_CHAR(v_ledger.next_emi_due_date, 'YYYY-MM-DD'),
        'remaining_scheduled_emi_amount', v_ledger.remaining_scheduled_emi_amount,
        'total_outstanding_loan_balance', v_ledger.total_outstanding_loan_balance,
        'last_payment', v_last_payment,
        'recent_payments', v_recent_payments
    );
END;
$$;

-- ============================================================================
-- 4. Separated `call_outcome` Column on `ai_telecalling_call_logs`
-- ============================================================================
ALTER TABLE public.ai_telecalling_call_logs
    ADD COLUMN IF NOT EXISTS call_outcome VARCHAR(40);

UPDATE public.ai_telecalling_call_logs
SET call_outcome = CASE
    WHEN disposition IN ('promise_to_pay', 'payment_promise') THEN 'payment_promise'
    WHEN disposition IN ('callback_requested', 'busy_callback') THEN 'callback_requested'
    WHEN disposition IN ('paid_already', 'already_paid') THEN 'paid_already'
    WHEN disposition = 'dispute' THEN 'dispute'
    WHEN disposition = 'wrong_person' THEN 'wrong_person'
    WHEN disposition = 'wrong_number' THEN 'wrong_number'
    WHEN disposition IN ('do_not_call', 'dnc') THEN 'do_not_call'
    WHEN disposition IN ('escalated', 'human_followup_required') THEN 'escalated'
    WHEN COALESCE(answered, FALSE) = TRUE AND COALESCE(customer_spoke, FALSE) = TRUE THEN 'customer_spoke'
    WHEN COALESCE(answered, FALSE) = TRUE THEN 'answered'
    WHEN disposition = 'busy' THEN 'busy'
    WHEN COALESCE(call_lifecycle_status, '') = 'failed' THEN 'failed'
    ELSE 'no_response'
END
WHERE call_outcome IS NULL;

-- ============================================================================
-- 5. Persistent Manual Multi-Customer Call Queue (`SKIP LOCKED` Ready)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_call_queue_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finance_id UUID NOT NULL REFERENCES public.finance_detail(id) ON DELETE CASCADE,
    created_by_user_id UUID NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'partial_failed')),
    max_concurrency INT NOT NULL DEFAULT 1 CHECK (max_concurrency BETWEEN 1 AND 5),
    total_items INT NOT NULL DEFAULT 0,
    completed_items INT NOT NULL DEFAULT 0,
    failed_items INT NOT NULL DEFAULT 0,
    cancelled_items INT NOT NULL DEFAULT 0,
    idempotency_key VARCHAR(120) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_acqb_tenant_idempotency UNIQUE (finance_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.ai_call_queue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.ai_call_queue_batches(id) ON DELETE CASCADE,
    finance_id UUID NOT NULL REFERENCES public.finance_detail(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    loan_id UUID NULL REFERENCES public.loans(id) ON DELETE SET NULL,
    queue_position INT NOT NULL CHECK (queue_position >= 1),
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    attempt_number INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 2,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by VARCHAR(100) NULL,
    lease_expires_at TIMESTAMPTZ NULL,
    call_log_id UUID NULL REFERENCES public.ai_telecalling_call_logs(id) ON DELETE SET NULL,
    skip_or_error_code VARCHAR(80) NULL,
    error_detail TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_acqi_active_customer
    ON public.ai_call_queue_items (finance_id, customer_id)
    WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_acqi_claim_pending
    ON public.ai_call_queue_items (finance_id, status, next_run_at, queue_position)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_acqi_stale_lease
    ON public.ai_call_queue_items (status, lease_expires_at)
    WHERE status = 'processing';

-- Covering index for retrieving last 5-6 completed relevant call summaries
CREATE INDEX IF NOT EXISTS idx_vcs_tenant_cust_loan_recent
    ON public.voice_call_summaries (finance_id, customer_id, loan_id, call_date DESC)
    WHERE is_superseded = FALSE;

-- ============================================================================
-- 6. Role Grants (Least Privilege Preserved)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_developer') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_call_queue_batches TO autofinex_developer;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_call_queue_items TO autofinex_developer;
        GRANT EXECUTE ON FUNCTION public.fn_calculate_loan_ledger_summary(UUID, UUID, UUID, DATE) TO autofinex_developer;
        GRANT EXECUTE ON FUNCTION public.fn_get_voice_loan_financial_facts(UUID, UUID, UUID) TO autofinex_developer;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_voice_ro') THEN
        -- STRICT SELECT/EXECUTE ONLY — ZERO WRITE PRIVILEGES GRANTED
        GRANT EXECUTE ON FUNCTION public.fn_calculate_loan_ledger_summary(UUID, UUID, UUID, DATE) TO autofinex_voice_ro;
        GRANT EXECUTE ON FUNCTION public.fn_get_voice_loan_financial_facts(UUID, UUID, UUID) TO autofinex_voice_ro;
        GRANT SELECT ON public.ai_call_queue_batches TO autofinex_voice_ro;
        GRANT SELECT ON public.ai_call_queue_items TO autofinex_voice_ro;
    END IF;
END $$;

-- ============================================================================
-- 7. Reconcile `ai_telecalling_leads` Against Corrected Authoritative Ledger
-- ============================================================================
UPDATE public.ai_telecalling_leads atl
SET overdue_amount = ds.overdue_amount,
    pending_emi_count = ds.pending_emi_count,
    earliest_unpaid_due_date = ds.earliest_unpaid_due_date,
    days_overdue = ds.days_overdue,
    loan_id = COALESCE(ds.loan_id, atl.loan_id),
    updated_at = NOW()
FROM public.customers c
CROSS JOIN LATERAL public.fn_calculate_customer_due_summary(
    c.id,
    (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
) ds
WHERE atl.customer_id = c.id
  AND atl.finance_id = c.finance_id;

COMMIT;

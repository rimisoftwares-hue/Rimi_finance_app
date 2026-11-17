-- ============================================================================
-- PROPOSE ONLY — TRANSACTIONAL ROLLBACK FOR
-- `backend/sql/migrations/propose_voice_ro_rls_and_fn_tenant_hardening.sql`
--
-- Drops the added ERP table policies (`allow_non_voice_ro_or_tenant` /
-- `voice_ro_require_tenant_ctx`), disables RLS on the ERP tables that did not
-- previously have RLS enabled in Migrations 003/004 (preserving existing RLS on
-- `voice_customer_memory`, `voice_call_summaries`, `voice_callbacks`, and
-- `voice_contact_suppressions`), and restores the pre-hardening definitions of
-- the 4 read functions (including Migration 009's P/I split ledger).
-- Biometric tables are strictly untouched.
-- ============================================================================

BEGIN;

DO $rb$
DECLARE
    v_tbl TEXT;
    v_erp_tables TEXT[] := ARRAY[
        'customers', 'contacts', 'loans', 'payments', 'sub_due', 'penalties',
        'vehicle_detail', 'vehicle_info', 'finance_detail', 'promise_to_pay',
        'ai_settings', 'ai_telecalling_leads', 'ai_telecalling_call_logs',
        'ai_customer_memory', 'ai_call_queue_batches', 'ai_call_queue_items',
        'seizing_vehicle', 'office_expenses', 'vehicle_expenses',
        'customer_agent_assignments', 'acc_group_master', 'acc_ledger_groups',
        'acc_ledgers', 'acc_vouchers', 'acc_voucher_entries',
        'user_allowed_companies', 'users_details', 'users',
        'addresses', 'address_history'
    ];
    v_part RECORD;
BEGIN
    FOREACH v_tbl IN ARRAY v_erp_tables LOOP
        IF to_regclass('public.' || quote_ident(v_tbl)) IS NOT NULL THEN
            EXECUTE format('DROP POLICY IF EXISTS allow_non_voice_ro_or_tenant ON public.%I', v_tbl);
            EXECUTE format('DROP POLICY IF EXISTS voice_ro_require_tenant_ctx ON public.%I', v_tbl);
            EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', v_tbl);
        END IF;
    END LOOP;

    -- Restore 003/004 policy state on non-biometric `voice_*` tables
    FOREACH v_tbl IN ARRAY ARRAY[
        'voice_customer_memory',
        'voice_call_summaries',
        'voice_callbacks',
        'voice_contact_suppressions'
    ] LOOP
        IF to_regclass('public.' || quote_ident(v_tbl)) IS NOT NULL THEN
            EXECUTE format('DROP POLICY IF EXISTS allow_non_voice_ro_or_tenant ON public.%I', v_tbl);
        END IF;
    END LOOP;

    IF to_regclass('public.voice_call_summaries') IS NOT NULL THEN
        FOR v_part IN
            SELECT c.relname AS part_name
            FROM pg_inherits i
            JOIN pg_class c ON c.oid = i.inhrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE i.inhparent = 'public.voice_call_summaries'::regclass
              AND n.nspname = 'public'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS allow_non_voice_ro_or_tenant ON public.%I', v_part.part_name);
            EXECUTE format('DROP POLICY IF EXISTS voice_ro_require_tenant_ctx ON public.%I', v_part.part_name);
        END LOOP;
    END IF;
END;
$rb$;

-- Restore pre-hardening `fn_calculate_loan_ledger_summary` (Migration 009)
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
AS $body$
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
                    SELECT ROUND(SUM(GREATEST(0, COALESCE(p.principal_amount, 0)))::NUMERIC, 2)
                    FROM public.payments p
                    WHERE p.customer_id = bl.customer_id
                      AND (p.finance_id IS NULL OR p.finance_id = bl.finance_id)
                      AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
                      AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'
                ), 0.00)::NUMERIC(15,2)
                ELSE 0.00::NUMERIC(15,2)
            END AS paid_main_principal,
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
                    SELECT ROUND(SUM(GREATEST(0, COALESCE(sd.principal_amount, 0)))::NUMERIC, 2)
                    FROM public.sub_due sd
                    JOIN public.payments p ON p.id = sd.payment_id
                    WHERE sd.customer_id = bl.customer_id
                      AND sd.finance_id = bl.finance_id
                      AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled'
                      AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
                      AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'
                ), 0.00)::NUMERIC(15,2)
                ELSE 0.00::NUMERIC(15,2)
            END AS paid_sub_principal,
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
            ROUND(pa.paid_main_principal + pa.paid_sub_principal, 2) AS actual_principal_paid,
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
                WHEN c.principal_advanced > 0
                    THEN LEAST(
                        c.rem_sched_emi,
                        GREATEST(0.00, ROUND(c.principal_advanced - c.actual_principal_paid, 2))
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
$body$;

-- Restore pre-hardening `fn_calculate_customer_due_summary` (Migration 005)
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
AS $fn_due_rb$
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
$fn_due_rb$;

-- Restore pre-hardening `fn_get_voice_loan_financial_facts` (Migration 005)
CREATE OR REPLACE FUNCTION public.fn_get_voice_loan_financial_facts(
    p_finance_id UUID,
    p_customer_id UUID,
    p_loan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $fn_facts_rb$
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
$fn_facts_rb$;

-- Restore pre-hardening `fn_get_precall_memory_bundle` (Migration 003)
CREATE OR REPLACE FUNCTION public.fn_get_precall_memory_bundle(
    p_finance_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $fn_mem_rb$
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
    FROM public.customers c
    JOIN public.finance_detail f ON f.id = c.finance_id
    LEFT JOIN public.vehicle_detail vd ON vd.id = c.vehicle_id
    LEFT JOIN public.vehicle_info vi ON vi.id = vd.vehicle_info_id
    WHERE c.id = p_customer_id AND c.finance_id = p_finance_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Customer not found for finance_id');
    END IF;

    SELECT * INTO v_due FROM public.fn_calculate_customer_due_summary(p_customer_id, CURRENT_DATE);

    SELECT company_rules, system_instructions, behavior_flags, escalation_policy,
           voice_config, collection_policy, COALESCE(config_version, 1) AS config_version
    INTO v_settings
    FROM public.ai_settings
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
    FROM public.promise_to_pay
    WHERE finance_id = p_finance_id
      AND customer_id = p_customer_id
      AND is_superseded = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT id, scheduled_at, callback_status, source, customer_note
    INTO v_cb
    FROM public.voice_callbacks
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
        FROM public.voice_call_summaries
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
    FROM public.voice_customer_memory
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
        FROM public.ai_customer_memory
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
$fn_mem_rb$;

COMMIT;

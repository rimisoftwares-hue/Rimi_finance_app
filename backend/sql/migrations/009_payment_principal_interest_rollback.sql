-- ============================================================================
-- AutoFinex — Rollback for Migration 009: Payment & Sub-Due P/I Split Engine
-- ============================================================================
-- Safely removes triggers, helper/engine functions, constraints, and columns
-- introduced by `009_payment_principal_interest_split.sql`, and restores
-- `ai_ro` views and `fn_calculate_loan_ledger_summary` to pre-009 definitions.
-- ============================================================================

BEGIN;

-- 1. Drop triggers created in Migration 009
DROP TRIGGER IF EXISTS trg_payments_pi_sync ON public.payments;
DROP TRIGGER IF EXISTS trg_sub_due_pi_sync ON public.sub_due;
DROP TRIGGER IF EXISTS trg_sub_due_parent_status_sync ON public.sub_due;

-- 2. Drop trigger functions & payment engine functions
DROP FUNCTION IF EXISTS public.fn_trg_payments_pi_sync();
DROP FUNCTION IF EXISTS public.fn_trg_sub_due_pi_sync();
DROP FUNCTION IF EXISTS public.fn_trg_sub_due_parent_status_sync();
DROP FUNCTION IF EXISTS public.fn_process_customer_payment(
    UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC, DATE, NUMERIC, VARCHAR,
    NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.fn_split_amount_interest_first(NUMERIC, NUMERIC, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.fn_get_loan_installment_parts(UUID, UUID, DATE);

-- 3. Restore `ai_ro.payments` & `ai_ro.sub_due` views prior to dropping columns
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'ai_ro') THEN
        DROP VIEW IF EXISTS ai_ro.payments;
        EXECUTE $v1$
        CREATE VIEW ai_ro.payments WITH (security_barrier = true) AS
        SELECT
            id, finance_id, customer_id, due_date, payment_date, bill_number, amount,
            status, payment_status, cancelled_by, penalty, collected_by, collected_by_id,
            hand_loan, hand_loan_remark, payment_mode, payment_mode_1, payment_mode_1_amount,
            remarks, edited_by, edited_at, created_at, collection_id, voucher_id,
            is_approved, approved_by_id, approved_at
        FROM public.payments
        WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;
        $v1$;

        DROP VIEW IF EXISTS ai_ro.sub_due;
        EXECUTE $v2$
        CREATE VIEW ai_ro.sub_due WITH (security_barrier = true) AS
        SELECT
            id, finance_id, customer_id, payment_id, bill_number, payment_date, paid_amount,
            payment_mode, payment_mode_amount, payment_mode_1, payment_mode_1_amount, status,
            collected_by, cancelled_by, edited_by, edited_at, created_at, updated_at,
            is_approved, approved_by_id, approved_at
        FROM public.sub_due
        WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;
        $v2$;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_ai_sql_ro') THEN
            GRANT SELECT ON ai_ro.payments, ai_ro.sub_due TO autofinex_ai_sql_ro;
        END IF;
    END IF;
END $$;

-- 4. Restore `fn_calculate_loan_ledger_summary` proportional fallback if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_calculate_loan_ledger_summary'
    ) THEN
        -- Re-apply Migration 005 proportional principal formula before dropping columns
        EXECUTE $fn$
        CREATE OR REPLACE FUNCTION public.fn_calculate_loan_ledger_summary(
            p_finance_id UUID,
            p_customer_id UUID DEFAULT NULL,
            p_loan_id UUID DEFAULT NULL,
            p_as_of_date DATE DEFAULT NULL
        )
        RETURNS TABLE (
            finance_id UUID, customer_id UUID, loan_id UUID, hplno BIGINT,
            loan_status loan_status_enum, anchor_date DATE, installment_amount NUMERIC(15,2),
            total_installments INT, total_contractual_due NUMERIC(15,2), valid_emi_paid NUMERIC(15,2),
            total_penalty_paid NUMERIC(15,2), total_amount_paid NUMERIC(15,2), matured_installments INT,
            installments_covered INT, partial_shortfall_amount NUMERIC(15,2), pending_emi_count INT,
            current_overdue_emi_amount NUMERIC(15,2), remaining_scheduled_emi_amount NUMERIC(15,2),
            outstanding_principal NUMERIC(15,2), outstanding_interest NUMERIC(15,2),
            outstanding_penalty_amount NUMERIC(15,2), total_outstanding_loan_balance NUMERIC(15,2),
            remaining_amount_payable NUMERIC(15,2), earliest_unpaid_due_date DATE,
            next_emi_due_date DATE, days_overdue INT
        )
        LANGUAGE sql STABLE AS $body$
            WITH eval_ctx AS (
                SELECT COALESCE(p_as_of_date, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE) AS today_ist
            ),
            base_loans AS (
                SELECT c.finance_id, c.id AS customer_id, l.id AS loan_id, c.hplno AS hplno, c.loan_status,
                       COALESCE(l.due_date, l.hp_date) AS anchor_date,
                       GREATEST(0, COALESCE(l.due_month, 0))::INT AS total_installments,
                       ROUND(COALESCE(l.hp_amount, 0)::NUMERIC, 2) AS principal_advanced,
                       ROUND(CASE WHEN COALESCE(l.due_amount, 0) > 0 THEN l.due_amount::NUMERIC
                                  WHEN COALESCE(l.due_month, 0) > 0 AND COALESCE(l.net_payable, l.hp_amount, 0) > 0
                                      THEN COALESCE(NULLIF(l.net_payable, 0), l.hp_amount, 0)::NUMERIC / l.due_month
                                  ELSE 0::NUMERIC END, 2) AS inst_amt,
                       ROUND(COALESCE(l.net_payable, 0)::NUMERIC, 2) AS raw_net_payable,
                       ROUND(COALESCE(l.penalty_amount, 0)::NUMERIC, 2) AS loan_penalty_accrued,
                       ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY l.due_date DESC NULLS LAST, l.hp_date DESC NULLS LAST, l.id DESC) AS loan_rank
                FROM public.customers c
                JOIN public.loans l ON l.customer_id = c.id AND (l.finance_id IS NULL OR l.finance_id = c.finance_id)
                WHERE c.finance_id = p_finance_id
                  AND (p_customer_id IS NULL OR c.id = p_customer_id)
                  AND (p_loan_id IS NULL OR l.id = p_loan_id)
            ),
            pay_agg AS (
                SELECT bl.loan_id,
                       CASE WHEN bl.loan_rank = 1 THEN COALESCE((SELECT ROUND(SUM(GREATEST(0, COALESCE(p.amount, 0)))::NUMERIC, 2) FROM public.payments p WHERE p.customer_id = bl.customer_id AND (p.finance_id IS NULL OR p.finance_id = bl.finance_id) AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled' AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'), 0.00)::NUMERIC(15,2) ELSE 0.00::NUMERIC(15,2) END AS paid_main,
                       CASE WHEN bl.loan_rank = 1 THEN COALESCE((SELECT ROUND(SUM(GREATEST(0, COALESCE(sd.paid_amount, 0)))::NUMERIC, 2) FROM public.sub_due sd JOIN public.payments p ON p.id = sd.payment_id WHERE sd.customer_id = bl.customer_id AND sd.finance_id = bl.finance_id AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled' AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled' AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'), 0.00)::NUMERIC(15,2) ELSE 0.00::NUMERIC(15,2) END AS paid_sub,
                       CASE WHEN bl.loan_rank = 1 THEN COALESCE((SELECT ROUND(SUM(GREATEST(0, COALESCE(p.penalty, 0)))::NUMERIC, 2) FROM public.payments p WHERE p.customer_id = bl.customer_id AND (p.finance_id IS NULL OR p.finance_id = bl.finance_id) AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled' AND COALESCE(p.status::TEXT, 'paid') <> 'cancelled'), 0.00)::NUMERIC(15,2) ELSE 0.00::NUMERIC(15,2) END AS penalty_paid_receipts,
                       COALESCE((SELECT ROUND(SUM(GREATEST(0, COALESCE(pen.total_penalty, 0)))::NUMERIC, 2) FROM public.penalties pen WHERE pen.loan_id = bl.loan_id AND pen.settled_payment_id IS NULL), 0.00)::NUMERIC(15,2) AS pending_penalties_rows
                FROM base_loans bl
            ),
            sched AS (
                SELECT bl.*, ec.today_ist,
                       CASE WHEN bl.raw_net_payable > 0 THEN bl.raw_net_payable ELSE ROUND(bl.total_installments * bl.inst_amt, 2) END AS contractual_due,
                       ROUND(pa.paid_main + pa.paid_sub, 2) AS emi_paid,
                       pa.penalty_paid_receipts AS pen_paid,
                       GREATEST(pa.pending_penalties_rows, GREATEST(0.00, ROUND(bl.loan_penalty_accrued - pa.penalty_paid_receipts, 2)))::NUMERIC(15,2) AS pen_outstanding,
                       COALESCE((SELECT COUNT(*)::INT FROM generate_series(1, bl.total_installments) AS gs(k) WHERE bl.anchor_date IS NOT NULL AND bl.total_installments > 0 AND public.fn_clamped_installment_date(bl.anchor_date, gs.k) < ec.today_ist), 0) AS matured_cnt
                FROM base_loans bl CROSS JOIN eval_ctx ec JOIN pay_agg pa ON pa.loan_id = bl.loan_id
            ),
            calc AS (
                SELECT s.*,
                       CASE WHEN s.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') THEN 0.00::NUMERIC(15,2) ELSE GREATEST(0.00, ROUND(s.contractual_due - s.emi_paid, 2))::NUMERIC(15,2) END AS rem_sched_emi,
                       CASE WHEN s.inst_amt > 0 THEN LEAST(s.total_installments, FLOOR(s.emi_paid / s.inst_amt)::INT) ELSE 0 END AS covered_cnt
                FROM sched s
            ),
            final_calc AS (
                SELECT c.*,
                       CASE WHEN c.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') OR c.rem_sched_emi <= 0.00 THEN 0.00::NUMERIC(15,2)
                            ELSE LEAST(c.rem_sched_emi, GREATEST(0.00, ROUND(LEAST(c.contractual_due, c.matured_cnt * c.inst_amt) - c.emi_paid, 2)))::NUMERIC(15,2) END AS overdue_emi_amt,
                       CASE WHEN c.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') THEN 0.00::NUMERIC(15,2) ELSE c.pen_outstanding END AS eff_pen_outstanding,
                       CASE WHEN c.anchor_date IS NOT NULL AND c.covered_cnt < c.total_installments THEN public.fn_clamped_installment_date(c.anchor_date, c.covered_cnt + 1) ELSE NULL::DATE END AS candidate_unpaid_date,
                       CASE WHEN c.anchor_date IS NOT NULL AND GREATEST(c.matured_cnt + 1, c.covered_cnt + 1) <= c.total_installments THEN public.fn_clamped_installment_date(c.anchor_date, GREATEST(c.matured_cnt + 1, c.covered_cnt + 1)) ELSE NULL::DATE END AS next_sched_date,
                       CASE WHEN c.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') OR c.rem_sched_emi <= 0.00 THEN 0.00::NUMERIC(15,2)
                            WHEN c.contractual_due > 0 AND c.principal_advanced > 0 THEN LEAST(c.rem_sched_emi, GREATEST(0.00, ROUND(c.principal_advanced - (c.emi_paid * (c.principal_advanced / c.contractual_due)), 2)))::NUMERIC(15,2)
                            ELSE c.rem_sched_emi END AS out_principal
                FROM calc c
            )
            SELECT fc.finance_id, fc.customer_id, fc.loan_id, fc.hplno, fc.loan_status, fc.anchor_date,
                   fc.inst_amt::NUMERIC(15,2), fc.total_installments, fc.contractual_due::NUMERIC(15,2),
                   fc.emi_paid::NUMERIC(15,2), fc.pen_paid::NUMERIC(15,2), ROUND(fc.emi_paid + fc.pen_paid, 2)::NUMERIC(15,2),
                   fc.matured_cnt, fc.covered_cnt,
                   CASE WHEN fc.inst_amt > 0 AND (fc.emi_paid - (fc.covered_cnt * fc.inst_amt)) > 0 AND fc.covered_cnt < fc.total_installments THEN ROUND(fc.inst_amt - (fc.emi_paid - (fc.covered_cnt * fc.inst_amt)), 2)::NUMERIC(15,2) ELSE 0.00::NUMERIC(15,2) END,
                   CASE WHEN fc.overdue_emi_amt > 0 AND fc.inst_amt > 0 THEN CEIL(fc.overdue_emi_amt / fc.inst_amt)::INT ELSE 0 END,
                   fc.overdue_emi_amt, fc.rem_sched_emi, fc.out_principal,
                   GREATEST(0.00, ROUND(fc.rem_sched_emi - fc.out_principal, 2))::NUMERIC(15,2),
                   fc.eff_pen_outstanding, ROUND(fc.rem_sched_emi + fc.eff_pen_outstanding, 2)::NUMERIC(15,2),
                   ROUND(fc.rem_sched_emi + fc.eff_pen_outstanding, 2)::NUMERIC(15,2),
                   CASE WHEN fc.overdue_emi_amt > 0 AND fc.candidate_unpaid_date IS NOT NULL AND fc.candidate_unpaid_date < fc.today_ist THEN fc.candidate_unpaid_date ELSE NULL::DATE END,
                   CASE WHEN fc.loan_status::TEXT IN ('close', 'closed', 'completed', 'settled') OR fc.rem_sched_emi <= 0.00 THEN NULL::DATE ELSE fc.next_sched_date END,
                   CASE WHEN fc.overdue_emi_amt > 0 AND fc.candidate_unpaid_date IS NOT NULL AND fc.candidate_unpaid_date < fc.today_ist THEN (fc.today_ist - fc.candidate_unpaid_date)::INT ELSE 0 END
            FROM final_calc fc;
        $body$;
        $fn$;
    END IF;
END $$;

-- 5. Drop index, CHECK constraints, and columns
DROP INDEX IF EXISTS public.idx_payments_customer_open_fifo;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_pi_sum;
ALTER TABLE public.sub_due  DROP CONSTRAINT IF EXISTS chk_sub_due_pi_sum;

ALTER TABLE public.payments
    DROP COLUMN IF EXISTS principal_amount,
    DROP COLUMN IF EXISTS interest_amount;

ALTER TABLE public.sub_due
    DROP COLUMN IF EXISTS principal_amount,
    DROP COLUMN IF EXISTS interest_amount;

COMMIT;


-- ============================================================================
-- AutoFinex — Migration 009: Payment & Sub-Due Principal/Interest Split Engine
-- ============================================================================
-- Purpose:
--   1. Add `principal_amount` and `interest_amount` (DECIMAL(15,2)) to both
--      `public.payments` and `public.sub_due`.
--   2. Backfill all existing historical `payments` and `sub_due` records
--      idempotently using the NBFC Interest-First rule derived from each
--      loan's contractual `due_amount`, `principle_part`, and `interest_part`.
--   3. Enforce non-negative & exact-sum invariants (`P + I = amount / paid_amount`)
--      using zero-downtime `CHECK ... NOT VALID` + `VALIDATE CONSTRAINT`.
--   4. Attach `BEFORE INSERT OR UPDATE` guard triggers on `payments` and `sub_due`
--      so legacy inserts, reloan settlements, OCR imports, or amount-only edits
--      auto-calculate Principal & Interest (Interest-First), while explicit
--      single-due manual overrides are preserved and validated.
--   5. Attach `AFTER INSERT OR UPDATE OR DELETE` trigger on `sub_due` to keep
--      parent `payments.status` (`pending` / `partial` / `paid`) 100% synchronized.
--   6. Provide atomic `public.fn_process_customer_payment(...)` stored function
--      that locks the customer ledger (`FOR UPDATE`), settles ALL open/partial
--      dues in chronological FIFO order via `sub_due`, splits remaining funds
--      across current & advance `payments` with month-end clamped dates, and
--      enforces the Single-Due Manual P/I Override policy.
--   7. Refresh `ai_ro.payments`, `ai_ro.sub_due`, and `fn_calculate_loan_ledger_summary`
--      (when present) while preserving strict read-only role boundaries.
--
-- Engine      : PostgreSQL 14+ / 18+
-- Idempotency : Safe to re-run multiple times; atomic `BEGIN ... COMMIT`.
-- Rollback    : `backend/sql/migrations/009_payment_principal_interest_rollback.sql`
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ADDITIVE SCHEMA CHANGES (`payments` & `sub_due`)
-- ============================================================================

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS principal_amount DECIMAL(15,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS interest_amount  DECIMAL(15,2) DEFAULT 0.00;

ALTER TABLE public.sub_due
    ADD COLUMN IF NOT EXISTS principal_amount DECIMAL(15,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS interest_amount  DECIMAL(15,2) DEFAULT 0.00;

-- Supporting composite index for fast chronological FIFO open-due lookup
CREATE INDEX IF NOT EXISTS idx_payments_customer_open_fifo
    ON public.payments (customer_id, finance_id, due_date ASC, created_at ASC)
    WHERE payment_status = 'active' AND status IN ('pending', 'partial');


-- ============================================================================
-- SECTION 2: PURE INSTALLMENT SCHEDULE & INTEREST-FIRST SPLIT HELPERS
-- ============================================================================

-- 2.1 Month-Clamped Installment Date Helper (matches Migration 002 signature)
--     e.g. `2026-01-31` + 1 month -> `2026-02-28`, + 2 months -> `2026-03-31`
CREATE OR REPLACE FUNCTION public.fn_clamped_installment_date(
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
    v_start_day     INT;
    v_total_m       INT;
    v_year          INT;
    v_month         INT;
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


-- 2.2 Resolve Normalized Per-Installment Contractual Parts for a Customer's Loan
--     Guarantees `principal_part + interest_part = due_amount` even when `due_amount`
--     was rounded to the nearest ₹10 during loan origination.
CREATE OR REPLACE FUNCTION public.fn_get_loan_installment_parts(
    p_finance_id   UUID,
    p_customer_id  UUID,
    p_ref_due_date DATE DEFAULT NULL
)
RETURNS TABLE (
    loan_id        UUID,
    due_amount     NUMERIC(15,2),
    principal_part NUMERIC(15,2),
    interest_part  NUMERIC(15,2),
    anchor_date    DATE,
    due_month      INT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_loan    RECORD;
    v_due_amt NUMERIC(15,2) := 0.00;
    v_raw_int NUMERIC(15,2) := 0.00;
    v_int     NUMERIC(15,2) := 0.00;
    v_prin    NUMERIC(15,2) := 0.00;
BEGIN
    SELECT
        l.id,
        l.hp_amount,
        l.hp_date,
        l.due_date,
        l.due_month,
        l.interest_rate,
        l.principle_part,
        l.interest_part,
        l.due_amount,
        l.net_payable
    INTO v_loan
    FROM public.loans l
    WHERE l.customer_id = p_customer_id
      AND (p_finance_id IS NULL OR l.finance_id IS NULL OR l.finance_id = p_finance_id)
    ORDER BY
        CASE
            WHEN p_ref_due_date IS NOT NULL
                 AND COALESCE(l.due_date, l.hp_date) IS NOT NULL
                 AND date_trunc('month', p_ref_due_date)::DATE >= date_trunc('month', COALESCE(l.due_date, l.hp_date))::DATE
                 AND date_trunc('month', p_ref_due_date)::DATE <= (
                     date_trunc('month', COALESCE(l.due_date, l.hp_date))
                     + ((GREATEST(COALESCE(l.due_month, 1), 1)) || ' months')::INTERVAL
                 )::DATE
            THEN 0
            ELSE 1
        END ASC,
        COALESCE(l.due_date, l.hp_date) DESC NULLS LAST,
        l.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            NULL::UUID,
            0.00::NUMERIC(15,2),
            0.00::NUMERIC(15,2),
            0.00::NUMERIC(15,2),
            NULL::DATE,
            0::INT;
        RETURN;
    END IF;

    v_due_amt := ROUND(
        CASE
            WHEN COALESCE(v_loan.due_amount, 0) > 0
                THEN v_loan.due_amount::NUMERIC
            WHEN COALESCE(v_loan.due_month, 0) > 0
                 AND COALESCE(NULLIF(v_loan.net_payable, 0), v_loan.hp_amount, 0) > 0
                THEN COALESCE(NULLIF(v_loan.net_payable, 0), v_loan.hp_amount)::NUMERIC / v_loan.due_month
            WHEN COALESCE(v_loan.principle_part, 0) + COALESCE(v_loan.interest_part, 0) > 0
                THEN (COALESCE(v_loan.principle_part, 0) + COALESCE(v_loan.interest_part, 0))::NUMERIC
            ELSE 0.00::NUMERIC
        END,
        2
    );

    v_raw_int := ROUND(
        CASE
            WHEN COALESCE(v_loan.interest_part, 0) > 0
                THEN v_loan.interest_part::NUMERIC
            WHEN COALESCE(v_loan.hp_amount, 0) > 0 AND COALESCE(v_loan.interest_rate, 0) > 0
                THEN (v_loan.hp_amount::NUMERIC * v_loan.interest_rate::NUMERIC) / 100.0
            WHEN COALESCE(v_loan.principle_part, 0) > 0 AND v_due_amt > v_loan.principle_part
                THEN v_due_amt - v_loan.principle_part::NUMERIC
            ELSE 0.00::NUMERIC
        END,
        2
    );

    v_int  := LEAST(v_due_amt, GREATEST(0.00, v_raw_int));
    v_prin := GREATEST(0.00, ROUND(v_due_amt - v_int, 2));

    RETURN QUERY SELECT
        v_loan.id,
        v_due_amt,
        v_prin,
        v_int,
        COALESCE(v_loan.due_date, v_loan.hp_date),
        GREATEST(0, COALESCE(v_loan.due_month, 0))::INT;
END;
$$;


-- 2.3 Pure NBFC Interest-First Allocation Helper
--     - Within a single installment (`p_amount <= p_due_amount` or `p_already_paid_interest > 0`),
--       allocates to remaining unpaid interest (`p_due_interest - p_already_paid_interest`) first,
--       and assigns the remainder to principal.
--     - For direct lump-sum settlement rows (`p_amount > p_due_amount` and `p_already_paid_interest = 0`),
--       allocates `full_dues * p_due_interest + LEAST(remainder, p_due_interest)` to interest,
--       and the rest to principal.
--     - Always guarantees `principal_amount + interest_amount = GREATEST(0, ROUND(p_amount, 2))`.
CREATE OR REPLACE FUNCTION public.fn_split_amount_interest_first(
    p_amount                NUMERIC,
    p_due_amount            NUMERIC,
    p_due_interest          NUMERIC,
    p_already_paid_interest NUMERIC DEFAULT 0.00
)
RETURNS TABLE (
    principal_amount NUMERIC(15,2),
    interest_amount  NUMERIC(15,2)
)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
    v_amt       NUMERIC(15,2) := GREATEST(0.00, ROUND(COALESCE(p_amount, 0), 2));
    v_due       NUMERIC(15,2) := GREATEST(0.00, ROUND(COALESCE(p_due_amount, 0), 2));
    v_int_cap   NUMERIC(15,2);
    v_paid_int  NUMERIC(15,2) := GREATEST(0.00, ROUND(COALESCE(p_already_paid_interest, 0), 2));
    v_rem_int   NUMERIC(15,2);
    v_full_dues INT;
    v_rem_amt   NUMERIC(15,2);
    v_int       NUMERIC(15,2);
    v_prin      NUMERIC(15,2);
BEGIN
    IF v_amt = 0.00 OR v_due = 0.00 THEN
        RETURN QUERY SELECT v_amt, 0.00::NUMERIC(15,2);
        RETURN;
    END IF;

    v_int_cap := LEAST(v_due, GREATEST(0.00, ROUND(COALESCE(p_due_interest, 0), 2)));

    IF v_amt <= v_due OR v_paid_int > 0.00 THEN
        v_rem_int := GREATEST(0.00, ROUND(v_int_cap - v_paid_int, 2));
        v_int     := LEAST(v_amt, v_rem_int);
        v_prin    := ROUND(v_amt - v_int, 2);
    ELSE
        v_full_dues := FLOOR(v_amt / v_due)::INT;
        v_rem_amt   := ROUND(v_amt - (v_full_dues * v_due), 2);
        v_int       := LEAST(v_amt, ROUND((v_full_dues * v_int_cap) + LEAST(v_rem_amt, v_int_cap), 2));
        v_prin      := ROUND(v_amt - v_int, 2);
    END IF;

    RETURN QUERY SELECT v_prin, v_int;
END;
$$;


-- ============================================================================
-- SECTION 3: IDEMPOTENT SET-BASED HISTORICAL BACKFILL
-- ============================================================================

-- 3.1 Backfill `public.payments` (only untouched rows where both P and I are 0/NULL)
WITH payment_backfill AS (
    SELECT
        p.id,
        sp.principal_amount AS calc_principal,
        sp.interest_amount  AS calc_interest
    FROM public.payments p
    LEFT JOIN LATERAL public.fn_get_loan_installment_parts(
        p.finance_id,
        p.customer_id,
        p.due_date
    ) parts ON TRUE
    CROSS JOIN LATERAL public.fn_split_amount_interest_first(
        GREATEST(0.00, COALESCE(p.amount, 0)),
        parts.due_amount,
        parts.interest_part,
        0.00
    ) sp
    WHERE COALESCE(p.principal_amount, 0) = 0
      AND COALESCE(p.interest_amount, 0) = 0
)
UPDATE public.payments p
SET principal_amount = pb.calc_principal,
    interest_amount  = pb.calc_interest
FROM payment_backfill pb
WHERE p.id = pb.id;

-- 3.2 Backfill `public.sub_due` in chronological order per parent `payment_id`
WITH subdue_prior AS (
    SELECT
        sd.id,
        GREATEST(0.00, ROUND(COALESCE(sd.paid_amount, 0)::NUMERIC, 2)) AS clean_paid,
        parts.due_amount,
        parts.interest_part,
        CASE
            WHEN COALESCE(sd.status::TEXT, 'active') = 'cancelled' THEN 0.00
            ELSE LEAST(
                parts.interest_part,
                GREATEST(
                    0.00,
                    GREATEST(0.00, COALESCE(p.amount, 0)::NUMERIC)
                    + COALESCE(
                        SUM(
                            CASE
                                WHEN COALESCE(sd.status::TEXT, 'active') <> 'cancelled'
                                    THEN GREATEST(0.00, COALESCE(sd.paid_amount, 0)::NUMERIC)
                                ELSE 0.00
                            END
                        ) OVER (
                            PARTITION BY sd.payment_id
                            ORDER BY sd.payment_date ASC, sd.created_at ASC, sd.id ASC
                            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                        ),
                        0.00
                    )
                )
            )
        END AS prior_interest_paid
    FROM public.sub_due sd
    LEFT JOIN public.payments p ON p.id = sd.payment_id
    LEFT JOIN LATERAL public.fn_get_loan_installment_parts(
        COALESCE(sd.finance_id, p.finance_id),
        sd.customer_id,
        p.due_date
    ) parts ON TRUE
),
subdue_backfill AS (
    SELECT
        sp_prior.id,
        sp_split.principal_amount AS calc_principal,
        sp_split.interest_amount  AS calc_interest
    FROM subdue_prior sp_prior
    CROSS JOIN LATERAL public.fn_split_amount_interest_first(
        sp_prior.clean_paid,
        sp_prior.due_amount,
        sp_prior.interest_part,
        sp_prior.prior_interest_paid
    ) sp_split
)
UPDATE public.sub_due sd
SET principal_amount = sb.calc_principal,
    interest_amount  = sb.calc_interest
FROM subdue_backfill sb
WHERE sd.id = sb.id
  AND COALESCE(sd.principal_amount, 0) = 0
  AND COALESCE(sd.interest_amount, 0) = 0;

-- Ensure zero NULLs remain before locking NOT NULL + CHECK constraints
UPDATE public.payments
SET principal_amount = COALESCE(principal_amount, 0.00),
    interest_amount  = COALESCE(interest_amount, 0.00)
WHERE principal_amount IS NULL OR interest_amount IS NULL;

UPDATE public.sub_due
SET principal_amount = COALESCE(principal_amount, 0.00),
    interest_amount  = COALESCE(interest_amount, 0.00)
WHERE principal_amount IS NULL OR interest_amount IS NULL;


-- ============================================================================
-- SECTION 4: ZERO-DOWNTIME NOT NULL & CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE public.payments
    ALTER COLUMN principal_amount SET DEFAULT 0.00,
    ALTER COLUMN principal_amount SET NOT NULL,
    ALTER COLUMN interest_amount  SET DEFAULT 0.00,
    ALTER COLUMN interest_amount  SET NOT NULL;

ALTER TABLE public.sub_due
    ALTER COLUMN principal_amount SET DEFAULT 0.00,
    ALTER COLUMN principal_amount SET NOT NULL,
    ALTER COLUMN interest_amount  SET DEFAULT 0.00,
    ALTER COLUMN interest_amount  SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_payments_pi_sum'
          AND conrelid = 'public.payments'::regclass
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT chk_payments_pi_sum CHECK (
                principal_amount >= 0
                AND interest_amount >= 0
                AND (
                    COALESCE(amount, 0) < 0
                    OR ROUND(principal_amount + interest_amount, 2) = GREATEST(0.00, ROUND(COALESCE(amount, 0), 2))
                )
            ) NOT VALID;
    END IF;
END $$;

ALTER TABLE public.payments VALIDATE CONSTRAINT chk_payments_pi_sum;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_sub_due_pi_sum'
          AND conrelid = 'public.sub_due'::regclass
    ) THEN
        ALTER TABLE public.sub_due
            ADD CONSTRAINT chk_sub_due_pi_sum CHECK (
                principal_amount >= 0
                AND interest_amount >= 0
                AND (
                    COALESCE(paid_amount, 0) < 0
                    OR ROUND(principal_amount + interest_amount, 2) = GREATEST(0.00, ROUND(COALESCE(paid_amount, 0), 2))
                )
            ) NOT VALID;
    END IF;
END $$;

ALTER TABLE public.sub_due VALIDATE CONSTRAINT chk_sub_due_pi_sum;


-- ============================================================================
-- SECTION 5: GUARD & STATUS-SYNC TRIGGERS (`payments` & `sub_due`)
-- ============================================================================

-- 5.1 `BEFORE INSERT OR UPDATE` on `public.payments`
--     - Auto-fills `principal_amount` & `interest_amount` (Interest-First) when omitted
--       or when `amount` is updated without updating P & I.
--     - Validates `principal_amount + interest_amount = amount` when explicitly supplied.
CREATE OR REPLACE FUNCTION public.fn_trg_payments_pi_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_amt   NUMERIC(15,2);
    v_parts RECORD;
    v_split RECORD;
BEGIN
    v_amt := GREATEST(0.00, ROUND(COALESCE(NEW.amount, 0), 2));

    IF v_amt = 0.00 THEN
        NEW.principal_amount := 0.00;
        NEW.interest_amount  := 0.00;
        RETURN NEW;
    END IF;

    -- Case A: One side explicitly provided while the other is NULL
    IF NEW.principal_amount IS NOT NULL AND NEW.interest_amount IS NULL THEN
        NEW.principal_amount := ROUND(NEW.principal_amount, 2);
        NEW.interest_amount  := ROUND(v_amt - NEW.principal_amount, 2);
    ELSIF NEW.interest_amount IS NOT NULL AND NEW.principal_amount IS NULL THEN
        NEW.interest_amount  := ROUND(NEW.interest_amount, 2);
        NEW.principal_amount := ROUND(v_amt - NEW.interest_amount, 2);
    END IF;

    -- Case B: Legacy INSERT omitting both (defaults to 0.00/NULL) OR amount-only UPDATE
    IF (
        TG_OP = 'INSERT'
        AND COALESCE(NEW.principal_amount, 0) = 0
        AND COALESCE(NEW.interest_amount, 0) = 0
    ) OR (
        TG_OP = 'UPDATE'
        AND NEW.amount IS DISTINCT FROM OLD.amount
        AND NEW.principal_amount IS NOT DISTINCT FROM OLD.principal_amount
        AND NEW.interest_amount IS NOT DISTINCT FROM OLD.interest_amount
        AND ROUND(COALESCE(NEW.principal_amount, 0) + COALESCE(NEW.interest_amount, 0), 2) <> v_amt
    ) THEN
        SELECT * INTO v_parts
        FROM public.fn_get_loan_installment_parts(NEW.finance_id, NEW.customer_id, NEW.due_date);

        SELECT * INTO v_split
        FROM public.fn_split_amount_interest_first(
            v_amt,
            v_parts.due_amount,
            v_parts.interest_part,
            0.00
        );

        NEW.principal_amount := v_split.principal_amount;
        NEW.interest_amount  := v_split.interest_amount;
        RETURN NEW;
    END IF;

    -- Case C: Explicit P & I provided — round and enforce exact invariant
    NEW.principal_amount := ROUND(COALESCE(NEW.principal_amount, 0), 2);
    NEW.interest_amount  := ROUND(COALESCE(NEW.interest_amount, 0), 2);

    IF NEW.principal_amount < 0 OR NEW.interest_amount < 0 THEN
        RAISE EXCEPTION 'Principal (%) and Interest (%) cannot be negative',
            NEW.principal_amount, NEW.interest_amount
            USING ERRCODE = '23514';
    END IF;

    IF ROUND(NEW.principal_amount + NEW.interest_amount, 2) <> v_amt THEN
        RAISE EXCEPTION 'Principal (%) + Interest (%) must equal Payment Amount (%)',
            NEW.principal_amount, NEW.interest_amount, v_amt
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_pi_sync ON public.payments;
CREATE TRIGGER trg_payments_pi_sync
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_payments_pi_sync();


-- 5.2 `BEFORE INSERT OR UPDATE` on `public.sub_due`
--     - Auto-fills `principal_amount` & `interest_amount` (Interest-First accounting
--       for interest already collected on parent `payments` + prior active `sub_due`s).
--     - Validates `principal_amount + interest_amount = paid_amount` when supplied.
CREATE OR REPLACE FUNCTION public.fn_trg_sub_due_pi_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_paid_amt       NUMERIC(15,2);
    v_parent_due     DATE;
    v_parent_fin     UUID;
    v_parent_int     NUMERIC(15,2) := 0.00;
    v_sibling_int    NUMERIC(15,2) := 0.00;
    v_parts          RECORD;
    v_split          RECORD;
BEGIN
    v_paid_amt := GREATEST(0.00, ROUND(COALESCE(NEW.paid_amount, 0), 2));

    IF v_paid_amt = 0.00 THEN
        NEW.principal_amount := 0.00;
        NEW.interest_amount  := 0.00;
        RETURN NEW;
    END IF;

    IF NEW.principal_amount IS NOT NULL AND NEW.interest_amount IS NULL THEN
        NEW.principal_amount := ROUND(NEW.principal_amount, 2);
        NEW.interest_amount  := ROUND(v_paid_amt - NEW.principal_amount, 2);
    ELSIF NEW.interest_amount IS NOT NULL AND NEW.principal_amount IS NULL THEN
        NEW.interest_amount  := ROUND(NEW.interest_amount, 2);
        NEW.principal_amount := ROUND(v_paid_amt - NEW.interest_amount, 2);
    END IF;

    IF (
        TG_OP = 'INSERT'
        AND COALESCE(NEW.principal_amount, 0) = 0
        AND COALESCE(NEW.interest_amount, 0) = 0
    ) OR (
        TG_OP = 'UPDATE'
        AND NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
        AND NEW.principal_amount IS NOT DISTINCT FROM OLD.principal_amount
        AND NEW.interest_amount IS NOT DISTINCT FROM OLD.interest_amount
        AND ROUND(COALESCE(NEW.principal_amount, 0) + COALESCE(NEW.interest_amount, 0), 2) <> v_paid_amt
    ) THEN
        SELECT p.due_date, p.finance_id, GREATEST(0.00, COALESCE(p.interest_amount, 0))
        INTO v_parent_due, v_parent_fin, v_parent_int
        FROM public.payments p
        WHERE p.id = NEW.payment_id;

        SELECT COALESCE(SUM(GREATEST(0.00, COALESCE(sd.interest_amount, 0))), 0.00)
        INTO v_sibling_int
        FROM public.sub_due sd
        WHERE sd.payment_id = NEW.payment_id
          AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled'
          AND (TG_OP = 'INSERT' OR sd.id <> NEW.id);

        SELECT * INTO v_parts
        FROM public.fn_get_loan_installment_parts(
            COALESCE(NEW.finance_id, v_parent_fin),
            NEW.customer_id,
            v_parent_due
        );

        SELECT * INTO v_split
        FROM public.fn_split_amount_interest_first(
            v_paid_amt,
            v_parts.due_amount,
            v_parts.interest_part,
            ROUND(v_parent_int + v_sibling_int, 2)
        );

        NEW.principal_amount := v_split.principal_amount;
        NEW.interest_amount  := v_split.interest_amount;
        RETURN NEW;
    END IF;

    NEW.principal_amount := ROUND(COALESCE(NEW.principal_amount, 0), 2);
    NEW.interest_amount  := ROUND(COALESCE(NEW.interest_amount, 0), 2);

    IF NEW.principal_amount < 0 OR NEW.interest_amount < 0 THEN
        RAISE EXCEPTION 'Sub-due Principal (%) and Interest (%) cannot be negative',
            NEW.principal_amount, NEW.interest_amount
            USING ERRCODE = '23514';
    END IF;

    IF ROUND(NEW.principal_amount + NEW.interest_amount, 2) <> v_paid_amt THEN
        RAISE EXCEPTION 'Sub-due Principal (%) + Interest (%) must equal Paid Amount (%)',
            NEW.principal_amount, NEW.interest_amount, v_paid_amt
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sub_due_pi_sync ON public.sub_due;
CREATE TRIGGER trg_sub_due_pi_sync
BEFORE INSERT OR UPDATE ON public.sub_due
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_sub_due_pi_sync();


-- 5.3 `AFTER INSERT OR UPDATE OR DELETE` on `public.sub_due`
--     Automatically keeps parent `payments.status` (`pending` / `partial` / `paid`)
--     accurate whenever a `sub_due` is added, edited, cancelled, or deleted.
CREATE OR REPLACE FUNCTION public.fn_trg_sub_due_parent_status_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pay_ids    UUID[];
    v_pid        UUID;
    v_parent     RECORD;
    v_parts      RECORD;
    v_sub_sum    NUMERIC(15,2);
    v_total_paid NUMERIC(15,2);
    v_new_status payment_status_enum;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_pay_ids := ARRAY[NEW.payment_id];
    ELSIF TG_OP = 'DELETE' THEN
        v_pay_ids := ARRAY[OLD.payment_id];
    ELSE
        IF OLD.payment_id IS DISTINCT FROM NEW.payment_id THEN
            v_pay_ids := ARRAY[OLD.payment_id, NEW.payment_id];
        ELSE
            v_pay_ids := ARRAY[NEW.payment_id];
        END IF;
    END IF;

    FOREACH v_pid IN ARRAY v_pay_ids
    LOOP
        IF v_pid IS NULL THEN
            CONTINUE;
        END IF;

        SELECT id, finance_id, customer_id, due_date, amount, status, payment_status
        INTO v_parent
        FROM public.payments
        WHERE id = v_pid;

        IF NOT FOUND OR COALESCE(v_parent.payment_status::TEXT, 'active') = 'cancelled' THEN
            CONTINUE;
        END IF;

        SELECT COALESCE(SUM(GREATEST(0.00, COALESCE(sd.paid_amount, 0))), 0.00)
        INTO v_sub_sum
        FROM public.sub_due sd
        WHERE sd.payment_id = v_pid
          AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled';

        v_total_paid := ROUND(GREATEST(0.00, COALESCE(v_parent.amount, 0)) + v_sub_sum, 2);

        SELECT * INTO v_parts
        FROM public.fn_get_loan_installment_parts(
            v_parent.finance_id,
            v_parent.customer_id,
            v_parent.due_date
        );

        IF v_parts.due_amount > 0 AND v_total_paid >= v_parts.due_amount THEN
            v_new_status := 'paid'::payment_status_enum;
        ELSIF v_total_paid > 0 THEN
            v_new_status := 'partial'::payment_status_enum;
        ELSE
            v_new_status := 'pending'::payment_status_enum;
        END IF;

        UPDATE public.payments
        SET status = v_new_status
        WHERE id = v_pid
          AND status IS DISTINCT FROM v_new_status;
    END LOOP;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sub_due_parent_status_sync ON public.sub_due;
CREATE TRIGGER trg_sub_due_parent_status_sync
AFTER INSERT OR UPDATE OR DELETE ON public.sub_due
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_sub_due_parent_status_sync();


-- ============================================================================
-- SECTION 6: ATOMIC MULTI-DUE FIFO PAYMENT ENGINE (`fn_process_customer_payment`)
-- ============================================================================
-- Handles:
--   1. Concurrency lock (`FOR UPDATE` on customer & open `payments` rows).
--   2. Chronological FIFO settlement of ALL existing `pending`/`partial` dues
--      via `sub_due` (not just 1 `last_payment_id`!).
--   3. Current Due + Multi-Month Advance/Catch-Up `payments` allocation with
--      clamped calendar dates (`fn_clamped_installment_date`).
--   4. NBFC Interest-First auto-split per due, PLUS Single-Due Manual Override
--      when the payment touches <= 1 due and custom `p_principal_amount` /
--      `p_interest_amount` are supplied.
--   5. Safe penalty & hand-loan preservation even on 100%-`sub_due` settlements.
--   6. Automatic `recent_activity` audit insertion & 50-row cap.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_process_customer_payment(
    p_finance_id            UUID,
    p_customer_id           UUID,
    p_payment_date          DATE,
    p_amount                NUMERIC(15,2),
    p_principal_amount      NUMERIC(15,2) DEFAULT NULL,
    p_interest_amount       NUMERIC(15,2) DEFAULT NULL,
    p_due_date              DATE          DEFAULT NULL,
    p_due_amount_override   NUMERIC(15,2) DEFAULT NULL,
    p_bill_number           VARCHAR(50)   DEFAULT NULL,
    p_penalty               NUMERIC(15,2) DEFAULT 0.00,
    p_collected_by          VARCHAR(100)  DEFAULT NULL,
    p_collected_by_id       UUID          DEFAULT NULL,
    p_payment_mode          VARCHAR(30)   DEFAULT 'cash',
    p_payment_mode_1        VARCHAR(30)   DEFAULT NULL,
    p_payment_mode_1_amount NUMERIC(15,2) DEFAULT 0.00,
    p_hand_loan             NUMERIC(15,2) DEFAULT 0.00,
    p_hand_loan_remark      TEXT          DEFAULT NULL,
    p_remarks               TEXT          DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cust                   RECORD;
    v_parts                  RECORD;
    v_due_amount             NUMERIC(15,2);
    v_due_principal          NUMERIC(15,2);
    v_due_interest           NUMERIC(15,2);
    v_total_received         NUMERIC(15,2);
    v_penalty                NUMERIC(15,2);
    v_hand_loan              NUMERIC(15,2);
    v_pay_date               DATE;
    v_mode_1                 pay_mode_enum;
    v_mode_2                 pay_mode_enum := NULL;
    v_mode1_rem              NUMERIC(15,2);
    v_mode2_rem              NUMERIC(15,2);
    v_m1_used                NUMERIC(15,2);
    v_m2_used                NUMERIC(15,2);

    v_has_custom_pi          BOOLEAN := FALSE;
    v_custom_p               NUMERIC(15,2) := 0.00;
    v_custom_i               NUMERIC(15,2) := 0.00;
    v_use_single_override    BOOLEAN := FALSE;

    v_open_due_count         INT := 0;
    v_first_open_shortfall   NUMERIC(15,2) := 0.00;

    v_remaining              NUMERIC(15,2);
    v_old_due_cleared        NUMERIC(15,2) := 0.00;
    v_current_paid           NUMERIC(15,2) := 0.00;
    v_total_prin_alloc       NUMERIC(15,2) := 0.00;
    v_total_int_alloc        NUMERIC(15,2) := 0.00;

    r_open                   RECORD;
    v_shortfall              NUMERIC(15,2);
    v_pay_chunk              NUMERIC(15,2);
    v_split                  RECORD;
    v_chunk_p                NUMERIC(15,2);
    v_chunk_i                NUMERIC(15,2);
    v_sub_id                 UUID;
    v_sub_due_ids            UUID[] := ARRAY[]::UUID[];
    v_last_settled_pay_id    UUID := NULL;

    v_max_existing_due       DATE := NULL;
    v_first_new_due          DATE;
    v_target_due             DATE;
    v_step_idx               INT := 0;
    v_new_pay_id             UUID;
    v_current_payment_id     UUID := NULL;
    v_advance_payment_ids    UUID[] := ARRAY[]::UUID[];
    v_row_status             payment_status_enum;
    v_safe_sub_bill          VARCHAR(50);
    v_allocations            JSONB := '[]'::JSONB;
BEGIN
    -- 1. Verify & lock customer under authenticated tenant
    SELECT c.id, c.hplno, c.loan_status
    INTO v_cust
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.finance_id = p_finance_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found or unauthorized for this finance company'
            USING ERRCODE = 'P0002';
    END IF;

    -- 2. Sanitize monetary & date inputs
    v_total_received := GREATEST(0.00, ROUND(COALESCE(p_amount, 0), 2));
    v_penalty        := GREATEST(0.00, ROUND(COALESCE(p_penalty, 0), 2));
    v_hand_loan      := GREATEST(0.00, ROUND(COALESCE(p_hand_loan, 0), 2));
    v_pay_date       := COALESCE(p_payment_date, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE);

    IF v_total_received <= 0.00 AND v_penalty <= 0.00 AND v_hand_loan <= 0.00 THEN
        RAISE EXCEPTION 'Payment amount, penalty, or hand loan must be greater than zero'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Resolve loan contractual installment breakdown
    SELECT * INTO v_parts
    FROM public.fn_get_loan_installment_parts(p_finance_id, p_customer_id, p_due_date);

    v_due_amount := CASE
        WHEN v_parts.due_amount > 0 THEN v_parts.due_amount
        WHEN COALESCE(p_due_amount_override, 0) > 0 THEN ROUND(p_due_amount_override, 2)
        WHEN v_total_received > 0 THEN v_total_received
        ELSE 0.00
    END;
    v_due_interest  := LEAST(v_due_amount, GREATEST(0.00, COALESCE(v_parts.interest_part, 0)));
    v_due_principal := GREATEST(0.00, ROUND(v_due_amount - v_due_interest, 2));

    -- 4. Normalize payment modes & initialize mode buckets
    v_mode_1 := CASE
        WHEN LOWER(TRIM(COALESCE(p_payment_mode, ''))) IN ('cash', 'online', 'bank', 'upi', 'cheque', 'mobile_app', 'other')
            THEN LOWER(TRIM(p_payment_mode))::pay_mode_enum
        WHEN NULLIF(TRIM(COALESCE(p_payment_mode, '')), '') IS NULL
            THEN 'cash'::pay_mode_enum
        ELSE 'other'::pay_mode_enum
    END;
    IF p_payment_mode_1 IS NOT NULL
       AND LOWER(TRIM(p_payment_mode_1)) NOT IN ('', 'none', 'null', 'undefined') THEN
        v_mode_2 := CASE
            WHEN LOWER(TRIM(p_payment_mode_1)) IN ('cash', 'online', 'bank', 'upi', 'cheque', 'mobile_app', 'other')
                THEN LOWER(TRIM(p_payment_mode_1))::pay_mode_enum
            ELSE 'other'::pay_mode_enum
        END;
    END IF;

    v_mode2_rem := CASE
        WHEN v_mode_2 IS NOT NULL
            THEN LEAST(v_total_received, GREATEST(0.00, ROUND(COALESCE(p_payment_mode_1_amount, 0), 2)))
        ELSE 0.00
    END;
    v_mode1_rem := GREATEST(0.00, ROUND(v_total_received - v_mode2_rem, 2));

    -- 5. Lock existing active payments for this customer & inspect open/partial dues
    PERFORM 1
    FROM public.payments p
    WHERE p.customer_id = p_customer_id
      AND (p.finance_id IS NULL OR p.finance_id = p_finance_id)
      AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
    FOR UPDATE;

    IF v_due_amount > 0 THEN
        WITH open_dues AS (
            SELECT
                p.id,
                p.due_date,
                p.created_at,
                ROUND(
                    GREATEST(0.00, COALESCE(p.amount, 0)) + COALESCE((
                        SELECT SUM(GREATEST(0.00, COALESCE(sd.paid_amount, 0)))
                        FROM public.sub_due sd
                        WHERE sd.payment_id = p.id
                          AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled'
                    ), 0.00),
                    2
                ) AS already_paid
            FROM public.payments p
            WHERE p.customer_id = p_customer_id
              AND (p.finance_id IS NULL OR p.finance_id = p_finance_id)
              AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
              AND p.status IN ('pending', 'partial')
        )
        SELECT
            COUNT(*)::INT,
            COALESCE(
                (ARRAY_AGG(
                    ROUND(v_due_amount - od.already_paid, 2)
                    ORDER BY od.due_date ASC NULLS FIRST, od.created_at ASC, od.id ASC
                ))[1],
                0.00
            )
        INTO v_open_due_count, v_first_open_shortfall
        FROM open_dues od
        WHERE od.already_paid < v_due_amount;
    END IF;

    -- 6. Evaluate Single-Due Manual Override Policy
    IF p_principal_amount IS NOT NULL OR p_interest_amount IS NOT NULL THEN
        v_has_custom_pi := TRUE;
        IF p_principal_amount IS NOT NULL AND p_interest_amount IS NULL THEN
            v_custom_p := ROUND(p_principal_amount, 2);
            v_custom_i := ROUND(v_total_received - v_custom_p, 2);
        ELSIF p_interest_amount IS NOT NULL AND p_principal_amount IS NULL THEN
            v_custom_i := ROUND(p_interest_amount, 2);
            v_custom_p := ROUND(v_total_received - v_custom_i, 2);
        ELSE
            v_custom_p := ROUND(p_principal_amount, 2);
            v_custom_i := ROUND(p_interest_amount, 2);
        END IF;

        IF v_custom_p < 0 OR v_custom_i < 0 THEN
            RAISE EXCEPTION 'Principal (%) and Interest (%) cannot be negative',
                v_custom_p, v_custom_i
                USING ERRCODE = '23514';
        END IF;

        IF ROUND(v_custom_p + v_custom_i, 2) <> v_total_received THEN
            RAISE EXCEPTION 'Principal (%) + Interest (%) must equal Total Amount (%)',
                v_custom_p, v_custom_i, v_total_received
                USING ERRCODE = '23514';
        END IF;

        -- Eligible ONLY when payment touches <= 1 due (either <= first open due shortfall, or 0 open dues and <= 1 EMI)
        IF v_total_received > 0 THEN
            IF v_open_due_count >= 1 AND v_total_received <= v_first_open_shortfall THEN
                v_use_single_override := TRUE;
            ELSIF v_open_due_count = 0 AND (v_due_amount <= 0 OR v_total_received <= v_due_amount) THEN
                v_use_single_override := TRUE;
            ELSE
                v_use_single_override := FALSE;
            END IF;
        END IF;
    END IF;

    v_remaining     := v_total_received;
    v_safe_sub_bill := COALESCE(
        NULLIF(TRIM(p_bill_number), ''),
        'SUB-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDDHH24MISS')
    );

    -- 7. STEP 1: Settle ALL Open/Partial Existing Dues in Chronological FIFO Order via `sub_due`
    IF v_remaining > 0.00 AND v_due_amount > 0.00 AND v_open_due_count > 0 THEN
        FOR r_open IN
            SELECT
                p.id,
                p.due_date,
                ROUND(
                    GREATEST(0.00, COALESCE(p.amount, 0)) + COALESCE((
                        SELECT SUM(GREATEST(0.00, COALESCE(sd.paid_amount, 0)))
                        FROM public.sub_due sd
                        WHERE sd.payment_id = p.id
                          AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled'
                    ), 0.00),
                    2
                ) AS row_paid,
                ROUND(
                    GREATEST(0.00, COALESCE(p.interest_amount, 0)) + COALESCE((
                        SELECT SUM(GREATEST(0.00, COALESCE(sd.interest_amount, 0)))
                        FROM public.sub_due sd
                        WHERE sd.payment_id = p.id
                          AND COALESCE(sd.status::TEXT, 'active') <> 'cancelled'
                    ), 0.00),
                    2
                ) AS row_interest_paid
            FROM public.payments p
            WHERE p.customer_id = p_customer_id
              AND (p.finance_id IS NULL OR p.finance_id = p_finance_id)
              AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
              AND p.status IN ('pending', 'partial')
            ORDER BY p.due_date ASC NULLS FIRST, p.created_at ASC, p.id ASC
        LOOP
            EXIT WHEN v_remaining <= 0.00;

            IF r_open.row_paid >= v_due_amount THEN
                CONTINUE;
            END IF;

            v_shortfall := ROUND(v_due_amount - r_open.row_paid, 2);
            v_pay_chunk := LEAST(v_remaining, v_shortfall);

            v_m1_used   := LEAST(v_pay_chunk, v_mode1_rem);
            v_mode1_rem := ROUND(v_mode1_rem - v_m1_used, 2);
            v_m2_used   := LEAST(ROUND(v_pay_chunk - v_m1_used, 2), v_mode2_rem);
            v_mode2_rem := ROUND(v_mode2_rem - v_m2_used, 2);

            IF v_use_single_override THEN
                v_chunk_p := v_custom_p;
                v_chunk_i := v_custom_i;
            ELSE
                SELECT * INTO v_split
                FROM public.fn_split_amount_interest_first(
                    v_pay_chunk,
                    v_due_amount,
                    v_due_interest,
                    r_open.row_interest_paid
                );
                v_chunk_p := v_split.principal_amount;
                v_chunk_i := v_split.interest_amount;
            END IF;

            INSERT INTO public.sub_due (
                finance_id,
                customer_id,
                payment_id,
                bill_number,
                payment_date,
                paid_amount,
                principal_amount,
                interest_amount,
                payment_mode,
                payment_mode_amount,
                payment_mode_1,
                payment_mode_1_amount,
                status,
                collected_by
            ) VALUES (
                p_finance_id,
                p_customer_id,
                r_open.id,
                v_safe_sub_bill,
                v_pay_date,
                v_pay_chunk,
                v_chunk_p,
                v_chunk_i,
                v_mode_1,
                v_m1_used,
                v_mode_2,
                CASE WHEN v_mode_2 IS NOT NULL THEN v_m2_used ELSE NULL END,
                'active'::active_cancelled_enum,
                p_collected_by
            )
            RETURNING id INTO v_sub_id;

            -- Explicit status sync (also guarded by `trg_sub_due_parent_status_sync`)
            v_row_status := CASE
                WHEN ROUND(r_open.row_paid + v_pay_chunk, 2) >= v_due_amount THEN 'paid'::payment_status_enum
                ELSE 'partial'::payment_status_enum
            END;

            UPDATE public.payments
            SET status = v_row_status
            WHERE id = r_open.id
              AND status IS DISTINCT FROM v_row_status;

            v_sub_due_ids         := array_append(v_sub_due_ids, v_sub_id);
            v_last_settled_pay_id := r_open.id;
            v_old_due_cleared     := ROUND(v_old_due_cleared + v_pay_chunk, 2);
            v_total_prin_alloc    := ROUND(v_total_prin_alloc + v_chunk_p, 2);
            v_total_int_alloc     := ROUND(v_total_int_alloc + v_chunk_i, 2);
            v_remaining           := ROUND(v_remaining - v_pay_chunk, 2);

            v_allocations := v_allocations || jsonb_build_array(
                jsonb_build_object(
                    'target', 'sub_due',
                    'sub_due_id', v_sub_id,
                    'parent_payment_id', r_open.id,
                    'due_date', TO_CHAR(r_open.due_date, 'YYYY-MM-DD'),
                    'amount', v_pay_chunk,
                    'principal_amount', v_chunk_p,
                    'interest_amount', v_chunk_i,
                    'parent_status', v_row_status::TEXT
                )
            );
        END LOOP;
    END IF;

    -- 8. Resolve First New Installment `due_date` for Step 2 & Step 3
    SELECT MAX(p.due_date)
    INTO v_max_existing_due
    FROM public.payments p
    WHERE p.customer_id = p_customer_id
      AND (p.finance_id IS NULL OR p.finance_id = p_finance_id)
      AND COALESCE(p.payment_status::TEXT, 'active') <> 'cancelled'
      AND p.due_date IS NOT NULL;

    IF p_due_date IS NOT NULL AND (v_max_existing_due IS NULL OR p_due_date > v_max_existing_due) THEN
        v_first_new_due := p_due_date;
    ELSIF v_max_existing_due IS NOT NULL THEN
        v_first_new_due := public.fn_clamped_installment_date(v_max_existing_due, 1);
    ELSIF v_parts.anchor_date IS NOT NULL THEN
        v_first_new_due := public.fn_clamped_installment_date(v_parts.anchor_date, 1);
    ELSE
        v_first_new_due := COALESCE(p_due_date, v_pay_date);
    END IF;

    -- 9. STEP 2 & STEP 3: Allocate Remaining Cash Across Current Due + Multi-Month Advance Dues
    IF v_remaining > 0.00 THEN
        WHILE v_remaining > 0.00 LOOP
            v_target_due := public.fn_clamped_installment_date(v_first_new_due, v_step_idx);
            v_pay_chunk  := CASE
                WHEN v_due_amount > 0 THEN LEAST(v_remaining, v_due_amount)
                ELSE v_remaining
            END;

            v_m1_used   := LEAST(v_pay_chunk, v_mode1_rem);
            v_mode1_rem := ROUND(v_mode1_rem - v_m1_used, 2);
            v_m2_used   := LEAST(ROUND(v_pay_chunk - v_m1_used, 2), v_mode2_rem);
            v_mode2_rem := ROUND(v_mode2_rem - v_m2_used, 2);

            IF v_step_idx = 0 AND v_use_single_override THEN
                v_chunk_p := v_custom_p;
                v_chunk_i := v_custom_i;
            ELSE
                SELECT * INTO v_split
                FROM public.fn_split_amount_interest_first(
                    v_pay_chunk,
                    v_due_amount,
                    v_due_interest,
                    0.00
                );
                v_chunk_p := v_split.principal_amount;
                v_chunk_i := v_split.interest_amount;
            END IF;

            v_row_status := CASE
                WHEN v_due_amount > 0 AND v_pay_chunk >= v_due_amount THEN 'paid'::payment_status_enum
                WHEN v_pay_chunk > 0 THEN 'partial'::payment_status_enum
                ELSE 'pending'::payment_status_enum
            END;

            INSERT INTO public.payments (
                finance_id,
                customer_id,
                due_date,
                payment_date,
                bill_number,
                amount,
                principal_amount,
                interest_amount,
                penalty,
                status,
                payment_status,
                payment_mode,
                payment_mode_1,
                payment_mode_1_amount,
                collected_by,
                collected_by_id,
                hand_loan,
                hand_loan_remark,
                remarks
            ) VALUES (
                p_finance_id,
                p_customer_id,
                v_target_due,
                v_pay_date,
                NULLIF(TRIM(p_bill_number), ''),
                v_pay_chunk,
                v_chunk_p,
                v_chunk_i,
                CASE WHEN v_step_idx = 0 THEN v_penalty ELSE 0.00 END,
                v_row_status,
                'active'::active_cancelled_enum,
                v_mode_1,
                v_mode_2,
                CASE WHEN v_mode_2 IS NOT NULL THEN v_m2_used ELSE NULL END,
                p_collected_by,
                p_collected_by_id,
                CASE WHEN v_step_idx = 0 THEN v_hand_loan ELSE 0.00 END,
                CASE WHEN v_step_idx = 0 THEN p_hand_loan_remark ELSE NULL END,
                CASE
                    WHEN v_step_idx = 0 THEN p_remarks
                    ELSE '[Advance auto ₹' || TRIM(TO_CHAR(v_pay_chunk, 'FM999999999990.00')) || ']'
                END
            )
            RETURNING id INTO v_new_pay_id;

            IF v_step_idx = 0 THEN
                v_current_payment_id := v_new_pay_id;
                v_current_paid       := v_pay_chunk;
            ELSE
                v_advance_payment_ids := array_append(v_advance_payment_ids, v_new_pay_id);
            END IF;

            v_total_prin_alloc := ROUND(v_total_prin_alloc + v_chunk_p, 2);
            v_total_int_alloc  := ROUND(v_total_int_alloc + v_chunk_i, 2);
            v_remaining        := ROUND(v_remaining - v_pay_chunk, 2);

            v_allocations := v_allocations || jsonb_build_array(
                jsonb_build_object(
                    'target', CASE WHEN v_step_idx = 0 THEN 'current_due' ELSE 'advance_due' END,
                    'payment_id', v_new_pay_id,
                    'due_date', TO_CHAR(v_target_due, 'YYYY-MM-DD'),
                    'amount', v_pay_chunk,
                    'principal_amount', v_chunk_p,
                    'interest_amount', v_chunk_i,
                    'status', v_row_status::TEXT
                )
            );

            v_step_idx := v_step_idx + 1;
        END LOOP;

    ELSIF v_penalty > 0.00 OR v_hand_loan > 0.00 THEN
        -- Preserve penalty / hand_loan when 100% of `p_amount` went to `sub_due` (or penalty-only entry)
        IF v_last_settled_pay_id IS NOT NULL THEN
            UPDATE public.payments
            SET penalty          = ROUND(COALESCE(penalty, 0) + v_penalty, 2),
                hand_loan        = ROUND(COALESCE(hand_loan, 0) + v_hand_loan, 2),
                hand_loan_remark = COALESCE(NULLIF(TRIM(p_hand_loan_remark), ''), hand_loan_remark),
                remarks          = CASE
                    WHEN NULLIF(TRIM(p_remarks), '') IS NULL THEN remarks
                    WHEN NULLIF(TRIM(remarks), '') IS NULL THEN TRIM(p_remarks)
                    ELSE remarks || ' | ' || TRIM(p_remarks)
                END
            WHERE id = v_last_settled_pay_id;
        ELSE
            INSERT INTO public.payments (
                finance_id,
                customer_id,
                due_date,
                payment_date,
                bill_number,
                amount,
                principal_amount,
                interest_amount,
                penalty,
                status,
                payment_status,
                payment_mode,
                collected_by,
                collected_by_id,
                hand_loan,
                hand_loan_remark,
                remarks
            ) VALUES (
                p_finance_id,
                p_customer_id,
                v_first_new_due,
                v_pay_date,
                NULLIF(TRIM(p_bill_number), ''),
                0.00,
                0.00,
                0.00,
                v_penalty,
                'pending'::payment_status_enum,
                'active'::active_cancelled_enum,
                v_mode_1,
                p_collected_by,
                p_collected_by_id,
                v_hand_loan,
                p_hand_loan_remark,
                p_remarks
            )
            RETURNING id INTO v_current_payment_id;
        END IF;
    END IF;

    -- 10. Record `recent_activity` & prune beyond 50 entries per tenant
    INSERT INTO public.recent_activity (
        finance_id,
        type,
        reference_id,
        description,
        amount,
        created_by
    ) VALUES (
        p_finance_id,
        'payment',
        COALESCE(v_cust.hplno::TEXT, p_customer_id::TEXT),
        'Payment ₹' || TRIM(TO_CHAR(v_total_received, 'FM999999999990.00'))
            || ' (P: ₹' || TRIM(TO_CHAR(v_total_prin_alloc, 'FM999999999990.00'))
            || ', I: ₹' || TRIM(TO_CHAR(v_total_int_alloc, 'FM999999999990.00'))
            || ') for ' || COALESCE(v_cust.hplno::TEXT, p_customer_id::TEXT),
        v_total_received,
        COALESCE(NULLIF(TRIM(p_collected_by), ''), 'System')
    );

    DELETE FROM public.recent_activity
    WHERE id IN (
        SELECT ra.id
        FROM public.recent_activity ra
        WHERE ra.finance_id = p_finance_id
        ORDER BY ra.created_at DESC
        OFFSET 50
    );

    RETURN jsonb_build_object(
        'total_received', v_total_received,
        'total_principal_allocated', v_total_prin_alloc,
        'total_interest_allocated', v_total_int_alloc,
        'single_due_override_applied', v_use_single_override,
        'old_due_cleared', v_old_due_cleared,
        'sub_due_ids', COALESCE(to_jsonb(v_sub_due_ids), '[]'::JSONB),
        'current_paid', v_current_paid,
        'payment_id', v_current_payment_id,
        'advance_split', COALESCE(array_length(v_advance_payment_ids, 1), 0),
        'advance_ids', COALESCE(to_jsonb(v_advance_payment_ids), '[]'::JSONB),
        'allocations', v_allocations
    );
END;
$$;


-- ============================================================================
-- SECTION 7: UPGRADE SHARED LEDGER FUNCTION & `ai_ro` VIEWS (WHEN PRESENT)
-- ============================================================================

-- 7.1 Upgrade `fn_calculate_loan_ledger_summary` (from Migration 005) to use
--     actual stored `principal_amount` sums for `outstanding_principal` / `outstanding_interest`
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_calculate_loan_ledger_summary'
    ) THEN
        EXECUTE $fn$
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
        $fn$;
    END IF;
END $$;

-- 7.2 Conditionally append `principal_amount` & `interest_amount` to `ai_ro` views
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'ai_ro') THEN
        EXECUTE $v1$
        CREATE OR REPLACE VIEW ai_ro.payments WITH (security_barrier = true) AS
        SELECT
            id,
            finance_id,
            customer_id,
            due_date,
            payment_date,
            bill_number,
            amount,
            status,
            payment_status,
            cancelled_by,
            penalty,
            collected_by,
            collected_by_id,
            hand_loan,
            hand_loan_remark,
            payment_mode,
            payment_mode_1,
            payment_mode_1_amount,
            remarks,
            edited_by,
            edited_at,
            created_at,
            collection_id,
            voucher_id,
            is_approved,
            approved_by_id,
            approved_at,
            principal_amount,
            interest_amount
        FROM public.payments
        WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;
        $v1$;

        EXECUTE $v2$
        CREATE OR REPLACE VIEW ai_ro.sub_due WITH (security_barrier = true) AS
        SELECT
            id,
            finance_id,
            customer_id,
            payment_id,
            bill_number,
            payment_date,
            paid_amount,
            payment_mode,
            payment_mode_amount,
            payment_mode_1,
            payment_mode_1_amount,
            status,
            collected_by,
            cancelled_by,
            edited_by,
            edited_at,
            created_at,
            updated_at,
            is_approved,
            approved_by_id,
            approved_at,
            principal_amount,
            interest_amount
        FROM public.sub_due
        WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;
        $v2$;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_ai_sql_ro') THEN
            GRANT SELECT ON ai_ro.payments, ai_ro.sub_due TO autofinex_ai_sql_ro;
        END IF;
    END IF;
END $$;


-- ============================================================================
-- SECTION 8: LEAST-PRIVILEGE ROLE GRANTS
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_process_customer_payment(
    UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC, DATE, NUMERIC, VARCHAR,
    NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT, TEXT
) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_voice_ro') THEN
        REVOKE EXECUTE ON FUNCTION public.fn_process_customer_payment(
            UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC, DATE, NUMERIC, VARCHAR,
            NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT, TEXT
        ) FROM autofinex_voice_ro;

        GRANT EXECUTE ON FUNCTION public.fn_get_loan_installment_parts(UUID, UUID, DATE) TO autofinex_voice_ro;
        GRANT EXECUTE ON FUNCTION public.fn_split_amount_interest_first(NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO autofinex_voice_ro;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_ai_sql_ro') THEN
        REVOKE EXECUTE ON FUNCTION public.fn_process_customer_payment(
            UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC, DATE, NUMERIC, VARCHAR,
            NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT, TEXT
        ) FROM autofinex_ai_sql_ro;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_developer') THEN
        GRANT EXECUTE ON FUNCTION public.fn_get_loan_installment_parts(UUID, UUID, DATE) TO autofinex_developer;
        GRANT EXECUTE ON FUNCTION public.fn_split_amount_interest_first(NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO autofinex_developer;
        GRANT EXECUTE ON FUNCTION public.fn_process_customer_payment(
            UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC, DATE, NUMERIC, VARCHAR,
            NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT, TEXT
        ) TO autofinex_developer;
    END IF;
END $$;

COMMIT;


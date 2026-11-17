-- ============================================================================
-- DEV-COPY VERIFICATION SCRIPT (DO NOT RUN AGAINST LIVE PRODUCTION)
--
-- File: backend/scripts/verify_voice_ro_rls_dev.sql
-- Purpose:
--   Verifies `propose_voice_ro_rls_and_fn_tenant_hardening.sql` inside a
--   non-destructive `BEGIN ... ROLLBACK;` transaction on a DEV database copy:
--     1. `autofinex_developer` (Node RW role) reads and updates across tenants
--        without `app.current_finance_id` set (100% unchanged ERP behavior).
--     2. `autofinex_voice_ro` with unset `app.current_finance_id` sees 0 rows
--        on tenant tables and receives SQLSTATE `42501` from all 4 read functions:
--          - `fn_calculate_loan_ledger_summary`
--          - `fn_get_voice_loan_financial_facts`
--          - `fn_get_precall_memory_bundle`
--          - `fn_calculate_customer_due_summary`
--     3. `autofinex_voice_ro` with `app.current_finance_id = <tenant_A>` reads
--        Tenant A rows & functions cleanly, sees 0 rows for Tenant B, and
--        receives SQLSTATE `42501` when passing `<tenant_B>` or `<customer_B>`
--        into any of the 4 read functions.
-- ============================================================================

BEGIN;

DO $verify$
DECLARE
    v_fin_a UUID;
    v_cust_a UUID;
    v_fin_b UUID;
    v_cust_b UUID;
    v_cnt INT;
    v_err_caught BOOLEAN;
BEGIN
    SELECT c.finance_id, c.id
    INTO v_fin_a, v_cust_a
    FROM public.customers c
    ORDER BY c.created_at ASC
    LIMIT 1;

    SELECT c.finance_id, c.id
    INTO v_fin_b, v_cust_b
    FROM public.customers c
    WHERE c.finance_id IS DISTINCT FROM v_fin_a
    ORDER BY c.created_at ASC
    LIMIT 1;

    IF v_fin_a IS NULL OR v_fin_b IS NULL THEN
        RAISE EXCEPTION 'DEV copy requires at least 2 distinct finance_id rows in public.customers to test cross-tenant isolation';
    END IF;

    -- ------------------------------------------------------------------------
    -- 1. Verify `autofinex_developer` RW behavior is 100% unchanged without GUC
    -- ------------------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE autofinex_developer';
    PERFORM set_config('app.current_finance_id', '', true);

    SELECT COUNT(*)::INT INTO v_cnt
    FROM public.customers
    WHERE id IN (v_cust_a, v_cust_b);

    IF v_cnt <> 2 THEN
        RAISE EXCEPTION 'FAILURE: autofinex_developer could not see both tenant customers without GUC (got %)', v_cnt;
    END IF;

    -- ------------------------------------------------------------------------
    -- 2. Verify `autofinex_voice_ro` with unset GUC is blocked everywhere
    -- ------------------------------------------------------------------------
    EXECUTE 'SET LOCAL ROLE autofinex_voice_ro';
    PERFORM set_config('app.current_finance_id', '', true);

    SELECT COUNT(*)::INT INTO v_cnt FROM public.customers;
    IF v_cnt <> 0 THEN
        RAISE EXCEPTION 'FAILURE: autofinex_voice_ro saw % customer rows with unset app.current_finance_id', v_cnt;
    END IF;

    v_err_caught := FALSE;
    BEGIN
        PERFORM * FROM public.fn_calculate_loan_ledger_summary(v_fin_a, v_cust_a, NULL, CURRENT_DATE);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := TRUE;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAILURE: fn_calculate_loan_ledger_summary allowed unset GUC for autofinex_voice_ro';
    END IF;

    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_get_voice_loan_financial_facts(v_fin_a, v_cust_a, NULL);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := TRUE;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAILURE: fn_get_voice_loan_financial_facts allowed unset GUC for autofinex_voice_ro';
    END IF;

    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_get_precall_memory_bundle(v_fin_a, v_cust_a);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := TRUE;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAILURE: fn_get_precall_memory_bundle allowed unset GUC for autofinex_voice_ro';
    END IF;

    v_err_caught := FALSE;
    BEGIN
        PERFORM * FROM public.fn_calculate_customer_due_summary(v_cust_a, CURRENT_DATE);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := TRUE;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAILURE: fn_calculate_customer_due_summary allowed unset GUC for autofinex_voice_ro';
    END IF;

    -- ------------------------------------------------------------------------
    -- 3. Pin `app.current_finance_id = v_fin_a`: Tenant A allowed, Tenant B blocked
    -- ------------------------------------------------------------------------
    PERFORM set_config('app.current_finance_id', v_fin_a::TEXT, true);

    SELECT COUNT(*)::INT INTO v_cnt FROM public.customers WHERE finance_id = v_fin_b;
    IF v_cnt <> 0 THEN
        RAISE EXCEPTION 'FAILURE: autofinex_voice_ro saw % Tenant B rows while pinned to Tenant A', v_cnt;
    END IF;

    PERFORM * FROM public.fn_calculate_loan_ledger_summary(v_fin_a, v_cust_a, NULL, CURRENT_DATE);
    PERFORM public.fn_get_voice_loan_financial_facts(v_fin_a, v_cust_a, NULL);
    PERFORM public.fn_get_precall_memory_bundle(v_fin_a, v_cust_a);
    PERFORM * FROM public.fn_calculate_customer_due_summary(v_cust_a, CURRENT_DATE);

    -- Cross-tenant function calls MUST fail with SQLSTATE 42501 (`insufficient_privilege`)
    v_err_caught := FALSE;
    BEGIN
        PERFORM * FROM public.fn_calculate_loan_ledger_summary(v_fin_b, v_cust_b, NULL, CURRENT_DATE);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := TRUE;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAILURE: fn_calculate_loan_ledger_summary allowed cross-tenant p_finance_id';
    END IF;

    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_get_voice_loan_financial_facts(v_fin_a, v_cust_b, NULL);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := TRUE;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAILURE: fn_get_voice_loan_financial_facts allowed cross-tenant p_customer_id';
    END IF;

    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_get_precall_memory_bundle(v_fin_b, v_cust_b);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := TRUE;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAILURE: fn_get_precall_memory_bundle allowed cross-tenant p_finance_id';
    END IF;

    v_err_caught := FALSE;
    BEGIN
        PERFORM * FROM public.fn_calculate_customer_due_summary(v_cust_b, CURRENT_DATE);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := TRUE;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAILURE: fn_calculate_customer_due_summary allowed cross-tenant p_customer_id';
    END IF;

    RAISE NOTICE 'ALL RLS AND READ-FUNCTION TENANT ISOLATION CHECKS PASSED!';
END;
$verify$;

ROLLBACK;

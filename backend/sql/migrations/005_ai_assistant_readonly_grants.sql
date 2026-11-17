-- ============================================================================
--  AUTOFINEX AI VOICE ASSISTANT — MIGRATION 005 (SAFE REVIEW-READY GRANTS)
--  Extends read-only role `autofinex_voice_ro` (from Migration 004) with
--  SELECT-only permissions on Dashboard / Collection / Expense / Accounting
--  summary tables and strictly non-secret Staff display columns.
--
--  SECURITY GUARANTEES:
--    * 100% Idempotent & Read-Only Grants ONLY (`SELECT`).
--    * Explicitly REVOKES all write privileges (`INSERT`, `UPDATE`, `DELETE`,
--      `TRUNCATE`) across `public`.
--    * NEVER grants access to `owner`, `refresh_tokens`, `otp_verifications`,
--      `kyc_documents`, or secret columns (`users.password`, `users.reset_token`,
--      `users_details.pan_number`, `users_details.bank_account_number`).
--    * Do NOT hardcode passwords here; set password separately via psql/pgAdmin:
--        ALTER ROLE autofinex_voice_ro WITH LOGIN PASSWORD '<strong-secret>';
-- ============================================================================

BEGIN;

DO $$
BEGIN
    -- Managed PostgreSQL 16+/18+ (e.g. Aiven `avnadmin` with CREATEROLE) disallows
    -- `NOSUPERUSER` / `NOREPLICATION` inside `CREATE/ALTER ROLE`; roles already default
    -- to `NOSUPERUSER NOREPLICATION NOBYPASSRLS`.
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

ALTER ROLE autofinex_voice_ro SET default_transaction_read_only = on;
ALTER ROLE autofinex_voice_ro SET statement_timeout = '3s';
ALTER ROLE autofinex_voice_ro SET idle_in_transaction_session_timeout = '5s';

GRANT USAGE ON SCHEMA public TO autofinex_voice_ro;

-- Ensure zero write permissions exist on any table or sequence in `public`
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM autofinex_voice_ro;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM autofinex_voice_ro;

-- 1. Grant table-level SELECT on approved tenant-scoped business analytics tables
DO $$
DECLARE
    v_tbl TEXT;
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
        'seizing_vehicle',
        'office_expenses',
        'vehicle_expenses',
        'customer_agent_assignments',
        'addresses',
        'address_history',
        'acc_group_master',
        'acc_ledger_groups',
        'acc_ledgers',
        'acc_vouchers',
        'acc_voucher_entries'
    ] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            EXECUTE format('GRANT SELECT ON TABLE public.%I TO autofinex_voice_ro', v_tbl);
        END IF;
    END LOOP;
END $$;

-- 2. Grant strictly COLUMN-LEVEL SELECT on staff/agent lookup tables
--    (Prevents `autofinex_voice_ro` from EVER reading password hashes, reset tokens,
--     PAN numbers, or bank account numbers even at the PostgreSQL catalog level!)
DO $$
BEGIN
    IF to_regclass('public.users') IS NOT NULL THEN
        REVOKE ALL ON TABLE public.users FROM autofinex_voice_ro;
        GRANT SELECT (id, username, is_active, created_at) ON TABLE public.users TO autofinex_voice_ro;
    END IF;

    IF to_regclass('public.user_allowed_companies') IS NOT NULL THEN
        REVOKE ALL ON TABLE public.user_allowed_companies FROM autofinex_voice_ro;
        GRANT SELECT (id, user_id, finance_id, role, is_active) ON TABLE public.user_allowed_companies TO autofinex_voice_ro;
    END IF;

    IF to_regclass('public.users_details') IS NOT NULL THEN
        REVOKE ALL ON TABLE public.users_details FROM autofinex_voice_ro;
        GRANT SELECT (id, user_id, finance_id, staff_name, staff_code) ON TABLE public.users_details TO autofinex_voice_ro;
    END IF;
END $$;

COMMIT;


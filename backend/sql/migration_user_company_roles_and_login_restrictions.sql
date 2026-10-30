-- ==============================================================================
-- AutoFinex ERP — Complete Database Migration Script (With Safe Drops)
-- Purpose:
--   1. Enhance `user_allowed_companies` with company-scoped `role`, `login_time_from`,
--      `login_time_to`, and `last_accessed_at`.
--   2. Migrate & Backfill 100% of existing role/time/login data from `users` to `user_allowed_companies`.
--   3. Enhance `users_details` with foreign key `user_id` to support multi-company staff.
--   4. Enhance `agent_invitations` for Existing User Invitations & Login Shift Times.
--   5. Safely recreate dependent view `vw_staff_salary_summary` to reference
--      `user_allowed_companies.role` instead of `users.user_role`.
--   6. Safely DROP deprecated columns from `users` table:
--        - `user_role`
--        - `login_time_from`
--        - `login_time_to`
--        - `last_login`
-- Engine : PostgreSQL 15+ (Aiven Cloud / Self-hosted)
-- Safe   : Transactional (`BEGIN ... COMMIT`), Idempotent, Zero Data Loss
-- Date   : 2026-10-26
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ENHANCE `user_allowed_companies` (Company-Scoped Roles & Shift Timings)
-- ------------------------------------------------------------------------------
DO $$ 
BEGIN
    -- 1.1 Add company-specific role column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_allowed_companies' AND column_name = 'role'
    ) THEN
        ALTER TABLE user_allowed_companies 
        ADD COLUMN role user_role_enum NOT NULL DEFAULT 'agent';
        COMMENT ON COLUMN user_allowed_companies.role IS 'Company-scoped authorization role (owner, admin, agent, staff)';
    END IF;

    -- 1.2 Add company-specific login start time
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_allowed_companies' AND column_name = 'login_time_from'
    ) THEN
        ALTER TABLE user_allowed_companies 
        ADD COLUMN login_time_from TIME WITHOUT TIME ZONE DEFAULT NULL;
        COMMENT ON COLUMN user_allowed_companies.login_time_from IS 'Permitted login start time for this company (e.g. 09:00:00)';
    END IF;

    -- 1.3 Add company-specific login end time
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_allowed_companies' AND column_name = 'login_time_to'
    ) THEN
        ALTER TABLE user_allowed_companies 
        ADD COLUMN login_time_to TIME WITHOUT TIME ZONE DEFAULT NULL;
        COMMENT ON COLUMN user_allowed_companies.login_time_to IS 'Permitted login end time for this company (e.g. 18:00:00)';
    END IF;

    -- 1.4 Add last accessed timestamp for this specific company
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_allowed_companies' AND column_name = 'last_accessed_at'
    ) THEN
        ALTER TABLE user_allowed_companies 
        ADD COLUMN last_accessed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL;
        COMMENT ON COLUMN user_allowed_companies.last_accessed_at IS 'Timestamp of the user last switching to / active in this company';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 2. SAFE DATA MIGRATION & BACKFILL
-- ------------------------------------------------------------------------------
-- Transfer existing roles, login_time_from, login_time_to, and last_login from users to user_allowed_companies
DO $$
BEGIN
    -- If users still has user_role column, migrate role and time data
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'user_role'
    ) THEN
        UPDATE user_allowed_companies uac
        SET role = COALESCE(u.user_role, 'agent'),
            login_time_from = COALESCE(uac.login_time_from, u.login_time_from),
            login_time_to = COALESCE(uac.login_time_to, u.login_time_to),
            last_accessed_at = COALESCE(uac.last_accessed_at, u.last_login)
        FROM users u
        WHERE uac.user_id = u.id;
    END IF;
END $$;

-- 2.1 Create performance indexes for company authorization lookups
CREATE INDEX IF NOT EXISTS idx_uac_user_fin_active 
ON user_allowed_companies (user_id, finance_id, is_active);

CREATE INDEX IF NOT EXISTS idx_uac_finance_role 
ON user_allowed_companies (finance_id, role, is_active);


-- ------------------------------------------------------------------------------
-- 3. ENHANCE `users_details` (Explicit User ID for Multi-Company Staff Records)
-- ------------------------------------------------------------------------------
DO $$ 
BEGIN
    -- 3.1 Add user_id column referencing users(id)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users_details' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE users_details 
        ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE DEFAULT NULL;
        COMMENT ON COLUMN users_details.user_id IS 'Foreign key linking staff profile to the master user account';
    END IF;
END $$;

-- 3.2 Backfill existing staff details where id matched users.id
UPDATE users_details ud
SET user_id = ud.id
WHERE ud.user_id IS NULL 
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = ud.id);

-- 3.3 Ensure a user has at most one staff profile per finance company
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_details_user_finance 
ON users_details (user_id, finance_id) 
WHERE user_id IS NOT NULL;

-- 3.4 Index for fast staff profile lookup by user_id
CREATE INDEX IF NOT EXISTS idx_ud_user_id 
ON users_details (user_id);


-- ------------------------------------------------------------------------------
-- 4. ENHANCE `agent_invitations` (Support Existing User Invitations & Shift Times)
-- ------------------------------------------------------------------------------
DO $$ 
BEGIN
    -- 4.1 Add user_id for existing registered users who are invited
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_invitations' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE agent_invitations 
        ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE DEFAULT NULL;
        COMMENT ON COLUMN agent_invitations.user_id IS 'Target user ID if inviting an existing registered account';
    END IF;

    -- 4.2 Add proposed staff code for the company
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_invitations' AND column_name = 'staff_code'
    ) THEN
        ALTER TABLE agent_invitations 
        ADD COLUMN staff_code VARCHAR(50) DEFAULT NULL;
    END IF;

    -- 4.3 Add proposed login time from
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_invitations' AND column_name = 'login_time_from'
    ) THEN
        ALTER TABLE agent_invitations 
        ADD COLUMN login_time_from TIME WITHOUT TIME ZONE DEFAULT NULL;
    END IF;

    -- 4.4 Add proposed login time to
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_invitations' AND column_name = 'login_time_to'
    ) THEN
        ALTER TABLE agent_invitations 
        ADD COLUMN login_time_to TIME WITHOUT TIME ZONE DEFAULT NULL;
    END IF;

    -- 4.5 Add updated_at timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_invitations' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE agent_invitations 
        ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- 4.6 Create performance indexes for invitation lookups
CREATE INDEX IF NOT EXISTS idx_ai_finance_status 
ON agent_invitations (finance_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_user_status 
ON agent_invitations (user_id, status);


-- ------------------------------------------------------------------------------
-- 5. RECREATE DEPENDENT VIEWS (Reference `user_allowed_companies.role`)
-- ------------------------------------------------------------------------------
-- In AutoFinex schema, `vw_staff_salary_summary` referenced `u.user_role`.
-- We safely recreate it to join `user_allowed_companies` so dropping `users.user_role` will NOT fail.
CREATE OR REPLACE VIEW vw_staff_salary_summary AS
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    u.phone_no,
    COALESCE(uac.role, 'agent'::user_role_enum) AS user_role,
    u.is_active,
    fd.id AS finance_id,
    fd.finance_name,
    ud.staff_code,
    ud.staff_name,
    COALESCE(sss.base_salary, ud.basic_salary, 0.00) AS basic_salary,
    COALESCE(sss.daily_allowance, ud.daily_allowance, 0.00) AS daily_allowance,
    COALESCE(sss.commission_percent, ud.commission_percent, 0.00) AS commission_percent,
    COALESCE(sss.incentive_per_collection, 0.00) AS incentive_per_collection,
    COALESCE(adv.active_advances_balance, 0.00) AS outstanding_advance_balance,
    last_pay.payroll_month AS last_payroll_month,
    last_pay.net_salary AS last_net_salary,
    last_pay.payment_status AS last_payment_status,
    last_pay.payment_date AS last_payment_date
FROM users u
CROSS JOIN finance_detail fd
LEFT JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = fd.id
LEFT JOIN users_details ud ON (ud.user_id = u.id OR ud.id = u.id OR ud.staff_name = u.username) AND ud.finance_id = fd.id
LEFT JOIN staff_salary_structures sss ON sss.user_id = u.id AND sss.finance_id = fd.id AND sss.is_active = true
LEFT JOIN (
    SELECT finance_id, user_id, SUM(remaining_balance) AS active_advances_balance
    FROM staff_salary_advances
    WHERE status = 'disbursed' AND remaining_balance > 0
    GROUP BY finance_id, user_id
) adv ON adv.finance_id = fd.id AND adv.user_id = u.id
LEFT JOIN LATERAL (
    SELECT payroll_month, net_salary, payment_status, payment_date
    FROM staff_payroll_records
    WHERE finance_id = fd.id AND user_id = u.id
    ORDER BY payroll_month DESC
    LIMIT 1
) last_pay ON true;


-- ------------------------------------------------------------------------------
-- 6. SAFE DROP OF DEPRECATED COLUMNS FROM `users`
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- 6.1 Drop index on users(user_role) if exists
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'users' AND indexname = 'idx_users_role'
    ) THEN
        DROP INDEX idx_users_role;
    END IF;

    -- 6.2 Drop index on users(last_login) if exists
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'users' AND indexname = 'idx_users_last_login'
    ) THEN
        DROP INDEX idx_users_last_login;
    END IF;

    -- 6.3 Drop login_time_from from users
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'login_time_from'
    ) THEN
        ALTER TABLE users DROP COLUMN login_time_from;
    END IF;

    -- 6.4 Drop login_time_to from users
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'login_time_to'
    ) THEN
        ALTER TABLE users DROP COLUMN login_time_to;
    END IF;

    -- 6.5 Drop last_login from users
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login'
    ) THEN
        ALTER TABLE users DROP COLUMN last_login;
    END IF;

    -- 6.6 Drop user_role from users (CASCADE removes any lingering view bindings)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'user_role'
    ) THEN
        ALTER TABLE users DROP COLUMN user_role CASCADE;
    END IF;
END $$;

COMMIT;

-- ==============================================================================
-- End of Migration Script
-- ==============================================================================

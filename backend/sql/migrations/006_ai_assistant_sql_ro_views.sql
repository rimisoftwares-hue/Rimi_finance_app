-- ============================================================================
--  AUTOFINEX AI ASSISTANT — MIGRATION 006 (DYNAMIC READ-ONLY SQL VIEWS & ROLE)
--
--  Creates:
--    1. Dedicated read-only role `autofinex_ai_sql_ro` (separate from
--       `autofinex_voice_ro`, which remains untouched for telecalling & fast KPIs).
--    2. Dedicated schema `ai_ro` containing `security_barrier = true` views
--       that enforce `app.current_finance_id` tenant isolation inside PostgreSQL
--       itself (returning 0 rows whenever `app.current_finance_id` is unset).
--    3. Zero grants on `public.*`; `USAGE` + `SELECT` on `ai_ro` views ONLY,
--       plus `ALTER DEFAULT PRIVILEGES IN SCHEMA ai_ro`.
--    4. Excludes credentials, tokens, government IDs (`aadhar_id`,
--       `other_govt_id_number`, `pan`, `pan_number`), and bank `account_number`.
--
--  AFTER RUNNING THIS MIGRATION AS ADMIN (e.g. `avnadmin`), SET THE PASSWORD
--  SEPARATELY (NEVER COMMIT PASSWORDS IN SQL FILES):
--    ALTER ROLE autofinex_ai_sql_ro WITH LOGIN PASSWORD '<strong-random-password>';
--
--  AND SET IN `backend/.env.local`:
--    AI_SQL_RO_DB_USER=autofinex_ai_sql_ro
--    AI_SQL_RO_DB_PASSWORD=<strong-random-password>
-- ============================================================================

BEGIN;

-- 1. Create / normalize dedicated read-only login role `autofinex_ai_sql_ro`
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_ai_sql_ro') THEN
        CREATE ROLE autofinex_ai_sql_ro WITH
            LOGIN
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT;
    ELSE
        ALTER ROLE autofinex_ai_sql_ro WITH
            LOGIN
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT;
    END IF;
END $$;

ALTER ROLE autofinex_ai_sql_ro SET default_transaction_read_only = on;
ALTER ROLE autofinex_ai_sql_ro SET statement_timeout = '3s';
ALTER ROLE autofinex_ai_sql_ro SET lock_timeout = '1s';
ALTER ROLE autofinex_ai_sql_ro SET idle_in_transaction_session_timeout = '5s';
ALTER ROLE autofinex_ai_sql_ro SET search_path = ai_ro;

-- 2. Revoke ALL direct privileges on `public` schema, tables, sequences, and functions
REVOKE ALL PRIVILEGES ON SCHEMA public FROM autofinex_ai_sql_ro;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM autofinex_ai_sql_ro;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM autofinex_ai_sql_ro;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM autofinex_ai_sql_ro;

-- 3. Create isolated `ai_ro` schema
CREATE SCHEMA IF NOT EXISTS ai_ro;

-- 4. Create tenant-isolated `security_barrier = true` views (all columns verified against `information_schema.columns`)

CREATE OR REPLACE VIEW ai_ro.finance_detail WITH (security_barrier = true) AS
SELECT
    id,
    id AS finance_id,
    finance_name,
    phone_numbers,
    emails,
    is_active,
    since,
    address_id,
    established_date,
    created_at,
    updated_at
FROM public.finance_detail
WHERE id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.customers WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    hplno,
    loan_status,
    broker_name,
    cname,
    cfname_value,
    cfname_unit,
    vehicle_id,
    profession,
    work_office_address,
    home_address,
    current_address,
    created_at
FROM public.customers
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.contacts WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    contact_type,
    type,
    number,
    phone_e164,
    is_dnc,
    dnc_reason,
    dnc_updated_at
FROM public.contacts
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.guardians WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    gname,
    gfname_value,
    gfname_unit,
    profession,
    remarks,
    work_office_address
FROM public.guardians
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.addresses WITH (security_barrier = true) AS
SELECT
    a.id,
    a.house_no,
    a.street,
    a.street_name,
    a.village,
    a.land_mark,
    a.address,
    a.city,
    a.district,
    a.state,
    a.pincode,
    a.location,
    a.label,
    a.created_at
FROM public.addresses a
WHERE NULLIF(current_setting('app.current_finance_id', true), '') IS NOT NULL
  AND (
    EXISTS (
        SELECT 1
        FROM public.address_history ah
        JOIN public.customers c
          ON ah.entity_type::text = 'customer'
         AND ah.entity_id = c.id::text
        WHERE ah.address_id = a.id
          AND c.finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
    )
    OR EXISTS (
        SELECT 1
        FROM public.address_history ah
        JOIN public.guardians g
          ON ah.entity_type::text = 'guardian'
         AND ah.entity_id = g.id::text
        WHERE ah.address_id = a.id
          AND g.finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
    )
    OR EXISTS (
        SELECT 1
        FROM public.finance_detail fd
        WHERE fd.address_id = a.id
          AND fd.id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
    )
  );

CREATE OR REPLACE VIEW ai_ro.address_history WITH (security_barrier = true) AS
SELECT
    ah.id,
    ah.entity_type,
    ah.entity_id,
    ah.address_id,
    ah.is_current,
    ah.changed_at
FROM public.address_history ah
WHERE NULLIF(current_setting('app.current_finance_id', true), '') IS NOT NULL
  AND (
    EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE ah.entity_type::text = 'customer'
          AND ah.entity_id = c.id::text
          AND c.finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
    )
    OR EXISTS (
        SELECT 1
        FROM public.guardians g
        WHERE ah.entity_type::text = 'guardian'
          AND ah.entity_id = g.id::text
          AND g.finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
    )
  );

CREATE OR REPLACE VIEW ai_ro.loans WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    vehicle_id,
    loan_type,
    hp_amount,
    hp_date,
    due_date,
    due_month,
    interest_rate,
    penalty_amount,
    penalty_days,
    principle_part,
    interest_part,
    due_amount,
    down_payment,
    net_payment,
    net_payable,
    pay_mode_1_amount,
    hand_loan,
    hand_loan_remarks,
    broker_name,
    dealer_name,
    documentation_charge,
    broker_commission,
    remarks,
    disbursement_voucher_id
FROM public.loans
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

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
    approved_at
FROM public.payments
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

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
    approved_at
FROM public.sub_due
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.penalties WITH (security_barrier = true) AS
SELECT
    p.id,
    p.loan_id,
    p.overdue_days,
    p.per_day_rate,
    p.base_penalty,
    p.other_charges,
    p.total_penalty,
    p.calculated_at,
    p.settled_payment_id
FROM public.penalties p
WHERE EXISTS (
    SELECT 1
    FROM public.loans l
    WHERE l.id = p.loan_id
      AND l.finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
);

CREATE OR REPLACE VIEW ai_ro.promise_to_pay WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    loan_id,
    user_id,
    promised_amount,
    promised_date,
    promised_time_text,
    ptp_status,
    broken_count,
    reason,
    note,
    is_partial_payment,
    baseline_paid_amount,
    verified_paid_amount,
    verified_payment_id,
    verified_at,
    is_superseded,
    last_follow_up_date,
    call_log_id,
    created_at,
    updated_at
FROM public.promise_to_pay
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.customer_agent_assignments WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    agent_id,
    assigned_by,
    priority,
    status,
    due_amount,
    notes,
    assigned_at,
    unassigned_at,
    completed_at,
    target_date
FROM public.customer_agent_assignments
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.vehicle_detail WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    vehicle_info_id,
    vehicle_number,
    vehicle_modal,
    chassis_number,
    engine_number,
    num_owner,
    trip_driven,
    color,
    variant,
    selling_price,
    emi_from,
    base_price,
    final_price,
    minimum_down_payment,
    status,
    created_date,
    selling_date,
    deal_type,
    rc_holder,
    rc_status,
    fc_expiry_date,
    insurance_expiry_date,
    remarks,
    created_at,
    updated_at
FROM public.vehicle_detail
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.vehicle_info WITH (security_barrier = true) AS
SELECT
    vi.id,
    vi.brand,
    vi.model_name,
    vi.make_year,
    vi.fuel_type,
    vi.engine_capacity,
    vi.fuel_tank_capacity,
    vi.max_torque,
    vi.top_speed,
    vi.mileage,
    vi.transmission,
    vi.seating_capacity,
    vi.body_type,
    vi.base_price,
    vi.created_at,
    vi.updated_at
FROM public.vehicle_info vi
WHERE EXISTS (
    SELECT 1
    FROM public.vehicle_detail vd
    WHERE vd.vehicle_info_id = vi.id
      AND vd.finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
);

CREATE OR REPLACE VIEW ai_ro.seizing_vehicle WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    vehicle_id,
    godown_id,
    seizing_charge,
    description,
    seized_by,
    seizing_date,
    status,
    release_date,
    bill_number,
    created_at,
    updated_at
FROM public.seizing_vehicle
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.godowns WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    name,
    address,
    city,
    contact_person,
    contact_number,
    is_active,
    created_at,
    updated_at
FROM public.godowns
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.staff_members WITH (security_barrier = true) AS
SELECT
    u.id AS user_id,
    uac.finance_id,
    u.username,
    u.email,
    u.phone_no,
    uac.role,
    uac.is_active,
    uac.assigned_at,
    ud.staff_name,
    ud.staff_code,
    ud.joining_date,
    ud.experience_years
FROM public.user_allowed_companies uac
JOIN public.users u
  ON u.id = uac.user_id
LEFT JOIN public.users_details ud
  ON ud.user_id = uac.user_id
 AND ud.finance_id = uac.finance_id
WHERE uac.finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.ai_telecalling_leads WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    loan_id,
    phone_e164,
    days_overdue,
    installment_amount,
    overdue_amount,
    total_balance_amount,
    pending_emi_count,
    earliest_unpaid_due_date,
    next_due_date,
    call_status,
    last_call_at,
    last_call_duration,
    duration_seconds,
    call_outcome_note,
    scheduled_time,
    schedule_preset,
    assigned_agent_id,
    ptp_id,
    attempt_count,
    daily_attempt_count,
    daily_attempt_date,
    priority,
    callback_requested,
    is_suppressed,
    suppression_reason,
    notes,
    created_at,
    updated_at
FROM public.ai_telecalling_leads
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.ai_telecalling_call_logs WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    lead_id,
    customer_id,
    loan_id,
    call_status,
    call_lifecycle_status,
    call_duration_seconds,
    started_at,
    ended_at,
    call_outcome_note,
    disposition,
    caller_type,
    called_by_user_id,
    phone_e164,
    language_used,
    sentiment,
    identity_verified,
    due_amount_at_call,
    answered,
    customer_spoke,
    callback_id,
    created_at
FROM public.ai_telecalling_call_logs
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.voice_callbacks WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    loan_id,
    call_id,
    phone_e164,
    requested_at,
    scheduled_at,
    timezone,
    callback_status,
    source,
    customer_note,
    attempt_count,
    max_attempts,
    cancel_reason,
    created_at,
    updated_at
FROM public.voice_callbacks
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.voice_call_summaries WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    loan_id,
    call_log_id,
    ptp_id,
    call_date,
    language_used,
    outcome,
    summary_short,
    customer_stated_reason,
    commitment_summary,
    observable_tone,
    aggression_level,
    requested_human,
    is_superseded,
    created_at
FROM public.voice_call_summaries
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.voice_customer_memory WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    customer_id,
    active_loan_id,
    preferred_language,
    language_confirmed,
    preferred_call_time,
    communication_style,
    recurring_delay_reason,
    rolling_summary,
    recent_interaction_digest,
    total_calls,
    answered_calls,
    ptp_kept_count,
    ptp_broken_count,
    last_outcome,
    last_called_at,
    created_at,
    updated_at
FROM public.voice_customer_memory
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

-- Owner/Admin financial & accounting views (staff/agent blocked by `sqlValidator.js`)

CREATE OR REPLACE VIEW ai_ro.office_expenses WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    transaction_type,
    expense_date,
    category,
    description,
    amount,
    entered_by,
    created_at,
    updated_at
FROM public.office_expenses
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.vehicle_expenses WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    vehicle_id,
    expense_date,
    description,
    amount,
    created_at,
    updated_at
FROM public.vehicle_expenses
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_group_master WITH (security_barrier = true) AS
SELECT
    id,
    group_name,
    parent_id,
    nature,
    affects_gross_profit,
    behaves_like_subledger,
    nett_balance_report,
    sequence_order,
    is_active
FROM public.acc_group_master
WHERE NULLIF(current_setting('app.current_finance_id', true), '')::uuid IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM public.finance_detail fd
      WHERE fd.id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid
  );

CREATE OR REPLACE VIEW ai_ro.acc_ledger_groups WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    group_name,
    alias,
    parent_group_id,
    nature,
    affects_gross_profit,
    behaves_like_subledger,
    nett_balance_report,
    used_for_calculation,
    is_system,
    system_group_type,
    is_active,
    system_parent_id,
    custom_parent_id,
    root_master_id,
    created_at,
    updated_at
FROM public.acc_ledger_groups
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_ledgers WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    ledger_code,
    ledger_name,
    alias,
    group_id,
    master_group_id,
    reporting_under,
    opening_balance,
    ob_type,
    customer_id,
    vehicle_id,
    gstin,
    tax_type,
    is_bank_account,
    bank_name,
    bank_branch,
    upi_id,
    is_system,
    is_active,
    inactive,
    effective_date,
    notes,
    remarks,
    address,
    contact,
    created_at,
    updated_at
FROM public.acc_ledgers
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_ledger_balances WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    ledger_id,
    financial_year,
    opening_dr,
    opening_cr,
    period_dr,
    period_cr,
    closing_dr,
    closing_cr,
    last_updated_at
FROM public.acc_ledger_balances
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_voucher_types WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    type_code,
    type_name,
    class,
    prefix,
    numbering_mode,
    last_number,
    is_system,
    is_active,
    notes,
    created_at,
    updated_at
FROM public.acc_voucher_types
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_vouchers WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    voucher_number,
    voucher_type_id,
    voucher_group_id,
    voucher_date,
    financial_year,
    narration,
    total_amount,
    customer_id,
    vehicle_id,
    loan_id,
    payment_id,
    vehicle_expense_id,
    payment_mode,
    cheque_date,
    status,
    is_reconciled,
    reconciled_at,
    gst_applicable,
    cancel_reason,
    currency_code,
    base_amount,
    created_by,
    created_at,
    updated_at
FROM public.acc_vouchers
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_voucher_entries WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    voucher_id,
    ledger_id,
    entry_type,
    amount,
    narration,
    tax_type,
    tax_rate,
    tax_amount,
    sort_order,
    created_by,
    created_at
FROM public.acc_voucher_entries
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_financial_years WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    year_label,
    start_date,
    end_date,
    is_current,
    is_locked,
    created_at
FROM public.acc_financial_years
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_bill_references WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    ledger_id,
    voucher_id,
    bill_number,
    bill_date,
    bill_amount,
    pending_amount,
    due_date,
    is_settled,
    settled_at,
    ref_type,
    narration,
    is_opening_balance,
    created_at,
    updated_at
FROM public.acc_bill_references
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

CREATE OR REPLACE VIEW ai_ro.acc_cost_centres WITH (security_barrier = true) AS
SELECT
    id,
    finance_id,
    centre_code,
    centre_name,
    parent_id,
    vehicle_id,
    is_active,
    created_at,
    updated_at
FROM public.acc_cost_centres
WHERE finance_id = NULLIF(current_setting('app.current_finance_id', true), '')::uuid;

-- 5. Grant USAGE + SELECT on `ai_ro` ONLY (and cover future `ai_ro` views via ALTER DEFAULT PRIVILEGES)
GRANT USAGE ON SCHEMA ai_ro TO autofinex_ai_sql_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA ai_ro FROM autofinex_ai_sql_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA ai_ro TO autofinex_ai_sql_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai_ro GRANT SELECT ON TABLES TO autofinex_ai_sql_ro;

COMMIT;

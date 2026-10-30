-- ============================================================
--  AUTO FINANCE MANAGEMENT SYSTEM
--  COMPLETE ACCOUNTING MODULE (TallyPrime-Style)
--  ============================================================
--  Target Engine : PostgreSQL 18+ (uses native uuidv7())
--  Architecture  : Pure PostgreSQL DDL with Native UUID v7
--  Rules         : NO ALTER TABLE statements used for schema creation
--  ============================================================
--  Tables in this document:
--    1. acc_ledger_groups     - Chart of Accounts hierarchy
--    2. acc_ledgers           - Individual accounts
--    3. acc_voucher_types     - Transaction types
--    4. acc_voucher_groups    - Batch/session grouping
--    5. acc_vouchers          - Transaction headers
--    6. acc_voucher_entries   - Double-entry lines (DR/CR)
--    7. acc_ledger_balances   - Cached balances for reports
--    8. acc_financial_years   - Year period configuration
--    9. acc_cost_centres      - Per-vehicle profit tracking
--   10. acc_ledger_mailing    - Postal addresses
--   11. acc_ledger_banking    - Multiple bank accounts
--   12. acc_ledger_tax        - PAN/GST registration
--   13. acc_ledger_billwise   - Credit limits & bill-wise
--   14. acc_ledger_tax_config - GST rate configuration
--   15. acc_ledger_loan_config- Loan/EMI configuration
--   16. acc_bill_references   - Bill-wise outstanding
--   17. acc_audit_log         - Field-level change history
--  ============================================================

BEGIN;

-- ============================================================
-- SECTION 0: REQUIRED ENUM TYPES (Idempotent Definition)
-- ============================================================

DO $$ BEGIN
    CREATE TYPE acc_group_nature_enum AS ENUM ('Assets', 'Liabilities', 'Income', 'Expenses');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_nett_balance_report_enum AS ENUM ('Debit', 'Credit', 'Both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_allocation_method_enum AS ENUM ('By Quantity', 'By Value', 'Not Applicable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_system_group_type_enum AS ENUM (
        'Primary', 'Sundry Debtors', 'Sundry Creditors', 'Bank Accounts',
        'Cash in Hand', 'Stock in Hand', 'Sales Accounts', 'Purchase Accounts',
        'Direct Income', 'Direct Expenses', 'Indirect Income', 'Indirect Expenses', 'Custom'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_entry_type_enum AS ENUM ('Dr', 'Cr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_tax_type_enum AS ENUM ('None', 'CGST', 'SGST', 'IGST', 'TDS', 'TCS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_bank_txn_type_enum AS ENUM ('NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_bank_acc_type_enum AS ENUM ('Savings', 'Current', 'OD', 'CC', 'FD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_voucher_class_enum AS ENUM (
        'Receipt', 'Payment', 'Contra', 'Journal', 'Sales', 'Purchase',
        'Debit Note', 'Credit Note', 'LoanDisbursement', 'LoanRepayment', 'VehicleExpense'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_numbering_mode_enum AS ENUM ('Auto', 'Manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_voucher_group_status_enum AS ENUM ('Open', 'Closed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_payment_mode_enum AS ENUM ('Cash', 'Bank', 'UPI', 'Cheque', 'Online', 'NEFT', 'RTGS', 'Other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_voucher_status_enum AS ENUM ('Draft', 'Posted', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_gst_reg_type_enum AS ENUM ('Unregistered', 'Regular', 'Composition', 'Consumer', 'Overseas');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_gst_type_enum AS ENUM ('CGST', 'SGST', 'IGST', 'UTGST', 'Cess');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_emi_type_enum AS ENUM ('EMI', 'Bullet', 'Daily', 'Weekly', 'Custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_bill_ref_type_enum AS ENUM ('New Ref', 'Agst Ref', 'On Account', 'Advance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_audit_action_enum AS ENUM ('INSERT', 'UPDATE', 'DELETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- TABLE 1: acc_ledger_groups
-- Purpose: Chart of Accounts hierarchy (like Tally Groups)
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_groups (
    id                      UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id              UUID            NOT NULL,
    group_name              VARCHAR(150)    NOT NULL,
    alias                   VARCHAR(150)    DEFAULT NULL,
    alias_lang              JSONB           DEFAULT NULL,
    parent_group_id         UUID            DEFAULT NULL,
    nature                  acc_group_nature_enum NOT NULL,
    affects_gross_profit    BOOLEAN         NOT NULL DEFAULT false,
    behaves_like_subledger  BOOLEAN         NOT NULL DEFAULT false,
    nett_balance_report     acc_nett_balance_report_enum NOT NULL DEFAULT 'Both',
    used_for_calculation    BOOLEAN         NOT NULL DEFAULT false,
    allocation_method       acc_allocation_method_enum NOT NULL DEFAULT 'Not Applicable',
    is_system               BOOLEAN         NOT NULL DEFAULT false,
    system_group_type       acc_system_group_type_enum NOT NULL DEFAULT 'Custom',
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_group_name_finance UNIQUE (finance_id, group_name),
    CONSTRAINT fk_alg_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alg_parent FOREIGN KEY (parent_group_id) REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_alg_finance_id ON acc_ledger_groups (finance_id);
CREATE INDEX IF NOT EXISTS idx_alg_parent_id ON acc_ledger_groups (parent_group_id);
CREATE INDEX IF NOT EXISTS idx_alg_nature ON acc_ledger_groups (nature);
CREATE INDEX IF NOT EXISTS idx_alg_is_active ON acc_ledger_groups (is_active);


-- ============================================================
-- TABLE 2: acc_ledgers
-- Purpose: Individual ledger accounts (like Tally Ledgers)
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledgers (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    ledger_code     VARCHAR(30)     NOT NULL,
    ledger_name     VARCHAR(200)    NOT NULL,
    group_id        UUID            NOT NULL,
    opening_balance NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    ob_type         acc_entry_type_enum NOT NULL DEFAULT 'Dr',
    customer_id     UUID            DEFAULT NULL,
    vehicle_id      UUID            DEFAULT NULL,
    gstin           VARCHAR(15)     DEFAULT NULL,
    pan             VARCHAR(10)     DEFAULT NULL,
    tax_type        acc_tax_type_enum NOT NULL DEFAULT 'None',
    is_bank_account BOOLEAN         NOT NULL DEFAULT false,
    bank_name       VARCHAR(100)    DEFAULT NULL,
    account_number  VARCHAR(50)     DEFAULT NULL,
    ifsc_code       VARCHAR(11)     DEFAULT NULL,
    is_system       BOOLEAN         NOT NULL DEFAULT false,
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    notes           TEXT            DEFAULT NULL,
    effective_date  DATE            DEFAULT NULL,
    remarks         VARCHAR(500)    DEFAULT NULL,
    address         VARCHAR(500)    DEFAULT NULL,
    contact         VARCHAR(20)     DEFAULT NULL,
    bank_branch     VARCHAR(150)    DEFAULT NULL,
    bank_txn_type   acc_bank_txn_type_enum NOT NULL DEFAULT 'NEFT',
    bank_acc_type   acc_bank_acc_type_enum NOT NULL DEFAULT 'Savings',
    upi_id          VARCHAR(100)    DEFAULT NULL,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ledger_code_finance UNIQUE (finance_id, ledger_code),
    CONSTRAINT fk_al_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_al_group FOREIGN KEY (group_id) REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT,
    CONSTRAINT fk_al_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_al_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_al_finance_id ON acc_ledgers (finance_id);
CREATE INDEX IF NOT EXISTS idx_al_group_id ON acc_ledgers (group_id);
CREATE INDEX IF NOT EXISTS idx_al_customer_id ON acc_ledgers (customer_id);
CREATE INDEX IF NOT EXISTS idx_al_vehicle_id ON acc_ledgers (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_al_is_active ON acc_ledgers (is_active);


-- ============================================================
-- TABLE 3: acc_voucher_types
-- Purpose: Defines class of transaction (Receipt, Payment, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_voucher_types (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    type_code       VARCHAR(30)     NOT NULL,
    type_name       VARCHAR(100)    NOT NULL,
    class           acc_voucher_class_enum NOT NULL,
    prefix          VARCHAR(20)     DEFAULT NULL,
    numbering_mode  acc_numbering_mode_enum NOT NULL DEFAULT 'Auto',
    last_number     INT             NOT NULL DEFAULT 0,
    affects_stock   BOOLEAN         NOT NULL DEFAULT false,
    is_system       BOOLEAN         NOT NULL DEFAULT false,
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    notes           VARCHAR(255)    DEFAULT NULL,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_type_code_finance UNIQUE (finance_id, type_code),
    CONSTRAINT fk_avt_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_avt_finance_id ON acc_voucher_types (finance_id);
CREATE INDEX IF NOT EXISTS idx_avt_class ON acc_voucher_types (class);


-- ============================================================
-- TABLE 4: acc_voucher_groups
-- Purpose: Batch/session grouping for vouchers
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_voucher_groups (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    group_name      VARCHAR(150)    NOT NULL,
    group_date      DATE            NOT NULL,
    description     VARCHAR(500)    DEFAULT NULL,
    status          acc_voucher_group_status_enum NOT NULL DEFAULT 'Open',
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_avg_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_avg_finance_id ON acc_voucher_groups (finance_id);
CREATE INDEX IF NOT EXISTS idx_avg_date ON acc_voucher_groups (group_date);


-- ============================================================
-- TABLE 5: acc_vouchers
-- Purpose: Transaction header (one row per transaction)
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_vouchers (
    id                  UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id          UUID            NOT NULL,
    voucher_number      VARCHAR(50)     NOT NULL,
    voucher_type_id     UUID            NOT NULL,
    voucher_group_id    UUID            DEFAULT NULL,
    voucher_date        DATE            NOT NULL,
    financial_year      CHAR(9)         NOT NULL,
    narration           TEXT            DEFAULT NULL,
    total_amount        NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    customer_id         UUID            DEFAULT NULL,
    vehicle_id          UUID            DEFAULT NULL,
    loan_id             UUID            DEFAULT NULL,
    payment_id          UUID            DEFAULT NULL,
    vehicle_expense_id  UUID            DEFAULT NULL,
    payment_mode        acc_payment_mode_enum DEFAULT NULL,
    cheque_number       VARCHAR(30)     DEFAULT NULL,
    cheque_date         DATE            DEFAULT NULL,
    bank_ref            VARCHAR(100)    DEFAULT NULL,
    status              acc_voucher_status_enum NOT NULL DEFAULT 'Draft',
    is_reconciled       BOOLEAN         NOT NULL DEFAULT false,
    reconciled_at       TIMESTAMP       DEFAULT NULL,
    reconciled_by       VARCHAR(100)    DEFAULT NULL,
    gst_applicable      BOOLEAN         NOT NULL DEFAULT false,
    gst_number          VARCHAR(50)     DEFAULT NULL,
    cancelled_by        VARCHAR(100)    DEFAULT NULL,
    cancelled_at        TIMESTAMP       DEFAULT NULL,
    cancel_reason       VARCHAR(500)    DEFAULT NULL,
    currency_code       CHAR(3)         NOT NULL DEFAULT 'INR',
    exchange_rate       NUMERIC(18,6)   NOT NULL DEFAULT 1.000000,
    base_amount         NUMERIC(15,2)   GENERATED ALWAYS AS (ROUND(total_amount * exchange_rate, 2)) STORED,
    created_by          VARCHAR(100)    DEFAULT NULL,
    updated_by          VARCHAR(100)    DEFAULT NULL,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_voucher_number_finance UNIQUE (finance_id, voucher_number),
    CONSTRAINT fk_av_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_av_type FOREIGN KEY (voucher_type_id) REFERENCES acc_voucher_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_av_group FOREIGN KEY (voucher_group_id) REFERENCES acc_voucher_groups(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_vehicle_expense FOREIGN KEY (vehicle_expense_id) REFERENCES vehicle_expenses(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_av_finance_id ON acc_vouchers (finance_id);
CREATE INDEX IF NOT EXISTS idx_av_type_id ON acc_vouchers (voucher_type_id);
CREATE INDEX IF NOT EXISTS idx_av_group_id ON acc_vouchers (voucher_group_id);
CREATE INDEX IF NOT EXISTS idx_av_customer_id ON acc_vouchers (customer_id);
CREATE INDEX IF NOT EXISTS idx_av_vehicle_id ON acc_vouchers (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_av_loan_id ON acc_vouchers (loan_id);
CREATE INDEX IF NOT EXISTS idx_av_payment_id ON acc_vouchers (payment_id);
CREATE INDEX IF NOT EXISTS idx_av_vehicle_exp_id ON acc_vouchers (vehicle_expense_id);
CREATE INDEX IF NOT EXISTS idx_av_date ON acc_vouchers (voucher_date);
CREATE INDEX IF NOT EXISTS idx_av_status ON acc_vouchers (status);


-- ============================================================
-- TABLE 6: acc_voucher_entries
-- Purpose: Double-entry debit/credit lines for each voucher
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_voucher_entries (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    voucher_id      UUID            NOT NULL,
    ledger_id       UUID            NOT NULL,
    entry_type      acc_entry_type_enum NOT NULL,
    amount          NUMERIC(15,2)   NOT NULL,
    narration       VARCHAR(500)    DEFAULT NULL,
    tax_type        acc_tax_type_enum NOT NULL DEFAULT 'None',
    tax_rate        NUMERIC(5,2)    NOT NULL DEFAULT 0.00,
    tax_amount      NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    sort_order      SMALLINT        NOT NULL DEFAULT 0,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ave_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ave_voucher FOREIGN KEY (voucher_id) REFERENCES acc_vouchers(id) ON DELETE CASCADE,
    CONSTRAINT fk_ave_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ave_voucher_id ON acc_voucher_entries (voucher_id);
CREATE INDEX IF NOT EXISTS idx_ave_ledger_id ON acc_voucher_entries (ledger_id);
CREATE INDEX IF NOT EXISTS idx_ave_finance_id ON acc_voucher_entries (finance_id);
CREATE INDEX IF NOT EXISTS idx_ave_entry_type ON acc_voucher_entries (entry_type);


-- ============================================================
-- TABLE 7: acc_ledger_balances
-- Purpose: Pre-aggregated ledger balances for fast reporting
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_balances (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    ledger_id       UUID            NOT NULL,
    financial_year  CHAR(9)         NOT NULL,
    opening_dr      NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    opening_cr      NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    period_dr       NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    period_cr       NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    closing_dr      NUMERIC(15,2)   GENERATED ALWAYS AS (opening_dr + period_dr) STORED,
    closing_cr      NUMERIC(15,2)   GENERATED ALWAYS AS (opening_cr + period_cr) STORED,
    last_updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ledger_year UNIQUE (finance_id, ledger_id, financial_year),
    CONSTRAINT fk_alb_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alb_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alb_finance_id ON acc_ledger_balances (finance_id);
CREATE INDEX IF NOT EXISTS idx_alb_ledger_id ON acc_ledger_balances (ledger_id);
CREATE INDEX IF NOT EXISTS idx_alb_fy ON acc_ledger_balances (financial_year);


-- ============================================================
-- TABLE 8: acc_financial_years
-- Purpose: Financial year periods per finance company
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_financial_years (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    year_label      CHAR(9)         NOT NULL,
    start_date      DATE            NOT NULL,
    end_date        DATE            NOT NULL,
    is_current      BOOLEAN         NOT NULL DEFAULT false,
    is_locked       BOOLEAN         NOT NULL DEFAULT false,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_year_finance UNIQUE (finance_id, year_label),
    CONSTRAINT fk_afy_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_afy_finance_id ON acc_financial_years (finance_id);


-- ============================================================
-- TABLE 9: acc_cost_centres
-- Purpose: Per-vehicle profit tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_cost_centres (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    centre_code     VARCHAR(30)     NOT NULL,
    centre_name     VARCHAR(150)    NOT NULL,
    parent_id       UUID            DEFAULT NULL,
    vehicle_id      UUID            DEFAULT NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_centre_code_finance UNIQUE (finance_id, centre_code),
    CONSTRAINT fk_acc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_acc_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_acc_parent FOREIGN KEY (parent_id) REFERENCES acc_cost_centres(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_acc_finance_id ON acc_cost_centres (finance_id);
CREATE INDEX IF NOT EXISTS idx_acc_vehicle_id ON acc_cost_centres (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_acc_parent_id ON acc_cost_centres (parent_id);


-- ============================================================
-- TABLE 10: acc_ledger_mailing
-- Purpose: Full postal address for ledgers
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_mailing (
    id          UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id  UUID            NOT NULL,
    ledger_id   UUID            NOT NULL,
    addr_line1  VARCHAR(255)    DEFAULT NULL,
    addr_line2  VARCHAR(255)    DEFAULT NULL,
    city        VARCHAR(100)    DEFAULT NULL,
    state       VARCHAR(100)    DEFAULT NULL,
    country     VARCHAR(100)    NOT NULL DEFAULT 'India',
    pin_code    VARCHAR(10)     DEFAULT NULL,
    created_by  VARCHAR(100)    DEFAULT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ledger_mailing UNIQUE (ledger_id),
    CONSTRAINT fk_alm_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alm_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alm_finance_id ON acc_ledger_mailing (finance_id);
CREATE INDEX IF NOT EXISTS idx_alm_ledger_id ON acc_ledger_mailing (ledger_id);


-- ============================================================
-- TABLE 11: acc_ledger_banking
-- Purpose: Multiple bank accounts per ledger (with primary flag)
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_banking (
    id               UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id       UUID            NOT NULL,
    ledger_id        UUID            NOT NULL,
    bank_name        VARCHAR(150)    DEFAULT NULL,
    account_number   VARCHAR(50)     DEFAULT NULL,
    ifsc_code        VARCHAR(11)     DEFAULT NULL,
    branch_name      VARCHAR(150)    DEFAULT NULL,
    txn_type         acc_bank_txn_type_enum NOT NULL DEFAULT 'NEFT',
    acc_type         acc_bank_acc_type_enum NOT NULL DEFAULT 'Savings',
    upi_id           VARCHAR(100)    DEFAULT NULL,
    is_primary       BOOLEAN         NOT NULL DEFAULT false,
    created_by       VARCHAR(100)    DEFAULT NULL,
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ledger_account UNIQUE (finance_id, ledger_id, account_number),
    CONSTRAINT fk_albk_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albk_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_ledger_primary_bank ON acc_ledger_banking (ledger_id) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_albk_finance_id ON acc_ledger_banking (finance_id);
CREATE INDEX IF NOT EXISTS idx_albk_ledger_id ON acc_ledger_banking (ledger_id);


-- ============================================================
-- TABLE 12: acc_ledger_tax
-- Purpose: PAN, GSTIN, registration type for ledgers
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_tax (
    id             UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id     UUID            NOT NULL,
    ledger_id      UUID            NOT NULL,
    pan_number     VARCHAR(10)     DEFAULT NULL,
    gstin          VARCHAR(15)     DEFAULT NULL,
    reg_type       acc_gst_reg_type_enum NOT NULL DEFAULT 'Unregistered',
    tds_applicable BOOLEAN         NOT NULL DEFAULT false,
    tcs_applicable BOOLEAN         NOT NULL DEFAULT false,
    created_by     VARCHAR(100)    DEFAULT NULL,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ledger_tax UNIQUE (ledger_id),
    CONSTRAINT fk_alt_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alt_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alt_finance_id ON acc_ledger_tax (finance_id);
CREATE INDEX IF NOT EXISTS idx_alt_ledger_id ON acc_ledger_tax (ledger_id);


-- ============================================================
-- TABLE 13: acc_ledger_billwise
-- Purpose: Credit limits and bill-wise tracking configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_billwise (
    id                   UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id           UUID            NOT NULL,
    ledger_id            UUID            NOT NULL,
    bill_wise            BOOLEAN         NOT NULL DEFAULT false,
    credit_limit         NUMERIC(15,2)   DEFAULT NULL,
    credit_days          SMALLINT        DEFAULT NULL,
    check_credit_limit   BOOLEAN         NOT NULL DEFAULT false,
    separate_discount    BOOLEAN         NOT NULL DEFAULT false,
    created_by           VARCHAR(100)    DEFAULT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ledger_billwise UNIQUE (ledger_id),
    CONSTRAINT fk_albw_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albw_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_albw_finance_id ON acc_ledger_billwise (finance_id);
CREATE INDEX IF NOT EXISTS idx_albw_ledger_id ON acc_ledger_billwise (ledger_id);


-- ============================================================
-- TABLE 14: acc_ledger_tax_config
-- Purpose: GST rate configuration for tax ledgers
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_tax_config (
    id                      UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id              UUID            NOT NULL,
    ledger_id               UUID            NOT NULL,
    gst_type                acc_gst_type_enum NOT NULL DEFAULT 'CGST',
    tax_percentage          NUMERIC(5,2)    NOT NULL DEFAULT 0.00,
    default_tax_ledger_name VARCHAR(200)    DEFAULT NULL,
    default_tax_ledger_id   UUID            DEFAULT NULL,
    created_by              VARCHAR(100)    DEFAULT NULL,
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ledger_tax_config UNIQUE (ledger_id),
    CONSTRAINT fk_altc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_altc_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_altc_default_tax_ledger FOREIGN KEY (default_tax_ledger_id) REFERENCES acc_ledgers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_altc_finance_id ON acc_ledger_tax_config (finance_id);
CREATE INDEX IF NOT EXISTS idx_altc_ledger_id ON acc_ledger_tax_config (ledger_id);
CREATE INDEX IF NOT EXISTS idx_altc_def_tax_ledger ON acc_ledger_tax_config (default_tax_ledger_id);


-- ============================================================
-- TABLE 15: acc_ledger_loan_config
-- Purpose: Loan/EMI configuration linked to loans table
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_loan_config (
    id            UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id    UUID            NOT NULL,
    ledger_id     UUID            NOT NULL,
    loan_id       UUID            DEFAULT NULL,
    interest_pct  NUMERIC(5,2)    DEFAULT NULL,
    penalty_pct   NUMERIC(5,2)    DEFAULT NULL,
    emi_type      acc_emi_type_enum NOT NULL DEFAULT 'EMI',
    created_by    VARCHAR(100)    DEFAULT NULL,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ledger_loan_config UNIQUE (ledger_id),
    CONSTRAINT fk_allc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_allc_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_allc_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_allc_finance_id ON acc_ledger_loan_config (finance_id);
CREATE INDEX IF NOT EXISTS idx_allc_ledger_id ON acc_ledger_loan_config (ledger_id);
CREATE INDEX IF NOT EXISTS idx_allc_loan_id ON acc_ledger_loan_config (loan_id);


-- ============================================================
-- TABLE 16: acc_bill_references
-- Purpose: Bill-wise outstanding tracking per party
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_bill_references (
    id             UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id     UUID            NOT NULL,
    ledger_id      UUID            NOT NULL,
    voucher_id     UUID            DEFAULT NULL,
    bill_number    VARCHAR(80)     NOT NULL,
    bill_date      DATE            NOT NULL,
    bill_amount    NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    pending_amount NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    due_date       DATE            DEFAULT NULL,
    is_settled     BOOLEAN         NOT NULL DEFAULT false,
    settled_at     DATE            DEFAULT NULL,
    ref_type       acc_bill_ref_type_enum NOT NULL DEFAULT 'New Ref',
    narration      VARCHAR(500)    DEFAULT NULL,
    created_by     VARCHAR(100)    DEFAULT NULL,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_bill_ledger_number UNIQUE (finance_id, ledger_id, bill_number),
    CONSTRAINT fk_abr_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_abr_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_abr_voucher FOREIGN KEY (voucher_id) REFERENCES acc_vouchers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_abr_finance_id ON acc_bill_references (finance_id);
CREATE INDEX IF NOT EXISTS idx_abr_ledger_id ON acc_bill_references (ledger_id);
CREATE INDEX IF NOT EXISTS idx_abr_voucher_id ON acc_bill_references (voucher_id);


-- ============================================================
-- TABLE 17: acc_audit_log
-- Purpose: Field-level change history for all accounting tables
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_audit_log (
    id          UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id  UUID            NOT NULL,
    table_name  VARCHAR(60)     NOT NULL,
    record_id   VARCHAR(64)     NOT NULL,
    field_name  VARCHAR(80)     NOT NULL,
    old_value   TEXT            DEFAULT NULL,
    new_value   TEXT            DEFAULT NULL,
    action      acc_audit_action_enum NOT NULL,
    changed_by  VARCHAR(100)    NOT NULL,
    changed_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address  VARCHAR(45)     DEFAULT NULL,
    session_id  VARCHAR(100)    DEFAULT NULL,
    CONSTRAINT fk_aal_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aal_finance_id ON acc_audit_log (finance_id);
CREATE INDEX IF NOT EXISTS idx_aal_table_record ON acc_audit_log (table_name, record_id);


-- ============================================================
-- SECTION 11: TRIGGER — Enforce Debit = Credit for Posted Vouchers
-- ============================================================

CREATE OR REPLACE FUNCTION fn_trg_voucher_entry_balance_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status acc_voucher_status_enum;
    v_total_dr NUMERIC(15,2);
    v_total_cr NUMERIC(15,2);
    v_diff NUMERIC(15,2);
BEGIN
    SELECT status INTO v_status FROM acc_vouchers WHERE id = NEW.voucher_id;
    IF v_status = 'Posted' THEN
        SELECT COALESCE(SUM(CASE WHEN entry_type = 'Dr' THEN amount ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN entry_type = 'Cr' THEN amount ELSE 0 END), 0)
        INTO v_total_dr, v_total_cr
        FROM acc_voucher_entries WHERE voucher_id = NEW.voucher_id;
        v_diff := ABS(v_total_dr - v_total_cr);
        IF v_diff > 0.01 THEN
            RAISE EXCEPTION 'Voucher imbalance: sum of Debit entries (%) must equal sum of Credit entries (%)', v_total_dr, v_total_cr;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_entry_balance_check ON acc_voucher_entries;
CREATE TRIGGER trg_voucher_entry_balance_check
AFTER INSERT OR UPDATE ON acc_voucher_entries
FOR EACH ROW
EXECUTE FUNCTION fn_trg_voucher_entry_balance_check();


-- ============================================================
-- SECTION 12: TRIGGER — Update Balance Cache on Insert
-- ============================================================

CREATE OR REPLACE FUNCTION fn_trg_update_ledger_balance_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_fy CHAR(9);
    v_dr NUMERIC(15,2);
    v_cr NUMERIC(15,2);
BEGIN
    SELECT financial_year INTO v_fy
      FROM acc_vouchers WHERE id = NEW.voucher_id;

    IF v_fy IS NOT NULL THEN
        v_dr := CASE WHEN NEW.entry_type = 'Dr' THEN NEW.amount ELSE 0.00 END;
        v_cr := CASE WHEN NEW.entry_type = 'Cr' THEN NEW.amount ELSE 0.00 END;

        INSERT INTO acc_ledger_balances
            (finance_id, ledger_id, financial_year, period_dr, period_cr)
        VALUES
            (NEW.finance_id, NEW.ledger_id, v_fy, v_dr, v_cr)
        ON CONFLICT (finance_id, ledger_id, financial_year) DO UPDATE
            SET period_dr = acc_ledger_balances.period_dr + EXCLUDED.period_dr,
                period_cr = acc_ledger_balances.period_cr + EXCLUDED.period_cr,
                last_updated_at = CURRENT_TIMESTAMP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_ledger_balance_after_insert ON acc_voucher_entries;
CREATE TRIGGER trg_update_ledger_balance_after_insert
AFTER INSERT ON acc_voucher_entries
FOR EACH ROW
EXECUTE FUNCTION fn_trg_update_ledger_balance_after_insert();


-- ============================================================
-- SECTION 13: USEFUL VIEWS FOR REPORTING
-- ============================================================

-- View 13.1: Trial Balance
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
    g.finance_id,
    g.nature,
    g.group_name,
    l.ledger_code,
    l.ledger_name,
    b.financial_year,
    b.opening_dr,
    b.opening_cr,
    b.period_dr,
    b.period_cr,
    b.closing_dr,
    b.closing_cr,
    (b.closing_dr - b.closing_cr) AS net_balance
FROM acc_ledger_balances b
JOIN acc_ledgers         l ON l.id = b.ledger_id
JOIN acc_ledger_groups   g ON g.id = l.group_id
WHERE l.is_active = true;


-- View 13.2: Day Book (all posted vouchers with lines)
CREATE OR REPLACE VIEW v_day_book AS
SELECT
    v.finance_id,
    v.voucher_date,
    v.financial_year,
    v.voucher_number,
    vt.type_name     AS voucher_type,
    vt.class         AS voucher_class,
    l.ledger_name,
    e.entry_type,
    e.amount,
    v.narration,
    v.customer_id,
    v.vehicle_id,
    v.payment_mode,
    v.status
FROM acc_vouchers        v
JOIN acc_voucher_types   vt ON vt.id = v.voucher_type_id
JOIN acc_voucher_entries e  ON e.voucher_id = v.id
JOIN acc_ledgers         l  ON l.id = e.ledger_id
WHERE v.status = 'Posted';


-- View 13.3: Vehicle Cost vs Finance Amount (P&L per vehicle)
CREATE OR REPLACE VIEW v_vehicle_finance_summary AS
SELECT
    vd.finance_id,
    vd.id                                                             AS vehicle_id,
    vd.vehicle_number,
    vd.base_price,
    vd.final_price,
    vd.selling_price,
    COALESCE(SUM(ve.amount), 0)                                       AS total_expenses,
    (vd.final_price + COALESCE(SUM(ve.amount), 0))                    AS total_cost,
    vd.selling_price - (vd.final_price + COALESCE(SUM(ve.amount), 0)) AS gross_profit
FROM vehicle_detail  vd
LEFT JOIN vehicle_expenses ve ON ve.vehicle_id = vd.id
GROUP BY vd.id, vd.finance_id, vd.vehicle_number, vd.base_price, vd.final_price, vd.selling_price;


-- View 13.4: Loan Outstanding per Customer (Compatible with camelCase or snake_case hp_amount)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = current_schema() AND table_name = 'loans' AND column_name = 'hp_amount'
    ) THEN
        EXECUTE '
        CREATE OR REPLACE VIEW v_loan_outstanding AS
        SELECT
            l.finance_id,
            l.customer_id,
            c.cname          AS customer_name,
            l.id             AS loan_id,
            l.hp_amount      AS sanctioned_amount,
            COALESCE(SUM(CASE WHEN p.status IN (''paid'',''partial'') THEN p.amount ELSE 0 END), 0) AS amount_received,
            l.hp_amount - COALESCE(SUM(CASE WHEN p.status IN (''paid'',''partial'') THEN p.amount ELSE 0 END), 0) AS outstanding
        FROM loans    l
        JOIN customers c ON c.id = l.customer_id
        LEFT JOIN payments p ON p.customer_id = l.customer_id
                            AND p.finance_id  = l.finance_id
                            AND p.payment_status = ''active''
        GROUP BY l.id, l.finance_id, l.customer_id, c.cname, l.hp_amount;';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = current_schema() AND table_name = 'loans' AND column_name = 'hpAmount'
    ) THEN
        EXECUTE '
        CREATE OR REPLACE VIEW v_loan_outstanding AS
        SELECT
            l.finance_id,
            l.customer_id,
            c.cname          AS customer_name,
            l.id             AS loan_id,
            l."hpAmount"     AS sanctioned_amount,
            COALESCE(SUM(CASE WHEN p.status IN (''paid'',''partial'') THEN p.amount ELSE 0 END), 0) AS amount_received,
            l."hpAmount" - COALESCE(SUM(CASE WHEN p.status IN (''paid'',''partial'') THEN p.amount ELSE 0 END), 0) AS outstanding
        FROM loans    l
        JOIN customers c ON c.id = l.customer_id
        LEFT JOIN payments p ON p.customer_id = l.customer_id
                            AND p.finance_id  = l.finance_id
                            AND p.payment_status = ''active''
        GROUP BY l.id, l.finance_id, l.customer_id, c.cname, l."hpAmount";';
    END IF;
END $$;


-- ============================================================
-- SECTION 14: STORED PROCEDURE — Post Vehicle Expense Voucher
-- ============================================================
-- Called whenever a row is added to vehicle_expenses.
-- Debits "Vehicle Expense" ledger, Credits Cash/Bank.

CREATE OR REPLACE PROCEDURE sp_post_vehicle_expense_voucher(
    IN p_finance_id         UUID,
    IN p_vehicle_expense_id UUID,
    IN p_cash_ledger_id     UUID,    -- usually the CASH system ledger
    IN p_created_by         VARCHAR(100)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_vehicle_id    UUID;
    v_expense_date  DATE;
    v_amount        NUMERIC(15,2);
    v_description   VARCHAR(500);
    v_voucher_id    UUID;
    v_vtype_id      UUID;
    v_exp_ledger_id UUID;
    v_fy            CHAR(9);
BEGIN
    -- Fetch expense details
    SELECT vehicle_id, expense_date, amount, description
      INTO v_vehicle_id, v_expense_date, v_amount, v_description
      FROM vehicle_expenses
     WHERE id = p_vehicle_expense_id;

    -- Derive financial year (Apr–Mar cycle)
    v_fy := CASE 
        WHEN EXTRACT(MONTH FROM v_expense_date) >= 4 THEN
            EXTRACT(YEAR FROM v_expense_date)::TEXT || '-' || (EXTRACT(YEAR FROM v_expense_date) + 1)::TEXT
        ELSE
            (EXTRACT(YEAR FROM v_expense_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM v_expense_date)::TEXT
    END;

    -- Get VEXP voucher type
    SELECT id INTO v_vtype_id
      FROM acc_voucher_types
     WHERE finance_id = p_finance_id AND type_code = 'VEXP';

    -- Get or create a vehicle-specific expense ledger
    -- (In practice, use REPAIR-EXP / INS-EXP etc. based on description)
    SELECT id INTO v_exp_ledger_id
      FROM acc_ledgers
     WHERE finance_id = p_finance_id AND ledger_code = 'REPAIR-EXP';

    -- Insert Voucher Header
    INSERT INTO acc_vouchers
        (finance_id, voucher_type_id, voucher_date, financial_year,
         narration, total_amount, vehicle_id, vehicle_expense_id, status, created_by)
    VALUES
        (p_finance_id, v_vtype_id, v_expense_date, v_fy,
         v_description, v_amount, v_vehicle_id, p_vehicle_expense_id,
         'Posted', p_created_by)
    RETURNING id INTO v_voucher_id;

    -- DR: Expense Ledger
    INSERT INTO acc_voucher_entries
        (finance_id, voucher_id, ledger_id, entry_type, amount, created_by)
    VALUES
        (p_finance_id, v_voucher_id, v_exp_ledger_id, 'Dr', v_amount, p_created_by);

    -- CR: Cash / Bank
    INSERT INTO acc_voucher_entries
        (finance_id, voucher_id, ledger_id, entry_type, amount, created_by)
    VALUES
        (p_finance_id, v_voucher_id, p_cash_ledger_id, 'Cr', v_amount, p_created_by);

END;
$$;

COMMIT;

-- ============================================================
-- END OF COMPLETE ACCOUNTING MODULE
-- Total: 17 tables + 2 triggers + 4 views + 1 procedure
-- Pure PostgreSQL 18+ DDL (UUID v7 native)
-- Zero ALTER TABLE statements used
-- ============================================================

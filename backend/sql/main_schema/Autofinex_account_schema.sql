-- ============================================================
--  AUTOFINEX ERP — COMPLETE ACCOUNTING MODULE (TallyPrime-Style)
--  ============================================================
--  Target Engine : PostgreSQL 18+ (uses native uuidv7())
--  Architecture  : Pure PostgreSQL DDL with Native UUID v7
--  Total Tables  : 23 Tables + 2 Triggers + 3 Reporting Views
--  Idempotency   : Fully Idempotent (IF NOT EXISTS / DO $$ blocks)
--  ============================================================
--  Tables in this schema:
--    1.  acc_group_master              - Global system-level group catalogue (28 Tally groups)
--    2.  acc_ledger_groups             - Company chart of accounts hierarchy
--    3.  acc_ledgers                   - Individual ledger accounts (Tally identity & behavior)
--    4.  acc_voucher_types             - Transaction type definitions
--    5.  acc_voucher_groups            - Batch / session grouping
--    6.  acc_vouchers                  - Transaction headers (Multi-currency & double entry)
--    7.  acc_voucher_entries           - Double-entry DR/CR lines
--    8.  acc_ledger_balances           - Cached balances for fast reporting
--    9.  acc_financial_years           - Financial year period configuration
--   10.  acc_cost_centres              - Per-vehicle profit tracking (Cost Centres)
--   11.  acc_ledger_mailing            - Postal addresses & contact details
--   12.  acc_ledger_banking            - Party bank accounts (Multi-account support)
--   13.  acc_ledger_banking_txn_types  - Multi-select transaction types per bank
--   14.  acc_ledger_txn_type_config    - Per-txn-type sub-dialog configuration
--   15.  acc_ledger_tax                - PAN / GSTIN / registration & TDS/TCS settings
--   16.  acc_ledger_statutory          - MSME (Udyam) / e-Invoice / e-Way Bill defaults
--   17.  acc_ledger_billwise           - Credit limits & bill-wise tracking
--   18.  acc_ledger_tax_config         - GST rate configuration & duty tax calculation
--   19.  acc_ledger_loan_config        - Loan / EMI configuration linked to loans
--   20.  acc_ledger_bank_config        - Bank Accounts — Cheque book & reconciliation config
--   21.  acc_ledger_cheque_books       - Cheque book ranges per bank ledger
--   22.  acc_bill_references           - Bill-wise outstanding tracking
--   23.  acc_audit_log                 - Field-level change audit log
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
    CREATE TYPE acc_entry_type_enum AS ENUM ('Dr', 'Cr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_ledger_type_enum AS ENUM ('Not Applicable', 'Invoice Rounding', 'Discount');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_rounding_method_enum AS ENUM ('Not Applicable', 'Normal Rounding', 'Downward Rounding', 'Upward Rounding');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_appropriation_method_enum AS ENUM ('Not Applicable', 'Appropriate by Value', 'Appropriate by Quantity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_flushing_method_enum AS ENUM ('Default', 'Cash Basis', 'Accrual Basis');
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
    CREATE TYPE acc_tax_type_enum AS ENUM ('None', 'CGST', 'SGST', 'IGST', 'TDS', 'TCS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_bank_acc_type_enum AS ENUM ('Savings', 'Current', 'Cash Credit', 'Overdraft', 'Loan A/c');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_bank_txn_type_enum AS ENUM (
        'ATM', 'Card', 'Cheque', 'ECS', 'e-Fund Transfer', 'Electronic Cheque', 'Electronic DD/PO', 'Others'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_gst_reg_type_enum AS ENUM (
        'Regular', 'Composition', 'Unregistered', 'Consumer',
        'Overseas', 'SEZ Unit', 'SEZ Developer', 'Deemed Export',
        'Tax Deductor', 'Tax Collector (E-Commerce)',
        'Input Service Distributor', 'UIN Holder'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_party_tax_type_enum AS ENUM ('None', 'TDS', 'TCS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_deductee_type_enum AS ENUM ('Individual', 'HUF', 'Firm', 'Company', 'Trust', 'Government', 'AOP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_buyer_type_enum AS ENUM ('Individual', 'Company', 'Government', 'Exporter', 'SEZ');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_default_supply_type_enum AS ENUM ('B2B', 'SEZ', 'Export', 'Deemed Export');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_default_transport_mode_enum AS ENUM ('Road', 'Rail', 'Air', 'Ship');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_gst_applicability_enum AS ENUM ('Applicable', 'Not Applicable', 'Undefined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_hsn_details_mode_enum AS ENUM ('As per Company', 'As per Stock Group', 'Specify Details Here');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_hsn_source_mode_enum AS ENUM ('As per Company', 'As per Stock Group', 'As per Stock Item', 'Specify Details Here');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_type_of_supply_enum AS ENUM ('Goods', 'Services');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_taxability_enum AS ENUM ('Taxable', 'Exempt', 'Nil Rated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_cess_type_enum AS ENUM ('Valorem', 'Quantum');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_gst_status_enum AS ENUM ('Active', 'Cancelled', 'Suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_duty_tax_type_enum AS ENUM ('GST', 'TCS', 'TDS', 'Others');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_duty_calc_based_enum AS ENUM ('On Total Sales', 'On Current Subtotal', 'On Item Rate', 'On TDS/TCS Assessable Value');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE acc_method_calc_duty_enum AS ENUM ('On Total Sales', 'On Net Sales', 'On Assessable Value');
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
-- TABLE 1: acc_group_master
-- Purpose: Global system-level group catalogue (shared across
--          all companies; canonical TallyPrime predefined groups)
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_group_master (
    id                      UUID            PRIMARY KEY DEFAULT uuidv7(),
    group_name              VARCHAR(150)    NOT NULL,
    parent_id               UUID            DEFAULT NULL,
    nature                  acc_group_nature_enum NOT NULL,
    affects_gross_profit    BOOLEAN         NOT NULL DEFAULT false,
    behaves_like_subledger  BOOLEAN         NOT NULL DEFAULT false,
    nett_balance_report     acc_nett_balance_report_enum NOT NULL DEFAULT 'Both',
    sequence_order          SMALLINT        NOT NULL DEFAULT 0,
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    CONSTRAINT uk_master_group_name UNIQUE (group_name),
    CONSTRAINT fk_agm_parent FOREIGN KEY (parent_id) REFERENCES acc_group_master(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_agm_parent_id ON acc_group_master (parent_id);
CREATE INDEX IF NOT EXISTS idx_agm_nature ON acc_group_master (nature);
CREATE INDEX IF NOT EXISTS idx_agm_is_active ON acc_group_master (is_active);

-- Seed Canonical 28 Tally Prime System Groups into acc_group_master
-- 1.1 Root Groups (15 Primary Groups)
INSERT INTO acc_group_master (group_name, parent_id, nature, affects_gross_profit, behaves_like_subledger, sequence_order)
VALUES
    ('Capital Account',        NULL, 'Liabilities', false, false, 1),
    ('Loans (Liability)',      NULL, 'Liabilities', false, false, 3),
    ('Current Liabilities',    NULL, 'Liabilities', false, false, 7),
    ('Branch / Divisions',     NULL, 'Liabilities', false, false, 11),
    ('Fixed Assets',           NULL, 'Assets',      false, false, 12),
    ('Investments',            NULL, 'Assets',      false, false, 13),
    ('Current Assets',         NULL, 'Assets',      false, false, 14),
    ('Misc. Expenses (Asset)', NULL, 'Assets',      false, false, 21),
    ('Suspense A/c',           NULL, 'Assets',      false, false, 22),
    ('Sales Accounts',         NULL, 'Income',      true,  false, 23),
    ('Direct Incomes',         NULL, 'Income',      true,  false, 24),
    ('Indirect Incomes',       NULL, 'Income',      false, false, 25),
    ('Purchase Accounts',      NULL, 'Expenses',    true,  false, 26),
    ('Direct Expenses',        NULL, 'Expenses',    true,  false, 27),
    ('Indirect Expenses',      NULL, 'Expenses',    false, false, 28)
ON CONFLICT (group_name) DO NOTHING;

-- 1.2 Child Sub-Groups (13 Groups linked to parent_id)
INSERT INTO acc_group_master (group_name, parent_id, nature, affects_gross_profit, behaves_like_subledger, sequence_order)
SELECT
    v.group_name,
    p.id,
    v.nature::acc_group_nature_enum,
    false,
    false,
    v.sequence_order
FROM (
    VALUES
        ('Reserves & Surplus',       'Capital Account',     'Liabilities', 2),
        ('Secured Loans',            'Loans (Liability)',   'Liabilities', 4),
        ('Unsecured Loans',          'Loans (Liability)',   'Liabilities', 5),
        ('Bank OD A/c',              'Loans (Liability)',   'Liabilities', 6),
        ('Sundry Creditors',         'Current Liabilities', 'Liabilities', 8),
        ('Duties & Taxes',           'Current Liabilities', 'Liabilities', 9),
        ('Provisions',               'Current Liabilities', 'Liabilities', 10),
        ('Sundry Debtors',           'Current Assets',      'Assets',      15),
        ('Cash-in-hand',             'Current Assets',      'Assets',      16),
        ('Bank Accounts',            'Current Assets',      'Assets',      17),
        ('Stock-in-hand',            'Current Assets',      'Assets',      18),
        ('Deposits (Asset)',         'Current Assets',      'Assets',      19),
        ('Loans & Advances (Asset)', 'Current Assets',      'Assets',      20)
) AS v(group_name, parent_name, nature, sequence_order)
INNER JOIN acc_group_master p ON p.group_name = v.parent_name
ON CONFLICT (group_name) DO NOTHING;


-- ============================================================
-- TABLE 2: acc_ledger_groups
-- Purpose: Company chart of accounts hierarchy (custom groups
--          created per company, linked to master or other groups)
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_groups (
    id                      UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id              UUID            NOT NULL,
    group_name              VARCHAR(150)    NOT NULL,
    alias                   VARCHAR(150)    DEFAULT NULL,
    alias_lang              JSONB           DEFAULT NULL,
    system_parent_id        UUID            DEFAULT NULL,
    custom_parent_id        UUID            DEFAULT NULL,
    root_master_id          UUID            DEFAULT NULL,
    nature                  acc_group_nature_enum NOT NULL,
    affects_gross_profit    BOOLEAN         NOT NULL DEFAULT false,
    behaves_like_subledger  BOOLEAN         NOT NULL DEFAULT false,
    nett_balance_report     acc_nett_balance_report_enum NOT NULL DEFAULT 'Both',
    used_for_calculation    BOOLEAN         NOT NULL DEFAULT false,
    allocation_method       acc_allocation_method_enum NOT NULL DEFAULT 'Not Applicable',
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_group_name_finance UNIQUE (finance_id, group_name),
    CONSTRAINT fk_alg_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alg_sys_parent FOREIGN KEY (system_parent_id) REFERENCES acc_group_master(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alg_custom_parent FOREIGN KEY (custom_parent_id) REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alg_root_master FOREIGN KEY (root_master_id) REFERENCES acc_group_master(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_alg_finance_id ON acc_ledger_groups (finance_id);
CREATE INDEX IF NOT EXISTS idx_alg_nature ON acc_ledger_groups (nature);
CREATE INDEX IF NOT EXISTS idx_alg_is_active ON acc_ledger_groups (is_active);
CREATE INDEX IF NOT EXISTS idx_alg_finance_nature ON acc_ledger_groups (finance_id, nature);
CREATE INDEX IF NOT EXISTS idx_alg_sys_parent_id ON acc_ledger_groups (system_parent_id);
CREATE INDEX IF NOT EXISTS idx_alg_custom_parent_id ON acc_ledger_groups (custom_parent_id);
CREATE INDEX IF NOT EXISTS idx_alg_root_master_id ON acc_ledger_groups (root_master_id);


-- ============================================================
-- TABLE 3: acc_ledgers
-- Purpose: Individual ledger accounts — core identity +
--          TallyPrime accounting behavior
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledgers (
    id                      UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id              UUID            NOT NULL,

    -- Basic identity
    ledger_code             VARCHAR(30)     DEFAULT NULL,
    ledger_name             VARCHAR(200)    NOT NULL,
    alias                   VARCHAR(150)    DEFAULT NULL,
    alias_regional          VARCHAR(150)    DEFAULT NULL,
    group_id                UUID            DEFAULT NULL,
    master_group_id         UUID            DEFAULT NULL,
    reporting_under         VARCHAR(200)    DEFAULT NULL,
    inactive                BOOLEAN         NOT NULL DEFAULT false,

    -- Opening balance
    opening_balance         NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    ob_type                 acc_entry_type_enum NOT NULL DEFAULT 'Dr',
    effective_date          DATE            DEFAULT NULL,
    freeze_balance          BOOLEAN         NOT NULL DEFAULT false,

    -- Inventory / accounting behaviour
    inv_values_affected     BOOLEAN         NOT NULL DEFAULT false,
    type_of_ledger          acc_ledger_type_enum NOT NULL DEFAULT 'Not Applicable',
    rounding_method         acc_rounding_method_enum NOT NULL DEFAULT 'Not Applicable',
    rounding_limit          NUMERIC(10,2)   DEFAULT NULL,
    appropriation_method    acc_appropriation_method_enum NOT NULL DEFAULT 'Not Applicable',
    method_to_allocate      BOOLEAN         NOT NULL DEFAULT false,
    is_additional_cost      BOOLEAN         NOT NULL DEFAULT false,
    cost_centre_applicable  BOOLEAN         NOT NULL DEFAULT false,
    cost_centre_allocation  BOOLEAN         NOT NULL DEFAULT false,

    -- Duties & Taxes behaviour
    ledger_flushing_method  acc_flushing_method_enum NOT NULL DEFAULT 'Default',
    include_in_buyer_ledger BOOLEAN         NOT NULL DEFAULT false,
    include_in_seller_ledger BOOLEAN        NOT NULL DEFAULT false,

    -- Vehicle & Customer integration (AutoFinance extensions)
    customer_id             UUID            DEFAULT NULL,
    vehicle_id              UUID            DEFAULT NULL,

    -- Audit / system flags
    is_bank_account         BOOLEAN         NOT NULL DEFAULT false,
    is_system               BOOLEAN         NOT NULL DEFAULT false,
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    created_by              VARCHAR(100)    DEFAULT NULL,
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_name_finance UNIQUE (finance_id, ledger_name),
    CONSTRAINT fk_al_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_al_group FOREIGN KEY (group_id) REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT,
    CONSTRAINT fk_al_master_group FOREIGN KEY (master_group_id) REFERENCES acc_group_master(id) ON DELETE RESTRICT,
    CONSTRAINT fk_al_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_al_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL,
    CONSTRAINT chk_ledger_under_exclusivity CHECK (
        (group_id IS NOT NULL AND master_group_id IS NULL)
        OR
        (group_id IS NULL AND master_group_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_al_finance_id ON acc_ledgers (finance_id);
CREATE INDEX IF NOT EXISTS idx_al_group_id ON acc_ledgers (group_id);
CREATE INDEX IF NOT EXISTS idx_al_master_group_id ON acc_ledgers (master_group_id);
CREATE INDEX IF NOT EXISTS idx_al_is_active ON acc_ledgers (is_active);
CREATE INDEX IF NOT EXISTS idx_al_inactive ON acc_ledgers (inactive);
CREATE INDEX IF NOT EXISTS idx_al_customer_id ON acc_ledgers (customer_id);
CREATE INDEX IF NOT EXISTS idx_al_vehicle_id ON acc_ledgers (vehicle_id);


-- ============================================================
-- TABLE 4: acc_voucher_types
-- Purpose: Voucher type definitions (Receipt, Payment, Journal, etc.)
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
-- TABLE 5: acc_voucher_groups
-- Purpose: Batch / session grouping for vouchers
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_voucher_groups (
    id          UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id  UUID            NOT NULL,
    group_name  VARCHAR(150)    NOT NULL,
    group_date  DATE            NOT NULL,
    description VARCHAR(500)    DEFAULT NULL,
    status      acc_voucher_group_status_enum NOT NULL DEFAULT 'Open',
    created_by  VARCHAR(100)    DEFAULT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_avg_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_avg_finance_id ON acc_voucher_groups (finance_id);
CREATE INDEX IF NOT EXISTS idx_avg_date ON acc_voucher_groups (group_date);


-- ============================================================
-- TABLE 6: acc_vouchers
-- Purpose: Transaction headers — one row per transaction
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_vouchers (
    id                   UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id           UUID            NOT NULL,
    voucher_number       VARCHAR(50)     NOT NULL,
    voucher_type_id      UUID            NOT NULL,
    voucher_group_id     UUID            DEFAULT NULL,
    voucher_date         DATE            NOT NULL,
    financial_year       CHAR(9)         NOT NULL,
    narration            TEXT            DEFAULT NULL,
    total_amount         NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    customer_id          UUID            DEFAULT NULL,
    vehicle_id           UUID            DEFAULT NULL,
    loan_id              UUID            DEFAULT NULL,
    payment_id           UUID            DEFAULT NULL,
    vehicle_expense_id   UUID            DEFAULT NULL,
    payment_mode         acc_payment_mode_enum DEFAULT NULL,
    cheque_number        VARCHAR(30)     DEFAULT NULL,
    cheque_date          DATE            DEFAULT NULL,
    bank_ref             VARCHAR(100)    DEFAULT NULL,
    status               acc_voucher_status_enum NOT NULL DEFAULT 'Draft',
    is_reconciled        BOOLEAN         NOT NULL DEFAULT false,
    reconciled_at        TIMESTAMP       DEFAULT NULL,
    reconciled_by        VARCHAR(100)    DEFAULT NULL,
    gst_applicable       BOOLEAN         NOT NULL DEFAULT false,
    gst_number           VARCHAR(50)     DEFAULT NULL,
    cancelled_by         VARCHAR(100)    DEFAULT NULL,
    cancelled_at         TIMESTAMP       DEFAULT NULL,
    cancel_reason        VARCHAR(500)    DEFAULT NULL,
    currency_code        CHAR(3)         NOT NULL DEFAULT 'INR',
    exchange_rate        NUMERIC(18,6)   NOT NULL DEFAULT 1.000000,
    base_amount          NUMERIC(15,2)   GENERATED ALWAYS AS (ROUND(total_amount * exchange_rate, 2)) STORED,
    created_by           VARCHAR(100)    DEFAULT NULL,
    updated_by           VARCHAR(100)    DEFAULT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
CREATE INDEX IF NOT EXISTS idx_av_voucher_date ON acc_vouchers (voucher_date);
CREATE INDEX IF NOT EXISTS idx_av_status ON acc_vouchers (status);
CREATE INDEX IF NOT EXISTS idx_av_customer_id ON acc_vouchers (customer_id);
CREATE INDEX IF NOT EXISTS idx_av_vehicle_id ON acc_vouchers (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_av_financial_year ON acc_vouchers (financial_year);


-- ============================================================
-- TABLE 7: acc_voucher_entries
-- Purpose: Double-entry DR/CR lines for each voucher
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_voucher_entries (
    id          UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id  UUID            NOT NULL,
    voucher_id  UUID            NOT NULL,
    ledger_id   UUID            NOT NULL,
    entry_type  acc_entry_type_enum NOT NULL,
    amount      NUMERIC(15,2)   NOT NULL,
    narration   VARCHAR(500)    DEFAULT NULL,
    tax_type    acc_tax_type_enum DEFAULT 'None',
    tax_rate    NUMERIC(5,2)    DEFAULT 0.00,
    tax_amount  NUMERIC(15,2)   DEFAULT 0.00,
    sort_order  SMALLINT        DEFAULT 0,
    created_by  VARCHAR(100)    DEFAULT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ave_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ave_voucher FOREIGN KEY (voucher_id) REFERENCES acc_vouchers(id) ON DELETE CASCADE,
    CONSTRAINT fk_ave_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ave_finance_id ON acc_voucher_entries (finance_id);
CREATE INDEX IF NOT EXISTS idx_ave_voucher_id ON acc_voucher_entries (voucher_id);
CREATE INDEX IF NOT EXISTS idx_ave_ledger_id ON acc_voucher_entries (ledger_id);
CREATE INDEX IF NOT EXISTS idx_ave_entry_type ON acc_voucher_entries (entry_type);


-- ============================================================
-- TABLE 8: acc_ledger_balances
-- Purpose: Pre-aggregated ledger balances for fast reporting
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_balances (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    ledger_id       UUID            NOT NULL,
    financial_year  CHAR(9)         NOT NULL,
    opening_dr      NUMERIC(15,2)   DEFAULT 0.00,
    opening_cr      NUMERIC(15,2)   DEFAULT 0.00,
    period_dr       NUMERIC(15,2)   DEFAULT 0.00,
    period_cr       NUMERIC(15,2)   DEFAULT 0.00,
    closing_dr      NUMERIC(15,2)   GENERATED ALWAYS AS (opening_dr + period_dr) STORED,
    closing_cr      NUMERIC(15,2)   GENERATED ALWAYS AS (opening_cr + period_cr) STORED,
    last_updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_year UNIQUE (finance_id, ledger_id, financial_year),
    CONSTRAINT fk_albal_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albal_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_albal_finance_id ON acc_ledger_balances (finance_id);
CREATE INDEX IF NOT EXISTS idx_albal_ledger_id ON acc_ledger_balances (ledger_id);
CREATE INDEX IF NOT EXISTS idx_albal_financial_year ON acc_ledger_balances (financial_year);


-- ============================================================
-- TABLE 9: acc_financial_years
-- Purpose: Financial year periods per finance company
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_financial_years (
    id          UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id  UUID            NOT NULL,
    year_label  CHAR(9)         NOT NULL,
    start_date  DATE            NOT NULL,
    end_date    DATE            NOT NULL,
    is_current  BOOLEAN         DEFAULT false,
    is_locked   BOOLEAN         DEFAULT false,
    created_by  VARCHAR(100)    DEFAULT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_year_finance UNIQUE (finance_id, year_label),
    CONSTRAINT fk_afy_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_afy_finance_id ON acc_financial_years (finance_id);


-- ============================================================
-- TABLE 10: acc_cost_centres
-- Purpose: Per-vehicle profit tracking (Cost Centres)
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_cost_centres (
    id          UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id  UUID            NOT NULL,
    centre_code VARCHAR(30)     NOT NULL,
    centre_name VARCHAR(150)    NOT NULL,
    parent_id   UUID            DEFAULT NULL,
    vehicle_id  UUID            DEFAULT NULL,
    is_active   BOOLEAN         DEFAULT true,
    created_by  VARCHAR(100)    DEFAULT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_centre_code_finance UNIQUE (finance_id, centre_code),
    CONSTRAINT fk_acc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_acc_parent FOREIGN KEY (parent_id) REFERENCES acc_cost_centres(id) ON DELETE SET NULL,
    CONSTRAINT fk_acc_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_acc_finance_id ON acc_cost_centres (finance_id);


-- ============================================================
-- TABLE 11: acc_ledger_mailing
-- Purpose: Postal address and contact details per ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_mailing (
    id                   UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id           UUID            NOT NULL,
    ledger_id            UUID            NOT NULL,
    mailing_name         VARCHAR(200)    DEFAULT NULL,
    addr_line1           VARCHAR(255)    DEFAULT NULL,
    addr_line2           VARCHAR(255)    DEFAULT NULL,
    addr_line3           VARCHAR(255)    DEFAULT NULL,
    addr_line4           VARCHAR(255)    DEFAULT NULL,
    city                 VARCHAR(100)    DEFAULT NULL,
    district             VARCHAR(100)    DEFAULT NULL,
    state                VARCHAR(100)    DEFAULT NULL,
    country              VARCHAR(100)    DEFAULT 'India',
    pin_code             VARCHAR(10)     DEFAULT NULL,
    show_mailing_details BOOLEAN         NOT NULL DEFAULT true,
    provide_contact      BOOLEAN         NOT NULL DEFAULT false,
    contact_person       VARCHAR(150)    DEFAULT NULL,
    telephone            VARCHAR(30)     DEFAULT NULL,
    mobile               VARCHAR(20)     DEFAULT NULL,
    primary_mobile       VARCHAR(20)     DEFAULT NULL,
    fax                  VARCHAR(30)     DEFAULT NULL,
    email                VARCHAR(150)    DEFAULT NULL,
    email_cc             VARCHAR(150)    DEFAULT NULL,
    website              VARCHAR(200)    DEFAULT NULL,
    created_by           VARCHAR(100)    DEFAULT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_mailing UNIQUE (ledger_id),
    CONSTRAINT fk_alm_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alm_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alm_finance_id ON acc_ledger_mailing (finance_id);
CREATE INDEX IF NOT EXISTS idx_alm_city ON acc_ledger_mailing (city);
CREATE INDEX IF NOT EXISTS idx_alm_state ON acc_ledger_mailing (state);


-- ============================================================
-- TABLE 12: acc_ledger_banking
-- Purpose: Party bank account details per ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_banking (
    id                    UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id            UUID            NOT NULL,
    ledger_id             UUID            NOT NULL,
    provide_bank_details  BOOLEAN         NOT NULL DEFAULT false,
    account_holder_name   VARCHAR(200)    DEFAULT NULL,
    bank_name             VARCHAR(150)    DEFAULT NULL,
    account_number        VARCHAR(50)     DEFAULT NULL,
    ifsc_code             VARCHAR(11)     DEFAULT NULL,
    swift_code            VARCHAR(11)     DEFAULT NULL,
    branch_name           VARCHAR(150)    DEFAULT NULL,
    acc_type              acc_bank_acc_type_enum NOT NULL DEFAULT 'Current',
    upi_id                VARCHAR(100)    DEFAULT NULL,
    is_primary            BOOLEAN         NOT NULL DEFAULT false,
    created_by            VARCHAR(100)    DEFAULT NULL,
    created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_account UNIQUE (finance_id, ledger_id, account_number),
    CONSTRAINT fk_alb_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alb_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alb_finance_id ON acc_ledger_banking (finance_id);
CREATE INDEX IF NOT EXISTS idx_alb_ledger_id ON acc_ledger_banking (ledger_id);
-- PostgreSQL Partial Unique Index: ensures at most one primary account per ledger
CREATE UNIQUE INDEX IF NOT EXISTS uk_ledger_primary ON acc_ledger_banking (ledger_id) WHERE is_primary = true;


-- ============================================================
-- TABLE 13: acc_ledger_banking_txn_types
-- Purpose: Multi-select transaction types per bank account
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_banking_txn_types (
    id                  UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id          UUID            NOT NULL,
    ledger_banking_id   UUID            NOT NULL,
    txn_type            acc_bank_txn_type_enum NOT NULL,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_banking_txn_type UNIQUE (ledger_banking_id, txn_type),
    CONSTRAINT fk_albtt_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albtt_banking FOREIGN KEY (ledger_banking_id) REFERENCES acc_ledger_banking(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_albtt_finance_id ON acc_ledger_banking_txn_types (finance_id);
CREATE INDEX IF NOT EXISTS idx_albtt_banking_id ON acc_ledger_banking_txn_types (ledger_banking_id);


-- ============================================================
-- TABLE 14: acc_ledger_txn_type_config
-- Purpose: Per-transaction-type sub-dialog configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_txn_type_config (
    id                  UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id          UUID            NOT NULL,
    txn_type_id         UUID            NOT NULL UNIQUE,
    txn_type            acc_bank_txn_type_enum NOT NULL,

    -- ATM
    atm_id              VARCHAR(100)    DEFAULT NULL,
    -- Card
    card_type           VARCHAR(50)     DEFAULT NULL,
    card_number         VARCHAR(20)     DEFAULT NULL,
    auth_required       BOOLEAN         DEFAULT NULL,
    -- Cheque / Electronic Cheque
    cheque_no           VARCHAR(20)     DEFAULT NULL,
    printing_enabled    BOOLEAN         DEFAULT NULL,
    range_from          INT             DEFAULT NULL,
    range_to            INT             DEFAULT NULL,
    -- ECS
    mandate_no          VARCHAR(50)     DEFAULT NULL,
    ref_no              VARCHAR(100)    DEFAULT NULL,
    -- e-Fund Transfer
    eft_account_number  VARCHAR(50)     DEFAULT NULL,
    eft_ifsc            VARCHAR(11)     DEFAULT NULL,
    ref_format          VARCHAR(100)    DEFAULT NULL,
    txn_identifier      VARCHAR(100)    DEFAULT NULL,
    -- Electronic DD/PO
    instrument_no       VARCHAR(50)     DEFAULT NULL,
    issue_date          DATE            DEFAULT NULL,
    -- Shared across multiple types
    bank_name           VARCHAR(150)    DEFAULT NULL,
    branch              VARCHAR(150)    DEFAULT NULL,
    narration           VARCHAR(500)    DEFAULT NULL,
    -- Others
    description         VARCHAR(500)    DEFAULT NULL,
    reference           VARCHAR(200)    DEFAULT NULL,
    remarks             VARCHAR(500)    DEFAULT NULL,

    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_alttc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alttc_txn_type FOREIGN KEY (txn_type_id) REFERENCES acc_ledger_banking_txn_types(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alttc_finance_id ON acc_ledger_txn_type_config (finance_id);


-- ============================================================
-- TABLE 15: acc_ledger_tax
-- Purpose: PAN, GSTIN, registration type, TDS/TCS settings
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_tax (
    id                       UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id               UUID            NOT NULL,
    ledger_id                UUID            NOT NULL,

    -- GST registration
    pan_number               VARCHAR(10)     DEFAULT NULL,
    gstin                    VARCHAR(15)     DEFAULT NULL,
    reg_type                 acc_gst_reg_type_enum NOT NULL DEFAULT 'Unregistered',
    assessee_other_territory BOOLEAN         NOT NULL DEFAULT false,
    territory                VARCHAR(150)    DEFAULT NULL,

    -- Tax Deductor extras
    tan_number               VARCHAR(10)     DEFAULT NULL,
    deductor_category        VARCHAR(100)    DEFAULT NULL,

    -- Tax Collector (E-Commerce) extras
    collection_account_no    VARCHAR(20)     DEFAULT NULL,

    -- TDS / TCS for party ledgers
    tax_type                 acc_party_tax_type_enum NOT NULL DEFAULT 'None',
    deductee_type            acc_deductee_type_enum DEFAULT NULL,
    buyer_type               acc_buyer_type_enum DEFAULT NULL,

    -- System flags
    tds_applicable           BOOLEAN         NOT NULL DEFAULT false,
    tcs_applicable           BOOLEAN         NOT NULL DEFAULT false,

    created_by               VARCHAR(100)    DEFAULT NULL,
    created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_tax UNIQUE (ledger_id),
    CONSTRAINT fk_alt_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alt_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alt_finance_id ON acc_ledger_tax (finance_id);
CREATE INDEX IF NOT EXISTS idx_alt_gstin ON acc_ledger_tax (gstin);
CREATE INDEX IF NOT EXISTS idx_alt_pan ON acc_ledger_tax (pan_number);


-- ============================================================
-- TABLE 16: acc_ledger_statutory
-- Purpose: MSME, e-Invoice, e-Way Bill settings for party ledgers
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_statutory (
    id                      UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id              UUID            NOT NULL,
    ledger_id               UUID            NOT NULL,

    -- MSME
    msme_registered         BOOLEAN         NOT NULL DEFAULT false,
    udyam_number            VARCHAR(19)     DEFAULT NULL,

    -- e-Invoice
    einvoice_applicable     BOOLEAN         NOT NULL DEFAULT false,
    default_supply_type     acc_default_supply_type_enum NOT NULL DEFAULT 'B2B',

    -- e-Way Bill
    eway_bill_applicable    BOOLEAN         NOT NULL DEFAULT false,
    default_transport_mode  acc_default_transport_mode_enum NOT NULL DEFAULT 'Road',
    default_distance_km     NUMERIC(8,2)    DEFAULT NULL,

    created_by              VARCHAR(100)    DEFAULT NULL,
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_statutory UNIQUE (ledger_id),
    CONSTRAINT fk_als_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_als_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_als_finance_id ON acc_ledger_statutory (finance_id);


-- ============================================================
-- TABLE 17: acc_ledger_billwise
-- Purpose: Credit limits and bill-wise tracking configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_billwise (
    id                UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id        UUID            NOT NULL,
    ledger_id         UUID            NOT NULL,
    bill_wise         BOOLEAN         NOT NULL DEFAULT false,
    credit_days       SMALLINT        DEFAULT 30,
    check_credit_days BOOLEAN         NOT NULL DEFAULT false,
    created_by        VARCHAR(100)    DEFAULT NULL,
    created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_credit_days CHECK (credit_days >= 0),
    CONSTRAINT uk_ledger_billwise UNIQUE (ledger_id),
    CONSTRAINT fk_albw_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albw_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_albw_finance_id ON acc_ledger_billwise (finance_id);
CREATE INDEX IF NOT EXISTS idx_albw_bill_wise ON acc_ledger_billwise (bill_wise);


-- ============================================================
-- TABLE 18: acc_ledger_tax_config
-- Purpose: GST rate configuration and statutory details per ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_tax_config (
    id                          UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id                  UUID            NOT NULL,
    ledger_id                   UUID            NOT NULL,

    -- Top-level GST applicability
    gst_applicable              acc_gst_applicability_enum NOT NULL DEFAULT 'Undefined',
    set_alter_gst_details       BOOLEAN         NOT NULL DEFAULT false,

    -- GST rate details
    gst_description             VARCHAR(200)    DEFAULT NULL,
    applicable_from             DATE            DEFAULT NULL,
    hsn_sac_code                VARCHAR(20)     DEFAULT NULL,
    hsn_sac_details             acc_hsn_details_mode_enum NOT NULL DEFAULT 'As per Company',
    source_of_details           acc_hsn_source_mode_enum NOT NULL DEFAULT 'As per Company',
    hsn_description             VARCHAR(500)    DEFAULT NULL,
    type_of_supply              acc_type_of_supply_enum DEFAULT NULL,
    taxability                  acc_taxability_enum DEFAULT NULL,

    -- Tax rates
    igst_rate                   NUMERIC(5,2)    NOT NULL DEFAULT 0.00,
    cgst_rate                   NUMERIC(5,2)    NOT NULL DEFAULT 0.00,
    sgst_rate                   NUMERIC(5,2)    NOT NULL DEFAULT 0.00,
    cess_rate                   NUMERIC(5,2)    NOT NULL DEFAULT 0.00,
    cess_type                   acc_cess_type_enum NOT NULL DEFAULT 'Valorem',
    cess_per_unit               NUMERIC(10,4)   DEFAULT NULL,
    cess_unit                   VARCHAR(50)     DEFAULT NULL,
    reverse_charge              BOOLEAN         NOT NULL DEFAULT false,
    include_in_assessable       BOOLEAN         NOT NULL DEFAULT false,
    appropriate_to              VARCHAR(50)     DEFAULT NULL,
    method_of_appropriation     VARCHAR(50)     DEFAULT NULL,

    -- GST lifecycle
    gst_status                  acc_gst_status_enum NOT NULL DEFAULT 'Active',
    cancelled_date              DATE            DEFAULT NULL,

    -- Loans & Advances group specific
    nature_of_transaction       VARCHAR(150)    DEFAULT NULL,
    hsn_igst_rate               NUMERIC(5,2)    DEFAULT NULL,

    -- Duties & Taxes group specific
    duty_tax_type               acc_duty_tax_type_enum DEFAULT NULL,
    duty_tax_sub_type           VARCHAR(150)    DEFAULT NULL,
    duty_percentage             NUMERIC(5,2)    DEFAULT NULL,
    calc_based_on               acc_duty_calc_based_enum NOT NULL DEFAULT 'On Total Sales',
    used_in_vat_returns         BOOLEAN         NOT NULL DEFAULT false,
    method_of_calculation_duty  acc_method_calc_duty_enum NOT NULL DEFAULT 'On Total Sales',

    -- Legacy / system fields
    gst_type                    acc_gst_type_enum DEFAULT 'CGST',
    tax_percentage              NUMERIC(5,2)    DEFAULT 0.00,
    default_tax_ledger_id       UUID            DEFAULT NULL,

    created_by                  VARCHAR(100)    DEFAULT NULL,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_tax_config UNIQUE (ledger_id),
    CONSTRAINT fk_altc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_altc_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_altc_default_tax_ledger FOREIGN KEY (default_tax_ledger_id) REFERENCES acc_ledgers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_altc_finance_id ON acc_ledger_tax_config (finance_id);
CREATE INDEX IF NOT EXISTS idx_altc_hsn_code ON acc_ledger_tax_config (hsn_sac_code);


-- ============================================================
-- TABLE 19: acc_ledger_loan_config
-- Purpose: Loan / EMI configuration linked to loans table
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_loan_config (
    id            UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id    UUID            NOT NULL,
    ledger_id     UUID            NOT NULL,
    loan_id       UUID            DEFAULT NULL,
    interest_pct  NUMERIC(5,2)    DEFAULT NULL,
    penalty_pct   NUMERIC(5,2)    DEFAULT NULL,
    emi_type      acc_emi_type_enum DEFAULT 'EMI',
    created_by    VARCHAR(100)    DEFAULT NULL,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_loan_config UNIQUE (ledger_id),
    CONSTRAINT fk_allc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_allc_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_allc_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_allc_finance_id ON acc_ledger_loan_config (finance_id);
CREATE INDEX IF NOT EXISTS idx_allc_loan_id ON acc_ledger_loan_config (loan_id);


-- ============================================================
-- TABLE 20: acc_ledger_bank_config
-- Purpose: Bank Accounts group — cheque book and reconciliation
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_bank_config (
    id                       UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id               UUID            NOT NULL,
    ledger_id                UUID            NOT NULL,
    recon_effective_date     DATE            DEFAULT NULL,
    set_alter_cheque_books   BOOLEAN         NOT NULL DEFAULT false,
    enable_cheque_printing   BOOLEAN         NOT NULL DEFAULT false,
    cheque_print_bank_name   VARCHAR(150)    DEFAULT NULL,
    created_by               VARCHAR(100)    DEFAULT NULL,
    created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_ledger_bank_config UNIQUE (ledger_id),
    CONSTRAINT fk_albc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albc_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_albc_finance_id ON acc_ledger_bank_config (finance_id);


-- ============================================================
-- TABLE 21: acc_ledger_cheque_books
-- Purpose: Cheque book ranges per bank ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_ledger_cheque_books (
    id              UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id      UUID            NOT NULL,
    bank_config_id  UUID            NOT NULL,
    book_name       VARCHAR(100)    NOT NULL,
    from_number     VARCHAR(20)     NOT NULL,
    to_number       VARCHAR(20)     NOT NULL,
    cheque_length   SMALLINT        NOT NULL DEFAULT 6,
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_alcb_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alcb_bank_config FOREIGN KEY (bank_config_id) REFERENCES acc_ledger_bank_config(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alcb_finance_id ON acc_ledger_cheque_books (finance_id);
CREATE INDEX IF NOT EXISTS idx_alcb_bank_config_id ON acc_ledger_cheque_books (bank_config_id);


-- ============================================================
-- TABLE 22: acc_bill_references
-- Purpose: Bill-wise outstanding tracking per party
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_bill_references (
    id                 UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id         UUID            NOT NULL,
    ledger_id          UUID            NOT NULL,
    voucher_id         UUID            DEFAULT NULL,
    bill_number        VARCHAR(80)     NOT NULL,
    bill_date          DATE            NOT NULL,
    bill_amount        NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    pending_amount     NUMERIC(15,2)   NOT NULL DEFAULT 0.00,
    due_date           DATE            DEFAULT NULL,
    is_settled         BOOLEAN         NOT NULL DEFAULT false,
    is_opening_balance BOOLEAN         NOT NULL DEFAULT false,
    settled_at         DATE            DEFAULT NULL,
    ref_type           acc_bill_ref_type_enum DEFAULT 'New Ref',
    narration          VARCHAR(500)    DEFAULT NULL,
    created_by         VARCHAR(100)    DEFAULT NULL,
    created_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_bill_ledger_number UNIQUE (finance_id, ledger_id, bill_number),
    CONSTRAINT fk_abr_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_abr_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_abr_voucher FOREIGN KEY (voucher_id) REFERENCES acc_vouchers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_abr_finance_id ON acc_bill_references (finance_id);
CREATE INDEX IF NOT EXISTS idx_abr_ledger_id ON acc_bill_references (ledger_id);
CREATE INDEX IF NOT EXISTS idx_abr_voucher_id ON acc_bill_references (voucher_id);
CREATE INDEX IF NOT EXISTS idx_abr_is_settled ON acc_bill_references (is_settled);
CREATE INDEX IF NOT EXISTS idx_abr_bill_date ON acc_bill_references (bill_date);


-- ============================================================
-- TABLE 23: acc_audit_log
-- Purpose: Field-level change history for all accounting tables
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_audit_log (
    id          UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id  UUID            NOT NULL,
    table_name  VARCHAR(60)     NOT NULL,
    record_id   VARCHAR(40)     NOT NULL,
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
-- SECTION 24: TRIGGERS & BUSINESS RULES
-- ============================================================

-- 24.1: Trigger to maintain acc_ledger_balances automatically
CREATE OR REPLACE FUNCTION fn_trg_update_ledger_balance_after_insert()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_ledger_balance_after_insert ON acc_voucher_entries;
CREATE TRIGGER trg_update_ledger_balance_after_insert
AFTER INSERT ON acc_voucher_entries
FOR EACH ROW
EXECUTE FUNCTION fn_trg_update_ledger_balance_after_insert();


-- 24.2: Trigger to check Voucher Debit = Credit balance before posting
CREATE OR REPLACE FUNCTION fn_trg_voucher_entry_balance_check()
RETURNS TRIGGER AS $$
DECLARE
    v_status   acc_voucher_status_enum;
    v_total_dr NUMERIC(15,2);
    v_total_cr NUMERIC(15,2);
    v_diff     NUMERIC(15,2);
BEGIN
    SELECT status INTO v_status FROM acc_vouchers WHERE id = NEW.voucher_id;

    IF v_status = 'Posted' THEN
        SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'Dr' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN entry_type = 'Cr' THEN amount ELSE 0 END), 0)
        INTO v_total_dr, v_total_cr
        FROM acc_voucher_entries WHERE voucher_id = NEW.voucher_id;

        v_diff := ABS(v_total_dr - v_total_cr);

        IF v_diff > 0.01 THEN
            RAISE EXCEPTION 'Voucher imbalance: Debit total (%) must equal Credit total (%)', v_total_dr, v_total_cr;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voucher_entry_balance_check ON acc_voucher_entries;
CREATE TRIGGER trg_voucher_entry_balance_check
AFTER INSERT OR UPDATE ON acc_voucher_entries
FOR EACH ROW
EXECUTE FUNCTION fn_trg_voucher_entry_balance_check();


-- ============================================================
-- SECTION 25: USEFUL VIEWS FOR FINANCIAL REPORTING
-- ============================================================

-- 25.1: Trial Balance
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
    COALESCE(g.finance_id, l.finance_id) AS finance_id,
    COALESCE(g.nature, gm.nature)        AS nature,
    COALESCE(g.group_name, gm.group_name)AS group_name,
    l.id                                 AS ledger_id,
    l.ledger_code,
    l.ledger_name,
    b.financial_year,
    b.opening_dr,
    b.opening_cr,
    b.period_dr,
    b.period_cr,
    b.closing_dr,
    b.closing_cr,
    (b.closing_dr - b.closing_cr)        AS net_balance
FROM acc_ledger_balances b
JOIN acc_ledgers         l  ON l.id = b.ledger_id
LEFT JOIN acc_ledger_groups g  ON g.id = l.group_id
LEFT JOIN acc_group_master  gm ON gm.id = l.master_group_id
WHERE l.is_active = true;

-- 25.2: Day Book (all posted vouchers with transaction lines)
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

COMMIT;

-- ============================================================
-- END OF AUTOFINEX ACCOUNTING SCHEMA
-- Total: 23 Tables | 2 Triggers | 2 Views | Pure PostgreSQL 18+ DDL
-- Native UUID v7 | Idempotent Execution
-- ============================================================


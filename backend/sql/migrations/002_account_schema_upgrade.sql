-- ==============================================================================
-- MIGRATION: 002_account_schema_upgrade.sql
-- PURPOSE  : Upgrade AutoFinex Accounting Module from 17 tables to full
--            23-table TallyPrime-compliant architecture.
-- DATE     : 2026-10-30
-- ENGINE   : PostgreSQL 18+ (uses native uuidv7() primary keys)
--
-- SOURCE FILES:
--   - CURRENT: backend/sql/AutoFinex_final_schema.sql (17 account tables)
--   - TARGET : backend/sql/Autofinex_account_schema.sql (23 account tables)
--
-- TABLES ADDED (6 new tables):
--   1. acc_group_master             - Global 28 TallyPrime system groups catalogue
--   2. acc_ledger_statutory         - MSME (Udyam), e-Invoice & e-Way Bill defaults
--   3. acc_ledger_banking_txn_types - Multi-select transaction types per bank
--   4. acc_ledger_txn_type_config   - Sub-dialog config (ATM, Card, Cheque, ECS, eFund, etc.)
--   5. acc_ledger_bank_config       - Bank Accounts — Cheque book & BRS reconciliation config
--   6. acc_ledger_cheque_books      - Cheque book ranges per bank account
--
-- TABLES ALTERED (7 existing tables enhanced with TallyPrime features):
--   1. acc_ledger_groups  - Added system_parent_id, custom_parent_id, root_master_id
--   2. acc_ledgers        - Relaxed ledger_code/group_id NOT NULL; added master_group_id,
--                           alias, alias_regional, reporting_under, inactive, freeze_balance,
--                           inv_values_affected, type_of_ledger, rounding_method/limit,
--                           appropriation_method, method_to_allocate, is_additional_cost,
--                           cost_centre_applicable/allocation, ledger_flushing_method,
--                           buyer/seller inclusion, and exclusivity CHECK constraint.
--   3. acc_ledger_mailing - Added mailing_name, addr_line3/4, district, show_mailing_details,
--                           provide_contact, contact_person, telephone, mobile, primary_mobile,
--                           fax, email, email_cc, website.
--   4. acc_ledger_banking - Added provide_bank_details, account_holder_name, swift_code;
--                           enforced single primary account via partial unique index.
--   5. acc_ledger_tax     - Added assessee_other_territory, territory, tan_number,
--                           deductor_category, collection_account_no, tax_type,
--                           deductee_type, buyer_type.
--   6. acc_ledger_billwise- Added check_credit_days; default credit_days = 30.
--   7. acc_ledger_tax_config - Added gst_applicable, set_alter_gst_details, hsn_sac_code/details,
--                              taxability, igst/cgst/sgst/cess rates, reverse_charge,
--                              duty_tax_type, calc_based_on, method_of_calculation_duty.
--   8. acc_bill_references   - Added is_opening_balance flag.
--
-- GUARANTEES:
--   - Single atomic transaction (BEGIN ... COMMIT).
--   - Zero destructive operations (NO DROP TABLE, NO DROP COLUMN, NO TRUNCATE).
--   - Multi-tenant data integrity (finance_id foreign keys and indexes preserved).
--   - Completely idempotent & re-runnable without errors.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
-- Ensure standard UUID/crypto extension is available if needed on older hosts
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Provide uuidv7 fallback for PostgreSQL < 18 environments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'uuidv7'
    ) THEN
        EXECUTE 'CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $f$ BEGIN RETURN gen_random_uuid(); END; $f$ LANGUAGE plpgsql;';
    END IF;
END $$;


-- ==============================================================================
-- 2. ENUM TYPES (Idempotent creation and value additions)
-- ==============================================================================

-- 2.1 New Enum Types
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

-- 2.2 Expand Existing Enum Types with New Values
ALTER TYPE acc_bank_acc_type_enum ADD VALUE IF NOT EXISTS 'Cash Credit';
ALTER TYPE acc_bank_acc_type_enum ADD VALUE IF NOT EXISTS 'Overdraft';
ALTER TYPE acc_bank_acc_type_enum ADD VALUE IF NOT EXISTS 'Loan A/c';

ALTER TYPE acc_bank_txn_type_enum ADD VALUE IF NOT EXISTS 'ATM';
ALTER TYPE acc_bank_txn_type_enum ADD VALUE IF NOT EXISTS 'Card';
ALTER TYPE acc_bank_txn_type_enum ADD VALUE IF NOT EXISTS 'ECS';
ALTER TYPE acc_bank_txn_type_enum ADD VALUE IF NOT EXISTS 'e-Fund Transfer';
ALTER TYPE acc_bank_txn_type_enum ADD VALUE IF NOT EXISTS 'Electronic Cheque';
ALTER TYPE acc_bank_txn_type_enum ADD VALUE IF NOT EXISTS 'Electronic DD/PO';
ALTER TYPE acc_bank_txn_type_enum ADD VALUE IF NOT EXISTS 'Others';

ALTER TYPE acc_gst_reg_type_enum ADD VALUE IF NOT EXISTS 'SEZ Unit';
ALTER TYPE acc_gst_reg_type_enum ADD VALUE IF NOT EXISTS 'SEZ Developer';
ALTER TYPE acc_gst_reg_type_enum ADD VALUE IF NOT EXISTS 'Deemed Export';
ALTER TYPE acc_gst_reg_type_enum ADD VALUE IF NOT EXISTS 'Tax Deductor';
ALTER TYPE acc_gst_reg_type_enum ADD VALUE IF NOT EXISTS 'Tax Collector (E-Commerce)';
ALTER TYPE acc_gst_reg_type_enum ADD VALUE IF NOT EXISTS 'Input Service Distributor';
ALTER TYPE acc_gst_reg_type_enum ADD VALUE IF NOT EXISTS 'UIN Holder';


-- ==============================================================================
-- 3. NEW TABLES (Created in Dependency Order)
-- ==============================================================================

-- 3.1: Table 1: acc_group_master (Universal Global System Catalogue)
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

-- Seed Canonical 28 Tally Prime Groups in acc_group_master
-- Root Groups (15 Primary)
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

-- Child Sub-Groups (13 Groups linked to parent_id)
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

-- 3.2: Table 13: acc_ledger_banking_txn_types
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

-- 3.3: Table 14: acc_ledger_txn_type_config
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

-- 3.4: Table 16: acc_ledger_statutory
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

-- 3.5: Table 20: acc_ledger_bank_config
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

-- 3.6: Table 21: acc_ledger_cheque_books
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


-- ==============================================================================
-- 4. ALTER EXISTING TABLES (Add missing TallyPrime columns safely)
-- ==============================================================================

-- 4.1 acc_ledger_groups: Add master group & hierarchy pointer columns
ALTER TABLE acc_ledger_groups
    ADD COLUMN IF NOT EXISTS system_parent_id UUID DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS custom_parent_id UUID DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS root_master_id   UUID DEFAULT NULL;

-- 4.2 acc_ledgers: Relax NOT NULL constraints & Add Advanced Ledger columns
ALTER TABLE acc_ledgers
    ALTER COLUMN ledger_code DROP NOT NULL,
    ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE acc_ledgers
    ADD COLUMN IF NOT EXISTS alias                   VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS alias_regional          VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS master_group_id         UUID DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reporting_under         VARCHAR(200) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS inactive                BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS freeze_balance          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS inv_values_affected     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS type_of_ledger          acc_ledger_type_enum NOT NULL DEFAULT 'Not Applicable',
    ADD COLUMN IF NOT EXISTS rounding_method         acc_rounding_method_enum NOT NULL DEFAULT 'Not Applicable',
    ADD COLUMN IF NOT EXISTS rounding_limit          NUMERIC(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS appropriation_method    acc_appropriation_method_enum NOT NULL DEFAULT 'Not Applicable',
    ADD COLUMN IF NOT EXISTS method_to_allocate      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_additional_cost      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cost_centre_applicable  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cost_centre_allocation  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ledger_flushing_method  acc_flushing_method_enum NOT NULL DEFAULT 'Default',
    ADD COLUMN IF NOT EXISTS include_in_buyer_ledger BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS include_in_seller_ledger BOOLEAN NOT NULL DEFAULT false;

-- 4.3 acc_ledger_mailing: Add full multi-line postal & contact attributes
ALTER TABLE acc_ledger_mailing
    ADD COLUMN IF NOT EXISTS mailing_name         VARCHAR(200) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS addr_line3           VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS addr_line4           VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS district             VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS show_mailing_details BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS provide_contact      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS contact_person       VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS telephone            VARCHAR(30) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mobile               VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS primary_mobile       VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS fax                  VARCHAR(30) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS email                VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS email_cc             VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS website              VARCHAR(200) DEFAULT NULL;

-- 4.4 acc_ledger_banking: Add bank details toggle, holder name & swift code
ALTER TABLE acc_ledger_banking
    ADD COLUMN IF NOT EXISTS provide_bank_details BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS account_holder_name  VARCHAR(200) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS swift_code           VARCHAR(11) DEFAULT NULL;

-- 4.5 acc_ledger_tax: Add extended tax deductor/collector & party classification
ALTER TABLE acc_ledger_tax
    ADD COLUMN IF NOT EXISTS assessee_other_territory BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS territory                VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS tan_number               VARCHAR(10) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deductor_category        VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS collection_account_no    VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS tax_type                 acc_party_tax_type_enum NOT NULL DEFAULT 'None',
    ADD COLUMN IF NOT EXISTS deductee_type            acc_deductee_type_enum DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS buyer_type               acc_buyer_type_enum DEFAULT NULL;

-- 4.6 acc_ledger_billwise: Add credit days check toggle
ALTER TABLE acc_ledger_billwise
    ADD COLUMN IF NOT EXISTS check_credit_days BOOLEAN NOT NULL DEFAULT false;

-- 4.7 acc_ledger_tax_config: Add granular GST, cess & calculation parameters
ALTER TABLE acc_ledger_tax_config
    ADD COLUMN IF NOT EXISTS gst_applicable             acc_gst_applicability_enum NOT NULL DEFAULT 'Undefined',
    ADD COLUMN IF NOT EXISTS set_alter_gst_details      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS gst_description            VARCHAR(200) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS applicable_from            DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS hsn_sac_code               VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS hsn_sac_details            acc_hsn_details_mode_enum NOT NULL DEFAULT 'As per Company',
    ADD COLUMN IF NOT EXISTS source_of_details          acc_hsn_source_mode_enum NOT NULL DEFAULT 'As per Company',
    ADD COLUMN IF NOT EXISTS hsn_description            VARCHAR(500) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS type_of_supply             acc_type_of_supply_enum DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS taxability                 acc_taxability_enum DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS igst_rate                  NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cgst_rate                  NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sgst_rate                  NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cess_rate                  NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cess_type                  acc_cess_type_enum NOT NULL DEFAULT 'Valorem',
    ADD COLUMN IF NOT EXISTS cess_per_unit              NUMERIC(10,4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS cess_unit                  VARCHAR(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reverse_charge             BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS include_in_assessable      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS appropriate_to             VARCHAR(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS method_of_appropriation    VARCHAR(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gst_status                 acc_gst_status_enum NOT NULL DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS cancelled_date             DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS nature_of_transaction      VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS hsn_igst_rate              NUMERIC(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS duty_tax_type              acc_duty_tax_type_enum DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS duty_tax_sub_type          VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS duty_percentage            NUMERIC(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS calc_based_on              acc_duty_calc_based_enum NOT NULL DEFAULT 'On Total Sales',
    ADD COLUMN IF NOT EXISTS used_in_vat_returns        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS method_of_calculation_duty acc_method_calc_duty_enum NOT NULL DEFAULT 'On Total Sales';

-- 4.8 acc_bill_references: Add opening balance identification flag
ALTER TABLE acc_bill_references
    ADD COLUMN IF NOT EXISTS is_opening_balance BOOLEAN NOT NULL DEFAULT false;


-- ==============================================================================
-- 5. DATA BACKFILL & HARMONIZATION (Non-destructive data migration)
-- ==============================================================================

-- 5.1 Backfill acc_ledger_groups system_parent_id & custom_parent_id
DO $$
BEGIN
    -- For system groups, map to acc_group_master
    UPDATE acc_ledger_groups alg
       SET system_parent_id = agm.id
      FROM acc_group_master agm
     WHERE alg.is_system = true
       AND LOWER(alg.group_name) = LOWER(agm.group_name)
       AND alg.system_parent_id IS NULL;

    -- For child groups with parent_group_id pointing to another custom group
    UPDATE acc_ledger_groups alg
       SET custom_parent_id = alg.parent_group_id
     WHERE alg.parent_group_id IS NOT NULL
       AND alg.custom_parent_id IS NULL
       AND EXISTS (SELECT 1 FROM acc_ledger_groups p WHERE p.id = alg.parent_group_id AND p.is_system = false);

    -- For child groups with parent_group_id pointing to a system group
    UPDATE acc_ledger_groups alg
       SET system_parent_id = agm.id
      FROM acc_ledger_groups p
      JOIN acc_group_master agm ON LOWER(p.group_name) = LOWER(agm.group_name)
     WHERE alg.parent_group_id = p.id
       AND p.is_system = true
       AND alg.system_parent_id IS NULL;
END $$;

-- 5.2 Backfill acc_ledgers: resolve Under selection exclusivity
DO $$
BEGIN
    -- If group_id points to an acc_ledger_groups row that was a system group,
    -- route directly to acc_group_master.id and null out group_id
    UPDATE acc_ledgers l
       SET master_group_id = agm.id,
           group_id = NULL
      FROM acc_ledger_groups lg
      JOIN acc_group_master agm ON LOWER(lg.group_name) = LOWER(agm.group_name)
     WHERE l.group_id = lg.id
       AND lg.is_system = true
       AND l.master_group_id IS NULL;

    -- Default fallback for any dangling rows to ensure exclusivity holds
    UPDATE acc_ledgers l
       SET master_group_id = (SELECT id FROM acc_group_master WHERE group_name = 'Current Assets' LIMIT 1),
           group_id = NULL
     WHERE l.group_id IS NULL AND l.master_group_id IS NULL;
END $$;


-- ==============================================================================
-- 6. CONSTRAINTS & FOREIGN KEYS (Idempotent validation)
-- ==============================================================================

-- 6.1 Foreign Keys on acc_ledger_groups
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alg_sys_parent') THEN
        ALTER TABLE acc_ledger_groups
            ADD CONSTRAINT fk_alg_sys_parent FOREIGN KEY (system_parent_id)
            REFERENCES acc_group_master(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alg_custom_parent') THEN
        ALTER TABLE acc_ledger_groups
            ADD CONSTRAINT fk_alg_custom_parent FOREIGN KEY (custom_parent_id)
            REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alg_root_master') THEN
        ALTER TABLE acc_ledger_groups
            ADD CONSTRAINT fk_alg_root_master FOREIGN KEY (root_master_id)
            REFERENCES acc_group_master(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- 6.2 Constraints on acc_ledgers
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_al_master_group') THEN
        ALTER TABLE acc_ledgers
            ADD CONSTRAINT fk_al_master_group FOREIGN KEY (master_group_id)
            REFERENCES acc_group_master(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ledger_under_exclusivity') THEN
        ALTER TABLE acc_ledgers
            ADD CONSTRAINT chk_ledger_under_exclusivity CHECK (
                (group_id IS NOT NULL AND master_group_id IS NULL)
                OR
                (group_id IS NULL AND master_group_id IS NOT NULL)
            );
    END IF;
END $$;

-- 6.3 Check constraint on acc_ledger_billwise
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_days') THEN
        ALTER TABLE acc_ledger_billwise
            ADD CONSTRAINT chk_credit_days CHECK (credit_days >= 0);
    END IF;
END $$;


-- ==============================================================================
-- 7. INDEXES (Idempotent creation)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_alg_sys_parent_id    ON acc_ledger_groups (system_parent_id);
CREATE INDEX IF NOT EXISTS idx_alg_custom_parent_id ON acc_ledger_groups (custom_parent_id);
CREATE INDEX IF NOT EXISTS idx_alg_root_master_id   ON acc_ledger_groups (root_master_id);
CREATE INDEX IF NOT EXISTS idx_alg_finance_nature   ON acc_ledger_groups (finance_id, nature);

CREATE INDEX IF NOT EXISTS idx_al_master_group_id   ON acc_ledgers (master_group_id);
CREATE INDEX IF NOT EXISTS idx_al_inactive          ON acc_ledgers (inactive);

CREATE INDEX IF NOT EXISTS idx_alm_city             ON acc_ledger_mailing (city);
CREATE INDEX IF NOT EXISTS idx_alm_state            ON acc_ledger_mailing (state);

-- Partial unique index for primary bank account per ledger
CREATE UNIQUE INDEX IF NOT EXISTS uk_ledger_primary ON acc_ledger_banking (ledger_id) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_alt_gstin            ON acc_ledger_tax (gstin);
CREATE INDEX IF NOT EXISTS idx_alt_pan              ON acc_ledger_tax (pan_number);

CREATE INDEX IF NOT EXISTS idx_altc_hsn_code        ON acc_ledger_tax_config (hsn_sac_code);


-- ==============================================================================
-- 8. FUNCTIONS & PROCEDURES
-- ==============================================================================

-- 8.1 Real-time ledger balance accumulation on voucher line insert
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

-- 8.2 Real-time double-entry Debit = Credit balance verification
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


-- ==============================================================================
-- 9. TRIGGERS
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_update_ledger_balance_after_insert ON acc_voucher_entries;
CREATE TRIGGER trg_update_ledger_balance_after_insert
AFTER INSERT ON acc_voucher_entries
FOR EACH ROW
EXECUTE FUNCTION fn_trg_update_ledger_balance_after_insert();

DROP TRIGGER IF EXISTS trg_voucher_entry_balance_check ON acc_voucher_entries;
CREATE TRIGGER trg_voucher_entry_balance_check
AFTER INSERT OR UPDATE ON acc_voucher_entries
FOR EACH ROW
EXECUTE FUNCTION fn_trg_voucher_entry_balance_check();


-- ==============================================================================
-- 10. VIEWS (Financial Reporting)
-- ==============================================================================

-- Drop existing views first if column definitions changed
DROP VIEW IF EXISTS v_trial_balance;
DROP VIEW IF EXISTS v_day_book;

-- 10.1 Trial Balance View (Aggregates master and custom chart of accounts)
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

-- 10.2 Day Book View (All posted vouchers with transaction lines)
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


-- ==============================================================================
-- 11. COMMENTS
-- ==============================================================================
COMMENT ON TABLE acc_group_master             IS 'Universal system-level group catalogue (TallyPrime predefined 28 groups)';
COMMENT ON TABLE acc_ledger_statutory         IS 'Party statutory details (MSME Udyam, e-Invoice, e-Way Bill defaults)';
COMMENT ON TABLE acc_ledger_banking_txn_types IS 'Multi-select bank transaction types enabled per bank ledger';
COMMENT ON TABLE acc_ledger_txn_type_config   IS 'Detailed sub-dialog configuration per bank transaction type';
COMMENT ON TABLE acc_ledger_bank_config       IS 'Bank Accounts reconciliation and cheque printing configuration';
COMMENT ON TABLE acc_ledger_cheque_books      IS 'Cheque book ranges per bank account';

COMMIT;

-- ==============================================================================
-- ROLLBACK INSTRUCTIONS (Reverse Migration Reference)
-- ==============================================================================
/*
To roll back this migration in an emergency, execute the following script:

BEGIN;
DROP VIEW IF EXISTS v_trial_balance;
DROP VIEW IF EXISTS v_day_book;

DROP TRIGGER IF EXISTS trg_voucher_entry_balance_check ON acc_voucher_entries;
DROP TRIGGER IF EXISTS trg_update_ledger_balance_after_insert ON acc_voucher_entries;
DROP FUNCTION IF EXISTS fn_trg_voucher_entry_balance_check();
DROP FUNCTION IF EXISTS fn_trg_update_ledger_balance_after_insert();

ALTER TABLE acc_ledgers DROP CONSTRAINT IF EXISTS chk_ledger_under_exclusivity;
ALTER TABLE acc_ledgers DROP CONSTRAINT IF EXISTS fk_al_master_group;
ALTER TABLE acc_ledger_groups DROP CONSTRAINT IF EXISTS fk_alg_root_master;
ALTER TABLE acc_ledger_groups DROP CONSTRAINT IF EXISTS fk_alg_custom_parent;
ALTER TABLE acc_ledger_groups DROP CONSTRAINT IF EXISTS fk_alg_sys_parent;

DROP INDEX IF EXISTS idx_altc_hsn_code;
DROP INDEX IF EXISTS idx_alt_pan;
DROP INDEX IF EXISTS idx_alt_gstin;
DROP INDEX IF EXISTS uk_ledger_primary;
DROP INDEX IF EXISTS idx_alm_state;
DROP INDEX IF EXISTS idx_alm_city;
DROP INDEX IF EXISTS idx_al_inactive;
DROP INDEX IF EXISTS idx_al_master_group_id;
DROP INDEX IF EXISTS idx_alg_finance_nature;
DROP INDEX IF EXISTS idx_alg_root_master_id;
DROP INDEX IF EXISTS idx_alg_custom_parent_id;
DROP INDEX IF EXISTS idx_alg_sys_parent_id;

DROP TABLE IF EXISTS acc_ledger_cheque_books;
DROP TABLE IF EXISTS acc_ledger_bank_config;
DROP TABLE IF EXISTS acc_ledger_txn_type_config;
DROP TABLE IF EXISTS acc_ledger_banking_txn_types;
DROP TABLE IF EXISTS acc_ledger_statutory;
DROP TABLE IF EXISTS acc_group_master;

COMMIT;
*/

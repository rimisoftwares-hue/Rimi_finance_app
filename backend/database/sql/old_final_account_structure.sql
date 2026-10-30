-- ============================================================
--  AUTO FINANCE MANAGEMENT SYSTEM
--  COMPLETE ACCOUNTING MODULE (TallyPrime-Style)
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
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- TABLE 1: acc_ledger_groups
-- Purpose: Chart of Accounts hierarchy (like Tally Groups)
-- ============================================================



CREATE TABLE acc_group_master (
    id                     INT           NOT NULL AUTO_INCREMENT,
    group_name             VARCHAR(150)  NOT NULL,   -- mandatory
    parent_id              INT           DEFAULT NULL, -- nullable (root groups)
    nature                 ENUM('Assets','Liabilities','Income','Expenses') NOT NULL, -- mandatory
    affects_gross_profit   TINYINT(1)    NOT NULL DEFAULT 0, -- optional to pass
    behaves_like_subledger TINYINT(1)    NOT NULL DEFAULT 0, -- optional to pass
    nett_balance_report    ENUM('Debit','Credit','Both') NOT NULL DEFAULT 'Both',
    sequence_order         SMALLINT      NOT NULL DEFAULT 0, -- optional but seed it
    is_active              TINYINT(1)    NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uk_master_group_name (group_name),
    CONSTRAINT fk_agm_parent FOREIGN KEY (parent_id)
        REFERENCES acc_group_master(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE acc_ledger_groups (
    id                       INT             NOT NULL AUTO_INCREMENT,
    finance_id               INT             NOT NULL,
    group_name               VARCHAR(150)    COLLATE utf8mb4_unicode_ci NOT NULL,
    alias                    VARCHAR(150)    COLLATE utf8mb4_unicode_ci DEFAULT NULL
                                             COMMENT 'Alternative name',
    alias_lang               JSON            DEFAULT NULL
                                             COMMENT 'Language wise aliases e.g. {"ta":"முதலீடுகள்","hi":"निवेश"}',

    system_parent_id         INT             DEFAULT NULL
                                             COMMENT 'FK → acc_group_master.id (parent is a system group)',
    custom_parent_id         INT             DEFAULT NULL
                                             COMMENT 'FK → acc_ledger_groups.id (parent is another custom group)',
    root_master_id           INT             DEFAULT NULL
                                             COMMENT 'Top-level acc_group_master ancestor for fast reporting',

    nature                   ENUM('Assets','Liabilities','Income','Expenses')
                                             COLLATE utf8mb4_unicode_ci NOT NULL,
    affects_gross_profit     TINYINT(1)      NOT NULL DEFAULT 0
                                             COMMENT '1=Yes - For Income/Expense groups',
    behaves_like_subledger   TINYINT(1)      NOT NULL DEFAULT 0
                                             COMMENT '1=Yes - Hide ledgers in reports',
    nett_balance_report      ENUM('Debit','Credit','Both')
                                             COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Both',
    used_for_calculation     TINYINT(1)      NOT NULL DEFAULT 0
                                             COMMENT 'For tax/discount calculation',
    allocation_method        ENUM('By Quantity','By Value','Not Applicable')
                                             COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Not Applicable',

    is_active                TINYINT(1)      NOT NULL DEFAULT 1,
    created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uk_group_name_finance        (finance_id, group_name),

    KEY idx_finance_id                      (finance_id),
    KEY idx_nature                          (nature),
    KEY idx_is_active                       (is_active),
    KEY idx_finance_nature                  (finance_id, nature),
    KEY idx_system_parent_id               (system_parent_id),
    KEY idx_custom_parent_id               (custom_parent_id),
    KEY idx_root_master_id                 (root_master_id),

    -- ─── CHECK Constraint (MySQL 8.0.16+) ───────────────────────
    -- Enforces exactly one parent is set, never both, never neither

    -- CONSTRAINT chk_parent_exclusivity CHECK (
    --     (system_parent_id IS NOT NULL AND custom_parent_id IS NULL)
    --     OR
    --     (system_parent_id IS NULL AND custom_parent_id IS NOT NULL)
    -- ),

    CONSTRAINT fk_alg_finance       FOREIGN KEY (finance_id)
        REFERENCES finance_detail (id)      ON DELETE CASCADE,

    CONSTRAINT fk_alg_sys_parent    FOREIGN KEY (system_parent_id)
        REFERENCES acc_group_master (id)    ON DELETE RESTRICT,

    CONSTRAINT fk_alg_custom_parent FOREIGN KEY (custom_parent_id)
        REFERENCES acc_ledger_groups (id)   ON DELETE RESTRICT,

    CONSTRAINT fk_alg_root_master   FOREIGN KEY (root_master_id)
        REFERENCES acc_group_master (id)    ON DELETE RESTRICT

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Chart of Accounts - Company custom group hierarchy (mirrors Tally Groups)';
-- ============================================================
-- TABLE 2: acc_ledgers
-- Purpose: Individual ledger accounts (like Tally Ledgers)
-- ============================================================
CREATE TABLE acc_ledgers (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    ledger_code     VARCHAR(30)     NOT NULL,
    ledger_name     VARCHAR(200)    NOT NULL,
    group_id        INT             NOT NULL,
    opening_balance DECIMAL(15,2)   DEFAULT 0.00,
    ob_type         ENUM('Dr','Cr') DEFAULT 'Dr',
    customer_id     INT             DEFAULT NULL,
    vehicle_id      INT             DEFAULT NULL,
    gstin           VARCHAR(15)     DEFAULT NULL,
    pan             VARCHAR(10)     DEFAULT NULL,
    tax_type        ENUM('None','CGST','SGST','IGST','TDS','TCS') DEFAULT 'None',
    is_bank_account TINYINT(1)      DEFAULT 0,
    bank_name       VARCHAR(100)    DEFAULT NULL,
    account_number  VARCHAR(50)     DEFAULT NULL,
    ifsc_code       VARCHAR(11)     DEFAULT NULL,
    is_system       TINYINT(1)      DEFAULT 0,
    is_active       TINYINT(1)      DEFAULT 1,
    notes           TEXT            DEFAULT NULL,
    -- v2 additions
    effective_date  DATE            DEFAULT NULL,
    remarks         VARCHAR(500)    DEFAULT NULL,
    address         VARCHAR(500)    DEFAULT NULL,
    contact         VARCHAR(20)     DEFAULT NULL,
    bank_branch     VARCHAR(150)    DEFAULT NULL,
    bank_txn_type   ENUM('NEFT','RTGS','IMPS','UPI','Cheque','Cash') DEFAULT 'NEFT',
    bank_acc_type   ENUM('Savings','Current','OD','CC','FD') DEFAULT 'Savings',
    upi_id          VARCHAR(100)    DEFAULT NULL,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_code_finance (finance_id, ledger_code),
    CONSTRAINT fk_al_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_al_group FOREIGN KEY (group_id) REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT,
    CONSTRAINT fk_al_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_al_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 3: acc_voucher_types
-- Purpose: Defines class of transaction (Receipt, Payment, etc.)
-- ============================================================
CREATE TABLE acc_voucher_types (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    type_code       VARCHAR(30)     NOT NULL,
    type_name       VARCHAR(100)    NOT NULL,
    class           ENUM('Receipt','Payment','Contra','Journal','Sales','Purchase','Debit Note','Credit Note','LoanDisbursement','LoanRepayment','VehicleExpense') NOT NULL,
    prefix          VARCHAR(20)     DEFAULT NULL,
    numbering_mode  ENUM('Auto','Manual') DEFAULT 'Auto',
    last_number     INT             DEFAULT 0,
    affects_stock   TINYINT(1)      DEFAULT 0,
    is_system       TINYINT(1)      DEFAULT 0,
    is_active       TINYINT(1)      DEFAULT 1,
    notes           VARCHAR(255)    DEFAULT NULL,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_type_code_finance (finance_id, type_code),
    CONSTRAINT fk_avt_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 4: acc_voucher_groups
-- Purpose: Batch/session grouping for vouchers
-- ============================================================
CREATE TABLE acc_voucher_groups (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    group_name      VARCHAR(150)    NOT NULL,
    group_date      DATE            NOT NULL,
    description     VARCHAR(500)    DEFAULT NULL,
    status          ENUM('Open','Closed','Cancelled') DEFAULT 'Open',
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_avg_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 5: acc_vouchers
-- Purpose: Transaction header (one row per transaction)
-- ============================================================
CREATE TABLE acc_vouchers (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    voucher_number  VARCHAR(50)     NOT NULL,
    voucher_type_id INT             NOT NULL,
    voucher_group_id INT            DEFAULT NULL,
    voucher_date    DATE            NOT NULL,
    financial_year  CHAR(9)         NOT NULL,
    narration       TEXT            DEFAULT NULL,
    total_amount    DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    customer_id     INT             DEFAULT NULL,
    vehicle_id      INT             DEFAULT NULL,
    loan_id         INT             DEFAULT NULL,
    payment_id      INT             DEFAULT NULL,
    vehicle_expense_id INT          DEFAULT NULL,
    payment_mode    ENUM('Cash','Bank','UPI','Cheque','Online','NEFT','RTGS','Other') DEFAULT NULL,
    cheque_number   VARCHAR(30)     DEFAULT NULL,
    cheque_date     DATE            DEFAULT NULL,
    bank_ref        VARCHAR(100)    DEFAULT NULL,
    status          ENUM('Draft','Posted','Cancelled') DEFAULT 'Draft',
    is_reconciled   TINYINT(1)      DEFAULT 0,
    reconciled_at   DATETIME        DEFAULT NULL,
    reconciled_by   VARCHAR(100)    DEFAULT NULL,
    gst_applicable  TINYINT(1)      DEFAULT 0,
    gst_number      VARCHAR(50)     DEFAULT NULL,
    cancelled_by    VARCHAR(100)    DEFAULT NULL,
    cancelled_at    DATETIME        DEFAULT NULL,
    cancel_reason   VARCHAR(500)    DEFAULT NULL,
    -- v2: multi-currency
    currency_code   CHAR(3)         NOT NULL DEFAULT 'INR',
    exchange_rate   DECIMAL(18,6)   NOT NULL DEFAULT 1.000000,
    base_amount     DECIMAL(15,2)   GENERATED ALWAYS AS (ROUND(total_amount * exchange_rate, 2)) STORED,
    created_by      VARCHAR(100)    DEFAULT NULL,
    updated_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_voucher_number_finance (finance_id, voucher_number),
    CONSTRAINT fk_av_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_av_type FOREIGN KEY (voucher_type_id) REFERENCES acc_voucher_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_av_group FOREIGN KEY (voucher_group_id) REFERENCES acc_voucher_groups(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_vehicle_expense FOREIGN KEY (vehicle_expense_id) REFERENCES vehicle_expenses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 6: acc_voucher_entries
-- Purpose: Double-entry debit/credit lines for each voucher
-- ============================================================
CREATE TABLE acc_voucher_entries (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    voucher_id      INT             NOT NULL,
    ledger_id       INT             NOT NULL,
    entry_type      ENUM('Dr','Cr') NOT NULL,
    amount          DECIMAL(15,2)   NOT NULL,
    narration       VARCHAR(500)    DEFAULT NULL,
    tax_type        ENUM('None','CGST','SGST','IGST','TDS','TCS') DEFAULT 'None',
    tax_rate        DECIMAL(5,2)    DEFAULT 0.00,
    tax_amount      DECIMAL(15,2)   DEFAULT 0.00,
    sort_order      SMALLINT        DEFAULT 0,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ave_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ave_voucher FOREIGN KEY (voucher_id) REFERENCES acc_vouchers(id) ON DELETE CASCADE,
    CONSTRAINT fk_ave_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 7: acc_ledger_balances
-- Purpose: Pre-aggregated ledger balances for fast reporting
-- ============================================================
CREATE TABLE acc_ledger_balances (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    ledger_id       INT             NOT NULL,
    financial_year  CHAR(9)         NOT NULL,
    opening_dr      DECIMAL(15,2)   DEFAULT 0.00,
    opening_cr      DECIMAL(15,2)   DEFAULT 0.00,
    period_dr       DECIMAL(15,2)   DEFAULT 0.00,
    period_cr       DECIMAL(15,2)   DEFAULT 0.00,
    closing_dr      DECIMAL(15,2)   GENERATED ALWAYS AS (opening_dr + period_dr) STORED,
    closing_cr      DECIMAL(15,2)   GENERATED ALWAYS AS (opening_cr + period_cr) STORED,
    last_updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_year (finance_id, ledger_id, financial_year),
    CONSTRAINT fk_alb_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alb_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 8: acc_financial_years
-- Purpose: Financial year periods per finance company
-- ============================================================
CREATE TABLE acc_financial_years (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    year_label      CHAR(9)         NOT NULL,
    start_date      DATE            NOT NULL,
    end_date        DATE            NOT NULL,
    is_current      TINYINT(1)      DEFAULT 0,
    is_locked       TINYINT(1)      DEFAULT 0,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_year_finance (finance_id, year_label),
    CONSTRAINT fk_afy_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 9: acc_cost_centres
-- Purpose: Per-vehicle profit tracking
-- ============================================================
CREATE TABLE acc_cost_centres (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    centre_code     VARCHAR(30)     NOT NULL,
    centre_name     VARCHAR(150)    NOT NULL,
    parent_id       INT             DEFAULT NULL,
    vehicle_id      INT             DEFAULT NULL,
    is_active       TINYINT(1)      DEFAULT 1,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_centre_code_finance (finance_id, centre_code),
    CONSTRAINT fk_acc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_acc_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_acc_parent FOREIGN KEY (parent_id) REFERENCES acc_cost_centres(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 10: acc_ledger_mailing
-- Purpose: Full postal address for ledgers
-- ============================================================
CREATE TABLE acc_ledger_mailing (
    id          INT          NOT NULL AUTO_INCREMENT,
    finance_id  INT          NOT NULL,
    ledger_id   INT          NOT NULL,
    addr_line1  VARCHAR(255) DEFAULT NULL,
    addr_line2  VARCHAR(255) DEFAULT NULL,
    city        VARCHAR(100) DEFAULT NULL,
    state       VARCHAR(100) DEFAULT NULL,
    country     VARCHAR(100) DEFAULT 'India',
    pin_code    VARCHAR(10)  DEFAULT NULL,
    created_by  VARCHAR(100) DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_mailing (ledger_id),
    CONSTRAINT fk_alm_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alm_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 11: acc_ledger_banking
-- Purpose: Multiple bank accounts per ledger (with primary flag)
-- ============================================================
CREATE TABLE acc_ledger_banking (
    id               INT          NOT NULL AUTO_INCREMENT,
    finance_id       INT          NOT NULL,
    ledger_id        INT          NOT NULL,
    bank_name        VARCHAR(150) DEFAULT NULL,
    account_number   VARCHAR(50)  DEFAULT NULL,
    ifsc_code        VARCHAR(11)  DEFAULT NULL,
    branch_name      VARCHAR(150) DEFAULT NULL,
    txn_type         ENUM('NEFT','RTGS','IMPS','UPI','Cheque','Cash') DEFAULT 'NEFT',
    acc_type         ENUM('Savings','Current','OD','CC','FD') DEFAULT 'Savings',
    upi_id           VARCHAR(100) DEFAULT NULL,
    is_primary       TINYINT(1)   DEFAULT 0,
    primary_sentinel TINYINT      GENERATED ALWAYS AS (IF(is_primary = 1, 1, NULL)) STORED,
    created_by       VARCHAR(100) DEFAULT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_account (finance_id, ledger_id, account_number),
    UNIQUE KEY uk_ledger_primary (ledger_id, primary_sentinel),
    CONSTRAINT fk_alb_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alb_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 12: acc_ledger_tax
-- Purpose: PAN, GSTIN, registration type for ledgers
-- ============================================================
CREATE TABLE acc_ledger_tax (
    id             INT          NOT NULL AUTO_INCREMENT,
    finance_id     INT          NOT NULL,
    ledger_id      INT          NOT NULL,
    pan_number     VARCHAR(10)  DEFAULT NULL,
    gstin          VARCHAR(15)  DEFAULT NULL,
    reg_type       ENUM('Unregistered','Regular','Composition','Consumer','Overseas') DEFAULT 'Unregistered',
    tds_applicable TINYINT(1)   DEFAULT 0,
    tcs_applicable TINYINT(1)   DEFAULT 0,
    created_by     VARCHAR(100) DEFAULT NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_tax (ledger_id),
    CONSTRAINT fk_alt_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alt_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 13: acc_ledger_billwise
-- Purpose: Credit limits and bill-wise tracking configuration
-- ============================================================
CREATE TABLE acc_ledger_billwise (
    id                   INT          NOT NULL AUTO_INCREMENT,
    finance_id           INT          NOT NULL,
    ledger_id            INT          NOT NULL,
    bill_wise            TINYINT(1)   DEFAULT 0,
    credit_limit         DECIMAL(15,2) DEFAULT NULL,
    credit_days          SMALLINT     DEFAULT NULL,
    check_credit_limit   TINYINT(1)   DEFAULT 0,
    separate_discount    TINYINT(1)   DEFAULT 0,
    created_by           VARCHAR(100) DEFAULT NULL,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_billwise (ledger_id),
    CONSTRAINT fk_albw_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albw_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 14: acc_ledger_tax_config
-- Purpose: GST rate configuration for tax ledgers
-- ============================================================
CREATE TABLE acc_ledger_tax_config (
    id                      INT          NOT NULL AUTO_INCREMENT,
    finance_id              INT          NOT NULL,
    ledger_id               INT          NOT NULL,
    gst_type                ENUM('CGST','SGST','IGST','UTGST','Cess') DEFAULT 'CGST',
    tax_percentage          DECIMAL(5,2) DEFAULT 0.00,
    default_tax_ledger_name VARCHAR(200) DEFAULT NULL,
    default_tax_ledger_id   INT          DEFAULT NULL,
    created_by              VARCHAR(100) DEFAULT NULL,
    created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_tax_config (ledger_id),
    CONSTRAINT fk_altc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_altc_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_altc_default_tax_ledger FOREIGN KEY (default_tax_ledger_id) REFERENCES acc_ledgers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 15: acc_ledger_loan_config
-- Purpose: Loan/EMI configuration linked to loans table
-- ============================================================
CREATE TABLE acc_ledger_loan_config (
    id            INT          NOT NULL AUTO_INCREMENT,
    finance_id    INT          NOT NULL,
    ledger_id     INT          NOT NULL,
    loan_id       INT          DEFAULT NULL,
    interest_pct  DECIMAL(5,2) DEFAULT NULL,
    penalty_pct   DECIMAL(5,2) DEFAULT NULL,
    emi_type      ENUM('EMI','Bullet','Daily','Weekly','Custom') DEFAULT 'EMI',
    created_by    VARCHAR(100) DEFAULT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_loan_config (ledger_id),
    CONSTRAINT fk_allc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_allc_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_allc_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 16: acc_bill_references
-- Purpose: Bill-wise outstanding tracking per party
-- ============================================================
CREATE TABLE acc_bill_references (
    id             INT          NOT NULL AUTO_INCREMENT,
    finance_id     INT          NOT NULL,
    ledger_id      INT          NOT NULL,
    voucher_id     INT          DEFAULT NULL,
    bill_number    VARCHAR(80)  NOT NULL,
    bill_date      DATE         NOT NULL,
    bill_amount    DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    pending_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    due_date       DATE         DEFAULT NULL,
    is_settled     TINYINT(1)   DEFAULT 0,
    settled_at     DATE         DEFAULT NULL,
    ref_type       ENUM('New Ref','Agst Ref','On Account','Advance') DEFAULT 'New Ref',
    narration      VARCHAR(500) DEFAULT NULL,
    created_by     VARCHAR(100) DEFAULT NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_bill_ledger_number (finance_id, ledger_id, bill_number),
    CONSTRAINT fk_abr_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_abr_ledger FOREIGN KEY (ledger_id) REFERENCES acc_ledgers(id) ON DELETE CASCADE,
    CONSTRAINT fk_abr_voucher FOREIGN KEY (voucher_id) REFERENCES acc_vouchers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 17: acc_audit_log
-- Purpose: Field-level change history for all accounting tables
-- ============================================================
CREATE TABLE acc_audit_log (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    finance_id  INT          NOT NULL,
    table_name  VARCHAR(60)  NOT NULL,
    record_id   VARCHAR(40)  NOT NULL,
    field_name  VARCHAR(80)  NOT NULL,
    old_value   TEXT         DEFAULT NULL,
    new_value   TEXT         DEFAULT NULL,
    action      ENUM('INSERT','UPDATE','DELETE') NOT NULL,
    changed_by  VARCHAR(100) NOT NULL,
    changed_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address  VARCHAR(45)  DEFAULT NULL,
    session_id  VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_aal_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TRIGGER: Enforce Debit = Credit for Posted Vouchers
-- ============================================================
DROP TRIGGER IF EXISTS trg_voucher_entry_balance_check;
DELIMITER $$
CREATE TRIGGER trg_voucher_entry_balance_check
AFTER INSERT ON acc_voucher_entries
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_total_dr DECIMAL(15,2);
    DECLARE v_total_cr DECIMAL(15,2);
    DECLARE v_diff DECIMAL(15,2);
    SELECT status INTO v_status FROM acc_vouchers WHERE id = NEW.voucher_id;
    IF v_status = 'Posted' THEN
        SELECT COALESCE(SUM(CASE WHEN entry_type = 'Dr' THEN amount ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN entry_type = 'Cr' THEN amount ELSE 0 END), 0)
        INTO v_total_dr, v_total_cr
        FROM acc_voucher_entries WHERE voucher_id = NEW.voucher_id;
        SET v_diff = ABS(v_total_dr - v_total_cr);
        IF v_diff > 0.01 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Voucher imbalance: sum of Debit entries must equal sum of Credit entries';
        END IF;
    END IF;
END$$
DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- END OF COMPLETE ACCOUNTING MODULE
-- Total: 17 tables + 1 trigger
-- ============================================================
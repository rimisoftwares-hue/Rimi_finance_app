-- ============================================================
--  RIMI FINANCE — COMPLETE ACCOUNTING MODULE
--  Final merged schema: final_account_structure + advanced_ledger
--  MySQL 8.4.x  |  utf8mb4_unicode_ci throughout
--  Generated: 2026-06-25
-- ============================================================
--  Tables:
--    1.  acc_group_master              - System-level group catalogue (global)
--    2.  acc_ledger_groups             - Company chart of accounts hierarchy
--    3.  acc_ledgers                   - Individual ledger accounts
--    4.  acc_voucher_types             - Transaction type definitions
--    5.  acc_voucher_groups            - Batch / session grouping
--    6.  acc_vouchers                  - Transaction headers
--    7.  acc_voucher_entries           - Double-entry DR/CR lines
--    8.  acc_ledger_balances           - Cached balances for reporting
--    9.  acc_financial_years           - Year period configuration
--   10.  acc_cost_centres              - Per-vehicle profit tracking
--   11.  acc_ledger_mailing            - Postal address + contact details
--   12.  acc_ledger_banking            - Multiple bank accounts per ledger
--   13.  acc_ledger_banking_txn_types  - Multi-select transaction types
--   14.  acc_ledger_txn_type_config    - Per-txn-type sub-dialog config
--   15.  acc_ledger_tax                - PAN / GSTIN / registration type
--   16.  acc_ledger_statutory          - MSME / e-Invoice / e-Way Bill
--   17.  acc_ledger_billwise           - Credit limits & bill-wise tracking
--   18.  acc_ledger_tax_config         - GST rate configuration
--   19.  acc_ledger_loan_config        - Loan / EMI configuration
--   20.  acc_ledger_bank_config        - Cheque book & reconciliation config
--   21.  acc_ledger_cheque_books       - Cheque book ranges
--   22.  acc_bill_references           - Bill-wise outstanding tracking
--   23.  acc_audit_log                 - Field-level change history
--
--  1 trigger: trg_voucher_entry_balance_check
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- TABLE 1: acc_group_master
-- Purpose: Global system-level group catalogue (shared across
--          all companies; never duplicated per finance_id)
-- ============================================================
CREATE TABLE acc_group_master (
    id                     INT           NOT NULL AUTO_INCREMENT,
    group_name             VARCHAR(150)  NOT NULL,
    parent_id              INT           DEFAULT NULL
        COMMENT 'NULL for root groups',
    nature                 ENUM('Assets','Liabilities','Income','Expenses')
                           NOT NULL,
    affects_gross_profit   TINYINT(1)    NOT NULL DEFAULT 0,
    behaves_like_subledger TINYINT(1)    NOT NULL DEFAULT 0,
    nett_balance_report    ENUM('Debit','Credit','Both')
                           NOT NULL DEFAULT 'Both',
    sequence_order         SMALLINT      NOT NULL DEFAULT 0,
    is_active              TINYINT(1)    NOT NULL DEFAULT 1,

    PRIMARY KEY (id),
    UNIQUE KEY uk_master_group_name (group_name),
    CONSTRAINT fk_agm_parent FOREIGN KEY (parent_id)
        REFERENCES acc_group_master(id) ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Global system-level group catalogue (TallyPrime predefined groups)';


-- ============================================================
-- TABLE 2: acc_ledger_groups
-- Purpose: Company chart of accounts hierarchy
-- ============================================================
CREATE TABLE acc_ledger_groups (
    id                       INT             NOT NULL AUTO_INCREMENT,
    finance_id               INT             NOT NULL,
    group_name               VARCHAR(150)    NOT NULL,
    alias                    VARCHAR(150)    DEFAULT NULL
        COMMENT 'Alternative name',
    alias_lang               JSON            DEFAULT NULL
        COMMENT 'Language-wise aliases e.g. {"ta":"முதலீடுகள்"}',
    system_parent_id         INT             DEFAULT NULL
        COMMENT 'FK → acc_group_master.id (parent is a system group)',
    custom_parent_id         INT             DEFAULT NULL
        COMMENT 'FK → acc_ledger_groups.id (parent is another custom group)',
    root_master_id           INT             DEFAULT NULL
        COMMENT 'Top-level acc_group_master ancestor for fast reporting',
    nature                   ENUM('Assets','Liabilities','Income','Expenses')
                             NOT NULL,
    affects_gross_profit     TINYINT(1)      NOT NULL DEFAULT 0,
    behaves_like_subledger   TINYINT(1)      NOT NULL DEFAULT 0,
    nett_balance_report      ENUM('Debit','Credit','Both')
                             NOT NULL DEFAULT 'Both',
    used_for_calculation     TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'For tax/discount calculation',
    allocation_method        ENUM('By Quantity','By Value','Not Applicable')
                             NOT NULL DEFAULT 'Not Applicable',
    is_active                TINYINT(1)      NOT NULL DEFAULT 1,
    created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_group_name_finance     (finance_id, group_name),
    KEY idx_finance_id                   (finance_id),
    KEY idx_nature                       (nature),
    KEY idx_is_active                    (is_active),
    KEY idx_finance_nature               (finance_id, nature),
    KEY idx_system_parent_id             (system_parent_id),
    KEY idx_custom_parent_id             (custom_parent_id),
    KEY idx_root_master_id               (root_master_id),
    CONSTRAINT fk_alg_finance       FOREIGN KEY (finance_id)
        REFERENCES finance_detail(id)      ON DELETE CASCADE,
    CONSTRAINT fk_alg_sys_parent    FOREIGN KEY (system_parent_id)
        REFERENCES acc_group_master(id)    ON DELETE RESTRICT,
    CONSTRAINT fk_alg_custom_parent FOREIGN KEY (custom_parent_id)
        REFERENCES acc_ledger_groups(id)   ON DELETE RESTRICT,
    CONSTRAINT fk_alg_root_master   FOREIGN KEY (root_master_id)
        REFERENCES acc_group_master(id)    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Chart of Accounts — company custom group hierarchy';


-- ============================================================
-- TABLE 3: acc_ledgers
-- Purpose: Individual ledger accounts (core identity +
--          accounting behaviour)
-- ============================================================
CREATE TABLE acc_ledgers (
    id                      INT             NOT NULL AUTO_INCREMENT,
    finance_id              INT             NOT NULL,

    -- ── Basic identity ────────────────────────────────────────
    ledger_name             VARCHAR(200)    NOT NULL
        COMMENT 'Primary display name (form: name)',
    alias                   VARCHAR(150)    DEFAULT NULL
        COMMENT 'Short alias (form: alias)',
    alias_regional          VARCHAR(150)    DEFAULT NULL
        COMMENT 'Alias in regional language (form: aliasRegional)',
    group_id                INT             DEFAULT NULL 
        COMMENT 'FK → acc_ledger_groups.id',
    master_group_id         INT             DEFAULT NULL    
        COMMENT 'FK → acc_group_master.id (direct system group reference)',
    reporting_under         VARCHAR(200)    DEFAULT NULL
        COMMENT 'Sub-group mapping label (form: reportingUnder)',
    inactive                TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'Inactive / Discontinued ledger? 1=Yes (form: inactive)',
   

    -- ── Opening balance ───────────────────────────────────────
    opening_balance         DECIMAL(15,2)   DEFAULT 0.00
        COMMENT 'Opening balance amount (form: openingBalance)',
    ob_type                 ENUM('Dr','Cr') NOT NULL DEFAULT 'Dr'
        COMMENT 'Dr / Cr indicator for opening balance (form: drCr)',
    effective_date          DATE            DEFAULT NULL
        COMMENT 'Effective date of opening balance (form: effectiveDate)',
    freeze_balance          TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'Freeze Opening Balance? 1=Yes (form: freezeBalance)',

    -- ── Inventory / accounting behaviour ─────────────────────
    inv_values_affected     TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'Inventory values are affected? (form: inventoryAffected)',
    type_of_ledger          ENUM('Not Applicable','Invoice Rounding','Discount')
                            NOT NULL DEFAULT 'Not Applicable'
        COMMENT 'TYPEOFLEDGER field (form: typeOfLedger)',
    rounding_method         ENUM('Not Applicable','Normal Rounding','Downward Rounding','Upward Rounding')
                            NOT NULL DEFAULT 'Not Applicable'
        COMMENT 'Rounding method (form: roundingMethod)',
    rounding_limit          DECIMAL(10,2)   DEFAULT NULL
        COMMENT 'Rounding limit value (form: roundingLimit)',
    appropriation_method    ENUM('Not Applicable','Appropriate by Value','Appropriate by Quantity')
                            NOT NULL DEFAULT 'Not Applicable'
        COMMENT 'APPROPRIATION — allocate in purchase invoice (form: allocationMethod)',
    method_to_allocate      TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'Toggle: Method to allocate when used in purchase invoice (form: methodToAllocate)',
    is_additional_cost      TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'ADDCOST — Additional cost in purchases (form: useAsAdditionalCost)',
    cost_centre_applicable  TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'Maintain Cost Centres? (form: maintainCostCenters)',
    cost_centre_allocation  TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'Cost Centre allocation for this ledger? (form: costCentreAllocation)',

    -- ── Duties & Taxes behaviour ──────────────────────────────
    ledger_flushing_method  ENUM('Default','Cash Basis','Accrual Basis')
                            NOT NULL DEFAULT 'Default'
        COMMENT 'Ledger Flushing Method (form: ledgerFlushingMethod)',
    include_in_buyer_ledger  TINYINT(1)     NOT NULL DEFAULT 0
        COMMENT 'Include in Buyer Ledger? (form: includeInBuyerLedger)',
    include_in_seller_ledger TINYINT(1)     NOT NULL DEFAULT 0
        COMMENT 'Include in Seller Ledger? (form: includeInSellerLedger)',

    -- ── Audit / system flags ──────────────────────────────────
    is_bank_account         TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT 'Quick flag: ledger belongs to Bank Accounts group',
    is_system               TINYINT(1)      NOT NULL DEFAULT 0
        COMMENT '1 = system-reserved ledger (Cash, P&L, etc.)',
    is_active               TINYINT(1)      NOT NULL DEFAULT 1,
    created_by              VARCHAR(100)    DEFAULT NULL,
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_name_finance    (finance_id, ledger_name),
    -- ❌ uk_ledger_code_finance REMOVED (since ledger_code column is gone)
    KEY idx_finance_id                   (finance_id),
    KEY idx_group_id                     (group_id),
    KEY idx_master_group_id              (master_group_id),    
    KEY idx_is_active                    (is_active),
    KEY idx_inactive                     (inactive),
    CONSTRAINT fk_al_finance  FOREIGN KEY (finance_id) REFERENCES finance_detail(id)    ON DELETE CASCADE,
    CONSTRAINT fk_al_group    FOREIGN KEY (group_id)   REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT,
    CONSTRAINT fk_al_master_group FOREIGN KEY (master_group_id) REFERENCES acc_group_master(id) ON DELETE RESTRICT, 
    CONSTRAINT chk_ledger_under_exclusivity CHECK (
    (group_id IS NOT NULL AND master_group_id IS NULL)
    OR
    (group_id IS NULL AND master_group_id IS NOT NULL) 

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Individual ledger accounts — core identity + accounting behaviour';

-- ============================================================
-- TABLE 4: acc_voucher_types
-- Purpose: Defines class of transaction (Receipt, Payment, etc.)
-- ============================================================
CREATE TABLE acc_voucher_types (
    id              INT             NOT NULL AUTO_INCREMENT,
    finance_id      INT             NOT NULL,
    type_code       VARCHAR(30)     NOT NULL,
    type_name       VARCHAR(100)    NOT NULL,
    class           ENUM('Receipt','Payment','Contra','Journal','Sales',
                         'Purchase','Debit Note','Credit Note',
                         'LoanDisbursement','LoanRepayment',
                         'VehicleExpense')   NOT NULL,
    prefix          VARCHAR(20)     DEFAULT NULL,
    numbering_mode  ENUM('Auto','Manual')    DEFAULT 'Auto',
    last_number     INT             DEFAULT 0,
    affects_stock   TINYINT(1)      DEFAULT 0,
    is_system       TINYINT(1)      DEFAULT 0,
    is_active       TINYINT(1)      DEFAULT 1,
    notes           VARCHAR(255)    DEFAULT NULL,
    created_by      VARCHAR(100)    DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_type_code_finance (finance_id, type_code),
    CONSTRAINT fk_avt_finance FOREIGN KEY (finance_id)
        REFERENCES finance_detail(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Voucher type definitions (Receipt, Payment, Journal, etc.)';


-- ============================================================
-- TABLE 5: acc_voucher_groups
-- Purpose: Batch / session grouping for vouchers
-- ============================================================
CREATE TABLE acc_voucher_groups (
    id          INT          NOT NULL AUTO_INCREMENT,
    finance_id  INT          NOT NULL,
    group_name  VARCHAR(150) NOT NULL,
    group_date  DATE         NOT NULL,
    description VARCHAR(500) DEFAULT NULL,
    status      ENUM('Open','Closed','Cancelled') DEFAULT 'Open',
    created_by  VARCHAR(100) DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_avg_finance FOREIGN KEY (finance_id)
        REFERENCES finance_detail(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Batch / session grouping for vouchers';


-- ============================================================
-- TABLE 6: acc_vouchers
-- Purpose: Transaction header (one row per transaction)
-- ============================================================
CREATE TABLE acc_vouchers (
    id                   INT             NOT NULL AUTO_INCREMENT,
    finance_id           INT             NOT NULL,
    voucher_number       VARCHAR(50)     NOT NULL,
    voucher_type_id      INT             NOT NULL,
    voucher_group_id     INT             DEFAULT NULL,
    voucher_date         DATE            NOT NULL,
    financial_year       CHAR(9)         NOT NULL
        COMMENT 'e.g. 2024-2025',
    narration            TEXT            DEFAULT NULL,
    total_amount         DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    customer_id          INT             DEFAULT NULL,
    vehicle_id           INT             DEFAULT NULL,
    loan_id              INT             DEFAULT NULL,
    payment_id           INT             DEFAULT NULL,
    vehicle_expense_id   INT             DEFAULT NULL,
    payment_mode         ENUM('Cash','Bank','UPI','Cheque','Online',
                              'NEFT','RTGS','Other')  DEFAULT NULL,
    cheque_number        VARCHAR(30)     DEFAULT NULL,
    cheque_date          DATE            DEFAULT NULL,
    bank_ref             VARCHAR(100)    DEFAULT NULL,
    status               ENUM('Draft','Posted','Cancelled') DEFAULT 'Draft',
    is_reconciled        TINYINT(1)      DEFAULT 0,
    reconciled_at        DATETIME        DEFAULT NULL,
    reconciled_by        VARCHAR(100)    DEFAULT NULL,
    gst_applicable       TINYINT(1)      DEFAULT 0,
    gst_number           VARCHAR(50)     DEFAULT NULL,
    cancelled_by         VARCHAR(100)    DEFAULT NULL,
    cancelled_at         DATETIME        DEFAULT NULL,
    cancel_reason        VARCHAR(500)    DEFAULT NULL,
    -- Multi-currency support
    currency_code        CHAR(3)         NOT NULL DEFAULT 'INR',
    exchange_rate        DECIMAL(18,6)   NOT NULL DEFAULT 1.000000,
    base_amount          DECIMAL(15,2)   GENERATED ALWAYS AS
                         (ROUND(total_amount * exchange_rate, 2)) STORED,
    created_by           VARCHAR(100)    DEFAULT NULL,
    updated_by           VARCHAR(100)    DEFAULT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_voucher_number_finance (finance_id, voucher_number),
    CONSTRAINT fk_av_finance         FOREIGN KEY (finance_id)         REFERENCES finance_detail(id)       ON DELETE CASCADE,
    CONSTRAINT fk_av_type            FOREIGN KEY (voucher_type_id)    REFERENCES acc_voucher_types(id)    ON DELETE RESTRICT,
    CONSTRAINT fk_av_group           FOREIGN KEY (voucher_group_id)   REFERENCES acc_voucher_groups(id)   ON DELETE SET NULL,
    CONSTRAINT fk_av_customer        FOREIGN KEY (customer_id)        REFERENCES customers(id)            ON DELETE SET NULL,
    CONSTRAINT fk_av_vehicle         FOREIGN KEY (vehicle_id)         REFERENCES vehicle_detail(id)       ON DELETE SET NULL,
    CONSTRAINT fk_av_loan            FOREIGN KEY (loan_id)            REFERENCES loans(id)                ON DELETE SET NULL,
    CONSTRAINT fk_av_payment         FOREIGN KEY (payment_id)         REFERENCES payments(id)             ON DELETE SET NULL,
    CONSTRAINT fk_av_vehicle_expense FOREIGN KEY (vehicle_expense_id) REFERENCES vehicle_expenses(id)     ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Transaction headers — one row per transaction';


-- ============================================================
-- TABLE 7: acc_voucher_entries
-- Purpose: Double-entry debit / credit lines for each voucher
-- ============================================================
CREATE TABLE acc_voucher_entries (
    id          INT             NOT NULL AUTO_INCREMENT,
    finance_id  INT             NOT NULL,
    voucher_id  INT             NOT NULL,
    ledger_id   INT             NOT NULL,
    entry_type  ENUM('Dr','Cr') NOT NULL,
    amount      DECIMAL(15,2)   NOT NULL,
    narration   VARCHAR(500)    DEFAULT NULL,
    tax_type    ENUM('None','CGST','SGST','IGST','TDS','TCS') DEFAULT 'None',
    tax_rate    DECIMAL(5,2)    DEFAULT 0.00,
    tax_amount  DECIMAL(15,2)   DEFAULT 0.00,
    sort_order  SMALLINT        DEFAULT 0,
    created_by  VARCHAR(100)    DEFAULT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_finance_id (finance_id),
    KEY idx_voucher_id (voucher_id),
    KEY idx_ledger_id  (ledger_id),
    KEY idx_entry_type (entry_type),
    CONSTRAINT fk_ave_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id)  ON DELETE CASCADE,
    CONSTRAINT fk_ave_voucher FOREIGN KEY (voucher_id) REFERENCES acc_vouchers(id)    ON DELETE CASCADE,
    CONSTRAINT fk_ave_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)     ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Double-entry DR/CR lines for each voucher';


-- ============================================================
-- TABLE 8: acc_ledger_balances
-- Purpose: Pre-aggregated ledger balances for fast reporting
-- ============================================================
CREATE TABLE acc_ledger_balances (
    id              INT           NOT NULL AUTO_INCREMENT,
    finance_id      INT           NOT NULL,
    ledger_id       INT           NOT NULL,
    financial_year  CHAR(9)       NOT NULL  COMMENT 'e.g. 2024-2025',
    opening_dr      DECIMAL(15,2) DEFAULT 0.00,
    opening_cr      DECIMAL(15,2) DEFAULT 0.00,
    period_dr       DECIMAL(15,2) DEFAULT 0.00,
    period_cr       DECIMAL(15,2) DEFAULT 0.00,
    closing_dr      DECIMAL(15,2) GENERATED ALWAYS AS (opening_dr + period_dr) STORED,
    closing_cr      DECIMAL(15,2) GENERATED ALWAYS AS (opening_cr + period_cr) STORED,
    last_updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_year   (finance_id, ledger_id, financial_year),
    KEY idx_finance_id          (finance_id),
    KEY idx_ledger_id           (ledger_id),
    KEY idx_financial_year      (financial_year),
    CONSTRAINT fk_albal_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albal_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Pre-aggregated ledger balances for fast reporting';


-- ============================================================
-- TABLE 9: acc_financial_years
-- Purpose: Financial year periods per finance company
-- ============================================================
CREATE TABLE acc_financial_years (
    id          INT          NOT NULL AUTO_INCREMENT,
    finance_id  INT          NOT NULL,
    year_label  CHAR(9)      NOT NULL  COMMENT 'e.g. 2024-2025',
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    is_current  TINYINT(1)   DEFAULT 0,
    is_locked   TINYINT(1)   DEFAULT 0,
    created_by  VARCHAR(100) DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_year_finance (finance_id, year_label),
    CONSTRAINT fk_afy_finance FOREIGN KEY (finance_id)
        REFERENCES finance_detail(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Financial year periods per finance company';


-- ============================================================
-- TABLE 10: acc_cost_centres
-- Purpose: Per-vehicle profit tracking
-- ============================================================
CREATE TABLE acc_cost_centres (
    id          INT          NOT NULL AUTO_INCREMENT,
    finance_id  INT          NOT NULL,
    centre_code VARCHAR(30)  NOT NULL,
    centre_name VARCHAR(150) NOT NULL,
    parent_id   INT          DEFAULT NULL,
    vehicle_id  INT          DEFAULT NULL,
    is_active   TINYINT(1)   DEFAULT 1,
    created_by  VARCHAR(100) DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_centre_code_finance (finance_id, centre_code),
    CONSTRAINT fk_acc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id)    ON DELETE CASCADE,
    CONSTRAINT fk_acc_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id)    ON DELETE SET NULL,
    CONSTRAINT fk_acc_parent  FOREIGN KEY (parent_id)  REFERENCES acc_cost_centres(id)  ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Per-vehicle profit tracking (cost centres)';


-- ============================================================
-- TABLE 11: acc_ledger_mailing
-- Purpose: Full postal address and contact details per ledger
-- ============================================================
CREATE TABLE acc_ledger_mailing (
    id               INT           NOT NULL AUTO_INCREMENT,
    finance_id       INT           NOT NULL,
    ledger_id        INT           NOT NULL,

    -- ── Mailing name & address ────────────────────────────────
    mailing_name     VARCHAR(200)  DEFAULT NULL
        COMMENT 'Separate mailing name (form: mailingName)',
    addr_line1       VARCHAR(255)  DEFAULT NULL   COMMENT 'form: addr1',
    addr_line2       VARCHAR(255)  DEFAULT NULL   COMMENT 'form: addr2',
    addr_line3       VARCHAR(255)  DEFAULT NULL   COMMENT 'form: addr3',
    addr_line4       VARCHAR(255)  DEFAULT NULL   COMMENT 'form: addr4',
    city             VARCHAR(100)  DEFAULT NULL   COMMENT 'form: city',
    district         VARCHAR(100)  DEFAULT NULL   COMMENT 'form: district',
    state            VARCHAR(100)  DEFAULT NULL   COMMENT 'form: state',
    country          VARCHAR(100)  DEFAULT 'India' COMMENT 'form: country',
    pin_code         VARCHAR(10)   DEFAULT NULL   COMMENT 'form: pincode',

    -- ── Section-level visibility toggle ──────────────────────
    show_mailing_details TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'Show Mailing Details section? 1=Yes (form: showMailingDetails)',

    -- ── Contact details ───────────────────────────────────────
    provide_contact  TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'Provide Contact Details? 1=Yes (form: provideContactDetails)',
    contact_person   VARCHAR(150)  DEFAULT NULL   COMMENT 'form: contactPerson',
    telephone        VARCHAR(30)   DEFAULT NULL   COMMENT 'form: telephone',
    mobile           VARCHAR(20)   DEFAULT NULL   COMMENT 'form: mobile',
    primary_mobile   VARCHAR(20)   DEFAULT NULL
        COMMENT 'Primary mobile (form: primaryMobile)',
    fax              VARCHAR(30)   DEFAULT NULL   COMMENT 'form: fax',
    email            VARCHAR(150)  DEFAULT NULL   COMMENT 'form: email',
    email_cc         VARCHAR(150)  DEFAULT NULL   COMMENT 'form: emailCC',
    website          VARCHAR(200)  DEFAULT NULL   COMMENT 'form: website',

    created_by       VARCHAR(100)  DEFAULT NULL,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_mailing (ledger_id),
    KEY idx_finance_id           (finance_id),
    KEY idx_city                 (city),
    KEY idx_state                (state),
    CONSTRAINT fk_alm_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alm_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Postal address and contact details per ledger (Tally MAILING block)';


-- ============================================================
-- TABLE 12: acc_ledger_banking
-- Purpose: Party bank account details — one row per bank account;
--          a ledger may have multiple accounts (Tally BANKING block)
-- ============================================================
CREATE TABLE acc_ledger_banking (
    id                    INT           NOT NULL AUTO_INCREMENT,
    finance_id            INT           NOT NULL,
    ledger_id             INT           NOT NULL,

    provide_bank_details  TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'Provide bank details? top-level toggle (form: provideBankDetails)',
    account_holder_name   VARCHAR(200)  DEFAULT NULL
        COMMENT 'Defaults to ledger name but independently editable (form: accountHolderName)',
    bank_name             VARCHAR(150)  DEFAULT NULL   COMMENT 'form: bankName',
    account_number        VARCHAR(50)   DEFAULT NULL   COMMENT 'form: accountNumber',
    ifsc_code             VARCHAR(11)   DEFAULT NULL   COMMENT 'form: ifsc',
    swift_code            VARCHAR(11)   DEFAULT NULL   COMMENT 'SWIFT/BIC (form: swift)',
    branch_name           VARCHAR(150)  DEFAULT NULL   COMMENT 'form: branch',
    acc_type              ENUM('Savings','Current','Cash Credit','Overdraft','Loan A/c')
                          NOT NULL DEFAULT 'Current'
        COMMENT 'Account Type (form: accountType)',
    upi_id                VARCHAR(100)  DEFAULT NULL
        COMMENT 'UPI VPA',
    is_primary            TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT '1 = primary bank account for this ledger',
    primary_sentinel      TINYINT       GENERATED ALWAYS AS
                          (IF(is_primary = 1, 1, NULL)) STORED
        COMMENT 'Enforces single primary account per ledger via unique index',

    created_by            VARCHAR(100)  DEFAULT NULL,
    created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_account  (finance_id, ledger_id, account_number),
    UNIQUE KEY uk_ledger_primary  (ledger_id, primary_sentinel),
    KEY idx_finance_id            (finance_id),
    KEY idx_ledger_id             (ledger_id),
    KEY idx_is_primary            (is_primary),
    CONSTRAINT fk_alb_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alb_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Party bank account details per ledger (Tally BANKING block)';


-- ============================================================
-- TABLE 13: acc_ledger_banking_txn_types
-- Purpose: Multi-select transaction types per bank account
-- ============================================================
CREATE TABLE acc_ledger_banking_txn_types (
    id                  INT           NOT NULL AUTO_INCREMENT,
    finance_id          INT           NOT NULL,
    ledger_banking_id   INT           NOT NULL
        COMMENT 'FK → acc_ledger_banking.id',
    txn_type            ENUM(
                            'ATM','Card','Cheque','ECS',
                            'e-Fund Transfer','Electronic Cheque',
                            'Electronic DD/PO','Others'
                        ) NOT NULL
        COMMENT 'One row per enabled transaction type (form: bankTransactionTypes[])',
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_banking_txn_type    (ledger_banking_id, txn_type),
    KEY idx_finance_id                (finance_id),
    KEY idx_ledger_banking_id         (ledger_banking_id),
    CONSTRAINT fk_albtt_finance  FOREIGN KEY (finance_id)        REFERENCES finance_detail(id)      ON DELETE CASCADE,
    CONSTRAINT fk_albtt_banking  FOREIGN KEY (ledger_banking_id) REFERENCES acc_ledger_banking(id)  ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Multi-select transaction types per bank account';


-- ============================================================
-- TABLE 14: acc_ledger_txn_type_config
-- Purpose: Per-transaction-type sub-dialog configuration
--          (ATM / Card / Cheque / ECS / e-Fund Transfer /
--           Electronic Cheque / Electronic DD/PO / Others)
-- ============================================================
CREATE TABLE acc_ledger_txn_type_config (
    id                  INT           NOT NULL AUTO_INCREMENT,
    finance_id          INT           NOT NULL,
    txn_type_id         INT           NOT NULL
        COMMENT 'FK → acc_ledger_banking_txn_types.id',
    txn_type            ENUM(
                            'ATM','Card','Cheque','ECS',
                            'e-Fund Transfer','Electronic Cheque',
                            'Electronic DD/PO','Others'
                        ) NOT NULL
        COMMENT 'Denormalised for easy querying',

    -- ── ATM ───────────────────────────────────────────────────
    atm_id              VARCHAR(100)  DEFAULT NULL COMMENT 'ATM Identifier (form: atmId)',
    -- ── Card ──────────────────────────────────────────────────
    card_type           VARCHAR(50)   DEFAULT NULL COMMENT 'Credit/Debit (form: cardType)',
    card_number         VARCHAR(20)   DEFAULT NULL COMMENT 'Masked card number (form: cardNumber)',
    auth_required       TINYINT(1)    DEFAULT NULL COMMENT 'Authorization Required? (form: authRequired)',
    -- ── Cheque / Electronic Cheque ────────────────────────────
    cheque_no           VARCHAR(20)   DEFAULT NULL COMMENT 'Cheque/e-Cheque number (form: chequeNo)',
    printing_enabled    TINYINT(1)    DEFAULT NULL COMMENT 'Cheque Printing Enabled? (form: printing)',
    range_from          INT           DEFAULT NULL COMMENT 'Cheque range start (form: rangeFrom)',
    range_to            INT           DEFAULT NULL COMMENT 'Cheque range end (form: rangeTo)',
    -- ── ECS ───────────────────────────────────────────────────
    mandate_no          VARCHAR(50)   DEFAULT NULL COMMENT 'ECS Mandate Number (form: mandateNo)',
    ref_no              VARCHAR(100)  DEFAULT NULL COMMENT 'ECS Reference Number (form: refNo)',
    -- ── e-Fund Transfer ───────────────────────────────────────
    eft_account_number  VARCHAR(50)   DEFAULT NULL COMMENT 'e-Fund Transfer account number (form: accountNumber)',
    eft_ifsc            VARCHAR(11)   DEFAULT NULL COMMENT 'IFSC for e-Fund Transfer (form: ifsc)',
    ref_format          VARCHAR(100)  DEFAULT NULL COMMENT 'Reference format e.g. NEFT/{date}/{seq} (form: refFormat)',
    txn_identifier      VARCHAR(100)  DEFAULT NULL COMMENT 'Transaction identifier (form: txnIdentifier)',
    -- ── Electronic DD/PO ──────────────────────────────────────
    instrument_no       VARCHAR(50)   DEFAULT NULL COMMENT 'DD/PO instrument number (form: instrumentNo)',
    issue_date          DATE          DEFAULT NULL COMMENT 'DD/PO issue date (form: issueDate)',
    -- ── Shared across multiple types ──────────────────────────
    bank_name           VARCHAR(150)  DEFAULT NULL COMMENT 'Bank Name (shared across types)',
    branch              VARCHAR(150)  DEFAULT NULL COMMENT 'Branch (Cheque, eFund, ElecCheque, DDPO)',
    narration           VARCHAR(500)  DEFAULT NULL COMMENT 'Default narration (ATM, eFund, Others)',
    -- ── Others ────────────────────────────────────────────────
    description         VARCHAR(500)  DEFAULT NULL COMMENT 'Others dialog: description',
    reference           VARCHAR(200)  DEFAULT NULL COMMENT 'Others dialog: reference',
    remarks             VARCHAR(500)  DEFAULT NULL COMMENT 'Others dialog: remarks',

    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_txn_type_config (txn_type_id),
    KEY idx_finance_id            (finance_id),
    KEY idx_txn_type_id           (txn_type_id),
    CONSTRAINT fk_alttc_finance   FOREIGN KEY (finance_id)  REFERENCES finance_detail(id)               ON DELETE CASCADE,
    CONSTRAINT fk_alttc_txn_type  FOREIGN KEY (txn_type_id) REFERENCES acc_ledger_banking_txn_types(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Per-txn-type sub-dialog config (ATM/Card/Cheque/ECS/eFund/DDPO/Others)';


-- ============================================================
-- TABLE 15: acc_ledger_tax
-- Purpose: PAN, GSTIN, registration type, TDS/TCS settings
-- ============================================================
CREATE TABLE acc_ledger_tax (
    id               INT           NOT NULL AUTO_INCREMENT,
    finance_id       INT           NOT NULL,
    ledger_id        INT           NOT NULL,

    -- ── GST registration ──────────────────────────────────────
    pan_number       VARCHAR(10)   DEFAULT NULL   COMMENT 'PAN / IT Number (form: panIt)',
    gstin            VARCHAR(15)   DEFAULT NULL   COMMENT 'GSTIN / UIN (form: gstin)',
    reg_type         ENUM(
        'Regular','Composition','Unregistered','Consumer',
        'Overseas','SEZ Unit','SEZ Developer','Deemed Export',
        'Tax Deductor','Tax Collector (E-Commerce)',
        'Input Service Distributor','UIN Holder'
    ) NOT NULL DEFAULT 'Unregistered'
        COMMENT 'GST Registration Type (form: registrationType)',
    assessee_other_territory TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Assessee of Other Territory? (form: assesseeOtherTerritory)',
    territory        VARCHAR(150)  DEFAULT NULL
        COMMENT 'Territory name when assessee_other_territory=1 (form: territory)',

    -- ── Tax Deductor extras ────────────────────────────────────
    tan_number       VARCHAR(10)   DEFAULT NULL
        COMMENT 'TAN Number — shown when reg_type=Tax Deductor (form: tanNumber)',
    deductor_category VARCHAR(100) DEFAULT NULL
        COMMENT 'Deductor Category (form: deductorCategory)',

    -- ── Tax Collector (E-Commerce) extras ─────────────────────
    collection_account_no VARCHAR(20) DEFAULT NULL
        COMMENT 'Tax Collection Account No. (form: collectionAccountNo)',

    -- ── TDS / TCS for party ledgers ───────────────────────────
    tax_type         ENUM('None','TDS','TCS') NOT NULL DEFAULT 'None'
        COMMENT 'Tax Type — shown for Sundry party ledgers (form: taxType)',
    deductee_type    ENUM('Individual','HUF','Firm','Company','Trust','Government','AOP')
                     DEFAULT NULL
        COMMENT 'Deductee Type — when tax_type=TDS (form: deducteeType)',
    buyer_type       ENUM('Individual','Company','Government','Exporter','SEZ')
                     DEFAULT NULL
        COMMENT 'Buyer Type — when tax_type=TCS (form: buyerType)',

    -- ── System flags ──────────────────────────────────────────
    tds_applicable   TINYINT(1)    NOT NULL DEFAULT 0,
    tcs_applicable   TINYINT(1)    NOT NULL DEFAULT 0,

    created_by       VARCHAR(100)  DEFAULT NULL,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_tax  (ledger_id),
    KEY idx_finance_id        (finance_id),
    KEY idx_gstin             (gstin),
    KEY idx_pan_number        (pan_number),
    KEY idx_reg_type          (reg_type),
    KEY idx_tax_type          (tax_type),
    CONSTRAINT fk_alt_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alt_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='PAN, GSTIN, registration type, TDS/TCS party settings per ledger';


-- ============================================================
-- TABLE 16: acc_ledger_statutory
-- Purpose: MSME, e-Invoice, e-Way Bill settings for party ledgers
-- ============================================================
CREATE TABLE acc_ledger_statutory (
    id                      INT           NOT NULL AUTO_INCREMENT,
    finance_id              INT           NOT NULL,
    ledger_id               INT           NOT NULL,

    -- ── MSME ──────────────────────────────────────────────────
    msme_registered         TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'MSME Registered? (form: msmeRegistered)',
    udyam_number            VARCHAR(19)   DEFAULT NULL
        COMMENT 'Udyam Registration Number e.g. UDYAM-TN-01-0000001 (form: udyamNumber)',

    -- ── e-Invoice ─────────────────────────────────────────────
    einvoice_applicable     TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'e-Invoice Applicable? (form: einvoiceApplicable)',
    default_supply_type     ENUM('B2B','SEZ','Export','Deemed Export')
                            NOT NULL DEFAULT 'B2B'
        COMMENT 'Default Supply Type (form: defaultSupplyType)',

    -- ── e-Way Bill ────────────────────────────────────────────
    eway_bill_applicable    TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'e-Way Bill Applicable? (form: ewayBillApplicable)',
    default_transport_mode  ENUM('Road','Rail','Air','Ship')
                            NOT NULL DEFAULT 'Road'
        COMMENT 'Default Transport Mode (form: defaultTransportMode)',
    default_distance_km     DECIMAL(8,2)  DEFAULT NULL
        COMMENT 'Default Distance in km (form: defaultDistance)',

    created_by              VARCHAR(100)  DEFAULT NULL,
    created_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_statutory (ledger_id),
    KEY idx_finance_id             (finance_id),
    CONSTRAINT fk_als_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_als_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='MSME, e-Invoice, e-Way Bill settings for party ledgers';


-- ============================================================
-- TABLE 17: acc_ledger_billwise
-- Purpose: Credit limits and bill-wise tracking configuration
-- ============================================================
CREATE TABLE acc_ledger_billwise (
    id                   INT           NOT NULL AUTO_INCREMENT,
    finance_id           INT           NOT NULL,
    ledger_id            INT           NOT NULL,
    bill_wise            TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'Maintain balances bill-by-bill? (form: maintainBillWise)',
    credit_days          SMALLINT      DEFAULT 30
        COMMENT 'Default credit period in days (form: defaultCreditPeriod)',
    check_credit_days    TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'Check for credit days during voucher entry? (form: checkCreditDaysDuringEntry)',

    created_by           VARCHAR(100)  DEFAULT NULL,
    created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_credit_days CHECK (credit_days >= 0),

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_billwise (ledger_id),
    KEY idx_finance_id            (finance_id),
    KEY idx_bill_wise             (bill_wise),
    CONSTRAINT fk_albw_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albw_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Credit limits and bill-wise tracking configuration';


-- ============================================================
-- TABLE 18: acc_ledger_tax_config
-- Purpose: GST rate configuration and statutory details per ledger
-- ============================================================
CREATE TABLE acc_ledger_tax_config (
    id                      INT           NOT NULL AUTO_INCREMENT,
    finance_id              INT           NOT NULL,
    ledger_id               INT           NOT NULL,

    -- ── Top-level GST applicability ───────────────────────────
    gst_applicable          ENUM('Applicable','Not Applicable','Undefined')
                            NOT NULL DEFAULT 'Undefined'
        COMMENT 'Is GST Applicable? (form: isGstApplicable)',
    set_alter_gst_details   TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'Set/Alter GST Details? (form: setAlterGst)',

    -- ── GST rate details ──────────────────────────────────────
    gst_description         VARCHAR(200)  DEFAULT NULL   COMMENT 'form: gstDescription',
    applicable_from         DATE          DEFAULT NULL   COMMENT 'form: gstApplicableFrom',
    hsn_sac_code            VARCHAR(20)   DEFAULT NULL   COMMENT 'form: gstHsnSacCode',
    hsn_sac_details         ENUM('As per Company','As per Stock Group','Specify Details Here')
                            NOT NULL DEFAULT 'As per Company'
        COMMENT 'form: hsnSacDetailsMode',
    source_of_details       ENUM('As per Company','As per Stock Group','As per Stock Item','Specify Details Here')
                            NOT NULL DEFAULT 'As per Company'
        COMMENT 'form: hsnSacSourceMode',
    hsn_description         VARCHAR(500)  DEFAULT NULL
        COMMENT 'HSN/SAC description (form: hsnDescription)',
    type_of_supply          ENUM('Goods','Services') DEFAULT NULL
        COMMENT 'form: gstTypeOfSupply',
    taxability              ENUM('Taxable','Exempt','Nil Rated') DEFAULT NULL
        COMMENT 'form: gstTaxability',

    -- ── Tax rates ─────────────────────────────────────────────
    igst_rate               DECIMAL(5,2)  NOT NULL DEFAULT 0.00  COMMENT 'form: gstIgstRate',
    cgst_rate               DECIMAL(5,2)  NOT NULL DEFAULT 0.00  COMMENT 'form: gstCgstRate',
    sgst_rate               DECIMAL(5,2)  NOT NULL DEFAULT 0.00  COMMENT 'form: gstSgstRate',
    cess_rate               DECIMAL(5,2)  NOT NULL DEFAULT 0.00  COMMENT 'form: gstCessRate',
    cess_type               ENUM('Valorem','Quantum') NOT NULL DEFAULT 'Valorem'
        COMMENT 'Valorem=% of value, Quantum=fixed per unit (form: gstCessType)',
    cess_per_unit           DECIMAL(10,4) DEFAULT NULL
        COMMENT 'Cess per unit — only when cess_type=Quantum (form: cessPerUnit)',
    cess_unit               VARCHAR(50)   DEFAULT NULL
        COMMENT 'Unit for quantum cess e.g. Litre, Kg (form: cessUnit)',
    reverse_charge          TINYINT(1)    NOT NULL DEFAULT 0   COMMENT 'form: gstReverseCharge',
    include_in_assessable   TINYINT(1)    NOT NULL DEFAULT 0   COMMENT 'form: includeInAssessable',
    appropriate_to          ENUM('Goods','Services','Both') DEFAULT NULL
        COMMENT 'form: appropriateTo',
    method_of_appropriation ENUM('Based on Value','Based on Quantity') DEFAULT NULL
        COMMENT 'form: methodOfAppropriation',

    -- ── GST lifecycle ─────────────────────────────────────────
    gst_status              ENUM('Active','Cancelled','Suspended') NOT NULL DEFAULT 'Active'
        COMMENT 'GST Registration Status (form: gstStatus)',
    cancelled_date          DATE          DEFAULT NULL
        COMMENT 'Cancellation date (form: cancelledDate)',

    -- ── Loans & Advances group specific ──────────────────────
    nature_of_transaction   VARCHAR(150)  DEFAULT NULL
        COMMENT 'Nature of Transaction (form: natureOfTransaction)',
    hsn_igst_rate           DECIMAL(5,2)  DEFAULT NULL
        COMMENT 'IGST Rate in HSN section (form: hsnIgstRate)',

    -- ── Duties & Taxes group specific ─────────────────────────
    duty_tax_type           ENUM('GST','TCS','TDS','Others') DEFAULT NULL
        COMMENT 'Type of Duty/Tax (form: typeOfDutyTax)',
    duty_tax_sub_type       VARCHAR(150)  DEFAULT NULL
        COMMENT 'Specific tax type within duty_tax_type (form: dutyTaxType)',
    duty_percentage         DECIMAL(5,2)  DEFAULT NULL
        COMMENT 'Percentage of Calculation (form: dutyPercentage)',
    calc_based_on           ENUM('On Total Sales','On Current Subtotal','On Item Rate','On TDS/TCS Assessable Value')
                            NOT NULL DEFAULT 'On Total Sales'
        COMMENT 'form: dutyBasedOn',
    used_in_vat_returns     TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'Used in VAT Returns? (form: usedInVatReturns)',
    method_of_calculation_duty ENUM('On Total Sales','On Net Sales','On Assessable Value')
                            NOT NULL DEFAULT 'On Total Sales'
        COMMENT 'Method of Calculation for duty (form: methodOfCalculationDuty)',

    -- ── Legacy / system fields ────────────────────────────────
    gst_type                ENUM('CGST','SGST','IGST','UTGST','Cess') DEFAULT 'CGST',
    tax_percentage          DECIMAL(5,2)  DEFAULT 0.00,
    default_tax_ledger_id   INT           DEFAULT NULL,

    created_by              VARCHAR(100)  DEFAULT NULL,
    created_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_tax_config (ledger_id),
    KEY idx_finance_id              (finance_id),
    KEY idx_gst_applicable          (gst_applicable),
    KEY idx_hsn_sac_code            (hsn_sac_code),
    KEY idx_duty_tax_type           (duty_tax_type),
    CONSTRAINT fk_altc_finance            FOREIGN KEY (finance_id)            REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_altc_ledger             FOREIGN KEY (ledger_id)             REFERENCES acc_ledgers(id)   ON DELETE CASCADE,
    CONSTRAINT fk_altc_default_tax_ledger FOREIGN KEY (default_tax_ledger_id) REFERENCES acc_ledgers(id)   ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='GST rate configuration and statutory details per ledger';


-- ============================================================
-- TABLE 19: acc_ledger_loan_config
-- Purpose: Loan / EMI configuration linked to loans table
-- ============================================================
CREATE TABLE acc_ledger_loan_config (
    id            INT           NOT NULL AUTO_INCREMENT,
    finance_id    INT           NOT NULL,
    ledger_id     INT           NOT NULL,
    loan_id       INT           DEFAULT NULL,
    interest_pct  DECIMAL(5,2)  DEFAULT NULL,
    penalty_pct   DECIMAL(5,2)  DEFAULT NULL,
    emi_type      ENUM('EMI','Bullet','Daily','Weekly','Custom') DEFAULT 'EMI',
    created_by    VARCHAR(100)  DEFAULT NULL,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_loan_config (ledger_id),
    KEY idx_finance_id               (finance_id),
    KEY idx_loan_id                  (loan_id),
    CONSTRAINT fk_allc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_allc_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE,
    CONSTRAINT fk_allc_loan    FOREIGN KEY (loan_id)    REFERENCES loans(id)          ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Loan / EMI configuration linked to loans table';


-- ============================================================
-- TABLE 20: acc_ledger_bank_config
-- Purpose: Bank Accounts group — cheque book and reconciliation
--          configuration (Tally BANKCONFIG)
-- ============================================================
CREATE TABLE acc_ledger_bank_config (
    id                       INT           NOT NULL AUTO_INCREMENT,
    finance_id               INT           NOT NULL,
    ledger_id                INT           NOT NULL
        COMMENT 'FK → acc_ledgers.id (Bank Accounts / Bank OD group ledgers)',

    -- ── Reconciliation ────────────────────────────────────────
    recon_effective_date     DATE          DEFAULT NULL
        COMMENT 'Effective Date for Reconciliation (form: effectiveDateForReconciliation)',

    -- ── Cheque book ───────────────────────────────────────────
    set_alter_cheque_books   TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'Set/Alter range for Cheque Books? (form: setAlterChequeBooks)',

    -- ── Cheque printing ───────────────────────────────────────
    enable_cheque_printing   TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT 'Enable Cheque Printing? (form: enableChequePrinting)',
    cheque_print_bank_name   VARCHAR(150)  DEFAULT NULL
        COMMENT 'Selected bank print format / name (form: chequePrintBank)',

    created_by               VARCHAR(100)  DEFAULT NULL,
    created_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_bank_config   (ledger_id),
    KEY idx_finance_id                 (finance_id),
    KEY idx_recon_effective_date       (recon_effective_date),
    CONSTRAINT fk_albc_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_albc_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Bank Accounts group — cheque book and reconciliation config';


-- ============================================================
-- TABLE 21: acc_ledger_cheque_books
-- Purpose: Cheque book ranges per bank ledger
-- ============================================================
CREATE TABLE acc_ledger_cheque_books (
    id              INT           NOT NULL AUTO_INCREMENT,
    finance_id      INT           NOT NULL,
    bank_config_id  INT           NOT NULL
        COMMENT 'FK → acc_ledger_bank_config.id',
    book_name       VARCHAR(100)  NOT NULL   COMMENT 'form: chequeBookName',
    from_number     VARCHAR(20)   NOT NULL   COMMENT 'form: chequeFrom',
    to_number       VARCHAR(20)   NOT NULL   COMMENT 'form: chequeTo',
    cheque_length   TINYINT       NOT NULL DEFAULT 6
        COMMENT 'Digit length for zero-padding (form: chequeNumberLength)',
    is_active       TINYINT(1)    NOT NULL DEFAULT 1,
    created_by      VARCHAR(100)  DEFAULT NULL,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_finance_id     (finance_id),
    KEY idx_bank_config_id (bank_config_id),
    KEY idx_is_active      (is_active),
    CONSTRAINT fk_alcb_finance     FOREIGN KEY (finance_id)     REFERENCES finance_detail(id)         ON DELETE CASCADE,
    CONSTRAINT fk_alcb_bank_config FOREIGN KEY (bank_config_id) REFERENCES acc_ledger_bank_config(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Cheque book ranges per bank ledger';


-- ============================================================
-- TABLE 22: acc_bill_references
-- Purpose: Bill-wise outstanding tracking per party
-- ============================================================
CREATE TABLE acc_bill_references (
    id                 INT           NOT NULL AUTO_INCREMENT,
    finance_id         INT           NOT NULL,
    ledger_id          INT           NOT NULL,
    voucher_id         INT           DEFAULT NULL,
    bill_number        VARCHAR(80)   NOT NULL,
    bill_date          DATE          NOT NULL,
    bill_amount        DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    pending_amount     DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    due_date           DATE          DEFAULT NULL,
    is_settled         TINYINT(1)    NOT NULL DEFAULT 0,
    is_opening_balance TINYINT(1)    NOT NULL DEFAULT 0
        COMMENT '1 = part of opening balance bill-wise split',
    settled_at         DATE          DEFAULT NULL,
    ref_type           ENUM('New Ref','Agst Ref','On Account','Advance') DEFAULT 'New Ref',
    narration          VARCHAR(500)  DEFAULT NULL,
    created_by         VARCHAR(100)  DEFAULT NULL,
    created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_bill_ledger_number (finance_id, ledger_id, bill_number),
    KEY idx_finance_id               (finance_id),
    KEY idx_ledger_id                (ledger_id),
    KEY idx_voucher_id               (voucher_id),
    KEY idx_is_settled               (is_settled),
    KEY idx_due_date                 (due_date),
    KEY idx_bill_date                (bill_date),
    CONSTRAINT fk_abr_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_abr_ledger  FOREIGN KEY (ledger_id)  REFERENCES acc_ledgers(id)   ON DELETE CASCADE,
    CONSTRAINT fk_abr_voucher FOREIGN KEY (voucher_id) REFERENCES acc_vouchers(id)  ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Bill-wise outstanding tracking per party';


-- ============================================================
-- TABLE 23: acc_audit_log
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
    CONSTRAINT fk_aal_finance FOREIGN KEY (finance_id)
        REFERENCES finance_detail(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Field-level change history for all accounting tables';


-- ============================================================
-- TRIGGER: Enforce Debit = Credit for Posted Vouchers
-- ============================================================
DROP TRIGGER IF EXISTS trg_voucher_entry_balance_check;
DELIMITER $$
CREATE TRIGGER trg_voucher_entry_balance_check
AFTER INSERT ON acc_voucher_entries
FOR EACH ROW
BEGIN
    DECLARE v_status   VARCHAR(20);
    DECLARE v_total_dr DECIMAL(15,2);
    DECLARE v_total_cr DECIMAL(15,2);
    DECLARE v_diff     DECIMAL(15,2);

    SELECT status INTO v_status FROM acc_vouchers WHERE id = NEW.voucher_id;

    IF v_status = 'Posted' THEN
        SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'Dr' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN entry_type = 'Cr' THEN amount ELSE 0 END), 0)
        INTO v_total_dr, v_total_cr
        FROM acc_voucher_entries WHERE voucher_id = NEW.voucher_id;

        SET v_diff = ABS(v_total_dr - v_total_cr);

        IF v_diff > 0.01 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Voucher imbalance: Debit total must equal Credit total';
        END IF;
    END IF;
END$$
DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- END OF SCHEMA
-- Total: 23 tables + 1 trigger
-- ============================================================
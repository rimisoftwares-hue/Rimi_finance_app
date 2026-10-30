# Migration Analysis: AutoFinex Accounting Module Upgrade (17 to 23 Tables)

## Executive Summary
This document provides a comprehensive technical diff and impact analysis for upgrading the **AutoFinex Accounting Module** from its baseline 17-table schema to the complete 23-table TallyPrime-compliant architecture.

* **Source / Current Baseline Schema**: `backend/sql/AutoFinex_final_schema.sql` (in conjunction with the 17-table accounting specification in `backend/sql/final_account_structure.sql`).
* **Target Schema**: `backend/sql/Autofinex_account_schema.sql` (23 tables, native PostgreSQL 18+ with `uuidv7()`).
* **Scope**: Strictly limited to the accounting module (`acc_*` tables and reporting views). Non-accounting domains (`customers`, `loans`, `payments`, `vehicle_detail`, `vehicle_expenses`, `finance_detail`) are preserved as external foreign key targets.
* **Tenant Isolation Guarantee**: All tables (except the global universal catalogue `acc_group_master`) maintain mandatory multi-tenant scoping via `finance_id UUID NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE`.

---

## 1. Table Inventory

| Category | Count | Tables |
| :--- | :--- | :--- |
| **Common Tables (Existing)** | 17 | `acc_ledger_groups`, `acc_ledgers`, `acc_voucher_types`, `acc_voucher_groups`, `acc_vouchers`, `acc_voucher_entries`, `acc_ledger_balances`, `acc_financial_years`, `acc_cost_centres`, `acc_ledger_mailing`, `acc_ledger_banking`, `acc_ledger_tax`, `acc_ledger_billwise`, `acc_ledger_tax_config`, `acc_ledger_loan_config`, `acc_bill_references`, `acc_audit_log` |
| **New Tables (Target Only)** | 6 | `acc_group_master`, `acc_ledger_banking_txn_types`, `acc_ledger_txn_type_config`, `acc_ledger_statutory`, `acc_ledger_bank_config`, `acc_ledger_cheque_books` |
| **Total Target Tables** | **23** | Complete enterprise TallyPrime double-entry accounting engine |

---

## 2. Six New Tables Specification

### 2.1 `acc_group_master`
* **Purpose**: Global, shared system-level Chart of Accounts catalogue (contains canonical 28 TallyPrime predefined groups). Shared across all tenant finances to prevent duplicate system group definition per company.
* **Primary Key**: `id UUID PRIMARY KEY DEFAULT uuidv7()`
* **Columns**:
  * `group_name VARCHAR(150) NOT NULL UNIQUE`
  * `parent_id UUID REFERENCES acc_group_master(id) ON DELETE RESTRICT` (Self-referential hierarchy)
  * `nature acc_group_nature_enum NOT NULL`
  * `affects_gross_profit BOOLEAN NOT NULL DEFAULT false`
  * `behaves_like_subledger BOOLEAN NOT NULL DEFAULT false`
  * `nett_balance_report acc_nett_balance_report_enum NOT NULL DEFAULT 'Both'`
  * `sequence_order SMALLINT NOT NULL DEFAULT 0`
  * `is_active BOOLEAN NOT NULL DEFAULT true`
* **Indexes**: `idx_agm_parent_id`, `idx_agm_nature`, `idx_agm_is_active`.
* **Seed Data**: Pre-populated with 28 canonical Tally groups (15 Primary roots, 13 Child groups).

### 2.2 `acc_ledger_banking_txn_types`
* **Purpose**: Multi-select transaction types configured per bank account (ATM, Card, Cheque, ECS, e-Fund Transfer, Electronic Cheque, Electronic DD/PO, Others).
* **Primary Key**: `id UUID PRIMARY KEY DEFAULT uuidv7()`
* **Foreign Keys**:
  * `finance_id UUID NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE`
  * `ledger_banking_id UUID NOT NULL REFERENCES acc_ledger_banking(id) ON DELETE CASCADE`
* **Columns**:
  * `txn_type acc_bank_txn_type_enum NOT NULL`
  * `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
* **Constraints**: `UNIQUE (ledger_banking_id, txn_type)`
* **Indexes**: `idx_albtt_finance_id`, `idx_albtt_banking_id`.

### 2.3 `acc_ledger_txn_type_config`
* **Purpose**: Detailed sub-dialog configuration for each bank transaction type enabled on a bank account.
* **Primary Key**: `id UUID PRIMARY KEY DEFAULT uuidv7()`
* **Foreign Keys**:
  * `finance_id UUID NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE`
  * `txn_type_id UUID NOT NULL UNIQUE REFERENCES acc_ledger_banking_txn_types(id) ON DELETE CASCADE`
* **Columns**:
  * `txn_type acc_bank_txn_type_enum NOT NULL`
  * ATM fields: `atm_id VARCHAR(100)`
  * Card fields: `card_type VARCHAR(50)`, `card_number VARCHAR(20)`, `auth_required BOOLEAN`
  * Cheque fields: `cheque_no VARCHAR(20)`, `printing_enabled BOOLEAN`, `range_from INT`, `range_to INT`
  * ECS fields: `mandate_no VARCHAR(50)`, `ref_no VARCHAR(100)`
  * e-Fund Transfer: `eft_account_number VARCHAR(50)`, `eft_ifsc VARCHAR(11)`, `ref_format VARCHAR(100)`, `txn_identifier VARCHAR(100)`
  * Electronic DD/PO: `instrument_no VARCHAR(50)`, `issue_date DATE`
  * Shared/Other fields: `bank_name VARCHAR(150)`, `branch VARCHAR(150)`, `narration VARCHAR(500)`, `description VARCHAR(500)`, `reference VARCHAR(200)`, `remarks VARCHAR(500)`
  * `created_at TIMESTAMP`, `updated_at TIMESTAMP`
* **Indexes**: `idx_alttc_finance_id`.

### 2.4 `acc_ledger_statutory`
* **Purpose**: Party-level MSME registration, e-Invoice applicability, and e-Way Bill transport defaults for debtors and creditors.
* **Primary Key**: `id UUID PRIMARY KEY DEFAULT uuidv7()`
* **Foreign Keys**:
  * `finance_id UUID NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE`
  * `ledger_id UUID NOT NULL UNIQUE REFERENCES acc_ledgers(id) ON DELETE CASCADE`
* **Columns**:
  * `msme_registered BOOLEAN NOT NULL DEFAULT false`
  * `udyam_number VARCHAR(19) DEFAULT NULL`
  * `einvoice_applicable BOOLEAN NOT NULL DEFAULT false`
  * `default_supply_type acc_default_supply_type_enum NOT NULL DEFAULT 'B2B'`
  * `eway_bill_applicable BOOLEAN NOT NULL DEFAULT false`
  * `default_transport_mode acc_default_transport_mode_enum NOT NULL DEFAULT 'Road'`
  * `default_distance_km NUMERIC(8,2) DEFAULT NULL`
  * `created_by VARCHAR(100)`, `created_at TIMESTAMP`, `updated_at TIMESTAMP`
* **Indexes**: `idx_als_finance_id`.

### 2.5 `acc_ledger_bank_config`
* **Purpose**: Bank Accounts group reconciliation preferences, cheque printing enablement, and bank layout selection.
* **Primary Key**: `id UUID PRIMARY KEY DEFAULT uuidv7()`
* **Foreign Keys**:
  * `finance_id UUID NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE`
  * `ledger_id UUID NOT NULL UNIQUE REFERENCES acc_ledgers(id) ON DELETE CASCADE`
* **Columns**:
  * `recon_effective_date DATE DEFAULT NULL`
  * `set_alter_cheque_books BOOLEAN NOT NULL DEFAULT false`
  * `enable_cheque_printing BOOLEAN NOT NULL DEFAULT false`
  * `cheque_print_bank_name VARCHAR(150) DEFAULT NULL`
  * `created_by VARCHAR(100)`, `created_at TIMESTAMP`, `updated_at TIMESTAMP`
* **Indexes**: `idx_albc_finance_id`.

### 2.6 `acc_ledger_cheque_books`
* **Purpose**: Configured physical or electronic cheque book number ranges per bank account.
* **Primary Key**: `id UUID PRIMARY KEY DEFAULT uuidv7()`
* **Foreign Keys**:
  * `finance_id UUID NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE`
  * `bank_config_id UUID NOT NULL REFERENCES acc_ledger_bank_config(id) ON DELETE CASCADE`
* **Columns**:
  * `book_name VARCHAR(100) NOT NULL`
  * `from_number VARCHAR(20) NOT NULL`
  * `to_number VARCHAR(20) NOT NULL`
  * `cheque_length SMALLINT NOT NULL DEFAULT 6`
  * `is_active BOOLEAN NOT NULL DEFAULT true`
  * `created_by VARCHAR(100)`, `created_at TIMESTAMP`, `updated_at TIMESTAMP`
* **Indexes**: `idx_alcb_finance_id`, `idx_alcb_bank_config_id`.

---

## 3. Deep Analysis of the 17 Common Tables

### 3.1 `acc_ledger_groups`
* **Columns Added**:
  * `system_parent_id UUID REFERENCES acc_group_master(id) ON DELETE RESTRICT`
  * `custom_parent_id UUID REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT`
  * `root_master_id UUID REFERENCES acc_group_master(id) ON DELETE RESTRICT`
* **Preserved Columns (Non-Destructive Migration)**:
  * `parent_group_id UUID`, `is_system BOOLEAN`, `system_group_type acc_system_group_type_enum` are retained to preserve legacy references and avoid broken views or queries.
* **Backfill Logic**:
  * If `is_system = true`, match `group_name` with `acc_group_master` to backfill `system_parent_id`.
  * For child groups, point `custom_parent_id = parent_group_id`.
* **New Indexes**:
  * `idx_alg_finance_nature (finance_id, nature)`
  * `idx_alg_sys_parent_id (system_parent_id)`
  * `idx_alg_custom_parent_id (custom_parent_id)`
  * `idx_alg_root_master_id (root_master_id)`

### 3.2 `acc_ledgers`
* **Columns Added**:
  * `alias VARCHAR(150) DEFAULT NULL`
  * `alias_regional VARCHAR(150) DEFAULT NULL`
  * `master_group_id UUID REFERENCES acc_group_master(id) ON DELETE RESTRICT`
  * `reporting_under VARCHAR(200) DEFAULT NULL`
  * `inactive BOOLEAN NOT NULL DEFAULT false`
  * `freeze_balance BOOLEAN NOT NULL DEFAULT false`
  * `inv_values_affected BOOLEAN NOT NULL DEFAULT false`
  * `type_of_ledger acc_ledger_type_enum NOT NULL DEFAULT 'Not Applicable'`
  * `rounding_method acc_rounding_method_enum NOT NULL DEFAULT 'Not Applicable'`
  * `rounding_limit NUMERIC(10,2) DEFAULT NULL`
  * `appropriation_method acc_appropriation_method_enum NOT NULL DEFAULT 'Not Applicable'`
  * `method_to_allocate BOOLEAN NOT NULL DEFAULT false`
  * `is_additional_cost BOOLEAN NOT NULL DEFAULT false`
  * `cost_centre_applicable BOOLEAN NOT NULL DEFAULT false`
  * `cost_centre_allocation BOOLEAN NOT NULL DEFAULT false`
  * `ledger_flushing_method acc_flushing_method_enum NOT NULL DEFAULT 'Default'`
  * `include_in_buyer_ledger BOOLEAN NOT NULL DEFAULT false`
  * `include_in_seller_ledger BOOLEAN NOT NULL DEFAULT false`
* **Nullability & Constraint Changes**:
  * `ledger_code`: Changed from `NOT NULL` to `DEFAULT NULL` (`ALTER TABLE acc_ledgers ALTER COLUMN ledger_code DROP NOT NULL;`).
  * `group_id`: Changed from `NOT NULL` to `DEFAULT NULL` (`ALTER TABLE acc_ledgers ALTER COLUMN group_id DROP NOT NULL;`).
  * **New CHECK Constraint**:
    `CONSTRAINT chk_ledger_under_exclusivity CHECK ((group_id IS NOT NULL AND master_group_id IS NULL) OR (group_id IS NULL AND master_group_id IS NOT NULL))`
* **New Indexes**:
  * `idx_al_master_group_id (master_group_id)`
  * `idx_al_inactive (inactive)`

### 3.3 `acc_voucher_types`
* Structure is aligned with TARGET.
* Default indexing on `(finance_id)`, `(class)`, and unique `(finance_id, type_code)`.

### 3.4 `acc_voucher_groups`
* Structure is aligned with TARGET (`finance_id`, `group_name`, `group_date`, `status`).

### 3.5 `acc_vouchers`
* Structure is aligned with TARGET.
* Multi-currency support: `currency_code CHAR(3) NOT NULL DEFAULT 'INR'`, `exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1.000000`.
* Generated column: `base_amount NUMERIC(15,2) GENERATED ALWAYS AS (ROUND(total_amount * exchange_rate, 2)) STORED`.

### 3.6 `acc_voucher_entries`
* Structure is aligned with TARGET (`entry_type`, `amount`, `tax_type`, `tax_rate`, `tax_amount`).

### 3.7 `acc_ledger_balances`
* Pre-aggregated reporting table.
* Generated columns:
  * `closing_dr NUMERIC(15,2) GENERATED ALWAYS AS (opening_dr + period_dr) STORED`
  * `closing_cr NUMERIC(15,2) GENERATED ALWAYS AS (opening_cr + period_cr) STORED`
* Unique constraint: `uk_ledger_year (finance_id, ledger_id, financial_year)`.

### 3.8 `acc_financial_years`
* Structure is aligned with TARGET. `uk_year_finance (finance_id, year_label)`.

### 3.9 `acc_cost_centres`
* Structure is aligned with TARGET.

### 3.10 `acc_ledger_mailing`
* **Columns Added**:
  * `mailing_name VARCHAR(200) DEFAULT NULL`
  * `addr_line3 VARCHAR(255) DEFAULT NULL`
  * `addr_line4 VARCHAR(255) DEFAULT NULL`
  * `district VARCHAR(100) DEFAULT NULL`
  * `show_mailing_details BOOLEAN NOT NULL DEFAULT true`
  * `provide_contact BOOLEAN NOT NULL DEFAULT false`
  * `contact_person VARCHAR(150) DEFAULT NULL`
  * `telephone VARCHAR(30) DEFAULT NULL`
  * `mobile VARCHAR(20) DEFAULT NULL`
  * `primary_mobile VARCHAR(20) DEFAULT NULL`
  * `fax VARCHAR(30) DEFAULT NULL`
  * `email VARCHAR(150) DEFAULT NULL`
  * `email_cc VARCHAR(150) DEFAULT NULL`
  * `website VARCHAR(200) DEFAULT NULL`
* **New Indexes**: `idx_alm_city`, `idx_alm_state`.

### 3.11 `acc_ledger_banking`
* **Columns Added**:
  * `provide_bank_details BOOLEAN NOT NULL DEFAULT false`
  * `account_holder_name VARCHAR(200) DEFAULT NULL`
  * `swift_code VARCHAR(11) DEFAULT NULL`
* **Default Update**: `acc_type` default aligned to `'Current'`.
* **Partial Unique Index**:
  `CREATE UNIQUE INDEX uk_ledger_primary ON acc_ledger_banking (ledger_id) WHERE is_primary = true;`

### 3.12 `acc_ledger_tax`
* **Columns Added**:
  * `assessee_other_territory BOOLEAN NOT NULL DEFAULT false`
  * `territory VARCHAR(150) DEFAULT NULL`
  * `tan_number VARCHAR(10) DEFAULT NULL`
  * `deductor_category VARCHAR(100) DEFAULT NULL`
  * `collection_account_no VARCHAR(20) DEFAULT NULL`
  * `tax_type acc_party_tax_type_enum NOT NULL DEFAULT 'None'`
  * `deductee_type acc_deductee_type_enum DEFAULT NULL`
  * `buyer_type acc_buyer_type_enum DEFAULT NULL`
* **New Indexes**: `idx_alt_gstin`, `idx_alt_pan`.

### 3.13 `acc_ledger_billwise`
* **Columns Added**:
  * `check_credit_days BOOLEAN NOT NULL DEFAULT false`
* **Default Update**: `credit_days` set default to `30`.
* **Constraint**: `CHECK (credit_days >= 0)`.

### 3.14 `acc_ledger_tax_config`
* **Columns Added**:
  * `gst_applicable acc_gst_applicability_enum NOT NULL DEFAULT 'Undefined'`
  * `set_alter_gst_details BOOLEAN NOT NULL DEFAULT false`
  * `gst_description VARCHAR(200) DEFAULT NULL`
  * `applicable_from DATE DEFAULT NULL`
  * `hsn_sac_code VARCHAR(20) DEFAULT NULL`
  * `hsn_sac_details acc_hsn_details_mode_enum NOT NULL DEFAULT 'As per Company'`
  * `source_of_details acc_hsn_source_mode_enum NOT NULL DEFAULT 'As per Company'`
  * `hsn_description VARCHAR(500) DEFAULT NULL`
  * `type_of_supply acc_type_of_supply_enum DEFAULT NULL`
  * `taxability acc_taxability_enum DEFAULT NULL`
  * `igst_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00`
  * `cgst_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00`
  * `sgst_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00`
  * `cess_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00`
  * `cess_type acc_cess_type_enum NOT NULL DEFAULT 'Valorem'`
  * `cess_per_unit NUMERIC(10,4) DEFAULT NULL`
  * `cess_unit VARCHAR(50) DEFAULT NULL`
  * `reverse_charge BOOLEAN NOT NULL DEFAULT false`
  * `include_in_assessable BOOLEAN NOT NULL DEFAULT false`
  * `appropriate_to VARCHAR(50) DEFAULT NULL`
  * `method_of_appropriation VARCHAR(50) DEFAULT NULL`
  * `gst_status acc_gst_status_enum NOT NULL DEFAULT 'Active'`
  * `cancelled_date DATE DEFAULT NULL`
  * `nature_of_transaction VARCHAR(150) DEFAULT NULL`
  * `hsn_igst_rate NUMERIC(5,2) DEFAULT NULL`
  * `duty_tax_type acc_duty_tax_type_enum DEFAULT NULL`
  * `duty_tax_sub_type VARCHAR(150) DEFAULT NULL`
  * `duty_percentage NUMERIC(5,2) DEFAULT NULL`
  * `calc_based_on acc_duty_calc_based_enum NOT NULL DEFAULT 'On Total Sales'`
  * `used_in_vat_returns BOOLEAN NOT NULL DEFAULT false`
  * `method_of_calculation_duty acc_method_calc_duty_enum NOT NULL DEFAULT 'On Total Sales'`
* **New Indexes**: `idx_altc_hsn_code`.

### 3.15 `acc_ledger_loan_config`
* Aligned with TARGET.

### 3.16 `acc_bill_references`
* **Column Added**: `is_opening_balance BOOLEAN NOT NULL DEFAULT false`.

### 3.17 `acc_audit_log`
* Aligned with TARGET.

---

## 4. ENUM Types & Triggers Diff

### 4.1 New ENUM Types Added (19 types)
1. `acc_ledger_type_enum`: `'Not Applicable', 'Invoice Rounding', 'Discount'`
2. `acc_rounding_method_enum`: `'Not Applicable', 'Normal Rounding', 'Downward Rounding', 'Upward Rounding'`
3. `acc_appropriation_method_enum`: `'Not Applicable', 'Appropriate by Value', 'Appropriate by Quantity'`
4. `acc_flushing_method_enum`: `'Default', 'Cash Basis', 'Accrual Basis'`
5. `acc_party_tax_type_enum`: `'None', 'TDS', 'TCS'`
6. `acc_deductee_type_enum`: `'Individual', 'HUF', 'Firm', 'Company', 'Trust', 'Government', 'AOP'`
7. `acc_buyer_type_enum`: `'Individual', 'Company', 'Government', 'Exporter', 'SEZ'`
8. `acc_default_supply_type_enum`: `'B2B', 'SEZ', 'Export', 'Deemed Export'`
9. `acc_default_transport_mode_enum`: `'Road', 'Rail', 'Air', 'Ship'`
10. `acc_gst_applicability_enum`: `'Applicable', 'Not Applicable', 'Undefined'`
11. `acc_hsn_details_mode_enum`: `'As per Company', 'As per Stock Group', 'Specify Details Here'`
12. `acc_hsn_source_mode_enum`: `'As per Company', 'As per Stock Group', 'As per Stock Item', 'Specify Details Here'`
13. `acc_type_of_supply_enum`: `'Goods', 'Services'`
14. `acc_taxability_enum`: `'Taxable', 'Exempt', 'Nil Rated'`
15. `acc_cess_type_enum`: `'Valorem', 'Quantum'`
16. `acc_gst_status_enum`: `'Active', 'Cancelled', 'Suspended'`
17. `acc_duty_tax_type_enum`: `'GST', 'TCS', 'TDS', 'Others'`
18. `acc_duty_calc_based_enum`: `'On Total Sales', 'On Current Subtotal', 'On Item Rate', 'On TDS/TCS Assessable Value'`
19. `acc_method_calc_duty_enum`: `'On Total Sales', 'On Net Sales', 'On Assessable Value'`

### 4.2 Existing ENUM Additions
* `acc_bank_acc_type_enum`: Added `'Cash Credit'`, `'Overdraft'`, `'Loan A/c'`
* `acc_bank_txn_type_enum`: Added `'ATM'`, `'Card'`, `'ECS'`, `'e-Fund Transfer'`, `'Electronic Cheque'`, `'Electronic DD/PO'`, `'Others'`
* `acc_gst_reg_type_enum`: Added `'SEZ Unit'`, `'SEZ Developer'`, `'Deemed Export'`, `'Tax Deductor'`, `'Tax Collector (E-Commerce)'`, `'Input Service Distributor'`, `'UIN Holder'`

### 4.3 Functions and Triggers
* `fn_trg_update_ledger_balance_after_insert()`: Real-time balance accumulation on voucher insert (`AFTER INSERT ON acc_voucher_entries`).
* `fn_trg_voucher_entry_balance_check()`: Debit/Credit equality validation for posted vouchers (`AFTER INSERT OR UPDATE ON acc_voucher_entries`).

### 4.4 Reporting Views
* `v_trial_balance`: Aggregates opening, period, and closing balances, resolving both master groups and company-specific groups.
* `v_day_book`: Complete chronologically listed voucher registry with account lines.

---

## 5. Ambiguity & Risk Analysis

| Item | Risk Level | Mitigation / Strategy |
| :--- | :--- | :--- |
| **New NOT NULL columns on existing tables** (`inactive`, `inv_values_affected`, `show_mailing_details`, etc.) | High (would fail if rows exist without defaults) | All new boolean/enum columns are added with explicit `DEFAULT` values so existing rows are automatically populated without null constraint violations. |
| **Exclusivity Constraint on `acc_ledgers`** (`chk_ledger_under_exclusivity`) | Critical (requires exactly one of `group_id` OR `master_group_id` to be non-null) | Data migration step checks if `acc_ledgers.group_id` references a system group in `acc_ledger_groups`. If so, it remaps `master_group_id = acc_group_master.id` and sets `group_id = NULL` prior to adding the CHECK constraint. |
| **Dropping NOT NULL on `ledger_code` and `group_id`** | Low | Safe operation; removes unnecessary restrictions while preserving all existing codes. |
| **Non-Destructive Column Preservation** | Zero | Legacy columns (`parent_group_id`, `is_system`, etc.) are retained, guaranteeing backward compatibility with existing backend code. |


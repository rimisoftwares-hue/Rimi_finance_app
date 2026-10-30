-- ==============================================================================
-- ROLLBACK SCRIPT: 002_rollback.sql
-- PURPOSE        : Revert migration 002_account_schema_upgrade.sql cleanly
-- DATE           : 2026-10-30
-- ==============================================================================

BEGIN;

-- 1. Drop Views
DROP VIEW IF EXISTS v_trial_balance;
DROP VIEW IF EXISTS v_day_book;

-- 2. Drop Triggers and Functions
DROP TRIGGER IF EXISTS trg_voucher_entry_balance_check ON acc_voucher_entries;
DROP TRIGGER IF EXISTS trg_update_ledger_balance_after_insert ON acc_voucher_entries;
DROP FUNCTION IF EXISTS fn_trg_voucher_entry_balance_check();
DROP FUNCTION IF EXISTS fn_trg_update_ledger_balance_after_insert();

-- 3. Drop Added Constraints
ALTER TABLE acc_ledgers DROP CONSTRAINT IF EXISTS chk_ledger_under_exclusivity;
ALTER TABLE acc_ledgers DROP CONSTRAINT IF EXISTS fk_al_master_group;
ALTER TABLE acc_ledger_groups DROP CONSTRAINT IF EXISTS fk_alg_root_master;
ALTER TABLE acc_ledger_groups DROP CONSTRAINT IF EXISTS fk_alg_custom_parent;
ALTER TABLE acc_ledger_groups DROP CONSTRAINT IF EXISTS fk_alg_sys_parent;
ALTER TABLE acc_ledger_billwise DROP CONSTRAINT IF EXISTS chk_credit_days;

-- 4. Drop Added Indexes
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
DROP INDEX IF EXISTS idx_als_finance_id;
DROP INDEX IF EXISTS idx_albc_finance_id;
DROP INDEX IF EXISTS idx_alcb_finance_id;
DROP INDEX IF EXISTS idx_alcb_bank_config_id;
DROP INDEX IF EXISTS idx_albtt_finance_id;
DROP INDEX IF EXISTS idx_albtt_banking_id;
DROP INDEX IF EXISTS idx_alttc_finance_id;
DROP INDEX IF EXISTS idx_agm_parent_id;
DROP INDEX IF EXISTS idx_agm_nature;
DROP INDEX IF EXISTS idx_agm_is_active;

-- 5. Drop New Tables (in reverse FK order)
DROP TABLE IF EXISTS acc_ledger_cheque_books CASCADE;
DROP TABLE IF EXISTS acc_ledger_bank_config CASCADE;
DROP TABLE IF EXISTS acc_ledger_txn_type_config CASCADE;
DROP TABLE IF EXISTS acc_ledger_banking_txn_types CASCADE;
DROP TABLE IF EXISTS acc_ledger_statutory CASCADE;
DROP TABLE IF EXISTS acc_group_master CASCADE;

COMMIT;


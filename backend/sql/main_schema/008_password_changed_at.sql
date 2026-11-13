-- ============================================================================
-- Migration 008: Add password_changed_at to users and owner
-- ============================================================================
-- Purpose:
--   Add nullable password_changed_at (TIMESTAMPTZ) to users and owner tables
--   to track the timestamp of the last password change or reset.
--   Existing rows remain NULL (displayed as "-" in the UI).
--   Idempotent and transactional.
-- ============================================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE owner ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NULL;

COMMIT;


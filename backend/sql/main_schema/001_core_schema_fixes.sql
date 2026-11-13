-- ============================================================================
--  AUTOFINEX VOICE AI — MIGRATION 001: CORE SCHEMA BOOTSTRAP PREREQUISITES
-- ============================================================================
--  Safely ensures `lead_call_status_enum` and `finance_brand_asset_enum` exist
--  idempotently before applying `AutoFinex_final_schema.sql` / `002` / `003`.
-- ============================================================================

DO $$
BEGIN
    CREATE TYPE lead_call_status_enum AS ENUM (
        'uncalled',
        'connecting',
        'speaking',
        'not_responded',
        'completed',
        'failed',
        'scheduled',
        'suppressed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE finance_brand_asset_enum AS ENUM (
        'web_logo',
        'print_logo',
        'app_logo',
        'digital_seal',
        'authorized_sign',
        'letterhead_banner',
        'watermark_logo'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


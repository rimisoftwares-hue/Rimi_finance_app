-- Migration 006: OCR ledger-card import (batches + jobs)
-- Additive and idempotent. Target: PostgreSQL 18 (uuidv7()).
-- Run MANUALLY against a local/dev database only (see OCR_IMPLEMENTATION_PLAN.md, STOP condition S1).
-- The application and the OCR worker never run this DDL automatically.

CREATE TABLE IF NOT EXISTS ocr_batches (
  id                  UUID          PRIMARY KEY DEFAULT uuidv7(),
  finance_id          UUID          NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE,
  created_by_user_id  UUID          REFERENCES users(id) ON DELETE SET NULL,
  context_type        VARCHAR(30)   NOT NULL DEFAULT 'direct_form',
  context_id          UUID          DEFAULT NULL,
  loan_type           VARCHAR(30)   NOT NULL,               -- 'consulting' | 'vehicle'
  expected_images     SMALLINT      NOT NULL DEFAULT 1,
  force_rescan        BOOLEAN       NOT NULL DEFAULT FALSE,  -- bypass the dedup cache
  status              VARCHAR(20)   NOT NULL DEFAULT 'created',
  merged_result       JSONB         DEFAULT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ocrb_status CHECK (status IN ('created','processing','complete','needs_review','failed','cancelled')),
  CONSTRAINT chk_ocrb_images CHECK (expected_images BETWEEN 1 AND 5),
  CONSTRAINT chk_ocrb_loan_type CHECK (loan_type IN ('consulting','vehicle'))
);

CREATE TABLE IF NOT EXISTS ocr_jobs (
  id                  UUID          PRIMARY KEY DEFAULT uuidv7(),
  batch_id            UUID          NOT NULL REFERENCES ocr_batches(id) ON DELETE CASCADE,
  finance_id          UUID          NOT NULL REFERENCES finance_detail(id) ON DELETE CASCADE,
  sequence_no         SMALLINT      NOT NULL DEFAULT 1,
  file_name           VARCHAR(255),
  mime_type           VARCHAR(100)  NOT NULL,
  declared_size_bytes INT,
  s3_bucket           VARCHAR(100)  NOT NULL,
  s3_key              VARCHAR(1024) NOT NULL,
  sha256_hex          CHAR(64),
  status              VARCHAR(20)   NOT NULL DEFAULT 'created',
  extracted_data      JSONB         DEFAULT NULL,
  error_code          VARCHAR(80)   DEFAULT NULL,
  retry_count         SMALLINT      NOT NULL DEFAULT 0,
  next_attempt_at     TIMESTAMPTZ   DEFAULT NULL,
  locked_at           TIMESTAMPTZ   DEFAULT NULL,
  model_used          VARCHAR(100)  DEFAULT NULL,
  prompt_version      VARCHAR(30)   DEFAULT NULL,
  tokens_in           INT           DEFAULT NULL,
  tokens_out          INT           DEFAULT NULL,
  uploaded_at         TIMESTAMPTZ   DEFAULT NULL,
  processed_at        TIMESTAMPTZ   DEFAULT NULL,
  expires_at          TIMESTAMPTZ   NOT NULL,               -- set by the API from OCR_S3_RETENTION_DAYS
  s3_deleted_at       TIMESTAMPTZ   DEFAULT NULL,
  data_purged_at      TIMESTAMPTZ   DEFAULT NULL,           -- extracted_data erased
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ocrj_s3 UNIQUE (s3_bucket, s3_key),
  CONSTRAINT uq_ocrj_batch_seq UNIQUE (batch_id, sequence_no),
  CONSTRAINT chk_ocrj_status CHECK (status IN ('created','uploaded','queued','processing','complete','needs_review','failed','cancelled')),
  CONSTRAINT chk_ocrj_json CHECK (extracted_data IS NULL OR jsonb_typeof(extracted_data) = 'object')
);

-- Worker claim: only queued rows
CREATE INDEX IF NOT EXISTS idx_ocrj_queue
  ON ocr_jobs (next_attempt_at, created_at) WHERE status = 'queued';

-- Reaper: jobs stuck in processing
CREATE INDEX IF NOT EXISTS idx_ocrj_processing
  ON ocr_jobs (locked_at) WHERE status = 'processing';

-- Batch lookups (job list per batch)
CREATE INDEX IF NOT EXISTS idx_ocrj_batch ON ocr_jobs (batch_id, sequence_no);

-- Tenant lookups, daily quota and per-user rate counts
CREATE INDEX IF NOT EXISTS idx_ocrb_finance ON ocr_batches (finance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocrb_user ON ocr_batches (created_by_user_id, created_at DESC);

-- Sweep: expired objects / data not yet cleaned
CREATE INDEX IF NOT EXISTS idx_ocrj_expiry
  ON ocr_jobs (expires_at) WHERE s3_deleted_at IS NULL OR data_purged_at IS NULL;

-- Dedup cache lookup
CREATE INDEX IF NOT EXISTS idx_ocrj_dedup
  ON ocr_jobs (finance_id, sha256_hex)
  WHERE status = 'complete' AND extracted_data IS NOT NULL;


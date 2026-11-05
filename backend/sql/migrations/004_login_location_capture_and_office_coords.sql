-- Migration 004: Login location capture, session audit, and office coordinates
-- Idempotent schema additions for agent_login_sessions and finance_detail

ALTER TABLE agent_login_sessions
  ADD COLUMN IF NOT EXISTS location_source      VARCHAR(10)  NOT NULL DEFAULT 'none',  -- device | ip | none
  ADD COLUMN IF NOT EXISTS location_accuracy_m  INT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_permission  VARCHAR(15)  DEFAULT NULL,             -- granted | declined | blocked | unavailable | not_asked
  ADD COLUMN IF NOT EXISTS ip_city              VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ip_region            VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ip_country           VARCHAR(10)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS flagged              BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason          VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS logout_reason        VARCHAR(20)  DEFAULT NULL;              -- manual | window_close | timeout

CREATE INDEX IF NOT EXISTS idx_als_open ON agent_login_sessions (last_seen_at) WHERE logout_time IS NULL;

ALTER TABLE finance_detail
  ADD COLUMN IF NOT EXISTS office_lat        DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS office_lng        DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS office_geofence_m INT DEFAULT 200;


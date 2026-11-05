-- Migration 005: Address latitude & longitude and office coordinates
-- Idempotent schema additions for addresses and finance_detail

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS latitude  DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL;

ALTER TABLE finance_detail
  ADD COLUMN IF NOT EXISTS office_lat        DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS office_lng        DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS office_geofence_m INT DEFAULT 200;


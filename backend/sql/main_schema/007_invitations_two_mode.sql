-- Migration 007: Two-mode invitations (direct in-app invite + shareable invite code)
--
-- Idempotent: safe to run any number of times (every step is guarded).
-- Preserves data: nothing is dropped except the old CASCADE foreign key on
-- agent_invitations.invited_by, which is re-created as ON DELETE SET NULL.
--
-- Run with plain psql (autocommit), e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/migrations/007_invitations_two_mode.sql
--
-- Status conventions after this migration:
--   pending   -> direct invite awaiting answer / code still redeemable
--   accepted  -> direct invite accepted
--   declined  -> direct invite declined by the invitee            (new value)
--   exhausted -> code reached max_uses                            (new value)
--   cancelled -> revoked by owner/admin (revoked_at is also set)
--   expired   -> past expires_at (also computed at read time)

-- ── 1. Enum values (ADD VALUE must commit before the value is used; none of
--      the statements below use the new values, so this is also -1 safe) ────
ALTER TYPE invitation_status_enum ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE invitation_status_enum ADD VALUE IF NOT EXISTS 'exhausted';

BEGIN;

-- ── 2. invited_by becomes nullable, FK switches CASCADE -> SET NULL ─────────
ALTER TABLE agent_invitations ALTER COLUMN invited_by DROP NOT NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop any FK on invited_by that is not ON DELETE SET NULL (name-agnostic,
  -- because live constraint names differ from the schema file).
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'agent_invitations'::regclass
      AND c.contype = 'f'
      AND a.attname = 'invited_by'
      AND c.confdeltype <> 'n'
  LOOP
    EXECUTE format('ALTER TABLE agent_invitations DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'agent_invitations'::regclass
      AND c.contype = 'f'
      AND a.attname = 'invited_by'
  ) THEN
    ALTER TABLE agent_invitations
      ADD CONSTRAINT fk_ai_invited_by FOREIGN KEY (invited_by)
      REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. invited_by_owner_id (owner accounts have no users row) ──────────────
ALTER TABLE agent_invitations ADD COLUMN IF NOT EXISTS invited_by_owner_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agent_invitations'::regclass AND conname = 'fk_ai_invited_by_owner'
  ) THEN
    ALTER TABLE agent_invitations
      ADD CONSTRAINT fk_ai_invited_by_owner FOREIGN KEY (invited_by_owner_id)
      REFERENCES owner(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4. invite_type / max_uses / used_count with one-time backfill ──────────
-- Backfill runs only in the run that creates the column, so a later run can
-- never relabel rows created by the new application code.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'agent_invitations' AND column_name = 'invite_type'
  ) THEN
    ALTER TABLE agent_invitations ADD COLUMN invite_type VARCHAR(20);

    -- Rows that carry a shareable code and no target user are code invites;
    -- rows that target a specific user stay direct (incl. the legacy
    -- 'accepted' audit rows written by POST /api/auth/users/invite-existing).
    UPDATE agent_invitations
       SET invite_type = CASE
                           WHEN user_id IS NULL AND invitation_code IS NOT NULL THEN 'code'
                           ELSE 'direct'
                         END
     WHERE invite_type IS NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'agent_invitations' AND column_name = 'max_uses'
  ) THEN
    ALTER TABLE agent_invitations ADD COLUMN max_uses INT NULL;
    -- Legacy code rows had no usage limit concept: treat them conservatively
    -- as single-use instead of silently turning them into unlimited codes.
    UPDATE agent_invitations SET max_uses = 1 WHERE invite_type = 'code';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'agent_invitations' AND column_name = 'used_count'
  ) THEN
    ALTER TABLE agent_invitations ADD COLUMN used_count INT NOT NULL DEFAULT 0;
    UPDATE agent_invitations SET used_count = 1 WHERE status = 'accepted';
  END IF;
END $$;

ALTER TABLE agent_invitations ALTER COLUMN invite_type SET DEFAULT 'direct';
ALTER TABLE agent_invitations ALTER COLUMN invite_type SET NOT NULL;
ALTER TABLE agent_invitations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;
ALTER TABLE agent_invitations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agent_invitations'::regclass AND conname = 'chk_ai_invite_type') THEN
    ALTER TABLE agent_invitations ADD CONSTRAINT chk_ai_invite_type CHECK (invite_type IN ('direct', 'code'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agent_invitations'::regclass AND conname = 'chk_ai_assigned_role_not_owner') THEN
    ALTER TABLE agent_invitations ADD CONSTRAINT chk_ai_assigned_role_not_owner CHECK (assigned_role <> 'owner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agent_invitations'::regclass AND conname = 'chk_ai_max_uses') THEN
    ALTER TABLE agent_invitations ADD CONSTRAINT chk_ai_max_uses CHECK (max_uses IS NULL OR max_uses >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agent_invitations'::regclass AND conname = 'chk_ai_used_count') THEN
    ALTER TABLE agent_invitations ADD CONSTRAINT chk_ai_used_count CHECK (used_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agent_invitations'::regclass AND conname = 'chk_ai_code_has_code') THEN
    ALTER TABLE agent_invitations ADD CONSTRAINT chk_ai_code_has_code CHECK (invite_type <> 'code' OR invitation_code IS NOT NULL);
  END IF;
END $$;

-- ── 5. One pending direct invite per (finance, user) ───────────────────────
-- Neutralise pre-existing duplicates first (keep the newest; older ones are
-- marked cancelled, not deleted) so the unique index can always be created.
UPDATE agent_invitations ai
   SET status = 'cancelled',
       revoked_at = COALESCE(ai.revoked_at, now()),
       updated_at = CURRENT_TIMESTAMP
 WHERE ai.invite_type = 'direct'
   AND ai.status = 'pending'
   AND EXISTS (
     SELECT 1 FROM agent_invitations n
     WHERE n.finance_id = ai.finance_id
       AND n.user_id = ai.user_id
       AND n.invite_type = 'direct'
       AND n.status = 'pending'
       AND (n.created_at, n.id) > (ai.created_at, ai.id)
   );

CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_pending_direct
  ON agent_invitations (finance_id, user_id)
  WHERE invite_type = 'direct' AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_finance_type_created
  ON agent_invitations (finance_id, invite_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (LOWER(email));

-- Code lookups: invitation_code already carries a UNIQUE constraint (and
-- therefore a unique btree index) in both the schema file and the live DB.
-- Only create one if an environment is missing it (avoids a duplicate index).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'agent_invitations'::regclass
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'invitation_code'
  ) THEN
    CREATE UNIQUE INDEX ux_ai_invitation_code ON agent_invitations (invitation_code);
  END IF;
END $$;

-- ── 6. Redemption history (who joined through which invitation) ────────────
CREATE TABLE IF NOT EXISTS agent_invitation_redemptions (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    invitation_id         UUID                NOT NULL,
    finance_id            UUID                NOT NULL,
    user_id               UUID                NOT NULL,
    invited_by_user_id    UUID                DEFAULT NULL,
    invited_by_owner_id   UUID                DEFAULT NULL,
    redeemed_at           TIMESTAMPTZ         NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT uq_air_invitation_user UNIQUE (invitation_id, user_id),
    CONSTRAINT fk_air_invitation FOREIGN KEY (invitation_id) REFERENCES agent_invitations(id) ON DELETE CASCADE,
    CONSTRAINT fk_air_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_air_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_air_invited_by_user FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_air_invited_by_owner FOREIGN KEY (invited_by_owner_id) REFERENCES owner(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_air_finance_redeemed ON agent_invitation_redemptions (finance_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_air_user ON agent_invitation_redemptions (user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autofinex_developer') THEN
    GRANT ALL PRIVILEGES ON TABLE agent_invitations, agent_invitation_redemptions TO autofinex_developer;
  END IF;
END $$;

-- Backfill history for already-accepted direct invitations (idempotent).
-- accepted_at is a naive timestamp written in the DB session time zone.
INSERT INTO agent_invitation_redemptions (
  invitation_id, finance_id, user_id, invited_by_user_id, invited_by_owner_id, redeemed_at
)
SELECT ai.id, ai.finance_id, ai.user_id, ai.invited_by, ai.invited_by_owner_id,
       COALESCE(ai.accepted_at, ai.updated_at, ai.created_at) AT TIME ZONE current_setting('TimeZone')
FROM agent_invitations ai
WHERE ai.status = 'accepted'
  AND ai.user_id IS NOT NULL
ON CONFLICT (invitation_id, user_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- PROPOSE ONLY — DO NOT AUTO-EXECUTE WITHOUT OWNER REVIEW
--
-- File: backend/scripts/sql/cleanup_historical_mock_calls.sql
-- Purpose:
--   Purges historical mock Voice AI call logs (`provider_call_id LIKE 'mock-%'`)
--   and any dependent summary/callback/PTP/suppression/outbox rows created
--   during earlier prototype mock runs.
--
-- Mandatory Pre-Run Step:
--   1. Run `node backend/scripts/cleanup_mock_voice_data_dry_run.js` first and
--      review the read-only row counts.
--   2. Execute on a DEV copy first with `ROLLBACK;` at the bottom to verify
--      affected counts before changing `ROLLBACK;` to `COMMIT;`.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _target_mock_calls ON COMMIT DROP AS
SELECT id, finance_id, customer_id, lead_id, provider_call_id
FROM public.ai_telecalling_call_logs
WHERE provider_call_id LIKE 'mock-%';

-- 1. Delete dependent `voice_outbox_events` tied to mock `promise_to_pay` or mock `call_id`
DELETE FROM public.voice_outbox_events voe
WHERE voe.aggregate_id IN (SELECT id FROM _target_mock_calls)
   OR voe.aggregate_id IN (
       SELECT p.id
       FROM public.promise_to_pay p
       JOIN _target_mock_calls mc
         ON mc.id = p.call_log_id
        AND mc.finance_id = p.finance_id
   );

-- 2. Delete dependent `promise_to_pay` rows created by mock calls
DELETE FROM public.promise_to_pay p
USING _target_mock_calls mc
WHERE p.call_log_id = mc.id
  AND p.finance_id = mc.finance_id;

-- 3. Delete dependent `voice_callbacks` rows created by mock calls
DELETE FROM public.voice_callbacks vc
USING _target_mock_calls mc
WHERE vc.call_id = mc.id
  AND vc.finance_id = mc.finance_id;

-- 4. Delete dependent `voice_contact_suppressions` rows created by mock calls
DELETE FROM public.voice_contact_suppressions vcs
USING _target_mock_calls mc
WHERE vcs.source_call_id = mc.id
  AND vcs.finance_id = mc.finance_id;

-- 5. Delete dependent `voice_call_summaries` rows created by mock calls
DELETE FROM public.voice_call_summaries vs
USING _target_mock_calls mc
WHERE vs.call_log_id = mc.id
  AND vs.finance_id = mc.finance_id;

-- 6. Delete the mock `ai_telecalling_call_logs` rows themselves
DELETE FROM public.ai_telecalling_call_logs cl
USING _target_mock_calls mc
WHERE cl.id = mc.id
  AND cl.finance_id = mc.finance_id;

-- Safety default: rolls back until the owner explicitly replaces `ROLLBACK;` with `COMMIT;`.
ROLLBACK;

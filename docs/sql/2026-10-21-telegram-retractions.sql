BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_contract_notifications
  ADD COLUMN IF NOT EXISTS delivery_target jsonb,
  ADD COLUMN IF NOT EXISTS retraction jsonb;
GRANT UPDATE(retraction) ON himoto.management_contract_notifications TO himoto_scoped;
CREATE INDEX IF NOT EXISTS contract_notice_retraction_pending_idx
  ON himoto.management_contract_notifications(created_at)
  WHERE retraction->>'state' IN ('pending','processing');
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE himoto.store_duty_schedules
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by bigint,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS request_hash char(64);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='himoto.store_duty_schedules'::regclass AND conname='duty_roster_hours') THEN
    ALTER TABLE himoto.store_duty_schedules ADD CONSTRAINT duty_roster_hours CHECK (
      (starts_at IS NULL) = (ends_at IS NULL) AND
      (starts_at IS NULL OR (ends_at > starts_at AND ends_at <= starts_at + interval '24 hours')));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS duty_roster_request_unique ON himoto.store_duty_schedules(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS duty_roster_active_dates ON himoto.store_duty_schedules(starts_at,ends_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS duty_roster_active_staff ON himoto.store_duty_schedules(staff_id,starts_at) WHERE deleted_at IS NULL;
ALTER TABLE himoto.store_duty_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.store_duty_schedules FROM anon, authenticated;
COMMIT;

BEGIN;
CREATE TABLE IF NOT EXISTS himoto.staff_shift_registration_week_locks (
  week_start date PRIMARY KEY CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  locked_by bigint NOT NULL REFERENCES himoto.users(id),
  locked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.staff_shift_registration_week_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.staff_shift_registration_week_locks FROM PUBLIC, anon, authenticated, himoto_scoped;
GRANT SELECT (week_start) ON himoto.staff_shift_registration_week_locks TO himoto_scoped;
DROP POLICY IF EXISTS shift_registration_week_lock_read ON himoto.staff_shift_registration_week_locks;
CREATE POLICY shift_registration_week_lock_read ON himoto.staff_shift_registration_week_locks FOR SELECT TO himoto_scoped
  USING (current_setting('himoto.operation', true) = 'duty_roster');
COMMIT;

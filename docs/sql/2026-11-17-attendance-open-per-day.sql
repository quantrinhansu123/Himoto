BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS management_staff_attendance_open_day
  ON himoto.management_staff_attendance(staff_id, ((clock_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))
  WHERE clock_out_at IS NULL;

DROP INDEX IF EXISTS himoto.management_staff_attendance_open;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE himoto.management_staff_attendance
  ADD COLUMN IF NOT EXISTS hr_note text CHECK (char_length(hr_note) <= 500),
  ADD COLUMN IF NOT EXISTS hr_note_by bigint REFERENCES himoto.users(id),
  ADD COLUMN IF NOT EXISTS hr_note_at timestamptz;
COMMIT;

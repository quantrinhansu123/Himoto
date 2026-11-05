CREATE TABLE IF NOT EXISTS himoto.management_staff_attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id bigint NOT NULL REFERENCES himoto.staff_profiles(id),
  actor_id bigint NOT NULL REFERENCES himoto.users(id),
  store_id bigint REFERENCES himoto.stores(id),
  staff_name text NOT NULL,
  clock_in_at timestamptz NOT NULL DEFAULT now(),
  clock_out_at timestamptz,
  in_request uuid NOT NULL UNIQUE,
  out_request uuid UNIQUE,
  in_photo bytea NOT NULL,
  out_photo bytea,
  in_mime text NOT NULL,
  out_mime text,
  in_location jsonb NOT NULL,
  out_location jsonb,
  CHECK(clock_out_at IS NULL OR clock_out_at >= clock_in_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS management_staff_attendance_open
  ON himoto.management_staff_attendance(staff_id) WHERE clock_out_at IS NULL;
CREATE INDEX IF NOT EXISTS management_staff_attendance_date
  ON himoto.management_staff_attendance(clock_in_at DESC,store_id);
ALTER TABLE himoto.management_staff_attendance ENABLE ROW LEVEL SECURITY;

BEGIN;
SET LOCAL lock_timeout = '5s';
-- Registrations are planned work, not approved attendance or payroll.
CREATE TABLE IF NOT EXISTS himoto.staff_shift_registrations (
  staff_id bigint NOT NULL REFERENCES himoto.staff_profiles(id),
  work_date date NOT NULL CHECK (work_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  store_id bigint NOT NULL REFERENCES himoto.stores(id),
  shift_code text CHECK (shift_code IN ('S','G1','G2','G3','F','O','C','G1+G3')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by bigint NOT NULL REFERENCES himoto.users(id),
  updated_by bigint NOT NULL REFERENCES himoto.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, work_date)
);
CREATE INDEX IF NOT EXISTS staff_shift_registrations_month ON himoto.staff_shift_registrations(work_date, store_id);
CREATE TABLE IF NOT EXISTS himoto.staff_shift_registration_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id bigint NOT NULL,
  work_date date NOT NULL,
  store_id bigint NOT NULL,
  previous_code text,
  shift_code text,
  revision bigint NOT NULL,
  actor_id bigint NOT NULL REFERENCES himoto.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.staff_shift_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.staff_shift_registration_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.staff_shift_registrations, himoto.staff_shift_registration_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON himoto.staff_shift_registrations TO himoto_scoped;
GRANT INSERT ON himoto.staff_shift_registration_history TO himoto_scoped;
GRANT USAGE ON SEQUENCE himoto.staff_shift_registration_history_id_seq TO himoto_scoped;
DROP POLICY IF EXISTS shift_registration_scope ON himoto.staff_shift_registrations;
CREATE POLICY shift_registration_scope ON himoto.staff_shift_registrations TO himoto_scoped
  USING (current_setting('himoto.operation',true)='duty_roster' AND himoto.access_store(store_id))
  WITH CHECK (current_setting('himoto.operation',true)='duty_roster' AND himoto.access_store(store_id));
DROP POLICY IF EXISTS shift_registration_history_insert ON himoto.staff_shift_registration_history;
CREATE POLICY shift_registration_history_insert ON himoto.staff_shift_registration_history FOR INSERT TO himoto_scoped
  WITH CHECK (current_setting('himoto.operation',true)='duty_roster' AND himoto.access_store(store_id) AND actor_id=himoto.access_actor());
COMMIT;

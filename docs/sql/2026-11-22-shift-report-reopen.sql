BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_shift_reports ADD COLUMN IF NOT EXISTS reopen_request jsonb;
ALTER TABLE himoto.management_report_deliveries
  ADD COLUMN IF NOT EXISTS delivery_target jsonb,
  ADD COLUMN IF NOT EXISTS suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retracted_at timestamptz;

CREATE TABLE IF NOT EXISTS himoto.management_shift_report_revisions (
  report_id bigint NOT NULL REFERENCES himoto.management_shift_reports(id),
  revision integer NOT NULL,
  store_id bigint NOT NULL REFERENCES himoto.stores(id),
  request_id uuid NOT NULL UNIQUE,
  actor_id bigint NOT NULL REFERENCES himoto.users(id),
  reason text NOT NULL,
  manual_retraction boolean NOT NULL,
  reopened_at timestamptz NOT NULL DEFAULT now(),
  report jsonb NOT NULL,
  audit jsonb,
  PRIMARY KEY(report_id,revision)
);
ALTER TABLE himoto.management_shift_report_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_shift_report_revisions FROM PUBLIC,anon,authenticated,himoto_scoped;
DROP POLICY IF EXISTS shift_revision_scope ON himoto.management_shift_report_revisions;
CREATE POLICY shift_revision_scope ON himoto.management_shift_report_revisions FOR SELECT TO himoto_scoped
  USING(himoto.access_store(store_id));
GRANT SELECT ON himoto.management_shift_report_revisions TO himoto_scoped;
COMMIT;

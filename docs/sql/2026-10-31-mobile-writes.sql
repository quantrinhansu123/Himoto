-- Apply after mobile-sessions.sql, as DB owner. No operational rows are changed.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_requests (
  user_id bigint NOT NULL REFERENCES himoto.users(id),
  request_id uuid NOT NULL,
  operation varchar(64) NOT NULL,
  fingerprint char(64) NOT NULL,
  resource_id bigint,
  resource_revision varchar(32),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,request_id)
);
ALTER TABLE himoto.management_mobile_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON himoto.management_mobile_requests TO himoto_scoped;
DROP POLICY IF EXISTS mobile_requests_actor ON himoto.management_mobile_requests;
CREATE POLICY mobile_requests_actor ON himoto.management_mobile_requests FOR ALL TO himoto_scoped
  USING (user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK (user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint);
CREATE INDEX IF NOT EXISTS management_mobile_requests_created_idx ON himoto.management_mobile_requests(created_at);
COMMIT;

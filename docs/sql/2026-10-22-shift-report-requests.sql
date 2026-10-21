BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_shift_requests (
  request_id uuid PRIMARY KEY,
  store_id bigint NOT NULL REFERENCES himoto.stores(id),
  created_by bigint NOT NULL REFERENCES himoto.users(id),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.management_shift_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_request_scope ON himoto.management_shift_requests;
CREATE POLICY shift_request_scope ON himoto.management_shift_requests TO himoto_scoped
  USING (current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint)
  WITH CHECK (current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
REVOKE ALL ON himoto.management_shift_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON himoto.management_shift_requests TO himoto_scoped;
COMMIT;

-- Offline/staging first. Do not apply against the legacy mobile schema directly.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_gps_mappings (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  device_id bigint NOT NULL CHECK(device_id>0),
  proof jsonb NOT NULL CHECK(jsonb_typeof(proof)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id)
);
ALTER TABLE himoto.management_mobile_gps_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_gps_mappings FROM PUBLIC,anon,authenticated;
-- Only the canonical server-verified administrator reaches the owner connection.
-- No scoped client needs privileges or policies on this administrator receipt table.
REVOKE ALL ON himoto.management_mobile_gps_mappings FROM himoto_scoped;
COMMIT;

-- Apply as owner after mobile-writes, global-vehicle-transfers and transfer-cancel.
-- Append-only original proof; preserve actor/key tombstones and acknowledgements.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_vehicle_transfers (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  vehicle_id bigint NOT NULL REFERENCES himoto.vehicles(id),
  proof jsonb NOT NULL CHECK(jsonb_typeof(proof)='object' AND octet_length(proof::text)<=65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id)
);
ALTER TABLE himoto.management_mobile_vehicle_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_vehicle_transfers FROM PUBLIC,anon,authenticated;
REVOKE ALL ON himoto.management_mobile_vehicle_transfers FROM himoto_scoped;
GRANT SELECT,INSERT ON himoto.management_mobile_vehicle_transfers TO himoto_scoped;
DROP POLICY IF EXISTS mobile_vehicle_transfers_actor ON himoto.management_mobile_vehicle_transfers;
CREATE POLICY mobile_vehicle_transfers_actor ON himoto.management_mobile_vehicle_transfers TO himoto_scoped
  USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint AND
    EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=vehicle_id AND v.deleted_at IS NULL));
CREATE INDEX IF NOT EXISTS management_mobile_vehicle_transfers_vehicle_idx ON himoto.management_mobile_vehicle_transfers(vehicle_id);
COMMIT;

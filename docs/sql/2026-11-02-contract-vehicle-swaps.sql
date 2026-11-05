-- Apply as schema owner after contract-vehicle-scope.sql and the existing swap
-- history table. Release status only; physical location never changes here.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION himoto.release_swapped_contract_vehicle(target bigint)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
DECLARE vehicle bigint;
BEGIN
  IF himoto.access_actor() IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  SELECT s.from_vehicle_id INTO vehicle FROM himoto.management_contract_vehicle_swaps s
    JOIN himoto.orders o ON o.id=s.order_id
    JOIN himoto.order_vehicle_details d ON d.id=s.order_item_id AND d.order_id=s.order_id
  WHERE s.id=target AND s.actor_id=himoto.access_actor() AND s.from_vehicle_id<>s.to_vehicle_id
    AND himoto.access_order_store(o.store_id) AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
    AND o.order_status IN('renting','overdue','wait_payment')
    AND d.deleted_at IS NULL AND d.completed_at IS NULL AND d.vehicle_id=s.to_vehicle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'swap unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM himoto.vehicles v WHERE v.id=vehicle FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=vehicle AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
      AND o.order_status IN('renting','overdue','wait_payment','pending','deposit_contract','bad_debt')) THEN
    UPDATE himoto.vehicles SET status='ready',updated_at=now() WHERE id=vehicle AND deleted_at IS NULL AND status IN('using','rent');
  END IF;
END $$;
REVOKE ALL ON FUNCTION himoto.release_swapped_contract_vehicle(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.release_swapped_contract_vehicle(bigint) TO himoto_scoped;
COMMIT;

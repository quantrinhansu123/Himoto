-- Permit explicit physical recovery while keeping the old contract's bad debt.
-- Function definitions only; no contract, vehicle, payment or cashbook rows change.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION himoto.complete_contract_vehicle_return(target bigint, actual timestamptz)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
BEGIN
 IF himoto.access_actor() IS NULL OR actual IS NULL OR actual>now()+interval '5 minutes' THEN
   RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
 END IF;
 UPDATE himoto.order_vehicle_details d SET completed_at=actual,updated_at=now()
 FROM himoto.orders o WHERE d.id=target AND o.id=d.order_id AND himoto.access_store(o.store_id)
   AND o.deleted_at IS NULL AND d.deleted_at IS NULL AND d.completed_at IS NULL
   AND o.order_status IN('renting','overdue','wait_payment','bad_debt')
   AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
   AND (d.rent_at IS NULL OR actual>=d.rent_at);
 IF NOT FOUND THEN RAISE EXCEPTION 'rental line unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION himoto.complete_contract_vehicle_return(bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.complete_contract_vehicle_return(bigint,timestamptz) TO himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.release_returned_contract_vehicle(target bigint)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
DECLARE vehicle bigint;
BEGIN
 IF himoto.access_actor() IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 SELECT d.vehicle_id INTO vehicle FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
 WHERE d.id=target AND d.completed_at IS NOT NULL AND d.deleted_at IS NULL AND o.deleted_at IS NULL
   AND himoto.access_store(o.store_id) AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30';
 IF NOT FOUND THEN RAISE EXCEPTION 'rental line unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM himoto.vehicles v WHERE v.id=vehicle FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
   WHERE d.vehicle_id=vehicle AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
     AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
     AND o.order_status IN('renting','overdue','wait_payment','pending','bad_debt')) THEN
   UPDATE himoto.vehicles SET status='ready',updated_at=now() WHERE id=vehicle AND status IN('using','rent','bad_debt');
 END IF;
END $$;
REVOKE ALL ON FUNCTION himoto.release_returned_contract_vehicle(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.release_returned_contract_vehicle(bigint) TO himoto_scoped;
COMMIT;

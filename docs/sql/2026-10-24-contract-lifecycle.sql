-- Scoped, atomic vehicle handover for an existing reserved ownership contract.
-- Definitions only: no business rows or account grants change.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION himoto.resume_reserved_vehicles(contract bigint,targets bigint[],starts timestamptz,ends timestamptz)
RETURNS TABLE(item_id bigint,vehicle_id bigint) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
DECLARE result bigint; target bigint;
BEGIN
 IF himoto.access_actor() IS NULL OR starts IS NULL OR ends IS NULL OR starts>=ends OR starts>now()+interval '5 minutes'
   OR cardinality(targets) IS NULL OR cardinality(targets)<1 OR cardinality(targets)>20
   OR EXISTS(SELECT 1 FROM unnest(targets) t WHERE t IS NULL OR t<=0)
   OR cardinality(targets)<>(SELECT count(DISTINCT t) FROM unnest(targets) t) THEN
   RAISE EXCEPTION 'invalid resume request' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM himoto.orders o JOIN himoto.stores s ON s.id=o.store_id
 WHERE o.id=contract AND o.deleted_at IS NULL AND o.order_status='reserved' AND himoto.access_store(o.store_id)
   AND (s.kind='lease_to_own' OR COALESCE(NULLIF(o.order_type,''),o.draft_payload #>> '{management_composer,rental_type}') IN('ownership','ownership_cd'))
   AND o.draft_payload #> '{management_composer,lifecycle,active_hold}' IS NOT NULL
   AND cardinality(targets)=jsonb_array_length(o.draft_payload::jsonb #> '{management_composer,lifecycle,active_hold,vehicle_ids}')
   AND starts>((o.draft_payload #>> '{management_composer,lifecycle,active_hold,at}')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
   AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
   AND NOT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL AND d.completed_at IS NULL)
 FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'reserved contract unavailable' USING ERRCODE='42501'; END IF;
 FOR target IN SELECT t FROM unnest(targets) t ORDER BY t LOOP
 PERFORM 1 FROM himoto.vehicles v WHERE v.id=target AND v.deleted_at IS NULL AND v.status='ready' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'vehicle not ready'; END IF;
 IF EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
   WHERE d.vehicle_id=target AND d.order_id<>contract AND d.deleted_at IS NULL AND o.deleted_at IS NULL
     AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
     AND o.order_status NOT IN('draft','cancelled')
     AND ((d.completed_at IS NULL AND o.order_status IN('renting','overdue','wait_payment','pending','deposit_contract','bad_debt'))
       OR (d.rent_at<ends AND COALESCE(d.completed_at,d.return_at)>starts))) THEN RAISE EXCEPTION 'vehicle rental conflict'; END IF;
 INSERT INTO himoto.order_vehicle_details(vehicle_id,order_id,price_id,borrow_hats,borrow_raincoats,rent_at,return_at,total_money,hiring_fee,status,type,handler_price,total_renewal_amount,created_at,updated_at)
 VALUES(target,contract,0,0,0,starts,ends,0,0,1,'monthly',0,0,now(),now()) RETURNING id INTO result;
 UPDATE himoto.vehicles SET status='using',updated_at=now() WHERE id=target;
 RETURN QUERY SELECT result,target;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION himoto.resume_reserved_vehicles(bigint,bigint[],timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.resume_reserved_vehicles(bigint,bigint[],timestamptz,timestamptz) TO himoto_scoped;
COMMIT;

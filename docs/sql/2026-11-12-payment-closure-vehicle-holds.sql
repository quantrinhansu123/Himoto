-- Closed agreements may still hold vehicles. Never release or rebook those lines
-- until physical return is recorded. Definitions retain existing scope checks.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION himoto.vehicle_rental_sources(targets bigint[])
 RETURNS TABLE(vehicle_id bigint, store_id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  SELECT DISTINCT ON (d.vehicle_id) d.vehicle_id::bigint, o.store_id::bigint
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id=d.order_id
  WHERE d.vehicle_id=ANY(targets)
    AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
    AND (o.order_status IN ('renting','overdue','wait_payment','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))
  ORDER BY d.vehicle_id, d.rent_at DESC NULLS LAST, d.id DESC
$function$;

CREATE OR REPLACE FUNCTION himoto.vehicle_has_open_rental(target bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  SELECT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=target AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
      AND (o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL)))
$function$;

CREATE OR REPLACE FUNCTION himoto.vehicle_has_other_rental(target bigint, excluded_order bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  SELECT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=target AND d.order_id IS DISTINCT FROM excluded_order
      AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
      AND (o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL)))
$function$;

CREATE OR REPLACE FUNCTION himoto.vehicle_other_rental_conflicts(targets bigint[], excluded_order bigint)
 RETURNS TABLE(license text, code text, store_name text, manager_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  SELECT DISTINCT v.license::text,
    COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text)::text,
    COALESCE(s.store_name,'')::text,
    COALESCE((SELECT sp.full_name FROM himoto.staff_profiles sp WHERE sp.user_id=o.contract_responsible_user_id
      ORDER BY CASE WHEN sp.store_id=o.store_id THEN 0 ELSE 1 END,sp.id LIMIT 1),cu.name,mu.name,'')::text
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id=d.order_id
  JOIN himoto.vehicles v ON v.id=d.vehicle_id
  LEFT JOIN himoto.stores s ON s.id=o.store_id
  LEFT JOIN himoto.users cu ON cu.id=o.contract_responsible_user_id
  LEFT JOIN himoto.users mu ON mu.id=s.user_id
  WHERE d.vehicle_id=ANY(targets) AND d.order_id IS DISTINCT FROM excluded_order
    AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
    AND (o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))
  ORDER BY 1,2
$function$;

CREATE OR REPLACE FUNCTION himoto.vehicle_history_conflict_ids(targets bigint[], target_order bigint, period_start timestamp with time zone, actual_end timestamp with time zone)
 RETURNS TABLE(vehicle_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
BEGIN
  IF himoto.access_actor() IS NULL OR period_start IS NULL OR actual_end IS NULL OR actual_end < period_start THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
  END IF;
  -- HĐ nháp nhập lịch sử: không cho ngày kết thúc xa hơn hiện tại (+5 phút).
  -- HĐ đang thuê / chờ tất toán: cho phép hẹn trả trong tương lai khi sửa ngày thuê.
  IF NOT EXISTS (
    SELECT 1 FROM himoto.orders o
    WHERE o.id = target_order AND o.deleted_at IS NULL AND himoto.access_store(o.store_id)
      AND (
        (o.order_status = 'draft' AND actual_end <= now() + interval '5 minutes')
        OR (o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))
      )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
  END IF;
  -- Nháp nhập lịch sử: đối chiếu cả HĐ đã hoàn thành.
  -- HĐ đang thuê sửa ngày: chỉ chặn chồng với lượt còn mở (không xét lại lịch sử đã trả).
  RETURN QUERY SELECT DISTINCT d.vehicle_id::bigint
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id = d.order_id
  WHERE d.vehicle_id = ANY(targets) AND d.order_id <> target_order AND d.deleted_at IS NULL AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}', '') <> '30'
    AND (
      (
        EXISTS (SELECT 1 FROM himoto.orders cur WHERE cur.id = target_order AND cur.order_status = 'draft')
        AND o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'bad_debt', 'completed', 'deposit_contract', 'draft')
      )
      OR (
        EXISTS (SELECT 1 FROM himoto.orders cur WHERE cur.id = target_order AND cur.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract'))
        AND (o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract', 'draft') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))
        AND d.completed_at IS NULL
      )
    )
    AND COALESCE(d.rent_at, o.rent_at, '-infinity'::timestamptz) < actual_end
    AND COALESCE(
      d.completed_at,
      CASE WHEN o.order_status = 'completed' THEN COALESCE(d.return_at, o.return_at) END,
      d.return_at,
      'infinity'::timestamptz
    ) > period_start;
END $function$;

CREATE OR REPLACE FUNCTION himoto.vehicle_rental_blockers(targets bigint[])
 RETURNS TABLE(vehicle_id bigint, order_id bigint, code text, status text, store_name text, rent_at timestamp with time zone, return_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  SELECT d.vehicle_id::bigint, o.id::bigint,
    COALESCE(NULLIF(o.contract_number,''), NULLIF(o.draft_reference,''), '#'||o.id::text)::text,
    CASE WHEN o.order_status='renting' AND d.return_at<now() THEN 'overdue' ELSE o.order_status END::text,
    COALESCE(s.store_name,'')::text, d.rent_at::timestamptz, d.return_at::timestamptz
  FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
  LEFT JOIN himoto.stores s ON s.id=o.store_id
  WHERE d.vehicle_id=ANY(targets) AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
    AND (o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))
  ORDER BY d.vehicle_id, d.rent_at DESC, d.id DESC
$function$;

CREATE OR REPLACE FUNCTION himoto.vehicle_window_conflicts(targets bigint[], excluded_order bigint, proposed_start timestamp with time zone, proposed_end timestamp with time zone)
 RETURNS TABLE(license text, code text, store_name text, manager_name text, status text, rent_at timestamp with time zone, return_at timestamp with time zone, severity text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  SELECT DISTINCT ON (v.license, o.id)
    v.license::text,
    COALESCE(NULLIF(o.contract_number,''), NULLIF(o.draft_reference,''), '#' || o.id::text)::text AS code,
    COALESCE(s.store_name, '')::text AS store_name,
    COALESCE(
      (SELECT sp.full_name FROM himoto.staff_profiles sp
        WHERE sp.user_id=o.contract_responsible_user_id
        ORDER BY CASE WHEN sp.store_id=o.store_id THEN 0 ELSE 1 END, sp.id LIMIT 1),
      cu.name, mu.name, ''
    )::text AS manager_name,
    CASE WHEN o.order_status='renting' AND d.return_at<now() THEN 'overdue' ELSE o.order_status END::text AS status,
    d.rent_at::timestamptz, d.return_at::timestamptz,
    CASE WHEN o.order_status='deposit_contract' THEN 'reservation_overlap' ELSE 'hard' END::text AS severity
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id=d.order_id
  JOIN himoto.vehicles v ON v.id=d.vehicle_id
  LEFT JOIN himoto.stores s ON s.id=o.store_id
  LEFT JOIN himoto.users cu ON cu.id=o.contract_responsible_user_id
  LEFT JOIN himoto.users mu ON mu.id=s.user_id
  WHERE d.vehicle_id = ANY(targets)
    AND d.order_id IS DISTINCT FROM excluded_order
    AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
    AND (
      (o.order_status IN ('renting','overdue','wait_payment','pending','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))
      OR (
        o.order_status = 'deposit_contract'
        AND proposed_end IS NOT NULL
        AND d.rent_at IS NOT NULL
        AND proposed_end > d.rent_at
      )
    )
  ORDER BY v.license, o.id, d.rent_at DESC, d.id DESC
$function$;

CREATE OR REPLACE FUNCTION himoto.vehicle_inventory()
 RETURNS TABLE(id bigint, name text, license text, type text, status text, store_id bigint, store_name text, from_store_name text, to_store_name text, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  WITH blocked AS MATERIALIZED (SELECT DISTINCT d.vehicle_id FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30' AND (o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL)))
  SELECT v.id::bigint,v.name::text,v.license::text,v.type::text,v.status::text,COALESCE(v.current_store_id,v.store_id)::bigint,s.store_name::text,
    fs.store_name::text,ts.store_name::text,(v.status='ready' AND blocked.vehicle_id IS NULL)
  FROM (SELECT * FROM himoto.vehicles WHERE deleted_at IS NULL) v LEFT JOIN blocked ON blocked.vehicle_id=v.id LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
  LEFT JOIN LATERAL (SELECT e.from_store_id,e.to_store_id FROM himoto.vehicle_location_events e
    WHERE e.vehicle_id=v.id AND e.event_type IN ('manual_transfer','transfer_dispatch') ORDER BY e.id DESC LIMIT 1) transfer ON v.status='in_transit'
  LEFT JOIN himoto.stores fs ON fs.id=transfer.from_store_id LEFT JOIN himoto.stores ts ON ts.id=transfer.to_store_id
  ORDER BY s.store_name,v.license,v.id
$function$;

CREATE OR REPLACE FUNCTION himoto.complete_contract_vehicle_return(target bigint, actual timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
BEGIN
 IF himoto.access_actor() IS NULL OR actual IS NULL OR actual>now()+interval '5 minutes' THEN
   RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
 END IF;
 UPDATE himoto.order_vehicle_details d SET completed_at=actual,updated_at=now()
 FROM himoto.orders o WHERE d.id=target AND o.id=d.order_id AND himoto.access_order_store(o.store_id)
   AND o.deleted_at IS NULL AND d.deleted_at IS NULL AND d.completed_at IS NULL
   AND (o.order_status IN('renting','overdue','wait_payment','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))
   AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
   AND (d.rent_at IS NULL OR actual>=d.rent_at);
 IF NOT FOUND THEN RAISE EXCEPTION 'rental line unavailable' USING ERRCODE='42501'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION himoto.release_swapped_contract_vehicle(target bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
DECLARE vehicle bigint;
BEGIN
  IF himoto.access_actor() IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  SELECT s.from_vehicle_id INTO vehicle FROM himoto.management_contract_vehicle_swaps s
    JOIN himoto.orders o ON o.id=s.order_id
    JOIN himoto.order_vehicle_details d ON d.id=s.order_item_id AND d.order_id=s.order_id
  WHERE s.id=target AND s.actor_id=himoto.access_actor() AND s.from_vehicle_id<>s.to_vehicle_id
    AND himoto.access_order_store(o.store_id) AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
    AND (o.order_status IN('renting','overdue','wait_payment') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))
    AND d.deleted_at IS NULL AND d.completed_at IS NULL AND d.vehicle_id=s.to_vehicle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'swap unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM himoto.vehicles v WHERE v.id=vehicle FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=vehicle AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
      AND (o.order_status IN('renting','overdue','wait_payment','pending','deposit_contract','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))) THEN
    UPDATE himoto.vehicles SET status='ready',updated_at=now() WHERE id=vehicle AND deleted_at IS NULL AND status IN('using','rent');
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION himoto.correct_returned_contract_time(target bigint, actual timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
DECLARE vehicle bigint; previous timestamptz;
BEGIN
 IF himoto.access_actor() IS NULL OR actual IS NULL OR actual>now()+interval '5 minutes' THEN
   RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
 END IF;
 SELECT d.vehicle_id,d.completed_at INTO vehicle,previous FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
 WHERE d.id=target AND d.deleted_at IS NULL AND d.completed_at IS NOT NULL AND o.deleted_at IS NULL AND himoto.access_store(o.store_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'returned line unavailable' USING ERRCODE='42501'; END IF;
 -- Look across branches: a corrected time cannot overlap a later handover.
 PERFORM 1 FROM himoto.vehicles v WHERE v.id=vehicle FOR UPDATE;
 IF actual>previous AND EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
   WHERE d.vehicle_id=vehicle AND d.id<>target AND d.deleted_at IS NULL AND o.deleted_at IS NULL
     AND o.order_status NOT IN('draft','cancelled') AND d.rent_at>=previous AND d.rent_at<actual) THEN
   RAISE EXCEPTION 'return overlaps subsequent handover' USING ERRCODE='22023';
 END IF;
 UPDATE himoto.order_vehicle_details d SET completed_at=actual,updated_at=now()
 FROM himoto.orders o WHERE d.id=target AND o.id=d.order_id AND himoto.access_store(o.store_id)
   AND o.deleted_at IS NULL AND d.deleted_at IS NULL AND d.completed_at IS NOT NULL
   AND o.order_status IN('renting','overdue','wait_payment','completed')
   AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
   AND (d.rent_at IS NULL OR actual>=d.rent_at);
 IF NOT FOUND THEN RAISE EXCEPTION 'returned line unavailable' USING ERRCODE='42501'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION himoto.resume_reserved_vehicles(contract bigint, targets bigint[], starts timestamp with time zone, ends timestamp with time zone)
 RETURNS TABLE(item_id bigint, vehicle_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
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
     AND ((d.completed_at IS NULL AND (o.order_status IN('renting','overdue','wait_payment','pending','deposit_contract','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL)))
       OR (d.rent_at<ends AND COALESCE(d.completed_at,d.return_at)>starts))) THEN RAISE EXCEPTION 'vehicle rental conflict'; END IF;
 INSERT INTO himoto.order_vehicle_details(vehicle_id,order_id,price_id,borrow_hats,borrow_raincoats,rent_at,return_at,total_money,hiring_fee,status,type,handler_price,total_renewal_amount,created_at,updated_at)
 VALUES(target,contract,0,0,0,starts,ends,0,0,1,'monthly',0,0,now(),now()) RETURNING id INTO result;
 UPDATE himoto.vehicles SET status='using',updated_at=now() WHERE id=target;
 RETURN QUERY SELECT result,target;
 END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION himoto.release_returned_contract_vehicle(target bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
DECLARE vehicle bigint;
BEGIN
 IF himoto.access_actor() IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 SELECT d.vehicle_id INTO vehicle FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
 WHERE d.id=target AND d.completed_at IS NOT NULL AND d.deleted_at IS NULL AND o.deleted_at IS NULL
   AND himoto.access_order_store(o.store_id) AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30';
 IF NOT FOUND THEN RAISE EXCEPTION 'rental line unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM himoto.vehicles v WHERE v.id=vehicle FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
   WHERE d.vehicle_id=vehicle AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
     AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
     AND (o.order_status IN('renting','overdue','wait_payment','pending','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL))) THEN
   UPDATE himoto.vehicles SET status='ready',updated_at=now() WHERE id=vehicle AND status IN('using','rent','bad_debt');
 END IF;
END $function$;

COMMIT;

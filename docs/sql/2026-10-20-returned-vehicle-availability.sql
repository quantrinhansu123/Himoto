-- Returned rental lines do not occupy stock while the contract awaits settlement.
-- Preserve existing function signatures and grants. No contract, vehicle or financial rows change.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION himoto.vehicle_inventory()
 RETURNS TABLE(id bigint, name text, license text, type text, status text, store_id bigint, store_name text, from_store_name text, to_store_name text, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  WITH blocked AS MATERIALIZED (SELECT DISTINCT d.vehicle_id FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30' AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt'))
  SELECT v.id::bigint,v.name::text,v.license::text,v.type::text,v.status::text,COALESCE(v.current_store_id,v.store_id)::bigint,s.store_name::text,
    fs.store_name::text,ts.store_name::text,(v.status='ready' AND blocked.vehicle_id IS NULL)
  FROM himoto.vehicles v LEFT JOIN blocked ON blocked.vehicle_id=v.id LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
  LEFT JOIN LATERAL (SELECT e.from_store_id,e.to_store_id FROM himoto.vehicle_location_events e
    WHERE e.vehicle_id=v.id AND e.event_type IN ('manual_transfer','transfer_dispatch') ORDER BY e.id DESC LIMIT 1) transfer ON v.status='in_transit'
  LEFT JOIN himoto.stores fs ON fs.id=transfer.from_store_id LEFT JOIN himoto.stores ts ON ts.id=transfer.to_store_id
  ORDER BY s.store_name,v.license,v.id
$function$
;

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
    AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt')
  ORDER BY d.vehicle_id, d.rent_at DESC, d.id DESC
$function$
;

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
      o.order_status IN ('renting','overdue','wait_payment','pending','bad_debt')
      OR (
        o.order_status = 'deposit_contract'
        AND proposed_end IS NOT NULL
        AND d.rent_at IS NOT NULL
        AND proposed_end > d.rent_at
      )
    )
  ORDER BY v.license, o.id, d.rent_at DESC, d.id DESC
$function$
;

COMMIT;

BEGIN;
SET LOCAL lock_timeout='5s';

-- Picker blockers include rent_at so UI can allow squeeze-in before a reserved pickup.
DROP FUNCTION IF EXISTS himoto.vehicle_rental_blockers(bigint[]);
CREATE FUNCTION himoto.vehicle_rental_blockers(targets bigint[])
RETURNS TABLE(vehicle_id bigint, order_id bigint, code text, status text, store_name text, rent_at timestamptz, return_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
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
$$;
REVOKE ALL ON FUNCTION himoto.vehicle_rental_blockers(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_rental_blockers(bigint[]) TO himoto_scoped;

-- Time-aware conflicts for finalize.
-- hard: open rental / settlement statuses.
-- reservation_overlap: deposit_contract whose pickup is before the proposed return (chen đè ngày nhận).
-- No row when only a deposit exists and proposed_end <= that deposit's rent_at (chen trước ngày nhận → cho phép).
CREATE OR REPLACE FUNCTION himoto.vehicle_window_conflicts(
  targets bigint[], excluded_order bigint,
  proposed_start timestamptz, proposed_end timestamptz
) RETURNS TABLE(
  license text, code text, store_name text, manager_name text,
  status text, rent_at timestamptz, return_at timestamptz, severity text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
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
$$;
REVOKE ALL ON FUNCTION himoto.vehicle_window_conflicts(bigint[],bigint,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_window_conflicts(bigint[],bigint,timestamptz,timestamptz) TO himoto_scoped;

COMMIT;

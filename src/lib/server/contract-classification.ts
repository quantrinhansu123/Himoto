import 'server-only';

// Legacy store 30 contained battery rentals. Its orders remain as receipt/history
// anchors after import into battery_contracts; they never represent vehicle hire.
// A native vehicle order linked to a battery contract is still a vehicle order.
export const VEHICLE_ORDER_SQL = `COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'`;

// The old app used generic `rental` for ownership agreements from source store
// 29. Preserve that provenance after import; current store and duration alone
// do not determine the agreement type. An explicit new-app choice wins.
export const EFFECTIVE_RENTAL_TYPE_SQL = `COALESCE(
  NULLIF(o.draft_payload #>> '{management_composer,rental_type}',''),
  CASE WHEN o.draft_payload #>> '{legacy_migration,sourceStoreId}'='29'
    AND COALESCE(o.order_type,'') IN ('','rental') THEN 'ownership' END,
  NULLIF(o.order_type,''),'')`;

// Minimal provenance for staff-facing review notes; never send the import blob.
export const CONTRACT_REVIEW_SQL = `o.draft_payload #>> '{legacy_migration,sourceStoreId}' AS legacy_source_store_id,
  (o.draft_payload #>> '{legacy_migration,sourceStoreId}'='29'
    AND COALESCE(o.order_type,'') IN ('','rental')
    AND NULLIF(o.draft_payload #>> '{management_composer,rental_type}','') IS NULL) AS legacy_inferred_ownership`;

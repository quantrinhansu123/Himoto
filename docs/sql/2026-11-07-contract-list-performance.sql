-- Run outside a transaction. Matches the vehicle-order predicate exactly so
-- counting live contracts can use an index instead of reading every JSON blob.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_vehicle_list_id
ON himoto.orders (id DESC)
WHERE deleted_at IS NULL
  AND COALESCE(draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_vehicle_list_store_status
ON himoto.orders (store_id, order_status, id DESC)
WHERE deleted_at IS NULL
  AND COALESCE(draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30';

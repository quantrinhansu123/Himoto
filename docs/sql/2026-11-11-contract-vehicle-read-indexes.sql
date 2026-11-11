-- Run each statement outside a transaction. These covering indexes keep the
-- existing RLS predicates/helpers unchanged and avoid reading order JSON heaps
-- just to resolve vehicle labels and inventory availability.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_live_store_id_cover
ON himoto.orders (store_id, id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_vehicle_live_order_vehicle_cover
ON himoto.order_vehicle_details (order_id, vehicle_id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_inventory_blocking_cover
ON himoto.orders (id)
WHERE deleted_at IS NULL
  AND COALESCE(draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
  AND order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_vehicle_unreturned_vehicle_order_cover
ON himoto.order_vehicle_details (vehicle_id, order_id)
WHERE deleted_at IS NULL AND completed_at IS NULL;

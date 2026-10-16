-- Speed up CONTRACT_LIST_SQL laterals and scoped filters.
CREATE INDEX IF NOT EXISTS idx_orders_list_id
  ON himoto.orders (id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_list_status
  ON himoto.orders (order_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_list_store
  ON himoto.orders (store_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_order_approved
  ON himoto.transactions (order_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_order_vehicle_details_order_open
  ON himoto.order_vehicle_details (order_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_store
  ON himoto.staff_profiles (user_id, store_id);

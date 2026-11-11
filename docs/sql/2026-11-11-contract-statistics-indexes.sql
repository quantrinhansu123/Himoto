-- Run outside a transaction. Match both sides of fastContractStatistics so
-- closed-history counters never fetch toasted draft_payload or rental lines.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_statistics_closed_cover
ON himoto.orders (store_id,id) INCLUDE (order_status,customer_id,total)
WHERE deleted_at IS NULL
  AND COALESCE(draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
  AND NOT (order_status IN ('draft','renting','overdue','wait_payment','reserved','bad_debt')
    OR draft_payload #> '{management_composer,installment_plan}' IS NOT NULL
    OR NOT (total IS NULL OR total='' OR total ~ '^[0-9]{1,13}$'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_blacklist_id_cover
ON himoto.customers (id) WHERE status=2;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_statistics_detail_cover
ON himoto.orders (store_id,id)
WHERE deleted_at IS NULL
  AND COALESCE(draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
  AND (order_status IN ('draft','renting','overdue','wait_payment','reserved','bad_debt')
    OR draft_payload #> '{management_composer,installment_plan}' IS NOT NULL
    OR NOT (total IS NULL OR total='' OR total ~ '^[0-9]{1,13}$'));

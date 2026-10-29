import 'server-only';
import { usesScopedDatabase } from './access-context';

// Inventory already exposes stock locations across branches. Contract/customer
// reads retain their own RLS scope; this adds no contract or financial access.
function warehouseSource(scoped:boolean) {
  return scoped?'(SELECT id,store_id,store_name FROM himoto.vehicle_inventory())':`(SELECT stock.id,COALESCE(stock.current_store_id,stock.store_id) AS store_id,stores.store_name
    FROM himoto.vehicles stock LEFT JOIN himoto.stores stores ON stores.id=COALESCE(stock.current_store_id,stock.store_id))`;
}
export const CONTRACT_WAREHOUSE_JOIN_SQL=`LEFT JOIN ${warehouseSource(false)} warehouse ON warehouse.id=d.vehicle_id`;
export function contractWarehouseJoinSql(){return `LEFT JOIN ${warehouseSource(usesScopedDatabase())} warehouse ON warehouse.id=d.vehicle_id`;}
export function contractWarehouseStoreSql(store:string) {
  if(store==='all')return '';
  const id=Number(store);
  // Show contracts owned by this branch (customer source) or with stock currently here.
  return ` AND (o.store_id=${id}
    OR EXISTS (SELECT 1 FROM himoto.order_vehicle_details stock_line
    JOIN ${warehouseSource(usesScopedDatabase())} warehouse ON warehouse.id=stock_line.vehicle_id
    WHERE stock_line.order_id=o.id AND stock_line.deleted_at IS NULL AND warehouse.store_id=${id}
      AND (stock_line.completed_at IS NULL OR NOT EXISTS (SELECT 1 FROM himoto.order_vehicle_details active_line
        WHERE active_line.order_id=o.id AND active_line.deleted_at IS NULL AND active_line.completed_at IS NULL)))
    OR (o.order_status='draft' AND NOT EXISTS (SELECT 1 FROM himoto.order_vehicle_details existing_line WHERE existing_line.order_id=o.id AND existing_line.deleted_at IS NULL)
      AND COALESCE(o.draft_payload #>> '{management_composer,profile,vehicle_store_id}',o.draft_payload #>> '{management_composer,draft,vehicle_store_id}','')='${id}'))`;
}

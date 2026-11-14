import 'server-only';
import { usesScopedDatabase } from './access-context';
import {CONTRACT_WAREHOUSE_JOIN_SQL,contractWarehouseJoinSql} from './contract-warehouses';

// Orders/lines retain their RLS scope. Shared inventory supplies only vehicle
// labels when the stock is managed by another branch; it grants no vehicle writes.
export function contractVehicleReadSource() {
  return usesScopedDatabase() ? 'himoto.vehicle_inventory()' : 'himoto.vehicles';
}

/** Labels for vehicles on in-scope contracts, including stock that already returned to another branch. */
export function contractVehicleLabelSource(orderIdsSql?:string) {
  if(!usesScopedDatabase())return 'himoto.vehicles';
  return orderIdsSql?`(SELECT id,name,license,brand,type,year,color,store_id FROM himoto.contract_vehicles_for_orders(${orderIdsSql}))`:'himoto.contract_vehicle_labels()';
}

// List/search/detail reads need the same labels even when physical stock is foreign.
// The helper is restricted to vehicles attached to contracts in the caller's scope.
export function contractVehicleDetailsSql(sql: string,orderIdsSql?:string) {
  if(!usesScopedDatabase())return sql;
  // A correlated vehicle aggregate runs once per order. Calling the scoped
  // label helper inside it used to scan every permitted vehicle twice per row.
  // Materialize the same permission-filtered labels once for the whole read.
  const labels='contract_read_vehicle_labels',warehouses='contract_read_warehouses';
  let rewritten=sql.replaceAll('LEFT JOIN himoto.vehicles v ON v.id = d.vehicle_id',`LEFT JOIN ${labels} v ON v.id = d.vehicle_id`)
    .replaceAll('himoto.contract_vehicle_labels()',labels)
    .replaceAll(CONTRACT_WAREHOUSE_JOIN_SQL,`LEFT JOIN ${warehouses} warehouse ON warehouse.id=d.vehicle_id`)
    .replaceAll(contractWarehouseJoinSql(),`LEFT JOIN ${warehouses} warehouse ON warehouse.id=d.vehicle_id`);
  const sources=[];
  // orderIdsSql is a trusted SQL parameter expression supplied by the caller,
  // after search/filter/pagination. Never interpolate raw request values here.
  const bounded='contract_read_requested_vehicles';
  if(orderIdsSql&&(rewritten.includes(labels)||rewritten.includes(warehouses)))sources.push(`${bounded} AS MATERIALIZED (SELECT * FROM himoto.contract_vehicles_for_orders(${orderIdsSql}))`);
  if(rewritten.includes(labels))sources.push(`${labels} AS MATERIALIZED (SELECT ${orderIdsSql?'id,name,license,brand,type,year,color,store_id FROM '+bounded:'* FROM himoto.contract_vehicle_labels()'})`);
  if(rewritten.includes(warehouses))sources.push(`${warehouses} AS MATERIALIZED (SELECT ${orderIdsSql?'warehouse_id AS id,warehouse_store_id AS store_id,warehouse_store_name AS store_name FROM '+bounded+' WHERE warehouse_id IS NOT NULL':'id,store_id,store_name FROM himoto.contract_vehicle_locations()'})`);
  if(!sources.length)return sql;
  rewritten=`WITH ${sources.join(', ')} ${rewritten}`;
  return rewritten;
}

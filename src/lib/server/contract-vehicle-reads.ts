import 'server-only';
import { usesScopedDatabase } from './access-context';
import {CONTRACT_WAREHOUSE_JOIN_SQL,contractWarehouseJoinSql} from './contract-warehouses';

// Orders/lines retain their RLS scope. Shared inventory supplies only vehicle
// labels when the stock is managed by another branch; it grants no vehicle writes.
export function contractVehicleReadSource() {
  return usesScopedDatabase() ? 'himoto.vehicle_inventory()' : 'himoto.vehicles';
}

/** Labels for vehicles on in-scope contracts, including stock that already returned to another branch. */
export function contractVehicleLabelSource() {
  return usesScopedDatabase() ? 'himoto.contract_vehicle_labels()' : 'himoto.vehicles';
}

// List/search/detail reads need the same labels even when physical stock is foreign.
// The helper is restricted to vehicles attached to contracts in the caller's scope.
export function contractVehicleDetailsSql(sql: string) {
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
  if(rewritten.includes(labels))sources.push(`${labels} AS MATERIALIZED (SELECT * FROM himoto.contract_vehicle_labels())`);
  if(rewritten.includes(warehouses))sources.push(`${warehouses} AS MATERIALIZED (SELECT id,store_id,store_name FROM himoto.vehicle_inventory())`);
  if(!sources.length)return sql;
  rewritten=`WITH ${sources.join(', ')} ${rewritten}`;
  return rewritten;
}

import 'server-only';
import { usesScopedDatabase } from './access-context';

// Orders/lines retain their RLS scope. Shared inventory supplies only vehicle
// labels when the stock is managed by another branch; it grants no vehicle writes.
export function contractVehicleReadSource() {
  return usesScopedDatabase() ? 'himoto.vehicle_inventory()' : 'himoto.vehicles';
}

// List/search/detail reads need the same labels even when physical stock is foreign.
// The helper is restricted to vehicles attached to contracts in the caller's scope.
export function contractVehicleDetailsSql(sql: string) {
  return usesScopedDatabase()
    ? sql.replaceAll('LEFT JOIN himoto.vehicles v ON v.id = d.vehicle_id', 'LEFT JOIN himoto.contract_vehicle_labels() v ON v.id = d.vehicle_id')
    : sql;
}

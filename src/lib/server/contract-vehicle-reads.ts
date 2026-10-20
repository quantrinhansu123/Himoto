import 'server-only';
import { usesScopedDatabase } from './access-context';

// Orders/lines retain their RLS scope. Shared inventory supplies only vehicle
// labels when the stock is managed by another branch; it grants no vehicle writes.
export function contractVehicleReadSource() {
  return usesScopedDatabase() ? 'himoto.vehicle_inventory()' : 'himoto.vehicles';
}

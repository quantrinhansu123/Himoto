import 'server-only';
import type { PoolClient } from 'pg';
import { OWNERSHIP_CONTRACT_TYPES } from '@/lib/management/config';
import { ownershipVehicleStockError } from '@/lib/management/ownership-stock';

export async function checkOwnershipVehicleStock(db: Pick<PoolClient,'query'>, rentalType: unknown,
  vehicles: { id?: unknown; license?: unknown; store_id?: unknown; store_name?: unknown; status?: unknown }[], historical = false) {
  if (historical || !vehicles.length || !OWNERSHIP_CONTRACT_TYPES.has(String(rentalType))) return '';
  const ids = [...new Set(vehicles.map(vehicle => String(vehicle.store_id || '')).filter(id => /^[1-9]\d*$/.test(id)))];
  const stores = await db.query('SELECT id,kind FROM himoto.stores WHERE id=ANY($1::bigint[]) FOR SHARE',[ids]);
  return ownershipVehicleStockError(rentalType,vehicles,stores.rows);
}

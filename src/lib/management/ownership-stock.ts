import { OWNERSHIP_CONTRACT_TYPES } from './config';
import { isOwnershipStore } from './contract-billing';

type Store = { id?: unknown; kind?: unknown; name?: unknown; store_name?: unknown };
type Vehicle = { id?: unknown; license?: unknown; store_id?: unknown; store_name?: unknown; status?: unknown };

export function isOwnershipVehicleStore(store: Store) {
  return store.kind ? store.kind === 'lease_to_own' : isOwnershipStore(store.name || store.store_name);
}

export function ownershipVehicleStockError(rentalType: unknown, vehicles: Vehicle[], stores: Store[], historical = false): string {
  if (historical || !OWNERSHIP_CONTRACT_TYPES.has(String(rentalType))) return '';
  const allowed = new Set(stores.filter(isOwnershipVehicleStore).map(store => String(store.id)));
  const invalid = vehicles.find(vehicle => !allowed.has(String(vehicle.store_id)) || vehicle.status === 'in_transit');
  if (!invalid) return '';
  return `Xe ${invalid.license || `#${invalid.id}`} chưa được nhận vào kho Thuê sở hữu${invalid.store_name ? ` (kho hiện tại: ${invalid.store_name})` : ''}. Chuyển xe sang kho Thuê sở hữu và xác nhận nhận xe trước khi lập hoặc duyệt hợp đồng.`;
}

import { OWNERSHIP_CONTRACT_TYPES } from './config';
import { isOwnershipStore } from './contract-billing';

type Store = { id?: unknown; kind?: unknown; name?: unknown; store_name?: unknown };
type Vehicle = { id?: unknown; license?: unknown; store_id?: unknown; store_name?: unknown; status?: unknown };

export function isOwnershipVehicleStore(store: Store) {
  return store.kind ? store.kind === 'lease_to_own' : isOwnershipStore(store.name || store.store_name);
}

/** Xe đã nằm kho Thuê sở hữu: theo danh sách kho (ưu tiên kind) hoặc nhãn kho hiện tại từ inventory API. */
export function isOwnershipVehicleStock(vehicle: Vehicle, stores: Store[]) {
  if (vehicle.status === 'in_transit') return false;
  const store = stores.find(item => String(item.id) === String(vehicle.store_id));
  if (store) return isOwnershipVehicleStore(store);
  // Danh sách kho phiên làm việc có thể thiếu kho lease_to_own; không chặn xe inventory đã gắn tên kho Thuê sở hữu.
  return isOwnershipStore(vehicle.store_name);
}

export function ownershipVehicleStockError(rentalType: unknown, vehicles: Vehicle[], stores: Store[], historical = false): string {
  if (historical || !OWNERSHIP_CONTRACT_TYPES.has(String(rentalType))) return '';
  const invalid = vehicles.find(vehicle => !isOwnershipVehicleStock(vehicle, stores));
  if (!invalid) return '';
  return `Xe ${invalid.license || `#${invalid.id}`} chưa được nhận vào kho Thuê sở hữu${invalid.store_name ? ` (kho hiện tại: ${invalid.store_name})` : ''}. Chuyển xe sang kho Thuê sở hữu và xác nhận nhận xe trước khi lập hoặc duyệt hợp đồng.`;
}

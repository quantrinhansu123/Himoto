import { OWNERSHIP_CONTRACT_TYPES } from './config';

type Stock = { id?: unknown; license?: unknown; store_id?: unknown; store_name?: unknown; status?: unknown };
export function rentalStockError(rentalType: unknown, sourceStore: unknown, vehicles: Stock[], historical = false, sourceName = '') {
  if (historical || OWNERSHIP_CONTRACT_TYPES.has(String(rentalType)) || !sourceStore) return '';
  const foreign = vehicles.find(vehicle => String(vehicle.store_id) !== String(sourceStore) || vehicle.status === 'in_transit');
  if (!foreign) return '';
  const target = sourceName || `cơ sở nguồn khách #${sourceStore}`;
  return `Xe ${foreign.license || `#${foreign.id}`} ${foreign.status === 'in_transit' ? 'đang chờ xác nhận điều chuyển' : `đang ở ${foreign.store_name || `cơ sở #${foreign.store_id}`}`}. Điều chuyển xe về ${target} và xác nhận nhận xe trước khi giao khách hoặc chốt đơn giữ xe. Có thể lưu nháp trong lúc chờ nhận xe.`;
}

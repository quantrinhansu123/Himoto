import type { ReturnableContractItem } from './contract-returns';
import type { ManagementRow } from './types';
import { OWNERSHIP_CONTRACT_TYPES } from './config';
import { ownershipVehicleStockError } from './ownership-stock';
import { rentalStockError } from './rental-stock';

type SwapItem = Pick<ReturnableContractItem, 'vehicle_id' | 'store_id' | 'store_name' | 'rental_type'>;
export function swapStockLabel(item: SwapItem) {
  return OWNERSHIP_CONTRACT_TYPES.has(String(item.rental_type)) ? 'kho Thuê sở hữu' : item.store_name || 'cơ sở của hợp đồng';
}
/** Use the fresh full inventory, not the provider's optional/paged vehicle cache.
 * Keep candidate scope aligned with replaceContractVehicle's server checks. */
export function contractSwapCandidates(item: SwapItem, inventory: ManagementRow[], stores: ManagementRow[]) {
  return inventory.filter(vehicle => {
    if (vehicle.id === item.vehicle_id || vehicle.status !== 'ready') return false;
    try {
      const rentals: unknown = JSON.parse(String(vehicle.rentals_json || '[]'));
      // Drafts are soft holds: show them with VehiclePicker's warning instead of
      // hiding available stock. Issued rentals/reservations remain excluded.
      if (!Array.isArray(rentals) || rentals.some(rental => !rental || typeof rental !== 'object' || rental.status !== 'draft')) return false;
    } catch { return false; }
    return !ownershipVehicleStockError(item.rental_type, [vehicle], stores) && !rentalStockError(item.rental_type, item.store_id, [vehicle]);
  });
}

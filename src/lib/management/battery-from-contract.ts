import { createContractDraft } from '@/lib/management/contract-document';
import { vietnamDate } from '@/lib/management/duty-roster';
import type { BatteryContractPrefill } from '@/lib/management/battery-contracts';
import { DEFAULT_BATTERY_NAME } from '@/lib/management/battery-contracts';
import type { ManagementDataset, ManagementRow } from '@/lib/management/types';

const vietnamNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);

/** Build thuê pin/sạc form values from an active vehicle rental contract. */
export function batteryPrefillFromVehicleContract(dataset: ManagementDataset, row: ManagementRow): BatteryContractPrefill {
  try {
    const draft = createContractDraft(dataset, 'all', row);
    const vehicle = draft.vehicles[0];
    const storeId = Number(draft.store_id || row.store_id);
    return {
      vehicle_contract_id: row.id,
      store_id: Number.isSafeInteger(storeId) && storeId > 0 ? storeId : undefined,
      customer_id: draft.customer_id,
      status: 'renting',
      staff_name: draft.staff_name || '',
      signed_on: draft.signed_on || vietnamDate(),
      signed_place: '',
      customer_name: draft.customer.name,
      customer_phone: draft.customer.phone,
      customer_address: draft.customer.address,
      customer_id_card: draft.customer.id_card,
      id_card_issued_on: draft.customer.id_card_issued_on,
      id_card_issued_by: draft.customer.id_card_issued_by,
      battery_name: DEFAULT_BATTERY_NAME,
      vehicle_license: vehicle?.license || String(row.license || ''),
      vehicle_brand: vehicle?.brand || '',
      vehicle_type: vehicle?.type_text || '',
      vehicle_color: vehicle?.color || '',
      vehicle_year: vehicle?.year || '',
      starts_at: draft.start_date || vietnamNow(),
      ends_at: draft.end_date || '',
      rent_price: null,
      price_unit: 'tháng',
      package_name: draft.package_name || '',
      paid_amount: null,
      paid_method: '',
      deposit_amount: null,
      deposit_note: '',
      deposit_method: '',
      notes: `Theo hợp đồng thuê xe ${row.code}`,
    };
  } catch {
    const storeId = Number(row.store_id);
    return {
      vehicle_contract_id: row.id,
      store_id: Number.isSafeInteger(storeId) && storeId > 0 ? storeId : undefined,
      customer_id: row.customer_id ? Number(row.customer_id) : null,
      status: 'renting',
      staff_name: String(row.staff_name || ''),
      signed_on: vietnamDate(),
      customer_name: String(row.customer_name || row.name || ''),
      customer_phone: String(row.customer_phone || row.phone || ''),
      customer_address: String(row.customer_address || row.address || ''),
      customer_id_card: String(row.customer_id_card || row.id_card || ''),
      battery_name: DEFAULT_BATTERY_NAME,
      vehicle_license: String(row.license || ''),
      starts_at: vietnamNow(),
      ends_at: '',
      price_unit: 'tháng',
      notes: `Theo hợp đồng thuê xe ${row.code}`,
    };
  }
}

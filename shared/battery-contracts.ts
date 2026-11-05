export const BATTERY_STATUSES = [
  { value: 'renting', label: 'Đang thuê' },
  { value: 'returned', label: 'Đã trả' },
  { value: 'cancelled', label: 'Đã hủy' },
] as const;
export type BatteryStatus = (typeof BATTERY_STATUSES)[number]['value'];
export const BATTERY_PAYMENT_METHODS = ['', 'CK', 'TM'] as const;
export type BatteryPaymentMethod = (typeof BATTERY_PAYMENT_METHODS)[number];
export type BatteryCollectionMethod = '' | 'transfer' | 'company_transfer' | 'cash';
export const BATTERY_COLLECTION_METHODS = [{value:'',label:'Chưa chọn'}, {value:'transfer',label:'CK tài khoản cá nhân'}, {value:'company_transfer',label:'CK tài khoản công ty'}, {value:'cash',label:'Tiền mặt'}] as const;
export interface BatteryPaymentAccount { id: number | string; kind: string; store_id?: number | string; owner_type: string; status: string; label: string }
export function batteryPaymentAccounts<T extends BatteryPaymentAccount>(accounts: T[], storeId: number, method: BatteryCollectionMethod): T[] {
  return accounts.filter(account => account.status.toLowerCase() === 'active' && (method === 'cash' ? account.kind === 'cash' && Number(account.store_id) === storeId
    : method === 'company_transfer' ? account.kind === 'bank' && account.owner_type === 'company'
    : method === 'transfer' && account.kind === 'bank' && account.owner_type !== 'company' && Number(account.store_id) === storeId));
}
export const DEFAULT_BATTERY_NAME = 'Pin xe điện 2.4 của Vinfast';
export const DEFAULT_CHARGER_NAME = 'Sạc xe điện Vinfast';
export const DEFAULT_BATTERY_CHARGER_NAME = `${DEFAULT_BATTERY_NAME} + ${DEFAULT_CHARGER_NAME}`;
export const BATTERY_PRODUCT_PRESETS = [
  { value: 'battery', label: 'Pin', name: DEFAULT_BATTERY_NAME },
  { value: 'charger', label: 'Sạc', name: DEFAULT_CHARGER_NAME },
  { value: 'battery_charger', label: 'Pin + Sạc', name: DEFAULT_BATTERY_CHARGER_NAME },
] as const;
export type BatteryProductKind = (typeof BATTERY_PRODUCT_PRESETS)[number]['value'];

export interface BatteryContractFields {
  vehicle_contract_id?: number | null;
  store_id: number; customer_id: number | null; status: BatteryStatus; staff_name: string; signed_on: string; signed_place: string;
  customer_name: string; customer_phone: string; customer_address: string; customer_id_card: string; id_card_issued_on: string; id_card_issued_by: string;
  battery_name: string; vehicle_license: string; vehicle_brand: string; vehicle_type: string; vehicle_color: string; vehicle_year: string;
  /** Local Vietnam time, `YYYY-MM-DDTHH:mm`. */
  starts_at: string; ends_at: string;
  rent_price: number | null; price_unit: string; package_name: string; paid_amount: number | null; paid_method: BatteryPaymentMethod;
  deposit_amount: number | null; deposit_note: string; deposit_method: BatteryPaymentMethod; notes: string;
  paid_account_type?: BatteryCollectionMethod; paid_account_id?: number | null;
  deposit_account_type?: BatteryCollectionMethod; deposit_account_id?: number | null;
  collected_at?: string;
}
/** Prefill payload when opening thuê pin/sạc from a vehicle rental contract. */
export type BatteryContractPrefill = Partial<BatteryContractFields> & { store_id?: number };
export interface BatteryContractInput extends BatteryContractFields { revision?: string; request_id?: string }
export interface BatteryContract extends BatteryContractFields {
  legacy_paid_amount?: number; legacy_deposit_amount?: number;
  vehicle_contract_code?: string;
  id: number; code: string; store_name: string; store_address: string; store_phone: string; created_at: string; revision: string;
}

export const batteryStatusLabel = (status: string) => BATTERY_STATUSES.find(option => option.value === status)?.label || status;
export const batterySearchFold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
export function batteryMatchesSearch(row:BatteryContract,search:string){const term=batterySearchFold(search.trim());return !term||batterySearchFold([row.code,row.vehicle_contract_code,row.customer_name,row.customer_phone,row.customer_id_card,row.vehicle_license,row.staff_name].join(' ')).includes(term);}

export function batteryProductKind(name: string): BatteryProductKind | null {
  const trimmed = name.trim();
  if (trimmed === DEFAULT_BATTERY_CHARGER_NAME) return 'battery_charger';
  if (trimmed === DEFAULT_BATTERY_NAME || /^pin\b/i.test(trimmed)) return 'battery';
  if (trimmed === DEFAULT_CHARGER_NAME || /^sạc\b/i.test(trimmed)) return 'charger';
  return null;
}

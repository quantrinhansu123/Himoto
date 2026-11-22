import type { PaymentMethod } from './payment-methods';

export const BATTERY_SWAP_FEE = 100_000;
export const BATTERY_SWAP_LOW_PERCENT = 20;

export const CONTRACT_OPERATIONS = {
  no_show: 'Khách không đến nhận xe',
  delete_reservation: 'Xóa hợp đồng cọc',
  battery_swap: 'Đổi pin theo hợp đồng xe',
  payment_settlement: 'Thanh toán và đóng hợp đồng',
} as const;
export type ContractOperation = keyof typeof CONTRACT_OPERATIONS;
export const CONTRACT_OPERATION_PERMISSIONS = {
  no_show: 'contracts.finalize',
  delete_reservation: 'contracts.delete',
  battery_swap: 'contracts.renew',
  payment_settlement: 'contracts.settle',
} as const;
export type ContractSettlementMode = 'partial' | 'full' | 'close_unpaid';
export type ContractSettlementVehicle = {
  item_id: number; revision: string; status: 'with_customer' | 'returned'; returned_at?: string;
};
export interface ContractSettlementInput {
  request_id: string;
  revision: string;
  mode: ContractSettlementMode;
  amount: string;
  paid_at: string;
  note: string;
  confirmed: true;
  method?: PaymentMethod;
  account_id?: number;
  vehicles_confirmed?: true;
  vehicles?: ContractSettlementVehicle[];
}

export const isContractOperation = (value: unknown): value is ContractOperation =>
  typeof value === 'string' && Object.hasOwn(CONTRACT_OPERATIONS, value);
export const contractOperationKey = (action: ContractOperation, id: string | number) => `contract.${action}:${id}`;

export type ContractOperationAccount = { id: number; method: PaymentMethod; label: string };
export type ContractOperationItem = { id: number; license: string; name: string; revision: string };
export type BatterySwapRow = {
  id: number; item_id: number; status: 'draft' | 'confirmed'; revision: string; license: string;
  battery_percent: number | null; fee: number; confirmed_at: string | null;
};
type Common = { id: number; code: string; revision: string; status: string; blocked_reason: string };
export type ContractOperationContext = Common & (
  | { action: 'no_show' | 'delete_reservation'; paid: number | null; appointment: string | null }
  | { action: 'battery_swap'; items: Omit<ContractOperationItem, 'revision'>[]; swaps: BatterySwapRow[]; accounts: ContractOperationAccount[]; can_write: boolean }
  | { action: 'payment_settlement'; items: ContractOperationItem[]; accounts: ContractOperationAccount[]; total: number | null; paid: number | null; remaining: number | null; held: number }
);
export type BatterySwapInput =
  | { action: 'prepare'; item_id: number }
  | { action: 'confirm'; id: number; revision: string; order_revision: string; battery_percent: number; note: string;
      receipt?: { method: PaymentMethod; account_id: number; paid_at: string } };
export type ContractOperationInput = BatterySwapInput | Omit<ContractSettlementInput, 'request_id'> | { revision: string; reason?: string };

const obj = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const nonnegative = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const money = (value: unknown) => value === null || nonnegative(value);
const stamp = (value: unknown) => value === null || typeof value === 'string' && Number.isFinite(Date.parse(value));
const revision = (value: unknown) => typeof value === 'string' && /^\d{1,20}$/.test(value);
const item = (value: unknown): value is Record<string, unknown> =>
  obj(value) && positive(value.id) && typeof value.license === 'string' && typeof value.name === 'string';

export function isContractOperationContext(value: unknown): value is ContractOperationContext {
  if (!obj(value) || !positive(value.id) || !revision(value.revision) ||
    !['code', 'status', 'blocked_reason'].every(key => typeof value[key] === 'string')) return false;
  if (value.action === 'no_show' || value.action === 'delete_reservation') return money(value.paid) && stamp(value.appointment);
  if (!Array.isArray(value.accounts) || !value.accounts.every(account => obj(account) && positive(account.id) &&
    typeof account.label === 'string' && ['cash', 'transfer', 'company_transfer'].includes(String(account.method)))) return false;
  if (value.action === 'payment_settlement') return Array.isArray(value.items) && value.items.every(row => item(row) && revision(row.revision)) &&
    money(value.total) && money(value.paid) && money(value.remaining) && nonnegative(value.held);
  return value.action === 'battery_swap' && typeof value.can_write === 'boolean' && Array.isArray(value.items) &&
    value.items.every(item) && Array.isArray(value.swaps) && value.swaps.every(row => obj(row) &&
      positive(row.id) && positive(row.item_id) && revision(row.revision) && typeof row.license === 'string' &&
      (row.status === 'draft' && row.battery_percent === null || row.status === 'confirmed' && nonnegative(row.battery_percent) && Number(row.battery_percent) <= 100) &&
      nonnegative(row.fee) && stamp(row.confirmed_at));
}

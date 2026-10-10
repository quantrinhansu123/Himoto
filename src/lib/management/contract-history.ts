import { mapApiRow } from './repository';
import type { ManagementRow } from './types';

export async function loadCustomerContracts(customerId: number, signal?: AbortSignal): Promise<ManagementRow[]> {
  const response = await fetch(`/api/auth/order/car-rental?customer_id=${customerId}`, { credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json' } });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result?.data)) throw new Error(result?.message || 'Không tải được hợp đồng của khách hàng.');
  return result.data.map((row: Record<string, unknown>) => mapApiRow('contracts', row));
}

export type ContractChangeKind = 'created' | 'renewal' | 'extra' | 'swap' | 'return';

export interface ContractChange {
  id: string; kind: ContractChangeKind; at: string; actor: string;
  title: string; detail: string; amount: number | null;
}
export interface ContractCashflow {
  id: number; at: string; type: 'income' | 'expense'; reason: string; note: string;
  amount: number; method: string; account: string; actor: string; status: string;
  order_id?: number; contract_code?: string;
}
export interface ContractHistory { changes: ContractChange[]; cashflow: ContractCashflow[] }

export const CHANGE_LABELS: Record<ContractChangeKind, string> = {
  created: 'Tạo hợp đồng', renewal: 'Gia hạn', extra: 'Thu thêm', swap: 'Đổi xe', return: 'Trả xe',
};

export async function loadCustomerCashflow(customerId: number, signal?: AbortSignal): Promise<ContractCashflow[]> {
  const response = await fetch(`/api/auth/customers/${customerId}/payments`, { credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json' } });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result?.data)) throw new Error(result?.message || 'Không tải được lịch sử thanh toán của khách hàng.');
  return result.data as ContractCashflow[];
}

export async function loadContractHistory(id: number, signal?: AbortSignal): Promise<ContractHistory> {
  const response = await fetch(`/api/auth/order/car-rental/${id}/history`, { credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json' } });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result?.data?.changes) || !Array.isArray(result?.data?.cashflow)) {
    throw new Error(result?.message || 'Không tải được lịch sử hợp đồng.');
  }
  return result.data as ContractHistory;
}

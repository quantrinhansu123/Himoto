import { vietnamDate } from './duty-roster';
import type { VehicleChange } from './vehicle-history';

export type TransferHistoryAction = '' | 'transfer' | 'receive';
export interface TransferHistoryQuery {
  from: string; to: string; fromStore: string; toStore: string; store: string;
  action: TransferHistoryAction; search: string; page: number;
}
export interface TransferHistoryRow {
  id: number; vehicle_id: number; vehicle_name: string; license: string;
  from_store_id: number | null; to_store_id: number | null; from_store: string; to_store: string;
  action: 'transfer' | 'receive'; label: string; at: string | null; actor: string; note: string;
  changes: VehicleChange[];
  telegram_event_id?:number;
}
export interface TransferHistoryResult { rows: TransferHistoryRow[]; total: number; scopeCount: number; page: number; size: number }
export const TRANSFER_HISTORY_SIZE = 25;
export function defaultTransferHistoryQuery(): TransferHistoryQuery {
  const today = vietnamDate();
  return { from: today, to: today, fromStore: '', toStore: '', store: 'all', action: '', search: '', page: 1 };
}
export function transferHistoryParams(query: TransferHistoryQuery) {
  return new URLSearchParams({ from: query.from, to: query.to, from_store: query.fromStore, to_store: query.toStore,
    store: query.store, action: query.action, search: query.search, page: String(query.page) });
}
export async function loadTransferHistory(query: TransferHistoryQuery, signal?: AbortSignal): Promise<TransferHistoryResult> {
  const response = await fetch(`/api/auth/vehicles/transfers?${transferHistoryParams(query)}`, {
    credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json' },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result.data?.rows) || !Number.isSafeInteger(result.data.total) || result.data.total<0 || !Number.isSafeInteger(result.data.scopeCount) || result.data.scopeCount<0) {
    throw new Error(result?.message || 'Không tải được lịch sử luân chuyển.');
  }
  return result.data;
}

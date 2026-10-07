import { StoreCreation, StoreEdits, StoreManager } from './store-management';
import { mapApiRow } from './repository';

async function storeRequest(path: string, options?: RequestInit) {
  const response = await fetch(`/api/auth/stores${path}`, { ...options, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json', ...(options?.body ? { 'Content-Type': 'application/json' } : {}) } }).catch(() => {
    throw new Error('Không kết nối được hệ thống. Nhấn Làm mới để kiểm tra dữ liệu trước khi thử lại.');
  });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || envelope?.status !== 'success') throw new Error(envelope?.message || `Không cập nhật được cơ sở (HTTP ${response.status}).`);
  return envelope.data;
}
export async function loadStoreManagers(): Promise<StoreManager[]> {
  const data = await storeRequest('/managers');
  if (!Array.isArray(data) || data.some(row => !Number.isSafeInteger(Number(row.id)) || typeof row.name !== 'string')) throw new Error('Danh sách người phụ trách không hợp lệ.');
  return data.map(row => ({ id: Number(row.id), name: row.name }));
}
export async function updateStoreRecord(id: number, edits: StoreEdits) {
  const data = await storeRequest(`/${id}`, { method: 'PATCH', body: JSON.stringify(edits) });
  if (!data || Number(data.id) !== id) throw new Error('Chưa xác nhận được cơ sở đã cập nhật. Nhấn Làm mới để kiểm tra.');
  return mapApiRow('stores', data);
}
export async function createStoreRecord(store: StoreCreation) {
  const data = await storeRequest('', { method: 'POST', body: JSON.stringify(store) });
  if (!data || !Number.isSafeInteger(Number(data.id)) || Number(data.id) <= 0 || typeof data.code !== 'string' || !data.code || data.store_name !== store.name.trim()) throw new Error('Chưa xác nhận được cơ sở mới. Nhấn Làm mới để kiểm tra.');
  return mapApiRow('stores', data);
}
export async function deleteStoreRecord(id: number) { await storeRequest(`/${id}`, { method: 'DELETE' }); }

import type { OfflineStore } from './offline-store';
export function openOfflineStore(): Promise<OfflineStore> {
  return Promise.reject(new Error('Dữ liệu offline lưu bền vững chỉ có trên ứng dụng điện thoại.'));
}

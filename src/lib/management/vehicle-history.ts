export type VehicleEventAction = 'create' | 'rent' | 'return' | 'transfer' | 'repair' | 'status' | 'swap' | 'note';
export interface VehicleEvent {
  key: string; action: VehicleEventAction; label: string; vehicle_name: string; license: string; location: string;
  responsible_store: string; beneficiary_store: string; note: string; at: string | null; actor: string; order_id: number | null;
}

export const VEHICLE_EVENT_ACTIONS: { value: VehicleEventAction; label: string }[] = [
  { value: 'rent', label: 'Thuê' }, { value: 'return', label: 'Trả xe' }, { value: 'transfer', label: 'Chuyển kho' },
  { value: 'repair', label: 'Sửa chữa' }, { value: 'status', label: 'Đổi trạng thái' }, { value: 'swap', label: 'Đổi xe' },
  { value: 'note', label: 'Ghi chú' }, { value: 'create', label: 'Nhập xe' },
];

export async function loadVehicleHistory(id: number, signal?: AbortSignal): Promise<VehicleEvent[]> {
  const response = await fetch(`/api/auth/vehicles/${id}/history`, { credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json' } });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result?.data)) throw new Error(result?.message || 'Không tải được lịch sử xe.');
  return result.data as VehicleEvent[];
}

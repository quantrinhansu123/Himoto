import { uploadRecordPhoto, type CloudUploadReceipt, type PendingPhotos, type VehicleDocumentSlot } from './record-photos';

export interface VehicleEdits { name: string; license: string; brand: string; type: string; year: string; store_id: string; status: string; color: string; chassis: string; engine: string; odometer: string; note: string }

export type VehicleAction = (
  | { action: 'transfer'; to_store_id: string; note: string }
  | { action: 'receive'; transfer_event_id: string; note: string }
  | { action: 'status'; status: 'ready' | 'using'; beneficiary_store_id: string; customer_name: string; customer_phone: string; customer_id_card: string; note: string }) & { revision?: string };

export interface VehicleActionResult {
  id:number;event_id:number;telegram_event_id?:number;
  customer?: { id: number; name: string; created: boolean; matched_by: string };
  draft?: { id: number; code: string };
}

export async function applyVehicleAction(id: number, action: VehicleAction): Promise<VehicleActionResult> {
  const response = await fetch(`/api/auth/vehicles/${id}/actions`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(action),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || `Không lưu được thao tác xe (HTTP ${response.status}).`);
  return result.data as VehicleActionResult;
}

export async function loadSessionUserName(): Promise<string> {
  const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json().catch(() => null);
  return response.ok && typeof result?.user?.name === 'string' ? result.user.name : '';
}

export async function saveVehicleRecord(id: number | null, edits: VehicleEdits, revision?: string, photos: PendingPhotos = {}, removed: VehicleDocumentSlot[] = []): Promise<{ id: number }> {
  const documents: Partial<Record<VehicleDocumentSlot, CloudUploadReceipt | null>> = Object.fromEntries(removed.map(slot => [slot, null]));
  for (const [slot, file] of Object.entries(photos)) {
    try { documents[slot as VehicleDocumentSlot] = await uploadRecordPhoto(file); }
    catch { documents[slot as VehicleDocumentSlot] = await uploadRecordPhoto(file, true); }
  }
  const response = await fetch(`/api/auth/vehicles${id === null ? '' : `/${id}`}`, {
    method: id === null ? 'POST' : 'PATCH', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({...edits,...(revision?{revision}:{}),...(Object.keys(documents).length?{documents}:{})}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || `Không lưu được xe (HTTP ${response.status}).`);
  return result.data;
}

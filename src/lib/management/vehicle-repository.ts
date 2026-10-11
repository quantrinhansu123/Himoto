export interface VehicleEdits { name: string; license: string; brand: string; type: string; year: string; store_id: string; status: string; color: string; chassis: string; engine: string; odometer: string }

export async function saveVehicleRecord(id: number | null, edits: VehicleEdits): Promise<{ id: number }> {
  const response = await fetch(`/api/auth/vehicles${id === null ? '' : `/${id}`}`, {
    method: id === null ? 'POST' : 'PATCH', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(edits),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || `Không lưu được xe (HTTP ${response.status}).`);
  return result.data;
}

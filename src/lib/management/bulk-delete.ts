export type BulkDeleteKind = 'customers' | 'stores' | 'vehicles' | 'staff' | 'contracts' | 'transactions';

export async function bulkDelete(kind: BulkDeleteKind, ids: number[]): Promise<number[]> {
  const response = await fetch(`/api/auth/bulk-delete/${kind}`, {
    method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result?.data?.ids)) throw new Error(result?.message || `Không xóa được (HTTP ${response.status}).`);
  return result.data.ids as number[];
}

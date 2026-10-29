export function vehicleHolderLabel(status: unknown, holder: unknown): string {
  const name = typeof holder === 'string' ? holder.trim() : '';
  if (name && name !== 'Lưu kho') return name;
  if (status === 'ready') return 'Lưu kho';
  return status === 'using' || status === 'rent' ? 'Chưa xác định khách' : '—';
}

/** Vehicle marked Đang thuê / rent but no open rental line is attached. */
export function vehicleMissingOpenContract(row: { status?: unknown; rentals_json?: unknown }): boolean {
  if (!['using', 'rent'].includes(String(row.status || ''))) return false;
  try {
    const rentals = row.rentals_json ? JSON.parse(String(row.rentals_json)) : [];
    return !Array.isArray(rentals) || rentals.length === 0;
  } catch {
    return true;
  }
}

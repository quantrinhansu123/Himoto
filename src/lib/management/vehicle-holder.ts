export function vehicleHolderLabel(status: unknown, holder: unknown): string {
  const name = typeof holder === 'string' ? holder.trim() : '';
  if (name && name !== 'Lưu kho') return name;
  if (status === 'ready') return 'Lưu kho';
  return status === 'using' || status === 'rent' ? 'Chưa xác định khách' : '—';
}

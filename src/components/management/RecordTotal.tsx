export function RecordTotal({ label, count, loading = false, className = '' }: { label: string; count: number | null | undefined; loading?: boolean; className?: string }) {
  const known = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
  return <div className={`mg-record-total ${className}`.trim()} aria-label={label} aria-busy={loading}>
    <span>{label}</span><strong>{known ? count.toLocaleString('vi-VN') : loading ? '…' : '—'}</strong>
    <small>Trong phạm vi cơ sở và quyền truy cập</small>
  </div>;
}

'use client';

export function ContractStatusTotals({ counts, total, loading }: { counts: Map<string, number>; total: number; loading?: boolean }) {
  const renting = counts.get('renting') || 0;
  const overdue = counts.get('overdue') || 0;
  const badDebt = counts.get('bad_debt') || 0;
  const metrics = [
    { label: 'Tổng hợp đồng', value: total, hint: 'Tất cả trạng thái trong bộ lọc' },
    { label: 'Trong hạn', value: renting, hint: 'Đang thuê và còn trong hạn trả' },
    { label: 'Quá hạn thường', value: overdue, hint: 'Quá hạn trả hoặc thu, chưa chuyển nợ xấu' },
    { label: 'Nợ xấu', value: badDebt, hint: 'Đã chuyển nợ xấu' },
  ];
  return <section className="mg-contract-status-totals" aria-label="Tổng hợp trạng thái thuê" aria-busy={loading}>
    <dl className="mg-contract-metrics mg-contract-status-metrics">
      {metrics.map(metric => <div key={metric.label}>
        <dt>{metric.label}</dt>
        <dd>{loading ? '—' : metric.value.toLocaleString('vi-VN')}</dd>
        <span>{metric.hint}</span>
      </div>)}
    </dl>
  </section>;
}

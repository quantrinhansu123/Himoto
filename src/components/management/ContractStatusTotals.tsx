'use client';

import { contractActiveRentalCount } from '@/lib/management/contract-tabs';

export function ContractStatusTotals({ counts, loading }: { counts: Map<string, number>; loading?: boolean }) {
  const renting = counts.get('renting') || 0;
  const overdue = counts.get('overdue') || 0;
  const badDebt = counts.get('bad_debt') || 0;
  const total = contractActiveRentalCount(counts);
  const metrics = [
    { label: 'Tổng', value: total, hint: 'Đang thuê + quá hạn + nợ xấu' },
    { label: 'Đang thuê', value: renting, hint: 'Còn trong hạn trả' },
    { label: 'Quá hạn', value: overdue, hint: 'Đã quá giờ trả / thu' },
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

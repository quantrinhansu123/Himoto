'use client';

import { useMemo } from 'react';
import { summarizeContracts, type ContractSummary as ContractSummaryValues } from '@/lib/management/contract-summary';
import { formatValue } from '@/lib/management/table-utils';
import type { ManagementRow } from '@/lib/management/types';

export function ContractSummary({ rows, customers, loading, unavailable, values }: {
  rows: ManagementRow[]; customers: ManagementRow[]; loading: boolean; unavailable: boolean; values?:ContractSummaryValues|null;
}) {
  const summary = useMemo(() => values || summarizeContracts(rows, customers), [rows, customers, values]);
  const ready = !loading && !unavailable;
  const metrics = [
    { label: 'Số hợp đồng', value: summary.contractCount, hint: 'Toàn bộ kết quả lọc, gồm nháp', money: false },
    { label: 'Số Blacklist', value: summary.blacklistCount, hint: 'Số khách duy nhất trong kết quả lọc', money: false },
    { label: 'Tổng tiền', value: summary.totalAmount, hint: 'Không gồm nháp, đã hủy và Nợ xấu', money: true },
    { label: 'Công nợ', value: summary.receivableAmount, hint: 'Tạm tính, không gồm Nợ xấu', money: true },
    { label: 'Nợ xấu', value: summary.badDebtAmount, hint: 'Tiền còn thiếu của hợp đồng Nợ xấu', money: true },
  ];
  const formatted = metrics.map(metric => ready && metric.value !== null
    ? metric.money ? formatValue(metric.value, 'money') : metric.value.toLocaleString('vi-VN')
    : '—');
  return <section className="mg-contract-summary" aria-label="Thống kê hợp đồng theo bộ lọc" aria-busy={loading}>
    <dl className="mg-contract-metrics">
      {metrics.map((metric, index) => <div key={metric.label}>
        <dt>{metric.label}</dt><dd>{formatted[index]}</dd><span>{metric.hint}</span>
      </div>)}
    </dl>
    <p className="mg-contract-summary-note">Công nợ tạm tính = phần tiền hợp đồng còn thiếu sau khi trừ tổng đã thu, áp dụng cho đơn đang thuê, quá hạn, chờ tất toán và nợ xấu.</p>
    {ready && metrics.some(metric => metric.value === null) && <p className="mg-contract-summary-note is-incomplete">Chưa đủ số liệu tiền hợp đồng hoặc tổng đã thu để tính các ô hiển thị “—”.</p>}
    <span className="mg-sr-only" role="status" aria-atomic="true">{loading ? 'Đang tải thống kê hợp đồng.' : unavailable ? 'Không tải được thống kê hợp đồng.' : `Kết quả theo bộ lọc: ${metrics.map((metric, index) => `${metric.label}: ${formatted[index]}`).join('; ')}.`}</span>
  </section>;
}

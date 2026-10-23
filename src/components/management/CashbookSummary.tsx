'use client';

import { ArrowDownLeft, ArrowUpRight, ChevronDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { formatMoney } from '@/lib/formatters';
import { cashbookRentalTotals, type CashbookBreakdown } from '@/lib/management/cashbook';
import type { CashbookListResult } from '@/lib/management/cashbook-repository';

const rentalRows: [keyof CashbookBreakdown, string][] = [
  ['renewal_income', 'Tiền gia hạn'], ['rental_income', 'Phí thuê'], ['late_fee_income', 'Tiền trả muộn'],
];
export function CashbookSummary({ result, loading, unavailable, scope }: {
  result: CashbookListResult | null; loading: boolean; unavailable: boolean; scope: string;
}) {
  const ready = !loading && !unavailable && Boolean(result?.breakdown);
  const detail = ready ? result!.breakdown : undefined;
  const totals = detail ? cashbookRentalTotals(detail) : undefined;
  const money = (value: number | undefined) => ready && value !== undefined ? formatMoney(value) : '—';
  const metrics = [
    { key: 'revenue', label: 'Doanh thu thuê xe', icon: TrendingUp, value: totals?.revenue,
      rows: [...rentalRows, ['rental_refund_expense', '− Tiền hoàn do trả sớm']] as [keyof CashbookBreakdown, string][] },
    { key: 'income', label: 'Tổng thu thực tế', icon: ArrowDownLeft, value: totals?.income,
      rows: [['deposit_income', 'Tổng thu cọc'], ...rentalRows] as [keyof CashbookBreakdown, string][] },
    { key: 'expense', label: 'Tổng chi thực tế', icon: ArrowUpRight, value: totals?.expense,
      rows: [['deposit_refund_expense', 'Tiền cọc trả khách'], ['rental_refund_expense', 'Tiền hoàn do trả sớm']] as [keyof CashbookBreakdown, string][] },
  ];
  return <section className="mg-cashbook-summary" aria-label="Tổng hợp thu chi theo bộ lọc" aria-busy={loading}>
    <div className="mg-cashbook-summary-heading"><div><h2>Tổng hợp thu chi</h2><p>{scope}</p></div><span>Theo ngày thực thu / thực chi</span></div>
    <div className="mg-cashbook-metrics">{metrics.map(({ key, label, value, icon: Icon, rows }) =>
      <details key={key} className={`mg-cashbook-metric is-${key}`} data-metric={key}>
        <summary><span className="mg-cashbook-metric-label"><span className="mg-cashbook-metric-icon" aria-hidden="true"><Icon size={18}/></span>{label}<ChevronDown size={16} className="mg-summary-chevron" aria-hidden="true"/></span>
          <strong className="mg-cashbook-metric-value">{money(value)}</strong></summary>
        <dl className="mg-cashbook-metric-details">{rows.map(([field, text]) => <div key={field}><dt>{text}</dt><dd data-summary={field}>{money(detail?.[field])}</dd></div>)}</dl>
      </details>)}</div>
    <details className="mg-cashbook-reconciliation"><summary>Đối chiếu toàn bộ phiếu thu / chi</summary>
      <p>Ba số tổng phía trên tính theo các khoản thuê xe đã thu / hoàn thực tế. Tiền cọc chưa trả và khoản chưa thu chưa tính vào chi. Các khoản khác được đối chiếu riêng bên dưới.</p>
      <dl className="mg-cashbook-metric-details">
        <div><dt>Phí sửa chữa</dt><dd>{money(detail?.repair_income)}</dd></div>
        <div><dt>Thu thêm hợp đồng</dt><dd>{money(detail?.extra_income)}</dd></div>
        <div><dt>Thu khác / chưa phân loại</dt><dd>{money(detail?.other_income)}</dd></div>
        <div><dt>Chi khác</dt><dd>{money(detail?.other_expense)}</dd></div>
        <div><dt>Tổng tất cả phiếu thu</dt><dd>{money(result?.income.amount)}</dd></div>
        <div><dt>Tổng tất cả phiếu chi</dt><dd>{money(result?.expense.amount)}</dd></div>
      </dl>
      <a href="#cashbook-income">Xem phiếu thu</a> · <a href="#cashbook-expense">Xem phiếu chi</a>
    </details>
    <p className="mg-rental-revenue-note"><Link href="/staff-sales">Báo cáo doanh thu từng xe và tổng quan thuê xe</Link></p>
    {!loading && (unavailable || !result?.breakdown) && <p className="mg-field-error">Chưa có số tổng hợp hợp lệ cho bộ lọc này.</p>}
  </section>;
}

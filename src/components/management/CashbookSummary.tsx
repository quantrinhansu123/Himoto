'use client';

import { ArrowDownLeft, ArrowUpRight, Coins, Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/formatters';
import type { CashbookBreakdown } from '@/lib/management/cashbook';
import type { CashbookListResult } from '@/lib/management/cashbook-repository';
import Link from 'next/link';

export function CashbookSummary({ result, loading, unavailable, scope }: {
  result: CashbookListResult | null; loading: boolean; unavailable: boolean; scope: string;
}) {
  const ready = !loading && !unavailable && Boolean(result);
  const detail = ready ? result?.breakdown : undefined;
  const money = (value: number | undefined) => ready && value !== undefined ? formatMoney(value) : '—';
  const income = result?.income.amount, expense = result?.expense.amount;
  const outsideDeposit = detail && income !== undefined ? income - detail.deposit_income : undefined;
  const metrics = [
    { key: 'income', label: 'Tổng thu thực tế', value: income, icon: ArrowDownLeft, hint: 'Gồm tiền cọc và các khoản thu ngoài cọc', target: '#cashbook-income', count: result?.income.total, voucher: 'phiếu thu' },
    { key: 'deposit', label: 'Tiền cọc đã thu', value: detail?.deposit_income, icon: Wallet, hint: 'Tách riêng tiền cọc khách đã đóng' },
    { key: 'outside-deposit', label: 'Thu ngoài cọc', value: outsideDeposit, icon: Coins, hint: 'Tiền thuê, gia hạn, phí và các khoản thu khác' },
    { key: 'expense', label: 'Tổng chi thực tế', value: expense, icon: ArrowUpRight, hint: 'Gồm hoàn cọc và các khoản chi khác', target: '#cashbook-expense', count: result?.expense.total, voucher: 'phiếu chi' },
  ];
  const incomeRows: [keyof CashbookBreakdown, string][] = [
    ['rental_income', 'Tiền thuê xe / pin'], ['renewal_income', 'Tiền gia hạn'], ['late_fee_income', 'Phí quá hạn'],
    ['repair_income', 'Phí sửa chữa'], ['extra_income', 'Thu thêm hợp đồng'], ['other_income', 'Thu khác / chưa phân loại'],
  ];
  return <section className="mg-cashbook-summary" aria-label="Tổng hợp thu chi theo bộ lọc" aria-busy={loading}>
    <div className="mg-cashbook-summary-heading"><div><h2>Tổng hợp thu chi</h2><p>{scope}</p></div><span>Toàn bộ phiếu khớp bộ lọc</span></div>
    <dl className="mg-cashbook-metrics">{metrics.map(({ key, label, value, icon: Icon, hint, target, count, voucher }) => <div key={key} className={`mg-cashbook-metric is-${key}`} data-metric={key}>
      <dt><span className="mg-cashbook-metric-icon" aria-hidden="true"><Icon size={18}/></span>{label}</dt>
      <dd><strong className="mg-cashbook-metric-value">{money(value)}</strong><span>{hint}</span>
        {target && <a href={target}>{ready ? count : '—'} {voucher} · Xem danh sách</a>}
      </dd>
    </div>)}</dl>
    <div className="mg-cashbook-breakdowns">
      <section className="mg-cashbook-breakdown"><h3>Chi tiết khoản thu ngoài cọc</h3><dl>{incomeRows.map(([key, label]) => <div key={key}><dt>{label}</dt><dd data-summary={key}>{money(detail?.[key])}</dd></div>)}</dl>
        <p>Thu ngoài cọc = Tổng thu − Tiền cọc đã thu. Chưa trừ chi phí.</p>
      </section>
      <section className="mg-cashbook-breakdown"><h3>Chi tiết khoản chi</h3><dl>
        <div><dt>Hoàn cọc cho khách</dt><dd data-summary="deposit_refund_expense">{money(detail?.deposit_refund_expense)}</dd></div>
        <div><dt>Hoàn tiền thuê trả sớm</dt><dd data-summary="rental_refund_expense">{money(detail?.rental_refund_expense)}</dd></div>
        <div><dt>Chi khác</dt><dd data-summary="other_expense">{money(detail?.other_expense)}</dd></div>
      </dl><div className="mg-cashbook-net"><span>Chênh lệch thu − chi</span><strong>{money(income !== undefined && expense !== undefined ? income - expense : undefined)}</strong></div>
        <p>Chênh lệch gồm cả tiền cọc; không dùng làm số lãi thuê xe.</p>
      </section>
    </div>
    <p className="mg-rental-revenue-note">Doanh thu tính KPI: phí thuê + gia hạn + trả muộn − tiền thuê đã hoàn do trả sớm. <Link href="/staff-sales">Xem báo cáo theo ngày / NVKD</Link></p>
    {!loading && unavailable && <p className="mg-field-error">Chưa có số tổng hợp hợp lệ cho bộ lọc này.</p>}
  </section>;
}

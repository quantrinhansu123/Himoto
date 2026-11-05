'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, CalendarRange, FilterX, LayoutDashboard, RotateCcw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { useReloadAction } from './ReloadButton';
import { loadDashboardSummary, type DashboardSummary } from '@/lib/management/dashboard';
import { vietnamDate } from '@/lib/management/duty-roster';
import {DASHBOARD_PRESETS as PRESETS,dashboardPeriod as presetRange,dashboardCsv,DASHBOARD_METRICS} from '../../../shared/mobile-dashboard';

const money = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
const number = (value: number) => value.toLocaleString('vi-VN');
const viDate = (value: string) => value.split('-').reverse().join('/');

function downloadCsv(content:string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const HEADERS = DASHBOARD_METRICS.map(metric=>metric.label);

export function DashboardPage() {
  const { selectedStore, dataset, reload } = useManagement();
  const today = vietnamDate();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useReloadAction(useCallback(() => {
    setRetry(value => value + 1);
    void reload();
  }, [reload]));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadDashboardSummary(from, to, selectedStore, controller.signal)
      .then(value => { if (!controller.signal.aborted) setReport(value); })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : 'Không tải được Dashboard giao dịch.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to, selectedStore, retry]);

  const activePreset = PRESETS.find(preset => {
    const [start, end] = presetRange(preset.id, today);
    return start === from && end === to;
  })?.id;
  const periodDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const storeName = selectedStore === 'all'
    ? 'Tất cả cơ sở'
    : dataset?.stores.find(store => String(store.id) === selectedStore)?.name || `Cơ sở #${selectedStore}`;
  const isDefault = activePreset === 'month';
  const rows = report?.rows || [];
  const total = report?.total;
  const ready = !loading && !error && total;

  function choosePreset(id: typeof PRESETS[number]['id']) {
    const [start, end] = presetRange(id, today);
    setFrom(start);
    setTo(end);
  }
  function changeFrom(value: string) {
    if (!value) return;
    setFrom(value);
    if (value > to) setTo(value);
  }
  function changeTo(value: string) {
    if (!value) return;
    setTo(value);
    if (value < from) setFrom(value);
  }
  function exportCsv() {
    if (!report) return;
    downloadCsv(dashboardCsv(report), `dashboard-giao-dich-${from}-${to}.csv`);
  }

  return (
    <section className="mg-page">
      <div className="mg-page-content">
        <div className="mg-page-heading">
          <div>
            <h1>Dashboard giao dịch</h1>
            <p>Bảng tổng hợp số hợp đồng, doanh số, doanh thu và phí sửa chữa theo cơ sở trong kỳ.</p>
          </div>
          <div className="mg-heading-actions">
            <button className="mg-button" type="button" onClick={() => { setRetry(value => value + 1); void reload(); }}>
              <RotateCcw size={16} />Tải lại
            </button>
          </div>
        </div>

        <div className="mg-data-panel">
          <div className="mg-sales-filter" role="search" aria-label="Bộ lọc Dashboard giao dịch">
            <div className="mg-sales-filter-presets" role="group" aria-label="Chọn nhanh kỳ báo cáo">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={activePreset === preset.id ? 'is-active' : ''}
                  aria-pressed={activePreset === preset.id}
                  onClick={() => choosePreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mg-sales-filter-row">
              <div className="mg-sales-filter-field">
                <span className="mg-sales-filter-label">Khoảng ngày</span>
                <div className="mg-sales-filter-range">
                  <CalendarRange size={16} aria-hidden="true" />
                  <input aria-label="Từ ngày Dashboard" type="date" value={from} max={today} onChange={event => changeFrom(event.target.value)} />
                  <span aria-hidden="true">→</span>
                  <input aria-label="Đến ngày Dashboard" type="date" value={to} max={today} onChange={event => changeTo(event.target.value)} />
                </div>
              </div>
              <button type="button" className="mg-button mg-sales-filter-reset" disabled={isDefault} onClick={() => choosePreset('month')}>
                <FilterX size={16} />Đặt lại
              </button>
            </div>
            <p className="mg-sales-filter-summary">
              Kỳ báo cáo <strong>{viDate(from)} – {viDate(to)}</strong> · {periodDays} ngày · {storeName}
            </p>
          </div>

          <dl className="mg-sales-kpis" aria-busy={loading} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {[
              { key: 'contracts', label: 'Số HĐ', value: total ? number(total.contracts) : '—', hint: 'Hợp đồng bắt đầu trong kỳ' },
              { key: 'rental', label: 'Hợp đồng thuê', value: total ? number(total.rental_contracts) : '—', hint: 'Thuê ngày / tháng / thường' },
              { key: 'ownership', label: 'Sở hữu', value: total ? number(total.ownership_contracts) : '—', hint: 'Thuê sở hữu trong kỳ' },
              { key: 'overdue', label: 'Hợp đồng quá hạn', value: total ? number(total.overdue_contracts) : '—', hint: 'Trong các HĐ bắt đầu kỳ' },
              { key: 'sales', label: 'Doanh số', value: total ? money(total.sales) : '—', hint: 'Tiền thuê trên HĐ, không gồm VAT và phí khác' },
              { key: 'revenue', label: 'Doanh thu', value: total ? money(total.revenue) : '—', hint: 'Thuê + gia hạn − hoàn' },
              { key: 'repair', label: 'Chi phí sửa', value: total ? money(total.repair) : '—', hint: 'Phí sửa chữa đã thu' },
            ].map(card => (
              <div key={card.key} className={`mg-sales-kpi is-${card.key === 'overdue' ? 'overdue' : card.key === 'revenue' || card.key === 'sales' ? 'revenue' : 'paid'}`}>
                <dt><span className="mg-sales-kpi-icon" aria-hidden="true"><LayoutDashboard size={16} /></span>{card.label}</dt>
                <dd>{loading ? '—' : error ? '—' : card.value}</dd>
                <span>{loading ? 'Đang tải…' : error || card.hint}</span>
              </div>
            ))}
          </dl>
          <p className="mg-sales-kpi-note">
            Số HĐ / thuê / sở hữu / quá hạn / doanh số theo ngày bắt đầu thuê. Doanh thu và chi phí sửa theo ngày thu/chi thực tế trên sổ quỹ; doanh thu không gồm cọc và phí sửa chữa.
          </p>

          <div className="mg-source-sales">
            <div className="mg-source-sales-heading">
              <div>
                <h2>Bảng tổng hợp theo cơ sở</h2>
                <p>Mỗi dòng là một cơ sở trong kỳ đã chọn. Dòng Tổng khớp các thẻ phía trên.</p>
              </div>
              <button className="mg-button" type="button" disabled={loading || !rows.length} title={!rows.length ? 'Không có dữ liệu để xuất CSV.' : undefined} onClick={exportCsv}>
                <ArrowDownToLine size={16} />Xuất CSV
              </button>
            </div>

            {loading ? <p role="status" className="mg-table-state">Đang tải bảng tổng hợp giao dịch…</p>
              : error ? <p role="alert" className="mg-field-error">{error}</p>
              : !rows.length ? <p className="mg-table-state">Không có giao dịch trong kỳ.</p>
              : (
                <div className="mg-table-scroll" tabIndex={0} role="region" aria-label="Bảng tổng hợp giao dịch">
                  <table className="mg-table mg-source-sales-table">
                    <thead>
                      <tr>
                        <th scope="col">Cơ sở</th>
                        {HEADERS.map(label => <th scope="col" key={label} className="mg-align-right">{label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.key} className={row.key === 'unassigned' ? 'is-muted' : undefined}>
                          <td>{row.name}</td>
                          <td className="mg-align-right">{number(row.contracts)}</td>
                          <td className="mg-align-right">{number(row.rental_contracts)}</td>
                          <td className="mg-align-right">{number(row.ownership_contracts)}</td>
                          <td className="mg-align-right">{number(row.overdue_contracts)}</td>
                          <td className="mg-align-right">{money(row.sales)}</td>
                          <td className="mg-align-right">{money(row.revenue)}</td>
                          <td className="mg-align-right">{money(row.repair)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {ready && (
                      <tfoot>
                        <tr>
                          <th scope="row">Tổng</th>
                          <td className="mg-align-right">{number(total.contracts)}</td>
                          <td className="mg-align-right">{number(total.rental_contracts)}</td>
                          <td className="mg-align-right">{number(total.ownership_contracts)}</td>
                          <td className="mg-align-right">{number(total.overdue_contracts)}</td>
                          <td className="mg-align-right">{money(total.sales)}</td>
                          <td className="mg-align-right">{money(total.revenue)}</td>
                          <td className="mg-align-right">{money(total.repair)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, Search } from 'lucide-react';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { csvCell } from '@/lib/management/table-utils';
import { VEHICLE_TYPES } from '@/lib/management/config';
import { loadRentalReport, rentalReportQuery, type RentalReportScope, type RentalOverviewReport, type RentalOverviewRow, type VehicleRevenueReport, type VehicleRevenueRow, type VehicleRevenueDetail } from '@/lib/management/rental-reports';
import { Dialog } from './Dialog';

function download(rows: (string | number)[][], filename: string) {
  const data = rows.map(row => row.map(value => csvCell(String(value))).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', data], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function useReport<T>(path: string, query: URLSearchParams, revision: number) {
  const key = query.toString();
  const [loaded, setLoaded] = useState<{ key: string; value: T } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    loadRentalReport<T>(path, new URLSearchParams(key), controller.signal)
      .then(value => { if (!controller.signal.aborted) setLoaded({ key, value }); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được báo cáo.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, key, revision, retry]);
  return { report: loaded?.key === key ? loaded.value : null, loading: loading || (!error && loaded?.key !== key), error, reload: () => setRetry(value => value + 1) };
}
function ReportState({ loading, error, reload }: { loading: boolean; error: string; reload: () => void }) {
  return loading ? <p className="mg-table-state" role="status">Đang tải báo cáo…</p> : error ? <p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={reload}>Thử lại báo cáo</button></p> : null;
}
const OVERVIEW_COLUMNS = [
  ['revenue', 'Doanh thu thuê xe'], ['income', 'Tổng thu thực tế'], ['expense', 'Tổng chi thực tế'],
  ['deposit_income', 'Thu cọc'], ['renewal_income', 'Thu gia hạn'], ['rental_income', 'Thu phí thuê'],
  ['late_fee_income', 'Thu trả muộn'], ['deposit_refund_expense', 'Trả cọc'], ['rental_refund_expense', 'Hoàn trả sớm'],
] as const;
const overviewValue = (row: RentalOverviewRow, key: typeof OVERVIEW_COLUMNS[number][0]) => key === 'revenue' || key === 'income' || key === 'expense' ? row[key] : row.breakdown[key];
function OverviewTable({ report, days, onStore }: { report: RentalOverviewReport; days: boolean; onStore?: (row: RentalOverviewRow) => void }) {
  const label = (row: RentalOverviewRow) => days ? row.name.split('-').reverse().join('/') : row.name;
  return <><div className="mg-mobile-records mg-report-mobile" role="region" aria-label={days ? 'Thẻ thu chi theo ngày' : 'Thẻ thu chi theo cơ sở'}>
    {[...report.rows, ...(report.rows.length > 1 ? [report.total] : [])].map(row => <div className="mg-report-card" key={row.key}>
      <details><summary><strong>{label(row)}</strong><span>Doanh thu <b>{formatMoney(row.revenue)}</b></span><span>Thu {formatMoney(row.income)} · Chi {formatMoney(row.expense)}</span></summary>
        <dl>{OVERVIEW_COLUMNS.slice(3).map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{formatMoney(overviewValue(row, key))}</dd></div>)}</dl>
      </details>
      {onStore && /^[1-9]\d*$/.test(row.key) && <button type="button" className="mg-button" aria-label={`Xem theo ngày ${row.name}`} onClick={() => onStore(row)}>Xem từng ngày</button>}
    </div>)}{!report.rows.length && <p>Chưa có thu / chi thuê xe trong kỳ.</p>}
  </div><div className="mg-table-scroll mg-desktop-records" tabIndex={0} role="region" aria-label={days ? 'Thu chi theo ngày' : 'Thu chi theo cơ sở'}><table className="mg-table mg-rental-overview-table">
    <thead><tr><th scope="col">{days ? 'Ngày thu / chi' : 'Cơ sở'}</th>{OVERVIEW_COLUMNS.map(([key, title]) => <th key={key} scope="col" className="mg-align-right">{title}</th>)}</tr></thead>
    <tbody>{report.rows.map(row => <tr key={row.key}><th scope="row">{onStore && /^[1-9]\d*$/.test(row.key) ? <button type="button" className="mg-report-store-button" aria-label={`Xem theo ngày ${row.name}`} onClick={() => onStore(row)}>{label(row)}</button> : label(row)}</th>{OVERVIEW_COLUMNS.map(([key]) => <td key={key} className="mg-align-right">{formatMoney(overviewValue(row, key))}</td>)}</tr>)}
      {!report.rows.length && <tr><td colSpan={10}>Chưa có thu / chi thuê xe trong kỳ.</td></tr>}</tbody>
    <tfoot><tr><th scope="row">Tổng</th>{OVERVIEW_COLUMNS.map(([key]) => <td key={key} className="mg-align-right">{formatMoney(overviewValue(report.total, key))}</td>)}</tr></tfoot>
  </table></div></>;
}
function StoreOverview({ scope, row, onClose }: { scope: RentalReportScope; row: RentalOverviewRow; onClose: () => void }) {
  const query = rentalReportQuery({ ...scope, store: row.key }); query.set('view', 'days');
  const state = useReport<RentalOverviewReport>('rental-overview', query, 0);
  return <Dialog title={`Thuê xe · ${row.name}`} subtitle={`${scope.from} – ${scope.to} · Theo ngày thực thu / chi`} onClose={onClose}>
    <div className="mg-dialog-body"><ReportState {...state}/>{state.report && !state.loading && !state.error && <OverviewTable report={state.report} days/>}</div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button></div>
  </Dialog>;
}
export function RentalOverviewPanel({ from, to, store, retry }: RentalReportScope & { retry: number }) {
  const [view, setView] = useState<'stores' | 'days'>('stores'), [selected, setSelected] = useState<RentalOverviewRow | null>(null);
  const query = rentalReportQuery({ from, to, store }); query.set('view', view);
  const state = useReport<RentalOverviewReport>('rental-overview', query, retry), { report, loading, error } = state;
  const ready = report && !loading && !error;
  const otherIncome = report ? report.total.breakdown.repair_income + report.total.breakdown.extra_income + report.total.breakdown.other_income : 0;
  return <section className="mg-rental-revenue mg-data-panel" aria-label="Tổng quan báo cáo thuê xe" aria-busy={loading}>
    <div className="mg-rental-revenue-heading"><div><h2>Tổng quan báo cáo thuê xe</h2><p>Tổng hợp thu / chi hợp đồng thuê xe theo ngày và cơ sở</p></div></div>
    <div className="mg-report-totals">{OVERVIEW_COLUMNS.slice(0, 3).map(([key, title]) => <div key={key}><span>{title}</span><strong data-overview={key}>{ready ? formatMoney(overviewValue(report.total, key)) : '—'}</strong></div>)}</div>
    <p className="mg-rental-revenue-note">Doanh thu = Gia hạn + Phí thuê + Trả muộn − Hoàn trả sớm. Tổng thu gồm thêm cọc; tổng chi = Trả cọc + Hoàn trả sớm. Chỉ tính phiếu đã duyệt, theo ngày thu / chi tại Việt Nam. Bấm cơ sở để xem từng ngày.</p>
    <div className="mg-rental-revenue-toolbar"><div role="group" aria-label="Xem tổng quan theo">{(['stores', 'days'] as const).map(key => <button key={key} type="button" className={`mg-button${view === key ? ' is-active' : ''}`} aria-pressed={view === key} onClick={() => setView(key)}>{key === 'stores' ? 'Theo cơ sở' : 'Theo ngày'}</button>)}</div>
      <button type="button" className="mg-button" disabled={!ready || !report.rows.length} onClick={() => { if (report) download([[view === 'stores' ? 'Cơ sở' : 'Ngày', ...OVERVIEW_COLUMNS.map(([, title]) => title)], ...[...report.rows, report.total].map(row => [row.name, ...OVERVIEW_COLUMNS.map(([key]) => overviewValue(row, key))])], `tong-quan-thue-xe-${view}-${from}-${to}.csv`); }}><ArrowDownToLine size={15}/>Xuất Excel (CSV)</button>
    </div>
    <ReportState {...state}/>{ready && <>
      {(otherIncome !== 0 || report.total.breakdown.other_expense !== 0) && <p className="mg-rental-revenue-note">Ngoài công thức: {formatMoney(otherIncome)} thu sửa chữa / thu khác và {formatMoney(report.total.breakdown.other_expense)} chi khác. Xem Sổ quỹ để đối chiếu các khoản này.</p>}
      <OverviewTable report={report} days={view === 'days'} onStore={view === 'stores' ? setSelected : undefined}/>
    </>}
    {selected && <StoreOverview scope={{ from, to, store }} row={selected} onClose={() => setSelected(null)}/>}
  </section>;
}
function VehicleRevenueDetails({ row, scope, onClose }: { row: VehicleRevenueRow; scope: RentalReportScope; onClose: () => void }) {
  const query = rentalReportQuery(scope); query.set('vehicle_id', String(row.id));
  const state = useReport<VehicleRevenueDetail[]>('vehicle-revenue', query, 0);
  return <Dialog title={`Doanh thu xe · ${row.license || row.name}`} subtitle={`${row.name} · Lượt thuê bắt đầu ${scope.from} – ${scope.to}`} onClose={onClose}>
    <div className="mg-dialog-body"><ReportState {...state}/>{state.report && !state.loading && !state.error && <>
      <p>Tổng {state.report.length} lượt thuê · <strong>{formatMoney(state.report.reduce((total, line) => total + line.revenue, 0))}</strong></p>
      <div className="mg-table-scroll" role="region" aria-label="Các lượt thuê của xe" tabIndex={0}><table className="mg-table"><thead><tr><th scope="col">Hợp đồng</th><th scope="col">Ngày bắt đầu thuê</th><th scope="col">Dự kiến trả</th><th scope="col">Phí thuê</th><th scope="col">Gia hạn</th><th scope="col">Điều chỉnh muộn / sớm</th><th scope="col">Doanh thu</th></tr></thead><tbody>
        {state.report.map(line => <tr key={line.id}><th scope="row"><Link href={`/contracts?contract_id=${line.order_id}`}>{line.code}</Link></th><td>{formatDateTime(line.rent_at || '')}</td><td>{formatDateTime(line.return_at || '')}</td><td>{formatMoney(line.rental)}</td><td>{formatMoney(line.renewal)}</td><td>{formatMoney(line.adjustment)}</td><td>{formatMoney(line.revenue)}</td></tr>)}
        {!state.report.length && <tr><td colSpan={6}>Xe chưa có lượt thuê trong kỳ.</td></tr>}
      </tbody></table></div></>}</div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button></div>
  </Dialog>;
}
export function VehicleRevenuePanel({ from, to, store, retry }: RentalReportScope & { retry: number }) {
  const [search, setSearch] = useState(''), [debounced, setDebounced] = useState(''), [page, setPage] = useState(1), [sort, setSort] = useState('revenue'), [direction, setDirection] = useState('desc');
  const [selected, setSelected] = useState<VehicleRevenueRow | null>(null), [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer); }, [search]);
  const query = rentalReportQuery({ from, to, store });
  for (const [key, value] of Object.entries({ search: debounced, page: String(page), sort, direction })) query.set(key, value);
  const state = useReport<VehicleRevenueReport>('vehicle-revenue', query, retry), { report, loading, error } = state;
  const busy = loading || search !== debounced, ready = report && !busy && !error;
  const pages = Math.max(1, Math.ceil((report?.total || 0) / (report?.size || 10))), activePage = report?.page || page;
  async function exportCsv() {
    setExporting(true); setExportError('');
    try {
      const params = new URLSearchParams(query); params.set('mode', 'all');
      const all = await loadRentalReport<VehicleRevenueReport>('vehicle-revenue', params);
      download([['Tên xe', 'Biển số', 'Cơ sở hiện tại', 'Lượt thuê', 'Phí thuê', 'Gia hạn', 'Điều chỉnh muộn / sớm', 'Doanh thu'], ...all.rows.map(row => [row.name, row.license, row.store_name, row.rentals, row.rental, row.renewal, row.adjustment, row.revenue]), ['Tổng', '', '', all.rentals, all.rental, all.renewal, all.adjustment, all.revenue]], `doanh-thu-tung-xe-${from}-${to}.csv`);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Không xuất được báo cáo.'); }
    finally { setExporting(false); }
  }
  return <section className="mg-rental-revenue mg-data-panel" aria-label="Báo cáo doanh thu từng xe" aria-busy={busy}>
    <div className="mg-rental-revenue-heading"><div><h2>Báo cáo doanh thu xe</h2><p>Lượt thuê bắt đầu trong kỳ · Kế thừa cách tính từng xe của app cũ</p></div><strong data-vehicle-revenue>{ready ? formatMoney(report.revenue) : '—'}</strong></div>
    <p className="mg-rental-revenue-note">Hợp đồng cũ dùng tiền từng lượt thuê đã chốt. Hợp đồng web mới chia tiền thuê gốc theo số xe cùng đơn giá, cộng gia hạn từng xe và điều chỉnh trả muộn / trả sớm; tách cọc và phí khác. Số này theo lượt thuê, có thể khác doanh thu theo ngày thực thu. Cơ sở là nơi hiện quản lý xe.</p>
    <div className="mg-rental-revenue-toolbar"><label className="mg-report-search"><Search size={16} aria-hidden="true"/><input aria-label="Tìm xe trong báo cáo" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Biển số, tên xe hoặc ID"/></label>
      <label>Sắp xếp <select aria-label="Sắp xếp báo cáo xe" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="revenue">Doanh thu</option><option value="rentals">Lượt thuê</option><option value="license">Biển số</option></select></label>
      <button type="button" className="mg-button" aria-label={direction === 'desc' ? 'Đang giảm dần, đổi sang tăng dần' : 'Đang tăng dần, đổi sang giảm dần'} onClick={() => { setDirection(value => value === 'desc' ? 'asc' : 'desc'); setPage(1); }}>{direction === 'desc' ? 'Giảm dần' : 'Tăng dần'}</button>
      <button type="button" className="mg-button" disabled={!ready || !report.total || exporting} onClick={() => void exportCsv()}><ArrowDownToLine size={15}/>{exporting ? 'Đang xuất…' : 'Xuất Excel (CSV)'}</button>
    </div>
    {exportError && <p role="alert" className="mg-field-error">{exportError}</p>}
    <ReportState loading={busy} error={error} reload={state.reload}/>{ready && <>
      <div className="mg-mobile-records mg-report-mobile" role="region" aria-label="Thẻ doanh thu từng xe">{report.rows.map(row => <div key={row.id} className="mg-report-card">
        <details><summary><strong>{row.name} · {row.license}</strong><span>Doanh thu <b>{formatMoney(row.revenue)}</b></span><span>{row.rentals} lượt thuê · {row.store_name}</span></summary>
          <dl><div><dt>Phí thuê</dt><dd>{formatMoney(row.rental)}</dd></div><div><dt>Gia hạn</dt><dd>{formatMoney(row.renewal)}</dd></div><div><dt>Điều chỉnh muộn / sớm</dt><dd>{formatMoney(row.adjustment)}</dd></div></dl>
        </details>
        <button type="button" className="mg-button" aria-label={`Xem lượt thuê xe ${row.license || row.name}`} onClick={() => setSelected(row)}>Xem lượt thuê</button>
      </div>)}{!report.rows.length && <p>Không có xe khớp bộ lọc.</p>}</div>
      <div className="mg-table-scroll mg-desktop-records" role="region" aria-label="Doanh thu từng xe" tabIndex={0}><table className="mg-table mg-vehicle-revenue-table"><thead><tr><th scope="col">Tên xe / biển số</th><th scope="col">Cơ sở</th><th scope="col">Loại / đời xe</th><th scope="col" className="mg-align-right">Lượt thuê</th><th scope="col" className="mg-align-right">Phí thuê</th><th scope="col" className="mg-align-right">Gia hạn</th><th scope="col" className="mg-align-right">Điều chỉnh muộn / sớm</th><th scope="col" className="mg-align-right">Doanh thu</th><th scope="col">Chi tiết</th></tr></thead>
        <tbody>{report.rows.map(row => <tr key={row.id}><th scope="row">{row.name}<br/><span>{row.license || 'Chưa có biển số'}</span></th><td>{row.store_name}</td><td>{VEHICLE_TYPES.find(type => type.value === row.type)?.label || row.type} · {row.year || '—'}</td><td className="mg-align-right">{row.rentals}</td><td className="mg-align-right">{formatMoney(row.rental)}</td><td className="mg-align-right">{formatMoney(row.renewal)}</td><td className="mg-align-right">{formatMoney(row.adjustment)}</td><td className="mg-align-right"><strong>{formatMoney(row.revenue)}</strong></td><td><button type="button" className="mg-button" aria-label={`Xem lượt thuê xe ${row.license || row.name}`} onClick={() => setSelected(row)}>Xem lượt thuê</button></td></tr>)}
          {!report.rows.length && <tr><td colSpan={8}>Không có xe khớp bộ lọc.</td></tr>}</tbody>
        <tfoot><tr><th scope="row" colSpan={3}>Tổng toàn bộ xe khớp bộ lọc</th><td className="mg-align-right">{report.rentals}</td><td className="mg-align-right">{formatMoney(report.rental)}</td><td className="mg-align-right">{formatMoney(report.renewal)}</td><td className="mg-align-right">{formatMoney(report.adjustment)}</td><td className="mg-align-right">{formatMoney(report.revenue)}</td><td/></tr></tfoot>
      </table></div>
      <nav className="mg-report-pagination" aria-label="Phân trang báo cáo xe"><span>{report.total} xe · Trang {activePage} / {pages}</span><div>
        <button type="button" className="mg-button" disabled={busy || activePage <= 1} onClick={() => setPage(1)}>Trang đầu</button>
        <button type="button" className="mg-button" disabled={busy || activePage <= 1} onClick={() => setPage(activePage - 1)}>Trước</button>
        <button type="button" className="mg-button" disabled={busy || activePage >= pages} onClick={() => setPage(activePage + 1)}>Sau</button>
        <button type="button" className="mg-button" disabled={busy || activePage >= pages} onClick={() => setPage(pages)}>Trang cuối</button>
      </div></nav>
    </>}
    {selected && <VehicleRevenueDetails row={selected} scope={{ from, to, store }} onClose={() => setSelected(null)}/>}
  </section>;
}

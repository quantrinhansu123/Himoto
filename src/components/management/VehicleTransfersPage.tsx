'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { defaultTransferHistoryQuery, loadTransferHistory, type TransferHistoryQuery, type TransferHistoryResult, type TransferHistoryRow } from '@/lib/management/vehicle-transfer-history';
import { formatDateTime } from '@/lib/formatters';
import { vietnamDate } from '@/lib/management/duty-roster';
import { useManagement } from './ManagementProvider';
import { MobileDetailsCard } from './MobileDetailsCard';
import { Dialog } from './Dialog';
import { VehicleTransferTelegramPanel } from './VehicleTransferTelegramPanel';

const dash = (value: string) => value || '—';
const direction = (row: TransferHistoryRow) => `${row.from_store || 'Chưa rõ cơ sở đi'} → ${row.to_store || 'Chưa rõ cơ sở đến'}`;
function Changes({ row,onTelegram }: { row: TransferHistoryRow;onTelegram:()=>void }) {
  return <div className="mg-vehicle-audit-content">{row.telegram_event_id&&<button type="button" className="mg-button" onClick={onTelegram}>Telegram lượt chuyển/nhận</button>}{row.changes.length > 0 && <ul>{row.changes.map(change => <li key={change.field}>
    <strong>{change.label}:</strong> {dash(change.from)} → {dash(change.to)}</li>)}</ul>}{row.note && <p>{row.note}</p>}{!row.changes.length && !row.note && '—'}</div>;
}

export function VehicleTransfersPage() {
  const { dataset, selectedStore, resources, ensureData } = useManagement();
  const [filters, setFilters] = useState(defaultTransferHistoryQuery);
  const [query, setQuery] = useState(defaultTransferHistoryQuery);
  const [report, setReport] = useState<TransferHistoryResult | null>(null);
  const [telegramRow,setTelegramRow]=useState<TransferHistoryRow|null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const invalidDates = !filters.from || !filters.to || filters.from > filters.to;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void loadTransferHistory({ ...query, store: selectedStore, page: query.store === selectedStore ? query.page : 1 }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setReport(value); })
      .catch(cause => { if (!controller.signal.aborted) { setReport(null); setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử luân chuyển.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, selectedStore, retry]);
  function apply(event: FormEvent) {
    event.preventDefault(); if (invalidDates) return;
    setQuery({ ...filters, store: selectedStore, page: 1 });
  }
  function today() {
    const next = { ...filters, from: vietnamDate(), to: vietnamDate(), store: selectedStore, page: 1 };
    setFilters(next); setQuery(next);
  }
  function change(key: keyof TransferHistoryQuery, value: string) { setFilters(current => ({ ...current, [key]: value })); }
  const stores = dataset?.stores || [], rows = report?.rows || [], pages = Math.max(1, Math.ceil((report?.total || 0) / (report?.size || 25)));
  return <section className="mg-page mg-page-vehicle-transfers" aria-label="Lịch sử luân chuyển">
    {telegramRow?.telegram_event_id&&<Dialog title="Telegram · Điều chuyển xe" onClose={()=>setTelegramRow(null)}><div className="mg-dialog-body"><VehicleTransferTelegramPanel vehicleId={telegramRow.vehicle_id} eventId={telegramRow.telegram_event_id}/></div><div className="mg-dialog-footer"><button className="mg-button" type="button" onClick={()=>setTelegramRow(null)}>Đóng</button></div></Dialog>}
    <div className="mg-page-content">
      <div className="mg-page-heading"><div><h1>Lịch sử luân chuyển<span className="mg-title-count">{loading || error ? '—' : report?.total || 0}</span></h1>
        <p>Xem xe chuyển từ cơ sở nào sang cơ sở nào trong ngày. Mỗi dòng là một lần chuyển hoặc nhận xe.</p></div>
        <div className="mg-heading-actions"><Link href="/vehicles" className="mg-button"><ArrowLeftRight size={16}/>Danh sách xe</Link>
          <button type="button" className="mg-button" disabled={loading} onClick={() => setRetry(value => value + 1)}><RefreshCw size={16}/>Làm mới</button></div></div>
      <div className="mg-data-panel">
        <form className="mg-transfer-filters" onSubmit={apply} aria-label="Lọc lịch sử luân chuyển">
          <label>Từ ngày<input type="date" value={filters.from} onChange={event => change('from', event.target.value)} aria-invalid={invalidDates}/></label>
          <label>Đến ngày<input type="date" value={filters.to} onChange={event => change('to', event.target.value)} aria-invalid={invalidDates}/></label>
          <label>Cơ sở chuyển đi<select aria-label="Cơ sở chuyển đi" value={filters.fromStore} onChange={event => change('fromStore', event.target.value)}><option value="">Tất cả cơ sở đi</option>{stores.map(store => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>
          <label>Cơ sở nhận<select aria-label="Cơ sở nhận" value={filters.toStore} onChange={event => change('toStore', event.target.value)}><option value="">Tất cả cơ sở nhận</option>{stores.map(store => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>
          <label>Thao tác<select aria-label="Thao tác" value={filters.action} onChange={event => change('action', event.target.value)}><option value="">Tất cả thao tác</option><option value="transfer">Chuyển xe</option><option value="receive">Nhận xe</option></select></label>
          <label className="mg-transfer-search">Tìm kiếm<input type="search" value={filters.search} maxLength={200} placeholder="Biển số, tên xe, người thao tác…" onChange={event => change('search', event.target.value)}/></label>
          <div className="mg-transfer-filter-actions"><button type="submit" className="mg-button mg-button-primary" disabled={invalidDates}><Search size={16}/>Xem lịch sử</button><button type="button" className="mg-button" onClick={today}>Hôm nay</button></div>
          {invalidDates && <p className="mg-field-error" role="alert">Chọn khoảng ngày hợp lệ; ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</p>}
          {resources.stores.error && <p className="mg-field-error" role="alert">Không tải được danh sách cơ sở. <button type="button" className="mg-button" onClick={() => void ensureData(['stores'], true).catch(() => {})}>Thử lại</button></p>}
        </form>
        {loading ? <div className="mg-table-state" role="status"><LoaderCircle size={24} className="mg-spin"/>Đang tải lịch sử luân chuyển…</div>
          : error ? <div className="mg-table-state"><p className="mg-field-error" role="alert">{error}</p><button type="button" className="mg-button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>
          : !rows.length ? <p className="mg-table-state">Không có thao tác luân chuyển trong khoảng ngày và bộ lọc đã chọn.</p>
          : <>
            <div className="mg-mobile-records"><ul className="mg-mobile-card-list">{rows.map(row => <MobileDetailsCard key={row.id} title={`${row.label} · ${row.license || row.vehicle_name}`}
              summary={<><span>{formatDateTime(row.at)}</span><span>{dash(row.actor)}</span></>} preview={direction(row)}
              fields={[["Tên xe", dash(row.vehicle_name)], ["Biển số", dash(row.license)], ["Cơ sở chuyển đi", dash(row.from_store)], ["Cơ sở nhận", dash(row.to_store)],
                ["Ngày giờ", formatDateTime(row.at)], ["Người thao tác", dash(row.actor)], ["Nội dung thao tác", <Changes key="changes" row={row} onTelegram={()=>setTelegramRow(row)}/>]]}/>)}</ul></div>
            <div className="mg-table-scroll mg-desktop-records" tabIndex={0} role="region" aria-label="Bảng lịch sử luân chuyển"><table className="mg-table mg-transfer-history-table">
              <thead><tr>{['Ngày giờ','Thao tác','Biển số / Tên xe','Cơ sở chuyển đi','Cơ sở nhận','Người thao tác','Nội dung thao tác'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{rows.map(row => <tr key={row.id}><td>{formatDateTime(row.at)}</td><td><span className={`mg-status mg-status-${row.action === 'receive' ? 'green' : 'blue'}`}>{row.label}</span></td>
                <td><strong>{dash(row.license)}</strong><small className="mg-transfer-vehicle-name">{row.vehicle_name}</small></td><td>{dash(row.from_store)}</td><td>{dash(row.to_store)}</td><td>{dash(row.actor)}</td><td><Changes row={row} onTelegram={()=>setTelegramRow(row)}/></td></tr>)}</tbody>
            </table></div>
          </>}
        {!loading && !error && report && report.total > 0 && <div className="mg-transfer-pagination"><span>{report.total} thao tác · Trang {report.page}/{pages}</span>
          <div><button type="button" className="mg-button" aria-label="Trang trước" disabled={report.page <= 1} onClick={() => setQuery(current => ({ ...current, store: selectedStore, page: report.page - 1 }))}><ChevronLeft size={16}/></button>
            <button type="button" className="mg-button" aria-label="Trang sau" disabled={report.page >= pages} onClick={() => setQuery(current => ({ ...current, store: selectedStore, page: report.page + 1 }))}><ChevronRight size={16}/></button></div></div>}
      </div>
    </div>
  </section>;
}

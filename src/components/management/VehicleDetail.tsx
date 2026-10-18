'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Check, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { Dialog } from './Dialog';
import type { VehicleActionMode } from './VehicleActionDialog';
import { useManagement } from './ManagementProvider';
import { ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { loadVehicleHistory, VEHICLE_EVENT_ACTIONS, VehicleEvent, VehicleEventAction, vehicleEventRoute, vehicleTransferRoute } from '@/lib/management/vehicle-history';
import { optionLabel, statusTone } from '@/lib/management/config';
import { formatValue } from '@/lib/management/table-utils';
import { ManagementConfig, ManagementRow } from '@/lib/management/types';
import { formatDateTime } from '@/lib/formatters';
import { MobileDetailsCard } from './MobileDetailsCard';
import { VehicleTransferTelegramPanel } from './VehicleTransferTelegramPanel';
import { GpsEvidence } from './GpsEvidence';

const SECTIONS = [
  { id: 'details', label: 'Thông tin xe' },
  { id: 'history', label: 'Lịch sử' },
] as const;
type VehicleSection = (typeof SECTIONS)[number]['id'];
const ACTION_TONE: Record<VehicleEventAction, string> = { rent: 'blue', return: 'green', transfer: 'amber', repair: 'red', status: 'gray', swap: 'amber', note: 'gray', create: 'green', edit:'gray' };

export function VehicleDetail({ row, config, canEdit, onEdit, onClose, onAction }: { row: ManagementRow; config: ManagementConfig; canEdit: boolean; onEdit: () => void; onClose: () => void; onAction: (mode: VehicleActionMode) => void }) {
  const { source,can } = useManagement();
  const [section, setSection] = useState<VehicleSection>('details');
  const [events, setEvents] = useState<VehicleEvent[] | null>(null);
  const [action, setAction] = useState<VehicleEventAction | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [telegramEvent,setTelegramEvent]=useState<number|null>(null);
  const fetchHistory = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError('');
    loadVehicleHistory(row.id, signal).then(value => { if (!signal?.aborted) setEvents(value); }).catch(cause => {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử xe.');
    }).finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [row.id]);
  useEffect(() => {
    if (section !== 'history' || events || source !== 'api') return;
    const controller = new AbortController();
    fetchHistory(controller.signal);
    return () => controller.abort();
  }, [section, events, source, fetchHistory]);

  function panel(id: VehicleSection, children: ReactNode) {
    return <section id={`vehicle-detail-panel-${id}`} role="tabpanel" aria-labelledby={`vehicle-detail-tab-${id}`} hidden={section !== id} className="mg-contract-panel">{children}</section>;
  }
  const shown = (events || []).filter(event => !action || event.action === action);
  const dash = (value: string) => value || '—';
  const content = (event:VehicleEvent) => <div className="mg-vehicle-audit-content">
    {event.telegram_event_id&&source==='api'&&<button type="button" className="mg-button" onClick={()=>setTelegramEvent(event.telegram_event_id!)}>Telegram lượt chuyển/nhận</button>}
    {Boolean(event.changes?.length) && <ul>{event.changes!.map(change=><li key={change.field}><strong>{change.label}: </strong><span>{dash(change.from)}</span><span aria-label="thành"> → </span><span>{dash(change.to)}</span></li>)}</ul>}
    {event.note && <p>{event.order_id ? <Link href={`/contracts?contract_id=${event.order_id}`} onClick={onClose}>{event.note}</Link> : event.note}</p>}
    {!event.changes?.length && !event.note && (event.action==='edit'?'Không có trường thay đổi.':'—')}
  </div>;

  if(telegramEvent)return <Dialog title="Telegram · Điều chuyển xe" onClose={()=>setTelegramEvent(null)}><div className="mg-dialog-body"><VehicleTransferTelegramPanel vehicleId={row.id} eventId={telegramEvent}/></div><div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={()=>setTelegramEvent(null)}>Quay lại lịch sử xe</button></div></Dialog>;
  return <Dialog title={String(row.name)} subtitle={`${row.license || row.code} · ${config.title}`} className="mg-customer-detail mg-vehicle-detail" onClose={onClose}>
    <div className="mg-dialog-body">
      <ContractSectionTabs prefix="vehicle-detail" sections={SECTIONS} active={section} onChange={setSection} />
      {row.status==='in_transit'&&<div className="mg-transfer-pending" role="status"><strong>Xe đang Chờ luân chuyển</strong><p className="mg-transfer-direction">{vehicleTransferRoute(row)||'Chưa có thông tin cơ sở chuyển đi. Kiểm tra tab Lịch sử.'}</p><p>Khi xe đã đến nơi, bấm <strong>Nhận xe</strong> bên dưới.</p></div>}
      {panel('details', <>
        <span className={`mg-status mg-status-${statusTone(row.status)}`}><span />{optionLabel(config, 'status', row.status)}</span>
        {row.location_status && <span className={`mg-status mg-status-${statusTone(String(row.location_status))}`}><span />{optionLabel(config, 'location_status', String(row.location_status))}</span>}
        {row.gps_last_sync&&<p>Đồng bộ GPS: {formatDateTime(String(row.gps_last_sync))} · {row.gps_provider}</p>}
        <GpsEvidence syncedAt={String(row.gps_last_sync||'')} heartbeatAt={String(row.gps_heartbeat_at||'')} positionAt={String(row.gps_position_at||'')}/>
        {[0,1].includes(Number(row.gps_ignition))&&row.gps_ignition!==''&&<p>Khóa điện: {row.gps_ignition?'Bật':'Tắt'} · độc lập với kết nối GPS</p>}
        {typeof row.gps_latitude==='number'&&typeof row.gps_longitude==='number'&&<a className="mg-button" href={`https://www.google.com/maps?q=${row.gps_latitude},${row.gps_longitude}`} target="_blank" rel="noopener noreferrer">Mở vị trí GPS</a>}
        <dl className="mg-detail-grid">{config.columns.filter(column => column.key !== 'name' && column.key !== 'status' && column.key !== 'location_status').map(column => <div key={column.key}><dt>{column.label}</dt><dd>{optionLabel(config, column.key, formatValue(row[column.key], column.format))}</dd></div>)}
          {config.fields.filter(field => !config.columns.some(column => column.key === field.key) && field.key !== 'store_id').map(field => <div key={field.key}><dt>{field.label}</dt><dd>{row[field.key] || '—'}</dd></div>)}</dl>
      </>)}
      {panel('history', <>
        <div className="mg-contract-history-toolbar"><p>Ngày giờ, người thao tác và các trường đã đổi từ giá trị cũ → mới. Lịch sử cũ giữ nội dung đã ghi nhận.</p>
          <div className="mg-vehicle-history-actions">
            <select aria-label="Lọc hành động" value={action} onChange={event => setAction(event.target.value as VehicleEventAction | '')}>
              <option value="">Tất cả hành động</option>{VEHICLE_EVENT_ACTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            {source === 'api' && <button type="button" className="mg-button" disabled={loading} onClick={() => fetchHistory()}>{loading ? <LoaderCircle size={15} className="mg-spin" /> : <RotateCcw size={15} />}Làm mới</button>}
          </div></div>
        {source !== 'api' && <p className="mg-contract-history-state">Lịch sử chỉ có khi kết nối dữ liệu Supabase.</p>}
        {loading && !events && <p className="mg-contract-history-state" role="status"><LoaderCircle size={16} className="mg-spin" /> Đang tải lịch sử xe…</p>}
        {error && <p className="mg-contract-history-state mg-field-error" role="alert">{error}</p>}
        {events && shown.length > 0 && <div className="mg-mobile-records"><ul className="mg-mobile-card-list">{shown.map(event => <MobileDetailsCard key={event.key} title={event.label}
          summary={<><span>{formatDateTime(event.at || '')}</span>{!vehicleEventRoute(event)&&<span>{dash(event.location)}</span>}</>}
          preview={vehicleEventRoute(event)}
          fields={[["Tên xe", dash(event.vehicle_name)], ["Biển số", dash(event.license)], ["Vị trí", dash(event.location)], ["Cơ sở phụ trách", dash(event.responsible_store)], ["Cơ sở sử dụng xe", dash(event.beneficiary_store)],
            ["Nội dung thao tác", content(event)], ["Ngày giờ", formatDateTime(event.at || '')], ["Người thao tác", dash(event.actor)]]} />)}</ul></div>}
        {events && (shown.length ? <div className="mg-table-scroll mg-desktop-records"><table className="mg-table mg-vehicle-history-table">
          <thead><tr><th>Hành động</th><th>Tên xe</th><th>Biển số</th><th>Vị trí</th><th>Cơ sở phụ trách</th><th>Cơ sở sử dụng xe</th><th>Nội dung thao tác</th><th>Ngày giờ</th><th>Người thao tác</th></tr></thead>
          <tbody>{shown.map(event => <tr key={event.key}>
            <td><span className={`mg-status mg-status-${ACTION_TONE[event.action]}`}><span />{event.label}</span></td>
            <td>{dash(event.vehicle_name)}</td>
            <td>{dash(event.license)}</td>
            <td>{dash(event.location)}</td>
            <td>{dash(event.responsible_store)}</td>
            <td>{dash(event.beneficiary_store)}</td>
            <td className="mg-vehicle-history-note">{content(event)}</td>
            <td>{formatDateTime(event.at || '')}</td>
            <td>{dash(event.actor)}</td>
          </tr>)}</tbody></table></div> : <p className="mg-contract-history-state">{action ? 'Không có hành động nào khớp bộ lọc.' : 'Xe chưa có lịch sử.'}</p>)}
      </>)}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>
      {can('vehicles.receive')&&source==='api'&&row.status==='in_transit'&&<button type="button" className="mg-button mg-button-primary" onClick={()=>onAction('receive')}><Check size={16}/>Nhận xe</button>}
      {source === 'api' && <>
        {can('vehicles.transfer')&&row.status!=='in_transit'&&<button type="button" className="mg-button" onClick={() => onAction('transfer')}><ArrowLeftRight size={16} />Chuyển xe</button>}
        {can('vehicles.write')&&<button type="button" className="mg-button" onClick={() => onAction('status')}><RefreshCw size={16} />Đổi trạng thái</button>}</>}
      {canEdit && <button type="button" className="mg-button mg-button-primary" onClick={onEdit}>Chỉnh sửa thông tin</button>}</div>
  </Dialog>;
}

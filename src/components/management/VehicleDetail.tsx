'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { Dialog } from './Dialog';
import type { VehicleActionMode } from './VehicleActionDialog';
import { useManagement } from './ManagementProvider';
import { ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { loadVehicleHistory, VEHICLE_EVENT_ACTIONS, VehicleEvent, VehicleEventAction } from '@/lib/management/vehicle-history';
import { optionLabel, statusTone } from '@/lib/management/config';
import { formatValue } from '@/lib/management/table-utils';
import { ManagementConfig, ManagementRow } from '@/lib/management/types';
import { formatDateTime } from '@/lib/formatters';
import { MobileDetailsCard } from './MobileDetailsCard';

const SECTIONS = [
  { id: 'details', label: 'Thông tin xe' },
  { id: 'history', label: 'Lịch sử' },
] as const;
type VehicleSection = (typeof SECTIONS)[number]['id'];
const ACTION_TONE: Record<VehicleEventAction, string> = { rent: 'blue', return: 'green', transfer: 'amber', repair: 'red', status: 'gray', swap: 'amber', note: 'gray', create: 'green' };

export function VehicleDetail({ row, config, canEdit, onEdit, onClose, onAction }: { row: ManagementRow; config: ManagementConfig; canEdit: boolean; onEdit: () => void; onClose: () => void; onAction: (mode: VehicleActionMode) => void }) {
  const { source } = useManagement();
  const [section, setSection] = useState<VehicleSection>('details');
  const [events, setEvents] = useState<VehicleEvent[] | null>(null);
  const [action, setAction] = useState<VehicleEventAction | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  return <Dialog title={String(row.name)} subtitle={`${row.license || row.code} · ${config.title}`} className="mg-customer-detail mg-vehicle-detail" onClose={onClose}>
    <div className="mg-dialog-body">
      <ContractSectionTabs prefix="vehicle-detail" sections={SECTIONS} active={section} onChange={setSection} />
      {panel('details', <>
        <span className={`mg-status mg-status-${statusTone(row.status)}`}><span />{optionLabel(config, 'status', row.status)}</span>
        <dl className="mg-detail-grid">{config.columns.filter(column => column.key !== 'name' && column.key !== 'status').map(column => <div key={column.key}><dt>{column.label}</dt><dd>{optionLabel(config, column.key, formatValue(row[column.key], column.format))}</dd></div>)}
          {config.fields.filter(field => !config.columns.some(column => column.key === field.key) && field.key !== 'store_id').map(field => <div key={field.key}><dt>{field.label}</dt><dd>{row[field.key] || '—'}</dd></div>)}</dl>
      </>)}
      {panel('history', <>
        <div className="mg-contract-history-toolbar"><p>Thuê, trả xe, chuyển kho, sửa chữa và thay đổi trạng thái của xe.</p>
          <div className="mg-vehicle-history-actions">
            <select aria-label="Lọc hành động" value={action} onChange={event => setAction(event.target.value as VehicleEventAction | '')}>
              <option value="">Tất cả hành động</option>{VEHICLE_EVENT_ACTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            {source === 'api' && <button type="button" className="mg-button" disabled={loading} onClick={() => fetchHistory()}>{loading ? <LoaderCircle size={15} className="mg-spin" /> : <RotateCcw size={15} />}Làm mới</button>}
          </div></div>
        {source !== 'api' && <p className="mg-contract-history-state">Lịch sử chỉ có khi kết nối dữ liệu Supabase.</p>}
        {loading && !events && <p className="mg-contract-history-state" role="status"><LoaderCircle size={16} className="mg-spin" /> Đang tải lịch sử xe…</p>}
        {error && <p className="mg-contract-history-state mg-field-error" role="alert">{error}</p>}
        {events && shown.length > 0 && <div className="mg-mobile-records"><ul className="mg-mobile-card-list">{shown.map(event => <MobileDetailsCard key={event.key} title={event.label}
          summary={<><span>{formatDateTime(event.at || '')}</span><span>{dash(event.location)}</span></>}
          fields={[["Tên xe", dash(event.vehicle_name)], ["Biển số", dash(event.license)], ["Vị trí", dash(event.location)], ["Cơ sở phụ trách", dash(event.responsible_store)], ["Cơ sở thụ hưởng", dash(event.beneficiary_store)],
            ["Ghi chú", event.order_id ? <Link href={`/contracts?contract_id=${event.order_id}`} onClick={onClose}>{dash(event.note)}</Link> : dash(event.note)], ["Ngày giờ", formatDateTime(event.at || '')], ["Người tạo", dash(event.actor)]]} />)}</ul></div>}
        {events && (shown.length ? <div className="mg-table-scroll mg-desktop-records"><table className="mg-table mg-vehicle-history-table">
          <thead><tr><th>Hành động</th><th>Tên xe</th><th>Biển số</th><th>Vị trí</th><th>Cơ sở phụ trách</th><th>Cơ sở thụ hưởng</th><th>Ghi chú</th><th>Ngày giờ</th><th>Người tạo</th></tr></thead>
          <tbody>{shown.map(event => <tr key={event.key}>
            <td><span className={`mg-status mg-status-${ACTION_TONE[event.action]}`}><span />{event.label}</span></td>
            <td>{dash(event.vehicle_name)}</td>
            <td>{dash(event.license)}</td>
            <td>{dash(event.location)}</td>
            <td>{dash(event.responsible_store)}</td>
            <td>{dash(event.beneficiary_store)}</td>
            <td className="mg-vehicle-history-note">{event.order_id ? <Link href={`/contracts?contract_id=${event.order_id}`} onClick={onClose}>{dash(event.note)}</Link> : dash(event.note)}</td>
            <td>{formatDateTime(event.at || '')}</td>
            <td>{dash(event.actor)}</td>
          </tr>)}</tbody></table></div> : <p className="mg-contract-history-state">{action ? 'Không có hành động nào khớp bộ lọc.' : 'Xe chưa có lịch sử.'}</p>)}
      </>)}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>
      {canEdit && source === 'api' && <>
        <button type="button" className="mg-button" onClick={() => onAction('transfer')}><ArrowLeftRight size={16} />Chuyển xe</button>
        <button type="button" className="mg-button" onClick={() => onAction('status')}><RefreshCw size={16} />Đổi trạng thái</button></>}
      {canEdit && <button type="button" className="mg-button mg-button-primary" onClick={onEdit}>Chỉnh sửa thông tin</button>}</div>
  </Dialog>;
}

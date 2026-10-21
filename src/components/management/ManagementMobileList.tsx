'use client';

import { ArrowDown, ArrowUp, FileSearch, LoaderCircle, RotateCcw } from 'lucide-react';
import { ManagementConfig, ManagementKind, ManagementRow } from '@/lib/management/types';
import { optionLabel, statusTone } from '@/lib/management/config';
import { formatValue } from '@/lib/management/table-utils';
import { RowAction, RowActionsMenu } from './RowActionsMenu';
import { vehicleTransferRoute } from '@/lib/management/vehicle-history';
import { GpsEvidence } from './GpsEvidence';

const SUMMARY_KEYS: Record<ManagementKind, string[]> = {
  vehicles: ['license', 'holder_name', 'store_name', 'overdue_days'],
  contracts: ['code', 'customer_phone', 'license', 'end_date'],
  customers: ['phone', 'id_card', 'store_name'],
  staff: ['phone', 'position', 'store_name'],
  stores: ['phone', 'address', 'manager_name'],
};

interface Props {
  config: ManagementConfig;
  rows: ManagementRow[];
  sortKey: string;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  onView: (row: ManagementRow) => void;
  actions: (row: ManagementRow) => RowAction[];
  busyId?: number | null;
  loading: boolean;
  error: string;
  isFiltered: boolean;
  onReset: () => void;
  onRetry: () => void;
  selectedIds?: ReadonlySet<number>;
  onSelectionChange?: (ids: number[], selected: boolean) => void;
}

export function ManagementMobileList({ config, rows, sortKey, sortDirection, onSort, onView, actions, busyId, loading, error, isFiltered, onReset, onRetry, selectedIds, onSelectionChange }: Props) {
  const selectable = Boolean(selectedIds && onSelectionChange);
  const showOverdue=config.kind==='contracts'&&config.columns.some(column=>column.key==='overdue_minutes');
  const ids = rows.map(row => row.id);
  const selected = ids.filter(id => selectedIds?.has(id)).length;
  return <div className="mg-mobile-records" aria-busy={loading}>
    <div className="mg-mobile-list-controls">
      {selectable && <label className="mg-mobile-select-all"><input type="checkbox" aria-label="Chọn tất cả thẻ trên trang này"
        disabled={loading || Boolean(error) || !rows.length} checked={rows.length > 0 && selected === rows.length}
        ref={input => { if (input) input.indeterminate = selected > 0 && selected < rows.length; }}
        onChange={event => onSelectionChange?.(ids, event.target.checked)} /><span>Chọn tất cả</span></label>}
      <label className="mg-mobile-sort"><span className="mg-sr-only">Sắp xếp danh sách</span><select aria-label="Sắp xếp danh sách" value={sortKey} onChange={event => onSort(event.target.value)}>
        {config.columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
      </select></label>
      <button type="button" className="mg-icon-button" aria-label={sortDirection === 'asc' ? 'Đang tăng dần, đổi sang giảm dần' : 'Đang giảm dần, đổi sang tăng dần'} onClick={() => onSort(sortKey)}>
        {sortDirection === 'asc' ? <ArrowUp size={17} /> : <ArrowDown size={17} />}
      </button>
    </div>
    {loading ? <div className="mg-table-state" role="status"><LoaderCircle className="mg-spin" size={26} /><strong>Đang tải danh sách…</strong></div>
      : error ? <div className="mg-table-state mg-table-error" role="alert"><FileSearch size={30} /><strong>Không tải được dữ liệu</strong><p>{error}</p><button type="button" className="mg-button" onClick={onRetry}><RotateCcw size={15} />Thử lại</button></div>
      : !rows.length ? <div className="mg-table-state"><FileSearch size={32} /><strong>{isFiltered ? 'Không tìm thấy kết quả' : 'Danh sách đang trống'}</strong><p>{isFiltered ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.' : 'Chưa có bản ghi để hiển thị.'}</p>{isFiltered && <button type="button" className="mg-button" onClick={onReset}>Xóa bộ lọc</button>}</div>
      : <ul className="mg-mobile-card-list" aria-label={config.title}>{rows.map(row => {
        const title = String((config.kind === 'contracts' ? row.customer_name : row.name) || row.code || `#${row.id}`);
        const label = String((config.kind === 'vehicles' ? row.license : row.code) || row.code || title);
        const receive=config.kind==='vehicles'&&row.status==='in_transit'?actions(row).find(item=>item.key==='receive'):undefined;
        const contractAction=config.kind==='contracts'?actions(row).find(item=>item.key===(row.status==='draft'?'delete':'telegram')):undefined;
        const summary = SUMMARY_KEYS[config.kind].filter(key => row[key] !== undefined && row[key] !== '').map(key => {
          const column = config.columns.find(item => item.key === key);
          const value = optionLabel(config, key, formatValue(row[key], column?.format));
          return { key, label: column?.label || (key === 'customer_phone' ? 'Số điện thoại' : 'Biển số'), value };
        });
        return <li key={row.id} className={`mg-mobile-record-card${receive?' mg-mobile-card-receive':''}${showOverdue?' mg-mobile-card-overdue':''}${selectedIds?.has(row.id) ? ' is-selected' : ''}`}>
          {selectable && <label className="mg-mobile-card-select"><input type="checkbox" aria-label={`Chọn ${label}`} checked={Boolean(selectedIds?.has(row.id))}
            onChange={event => onSelectionChange?.([row.id], event.target.checked)} /></label>}
          <button type="button" className="mg-mobile-card-main" aria-label={`Xem chi tiết ${title}`} onClick={() => onView(row)}>
            <strong className="mg-mobile-card-title">{title}</strong>
            <span className="mg-mobile-card-summary">{summary.slice(0, 2).map(item => <span key={item.key} title={`${item.label}: ${item.value}`}>{item.value}</span>)}</span>
            {config.kind === 'contracts' && row.billing_overdue_at && Number(row.billing_due_amount) > 0 && <span className="mg-mobile-card-billing">
              <span>Hẹn đóng: {formatValue(row.billing_overdue_at, 'date')} {String(row.billing_overdue_at).slice(11, 16)}</span>
              <strong>Còn thiếu đến hạn: {formatValue(row.billing_due_amount, 'money')}</strong>
            </span>}
            {showOverdue&&<span className="mg-mobile-card-billing">
              <strong>Quá hạn: {formatValue(row.overdue_minutes,'duration')}</strong>
              <span>Phí quá hạn (tạm tính): {row.overdue_fee_estimate===undefined?'Cần đối chiếu':formatValue(row.overdue_fee_estimate,'money')}</span>
              <span>Tiền thuê còn thiếu: {formatValue(row.rental_debt_amount,'money')}</span>
            </span>}
            <span className="mg-mobile-card-footer"><span className={`mg-status mg-status-${statusTone(row.status)}`}><span />{optionLabel(config, 'status', row.status)}</span>
              {config.kind === 'vehicles' && row.location_status && <span className={`mg-status mg-status-${statusTone(String(row.location_status))}`}><span />{optionLabel(config, 'location_status', String(row.location_status))}</span>}
              {summary[2] && <span className="mg-mobile-card-extra" title={`${summary[2].label}: ${summary[2].value}`}>{summary[2].value}{summary[3] && ` · ${summary[3].value}`}</span>}
            </span>
            {receive&&vehicleTransferRoute(row)&&<span className="mg-transfer-direction">{vehicleTransferRoute(row)}</span>}
            {config.kind==='vehicles'&&<GpsEvidence compact syncedAt={String(row.gps_last_sync||'')} heartbeatAt={String(row.gps_heartbeat_at||'')} positionAt={String(row.gps_position_at||'')}/>}
          </button>
          {receive&&<button type="button" className="mg-button mg-button-primary mg-mobile-receive" disabled={busyId===row.id} onClick={receive.onSelect}>Nhận xe</button>}
          {contractAction&&<button type="button" className={`mg-button${contractAction.danger?' mg-button-danger':''}`} onClick={contractAction.onSelect}>{contractAction.icon}{contractAction.label}</button>}
          <div className="mg-mobile-card-actions"><RowActionsMenu label={`Thao tác ${label}`} actions={actions(row)} busy={busyId === row.id} /></div>
        </li>;
      })}</ul>}
  </div>;
}

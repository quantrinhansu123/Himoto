'use client';

import { ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, BatteryCharging, Bike, CalendarPlus, Copy, Eye, FileSearch, LoaderCircle, MessageCircle, Pencil, Printer, RefreshCw, RotateCcw, ShieldBan, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { ManagementColumn, ManagementConfig, ManagementRow } from '@/lib/management/types';
import { optionLabel, statusTone, OWNERSHIP_CONTRACT_TYPES } from '@/lib/management/config';
import { formatValue } from '@/lib/management/table-utils';
import { RowAction, RowActionsMenu } from './RowActionsMenu';
import { ManagementMobileList } from './ManagementMobileList';
import { useManagement } from './ManagementProvider';
import { isRemindableContract } from '@/lib/management/debt-reminders';
import { GpsEvidence } from './GpsEvidence';

export function Cell({ row, column, config }: { row: ManagementRow; column: ManagementColumn; config: ManagementConfig }) {
  const value = row[column.key];
  if(config.kind==='vehicles'&&column.key==='location_status')return <><span className={`mg-status mg-status-${statusTone(String(value))}`}><span/>{optionLabel(config,column.key,String(value||''))}</span><GpsEvidence compact syncedAt={String(row.gps_last_sync||'')} heartbeatAt={String(row.gps_heartbeat_at||'')} positionAt={String(row.gps_position_at||'')}/></>;
  if (column.format === 'status') return <span className={`mg-status mg-status-${statusTone(String(value))}`}><span />{optionLabel(config, column.key, String(value || ''))}</span>;
  if (column.format === 'code') return <span className="mg-code">{value || '—'}</span>;
  if (config.kind === 'vehicles' && column.key === 'holder_name') {
    const holder = String(value || 'Lưu kho');
    if (holder === 'Lưu kho') return <span className="mg-status mg-status-green"><span />Lưu kho</span>;
    return <div className="mg-identity"><span className={`mg-avatar mg-avatar-${row.id % 4}`} aria-hidden="true">{holder.split(' ').filter(Boolean).slice(-2).map(word => word[0]).join('')}</span><div><strong title={holder}>{holder}</strong></div></div>;
  }
  if (column.format === 'person' || column.format === 'vehicle') return <div className={`mg-identity ${column.format === 'vehicle' ? 'mg-identity-vehicle' : ''}`}>
    {column.format === 'person' && <span className={`mg-avatar mg-avatar-${row.id % 4}`} aria-hidden="true">{String(value || '').split(' ').filter(Boolean).slice(-2).map(word => word[0]).join('')}</span>}
    <div>
      <strong title={String(value || '')}>{value || '—'}</strong>
      {column.secondary && <small title={String(row[column.secondary] || '')}>{row[column.secondary] || '—'}</small>}
      {config.kind === 'vehicles' && column.key === 'name' && <small title={String(row.holder_name || 'Lưu kho')}>{row.holder_name || 'Lưu kho'}</small>}
    </div></div>;
  const display = optionLabel(config, column.key, formatValue(value, column.format));
  return <span className={`mg-cell-value ${column.format === 'money' || column.format === 'number' ? 'mg-numeric' : ''}`} title={display}>{display}</span>;
}
interface Props {
  config: ManagementConfig;
  columns: ManagementColumn[];
  rows: ManagementRow[];
  offset: number;
  sortKey: string;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  onView: (row: ManagementRow) => void;
  onEdit: (row: ManagementRow) => void;
  onDelete?: (row: ManagementRow) => void;
  onPrint?: (row: ManagementRow) => void;
  onPayment?: (row: ManagementRow) => void;
  onQr?: (row: ManagementRow) => void;
  onReminder?: (row: ManagementRow) => void;
  onTelegram?: (row: ManagementRow) => void;
  onHandover?: (row: ManagementRow) => void;
  onReturn?: (row: ManagementRow) => void;
  onRenew?: (row: ManagementRow) => void;
  onVehicleChange?: (row: ManagementRow) => void;
  onBatteryRent?: (row: ManagementRow) => void;
  onClone?: (row: ManagementRow) => void;
  onVehicleAction?: (row: ManagementRow, mode: 'transfer' | 'status' | 'receive') => void;
  cloningId?: number | null;
  canEditContract?: boolean;
  canEditDraft?: boolean;
  canEdit: boolean;
  canDelete?: boolean;
  onBlacklist?: (row: ManagementRow) => void;
  blacklistBusyId?: number | null;
  loading: boolean;
  error: string;
  isFiltered: boolean;
  onReset: () => void;
  onRetry: () => void;
  selectedIds?: ReadonlySet<number>;
  onSelectionChange?: (ids: number[], selected: boolean) => void;
}

export function DataTable({ config, columns, rows, offset, sortKey, sortDirection, onSort, onView, onEdit, onDelete, onPrint, onPayment,onQr,onReminder,onTelegram, onHandover, onReturn, onRenew, onVehicleChange, onBatteryRent, onClone, onVehicleAction, cloningId, canEditContract, canEditDraft, canEdit, canDelete, onBlacklist, blacklistBusyId, loading, error, isFiltered, onReset, onRetry, selectedIds, onSelectionChange }: Props) {
  const {can}=useManagement();
  const selectable = Boolean(selectedIds && onSelectionChange);
  const columnCount = columns.length + (selectable ? 3 : 2);
  const pageIds = rows.map(row => row.id);
  const pageSelected = pageIds.filter(id => selectedIds?.has(id)).length;
  const rowActions = (row: ManagementRow): RowAction[] => {
    const isContract = config.kind === 'contracts';
    const isActiveContract = isContract && ['renting', 'overdue', 'wait_payment'].includes(row.status);
    const actions: RowAction[] = [{ key: 'view', label: 'Xem chi tiết', icon: <Eye size={16} />, onSelect: () => onView(row) }];
    if(isContract&&onTelegram&&!['draft','cancelled'].includes(row.status))actions.push({key:'telegram',label:'Gửi Telegram',icon:<MessageCircle size={16}/>,onSelect:()=>onTelegram(row)});
    if (config.kind === 'vehicles' && onVehicleAction){
      if(can('vehicles.transfer'))actions.push({ key: 'transfer', label: 'Chuyển xe', icon: <ArrowLeftRight size={16} />, onSelect: () => onVehicleAction(row, 'transfer') });
      if(can('vehicles.write'))actions.push({ key: 'status', label: 'Đổi trạng thái', icon: <RefreshCw size={16} />, onSelect: () => onVehicleAction(row, 'status') });
    }
    if(config.kind==='vehicles'&&row.status==='in_transit'&&onVehicleAction&&can('vehicles.receive'))actions.splice(1,0,{key:'receive',label:'Nhận xe',icon:<Bike size={16}/>,onSelect:()=>onVehicleAction(row,'receive')});
    if (isContract && onPrint) actions.push({ key: 'print', label: 'Điền và in hợp đồng', icon: <Printer size={16} />, onSelect: () => onPrint(row) });
    if(isContract&&onQr&&row.status!=='cancelled')actions.push({key:'qr',label:'Nhập phiếu chi',icon:<Wallet size={16}/>,onSelect:()=>onQr(row)});
    if(isContract&&onReminder&&isRemindableContract(row))actions.push({key:'reminder',label:'Nhắc nợ',icon:<MessageCircle size={16}/>,onSelect:()=>onReminder(row)});
    if (isContract && onPayment && !['draft', 'cancelled'].includes(row.status)) actions.push({ key: 'payment', label: 'Thanh toán', icon: <Wallet size={16} />, onSelect: () => onPayment(row) });
    if (isContract && onHandover && row.status === 'deposit_contract') actions.push({key:'handover',label:'Giao xe',icon:<Bike size={16}/>,onSelect:()=>onHandover(row)});
    if (isActiveContract && onReturn) actions.push({ key: 'return', label: 'Trả xe', title: 'Ghi nhận trả xe trực tiếp trên hợp đồng này', icon: <RotateCcw size={16} />, onSelect: () => onReturn(row) });
    if (isActiveContract && !row.billing_plan_json && onRenew) actions.push({ key: 'renew', label: 'Gia hạn', title: 'Gia hạn trực tiếp trên hợp đồng', icon: <CalendarPlus size={16} />, onSelect: () => onRenew(row) });
    if (isActiveContract && onVehicleChange) actions.push({ key: 'vehicle', label: 'Đổi xe', title: 'Đổi xe trực tiếp trên hợp đồng', icon: <Bike size={16} />, onSelect: () => onVehicleChange(row) });
    if (isContract && onBatteryRent && !['draft', 'cancelled'].includes(row.status)) actions.push({ key: 'battery', label: 'Thuê pin / sạc', title: 'Lập hợp đồng thuê pin hoặc sạc theo khách và xe của hợp đồng này', icon: <BatteryCharging size={16} />, onSelect: () => onBatteryRent(row) });
    if (canEditContract || (canEditDraft && row.status === 'draft')) actions.push({ key: 'edit', label: row.status === 'draft' ? OWNERSHIP_CONTRACT_TYPES.has(String(row.rental_type)) || row.store_kind === 'lease_to_own' ? 'Duyệt & hoàn tất hợp đồng' : 'Tiếp tục sửa bản nháp' : 'Chỉnh sửa hợp đồng', icon: <Pencil size={16} />, onSelect: () => onEdit(row) });
    if (!isContract && canEdit) actions.push({ key: 'edit', label: 'Chỉnh sửa', icon: <Pencil size={16} />, onSelect: () => onEdit(row) });
    if (isContract && onClone) actions.push({ key: 'clone', label: cloningId === row.id ? 'Đang sao chép…' : 'Sao chép hợp đồng', disabled: cloningId != null,
      icon: cloningId === row.id ? <LoaderCircle size={16} className="mg-spin" /> : <Copy size={16} />, onSelect: () => onClone(row) });
    if (config.kind === 'customers' && onBlacklist) {
      const blacklisted = row.status === 'blacklist';
      actions.push({ key: 'blacklist', label: blacklistBusyId === row.id ? 'Đang đổi…' : blacklisted ? 'Bỏ Blacklist' : 'Đưa vào Blacklist',
        disabled: blacklistBusyId != null || !row.customer_revision, danger: !blacklisted,
        title: !row.customer_revision ? 'Nhấn Làm mới để tải phiên bản hồ sơ' : undefined,
        icon: blacklistBusyId === row.id ? <LoaderCircle size={16} className="mg-spin" /> : blacklisted ? <ShieldCheck size={16} /> : <ShieldBan size={16} />, onSelect: () => onBlacklist(row) });
    }
    if (canDelete && onDelete && (!isContract || row.status === 'draft')) actions.push({ key: 'delete', label: isContract ? 'Xóa bản nháp' : `Xóa ${config.singular}`, danger: true, icon: <Trash2 size={16} />, onSelect: () => onDelete(row) });
    return actions;
  };
  return <><ManagementMobileList config={config} rows={rows} sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} onView={onView}
    actions={rowActions} busyId={cloningId ?? blacklistBusyId} loading={loading} error={error} isFiltered={isFiltered} onReset={onReset} onRetry={onRetry}
    selectedIds={selectedIds} onSelectionChange={onSelectionChange} />
  <div className="mg-table-scroll mg-desktop-records" tabIndex={0} role="region" aria-label={`Bảng ${config.title.toLowerCase()}, cuộn ngang để xem thêm cột`}>
    <table className={`mg-table mg-table-${config.kind}`} aria-busy={loading}>
      <thead><tr>{selectable && <th scope="col" className="mg-select-column"><input type="checkbox" aria-label="Chọn tất cả dòng trên trang này" disabled={loading || Boolean(error) || !rows.length}
        checked={rows.length > 0 && pageSelected === rows.length} ref={input => { if (input) input.indeterminate = pageSelected > 0 && pageSelected < rows.length; }}
        onChange={event => onSelectionChange?.(pageIds, event.target.checked)} /></th>}<th scope="col" className="mg-index">STT</th>{columns.map(column => <th key={column.key} scope="col" className={`${column.align === 'right' ? 'mg-align-right' : ''}${column.key === 'code' ? ' mg-record-code' : ''}`}
        aria-sort={sortKey === column.key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
        <button type="button" className="mg-sort" onClick={() => onSort(column.key)} aria-label={`Sắp xếp theo ${column.label}`}><span>{column.label}</span>{sortKey === column.key ? sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={12} />}</button>
      </th>)}<th scope="col" className="mg-actions-column">Thao tác</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={columnCount}><div className="mg-table-state" role="status"><LoaderCircle className="mg-spin" size={26} /><strong>Đang tải danh sách…</strong><p>Thông tin sẽ xuất hiện trong giây lát.</p></div></td></tr>
        : error ? <tr><td colSpan={columnCount}><div className="mg-table-state mg-table-error" role="alert"><FileSearch size={30} /><strong>Không tải được dữ liệu</strong><p>{error}</p><button className="mg-button" onClick={onRetry}><RotateCcw size={15} />Thử lại</button></div></td></tr>
        : rows.length === 0 ? <tr><td colSpan={columnCount}><div className="mg-table-state"><FileSearch size={32} /><strong>{isFiltered ? 'Không tìm thấy kết quả' : 'Danh sách đang trống'}</strong><p>{isFiltered ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.' : 'Chưa có bản ghi để hiển thị.'}</p>{isFiltered && <button className="mg-button" onClick={onReset}>Xóa bộ lọc</button>}</div></td></tr>
        : rows.map((row, index) => <tr key={row.id} className={selectedIds?.has(row.id) ? 'is-selected' : undefined}>{selectable && <td className="mg-select-column"><input type="checkbox" aria-label={`Chọn ${row.code || row.name || `#${row.id}`}`}
          checked={Boolean(selectedIds?.has(row.id))} onChange={event => onSelectionChange?.([row.id], event.target.checked)} /></td>}<td className="mg-index">{offset + index + 1}</td>{columns.map(column => <td key={column.key} className={`${column.align === 'right' ? 'mg-align-right' : ''}${column.key === 'code' ? ' mg-record-code' : ''}`}><Cell row={row} column={column} config={config} /></td>)}
          <td className="mg-actions-column"><div className="mg-row-actions">
            {config.kind==='vehicles'&&row.status==='in_transit'&&onVehicleAction&&can('vehicles.receive')&&<button type="button" className="mg-button mg-button-primary" onClick={()=>onVehicleAction(row,'receive')}>Nhận xe</button>}
            {config.kind==='staff'&&canEdit&&<button type="button" className="mg-icon-button" title="Chỉnh sửa" aria-label={`Chỉnh sửa ${row.name || row.code || ''}`} onClick={()=>onEdit(row)}><Pencil size={16} /></button>}
            {config.kind==='staff'&&canDelete&&onDelete&&<button type="button" className="mg-icon-button is-danger" title="Xóa nhân sự" aria-label={`Xóa ${row.name || row.code || ''}`} onClick={()=>onDelete(row)}><Trash2 size={16} /></button>}
            <RowActionsMenu label={`Thao tác ${row.license || row.code || row.name || ''}`.trim()} actions={rowActions(row)} busy={cloningId === row.id || blacklistBusyId === row.id} />
          </div></td></tr>)}</tbody>
    </table>
  </div></>;
}

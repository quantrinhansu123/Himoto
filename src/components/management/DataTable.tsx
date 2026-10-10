'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Bike, CalendarPlus, Copy, Eye, FileSearch, LoaderCircle, Pencil, Printer, RotateCcw, ShieldBan, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { ManagementColumn, ManagementConfig, ManagementRow } from '@/lib/management/types';
import { optionLabel, statusTone } from '@/lib/management/config';
import { formatValue } from '@/lib/management/table-utils';
import { RowAction, RowActionsMenu } from './RowActionsMenu';

export function Cell({ row, column, config }: { row: ManagementRow; column: ManagementColumn; config: ManagementConfig }) {
  const value = row[column.key];
  if (column.format === 'status') return <span className={`mg-status mg-status-${statusTone(String(value))}`}><span />{optionLabel(config, 'status', String(value || ''))}</span>;
  if (column.format === 'code') return <span className="mg-code">{value || '—'}</span>;
  if (column.format === 'person' || column.format === 'vehicle') return <div className={`mg-identity ${column.format === 'vehicle' ? 'mg-identity-vehicle' : ''}`}>
    {column.format === 'person' && <span className={`mg-avatar mg-avatar-${row.id % 4}`} aria-hidden="true">{String(value || '').split(' ').filter(Boolean).slice(-2).map(word => word[0]).join('')}</span>}
    <div><strong title={String(value || '')}>{value || '—'}</strong>{column.secondary && <small title={String(row[column.secondary] || '')}>{row[column.secondary] || '—'}</small>}</div></div>;
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
  onReturn?: (row: ManagementRow) => void;
  onRenew?: (row: ManagementRow) => void;
  onVehicleChange?: (row: ManagementRow) => void;
  onClone?: (row: ManagementRow) => void;
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
}

export function DataTable({ config, columns, rows, offset, sortKey, sortDirection, onSort, onView, onEdit, onDelete, onPrint, onPayment, onReturn, onRenew, onVehicleChange, onClone, cloningId, canEditContract, canEditDraft, canEdit, canDelete, onBlacklist, blacklistBusyId, loading, error, isFiltered, onReset, onRetry }: Props) {
  const columnCount = columns.length + 2;
  const rowActions = (row: ManagementRow): RowAction[] => {
    const isContract = config.kind === 'contracts';
    const isActiveContract = isContract && ['renting', 'overdue', 'wait_payment'].includes(row.status);
    const actions: RowAction[] = [{ key: 'view', label: 'Xem chi tiết', icon: <Eye size={16} />, onSelect: () => onView(row) }];
    if (isContract && onPrint) actions.push({ key: 'print', label: 'Điền và in hợp đồng', icon: <Printer size={16} />, onSelect: () => onPrint(row) });
    if (isContract && onPayment && !['draft', 'cancelled'].includes(row.status)) actions.push({ key: 'payment', label: 'Thanh toán', icon: <Wallet size={16} />, onSelect: () => onPayment(row) });
    if (isActiveContract && onReturn) actions.push({ key: 'return', label: 'Trả xe', title: 'Ghi nhận trả xe trực tiếp trên hợp đồng này', icon: <RotateCcw size={16} />, onSelect: () => onReturn(row) });
    if (isActiveContract && onRenew) actions.push({ key: 'renew', label: 'Gia hạn', title: 'Gia hạn trực tiếp trên hợp đồng', icon: <CalendarPlus size={16} />, onSelect: () => onRenew(row) });
    if (isActiveContract && onVehicleChange) actions.push({ key: 'vehicle', label: 'Đổi xe', title: 'Đổi xe trực tiếp trên hợp đồng', icon: <Bike size={16} />, onSelect: () => onVehicleChange(row) });
    if (canEditContract || (canEditDraft && row.status === 'draft')) actions.push({ key: 'edit', label: row.status === 'draft' ? 'Tiếp tục sửa bản nháp' : 'Chỉnh sửa hợp đồng', icon: <Pencil size={16} />, onSelect: () => onEdit(row) });
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
    if (canDelete && onDelete) actions.push({ key: 'delete', label: `Xóa ${config.singular}`, danger: true, icon: <Trash2 size={16} />, onSelect: () => onDelete(row) });
    return actions;
  };
  return <div className="mg-table-scroll" tabIndex={0} role="region" aria-label={`Bảng ${config.title.toLowerCase()}, cuộn ngang để xem thêm cột`}>
    <table className={`mg-table mg-table-${config.kind}`} aria-busy={loading}>
      <caption className="mg-sr-only">{config.title}</caption>
      <thead><tr><th scope="col" className="mg-index">STT</th>{columns.map(column => <th key={column.key} scope="col" className={column.align === 'right' ? 'mg-align-right' : ''}
        aria-sort={sortKey === column.key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
        <button type="button" className="mg-sort" onClick={() => onSort(column.key)} aria-label={`Sắp xếp theo ${column.label}`}><span>{column.label}</span>{sortKey === column.key ? sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={12} />}</button>
      </th>)}<th scope="col" className="mg-actions-column">Thao tác</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={columnCount}><div className="mg-table-state" role="status"><LoaderCircle className="mg-spin" size={26} /><strong>Đang tải danh sách…</strong><p>Thông tin sẽ xuất hiện trong giây lát.</p></div></td></tr>
        : error ? <tr><td colSpan={columnCount}><div className="mg-table-state mg-table-error" role="alert"><FileSearch size={30} /><strong>Không tải được dữ liệu</strong><p>{error}</p><button className="mg-button" onClick={onRetry}><RotateCcw size={15} />Thử lại</button></div></td></tr>
        : rows.length === 0 ? <tr><td colSpan={columnCount}><div className="mg-table-state"><FileSearch size={32} /><strong>{isFiltered ? 'Không tìm thấy kết quả' : 'Danh sách đang trống'}</strong><p>{isFiltered ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.' : 'Chưa có bản ghi để hiển thị.'}</p>{isFiltered && <button className="mg-button" onClick={onReset}>Xóa bộ lọc</button>}</div></td></tr>
        : rows.map((row, index) => <tr key={row.id}><td className="mg-index">{offset + index + 1}</td>{columns.map(column => <td key={column.key} className={column.align === 'right' ? 'mg-align-right' : ''}><Cell row={row} column={column} config={config} /></td>)}
          <td className="mg-actions-column"><div className="mg-row-actions">
            <RowActionsMenu label={`Thao tác ${row.code || row.name || ''}`.trim()} actions={rowActions(row)} busy={cloningId === row.id || blacklistBusyId === row.id} /></div></td></tr>)}</tbody>
    </table>
  </div>;
}

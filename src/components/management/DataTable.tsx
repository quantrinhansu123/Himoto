'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Eye, FileSearch, LoaderCircle, Pencil, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { ManagementColumn, ManagementConfig, ManagementRow } from '@/lib/management/types';
import { optionLabel, statusTone } from '@/lib/management/config';
import { formatValue } from '@/lib/management/table-utils';

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
  onClone?: (row: ManagementRow) => void;
  cloningId?: number | null;
  canEditContract?: boolean;
  canEditDraft?: boolean;
  canEdit: boolean;
  canDelete?: boolean;
  loading: boolean;
  error: string;
  isFiltered: boolean;
  onReset: () => void;
  onRetry: () => void;
}

export function DataTable({ config, columns, rows, offset, sortKey, sortDirection, onSort, onView, onEdit, onDelete, onPrint, onClone, cloningId, canEditContract, canEditDraft, canEdit, canDelete, loading, error, isFiltered, onReset, onRetry }: Props) {
  const columnCount = columns.length + 2;
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
          <td className="mg-actions-column"><div className={`mg-row-actions${onClone ? ' mg-contract-actions' : ''}`}><button className="mg-icon-button" type="button" aria-label={`Xem ${row.code}`} title="Xem chi tiết" onClick={() => onView(row)}><Eye size={17} /></button>
            {config.kind === 'contracts' && onPrint && <button className="mg-icon-button" type="button" aria-label={`Điền và in ${row.code}`} title="Điền và in hợp đồng" onClick={() => onPrint(row)}><Printer size={17} /></button>}
            {(canEditContract || (canEditDraft && row.status === 'draft')) && <button className="mg-icon-button" type="button" aria-label={`Sửa ${row.code}`} title={row.status === 'draft' ? 'Tiếp tục sửa bản nháp' : 'Chỉnh sửa hợp đồng'} onClick={() => onEdit(row)}><Pencil size={16} /></button>}
            {config.kind !== 'contracts' && canEdit && <button className="mg-icon-button" type="button" aria-label={`Sửa ${row.code}`} title="Chỉnh sửa" onClick={() => onEdit(row)}><Pencil size={16} /></button>}
            {canDelete && onDelete && <button className="mg-icon-button mg-delete-action" type="button" aria-label={`Xóa ${row.name}`} title={`Xóa ${config.singular}`} onClick={() => onDelete(row)}><Trash2 size={16} /></button>}
            {config.kind === 'contracts' && onClone && <button className="mg-button mg-clone-button" type="button" disabled={cloningId != null} aria-label={`Sao chép hợp đồng ${row.code}`} onClick={() => onClone(row)}>{cloningId === row.id ? <LoaderCircle size={14} className="mg-spin" /> : <Copy size={14} />}{cloningId === row.id ? 'Đang sao chép…' : 'Sao chép hợp đồng'}</button>}
          </div></td></tr>)}</tbody>
    </table>
  </div>;
}

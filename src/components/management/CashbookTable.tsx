'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowDownLeft, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronLeft, ChevronRight, FileSearch, LoaderCircle, RotateCcw } from 'lucide-react';
import { CASHBOOK_COLUMNS, CashbookColumnKey, CashbookRow, VoucherType, VOUCHER_LABELS, cashbookCell, sortCashbookRows } from '@/lib/management/cashbook';

interface Props { type: VoucherType; rows: CashbookRow[]; loading: boolean; error: string; filtered: boolean; onReset: () => void; onRetry: () => void }
export function CashbookTable({ type, rows, loading, error, filtered, onReset, onRetry }: Props) {
  const title = VOUCHER_LABELS[type];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [sort, setSort] = useState<{ key: CashbookColumnKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  useEffect(() => { setPage(1); }, [rows]);
  const sorted = useMemo(() => sortCashbookRows(rows, sort.key, sort.direction), [rows, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  return <section className="mg-data-panel mg-cashbook-panel" aria-labelledby={`cashbook-${type}-title`} id={`cashbook-${type}`}>
    <div className="mg-cashbook-panel-heading"><span className={`mg-cashbook-symbol is-${type}`} aria-hidden="true">{type === 'income' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}</span>
      <div><h2 id={`cashbook-${type}-title`}>{title}<span className="mg-title-count">{loading || error ? '—' : rows.length}</span></h2><p>{type === 'income' ? 'Các phiếu ghi nhận khoản thu.' : 'Các phiếu ghi nhận khoản chi.'}</p><p className="mg-cashbook-mobile-hint">Cuộn ngang để xem đủ {CASHBOOK_COLUMNS.length} cột.</p></div>
      <span className="mg-cashbook-panel-description">Cùng mẫu {CASHBOOK_COLUMNS.length} cột</span>
    </div>
    <div className="mg-table-scroll" tabIndex={0} role="region" aria-label={`Bảng ${title.toLowerCase()}, cuộn ngang để xem đủ ${CASHBOOK_COLUMNS.length} cột`}>
      <table className="mg-table mg-cashbook-table" aria-busy={loading}><caption className="mg-sr-only">{title}</caption>
        <thead><tr>{CASHBOOK_COLUMNS.map(column => <th key={column.key} scope="col" aria-sort={sort.key === column.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
          <button type="button" className="mg-sort" aria-label={`Sắp xếp ${title.toLowerCase()} theo ${column.label}`} onClick={() => { setSort(current => ({ key: column.key, direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc' })); setPage(1); }}>
            <span>{column.label}</span>{sort.key === column.key ? sort.direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={12} />}</button></th>)}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={CASHBOOK_COLUMNS.length}><div className="mg-table-state" role="status"><LoaderCircle size={25} className="mg-spin" /><strong>Đang tải {title.toLowerCase()}…</strong></div></td></tr>
          : error ? <tr><td colSpan={CASHBOOK_COLUMNS.length}><div className="mg-table-state mg-table-error" role="alert"><FileSearch size={28} /><strong>Không tải được {title.toLowerCase()}</strong><p>{error}</p><button type="button" className="mg-button" onClick={onRetry}><RotateCcw size={15} />Thử lại</button></div></td></tr>
          : !sorted.length ? <tr><td colSpan={CASHBOOK_COLUMNS.length}><div className="mg-table-state"><FileSearch size={28} /><strong>{filtered ? 'Không tìm thấy kết quả' : `Chưa có ${title.toLowerCase()}`}</strong><p>{filtered ? 'Đổi từ khóa, ngày hoặc người thực hiện để tìm lại.' : 'Danh sách sẽ hiển thị khi có phiếu.'}</p>{filtered && <button type="button" className="mg-button" onClick={onReset}>Xóa bộ lọc</button>}</div></td></tr>
          : sorted.slice(offset, offset + pageSize).map(row => <tr key={row.id}>{CASHBOOK_COLUMNS.map(column => <td key={column.key}>
            {column.key === 'type' ? <span className={`mg-status mg-status-${type === 'income' ? 'green' : 'red'}`}><span />{title}</span>
              : column.key === 'id' ? <span className="mg-code">{row.id}</span>
              : column.key === 'contract_code' && row.order_id ? <Link className="mg-cashbook-contract-link" href={`/contracts?contract_id=${row.order_id}`}>{cashbookCell(row,column.key)}</Link>
              : <span className={`mg-cashbook-cell mg-cashbook-${column.key}`}>{cashbookCell(row, column.key)}</span>}
          </td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="mg-pagination"><div className="mg-result-range" aria-live="polite">Hiển thị <strong>{sorted.length && !loading && !error ? offset + 1 : 0}–{loading || error ? 0 : Math.min(offset + pageSize, sorted.length)}</strong> trong <strong>{loading || error ? '—' : sorted.length}</strong> {title.toLowerCase()}</div>
      <div className="mg-pagination-controls"><label>Số dòng<select aria-label={`Số dòng mỗi trang ${title.toLowerCase()}`} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[5, 10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        <div className="mg-page-buttons"><button type="button" className="mg-icon-button" aria-label={`Trang trước ${title.toLowerCase()}`} disabled={safePage === 1 || loading || Boolean(error)} onClick={() => setPage(safePage - 1)}><ChevronLeft size={17} /></button>
          <span className="mg-current-page" aria-label={`Trang hiện tại ${title.toLowerCase()}`}>{safePage}</span><span className="mg-page-total">/ {pageCount}</span>
          <button type="button" className="mg-icon-button" aria-label={`Trang sau ${title.toLowerCase()}`} disabled={safePage === pageCount || loading || Boolean(error)} onClick={() => setPage(safePage + 1)}><ChevronRight size={17} /></button></div>
      </div>
    </div>
  </section>;
}

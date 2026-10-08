'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownToLine, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, ListFilter, Plus, RotateCcw, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { MANAGEMENT_CONFIG, optionLabel, statusTone } from '@/lib/management/config';
import { EMPTY_QUERY, TableQuery, csvCell, filterRows, formatValue, sortRows } from '@/lib/management/table-utils';
import { ManagementKind, ManagementRow } from '@/lib/management/types';
import { useManagement } from './ManagementProvider';
import { DataTable } from './DataTable';
import { Dialog } from './Dialog';
import { EntityForm } from './EntityForm';
import { ContractDetail } from './ContractDetail';
import { ContractComposer } from '@/components/contracts/ContractComposer';
import { CustomerCreateDialog } from '@/components/contracts/CustomerCreateDialog';
import { StaffOrganizationChart } from './StaffOrganizationChart';
import { CustomerExcelActions } from './CustomerExcelActions';
import { VehicleExcelActions } from './VehicleExcelActions';
import { StoreEditDialog } from './StoreEditDialog';
import { ContractSummary } from './ContractSummary';

const EMPTY_ROWS: ManagementRow[] = [];

function ManagementContent({ kind, draftsOnly = false }: { kind: ManagementKind; draftsOnly?: boolean }) {
  const baseConfig = MANAGEMENT_CONFIG[kind];
  const config = draftsOnly ? { ...baseConfig, title: 'Log', description: 'Hợp đồng đang nhập hoặc đang sửa. Mở bản nháp để tiếp tục và lưu cập nhật.' } : baseConfig;
  const { dataset, loading, error, source, canSaveContractDrafts, selectedStore, selectStore, reload, notify, deleteCustomer, deleteStore, setCustomerBlacklist } = useManagement();
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = kind === 'contracts' ? searchParams.get('customer_id') : null;
  const [query, setQuery] = useState<TableQuery>(EMPTY_QUERY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'code', direction: 'asc' });
  const [visibleKeys, setVisibleKeys] = useState<string[]>(config.columns.filter(c => !c.hidden).map(c => c.key));
  const [viewing, setViewing] = useState<ManagementRow | null>(null);
  const [editing, setEditing] = useState<ManagementRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagementRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [blacklistBusyId, setBlacklistBusyId] = useState<number | null>(null);
  const [blacklistError, setBlacklistError] = useState('');
  const blacklistPending = useRef(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [printRow, setPrintRow] = useState<ManagementRow | null>(null);
  const [composerMode, setComposerMode] = useState<'print' | 'edit' | 'draft'>('print');
  const columnsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setQuery(current => ({ ...current, filters: { ...current.filters, customer_id: customerId || '' } })); setPage(1);
  }, [customerId]);
  useEffect(() => { setPage(1); }, [selectedStore]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (columnsRef.current && !columnsRef.current.contains(event.target as Node)) columnsRef.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && columnsRef.current?.open) { columnsRef.current.open = false; columnsRef.current.querySelector<HTMLElement>('summary')?.focus(); } };
    document.addEventListener('click', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', escape); };
  }, []);

  const allRows = dataset?.[kind] || EMPTY_ROWS;
  const rows = useMemo(() => draftsOnly ? allRows.filter(row => row.status === 'draft') : allRows, [allRows, draftsOnly]);
  const scopedRows = useMemo(() => filterRows(rows, EMPTY_QUERY, selectedStore), [rows, selectedStore]);
  const filteredRows = useMemo(() => sortRows(filterRows(scopedRows, query, 'all'), sort.key, sort.direction), [scopedRows, query, sort]);
  const tabRows = filterRows(scopedRows, { ...query, status: '' }, 'all');
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  const columns = config.columns.filter(c => visibleKeys.includes(c.key));
  const statusOptions = [...config.statuses, ...Array.from(new Set(rows.map(row => row.status))).filter(status => status && !config.statuses.some(option => option.value === status)).map(value => ({ value, label: kind === 'contracts' ? optionLabel(config, 'status', value) : `Trạng thái ${value}` }))];
  const isFiltered = Boolean(query.search || query.status || query.startDate || query.endDate || selectedStore !== 'all' || Object.values(query.filters).some(Boolean));
  const canEdit = kind === 'customers' || kind === 'stores';
  const canDelete = source === 'api' && (kind === 'customers' || kind === 'stores');
  const invalidDate = Boolean(query.startDate && query.endDate && query.startDate > query.endDate);
  const updateQuery = (next: Partial<TableQuery>) => { setQuery(current => ({ ...current, ...next })); setPage(1); };

  function clearFilters() {
    setQuery(EMPTY_QUERY); setPage(1); selectStore('all');
    if (customerId) router.replace('/contracts');
  }
  function exportCsv() {
    if (!filteredRows.length) return;
    const csv = [columns.map(column => csvCell(column.label)).join(','), ...filteredRows.map(row => columns.map(column => csvCell(optionLabel(config, column.key, formatValue(row[column.key], column.format)))).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `himoto-${kind}-${source}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Đã xuất ${filteredRows.length} bản ghi.`);
  }
  function view(row: ManagementRow) {
    setViewing(row);
  }

  return <section className="mg-page" aria-label={config.title}>
    <div className="mg-page-content">
      <div className="mg-page-heading"><div><div className="mg-eyebrow">DANH MỤC QUẢN LÝ <span>/</span> {String(navigationNumber(kind)).padStart(2, '0')}</div><h1>{config.title}<span className="mg-title-count">{loading || error ? '—' : scopedRows.length}</span></h1><p>{config.description}</p></div>
        <div className="mg-heading-actions"><button type="button" className="mg-button" onClick={exportCsv} disabled={loading || Boolean(error) || !filteredRows.length}><ArrowDownToLine size={17} />Xuất CSV</button>
          {kind === 'customers' && <CustomerExcelActions disabled={loading || Boolean(error) || !dataset} />}
          {kind === 'vehicles' && <VehicleExcelActions disabled={loading || Boolean(error) || !dataset} />}
          {(kind === 'customers' || kind === 'stores') && <button type="button" className="mg-button mg-button-primary" disabled={loading || Boolean(error)} onClick={() => {
            if (kind === 'customers' && source === 'api') setCreateCustomerOpen(true);
            else { setEditing(null); setFormOpen(true); }
          }}><Plus size={18} />{config.addLabel}</button>}
          {(kind === 'stores' || kind === 'vehicles' || kind === 'customers') && <button type="button" className="mg-button" disabled={loading || blacklistBusyId !== null} onClick={() => { setBlacklistError(''); void reload(); }}><RotateCcw size={17} />Làm mới</button>}
          {kind === 'contracts' && <>{source === 'api' && <span className="mg-readonly"><ShieldCheck size={16} />{canSaveContractDrafts ? 'Có thể lưu và sửa nháp' : 'Danh sách chỉ đọc'}</span>}<button type="button" className="mg-button" disabled={loading} onClick={() => void reload()}><RotateCcw size={17} />Làm mới</button><button type="button" className="mg-button mg-button-primary" disabled={loading || Boolean(error) || !dataset} onClick={() => { setPrintRow(null); setComposerMode('draft'); setComposerOpen(true); }}><Plus size={17} />Nhập hợp đồng</button></>}</div>
      </div>

      {kind === 'staff' && <StaffOrganizationChart />}

      <div className="mg-data-panel">
        <div className="mg-status-tabs" aria-label="Lọc theo trạng thái"><button type="button" className={!query.status ? 'is-active' : ''} aria-pressed={!query.status} onClick={() => updateQuery({ status: '' })}>Tất cả<span>{tabRows.length}</span></button>
          {statusOptions.filter(option => (kind === 'contracts' && option.value === 'draft') || tabRows.some(row => row.status === option.value) || query.status === option.value).map(option => <button type="button" key={option.value} className={query.status === option.value ? 'is-active' : ''} aria-pressed={query.status === option.value} onClick={() => updateQuery({ status: option.value })}>{option.label}<span>{tabRows.filter(row => row.status === option.value).length}</span></button>)}</div>
        <div className="mg-toolbar"><label className="mg-search"><Search size={17} /><span className="mg-sr-only">Tìm kiếm {config.title.toLowerCase()}</span><input type="search" placeholder={config.searchPlaceholder} value={query.search} onChange={event => updateQuery({ search: event.target.value })} />{query.search && <button type="button" aria-label="Xóa từ khóa" onClick={() => updateQuery({ search: '' })}><X size={15} /></button>}</label>
          <div className="mg-filter-controls"><span className="mg-filter-icon"><ListFilter size={16} /></span>{config.filters.map(filter => <label className="mg-sr-label" key={filter.key}><span className="mg-sr-only">{filter.label}</span><select aria-label={filter.label} value={query.filters[filter.key] || ''} onChange={event => updateQuery({ filters: { ...query.filters, [filter.key]: event.target.value } })}><option value="">{filter.label}</option>{filter.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
            <label className="mg-sr-label"><span className="mg-sr-only">Lọc trạng thái</span><select aria-label="Lọc trạng thái" value={query.status} onChange={event => updateQuery({ status: event.target.value })}><option value="">Tất cả trạng thái</option>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <details className="mg-column-menu" ref={columnsRef}><summary className="mg-button" aria-label="Ẩn hiện cột"><Columns3 size={16} /><span>Cột</span></summary><div className="mg-popover"><strong>Hiển thị cột</strong>{config.columns.map(column => <label key={column.key}><input type="checkbox" checked={visibleKeys.includes(column.key)} disabled={visibleKeys.length === 1 && visibleKeys.includes(column.key)} onChange={event => setVisibleKeys(current => event.target.checked ? [...current, column.key] : current.filter(key => key !== column.key))} />{column.label}</label>)}</div></details>
          </div>
        </div>
        {kind === 'contracts' && <div className="mg-date-filters"><span>Ngày bắt đầu thuê</span><label><span className="mg-sr-only">Từ ngày</span><input type="date" aria-label="Từ ngày" value={query.startDate} onChange={event => updateQuery({ startDate: event.target.value })} aria-invalid={invalidDate} /></label><span className="mg-date-divider">—</span><label><span className="mg-sr-only">Đến ngày</span><input type="date" aria-label="Đến ngày" value={query.endDate} onChange={event => updateQuery({ endDate: event.target.value })} aria-invalid={invalidDate} /></label>{invalidDate && <span className="mg-field-error" role="alert">Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</span>}
          {customerId && <span className="mg-active-filter">Khách hàng #{customerId}<button type="button" aria-label="Bỏ lọc khách hàng" onClick={() => router.replace('/contracts')}><X size={13} /></button></span>}</div>}
        {isFiltered && <div className="mg-filter-summary"><span><strong>{filteredRows.length}</strong> kết quả phù hợp</span><button type="button" onClick={clearFilters}><RotateCcw size={13} />Xóa bộ lọc</button></div>}
        {kind === 'contracts' && <ContractSummary rows={filteredRows} customers={dataset?.customers || EMPTY_ROWS} loading={loading} unavailable={Boolean(error) || !dataset} />}
        {kind === 'customers' && blacklistError && <p className="mg-blacklist-error" role="alert">{blacklistError}</p>}
        <DataTable config={config} columns={columns} rows={filteredRows.slice(offset, offset + pageSize)} offset={offset} sortKey={sort.key} sortDirection={sort.direction}
          onSort={key => { setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })); setPage(1); }} onView={view} onEdit={row => { if (kind === 'contracts') { setPrintRow(row); setComposerMode(row.status === 'draft' ? 'draft' : 'edit'); setComposerOpen(true); } else { setEditing(row); setFormOpen(true); } }}
          onDelete={canDelete ? row => { setDeleteTarget(row); setDeleteError(''); } : undefined} canDelete={canDelete}
          blacklistBusyId={blacklistBusyId} onBlacklist={kind === 'customers' ? async row => {
            if (blacklistPending.current) return;
            blacklistPending.current = true; setBlacklistBusyId(row.id); setBlacklistError('');
            try { await setCustomerBlacklist(row, row.status !== 'blacklist'); }
            catch (cause) { setBlacklistError(cause instanceof Error ? cause.message : 'Không đổi được trạng thái Blacklist.'); }
            finally { blacklistPending.current = false; setBlacklistBusyId(null); }
          } : undefined}
          onPrint={kind === 'contracts' ? row => { setPrintRow(row); setComposerMode('print'); setComposerOpen(true); } : undefined}

          canEditContract={false}
          canEditDraft={kind === 'contracts' && canSaveContractDrafts}
          canEdit={canEdit} loading={loading} error={error} isFiltered={isFiltered} onReset={clearFilters} onRetry={() => void reload()} />
        <div className="mg-pagination"><div className="mg-result-range" aria-live="polite">Hiển thị <strong>{filteredRows.length ? offset + 1 : 0}–{Math.min(offset + pageSize, filteredRows.length)}</strong> trong <strong>{filteredRows.length}</strong> {config.singular}</div>
          <div className="mg-pagination-controls"><label>Số dòng<select aria-label="Số dòng mỗi trang" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
            <div className="mg-page-buttons"><button type="button" className="mg-icon-button" aria-label="Trang đầu" disabled={safePage === 1 || loading} onClick={() => setPage(1)}><ChevronsLeft size={16} /></button><button type="button" className="mg-icon-button" aria-label="Trang trước" disabled={safePage === 1 || loading} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16} /></button>
              <span className="mg-current-page">{safePage}</span><span className="mg-page-total">/ {pageCount}</span><button type="button" className="mg-icon-button" aria-label="Trang sau" disabled={safePage === pageCount || loading} onClick={() => setPage(safePage + 1)}><ChevronRight size={16} /></button><button type="button" className="mg-icon-button" aria-label="Trang cuối" disabled={safePage === pageCount || loading} onClick={() => setPage(pageCount)}><ChevronsRight size={16} /></button></div>
          </div>
        </div>
      </div>
      <div className="mg-list-note"><span className="mg-note-line" />{kind === 'contracts' ? canSaveContractDrafts ? 'Dữ liệu hiện tại từ Supabase. Bản nháp được lưu trên hệ thống để mở lại và tiếp tục sửa. Nhấn Làm mới để cập nhật danh sách.' : 'Danh sách lấy từ hệ thống. Nhấn Làm mới để tải dữ liệu hiện tại; chức năng ghi bản nháp chưa được kết nối.' : kind === 'customers' && source === 'api' ? 'Dữ liệu khách hàng được đọc và cập nhật trực tiếp trong Supabase. Hồ sơ có đơn thuê liên quan sẽ được bảo vệ khỏi thao tác xóa.' : kind === 'stores' ? 'Cơ sở được cập nhật trực tiếp trong Supabase. Chỉ xóa được cơ sở chưa có dữ liệu liên quan; có thể chọn Tạm ngừng để giữ lịch sử.' : kind === 'vehicles' ? 'Xe được đồng bộ trực tiếp vào Supabase sau khi đối chiếu Excel. Mỗi lần nhập / xóa đều có sao lưu; xe có dữ liệu liên quan được bảo vệ khỏi xóa.' : 'Các trường chưa được API cung cấp hiển thị “—”. Danh sách hiện chỉ đọc.'}</div>
    </div>
    {formOpen && kind === 'stores' ? <StoreEditDialog row={editing} onSaved={() => { if (!editing) { setQuery(EMPTY_QUERY); setPage(1); } }} onClose={() => setFormOpen(false)} /> : formOpen && <EntityForm config={config} row={editing} onClose={() => setFormOpen(false)} />}
    {createCustomerOpen && kind === 'customers' && <CustomerCreateDialog idCard="" onCreated={() => setCreateCustomerOpen(false)} onClose={() => setCreateCustomerOpen(false)} />}
    {deleteTarget && canDelete && <Dialog title={kind === 'stores' ? 'Xóa cơ sở?' : 'Xóa hồ sơ khách hàng?'} subtitle={`${deleteTarget.name} · ${deleteTarget.code}`} onClose={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError(''); } }}>
      <div className="mg-dialog-body"><p>{kind === 'stores' ? 'Chỉ xóa cơ sở chưa có xe, nhân sự, khách hàng, hợp đồng, giao dịch hoặc dữ liệu liên quan. Cơ sở đã được sử dụng sẽ được giữ lại để bảo toàn lịch sử.' : 'Thao tác này sẽ xóa hồ sơ khách hàng khỏi Supabase. Hồ sơ đang được dùng trong đơn thuê sẽ không thể xóa để bảo toàn lịch sử.'}</p>{deleteError && <p className="mg-error-message" role="alert">{deleteError}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Hủy</button><button type="button" className="mg-button mg-button-danger" disabled={deleteBusy} onClick={async () => {
        if (!deleteTarget || deleteBusy) return;
        setDeleteBusy(true); setDeleteError('');
        try { if (kind === 'stores') await deleteStore(deleteTarget.id); else await deleteCustomer(deleteTarget.id); setDeleteTarget(null); }
        catch (cause) { setDeleteError(cause instanceof Error ? cause.message : `Không xóa được ${config.singular}.`); }
        finally { setDeleteBusy(false); }
      }}>{deleteBusy ? 'Đang xóa…' : <><Trash2 size={16} />{kind === 'stores' ? 'Xóa cơ sở' : 'Xóa khách hàng'}</>}</button></div>
    </Dialog>}
    {viewing && kind === 'contracts' && <ContractDetail row={viewing} onClose={() => setViewing(null)} onPrint={() => { setPrintRow(viewing); setComposerMode('print'); setViewing(null); setComposerOpen(true); }} />}
    {composerOpen && dataset && <ContractComposer key={`${composerMode}-${printRow?.id || 'new'}`} row={printRow} mode={composerMode} onClose={() => setComposerOpen(false)} onDraftSaved={() => { setQuery(EMPTY_QUERY); setPage(1); selectStore('all'); router.push('/contracts/drafts'); }} />}
    {viewing && kind !== 'contracts' && <Dialog title={String(viewing.name)} subtitle={`${viewing.code} · ${config.title}`} onClose={() => setViewing(null)}>
      <div className="mg-dialog-body"><span className={`mg-status mg-status-${statusTone(viewing.status)}`}><span />{optionLabel(config, 'status', viewing.status)}</span>
        <dl className="mg-detail-grid">{config.columns.filter(column => column.key !== 'name' && column.key !== 'status').map(column => <div key={column.key}><dt>{column.label}</dt><dd>{optionLabel(config, column.key, formatValue(viewing[column.key], column.format))}</dd></div>)}
          {config.fields.filter(field => !config.columns.some(column => column.key === field.key) && field.key !== 'store_id').map(field => <div key={field.key}><dt>{field.label}</dt><dd>{viewing[field.key] || '—'}</dd></div>)}</dl>
        {kind === 'customers' && <Link className="mg-button mg-related-link" href={`/contracts?customer_id=${viewing.id}`} onClick={() => setViewing(null)}>Xem hợp đồng liên quan <ChevronRight size={15} /></Link>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={() => setViewing(null)}>Đóng</button>{canEdit && <button type="button" className="mg-button mg-button-primary" onClick={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }}>Chỉnh sửa thông tin</button>}</div>
    </Dialog>}
  </section>;
}

const navigationNumber = (kind: ManagementKind) => ['staff', 'customers', 'contracts', 'stores', 'vehicles'].indexOf(kind) + 1;
export function ManagementPage({ kind, draftsOnly = false }: { kind: ManagementKind; draftsOnly?: boolean }) {
  return <Suspense fallback={<div className="mg-table-state" role="status">Đang chuẩn bị danh sách…</div>}><ManagementContent key={`${kind}-${draftsOnly}`} kind={kind} draftsOnly={draftsOnly} /></Suspense>;
}

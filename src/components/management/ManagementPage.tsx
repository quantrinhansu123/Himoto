'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { CONTRACT_DATA_KINDS, VEHICLE_DATA_KINDS } from '@/lib/management/data-loader';
import { ManagementDataBoundary } from './ManagementDataBoundary';
import { ArrowDownToLine, ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, ListFilter, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { RowActionsMenu } from './RowActionsMenu';
import type { VehicleActionMode } from './VehicleActionDialog';
import { MANAGEMENT_CONFIG, optionLabel, statusTone } from '@/lib/management/config';
import { EMPTY_QUERY, TableQuery, csvCell, filterRows, formatValue, sortRows } from '@/lib/management/table-utils';
import { ManagementKind, ManagementRow } from '@/lib/management/types';
import { useManagement } from './ManagementProvider';
import { DataTable } from './DataTable';
import { Dialog } from './Dialog';
import { StaffOrganizationChart } from './StaffOrganizationChart';
import { ContractSummary } from './ContractSummary';
import { bulkDelete } from '@/lib/management/bulk-delete';
import { staffPositionSuggestions } from '@/lib/management/staff-positions';
import { applyInstallmentBilling } from '@/lib/management/contract-billing';

function FeatureLoading() { return <div className="mg-toast" role="status">Đang mở chức năng…</div>; }
const EntityForm = dynamic(() => import('./EntityForm').then(module => module.EntityForm), { ssr: false, loading: FeatureLoading });
const ContractDetail = dynamic(() => import('./ContractDetail').then(module => module.ContractDetail), { ssr: false, loading: FeatureLoading });
const loadComposer = () => import('@/components/contracts/ContractComposer');
const ContractComposer = dynamic(() => loadComposer().then(module => module.ContractComposer), { ssr: false, loading: FeatureLoading });
const ContractHandoverDialog = dynamic(() => import('@/components/contracts/ContractHandoverDialog').then(module=>module.ContractHandoverDialog), {ssr:false,loading:FeatureLoading});
const CustomerCreateDialog = dynamic(() => import('@/components/contracts/CustomerCreateDialog').then(module => module.CustomerCreateDialog), { ssr: false, loading: FeatureLoading });
const CustomerExcelActions = dynamic(() => import('./CustomerExcelActions').then(module => module.CustomerExcelActions), { ssr: false, loading: FeatureLoading });
const VehicleExcelActions = dynamic(() => import('./VehicleExcelActions').then(module => module.VehicleExcelActions), { ssr: false, loading: FeatureLoading });
const VehicleEditDialog = dynamic(() => import('./VehicleEditDialog').then(module => module.VehicleEditDialog), { ssr: false, loading: FeatureLoading });
const StoreEditDialog = dynamic(() => import('./StoreEditDialog').then(module => module.StoreEditDialog), { ssr: false, loading: FeatureLoading });
const ContractRowReturnDialog = dynamic(() => import('./ContractRowReturnDialog').then(module => module.ContractRowReturnDialog), { ssr: false, loading: FeatureLoading });
const ContractVehicleSwapDialog = dynamic(() => import('./ContractVehicleSwapDialog').then(module => module.ContractVehicleSwapDialog), { ssr: false, loading: FeatureLoading });
const ContractRenewalDialog = dynamic(() => import('./ContractRenewalDialog').then(module => module.ContractRenewalDialog), { ssr: false, loading: FeatureLoading });
const CustomerDetail = dynamic(() => import('./CustomerDetail').then(module => module.CustomerDetail), { ssr: false, loading: FeatureLoading });
const VehicleActionDialog = dynamic(() => import('./VehicleActionDialog').then(module => module.VehicleActionDialog), { ssr: false, loading: FeatureLoading });
const VehicleDetail = dynamic(() => import('./VehicleDetail').then(module => module.VehicleDetail), { ssr: false, loading: FeatureLoading });
const StoreDetail = dynamic(() => import('./StoreDetail').then(module => module.StoreDetail), { ssr: false, loading: FeatureLoading });
const StaffDialog = dynamic(() => import('./StaffDialogs').then(module => module.StaffDialog), { ssr: false, loading: FeatureLoading });

const EMPTY_ROWS: ManagementRow[] = [];
const overdueDays = (returnAt: unknown, now: number) => { const due = Date.parse(String(returnAt ?? '')); return Number.isFinite(due) ? Math.max(0, Math.floor((now - due) / 86_400_000)) : undefined; };

function ManagementContent({ kind, draftsOnly = false, vatOnly = false, overdueOnly = false, paymentDueOnly = false }: { kind: ManagementKind; draftsOnly?: boolean; vatOnly?: boolean; overdueOnly?: boolean; paymentDueOnly?: boolean }) {
  const baseConfig = paymentDueOnly ? { ...MANAGEMENT_CONFIG[kind], title: 'Đến hạn đóng tiền', description: 'Khoản thuê sở hữu đã đến hẹn và chưa đóng đủ. Liên hệ khách để thu tiền theo lịch.', columns: [...MANAGEMENT_CONFIG[kind].columns,
    {key:'billing_next_due_at',label:'Ngày hẹn đóng tiền',format:'date' as const}, {key:'billing_due_amount',label:'Tiền đến hạn còn thiếu',format:'money' as const,align:'right' as const}] } : MANAGEMENT_CONFIG[kind];
  const config = draftsOnly ? { ...baseConfig, title: 'Hợp đồng nháp', description: 'Hợp đồng đang nhập hoặc đang sửa. Mở bản nháp để tiếp tục và lưu cập nhật.' } : vatOnly ? { ...baseConfig, title: 'Hợp đồng VAT', description: 'Hợp đồng có khoản thu vào tài khoản công ty. Theo dõi thanh toán và chuẩn bị chứng từ VAT.', columns: [...baseConfig.columns, { key: 'company_paid_amount', label: 'Đã thu vào TK công ty', format: 'money' as const, align: 'right' as const }] } : overdueOnly ? { ...baseConfig, title: 'Hợp đồng quá hạn', description: 'Hợp đồng đang thuê đã quá ngày hẹn trả xe. Liên hệ khách, gia hạn hoặc nhận trả xe.', columns: [...baseConfig.columns, { key: 'overdue_days', label: 'Số ngày quá hạn', format: 'number' as const, align: 'right' as const }] } : baseConfig;
  const { dataset, loading, refreshing, error, source, canSaveContractDrafts, selectedStore, selectStore, reload, ensureData, invalidateData, notify, deleteCustomer, deleteStore, setCustomerBlacklist } = useManagement();
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = kind === 'contracts' ? searchParams.get('customer_id') : null;
  const contractId = kind === 'contracts' ? searchParams.get('contract_id') : null;
  const contractPath = paymentDueOnly ? '/contracts/due' : vatOnly ? '/contracts/vat' : draftsOnly ? '/contracts/drafts' : overdueOnly ? '/contracts/overdue' : '/contracts';
  const [vehicleTarget, setVehicleTarget] = useState<{ orderId: number; code: string } | null>(null);
  const [returnTarget, setReturnTarget] = useState<{ orderId: number | null; code: string } | null>(null);
  const [renewTarget, setRenewTarget] = useState<ManagementRow | null>(null);
  const [query, setQuery] = useState<TableQuery>(EMPTY_QUERY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>(overdueOnly ? { key: 'overdue_days', direction: 'desc' } : { key: 'code', direction: 'asc' });
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  useEffect(() => {
    if (kind !== 'contracts') return;
    const timer = window.setInterval(() => setOpenedAt(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [kind]);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(config.columns.filter(c => !c.hidden).map(c => c.key));
  const [viewing, setViewing] = useState<ManagementRow | null>(null);
  const [editing, setEditing] = useState<ManagementRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagementRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [blacklistBusyId, setBlacklistBusyId] = useState<number | null>(null);
  const [blacklistError, setBlacklistError] = useState('');
  const blacklistPending = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const [vehicleAction, setVehicleAction] = useState<{ mode: VehicleActionMode; vehicle: ManagementRow | null } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [printRow, setPrintRow] = useState<ManagementRow | null>(null);
  const [composerMode, setComposerMode] = useState<'print' | 'edit' | 'draft' | 'reservation'>('print');
  const [handoverId,setHandoverId] = useState<number|null>(null);
  const columnsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setQuery(current => ({ ...current, filters: { ...current.filters, customer_id: customerId || '', id: contractId || '' } })); setPage(1);
  }, [customerId, contractId]);
  useEffect(() => { setPage(1); }, [selectedStore]);
  useEffect(() => {
    if (kind !== 'contracts' || loading) return;
    const timer = window.setTimeout(() => { void loadComposer(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [kind, loading]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (columnsRef.current && !columnsRef.current.contains(event.target as Node)) columnsRef.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && columnsRef.current?.open) { columnsRef.current.open = false; columnsRef.current.querySelector<HTMLElement>('summary')?.focus(); } };
    document.addEventListener('click', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', escape); };
  }, []);

  const allRows = dataset?.[kind] || EMPTY_ROWS;
  const rows = useMemo(() => {
    const billed = kind === 'contracts' ? allRows.map(row => applyInstallmentBilling(row, openedAt)) : allRows;
    return paymentDueOnly ? billed.filter(row => row.billing_overdue_at && Number(row.billing_due_amount) > 0)
      : draftsOnly ? billed.filter(row => row.status === 'draft') : vatOnly ? billed.filter(row => Number(row.company_payment_count) > 0)
      : overdueOnly ? billed.filter(row => row.status === 'overdue').map(row => ({ ...row, overdue_days: overdueDays(row.end_date, openedAt) })) : billed;
  }, [allRows, kind, draftsOnly, vatOnly, overdueOnly, paymentDueOnly, openedAt]);
  const scopedRows = useMemo(() => filterRows(rows, EMPTY_QUERY, selectedStore), [rows, selectedStore]);
  const dueCount = scopedRows.filter(row => row.billing_overdue_at && Number(row.billing_due_amount) > 0).length;
  const filteredRows = useMemo(() => sortRows(filterRows(scopedRows, query, 'all'), sort.key, sort.direction), [scopedRows, query, sort]);
  const tabRows = useMemo(() => filterRows(scopedRows, { ...query, status: '' }, 'all'), [scopedRows, query]);
  const statusCounts = useMemo(() => { const counts = new Map<string, number>(); for (const row of tabRows) counts.set(row.status, (counts.get(row.status) || 0) + 1); return counts; }, [tabRows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  const columns = config.columns.filter(c => visibleKeys.includes(c.key));
  const statusOptions = [...config.statuses, ...Array.from(new Set(rows.map(row => row.status))).filter(status => status && !config.statuses.some(option => option.value === status)).map(value => ({ value, label: kind === 'contracts' ? optionLabel(config, 'status', value) : `Trạng thái ${value}` }))];
  const isFiltered = Boolean(query.search || query.status || query.startDate || query.endDate || selectedStore !== 'all' || Object.values(query.filters).some(Boolean));
  const canEdit = kind === 'customers' || kind === 'stores' || kind === 'vehicles';
  const canDelete = source === 'api' && (kind === 'customers' || kind === 'stores' || kind === 'vehicles');
  const invalidDate = Boolean(query.startDate && query.endDate && query.startDate > query.endDate);
  const canBulkDelete = source === 'api' && kind !== 'contracts';
  useEffect(() => {
    setSelectedIds(current => {
      const present = new Set(rows.map(row => row.id));
      const next = new Set([...current].filter(id => present.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rows]);
  function changeSelection(ids: number[], selected: boolean) {
    setSelectedIds(current => { const next = new Set(current); for (const id of ids) if (selected) next.add(id); else next.delete(id); return next; });
  }
  async function deleteSelected() {
    if (bulkDeleteBusy || !selectedIds.size) return;
    setBulkDeleteBusy(true); setBulkDeleteError('');
    try {
      const deleted = await bulkDelete(kind, [...selectedIds]);
      setSelectedIds(new Set()); setBulkDeleteOpen(false);
      notify(`Đã xóa ${deleted.length} ${config.singular}.`);
      await ensureData([kind], true).catch(() => {});
    } catch (cause) { setBulkDeleteError(cause instanceof Error ? cause.message : `Không xóa được ${config.singular}.`); }
    finally { setBulkDeleteBusy(false); }
  }
  const bulkDeleteNote: Record<ManagementKind, string> = {
    contracts: 'Hợp đồng đã chọn sẽ bị ẩn khỏi danh sách (xóa mềm, dữ liệu vẫn được giữ trong hệ thống). Xe đang thuê theo các hợp đồng này được trả về trạng thái Lưu kho; phiếu thu/chi đã ghi vẫn giữ nguyên trong Sổ quỹ.',
    customers: 'Hồ sơ khách hàng sẽ bị xóa khỏi hệ thống. Nếu có khách hàng đã có đơn thuê, toàn bộ lượt xóa bị hủy để bảo toàn lịch sử.',
    stores: 'Cơ sở sẽ bị xóa khỏi hệ thống. Nếu có cơ sở còn xe, nhân sự, hợp đồng hoặc dữ liệu liên quan, toàn bộ lượt xóa bị hủy.',
    vehicles: 'Xe sẽ bị xóa khỏi hệ thống. Nếu có xe đã nằm trong hợp đồng, bản nháp hoặc dữ liệu liên quan, toàn bộ lượt xóa bị hủy.',
    staff: 'Hồ sơ nhân sự sẽ bị xóa khỏi hệ thống. Nếu có nhân sự còn lịch trực hoặc dữ liệu liên quan, toàn bộ lượt xóa bị hủy.',
  };
  const updateQuery = (next: Partial<TableQuery>) => { setQuery(current => ({ ...current, ...next })); setPage(1); };

  function clearFilters() {
    setQuery(EMPTY_QUERY); setPage(1); selectStore('all');
    if (customerId || contractId) router.replace(contractPath);
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
  function warmComposer() {
    if (loading || error) return;
    void loadComposer();
    void ensureData(CONTRACT_DATA_KINDS).catch(() => {});
  }

  return <section className="mg-page" aria-label={config.title}>
    <div className="mg-page-content">
      <div className="mg-page-heading">{kind === 'contracts' ? <div><h1>{config.title}</h1></div> : <div><div className="mg-eyebrow">DANH MỤC QUẢN LÝ <span>/</span> {String(navigationNumber(kind)).padStart(2, '0')}</div><h1>{config.title}<span className="mg-title-count">{loading || error ? '—' : scopedRows.length}</span></h1><p>{config.description}</p></div>}
        <div className="mg-heading-actions">{canBulkDelete && <button type="button" className="mg-button mg-button-danger" disabled={loading || Boolean(error) || !selectedIds.size} onClick={() => { setBulkDeleteError(''); setBulkDeleteOpen(true); }}><Trash2 size={16} />Xóa đã chọn{selectedIds.size ? ` (${selectedIds.size})` : ''}</button>}{kind !== 'contracts' && <button type="button" className="mg-button" onClick={exportCsv} disabled={loading || Boolean(error) || !filteredRows.length}><ArrowDownToLine size={17} />Xuất CSV</button>}
          {kind === 'customers' && <CustomerExcelActions disabled={loading || Boolean(error) || !dataset} />}
          {kind === 'vehicles' && <VehicleExcelActions disabled={loading || Boolean(error) || !dataset} />}
          {kind === 'vehicles' && source === 'api' && <RowActionsMenu label="Hành động xe" triggerLabel={<>Hành động xe<ChevronDown size={16} /></>} disabled={loading || Boolean(error) || !dataset} actions={[
            { key: 'create', label: 'Nhập xe', icon: <Plus size={16} />, onSelect: () => { setEditing(null); setFormOpen(true); } },
            { key: 'transfer', label: 'Chuyển xe', icon: <ArrowLeftRight size={16} />, onSelect: () => setVehicleAction({ mode: 'transfer', vehicle: null }) },
            { key: 'status', label: 'Đổi trạng thái', icon: <RefreshCw size={16} />, onSelect: () => setVehicleAction({ mode: 'status', vehicle: null }) },
          ]} />}
          {(kind === 'customers' || kind === 'stores' || kind === 'vehicles' || kind === 'staff') && <button type="button" className="mg-button mg-button-primary" disabled={loading || Boolean(error)} onClick={() => {
            if (kind === 'customers' && source === 'api') setCreateCustomerOpen(true);
            else if (kind === 'staff') setCreateStaffOpen(true);
            else { setEditing(null); setFormOpen(true); }
          }}><Plus size={18} />{config.addLabel}</button>}
          {(kind === 'stores' || kind === 'vehicles' || kind === 'customers') && <button type="button" className="mg-button" disabled={loading || refreshing || blacklistBusyId !== null} onClick={() => { setBlacklistError(''); void reload(); }}><RotateCcw size={17} className={refreshing ? 'mg-spin' : undefined} />{refreshing ? 'Đang tải…' : 'Làm mới'}</button>}
          {kind === 'contracts' && <><button type="button" className="mg-button" disabled={loading || Boolean(error) || !dataset || !canSaveContractDrafts} onPointerEnter={warmComposer} onFocus={warmComposer} onClick={()=>{setPrintRow(null);setComposerMode('reservation');setComposerOpen(true);}}><Plus size={17}/>Nhận cọc giữ xe</button><button type="button" className="mg-button mg-button-primary" disabled={loading || Boolean(error) || !dataset} onPointerEnter={warmComposer} onFocus={warmComposer} onClick={() => { setPrintRow(null); setComposerMode('draft'); setComposerOpen(true); }}><Plus size={17} />Nhập hợp đồng</button></>}</div>
      </div>

      {kind === 'staff' && <StaffOrganizationChart />}

      <div className="mg-data-panel">
        <div className="mg-status-tabs" aria-label="Lọc theo trạng thái"><button type="button" className={!query.status ? 'is-active' : ''} aria-pressed={!query.status} onClick={() => updateQuery({ status: '' })}>Tất cả<span>{tabRows.length}</span></button>
          {statusOptions.filter(option => (kind === 'contracts' && !overdueOnly && option.value === 'draft') || statusCounts.has(option.value) || query.status === option.value).map(option => <button type="button" key={option.value} className={query.status === option.value ? 'is-active' : ''} aria-pressed={query.status === option.value} onClick={() => updateQuery({ status: option.value })}>{option.label}<span>{statusCounts.get(option.value) || 0}</span></button>)}</div>
        <div className="mg-toolbar"><label className="mg-search"><Search size={17} /><span className="mg-sr-only">Tìm kiếm {config.title.toLowerCase()}</span><input type="search" placeholder={config.searchPlaceholder} value={query.search} onChange={event => updateQuery({ search: event.target.value })} />{query.search && <button type="button" aria-label="Xóa từ khóa" onClick={() => updateQuery({ search: '' })}><X size={15} /></button>}</label>
          <div className="mg-filter-controls"><span className="mg-filter-icon"><ListFilter size={16} /></span>{config.filters.map(filter => <label className="mg-sr-label" key={filter.key}><span className="mg-sr-only">{filter.label}</span><select aria-label={filter.label} value={query.filters[filter.key] || ''} onChange={event => updateQuery({ filters: { ...query.filters, [filter.key]: event.target.value } })}><option value="">{filter.label}</option>{(kind === 'staff' && filter.key === 'position' ? staffPositionSuggestions(allRows.map(row => row.position)).map(label => ({ value: label, label })) : filter.options).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
            <label className="mg-sr-label"><span className="mg-sr-only">Lọc trạng thái</span><select aria-label="Lọc trạng thái" value={query.status} onChange={event => updateQuery({ status: event.target.value })}><option value="">Tất cả trạng thái</option>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <details className="mg-column-menu" ref={columnsRef}><summary className="mg-button" aria-label="Ẩn hiện cột"><Columns3 size={16} /><span>Cột</span></summary><div className="mg-popover"><strong>Hiển thị cột</strong>{config.columns.map(column => <label key={column.key}><input type="checkbox" checked={visibleKeys.includes(column.key)} disabled={visibleKeys.length === 1 && visibleKeys.includes(column.key)} onChange={event => setVisibleKeys(current => event.target.checked ? [...current, column.key] : current.filter(key => key !== column.key))} />{column.label}</label>)}</div></details>
          </div>
        </div>
        {kind === 'contracts' && <div className="mg-date-filters mg-date-range-inline"><span>Ngày bắt đầu thuê</span><label><span className="mg-sr-only">Từ ngày</span><input type="date" aria-label="Từ ngày" value={query.startDate} onChange={event => updateQuery({ startDate: event.target.value })} aria-invalid={invalidDate} /></label><span className="mg-date-divider">—</span><label><span className="mg-sr-only">Đến ngày</span><input type="date" aria-label="Đến ngày" value={query.endDate} onChange={event => updateQuery({ endDate: event.target.value })} aria-invalid={invalidDate} /></label>{invalidDate && <span className="mg-field-error" role="alert">Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</span>}
          {customerId && <span className="mg-active-filter">Khách hàng #{customerId}<button type="button" aria-label="Bỏ lọc khách hàng" onClick={() => router.replace(contractPath)}><X size={13} /></button></span>}{contractId && <span className="mg-active-filter">Hợp đồng #{contractId}<button type="button" aria-label="Bỏ lọc hợp đồng" onClick={() => router.replace(contractPath)}><X size={13} /></button></span>}</div>}
        {isFiltered && <div className="mg-filter-summary"><span><strong>{filteredRows.length}</strong> kết quả phù hợp</span><button type="button" onClick={clearFilters}><RotateCcw size={13} />Xóa bộ lọc</button></div>}
        {kind === 'contracts' && !loading && !error && dueCount > 0 && <div className="mg-billing-reminder" role="status"><p><strong>{dueCount} hợp đồng thuê sở hữu đến hạn đóng tiền.</strong> Khoản chưa đóng đủ tiếp tục hiện để kế toán giục nợ.</p>{!paymentDueOnly && <button className="mg-button" type="button" onClick={() => router.push('/contracts/due')}>Xem khoản đến hạn</button>}</div>}
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
          onPayment={kind === 'contracts' && source === 'api' ? row => router.push(`/cashbook?contract_id=${row.id}&purpose=debt`) : undefined}
          onHandover={kind === 'contracts' && source === 'api' ? row=>setHandoverId(row.id) : undefined}
          onReturn={kind === 'contracts' && source === 'api' ? row => setReturnTarget({ orderId: row.id, code: row.code }) : undefined}
          onRenew={kind === 'contracts' && source === 'api' ? row => setRenewTarget(row) : undefined}
          onVehicleChange={kind === 'contracts' && source === 'api' ? row => setVehicleTarget({ orderId: row.id, code: row.code }) : undefined}
          onVehicleAction={kind === 'vehicles' && source === 'api' && canEdit ? (row, mode) => setVehicleAction({ mode, vehicle: row }) : undefined}

          canEditContract={false}
          canEditDraft={kind === 'contracts' && canSaveContractDrafts}
          canEdit={canEdit} loading={loading} error={error} isFiltered={isFiltered} onReset={clearFilters} onRetry={() => void reload()}
          selectedIds={canBulkDelete ? selectedIds : undefined} onSelectionChange={canBulkDelete ? changeSelection : undefined} />
        <div className="mg-pagination"><div className="mg-result-range" aria-live="polite">Hiển thị <strong>{filteredRows.length ? offset + 1 : 0}–{Math.min(offset + pageSize, filteredRows.length)}</strong> trong <strong>{filteredRows.length}</strong> {config.singular}</div>
          <div className="mg-pagination-controls"><label>Số dòng<select aria-label="Số dòng mỗi trang" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
            <div className="mg-page-buttons"><button type="button" className="mg-icon-button" aria-label="Trang đầu" disabled={safePage === 1 || loading} onClick={() => setPage(1)}><ChevronsLeft size={16} /></button><button type="button" className="mg-icon-button" aria-label="Trang trước" disabled={safePage === 1 || loading} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16} /></button>
              <span className="mg-current-page">{safePage}</span><span className="mg-page-total">/ {pageCount}</span><button type="button" className="mg-icon-button" aria-label="Trang sau" disabled={safePage === pageCount || loading} onClick={() => setPage(safePage + 1)}><ChevronRight size={16} /></button><button type="button" className="mg-icon-button" aria-label="Trang cuối" disabled={safePage === pageCount || loading} onClick={() => setPage(pageCount)}><ChevronsRight size={16} /></button></div>
          </div>
        </div>
      </div>
      <div className="mg-list-note"><span className="mg-note-line" />{kind === 'contracts' ? canSaveContractDrafts ? 'Dữ liệu hiện tại từ Supabase. Bản nháp được lưu trên hệ thống để mở lại và tiếp tục sửa.' : 'Danh sách lấy từ hệ thống; chức năng ghi bản nháp chưa được kết nối.' : kind === 'customers' && source === 'api' ? 'Dữ liệu khách hàng được đọc và cập nhật trực tiếp trong Supabase. Hồ sơ có đơn thuê liên quan sẽ được bảo vệ khỏi thao tác xóa.' : kind === 'stores' ? 'Cơ sở được cập nhật trực tiếp trong Supabase. Chỉ xóa được cơ sở chưa có dữ liệu liên quan; có thể chọn Tạm ngừng để giữ lịch sử.' : kind === 'vehicles' ? 'Có thể đánh dấu Đang thuê trước khi nhập hợp đồng. Xe đã có hợp đồng mở phải trả xe trên hợp đồng; cơ sở giữ xe và cơ sở ghi nhận doanh thu được quản lý riêng.' : kind === 'staff' ? 'Nhân sự được thêm, sửa trực tiếp trong Supabase; mã nhân sự do hệ thống tự cấp. Nhân sự còn lịch trực hoặc dữ liệu liên quan được bảo vệ khỏi xóa.' : 'Các trường chưa được API cung cấp hiển thị “—”. Danh sách hiện chỉ đọc.'}</div>
    </div>
    {formOpen && kind === 'vehicles' ? <VehicleEditDialog row={editing} onClose={() => setFormOpen(false)} /> : formOpen && kind === 'stores' ? <StoreEditDialog row={editing} onSaved={() => { if (!editing) { setQuery(EMPTY_QUERY); setPage(1); } }} onClose={() => setFormOpen(false)} /> : formOpen && <EntityForm config={config} row={editing} onClose={() => setFormOpen(false)} />}
    {createStaffOpen && kind === 'staff' && <StaffDialog row={null} mode="create" stores={dataset?.stores || EMPTY_ROWS} defaultStoreId={selectedStore === 'all' ? '' : selectedStore} onClose={() => setCreateStaffOpen(false)}
      onChanged={async created => { if (created) notify(`Đã thêm nhân sự ${created.name}${created.code ? ` · ${created.code}` : ''}.`); await reload(['stores', 'staff']); }} />}
    {createCustomerOpen && kind === 'customers' && <CustomerCreateDialog idCard="" onCreated={() => setCreateCustomerOpen(false)} onClose={() => setCreateCustomerOpen(false)} />}
    {deleteTarget && canDelete && <Dialog title={kind === 'stores' ? 'Xóa cơ sở?' : kind === 'vehicles' ? 'Xóa xe?' : 'Xóa hồ sơ khách hàng?'} subtitle={kind === 'vehicles' ? `${deleteTarget.name} · ${deleteTarget.license || deleteTarget.code}` : `${deleteTarget.name} · ${deleteTarget.code}`} onClose={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError(''); } }}>
      <div className="mg-dialog-body"><p>{kind === 'stores' ? 'Chỉ xóa cơ sở chưa có xe, nhân sự, khách hàng, hợp đồng, giao dịch hoặc dữ liệu liên quan. Cơ sở đã được sử dụng sẽ được giữ lại để bảo toàn lịch sử.' : kind === 'vehicles' ? 'Xe sẽ bị xóa hẳn khỏi Supabase. Chỉ xóa được xe chưa từng nằm trong hợp đồng, bản nháp hoặc dữ liệu liên quan; xe đã dùng nên chuyển sang Đã bán hoặc Hỏng để giữ lịch sử.' : 'Thao tác này sẽ xóa hồ sơ khách hàng khỏi Supabase. Hồ sơ đang được dùng trong đơn thuê sẽ không thể xóa để bảo toàn lịch sử.'}</p>{deleteError && <p className="mg-error-message" role="alert">{deleteError}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Hủy</button><button type="button" className="mg-button mg-button-danger" disabled={deleteBusy} onClick={async () => {
        if (!deleteTarget || deleteBusy) return;
        setDeleteBusy(true); setDeleteError('');
        try {
          if (kind === 'stores') await deleteStore(deleteTarget.id);
          else if (kind === 'vehicles') { await bulkDelete('vehicles', [deleteTarget.id]); notify(`Đã xóa xe ${deleteTarget.license || deleteTarget.name}.`); await ensureData(['vehicles'], true).catch(() => {}); }
          else await deleteCustomer(deleteTarget.id);
          setDeleteTarget(null);
        }
        catch (cause) { setDeleteError(cause instanceof Error ? cause.message : `Không xóa được ${config.singular}.`); }
        finally { setDeleteBusy(false); }
      }}>{deleteBusy ? 'Đang xóa…' : <><Trash2 size={16} />{kind === 'stores' ? 'Xóa cơ sở' : kind === 'vehicles' ? 'Xóa xe' : 'Xóa khách hàng'}</>}</button></div>
    </Dialog>}
    {bulkDeleteOpen && canBulkDelete && <Dialog title={`Xóa ${selectedIds.size} ${config.singular}?`} subtitle={rows.filter(row => selectedIds.has(row.id)).map(row => row.code || row.name || `#${row.id}`).slice(0, 6).join(', ') + (selectedIds.size > 6 ? '…' : '')} onClose={() => { if (!bulkDeleteBusy) setBulkDeleteOpen(false); }}>
      <div className="mg-dialog-body"><p>{bulkDeleteNote[kind]}</p>{bulkDeleteError && <p className="mg-error-message" role="alert">{bulkDeleteError}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={bulkDeleteBusy} onClick={() => setBulkDeleteOpen(false)}>Hủy</button><button type="button" className="mg-button mg-button-danger" disabled={bulkDeleteBusy} onClick={() => void deleteSelected()}>{bulkDeleteBusy ? 'Đang xóa…' : <><Trash2 size={16} />Xóa {selectedIds.size} {config.singular}</>}</button></div>
    </Dialog>}
    {returnTarget !== null && kind === 'contracts' && <ContractRowReturnDialog contractId={returnTarget.orderId ?? undefined} contractCode={returnTarget.code} onClose={() => setReturnTarget(null)} />}
    {renewTarget && kind === 'contracts' && <ContractRenewalDialog orderId={renewTarget.id} contractCode={renewTarget.code} unitPrice={typeof renewTarget.unit_price === 'number' && renewTarget.unit_price > 0 ? renewTarget.unit_price : undefined} onClose={() => setRenewTarget(null)} />}
    {vehicleTarget && kind === 'contracts' && <ManagementDataBoundary kinds={VEHICLE_DATA_KINDS} title="Đổi xe" onClose={() => setVehicleTarget(null)}><ContractVehicleSwapDialog orderId={vehicleTarget.orderId} contractCode={vehicleTarget.code} onClose={() => setVehicleTarget(null)} /></ManagementDataBoundary>}
    {viewing && kind === 'contracts' && <ContractDetail row={viewing} onClose={() => setViewing(null)} onReturn={() => { setReturnTarget({ orderId: viewing.id, code: viewing.code }); setViewing(null); }} onRenew={() => { setRenewTarget(viewing); setViewing(null); }} onVehicleChange={() => { setVehicleTarget({ orderId: viewing.id, code: viewing.code }); setViewing(null); }} onPayment={() => { router.push(`/cashbook?contract_id=${viewing.id}&purpose=debt`); setViewing(null); }} onPrint={() => { setPrintRow(viewing); setComposerMode('print'); setViewing(null); setComposerOpen(true); }}
      onPrintVersion={version => { setPrintRow({ ...viewing, ...(version.end_date ? { end_date: version.end_date } : {}), ...(version.total_amount !== null ? { total_amount: version.total_amount } : {}), ...(version.paid_amount !== null ? { paid_amount: version.paid_amount } : {}) }); setComposerMode('print'); setViewing(null); setComposerOpen(true); }} />}
    {composerOpen && dataset && <ManagementDataBoundary kinds={CONTRACT_DATA_KINDS} title="Mở hợp đồng" onClose={() => setComposerOpen(false)}><ContractComposer key={`${composerMode}-${printRow?.id || 'new'}`} row={printRow} mode={composerMode} onClose={() => setComposerOpen(false)} onDraftSaved={() => { setQuery(EMPTY_QUERY); setPage(1); selectStore('all'); router.push('/contracts/drafts'); }}
      onFinalized={result => {
        notify(`${result.status === 'deposit_contract' ? 'Đã nhận cọc giữ xe, chờ giao xe' : 'Đã lưu chính thức hợp đồng'} ${result.code}${result.transaction_ids.length ? ` và ghi ${result.transaction_ids.length} phiếu thu vào Sổ quỹ` : ''}.`);
        invalidateData(['vehicles', 'customers']);
        void ensureData(['contracts'], true).catch(() => {});
        setQuery(EMPTY_QUERY); setPage(1); selectStore('all'); router.push(`/contracts?contract_id=${result.order_id}`);
      }} /></ManagementDataBoundary>}
    {viewing && kind === 'customers' && <CustomerDetail row={viewing} config={config} canEdit={canEdit} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }} />}
    {viewing && kind === 'stores' && <StoreDetail row={viewing} canEdit={canEdit} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }} />}
    {viewing && kind === 'vehicles' && <VehicleDetail row={viewing} config={config} canEdit={canEdit} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }}
      onAction={mode => { setVehicleAction({ mode, vehicle: viewing }); setViewing(null); }} />}
    {vehicleAction && <VehicleActionDialog mode={vehicleAction.mode} vehicle={vehicleAction.vehicle} onClose={() => setVehicleAction(null)} />}
    {handoverId && <ContractHandoverDialog id={handoverId} onClose={()=>setHandoverId(null)} onDone={context=>{setHandoverId(null);invalidateData(['contracts','vehicles']);notify(`Đã giao xe đơn ${context.code}. Tiền thuê trả trước được giữ nguyên.`);if (context.remaining !== null && context.remaining > 0) router.push(`/cashbook?contract_id=${context.id}&purpose=debt`);else void ensureData(['contracts','vehicles'],true).catch(()=>{});}} />}
    {viewing && kind !== 'contracts' && kind !== 'customers' && kind !== 'stores' && kind !== 'vehicles' && <Dialog title={String(viewing.name)} subtitle={`${viewing.code} · ${config.title}`} onClose={() => setViewing(null)}>
      <div className="mg-dialog-body"><span className={`mg-status mg-status-${statusTone(viewing.status)}`}><span />{optionLabel(config, 'status', viewing.status)}</span>
        <dl className="mg-detail-grid">{config.columns.filter(column => column.key !== 'name' && column.key !== 'status').map(column => <div key={column.key}><dt>{column.label}</dt><dd>{optionLabel(config, column.key, formatValue(viewing[column.key], column.format))}</dd></div>)}
          {config.fields.filter(field => !config.columns.some(column => column.key === field.key) && field.key !== 'store_id').map(field => <div key={field.key}><dt>{field.label}</dt><dd>{viewing[field.key] || '—'}</dd></div>)}</dl></div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={() => setViewing(null)}>Đóng</button>{canEdit && <button type="button" className="mg-button mg-button-primary" onClick={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }}>Chỉnh sửa thông tin</button>}</div>
    </Dialog>}
  </section>;
}

const navigationNumber = (kind: ManagementKind) => ['staff', 'customers', 'contracts', 'stores', 'vehicles'].indexOf(kind) + 1;
export function ManagementPage({ kind, draftsOnly = false, vatOnly = false, overdueOnly = false, paymentDueOnly = false }: { kind: ManagementKind; draftsOnly?: boolean; vatOnly?: boolean; overdueOnly?: boolean; paymentDueOnly?: boolean }) {
  return <Suspense fallback={<div className="mg-table-state" role="status">Đang chuẩn bị danh sách…</div>}><ManagementContent key={`${kind}-${draftsOnly}-${vatOnly}-${overdueOnly}-${paymentDueOnly}`} kind={kind} draftsOnly={draftsOnly} vatOnly={vatOnly} overdueOnly={overdueOnly} paymentDueOnly={paymentDueOnly} /></Suspense>;
}

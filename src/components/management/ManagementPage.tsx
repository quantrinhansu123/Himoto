'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { CONTRACT_DATA_KINDS, VEHICLE_DATA_KINDS } from '@/lib/management/data-loader';
import { ManagementDataBoundary } from './ManagementDataBoundary';
import { ArrowDownToLine, ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, ListFilter, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { RowActionsMenu } from './RowActionsMenu';
import type { VehicleActionMode } from './VehicleActionDialog';
import { MANAGEMENT_CONFIG, optionLabel, statusTone } from '@/lib/management/config';
import { EMPTY_QUERY, OVERDUE_COMPARE_OPTIONS, TableQuery, csvCell, filterRows, formatValue, sortRows } from '@/lib/management/table-utils';
import { ManagementColumn, ManagementKind, ManagementRow } from '@/lib/management/types';
import { useManagement } from './ManagementProvider';
import { DataTable } from './DataTable';
import { Dialog } from './Dialog';
import { StaffOrganizationChart } from './StaffOrganizationChart';
import { ContractSummary } from './ContractSummary';
import { bulkDelete } from '@/lib/management/bulk-delete';
import { cashbookPaymentPath, type PaymentPurpose } from '@/lib/management/contract-payments';
import { batteryPrefillFromVehicleContract } from '@/lib/management/battery-from-contract';
import type { BatteryContract } from '@/lib/management/battery-contracts';
import { staffPositionSuggestions } from '@/lib/management/staff-positions';
import { ResponsiveDataActions } from './ResponsiveDataActions';
import { useContractTypes } from '@/components/contracts/ContractTypesProvider';
import { useManagementTable } from './useManagementTable';
import type { ManagementTableInput } from '@/lib/management/management-table';

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
const BatteryContractForm = dynamic(() => import('@/components/battery/BatteryContractsPage').then(module => module.BatteryContractForm), { ssr: false, loading: FeatureLoading });
const BatteryPrintPreview = dynamic(() => import('@/components/battery/BatteryContractsPage').then(module => module.BatteryPrintPreview), { ssr: false, loading: FeatureLoading });
const CustomerDetail = dynamic(() => import('./CustomerDetail').then(module => module.CustomerDetail), { ssr: false, loading: FeatureLoading });
const VehicleActionDialog = dynamic(() => import('./VehicleActionDialog').then(module => module.VehicleActionDialog), { ssr: false, loading: FeatureLoading });
const VehicleDetail = dynamic(() => import('./VehicleDetail').then(module => module.VehicleDetail), { ssr: false, loading: FeatureLoading });
const StoreDetail = dynamic(() => import('./StoreDetail').then(module => module.StoreDetail), { ssr: false, loading: FeatureLoading });
const StaffDialog = dynamic(() => import('./StaffDialogs').then(module => module.StaffDialog), { ssr: false, loading: FeatureLoading });
const ContractQrDialog=dynamic(()=>import('./ContractPaymentQr').then(module=>module.ContractQrDialog),{ssr:false,loading:FeatureLoading});
const DebtReminderDialog=dynamic(()=>import('./DebtReminderDialog').then(module=>module.DebtReminderDialog),{ssr:false,loading:FeatureLoading});

const EMPTY_ROWS: ManagementRow[] = [];
const overdueDays = (returnAt: unknown, now: number) => { const due = Date.parse(String(returnAt ?? '')); return Number.isFinite(due) ? Math.max(0, Math.floor((now - due) / 86_400_000)) : undefined; };
function vehicleOverdueDays(row: ManagementRow, now: number) {
  try {
    const rentals = row.rentals_json ? JSON.parse(String(row.rentals_json)) as { return_at?: string | null }[] : [];
    let max = 0;
    for (const rental of rentals) {
      const days = overdueDays(rental.return_at, now);
      if (days && days > max) max = days;
    }
    return max > 0 ? max : undefined;
  } catch { return undefined; }
}

function ManagementContent({ kind, draftsOnly = false, vatOnly = false, overdueOnly = false, ownershipOnly = false, paymentDueOnly = false }: { kind: ManagementKind; draftsOnly?: boolean; vatOnly?: boolean; overdueOnly?: boolean; ownershipOnly?: boolean; paymentDueOnly?: boolean }) {
  const catalog = useContractTypes(kind === 'contracts');
  const configured = kind === 'contracts' ? { ...MANAGEMENT_CONFIG.contracts,
    filters: MANAGEMENT_CONFIG.contracts.filters.map(filter=>filter.key === 'rental_type' ? {...filter,key:'contract_type_id',options:catalog.types.map(type=>({value:type.id,label:`${type.label}${!type.active ? ' (đã ẩn)' : ''}`}))} : filter),
    columns: MANAGEMENT_CONFIG.contracts.columns.map(column=>column.key === 'rental_type' ? {...column,key:'contract_type_name'} : column),
  } : MANAGEMENT_CONFIG[kind];
  const overdueDaysColumn: ManagementColumn = { key: 'overdue_days', label: 'Số ngày quá hạn', format: 'number', align: 'right' };
  const baseConfig = paymentDueOnly ? { ...configured, title: 'Đến hạn đóng tiền', description: 'Khoản thuê sở hữu đã đến hẹn và chưa đóng đủ. Liên hệ khách để thu tiền theo lịch.', columns: [...configured.columns,
    { key: 'billing_next_due_at', label: 'Ngày hẹn đóng tiền', format: 'date' as const }, { key: 'billing_due_amount', label: 'Tiền đến hạn còn thiếu', format: 'money' as const, align: 'right' as const }] } : configured;
  const config = draftsOnly ? { ...baseConfig, title: 'Hợp đồng nháp', description: 'Hợp đồng đang nhập hoặc đang sửa. Mở bản nháp để tiếp tục và lưu cập nhật.' } : vatOnly ? { ...baseConfig, title: 'Hợp đồng VAT', description: 'Hợp đồng có khoản thu vào tài khoản công ty. Theo dõi thanh toán và chuẩn bị chứng từ VAT.', columns: [...baseConfig.columns, { key: 'company_paid_amount', label: 'Đã thu vào TK công ty', format: 'money' as const, align: 'right' as const }] } : overdueOnly ? { ...baseConfig, title: 'Hợp đồng quá hạn', description: 'Hợp đồng đang thuê đã quá ngày hẹn trả xe. Liên hệ khách, gia hạn hoặc nhận trả xe.', columns: [baseConfig.columns[0], overdueDaysColumn, ...baseConfig.columns.slice(1)] } : ownershipOnly ? { ...baseConfig, title: 'Hợp đồng thuê sở hữu', description: 'Hợp đồng thuộc cơ sở thuê sở hữu hoặc loại Thuê sở hữu / Thuê sở hữu( cd). Bản nháp và loại sở hữu được ưu tiên lên đầu danh sách.', columns: baseConfig.columns.map(column => column.key === 'contract_type_name' ? { ...column, hidden: false } : column) } : baseConfig;
  const { dataset, loading:datasetLoading, refreshing:datasetRefreshing, error:datasetError, resources, source, canSaveContractDrafts, canPayContracts, can, selectedStore, selectStore, reload:reloadDataset, ensureData, invalidateData, notify, deleteCustomer, deleteStore, setCustomerBlacklist } = useManagement();
  const paged = kind === 'contracts' || kind === 'customers';
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = kind === 'contracts' ? searchParams.get('customer_id') : null;
  const contractId = kind === 'contracts' ? searchParams.get('contract_id') : null;
  const searchFromUrl = kind === 'contracts' ? searchParams.get('search') || '' : '';
  const contractPath = paymentDueOnly ? '/contracts/due' : vatOnly ? '/contracts/vat' : draftsOnly ? '/contracts/drafts' : overdueOnly ? '/contracts/overdue' : ownershipOnly ? '/contracts/ownership' : '/contracts';
  const [vehicleTarget, setVehicleTarget] = useState<{ orderId: number; code: string } | null>(null);
  const [returnTarget, setReturnTarget] = useState<{ orderId: number | null; code: string;query?:string } | null>(null);
  const [renewTarget, setRenewTarget] = useState<ManagementRow | null>(null);
  const [renewPicker, setRenewPicker] = useState(false);
  const [renewSearch, setRenewSearch] = useState('');
  const handledAction = useRef('');
  const [batteryRentTarget, setBatteryRentTarget] = useState<ManagementRow | null>(null);
  const [batteryPrinting, setBatteryPrinting] = useState<BatteryContract | null>(null);
  const [query, setQuery] = useState<TableQuery>(()=>({...EMPTY_QUERY,search:searchFromUrl}));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>(overdueOnly ? { key: 'overdue_days', direction: 'desc' } : { key: 'code', direction: 'asc' });
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const ownershipStoreIds = useMemo(() => new Set((dataset?.stores || EMPTY_ROWS).filter(store => store.kind === 'lease_to_own').map(store => store.id)), [dataset?.stores]);
  const tableInput:ManagementTableInput={kind:kind==='customers'?'customers':'contracts',query,store:selectedStore,scope:draftsOnly?'drafts':vatOnly?'vat':overdueOnly?'overdue':ownershipOnly?'ownership':paymentDueOnly?'due':'',page,size:pageSize,sort:sort.key,direction:sort.direction};
  const table=useManagementTable(tableInput,paged,resources[kind],[...ownershipStoreIds]);
  const renewable=useManagementTable({...tableInput,query:{...EMPTY_QUERY,search:renewSearch},scope:'renewable',page:1,size:30},renewPicker,resources.contracts,[...ownershipStoreIds]);
  const loading=datasetLoading || paged && table.loading && !table.data;
  const refreshing=datasetRefreshing || paged && table.loading && Boolean(table.data);
  const error=datasetError || (paged?table.error:'');
  async function reload(kinds?:readonly ManagementKind[]) { if(paged)table.refresh(); await reloadDataset(kinds); }
  useEffect(() => {
    if (kind !== 'contracts') return;
    const timer = window.setInterval(() => setOpenedAt(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [kind]);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(config.columns.filter(c => !c.hidden).map(c => c.key));
  const [viewing, setViewing] = useState<ManagementRow | null>(null);
  const [qrTarget,setQrTarget]=useState<number|null>(null);
  const [reminderTarget,setReminderTarget]=useState<number|null>(null);
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
  useEffect(()=>{
    const action = searchParams.get('action');
    if (!action) {handledAction.current='';return;}
    if (loading || error || !dataset || handledAction.current === action) return;
    handledAction.current = action;
    if (kind === 'contracts' && action === 'new') {setPrintRow(null);setComposerMode('draft');setComposerOpen(true);}
    else if (kind === 'contracts' && action === 'return') setReturnTarget({orderId:null,code:'',query:searchParams.get('query')||''});
    else if (kind === 'contracts' && action === 'renew') setRenewPicker(true);
    else if (kind === 'vehicles' && action === 'status') setVehicleAction({mode:'status',vehicle:null});
    router.replace(contractPath === '/contracts' && kind !== 'contracts' ? '/vehicles' : contractPath,{scroll:false});
  },[searchParams,loading,error,dataset,kind,router,contractPath]);

  useEffect(() => {
    setQuery(current => ({ ...current, filters: { ...current.filters, customer_id: customerId || '', id: contractId || '' } })); setPage(1);
  }, [customerId, contractId]);
  useEffect(()=>{setQuery(current=>({...current,search:searchFromUrl}));setPage(1);},[searchFromUrl]);
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

  const allRows = paged ? table.data?.rows || EMPTY_ROWS : dataset?.[kind] || EMPTY_ROWS;
  const rows:ManagementRow[] = useMemo(() => kind === 'vehicles' ? allRows.map(row => ({...row,overdue_days:vehicleOverdueDays(row,openedAt)})) : allRows,[allRows,kind,openedAt]);
  const scopedRows = useMemo(() => filterRows(rows, EMPTY_QUERY, selectedStore), [rows, selectedStore]);
  const dueCount = paged ? table.data?.dueCount || 0 : scopedRows.filter(row => row.billing_overdue_at && Number(row.billing_due_amount) > 0).length;
  const filteredRows = useMemo(() => paged ? rows : sortRows(filterRows(scopedRows,query,'all'),sort.key,sort.direction),[paged,rows,scopedRows,query,sort]);
  const tabRows = useMemo(() => filterRows(scopedRows, { ...query, status: '' }, 'all'), [scopedRows, query]);
  const statusCounts = useMemo(() => { if(paged)return new Map(table.data?.statusCounts || []); const counts = new Map<string, number>(); for (const row of tabRows) counts.set(row.status, (counts.get(row.status) || 0) + 1); return counts; }, [tabRows,paged,table.data]);
  const resultCount=paged ? table.data?.total || 0 : filteredRows.length;
  const scopeCount=paged ? table.data?.scopeCount || 0 : scopedRows.length;
  const tabCount=paged ? table.data?.tabCount || 0 : tabRows.length;
  const pageCount = paged ? table.data?.pages || 1 : Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = paged ? table.data?.page || 1 : Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  const columns = config.columns.filter(c => visibleKeys.includes(c.key));
  const statusOptions = [...config.statuses, ...Array.from(new Set(paged?table.data?.statuses || []:rows.map(row => row.status))).filter(status => status && !config.statuses.some(option => option.value === status)).map(value => ({ value, label: kind === 'contracts' ? optionLabel(config, 'status', value) : `Trạng thái ${value}` }))];
  const isFiltered = Boolean(query.search || query.status || query.startDate || query.endDate || query.overdueDays.trim() || selectedStore !== 'all' || Object.values(query.filters).some(Boolean));
  const canEdit = kind === 'customers' ? can('customers.write') : kind === 'stores' ? can('settings.write') : kind === 'vehicles' ? can('vehicles.write') : false;
  const canDelete = source === 'api' && can('settings.write') && (kind === 'customers' || kind === 'stores' || kind === 'vehicles');
  const invalidDate = Boolean(query.startDate && query.endDate && query.startDate > query.endDate);
  const canBulkDelete = source === 'api' && can('settings.write') && kind !== 'contracts';
  useEffect(() => {
    if(paged)return;
    setSelectedIds(current => {
      const present = new Set(rows.map(row => row.id));
      const next = new Set([...current].filter(id => present.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rows,paged]);
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
      if(paged)table.refresh();else await ensureData([kind], true).catch(() => {});
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
    if (customerId || contractId || searchFromUrl) router.replace(contractPath);
  }
  async function exportCsv() {
    if (!filteredRows.length) return;
    let exportRows=filteredRows;
    try {if(paged)exportRows=(await table.exportAll()).rows;} catch(cause){notify(cause instanceof Error?cause.message:'Không xuất được danh sách.');return;}
    const csv = [columns.map(column => csvCell(column.label)).join(','), ...exportRows.map(row => columns.map(column => csvCell(optionLabel(config, column.key, formatValue(row[column.key], column.format)))).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `himoto-${kind}-${source}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Đã xuất ${exportRows.length} bản ghi.`);
  }
  function view(row: ManagementRow) {
    setViewing(row);
  }
  function warmComposer() {
    if (loading || error) return;
    void loadComposer();
    void ensureData(CONTRACT_DATA_KINDS).catch(() => {});
  }

  return <section className={`mg-page mg-page-${kind}`} aria-label={config.title}>
    <div className="mg-page-content">
      <div className="mg-page-heading">{kind === 'contracts' ? <div><h1>{config.title}</h1></div> : <div><div className="mg-eyebrow">DANH MỤC QUẢN LÝ <span>/</span> {String(navigationNumber(kind)).padStart(2, '0')}</div><h1>{config.title}<span className="mg-title-count">{loading || error ? '—' : scopeCount}</span></h1><p>{config.description}</p></div>}
        <div className="mg-heading-actions">{kind !== 'contracts' && <ResponsiveDataActions>{canBulkDelete && <button type="button" className="mg-button mg-button-danger" disabled={loading || Boolean(error) || !selectedIds.size} onClick={() => { setBulkDeleteError(''); setBulkDeleteOpen(true); }}><Trash2 size={16} />Xóa đã chọn{selectedIds.size ? ` (${selectedIds.size})` : ''}</button>}<button type="button" className="mg-button" onClick={exportCsv} disabled={loading || Boolean(error) || !filteredRows.length}><ArrowDownToLine size={17} />Xuất CSV</button>
          {kind === 'customers' && can('settings.write') && <CustomerExcelActions disabled={loading || Boolean(error) || !dataset} />}
          {kind === 'vehicles' && can('settings.write') && <VehicleExcelActions disabled={loading || Boolean(error) || !dataset} />}
          </ResponsiveDataActions>}
          {kind === 'vehicles' && <><div className="mg-vehicle-flow-actions"><Link href="/vehicles/transfers" className="mg-button"><ArrowLeftRight size={16}/>Lịch sử luân chuyển</Link>
            {can('vehicles.transfer')&&<button type="button" className="mg-button" disabled={loading || Boolean(error)} onClick={()=>setVehicleAction({mode:'transfer',vehicle:null})}><ArrowLeftRight size={16}/>Chuyển xe</button>}</div>
            {can('vehicles.write')&&<button type="button" className="mg-button mg-mobile-status-action" disabled={loading || Boolean(error)} onClick={()=>setVehicleAction({mode:'status',vehicle:null})}><RefreshCw size={16}/>Đổi trạng thái xe</button>}</>}
          {kind === 'vehicles' && source === 'api' && can('vehicles.write') && <RowActionsMenu label="Hành động xe" triggerLabel={<>Hành động xe<ChevronDown size={16} /></>} disabled={loading || Boolean(error) || !dataset} actions={[
            { key: 'create', label: 'Nhập xe', icon: <Plus size={16} />, onSelect: () => { setEditing(null); setFormOpen(true); } },
            { key: 'transfer', label: 'Chuyển xe', icon: <ArrowLeftRight size={16} />, onSelect: () => setVehicleAction({ mode: 'transfer', vehicle: null }) },
            { key: 'status', label: 'Đổi trạng thái', icon: <RefreshCw size={16} />, onSelect: () => setVehicleAction({ mode: 'status', vehicle: null }) },
          ]} />}
          {(canEdit || kind === 'staff' && can('hr.write')) && <button type="button" className="mg-button mg-button-primary mg-page-add" disabled={loading || Boolean(error)} onClick={() => {
            if (kind === 'customers' && source === 'api') setCreateCustomerOpen(true);
            else if (kind === 'staff') setCreateStaffOpen(true);
            else { setEditing(null); setFormOpen(true); }
          }}><Plus size={18} />{config.addLabel}</button>}
          {(kind === 'stores' || kind === 'vehicles' || kind === 'customers') && <button type="button" className="mg-button" disabled={loading || refreshing || blacklistBusyId !== null} onClick={() => { setBlacklistError(''); void reload(); }}><RotateCcw size={17} className={refreshing ? 'mg-spin' : undefined} />{refreshing ? 'Đang tải…' : 'Làm mới'}</button>}
          {kind === 'contracts' && canSaveContractDrafts && <><button type="button" className="mg-button" disabled={loading || Boolean(error) || !dataset || !canSaveContractDrafts} onPointerEnter={warmComposer} onFocus={warmComposer} onClick={()=>{setPrintRow(null);setComposerMode('reservation');setComposerOpen(true);}}><Plus size={17}/>Nhận cọc giữ xe</button><button type="button" className="mg-button mg-button-primary" disabled={loading || Boolean(error) || !dataset} onPointerEnter={warmComposer} onFocus={warmComposer} onClick={() => { setPrintRow(null); setComposerMode('draft'); setComposerOpen(true); }}><Plus size={17} />Nhập hợp đồng</button></>}</div>
      </div>

      {kind === 'staff' && <StaffOrganizationChart />}

      <div className="mg-data-panel">
        <div className="mg-status-tabs" aria-label="Lọc theo trạng thái"><button type="button" className={!query.status ? 'is-active' : ''} aria-pressed={!query.status} onClick={() => updateQuery({ status: '' })}>{draftsOnly?'Tất cả bản nháp':'Tất cả'}<span>{tabCount}</span></button>
          {statusOptions.filter(option => (kind === 'contracts' && !overdueOnly && option.value === 'draft') || statusCounts.has(option.value) || query.status === option.value).map(option => <button type="button" key={option.value} className={query.status === option.value ? 'is-active' : ''} aria-pressed={query.status === option.value} onClick={() => updateQuery({ status: option.value })}>{option.label}<span>{statusCounts.get(option.value) || 0}</span></button>)}</div>
        <div className="mg-toolbar"><label className="mg-search"><Search size={17} /><span className="mg-sr-only">Tìm kiếm {config.title.toLowerCase()}</span><input type="search" placeholder={config.searchPlaceholder} value={query.search} onChange={event => updateQuery({ search: event.target.value })} />{query.search && <button type="button" aria-label="Xóa từ khóa" onClick={() => updateQuery({ search: '' })}><X size={15} /></button>}</label>
          <div className="mg-filter-controls mg-list-filters"><span className="mg-filter-icon"><ListFilter size={16} /></span>{config.filters.map(filter => <label className="mg-sr-label" key={filter.key}><span className="mg-sr-only">{filter.label}</span><select aria-label={filter.label} value={query.filters[filter.key] || ''} onChange={event => updateQuery({ filters: { ...query.filters, [filter.key]: event.target.value } })}><option value="">{filter.label}</option>{(kind === 'staff' && filter.key === 'position' ? staffPositionSuggestions(allRows.map(row => row.position)).map(label => ({ value: label, label })) : filter.storeOptions ? (dataset?.stores || EMPTY_ROWS).map(store => ({ value: String(store.id), label: store.name || `Cơ sở #${store.id}` })) : filter.options).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
            <label className="mg-sr-label"><span className="mg-sr-only">Lọc trạng thái</span><select aria-label="Lọc trạng thái" value={query.status} onChange={event => updateQuery({ status: event.target.value })}><option value="">Tất cả trạng thái</option>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <details className="mg-column-menu" ref={columnsRef}><summary className="mg-button" aria-label="Ẩn hiện cột"><Columns3 size={16} /><span>Cột</span></summary><div className="mg-popover"><strong>Hiển thị cột</strong>{config.columns.map(column => <label key={column.key}><input type="checkbox" checked={visibleKeys.includes(column.key)} disabled={visibleKeys.length === 1 && visibleKeys.includes(column.key)} onChange={event => setVisibleKeys(current => event.target.checked ? [...current, column.key] : current.filter(key => key !== column.key))} />{column.label}</label>)}</div></details>
          </div>
        </div>
        {(kind === 'vehicles' || overdueOnly) && <div className="mg-date-filters mg-overdue-filters"><span>Số ngày quá hạn</span>
          <label className="mg-overdue-compare"><span className="mg-sr-only">So sánh số ngày quá hạn</span>
            <select aria-label="So sánh số ngày quá hạn" value={query.overdueCompare || 'eq'} onChange={event => updateQuery({ overdueCompare: event.target.value as TableQuery['overdueCompare'] })}>
              {OVERDUE_COMPARE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="mg-overdue-days"><span className="mg-sr-only">Số ngày quá hạn</span>
            <input type="number" inputMode="numeric" min={0} step={1} placeholder="Số ngày" aria-label="Số ngày quá hạn" value={query.overdueDays}
              onChange={event => updateQuery({ overdueDays: event.target.value.replace(/[^\d]/g, '').slice(0, 5) })} /></label>
          {query.overdueDays.trim() && <span className="mg-active-filter">{OVERDUE_COMPARE_OPTIONS.find(option => option.value === (query.overdueCompare || 'eq'))?.label || 'Bằng'} {query.overdueDays} ngày
            <button type="button" aria-label="Bỏ lọc số ngày quá hạn" onClick={() => updateQuery({ overdueDays: '', overdueCompare: 'eq' })}><X size={13} /></button></span>}
        </div>}
        {kind === 'contracts' && <div className="mg-date-filters mg-date-range-inline"><span>Ngày bắt đầu thuê</span><label><span className="mg-sr-only">Từ ngày</span><input type="date" aria-label="Từ ngày" value={query.startDate} onChange={event => updateQuery({ startDate: event.target.value })} aria-invalid={invalidDate} /></label><span className="mg-date-divider">—</span><label><span className="mg-sr-only">Đến ngày</span><input type="date" aria-label="Đến ngày" value={query.endDate} onChange={event => updateQuery({ endDate: event.target.value })} aria-invalid={invalidDate} /></label>{invalidDate && <span className="mg-field-error" role="alert">Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</span>}
          {customerId && <span className="mg-active-filter">Khách hàng #{customerId}<button type="button" aria-label="Bỏ lọc khách hàng" onClick={() => router.replace(contractPath)}><X size={13} /></button></span>}{contractId && <span className="mg-active-filter">Hợp đồng #{contractId}<button type="button" aria-label="Bỏ lọc hợp đồng" onClick={() => router.replace(contractPath)}><X size={13} /></button></span>}</div>}
        {isFiltered && <div className="mg-filter-summary"><span><strong>{resultCount}</strong> kết quả phù hợp</span><button type="button" onClick={clearFilters}><RotateCcw size={13} />Xóa bộ lọc</button></div>}
        {kind==='contracts'&&query.search.trim()&&(draftsOnly?<div className="mg-billing-reminder"><p>Chỉ tìm trong hợp đồng nháp.</p><Link className="mg-button" href={`/contracts?search=${encodeURIComponent(query.search.trim())}`}>Tìm trong tất cả hợp đồng</Link></div>:!tableInput.scope&&<p className="mg-reminder-help">Kết quả ưu tiên hợp đồng đang thuê / quá hạn gần nhất để mở trả xe; các bản nháp và lịch sử vẫn ở bên dưới.</p>)}
        {kind === 'contracts' && !loading && !error && dueCount > 0 && <div className="mg-billing-reminder" role="status"><p><strong>{dueCount} hợp đồng thuê sở hữu đến hạn đóng tiền.</strong> Khoản chưa đóng đủ tiếp tục hiện để kế toán giục nợ.</p>{!paymentDueOnly && <button className="mg-button" type="button" onClick={() => router.push('/contracts/due')}>Xem khoản đến hạn</button>}</div>}
        {kind === 'contracts' && <ContractSummary values={paged?table.data?.summary:undefined} rows={filteredRows} customers={dataset?.customers || EMPTY_ROWS} loading={loading} unavailable={Boolean(error) || !dataset} />}
        {kind === 'customers' && blacklistError && <p className="mg-blacklist-error" role="alert">{blacklistError}</p>}
        <DataTable config={config} columns={columns} rows={paged ? filteredRows : filteredRows.slice(offset, offset + pageSize)} offset={offset} sortKey={sort.key} sortDirection={sort.direction}
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
          onPayment={kind === 'contracts' && source === 'api' && canPayContracts ? row => router.push(cashbookPaymentPath(row.id, 'debt')) : undefined}
          onQr={kind==='contracts'?row=>setQrTarget(row.id):undefined}
          onReminder={kind==='contracts'&&(can('contracts.draft')||canPayContracts)?row=>setReminderTarget(row.id):undefined}
          onHandover={can('contracts.finalize') && kind === 'contracts' && source === 'api' ? row=>setHandoverId(row.id) : undefined}
          onReturn={can('contracts.return') && kind === 'contracts' && source === 'api' ? row => setReturnTarget({ orderId: row.id, code: row.code }) : undefined}
          onRenew={can('contracts.renew') && kind === 'contracts' && source === 'api' ? row => setRenewTarget(row) : undefined}
          onVehicleChange={can('contracts.return') && kind === 'contracts' && source === 'api' ? row => setVehicleTarget({ orderId: row.id, code: row.code }) : undefined}
          onBatteryRent={can('contracts.draft') && kind === 'contracts' && source === 'api' ? row => setBatteryRentTarget(row) : undefined}
          onVehicleAction={kind === 'vehicles' && source === 'api' && (can('vehicles.transfer')||can('vehicles.receive')||can('vehicles.write')) ? (row, mode) => setVehicleAction({ mode, vehicle: row }) : undefined}

          canEditContract={false}
          canEditDraft={kind === 'contracts' && canSaveContractDrafts}
          canEdit={canEdit} loading={loading} error={error} isFiltered={isFiltered} onReset={clearFilters} onRetry={() => void reload()}
          selectedIds={canBulkDelete ? selectedIds : undefined} onSelectionChange={canBulkDelete ? changeSelection : undefined} />
        <div className="mg-pagination"><div className="mg-result-range" aria-live="polite">Hiển thị <strong>{resultCount ? offset + 1 : 0}–{Math.min(offset + pageSize, resultCount)}</strong> trong <strong>{resultCount}</strong> {config.singular}</div>
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
    {returnTarget !== null && kind === 'contracts' && <ContractRowReturnDialog contractId={returnTarget.orderId ?? undefined} contractCode={returnTarget.code} initialQuery={returnTarget.query} onClose={() => setReturnTarget(null)} />}
    {renewTarget && kind === 'contracts' && <ContractRenewalDialog orderId={renewTarget.id} contractCode={renewTarget.code} unitPrice={typeof renewTarget.unit_price === 'number' && renewTarget.unit_price > 0 ? renewTarget.unit_price : undefined} onClose={() => setRenewTarget(null)} />}
    {renewPicker && <Dialog title="Chọn hợp đồng gia hạn" onClose={()=>setRenewPicker(false)}><div className="mg-dialog-body"><label className="mg-field">Tìm hợp đồng cần gia hạn<input type="search" autoFocus value={renewSearch} placeholder="Mã hợp đồng, khách, SĐT hoặc biển số" onChange={event=>setRenewSearch(event.target.value)}/></label><ul className="mg-operation-picks">{(renewable.data?.rows || []).map(row=><li key={row.id}><button type="button" onClick={()=>{setRenewPicker(false);setRenewTarget(row);}}><strong>{row.code} · {row.customer_name}</strong><span>{row.license} · {row.customer_phone}</span></button></li>)}</ul></div><div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={()=>setRenewPicker(false)}>Đóng</button></div></Dialog>}
    {vehicleTarget && kind === 'contracts' && <ManagementDataBoundary kinds={VEHICLE_DATA_KINDS} title="Đổi xe" onClose={() => setVehicleTarget(null)}><ContractVehicleSwapDialog orderId={vehicleTarget.orderId} contractCode={vehicleTarget.code} onClose={() => setVehicleTarget(null)} /></ManagementDataBoundary>}
    {batteryRentTarget && kind === 'contracts' && dataset && <ManagementDataBoundary kinds={['staff'] as const} title="Thuê pin / sạc" onClose={() => setBatteryRentTarget(null)}>
      <BatteryContractForm key={`from-${batteryRentTarget.id}`} row={null} storeId={selectedStore}
        prefill={batteryPrefillFromVehicleContract(dataset, batteryRentTarget)}
        sourceLabel={batteryRentTarget.code}
        onClose={() => setBatteryRentTarget(null)}
        onRefresh={() => setBatteryRentTarget(null)}
        onSaved={(saved, print) => {
          const code = batteryRentTarget.code;
          setBatteryRentTarget(null);
          notify(`Đã lưu hợp đồng thuê pin ${saved.code} theo HĐ xe ${code}.`);
          if (print) setBatteryPrinting(saved);
        }} />
    </ManagementDataBoundary>}
    {batteryPrinting && <BatteryPrintPreview doc={batteryPrinting} onClose={() => setBatteryPrinting(null)} />}
    {viewing && kind === 'contracts' && <ContractDetail row={viewing} onClose={() => setViewing(null)} onReturn={() => { setReturnTarget({ orderId: viewing.id, code: viewing.code }); setViewing(null); }} onRenew={() => { setRenewTarget(viewing); setViewing(null); }} onVehicleChange={() => { setVehicleTarget({ orderId: viewing.id, code: viewing.code }); setViewing(null); }} onBatteryRent={() => { setBatteryRentTarget(viewing); setViewing(null); }} onPayment={canPayContracts ? (purpose?: PaymentPurpose) => { router.push(cashbookPaymentPath(viewing.id, purpose || 'debt')); setViewing(null); } : undefined} onPrint={() => { setPrintRow(viewing); setComposerMode('print'); setViewing(null); setComposerOpen(true); }}
      onQr={()=>{setQrTarget(viewing.id);setViewing(null);}}
      onReminder={can('contracts.draft')||canPayContracts?()=>{setReminderTarget(viewing.id);setViewing(null);}:undefined}
      onPrintVersion={version => { setPrintRow({ ...viewing, ...(version.end_date ? { end_date: version.end_date } : {}), ...(version.total_amount !== null ? { total_amount: version.total_amount } : {}), ...(version.paid_amount !== null ? { paid_amount: version.paid_amount } : {}) }); setComposerMode('print'); setViewing(null); setComposerOpen(true); }} />}
    {qrTarget!==null&&<ContractQrDialog id={qrTarget} onClose={()=>setQrTarget(null)}/>}
    {reminderTarget!==null&&<DebtReminderDialog orderId={reminderTarget} onClose={()=>setReminderTarget(null)}/>}
    {composerOpen && dataset && <ManagementDataBoundary kinds={CONTRACT_DATA_KINDS} title="Mở hợp đồng" onClose={() => setComposerOpen(false)}><ContractComposer key={`${composerMode}-${printRow?.id || 'new'}`} row={printRow} mode={composerMode} onClose={() => setComposerOpen(false)} onDraftSaved={() => { setQuery(EMPTY_QUERY); setPage(1); selectStore('all'); router.push('/contracts/drafts'); }}
      onFinalized={result => {
        notify(`${result.status === 'deposit_contract' ? 'Đã nhận cọc giữ xe, chờ giao xe' : 'Đã lưu chính thức hợp đồng'} ${result.code}${result.transaction_ids.length ? ` và ghi ${result.transaction_ids.length} phiếu thu vào Sổ quỹ` : ''}.`);
        invalidateData(['vehicles', 'customers']);
        if(paged)table.refresh();else void ensureData(['contracts'], true).catch(() => {});
        setQuery(EMPTY_QUERY); setPage(1); selectStore('all'); router.push(`/contracts?contract_id=${result.order_id}`);
      }} /></ManagementDataBoundary>}
    {viewing && kind === 'customers' && <CustomerDetail row={viewing} config={config} canEdit={canEdit} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }} />}
    {viewing && kind === 'stores' && <StoreDetail row={viewing} canEdit={canEdit} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }} />}
    {viewing && kind === 'vehicles' && <VehicleDetail row={viewing} config={config} canEdit={canEdit} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }}
      onAction={mode => { setVehicleAction({ mode, vehicle: viewing }); setViewing(null); }} />}
    {vehicleAction && <VehicleActionDialog mode={vehicleAction.mode} vehicle={vehicleAction.vehicle} onClose={() => setVehicleAction(null)} />}
    {handoverId && <ContractHandoverDialog id={handoverId} onClose={()=>setHandoverId(null)} onDone={context=>{setHandoverId(null);invalidateData(['contracts','vehicles']);notify(`Đã giao xe đơn ${context.code}. Tiền thuê trả trước được giữ nguyên.`);if (canPayContracts && context.remaining !== null && context.remaining > 0) router.push(cashbookPaymentPath(context.id, 'debt'));else void ensureData(['contracts','vehicles'],true).catch(()=>{});}} />}
    {viewing && kind !== 'contracts' && kind !== 'customers' && kind !== 'stores' && kind !== 'vehicles' && <Dialog title={String(viewing.name)} subtitle={`${viewing.code} · ${config.title}`} onClose={() => setViewing(null)}>
      <div className="mg-dialog-body"><span className={`mg-status mg-status-${statusTone(viewing.status)}`}><span />{optionLabel(config, 'status', viewing.status)}</span>
        <dl className="mg-detail-grid">{config.columns.filter(column => column.key !== 'name' && column.key !== 'status').map(column => <div key={column.key}><dt>{column.label}</dt><dd>{optionLabel(config, column.key, formatValue(viewing[column.key], column.format))}</dd></div>)}
          {config.fields.filter(field => !config.columns.some(column => column.key === field.key) && field.key !== 'store_id').map(field => <div key={field.key}><dt>{field.label}</dt><dd>{viewing[field.key] || '—'}</dd></div>)}</dl></div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={() => setViewing(null)}>Đóng</button>{canEdit && <button type="button" className="mg-button mg-button-primary" onClick={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }}>Chỉnh sửa thông tin</button>}</div>
    </Dialog>}
  </section>;
}

const navigationNumber = (kind: ManagementKind) => ['staff', 'customers', 'contracts', 'stores', 'vehicles'].indexOf(kind) + 1;
export function ManagementPage({ kind, draftsOnly = false, vatOnly = false, overdueOnly = false, ownershipOnly = false, paymentDueOnly = false }: { kind: ManagementKind; draftsOnly?: boolean; vatOnly?: boolean; overdueOnly?: boolean; ownershipOnly?: boolean; paymentDueOnly?: boolean }) {
  return <Suspense fallback={<div className="mg-table-state" role="status">Đang chuẩn bị danh sách…</div>}><ManagementContent key={`${kind}-${draftsOnly}-${vatOnly}-${overdueOnly}-${ownershipOnly}-${paymentDueOnly}`} kind={kind} draftsOnly={draftsOnly} vatOnly={vatOnly} overdueOnly={overdueOnly} ownershipOnly={ownershipOnly} paymentDueOnly={paymentDueOnly} /></Suspense>;
}

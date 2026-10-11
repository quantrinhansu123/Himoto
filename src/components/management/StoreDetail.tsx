'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, FileSearch, LoaderCircle, RotateCcw, Search, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { Cell } from './DataTable';
import { useManagement } from './ManagementProvider';
import { CashbookAccounts } from './CashbookAccounts';
import { CashbookTable } from './CashbookTable';
import { ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { MANAGEMENT_CONFIG, optionLabel, statusTone } from '@/lib/management/config';
import { EMPTY_QUERY, filterRows, formatValue } from '@/lib/management/table-utils';
import { CashbookFilters, CashbookRow, EMPTY_CASHBOOK_FILTERS, filterCashbookRows } from '@/lib/management/cashbook';
import { CashbookAccount, createApiCashbookRepository, loadCashbookAccounts } from '@/lib/management/cashbook-repository';
import { ManagementRow } from '@/lib/management/types';
import { formatMoney } from '@/lib/formatters';

const SECTIONS = [
  { id: 'details', label: 'Chi tiết' },
  { id: 'staff', label: 'Nhân sự' },
  { id: 'vehicles', label: 'Xe' },
  { id: 'customers', label: 'Khách hàng' },
  { id: 'contracts', label: 'Hợp đồng' },
  { id: 'cashbook', label: 'Sổ két' },
] as const;
type StoreSection = (typeof SECTIONS)[number]['id'];
type ListSection = 'staff' | 'vehicles' | 'customers' | 'contracts';
const LIST_SECTIONS: readonly ListSection[] = ['staff', 'vehicles', 'customers', 'contracts'];
const LIST_PATHS: Record<ListSection | 'cashbook', string> = { staff: '/staff', vehicles: '/vehicles', customers: '/customers', contracts: '/contracts', cashbook: '/cashbook' };
const CASHBOOK_SECTIONS = [{ id: 'accounts', label: 'TK' }, { id: 'vouchers', label: 'Thu chi' }] as const;
type CashbookSection = (typeof CASHBOOK_SECTIONS)[number]['id'];
const EMPTY_ROWS: ManagementRow[] = [];
const amount = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? 0 : Number(value);

function StoreRelatedList({ kind, storeId, onOpenList, onClose }: { kind: ListSection; storeId: number; onOpenList: () => void; onClose: () => void }) {
  const { dataset, resources, ensureData } = useManagement();
  const config = MANAGEMENT_CONFIG[kind];
  const resource = resources[kind];
  const loading = !resource.loaded && !resource.error;
  const [search, setSearch] = useState('');
  useEffect(() => { void ensureData([kind]).catch(() => {}); }, [ensureData, kind]);
  const allRows = dataset?.[kind] || EMPTY_ROWS;
  const rows = useMemo(() => allRows.filter(row => Number(row.store_id) === storeId && (kind !== 'contracts' || row.status !== 'draft')), [allRows, kind, storeId]);
  const visible = useMemo(() => filterRows(rows, { ...EMPTY_QUERY, search }, 'all'), [rows, search]);
  const columns = config.columns.filter(column => !column.hidden && column.key !== 'store_name');
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.status, (counts.get(row.status) || 0) + 1);
    return [...counts];
  }, [rows]);
  const contractTotal = kind === 'contracts' ? rows.reduce((sum, row) => sum + amount(row.total_amount), 0) : 0;
  const contractPaid = kind === 'contracts' ? rows.reduce((sum, row) => sum + amount(row.paid_amount), 0) : 0;
  const contractDebt = kind === 'contracts' ? rows.reduce((sum, row) => sum + Math.max(amount(row.total_amount) - amount(row.paid_amount), 0), 0) : 0;

  return <>
    <div className="mg-contract-history-toolbar">
      <p>{loading || resource.error ? `${config.title} của cơ sở đang xem.` : <><strong>{rows.length}</strong> {config.singular}{statusCounts.length > 0 && ' · '}{statusCounts.map(([status, count]) => `${optionLabel(config, 'status', status)} ${count}`).join(' · ')}</>}</p>
      <div><button type="button" className="mg-button" disabled={resource.loading} onClick={() => void ensureData([kind], true).catch(() => {})}>
        {resource.loading ? <LoaderCircle size={15} className="mg-spin" /> : <RotateCcw size={15} />}Làm mới</button></div>
    </div>
    {kind === 'contracts' && !loading && !resource.error && <dl className="mg-payment-totals"><div><dt>Số hợp đồng</dt><dd>{rows.length}</dd></div><div><dt>Tổng tiền hợp đồng / Đã thu</dt><dd>{formatMoney(contractTotal)} / {formatMoney(contractPaid)}</dd></div><div><dt>Còn nợ</dt><dd>{formatMoney(contractDebt)}</dd></div></dl>}
    <label className="mg-search mg-store-detail-search"><Search size={17} /><span className="mg-sr-only">Tìm {config.title.toLowerCase()} của cơ sở</span>
      <input type="search" placeholder={config.searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)} />
      {search && <button type="button" aria-label="Xóa từ khóa" onClick={() => setSearch('')}><X size={15} /></button>}</label>
    <div className="mg-table-scroll mg-store-detail-table" tabIndex={0} role="region" aria-label={`Bảng ${config.title.toLowerCase()} của cơ sở`}>
      <table className={`mg-table mg-table-${kind}`} aria-busy={loading}><caption className="mg-sr-only">{config.title} của cơ sở</caption>
        <thead><tr><th scope="col" className="mg-index">STT</th>{columns.map(column => <th key={column.key} scope="col" className={column.align === 'right' ? 'mg-align-right' : ''}>{column.label}</th>)}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={columns.length + 1}><div className="mg-table-state" role="status"><LoaderCircle size={25} className="mg-spin" /><strong>Đang tải {config.title.toLowerCase()}…</strong></div></td></tr>
          : resource.error ? <tr><td colSpan={columns.length + 1}><div className="mg-table-state mg-table-error" role="alert"><FileSearch size={28} /><strong>Không tải được {config.title.toLowerCase()}</strong><p>{resource.error}</p><button type="button" className="mg-button" onClick={() => void ensureData([kind], true).catch(() => {})}><RotateCcw size={15} />Thử lại</button></div></td></tr>
          : !visible.length ? <tr><td colSpan={columns.length + 1}><div className="mg-table-state"><FileSearch size={28} /><strong>{search ? 'Không tìm thấy kết quả' : `Cơ sở chưa có ${config.singular}`}</strong></div></td></tr>
          : visible.map((row, index) => <tr key={row.id}><td className="mg-index">{index + 1}</td>{columns.map(column => <td key={column.key} className={column.align === 'right' ? 'mg-align-right' : ''}>
            {kind === 'contracts' && column.key === 'code' ? <Link className="mg-cashbook-contract-link" href={`/contracts?contract_id=${row.id}`} onClick={onClose}>{row.code || '—'}</Link> : <Cell row={row} column={column} config={config} />}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <button type="button" className="mg-button mg-related-link" onClick={onOpenList}>Mở {config.title.toLowerCase()} của cơ sở <ChevronRight size={15} /></button>
  </>;
}

function StoreCashbook({ storeId, onOpenCashbook }: { storeId: number; onOpenCashbook: () => void }) {
  const [section, setSection] = useState<CashbookSection>('accounts');
  const repository = useMemo(() => createApiCashbookRepository('/api'), []);
  const [accounts, setAccounts] = useState<CashbookAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState('');
  const [accountsRetry, setAccountsRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setAccountsLoading(true); setAccountsError('');
    void loadCashbookAccounts('/api', controller.signal).then(rows => { if (current) setAccounts(rows); }).catch(cause => {
      if (current) setAccountsError(cause instanceof Error ? cause.message : 'Không tải được danh sách tài khoản.');
    }).finally(() => { if (current) setAccountsLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [accountsRetry]);
  const storeAccounts = useMemo(() => accounts.filter(account => account.store_id === String(storeId)), [accounts, storeId]);

  const [records, setRecords] = useState<CashbookRow[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState('');
  const [recordsRetry, setRecordsRetry] = useState(0);
  const loadedRetry = useRef(-1);
  useEffect(() => {
    if (section !== 'vouchers' || loadedRetry.current === recordsRetry) return;
    const controller = new AbortController(); let current = true;
    setRecordsLoading(true); setRecordsError('');
    void repository.load(controller.signal).then(rows => { if (current) { setRecords(rows); loadedRetry.current = recordsRetry; } }).catch(cause => {
      if (current) setRecordsError(cause instanceof Error ? cause.message : 'Không tải được phiếu thu chi.');
    }).finally(() => { if (current) setRecordsLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [section, repository, recordsRetry]);
  const [query, setQuery] = useState<CashbookFilters>(EMPTY_CASHBOOK_FILTERS);
  const update = (next: Partial<CashbookFilters>) => setQuery(current => ({ ...current, ...next }));
  const invalidDate = Boolean(query.startDate && query.endDate && query.startDate > query.endDate);
  const isFiltered = Boolean(query.search || query.startDate || query.endDate);
  const filtered = useMemo(() => filterCashbookRows(records, query, String(storeId)), [records, query, storeId]);
  const income = useMemo(() => filtered.filter(row => row.type === 'income'), [filtered]);
  const expense = useMemo(() => filtered.filter(row => row.type === 'expense'), [filtered]);
  const incomeTotal = income.reduce((sum, row) => sum + (row.amount || 0), 0);
  const expenseTotal = expense.reduce((sum, row) => sum + (row.amount || 0), 0);

  return <>
    <ContractSectionTabs prefix="store-cashbook" label="Sổ két" sections={CASHBOOK_SECTIONS} active={section} onChange={setSection} />
    <section id="store-cashbook-panel-accounts" role="tabpanel" aria-labelledby="store-cashbook-tab-accounts" hidden={section !== 'accounts'}>
      <CashbookAccounts accounts={storeAccounts} loading={accountsLoading} error={accountsError} onRetry={() => setAccountsRetry(value => value + 1)} />
    </section>
    <section id="store-cashbook-panel-vouchers" role="tabpanel" aria-labelledby="store-cashbook-tab-vouchers" hidden={section !== 'vouchers'} className="mg-store-cashbook-vouchers">
      <div className="mg-contract-history-toolbar"><label className="mg-search mg-store-detail-search"><Search size={17} /><span className="mg-sr-only">Tìm phiếu thu chi của cơ sở</span>
        <input type="search" placeholder="Tìm ID, người thực hiện, lý do, nội dung…" value={query.search} onChange={event => update({ search: event.target.value })} />
        {query.search && <button type="button" aria-label="Xóa từ khóa" onClick={() => update({ search: '' })}><X size={15} /></button>}</label>
        <div><button type="button" className="mg-button" disabled={recordsLoading} onClick={() => setRecordsRetry(value => value + 1)}>{recordsLoading ? <LoaderCircle size={15} className="mg-spin" /> : <RotateCcw size={15} />}Tải lại</button></div></div>
      <div className="mg-date-filters"><span>Ngày phát sinh</span><label htmlFor="store-cashbook-start">Từ ngày <input id="store-cashbook-start" type="date" value={query.startDate} aria-invalid={invalidDate} onChange={event => update({ startDate: event.target.value })} /></label>
        <label htmlFor="store-cashbook-end">Đến ngày <input id="store-cashbook-end" type="date" value={query.endDate} aria-invalid={invalidDate} onChange={event => update({ endDate: event.target.value })} /></label>
        {invalidDate && <span className="mg-field-error" role="alert">Đến ngày phải bằng hoặc sau Từ ngày.</span>}{isFiltered && <button type="button" className="mg-button" onClick={() => setQuery(EMPTY_CASHBOOK_FILTERS)}><RotateCcw size={14} />Xóa bộ lọc</button>}</div>
      {!recordsLoading && !recordsError && <dl className="mg-payment-totals"><div><dt>Tổng thu ({income.length} phiếu)</dt><dd>{formatMoney(incomeTotal)}</dd></div><div><dt>Tổng chi ({expense.length} phiếu)</dt><dd>{formatMoney(expenseTotal)}</dd></div><div><dt>Chênh lệch</dt><dd>{formatMoney(incomeTotal - expenseTotal)}</dd></div></dl>}
      <div className="mg-cashbook-tables">
        <CashbookTable type="income" rows={income} loading={recordsLoading} error={recordsError} filtered={isFiltered} onReset={() => setQuery(EMPTY_CASHBOOK_FILTERS)} onRetry={() => setRecordsRetry(value => value + 1)} />
        <CashbookTable type="expense" rows={expense} loading={recordsLoading} error={recordsError} filtered={isFiltered} onReset={() => setQuery(EMPTY_CASHBOOK_FILTERS)} onRetry={() => setRecordsRetry(value => value + 1)} />
      </div>
    </section>
    <button type="button" className="mg-button mg-related-link" onClick={onOpenCashbook}>Mở Sổ quỹ / Sổ két của cơ sở <ChevronRight size={15} /></button>
  </>;
}

export function StoreDetail({ row, canEdit, onEdit, onClose }: { row: ManagementRow; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const config = MANAGEMENT_CONFIG.stores;
  const { selectStore } = useManagement();
  const router = useRouter();
  const [section, setSection] = useState<StoreSection>('details');
  function openList(target: ListSection | 'cashbook') {
    selectStore(String(row.id)); onClose(); router.push(LIST_PATHS[target]);
  }
  function panel(id: StoreSection, children: ReactNode) {
    return <section key={id} id={`store-detail-panel-${id}`} role="tabpanel" aria-labelledby={`store-detail-tab-${id}`} hidden={section !== id} className="mg-contract-panel">{children}</section>;
  }

  return <Dialog title={String(row.name)} subtitle={`${row.code} · ${config.title}`} className="mg-store-detail" onClose={onClose}>
    <div className="mg-dialog-body">
      <ContractSectionTabs prefix="store-detail" label={config.title} sections={SECTIONS} active={section} onChange={setSection} />
      {panel('details', <>
        <span className={`mg-status mg-status-${statusTone(row.status)}`}><span />{optionLabel(config, 'status', row.status)}</span>
        <dl className="mg-detail-grid">{config.columns.filter(column => column.key !== 'name' && column.key !== 'status').map(column => <div key={column.key}><dt>{column.label}</dt><dd>{optionLabel(config, column.key, formatValue(row[column.key], column.format))}</dd></div>)}
          {config.fields.filter(field => !config.columns.some(column => column.key === field.key)).map(field => <div key={field.key}><dt>{field.label}</dt><dd>{row[field.key] || '—'}</dd></div>)}</dl>
      </>)}
      {LIST_SECTIONS.map(kind => panel(kind, section === kind && <StoreRelatedList kind={kind} storeId={row.id} onOpenList={() => openList(kind)} onClose={onClose} />))}
      {panel('cashbook', section === 'cashbook' && <StoreCashbook storeId={row.id} onOpenCashbook={() => openList('cashbook')} />)}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>{canEdit && <button type="button" className="mg-button mg-button-primary" onClick={onEdit}>Chỉnh sửa thông tin</button>}</div>
  </Dialog>;
}

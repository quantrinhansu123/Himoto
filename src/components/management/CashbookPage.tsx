'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { bulkDelete } from '@/lib/management/bulk-delete';
import { Dialog } from './Dialog';
import { CashbookRow, EMPTY_CASHBOOK_FILTERS, CashbookFilters, cashbookCsv, VoucherType } from '@/lib/management/cashbook';
import { CashbookAccount, CashbookListResult, CashbookPagination, DEFAULT_CASHBOOK_PAGINATION, loadCashbookAccounts, loadCashbookDeleteIds, loadCashbookExport, loadCashbookPage } from '@/lib/management/cashbook-repository';
import { useManagement } from './ManagementProvider';
import { CashbookAccounts } from './CashbookAccounts';
import { CashbookTable } from './CashbookTable';
import { ContractPaymentDialog } from './ContractPaymentDialog';
import type { PaymentPurpose } from '@/lib/management/contract-payments';

export function CashbookPage() {
  const { source, selectedStore, selectStore, notify } = useManagement();
  const [result, setResult] = useState<CashbookListResult | null>(null);
  const [incomePagination, setIncomePagination] = useState<CashbookPagination>(DEFAULT_CASHBOOK_PAGINATION);
  const [expensePagination, setExpensePagination] = useState<CashbookPagination>(DEFAULT_CASHBOOK_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoaded = useRef(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState<CashbookFilters>(EMPTY_CASHBOOK_FILTERS);
  const invalidDate = Boolean(query.startDate && query.endDate && query.startDate > query.endDate);
  const [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearch(query.search), 250); return () => clearTimeout(timer); }, [query.search]);
  const requestQuery = useMemo(() => ({ search, actor: query.actor, startDate: query.startDate, endDate: query.endDate }), [search, query.actor, query.startDate, query.endDate]);
  const [paymentTarget, setPaymentTarget] = useState<{ id: number; purpose: PaymentPurpose } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawId = params.get('contract_id'), purpose = params.get('purpose');
    if (!rawId || !/^\d+$/.test(rawId)) return;
    setPaymentTarget({ id: Number(rawId), purpose: purpose === 'renewal' || purpose === 'extra' ? purpose : 'debt' });
  }, []);
  function closePayment() {
    setPaymentTarget(null);
    window.history.replaceState({}, '', '/cashbook');
  }
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setLoading(!hasLoaded.current); setRefreshing(hasLoaded.current); setError('');
    if (query.search !== search) return;
    if (requestQuery.startDate && requestQuery.endDate && requestQuery.startDate > requestQuery.endDate) { setLoading(false); setRefreshing(false); return; }
    void loadCashbookPage(requestQuery, selectedStore, incomePagination, expensePagination, controller.signal).then(data => { if (current) { setResult(data); hasLoaded.current = true; } }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : 'Không tải được sổ quỹ. Vui lòng thử lại.');
    }).finally(() => { if (current) { setLoading(false); setRefreshing(false); } });
    return () => { current = false; controller.abort(); };
  }, [requestQuery, query.search, search, selectedStore, incomePagination, expensePagination, retry]);
  const [accounts, setAccounts] = useState<CashbookAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setAccountsLoading(true); setAccountsError('');
    void loadCashbookAccounts('/api', controller.signal).then(rows => { if (current) setAccounts(rows); }).catch(cause => {
      if (current) setAccountsError(cause instanceof Error ? cause.message : 'Không tải được danh sách tài khoản.');
    }).finally(() => { if (current) setAccountsLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [retry]);
  const storeAccounts = useMemo(() => selectedStore === 'all' ? accounts : accounts.filter(account => account.store_id === selectedStore || (account.owner_type === 'company' && (!account.store_id || account.store_id === '0'))), [accounts, selectedStore]);
  useEffect(() => {
    setQuery(current => current.actor ? { ...current, actor: '' } : current);
    setIncomePagination(current => current.page === 1 ? current : { ...current, page: 1 }); setExpensePagination(current => current.page === 1 ? current : { ...current, page: 1 });
  }, [selectedStore]);
  const income = invalidDate ? [] : result?.income.rows || [], expense = invalidDate ? [] : result?.expense.rows || [];
  const incomeCount = invalidDate ? 0 : result?.income.total || 0, expenseCount = invalidDate ? 0 : result?.expense.total || 0;
  const actors = result?.actors || [];
  const records = [...income, ...expense];
  const pending = loading || refreshing || query.search !== search;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedRecords, setSelectedRecords] = useState<Map<string, CashbookRow>>(() => new Map());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  function changeSelection(ids: string[], selected: boolean) {
    setSelectedIds(current => { const next = new Set(current); for (const id of ids) if (selected) next.add(id); else next.delete(id); return next; });
    setSelectedRecords(current => {
      const next = new Map(current);
      for (const id of ids) { const row = records.find(record => record.id === id); if (selected && row) next.set(id, row); else next.delete(id); }
      return next;
    });
  }
  const selectedRows = [...selectedRecords.values()];
  async function deleteSelected() {
    if (deleteBusy || !selectedIds.size) return;
    setDeleteBusy(true); setDeleteError('');
    try {
      const deleted = await bulkDelete('transactions', [...selectedIds].map(Number));
      setSelectedIds(new Set()); setSelectedRecords(new Map()); setDeleteOpen(false);
      notify(`Đã xóa ${deleted.length} phiếu.`);
      setRetry(value => value + 1);
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Không xóa được phiếu.'); }
    finally { setDeleteBusy(false); }
  }
  const [deleteAllRequest, setDeleteAllRequest] = useState<{ type: VoucherType; filters: CashbookFilters; storeId: string } | null>(null);
  const deleteAllType = deleteAllRequest?.type;
  const [deleteAllRows, setDeleteAllRows] = useState<{ id: string; amount: number }[]>([]);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deleteAllText, setDeleteAllText] = useState('');
  const [deleteAllProgress, setDeleteAllProgress] = useState(0);
  useEffect(() => {
    if (!deleteAllRequest) return;
    const controller = new AbortController(); let current = true;
    setDeleteAllLoading(true); setDeleteAllRows([]);
    void loadCashbookDeleteIds(deleteAllRequest.filters, deleteAllRequest.storeId, deleteAllRequest.type, controller.signal).then(rows => { if (current) setDeleteAllRows(rows); }).catch(cause => {
      if (current) setDeleteError(cause instanceof Error ? cause.message : 'Không tải được danh sách phiếu cần xóa.');
    }).finally(() => { if (current) setDeleteAllLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [deleteAllRequest]);
  const deleteAllLabel = deleteAllType === 'expense' ? 'phiếu chi' : 'phiếu thu';
  function openDeleteAll(type: VoucherType) { setDeleteError(''); setDeleteAllText(''); setDeleteAllRows([]); setDeleteAllLoading(true); setDeleteAllRequest({ type, filters: { ...query }, storeId: selectedStore }); }
  async function deleteAll() {
    if (deleteBusy || deleteAllLoading || !deleteAllRows.length || deleteAllText.trim().toUpperCase() !== 'XOA') return;
    setDeleteBusy(true); setDeleteError('');
    const ids = deleteAllRows.map(row => Number(row.id));
    let done = 0;
    try {
      for (let index = 0; index < ids.length; index += 500) {
        done += (await bulkDelete('transactions', ids.slice(index, index + 500))).length;
        setDeleteAllProgress(done);
      }
      setSelectedIds(new Set()); setSelectedRecords(new Map()); setDeleteAllRequest(null);
      notify(`Đã xóa ${done} ${deleteAllLabel}.`);
    } catch (cause) {
      setDeleteError(`${done ? `Đã xóa ${done}/${ids.length}. ` : ''}${cause instanceof Error ? cause.message : 'Không xóa được phiếu.'}`);
    } finally {
      setDeleteBusy(false); setDeleteAllProgress(0);
      if (done) setRetry(value => value + 1);
    }
  }
  const isFiltered = Boolean(query.search || query.actor || query.startDate || query.endDate || selectedStore !== 'all');
  const update = (next: Partial<CashbookFilters>) => {
    setQuery(current => ({ ...current, ...next }));
    setIncomePagination(current => current.page === 1 ? current : { ...current, page: 1 }); setExpensePagination(current => current.page === 1 ? current : { ...current, page: 1 });
  };
  const reset = () => { update(EMPTY_CASHBOOK_FILTERS); selectStore('all'); };
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    if (pending || exporting || error || invalidDate || !(incomeCount + expenseCount)) return;
    setExporting(true);
    try {
      const rows = await loadCashbookExport(query, selectedStore);
      const url = URL.createObjectURL(new Blob(['\uFEFF', cashbookCsv(rows)], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a'); link.href = url; link.download = `himoto-so-quy-${source}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`Đã xuất ${rows.length} phiếu.`);
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Không xuất được sổ quỹ.'); }
    finally { setExporting(false); }
  }
  return <section className="mg-page mg-cashbook-page" aria-label="Sổ quỹ / Sổ két"><div className="mg-page-content">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">QUẢN LÝ THU — CHI <span>/</span> 06</div><h1>Sổ quỹ / Sổ két<span className="mg-title-count">{pending || error ? '—' : (result?.total || 0)}</span></h1><p>Tra cứu phiếu thu và phiếu chi theo cùng một cấu trúc dữ liệu.</p></div>
      <div className="mg-heading-actions"><button type="button" className="mg-button mg-button-danger" disabled={pending || Boolean(error) || !selectedIds.size} onClick={() => { setDeleteError(''); setDeleteOpen(true); }}><Trash2 size={16} />Xóa phiếu đã chọn{selectedIds.size ? ` (${selectedIds.size})` : ''}</button><button type="button" className="mg-button" disabled={pending} onClick={() => setRetry(value => value + 1)}><RotateCcw size={16} className={refreshing ? 'mg-spin' : undefined} />{refreshing ? 'Đang tải…' : 'Tải lại'}</button><button type="button" className="mg-button mg-button-primary" disabled={pending || Boolean(error) || invalidDate || !(incomeCount + expenseCount) || exporting} onClick={() => void exportCsv()}><ArrowDownToLine size={17} />{exporting ? 'Đang xuất…' : 'Xuất CSV'}</button></div></div>
    <div className="mg-data-panel mg-cashbook-filters"><div className="mg-toolbar"><label className="mg-search" htmlFor="cashbook-search"><Search size={17} /><span className="mg-sr-only">Tìm trên cả hai bảng</span><input id="cashbook-search" type="search" placeholder="Tìm ID, người thực hiện, lý do, nội dung…" value={query.search} onChange={event => update({ search: event.target.value })} />{query.search && <button type="button" aria-label="Xóa từ khóa" onClick={() => update({ search: '' })}><X size={15} /></button>}</label>
      <div className="mg-filter-controls"><label htmlFor="cashbook-actor" className="mg-cashbook-select-label">Người thực hiện<select id="cashbook-actor" value={query.actor} disabled={pending || Boolean(error)} onChange={event => update({ actor: event.target.value })}><option value="">Tất cả người thực hiện</option>{actors.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
      <div className="mg-date-filters"><span>Ngày phát sinh</span><label htmlFor="cashbook-start">Từ ngày <input id="cashbook-start" type="date" value={query.startDate} aria-invalid={invalidDate} aria-describedby={invalidDate ? 'cashbook-date-error' : undefined} onChange={event => update({ startDate: event.target.value })} /></label>
        <label htmlFor="cashbook-end">Đến ngày <input id="cashbook-end" type="date" value={query.endDate} aria-invalid={invalidDate} aria-describedby={invalidDate ? 'cashbook-date-error' : undefined} onChange={event => update({ endDate: event.target.value })} /></label>
        {invalidDate && <span id="cashbook-date-error" className="mg-field-error" role="alert">Đến ngày phải bằng hoặc sau Từ ngày.</span>}{isFiltered && <button type="button" className="mg-button" onClick={reset}><RotateCcw size={14} />Xóa bộ lọc</button>}</div>
    </div>
    <div className="mg-cashbook-overview" aria-label="Số phiếu theo bộ lọc"><a href="#cashbook-income"><span className="mg-cashbook-count-marker is-income" /><span>Phiếu thu</span><strong>{pending || error ? '—' : incomeCount}</strong><span className="mg-cashbook-jump">Xem danh sách ↓</span></a>
      <a href="#cashbook-expense"><span className="mg-cashbook-count-marker is-expense" /><span>Phiếu chi</span><strong>{pending || error ? '—' : expenseCount}</strong><span className="mg-cashbook-jump">Xem danh sách ↓</span></a></div>
    <CashbookAccounts accounts={storeAccounts} loading={accountsLoading} error={accountsError} onRetry={() => setRetry(value => value + 1)} />
    <div className="mg-cashbook-tables"><CashbookTable type="income" rows={income} total={incomeCount} pagination={{ ...incomePagination, page: result?.income.page || incomePagination.page }} onPaginationChange={setIncomePagination} loading={pending} error={error} filtered={isFiltered} onReset={reset} onRetry={() => setRetry(value => value + 1)} selectedIds={selectedIds} onSelectionChange={changeSelection} onDeleteAll={() => openDeleteAll('income')} />
      <CashbookTable type="expense" rows={expense} total={expenseCount} pagination={{ ...expensePagination, page: result?.expense.page || expensePagination.page }} onPaginationChange={setExpensePagination} loading={pending} error={error} filtered={isFiltered} onReset={reset} onRetry={() => setRetry(value => value + 1)} selectedIds={selectedIds} onSelectionChange={changeSelection} onDeleteAll={() => openDeleteAll('expense')} /></div>
    <div className="mg-list-note"><span className="mg-note-line" />Sổ quỹ đọc từ danh sách giao dịch hiện có. Trường chưa có dữ liệu hiển thị “—”.</div>
  </div>{deleteOpen && <Dialog title={`Xóa ${selectedIds.size} phiếu?`} subtitle={selectedRows.slice(0, 6).map(row => `#${row.id}`).join(', ') + (selectedRows.length > 6 ? '…' : '')} onClose={() => { if (!deleteBusy) setDeleteOpen(false); }}>
      <div className="mg-dialog-body"><p>Phiếu sẽ bị xóa hẳn khỏi Sổ quỹ và số dư tài khoản được tính lại. Phiếu thu gắn hợp đồng sẽ được trừ khỏi số tiền đã thu của hợp đồng đó (phiếu gia hạn / thu thêm còn trừ khỏi tổng tiền hợp đồng). Ngày hẹn trả đã gia hạn không tự lùi lại. Không thể hoàn tác.</p>
        <p><strong>{selectedRows.filter(row => row.type === 'income').length}</strong> phiếu thu · <strong>{selectedRows.filter(row => row.type === 'expense').length}</strong> phiếu chi · tổng <strong>{new Intl.NumberFormat('vi-VN').format(selectedRows.reduce((sum, row) => sum + (row.amount || 0), 0))} ₫</strong></p>
        {deleteError && <p className="mg-error-message" role="alert">{deleteError}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>Hủy</button><button type="button" className="mg-button mg-button-danger" disabled={deleteBusy} onClick={() => void deleteSelected()}>{deleteBusy ? 'Đang xóa…' : <><Trash2 size={16} />Xóa {selectedIds.size} phiếu</>}</button></div>
    </Dialog>}{deleteAllType && <Dialog title={`Xóa hết ${deleteAllRows.length} ${deleteAllLabel}?`} subtitle={isFiltered ? 'Theo cơ sở / bộ lọc đang chọn' : 'Toàn bộ sổ quỹ'} onClose={() => { if (!deleteBusy) setDeleteAllRequest(null); }}>
      <form onSubmit={event => { event.preventDefault(); void deleteAll(); }}>
        <div className="mg-dialog-body">{deleteAllLoading ? <p role="status">Đang lấy đầy đủ phiếu theo bộ lọc…</p> : <p>Tất cả <strong>{deleteAllRows.length} {deleteAllLabel}</strong> khớp bộ lọc{isFiltered ? ' đang chọn' : ''} sẽ bị xóa hẳn, tổng <strong>{new Intl.NumberFormat('vi-VN').format(deleteAllRows.reduce((sum, row) => sum + (row.amount || 0), 0))} ₫</strong>. Số dư tài khoản được tính lại; phiếu thu gắn hợp đồng được trừ khỏi số tiền đã thu của hợp đồng. Không thể hoàn tác.</p>}
          <div className="mg-field"><label htmlFor="cashbook-delete-all-confirm">Gõ <strong>XOA</strong> để xác nhận</label><input id="cashbook-delete-all-confirm" value={deleteAllText} autoComplete="off" disabled={deleteBusy} onChange={event => setDeleteAllText(event.target.value)} /></div>
          {deleteBusy && <p role="status">Đang xóa… {deleteAllProgress}/{deleteAllRows.length}</p>}
          {deleteError && <p className="mg-error-message" role="alert">{deleteError}</p>}</div>
        <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={deleteBusy} onClick={() => setDeleteAllRequest(null)}>Hủy</button><button type="submit" className="mg-button mg-button-danger" disabled={deleteBusy || deleteAllLoading || !deleteAllRows.length || deleteAllText.trim().toUpperCase() !== 'XOA'}>{deleteBusy ? 'Đang xóa…' : <><Trash2 size={16} />Xóa hết {deleteAllRows.length} {deleteAllLabel}</>}</button></div>
      </form>
    </Dialog>}{paymentTarget && <ContractPaymentDialog key={`${paymentTarget.id}-${paymentTarget.purpose}`} id={paymentTarget.id} initialPurpose={paymentTarget.purpose} onClose={closePayment} onPaymentSaved={() => setRetry(value => value + 1)} />}</section>;
}

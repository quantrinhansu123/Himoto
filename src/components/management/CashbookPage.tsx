'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { bulkDelete } from '@/lib/management/bulk-delete';
import { Dialog } from './Dialog';
import { CashbookRow, EMPTY_CASHBOOK_FILTERS, CashbookFilters, actorKey, cashbookCsv, filterCashbookRows } from '@/lib/management/cashbook';
import { CashbookAccount, createApiCashbookRepository, loadCashbookAccounts } from '@/lib/management/cashbook-repository';
import { useManagement } from './ManagementProvider';
import { CashbookAccounts } from './CashbookAccounts';
import { CashbookTable } from './CashbookTable';
import { ContractPaymentDialog } from './ContractPaymentDialog';
import type { PaymentPurpose } from '@/lib/management/contract-payments';

export function CashbookPage() {
  const { source, selectedStore, selectStore, notify } = useManagement();
  const repository = useMemo(() => createApiCashbookRepository('/api'), []);
  const [records, setRecords] = useState<CashbookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoaded = useRef(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState<CashbookFilters>(EMPTY_CASHBOOK_FILTERS);
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
    void repository.load(controller.signal).then(rows => { if (current) { setRecords(rows); hasLoaded.current = true; } }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : 'Không tải được sổ quỹ. Vui lòng thử lại.');
    }).finally(() => { if (current) { setLoading(false); setRefreshing(false); } });
    return () => { current = false; controller.abort(); };
  }, [repository, retry]);
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
  useEffect(() => { setQuery(current => ({ ...current, actor: '' })); }, [selectedStore]);
  const filtered = useMemo(() => filterCashbookRows(records, query, selectedStore), [records, query, selectedStore]);
  const income = useMemo(() => filtered.filter(row => row.type === 'income'), [filtered]);
  const expense = useMemo(() => filtered.filter(row => row.type === 'expense'), [filtered]);
  const actors = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of filterCashbookRows(records, EMPTY_CASHBOOK_FILTERS, selectedStore)) if (row.actor_name) names.set(actorKey(row), `${row.actor_name}${row.actor_id ? ` · #${row.actor_id}` : ''}`);
    return [...names].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [records, selectedStore]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  useEffect(() => {
    setSelectedIds(current => {
      const present = new Set(records.map(row => row.id));
      const next = new Set([...current].filter(id => present.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [records]);
  function changeSelection(ids: string[], selected: boolean) {
    setSelectedIds(current => { const next = new Set(current); for (const id of ids) if (selected) next.add(id); else next.delete(id); return next; });
  }
  const selectedRows = records.filter(row => selectedIds.has(row.id));
  async function deleteSelected() {
    if (deleteBusy || !selectedIds.size) return;
    setDeleteBusy(true); setDeleteError('');
    try {
      const deleted = await bulkDelete('transactions', [...selectedIds].map(Number));
      setSelectedIds(new Set()); setDeleteOpen(false);
      notify(`Đã xóa ${deleted.length} phiếu.`);
      setRetry(value => value + 1);
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Không xóa được phiếu.'); }
    finally { setDeleteBusy(false); }
  }
  const [deleteAllType, setDeleteAllType] = useState<'income' | 'expense' | null>(null);
  const [deleteAllText, setDeleteAllText] = useState('');
  const [deleteAllProgress, setDeleteAllProgress] = useState(0);
  const deleteAllRows = deleteAllType === 'income' ? income : deleteAllType === 'expense' ? expense : [];
  const deleteAllLabel = deleteAllType === 'expense' ? 'phiếu chi' : 'phiếu thu';
  function openDeleteAll(type: 'income' | 'expense') { setDeleteError(''); setDeleteAllText(''); setDeleteAllType(type); }
  async function deleteAll() {
    if (deleteBusy || !deleteAllRows.length || deleteAllText.trim().toUpperCase() !== 'XOA') return;
    setDeleteBusy(true); setDeleteError('');
    const ids = deleteAllRows.map(row => Number(row.id));
    let done = 0;
    try {
      for (let index = 0; index < ids.length; index += 500) {
        done += (await bulkDelete('transactions', ids.slice(index, index + 500))).length;
        setDeleteAllProgress(done);
      }
      setSelectedIds(new Set()); setDeleteAllType(null);
      notify(`Đã xóa ${done} ${deleteAllLabel}.`);
    } catch (cause) {
      setDeleteError(`${done ? `Đã xóa ${done}/${ids.length}. ` : ''}${cause instanceof Error ? cause.message : 'Không xóa được phiếu.'}`);
    } finally {
      setDeleteBusy(false); setDeleteAllProgress(0);
      if (done) setRetry(value => value + 1);
    }
  }
  const invalidDate = Boolean(query.startDate && query.endDate && query.startDate > query.endDate);
  const isFiltered = Boolean(query.search || query.actor || query.startDate || query.endDate || selectedStore !== 'all');
  const update = (next: Partial<CashbookFilters>) => setQuery(current => ({ ...current, ...next }));
  const reset = () => { setQuery(EMPTY_CASHBOOK_FILTERS); selectStore('all'); };
  function exportCsv() {
    if (loading || error || invalidDate || !filtered.length) return;
    const url = URL.createObjectURL(new Blob(['\uFEFF', cashbookCsv(filtered)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `himoto-so-quy-${source}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Đã xuất ${filtered.length} phiếu.`);
  }
  return <section className="mg-page mg-cashbook-page" aria-label="Sổ quỹ / Sổ két"><div className="mg-page-content">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">QUẢN LÝ THU — CHI <span>/</span> 06</div><h1>Sổ quỹ / Sổ két<span className="mg-title-count">{loading || error ? '—' : records.length}</span></h1><p>Tra cứu phiếu thu và phiếu chi theo cùng một cấu trúc dữ liệu.</p></div>
      <div className="mg-heading-actions"><button type="button" className="mg-button mg-button-danger" disabled={loading || Boolean(error) || !selectedIds.size} onClick={() => { setDeleteError(''); setDeleteOpen(true); }}><Trash2 size={16} />Xóa phiếu đã chọn{selectedIds.size ? ` (${selectedIds.size})` : ''}</button><button type="button" className="mg-button" disabled={loading || refreshing} onClick={() => setRetry(value => value + 1)}><RotateCcw size={16} className={refreshing ? 'mg-spin' : undefined} />{refreshing ? 'Đang tải…' : 'Tải lại'}</button><button type="button" className="mg-button mg-button-primary" disabled={loading || Boolean(error) || invalidDate || !filtered.length} onClick={exportCsv}><ArrowDownToLine size={17} />Xuất CSV</button></div></div>
    <div className="mg-data-panel mg-cashbook-filters"><div className="mg-toolbar"><label className="mg-search" htmlFor="cashbook-search"><Search size={17} /><span className="mg-sr-only">Tìm trên cả hai bảng</span><input id="cashbook-search" type="search" placeholder="Tìm ID, người thực hiện, lý do, nội dung…" value={query.search} onChange={event => update({ search: event.target.value })} />{query.search && <button type="button" aria-label="Xóa từ khóa" onClick={() => update({ search: '' })}><X size={15} /></button>}</label>
      <div className="mg-filter-controls"><label htmlFor="cashbook-actor" className="mg-cashbook-select-label">Người thực hiện<select id="cashbook-actor" value={query.actor} disabled={loading || Boolean(error)} onChange={event => update({ actor: event.target.value })}><option value="">Tất cả người thực hiện</option>{actors.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
      <div className="mg-date-filters"><span>Ngày phát sinh</span><label htmlFor="cashbook-start">Từ ngày <input id="cashbook-start" type="date" value={query.startDate} aria-invalid={invalidDate} aria-describedby={invalidDate ? 'cashbook-date-error' : undefined} onChange={event => update({ startDate: event.target.value })} /></label>
        <label htmlFor="cashbook-end">Đến ngày <input id="cashbook-end" type="date" value={query.endDate} aria-invalid={invalidDate} aria-describedby={invalidDate ? 'cashbook-date-error' : undefined} onChange={event => update({ endDate: event.target.value })} /></label>
        {invalidDate && <span id="cashbook-date-error" className="mg-field-error" role="alert">Đến ngày phải bằng hoặc sau Từ ngày.</span>}{isFiltered && <button type="button" className="mg-button" onClick={reset}><RotateCcw size={14} />Xóa bộ lọc</button>}</div>
    </div>
    <div className="mg-cashbook-overview" aria-label="Số phiếu theo bộ lọc"><a href="#cashbook-income"><span className="mg-cashbook-count-marker is-income" /><span>Phiếu thu</span><strong>{loading || error ? '—' : income.length}</strong><span className="mg-cashbook-jump">Xem danh sách ↓</span></a>
      <a href="#cashbook-expense"><span className="mg-cashbook-count-marker is-expense" /><span>Phiếu chi</span><strong>{loading || error ? '—' : expense.length}</strong><span className="mg-cashbook-jump">Xem danh sách ↓</span></a></div>
    <CashbookAccounts accounts={storeAccounts} loading={accountsLoading} error={accountsError} onRetry={() => setRetry(value => value + 1)} />
    <div className="mg-cashbook-tables"><CashbookTable type="income" rows={income} loading={loading} error={error} filtered={isFiltered} onReset={reset} onRetry={() => setRetry(value => value + 1)} selectedIds={selectedIds} onSelectionChange={changeSelection} onDeleteAll={() => openDeleteAll('income')} />
      <CashbookTable type="expense" rows={expense} loading={loading} error={error} filtered={isFiltered} onReset={reset} onRetry={() => setRetry(value => value + 1)} selectedIds={selectedIds} onSelectionChange={changeSelection} onDeleteAll={() => openDeleteAll('expense')} /></div>
    <div className="mg-list-note"><span className="mg-note-line" />Sổ quỹ đọc từ danh sách giao dịch hiện có. Trường chưa có dữ liệu hiển thị “—”.</div>
  </div>{deleteOpen && <Dialog title={`Xóa ${selectedIds.size} phiếu?`} subtitle={selectedRows.slice(0, 6).map(row => `#${row.id}`).join(', ') + (selectedRows.length > 6 ? '…' : '')} onClose={() => { if (!deleteBusy) setDeleteOpen(false); }}>
      <div className="mg-dialog-body"><p>Phiếu sẽ bị xóa hẳn khỏi Sổ quỹ và số dư tài khoản được tính lại. Phiếu thu gắn hợp đồng sẽ được trừ khỏi số tiền đã thu của hợp đồng đó (phiếu gia hạn / thu thêm còn trừ khỏi tổng tiền hợp đồng). Ngày hẹn trả đã gia hạn không tự lùi lại. Không thể hoàn tác.</p>
        <p><strong>{selectedRows.filter(row => row.type === 'income').length}</strong> phiếu thu · <strong>{selectedRows.filter(row => row.type === 'expense').length}</strong> phiếu chi · tổng <strong>{new Intl.NumberFormat('vi-VN').format(selectedRows.reduce((sum, row) => sum + (row.amount || 0), 0))} ₫</strong></p>
        {deleteError && <p className="mg-error-message" role="alert">{deleteError}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>Hủy</button><button type="button" className="mg-button mg-button-danger" disabled={deleteBusy} onClick={() => void deleteSelected()}>{deleteBusy ? 'Đang xóa…' : <><Trash2 size={16} />Xóa {selectedIds.size} phiếu</>}</button></div>
    </Dialog>}{deleteAllType && <Dialog title={`Xóa hết ${deleteAllRows.length} ${deleteAllLabel}?`} subtitle={isFiltered ? 'Theo cơ sở / bộ lọc đang chọn' : 'Toàn bộ sổ quỹ'} onClose={() => { if (!deleteBusy) setDeleteAllType(null); }}>
      <form onSubmit={event => { event.preventDefault(); void deleteAll(); }}>
        <div className="mg-dialog-body"><p>Tất cả <strong>{deleteAllRows.length} {deleteAllLabel}</strong> đang hiển thị trong bảng{isFiltered ? ' (đã áp dụng bộ lọc)' : ''} sẽ bị xóa hẳn, tổng <strong>{new Intl.NumberFormat('vi-VN').format(deleteAllRows.reduce((sum, row) => sum + (row.amount || 0), 0))} ₫</strong>. Số dư tài khoản được tính lại; phiếu thu gắn hợp đồng được trừ khỏi số tiền đã thu của hợp đồng. Không thể hoàn tác.</p>
          <div className="mg-field"><label htmlFor="cashbook-delete-all-confirm">Gõ <strong>XOA</strong> để xác nhận</label><input id="cashbook-delete-all-confirm" value={deleteAllText} autoComplete="off" disabled={deleteBusy} onChange={event => setDeleteAllText(event.target.value)} /></div>
          {deleteBusy && <p role="status">Đang xóa… {deleteAllProgress}/{deleteAllRows.length}</p>}
          {deleteError && <p className="mg-error-message" role="alert">{deleteError}</p>}</div>
        <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={deleteBusy} onClick={() => setDeleteAllType(null)}>Hủy</button><button type="submit" className="mg-button mg-button-danger" disabled={deleteBusy || deleteAllText.trim().toUpperCase() !== 'XOA'}>{deleteBusy ? 'Đang xóa…' : <><Trash2 size={16} />Xóa hết {deleteAllRows.length} {deleteAllLabel}</>}</button></div>
      </form>
    </Dialog>}{paymentTarget && <ContractPaymentDialog key={`${paymentTarget.id}-${paymentTarget.purpose}`} id={paymentTarget.id} initialPurpose={paymentTarget.purpose} onClose={closePayment} onPaymentSaved={() => setRetry(value => value + 1)} />}</section>;
}

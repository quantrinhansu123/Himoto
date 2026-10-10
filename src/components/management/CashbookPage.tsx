'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, RotateCcw, Search, X } from 'lucide-react';
import { CashbookRow, EMPTY_CASHBOOK_FILTERS, CashbookFilters, actorKey, cashbookCsv, filterCashbookRows } from '@/lib/management/cashbook';
import { createApiCashbookRepository } from '@/lib/management/cashbook-repository';
import { useManagement } from './ManagementProvider';
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
  useEffect(() => { setQuery(current => ({ ...current, actor: '' })); }, [selectedStore]);
  const filtered = useMemo(() => filterCashbookRows(records, query, selectedStore), [records, query, selectedStore]);
  const income = useMemo(() => filtered.filter(row => row.type === 'income'), [filtered]);
  const expense = useMemo(() => filtered.filter(row => row.type === 'expense'), [filtered]);
  const actors = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of filterCashbookRows(records, EMPTY_CASHBOOK_FILTERS, selectedStore)) if (row.actor_name) names.set(actorKey(row), `${row.actor_name}${row.actor_id ? ` · #${row.actor_id}` : ''}`);
    return [...names].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [records, selectedStore]);
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
      <div className="mg-heading-actions"><button type="button" className="mg-button" disabled={loading || refreshing} onClick={() => setRetry(value => value + 1)}><RotateCcw size={16} className={refreshing ? 'mg-spin' : undefined} />{refreshing ? 'Đang tải…' : 'Tải lại'}</button><button type="button" className="mg-button mg-button-primary" disabled={loading || Boolean(error) || invalidDate || !filtered.length} onClick={exportCsv}><ArrowDownToLine size={17} />Xuất CSV</button></div></div>
    <div className="mg-data-panel mg-cashbook-filters"><div className="mg-toolbar"><label className="mg-search" htmlFor="cashbook-search"><Search size={17} /><span className="mg-sr-only">Tìm trên cả hai bảng</span><input id="cashbook-search" type="search" placeholder="Tìm ID, người thực hiện, lý do, nội dung…" value={query.search} onChange={event => update({ search: event.target.value })} />{query.search && <button type="button" aria-label="Xóa từ khóa" onClick={() => update({ search: '' })}><X size={15} /></button>}</label>
      <div className="mg-filter-controls"><label htmlFor="cashbook-actor" className="mg-cashbook-select-label">Người thực hiện<select id="cashbook-actor" value={query.actor} disabled={loading || Boolean(error)} onChange={event => update({ actor: event.target.value })}><option value="">Tất cả người thực hiện</option>{actors.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
      <div className="mg-date-filters"><span>Ngày phát sinh</span><label htmlFor="cashbook-start">Từ ngày <input id="cashbook-start" type="date" value={query.startDate} aria-invalid={invalidDate} aria-describedby={invalidDate ? 'cashbook-date-error' : undefined} onChange={event => update({ startDate: event.target.value })} /></label>
        <label htmlFor="cashbook-end">Đến ngày <input id="cashbook-end" type="date" value={query.endDate} aria-invalid={invalidDate} aria-describedby={invalidDate ? 'cashbook-date-error' : undefined} onChange={event => update({ endDate: event.target.value })} /></label>
        {invalidDate && <span id="cashbook-date-error" className="mg-field-error" role="alert">Đến ngày phải bằng hoặc sau Từ ngày.</span>}{isFiltered && <button type="button" className="mg-button" onClick={reset}><RotateCcw size={14} />Xóa bộ lọc</button>}</div>
    </div>
    <div className="mg-cashbook-overview" aria-label="Số phiếu theo bộ lọc"><a href="#cashbook-income"><span className="mg-cashbook-count-marker is-income" /><span>Phiếu thu</span><strong>{loading || error ? '—' : income.length}</strong><span className="mg-cashbook-jump">Xem bảng ↓</span></a>
      <a href="#cashbook-expense"><span className="mg-cashbook-count-marker is-expense" /><span>Phiếu chi</span><strong>{loading || error ? '—' : expense.length}</strong><span className="mg-cashbook-jump">Xem bảng ↓</span></a></div>
    <div className="mg-cashbook-tables"><CashbookTable type="income" rows={income} loading={loading} error={error} filtered={isFiltered} onReset={reset} onRetry={() => setRetry(value => value + 1)} />
      <CashbookTable type="expense" rows={expense} loading={loading} error={error} filtered={isFiltered} onReset={reset} onRetry={() => setRetry(value => value + 1)} /></div>
    <div className="mg-list-note"><span className="mg-note-line" />Sổ quỹ đọc từ danh sách giao dịch hiện có. Trường chưa có dữ liệu hiển thị “—”.</div>
  </div>{paymentTarget && <ContractPaymentDialog key={`${paymentTarget.id}-${paymentTarget.purpose}`} id={paymentTarget.id} initialPurpose={paymentTarget.purpose} onClose={closePayment} onPaymentSaved={() => setRetry(value => value + 1)} />}</section>;
}

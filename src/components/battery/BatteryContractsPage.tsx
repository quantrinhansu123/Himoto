'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FileSearch, LoaderCircle, Pencil, Plus, Printer, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { BATTERY_COLLECTION_METHODS, BATTERY_PRODUCT_PRESETS, BATTERY_STATUSES, BatteryContract, BatteryContractInput, BatteryContractPrefill, batteryPaymentAccounts, batteryProductKind, batteryRequest, BatteryRequestError, batteryStatusLabel, DEFAULT_BATTERY_NAME, type BatteryCollectionMethod } from '@/lib/management/battery-contracts';
import { loadCashbookAccounts, type CashbookAccount } from '@/lib/management/cashbook-repository';
import { addRentalMonths, isOwnershipStore } from '@/lib/management/contract-billing';
import { customerDetails } from '@/lib/management/contract-document';
import { vietnamDate } from '@/lib/management/duty-roster';
import type { ManagementRow } from '@/lib/management/types';
import { useManagement } from '@/components/management/ManagementProvider';
import { Dialog } from '@/components/management/Dialog';
import { RowActionsMenu } from '@/components/management/RowActionsMenu';
import { PreviewPage, PrintPreviewDialog } from '@/components/contracts/ContractPrintPreview';
import { VietnamDateField } from '@/components/contracts/VietnamDateField';
import { DateTime24Field } from '@/components/contracts/DateTime24Field';
import { BatteryContractPrintDocument, BatteryPrintData } from './BatteryContractPrintDocument';

const vietnamNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
const moment = (value: string) => value ? `${value.slice(11, 16)} ${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '—';
const money = (value: number | null) => value === null ? '—' : `${value.toLocaleString('vi-VN')} đ`;
const moneyInput = (value: number | null) => value === null ? '' : value.toLocaleString('vi-VN');
const parseMoney = (value: string) => { const digits = value.replace(/\D/g, '').slice(0, 13); return digits ? Number(digits) : null; };
const STATUS_TONE: Record<BatteryContract['status'], string> = { renting: 'blue', returned: 'green', cancelled: 'gray' };
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function BatteryContractsPage() {
  const { dataset, selectedStore, selectStore, loading: datasetLoading, error: datasetError, notify } = useManagement();
  const [rows, setRows] = useState<BatteryContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<BatteryContract | null | undefined>(undefined);
  const [printing, setPrinting] = useState<BatteryContract | null>(null);
  const [removing, setRemoving] = useState<BatteryContract | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setLoading(true); setError('');
    const params = new URLSearchParams(); if (selectedStore !== 'all') params.set('store_id', selectedStore);
    batteryRequest<BatteryContract[]>(`/api/auth/battery-contracts?${params}`, 'GET', undefined, controller.signal).then(data => {
      if (!Array.isArray(data) || data.some(row => !Number.isSafeInteger(row.id) || typeof row.revision !== 'string')) throw new Error('Kết quả hợp đồng thuê pin chưa hợp lệ.');
      if (current) setRows(data);
    }).catch(cause => { if (current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được hợp đồng thuê pin.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [selectedStore, reload]);
  const visible = useMemo(() => {
    const term = fold(search.trim());
    return rows.filter(row => (!status || row.status === status) && (!term || fold([row.code, row.customer_name, row.customer_phone, row.customer_id_card, row.vehicle_license, row.staff_name].join(' ')).includes(term)));
  }, [rows, search, status]);
  const unavailable = datasetLoading || Boolean(datasetError);
  const refresh = () => setReload(value => value + 1);
  async function remove() {
    if (!removing || deleteLock.current) return;
    deleteLock.current = true; setDeleteBusy(true); setDeleteError('');
    try { await batteryRequest(`/api/auth/battery-contracts/${removing.id}`, 'DELETE', { revision: removing.revision }); setRemoving(null); notify('Đã xóa hợp đồng thuê pin.'); refresh(); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Chưa xóa được hợp đồng thuê pin.'); refresh(); }
    finally { deleteLock.current = false; setDeleteBusy(false); }
  }
  const filtered = Boolean(search || status);
  return <section className="mg-page mg-battery-page" aria-label="Hợp đồng thuê pin"><div className="mg-page-content">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">HỢP ĐỒNG <span>/</span> THUÊ PIN / SẠC</div><h1>Hợp đồng thuê pin / sạc<span className="mg-title-count">{loading || error ? '—' : visible.length}</span></h1><p>Lập, lưu và in hợp đồng thuê pin hoặc sạc xe điện theo mẫu HIMOTO. Có thể mở sẵn từ hợp đồng thuê xe.</p></div>
      <div className="mg-heading-actions"><button type="button" className="mg-button mg-button-primary" disabled={unavailable} onClick={() => setEditing(null)}><Plus size={16} />Tạo hợp đồng thuê pin / sạc</button></div></div>
    <div className="mg-data-panel">
      <div className="mg-status-tabs" aria-label="Lọc theo trạng thái"><button type="button" className={!status ? 'is-active' : ''} aria-pressed={!status} onClick={() => setStatus('')}>Tất cả<span>{rows.length}</span></button>
        {BATTERY_STATUSES.map(option => <button type="button" key={option.value} className={status === option.value ? 'is-active' : ''} aria-pressed={status === option.value} onClick={() => setStatus(option.value)}>{option.label}<span>{rows.filter(row => row.status === option.value).length}</span></button>)}</div>
      <div className="mg-toolbar"><label className="mg-search"><Search size={17} /><span className="mg-sr-only">Tìm hợp đồng thuê pin</span><input type="search" placeholder="Tìm mã HĐ, khách hàng, SĐT, CCCD, biển số…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Xóa từ khóa" onClick={() => setSearch('')}><X size={15} /></button>}</label>
        <div className="mg-filter-controls"><label className="mg-sr-label"><span className="mg-sr-only">Cơ sở</span><select aria-label="Cơ sở" value={selectedStore} onChange={event => selectStore(event.target.value)}><option value="all">Tất cả cơ sở</option>{dataset?.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label></div></div>
      <div className="mg-table-scroll" tabIndex={0} role="region" aria-label="Bảng hợp đồng thuê pin, cuộn ngang để xem thêm cột">
        <table className="mg-table mg-table-battery" aria-busy={loading}>
          <thead><tr><th scope="col" className="mg-index">STT</th><th scope="col">Mã HĐ</th><th scope="col">Khách hàng</th><th scope="col">Biển số</th><th scope="col">Pin</th><th scope="col">Bắt đầu</th><th scope="col">Kết thúc</th><th scope="col" className="mg-align-right">Giá thuê</th><th scope="col">Cơ sở</th><th scope="col">Trạng thái</th><th scope="col" className="mg-actions-column">Thao tác</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={11}><div className="mg-table-state" role="status"><LoaderCircle className="mg-spin" size={26} /><strong>Đang tải danh sách…</strong></div></td></tr>
            : error ? <tr><td colSpan={11}><div className="mg-table-state mg-table-error" role="alert"><FileSearch size={30} /><strong>Không tải được dữ liệu</strong><p>{error}</p><button type="button" className="mg-button" onClick={refresh}><RotateCcw size={15} />Thử lại</button></div></td></tr>
            : visible.length === 0 ? <tr><td colSpan={11}><div className="mg-table-state"><FileSearch size={32} /><strong>{filtered ? 'Không tìm thấy kết quả' : 'Chưa có hợp đồng thuê pin'}</strong>{filtered ? <button type="button" className="mg-button" onClick={() => { setSearch(''); setStatus(''); }}>Xóa bộ lọc</button> : <p>Bấm “Tạo hợp đồng thuê pin” để lập hợp đồng đầu tiên.</p>}</div></td></tr>
            : visible.map((row, index) => <tr key={row.id}><td className="mg-index">{index + 1}</td><td className="mg-record-code">{row.code}</td>
              <td><strong>{row.customer_name}</strong>{row.customer_phone && <div className="mg-cell-sub">{row.customer_phone}</div>}</td><td>{row.vehicle_license || '—'}</td><td>{row.battery_name}</td>
              <td>{moment(row.starts_at)}</td><td>{moment(row.ends_at)}</td><td className="mg-align-right">{money(row.rent_price)}{row.price_unit && <div className="mg-cell-sub">/ {row.price_unit}</div>}</td><td>{row.store_name}</td>
              <td><span className={`mg-status mg-status-${STATUS_TONE[row.status]}`}><span />{batteryStatusLabel(row.status)}</span></td>
              <td className="mg-actions-column"><div className="mg-row-actions"><RowActionsMenu label={`Thao tác ${row.code}`} actions={[
                { key: 'print', label: 'Xem / In hợp đồng', icon: <Printer size={16} />, onSelect: () => setPrinting(row) },
                { key: 'edit', label: 'Sửa hợp đồng', icon: <Pencil size={16} />, onSelect: () => setEditing(row) },
                { key: 'delete', label: 'Xóa hợp đồng', danger: true, icon: <Trash2 size={16} />, onSelect: () => { setRemoving(row); setDeleteError(''); } },
              ]} /></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
    {editing !== undefined && dataset && <BatteryContractForm key={editing?.id || 'new'} row={editing} storeId={selectedStore} onClose={() => setEditing(undefined)} onRefresh={() => { setEditing(undefined); refresh(); }}
      onSaved={(saved, print) => { setEditing(undefined); refresh(); notify('Đã lưu hợp đồng thuê pin.'); if (print) setPrinting(saved); }} />}
    {printing && <BatteryPrintPreview doc={printing} onClose={() => setPrinting(null)} />}
    {removing && <Dialog title="Xóa hợp đồng thuê pin" onClose={() => { if (!deleteLock.current) setRemoving(null); }}><div className="mg-dialog-body"><p>Xóa hợp đồng <strong>{removing.code}</strong> của <strong>{removing.customer_name}</strong>?</p>{deleteError && <p role="alert" className="mg-field-error">{deleteError}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={deleteBusy} onClick={() => setRemoving(null)}>Đóng</button><button type="button" className="mg-button mg-button-primary" disabled={deleteBusy || Boolean(deleteError)} onClick={() => void remove()}>{deleteBusy ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div></Dialog>}
  </div></section>;
}

export function BatteryPrintPreview({ doc, onClose }: { doc: BatteryPrintData; onClose: () => void }) {
  return <PrintPreviewDialog title="Xem trước hợp đồng thuê pin" subtitle={`${doc.code || 'Chưa lưu'} · A4 dọc`} printTitle={`HIMOTO - ${doc.code || 'Hop dong thue pin'}`} printLabel="In hợp đồng" layoutKey={doc} pageRule="size: A4 portrait; margin: 0;" onClose={onClose}>
    <BatteryContractPrintDocument doc={doc} pageWrapper={PreviewPage} />
  </PrintPreviewDialog>;
}

type FormState = Omit<BatteryContractInput, 'store_id' | 'revision' | 'request_id'> & { store_id: string };
type LookupState = 'idle' | 'loading' | 'found' | 'matches' | 'missing' | 'error';
function emptyForm(storeId: string, prefill?: BatteryContractPrefill): FormState {
  return {
    store_id: prefill?.store_id ? String(prefill.store_id) : storeId === 'all' ? '' : storeId,
    customer_id: prefill?.customer_id ?? null, status: prefill?.status || 'renting', staff_name: prefill?.staff_name || '',
    signed_on: prefill?.signed_on || vietnamDate(), signed_place: prefill?.signed_place || '',
    customer_name: prefill?.customer_name || '', customer_phone: prefill?.customer_phone || '', customer_address: prefill?.customer_address || '',
    customer_id_card: prefill?.customer_id_card || '', id_card_issued_on: prefill?.id_card_issued_on || '', id_card_issued_by: prefill?.id_card_issued_by || '',
    battery_name: prefill?.battery_name || DEFAULT_BATTERY_NAME, vehicle_license: prefill?.vehicle_license || '', vehicle_brand: prefill?.vehicle_brand || '',
    vehicle_type: prefill?.vehicle_type || '', vehicle_color: prefill?.vehicle_color || '', vehicle_year: prefill?.vehicle_year || '',
    starts_at: prefill?.starts_at || vietnamNow(), ends_at: prefill?.ends_at || '', rent_price: prefill?.rent_price ?? null, price_unit: prefill?.price_unit || 'tháng',
    package_name: prefill?.package_name || '', paid_amount: prefill?.paid_amount ?? null, paid_method: prefill?.paid_method || '',
    deposit_amount: prefill?.deposit_amount ?? null, deposit_note: prefill?.deposit_note || '', deposit_method: prefill?.deposit_method || '', notes: prefill?.notes || '',
    paid_account_type: prefill?.paid_account_type || '', paid_account_id: prefill?.paid_account_id ?? null,
    deposit_account_type: prefill?.deposit_account_type || '', deposit_account_id: prefill?.deposit_account_id ?? null,
    collected_at: prefill?.collected_at || vietnamNow(),
  };
}
function formFromRow(row: BatteryContract): FormState {
  const fields: Record<string, unknown> = { ...row, store_id: String(row.store_id) };
  for (const key of ['id', 'code', 'store_name', 'store_address', 'store_phone', 'created_at', 'revision']) delete fields[key];
  return fields as FormState;
}

export function BatteryContractForm({ row, storeId, prefill, sourceLabel, onClose, onSaved, onRefresh }: {
  row: BatteryContract | null; storeId: string; prefill?: BatteryContractPrefill; sourceLabel?: string;
  onClose: () => void; onSaved: (saved: BatteryContract, print: boolean) => void; onRefresh: () => void;
}) {
  const { dataset, contractAutofill } = useManagement();
  const stores = dataset?.stores.filter(store => ['active', 'opening'].includes(store.status) || store.id === row?.store_id || (prefill?.store_id != null && store.id === prefill.store_id)) || [];
  const [form, setForm] = useState<FormState>(() => {
    if (row) return formFromRow(row);
    const initial = emptyForm(storeId, prefill);
    if (!initial.store_id && storeId === 'all') initial.store_id = String(stores.find(store => isOwnershipStore(store.name))?.id || '');
    if (!initial.ends_at && initial.starts_at) {
      initial.ends_at = addRentalMonths(initial.starts_at, 1);
      if (!initial.package_name) initial.package_name = '1 tháng';
    }
    return initial;
  });
  const [accounts, setAccounts] = useState<CashbookAccount[]>([]);
  const [accountsError, setAccountsError] = useState('');
  const [accountsLoading, setAccountsLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    loadCashbookAccounts('/api', controller.signal).then(setAccounts).catch(cause => { if (!controller.signal.aborted) setAccountsError(cause instanceof Error ? cause.message : 'Không tải được tài khoản nhận.'); }).finally(() => { if (!controller.signal.aborted) setAccountsLoading(false); });
    return () => controller.abort();
  }, []);
  const [lookup, setLookup] = useState(row?.customer_id_card || row?.customer_phone || prefill?.customer_id_card || prefill?.customer_phone || '');
  const [lookupState, setLookupState] = useState<LookupState>(row?.customer_id || prefill?.customer_id ? 'found' : 'idle');
  const [matches, setMatches] = useState<ManagementRow[]>([]);
  const [lookupError, setLookupError] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const [preview, setPreview] = useState(false);
  const busy = useRef(false), requestId = useRef(crypto.randomUUID()), skipLookup = useRef(Boolean(row || prefill?.customer_id || prefill?.customer_id_card || prefill?.customer_phone));
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));
  const productKind = batteryProductKind(form.battery_name);
  useEffect(() => {
    if (skipLookup.current) { skipLookup.current = false; return; }
    const digits = lookup.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 13) { setLookupState('idle'); setMatches([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLookupState('loading'); setLookupError('');
      contractAutofill.searchCustomers(digits, controller.signal).then(customers => {
        if (controller.signal.aborted) return;
        if (customers.length === 1) choose(customers[0]);
        else if (customers.length > 1) { setMatches(customers); setLookupState('matches'); }
        else { setMatches([]); setLookupState('missing'); setForm(current => ({ ...current, customer_id: null, ...(/^0\d{8,10}$/.test(digits) ? { customer_phone: current.customer_phone || digits } : { customer_id_card: current.customer_id_card || digits }) })); }
      }).catch(cause => { if (!controller.signal.aborted) { setLookupState('error'); setLookupError(cause instanceof Error ? cause.message : 'Không tra cứu được khách hàng.'); } });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [lookup, contractAutofill]);
  function choose(customer: ManagementRow) {
    const details = customerDetails(customer);
    setMatches([]); setLookupState('found');
    setForm(current => ({ ...current, customer_id: Number(customer.id), customer_name: details.name, customer_phone: details.phone, customer_address: details.address,
      customer_id_card: details.id_card, id_card_issued_on: details.id_card_issued_on, id_card_issued_by: details.id_card_issued_by }));
  }
  const store = stores.find(item => String(item.id) === form.store_id);
  const printData: BatteryPrintData = { ...form, store_id: Number(form.store_id), code: row?.code || '', store_address: String(store?.address || row?.store_address || ''), store_phone: String(store?.phone || row?.store_phone || '') };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    const print = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'print';
    if (form.ends_at && Date.parse(`${form.ends_at}+07:00`) <= Date.parse(`${form.starts_at}+07:00`)) { setError('Thời điểm kết thúc phải sau thời điểm bắt đầu.'); return; }
    for (const purpose of ['paid','deposit'] as const) {
      const amount = purpose === 'paid' ? form.paid_amount : form.deposit_amount;
      if (Number(amount) > 0 && !batteryPaymentAccounts(accounts,Number(form.store_id),form[`${purpose}_account_type`] || '').some(account=>Number(account.id) === form[`${purpose}_account_id`])) { setError('Chọn hình thức và tài khoản nhận cho từng khoản tiền thuê / cọc đã thu.');return; }
    }
    const input: BatteryContractInput = { ...form, store_id: Number(form.store_id), ...(row ? { revision: row.revision } : { request_id: requestId.current }) };
    busy.current = true; setSaving(true); setError('');
    try {
      const saved = await batteryRequest<BatteryContract>(`/api/auth/battery-contracts${row ? `/${row.id}` : ''}`, row ? 'PATCH' : 'POST', input);
      if (!saved || !Number.isSafeInteger(saved.id) || typeof saved.revision !== 'string') throw new Error('Kết quả lưu chưa hợp lệ.');
      onSaved(saved, print);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được hợp đồng thuê pin.');
      if (!(cause instanceof BatteryRequestError) || cause.status === 0 || cause.status >= 500 || cause.status === 409) setUncertain(true);
    } finally { busy.current = false; setSaving(false); }
  }
  const lookupText = lookupState === 'loading' ? 'Đang tra cứu khách hàng…' : lookupState === 'found' ? `Đã chọn khách hàng #${form.customer_id} · Thông tin đã tự động điền` : lookupState === 'matches' ? `Tìm thấy ${matches.length} hồ sơ. Chọn đúng khách hàng bên dưới.` : lookupState === 'missing' ? 'Chưa có khách hàng này trong hệ thống. Nhập thông tin Bên B bên dưới.' : lookupState === 'error' ? lookupError : 'Nhập CCCD/CMND hoặc số điện thoại (9–13 số) để tự điền thông tin khách.';
  const text = (key: keyof FormState, label: string, props: { wide?: boolean; required?: boolean; maxLength?: number; type?: string; list?: string; placeholder?: string } = {}) =>
    <label className={props.wide ? 'mg-field-wide' : undefined}>{label}{props.required ? ' *' : ''}<input type={props.type || 'text'} required={props.required} maxLength={props.maxLength} list={props.list} placeholder={props.placeholder} value={String(form[key] ?? '')} onChange={event => update(key, event.target.value as never)} /></label>;
  const amount = (key: 'rent_price' | 'paid_amount' | 'deposit_amount', label: string) =>
    <label>{label}<input inputMode="numeric" placeholder="0" value={moneyInput(form[key])} onChange={event => update(key, parseMoney(event.target.value))} /></label>;
  const method = (purpose: 'paid' | 'deposit', label: string) => {
    const type = form[`${purpose}_account_type`] || '';
    const available = batteryPaymentAccounts(accounts, Number(form.store_id), type);
    const positive = Number(purpose === 'paid' ? form.paid_amount : form.deposit_amount) > 0;
    return <><label>{label}<select aria-label={label} required={positive} value={type} onChange={event => setForm(current => ({ ...current, [`${purpose}_account_type`]: event.target.value as BatteryCollectionMethod, [`${purpose}_account_id`]: null, [`${purpose}_method`]: event.target.value === 'cash' ? 'TM' : event.target.value ? 'CK' : '' }))}>{BATTERY_COLLECTION_METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {type && <label>{purpose === 'paid' ? 'Tài khoản nhận tiền thuê' : 'Tài khoản nhận tiền cọc'}<select aria-label={purpose === 'paid' ? 'Tài khoản nhận tiền thuê' : 'Tài khoản nhận tiền cọc'} required={positive} disabled={accountsLoading} value={form[`${purpose}_account_id`] || ''} onChange={event => update(`${purpose}_account_id`, event.target.value ? Number(event.target.value) : null)}><option value="">Chọn tài khoản nhận</option>{available.map(account => <option key={account.key} value={account.id}>{account.label}</option>)}</select>{!accountsLoading && !available.length && <small className="mg-field-error">Không có tài khoản đang hoạt động phù hợp với cơ sở đã chọn.</small>}</label>}</>;
  };
  const dialogTitle = row ? `Sửa hợp đồng thuê pin ${row.code}` : sourceLabel ? `Thuê pin / sạc · ${sourceLabel}` : 'Tạo hợp đồng thuê pin';
  return <>
    <Dialog title={dialogTitle} className="mg-battery-dialog" onClose={() => { if (!busy.current) onClose(); }}><form onSubmit={submit}><div className="mg-dialog-body">
      {sourceLabel && <p className="mg-composer-hint">Đã điền khách hàng, xe và thời hạn từ hợp đồng thuê xe {sourceLabel}. Chọn Pin hoặc Sạc, kiểm tra giá rồi lưu.</p>}
      <fieldset className="mg-payment-fields" disabled={saving || uncertain}><legend>Thông tin chung</legend>
        <label>Cơ sở cho thuê *<select required value={form.store_id} onChange={event => update('store_id', event.target.value)}><option value="">Chọn cơ sở</option>{stores.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Trạng thái<select value={form.status} onChange={event => update('status', event.target.value as FormState['status'])}>{BATTERY_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {text('staff_name', 'Nhân viên (NV)', { maxLength: 120, list: 'battery-staff' })}
        {text('signed_on', 'Ngày ký', { type: 'date', required: true })}
        {text('signed_place', 'Nơi ký (Tại)', { wide: true, maxLength: 255, placeholder: store?.address ? `Mặc định: ${store.address}` : 'Mặc định: địa chỉ cơ sở' })}
        <datalist id="battery-staff">{dataset?.staff.filter(person => person.status === 'active').map(person => <option key={person.id} value={person.name} />)}</datalist>
      </fieldset>
      <fieldset className="mg-payment-fields" disabled={saving || uncertain}><legend>Bên B (Bên thuê)</legend>
        <div className="mg-field-wide mg-battery-lookup"><label>Tra cứu theo CCCD / CMND hoặc SĐT<span className="mg-battery-lookup-input"><input autoComplete="off" inputMode="numeric" placeholder="CCCD/CMND hoặc SĐT · Tất cả cơ sở" value={lookup} onChange={event => setLookup(event.target.value)} />{lookupState === 'loading' ? <LoaderCircle size={16} className="mg-spin" /> : <Search size={16} />}</span></label>
          <p className={`mg-lookup-status is-${lookupState}`} role={lookupState === 'error' ? 'alert' : 'status'}>{lookupText}</p>
          {lookupState === 'matches' && <div className="mg-customer-match-list" role="listbox" aria-label="Chọn khách hàng tìm thấy">{matches.map(customer => <button key={customer.id} type="button" role="option" aria-selected="false" className="mg-customer-match" onClick={() => choose(customer)}><strong>{customer.name}</strong><span>{customer.phone || 'Chưa có SĐT'} · CCCD {customer.id_card || 'Chưa có'}</span></button>)}</div>}</div>
        {text('customer_name', 'Họ tên Ông/Bà', { required: true, maxLength: 255 })}
        {text('customer_phone', 'Điện thoại', { type: 'tel', maxLength: 32 })}
        {text('customer_address', 'Địa chỉ', { wide: true, maxLength: 500 })}
        {text('customer_id_card', 'Số CCCD', { maxLength: 32 })}
        <div className="mg-field"><label htmlFor="battery-id-card-issued-on">Cấp ngày</label><VietnamDateField id="battery-id-card-issued-on" label="Cấp ngày" value={form.id_card_issued_on} onChange={next => update('id_card_issued_on', next)} /></div>
        {text('id_card_issued_by', 'Nơi cấp', { wide: true, maxLength: 255, placeholder: 'Mặc định: Cục cảnh sát' })}
      </fieldset>
      <fieldset className="mg-payment-fields" disabled={saving || uncertain}><legend>Điều 1 · Pin / sạc và xe của khách</legend>
        <div className="mg-field-wide"><span className="mg-sr-only">Loại thuê</span>
          <div className="mg-status-tabs" role="group" aria-label="Chọn pin hoặc sạc">{BATTERY_PRODUCT_PRESETS.map(option =>
            <button type="button" key={option.value} className={productKind === option.value ? 'is-active' : ''} aria-pressed={productKind === option.value}
              onClick={() => update('battery_name', option.name)}>{option.label}</button>)}</div></div>
        {text('battery_name', 'Loại pin / sạc cho thuê', { wide: true, required: true, maxLength: 255 })}
        {text('vehicle_license', 'Biển số xe của khách', { maxLength: 32 })}
        {text('vehicle_brand', 'Nhãn hiệu', { maxLength: 120 })}
        {text('vehicle_type', 'Loại xe', { maxLength: 120 })}
        {text('vehicle_color', 'Màu sắc', { maxLength: 60 })}
        {text('vehicle_year', 'Năm sản xuất', { maxLength: 10 })}
      </fieldset>
      <fieldset className="mg-payment-fields" disabled={saving || uncertain}><legend>Điều 2 · Thời hạn, giá thuê, thanh toán</legend>
        <DateTime24Field id="battery-start" label="Bắt đầu (24h)" value={form.starts_at} onChange={value => setForm(current => ({ ...current, starts_at: value, ...(current.ends_at === addRentalMonths(current.starts_at, 1) ? { ends_at: addRentalMonths(value, 1) } : {}) }))} />
        <DateTime24Field id="battery-end" label="Đến (24h)" value={form.ends_at} onChange={value => update('ends_at', value)} required={false} />
        <div className="mg-field-wide"><button type="button" className="mg-button" onClick={() => setForm(current => ({ ...current, ends_at: addRentalMonths(current.starts_at, 1), price_unit: 'tháng', package_name: '1 tháng' }))}>Gợi ý thuê 1 tháng</button></div>
        {amount('rent_price', 'Giá thuê (đ)')}
        {text('price_unit', 'Đơn vị tính (/…)', { maxLength: 30, placeholder: 'tháng, tuần, ngày…' })}
        {amount('paid_amount', 'Đã thanh toán (đ)')}
        {method('paid', 'Hình thức thanh toán')}
        {text('package_name', 'Gói thuê', { wide: true, maxLength: 120 })}
        {amount('deposit_amount', 'Tiền cọc đã nhận (đ)')}
        {method('deposit', 'Hình thức đặt cọc')}
        <DateTime24Field id="battery-collected" label="Thời điểm nhận tiền" value={form.collected_at || vietnamNow()} onChange={value=>update('collected_at',value)} />
        <p className="mg-field-wide mg-composer-hint">Tiền thuê đã thanh toán và tiền cọc được ghi thành phiếu thu riêng vào tài khoản đã chọn. Khi sửa, chỉ phần tăng thêm được ghi phiếu mới; không thu lại số đã nhận.</p>
        {accountsError && <p className="mg-field-wide mg-field-error" role="alert">{accountsError}</p>}
        {text('deposit_note', 'Tài sản thế chấp / ghi chú cọc', { wide: true, maxLength: 500 })}
        <label className="mg-field-wide">Ghi chú nội bộ (không in)<textarea rows={2} maxLength={2000} value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="mg-field-error">{error}</p>}{uncertain && <p>Làm mới danh sách để kiểm tra hợp đồng đã lưu hay chưa trước khi thử lại.</p>}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
      <button type="button" className="mg-button" disabled={saving} onClick={() => setPreview(true)}><Printer size={16} />Xem mẫu in</button>
      {uncertain ? <button type="button" className="mg-button" onClick={onRefresh}>Làm mới danh sách để kiểm tra</button> : <>
        <button type="submit" value="save" className="mg-button" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        <button type="submit" value="print" className="mg-button mg-button-primary" disabled={saving}><Printer size={16} />Lưu và in</button></>}</div>
    </form></Dialog>
    {preview && <BatteryPrintPreview doc={printData} onClose={() => setPreview(false)} />}
  </>;
}

'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, LoaderCircle, Trash2 } from 'lucide-react';
import { CashbookAccount, CashbookAccountEdits, CashbookAccountVoucher, createCashbookAccount, deleteCashbookAccount, loadCashbookAccountVouchers, updateCashbookAccount } from '@/lib/management/cashbook-repository';
import { ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { SuggestionInput } from './SuggestionInput';
import { MobileDetailsCard } from './MobileDetailsCard';

export type AccountDialogMode = 'create' | 'view' | 'edit' | 'delete';
type AccountType = 'cash' | 'bank' | 'company';
const ACCOUNT_TYPES: [AccountType, string][] = [['cash', 'Tiền mặt (két)'], ['bank', 'Ngân hàng cơ sở'], ['company', 'TK công ty']];
const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;

const VIEW_TABS = [{ id: 'info', label: 'Chi tiết' }, { id: 'vouchers', label: 'Danh sách thu chi' }] as const;
type ViewTab = (typeof VIEW_TABS)[number]['id'];

function VoucherColumn({ title, kind, rows }: { title: string; kind: 'income' | 'expense'; rows: CashbookAccountVoucher[] }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return <section className="mg-account-voucher-col" aria-label={title}>
    <h3>{title}<span className="mg-title-count">{rows.length}</span></h3>
    <div className="mg-mobile-records"><ul className="mg-mobile-card-list">{rows.map(row => <MobileDetailsCard key={row.id} title={row.contract_code || row.content || `Phiếu #${row.id}`}
      summary={<><span>{money(row.amount)}</span><span>{row.date ? row.date.split('-').reverse().join('/') : '—'}</span></>}
      fields={[["ID", row.id], ["Ngày", row.date ? row.date.split('-').reverse().join('/') : '—'], ["Giờ", row.time || '—'], ["Hợp đồng", row.contract_code || '—'], ["Nội dung", row.content || '—'], ["Người thực hiện", row.user_name || '—'], ["Số tiền", money(row.amount)]]} />)}</ul>
      {!rows.length && <p>Không có phiếu trong khoảng ngày đã chọn.</p>}<p className="mg-mobile-list-total">Tổng <strong>{money(total)}</strong></p></div>
    <div className="mg-table-scroll mg-desktop-records"><table className="mg-table"><thead><tr><th scope="col">Ngày</th><th scope="col">Hợp đồng / nội dung</th><th scope="col" className="mg-align-right">Số tiền</th></tr></thead>
      <tbody>{rows.length ? rows.map(row => <tr key={row.id}><td>{row.date ? row.date.split('-').reverse().join('/') : '—'}{row.time && <small> {row.time.slice(0, 5)}</small>}</td>
        <td><span className="mg-cashbook-cell" title={row.content}>{row.contract_code || row.content || '—'}</span>{row.contract_code && row.content && <small>{row.content}</small>}</td>
        <td className={`mg-align-right mg-numeric ${kind === 'income' ? 'mg-cashbook-income-amount' : 'mg-cashbook-expense-amount'}`}>{money(row.amount)}</td></tr>)
        : <tr><td colSpan={3}>Không có phiếu trong khoảng ngày đã chọn.</td></tr>}</tbody>
      <tfoot><tr><th scope="row" colSpan={2}>Tổng</th><td className="mg-align-right mg-numeric"><strong>{money(total)}</strong></td></tr></tfoot></table></div>
  </section>;
}

function AccountVouchers({ account }: { account: CashbookAccount }) {
  const [range, setRange] = useState({ from: '', to: '' });
  const [rows, setRows] = useState<CashbookAccountVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const invalid = Boolean(range.from && range.to && range.from > range.to);
  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController(); let current = true;
    setLoading(true); setError('');
    loadCashbookAccountVouchers(account, range, controller.signal).then(data => { if (current) setRows(data); })
      .catch(cause => { if (current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được danh sách thu chi.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [account, range, invalid, retry]);
  const income = useMemo(() => rows.filter(row => row.type === 'income'), [rows]);
  const expense = useMemo(() => rows.filter(row => row.type === 'expense'), [rows]);
  return <div>
    <div className="mg-date-filters"><label htmlFor="account-from">Từ ngày <input id="account-from" type="date" value={range.from} aria-invalid={invalid} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} /></label>
      <label htmlFor="account-to">Đến ngày <input id="account-to" type="date" value={range.to} aria-invalid={invalid} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} /></label>
      {(range.from || range.to) && <button type="button" className="mg-button" onClick={() => setRange({ from: '', to: '' })}>Xóa lọc</button>}
      {invalid && <span className="mg-field-error" role="alert">Đến ngày phải bằng hoặc sau Từ ngày.</span>}</div>
    {loading ? <div className="mg-table-state" role="status"><LoaderCircle size={22} className="mg-spin" /><strong>Đang tải phiếu thu chi…</strong></div>
      : error ? <div className="mg-table-state mg-table-error" role="alert"><strong>{error}</strong><button type="button" className="mg-button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>
      : <div className="mg-account-voucher-grid"><VoucherColumn title="Thu" kind="income" rows={income} /><VoucherColumn title="Chi" kind="expense" rows={expense} /></div>}
  </div>;
}

type Props = { onClose: () => void; onChanged: () => void; ownerSuggestions?: string[] } & ({ mode: 'create'; account?: undefined; defaultStoreId?: string } | { mode: Exclude<AccountDialogMode, 'create'>; account: CashbookAccount; defaultStoreId?: undefined });
export function CashbookAccountDialog({ account, mode, defaultStoreId, onClose, onChanged, ownerSuggestions = [] }: Props) {
  const { dataset } = useManagement();
  const stores = dataset?.stores || [];
  const [draft, setDraft] = useState({
    type: (!account ? 'cash' : account.kind === 'cash' ? 'cash' : account.owner_type === 'company' ? 'company' : 'bank') as AccountType,
    store_id: account ? (account.store_id && account.store_id !== '0' ? account.store_id : '') : defaultStoreId || '',
    name: account?.name || '', bank_name: account?.bank_name || '', owner_name: account?.owner_name || '', account_number: account?.account_number || '',
    status: !account || account.status.toLowerCase() === 'active' ? 'active' : 'inactive', opening_balance: String(account?.opening_balance ?? 0) });
  const isBank = draft.type !== 'cash';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const [tab, setTab] = useState<ViewTab>('info');
  const change = (key: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await action(); onChanged(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thực hiện được thao tác.'); }
    finally { busy.current = false; setSaving(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const opening = Number(draft.opening_balance);
    if (draft.opening_balance.trim() === '' || !Number.isSafeInteger(opening)) { setError('Số dư đầu kỳ phải là số nguyên (đồng).'); return; }
    if (draft.type !== 'company' && !draft.store_id) { setError('Chọn cơ sở cho tài khoản.'); return; }
    if (isBank && (!draft.bank_name.trim() || !draft.owner_name.trim() || !draft.account_number.trim())) { setError('Nhập đủ ngân hàng, chủ tài khoản và số tài khoản.'); return; }
    const values: CashbookAccountEdits = { status: draft.status as 'active' | 'inactive', opening_balance: opening,
      store_id: draft.store_id || '0',
      ...(!isBank ? { name: draft.name.trim() } : {}),
      ...(isBank ? { owner_type: draft.type === 'company' ? 'company' : 'store', bank_name: draft.bank_name.trim(), owner_name: draft.owner_name.trim(), account_number: draft.account_number.trim() } : {}) };
    void run(() => account ? updateCashbookAccount(account, values) : createCashbookAccount(isBank ? 'bank' : 'cash', values));
  }
  const close = () => { if (!busy.current) onClose(); };
  if (mode === 'create' || mode === 'edit') {
    const typeOptions = ACCOUNT_TYPES.filter(([value]) => !account || (account.kind === 'cash' ? value === 'cash' : value !== 'cash'));
    const storeMissing = draft.store_id && !stores.some(store => String(store.id) === draft.store_id);
    return <Dialog title={account ? 'Sửa tài khoản' : 'Thêm tài khoản'} subtitle={account?.label} onClose={close}>
      <form noValidate autoComplete="off" onSubmit={submit}><div className="mg-dialog-body"><div className="mg-form-grid">
        <div className="mg-field"><label htmlFor="account-type">Loại tài khoản *</label><select id="account-type" value={draft.type} disabled={saving || typeOptions.length < 2} onChange={event => change('type', event.target.value)}>
          {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="mg-field"><label htmlFor="account-store">Cơ sở{draft.type !== 'company' && ' *'}</label><select id="account-store" value={draft.store_id} disabled={saving} onChange={event => change('store_id', event.target.value)}>
          <option value="">{draft.type === 'company' ? 'Toàn công ty (dùng chung mọi cơ sở)' : 'Chọn cơ sở'}</option>{storeMissing && <option value={draft.store_id}>{account?.store_name || `Cơ sở #${draft.store_id}`}</option>}
          {stores.map(store => <option key={store.id} value={String(store.id)}>{store.name}</option>)}</select></div>
        {!isBank && <div className="mg-field mg-field-wide"><label htmlFor="account-cash-name">Tên két / nội dung</label><input id="account-cash-name" value={draft.name} maxLength={191} disabled={saving}
          placeholder={account ? `Két tiền mặt #${account.id}` : 'VD: Két quầy lễ tân'} onChange={event => change('name', event.target.value)} /><small>Để trống sẽ hiện “Két tiền mặt #số”.</small></div>}
        {isBank && <>
          <div className="mg-field"><label htmlFor="account-bank-name">Ngân hàng *</label><input id="account-bank-name" value={draft.bank_name} maxLength={191} disabled={saving} onChange={event => change('bank_name', event.target.value)} /></div>
          <div className="mg-field"><label htmlFor="account-owner-name">Chủ tài khoản *</label><SuggestionInput id="account-owner-name" value={draft.owner_name} suggestions={ownerSuggestions} dismissalKey="himoto:account-owner:hidden-suggestions:v1" disabled={saving} onChange={value => change('owner_name', value)} /><small>Gõ mới hoặc chọn gợi ý. Nút × chỉ xóa gợi ý trên trình duyệt này.</small></div>
          <div className="mg-field"><label htmlFor="account-number">Số tài khoản *</label><input id="account-number" value={draft.account_number} maxLength={191} disabled={saving} onChange={event => change('account_number', event.target.value)} /></div>
        </>}
        <div className="mg-field"><label htmlFor="account-opening">Số dư đầu kỳ (₫)</label><input id="account-opening" type="number" step="1" value={draft.opening_balance} disabled={saving} onChange={event => change('opening_balance', event.target.value)} /></div>
        <div className="mg-field"><label htmlFor="account-status">Trạng thái</label><select id="account-status" value={draft.status} disabled={saving} onChange={event => change('status', event.target.value)}><option value="active">Đang sử dụng</option><option value="inactive">Ngừng sử dụng</option></select></div>
      </div>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
        <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button><button type="submit" className="mg-button mg-button-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : account ? 'Lưu tài khoản' : 'Thêm tài khoản'}</button></div></form>
    </Dialog>;
  }
  const title = mode === 'view' ? 'Chi tiết tài khoản' : 'Xóa tài khoản';
  const details: [string, string][] = [['Loại', account.kind === 'cash' ? 'Tiền mặt' : account.owner_type === 'company' ? 'TK công ty' : 'Ngân hàng'],
    ...(isBank ? [['Ngân hàng', account.bank_name || '—'], ['Chủ tài khoản', account.owner_name || '—'], ['Số tài khoản', account.account_number || '—']] as [string, string][] : [['Tên két / nội dung', account.label]] as [string, string][]),
    ['Cơ sở', account.store_name || (account.owner_type === 'company' ? 'Toàn công ty' : '—')],
    ['Trạng thái', account.status.toLowerCase() === 'active' ? 'Đang sử dụng' : 'Ngừng sử dụng'],
    ['Số dư đầu kỳ', money(account.opening_balance)], ['Tổng thu', money(account.income)], ['Tổng chi', money(account.expense)],
    ['Số dư', money(account.balance)], ['Số phiếu', String(account.voucher_count)]];
  return <Dialog title={title} subtitle={account.label} onClose={close} className={mode === 'view' ? 'mg-account-dialog' : ''}>
    {mode === 'view' && <><div className="mg-dialog-body"><ContractSectionTabs prefix="account" sections={VIEW_TABS} active={tab} onChange={setTab} />
      <div role="tabpanel" id={`account-panel-${tab}`} aria-labelledby={`account-tab-${tab}`}>
        {tab === 'info' ? <dl className="mg-detail-grid">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <AccountVouchers account={account} />}</div></div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button></div></>}
    {mode === 'delete' && <><div className="mg-dialog-body"><p>Xóa vĩnh viễn <strong>{account.label}</strong>? Chỉ xóa được tài khoản chưa có phiếu thu/chi nào. Nếu đã có phiếu, hãy chuyển sang “Ngừng sử dụng”.</p>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button><button type="button" className="mg-button mg-button-danger" disabled={saving} onClick={() => void run(() => deleteCashbookAccount(account))}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Trash2 size={16} />}{saving ? 'Đang xóa…' : 'Xóa tài khoản'}</button></div></>}
  </Dialog>;
}

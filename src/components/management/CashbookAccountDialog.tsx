'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, LoaderCircle, Trash2 } from 'lucide-react';
import { CashbookAccount, CashbookAccountVoucher, deleteCashbookAccount, loadCashbookAccountVouchers, updateCashbookAccount } from '@/lib/management/cashbook-repository';
import { ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { Dialog } from './Dialog';

export type AccountDialogMode = 'view' | 'edit' | 'delete';
const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;

const VIEW_TABS = [{ id: 'info', label: 'Chi tiết' }, { id: 'vouchers', label: 'Danh sách thu chi' }] as const;
type ViewTab = (typeof VIEW_TABS)[number]['id'];

function VoucherColumn({ title, kind, rows }: { title: string; kind: 'income' | 'expense'; rows: CashbookAccountVoucher[] }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return <section className="mg-account-voucher-col" aria-label={title}>
    <h3>{title}<span className="mg-title-count">{rows.length}</span></h3>
    <div className="mg-table-scroll"><table className="mg-table"><thead><tr><th scope="col">Ngày</th><th scope="col">Hợp đồng / nội dung</th><th scope="col" className="mg-align-right">Số tiền</th></tr></thead>
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

interface Props { account: CashbookAccount; mode: AccountDialogMode; onClose: () => void; onChanged: () => void }
export function CashbookAccountDialog({ account, mode, onClose, onChanged }: Props) {
  const isBank = account.kind === 'bank';
  const [draft, setDraft] = useState({ bank_name: account.bank_name || '', owner_name: account.owner_name || '', account_number: account.account_number || '',
    status: account.status.toLowerCase() === 'active' ? 'active' : 'inactive', opening_balance: String(account.opening_balance) });
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
    if (draft.opening_balance.trim() === '' || !Number.isFinite(opening)) { setError('Số dư đầu kỳ không hợp lệ.'); return; }
    if (isBank && (!draft.bank_name.trim() || !draft.owner_name.trim() || !draft.account_number.trim())) { setError('Nhập đủ ngân hàng, chủ tài khoản và số tài khoản.'); return; }
    void run(() => updateCashbookAccount(account, { status: draft.status as 'active' | 'inactive', opening_balance: opening,
      ...(isBank ? { bank_name: draft.bank_name.trim(), owner_name: draft.owner_name.trim(), account_number: draft.account_number.trim() } : {}) }));
  }
  const close = () => { if (!busy.current) onClose(); };
  const title = mode === 'view' ? 'Chi tiết tài khoản' : mode === 'edit' ? 'Sửa tài khoản' : 'Xóa tài khoản';
  const details: [string, string][] = [['Loại', account.kind === 'cash' ? 'Tiền mặt' : account.owner_type === 'company' ? 'TK công ty' : 'Ngân hàng'],
    ...(isBank ? [['Ngân hàng', account.bank_name || '—'], ['Chủ tài khoản', account.owner_name || '—'], ['Số tài khoản', account.account_number || '—']] as [string, string][] : [['Két', account.label]] as [string, string][]),
    ['Cơ sở', account.store_name || (account.owner_type === 'company' ? 'Toàn công ty' : '—')],
    ['Trạng thái', account.status.toLowerCase() === 'active' ? 'Đang sử dụng' : 'Ngừng sử dụng'],
    ['Số dư đầu kỳ', money(account.opening_balance)], ['Tổng thu', money(account.income)], ['Tổng chi', money(account.expense)],
    ['Số dư', money(account.balance)], ['Số phiếu', String(account.voucher_count)]];
  return <Dialog title={title} subtitle={account.label} onClose={close} className={mode === 'view' ? 'mg-account-dialog' : ''}>
    {mode === 'view' && <><div className="mg-dialog-body"><ContractSectionTabs prefix="account" sections={VIEW_TABS} active={tab} onChange={setTab} />
      <div role="tabpanel" id={`account-panel-${tab}`} aria-labelledby={`account-tab-${tab}`}>
        {tab === 'info' ? <dl className="mg-detail-grid">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <AccountVouchers account={account} />}</div></div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button></div></>}
    {mode === 'edit' && <form noValidate onSubmit={submit}><div className="mg-dialog-body"><div className="mg-form-grid">
      {isBank && <>
        <div className="mg-field"><label htmlFor="account-bank-name">Ngân hàng *</label><input id="account-bank-name" value={draft.bank_name} maxLength={191} disabled={saving} onChange={event => change('bank_name', event.target.value)} /></div>
        <div className="mg-field"><label htmlFor="account-owner-name">Chủ tài khoản *</label><input id="account-owner-name" value={draft.owner_name} maxLength={191} disabled={saving} onChange={event => change('owner_name', event.target.value)} /></div>
        <div className="mg-field"><label htmlFor="account-number">Số tài khoản *</label><input id="account-number" value={draft.account_number} maxLength={64} disabled={saving} onChange={event => change('account_number', event.target.value)} /></div>
      </>}
      <div className="mg-field"><label htmlFor="account-opening">Số dư đầu kỳ (₫)</label><input id="account-opening" type="number" step="1" value={draft.opening_balance} disabled={saving} onChange={event => change('opening_balance', event.target.value)} /></div>
      <div className="mg-field"><label htmlFor="account-status">Trạng thái</label><select id="account-status" value={draft.status} disabled={saving} onChange={event => change('status', event.target.value)}><option value="active">Đang sử dụng</option><option value="inactive">Ngừng sử dụng</option></select></div>
    </div>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button><button type="submit" className="mg-button mg-button-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : 'Lưu tài khoản'}</button></div></form>}
    {mode === 'delete' && <><div className="mg-dialog-body"><p>Xóa vĩnh viễn <strong>{account.label}</strong>? Chỉ xóa được tài khoản chưa có phiếu thu/chi nào. Nếu đã có phiếu, hãy chuyển sang “Ngừng sử dụng”.</p>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button><button type="button" className="mg-button mg-button-danger" disabled={saving} onClick={() => void run(() => deleteCashbookAccount(account))}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Trash2 size={16} />}{saving ? 'Đang xóa…' : 'Xóa tài khoản'}</button></div></>}
  </Dialog>;
}

'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { CalendarPlus, LoaderCircle } from 'lucide-react';
import { batteryPaymentAccounts, batteryRequest, BatteryRequestError, BATTERY_COLLECTION_METHODS, type BatteryCollectionMethod } from '@/lib/management/battery-contracts';
import type { BatteryActionInput, BatteryWorkflowContext } from '@/lib/management/battery-workflow';
import { addRentalMonths } from '@/lib/management/contract-billing';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { Dialog } from '@/components/management/Dialog';
import { useManagement } from '@/components/management/ManagementProvider';
import { BatteryTelegramPanel } from './BatteryTelegramPanel';

export type BatteryWorkflowMode = 'renew' | 'return' | 'history';
const now = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
const dateLabel = (value?: string) => value ? formatDateTime(value.length === 16 ? value + ':00+07:00' : value) : 'Chưa có';
const group = (value: string) => value ? Number(value).toLocaleString('vi-VN') : '';

export function BatteryWorkflowDialog({ id, code, initialMode, onClose, onSaved }: { id: number; code: string; initialMode: BatteryWorkflowMode; onClose: () => void; onSaved: () => void }) {
  const { notify, can } = useManagement();
  const [context, setContext] = useState<BatteryWorkflowContext | null>(null);
  const [mode, setMode] = useState<BatteryWorkflowMode | 'collect_renewal'>(initialMode);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [telegramRequestId, setTelegramRequestId] = useState('');
  const [unit, setUnit] = useState<'month' | 'day'>('month'), [count, setCount] = useState('1');
  const [endsAt, setEndsAt] = useState(''), [returnedAt, setReturnedAt] = useState(now);
  const [amount, setAmount] = useState(''), [amountTouched, setAmountTouched] = useState(false);
  const [note, setNote] = useState(''), [choice, setChoice] = useState<'' | 'received' | 'unpaid'>('');
  const [method, setMethod] = useState<BatteryCollectionMethod>('cash'), [accountId, setAccountId] = useState(''), [paidAt, setPaidAt] = useState(now);
  const [renewalId, setRenewalId] = useState(''), [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false), requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    const controller = new AbortController();
    batteryRequest<BatteryWorkflowContext>(`/api/auth/battery-contracts/${id}/actions`, 'GET', undefined, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setContext(data);
      setUnit(data.contract.price_unit === 'ngày' ? 'day' : 'month');
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được hợp đồng pin.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  const contract = context?.contract;
  const base = contract?.ends_at || contract?.starts_at;
  const numberCount = Number(count), validCount = /^\d+$/.test(count) && numberCount >= 1 && numberCount <= (unit === 'month' ? 120 : 365);
  useEffect(() => {
    if (!base || !validCount || mode !== 'renew') return;
    const next = unit === 'month' ? addRentalMonths(base, numberCount) : new Date(Date.parse(base + '+07:00') + numberCount * 86400000 + 7 * 3600000).toISOString().slice(0, 16);
    setEndsAt(next);
    if (!amountTouched) setAmount(contract?.rent_price != null && (unit === 'month' && contract.price_unit === 'tháng' || unit === 'day' && contract.price_unit === 'ngày') ? String(contract.rent_price * numberCount) : '');
  }, [base, validCount, mode, unit, numberCount, amountTouched, contract?.rent_price, contract?.price_unit]);
  const accounts = context ? batteryPaymentAccounts(context.accounts, context.contract.store_id, method) : [];
  const effectiveAccount = accountId || (accounts.length === 1 ? String(accounts[0].id) : '');
  const fee = Number(amount), hasFee = /^\d+$/.test(amount) && fee > 0;
  const collecting = mode === 'collect_renewal' || mode === 'renew' && hasFee && choice === 'received';
  const title = mode === 'renew' ? 'Gia hạn pin / sạc' : mode === 'return' ? 'Trả pin / sạc' : mode === 'collect_renewal' ? 'Thu nợ gia hạn pin / sạc' : 'Lịch sử pin / sạc';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!context || mode === 'history' || lock.current || uncertain) return;
    if (mode === 'renew' && (!endsAt || endsAt <= (base || '') || !/^\d+$/.test(amount))) { setError('Nhập ngày kết thúc mới sau hạn hiện tại và chi phí gia hạn.'); return; }
    if (mode === 'renew' && hasFee && !choice) { setError('Chọn đã thực nhận hoặc chưa nhận tiền gia hạn.'); return; }
    if (collecting && (!hasFee || !accounts.some(a => a.id === Number(effectiveAccount)))) { setError('Nhập số tiền và chọn tài khoản thực nhận đúng cơ sở.'); return; }
    if (mode === 'return' && !confirmed) { setError('Xác nhận đã nhận lại pin / sạc từ khách.'); return; }
    const common = { revision: context.contract.revision, request_id: requestId.current, note: note.trim() };
    const receipt = { method: method as 'cash' | 'transfer' | 'company_transfer', account_id: Number(effectiveAccount), paid_at: paidAt };
    const input: BatteryActionInput = mode === 'renew' ? { ...common, action: 'renew', ends_at: endsAt, amount: fee, ...(collecting ? { receipt } : {}) }
      : mode === 'return' ? { ...common, action: 'return', returned_at: returnedAt }
      : { ...common, action: 'collect_renewal', renewal_id: renewalId, amount: fee, receipt };
    lock.current = true; setSaving(true); setError('');
    try {
      const result = await batteryRequest<BatteryWorkflowContext>(`/api/auth/battery-contracts/${id}/actions`, 'POST', input);
      setContext({ ...result, accounts: context.accounts }); setMode('history');
      if (mode === 'return') setTelegramRequestId(input.request_id);
      requestId.current = crypto.randomUUID(); setNote('');
      notify(mode === 'return' ? `Đã nhận lại pin / sạc · ${code}. Kiểm tra và gửi Telegram.` : collecting ? `Đã lưu và ghi phiếu thu gia hạn · ${code}.` : `Đã gia hạn pin / sạc · ${code}${hasFee ? ' · còn công nợ gia hạn' : ''}.`);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được thao tác.');
      if (!(cause instanceof BatteryRequestError) || cause.status === 0 || cause.status >= 500 || cause.status === 409) setUncertain(true);
    } finally { lock.current = false; setSaving(false); }
  }
  return <Dialog title={`${title} · ${code}`} className="mg-renewal-dialog" onClose={() => { if (!lock.current) onClose(); }}>
    <form onSubmit={submit}><div className="mg-dialog-body">
      {loading && <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải hợp đồng và lịch sử…</p>}
      {context && <>
        <dl className="mg-renewal-facts"><div><dt>Khách hàng</dt><dd>{context.contract.customer_name}</dd></div><div><dt>Pin / sạc</dt><dd>{context.contract.battery_name}</dd></div>
          <div><dt>Cơ sở</dt><dd>{context.contract.store_name}</dd></div><div><dt>Hạn hiện tại</dt><dd>{dateLabel(context.contract.ends_at)}</dd></div></dl>
        {mode === 'history' ? <>
          <dl className="mg-payment-totals"><div><dt>Tổng phí gia hạn mới</dt><dd>{formatMoney(context.renewal_amount)}</dd></div><div><dt>Đã thu gia hạn</dt><dd>{formatMoney(context.renewal_collected)}</dd></div><div><dt>Nợ gia hạn</dt><dd>{formatMoney(context.renewal_remaining)}</dd></div></dl>
          <p className="mg-composer-hint">Số liệu gia hạn tính từ các lượt mới; tiền và hồ sơ nhập từ app cũ giữ trong hợp đồng và Sổ quỹ.</p>
          {!context.history.length && <p>Chưa có thao tác gia hạn hoặc trả pin / sạc mới.</p>}
          {[...context.history].reverse().map(entry => <article className="mg-battery-history-entry" key={entry.request_id}>
            <strong>{entry.action === 'renew' ? 'Gia hạn' : entry.action === 'return' ? 'Trả pin / sạc' : 'Thu nợ gia hạn'}</strong>
            <p>{dateLabel(entry.at)} · {entry.actor_name}</p>
            {entry.action === 'renew' && <><p>{dateLabel(entry.before_ends_at)} → {dateLabel(entry.ends_at)}</p><p>Phí: {formatMoney(entry.amount || 0)} · Đã thu: {formatMoney(entry.collected || 0)} · Còn thiếu: {formatMoney(entry.remaining || 0)}</p>
              {Number(entry.remaining) > 0 && can('contracts.renew') && context.contract.status !== 'cancelled' && <button type="button" className="mg-button" onClick={() => { setMode('collect_renewal'); setRenewalId(entry.request_id); setAmount(String(entry.remaining)); setNote(''); setError(''); requestId.current = crypto.randomUUID(); }}>Thu tiền gia hạn</button>}</>}
            {entry.action === 'return' && <p>Nhận lại lúc: {dateLabel(entry.returned_at)}</p>}
            {entry.action === 'collect_renewal' && <p>Đã thu: {formatMoney(entry.collected || 0)}</p>}
            {entry.transaction_id && <p>Phiếu thu #{entry.transaction_id}{entry.receipt ? ` · ${BATTERY_COLLECTION_METHODS.find(m => m.value === entry.receipt?.method)?.label}` : ''}</p>}
            {entry.note && <p className="mg-battery-history-note">Ghi chú: {entry.note}</p>}
            {entry.action === 'return' && can('contracts.return') && <button type="button" className="mg-button" onClick={() => setTelegramRequestId(entry.request_id)}>Gửi / xem Telegram</button>}
          </article>)}
          {telegramRequestId && can('contracts.return') && <BatteryTelegramPanel batteryId={id} requestId={telegramRequestId} />}
        </> : <fieldset className="mg-payment-fields" disabled={saving || uncertain}>
          <legend>{title}</legend>
          {mode === 'renew' && <>
            <label>Gia hạn theo<select value={unit} onChange={e => { setUnit(e.target.value as 'month' | 'day'); setAmountTouched(false); }}><option value="month">Tháng</option><option value="day">Ngày</option></select></label>
            <label>Số kỳ gia hạn<input type="number" min={1} max={unit === 'month' ? 120 : 365} required value={count} onChange={e => { setCount(e.target.value); setAmountTouched(false); }} /></label>
            <label className="mg-field-wide">Ngày kết thúc mới (24h)<DateTime24Controls id="battery-renewal-end" label="Ngày kết thúc mới" value={endsAt} onChange={setEndsAt} /></label>
            <p className="mg-composer-hint mg-field-wide">Giá hợp đồng: {context.contract.rent_price == null ? 'Chưa có' : `${formatMoney(context.contract.rent_price)} / ${context.contract.price_unit || 'kỳ'}`}. Có thể sửa chi phí thực tế bên dưới.</p>
          </>}
          {mode === 'return' ? <>
            <label className="mg-field-wide">Ngày giờ nhận lại (24h)<DateTime24Controls id="battery-returned-at" label="Ngày giờ nhận lại" value={returnedAt} onChange={setReturnedAt} /></label>
            <label className="mg-field-wide mg-checkbox"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />Đã nhận lại pin / sạc từ khách</label>
            <p className="mg-composer-hint mg-field-wide">Lưu trạng thái đã trả và lịch sử nhận lại. Tiền cọc và khoản còn nợ được đối chiếu riêng trong Sổ quỹ.</p>
            {context.renewal_remaining > 0 && <p className="mg-field-error mg-field-wide">Còn nợ gia hạn {formatMoney(context.renewal_remaining)}. Khoản nợ vẫn giữ sau khi nhận lại pin / sạc.</p>}
          </> : <>
            <label className="mg-field-wide">{mode === 'renew' ? 'Chi phí gia hạn (VNĐ)' : 'Số tiền thực nhận (VNĐ)'}<input inputMode="numeric" required value={group(amount)} onChange={e => { setAmount(e.target.value.replace(/\D/g, '').slice(0, 13)); setAmountTouched(true); }} /></label>
            {mode === 'renew' && hasFee && <>
              <label className="mg-field-wide mg-checkbox"><input type="radio" name="battery-collection" checked={choice === 'received'} onChange={() => setChoice('received')} required />Đã thực nhận tiền gia hạn — ghi phiếu thu cùng lúc lưu</label>
              <label className="mg-field-wide mg-checkbox"><input type="radio" name="battery-collection" checked={choice === 'unpaid'} onChange={() => setChoice('unpaid')} required />Chưa nhận tiền — ghi công nợ gia hạn</label>
            </>}
            {collecting && <>
              <label className="mg-field-wide">Hình thức thanh toán<select aria-label="Hình thức thanh toán" value={method} onChange={e => { setMethod(e.target.value as BatteryCollectionMethod); setAccountId(''); }}>{BATTERY_COLLECTION_METHODS.filter(m => m.value).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
              <label className="mg-field-wide">Tài khoản nhận<select aria-label="Tài khoản nhận" value={effectiveAccount} onChange={e => setAccountId(e.target.value)} required><option value="">Chọn tài khoản nhận</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
              {!accounts.length && <p className="mg-field-error mg-field-wide">Chưa có tài khoản đang hoạt động phù hợp với hình thức và cơ sở đã chọn.</p>}
              <label className="mg-field-wide">Ngày giờ thu (24h)<DateTime24Controls id="battery-paid-at" label="Ngày giờ thu" value={paidAt} onChange={setPaidAt} /></label>
            </>}
          </>}
          <label className="mg-field-wide">Ghi chú<textarea rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
        </fieldset>}
      </>}
      {error && <p className="mg-field-error" role="alert">{error}</p>}
      {uncertain && <p role="status">Đóng và mở lại Lịch sử để kiểm tra kết quả trước khi thao tác tiếp.</p>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>{mode === 'history' ? 'Đóng' : 'Hủy'}</button>
      {context && mode !== 'history' && <button type="submit" className="mg-button mg-button-primary" disabled={loading || saving || uncertain || collecting && !accounts.length}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <CalendarPlus size={16} />}{saving ? 'Đang lưu…' : mode === 'return' ? 'Xác nhận trả pin / sạc' : collecting ? 'Lưu và thu tiền gia hạn' : 'Lưu gia hạn'}</button>}
    </div></form>
  </Dialog>;
}

'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, RotateCcw, Wallet } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { formatMoney } from '@/lib/formatters';
import { PAYABLE_STATUSES, RENEWABLE_STATUSES, PAYMENT_METHODS, PaymentContext, PaymentInput, PaymentMethod, PaymentRequestError, loadPaymentContext, paymentAccounts, saveContractPayment, vietnamPaymentTime } from '@/lib/management/contract-payments';

export function ContractPaymentDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { acceptContractPayment, notify, selectStore } = useManagement();
  const router = useRouter();
  const [context, setContext] = useState<PaymentContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [accountId, setAccountId] = useState('');
  const [paidAt, setPaidAt] = useState(vietnamPaymentTime);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<PaymentInput | null>(null);
  const [purpose, setPurpose] = useState<'debt' | 'renewal'>('debt');
  const [itemId, setItemId] = useState('');
  const [returnAt, setReturnAt] = useState('');
  const busy = useRef(false);
  const storageKey = `himoto-contract-payment-${id}`;

  useEffect(() => {
    let restored = false;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as PaymentInput | null;
      if (saved && typeof saved.request_id === 'string' && typeof saved.amount === 'string' && PAYMENT_METHODS.some(item => item.value === saved.method)) {
        restored = true;
        setPending(saved); setAmount(saved.amount); setMethod(saved.method); setAccountId(String(saved.account_id)); setPaidAt(saved.paid_at); setNote(saved.note);
        setPurpose(saved.purpose === 'renewal' ? 'renewal' : 'debt'); setItemId(saved.item_id ? String(saved.item_id) : ''); setReturnAt(saved.return_at || '');
        setError('Có lần thu chưa xác nhận. Thử lại lần thu này để kiểm tra và tránh ghi trùng.');
      }
    } catch { /* A malformed local draft is never submitted automatically. */ }
    const controller = new AbortController();
    loadPaymentContext(id, controller.signal).then(fresh => { setContext(fresh); if (!restored) { setNote(`Gia hạn hợp đồng_${fresh.code}`); if (fresh.remaining === 0 && RENEWABLE_STATUSES.includes(fresh.status) && fresh.items.length) setPurpose('renewal'); } }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được thanh toán.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, storageKey]);

  const accounts = context ? paymentAccounts(context, method) : [];
  const effectiveAccount = accountId || (accounts.length === 1 ? String(accounts[0].id) : '');
  const payable = Boolean(context && PAYABLE_STATUSES.includes(context.status) && context.remaining !== null && context.remaining > 0);
  const renewable = Boolean(context && RENEWABLE_STATUSES.includes(context.status) && context.items.length && context.total_amount !== null && context.paid_amount !== null);
  const effectiveItemId = itemId || (context?.items.length === 1 ? String(context.items[0].id) : '');
  const selectedItem = context?.items.find(item => String(item.id) === effectiveItemId);
  const canCollect = purpose === 'renewal' ? renewable : payable;
  const locked = saving || Boolean(pending);
  const money = (value: number | null) => value === null ? 'Chưa đối chiếu' : formatMoney(value);

  async function refresh() {
    setLoading(true);
    try { const fresh = await loadPaymentContext(id); setContext(fresh); acceptContractPayment(fresh); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử.'); }
    finally { setLoading(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !context) return;
    const input: PaymentInput = pending || { request_id: crypto.randomUUID(), revision: context.revision, amount, method, account_id: Number(effectiveAccount), paid_at: paidAt, note: note.trim(),
      ...(purpose === 'renewal' ? { purpose: 'renewal', item_id: Number(effectiveItemId), item_revision: selectedItem?.revision, return_at: returnAt } : {}) };
    if (!pending && (!canCollect || !/^[1-9]\d{0,12}$/.test(amount) || (purpose === 'debt' && (context.remaining === null || Number(amount) > context.remaining)) || !accounts.some(account => account.id === input.account_id))) {
      setError('Kiểm tra số tiền còn thiếu và tài khoản nhận.'); return;
    }
    if (!pending && purpose === 'renewal' && (!selectedItem?.return_at || !returnAt || new Date(`${returnAt}+07:00`).getTime() <= new Date(selectedItem.return_at).getTime())) { setError('Chọn xe và ngày hẹn trả mới sau ngày hẹn trả hiện tại.'); return; }
    // Persist before sending. A lost response must retry the same receipt, even after closing/reloading.
    try { sessionStorage.setItem(storageKey, JSON.stringify(input)); }
    catch { setError('Trình duyệt không lưu được lần thu. Cho phép lưu dữ liệu trang rồi thử lại.'); return; }
    busy.current = true; setSaving(true); setPending(input); setError(''); setSuccess('');
    try {
      const result = await saveContractPayment(id, input);
      sessionStorage.removeItem(storageKey); setPending(null); setContext(result.context); acceptContractPayment(result.context);
      setAmount(''); setNote(`Gia hạn hợp đồng_${result.context.code}`); setPaidAt(vietnamPaymentTime());
      const message = `Đã xác nhận ${input.purpose === 'renewal' ? 'gia hạn và ' : ''}phiếu Thu #${result.transaction_id} · ${formatMoney(Number(input.amount))}.`;
      if (input.purpose === 'renewal') setReturnAt('');
      setSuccess(message); notify(message);
      if (result.company_transfer) { selectStore('all'); onClose(); router.push(`/contracts/vat?contract_id=${id}`); }
    } catch (cause) {
      const definite = cause instanceof PaymentRequestError && cause.status >= 400 && cause.status < 500;
      if (definite) {
        sessionStorage.removeItem(storageKey); setPending(null);
        try { const fresh = await loadPaymentContext(id); setContext(fresh); acceptContractPayment(fresh); } catch { setContext(null); }
      }
      setError(`${cause instanceof Error ? cause.message : 'Chưa xác nhận được thanh toán.'}${definite ? '' : ' Giữ nguyên lần thu và bấm Thử lại để tránh ghi trùng.'}`);
    } finally { busy.current = false; setSaving(false); }
  }

  return <Dialog title={`Thanh toán hợp đồng ${context?.code || `#${id}`}`} subtitle="Mỗi lần thanh toán được lưu thành một phiếu Thu trong Sổ quỹ / Sổ két." className="mg-payment-dialog" onClose={() => { if (!busy.current) onClose(); }}>
    <form onSubmit={submit}>
      <div className="mg-dialog-body">
        {loading && <p role="status"><LoaderCircle size={18} className="mg-spin" /> Đang tải thanh toán…</p>}
        {context && <>
          <dl className="mg-payment-totals"><div><dt>Tiền hợp đồng</dt><dd>{money(context.total_amount)}</dd></div><div><dt>Tổng đã thu</dt><dd>{money(context.paid_amount)}</dd></div><div><dt>Còn thiếu</dt><dd>{money(context.remaining)}</dd></div></dl>
          {(payable || renewable || pending) && <label className="mg-payment-purpose">Nghiệp vụ<select aria-label="Nghiệp vụ" value={purpose} disabled={locked || loading} onChange={event => { setPurpose(event.target.value as 'debt' | 'renewal'); setError(''); }}><option value="debt" disabled={!payable}>Thu công nợ còn thiếu</option><option value="renewal" disabled={!renewable}>Thu tiền gia hạn</option></select></label>}
          {(canCollect || pending) ? <fieldset className="mg-payment-fields" disabled={locked || loading}>
            <legend>Ghi nhận lần thanh toán</legend>
            {purpose === 'renewal' && <>
              <label className="mg-field-wide">Xe cần gia hạn<select aria-label="Xe cần gia hạn" required value={effectiveItemId} onChange={event => { setItemId(event.target.value); setReturnAt(''); }}><option value="">Chọn xe</option>{context.items.map(item => <option key={item.id} value={item.id}>{item.name || 'Xe'} · {item.license || `#${item.vehicle_id}`}</option>)}</select></label>
              {selectedItem && <p className="mg-field-wide">Hẹn trả hiện tại: <strong>{selectedItem.return_at ? new Date(selectedItem.return_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa có ngày hẹn trả'}</strong>. Tiền gia hạn đã ghi: {money(selectedItem.renewal_amount)}.</p>}
              <label className="mg-field-wide">Ngày hẹn trả mới<input aria-label="Ngày hẹn trả mới" type="datetime-local" required value={returnAt} onChange={event => setReturnAt(event.target.value)} /></label>
              <p className="mg-field-wide">Phí gia hạn mới được cộng vào tiền hợp đồng và tổng đã thu. Chỉ đổi ngày trả của xe đã chọn.</p>
            </>}
            <label>Số tiền thu (VNĐ)<input aria-label="Số tiền thu (VNĐ)" inputMode="numeric" pattern="[1-9][0-9]{0,12}" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="Nhập số tiền" /></label>
            <label>Ngày giờ thu<input aria-label="Ngày giờ thu" type="datetime-local" required value={paidAt} onChange={event => setPaidAt(event.target.value)} /></label>
            <label className="mg-field-wide">Hình thức thanh toán<select aria-label="Hình thức thanh toán" value={method} onChange={event => { setMethod(event.target.value as PaymentMethod); setAccountId(''); }}>
              {PAYMENT_METHODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select></label>
            <label className="mg-field-wide">Tài khoản nhận<select aria-label="Tài khoản nhận" required value={effectiveAccount} onChange={event => setAccountId(event.target.value)}>
              <option value="">Chọn tài khoản nhận</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select></label>
            {!accounts.length && <p className="mg-field-wide mg-field-error">{method === 'company_transfer' ? 'Chưa có tài khoản công ty được cấu hình. Cần bổ sung thông tin ngân hàng trước khi thu.' : 'Chưa có tài khoản nhận đang hoạt động tại cơ sở của hợp đồng.'}</p>}
            <label className="mg-field-wide">Nội dung thu / chuyển khoản<textarea aria-label="Nội dung thu / chuyển khoản" maxLength={2000} value={note} onChange={event => setNote(event.target.value)} rows={2} /></label>
            {method === 'company_transfer' && <p className="mg-field-wide">Sau khi ghi nhận, hợp đồng sẽ có trong Hợp đồng VAT và chuyển đến danh sách đó.</p>}
          </fieldset> : <p>{context.remaining === null ? 'Cần đối chiếu số liệu tiền trước khi thu.' : context.remaining === 0 ? 'Không còn công nợ theo số liệu hiện có. Chọn Thu tiền gia hạn nếu tiếp tục thuê xe.' : 'Trạng thái hợp đồng này chưa cho phép thu tiền.'}</p>}
          <div className="mg-payment-history-heading"><h3>Lịch sử phiếu Thu ({context.history.length})</h3><button type="button" className="mg-button" disabled={saving || loading} onClick={() => void refresh()}><RotateCcw size={15} />Làm mới</button></div>
          <ul className="mg-payment-history">{context.history.map(receipt => <li key={receipt.id}><strong>Phiếu Thu #{receipt.id} · {formatMoney(receipt.amount)}</strong><span>{new Date(receipt.paid_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · {receipt.method}</span><span>{receipt.account || 'Chưa xác định tài khoản'} · {receipt.actor || '—'}</span><p>{receipt.note}</p>{receipt.renewal && <span>Gia hạn {receipt.renewal.license || receipt.renewal.vehicle_name} đến {new Date(receipt.renewal.return_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>}</li>)}</ul>
          {!context.history.length && <p>Chưa có phiếu Thu được duyệt.</p>}
          <Link href="/cashbook" aria-disabled={saving} onClick={event => { if (busy.current) event.preventDefault(); else onClose(); }}>Mở Sổ quỹ / Sổ két</Link>
        </>}
        {success && <p className="mg-payment-success" role="status">{success}</p>}
        {error && <p className="mg-field-error" role="alert">{error}</p>}
        {!context && !loading && <button type="button" className="mg-button" onClick={() => void refresh()}>Tải lại thông tin</button>}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
        {(canCollect || pending) && <button type="submit" className="mg-button mg-button-primary" disabled={saving || loading || !context || (!pending && !accounts.length)}>{saving ? <LoaderCircle className="mg-spin" size={16} /> : <Wallet size={16} />}{saving ? 'Đang ghi nhận…' : pending ? 'Thử lại lần thu này' : purpose === 'renewal' ? 'Thu tiền và gia hạn' : 'Ghi nhận thanh toán'}</button>}
      </div>
    </form>
  </Dialog>;
}

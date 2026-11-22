'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { PAYMENT_METHODS, vietnamPaymentTime, type PaymentMethod } from '@/lib/management/contract-payments';
import { depositRefundStatus, type DepositRefundRequest, type DepositRefundState } from '@/lib/management/deposit-refunds';
import { prepareRecordPhoto } from '@/lib/management/record-photos';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { Dialog } from './Dialog';

export const depositRefundUrl = '/api/auth/deposit-refunds';

export async function depositRefundRequest<T>(query = '', options: RequestInit = {}): Promise<T> {
  const response = await fetch(depositRefundUrl + query, { cache: 'no-store', ...options });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw Error(result?.message || 'Chưa tải được thông tin hoàn cọc. Vui lòng thử lại.');
  return result.data;
}

export function DepositRefundDialog({ itemId, onClose, onSaved, onTelegram }: {
  itemId: number; onClose: () => void; onSaved: () => void; onTelegram: () => void;
}) {
  const [state, setState] = useState<DepositRefundState>();
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [replaceId, setReplaceId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [accountId, setAccountId] = useState('');
  const [paidAt, setPaidAt] = useState(vietnamPaymentTime);
  const [amount, setAmount] = useState<string>();
  const [reason, setReason] = useState('');
  const attempt = useRef<{ key: string; file: File; fields: string } | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void depositRefundRequest<DepositRefundState>(`?item_id=${itemId}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setState(value); })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [itemId, refresh]);
  useEffect(() => { if (error) statusRef.current?.focus(); }, [error]);
  const original = state?.vouchers.find(voucher => String(voucher.id) === replaceId);
  const pending = state?.requests.find(row => row.status === 'pending');
  const accounts = state?.accounts.filter(account => account.method === method) ?? [];
  const selectedAccount = accountId || (accounts.length === 1 ? String(accounts[0].id) : '');
  const max = (state?.held ?? 0) + (original?.amount ?? 0);
  const suggestedAmount = amount ?? (max > 0 ? String(max) : '');
  const sameDay = paidAt.slice(0, 10) === vietnamPaymentTime().slice(0, 10);
  const review = Boolean(state?.vouchers.length || state?.review_reason || !sameDay || method !== 'cash');
  const noAmount = max <= 0 && state?.vouchers.length;
  const block = state?.blocked_reason || (pending ? 'Hợp đồng đang có yêu cầu chờ kế toán duyệt.' :
    !state?.can_submit ? 'Tài khoản chưa có quyền bổ sung hoàn cọc cho cơ sở này.' :
    !accounts.length ? 'Chưa có két hoặc tài khoản chi đang hoạt động cho hình thức đã chọn.' : '');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || busy || loading || block || noAmount) return;
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const file = form.get('evidence');
    if (!(file instanceof File) || !file.size) { setError('Chọn ảnh chứng từ hoàn cọc.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(paidAt)) { setError('Nhập đầy đủ ngày giờ chi thực tế.'); return; }
    if (!/^[1-9]\d{0,12}$/.test(suggestedAmount) || Number(suggestedAmount) > max) {
      setError('Số tiền phải lớn hơn 0 và trong số cọc còn được hoàn.'); return;
    }
    if (!reason.trim()) { setError('Nhập lý do bổ sung hoặc sửa phiếu chi.'); return; }
    const fields = { item_id: String(itemId), amount: suggestedAmount, method, account_id: selectedAccount, paid_at: paidAt,
      reason: reason.trim(), replaces_id: replaceId, replaces_revision: original?.revision || '' };
    const fingerprint = JSON.stringify(fields);
    if (attempt.current?.fields !== fingerprint || attempt.current.file !== file) {
      attempt.current = { key: crypto.randomUUID(), fields: fingerprint, file };
    }
    const active = attempt.current;
    const formElement = event.currentTarget;
    setBusy(true);
    try {
      const prepared = await prepareRecordPhoto(file);
      form.set('evidence', prepared);
      form.set('id', active.key);
      for (const [key, value] of Object.entries(fields)) form.set(key, value);
      const result = await depositRefundRequest<DepositRefundRequest>('', { method: 'POST', body: form });
      attempt.current = null;
      formElement.reset();
      setAmount(undefined); setReason(''); setReplaceId('');
      setMessage(result.transaction_id ? `Đã ghi phiếu chi #${result.transaction_id}.` : 'Đã chuyển yêu cầu tới kế toán trong Sổ quỹ.');
      setRefresh(value => value + 1);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <Dialog title={state ? `Bổ sung hoàn cọc · ${state.code}` : 'Bổ sung hoàn cọc'} onClose={() => { if (!busy) onClose(); }} dismissOnBackdrop={false}>
    <div className="mg-dialog-body">
      {loading && <p role="status">Đang đối chiếu tiền cọc và phiếu chi…</p>}
      {error && <p ref={statusRef} tabIndex={-1} className="mg-field-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!state && !loading && <button type="button" className="mg-button" onClick={() => setRefresh(value => value + 1)}>Tải lại</button>}
      {state && <>
        <p><strong>Cọc còn giữ {formatMoney(state.held)}</strong></p>
        {state.vouchers.length > 0 && <ul className="mg-operation-picks">{state.vouchers.map(row =>
          <li key={row.id}><span>Phiếu #{row.id} · {formatMoney(row.amount)} · {row.method} · {row.account} · {formatDateTime(row.paid_at)}</span></li>)}</ul>}
        {state.requests.length > 0 && <details open={pending ? true : undefined}>
          <summary>Yêu cầu hoàn cọc ({state.requests.length})</summary>
          <ul className="mg-operation-picks">{state.requests.map(row => <li key={row.id}>
            <strong>{depositRefundStatus[row.status]} · {formatMoney(row.amount)}{row.transaction_id ? ` · Phiếu #${row.transaction_id}` : ''}</strong>
            <span>{row.actor} · {row.account_label} · {row.reason}</span>
            {row.reviewer && <span>{row.reviewer}{row.review_note ? ` · ${row.review_note}` : ''}</span>}
            <a href={`${depositRefundUrl}?evidence=${row.id}`} target="_blank" rel="noreferrer">Xem chứng từ</a>
          </li>)}</ul>
        </details>}
        {block && <p role="status">{block}</p>}
        {state.can_submit && !state.blocked_reason && !pending && <form onSubmit={save}>
          <fieldset disabled={loading || busy} className="mg-form-grid mg-contract-grid-two">
            {state.vouchers.length > 0 && <label className="mg-field mg-field-wide">Thao tác
              <select aria-label="Thao tác" value={replaceId} onChange={event => { setReplaceId(event.target.value); setAmount(undefined); }}>
                <option value="">{state.held > 0 ? 'Bổ sung phần cọc còn giữ' : 'Chọn phiếu chi cần sửa'}</option>
                {state.vouchers.map(row => <option key={row.id} value={row.id}>Sửa phiếu #{row.id} · {formatMoney(row.amount)}</option>)}
              </select>
            </label>}
            <label className="mg-field">Số tiền đã hoàn (VNĐ)
              <input required inputMode="numeric" value={suggestedAmount}
                onChange={event => setAmount(event.target.value.replace(/\D/g, '').slice(0, 13))} />
            </label>
            <label className="mg-field">Hình thức
              <select aria-label="Hình thức" value={method} onChange={event => { setMethod(event.target.value as PaymentMethod); setAccountId(''); }}>
                {PAYMENT_METHODS.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
              </select>
            </label>
            <label className="mg-field mg-field-wide">Két hoặc tài khoản chi
              <select aria-label="Két hoặc tài khoản chi" required value={selectedAccount} onChange={event => setAccountId(event.target.value)}>
                <option value="">Chọn nguồn đã chi</option>
                {accounts.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </label>
            <div className="mg-field mg-field-wide">
              <label htmlFor="deposit-refund-time">Ngày giờ chi thực tế</label>
              <DateTime24Controls id="deposit-refund-time" label="Ngày giờ chi hoàn cọc thực tế" value={paidAt} onChange={setPaidAt} />
            </div>
            <label className="mg-field mg-field-wide">Lý do<textarea value={reason} onChange={event => setReason(event.target.value)} required maxLength={500} /></label>
            <label className="mg-field mg-field-wide">Ảnh chứng từ<input name="evidence" type="file" accept="image/*" required /></label>
          </fieldset>
          {noAmount ? <p role="status">Cọc đã hoàn hết. Chọn phiếu chi cần sửa.</p> : review && <p role="status">{state.review_reason || 'Khoản này sẽ chuyển đến kế toán để duyệt.'}</p>}
          <button type="submit" className="mg-button mg-button-primary" disabled={loading || busy || Boolean(block) || Boolean(noAmount)}
            title={block || (noAmount ? 'Chọn phiếu chi cần sửa.' : undefined)}>
            {busy ? 'Đang lưu…' : review ? 'Gửi kế toán duyệt' : 'Ghi phiếu chi hoàn cọc'}
          </button>
        </form>}
      </>}
    </div>
    <div className="mg-dialog-footer">
      <button type="button" className="mg-button" onClick={onClose} disabled={busy}>Đóng</button>
      {state?.can_send_telegram && state.vouchers.length > 0 && <button type="button" className="mg-button" disabled={busy || loading} onClick={onTelegram}>Xem trước Telegram trả xe</button>}
    </div>
  </Dialog>;
}

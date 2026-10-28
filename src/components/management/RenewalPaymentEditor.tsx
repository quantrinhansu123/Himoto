'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pencil } from 'lucide-react';
import { formatMoney } from '@/lib/formatters';
import { correctRenewalPayment, loadPaymentContext, PAYMENT_METHODS, paymentAccounts, paymentAccountKey, paymentMethodLabel,
  PaymentRequestError, type PaymentContext, type PaymentMethod, type RenewalPaymentCorrection } from '@/lib/management/contract-payments';
import { useManagement } from './ManagementProvider';

export function RenewalPaymentEditor({ orderId, eventKey, receiptId, disabled = false, onSaved, onBusyChange }: {
  orderId: number; eventKey?: string; receiptId?: number; disabled?: boolean;
  onSaved: (context: PaymentContext) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { can, acceptContractPayment, notify } = useManagement();
  const allowed = can('contracts.renew') || can('finance.write');
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [context, setContext] = useState<PaymentContext | null>(null), [error, setError] = useState('');
  const [selected, setSelected] = useState(''), [method, setMethod] = useState<PaymentMethod>('cash'), [accountKey, setAccountKey] = useState(''), [reason, setReason] = useState('');
  const busy = useRef(false), pending = useRef<RenewalPaymentCorrection | null>(null);
  const [uncertain, setUncertain] = useState(false), [retry, setRetry] = useState(0);
  const receipts = (context?.history || []).filter(receipt => receipt.renewal && receipt.type === 'in' && !receipt.deposit && (receiptId !== undefined
    ? receipt.id === receiptId : eventKey === (receipt.renewal.version !== undefined ? `renewal:${orderId}:${receipt.renewal.version}` : `renewal-receipt:${orderId}:${receipt.id}`)));
  const receipt = receipts.find(row => String(row.id) === selected);
  const accounts = context ? paymentAccounts(context, method) : [];
  const account = accounts.find(row => paymentAccountKey(row) === accountKey);

  useEffect(() => {
    if (!open || !allowed) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void loadPaymentContext(orderId, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setContext(value); pending.current = null; setUncertain(false);
      const matching = value.history.filter(row => row.renewal && row.type === 'in' && !row.deposit && (receiptId !== undefined ? row.id === receiptId
        : eventKey === (row.renewal.version !== undefined ? `renewal:${orderId}:${row.renewal.version}` : `renewal-receipt:${orderId}:${row.id}`)));
      const first = matching[0];
      setSelected(first ? String(first.id) : '');
      setMethod(first?.payment_method || 'cash');
      setAccountKey(first?.account_id && first.payment_method ? `${first.payment_method === 'cash' ? 'cash' : 'bank'}:${first.account_id}` : '');
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được phiếu gia hạn.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, allowed, orderId, receiptId, eventKey, retry]);

  if (!allowed) return null;
  async function save() {
    if (busy.current || disabled || !receipt?.revision) return;
    if (!pending.current) {
      if (!account) return setError('Chọn tài khoản thực nhận tiền.');
      if (!reason.trim()) return setError('Nhập lý do sửa thanh toán.');
      pending.current = { request_id: crypto.randomUUID(), transaction_id: receipt.id, revision: receipt.revision,
        method, account_id: account.id, reason: reason.trim() };
    }
    busy.current = true; setSaving(true); onBusyChange?.(true); setError('');
    try {
      const saved = await correctRenewalPayment(orderId, pending.current);
      pending.current = null; setUncertain(false); setContext(saved); acceptContractPayment(saved);
      setOpen(false); setReason('');
      notify(`Đã sửa thanh toán phiếu #${receipt.id}. Số tiền và kỳ gia hạn giữ nguyên.`);
      onSaved(saved);
    } catch (cause) {
      if (cause instanceof PaymentRequestError && cause.status >= 400 && cause.status < 500) { pending.current = null; setUncertain(false); }
      else setUncertain(true);
      setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được sửa thanh toán. Tải lại phiếu để kiểm tra.');
    } finally { busy.current = false; setSaving(false); onBusyChange?.(false); }
  }

  return <div className="mg-renewal-payment-editor">
    {!open ? <button type="button" className="mg-button" disabled={disabled} onClick={() => setOpen(true)}><Pencil size={15}/>Sửa thanh toán</button>
      : <fieldset className="mg-payment-fields" aria-label="Sửa thanh toán gia hạn" disabled={saving || disabled}>
        <legend>Sửa thanh toán gia hạn</legend>
        {loading && <p role="status"><LoaderCircle size={15} className="mg-spin"/> Đang tải phiếu thu…</p>}
        {!loading && context && !receipts.length && <p>Chưa có phiếu thu gia hạn để sửa trong giao dịch này.</p>}
        {!loading && receipts.length > 1 && <label className="mg-field-wide">Phiếu thu<select aria-label="Phiếu thu cần sửa" disabled={uncertain} value={selected} onChange={event => {
          const next = receipts.find(row => row.id === Number(event.target.value));
          setSelected(event.target.value); setMethod(next?.payment_method || 'cash');
          setAccountKey(next?.account_id && next.payment_method ? `${next.payment_method === 'cash' ? 'cash' : 'bank'}:${next.account_id}` : '');
        }}>{receipts.map(row => <option key={row.id} value={row.id}>#{row.id} · {formatMoney(row.amount)} · {row.method}</option>)}</select></label>}
        {!loading && receipt && <>
          <p className="mg-field-wide">Phiếu #{receipt.id} · <strong>{formatMoney(receipt.amount)}</strong><br/>{receipt.method} · {receipt.account || 'Chưa rõ tài khoản'}</p>
          <label className="mg-field-wide">Hình thức thanh toán mới<select aria-label="Hình thức thanh toán mới" disabled={uncertain} value={method} onChange={event => {
            const next = event.target.value as PaymentMethod, nextAccounts = context ? paymentAccounts(context,next) : [];
            setMethod(next); setAccountKey(nextAccounts.length === 1 ? paymentAccountKey(nextAccounts[0]) : '');
          }}>{PAYMENT_METHODS.map(row => <option key={row.value} value={row.value}>{paymentMethodLabel(row.value)}</option>)}</select></label>
          <label className="mg-field-wide">Tài khoản nhận mới<select aria-label="Tài khoản nhận mới" disabled={uncertain} value={accountKey} onChange={event => setAccountKey(event.target.value)}>
            <option value="">Chọn tài khoản thực nhận</option>{accounts.map(row => <option key={paymentAccountKey(row)} value={paymentAccountKey(row)}>{row.label}</option>)}
          </select></label>
          {!accounts.length && <p className="mg-field-wide mg-field-error">Chưa có tài khoản nhận đang hoạt động phù hợp hình thức và cơ sở hợp đồng.</p>}
          <label className="mg-field-wide">Lý do sửa<textarea aria-label="Lý do sửa thanh toán" maxLength={500} disabled={uncertain} value={reason} onChange={event => setReason(event.target.value)}/></label>
          <p className="mg-field-wide">Số tiền và kỳ gia hạn giữ nguyên. Sổ quỹ cập nhật theo tài khoản nhận mới. Tin Telegram đã gửi được giữ trong lịch sử; cần thu hồi tin cũ và chủ động gửi bản đúng.</p>
          <button type="button" className="mg-button mg-button-primary" disabled={loading || !receipt.revision || (!uncertain && (!account || !reason.trim()))} onClick={() => void save()}>
            {saving ? <LoaderCircle size={15} className="mg-spin"/> : null}{saving ? 'Đang lưu…' : uncertain ? 'Thử lại lần sửa này' : 'Lưu sửa thanh toán'}
          </button>
        </>}
        <button type="button" className="mg-button" disabled={saving} onClick={() => { setOpen(false); pending.current = null; setUncertain(false); }}>Đóng sửa thanh toán</button>
        {error && <p className="mg-field-wide mg-field-error" role="alert">{error}</p>}
        {!loading && <button type="button" className="mg-button" disabled={saving} onClick={() => setRetry(value => value + 1)}>Tải lại phiếu</button>}
      </fieldset>}
  </div>;
}

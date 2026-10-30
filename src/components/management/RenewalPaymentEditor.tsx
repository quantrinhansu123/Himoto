'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pencil } from 'lucide-react';
import { formatMoney } from '@/lib/formatters';
import { correctRenewalPayment, loadPaymentContext, PAYMENT_METHODS, paymentAccounts, paymentAccountKey, paymentMethodLabel,
  PaymentRequestError, type PaymentContext, type PaymentMethod, type RenewalPaymentCorrection } from '@/lib/management/contract-payments';
import { useManagement } from './ManagementProvider';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';

function toVietnamLocal(isoString?: string | null) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return '';
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 16);
}

function fromVietnamLocal(localString?: string) {
  if (!localString) return undefined;
  const d = new Date(`${localString}:00+07:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

function getDurationLabel(startLocal: string, endLocal: string) {
  if (!startLocal || !endLocal) return '';
  const ms = new Date(`${endLocal}:00+07:00`).getTime() - new Date(`${startLocal}:00+07:00`).getTime();
  if (ms <= 0 || !Number.isFinite(ms)) return 'Thời gian kết thúc phải sau thời gian bắt đầu';
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days} ngày` : '', hours ? `${hours} giờ` : '', minutes ? `${minutes} phút` : ''].filter(Boolean).join(' ') || '0 phút';
}

export function RenewalPaymentEditor({ orderId, eventKey, receiptId, receiptIds, disabled = false, onSaved, onBusyChange }: {
  orderId: number; eventKey?: string; receiptId?: number; receiptIds?:number[]; disabled?: boolean;
  onSaved: (context: PaymentContext) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { can, acceptContractPayment, notify } = useManagement();
  const allowed = can('contracts.renew') || can('finance.write');
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [context, setContext] = useState<PaymentContext | null>(null), [error, setError] = useState('');
  const [selected, setSelected] = useState(''), [method, setMethod] = useState<PaymentMethod>('cash'), [accountKey, setAccountKey] = useState(''), [reason, setReason] = useState('');
  const [beforeReturnAt, setBeforeReturnAt] = useState(''), [returnAt, setReturnAt] = useState('');
  const [amount, setAmount] = useState('');
  const busy = useRef(false), pending = useRef<RenewalPaymentCorrection | null>(null);
  const [uncertain, setUncertain] = useState(false), [retry, setRetry] = useState(0);
  const receiptIdsKey=receiptIds?.join(',');
  const matchesReceipt=(row:PaymentContext['history'][number])=>Boolean(row.renewal && row.type==='in' && !row.deposit && (receiptId!==undefined?row.id===receiptId:receiptIds!==undefined?receiptIds.includes(row.id):eventKey===`renewal-receipt:${orderId}:${row.id}` || eventKey===`renewal:${orderId}:${row.renewal.version}`));
  const receipts = (context?.history || []).filter(matchesReceipt);
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
      const matching = value.history.filter(matchesReceipt);
      const first = matching.find(row=>row.status!=='cancelled') || matching[0];
      setSelected(first ? String(first.id) : '');
      setMethod(first?.payment_method || 'cash');
      setAccountKey(first?.account_id && first.payment_method ? `${first.payment_method === 'cash' ? 'cash' : 'bank'}:${first.account_id}` : '');
      setBeforeReturnAt(toVietnamLocal(first?.renewal?.before_return_at));
      setReturnAt(toVietnamLocal(first?.renewal?.return_at));
      setAmount(String(first?.renewal?.amount ?? first?.amount ?? ''));
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được phiếu gia hạn.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // Receipt IDs are supplied by the selected period; array identity changes on refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allowed, orderId, receiptId, receiptIdsKey, eventKey, retry]);

  if (!allowed) return null;
  async function save() {
    if (busy.current || disabled || !receipt?.revision) return;
    if (!pending.current) {
      if (!account) return setError('Chọn tài khoản thực nhận tiền.');
      if (!reason.trim()) return setError('Nhập lý do sửa thanh toán / thời gian gia hạn.');
      if (beforeReturnAt && returnAt && new Date(`${returnAt}:00+07:00`).getTime() <= new Date(`${beforeReturnAt}:00+07:00`).getTime()) {
        return setError('Thời gian kết thúc gia hạn phải sau thời gian bắt đầu.');
      }
      pending.current = {
        request_id: crypto.randomUUID(),
        transaction_id: receipt.id,
        revision: receipt.revision,
        method,
        account_id: account.id,
        reason: reason.trim(),
        before_return_at: fromVietnamLocal(beforeReturnAt),
        return_at: fromVietnamLocal(returnAt),
        ...(receipt.renewal_fee_editable && amount !== String(receipt.renewal?.amount ?? receipt.amount) ? {amount} : {}),
      };
      // Preserve sub-minute precision when the user did not edit the date.
      if(beforeReturnAt===toVietnamLocal(receipt.renewal?.before_return_at))delete pending.current.before_return_at;
      if(returnAt===toVietnamLocal(receipt.renewal?.return_at))delete pending.current.return_at;
    }
    busy.current = true; setSaving(true); onBusyChange?.(true); setError('');
    try {
      const saved = await correctRenewalPayment(orderId, pending.current);
      pending.current = null; setUncertain(false); setContext(saved); acceptContractPayment(saved);
      setOpen(false); setReason('');
      notify(`Đã lưu kỳ gia hạn / thanh toán phiếu #${receipt.id}. Bản xem trước được cập nhật; tin Telegram đã gửi giữ nguyên.`);
      onSaved(saved);
    } catch (cause) {
      if (cause instanceof PaymentRequestError && cause.status >= 400 && cause.status < 500) { pending.current = null; setUncertain(false); }
      else setUncertain(true);
      setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được sửa thông tin. Tải lại phiếu để kiểm tra.');
    } finally { busy.current = false; setSaving(false); onBusyChange?.(false); }
  }

  const durationText = getDurationLabel(beforeReturnAt, returnAt);

  return <div className="mg-renewal-payment-editor">
    {!open ? <button type="button" className="mg-button" disabled={disabled} onClick={() => setOpen(true)}><Pencil size={15}/> Sửa thời gian, phí / thanh toán</button>
      : <fieldset className="mg-payment-fields" aria-label="Sửa kỳ gia hạn & thanh toán" disabled={saving || disabled}>
        <legend>Sửa kỳ gia hạn & thanh toán</legend>
        {loading && <p role="status"><LoaderCircle size={15} className="mg-spin"/> Đang tải phiếu thu…</p>}
        {!loading && context && !receipts.length && <p>Chưa có phiếu thu gia hạn để sửa trong giao dịch này.</p>}
        {!loading && receipts.length > 1 && <label className="mg-field-wide">Phiếu thu<select aria-label="Phiếu thu cần sửa" disabled={uncertain} value={selected} onChange={event => {
          const next = receipts.find(row => row.id === Number(event.target.value));
          setSelected(event.target.value); setMethod(next?.payment_method || 'cash');
          setAccountKey(next?.account_id && next.payment_method ? `${next.payment_method === 'cash' ? 'cash' : 'bank'}:${next.account_id}` : '');
          setBeforeReturnAt(toVietnamLocal(next?.renewal?.before_return_at));
          setReturnAt(toVietnamLocal(next?.renewal?.return_at));
          setAmount(String(next?.renewal?.amount ?? next?.amount ?? ''));
        }}>{receipts.map(row => <option key={row.id} value={row.id}>#{row.id} · {formatMoney(row.amount)} · {row.status==='cancelled'?'Đã hủy':row.method}</option>)}</select></label>}
        {!loading && receipt && <>
          <p className="mg-field-wide">Phiếu #{receipt.id} · <strong>{formatMoney(receipt.amount)}</strong><br/>{receipt.method} · {receipt.account || 'Chưa rõ tài khoản'}</p>
          {receipt.status==='cancelled' && <p className="mg-field-wide mg-field-error">Phiếu này đã hủy, không tính vào tiền đã thu. Kiểm tra kỳ gia hạn và phiếu thu đang có hiệu lực trước khi sửa.</p>}
          <fieldset className="mg-renewal-period mg-field-wide" disabled={uncertain}>
            <div className="mg-field">
              <label htmlFor={`renewal-start-${receipt.id}`}>Từ ngày giờ gia hạn</label>
              <DateTime24Controls id={`renewal-start-${receipt.id}`} label="Từ ngày giờ gia hạn" value={beforeReturnAt} onChange={setBeforeReturnAt}/>
            </div>
            <div className="mg-field">
              <label htmlFor={`renewal-end-${receipt.id}`}>Đến ngày giờ (hạn trả mới)</label>
              <DateTime24Controls id={`renewal-end-${receipt.id}`} label="Đến ngày giờ gia hạn" value={returnAt} onChange={setReturnAt}/>
            </div>
          </fieldset>
          {beforeReturnAt && returnAt && (
            <p className="mg-field-wide" style={{ margin: '2px 0 8px 0', fontSize: '13px', color: durationText.includes('phải sau') ? '#dc2626' : '#0284c7' }}>
              Thời gian gia hạn mới: <strong>{durationText}</strong>
            </p>
          )}
          <label className="mg-field-wide">Phí gia hạn (VNĐ)<input aria-label="Phí gia hạn (VNĐ)" inputMode="numeric" value={amount} disabled={uncertain || !receipt.renewal_fee_editable} onChange={event=>setAmount(event.target.value.replace(/\D/g,''))}/></label>
          <p className="mg-field-wide">Sửa phí chỉ điều chỉnh tiền phải thu. Số tiền trên phiếu thu và ngày thu được giữ nguyên; thu thêm tiền cần lập phiếu riêng.{!receipt.renewal_fee_editable&&' Phí của phiếu đã hủy hoặc kỳ chưa đối chiếu không được sửa tại đây.'}</p>

          <label className="mg-field-wide">Hình thức thanh toán mới<select aria-label="Hình thức thanh toán mới" disabled={uncertain} value={method} onChange={event => {
            const next = event.target.value as PaymentMethod, nextAccounts = context ? paymentAccounts(context,next) : [];
            setMethod(next); setAccountKey(nextAccounts.length === 1 ? paymentAccountKey(nextAccounts[0]) : '');
          }}>{PAYMENT_METHODS.map(row => <option key={row.value} value={row.value}>{paymentMethodLabel(row.value)}</option>)}</select></label>
          <label className="mg-field-wide">Tài khoản nhận mới<select aria-label="Tài khoản nhận mới" disabled={uncertain} value={accountKey} onChange={event => setAccountKey(event.target.value)}>
            <option value="">Chọn tài khoản thực nhận</option>{accounts.map(row => <option key={paymentAccountKey(row)} value={paymentAccountKey(row)}>{row.label}</option>)}
          </select></label>
          {!accounts.length && <p className="mg-field-wide mg-field-error">Chưa có tài khoản nhận đang hoạt động phù hợp hình thức và cơ sở hợp đồng.</p>}
          <label className="mg-field-wide">Lý do sửa<textarea aria-label="Lý do sửa thanh toán" maxLength={500} disabled={uncertain} placeholder="Ví dụ: Chỉnh lại ngày gia hạn và số ngày theo thỏa thuận với khách" value={reason} onChange={event => setReason(event.target.value)}/></label>
          <p className="mg-field-wide">Bản xem trước Telegram cập nhật sau khi lưu. Tin đã gửi cần được kiểm tra và chủ động thu hồi / gửi lại khi cần.</p>
          <button type="button" className="mg-button mg-button-primary" disabled={loading || !receipt.revision || (!uncertain && (!account || !reason.trim() || !amount || !beforeReturnAt || !returnAt || durationText.includes('phải sau')))} onClick={() => void save()}>
            {saving ? <LoaderCircle size={15} className="mg-spin"/> : null}{saving ? 'Đang lưu…' : uncertain ? 'Thử lại lần sửa này' : 'Lưu sửa thông tin'}
          </button>
        </>}
        <button type="button" className="mg-button" disabled={saving} onClick={() => { setOpen(false); pending.current = null; setUncertain(false); }}>Đóng sửa thông tin</button>
        {error && <p className="mg-field-wide mg-field-error" role="alert">{error}</p>}
        {!loading && <button type="button" className="mg-button" disabled={saving} onClick={() => setRetry(value => value + 1)}>Tải lại phiếu</button>}
      </fieldset>}
  </div>;
}

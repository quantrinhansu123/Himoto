'use client';
import { addRentalDuration } from '@/lib/management/rental-time';
import { renewalDurationUnits } from '@/lib/management/contract-renewals';

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
  const [durationUnit,setDurationUnit]=useState<'day'|'hour'>('day');
  const [paidAt,setPaidAt]=useState(''),[collectedAmount,setCollectedAmount]=useState('');
  const busy = useRef(false), pending = useRef<RenewalPaymentCorrection | null>(null);
  const [uncertain, setUncertain] = useState(false), [retry, setRetry] = useState(0);
  const receiptIdsKey=receiptIds?.join(',');
  const renewalVersion = eventKey?.startsWith(`renewal:${orderId}:`) ? Number(eventKey.split(':')[2]) : undefined;
  const matchesReceipt=(row:PaymentContext['history'][number])=>Boolean(row.renewal && row.type==='in' && !row.deposit && (receiptId!==undefined?row.id===receiptId:receiptIds!==undefined?receiptIds.includes(row.id):eventKey===`renewal-receipt:${orderId}:${row.id}` || eventKey===`renewal:${orderId}:${row.renewal.version}`));
  const receipts = (context?.history || []).filter(matchesReceipt);
  const receipt = receipts.find(row => String(row.id) === selected);
  const renewal = !receipts.length ? context?.renewals?.find(row => row.version === renewalVersion) : undefined;
  const originalPeriod = receipt?.renewal || renewal;
  const feeEditable = receipt?.renewal_fee_editable ?? renewal?.fee_editable;
  const collecting = Boolean(receipt || Number(collectedAmount) > 0);
  const revision = receipt?.revision || (renewal && context?.revision);
  const fieldId = receipt?.id ?? (renewal && `v${renewal.version}`);
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
      const savedRenewal = !first ? value.renewals?.find(row => row.version === renewalVersion) : undefined;
      const period = first?.renewal || savedRenewal;
      setSelected(first ? String(first.id) : '');
      setMethod(first?.payment_method || 'cash');
      setAccountKey(first?.account_id && first.payment_method ? `${first.payment_method === 'cash' ? 'cash' : 'bank'}:${first.account_id}` : '');
      setBeforeReturnAt(toVietnamLocal(period?.before_return_at));
      setReturnAt(toVietnamLocal(period?.return_at));
      setAmount(String(period?.amount ?? first?.amount ?? ''));
      setPaidAt(toVietnamLocal(first?.paid_at));setCollectedAmount(String(first?.amount??''));
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được phiếu gia hạn.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // Receipt IDs are supplied by the selected period; array identity changes on refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allowed, orderId, receiptId, receiptIdsKey, eventKey, retry]);

  if (!allowed) return null;
  async function save() {
    if (busy.current || disabled || !revision || (!receipt && !renewal)) return;
    if (!pending.current) {
      if (collecting && !account) return setError('Chọn tài khoản thực nhận tiền.');
      if (collecting && (!fromVietnamLocal(paidAt) || Number(collectedAmount) <= 0)) return setError('Nhập ngày thực hiện và số tiền thực tế đã thu.');
      if (!receipt && Number(collectedAmount) > Number(amount)) return setError('Số tiền đã thu không được vượt phí gia hạn.');
      if (!reason.trim()) return setError('Nhập lý do sửa thanh toán / thời gian gia hạn.');
      if (beforeReturnAt && returnAt && new Date(`${returnAt}:00+07:00`).getTime() <= new Date(`${beforeReturnAt}:00+07:00`).getTime()) {
        return setError('Thời gian kết thúc gia hạn phải sau thời gian bắt đầu.');
      }
      pending.current = {
        request_id: crypto.randomUUID(),
        ...(receipt ? {transaction_id:receipt.id} : {renewal_version:renewal?.version}),
        revision,
        ...(collecting && account ? {method,account_id:account.id} : {}),
        reason: reason.trim(),
        ...(collecting && paidAt!==toVietnamLocal(receipt?.paid_at)?{paid_at:fromVietnamLocal(paidAt)}:{}),
        ...(collecting && collectedAmount!==String(receipt?.amount)?{collected_amount:collectedAmount}:{}),
        before_return_at: fromVietnamLocal(beforeReturnAt),
        return_at: fromVietnamLocal(returnAt),
        ...(feeEditable && amount !== String(originalPeriod?.amount ?? receipt?.amount) ? {amount} : {}),
      };
      // Preserve sub-minute precision when the user did not edit the date.
      if(beforeReturnAt===toVietnamLocal(originalPeriod?.before_return_at))delete pending.current.before_return_at;
      if(returnAt===toVietnamLocal(originalPeriod?.return_at))delete pending.current.return_at;
    }
    busy.current = true; setSaving(true); onBusyChange?.(true); setError('');
    try {
      const saved = await correctRenewalPayment(orderId, pending.current);
      pending.current = null; setUncertain(false); setContext(saved); acceptContractPayment(saved);
      setOpen(false); setReason('');
      notify(receipt ? `Đã lưu kỳ gia hạn / thanh toán phiếu #${receipt.id}.` : collecting ? 'Đã lưu kỳ gia hạn và lập phiếu thu.' : 'Đã lưu kỳ gia hạn.');
      onSaved(saved);
    } catch (cause) {
      if (cause instanceof PaymentRequestError && cause.status >= 400 && cause.status < 500) { pending.current = null; setUncertain(false); }
      else setUncertain(true);
      setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được sửa thông tin. Tải lại phiếu để kiểm tra.');
    } finally { busy.current = false; setSaving(false); onBusyChange?.(false); }
  }

  const durationText = getDurationLabel(beforeReturnAt, returnAt);
  function openEditor(){
    // Clear the previous form before rendering it. A late context read must not
    // overwrite edits made against briefly visible data from the last opening.
    setLoading(true);setContext(null);setSelected('');setError('');setOpen(true);
  }

  return <div className="mg-renewal-payment-editor">
    {!open ? <button type="button" className="mg-button" disabled={disabled} onClick={openEditor}><Pencil size={15}/> Sửa thời gian, phí / thanh toán</button>
      : <fieldset className="mg-payment-fields" aria-label="Sửa kỳ gia hạn & thanh toán" disabled={saving || disabled}>
        <legend>Sửa kỳ gia hạn & thanh toán</legend>
        {loading && <p role="status"><LoaderCircle size={15} className="mg-spin"/> Đang tải phiếu thu…</p>}
        {!loading && context && !receipts.length && !renewal && <p>Không tìm thấy kỳ gia hạn đã lưu hoặc phiếu thu của giao dịch này.</p>}
        {!loading && receipts.length > 1 && <label className="mg-field-wide">Phiếu thu<select aria-label="Phiếu thu cần sửa" disabled={uncertain} value={selected} onChange={event => {
          const next = receipts.find(row => row.id === Number(event.target.value));
          setSelected(event.target.value); setMethod(next?.payment_method || 'cash');
          setAccountKey(next?.account_id && next.payment_method ? `${next.payment_method === 'cash' ? 'cash' : 'bank'}:${next.account_id}` : '');
          setBeforeReturnAt(toVietnamLocal(next?.renewal?.before_return_at));
          setReturnAt(toVietnamLocal(next?.renewal?.return_at));
          setAmount(String(next?.renewal?.amount ?? next?.amount ?? ''));
          setPaidAt(toVietnamLocal(next?.paid_at));setCollectedAmount(String(next?.amount??''));
        }}>{receipts.map(row => <option key={row.id} value={row.id}>#{row.id} · {formatMoney(row.amount)} · {row.status==='cancelled'?'Đã hủy':row.method}</option>)}</select></label>}
        {!loading && (receipt || renewal) && <>
          {receipt ? <p className="mg-field-wide">Phiếu #{receipt.id} · <strong>{formatMoney(receipt.amount)}</strong><br/>{receipt.method} · {receipt.account || 'Chưa rõ tài khoản'}</p>
            : <p className="mg-field-wide">Kỳ này chưa có phiếu thu. Nhập số tiền thực tế đã thu để lập phiếu, hoặc để trống nếu khách chưa thanh toán.</p>}
          {receipt?.status==='cancelled' && <p className="mg-field-wide mg-field-error">Phiếu này đã hủy, không tính vào tiền đã thu. Có thể sửa dữ liệu lịch sử của phiếu.</p>}
          <fieldset className="mg-renewal-period mg-field-wide" disabled={uncertain}>
            <div className="mg-field">
              <label htmlFor={`renewal-start-${fieldId}`}>Từ ngày giờ gia hạn</label>
              <DateTime24Controls id={`renewal-start-${fieldId}`} label="Từ ngày giờ gia hạn" value={beforeReturnAt} onChange={setBeforeReturnAt}/>
            </div>
            <div className="mg-field">
              <label htmlFor={`renewal-end-${fieldId}`}>Đến ngày giờ (hạn trả mới)</label>
              <DateTime24Controls id={`renewal-end-${fieldId}`} label="Đến ngày giờ gia hạn" value={returnAt} onChange={setReturnAt}/>
            </div>
          </fieldset>
          <label className="mg-field-wide">Đơn vị gia hạn<select value={durationUnit} onChange={e=>setDurationUnit(e.target.value as 'day'|'hour')} disabled={uncertain}><option value="day">Ngày</option><option value="hour">Giờ</option></select></label>
          <label className="mg-field-wide">Số ngày / giờ<input aria-label="Số ngày / giờ gia hạn" type="number" min="1" max="8760" disabled={uncertain} value={renewalDurationUnits(beforeReturnAt,returnAt,durationUnit)||''} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>0&&n<=8760){const rate=Number(amount)/(renewalDurationUnits(beforeReturnAt,returnAt,durationUnit)||1);setReturnAt(addRentalDuration(beforeReturnAt,n,durationUnit));if(feeEditable)setAmount(String(Math.round(rate*n)));}}}/></label>
          <label className="mg-field-wide">Đơn giá (VNĐ / {durationUnit==='day'?'ngày':'giờ'})<input aria-label="Đơn giá gia hạn" inputMode="numeric" disabled={uncertain||!feeEditable} value={Math.round(Number(amount)/(renewalDurationUnits(beforeReturnAt,returnAt,durationUnit)||1))||''} onChange={e=>setAmount(String(Number(e.target.value.replace(/\D/g,''))*(renewalDurationUnits(beforeReturnAt,returnAt,durationUnit)||1)))}/></label>
          {beforeReturnAt && returnAt && (
            <p className="mg-field-wide" style={{ margin: '2px 0 8px 0', fontSize: '13px', color: durationText.includes('phải sau') ? '#dc2626' : '#0284c7' }}>
              Thời gian gia hạn mới: <strong>{durationText}</strong>
            </p>
          )}
          {collecting && <label className="mg-field-wide">Ngày giờ thực hiện / thu tiền<DateTime24Controls id={`renewal-paid-${fieldId}`} label="Ngày giờ thực hiện / thu tiền" value={paidAt} onChange={setPaidAt}/></label>}
          <label className="mg-field-wide">Số tiền thực tế đã thu (VNĐ)<input aria-label="Số tiền thực tế đã thu" inputMode="numeric" value={collectedAmount} disabled={uncertain} onChange={event=>setCollectedAmount(event.target.value.replace(/\D/g,''))}/></label>
          <label className="mg-field-wide">Phí gia hạn (VNĐ)<input aria-label="Phí gia hạn (VNĐ)" inputMode="numeric" value={amount} disabled={uncertain || !feeEditable} onChange={event=>setAmount(event.target.value.replace(/\D/g,''))}/></label>
          <p className="mg-field-wide">Phí gia hạn là tiền phải thu; số tiền thực tế đã thu là khoản khách đã thanh toán. Với phiếu đang hiệu lực, thay đổi sẽ cập nhật sổ quỹ, công nợ và doanh thu.{!feeEditable&&' Kỳ này không cho sửa phí tại đây.'}</p>

          <label className="mg-field-wide">Hình thức thanh toán mới<select aria-label="Hình thức thanh toán mới" disabled={uncertain || !collecting} value={method} onChange={event => {
            const next = event.target.value as PaymentMethod, nextAccounts = context ? paymentAccounts(context,next) : [];
            setMethod(next); setAccountKey(nextAccounts.length === 1 ? paymentAccountKey(nextAccounts[0]) : '');
          }}>{PAYMENT_METHODS.map(row => <option key={row.value} value={row.value}>{paymentMethodLabel(row.value)}</option>)}</select></label>
          <label className="mg-field-wide">Tài khoản nhận mới<select aria-label="Tài khoản nhận mới" disabled={uncertain || !collecting} value={accountKey} onChange={event => setAccountKey(event.target.value)}>
            <option value="">Chọn tài khoản thực nhận</option>{accounts.map(row => <option key={paymentAccountKey(row)} value={paymentAccountKey(row)}>{row.label}</option>)}
          </select></label>
          {collecting && !accounts.length && <p className="mg-field-wide mg-field-error">Chưa có tài khoản nhận đang hoạt động phù hợp hình thức và cơ sở hợp đồng.</p>}
          <label className="mg-field-wide">Lý do sửa<textarea aria-label="Lý do sửa thanh toán" maxLength={500} disabled={uncertain} placeholder="Ví dụ: Chỉnh lại ngày gia hạn và số ngày theo thỏa thuận với khách" value={reason} onChange={event => setReason(event.target.value)}/></label>
          <p className="mg-field-wide">Bản xem trước Telegram cập nhật sau khi lưu. Tin đã gửi cần được kiểm tra và chủ động thu hồi / gửi lại khi cần.</p>
          <button type="button" className="mg-button mg-button-primary" disabled={loading || !revision || (!uncertain && (!reason.trim() || !amount || (collecting && (!account || !paidAt || Number(collectedAmount) <= 0)) || !beforeReturnAt || !returnAt || durationText.includes('phải sau')))} onClick={() => void save()}>
            {saving ? <LoaderCircle size={15} className="mg-spin"/> : null}{saving ? 'Đang lưu…' : uncertain ? 'Thử lại lần sửa này' : 'Lưu sửa thông tin'}
          </button>
        </>}
        <button type="button" className="mg-button" disabled={saving} onClick={() => { setOpen(false); pending.current = null; setUncertain(false); }}>Đóng sửa thông tin</button>
        {error && <p className="mg-field-wide mg-field-error" role="alert">{error}</p>}
        {!loading && <button type="button" className="mg-button" disabled={saving} onClick={() => {setLoading(true);setContext(null);setSelected('');setRetry(value => value + 1);}}>Tải lại phiếu</button>}
      </fieldset>}
  </div>;
}

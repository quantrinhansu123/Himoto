'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, LoaderCircle, Wallet } from 'lucide-react';
import { loadContractReturnableItems, ReturnableContractItem } from '@/lib/management/contract-returns';
import { overdueParts, saveContractRenewal, renewalDurationUnits, renewalFeeWarning } from '@/lib/management/contract-renewals';
import {
  cashbookPaymentPath, loadPaymentContext, PAYMENT_METHODS, paymentAccountKey, paymentAccounts,
  paymentMethodLabel, PaymentContext, PaymentMethod, vietnamPaymentTime,
} from '@/lib/management/contract-payments';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { addRentalDuration } from '@/lib/management/rental-time';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';
import { ContractTransactionPhotos } from './ContractTransactionPhotos';
import { ContractTelegramPanel } from './ContractTelegramPanel';
import { contractTelegramRequest } from '@/lib/management/contract-telegram';
import { validBackfillTime } from '@/lib/management/contract-backfill';

const groupAmount = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const DEFAULT_HOURLY_RATE = '20000';
function defaultRate(row: ReturnableContractItem | null, unit: 'day' | 'hour', fallbackDaily?: number) {
  if (unit === 'hour') return DEFAULT_HOURLY_RATE;
  const daily = row?.daily_price || fallbackDaily;
  return daily ? String(daily) : '';
}

export function ContractRenewalDialog({ orderId, contractCode, unitPrice, backfill=false, onClose }: { orderId: number; contractCode: string; unitPrice?: number;backfill?:boolean; onClose: () => void }) {
  const { notify, reload, canPayContracts, can, acceptContractPayment, selectStore } = useManagement();
  const canReceiveRenewal = can('contracts.renew');
  const requestId = useRef<string | null>(null);
  const router = useRouter();
  const [rows, setRows] = useState<ReturnableContractItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [unit, setUnit] = useState<'day' | 'hour'>('day');
  const [count, setCount] = useState('1');
  const [durationSource,setDurationSource]=useState<'count'|'date'>('count');
  const [rateInput, setRateInput] = useState('');
  const [returnAt, setReturnAt] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [extraName, setExtraName] = useState('Phí VAT');
  const [extraAmount, setExtraAmount] = useState('');
  const [outsideName, setOutsideName] = useState('Phí thu thêm');
  const [outsideAmount, setOutsideAmount] = useState('');
  const [note, setNote] = useState('');
  const [occurredAt,setOccurredAt]=useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [renewalVersion, setRenewalVersion] = useState<number | null>(null);
  const [photosPending, setPhotosPending] = useState(false);
  const [hasPaymentEvidence, setHasPaymentEvidence] = useState(false);
  const [paymentContext, setPaymentContext] = useState<PaymentContext | null>(null);
  const [paymentLoadError, setPaymentLoadError] = useState('');
  const [collectionChoice, setCollectionChoice] = useState<'' | 'received' | 'unpaid'>('');
  const collect = collectionChoice === 'received';
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [accountId, setAccountId] = useState('');
  const [paidAt, setPaidAt] = useState(()=>backfill?'':vietnamPaymentTime());
  useEffect(() => {
    const controller = new AbortController();
    void contractTelegramRequest(orderId, undefined, controller.signal).then(data => setRenewalVersion(data.next_renewal_version)).catch(() => {});
    return () => controller.abort();
  }, [orderId]);
  const [done, setDone] = useState<{ code: string; fee: number; outside: number; remaining: number | null; version: number; collected: boolean; mismatch?: boolean; expected?: number | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadContractReturnableItems(orderId, controller.signal,backfill).then(result => {
      const open = result.filter(row => backfill||!row.completed_at);
      setRows(open);
      if (open.length === 1) { setItemId(String(open[0].item_id)); setRateInput(defaultRate(open[0], 'day', unitPrice)); }
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được xe trong hợp đồng.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderId, unitPrice,backfill]);

  useEffect(() => {
    if (!canReceiveRenewal) return;
    const controller = new AbortController();
    setPaymentLoadError('');
    void loadPaymentContext(orderId, controller.signal).then(context => {
      if (controller.signal.aborted) return;
      setPaymentContext(context);
      const preferred = (['cash', 'transfer', 'company_transfer'] as const).find(value => paymentAccounts(context, value).length) || 'cash';
      setMethod(preferred);
      const accounts = paymentAccounts(context, preferred);
      setAccountId(accounts.length === 1 ? paymentAccountKey(accounts[0]) : '');
    }).catch(cause => {
      if (!controller.signal.aborted) setPaymentLoadError(cause instanceof Error ? cause.message : 'Không tải được tài khoản nhận tiền.');
    });
    return () => controller.abort();
  }, [orderId, canReceiveRenewal]);

  const selected = rows.find(row => String(row.item_id) === itemId) || null;
  const overdue = useMemo(() => overdueParts(selected?.scheduled_return_at ?? null), [selected?.scheduled_return_at]);
  const dueStamp = selected?.scheduled_return_at || '';
  const dueMs = dueStamp ? Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueStamp) ? `${dueStamp}:00+07:00` : dueStamp) : NaN;
  const maxCount = unit === 'day' ? 365 : 720;
  const unitCount = /^\d+$/.test(count) ? Number(count) : 0;
  const rate = /^\d{1,9}$/.test(rateInput) ? Number(rateInput) : 0;
  const accounts = paymentContext ? paymentAccounts(paymentContext, method) : [];
  const effectiveAccount = accountId || (accounts.length === 1 ? paymentAccountKey(accounts[0]) : '');
  const effectiveAccountId = Number((effectiveAccount.includes(':') ? effectiveAccount.split(':')[1] : effectiveAccount) || 0);
  const canCollect = canReceiveRenewal && (feeReady(amount) + feeReady(extraAmount) + feeReady(outsideAmount)) > 0;
  const collecting = canCollect && collect;

  useEffect(() => {
    if (durationSource!=='count'||!selected || !Number.isFinite(dueMs) || unitCount < 1 || unitCount > maxCount) return;
    setReturnAt(addRentalDuration(selected.scheduled_return_at || '', unitCount, unit));
  }, [selected, dueMs, unit, unitCount, maxCount, durationSource]);
  const durationUnits=renewalDurationUnits(dueStamp,returnAt,unit);
  useEffect(()=>{if(!amountTouched&&rate&&durationUnits&&durationUnits<=maxCount)setAmount(String(rate*durationUnits));},[amountTouched,rate,durationUnits,maxCount]);
  function changeReturnAt(value:string){setDurationSource('date');setReturnAt(value);const units=renewalDurationUnits(dueStamp,value,unit);if(units)setCount(String(units));}

  function changeUnit(next: 'day' | 'hour') {
    setUnit(next); setCount('1'); setDurationSource('count'); setAmountTouched(false); setAmount('');
    setRateInput(defaultRate(selected, next, unitPrice));
  }

  function changeMethod(next: PaymentMethod) {
    setMethod(next);
    const nextAccounts = paymentContext ? paymentAccounts(paymentContext, next) : [];
    setAccountId(nextAccounts.length === 1 ? paymentAccountKey(nextAccounts[0]) : '');
  }

  const renewalFee = feeReady(amount);
  const otherFee = feeReady(extraAmount);
  const outsideFee = feeReady(outsideAmount);
  const fee = renewalFee + otherFee;
  const expectedFee = rate > 0 && durationUnits && durationUnits <= maxCount ? rate * durationUnits : null;
  const underchargeWarning=/^\d+$/.test(amount)?renewalFeeWarning(renewalFee,expectedFee):'';
  const amountMismatch = expectedFee !== null && /^\d+$/.test(amount || '') && renewalFee !== expectedFee;
  const total = selected?.total_amount ?? null;
  const paid = selected?.paid_amount ?? null;
  const nextTotal = total === null ? null : total + fee;
  const returnMs = returnAt ? new Date(`${returnAt}:00+07:00`).getTime() : NaN;
  const validReturn = Number.isFinite(returnMs) && durationUnits!==null && durationUnits<=maxCount && (!Number.isFinite(dueMs) || returnMs > dueMs);
  const stillOverdue = !selected?.completed_at&&validReturn && returnMs < Date.now();
  const previewPaid = collecting ? (paid === null ? null : paid + fee) : paid;
  const previewRemaining = nextTotal === null || previewPaid === null ? null : Math.max(nextTotal - previewPaid, 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving || photosPending) return;
    if(backfill&&(!validBackfillTime(occurredAt))){setError('Nhập ngày giờ gia hạn thực tế hợp lệ.');return;}
    if (!validReturn) { setError('Ngày trả mới phải sau ngày hẹn trả hiện tại.'); return; }
    if (!/^(0|[1-9]\d{0,12})$/.test(amount || '0')) { setError('Chi phí gia hạn phải là số tiền nguyên VNĐ.'); return; }
    if (extraAmount && !/^(0|[1-9]\d{0,12})$/.test(extraAmount)) { setError('Phí khác phải là số tiền nguyên VNĐ.'); return; }
    if (otherFee > 0 && !extraName.trim()) { setError('Nhập tên khoản phí khác (ví dụ Phí VAT).'); return; }
    if (outsideAmount && !/^(0|[1-9]\d{0,12})$/.test(outsideAmount)) { setError('Phí thu thêm phải là số tiền nguyên VNĐ.'); return; }
    if (outsideFee > 0 && !outsideName.trim()) { setError('Nhập tên phí thu thêm (thu ngoài).'); return; }
    if (fee + outsideFee > 9_999_999_999_999) { setError('Tổng chi phí gia hạn và phí thu thêm vượt giới hạn.'); return; }
    if (collecting && outsideFee > 0 && method === 'company_transfer') { setError('Phí thu thêm (thu ngoài) không ghi vào tài khoản công ty. Chọn tiền mặt hoặc chuyển khoản cá nhân.'); return; }
    if (canCollect && !collectionChoice) { setError('Chọn đã nhận tiền hoặc chưa nhận tiền gia hạn.'); return; }
    if (collecting) {
      if (!paymentContext) { setError(paymentLoadError || 'Đang tải tài khoản nhận tiền.'); return; }
      if (!accounts.some(account => account.id === effectiveAccountId)) { setError('Chọn tài khoản nhận tiền gia hạn.'); return; }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(paidAt)) { setError('Ngày giờ thu tiền gia hạn không hợp lệ.'); return; }
      if (!hasPaymentEvidence) { setError('Lưu ảnh bill chuyển khoản hoặc tiền mặt trước khi hoàn thành gia hạn đã thu tiền.'); return; }
    }
    setSaving(true); setError('');
    try {
      const extraLabel = otherFee > 0 ? `${extraName.trim()} ${formatMoney(otherFee)}` : '';
      const outsideLabel = outsideFee > 0 ? `${outsideName.trim()} ${formatMoney(outsideFee)} (thu ngoài, không cộng tiền hợp đồng)` : '';
      const combinedNote = [note.trim(), extraLabel ? `Phí khác: ${extraLabel}` : '', outsideLabel ? `Phí thu thêm: ${outsideLabel}` : ''].filter(Boolean).join('\n');
      const result = await saveContractRenewal(orderId, {
        request_id: requestId.current ??= crypto.randomUUID(),
        item_id: selected.item_id, item_revision: selected.item_revision, order_revision: selected.order_revision,
        return_at: returnAt, amount: String(fee), note: combinedNote,
        ...(outsideFee > 0 ? { outside_amount: String(outsideFee), outside_name: outsideName.trim() } : {}),
        ...(backfill?{occurred_at:occurredAt}:{}),
        ...(expectedFee !== null ? { expected_amount: String(expectedFee + otherFee) } : {}),
        ...(collecting ? {receipt:{method,account_id:effectiveAccountId,paid_at:paidAt}} : {}),
      });
      let remaining = result.total_amount !== null && paid !== null ? Math.max(result.total_amount - paid, 0) : null;
      let collected = false;
      const mismatchNote = amountMismatch && expectedFee !== null ? ` · cảnh báo: phí gia hạn ${formatMoney(renewalFee)} khác gợi ý ${formatMoney(expectedFee)}` : '';
      if (collecting) {
        const payment = result.payment;
        if (fee > 0 && !payment) throw new Error('Chưa xác nhận được phiếu thu gia hạn. Tải lại hợp đồng để kiểm tra trước khi thử lại.');
        if (outsideFee > 0 && !result.outside_collected) throw new Error('Chưa ghi được phiếu thu phí thu thêm. Tải lại hợp đồng để kiểm tra trước khi thử lại.');
        if (payment) acceptContractPayment(payment.context);
        if (payment) remaining = payment.context.remaining;
        collected = true;
        const outsideNote = outsideFee > 0 ? ` · thu ngoài ${formatMoney(outsideFee)}` : '';
        notify(`${result.code}: đã tạo phiên bản v${result.version}${payment ? ` và ghi phiếu Thu #${payment.transaction_id}` : ''} · ${formatMoney(fee)}${outsideNote}${mismatchNote}.`);
        await reload();
        if (payment?.company_transfer) {
          selectStore('all');
          onClose();
          router.push(`/contracts/vat?contract_id=${orderId}`);
          return;
        }
      } else {
        notify(`${result.code}: đã tạo phiên bản v${result.version} — hẹn trả ${formatDateTime(result.return_at)}${result.total_amount !== null ? `, tiền hợp đồng ${formatMoney(result.total_amount)}` : ''}${mismatchNote}.`);
        await reload();
      }
      setDone({ code: result.code, fee, outside: outsideFee, remaining, version: result.version, collected, mismatch: Boolean(mismatchNote), expected: expectedFee === null ? null : expectedFee + otherFee });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được gia hạn hợp đồng.'); }
    finally { setSaving(false); }
  }

  function openCashbook(purpose: 'debt' | 'renewal' = 'debt') {
    onClose();
    router.push(cashbookPaymentPath(orderId, purpose));
  }

  function close() {
    if (saving) return;
    if (photosPending && !window.confirm('Có ảnh/video chưa lưu vào hồ sơ. Đóng sẽ bỏ các tệp chưa lưu. Anh/chị vẫn muốn đóng?')) return;
    onClose();
  }

  return <Dialog title={`${backfill?'Nhập bổ sung gia hạn':'Gia hạn'} · ${contractCode}`} subtitle={backfill?'Ghi đúng ngày giao dịch thực tế; xe đã trả chỉ bổ sung lịch sử và phí, không đổi kho hiện tại.':'Lưu sẽ tạo phiên bản hợp đồng mới với ngày trả và tiền hợp đồng mới'} className="mg-renewal-dialog" onClose={close}>
    <form onSubmit={submit}>
      <div className="mg-dialog-body">
        {done ? <div className="mg-cashbook-followup" role="status">
          <p>Đã lưu gia hạn {done.code}{done.fee > 0 ? ` · phí hợp đồng ${formatMoney(done.fee)}` : ''}{done.outside > 0 ? ` · thu ngoài ${formatMoney(done.outside)}` : ''}{done.collected ? ' · đã ghi phiếu Thu vào sổ quỹ.' : '.'}</p>
          {done.mismatch && done.expected != null && <p className="mg-field-error" role="status">Cảnh báo đã ghi: chi phí gia hạn {formatMoney(done.fee)} khác gợi ý theo hợp đồng {formatMoney(done.expected)}.</p>}
          {!done.collected&&done.fee>0&&<p role="alert">Đã dời hạn trả nhưng chưa ghi nhận thu {formatMoney(done.fee)} phí gia hạn. Khoản này còn trong công nợ và cần thu trước khi hoàn cọc.</p>}
          {!done.collected&&done.outside>0&&<p role="alert">Phí thu thêm {formatMoney(done.outside)} chưa ghi phiếu thu. Khoản này không vào công nợ hợp đồng.</p>}
          {error && <p className="mg-error-message" role="alert">{error}</p>}
          <ContractTelegramPanel id={orderId} eventKey={`renewal:${orderId}:${done.version}`}/>
          {done.collected && (done.remaining === null || done.remaining <= 0) ? <p>Đã thu phí gia hạn trong lượt này.</p>
            : canPayContracts ? <>
              <p>Bấm nút bên dưới để mở phiếu thu Sổ quỹ đã điền sẵn theo cấu trúc hợp đồng (nội dung, số tiền còn thiếu).</p>
              {(done.remaining === null || done.remaining > 0 || (!done.collected && done.fee > 0)) && <button type="button" className="mg-button mg-button-primary" onClick={() => openCashbook('debt')}><Wallet size={16} />Điền thu công nợ vào sổ quỹ</button>}
              {!done.collected && <button type="button" className="mg-button" onClick={() => openCashbook('renewal')}><Wallet size={16} />Điền thu gia hạn vào sổ quỹ</button>}
            </> : <p>Chưa ghi nhận thu phí gia hạn. Khi đã nhận tiền, cơ sở cần ghi nhận phiếu thu trước khi hoàn cọc.</p>}
        </div> : <>
        {loading && <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải xe của hợp đồng…</p>}
        {!loading && !rows.length && !error && <p>Hợp đồng này không còn xe đang thuê để gia hạn.</p>}
        {rows.length > 1 && <div className="mg-field"><label htmlFor="renewal-item">Xe cần gia hạn</label><select id="renewal-item" value={itemId} onChange={event => { setItemId(event.target.value); setDurationSource('count'); setAmountTouched(false); setAmount(''); setRateInput(defaultRate(rows.find(row => String(row.item_id) === event.target.value) || null, unit, unitPrice)); }}><option value="">Chọn xe</option>{rows.map(row => <option key={row.item_id} value={row.item_id}>{row.vehicle_name} · {row.license}</option>)}</select></div>}
        {selected && <>
          <dl className="mg-renewal-facts">
            <div><dt>Xe</dt><dd>{selected.vehicle_name || '—'} · {selected.license || '—'}</dd></div>
            <div><dt>Ngày thuê</dt><dd>{formatDateTime(selected.scheduled_start_at)}</dd></div>
            <div><dt>Ngày trả (hẹn hiện tại)</dt><dd>{formatDateTime(selected.scheduled_return_at)}</dd></div>
            <div className={overdue.minutes ? 'is-overdue' : undefined}><dt>Số ngày quá hạn</dt><dd>{overdue.days} ngày</dd></div>
            <div className={overdue.minutes ? 'is-overdue' : undefined}><dt>Số giờ quá hạn</dt><dd>{overdue.hours} giờ</dd></div>
          </dl>
          <fieldset className="mg-payment-fields" disabled={saving}>
            <legend>Thông tin gia hạn</legend>
            <label>Gia hạn theo<select value={unit} onChange={event => changeUnit(event.target.value as 'day' | 'hour')}><option value="day">Ngày</option><option value="hour">Giờ</option></select></label>
            <label>{unit === 'day' ? 'Số ngày gia hạn' : 'Số giờ gia hạn'}<input type="number" min={1} max={maxCount} value={count} onChange={event => {setDurationSource('count');setCount(event.target.value);}} /></label>
            <label>{unit === 'day' ? 'Đơn giá / ngày (VNĐ)' : 'Đơn giá / giờ (VNĐ)'}<input inputMode="numeric" value={groupAmount(rateInput)} placeholder={unit === 'day' ? 'Nhập đơn giá/ngày' : 'Nhập đơn giá/giờ'}
              onChange={event => { const raw = event.target.value.replaceAll('.', ''); if (/^\d{0,9}$/.test(raw)) { setRateInput(raw); setAmountTouched(false); } }} /></label>
            <label className="mg-field-wide">Ngày trả mới (24h)<DateTime24Controls id="renewal-return-at" label="Ngày trả mới" value={returnAt} onChange={changeReturnAt} error={Boolean(returnAt) && !validReturn} /></label>
            <label className="mg-field-wide">Chi phí gia hạn (VNĐ)<input inputMode="numeric" value={groupAmount(amount)} placeholder="Nhập chi phí gia hạn" aria-describedby={underchargeWarning?'renewal-fee-warning':undefined}
              onChange={event => { const raw = event.target.value.replaceAll('.', ''); if (/^\d{0,13}$/.test(raw)) { setAmount(raw); setAmountTouched(true); } }} />
              <small>{rate ? `Gợi ý theo ngày trả mới: ${formatMoney(rate)} × ${durationUnits || 0} ${unit === 'day' ? 'ngày' : 'giờ'} = ${formatMoney(expectedFee||0)}. Có thể sửa.` : 'Nhập đơn giá để có gợi ý, hoặc nhập thẳng chi phí gia hạn.'}</small></label>
            {underchargeWarning&&<p id="renewal-fee-warning" className="mg-field-error" role="alert">{underchargeWarning} Cảnh báo được lưu vào lịch sử; vẫn lưu được theo thỏa thuận.</p>}
            {amountMismatch&&!underchargeWarning&&expectedFee!==null&&<p role="status">Phí gia hạn cao hơn gợi ý {formatMoney(expectedFee)}; phần chênh sẽ được lưu trong lịch sử.</p>}
            <div className="mg-field-wide mg-renewal-extra">
              <strong>Phí khác</strong>
              <label>Tên khoản phí<input value={extraName} maxLength={100} placeholder="Ví dụ: Phí VAT" onChange={event => setExtraName(event.target.value)} /></label>
              <label>Số tiền phí khác (VNĐ)<input inputMode="numeric" value={groupAmount(extraAmount)} placeholder="Nhập phí VAT hoặc phí phát sinh"
                onChange={event => { const raw = event.target.value.replaceAll('.', ''); if (/^\d{0,13}$/.test(raw)) setExtraAmount(raw); }} />
                <small>Cộng vào tổng khi lưu gia hạn. Chọn TK công ty nếu cần vào Hợp đồng VAT.</small></label>
              {fee > 0 && <p role="status">Cộng vào tiền hợp đồng: gia hạn {formatMoney(renewalFee)}{otherFee > 0 ? ` + ${extraName.trim() || 'phí khác'} ${formatMoney(otherFee)}` : ''} = <strong>{formatMoney(fee)}</strong></p>}
            </div>
            <div className="mg-field-wide mg-renewal-extra">
              <strong>Phí thu thêm (thu ngoài)</strong>
              <label>Tên khoản thu ngoài<input value={outsideName} maxLength={100} placeholder="Ví dụ: Phí gửi xe" onChange={event => setOutsideName(event.target.value)} /></label>
              <label>Số tiền thu ngoài (VNĐ)<input inputMode="numeric" value={groupAmount(outsideAmount)} placeholder="Không cộng vào tiền hợp đồng"
                onChange={event => { const raw = event.target.value.replaceAll('.', ''); if (/^\d{0,13}$/.test(raw)) setOutsideAmount(raw); }} />
                <small>Ghi phiếu thu khi đã nhận tiền. Không cộng vào tiền hợp đồng và không vào tài khoản công ty.</small></label>
              {outsideFee > 0 && collect && method === 'company_transfer' && <p className="mg-field-error" role="alert">Phí thu thêm không ghi vào tài khoản công ty. Chọn tiền mặt hoặc chuyển khoản cá nhân.</p>}
            </div>
            {canCollect && <>
              <label className="mg-field-wide mg-checkbox"><input type="radio" name="renewal-collection" required checked={collectionChoice==='received'} onChange={()=>setCollectionChoice('received')} />Đã thực nhận tiền gia hạn — ghi phiếu thu cùng lúc lưu</label>
              <label className="mg-field-wide mg-checkbox"><input type="radio" name="renewal-collection" required checked={collectionChoice==='unpaid'} onChange={()=>setCollectionChoice('unpaid')} />Chưa nhận tiền — ghi công nợ gia hạn</label>
              {collect && <>
                {paymentLoadError && !paymentContext && <p className="mg-field-wide mg-field-error">{paymentLoadError}</p>}
                {!paymentContext && !paymentLoadError && <p className="mg-field-wide" role="status"><LoaderCircle size={15} className="mg-spin" /> Đang tải tài khoản nhận tiền…</p>}
                {paymentContext && <>
                  <label className="mg-field-wide">Hình thức thanh toán<select aria-label="Hình thức thanh toán" value={method} onChange={event => changeMethod(event.target.value as PaymentMethod)}>
                    {PAYMENT_METHODS.map(item => <option key={item.value} value={item.value}>{paymentMethodLabel(item.value)}</option>)}
                  </select></label>
                  <label className="mg-field-wide">Tài khoản nhận<select aria-label="Tài khoản nhận" required value={effectiveAccount} onChange={event => setAccountId(event.target.value)}>
                    <option value="">Chọn tài khoản nhận</option>
                    {accounts.map(account => <option key={paymentAccountKey(account)} value={paymentAccountKey(account)}>{account.label}</option>)}
                  </select></label>
                  {!accounts.length && <p className="mg-field-wide mg-field-error">{method === 'company_transfer'
                    ? 'Chưa có tài khoản công ty đang hoạt động. Đổi hình thức hoặc thêm TK công ty trong Sổ quỹ.'
                    : 'Chưa có tài khoản nhận đúng cơ sở hợp đồng cho hình thức này (Tiền mặt = két; Chuyển khoản = ngân hàng cơ sở). Đổi Hình thức hoặc chọn TK đúng cơ sở nguồn.'}</p>}
                  <label className="mg-field-wide">Ngày giờ thu (24h)<DateTime24Controls id="renewal-paid-at" label="Ngày giờ thu" value={paidAt} onChange={setPaidAt} /></label>
                </>}
              </>}
            </>}
            {backfill&&<label className="mg-field-wide">Ngày giờ gia hạn thực tế<DateTime24Controls id="renewal-occurred-at" label="Ngày giờ gia hạn thực tế" value={occurredAt} onChange={setOccurredAt}/></label>}
            <label className="mg-field-wide">{backfill?'Lý do nhập bổ sung':'Ghi chú'}<textarea aria-label={backfill?'Lý do nhập bổ sung':'Ghi chú'} rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Lý do gia hạn, thỏa thuận với khách…" /></label>
          </fieldset>
          {stillOverdue && <p className="mg-field-error">Ngày trả mới vẫn ở quá khứ, hợp đồng sẽ tiếp tục quá hạn.</p>}
          <dl className="mg-payment-totals">
            <div><dt>Tiền thuê hợp đồng</dt><dd>{total === null ? 'Chưa đối chiếu' : formatMoney(total)}{fee > 0 && nextTotal !== null && <> → <strong>{formatMoney(nextTotal)}</strong></>}</dd></div>
            <div><dt>Đã thu tiền thuê</dt><dd>{paid === null ? '—' : formatMoney(paid)}{collecting && fee > 0 && previewPaid !== null && <> → <strong>{formatMoney(previewPaid)}</strong></>}</dd></div>
            <div><dt>Còn thiếu sau gia hạn (không trừ cọc)</dt><dd>{previewRemaining === null ? '—' : formatMoney(previewRemaining)}</dd></div>
            {outsideFee > 0 && <div><dt>Phí thu thêm (thu ngoài)</dt><dd>{formatMoney(outsideFee)} · không cộng vào tiền hợp đồng</dd></div>}
            <div><dt>Tiền cọc đã thu</dt><dd>{formatMoney(selected?.deposit_paid ?? 0)}</dd></div>
            <div><dt>Cọc đang giữ</dt><dd>{formatMoney(selected?.deposit_held ?? 0)}</dd></div>
          </dl>
          <p className="mg-composer-hint">{collecting
            ? `Chi phí gia hạn và phí khác được cộng vào tiền hợp đồng và ghi phiếu Thu ngay khi lưu.${outsideFee > 0 ? ` Phí thu thêm ${formatMoney(outsideFee)} ghi phiếu riêng, không cộng vào tiền hợp đồng.` : ''}`
            : 'Chi phí gia hạn và phí khác được cộng vào tiền hợp đồng. Phí thu thêm (thu ngoài) chỉ ghi phiếu khi đã thực nhận, và không thành công nợ hợp đồng.'}</p>
          {collecting && !hasPaymentEvidence && <p className="mg-field-error" role="status">Lưu ảnh bill chuyển khoản hoặc tiền mặt ở mục bên dưới trước khi hoàn thành gia hạn đã thu tiền.</p>}
          {renewalVersion && <ContractTransactionPhotos id={orderId} phase={`renewal-${renewalVersion}`} title="Ảnh gia hạn" onPendingChange={setPhotosPending} onEvidenceChange={setHasPaymentEvidence}/>}
        </>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
        </>}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={close}>{done ? 'Đóng' : 'Hủy'}</button>
        {!done && selected && <button type="submit" className="mg-button mg-button-primary" disabled={loading || saving || photosPending || !validReturn || (collecting && (!hasPaymentEvidence || !paymentContext || !accounts.length || (outsideFee > 0 && method === 'company_transfer')))}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <CalendarPlus size={16} />}{saving ? 'Đang lưu…' : collecting ? 'Lưu gia hạn và thu tiền' : 'Lưu gia hạn'}</button>}</div>
    </form>
  </Dialog>;
}

function feeReady(amount: string) {
  return /^\d+$/.test(amount) ? Number(amount) : 0;
}

'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Plus, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { Dialog } from './Dialog';
import { TransferQrPanel } from './TransferQrPanel';
import { useManagement } from './ManagementProvider';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { PAYABLE_STATUSES, RENEWABLE_STATUSES, PAYMENT_METHODS, PaymentAccount, PaymentContext, PaymentInput, PaymentMethod, PaymentPurpose, PaymentRequestError, RenewalItem, canAddExtraReceipt, loadPaymentContext, paymentAccounts, saveContractPayment, vietnamPaymentTime } from '@/lib/management/contract-payments';
import { transferQr } from '@/lib/management/transfer-qr';
import { bulkDelete } from '@/lib/management/bulk-delete';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';

const groupAmount = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const defaultNote = (purpose: PaymentPurpose, code: string) => purpose === 'extra' ? `Thu thêm hợp đồng_${code}` : purpose === 'deposit_refund' ? `Trả cọc hợp đồng_${code}` : purpose === 'debt' ? `Thu tiền thuê hợp đồng_${code}` : `Gia hạn hợp đồng_${code}`;
const vietnamLocal = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 16);
const vietnamText = (value: string) => formatDateTime(value);

export function ContractPaymentDialog({ id, initialPurpose = 'debt', onClose, onPaymentSaved }: { id: number; initialPurpose?: PaymentPurpose; onClose: () => void; onPaymentSaved?: () => void }) {
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
  const [purpose, setPurpose] = useState<PaymentPurpose>(initialPurpose);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [renewalDays, setRenewalDays] = useState('1');
  const [transferReview, setTransferReview] = useState<{ input: PaymentInput; account: PaymentAccount; qr: ReturnType<typeof transferQr> } | null>(null);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = useRef(false);
  const storageKey = `himoto-contract-payment-${id}`;

  useEffect(() => {
    let restored = false;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as PaymentInput | null;
      if (saved && typeof saved.request_id === 'string' && typeof saved.amount === 'string' && PAYMENT_METHODS.some(item => item.value === saved.method)) {
        restored = true;
        setPending(saved); setAmount(saved.amount); setMethod(saved.method); setAccountId(String(saved.account_id)); setPaidAt(saved.paid_at); setNote(saved.note);
        setPurpose(saved.purpose === 'renewal' || saved.purpose === 'extra' || saved.purpose === 'deposit_refund' ? saved.purpose : 'debt');
        setPicks(Object.fromEntries((saved.items || (saved.item_id ? [{ item_id: saved.item_id, amount: saved.amount }] : [])).map(item => [String(item.item_id), item.amount])));
        setError('Có lần thu chưa xác nhận. Thử lại lần thu này để kiểm tra và tránh ghi trùng.');
      }
    } catch { /* A malformed local draft is never submitted automatically. */ }
    const controller = new AbortController();
    loadPaymentContext(id, controller.signal).then(fresh => {
      setContext(fresh);
      if (restored) return;
      const payableNow = PAYABLE_STATUSES.includes(fresh.status) && fresh.remaining !== null && fresh.remaining > 0;
      const renewableNow = !fresh.billing && RENEWABLE_STATUSES.includes(fresh.status) && fresh.items.length > 0;
      let next = initialPurpose;
      if (next === 'debt' && !payableNow && !fresh.billing) next = renewableNow && fresh.remaining === 0 ? 'renewal' : canAddExtraReceipt(fresh.status) && fresh.remaining !== null ? 'extra' : next;
      if (next === 'deposit_refund' && !(canAddExtraReceipt(fresh.status) && fresh.deposit_held > 0)) next = payableNow ? 'debt' : renewableNow ? 'renewal' : next;
      setPurpose(next); setNote(defaultNote(next, fresh.code));
      if (next === 'debt' && fresh.remaining !== null && fresh.remaining > 0) setAmount(String(fresh.remaining));
      else if (next === 'deposit_refund' && fresh.deposit_held > 0) setAmount(String(fresh.deposit_held));
      else setAmount('');
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được thanh toán.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, storageKey, initialPurpose]);

  const accounts = context ? paymentAccounts(context, method) : [];
  const effectiveAccount = accountId || (accounts.length === 1 ? String(accounts[0].id) : '');
  const payable = Boolean(context && PAYABLE_STATUSES.includes(context.status) && context.remaining !== null && context.remaining > 0);
  const renewable = Boolean(context && !context.billing && RENEWABLE_STATUSES.includes(context.status) && context.items.length && context.total_amount !== null && context.paid_amount !== null);
  const days = /^\d+$/.test(renewalDays) && Number(renewalDays) >= 1 && Number(renewalDays) <= 365 ? Number(renewalDays) : 0;
  const suggestedFor = (item: RenewalItem) => item.daily_price && days ? String(item.daily_price * days) : '';
  const renewalLines = (context?.items || []).filter(item => String(item.id) in picks).map(item => {
    const due = item.return_at ? new Date(item.return_at).getTime() : NaN;
    return { item, amount: picks[String(item.id)], return_at: Number.isFinite(due) && days ? vietnamLocal(due + days * 86_400_000) : '' };
  });
  const renewalTotal = renewalLines.reduce((sum, line) => sum + (/^\d+$/.test(line.amount) ? Number(line.amount) : 0), 0);
  function togglePick(item: RenewalItem, checked: boolean) {
    setPicks(current => {
      const next = { ...current };
      if (checked) next[String(item.id)] = suggestedFor(item); else delete next[String(item.id)];
      return next;
    });
  }
  function changeDays(value: string) {
    setRenewalDays(value);
    const count = /^\d+$/.test(value) ? Number(value) : 0;
    setPicks(current => Object.fromEntries(Object.keys(current).map(key => {
      const item = context?.items.find(row => String(row.id) === key);
      return [key, item?.daily_price && count ? String(item.daily_price * count) : current[key]];
    })));
  }
  useEffect(() => {
    if (purpose === 'renewal' && context?.items.length === 1 && !Object.keys(picks).length && !pending) {
      const [item] = context.items;
      setPicks({ [String(item.id)]: item.daily_price ? String(item.daily_price) : '' });
    }
  }, [purpose, context, picks, pending]);
  const extraAllowed = Boolean(context && canAddExtraReceipt(context.status) && context.total_amount !== null && context.paid_amount !== null);
  const refundAllowed = Boolean(context && canAddExtraReceipt(context.status) && context.deposit_held > 0);
  const refund = purpose === 'deposit_refund';
  const canCollect = purpose === 'renewal' ? renewable : purpose === 'extra' ? extraAllowed : refund ? refundAllowed : payable;
  const effectiveAmount = purpose === 'renewal' ? String(renewalTotal || '') : amount;
  function choosePurpose(next: PaymentPurpose) {
    setPurpose(next); setError(''); setSuccess('');
    if (next === 'deposit_refund' && context) setAmount(String(context.deposit_held));
    else if (next === 'debt' && context && context.remaining !== null && context.remaining > 0) setAmount(String(context.remaining));
    else if (next === 'extra' || next === 'renewal') setAmount('');
    if (context && (['debt', 'extra', 'deposit_refund', 'renewal'] as const).some(kind => note === defaultNote(kind, context.code)) || !note.trim()) setNote(defaultNote(next, context?.code || ''));
  }
  const locked = saving || Boolean(pending) || Boolean(transferReview);
  const money = (value: number | null) => value === null ? 'Chưa đối chiếu' : formatMoney(value);

  function changeAmount(input: HTMLInputElement) {
    const raw = input.value.replaceAll('.', '');
    if (!/^\d{0,13}$/.test(raw)) return;
    const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replaceAll('.', '').length;
    const formatted = groupAmount(raw);
    let position = 0, digits = 0;
    while (position < formatted.length && digits < digitsBeforeCaret) {
      if (formatted[position] !== '.') digits++;
      position++;
    }
    setAmount(raw);
    requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(position, position); });
  }

  async function deleteAllReceipts() {
    if (busy.current || !context?.history.length) return;
    busy.current = true; setDeleting(true); setError(''); setSuccess('');
    try {
      const deleted = await bulkDelete('transactions', context.history.map(receipt => receipt.id));
      const fresh = await loadPaymentContext(id);
      setContext(fresh); acceptContractPayment(fresh); setConfirmDeleteAll(false);
      const message = `Đã xóa ${deleted.length} phiếu Thu / Chi của hợp đồng ${fresh.code}.`;
      setSuccess(message); notify(message);
      onPaymentSaved?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được phiếu.'); }
    finally { busy.current = false; setDeleting(false); }
  }
  async function refresh() {
    setLoading(true);
    try { const fresh = await loadPaymentContext(id); setContext(fresh); acceptContractPayment(fresh); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử.'); }
    finally { setLoading(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !context) return;
    const input: PaymentInput = pending || transferReview?.input || { request_id: crypto.randomUUID(), revision: context.revision, amount: effectiveAmount, method, account_id: Number(effectiveAccount), paid_at: paidAt, note: note.trim(),
      ...(purpose === 'renewal' ? { purpose: 'renewal', items: renewalLines.map(line => ({ item_id: line.item.id, item_revision: line.item.revision, return_at: line.return_at, amount: line.amount || '0' })) }
        : purpose === 'extra' ? { purpose: 'extra' } : refund ? { purpose: 'deposit_refund' } : {}) };
    if (!pending && purpose === 'renewal' && (!renewalLines.length || !days || renewalLines.some(line => !line.return_at || !/^\d{1,13}$/.test(line.amount || '0')))) { setError('Chọn ít nhất một xe, số ngày gia hạn và tiền gia hạn từng xe.'); return; }
    if (!pending && (!canCollect || !/^[1-9]\d{0,12}$/.test(effectiveAmount) || (purpose === 'debt' && (context.remaining === null || Number(effectiveAmount) > context.remaining))
        || (refund && Number(effectiveAmount) > context.deposit_held) || !accounts.some(account => account.id === input.account_id))) {
      setError(refund ? 'Số tiền trả cọc không được vượt tiền cọc đang giữ; chọn tài khoản chi.' : 'Kiểm tra số tiền còn thiếu và tài khoản nhận.'); return;
    }
    if (!pending && purpose === 'extra' && !note.trim()) { setError('Nhập nội dung cho phiếu thu thêm.'); return; }
    if (!pending && !refund && input.method !== 'cash' && !transferReview) {
      try {
        const account = accounts.find(row => row.id === input.account_id)!;
        const qr = transferQr(account, input, context.code);
        setTransferReview({ input, account, qr }); setTransferConfirmed(false); setError(''); setSuccess('');
        const dialog = event.currentTarget.closest('dialog');
        requestAnimationFrame(() => { if (dialog) dialog.scrollTop = 0; });
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được QR chuyển khoản.'); }
      return;
    }
    if (!pending && transferReview && !transferConfirmed) { setError('Kiểm tra tiền vào tài khoản rồi xác nhận đã nhận đủ tiền.'); return; }
    // Persist before sending. A lost response must retry the same receipt, even after closing/reloading.
    try { sessionStorage.setItem(storageKey, JSON.stringify(input)); }
    catch { setError('Trình duyệt không lưu được lần thu. Cho phép lưu dữ liệu trang rồi thử lại.'); return; }
    busy.current = true; setSaving(true); setPending(input); setError(''); setSuccess('');
    try {
      const result = await saveContractPayment(id, input);
      sessionStorage.removeItem(storageKey); setPending(null); setTransferReview(null); setTransferConfirmed(false); setContext(result.context); acceptContractPayment(result.context);
      setAmount(''); setNote(defaultNote(purpose, result.context.code)); setPaidAt(vietnamPaymentTime());
      const message = `Đã xác nhận ${input.purpose === 'renewal' ? 'gia hạn và ' : ''}phiếu ${input.purpose === 'deposit_refund' ? 'Chi (trả cọc)' : 'Thu'} #${result.transaction_id} · ${formatMoney(Number(input.amount))}. Đã ghi vào Sổ quỹ / Sổ két.`;
      if (input.purpose === 'renewal') { setPicks({}); setRenewalDays('1'); }
      setSuccess(message); notify(message);
      onPaymentSaved?.();
      if (result.company_transfer && input.purpose !== 'deposit_refund') { selectStore('all'); onClose(); router.push(`/contracts/vat?contract_id=${id}`); }
    } catch (cause) {
      const definite = cause instanceof PaymentRequestError && cause.status >= 400 && cause.status < 500;
      if (definite) {
        sessionStorage.removeItem(storageKey); setPending(null); setTransferReview(null); setTransferConfirmed(false);
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
          {context.billing && <p className="mg-composer-hint">Thuê sở hữu · Lịch gồm {context.billing.period_count} kỳ, tổng tiền thuê {money(context.billing.expected_total)} (cọc riêng). Đã đóng đủ {context.billing.paid_periods} kỳ. {context.billing.stopped_at ? `Đã dừng phát sinh kỳ mới từ ${vietnamText(`${context.billing.stopped_at}:00+07:00`)}.` : context.billing.next_due_at ? `Ngày hẹn tiếp theo: ${vietnamText(`${context.billing.next_due_at}:00+07:00`)}.` : 'Đã đóng đủ tiền thuê theo lịch.'} Chỉ thu các khoản đã đến hạn.</p>}
          {(!transferReview || pending) && <dl className="mg-payment-totals"><div><dt>{context.billing ? 'Tiền thuê và phí đã đến hạn' : 'Tiền thuê hợp đồng'}</dt><dd>{money(context.total_amount)}</dd></div><div><dt>Đã thu tiền thuê</dt><dd>{money(context.paid_amount)}</dd></div><div><dt>Còn thiếu (không trừ cọc)</dt><dd>{money(context.remaining)}</dd></div>
            <div><dt>Tiền cọc đã thu</dt><dd>{formatMoney(context.deposit_paid)}</dd></div><div><dt>Đã trả cọc</dt><dd>{formatMoney(context.deposit_refunded)}</dd></div><div><dt>Cọc đang giữ</dt><dd>{formatMoney(context.deposit_held)}</dd></div></dl>}
          {transferReview && !pending ? <TransferQrPanel account={transferReview.account} input={transferReview.input} qr={transferReview.qr} confirmed={transferConfirmed} onConfirm={setTransferConfirmed} /> : <>
          {(payable || renewable || extraAllowed || refundAllowed || pending) && <label className="mg-payment-purpose">Nghiệp vụ<select aria-label="Nghiệp vụ" value={purpose} disabled={locked || loading} onChange={event => choosePurpose(event.target.value as PaymentPurpose)}><option value="debt" disabled={!payable}>Thu công nợ còn thiếu</option><option value="renewal" disabled={!renewable}>Thu tiền gia hạn</option><option value="extra" disabled={!extraAllowed}>Thêm phiếu thu (thu khác)</option><option value="deposit_refund" disabled={!refundAllowed}>Phiếu chi: Trả cọc cho khách</option></select></label>}
          {(canCollect || pending) ? <fieldset className="mg-payment-fields" disabled={locked || loading}>
            <label className="mg-field-wide">Loại phiếu<select aria-label="Loại phiếu" value={refund ? 'out' : 'in'} disabled={locked || loading}
              onChange={event => choosePurpose(event.target.value === 'out' ? 'deposit_refund' : payable ? 'debt' : renewable ? 'renewal' : 'extra')}>
              <option value="in" disabled={!payable && !renewable && !extraAllowed}>Phiếu thu</option>
              <option value="out" disabled={!refundAllowed}>{refundAllowed ? 'Phiếu chi (Trả cọc)' : 'Phiếu chi (Trả cọc) · không có cọc đang giữ'}</option>
            </select></label>
            <legend>{refund ? 'Ghi nhận trả cọc' : 'Ghi nhận lần thanh toán'}</legend>
            {purpose === 'renewal' && <>
              <label className="mg-field-wide">Số ngày gia hạn<input aria-label="Số ngày gia hạn" type="number" min={1} max={365} required value={renewalDays} onChange={event => changeDays(event.target.value)} /></label>
              <div className="mg-field-wide mg-renewal-picks" role="group" aria-label="Xe cần gia hạn"><strong>Xe cần gia hạn (chọn 1 hoặc nhiều xe)</strong>
                {context.items.map(item => {
                  const key = String(item.id), checked = key in picks, line = renewalLines.find(row => row.item.id === item.id);
                  return <div key={item.id} className={`mg-renewal-pick${checked ? ' is-checked' : ''}`}>
                    <label className="mg-renewal-pick-name"><input type="checkbox" checked={checked} onChange={event => togglePick(item, event.target.checked)} />{item.name || 'Xe'} · {item.license || `#${item.vehicle_id}`}</label>
                    <small>Hẹn trả: {item.return_at ? vietnamText(item.return_at) : 'chưa có'}{checked && line?.return_at ? ` → ${vietnamText(`${line.return_at}:00+07:00`)}` : ''}{item.daily_price ? ` · ${formatMoney(item.daily_price)}/ngày` : ' · chưa có đơn giá/ngày'}</small>
                    {checked && <input aria-label={`Tiền gia hạn ${item.license}`} inputMode="numeric" placeholder="Tiền gia hạn" value={groupAmount(picks[key] || '')}
                      onChange={event => { const raw = event.target.value.replaceAll('.', ''); if (/^\d{0,13}$/.test(raw)) setPicks(current => ({ ...current, [key]: raw })); }} />}
                  </div>;
                })}</div>
              <p className="mg-field-wide">Phí gia hạn được cộng vào tiền thuê hợp đồng và tổng đã thu. Chỉ đổi ngày trả của các xe đã chọn.</p>
            </>}
            {purpose === 'extra' && <p className="mg-field-wide">Khoản thu thêm (phụ thu, phí phát sinh…) được cộng vào tiền hợp đồng và tổng đã thu, ghi thành phiếu Thu trong Sổ quỹ / Sổ két. Công nợ còn thiếu không đổi.</p>}
            {refund && <p className="mg-field-wide">Trả lại tiền cọc cho khách: ghi phiếu Chi trong Sổ quỹ / Sổ két, không làm thay đổi tiền thuê và công nợ. Tối đa {formatMoney(context.deposit_held)}.</p>}
            {purpose === 'renewal' ? <label>Tổng tiền gia hạn (VNĐ)<input aria-label="Số tiền thu (VNĐ)" value={groupAmount(effectiveAmount)} readOnly placeholder="Chọn xe và nhập tiền" /></label>
            : <label>{refund ? 'Số tiền chi (VNĐ)' : 'Số tiền thu (VNĐ)'}<input aria-label="Số tiền thu (VNĐ)" inputMode="numeric" pattern="[1-9][0-9.]{0,16}" maxLength={17} required value={groupAmount(amount)} onChange={event => changeAmount(event.currentTarget)} onKeyDown={event => {
              const input = event.currentTarget, position = input.selectionStart;
              if (event.ctrlKey || event.metaKey || event.altKey || position === null || position !== input.selectionEnd) return;
              if (event.key === 'Backspace' && input.value[position - 1] === '.') input.setSelectionRange(position - 1, position - 1);
              if (event.key === 'Delete' && input.value[position] === '.') input.setSelectionRange(position + 1, position + 1);
            }} placeholder="Nhập số tiền" /></label>}
            <label className="mg-field-wide">{refund ? 'Ngày giờ chi (24h)' : 'Ngày giờ thu (24h)'}<DateTime24Controls id="payment-paid-at" label={refund ? 'Ngày giờ chi' : 'Ngày giờ thu'} value={paidAt} onChange={setPaidAt} /></label>
            <label className="mg-field-wide">Hình thức thanh toán<select aria-label="Hình thức thanh toán" value={method} onChange={event => { setMethod(event.target.value as PaymentMethod); setAccountId(''); }}>
              {PAYMENT_METHODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select></label>
            <label className="mg-field-wide">{refund ? 'Tài khoản chi' : 'Tài khoản nhận'}<select aria-label="Tài khoản nhận" required value={effectiveAccount} onChange={event => setAccountId(event.target.value)}>
              <option value="">{refund ? 'Chọn tài khoản chi' : 'Chọn tài khoản nhận'}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select></label>
            {!accounts.length && <p className="mg-field-wide mg-field-error">{method === 'company_transfer' ? 'Chưa có tài khoản công ty được cấu hình. Cần bổ sung thông tin ngân hàng trước khi thu.' : 'Chưa có tài khoản nhận đang hoạt động tại cơ sở của hợp đồng.'}</p>}
            <label className="mg-field-wide">{refund ? 'Nội dung chi' : 'Nội dung thu / chuyển khoản'}<textarea aria-label="Nội dung thu / chuyển khoản" maxLength={2000} required={purpose === 'extra'} value={note} onChange={event => setNote(event.target.value)} rows={2} /></label>
            {method === 'company_transfer' && !refund && <p className="mg-field-wide">Sau khi ghi nhận, hợp đồng sẽ có trong Hợp đồng VAT và chuyển đến danh sách đó.</p>}
          </fieldset> : <p>{context.remaining === null ? 'Cần đối chiếu số liệu tiền trước khi thu.' : !extraAllowed ? 'Trạng thái hợp đồng này chưa cho phép thu tiền.' : context.remaining === 0 ? 'Không còn công nợ theo số liệu hiện có. Bấm Thêm phiếu thu để ghi khoản thu khác vào Sổ quỹ.' : 'Trạng thái hợp đồng này chưa cho phép thu công nợ. Bấm Thêm phiếu thu để ghi khoản thu khác vào Sổ quỹ.'}</p>}</>}
          <div className="mg-payment-history-heading"><h3>Lịch sử phiếu Thu / Chi ({context.history.length})</h3><div className="mg-payment-history-actions">
            {refundAllowed && !refund && <button type="button" className="mg-button" disabled={locked || loading} onClick={() => choosePurpose('deposit_refund')}><Wallet size={15} />Trả cọc</button>}
            {extraAllowed && !(purpose === 'extra' && canCollect) && <button type="button" className="mg-button mg-button-primary" disabled={locked || loading} onClick={() => choosePurpose('extra')}><Plus size={15} />Thêm phiếu thu</button>}
            {context.history.length > 0 && <button type="button" className="mg-button mg-button-danger" disabled={locked || loading || deleting} onClick={() => setConfirmDeleteAll(true)}><Trash2 size={15} />Xóa hết phiếu</button>}
            <button type="button" className="mg-button" disabled={locked || loading} onClick={() => void refresh()}><RotateCcw size={15} />Làm mới</button></div></div>
          {confirmDeleteAll && context.history.length > 0 && <div className="mg-payment-delete-confirm" role="alertdialog" aria-label="Xác nhận xóa hết phiếu">
            <p>Xóa vĩnh viễn <strong>{context.history.length} phiếu</strong> của hợp đồng {context.code} (thu {formatMoney(context.history.filter(receipt => receipt.type !== 'out').reduce((sum, receipt) => sum + receipt.amount, 0))}, chi {formatMoney(context.history.filter(receipt => receipt.type === 'out').reduce((sum, receipt) => sum + receipt.amount, 0))}) khỏi Sổ quỹ / Sổ két?
              Tổng đã thu của hợp đồng giảm tương ứng; phiếu gia hạn / thu thêm cũng trừ khỏi tiền hợp đồng. Không hoàn tác được.</p>
            <div><button type="button" className="mg-button" disabled={deleting} onClick={() => setConfirmDeleteAll(false)}>Hủy</button>
              <button type="button" className="mg-button mg-button-danger" disabled={deleting} onClick={() => void deleteAllReceipts()}>{deleting ? <LoaderCircle size={15} className="mg-spin" /> : <Trash2 size={15} />}{deleting ? 'Đang xóa…' : 'Xóa hết'}</button></div>
          </div>}
          {context.history.length > 0 && <div className="mg-payment-history-columns">{(['in', 'out'] as const).map(type => {
            const receipts = context.history.filter(receipt => (receipt.type === 'out' ? 'out' : 'in') === type);
            const sum = receipts.reduce((total, receipt) => total + receipt.amount, 0);
            return <section key={type} className={type === 'out' ? 'is-expense' : 'is-income'}>
              <h4>{type === 'out' ? 'Phiếu Chi' : 'Phiếu Thu'} ({receipts.length}) · {type === 'out' ? '−' : ''}{formatMoney(sum)}</h4>
              {receipts.length ? <ul className="mg-payment-history">{receipts.map(receipt => <li key={receipt.id} className={type === 'out' ? 'is-expense' : undefined}>
                <strong>#{receipt.id}{receipt.deposit ? (type === 'out' ? ' · Trả cọc' : ' · Tiền cọc') : ''} · {type === 'out' ? '−' : ''}{formatMoney(receipt.amount)}</strong>
                <span>{vietnamText(receipt.paid_at)} · {receipt.method}</span><span>{receipt.account || 'Chưa xác định tài khoản'} · {receipt.actor || '—'}</span>
                {receipt.note && <p>{receipt.note}</p>}{receipt.renewal && <span>Gia hạn {receipt.renewal.license || receipt.renewal.vehicle_name} đến {vietnamText(receipt.renewal.return_at)}</span>}</li>)}</ul>
                : <p className="mg-payment-history-empty">Chưa có phiếu {type === 'out' ? 'chi' : 'thu'}.</p>}
            </section>;
          })}</div>}
          {!context.history.length && <p>Chưa có phiếu Thu / Chi được duyệt.</p>}
          <Link href="/cashbook" aria-disabled={saving} onClick={event => { if (busy.current) event.preventDefault(); else onClose(); }}>Mở Sổ quỹ / Sổ két</Link>
        </>}
        {success && <p className="mg-payment-success" role="status">{success}</p>}
        {error && <p className="mg-field-error" role="alert">{error}</p>}
        {!context && !loading && <button type="button" className="mg-button" onClick={() => void refresh()}>Tải lại thông tin</button>}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
        {transferReview && !pending && <button type="button" className="mg-button" disabled={saving} onClick={() => { setTransferReview(null); setTransferConfirmed(false); setError(''); }}>Quay lại</button>}
        {(canCollect || pending || transferReview) && <button type="submit" className="mg-button mg-button-primary" disabled={saving || loading || !context || (!pending && (!accounts.length || Boolean(transferReview && !transferConfirmed)))}>{saving ? <LoaderCircle className="mg-spin" size={16} /> : <Wallet size={16} />}{saving ? 'Đang ghi nhận…' : pending ? 'Thử lại lần thu này' : transferReview ? 'Xác nhận đã nhận tiền' : refund ? 'Ghi phiếu chi trả cọc' : method !== 'cash' ? 'Hiện mã QR chuyển khoản' : purpose === 'renewal' ? 'Thu tiền và gia hạn' : purpose === 'extra' ? 'Ghi phiếu thu vào Sổ quỹ' : 'Ghi nhận thanh toán'}</button>}
      </div>
    </form>
  </Dialog>;
}

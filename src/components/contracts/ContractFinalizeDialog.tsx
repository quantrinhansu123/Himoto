'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { PAYMENT_METHODS, PaymentContext, PaymentMethod, loadPaymentContext, paymentAccounts, vietnamPaymentTime } from '@/lib/management/contract-payments';
import { FinalizeReceipt, FinalizeResult, finalizeContract } from '@/lib/management/contract-finalize';

const money = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
interface ReceiptState { collect: boolean; method: PaymentMethod; account: string }

export function ContractFinalizeDialog({ orderId, revision, code, total, deposit, depositMethod, rentalMethod, onClose, onDone }: {
  orderId: number; revision: string; code: string; total: number; deposit: number; depositMethod: PaymentMethod; rentalMethod: PaymentMethod;
  onClose: () => void; onDone: (result: FinalizeResult) => void;
}) {
  const [context, setContext] = useState<PaymentContext | null>(null);
  const [loadError, setLoadError] = useState('');
  const [paidAt, setPaidAt] = useState(() => vietnamPaymentTime());
  const [depositState, setDepositState] = useState<ReceiptState>({ collect: deposit > 0, method: depositMethod, account: '' });
  const [rentalState, setRentalState] = useState<ReceiptState>({ collect: total > 0, method: rentalMethod, account: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    loadPaymentContext(orderId, controller.signal).then(setContext)
      .catch(cause => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Không tải được danh sách tài khoản nhận tiền.'); });
    return () => controller.abort();
  }, [orderId]);

  function accountsFor(state: ReceiptState) { return context ? paymentAccounts(context, state.method) : []; }
  function chosenAccount(state: ReceiptState) {
    const accounts = accountsFor(state);
    return accounts.find(account => String(account.id) === state.account) || accounts[0];
  }
  function receipt(state: ReceiptState, amount: number): FinalizeReceipt | null {
    if (!state.collect || amount <= 0) return null;
    const account = chosenAccount(state);
    if (!account) throw new Error(`Không có tài khoản ${PAYMENT_METHODS.find(item => item.value === state.method)?.label} đang hoạt động cho cơ sở này.`);
    return { method: state.method, account_id: account.id };
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !context) return;
    setError('');
    let input;
    try { input = { revision, paid_at: paidAt, deposit: receipt(depositState, deposit), rental: receipt(rentalState, total) }; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chọn tài khoản nhận tiền.'); return; }
    busy.current = true; setSaving(true);
    try { onDone(await finalizeContract(orderId, input)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu chính thức được hợp đồng.'); }
    finally { busy.current = false; setSaving(false); }
  }

  function receiptFields(label: string, amount: number, state: ReceiptState, setState: (next: ReceiptState) => void) {
    if (amount <= 0) return <div className="mg-finalize-receipt"><strong>{label}</strong><span>Không có — không ghi phiếu thu.</span></div>;
    const accounts = accountsFor(state);
    return <fieldset className="mg-finalize-receipt"><legend>{label}: {money(amount)}</legend>
      <label className="mg-checkbox"><input type="checkbox" checked={state.collect} onChange={event => setState({ ...state, collect: event.target.checked })} />Đã thu, ghi phiếu thu vào Sổ quỹ</label>
      {state.collect && <div className="mg-form-grid mg-contract-grid-two">
        <div className="mg-field"><label>Hình thức<select value={state.method} onChange={event => setState({ ...state, method: event.target.value as PaymentMethod, account: '' })}>
          {PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label></div>
        <div className="mg-field"><label>Tài khoản nhận<select value={chosenAccount(state) ? String(chosenAccount(state)!.id) : ''} disabled={!accounts.length} onChange={event => setState({ ...state, account: event.target.value })}>
          {accounts.length ? accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>) : <option value="">Chưa có tài khoản phù hợp</option>}</select></label></div>
      </div>}
      {!state.collect && <small>Chưa thu — số tiền này sẽ là công nợ, thu sau bằng nút Thanh toán.</small>}
    </fieldset>;
  }

  return <Dialog title={`Lưu chính thức ${code}`} onClose={saving ? () => {} : onClose}>
    <form onSubmit={submit}>
      <div className="mg-dialog-body mg-finalize-dialog">
        <p className="mg-composer-hint">Hợp đồng sẽ chuyển sang <strong>Đang thuê</strong>, được cấp số hợp đồng chính thức, xe chuyển sang trạng thái Đang thuê và rời khỏi mục Hợp đồng nháp. Bước này không hoàn tác được.</p>
        {loadError ? <p className="mg-field-error" role="alert">{loadError}</p> : !context ? <p role="status"><LoaderCircle size={16} className="mg-spin" /> Đang tải tài khoản nhận tiền…</p> : <>
          {receiptFields('Tiền cọc', deposit, depositState, setDepositState)}
          {receiptFields('Tiền thuê xe', total, rentalState, setRentalState)}
          {(deposit > 0 || total > 0) && <div className="mg-field"><label>Thời điểm thu<input type="datetime-local" value={paidAt} max={vietnamPaymentTime()} onChange={event => setPaidAt(event.target.value)} /></label></div>}
        </>}
        {error && <p className="mg-field-error" role="alert">{error}</p>}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Quay lại</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={saving || !context}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <CheckCircle2 size={16} />}{saving ? 'Đang lưu…' : 'Xác nhận lưu chính thức'}</button></div>
    </form>
  </Dialog>;
}

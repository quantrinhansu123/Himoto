'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { PAYMENT_METHODS, PaymentContext, PaymentMethod, loadPaymentContext, paymentAccounts, paymentMethodLabel, vietnamPaymentTime } from '@/lib/management/contract-payments';
import { FinalizeCollection, FinalizeResult, balanceCollectionAmounts, finalizeContract } from '@/lib/management/contract-finalize';
import type { ContractCharge } from '@/lib/management/contract-charges';
import { DateTime24Field } from './DateTime24Field';

const money = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
const formatInput = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
interface CollectionRow { key: number; amount: string; method: PaymentMethod; account: string; paid_at: string; label?: string; automatic?: boolean }
interface CollectionState { collect: boolean; rows: CollectionRow[] }

export function ContractFinalizeDialog({ orderId, revision, code, total, deposit, depositMethods, rentalMethods, charges = [], reservation = false, onClose, onDone }: {
  orderId: number; revision: string; code: string; total: number; deposit: number; depositMethods: PaymentMethod[]; rentalMethods: PaymentMethod[];
  charges?: ContractCharge[]; reservation?: boolean; onClose: () => void; onDone: (result: FinalizeResult) => void;
}) {
  const [context,setContext] = useState<PaymentContext|null>(null), [loadError,setLoadError] = useState('');
  const [depositState,setDepositState] = useState<CollectionState>({collect:false,rows:[]});
  const [rentalState,setRentalState] = useState<CollectionState>({collect:false,rows:[]});
  const [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const busy = useRef(false), nextKey = useRef(0);
  const initialMethods = useRef({deposit:depositMethods,rental:rentalMethods,charges});
  const depositDue = Math.max(deposit-(context?.deposit_paid || 0),0), rentalDue = Math.max(total-(context?.paid_amount || 0),0);
  const newRow = (method: PaymentMethod, amount = ''): CollectionRow => ({key:nextKey.current++,method,amount,account:'',paid_at:vietnamPaymentTime()});

  useEffect(()=>{
    const controller = new AbortController();
    loadPaymentContext(orderId,controller.signal).then(value=>{
      if (controller.signal.aborted) return;
      setContext(value);
      const row = (method: PaymentMethod, amount: string, label?: string): CollectionRow => ({key:nextKey.current++,method,amount,account:'',paid_at:vietnamPaymentTime(),label});
      const seed = (due: number, methods: PaymentMethod[], label?: string) => due>0 ? methods.map((method,index)=>({...row(method,methods.length===1 ? String(due) : '',label),automatic:!reservation && methods.length>1 && index===methods.length-1})) : [];
      const depositDue = Math.max(deposit-value.deposit_paid,0), rentalDue = Math.max(total-(value.paid_amount || 0),0);
      const fees = initialMethods.current.charges.filter(item=>item.name.trim() && Number(item.amount)>0);
      const feeTotal = fees.reduce((sum,item)=>sum+Number(item.amount),0);
      const rentalRows = feeTotal && feeTotal<=rentalDue
        ? [...seed(rentalDue-feeTotal,initialMethods.current.rental,'Tiền thuê xe'),...fees.map(item=>row(item.method || initialMethods.current.rental[0],item.amount,item.name.trim()))]
        : seed(rentalDue,initialMethods.current.rental);
      setDepositState(reservation ? {collect:false,rows:[]} : {collect:depositDue>0,rows:seed(depositDue,initialMethods.current.deposit)});
      setRentalState({collect:rentalDue>0,rows:reservation ? rentalRows.map(item=>({...item,amount:''})) : rentalRows});
    }).catch(cause=>{if(!controller.signal.aborted)setLoadError(cause instanceof Error ? cause.message : 'Không tải được tài khoản nhận tiền.');});
    return ()=>controller.abort();
  },[orderId,deposit,total,reservation]);

  const accountsFor = (row: CollectionRow) => context ? paymentAccounts(context,row.method) : [];
  const chosenAccount = (row: CollectionRow) => accountsFor(row).find(account=>String(account.id)===row.account) || accountsFor(row)[0];
  const collected = (state: CollectionState) => state.collect ? state.rows.reduce((sum,row)=>sum+(Number(row.amount)||0),0) : 0;
  function collections(state: CollectionState, purpose: FinalizeCollection['purpose'], due: number): FinalizeCollection[] {
    if (!state.collect || !due) return [];
    if (!state.rows.length) throw new Error('Thêm khoản tiền đã nhận, hoặc bỏ chọn thu tiền để ghi nhận chưa thu.');
    if (collected(state)>due) throw new Error(`Khoản ${purpose==='deposit' ? 'cọc' : 'thuê/phí'} vượt số còn phải thu ${money(due)}.`);
    return state.rows.filter(row=>!(row.automatic && row.amount==='0')).map(row=>{
      if (!/^[1-9]\d{0,12}$/.test(row.amount) || !Number.isSafeInteger(Number(row.amount))) throw new Error('Nhập số tiền lớn hơn 0 cho từng khoản thu.');
      const account = chosenAccount(row);
      if (!account) throw new Error('Chọn tài khoản nhận tiền đang hoạt động tại cơ sở nguồn khách.');
      if (!row.paid_at) throw new Error('Nhập thời điểm thực tế đã nhận tiền.');
      return {purpose,amount:row.amount,method:row.method,account_id:account.id,paid_at:row.paid_at};
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if(busy.current || !context)return; setError('');
    let receipts: FinalizeCollection[];
    try {receipts=[...collections(depositState,'deposit',depositDue),...collections(rentalState,'rental',rentalDue)]; if (reservation && !receipts.length) throw new Error('Nhập khoản tiền giữ xe đã nhận.');}
    catch(cause){setError(cause instanceof Error ? cause.message : 'Kiểm tra các khoản đã nhận.');return;}
    busy.current=true;setSaving(true);
    try{onDone(await finalizeContract(orderId,{revision,receipts,...(reservation ? {reservation:true as const} : {})}));}
    catch(cause){setError(cause instanceof Error ? cause.message : 'Không lưu chính thức được hợp đồng.');}
    finally{busy.current=false;setSaving(false);}
  }

  function section(purpose: FinalizeCollection['purpose'], label: string, amount: number, due: number, state: CollectionState, setState: (next: CollectionState)=>void) {
    const update = (key: number, patch: Partial<CollectionRow>) => setState({...state,rows:balanceCollectionAmounts(state.rows.map(row=>row.key===key ? {...row,...patch,...(patch.amount!==undefined ? {automatic:false} : {})} : row),due)});
    const add = () => {
      const hasAutomatic = state.rows.some(row=>row.automatic);
      const added = {...newRow('cash',hasAutomatic ? '' : String(Math.max(due-collected(state),0))),automatic:!reservation && !hasAutomatic};
      setState({...state,rows:balanceCollectionAmounts([...state.rows,added],due)});
    };
    return <fieldset className="mg-finalize-receipt" data-purpose={purpose}><legend>{label}: {money(amount)}</legend>
      <p className="mg-composer-hint">Đã ghi nhận trước: {money(amount-due)} · Còn phải thu: {money(due)}</p>
      {due>0 && <><label className="mg-checkbox"><input type="checkbox" checked={state.collect} onChange={event=>setState({...state,collect:event.target.checked})} />{purpose === 'deposit' ? 'Đã nhận tiền cọc' : 'Khách đã thanh toán tiền thuê / phí'}</label>
        {state.collect && <>
          {state.rows.map((row,index)=><div className="mg-collection-row" key={row.key}>
            <div className="mg-collection-row-heading"><strong>Khoản {index+1}{row.label ? ` · ${row.label}` : ''}</strong><button type="button" className="mg-icon-button" aria-label={`Bỏ khoản ${label.toLowerCase()} ${index+1}`} onClick={()=>setState({...state,rows:balanceCollectionAmounts(state.rows.filter(item=>item.key!==row.key),due)})}><Trash2 size={15}/></button></div>
            <div className="mg-form-grid mg-contract-grid-two">
              <div className="mg-field"><label htmlFor={`${purpose}-collection-${index}-amount`}>Số tiền đã nhận (VNĐ)</label><input id={`${purpose}-collection-${index}-amount`} inputMode="numeric" value={formatInput(row.amount)} onChange={event=>update(row.key,{amount:event.target.value.replace(/\D/g,'')})}/>{row.automatic && <small>Tự tính phần còn lại. Có thể sửa theo số tiền thực nhận.</small>}</div>
              <div className="mg-field"><label htmlFor={`${purpose}-collection-${index}-method`}>Hình thức</label><select id={`${purpose}-collection-${index}-method`} value={row.method} onChange={event=>update(row.key,{method:event.target.value as PaymentMethod,account:''})}>{PAYMENT_METHODS.map(method=><option key={method.value} value={method.value}>{paymentMethodLabel(method.value)}</option>)}</select></div>
              <div className="mg-field"><label htmlFor={`${purpose}-collection-${index}-account`}>Tài khoản nhận</label><select id={`${purpose}-collection-${index}-account`} value={chosenAccount(row)?.id || ''} disabled={!accountsFor(row).length} onChange={event=>update(row.key,{account:event.target.value})}>{accountsFor(row).length ? accountsFor(row).map(account=><option key={account.id} value={account.id}>{account.label}</option>) : <option value="">Chưa có tài khoản phù hợp</option>}</select></div>
              <DateTime24Field id={`${purpose}-collection-${index}-paid-at`} label="Thời điểm nhận" value={row.paid_at} onChange={value=>update(row.key,{paid_at:value})}/>
            </div>
          </div>)}
          <button type="button" className="mg-button" disabled={state.rows.length>=20} onClick={add}><Plus size={15}/>Thêm khoản thu {purpose==='deposit' ? 'cọc' : 'thuê/phí'}</button>
          <p className={collected(state)>due ? 'mg-field-error' : 'mg-composer-hint'}>Sẽ ghi nhận: {money(collected(state))} · Còn chưa thu: {money(Math.max(due-collected(state),0))}</p>
        </>}
        {!state.collect && <small>Chưa nhận tiền: giữ nguyên số còn phải thu, không ghi nhận vào tài khoản.</small>}
      </>}
      {due > 0 && <p className="mg-payment-state" role="status">{collected(state) === due ? 'Đã thanh toán đủ' : collected(state) > 0 ? 'Thanh toán một phần' : 'Chưa thanh toán'}</p>}
    </fieldset>;
  }
  return <Dialog title={`${reservation ? 'Xác nhận cọc giữ xe' : 'Xác nhận thanh toán'} · ${code}`} onClose={saving ? ()=>{} : onClose}>
    <form onSubmit={submit}><div className="mg-dialog-body mg-finalize-dialog">
      <p className="mg-composer-hint">{reservation ? 'Nhập đúng tiền giữ xe đã nhận (ví dụ 100.000 hoặc 200.000 đ), thời điểm và tài khoản nhận. Khoản này trừ vào tiền thuê, tạo phiếu Thu ngay; xe ở trạng thái chờ giao, chưa Đang thuê.' : 'Ghi đúng từng khoản tiền đã nhận và tài khoản nhận. Cọc trước ghi ngày nhận trước đó; mỗi lần chuyển khoản hoặc nhận tiền mặt thêm một dòng. Sau xác nhận, hợp đồng được phát hành và xe chuyển sang Đang thuê.'}</p>
      {charges.length>0 && <p className="mg-composer-hint">Phí khác trong hợp đồng: {charges.filter(item=>Number(item.amount)>0).map(item=>`${item.name}: ${money(Number(item.amount))}`).join(' · ')}</p>}
      {loadError ? <p role="alert" className="mg-field-error">{loadError}</p> : !context ? <p role="status"><LoaderCircle size={16} className="mg-spin"/> Đang tải tài khoản nhận tiền…</p> : <>
        {!reservation && section('deposit','Tiền cọc',deposit,depositDue,depositState,setDepositState)}
        {section('rental',reservation ? 'Tiền thuê dự kiến' : 'Tiền thuê và phí khác',total,rentalDue,rentalState,setRentalState)}
        <p className="mg-collection-total">{reservation ? 'Tiền giữ xe đã nhận' : 'Tổng nhận thêm'}: <strong>{money(collected(depositState)+collected(rentalState))}</strong>{!reservation && <><br/>Cọc: {money(collected(depositState))} · Thuê/phí: {money(collected(rentalState))}</>}</p>
      </>}
      {error && <p className="mg-field-error" role="alert">{error}</p>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Quay lại</button><button type="submit" className="mg-button mg-button-primary" disabled={saving || !context}>{saving ? <LoaderCircle size={16} className="mg-spin"/> : <CheckCircle2 size={16}/>}{saving ? 'Đang lưu…' : reservation ? 'Xác nhận đã nhận cọc giữ xe' : 'Xác nhận lưu chính thức'}</button></div></form>
  </Dialog>;
}

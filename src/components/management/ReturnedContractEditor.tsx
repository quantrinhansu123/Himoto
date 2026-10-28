'use client';

import { useEffect,useRef,useState } from 'react';
import { LoaderCircle,MessageCircle,Plus,Save,Trash2 } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { ContractTransactionPhotos } from './ContractTransactionPhotos';
import { ContractTelegramPanel } from './ContractTelegramPanel';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { formatMoney } from '@/lib/formatters';
import { loadReturnCorrection,saveReturnCorrection,type ReturnCorrectionContext } from '@/lib/management/return-corrections';
import { paymentAccounts,PAYMENT_METHODS,vietnamPaymentTime,type PaymentMethod } from '@/lib/management/contract-payments';
import type { ReturnInput,ReturnReceipt,ReturnRefund,ReturnSettlement } from '@/lib/management/contract-returns';

type Kind=ReturnReceipt['kind']|'refund'|'rental_refund';
type Receipt=ReturnRefund&{kind:Kind;key:string};
const labels:Record<Kind,string>={late_fee:'Thu phí quá hạn',repair_fee:'Thu phí sửa chữa',rental_debt:'Thu công nợ thuê xe',refund:'Hoàn cọc',rental_refund:'Hoàn tiền thuê trả sớm'};
const local=(value:string)=>new Date(Date.parse(value)+7*3600000).toISOString().slice(0,16);
const moneyInput=(value:string)=>value.replace(/\D/g,'').slice(0,13);
function initialItems(context:ReturnCorrectionContext):ReturnInput[] {return context.lines.map(line=>({item_id:line.item_id,item_revision:line.item_revision,returned_at:local(line.completed_at!),hourly_rate:String(line.hourly_rate),fee_override:String(line.late_fee),repair_fee:String(line.repair_fee),repair_note:line.repair_note,early_discount:String(line.early_discount)}));}
function initialReceipts(settlement:ReturnSettlement):Receipt[] {
  return [...settlement.receipts,...(settlement.refund?[{...settlement.refund,kind:'refund' as const}]:[]),...(settlement.rental_refund?[{...settlement.rental_refund,kind:'rental_refund' as const}]:[])].map(r=>({...r,request_id:crypto.randomUUID(),key:crypto.randomUUID()}));
}

export function ReturnedContractEditor({itemId,initialStep='edit',onClose,onSaved}:{itemId:number;initialStep?:'edit'|'telegram';onClose:()=>void;onSaved:()=>void}) {
  const {notify,reload}=useManagement();
  const [context,setContext]=useState<ReturnCorrectionContext>(),[items,setItems]=useState<ReturnInput[]>([]),[receipts,setReceipts]=useState<Receipt[]>([]);
  const [recipient,setRecipient]=useState({bank:'',account:'',name:''}),[deferred,setDeferred]=useState(false),[note,setNote]=useState(''),[reason,setReason]=useState('');
  const [step,setStep]=useState(initialStep),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0);
  const [photoItem,setPhotoItem]=useState(itemId),[pending,setPending]=useState<Record<number,boolean>>({}),[photoVersion,setPhotoVersion]=useState(0);
  const busyRef=useRef(false),baseline=useRef(''),request=useRef<{body:string;id:string}|undefined>(undefined);
  const form=useRef<HTMLFormElement>(null);
  const snapshot=JSON.stringify({items,receipts,recipient,deferred,note});
  const dirty=Boolean(context&&baseline.current&&baseline.current!==snapshot),photosPending=Object.values(pending).some(Boolean);
  function accept(value:ReturnCorrectionContext){
    const nextItems=initialItems(value),nextReceipts=initialReceipts(value.settlement),nextRecipient={bank:value.settlement.refund_recipient?.bank||'',account:value.settlement.refund_recipient?.account||'',name:value.settlement.refund_recipient?.name||''},nextDeferred=Boolean(value.settlement.refund_deferred);
    setContext(value);setItems(nextItems);setReceipts(nextReceipts);setRecipient(nextRecipient);setDeferred(nextDeferred);setNote(value.note);setReason('');
    baseline.current=JSON.stringify({items:nextItems,receipts:nextReceipts,recipient:nextRecipient,deferred:nextDeferred,note:value.note});
  }
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');void loadReturnCorrection(itemId,controller.signal).then(value=>{if(!controller.signal.aborted)accept(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được lượt trả.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[itemId,retry]);
  function close(){if(saving)return;if((dirty||photosPending)&&!window.confirm('Có thông tin hoặc ảnh/video chưa lưu. Đóng và bỏ phần chưa lưu?'))return;onClose();}
  function updateItem(id:number,patch:Partial<ReturnInput>){setItems(rows=>rows.map(row=>row.item_id===id?{...row,...patch}:row));}
  function updateReceipt(key:string,patch:Partial<Receipt>){setReceipts(rows=>rows.map(row=>row.key===key?{...row,...patch}:row));}
  async function save(){
    if(!context||busyRef.current||photosPending)return;
    if(!form.current?.reportValidity())return;
    const payment=(r:Receipt)=>({request_id:r.request_id,amount:r.amount,method:r.method,account_id:r.account_id,paid_at:r.paid_at,
      ...(['refund','rental_refund'].includes(r.kind)&&r.method!=='cash'?{recipient_bank:r.recipient_bank,recipient_account:r.recipient_account,recipient_name:r.recipient_name}:{})});
    const settlement:ReturnSettlement={order_id:context.order_id,revision:context.settlement.revision,receipts:receipts.filter(r=>!['refund','rental_refund'].includes(r.kind)).map(r=>({...payment(r),kind:r.kind as ReturnReceipt['kind']})),
      ...(receipts.find(r=>r.kind==='refund')?{refund:payment(receipts.find(r=>r.kind==='refund')!)}:{}),
      ...(receipts.find(r=>r.kind==='rental_refund')?{rental_refund:payment(receipts.find(r=>r.kind==='rental_refund')!)}:{}),
      ...(deferred&&!receipts.some(r=>r.kind==='refund')?{refund_deferred:true,refund_recipient:recipient}:{})};
    const body={item_id:itemId,revision:context.revision,reason:reason.trim(),note,items,settlement},key=JSON.stringify(body);
    if(request.current?.body!==key)request.current={body:key,id:crypto.randomUUID()};
    busyRef.current=true;setSaving(true);setError('');
    try{const value=await saveReturnCorrection({...body,request_id:request.current!.id});accept(value);setStep('telegram');setPhotoVersion(v=>v+1);notify('Đã lưu bản sửa trả xe. Kiểm tra nội dung trước khi gửi Telegram.');onSaved();void reload(['contracts']);}
    catch(cause){setError(cause instanceof Error?cause.message:'Chưa xác nhận được bản sửa. Giữ form và thử lại.');}
    finally{busyRef.current=false;setSaving(false);}
  }
  const adjustment=items.reduce((sum,i)=>sum+Number(i.fee_override||0)+Number(i.repair_fee||0)-Number(i.early_discount||0),0);
  const estimatedTotal=context?.payment.total_amount==null?null:context.payment.total_amount-context.previous_adjustment+adjustment;
  const income=receipts.filter(r=>!['refund','rental_refund'].includes(r.kind)).reduce((sum,r)=>sum+Number(r.amount||0),0),rentalRefund=Number(receipts.find(r=>r.kind==='rental_refund')?.amount||0);
  const remaining=estimatedTotal===null||context?.payment.paid_amount==null?null:estimatedTotal-context.payment.paid_amount-income+rentalRefund;
  return <Dialog title={step==='edit'?'Sửa hồ sơ trả xe':'Kiểm tra & gửi Telegram · Trả xe'} subtitle={context?`${context.code} · ${context.customer}`:'Đang tải lượt trả xe…'} className="mg-return-correction-dialog" onClose={close} dismissOnBackdrop={false}>
    <form ref={form} onSubmit={e=>e.preventDefault()}>
      <div className="mg-dialog-body">
        {loading?<p role="status"><LoaderCircle size={16} className="mg-spin"/> Đang tải hồ sơ và các phiếu thu/hoàn…</p>:context&&<>
          <div className="mg-return-correction-steps" aria-label="Các bước sửa và gửi"><button type="button" className={`mg-button${step==='edit'?' is-active':''}`} onClick={()=>setStep('edit')}>1. Sửa hồ sơ</button><button type="button" className={`mg-button${step==='telegram'?' is-active':''}`} disabled={dirty||photosPending||saving} onClick={()=>setStep('telegram')}>2. Kiểm tra & gửi Telegram</button></div>
          {step==='telegram'?<ContractTelegramPanel key={`${context.revision}-${photoVersion}`} id={context.order_id} returnItemIds={context.lines.map(l=>l.item_id)} eventKey={context.event_key}/>:<>
            <p>Sửa thông tin đã ghi nhận khi nhận lại xe. Các phiếu thu/hoàn trong lượt này sẽ được thay thế bằng bản đúng và giữ lịch sử chỉnh sửa.</p>
            {context.blocked_reason&&<p className="mg-error-message" role="alert">{context.blocked_reason}</p>}
            <fieldset disabled={saving||Boolean(context.blocked_reason)} className="mg-return-correction-fields">
              <h3>Xe và phí thực tế</h3>
              {items.map((item,index)=>{const line=context.lines.find(l=>l.item_id===item.item_id)!;return <section className="mg-return-correction-card" aria-label={`Sửa trả xe ${line.license}`} key={item.item_id}><h4>{line.license} · {line.vehicle_name}</h4><div className="mg-form-grid mg-contract-grid-two">
                <div className="mg-field mg-field-wide"><label htmlFor={`correct-return-${index}`}>Ngày giờ trả thực tế (24h)</label><DateTime24Controls id={`correct-return-${index}`} label={`Ngày giờ trả ${line.license}`} value={item.returned_at} onChange={value=>updateItem(item.item_id,{returned_at:value})}/></div>
                <label className="mg-field">Phí quá hạn (VNĐ)<input inputMode="numeric" required value={item.fee_override} onChange={e=>updateItem(item.item_id,{fee_override:moneyInput(e.target.value)})}/></label>
                <label className="mg-field">Phí sửa chữa (VNĐ)<input inputMode="numeric" required value={item.repair_fee} onChange={e=>updateItem(item.item_id,{repair_fee:moneyInput(e.target.value)})}/></label>
                <label className="mg-field">Giảm tiền thuê trả sớm (VNĐ)<input inputMode="numeric" required value={item.early_discount} onChange={e=>updateItem(item.item_id,{early_discount:moneyInput(e.target.value)})}/></label>
                <label className="mg-field">Đơn giá trễ / giờ (VNĐ)<input inputMode="numeric" required value={item.hourly_rate} onChange={e=>updateItem(item.item_id,{hourly_rate:moneyInput(e.target.value).slice(0,7)})}/></label>
                <label className="mg-field mg-field-wide">Nội dung sửa chữa<input maxLength={1000} value={item.repair_note||''} onChange={e=>updateItem(item.item_id,{repair_note:e.target.value})}/></label>
              </div></section>;})}
              <div className="mg-heading-actions"><h3>Các khoản đã thu / hoàn trong lượt trả</h3><button type="button" className="mg-button" onClick={()=>setReceipts(rows=>[...rows,{key:crypto.randomUUID(),request_id:crypto.randomUUID(),kind:'rental_debt',amount:'',method:'cash',account_id:0,paid_at:vietnamPaymentTime()}])}><Plus size={16}/>Thêm khoản thu / hoàn</button></div>
              {!receipts.length&&<p>Chưa ghi nhận khoản thu/hoàn trong lượt này. Chỉ thêm khoản thực tế đã thu hoặc hoàn.</p>}
              {receipts.map((receipt,index)=>{const accounts=paymentAccounts(context.payment,receipt.method);return <section className="mg-return-correction-card" key={receipt.key} aria-label={`Khoản thu hoàn ${index+1}`}><div className="mg-heading-actions"><h4>Khoản {index+1}</h4><button type="button" className="mg-button" onClick={()=>setReceipts(rows=>rows.filter(r=>r.key!==receipt.key))}><Trash2 size={15}/>Bỏ khoản này</button></div><div className="mg-form-grid mg-contract-grid-two">
                <label className="mg-field">Loại thu / hoàn<select aria-label="Loại thu / hoàn" value={receipt.kind} onChange={e=>updateReceipt(receipt.key,{kind:e.target.value as Kind})}>{Object.entries(labels).filter(([kind])=>!['refund','rental_refund'].includes(kind)||kind===receipt.kind||!receipts.some(r=>r.kind===kind)).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select></label>
                <label className="mg-field">Số tiền thực tế (VNĐ)<input inputMode="numeric" required value={receipt.amount} onChange={e=>updateReceipt(receipt.key,{amount:moneyInput(e.target.value)})}/></label>
                <label className="mg-field">Hình thức thanh toán<select aria-label="Hình thức thanh toán" value={receipt.method} onChange={e=>updateReceipt(receipt.key,{method:e.target.value as PaymentMethod,account_id:0})}>{PAYMENT_METHODS.map(method=><option value={method.value} key={method.value}>{method.value==='transfer'?'CK tài khoản cá nhân':method.label}</option>)}</select></label>
                <label className="mg-field">{receipt.method==='cash'?'Két thu / chi':'Tài khoản thu / chi'}<select aria-label={receipt.method==='cash'?'Két thu / chi':'Tài khoản thu / chi'} required value={receipt.account_id||''} onChange={e=>updateReceipt(receipt.key,{account_id:Number(e.target.value)})}><option value="">Chọn {receipt.method==='cash'?'két tiền mặt':'tài khoản ngân hàng'}</option>{accounts.map(account=><option value={account.id} key={account.id}>{account.label}</option>)}</select></label>
                <div className="mg-field mg-field-wide"><label htmlFor={`correct-payment-${index}`}>Ngày giờ thu / hoàn (24h)</label><DateTime24Controls id={`correct-payment-${index}`} label={`Ngày giờ khoản ${index+1}`} value={receipt.paid_at} onChange={value=>updateReceipt(receipt.key,{paid_at:value})}/></div>
                {['refund','rental_refund'].includes(receipt.kind)&&receipt.method!=='cash'&&<><label className="mg-field">Ngân hàng nhận hoàn<input maxLength={150} value={receipt.recipient_bank||''} onChange={e=>updateReceipt(receipt.key,{recipient_bank:e.target.value})}/></label><label className="mg-field">Số tài khoản nhận hoàn<input maxLength={150} value={receipt.recipient_account||''} onChange={e=>updateReceipt(receipt.key,{recipient_account:e.target.value})}/></label><label className="mg-field mg-field-wide">Tên người nhận hoàn<input maxLength={150} value={receipt.recipient_name||''} onChange={e=>updateReceipt(receipt.key,{recipient_name:e.target.value})}/></label></>}
              </div></section>;})}
              {!receipts.some(r=>r.kind==='refund')&&<><label className="mg-checkbox"><input type="checkbox" checked={deferred} onChange={e=>setDeferred(e.target.checked)}/>Chờ kế toán hoàn cọc</label>{deferred&&<div className="mg-form-grid mg-contract-grid-two"><label className="mg-field">Ngân hàng nhận hoàn<input maxLength={150} value={recipient.bank} onChange={e=>setRecipient(r=>({...r,bank:e.target.value}))}/></label><label className="mg-field">Số tài khoản nhận hoàn<input maxLength={150} value={recipient.account} onChange={e=>setRecipient(r=>({...r,account:e.target.value}))}/></label><label className="mg-field mg-field-wide">Tên người nhận hoàn<input maxLength={150} value={recipient.name} onChange={e=>setRecipient(r=>({...r,name:e.target.value}))}/></label></div>}</>}
              <div className="mg-return-estimate"><strong>Đối chiếu sau chỉnh sửa</strong><span>Điều chỉnh phí: {formatMoney(adjustment)}</span><span>Tiền thuê dự kiến: {estimatedTotal===null?'Cần đối chiếu':formatMoney(estimatedTotal)}</span><span>{remaining!==null&&remaining<0?'Tiền thuê thu dư':'Tiền thuê còn thiếu'}: {remaining===null?'Cần đối chiếu':formatMoney(Math.abs(remaining))}</span><span>Cọc còn giữ: {formatMoney(context.payment.deposit_held-Number(receipts.find(r=>r.kind==='refund')?.amount||0))}</span>{context.payment.billing&&<small>Thuê sở hữu: máy chủ đối chiếu lại lịch đóng tiền theo giờ trả mới khi lưu.</small>}</div>
              <label className="mg-field">Ghi chú gửi cùng Telegram<textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
              <label className="mg-field">Lý do chỉnh sửa (không bắt buộc)<textarea name="correction-reason" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: nhập nhầm hình thức hoàn cọc, sửa theo bill thực tế"/></label>
            </fieldset>
            <section className="mg-return-correction-media"><h3>Ảnh / video và hồ sơ trả xe</h3>{context.lines.length>1&&<label className="mg-field">Xe cần sửa ảnh<select value={photoItem} disabled={photosPending||saving} onChange={e=>setPhotoItem(Number(e.target.value))}>{context.lines.map(line=><option key={line.item_id} value={line.item_id}>{line.license}</option>)}</select></label>}<ContractTransactionPhotos key={photoItem} id={context.order_id} phase={`return-${photoItem}`} title={`Ảnh và hồ sơ · ${context.lines.find(l=>l.item_id===photoItem)?.license||''}`} onPendingChange={value=>setPending(p=>p[photoItem]===value?p:{...p,[photoItem]:value})} onSaved={()=>setPhotoVersion(v=>v+1)}/></section>
          </>}
        </>}
        {error&&<p className="mg-error-message" role="alert">{error}</p>}
        {!context&&!loading&&<button type="button" className="mg-button" onClick={()=>setRetry(v=>v+1)}>Thử tải lại</button>}
      </div>
      <div className="mg-dialog-footer">{photosPending&&<span role="status">Lưu ảnh/video vừa chọn trước khi tiếp tục.</span>}<button type="button" className="mg-button" disabled={saving} onClick={close}>Đóng</button>{context&&!loading&&step==='edit'&&<><button type="button" className="mg-button" disabled={saving||dirty||photosPending} onClick={()=>setStep('telegram')}><MessageCircle size={16}/>Kiểm tra & gửi Telegram</button><button type="button" className="mg-button mg-button-primary" disabled={saving||photosPending||Boolean(context.blocked_reason)} onClick={()=>void save()}>{saving?<LoaderCircle size={16} className="mg-spin"/>:<Save size={16}/>}Lưu thay đổi</button></>}</div>
    </form>
  </Dialog>;
}

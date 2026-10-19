'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { loadPaymentContext,paymentAccounts,PAYMENT_METHODS,type PaymentContext,type PaymentMethod } from '@/lib/management/contract-payments';
import type { ReturnReceipt,ReturnSettlement } from '@/lib/management/contract-returns';
import { returnRefundQrSlot } from '@/lib/management/contract-photos';
import { photoEndpoint,type SavedPhoto } from '@/lib/management/record-photos';
import { formatMoney } from '@/lib/formatters';
import { ContractWorkflowGuide } from './ContractWorkflowGuide';

type Kind=ReturnReceipt['kind']|'refund';
interface Row {enabled:boolean;amount:string;method:PaymentMethod;account_id:string;request_id:string}
const labels:Record<Kind,string>={late_fee:'Đã thu phí quá hạn',repair_fee:'Đã thu tiền sửa chữa',rental_debt:'Đã thu công nợ thuê xe',refund:'Đã hoàn cọc cho khách'};
const accountOk=(value:string)=>/^[A-Z0-9-]{3,34}$/i.test(value.trim().replace(/\s/g,''));
export function ReturnSettlementFields({orderId,itemIds,photoVersion=0,lateFee,repairFee,netAdjustment,closes,early=false,late=false,onChange,onBlockChange,disabled=false}:{orderId:number;itemIds:number[];photoVersion?:number;lateFee:number;repairFee:number;netAdjustment:number;closes:boolean;early?:boolean;late?:boolean;onChange:(value?:ReturnSettlement)=>void;onBlockChange?:(blocked:boolean)=>void;disabled?:boolean}) {
  const [context,setContext]=useState<PaymentContext>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [rows,setRows]=useState<Partial<Record<Kind,Row>>>({});
  const [recipient,setRecipient]=useState({recipient_bank:'',recipient_account:'',recipient_name:''});
  const [hasRefundQr,setHasRefundQr]=useState(false);
  const [paidAt,setPaidAt]=useState(()=>new Date(Date.now()+7*3600000).toISOString().slice(0,16));
  const change=useRef(onChange);change.current=onChange;
  const block=useRef(onBlockChange);block.current=onBlockChange;
  const qrSlots=useMemo(()=>itemIds.map(returnRefundQrSlot),[itemIds]);
  useEffect(()=>{
    const controller=new AbortController();setContext(undefined);setError('');setRows({});
    void loadPaymentContext(orderId,controller.signal).then(value=>{if(!controller.signal.aborted)setContext(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được tài khoản thu / hoàn.');});
    return()=>controller.abort();
  },[orderId,retry]);
  useEffect(()=>{
    if(!qrSlots.length){setHasRefundQr(false);return;}
    const controller=new AbortController();
    void fetch(photoEndpoint('contracts',orderId),{cache:'no-store',credentials:'same-origin',signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success')throw new Error();return body.data as SavedPhoto[];})
      .then(photos=>{if(!controller.signal.aborted)setHasRefundQr(photos.some(photo=>qrSlots.includes(photo.slot)));})
      .catch(()=>{if(!controller.signal.aborted)setHasRefundQr(false);});
    return()=>controller.abort();
  },[orderId,qrSlots,photoVersion]);
  const due=context?.remaining===null?null:Math.max((context?.total_amount||0)+netAdjustment-(context?.paid_amount||0),0);
  const debt=due===null?0:Math.max(due-lateFee-repairFee,0);
  const limits:Record<Kind,number>=useMemo(()=>({late_fee:lateFee,repair_fee:repairFee,rental_debt:debt,refund:context?.deposit_held||0}),[lateFee,repairFee,debt,context?.deposit_held]);
  const amount=(kind:Kind)=>rows[kind]?.amount??String(limits[kind]);
  const collected=(['late_fee','repair_fee','rental_debt'] as const).reduce((sum,kind)=>sum+(rows[kind]?.enabled?Number(amount(kind))||0:0),0);
  const refundAllowed=closes&&due!==null&&collected===due;
  const refundRow=rows.refund;
  const refundMethod=refundRow?.method||'cash';
  const accountValue=recipient.recipient_account.trim().replace(/\s/g,'');
  const refundRecipientReady=refundMethod==='cash'
    || (Boolean(recipient.recipient_bank.trim()) && Boolean(recipient.recipient_name.trim()) && (accountOk(accountValue) || (hasRefundQr && !accountValue)));
  const refundReady=!refundRow?.enabled || (refundAllowed && Boolean(Number(refundRow.account_id)) && /^\d{1,13}$/.test(refundRow.amount||'') && Number(refundRow.amount)>0 && refundRecipientReady);
  useEffect(()=>{
    if(!context){change.current(undefined);block.current?.(false);return;}
    const receipts=(['late_fee','repair_fee','rental_debt'] as const).filter(kind=>rows[kind]?.enabled).map(kind=>{
      const row=rows[kind]!;return {kind,request_id:row.request_id,amount:row.amount,method:row.method,account_id:Number(row.account_id),paid_at:paidAt};
    });
    const row=rows.refund;
    const refund=row?.enabled&&refundAllowed&&refundReady
      ?{request_id:row.request_id,amount:row.amount,method:row.method,account_id:Number(row.account_id),paid_at:paidAt,...(row.method!=='cash'?{
        recipient_bank:recipient.recipient_bank.trim(),
        ...(accountValue?{recipient_account:accountValue}:{}),
        recipient_name:recipient.recipient_name.trim(),
      }:{})}:undefined;
    change.current(receipts.length||refund?{order_id:orderId,revision:context.revision,receipts,...(refund?{refund}:{})}:undefined);
    block.current?.(Boolean(refundRow?.enabled && !refundReady));
  },[context,rows,recipient,refundAllowed,refundReady,orderId,paidAt,refundRow?.enabled,accountValue]);
  function update(kind:Kind,patch:Partial<Row>){
    const old=rows[kind];const method=patch.method||old?.method||'transfer';
    const account=patch.method||!old?paymentAccounts(context!,method)[0]?.id:old.account_id;
    setRows(current=>({...current,[kind]:{enabled:false,amount:String(limits[kind]),method,account_id:String(account||''),request_id:old?.request_id||crypto.randomUUID(),...old,...patch,...(patch.method?{account_id:String(account||'')}:{})}}));
  }
  if(error)return <p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={()=>setRetry(value=>value+1)}>Tải lại khoản thu / hoàn</button></p>;
  if(!context)return <p role="status">Đang tải số tiền và tài khoản thu / hoàn…</p>;
  return <section className="mg-return-settlement" aria-label="Thu phí và hoàn cọc"><h3>2. Thu phí → 3. Hoàn cọc</h3>
    <ContractWorkflowGuide workflow="return" company={context.history.some(row=>!row.deposit&&row.type==='in'&&row.method.includes('công ty'))} early={early} late={late}/>
    <p>Chỉ chọn khoản đã thực nhận hoặc đã hoàn cho khách. Mỗi khoản tạo một phiếu thu/chi cùng lượt xác nhận.</p>
    <div className="mg-field"><label htmlFor={`return-${orderId}-paid-at`}>Thời điểm thực tế thu / hoàn (24h)</label><DateTime24Controls id={`return-${orderId}-paid-at`} label="Thời điểm thực tế thu / hoàn" value={paidAt} onChange={setPaidAt}/></div>
    {(['late_fee','repair_fee','rental_debt','refund'] as const).filter(kind=>limits[kind]>0).map(kind=>{
      const row=rows[kind],method=row?.method||'transfer',accounts=paymentAccounts(context,method),blocked=kind==='refund'&&!refundAllowed;
      return <fieldset key={kind} disabled={disabled||blocked}><legend>{kind==='refund'?'Cọc còn giữ':kind==='late_fee'?'Phí quá hạn':kind==='repair_fee'?'Phí sửa chữa':'Công nợ tiền thuê'}: {formatMoney(limits[kind])}</legend>
        <label className="mg-checkbox"><input type="checkbox" checked={Boolean(row?.enabled)&&!blocked} onChange={event=>update(kind,{enabled:event.target.checked})}/>{labels[kind]}</label>
        {row?.enabled&&!blocked&&<div className="mg-form-grid mg-contract-grid-two">
          <div className="mg-field"><label htmlFor={`return-${orderId}-${kind}-amount`}>Số tiền thực tế (VNĐ)</label><input id={`return-${orderId}-${kind}-amount`} inputMode="numeric" value={amount(kind)} onChange={event=>update(kind,{amount:event.target.value.replace(/\D/g,'').slice(0,13)})}/></div>
          <div className="mg-field"><label htmlFor={`return-${orderId}-${kind}-method`}>{kind==='refund'?'Hình thức hoàn':'Hình thức thu'}</label><select id={`return-${orderId}-${kind}-method`} value={method} onChange={event=>update(kind,{method:event.target.value as PaymentMethod})}>{PAYMENT_METHODS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="mg-field mg-field-wide"><label htmlFor={`return-${orderId}-${kind}-account`}>{kind==='refund'?'Tài khoản / két chi hoàn':'Tài khoản / két nhận tiền'}</label><select id={`return-${orderId}-${kind}-account`} value={row.account_id} onChange={event=>update(kind,{account_id:event.target.value})}>{!accounts.length&&<option value="">Chưa có tài khoản phù hợp</option>}{accounts.map(account=><option key={account.id} value={account.id}>{account.label}</option>)}</select></div>
          {kind==='refund'&&method!=='cash'&&<>
            <p className="mg-composer-hint mg-field-wide">{hasRefundQr
              ? 'Đã có ảnh QR / số TK khách: chỉ cần ngân hàng và tên chủ TK; số TK có thể bỏ trống.'
              : 'Hoàn CK cần ngân hàng, tên chủ TK và số TK (hoặc lưu ảnh QR / Số tài khoản khách nhận hoàn ở hồ sơ trả xe).'}</p>
            {([
              ['recipient_bank','Ngân hàng nhận của khách *'],
              ['recipient_account',hasRefundQr?'Số tài khoản khách nhận (tuỳ chọn nếu đã có ảnh QR)':'Số tài khoản khách nhận *'],
              ['recipient_name','Tên chủ tài khoản nhận *'],
            ] as const).map(([key,label])=>{
              const value=recipient[key];
              const invalid=key==='recipient_account'
                ? Boolean(value.trim()) && !accountOk(value)
                : !value.trim();
              const accountOptional=key==='recipient_account'&&hasRefundQr&&!value.trim();
              return <div className="mg-field" key={key}><label htmlFor={`return-${orderId}-${key}`}>{label}</label>
                <input id={`return-${orderId}-${key}`} value={value} maxLength={key==='recipient_account'?34:150} aria-invalid={invalid||undefined}
                  onChange={event=>setRecipient(current=>({...current,[key]:event.target.value}))}/>
                {accountOptional&&<p role="status">Đã dùng ảnh QR hồ sơ trả xe thay cho số TK.</p>}
                {invalid&&<p className="mg-field-error">{key==='recipient_name'?'Nhập tên chủ tài khoản khách nhận tiền.':key==='recipient_bank'?'Nhập ngân hàng khách nhận.':'Nhập số tài khoản khách (3–34 ký tự) hoặc lưu ảnh QR.'}</p>}
              </div>;
            })}
          </>}
        </div>}
      </fieldset>;
    })}
    {!refundAllowed&&context.deposit_held>0&&<p>Chỉ hoàn cọc trong lượt này sau khi đã nhận đủ xe và thu đủ các khoản còn thiếu.</p>}
    {refundRow?.enabled&&!refundReady&&<p className="mg-field-error" role="alert">Chưa đủ thông tin hoàn cọc: chọn tài khoản chi, nhập ngân hàng / tên chủ TK, và số TK (hoặc đã lưu ảnh QR).</p>}
    <p role="status">Đã chọn thu: {formatMoney(collected)} · Còn phải thu sau lượt này: {due===null?'Chưa đối chiếu':formatMoney(Math.max(due-collected,0))}</p>
    <p>Chuyển khoản hoàn cọc: đối chiếu QR / số tài khoản khách trong ảnh hồ sơ. Ứng dụng ghi nhận khoản đã hoàn, không tự chuyển tiền ngân hàng.</p>
  </section>;
}

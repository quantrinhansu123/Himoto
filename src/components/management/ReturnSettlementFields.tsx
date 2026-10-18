'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { loadPaymentContext,paymentAccounts,PAYMENT_METHODS,type PaymentContext,type PaymentMethod } from '@/lib/management/contract-payments';
import type { ReturnReceipt,ReturnSettlement } from '@/lib/management/contract-returns';
import { formatMoney } from '@/lib/formatters';
import { ContractWorkflowGuide } from './ContractWorkflowGuide';

type Kind=ReturnReceipt['kind']|'refund';
interface Row {enabled:boolean;amount:string;method:PaymentMethod;account_id:string;request_id:string}
const labels:Record<Kind,string>={late_fee:'Đã thu phí quá hạn',repair_fee:'Đã thu tiền sửa chữa',rental_debt:'Đã thu công nợ thuê xe',refund:'Đã hoàn cọc cho khách'};
export function ReturnSettlementFields({orderId,lateFee,repairFee,netAdjustment,closes,early=false,late=false,onChange,disabled=false}:{orderId:number;lateFee:number;repairFee:number;netAdjustment:number;closes:boolean;early?:boolean;late?:boolean;onChange:(value?:ReturnSettlement)=>void;disabled?:boolean}) {
  const [context,setContext]=useState<PaymentContext>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [rows,setRows]=useState<Partial<Record<Kind,Row>>>({});
  const [recipient,setRecipient]=useState({recipient_bank:'',recipient_account:'',recipient_name:''});
  const [paidAt,setPaidAt]=useState(()=>new Date(Date.now()+7*3600000).toISOString().slice(0,16));
  const change=useRef(onChange);change.current=onChange;
  useEffect(()=>{
    const controller=new AbortController();setContext(undefined);setError('');setRows({});
    void loadPaymentContext(orderId,controller.signal).then(value=>{if(!controller.signal.aborted)setContext(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được tài khoản thu / hoàn.');});
    return()=>controller.abort();
  },[orderId,retry]);
  const due=context?.remaining===null?null:Math.max((context?.total_amount||0)+netAdjustment-(context?.paid_amount||0),0);
  const debt=due===null?0:Math.max(due-lateFee-repairFee,0);
  const limits:Record<Kind,number>=useMemo(()=>({late_fee:lateFee,repair_fee:repairFee,rental_debt:debt,refund:context?.deposit_held||0}),[lateFee,repairFee,debt,context?.deposit_held]);
  const amount=(kind:Kind)=>rows[kind]?.amount??String(limits[kind]);
  const collected=(['late_fee','repair_fee','rental_debt'] as const).reduce((sum,kind)=>sum+(rows[kind]?.enabled?Number(amount(kind))||0:0),0);
  const refundAllowed=closes&&due!==null&&collected===due;
  useEffect(()=>{
    if(!context){change.current(undefined);return;}
    const receipts=(['late_fee','repair_fee','rental_debt'] as const).filter(kind=>rows[kind]?.enabled).map(kind=>{
      const row=rows[kind]!;return {kind,request_id:row.request_id,amount:row.amount,method:row.method,account_id:Number(row.account_id),paid_at:paidAt};
    });
    const row=rows.refund,refund=row?.enabled&&refundAllowed?{request_id:row.request_id,amount:row.amount,method:row.method,account_id:Number(row.account_id),paid_at:paidAt,...(row.method!=='cash'?recipient:{})}:undefined;
    change.current(receipts.length||refund?{order_id:orderId,revision:context.revision,receipts,...(refund?{refund}:{})}:undefined);
  },[context,rows,recipient,refundAllowed,orderId,paidAt]);
  function update(kind:Kind,patch:Partial<Row>){
    const old=rows[kind];const method=patch.method||old?.method||'cash';
    const account=patch.method||!old?paymentAccounts(context!,method)[0]?.id:old.account_id;
    setRows(current=>({...current,[kind]:{enabled:false,amount:String(limits[kind]),method,account_id:String(account||''),request_id:old?.request_id||crypto.randomUUID(),...old,...patch,...(patch.method?{account_id:String(account||'')}:{})}}));
  }
  if(error)return <p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={()=>setRetry(value=>value+1)}>Tải lại khoản thu / hoàn</button></p>;
  if(!context)return <p role="status">Đang tải số tiền và tài khoản thu / hoàn…</p>;
  return <section className="mg-return-settlement" aria-label="Thu phí và hoàn cọc"><h3>2. Thu phí → 3. Hoàn cọc</h3>
    <ContractWorkflowGuide workflow="return" company={context.history.some(row=>!row.deposit&&row.type==='in'&&row.method.includes('công ty'))} early={early} late={late}/>
    <p>Chỉ chọn khoản đã thực nhận hoặc đã hoàn cho khách. Mỗi khoản tạo một phiếu thu/chi cùng lượt trả xe.</p>
    <div className="mg-field"><label htmlFor={`return-${orderId}-paid-at`}>Thời điểm thực tế thu / hoàn (24h)</label><DateTime24Controls id={`return-${orderId}-paid-at`} label="Thời điểm thực tế thu / hoàn" value={paidAt} onChange={setPaidAt}/></div>
    {(['late_fee','repair_fee','rental_debt','refund'] as const).filter(kind=>limits[kind]>0).map(kind=>{
      const row=rows[kind],method=row?.method||'cash',accounts=paymentAccounts(context,method),blocked=kind==='refund'&&!refundAllowed;
      return <fieldset key={kind} disabled={disabled||blocked}><legend>{kind==='refund'?'Cọc còn giữ':kind==='late_fee'?'Phí quá hạn':kind==='repair_fee'?'Phí sửa chữa':'Công nợ tiền thuê'}: {formatMoney(limits[kind])}</legend>
        <label className="mg-checkbox"><input type="checkbox" checked={Boolean(row?.enabled)&&!blocked} onChange={event=>update(kind,{enabled:event.target.checked})}/>{labels[kind]}</label>
        {row?.enabled&&!blocked&&<div className="mg-form-grid mg-contract-grid-two">
          <div className="mg-field"><label htmlFor={`return-${orderId}-${kind}-amount`}>Số tiền thực tế (VNĐ)</label><input id={`return-${orderId}-${kind}-amount`} inputMode="numeric" value={amount(kind)} onChange={event=>update(kind,{amount:event.target.value.replace(/\D/g,'').slice(0,13)})}/></div>
          <div className="mg-field"><label htmlFor={`return-${orderId}-${kind}-method`}>{kind==='refund'?'Hình thức hoàn':'Hình thức thu'}</label><select id={`return-${orderId}-${kind}-method`} value={method} onChange={event=>update(kind,{method:event.target.value as PaymentMethod})}>{PAYMENT_METHODS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="mg-field mg-field-wide"><label htmlFor={`return-${orderId}-${kind}-account`}>{kind==='refund'?'Tài khoản / két chi hoàn':'Tài khoản / két nhận tiền'}</label><select id={`return-${orderId}-${kind}-account`} value={row.account_id} onChange={event=>update(kind,{account_id:event.target.value})}>{!accounts.length&&<option value="">Chưa có tài khoản phù hợp</option>}{accounts.map(account=><option key={account.id} value={account.id}>{account.label}</option>)}</select></div>
          {kind==='refund'&&method!=='cash'&&(['recipient_bank','recipient_account','recipient_name'] as const).map(key=><div className="mg-field" key={key}><label htmlFor={`return-${orderId}-${key}`}>{{recipient_bank:'Ngân hàng nhận của khách',recipient_account:'Số tài khoản khách nhận',recipient_name:'Tên chủ tài khoản nhận'}[key]}</label><input id={`return-${orderId}-${key}`} value={recipient[key]} maxLength={key==='recipient_account'?34:150} onChange={event=>setRecipient(current=>({...current,[key]:event.target.value}))}/></div>)}
        </div>}
      </fieldset>;
    })}
    {!refundAllowed&&context.deposit_held>0&&<p>Chỉ hoàn cọc trong lượt này sau khi đã nhận đủ xe và thu đủ các khoản còn thiếu.</p>}
    <p role="status">Đã chọn thu: {formatMoney(collected)} · Còn phải thu sau lượt này: {due===null?'Chưa đối chiếu':formatMoney(Math.max(due-collected,0))}</p>
    <p>Chuyển khoản hoàn cọc: đối chiếu QR / số tài khoản khách trong ảnh hồ sơ. Ứng dụng ghi nhận khoản đã hoàn, không tự chuyển tiền ngân hàng.</p>
  </section>;
}

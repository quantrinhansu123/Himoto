'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { loadPaymentContext,paymentAccounts,PAYMENT_METHODS,type PaymentContext,type PaymentMethod } from '@/lib/management/contract-payments';
import type { ReturnReceipt,ReturnSettlement } from '@/lib/management/contract-returns';
import { returnRefundEvidenceSlots } from '@/lib/management/contract-photos';
import { photoEndpoint,type SavedPhoto } from '@/lib/management/record-photos';
import { formatMoney } from '@/lib/formatters';
import { ContractWorkflowGuide } from './ContractWorkflowGuide';
import { normalizeRefundAccount,validRefundAccount } from '@/lib/management/return-refunds';

type Kind=ReturnReceipt['kind']|'refund';
interface Row {enabled:boolean;amount:string;method:PaymentMethod;account_id:string;request_id:string}
const labels:Record<Kind,string>={late_fee:'Đã thu phí quá hạn',repair_fee:'Đã thu tiền sửa chữa',rental_debt:'Đã thu công nợ thuê xe',refund:'Đã hoàn cọc cho khách'};
export function ReturnSettlementFields({orderId,itemIds,photoVersion=0,lateFee,repairFee,netAdjustment,closes,early=false,late=false,onChange,onBlockChange,disabled=false}:{orderId:number;itemIds:number[];photoVersion?:number;lateFee:number;repairFee:number;netAdjustment:number;closes:boolean;early?:boolean;late?:boolean;onChange:(value?:ReturnSettlement)=>void;onBlockChange?:(blocked:boolean)=>void;disabled?:boolean}) {
  const [context,setContext]=useState<PaymentContext>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [rows,setRows]=useState<Partial<Record<Kind,Row>>>({});
  const [refundDeferred,setRefundDeferred]=useState(false);
  const [recipient,setRecipient]=useState({recipient_bank:'',recipient_account:'',recipient_name:''});
  const [hasRefundQr,setHasRefundQr]=useState(false);
  const [paidAt,setPaidAt]=useState(()=>new Date(Date.now()+7*3600000).toISOString().slice(0,16));
  const change=useRef(onChange);change.current=onChange;
  const block=useRef(onBlockChange);block.current=onBlockChange;
  const itemKey=itemIds.join(',');
  const qrSlots=useMemo(()=>itemKey?itemKey.split(',').flatMap(id=>returnRefundEvidenceSlots(Number(id))):[],[itemKey]);
  useEffect(()=>{
    const controller=new AbortController();setContext(undefined);setError('');setRows({});setRefundDeferred(false);
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
  const accountValue=normalizeRefundAccount(recipient.recipient_account);
  const bankValue=recipient.recipient_bank.trim();
  const nameValue=recipient.recipient_name.trim();
  // Saved return hồ sơ (QR / số TK) or a complete typed recipient stands in for transfer refunds.
  const typedRecipientReady=Boolean(bankValue) && Boolean(nameValue) && validRefundAccount(accountValue);
  const refundRecipientReady=refundMethod==='cash' || (hasRefundQr || typedRecipientReady) && (!recipient.recipient_account.trim() || validRefundAccount(recipient.recipient_account));
  const refundDecisionMissing=closes&&Boolean(context?.deposit_held)&&!refundRow?.enabled&&!refundDeferred;
  const refundReady=!refundRow?.enabled || (refundAllowed && Boolean(context&&paymentAccounts(context,refundMethod).some(account=>account.id===Number(refundRow.account_id))) && /^\d{1,13}$/.test(refundRow.amount||'') && Number(refundRow.amount)>0 && Number(refundRow.amount)<=limits.refund && refundRecipientReady);
  useEffect(()=>{
    if(!context){change.current(undefined);block.current?.(true);return;}
    const receipts=(['late_fee','repair_fee','rental_debt'] as const).filter(kind=>rows[kind]?.enabled).map(kind=>{
      const row=rows[kind]!;return {kind,request_id:row.request_id,amount:row.amount,method:row.method,account_id:Number(row.account_id),paid_at:paidAt};
    });
    const row=rows.refund;
    const refund=row?.enabled&&refundAllowed&&refundReady
      ?{request_id:row.request_id,amount:row.amount,method:row.method,account_id:Number(row.account_id),paid_at:paidAt,...(row.method!=='cash'?{
        ...(bankValue?{recipient_bank:bankValue}:{}),
        ...(accountValue?{recipient_account:accountValue}:{}),
        ...(nameValue?{recipient_name:nameValue}:{}),
      }:{})}:undefined;
    const pendingRecipient={...(bankValue?{bank:bankValue}:{}),...(accountValue?{account:accountValue}:{}),...(nameValue?{name:nameValue}:{})};
    change.current(receipts.length||refund||refundDeferred?{order_id:orderId,revision:context.revision,receipts,...(refund?{refund}:{}),...(refundDeferred?{refund_deferred:true as const,...(Object.keys(pendingRecipient).length?{refund_recipient:pendingRecipient}:{})}:{})}:undefined);
    block.current?.(refundDecisionMissing||Boolean(refundRow?.enabled && !refundReady)||Boolean(refundDeferred&&recipient.recipient_account.trim()&&!validRefundAccount(recipient.recipient_account)));
  },[context,rows,recipient,refundAllowed,refundReady,refundDecisionMissing,refundDeferred,orderId,paidAt,refundRow?.enabled,accountValue,bankValue,nameValue,hasRefundQr]);
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
      return <fieldset key={kind} disabled={disabled}><legend>{kind==='refund'?'Cọc còn giữ':kind==='late_fee'?'Phí quá hạn':kind==='repair_fee'?'Phí sửa chữa':'Công nợ tiền thuê'}: {formatMoney(limits[kind])}</legend>
        <label className="mg-checkbox"><input type={kind==='refund'?'radio':'checkbox'} name={kind==='refund'?`return-${orderId}-refund-decision`:undefined} disabled={blocked} checked={Boolean(row?.enabled)&&!blocked} onChange={event=>{if(kind==='refund')setRefundDeferred(false);update(kind,{enabled:event.target.checked});}}/>{labels[kind]}</label>
        {kind==='refund'&&<>
          <label className="mg-checkbox"><input type="radio" name={`return-${orderId}-refund-decision`} checked={refundDeferred} onChange={()=>{setRefundDeferred(true);update('refund',{enabled:false});}}/>Chưa hoàn cọc — tiếp tục ghi nhận cọc đang giữ</label>
          {refundDecisionMissing&&<p role="status">Chọn đã hoàn hoặc chưa hoàn cọc trước khi xác nhận. Nhập STK hay lưu ảnh QR chưa tạo phiếu chi hoàn cọc.</p>}
          {refundDeferred&&<p role="status">Gửi QR hoặc STK bên dưới lên Telegram để kế toán hoàn cọc sau. Lượt này lưu thông tin nhận hoàn và giữ cọc đang chờ hoàn; khi đã chuyển tiền mới ghi phiếu chi.</p>}
        </>}
        {(row?.enabled&&!blocked||kind==='refund'&&refundDeferred)&&<div className="mg-form-grid mg-contract-grid-two">
          {row?.enabled&&!blocked&&<>
          <div className="mg-field"><label htmlFor={`return-${orderId}-${kind}-amount`}>Số tiền thực tế (VNĐ)</label><input id={`return-${orderId}-${kind}-amount`} inputMode="numeric" value={amount(kind)} onChange={event=>update(kind,{amount:event.target.value.replace(/\D/g,'').slice(0,13)})}/></div>
          <div className="mg-field"><label htmlFor={`return-${orderId}-${kind}-method`}>{kind==='refund'?'Hình thức hoàn':'Hình thức thu'}</label><select id={`return-${orderId}-${kind}-method`} value={method} onChange={event=>update(kind,{method:event.target.value as PaymentMethod})}>{PAYMENT_METHODS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="mg-field mg-field-wide"><label htmlFor={`return-${orderId}-${kind}-account`}>{kind==='refund'?'Tài khoản / két chi hoàn':'Tài khoản / két nhận tiền'}</label><select id={`return-${orderId}-${kind}-account`} value={row.account_id} onChange={event=>update(kind,{account_id:event.target.value})}>{!accounts.length&&<option value="">Chưa có tài khoản phù hợp</option>}{accounts.map(account=><option key={account.id} value={account.id}>{account.label}</option>)}</select></div>
          </>}
          {kind==='refund'&&(refundDeferred||method!=='cash')&&<>
            <p className="mg-composer-hint mg-field-wide">{refundDeferred
              ? 'Các ô dưới đây là thông tin để kế toán nhận và xử lý. Có QR đã lưu thì để trống; khách chỉ cung cấp STK thì nhập tại đây. Không cần chọn tài khoản chi khi chưa hoàn tiền.'
              : hasRefundQr
              ? 'Đã có ảnh QR / số TK trong hồ sơ trả xe — có thể bỏ trống ngân hàng, số TK và tên chủ TK.'
              : 'Hoàn CK: nhập đủ ngân hàng + số TK + tên chủ TK, hoặc lưu ảnh «QR / Số tài khoản khách nhận hoàn» ở mục Hồ sơ hợp đồng bên trên rồi bấm Lưu ảnh / video.'}</p>
            {hasRefundQr&&<p className="mg-field-wide" role="status">{refundDeferred?'Đã có ảnh QR / thông tin nhận hoàn để gửi cùng hồ sơ Telegram.':'Đã nhận ảnh hồ sơ hoàn cọc — đủ để xác nhận chuyển khoản.'}</p>}
            {([
              ['recipient_bank',hasRefundQr||refundDeferred?'Ngân hàng nhận của khách (tuỳ chọn)':'Ngân hàng nhận của khách *'],
              ['recipient_account',hasRefundQr||refundDeferred?'Số tài khoản khách nhận (tuỳ chọn)':'Số tài khoản khách nhận *'],
              ['recipient_name',hasRefundQr||refundDeferred?'Tên chủ tài khoản nhận (tuỳ chọn)':'Tên chủ tài khoản nhận *'],
            ] as const).map(([key,label])=>{
              const value=recipient[key];
              // With QR evidence, typed fields are optional; without QR, all three are required.
              const invalid=hasRefundQr||refundDeferred
                ? key==='recipient_account' && Boolean(value.trim()) && !validRefundAccount(value)
                : key==='recipient_account' ? !validRefundAccount(value||' ') : !value.trim();
              return <div className="mg-field" key={key}><label htmlFor={`return-${orderId}-${key}`}>{label}</label>
                <input id={`return-${orderId}-${key}`} value={value} maxLength={key==='recipient_account'?64:150} aria-invalid={invalid||undefined} aria-describedby={invalid?`return-${orderId}-${key}-error`:undefined}
                  onChange={event=>setRecipient(current=>({...current,[key]:event.target.value}))}/>
                {invalid&&<p id={`return-${orderId}-${key}-error`} className="mg-field-error" role="alert">{key==='recipient_name'?'Nhập tên chủ tài khoản khách nhận tiền hoặc lưu ảnh QR hồ sơ trả xe.':key==='recipient_bank'?'Nhập ngân hàng khách nhận hoặc lưu ảnh QR hồ sơ trả xe.':'STK cần 3–34 chữ/số hoặc dấu gạch nối; chấp nhận dấu chấm và khoảng trắng phân nhóm.'}</p>}
              </div>;
            })}
          </>}
        </div>}
      </fieldset>;
    })}
    {!refundAllowed&&context.deposit_held>0&&<p role="status">{!closes
      ? 'Chưa thể hoàn cọc vì hợp đồng còn xe chưa nhận lại.'
      : due===null ? 'Chưa thể hoàn cọc: cần đối chiếu tiền hợp đồng.'
      : `Chưa thể hoàn cọc: còn ${formatMoney(Math.max(due-collected,0))} chưa ghi nhận thu. Công nợ tiền thuê có thể gồm phí gia hạn; gia hạn ngày trả không đồng nghĩa đã thu tiền. Nếu đã nhận, chọn khoản thu và đúng tài khoản ở trên.`}</p>}
    {refundRow?.enabled&&!refundReady&&<p className="mg-field-error" role="alert">Chưa đủ thông tin hoàn cọc: chọn tài khoản chi hoàn, hoặc nhập đủ ngân hàng / số TK / tên chủ TK, hoặc lưu ảnh QR.</p>}
    <p role="status">Đã chọn thu: {formatMoney(collected)} · Còn phải thu sau lượt này: {due===null?'Chưa đối chiếu':formatMoney(Math.max(due-collected,0))}</p>
    <p>Chuyển khoản hoàn cọc: đối chiếu QR / số tài khoản khách trong ảnh hồ sơ. Ứng dụng ghi nhận khoản đã hoàn, không tự chuyển tiền ngân hàng.</p>
  </section>;
}

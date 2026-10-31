'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { loadPaymentContext,paymentAccounts,PAYMENT_METHODS,type PaymentContext,type PaymentMethod } from '@/lib/management/contract-payments';
import type { ReturnReceipt,ReturnSettlement } from '@/lib/management/contract-returns';
import { returnRefundEvidenceSlots,returnRefundQrSlot } from '@/lib/management/contract-photos';
import { photoEndpoint,type SavedPhoto } from '@/lib/management/record-photos';
import { formatMoney } from '@/lib/formatters';
import { ContractWorkflowGuide } from './ContractWorkflowGuide';
import { normalizeRefundAccount,returnRentalRefundable,validRefundAccount } from '@/lib/management/return-refunds';
import { mergeRefundRecipient } from '@/lib/management/refund-qr';
import { RefundQrUpload } from './RefundQrUpload';
import { photoBaseSlot } from '@/lib/management/photo-slot-groups';

type Kind=ReturnReceipt['kind']|'refund'|'rental_refund';
interface Row {enabled:boolean;amount:string;method:PaymentMethod;account_id:string;request_id:string}
const labels:Record<Kind,string>={late_fee:'Đã thu phí quá hạn',repair_fee:'Đã thu tiền sửa chữa',rental_debt:'Đã thu công nợ thuê xe',refund:'Đã hoàn cọc cho khách',rental_refund:'Đã hoàn tiền thuê do trả sớm'};
export function ReturnSettlementFields({orderId,itemIds,photoVersion=0,lateFee,repairFee,earlyDiscount=0,netAdjustment,closes,early=false,late=false,onChange,onBlockChange,disabled=false}:{orderId:number;itemIds:number[];photoVersion?:number;lateFee:number;repairFee:number;earlyDiscount?:number;netAdjustment:number;closes:boolean;early?:boolean;late?:boolean;onChange:(value?:ReturnSettlement)=>void;onBlockChange?:(blocked:boolean,reason?:string)=>void;disabled?:boolean}) {
  const [context,setContext]=useState<PaymentContext>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [rows,setRows]=useState<Partial<Record<Kind,Row>>>({});
  const [refundDeferred,setRefundDeferred]=useState(false);
  const [recipient,setRecipient]=useState({recipient_bank:'',recipient_account:'',recipient_name:''});
  const [hasRefundQr,setHasRefundQr]=useState(false);
  const [savedQrSlot,setSavedQrSlot]=useState<string>(),[qrVersion,setQrVersion]=useState(0),[qrBusy,setQrBusy]=useState(false);
  const [paidAt,setPaidAt]=useState(()=>new Date(Date.now()+7*3600000).toISOString().slice(0,16));
  const change=useRef(onChange);change.current=onChange;
  const block=useRef(onBlockChange);block.current=onBlockChange;
  const itemKey=itemIds.join(',');
  const qrSlots=useMemo(()=>itemKey?itemKey.split(',').flatMap(id=>returnRefundEvidenceSlots(Number(id))):[],[itemKey]);
  useEffect(()=>{
    const controller=new AbortController();setContext(undefined);setError('');setRows({});setRefundDeferred(false);setRecipient({recipient_bank:'',recipient_account:'',recipient_name:''});
    void loadPaymentContext(orderId,controller.signal).then(value=>{
      if(controller.signal.aborted)return;
      setContext(value);
      // Keep deposit on the contract so staff can confirm the return without a second click.
      if(value.deposit_held>0)setRefundDeferred(true);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được tài khoản thu / hoàn.');});
    return()=>controller.abort();
  },[orderId,retry]);
  useEffect(()=>{
    if(!qrSlots.length){setHasRefundQr(false);setSavedQrSlot(undefined);return;}
    const controller=new AbortController();
    void fetch(photoEndpoint('contracts',orderId),{cache:'no-store',credentials:'same-origin',signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success')throw new Error();return body.data as SavedPhoto[];})
      .then(photos=>{if(!controller.signal.aborted){setHasRefundQr(photos.some(photo=>qrSlots.includes(photoBaseSlot(photo.slot))));setSavedQrSlot(photos.filter(photo=>itemKey.split(',').some(id=>returnRefundQrSlot(Number(id))===photoBaseSlot(photo.slot))).sort((a,b)=>b.updated_at.localeCompare(a.updated_at))[0]?.slot);}})
      .catch(()=>{if(!controller.signal.aborted)setHasRefundQr(false);});
    return()=>controller.abort();
  },[orderId,qrSlots,photoVersion,qrVersion,itemKey]);
  // remaining (đã thu đủ) + điều chỉnh trả xe; làm tròn để khỏi chặn hoàn cọc vì lệch số lẻ / thu dư trên UI.
  const dueRaw=context?.remaining===null||context===undefined?null:Number(context.remaining)+Number(netAdjustment||0);
  const due=dueRaw===null||!Number.isFinite(dueRaw)?(context?.remaining===null?null:0):Math.max(Math.round(dueRaw),0);
  const debt=due===null?0:Math.max(due-lateFee-repairFee,0);
  const rentalRefundable=context?returnRentalRefundable(context,earlyDiscount,netAdjustment):0;
  const limits:Record<Kind,number>=useMemo(()=>({late_fee:lateFee,repair_fee:repairFee,rental_debt:debt,refund:context?.deposit_held||0,rental_refund:rentalRefundable}),[lateFee,repairFee,debt,context?.deposit_held,rentalRefundable]);
  const amount=(kind:Kind)=>rows[kind]?.amount??String(limits[kind]);
  // A waived fee must not leave a previously selected, now-hidden receipt in the submission.
  const collected=(['late_fee','repair_fee','rental_debt'] as const).reduce((sum,kind)=>sum+(limits[kind]>0&&rows[kind]?.enabled?Number(amount(kind))||0:0),0);
  // Còn 0 đ (hoặc đã tick thu đủ/dư) → cho «Đã hoàn cọc»; không đòi collected === due từng đồng.
  const outstanding=due===null?null:Math.max(due-collected,0);
  const refundAllowed=closes&&outstanding===0;
  const refundRow=rows.refund;
  const refundMethod=refundRow?.method||'cash';
  const accountValue=normalizeRefundAccount(recipient.recipient_account);
  const bankValue=recipient.recipient_bank.trim();
  const nameValue=recipient.recipient_name.trim();
  const rentalRefundRow=rows.rental_refund,rentalRefundMethod=rentalRefundRow?.method||'transfer';
  const transferSelected=Boolean(refundRow?.enabled&&refundMethod!=='cash'||rentalRefundRow?.enabled&&rentalRefundMethod!=='cash');
  const refundRecipientReady=!transferSelected || !recipient.recipient_account.trim() || validRefundAccount(recipient.recipient_account);
  const refundDecisionMissing=closes&&Boolean(context?.deposit_held)&&!refundRow?.enabled&&!refundDeferred;
  const refundAmountError=!refundRow?.enabled?'':!/^\d{1,13}$/.test(refundRow.amount||'')||Number(refundRow.amount)<=0
    ? 'Nhập số tiền cọc thực tế đã hoàn lớn hơn 0đ.'
    : Number(refundRow.amount)>limits.refund
      ? `Số tiền hoàn cọc vượt cọc còn giữ ${formatMoney(limits.refund)} (vượt ${formatMoney(Number(refundRow.amount)-limits.refund)}). Tiền thuê trả sớm ghi ở mục «Đã hoàn tiền thuê do trả sớm».` : '';
  const rentalRefundAmountError=!rentalRefundRow?.enabled?'':!/^\d{1,13}$/.test(rentalRefundRow.amount||'')||Number(rentalRefundRow.amount)<=0
    ? 'Nhập số tiền thuê thực tế đã hoàn lớn hơn 0đ.'
    : Number(rentalRefundRow.amount)>rentalRefundable
      ? `Số tiền hoàn thuê vượt tiền trả sớm thực tế được hoàn ${formatMoney(rentalRefundable)}. Khoản giảm chỉ được hoàn khi tiền thuê đã thu dư.` : '';
  const rentalRefundAccountReady=Boolean(context&&paymentAccounts(context,rentalRefundMethod).some(account=>account.id===Number(rentalRefundRow?.account_id)));
  const rentalRefundReady=!rentalRefundRow?.enabled||(!rentalRefundAmountError&&rentalRefundAccountReady&&refundRecipientReady);
  const refundAccountReady=Boolean(context&&paymentAccounts(context,refundMethod).some(account=>account.id===Number(refundRow?.account_id)));
  const refundReady=!refundRow?.enabled || (refundAllowed && refundAccountReady && !refundAmountError && refundRecipientReady);
  const refundBlockReason=!refundAllowed&&(context?.deposit_held||0)>0
    ? (!closes ? 'Chưa thể tick đã hoàn cọc vì hợp đồng còn xe chưa nhận lại.'
      : outstanding===null ? 'Chưa thể tick đã hoàn cọc: cần đối chiếu tiền hợp đồng.'
      : outstanding>0
        ? `Chưa thể tick «Đã hoàn cọc»: còn ${formatMoney(outstanding)} chưa ghi nhận thu. Công nợ tiền thuê có thể gồm phí gia hạn; gia hạn ngày trả không đồng nghĩa đã thu tiền. Nếu đã nhận, tick khoản thu phía trên rồi hoàn cọc; nếu chưa thu thì chọn chưa hoàn cọc.`
        : '')
    : '';
  const recipientError='Số tài khoản khách nhận chưa hợp lệ. Kiểm tra lại số tài khoản hoặc để trống nếu chưa có.';
  const blockReason=!context ? error||'Đang tải số tiền và tài khoản thu / hoàn…'
    : qrBusy ? 'Đang lưu / đọc ảnh QR. Chờ xử lý xong trước khi xác nhận.'
    : earlyDiscount>0&&(context.total_amount===null||context.total_amount+netAdjustment<0) ? 'Tiền giảm do trả sớm vượt tổng tiền thuê hoặc tiền thuê chưa được đối chiếu.'
    : refundDecisionMissing ? 'Chọn đã hoàn hoặc chưa hoàn cọc trước khi xác nhận.'
    : refundRow?.enabled&&!refundReady ? refundBlockReason||refundAmountError||(!refundAccountReady?'Chọn tài khoản / két thực tế đã chi hoàn cọc.':recipientError)
    : rentalRefundRow?.enabled&&!rentalRefundReady ? rentalRefundAmountError||(!rentalRefundAccountReady?'Chọn tài khoản / két thực tế đã chi hoàn tiền thuê.':recipientError)
    : refundDeferred&&recipient.recipient_account.trim()&&!validRefundAccount(recipient.recipient_account) ? recipientError : '';
  useEffect(()=>{
    if(!context){change.current(undefined);block.current?.(true,blockReason);return;}
    const receipts=(['late_fee','repair_fee','rental_debt'] as const).filter(kind=>limits[kind]>0&&rows[kind]?.enabled).map(kind=>{
      const row=rows[kind]!;return {kind,request_id:row.request_id,amount:row.amount,method:row.method,account_id:Number(row.account_id),paid_at:paidAt};
    });
    const payout=(kind:'refund'|'rental_refund',ready:boolean)=>{
      const row=rows[kind];return row?.enabled&&ready
      ?{request_id:row.request_id,amount:row.amount,method:row.method,account_id:Number(row.account_id),paid_at:paidAt,...(row.method!=='cash'?{
        ...(bankValue?{recipient_bank:bankValue}:{}),
        ...(accountValue?{recipient_account:accountValue}:{}),
        ...(nameValue?{recipient_name:nameValue}:{}),
      }:{})}:undefined;
    };
    const refund=payout('refund',refundAllowed&&refundReady),rental_refund=payout('rental_refund',rentalRefundReady);
    const pendingRecipient={...(bankValue?{bank:bankValue}:{}),...(accountValue?{account:accountValue}:{}),...(nameValue?{name:nameValue}:{})};
    change.current(receipts.length||refund||rental_refund||refundDeferred?{order_id:orderId,revision:context.revision,receipts,...(refund?{refund}:{}),...(rental_refund?{rental_refund}:{}),...(refundDeferred?{refund_deferred:true as const,...(Object.keys(pendingRecipient).length?{refund_recipient:pendingRecipient}:{})}:{})}:undefined);
    block.current?.(Boolean(blockReason),blockReason);
  },[context,rows,recipient,refundAllowed,refundReady,rentalRefundReady,refundDecisionMissing,refundDeferred,orderId,paidAt,refundRow?.enabled,accountValue,bankValue,nameValue,hasRefundQr,qrBusy,limits,blockReason]);
  function update(kind:Kind,patch:Partial<Row>){
    const old=rows[kind];const method=patch.method||old?.method||'transfer';
    const account=patch.method||!old?paymentAccounts(context!,method)[0]?.id:old.account_id;
    setRows(current=>({...current,[kind]:{enabled:false,amount:String(limits[kind]),method,account_id:String(account||''),request_id:old?.request_id||crypto.randomUUID(),...old,...patch,...(patch.method?{account_id:String(account||'')}:{})}}));
  }
  if(error)return <section className="mg-return-settlement" data-blocked="true"><p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={()=>setRetry(value=>value+1)}>Tải lại khoản thu / hoàn</button></p></section>;
  if(!context)return <section className="mg-return-settlement" aria-busy="true"><p role="status">Đang tải số tiền và tài khoản thu / hoàn…</p></section>;
  const blocked=Boolean(blockReason);
  const depositRefundSelected=refundRow?.enabled?Number(amount('refund'))||0:0,rentalRefundSelected=rentalRefundRow?.enabled?Number(amount('rental_refund'))||0:0;
  return <section className="mg-return-settlement" aria-label="Thu phí và hoàn cọc" data-blocked={blocked} aria-busy={qrBusy}><h3>2. Thu phí và hoàn tiền</h3>
    <ContractWorkflowGuide workflow="return" company={context.history.some(row=>!row.deposit&&row.type==='in'&&row.method.includes('công ty'))} early={early} late={late}/>
    <p>Chỉ chọn khoản đã thực nhận hoặc đã hoàn cho khách. Mỗi khoản tạo một phiếu thu/chi cùng lượt xác nhận.</p>
    <details className="mg-return-options"><summary>Sửa thời điểm thu / hoàn</summary><div className="mg-field"><label htmlFor={`return-${orderId}-paid-at`}>Thời điểm thực tế thu / hoàn (24h)</label><DateTime24Controls id={`return-${orderId}-paid-at`} label="Thời điểm thực tế thu / hoàn" value={paidAt} onChange={setPaidAt}/></div></details>
    {(['late_fee','repair_fee','rental_debt','refund','rental_refund'] as const).filter(kind=>limits[kind]>0||kind==='rental_refund'&&(earlyDiscount>0||rows.rental_refund!==undefined)).map(kind=>{
      const row=rows[kind],method=row?.method||'transfer',accounts=paymentAccounts(context,method),blocked=kind==='refund'&&!refundAllowed,isPayout=kind==='refund'||kind==='rental_refund';
      const amountError=kind==='refund'?refundAmountError:kind==='rental_refund'?rentalRefundAmountError:'';
      return <fieldset key={kind} disabled={disabled}><legend>{kind==='refund'?'Cọc còn giữ':kind==='rental_refund'?'Tiền thuê được hoàn do trả sớm':kind==='late_fee'?'Phí quá hạn':kind==='repair_fee'?'Phí sửa chữa':'Công nợ tiền thuê'}: {formatMoney(limits[kind])}</legend>
        {kind==='refund'&&<label className="mg-checkbox"><input type="radio" name={`return-${orderId}-refund-decision`} checked={refundDeferred} onChange={()=>{setRefundDeferred(true);update('refund',{enabled:false});}}/>Chưa hoàn cọc — trả xe ngay, giữ cọc {formatMoney(context.deposit_held)}</label>}
        <label className="mg-checkbox"><input type={kind==='refund'?'radio':'checkbox'} name={kind==='refund'?`return-${orderId}-refund-decision`:undefined} disabled={blocked||kind==='rental_refund'&&!rentalRefundable&&!row?.enabled} title={kind==='refund'?refundBlockReason||undefined:undefined} checked={Boolean(row?.enabled)&&!blocked} onChange={event=>{if(kind==='refund')setRefundDeferred(false);update(kind,{enabled:event.target.checked});}}/>{labels[kind]}</label>
        {kind==='rental_refund'&&<p className="mg-composer-hint">{rentalRefundable>0?'Ghi riêng tiền thuê đã hoàn, cộng với hoàn cọc thành tổng tiền trả khách. Chưa hoàn thì để trống; có thể ghi phiếu chi sau.':'Khoản giảm trả sớm đang cấn trừ tiền thuê chưa thu hoặc phí phát sinh; chưa có tiền thuê thu dư để hoàn.'}</p>}
        {kind==='refund'&&<>
          {refundBlockReason&&<p className="mg-field-error" role="status">{refundBlockReason}</p>}
          {refundDecisionMissing&&<p role="status">{refundBlockReason
            ? 'Chọn «Chưa hoàn cọc» để trả xe và giữ cọc, hoặc ghi nhận thu công nợ/phí phía trên rồi tick đã hoàn.'
            : 'Chọn đã hoàn hoặc chưa hoàn cọc trước khi xác nhận. Nhập STK hay lưu ảnh QR chưa tạo phiếu chi hoàn cọc.'}</p>}
          {refundDeferred&&<p role="status">Mặc định giữ cọc để xác nhận trả xe. Gửi QR hoặc STK bên dưới lên Telegram nếu kế toán hoàn sau; khi đã chuyển tiền mới ghi phiếu chi.</p>}
        </>}
        {row?.enabled&&!blocked&&<div className="mg-form-grid mg-contract-grid-two">
          <div className="mg-field"><label htmlFor={`return-${orderId}-${kind}-amount`}>Số tiền thực tế (VNĐ)</label><input id={`return-${orderId}-${kind}-amount`} inputMode="numeric" value={amount(kind)} aria-invalid={Boolean(amountError)||undefined} aria-describedby={amountError?`return-${orderId}-${kind}-amount-error`:undefined} onChange={event=>update(kind,{amount:event.target.value.replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,13)})}/>{amountError&&<p id={`return-${orderId}-${kind}-amount-error`} className="mg-field-error" role="alert">{amountError}</p>}</div>
          <div className="mg-field"><label htmlFor={`return-${orderId}-${kind}-method`}>{isPayout?'Hình thức hoàn':'Hình thức thu'}</label><select id={`return-${orderId}-${kind}-method`} value={method} onChange={event=>update(kind,{method:event.target.value as PaymentMethod})}>{PAYMENT_METHODS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="mg-field mg-field-wide"><label htmlFor={`return-${orderId}-${kind}-account`}>{isPayout?'Tài khoản / két chi hoàn':'Tài khoản / két nhận tiền'}</label><select id={`return-${orderId}-${kind}-account`} value={row.account_id} onChange={event=>update(kind,{account_id:event.target.value})}>{!accounts.some(account=>String(account.id)===row.account_id)&&<option value="">{accounts.length?'Chọn tài khoản / két':'Chưa có tài khoản phù hợp'}</option>}{accounts.map(account=><option key={account.id} value={account.id}>{account.label}</option>)}</select></div>
        </div>}
      </fieldset>;
    })}
    {(refundDeferred||transferSelected)&&<div className="mg-form-grid mg-contract-grid-two">
            <p className="mg-composer-hint mg-field-wide">{refundDeferred&&!transferSelected
              ? 'Không bắt buộc. Có QR đã lưu thì để trống; khách đưa STK thì nhập tại đây. Không cần chọn tài khoản chi khi chưa hoàn tiền.'
              : 'Thông tin khách nhận dùng chung cho hoàn cọc và hoàn tiền thuê. Không bắt buộc; tải QR để tự điền hoặc nhập ngân hàng / số TK / tên chủ TK nếu khách đã cung cấp.'}</p>
            {itemIds[0]&&<RefundQrUpload key={`${orderId}-${itemKey}`} orderId={orderId} slot={returnRefundQrSlot(itemIds[0])} savedSlot={savedQrSlot} recipient={recipient} disabled={disabled}
              onBusy={setQrBusy} onSaved={()=>{setHasRefundQr(true);setSavedQrSlot(returnRefundQrSlot(itemIds[0]));setQrVersion(value=>value+1);}}
              onRemoved={()=>{setHasRefundQr(false);setSavedQrSlot(undefined);setQrVersion(value=>value+1);}}
              onRead={(fields,before)=>setRecipient(current=>mergeRefundRecipient(current,fields,before))}/>}
            {hasRefundQr&&<p className="mg-field-wide" role="status">{refundDeferred?'Đã có ảnh QR / thông tin nhận hoàn để gửi cùng hồ sơ Telegram.':'Đã nhận ảnh hồ sơ hoàn tiền — kiểm tra thông tin khách nhận.'}</p>}
            {([
              ['recipient_bank','Ngân hàng nhận của khách (tuỳ chọn)'],
              ['recipient_account','Số tài khoản khách nhận (tuỳ chọn)'],
              ['recipient_name','Tên chủ tài khoản nhận (tuỳ chọn)'],
            ] as const).map(([key,label])=>{
              const value=recipient[key];
              const invalid=key==='recipient_account' && Boolean(value.trim()) && !validRefundAccount(value);
              return <div className="mg-field" key={key}><label htmlFor={`return-${orderId}-${key}`}>{label}</label>
                <input id={`return-${orderId}-${key}`} value={value} maxLength={key==='recipient_account'?64:150} aria-invalid={invalid||undefined} aria-describedby={invalid?`return-${orderId}-${key}-error`:undefined}
                  onChange={event=>setRecipient(current=>({...current,[key]:event.target.value}))}/>
                {invalid&&<p id={`return-${orderId}-${key}-error`} className="mg-field-error" role="alert">STK cần 3–34 chữ/số hoặc dấu gạch nối; chấp nhận dấu chấm và khoảng trắng phân nhóm.</p>}
              </div>;
            })}
    </div>}
    {refundBlockReason&&<p role="status">{refundBlockReason}</p>}
    {refundRow?.enabled&&!refundReady&&!refundAmountError&&<p className="mg-field-error" role="alert">{blockReason}</p>}
    {rentalRefundRow?.enabled&&!rentalRefundReady&&!rentalRefundAmountError&&<p className="mg-field-error" role="alert">{blockReason}</p>}
    {(rentalRefundable>0||rentalRefundRow?.enabled)&&<p role="status"><strong>Tổng tiền đã chọn hoàn: {formatMoney(depositRefundSelected+rentalRefundSelected)}</strong> · Hoàn cọc: {formatMoney(depositRefundSelected)} · Hoàn thuê trả sớm: {formatMoney(rentalRefundSelected)}</p>}
    <p role="status">Đã chọn thu: {formatMoney(collected)} · Còn phải thu sau lượt này: {outstanding===null?'Chưa đối chiếu':formatMoney(outstanding)}</p>
    <p>Chuyển khoản hoàn tiền: đối chiếu QR / số tài khoản khách trong ảnh hồ sơ. Ứng dụng ghi nhận khoản đã hoàn, không tự chuyển tiền ngân hàng.</p>
  </section>;
}

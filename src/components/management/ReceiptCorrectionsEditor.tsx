'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Dialog} from './Dialog';
import {formatMoney} from '@/lib/formatters';
import {PAYMENT_METHODS,paymentAccountMatchesMethod,type PaymentMethod} from '@/lib/management/contract-payments';
import {receiptCorrectionsRequest,type ReceiptCorrectionState,type ReceiptSplit} from '@/lib/management/receipt-corrections';
export function ReceiptCorrectionsEditor({id,onClose,onSaved}:{id:number;onClose:()=>void;onSaved:()=>void}){
 const [state,setState]=useState<ReceiptCorrectionState|null>(null),[reason,setReason]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const busy=useRef(false),request=useRef<{body:string;id:string}|null>(null),errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{let active=true;void receiptCorrectionsRequest(id).then(value=>{if(active)setState(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]);
 function parts(index:number,next:ReceiptSplit[]){setState(s=>s&&({...s,receipts:s.receipts.map((r,i)=>i===index?{...r,parts:next.map(p=>{const accounts=s.accounts.filter(a=>paymentAccountMatchesMethod(a,p.method));return !p.account_id&&accounts.length===1?{...p,account_id:accounts[0].id}:p;})}:r)}));}
 async function submit(e:FormEvent){e.preventDefault();if(!state||busy.current)return;if(!reason.trim()){setError('Nhập lý do sửa tiền cọc / khoản thu.');return;}
  const receipts=state.receipts.map(r=>{const positive=r.parts.filter(p=>Number(p.amount)>0);return {...r,parts:positive.length?positive:[{...r.parts[0],amount:'0'}]};});
  busy.current=true;setSaving(true);setError('');const input={revision:state.revision,deposit_amount:state.deposit_amount,receipts,reason:reason.trim()},body=JSON.stringify(input);
  if(request.current?.body!==body)request.current={body,id:crypto.randomUUID()};
  try{await receiptCorrectionsRequest(id,{...input,request_id:request.current.id});onSaved();}catch(e){setError(e instanceof Error?e.message:'Chưa lưu được khoản thu.');requestAnimationFrame(()=>errorRef.current?.focus());}finally{busy.current=false;setSaving(false);}
 }
 const sums={deposit:0,rental:0,cash:0,transfer:0};state?.receipts.forEach(r=>r.parts.forEach(p=>{const n=Number(p.amount)||0;sums[r.deposit?'deposit':'rental']+=n;sums[p.method==='cash'?'cash':'transfer']+=n;}));
 return <Dialog title="Sửa tiền cọc / khoản đã thu" subtitle={state?.code} className="mg-receipt-corrections-dialog" onClose={()=>{if(!busy.current)onClose();}}><form onSubmit={submit} noValidate><div className="mg-dialog-body">
 {!state&&!error&&<p role="status">Đang tải phiếu thu…</p>}
 {state&&<fieldset className="mg-payment-fields" disabled={saving}><legend>Đối chiếu tiền đã nhận</legend>
 <p className="mg-field-wide">Sửa lại phiếu đã ghi, có lưu lịch sử trước–sau. Chỉ nhập số tiền khách đã thực tế thanh toán; không cộng thêm một lần thu mới. Phí thuê hợp đồng và ngày thuê sửa ở mục Tiền / ngày thuê.</p>
 <label className="mg-field-wide">Tiền cọc thỏa thuận (VNĐ)<input aria-label="Tiền cọc thỏa thuận" inputMode="numeric" value={state.deposit_amount} onChange={e=>setState({...state,deposit_amount:e.target.value.replace(/\D/g,'')})}/></label>
 {state.receipts.map((r,index)=><section className="mg-field-wide mg-receipt-correction" key={r.id}><h3>Phiếu #{r.id} · {r.deposit?'Tiền cọc':'Tiền thuê xe'}</h3><p>Ngày thu: {new Date(r.paid_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p>
 {r.parts.map((p,i)=><div className="mg-receipt-split" key={i}>
 <label>Số tiền (VNĐ)<input aria-label={`Số tiền phiếu ${r.id} khoản ${i+1}`} inputMode="numeric" value={p.amount} onChange={e=>parts(index,r.parts.map((v,j)=>j===i?{...v,amount:e.target.value.replace(/\D/g,'')}:v))}/></label>
 <label>Hình thức<select aria-label={`Hình thức phiếu ${r.id} khoản ${i+1}`} value={p.method} onChange={e=>parts(index,r.parts.map((v,j)=>j===i?{...v,method:e.target.value as PaymentMethod,account_id:0}:v))}>{PAYMENT_METHODS.map(m=><option value={m.value} key={m.value}>{m.label}</option>)}</select></label>
 <label className="mg-field-wide">Tài khoản / két nhận<select aria-label={`Tài khoản phiếu ${r.id} khoản ${i+1}`} value={p.account_id||''} onChange={e=>parts(index,r.parts.map((v,j)=>j===i?{...v,account_id:Number(e.target.value)}:v))}><option value="">Chưa phân bổ tài khoản / két</option>{state.accounts.filter(a=>paymentAccountMatchesMethod(a,p.method)).map(a=><option key={`${a.kind}:${a.id}`} value={a.id}>{a.label}</option>)}</select><small>Có thể lưu khi chưa chọn tài khoản. Khoản này được ghi là chưa phân bổ; dòng tách trống hoặc bằng 0 không cộng vào tổng.</small></label>
 {r.parts.length>1&&<button className="mg-button" type="button" onClick={()=>parts(index,r.parts.filter((_,j)=>j!==i))}>Bỏ khoản {i+1}</button>}
 </div>)}
 <button type="button" className="mg-button" disabled={r.parts.length>=10} onClick={()=>parts(index,[...r.parts,{amount:'',method:'cash',account_id:0}])}>Tách thêm khoản tiền mặt / chuyển khoản</button></section>)}
 {!state.receipts.length&&<p className="mg-field-wide">Chưa có phiếu thu cọc / tiền thuê thông thường để sửa. Ghi nhận khoản thực thu trong mục Thanh toán.</p>}
 <div className="mg-field-wide mg-receipt-correction" role="status"><p>Cọc đã thu: <strong>{formatMoney(sums.deposit)}</strong> · Thuê đã thu: <strong>{formatMoney(sums.rental)}</strong></p><p>Chuyển khoản: <strong>{formatMoney(sums.transfer)}</strong> · Tiền mặt: <strong>{formatMoney(sums.cash)}</strong></p><small>Chỉ tổng hợp các phiếu đang sửa; phiếu gia hạn, thu khác và hoàn tiền giữ riêng.</small></div>
 <label className="mg-field-wide">Lý do sửa *<textarea aria-label="Lý do sửa khoản thu" rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: Nhập nhầm tiền cọc và hình thức nhận tiền"/></label>
 <p className="mg-field-wide">Khi lưu, Sổ quỹ / Sổ két và tổng đã thu cập nhật theo các khoản trên. Ngày thu cũ được giữ lại. Tin Telegram đã gửi được giữ để đối chiếu.</p>
 </fieldset>}
 {error&&<p ref={errorRef} tabIndex={-1} className="mg-error-message" role="alert">{error}</p>}
 </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button><button type="submit" className="mg-button mg-button-primary" disabled={!state||saving}>{saving?'Đang lưu…':'Lưu tiền cọc / khoản thu'}</button></div></form></Dialog>;
}

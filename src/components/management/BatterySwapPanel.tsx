'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { LoaderCircle,RefreshCw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';
import { ContractWorkflowGuide } from './ContractWorkflowGuide';
import { ContractTransactionPhotos } from './ContractTransactionPhotos';
import { loadPaymentContext,paymentAccounts,PAYMENT_METHODS,type PaymentContext,type PaymentMethod,vietnamPaymentTime } from '@/lib/management/contract-payments';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { formatDateTime,formatMoney } from '@/lib/formatters';
interface Item {id:number;vehicle_id:number;license:string;name:string}
interface Swap {id:number;item_id:number;status:'draft'|'confirmed';revision:string;license?:string;battery_percent:number|null;fee:number;confirmed_at:string|null}
async function request<T>(orderId:number,body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(`/api/auth/order/car-rental/${orderId}/battery-swaps`,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const value=await response.json();if(!response.ok||value.status!=='success')throw new Error(value.message||'Không thực hiện được đổi pin.');return value.data;
}
export function BatterySwapPanel({orderId}:{orderId:number}){
 const {can}=useManagement();const [data,setData]=useState<{items:Item[];swaps:Swap[]}>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[swap,setSwap]=useState<Swap>(),[selected,setSelected]=useState('');
 const prepareId=useRef(crypto.randomUUID()),lock=useRef(false);
 const refresh=useCallback(async(signal?:AbortSignal)=>{try{const value=await request<{items:Item[];swaps:Swap[]}>(orderId,undefined,signal);if(!signal?.aborted){setData(value);setSelected(old=>value.items.some(item=>String(item.id)===old)?old:String(value.items[0]?.id||''));}}catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Không tải được lượt đổi pin.');}},[orderId]);
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]);
 return <section aria-label="Đổi pin"><h3>Đổi pin theo hợp đồng xe</h3><ContractWorkflowGuide workflow="battery_swap"/>
  {error&&<p className="mg-field-error" role="alert">{error}</p>}
  {!data?<p role="status">Đang tải lượt đổi pin…</p>:<>
   {can('contracts.renew')&&data.items.length>0&&<div className="mg-field"><label htmlFor={`battery-swap-vehicle-${orderId}`}>Xe cần đổi pin</label><select id={`battery-swap-vehicle-${orderId}`} value={selected} onChange={event=>{setSelected(event.target.value);prepareId.current=crypto.randomUUID();}}>{data.items.map(item=><option key={item.id} value={item.id}>{item.license} · {item.name}</option>)}</select>
    <button type="button" className="mg-button" disabled={busy||!selected} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{setSwap(await request<Swap>(orderId,{action:'prepare',item_id:Number(selected),request_id:prepareId.current}));prepareId.current=crypto.randomUUID();}catch(cause){setError(cause instanceof Error?cause.message:'Không tạo được lượt đổi pin.');}finally{lock.current=false;setBusy(false);}}}>{busy?<LoaderCircle size={16} className="mg-spin"/>:<RefreshCw size={16}/>}Ghi nhận lượt đổi pin</button>
   </div>}
   {!data.items.length&&<p>Chỉ đổi pin cho xe điện hoặc xe đang có hợp đồng pin liên kết, trong thời gian đang thuê.</p>}
   <ul>{data.swaps.map(row=><li key={row.id}>Lượt #{row.id} · {row.status==='confirmed'?`${row.battery_percent}% · phí ${formatMoney(row.fee)} · ${formatDateTime(row.confirmed_at)}`:'Chưa xác nhận'} {row.status==='draft'&&can('contracts.renew')&&<button type="button" className="mg-button" onClick={()=>setSwap(row)}>Tiếp tục lượt đổi pin</button>}</li>)}</ul>
  </>}
  {swap&&<BatterySwapDialog orderId={orderId} swap={swap} onClose={()=>{setSwap(undefined);void refresh();}}/>}
 </section>;
}
function BatterySwapDialog({orderId,swap,onClose}:{orderId:number;swap:Swap;onClose:()=>void}){
 const {invalidateData,notify}=useManagement();const [context,setContext]=useState<PaymentContext>(),[percent,setPercent]=useState(''),[note,setNote]=useState(''),[collect,setCollect]=useState(false),[method,setMethod]=useState<PaymentMethod>('cash'),[account,setAccount]=useState(''),[paidAt,setPaidAt]=useState(vietnamPaymentTime),[pending,setPending]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const receiptId=useRef(crypto.randomUUID()),busy=useRef(false);
 useEffect(()=>{const controller=new AbortController();void loadPaymentContext(orderId,controller.signal).then(setContext).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được số tiền hợp đồng.');});return()=>controller.abort();},[orderId,retry]);
 const valid=/^\d{1,3}$/.test(percent)&&Number(percent)<=100,fee=valid&&Number(percent)<20?100000:0,accounts=context?paymentAccounts(context,method):[],chosen=accounts.find(row=>String(row.id)===account)||accounts[0];
 return <Dialog title={`Đổi pin · lượt #${swap.id}`} onClose={()=>{if(!saving)onClose();}}><form onSubmit={async event=>{event.preventDefault();if(busy.current||pending||!context||!valid)return;busy.current=true;setSaving(true);setError('');try{
  await request(orderId,{action:'confirm',id:swap.id,revision:swap.revision,order_revision:context.revision,battery_percent:Number(percent),note,...(fee&&collect?{receipt:{request_id:receiptId.current,method,account_id:chosen?.id,paid_at:paidAt}}:{})});
  invalidateData(['contracts']);notify(`Đã ghi nhận đổi pin${fee?` · phí ${formatMoney(fee)}${collect?' đã thu':' chưa thu'}`:''}.`);onClose();
 }catch(cause){setError(cause instanceof Error?cause.message:'Chưa ghi nhận được đổi pin.');}finally{busy.current=false;setSaving(false);}}}>
  <div className="mg-dialog-body"><ContractWorkflowGuide workflow="battery_swap"/>
   <div className="mg-field"><label htmlFor="swap-battery-percent">Phần trăm pin lúc nhận (%)</label><input id="swap-battery-percent" type="number" min={0} max={100} value={percent} onChange={event=>setPercent(event.target.value)} required/></div>
   <p role="status">Phí pin dưới 20%: {formatMoney(fee)}</p>
   {fee>0&&<><label className="mg-checkbox"><input type="checkbox" checked={collect} onChange={event=>setCollect(event.target.checked)}/>Đã nhận 100.000 đ phí pin dưới 20%</label>{collect&&<div className="mg-form-grid mg-contract-grid-two"><div className="mg-field"><label htmlFor="swap-fee-method">Hình thức thu</label><select id="swap-fee-method" value={method} onChange={event=>{setMethod(event.target.value as PaymentMethod);setAccount('');}}>{PAYMENT_METHODS.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select></div><div className="mg-field"><label htmlFor="swap-fee-account">Tài khoản / két nhận</label><select id="swap-fee-account" value={chosen?.id||''} onChange={event=>setAccount(event.target.value)}>{!accounts.length&&<option value="">Chưa có tài khoản phù hợp</option>}{accounts.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></div><div className="mg-field"><label htmlFor="swap-paid-at">Thời điểm thu</label><DateTime24Controls id="swap-paid-at" label="Thời điểm thu phí đổi pin" value={paidAt} onChange={setPaidAt}/></div></div>}</>}
   <div className="mg-field"><label htmlFor="swap-note">Pin giao / nhận, ghi chú</label><textarea id="swap-note" maxLength={1000} value={note} onChange={event=>setNote(event.target.value)}/></div>
   <ContractTransactionPhotos id={orderId} phase={`battery-swap-${swap.id}`} workflow="battery_swap" title="Ảnh biển số, pin và video đổi pin" onPendingChange={setPending}/>
   {error&&<p role="alert" className="mg-field-error">{error} <button className="mg-button" type="button" onClick={()=>{setError('');setRetry(value=>value+1);}}>Tải lại số tiền hợp đồng</button></p>}
  </div><div className="mg-dialog-footer"><button className="mg-button" type="button" disabled={saving} onClick={onClose}>Đóng</button><button className="mg-button mg-button-primary" disabled={saving||pending||!context||!valid||Boolean(fee&&collect&&!chosen)}>{saving?'Đang lưu…':'Xác nhận đã đổi pin'}</button></div>
 </form></Dialog>;
}

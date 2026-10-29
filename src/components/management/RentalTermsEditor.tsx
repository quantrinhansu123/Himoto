'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {LoaderCircle,Save} from 'lucide-react';
import {Dialog} from './Dialog';
import {DateTime24Field} from '@/components/contracts/DateTime24Field';
import {rentalTermsRequest,type RentalTermsState} from '@/lib/management/rental-terms';
import {addRentalDuration,rentalDayCount} from '@/lib/management/rental-time';
import {formatMoney} from '@/lib/formatters';

export function RentalTermsEditor({id,onClose,onSaved}:{id:number;onClose:()=>void;onSaved:()=>void}) {
  const [state,setState]=useState<RentalTermsState|null>(null),[itemId,setItemId]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[days,setDays]=useState(''),[rate,setRate]=useState(''),[total,setTotal]=useState(''),[reason,setReason]=useState('');
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),requestId=useRef<string|null>(null);
  function select(data:RentalTermsState,key:string){const item=data.items.find(i=>String(i.id)===key);setItemId(key);setStart(item?.start_at||'');setEnd(item?.end_at||'');setDays(item?rentalDayCount(item.start_at,item.end_at):'');setRate(item?.unit_price==null?'':String(item.unit_price));}
  useEffect(()=>{const controller=new AbortController();void rentalTermsRequest(id,undefined,controller.signal).then(data=>{setState(data);setTotal(String(data.total_amount));select(data,String(data.items.find(i=>!i.completed_at)?.id||data.items[0]?.id||''));}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được tiền / ngày thuê.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[id]);
  async function submit(event:FormEvent){event.preventDefault();const item=state?.items.find(i=>String(i.id)===itemId);if(!state||!item||saving)return;
    if(!reason.trim()){setError('Nhập lý do sửa tiền / ngày thuê.');return;}setSaving(true);setError('');
    try{await rentalTermsRequest(id,{request_id:requestId.current??=crypto.randomUUID(),revision:state.revision,item_id:item.id,item_revision:item.revision,start_at:start,end_at:end,unit_price:rate,total_amount:total,reason:reason.trim()});onSaved();}catch(cause){setError(cause instanceof Error?cause.message:'Không lưu được tiền / ngày thuê. Tải lại để kiểm tra.');}finally{setSaving(false);}
  }
  const changedPrice=state&&/^\d+$/.test(total)&&Number(total)!==state.total_amount;
  return <Dialog title="Sửa tiền / ngày thuê" subtitle={state?.code||'Đang tải hợp đồng'} onClose={()=>{if(!saving)onClose();}}>
    <form onSubmit={submit}><div className="mg-dialog-body">
      {loading&&<p role="status"><LoaderCircle size={16} className="mg-spin"/> Đang tải tiền và ngày thuê hiện tại…</p>}
      {state&&<fieldset className="mg-payment-fields" disabled={saving}>
        <legend>Thông tin cần sửa</legend>
        <label className="mg-field-wide">Xe trong hợp đồng<select aria-label="Xe cần sửa ngày thuê" value={itemId} onChange={e=>select(state,e.target.value)}>{state.items.map(item=><option key={item.id} value={item.id}>{item.license||`Xe #${item.vehicle_id}`}{item.completed_at?' · Đã trả':''}</option>)}</select></label>
        <DateTime24Field id="rental-terms-start" label="Ngày giờ bắt đầu thuê" value={start} onChange={value=>{setStart(value);setDays(rentalDayCount(value,end));}}/>
        <label>Số ngày thuê<input aria-label="Số ngày thuê cần sửa" type="number" min={1} max={3650} value={days} onChange={e=>{setDays(e.target.value);if(/^\d+$/.test(e.target.value)&&Number(e.target.value)>0)setEnd(addRentalDuration(start,Number(e.target.value),'day'));}}/></label>
        <DateTime24Field id="rental-terms-end" label="Ngày giờ hẹn trả" value={end} onChange={value=>{setEnd(value);setDays(rentalDayCount(start,value));}}/>
        <label>Đơn giá áp dụng (VNĐ)<input aria-label="Đơn giá thuê cần sửa" inputMode="numeric" placeholder="Để trống để giữ đơn giá hiện tại" value={rate} onChange={e=>setRate(e.target.value.replace(/\D/g,''))}/><small>Theo đơn vị thuê của hợp đồng. Để trống nếu chỉ sửa ngày hoặc tổng tiền.</small></label>
        <label className="mg-field-wide">Tổng tiền thuê hợp đồng (gồm phí đã cộng, không gồm cọc)<input aria-label="Tiền thuê hợp đồng cần sửa" inputMode="numeric" value={total} onChange={e=>setTotal(e.target.value.replace(/\D/g,''))}/><small>Hiện tại: {formatMoney(state.total_amount)}. Đơn giá hoặc số ngày thay đổi không tự ghi đè tổng tiền thỏa thuận.</small></label>
        <label className="mg-field-wide">Lý do sửa *<textarea aria-label="Lý do sửa tiền ngày thuê" required maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <p className="mg-field-wide" role="status">Lưu lịch sử trước–sau và người sửa. Phiếu thu/chi, tiền cọc, trạng thái và cơ sở xe giữ nguyên. Tin Telegram đã gửi nằm trong lịch sử để đối chiếu; bản xem trước sẽ dùng thông tin đã sửa.</p>
        {changedPrice&&state.paid_amount!==null&&Number(total)<state.paid_amount&&<p className="mg-field-wide mg-field-error" role="alert">Đã thu {formatMoney(state.paid_amount)}, cao hơn tiền thuê sau sửa. Cần đối chiếu khoản thu dư trong Sổ quỹ; thao tác này không tạo phiếu hoàn tiền.</p>}
      </fieldset>}
      {error&&<p className="mg-error-message" role="alert">{error}</p>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button><button type="submit" className="mg-button mg-button-primary" disabled={loading||saving||!state?.items.length} title={loading?'Đang tải dữ liệu mới nhất':!state?.items.length?'Hợp đồng chưa có dòng xe để sửa':undefined}>{saving?<LoaderCircle size={16} className="mg-spin"/>:<Save size={16}/>}Lưu tiền / ngày thuê</button></div></form>
  </Dialog>;
}

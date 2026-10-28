'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { loadContractReturnableItems, recoverBadDebtVehicle, type ReturnableContractItem } from '@/lib/management/contract-returns';

export function BadDebtRecoveryDialog({id,code,onClose,onRecovered}:{id:number;code:string;onClose:()=>void;onRecovered:()=>void}) {
  const {notify,invalidateData}=useManagement();
  const [rows,setRows]=useState<ReturnableContractItem[]>([]),[item,setItem]=useState(''),[date,setDate]=useState(''),[note,setNote]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[confirmed,setConfirmed]=useState(false);
  const request=useRef(crypto.randomUUID()),lock=useRef(false);
  useEffect(()=>{const controller=new AbortController();loadContractReturnableItems(id,controller.signal,true).then(result=>{if(!controller.signal.aborted){const active=result.filter(row=>row.order_status==='bad_debt'&&!row.completed_at);setRows(active);setItem(active[0]?String(active[0].item_id):'');}}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được xe.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[id]);
  async function save(){
    const row=rows.find(row=>String(row.item_id)===item);if(lock.current||!row||!confirmed||!date)return;
    lock.current=true;setBusy(true);setError('');
    try{await recoverBadDebtVehicle({item_id:row.item_id,item_revision:row.item_revision,request_id:request.current,recovered_at:date,note:note.trim()});setDone(true);invalidateData(['contracts','vehicles']);onRecovered();notify('Đã ghi nhận thu hồi xe; công nợ hợp đồng cũ giữ nguyên.');}
    catch(cause){setError(cause instanceof Error?cause.message:'Chưa ghi nhận được thu hồi.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <Dialog title={`Thu hồi xe nợ xấu · ${code}`} onClose={()=>{if(!busy)onClose();}} dismissOnBackdrop={!busy}>
    <form onSubmit={event=>{event.preventDefault();void save();}}><div className="mg-dialog-body">
      <p>Chỉ xác nhận khi xe đã thực tế thu về. Khoản nợ, tiền cọc và lịch sử thu/chi của hợp đồng cũ được giữ nguyên. Thao tác này không tự thu tiền hoặc hoàn cọc.</p>
      {loading?<p role="status">Đang tải xe trong hợp đồng…</p>:done?<p role="status">Đã ghi nhận thu hồi. Xe có thể cho thuê lại khi không còn hợp đồng khác giữ xe và đang Lưu kho.</p>:!rows.length?<p role="status">Không còn xe nợ xấu chưa thu hồi trong hợp đồng này.</p>:<div className="mg-form-grid">
        <label className="mg-field">Xe đã thu về<select aria-label="Xe đã thu về" value={item} disabled={busy} onChange={event=>{setItem(event.target.value);request.current=crypto.randomUUID();setConfirmed(false);}}>{rows.map(row=><option key={row.item_id} value={row.item_id}>{row.license} · {row.vehicle_name}</option>)}</select></label>
        <label className="mg-field">Ngày giờ thực tế thu hồi<DateTime24Controls id="bad-debt-recovered-at" label="Ngày giờ thực tế thu hồi" value={date} onChange={setDate}/></label>
        <label className="mg-field">Ghi chú thu hồi (không bắt buộc)<textarea aria-label="Ghi chú thu hồi" value={note} disabled={busy} maxLength={1000} rows={3} onChange={event=>setNote(event.target.value)} placeholder="Ghi rõ người nhận xe, tình trạng và nơi đang giữ xe"/></label>
        <label className="mg-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>Tôi xác nhận xe đã thực tế thu về và khoản nợ cũ vẫn còn nguyên</label>
      </div>}
      {error&&<p className="mg-field-error" role="alert">{error}</p>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={busy} onClick={onClose}>Đóng</button>{!done&&Boolean(rows.length)&&<button type="submit" className="mg-button mg-button-primary" disabled={loading||busy||!confirmed||!date}>{busy?'Đang ghi nhận…':'Xác nhận đã thu hồi'}</button>}</div></form>
  </Dialog>;
}

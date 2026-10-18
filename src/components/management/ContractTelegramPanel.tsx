'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { contractTelegramRequest, NOTICE_STATUS_LABELS, type ContractTelegramState } from '@/lib/management/contract-telegram';
import { contractPhotoSlots,contractDocumentSlots, type ContractPhotoPhase } from '@/lib/management/contract-photos';
import { SavedRecordPhotos } from './RecordPhotoFields';
import { useManagement } from './ManagementProvider';

export function ContractTelegramAuto({id,onBusyChange}:{id:number;onBusyChange?:(busy:boolean)=>void}) {
  const {can}=useManagement();
  const [enabled,setEnabled]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();void contractTelegramRequest(id,undefined,controller.signal).then(data=>setEnabled(data.auto_enabled)).catch(()=>{if(!controller.signal.aborted)setError('Chưa tải được chế độ Telegram.');});return()=>controller.abort();},[id]);
  useEffect(()=>{const changed=(event:Event)=>{const detail=(event as CustomEvent<{id:number;enabled:boolean}>).detail;if(detail.id===id)setEnabled(detail.enabled);};window.addEventListener('himoto-telegram-auto',changed);return()=>window.removeEventListener('himoto-telegram-auto',changed);},[id]);
  if(!can('contracts.finalize'))return null;
  return <div className="mg-telegram-auto"><label><input type="checkbox" checked={enabled===true} disabled={enabled===null||busy} onChange={async event=>{
    setBusy(true);onBusyChange?.(true);setError('');try{const data=await contractTelegramRequest(id,{action:'auto',enabled:event.target.checked});setEnabled(data.auto_enabled);window.dispatchEvent(new CustomEvent('himoto-telegram-auto',{detail:{id,enabled:data.auto_enabled}}));}catch(cause){setError(cause instanceof Error?cause.message:'Không đổi được chế độ tự gửi.');}finally{setBusy(false);onBusyChange?.(false);}
  }}/> Tự gửi Telegram khi hoàn tất giao dịch mới</label><small>Tắt nếu cần chờ đủ ảnh rồi bấm Gửi Telegram trong chi tiết hợp đồng. Không thay đổi thông báo đã vào hàng đợi.</small>{error&&<p role="alert">{error}</p>}</div>;
}

export function ContractTelegramPanel({id}:{id:number}) {
  const {can}=useManagement();
  const [data,setData]=useState<ContractTelegramState|null>(null),[selected,setSelected]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [pending,setPending]=useState<Record<string,boolean>>({});
  const [confirmedAbsent,setConfirmedAbsent]=useState(false);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError('');
    try{const state=await contractTelegramRequest(id,undefined,signal);if(!signal?.aborted){setData(state);setSelected(old=>state.events.some(e=>e.key===old)?old:state.events[0]?.key||'');}}
    catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Không tải được thông báo.');}
    finally{if(!signal?.aborted)setLoading(false);}
  },[id]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]);
  const event=data?.events.find(e=>e.key===selected);
  useEffect(()=>setConfirmedAbsent(false),[selected,event?.notice_id]);
  const active=data?.events.some(e=>e.status==='pending'||e.status==='sending');
  useEffect(()=>{if(!active||busy)return;const controller=new AbortController();const timer=setTimeout(()=>void refresh(controller.signal),3000);return()=>{clearTimeout(timer);controller.abort();};},[active,busy,data,refresh]);
  const photosPending=Object.values(pending).some(Boolean);
  return <section className="mg-contract-telegram">
    <p>Thông tin, ảnh và video đã lưu sẽ gửi vào nhóm PGD của hợp đồng. Chọn giao dịch, lưu đủ ảnh/video rồi kiểm tra nội dung trước khi gửi.</p>
    <ContractTelegramAuto id={id}/>
    <div className="mg-contract-history-toolbar"><button className="mg-button" type="button" disabled={loading||busy||photosPending} onClick={()=>void refresh()}>{loading?<LoaderCircle size={15} className="mg-spin"/>:null}Làm mới nội dung và ảnh</button></div>
    {data&&!data.events.length&&<p>Chưa có giao dịch hoàn tất. Có thể tắt tự gửi ở trên trước khi xác nhận giao dịch.</p>}
    {Boolean(data?.events.length)&&<label className="mg-telegram-event-label">Giao dịch cần gửi<select aria-label="Giao dịch cần gửi Telegram" value={selected} disabled={busy||photosPending} onChange={e=>{setSelected(e.target.value);setPending({});setMessage('');}}>{data?.events.map(e=><option key={e.key} value={e.key}>{e.label} · {e.photo_count} ảnh · {e.video_count||0} video · {e.status?NOTICE_STATUS_LABELS[e.status]:'Chưa gửi'}</option>)}</select></label>}
    {event&&<div key={event.key}>
      <pre className="mg-telegram-preview">{event.text}</pre>
      {event.delivery_contract_code&&!event.text.includes(`Hợp đồng: ${event.delivery_contract_code}\n`)&&<p>Lần gửi trước dùng mã hợp đồng {event.delivery_contract_code}. Bản cập nhật bên trên dùng số hợp đồng hiện tại.</p>}
      <p role="status">{event.photo_count} ảnh · {event.video_count||0} video đã lưu · {event.status?NOTICE_STATUS_LABELS[event.status]:'Chưa gửi'}{event.sent_at?` · ${new Date(event.sent_at).toLocaleString('vi-VN')}`:''}</p>
      {event.status==='unknown'&&<div className="mg-billing-reminder" role="alert"><p>Lần gửi bị mất phản hồi{event.delivery_error?` (${event.delivery_error})`:''}. Kiểm tra nhóm bằng mã hợp đồng trước khi xử lý.</p>{event.can_retry_confirmed_absent?<><label className="mg-checkbox"><input type="checkbox" checked={confirmedAbsent} onChange={e=>setConfirmedAbsent(e.target.checked)}/>Đã kiểm tra nhóm, chưa có tin và ảnh của giao dịch này</label><button type="button" className="mg-button" disabled={!confirmedAbsent||busy||photosPending||loading} onClick={async()=>{setBusy(true);setError('');try{const value=await contractTelegramRequest(id,{action:'retry_confirmed_absent',event_key:event.key,hash:event.hash,notice_id:event.notice_id,confirmed_absent:true,request_id:crypto.randomUUID()});setData(value);setConfirmedAbsent(false);setMessage('Đã ghi nhận đối chiếu và xếp gửi lại. Chờ Telegram xác nhận.');}catch(cause){setError(cause instanceof Error?cause.message:'Không gửi lại được.');}finally{setBusy(false);}}}>Gửi lại sau khi đối chiếu</button></>:<p>Đã có mã tin gửi một phần; cần đối chiếu các ảnh còn thiếu trước khi xử lý tiếp.</p>}</div>}
      {event.unchanged&&<p>{event.status==='sent'?'Telegram đã nhận đủ nội dung và tệp này. Nút gửi được khóa để tránh gửi trùng.':'Nội dung và tệp này đã vào hàng đợi. Chờ kết quả từ Telegram.'} Bổ sung ảnh rồi làm mới nếu cần gửi bản cập nhật.</p>}
      {!event.can_send&&!event.unchanged&&event.status!=='unknown'&&<p role="status">{event.status==='pending'||event.status==='sending'?'Đang chờ Telegram xác nhận. Trạng thái tự cập nhật, chưa thể gửi thêm lượt.':'Tài khoản chưa có quyền gửi giao dịch này.'}</p>}
      {event.phases.map(phase=><SavedRecordPhotos key={phase} entity="contracts" recordId={id} slots={[...contractPhotoSlots(phase as ContractPhotoPhase),...contractDocumentSlots(phase as ContractPhotoPhase)]} title={`Ảnh ${event.label}`} readOnly={!can(phase.startsWith('renewal-')||phase.startsWith('battery-swap-')?'contracts.renew':phase.startsWith('return-')?'contracts.return':phase==='handover'?'contracts.finalize':'contracts.draft')}
        onPendingChange={value=>setPending(old=>old[phase]===value?old:{...old,[phase]:value})} onSaved={()=>void refresh()}/>)}
      {photosPending&&<p role="status">Lưu hết ảnh/video đang chọn trước khi gửi Telegram.</p>}
      <button type="button" className="mg-button mg-button-primary" disabled={!event.can_send||busy||loading||photosPending} onClick={async()=>{
        setBusy(true);setError('');setMessage('');
        try{const state=await contractTelegramRequest(id,{action:'send',event_key:event.key,hash:event.hash,request_id:crypto.randomUUID()});setData(state);setMessage('Đã xếp thông báo vào hàng đợi. Trạng thái bên trên cập nhật sau khi Telegram trả kết quả.');}
        catch(cause){setError(cause instanceof Error?cause.message:'Chưa gửi được Telegram.');}finally{setBusy(false);}
      }}>{busy?<LoaderCircle size={16} className="mg-spin"/>:<Send size={16}/>} {busy?'Đang xử lý…':event.unchanged&&event.status==='sent'?'Đã gửi Telegram':event.status==='pending'||event.status==='sending'?'Đang gửi Telegram':event.status==='unknown'?'Cần đối chiếu Telegram':'Gửi Telegram'} · {event.photo_count} ảnh · {event.video_count||0} video</button>
    </div>}
    {message&&<p role="status">{message}</p>}{error&&<p className="mg-field-error" role="alert">{error}</p>}
  </section>;
}

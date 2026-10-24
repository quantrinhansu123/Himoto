'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { contractTelegramRequest, NOTICE_STATUS_LABELS, type ContractTelegramState } from '@/lib/management/contract-telegram';
import { ContractTelegramRetraction } from './ContractTelegramRetraction';
import { ContractPhotoCard } from './ContractPhotoCard';

export function ContractTelegramPanel({id,eventKind,eventKey}:{id:number;eventKind?:string;eventKey?:string}) {
  const [data,setData]=useState<ContractTelegramState|null>(null),[selected,setSelected]=useState(''),[loading,setLoading]=useState(false),[actionBusy,setBusy]=useState(false),[photoBusy,setPhotoBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const busy=actionBusy||photoBusy;
  const [confirmedAbsent,setConfirmedAbsent]=useState(false);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError('');
    try{const state=await contractTelegramRequest(id,undefined,signal);if(!signal?.aborted){setData(state);setSelected(old=>state.events.some(e=>e.key===old)?old:state.events.find(e=>eventKey?e.key===eventKey:eventKind?e.kind===eventKind:true)?.key||'');}}
    catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Không tải được thông báo.');}
    finally{if(!signal?.aborted)setLoading(false);}
  },[id,eventKind,eventKey]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]);
  const event=data?.events.find(e=>e.key===selected);
  useEffect(()=>setConfirmedAbsent(false),[selected,event?.notice_id]);
  const active=data?.events.some(e=>e.status==='pending'||e.status==='sending'||e.deliveries?.some(delivery=>['pending','processing'].includes(delivery.retraction_state||'')));
  useEffect(()=>{if(!active||busy)return;const controller=new AbortController();const timer=setTimeout(()=>void refresh(controller.signal),3000);return()=>{clearTimeout(timer);controller.abort();};},[active,busy,data,refresh]);
  return <section className="mg-contract-telegram">
    <p>Bước cuối · Kiểm tra toàn bộ thông tin, ảnh và video đã lưu từ các bước trước. Chỉ nút Gửi toàn bộ bên dưới mới gửi vào nhóm nhận của giao dịch. Không cần tải lại ảnh đã có.</p>
    <div className="mg-contract-history-toolbar"><button className="mg-button" type="button" disabled={loading||busy} onClick={()=>void refresh()}>{loading?<LoaderCircle size={15} className="mg-spin"/>:null}Làm mới nội dung và ảnh</button></div>
    {data&&!data.events.length&&<p>Chưa có giao dịch hoàn tất. Ảnh đã lưu sẽ tập hợp tại đây sau khi xác nhận giao dịch.</p>}
    {Boolean(data?.events.length)&&<label className="mg-telegram-event-label">Giao dịch cần gửi<select aria-label="Giao dịch cần gửi Telegram" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setMessage('');}}>{data?.events.map(e=><option key={e.key} value={e.key}>{e.label} · {e.photo_count} ảnh · {e.video_count||0} video · {e.status?NOTICE_STATUS_LABELS[e.status]:'Chưa gửi'}</option>)}</select></label>}
    {event&&<div key={event.key}>
      {event.destination_label&&<p><strong>Nơi nhận: {event.destination_label}</strong></p>}
      <pre className="mg-telegram-preview">{event.text}</pre>
      {event.delivery_contract_code&&!event.text.includes(`Hợp đồng: ${event.delivery_contract_code}\n`)&&<p>Lần gửi trước dùng mã hợp đồng {event.delivery_contract_code}. Bản cập nhật bên trên dùng số hợp đồng hiện tại.</p>}
      <p role="status">{event.photo_count} ảnh · {event.video_count||0} video đã lưu · {event.status?NOTICE_STATUS_LABELS[event.status]:'Chưa gửi'}{event.sent_at?` · ${new Date(event.sent_at).toLocaleString('vi-VN')}`:''}</p>
      {event.status==='unknown'&&<div className="mg-billing-reminder" role="alert"><p>Lần gửi bị mất phản hồi{event.delivery_error?` (${event.delivery_error})`:''}. Kiểm tra nhóm bằng mã hợp đồng trước khi xử lý.</p>{event.can_retry_confirmed_absent?<><label className="mg-checkbox"><input type="checkbox" checked={confirmedAbsent} onChange={e=>setConfirmedAbsent(e.target.checked)}/>Đã kiểm tra nhóm, chưa có tin và ảnh của giao dịch này</label><button type="button" className="mg-button" disabled={!confirmedAbsent||busy||loading} onClick={async()=>{setBusy(true);setError('');try{const value=await contractTelegramRequest(id,{action:'retry_confirmed_absent',event_key:event.key,hash:event.hash,notice_id:event.notice_id,confirmed_absent:true,request_id:crypto.randomUUID()});setData(value);setConfirmedAbsent(false);setMessage('Đã ghi nhận đối chiếu và xếp gửi lại. Chờ Telegram xác nhận.');}catch(cause){setError(cause instanceof Error?cause.message:'Không gửi lại được.');}finally{setBusy(false);}}}>Gửi lại sau khi đối chiếu</button></>:<p>Đã có mã tin gửi một phần; cần đối chiếu các ảnh còn thiếu trước khi xử lý tiếp.</p>}</div>}
      {event.unchanged&&['sent','pending','sending'].includes(event.status||'')&&<p>{event.status==='sent'?'Telegram đã nhận đủ nội dung và tệp này. Nút gửi được khóa để tránh gửi trùng.':'Nội dung và tệp này đã vào hàng đợi. Chờ kết quả từ Telegram.'} Bổ sung ảnh trong Hồ sơ ảnh rồi làm mới nếu cần gửi bản cập nhật.</p>}
      {event.status==='retracted'&&<p role="status">Tin đã được thu hồi. Hồ sơ hợp đồng vẫn được giữ.{event.can_send?' Kiểm tra nội dung và ảnh, rồi chủ động bấm Gửi toàn bộ Telegram khi cần gửi bản đúng.':''}</p>}
      {event.status==='retracting'&&<p role="status">Đang thu hồi các tin đã chọn. Chờ kết quả trước khi gửi bản đúng.</p>}
      {!event.can_send&&!event.unchanged&&!['unknown','retracting','retraction_failed'].includes(event.status||'')&&<p role="status">{event.status==='pending'||event.status==='sending'?'Đang chờ Telegram xác nhận. Trạng thái tự cập nhật, chưa thể gửi thêm lượt.':'Tài khoản chưa có quyền gửi giao dịch này.'}</p>}
      {event.status==='retraction_failed'&&<p role="status">Chưa thu hồi đủ tin. Mở mục thu hồi để xem kết quả và thử lại trước khi gửi bản đúng.</p>}
      {Boolean(event.deliveries?.length)&&<ContractTelegramRetraction key={event.key} deliveries={event.deliveries!} busy={busy||loading} onRetract={async(noticeId,reason)=>{
        setBusy(true);setError('');setMessage('');
        try{const state=await contractTelegramRequest(id,{action:'retract',event_key:event.key,notice_id:noticeId,request_id:crypto.randomUUID(),reason,confirmed:true});setData(state);setMessage('Đã nhận yêu cầu thu hồi. Trạng thái sẽ cập nhật khi Telegram xác nhận.');}
        catch(cause){setError(cause instanceof Error?cause.message:'Chưa yêu cầu thu hồi được.');}finally{setBusy(false);}
      }}/>}
      <div className="mg-transaction-photo-gallery" aria-label="Toàn bộ ảnh và video sẽ gửi">{event.attachments?.map(photo=><ContractPhotoCard key={photo.slot} id={id} slot={photo.slot} label={photo.label} mimeType={photo.mime_type} version={event.hash} disabled={busy||loading||Boolean(active)} onBusyChange={setPhotoBusy} onDeleted={async()=>{setData(null);setMessage('');await refresh();}}/>)}</div>
      <button type="button" className="mg-button mg-button-primary" disabled={!event.can_send||busy||loading} onClick={async()=>{
        setBusy(true);setError('');setMessage('');
        try{const state=await contractTelegramRequest(id,{action:'send',event_key:event.key,hash:event.hash,request_id:crypto.randomUUID()});setData(state);setMessage('Đã xếp thông báo vào hàng đợi. Trạng thái bên trên cập nhật sau khi Telegram trả kết quả.');}
        catch(cause){setError(cause instanceof Error?cause.message:'Chưa gửi được Telegram.');}finally{setBusy(false);}
      }}>{busy?<LoaderCircle size={16} className="mg-spin"/>:<Send size={16}/>} {busy?'Đang xử lý…':event.unchanged&&event.status==='sent'?'Đã gửi Telegram':event.status==='pending'||event.status==='sending'?'Đang gửi Telegram':event.status==='unknown'?'Cần đối chiếu Telegram':'Gửi toàn bộ Telegram'} · {event.photo_count} ảnh · {event.video_count||0} video</button>
    </div>}
    {message&&event?.status!=='sent'&&<p role="status">{message}</p>}{error&&<p className="mg-field-error" role="alert">{error}</p>}
  </section>;
}

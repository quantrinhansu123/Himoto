'use client';
import { useCallback,useEffect,useState } from 'react';
import { NOTICE_STATUS_LABELS } from '@/lib/management/contract-telegram';
import { vehicleTransferTelegramRequest,type VehicleTransferTelegramState } from '@/lib/management/vehicle-transfer-telegram';

export function VehicleTransferTelegramPanel({vehicleId,eventId}:{vehicleId:number;eventId:number}) {
  const [data,setData]=useState<VehicleTransferTelegramState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const refresh=useCallback(async(signal?:AbortSignal)=>{try{const value=await vehicleTransferTelegramRequest(vehicleId,eventId,false,signal);if(!signal?.aborted){setData(value);setError('');}}catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Không tải được thông báo.');}},[vehicleId,eventId]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]);
  useEffect(()=>{if(!data||!['pending','sending'].includes(data.status||''))return;const controller=new AbortController();const timer=setTimeout(()=>void refresh(controller.signal),3000);return()=>{clearTimeout(timer);controller.abort();};},[data,refresh]);
  return <section className="mg-contract-telegram"><p>Đã lưu thao tác kho. Kiểm tra nội dung và các nhóm nhận bên dưới rồi bấm gửi. Đóng màn hình không gửi Telegram. Có thể mở lại từ Lịch sử luân chuyển.</p>
    <button className="mg-button" type="button" disabled={busy} onClick={()=>void refresh()}>Làm mới trạng thái</button>
    {error&&<p role="alert" className="mg-field-error">{error}</p>}
    {data&&!data.eligible?<p>Không xác định đủ cơ sở chuyển đi và cơ sở nhận. Kiểm tra lại lịch sử chuyển xe.</p>:data&&<><p><strong>Nơi nhận: {data.destination_label}</strong></p><pre className="mg-telegram-preview">{data.text}</pre>
      <p role="status">{data.status?NOTICE_STATUS_LABELS[data.status]:'Chưa gửi'}</p>
      {data.status==='unknown'&&<p role="alert">Chưa rõ Telegram đã nhận hay chưa. Kiểm tra nhóm trước khi xử lý; hệ thống không tự gửi lại.</p>}
      <button type="button" className="mg-button mg-button-primary" disabled={busy||!data.can_send} onClick={async()=>{setBusy(true);setError('');try{setData(await vehicleTransferTelegramRequest(vehicleId,eventId,true));}catch(cause){setError(cause instanceof Error?cause.message:'Không gửi được thông báo.');}finally{setBusy(false);}}}>{busy?'Đang xử lý…':data.status==='sent'?'Đã gửi Telegram':['pending','sending'].includes(data.status||'')?'Đang gửi Telegram':'Gửi thông tin Telegram'}</button>
    </>}
  </section>;
}

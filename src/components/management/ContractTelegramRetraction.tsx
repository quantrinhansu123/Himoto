'use client';
import { useEffect,useState } from 'react';
import type { ContractTelegramDelivery } from '@/lib/management/contract-telegram';

export function ContractTelegramRetraction({deliveries,busy,onRetract}:{deliveries:ContractTelegramDelivery[];busy:boolean;onRetract:(id:string,reason:string)=>Promise<void>}){
  const [opened,setOpened]=useState(false),[selected,setSelected]=useState(deliveries[0]?.id||''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
  const delivery=deliveries.find(item=>item.id===selected)||deliveries[0];
  useEffect(()=>{setConfirmed(false);setReason('');},[delivery?.id]);
  if(!delivery)return null;
  return <section className="mg-billing-reminder" aria-label="Thu hồi tin Telegram">
    <p><strong>Lịch sử gửi / Thu hồi tin gửi nhầm</strong></p>
    {!opened?<button type="button" className="mg-button" disabled={busy} onClick={()=>setOpened(true)}>Thu hồi tin Telegram</button>:<>
      <div className="mg-field"><label>Lần gửi cần thu hồi<select aria-label="Lần gửi cần thu hồi" value={delivery.id} disabled={busy} onChange={event=>setSelected(event.target.value)}>{deliveries.map(item=><option key={item.id} value={item.id}>{item.sent_at?new Date(item.sent_at).toLocaleString('vi-VN'):'Lần gửi đã lưu'} · {item.message_count} tin / tệp{item.retraction_state==='done'?' · Đã thu hồi':item.retraction_state==='failed'?' · Chưa gỡ đủ':''}</option>)}</select></label></div>
      <details><summary>Xem nội dung của lần gửi này</summary><pre className="mg-telegram-preview">{delivery.text}</pre></details>
      {delivery.retraction_state==='done'?<p role="status">Đã thu hồi toàn bộ {delivery.message_count} tin / tệp{delivery.retracted_at?` lúc ${new Date(delivery.retracted_at).toLocaleString('vi-VN')}`:''}. Lý do: {delivery.retraction_reason}</p>:<>
        <p>Thu hồi nội dung, ảnh và video của đúng lần gửi đã chọn. Hợp đồng, phiếu tiền và hồ sơ trong HIMOTO vẫn được giữ.</p>
        {delivery.expires_at&&<p>Thời hạn thu hồi bằng bot: {new Date(delivery.expires_at).toLocaleString('vi-VN')}.</p>}
        {delivery.blocked_reason&&<p role={delivery.retraction_state==='failed'?'alert':'status'}>{delivery.blocked_reason}</p>}
        {delivery.can_retract&&<>
          <div className="mg-field"><label>Lý do thu hồi<textarea aria-label="Lý do thu hồi" rows={2} maxLength={500} disabled={busy} placeholder="Ví dụ: Nhập nhầm số tiền, cần sửa hợp đồng" value={reason} onChange={event=>setReason(event.target.value)}/></label><small>Lý do không bắt buộc, tối đa 500 ký tự. Người thao tác được lưu trong lịch sử.</small></div>
          <label className="mg-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>Tôi xác nhận thu hồi đúng lần gửi đã chọn khỏi Telegram</label>
          <button type="button" className="mg-button mg-button-danger" disabled={busy||!confirmed} onClick={()=>void onRetract(delivery.id,reason.trim())}>{busy?'Đang yêu cầu thu hồi…':delivery.retraction_state==='failed'?'Thử thu hồi lại':'Xác nhận thu hồi Telegram'}</button>
        </>}
      </>}
      <button type="button" className="mg-button" disabled={busy} onClick={()=>{setOpened(false);setConfirmed(false);}}>Đóng mục thu hồi</button>
    </>}
  </section>;
}

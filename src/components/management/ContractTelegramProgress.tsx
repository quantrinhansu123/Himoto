import type { ContractTelegramEvent } from '@/lib/management/contract-telegram';

function clock(value?:string|null) {
  const date=value?new Date(value):null;
  return date&&!Number.isNaN(date.getTime())?date.toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
}

export function ContractTelegramProgress({event}:{event:ContractTelegramEvent}) {
  if(event.preparation_error)return <div className="mg-telegram-progress mg-telegram-progress-stopped" role="alert">
    <strong>Chưa chuẩn bị được thông báo</strong><p>{event.preparation_error}</p>
    <p>Kiểm tra hồ sơ, rồi bấm Kiểm tra trạng thái Telegram để tải lại. Các giao dịch hợp lệ khác vẫn có thể gửi.</p>
  </div>;
  const total=event.delivery_attachment_count||event.photo_count+(event.video_count||0);
  const sent=event.status==='sent',stopped=event.status==='unknown'||event.status==='failed';
  const active=event.status==='pending'||event.status==='sending';
  const received=sent?total:Math.min(event.delivery_message_count||0,total);
  const retry=event.delivery_retry_at&&new Date(event.delivery_retry_at).getTime()>Date.now();
  const title=sent?'Telegram đã nhận đủ':event.status==='unknown'?'Đã dừng · Cần đối chiếu Telegram':event.status==='failed'?'Gửi Telegram chưa hoàn tất':
    retry?'Telegram yêu cầu chờ trước khi gửi tiếp':active?received===total?'Đang gửi nội dung tổng hợp':event.status==='pending'?'Đang chờ gửi tiếp':'Đang gửi ảnh và video':'Hồ sơ đã sẵn sàng';
  const time=clock(sent?event.sent_at:event.delivery_updated_at);
  return <div className={`mg-telegram-progress${stopped?' mg-telegram-progress-stopped':''}`} role="status" aria-live="polite" aria-atomic="true">
    <strong>{title}{time?` · ${time}`:''}</strong>
    <p>{active||sent||stopped?`${received}/${total} tệp đã được Telegram xác nhận`:`${total} ảnh/video đã lưu trong hồ sơ`}{sent?' · Nội dung đã gửi':active&&received===total?' · Đang chờ xác nhận nội dung':''}.</p>
    {(active||sent||stopped)&&<progress aria-label="Tiến độ gửi tệp và nội dung Telegram" max={total+1} value={sent?total+1:received}/>}
    {retry&&<p>Tự gửi tiếp sau {clock(event.delivery_retry_at)}. Anh/chị có thể đóng cửa sổ này.</p>}
    {event.status==='unknown'&&<p>Lượt gửi đã dừng do mất phản hồi. Chờ thêm sẽ không tự gửi lại. Hồ sơ và ảnh vẫn được giữ đầy đủ; đối chiếu nhóm trước khi xử lý bên dưới.</p>}
    {active&&!retry&&<p>Hệ thống tiếp tục gửi khi đóng cửa sổ. Các tệp đã xác nhận được giữ lại nếu cần gửi tiếp.</p>}
  </div>;
}

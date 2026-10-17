export type ContractEventType = 'rental'|'reservation'|'handover'|'return'|'renewal';
export const CONTRACT_EVENT_LABELS:Record<ContractEventType,string> = {rental:'Thuê xe',reservation:'Nhận cọc giữ xe',handover:'Giao xe',return:'Trả xe',renewal:'Gia hạn'};
export const NOTICE_STATUS_LABELS:Record<string,string> = {manual:'Chờ bấm gửi',awaiting_config:'Chờ cấu hình nhóm / bot',pending:'Đang chờ gửi',sending:'Đang gửi / cần kiểm tra nếu kéo dài',sent:'Telegram đã nhận tin và ảnh',failed:'Gửi thất bại',unknown:'Chưa xác định — kiểm tra nhóm trước khi gửi lại'};
export interface ContractTelegramEvent {
  key:string;kind:ContractEventType;label:string;phases:string[];text:string;hash:string;photo_count:number;
  status:string|null;sent_at:string|null;can_send:boolean;unchanged:boolean;
}
export interface ContractTelegramState {auto_enabled:boolean;events:ContractTelegramEvent[];next_renewal_version:number}
export async function contractTelegramRequest(id:number,body?:Record<string,unknown>,signal?:AbortSignal):Promise<ContractTelegramState> {
  const response=await fetch(`/api/auth/order/car-rental/${id}/telegram`,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal,
    ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw Error(result?.message||'Không tải được Telegram của hợp đồng.');
  return result.data;
}

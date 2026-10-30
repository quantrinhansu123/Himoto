import { hasPermission,type PermissionAccount } from './permissions';

export type ContractEventType = 'rental'|'reservation'|'handover'|'return'|'renewal'|'battery_swap'|'vehicle_swap';
export function canSendContractEvent(user:PermissionAccount,kind:ContractEventType) {
  return hasPermission(user,kind==='renewal'||kind==='battery_swap'?'contracts.renew':kind==='return'||kind==='vehicle_swap'?'contracts.return':kind==='rental'||kind==='reservation'?'contracts.draft':'contracts.finalize');
}
export const CONTRACT_EVENT_LABELS:Record<ContractEventType,string> = {rental:'Thuê xe',reservation:'Nhận cọc giữ xe',handover:'Giao xe',return:'Trả xe',renewal:'Gia hạn',battery_swap:'Đổi pin',vehicle_swap:'Đổi xe'};
export const NOTICE_STATUS_LABELS:Record<string,string> = {manual:'Chờ bấm gửi',awaiting_config:'Chờ cấu hình nhóm / bot',pending:'Đang chờ gửi',sending:'Đang gửi / cần kiểm tra nếu kéo dài',sent:'Telegram đã nhận tin và ảnh',failed:'Gửi thất bại',unknown:'Chưa xác định — kiểm tra nhóm trước khi gửi lại',retracted:'Đã thu hồi Telegram',retracting:'Đang thu hồi Telegram',retraction_failed:'Chưa thu hồi đủ tin Telegram'};
export interface ContractTelegramEvent {
  key:string;kind:ContractEventType;label:string;phases:string[];text:string;hash:string;photo_count:number;video_count?:number;
  status:string|null;sent_at:string|null;can_send:boolean;unchanged:boolean;
  notice_id?:string;delivery_error?:string|null;can_retry_confirmed_absent?:boolean;delivery_message_count?:number;
  can_resume?:boolean;delivery_attachment_count?:number;delivery_error_description?:string;
  delivery_contract_code?:string;
  destination_label?:string;
  renewal_receipt_ids?:number[];
  renewal_receipts_cancelled?:boolean;
  attachments?:{slot:string;mime_type:string;label:string}[];
  deliveries?:ContractTelegramDelivery[];
}
export interface ContractTelegramDelivery {
  id:string;sent_at:string|null;message_count:number;text:string;can_retract:boolean;blocked_reason:string;
  expires_at:string|null;retraction_state:string|null;retraction_reason?:string;retracted_at?:string;
}
export interface ContractTelegramState {auto_enabled:boolean;events:ContractTelegramEvent[];next_renewal_version:number}
export async function contractTelegramRequest(id:number,body?:Record<string,unknown>,signal?:AbortSignal):Promise<ContractTelegramState> {
  const response=await fetch(`/api/auth/order/car-rental/${id}/telegram`,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal,
    ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw Error(result?.message||'Không tải được Telegram của hợp đồng.');
  return result.data;
}

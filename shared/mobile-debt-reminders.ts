export interface ReminderBank { id:number;bank_code:string;account_number:string;account_name:string;owner_type:string }
export type ReminderStatus = 'pending' | 'accepted' | 'failed' | 'unknown';
export const REMINDER_STATUS_LABELS: Record<ReminderStatus,string> = {
  pending:'Đang xử lý / cần kiểm tra', accepted:'Webhook đã tiếp nhận', failed:'Gửi thất bại', unknown:'Chưa xác định kết quả',
};
export interface DebtReminderContext {
  id:number;code:string;store_id:number;store_name:string;customer_name:string;phone:string;
  revision:string;amount:number;due_at:string|null;bank:ReminderBank|null;message:string;
}
export interface DebtReminderInput {request_id:string;order_id:number;revision:string;amount:number;phone:string;message:string}
export interface DebtReminderRow {
  request_id:string;order_id:number;store_id:number;contract_code:string;store_name:string;customer_name:string;
  phone:string;message:string;amount:number;status:ReminderStatus;created_at:string;actor_name:string;
}
export function normalizeReminderPhone(value:string) {
  let phone=value.trim().replace(/[\s.()-]/g,'');
  if(phone.startsWith('+84'))phone='0'+phone.slice(3);
  else if(phone.startsWith('84')&&phone.length===11)phone='0'+phone.slice(2);
  return /^0[35789]\d{8}$/.test(phone)?phone:null;
}
export function debtReminderMessage(context:Omit<DebtReminderContext,'message'>) {
  const bank=context.bank;
  return [`HIMOTO - ${context.store_name}`,
    `Chào anh/chị ${context.customer_name}, hợp đồng ${context.code} còn cần thanh toán ${context.amount.toLocaleString('vi-VN')} đ${context.due_at?` (hạn thanh toán ${new Date(context.due_at.length===16?context.due_at+':00+07:00':context.due_at).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})})`:''}.`,
    'Anh/chị vui lòng thanh toán giúp HIMOTO.',
    ...(bank?[`Ngân hàng: ${bank.bank_code}`,`Số tài khoản: ${bank.account_number}`,`Chủ tài khoản: ${bank.account_name}`,`Nội dung: Thanh toán cho hợp đồng ${context.code}`]:[]),
    'Nếu đã thanh toán, anh/chị vui lòng gửi lại xác nhận để HIMOTO đối chiếu. Cảm ơn anh/chị.'].join('\n');
}
export interface MobileReminderHistory { rows: DebtReminderRow[]; total: number; page: number; pages: number }
export interface MobileReminderResult { key: string; receipt: DebtReminderRow }
export interface MobileReminderOptions { canSend: boolean; stores: { id: number; name: string }[] }
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const text=(v:unknown)=>typeof v==="string",id=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
export const isReminderStatus=(v:unknown):v is ReminderStatus=>["pending","accepted","failed","unknown"].includes(String(v));
export function isReminderRow(v:unknown):v is DebtReminderRow {
  return object(v)&&typeof v.request_id==="string"&&/^[0-9a-f-]{36}$/.test(v.request_id)&&id(v.order_id)&&id(v.store_id)&&id(v.amount)&&isReminderStatus(v.status)&&["contract_code","store_name","customer_name","phone","message","created_at","actor_name"].every(k=>text(v[k]));
}
export function isReminderHistory(v:unknown):v is MobileReminderHistory { return object(v)&&Array.isArray(v.rows)&&v.rows.every(isReminderRow)&&Number.isSafeInteger(v.total)&&Number(v.total)>=0&&id(v.page)&&id(v.pages); }
export function isReminderResult(v:unknown):v is MobileReminderResult { return object(v)&&isReminderRow(v.receipt)&&v.key===v.receipt.request_id; }
export function isReminderOptions(v:unknown):v is MobileReminderOptions { return object(v)&&typeof v.canSend==="boolean"&&Array.isArray(v.stores)&&v.stores.every(s=>object(s)&&id(s.id)&&text(s.name)); }
export function isReminderContext(v:unknown):v is DebtReminderContext {
  return object(v)&&id(v.id)&&id(v.store_id)&&id(v.amount)&&["code","store_name","customer_name","phone","revision","message"].every(k=>text(v[k]))&&/^\d{1,20}$/.test(String(v.revision))&&(v.due_at===null||text(v.due_at))&&(v.bank===null||object(v.bank)&&id(v.bank.id)&&["bank_code","account_number","account_name","owner_type"].every(k=>text((v.bank as Record<string,unknown>)[k])));
}
export const reminderOperation=(id:number)=>`reminder.send:${id}`;
export function reminderResultMessage(status:ReminderStatus) {
  return status==="accepted"?"Hệ thống gửi tin đã tiếp nhận. Chưa xác nhận khách đã nhận hoặc đọc Zalo.":status==="failed"?"Hệ thống gửi tin báo lỗi. Kiểm tra kết nối trước khi tạo lần gửi mới.":"Kiểm tra lịch sử và Zalo trước khi tạo lần gửi mới để tránh trùng tin. Không tự gửi lại.";
}

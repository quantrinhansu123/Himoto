import type { BranchQrAccount } from './sepay';
import type { ManagementRow } from './types';
import { PAYABLE_STATUSES } from './contract-payments';

export function isRemindableContract(row:ManagementRow) {
  const amount=row.billing_plan_json?row.billing_due_amount:row.total_amount==null||row.paid_amount==null?null:Number(row.total_amount)-Number(row.paid_amount);
  return PAYABLE_STATUSES.includes(row.status)&&amount!=null&&Number.isSafeInteger(Number(amount))&&Number(amount)>0;
}

export type ReminderStatus = 'pending' | 'accepted' | 'failed' | 'unknown';
export const REMINDER_STATUS_LABELS: Record<ReminderStatus,string> = {
  pending:'Đang xử lý / cần kiểm tra', accepted:'Webhook đã tiếp nhận', failed:'Gửi thất bại', unknown:'Chưa xác định kết quả',
};
export interface DebtReminderContext {
  id:number;code:string;store_id:number;store_name:string;customer_name:string;phone:string;
  revision:string;amount:number;due_at:string|null;bank:BranchQrAccount|null;message:string;
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
export async function reminderRequest<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.status!=='success')throw new Error(body?.message||'Không xử lý được yêu cầu nhắc nợ. Kiểm tra lịch sử trước khi gửi lại.');
  return body.data;
}

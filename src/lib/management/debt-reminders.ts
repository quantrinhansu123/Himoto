import type { ManagementRow } from './types';
import { PAYABLE_STATUSES } from './contract-payments';

export function isRemindableContract(row:ManagementRow) {
  const amount=row.billing_plan_json?row.billing_due_amount:row.total_amount==null||row.paid_amount==null?null:Number(row.total_amount)-Number(row.paid_amount);
  return PAYABLE_STATUSES.includes(row.status)&&amount!=null&&Number.isSafeInteger(Number(amount))&&Number(amount)>0;
}

export { REMINDER_STATUS_LABELS, normalizeReminderPhone, debtReminderMessage } from "../../../shared/mobile-debt-reminders";
export type { ReminderStatus,DebtReminderContext,DebtReminderInput,DebtReminderRow } from "../../../shared/mobile-debt-reminders";
export async function reminderRequest<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.status!=='success')throw new Error(body?.message||'Không xử lý được yêu cầu nhắc nợ. Kiểm tra lịch sử trước khi gửi lại.');
  return body.data;
}

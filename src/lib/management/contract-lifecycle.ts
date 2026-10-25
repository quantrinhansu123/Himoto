import { createInstallmentPlan, installmentSchedule, parseInstallmentPlan, type InstallmentPlan } from './contract-billing';

export type ContractLifecycleAction='mark_bad_debt'|'settle'|'hold'|'resume';
export interface LifecycleItem {id:number;vehicle_id:number;name:string;license:string;rent_at:string|null;return_at:string|null;completed_at:string|null}
export interface LifecycleEvent {action:string;at:string;recorded_at:string;actor_id:number;actor_name:string;note:string;from:string;to:string;request_id:string;request_hash:string;[key:string]:unknown}
export interface ContractLifecycleContext {
  id:number;code:string;status:string;revision:string;ownership:boolean;overdue:boolean;rental_type?:string;contract_type_name?:string;
  items:LifecycleItem[];all_returned:boolean;returned_count:number;
  total_amount:number|null;paid_amount:number|null;remaining:number|null;deposit_held:number;overpayment:number|null;
  settled:boolean;can_settle:boolean;settlement_note:string;events:LifecycleEvent[];
  held_at:string|null;resume_vehicle_count:number;plan:InstallmentPlan|null;base_total:number|null;start_at:string|null;end_at:string|null;
}
export interface ContractLifecycleInput {
  action:ContractLifecycleAction;revision:string;request_id:string;note:string;at:string;confirmed:boolean;
  vehicle_ids?:number[];resume_end?:string;resume_package?:string;resume_amount?:string;
}
/** The stored workflow remains renting while an unpaid, late contract displays overdue. */
export function lifecycleDisplayStatus(context:Pick<ContractLifecycleContext,'status'|'overdue'>) {
  return context.status==='renting'&&context.overdue?'overdue':context.status;
}
export function contractHoldDeadline(context:Pick<ContractLifecycleContext,'plan'|'end_at'>) {
  const end=context.plan?`${context.plan.end}:00+07:00`:context.end_at;
  return end?new Date(end).getTime():NaN;
}
export function canHoldContract(context:Pick<ContractLifecycleContext,'ownership'|'status'|'items'|'plan'|'end_at'>,now=Date.now()) {
  return context.ownership&&['renting','overdue','wait_payment'].includes(context.status)
    &&context.items.some(item=>!item.completed_at)&&contractHoldDeadline(context)>now;
}
export const lifecycleActionLabel:Record<ContractLifecycleAction,string>={mark_bad_debt:'Chuyển sang Nợ xấu',settle:'Xác nhận tất toán',hold:'Bảo lưu hợp đồng',resume:'Thuê lại từ bảo lưu'};
export const localLifecycleTime=(value=new Date())=>new Date(value.getTime()+7*3600000).toISOString().slice(0,16);
export function validLifecycleTime(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;
  const date=new Date(value+':00+07:00');return Number.isFinite(date.getTime())&&localLifecycleTime(date)===value;
}
/** Keep charged periods unchanged and shift only uncharged periods by the pause. */
export function resumeInstallmentPlan(raw:unknown,heldAt:string,resumedAt:string) {
  const plan=parseInstallmentPlan(raw);
  if(!plan||!validLifecycleTime(heldAt)||!validLifecycleTime(resumedAt)||resumedAt<=heldAt)throw Error('Ngày thuê lại phải sau ngày bảo lưu và lịch đóng tiền gốc phải hợp lệ.');
  const shift=new Date(resumedAt+':00+07:00').getTime()-new Date(heldAt+':00+07:00').getTime();
  const move=(value:string)=>localLifecycleTime(new Date(new Date(value+':00+07:00').getTime()+shift));
  const schedule=installmentSchedule(plan);if(!schedule.some(period=>period.due_at>heldAt))throw Error('Lịch gốc không còn kỳ tương lai. Cần đối chiếu thời hạn trước khi thuê lại.');
  const periods=schedule.map(period=>({due_at:period.due_at>heldAt?move(period.due_at):period.due_at,amount:period.amount}));
  const next:InstallmentPlan={version:1,start:plan.start,end:move(plan.end),interval:'custom',amount:plan.amount,periods};
  if(!parseInstallmentPlan(next))throw Error('Không lập được lịch đóng tiền còn lại.');return next;
}
/** Legacy contracts without a schedule need an explicitly reviewed remaining schedule. */
export function legacyResumePlan(base:number,start:string,resume:string,end:string,packageName:string,amount:number) {
  const next=createInstallmentPlan(resume,end,packageName,amount);
  if(!next||!Number.isSafeInteger(base)||base<0||!validLifecycleTime(start)||start>=resume)throw Error('Nhập ngày hết hạn, gói thuê và số tiền mỗi kỳ còn lại đã đối chiếu.');
  if(base===0)return {plan:next,base_total:amount};
  const plan:InstallmentPlan={version:1,start,end,interval:'custom',amount:base,periods:[{due_at:start,amount:base},...installmentSchedule(next).map(period=>({due_at:period.due_at,amount:period.amount}))]};
  if(!parseInstallmentPlan(plan))throw Error('Lịch đóng tiền bổ sung không hợp lệ.');return {plan,base_total:base};
}
function checkedContext(value:ContractLifecycleContext,id:number){
  if(!value||value.id!==id||typeof value.status!=='string'||typeof value.revision!=='string'||!/^\d+$/.test(value.revision)||!Array.isArray(value.items)||!Array.isArray(value.events)||typeof value.all_returned!=='boolean'||typeof value.can_settle!=='boolean')throw Error('Kết quả đối chiếu hợp đồng chưa hợp lệ. Nhấn Làm mới để đọc lại.');return value;
}
export async function loadContractLifecycle(id:number,signal?:AbortSignal):Promise<ContractLifecycleContext>{
  const response=await fetch(`/api/auth/order/car-rental/${id}/lifecycle`,{cache:'no-store',credentials:'same-origin',signal});
  const result=await response.json();if(!response.ok||result.status!=='success')throw Error(result.message||'Không tải được tình trạng hợp đồng.');return checkedContext(result.data,id);
}
export async function saveContractLifecycle(id:number,input:ContractLifecycleInput):Promise<ContractLifecycleContext>{
  const response=await fetch(`/api/auth/order/car-rental/${id}/lifecycle`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(input)});
  const result=await response.json();if(!response.ok||result.status!=='success')throw Error(result.message||'Chưa ghi nhận được thao tác. Kiểm tra lịch sử trước khi thử lại.');return checkedContext(result.data,id);
}

import type { ReturnableContractItem, ReturnInput, ReturnSettlement } from './contract-returns';
import type { PaymentContext } from './contract-payments';

export interface ReturnCorrectionLine extends ReturnableContractItem {
  late_fee:number; repair_fee:number; repair_note:string; early_discount:number; hourly_rate:number;
}
export interface ReturnCorrectionContext {
  order_id:number; code:string; customer:string; revision:string; event_key:string;
  lines:ReturnCorrectionLine[]; payment:PaymentContext; settlement:ReturnSettlement;
  previous_adjustment:number; note:string; blocked_reason:string;
}
export interface ReturnCorrectionInput {
  item_id:number; revision:string; request_id:string; reason:string; note:string;
  items:ReturnInput[]; settlement:ReturnSettlement;
}
async function request(input:number|ReturnCorrectionInput,signal?:AbortSignal):Promise<ReturnCorrectionContext> {
  const writing=typeof input!=='number';
  const response=await fetch(`/api/auth/returns/correction${writing?'':`?item_id=${input}`}`,{
    method:writing?'PATCH':'GET',credentials:'same-origin',cache:'no-store',signal,
    headers:{Accept:'application/json',...(writing?{'Content-Type':'application/json'}:{})},
    ...(writing?{body:JSON.stringify(input)}:{}),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw new Error(result?.message||'Không tải hoặc lưu được thông tin sửa trả xe.');
  return result.data;
}
export const loadReturnCorrection=(item:number,signal?:AbortSignal)=>request(item,signal);
export const saveReturnCorrection=(input:ReturnCorrectionInput)=>request(input);

import { addRentalDuration } from '../../../shared/rental-time';
import type { MobileFinanceContext,MobilePaymentInput } from '../../../shared/mobile-finance';
/** The web cashflow dialog extends each chosen line from its own current due time. */
export function paymentRenewalLines(context:MobileFinanceContext,picks:Record<string,string>,days:string):NonNullable<MobilePaymentInput['items']>{
  if(!/^[0-9]+$/.test(days)||Number(days)<1||Number(days)>365)throw Error('Chọn từ 1 đến 365 ngày gia hạn.');
  const entries=Object.entries(picks);if(!entries.length||entries.length>50)throw Error('Chọn từ 1 đến 50 xe cần gia hạn.');
  return entries.map(([key,amount])=>{const item=context.renewalItems?.find(r=>String(r.id)===key);if(!item||!item.returnAt)throw Error('Xe đã thay đổi hoặc chưa có hẹn trả. Tải lại trước khi gia hạn.');
    if(!/^(0|[1-9]\d{0,12})$/.test(amount))throw Error(`Nhập tiền gia hạn nguyên VND cho xe ${item.license||item.name}.`);
    const returnAt=addRentalDuration(item.returnAt,Number(days),'day');if(!returnAt)throw Error('Ngày hẹn trả mới không hợp lệ.');
    return{item_id:item.id,item_revision:item.revision,return_at:returnAt,amount};});
}
export function paymentRenewalTotal(lines:NonNullable<MobilePaymentInput['items']>){const total=lines.reduce((s,r)=>s+Number(r.amount),0);if(!Number.isSafeInteger(total)||total<1||total>9999999999999)throw Error('Tổng tiền gia hạn phải lớn hơn 0 và trong giới hạn lưu trữ.');return total;}
export function suggestedPaymentRenewal(dailyPrice:number|null,days:string){const n=/^[0-9]+$/.test(days)?Number(days):0;return dailyPrice&&n>=1&&n<=365?String(dailyPrice*n):'';}

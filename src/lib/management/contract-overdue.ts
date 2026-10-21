import type { ManagementRow } from './types';
import { DEFAULT_LATE_HOURLY_RATE,lateReturnFee } from './return-fees';

interface OverdueItem {return_at?:unknown;completed_at?:unknown;daily_price?:unknown}
function itemsFrom(value:unknown):OverdueItem[]|undefined {
  if(typeof value!=='string'||!value)return;
  try {const items=JSON.parse(value);return Array.isArray(items)?items.filter(item=>item&&typeof item==='object'):undefined;}catch{return;}
}
/** Read-only estimate for vehicles still on hire. It never changes contract totals or receipts. */
export function withContractOverdue(row:ManagementRow,now=Date.now()):ManagementRow {
  const saved=itemsFrom(row.overdue_items_json);
  const vehicles=itemsFrom(row.vehicles_json);
  const dated=vehicles?.filter(item=>item.return_at);
  const items=saved??(dated?.length?dated:[{return_at:row.end_date}]);
  let minutes:number|undefined,fee=0,unknownFee=false;
  for(const item of items){
    if(item.completed_at)continue;
    const due=Date.parse(String(item.return_at||''));
    if(!Number.isFinite(due)){unknownFee=true;continue;}
    const elapsed=Math.max(now-due,0);
    minutes=Math.max(minutes??0,Math.floor(elapsed/60000));
    if(!elapsed)continue;
    const price=Number(item.daily_price);
    const estimate=lateReturnFee(Math.ceil(elapsed/60000),DEFAULT_LATE_HOURLY_RATE,Number.isSafeInteger(price)&&price>0?price:null);
    if(estimate.amount===null)unknownFee=true;else fee+=estimate.amount;
  }
  const total=row.total_amount,paid=row.paid_amount;
  return {...row,overdue_minutes:minutes,overdue_days:minutes===undefined?0:Math.floor(minutes/1440),
    overdue_fee_estimate:minutes===undefined||unknownFee?undefined:fee,
    rental_debt_amount:total===undefined||total===''||paid===undefined||paid===''?undefined:Math.max(Number(total)-Number(paid),0)};
}

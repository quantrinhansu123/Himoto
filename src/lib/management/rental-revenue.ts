export const RENTAL_REVENUE_KEYS=['rental','renewal','late','early'] as const;
export type RentalRevenueAmounts=Record<typeof RENTAL_REVENUE_KEYS[number],number>&{revenue:number};
export interface RentalRevenueGroup extends RentalRevenueAmounts {key:string;name:string;events:number}
export interface RentalRevenueReport {total:RentalRevenueAmounts;days:RentalRevenueGroup[];staff:RentalRevenueGroup[];unassigned:RentalRevenueAmounts;company_fees:number;unclassified_amount:number;unclassified_count:number}
export const emptyRentalRevenue=():RentalRevenueAmounts=>({rental:0,renewal:0,late:0,early:0,revenue:0});
export interface RevenueReceipt {day:string;category:string;amount:unknown;staff_id:string|null;staff_name:string|null}
export function summarizeRentalRevenue(receipts:RevenueReceipt[]):RentalRevenueReport {
  const total=emptyRentalRevenue(),unassigned=emptyRentalRevenue(),days=new Map<string,RentalRevenueGroup>(),staff=new Map<string,RentalRevenueGroup>();
  let unclassified_amount=0,unclassified_count=0,company_fees=0;
  for(const receipt of receipts){
    const value=Number(receipt.amount);
    if(receipt.amount===null||!Number.isSafeInteger(value)||value<0||!/^\d{4}-\d{2}-\d{2}$/.test(receipt.day))throw Error('Phiếu thu / chi có số liệu không hợp lệ. Cần đối chiếu.');
    if(receipt.category==='unclassified'){unclassified_amount+=value;unclassified_count++;continue;}
    if(receipt.category==='company_fee'){company_fees+=value;continue;}
    if(!RENTAL_REVENUE_KEYS.includes(receipt.category as typeof RENTAL_REVENUE_KEYS[number]))continue;
    const kind=receipt.category as typeof RENTAL_REVENUE_KEYS[number];
    if(!value)continue;
    const company=kind==='renewal'||kind==='late';
    if(kind==='late')company_fees+=value;
    const name=company?'Công ty':String(receipt.staff_name||'').normalize('NFC').trim().replace(/\s+/g,' ');
    const linked=!company&&receipt.staff_id&&/^[1-9]\d*$/.test(receipt.staff_id),assigned=Boolean(company||linked||name),key=company?'company':linked?String(receipt.staff_id):name?`name:${name.toLocaleLowerCase('vi')}`:'unassigned';
    const person=staff.get(key)||{...emptyRentalRevenue(),key,name:assigned?name||`Nhân viên #${key}`:'Chưa phân công NVKD',events:0};
    const daily=days.get(receipt.day)||{...emptyRentalRevenue(),key:receipt.day,name:receipt.day,events:0};
    for(const target of [total,daily,person,...(assigned?[]:[unassigned])]){target[kind]+=value;target.revenue+=kind==='early'?-value:kind==='late'?0:value;}
    daily.events++;person.events++;days.set(receipt.day,daily);staff.set(key,person);
  }
  for(const group of [total,unassigned,...days.values(),...staff.values()])if(!RENTAL_REVENUE_KEYS.every(key=>Number.isSafeInteger(group[key]))||!Number.isSafeInteger(group.revenue))throw Error('Doanh thu vượt giới hạn tính toán. Cần đối chiếu.');
  if(!Number.isSafeInteger(unclassified_amount)||!Number.isSafeInteger(company_fees))throw Error('Tổng phí công ty hoặc phiếu chưa phân loại vượt giới hạn tính toán.');
  return {total,unassigned,days:[...days.values()].sort((a,b)=>b.key.localeCompare(a.key)),staff:[...staff.values()].sort((a,b)=>b.revenue-a.revenue||a.name.localeCompare(b.name,'vi')),company_fees,unclassified_amount,unclassified_count};
}
export function validRentalRevenue(value:unknown):value is RentalRevenueReport {
  const report=value as RentalRevenueReport;
  const valid=(row:RentalRevenueAmounts)=>row&&RENTAL_REVENUE_KEYS.every(key=>Number.isSafeInteger(row[key])&&row[key]>=0)&&Number.isSafeInteger(row.revenue)&&row.revenue===row.rental+row.renewal-row.early;
  if(!Number.isSafeInteger(report?.company_fees)||report.company_fees<0)return false;
  if(!report||!valid(report.total)||!valid(report.unassigned)||!Array.isArray(report.days)||!Array.isArray(report.staff)||!Number.isSafeInteger(report.unclassified_count)||report.unclassified_count<0||!Number.isSafeInteger(report.unclassified_amount)||report.unclassified_amount<0)return false;
  for(const rows of [report.days,report.staff]){
    if(rows.some(row=>!valid(row)||typeof row.key!=='string'||typeof row.name!=='string'||!Number.isSafeInteger(row.events)||row.events<0)||new Set(rows.map(row=>row.key)).size!==rows.length)return false;
    if([...RENTAL_REVENUE_KEYS,'revenue' as const].some(key=>rows.reduce((sum,row)=>sum+row[key],0)!==report.total[key]))return false;
  }
  return true;
}
export async function loadRentalRevenue(from:string,to:string,store:string,signal?:AbortSignal):Promise<RentalRevenueReport>{
  const query=new URLSearchParams({from,to,...(store==='all'?{}:{store_id:store})});
  const response=await fetch(`/api/auth/rental-revenue?${query}`,{cache:'no-store',credentials:'same-origin',signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success'||!validRentalRevenue(result.data))throw Error(result?.message||'Không tải được doanh thu thuê xe hoặc tổng chi tiết chưa khớp.');
  return result.data;
}

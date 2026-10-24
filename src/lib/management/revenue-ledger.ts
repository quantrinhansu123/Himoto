export const REVENUE_LEDGER_CATEGORIES={rental:'Thu tiền thuê',renewal:'Thu gia hạn',late:'Thu phí trả muộn',early:'Hoàn tiền thuê',deposit:'Thu cọc',deposit_refund:'Hoàn cọc',repair:'Thu phí sửa chữa',extra:'Thu khác',unclassified:'Chưa phân loại'} as const;
export const REVENUE_LEDGER_METHODS={cash:'Tiền mặt',personal:'TK cá nhân',company:'TK công ty',mixed:'Chưa tách TM / CK',unknown:'Chưa rõ hình thức'} as const;
export type RevenueLedgerCategory=keyof typeof REVENUE_LEDGER_CATEGORIES;
export type RevenueLedgerMethod=keyof typeof REVENUE_LEDGER_METHODS;
export interface RevenueLedgerRow {
 id:string;order_id:number;code:string;customer:string;store_id:number|null;store_name:string;at:string;day:string;
 category:RevenueLedgerCategory;method:RevenueLedgerMethod;type:'in'|'addon'|'out';amount:number;revenue:number;
 staff_name:string;actor_name:string;note:string;vehicles:string;start_at:string|null;end_at:string|null;
}
export interface RevenueLedgerTotals {
 count:number;contracts:number;income_count:number;expense_count:number;revenue_count:number;
 income:number;expense:number;net:number;revenue:number;deposit:number;deposit_refund:number;
 methods:Record<RevenueLedgerMethod,{income:number;expense:number;revenue:number;count:number}>;
}
export interface RevenueLedgerReport {rows:RevenueLedgerRow[];total:number;page:number;pages:number;page_size:number;totals:RevenueLedgerTotals;export_all:boolean}
export interface RevenueLedgerQuery {from:string;to:string;store:string;search:string;category:string;method:string;page:number;size:number}
export function validRevenueLedger(value:unknown):value is RevenueLedgerReport {
 const report=value as RevenueLedgerReport,t=report?.totals;
 const integer=(n:unknown)=>Number.isSafeInteger(n);
 if(!report||!Array.isArray(report.rows)||!t||typeof report.export_all!=='boolean'||!integer(report.total)||report.total<0||!integer(report.page)||report.page<1||!integer(report.pages)||report.pages<1||!integer(report.page_size)||report.page_size<1||report.page>report.pages||report.total!==t.count)return false;
 if(['count','contracts','income_count','expense_count','revenue_count','income','expense','deposit','deposit_refund'].some(key=>!integer(t[key as keyof RevenueLedgerTotals])||Number(t[key as keyof RevenueLedgerTotals])<0)||!integer(t.net)||!integer(t.revenue)||t.net!==t.income-t.expense||t.income_count+t.expense_count!==t.count||t.revenue_count>t.count)return false;
 const methods=Object.keys(REVENUE_LEDGER_METHODS) as RevenueLedgerMethod[];
 if(!t.methods||methods.some(key=>!t.methods[key]||!integer(t.methods[key].income)||t.methods[key].income<0||!integer(t.methods[key].expense)||t.methods[key].expense<0||!integer(t.methods[key].revenue)||!integer(t.methods[key].count)||t.methods[key].count<0))return false;
 if(methods.reduce((n,k)=>n+t.methods[k].income,0)!==t.income||methods.reduce((n,k)=>n+t.methods[k].expense,0)!==t.expense||methods.reduce((n,k)=>n+t.methods[k].revenue,0)!==t.revenue||methods.reduce((n,k)=>n+t.methods[k].count,0)!==t.count)return false;
 if(new Set(report.rows.map(r=>r.id)).size!==report.rows.length||report.rows.some(r=>!/^[1-9]\d*$/.test(r.id)||!integer(r.order_id)||r.order_id<1||!['in','addon','out'].includes(r.type)||!Object.hasOwn(REVENUE_LEDGER_CATEGORIES,r.category)||!Object.hasOwn(REVENUE_LEDGER_METHODS,r.method)||!integer(r.amount)||r.amount<0||!integer(r.revenue)||!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||!Number.isFinite(Date.parse(r.at))||[r.code,r.customer,r.store_name,r.staff_name,r.actor_name,r.note,r.vehicles].some(v=>typeof v!=='string')))return false;
 if(report.rows.length>report.total||report.export_all&&report.rows.length!==report.total||!report.export_all&&report.rows.length>report.page_size)return false;
 if(t.contracts>t.count||t.deposit>t.income||t.deposit_refund>t.expense||report.pages!==Math.max(1,Math.ceil(report.total/report.page_size))||report.rows.length!==Math.min(report.page_size,Math.max(0,report.total-(report.page-1)*report.page_size)))return false;
 if(report.rows.length===report.total){
  if(report.rows.reduce((n,r)=>n+r.revenue,0)!==t.revenue||new Set(report.rows.map(r=>r.order_id)).size!==t.contracts||report.rows.filter(r=>r.revenue!==0).length!==t.revenue_count)return false;
  if(methods.some(key=>{const rows=report.rows.filter(r=>r.method===key),m=t.methods[key];return rows.length!==m.count||rows.reduce((n,r)=>n+(r.type==='out'?0:r.amount),0)!==m.income||rows.reduce((n,r)=>n+(r.type==='out'?r.amount:0),0)!==m.expense||rows.reduce((n,r)=>n+r.revenue,0)!==m.revenue;}))return false;
 }
 return true;
}
export async function loadRevenueLedger(query:RevenueLedgerQuery,signal?:AbortSignal,all=false):Promise<RevenueLedgerReport>{
 const params=new URLSearchParams({from:query.from,to:query.to,search:query.search,category:query.category,method:query.method,page:String(query.page),size:String(query.size),...(query.store==='all'?{}:{store_id:query.store}),...(all?{all:'1'}:{})});
 const response=await fetch(`/api/auth/rental-revenue/transactions?${params}`,{credentials:'same-origin',cache:'no-store',signal});
 const result=await response.json().catch(()=>null);
 if(!response.ok||result?.status!=='success'||!validRevenueLedger(result.data))throw Error(result?.message||'Không tải được sổ giao dịch hoặc tổng chi tiết chưa khớp.');
 return result.data;
}

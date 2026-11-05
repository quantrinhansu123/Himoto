export interface MobileStoreContract {id:number;code:string;customer:string;status:string;license:string;startsAt:string;endsAt:string;total:number;paid:number}
export interface MobileStoreContracts {id:number;name:string;rows:MobileStoreContract[];page:number;pages:number;total:number;summary:{count:number;total:number;paid:number;debt:number};statusCounts:[string,number][]}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const money=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
export function isMobileStoreContracts(v:unknown):v is MobileStoreContracts{
  return object(v)&&count(v.id)&&Number(v.id)>0&&typeof v.name==='string'&&Array.isArray(v.rows)&&v.rows.length<=25&&v.rows.every(r=>object(r)&&count(r.id)&&Number(r.id)>0&&['code','customer','status','license','startsAt','endsAt'].every(k=>typeof r[k]==='string')&&money(r.total)&&money(r.paid))
    &&count(v.page)&&Number(v.page)>0&&count(v.pages)&&Number(v.pages)>=Number(v.page)&&count(v.total)&&object(v.summary)&&count(v.summary.count)&&['total','paid','debt'].every(k=>money((v.summary as Record<string,unknown>)[k]))&&Array.isArray(v.statusCounts)&&v.statusCounts.every(s=>Array.isArray(s)&&s.length===2&&typeof s[0]==='string'&&count(s[1]));
}

export interface StaffSalesRow { staff_id:number; name:string; department:'NVKD'|'TLS'; contracts:number; customers:number; new_customers:number; revenue:number }
export interface StaffSalesReport { rows:StaffSalesRow[]; unassigned_revenue:number; unassigned_contracts:number }
import { summarizeBySalesStaff,summarizeByStore,summarizeSalesKpis,type SourceSalesSummary,type SalesKpis } from './source-sales';
import { mapApiRow } from './repository';
import type { ManagementRow } from './types';
export interface SalesSummaryReport { sources:SourceSalesSummary;stores:SourceSalesSummary;kpis:SalesKpis }
export async function loadSalesSummary(from:string,to:string,store:string,staff:ManagementRow[],signal?:AbortSignal):Promise<SalesSummaryReport> {
  const query=new URLSearchParams({summary:'sales',from,to,store});
  const response=await fetch(`/api/auth/order/car-rental?${query}`,{cache:'no-store',credentials:'same-origin',signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw Error(result?.message||'Không tải được thống kê doanh số.');
  if(Array.isArray(result.data)){const rows=result.data.map((row:Record<string,unknown>)=>mapApiRow('contracts',row));return {sources:summarizeBySalesStaff(rows,from,to,store,staff),stores:summarizeByStore(rows,from,to,store),kpis:summarizeSalesKpis(rows,from,to,store)};}
  if(!Array.isArray(result.data?.sources?.rows)||!Array.isArray(result.data?.stores?.rows)||!result.data.kpis)throw Error('Thống kê doanh số không hợp lệ.');
  return result.data;
}
export async function loadStaffSales(from:string,to:string,store:string,signal?:AbortSignal):Promise<StaffSalesReport> {
  const query = new URLSearchParams({from,to,...(store !== 'all' ? {store_id:store} : {})});
  const response = await fetch(`/api/auth/staff-sales?${query}`,{cache:'no-store',credentials:'same-origin',signal});
  const result = await response.json().catch(()=>null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result.data?.rows)) throw new Error(result?.message || 'Không tải được doanh số nhân viên.');
  return result.data;
}

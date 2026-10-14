export interface StaffSalesRow { staff_id:number; name:string; department:'NVKD'|'TLS'; contracts:number; customers:number; new_customers:number; revenue:number }
export interface StaffSalesReport { rows:StaffSalesRow[]; unassigned_revenue:number; unassigned_contracts:number }
export async function loadStaffSales(from:string,to:string,store:string,signal?:AbortSignal):Promise<StaffSalesReport> {
  const query = new URLSearchParams({from,to,...(store !== 'all' ? {store_id:store} : {})});
  const response = await fetch(`/api/auth/staff-sales?${query}`,{cache:'no-store',credentials:'same-origin',signal});
  const result = await response.json().catch(()=>null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result.data?.rows)) throw new Error(result?.message || 'Không tải được doanh số nhân viên.');
  return result.data;
}

export const FLEET_TOTAL_FIELDS = ['vehicles','local_vehicles','away_vehicles','rentals','direct_revenue','loan_revenue','unassigned_rentals','unassigned_revenue','revenue'] as const;
export type FleetRevenueTotals = Record<typeof FLEET_TOTAL_FIELDS[number],number>;
export interface FleetStoreRevenue extends FleetRevenueTotals { store_id:number; store_name:string }
export interface FleetVehicleRevenue extends FleetRevenueTotals { id:number; name:string; license:string; store_id:number; store_name:string; current_store_name:string }
export type OwnedFleetRevenueReport =
  | { view:'stores'; rows:FleetStoreRevenue[]; total:FleetRevenueTotals }
  | { view:'vehicles'; rows:FleetVehicleRevenue[]; total:FleetRevenueTotals; page:number; size:number };

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const positive=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0;
function validTotals(value:unknown) {
  const row=record(value);
  return FLEET_TOTAL_FIELDS.every(key=>Number.isSafeInteger(row[key]))
    && ['vehicles','local_vehicles','away_vehicles','rentals','unassigned_rentals'].every(key=>Number(row[key])>=0)
    && row.vehicles===Number(row.local_vehicles)+Number(row.away_vehicles)
    && row.revenue===Number(row.direct_revenue)+Number(row.loan_revenue)+Number(row.unassigned_revenue)
    && Number(row.unassigned_rentals)<=Number(row.rentals);
}
export function validOwnedFleetReport(value:unknown,query:URLSearchParams) {
  const report=record(value),total=record(report.total);
  if(!validTotals(total)||!Array.isArray(report.rows)||report.view!==(query.get('view')||'stores'))return false;
  const rows=report.rows.map(record),vehicles=report.view==='vehicles';
  if(rows.some(row=>!validTotals(row)||!positive(row.store_id)||typeof row.store_name!=='string'||query.has('store_id')&&Number(row.store_id)!==Number(query.get('store_id'))))return false;
  if(vehicles){
    if(!positive(report.page)||!positive(report.size)||Number(report.size)>50||Number(report.page)>Math.max(1,Math.ceil(Number(total.vehicles)/Number(report.size))))return false;
    if(rows.some(row=>!positive(row.id)||row.vehicles!==1||Number(row.store_id)!==Number(query.get('store_id'))||!['name','license','current_store_name'].every(key=>typeof row[key]==='string')))return false;
    if(new Set(rows.map(row=>row.id)).size!==rows.length||rows.length!==Math.min(Number(report.size),Math.max(0,Number(total.vehicles)-(Number(report.page)-1)*Number(report.size))))return false;
  }else if(report.view!=='stores'||new Set(rows.map(row=>row.store_id)).size!==rows.length)return false;
  // A complete result (including a one-page vehicle result) must reconcile.
  if(!vehicles||Number(total.vehicles)<=Number(report.size))return FLEET_TOTAL_FIELDS.every(key=>rows.reduce((sum,row)=>sum+Number(row[key]),0)===total[key]);
  return true;
}
export async function loadOwnedFleetReport(query:URLSearchParams,signal?:AbortSignal):Promise<OwnedFleetRevenueReport> {
  const response=await fetch(`/api/auth/staff-sales/owned-fleet-revenue?${query}`,{credentials:'same-origin',cache:'no-store',signal});
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.status!=='success')throw Error(body?.message||'Không tải được doanh thu đội xe theo cơ sở.');
  if(!validOwnedFleetReport(body.data,query))throw Error('Số liệu đội xe chưa khớp tổng. Vui lòng thử lại.');
  return body.data;
}

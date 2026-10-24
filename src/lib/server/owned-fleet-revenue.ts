import 'server-only';
import type { PoolClient } from 'pg';
import { FLEET_TOTAL_FIELDS,type FleetRevenueTotals,type FleetStoreRevenue,type FleetVehicleRevenue,type OwnedFleetRevenueReport } from '@/lib/management/owned-fleet-revenue';
import { VEHICLE_REVENUE_LINES_CTE,rentalReportScope,RentalReportError } from './rental-reports';

const invalid=()=>new RentalReportError('Bộ lọc doanh thu đội xe không hợp lệ.');
function integer(value:string,min:number,max:number) {
  if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw invalid();
  return Number(value);
}
function totals(row:Record<string,unknown>):FleetRevenueTotals {
  return Object.fromEntries(FLEET_TOTAL_FIELDS.map(key=>{
    if(row[key]==null||!Number.isSafeInteger(Number(row[key])))throw new RentalReportError('Số tiền hoặc số xe chưa hợp lệ. Cần đối chiếu dữ liệu.');
    return [key,Number(row[key])];
  })) as FleetRevenueTotals;
}
// Ownership is v.store_id. Transfers change current_store_id only. Classify
// each historical hire by its saved order branch, never today's parking branch.
export const OWNED_FLEET_CTE = `${VEHICLE_REVENUE_LINES_CTE}, fleet AS MATERIALIZED (
  SELECT v.id,v.name,v.license,v.store_id,COALESCE(s.store_name,'Cơ sở #'||v.store_id::text) AS store_name,
    COALESCE(cs.store_name,'Chưa cập nhật') AS current_store_name,
    1::int AS vehicles,(COALESCE(NULLIF(v.current_store_id,0),v.store_id)=v.store_id)::int AS local_vehicles,
    (COALESCE(NULLIF(v.current_store_id,0),v.store_id)<>v.store_id)::int AS away_vehicles
  FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=v.store_id
    LEFT JOIN himoto.stores cs ON cs.id=COALESCE(NULLIF(v.current_store_id,0),v.store_id)
  WHERE v.deleted_at IS NULL AND v.store_id>0 AND ($3::bigint IS NULL OR v.store_id=$3)
), amounts AS (
  SELECT f.id,count(l.id)::int AS rentals,
    COALESCE(sum(l.rental+l.renewal+l.adjustment) FILTER(WHERE l.operating_store_id=f.store_id),0) AS direct_revenue,
    COALESCE(sum(l.rental+l.renewal+l.adjustment) FILTER(WHERE l.operating_store_id>0 AND l.operating_store_id<>f.store_id),0) AS loan_revenue,
    count(l.id) FILTER(WHERE COALESCE(l.operating_store_id,0)<=0)::int AS unassigned_rentals,
    COALESCE(sum(l.rental+l.renewal+l.adjustment) FILTER(WHERE COALESCE(l.operating_store_id,0)<=0),0) AS unassigned_revenue,
    COALESCE(sum(l.rental+l.renewal+l.adjustment),0) AS revenue
  FROM fleet f LEFT JOIN lines l ON l.vehicle_id=f.id GROUP BY f.id
), matched AS (SELECT f.*,a.rentals,a.direct_revenue,a.loan_revenue,a.unassigned_rentals,a.unassigned_revenue,a.revenue FROM fleet f JOIN amounts a ON a.id=f.id)`;
const sumFields=FLEET_TOTAL_FIELDS.map(key=>`COALESCE(sum(${key}),0) AS ${key}`).join(',');
export async function ownedFleetRevenue(db:Pick<PoolClient,'query'>,query:URLSearchParams):Promise<OwnedFleetRevenueReport> {
  const {from,to,store}=rentalReportScope(query),view=query.get('view')||'stores';
  if(!['stores','vehicles'].includes(view)||view==='vehicles'&&store===null)throw invalid();
  const values=[from,to,store];
  if(view==='stores'){
    const result=await db.query(`${OWNED_FLEET_CTE} SELECT store_id,max(store_name) AS store_name,${sumFields} FROM matched GROUP BY store_id ORDER BY max(store_name),store_id`,values);
    const rows:FleetStoreRevenue[]=result.rows.map(row=>({store_id:Number(row.store_id),store_name:String(row.store_name),...totals(row)}));
    const total=Object.fromEntries(FLEET_TOTAL_FIELDS.map(key=>[key,rows.reduce((sum,row)=>sum+row[key],0)])) as FleetRevenueTotals;
    if(!Object.values(total).every(Number.isSafeInteger))throw new RentalReportError('Tổng doanh thu đội xe vượt giới hạn đối chiếu.');
    return {view:'stores',rows,total};
  }
  const page=integer(query.get('page')||'1',1,1_000_000),size=integer(query.get('size')||'10',1,50);
  const result=await db.query(`${OWNED_FLEET_CTE}, summary AS (SELECT ${sumFields} FROM matched), page AS (
    SELECT * FROM matched ORDER BY revenue DESC,id ASC LIMIT $4 OFFSET (SELECT (LEAST($5,GREATEST(1,ceil(vehicles::numeric/$4)))::int-1)*$4 FROM summary)
  ) SELECT summary.*,COALESCE((SELECT json_agg(p) FROM page p),'[]'::json) AS rows FROM summary`,[...values,size,page]);
  const row=result.rows[0],total=totals(row);
  const rows:FleetVehicleRevenue[]=row.rows.map((vehicle:Record<string,unknown>)=>({id:Number(vehicle.id),name:String(vehicle.name||''),license:String(vehicle.license||''),store_id:Number(vehicle.store_id),store_name:String(vehicle.store_name),current_store_name:String(vehicle.current_store_name),...totals(vehicle)}));
  return {view:'vehicles',rows,total,page:Math.min(page,Math.max(1,Math.ceil(total.vehicles/size))),size};
}

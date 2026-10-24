import 'server-only';
import type {PoolClient} from 'pg';
import type {ShiftInventoryCheck} from '@/lib/management/shift-autofill';
import {VEHICLE_ORDER_SQL} from './contract-classification';
import {contractVehicleReadSource} from './contract-vehicle-reads';

/** Current inventory and selected-day activity are different measures. Never
 * reconstruct historical stock from today's vehicle status. No data is changed. */
export async function readShiftInventory(db:Pick<PoolClient,'query'>,store:number,start:string,end:string):Promise<ShiftInventoryCheck>{
 const row=(await db.query(`WITH active_lines AS MATERIALIZED (
   SELECT o.id AS order_id,COALESCE(o.contract_number,o.draft_reference,'#'||o.id::text) AS code,o.store_id,
     d.id AS line_id,d.vehicle_id,d.rent_at,d.type,
     COALESCE(NULLIF(o.draft_payload #>> '{management_composer,rental_type}',''),NULLIF(o.order_type,''),'') AS rental_type
   FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id
   WHERE o.store_id=$1::bigint AND o.deleted_at IS NULL AND d.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
     AND o.order_status IN('renting','overdue','wait_payment','bad_debt')
     AND d.completed_at IS NULL AND COALESCE(d.rent_at,o.rent_at,'-infinity'::timestamptz)<=now()
 ), local_lines AS MATERIALIZED (
   SELECT * FROM active_lines WHERE store_id=$1::bigint
 ), rented AS MATERIALIZED (
   SELECT DISTINCT ON(vehicle_id) *,CASE
     WHEN rental_type='daily' THEN 'daily' WHEN rental_type ~ '^monthly(_[0-9]+)?$' THEN 'monthly'
     WHEN rental_type IN('ownership','ownership_cd') THEN 'other'
     WHEN type='day' THEN 'daily' WHEN type='month' THEN 'monthly' ELSE 'other' END AS category
   FROM local_lines WHERE vehicle_id IS NOT NULL ORDER BY vehicle_id,rent_at DESC NULLS LAST,line_id DESC
 ), ready AS MATERIALIZED (
   SELECT id FROM himoto.vehicles WHERE COALESCE(current_store_id,store_id)=$1::bigint AND status='ready'
 ), conflicts AS MATERIALIZED (
   -- The existing helper checks stock attached to another branch's contract
   -- without exposing that branch's customer or financial records.
   SELECT DISTINCT vehicle_id FROM himoto.vehicle_rental_blockers(ARRAY(SELECT id::bigint FROM ready))
   WHERE status IN('renting','overdue','wait_payment','bad_debt') AND COALESCE(rent_at,'-infinity'::timestamptz)<=now()
 ), started AS MATERIALIZED (
   SELECT o.id FROM himoto.orders o LEFT JOIN LATERAL (
     SELECT min(d.rent_at) AS starts_at FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL
   ) ov ON true
   WHERE o.store_id=$1::bigint AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
     AND o.order_status NOT IN('draft','cancelled','pending','deposit_contract')
     AND COALESCE(o.rent_at,ov.starts_at)>=$2::timestamptz AND COALESCE(o.rent_at,ov.starts_at)<$3::timestamptz
 ), duplicates AS MATERIALIZED (
   SELECT vehicle_id FROM local_lines WHERE vehicle_id IS NOT NULL GROUP BY vehicle_id HAVING count(DISTINCT order_id)>1
 ), issues AS (
   SELECT 'ready_rental' AS kind,l.order_id,l.code,l.vehicle_id,COALESCE(v.license,'') AS license FROM rented l
     JOIN ${contractVehicleReadSource()} v ON v.id=l.vehicle_id WHERE v.status='ready'
   UNION ALL SELECT 'missing_vehicle',l.order_id,l.code,l.vehicle_id,'' FROM local_lines l WHERE l.vehicle_id IS NULL
   UNION ALL SELECT 'duplicate_rental',l.order_id,l.code,l.vehicle_id,COALESCE(v.license,'') FROM local_lines l
     LEFT JOIN ${contractVehicleReadSource()} v ON v.id=l.vehicle_id WHERE l.vehicle_id IN(SELECT vehicle_id FROM duplicates)
 ) SELECT
   (SELECT count(*)::int FROM started) AS started_contracts,
   (SELECT count(DISTINCT d.vehicle_id)::int FROM himoto.order_vehicle_details d JOIN started s ON s.id=d.order_id WHERE d.deleted_at IS NULL) AS started_vehicles,
   (SELECT count(DISTINCT order_id)::int FROM local_lines WHERE vehicle_id IS NOT NULL) AS active_contracts,
   (SELECT count(*)::int FROM rented) AS active_vehicles,
   (SELECT count(*)::int FROM rented WHERE category='daily') AS daily_vehicles,
   (SELECT count(*)::int FROM rented WHERE category='monthly') AS monthly_vehicles,
   (SELECT count(*)::int FROM rented WHERE category='other') AS other_vehicles,
   (SELECT count(*)::int FROM ready WHERE id NOT IN(SELECT vehicle_id FROM conflicts)) AS stock_vehicles,
   (SELECT count(*)::int FROM ready) AS ready_vehicles_raw,
   (SELECT count(*)::int FROM conflicts) AS ready_conflicts,
   (SELECT count(*)::int FROM issues WHERE kind='ready_rental') AS ready_rentals,
   (SELECT count(*)::int FROM local_lines WHERE vehicle_id IS NULL) AS missing_vehicle_lines,
   (SELECT count(*)::int FROM duplicates) AS duplicate_vehicles,
   COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM (SELECT * FROM issues ORDER BY kind,order_id LIMIT 100)i),'[]'::jsonb) AS issues`,[store,start,end])).rows[0];
 const number=(value:unknown)=>{const n=Number(value);if(value==null||!Number.isSafeInteger(n)||n<0)throw Error('Chưa xác định được số xe từ DB. Vui lòng thử lại.');return n;};
 const keys=['started_contracts','started_vehicles','active_contracts','active_vehicles','daily_vehicles','monthly_vehicles','other_vehicles','stock_vehicles','ready_vehicles_raw','ready_conflicts','ready_rentals','missing_vehicle_lines','duplicate_vehicles'] as const;
 const result=Object.fromEntries(keys.map(key=>[key,number(row?.[key])])) as Omit<ShiftInventoryCheck,'issues'>;
 if(!Array.isArray(row?.issues)||result.active_vehicles!==result.daily_vehicles+result.monthly_vehicles+result.other_vehicles||result.stock_vehicles+result.ready_conflicts!==result.ready_vehicles_raw)throw Error('Tổng kiểm kê xe chưa khớp. Vui lòng thử lại.');
 return {...result,issues:row.issues.map((i:Record<string,unknown>)=>({kind:i.kind as ShiftInventoryCheck['issues'][number]['kind'],order_id:number(i.order_id),code:String(i.code),vehicle_id:i.vehicle_id==null?null:number(i.vehicle_id),license:String(i.license||'')}))};
}

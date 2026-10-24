import 'server-only';
import type {PoolClient} from 'pg';
import {summarizeRentalRevenue,type RevenueReceipt} from '@/lib/management/rental-revenue';
import {VEHICLE_ORDER_SQL} from './contract-classification';
import {depositReceiptSql} from './contract-deposits';
import {renewalReceiptSql} from './contract-receipts';
export class RentalRevenueError extends Error {}
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
// Allocate known initial non-rental fees over the entire receipt history BEFORE
// date filtering. Renewal snapshots identify receipts; unpaid snapshots add no revenue.
// Resolve attribution and initial fees once per relevant contract, rather than
// repeating its JSON/permission joins for every historical receipt.
export const RENTAL_REVENUE_SQL=`WITH scoped_orders AS MATERIALIZED (
  SELECT o.id,
    COALESCE(o.draft_payload #>> '{management_composer,profile,sales_staff_id}',o.draft_payload #>> '{management_composer,draft,sales_staff_id}') AS staff_id,
    COALESCE(o.draft_payload #>> '{management_composer,profile_attribution,NVKD,name}',o.draft_payload #>> '{management_composer,sales_attribution,NVKD,name}',s.full_name) AS staff_name,
    COALESCE(f.amount,0) AS initial_fees
  FROM himoto.orders o
  LEFT JOIN himoto.staff_profiles s ON s.id::text=COALESCE(o.draft_payload #>> '{management_composer,profile,sales_staff_id}',o.draft_payload #>> '{management_composer,draft,sales_staff_id}')
  LEFT JOIN LATERAL (SELECT SUM(CASE WHEN charge->>'amount' ~ '^[0-9]{1,13}$' THEN (charge->>'amount')::numeric ELSE 0 END) AS amount
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,draft,extra_charges}')='array'
      THEN o.draft_payload::jsonb #> '{management_composer,draft,extra_charges}' ELSE '[]'::jsonb END) charge) f ON true
  WHERE o.id=ANY($4::bigint[]) AND ${VEHICLE_ORDER_SQL}
), classified AS (
  SELECT t.id,t.order_id,t.store_id,t.created_at,t.value,
    CASE WHEN t.type='out' THEN CASE WHEN t.name='order:rental_refund' THEN 'early'
      WHEN t.name='order:deposit_refund' OR t.name LIKE 'order:complete:%' THEN 'excluded' ELSE 'unclassified' END
    WHEN ${depositReceiptSql()} OR t.name IN('order:return_repair','order:extra') THEN 'excluded'
    WHEN t.name='order:return_late' THEN 'late'
    WHEN ${renewalReceiptSql()} THEN 'renewal'
    WHEN t.name LIKE 'order:rental_fees%' OR t.name='order:payment' THEN 'rental'
    ELSE 'unclassified' END AS category,
    o.staff_id,o.staff_name,o.initial_fees
  FROM himoto.transactions t JOIN scoped_orders o ON o.id=t.order_id
  WHERE t.status='approved' AND t.type IN('in','addon','out')
    AND t.order_id=ANY($4::bigint[])
    AND t.created_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
), allocated AS (
  SELECT *,SUM(CASE WHEN category='rental' THEN value ELSE 0 END)
    OVER(PARTITION BY order_id ORDER BY created_at,id ROWS UNBOUNDED PRECEDING) AS regular_total FROM classified
)
SELECT to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS day,category,staff_id,staff_name,
  CASE WHEN category='rental' THEN GREATEST(regular_total-initial_fees,0)-GREATEST(regular_total-value-initial_fees,0) ELSE value END AS amount
FROM allocated WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND category<>'excluded'
  AND ($3::bigint IS NULL OR store_id=$3)`;
export async function rentalRevenue(db:Pick<PoolClient,'query'>,from:string,to:string,store?:number){
  if(!validDate(from)||!validDate(to)||from>to||store!==undefined&&(!Number.isSafeInteger(store)||store<=0))throw new RentalRevenueError('Kiểm tra khoảng ngày và cơ sở của báo cáo.');
  const relevant=await db.query(`SELECT DISTINCT order_id FROM himoto.transactions
    WHERE status='approved' AND type IN('in','addon','out') AND order_id IS NOT NULL
      AND created_at>=($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND ($3::bigint IS NULL OR store_id=$3)`,[from,to,store??null]);
  if(!relevant.rows.length)return summarizeRentalRevenue([]);
  const result=await db.query(RENTAL_REVENUE_SQL,[from,to,store??null,relevant.rows.map(row=>String(row.order_id))]);
  return summarizeRentalRevenue(result.rows as RevenueReceipt[]);
}

import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { vietnamDate } from '@/lib/management/duty-roster';
import { emptyAuditValues, type ShiftSnapshot } from '@/lib/management/shift-audits';
import type { ShiftInput } from '@/lib/management/shift-reports';
import { rentalRevenue } from './rental-revenue';

type DB=Pick<PoolClient,'query'>;
export async function readShiftSnapshot(db:DB,report:{payload:ShiftInput;app_snapshot?:ShiftSnapshot|null},inventoryOnly=false):Promise<ShiftSnapshot> {
  await db.query(`SET LOCAL statement_timeout='${inventoryOnly?5:20}s'; SET LOCAL jit=off; SET LOCAL join_collapse_limit=1; SET LOCAL from_collapse_limit=1`);
  const {store_id:store,date}=report.payload;
  const month=inventoryOnly?null:await rentalRevenue(db,date.slice(0,8)+'01',date,store);
  const day=month?.days.find(row=>row.key===date)||{rental:0,renewal:0,late:0,early:0,revenue:0};
  const values=emptyAuditValues();values.revenue_day=month?day.revenue:null;values.revenue_month=month?month.total.revenue:null;
  const accounts=inventoryOnly?{rows:[]}:await db.query(`WITH accounts AS (
    SELECT id,'cash' AS kind,COALESCE(opening_balance,0) AS opening FROM himoto.cash WHERE store_id=$1 AND (created_at IS NULL OR created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
    UNION ALL SELECT id,CASE WHEN owner_type='company' THEN 'company' ELSE 'personal' END,COALESCE(opening_balance,0) FROM himoto.banks WHERE store_id=$1 AND (created_at IS NULL OR created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
  ) SELECT a.kind, SUM(a.opening+COALESCE(t.delta,0)) AS balance FROM accounts a LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN type='out' THEN -value ELSE value END) AS delta FROM himoto.transactions
    WHERE status='approved' AND type IN('in','addon','out') AND created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND CASE WHEN a.kind='cash' THEN cash_id=a.id ELSE bank_id=a.id END
  ) t ON true GROUP BY a.kind`,[store,date]);
  for(const row of accounts.rows){const n=Number(row.balance);if(!Number.isSafeInteger(n))throw Error('Số dư sổ quỹ không hợp lệ.');values[row.kind as 'cash'|'company'|'personal']=n;}
  let assets_total:number|null=null;
  let inventory_note='Chưa có ảnh chụp kho xe của ngày này; cần KTNB kiểm tra chứng từ và giải trình. Không dùng kho hiện tại thay cho quá khứ.';
  // Inventory is a point-in-time observation. Financial receipts are queried by
  // their actual Vietnam receipt date; a historical stock count is never invented.
  if(report.app_snapshot){
    for(const key of ['vehicles','daily_vehicles','monthly_vehicles','other_vehicles'] as const)values[key]=report.app_snapshot.values[key]??null;
    assets_total=report.app_snapshot.assets_total;inventory_note=report.app_snapshot.inventory_note;
  } else if(date===vietnamDate()) {
    const inventory=await db.query(`WITH inventory AS MATERIALIZED (
      SELECT id,status FROM himoto.vehicles WHERE COALESCE(current_store_id,store_id)=$1 AND status<>'sold'
    ), blockers AS MATERIALIZED (
      SELECT DISTINCT ON(vehicle_id) vehicle_id,order_id,status FROM himoto.vehicle_rental_blockers(ARRAY(SELECT id FROM inventory))
      ORDER BY vehicle_id,CASE WHEN status IN('renting','overdue','bad_debt') THEN 0 ELSE 1 END,order_id DESC
    ) SELECT i.id,i.status,b.status AS rental_status,(i.status IN('ready','pending') AND COALESCE(b.status,'') NOT IN('renting','overdue','bad_debt')) AS available,COALESCE(NULLIF(o.draft_payload->'management_composer'->>'rental_type',''),NULLIF(o.order_type,''),o.order_type) AS rental_type FROM inventory i
      LEFT JOIN blockers b ON b.vehicle_id=i.id LEFT JOIN himoto.orders o ON o.id=b.order_id ORDER BY i.id`,[store]);
    assets_total=inventory.rows.length;
    values.vehicles=inventory.rows.filter(row=>row.available).length;
    const rented=inventory.rows.filter(row=>['using','bad_debt'].includes(row.status)||['renting','overdue','bad_debt'].includes(row.rental_status));
    values.daily_vehicles=rented.every(row=>typeof row.rental_type==='string')?rented.filter(row=>row.rental_type==='daily').length:null;
    values.monthly_vehicles=rented.every(row=>typeof row.rental_type==='string')?rented.filter(row=>/^monthly/.test(row.rental_type)).length:null;
    values.other_vehicles=values.daily_vehicles!==null&&values.monthly_vehicles!==null?assets_total-values.vehicles-values.daily_vehicles-values.monthly_vehicles:null;
    inventory_note='Kho xe tại thời điểm chụp số liệu app. Xe bảo dưỡng, điều chuyển, nợ xấu và thuê sở hữu vẫn thuộc tổng tài sản; không tự gộp vào xe có mặt tại PGD.';
  }
  const transfers=inventoryOnly?[]:(await db.query(`SELECT v.license AS plate,
    COALESCE(e.audit_snapshot->>'from_store_name',fs.store_name,e.from_store_id::text) AS "from",
    COALESCE(e.audit_snapshot->>'to_store_name',ts.store_name,e.to_store_id::text) AS "to"
    FROM himoto.vehicle_location_events e JOIN himoto.vehicles v ON v.id=e.vehicle_id
    LEFT JOIN himoto.stores fs ON fs.id=e.from_store_id LEFT JOIN himoto.stores ts ON ts.id=e.to_store_id
    WHERE (e.from_store_id=$1 OR e.to_store_id=$1) AND e.event_type IN('manual_transfer','transfer_dispatch')
      AND COALESCE(e.audit_snapshot #>> '{reconciliation,superseded}','false')<>'true'
      AND e.created_at>=($2::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND e.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ORDER BY e.id`,[store,date])).rows;
  const stable={date,values,assets_total,revenue:month?{rental:day.rental,renewal:day.renewal,late:day.late,early:day.early,revenue:day.revenue}:null,
    unclassified_count:month?.unclassified_count??null,inventory_only:inventoryOnly,transfers,inventory_note,
    accounts_note:'Số dư sổ quỹ app đến hết ngày, từ số dư đầu kỳ và phiếu đã duyệt. Chỉ cộng tài khoản gắn PGD; tài khoản công ty dùng chung không tự phân bổ. Đây không phải số dư ngân hàng trực tiếp.'};
  return {...stable,captured_at:new Date().toISOString(),fingerprint:createHash('sha256').update(JSON.stringify(stable)).digest('hex')};
}

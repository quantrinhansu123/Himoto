import 'server-only';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { readManagementTable } from './management-table';
import { contractVehicleReadSource } from './contract-vehicle-reads';
import { VEHICLE_GPS_JOIN_SQL } from './vehicle-gps-query';
import { CONTACT_STATUSES,HANDLING_STATUSES,type CollectionRow } from '@/lib/management/collection-report';
import { GPS_STATE_LABELS } from '@/lib/management/gps';
import { vietnamDate } from '@/lib/management/duty-roster';

type Database=Pick<PoolClient,'query'>;
export async function readCollectionReport(db:Database,store:string) {
  const result=await readManagementTable(db,'contracts',new URLSearchParams({scope:'overdue',all:'1',store}));
  const rows=result.rows;
  const meta=rows.length?(await db.query(`SELECT o.id,c.status AS customer_status,c.warning,f.*,
    (SELECT array_agg(DISTINCT COALESCE(gps.normalized_status,'none')) FROM himoto.order_vehicle_details d
      LEFT JOIN ${contractVehicleReadSource()} v ON v.id=d.vehicle_id ${VEHICLE_GPS_JOIN_SQL}
      WHERE d.order_id=o.id AND d.deleted_at IS NULL AND d.completed_at IS NULL) AS gps_states
    FROM himoto.orders o LEFT JOIN himoto.customers c ON c.id=o.customer_id
    LEFT JOIN himoto.management_collection_followups f ON f.order_id=o.id WHERE o.id=ANY($1::bigint[])`,[rows.map(row=>row.id)])).rows:[];
  const byId=new Map(meta.map(row=>[Number(row.id),row]));
  const data:CollectionRow[]=rows.map(row=>{
    const m=byId.get(row.id)||{},number=(value:unknown)=>value===undefined||value===null||value===''||!Number.isFinite(Number(value))?null:Number(value);
    return {id:row.id,code:row.code,customer:String(row.customer_name||''),phone:String(row.customer_phone||''),store_id:Number(row.store_id),store_name:String(row.store_name||''),vehicle:String(row.license||''),started_at:String(row.start_date||''),due_at:String(row.billing_plan_json?row.billing_overdue_at||row.billing_next_due_at||'':row.end_date||''),days:Number(row.overdue_days||0),amount:number(row.billing_plan_json?row.billing_due_amount:row.rental_debt_amount),late_fee:number(row.overdue_fee_estimate),
      gps:m.gps_states||[],customer_status:Number(m.customer_status)===2?'Nợ xấu':m.warning?'Cảnh báo':row.status==='bad_debt'?'Nợ xấu':'Bình thường',
      followup:{contact_status:m.contact_status||'uncontacted',handling_status:m.handling_status||'branch',customer_condition:m.customer_condition||'',notes:m.notes||'',revision:Number(m.revision||0),updated_at:m.updated_at}};
  }).sort((a,b)=>b.days-a.days||a.id-b.id);
  return {rows:data,read_at:new Date().toISOString()};
}
export function collectionReportMessages(rows:CollectionRow[],storeName:string,date=vietnamDate()) {
  const header=`BÁO CÁO NỢ CHẬM · ${storeName}\nNgày ${date.split('-').reverse().join('/')} · ${rows.length} hợp đồng`;
  const chunks:string[]=[];let chunk=header;
  for(const row of rows){
    const f=row.followup;
    const due=row.due_at?new Date(/T\d{2}:\d{2}$/.test(row.due_at)?row.due_at+':00+07:00':row.due_at).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có';
    const text=`\n\n${row.code} · ${row.customer}${row.phone?' · '+row.phone:''}\n${row.vehicle||'Chưa có biển số'} · Hạn ${due} · ${row.days} ngày quá hạn\nNợ đến hạn: ${row.amount===null?'Chưa đối chiếu':row.amount.toLocaleString('vi-VN')}\nGPS: ${row.gps.map(s=>GPS_STATE_LABELS[s]||s).join(', ')||'Chưa có'}\n${CONTACT_STATUSES[f.contact_status]} · ${HANDLING_STATUSES[f.handling_status]}\nTình trạng: ${f.customer_condition||row.customer_status}${f.notes?'\n'+f.notes:''}`;
    // Notes stay complete in the app; long notes are abbreviated in Telegram.
    const entry=text.length>2300?text.slice(0,2280)+'… (xem trên web)':text;
    if(chunk.length+entry.length>3800){chunks.push(chunk);chunk=header+' (tiếp)';}chunk+=entry;
  }
  chunks.push(chunk);
  return {messages:chunks,hash:createHash('sha256').update(JSON.stringify(chunks)).digest('hex')};
}

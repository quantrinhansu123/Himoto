import 'server-only';
import type { PoolClient } from 'pg';
import { readPaymentContext } from './contract-payments';
import { dataAccess } from './access-context';
export class ReservationNoShowError extends Error {constructor(message:string,public status=400){super(message);}}
export async function closeReservationNoShow(db:Pick<PoolClient,'query'>,orderId:number,actor:number,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ReservationNoShowError('Thông tin khách không đến chưa hợp lệ.');
 const body=input as Record<string,unknown>;
 if(Object.keys(body).some(key=>!['revision','reason'].includes(key))||typeof body.revision!=='string'||!/^\d{1,20}$/.test(body.revision)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw new ReservationNoShowError('Nhập lý do và phiên bản hợp đồng hợp lệ.');
 const order=(await db.query('SELECT id,order_status,draft_payload,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[orderId])).rows[0];
 if(!order)throw new ReservationNoShowError('Không tìm thấy hợp đồng giữ xe.',404);
 if(order.order_status!=='deposit_contract'||order.draft_payload?.management_composer?.handover)throw new ReservationNoShowError('Chỉ chốt khách không đến cho hợp đồng giữ xe chưa bàn giao.',409);
 if(order.revision!==body.revision)throw new ReservationNoShowError('Hợp đồng đã thay đổi. Tải lại trước khi chốt khách không đến.',409);
 const items=(await db.query('SELECT id,vehicle_id,rent_at FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL AND completed_at IS NULL FOR UPDATE',[orderId])).rows;
 if(!items.length||items.some(item=>!item.rent_at||new Date(item.rent_at).getTime()>Date.now()))throw new ReservationNoShowError('Chưa đến giờ hẹn nhận xe. Kiểm tra lịch trước khi chốt khách không đến.',409);
 const context=await readPaymentContext(db,orderId);
 if(context.paid_amount===null||context.paid_amount<=0||context.deposit_held>0)throw new ReservationNoShowError('Tiền giữ xe hoặc tiền cọc cần đối chiếu trước khi chốt.',409);
 const snapshot={at:new Date().toISOString(),actor_id:actor,reason:body.reason.trim(),retained_amount:context.paid_amount,previous_total:context.total_amount};
 await db.query(`UPDATE himoto.orders SET total=($2::numeric)::text,total_rental_fees=$2::numeric,order_status='completed',draft_payload=jsonb_set(draft_payload::jsonb,'{management_composer}',COALESCE(draft_payload::jsonb->'management_composer','{}'::jsonb)||jsonb_build_object('reservation_no_show',$3::jsonb),true)::json,updated_at=now() WHERE id=$1`,[orderId,context.paid_amount,JSON.stringify(snapshot)]);
 await db.query('UPDATE himoto.order_vehicle_details SET completed_at=now(),updated_at=now() WHERE order_id=$1 AND deleted_at IS NULL AND completed_at IS NULL',[orderId]);
 for(const item of items){
  const blocked=(await db.query('SELECT 1 FROM himoto.order_vehicle_details WHERE vehicle_id=$1 AND deleted_at IS NULL AND completed_at IS NULL LIMIT 1',[item.vehicle_id])).rowCount||dataAccess.getStore()&&(await db.query('SELECT himoto.vehicle_has_open_rental($1) AS blocked',[item.vehicle_id])).rows[0]?.blocked;
  if(!blocked)await db.query("UPDATE himoto.vehicles SET status=CASE WHEN status IN('using','rent') THEN 'ready' ELSE status END,updated_at=now() WHERE id=$1",[item.vehicle_id]);
 }
 return {order_id:orderId,retained_amount:context.paid_amount,status:'completed'};
}

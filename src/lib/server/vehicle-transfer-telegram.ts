import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { hasPermission,type PermissionAccount } from '@/lib/management/permissions';
import type { VehicleTransferTelegramState } from '@/lib/management/vehicle-transfer-telegram';
import { OWNERSHIP_TELEGRAM_DESTINATIONS } from '@/lib/management/telegram-destinations';
import { contractNotificationText,type NotificationPayload } from './contract-notification-content';
import { OWNERSHIP_ORDER_SQL } from './contract-telegram-routing';

type Database=Pick<PoolClient,'query'>;
type User=PermissionAccount&{store_id?:number|null;scope_all?:boolean};
export class VehicleTransferTelegramError extends Error {constructor(message:string,public status=400){super(message);}}
export async function readVehicleTransferTelegram(db:Database,vehicleId:number,eventId:number,user:User) {
  const e=(await db.query(`SELECT e.id,e.vehicle_id,e.event_type,e.from_store_id,e.to_store_id,e.notes,
    e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS at,
    COALESCE(e.audit_snapshot->>'license',v.license) AS license,COALESCE(e.audit_snapshot->>'vehicle_name',v.name) AS vehicle_name,
    COALESCE(e.audit_snapshot->>'actor_name',u.name) AS actor,
    COALESCE(e.audit_snapshot->>'from_store_name',fs.store_name) AS from_name,COALESCE(e.audit_snapshot->>'to_store_name',ts.store_name) AS to_name,
    (fs.kind='lease_to_own' OR ts.kind='lease_to_own' OR COALESCE(r.ownership,false)) AS ownership
    FROM himoto.vehicle_location_events e JOIN himoto.vehicles v ON v.id=e.vehicle_id
    LEFT JOIN himoto.stores fs ON fs.id=e.from_store_id LEFT JOIN himoto.stores ts ON ts.id=e.to_store_id
    LEFT JOIN himoto.users u ON u.id=e.created_by
    LEFT JOIN LATERAL (SELECT ${OWNERSHIP_ORDER_SQL} AS ownership FROM himoto.order_vehicle_details d
      JOIN himoto.orders o ON o.id=d.order_id LEFT JOIN himoto.stores s ON s.id=o.store_id
      WHERE d.vehicle_id=e.vehicle_id AND d.deleted_at IS NULL AND o.deleted_at IS NULL
        AND o.order_status NOT IN ('draft','cancelled') AND o.created_at<=(e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ORDER BY o.id DESC LIMIT 1) r ON true
    WHERE e.id=$1 AND e.vehicle_id=$2 AND e.event_type IN ('manual_transfer','manual_transfer_receive')`,[eventId,vehicleId])).rows[0];
  if(!e)throw new VehicleTransferTelegramError('Không tìm thấy lượt chuyển/nhận xe.',404);
  const all=user.scope_all===true||user.access_role==='admin';
  if(!all&&![Number(e.from_store_id),Number(e.to_store_id)].includes(Number(user.store_id)))throw new VehicleTransferTelegramError('Không có quyền xem lượt chuyển xe của cơ sở khác.',403);
  const received=e.event_type==='manual_transfer_receive',storeId=Number(received?e.to_store_id:e.from_store_id);
  const allowed=hasPermission(user,received?'vehicles.receive':'vehicles.transfer')&&(all||storeId===Number(user.store_id));
  const photoSlot=`${received?'receive':'transfer'}-${e.id}-1`;
  const photos=(await db.query(`SELECT slot,mime_type,encode(data,'base64') AS bytes,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version
    FROM himoto.management_record_photos WHERE entity_type='vehicles' AND entity_id=$1 AND slot=$2`,[vehicleId,photoSlot])).rows;
  const payload:NotificationPayload={code:`DC-${e.id}`,customer:'',phone:'',store:e.from_name,actor:e.actor||'Chưa ghi nhận',vehicles:e.license||'',vehicle_names:e.vehicle_name||'',total:'0',at:new Date(e.at).toISOString(),photos,transfer:{from:e.from_name||'',to:e.to_name||'',note:e.notes||'',received}};
  const notice=(await db.query('SELECT status,message_ids FROM himoto.management_contract_notifications WHERE vehicle_event_id=$1',[eventId])).rows[0];
  const state:VehicleTransferTelegramState={eligible:e.ownership===true,event_id:eventId,vehicle_id:vehicleId,destination_label:OWNERSHIP_TELEGRAM_DESTINATIONS[0].label,
    text:contractNotificationText(received?'vehicle_receive':'vehicle_transfer',payload),status:notice?.status||null,message_count:notice?.message_ids?.length||0,
    can_send:e.ownership===true&&allowed&&(!notice||['failed','awaiting_config'].includes(notice.status))};
  return {state,payload,store_id:storeId,allowed,kind:received?'vehicle_receive':'vehicle_transfer'};
}
export async function saveVehicleTransferTelegram(db:Database,vehicleId:number,eventId:number,user:User) {
  await db.query('SELECT id FROM himoto.vehicle_location_events WHERE id=$1 AND vehicle_id=$2 FOR UPDATE',[eventId,vehicleId]);
  const read=await readVehicleTransferTelegram(db,vehicleId,eventId,user);
  if(!read.allowed)throw new VehicleTransferTelegramError('Chỉ người có quyền chuyển/nhận tại cơ sở thực hiện được gửi lượt này.',403);
  if(!read.state.eligible)throw new VehicleTransferTelegramError('Lượt chuyển xe này không thuộc thuê sở hữu.');
  if(!read.state.can_send){if(['sent','pending','sending'].includes(read.state.status||''))return read.state;throw new VehicleTransferTelegramError('Không được gửi lại lượt chưa rõ kết quả hoặc thao tác ngoài cơ sở được phân quyền.',403);}
  await db.query(`INSERT INTO himoto.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status,vehicle_event_id)
    VALUES($1,NULL,$2,$3,$3,$4,$5,'manual','pending',$6)
    ON CONFLICT(vehicle_event_id) WHERE vehicle_event_id IS NOT NULL DO UPDATE SET status='pending',error_code=NULL
      WHERE management_contract_notifications.status IN ('failed','awaiting_config')`,[randomUUID(),read.store_id,`vehicle-event:${eventId}`,read.kind,JSON.stringify(read.payload),eventId]);
  return (await readVehicleTransferTelegram(db,vehicleId,eventId,user)).state;
}

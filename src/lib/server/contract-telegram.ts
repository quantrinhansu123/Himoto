import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { nextRenewalVersion } from '@/lib/management/contract-renewals';
import { CONTRACT_EVENT_LABELS, type ContractEventType, type ContractTelegramState } from '@/lib/management/contract-telegram';
import { hasPermission, type PermissionAccount } from '@/lib/management/permissions';
import { contractNotificationText, notificationHash, notificationPayload, type NotificationPayload, type RenewalNotice } from './contract-notification-content';
import { contractPhotoLabel } from '@/lib/management/contract-photos';
import { OWNERSHIP_ORDER_SQL,contractTelegramDestination } from './contract-telegram-routing';

type Database=Pick<PoolClient,'query'>;
interface Event {key:string;kind:ContractEventType;phases:string[];payload?:NotificationPayload;renewal?:RenewalNotice}
export class ContractTelegramError extends Error {constructor(message:string,public status=400){super(message);}}
export function canSendContractEvent(user:PermissionAccount,kind:ContractEventType) {
  return hasPermission(user,kind==='renewal'||kind==='battery_swap'?'contracts.renew':kind==='return'?'contracts.return':kind==='rental'||kind==='reservation'?'contracts.draft':'contracts.finalize');
}
export async function readContractTelegram(db:Database,id:number,actorId:number,user:PermissionAccount) {
  const o=(await db.query(`SELECT o.store_id,o.order_status,o.contract_number,o.draft_payload,s.store_name,${OWNERSHIP_ORDER_SQL} AS ownership
    FROM himoto.orders o LEFT JOIN himoto.stores s ON s.id=o.store_id WHERE o.id=$1 AND o.deleted_at IS NULL`,[id])).rows[0];
  if(!o)throw new ContractTelegramError('Không tìm thấy hợp đồng.',404);
  const notices=(await db.query(`SELECT id,event_key,root_event_key,event_type,photo_phases,photo_slots,payload,content_hash,status,sent_at,delivery_mode
    ,error_code,message_ids FROM himoto.management_contract_notifications WHERE order_id=$1 ORDER BY created_at DESC,id`,[id])).rows;
  const composer=o.draft_payload?.management_composer||{};
  const versions=Array.isArray(composer.versions)?composer.versions:[];
  const events:Event[]=notices.filter(n=>n.delivery_mode==='auto').map(n=>({key:n.event_key,kind:n.event_type,payload:n.payload,
    phases:n.photo_phases?.length?n.photo_phases:[...new Set((n.photo_slots||[]).map((slot:string)=>slot.replace(/-[1-6]$/,'')))]}));
  const add=(e:Event)=>{if(!events.some(old=>old.key===e.key))events.push(e);};
  if(!['draft','cancelled'].includes(o.order_status)) {
    const reservation=Boolean(composer.reservation)||o.order_status==='deposit_contract';
    const key=composer.finalized?`finalize:${id}:${composer.finalized.contract_number}`:`legacy:rental:${id}`;
    if(!events.some(e=>['rental','reservation'].includes(e.kind)))add({key,kind:reservation?'reservation':'rental',phases:['rental']});
    if(composer.handover)add({key:`handover:${id}`,kind:'handover',phases:['handover']});
    for(const v of versions)if(v.kind==='renewal')add({key:`renewal:${id}:${v.version}`,kind:'renewal',phases:[`renewal-${v.version}`],renewal:v});
    const receipts=(await db.query('SELECT transaction_id,renewal_payload FROM himoto.management_contract_payments WHERE order_id=$1 AND renewal_payload IS NOT NULL',[id])).rows;
    for(const receipt of receipts)add({key:`renewal-receipt:${id}:${receipt.transaction_id}`,kind:'renewal',phases:[`renewal-receipt-${receipt.transaction_id}`],renewal:{...receipt.renewal_payload,transaction_id:Number(receipt.transaction_id)}});
    const returned=composer.reservation_no_show?[]:(await db.query('SELECT id FROM himoto.order_vehicle_details WHERE order_id=$1 AND completed_at IS NOT NULL AND deleted_at IS NULL ORDER BY id DESC',[id])).rows;
    for(const item of returned)if(!events.some(e=>e.kind==='return'&&(e.phases.includes(`return-${item.id}`)||e.key.split(':').at(-1)?.split('-').includes(String(item.id)))))add({key:`return:${id}:${item.id}`,kind:'return',phases:[`return-${item.id}`]});
  }
  const payloads=new Map<string,NotificationPayload>();
  const result:ContractTelegramState={auto_enabled:false,next_renewal_version:nextRenewalVersion(versions),events:[]};
  // Snapshot business facts for an existing transaction; refresh saved photos and verified payment/refund receipts.
  for(const event of events) {
    if(!event.phases.length)event.phases=event.kind==='return'?event.key.split(':').at(-1)!.split('-').map(n=>`return-${n}`):[event.kind==='handover'?'handover':'rental'];
    const {store_id:_store,...fresh}=await notificationPayload(db,id,event.kind,actorId,event.phases,event.renewal||event.payload?.renewal);void _store;
    const payload=event.payload?{...event.payload,code:fresh.code,contract_staff:fresh.contract_staff,photos:fresh.photos,method:fresh.method,deposit_method:fresh.deposit_method,
      ...(event.kind==='return'?{refunded:fresh.refunded,deposit:fresh.deposit,...(fresh.return_fees?{return_fees:fresh.return_fees}:{}),...(fresh.refund_recipient?{refund_recipient:fresh.refund_recipient}:{})}:{}),
      // Legacy payloads predate the detailed templates.
      ...(!('rental_fee' in event.payload)?{vehicle_names:fresh.vehicle_names,days:fresh.days,rental_fee:fresh.rental_fee,deposit:fresh.deposit,grand_total:fresh.grand_total}:{}),
    }:fresh;
    payloads.set(event.key,payload);
    const hash=notificationHash(event.kind,payload);
    const related=notices.filter(n=>(n.root_event_key||n.event_key)===event.key);
    const same=related.find(n=>(n.content_hash||notificationHash(n.event_type,n.payload))===hash&& !['manual','awaiting_config','failed','unknown'].includes(n.status));
    // An unresolved send for this transaction must be reconciled before a new variant is sent.
    const unresolved=related.find(n=>['unknown','sending','pending'].includes(n.status));
    const latest=same||unresolved||related[0];
    result.events.push({key:event.key,kind:event.kind,label:CONTRACT_EVENT_LABELS[event.kind]+(payload.renewal?.version?` v${payload.renewal.version}`:'')+` · ${payload.renewal?.license||payload.vehicles||payload.code}`,phases:event.phases,
      destination_label:contractTelegramDestination(event.kind,o.ownership===true,o.store_name),
      text:contractNotificationText(event.kind,payload),hash,photo_count:payload.photos.filter(p=>p.mime_type!=='video/mp4').length,video_count:payload.photos.filter(p=>p.mime_type==='video/mp4').length,status:latest?.status||null,sent_at:latest?.sent_at?new Date(latest.sent_at).toISOString():null,
      attachments:payload.photos.map(photo=>({slot:photo.slot,mime_type:photo.mime_type,label:contractPhotoLabel(photo.slot)})),
      can_send:canSendContractEvent(user,event.kind)&&!same&&!unresolved,unchanged:Boolean(same),notice_id:latest?.id,delivery_error:latest?.error_code||null,delivery_message_count:latest?.message_ids?.length||0,
      delivery_contract_code:latest?.payload?.code,
      can_retry_confirmed_absent:canSendContractEvent(user,event.kind)&&latest?.status==='unknown'&&!latest?.message_ids?.length});
  }
  return {state:result,payloads,store_id:Number(o.store_id)};
}
export async function saveContractTelegram(db:Database,id:number,actorId:number,user:PermissionAccount,input:unknown) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new ContractTelegramError('Yêu cầu Telegram không hợp lệ.');
  const body=input as Record<string,unknown>;
  if(body.action==='auto') {
    if(Object.keys(body).some(k=>!['action','enabled'].includes(k))||typeof body.enabled!=='boolean')throw new ContractTelegramError('Chọn chế độ tự gửi hợp lệ.');
    if(!hasPermission(user,'contracts.finalize'))throw new ContractTelegramError('Tài khoản chưa được phép đổi chế độ tự gửi.',403);
    if(body.enabled)throw new ContractTelegramError('Đã tắt gửi tự động. Kiểm tra toàn bộ ảnh rồi bấm Gửi toàn bộ ở bước cuối.');
    const order=(await db.query('SELECT id,store_id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
    if(!order)throw new ContractTelegramError('Không tìm thấy hợp đồng.',404);
    await db.query(`INSERT INTO himoto.management_contract_telegram_preferences(order_id,store_id,auto_enabled,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(order_id) DO UPDATE SET auto_enabled=EXCLUDED.auto_enabled,updated_by=EXCLUDED.updated_by,updated_at=now()`,[id,order.store_id,body.enabled,actorId]);
    return;
  }
  const retry=body.action==='retry_confirmed_absent';
  if(!['send','retry_confirmed_absent'].includes(String(body.action))||Object.keys(body).some(k=>!['action','event_key','hash','request_id',...(retry?['notice_id','confirmed_absent']:[])].includes(k))||typeof body.event_key!=='string'||body.event_key.length>256||typeof body.hash!=='string'||!/^[0-9a-f]{64}$/.test(body.hash)||typeof body.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)||retry&&(typeof body.notice_id!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.notice_id)||body.confirmed_absent!==true))throw new ContractTelegramError('Yêu cầu gửi không hợp lệ.');
  // Serialize Send and automatic completion on the same contract. The outbox is committed before delivery.
  await db.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
  const read=await readContractTelegram(db,id,actorId,user);
  const event=read.state.events.find(e=>e.key===body.event_key);
  if(!event)throw new ContractTelegramError('Không tìm thấy giao dịch đã hoàn tất.',404);
  if(!canSendContractEvent(user,event.kind))throw new ContractTelegramError('Tài khoản chưa được phép gửi giao dịch này.',403);
  if(event.hash!==body.hash)throw new ContractTelegramError('Nội dung hoặc ảnh đã thay đổi. Bấm Làm mới để kiểm tra trước khi gửi.',409);
  if(retry){
    const old=(await db.query('SELECT root_event_key,content_hash FROM himoto.management_contract_notifications WHERE order_id=$1 AND event_key=$2',[id,`manual:${id}:${body.request_id}`])).rows[0];
    if(old){if(old.root_event_key!==event.key||old.content_hash!==event.hash)throw new ContractTelegramError('Mã gửi lại đã dùng cho nội dung khác.',409);return;}
    if(!event.can_retry_confirmed_absent||event.notice_id!==body.notice_id)throw new ContractTelegramError('Chỉ xác nhận gửi lại lần mất phản hồi chưa có mã tin; tải lại để đối chiếu.',409);
    const review={actor_id:actorId,at:new Date().toISOString(),outcome:'confirmed_absent',prior_status:'unknown',prior_error:event.delivery_error,request_id:body.request_id};
    const changed=await db.query(`UPDATE himoto.management_contract_notifications SET status='failed',error_code='OPERATOR_CONFIRMED_ABSENT',delivery_review=delivery_review||$3::jsonb
      WHERE id=$1 AND order_id=$2 AND status='unknown' AND jsonb_array_length(message_ids::jsonb)=0`,[body.notice_id,id,JSON.stringify([review])]);
    if(!changed.rowCount)throw new ContractTelegramError('Lần gửi đã thay đổi; tải lại để kiểm tra.',409);
    return saveContractTelegram(db,id,actorId,user,{action:'send',event_key:event.key,hash:event.hash,request_id:body.request_id});
  }
  if(event.unchanged)return; // A double click or retried request never sends identical content twice.
  if(!event.can_send)throw new ContractTelegramError('Giao dịch đang gửi hoặc chưa xác định kết quả. Kiểm tra nhóm trước khi gửi lại.',409);
  const payload=read.payloads.get(event.key)!;
  await db.query(`INSERT INTO himoto.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,photo_slots,photo_phases,content_hash,delivery_mode,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual','pending') ON CONFLICT(event_key) DO NOTHING`,
    [randomUUID(),id,read.store_id,`manual:${id}:${body.request_id}`,event.key,event.kind,JSON.stringify(payload),JSON.stringify(payload.photos.map(p=>p.slot)),JSON.stringify(event.phases),event.hash]);
}

import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { CONTRACT_EVENT_LABELS, type ContractEventType, type ContractTelegramState } from '@/lib/management/contract-telegram';
import { hasPermission, type PermissionAccount } from '@/lib/management/permissions';
import { contractNotificationText, notificationHash, notificationPayload, notificationPhotos, type NotificationPayload, type RenewalNotice } from './contract-notification-content';

type Database=Pick<PoolClient,'query'>;
interface Event {key:string;kind:ContractEventType;phases:string[];payload?:NotificationPayload;renewal?:RenewalNotice}
export class ContractTelegramError extends Error {constructor(message:string,public status=400){super(message);}}
export function canSendContractEvent(user:PermissionAccount,kind:ContractEventType) {
  return hasPermission(user,kind==='renewal'?'contracts.renew':kind==='return'?'contracts.return':kind==='rental'||kind==='reservation'?'contracts.draft':'contracts.finalize');
}
export async function readContractTelegram(db:Database,id:number,actorId:number,user:PermissionAccount) {
  const o=(await db.query('SELECT store_id,order_status,contract_number,draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];
  if(!o)throw new ContractTelegramError('Không tìm thấy hợp đồng.',404);
  const notices=(await db.query(`SELECT id,event_key,root_event_key,event_type,photo_phases,photo_slots,payload,content_hash,status,sent_at,delivery_mode
    FROM himoto.management_contract_notifications WHERE order_id=$1 ORDER BY created_at DESC,id`,[id])).rows;
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
    const returned=(await db.query('SELECT id FROM himoto.order_vehicle_details WHERE order_id=$1 AND completed_at IS NOT NULL AND deleted_at IS NULL ORDER BY id DESC',[id])).rows;
    for(const item of returned)if(!events.some(e=>e.kind==='return'&&(e.phases.includes(`return-${item.id}`)||e.key.split(':').at(-1)?.split('-').includes(String(item.id)))))add({key:`return:${id}:${item.id}`,kind:'return',phases:[`return-${item.id}`]});
  }
  const preference=(await db.query('SELECT auto_enabled FROM himoto.management_contract_telegram_preferences WHERE order_id=$1',[id])).rows[0];
  const payloads=new Map<string,NotificationPayload>();
  const result:ContractTelegramState={auto_enabled:preference?.auto_enabled!==false,next_renewal_version:versions.length+2,events:[]};
  // Snapshot business facts for an existing transaction; refresh saved photos and verified payment/refund receipts.
  for(const event of events) {
    if(!event.phases.length)event.phases=event.kind==='return'?event.key.split(':').at(-1)!.split('-').map(n=>`return-${n}`):[event.kind==='handover'?'handover':'rental'];
    const {store_id:_store,...fresh}=await notificationPayload(db,id,event.kind,actorId,event.phases,event.renewal||event.payload?.renewal);void _store;
    const payload=event.payload?{...event.payload,photos:await notificationPhotos(db,id,event.phases),method:fresh.method,deposit_method:fresh.deposit_method,
      ...(event.kind==='return'?{refunded:fresh.refunded,deposit:fresh.deposit}:{}),
      // Legacy payloads predate the detailed templates.
      ...(!('rental_fee' in event.payload)?{vehicle_names:fresh.vehicle_names,days:fresh.days,rental_fee:fresh.rental_fee,deposit:fresh.deposit,grand_total:fresh.grand_total}:{}),
    }:fresh;
    payloads.set(event.key,payload);
    const hash=notificationHash(event.kind,payload);
    const related=notices.filter(n=>(n.root_event_key||n.event_key)===event.key);
    const same=related.find(n=>(n.content_hash||notificationHash(n.event_type,n.payload))===hash&& !['manual','awaiting_config','failed'].includes(n.status));
    // An unresolved send for this transaction must be reconciled before a new variant is sent.
    const unresolved=related.find(n=>['unknown','sending','pending'].includes(n.status));
    const latest=same||unresolved||related[0];
    result.events.push({key:event.key,kind:event.kind,label:CONTRACT_EVENT_LABELS[event.kind]+(payload.renewal?.version?` v${payload.renewal.version}`:'')+` · ${payload.renewal?.license||payload.vehicles||payload.code}`,phases:event.phases,
      text:contractNotificationText(event.kind,payload),hash,photo_count:payload.photos.filter(p=>p.mime_type!=='video/mp4').length,video_count:payload.photos.filter(p=>p.mime_type==='video/mp4').length,status:latest?.status||null,sent_at:latest?.sent_at?new Date(latest.sent_at).toISOString():null,
      can_send:canSendContractEvent(user,event.kind)&&!same&&!unresolved,unchanged:Boolean(same)});
  }
  return {state:result,payloads,store_id:Number(o.store_id)};
}
export async function saveContractTelegram(db:Database,id:number,actorId:number,user:PermissionAccount,input:unknown) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new ContractTelegramError('Yêu cầu Telegram không hợp lệ.');
  const body=input as Record<string,unknown>;
  if(body.action==='auto') {
    if(Object.keys(body).some(k=>!['action','enabled'].includes(k))||typeof body.enabled!=='boolean')throw new ContractTelegramError('Chọn chế độ tự gửi hợp lệ.');
    if(!hasPermission(user,'contracts.finalize'))throw new ContractTelegramError('Tài khoản chưa được phép đổi chế độ tự gửi.',403);
    const order=(await db.query('SELECT id,store_id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
    if(!order)throw new ContractTelegramError('Không tìm thấy hợp đồng.',404);
    await db.query(`INSERT INTO himoto.management_contract_telegram_preferences(order_id,store_id,auto_enabled,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(order_id) DO UPDATE SET auto_enabled=EXCLUDED.auto_enabled,updated_by=EXCLUDED.updated_by,updated_at=now()`,[id,order.store_id,body.enabled,actorId]);
    return;
  }
  if(body.action!=='send'||Object.keys(body).some(k=>!['action','event_key','hash','request_id'].includes(k))||typeof body.event_key!=='string'||body.event_key.length>256||typeof body.hash!=='string'||!/^[0-9a-f]{64}$/.test(body.hash)||typeof body.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id))throw new ContractTelegramError('Yêu cầu gửi không hợp lệ.');
  // Serialize Send and automatic completion on the same contract. The outbox is committed before delivery.
  await db.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
  const read=await readContractTelegram(db,id,actorId,user);
  const event=read.state.events.find(e=>e.key===body.event_key);
  if(!event)throw new ContractTelegramError('Không tìm thấy giao dịch đã hoàn tất.',404);
  if(!canSendContractEvent(user,event.kind))throw new ContractTelegramError('Tài khoản chưa được phép gửi giao dịch này.',403);
  if(event.hash!==body.hash)throw new ContractTelegramError('Nội dung hoặc ảnh đã thay đổi. Bấm Làm mới để kiểm tra trước khi gửi.',409);
  if(event.unchanged)return; // A double click or retried request never sends identical content twice.
  if(!event.can_send)throw new ContractTelegramError('Giao dịch đang gửi hoặc chưa xác định kết quả. Kiểm tra nhóm trước khi gửi lại.',409);
  const payload=read.payloads.get(event.key)!;
  await db.query(`INSERT INTO himoto.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,photo_slots,photo_phases,content_hash,delivery_mode,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual','pending') ON CONFLICT(event_key) DO NOTHING`,
    [randomUUID(),id,read.store_id,`manual:${id}:${body.request_id}`,event.key,event.kind,JSON.stringify(payload),JSON.stringify(payload.photos.map(p=>p.slot)),JSON.stringify(event.phases),event.hash]);
}

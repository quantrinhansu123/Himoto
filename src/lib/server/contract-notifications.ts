import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { telegramCall, telegramMediaBatches, requireTelegramTime, TelegramContinuation, TelegramDeliveryError, TELEGRAM_DISPATCH_BUDGET_MS, TELEGRAM_MEDIA_TIMEOUT_MS, TELEGRAM_TEXT_TIMEOUT_MS } from './telegram-delivery';
import { copyContractCustomerPhotos } from './contract-customer-photos';
import { CONTRACT_TELEGRAM_ROUTE_SQL } from './contract-telegram-routing';
import { VEHICLE_ORDER_SQL } from './contract-classification';

import type { ContractEventType } from '@/lib/management/contract-telegram';
import { contractNotificationText, hydrateNotificationPhotos, notificationHash, notificationPayload, type NotificationPayload, type RenewalNotice } from './contract-notification-content';
export { contractNotificationText } from './contract-notification-content';
type Database=Pick<PoolClient,'query'>;
export async function queueContractNotification(client:Database,orderId:number,kind:ContractEventType,eventKey:string,actorId:number,phase:string|string[],renewal?:RenewalNotice) {
  const phases=Array.isArray(phase)?phase:[phase];
  if(phases.includes('rental'))await copyContractCustomerPhotos(client,orderId,actorId);
  const {store_id,...payload}=await notificationPayload(client,orderId,kind,actorId,phases,renewal);
  await client.query(`INSERT INTO himoto.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,photo_slots,photo_phases,content_hash,status)
    VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,'manual') ON CONFLICT(event_key) DO NOTHING`,[randomUUID(),orderId,store_id,eventKey,kind,JSON.stringify(payload),JSON.stringify(payload.photos.map(photo=>photo.slot)),JSON.stringify(phases),notificationHash(kind,payload)]);
}
/** Claims are committed before calling Telegram. An uncertain send is never retried automatically. */
export async function dispatchContractNotifications(send:typeof fetch=fetch,limit=5,database:Database=ownerDatabase,orderIds?:number[],vehicleEventIds?:number[],deadline=Date.now()+TELEGRAM_DISPATCH_BUDGET_MS) {
  const settings=(await database.query('SELECT bot_cipher FROM himoto.management_telegram_settings WHERE singleton=true')).rows[0];
  if(!settings?.bot_cipher){await database.query("UPDATE himoto.management_contract_notifications SET status='awaiting_config' WHERE status='pending' AND delivery_mode='manual'");return {sent:0,configured:false};}
  const {token}=openIntegrationSecret<{token:string}>(settings.bot_cipher);let sent=0;
  for(let index=0;index<limit;index++) {
    if(Date.now()+TELEGRAM_MEDIA_TIMEOUT_MS+55_000>deadline)break;
    const leaseId=randomUUID();
    // An atomic lease serializes complete media + summary blocks in the same Telegram topic.
    const row=(await database.query(`WITH candidate AS MATERIALIZED (
      SELECT n.id,g.chat_id,g.thread_id FROM himoto.management_contract_notifications n
      LEFT JOIN himoto.orders o ON o.id=n.order_id
      LEFT JOIN himoto.stores s ON s.id=o.store_id
      LEFT JOIN LATERAL (
        SELECT chat_id,thread_id FROM himoto.management_store_telegram
          WHERE ${CONTRACT_TELEGRAM_ROUTE_SQL}='store' AND store_id=n.store_id AND enabled
        UNION ALL
        SELECT chat_id,thread_id FROM himoto.management_ownership_telegram
          WHERE route=${CONTRACT_TELEGRAM_ROUTE_SQL} AND enabled
      ) g ON true
      WHERE n.status='pending' AND n.delivery_mode='manual' AND ($1::bigint[] IS NULL OR n.order_id=ANY($1))
        AND (n.order_id IS NULL OR ${VEHICLE_ORDER_SQL})
        AND ($3::bigint[] IS NULL OR n.vehicle_event_id=ANY($3))
        AND (g.chat_id IS NULL OR NOT EXISTS(SELECT 1 FROM himoto.management_telegram_delivery_leases l
          WHERE l.chat_id=g.chat_id AND l.thread_id=COALESCE(g.thread_id,0) AND l.notice_id<>n.id
            AND (l.expires_at>clock_timestamp() OR EXISTS(SELECT 1 FROM himoto.management_contract_notifications held
              WHERE held.id=l.notice_id AND held.status='pending' AND held.error_code='DELIVERY_CONTINUE'))))
      ORDER BY n.created_at,n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1
    ), lease AS (
      INSERT INTO himoto.management_telegram_delivery_leases(chat_id,thread_id,lease_id,notice_id,expires_at)
      SELECT chat_id,COALESCE(thread_id,0),$2::uuid,id,clock_timestamp()+interval '6 minutes' FROM candidate WHERE chat_id IS NOT NULL
      ON CONFLICT(chat_id,thread_id) DO UPDATE SET lease_id=EXCLUDED.lease_id,notice_id=EXCLUDED.notice_id,expires_at=EXCLUDED.expires_at
      WHERE management_telegram_delivery_leases.expires_at<=clock_timestamp() OR management_telegram_delivery_leases.notice_id=EXCLUDED.notice_id RETURNING lease_id
    ) UPDATE himoto.management_contract_notifications n SET status='sending' FROM candidate c
      WHERE n.id=c.id AND (c.chat_id IS NULL OR EXISTS(SELECT 1 FROM lease)) RETURNING n.*,c.chat_id,c.thread_id`,[orderIds||null,leaseId,vehicleEventIds||null])).rows[0];
    if(!row)break;
    if(!row.chat_id){await database.query("UPDATE himoto.management_contract_notifications SET status='awaiting_config' WHERE id=$1",[row.id]);continue;}
    const payload=row.payload as NotificationPayload,ids:number[]=Array.isArray(row.message_ids)?[...row.message_ids]:[];
    const target={chat_id:row.chat_id,...(row.thread_id?{message_thread_id:row.thread_id}:{})};
    let contacted=false,continued=false;
    try {
      const photos=await hydrateNotificationPhotos(database,row.order_id==null?null:Number(row.order_id),payload.photos||[]);
      if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||ids.length>photos.length||ids.length&&row.error_code!=='DELIVERY_CONTINUE')throw new TelegramDeliveryError('SEND_UNCERTAIN');
      const text=contractNotificationText(row.event_type,payload);
      // Only acknowledged media is skipped when the worker resumes a deliberate continuation.
      for await(const batch of telegramMediaBatches(photos,ids.length,deadline)) {
        requireTelegramTime(deadline,TELEGRAM_MEDIA_TIMEOUT_MS);
        await database.query("UPDATE himoto.management_telegram_delivery_leases SET expires_at=clock_timestamp()+interval '6 minutes' WHERE lease_id=$1",[leaseId]);
        const form=new FormData();form.append('chat_id',row.chat_id);if(row.thread_id)form.append('message_thread_id',String(row.thread_id));
        contacted=true;
        if(batch.length===1){const video=batch[0].type==='video/mp4';form.append(video?'video':'photo',new Blob([new Uint8Array(batch[0].data)],{type:batch[0].type}),video?'video-hop-dong.mp4':'anh-hop-dong.jpg');if(video)form.append('supports_streaming','true');ids.push(...await telegramCall(token,video?'sendVideo':'sendPhoto',form,send));}
        else {form.append('media',JSON.stringify(batch.map((_,i)=>({type:'photo',media:`attach://photo${i}`}))));batch.forEach((file,i)=>form.append(`photo${i}`,new Blob([new Uint8Array(file.data)],{type:file.type}),`anh-${i+1}.jpg`));ids.push(...await telegramCall(token,'sendMediaGroup',form,send,batch.length));}
        contacted=false;
        await database.query('UPDATE himoto.management_contract_notifications SET message_ids=$2 WHERE id=$1',[row.id,JSON.stringify(ids)]);
      }
      // One closing message follows every photo/video, never between albums.
      requireTelegramTime(deadline,TELEGRAM_TEXT_TIMEOUT_MS);
      contacted=true;
      ids.push(...await telegramCall(token,'sendMessage',{...target,text,link_preview_options:{is_disabled:true}},send));
      contacted=false;
      await database.query("UPDATE himoto.management_contract_notifications SET status='sent',message_ids=$2,sent_at=now(),error_code=NULL WHERE id=$1",[row.id,JSON.stringify(ids)]);sent++;
    }catch(error){
      continued=error instanceof TelegramContinuation&&!contacted;
      const known=error instanceof TelegramDeliveryError&&error.definiteFailure;
      await database.query('UPDATE himoto.management_contract_notifications SET status=$2,message_ids=$3,error_code=$4 WHERE id=$1',
        [row.id,continued?'pending':contacted&&!known||ids.length?'unknown':'failed',JSON.stringify(ids),continued?'DELIVERY_CONTINUE':error instanceof TelegramDeliveryError?error.message:contacted?'SEND_UNCERTAIN':'MEDIA_FETCH_FAILED']);
    }finally{if(!continued)await database.query('DELETE FROM himoto.management_telegram_delivery_leases WHERE lease_id=$1',[leaseId]);}
    if(continued)break;
  }
  return {sent,configured:true};
}

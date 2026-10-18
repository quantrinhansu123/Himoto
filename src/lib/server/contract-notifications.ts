import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { readCloudinaryPhoto } from './cloudinary-photos';
import { MAX_VIDEO_BYTES } from '@/lib/management/record-photos';
import { copyContractCustomerPhotos } from './contract-customer-photos';

import type { ContractEventType } from '@/lib/management/contract-telegram';
import { contractNotificationText, notificationHash, notificationPayload, type NotificationPayload, type RenewalNotice } from './contract-notification-content';
export { contractNotificationText } from './contract-notification-content';
type Database=Pick<PoolClient,'query'>;
export async function queueContractNotification(client:Database,orderId:number,kind:ContractEventType,eventKey:string,actorId:number,phase:string|string[],renewal?:RenewalNotice) {
  const phases=Array.isArray(phase)?phase:[phase];
  if(phases.includes('rental'))await copyContractCustomerPhotos(client,orderId,actorId);
  const {store_id,...payload}=await notificationPayload(client,orderId,kind,actorId,phases,renewal);
  await client.query(`INSERT INTO himoto.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,photo_slots,photo_phases,content_hash,status)
    VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,'manual') ON CONFLICT(event_key) DO NOTHING`,[randomUUID(),orderId,store_id,eventKey,kind,JSON.stringify(payload),JSON.stringify(payload.photos.map(photo=>photo.slot)),JSON.stringify(phases),notificationHash(kind,payload)]);
}
async function telegramCall(token:string,method:string,body:FormData|Record<string,unknown>,send:typeof fetch) {
  const form=body instanceof FormData;
  let response:Response;try{response=await send(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',...(form?{}:{headers:{'Content-Type':'application/json'}}),body:form?body:JSON.stringify(body),signal:AbortSignal.timeout(60000),redirect:'error',cache:'no-store'});}catch(error){throw new Error(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'TELEGRAM_TIMEOUT':'TELEGRAM_NETWORK');}
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.ok!==true)throw new Error(`TELEGRAM_${result?.error_code||response.status}`);
  return result.result;
}
/** Claims are committed before calling Telegram. An uncertain send is never retried automatically. */
export async function dispatchContractNotifications(send:typeof fetch=fetch,limit=5,database:Database=ownerDatabase,orderIds?:number[]) {
  const settings=(await database.query('SELECT bot_cipher FROM himoto.management_telegram_settings WHERE singleton=true')).rows[0];
  if(!settings?.bot_cipher){await database.query("UPDATE himoto.management_contract_notifications SET status='awaiting_config' WHERE status='pending' AND delivery_mode='manual'");return {sent:0,configured:false};}
  const {token}=openIntegrationSecret<{token:string}>(settings.bot_cipher);let sent=0;
  for(let index=0;index<limit;index++) {
    const leaseId=randomUUID();
    // An atomic lease serializes complete media + summary blocks in the same Telegram topic.
    const row=(await database.query(`WITH candidate AS MATERIALIZED (
      SELECT n.id,g.chat_id,g.thread_id FROM himoto.management_contract_notifications n
      LEFT JOIN himoto.management_store_telegram g ON g.store_id=n.store_id AND g.enabled
      WHERE n.status='pending' AND n.delivery_mode='manual' AND ($1::bigint[] IS NULL OR n.order_id=ANY($1))
        AND (g.chat_id IS NULL OR NOT EXISTS(SELECT 1 FROM himoto.management_telegram_delivery_leases l
          WHERE l.chat_id=g.chat_id AND l.thread_id=COALESCE(g.thread_id,0) AND l.expires_at>clock_timestamp()))
      ORDER BY n.created_at,n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1
    ), lease AS (
      INSERT INTO himoto.management_telegram_delivery_leases(chat_id,thread_id,lease_id,notice_id,expires_at)
      SELECT chat_id,COALESCE(thread_id,0),$2::uuid,id,clock_timestamp()+interval '6 minutes' FROM candidate WHERE chat_id IS NOT NULL
      ON CONFLICT(chat_id,thread_id) DO UPDATE SET lease_id=EXCLUDED.lease_id,notice_id=EXCLUDED.notice_id,expires_at=EXCLUDED.expires_at
      WHERE management_telegram_delivery_leases.expires_at<=clock_timestamp() RETURNING lease_id
    ) UPDATE himoto.management_contract_notifications n SET status='sending' FROM candidate c
      WHERE n.id=c.id AND (c.chat_id IS NULL OR EXISTS(SELECT 1 FROM lease)) RETURNING n.*,c.chat_id,c.thread_id`,[orderIds||null,leaseId])).rows[0];
    if(!row)break;
    if(!row.chat_id){await database.query("UPDATE himoto.management_contract_notifications SET status='awaiting_config' WHERE id=$1",[row.id]);continue;}
    const payload=row.payload as NotificationPayload,ids:number[]=[];
    const target={chat_id:row.chat_id,...(row.thread_id?{message_thread_id:row.thread_id}:{})};
    let contacted=false;
    try {
      const photos=payload.photos||[];
      const text=contractNotificationText(row.event_type,payload);
      // Load one album at a time so adding photos does not retain every full-size file in memory.
      for(let offset=0;offset<photos.length;offset+=10) {
        const album=photos.slice(offset,offset+10),batch=[];
        for(let index=0;index<album.length;index+=3)batch.push(...await Promise.all(album.slice(index,index+3).map(async photo=>{
          const data=photo.cloudinary_public_id?Buffer.from(await(await readCloudinaryPhoto({cloudinary_public_id:photo.cloudinary_public_id,cloudinary_cloud_name:photo.cloudinary_cloud_name!,cloudinary_version:Number(photo.cloudinary_version),mime_type:photo.mime_type})).arrayBuffer()):Buffer.from(photo.bytes||'','base64');
          if(!data.length||data.length>(photo.mime_type==='video/mp4'?MAX_VIDEO_BYTES:2*1024*1024))throw new Error('PHOTO_SIZE');
          return {data,type:photo.mime_type};
        })));
        await database.query("UPDATE himoto.management_telegram_delivery_leases SET expires_at=clock_timestamp()+interval '6 minutes' WHERE lease_id=$1",[leaseId]);
        const form=new FormData();form.append('chat_id',row.chat_id);if(row.thread_id)form.append('message_thread_id',String(row.thread_id));
        contacted=true;
        if(batch.length===1){const video=batch[0].type==='video/mp4';form.append(video?'video':'photo',new Blob([new Uint8Array(batch[0].data)],{type:batch[0].type}),video?'video-hop-dong.mp4':'anh-hop-dong.jpg');if(video)form.append('supports_streaming','true');const photo=await telegramCall(token,video?'sendVideo':'sendPhoto',form,send);ids.push(Number(photo.message_id));}
        else {form.append('media',JSON.stringify(batch.map((file,i)=>({type:file.type==='video/mp4'?'video':'photo',media:`attach://photo${i}`,...(file.type==='video/mp4'?{supports_streaming:true}:{})}))));batch.forEach((file,i)=>form.append(`photo${i}`,new Blob([new Uint8Array(file.data)],{type:file.type}),file.type==='video/mp4'?`video-${i+1}.mp4`:`anh-${i+1}.jpg`));const messages=await telegramCall(token,'sendMediaGroup',form,send);ids.push(...messages.map((message:{message_id:number})=>Number(message.message_id)));}
        await database.query('UPDATE himoto.management_contract_notifications SET message_ids=$2 WHERE id=$1',[row.id,JSON.stringify(ids)]);
      }
      // One closing message follows every photo/video, never between albums.
      contacted=true;
      const message=await telegramCall(token,'sendMessage',{...target,text,link_preview_options:{is_disabled:true}},send);
      ids.push(Number(message.message_id));
      await database.query("UPDATE himoto.management_contract_notifications SET status='sent',message_ids=$2,sent_at=now(),error_code=NULL WHERE id=$1",[row.id,JSON.stringify(ids)]);sent++;
    }catch(error){const known=error instanceof Error&&/^TELEGRAM_\d+$|^PHOTO_SIZE$/.test(error.message),network=error instanceof Error&&/^TELEGRAM_(TIMEOUT|NETWORK)$/.test(error.message);await database.query('UPDATE himoto.management_contract_notifications SET status=$2,message_ids=$3,error_code=$4 WHERE id=$1',[row.id,contacted&&!known||ids.length?'unknown':'failed',JSON.stringify(ids),known||network?(error as Error).message:contacted?'SEND_UNCERTAIN':'MEDIA_FETCH_FAILED']);}
    finally{await database.query('DELETE FROM himoto.management_telegram_delivery_leases WHERE lease_id=$1',[leaseId]);}
  }
  return {sent,configured:true};
}

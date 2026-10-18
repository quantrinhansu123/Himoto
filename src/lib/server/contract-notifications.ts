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
    const row=(await database.query(`UPDATE himoto.management_contract_notifications SET status='sending'
      WHERE id=(SELECT id FROM himoto.management_contract_notifications WHERE status='pending' AND delivery_mode='manual' AND ($1::bigint[] IS NULL OR order_id=ANY($1)) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[orderIds||null])).rows[0];
    if(!row)break;
    const group=(await database.query('SELECT chat_id,thread_id FROM himoto.management_store_telegram WHERE store_id=$1 AND enabled',[row.store_id])).rows[0];
    if(!group){await database.query("UPDATE himoto.management_contract_notifications SET status='awaiting_config' WHERE id=$1",[row.id]);continue;}
    const payload=row.payload as NotificationPayload,ids:number[]=[];
    const target={chat_id:group.chat_id,...(group.thread_id?{message_thread_id:group.thread_id}:{})};
    let contacted=false;
    try {
      const photos=payload.photos||[];
      const text=contractNotificationText(row.event_type,payload);
      const caption=photos.length&&text.length<=1024?text:null;
      if(!caption) {
        contacted=true;
        const message=await telegramCall(token,'sendMessage',{...target,text,link_preview_options:{is_disabled:true}},send);
        ids.push(Number(message.message_id));
        await database.query('UPDATE himoto.management_contract_notifications SET message_ids=$2 WHERE id=$1',[row.id,JSON.stringify(ids)]);
      }
      // Load one album at a time so adding photos does not retain every full-size file in memory.
      for(let offset=0;offset<photos.length;offset+=10) {
        const album=photos.slice(offset,offset+10),batch=[];
        for(let index=0;index<album.length;index+=3)batch.push(...await Promise.all(album.slice(index,index+3).map(async photo=>{
          const data=photo.cloudinary_public_id?Buffer.from(await(await readCloudinaryPhoto({cloudinary_public_id:photo.cloudinary_public_id,cloudinary_cloud_name:photo.cloudinary_cloud_name!,cloudinary_version:Number(photo.cloudinary_version),mime_type:photo.mime_type})).arrayBuffer()):Buffer.from(photo.bytes||'','base64');
          if(!data.length||data.length>(photo.mime_type==='video/mp4'?MAX_VIDEO_BYTES:2*1024*1024))throw new Error('PHOTO_SIZE');
          return {data,type:photo.mime_type};
        })));
        const form=new FormData();form.append('chat_id',group.chat_id);if(group.thread_id)form.append('message_thread_id',String(group.thread_id));
        contacted=true;
        if(caption&&offset===0&&batch.length===1)form.append('caption',caption);
        if(batch.length===1){const video=batch[0].type==='video/mp4';form.append(video?'video':'photo',new Blob([new Uint8Array(batch[0].data)],{type:batch[0].type}),video?'video-hop-dong.mp4':'anh-hop-dong.jpg');if(video)form.append('supports_streaming','true');const photo=await telegramCall(token,video?'sendVideo':'sendPhoto',form,send);ids.push(Number(photo.message_id));}
        else {form.append('media',JSON.stringify(batch.map((file,i)=>({type:file.type==='video/mp4'?'video':'photo',media:`attach://photo${i}`,...(file.type==='video/mp4'?{supports_streaming:true}:{}),...(caption&&offset===0&&i===0?{caption}:{})}))));batch.forEach((file,i)=>form.append(`photo${i}`,new Blob([new Uint8Array(file.data)],{type:file.type}),file.type==='video/mp4'?`video-${i+1}.mp4`:`anh-${i+1}.jpg`));const messages=await telegramCall(token,'sendMediaGroup',form,send);ids.push(...messages.map((message:{message_id:number})=>Number(message.message_id)));}
        await database.query('UPDATE himoto.management_contract_notifications SET message_ids=$2 WHERE id=$1',[row.id,JSON.stringify(ids)]);
      }
      await database.query("UPDATE himoto.management_contract_notifications SET status='sent',message_ids=$2,sent_at=now(),error_code=NULL WHERE id=$1",[row.id,JSON.stringify(ids)]);sent++;
    }catch(error){const known=error instanceof Error&&/^TELEGRAM_\d+$|^PHOTO_SIZE$/.test(error.message),network=error instanceof Error&&/^TELEGRAM_(TIMEOUT|NETWORK)$/.test(error.message);await database.query('UPDATE himoto.management_contract_notifications SET status=$2,message_ids=$3,error_code=$4 WHERE id=$1',[row.id,contacted&&!known||ids.length?'unknown':'failed',JSON.stringify(ids),known||network?(error as Error).message:contacted?'SEND_UNCERTAIN':'MEDIA_FETCH_FAILED']);}
  }
  return {sent,configured:true};
}

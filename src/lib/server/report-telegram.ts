import 'server-only';
import type { PoolClient } from 'pg';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { telegramCall,telegramMediaBatches,canUploadRejectedTelegramMedia,TelegramContinuation,TelegramDeliveryError,type Media } from './telegram-delivery';
import type {Attachment} from './contract-notification-content';

type Database=Pick<PoolClient,'query'>;
export async function queueReportTelegram(db:Database,key:string,store:number,text:string,route:'store'|'ownership_new',attachments:Attachment[]=[]) {
  if(!text.trim()||text.length>4000)throw new Error('Báo cáo vượt giới hạn Telegram.');
  await db.query(`INSERT INTO himoto.management_report_deliveries(delivery_key,store_id,route,text,attachments)
    VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(delivery_key) DO NOTHING`,[key,store,route,text,JSON.stringify(attachments)]);
}
export async function shiftTelegramAttachments(db:Database,id:number,stage:'pgd'|'audit'):Promise<Attachment[]>{
  return(await db.query(`SELECT 'shift-'||stage||'-'||id::text AS slot,mime_type,encode(data,'base64') AS bytes,
    cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,object_bucket,object_key,object_etag
    FROM himoto.management_shift_media WHERE report_id=$1 AND stage=$2
    UNION ALL SELECT 'shift-legacy-'||slot,mime_type,encode(data,'base64'),NULL::text,NULL::text,NULL::integer,object_bucket,object_key,object_etag
    FROM himoto.management_shift_photos WHERE report_id=$1 AND $2='pgd' ORDER BY slot`,[id,stage])).rows;
}
/** A committed outbox entry is claimed once. Ambiguous sends never retry. */
export async function deliverReportTelegram(key:string,db:Database=ownerDatabase,send:typeof fetch=fetch) {
  await db.query(`UPDATE himoto.management_report_deliveries SET status='unknown',error_code='INTERRUPTED',updated_at=now()
    WHERE delivery_key=$1 AND status='sending' AND updated_at<now()-interval '3 minutes'`,[key]);
  const row=(await db.query(`UPDATE himoto.management_report_deliveries SET status='sending',updated_at=now(),error_code=NULL
    WHERE delivery_key=$1 AND status IN ('pending','failed','awaiting_config') RETURNING *`,[key])).rows[0];
  if(!row)return;
  let attempted=false;
  try {
    const settings=(await db.query('SELECT bot_cipher FROM himoto.management_telegram_settings WHERE singleton=true')).rows[0];
    const target=(await db.query(row.route==='ownership_new'
      ?"SELECT chat_id,thread_id FROM himoto.management_ownership_telegram WHERE route='ownership_new' AND enabled=true"
      :'SELECT chat_id,thread_id FROM himoto.management_store_telegram WHERE store_id=$1 AND enabled=true',row.route==='ownership_new'?[]:[row.store_id])).rows[0];
    if(!settings?.bot_cipher||!target?.chat_id){await db.query("UPDATE himoto.management_report_deliveries SET status='awaiting_config',updated_at=now() WHERE delivery_key=$1",[key]);return;}
    const {token}=openIntegrationSecret<{token:string}>(settings.bot_cipher);
    const ids:number[]=Array.isArray(row.media_ids)?[...row.media_ids]:[],photos:Attachment[]=Array.isArray(row.attachments)?row.attachments:[];
    if(ids.length>photos.length||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new TelegramDeliveryError('INVALID_REPORT_RECEIPT');
    const sendBatch=async(batch:Media[])=>{
      const form=new FormData();form.append('chat_id',target.chat_id);if(target.thread_id)form.append('message_thread_id',String(target.thread_id));
      const video=batch.length===1&&batch[0].type==='video/mp4';
      if(batch.length===1){if(batch[0].url)form.append(video?'video':'photo',batch[0].url);else form.append(video?'video':'photo',new Blob([new Uint8Array(batch[0].data!)],{type:batch[0].type}),video?'video-ca.mp4':'anh-ca.jpg');if(video)form.append('supports_streaming','true');}
      else{form.append('media',JSON.stringify(batch.map((file,index)=>({type:'photo',media:file.url||`attach://image${index}`}))));batch.forEach((file,index)=>{if(file.data)form.append(`image${index}`,new Blob([new Uint8Array(file.data)],{type:file.type}),`anh-${index+1}.jpg`);});}
      await db.query("UPDATE himoto.management_report_deliveries SET error_code='DELIVERY_IN_FLIGHT',updated_at=now() WHERE delivery_key=$1",[key]);attempted=true;
      ids.push(...await telegramCall(token,batch.length>1?'sendMediaGroup':video?'sendVideo':'sendPhoto',form,send,batch.length));
      await db.query("UPDATE himoto.management_report_deliveries SET media_ids=$2::jsonb,error_code=NULL,updated_at=now() WHERE delivery_key=$1",[key,JSON.stringify(ids)]);attempted=false;
    };
    const deadline=Date.now()+240000;
    for await(const batch of telegramMediaBatches(photos,ids.length,deadline)){
      const offset=ids.length;
      try{await sendBatch(batch);}catch(error){
        if(!canUploadRejectedTelegramMedia(error))throw error;
        // Telegram explicitly rejected this request; only this unsent group may fall back to bytes.
        attempted=false;for await(const upload of telegramMediaBatches(photos.slice(offset,offset+batch.length),0,deadline,true))await sendBatch(upload);
      }
    }
    if(!row.text_sent){
      await db.query("UPDATE himoto.management_report_deliveries SET error_code='DELIVERY_IN_FLIGHT',updated_at=now() WHERE delivery_key=$1",[key]);attempted=true;
      const textIds=await telegramCall(token,'sendMessage',{chat_id:target.chat_id,...(target.thread_id?{message_thread_id:Number(target.thread_id)}:{}),text:row.text},send);
      await db.query("UPDATE himoto.management_report_deliveries SET status='sent',message_id=$2,text_sent=true,error_code=NULL,updated_at=now() WHERE delivery_key=$1",[key,textIds[0]]);attempted=false;
    }else await db.query("UPDATE himoto.management_report_deliveries SET status='sent',error_code=NULL,updated_at=now() WHERE delivery_key=$1",[key]);
  }catch(error){
    if(error instanceof TelegramContinuation&&!attempted){await db.query("UPDATE himoto.management_report_deliveries SET status='pending',error_code='DELIVERY_CONTINUE',updated_at=now() WHERE delivery_key=$1",[key]);return;}
    const definite=!attempted||error instanceof TelegramDeliveryError&&error.definiteFailure;
    await db.query('UPDATE himoto.management_report_deliveries SET status=$2,error_code=$3,updated_at=now() WHERE delivery_key=$1',
      [key,definite?'failed':'unknown',error instanceof TelegramDeliveryError?error.message:'DELIVERY_FAILED']);
  }
}

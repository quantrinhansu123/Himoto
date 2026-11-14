import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Attachment } from './contract-notification-content';
import type { Media,TelegramAttachment,TelegramMediaReceipt } from './telegram-delivery';

type Database=Pick<PoolClient,'query'>;
/** A cache hit must identify the exact stored version and the receiving bot. */
export function telegramMediaKey(photo:Attachment):string|null {
  const identity=photo.object_bucket&&photo.object_key&&photo.object_etag
    ?['object',photo.mime_type,photo.object_bucket,photo.object_key,photo.object_etag]
    :photo.cloudinary_cloud_name&&photo.cloudinary_public_id&&Number.isSafeInteger(photo.cloudinary_version)&&Number(photo.cloudinary_version)>0
      ?['cloudinary',photo.mime_type,photo.cloudinary_cloud_name,photo.cloudinary_public_id,photo.cloudinary_version]
      :photo.bytes?['bytes',photo.mime_type,createHash('sha256').update(Buffer.from(photo.bytes,'base64')).digest('hex')]:null;
  return identity?createHash('sha256').update(JSON.stringify(identity)).digest('hex'):null;
}
export async function cachedTelegramMedia(db:Database,botId:string,photos:Attachment[]):Promise<TelegramAttachment[]> {
  const prepared=photos.map(photo=>({...photo,telegram_cache_key:telegramMediaKey(photo)||undefined}));
  const keys=[...new Set(prepared.flatMap(photo=>photo.telegram_cache_key?[photo.telegram_cache_key]:[]))];
  if(!keys.length)return prepared;
  const rows=(await db.query(`SELECT media_key,file_id FROM himoto.management_telegram_media_cache
    WHERE bot_id=$1 AND media_key=ANY($2::text[])`,[botId,keys])).rows;
  const found=new Map<string,string>(rows.map(row=>[String(row.media_key),String(row.file_id)]));
  return prepared.map(photo=>({...photo,telegram_file_id:photo.telegram_cache_key?found.get(photo.telegram_cache_key):undefined}));
}
export async function rememberTelegramMedia(db:Database,botId:string,batch:Media[],receipts:(TelegramMediaReceipt|null)[]) {
  const records=batch.flatMap((file,index)=>{
    const receipt=receipts[index];
    return file.cache_key&&receipt&&receipt.kind===(file.type==='video/mp4'?'video':'photo')
      ?[{media_key:file.cache_key,mime_type:file.type,file_id:receipt.file_id}]:[];
  });
  if(!records.length)return;
  // Repeated attachment references in one album must not conflict with themselves.
  const unique=[...new Map(records.map(record=>[record.media_key,record])).values()];
  await db.query(`INSERT INTO himoto.management_telegram_media_cache(bot_id,media_key,mime_type,file_id)
    SELECT $1,r.media_key,r.mime_type,r.file_id FROM jsonb_to_recordset($2::jsonb) AS r(media_key text,mime_type text,file_id text)
    ON CONFLICT(bot_id,media_key) DO UPDATE SET file_id=EXCLUDED.file_id,mime_type=EXCLUDED.mime_type,updated_at=now()`,[botId,JSON.stringify(unique)]);
}
export async function forgetTelegramMedia(db:Database,botId:string,batch:Media[]) {
  const keys=batch.flatMap(file=>file.file_id&&file.cache_key?[file.cache_key]:[]);
  if(keys.length)await db.query('DELETE FROM himoto.management_telegram_media_cache WHERE bot_id=$1 AND media_key=ANY($2::text[])',[botId,keys]);
}

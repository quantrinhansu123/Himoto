import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { readCloudinaryPhoto } from './cloudinary-photos';

type Database=Pick<PoolClient,'query'>;
type EventType='rental'|'reservation'|'handover'|'return';
interface Attachment {slot:string;mime_type:string;bytes:string|null;cloudinary_public_id:string|null;cloudinary_cloud_name:string|null;cloudinary_version:number|null}
interface NotificationPayload {code:string;customer:string;phone:string;store:string;actor:string;vehicles:string;total:string;at:string;photos:Attachment[]}
export async function queueContractNotification(client:Database,orderId:number,kind:EventType,eventKey:string,actorId:number,phase:string|string[]) {
  const order=(await client.query(`SELECT o.id,o.store_id,COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,
      COALESCE(NULLIF(c.name,''),o.customer_name,'') AS customer,COALESCE(NULLIF(c.phone,''),o.customer_phone,'') AS phone,
      s.store_name AS store,u.name AS actor,o.total::text,
      (SELECT string_agg(DISTINCT COALESCE(NULLIF(v.license,''),v.name),', ') FROM himoto.order_vehicle_details d JOIN himoto.vehicles v ON v.id=d.vehicle_id WHERE d.order_id=o.id AND d.deleted_at IS NULL) AS vehicles
    FROM himoto.orders o LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=o.store_id LEFT JOIN himoto.users u ON u.id=$2 WHERE o.id=$1 AND o.deleted_at IS NULL`,[orderId,actorId])).rows[0];
  if(!order)throw new Error('Không tạo được thông báo hợp đồng.');
  const photos=(await client.query(`SELECT slot,mime_type,encode(data,'base64') AS bytes,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version
    FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND slot=ANY($2::text[]) ORDER BY slot`,[orderId,(Array.isArray(phase)?phase:[phase]).flatMap(stage=>Array.from({length:6},(_,index)=>`${stage}-${index+1}`))])).rows;
  await client.query(`INSERT INTO himoto.management_contract_notifications(id,order_id,store_id,event_key,event_type,payload,photo_slots,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,'pending') ON CONFLICT(event_key) DO NOTHING`,[randomUUID(),orderId,order.store_id,eventKey,kind,JSON.stringify({...order,id:undefined,store_id:undefined,at:new Date().toISOString(),photos}),JSON.stringify(photos.map(photo=>photo.slot))]);
}
export function contractNotificationText(kind:EventType,payload:NotificationPayload) {
  const labels={rental:'HOÀN TẤT THUÊ XE',reservation:'NHẬN CỌC GIỮ XE',handover:'HOÀN TẤT GIAO XE',return:'HOÀN TẤT TRẢ XE'};
  const total=Number(payload.total);
  return [`HIMOTO · ${labels[kind]}`,`Cơ sở: ${payload.store}`,`Hợp đồng: ${payload.code}`,`Khách: ${payload.customer}`,`SĐT: ${payload.phone}`,`Xe: ${payload.vehicles||'—'}`,
    `Tổng hợp đồng: ${Number.isFinite(total)?total.toLocaleString('vi-VN')+' đ':'Chưa đối chiếu'}`,`Người thực hiện: ${payload.actor}`,`Thời gian: ${new Date(payload.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`].join('\n').slice(0,4000);
}
async function telegramCall(token:string,method:string,body:FormData|Record<string,unknown>,send:typeof fetch) {
  const form=body instanceof FormData;
  const response=await send(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',...(form?{}:{headers:{'Content-Type':'application/json'}}),body:form?body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error',cache:'no-store'});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.ok!==true)throw new Error(`TELEGRAM_${result?.error_code||response.status}`);
  return result.result;
}
/** Claims are committed before calling Telegram. An uncertain send is never retried automatically. */
export async function dispatchContractNotifications(send:typeof fetch=fetch,limit=5,database:Database=ownerDatabase) {
  const settings=(await database.query('SELECT bot_cipher FROM himoto.management_telegram_settings WHERE singleton=true')).rows[0];
  if(!settings?.bot_cipher){await database.query("UPDATE himoto.management_contract_notifications SET status='awaiting_config' WHERE status='pending'");return {sent:0,configured:false};}
  const {token}=openIntegrationSecret<{token:string}>(settings.bot_cipher);let sent=0;
  for(let index=0;index<limit;index++) {
    const row=(await database.query(`UPDATE himoto.management_contract_notifications SET status='sending'
      WHERE id=(SELECT id FROM himoto.management_contract_notifications WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0];
    if(!row)break;
    const group=(await database.query('SELECT chat_id,thread_id FROM himoto.management_store_telegram WHERE store_id=$1 AND enabled',[row.store_id])).rows[0];
    if(!group){await database.query("UPDATE himoto.management_contract_notifications SET status='awaiting_config' WHERE id=$1",[row.id]);continue;}
    const payload=row.payload as NotificationPayload,ids:number[]=[];
    const target={chat_id:group.chat_id,...(group.thread_id?{message_thread_id:group.thread_id}:{})};
    let contacted=false;
    try {
      const files=[];
      for(const photo of payload.photos||[]) {
        const data=photo.cloudinary_public_id?Buffer.from(await(await readCloudinaryPhoto({cloudinary_public_id:photo.cloudinary_public_id,cloudinary_cloud_name:photo.cloudinary_cloud_name!,cloudinary_version:Number(photo.cloudinary_version)})).arrayBuffer()):Buffer.from(photo.bytes||'','base64');
        if(!data.length||data.length>2*1024*1024)throw new Error('PHOTO_SIZE');
        files.push({data,type:photo.mime_type});
      }
      contacted=true;
      const message=await telegramCall(token,'sendMessage',{...target,text:contractNotificationText(row.event_type,payload),link_preview_options:{is_disabled:true}},send);
      ids.push(Number(message.message_id));
      await database.query('UPDATE himoto.management_contract_notifications SET message_ids=$2 WHERE id=$1',[row.id,JSON.stringify(ids)]);
      for(let offset=0;offset<files.length;offset+=10) {
        const batch=files.slice(offset,offset+10);
        const form=new FormData();form.append('chat_id',group.chat_id);if(group.thread_id)form.append('message_thread_id',String(group.thread_id));
        if(batch.length===1){form.append('photo',new Blob([new Uint8Array(batch[0].data)],{type:batch[0].type}),'anh-hop-dong.jpg');const photo=await telegramCall(token,'sendPhoto',form,send);ids.push(Number(photo.message_id));}
        else {form.append('media',JSON.stringify(batch.map((_,i)=>({type:'photo',media:`attach://photo${i}`}))));batch.forEach((file,i)=>form.append(`photo${i}`,new Blob([new Uint8Array(file.data)],{type:file.type}),`anh-${i+1}.jpg`));const messages=await telegramCall(token,'sendMediaGroup',form,send);ids.push(...messages.map((message:{message_id:number})=>Number(message.message_id)));}
        await database.query('UPDATE himoto.management_contract_notifications SET message_ids=$2 WHERE id=$1',[row.id,JSON.stringify(ids)]);
      }
      await database.query("UPDATE himoto.management_contract_notifications SET status='sent',message_ids=$2,sent_at=now(),error_code=NULL WHERE id=$1",[row.id,JSON.stringify(ids)]);sent++;
    }catch(error){const known=error instanceof Error&&/^TELEGRAM_\d+$|^PHOTO_SIZE$/.test(error.message);await database.query('UPDATE himoto.management_contract_notifications SET status=$2,message_ids=$3,error_code=$4 WHERE id=$1',[row.id,contacted&&!known||ids.length?'unknown':'failed',JSON.stringify(ids),known?(error as Error).message:'SEND_UNCERTAIN']);}
  }
  return {sent,configured:true};
}

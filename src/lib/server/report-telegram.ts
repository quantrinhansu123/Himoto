import 'server-only';
import type { PoolClient } from 'pg';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { telegramCall,TelegramDeliveryError } from './telegram-delivery';

type Database=Pick<PoolClient,'query'>;
export async function queueReportTelegram(db:Database,key:string,store:number,text:string,route:'store'|'ownership_new') {
  if(!text.trim()||text.length>4000)throw new Error('Báo cáo vượt giới hạn Telegram.');
  await db.query(`INSERT INTO himoto.management_report_deliveries(delivery_key,store_id,route,text)
    VALUES($1,$2,$3,$4) ON CONFLICT(delivery_key) DO NOTHING`,[key,store,route,text]);
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
    attempted=true;
    const ids=await telegramCall(token,'sendMessage',{chat_id:target.chat_id,...(target.thread_id?{message_thread_id:Number(target.thread_id)}:{}),text:row.text},send);
    await db.query("UPDATE himoto.management_report_deliveries SET status='sent',message_id=$2,updated_at=now() WHERE delivery_key=$1",[key,ids[0]]);
  }catch(error){
    const definite=!attempted||error instanceof TelegramDeliveryError&&error.definiteFailure;
    await db.query('UPDATE himoto.management_report_deliveries SET status=$2,error_code=$3,updated_at=now() WHERE delivery_key=$1',
      [key,definite?'failed':'unknown',error instanceof TelegramDeliveryError?error.message:'DELIVERY_FAILED']);
  }
}

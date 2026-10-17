import 'server-only';
import { randomUUID } from 'node:crypto';
import { ownerDatabase } from './himoto-database';
import { sealIntegrationSecret } from './integration-secrets';
export class IntegrationSettingsError extends Error {constructor(message:string,public status=400){super(message);}}
const text=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length<=max?value.trim():'';
export async function readIntegrationSettings() {
  const [accounts,bot,groups,notifications,scheduler,channels,history]=await Promise.all([
    ownerDatabase.query('SELECT id,provider,label,username,enabled,last_attempt_at,last_success_at,last_error,device_count FROM himoto.management_gps_accounts ORDER BY provider,label'),
    ownerDatabase.query('SELECT bot_cipher IS NOT NULL AS configured FROM himoto.management_telegram_settings WHERE singleton=true'),
    ownerDatabase.query('SELECT s.id AS store_id,s.store_name,g.chat_id,g.thread_id,COALESCE(g.enabled,false) AS enabled FROM himoto.stores s LEFT JOIN himoto.management_store_telegram g ON g.store_id=s.id ORDER BY s.id'),
    ownerDatabase.query("SELECT id,order_id,event_type,status,created_at,sent_at,error_code,payload->>'code' AS code,jsonb_array_length(photo_slots) AS photos FROM himoto.management_contract_notifications ORDER BY created_at DESC LIMIT 30"),
    ownerDatabase.query('SELECT enabled,last_dispatched_at,last_response_at,last_http_status,last_error_code FROM himoto.management_integration_schedule WHERE singleton=true'),
    ownerDatabase.query(`SELECT a.id,a.provider,a.label,COALESCE(c.motion_enabled,false) AS motion_enabled,
      COALESCE(c.alarms_enabled,false) AS alarms_enabled,COALESCE(c.webhook_enabled,false) AS webhook_enabled,c.last_webhook_at,
      COALESCE(c.webhook_log_error,c.last_error) AS last_error,c.webhook_covered_until,c.webhook_log_success_at
      FROM himoto.management_gps_accounts a LEFT JOIN himoto.management_gps_event_channels c ON c.account_id=a.id ORDER BY a.provider,a.label`),
    ownerDatabase.query(`SELECT count(*)::int AS streams,count(*) FILTER(WHERE last_success_at IS NOT NULL)::int AS completed_streams,
      count(*) FILTER(WHERE last_error IS NOT NULL)::int AS failed_streams,
      count(*) FILTER(WHERE covered_until<now()-interval '15 minutes')::int AS behind_streams,
      min(covered_until) AS covered_until,max(last_success_at) AS last_success_at,
      (SELECT count(*)::int FROM himoto.management_gps_status_events WHERE source='history') AS history_events,
      (SELECT count(*)::int FROM himoto.management_gps_status_events WHERE source='webhook') AS webhook_events,
      (SELECT count(*)::int FROM himoto.management_gps_webhook_receipts WHERE status IN('pending','awaiting_device')) AS waiting_webhooks
      FROM himoto.management_gps_history_cursors`),
  ]);
  return {accounts:accounts.rows,telegram_configured:bot.rows[0]?.configured===true,groups:groups.rows,notifications:notifications.rows,scheduler:scheduler.rows[0]||null,gps_history:{channels:channels.rows,...history.rows[0]}};
}
export async function saveIntegrationSettings(raw:unknown) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new IntegrationSettingsError('Cấu hình không hợp lệ.');
  const body=raw as Record<string,unknown>;
  if(body.action==='gps_account') {
    const provider=body.provider,username=text(body.username,191),label=text(body.label,191);
    if(!['protrack','iopgps'].includes(String(provider))||!username||!label||typeof body.password!=='string'||!body.password||body.password.length>256)throw new IntegrationSettingsError('Nhập nền tảng, tên gợi nhớ, tài khoản và mật khẩu GPS.');
    await ownerDatabase.query(`INSERT INTO himoto.management_gps_accounts(id,provider,label,username,secret_cipher)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider,username) DO UPDATE SET label=EXCLUDED.label,secret_cipher=EXCLUDED.secret_cipher,session_cipher=NULL,session_expires_at=NULL,enabled=true,last_error=NULL,updated_at=now()`,[randomUUID(),provider,label,username,sealIntegrationSecret({password:body.password})]);
    return;
  }
  if(body.action==='gps_enabled') {
    if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id)||typeof body.enabled!=='boolean')throw new IntegrationSettingsError('Tài khoản GPS không hợp lệ.');
    await ownerDatabase.query('UPDATE himoto.management_gps_accounts SET enabled=$2,updated_at=now() WHERE id=$1',[body.id,body.enabled]);return;
  }
  if(body.action!=='telegram')throw new IntegrationSettingsError('Thao tác cấu hình không hợp lệ.');
  const token=text(body.token,200),groups=body.groups;
  if(token&&!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token))throw new IntegrationSettingsError('Bot token Telegram không đúng định dạng.');
  if(!Array.isArray(groups)||groups.length>100)throw new IntegrationSettingsError('Danh sách phòng giao dịch không hợp lệ.');
  const parsed=groups.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new IntegrationSettingsError('Cấu hình nhóm không hợp lệ.');
    const row=item as Record<string,unknown>,storeId=Number(row.store_id),chatId=text(row.chat_id,40),thread=row.thread_id==null||row.thread_id===''?null:Number(row.thread_id);
    if(!Number.isSafeInteger(storeId)||storeId<1||typeof row.enabled!=='boolean'||chatId&&!/^-\d{5,18}$/.test(chatId)||row.enabled&&!chatId||thread!==null&&(!Number.isSafeInteger(thread)||thread<1))throw new IntegrationSettingsError('Kiểm tra cơ sở, chat_id nhóm (số âm) và mã chủ đề Telegram.');
    return {storeId,chatId,thread,enabled:row.enabled};
  });
  if(new Set(parsed.map(group=>group.storeId)).size!==parsed.length)throw new IntegrationSettingsError('Mỗi cơ sở chỉ cấu hình một nhóm.');
  const client=await ownerDatabase.connect();
  try {
    await client.query('BEGIN');
    const stores=await client.query('SELECT id FROM himoto.stores WHERE id=ANY($1::bigint[])',[parsed.map(group=>group.storeId)]);
    if(stores.rowCount!==parsed.length)throw new IntegrationSettingsError('Cơ sở đã chọn không còn tồn tại.');
    if(token)await client.query('UPDATE himoto.management_telegram_settings SET bot_cipher=$1,updated_at=now() WHERE singleton=true',[sealIntegrationSecret({token})]);
    for(const group of parsed){if(!group.chatId){await client.query('DELETE FROM himoto.management_store_telegram WHERE store_id=$1',[group.storeId]);continue;}
      await client.query(`INSERT INTO himoto.management_store_telegram(store_id,chat_id,thread_id,enabled) VALUES($1,$2,$3,$4)
        ON CONFLICT(store_id) DO UPDATE SET chat_id=EXCLUDED.chat_id,thread_id=EXCLUDED.thread_id,enabled=EXCLUDED.enabled,updated_at=now()`,[group.storeId,group.chatId,group.thread,group.enabled]);}
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

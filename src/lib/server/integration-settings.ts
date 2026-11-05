import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ownerDatabase } from './himoto-database';
import { sealIntegrationSecret } from './integration-secrets';
import { OWNERSHIP_TELEGRAM_DESTINATIONS } from '@/lib/management/telegram-destinations';
import { IntegrationSettingsError,parseIntegrationSettings } from '../../../shared/integration-settings';
export { IntegrationSettingsError,parseIntegrationSettings } from '../../../shared/integration-settings';
type Database=Pick<PoolClient,'query'>;
export async function readIntegrationSettings(database:Database=ownerDatabase) {
  const [accounts,bot,groups,notifications,scheduler,channels,history,ownershipGroups]=await Promise.all([
    database.query('SELECT id,provider,label,username,enabled,last_attempt_at,last_success_at,last_error,device_count FROM himoto.management_gps_accounts ORDER BY provider,label'),
    database.query('SELECT bot_cipher IS NOT NULL AS configured FROM himoto.management_telegram_settings WHERE singleton=true'),
    database.query('SELECT s.id AS store_id,s.store_name,g.chat_id,g.thread_id,COALESCE(g.enabled,false) AS enabled FROM himoto.stores s LEFT JOIN himoto.management_store_telegram g ON g.store_id=s.id ORDER BY s.id'),
    database.query("SELECT id,order_id,event_type,status,created_at,sent_at,error_code,payload->>'code' AS code,jsonb_array_length(photo_slots) AS photos FROM himoto.management_contract_notifications ORDER BY created_at DESC LIMIT 30"),
    database.query('SELECT enabled,last_dispatched_at,last_response_at,last_http_status,last_error_code FROM himoto.management_integration_schedule WHERE singleton=true'),
    database.query(`SELECT a.id,a.provider,a.label,COALESCE(c.motion_enabled,false) AS motion_enabled,
      COALESCE(c.alarms_enabled,false) AS alarms_enabled,COALESCE(c.webhook_enabled,false) AS webhook_enabled,c.last_webhook_at,
      c.last_error
      FROM himoto.management_gps_accounts a LEFT JOIN himoto.management_gps_event_channels c ON c.account_id=a.id ORDER BY a.provider,a.label`),
    database.query(`SELECT count(*)::int AS streams,count(*) FILTER(WHERE last_success_at IS NOT NULL)::int AS completed_streams,
      count(*) FILTER(WHERE last_error IS NOT NULL)::int AS failed_streams,
      count(*) FILTER(WHERE covered_until<now()-interval '15 minutes')::int AS behind_streams,
      (SELECT count(*)::int FROM himoto.management_gps_history_cursors blocked JOIN himoto.gps_devices d ON d.id=blocked.gps_device_id
        WHERE d.provider_status='not_visible_in_account') AS inaccessible_streams,
      min(covered_until) AS covered_until,max(last_success_at) AS last_success_at,
      (SELECT count(*)::int FROM himoto.management_gps_status_events WHERE source='history') AS history_events,
      (SELECT count(*)::int FROM himoto.management_gps_status_events WHERE source='webhook') AS webhook_events,
      (SELECT count(*)::int FROM himoto.management_gps_webhook_receipts WHERE status IN('pending','awaiting_device')) AS waiting_webhooks
      FROM himoto.management_gps_history_cursors`),
    database.query('SELECT route,chat_id,thread_id,enabled FROM himoto.management_ownership_telegram ORDER BY route'),
  ]);
  return {accounts:accounts.rows,telegram_configured:bot.rows[0]?.configured===true,groups:groups.rows,
    ownership_groups:OWNERSHIP_TELEGRAM_DESTINATIONS.map(item=>({...item,chat_id:null,thread_id:null,enabled:false,...ownershipGroups.rows.find(row=>row.route===item.route)})),
    notifications:notifications.rows,scheduler:scheduler.rows[0]||null,gps_history:{channels:channels.rows,...history.rows[0]}};
}
export async function saveIntegrationSettingsOnClient(client:Database,raw:unknown):Promise<{kind:'gps-account'|'telegram';id:string}> {
  const input=parseIntegrationSettings(raw);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-integration-settings']);
  if(input.action==='gps_account'){
    const saved=await client.query(`INSERT INTO himoto.management_gps_accounts(id,provider,label,username,secret_cipher)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider,username) DO UPDATE SET label=EXCLUDED.label,secret_cipher=EXCLUDED.secret_cipher,session_cipher=NULL,session_expires_at=NULL,enabled=true,last_error=NULL,updated_at=now() RETURNING id`,[randomUUID(),input.provider,input.label,input.username,sealIntegrationSecret({password:input.password})]);
    return {kind:'gps-account',id:String(saved.rows[0].id)};
  }
  if(input.action==='gps_enabled'){
    await client.query('UPDATE himoto.management_gps_accounts SET enabled=$2,updated_at=now() WHERE id=$1',[input.id,input.enabled]);return{kind:'gps-account',id:input.id};
  }
  const {token,groups:parsed,ownership:parsedOwnership}=input;
  if(parsedOwnership)await client.query('LOCK TABLE himoto.management_ownership_telegram IN SHARE ROW EXCLUSIVE MODE');
  const stores=await client.query('SELECT id FROM himoto.stores WHERE id=ANY($1::bigint[])',[parsed.map(group=>group.storeId)]);
  if(stores.rowCount!==parsed.length)throw new IntegrationSettingsError('Cơ sở đã chọn không còn tồn tại.');
  if(token)await client.query('UPDATE himoto.management_telegram_settings SET bot_cipher=$1,updated_at=now() WHERE singleton=true',[sealIntegrationSecret({token})]);
  for(const group of parsed){if(!group.chatId){await client.query('DELETE FROM himoto.management_store_telegram WHERE store_id=$1',[group.storeId]);continue;}
    await client.query(`INSERT INTO himoto.management_store_telegram(store_id,chat_id,thread_id,enabled) VALUES($1,$2,$3,$4)
      ON CONFLICT(store_id) DO UPDATE SET chat_id=EXCLUDED.chat_id,thread_id=EXCLUDED.thread_id,enabled=EXCLUDED.enabled,updated_at=now()`,[group.storeId,group.chatId,group.thread,group.enabled]);}
  for(const group of parsedOwnership||[]){if(!group.chatId){await client.query('DELETE FROM himoto.management_ownership_telegram WHERE route=$1',[group.route]);continue;}
    await client.query(`INSERT INTO himoto.management_ownership_telegram(route,chat_id,thread_id,enabled) VALUES($1,$2,$3,$4)
      ON CONFLICT(route) DO UPDATE SET chat_id=EXCLUDED.chat_id,thread_id=EXCLUDED.thread_id,enabled=EXCLUDED.enabled,updated_at=now()`,[group.route,group.chatId,group.thread,group.enabled]);}
  if(parsedOwnership&&(await client.query('SELECT 1 FROM himoto.management_ownership_telegram WHERE enabled GROUP BY chat_id HAVING count(*)>1')).rowCount)throw new IntegrationSettingsError('Nhóm hợp đồng sở hữu mới và nhóm gia hạn phải khác nhau.');
  return{kind:'telegram',id:'true'};
}
export async function saveIntegrationSettings(raw:unknown){
  const client=await ownerDatabase.connect();try{await client.query('BEGIN');await saveIntegrationSettingsOnClient(client,raw);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

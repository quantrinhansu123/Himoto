import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { gpsAlarmEvent,parseIopWebhookRecord,persistGpsProviderEvents,type GpsEventDatabase,type IopWebhookRecord } from './gps-event-records';

export async function validGpsWebhookKey(accountId:string,supplied:string|null,database:GpsEventDatabase=ownerDatabase) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)||!supplied||!/^[0-9a-f]{64}$/.test(supplied))return false;
  const settings=(await database.query(`SELECT c.webhook_cipher FROM himoto.management_gps_event_channels c
    JOIN himoto.management_gps_accounts a ON a.id=c.account_id WHERE c.account_id=$1 AND a.provider='iopgps' AND a.enabled`,[accountId])).rows[0];
  if(!settings?.webhook_cipher)return false;
  const secret=openIntegrationSecret<{key:string}>(settings.webhook_cipher);
  return typeof secret.key==='string'&&secret.key.length===64&&timingSafeEqual(Buffer.from(secret.key),Buffer.from(supplied));
}
export async function processIopWebhookReceipt(database:GpsEventDatabase,accountId:string,record:IopWebhookRecord,source:'history'|'webhook'='webhook') {
  const device=(await database.query(`SELECT d.id FROM himoto.management_gps_account_devices m
    JOIN himoto.gps_devices d ON d.id=m.gps_device_id WHERE m.account_id=$1 AND d.provider='iopgps' AND d.external_device_id=$2`,[accountId,record.imei])).rows[0];
  if(!device){await database.query("UPDATE himoto.management_gps_webhook_receipts SET status='awaiting_device',next_attempt_at=now()+interval '60 seconds' WHERE account_id=$1 AND event_id=$2",[accountId,record.id]);return {status:'awaiting_device',inserted:0};}
  // A rule is registered per alarm type, so no ambiguous OR condition can invent events.
  const types=[...new Set(record.triggerConditions.map(condition=>condition.alarmType))];
  if(types.length!==1)throw new Error('GPS_WEBHOOK_AMBIGUOUS');
  const event=gpsAlarmEvent('iopgps',types[0],record.triggerTime,record.id);
  const inserted=event?await persistGpsProviderEvents(database,Number(device.id),[event],source):0;
  const status=event?'processed':'unsupported';
  await database.query('UPDATE himoto.management_gps_webhook_receipts SET status=$3,processed_at=now() WHERE account_id=$1 AND event_id=$2',[accountId,record.id,status]);
  return {status,inserted};
}
export async function receiveIopGpsWebhook(accountId:string,raw:unknown,database=ownerDatabase,source:'history'|'webhook'='webhook') {
  const record=parseIopWebhookRecord(raw);
  if(new Set(record.triggerConditions.map(condition=>condition.alarmType)).size!==1)throw new Error('GPS_WEBHOOK_AMBIGUOUS');
  const client=await database.connect();
  try {
    await client.query('BEGIN');
    if(source==='webhook')await client.query('UPDATE himoto.management_gps_event_channels SET last_webhook_at=now() WHERE account_id=$1',[accountId]);
    const inserted=await client.query(`INSERT INTO himoto.management_gps_webhook_receipts(account_id,event_id,payload,source)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id`,[accountId,record.id,JSON.stringify(record),source]);
    if(!inserted.rowCount){await client.query('COMMIT');return {status:'duplicate',inserted:0};}
    const result=await processIopWebhookReceipt(client,accountId,record,source);
    await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export async function processWaitingGpsWebhooks(database=ownerDatabase) {
  const client=await database.connect();let processed=0;
  try {
    await client.query('BEGIN');
    const waiting=(await client.query(`SELECT account_id,payload,source FROM himoto.management_gps_webhook_receipts
      WHERE status IN('pending','awaiting_device') AND next_attempt_at<=now() ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT 20`)).rows;
    for(const row of waiting){const result=await processIopWebhookReceipt(client,row.account_id,parseIopWebhookRecord(row.payload),row.source);if(result.status==='processed')processed++;}
    await client.query('COMMIT');return processed;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

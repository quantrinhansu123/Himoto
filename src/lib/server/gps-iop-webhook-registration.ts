import 'server-only';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import type { GpsSession } from './gps-providers';

const types=[4,25,27,44,45,62,72];
export const iopManagedEventPrefix=(accountId:string)=>`HIMOTO-sync-${accountId.slice(0,8)}-`;
async function iopCall(session:GpsSession,path:string,body?:Record<string,unknown>,send:typeof fetch=fetch) {
  let response:Response;
  try{response=await send(new URL(path,'https://iopgps.com'),{method:body?'POST':'GET',headers:{Cookie:`USER_TOKEN=${session.token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(8000),cache:'no-store'});}
  catch{throw new Error('IOPGPS_EVENT_NETWORK');}
  if(!response.ok)throw new Error(`IOPGPS_EVENT_HTTP_${response.status}`);
  const data=await response.json().catch(()=>null);
  if((data?.code??data?.resultBean?.code)!==0)throw new Error(`IOPGPS_EVENT_${Number(data?.code??data?.resultBean?.code)||'INVALID'}`);
  return data;
}
export async function configureIopGpsWebhooks(accountId:string,send:typeof fetch=fetch,database=ownerDatabase) {
  const account=(await database.query(`SELECT a.id,a.session_cipher,c.webhook_cipher,c.webhook_rules FROM himoto.management_gps_accounts a
    JOIN himoto.management_gps_event_channels c ON c.account_id=a.id WHERE a.id=$1 AND a.provider='iopgps' AND a.enabled`,[accountId])).rows[0];
  if(!account?.session_cipher||!account.webhook_cipher)throw new Error('IOPGPS_WEBHOOK_NOT_PREPARED');
  const session=openIntegrationSecret<GpsSession>(account.session_cipher),secret=openIntegrationSecret<{key:string}>(account.webhook_cipher);
  const webhookUrl=`https://himoto.vercel.app/api/webhooks/gps/iopgps/${accountId}?key=${secret.key}`;
  const verified=await send(webhookUrl,{redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(verified.status!==200)throw new Error('IOPGPS_WEBHOOK_ENDPOINT_NOT_READY');await verified.body?.cancel();
  const devices=(await database.query(`SELECT d.external_device_id FROM himoto.management_gps_account_devices m JOIN himoto.gps_devices d ON d.id=m.gps_device_id
    WHERE m.account_id=$1 AND d.provider='iopgps' ORDER BY d.external_device_id`,[accountId])).rows.map(row=>row.external_device_id as string);
  if(!devices.length)throw new Error('IOPGPS_WEBHOOK_NO_DEVICES');
  await iopCall(session,'/rest/event/webhook/inspect',{webhookUrl},send);
  const existing:Record<string,unknown>[]=[];
  for(let page=1;page<=10;page++) {
    const list=await iopCall(session,`/rest/event/list?currentPage=${page}&pageSize=100&accountId=${encodeURIComponent(session.accountId)}`,undefined,send);
    if(!Array.isArray(list.data))throw new Error('IOPGPS_EVENT_LIST_INVALID');
    existing.push(...list.data);if(list.data.length<100)break;if(page===10)throw new Error('IOPGPS_EVENT_LIST_LIMIT');
  }
  const rules={...account.webhook_rules} as Record<string,string>;
  const schedule=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,[{start:0,end:86400}]]));
  for(const type of types) {
    const name=iopManagedEventPrefix(accountId)+type;
    const found=existing.filter(row=>(row.eventName||row.name)===name);
    if(found.length>1)throw new Error('IOPGPS_EVENT_DUPLICATE_MANAGED_NAME');
    const id=found[0]?.id||rules[String(type)];
    const details=id?(await iopCall(session,'/rest/event/'+encodeURIComponent(String(id)),undefined,send)).data:null;
    const payload={eventName:name,conditionType:1,association:1,threshold:30,triggerConditions:[{alarmType:type,scopeIds:[]}],
      effectiveTime:schedule,effectiveTimeType:0,relatedDevices:devices,emailPush:0,email:'',appPush:0,deviceEmailPush:0,
      actionType:0,shareThreshold:86400,actionTitle:'',actionText:'',routine:'',format:'',devices:[],webhookUrl,...(id?{id}:{}),};
    const same=details&&details.webhookUrl===webhookUrl&&JSON.stringify([...(details.relatedDevices||[])].sort())===JSON.stringify([...devices].sort())
      &&details.triggerConditions?.length===1&&Number(details.triggerConditions[0].alarmType)===type&&!details.routine&&Number(details.actionType)===0;
    if(!same)await iopCall(session,'/rest/event/create',payload,send);
    const listed=await iopCall(session,`/rest/event/list?currentPage=1&pageSize=100&accountId=${encodeURIComponent(session.accountId)}&eventName=${encodeURIComponent(name)}`,undefined,send);
    const matching=listed.data?.filter((row:Record<string,unknown>)=>(row.eventName||row.name)===name);
    if(!Array.isArray(matching)||matching.length!==1)throw new Error('IOPGPS_EVENT_SAVE_UNCONFIRMED');
    const saved=matching[0];
    if(!saved.active)await iopCall(session,`/rest/event/state/${encodeURIComponent(String(saved.id))}?active=1`,{},send);
    const confirmed=(await iopCall(session,'/rest/event/'+encodeURIComponent(String(saved.id)),undefined,send)).data;
    if(confirmed?.webhookUrl!==webhookUrl||confirmed?.triggerConditions?.length!==1||Number(confirmed.triggerConditions[0].alarmType)!==type||confirmed.routine||Number(confirmed.actionType)!==0
      ||JSON.stringify([...(confirmed.relatedDevices||[])].sort())!==JSON.stringify([...devices].sort()))throw new Error('IOPGPS_EVENT_VERIFY_FAILED');
    rules[String(type)]=String(saved.id);
    await database.query('UPDATE himoto.management_gps_event_channels SET webhook_rules=$2 WHERE account_id=$1',[accountId,JSON.stringify(rules)]);
  }
  await database.query('UPDATE himoto.management_gps_event_channels SET webhook_enabled=true,rules_updated_at=now(),last_error=NULL,updated_at=now() WHERE account_id=$1',[accountId]);
  return {rules:types.length,devices:devices.length};
}

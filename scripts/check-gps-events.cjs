const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const records=load(path.join(root,'lib/server/gps-event-records'));
const history=load(path.join(root,'lib/server/gps-history-providers'));
const hooks=load(path.join(root,'lib/server/gps-webhooks'));
const {syncGpsEventHistory}=load(path.join(root,'lib/server/gps-history-sync'));
const {configureIopGpsWebhooks}=load(path.join(root,'lib/server/gps-iop-webhook-registration'));
const {sealIntegrationSecret}=load(path.join(root,'lib/server/integration-secrets'));
const pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const checks=[];
async function main(){
  const end=Date.now()-60000,start=end-3600000,session={token:'qa-only',accountId:'1'},device={external_device_id:'990000000000001',provider_device_id:'1234'};
  const at=start+10000,compressed={'7':Math.floor(at/1000),'12':0,'9':0,'10':0};
  const response=await history.readGpsMotionHistory('iopgps',session,device,start,end,async(url,init)=>{
    assert.equal(new URL(url).pathname,'/rest/device/track/990000000000001/v3');assert.equal(init.headers.Cookie,'USER_TOKEN=qa-only');
    assert.equal(new URL(url).searchParams.get('filterStillPoints'),'0');return Response.json({resultBean:{code:0},histories:[compressed,{...compressed,'7':Math.floor(at/1000)+1,'12':8}]});
  });assert.deepEqual(response.map(row=>row.speed),[0,8]);
  await assert.rejects(()=>history.readGpsMotionHistory('iopgps',session,device,start,end,async()=>Response.json({resultBean:{code:0}})),error=>error.code==='HISTORY_INCOMPLETE');
  await assert.rejects(()=>history.readGpsMotionHistory('iopgps',session,device,start,end,async()=>Response.json({resultBean:{code:0},histories:[{'7':Math.floor(at/1000)}]})),error=>error.code==='HISTORY_POINT_INVALID');
  let pages=0;
  const many=Array.from({length:1000},(_,i)=>`105,21,${start+i*1000},${i%2},0`).join(';');
  const paged=await history.readGpsMotionHistory('protrack',session,device,start,end,async url=>{
    const query=new URL(url).searchParams;assert.equal(query.get('deviceid'),'1234');assert.notEqual(query.get('deviceid'),device.external_device_id);
    if(pages++===0)return Response.json({errorcode:0,record:many});
    assert.equal(Number(query.get('begintime')),start+999000);return Response.json({errorcode:0,record:`105,21,${start+999000},1,0;105,21,${start+1000000},0,0`});
  });assert.equal(pages,2);assert.equal(paged.length,1002);
  await assert.rejects(()=>history.readGpsMotionHistory('protrack',session,device,start,end,async()=>Response.json({errorcode:10007})),error=>error.code==='HISTORY_PROTRACK_10007');
  const alarm=await history.readGpsAlarmHistory('iopgps',session,device,start,end,async()=>Response.json({resultBean:{code:0},beanList:[{deviceAlarmId:12,alarmTypeId:25,alarmTime:at/1000},{deviceAlarmId:13,alarmTypeId:45,alarmTime:at/1000}]}));
  assert.deepEqual(alarm.map(event=>[event.kind,event.state]),[['connection_online',null],['ignition_off',null]]);
  assert.throws(()=>records.parseIopWebhookRecord({id:'1',imei:'990000000000001',conditionType:1,triggerTime:(Date.now()+86400000)/1000,triggerConditions:[{alarmType:25}]}));
  checks.push('Verified provider formats, zero-speed stops, native Protrack IDs, inclusive pagination, missing/truncated response rejection and online-versus-motion semantics');
  const failQueries=[];let claimed=false;
  const fakeClient={async query(sql){return {rows:sql.includes('FOR UPDATE SKIP LOCKED LIMIT 20')?[]:[],rowCount:0};},release(){}};
  const fakeDb={async connect(){return fakeClient;},async query(sql,params){failQueries.push({sql,params});if(sql.includes('SET lease_token=$1,lease_until='))return {rowCount:1,rows:[{}]};if(sql.startsWith('WITH candidate')){if(claimed)return {rows:[]};claimed=true;return {rows:[{gps_device_id:1,account_id:'00000000-0000-4000-8000-000000000099',stream:'motion',covered_until:new Date(start),coverage_started_at:new Date(start),external_device_id:device.external_device_id,provider_device_id:'1234',provider:'iopgps',session_cipher:sealIntegrationSecret(session)}]};}return {rows:[],rowCount:1};}};
  const failed=await syncGpsEventHistory(1,5000,fakeDb,async()=>{throw Error('network lost');});assert.equal(failed.succeeded,0);
  assert.ok(failQueries.some(row=>row.sql.includes('SET last_error=$3')));assert.ok(!failQueries.some(row=>row.sql.includes('covered_until=GREATEST')));
  claimed=false;failQueries.length=0;await syncGpsEventHistory(1,5000,fakeDb,async()=>new Response('',{status:429}));
  assert.ok(failQueries.some(row=>row.sql.includes("history_pause_until=now()+interval '60 seconds'")));assert.ok(!failQueries.some(row=>row.sql.includes('covered_until=GREATEST')));
  assert.equal(failQueries.find(row=>row.sql.includes("history_pause_until=now()+interval '60 seconds'")).params[0],'00000000-0000-4000-8000-000000000099');
  checks.push('A failed history request retains its checkpoint, records a retryable error and releases the worker lease');
  const managed=new Map(),configurationWrites=[];let savedRules={};
  const configureAccount='00000000-0000-4000-8000-000000000099';
  const registrationDb={async query(sql,params){
    if(sql.startsWith('SELECT a.id,a.session_cipher'))return {rows:[{id:configureAccount,session_cipher:sealIntegrationSecret(session),webhook_cipher:sealIntegrationSecret({key:'b'.repeat(64)}),webhook_rules:savedRules}]};
    if(sql.startsWith('SELECT d.external_device_id'))return {rows:[{external_device_id:'990000000000001'}]};
    if(sql.includes('SET webhook_rules=$2'))savedRules=JSON.parse(params[1]);
    return {rows:[],rowCount:1};
  }};
  const registrationSend=async(input,init={})=>{
    const url=new URL(input);if(url.hostname==='himoto.vercel.app')return Response.json({status:'success'});
    assert.equal(url.hostname,'iopgps.com');assert.equal(init.headers.Cookie,'USER_TOKEN=qa-only');
    if(url.pathname==='/rest/event/webhook/inspect')return Response.json({code:0});
    if(url.pathname==='/rest/event/list'){const name=url.searchParams.get('eventName');return Response.json({code:0,data:[...managed.values()].filter(row=>!name||row.eventName===name)});}
    if(url.pathname==='/rest/event/create'){
      const payload=JSON.parse(init.body);assert.equal(payload.actionType,0);assert.equal(payload.routine,'');assert.equal(payload.emailPush,0);assert.equal(payload.appPush,0);assert.equal(payload.deviceEmailPush,0);
      assert.deepEqual(payload.relatedDevices,['990000000000001']);assert.equal(payload.triggerConditions.length,1);assert.equal(Object.keys(payload.effectiveTime).length,7);
      configurationWrites.push(payload.eventName);const id=payload.id||String(managed.size+1);managed.set(String(id),{...payload,id,active:true});return Response.json({code:0,data:id});
    }
    const id=url.pathname.split('/').pop();if(url.pathname.startsWith('/rest/event/')&&managed.has(id))return Response.json({code:0,data:managed.get(id)});
    throw Error('Unexpected registration request');
  };
  assert.deepEqual(await configureIopGpsWebhooks(configureAccount,registrationSend,registrationDb),{rules:7,devices:1});
  assert.equal(configurationWrites.length,7);await configureIopGpsWebhooks(configureAccount,registrationSend,registrationDb);assert.equal(configurationWrites.length,7);
  checks.push('Webhook registration verifies its receiver, creates seven scoped reporting rules, sends no commands or app/email alerts, and is idempotent on a second run');
  const c=await pool.connect(),schema='qa_gps_events_'+Date.now().toString(36);
  try{
    await c.query('BEGIN');await c.query(`CREATE SCHEMA ${schema}`);
    for(const table of ['orders','stores','users','customers','vehicles','order_vehicle_details','gps_devices','gps_positions','management_record_photos']){
      await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING ALL)`);
      const has=(await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='id'",[schema,table])).rowCount;
      if(has){await c.query(`ALTER TABLE ${schema}.${table} ALTER COLUMN id DROP DEFAULT`);await c.query(`ALTER TABLE ${schema}.${table} ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY`);}
    }
    const migrate=file=>fs.readFileSync(path.resolve('docs/sql',file),'utf8').replaceAll('himoto.',schema+'.').replaceAll(schema+'.access_store','himoto.access_store').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
    for(const file of ['2026-10-17-gps-contract-telegram.sql','2026-10-17-gps-five-second-poll.sql','2026-10-17-gps-history-webhooks.sql','2026-10-24-gps-long-stops.sql','2026-10-25-gps-provider-stop.sql']){await c.query(migrate(file));await c.query(migrate(file));}
    const db={query:(sql,params)=>c.query(sql.replaceAll('himoto.',schema+'.'),params)};
    await c.query(`INSERT INTO ${schema}.stores(id,store_name) VALUES(23,'QA A'),(31,'QA B');
      INSERT INTO ${schema}.vehicles(id,name,brand,type,year,store_id,current_store_id,license,color,status,odometer,created_by) VALUES(1,'QA vehicle','Honda','xeso',2024,23,23,'QA-1','Black','ready',0,143),(2,'QA other','Honda','xeso',2024,31,31,'QA-2','Black','ready',0,143);
      INSERT INTO ${schema}.gps_devices(id,provider,external_device_id,imei,vehicle_id,mapping_status,management_status) VALUES(1,'iopgps','990000000000001','990000000000001',1,'auto','online'),(2,'iopgps','990000000000002','990000000000002',2,'auto','stopped')`);
    const account='00000000-0000-4000-8000-000000000001',foreign='00000000-0000-4000-8000-000000000002',key='a'.repeat(64);
    await c.query(`INSERT INTO ${schema}.management_gps_accounts(id,provider,label,username,secret_cipher) VALUES($1,'iopgps','QA','qa','unused'),($2,'iopgps','QA foreign','foreign','unused')`,[account,foreign]);
    await c.query(`INSERT INTO ${schema}.management_gps_account_devices(account_id,gps_device_id) VALUES($1,1),($2,2)`,[account,foreign]);
    await c.query(`INSERT INTO ${schema}.management_gps_event_channels(account_id,webhook_cipher) VALUES($1,$2)`,[account,sealIntegrationSecret({key})]);
    assert(await hooks.validGpsWebhookKey(account,key,db));assert(!await hooks.validGpsWebhookKey(account,'b'.repeat(64),db));assert(!await hooks.validGpsWebhookKey(foreign,key,db));
    const points=[{at:new Date(at).toISOString(),speed:12},{at:new Date(at+1000).toISOString(),speed:0},{at:new Date(at+2000).toISOString(),speed:8}];
    assert.equal(await records.persistGpsMotionHistory(db,1,points,new Date(start).toISOString()),3);
    assert.equal(await records.persistGpsMotionHistory(db,1,points,new Date(start).toISOString()),0);
    assert.equal((await c.query(`SELECT management_status FROM ${schema}.gps_devices WHERE id=1`)).rows[0].management_status,'online');
    const makeRecord=(id,imei= device.external_device_id)=>records.parseIopWebhookRecord({id,imei,triggerTime:at/1000,conditionType:1,triggerConditions:[{alarmType:27}]});
    const record=makeRecord('qa-event-1');await c.query(`INSERT INTO ${schema}.management_gps_webhook_receipts(account_id,event_id,payload) VALUES($1,$2,$3)`,[account,record.id,JSON.stringify(record)]);
    assert.equal((await hooks.processIopWebhookReceipt(db,account,record)).inserted,1);assert.equal((await hooks.processIopWebhookReceipt(db,account,record)).inserted,0);
    const unknown=makeRecord('qa-unknown','990000000000002');await c.query(`INSERT INTO ${schema}.management_gps_webhook_receipts(account_id,event_id,payload) VALUES($1,$2,$3)`,[account,unknown.id,JSON.stringify(unknown)]);
    assert.equal((await hooks.processIopWebhookReceipt(db,account,unknown)).status,'awaiting_device');
    const probe=records.parseIopWebhookRecord({...unknown,id:'qa-inspection',triggerConditions:[{alarmType:3}]});
    await c.query(`INSERT INTO ${schema}.management_gps_webhook_receipts(account_id,event_id,payload) VALUES($1,$2,$3)`,[account,probe.id,JSON.stringify(probe)]);
    assert.equal((await hooks.processIopWebhookReceipt(db,account,probe)).status,'unsupported');
    assert.equal((await c.query(`SELECT count(*)::int AS count FROM ${schema}.management_gps_status_events WHERE gps_device_id=2`)).rows[0].count,0);
    await c.query('SAVEPOINT gps_event_rollback');await records.persistGpsProviderEvents(db,1,[records.gpsAlarmEvent('iopgps',44,(at+5000)/1000,'qa-rollback')],'webhook');await c.query('ROLLBACK TO SAVEPOINT gps_event_rollback');
    assert.equal((await c.query(`SELECT count(*)::int AS count FROM ${schema}.management_gps_status_events`)).rows[0].count,4);
    await c.query(`ALTER TABLE ${schema}.vehicles ENABLE ROW LEVEL SECURITY;CREATE POLICY qa_vehicles ON ${schema}.vehicles FOR SELECT TO himoto_scoped USING(himoto.access_store(COALESCE(current_store_id,store_id)));GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped;GRANT SELECT ON ${schema}.vehicles TO himoto_scoped`);
    await records.persistGpsProviderEvents(db,2,[records.gpsAlarmEvent('iopgps',27,at/1000,'foreign')],'history');
    await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','23',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    assert.equal((await c.query(`SELECT * FROM ${schema}.management_gps_status_events WHERE vehicle_id=2`)).rowCount,0);
    await c.query('SAVEPOINT key_read_denied');await assert.rejects(()=>c.query(`SELECT webhook_cipher FROM ${schema}.management_gps_event_channels`),error=>error.code==='42501');await c.query('ROLLBACK TO SAVEPOINT key_read_denied');
    await c.query('RESET ROLE');await c.query('ROLLBACK');
    checks.push('Real database rollback verifies event replay deduplication, intermediate stop recovery, original times, immutable current state, account-scoped webhook ownership, unknown-device quarantine and branch RLS/secret denial');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().catch(error=>{console.error({name:error.name,code:error.code||null,message:error.message});process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());

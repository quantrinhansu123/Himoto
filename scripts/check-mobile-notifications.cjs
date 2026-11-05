// Isolated PostgreSQL / synthetic FCM transport. No dotenv, external I/O or live accounts.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {NextRequest}=require('next/server'),{load,root}=require('./lib/load-typescript.cjs');
async function run(){
 const arg=process.argv.indexOf('--pglite-path');assert(arg>=0);
 const {PGlite}=require(path.resolve(process.argv[arg+1])),pg=new PGlite(),checks=[];
 const raw={release(){},async query(sql,values){const result=!values&&sql.includes(';')?(await pg.exec(sql)).at(-1):await pg.query(sql,values);return {...result,rowCount:result.rows.length||result.affectedRows||0};}};
 global.himotoPool={connect:async()=>raw,query:raw.query.bind(raw)};
 const db=load(path.join(root,'lib/server/himoto-database'));
 const table=load(path.join(root,'lib/server/management-table'));
 const {dataAccess}=load(path.join(root,'lib/server/access-context'));
 const sessions=load(path.join(root,'lib/server/management-session'));
 const manager={id:7,name:'QA',role:'staff',access_role:'branch_manager',store_id:23,scope_all:false,permissions:['contracts.read','contracts.finalize','vehicles.read','vehicles.receive']};
 const other={...manager,id:8,store_id:24},staff={...manager,access_role:'branch_staff'},none={...manager,access_role:'custom',permissions:[]};
 // Contract due calculations are covered by the real web billing suites. This
 // seam checks that the notification adapter uses that projection and scope.
 table.readManagementTable=async(c,kind,params)=>{
  assert.equal(kind,'contracts');assert.equal(params.get('all'),'1');assert(['due','overdue'].includes(params.get('scope')));
  assert(dataAccess.getStore());
  const rows=(await c.query('SELECT id,contract_number AS code FROM himoto.orders ORDER BY id')).rows;
  return {rows,total:rows.length};
 };
 const api=load(path.join(root,'lib/server/mobile-notifications')),dto=load(path.resolve('shared/mobile-notifications'));
 try{
  await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
   CREATE TABLE himoto.users(id bigint PRIMARY KEY);INSERT INTO himoto.users VALUES(7),(8);
   CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text,kind text);INSERT INTO himoto.stores VALUES(23,'QA Thuê sở hữu','lease_to_own'),(24,'QA khác','rental');
   CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,contract_number text,draft_reference text,order_status text,order_type text,draft_payload jsonb DEFAULT '{}',deleted_at timestamptz);
   INSERT INTO himoto.orders VALUES(101,23,'QA101',NULL,'renting','daily','{}',NULL),(102,24,'QA102',NULL,'renting','ownership','{}',NULL),
    (103,23,'QA103',NULL,'draft','ownership','{}',NULL),(104,23,'QA104',NULL,'renting','ownership','{"management_composer":{"approval":{"at":"2026-11-05"}}}',NULL);
   CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,license text,name text,status text,deleted_at timestamptz);
   INSERT INTO himoto.vehicles VALUES(201,'QA201','Xe QA','in_transit',NULL),(202,'QA202','Xe QA','in_transit',NULL),(203,'QA203','Xe QA','in_transit',NULL),(204,'QA204','Xe QA','in_transit',NULL);
   CREATE TABLE himoto.vehicle_location_events(id bigint PRIMARY KEY,vehicle_id bigint,event_type text,from_store_id bigint,to_store_id bigint,created_by bigint,created_at timestamp DEFAULT now(),ref_type text,ref_id bigint,audit_snapshot jsonb DEFAULT '{}');
   INSERT INTO himoto.vehicle_location_events(id,vehicle_id,event_type,from_store_id,to_store_id) VALUES(301,201,'manual_transfer',24,23),(302,202,'manual_transfer',23,24),(303,203,'manual_transfer',24,23),(304,204,'manual_transfer',24,23);
   UPDATE himoto.vehicle_location_events SET audit_snapshot='{"reconciliation":{"superseded":true}}' WHERE id=304;
   INSERT INTO himoto.vehicle_location_events(id,vehicle_id,event_type,ref_type,ref_id) VALUES(305,203,'manual_transfer_receive','vehicle_location_events',303);
   GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;
   ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY orders_scope ON himoto.orders TO himoto_scoped USING(current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
   CREATE TABLE himoto.management_mobile_sessions(id uuid PRIMARY KEY,user_id bigint NOT NULL,password_version integer,token_hash char(64),expires_at timestamptz,revoked_at timestamptz);`);
  const a=await api.readMobileNotifications(manager);assert(dto.isMobileNotifications(a));
  assert.deepEqual(a.groups.map(g=>[g.kind,g.count]),[['transfer',1],['due',3],['overdue',3],['approval',1]]);
  const b=await api.readMobileNotifications(other);assert.equal(b.groups.find(g=>g.kind==='transfer').count,1);assert.equal(b.groups.find(g=>g.kind==='approval').count,1);
  assert(!(await api.readMobileNotifications(staff)).groups.some(g=>g.kind==='approval'));
  // The actual web permission model grants fleet read/receive to every signed-in
  // account, including a custom account without contract grants. Preserve it.
  assert.deepEqual((await api.readMobileNotifications(none)).groups,[{kind:'transfer',count:1}]);
  const list=await api.readMobileNotificationList(manager,'approval',new URLSearchParams());assert(dto.isMobileNotificationList(list));assert.deepEqual(list.rows,[{id:101,label:'QA101'}]);
  const transfer=await api.readMobileNotificationList(manager,'transfer',new URLSearchParams());assert.equal(transfer.rows[0].id,201);
  await assert.rejects(()=>api.readMobileNotificationList(none,'approval',new URLSearchParams()),e=>e.status===403);
  await assert.rejects(()=>api.readMobileNotificationList(manager,'bad',new URLSearchParams()),e=>e.status===404);
  checks.push('Real scoped SQL: destination branch only, resolved/superseded transfers excluded; actual web approval helper and contract reader delegation; accounts without contract grants receive only the fleet group granted by web');
  const sql=fs.readFileSync(path.resolve('docs/sql/2026-11-05-mobile-push.sql'),'utf8');await pg.exec(sql);await pg.exec(sql);
  await pg.exec(`CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint $$;
    CREATE TABLE himoto.transactions(id bigint PRIMARY KEY,order_id bigint,store_id bigint,status text,type text,name text);`);
  await pg.exec(fs.readFileSync(path.resolve('docs/sql/2026-11-05-mobile-activity-events.sql'),'utf8'));
  for(const role of ['anon','authenticated','himoto_scoped']){
   const privileges=(await pg.query(`SELECT has_table_privilege($1,'himoto.management_mobile_push_devices','SELECT') AS devices,has_table_privilege($1,'himoto.management_mobile_push_deliveries','SELECT') AS deliveries`,[role])).rows[0];assert.deepEqual(privileges,{devices:false,deliveries:false});
  }
  process.env.HIMOTO_MOBILE_ENABLED='true';process.env.HIMOTO_MOBILE_PUSH_ENABLED='true';
  Object.assign(process.env,{GCP_PROJECT_ID:'himoto-offline',GCP_PROJECT_NUMBER:'123456789',GCP_SERVICE_ACCOUNT_EMAIL:'himoto-fcm@himoto-offline.iam.gserviceaccount.com',GCP_WORKLOAD_IDENTITY_POOL_ID:'himoto-test',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'vercel-prod'});
  const fcm=load(path.join(root,'lib/server/mobile-push-fcm'));assert(fcm.mobilePushConfigured());
  let provider='sent',sends=0;
  global.fetch=async(url,init)=>{
   if(url==='https://sts.googleapis.com/v1/token'){
    const request=JSON.parse(init.body);assert.equal(request.subjectToken,'offline-synthetic-oidc');assert.equal(request.audience,'//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/himoto-test/providers/vercel-prod');assert(!('Authorization' in init.headers));
    return {ok:true,json:async()=>({access_token:'offline-federated-token',expires_in:3600})};
   }
   if(url.startsWith('https://iamcredentials.googleapis.com/')){
    assert.equal(init.headers.Authorization,'Bearer offline-federated-token');assert.deepEqual(JSON.parse(init.body).scope,['https://www.googleapis.com/auth/firebase.messaging']);assert.equal(JSON.parse(init.body).lifetime,'600s');
    return {ok:true,json:async()=>({accessToken:'offline-synthetic-access',expireTime:new Date(Date.now()+600000).toISOString()})};
   }
   assert.equal(url,'https://fcm.googleapis.com/v1/projects/himoto-offline/messages:send');sends++;
   const msg=JSON.parse(init.body).message;assert.deepEqual(Object.keys(msg.data).sort(),['kind','screen']);assert.equal(msg.android.notification.visibility,'PRIVATE');
   assert(!JSON.stringify(msg).includes('QA101'));assert(!JSON.stringify(msg).includes('customer'));
   if(provider==='unknown')throw Error('Synthetic lost response');
   return {ok:provider==='sent',status:provider==='sent'?200:provider==='failed'?400:404,json:async()=>provider==='sent'?{name:'projects/offline/messages/1'}:provider==='failed'?{error:{}}:{error:{details:[{errorCode:'UNREGISTERED'}]}}};
  };
  const c={projectId:'himoto-offline',projectNumber:'123456789',serviceAccount:'himoto-fcm@himoto-offline.iam.gserviceaccount.com',pool:'himoto-test',provider:'vercel-prod'};
  assert.equal(await fcm.federatedFcmToken(c,async()=>'offline-synthetic-oidc'),'offline-synthetic-access');
  assert.equal(await fcm.sendMobilePush('synthetic-device-token-123','transfer'),'sent');
  provider='invalid';assert.equal(await fcm.sendMobilePush('synthetic-device-token-123','transfer'),'invalid');provider='sent';
  checks.push('Additive migration reruns safely; credential tables deny every scoped/client role; keyless Vercel OIDC → Google STS → 600s FCM-only impersonation, generic/private payload and UNREGISTERED handling use synthetic transport only');
  const push=load(path.join(root,'lib/server/mobile-push'));
  sessions.sessionUserById=async id=>id===7?manager:other;
  const sid=randomUUID();await pg.query("INSERT INTO himoto.management_mobile_sessions VALUES($1,7,0,$2,now()+interval '1 day',NULL)",[sid,'a'.repeat(64)]);
  const req=token=>new NextRequest('https://fixture.invalid/notifications/device',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  await push.registerMobilePush(req('synthetic-device-token-123'),7,sid);assert((await push.readMobilePushStatus(sid)).enabled);
  const before=sends;let result=await push.dispatchMobilePush();assert.equal(result.checked,1);assert.equal(result.sent,4);assert.equal(sends,before+4);
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");await push.dispatchMobilePush();assert.equal(sends,before+4);
  await pg.query("UPDATE himoto.orders SET draft_payload=$1 WHERE id=101",[{management_composer:{approval:{at:'2026-11-05'}}}]);
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");await push.dispatchMobilePush();assert.equal(sends,before+4);
  await push.disableMobilePush(sid);assert.equal((await push.readMobilePushStatus(sid)).enabled,false);await push.dispatchMobilePush();assert.equal(sends,before+4);
  await push.registerMobilePush(req('synthetic-device-token-123'),7,sid);
  await pg.query('UPDATE himoto.management_mobile_sessions SET revoked_at=now() WHERE id=$1',[sid]);
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");await push.dispatchMobilePush();assert.equal(sends,before+4);assert.equal((await push.readMobilePushStatus(sid)).enabled,false);
  checks.push('Actual SQL registration/leases/state/delivery: first work sends, unchanged state does not repeat, resolved work/opt-out/revoked session never sends');
  const otherSession=randomUUID();await pg.query("INSERT INTO himoto.management_mobile_sessions VALUES($1,8,0,$2,now()+interval '1 day',NULL)",[otherSession,'b'.repeat(64)]);
  await push.registerMobilePush(req('synthetic-device-token-123'),8,otherSession);
  assert.equal((await push.readMobilePushStatus(sid)).enabled,false);assert((await push.readMobilePushStatus(otherSession)).enabled);
  provider='unknown';const beforeUnknown=sends;await push.dispatchMobilePush();assert.equal(sends,beforeUnknown+4);
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");await push.dispatchMobilePush();assert.equal(sends,beforeUnknown+4);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM himoto.management_mobile_push_deliveries WHERE outcome='unknown'")).rows[0].n,4);
  provider='invalid';await push.registerMobilePush(req('synthetic-device-token-other'),8,otherSession);await push.dispatchMobilePush();
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM himoto.management_mobile_push_devices WHERE enabled AND token='synthetic-device-token-other'")).rows[0].n,0);
  provider='sent';const activitySession=randomUUID();
  await pg.query("INSERT INTO himoto.management_mobile_sessions VALUES($1,7,0,$2,now()+interval '1 day',NULL)",[activitySession,'c'.repeat(64)]);
  const activityRequest=new NextRequest('https://fixture.invalid/notifications/device',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'synthetic-activity-device-123',activity:true})});
  await push.registerMobilePush(activityRequest,7,activitySession);
  await pg.exec("UPDATE himoto.orders SET order_status='renting' WHERE id=103");
  await pg.exec("INSERT INTO himoto.transactions VALUES(1,103,23,'approved','in','order:payment')");
  await push.dispatchMobilePush();
  const activityRows=(await pg.query(`SELECT e.kind,d.outcome FROM himoto.management_mobile_activity_deliveries d
    JOIN himoto.management_mobile_activity_events e ON e.id=d.event_id ORDER BY e.id`)).rows;
  assert.deepEqual(activityRows,[{kind:'contract_created',outcome:'sent'}]);
  const sendsAfterActivity=sends;
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");
  await push.dispatchMobilePush();assert.equal(sends,sendsAfterActivity);
  provider='unknown';
  await pg.exec("UPDATE himoto.orders SET draft_payload='{\"management_composer\":{\"versions\":[{\"kind\":\"renewal\",\"version\":2}]}}' WHERE id=103");
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");
  await push.dispatchMobilePush();
  assert.equal((await pg.query("SELECT count(*)::int n FROM himoto.management_mobile_activity_deliveries WHERE outcome='unknown'")).rows[0].n,1);
  const sendsAfterUnknown=sends;
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");
  await push.dispatchMobilePush();assert.equal(sends,sendsAfterUnknown);
  provider='sent';
  await push.registerMobilePush(req('synthetic-activity-device-123'),7,activitySession);
  await pg.exec("UPDATE himoto.orders SET draft_payload='{\"management_composer\":{\"versions\":[{\"kind\":\"renewal\",\"version\":2},{\"kind\":\"renewal\",\"version\":3}]}}' WHERE id=103");
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");
  await push.dispatchMobilePush();
  assert.equal((await pg.query("SELECT count(*)::int n FROM himoto.management_mobile_activity_deliveries WHERE outcome='sent'")).rows[0].n,1);
  const upgradedRequest=new NextRequest('https://fixture.invalid/notifications/device',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'synthetic-activity-device-123',activity:true})});
  await push.registerMobilePush(upgradedRequest,7,activitySession);
  await pg.exec("UPDATE himoto.orders SET draft_payload='{\"management_composer\":{\"versions\":[{\"kind\":\"renewal\",\"version\":2},{\"kind\":\"renewal\",\"version\":3},{\"kind\":\"renewal\",\"version\":4}]}}' WHERE id=103");
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");
  let scopeReads=0;sessions.sessionUserById=async id=>id===7?(++scopeReads===1?manager:{...manager,permissions:['vehicles.read']}):other;
  await push.dispatchMobilePush();
  assert.equal((await pg.query("SELECT count(*)::int n FROM himoto.management_mobile_activity_deliveries d JOIN himoto.management_mobile_activity_events e ON e.id=d.event_id WHERE e.event_key='renewal:103:4'")).rows[0].n,0);
  sessions.sessionUserById=async id=>id===7?manager:other;
  await pg.exec("UPDATE himoto.management_mobile_push_devices SET checked_at=now()-interval '10 minutes'");
  await push.dispatchMobilePush();
  assert.equal((await pg.query("SELECT count(*)::int n FROM himoto.management_mobile_activity_deliveries d JOIN himoto.management_mobile_activity_events e ON e.id=d.event_id WHERE e.event_key='renewal:103:4' AND d.outcome='sent'")).rows[0].n,1);
  checks.push('Activity-capable devices receive scoped committed events once; unknown sends are not blindly repeated, payment requires finance permission and legacy registration does not opt in');
  const testRequest=body=>new NextRequest('https://fixture.invalid/notifications/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const testSends=sends;assert.deepEqual(await push.testMobilePush(testRequest({}),7,activitySession),{outcome:'sent'});assert.equal(sends,testSends+1);
  await assert.rejects(()=>push.testMobilePush(testRequest({}),7,activitySession),e=>e.code==='PUSH_TEST_LIMIT');
  await assert.rejects(()=>push.testMobilePush(testRequest({}),8,activitySession),e=>e.code==='PUSH_TEST_LIMIT');
  await assert.rejects(()=>push.testMobilePush(testRequest({token:'foreign-device'}),7,activitySession),e=>e.status===400);
  assert.equal(sends,testSends+1);checks.push('Self-test targets only the current actor/session device, refuses injected recipients and rate-limits repeated sends without business writes');
  process.env.HIMOTO_MOBILE_ENABLED='false';assert.equal(fcm.mobilePushConfigured(),false);await push.dispatchMobilePush();
  checks.push('Changing account rebinds one device without keeping the prior session subscription; lost provider responses retain original fingerprints with no blind resend; invalid tokens and disabled mobile gate stop dispatch');
  const argOut=process.argv.indexOf('--output');const report={ok:true,groups:checks,productionWrites:0,externalPushMessages:0};
  if(argOut>=0){const out=path.resolve(process.argv[argOut+1]);assert(out.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
  console.log(JSON.stringify(report,null,2));
 }finally{delete process.env.HIMOTO_FCM_SERVICE_ACCOUNT_JSON;delete process.env.HIMOTO_MOBILE_PUSH_ENABLED;await pg.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});

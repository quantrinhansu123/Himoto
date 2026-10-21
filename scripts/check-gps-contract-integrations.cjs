const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const shared=load(path.join(root,'lib/management/gps'));
const providers=load(path.join(root,'lib/server/gps-providers'));
const crypto=load(path.join(root,'lib/server/integration-secrets'));
const {persistGpsObservations,claimGpsAccounts,finishGpsAccount}=load(path.join(root,'lib/server/gps-sync'));
const notices=load(path.join(root,'lib/server/contract-notifications'));
const {parsePhotoTarget,requireContractPhotoSlot}=load(path.join(root,'lib/server/record-photos'));
const {requestPermission}=load(path.join(root,'lib/server/access-request'));
const {validIntegrationWorker,integrationWorkerToken}=load(path.join(root,'lib/server/integration-worker-auth'));
const pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const checks=[];
async function main(){
  const now=Date.now(),raw={imei:'QA-GPS-1',devicename:'29B1-123.45',carnumber:'',hearttime:now,gpstime:now,lat:21,lng:105,speed:30,accstatus:1};
  assert.equal(shared.GPS_POLL_INTERVAL_MS,5000);
  assert(providers.shouldRefreshGpsSession(new providers.GpsProviderError('HTTP_401')));assert(providers.shouldRefreshGpsSession(new providers.GpsProviderError('INVALID_RESPONSE')));assert(!providers.shouldRefreshGpsSession(new providers.GpsProviderError('HTTP_429')));assert(!providers.shouldRefreshGpsSession(new providers.GpsProviderError('PROTRACK_READ_10009')));
  assert.equal(providers.normalizeProtrackDevice(raw,now).state,'online');assert.equal(providers.normalizeProtrackDevice({...raw,speed:0},now).state,'stopped');assert.equal(providers.normalizeProtrackDevice({...raw,hearttime:now-1500001},now).state,'offline');assert.equal(providers.normalizeProtrackDevice({...raw,block:true},now).state,'warning');
  assert.equal(providers.normalizeIopDevice({imei:'QA',deviceStatusBean:{status:1,speed:0}}).state,'online');assert.equal(providers.normalizeIopDevice({imei:'QA',deviceStatusBean:{status:0,speed:30}}).state,'stopped');assert.equal(providers.normalizeIopDevice({imei:'QA',deviceStatusBean:{status:10,speed:30}}).state,'offline');assert.equal(providers.normalizeIopDevice({imei:'QA'}).state,'warning');
  assert.equal(providers.normalizeProtrackDevice({...raw,gpstime:1e100,hearttime:'invalid'},now).recorded_at,null);
  const vehicles=[{id:1,license:'29B1-123.45'},{id:2,license:'29B1-12345'}];assert.equal(shared.matchingGpsVehicles('29B1-123.45','',vehicles).length,2);
  assert.equal(shared.matchingGpsVehicles('GPS 29B1-123.45','',vehicles.slice(0,1)).length,1);assert.equal(shared.matchingGpsVehicles('Unrecognized','',vehicles).length,0);
  assert.equal(shared.displayedGpsState('online',new Date(now-700000).toISOString(),now),'stale');assert.equal(shared.displayedGpsState('stopped',new Date(now).toISOString(),now),'stopped');
  const sealed=crypto.sealIntegrationSecret({password:'QA-only-secret'});assert(!sealed.includes('QA-only-secret'));assert.deepEqual(crypto.openIntegrationSecret(sealed),{password:'QA-only-secret'});assert.notEqual(sealed,crypto.sealIntegrationSecret({password:'QA-only-secret'}));assert.throws(()=>crypto.openIntegrationSecret(sealed.slice(0,-10)));
  assert(validIntegrationWorker('Bearer '+integrationWorkerToken()));assert(!validIntegrationWorker('Bearer '+'0'.repeat(64)));assert(!validIntegrationWorker(null));
  checks.push('Provider movement/offline normalization, stale sync distinction, unambiguous plate matching, authenticated encryption and worker authentication');
  const requests=[];
  const fake=async(url,options={})=>{url=new URL(url);requests.push({host:url.hostname,path:url.pathname});
    if(url.pathname==='/')return new Response('',{headers:{'Set-Cookie':'JSESSIONID=qa; Path=/'}});
    if(url.pathname==='/LoginService'){assert.equal(url.searchParams.get('logintype'),'webcustomer');assert(options.headers.Cookie.includes('JSESSIONID'));return Response.json({errorcode:0,customerid:1},{headers:{'Set-Cookie':'token=qa-token; Path=/'}});}
    if(url.pathname==='/LocationService'){assert.equal(url.searchParams.get('fromweb'),'1');return Response.json({errorcode:0,servertime:now,records:[raw]});}
    if(url.pathname==='/login')return Response.json({resultBean:{code:0},accountId:'qa'},{headers:{'Set-Cookie':'USER_TOKEN=qa-token; Path=/'}});
    if(url.pathname==='/rest/device/list'){assert.equal(options.headers.Cookie,'USER_TOKEN=qa-token');return Response.json({data:[{imei:'QA-IOP',deviceStatusBean:{status:1,speed:5}}],page:{count:1}});}
    throw Error('Unexpected provider endpoint');
  };
  for(const provider of ['protrack','iopgps']){const session=await providers.loginGps(provider,'qa-user','qa-password',fake);assert.equal((await providers.readGpsDevices(provider,session,fake)).length,1);}
  assert(requests.every(r=>!(/command|instruction|relay|block/.test(r.path))));
  for(const slot of ['rental-1','rental-6','handover-1','return-101-6','plate-101'])assert.equal(parsePhotoTarget('contracts','1',slot).slot,slot);
  for(const slot of ['rental-0','rental-00','return-0-1','return-1-00','rental-video-4','../x'])assert.throws(()=>parsePhotoTarget('contracts','1',slot));
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/return-101-1','PUT'),'contracts.return');assert.equal(requestPermission('/api/auth/record-photos/contracts/1/handover-1','PUT'),'contracts.finalize');
  checks.push('Both provider login/read protocols use only read endpoints; transaction photo slots and return/handover permissions are validated');
  const c=await pool.connect(),schema='qa_gps_contract_integration';
  const db={query(sql,params){assert(!/\b(?:DELETE|UPDATE|INSERT)\b.*himoto\./i.test(sql.replaceAll('himoto.','qa_gps_contract_integration.')));return c.query(sql.replaceAll('himoto.',schema+'.'),params);}};
  try{
    await c.query('BEGIN');await c.query('CREATE SCHEMA '+schema);
    const tables=['orders','stores','users','customers','vehicles','vehicle_location_events','order_vehicle_details','gps_devices','gps_positions','management_record_photos','transactions','management_contract_payments','staff_profiles'];
    for(const table of tables){await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING ALL)`);const has=(await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='id'",[schema,table])).rowCount;if(has){await c.query(`ALTER TABLE ${schema}.${table} ALTER COLUMN id DROP DEFAULT`);await c.query(`ALTER TABLE ${schema}.${table} ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY`);}}
    const evidence=fs.readFileSync('docs/sql/2026-10-18-gps-status-evidence.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(evidence);await c.query(evidence);
    let migration=fs.readFileSync(path.resolve('docs/sql/2026-10-17-gps-contract-telegram.sql'),'utf8').replaceAll('himoto.',schema+'.').replaceAll(schema+'.access_store','himoto.access_store').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');await c.query(migration);await c.query(migration);
    const controls=fs.readFileSync(path.resolve('docs/sql/2026-10-18-contract-telegram-controls.sql'),'utf8').replaceAll('himoto.',schema+'.').replaceAll(schema+'.access_store','himoto.access_store').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');await c.query(controls);await c.query(controls);
    const deliveryReview=fs.readFileSync(path.resolve('docs/sql/2026-10-18-telegram-delivery-review.sql'),'utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(deliveryReview);await c.query(deliveryReview);
    const mediaMigration=fs.readFileSync(path.resolve('docs/sql/2026-10-18-international-customers-contract-media.sql'),'utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');await c.query(mediaMigration);await c.query(mediaMigration);
    const documentMigration=fs.readFileSync(path.resolve('docs/sql/2026-10-18-contract-document-photos.sql'),'utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');await c.query(documentMigration);await c.query(documentMigration);
    const batteryMigration=fs.readFileSync('docs/sql/2026-10-18-battery-swap-workflow.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(batteryMigration);
    const finalSubmit=fs.readFileSync('docs/sql/2026-10-18-contract-telegram-final-submit.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(finalSubmit);await c.query(finalSubmit);
    const mediaFirst=fs.readFileSync('docs/sql/2026-10-18-telegram-media-first.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(mediaFirst);await c.query(mediaFirst);
    const transferPhotos=fs.readFileSync('docs/sql/2026-10-19-vehicle-swap-photo.sql','utf8').replaceAll('himoto.',schema+'.').replaceAll(schema+'.access_store','himoto.access_store').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(transferPhotos);await c.query(transferPhotos);
    const ownershipGroups=fs.readFileSync('docs/sql/2026-10-18-ownership-telegram-groups.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(ownershipGroups);await c.query(ownershipGroups);
    const ownershipTransfers=fs.readFileSync('docs/sql/2026-10-18-ownership-transfer-telegram.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(ownershipTransfers);await c.query(ownershipTransfers);
    const dualTransferTelegram=fs.readFileSync('docs/sql/2026-10-19-transfer-telegram-dual-groups.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(dualTransferTelegram);await c.query(dualTransferTelegram);
    const retractions=fs.readFileSync('docs/sql/2026-10-21-telegram-retractions.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(retractions);await c.query(retractions);
    const pacing=fs.readFileSync(path.resolve('docs/sql/2026-10-17-gps-five-second-poll.sql'),'utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');await c.query(pacing);await c.query(pacing);
    const history=fs.readFileSync(path.resolve('docs/sql/2026-10-17-gps-history-webhooks.sql'),'utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');await c.query(history);await c.query(history);
    await c.query(`INSERT INTO ${schema}.stores(id,store_name) VALUES(23,'Branch A QA'),(31,'Branch B QA')`);
    await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status) VALUES(143,'Actor QA','qa-gps@example.invalid','unused',1,'active')`);
    await c.query(`INSERT INTO ${schema}.vehicles(id,name,brand,type,year,store_id,current_store_id,license,color,status,odometer,created_by) VALUES(101,'Vehicle QA','Honda','xeso',2024,23,23,'29B1-123.45','Black','ready',0,143),(102,'Vehicle B QA','Honda','xeso',2024,31,31,'30B1-999.99','Black','ready',0,143)`);
    await c.query(`INSERT INTO ${schema}.orders(id,contract_number,customer_name,customer_phone,order_status,store_id,total,pid) VALUES(1,'HD-QA-1','Customer QA','0900000001','renting',23,'1000',0),(2,'HD-QA-2','Customer B QA','0900000002','renting',31,'1000',0)`);
    await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES(1001,1,101,now(),now()+interval '1 day')`);
    const observation=providers.normalizeProtrackDevice(raw,now);await persistGpsObservations(db,'protrack',[observation]);
    let gps=(await c.query(`SELECT * FROM ${schema}.gps_devices`)).rows[0];assert.equal(Number(gps.vehicle_id),101);assert.equal(gps.management_status,'online');
    const selected=load(path.join(root,'lib/server/selected-vehicle-gps'));assert.deepEqual(selected.selectedVehicleIds('101,102,101'),[101,102]);for(const invalid of ['', '0', '101,abc',Array(21).fill('101').join(',')])assert.throws(()=>selected.selectedVehicleIds(invalid));
    const gpsRows=await selected.readSelectedVehicleGps(db,[101,102]);assert.equal(gpsRows[0].status,'online');assert.equal(gpsRows[1].status,'none');
    const beforeTuple=(await c.query(`SELECT (SELECT ctid::text FROM ${schema}.gps_devices LIMIT 1) AS device,(SELECT ctid::text FROM ${schema}.gps_positions LIMIT 1) AS position`)).rows[0];
    await persistGpsObservations(db,'protrack',[observation]);assert.equal((await c.query(`SELECT * FROM ${schema}.management_gps_status_events`)).rowCount,1);
    assert.deepEqual((await c.query(`SELECT (SELECT ctid::text FROM ${schema}.gps_devices LIMIT 1) AS device,(SELECT ctid::text FROM ${schema}.gps_positions LIMIT 1) AS position`)).rows[0],beforeTuple);
    await persistGpsObservations(db,'protrack',[{...observation,latitude:21.5,recorded_at:new Date(now+10000).toISOString()}]);assert.equal(Number((await c.query(`SELECT last_latitude FROM ${schema}.gps_devices`)).rows[0].last_latitude),21.5);assert.equal((await c.query(`SELECT * FROM ${schema}.gps_positions`)).rowCount,1);
    await persistGpsObservations(db,'protrack',[{...observation,state:'stopped',speed:0}]);assert.equal((await c.query(`SELECT * FROM ${schema}.management_gps_status_events`)).rowCount,2);assert.equal((await c.query(`SELECT * FROM ${schema}.gps_positions`)).rowCount,1);
    await c.query(`UPDATE ${schema}.gps_devices SET vehicle_id=NULL,mapping_status='manual_unmapped'`);await persistGpsObservations(db,'protrack',[observation]);assert.equal((await c.query(`SELECT vehicle_id FROM ${schema}.gps_devices`)).rows[0].vehicle_id,null);
    assert.equal((await c.query(`SELECT status FROM ${schema}.vehicles WHERE id=101`)).rows[0].status,'ready');
    checks.push('Bulk GPS upsert maps exact plates, preserves manual unlinking and operational vehicle status, deduplicates positions and records only state transitions');
    const accountId='00000000-0000-4000-8000-000000000001',leaseA='00000000-0000-4000-8000-000000000002',leaseB='00000000-0000-4000-8000-000000000003';
    await c.query(`INSERT INTO ${schema}.management_gps_accounts(id,provider,label,username,secret_cipher) VALUES($1,'protrack','QA account','qa-only',$2)`,[accountId,sealed]);
    assert.equal((await claimGpsAccounts(db,leaseA)).length,1);assert.equal((await claimGpsAccounts(db,leaseB)).length,0);
    await c.query(`UPDATE ${schema}.management_gps_accounts SET last_attempt_at=clock_timestamp()-interval '10 seconds'`);assert.equal((await claimGpsAccounts(db,leaseB)).length,0);
    assert.equal((await finishGpsAccount(db,accountId,leaseB,1)).rowCount,0);assert.equal((await finishGpsAccount(db,accountId,leaseA,1)).rowCount,1);
    assert.equal((await claimGpsAccounts(db,leaseB)).length,1);await finishGpsAccount(db,accountId,leaseB,0,'HTTP_429');
    await c.query(`UPDATE ${schema}.management_gps_accounts SET last_attempt_at=clock_timestamp()-interval '10 seconds'`);assert.equal((await claimGpsAccounts(db,leaseA)).length,0);
    await c.query(`UPDATE ${schema}.management_gps_accounts SET next_attempt_at=clock_timestamp()-interval '1 second'`);assert.equal((await claimGpsAccounts(db,leaseA)).length,1);await finishGpsAccount(db,accountId,leaseA,1);
    checks.push('Five-second pacing prevents overlapping account reads, rejects stale lease completions, backs off provider failures and avoids rewriting unchanged GPS rows');
    checks.push(await require('./lib/check-gps-device-visibility.cjs')(db,c,schema,accountId,observation));
    await assert.rejects(()=>requireContractPhotoSlot(db,'contracts',2,'return-1001-1'),e=>e.status===404);
    const photo=Buffer.from([255,216,255,224,1,2]);
    await c.query(`INSERT INTO ${schema}.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',1,'rental-1','image/jpeg',$1,143),('contracts',1,'rental-2','image/jpeg',$2,143)`,[photo,Buffer.from([255,216,255,224,1,3])]);
    await notices.queueContractNotification(db,1,'rental','qa-no-bot',143,'rental');await notices.queueContractNotification(db,1,'rental','qa-no-bot',143,'rental');
    assert.equal((await c.query(`SELECT * FROM ${schema}.management_contract_notifications`)).rowCount,1);
    assert.equal((await notices.dispatchContractNotifications(fake,5,db)).configured,false);
    const token='123456789:qa-only-bot-token-123456789';await c.query(`UPDATE ${schema}.management_telegram_settings SET bot_cipher=$1`,[crypto.sealIntegrationSecret({token})]);await c.query(`INSERT INTO ${schema}.management_store_telegram(store_id,chat_id,enabled) VALUES(23,'-100000000001',true),(31,'-100000000002',true)`);
    if(process.argv.includes('--retractions-only')) {
      checks.push(...await require('./lib/check-telegram-retractions.cjs')(db,c,schema));
    } else if(process.argv.includes('--telegram-controls-only')) {
      checks.push(...await require('./lib/check-contract-telegram.cjs')(db,c,schema,notices));
    } else if(process.argv.includes('--ownership-only')) {
      checks.push(...await require('./lib/check-ownership-telegram.cjs')(db,c,schema,notices));
    } else {
    await notices.queueContractNotification(db,1,'rental','qa-ready',143,'rental');
    const calls=[];const telegram=async(url,options)=>{const method=new URL(url).pathname.split('/').at(-1);const form=options.body instanceof FormData;const chat=form?options.body.get('chat_id'):JSON.parse(options.body).chat_id;assert.equal(chat,'-100000000001');calls.push(method);return Response.json({ok:true,result:method==='sendMediaGroup'?[{message_id:2},{message_id:3}]:{message_id:1}});};
    assert.equal((await notices.dispatchContractNotifications(telegram,5,db)).sent,0);assert.equal(calls.length,0);
    const service=load(path.join(root,'lib/server/contract-telegram')),admin={access_role:'admin'};
    const confirm=async key=>{const event=(await service.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key===key);await service.saveContractTelegram(db,1,143,admin,{action:'send',event_key:key,hash:event.hash,request_id:require('node:crypto').randomUUID()});};
    await confirm('qa-ready');
    const delivered=await notices.dispatchContractNotifications(telegram,5,db);assert.equal(delivered.sent,1);assert.deepEqual(calls,['sendMediaGroup','sendMessage']);
    assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE event_key='qa-no-bot'`)).rows[0].status,'manual');
    await notices.dispatchContractNotifications(telegram,5,db);assert.equal(calls.length,2);
    await notices.queueContractNotification(db,1,'rental','qa-uncertain',143,'rental');await c.query(`UPDATE ${schema}.management_record_photos SET data=data||decode('04','hex') WHERE entity_type='contracts' AND entity_id=1 AND slot='rental-1'`);await confirm('qa-uncertain');let attempts=0;await notices.dispatchContractNotifications(async()=>{attempts++;throw Error('Network uncertainty');},5,db);await notices.dispatchContractNotifications(telegram,5,db);assert.equal(attempts,1);assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE root_event_key='qa-uncertain' AND delivery_mode='manual'`)).rows[0].status,'unknown');
    checks.push('Notification outbox deduplicates events, waits without a bot, sends text and immutable photos to the correct branch, and never auto retries uncertain sends or historical waiting messages');
    await c.query('SAVEPOINT rollback_event');await notices.queueContractNotification(db,1,'return','qa-rolled-back',143,'return-1001');await c.query('ROLLBACK TO SAVEPOINT rollback_event');assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE event_key='qa-rolled-back'`)).rowCount,0);
    checks.push(...await require('./lib/check-contract-telegram.cjs')(db,c,schema,notices));
    checks.push(...await require('./check-contract-documents.cjs')(db,c,schema,notices));
    checks.push(...await require('./lib/check-telegram-media-first.cjs')(db,c,schema,notices));
    checks.push(...await require('./lib/check-ownership-telegram.cjs')(db,c,schema,notices));
    checks.push(...await require('./lib/check-telegram-retractions.cjs')(db,c,schema));
    checks.push(...await require('./lib/check-gps-status-parity.cjs')(db,c,schema));
    await c.query(`ALTER TABLE ${schema}.vehicles ENABLE ROW LEVEL SECURITY; CREATE POLICY qa_vehicle_read ON ${schema}.vehicles FOR SELECT TO himoto_scoped USING(himoto.access_store(COALESCE(current_store_id,store_id)))`);
    await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped; GRANT SELECT ON ${schema}.vehicles,${schema}.orders,${schema}.gps_devices TO himoto_scoped; GRANT UPDATE ON ${schema}.orders TO himoto_scoped`);
    await c.query(`GRANT SELECT ON ${schema}.management_contract_payments,${schema}.order_vehicle_details,${schema}.transactions,${schema}.stores,${schema}.customers,${schema}.management_record_photos,${schema}.staff_profiles TO himoto_scoped;GRANT SELECT(id,name) ON ${schema}.users TO himoto_scoped`);
    await notices.queueContractNotification(db,2,'rental','qa-foreign',143,'rental');
    await notices.queueContractNotification(db,1,'renewal','qa-branch-retry',143,'renewal-2');await confirm('qa-branch-retry');await notices.dispatchContractNotifications(async()=>{throw Error('QA network interruption');},1,db,[1]);
    await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','23',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE store_id=31`)).rowCount,0);
    assert.deepEqual((await selected.readSelectedVehicleGps(db,[101,102])).map(row=>row.vehicle_id),[101]);
    const retryService=load(path.join(root,'lib/server/contract-telegram')),operator={permissions:['contracts.renew']};
    const retryNotice=(await retryService.readContractTelegram(db,1,143,operator)).state.events.find(event=>event.key==='qa-branch-retry');assert(retryNotice.can_retry_confirmed_absent);
    await retryService.saveContractTelegram(db,1,143,operator,{action:'retry_confirmed_absent',event_key:retryNotice.key,hash:retryNotice.hash,notice_id:retryNotice.notice_id,confirmed_absent:true,request_id:require('node:crypto').randomUUID()});
    assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[retryNotice.notice_id])).rows[0].status,'failed');
    await c.query('SAVEPOINT denied_notice_payload');await assert.rejects(()=>c.query(`UPDATE ${schema}.management_contract_notifications SET payload='{}' WHERE id=$1`,[retryNotice.notice_id]),error=>error.code==='42501');await c.query('ROLLBACK TO SAVEPOINT denied_notice_payload');
    assert.equal((await c.query(`SELECT auto_enabled FROM ${schema}.management_contract_telegram_preferences WHERE order_id=1`)).rows[0].auto_enabled,false);
    await c.query('SAVEPOINT deny_foreign_preference');
    await assert.rejects(()=>c.query(`INSERT INTO ${schema}.management_contract_telegram_preferences(order_id,store_id,auto_enabled,updated_by) VALUES(2,31,false,143)`),e=>e.code==='42501');
    await c.query('ROLLBACK TO SAVEPOINT deny_foreign_preference');
    await c.query('SAVEPOINT deny_secret');await assert.rejects(()=>c.query(`SELECT secret_cipher FROM ${schema}.management_gps_accounts`),e=>e.code==='42501');await c.query('ROLLBACK TO SAVEPOINT deny_secret');
    await c.query('RESET ROLE');checks.push('Migrations run twice, rolled-back transactions leave no notification, branch RLS hides foreign reports, and provider credentials remain inaccessible to the application role');
    }
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0,realTelegramRequests:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

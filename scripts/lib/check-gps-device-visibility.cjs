const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./load-typescript.cjs');
const {syncGpsEventHistory}=load(path.join(root,'lib/server/gps-history-sync'));
const {persistGpsObservations}=load(path.join(root,'lib/server/gps-sync'));
const {sealIntegrationSecret}=load(path.join(root,'lib/server/integration-secrets'));
const {displayedGpsState}=load(path.join(root,'lib/management/gps'));
const {resolveLocationStatus}=load(path.join(root,'lib/management/config'));
module.exports=async function checkGpsDeviceVisibility(db,c,schema,accountId,observation){
  observation={...observation,provider_device_id:'1234'};
  const accountB='00000000-0000-4000-8000-000000000022';
  await c.query(`UPDATE ${schema}.management_gps_accounts SET session_cipher=$2,session_expires_at=now()+interval '1 hour',last_success_at=now(),next_attempt_at=NULL WHERE id=$1`,[accountId,sealIntegrationSecret({token:'qa-session',accountId:'qa-account'})]);
  await c.query(`INSERT INTO ${schema}.management_gps_event_channels(account_id,motion_enabled) VALUES($1,true) ON CONFLICT(account_id) DO UPDATE SET motion_enabled=true`,[accountId]);
  await persistGpsObservations(db,'protrack',[observation],accountId);
  const before=(await c.query(`SELECT id,management_status,sync_received_at,vehicle_id,mapping_status FROM ${schema}.gps_devices LIMIT 1`)).rows[0];
  await c.query(`INSERT INTO ${schema}.management_gps_history_cursors(gps_device_id,stream,account_id,coverage_started_at,covered_until,last_error,records_received)
    VALUES($1,'motion',$2,now()-interval '1 hour',now()-interval '1 hour','HISTORY_PROTRACK_10007',7)`,[before.id,accountId]);
  const checkpoint=(await c.query(`SELECT covered_until FROM ${schema}.management_gps_history_cursors WHERE gps_device_id=$1`,[before.id])).rows[0].covered_until;
  const journalBefore=(await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_gps_status_events`)).rows[0].n;
  await persistGpsObservations(db,'protrack',[],accountId);
  const missing=(await c.query(`SELECT * FROM ${schema}.gps_devices WHERE id=$1`,[before.id])).rows[0];
  assert.equal(missing.provider_status,'not_visible_in_account');assert.equal(missing.management_status,before.management_status);
  assert.equal(String(missing.sync_received_at),String(before.sync_received_at));assert.equal(missing.mapping_status,before.mapping_status);
  assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_gps_status_events`)).rows[0].n,journalBefore);
  const nested={...db,async connect(){return{async query(sql,params){if(sql==='BEGIN')return c.query('SAVEPOINT gps_history_visibility');if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT gps_history_visibility');if(sql==='ROLLBACK'){await c.query('ROLLBACK TO SAVEPOINT gps_history_visibility');return c.query('RELEASE SAVEPOINT gps_history_visibility');}return db.query(sql,params);},release(){}};}};
  let requests=0,firstStart;
  const send=async input=>{requests++;const url=new URL(input);assert.equal(url.searchParams.get('method'),'playback');firstStart=Number(url.searchParams.get('begintime'));return Response.json({errorcode:0,record:''});};
  assert.equal((await syncGpsEventHistory(1,18000,nested,send)).attempted,0);assert.equal(requests,0);
  assert.equal(String((await c.query(`SELECT covered_until FROM ${schema}.management_gps_history_cursors WHERE gps_device_id=$1`,[before.id])).rows[0].covered_until),String(checkpoint));
  await persistGpsObservations(db,'protrack',[observation],accountId);
  assert.equal((await syncGpsEventHistory(1,18000,nested,send)).succeeded,1);assert.equal(requests,1);assert(firstStart<=new Date(checkpoint).getTime());
  const resumed=(await c.query(`SELECT covered_until,last_error,records_received FROM ${schema}.management_gps_history_cursors WHERE gps_device_id=$1`,[before.id])).rows[0];
  assert(new Date(resumed.covered_until)>new Date(checkpoint));assert.equal(resumed.last_error,null);assert.equal(Number(resumed.records_received),7);
  await c.query(`INSERT INTO ${schema}.management_gps_accounts(id,provider,label,username,secret_cipher,session_cipher,session_expires_at,last_success_at)
    VALUES($1,'protrack','QA moved','qa-moved','unused',$2,now()+interval '1 hour',now());`,[accountB,sealIntegrationSecret({token:'qa-new-session',accountId:'qa-new-account'})]);
  await c.query(`INSERT INTO ${schema}.management_gps_event_channels(account_id,motion_enabled) VALUES($1,true)`,[accountB]);
  await persistGpsObservations(db,'protrack',[observation],accountB);
  await persistGpsObservations(db,'protrack',[],accountId); // An old account cannot withdraw access supplied by the current one.
  assert.notEqual((await c.query(`SELECT provider_status FROM ${schema}.gps_devices WHERE id=$1`,[before.id])).rows[0].provider_status,'not_visible_in_account');
  await c.query(`UPDATE ${schema}.management_gps_history_cursors SET next_attempt_at=now(),last_attempt_at=NULL WHERE gps_device_id=$1`,[before.id]);
  assert.equal((await syncGpsEventHistory(1,18000,nested,send)).succeeded,1);
  const moved=(await c.query(`SELECT account_id,coverage_started_at,records_received FROM ${schema}.management_gps_history_cursors WHERE gps_device_id=$1`,[before.id])).rows[0];
  assert.equal(moved.account_id,accountB);assert.equal(Number(moved.records_received),7);assert.equal(String(moved.coverage_started_at),String(checkpoint));
  assert.equal(displayedGpsState('unavailable',null),'unavailable');assert.equal(resolveLocationStatus({hasDevice:true,normalizedStatus:'unavailable'}),'unavailable');
  return 'Missing provider devices retain their mapping, journal and checkpoint without fake OFF events; history pauses, resumes on return and follows a changed authorized account';
};

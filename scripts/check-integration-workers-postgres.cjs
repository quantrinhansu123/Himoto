const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const openQa=require('./lib/mobile_postgres_qa.cjs'),{load,root}=require('./lib/load-typescript.cjs');
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r}),resolve:()=>resolve()};};
async function main(){
 const qa=await openQa(),checks=[];process.env.MANAGEMENT_SESSION_SECRET='qa-independent-workers-secret-'.repeat(3);
 try{
  await qa.pool.query(`CREATE SCHEMA himoto;CREATE TABLE himoto.management_gps_event_channels(account_id uuid);
    CREATE TABLE himoto.management_gps_history_cursors(gps_device_id bigint);`);
  await qa.pool.query(fs.readFileSync('docs/sql/2026-11-12-independent-integration-workers.sql','utf8'));
  const{runIntegrationJob}=load(path.join(root,'lib/server/integration-jobs'));
  const entered=deferred(),release=deferred(),skippedDone=deferred();let started=0,skipped=0;
  const runs=Array.from({length:8},()=>runIntegrationJob('gps-live',120000,async()=>{started++;entered.resolve();await release.promise;return{attempted:2};},qa.pool).then(result=>{if(result.busy&&++skipped===7)skippedDone.resolve();return result;}));
  await entered.promise;
  await skippedDone.promise;
  const notifications=await Promise.all(['telegram','push'].map(job=>runIntegrationJob(job,60000,async()=>({done:true}),qa.pool)));
  assert(notifications.every(r=>!r.busy));assert.equal(started,1);
  assert.equal((await qa.observer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n,0);
  release.resolve();const results=await Promise.all(runs);assert.equal(results.filter(r=>r.busy).length,7);
  checks.push('Eight overlapping GPS workers admit one; Telegram and push complete while GPS is blocked; provider work holds no open transaction');
  await assert.rejects(()=>runIntegrationJob('gps-live',1000,async()=>{throw Error('QA provider failure');},qa.pool),/QA provider failure/);
  let state=(await qa.pool.query("SELECT lease_token,last_status FROM himoto.management_integration_workers WHERE job='gps-live'")).rows[0];
  assert.deepEqual(state,{lease_token:null,last_status:'error'});assert(!(await runIntegrationJob('gps-live',1000,async()=>true,qa.pool)).busy);
  checks.push('Failure releases the current lease, records failure and permits a subsequent worker');
  const enteredOld=deferred(),releaseOld=deferred(),enteredNew=deferred(),releaseNew=deferred();
  const old=runIntegrationJob('gps-live',60000,async()=>{enteredOld.resolve();await releaseOld.promise;},qa.pool);await enteredOld.promise;
  await qa.pool.query("UPDATE himoto.management_integration_workers SET lease_until=clock_timestamp()-interval '1 second' WHERE job='gps-live'");
  const next=runIntegrationJob('gps-live',60000,async()=>{enteredNew.resolve();await releaseNew.promise;},qa.pool);await enteredNew.promise;
  const token=(await qa.pool.query("SELECT lease_token FROM himoto.management_integration_workers WHERE job='gps-live'")).rows[0].lease_token;
  releaseOld.resolve();await old;assert.equal((await qa.pool.query("SELECT lease_token FROM himoto.management_integration_workers WHERE job='gps-live'")).rows[0].lease_token,token);
  releaseNew.resolve();await next;
  checks.push('Expired work can be recovered and its late completion cannot clear a newer worker lease');
  const auth=load(path.join(root,'lib/server/integration-worker-auth')),time=String(Math.floor(Date.now()/1000)),nonce=require('node:crypto').randomUUID();
  for(const route of ['/api/cron/integrations','/api/cron/gps-live','/api/cron/gps-history']){
    const proof='Himoto-Scheduler '+time+':'+nonce+':'+auth.integrationSchedulerProof(time,nonce,route);
    assert(auth.validIntegrationWorker(proof,Date.now(),route));assert(!auth.validIntegrationWorker(proof,Date.now()+120000,route));
    assert(!auth.validIntegrationWorker(proof,Date.now(),route==='gps'?'other':route+'/other'));
  }
  assert(!(await qa.pool.query("SELECT has_table_privilege('himoto_scoped','himoto.management_integration_workers','SELECT') AS allowed")).rows[0].allowed);
  checks.push('Signed proofs are bound to their endpoint and expire; scoped clients cannot inspect worker leases');
  console.log(JSON.stringify({passed:checks.length,checks,realProviderRequests:0,realMessages:0,operationalWrites:0},null,2));
 }finally{await qa.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});

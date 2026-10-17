const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const {integrationWorkerToken,validIntegrationWorker,claimIntegrationSchedulerNonce}=load(path.join(root,'lib/server/integration-worker-auth'));
async function main(){
  const c=await db.connect(),schema='qa_cloud_integration_sync';
  try{
    await c.query('BEGIN');await c.query('CREATE SCHEMA '+schema);
    await c.query(`CREATE TABLE ${schema}.management_integration_schedule(LIKE himoto.management_integration_schedule INCLUDING ALL);
      CREATE TABLE ${schema}.http_response(LIKE net._http_response INCLUDING ALL);
      CREATE TABLE ${schema}.management_integration_worker_nonces(LIKE himoto.management_integration_worker_nonces INCLUDING ALL);
      CREATE TABLE ${schema}.secrets(id uuid PRIMARY KEY,decrypted_secret text);
      CREATE TABLE ${schema}.requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,headers jsonb,body jsonb);
      CREATE FUNCTION ${schema}.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$
        INSERT INTO ${schema}.requests(url,headers,body) VALUES(url,headers,body) RETURNING id;
      $$`);
    let source=fs.readFileSync('docs/sql/2026-10-17-cloud-integration-scheduler.sql','utf8');
    source=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION'),source.lastIndexOf('COMMIT;')).replace(/\bhimoto\.(?!vercel)/g,schema+'.').replaceAll('net._http_response',schema+'.http_response').replaceAll('net.http_post',schema+'.http_post').replaceAll('vault.decrypted_secrets',schema+'.secrets').replace('search_path=pg_catalog,himoto,net,vault','search_path=pg_catalog,'+schema);
    await c.query(source);
    const run=async()=>(await c.query(`SELECT ${schema}.run_integration_schedule() AS request_id`)).rows[0].request_id;
    const count=async()=>(await c.query(`SELECT count(*)::int AS n FROM ${schema}.requests`)).rows[0].n;
    const state=async()=>(await c.query(`SELECT * FROM ${schema}.management_integration_schedule`)).rows[0];
    const token=integrationWorkerToken(),secret='00000000-0000-4000-8000-000000000005';
    await c.query(`INSERT INTO ${schema}.secrets VALUES($1,$2);`,[secret,token]);
    await c.query(`INSERT INTO ${schema}.management_integration_schedule(singleton,secret_id) VALUES(true,$1)`,[secret]);
    assert.equal(await run(),null);assert.equal(await count(),0);
    await c.query(`UPDATE ${schema}.management_integration_schedule SET enabled=true`);const first=await run();assert(first);assert.equal(await count(),1);
    assert.equal(await run(),null);assert.equal(await count(),1);
    const request=(await c.query(`SELECT * FROM ${schema}.requests LIMIT 1`)).rows[0];assert.equal(request.url,'https://himoto.vercel.app/api/cron/integrations');assert(!JSON.stringify(request).includes(token));assert(validIntegrationWorker(request.headers.Authorization));assert(!validIntegrationWorker(request.headers.Authorization,Date.now()+120000));
    const nonce=request.headers.Authorization.split(':')[1],isolated={query(sql,params){return c.query(sql.replaceAll('himoto.',schema+'.'),params);}};
    assert(await claimIntegrationSchedulerNonce(isolated,nonce));assert(!await claimIntegrationSchedulerNonce(isolated,nonce));
    await c.query(`INSERT INTO ${schema}.http_response(id,status_code,content) VALUES($1,200,$2)`,[first,JSON.stringify({status:'success',gps:{attempted:4,succeeded:4}})]);
    await c.query(`UPDATE ${schema}.management_integration_schedule SET last_dispatched_at=clock_timestamp()-interval '6 seconds'`);const second=await run();assert(second);assert.equal(await count(),2);assert.equal((await state()).last_error_code,null);
    await c.query(`INSERT INTO ${schema}.http_response(id,status_code,content) VALUES($1,500,'{}')`,[second]);assert.equal(await run(),null);assert.equal((await state()).last_error_code,'HTTP_REJECTED');assert.equal(await run(),null);assert.equal(await count(),2);
    await c.query(`UPDATE ${schema}.management_integration_schedule SET next_attempt_at=clock_timestamp()-interval '1 second',last_dispatched_at=clock_timestamp()-interval '6 seconds'`);const third=await run();assert(third);
    await c.query(`INSERT INTO ${schema}.http_response(id,status_code,content) VALUES($1,401,'{}')`,[third]);assert.equal(await run(),null);assert.equal((await state()).enabled,false);
    await c.query(`UPDATE ${schema}.management_integration_schedule SET enabled=true,secret_id=NULL,next_attempt_at=NULL,last_dispatched_at=clock_timestamp()-interval '6 seconds'`);assert.equal(await run(),null);assert.equal((await state()).last_error_code,'SECRET_MISSING');assert.equal(await count(),3);
    await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped`);await c.query('SET LOCAL ROLE himoto_scoped');
    for(const sql of [`SELECT * FROM ${schema}.management_integration_schedule`,`SELECT ${schema}.run_integration_schedule()`,`SELECT * FROM ${schema}.management_integration_worker_nonces`,'SELECT decrypted_secret FROM vault.decrypted_secrets']){
      await c.query('SAVEPOINT deny_private');await assert.rejects(()=>c.query(sql),error=>error.code==='42501','Expected access denial: '+sql);await c.query('ROLLBACK TO SAVEPOINT deny_private');
    }
    console.log(JSON.stringify({passed:5,checks:['Disabled cloud schedule makes no outbound request','Only one request remains in flight; the fixed endpoint verifies a signed expiring single-use proof without exposing its reusable key in pg_net','Failed requests back off; rejected authentication and missing secrets disable the schedule','Scheduler settings, replay protection and reusable secrets remain inaccessible to application roles','All scheduler tests use a fake HTTP function in a rolled-back schema'],realHttpRequests:0,realBusinessWrites:0,realSequenceChanges:0},null,2));
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
}
main().catch(error=>{console.error({name:error.name,code:error.code||null,message:error.message});process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());

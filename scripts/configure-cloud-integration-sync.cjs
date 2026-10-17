/* Schedule on the existing Supabase project; never prints tokens or request headers. */
const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const {integrationWorkerToken}=load(path.join(root,'lib/server/integration-worker-auth'));
const jobName='himoto-integrations-5s',cleanupName='himoto-integration-log-cleanup';
async function main(){
  const action=process.argv[2];if(!['--prepare','--enable','--disable','--status'].includes(action))throw Error('Use --prepare, --enable, --disable or --status.');
  if(action==='--prepare'){
    for(const file of ['2026-10-17-gps-five-second-poll.sql','2026-10-17-cloud-integration-scheduler.sql'])await db.query(fs.readFileSync(path.resolve(__dirname,'../docs/sql',file),'utf8'));
  }
  if(action==='--prepare'||action==='--enable'){
    const client=await db.connect();
    try{
      await client.query('BEGIN');
      let secret=(await client.query("SELECT id FROM vault.secrets WHERE name='himoto_integrations_worker' LIMIT 1")).rows[0];
      if(secret)await client.query('SELECT vault.update_secret($1::uuid,$2::text)',[secret.id,integrationWorkerToken()]);
      else secret=(await client.query("SELECT vault.create_secret($1::text,'himoto_integrations_worker','HIMOTO integration refresh only') AS id",[integrationWorkerToken()])).rows[0];
      const enabled=action==='--enable';
      await client.query('UPDATE himoto.management_integration_schedule SET secret_id=$1,enabled=$2,last_error_code=NULL,next_attempt_at=NULL,updated_at=clock_timestamp() WHERE singleton=true',[secret.id,enabled]);
      const job=(await client.query('SELECT cron.schedule($1,$2,$3) AS id',[jobName,'5 seconds','SELECT himoto.run_integration_schedule();'])).rows[0];
      await client.query('SELECT cron.alter_job($1,active:=$2)',[job.id,enabled]);
      const cleanup=(await client.query('SELECT cron.schedule($1,$2,$3) AS id',[cleanupName,'17 * * * *',"DELETE FROM cron.job_run_details WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname IN('himoto-integrations-5s','himoto-integration-log-cleanup')) AND end_time<now()-interval '1 day';"])).rows[0];
      await client.query('SELECT cron.alter_job($1,active:=$2)',[cleanup.id,enabled]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  if(action==='--disable'){
    const client=await db.connect();try{await client.query('BEGIN');await client.query('UPDATE himoto.management_integration_schedule SET enabled=false,updated_at=clock_timestamp() WHERE singleton=true');
      for(const job of (await client.query('SELECT jobid FROM cron.job WHERE jobname=ANY($1::text[])',[[jobName,cleanupName]])).rows)await client.query('SELECT cron.alter_job($1,active:=false)',[job.jobid]);await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  const jobs=(await db.query('SELECT jobname,schedule,active FROM cron.job WHERE jobname=ANY($1::text[]) ORDER BY jobname',[[jobName,cleanupName]])).rows;
  const state=(await db.query('SELECT enabled,last_dispatched_at,last_response_at,last_http_status,last_error_code FROM himoto.management_integration_schedule WHERE singleton=true')).rows[0];
  console.log(JSON.stringify({jobs,state,credentialsPrinted:false},null,2));
}
main().catch(error=>{console.error({name:error.name,code:error.code||null});process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());

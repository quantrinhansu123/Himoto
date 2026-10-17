/* Provider credentials and webhook URLs stay on the server; never print them. */
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const {openIntegrationSecret,sealIntegrationSecret}=load(path.join(root,'lib/server/integration-secrets'));
const {readGpsMotionHistory,readGpsAlarmHistory}=load(path.join(root,'lib/server/gps-history-providers'));
const {readIntegrationSettings}=load(path.join(root,'lib/server/integration-settings'));
const {configureIopGpsWebhooks}=load(path.join(root,'lib/server/gps-iop-webhook-registration'));
async function main(){
  const action=process.argv[2];
  if(!['--prepare','--enable-history','--configure-iop-webhooks','--status'].includes(action))throw Error('INVALID_ACTION');
  if(action==='--prepare'){
    await db.query(fs.readFileSync(path.resolve(__dirname,'../docs/sql/2026-10-17-gps-history-webhooks.sql'),'utf8'));
    const accounts=(await db.query("SELECT a.id FROM himoto.management_gps_accounts a JOIN himoto.management_gps_event_channels c ON c.account_id=a.id WHERE a.provider='iopgps' AND c.webhook_cipher IS NULL")).rows;
    for(const account of accounts)await db.query('UPDATE himoto.management_gps_event_channels SET webhook_cipher=$2 WHERE account_id=$1 AND webhook_cipher IS NULL',[account.id,sealIntegrationSecret({key:randomBytes(32).toString('hex')})]);
  }
  if(action==='--enable-history'){
    for(const account of(await db.query('SELECT id,provider,label,session_cipher FROM himoto.management_gps_accounts WHERE enabled ORDER BY provider,label')).rows){
      const device=(await db.query(`SELECT external_device_id,provider_device_id FROM himoto.gps_devices WHERE source_account_id=$1
        AND ($2<>'protrack' OR provider_device_id IS NOT NULL) ORDER BY (management_status='online') DESC,heartbeat_at DESC NULLS LAST LIMIT 1`,[account.id,account.provider])).rows[0];
      if(!device||!account.session_cipher){console.log(JSON.stringify({account:account.label,provider:account.provider,status:'waiting_for_live_device'}));continue;}
      const session=openIntegrationSecret(account.session_cipher),end=Date.now()-30000,start=end-3600000,results={};
      for(const[stream,read]of [['motion',readGpsMotionHistory],['alarms',readGpsAlarmHistory]]){
        try{const rows=await read(account.provider,session,device,start,end);results[stream]={enabled:true,records:rows.length};}
        catch(error){results[stream]={enabled:false,error:typeof error.code==='string'?error.code:'HISTORY_READ_FAILED'};}
      }
      await db.query(`UPDATE himoto.management_gps_event_channels SET motion_enabled=$2,alarms_enabled=$3,last_error=$4,updated_at=now() WHERE account_id=$1`,[account.id,results.motion.enabled,results.alarms.enabled,[results.motion.error,results.alarms.error].filter(Boolean).join(',')||null]);
      console.log(JSON.stringify({account:account.label,provider:account.provider,...results}));
    }
  }
  if(action==='--configure-iop-webhooks'){
    for(const account of(await db.query("SELECT id,label FROM himoto.management_gps_accounts WHERE enabled AND provider='iopgps' ORDER BY label")).rows){
      try{const result=await configureIopGpsWebhooks(account.id);console.log(JSON.stringify({account:account.label,configured:true,...result}));}
      catch(error){const code=/^[A-Z0-9_]+$/.test(error.message)?error.message:'IOPGPS_WEBHOOK_CONFIGURATION_FAILED';await db.query('UPDATE himoto.management_gps_event_channels SET last_error=$2 WHERE account_id=$1',[account.id,code]);console.log(JSON.stringify({account:account.label,configured:false,error:code}));process.exitCode=1;}
    }
  }
  console.log(JSON.stringify({history:(await readIntegrationSettings()).gps_history,credentialsPrinted:false},null,2));
}
main().catch(error=>{console.error({error:/^[A-Z_]+$/.test(error.message)?error.message:'GPS_EVENT_CONFIGURATION_FAILED',code:error.code||null});process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());

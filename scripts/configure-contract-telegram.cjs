const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
async function main(){
  const action=process.argv[2];if(!['--prepare','--status'].includes(action))throw Error('Use --prepare or --status');
  if(action==='--prepare')await db.query(fs.readFileSync(path.resolve(__dirname,'../docs/sql/2026-10-18-contract-telegram-controls.sql'),'utf8'));
  const result=(await db.query(`SELECT
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='himoto' AND table_name='management_contract_notifications' AND column_name IN('delivery_mode','root_event_key','photo_phases','content_hash')) AS new_columns,
    (SELECT count(*)::int FROM himoto.management_store_telegram WHERE enabled) AS enabled_groups,
    (SELECT count(*)::int FROM himoto.management_contract_telegram_preferences) AS contract_preferences,
    (SELECT count(*)::int FROM himoto.management_contract_notifications) AS notifications,
    (SELECT enabled FROM himoto.management_integration_schedule WHERE singleton=true) AS cloud_scheduler_enabled`)).rows[0];
  console.log(JSON.stringify({...result,businessMoneyChanged:false,telegramMessagesSent:0}));
}
main().catch(error=>{console.error({error:'CONTRACT_TELEGRAM_SETUP_FAILED',code:error.code||null});process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());

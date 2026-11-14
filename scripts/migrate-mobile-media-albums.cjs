// Add only the event-scoped media table and report delivery progress columns.
const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const{load,root}=require('./lib/load-typescript.cjs');
const{ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function inspect(){return(await ownerDatabase.query(`SELECT to_regclass('himoto.management_battery_media') IS NOT NULL AS battery_media,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='himoto' AND table_name='management_report_deliveries' AND column_name IN('attachments','media_ids','text_sent')) AS report_columns,
  (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('himoto.management_battery_media')) AS battery_rls,
  (SELECT count(*)::int FROM pg_policies WHERE schemaname='himoto' AND tablename='management_battery_media' AND policyname='battery_media_scope') AS battery_policy,
  to_regclass('himoto.management_report_deliveries') IS NOT NULL AS reports_ready,
  to_regclass('himoto.battery_contracts') IS NOT NULL AS battery_ready`)).rows[0];}
(async()=>{const before=await inspect();if(!before.reports_ready||!before.battery_ready)throw Object.assign(Error('Prerequisite schema missing'),{code:'SCHEMA_PREREQUISITE'});
  if(process.argv.includes('--apply'))await ownerDatabase.query(fs.readFileSync(path.join(root,'../docs/sql/2026-11-13-battery-media-report-attachments.sql'),'utf8'));
  const after=await inspect();if(process.argv.includes('--apply')&&(!after.battery_media||after.report_columns!==3||!after.battery_rls||after.battery_policy!==1))throw Object.assign(Error('Schema verification failed'),{code:'SCHEMA_VERIFICATION'});
  console.log(JSON.stringify({applied:process.argv.includes('--apply'),before,after,businessRowsWritten:0,mediaSent:0},null,2));
})().catch(error=>{console.error(JSON.stringify({ok:false,code:error.code||'MIGRATION_FAILED'}));process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());

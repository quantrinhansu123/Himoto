const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){
  if(!process.argv.includes('--apply'))throw Error('Use --apply for the additive GPS provider-stop migration');
  await ownerDatabase.query(fs.readFileSync('docs/sql/2026-10-25-gps-provider-stop.sql','utf8'));
  const column=await ownerDatabase.query("SELECT 1 FROM information_schema.columns WHERE table_schema='himoto' AND table_name='gps_devices' AND column_name='provider_stopped_since'");
  if(column.rowCount!==1)throw Error('Provider-stop column missing');
  console.log(JSON.stringify({migration:'gps-provider-stop',passed:true,businessRowsWritten:0}));
}
main().catch(e=>{console.error(JSON.stringify({passed:false,code:e.code||e.name}));process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});

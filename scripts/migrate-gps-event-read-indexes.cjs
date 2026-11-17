// Only the two reviewed, additive GPS read indexes. No business rows or policies change.
const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const database=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const names=['idx_gps_events_event_time_id','idx_gps_events_vehicle_event_time_id'];
async function main(){
  const mode=process.argv[2];if(!['--check','--apply'].includes(mode))throw Error('Use --check or --apply.');
  const client=await database.connect();
  try{
    await client.query("SET lock_timeout='5s'; SET statement_timeout='5min'");
    if(mode==='--apply'){
      const ddl=fs.readFileSync(path.resolve(__dirname,'../docs/sql/2026-11-16-gps-event-read-indexes.sql'),'utf8');
      for(const statement of ddl.split(';').map(s=>s.trim()).filter(Boolean))await client.query(statement);
    }
    const rows=(await client.query(`SELECT c.relname AS name,i.indisvalid AS valid,pg_get_indexdef(c.oid) AS definition
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='himoto.management_gps_status_events'::regclass AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[names])).rows;
    const ready=rows.length===names.length&&rows.every(r=>r.valid);
    console.log(JSON.stringify({ok:ready,mode,indexes:rows,at:new Date().toISOString(),businessRowsChanged:0,policiesChanged:0},null,2));
    if(!ready)process.exitCode=1;
  }finally{client.release();}
}
main().catch(e=>{console.error(JSON.stringify({ok:false,code:e.code||'GPS_INDEX_MIGRATION_FAILED'}));process.exitCode=1;}).finally(()=>process.exit(process.exitCode||0));

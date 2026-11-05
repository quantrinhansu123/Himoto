const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.env.HIMOTO_ENV_ROOT||process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){
  const apply=process.argv.includes('--apply');
  if(!apply&&!process.argv.includes('--validate'))throw Error('Use --validate (rolls back) or --apply for the additive mobile-activity migration.');
  const sql=fs.readFileSync(path.resolve('docs/sql/2026-11-05-mobile-activity-events.sql'),'utf8');
  const client=await ownerDatabase.connect();
  try{
    await client.query(apply?sql:sql.replace(/COMMIT;\s*$/,'ROLLBACK;'));
    if(apply){
      const triggers=await client.query("SELECT tgname FROM pg_trigger WHERE tgname IN ('mobile_activity_order','mobile_activity_payment','mobile_activity_transfer') AND NOT tgisinternal");
      if(triggers.rows.length!==3)throw Error('Activity triggers missing after migration');
    }
    console.log(JSON.stringify({ok:true,mode:apply?'applied':'validated-and-rolled-back',schema:'mobile-activity-events',operationalRowsWritten:0}));
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:error.code||error.name}));process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});

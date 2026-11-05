// Authorized live preflight only. No dotenv, business rows, migrations or writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('pg'),{rootCertificates}=require('node:tls');
const {load}=require('./lib/load-typescript.cjs');
const {SUPABASE_ROOT_CA}=load(path.resolve('src/lib/server/supabase-ca'));
async function main(){
  const output=process.argv[process.argv.indexOf('--output')+1];
  assert(process.argv.includes('--output')&&output,'Pass a new --output folder inside .backups');
  const folder=path.resolve(output);assert(folder.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(folder));
  if(!process.env.DATABASE_URL)throw Object.assign(Error(),{code:'DATABASE_URL_NOT_IN_PROCESS'});
  const url=new URL(process.env.DATABASE_URL);assert(url.protocol==='postgresql:'||url.protocol==='postgres:');
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  const client=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:[...rootCertificates,SUPABASE_ROOT_CA]},connectionTimeoutMillis:8000,application_name:'himoto-mobile-readonly-preflight'});
  const startedAt=new Date().toISOString();
  try{
    await client.connect();
    const results=await client.query(fs.readFileSync(path.resolve('docs/sql/2026-11-02-mobile-schema-preflight.sql'),'utf8'));
    // The reviewed SQL selects only catalogs/information_schema inside BEGIN READ ONLY.
    const catalog=results.filter(r=>r.command==='SELECT').map(r=>r.rows);
    const rollout=await client.query(fs.readFileSync(path.resolve('docs/sql/2026-11-05-mobile-rollout-preflight.sql'),'utf8'));
    const rolloutCatalog=rollout.filter(r=>r.command==='SELECT').map(r=>r.rows);
    const result={readOnly:true,businessRowsRead:0,businessWrites:0,schemaWrites:0,startedAt,completedAt:new Date().toISOString(),catalog,rolloutCatalog};
    fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'schema.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({ok:true,readOnly:true,output:path.relative(process.cwd(),folder),sessionSchema:catalog[0]?.[0]?.mobile_session_schema,tables:catalog[2]?.map(r=>r.table_name),missingTables:rolloutCatalog[0]?.filter(r=>!r.present).map(r=>r.table_name),receiptReadiness:catalog[5]?.[0]?.contract_type_mobile_receipt_readiness},null,2));
  }finally{await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,readOnly:true,code:typeof error.code==='string'?error.code:'PREFLIGHT_FAILED',connectionDetailsLogged:false}));process.exitCode=1;});

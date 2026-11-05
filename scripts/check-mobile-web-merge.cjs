// Run the upstream web's real attendance/value-sales checks on isolated PostgreSQL.
// No dotenv, database credentials, operational connection or outbound messages.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const value=key=>{const at=process.argv.indexOf(key);assert(at>=0&&process.argv[at+1]);return process.argv[at+1];};
async function run(){
 const suite=value('--suite');assert(['attendance','contract-value-sales'].includes(suite));
 const {PGlite}=require(path.resolve(value('--pglite-path'))),pg=new PGlite();
 const client={release(){},async query(sql,values){
  const r=!values&&sql.includes(';')?(await pg.exec(sql)).at(-1):await pg.query(sql,values);
  const rows=(r?.rows||[]).map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])));
  return {...r,rows,rowCount:rows.length||r?.affectedRows||0};
 }};
 globalThis.himotoPool={connect:async()=>client,query:client.query.bind(client),end:()=>pg.close()};
 require('@next/env').loadEnvConfig=()=>({combinedEnv:{},parsedEnv:{},loadedEnvFiles:[]});
 if(suite==='attendance'){
  await pg.exec('CREATE SCHEMA himoto;CREATE TABLE himoto.users(id bigint PRIMARY KEY);CREATE TABLE himoto.stores(id bigint PRIMARY KEY);CREATE TABLE himoto.staff_profiles(id bigint PRIMARY KEY)');
  await pg.exec(fs.readFileSync(path.join(__dirname,'attendance-schema.sql'),'utf8'));
 }
 require('./check-'+suite+'.cjs');
}
run().catch(()=>{console.error('OFFLINE_WEB_MERGE_CHECK_FAILED');process.exitCode=1;});

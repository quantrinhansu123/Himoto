// Atomic combined migration, current/legacy session preservation and failed-rerun rollback.
require('./lib/offline-tests.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {mobileFiles,assemble}=require('./build-mobile-rollout-sql.cjs');
async function main(){
 const at=process.argv.indexOf('--pglite-path');assert(at>=0);const {PGlite}=require(path.resolve(process.argv[at+1]));
 const sql=assemble(mobileFiles),checks=[];
 for(const mode of ['legacy','current']){
  const pg=new PGlite();try{
   await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
    CREATE TABLE himoto.users(id bigint PRIMARY KEY);CREATE TABLE himoto.orders(id bigint PRIMARY KEY,deleted_at timestamptz);
    CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,deleted_at timestamptz);CREATE TABLE himoto.customers(id bigint PRIMARY KEY);
    INSERT INTO himoto.users VALUES(7);INSERT INTO himoto.orders VALUES(101,NULL);INSERT INTO himoto.vehicles VALUES(201,NULL);INSERT INTO himoto.customers VALUES(301);
    GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;`);
   await pg.exec(fs.readFileSync(mode==='legacy'?'scripts/fixtures/mobile-session-legacy.sql':'docs/sql/2026-10-31-mobile-sessions.sql','utf8'));
   const key=randomUUID();
   if(mode==='legacy')await pg.query("INSERT INTO himoto.management_mobile_sessions(id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at)VALUES($1,7,repeat('a',64),repeat('b',64),now()+interval '1 hour',now()+interval '1 day')",[key]);
   else await pg.query("INSERT INTO himoto.management_mobile_sessions(id,user_id,token_hash,password_version,device_name,platform,expires_at)VALUES($1,7,repeat('c',64),0,'QA','android',now()+interval '1 hour')",[key]);
   const old=(await pg.query('SELECT to_jsonb(s) AS value FROM himoto.management_mobile_sessions s')).rows[0].value;
   const business=await pg.query('SELECT (SELECT jsonb_agg(o) FROM himoto.orders o) AS orders,(SELECT jsonb_agg(v) FROM himoto.vehicles v) AS vehicles,(SELECT jsonb_agg(c) FROM himoto.customers c) AS customers');
   await pg.exec(sql);await pg.exec(sql);
   const current=(await pg.query('SELECT to_jsonb(s) AS value FROM himoto.management_mobile_sessions s')).rows[0].value;for(const name of Object.keys(old))assert.deepEqual(current[name],old[name]);
   assert.deepEqual((await pg.query('SELECT (SELECT jsonb_agg(o) FROM himoto.orders o) AS orders,(SELECT jsonb_agg(v) FROM himoto.vehicles v) AS vehicles,(SELECT jsonb_agg(c) FROM himoto.customers c) AS customers')).rows,business.rows);
   const tables=(await pg.query("SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='himoto'AND relname LIKE 'management_mobile_%'AND relkind='r'")).rows;
   assert.equal(tables.length,mode==='legacy'?15:14);assert(tables.every(t=>t.relrowsecurity));
   for(const role of ['himoto_scoped','anon','authenticated'])for(const table of ['management_mobile_sessions','management_mobile_login_limits','management_mobile_gps_mappings'])for(const permission of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await pg.query('SELECT has_table_privilege($1,$2,$3) AS ok',[role,'himoto.'+table,permission])).rows[0].ok,false);
   assert.equal((await pg.query("SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='himoto'AND table_name='management_mobile_requests'AND column_name='resource_key'")).rows[0].character_maximum_length,160);
   const before=JSON.stringify((await pg.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='himoto'ORDER BY table_name,ordinal_position")).rows);
   const broken=sql.replace('\nCOMMIT;\n',"\nSELECT no_such_rollout_guard();\nCOMMIT;\n");await assert.rejects(()=>pg.exec(broken));await pg.exec('ROLLBACK');assert.equal(JSON.stringify((await pg.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='himoto'ORDER BY table_name,ordinal_position")).rows),before);
   checks.push(mode+': 16 migrations in one transaction/rerun preserve original credential and business fields; all tables/RLS/resource_key present; owner-only credential/GPS privileges and rollback on final error verified');
  }finally{await pg.close();}
 }
 console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,externalNetworkAllowed:false,productionWrites:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

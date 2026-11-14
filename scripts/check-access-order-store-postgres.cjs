const assert=require('node:assert/strict'),fs=require('node:fs');
const openQa=require('./lib/mobile_postgres_qa.cjs');
async function main(){const qa=await openQa();let c;try{
 await qa.pool.query(`CREATE SCHEMA himoto;CREATE SCHEMA qa_shadow;
  CREATE TABLE himoto.orders(id bigint,store_id numeric);
  INSERT INTO himoto.orders VALUES(1,1),(2,2),(3,30),(4,35),(5,NULL);
  CREATE FUNCTION himoto.access_store(target numeric) RETURNS boolean LANGUAGE sql STABLE AS
    'SELECT current_setting(''himoto.scope_all'',true)=''true'' OR target=NULLIF(current_setting(''himoto.store_id'',true),'''')::bigint';
  CREATE FUNCTION himoto.ownership_may_use_headquarters_customer_source(target bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS
    'SELECT NULLIF(current_setting(''himoto.actor_id'',true),'''')::bigint IS NOT NULL AND NULLIF(current_setting(''himoto.store_id'',true),'''')::bigint=35 AND target=30';
  CREATE FUNCTION himoto.access_order_store(target numeric) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,himoto AS
    'SELECT himoto.access_store(target) OR himoto.ownership_may_use_headquarters_customer_source(target::bigint)';
  GRANT USAGE ON SCHEMA himoto,qa_shadow TO himoto_scoped;
  GRANT SELECT,INSERT ON himoto.orders TO himoto_scoped;
  REVOKE ALL ON FUNCTION himoto.access_store(numeric),himoto.access_order_store(numeric),himoto.ownership_may_use_headquarters_customer_source(bigint) FROM PUBLIC;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA himoto TO himoto_scoped;
  ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;
  CREATE POLICY qa_orders ON himoto.orders TO himoto_scoped USING(himoto.access_order_store(store_id)) WITH CHECK(himoto.access_order_store(store_id));
  CREATE FUNCTION qa_shadow.current_setting(text,boolean) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT ''true''::text';
  CREATE FUNCTION qa_shadow.access_store(numeric) RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true';`);
 c=await qa.pool.connect();const snapshot=()=>c.query("SELECT p.oid::text,p.proowner::text,p.proacl::text,p.prosecdef FROM pg_proc p WHERE p.oid IN('himoto.access_store(numeric)'::regprocedure,'himoto.access_order_store(numeric)'::regprocedure) ORDER BY p.oid");
 const identity=(await snapshot()).rows,baseline=[];let cases=0;
 async function measure(){const all=[];for(const [store,scopeAll,actor]of [['1','false','7'],['2','false','8'],['35','false','9'],['35','false',''],['','false',''],['','true','7']]){
  await c.query('BEGIN');try{await c.query("SELECT set_config('himoto.store_id',$1,true),set_config('himoto.scope_all',$2,true),set_config('himoto.actor_id',$3,true)",[store,scopeAll,actor]);await c.query('SET LOCAL ROLE himoto_scoped');
   for(const shadow of [false,true]){await c.query('SET LOCAL search_path='+(shadow?'qa_shadow,pg_catalog,himoto':'pg_catalog,himoto'));
    const values=(await c.query('SELECT v,himoto.access_order_store(v) AS allowed FROM unnest(ARRAY[NULL,0,1,2,30,35,999]::numeric[]) v ORDER BY v NULLS FIRST')).rows;
    const rows=(await c.query('SELECT id FROM himoto.orders ORDER BY id')).rows;all.push({values,rows});cases++;
   }
   if(store==='1'){await c.query('SAVEPOINT denied_write');await assert.rejects(()=>c.query('INSERT INTO himoto.orders VALUES(999,2)'),e=>e.code==='42501');await c.query('ROLLBACK TO SAVEPOINT denied_write');}
  }finally{await c.query('ROLLBACK');}
 }return all;}
 baseline.push(...await measure());
 const sql=fs.readFileSync('docs/sql/2026-11-11-access-order-store-inline.sql','utf8');await c.query(sql);
 assert.deepEqual((await snapshot()).rows,identity);assert.deepEqual(await measure(),baseline);
 await c.query(sql);assert.deepEqual((await snapshot()).rows,identity);assert.deepEqual(await measure(),baseline);
 const properties=(await c.query("SELECT p.proconfig,p.prosqlbody IS NOT NULL AS parsed FROM pg_proc p WHERE p.oid='himoto.access_order_store(numeric)'::regprocedure")).rows[0];assert(properties.parsed&&!properties.proconfig);
 console.log(JSON.stringify({passed:true,cases,checks:['truth tables and actual RLS row visibility unchanged','branch, ownership HQ, all-scope, missing actor and null targets covered','foreign-store writes remain denied','hostile caller search_path cannot replace bound dependencies','reapplication retains OIDs, owners, ACLs and SECURITY INVOKER'],externalNetwork:false,businessWrites:0}));
}finally{c?.release();await qa.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});

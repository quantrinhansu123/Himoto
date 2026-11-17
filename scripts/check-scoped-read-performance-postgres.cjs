const assert=require('node:assert/strict'),fs=require('node:fs');
const openQa=require('./lib/mobile_postgres_qa.cjs');
(async()=>{
 const qa=await openQa(),c=await qa.pool.connect();let cases=0;
 try{
  await c.query(`CREATE SCHEMA himoto;CREATE SCHEMA qa_shadow;
   CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text,kind text);
   INSERT INTO himoto.stores VALUES(1,'Chi nhánh A','rental'),(2,'Chi nhánh B','rental'),(30,'Trụ sở chính','rental'),(31,'Nguyễn Hoàng','rental'),(35,'Thuê sở hữu','lease_to_own'),(36,'TRU SO CHINH 2','rental');
   CREATE FUNCTION himoto.access_store(target numeric) RETURNS boolean LANGUAGE sql STABLE RETURN current_setting('himoto.scope_all',true)='true' OR target=NULLIF(current_setting('himoto.store_id',true),'')::bigint;
   CREATE FUNCTION himoto.actor_owns_lease_store() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$SELECT EXISTS(SELECT 1 FROM himoto.stores WHERE id=NULLIF(current_setting('himoto.store_id',true),'')::bigint AND kind='lease_to_own')$$;
   CREATE FUNCTION himoto.ownership_may_use_headquarters_customer_source(target bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
    SELECT himoto.actor_owns_lease_store() AND EXISTS(SELECT 1 FROM himoto.stores s WHERE s.id=target AND translate(lower(s.store_name),
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ','aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd') LIKE '%tru so chinh%')$$;
   CREATE FUNCTION himoto.access_order_store(target numeric) RETURNS boolean LANGUAGE sql STABLE RETURN himoto.access_store(target) OR himoto.ownership_may_use_headquarters_customer_source(target::bigint);
   REVOKE ALL ON ALL FUNCTIONS IN SCHEMA himoto FROM PUBLIC;GRANT USAGE ON SCHEMA himoto,qa_shadow TO himoto_scoped;
   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA himoto TO himoto_scoped;
   CREATE FUNCTION qa_shadow.current_setting(text,boolean) RETURNS text LANGUAGE sql IMMUTABLE RETURN 'true'::text;
   CREATE FUNCTION qa_shadow.ownership_customer_source_store_ids() RETURNS bigint[] LANGUAGE sql IMMUTABLE RETURN ARRAY[1,2,30,31,35,36]::bigint[];
   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qa_shadow TO himoto_scoped;
   CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id numeric,note text);
   CREATE TABLE himoto.transactions(LIKE himoto.orders INCLUDING ALL);
   INSERT INTO himoto.orders SELECT n,CASE n%8 WHEN 0 THEN NULL WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 30 WHEN 4 THEN 31 WHEN 5 THEN 35 WHEN 6 THEN 36 ELSE 30.4 END,'original' FROM generate_series(1,160) n;
   INSERT INTO himoto.transactions SELECT * FROM himoto.orders;
   GRANT SELECT,INSERT,UPDATE,DELETE ON himoto.orders,himoto.transactions TO himoto_scoped;`);
  for(const table of ['orders','transactions'])await c.query(`ALTER TABLE himoto.${table} ENABLE ROW LEVEL SECURITY;
   CREATE POLICY management_scoped_gate ON himoto.${table} TO himoto_scoped USING(true) WITH CHECK(true);
   CREATE POLICY management_scoped_read ON himoto.${table} AS RESTRICTIVE FOR SELECT TO himoto_scoped USING(himoto.access_order_store(store_id));
   CREATE POLICY management_scoped_write ON himoto.${table} AS RESTRICTIVE FOR INSERT TO himoto_scoped WITH CHECK(himoto.access_store(store_id));
   CREATE POLICY management_scoped_update ON himoto.${table} AS RESTRICTIVE FOR UPDATE TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
   CREATE POLICY management_scoped_delete ON himoto.${table} AS RESTRICTIVE FOR DELETE TO himoto_scoped USING(himoto.access_store(store_id));`);
  const metadata=async()=>(await c.query("SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='himoto' AND cmd<>'SELECT' ORDER BY tablename,policyname")).rows;
  const identities=async()=>(await c.query("SELECT oid::text,proowner::text,proacl::text,prosecdef,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid IN('himoto.access_store(numeric)'::regprocedure,'himoto.access_order_store(numeric)'::regprocedure,'himoto.ownership_may_use_headquarters_customer_source(bigint)'::regprocedure) ORDER BY oid")).rows;
  const policies=await metadata(),functions=await identities();
  async function measure(){const results=[];
   for(const[store,all,actor]of [['1','false','7'],['2','false','8'],['35','false','9'],['35','false',''],['','false',''],['','true','7'],['30','false','10']]){
    await c.query('BEGIN');try{
     await c.query("SELECT set_config('himoto.store_id',$1,true),set_config('himoto.scope_all',$2,true),set_config('himoto.actor_id',$3,true)",[store,all,actor]);await c.query('SET LOCAL ROLE himoto_scoped');
     for(const shadow of [false,true]){
      await c.query('SET LOCAL search_path='+(shadow?'qa_shadow,pg_catalog,himoto':'pg_catalog,himoto'));
      for(const table of ['orders','transactions']){
       const rows=(await c.query(`SELECT id,store_id FROM himoto.${table} ORDER BY id`)).rows;results.push({store,all,actor,shadow,table,rows});cases++;
       const page=(await c.query(`SELECT id,store_id FROM himoto.${table} ORDER BY id LIMIT 3 OFFSET 2`)).rows;assert.deepEqual(page,rows.slice(2,5));
       if(store==='35')assert(rows.some(r=>Number(r.store_id)===30)&&rows.some(r=>Number(r.store_id)===36)&&!rows.some(r=>Number(r.store_id)===31));
      }
     }
     if(store==='1'||store==='35'){
      const foreign=store==='1'?2:30;
      await c.query('SAVEPOINT no_foreign_write');await assert.rejects(()=>c.query('INSERT INTO himoto.orders VALUES(999,$1,\'denied\')',[foreign]),e=>e.code==='42501');await c.query('ROLLBACK TO SAVEPOINT no_foreign_write');
      assert.equal((await c.query('UPDATE himoto.orders SET note=\'denied\' WHERE store_id=$1 RETURNING id',[foreign])).rowCount,0);
      assert.equal((await c.query('DELETE FROM himoto.transactions WHERE store_id=$1 RETURNING id',[foreign])).rowCount,0);
      await c.query('INSERT INTO himoto.orders VALUES(999,$1,\'local\')',[Number(store)]);assert.equal((await c.query('UPDATE himoto.orders SET note=\'local updated\' WHERE id=999 RETURNING id')).rowCount,1);
     }
    }finally{await c.query('ROLLBACK')}
   }return results;
  }
  const baseline=await measure(),migration=fs.readFileSync('docs/sql/2026-11-16-scoped-read-initplan.sql','utf8');
  await c.query(migration);assert.deepEqual(await measure(),baseline);assert.deepEqual(await metadata(),policies);assert.deepEqual(await identities(),functions);
  await c.query(migration);assert.deepEqual(await measure(),baseline);
  const privileges=(await c.query("SELECT has_function_privilege('anon','himoto.ownership_customer_source_store_ids()','EXECUTE') AS anon,has_function_privilege('authenticated','himoto.ownership_customer_source_store_ids()','EXECUTE') AS authenticated,has_function_privilege('himoto_scoped','himoto.ownership_customer_source_store_ids()','EXECUTE') AS scoped")).rows[0];assert.deepEqual(privileges,{anon:false,authenticated:false,scoped:true});
  await c.query('BEGIN');try{
   await c.query("SELECT set_config('himoto.store_id','35',true),set_config('himoto.scope_all','false',true)");await c.query('SET LOCAL ROLE himoto_scoped');
   const plan=JSON.stringify((await c.query('EXPLAIN (ANALYZE,VERBOSE,FORMAT JSON) SELECT count(*) FROM himoto.orders')).rows);assert.match(plan,/InitPlan/);assert.match(plan,/ownership_customer_source_store_ids/);
   const first=(await c.query('SELECT array_agg(id ORDER BY id) AS ids FROM himoto.orders')).rows[0].ids;
   await c.query("SELECT set_config('himoto.store_id','1',true)");const next=(await c.query('SELECT array_agg(id ORDER BY id) AS ids FROM himoto.orders')).rows[0].ids;assert.notDeepEqual(next,first);
  }finally{await c.query('ROLLBACK')}
  console.log(JSON.stringify({ok:true,cases,externalNetwork:false,checks:['SELECT visibility, page ordering, null/fractional IDs and multiple HQ stores match old policy','HQ read permission does not grant HQ writes; foreign insert/update/delete remain denied','Only two restrictive SELECT predicates change; write policies and helper identities/ACLs unchanged','Hostile search_path, missing settings, same-transaction scope changes and idempotent migration covered','InitPlan observed; new helper executable only by scoped role'],productionWrites:0}));
 }finally{c.release();await qa.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

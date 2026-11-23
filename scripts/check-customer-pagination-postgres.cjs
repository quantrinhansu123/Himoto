const assert=require('node:assert/strict'),path=require('node:path');
const openQa=require('./lib/mobile_postgres_qa.cjs'),{load,root}=require('./lib/load-typescript.cjs');
(async()=>{
 const qa=await openQa(),c=await qa.pool.connect();let cases=0;
 try{
  const server=load(path.join(root,'lib/server/management-table')),{dataAccess}=load(path.join(root,'lib/server/access-context')),{EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
  await c.query(`CREATE SCHEMA himoto;
   CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);
   INSERT INTO himoto.stores VALUES(1,'Cơ sở B'),(2,'Cơ sở A');
   CREATE TABLE himoto.customers(id bigint PRIMARY KEY,name text,phone text,id_card text,address text,status integer,warning text,store_id bigint,customer_type text,contact_detail text,updated_at timestamptz);
   INSERT INTO himoto.customers SELECT n,CASE n%3 WHEN 0 THEN 'Nguyễn An' WHEN 1 THEN 'Bình Đỗ' ELSE NULL END,'090'||n,'ID'||n,CASE WHEN n%2=0 THEN 'Hà Nội' ELSE 'HCM' END,n%3,CASE WHEN n%4=0 THEN 'Lưu ý' ELSE '' END,CASE WHEN n%7=0 THEN NULL ELSE 1+n%2 END FROM generate_series(1,83) n;
   CREATE TABLE himoto.orders(id bigint,customer_id bigint,store_id bigint,deleted_at timestamptz);
   INSERT INTO himoto.orders SELECT n,1+n%83,1+n%2,CASE WHEN n%8=0 THEN now() ELSE NULL END FROM generate_series(1,277) n;
   CREATE FUNCTION himoto.store_directory() RETURNS TABLE(id bigint,store_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$SELECT id,store_name FROM himoto.stores$$;
   GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT ON himoto.customers,himoto.orders,himoto.stores TO himoto_scoped;GRANT EXECUTE ON FUNCTION himoto.store_directory() TO himoto_scoped;
   GRANT UPDATE ON himoto.customers TO himoto_scoped;
   ALTER TABLE himoto.customers ENABLE ROW LEVEL SECURITY;
   CREATE POLICY customer_gate ON himoto.customers FOR ALL TO himoto_scoped USING(true) WITH CHECK(true);
   CREATE POLICY customer_directory ON himoto.customers AS RESTRICTIVE FOR SELECT TO himoto_scoped USING(NULLIF(current_setting('himoto.actor_id',true),'') IS NOT NULL);
   CREATE POLICY customer_update ON himoto.customers AS RESTRICTIVE FOR UPDATE TO himoto_scoped
   USING(current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
   ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;
   CREATE POLICY scoped_orders ON himoto.orders TO himoto_scoped USING(current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);`);
  const revisions=new Map((await c.query('SELECT id,xmin::text AS customer_revision FROM himoto.customers')).rows.map(row=>[row.id,row.customer_revision]));
  for(const scoped of [false,true])await dataAccess.run({id:7,access_role:scoped?'branch_staff':'admin',scope_all:!scoped,store_id:1,permissions:[],operation:''},async()=>{
   await c.query('BEGIN');try{
    if(scoped){await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','1',true),set_config('himoto.actor_id','7',true)");await c.query('SET LOCAL ROLE himoto_scoped')}
    for(const sort of ['code','name','phone','id_card','address','status','store_name','contract_count'])for(const direction of ['asc','desc'])for(const[store,status,search]of [['all','',''],['1','active',''],['all','blacklist','nguyen'],['2','warning',''],['all','','%'],['all','','NO_MATCH']]){
     const input={kind:'customers',query:{...EMPTY_QUERY,status,search},store,scope:'',page:1,size:5,sort,direction};
     const sql=server.customerListPageSql(input);
     const fold=v=>`lower(translate(regexp_replace(normalize(COALESCE(${v},''),NFD) COLLATE "C",'[̀-ͯ]','','g'),'đĐ','dD'))`;
     const clause=`${store==='all'?'':` AND c.store_id=${store}`}${status==='active'?" AND c.status NOT IN (0,2) AND NULLIF(BTRIM(c.warning),'') IS NULL":status==='blacklist'?' AND c.status=2':status==='warning'?" AND NULLIF(BTRIM(c.warning),'') IS NOT NULL":''}${search?` AND (${fold('c.name')} LIKE ${fold('$3')} OR COALESCE(c.phone,'') ILIKE $3 OR COALESCE(c.id_card,'') ILIKE $3 OR ${fold('c.address')} LIKE ${fold('$3')})`:''}`;
     const expression={code:'c.id',name:'c.name',phone:'c.phone',id_card:'c.id_card',address:'c.address',status:'c.status',store_name:'s.store_name',contract_count:'oc.contract_count'}[sort];
     const baseline=`${server.customerPageSql(clause)} ORDER BY ${expression} ${direction} NULLS LAST,c.id ${direction} LIMIT $1 OFFSET $2`;
     // Run complete projection before LIMIT as an independent SQL baseline.
     for(const offset of [0,5,500]){
      const needle=search?'%'+search.replace(/[\\%_]/g,'\\$&')+'%':null,values=needle?[5,offset,needle]:[5,offset];
      const {rows}=await c.query(sql,values);
      assert.deepEqual(rows,(await c.query(baseline,values)).rows,`${scoped}:${sort}:${direction}:${store}:${status}:${search}:${offset}`);
      for(const row of rows)assert.equal(row.customer_revision,revisions.get(row.id),`Missing or incorrect revision for customer ${row.id} via ${sort}`);
      cases++;
     }
    }
   }finally{await c.query('ROLLBACK')}
  });
  const {changeCustomerBlacklist}=load(path.join(root,'lib/server/customer-blacklist'));
  const readCustomers=(status='')=>server.readManagementTable(c,'customers',new URLSearchParams({search:'Nguyen An',status,sort:'code',direction:'asc',size:'5'}));
  await dataAccess.run({id:7,access_role:'branch_staff',scope_all:false,store_id:2,permissions:['customers.write'],operation:''},async()=>{
   await c.query('BEGIN');
   try{
    await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','2',true),set_config('himoto.actor_id','7',true)");
    await c.query('SET LOCAL ROLE himoto_scoped');
    const {rows}=await readCustomers();
    const original=rows[0], otherBranch=rows.find(row=>row.id===6);
    assert.equal(original.id,3);
    assert.equal(original.status,'draft');
    assert.equal(otherBranch.store_id,1);
    await assert.rejects(changeCustomerBlacklist(c,otherBranch.id,{blacklisted:true,revision:otherBranch.customer_revision}),error=>error.status===403);
    await assert.rejects(changeCustomerBlacklist(c,21,{blacklisted:true,revision:revisions.get('21')}),error=>error.status===403);
    await assert.rejects(changeCustomerBlacklist(c,999,{blacklisted:true,revision:'1'}),error=>error.status===404);
    const marked=await changeCustomerBlacklist(c,original.id,{blacklisted:true,revision:original.customer_revision});
    const refreshed=(await readCustomers('blacklist')).rows[0];
    assert.equal(refreshed.id,original.id);
    assert.equal(refreshed.status,'blacklist');
    assert.equal(refreshed.customer_revision,marked.customer_revision);
    await assert.rejects(changeCustomerBlacklist(c,original.id,{blacklisted:false,revision:original.customer_revision}),error=>error.status===409);
    await changeCustomerBlacklist(c,original.id,{blacklisted:false,revision:refreshed.customer_revision});
    assert.equal((await readCustomers()).rows[0].status,'draft');
    assert(!(await readCustomers('blacklist')).rows.some(row=>row.id===original.id));
   }finally{await c.query('ROLLBACK')}
  });
  console.log(JSON.stringify({ok:true,cases,externalNetwork:false,productionWrites:0,checks:['Pagination before hydration preserves rows/counts for all eight sorts, both directions and null/tied values','Store, status, accent-insensitive and escaped search, empty results and beyond-last-page covered','contract_count sort retains full projection; actual PostgreSQL RLS limits per-customer counts','In-store mark/remove is reflected in the Blacklist filter; stale versions, other stores and unassigned profiles are rejected']}));
 }finally{c.release();await qa.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

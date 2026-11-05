// Exact duplicate lookup, scope and client binding. No env files or operational DB.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const {NextRequest} = require('next/server');
const {load,root} = require('./lib/load-typescript.cjs');
async function run() {
  const flag=process.argv.indexOf('--pglite-path');
  const pg=flag<0?null:new (require(path.resolve(process.argv[flag+1])).PGlite)();
  const checks=[],trace=[];
  let fail=false,scope=null,scoped=false,connections=0,releases=0;
  const rows=[
    {id:501,name:'Local QA',phone:'0901 111 111',id_card:'QA-DOC',store_id:23,store_name:'QA local',status:'active',customer_type:'vietnam',relatives:[]},
    {id:502,name:'Foreign branch QA',phone:'0901 111 111',id_card:'OTHER',store_id:24,store_name:'QA other',status:'active',customer_type:'vietnam',relatives:[]},
    {id:503,name:'International QA',phone:'',id_card:'PASSPORT',contact_detail:'+84 (901) 222-222',store_id:24,store_name:'QA other',status:'active',customer_type:'foreign',relatives:[]},
    ...Array.from({length:12},(_,i)=>({id:600+i,name:`Bound QA ${i}`,id_card:'BOUND',phone:'',store_id:23,store_name:'QA local',status:'draft',customer_type:'vietnam',relatives:[]})),
  ];
  async function rawQuery(sql,values=[]) {
    trace.push({sql,values});
    if(fail&&sql.includes('FROM himoto.customers')){fail=false;throw Error('QA forced read failure');}
    if(pg){const result=await pg.query(sql,values);return {...result,rowCount:result.rows.length};}
    if(sql.startsWith('BEGIN')){scope=null;scoped=false;}
    if(sql.includes("set_config('himoto.scope_all'"))scope={all:values[0]==='true',store:Number(values[1])};
    if(sql==='SET LOCAL ROLE himoto_scoped')scoped=true;
    if(sql.includes('FROM himoto.customers')) {
      const term=values[0];
      let found=rows.filter(row=>!scoped||scope.all||row.store_id===scope.store);
      found=found.filter(row=>sql.includes('WHERE c.id=$1')?row.id===term:sql.includes('OR ($1')?
        row.id_card===term||(row.phone||'').replace(/\D/g,'')===term||row.customer_type==='foreign'&&(row.contact_detail||'').replace(/\D/g,'')===term:row.id_card===term);
      return {rows:found.sort((a,b)=>b.id-a.id).slice(0,sql.includes('LIMIT 1')&&!sql.includes('LIMIT 11')?1:11),rowCount:found.length};
    }
    return {rows:[],rowCount:0};
  }
  const raw={query:rawQuery,release(){releases++;}};
  global.himotoPool={async connect(){connections++;return raw;},query:rawQuery};
  try {
    if(pg){
      await pg.exec(`CREATE SCHEMA himoto; CREATE ROLE himoto_scoped;
        CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);
        CREATE TABLE himoto.customers(id bigint PRIMARY KEY,name text,email text,phone text,address text,id_card text,
          customer_type text,nationality text,contact_channel text,contact_detail text,driver_license_number text,
          driver_license_issued_on date,status int,warning text,created_at timestamptz,id_card_issued_on date,
          id_card_issued_by text,relatives jsonb,store_id bigint);
        CREATE TABLE himoto.orders(id bigint PRIMARY KEY,customer_id bigint,store_id bigint,rent_at timestamptz,
          created_at timestamptz,deleted_at timestamptz,order_status text);
        CREATE TABLE himoto.order_vehicle_details(id bigint PRIMARY KEY,order_id bigint,rent_at timestamptz,deleted_at timestamptz);
        INSERT INTO himoto.stores VALUES(23,'QA local'),(24,'QA other');
        GRANT USAGE ON SCHEMA himoto TO himoto_scoped; GRANT SELECT ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;
        ALTER TABLE himoto.customers ENABLE ROW LEVEL SECURITY;
        CREATE POLICY branch ON himoto.customers FOR SELECT TO himoto_scoped USING
          (current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);`);
      for(const row of rows)await pg.query(`INSERT INTO himoto.customers(id,name,phone,id_card,store_id,status,customer_type,contact_detail,relatives)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'[]')`,[row.id,row.name,row.phone,row.id_card,row.store_id,row.status==='draft'?0:1,row.customer_type,row.contact_detail||'']);
    }
    const service=load(path.join(root,'lib/server/mobile-customer-matches'));
    const shared=load(path.resolve(root,'../shared/mobile-customer-matches'));
    const user={id:7,role:'staff',access_role:'branch_staff',store_id:23,scope_all:false,permissions:['customers.read','customers.write']};
    const req=(input,suffix='')=>new NextRequest('https://fixture.invalid/api/mobile/v1/customers/matches'+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const read=(input,who=user)=>service.readMobileCustomerMatches(who,req(input));
    const identity={id_card:' qa- doc ',phone:'0901.111.111'};
    // Document normalization strips whitespace, not punctuation.
    identity.id_card=' qa-doc ';
    let before=connections;
    for(const bad of [{},{id:0},{id:1,phone:''},{id_card:'',phone:''},{id_card:'a',phone:'',store_id:24},{id_card:'a'.repeat(101),phone:''}])
      await assert.rejects(()=>read(bad),e=>e.status===400);
    await assert.rejects(()=>read(identity,{...user,permissions:['customers.read']}),e=>e.status===403);
    await assert.rejects(()=>service.readMobileCustomerMatches(user,req(identity,'?store=24')),e=>e.status===400);
    await assert.rejects(()=>read({id_card:'A',phone:'x'.repeat(5000)}),e=>e.status===413);
    assert.equal(connections,before);
    checks.push('Malformed, oversized, forged-scope and read-only requests fail before a DB connection');
    const exact=await read(identity);
    assert.deepEqual(exact.rows.map(row=>row.customer.id).sort(),[501,502]);
    assert.equal(exact.rows.find(row=>row.customer.id===501).canEdit,true);
    assert.equal(exact.rows.find(row=>row.customer.id===502).canEdit,false);
    assert(shared.isMobileCustomerMatches(exact,identity));
    assert(!JSON.stringify(exact).includes('customer_revision'));
    assert.equal(exact.rows[0].customer.relatives.length,2);
    checks.push('Exact document/phone lookup deduplicates globally; foreign-branch snapshots are read-only and contain explicit contract fields');
    const contact=await read({id_card:'',phone:'+84 901 222 222'});
    assert.deepEqual(contact.rows.map(row=>row.customer.id),[503]);
    assert.equal((await read({id_card:'BOUND',phone:''})).rows.length,10);
    assert.equal((await read({id_card:'BOUND',phone:''})).hasMore,true);
    assert.equal((await read({id_card:'absent',phone:''})).rows.length,0);
    checks.push('Numeric foreign contacts normalize correctly; output is bounded to ten with hasMore');
    assert.equal((await read({id:502})).rows.length,0);
    assert.equal((await read({id:501})).rows[0].canEdit,true);
    assert.equal((await read({id:502},{...user,scope_all:true})).rows[0].canEdit,true);
    const admin={...user,access_role:'admin',role:'admin'};
    assert.equal((await read(identity,admin)).rows.find(row=>row.customer.id===502).canEdit,true);
    checks.push('ID reload runs through real scopedConnect: branch isolation, all-store and admin edit scope');
    fail=true;before=releases;
    await assert.rejects(()=>read(identity),/QA forced read failure/);
    assert(trace.some(row=>row.sql==='ROLLBACK'));assert(releases>before);
    assert(trace.some(row=>row.sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
    assert(!trace.some(row=>/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/.test(row.sql)));
    checks.push('Lookups use read-only transactions, parameterized SQL, timeout and rollback/release on failure');
    const invalid=[{...exact,idCard:'OTHER'},{...exact,rows:[exact.rows[0],exact.rows[0]]},{...exact,rows:exact.rows.map(row=>({...row,customer:{...row.customer,id:999,details:{...row.customer.details,id_card:'OTHER',phone:'other'}}}))}];
    for(const value of invalid)assert(!shared.isMobileCustomerMatches(value,identity));
    const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
    let payload=exact;
    global.fetch=async(url,options)=>{
      assert.equal(url,'https://fixture.invalid/api/mobile/v1/customers/matches');
      assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer qa-token');assert.deepEqual(JSON.parse(options.body),identity);
      return new Response(JSON.stringify(payload),{status:200});
    };
    const client=createApi('https://fixture.invalid','qa-token');
    assert.deepEqual(await client.customerMatches(identity),exact);
    for(const bad of invalid){payload=bad;await assert.rejects(()=>client.customerMatches(identity),e=>e.code==='INVALID_RESPONSE');}
    checks.push('Client binds identity, IDs, unique rows and shapes; bearer POST omits cookies and rejects redirects/substituted results');
    console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,transport:pg?'PGlite in-memory PostgreSQL with real scopedConnect/RLS':'deterministic transport with real scopedConnect'},null,2));
  }finally{delete global.himotoPool;if(pg)await pg.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});

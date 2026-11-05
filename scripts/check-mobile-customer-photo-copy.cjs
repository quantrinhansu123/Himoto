// Synthetic only. Never loads env, providers or operational data.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {NextRequest}=require('next/server'),{load,root}=require('./lib/load-typescript.cjs');
async function run(){
  const checks=[],dto=load(path.resolve(root,'../shared/mobile-customer-photo-copy')),ops=load(path.resolve(root,'../shared/mobile-write-recovery'));
  assert(ops.isMobileWriteOperation('media.copy:101'));assert(!ops.isMobileWriteOperation('media.copy:0'));
  const preview={id:101,revision:'10',customerId:201,sourceCount:4,presentCount:1,missingCount:3,snapshot:'a'.repeat(64),observedAt:new Date().toISOString()};
  assert(dto.isCustomerPhotoCopyReview(preview));assert(!dto.isCustomerPhotoCopyReview({...preview,missingCount:4}));
  checks.push('Copy operation and DTO bind contract/customer/counts/revision and snapshot');
  const flag=process.argv.indexOf('--pglite-path');
  if(flag>=0){
    const pg=new(require(path.resolve(process.argv[flag+1])).PGlite)();let lose=false,fail=false;
    const raw={release(){},async query(sql,values){if(fail&&sql.startsWith('INSERT INTO himoto.management_mobile_customer_photo_copies')){fail=false;throw Error('QA copy proof failure');}const r=await pg.query(sql,values);if(lose&&sql==='COMMIT'){lose=false;throw Error('QA lost copy commit');}return{...r,rowCount:r.rows.length||r.affectedRows||0};}};
    global.himotoPool={query:raw.query.bind(raw),connect:async()=>raw};
    try{
      await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
        CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);INSERT INTO himoto.users VALUES(7,'QA first'),(8,'QA other');
        CREATE TABLE himoto.orders(id bigint PRIMARY KEY,customer_id bigint,store_id bigint,deleted_at timestamptz);
        INSERT INTO himoto.orders VALUES(101,201,23,NULL),(102,202,24,NULL),(103,NULL,23,NULL),(104,201,23,NULL);
        CREATE TABLE himoto.customers(id bigint PRIMARY KEY,store_id bigint);INSERT INTO himoto.customers VALUES(201,23),(202,24);
        CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_by bigint,updated_at timestamptz DEFAULT now(),
          cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,PRIMARY KEY(entity_type,entity_id,slot));
        INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version) VALUES
          ('customers',201,'id_front','image/jpeg',decode('ffd8ff01','hex'),7,NULL,NULL,NULL),
          ('customers',201,'id_back','image/png',NULL,7,'qa/private-back','qa-cloud',17),
          ('customers',201,'driver_license','image/jpeg',decode('ffd8ff02','hex'),7,NULL,NULL,NULL),
          ('customers',201,'id_front-extra-2','image/png',decode('89504e47','hex'),7,NULL,NULL,NULL),
          ('customers',201,'portrait','image/jpeg',decode('ffd8ff03','hex'),7,NULL,NULL,NULL),
          ('customers',202,'id_front','image/jpeg',decode('ffd8ff04','hex'),7,NULL,NULL,NULL),
          ('contracts',101,'customer-id-front','image/jpeg',decode('ffd8ff99','hex'),8,NULL,NULL,NULL);
        CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
        GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT,UPDATE ON himoto.orders TO himoto_scoped;GRANT SELECT ON himoto.customers TO himoto_scoped;
        GRANT SELECT,INSERT,UPDATE,DELETE ON himoto.management_record_photos TO himoto_scoped;
        ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY orders ON himoto.orders TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
        ALTER TABLE himoto.customers ENABLE ROW LEVEL SECURITY;CREATE POLICY customers ON himoto.customers TO himoto_scoped USING(himoto.access_store(store_id));
        ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;
        CREATE POLICY photos ON himoto.management_record_photos TO himoto_scoped USING((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) OR (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id)))
          WITH CHECK((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) OR (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id)));
        ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated;
      `);
      for(const name of ['2026-10-31-mobile-writes.sql','2026-11-03-mobile-customer-photo-copies.sql'])await pg.exec(fs.readFileSync(path.resolve(root,'../docs/sql',name),'utf8'));
      const service=load(path.join(root,'lib/server/mobile-customer-photo-copy')),resolver=load(path.join(root,'lib/server/mobile-write-recovery'));
      const user={id:7,name:'QA actor',role:'staff',access_role:'custom',permissions:[],store_id:23,scope_all:false},req=new NextRequest('https://fixture.invalid/copy');
      const read=id=>service.readCustomerPhotoCopyReview(user,String(id),req),copy=(p,key=randomUUID(),body={})=>service.copyMobileCustomerPhotos(user,String(p.id),new NextRequest('https://fixture.invalid/copy',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Record-Revision':p.revision,'X-Customer-Photo-Snapshot':p.snapshot},body:JSON.stringify(body)}));
      const resolve=(id,key)=>resolver.resolveMobileWrite(user,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:dto.customerPhotoCopyOperation(id)})}));
      const before=await read(101);assert.equal(before.sourceCount,4);assert.equal(before.missingCount,3);
      await assert.rejects(()=>copy(before,randomUUID(),{customer_id:202}),e=>e.code==='INVALID_CUSTOMER_PHOTO_COPY');
      await assert.rejects(()=>read(102),e=>e.status===404);
      const key=randomUUID(),proof=await copy(before,key);assert(dto.isCustomerPhotoCopyReceipt(proof));assert.equal(proof.copied,3);assert(proof.current);assert.deepEqual(await copy(before,key),{...proof,replayed:true});
      const rows=(await pg.query("SELECT slot,mime_type,data,updated_by,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=101 ORDER BY slot")).rows;
      assert.equal(rows.length,4);assert.equal(Buffer.from(rows.find(r=>r.slot==='customer-id-front').data).toString('hex'),'ffd8ff99');
      const cloud=rows.find(r=>r.slot==='customer-id-back');assert.equal(cloud.data,null);assert.equal(cloud.mime_type,'image/png');assert.equal(cloud.cloudinary_public_id,'qa/private-back');assert.equal(Number(cloud.cloudinary_version),17);
      assert(rows.some(r=>r.slot==='customer-id-front-extra-2'));assert(!rows.some(r=>r.slot==='portrait'));
      checks.push('Exact web domain copies missing inline/cloud/supplemental papers with actor metadata; existing contract images remain byte-for-byte unchanged; auth/RLS matches web without profile-write grants');
      await pg.query("UPDATE himoto.management_record_photos SET data=decode('ffd8ff77','hex') WHERE entity_type='customers' AND entity_id=201 AND slot='driver_license'");
      assert((await service.readCustomerPhotoCopyReceipt(user,'101',key)).receipt.current);
      assert.equal((await copy(await read(101))).copied,0);assert.equal((await copy(await read(103))).copied,0);
      assert.equal((await service.readCustomerPhotoCopyReceipt({...user,id:8},'101',key)).receipt,null);assert.equal((await resolve(101,key)).status,'committed');
      await pg.query("UPDATE himoto.management_record_photos SET data=decode('ffd8ff88','hex') WHERE entity_type='contracts' AND entity_id=101 AND slot='customer-driver-license'");
      const old=(await service.readCustomerPhotoCopyReceipt(user,'101',key)).receipt;assert.equal(old.copied,3);assert.equal(old.current,false);assert.equal(old.photosCurrent,false);
      checks.push('No-op/no-customer copies have immutable proofs; source edits leave contract copies independent, destination changes mark the original proof stale, and actor isolation prevents receipt leakage');
      const pending=await read(104),cancel=randomUUID();assert.equal((await resolve(104,cancel)).status,'cancelled');await assert.rejects(()=>copy(pending,cancel),e=>e.code==='REQUEST_CANCELLED');
      fail=true;await assert.rejects(()=>copy(pending),/QA copy proof failure/);assert.equal(Number((await pg.query("SELECT count(*) AS n FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=104")).rows[0].n),0);
      const lost=randomUUID();lose=true;await assert.rejects(()=>copy(pending,lost),/QA lost copy commit/);assert.equal((await resolve(104,lost)).status,'committed');assert.equal((await service.readCustomerPhotoCopyReceipt(user,'104',lost)).receipt.copied,4);
      const stale=await read(104);await pg.query("UPDATE himoto.management_record_photos SET data=decode('ffd8ff66','hex') WHERE entity_type='customers' AND entity_id=201 AND slot='id_front'");await assert.rejects(()=>copy(stale),e=>e.code==='CUSTOMER_PHOTO_COPY_REVIEW_REQUIRED');
      const grants=(await pg.query("SELECT has_table_privilege('anon','himoto.management_mobile_customer_photo_copies','SELECT') AS anon,has_table_privilege('authenticated','himoto.management_mobile_customer_photo_copies','INSERT') AS auth,has_table_privilege('himoto_scoped','himoto.management_mobile_customer_photo_copies','DELETE') AS deletes")).rows[0];assert.deepEqual(grants,{anon:false,auth:false,deletes:false});
      checks.push('Failed proof insertion rolls back photos without undoing metadata; lost commits recover exactly once, cancelled keys reject late delivery, changed review rejects, and proof grants remain actor-scoped/append-only');
      const api=load(path.resolve(root,'../mobile/src/lib/api')).createApi('https://fixture.invalid','hm1_'+'a'.repeat(43)),savedFetch=global.fetch;
      try{
        global.fetch=async()=>Response.json({...before,id:999});await assert.rejects(()=>api.customerPhotoCopyReview(101),e=>e.code==='INVALID_RESPONSE');
        for(const substituted of [{...proof,requestId:randomUUID()},{...proof,id:999},{...proof,customerId:202},{...proof,copied:4,presentCount:0}]){
          global.fetch=async()=>Response.json(substituted);await assert.rejects(()=>api.copyCustomerPhotos(before,key),e=>e.code==='INVALID_RESPONSE');
        }
        global.fetch=async()=>Response.json({receipt:{...proof,requestId:randomUUID()}});await assert.rejects(()=>api.customerPhotoCopyReceipt(101,key),e=>e.code==='INVALID_RESPONSE');
      }finally{global.fetch=savedFetch;}
      checks.push('Client rejects substituted contract/customer/request/counts and cannot acknowledge a different copy proof');
    }finally{await pg.close();delete global.himotoPool;}
  }
  console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});

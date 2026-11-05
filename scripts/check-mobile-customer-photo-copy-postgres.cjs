// Actual PostgreSQL connections/locks on the pinned loopback QA cluster only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const openQa=require('./lib/mobile_postgres_qa.cjs'),{NextRequest}=require('next/server'),{load,root}=require('./lib/load-typescript.cjs');
const arg=process.argv.indexOf('--output');assert(arg>=0&&process.argv[arg+1]);const output=path.resolve(process.argv[arg+1]);
assert(output.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(output));fs.mkdirSync(output,{recursive:true});
const checks=[];let db;
const user={id:7,name:'QA race',role:'staff',access_role:'custom',permissions:[],store_id:23,scope_all:false};
const getRequest=()=>new NextRequest('https://fixture.invalid/copy');
async function run(){
  db=await openQa();fs.writeFileSync(path.join(output,'database.json'),JSON.stringify(db.connection,null,2));
  await db.pool.query(`CREATE SCHEMA himoto;
    CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);INSERT INTO himoto.users VALUES(7,'QA actor');
    CREATE TABLE himoto.orders(id bigint PRIMARY KEY,customer_id bigint,store_id bigint,deleted_at timestamptz);
    INSERT INTO himoto.orders SELECT n,201,23,NULL FROM generate_series(101,106) n;
    CREATE TABLE himoto.customers(id bigint PRIMARY KEY,store_id bigint);INSERT INTO himoto.customers VALUES(201,23);
    CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_by bigint,updated_at timestamptz DEFAULT now(),
      cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,PRIMARY KEY(entity_type,entity_id,slot));
    INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('customers',201,'id_front','image/jpeg',decode('ffd8ff01','hex'),7);
    CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
    GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT,UPDATE ON himoto.orders TO himoto_scoped;GRANT SELECT ON himoto.customers TO himoto_scoped;
    GRANT SELECT,INSERT,UPDATE,DELETE ON himoto.management_record_photos TO himoto_scoped;
    ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY orders ON himoto.orders TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
    ALTER TABLE himoto.customers ENABLE ROW LEVEL SECURITY;CREATE POLICY customers ON himoto.customers TO himoto_scoped USING(himoto.access_store(store_id));
    ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY photos ON himoto.management_record_photos TO himoto_scoped USING((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) OR (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id)))
      WITH CHECK((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) OR (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id)));
  `);
  for(const file of ['2026-10-31-mobile-writes.sql','2026-11-03-mobile-customer-photo-copies.sql'])await db.pool.query(fs.readFileSync(path.resolve(root,'../docs/sql',file),'utf8'));
  const service=load(path.join(root,'lib/server/mobile-customer-photo-copy')),resolver=load(path.join(root,'lib/server/mobile-write-recovery'));
  const review=id=>service.readCustomerPhotoCopyReview(user,String(id),getRequest());
  const copy=(prepared,key)=>service.copyMobileCustomerPhotos(user,String(prepared.id),new NextRequest('https://fixture.invalid/copy',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Record-Revision':prepared.revision,'X-Customer-Photo-Snapshot':prepared.snapshot},body:'{}'}));
  const resolve=(id,key)=>resolver.resolveMobileWrite(user,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:`media.copy:${id}`})}));
  const count=async id=>Number((await db.pool.query("SELECT count(*) AS n FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1",[id])).rows[0].n);
  {
    const prepared=await review(101),key=randomUUID(),hold=db.hold('same-copy-first',sql=>sql.startsWith('INSERT INTO himoto.management_mobile_customer_photo_copies'));
    const first=db.task('same-copy-first',()=>copy(prepared,key));await hold.entered.promise;
    const second=db.task('same-copy-second',()=>copy(prepared,key));await db.blocked('same-copy-second','same-copy-first');hold.release.resolve();
    const [a,b]=await Promise.all([first,second]);assert(a.ok);if(!b.ok)assert.equal(b.error.code,'CUSTOMER_PHOTO_COPY_REVIEW_REQUIRED');
    assert.equal(await count(101),1);assert.equal((await resolve(101,key)).status,'committed');assert.equal((await copy(prepared,key)).replayed,true);
    assert.equal(Number((await db.pool.query('SELECT count(*) AS n FROM himoto.management_mobile_customer_photo_copies WHERE order_id=101')).rows[0].n),1);
    checks.push('Two physical PostgreSQL sessions using one UUID block on the real request row; one copy/proof commits and serialization recovery resolves/replays the same original result');
  }
  {
    const prepared=await review(102),key=randomUUID(),hold=db.hold('committing-copy',sql=>sql.startsWith('INSERT INTO himoto.management_mobile_customer_photo_copies'));
    const writing=db.task('committing-copy',()=>copy(prepared,key));await hold.entered.promise;
    const resolving=db.task('resolve-copy-commit',()=>resolve(102,key));await db.blocked('resolve-copy-commit','committing-copy');hold.release.resolve();
    const [a,b]=await Promise.all([writing,resolving]);assert(a.ok&&b.ok);assert.equal(b.value.status,'committed');assert.equal(await count(102),1);
    checks.push('Resolver waits for an uncommitted copy transaction and returns committed after it wins; it cannot tombstone an already committed copy');
  }
  {
    const prepared=await review(103),key=randomUUID(),hold=db.hold('cancelling-copy',sql=>sql.startsWith('INSERT INTO himoto.management_mobile_requests'));
    const resolving=db.task('cancelling-copy',()=>resolve(103,key));await hold.entered.promise;
    const writing=db.task('late-copy',()=>copy(prepared,key));await db.blocked('late-copy','cancelling-copy');hold.release.resolve();
    const [a,b]=await Promise.all([resolving,writing]);assert(a.ok);assert.equal(a.value.status,'cancelled');assert(!b.ok);assert(['REQUEST_CANCELLED','CUSTOMER_PHOTO_COPY_REVIEW_REQUIRED'].includes(b.error.code));
    await assert.rejects(()=>copy(prepared,key),e=>e.code==='REQUEST_CANCELLED');assert.equal(await count(103),0);
    checks.push('Cancellation wins the real request-row race; concurrent and later copy deliveries cannot write any photo or resurrect the cancelled UUID');
  }
  {
    const prepared=await review(104),key=randomUUID(),hold=db.hold('copy-locked-order',sql=>sql.startsWith('INSERT INTO himoto.management_mobile_customer_photo_copies'));
    const copying=db.task('copy-locked-order',()=>copy(prepared,key));await hold.entered.promise;
    const moving=db.task('change-order-customer',async()=>{const client=await global.himotoPool.connect();try{await client.query('BEGIN');await client.query('UPDATE himoto.orders SET customer_id=NULL WHERE id=104');await client.query('COMMIT');}finally{client.release();}});
    await db.blocked('change-order-customer','copy-locked-order');hold.release.resolve();const [a,b]=await Promise.all([copying,moving]);assert(a.ok&&b.ok);
    const proof=(await service.readCustomerPhotoCopyReceipt(user,'104',key)).receipt;assert.equal(proof.copied,1);assert.equal(proof.customerId,201);assert.equal(proof.parentCurrent,false);assert.equal(await count(104),1);
    checks.push('Copy locks the original order while another connection changes its customer; original proof stays bound to customer201 and later read marks its parent stale');
  }
  {
    const prepared=await review(105),key=randomUUID(),hold=db.hold('snapshot-copy',sql=>sql.startsWith('SELECT slot,xmin::text AS revision')&&sql.includes('entity_type=$1'));
    const copying=db.task('snapshot-copy',()=>copy(prepared,key));await hold.entered.promise;
    await db.pool.query("UPDATE himoto.management_record_photos SET data=decode('ffd8ff02','hex') WHERE entity_type='customers' AND entity_id=201");hold.release.resolve();const a=await copying;assert(a.ok);
    const copied=(await db.pool.query("SELECT data FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=105")).rows[0];assert.equal(copied.data.toString('hex'),'ffd8ff01');
    assert((await service.readCustomerPhotoCopyReceipt(user,'105',key)).receipt.current);
    checks.push('REPEATABLE READ copies the exact reviewed source bytes when another connection edits the customer image in flight; subsequent source edits leave the contract snapshot independent');
  }
  assert(db.observations.length>=4&&db.sessionPids().length>=2);
  const result={status:'passed',passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,physicalPostgresSessions:db.sessionPids(),realLockObservations:db.observations,connection:db.connection,completedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,passed:checks.length,physicalPostgresSessions:result.physicalPostgresSessions.length,realLockObservations:result.realLockObservations.length,fixtureOnly:true},null,2));
}
run().catch(error=>{fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({status:'failed',passed:checks.length,checks,error:String(error),code:error.code},null,2));console.error(error);process.exitCode=1;}).finally(async()=>{if(db)await db.close();});

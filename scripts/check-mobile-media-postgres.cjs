// Actual PostgreSQL sessions/locks with synthetic records; no environment files.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const openQa=require('./lib/mobile_postgres_qa.cjs');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const at=process.argv.indexOf('--output');if(at<0||!process.argv[at+1])throw Error('Pass a new --output path inside .backups');
const output=path.resolve(process.argv[at+1]),backups=path.resolve('.backups');
assert(output.startsWith(backups+path.sep)&&!fs.existsSync(output));fs.mkdirSync(output,{recursive:true});
const checks=[];let db;
const image=Buffer.from([255,216,255,1]),otherImage=Buffer.from([255,216,255,2]);
const sha=data=>createHash('sha256').update(data).digest('hex');
const user={id:7,name:'QA actor7',role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['contracts.read']};
const sources=()=>{
  const files=[];for(const dir of ['src/lib/server','src/lib/management','shared'])for(const file of fs.readdirSync(dir,{recursive:true}))if(/\.tsx?$/.test(file))files.push(path.join(dir,file));
  files.push('scripts/check-mobile-media-postgres.cjs','scripts/lib/mobile_postgres_qa.cjs','scripts/lib/offline-tests.cjs','scripts/lib/load-typescript.cjs',
    'docs/sql/2026-10-31-mobile-writes.sql','docs/sql/2026-11-02-mobile-record-media.sql','package.json','package-lock.json');
  return Object.fromEntries(files.sort().map(p=>[p,sha(fs.readFileSync(p))]));
};
const beforeSource=sources();
async function run(){
  db=await openQa();fs.writeFileSync(path.join(output,'database.json'),JSON.stringify(db.connection,null,2));
  const q=db.pool.query.bind(db.pool);
  await q(`CREATE SCHEMA himoto;
    CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);
    CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,deleted_at timestamptz,draft_payload jsonb DEFAULT '{}',order_status text DEFAULT 'renting');
    CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,store_id bigint,current_store_id bigint,name text,license text,status text DEFAULT 'ready',deleted_at timestamptz);
    CREATE TABLE himoto.order_vehicle_details(id bigint PRIMARY KEY,order_id bigint,vehicle_id bigint,deleted_at timestamptz,completed_at timestamptz);
    CREATE TABLE himoto.vehicle_location_events(id bigint PRIMARY KEY,vehicle_id bigint,event_type text);
    CREATE TABLE himoto.management_contract_vehicle_swaps(id bigint PRIMARY KEY,order_id bigint,from_vehicle_id bigint,to_vehicle_id bigint);
    CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_by bigint,updated_at timestamptz DEFAULT now(),
      cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,object_bucket text,object_key text,object_etag text,PRIMARY KEY(entity_type,entity_id,slot));
    CREATE FUNCTION himoto.contract_vehicle_labels() RETURNS SETOF himoto.vehicles LANGUAGE sql STABLE AS 'SELECT * FROM himoto.vehicles';
    GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
    GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;
    ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;
    CREATE POLICY qa_orders ON himoto.orders TO himoto_scoped USING(current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
    ALTER TABLE himoto.vehicles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY qa_vehicles ON himoto.vehicles TO himoto_scoped USING(current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
    ALTER TABLE himoto.order_vehicle_details ENABLE ROW LEVEL SECURITY;
    CREATE POLICY qa_lines ON himoto.order_vehicle_details TO himoto_scoped USING(EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id));
    ALTER TABLE himoto.vehicle_location_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY qa_events ON himoto.vehicle_location_events TO himoto_scoped USING(EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=vehicle_id));
    ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY qa_photos ON himoto.management_record_photos TO himoto_scoped USING(
      (entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) OR
      (entity_type='vehicles' AND EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=entity_id)));
    INSERT INTO himoto.users VALUES(7,'QA actor7'),(8,'QA actor8');`);
  for(const name of ['2026-10-31-mobile-writes.sql','2026-11-02-mobile-record-media.sql'])await q(fs.readFileSync(path.join('docs/sql',name),'utf8'));
  const media=load(path.join(root,'lib/server/mobile-record-media')),writer=load(path.join(root,'lib/server/mobile-record-media-write')),resolver=load(path.join(root,'lib/server/mobile-write-recovery'));
  const req=()=>new NextRequest('https://fixture.invalid/qa');
  async function seed(n,{vehicle=false,store=23}={}){
    const id=600000+n,vid=700000+n,line=800000+n,event=900000+n;
    await q('INSERT INTO himoto.orders(id,store_id) VALUES($1,$2)',[id,store]);
    await q('INSERT INTO himoto.vehicles(id,store_id,current_store_id,name,license) VALUES($1,$2,$2,$3,$4)',[vid,store,'Synthetic vehicle','QA-'+n]);
    await q('INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id) VALUES($1,$2,$3)',[line,id,vid]);
    await q("INSERT INTO himoto.vehicle_location_events VALUES($1,$2,'manual_transfer')",[event,vid]);
    const target={entity:vehicle?'vehicles':'contracts',id:String(vehicle?vid:id),kind:vehicle?'transfer':'return',referenceId:String(vehicle?event:line)};
    const slot=vehicle?`transfer-${event}-1`:`return-${line}-document-2`;
    await q("INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES($1,$2,$3,'image/jpeg',$4,7)",[target.entity,target.id,slot,Buffer.from([255,216,255,0])]);
    const actor={...user,store_id:store};const info=await media.readMobileMediaSlotInfo(actor,target,slot,req());return{target,slot,info,actor};
  }
  function write(c,key,actor=c.actor,data=image){return writer.uploadMobileRecordMedia(actor,c.target,c.slot,new NextRequest('https://fixture.invalid/qa',{method:'PUT',headers:{'Content-Type':'image/jpeg','Idempotency-Key':key,
    'X-Record-Revision':c.info.target.revision,'X-Reference-Revision':c.info.target.referenceRevision,'X-Photo-Revision':c.info.photo.revision,'X-Media-Snapshot':c.info.target.snapshot},body:data}));}
  const operation=c=>`media.${c.target.entity==='vehicles'?'vehicle':'contract'}:${c.target.id}`;
  const resolve=(c,key,actor=c.actor)=>resolver.resolveMobileWrite(actor,key,new NextRequest('https://fixture.invalid/qa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:operation(c)})}));
  const holdParent=(flow,c)=>db.hold(flow,sql=>sql.includes('FROM himoto.'+(c.target.entity==='vehicles'?'vehicles':'orders'))&&sql.includes('FOR UPDATE'));
  const task=(flow,work)=>db.task(flow,work);
  const entered=(gate,work)=>Promise.race([gate.entered.promise,work.then(r=>{if(!r.ok)throw r.error;throw Error('QA operation ended before its lock barrier');})]);
  const ok=r=>{if(!r.ok)throw r.error;return r.value;};
  const photo=async c=>(await q('SELECT data,xmin::text AS revision FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3',[c.target.entity,c.target.id,c.slot])).rows[0];
  const count=async(c,table='management_mobile_record_media')=>Number((await q('SELECT count(*) AS n FROM himoto.'+table+' WHERE entity_type=$1 AND entity_id=$2',[c.target.entity,c.target.id])).rows[0].n);
  // All barriers pause after a real lock, and pg_blocking_pids proves the wait.
  {
    const c=await seed(1),key=randomUUID(),gate=holdParent('retry-A',c),a=task('retry-A',()=>write(c,key));await entered(gate,a);
    const b=task('retry-B',()=>write(c,key));await db.blocked('retry-B','retry-A');gate.release.resolve();const [first,second]=(await Promise.all([a,b])).map(ok);
    assert(!first.replayed&&second.replayed);assert.equal(first.requestId,second.requestId);assert.equal(first.sha256,second.sha256);assert.equal(await count(c),1);
    checks.push('Two actual sessions with the same actor/UUID block on the unique request and commit one photo/proof; retry returns the original receipt');
  }
  for(const [n,vehicle] of [[2,false],[3,true]]){
    const c=await seed(n,{vehicle}),ka=randomUUID(),kb=randomUUID(),gate=holdParent('stale-A-'+n,c),a=task('stale-A-'+n,()=>write(c,ka));await entered(gate,a);
    const b=task('stale-B-'+n,()=>write(c,kb));await db.blocked('stale-B-'+n,'stale-A-'+n);gate.release.resolve();const [ra,rb]=await Promise.all([a,b]);ok(ra);assert(!rb.ok&&rb.error.code==='MEDIA_REVIEW_REQUIRED');
    assert.equal(await count(c),1);assert.equal((await q('SELECT count(*) AS n FROM himoto.management_mobile_requests WHERE user_id=7 AND request_id=$1',[kb])).rows[0].n,'0');assert.equal(sha((await photo(c)).data),sha(image));
    checks.push(`Competing ${vehicle?'vehicle event':'contract line'} image UUIDs really block on the parent; stale photo revision rejects the second and rolls its request back without overwriting the first`);
  }
  {
    const c=await seed(4),key=randomUUID(),old=await photo(c),gate=db.hold('cancel-A',sql=>sql.includes('INSERT INTO himoto.management_mobile_requests'));
    const a=task('cancel-A',()=>resolve(c,key));await entered(gate,a);const b=task('late-B',()=>write(c,key));await db.blocked('late-B','cancel-A');gate.release.resolve();
    const [ra,rb]=await Promise.all([a,b]);assert.equal(ok(ra).status,'cancelled');assert(!rb.ok&&rb.error.code==='REQUEST_CANCELLED');assert.deepEqual(await photo(c),old);assert.equal(await count(c),0);
    checks.push('A real uncommitted cancellation blocks a late image session; the durable tombstone wins and no photo/proof changes');
  }
  {
    const c=await seed(5,{vehicle:true}),key=randomUUID(),gate=holdParent('commit-A',c),a=task('commit-A',()=>write(c,key));await entered(gate,a);
    const b=task('resolve-B',()=>resolve(c,key));await db.blocked('resolve-B','commit-A');gate.release.resolve();const [ra,rb]=await Promise.all([a,b]);const saved=ok(ra),resolved=ok(rb);
    assert.equal(resolved.status,'committed');assert.equal(resolved.receipt.id,saved.id);assert.equal(resolved.receipt.revision,saved.revision);assert.equal(await count(c),1);
    checks.push('Resolver waits for an in-flight vehicle image commit and reports the original committed receipt instead of cancelling or writing again');
  }
  {
    const c=await seed(6),key=randomUUID(),old=await photo(c),gate=holdParent('rollback-A',c);db.fail('rollback-A',sql=>sql.includes('INSERT INTO himoto.management_mobile_record_media'));
    const a=task('rollback-A',()=>write(c,key));await entered(gate,a);const b=task('rollback-resolve-B',()=>resolve(c,key));await db.blocked('rollback-resolve-B','rollback-A');gate.release.resolve();
    const [ra,rb]=await Promise.all([a,b]);assert(!ra.ok&&/QA forced rollback/.test(ra.error.message));assert.equal(ok(rb).status,'cancelled');assert.deepEqual(await photo(c),old);assert.equal(await count(c),0);
    const retry=await db.task('rollback-late',()=>write(c,key));assert(!retry.ok&&retry.error.code==='REQUEST_CANCELLED');
    checks.push('A failed writer releases real request/photo locks through rollback; waiting resolver cancels safely and every late same-key retry is blocked');
  }
  {
    const c=await seed(7),key=randomUUID(),gate=holdParent('bytes-A',c),a=task('bytes-A',()=>write(c,key));await entered(gate,a);
    const b=task('bytes-B',()=>write(c,key,c.actor,otherImage));await db.blocked('bytes-B','bytes-A');gate.release.resolve();const [ra,rb]=await Promise.all([a,b]);ok(ra);assert(!rb.ok&&rb.error.code==='REQUEST_KEY_REUSED');assert.equal(await count(c),1);assert.equal(sha((await photo(c)).data),sha(image));
    checks.push('Concurrent same-UUID requests with different image hashes conflict after the actual unique-key wait; original bytes/proof remain intact');
  }
  {
    const aCase=await seed(8),bCase=await seed(9,{store:24}),actorB={...bCase.actor,id:8,name:'QA actor8'},key=randomUUID();
    const ga=holdParent('actors-A',aCase),gb=holdParent('actors-B',bCase),a=task('actors-A',()=>write(aCase,key)),b=task('actors-B',()=>write(bCase,key,actorB));
    await Promise.all([entered(ga,a),entered(gb,b)]);ga.release.resolve();gb.release.resolve();const [ra,rb]=(await Promise.all([a,b])).map(ok);assert.equal(ra.actorId,7);assert.equal(rb.actorId,8);
    assert.equal((await writer.readMobileMediaReceipt(aCase.actor,key)).receipt.id,Number(aCase.target.id));assert.equal((await writer.readMobileMediaReceipt(actorB,key)).receipt.id,Number(bCase.target.id));
    await assert.rejects(()=>resolve(aCase,key,{...aCase.actor,store_id:24}),e=>e.code==='FORBIDDEN');await assert.rejects(()=>resolve(aCase,key,{...aCase.actor,permissions:[]}),e=>e.code==='FORBIDDEN');
    assert.equal((await resolve(aCase,key)).status,'committed');assert.equal((await resolve(bCase,key,actorB)).status,'committed');
    checks.push('Two actors/branches can hold independent transactions with the same UUID; scoped RLS returns only each original proof, and current branch/contract permission is enforced on resolution');
  }
  const borrowed=await Promise.all([db.pool.connect(),db.pool.connect()]);
  try{
    assert.equal(new Set(borrowed.map(c=>c.processID)).size,2);
    for(const client of borrowed){
      assert(db.sessionPids().includes(client.processID),'Inspect an actually used scoped session');
      const row=(await client.query("SELECT current_user AS actor_role,current_setting('himoto.actor_id',true) AS actor_id,current_setting('himoto.store_id',true) AS store_id,current_setting('himoto.scope_all',true) AS all_stores,current_setting('himoto.operation',true) AS operation,current_setting('himoto.transfer_vehicle_id',true) AS vehicle_id")).rows[0];
      assert.equal(row.actor_role,'himoto_qa_owner');for(const field of ['actor_id','store_id','all_stores','operation','vehicle_id'])assert(row[field]==null||row[field]==='',field+' leaked outside its transaction');
    }
  }finally{for(const client of borrowed)client.release();}
  checks.push('Both used PostgreSQL pool sessions reset role, actor, branch, all-stores, operation and pinned vehicle after scoped transactions; no prior user context leaks into the next borrower');
  assert.equal(db.observations.length,7);assert.deepEqual(sources(),beforeSource);
  const result={status:'passed',passed:checks.length,checks,connection:db.connection,lockObservations:db.observations,sessionPids:db.sessionPids(),fixtureOnly:true,operationalWrites:0,externalNetworkAllowed:false,
    sourceUnchanged:true,sourceFiles:beforeSource,limitations:['Minimal synthetic branch RLS fixture; full deployed ownership/HQ policies, staging performance and native backend integration remain separate acceptance'],completedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,sourceFiles:Object.keys(beforeSource).length},null,2));
}
run().catch(error=>{fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({status:'failed',checks,error:error.stack,connection:db?.connection,fixtureOnly:true,operationalWrites:0},null,2));console.error(error);process.exitCode=1;}).finally(async()=>{if(db)await db.close();});

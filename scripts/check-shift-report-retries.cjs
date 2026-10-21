// Real PostgreSQL transactions and RLS, with every business table redirected to TEMP.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const database=load(path.join(root,'lib/server/himoto-database'));
const session=load(path.join(root,'lib/server/management-session'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {SHIFT_PHOTOS}=load(path.join(root,'lib/management/shift-reports'));
const checks=[];
const base={store_id:1,date:'2026-10-22',staff:'QA',vehicles:1,batteries:1,charged:1,transfers:0,cash:0,personal:0,company:0,electricity_off:true,notes:''};
let actor={id:1,store_id:1,scope_all:false,access_role:'branch_staff',permissions:['contracts.read','contracts.draft']};
const sqlForTemp=sql=>sql.replaceAll('himoto.','pg_temp.').replaceAll("'pg_temp.scope_all'","'himoto.scope_all'").replaceAll("'pg_temp.store_id'","'himoto.store_id'");
async function main(){
  const c=await database.ownerDatabase.connect();
  const descriptors=Object.getOwnPropertyDescriptors(database.himotoPool),originalSession=session.userFromSession,originalReadSession=session.readSessionUser;
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL statement_timeout='15s'");
    await c.query('CREATE TEMP TABLE stores(id bigint PRIMARY KEY); CREATE TEMP TABLE users(id bigint PRIMARY KEY); INSERT INTO stores VALUES(1),(2); INSERT INTO users VALUES(1),(2)');
    for(const name of ['2026-10-22-shift-reports.sql','2026-10-22-shift-report-requests.sql']) {
      const sql=sqlForTemp(fs.readFileSync(path.join(process.cwd(),'docs/sql',name),'utf8').replace(/^BEGIN;|^COMMIT;/gm,''));
      await c.query(sql);
      if(name.includes('requests'))await c.query(sql); // Migration can be rerun safely.
    }
    await c.query('GRANT SELECT ON stores,users TO himoto_scoped');
    const scope=async()=>{
      const current=dataAccess.getStore();
      await c.query("SELECT set_config('himoto.scope_all',$1,true),set_config('himoto.store_id',$2,true)",[String(current.scope_all),String(current.store_id)]);
      await c.query('SET LOCAL ROLE himoto_scoped');
    };
    const proxy={release(){},async query(sql,values){
      if(sql==='BEGIN'){await c.query('SAVEPOINT qa_shift_request');await scope();return {rows:[],rowCount:0};}
      if(sql==='COMMIT'){await c.query('RELEASE SAVEPOINT qa_shift_request');await c.query('RESET ROLE');return {rows:[],rowCount:0};}
      if(sql==='ROLLBACK'){await c.query('ROLLBACK TO SAVEPOINT qa_shift_request');await c.query('RELEASE SAVEPOINT qa_shift_request');await c.query('RESET ROLE');return {rows:[],rowCount:0};}
      return c.query(sqlForTemp(sql),values);
    }};
    Object.defineProperty(database.himotoPool,'connect',{configurable:true,value:async()=>proxy});
    let photoReadQueries=0;
    Object.defineProperty(database.himotoPool,'query',{configurable:true,value:async(sql,values)=>{
      photoReadQueries++;await proxy.query('BEGIN');
      try { const result=await proxy.query(sql,values);await proxy.query('COMMIT');return result; }
      catch(error){await proxy.query('ROLLBACK');throw error;}
    }});
    session.userFromSession=async()=>actor;
    session.readSessionUser=async()=>actor;
    const reports=load(path.join(root,'app/api/auth/shift-reports/route'));
    const photos=load(path.join(root,'app/api/auth/shift-reports/[id]/photos/[slot]/route'));
    const readPhoto=(id,slot)=>photos.GET(new NextRequest(`http://localhost/api/auth/shift-reports/${id}/photos/${slot}`),{params:Promise.resolve({id:String(id),slot})});
    async function post(body,key=randomUUID()){
      const response=await reports.POST(new NextRequest('http://localhost/api/auth/shift-reports',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','x-shift-request-id':key},body:JSON.stringify(body)}));
      return {status:response.status,...await response.json()};
    }
    async function photo(id,slot,revision,key=randomUUID(),bytes=Buffer.from([255,216,255,1])){
      const response=await photos.PUT(new NextRequest(`http://localhost/api/auth/shift-reports/${id}/photos/${slot}`,{method:'PUT',headers:{origin:'http://localhost','content-type':'image/jpeg','x-report-revision':String(revision),'x-shift-request-id':key},body:bytes}),{params:Promise.resolve({id:String(id),slot})});
      return {status:response.status,...await response.json()};
    }
    const createBody={payload:base,status:'draft'},createKey=randomUUID();
    const first=await post(createBody,createKey);assert.equal(first.status,200,first.message);
    assert.deepEqual(await post(createBody,createKey),first);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM pg_temp.management_shift_reports')).rows[0].n,1);
    assert.equal((await post({...createBody,payload:{...base,cash:10}},createKey)).status,409);
    assert.equal((await post(createBody,'bad-key')).status,400);
    actor={...actor,id:2};assert.equal((await post(createBody,createKey)).status,409);actor={...actor,id:1};
    checks.push('Create replay returns the original ID/revision without a duplicate; key reuse with changed data or another actor is rejected.');
    const id=first.data.id,editKey=randomUUID(),editBody={id,revision:1,payload:{...base,staff:'QA edited'},status:'draft'};
    const edit=await post(editBody,editKey);assert.equal(edit.status,200);assert.equal(edit.data.revision,2);
    assert.deepEqual(await post(editBody,editKey),edit);
    const newer={...editBody,revision:2,payload:{...editBody.payload,notes:'Another editor'}};
    assert.equal((await post(newer)).data.revision,3);
    assert.deepEqual(await post(editBody,editKey),edit); // Replay never hands out a newer writer's revision.
    assert.equal((await photo(id,'vehicles',2)).status,409);
    assert.equal((await post({...editBody,revision:2})).status,409);
    checks.push('Draft replay does not increment revision; another editor remains protected by revision checks after a replay.');
    const photoKey=randomUUID(),uploaded=await photo(id,'vehicles',3,photoKey);assert.equal(uploaded.status,200);assert.equal(uploaded.data.revision,4);
    assert.deepEqual(await photo(id,'vehicles',3,photoKey),uploaded);
    const image=await readPhoto(id,'vehicles');assert.equal(image.status,200);
    assert.equal((await image.arrayBuffer()).byteLength,4);assert.equal(image.headers.get('cache-control'),'private, no-store');assert.equal(photoReadQueries,1);
    checks.push('Image reads use one SQL statement without row locks and preserve authenticated private responses.');
    assert.equal((await photo(id,'vehicles',3,photoKey,Buffer.from([255,216,255,2]))).status,409);
    assert.equal((await c.query('SELECT revision FROM pg_temp.management_shift_reports WHERE id=$1',[id])).rows[0].revision,4);
    checks.push('Photo replay preserves bytes and revision; the same key cannot replace a different image.');
    let revision=4;
    for(const [slot] of SHIFT_PHOTOS.slice(1)){const saved=await photo(id,slot,revision);assert.equal(saved.status,200,saved.message);revision=saved.data.revision;}
    const submitKey=randomUUID(),submitBody={id,revision,payload:newer.payload,status:'submitted'};
    const submitted=await post(submitBody,submitKey);assert.equal(submitted.status,200,submitted.message);
    assert.deepEqual(await post(submitBody,submitKey),submitted);
    assert.equal((await photo(id,'vehicles',submitted.data.revision)).status,409);
    assert.equal((await post({...submitBody,revision:submitted.data.revision,status:'draft'})).status,409);
    checks.push('Six photos and safety confirmation allow submission; a lost submission response can be replayed while submitted reports stay locked.');
    const partial=await post({payload:{...base,date:'2026-10-23'},status:'draft'});assert.equal(partial.status,200);
    assert.equal((await post({id:partial.data.id,revision:1,payload:{...base,date:'2026-10-23',electricity_off:false},status:'submitted'})).status,400);
    assert.equal((await post({id:partial.data.id,revision:1,payload:{...base,date:'2026-10-23'},status:'submitted'})).status,200);
    actor={...actor,store_id:2};
    assert.equal((await readPhoto(id,'vehicles')).status,404);
    assert.equal((await post(createBody,createKey)).status,403);
    assert.equal((await photo(id,'vehicles',3,photoKey)).status,404);
    await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','2',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    assert.equal((await c.query('SELECT count(*)::int AS n FROM pg_temp.management_shift_requests')).rows[0].n,0);
    await c.query('RESET ROLE');
    checks.push('Incomplete reports cannot submit; branch checks and PostgreSQL RLS hide reports, photos and replay receipts outside the assigned branch.');
    console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
  } finally {
    session.userFromSession=originalSession;
    session.readSessionUser=originalReadSession;
    Object.defineProperties(database.himotoPool,descriptors);
    await c.query('ROLLBACK');c.release();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});

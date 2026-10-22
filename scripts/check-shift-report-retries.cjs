// Real PostgreSQL transactions and RLS, with every business table redirected to TEMP.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const database=load(path.join(root,'lib/server/himoto-database'));
const session=load(path.join(root,'lib/server/management-session'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {SHIFT_PHOTOS}=load(path.join(root,'lib/management/shift-reports'));
const auditDomain=load(path.join(root,'lib/management/shift-audits'));
const snapshotSource=load(path.join(root,'lib/server/shift-audits'));
const fixtureSnapshot={captured_at:'2026-10-22T12:00:00Z',date:'2026-10-22',fingerprint:'fixture-source',values:{...auditDomain.emptyAuditValues(),other_vehicles:0,daily_vehicles:0,monthly_vehicles:0,vehicles:1,batteries:1,cash:0,personal:0,company:0,revenue_day:0,revenue_month:0},assets_total:1,revenue:{rental:0,renewal:0,late:0,early:0,revenue:0},unclassified_count:0,transfers:[],inventory_note:'QA fixture',accounts_note:'QA fixture'};
snapshotSource.readShiftSnapshot=async()=>fixtureSnapshot;
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
    for(const name of ['2026-10-22-shift-reports.sql','2026-10-22-shift-report-requests.sql','2026-10-22-shift-audits.sql']) {
      const sql=sqlForTemp(fs.readFileSync(path.join(process.cwd(),'docs/sql',name),'utf8').replace(/ALTER TABLE himoto.management_account_access[\s\S]*/, '').replace(/^BEGIN;|^COMMIT;/gm,'')).replaceAll('pg_temp.access_store(', 'himoto.access_store(');
      for(const statement of sql.split(';').filter(s=>s.trim())) {
        assert(!/\bhimoto\.(management_shift_\w+|stores|users)\b/.test(statement),'Business DDL must only target TEMP');
        try{await c.query(statement);}catch(error){error.message=`${name}: ${statement.trim().slice(0,100)}: ${error.message}`;throw error;}
      }
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
    actor={...actor,store_id:1};
    const mediaRoute=load(path.join(root,'app/api/auth/shift-reports/[id]/media/[mediaId]/route'));
    const auditRoute=load(path.join(root,'app/api/auth/shift-reports/[id]/audit/route'));
    async function evidence(reportId,mediaId,category,revision,stage='pgd',method='PUT',key=mediaId){
      const response=await mediaRoute[method](new NextRequest(`http://localhost/api/auth/shift-reports/${reportId}/media/${mediaId}`,{method,headers:{origin:'http://localhost','content-type':'image/jpeg','x-shift-request-id':key,'x-report-revision':String(revision),'x-shift-stage':stage,'x-shift-category':category,'x-file-name':encodeURIComponent('Ảnh QA.jpg')},...(method==='PUT'?{body:Buffer.from([255,216,255,9])}:{})}),{params:Promise.resolve({id:String(reportId),mediaId})});
      return {status:response.status,...await response.json()};
    }
    const mediaDraft=await post({payload:{...base,date:'2026-10-25'},status:'draft'});assert.equal(mediaDraft.status,200);
    let mediaRevision=1;const mediaReportId=mediaDraft.data.id,firstMedia=randomUUID();
    const attachment=await evidence(mediaReportId,firstMedia,'vehicles',mediaRevision);assert.equal(attachment.status,200,attachment.message);mediaRevision=attachment.data.revision;
    assert.deepEqual(await evidence(mediaReportId,firstMedia,'vehicles',1),attachment);
    const secondMedia=randomUUID();const second=await evidence(mediaReportId,secondMedia,'vehicles',mediaRevision);assert.equal(second.status,200,second.message);mediaRevision=second.data.revision;
    assert.equal((await evidence(mediaReportId,randomUUID(),'cash',1)).status,409);
    for(const [slot] of SHIFT_PHOTOS.slice(1)){const item=await evidence(mediaReportId,randomUUID(),slot,mediaRevision);assert.equal(item.status,200,item.message);mediaRevision=item.data.revision;}
    const deleted=await evidence(mediaReportId,firstMedia,'vehicles',mediaRevision,'pgd','DELETE',randomUUID());assert.equal(deleted.status,200,deleted.message);mediaRevision=deleted.data.revision;
    assert.equal((await c.query('SELECT count(*)::int AS n FROM pg_temp.management_shift_media WHERE report_id=$1',[mediaReportId])).rows[0].n,6);
    const locked=await post({id:mediaReportId,revision:mediaRevision,payload:{...base,date:'2026-10-25'},status:'submitted'});assert.equal(locked.status,200,locked.message);mediaRevision=locked.data.revision;
    assert.equal((await evidence(mediaReportId,randomUUID(),'vehicles',mediaRevision)).status,409);
    assert.equal((await evidence(mediaReportId,randomUUID(),'vehicles',mediaRevision,'audit')).status,403);
    checks.push('Multiple attachments in one category, deletion, exact replay and stale versions work under RLS; PGD media lock at submission and branch staff cannot add KTNB evidence.');
    const immutable=(await c.query('SELECT payload FROM pg_temp.management_shift_reports WHERE id=$1',[mediaReportId])).rows[0].payload;
    actor={...actor,id:2,access_role:'internal_control',permissions:['contracts.read','shift.review']};
    const auditInput={...auditDomain.emptyAuditInput(),book:{other_vehicles:0,daily_vehicles:0,monthly_vehicles:0,vehicles:1,external_vehicles:0,batteries:1,cash:0,personal:0,company:0,revenue_day:0,revenue_month:0},actual:{other_vehicles:0,daily_vehicles:0,monthly_vehicles:0,vehicles:1,external_vehicles:0,batteries:1,cash:0,personal:0,company:0,revenue_day:0,revenue_month:0}};
    async function audit(body,key=randomUUID()){
      const response=await auditRoute.POST(new NextRequest(`http://localhost/api/auth/shift-reports/${mediaReportId}/audit`,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','x-shift-request-id':key},body:JSON.stringify(body)}),{params:Promise.resolve({id:String(mediaReportId)})});
      return {status:response.status,...await response.json()};
    }
    const auditBody={revision:0,report_revision:mediaRevision,input:auditInput,fingerprint:fixtureSnapshot.fingerprint,status:'draft'},auditKey=randomUUID();
    const draft=await audit(auditBody,auditKey);assert.equal(draft.status,200,draft.message);assert.equal(draft.data.revision,1);
    assert.deepEqual(await audit(auditBody,auditKey),draft);
    assert.equal((await audit({...auditBody,revision:1,fingerprint:'stale'})).status,409);
    const cloudModule=load(path.join(root,'lib/server/cloudinary-photos')),{v2:cloudinary}=require('cloudinary');
    const envKeys=['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'],oldEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
    const originalShiftAsset=cloudModule.shiftCloudAsset;
    try{
      process.env.CLOUDINARY_CLOUD_NAME='qa-cloud';process.env.CLOUDINARY_API_KEY='qa-key';process.env.CLOUDINARY_API_SECRET='qa-unit-test-secret';
      const uploadId=randomUUID(),publicId=`himoto/management-video/2/${uploadId}`;
      const receipt={public_id:publicId,version:1,resource_type:'video',signature:cloudinary.utils.api_sign_request({public_id:publicId,version:1},'qa-unit-test-secret')};
      const videoId=randomUUID();
      async function video(body=receipt){const response=await mediaRoute.PUT(new NextRequest(`http://localhost/api/auth/shift-reports/${mediaReportId}/media/${videoId}`,{method:'PUT',headers:{origin:'http://localhost','content-type':'application/json','x-shift-request-id':videoId,'x-report-revision':String(mediaRevision),'x-shift-stage':'audit','x-shift-category':'vehicles','x-file-name':'qa.mp4'},body:JSON.stringify(body)}),{params:Promise.resolve({id:String(mediaReportId),mediaId:videoId})});return {status:response.status,...await response.json()};}
      assert.equal((await video({...receipt,signature:'0'.repeat(40)})).status,400);
      cloudModule.shiftCloudAsset=receipt=>originalShiftAsset(receipt,async()=>({resource_type:'video',format:'mp4',version:1,bytes:1000,duration:181}));
      assert.equal((await video()).status,400);
      cloudModule.shiftCloudAsset=receipt=>originalShiftAsset(receipt,async()=>({resource_type:'video',format:'mp4',version:1,bytes:46*1024*1024,duration:30}));
      assert.equal((await video()).status,400);
      cloudModule.shiftCloudAsset=receipt=>originalShiftAsset(receipt,async()=>({resource_type:'video',format:'mp4',version:1,bytes:1000,duration:30}));
      const savedVideo=await video();assert.equal(savedVideo.status,200,savedVideo.message);
      cloudModule.shiftCloudAsset=async()=>{throw Error('Replay must not make another asset API call');};
      assert.deepEqual(await video(),savedVideo);mediaRevision=savedVideo.data.revision;
    }finally{cloudModule.shiftCloudAsset=originalShiftAsset;for(const k of envKeys)if(oldEnv[k]===undefined)delete process.env[k];else process.env[k]=oldEnv[k];}
    checks.push('Video evidence verifies the uploader signature, enforces 45 MB / 180 seconds from asset metadata, and replays a committed attachment without another cloud API call.');
    const auditMedia=await evidence(mediaReportId,randomUUID(),'cash',mediaRevision,'audit');assert.equal(auditMedia.status,200,auditMedia.message);
    assert.equal((await audit({...auditBody,revision:1,status:'confirmed'})).status,409);
    mediaRevision=auditMedia.data.revision;
    await c.query(`INSERT INTO pg_temp.management_shift_media(id,report_id,store_id,category,stage,filename,mime_type,data,created_by)
      SELECT unnest($1::uuid[]),$2,1,'vehicles','audit','QA','image/jpeg',$3,2`,[Array.from({length:59},()=>randomUUID()),mediaReportId,Buffer.from([255,216,255,9])]);
    assert.equal((await evidence(mediaReportId,randomUUID(),'vehicles',mediaRevision,'audit')).status,400);
    const finalBody={...auditBody,revision:1,report_revision:mediaRevision,status:'confirmed'},finalKey=randomUUID();
    const final=await audit(finalBody,finalKey);assert.equal(final.status,200,final.message);assert.equal(final.data.audit.result,'matched');
    assert.deepEqual(await audit(finalBody,finalKey),final);
    assert.equal((await audit({...finalBody,revision:2})).status,409);
    assert.equal((await evidence(mediaReportId,randomUUID(),'cash',mediaRevision,'audit')).status,409);
    assert.deepEqual((await c.query('SELECT payload FROM pg_temp.management_shift_reports WHERE id=$1',[mediaReportId])).rows[0].payload,immutable);
    checks.push('KTNB draft/confirmation replays once; changed app data or evidence blocks confirmation, confirmed results/media stay locked, and the PGD payload is never overwritten.');
    actor={id:1,store_id:1,scope_all:false,access_role:'branch_staff',permissions:['contracts.read','contracts.draft']};
    const rescue=await post({payload:{...base,date:'2026-10-24'},status:'draft'});assert.equal(rescue.status,200);
    let rescueRevision=1;
    for(const [slot]of SHIFT_PHOTOS){const item=await photo(rescue.data.id,slot,rescueRevision);assert.equal(item.status,200);rescueRevision=item.data.revision;}
    snapshotSource.readShiftSnapshot=async()=>{throw Error('Simulated temporary snapshot outage');};
    const rescued=await post({id:rescue.data.id,revision:rescueRevision,payload:{...base,date:'2026-10-24'},status:'submitted'});
    assert.equal(rescued.status,200,rescued.message);
    const rescuedRow=(await c.query('SELECT status,app_snapshot FROM pg_temp.management_shift_reports WHERE id=$1',[rescue.data.id])).rows[0];
    assert.equal(rescuedRow.status,'submitted');assert.equal(rescuedRow.app_snapshot,null);
    assert.equal((await audit(finalBody)).status,403);
    checks.push('An inventory snapshot outage cannot undo a fully evidenced PGD submission; branch staff still cannot confirm KTNB results.');
    console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
  } finally {
    session.userFromSession=originalSession;
    session.readSessionUser=originalReadSession;
    Object.defineProperties(database.himotoPool,descriptors);
    await c.query('ROLLBACK');c.release();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});

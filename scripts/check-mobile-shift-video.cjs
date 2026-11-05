// Disposable SQL and synthetic videos only. Actual writer, scoped pool and parser.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto'),{NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const arg=name=>process.argv[process.argv.indexOf(name)+1];
  assert(process.argv.includes('--pglite-path')&&process.argv.includes('--synthetic-dir'));
  const dir=path.resolve(arg('--synthetic-dir'));assert(dir.startsWith(path.resolve('.backups')+path.sep));
  const videos=[180,181].map(s=>fs.readFileSync(path.join(dir,`${s}.mp4`)));
  const pg=new(require(path.resolve(arg('--pglite-path'))).PGlite)();let failReceipt=false,loseCommit=false;
  const raw={release(){},async query(sql,params){
    if(failReceipt&&sql.startsWith('UPDATE himoto.management_mobile_requests SET resource_id')){failReceipt=false;throw Error('QA receipt failure');}
    const r=await pg.query(sql,params);
    if(sql==='COMMIT'&&loseCommit){loseCommit=false;throw Error('QA lost commit response');}
    return{...r,rowCount:r.rows.length||r.affectedRows||0};
  }};
  global.himotoPool={connect:async()=>raw,query:raw.query.bind(raw)};
  Object.assign(process.env,{VIDEO_STORAGE_PROVIDER:'cloudfly',MANAGEMENT_SESSION_SECRET:'qa-shift-video-only-at-least-32-characters',CLOUDFLY_S3_ENDPOINT:'https://s3.cloudfly.vn',CLOUDFLY_S3_BUCKET:'qa-shift-videos',CLOUDFLY_S3_ACCESS_KEY_ID:'qa-only-access',CLOUDFLY_S3_SECRET_ACCESS_KEY:'qa-only-storage'});
  for(const k of ['CLOUDINARY_URL','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','BROWSER_VIDEO_PROCESSING'])delete process.env[k];
  const sdk=require('@aws-sdk/client-s3'),objects=new Map(),oldSend=sdk.S3Client.prototype.send;let reads=0;
  sdk.S3Client.prototype.send=async function(command){reads++;const p=command.input,o=objects.get(p.Key);
    if(command instanceof sdk.HeadObjectCommand){if(!o)throw Object.assign(Error('missing'),{$metadata:{httpStatusCode:404}});return o.head;}
    assert(o);
    if(command instanceof sdk.GetObjectCommand){assert.equal(p.IfMatch,o.head.ETag);let a=0,b=o.bytes.length-1;if(p.Range){const[x,y]=p.Range.slice(6).split('-');a=x?Number(x):Math.max(0,o.bytes.length-Number(y));b=x&&y?Math.min(Number(y),b):b;}return{...o.head,ContentLength:b-a+1,ContentRange:p.Range?`bytes ${a}-${b}/${o.bytes.length}`:undefined,$metadata:{httpStatusCode:p.Range?206:200},Body:{transformToWebStream:()=>new Response(o.bytes.subarray(a,b+1)).body}};}
    if(command instanceof sdk.CopyObjectCommand){assert.equal(p.ACL,'private');assert.equal(p.MetadataDirective,'REPLACE');o.head.Metadata=p.Metadata;return{};}
    throw Error('Unexpected synthetic storage request');
  };
  const prep=load(path.join(root,'lib/server/mobile-shift-video')),handler=load(path.join(root,'lib/server/shift-media-handler'));
  const api=load(path.join(root,'lib/server/mobile-shift-reports')),{withMobileData}=load(path.join(root,'lib/server/mobile-context'));
  const recovery=load(path.join(root,'lib/server/mobile-write-recovery')),dto=load(path.resolve('shared/mobile-shift-reports'));
  const user={id:7,name:'QA video ca',store_id:23,scope_all:false,access_role:'custom',role:'staff',permissions:['contracts.read','contracts.draft','shift.review']},checks=[];
  const revision=async()=>Number((await pg.query('SELECT revision FROM himoto.management_shift_reports WHERE id=1')).rows[0].revision);
  const state=async()=>JSON.stringify((await pg.query("SELECT (SELECT jsonb_agg(r) FROM himoto.management_shift_reports r) AS reports,(SELECT jsonb_agg(m ORDER BY m.id) FROM himoto.management_shift_media m) AS media,(SELECT jsonb_agg(r ORDER BY r.request_id) FROM himoto.management_mobile_requests r) AS requests,(SELECT jsonb_agg(r ORDER BY r.request_id) FROM himoto.management_shift_requests r) AS receipts")).rows);
  const request=(body,key)=>new NextRequest('https://qa.invalid/video',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({...body,uploadId:key})});
  const review=async(stage='pgd',category='cash')=>({revision:await revision(),stage,category});
  const prepare=(r,key,body,actor=user)=>prep.prepareMobileShiftVideo(actor,'1',request({...r,...body},key));
  const evidence=async(r,key,cloud,file=randomUUID(),actor=user,method='PUT',range=null)=>{
    const req=new NextRequest(`https://qa.invalid/media?video=1&revision=${r.revision}`,{method,headers:{'Content-Type':'application/json','x-shift-request-id':key,'x-report-revision':String(r.revision),'x-shift-stage':r.stage,'x-shift-category':r.category,'x-file-name':'video-ca.mp4',...(range?{Range:range}:{})},...(method==='PUT'?{body:JSON.stringify(cloud)}:{})});
    return withMobileData(actor,'',()=>handler.handleShiftMedia(req,{params:Promise.resolve({id:'1',mediaId:file})},true));
  };
  const resolve=key=>recovery.resolveMobileWrite(user,key,new NextRequest('https://qa.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'shift.media:1'})}));
  async function direct(r,key,bytes=videos[0]){
    const sha256=createHash('sha256').update(bytes).digest('hex');
    const signed=await prepare(r,key,{action:'sign',bytes:bytes.length,sha256});assert(signed.ticket);
    objects.set(`himoto/videos/browser/7/${key}/v1.mp4`,{bytes,head:{ContentLength:bytes.length,ContentType:'video/mp4',ETag:'"qa-shift-etag"',Metadata:{sha256}}});
    return (await prepare(r,key,{action:'verify',ticket:signed.ticket})).receipt;
  }
  try{
    await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
      CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text,kind text);CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);
      CREATE TABLE himoto.management_shift_reports(id bigserial PRIMARY KEY,store_id bigint,report_date date,payload jsonb,created_by bigint,status text,revision int DEFAULT 1,updated_at timestamptz DEFAULT now(),app_snapshot jsonb);
      CREATE TABLE himoto.management_shift_requests(request_id uuid PRIMARY KEY,store_id bigint,created_by bigint,request_hash text,response jsonb);
      CREATE TABLE himoto.management_mobile_requests(user_id bigint,request_id uuid,operation varchar(64),fingerprint text,resource_id bigint,resource_revision text,PRIMARY KEY(user_id,request_id));
      CREATE TABLE himoto.management_shift_photos(report_id bigint,store_id bigint,slot text,mime_type text,data bytea);
      CREATE TABLE himoto.management_shift_media(id uuid PRIMARY KEY,report_id bigint,store_id bigint,category text,stage text,filename text,mime_type text,data bytea,cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version text,created_by bigint,created_at timestamptz DEFAULT now(),object_bucket text,object_key text,object_etag text);
      CREATE TABLE himoto.management_shift_audits(report_id bigint PRIMARY KEY,store_id bigint,input jsonb,app_snapshot jsonb,status text,result text,revision int DEFAULT 1,reviewer_id bigint,reviewer_name text,updated_at timestamptz,confirmed_at timestamptz);
      CREATE TABLE himoto.management_report_deliveries(delivery_key text PRIMARY KEY,status text,message_id bigint,error_code text);
      CREATE FUNCTION himoto.access_store(v bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR v=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
      GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;
      INSERT INTO himoto.stores VALUES(23,'PGD QA','rental');INSERT INTO himoto.users VALUES(7,'QA video ca');`);
    for(const table of ['management_shift_reports','management_shift_media','management_shift_photos','management_shift_audits','management_shift_requests'])await pg.exec(`ALTER TABLE himoto.${table} ENABLE ROW LEVEL SECURITY;CREATE POLICY scope ON himoto.${table} TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));`);
    await pg.exec("ALTER TABLE himoto.management_mobile_requests ENABLE ROW LEVEL SECURITY;CREATE POLICY actor ON himoto.management_mobile_requests TO himoto_scoped USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint);");
    const payload={store_id:23,date:'2026-11-04',staff:'QA',vehicles:0,daily_vehicles:0,monthly_vehicles:0,other_vehicles:0,batteries:0,charged:0,rented_batteries:0,transfers:0,cash:0,personal:0,company:0,electricity_off:false,notes:'Synthetic only',summary:dto.emptyShiftSummary()};
    await pg.query("INSERT INTO himoto.management_shift_reports(store_id,report_date,payload,created_by,status) VALUES(23,'2026-11-04',$1,7,'draft')",[payload]);
    const initial=await review(),key=randomUUID(),before=await state();
    assert.deepEqual(await prepare(initial,key,{action:'config'}),{direct:true});
    const cloud=await direct(initial,key);assert.equal(cloud.upload_id,key);assert.deepEqual(await state(),before);
    const savedFile=randomUUID(),saved=await evidence(initial,key,cloud,savedFile);assert.equal(saved.status,200);assert.equal(await revision(),2);
    const proof=await api.readMobileShiftResult(user,key);assert(dto.isShiftResult(proof));assert.equal(proof.receipt.revision,'2');assert.equal(proof.current.media[0].mime_type,'video/mp4');
    const savedState=await state(),calls=reads;assert.equal((await evidence(initial,key,cloud,savedFile)).status,200);assert.equal(reads,calls);assert.equal(await state(),savedState);assert.equal((await resolve(key)).status,'committed');
    checks.push('Actual 180-second synthetic MP4 passes web mediabunny/HMAC/storage attestation and common shift writer; scoped proof and UUID replay commit once without Cloudinary');
    const current=await review();await assert.rejects(()=>direct(current,randomUUID(),videos[1]),e=>e.status===400&&/180/.test(e.message));assert.equal(await state(),savedState);
    const countBefore=reads;await assert.rejects(()=>prepare(current,randomUUID(),{action:'config'}, {...user,permissions:['contracts.read']}),e=>e.status===403);
    await assert.rejects(()=>prepare(current,randomUUID(),{action:'config'}, {...user,store_id:24}),e=>e.status===404);assert.equal(reads,countBefore);
    assert.equal((await evidence(current,randomUUID(),cloud)).status,409);
    await assert.rejects(()=>prepare({...current,revision:1},randomUUID(),{action:'config'}),e=>e.status===409);
    assert.equal((await evidence(initial,key,cloud,randomUUID())).status,409);
    checks.push('Actual parser rejects 181 seconds; role/RLS/old revision and mismatched receipt UUID/fingerprint reject before attaching a video');
    const cancelled=randomUUID(),cancelledCloud=await direct(current,cancelled);assert.equal((await resolve(cancelled)).status,'cancelled');assert.equal((await evidence(current,cancelled,cancelledCloud)).status,409);
    const failing=randomUUID(),failingCloud=await direct(current,failing),safe=await state();failReceipt=true;assert.equal((await evidence(current,failing,failingCloud)).status,500);assert.equal(await state(),safe);
    const lost=randomUUID(),lostCloud=await direct(current,lost),lostFile=randomUUID();loseCommit=true;assert.equal((await evidence(current,lost,lostCloud,lostFile)).status,500);assert.equal(await revision(),3);assert.equal((await resolve(lost)).status,'committed');assert.equal((await api.readMobileShiftResult(user,lost)).receipt.revision,'3');assert.equal((await evidence(current,lost,lostCloud,lostFile)).status,200);assert.equal(await revision(),3);
    checks.push('Receipt failure rolls SQL back; cancelled UUID blocks late attach; lost commit response resolves original proof and replay adds no video or revision');
    const third=await review('pgd','vehicles'),thirdKey=randomUUID();assert.equal((await evidence(third,thirdKey,await direct(third,thirdKey))).status,200);
    const full=await review();await assert.rejects(()=>prepare(full,randomUUID(),{action:'config'}),e=>e.code==='VIDEO_LIMIT');
    const fullKey=randomUUID();
    const fake={...cloud,upload_id:fullKey};assert.equal((await evidence(full,fullKey,fake)).status,400); // HMAC invalid before count.
    Object.assign(process.env,{VIDEO_STORAGE_PROVIDER:'cloudinary',CLOUDINARY_CLOUD_NAME:'qa-cloud',CLOUDINARY_API_KEY:'123456',CLOUDINARY_API_SECRET:'qa-only-secret'});
    const cloudinary=require('cloudinary').v2,originalResource=cloudinary.api.resource;let duration=180;
    cloudinary.api.resource=async()=>({resource_type:'video',format:'mp4',version:1,bytes:videos[0].length,duration});
    const conversion=key=>{const public_id=`himoto/management-video/7/${key}`;return{public_id,version:1,resource_type:'video',signature:cloudinary.utils.api_sign_request({public_id,version:1},'qa-only-secret')};};
    try{
      assert.equal((await evidence(full,fullKey,conversion(fullKey))).status,400);
      await pg.exec("UPDATE himoto.management_shift_reports SET status='submitted' WHERE id=1");
      await assert.rejects(()=>prepare(full,randomUUID(),{action:'config'}),e=>e.code==='SHIFT_LOCKED');
      const audit=await review('audit'),auditKey=randomUUID();assert.equal((await evidence(audit,auditKey,conversion(auditKey))).status,200);
      const auditNext=await review('audit'),long=randomUUID();duration=181;assert.equal((await evidence(auditNext,long,conversion(long))).status,400);duration=180;
      await pg.exec("INSERT INTO himoto.management_shift_audits(report_id,store_id,status) VALUES(1,23,'confirmed')");await assert.rejects(()=>prepare(auditNext,randomUUID(),{action:'config'}),e=>e.code==='SHIFT_LOCKED');
      assert.equal((await evidence(auditNext,randomUUID(),conversion(randomUUID()))).status,409);
    }finally{cloudinary.api.resource=originalResource;}
    checks.push('Common conversion writer enforces 180/181 seconds, three videos across categories per stage, PGD submission lock and independent KTNB stage/confirmation lock');
    process.env.VIDEO_STORAGE_PROVIDER='cloudfly';const r=await review(),play=await evidence(r,'',null,savedFile,user,'GET','bytes=4-11');assert.equal(play.status,206);assert.equal(play.headers.get('Location'),null);assert.equal(play.headers.get('Content-Range'),`bytes 4-11/${videos[0].length}`);assert.deepEqual(Buffer.from(await play.arrayBuffer()),videos[0].subarray(4,12));
    assert.equal((await evidence(r,'',null,savedFile,{...user,store_id:24},'GET')).status,404);
    await assert.rejects(()=>evidence(r,'',null,savedFile,user,'GET','bytes=8-1'),e=>e.status===416);
    assert.equal((await evidence({...r,revision:1},'',null,savedFile,user,'GET')).status,409);
    checks.push('Mobile MP4 proxy serves exact authenticated range with no redirect, blocks foreign branch/stale revision and preserves invalid-range status416');
    console.log(JSON.stringify({passed:checks.length,checks,operationalWrites:0,realUploads:0,parser:'actual mediabunny; synthetic180/181 MP4',storage:'in-memory S3/Cloudinary',staging:false},null,2));
  }finally{sdk.S3Client.prototype.send=oldSend;await pg.close();delete global.himotoPool;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

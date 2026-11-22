// Isolated SQL only. Snapshot/ownership source is deterministic here; the
// financial readers have their own checks. Never loads env or delivers reports.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{NextRequest}=require('next/server');
const{load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const at=process.argv.indexOf('--pglite-path');if(at<0)throw Error('Pass isolated PGlite path; no DB fallback');
  const sql=new(require(path.resolve(process.argv[at+1])).PGlite)(),db=load(path.join(root,'lib/server/himoto-database')),api=load(path.join(root,'lib/server/mobile-shift-reports')),domain=load(path.join(root,'lib/server/shift-report-domain'));
  const dto=load(path.resolve('shared/mobile-shift-reports')),{dataAccess}=load(path.join(root,'lib/server/access-context')),{withMobileData}=load(path.join(root,'lib/server/mobile-context')),{resolveMobileWrite}=load(path.join(root,'lib/server/mobile-write-recovery'));
  const media=load(path.join(root,'lib/server/shift-media-handler')),snap=load(path.join(root,'lib/server/shift-audits')),ownership=load(path.join(root,'lib/server/ownership-report'));
  const stock=load(path.join(root,'lib/server/shift-stock-photos')),ocr=load(path.join(root,'lib/server/photo-ocr'));
  const stockWeb=load(path.join(root,'app/api/auth/shift-reports/[id]/stock-photos/route'));
  const sessions=load(path.join(root,'lib/server/management-session')), originalSession=sessions.userFromSession;
  const originalSnapshot=snap.readShiftSnapshot,originalOwnership=ownership.readOwnershipReport,descriptors=Object.fromEntries(['query','connect'].map(k=>[k,Object.getOwnPropertyDescriptor(db.himotoPool,k)]));
  const originalOcr=ocr.extractPhoto;
  const actor={id:7,name:'KTNB QA',store_id:23,scope_all:false,access_role:'custom',role:'staff',permissions:['contracts.read','contracts.draft','shift.review']},checks=[];
  let snapshotFails=false,snapshotVersion=1;
  const values=Object.fromEntries(dto.AUDIT_FIELDS.map(([key])=>[key,0]));values.vehicles=10;values.daily_vehicles=1;values.monthly_vehicles=2;
  const snapshot=()=>({captured_at:'2026-11-03T12:00:00Z',date:'2026-11-03',fingerprint:createHash('sha256').update(String(snapshotVersion)).digest('hex'),values:{...values},assets_total:13,revenue:{rental:0,renewal:0,late:0,early:0,revenue:0},unclassified_count:0,transfers:[],inventory_note:'Synthetic inventory snapshot',accounts_note:'Synthetic account snapshot'});
  snap.readShiftSnapshot=async()=>{if(snapshotFails)throw Error('Synthetic analytics unavailable');return snapshot();};ownership.readOwnershipReport=async()=>({...dto.blankOwnershipReport(),app:Object.fromEntries(Object.keys(dto.blankOwnershipReport().app).map(k=>[k,123])),sources:['Fresh source QA']});
  const query=async(text,params)=>{const r=await sql.query(text,params);return{rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
  Object.defineProperty(db.himotoPool,'query',{configurable:true,value:query});Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{const a=dataAccess.getStore();assert.equal(a.id,7);assert.equal(a.store_id,23);assert.equal(a.scope_all,a.access_role==='admin');assert.equal(a.operation,'');return{query,release(){}};}});
  const req=(key,body)=>new NextRequest('https://qa.invalid/api/mobile/v1/shift-reports',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
  const base={store_id:23,date:'2026-11-03',staff:'QA Ca tối',vehicles:10,daily_vehicles:1,monthly_vehicles:2,other_vehicles:0,batteries:2,charged:1,rented_batteries:3,transfers:0,cash:0,personal:0,company:0,electricity_off:false,notes:'QA ONLY',summary:dto.emptyShiftSummary()};
  const save=(body,key=randomUUID(),user=actor)=>api.saveMobileShift(user,req(key,body));
  async function webSave(body,key=randomUUID()){return withMobileData(actor,'',async()=>{await query('BEGIN');try{const r=await domain.saveShiftReport({query},actor,body,key);await query('COMMIT');return r;}catch(e){await query('ROLLBACK');throw e;}});}
  async function evidence(id,stage,revision,key=randomUUID(),method='PUT',file=randomUUID()){
    const r=new NextRequest(`https://qa.invalid/api/mobile/v1/shift-reports/${id}/media/${file}`,{method,headers:{'Content-Type':'image/jpeg','x-shift-request-id':key,'x-report-revision':String(revision),'x-shift-stage':stage,'x-shift-category':'cash','x-file-name':'qa-cash.jpg'},...(method==='PUT'?{body:Buffer.from([255,216,255,224,0,0])}:{})});
    return{response:await withMobileData(actor,'',()=>media.handleShiftMedia(r,{params:Promise.resolve({id:String(id),mediaId:file})},true)),key,file};
  }
  try{
    await sql.exec(`CREATE SCHEMA himoto;CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text,kind text);CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);
      CREATE TABLE himoto.management_shift_reports(id bigserial PRIMARY KEY,store_id bigint,report_date date,payload jsonb,created_by bigint,status text,revision int DEFAULT 1,updated_at timestamptz DEFAULT now(),submitted_at timestamptz,app_snapshot jsonb,reopen_request jsonb,UNIQUE(store_id,report_date));
      CREATE TABLE himoto.management_shift_report_revisions(report_id bigint,revision int,reason text,reopened_at timestamptz,manual_retraction boolean,actor_id bigint,request_id uuid);
      CREATE TABLE himoto.management_shift_requests(request_id uuid PRIMARY KEY,store_id bigint,created_by bigint,request_hash text,response jsonb);
      CREATE TABLE himoto.management_mobile_requests(user_id bigint,request_id uuid,operation varchar(64),fingerprint text,resource_id bigint,resource_revision text,PRIMARY KEY(user_id,request_id));
      CREATE TABLE himoto.management_shift_photos(report_id bigint,store_id bigint,slot text,mime_type text,data bytea,PRIMARY KEY(report_id,slot));
      CREATE TABLE himoto.management_shift_media(id uuid PRIMARY KEY,report_id bigint,store_id bigint,category text,stage text,filename text,mime_type text,data bytea,cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version text,created_by bigint,created_at timestamptz DEFAULT now(),object_bucket text,object_key text,object_etag text);
      CREATE TABLE himoto.management_shift_audits(report_id bigint PRIMARY KEY,store_id bigint,input jsonb,app_snapshot jsonb,status text,result text,revision int DEFAULT 1,reviewer_id bigint,reviewer_name text,updated_at timestamptz DEFAULT now(),confirmed_at timestamptz);
      CREATE TABLE himoto.management_report_deliveries(delivery_key text PRIMARY KEY,store_id bigint,route text,text text,status text DEFAULT 'pending',message_id bigint,error_code text);
      INSERT INTO himoto.stores VALUES(23,'Cơ sở ca QA','rental'),(24,'Cơ sở khác QA','rental');INSERT INTO himoto.users VALUES(7,'KTNB QA');`);
    await sql.exec(`ALTER TABLE himoto.management_shift_media ADD COLUMN storage_sha256 text,ADD COLUMN storage_bytes bigint,ALTER COLUMN cloudinary_version TYPE bigint USING cloudinary_version::bigint;
      ALTER TABLE himoto.management_shift_photos ADD COLUMN object_bucket text,ADD COLUMN object_key text,ADD COLUMN object_etag text;
      ALTER TABLE himoto.management_report_deliveries ADD COLUMN attachments jsonb DEFAULT '[]',ADD COLUMN media_ids jsonb DEFAULT '[]',ADD COLUMN text_sent boolean DEFAULT false,ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN delivery_target jsonb,ADD COLUMN suppressed_at timestamptz,ADD COLUMN retracted_at timestamptz;`);
    const createKey=randomUUID(),created=await save({payload:base,status:'draft'},createKey);assert.equal(created.receipt.id,1);assert.equal(created.receipt.revision,'1');assert((await save({payload:base,status:'draft'},createKey)).receipt.replayed);
    await assert.rejects(save({payload:base,status:'draft'}),error=>error.code==='SHIFT_REPORT_EXISTS');
    const record=await api.readMobileShift(actor,'1');assert(dto.isShiftReport(record));assert.equal((await domain.listShiftReports({query},'23',null))[0].payload.staff,base.staff);assert.equal((await api.readMobileShifts(actor,new URLSearchParams('store_id=23'))).rows.length,1);
    const changed=await webSave({id:1,revision:1,payload:{...base,notes:'Edited on web'},status:'draft'});assert.equal(changed.revision,2);assert.equal((await api.readMobileShift(actor,'1')).payload.notes,'Edited on web');
    const proof=await api.readMobileShiftResult(actor,createKey);assert(dto.isShiftResult(proof));assert.equal(proof.receipt.revision,'1');assert.equal(proof.current.revision,2);
    checks.push('Mobile create and web edit share the same report and reader; original receipt remains revision1 while current report becomes2; UUID replay never inserts a duplicate report');
    await assert.rejects(save({id:1,revision:1,payload:base,status:'draft'}),e=>e.status===409);await assert.rejects(save({payload:{...base,store_id:24},status:'draft'}),e=>e.status===403);await assert.rejects(save({payload:base,status:'draft'},randomUUID(),{...actor,permissions:['contracts.read']}),e=>e.status===403);
    const cancelled=randomUUID();await resolveMobileWrite(actor,cancelled,req(cancelled,{operation:'shift.update:1'}));await assert.rejects(save({id:1,revision:2,payload:base,status:'draft'},cancelled),e=>e.code==='REQUEST_CANCELLED');
    checks.push('CAS/branch/permission validation rejects stale and foreign changes before business commit; cancellation permanently blocks a late save key');
    const image=await evidence(1,'pgd',2);assert.equal(image.response.status,200);const imageResult=await image.response.json();assert.equal(imageResult.data.revision,3);assert.equal((await api.readMobileShiftResult(actor,image.key)).receipt.revision,'3');
    const replay=await evidence(1,'pgd',2,image.key,'PUT',image.file);assert.equal(replay.response.status,200);assert.equal((await api.readMobileShift(actor,'1')).revision,3);
    await assert.rejects(save({id:1,revision:3,payload:base,status:'submitted'}),e=>e.status===400);snapshotFails=true;const submitted=await save({id:1,revision:3,payload:{...base,electricity_off:true},status:'submitted'});snapshotFails=false;assert.equal(submitted.receipt.revision,'4');assert.equal((await api.readMobileShift(actor,'1')).status,'submitted');
    assert.equal((await evidence(1,'pgd',4)).response.status,409);await assert.rejects(save({id:1,revision:4,payload:base,status:'draft'}),e=>e.status===409);
    checks.push('Actual shared evidence handler stores one image/receipt and replays without revision bump; submission requires safety, survives analytics snapshot outage exactly as web, and locks PGD editing/evidence');
    const shot=await api.readMobileShiftSnapshot(actor,'1');assert(dto.isShiftSnapshot(shot));const audit={...dto.emptyAuditInput(),book:{...values},actual:{...values}},auditBody={input:audit,revision:0,report_revision:4,status:'draft',fingerprint:shot.fingerprint},auditKey=randomUUID();
    const savedAudit=await api.saveMobileShiftAudit(actor,'1',req(auditKey,auditBody));assert.equal(savedAudit.revision,'1');assert((await api.saveMobileShiftAudit(actor,'1',req(auditKey,auditBody))).replayed);snapshotVersion++;
    await assert.rejects(api.saveMobileShiftAudit(actor,'1',req(randomUUID(),{...auditBody,revision:1})),e=>e.status===409);snapshotVersion--;
    const confirmed=await api.saveMobileShiftAudit(actor,'1',req(randomUUID(),{...auditBody,revision:1,status:'confirmed'}));assert.equal(confirmed.revision,'2');const confirmedReport=await api.readMobileShift(actor,'1');assert.equal(confirmedReport.audit.status,'confirmed');assert.equal(confirmedReport.payload.vehicles,base.vehicles);assert.equal((await evidence(1,'audit',4)).response.status,409);
    checks.push('Actual KTNB save domain checks report/audit revisions and refreshed snapshot fingerprint, replays original proof, locks confirmed audit/evidence, and preserves the original PGD payload; snapshot source itself is deterministic in this test');
    const owner=dto.blankOwnershipReport();owner.values=Object.fromEntries(Object.keys(owner.values).map(k=>[k,0]));owner.values.book_income=200;const own=await save({payload:{...base,date:'2026-11-02',ownership_report:owner,electricity_off:true},status:'submitted'});assert.equal(own.deliveryKey,`shift:${own.receipt.id}`);const ownReport=await api.readMobileShift(actor,String(own.receipt.id));assert.equal(ownReport.payload.ownership_report.app.income_day,123);assert.equal(ownReport.payload.ownership_report.values.book_income,200);assert.equal((await query('SELECT * FROM himoto.management_report_deliveries')).rows.length,3);assert.equal((await query("SELECT jsonb_array_length(attachments) AS n FROM himoto.management_report_deliveries WHERE delivery_key='shift:1'")).rows[0].n,1);
    assert.equal((await resolveMobileWrite(actor,createKey,req(createKey,{operation:'shift.create'}))).status,'committed');
    checks.push('Ownership submission refreshes app data while preserving manual values and atomically queues the same Telegram outbox as web; tests never deliver Telegram or mutate operational data');
    const exports=load(path.resolve('shared/mobile-shift-report-export')),files=load(path.resolve('shared/mobile-export')),format=load(path.resolve('shared/shift-audits'));
    const exported=exports.mobileShiftAuditExport(confirmedReport);assert(files.isMobileFileExport(exported));assert.equal(exported.content,format.auditReportText(confirmedReport.store_name,confirmedReport.payload.date,confirmedReport.audit,confirmedReport.payload));
    const long=structuredClone(confirmedReport);long.audit.input.notes='QA '.repeat(12000);assert(files.isMobileFileExport(exports.mobileShiftAuditExport(long)));assert.throws(()=>exports.mobileShiftAuditExport({...confirmedReport,audit:null}));
    checks.push('Saved KTNB copy/export uses the exact web formatter and snapshot/version, retains long reports without truncation and rejects an unsaved audit');
    await sql.exec(`CREATE ROLE himoto_scoped NOLOGIN;
      GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
      CREATE FUNCTION himoto.access_store(target bigint) RETURNS boolean LANGUAGE sql STABLE AS
        $$ SELECT target = NULLIF(current_setting('himoto.store_id',true),'')::bigint $$;
      ALTER TABLE himoto.management_shift_media ADD CONSTRAINT management_shift_media_category_check CHECK (category IN ('vehicles','batteries','cash','personal','company','door'));
      CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,name text,license text,store_id bigint,current_store_id bigint,status text,deleted_at timestamptz);
      INSERT INTO himoto.vehicles VALUES
      (1,'QA xe 1','29A1-000.01',24,23,'ready',NULL),(2,'QA xe 2','29A1-000.02',23,23,'ready',NULL),
      (3,'QA cơ sở khác','29A1-000.03',23,24,'ready',NULL),(4,'QA xe đã xóa','29A1-000.04',23,23,'ready',now()),
      (5,'QA xe còn thuê','29A1-000.05',23,23,'ready',NULL),(6,'QA xe đang sử dụng','29A1-000.06',23,23,'using',NULL);
      CREATE FUNCTION himoto.vehicle_rental_blockers(targets bigint[]) RETURNS TABLE(vehicle_id bigint,status text,rent_at timestamptz)
       LANGUAGE sql AS $$ SELECT 5::bigint,'renting'::text,now()-interval '1 day' WHERE 5=ANY(targets) $$;`);
    await sql.exec(fs.readFileSync('docs/sql/2026-11-10-attendance-locations.sql','utf8'));
    const migration=fs.readFileSync('docs/sql/2026-11-20-shift-vehicle-stock-photos.sql','utf8');
    await sql.exec(migration);await sql.exec(migration);
    await query('INSERT INTO himoto.management_attendance_locations VALUES(23,21.02,105.82),(24,21.03,105.83)');
    await sql.exec("BEGIN; SET LOCAL ROLE himoto_scoped; SELECT set_config('himoto.store_id','23',true);");
    assert.deepEqual((await query('SELECT store_id::int AS id FROM himoto.management_attendance_locations')).rows,[{id:23}]);
    await sql.exec('COMMIT');
    const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
    const currentPayload={...base,date:today,electricity_off:true};
    const pending=await save({payload:currentPayload,status:'draft'}),reportId=pending.receipt.id;
    const coordinates={latitude:21.02,longitude:105.82,accuracy:15,timestamp:Date.now()};
    const stockUrl=`https://qa.invalid/api/mobile/v1/shift-reports/${reportId}/stock-photos`;
    const inspect=()=>stock.mobileShiftStockPhotos(new NextRequest(stockUrl),actor,reportId);
    const requestPhoto=(revision,key,last=1,point=coordinates)=>new NextRequest(stockUrl,{method:'PUT',
      headers:{'content-type':'application/octet-stream','x-vehicle-photo-bytes':'4','x-shift-request-id':key,
        'x-report-revision':String(revision),'x-vehicle-gps':JSON.stringify(coordinates),'x-plate-gps':JSON.stringify(point)},
      body:Buffer.from([255,216,255,9,255,216,255,last])});
    const upload=(...args)=>stock.mobileShiftStockPhotos(requestPhoto(...args),actor,reportId);
    const closeReport=(revision,payload=currentPayload)=>save({id:reportId,revision,payload,status:'submitted'});
    let scans=0,singleScans=0;
    ocr.extractPhoto=async(kind,mime,bytes,_signal,_fetch,options)=>{
      scans++;assert.equal(kind,'plate');assert.equal(mime,'image/jpeg');
      if(options){assert.equal(options.additional[0].data[3],9);assert(options.verifyPlatePair);}
      else singleScans++;
      return {fields:{license:bytes[3]===0?'':`29 A1 0000${bytes[3]}`}};
    };
    await sql.exec(`CREATE TABLE himoto.gps_devices(id bigserial PRIMARY KEY,vehicle_id bigint,management_status text,provider_status text,last_latitude numeric,last_longitude numeric,position_recorded_at timestamptz,sync_received_at timestamptz);
      INSERT INTO himoto.gps_devices(vehicle_id,management_status,provider_status,last_latitude,last_longitude,position_recorded_at,sync_received_at) VALUES
        (1,'online','online',21.0201,105.8201,now(),now()),
        (2,'online','online',21.0500,105.8500,now(),now());`);
    const adminActor={...actor,role:'admin',access_role:'admin',scope_all:true};
    const initialStock=await inspect();
    assert.deepEqual(initialStock.expected.map(row=>row.id),[1,2]);assert(initialStock.gps_configured);
    await assert.rejects(closeReport(1,{...currentPayload,stock_captures:[{vehicle:{id:1}}]}),error=>error.code==='SHIFT_STOCK_INCOMPLETE');
    // Silent GPS policy: out-of-range (>200m), high-accuracy, and stale GPS MUST NOT block staff or leak alerts to staff.
    // Unreadable / non-matching plates still reject with 422 before writing.
    await assert.rejects(upload(1,randomUUID(),0),error=>error.status===422);
    await assert.rejects(upload(1,randomUUID(),3),error=>error.status===422);
    await query("INSERT INTO himoto.vehicles VALUES(7,'QA xe trùng','29A1-000.01',23,23,'ready',NULL)");
    await assert.rejects(upload(1,randomUUID(),1),error=>error.status===422&&error.message.includes('trùng'));
    await query('DELETE FROM himoto.vehicles WHERE id=7');
    const key=randomUUID(),captured=await upload(1,key,1,{...coordinates,latitude:21.1});
    assert.equal(captured.revision,2);assert.equal(captured.capture.vehicle.id,1);
    assert.equal(captured.capture.distance_m,undefined);assert.equal(captured.capture.gps_alert,undefined);
    const beforeReplay=scans;assert.deepEqual(await upload(1,key,1,{...coordinates,latitude:21.1}),captured);assert.equal(scans,beforeReplay);
    await assert.rejects(upload(1,randomUUID(),2),error=>error.status===409);
    await assert.rejects(upload(2,randomUUID(),1),error=>error.status===422&&error.message.includes('đã có'));
    assert.equal((await query('SELECT count(*)::int AS n FROM himoto.management_shift_media WHERE report_id=$1',[reportId])).rows[0].n,2);
    assert.equal((await inspect()).captures.length,1);
    assert.equal((await inspect()).captures[0].distance_m,undefined);
    const adminStock=await stock.mobileShiftStockPhotos(new NextRequest(stockUrl),adminActor,reportId);
    assert.equal(adminStock.captures[0].gps_alert,true);assert(adminStock.captures[0].distance_m>200);
    const afterWebEdit=await webSave({id:reportId,revision:2,payload:{...currentPayload,notes:'Edited without photos'},status:'draft'});
    assert.equal(afterWebEdit.revision,3);assert.equal((await inspect()).captures.length,1);
    await assert.rejects(closeReport(3),error=>error.code==='SHIFT_STOCK_INCOMPLETE');
    assert.equal((await evidence(reportId,'pgd',3,randomUUID(),'DELETE',captured.capture.plate_photo_id)).response.status,409);
    const webStockUrl=stockUrl.replace('/mobile/v1/','/auth/');
    const webContext={params:Promise.resolve({id:String(reportId)})};
    const makePlateUpload=(url,id,origin='https://qa.invalid',point=coordinates,last=2)=>new NextRequest(url,{method:'PUT',
      headers:{'origin':origin,'content-type':'image/jpeg','x-shift-request-id':id,'x-report-revision':'3','x-plate-gps':JSON.stringify(point)},
      body:Buffer.from([255,216,255,last])});
    const makeWebUpload=(id,origin)=>makePlateUpload(webStockUrl,id,origin);
    sessions.userFromSession=async()=>null;
    assert.equal((await stockWeb.PUT(makeWebUpload(randomUUID()),webContext)).status,401);
    sessions.userFromSession=async()=>({...actor,permissions:['contracts.read']});
    assert.equal((await stockWeb.PUT(makeWebUpload(randomUUID()),webContext)).status,403);
    sessions.userFromSession=async()=>actor;
    assert.equal((await stockWeb.PUT(makeWebUpload(randomUUID(),'https://other.invalid'),webContext)).status,403);
    await assert.rejects(stock.mobileShiftStockPhotos(makePlateUpload(stockUrl,randomUUID(),'https://qa.invalid',coordinates,0),actor,reportId),error=>error.status===422);
    const webKey=randomUUID();
    const webResponse=await stockWeb.PUT(makeWebUpload(webKey),webContext);
    assert.equal(webResponse.status,200);
    const {data:second}=await webResponse.json();assert.equal(second.revision,4);
    assert.equal(second.capture.vehicle_photo_id,null);
    assert.equal(second.capture.distance_m,undefined);assert.equal(second.capture.vehicle_gps_alert,undefined);
    assert.equal(singleScans,2);
    assert.deepEqual(await stock.mobileShiftStockPhotos(makePlateUpload(stockUrl,webKey),actor,reportId),second);
    assert.equal(singleScans,2);
    assert.equal((await inspect()).captures.length,2);
    const adminReportDraft=await api.readMobileShift(adminActor,String(reportId));
    assert(adminReportDraft.gps_alerts && adminReportDraft.gps_alerts.phone_alerts.length===1 && adminReportDraft.gps_alerts.vehicle_alerts.some(v=>v.vehicle_id===2));
    const staffReportDraft=await api.readMobileShift(actor,String(reportId));
    assert.equal(staffReportDraft.gps_alerts,undefined);assert(staffReportDraft.stock_captures.every(c=>c.distance_m===undefined&&c.gps_alert===undefined&&c.vehicle_gps_alert===undefined));
    assert.equal((await query('SELECT count(*)::int AS n FROM himoto.management_shift_media WHERE report_id=$1',[reportId])).rows[0].n,3);
    const mixed=await api.readMobileShift(actor,String(reportId));assert(dto.isShiftReport(mixed));
    assert.equal(mixed.payload.vehicles,2);
    assert.equal(api.mobileShiftPhotoView(mixed,new Headers()).stock_captures,undefined);
    assert.equal(api.mobileShiftPhotoView(mixed,new Headers({'x-himoto-shift-stock':'plate'})).stock_captures.length,2);
    await query("UPDATE himoto.vehicles SET current_store_id=24 WHERE id=2");
    await assert.rejects(closeReport(4),error=>error.code==='SHIFT_STOCK_INCOMPLETE');
    const removal=await stockWeb.DELETE(new NextRequest(webStockUrl,{method:'DELETE',headers:{
      'origin':'https://qa.invalid','x-shift-request-id':randomUUID(),'x-report-revision':'4','x-vehicle-id':'2'}}),webContext);
    assert.equal(removal.status,200);
    const {data:removed}=await removal.json();
    assert.equal(removed.revision,5);
    const closed=await closeReport(5);assert.equal(closed.receipt.revision,'6');
    const checked=await api.readMobileShift(actor,String(reportId));
    assert(dto.isShiftReport(checked));assert.equal(checked.payload.vehicles,1);assert.equal(checked.stock_captures.length,1);
    assert.equal(checked.media.length,0);assert.equal(checked.payload.stock_captures,undefined);
    assert.equal((await query('SELECT count(*)::int AS n FROM himoto.management_shift_media WHERE report_id=$1',[reportId])).rows[0].n,2);
    await assert.rejects(upload(6,randomUUID(),1),error=>error.status===409);
    checks.push('Stock capture uses actual scoped inventory SQL, GPS and two-photo OCR inputs; rejects stale location, ambiguous/unmatched plates, duplicate photos and stale writes; web edits preserve evidence and web/app share final stock validation');
    checks.push('Web stock writes enforce session, grants and same origin; web capture replays from mobile with the same receipt and web removal deletes the same capture pair');
    checks.push('Single JPEGs require fresh in-branch GPS, reject unreadable OCR before writing, add exactly one plate photo, coexist with legacy pairs and keep old mobile report payloads readable');
    const reopenId=String(reportId),reopenInput={request_id:randomUUID(),revision:6,reason:'QA evidence',manual:false};
    const beforeReopen=await api.readMobileShiftReopen(actor,reopenId);
    assert(dto.isShiftReopenState(beforeReopen));assert.equal(beforeReopen.status,'submitted');
    assert.equal(beforeReopen.can_manual,false);assert.equal(beforeReopen.blocked_reason,'');
    await assert.rejects(async()=>api.queueMobileShiftReopen({...actor,permissions:['contracts.read']},reportId,reopenInput),error=>error.status===403);
    await assert.rejects(api.queueMobileShiftReopen(actor,reportId,{...reopenInput,manual:true}),error=>error.status===403);
    assert.equal(await api.queueMobileShiftReopen(actor,reportId,reopenInput),reopenInput.request_id);
    assert.equal(await api.queueMobileShiftReopen(actor,reportId,{...reopenInput,request_id:randomUUID()}),reopenInput.request_id);
    const reopenStatus=await api.readMobileShiftReopen(actor,reopenId);
    assert(dto.isShiftReopenState(reopenStatus));assert.equal(reopenStatus.request.state,'pending');
    await query("UPDATE himoto.management_report_deliveries SET message_id=$2 WHERE delivery_key=$1",[`shift:${reopenId}`,12345]);
    const delivery=await api.readMobileShiftTelegram(actor,reopenId);
    assert.equal(delivery.suppressed,true);assert.equal(delivery.message_id,12345);
    checks.push('Mobile reopen binds branch and write permissions, reserves manual retraction for finance, reuses a queued request and suppresses Telegram delivery');
    const out=process.argv.indexOf('--fixture-output');if(out>=0){const file=path.resolve(process.argv[out+1]);assert(file.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(file));const seeded=await save({payload:{...base,date:'2026-11-01'},status:'draft'});const record=await api.readMobileShift(actor,String(seeded.receipt.id));const options=await api.readMobileShiftOptions(actor);options.canReview=false;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({fixtureOnly:true,source:'Actual shared SQL report domain with deterministic analytics source; no operational data or messaging',options,record,auditReport:confirmedReport,exported,snapshot:snapshot(),stock:{record:{...record,payload:currentPayload},inventory:initialStock}},null,2));}
    console.log(JSON.stringify({passed:checks.length,checks,operationalWrites:0,realMessagesSent:0,snapshotSource:'Deterministic QA adapter; real analytics/RLS/multi-session acceptance remains separate'},null,2));
  }finally{snap.readShiftSnapshot=originalSnapshot;ownership.readOwnershipReport=originalOwnership;ocr.extractPhoto=originalOcr;sessions.userFromSession=originalSession;for(const[k,d]of Object.entries(descriptors)){if(d)Object.defineProperty(db.himotoPool,k,d);else delete db.himotoPool[k];}await sql.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

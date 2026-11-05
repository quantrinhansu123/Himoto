// All GPS fixtures and writes stay in memory. Never load env or contact providers.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {randomUUID}=require('node:crypto'),{NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
async function run(){
  const checks=[],dto=load(path.resolve(root,'../shared/mobile-gps')),domain=load(path.join(root,'lib/management/gps'));
  const now=Date.parse('2026-11-03T00:00:00Z'),iso=ms=>new Date(ms).toISOString();
  const row={id:1,vehicle_id:101,provider:'protrack',external_device_id:'QA001',provider_device_name:'QA GPS',license:'QA-101',store_id:23,store_name:'QA A',
    management_status:'stopped',sync_received_at:iso(now),heartbeat_at:iso(now-1000),last_latitude:0,last_longitude:0,last_speed:0,mapping_status:'manual',
    position_recorded_at:iso(now-900000),stopped_since:iso(now-90*3600000),provider_stopped_since:iso(now-96*3600000)};
  const query={...dto.defaultGpsQuery};
  assert.equal(domain.displayedGpsState('online',iso(now-600000),now),'online');
  assert.equal(domain.displayedGpsState('online',iso(now-600001),now),'stale');
  for(const state of ['none','unavailable'])assert.equal(domain.displayedGpsState(state,null,now),state);
  assert.equal(domain.gpsMapLink(0,0),'https://www.google.com/maps?q=0,0');
  for(const pair of [[91,0],[0,181],[NaN,0],[null,0]])assert.equal(domain.gpsMapLink(...pair),null);
  assert.equal(domain.gpsStopEvidence(row,now).source,'protrack');
  assert.equal(domain.gpsStopEvidence({...row,provider:'iopgps'},now).source,'observed');
  assert.equal(domain.longStoppedVehicleIds([row,{...row,id:2,management_status:'online'}],now).size,0);
  assert.equal(domain.longStoppedVehicleIds([row,{...row,id:2,management_status:'unavailable'}],now).size,1);
  assert.equal(domain.longStoppedVehicleIds([{...row,stopped_since:iso(now-72*3600000),provider_stopped_since:null}],now).size,0);
  assert.equal(domain.longStoppedVehicleIds([{...row,sync_received_at:iso(now-600001)}],now).size,0);
  assert.equal(domain.gpsStopEvidence({...row,stopped_since:null,provider_stopped_since:iso(now+1),last_ignition:false},now),null);
  const projected=dto.projectGpsRows([row,{...row,id:2}],query,now);
  assert.equal(projected.summary.fleet,1);assert.equal(projected.summary.states.long_stopped,1);assert.equal(projected.rows.length,2);
  const all=Array.from({length:80},(_,i)=>({...row,id:i+1,vehicle_id:i+1000}));
  const late=dto.projectGpsRows(all,{...query,page:99999},now);assert.equal(late.page,4);assert.equal(late.rows.length,5);assert(!late.hasMore);
  for(const bad of ['page=0','store=0','provider=evil','state=all&state=online','foo=1','search=%00','event_device=-1','page=1e100'])assert.throws(()=>dto.parseGpsQuery(new URLSearchParams(bad)));
  assert.deepEqual(dto.parseGpsQuery(new URLSearchParams(dto.gpsQueryString(query))),query);
  checks.push('Web GPS rules: exact 10-minute/72-hour boundaries, multi-device agreement, unavailable devices, ignition-independent stop evidence, valid zero coordinates and complete pagination');

  const client=load(path.resolve(root,'../mobile/src/lib/api')).createApi('https://fixture.invalid','hm1_'+'a'.repeat(43));
  const sample={query,...projected,stores:[{id:23,name:'QA A'}],eventDevices:[{id:1,label:'QA GPS'},{id:2,label:'QA GPS 2'}],events:[],canMap:false,observedAt:iso(now)};
  assert(dto.isMobileGpsWorkspace(sample,query));assert(!dto.isMobileGpsWorkspace({...sample,query:{...query,store:'24'}},query));
  assert(!dto.isMobileGpsWorkspace({...sample,rows:[sample.rows[0],sample.rows[0]]},query));
  const oldFetch=global.fetch;
  try{
    global.fetch=async(url,options)=>{assert.equal(new URL(url).pathname,'/api/mobile/v1/gps');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return Response.json({...sample,query:{...query,search:'other'}});};
    await assert.rejects(()=>client.gps(query),e=>e.code==='INVALID_RESPONSE');
    global.fetch=async()=>Response.json(sample);assert.deepEqual(await client.gps(query),sample);
  }finally{global.fetch=oldFetch;}
  checks.push('Native transport binds GPS response to every requested filter and rejects substituted queries and duplicate devices');

  const flag=process.argv.indexOf('--pglite-path');
  if(flag>=0){
    const pg=new(require(path.resolve(process.argv[flag+1])).PGlite)();
    let lost=false,failProof=false,connections=0;
    const raw={release(){},async query(sql,values){
      if(failProof&&sql.startsWith('INSERT INTO himoto.management_mobile_gps_mappings')){failProof=false;throw Error('QA receipt failure');}
      const result=await pg.query(sql,values);
      if(lost&&sql==='COMMIT'){lost=false;throw Error('QA lost commit');}
      return{...result,rowCount:result.rows.length||result.affectedRows||0};
    }};
    global.himotoPool={connect:async()=>{connections++;return raw;},query:raw.query.bind(raw)};
    const originalNow=Date.now;Date.now=()=>now;
    try{
      await pg.exec(`CREATE SCHEMA himoto; CREATE ROLE himoto_scoped; CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);
        INSERT INTO himoto.users VALUES(7,'QA staff'),(8,'QA admin'),(9,'QA admin 2');
        CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);
        INSERT INTO himoto.stores VALUES(23,'QA A'),(24,'QA B');
        CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,name text,license text,store_id bigint,current_store_id bigint,deleted_at timestamptz);
        INSERT INTO himoto.vehicles SELECT n,'QA vehicle '||n,'QA-'||n,CASE WHEN n%2=0 THEN 24 ELSE 23 END,NULL,CASE WHEN n=105 THEN now() ELSE NULL END FROM generate_series(101,106)n;
        INSERT INTO himoto.vehicles SELECT n,'QA vehicle '||n,'QA-'||n,24,NULL,NULL FROM generate_series(200,227)n;
        CREATE TABLE himoto.management_gps_accounts(id uuid PRIMARY KEY,last_success_at timestamptz,secret_cipher text);
        CREATE TABLE himoto.gps_devices(id bigint PRIMARY KEY,vehicle_id bigint,provider text,external_device_id text,provider_device_name text,mapping_status text,
          provider_status text,management_status text,source_account_id uuid,sync_received_at timestamptz,heartbeat_at timestamptz,last_latitude numeric,last_longitude numeric,last_speed numeric,
          provider_reported_at timestamptz,position_recorded_at timestamptz,last_ignition boolean,stopped_since timestamptz,provider_stopped_since timestamptz,updated_at timestamp);
        CREATE TABLE himoto.management_gps_status_events(id bigint PRIMARY KEY,vehicle_id bigint,gps_device_id bigint,from_status text,to_status text,observed_at timestamptz,event_kind text,source text,provider_recorded_at timestamptz);
        CREATE FUNCTION himoto.access_actor() RETURNS bigint LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('himoto.actor_id',true),'')::bigint$$;
        CREATE FUNCTION himoto.access_operation() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.operation',true)$$;
        CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
        GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
        GRANT SELECT ON himoto.vehicles,himoto.stores,himoto.gps_devices,himoto.management_gps_status_events TO himoto_scoped;
        GRANT SELECT(id,last_success_at) ON himoto.management_gps_accounts TO himoto_scoped;
        ALTER TABLE himoto.vehicles ENABLE ROW LEVEL SECURITY;
        CREATE POLICY fleet ON himoto.vehicles FOR SELECT TO himoto_scoped USING(himoto.access_store(COALESCE(current_store_id,store_id)) OR himoto.access_operation()='fleet_read');
        ALTER TABLE himoto.stores ENABLE ROW LEVEL SECURITY;
        CREATE POLICY stores ON himoto.stores FOR SELECT TO himoto_scoped USING(himoto.access_store(id) OR himoto.access_operation()='fleet_read');
        ALTER TABLE himoto.gps_devices ENABLE ROW LEVEL SECURITY;
        CREATE POLICY management_scoped_gate ON himoto.gps_devices FOR SELECT TO himoto_scoped USING(true);
        ALTER TABLE himoto.management_gps_status_events ENABLE ROW LEVEL SECURITY;
      `);
      await pg.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA himoto GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO anon,authenticated');
      for(const sql of ['2026-10-28-fleet-gps-read.sql','2026-10-31-mobile-writes.sql','2026-11-03-mobile-gps-mappings.sql'])await pg.exec(fs.readFileSync(path.resolve(root,'../docs/sql',sql),'utf8'));
      for(const [id,vehicleId,state,availability] of [[1,101,'stopped',null],[2,101,'stopped',null],[3,102,'online',null],[4,104,'online','not_visible_in_account'],[5,105,'online',null],[6,106,'warning',null],[7,null,'stopped',null]]){
        await pg.query(`INSERT INTO himoto.gps_devices(id,vehicle_id,provider,external_device_id,provider_device_name,mapping_status,management_status,provider_status,sync_received_at,heartbeat_at,last_latitude,last_longitude,last_speed,stopped_since,provider_stopped_since)
          VALUES($1,$2,'protrack',$3,$4,'manual',$5,$6,$7,$7,0,0,0,$8,$8)`,[id,vehicleId,`QA00${id}`,`QA GPS ${id}`,state,availability,iso(now),iso(now-96*3600000)]);
      }
      await pg.query("INSERT INTO himoto.management_gps_status_events VALUES(1,101,1,'online','stopped',$1,'status','history',$2),(2,102,3,'stopped','online',$1,'status','poll',$2)",[iso(now),iso(now-3600000)]);
      const staff={id:7,name:'QA staff',role:'staff',access_role:'branch_staff',store_id:23,scope_all:false,permissions:[]};
      const admin={...staff,id:8,name:'QA admin',access_role:'admin',permissions:[]};
      const service=load(path.join(root,'lib/server/mobile-gps')),mapping=load(path.join(root,'lib/server/mobile-gps-mapping')),recovery=load(path.join(root,'lib/server/mobile-write-recovery'));
      const read=(q=query,who=staff)=>service.readMobileGps(who,new NextRequest('https://fixture.invalid/api/mobile/v1/gps?'+dto.gpsQueryString(q)));
      const first=await read();assert(dto.isMobileGpsWorkspace(first,query));assert.equal(first.total,35);assert.equal(first.summary.fleet,33);assert.equal(first.summary.states.long_stopped,1);assert.equal(first.summary.unmapped,1);assert(first.hasMore);assert(!first.canMap);
      assert.equal(first.rows.find(r=>r.id===4).management_status,'unavailable');assert(!first.rows.some(r=>r.vehicle_id===105));assert.equal(first.events[0].id,2);assert.equal(first.events[0].eventAt,iso(now));assert.equal(first.events[1].eventAt,iso(now-3600000));
      const second=await read({...query,page:2});assert.equal(second.rows.length,10);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,35);
      const branch=await read({...query,store:'24',event_source:'poll'});assert(branch.rows.every(r=>r.store_id===24));assert.deepEqual(branch.events.map(e=>e.id),[2]);assert.equal(staff.scope_all,false);
      assert.equal((await read({...query,search:'QA00'})).total,6);assert.equal((await read({...query,state:'long_stopped'})).total,2);
      assert(!JSON.stringify(first).includes('secret_cipher'));
      const context=load(path.join(root,'lib/server/mobile-context'));
      const ordinary=await context.withMobileData(staff,'',()=>load(path.join(root,'lib/server/himoto-database')).himotoPool.query('SELECT id FROM himoto.vehicles ORDER BY id'));
      assert(ordinary.rows.every(v=>Number(v.id)%2===1));
      checks.push('Isolated PostgreSQL: full fleet/missing/unmapped rows paginate without truncation; scoped actor remains branch-scoped outside fleet_read; store/event filters, provider event times and safe projection match web');
      const beforeConnections=connections;
      for(const who of [staff,{...staff,permissions:['settings.write']},{...staff,role:'admin',access_role:'branch_staff'}])await assert.rejects(()=>mapping.readMobileGpsMapping(who,'1'),e=>e.code==='FORBIDDEN');
      assert.equal(connections,beforeConnections);assert((await mapping.readMobileGpsMapping({...admin,access_role:null,role:'admin'},'1')).snapshot);
      const prep=await mapping.readMobileGpsMapping(admin,'1');
      const choices=await mapping.readMobileGpsMappingCandidates(admin,'1',new NextRequest('https://fixture.invalid/candidates?search=QA-102&page=1'));
      const next=choices.rows[0];assert.equal(next.id,102);
      const request=(body,key)=>new NextRequest('https://fixture.invalid/mapping',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
      const save=(p,v,key=randomUUID())=>mapping.recordMobileGpsMapping(admin,'1',request({snapshot:p.snapshot,vehicleId:v?.id??null,vehicleRevision:v?.revision??null},key));
      const resolve=(key,who=admin)=>recovery.resolveMobileWrite(who,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'gps.mapping:1'})}));
      const clocks=async()=>Object.fromEntries(Object.entries((await pg.query('SELECT stopped_since,provider_stopped_since FROM himoto.gps_devices WHERE id=1')).rows[0]).map(([k,v])=>[k,v instanceof Date?v.toISOString():v]));
      const same=await save(prep,prep.vehicle);assert.deepEqual(await clocks(),{stopped_since:iso(now-96*3600000),provider_stopped_since:iso(now-96*3600000)});
      const snapshotBeforeSignal=(await mapping.readMobileGpsMapping(admin,'1')).snapshot;await pg.query("UPDATE himoto.gps_devices SET heartbeat_at=$1,last_speed=30 WHERE id=1",[iso(now+1000)]);
      assert.equal((await mapping.readMobileGpsMapping(admin,'1')).snapshot,snapshotBeforeSignal);
      const key=randomUUID(),moved=await save(await mapping.readMobileGpsMapping(admin,'1'),next,key);assert.equal(moved.after.id,102);assert.deepEqual(await clocks(),{stopped_since:null,provider_stopped_since:null});
      assert.deepEqual(await save({...prep,snapshot:snapshotBeforeSignal},next,key),{...moved,replayed:true});
      assert.equal((await mapping.readMobileGpsMappingReceipt({...admin,id:9},key)).receipt,null);assert.equal((await resolve(key)).status,'committed');
      await assert.rejects(()=>resolve(key,{...staff,permissions:['settings.write']}),e=>e.code==='FORBIDDEN');
      await assert.rejects(()=>save(prep,prep.vehicle),e=>e.code==='GPS_MAPPING_REVIEW_REQUIRED');
      assert.equal((await mapping.readMobileGpsMappingReceipt(admin,same.requestId)).receipt.current,false);
      checks.push('Admin and legacy-admin mapping only; settings.write cannot elevate. Same vehicle preserves clocks, reassignment clears both; signal-only GPS updates do not invalidate review; immutable original receipts survive later changes');
      const cancelled=randomUUID();assert.equal((await resolve(cancelled)).status,'cancelled');await assert.rejects(async()=>save(await mapping.readMobileGpsMapping(admin,'1'),null,cancelled),e=>e.code==='REQUEST_CANCELLED');
      const snapshot=async()=>JSON.stringify({d:(await pg.query('SELECT *,xmin::text FROM himoto.gps_devices ORDER BY id')).rows,r:(await pg.query('SELECT * FROM himoto.management_mobile_requests ORDER BY request_id')).rows,p:(await pg.query('SELECT * FROM himoto.management_mobile_gps_mappings ORDER BY request_id')).rows});
      const before=await snapshot();failProof=true;await assert.rejects(async()=>save(await mapping.readMobileGpsMapping(admin,'1'),null),/QA receipt failure/);assert.equal(await snapshot(),before);
      const lostKey=randomUUID(),prior=await mapping.readMobileGpsMapping(admin,'1');lost=true;await assert.rejects(()=>save(prior,null,lostKey),/QA lost commit/);
      const found=(await mapping.readMobileGpsMappingReceipt(admin,lostKey)).receipt;assert.equal(found.after,null);assert.equal((await resolve(lostKey)).status,'committed');assert.deepEqual(await save(prior,null,lostKey),found);
      for(const role of ['himoto_scoped','anon','authenticated'])for(const verb of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await pg.query("SELECT has_table_privilege($1,'himoto.management_mobile_gps_mappings',$2) AS allowed",[role,verb])).rows[0].allowed,false);
      await pg.query('DELETE FROM himoto.gps_devices WHERE id=1');assert.equal((await mapping.readMobileGpsMappingReceipt(admin,lostKey)).receipt.current,false);assert.equal((await resolve(lostKey)).status,'committed');
      checks.push('Atomic mapping/proof/journal rollback, exact replay, lost commit recovery, tombstones block delayed writes, deleted device keeps original actor proof, and scoped clients have no receipt privileges');
    }finally{Date.now=originalNow;await pg.close();delete global.himotoPool;}
  }
  const syncDomain=load(path.join(root,'lib/server/gps-sync')),syncApi=load(path.join(root,'lib/server/mobile-gps-sync'));
  const originalSync=syncDomain.syncGpsAccounts;let syncCalls=0,syncResult={attempted:2,succeeded:2};
  syncDomain.syncGpsAccounts=async()=>{syncCalls++;return syncResult;};
  try{
    const who={id:7,name:'QA staff',role:'staff',access_role:'branch_staff',store_id:23,scope_all:false,permissions:[]};
    for(const init of [{headers:{'Idempotency-Key':randomUUID()}},{headers:{'Content-Type':'application/json'},body:'{}'}])
      await assert.rejects(()=>syncApi.refreshMobileGps(who,new NextRequest('https://fixture.invalid/gps/refresh',{method:'POST',...init})),e=>e.code==='INVALID_GPS_REFRESH');
    assert.equal(syncCalls,0);assert((await syncApi.refreshMobileGps(who,new NextRequest('https://fixture.invalid/gps/refresh',{method:'POST'}))).synced);
    const {Readable}=require('node:stream'),{NodeNextRequest}=require('next/dist/server/base-http/node'),{NextRequestAdapter}=require('next/dist/server/web/spec-extension/adapters/next-request');
    const incoming=Readable.from([]);Object.assign(incoming,{method:'POST',url:'https://fixture.invalid/gps/refresh',headers:{'content-length':'0'}});
    const adapted=NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming),new AbortController().signal);
    assert(adapted.body,'The actual Node adapter represents an empty POST with a stream');
    assert((await syncApi.refreshMobileGps(who,adapted)).synced);
    const chunked=Readable.from(['x']);Object.assign(chunked,{method:'POST',url:'https://fixture.invalid/gps/refresh',headers:{}});
    await assert.rejects(()=>syncApi.refreshMobileGps(who,NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(chunked),new AbortController().signal)),e=>e.code==='INVALID_GPS_REFRESH');
    syncResult={attempted:2,succeeded:0};await assert.rejects(()=>syncApi.refreshMobileGps(who,new NextRequest('https://fixture.invalid/gps/refresh',{method:'POST'})),e=>e.code==='GPS_SYNC_UNAVAILABLE');
    syncResult={attempted:0,succeeded:0};assert((await syncApi.refreshMobileGps(who,new NextRequest('https://fixture.invalid/gps/refresh',{method:'POST'}))).synced);
  }finally{syncDomain.syncGpsAccounts=originalSync;}
  checks.push('Refresh uses the existing provider lease for authenticated fleet users; rejects write keys/bodies, reports complete provider failure and accepts an already leased/no-account pass without contacting real providers');
  const priorFlag=process.env.HIMOTO_MOBILE_ENABLED;process.env.HIMOTO_MOBILE_ENABLED='false';
  try{
    for(const [route,method,params] of [['gps/route','GET',{}],['gps/refresh/route','POST',{}],['gps/devices/[id]/mapping/route','GET',{id:'1'}],['gps/devices/[id]/mapping/route','POST',{id:'1'}],['gps/devices/[id]/candidates/route','GET',{id:'1'}],['gps/mappings/requests/[key]/route','GET',{key:randomUUID()}]]){
      const handler=load(path.join(root,'app/api/mobile/v1',route));
      const response=await handler[method](new NextRequest('https://fixture.invalid/api/mobile/v1/gps',{method}),{params:Promise.resolve(params)});
      assert.equal(response.status,503);assert.equal((await response.json()).code,'MOBILE_UNAVAILABLE');assert.equal(response.headers.get('Vary'),'Authorization');
    }
  }finally{if(priorFlag===undefined)delete process.env.HIMOTO_MOBILE_ENABLED;else process.env.HIMOTO_MOBILE_ENABLED=priorFlag;}
  checks.push('Every GPS read, refresh, candidate, mapping write and receipt route enforces the native session feature gate before database/provider work');

  console.log(JSON.stringify({checks:checks.length,results:checks},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});

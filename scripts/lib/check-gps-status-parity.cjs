const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./load-typescript.cjs');
module.exports=async function checkParity(db,c,schema){
 const normalize=load(path.join(root,'lib/server/gps-providers')).normalizeProtrackDevice;
 const selected=load(path.join(root,'lib/server/selected-vehicle-gps')).readSelectedVehicleGps;
 const {VEHICLE_GPS_JOIN_SQL}=load(path.join(root,'lib/server/vehicle-gps-query'));
 const {persistGpsObservations}=load(path.join(root,'lib/server/gps-sync'));
 const now=Date.UTC(2026,9,18,14,27),base={imei:'QA',devicename:'QA',hearttime:now,gpstime:now,systime:now,speed:12,validate:true,block:false,icontype:22,accstatus:0};
 const cases=[
  [{},'online'],[{hearttime:now-7*60000,systime:now-7*86400000,gpstime:now-7*86400000},'stopped'],
  [{hearttime:now-1500000},'online'],[{hearttime:now-1500001},'offline'],
  [{systime:now-35000},'online'],[{systime:now-35001},'stopped'],
  [{speed:4},'stopped'],[{speed:4,icontype:33},'online'],[{speed:0},'stopped'],
  [{speed:-9},'warning'],[{speed:-1},'warning'],[{speed:null},'warning'],
  [{hearttime:null},'warning'],[{hearttime:now+60001},'warning'],
  [{systime:now+60001},'warning'],[{systime:null,gpstime:null},'warning'],
  [{validate:false},'warning'],[{block:true},'warning'],
 ];
 for(const [patch,state]of cases)assert.equal(normalize({...base,...patch},now).state,state,JSON.stringify(patch));
 assert.equal(normalize({...base,hearttime:now/1000,systime:now/1000,gpstime:now/1000},now/1000).state,'online');
 assert.equal(normalize({...base,accstatus:undefined},now).ignition,null);assert.equal(normalize(base,now).ignition,false);
 const iop=load(path.join(root,'lib/server/gps-providers')).normalizeIopDevice;
 const iopBase={status:0,speed:42,gpsTime:now-86400000,sysTime:now-1000,heartTime:now,accStatus:false,lat:'21.1',lng:'105.1'};
 for(const [status,state]of [[0,'stopped'],[1,'online'],[10,'offline'],[2,'warning'],[20,'warning'],[30,'warning'],[99,'warning'],[null,'warning']]){
   for(const speed of [null,0,6,42]){
     const row=iop({imei:'QA-IOP',deviceStatusBean:{...iopBase,status,speed}});assert.equal(row.state,state,`IOPGPS status=${status} speed=${speed}`);
     assert.equal(row.ignition,false);assert.equal(row.latitude,21.1);assert.equal(row.reported_at,new Date(now-1000).toISOString());
   }
 }
 const iopSeconds=iop({imei:'QA-IOP',deviceStatusBean:{...iopBase,gpsTime:now/1000,sysTime:now/1000,heartTime:now/1000,accStatus:undefined}});
 assert.equal(iopSeconds.heartbeat_at,new Date(now).toISOString());assert.equal(iopSeconds.recorded_at,new Date(now).toISOString());assert.equal(iopSeconds.ignition,null);
 const label=load(path.join(root,'lib/management/gps')).GPS_STATE_LABELS;assert.equal(label.stopped,'ON · Đang dừng');
 await c.query('SAVEPOINT gps_parity');
 try{
   await c.query(`UPDATE ${schema}.gps_devices SET provider_status='not_visible_in_account',sync_received_at=now(),heartbeat_at=now()+interval '1 day' WHERE vehicle_id=101`);
   await c.query(`INSERT INTO ${schema}.gps_devices(provider,external_device_id,imei,vehicle_id,mapping_status,management_status,provider_status,sync_received_at,heartbeat_at,provider_reported_at,position_recorded_at,last_ignition)
     VALUES('iopgps','qa-parity-device','qa-parity-device',101,'manual','stopped','0',now()-interval '1 second',now()-interval '7 minutes',now()-interval '7 days',now()-interval '7 days',false)`);
   const readList=async()=>(await db.query(`SELECT gps.normalized_status,gps.position_recorded_at,gps.last_ignition FROM himoto.vehicles v ${VEHICLE_GPS_JOIN_SQL} WHERE v.id=101`)).rows[0];
   let list=await readList(),pick=(await selected(db,[101]))[0];
   assert.equal(list.normalized_status,'stopped');assert.equal(pick.status,'stopped');assert(pick.position_at&&pick.heartbeat_at);assert.equal(list.last_ignition,false);
   await c.query(`UPDATE ${schema}.gps_devices SET sync_received_at=now()-interval '11 minutes' WHERE external_device_id='qa-parity-device'`);
   list=await readList();pick=(await selected(db,[101]))[0];assert.equal(list.normalized_status,'stale');assert.equal(pick.status,'stale');
   await c.query(`UPDATE ${schema}.gps_devices SET sync_received_at=NULL WHERE external_device_id='qa-parity-device'`);
   assert.equal((await readList()).normalized_status,'stale');assert.equal((await selected(db,[101]))[0].status,'stale');
   const observation={external_id:'qa-evidence-only',name:'QA evidence',license:'',state:'stopped',provider_status:'connected',latitude:21,longitude:105,speed:12,ignition:false,heartbeat_at:new Date(now).toISOString(),reported_at:new Date(now-86400000).toISOString(),recorded_at:new Date(now-86400000).toISOString()};
   await persistGpsObservations(db,'protrack',[observation]);
   const evidence=async()=>(await c.query(`SELECT heartbeat_at,provider_reported_at,position_recorded_at,last_ignition,last_latitude,ctid::text AS tuple FROM ${schema}.gps_devices WHERE external_device_id='qa-evidence-only'`)).rows[0];
   const saved=await evidence();assert.equal(saved.last_ignition,false);assert.equal(saved.provider_reported_at.toISOString(),observation.reported_at);
   await persistGpsObservations(db,'protrack',[{...observation,heartbeat_at:new Date(now+5000).toISOString(),latitude:22,longitude:null,recorded_at:new Date(now+5000).toISOString()}]);
   const updated=await evidence();assert.notEqual(updated.tuple,saved.tuple);assert.equal(updated.heartbeat_at.toISOString(),new Date(now+5000).toISOString());assert.equal(updated.position_recorded_at.toISOString(),saved.position_recorded_at.toISOString());assert.equal(Number(updated.last_latitude),21);
 }finally{await c.query('ROLLBACK TO SAVEPOINT gps_parity');await c.query('RELEASE SAVEPOINT gps_parity');}
 return ['IOPGPS native status codes 0=static, 1=moving, 10=offline override stored speed; sleep/unused/expired/missing remain warning; packet/fix/heartbeat and ignition are independent',
 'Protrack status matches its current monitor: 25-minute heartbeat and 35-second motion boundaries, low-speed icon exception, stale stored speed, ignition independence, seconds/milliseconds and invalid timestamps',
 'Vehicle list and contract/return selection choose the same available GPS device, preserve old-position evidence, and label missing/expired sync as stale without a false OFF'];
};

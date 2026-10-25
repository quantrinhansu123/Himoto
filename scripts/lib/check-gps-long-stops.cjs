const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./load-typescript.cjs');
const {GPS_LONG_STOP_MS,gpsStoppedDurationMs,longStoppedVehicleIds}=load(path.join(root,'lib/management/gps'));
const {persistGpsObservations}=load(path.join(root,'lib/server/gps-sync'));
const {persistGpsProviderEvents}=load(path.join(root,'lib/server/gps-event-records'));
const {normalizeProtrackDevice}=load(path.join(root,'lib/server/gps-providers'));
module.exports=async function checkGpsLongStops(db,c,schema,observation){
  const now=Date.now(),stamp=ago=>new Date(now-ago).toISOString();
  const row={id:1,vehicle_id:101,management_status:'stopped',sync_received_at:stamp(0),stopped_since:stamp(GPS_LONG_STOP_MS+1)};
  assert.deepEqual([...longStoppedVehicleIds([row],now)],[101]);
  assert.equal(longStoppedVehicleIds([{...row,stopped_since:stamp(GPS_LONG_STOP_MS)}],now).size,0);
  for(const patch of [{stopped_since:null},{stopped_since:'invalid'},{stopped_since:stamp(-1000)},{sync_received_at:stamp(600001)},{management_status:'offline'},{management_status:'warning'},{vehicle_id:null}]){
    assert.equal(longStoppedVehicleIds([{...row,...patch}],now).size,0,JSON.stringify(patch));
  }
  assert.equal(gpsStoppedDurationMs({...row,management_status:'offline'},now),null);
  assert.equal(longStoppedVehicleIds([row,{...row,id:2}],now).size,1);
  for(const status of ['online','offline','warning'])assert.equal(longStoppedVehicleIds([row,{...row,id:2,management_status:status}],now).size,0);
  assert.equal(longStoppedVehicleIds([row,{...row,id:2,management_status:'unavailable'}],now).size,1);
  const providerRow={...row,provider:'protrack',stopped_since:stamp(60000),provider_stopped_since:stamp(23*86400000)};
  assert.equal(gpsStoppedDurationMs(providerRow,now),23*86400000);
  assert.equal(longStoppedVehicleIds([providerRow],now).size,1);
  assert.equal(longStoppedVehicleIds([{...providerRow,provider_stopped_since:stamp(GPS_LONG_STOP_MS)}],now).size,0);
  for(const patch of [{management_status:'offline'},{management_status:'online'},{management_status:'warning'},{sync_received_at:stamp(600001)},{provider:'iopgps'},{provider_stopped_since:stamp(-1)}])assert.equal(longStoppedVehicleIds([{...providerRow,...patch}],now).size,0);
  const raw={imei:'qa-provider-clock',speed:0,hearttime:now,gpstime:now-10*86400000,systime:now-23*86400000,acctime:now-818*86400000,accstatus:0};
  assert.equal(normalizeProtrackDevice(raw,now).provider_stopped_since,stamp(23*86400000));
  assert.equal(normalizeProtrackDevice({...raw,systime:undefined},now).provider_stopped_since,null);
  assert.equal(normalizeProtrackDevice({...raw,systime:now+1},now).provider_stopped_since,null);
  assert.equal(normalizeProtrackDevice({...raw,hearttime:now-26*60000},now).provider_stopped_since,null);
  assert.equal(normalizeProtrackDevice({...raw,engineidlestatus:1,engineidlestarttime:now-86400000},now).provider_stopped_since,stamp(86400000));
  assert.equal(normalizeProtrackDevice({...raw,engineidlestatus:1,engineidlestarttime:0},now).provider_stopped_since,null);
  assert.equal(normalizeProtrackDevice({...raw,hearttime:now/1000,gpstime:raw.gpstime/1000,systime:raw.systime/1000},now/1000).provider_stopped_since,stamp(23*86400000));
  await c.query('SAVEPOINT gps_long_stop');
  try{
    const stopped={...observation,external_id:'qa-long-stop',name:'QA long stop',license:'',state:'stopped',speed:0};
    const read=async()=>(await c.query(`SELECT id,stopped_since,sync_received_at,management_status FROM ${schema}.gps_devices WHERE external_device_id='qa-long-stop'`)).rows[0];
    await persistGpsObservations(db,'protrack',[stopped]);
    assert((await read()).stopped_since);
    const seed=async()=>{await c.query(`UPDATE ${schema}.gps_devices SET stopped_since=now()-interval '4 days',sync_received_at=now()-interval '61 seconds' WHERE external_device_id='qa-long-stop'`);return (await read()).stopped_since.toISOString();};
    const since=await seed();await persistGpsObservations(db,'protrack',[stopped]);assert.equal((await read()).stopped_since.toISOString(),since);
    await persistGpsObservations(db,'protrack',[{...stopped,ignition:!stopped.ignition}]);assert.equal((await read()).stopped_since.toISOString(),since);
    for(const state of ['online','offline','warning']){
      await persistGpsObservations(db,'protrack',[{...stopped,state}]);assert.equal((await read()).stopped_since,null);
      await persistGpsObservations(db,'protrack',[stopped]);assert((await read()).stopped_since);
    }
    await seed();await c.query(`UPDATE ${schema}.gps_devices SET sync_received_at=now()-interval '11 minutes' WHERE external_device_id='qa-long-stop'`);
    await persistGpsObservations(db,'protrack',[stopped]);assert.notEqual((await read()).stopped_since.toISOString(),since);
    await seed();await c.query(`UPDATE ${schema}.gps_devices SET provider_status='not_visible_in_account' WHERE external_device_id='qa-long-stop'`);
    await persistGpsObservations(db,'protrack',[stopped]);assert.notEqual((await read()).stopped_since.toISOString(),since);
    await seed();const saved=await read();
    await persistGpsProviderEvents(db,Number(saved.id),[{at:stamp(5*86400000),kind:'motion',state:'online',providerStatus:'qa',nativeId:'old-motion'}],'history');
    assert.equal((await read()).stopped_since.toISOString(),since);
    await persistGpsProviderEvents(db,Number(saved.id),[{at:stamp(3600000),kind:'motion',state:'online',providerStatus:'qa',nativeId:'recent-motion'}],'history');
    assert.equal((await read()).stopped_since,null);assert.equal((await read()).management_status,'stopped');
    await persistGpsObservations(db,'protrack',[stopped]);assert((await read()).stopped_since);
    const reported={...stopped,external_id:'qa-provider-stop',provider_stopped_since:stamp(23*86400000)};
    const providerRead=async()=>(await c.query(`SELECT * FROM ${schema}.gps_devices WHERE external_device_id='qa-provider-stop'`)).rows[0];
    await persistGpsObservations(db,'protrack',[reported]);
    let provider=await providerRead();
    assert.equal(provider.provider_stopped_since.toISOString(),reported.provider_stopped_since);
    assert(new Date(provider.stopped_since).getTime()>now-60000);
    await c.query(`UPDATE ${schema}.gps_devices SET sync_received_at=now()-interval '11 minutes' WHERE id=$1`,[provider.id]);
    await persistGpsObservations(db,'protrack',[reported]);provider=await providerRead();
    assert.equal(provider.provider_stopped_since.toISOString(),reported.provider_stopped_since);
    await persistGpsProviderEvents(db,Number(provider.id),[{at:stamp(3600000),kind:'motion',state:'online',providerStatus:'qa',nativeId:'contradicts-provider-stop'}],'history');
    assert.equal((await providerRead()).provider_stopped_since,null);
    await persistGpsObservations(db,'protrack',[reported]);assert.equal((await providerRead()).provider_stopped_since,null);
    await persistGpsObservations(db,'protrack',[{...reported,provider_stopped_since:stamp(1800000)}]);
    assert.equal((await providerRead()).provider_stopped_since.toISOString(),stamp(1800000));
    await persistGpsObservations(db,'protrack',[{...reported,state:'offline'}]);assert.equal((await providerRead()).provider_stopped_since,null);
  }finally{await c.query('ROLLBACK TO SAVEPOINT gps_long_stop');await c.query('RELEASE SAVEPOINT gps_long_stop');}
  return 'Long stops prefer verified Protrack static/idle duration, independent of ACC/fix time, without waiting 72 local hours; strict >72h, stale/offline/moving, multi-device deduplication, observation fallback and contradictory recovered motion are enforced';
};

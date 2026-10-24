const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./load-typescript.cjs');
const {GPS_LONG_STOP_MS,gpsStoppedDurationMs,longStoppedVehicleIds}=load(path.join(root,'lib/management/gps'));
const {persistGpsObservations}=load(path.join(root,'lib/server/gps-sync'));
const {persistGpsProviderEvents}=load(path.join(root,'lib/server/gps-event-records'));
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
  }finally{await c.query('ROLLBACK TO SAVEPOINT gps_long_stop');await c.query('RELEASE SAVEPOINT gps_long_stop');}
  return 'Long stops require more than 72 hours of fresh, uninterrupted stopped observations; movement/offline/warnings/sync gaps/access loss reset tracking, recovered movement breaks it, ignition is independent and vehicles are deduplicated';
};

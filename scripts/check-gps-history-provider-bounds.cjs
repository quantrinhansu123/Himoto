require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),{load,root}=require('./lib/load-typescript.cjs');
const{readGpsMotionHistory,readGpsAlarmHistory}=load(path.join(root,'lib/server/gps-history-providers'));
(async()=>{const end=Date.now()-60000,start=end-86400000,device={external_device_id:'990000000000001',provider_device_id:'101'},session={token:'qa-only',accountId:'1'};
 let calls=0;const send=async input=>{calls++;const u=new URL(input);if(u.hostname==='real.gpscenter.xyz')return Response.json({errorcode:0,record:`105,21,${start+1000},0,0`});if(u.hostname==='www.protrack365.com')return Response.json({errorcode:0,records:[]});if(u.pathname.includes('/track/'))return Response.json({resultBean:{code:0},histories:[{'7':Math.floor((start+1000)/1000),'12':0}]});return Response.json({resultBean:{code:0},beanList:[]});};
 for(const provider of ['protrack','iopgps']){
  assert.equal((await readGpsMotionHistory(provider,session,device,start,end,send)).length,1);
  assert.equal((await readGpsAlarmHistory(provider,session,device,start,end,send)).length,0);
  for(const read of [readGpsMotionHistory,readGpsAlarmHistory])await assert.rejects(()=>read(provider,session,device,start-1,end,send),e=>e.code==='HISTORY_WINDOW');
 }
 assert.equal(calls,4);
 await assert.rejects(()=>readGpsMotionHistory('iopgps',session,device,start,end,async()=>Response.json({resultBean:{code:0},histories:Array(10000).fill({})})),e=>e.code==='HISTORY_INCOMPLETE');
 await assert.rejects(()=>readGpsAlarmHistory('protrack',session,device,start,end,async()=>Response.json({errorcode:0,records:Array(1000).fill({})})),e=>e.code==='HISTORY_INCOMPLETE');
 console.log(JSON.stringify({passed:6,checks:['Both providers accept bounded complete history windows up to a day','Invalid larger windows fail before any provider request','Empty verified alarm windows remain valid','Truncated large motion/alarm results never advance coverage'],providerRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1});

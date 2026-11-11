const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const file=path.resolve(process.argv[2]),fixture=JSON.parse(fs.readFileSync(file,'utf8')),origin='http://127.0.0.1:3020',dir=path.dirname(file);
process.env.DATABASE_URL=`postgresql://himoto_qa_owner@127.0.0.1:55439/${fixture.database}`;process.env.MANAGEMENT_SESSION_SECRET=fixture.secret;
process.env.HIMOTO_PEAK_QA='1';process.env.HIMOTO_PEAK_FIXTURE=file;process.env.HIMOTO_PEAK_FAULT_FILE=path.join(dir,'fault.json');
require('./lib/peak-network-guard.cjs');
const{Pool}=require('pg'),{load,root}=require('./lib/load-typescript.cjs');
const{signSession,SESSION_COOKIE}=load(path.join(root,'lib/server/management-session')),{integrationWorkerToken}=load(path.join(root,'lib/server/integration-worker-auth'));
const pool=new Pool({host:'127.0.0.1',port:55439,user:'himoto_qa_owner',database:fixture.database,ssl:false,max:2});
const percent=(rows,p)=>rows.length?[...rows].sort((a,b)=>a-b)[Math.max(0,Math.ceil(rows.length*p)-1)]:null;
const summary=rows=>({n:rows.length,p50Ms:Math.round(percent(rows,.5)||0),p95Ms:Math.round(percent(rows,.95)||0),maxMs:Math.round(Math.max(0,...rows))});
const cookie=id=>SESSION_COOKIE+'='+signSession(id);
async function request(route,id=2,body,worker=false){const at=performance.now();const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(worker?{Authorization:'Bearer '+integrationWorkerToken()}:{Cookie:cookie(id)}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(worker?90000:30000)});const json=await response.json();return{status:response.status,json,ms:performance.now()-at,timing:response.headers.get('server-timing')};}
(async()=>{const report={at:new Date().toISOString(),fixtureOnly:true,stages:[],writes:[],workerRequests:[],productionRequests:0,externalRequests:0};let timer;const pending=new Set();
 try{
  const info=(await pool.query("SELECT current_setting('cluster_name') AS cluster")).rows[0];assert.equal(info.cluster,'himoto-mobile-local-qa');
  const targets=(await pool.query('SELECT order_id FROM himoto.order_vehicle_details WHERE order_id BETWEEN 40001 AND 40500 AND completed_at IS NULL ORDER BY order_id')).rows.map(r=>Number(r.order_id));let next=0;
  assert(targets.length>=75,'Seed at least 75 unused synthetic return contracts');
  const workerTick=()=>{for(const lane of ['integrations','gps-live','gps-history']){
    if([...pending].some(p=>p.lane===lane))continue;
    const promise=request('/api/cron/'+lane,1,{},true).then(r=>{report.workerRequests.push({lane,status:r.status,ms:Math.round(r.ms)});}).catch(error=>{report.workerRequests.push({lane,status:0,error:error.name});}).finally(()=>pending.delete(promise));promise.lane=lane;pending.add(promise);
  }};
  workerTick();timer=setInterval(workerTick,5000);
  for(const sessions of [5,10,20,40]){
   const reads=[],writes=[],unexpected=[];const began=performance.now();
   await Promise.all(Array.from({length:sessions},async(_,u)=>{const id=2+u,orderId=targets[next++];
    for(let i=0;i<10;i++){
      const routes=['/api/auth/order/car-rental?table=1&size=10&page=1&sort=code&direction=asc&store=32','/api/auth/order/car-rental?table=1&statistics_only=1&scope_count=1&store=32','/api/auth/order/car-rental?table=1&size=10&store=32&search=QA-0000300','/api/auth/returns?order_id='+orderId];
      const r=await request(routes[i%4],id);reads.push(r.ms);if(r.status!==200||r.json.status!=='success')unexpected.push({kind:'read',status:r.status,message:r.json.message});
      if(i===4){const snapshot=await request('/api/auth/returns?order_id='+orderId,id),item=snapshot.json.data?.[0];assert(item,'Return fixture unavailable');
        const body={item_id:item.item_id,item_revision:item.item_revision,returned_at:new Date(Date.now()+7*3600000).toISOString().slice(0,16),hourly_rate:'0'};
        const saved=await request('/api/auth/returns',id,body);writes.push(saved.ms);if(saved.status!==200)unexpected.push({kind:'return',status:saved.status,message:saved.json.message});
        const replay=await request('/api/auth/returns',id,body);if(replay.status!==409)unexpected.push({kind:'return-replay',status:replay.status});
        report.writes.push({orderId,status:saved.status,replayStatus:replay.status});
      }
      await new Promise(r=>setTimeout(r,200));
    }
   }));
   const stage={sessions,seconds:Math.round((performance.now()-began)/1000),reads:summary(reads),writes:summary(writes),unexpected};report.stages.push(stage);console.log(JSON.stringify(stage));
   if(unexpected.length)throw Error('Unexpected staging HTTP result');
  }
  clearInterval(timer);timer=null;await Promise.all(pending);
  fs.writeFileSync(path.join(dir,'fault.json'),JSON.stringify({slowLiveMs:15000}));
  await pool.query("UPDATE himoto.management_gps_accounts SET last_attempt_at=clock_timestamp()-interval '61 seconds',sync_lease_until=NULL");
  const slow=request('/api/cron/gps-live',1,{},true);await new Promise(r=>setTimeout(r,1000));
  const during=await Promise.all(Array.from({length:5},()=>request('/api/cron/integrations',1,{},true)));
  const gps=await slow;report.slowGps={gpsMs:Math.round(gps.ms),notifications:summary(during.map(r=>r.ms)),all200:during.every(r=>r.status===200)};
  assert(report.slowGps.gpsMs>=14000);assert(report.slowGps.notifications.maxMs<3000);assert(report.slowGps.all200);
  fs.unlinkSync(path.join(dir,'fault.json'));
  const ids=report.writes.map(r=>r.orderId),committed=(await pool.query('SELECT count(*)::int AS n FROM himoto.order_vehicle_details WHERE order_id=ANY($1::bigint[]) AND completed_at IS NOT NULL',[ids])).rows[0].n;
  const duplicates=(await pool.query("SELECT count(*)::int AS n FROM (SELECT event_key FROM himoto.management_contract_notifications WHERE order_id=ANY($1::bigint[]) GROUP BY event_key HAVING count(*)>1)d",[ids])).rows[0].n;
  assert.equal(committed,ids.length);assert.equal(duplicates,0);report.writeIntegrity={committed,duplicateNotifications:duplicates};
  assert(report.workerRequests.every(r=>r.status===200),'Background worker HTTP failures occurred under load');
  fs.writeFileSync(path.join(dir,'peak-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({slowGps:report.slowGps,writeIntegrity:report.writeIntegrity,fixtureOnly:true}));
 }finally{if(timer)clearInterval(timer);await Promise.allSettled(pending);if(fs.existsSync(path.join(dir,'fault.json')))fs.unlinkSync(path.join(dir,'fault.json'));await pool.end();fs.writeFileSync(path.join(dir,'peak-results.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});

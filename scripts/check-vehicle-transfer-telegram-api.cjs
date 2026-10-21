const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const session=load(path.join(root,'lib/server/management-session')),originalUser=session.userFromSession;
  const {VehicleTransferTelegramError}=load(path.join(root,'lib/server/vehicle-transfer-telegram'));
  const {NextRequest,NextResponse}=require('next/server');
  let user={id:153,access_role:'branch_staff',store_id:32,permissions:['vehicles.read','vehicles.transfer']};
  let queries=[],saves=0,dispatches=0,failure=0;const callbacks=[];
  const state={eligible:true,event_id:344,vehicle_id:700,status:'pending',can_send:false,message_count:0};
  const dependencies={
    'next/server':{NextRequest,NextResponse,after:callback=>callbacks.push(callback)},
    '@/lib/server/access-request':load(path.join(root,'lib/server/access-request')),
    '@/lib/server/access-context':load(path.join(root,'lib/server/access-context')),
    '@/lib/server/himoto-database':{ownerDatabase:{connect:async()=>({query:async sql=>{queries.push(sql);return {rows:[]};},release(){}})}},
    '@/lib/server/vehicle-transfer-telegram':{VehicleTransferTelegramError,
      readVehicleTransferTelegram:async()=>({state}),
      saveVehicleTransferTelegram:async(_db,vehicle,event,actor)=>{assert.equal(vehicle,700);assert.equal(event,344);assert.equal(actor.id,153);saves++;if(failure)throw new VehicleTransferTelegramError('QA refused',failure);return state;}},
    '@/lib/server/contract-notifications':{dispatchContractNotifications:async(send,limit,db,orders,events)=>{
      assert(queries.includes('COMMIT'));assert.equal(send,undefined);assert.equal(limit,2);assert.equal(db,undefined);assert.equal(orders,undefined);assert.deepEqual(events,[344]);dispatches++;
    }},
  };
  const route={exports:{}};
  const source=fs.readFileSync(path.join(root,'app/api/auth/vehicles/[id]/transfers/[eventId]/telegram/route.ts'),'utf8');
  new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in dependencies);return dependencies[name];},route,route.exports);
  const request=(method='POST',body={action:'send'},origin='http://localhost',eventId='344')=>route.exports[method](new NextRequest(`http://localhost/api/auth/vehicles/700/transfers/${eventId}/telegram`,{method,headers:{origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({id:'700',eventId})});
  try{
    session.userFromSession=async()=>user;
    assert.equal((await request('POST',{action:'send'},'https://foreign.invalid')).status,403);
    user=null;assert.equal((await request()).status,401);
    user={id:153,access_role:'branch_staff',store_id:32,permissions:[]};assert.equal((await request()).status,403);assert.equal(queries.length,0);
    user.permissions=['vehicles.read','vehicles.transfer'];
    assert.equal((await request('GET')).status,200);assert(queries.includes('BEGIN READ ONLY'));assert.equal(saves,0);assert.equal(callbacks.length,0);
    for(const body of [{action:'send',extra:true},{action:'retry'},null])assert.equal((await request('POST',body)).status,400);
    assert.equal((await request('POST',{action:'send'},'http://localhost','0')).status,400);assert.equal(saves,0);
    queries=[];const response=await request();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    assert.equal(callbacks.length,1);assert.equal(dispatches,0);await callbacks.shift()();assert.equal(dispatches,1);
    for(const status of [400,403,404,409]){failure=status;queries=[];const response=await request();assert.equal(response.status,status);assert.equal((await response.json()).message,'QA refused');assert(queries.includes('ROLLBACK'));assert.equal(callbacks.length,0);}
    console.log(JSON.stringify({passed:4,checks:['Unsigned, unauthorized and cross-origin requests stop before database access','Preview is read-only; invalid IDs and send bodies cannot queue a message','Explicit send commits before dispatching both destinations, filtered to the selected vehicle event','Validation and permission failures roll back without dispatch'],realTelegramRequests:0}));
  }finally{session.userFromSession=originalUser;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

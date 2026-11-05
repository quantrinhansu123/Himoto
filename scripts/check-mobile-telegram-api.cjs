// Route adapter checks only. Services/dispatchers mocked; no env/network/data.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server'),{load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const {MobileError}=load(path.join(root,'lib/server/mobile-session')),response=load(path.join(root,'lib/server/mobile-response'));
  let authorized=true,fail=false,committed=false,action='send',reads=0,writes=0,dispatches=0,retractions=0;const callbacks=[];
  const dependencies={
    'next/server':{NextRequest,NextResponse,after:fn=>callbacks.push(fn)},
    '@/lib/server/mobile-session':{requireMobileSession:async()=>{if(!authorized)throw new MobileError('QA expired',401);return{user:{id:7}};}},
    '@/lib/server/mobile-response':response,
    '@/lib/server/mobile-telegram':{
      readMobileContractTelegram:async(_user,id)=>{reads++;assert.equal(id,'9301');return{events:[]};},
      readMobileTransferTelegram:async(_user,id,event)=>{reads++;assert.equal(id,'19303');assert.equal(event,'501');return{status:'pending'};},
      writeMobileContractTelegram:async(_user,id)=>{writes++;assert.equal(id,'9301');if(fail)throw new MobileError('QA rejected',409);committed=true;return{action};},
      writeMobileTransferTelegram:async(_user,id,event)=>{writes++;assert.equal(id,'19303');assert.equal(event,'501');if(fail)throw new MobileError('QA rejected',409);committed=true;return{action:'send'};},
    },
    '@/lib/server/contract-notifications':{dispatchContractNotifications:async(send,limit,db,orders,events)=>{assert(committed);assert.equal(send,undefined);assert.equal(db,undefined);if(events){assert.equal(limit,2);assert.deepEqual(events,[501]);assert.equal(orders,undefined);}else{assert.equal(limit,1);assert.deepEqual(orders,[9301]);}dispatches++;}},
    '@/lib/server/telegram-retractions':{dispatchTelegramRetractions:async(send,limit,db,orders)=>{assert(committed);assert.equal(send,undefined);assert.equal(db,undefined);assert.equal(limit,1);assert.deepEqual(orders,[9301]);retractions++;}},
  };
  function route(filename){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in dependencies,name);return dependencies[name];},module,module.exports);return module.exports;}
  const contract=route(path.join(root,'app/api/mobile/v1/contracts/[id]/telegram/route.ts')),transfer=route(path.join(root,'app/api/mobile/v1/vehicles/[id]/transfers/[eventId]/telegram/route.ts'));
  const request=method=>new NextRequest('https://qa.invalid/telegram',{method,...(method==='POST'?{body:'{}'}:{})});
  for(const [adapter,params]of[[contract,{id:'9301'}],[transfer,{id:'19303',eventId:'501'}]]){
    assert.equal((await adapter.GET(request('GET'),{params:Promise.resolve(params)})).status,200);assert.equal(callbacks.length,0);assert.equal(writes,0);
    authorized=false;assert.equal((await adapter.POST(request('POST'),{params:Promise.resolve(params)})).status,401);assert.equal(callbacks.length,0);authorized=true;
    fail=true;assert.equal((await adapter.POST(request('POST'),{params:Promise.resolve(params)})).status,409);assert.equal(callbacks.length,0);fail=false;
    for(const chosen of adapter===contract?['send','resume','retry_confirmed_absent','retract']:['send']){action=chosen;committed=false;const previous=dispatches+retractions;assert.equal((await adapter.POST(request('POST'),{params:Promise.resolve(params)})).status,200);assert(committed);assert.equal(dispatches+retractions,previous);assert.equal(callbacks.length,1);await callbacks.shift()();assert.equal(dispatches+retractions,previous+1);}
    writes=0;
  }
  assert.equal(reads,2);assert.equal(dispatches,4);assert.equal(retractions,1);
  console.log(JSON.stringify({passed:3,checks:['GET is read-only and cannot schedule delivery even for pending state','Unauthorized/failed write schedules nothing','Explicit send/resume/retry or retract schedules only after committed service response and filters dispatcher to original contract or vehicle event'],realTelegramRequests:0,dispatcher:'mock only'},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){
 const session=load(path.join(root,'lib/server/management-session')),originalUser=session.userFromSession;
 const {ContractTelegramError}=load(path.join(root,'lib/server/contract-telegram'));
 const {TelegramRetractionError}=load(path.join(root,'lib/server/telegram-retractions'));
 const {NextRequest,NextResponse}=require('next/server');let user={id:143,access_role:'branch_staff',permissions:['contracts.read','contracts.draft'],store_id:23,scope_all:false};
 let failure=0,deletes=0,sends=0,queries=[],action='retract';const callbacks=[];
 const dependencies={
  '@/lib/server/public-failure':load(path.join(root,'lib/server/public-failure')),
  'next/server':{NextRequest,NextResponse,after:callback=>callbacks.push(callback)},
  '@/lib/server/access-request':load(path.join(root,'lib/server/access-request')),
  '@/lib/server/access-context':load(path.join(root,'lib/server/access-context')),
  '@/lib/server/himoto-database':{himotoPool:{connect:async()=>({query:async sql=>{queries.push(sql);return {rowCount:1,rows:[]};},release(){}})}},
  '@/lib/server/contract-telegram':{ContractTelegramError,saveContractTelegram:async(_db,id,actor,_user,input)=>{assert.equal(id,901);assert.equal(actor,143);assert.equal(input.action,action);if(failure)throw new (action==='resume'?ContractTelegramError:TelegramRetractionError)('QA refused',failure);},readContractTelegram:async()=>({state:{auto_enabled:false,events:[]}})},
  '@/lib/server/telegram-retractions':{TelegramRetractionError,dispatchTelegramRetractions:async(_send,limit,_db,ids)=>{assert.equal(limit,1);assert.deepEqual(ids,[901]);deletes++;}},
  '@/lib/server/contract-notifications':{dispatchContractNotifications:async(_send,limit,_db,ids)=>{assert(queries.includes('COMMIT'));assert.equal(limit,1);assert.deepEqual(ids,[901]);sends++;}},
 };
 const route={exports:{}};const source=fs.readFileSync(path.join(root,'app/api/auth/order/car-rental/[id]/telegram/route.ts'),'utf8');
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in dependencies);return dependencies[name];},route,route.exports);
 const request=(origin='http://localhost')=>route.exports.POST(new NextRequest('http://localhost/api/auth/order/car-rental/901/telegram',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action})}),{params:Promise.resolve({id:'901'})});
 try{
  session.userFromSession=async()=>user;
  assert.equal((await request('https://foreign.test')).status,403);assert.equal(queries.length,0);
  user=null;assert.equal((await request()).status,401);user={id:143,access_role:'branch_staff',permissions:['contracts.read','contracts.draft'],store_id:23,scope_all:false};
  const response=await request();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(callbacks.length,1);assert.equal(deletes,0);
  assert(queries.includes('COMMIT'));await callbacks.shift()();assert.equal(deletes,1);assert.equal(sends,0);
  for(const status of [400,403,404,409]){failure=status;queries=[];const response=await request();assert.equal(response.status,status);assert.equal((await response.json()).message,'QA refused');assert(queries.includes('ROLLBACK'));assert.equal(callbacks.length,0);}
  action='resume';failure=0;queries=[];
  assert.equal((await request()).status,200);assert.equal(sends,0);assert.equal(callbacks.length,1);await callbacks.shift()();assert.equal(sends,1);assert.equal(deletes,1);
  for(const status of [400,403,404,409]){failure=status;queries=[];assert.equal((await request()).status,status);assert(queries.includes('ROLLBACK'));assert.equal(callbacks.length,0);}
  console.log(JSON.stringify({passed:4,checks:['API rejects unsigned and cross-origin requests before DB access','Confirmed queue commits before the dedicated retraction worker; no send worker or Telegram network invoked','Retraction validation/scope/permission/conflict errors retain 400/403/404/409 and roll back','Resume commits before dispatch, filters to the selected contract and rolls back validation/permission/conflict failures without sending'],realTelegramRequests:0}));
 }finally{session.userFromSession=originalUser;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

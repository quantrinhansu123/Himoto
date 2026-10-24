const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs'),{NextRequest,NextResponse}=require('next/server');
const session=load(path.join(root,'lib/server/management-session')),access=load(path.join(root,'lib/server/access-request')),{dataAccess}=load(path.join(root,'lib/server/access-context'));
const service=load(path.join(root,'lib/server/contract-lifecycle'));
async function main(){const saved=[session.userFromSession,session.readSessionUser],checks=[];let user,queries=[],failure=0,applied=0;
 const context={id:100,code:'QA',status:'bad_debt',revision:'1',items:[],events:[],all_returned:false,can_settle:false};
 const dependencies={'next/server':{NextRequest,NextResponse},'@/lib/server/access-request':access,'@/lib/server/access-context':{dataAccess},'@/lib/server/public-failure':load(path.join(root,'lib/server/public-failure')),
   '@/lib/server/himoto-database':{himotoPool:{connect:async()=>({query:async sql=>{queries.push(sql);return {rows:[]};},release(){}})}},
   '@/lib/server/contract-lifecycle':{ContractLifecycleError:service.ContractLifecycleError,readContractLifecycle:async()=>context,applyContractLifecycle:async(_db,id,actor,body)=>{assert.equal(id,100);assert.equal(actor,70001);service.parseContractLifecycle(body);applied++;if(failure)throw new service.ContractLifecycleError('QA changed',failure);return context;}}};
 const route={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'app/api/auth/order/car-rental/[id]/lifecycle/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in dependencies,name);return dependencies[name];},route,route.exports);
 const body=action=>({action,revision:'1',request_id:randomUUID(),note:'QA reviewed state',at:'2026-10-24T10:00',confirmed:true});
 const request=(method='GET',input,origin='http://localhost',id='100')=>route.exports[method](new NextRequest('http://localhost/api/auth/order/car-rental/'+id+'/lifecycle',{method,headers:{origin,'content-type':'application/json'},...(input!==undefined?{body:JSON.stringify(input)}:{})}),{params:Promise.resolve({id})});
 try{session.userFromSession=async()=>user;session.readSessionUser=async()=>user;
   user=null;assert.equal((await request()).status,401);assert.equal((await request('POST',body('hold'))).status,401);assert.equal(queries.length,0);
   user={id:70001,access_role:'branch_staff',permissions:['contracts.read'],store_id:80001,scope_all:false};assert.equal((await request('POST',body('mark_bad_debt'))).status,403);assert.equal((await request()).status,200);assert(queries.includes('BEGIN READ ONLY'));assert.equal(applied,0);queries=[];
   assert.equal((await request('POST',body('hold'),'https://foreign.invalid')).status,403);assert.equal(queries.length,0);
   checks.push('Anonymous, read-only and cross-origin mutations stop before the database; contract readers can inspect state without writes');
   for(const role of ['branch_staff','ownership_staff','ownership_manager']){user={...user,access_role:role,permissions:['contracts.read','contracts.return']};const response=await request('POST',body('mark_bad_debt'));assert.equal(response.status,200);assert(response.headers.get('cache-control').includes('no-store'));assert(queries.includes('BEGIN')&&queries.includes('COMMIT'));queries=[];}
   checks.push('Operating staff and both ownership roles can submit validated lifecycle actions under their existing contracts.return scope');
   user={...user,access_role:'accounting',permissions:['contracts.read','finance.write']};assert.equal((await request('POST',body('settle'))).status,200);assert.equal((await request('POST',body('hold'))).status,403);assert.equal((await request('POST',body('mark_bad_debt'))).status,403);
   checks.push('Accounting may confirm a reconciled settlement, while ownership/vehicle state changes still require operating permissions');
   user={...user,access_role:'branch_staff',permissions:['contracts.read','contracts.return']};
   for(const code of [400,404,409]){failure=code;queries=[];assert.equal((await request('POST',body('settle'))).status,code);assert(queries.includes('ROLLBACK'));assert(!queries.includes('COMMIT'));}failure=0;
   assert.equal((await request('POST',{action:'settle'})).status,400);assert.equal((await request('GET',undefined,'http://localhost','0')).status,400);
   checks.push('Stale/out-of-scope/invalid state and malformed inputs roll back; no money, return, notification or Telegram call is performed by the API test');
 }finally{[session.userFromSession,session.readSessionUser]=saved;}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

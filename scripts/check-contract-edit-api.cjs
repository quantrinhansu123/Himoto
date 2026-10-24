const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {load,root}=require('./lib/load-typescript.cjs'),{NextRequest,NextResponse}=require('next/server');
const session=load(path.join(root,'lib/server/management-session')),access=load(path.join(root,'lib/server/access-request'));
const {dataAccess}=load(path.join(root,'lib/server/access-context')),service=load(path.join(root,'lib/server/contract-profile'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
async function main(){
 const original=[session.userFromSession,session.readSessionUser,session.protectDatabaseRequest];
 let user,queries=[],saved=0,failure=0;
 const draft=load(path.join(root,'lib/management/contract-document')).createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all');
 draft.customer.name='Khách API';draft.customer.phone='0900000001';draft.customer.id_card='001234567890';
 const body={revision:'1',contract_number:'005987',notes:'Sửa số HĐ',profile:load(path.join(root,'lib/management/contract-profile')).contractProfile(draft)};
 const dependencies={'next/server':{NextRequest,NextResponse},'@/lib/server/access-request':access,
  '@/lib/server/management-session':session,'@/lib/server/public-failure':load(path.join(root,'lib/server/public-failure')),
  '@/lib/server/himoto-database':{himotoPool:{connect:async()=>({query:async sql=>{queries.push(sql);return{rows:[]};},release(){}})}},
  '@/lib/server/contract-profile':{ContractProfileError:service.ContractProfileError,updateContractProfile:async(_db,id,actor,input)=>{
   assert.equal(id,100);assert.equal(actor,user.id);assert.equal(dataAccess.getStore().store_id,user.store_id);service.parseContractProfile(input);
   if(failure)throw new service.ContractProfileError('QA denied',failure);saved++;return{revision:'2',code:'005987'};
  }}};
 const route={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'app/api/auth/order/car-rental/[id]/profile/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in dependencies,name);return dependencies[name];},route,route.exports);
 const request=(input=body,origin='http://localhost',id='100')=>route.exports.PATCH(new NextRequest(`http://localhost/api/auth/order/car-rental/${id}/profile`,{method:'PATCH',headers:{origin,'content-type':'application/json'},body:typeof input==='string'?input:JSON.stringify(input)}),{params:Promise.resolve({id})});
 try{
  session.userFromSession=async()=>user;session.readSessionUser=async()=>user;session.protectDatabaseRequest=async()=>null;
  user=null;assert.equal((await request()).status,401);assert.equal(queries.length,0);
  for(const role of ['accounting','internal_control','hr']){user={id:70001,access_role:role,store_id:32,permissions:[...ACCESS_ROLES[role].permissions],scope_all:false};assert.equal((await request()).status,403);}
  assert.equal(queries.length,0);assert.equal(saved,0);
  for(const role of ['branch_staff','ownership_staff','ownership_manager','admin']){
   user={id:70001,access_role:role,store_id:32,permissions:[...ACCESS_ROLES[role].permissions],scope_all:role==='admin'};
   const response=await request();assert.equal(response.status,200);assert(response.headers.get('cache-control').includes('no-store'));
   assert(queries.includes('BEGIN')&&queries.includes('COMMIT'));queries=[];
  }
  assert.equal((await request(body,'https://foreign.invalid')).status,403);assert.equal(queries.length,0);
  assert.equal((await request('{')).status,400);assert.equal((await request(body,'http://localhost','0')).status,400);assert.equal(queries.length,0);
  for(const status of [403,404,409]){failure=status;assert.equal((await request()).status,status);assert(queries.includes('ROLLBACK'));assert(!queries.includes('COMMIT'));queries=[];}
  failure=0;assert.equal((await request({...body,store_id:33})).status,400);assert(queries.includes('ROLLBACK'));
 }finally{[session.userFromSession,session.readSessionUser,session.protectDatabaseRequest]=original;}
 console.log(JSON.stringify({passed:4,checks:['Anonymous, accounting, internal control, HR and cross-origin calls stop before DB access','Branch and both ownership roles can edit through their existing draft permission; admin remains supported','The service receives authenticated actor/store context and successful edits commit with no-store responses','Malformed, forbidden, missing and stale/conflicting changes reject or roll back'],realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

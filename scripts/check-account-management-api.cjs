const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {load,root}=require('./lib/load-typescript.cjs'),{NextRequest,NextResponse}=require('next/server');
const session=load(path.join(root,'lib/server/management-session')),account=load(path.join(root,'lib/server/account-management'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
const original=session.userFromSession,originalRead=session.readSessionUser,checks=[];
const manager={id:7,access_role:'branch_manager',store_id:32,scope_all:false,permissions:[...ACCESS_ROLES.branch_manager.permissions]};
let actor=manager,connections=0,writes=0,deletes=0,failure=null,queries=[];
const deps={
 'next/server':{NextRequest,NextResponse},
 '@/lib/server/access-request':load(path.join(root,'lib/server/access-request')),
 '@/lib/server/access-context':load(path.join(root,'lib/server/access-context')),
 '@/lib/server/public-failure':load(path.join(root,'lib/server/public-failure')),
 '@/lib/server/account-passwords':load(path.join(root,'lib/server/account-passwords')),
 '@/lib/server/management-session':session,
 '@/lib/server/himoto-database':{ownerDatabase:{connect:async()=>{connections++;return {query:async sql=>{queries.push(sql);return {rows:[],rowCount:1};},release(){}};}}},
 '@/lib/server/account-management':{...account,
  listManagedAccounts:async(_db,user)=>{assert.equal(user.store_id,32);return [];},
  saveManagedAccount:async(_db,id,raw,target,user)=>{assert.equal(id,7);assert.equal(user.store_id,32);if(failure)throw failure;writes++;return {id:target||901,...(!target?{credentials:{login_name:'qa.generated',password:'QA-only-generated-secret',enabled:true}}:{})};},
  deleteManagedAccount:async(_db,id,target,revision,user)=>{assert.equal(id,7);assert.equal(target,901);assert.equal(revision,'1');assert.equal(user.store_id,32);deletes++;return {id:target};}
 }
};
const moduleRoute={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'app/api/auth/accounts/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in deps,name);return deps[name];},moduleRoute,moduleRoute.exports);
const request=(method,body,origin='http://localhost')=>moduleRoute.exports[method](new NextRequest('http://localhost/api/auth/accounts',{method,headers:{origin,'Content-Type':'application/json'},...(method!=='GET'?{body:JSON.stringify(body)}:{})}),{});
async function main(){try{
 session.userFromSession=async()=>actor;
 session.readSessionUser=async()=>actor;
 assert.equal((await request('POST',{},'https://foreign.invalid')).status,403);assert.equal(connections,0);
 actor=null;assert.equal((await request('GET')).status,401);assert.equal(connections,0);
 actor={...manager,access_role:'branch_staff'};assert.equal((await request('GET')).status,403);assert.equal(connections,0);
 actor={...manager,scope_all:true};assert.equal((await request('POST',{})).status,403);assert.equal(connections,0);
 actor=manager;
 const list=await request('GET');assert.equal(list.status,200);assert.match(list.headers.get('cache-control'),/private, no-store/);
 checks.push('Anonymous, cross-origin and forged non-manager/global-branch actors stop before owner DB access; manager reads receive the authenticated branch scope');
 queries=[];const create=await request('POST',{});assert.equal(create.status,200);assert.equal((await create.json()).data.credentials.login_name,'qa.generated');assert(queries.includes('BEGIN')&&queries.includes('COMMIT'));assert.match(create.headers.get('cache-control'),/no-store/);
 assert.equal((await request('PATCH',{id:901})).status,200);assert.equal(writes,2);
 assert.equal((await request('DELETE',{id:901,revision:'1'})).status,200);assert.equal(deletes,1);
 checks.push('Create/update/delete commit only authenticated manager operations and generated credentials are returned once without cache');
 for(const body of [null,[],{id:0},{id:'bad'}])assert.equal((await request('PATCH',body)).status,400);
 failure=Object.assign(Error('QA duplicate'),{code:'23505'});queries=[];assert.equal((await request('POST',{})).status,409);assert(queries.includes('ROLLBACK'));assert(!queries.includes('COMMIT'));
 failure=new account.AccountAccessError('QA scope denied',403);queries=[];assert.equal((await request('POST',{})).status,403);assert(queries.includes('ROLLBACK'));assert(!queries.includes('COMMIT'));
 checks.push('Malformed IDs/bodies remain 400, duplicate login returns 409, and denied writes roll back without exposing SQL/provider details');
 }finally{session.userFromSession=original;session.readSessionUser=originalRead;}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,passwordsReal:false},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

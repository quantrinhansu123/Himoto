const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs'),{NextRequest}=require('next/server');
const sessions=load(path.join(root,'lib/server/management-session')),service=load(path.join(root,'lib/server/return-corrections')),database=load(path.join(root,'lib/server/himoto-database')).himotoPool;
const {ContractReturnError}=load(path.join(root,'lib/server/contract-returns'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
const original={user:sessions.userFromSession,read:sessions.readSessionUser,correct:service.correctReturn,context:service.readReturnCorrection,connect:Object.getOwnPropertyDescriptor(database,'connect')};
let actor=null,connections=0,queries=[],writes=0,failed=false;
const staff={id:143,access_role:'branch_staff',store_id:23,scope_all:false,permissions:[...ACCESS_ROLES.branch_staff.permissions]};
const body={item_id:1001,revision:'a'.repeat(64),request_id:randomUUID(),reason:'QA wrong refund method',note:'QA',items:[{item_id:1001,item_revision:'7',returned_at:'2026-10-24T12:30',hourly_rate:'20000',fee_override:'0'}],settlement:{order_id:1,revision:'7',receipts:[]}};
const request=(handler,method,payload=body,origin='https://qa.example')=>handler(new NextRequest('https://qa.example/api/auth/returns/correction?item_id=1001',{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(payload)})}),{});
async function main(){const checks=[];
 try{
  sessions.userFromSession=async()=>actor;sessions.readSessionUser=async()=>actor;
  Object.defineProperty(database,'connect',{configurable:true,value:async()=>{connections++;return {query:async sql=>{queries.push(sql);return {rows:[]};},release(){}};}});
  service.correctReturn=async(_db,id,value)=>{assert.equal(id,143);assert.equal(value.item_id,1001);assert.equal(value.reason,body.reason);writes++;if(failed)throw new ContractReturnError('QA stale return',409);return {order_id:1,revision:'b'.repeat(64)};};
  service.readReturnCorrection=async(_db,id)=>{assert.equal(id,1001);return {order_id:1};};
  const route=load(path.join(root,'app/api/auth/returns/correction/route'));
  assert.equal((await request(route.PATCH,'PATCH')).status,401);
  actor={...staff,access_role:'headquarters_sales',permissions:['contracts.read']};assert.equal((await request(route.PATCH,'PATCH')).status,403);
  actor=staff;assert.equal((await request(route.PATCH,'PATCH',body,'https://foreign.invalid')).status,403);
  assert.equal((await request(route.PATCH,'PATCH',null)).status,400);
  assert.equal((await request(route.PATCH,'PATCH',{...body,store_id:31})).status,400);
  assert.equal(connections,0);checks.push('Authentication, return permission, same origin and strict parsing reject invalid writes before connecting');
  const response=await request(route.PATCH,'PATCH');assert.equal(response.status,200);assert.equal(writes,1);assert.deepEqual(queries,['BEGIN','COMMIT']);assert.match(response.headers.get('cache-control'),/private, no-store/);
  queries=[];const read=await request(route.GET,'GET');assert.equal(read.status,200);assert.deepEqual(queries,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','COMMIT']);
  checks.push('Corrections commit once and reads use a consistent read-only transaction; responses are private and uncached');
  queries=[];failed=true;const conflict=await request(route.PATCH,'PATCH');assert.equal(conflict.status,409);assert.deepEqual(queries,['BEGIN','ROLLBACK']);
  checks.push('Conflicting updates roll back and return the actionable conflict without a successful save');
 }finally{sessions.userFromSession=original.user;sessions.readSessionUser=original.read;service.correctReturn=original.correct;service.readReturnCorrection=original.context;Object.defineProperty(database,'connect',original.connect);}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

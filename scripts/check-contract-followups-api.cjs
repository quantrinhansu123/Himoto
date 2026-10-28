const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {NextRequest}=require('next/server');
const session=load(path.join(root,'lib/server/management-session'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {himotoPool}=load(path.join(root,'lib/server/himoto-database'));
const route=load(path.join(root,'app/api/auth/order/car-rental/followups/route'));
const originalUser=session.userFromSession,originalRead=session.readSessionUser,descriptors=Object.getOwnPropertyDescriptors(himotoPool);
let actor={id:101,access_role:'branch_staff',store_id:35,scope_all:false,permissions:['contracts.read','contracts.draft']},calls=[],orderStore=35,conflict=false;
const body={order_id:1,revision:1,contact_status:'contacted',handling_status:'branch',customer_condition:'Đã liên hệ',notes:''};
const request=(method,query='',value=body,origin='http://localhost')=>new NextRequest('http://localhost/api/auth/order/car-rental/followups'+query,{method,headers:{origin,host:'localhost','Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(value)})});
async function main(){
 try{
  session.userFromSession=async()=>actor;session.readSessionUser=async()=>actor;
  Object.defineProperty(himotoPool,'query',{configurable:true,value:async(sql,values)=>{calls.push({sql,values});assert.equal(dataAccess.getStore().id,101);assert.match(sql,/FROM himoto.orders o/);assert.match(sql,/o.deleted_at IS NULL/);assert.deepEqual(values,[[1,2]]);return {rows:[{id:1,notes:'Ghi chú đã có',revision:4},{id:2}]};}});
  Object.defineProperty(himotoPool,'connect',{configurable:true,value:async()=>({release(){},async query(sql,values){calls.push({sql,values});if(sql.startsWith('SELECT id,store_id'))return {rows:[{id:1,store_id:orderStore}]};if(sql.startsWith('INSERT INTO himoto.management_collection_followups'))return {rows:[],rowCount:0};if(sql.startsWith('UPDATE himoto.management_collection_followups'))return {rows:conflict?[]:[{revision:2}],rowCount:conflict?0:1};return {rows:[],rowCount:1};}})});
  const enabled=actor;actor=null;assert.equal((await route.GET(request('GET','?ids=1,2'))).status,401);assert.equal(calls.length,0);actor=enabled;
  for(const ids of ['', '0','-1','1,x',Array.from({length:201},(_,i)=>i+1).join(',')])assert.equal((await route.GET(request('GET','?ids='+ids))).status,400);
  assert.equal(calls.length,0);
  const read=await route.GET(request('GET','?ids=1,2,1'));assert.equal(read.status,200);assert.match(read.headers.get('cache-control'),/no-store/);
  const values=(await read.json()).data;assert.equal(values[0].followup.notes,'Ghi chú đã có');assert.equal(values[1].followup.revision,0);assert.equal(values[1].followup.notes,'');
  actor={...enabled,permissions:['contracts.read']};calls=[];assert.equal((await route.PATCH(request('PATCH'))).status,403);assert.equal(calls.length,0);actor=enabled;
  assert.equal((await route.PATCH(request('PATCH','',body,'https://foreign.invalid'))).status,403);assert.equal(calls.length,0);
  assert.equal((await route.PATCH(request('PATCH','',{...body,notes:123}))).status,400);assert.equal(calls.length,0);
  orderStore=23;assert.equal((await route.PATCH(request('PATCH'))).status,403);assert(calls.some(c=>c.sql==='ROLLBACK'));assert(!calls.some(c=>c.sql.startsWith('INSERT')));
  orderStore=35;calls=[];const saved=await route.PATCH(request('PATCH'));assert.equal(saved.status,200);assert.equal((await saved.json()).data.revision,2);assert(calls.some(c=>c.sql==='COMMIT'));assert(calls.some(c=>c.sql.startsWith('INSERT INTO himoto.management_collection_history')));assert(!calls.some(c=>/UPDATE himoto.orders|himoto.transactions|UPDATE himoto.vehicles/.test(c.sql)));
  conflict=true;calls=[];assert.equal((await route.PATCH(request('PATCH'))).status,409);assert(calls.some(c=>c.sql==='ROLLBACK'));assert(!calls.some(c=>c.sql.includes('INSERT INTO himoto.management_collection_history')));
  console.log(JSON.stringify({passed:5,checks:['Authentication, operating permission and same-origin guards run before DB access','Bounded contract IDs are deduplicated and reads preserve notes/defaults without caching','Malformed, read-only and foreign-branch writes are rejected','Blank notes save with revision/history and do not change contracts, vehicles or money','Concurrent edits roll back without recording a false history entry'],realBusinessWrites:0}));
 }finally{session.userFromSession=originalUser;session.readSessionUser=originalRead;Object.defineProperties(himotoPool,descriptors);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {NextRequest}=require('next/server');
const policy=load(path.join(root,'lib/management/contract-approval'));
const session=load(path.join(root,'lib/server/management-session'));
const db=load(path.join(root,'lib/server/himoto-database'));
const finalize=load(path.join(root,'app/api/auth/order/car-rental/[id]/finalize/route'));
const handover=load(path.join(root,'app/api/auth/order/car-rental/[id]/handover/route'));
const descriptors=Object.getOwnPropertyDescriptors(db.himotoPool),originalUser=session.userFromSession,originalRead=session.readSessionUser;
const permissions=['contracts.read','contracts.draft','contracts.finalize'];
const previousEnv={DATABASE_URL:process.env.DATABASE_URL,MANAGEMENT_SESSION_SECRET:process.env.MANAGEMENT_SESSION_SECRET};
process.env.DATABASE_URL='postgres://fixture.invalid/test';process.env.MANAGEMENT_SESSION_SECRET='ownership-approval-fixture-key-32-characters';
let actor={id:165,access_role:'headquarters_sales',store_id:null,scope_all:true,permissions},queries=[],kind='ownership',composerKind='ownership',status='draft';
const request=(action,body)=>new NextRequest(`http://localhost/api/auth/order/car-rental/901/${action}`,{method:'POST',headers:{host:'localhost',origin:'http://localhost',cookie:`${session.SESSION_COOKIE}=${session.signSession(actor.id)}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function main(){try{
  for(const role of ['ownership_staff','branch_staff','headquarters_sales','headquarters_debt','accounting','internal_control']){
    assert.equal(policy.canFinalizeRentalContract({...actor,access_role:role},'ownership'),false);
    assert.equal(policy.canFinalizeRentalContract({...actor,access_role:role},'ownership_cd'),false);
    assert.equal(policy.canFinalizeRentalContract({...actor,access_role:role},'daily'),true);
  }
  for(const role of ['ownership_manager','branch_manager','admin'])assert(policy.canFinalizeRentalContract({...actor,access_role:role},'ownership'));
  assert(!policy.canApproveOwnershipContract({...actor,access_role:'ownership_manager',permissions:['contracts.read']}));
  session.userFromSession=async()=>actor;session.readSessionUser=async()=>actor;
  Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>({release(){},async query(sql){queries.push(sql);if(sql.includes('FROM himoto.orders WHERE id=$1'))return {rows:[{id:901,order_status:status,order_type:kind,store_id:36,customer_id:1,revision:'7',draft_payload:{management_composer:{rental_type:composerKind,draft:{}}}}],rowCount:1};return {rows:[],rowCount:0};}})});
  for(const role of ['headquarters_sales','branch_staff','ownership_staff'])for(const type of ['ownership','ownership_cd']){
    actor={...actor,access_role:role};kind=type;composerKind=type;status='draft';queries=[];
    let response=await finalize.POST(request('finalize',{revision:'7',receipts:[]}),{params:Promise.resolve({id:'901'})});assert.equal(response.status,403);assert.match((await response.json()).message,/quản lý duyệt/);assert(queries.includes('ROLLBACK'));assert(!queries.some(q=>/^(INSERT|UPDATE|DELETE)/.test(q)));
    status='deposit_contract';queries=[];response=await handover.POST(request('handover',{revision:'7'}),{params:Promise.resolve({id:'901'})});assert.equal(response.status,403);assert(queries.includes('ROLLBACK'));assert(!queries.some(q=>/^(INSERT|UPDATE|DELETE)/.test(q)));
  }
  kind='ownership';composerKind='daily';status='draft';queries=[];
  assert.equal((await finalize.POST(request('finalize',{revision:'7',receipts:[]}),{params:Promise.resolve({id:'901'})})).status,403);
  console.log(JSON.stringify({passed:4,checks:['Ownership and ownership_cd require a manager/admin with finalize permission; staff cannot use a broad legacy grant to approve','Ordinary rentals preserve the existing explicit finalize grant','Actual finalize and handover APIs reject staff before any business mutation or Telegram queue','Persisted ownership type cannot be bypassed through inconsistent composer metadata'],realBusinessWrites:0,realTelegramRequests:0}));
}finally{session.userFromSession=originalUser;session.readSessionUser=originalRead;Object.defineProperties(db.himotoPool,descriptors);for(const [key,value] of Object.entries(previousEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}}
main().catch(e=>{console.error(e);process.exitCode=1;});

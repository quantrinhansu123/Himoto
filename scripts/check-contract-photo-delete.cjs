const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {contractPhotoWritePermission,isContractTransactionPhoto}=load(path.join(root,'lib/management/contract-photos'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
const session=load(path.join(root,'lib/server/management-session'));
const database=load(path.join(root,'lib/server/himoto-database'));
const {requestPermission}=load(path.join(root,'lib/server/access-request'));
const {NextRequest}=require('next/server');
const checks=[];
let user,queries=[],saved=new Set(),released=0;
function reset(role='branch_staff'){
  user={id:143,store_id:32,access_role:role,permissions:[...ACCESS_ROLES[role].permissions],scope_all:role==='admin'};
  queries=[];saved=new Set(['renewal-2-1','renewal-2-2','renewal-receipt-401-document-1','return-101-1']);released=0;
}
const client={
  release(){released++;},
  async query(sql,params=[]){
    queries.push({sql,params});
    const own=Number(params[0])===901;
    if(sql.startsWith('SELECT draft_payload'))return {rowCount:own?1:0,rows:own?[{draft_payload:{management_composer:{versions:[{kind:'renewal',version:2}]}},order_status:'completed'}]:[]};
    if(sql.startsWith('SELECT id FROM himoto.orders'))return {rowCount:own?1:0,rows:own?[{id:901}]:[]};
    if(sql.includes('FROM himoto.management_contract_payments'))return {rowCount:Number(params[0])===401&&Number(params[1])===901?1:0,rows:[]};
    if(sql.includes('FROM himoto.order_vehicle_details'))return {rowCount:Number(params[0])===101&&Number(params[1])===901?1:0,rows:[]};
    if(sql.startsWith('DELETE FROM himoto.management_record_photos')){
      assert.deepEqual(params.slice(0,2),['contracts',901]);
      const exists=saved.delete(params[2]);return {rowCount:exists?1:0,rows:exists?[{slot:params[2]}]:[]};
    }
    assert(['BEGIN','COMMIT','ROLLBACK'].includes(sql),sql);
    return {rowCount:0,rows:[]};
  },
};
async function main(){
  for(const [slot,permission]of Object.entries({'rental-1':'contracts.draft','rental-document-50':'contracts.draft','customer-id-front':'contracts.draft','driver-license':'contracts.draft','plate-12':'contracts.draft','handover-video-1':'contracts.finalize','return-101-document-2':'contracts.return','renewal-2-4':'contracts.renew','renewal-receipt-401-document-30':'contracts.renew','battery-swap-5-video-1':'contracts.renew','vehicle-swap-6-1':'contracts.draft'})){
    assert.equal(contractPhotoWritePermission(slot),permission);
    assert.equal(contractPhotoWritePermission(slot),requestPermission(`/api/auth/record-photos/contracts/901/${slot}`,'DELETE'));
    assert(isContractTransactionPhoto(slot)||slot.startsWith('plate-'));
  }
  for(const slot of ['../photo','renewal-0-1','rental-0','return-1-video-4','unknown-1'])assert.equal(contractPhotoWritePermission(slot),null);
  checks.push('Gallery permission matches the existing DELETE API across all supported contract phases, identity photos and plates; unknown slots fail closed');
  const original={protect:session.protectDatabaseRequest,user:session.userFromSession,connect:Object.getOwnPropertyDescriptor(database.himotoPool,'connect')};
  session.protectDatabaseRequest=async()=>null;session.userFromSession=async()=>user;
  Object.defineProperty(database.himotoPool,'connect',{configurable:true,value:async()=>client});
  try{
    const {DELETE}=load(path.join(root,'app/api/auth/record-photos/[entity]/[id]/[slot]/route'));
    const request=(slot='renewal-2-1',id='901',origin='http://localhost')=>DELETE(new NextRequest(`http://localhost/api/auth/record-photos/contracts/${id}/${slot}`,{method:'DELETE',headers:{Origin:origin}}),{params:Promise.resolve({entity:'contracts',id,slot})});
    reset();
    assert.equal((await request()).status,200);
    assert(!saved.has('renewal-2-1')&&saved.has('renewal-2-2'));
    assert.equal(queries.filter(q=>q.sql.startsWith('DELETE ')).length,1);
    assert.equal(queries.at(-1).sql,'COMMIT');assert.equal(released,1);
    checks.push('Completed renewal can delete exactly one chosen photo; sibling files are preserved and the transaction commits');
    assert.equal((await request()).status,404);assert.equal(queries.at(-1).sql,'ROLLBACK');
    checks.push('Already removed photo returns 404 rather than acknowledging a second deletion');
    for(const role of ['accounting','ownership_staff']){reset(role);assert.equal((await request()).status,403);assert.equal(queries.length,0);}
    checks.push('Read-only and ownership staff lacking renewal permission are rejected before any database mutation');
    reset();assert.equal((await request('renewal-2-1','902')).status,404);assert.equal(queries.filter(q=>q.sql.startsWith('DELETE ')).length,0);
    reset();assert.equal((await request('renewal-9-1')).status,404);assert.equal(queries.filter(q=>q.sql.startsWith('DELETE ')).length,0);
    checks.push('Unavailable contract and unrelated renewal version cannot reach DELETE');
    reset();assert.equal((await request('renewal-receipt-401-document-1')).status,200);
    reset();assert.equal((await request('renewal-receipt-402-document-1')).status,404);
    reset();assert.equal((await request('return-101-1')).status,200);
    reset();assert.equal((await request('return-102-1')).status,404);
    checks.push('Receipt and return media validate their own transaction/item association');
    reset();assert.equal((await request('renewal-0-1')).status,400);assert.equal(queries.length,0);
    reset();assert.equal((await request('renewal-2-1','901','https://foreign.invalid')).status,403);assert.equal(queries.length,0);
    reset();user=null;assert.equal((await request()).status,401);assert.equal(queries.length,0);
    checks.push('Malformed slots, cross-origin requests and missing sessions are rejected without database writes');
  }finally{session.protectDatabaseRequest=original.protect;session.userFromSession=original.user;Object.defineProperty(database.himotoPool,'connect',original.connect);}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realProviderRequests:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

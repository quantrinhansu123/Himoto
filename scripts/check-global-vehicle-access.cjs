const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const session=load(path.join(root,'lib/server/management-session'));
const {withAccessRequest}=load(path.join(root,'lib/server/access-request'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
const {NextRequest,NextResponse}=require('next/server');
async function main(){const saved=[session.userFromSession,session.readSessionUser],checks=[];let user;
try{
  session.userFromSession=async()=>user;session.readSessionUser=async()=>user;
  const handler=withAccessRequest(async()=>NextResponse.json(dataAccess.getStore()));
  const request=(path,method='GET',body,origin='http://localhost')=>handler(new NextRequest('http://localhost'+path,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{});
  for(const role of Object.keys(ACCESS_ROLES)){
    user={id:70001,access_role:role,store_id:80001,scope_all:false,permissions:[]};
    for(const action of ['transfer','receive']){
      const response=await request('/api/auth/vehicles/91001/actions','POST',{action});assert.equal(response.status,200);
      const scope=await response.json();assert.equal(scope.operation,action);assert.equal(scope.transfer_vehicle_id,'91001');assert.equal(scope.scope_all,false);assert.equal(scope.store_id,80001);
    }
    for(const endpoint of ['/api/auth/vehicle/vehicles','/api/auth/vehicles/transfers','/api/auth/vehicles/inventory','/api/auth/gps','/api/auth/vehicles/91001/history']){
      const response=await request(endpoint);assert.equal(response.status,200);const scope=await response.json();assert.equal(scope.operation,'fleet_read');assert.equal(scope.scope_all,false);
    }
    for(const phase of ['transfer','receive'])for(const method of ['GET','PUT','DELETE']){
      const response=await request('/api/auth/record-photos/vehicles/91001/'+phase+'-999-1',method);assert.equal(response.status,200);assert.equal((await response.json()).transfer_vehicle_id,'91001');
    }
    checks.push(role+': transfer/receipt/photo routes grant fleet access with the exact target, preserving store and account scope');
  }
  user={id:70001,access_role:'hr',store_id:80001,scope_all:false,permissions:[]};
  for(const [endpoint,method,body]of [['/api/auth/vehicles/91001/actions','POST',{action:'status'}],['/api/auth/vehicles/91001','PUT',{}],['/api/auth/order/car-rental','GET'],['/api/auth/cashbook','GET']])assert.equal((await request(endpoint+'?operation=fleet_read&scope_all=true',method,body)).status,403);
  assert.equal((await request('/api/auth/vehicles/91001/actions','POST',{action:'transfer'},'https://foreign.invalid')).status,403);
  user=null;assert.equal((await request('/api/auth/vehicle/vehicles')).status,401);assert.equal((await request('/api/auth/vehicles/91001/actions','POST',{action:'transfer'})).status,401);
  checks.push('Anonymous sessions, foreign origins and unrelated profile/document/contract/finance writes stay denied; query parameters cannot elevate scope');
}finally{[session.userFromSession,session.readSessionUser]=saved;}
console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

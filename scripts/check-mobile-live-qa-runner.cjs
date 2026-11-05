require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),{runAcceptance}=require('./check-mobile-live-qa.cjs');
async function main(){
 const reports=[];
 for(const scenario of ['pass','admin-only','scope-leak','network-failure','login-denied','bad-login-headers']){
  const active=new Map(),seenTokens=[],requests=[];let sequence=0,failedOnce=false;
  const users={admin:{id:7,role:'admin',storeId:null,allStores:true,permissions:['accounts.manage','contracts.read']},branch:{id:8,role:'branch_staff',storeId:23,allStores:false,permissions:['contracts.read']}};
  const credentials={admin:{username:'qa-admin',password:'SYNTHETIC_ADMIN_MUST_NOT_LOG'},branch:{username:'qa-branch',password:'SYNTHETIC_BRANCH_MUST_NOT_LOG'}};
  const response=(status,value,badHeaders=false)=>Response.json(value,{status,headers:{'Cache-Control':badHeaders?'public':'private, no-store',Vary:'Authorization'}});
  const transport=async(url,init)=>{
   const parsed=new URL(url),route=parsed.pathname;assert.equal(parsed.origin,'https://himoto.vercel.app');assert.equal(init.redirect,'error');
   requests.push({route,method:init.method});
   if(init.method==='POST'){
    assert.equal(route,'/api/mobile/v1/session');const input=JSON.parse(init.body),kind=input.email==='qa-admin'?'admin':'branch';
    assert.equal(input.password,credentials[kind].password);assert.equal(input.platform,'android');
    if(scenario==='login-denied'&&kind==='branch')return response(401,{code:'LOGIN_FAILED'});
    const token='hm1_'+String(++sequence).padStart(43,'a');seenTokens.push(token);active.set(token,kind);
    return response(201,{token,user:users[kind],expiresAt:new Date(Date.now()+3600000).toISOString()},scenario==='bad-login-headers');
   }
   const token=init.headers.Authorization?.slice(7),kind=active.get(token);if(!kind)return response(401,{code:'SESSION_EXPIRED'});
   if(init.method==='DELETE'){assert.equal(route,'/api/mobile/v1/session');active.delete(token);return response(200,{success:true});}
   assert.equal(init.method,'GET');
   if(init.headers.Origin)return response(403,{code:'NATIVE_CLIENT_REQUIRED'});
   if(route.endsWith('/session'))return response(200,{user:users[kind],expiresAt:new Date(Date.now()+3600000).toISOString()});
   if(scenario==='network-failure'&&!failedOnce){failedOnce=true;throw Error('SYNTHETIC_ADMIN_MUST_NOT_LOG');}
   if(route.endsWith('/workspace'))return response(200,{user:users[kind],stores:[{id:23,name:'QA A'},{id:24,name:'QA B'}]});
   if(route.endsWith('/accounts'))return kind==='admin'?response(200,{rows:[]}):response(403,{code:'FORBIDDEN'});
   if(route.endsWith('/catalogue/contracts'))return parsed.searchParams.get('store')==='23'?response(200,{rows:[{storeId:23}],total:1}):response(200,{rows:scenario==='scope-leak'?[{storeId:24}]:[],total:scenario==='scope-leak'?1:0});
   throw Error('Unexpected fixture route');
  };
  const input={...JSON.parse(JSON.stringify(credentials)),mode:scenario==='admin-only'?'admin-only':'admin-and-branch'},result=await runAcceptance(input,transport),text=JSON.stringify(result);
  assert.equal(result.ok,scenario==='pass'||scenario==='admin-only');assert.equal(active.size,0,scenario+': every created token revoked');assert(result.cleanup.every(row=>row.revoked));
  assert(!text.includes('MUST_NOT_LOG'));assert(seenTokens.every(token=>!text.includes(token)));assert.equal(input.admin,null);assert.equal(input.branch,null);
  assert(requests.every(row=>row.method==='GET'||row.route==='/api/mobile/v1/session'));
  if(scenario==='pass'){assert.equal(result.checks.length,4);assert.equal(result.sessionsCreated,4);assert.equal(result.scopePositiveSampleFound,true);}
  if(scenario==='admin-only'){assert.equal(result.checks.length,3);assert.equal(result.sessionsCreated,2);}
  if(scenario==='scope-leak')assert.equal(result.failureCode,'QA_CROSS_BRANCH_CONTRACTS_VISIBLE');
  if(scenario==='network-failure')assert.equal(result.failureCode,'QA_NETWORK_REQUEST_FAILED');
  if(scenario==='bad-login-headers')assert.equal(result.failureCode,'QA_RESPONSE_AUTH_HEADERS');
  reports.push({scenario,ok:true,sessionsCreated:result.sessionsCreated,allCreatedSessionsRevoked:true,secretsAbsent:true});
 }
 console.log(JSON.stringify({ok:true,checks:reports.length,results:reports,liveRequests:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

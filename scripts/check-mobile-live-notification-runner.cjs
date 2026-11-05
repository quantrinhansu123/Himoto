require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),{runNotificationAcceptance}=require('./check-mobile-live-notifications.cjs');
async function scenario(mode){
 const active=new Map(),secrets=['QA_ADMIN_USERNAME_PRIVATE','QA_BRANCH_USERNAME_PRIVATE','QA_PASSWORD_PRIVATE'],issued=[];
 const input={admin:{username:secrets[0],password:secrets[2]},branch:{username:secrets[1],password:secrets[2]}};
 const transport=async(url,init)=>{
  const path=new URL(url).pathname,token=init.headers.Authorization?.slice(7),who=active.get(token);
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Authorization'}});
  if(path.endsWith('/session')&&init.method==='POST'){
   if(mode==='missing-api')return new Response('<html>Not found</html>',{status:404,headers:{'Content-Type':'text/html'}});
   const admin=JSON.parse(init.body).email===secrets[0],user={id:admin?7:8,role:admin?'admin':'custom',storeId:admin?null:23,allStores:admin,permissions:['contracts.read',...(admin?['accounts.manage','contracts.finalize']:[])]},value='hm1_'+(admin?'a':'b').repeat(43);active.set(value,user);issued.push(value);const response=reply({token:value,user,expiresAt:'2099-11-05T00:00:00Z'},201);if(mode==='login-headers')response.headers.delete('Vary');return response;
  }
  if(path.endsWith('/session')&&init.method==='DELETE'){active.delete(token);return reply({success:true});}
  assert(who);
  if(path.endsWith('/notifications')){
   if(mode==='network')throw Error(secrets[2]);
   if(mode==='malformed')return reply({groups:[null],observedAt:new Date().toISOString()});
   return reply({groups:[{kind:'transfer',count:0},{kind:'due',count:1},{kind:'overdue',count:1},...(who.allStores?[{kind:'approval',count:1}]:[])],observedAt:new Date().toISOString()});
  }
  if(path.endsWith('/notifications/device'))return reply({configured:mode!=='unconfigured',enabled:false});
  if(path.includes('/notifications/groups/')){
   const kind=path.split('/').at(-1);if(kind==='invalid')return reply({code:'NOT_FOUND'},404);
   if(kind==='approval'&&!who.allStores)return reply({code:'FORBIDDEN'},403);
   return reply({kind,rows:kind==='transfer'?[]:[{id:101,label:'QA'}],total:kind==='transfer'?0:1,page:1,pages:1,observedAt:new Date().toISOString()});
  }
  if(path.endsWith('/catalogue/contracts'))return reply({total:1});
  if(path.endsWith('/catalogue/contracts/101'))return reply({storeId:mode==='scope-leak'?24:23});
  if(path.endsWith('/contracts/101/approval'))return reply({approval:{can_approve:true,approved_at:null}});
  throw Error('Unexpected QA request');
 };
 const result=await runNotificationAcceptance(input,transport);assert.equal(result.ok,mode==='success');assert.equal(active.size,0);assert.equal(result.cleanup.length,mode==='missing-api'?0:mode==='login-headers'?1:2);assert(result.cleanup.every(c=>c.revoked));assert.equal(input.admin,null);assert.equal(input.branch,null);
 if(mode==='missing-api')assert.equal(result.failureCode,'QA_MOBILE_API_NOT_DEPLOYED');
 if(mode==='login-headers')assert.equal(result.failureCode,'QA_NOTIFICATION_AUTH_HEADERS');
 const json=JSON.stringify(result);assert([...secrets,...issued].every(secret=>!json.includes(secret)));return {mode,ok:result.ok,cleanup:true};
}
(async()=>{const results=[];for(const mode of ['success','network','malformed','unconfigured','scope-leak','missing-api','login-headers'])results.push(await scenario(mode));console.log(JSON.stringify({ok:true,scenarios:results,externalRequests:0,credentialValuesLogged:false},null,2));})().catch(e=>{console.error(e);process.exitCode=1;});

// Production route/gate smoke only. No credentials, valid login, or business writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const index=process.argv.indexOf('--output');assert(index>=0);
 const output=path.resolve(process.argv[index+1]);assert(output.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(output));
 const origin='https://himoto.vercel.app',checks=[],startedAt=new Date().toISOString();
 async function check(name,route,status,code,init={}){
  const response=await fetch(origin+route,{...init,redirect:'manual',signal:AbortSignal.timeout(25000)});
  let body;try{body=await response.json();}catch{throw Error(name+': response is not JSON');}
  // Store only error codes/headers; no raw tokens, cookies or successful data payloads.
  const result={name,route,status:response.status,code:typeof body?.code==='string'?body.code:null,cacheControl:response.headers.get('cache-control'),vary:response.headers.get('vary'),nosniff:response.headers.get('x-content-type-options'),hasAllowOrigin:response.headers.has('access-control-allow-origin')};checks.push(result);
  assert.equal(result.status,status,name);assert.equal(result.code,code,name);
  assert(result.cacheControl.includes('private')&&result.cacheControl.includes('no-store'),name);
  assert(/authorization/i.test(result.vary),name);assert.equal(result.nosniff,'nosniff',name);assert(!result.hasAllowOrigin,name);
 }
 fs.mkdirSync(output,{recursive:true});
 try{
  await check('No bearer session', '/api/mobile/v1/session',401,'SESSION_EXPIRED');
  await check('Random bearer checks real session lookup', '/api/mobile/v1/session',401,'SESSION_EXPIRED',{headers:{Authorization:'Bearer hm1_'+crypto.randomBytes(32).toString('base64url')}});
  await check('Browser origin rejected','/api/mobile/v1/session',403,'NATIVE_CLIENT_REQUIRED',{headers:{Origin:origin}});
  for(const route of ['/workspace','/catalogue/vehicles','/gps','/vehicles/1/status','/vehicle-status/requests/00000000-0000-4000-8000-000000000001','/notifications','/notifications/activity','/notifications/device','/notifications/groups/approval',...['transfers','gps','battery','accounts','shifts','duties','reminders'].map(kind=>'/list-exports/'+kind)])await check('Unauthenticated read gate '+route,'/api/mobile/v1'+route,401,'SESSION_EXPIRED');
  await check('Login content type rejected','/api/mobile/v1/session',415,'INVALID_REQUEST',{method:'POST',body:'not-json'});
  await check('Unauthenticated push test rejected','/api/mobile/v1/notifications/test',401,'SESSION_EXPIRED',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  await check('Login missing fields rejected before login attempt','/api/mobile/v1/session',400,'INVALID_REQUEST',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  await check('Login bounded body rejected before login attempt','/api/mobile/v1/session',413,'INVALID_REQUEST',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({oversized:'x'.repeat(4200)})});
  const login=await fetch(origin+'/login',{redirect:'manual',signal:AbortSignal.timeout(25000)}),html=await login.text();assert.equal(login.status,200);assert(html.includes('hm-login'));
  const deploymentId=html.match(/[?&]dpl=(dpl_[a-zA-Z0-9]+)/)?.[1];assert(deploymentId);
  const result={ok:true,origin,deploymentId,startedAt,completedAt:new Date().toISOString(),checks,webLoginStatus:login.status,credentialLoginAttempts:0,businessWrites:0,credentialsRead:0,realRoleBehaviorTested:false,authenticatedAcceptance:false};
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,checks:checks.length,webLoginStatus:200,deploymentId,credentialLoginAttempts:0,businessWrites:0},null,2));
 }catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({ok:false,checks,error:String(error.message),completedAt:new Date().toISOString()},null,2));throw error;}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

// Authenticated GET-only notification acceptance; credentials/tokens remain in memory.
const {QaFailure,readCredentialInput}=require('./check-mobile-live-qa.cjs');
const {load}=require('./lib/load-typescript.cjs'),path=require('node:path'),fs=require('node:fs');
const dto=load(path.resolve('shared/mobile-notifications'));
const ensure=(value,code)=>{if(!value)throw new QaFailure(code);};
async function runNotificationAcceptance(input,transport=fetch){
 const sessions=[],trace=[],checks=[],cleanup=[],origin='https://himoto.vercel.app';
 const report={ok:false,startedAt:new Date().toISOString(),checks,requests:trace,cleanup,businessWrites:0,deviceRegistrations:0,externalPushMessages:0};
 async function request(route,token,method='GET',body){
  const started=Date.now();let response;
  try{response=await transport(origin+route,{method,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});}catch{throw new QaFailure('QA_NOTIFICATION_NETWORK_FAILED');}
  const value=await response.json().catch(()=>null),code=typeof value?.code==='string'?value.code:null;
  const headersValid=/private/.test(response.headers.get('cache-control')||'')&&/no-store/.test(response.headers.get('cache-control')||'')&&/authorization/i.test(response.headers.get('vary')||'');
  const row={route,method,status:response.status,code,durationMs:Date.now()-started,headersValid};trace.push(row);
  ensure(!(response.status===404&&value===null),'QA_MOBILE_API_NOT_DEPLOYED');
  // Track a newly issued session before checking headers so every created QA
  // session can still be revoked if the deployment regresses its response headers.
  if(!(route==='/api/mobile/v1/session'&&method==='POST'))ensure(headersValid,'QA_NOTIFICATION_AUTH_HEADERS');
  return {status:response.status,code,value,headersValid};
 }
 async function login(credential,label){
  ensure(credential&&typeof credential.username==='string'&&typeof credential.password==='string','QA_CREDENTIAL_REQUIRED');
  const r=await request('/api/mobile/v1/session',null,'POST',{email:credential.username,password:credential.password,platform:'android',deviceName:'Himoto notification QA '+label});
  ensure(r.status===201&&/^hm1_[A-Za-z0-9_-]{43}$/.test(r.value?.token||''),'QA_NOTIFICATION_LOGIN_FAILED');
  const s={token:r.value.token,user:r.value.user,label};sessions.push(s);
  ensure(r.headersValid,'QA_NOTIFICATION_AUTH_HEADERS');return s;
 }
 try{
  const admin=await login(input.admin,'admin');ensure(admin.user.permissions.includes('accounts.manage'),'QA_ADMIN_REQUIRED');
  if(!input.branch&&input.resolveBranch)input.branch=await input.resolveBranch(route=>request(route,admin.token));
  const branch=await login(input.branch,'branch');ensure(!branch.user.allStores&&branch.user.storeId>0&&!branch.user.permissions.includes('accounts.manage'),'QA_BRANCH_REQUIRED');
  for(const session of [admin,branch]){
   const feed=await request('/api/mobile/v1/notifications',session.token);ensure(feed.status===200&&dto.isMobileNotifications(feed.value),'QA_NOTIFICATION_FEED_INVALID');
   const push=await request('/api/mobile/v1/notifications/device',session.token);ensure(push.status===200&&dto.isMobilePushStatus(push.value)&&push.value.configured,'QA_FCM_NOT_CONFIGURED');
   for(const kind of ['due','overdue']){
    const group=feed.value.groups.find(g=>g.kind===kind);if(!session.user.permissions.includes('contracts.read'))continue;
    ensure(group,'QA_NOTIFICATION_GROUP_MISSING');
    const actual=await request('/api/mobile/v1/catalogue/contracts?scope='+kind+'&size=1',session.token);
    ensure(actual.status===200&&actual.value.total===group.count,'QA_NOTIFICATION_WEB_COUNT_MISMATCH');
    const list=await request('/api/mobile/v1/notifications/groups/'+kind+'?page=1',session.token);
    ensure(list.status===200&&dto.isMobileNotificationList(list.value)&&list.value.total===group.count,'QA_NOTIFICATION_LIST_INVALID');
    for(const row of list.value.rows.slice(0,2)){
     const record=await request('/api/mobile/v1/catalogue/contracts/'+row.id,session.token);ensure(record.status===200,'QA_NOTIFICATION_RECORD_DENIED');
     if(!session.user.allStores)ensure(record.value.storeId===session.user.storeId,'QA_NOTIFICATION_FOREIGN_STORE');
    }
   }
   const transfers=await request('/api/mobile/v1/notifications/groups/transfer?page=1',session.token);
   ensure(transfers.status===200&&dto.isMobileNotificationList(transfers.value),'QA_TRANSFER_NOTIFICATION_INVALID');
   for(const row of transfers.value.rows.slice(0,2)){
    const prepared=await request('/api/mobile/v1/vehicles/'+row.id+'/transfers',session.token);
    ensure(prepared.status===200&&prepared.value.transfer?.receivable,'QA_TRANSFER_NOTIFICATION_RESOLVED');
    if(!session.user.allStores)ensure(prepared.value.transfer.toStoreId===session.user.storeId,'QA_TRANSFER_FOREIGN_DESTINATION');
   }
   const approval=await request('/api/mobile/v1/notifications/groups/approval?page=1',session.token);
   if(feed.value.groups.some(g=>g.kind==='approval')){
    ensure(approval.status===200&&dto.isMobileNotificationList(approval.value),'QA_APPROVAL_NOTIFICATION_INVALID');
    for(const row of approval.value.rows.slice(0,2)){
     const actual=await request('/api/mobile/v1/contracts/'+row.id+'/approval',session.token);
     ensure(actual.status===200&&actual.value.approval?.can_approve&&!actual.value.approval.approved_at,'QA_APPROVAL_NOTIFICATION_NOT_ACTIONABLE');
    }
   }else ensure(approval.status===403,'QA_APPROVAL_GROUP_NOT_DENIED');
   const invalid=await request('/api/mobile/v1/notifications/groups/invalid',session.token);ensure(invalid.status===404,'QA_NOTIFICATION_KIND_NOT_DENIED');
   checks.push({actor:session.label,userId:session.user.id,storeId:session.user.storeId,allStores:session.user.allStores,groups:feed.value.groups,webCountsMatch:true,scopeSamplesMatch:true,pushConfigured:true});
  }
  report.ok=true;
 }catch(e){report.failureCode=e instanceof QaFailure?e.code:'QA_NOTIFICATION_FAILED';}
 finally{
  for(const session of sessions){try{const r=await request('/api/mobile/v1/session',session.token,'DELETE');ensure(r.status===200,'QA_LOGOUT_FAILED');cleanup.push({actor:session.label,revoked:true});}catch{cleanup.push({actor:session.label,revoked:false});report.ok=false;}session.token=null;}
  input.admin=null;input.branch=null;
 }
 report.completedAt=new Date().toISOString();return report;
}
if(require.main===module)(async()=>{const arg=process.argv.indexOf('--output');ensure(arg>=0,'QA_OUTPUT_REQUIRED');const out=path.resolve(process.argv[arg+1]);ensure(out.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(out),'QA_OUTPUT_INVALID');const result=await runNotificationAcceptance(JSON.parse(await readCredentialInput()));fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;})().catch(()=>{console.error('QA_NOTIFICATION_RUNNER_FAILED');process.exitCode=1;});
module.exports={runNotificationAcceptance};

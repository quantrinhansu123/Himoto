// Credentials enter via stdin only. No dotenv, credential files, SQL, or business writes.
const fs=require('node:fs'),path=require('node:path');
class QaFailure extends Error {constructor(code){super(code);this.code=code;}}
const ensure=(condition,code)=>{if(!condition)throw new QaFailure(code);};
async function runAcceptance(input,transport=fetch){
 const origin='https://himoto.vercel.app',sessions=[],checks=[],trace=[],cleanup=[];
 const report={ok:false,mode:input.mode==='admin-only'?'admin-only':'admin-and-branch',origin,startedAt:new Date().toISOString(),checks,requests:trace,cleanup,businessWrites:0,credentialFilesWritten:0,nativeAcceptance:false,writeAcceptance:false};
 async function request(route,{method='GET',token,body,originHeader}={}){
  const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';if(originHeader)headers.Origin=originHeader;
  let response;
  try{response=await transport(origin+route,{method,headers,...body?{body:JSON.stringify(body)}:{},redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new QaFailure('QA_NETWORK_REQUEST_FAILED');}
  let value;try{value=await response.json();}catch{throw new QaFailure('QA_RESPONSE_NOT_JSON');}
  const code=typeof value?.code==='string'&&/^[A-Z_]{1,64}$/.test(value.code)?value.code:null;
  trace.push({route,method,status:response.status,code});
  const headersValid=/private/.test(response.headers.get('cache-control')||'')&&/no-store/.test(response.headers.get('cache-control')||'')&&/authorization/i.test(response.headers.get('vary')||'')&&!response.headers.has('access-control-allow-origin');
  trace[trace.length-1].authHeadersValid=headersValid;
  return{status:response.status,code,value,headersValid};
 }
 const actor=u=>({id:u.id,role:u.role,storeId:u.storeId,allStores:u.allStores,permissions:[...u.permissions].sort()});
 async function login(kind,copy){
  const credentials=input[kind];ensure(credentials&&typeof credentials.username==='string'&&/^[a-zA-Z0-9._@+-]{3,254}$/.test(credentials.username.trim())&&typeof credentials.password==='string'&&credentials.password.length>0&&credentials.password.length<=256,'QA_CREDENTIAL_INPUT_INVALID');
  const result=await request('/api/mobile/v1/session',{method:'POST',body:{email:credentials.username.trim(),password:credentials.password,platform:'android',deviceName:`Himoto QA ${kind} ${copy}`}});
  if(result.status!==201)throw new QaFailure(result.code==='LOGIN_FAILED'?'QA_'+kind.toUpperCase()+'_LOGIN_FAILED':'QA_LOGIN_HTTP_'+result.status+'_'+(result.code||'UNKNOWN'));
  const value=result.value;
  ensure(typeof value.token==='string'&&/^hm1_[A-Za-z0-9_-]{43}$/.test(value.token),'QA_SESSION_TOKEN_FORMAT');
  const session={token:value.token,user:value.user,revoked:false,label:kind+'-'+copy};sessions.push(session);
  ensure(result.headersValid,'QA_RESPONSE_AUTH_HEADERS');
  ensure(value.user&&Number.isSafeInteger(value.user.id)&&value.user.id>0&&Array.isArray(value.user.permissions)&&value.user.permissions.every(p=>typeof p==='string')&&Number.isFinite(Date.parse(value.expiresAt)),'QA_SESSION_SHAPE');
  return session;
 }
 async function current(session){const response=await request('/api/mobile/v1/session',{token:session.token});ensure(response.status===200,'QA_SESSION_READ_FAILED');ensure(JSON.stringify(actor(response.value.user))===JSON.stringify(actor(session.user)),'QA_SESSION_ACTOR_CHANGED');return response.value;}
 async function revoke(session){const response=await request('/api/mobile/v1/session',{method:'DELETE',token:session.token});ensure(response.status===200&&response.value.success===true,'QA_LOGOUT_FAILED');const denied=await request('/api/mobile/v1/session',{token:session.token});ensure(denied.status===401&&denied.code==='SESSION_EXPIRED','QA_REVOKED_SESSION_STILL_VALID');session.revoked=true;}
 try{
  const adminA=await login('admin','A');
  ensure(adminA.user.permissions.includes('accounts.manage'),'QA_ADMIN_ACCOUNT_REQUIRED');
  if(input.mode==='admin-only'){
   await current(adminA);checks.push({name:'Shared-system administrator login and session',passed:true,admin:actor(adminA.user)});
   const workspace=await request('/api/mobile/v1/workspace',{token:adminA.token}),accounts=await request('/api/mobile/v1/accounts?page=1',{token:adminA.token});
   ensure(workspace.status===200&&workspace.value.user?.id===adminA.user.id&&Array.isArray(workspace.value.stores),'QA_ADMIN_WORKSPACE_READ_FAILED');
   ensure(accounts.status===200&&Array.isArray(accounts.value.rows),'QA_ADMIN_ACCOUNTS_READ_FAILED');
   checks.push({name:'Administrator workspace/account read',passed:true});
   const adminB=await login('admin','B');ensure(adminB.user.id===adminA.user.id&&adminB.token!==adminA.token,'QA_MULTI_SESSION_ACTOR_MISMATCH');
   await current(adminA);await current(adminB);await revoke(adminA);await current(adminB);
   checks.push({name:'Administrator parallel sessions and isolated logout',passed:true});
   ensure(trace.every(row=>row.authHeadersValid),'QA_RESPONSE_AUTH_HEADERS');report.ok=true;
  }else{
  if(!input.branch&&typeof input.resolveBranch==='function')input.branch=await input.resolveBranch(route=>request(route,{token:adminA.token}));
  const branchA=await login('branch','A');
  ensure(adminA.user.id!==branchA.user.id,'QA_ACCOUNTS_MUST_BE_DISTINCT');
  ensure(!branchA.user.permissions.includes('accounts.manage')&&!branchA.user.allStores&&Number.isSafeInteger(branchA.user.storeId)&&branchA.user.storeId>0&&branchA.user.permissions.includes('contracts.read'),'QA_BRANCH_CONTRACT_SCOPE_REQUIRED');
  await current(adminA);await current(branchA);
  checks.push({name:'Two distinct shared-system accounts authenticated and re-read',passed:true,admin:actor(adminA.user),branch:actor(branchA.user)});
  const adminWorkspace=await request('/api/mobile/v1/workspace',{token:adminA.token}),branchWorkspace=await request('/api/mobile/v1/workspace',{token:branchA.token});
  ensure(adminWorkspace.status===200&&branchWorkspace.status===200,'QA_WORKSPACE_READ_FAILED');
  ensure(adminWorkspace.value.user?.id===adminA.user.id&&branchWorkspace.value.user?.id===branchA.user.id,'QA_WORKSPACE_ACTOR_MISMATCH');
  const accountList=await request('/api/mobile/v1/accounts?page=1',{token:adminA.token}),deniedAccounts=await request('/api/mobile/v1/accounts?page=1',{token:branchA.token});
  ensure(accountList.status===200&&Array.isArray(accountList.value.rows),'QA_ADMIN_ACCOUNTS_READ_FAILED');
  ensure(deniedAccounts.status===403,'QA_BRANCH_ACCOUNTS_NOT_DENIED');
  checks.push({name:'Workspace actor and canonical account-management permission',passed:true});
  const own=await request('/api/mobile/v1/catalogue/contracts?size=1&page=1&store='+branchA.user.storeId,{token:branchA.token});
  ensure(own.status===200&&Array.isArray(own.value.rows),'QA_BRANCH_CONTRACTS_READ_FAILED');
  ensure(own.value.rows.every(row=>row.storeId===branchA.user.storeId),'QA_OWN_STORE_ROWS_MISMATCH');
  const foreign=adminWorkspace.value.stores?.find(store=>store.id!==branchA.user.storeId);ensure(foreign,'QA_FOREIGN_STORE_NOT_AVAILABLE');
  const outside=await request('/api/mobile/v1/catalogue/contracts?size=1&page=1&store='+foreign.id,{token:branchA.token});
  ensure(outside.status===403||outside.status===200&&outside.value.total===0&&outside.value.rows?.length===0,'QA_CROSS_BRANCH_CONTRACTS_VISIBLE');
  const browser=await request('/api/mobile/v1/session',{token:branchA.token,originHeader:origin});ensure(browser.status===403&&browser.code==='NATIVE_CLIENT_REQUIRED','QA_BROWSER_ORIGIN_NOT_DENIED');
  checks.push({name:'Own-store contract sample and foreign-store denial',passed:true,storeId:branchA.user.storeId,positiveSampleFound:own.value.rows.length>0,foreignStoreId:foreign.id,foreignDenied:true});
  const adminB=await login('admin','B'),branchB=await login('branch','B');
  ensure(adminB.user.id===adminA.user.id&&branchB.user.id===branchA.user.id,'QA_MULTI_SESSION_ACTOR_MISMATCH');
  ensure(adminB.token!==adminA.token&&branchB.token!==branchA.token,'QA_MULTI_SESSION_TOKEN_REUSED');
  const concurrent=await Promise.allSettled([current(adminA),current(adminB),current(branchA),current(branchB)]);
  for(const result of concurrent)if(result.status==='rejected')throw result.reason;
  await revoke(adminA);await current(adminB);await current(branchA);
  await revoke(branchA);await current(branchB);await current(adminB);
  checks.push({name:'Four concurrent sessions; revoking one preserves the other session/account',passed:true});
  ensure(trace.every(row=>row.authHeadersValid),'QA_RESPONSE_AUTH_HEADERS');
  report.scopePositiveSampleFound=own.value.rows.length>0;
  report.ok=report.scopePositiveSampleFound;
  if(!report.ok)report.failureCode='QA_SCOPE_NEEDS_POSITIVE_SAMPLE';
  }
 }catch(error){report.failureCode=error instanceof QaFailure?error.code:'QA_CHECK_FAILED';}
 finally{
  for(const session of sessions){
   try{
    if(!session.revoked){const existing=await request('/api/mobile/v1/session',{token:session.token});if(existing.status===401&&existing.code==='SESSION_EXPIRED')session.revoked=true;else await revoke(session);}
    cleanup.push({session:session.label,revoked:true});
   }catch{cleanup.push({session:session.label,revoked:false});report.ok=false;report.cleanupIncomplete=true;}
   session.token=null;
  }
  input.admin=null;input.branch=null;
 }
 if(input.selectionInfo)report.branchSelection=input.selectionInfo;
 report.sessionsCreated=sessions.length;report.completedAt=new Date().toISOString();return report;
}
async function readCredentialInput(){
 if(!process.argv.includes('--stdin-once')){let value='';for await(const chunk of process.stdin){value+=chunk;ensure(Buffer.byteLength(value)<16384,'QA_INPUT_TOO_LARGE');}return value;}
 ensure(process.stdin.isTTY&&typeof process.stdin.setRawMode==='function','QA_SECURE_TTY_REQUIRED');
 process.stdin.setRawMode(true);process.stdin.resume();
 try{
  return await new Promise((resolve,reject)=>{
   let value='';const finish=()=>{process.stdin.removeListener('data',receive);process.stdin.removeListener('end',ended);};
   const ended=()=>{finish();reject(new QaFailure('QA_INPUT_CANCELLED'));};
   const receive=chunk=>{
    value+=chunk.toString('utf8');
    if(value.includes('\u0003')||Buffer.byteLength(value)>=16384){finish();reject(new QaFailure('QA_INPUT_CANCELLED'));return;}
    const index=value.search(/[\r\n]/);if(index>=0){finish();resolve(value.slice(0,index));}
   };
   process.stdin.on('data',receive);process.stdin.once('end',ended);console.log('QA_INPUT_READY_NO_ECHO');
  });
 }finally{process.stdin.setRawMode(false);process.stdin.pause();}
}
async function main(){
 const arg=process.argv.indexOf('--output');ensure(arg>=0&&process.argv[arg+1],'QA_OUTPUT_REQUIRED');
 const folder=path.resolve(process.argv[arg+1]);ensure(!fs.existsSync(folder),'QA_OUTPUT_ALREADY_EXISTS');
 let text=await readCredentialInput();
 let input;try{input=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new QaFailure('QA_INPUT_NOT_JSON');}text=null;
 const report=await runAcceptance(input);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({ok:report.ok,mode:report.mode,failureCode:report.failureCode||null,checks:report.checks.length,sessionsCreated:report.sessionsCreated,allCreatedSessionsRevoked:report.cleanup.every(row=>row.revoked),scopePositiveSampleFound:report.scopePositiveSampleFound||false,businessWrites:0,credentialFilesWritten:0,nativeAcceptance:false,result:path.join(folder,'results.json')},null,2));
 process.exitCode=report.ok?0:1;
}
module.exports={runAcceptance,QaFailure,readCredentialInput};
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({ok:false,code:error instanceof QaFailure?error.code:'QA_RUNNER_FAILED',credentialsLogged:false}));process.exitCode=1;});

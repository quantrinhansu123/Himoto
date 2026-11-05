// Authorized production acceptance uses ONE explicitly marked temporary customer.
// The original request UUID is written before submission; never retry with a new key.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {readCredentialInput}=require('./check-mobile-live-qa.cjs');
async function runCustomerWrite(credentials,output,transport=fetch){
 const origin='https://himoto.vercel.app',journal={kind:'himoto-live-customer-qa',marker:'QA-HANDOFF-'+crypto.randomUUID().slice(0,8),keys:{create:crypto.randomUUID(),update:crypto.randomUUID(),stale:crypto.randomUUID(),delete:crypto.randomUUID()},customerId:null,createdByThisRun:false,deleted:false,checks:[],requests:[],startedAt:new Date().toISOString()};
 const persist=()=>fs.writeFileSync(path.join(output,'journal.json'),JSON.stringify(journal,null,2));let token=null;
 fs.mkdirSync(output,{recursive:true});persist();
 async function api(route,method='GET',body,key){
  const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
  let response;try{response=await transport(origin+'/api/mobile/v1'+route,{method,headers,...body?{body:JSON.stringify(body)}:{},redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('QA_NETWORK_UNCERTAIN_USE_SAVED_UUID');}
  let data;try{data=await response.json();}catch{throw Error('QA_RESPONSE_NOT_JSON');}
  journal.requests.push({route,method,status:response.status,code:typeof data?.code==='string'&&/^[A-Z_]{1,64}$/.test(data.code)?data.code:null});persist();return{status:response.status,data};
 }
 async function receipt(){const result=await api('/customers/requests/'+journal.keys.create);assert.equal(result.status,200);return result.data.receipt;}
 async function cleanup(){
  if(!journal.customerId)return;
  assert(journal.createdByThisRun,'Only this run may be cleaned');
  const profile=await api('/customers/'+journal.customerId);
  if(profile.status===404){journal.deleted=true;persist();return;}
  assert.equal(profile.status,200);assert([journal.marker,journal.marker+'_UPDATED'].includes(profile.data.name));assert.equal(profile.data.phone,'');assert.equal(profile.data.id_card,'');
  const review=await api('/bulk-delete/customers/review','POST',{ids:[journal.customerId]});assert.equal(review.status,200);assert.equal(review.data.rows.length,1);assert.equal(review.data.rows[0].id,journal.customerId);assert.equal(review.data.rows[0].name,profile.data.name);
  journal.deleteBody={ids:[journal.customerId],review:review.data.review};persist();
  const deletion=await api('/bulk-delete/customers','DELETE',journal.deleteBody,journal.keys.delete);assert.equal(deletion.status,200);assert.equal(deletion.data.deletedCount,1);
  const absent=await api('/customers/'+journal.customerId);assert.equal(absent.status,404);journal.deleted=true;persist();
 }
 try{
  const login=await api('/session','POST',{email:credentials.username,password:credentials.password,platform:'android',deviceName:'Himoto marked customer acceptance'});assert.equal(login.status,201,'QA_ADMIN_LOGIN_FAILED');assert(/^hm1_[A-Za-z0-9_-]{43}$/.test(login.data.token));token=login.data.token;credentials.password=null;
  assert(login.data.user.permissions.includes('accounts.manage'),'QA_CANONICAL_ADMIN_REQUIRED');journal.actorId=login.data.user.id;
  const workspace=await api('/workspace');assert.equal(workspace.status,200);const store=workspace.data.stores.find(row=>row.id===34);assert(store,'QA_PREVIOUSLY_VERIFIED_STORE_34_REQUIRED');
  const before=await api('/catalogue/customers?size=1&page=1&store=34&search='+journal.marker);assert.equal(before.status,200);assert.equal(before.data.total,0);
  journal.input={name:journal.marker,phone:'',email:'',address:'QA temporary record for handoff acceptance only',id_card:'',customer_type:'vietnam',nationality:'',contact_channel:'',contact_detail:'',store_id:34,status:'draft',warning_note:'',driver_license_number:'',driver_license_issued_on:'',id_card_issued_on:'',id_card_issued_by:'',relatives:[],allow_incomplete:true};persist();
  let original;
  try{original=await api('/customers','POST',journal.input,journal.keys.create);}catch(error){journal.uncertainCreate=true;persist();}
  if(original)assert.equal(original.status,201,'QA_CUSTOMER_CREATE_HTTP_'+original.status);
  // Recover by original receipt as if the successful response had been lost.
  const saved=await receipt();assert(saved&&Number.isSafeInteger(saved.id)&&saved.id>0);journal.customerId=saved.id;journal.createdByThisRun=true;persist();
  const replay=await api('/customers','POST',journal.input,journal.keys.create);assert.equal(replay.status,201);assert.equal(replay.data.id,saved.id);assert.equal(replay.data.replayed,true);
  const one=await api('/catalogue/customers?size=2&page=1&store=34&search='+journal.marker);assert.equal(one.status,200);journal.listObserved={total:one.data.total,ids:one.data.rows.map(row=>row.id)};persist();assert.equal(one.data.total,1);assert.equal(one.data.rows[0].id,saved.id);
  journal.checks.push('Original UUID receipt recovery/replay yields exactly one marked customer');persist();
  const profile=await api('/customers/'+saved.id);assert.equal(profile.status,200);assert.equal(profile.data.name,journal.marker);
  const values={...journal.input,name:journal.marker+'_UPDATED',revision:profile.data.revision};delete values.allow_incomplete;journal.updateBody=values;persist();
  const update=await api('/customers/'+saved.id,'PATCH',values,journal.keys.update);assert.equal(update.status,200);
  const updated=await api('/customers/'+saved.id);assert.equal(updated.status,200);assert.equal(updated.data.name,values.name);assert.notEqual(updated.data.revision,profile.data.revision);
  const stale=await api('/customers/'+saved.id,'PATCH',{...values,name:journal.marker},journal.keys.stale);assert.equal(stale.status,409,'QA_STALE_UPDATE_NOT_REJECTED');
  const unchanged=await api('/customers/'+saved.id);assert.equal(unchanged.status,200);assert.equal(unchanged.data.name,values.name);
  journal.checks.push('Actual web customer writer changes revision; stale compare-and-swap is rejected without overwriting');persist();
 }catch(error){journal.failureCode=String(error.message).startsWith('QA_')?String(error.message):'QA_LIVE_CUSTOMER_CHECK_FAILED';persist();}
 finally{
  if(token){
   if(!journal.customerId&&journal.input){try{const saved=await receipt();if(saved?.id){journal.customerId=saved.id;journal.createdByThisRun=true;persist();}}catch{journal.unresolvedCreate=true;persist();}}
   try{await cleanup();}catch{journal.cleanupNeedsReview=true;persist();}
   try{const logout=await api('/session','DELETE');journal.sessionRevoked=logout.status===200;}catch{journal.sessionRevoked=false;}
   token=null;
  }
  credentials.password=null;
 }
 journal.ok=!journal.failureCode&&journal.deleted&&journal.sessionRevoked===true&&journal.checks.length===2;
 if(journal.deleted)journal.checks.push('Only the created QA customer was reviewed/deleted; GET404 confirms cleanup');
 journal.completedAt=new Date().toISOString();journal.customerRowsLeftByRun=journal.deleted?0:journal.customerId?1:null;journal.financialOrVehicleWrites=0;persist();
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(journal,null,2));return journal;
}
module.exports={runCustomerWrite};
if(require.main===module)(async()=>{const index=process.argv.indexOf('--output');assert(index>=0);const output=path.resolve(process.argv[index+1]);assert(output.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(output));const input=JSON.parse((await readCredentialInput()).replace(/^\uFEFF/,''));const result=await runCustomerWrite(input,output);console.log(JSON.stringify({ok:result.ok,failureCode:result.failureCode||null,checks:result.checks.length,customerId:result.customerId,qaCustomerRemoved:result.deleted,sessionRevoked:result.sessionRevoked,financialOrVehicleWrites:0,credentialsLogged:false},null,2));process.exitCode=result.ok?0:1;})().catch(()=>{console.error('QA runner failed; no credentials logged.');process.exitCode=1;});

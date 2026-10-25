const assert=require('node:assert/strict'),path=require('node:path');
const{load,root}=require('./lib/load-typescript.cjs');
const document=load(path.join(root,'lib/management/contract-document'));
const server=load(path.join(root,'lib/server/contract-drafts'));
const feedback=load(path.join(root,'lib/management/contract-feedback'));
const repository=load(path.join(root,'lib/management/repository'));
const checks=[],draft=document.createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all');
const edits=value=>({draft:value,status:'draft',rental_type:'daily',notes:''});
(async()=>{
  const cases=[['staff_name',d=>{delete d.staff_name;}],['phone',d=>{d.customer.phone=12;}],['vehicle_0_borrow_hats',d=>{d.vehicles[0].borrow_hats=12;}],['sales_staff_name',d=>{d.sales_staff_name='x'.repeat(192);}]];
  for(const[key,mutate]of cases){const bad=structuredClone(draft);mutate(bad);assert.throws(()=>server.parseDraftEdits(edits(bad)),error=>error instanceof server.DraftSaveError&&Boolean(error.fields[key])&&error.message.includes(feedback.contractFieldLabel(key)));}
  checks.push('Server validation names the actual staff/customer/vehicle/sales field and returns a corrective message without exposing submitted values');
  const legacy={id:1,code:'QA',name:'QA',status:'overdue',rental_type:'ownership',legacy_source_store_id:'29',legacy_inferred_ownership:1};
  assert.equal(feedback.contractReviewMessages(legacy).length,2);
  assert.equal(feedback.contractReviewMessages({...legacy,status:'completed'}).length,1);
  assert.equal(feedback.contractReviewMessages({...legacy,billing_plan_json:'{}'}).length,2);
  const plan=load(path.join(root,'lib/management/contract-billing')).createInstallmentPlan('2026-10-01T08:00','2027-04-01T08:00','Theo tháng',100000);
  assert.equal(feedback.contractReviewMessages({...legacy,billing_plan_json:JSON.stringify(plan)}).length,1);
  assert.equal(feedback.contractReviewMessages({...legacy,rental_type:'rental'}).length,0);
  assert.equal(feedback.contractReviewMessages({...legacy,legacy_source_store_id:''}).length,0);
  assert.equal(feedback.contractReviewMessages({...legacy,legacy_inferred_ownership:0}).length,1);
  assert.deepEqual(feedback.contractFieldIds('vehicle_2_borrow_hats'),['contract-vehicle-2-borrow_hats']);
  assert.deepEqual(feedback.contractFieldIds('phone'),['contract-phone','contract-customer-phone']);
  assert.deepEqual(feedback.contractErrorFields({phone:'Check phone','<script>':'unsafe',name:12}),{phone:'Check phone'});
  checks.push('Review notes distinguish inferred legacy type from a missing active schedule; native rentals, reviewed schedules and closed histories avoid misleading warnings');
  const oldFetch=global.fetch;
  try{
    global.fetch=async(_url,options)=>new Response(JSON.stringify(options?.method==='POST'?{status:'error',message:'Check the phone',fields:{phone:'Correct the phone'}}:{status:'success',data:[]}),{status:options?.method==='POST'?400:200});
    const api=repository.createApiRepository('/api',{drafts:true});await api.load();
    await assert.rejects(()=>api.saveContractDraft(null,edits(draft)),error=>error instanceof feedback.ContractDraftRequestError&&error.fields.phone==='Correct the phone');
  }finally{global.fetch=oldFetch;}
  checks.push('API repository preserves structured server field errors for the form summary instead of reducing them to a generic message');
  const session=load(path.join(root,'lib/server/management-session')),pool=load(path.join(root,'lib/server/himoto-database')).himotoPool;
  const saved=[session.protectDatabaseRequest,session.userFromSession,session.readSessionUser],descriptor=Object.getOwnPropertyDescriptor(pool,'connect'),queries=[];
  try{
    session.protectDatabaseRequest=async()=>null;session.userFromSession=session.readSessionUser=async()=>({id:1,access_role:'admin',scope_all:true,permissions:[]});
    Object.defineProperty(pool,'connect',{configurable:true,value:async()=>({query:async sql=>{queries.push(sql);return{rows:[]};},release(){}})});
    const route=load(path.join(root,'app/api/auth/[...path]/route')),{NextRequest}=require('next/server');
    const bad=structuredClone(draft);delete bad.staff_name;
    const response=await route.POST(new NextRequest('http://localhost/api/auth/order/car-rental',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(edits(bad))}),{params:Promise.resolve({path:['order','car-rental']})});
    const body=await response.json();assert.equal(response.status,400);assert(body.fields.staff_name);assert(body.message.includes(feedback.contractFieldLabel('staff_name')));assert.deepEqual(queries,['BEGIN','ROLLBACK']);
  }finally{session.protectDatabaseRequest=saved[0];session.userFromSession=saved[1];session.readSessionUser=saved[2];Object.defineProperty(pool,'connect',descriptor);}
  checks.push('Authenticated draft POST returns the named field plus guidance and rolls back before any business query or mutation');
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});

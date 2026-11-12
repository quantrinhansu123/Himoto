const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
const life=load(path.join(root,'lib/server/contract-lifecycle'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {closeResolvedBadDebt}=load(path.join(root,'lib/server/contract-resolution'));
const {summarizeContracts}=load(path.join(root,'lib/management/contract-summary'));
const {summarizeSalesKpis}=load(path.join(root,'lib/management/source-sales'));
const {projectManagementTable}=load(path.join(root,'lib/management/management-table'));
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const billing=load(path.join(root,'lib/management/contract-billing'));
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
const admin={id:202,access_role:'admin',store_id:null,scope_all:true,operation:'close_bad_debt'};
const input=()=>({action:'close_bad_debt',revision:'10',request_id:randomUUID(),note:'Returned; continue collecting debt',at:'2026-11-12T10:00',confirmed:true});
function fixture(patch={}){
 const order={id:100,code:'QA-100',order_status:'bad_debt',revision:'10',total:'1000000',paid:'250000',deposit_paid:'200000',deposit_refunded:'0',item_count:2,returned_count:2,ownership:false,
   draft_payload:{management_composer:{lifecycle:{bad_debt:{at:'2026-10-24T10:00:00+07:00'}}}},...patch};
 const queries=[],writes=[];
 const db={query:async(sql,args=[])=>{
   queries.push(sql);
   if(sql.startsWith('SET LOCAL'))return{rows:[]};
   if(sql.startsWith('UPDATE himoto.orders SET order_status=')){
     writes.push(sql);order.order_status=args[1];order.draft_payload=JSON.parse(args[2]);order.revision=String(Number(order.revision)+1);return{rows:[],rowCount:1};
   }
   if(sql.includes('FROM himoto.orders o'))return{rows:[structuredClone(order)],rowCount:1};
   if(sql.startsWith('SELECT id,store_id,'))return{rows:[{...structuredClone(order),store_id:1,bad_debt_closed_at:order.draft_payload.management_composer.lifecycle.bad_debt_closure?.at}],rowCount:1};
   if(sql.includes('SELECT d.id,d.vehicle_id'))return{rows:Array.from({length:order.item_count},(_,i)=>({id:i+1,vehicle_id:i+10,license:'QA-'+i,rent_at:'2026-10-01T10:00:00+07:00',return_at:'2026-10-20T10:00:00+07:00',completed_at:i<order.returned_count?'2026-10-25T10:00:00+07:00':null}))};
   if(sql==='SELECT name FROM himoto.users WHERE id=$1')return{rows:[{name:'QA admin'}]};
   throw Error('Unexpected query or write: '+sql);
 }};
 return{order,db,queries,writes};
}
async function main(){const checks=[];
 for(const role of ['branch_staff','branch_manager','ownership_staff','ownership_manager','accounting',undefined]){
   const f=fixture();await assert.rejects(()=>dataAccess.run({...admin,access_role:role,permissions:['contracts.return','finance.write','settings.write']},()=>life.applyContractLifecycle(f.db,100,202,input())),e=>e.status===403);assert.equal(f.queries.length,0);
   assert.equal(await dataAccess.run({...admin,access_role:role},()=>closeResolvedBadDebt(f.db,100,1)),false);assert.equal(f.queries.length,0);
 }
 await assert.rejects(()=>life.applyContractLifecycle(fixture().db,100,202,input()),e=>e.status===403);
 await assert.rejects(()=>dataAccess.run(admin,()=>life.applyContractLifecycle(fixture().db,100,2,input())),e=>e.status===403);
 checks.push('Service rejects staff, accounting, missing actor and spoofed actor before SQL; automatic close cannot bypass the admin rule');
 const draft=load(path.join(root,'lib/management/contract-document')).createContractDraft(load(path.join(root,'fixtures/management-data')).createDemoDataset(),'all');
 const profile=load(path.join(root,'lib/management/contract-profile')).contractProfile(draft);
 for(const status of ['completed','renting','wait_payment','cancelled']){
   const queries=[];
   const db={query:async sql=>{queries.push(sql);if(sql.startsWith('SET LOCAL'))return{rows:[]};if(sql.startsWith('SELECT order_status,'))return{rowCount:1,rows:[{order_status:'bad_debt',store_id:1,revision:'10'}]};throw Error('Unexpected profile write: '+sql);}};
   await assert.rejects(()=>dataAccess.run({...admin,access_role:'branch_staff',permissions:['contracts.draft']},()=>load(path.join(root,'lib/server/contract-profile')).updateContractProfile(db,100,202,{revision:'10',profile,status},{allowIncomplete:true})),e=>e.status===409);
   assert(!queries.some(sql=>sql.startsWith('UPDATE')));
 }
 checks.push('Profile/full-edit status changes cannot bypass the controlled bad-debt closure or reopen a closed debt');
 for(const patch of [{returned_count:1},{item_count:0,returned_count:0},{total:null},{paid:null},{revision:'11'},{order_status:'renting'},{order_status:'completed'}]){
   const f=fixture(patch);await assert.rejects(()=>dataAccess.run(admin,()=>life.applyContractLifecycle(f.db,100,202,input())),e=>e.status===409);assert.equal(f.writes.length,0);
 }
 const early=fixture();await assert.rejects(()=>dataAccess.run(admin,()=>life.applyContractLifecycle(early.db,100,202,{...input(),at:'2026-10-24T10:00'})),e=>e.status===409);assert.equal(early.writes.length,0);
 checks.push('Unreturned/empty contracts, unknown money, stale revisions, wrong status and closure before recovery are rejected without writes');
 const f=fixture(),body=input(),before=structuredClone(f.order);
 const close=()=>dataAccess.run(admin,()=>life.applyContractLifecycle(f.db,100,202,body));
 const result=await close();assert.equal(result.status,'completed');assert.equal(result.remaining,750000);assert.equal(result.deposit_held,200000);assert.equal(result.settled,false);assert(result.bad_debt_closed_at);
 assert.equal(f.order.total,before.total);assert.equal(f.order.paid,before.paid);assert.equal(f.order.deposit_paid,before.deposit_paid);assert.equal(f.writes.length,1);assert.equal(result.events.length,1);assert.equal(result.events[0].actor_id,202);
 await assert.rejects(()=>load(path.join(root,'lib/server/contract-deletion')).deleteContractRecord(f.db,100,result.revision,admin),e=>e.status===409);assert.equal(f.writes.length,1);
 assert.equal((await close()).events.length,1);assert.equal(f.writes.length,1);
 await assert.rejects(()=>dataAccess.run(admin,()=>life.applyContractLifecycle(f.db,100,202,{...body,note:'changed'})),e=>e.status===409);
 await assert.rejects(()=>dataAccess.run({...admin,id:2},()=>life.applyContractLifecycle(f.db,100,2,body)),e=>e.status===403);
 f.order.paid='500000';assert.equal((await life.readContractLifecycle(f.db,100)).remaining,500000);
 checks.push('Admin closes unpaid debt while preserving totals, receipts and deposits; replay is actor/content bound and subsequent receipts reduce the live debt');
 const plan=billing.createInstallmentPlan('2026-10-01T10:00','2027-01-01T10:00','Theo tuần',100000);
 const planned=fixture({total:'100000',paid:'0',ownership:true,draft_payload:{management_composer:{installment_plan:plan,lifecycle:{bad_debt:{at:'2026-10-24T10:00:00+07:00'}}}}});
 const plannedResult=await dataAccess.run(admin,()=>life.applyContractLifecycle(planned.db,100,202,input()));
 assert.equal(plannedResult.total_amount,400000);assert.equal(planned.order.draft_payload.management_composer.installment_plan.stopped_at,'2026-10-24T10:00');
 const mapped=mapApiRow('contracts',{id:100,status:'completed',total_amount:'100000',paid_amount:0,draft_payload:planned.order.draft_payload});
 assert(mapped.bad_debt_closed_at);
 const future=billing.applyInstallmentBilling(mapped,Date.parse('2028-01-01T00:00Z'));assert.equal(future.total_amount,400000);
 checks.push('Ownership debt stays frozen at its original cutoff after closing, including legacy plans without stopped_at');
 const row={id:100,name:'QA',code:'QA-100',status:'completed',total_amount:1000000,paid_amount:250000,bad_debt_closed_at:result.bad_debt_closed_at,start_date:'2026-10-01',end_date:'2026-10-20',store_id:1};
 assert.equal(summarizeContracts([row],[]).receivableAmount,750000);assert.equal(summarizeContracts([row],[]).badDebtAmount,0);
 const kpis=summarizeSalesKpis([row],'2026-10-01','2026-10-31','all');assert.equal(kpis.revenue,1000000);assert.equal(kpis.paid,250000);assert.equal(kpis.debt,750000);
 const table={kind:'contracts',scope:'collection',store:'all',query:EMPTY_QUERY,page:1,size:10,sort:'code',direction:'asc'};
 const rows=projectManagementTable([row,{...row,id:101,paid_amount:1000000},{...row,id:102,bad_debt_closed_at:''}],table,true).rows;
 assert.deepEqual(rows.map(r=>r.id),[100]);
 checks.push('Closed outstanding debt appears in receivables, sales and collection reports; paid/ordinary closed contracts stay out');
 console.log(JSON.stringify({passed:checks.length,checks,external_network_allowed:false,realBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

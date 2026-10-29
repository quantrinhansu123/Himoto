const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs'),{NextRequest}=require('next/server');
const domain=load(path.join(root,'lib/management/ownership-terms')),service=load(path.join(root,'lib/server/ownership-terms'));
const session=load(path.join(root,'lib/server/management-session')),db=load(path.join(root,'lib/server/himoto-database'));
const route=load(path.join(root,'app/api/auth/order/car-rental/[id]/ownership-terms/route'));
const permissions=['contracts.read','contracts.draft'];
const manager={id:162,name:'Quản lý QA',access_role:'ownership_manager',scope_all:true,store_id:null,permissions};
const body=(revision='7',extra={})=>({revision,request_id:randomUUID(),term_months:'12',daily_amount:'135000',...extra});
const checks=[];
async function main(){
 for(const invalid of [{term_months:'13'},{daily_amount:'0'},{daily_amount:'-1'},{daily_amount:'1.5'},{daily_amount:135000},{daily_amount:undefined},{request_id:'bad'},{total:9000000},{store_id:35},{revision:'-1'}])assert.throws(()=>service.parseOwnershipTerms(body('7',invalid)));
 assert.equal(service.parseOwnershipTerms(body('7',{daily_amount:null})).daily_amount,null);
 for(const role of ['branch_staff','branch_manager','headquarters_sales','headquarters_debt','accounting','internal_control'])assert.equal(domain.canEditOwnershipTerms({...manager,access_role:role}),false);
 assert(domain.canEditOwnershipTerms(manager));assert(domain.canEditOwnershipTerms({...manager,access_role:'admin'}));assert(domain.canEditOwnershipTerms({...manager,access_role:'ownership_staff'}));assert(!domain.canEditOwnershipTerms({...manager,permissions:['contracts.read']}));
 checks.push('Ownership staff/managers/admins with draft permission may edit; invalid terms, amounts, request IDs and unrelated financial fields are rejected');
 let row={id:901,contract_number:'VPS-QA-901',order_status:'renting',store_id:35,rental_type:'ownership',revision:'7',total:'3000000',pid:2200000,draft_payload:{legacy_migration:{sourceStoreId:'29',sourceOrderId:'32039'},management_composer:{profile:{staff_name:'Người làm hồ sơ QA'},draft:{total_amount:'3000000'},installment_plan:{version:1,start:'2026-10-01T08:00',end:'2027-10-01T08:00',interval:'month',amount:3000000}}}};
 let queries=[],mutations=0,actor=manager;
 const fake={release(){},async query(sql,args=[]){queries.push(sql);
  if(sql.includes('FROM himoto.orders o WHERE o.id=$1'))return{rows:[structuredClone(row)],rowCount:1};
  if(sql.startsWith('SELECT substitute_unit_price'))return{rows:[{substitute_unit_price:null,type:'day'}],rowCount:1};
  if(sql.startsWith('UPDATE himoto.orders SET draft_payload=')){mutations++;row={...row,draft_payload:JSON.parse(args[1]),revision:String(Number(row.revision)+1)};return{rows:[{revision:row.revision}],rowCount:1};}
  return{rows:[],rowCount:0};}};
 const original={row:structuredClone(row),user:session.userFromSession,read:session.readSessionUser,connect:Object.getOwnPropertyDescriptor(db.himotoPool,'connect')};
 const previous={DATABASE_URL:process.env.DATABASE_URL,MANAGEMENT_SESSION_SECRET:process.env.MANAGEMENT_SESSION_SECRET};
 process.env.DATABASE_URL='postgres://fixture.invalid/test';process.env.MANAGEMENT_SESSION_SECRET='ownership-terms-qa-session-key-32-characters';
 const request=(method,input,origin='http://localhost')=>new NextRequest('http://localhost/api/auth/order/car-rental/901/ownership-terms',{method,headers:{host:'localhost',origin,cookie:session.SESSION_COOKIE+'='+session.signSession(actor?.id||162),'content-type':'application/json'},...(method==='PATCH'?{body:JSON.stringify(input)}:{})});
 const invoke=(method,input,origin)=>route[method](request(method,input,origin),{params:Promise.resolve({id:'901'})});
 try {
  session.userFromSession=async()=>actor;session.readSessionUser=async()=>actor;Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>fake});
  actor=null;assert.equal((await invoke('GET')).status,401);assert.equal(queries.length,0);
  actor=manager;assert.equal((await invoke('PATCH',body(),'https://foreign.invalid')).status,403);assert.equal(queries.length,0);
  for(const role of ['branch_manager','accounting']){actor={...manager,access_role:role};assert.equal((await invoke('PATCH',body())).status,403);assert.equal(mutations,0);}
  actor={...manager,access_role:'ownership_staff'};assert.equal((await invoke('PATCH',body())).status,200);assert.equal(mutations,1);
  row=structuredClone(original.row);mutations=0;
  actor={...manager,scope_all:false,store_id:33};assert.equal((await invoke('GET')).status,404);assert.equal((await invoke('PATCH',body())).status,404);assert.equal(mutations,0);
  actor=manager;row.rental_type='daily';assert.equal((await invoke('GET')).status,409);row.rental_type='ownership';
  for(const status of ['draft','cancelled']){row.order_status=status;assert.equal((await invoke('PATCH',body())).status,409);}row.order_status='renting';
  checks.push('Actual APIs reject anonymous, cross-origin, wrong roles/branches, ordinary rentals and draft/cancelled writes without changing records; ownership staff may correct terms');
  const read=await invoke('GET');assert.equal(read.status,200);assert(read.headers.get('cache-control').includes('no-store'));assert(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert.equal((await read.json()).data.daily_amount,null);
  const input=body();let response=await invoke('PATCH',input);assert.equal(response.status,200);let saved=(await response.json()).data;assert.equal(saved.daily_amount,135000);assert.equal(saved.term_months,'12');assert.equal(saved.history.length,1);assert.equal(mutations,1);
  assert.deepEqual(row.draft_payload.legacy_migration,original.row.draft_payload.legacy_migration);assert.deepEqual(row.draft_payload.management_composer.installment_plan,original.row.draft_payload.management_composer.installment_plan);assert.deepEqual(row.draft_payload.management_composer.draft,original.row.draft_payload.management_composer.draft);assert.equal(row.draft_payload.management_composer.profile.staff_name,'Người làm hồ sơ QA');assert.equal(row.total,original.row.total);assert.equal(row.pid,original.row.pid);
  assert(!queries.some(sql=>/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?himoto\.(?:transactions|vehicles|order_vehicle_details|management_contract_notifications)/i.test(sql)));
  checks.push('A manager with global scope and no assigned store corrects legacy terms and daily amount; totals, receipts, deposits, schedules and stock are preserved');
  response=await invoke('PATCH',input);assert.equal(response.status,200);assert.equal(mutations,1);assert.equal((await response.json()).data.history.length,1);
  assert.equal((await invoke('PATCH',{...input,daily_amount:'140000'})).status,409);assert.equal((await invoke('PATCH',body('7'))).status,409);assert.equal(mutations,1);
  const clear=body(saved.revision,{daily_amount:null,term_months:'custom'});response=await invoke('PATCH',clear);assert.equal(response.status,200);saved=(await response.json()).data;assert.equal(saved.daily_amount,null);assert.equal(saved.term_months,'custom');assert.equal(saved.history.length,2);assert(queries.includes('COMMIT'));
  checks.push('Retries after a lost response are idempotent; stale revisions and changed request IDs conflict; unknown daily amounts stay unknown rather than becoming zero');
 }finally{session.userFromSession=original.user;session.readSessionUser=original.read;Object.defineProperty(db.himotoPool,'connect',original.connect);for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;}
 if(process.argv.includes('--live-temp')){
  require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});const c=await db.ownerDatabase.connect();
  try{await c.query('BEGIN');await c.query('CREATE TEMP TABLE qa_terms_orders AS SELECT * FROM himoto.orders WHERE false');await c.query('CREATE TEMP TABLE qa_terms_order_vehicle_details AS SELECT * FROM himoto.order_vehicle_details WHERE false');
   const sql=text=>text.replaceAll('himoto.orders','pg_temp.qa_terms_orders').replaceAll('himoto.order_vehicle_details','pg_temp.qa_terms_order_vehicle_details');
   const proxy={async query(text,args){const rewritten=sql(text);assert(!rewritten.includes('himoto.'),'All SQL must stay in TEMP');return c.query(rewritten,args);}};
   await c.query(`INSERT INTO qa_terms_orders(id,store_id,order_type,order_status,total,pid,first_deposit_amount,draft_payload) VALUES(901,35,'rental','renting','3000000',2200000,2000000,$1::json)`,[JSON.stringify(original.row.draft_payload)]);
   await c.query('INSERT INTO qa_terms_order_vehicle_details(id,order_id,vehicle_id,substitute_unit_price,type,rent_at,return_at) VALUES(501,901,100,120000,\'day\',now()-interval \'7 days\',now())');
   const snapshot=async()=>({order:(await c.query('SELECT total,pid,first_deposit_amount,store_id,order_status FROM qa_terms_orders WHERE id=901')).rows[0],details:(await c.query('SELECT * FROM qa_terms_order_vehicle_details')).rows});
   const before=await snapshot(),read=await service.readOwnershipTerms(proxy,901,manager);assert.equal(read.daily_amount,120000);assert.equal(read.term_months,'custom');
   await c.query("UPDATE qa_terms_order_vehicle_details SET type='week'");assert.equal((await service.readOwnershipTerms(proxy,901,manager)).daily_amount,null,'A weekly amount must not be presented as daily');await c.query("UPDATE qa_terms_order_vehicle_details SET type='day'");
   await c.query("INSERT INTO qa_terms_order_vehicle_details(id,order_id,vehicle_id,substitute_unit_price,type,rent_at,return_at) VALUES(502,901,101,120000,'day',now()-interval '7 days',now())");assert.equal((await service.readOwnershipTerms(proxy,901,manager)).daily_amount,240000);
   const multi=structuredClone(original.row.draft_payload);Object.assign(multi.management_composer.draft,{package_name:'Theo ngày',unit_price:'135000'});await c.query('UPDATE qa_terms_orders SET draft_payload=$1::json',[JSON.stringify(multi)]);assert.equal((await service.readOwnershipTerms(proxy,901,manager)).daily_amount,270000,'Daily price is per vehicle');
   await c.query('DELETE FROM qa_terms_order_vehicle_details WHERE id=502');await c.query('UPDATE qa_terms_orders SET draft_payload=$1::json',[JSON.stringify(original.row.draft_payload)]);
   const update=body(read.revision);const saved=await service.updateOwnershipTerms(proxy,901,manager,update);assert.equal(saved.daily_amount,135000);assert.equal(saved.term_months,'12');assert.deepEqual(await snapshot(),before);
   assert.equal((await service.updateOwnershipTerms(proxy,901,manager,update)).history.length,1);await assert.rejects(service.updateOwnershipTerms(proxy,901,manager,body('1')),e=>e.status===409);
   checks.push('PostgreSQL TEMP: legacy source type inference, explicit daily rate fallback, audit persistence, retry and protected financial fields all hold');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
 }
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

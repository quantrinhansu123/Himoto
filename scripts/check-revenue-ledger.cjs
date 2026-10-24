const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),ts=require('typescript');
const {randomUUID}=require('node:crypto'),{NextRequest,NextResponse}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const ledger=load(path.join(root,'lib/server/revenue-ledger'));
const {rentalRevenue}=load(path.join(root,'lib/server/rental-revenue'));
const {validRevenueLedger}=load(path.join(root,'lib/management/revenue-ledger'));
const checks=[],base={from:'2026-10-21',to:'2026-10-21',store_id:'23'};
const params=patch=>new URLSearchParams({...base,...patch});
async function apiChecks(){
 const session=load(path.join(root,'lib/server/management-session')),access=load(path.join(root,'lib/server/access-request'));
 const original=session.readSessionUser;let user=null,connections=0,releases=0,failure=false;const queries=[];
 const deps={
  'next/server':{NextRequest,NextResponse},'@/lib/server/access-request':access,
  '@/lib/server/public-failure':load(path.join(root,'lib/server/public-failure')),
  '@/lib/server/himoto-database':{himotoPool:{connect:async()=>{connections++;return {query:async sql=>{queries.push(sql);return {rows:[]};},release(){releases++;}};}}},
  '@/lib/server/revenue-ledger':{...ledger,revenueLedger:async(_db,p)=>{ledger.parseRevenueLedger(p);if(failure)throw new ledger.RevenueLedgerError('QA incomplete',409);return {rows:[]};}}
 };
 const mod={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'app/api/auth/rental-revenue/transactions/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in deps,name);return deps[name];},mod,mod.exports);
 const request=(query=params())=>mod.exports.GET(new NextRequest('http://localhost/api/auth/rental-revenue/transactions?'+query),{});
 try{
  session.readSessionUser=async()=>user;
  assert.equal((await request()).status,401);assert.equal(connections,0);
  user={id:7,access_role:'branch_staff',store_id:23,scope_all:false,permissions:[]};
  assert.equal((await request()).status,403);assert.equal(connections,0);
  user={...user,permissions:['contracts.read']};
  const response=await request();assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/private, no-store/);
  assert(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert(queries.includes('COMMIT'));assert.equal(connections,releases);
  failure=true;queries.length=0;assert.equal((await request()).status,409);assert(queries.includes('ROLLBACK'));assert(!queries.includes('COMMIT'));
  assert.equal((await request(params({from:'bad'}))).status,400);assert.equal(connections,releases);
  assert.deepEqual(Object.keys(mod.exports).sort(),['GET','maxDuration','runtime']);
  checks.push('API: anonymous/unauthorized blocked before DB; contracts.read retains branch context; GET uses a read-only repeatable snapshot, no cache, rollback/release on failure, and exposes no write method');
 }finally{session.readSessionUser=original;}
}
async function main(){
 for(const patch of [{from:'2026-02-30'},{from:'2026-10-22'},{store_id:''},{store_id:'0'},{store_id:'x'},{category:'not-real'},{method:'bank'},{page:'0'},{size:'101'},{all:'true'},{search:'x'.repeat(201)},{search:'x\u0001y'}])assert.throws(()=>ledger.parseRevenueLedger(params(patch)),e=>e.status===400);
 assert.equal(ledger.parseRevenueLedger(params({category:'revenue',method:'cash',all:'1'})).all,true);
 checks.push('Inputs: real calendar, date order, positive branch, supported categories/methods, pagination/export flag and bounded search are validated');
 await apiChecks();
 if(process.argv.includes('--live-temp')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database')),c=await ownerDatabase.connect();
  const db={query(sql,values){assert(/^\s*(WITH|SELECT)\b/i.test(sql));return c.query(sql.replaceAll('himoto.','pg_temp.'),values);}};
  try{
   await c.query('BEGIN');
   for(const table of ['orders','transactions','management_contract_payments','order_vehicle_details'])await c.query(`CREATE TEMP TABLE ${table} (LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
   for(const table of ['users','customers','stores','staff_profiles','vehicles'])await c.query(`CREATE TEMP TABLE ${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
   await c.query(`INSERT INTO pg_temp.users(id,name) VALUES(7,'QA actor');INSERT INTO pg_temp.staff_profiles(id,full_name) VALUES(7,'QA sales');
    INSERT INTO pg_temp.customers(id,name) VALUES(1,'QA customer');INSERT INTO pg_temp.stores(id,store_name) VALUES(23,'QA A'),(31,'QA B');
    INSERT INTO pg_temp.orders(id,contract_number,customer_id,order_status,store_id,total,pid,total_rental_fees,draft_payload) VALUES
     (42,'000042',1,'completed',23,'800',1500,1000,'{"management_composer":{"profile":{"sales_staff_id":"7"}}}'),
     (43,'000043',1,'renting',23,'500',0,200,'{}'),
     (44,'000044',1,'renting',23,'500',0,450,'{"management_composer":{"draft":{"extra_charges":[{"amount":"50"}]}}}'),
     (45,'000045',1,'renting',23,'150',150,100,'{"management_composer":{"draft":{"extra_charges":[{"amount":"50"}]}}}'),
     (46,'BAT-QA',1,'renting',23,'150',150,100,'{"legacy_migration":{"sourceStoreId":"30"}}');
    INSERT INTO pg_temp.vehicles(id,name,license) VALUES(1,'QA bike A','QA-PLATE'),(2,'QA bike B','QA-OTHER');
    INSERT INTO pg_temp.order_vehicle_details(id,order_id,vehicle_id) VALUES(1,43,1),(2,43,2);`);
   const fixtures=[
    [1,42,'order:rental_fees','in',1000,'2026-10-20T10:00:00+07:00'],[2,42,'order:deposit','in',500,'2026-10-20T10:00:00+07:00'],
    [3,43,'order:rental_fees','in',300,'2026-10-21T10:00:00+07:00','personal'],[4,43,'order:renewal','in',100,'2026-10-21T10:01:00+07:00','company'],
    [5,43,'order:return_late','in',60,'2026-10-21T10:02:00+07:00','mixed'],[6,43,'order:return_repair','in',90,'2026-10-21T10:03:00+07:00'],
    [7,43,'order:extra','in',110,'2026-10-21T10:04:00+07:00','unknown'],[8,43,'order:deposit_refund','out',500,'2026-10-21T10:05:00+07:00','company'],
    [9,44,'order:rental_fees','in',30,'2026-10-20T10:02:00+07:00'],[10,44,'order:payment','in',100,'2026-10-21T10:06:00+07:00'],
    [11,44,'legacy unknown','addon',70,'2026-10-21T10:07:00+07:00','unknown'],[12,44,'order:rental_fees','in',9000,'2026-10-21T10:08:00+07:00','cash','pending'],
    [13,44,'order:rental_fees','in',9000,'2026-10-22T00:00:00+07:00'],[14,43,'order:rental_fees','in',9000,'2026-10-21T10:09:00+07:00','cash','approved',31],
    [15,45,'order:rental_fees','in',50,'2026-10-20T10:00:00+07:00','cash','approved',31],[16,45,'order:payment','in',100,'2026-10-21T00:00:00+07:00'],
    [17,42,'order:rental_refund','out',200,'2026-10-21T10:10:00+07:00','personal'],[18,42,'order:additional_deposit','in',500,'2026-10-21T10:11:00+07:00','personal'],
    [19,43,'order:renewal','in',360,'2026-10-21T16:39:00+07:00'],[20,43,'order:renewal','in',360,'2026-10-21T17:08:00+07:00'],
    [21,46,'order:rental_fees','in',9000,'2026-10-21T10:09:00+07:00'],
   ];
   for(const [id,order,name,type,value,at,method='cash',status='approved',store=23] of fixtures){const bank=['personal','company','unknown'].includes(method),payment=method==='mixed'?3:bank?2:1;
    await c.query(`INSERT INTO pg_temp.transactions(id,order_id,name,type,value,created_at,status,store_id,user_id,cash_id,bank_id,bank_owner_type,payment_method,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,7,$9,$10,$11,$12,'QA note')`,[id,order,name,type,value,at,status,store,method==='cash'?1:null,bank?1:null,['personal','company'].includes(method)?method:null,payment]);
   }
   await c.query(`INSERT INTO pg_temp.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload) VALUES($1,43,3,7,$2,'{"version":2,"amount":300}')`,[randomUUID(),'a'.repeat(64)]);
   const all=await ledger.revenueLedger(db,params({all:'1'}));assert(validRevenueLedger(all));assert.equal(all.total,13);assert.equal(all.totals.revenue,1160);assert.equal(all.totals.contracts,4);
   assert.deepEqual((await rentalRevenue(db,base.from,base.to,23)).total,{rental:180,renewal:1120,late:60,early:200,revenue:1160});
   assert.equal(all.rows.find(r=>r.id==='10').revenue,80);assert.equal(all.rows.find(r=>r.id==='16').revenue,100);assert.equal(all.rows.find(r=>r.id==='17').revenue,-200);assert.equal(all.rows.find(r=>r.id==='16').day,base.from);
   assert.equal(all.rows.filter(r=>r.category==='renewal').length,4);assert.equal(all.rows.find(r=>r.id==='3').vehicles,'QA-OTHER, QA-PLATE');
   checks.push('TEMP: every approved voucher appears once across multiple vehicles; equal-value renewals remain separate; Vietnam midnight, foreign branch, pending and battery receipts are filtered; ledger reconciles rental/renewal/late/refund totals');
   assert.equal(all.totals.deposit,500);assert.equal(all.totals.deposit_refund,500);
   for(const row of all.rows.filter(r=>['deposit','deposit_refund','repair','extra','unclassified'].includes(r.category)))assert.equal(row.revenue,0);
   assert.equal(all.totals.methods.mixed.revenue,60);assert.equal(all.totals.methods.personal.revenue,100);assert.equal(all.totals.methods.company.revenue,100);
   checks.push('TEMP: cọc/refund/repair/extra stay separate from revenue, real early refund is negative, initial fees allocate using full history before branch/date filtering, ambiguous mixed/bank methods are not guessed');
   const page1=await ledger.revenueLedger(db,params({size:'5'})),page2=await ledger.revenueLedger(db,params({size:'5',page:'2'})),last=await ledger.revenueLedger(db,params({size:'5',page:'999'}));
   assert(validRevenueLedger(page1)&&validRevenueLedger(page2)&&validRevenueLedger(last));assert.equal(last.page,3);assert.equal(last.rows.length,3);assert.deepEqual(page1.totals,page2.totals);assert(!page1.rows.some(r=>page2.rows.some(s=>s.id===r.id)));
   assert.equal((await ledger.revenueLedger(db,params({category:'revenue',all:'1'}))).total,8);
   assert.equal((await ledger.revenueLedger(db,params({method:'personal',all:'1'}))).total,3);
   assert.equal((await ledger.revenueLedger(db,params({search:'QA-PLATE',all:'1'}))).total,8);
   assert.equal((await ledger.revenueLedger(db,params({search:'000044',all:'1'}))).total,2);
   assert.equal((await ledger.revenueLedger(db,params({search:'QA actor',all:'1'}))).total,13);
   for(const search of ['%',"' OR true --",'no such entry']){const empty=await ledger.revenueLedger(db,params({search,all:'1'}));assert(validRevenueLedger(empty));assert.equal(empty.total,0);}
   checks.push('TEMP: filters/search by plate, staff, code and literal wildcard are bound safely; totals cover all pages; stable pagination clamps deleted/oversized page and full export returns every matching receipt');
   for(const change of [r=>{r.totals.revenue++;},r=>{r.rows.pop();},r=>{r.rows[0].revenue++;},r=>{r.rows[0].id=r.rows[1].id;},r=>{r.totals.methods.cash.count++;}]){const broken=structuredClone(all);change(broken);assert(!validRevenueLedger(broken));}
   checks.push('Client rejects mismatched totals, truncated exports, duplicate receipts and per-row/category/method inconsistencies');
   await c.query(`INSERT INTO pg_temp.transactions(id,order_id,name,type,value,created_at,status,store_id,user_id,payment_method,note) SELECT 10000+i,42,'order:rental_fees','in',1,'2026-10-21T12:00:00+07:00','approved',23,7,1,'QA' FROM generate_series(1,10001)i`);
   await assert.rejects(ledger.revenueLedger(db,params({all:'1'})),e=>e.status===413);assert.equal((await ledger.revenueLedger(db,params({size:'20'}))).rows.length,20);
   checks.push('TEMP: exports above 10,000 receipts fail explicitly instead of silently truncating, while normal pagination still works');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
 }
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0},null,2));
}
main().catch(e=>{console.error(e.name,e.code||'',e.message,e.stack);process.exitCode=1;});

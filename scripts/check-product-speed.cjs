const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const shared=load(path.join(root,'lib/management/management-table'));
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const checks=[],base={kind:'contracts',query:{...EMPTY_QUERY},store:'all',scope:'',page:1,size:10,sort:'code',direction:'asc'};
async function clientChecks(){
 const key=input=>shared.managementStatisticsKey(shared.managementTableQuery(input).toString());
 assert.equal(key(base),key({...base,page:4,size:50,sort:'start_date',direction:'desc'}));
 for(const patch of [{store:'34'},{scope:'ownership'},{query:{...EMPTY_QUERY,status:'bad_debt'}},{query:{...EMPTY_QUERY,search:'QA'}},{query:{...EMPTY_QUERY,startDate:'2026-10-23'}},{query:{...EMPTY_QUERY,filters:{customer_id:'12'}}}])assert.notEqual(key(base),key({...base,...patch}));
 const oldFetch=global.fetch,calls=[];
 const cached={rows:[],total:20,scopeCount:25,tabCount:20,page:1,pages:2,statusCounts:[['completed',20]],statuses:['completed'],dueCount:3,summary:{contractCount:20,blacklistCount:2,totalAmount:1000,receivableAmount:300,badDebtAmount:100}};
 try{
  global.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>({status:'success',data:{...cached,rows:[{id:11}],statusCounts:[],summary:null}})};};
  const page=await shared.requestManagementTable({...base,page:2},undefined,false,[],cached);assert.equal(page.rows[0].id,11);assert.deepEqual(page.summary,cached.summary);assert.deepEqual(page.statusCounts,cached.statusCounts);assert.equal(new URL(calls[0],'http://localhost').searchParams.get('status_counts'),null);
  let changed=0;calls.length=0;
  global.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>({status:'success',data:{...cached,total:21,summary:{...cached.summary,contractCount:21},statusCounts:++changed===1?[]:[['completed',21]]}})};};
  const updated=await shared.requestManagementTable({...base,page:2},undefined,false,[],cached);assert.equal(calls.length,2);assert.equal(new URL(calls[1],'http://localhost').searchParams.get('status_counts'),'1');assert.equal(updated.summary.contractCount,21);assert.deepEqual(updated.statusCounts,[['completed',21]]);
 }finally{global.fetch=oldFetch;}
 checks.push('Client statistics reuse stays within identical filters/store/scope; page changes fetch only rows, and a changed result count forces fresh counters instead of masking a concurrent create/delete');
 const {dateTimeInput}=load(path.join(root,'lib/management/contract-document'));
 for(const value of ['2026-12-31T17:00:00Z','2024-02-29T17:00:00Z','2026-10-23T16:59:59Z','2026-10-24T00:00:00+07:00','2026-10-24T00:00:00-04:00']){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)),get=key=>parts.find(p=>p.type===key).value;
  assert.equal(dateTimeInput(value),`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`);
 }
 assert.equal(dateTimeInput('2026-10-24T00:00'),'2026-10-24T00:00');
 checks.push('Reused timezone formatters preserve Vietnam midnight, leap day, year rollover, explicit offsets and local date-time inputs');
}
async function main(){await clientChecks();
 if(process.argv.includes('--live-temp')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
  const {fastContractStatistics}=load(path.join(root,'lib/server/contract-table-stats'));
  const {contractIndexSql}=load(path.join(root,'lib/server/contract-drafts'));
  const {mapApiRow}=load(path.join(root,'lib/management/repository'));
  const {withContractMonitoring}=load(path.join(root,'lib/management/contract-overdue'));
  const {applyInstallmentBilling}=load(path.join(root,'lib/management/contract-billing'));
  const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
  const c=await ownerDatabase.connect();try{
   await c.query('BEGIN');const fixed=Number((await c.query('SELECT extract(epoch FROM now())*1000 AS at')).rows[0].at);
   for(const table of ['orders','transactions','customers','stores','vehicles','order_vehicle_details','staff_profiles','staff_account_attribution'])await c.query(`CREATE TEMP TABLE qa_speed_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
   const statements=[],db={async query(sql,args){assert(/^\s*(SELECT|WITH)\b/.test(sql));const r=await c.query(sql.replaceAll('himoto.','pg_temp.qa_speed_'),args);statements.push({sql,args,detailed:r.rows[0]?.detailed?.length});return r;}};
   await c.query(`INSERT INTO qa_speed_stores(id,store_name,kind) VALUES(1,'QA','physical');INSERT INTO qa_speed_customers(id,name,status) VALUES(1,'QA blacklist',2),(2,'QA customer',1);
     INSERT INTO qa_speed_orders(id,contract_number,customer_id,store_id,order_status,order_type,total,pid,rent_at,return_at,draft_payload)
       SELECT i,'QA-'||i,1+i%2,1,'completed','daily','1000',1000,'2026-09-01T00:00:00+07:00','2026-09-02T00:00:00+07:00','{}' FROM generate_series(1,1000)i;
     INSERT INTO qa_speed_orders(id,contract_number,customer_id,store_id,order_status,order_type,total,pid,rent_at,return_at,draft_payload) VALUES
       (1001,'QA-OPEN',1,1,'renting','daily','1000',500,now()-interval '10 days',now()-interval '1 day','{}'),
       (1002,'QA-RESERVED',1,1,'reserved','daily','1000',0,now()-interval '10 days',now()+interval '10 days','{}'),
       (1003,'QA-BAD',2,1,'bad_debt','daily','1000',100,now()-interval '10 days',now()-interval '1 day','{}');
     INSERT INTO qa_speed_transactions(id,order_id,type,name,value,status) VALUES(1,1001,'in','order:deposit',200,'approved');`);
   async function compare(){
    const raw=(await db.query(contractIndexSql('',{includePaid:true,includeVehicleLabels:true}))).rows;
    const source=raw.map(r=>withContractMonitoring(applyInstallmentBilling(mapApiRow('contracts',r),fixed),fixed));
    for(const status of ['','completed','renting','reserved','cancelled','draft']){
     const input={...base,query:{...EMPTY_QUERY,status}},expected=shared.projectManagementTable(source,input,true,fixed),actual=await fastContractStatistics(db,input,'',fixed);assert(actual);
     for(const key of ['total','tabCount','statusCounts','statuses','dueCount','summary'])assert.deepEqual(actual[key],expected[key],`${status||'all'}: ${key}`);
    }
   }
   await compare();assert(statements.some(s=>s.detailed!==undefined&&s.detailed<=4));
   checks.push('TEMP: 1,000 closed contracts aggregate in DB while only open contracts use billing logic; full counts, receivables, bad debt and distinct blacklist customers match the original projection for six status filters');
   for(const [index,value] of [null,'','1.5','0x10','1e3',' ','not money'].entries())await c.query(`INSERT INTO qa_speed_orders(id,contract_number,customer_id,store_id,order_status,order_type,total,pid,draft_payload) VALUES($1,$2,1,1,'completed','daily',$3,0,'{}')`,[1010+index,`QA-EDGE-${index}`,value]);
   await compare();
   checks.push('TEMP: empty, unknown, decimal, exponential and legacy numeric formats retain original amount/null semantics rather than being dropped or converted to zero');
   await c.query(`INSERT INTO qa_speed_orders(id,contract_number,store_id,order_status,total,rent_at,draft_payload) VALUES
     (2001,'QA-DATE-A',1,'completed','100','2026-10-23T16:59:59Z','{}'),(2002,'QA-DATE-B',1,'completed','100','2026-10-23T17:00:00Z','{}'),
     (2003,'QA-DATE-C',1,'completed','100',NULL,'{}'),(2004,'QA-DATE-D',1,'completed','100',NULL,'{}');
     INSERT INTO qa_speed_order_vehicle_details(id,order_id,rent_at,deleted_at) VALUES(3001,2003,'2026-10-23T12:00:00+07:00',NULL),(3002,2004,'2026-10-23T12:00:00+07:00',now());`);
   const p=new URLSearchParams({table:'1',from:'2026-10-23',to:'2026-10-23',size:'1',scope_count:'1'});statements.length=0;
   const first=await readManagementTable(db,'contracts',p);p.set('page','2');const second=await readManagementTable(db,'contracts',p);
   assert.equal(first.total,2);assert.equal(second.total,2);assert.deepEqual([first.rows[0].id,second.rows[0].id],[2001,2003]);
   const hydrations=statements.filter(s=>s.sql.includes('o.id=ANY($1'));assert.equal(hydrations.length,2);assert(hydrations.every(s=>s.args[0].length===2));assert(statements.some(s=>s.sql.includes("'2026-10-23'::date")));
   checks.push('TEMP: selected-day boundaries are filtered in SQL before hydration, including null legacy header dates and deleted lines; all matches remain correctly sorted and reachable across pages');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
 }
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0},null,2));
}
main().catch(e=>{console.error(e.name,e.code||'',e.message,e.stack);process.exitCode=1;});

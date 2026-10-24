const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {readShiftInventory}=load(path.join(root,'lib/server/shift-inventory'));
const {readShiftAutofill}=load(path.join(root,'lib/server/shift-autofill'));
const {vietnamDate}=load(path.join(root,'lib/management/duty-roster'));
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){const c=await ownerDatabase.connect(),checks=[];try{
 await c.query('BEGIN');
 for(const table of ['orders','order_vehicle_details','vehicles','stores'])await c.query(`CREATE TEMP TABLE qa_shift_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
 await c.query(`CREATE FUNCTION pg_temp.qa_shift_vehicle_rental_blockers(targets bigint[]) RETURNS TABLE(vehicle_id bigint,status text,rent_at timestamptz) LANGUAGE sql AS $$
   SELECT d.vehicle_id::bigint,o.order_status::text,d.rent_at::timestamptz FROM pg_temp.qa_shift_order_vehicle_details d JOIN pg_temp.qa_shift_orders o ON o.id=d.order_id
   WHERE d.vehicle_id=ANY(targets) AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
 $$`);
 const db={query(sql,args){assert(/^\s*(SELECT|WITH)\b/.test(sql));return c.query(sql.replaceAll('himoto.','pg_temp.qa_shift_'),args);}};
 const today=vietnamDate(),old=new Date(Date.parse(today)-5*86400000).toISOString().slice(0,10),future=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
 await c.query("INSERT INTO qa_shift_stores(id,store_name) VALUES(1,'A QA'),(2,'B QA')");
 for(let i=1;i<=16;i++)await c.query('INSERT INTO qa_shift_vehicles(id,license,status,store_id,current_store_id) VALUES($1,$2,$3,$4,$4)',[i,`QA-${i}`,![2,4,5,6,7,16].includes(i)?'ready':'using',i===3?2:1]);
 const orders=[
  [1,'daily','renting',old,1,[1,2]],[2,'daily','renting',today,1,[3,4]],
  [3,'monthly_1','renting',old,1,[5]],[4,'ownership','renting',old,1,[6]],
  [5,'daily','renting',old,1,[7]],[6,'daily','renting',old,1,[7]],
  [7,'daily','bad_debt',old,1,[null]],[8,'daily','cancelled',today,1,[8]],
  [9,'daily','renting',future,1,[9]],[10,'daily','renting',old,1,[10]],
  [11,'daily','renting',old,1,[11]],[12,'daily','renting',old,2,[12]],
  [13,'daily','renting',old,1,[13]],[14,'daily','deposit_contract',today,1,[14]],
  [15,'daily','completed',today,1,[15]],[16,'monthly','renting',old,1,[16]]
 ];let line=100;
 for(const [id,type,status,date,store,vehicles] of orders){
  await c.query(`INSERT INTO qa_shift_orders(id,contract_number,order_type,order_status,store_id,rent_at,draft_payload) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,`QA-${id}`,type,status,store,`${date}T00:00:00+07:00`,JSON.stringify(id===13?{legacy_migration:{sourceStoreId:'30'}}:{})]);
  for(const vehicle of vehicles)await c.query(`INSERT INTO qa_shift_order_vehicle_details(id,order_id,vehicle_id,type,rent_at,completed_at,deleted_at) VALUES($1,$2,$3,'day',$4,$5,$6)`,[++line,id,vehicle,`${date}T00:00:00+07:00`,[10,15].includes(id)?`${today}T00:00:00+07:00`:null,id===11?`${today}T00:00:00+07:00`:null]);
 }
 const start=`${today}T00:00:00+07:00`,end=`${future}T00:00:00+07:00`;
 const report=await readShiftInventory(db,1,start,end);
 assert.equal(report.started_contracts,2);assert.equal(report.started_vehicles,3);assert.equal(report.active_contracts,7);assert.equal(report.active_vehicles,8);
 assert.equal(report.daily_vehicles,5);assert.equal(report.monthly_vehicles,2);assert.equal(report.other_vehicles,1);
 checks.push('TEMP: selected-day contracts and their vehicles are separate from current open rentals; multi-vehicle contracts, prior-day rentals, completed handovers, future starts, cancellations, deposits and battery legacy orders keep the correct scope');
 assert.equal(report.ready_vehicles_raw,9);assert.equal(report.ready_conflicts,2);assert.equal(report.stock_vehicles,7);assert.equal(report.ready_rentals,2);
 assert.deepEqual(report.issues.filter(i=>i.kind==='ready_rental').map(i=>i.vehicle_id).sort((a,b)=>a-b),[1,3]);
 assert(!report.issues.some(i=>i.order_id===12));
 checks.push('TEMP: ready stock excludes still-rented vehicles exactly once; foreign physical stock attached to own contracts is flagged without subtracting it from local stock; foreign contract details are not included in the issue list');
 assert.equal(report.duplicate_vehicles,1);assert.equal(report.missing_vehicle_lines,1);assert.equal(report.issues.filter(i=>i.kind==='duplicate_rental').length,2);
 assert(report.issues.some(i=>i.kind==='missing_vehicle'&&i.order_id===7));
 checks.push('TEMP: multiple open contracts for the same vehicle produce one vehicle count and explicit contract warnings; null vehicle IDs are disclosed and excluded from totals');
 const current=await readShiftAutofill(db,{store_id:1,date:today,section:'inventory'});
 assert.deepEqual(current.values,{vehicles:7,daily_vehicles:5,monthly_vehicles:2,other_vehicles:1});assert(current.notices.length>=3);
 const past=await readShiftAutofill(db,{store_id:1,date:old,section:'inventory'});assert.deepEqual(past.values,{});assert(past.inventory);assert(past.notices.some(s=>s.includes('ngày cũ')));assert.equal(past.inventory.started_contracts,9);
 checks.push('TEMP: today autofills all four groups; past reports receive only read-only comparison metadata and retain their entered inventory, rather than receiving current stock as historical fact');
 assert.equal((await c.query('SELECT count(*)::int AS total FROM qa_shift_orders')).rows[0].total,16);
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0},null,2));
}finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}}
main().catch(e=>{console.error(e.name,e.code||'',e.message,e.stack);process.exitCode=1;});

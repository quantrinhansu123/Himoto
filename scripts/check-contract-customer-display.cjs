const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){
 const c=await ownerDatabase.connect(),checks=[];
 try{
  await c.query('BEGIN');
  const tables=['orders','customers','order_vehicle_details','vehicles','stores','staff_profiles','staff_account_attribution','transactions'];
  for(const table of tables)await c.query(`CREATE TEMP TABLE qa_customer_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
  const commands=[],db={query(sql,args){commands.push({sql,args});assert(/^\s*(SELECT|WITH)\b/.test(sql));for(const table of tables)sql=sql.replaceAll(`himoto.${table}`,`pg_temp.qa_customer_${table}`);assert(!sql.includes('himoto.'),'All business reads must use TEMP fixtures');return c.query(sql,args);}};
  await c.query("INSERT INTO qa_customer_stores(id,store_name,kind) VALUES(31,'QA A','branch'),(32,'QA B','branch'); INSERT INTO qa_customer_vehicles(id,name,license) VALUES(1,'Xe QA','89AB-725.85'),(2,'Xe khác QA','QA-111.11')");
  for(let i=1;i<=16;i++){
   await c.query('INSERT INTO qa_customer_customers(id,name,phone,status,store_id) VALUES($1,$2,$3,$4,$5)',[i,`Khách Cũ QA ${i}`,`09099110${String(i).padStart(2,'0')}`,i===3?2:1,i===3?32:31]);
   await c.query(`INSERT INTO qa_customer_orders(id,contract_number,customer_id,customer_name,store_id,order_status,total,pid,draft_payload,rent_at,return_at) VALUES($1,$2,$3,$4,31,'completed','100',0,'{}','2026-10-10T09:00:00+07:00','2026-10-11T09:00:00+07:00')`,[100+i,`QA-${i}`,i,i===16?'Khách Cũ QA 16':null]);
   await c.query('INSERT INTO qa_customer_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES($1,$2,1,$3,$4)',[i,100+i,'2026-10-10T09:00:00+07:00','2026-10-11T09:00:00+07:00']);
  }
  await c.query(`INSERT INTO qa_customer_orders(id,contract_number,customer_id,customer_name,customer_phone,store_id,order_status,total,pid,draft_payload) VALUES
   (200,'QA-SNAPSHOT',999,'Khách Snapshot QA','0911222333',31,'completed','200',0,'{}'),
   (201,'QA-MISSING',NULL,NULL,NULL,31,'completed','300',0,'{}');
   INSERT INTO qa_customer_order_vehicle_details(id,order_id,vehicle_id) VALUES(100,104,2)`);
  const read=extra=>readManagementTable(db,'contracts',new URLSearchParams({size:'10',...extra}));
  const first=await read({search:'72585'}),second=await read({search:'72585',page:'2'}),rows=[...first.rows,...second.rows];
  assert.equal(first.total,16);assert.equal(second.total,16);assert.equal(first.rows.length,10);assert.equal(second.rows.length,6);assert.equal(new Set(rows.map(r=>r.id)).size,16);
  for(const row of rows){assert.equal(row.customer_name,`Khách Cũ QA ${row.customer_id}`);assert.equal(row.customer_phone,`09099110${String(row.customer_id).padStart(2,'0')}`);}
  assert.equal(rows.find(r=>r.id===103).customer_status,'blacklist');
  checks.push('TEMP: 15 legacy contracts with empty header names hydrate linked profile name/phone; all 16 plate matches remain reachable across pages without multiplying multi-vehicle contracts; blacklist status is retained');
  const name=await read({search:'khach cu qa 12'});assert.equal(name.total,1);assert.equal(name.rows[0].id,112);
  const accented=await read({search:'Khách Cũ QA 12'});assert.deepEqual(accented.rows.map(r=>r.id),[112]);
  const phone=await read({search:'0909911001'});assert.equal(phone.total,1);assert.equal(phone.rows[0].id,101);
  const withCounts=await read({search:'khach cu qa 12',scope_count:'1',status_counts:'1'});assert.equal(withCounts.total,1);assert.equal(withCounts.tabCount,1);assert.equal(withCounts.scopeCount,18);
  checks.push('TEMP: accented/unaccented customer names and phone search use linked profiles even when order snapshots are empty; status counts and paged results agree');
  const exported=await read({search:'72585',all:'1'});assert.equal(exported.rows.length,16);assert.deepEqual(exported.rows.map(r=>r.id).sort(),rows.map(r=>r.id).sort());assert(exported.rows.every(r=>r.customer_name&&r.customer_phone));
  const snapshot=await read({filter_id:'200'});assert.equal(snapshot.rows[0].customer_name,'Khách Snapshot QA');assert.equal(snapshot.rows[0].customer_phone,'0911222333');
  const missing=await read({filter_id:'201'});assert.equal(missing.total,1);assert.equal(missing.rows[0].customer_name,'');
  checks.push('TEMP: page/export customer fields agree; missing profiles fall back to the saved order, and genuinely absent data keeps the contract visible without inventing a customer');
  commands.length=0;await read({});assert(!commands[0].sql.includes('himoto.customers'));assert(commands[1].sql.includes('LEFT JOIN himoto.customers c'));assert(commands[1].args[0].length<=10);
  assert.equal((await c.query('SELECT count(*)::int AS count FROM qa_customer_orders')).rows[0].count,18);
  checks.push('TEMP: ordinary page index stays lean; customer hydration is limited to selected IDs and performs no data writes');
 }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0},null,2));
}
main().catch(e=>{console.error(e.name,e.code||'',e.message,e.stack);process.exitCode=1;});

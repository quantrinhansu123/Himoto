const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
const {MANAGEMENT_CONFIG}=load(path.join(root,'lib/management/config'));
const {projectManagementTable}=load(path.join(root,'lib/management/management-table'));
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const checks=[];
async function main(){
 const raw={id:1,name:'Wave QA',status:'using',store_id:31,current_store_id:23,store_name:'CS Giáp Bát',beneficiary_store_id:34,beneficiary_store_name:'CS Hàng Bút'};
 const rented=mapApiRow('vehicles',raw),unknown=mapApiRow('vehicles',{...raw,beneficiary_store_id:null,beneficiary_store_name:null});
 assert.equal(rented.store_id,23);assert.equal(rented.store_name,'CS Giáp Bát');assert.equal(rented.beneficiary_store_id,34);assert.equal(rented.beneficiary_store_name,'CS Hàng Bút');
 assert.equal(unknown.beneficiary_store_id,undefined);assert.equal(unknown.beneficiary_store_name,'');
 const ready=mapApiRow('vehicles',{...raw,id:3,status:'ready',beneficiary_store_id:null,beneficiary_store_name:null});assert.equal(ready.beneficiary_store_name,'');
 checks.push('Warehouse stays independent of contract source; missing/returned rentals never inherit the warehouse as customer source');
 const config=MANAGEMENT_CONFIG.vehicles;
 assert.equal(config.columns.find(c=>c.key==='beneficiary_store_name').hidden,true);
 assert.equal(config.columns.find(c=>c.key==='store_name').label,'Kho quản lý');
 const rows=[rented,{...rented,id:2,beneficiary_store_id:23,beneficiary_store_name:'CS Giáp Bát'},ready];
 const input={kind:'vehicles',query:{...EMPTY_QUERY,status:'using',filters:{beneficiary_store_id:'34'}},store:'23',scope:'',page:1,size:10,sort:'code',direction:'asc'};
 const filtered=projectManagementTable(rows,input);
 assert.equal(filtered.total,1);assert.equal(filtered.rows[0].beneficiary_store_name,'CS Hàng Bút');assert.equal(filtered.scopeCount,3);
 checks.push('Source column follows the compact branch-label layout and combined stock/status/source filters give the correct customer-branch count');
 if(process.argv.includes('--live-temp')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase,c=await db.connect(),schema='qa_vehicle_rental_sources';
  try{
   await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='15s'");await c.query('CREATE SCHEMA '+schema);
   for(const table of ['orders','order_vehicle_details'])await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS)`);
   const sql=fs.readFileSync('docs/sql/2026-10-29-vehicle-rental-sources.sql','utf8').replace(/^BEGIN;|^COMMIT;/gm,'').replaceAll('himoto.',schema+'.').replaceAll("'himoto'",`'${schema}'`);
   await c.query(sql);await c.query(sql);
   await c.query(`INSERT INTO ${schema}.orders(id,store_id,order_status,contract_number,total,draft_payload) VALUES
    (1,34,'renting','QA-ACTIVE',140000,NULL),(2,23,'completed','QA-OLD',200000,NULL),
    (3,23,'wait_payment','QA-RETURNED',300000,NULL),(4,23,'deposit_contract','QA-FUTURE',0,NULL),
    (5,23,'renting','QA-DELETED',400000,NULL),(6,23,'renting','QA-BATTERY',0,'{"legacy_migration":{"sourceStoreId":"30"}}'),
    (7,32,'bad_debt','QA-BAD-DEBT',500000,NULL),(8,32,'renting','QA-DELETED-LINE',0,NULL);
    UPDATE ${schema}.orders SET deleted_at=now() WHERE id=5;
    INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,completed_at) VALUES
    (1,1,100,now()-interval '2 days',NULL),(2,2,100,now()-interval '10 days',NULL),
    (3,3,101,now()-interval '5 days',now()),(4,4,100,now()+interval '5 days',NULL),
    (5,5,102,now(),NULL),(6,6,103,now(),NULL),(7,7,104,now(),NULL),(8,8,105,now(),NULL);
    UPDATE ${schema}.order_vehicle_details SET deleted_at=now() WHERE id=8;`);
   const sources=()=>c.query(`SELECT * FROM ${schema}.vehicle_rental_sources(ARRAY[100,101,102,103,104,105]::bigint[])`);
   assert.deepEqual((await sources()).rows.map(r=>[Number(r.vehicle_id),Number(r.store_id)]),[[100,34],[104,32]]);
   checks.push('PostgreSQL: current rental beats future reservations; completed/returned/deleted/battery-only lines are excluded and outstanding bad debt is retained');
   await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped;GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO himoto_scoped;
    ALTER TABLE ${schema}.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY branch_only ON ${schema}.orders FOR SELECT TO himoto_scoped USING(store_id=23);`);
   await c.query('SET LOCAL ROLE himoto_scoped');
   assert.equal((await c.query(`SELECT id,total FROM ${schema}.orders WHERE id=1`)).rowCount,0);
   const source=(await sources()).rows.find(r=>Number(r.vehicle_id)===100);assert.equal(Number(source.store_id),34);assert.deepEqual(Object.keys(source).sort(),['store_id','vehicle_id']);
   checks.push('PostgreSQL scoped role sees the foreign rental branch without access to its order, customer or financial information');
   await c.query('RESET ROLE');await c.query(`UPDATE ${schema}.order_vehicle_details SET completed_at=now() WHERE id=1`);
   assert.equal((await sources()).rows.some(r=>Number(r.vehicle_id)===100),false);
   checks.push('Returning the current vehicle clears its source immediately, despite future reservations and historical contracts');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
 }
 console.log(JSON.stringify({passed:checks.length,checks,permanentBusinessWrites:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {CONTRACT_LIST_SQL,contractListScopeClause}=load(path.join(root,'lib/server/contract-drafts'));
const {contractPageSql}=load(path.join(root,'lib/server/management-table'));
const {VEHICLE_ORDER_SQL}=load(path.join(root,'lib/server/contract-classification'));
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
const {readContractTelegram}=load(path.join(root,'lib/server/contract-telegram'));
const pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const checks=[];
global.fetch=async()=>{throw Error('No external calls in classification regression');};
async function main(){const c=await pool.connect(),schema='qa_contract_classification';
const sql=text=>text.replaceAll('himoto.',schema+'.').replaceAll('pg_catalog,himoto','pg_catalog,'+schema);
const db={query:(text,args)=>c.query(sql(text),args)};
try{
 await c.query('BEGIN');await c.query('CREATE SCHEMA '+schema);
 const tables=['orders','order_vehicle_details','vehicles','stores','users','staff_profiles','vehicle_location_events','customers','transactions','battery_contracts','gps_devices','management_gps_accounts'];
 for(const table of tables)await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS)`);
 const migration=fs.readFileSync('docs/sql/2026-10-19-contract-classification-availability.sql','utf8').replace(/^BEGIN;|^COMMIT;/gm,'');
 await db.query(migration);await db.query(migration);
 await db.query('DROP FUNCTION himoto.vehicle_rental_blockers(bigint[])');
 for(const file of ['2026-10-20-returned-vehicle-availability.sql','2026-10-20-reservation-window-conflicts.sql'])await db.query(fs.readFileSync('docs/sql/'+file,'utf8').replace(/^BEGIN;|^COMMIT;/gm,''));
 await c.query(`INSERT INTO ${schema}.stores(id,store_name,kind) VALUES(1,'CS Nguyễn Hoàng QA','physical'),(2,'CS Hà Đông QA','physical'),(35,'CS Sở hữu QA','lease_to_own');
   INSERT INTO ${schema}.vehicles(id,name,license,type,status,store_id,current_store_id,year,created_by) VALUES
    (369,'VISION QA','12T1-217.42','scooter','ready',1,1,2026,143),(370,'FELIZ QA','QA-PIN','electric','ready',1,1,2026,143),(371,'XE QA','QA-NATIVE','scooter','ready',1,1,2026,143);
   INSERT INTO ${schema}.orders(id,store_id,contract_number,order_status,order_type,customer_name,total,pid,draft_payload) VALUES
    (1,2,'VPS-12427','deposit_contract','rental','Khách riêng tư QA',150000,250000,NULL),
    (2,35,'VPS-28781','renting','ownership','Khách pin QA',650000,2650000,'{"legacy_migration":{"sourceStoreId":"30"}}'),
    (3,35,'VPS-28187','renting','rental','Khách sở hữu QA',240000,0,'{"legacy_migration":{"sourceStoreId":"29"}}'),
    (4,1,'QA-NATIVE','wait_payment','daily','Khách xe QA',100000,0,NULL),
    (5,1,'QA-DELETED','renting','daily','Đã xóa QA',0,0,NULL);
   UPDATE ${schema}.orders SET deleted_at=now() WHERE id=5;
   INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,completed_at) VALUES(101,1,369,NULL),(102,2,370,NULL),(103,4,371,now()),(104,5,370,NULL);
   INSERT INTO ${schema}.battery_contracts(id,store_id,code,status,customer_name,battery_name,vehicle_contract_id,signed_on,starts_at) VALUES(27,35,'PIN-VPS-28781','renting','Khách pin QA','Pin QA',2,current_date,now()),(28,35,'PIN-NATIVE','renting','Khách xe QA','Pin QA',4,current_date,now());`);
 const all=(await db.query(CONTRACT_LIST_SQL)).rows;
 assert.deepEqual(all.map(o=>Number(o.id)).sort(),[1,3,4]);
 const ownership=(await db.query(CONTRACT_LIST_SQL+contractListScopeClause('ownership'))).rows;
 assert.deepEqual(ownership.map(o=>Number(o.id)),[3]);
 const ownershipPage=(await db.query(`${contractPageSql(contractListScopeClause('ownership'))} ORDER BY o.id`)).rows;
 assert.ok(ownershipPage.some(row=>Number(row.id)===3),'ownership page SQL must return lease-to-own contracts');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.battery_contracts')).rows[0].n,2);
 assert.equal((await db.query('SELECT total,pid FROM himoto.orders WHERE id=2')).rows[0].pid,'2650000');
 checks.push('SQL lists/summaries exclude source-store-30 battery anchors, retain source-store-29 ownership and native car-plus-battery links; battery records and historical amounts remain intact');
 await assert.rejects(()=>readContractTelegram(db,2,143,{access_role:'admin'}),e=>e.status===404);
 checks.push('Legacy battery anchors cannot open the vehicle Telegram send workflow');
 const blockers=(await db.query('SELECT * FROM himoto.vehicle_rental_blockers(ARRAY[369,370,371]::bigint[])')).rows;
 assert.deepEqual(blockers.map(b=>[Number(b.vehicle_id),b.code,b.status,b.store_name]),[[369,'VPS-12427','deposit_contract','CS Hà Đông QA']]);
 assert.equal((await db.query('SELECT himoto.vehicle_has_other_rental(369,NULL) AS blocked')).rows[0].blocked,true);
 assert.equal((await db.query('SELECT himoto.vehicle_has_other_rental(370,NULL) AS blocked')).rows[0].blocked,false);
 assert.equal((await db.query('SELECT * FROM himoto.vehicle_other_rental_conflicts(ARRAY[370]::bigint[],NULL)')).rowCount,0);
 assert.equal((await db.query('SELECT * FROM himoto.vehicle_other_rental_conflicts(ARRAY[369]::bigint[],1)')).rowCount,0);
 assert.equal((await db.query('SELECT available FROM himoto.vehicle_inventory() WHERE id=370')).rows[0].available,true);
 checks.push('Picker and shared stock retain cross-branch deposit holds, release returned lines awaiting settlement, and exclude battery-only/deleted anchors');
 const apiSource=fs.readFileSync('src/app/api/auth/[...path]/route.ts','utf8');
 const vehicleSql=apiSource.match(/'vehicle\/vehicles':\s*\{\s*sql:\s*`([\s\S]*?)`,\s*\},/)[1];
 const fragments={VEHICLE_ORDER_SQL,
   VEHICLE_TRANSFER_JOIN_SQL:load(path.join(root,'lib/server/vehicle-transfers')).VEHICLE_TRANSFER_JOIN_SQL,
   VEHICLE_GPS_JOIN_SQL:load(path.join(root,'lib/server/vehicle-gps-query')).VEHICLE_GPS_JOIN_SQL};
 const listingSql=sql(vehicleSql.replace(/\$\{(\w+)\}/g,(_,key)=>{assert(key in fragments,key);return fragments[key];}));
 await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped;GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO himoto_scoped;
   ALTER TABLE ${schema}.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY own_branch ON ${schema}.orders FOR SELECT TO himoto_scoped USING(store_id=1);
   ALTER TABLE ${schema}.order_vehicle_details ENABLE ROW LEVEL SECURITY;CREATE POLICY own_order ON ${schema}.order_vehicle_details FOR SELECT TO himoto_scoped USING(order_id IN(SELECT id FROM ${schema}.orders));`);
 await c.query('SET LOCAL ROLE himoto_scoped');
 assert.equal((await db.query('SELECT id FROM himoto.orders WHERE id=1')).rowCount,0);
 const scoped=(await c.query(listingSql)).rows;
 const vehicle=mapApiRow('vehicles',scoped.find(v=>Number(v.id)===369));
 const [rental]=JSON.parse(vehicle.rentals_json);assert.equal(rental.code,'VPS-12427');assert.equal(rental.store_name,'CS Hà Đông QA');
 assert.deepEqual(Object.keys(rental).sort(),['code','customer','order_id','rent_at','return_at','status','store_name']);
 assert.equal(rental.customer,'','The hidden other-branch customer stays unreadable');
 assert.equal((await db.query('SELECT id FROM himoto.orders WHERE id=1')).rowCount,0);
 await c.query('RESET ROLE');
 checks.push('Actual scoped PostgreSQL role sees the cross-branch hold reason without gaining SELECT access to the other branch order, customer identity or financial data');
 await db.query("UPDATE himoto.orders SET order_status='completed' WHERE id IN(1,4)");
 assert.equal((await db.query('SELECT * FROM himoto.vehicle_rental_blockers(ARRAY[369,371]::bigint[])')).rowCount,0);
 assert.equal((await db.query('SELECT available FROM himoto.vehicle_inventory() WHERE id=369')).rows[0].available,true);
 assert.equal((await db.query('SELECT * FROM himoto.vehicle_other_rental_conflicts(ARRAY[369]::bigint[],NULL)')).rowCount,0);
 checks.push('Closing the real prior contracts clears both the picker blocker and issuance gate for ready stock; no unrelated contract or receipt needs deletion');
 const returnedMigration=fs.readFileSync('docs/sql/2026-10-21-returned-vehicle-conflicts.sql','utf8').replace(/^BEGIN;|^COMMIT;/gm,'');
 await db.query(returnedMigration);await db.query(returnedMigration);
 await db.query('UPDATE himoto.orders SET store_id=2 WHERE id=4');
 const moneyBefore=(await db.query('SELECT total,pid FROM himoto.orders WHERE id=4')).rows[0];
 for(const status of ['renting','overdue','wait_payment','pending','deposit_contract','bad_debt']){
   await db.query('UPDATE himoto.orders SET order_status=$1 WHERE id=4',[status]);
   await db.query('UPDATE himoto.order_vehicle_details SET completed_at=now() WHERE id=103');
   assert.equal((await db.query('SELECT himoto.vehicle_has_other_rental(371,NULL) AS blocked')).rows[0].blocked,false,status+' returned line');
   assert.equal((await db.query('SELECT * FROM himoto.vehicle_other_rental_conflicts(ARRAY[371]::bigint[],NULL)')).rowCount,0,status+' returned conflict');
   await db.query('UPDATE himoto.order_vehicle_details SET completed_at=NULL WHERE id=103');
   assert.equal((await db.query('SELECT himoto.vehicle_has_other_rental(371,NULL) AS blocked')).rows[0].blocked,true,status+' active line');
   assert.equal((await db.query('SELECT * FROM himoto.vehicle_other_rental_conflicts(ARRAY[371]::bigint[],NULL)')).rowCount,1,status+' active conflict');
   assert.equal((await db.query('SELECT himoto.vehicle_has_other_rental(371,4) AS blocked')).rows[0].blocked,false,'Own order exclusion');
 }
 await c.query('SET LOCAL ROLE himoto_scoped');
 assert.equal((await db.query('SELECT id FROM himoto.orders WHERE id=4')).rowCount,0);
 assert.equal((await db.query('SELECT * FROM himoto.vehicle_other_rental_conflicts(ARRAY[371]::bigint[],NULL)')).rowCount,1);
 await c.query('RESET ROLE');
 await db.query('UPDATE himoto.order_vehicle_details SET completed_at=now() WHERE id=103');
 await c.query('SET LOCAL ROLE himoto_scoped');
 assert.equal((await db.query('SELECT himoto.vehicle_has_other_rental(371,NULL) AS blocked')).rows[0].blocked,false);
 assert.equal((await db.query('SELECT * FROM himoto.vehicle_other_rental_conflicts(ARRAY[371]::bigint[],NULL)')).rowCount,0);
 await c.query('RESET ROLE');
 assert.deepEqual((await db.query('SELECT total,pid FROM himoto.orders WHERE id=4')).rows[0],moneyBefore);
 checks.push('Returned lines clear both cross-branch conflict helpers for every active order status; actual unreturned lines still block, own-order exclusion and branch RLS remain intact, and financial amounts stay unchanged');
 assert(VEHICLE_ORDER_SQL.includes("sourceStoreId"));
}finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
console.log(JSON.stringify({passed:checks.length,checks,productionBusinessWrites:0,productionSequenceChanges:0,realTelegramRequests:0},null,2));}
main().catch(e=>{console.error(e.name,e.code||'',e.message);process.exitCode=1;});

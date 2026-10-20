const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
async function main(){const c=await db.connect();const schema='qa_returned_vehicle';try{
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query(`CREATE SCHEMA ${schema}`);
 for(const table of ['vehicles','orders','order_vehicle_details','stores','users','staff_profiles','vehicle_location_events'])await c.query(`CREATE TABLE ${schema}.${table} (LIKE himoto.${table} INCLUDING DEFAULTS)`);
 const sql=fs.readFileSync('docs/sql/2026-10-20-returned-vehicle-availability.sql','utf8').replaceAll('himoto.',schema+'.').replaceAll("'himoto'",`'${schema}'`).replace(/^BEGIN;|^COMMIT;/gm,'');
 await c.query(sql);await c.query(sql);
 await c.query(`INSERT INTO ${schema}.stores(id,store_name) VALUES(1,'CS QA'); INSERT INTO ${schema}.vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES(1,'Wave QA','Honda','xeso',2026,1,1,'QA-RETURNED','ready',143);
 INSERT INTO ${schema}.orders(id,store_id,order_status,order_mode,contract_number,total,pid) VALUES(1,1,'wait_payment','standard','QA-OLD','100000','0'),(2,1,'renting','standard','QA-ACTIVE','100000','0');
 INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,completed_at) VALUES(1,1,1,now()-interval '3 days',now()-interval '2 days',now()-interval '1 day');`);
 const blockers=()=>c.query(`SELECT * FROM ${schema}.vehicle_rental_blockers(ARRAY[1]::bigint[])`);
 const inventory=()=>c.query(`SELECT available FROM ${schema}.vehicle_inventory() WHERE id=1`);
 const conflicts=end=>c.query(`SELECT * FROM ${schema}.vehicle_window_conflicts(ARRAY[1]::bigint[],99,now(),now()+$1::interval)`,[end]);
 assert.equal((await blockers()).rowCount,0);assert.equal((await inventory()).rows[0].available,true);assert.equal((await conflicts('1 day')).rowCount,0);
 await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES(2,2,1,now(),now()+interval '1 day')`);
 assert.equal((await blockers()).rowCount,1);assert.equal(Number((await blockers()).rows[0].order_id),2);assert.equal((await inventory()).rows[0].available,false);assert.equal((await conflicts('1 day')).rows[0].severity,'hard');
 await c.query(`UPDATE ${schema}.orders SET order_status='deposit_contract' WHERE id=2; UPDATE ${schema}.order_vehicle_details SET rent_at=now()+interval '2 days',return_at=now()+interval '3 days' WHERE id=2`);
 assert.equal((await conflicts('1 day')).rowCount,0);assert.equal((await conflicts('4 days')).rows[0].severity,'reservation_overlap');
 console.log(JSON.stringify({passed:3,checks:['Returned wait-payment lines do not block stock, picker or issue','An active rental still blocks all three paths','Future reservations retain non-overlap and overlap rules'],permanentBusinessWrites:0},null,2));
}finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

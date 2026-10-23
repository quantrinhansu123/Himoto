const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const service=load(path.join(root,'lib/server/contract-returns'));
async function main(){const c=await db.connect();try{
 await c.query('BEGIN');
 for(const table of ['orders','order_vehicle_details','vehicles','customers','stores','transactions']){
  await c.query(`CREATE TEMP TABLE ${table}(LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
 }
 const client={query:(sql,values)=>c.query(sql.replaceAll('himoto.','pg_temp.'),values)};
 await c.query(`INSERT INTO pg_temp.stores(id,store_name) VALUES(1,'CS QA');
  INSERT INTO pg_temp.customers(id,name,phone,id_card) VALUES(1,'Khách trả nhiều xe QA','0900000123','001234567890');
  INSERT INTO pg_temp.vehicles(id,name,license,store_id,current_store_id,status,brand,type,year,created_by) VALUES
   (11,'Xe A QA','29B1-123.45',1,1,'using','Honda','xeso',2025,143),
   (12,'Xe B QA','30C1-678.90',1,1,'using','Honda','xeso',2025,143),
   (13,'Xe khác QA','31D1-999.99',1,1,'using','Honda','xeso',2025,143),
   (14,'Xe đã bỏ QA','32E1-555.55',1,1,'ready','Honda','xeso',2025,143);
  INSERT INTO pg_temp.orders(id,store_id,customer_id,contract_number,order_status,total,pid) VALUES
   (101,1,1,'QA-TWO','renting','400000',400000),
   (102,1,1,'QA-OTHER','renting','200000',200000),
   (103,1,1,'QA-DELETED','renting','200000',200000);
  INSERT INTO pg_temp.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,hiring_fee,type,completed_at,deleted_at) VALUES
   (201,101,11,now()-interval '1 day',now()+interval '1 day',200000,'day',NULL,NULL),
   (202,101,12,now()-interval '1 day',now()+interval '1 day',200000,'day',NULL,NULL),
   (203,102,13,now()-interval '1 day',now()+interval '1 day',200000,'day',NULL,NULL),
   (204,103,14,now()-interval '1 day',now()+interval '1 day',200000,'day',NULL,now()),
   (205,103,13,now()-interval '1 day',now()+interval '1 day',200000,'day',NULL,NULL);`);
 const ids=async query=>(await service.searchReturnableItems(client,query)).map(row=>row.item_id).sort((a,b)=>a-b);
 for(const query of ['29B1-123.45','29b1 12345','123.45','30C1-678.90','67890','QA-TWO']){
  assert.deepEqual(await ids(query),[201,202],query);
 }
 assert.deepEqual(await ids('555.55'),[],'A removed line must not make another vehicle match');
 assert.deepEqual(await ids('999.99'),[203,205],'Separate matching contracts must remain separate');
 for(const query of ['',"%' OR 1=1 --",'_','NO-MATCH'])assert.deepEqual(await ids(query),[],query);
 const both=await service.searchReturnableItems(client,'123.45');
 assert(both.every(row=>row.total_amount===400000&&row.paid_amount===400000));
 await c.query('UPDATE pg_temp.order_vehicle_details SET completed_at=now() WHERE id=202');
 const partial=await service.searchReturnableItems(client,'123.45');
 assert.equal(partial.filter(row=>!row.completed_at).length,1);
 assert.equal(partial.filter(row=>row.completed_at).length,1);
 assert.deepEqual((await service.loadContractReturnableItems(client,101)).map(row=>row.item_id).sort((a,b)=>a-b),[201,202]);
 console.log(JSON.stringify({passed:4,checks:[
  'A full, partial or normalized plate on either bike returns both bikes of the matching contract',
  'Other contracts, removed lines and escaped wildcard input do not introduce unrelated bikes',
  'The contract total and collected rent are unchanged when expanding its vehicle list',
  'Already returned siblings remain distinguishable and direct contract lookup still returns both lines'
 ],permanentBusinessWrites:0,realSequenceChanges:0},null,2));
}finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

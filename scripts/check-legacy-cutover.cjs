const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {legacyContractReviewMessage:message}=load(path.join(root,'lib/server/contract-legacy-review'));
const payments=load(path.join(root,'lib/server/contract-payments'));
const returns=load(path.join(root,'lib/server/contract-returns'));
const deposits=load(path.join(root,'lib/server/contract-deposits'));
async function main(){
 for(const payload of [null,{},[],{legacy_migration:{requiresReview:true}},{legacy_migration:{cutover:{reviewRequired:false}}},{legacy_migration:{cutover:{reviewRequired:'true'}}}])assert.equal(message(payload),null);
 const payload={legacy_migration:{cutover:{reviewRequired:true,reasons:['source_paid_discrepancy']}}};
 assert(message(payload));let reads=0;
 const db={query:async sql=>{
  if(/^SET LOCAL/.test(sql))return {rows:[],rowCount:0};
  assert(sql.trim().startsWith('SELECT'));reads++;
  return {rows:[{id:1,order_id:1,vehicle_id:2,draft_payload:payload,total:'200000',rental_paid:null}],rowCount:1};
 }};
 await assert.rejects(payments.readPaymentContext(db,1),e=>e.status===409&&e.message===message(payload));
 await assert.rejects(returns.recordVehicleReturn(db,1,{item_id:1}),e=>e.status===409&&e.message===message(payload));
 await assert.rejects(returns.replaceContractVehicle(db,1,{item_id:1}),e=>e.status===409&&e.message===message(payload));
 assert.equal(reads,3);
 if(process.argv.includes('--live-temp')){
  require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
  const c=await load(path.join(root,'lib/server/himoto-database')).ownerDatabase.connect();
  try{
   await c.query('BEGIN');
   await c.query('CREATE TEMP TABLE orders(id bigint,pid bigint,draft_payload json) ON COMMIT DROP');
   await c.query('CREATE TEMP TABLE transactions(order_id bigint,status text,type text,name text,value bigint) ON COMMIT DROP');
   await c.query(`INSERT INTO pg_temp.orders VALUES(1,300,'{}'),(2,300,$1::json)`,[JSON.stringify(payload)]);
   await c.query(`INSERT INTO pg_temp.transactions VALUES
    (1,'approved','in','order:additional_deposit',100),(1,'approved','in','order:rental_fees',200),
    (1,'cancelled','in','order:deposit:1',700),(2,'approved','in','order:deposit',100)`);
   const sql=`SELECT o.id,${deposits.rentalPaidSql()} AS paid,dep.paid AS deposit FROM pg_temp.orders o ${deposits.depositLateral().replaceAll('himoto.','pg_temp.')} ORDER BY o.id`;
   const rows=(await c.query(sql)).rows;
   assert.equal(Number(rows[0].deposit),100);assert.equal(Number(rows[0].paid),200);
   assert.equal(rows[1].paid,null);
   assert.equal(await deposits.rentalPaid({query:(sql,values)=>c.query(sql.replaceAll('himoto.','pg_temp.'),values)},1,300),200);
   console.log('PASS: PostgreSQL preserves legacy additional deposits as deposits, excludes cancelled vouchers and leaves unverified paid balances unknown.');
   await c.query('ALTER TABLE pg_temp.orders ADD COLUMN total_rental_fees numeric');
   await c.query(`CREATE TEMP TABLE order_vehicle_details(id bigint,order_id bigint,type text,hiring_fee numeric,substitute_unit_price numeric,total_renewal_amount numeric,rent_at timestamptz,return_at timestamptz,deleted_at timestamptz) ON COMMIT DROP`);
   await c.query(`INSERT INTO pg_temp.orders(id,draft_payload) VALUES
     (3,'{"legacy_migration":{}}'),(4,'{}'),(5,'{"legacy_migration":{},"management_composer":{"installment_plan":{}}}')`);
   await c.query(`INSERT INTO pg_temp.order_vehicle_details VALUES
     (1,3,'day',420000,0,0,'2026-10-18 13:02:34+07','2026-10-21 13:02:34+07',NULL),
     (2,3,'day',875000,125000,19500000,'2026-10-01+07','2026-10-19+07',NULL),
     (3,3,'day',420000,0,420000,'2026-10-01+07','2026-10-19+07',NULL),
     (4,4,'day',140000,0,0,'2026-10-18+07','2026-10-21+07',NULL),
     (5,3,'total',3000000,3000000,0,'2026-10-18+07','2026-10-21+07',NULL),
     (6,3,'day',430000,0,0,'2026-10-18 13:00+07','2026-10-21 15:00+07',NULL),
     (7,5,'day',420000,140000,0,'2026-10-18+07','2026-10-21+07',NULL)`);
   const rates=(await c.query(`SELECT d.id,${deposits.dailyPriceSql().replaceAll('himoto.','pg_temp.')} AS rate FROM pg_temp.order_vehicle_details d JOIN pg_temp.orders o ON o.id=d.order_id ORDER BY d.id`)).rows;
   assert.deepEqual(rates.map(r=>r.rate==null?null:Number(r.rate)),[140000,125000,null,140000,null,null,null]);
   console.log('PASS: legacy period totals are not daily prices; explicit legacy rates and native rates remain valid, ambiguous renewals/hourly terms and installment plans require confirmation.');
   await c.query('CREATE TEMP TABLE stores(id bigint,store_name text) ON COMMIT DROP');
   await c.query('CREATE TEMP TABLE vehicle_location_events(id bigint,vehicle_id bigint,event_type text,from_store_id bigint,to_store_id bigint,created_by bigint,audit_snapshot jsonb,ref_type text,ref_id bigint) ON COMMIT DROP');
   await c.query(`INSERT INTO pg_temp.vehicle_location_events VALUES(1,10,'manual_transfer',1,2,143,NULL,NULL,NULL),(2,11,'manual_transfer',1,2,143,'{"reconciliation":{"superseded":true}}',NULL,NULL)`);
   const transfers=load(path.join(root,'lib/server/vehicle-transfers'));
   const query={query:(sql,values)=>c.query(sql.replaceAll('himoto.','pg_temp.'),values)};
   assert.equal(Number((await transfers.readPendingVehicleTransfer(query,10)).receivable),1);
   assert.equal(Number((await transfers.readPendingVehicleTransfer(query,11)).receivable),0);
   console.log('PASS: reconciliation voids a stale transfer request without recording receipt or weakening ordinary destination acceptance.');
  }finally{await c.query('ROLLBACK');c.release();}
 }
 console.log('PASS: unresolved source contracts reject money, return and swap operations before any write; ordinary and reviewed contracts retain their workflow.');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});

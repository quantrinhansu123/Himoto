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
  }finally{await c.query('ROLLBACK');c.release();}
 }
 console.log('PASS: unresolved source contracts reject money, return and swap operations before any write; ordinary and reviewed contracts retain their workflow.');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});

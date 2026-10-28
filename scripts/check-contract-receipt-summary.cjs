const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {summarizeContractReceipts}=load(path.join(root,'lib/management/contract-receipt-summary'));
const {readContractHistory}=load(path.join(root,'lib/server/contract-history'));
const checks=[];
const item=(id,amount,category='renewal',type='income',status_code='approved')=>({id,amount,category,type,status_code,at:'2026-10-03T11:07:44Z',note:'Cùng nội dung',status:status_code==='approved'?'Đã duyệt':'Chưa duyệt'});
async function main(){
  assert.deepEqual(summarizeContractReceipts([]),{received:0,spent:0,net:0,receipt_count:0,rental_received:0,renewal_received:0,other_received:0,rental_refunded:0,deposit_received:0,deposit_refunded:0,deposit_held:0});
  const rows=[item(1,500000,'deposit'),item(2,1500000,'rental'),...Array.from({length:13},(_,i)=>item(i+3,750000)),item(16,500000),item(17,500000)];
  const result=summarizeContractReceipts(rows);
  assert.equal(result.received,12750000);assert.equal(result.receipt_count,17);assert.equal(result.renewal_received,10750000);assert.equal(result.deposit_received,500000);assert.equal(result.rental_received,1500000);
  assert.deepEqual(summarizeContractReceipts([...rows].reverse()),result);
  checks.push('Full legacy + native receipt totals include every distinct voucher ID even when dates, notes and amounts are identical; deposits are separate');
  const settled=summarizeContractReceipts([...rows,item(18,90000000,'renewal','income','pending'),item(19,90000000,'renewal','income','cancelled'),item(20,200000,'deposit_refund','expense'),item(21,100000,'other','expense'),item(22,50000,'other')]);
  assert.equal(settled.received,12800000);assert.equal(settled.receipt_count,18);assert.equal(settled.spent,300000);assert.equal(settled.net,12500000);assert.equal(settled.deposit_held,300000);assert.equal(settled.other_received,50000);
  const rentalRefund=summarizeContractReceipts([...rows,item(23,250000,'rental_refund','expense')]);assert.equal(rentalRefund.rental_refunded,250000);assert.equal(rentalRefund.received,12750000);assert.equal(rentalRefund.deposit_held,500000);assert.equal(rentalRefund.net,12500000);
  for(const amount of [NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>summarizeContractReceipts([item(1,amount)]));
  assert.throws(()=>summarizeContractReceipts([item(1,Number.MAX_SAFE_INTEGER),item(2,1)]));
  checks.push('Pending/cancelled vouchers do not inflate totals; expenses, refunds and other income remain separate; malformed approved money fails rather than publishing a partial total');
  const calls=[];
  const fake={query:async(sql,params)=>{calls.push({sql,params});assert.match(sql,/^SELECT/);if(sql.includes('AS payment_corrections'))return{rowCount:1,rows:[{id:1,created_at:'2026-01-01'}]};if(sql.includes('FROM himoto.transactions t'))return{rows:[{id:1,order_id:1,type:'addon',name:'addon',value:'750000',status:'approved',category:'renewal',created_at:'2026-10-01'}]};return{rows:[]};}};
  const history=await readContractHistory(fake,1);assert.equal(history.receipts.received,750000);assert.equal(history.cashflow[0].status_code,'approved');assert.equal(history.cashflow[0].category,'renewal');
  assert(calls.find(row=>row.sql.includes("t.name='addon' AND t.type='addon'")));assert(calls.some(row=>row.sql.includes('WHERE t.order_id=$1')));
  checks.push('History projection returns summary and original vouchers, classifies old addons and linked native renewals, binds the contract ID and issues SELECT only');
  if(process.argv.includes('--live-temp'))await databaseChecks();
  console.log(JSON.stringify({passed:checks.length,checks,permanentBusinessWrites:0},null,2));
}
async function databaseChecks(){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const c=await load(path.join(root,'lib/server/himoto-database')).ownerDatabase.connect();
  const tables=['management_contract_payments','transactions','orders','banks','cash','users'];
  const db={query(sql,params){assert.match(sql,/^SELECT/,'History must never write');if(sql.includes('to_regclass'))return Promise.resolve({rows:[{ready:false}]});let rewritten=sql;for(const table of tables)rewritten=rewritten.replaceAll('himoto.'+table,'pg_temp.qa_crs_'+table);assert(!rewritten.includes('himoto.'),'All business reads use fixtures');return c.query(rewritten,params);}};
  try{
    await c.query('BEGIN');
    for(const table of ['orders','transactions','banks','cash']){await c.query(`CREATE TEMP TABLE qa_crs_${table} (LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);await c.query(`ALTER TABLE qa_crs_${table} ALTER COLUMN id DROP DEFAULT`);}
    await c.query(`CREATE TEMP TABLE qa_crs_users(id bigint,name text) ON COMMIT DROP;
      CREATE TEMP TABLE qa_crs_management_contract_payments(transaction_id bigint,renewal_payload jsonb) ON COMMIT DROP;
      INSERT INTO qa_crs_users VALUES(143,'QA');
      INSERT INTO qa_crs_orders(id,contract_number,order_status,store_id,total,pid,first_deposit_amount,draft_payload) VALUES(1,'QA-RECEIPTS','renting',33,'2000000',2500000,500000,'{}'),(2,'QA-FOREIGN','renting',31,'99000000',99000000,0,'{}');
      INSERT INTO qa_crs_cash(id,store_id,name,opening_balance) VALUES(1,33,'Két QA',0);
      INSERT INTO qa_crs_transactions(id,order_id,name,type,value,note,status,user_id,store_id,cash_id,payment_method,created_at)
      VALUES(1,1,'order:deposit:QA','in',500000,'Cọc QA','approved',143,33,1,1,now()),(2,1,'order:rental_fees','in',1500000,'Thuê QA','approved',143,33,1,1,now()),
      (16,1,'addon','addon',500000,'Gia hạn QA','approved',143,33,1,1,now()),(17,1,'order:payment','in',500000,'Gia hạn mới QA','approved',143,33,1,1,now()),
      (18,1,'addon','addon',99000000,'Chờ duyệt QA','pending',143,33,1,1,now()),(19,1,'addon','addon',99000000,'Đã hủy QA','cancelled',143,33,1,1,now()),
      (20,2,'addon','addon',99000000,'Cơ sở khác QA','approved',143,31,1,1,now());
      INSERT INTO qa_crs_transactions(id,order_id,name,type,value,note,status,user_id,store_id,cash_id,payment_method,created_at)
      SELECT n,1,'addon','addon',750000,'Nội dung trùng QA','approved',143,33,1,1,'2026-10-03T11:07:44Z' FROM generate_series(3,15) n;
      INSERT INTO qa_crs_management_contract_payments VALUES(17,'{"version":2,"license":"QA-1","return_at":"2026-11-02"}');`);
    const before=(await c.query('SELECT row_to_json(o) AS data FROM qa_crs_orders o ORDER BY id')).rows;
    const history=await readContractHistory(db,1);
    assert.equal(history.cashflow.length,19);assert.equal(history.receipts.receipt_count,17);assert.equal(history.receipts.received,12750000);assert.equal(history.receipts.renewal_received,10750000);assert.equal(history.receipts.rental_received,1500000);assert.equal(history.receipts.deposit_held,500000);
    assert.equal(history.cashflow.filter(row=>row.reason==='Thu tiền gia hạn'&&row.status_code==='approved').length,15);
    assert.deepEqual((await c.query('SELECT row_to_json(o) AS data FROM qa_crs_orders o ORDER BY id')).rows,before);
    checks.push('TEMP SQL: seventeen approved receipts total 12.75m including 10.75m renewals, 0.5m deposit and 1.5m rental; old header remains 2m and foreign/pending/cancelled receipts are not included');
    await c.query("INSERT INTO qa_crs_transactions(id,order_id,name,type,value,note,status,user_id,store_id,cash_id,payment_method,created_at) VALUES(21,1,'order:deposit_refund','out',200000,'Hoàn cọc QA','approved',143,33,1,1,now())");
    const returned=await readContractHistory(db,1);assert.equal(returned.receipts.received,12750000);assert.equal(returned.receipts.spent,200000);assert.equal(returned.receipts.deposit_held,300000);assert.equal(returned.receipts.net,12550000);
    for(const table of ['orders','transactions']){await c.query(`ALTER TABLE qa_crs_${table} ENABLE ROW LEVEL SECURITY`);await c.query(`CREATE POLICY qa_crs_branch ON qa_crs_${table} USING(store_id::text=current_setting('himoto.store_id',true))`);}
    const schema=(await c.query('SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema()')).rows[0].nspname;assert.match(schema,/^pg_temp_\d+$/);await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped`);for(const table of tables)await c.query(`GRANT SELECT ON qa_crs_${table} TO himoto_scoped`);
    await c.query("SELECT set_config('himoto.store_id','31',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    await assert.rejects(()=>readContractHistory(db,1),e=>e.status===404);
    await c.query("SELECT set_config('himoto.store_id','33',true)");assert.equal((await readContractHistory(db,1)).receipts.received,12750000);await c.query('RESET ROLE');
    checks.push('TEMP SQL/RLS: refund updates net/held deposit without reducing gross income, own branch sees full history and other branch remains blocked');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

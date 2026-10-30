const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {bulkDelete}=load(path.join(root,'lib/server/bulk-delete'));
const checks=[];

async function main(){
  // Exercise the real mutation against disposable tables; never alter live orders.
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const c=await load(path.join(root,'lib/server/himoto-database')).ownerDatabase.connect();
  const tables=['management_contract_payments','transactions','orders'];
  const db={query(sql,params){
    if(sql.includes('to_regclass'))return Promise.resolve({rows:[{present:true}]});
    let rewritten=sql;
    for(const table of tables)rewritten=rewritten.replaceAll('himoto.'+table,'pg_temp.qa_delete_'+table);
    assert(!rewritten.includes('himoto.'),'All business SQL must use TEMP fixtures');
    return c.query(rewritten,params);
  }};
  const snapshot=async()=>({
    orders:(await c.query('SELECT * FROM qa_delete_orders ORDER BY id')).rows,
    transactions:(await c.query('SELECT * FROM qa_delete_transactions ORDER BY id')).rows,
    payments:(await c.query('SELECT * FROM qa_delete_management_contract_payments ORDER BY transaction_id')).rows,
  });
  async function reset(){
    await c.query('TRUNCATE qa_delete_management_contract_payments,qa_delete_transactions,qa_delete_orders');
    await c.query("INSERT INTO qa_delete_orders VALUES(1,33,3000000,2000000,now()),(2,31,9000000,9000000,now())");
  }
  async function receipt(id,status,name='order:renewal',type='in',amount=900000,order=1){
    await c.query('INSERT INTO qa_delete_transactions(id,order_id,store_id,status,name,type,value) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,order,order===1?33:31,status,name,type,amount]);
    await c.query('INSERT INTO qa_delete_management_contract_payments VALUES($1,$2)',[id,order]);
  }
  try{
    await c.query('BEGIN');
    await c.query(`CREATE TEMP TABLE qa_delete_orders(id bigint PRIMARY KEY,store_id bigint,total text,pid bigint,updated_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE qa_delete_transactions(id bigint PRIMARY KEY,order_id bigint,store_id bigint,status text,name text,type text,value bigint,object_type text,object_id bigint) ON COMMIT DROP;
      CREATE TEMP TABLE qa_delete_management_contract_payments(transaction_id bigint PRIMARY KEY,order_id bigint) ON COMMIT DROP`);
    for(const status of ['cancelled','pending','rejected']){
      await reset();await receipt(1,status);
      const before=(await snapshot()).orders;
      assert.deepEqual(await bulkDelete(db,'transactions',[1]),[1]);
      assert.deepEqual((await snapshot()).orders,before,`Deleting ${status} receipt must not change paid, total or order revision`);
      assert.equal((await snapshot()).payments.length,0);
    }
    checks.push('Cancelled, pending and rejected vouchers can be removed without deducting money or touching the order');
    await reset();
    await receipt(1,'approved','order:extra','in',400000);
    await receipt(2,'cancelled');
    await receipt(3,'pending','order:renewal','in',200000);
    await receipt(4,'approved','order:outside','in',500000);
    await receipt(5,'approved','order:rental_refund','out',100000);
    await receipt(6,'approved','addon','addon',200000);
    await receipt(7,'approved','order:payment','in',50000,2);
    await bulkDelete(db,'transactions',[1,2,3,4,5,6]);
    const mixed=await snapshot();
    assert.equal(mixed.orders[0].pid,'1500000');assert.equal(mixed.orders[0].total,'2600000');
    assert.equal(mixed.orders[1].pid,'9000000');assert.equal(mixed.transactions.length,1);assert.equal(mixed.payments.length,1);
    checks.push('Mixed batch deducts only approved collections/charges, reverses approved rental refunds and excludes outside collections and foreign orders');
    await reset();await receipt(1,'approved');
    const beforeFailure=await snapshot();
    await c.query('SAVEPOINT qa_failure');
    const failing={query(sql,params){if(sql.startsWith('DELETE FROM himoto.transactions'))throw new Error('QA final delete failed');return db.query(sql,params);}};
    await assert.rejects(()=>bulkDelete(failing,'transactions',[1]),/QA final delete failed/);
    await c.query('ROLLBACK TO SAVEPOINT qa_failure');
    assert.deepEqual(await snapshot(),beforeFailure);
    await assert.rejects(()=>bulkDelete(db,'transactions',[1,99]),error=>error.status===409);
    assert.deepEqual(await snapshot(),beforeFailure);
    checks.push('Final-delete failure rolls back totals and payment links; a missing selected voucher rejects the whole batch');
    await receipt(2,'approved','order:payment','in',50000,2);
    for(const table of ['orders','transactions','management_contract_payments']){
      await c.query(`ALTER TABLE qa_delete_${table} ENABLE ROW LEVEL SECURITY`);
      await c.query(`CREATE POLICY qa_delete_branch ON qa_delete_${table} USING(${table==='management_contract_payments'?'order_id IN (SELECT id FROM qa_delete_orders WHERE store_id::text=current_setting(\'himoto.store_id\',true))':"store_id::text=current_setting('himoto.store_id',true)"})`);
    }
    const schema=(await c.query('SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema()')).rows[0].nspname;
    assert.match(schema,/^pg_temp_\d+$/);
    await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped`);
    for(const table of tables)await c.query(`GRANT SELECT,UPDATE,DELETE ON qa_delete_${table} TO himoto_scoped`);
    await c.query("SELECT set_config('himoto.store_id','31',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    await assert.rejects(()=>bulkDelete(db,'transactions',[1,2]),error=>error.status===409);
    await c.query('RESET ROLE');
    assert.equal((await snapshot()).transactions.length,2);
    checks.push('RLS rejects a mixed-branch batch before any deletion');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
  console.log(JSON.stringify({passed:checks.length,checks,permanentBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

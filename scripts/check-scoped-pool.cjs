const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {dataAccess,withCrossStoreOperation}=load(path.join(root,'lib/server/access-context'));
const {himotoPool,ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const scopes=[{id:151,store_id:23},{id:152,store_id:31}].map(row=>({...row,scope_all:false,operation:'',access_role:'branch_staff',permissions:[]}));
const checks=[];
async function main(){try{
  await Promise.all(Array.from({length:16},(_,i)=>{const scope=scopes[i%2];return dataAccess.run(scope,async()=>{
    const rows=(await himotoPool.query('SELECT id::int FROM himoto.stores ORDER BY id')).rows;assert.deepEqual(rows,[{id:scope.store_id}]);
  });}));checks.push('Concurrent branches remain isolated through the real Supabase transaction pool (read-only)');
  await dataAccess.run(scopes[0],async()=>{const c=await himotoPool.connect();try{
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal((await c.query('SELECT current_user AS role')).rows[0].role,'himoto_scoped');
    await c.query('SAVEPOINT qa');await assert.rejects(c.query('SELECT 1/0'),e=>e.code==='22012');await c.query('ROLLBACK TO SAVEPOINT qa');
    assert.deepEqual((await c.query('SELECT id::int FROM himoto.stores')).rows,[{id:23}]);await c.query('COMMIT');
    // A caller querying again after COMMIT must be scoped again, never inherit owner access.
    assert.deepEqual((await c.query('SELECT id::int FROM himoto.stores')).rows,[{id:23}]);
    await assert.rejects(c.query('SELECT 1/0'),e=>e.code==='22012');
    assert.deepEqual((await c.query('SELECT id::int FROM himoto.stores')).rows,[{id:23}]);
  }finally{c.release();}});checks.push('Explicit transactions, savepoint recovery, post-COMMIT reads and failed implicit queries retain scope');
  const operationScope={...scopes[0],scope_all_operations:true,permissions:['customers.write']};
  await dataAccess.run(operationScope,async()=>{
    await withCrossStoreOperation('customers.write',async()=>{
      assert.equal(dataAccess.getStore().scope_all,false);
      const c=await himotoPool.connect();try{
        await c.query('BEGIN READ ONLY');
        const { rows }=await c.query("SELECT current_user AS role,current_setting('himoto.scope_all',true) AS all_stores, EXISTS(SELECT 1 FROM himoto.stores WHERE id<>$1) AS another_store", [operationScope.store_id]);
        assert.deepEqual(rows,[{role:'himoto_scoped',all_stores:'true',another_store:true}]);
      }finally{await c.query('ROLLBACK');c.release();}
    });
    await withCrossStoreOperation('finance.write',async()=>{
      assert.deepEqual((await himotoPool.query('SELECT id::int FROM himoto.stores ORDER BY id')).rows,[{id:operationScope.store_id}]);
    });
  });
  checks.push('An explicitly granted operation reaches other PGDs with scoped DB role and its scope ends when the callback completes');
  const owner=(await ownerDatabase.query("SELECT current_user AS role,current_setting('himoto.store_id',true) AS scope")).rows[0];assert.equal(owner.role,'postgres');assert(!owner.scope);
  checks.push('Scope and role are local to a transaction and never leak into the owner/authentication connection');
  console.log(JSON.stringify({passed:checks.length,checks,operationalWrites:0},null,2));
}finally{await globalThis.himotoPool?.end();}}
main().catch(e=>{console.error(e);process.exitCode=1});

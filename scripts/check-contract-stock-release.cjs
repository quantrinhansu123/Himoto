const assert=require('node:assert/strict');
const path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {releaseCompletedContractVehicles}=load(path.join(root,'lib/server/contract-stock-release'));

(async()=>{
  const calls=[];
  const db={query:async(sql,values)=>{
    calls.push({sql,values});
    return {rows:calls.length===1?[{id:11,vehicle_id:7},{id:12,vehicle_id:8}]:[]};
  }};
  await releaseCompletedContractVehicles(db,3);
  assert.match(calls[0].sql,/o.order_status='completed'/);
  assert.match(calls[0].sql,/COALESCE\(d.completed_at,now\(\)\)/);
  assert.deepEqual(calls[0].values,[3]);
  assert.deepEqual(calls[1].values,[[7,8]]);
  assert.match(calls[1].sql,/NOT EXISTS/);
  assert.match(calls[1].sql,/deposit_contract/);
  assert.match(calls[1].sql,/status='ready'/);
  calls.length=0;
  await dataAccess.run({id:1,access_role:'branch_staff',store_id:2,scope_all:false,permissions:[]},()=>releaseCompletedContractVehicles(db,3));
  assert.equal(calls.length,3);
  assert.match(calls[1].sql,/release_returned_contract_vehicle/);
  assert.deepEqual(calls.slice(1).map(call=>call.values),[[11],[12]]);
  console.log('Contract closing releases stock for both database modes; preserves prior return timestamps and guards other open rentals.');
})().catch(error=>{console.error(error);process.exitCode=1;});

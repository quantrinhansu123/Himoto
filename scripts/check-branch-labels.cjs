const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
const checks=[];
const contract=mapApiRow('contracts',{id:1,status:'renting',customer_name:'Khách QA',store_name:'CS Láng',
  vehicles:[{id:9,license:'29B1-1',owner_store_id:32,owner_store_name:'CS Nguyễn Hoàng',warehouse_store_id:32,warehouse_store_name:'CS Nguyễn Hoàng'}]});
assert.equal(contract.store_name,'CS Láng');
assert.equal(contract.owner_store_name,'CS Nguyễn Hoàng');
assert.equal(contract.warehouse_store_name,'CS Nguyễn Hoàng');
const vehicle=mapApiRow('vehicles',{id:2,status:'ready',license:'QA-2',store_name:'CS hiện tại',owner_store_name:'CS sở hữu',store_id:31,current_store_id:32,
  beneficiary_store_id:31,beneficiary_store_name:'CS Láng'});
assert.equal(vehicle.owner_store_id,31);
assert.equal(vehicle.owner_store_name,'CS sở hữu');
assert.equal(vehicle.store_id,32);
assert.equal(vehicle.store_name,'CS hiện tại');
const source=require('node:fs').readFileSync(path.join(root,'components/management/ContractBranches.tsx'),'utf8');
assert.match(source,/Nguồn: \{/);
assert.match(source,/Sở hữu: \{/);
assert.doesNotMatch(source,/Kho xe:/);
const table=require('node:fs').readFileSync(path.join(root,'components/management/DataTable.tsx'),'utf8');
assert.match(table,/column\.key==='license'[\s\S]*VehicleOwnerBranch/);
assert.match(table,/column\.key==='customer_name'\?\<ContractBranches/);
assert.match(table,/column\.key\s*===\s*'name'[\s\S]*ContractBranches/);
assert.match(table,/column\.key==='vehicle_name'&&\<VehicleOwnerBranch/);
checks.push('Vehicle name shows customer source; plate shows ownership; customer/source columns stay hidden by default');
console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));

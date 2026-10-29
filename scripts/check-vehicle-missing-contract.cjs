const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {vehicleMissingOpenContract,vehicleHolderLabel}=load(path.join(root,'lib/management/vehicle-holder'));
const {filterRows,EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const {projectManagementTable}=load(path.join(root,'lib/management/management-table'));
const checks=[];
assert.equal(vehicleMissingOpenContract({status:'using',rentals_json:'[]'}),true);
assert.equal(vehicleMissingOpenContract({status:'rent',rentals_json:''}),true);
assert.equal(vehicleMissingOpenContract({status:'using',rentals_json:'[{"order_id":1}]'}),false);
assert.equal(vehicleMissingOpenContract({status:'ready',rentals_json:'[]'}),false);
assert.equal(vehicleMissingOpenContract({status:'using',rentals_json:'{bad'}),true);
assert.equal(vehicleHolderLabel('using',''),'Chưa xác định khách');
const vehicles=[
  {id:1,status:'using',rentals_json:'[]',store_id:1},
  {id:2,status:'using',rentals_json:'[{"order_id":9}]',store_id:1},
  {id:3,status:'ready',rentals_json:'[]',store_id:1},
];
assert.deepEqual(filterRows(vehicles,{...EMPTY_QUERY,filters:{missing_contract:'1'}},'all').map(row=>row.id),[1]);
const projected=projectManagementTable(vehicles,{kind:'vehicles',query:EMPTY_QUERY,store:'all',scope:'',page:1,size:10,sort:'code',direction:'asc'},true);
assert.equal(projected.missingOpenContractCount,1);
checks.push('Đang thuê without open rentals is flagged; ready and rented vehicles stay quiet; list exposes missing-open-contract count and filter');
console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));

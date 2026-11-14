const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./check-contract-payments.cjs');
const { contractSwapCandidates, swapStockLabel } = load(path.resolve('src/lib/management/contract-swap-candidates'));
const { mapApiRow } = load(path.resolve('src/lib/management/repository'));
const stores = [
  { id:34, name:'CS Hàng Bút', kind:'physical', code:'HB', status:'active' },
  { id:31, name:'Trụ Sở Chính', kind:'headquarters', code:'HQ', status:'active' },
  { id:7, name:'CS Thuê sở hữu', kind:'lease_to_own', code:'TSH', status:'active' },
];
const vehicle = (id, patch={}) => mapApiRow('vehicles',{id,name:'VISION',license:`QA-${id}`,status:'ready',store_id:34,store_name:'CS Hàng Bút',rental_blockers:[],...patch});
const wanted = vehicle(641,{license:'17B5-185.33'});
const inventory = [wanted,vehicle(1),vehicle(2,{store_id:31,store_name:'Trụ Sở Chính'}),vehicle(3,{store_id:7,store_name:'CS Thuê sở hữu'}),vehicle(4,{status:'using'}),vehicle(5,{status:'in_transit'}),vehicle(6,{rental_blockers:[{order_id:999,status:'renting'}]}),vehicle(8,{draft_rentals:[{order_id:998,status:'draft'}]})];
const contract = {vehicle_id:1,store_id:34,store_name:'CS Hàng Bút',rental_type:'daily'};
assert.deepEqual(contractSwapCandidates(contract,inventory,stores).map(v=>v.id),[641,8]);
assert.equal(swapStockLabel(contract),'CS Hàng Bút');
assert.deepEqual(contractSwapCandidates({...contract,rental_type:'monthly'},inventory,stores).map(v=>v.id),[641,8]);
assert.deepEqual(contractSwapCandidates({...contract,rental_type:'ownership'},inventory,stores).map(v=>v.id),[3]);
assert.equal(swapStockLabel({...contract,rental_type:'ownership'}),'kho Thuê sở hữu');
assert.equal(contractSwapCandidates(contract,[],stores).length,0);
assert.equal(contractSwapCandidates(contract,[{...wanted,rentals_json:'not-json'}],stores).length,0);
assert.equal(contractSwapCandidates(contract,[{...wanted,rentals_json:'null'}],stores).length,0);
assert.equal(contractSwapCandidates({...contract,rental_type:'ownership'},[wanted],stores).length,0);
assert.deepEqual(contractSwapCandidates(contract,[{...wanted,rentals_json:JSON.stringify([{order_id:998,status:'draft'}])}],stores).map(v=>v.id),[641]);
assert.equal(contractSwapCandidates(contract,[{...wanted,rentals_json:JSON.stringify([{order_id:999,status:'deposit_contract'}])}],stores).length,0);
console.log('PASS: daily same-store 17B5-185.33 is selectable from fresh inventory without provider vehicle cache; draft-only soft holds stay visible for picker warnings; other branches/HQ, current/rented/transit/reserved vehicles stay excluded; ownership candidates and scope labels match server policy');

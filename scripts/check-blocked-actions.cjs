const assert = require('node:assert/strict');
const path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const {
  contractReturnBlockReason,
  contractRenewBlockReason,
  contractHandoverBlockReason,
  vehicleTransferBlockReason,
  vehicleReceiveBlockReason,
} = load(path.join(root, 'lib/management/blocked-actions'));
const checks = [];
assert.equal(contractReturnBlockReason('renting'), null);
assert.equal(contractReturnBlockReason('overdue'), null);
assert.match(contractReturnBlockReason('completed'), /đã hoàn thành/i);
assert.match(contractReturnBlockReason('deposit_contract'), /Giao xe/);
assert.match(contractRenewBlockReason('renting', true), /lịch đóng tiền/);
assert.equal(contractRenewBlockReason('renting', false), null);
assert.equal(contractHandoverBlockReason('deposit_contract'), null);
assert.match(contractHandoverBlockReason('completed'), /đã hoàn thành/i);
assert.match(vehicleTransferBlockReason({
  selected: true, status: 'ready',
  rentals: [{ code: '011253', customer: 'Bùi Minh Triết', status: 'renting' }],
  sameDestination: false,
}), /011253.*Bùi Minh Triết/i);
assert.match(vehicleTransferBlockReason({
  selected: true, status: 'using', rentals: [], sameDestination: false,
}), /Lưu kho/i);
assert.match(vehicleTransferBlockReason({
  selected: true, status: 'ready', rentals: [], sameDestination: true, storeName: 'CS Nguyễn Hoàng',
}), /CS Nguyễn Hoàng/);
assert.equal(vehicleTransferBlockReason({
  selected: true, status: 'ready', rentals: [], sameDestination: false,
}), null);
assert.match(vehicleReceiveBlockReason('receive', true), /chờ nhận|Làm mới/i);
assert.equal(vehicleReceiveBlockReason('receive', false), null);
checks.push('Blocked contract and vehicle transfer actions expose concrete Vietnamese reasons');
console.log(JSON.stringify({ passed: checks.length, checks, realBusinessWrites: 0 }, null, 2));

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
assert.equal(vehicleTransferBlockReason({
  selected: true, status: 'ready',
  rentals: [{ code: '011253', customer: 'Bùi Minh Triết', status: 'renting' }],
  sameDestination: false,
}), null);
assert.equal(vehicleTransferBlockReason({
  selected: true, status: 'using',
  rentals: [{ code: 'VPS-1', customer: 'Khách thuê', status: 'renting' }],
  sameDestination: false,
}), null);
assert.match(vehicleTransferBlockReason({
  selected: true, status: 'sold', rentals: [], sameDestination: false,
}), /đã bán/i);
assert.match(vehicleTransferBlockReason({
  selected: true, status: 'in_transit', rentals: [], sameDestination: false,
}), /Chờ luân chuyển/i);
assert.match(vehicleTransferBlockReason({
  selected: true, status: 'ready', rentals: [], sameDestination: true, storeName: 'CS Nguyễn Hoàng',
}), /CS Nguyễn Hoàng/);
assert.equal(vehicleTransferBlockReason({
  selected: true, status: 'ready', rentals: [], sameDestination: false,
}), null);
assert.equal(vehicleTransferBlockReason({
  selected: true, status: 'ready',
  rentals: [{ code: 'NHAP-1', customer: 'Khách nháp', status: 'draft' }],
  sameDestination: false,
}), null);
assert.equal(vehicleTransferBlockReason({
  selected: true, status: 'ready',
  rentals: [{ code: 'COC-1', customer: 'Khách cọc', status: 'deposit_contract' }],
  sameDestination: false,
}), null);
assert.match(vehicleReceiveBlockReason('receive', true), /chờ nhận|Làm mới/i);
assert.equal(vehicleReceiveBlockReason('receive', false), null);
const { classifyReservationWindow } = load(path.join(root, 'lib/management/vehicle-reservation-window'));
const draftWarn = classifyReservationWindow(
  [{ order_id: 9, code: 'NHAP-9', status: 'draft', customer: 'Khách nháp', rent_at: '2026-11-05T09:00' }],
  '2026-10-30T08:00', '2026-11-01T08:00',
);
assert.equal(draftWarn.kind, 'overlap_warn');
assert.match(draftWarn.detail, /hợp đồng nháp.*NHAP-9/i);
assert.match(draftWarn.detail, /khách lấy xe/i);
assert.match(draftWarn.detail, /Lưu kho/i);
checks.push('Transfer stays open with active rentals; only in-transit, sold, and same-destination stay blocked with concrete Vietnamese reasons');
console.log(JSON.stringify({ passed: checks.length, checks, realBusinessWrites: 0 }, null, 2));

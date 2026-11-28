const assert = require('node:assert/strict');
const path = require('node:path');
const {load} = require('./lib/load-typescript.cjs');
const {unexplainedShiftStock} = load(path.resolve('shared/shift-stock-check'));
const missing = [{id: 1, license: '29E2-662.29', name: ''}, {id: 2, license: '89AB-588.74', name: ''}];
assert.deepEqual(unexplainedShiftStock(missing, [{plate: '29E2-662.29,', reason: 'Chú Thức đi'}, {plate: '89AB-588.74', reason: 'Nhà cô Thủy'}]), []);
assert.deepEqual(unexplainedShiftStock(missing, [{plate: '29E2-662.29', reason: '  '}, {plate: '00AA-000.00', reason: 'Sửa xe'}]), missing);
assert.deepEqual(unexplainedShiftStock(missing, [{plate: '29E2-662.29', reason: 'Sửa xe'}]), [missing[1]]);
console.log('Shift stock explanations verified.');

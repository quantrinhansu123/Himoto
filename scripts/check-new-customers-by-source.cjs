const assert = require('node:assert/strict');
const path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const { filterNewCustomersBySource } = load(path.join(root, 'lib/management/new-customers-by-source'));

const report = {
  rows: [
    { customer_id: 1, customer_name: 'An', phone: '0901111222', id_card: '001', customer_source: 'TLS', store_id: 1, store_name: 'Láng', started_on: '2026-11-01', order_id: 10, contract_code: 'VPS-1', contract_status: 'renting' },
    { customer_id: 2, customer_name: 'Bình', phone: '0903333444', id_card: '002', customer_source: '', store_id: 1, store_name: 'Láng', started_on: '2026-11-02', order_id: 11, contract_code: 'VPS-2', contract_status: 'renting' },
    { customer_id: 3, customer_name: 'Chi', phone: '0915555666', id_card: '003', customer_source: 'Facebook', store_id: 2, store_name: 'NH', started_on: '2026-11-03', order_id: 12, contract_code: 'VPS-3', contract_status: 'completed' },
  ],
  totals: { customers: 3, with_source: 2, without_source: 1 },
  sources: [{ name: 'TLS', customers: 1 }, { name: 'Facebook', customers: 1 }],
};

const bySource = filterNewCustomersBySource(report, { search: '', source: 'TLS', sourcePresence: '' });
assert.equal(bySource.totals.customers, 1);
assert.equal(bySource.rows[0].customer_name, 'An');

const without = filterNewCustomersBySource(report, { search: '', source: '', sourcePresence: 'without' });
assert.equal(without.totals.customers, 1);
assert.equal(without.totals.without_source, 1);

const search = filterNewCustomersBySource(report, { search: '0915', source: '', sourcePresence: '' });
assert.equal(search.totals.customers, 1);
assert.equal(search.rows[0].customer_name, 'Chi');

console.log(JSON.stringify({ passed: 3, checks: ['source filter', 'missing source filter', 'phone search'] }, null, 2));

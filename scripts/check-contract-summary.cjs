const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const sourceRoot = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => name.startsWith('@/') ? load(path.join(sourceRoot, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(localRequire, module, module.exports);
  return module.exports;
}
const { summarizeContracts } = load(path.join(sourceRoot, 'lib/management/contract-summary'));
const { filterRows, sortRows, EMPTY_QUERY } = load(path.join(sourceRoot, 'lib/management/table-utils'));
const { mapApiRow } = load(path.join(sourceRoot, 'lib/management/repository'));
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };
const contract = (id, patch = {}) => ({ id, code: `QA-${id}`, name: `QA-${id}`, status: 'renting', customer_id: 1, store_id: 23, rental_type: 'monthly', customer_name: 'Đặng QA', start_date: '2026-10-08', total_amount: 1000, paid_amount: 300, ...patch });
const customers = [{ id: 1, code: 'QA-1', name: 'QA', status: 'blacklist' }, { id: 2, code: 'QA-2', name: 'QA', status: 'warning' }];

check('empty filtered results show five zero values', () => {
  assert.deepEqual(summarizeContracts([], customers), { contractCount: 0, blacklistCount: 0, totalAmount: 0, receivableAmount: 0, badDebtAmount: 0 });
});
check('blacklist counts unique linked customers, independently of contract debt status', () => {
  const rows = [contract(1), contract(2, { status: 'completed' }), contract(3, { customer_id: 2, status: 'bad_debt' }), contract(4, { customer_id: undefined })];
  assert.equal(summarizeContracts(rows, customers).blacklistCount, 1);
  assert.equal(summarizeContracts([rows[2], rows[3]], customers).blacklistCount, 0);
  assert.equal(summarizeContracts([contract(1)], []).blacklistCount, 0);
});
check('only unfinished receivables count; overpayments cannot offset another contract debt', () => {
  const rows = [contract(1), contract(2, { status: 'overdue', paid_amount: 1500 }), contract(3, { status: 'wait_payment', paid_amount: 900 }), contract(4, { status: 'bad_debt', paid_amount: 200 }), contract(5, { status: 'completed' }), contract(6, { status: 'pending' }), contract(7, { status: 'deposit_contract' }), contract(8, { status: 'cancel_pending_settlement' })];
  const summary = summarizeContracts(rows, customers);
  assert.equal(summary.totalAmount, 8000); assert.equal(summary.receivableAmount, 1600); assert.equal(summary.badDebtAmount, 800);
  assert.equal(summarizeContracts([rows[1]], customers).badDebtAmount, 0);
});
check('draft snapshots and cancelled contracts remain in count but never add financial amounts', () => {
  const rows = [contract(1), contract(2, { status: 'draft', total_amount: 900000, paid_amount: undefined }), contract(3, { status: 'cancelled', total_amount: 700000, paid_amount: 0 })];
  assert.deepEqual(summarizeContracts(rows, customers), { contractCount: 3, blacklistCount: 1, totalAmount: 1000, receivableAmount: 700, badDebtAmount: 0 });
});
check('missing or malformed money stays unknown without claiming a partial aggregate is complete', () => {
  for (const missing of [undefined, '', ' ', 'invalid', Infinity, NaN]) {
    let summary = summarizeContracts([contract(1), contract(2, { total_amount: missing })], customers);
    assert.equal(summary.totalAmount, null); assert.equal(summary.receivableAmount, null); assert.equal(summary.badDebtAmount, 0);
    summary = summarizeContracts([contract(1), contract(2, { status: 'bad_debt', paid_amount: missing })], customers);
    assert.equal(summary.totalAmount, 2000); assert.equal(summary.receivableAmount, null); assert.equal(summary.badDebtAmount, null);
  }
  assert.equal(summarizeContracts([contract(1, { status: 'completed', paid_amount: undefined })], customers).receivableAmount, 0);
  assert.equal(summarizeContracts([contract(1, { total_amount: 0, paid_amount: 0 })], customers).receivableAmount, 0);
});
check('all table filters combine before aggregation, with inclusive dates and customer ID', () => {
  const rows = [contract(1), contract(2, { store_id: 31 }), contract(3, { status: 'bad_debt' }), contract(4, { rental_type: 'daily' }), contract(5, { customer_name: 'Khách khác' }), contract(6, { start_date: '2026-10-09' }), contract(7, { start_date: '' }), contract(8, { customer_id: 2 })];
  const query = { ...EMPTY_QUERY, search: 'dang qa', status: 'renting', filters: { rental_type: 'monthly', customer_id: '1' }, startDate: '2026-10-08', endDate: '2026-10-08' };
  const filtered = filterRows(rows, query, '23');
  assert.deepEqual(filtered.map(row => row.id), [1]);
  assert.equal(summarizeContracts(filtered, customers).receivableAmount, 700);
  assert.equal(summarizeContracts(filterRows(rows, { ...query, search: 'no match' }, '23'), customers).contractCount, 0);
});
check('multi-page aggregates are independent of sort order; multiple vehicles do not multiply contracts', () => {
  const rows = Array.from({ length: 27 }, (_, index) => contract(index + 1, { license: 'QA-A, QA-B' }));
  const summary = summarizeContracts(rows, customers);
  assert.equal(summary.contractCount, 27); assert.equal(summary.totalAmount, 27000); assert.equal(summary.receivableAmount, 18900);
  assert.deepEqual(summarizeContracts(sortRows(rows, 'code', 'desc'), customers), summary);
});
check('API numeric money and customer statuses map consistently; draft source money stays excluded', () => {
  const customer = mapApiRow('customers', { id: 1, status: 'bad_debt' });
  const row = mapApiRow('contracts', { id: 1, status: 'bad_debt', customer_id: 1, total_amount: '1000', paid_amount: '300', vehicles: [{ id: 1 }, { id: 2 }] });
  assert.deepEqual(summarizeContracts([row], [customer]), { contractCount: 1, blacklistCount: 1, totalAmount: 1000, receivableAmount: 700, badDebtAmount: 700 });
  const draft = mapApiRow('contracts', { id: 2, status: 'draft', total_amount: 0, paid_amount: 0, draft_payload: { management_composer: { version: 1, draft: { customer: {}, vehicles: [], total_amount: '900000', paid_amount: '100' } } } });
  assert.equal(draft.total_amount, 900000);
  assert.equal(summarizeContracts([draft], []).totalAmount, 0);
  assert.equal(summarizeContracts([contract(1, { status: 'future' })], customers).badDebtAmount, 0);
});
console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));

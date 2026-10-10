const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
function load(filename) {
  const resolved = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const module = { exports: {} }; cache.set(resolved, module);
  const js = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(resolved), name)) : require(name);
  new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
  return module.exports;
}
const row = (id, name = 'QA') => ({ id, code: `QA-${id}`, name, status: 'active' });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

async function run() {
  const checks = [];
  const { createManagementDataLoader, managementKindsForPath } = load(path.join(root, 'lib/management/data-loader'));
  const { createApiRepository, mapApiRow } = load(path.join(root, 'lib/management/repository'));
  const { summarizeContracts } = load(path.join(root, 'lib/management/contract-summary'));
  const { createContractDraft } = load(path.join(root, 'lib/management/contract-document'));
  const { loadCustomerContracts } = load(path.join(root, 'lib/management/contract-history'));
  for (const route of ['/vehicles', '/customers', '/staff', '/contracts', '/contracts/drafts', '/contracts/vat', '/stores', '/duty-roster', '/cashbook']) {
    const kinds = managementKindsForPath(route);
    assert(kinds.includes('stores'));
    assert(!kinds.includes('contracts') || route.startsWith('/contracts'));
    assert(!kinds.includes('vehicles') || route === '/vehicles');
    assert(!kinds.includes('customers') || route === '/customers');
  }
  checks.push('page dependencies exclude unrelated collections, including cashbook and contract subpages');
  let clock = 1000;
  const calls = [];
  const loader = createManagementDataLoader({ loadKind: async kind => { calls.push(kind); return [row(1, kind)]; } }, () => clock);
  await Promise.all([loader.ensure(['stores', 'vehicles']), loader.ensure(['vehicles', 'stores'])]);
  assert.deepEqual(calls.sort(), ['stores', 'vehicles']);
  assert.equal(loader.getSnapshot().dataset.customers.length, 0);
  await loader.ensure(['stores', 'vehicles']);
  assert.equal(calls.length, 2);
  await loader.ensure(['stores', 'customers']);
  assert.deepEqual(calls, ['stores', 'vehicles', 'customers']);
  checks.push('concurrent requests are coalesced; fresh collections are reused when switching pages');
  const previous = loader.getSnapshot().dataset;
  await loader.ensure(['customers'], true);
  assert.equal(calls.at(-1), 'customers');
  assert.strictEqual(loader.getSnapshot().dataset.vehicles, previous.vehicles);
  assert.strictEqual(loader.getSnapshot().dataset.stores, previous.stores);
  checks.push('explicit refresh fetches only the requested collection and preserves other array references');
  clock += 30_001;
  await loader.ensure(['vehicles']);
  assert.equal(calls.at(-1), 'vehicles');
  loader.invalidate(['vehicles']);
  await loader.ensure(['vehicles']);
  assert.equal(calls.filter(kind => kind === 'vehicles').length, 3);
  checks.push('expired and invalidated collections refresh on demand');
  let emptyCalls = 0;
  const empty = createManagementDataLoader({ loadKind: async () => { emptyCalls++; return []; } }, () => clock);
  await empty.ensure(['customers']); await empty.ensure(['customers']);
  assert.equal(emptyCalls, 1); assert.equal(empty.getSnapshot().resources.customers.loaded, true);
  checks.push('an empty collection is cached as loaded rather than requested repeatedly');
  const slow = deferred(); let fail = false;
  const isolated = createManagementDataLoader({ loadKind: async kind => {
    if (kind === 'contracts') throw new Error('contracts offline');
    if (fail) return slow.promise;
    return [row(2)];
  } }, () => clock);
  await isolated.ensure(['vehicles']);
  await assert.rejects(isolated.ensure(['contracts']), /contracts offline/);
  assert.equal(isolated.getSnapshot().resources.vehicles.error, '');
  assert.equal(isolated.getSnapshot().resources.contracts.loading, false);
  fail = true;
  const refresh = isolated.ensure(['vehicles'], true);
  await Promise.resolve();
  assert.equal(isolated.getSnapshot().dataset.vehicles[0].id, 2);
  assert.equal(isolated.getSnapshot().resources.vehicles.loading, true);
  isolated.update('vehicles', rows => rows.map(record => ({ ...record, name: 'Saved edit' })));
  slow.resolve([row(2, 'Old response')]); await refresh;
  assert.equal(isolated.getSnapshot().dataset.vehicles[0].name, 'Saved edit');
  checks.push('errors stay scoped; background refresh keeps rows visible and late reads cannot undo successful edits');
  const recovering = createManagementDataLoader({ loadKind: async () => { throw new Error('offline'); } }, () => clock);
  await assert.rejects(recovering.ensure(['customers']));
  assert.equal(recovering.getSnapshot().resources.customers.loaded, false);
  assert.equal(recovering.getSnapshot().resources.customers.loading, false);
  checks.push('initial failures expose retry state without pretending a collection is empty');
  let available = true, recoveryCalls = 0;
  const retry = createManagementDataLoader({ loadKind: async () => { recoveryCalls++; if (!available) throw new Error('offline'); return [row(1)]; } }, () => clock);
  await retry.ensure(['vehicles']); available = false;
  await assert.rejects(retry.ensure(['vehicles'], true)); available = true;
  await retry.ensure(['vehicles']);
  assert.equal(recoveryCalls, 3); assert.equal(retry.getSnapshot().resources.vehicles.error, '');
  checks.push('a failed refresh can be retried immediately even when the previous data was recently cached');
  const originalFetch = global.fetch;
  try {
    const urls = [];
    global.fetch = async (url, options) => { urls.push({ url, options }); return { ok: true, json: async () => ({ status: 'success', data: [{ id: 77, customer_id: 12 }] }) }; };
    const api = createApiRepository('/api');
    await api.loadKind('vehicles');
    assert.equal(urls.length, 1); assert(urls[0].url.includes('/vehicle/vehicles'));
    const controller = new AbortController();
    const contracts = await loadCustomerContracts(12, controller.signal);
    assert.equal(urls.at(-1).url, '/api/auth/order/car-rental?customer_id=12');
    assert.strictEqual(urls.at(-1).options.signal, controller.signal);
    assert.equal(contracts[0].customer_id, 12);
    global.fetch = async () => ({ ok: false, json: async () => ({ status: 'error', message: 'Customer contracts offline' }) });
    await assert.rejects(loadCustomerContracts(12), /Customer contracts offline/);
    checks.push('single-collection API reads and cancellable customer-scoped contract requests propagate failures');
  } finally { global.fetch = originalFetch; }
  const contract = mapApiRow('contracts', { id: 77, customer_id: 12, customer_status: 2, staff_name: 'QA staff',
    customer_name: 'QA customer', status: 'renting', total_amount: 100, paid_amount: 10,
    vehicles: [{ id: 4, name: 'QA bike', license: 'QA-BIKE', color: 'Đen', brand: 'Honda', year: '2024', type: 'xega' }] });
  assert.equal(summarizeContracts([contract], []).blacklistCount, 1);
  assert.equal(summarizeContracts([{ ...contract, customer_status: '1' }], [row(12)]).blacklistCount, 0);
  const draft = createContractDraft({ stores: [], customers: [], staff: [], vehicles: [], contracts: [] }, 'all', contract);
  assert.equal(draft.vehicles[0].color, 'Đen'); assert.equal(draft.vehicles[0].brand, 'Honda'); assert.equal(draft.staff_name, 'QA staff');
  const electric = createContractDraft({ stores: [], customers: [], staff: [], vehicles: [], contracts: [] }, 'all',
    mapApiRow('contracts', { id: 78, vehicles: [{ id: 5, type: 'electric' }] }));
  assert.equal(electric.vehicles[0].type_text, 'Xe điện');
  checks.push('contract summaries and detail fields remain correct without fetching customer/staff/vehicle collections');
  const queries = [];
  cache.set(path.join(root, 'lib/server/himoto-database.ts'), { exports: { himotoPool: { query: async (sql, values) => { queries.push({ sql, values }); return { rows: [] }; } } } });
  cache.set(path.join(root, 'lib/server/management-session.ts'), { exports: { protectDatabaseRequest: async () => null } });
  cache.set(path.join(root, 'lib/server/contract-drafts.ts'), { exports: { CONTRACT_LIST_SQL: 'SELECT * FROM himoto.orders o WHERE o.deleted_at IS NULL' } });
  const { NextRequest } = require('next/server');
  const { GET } = load(path.join(root, 'app/api/auth/[...path]/route'));
  const params = { params: Promise.resolve({ path: ['order', 'car-rental'] }) };
  const response = await GET(new NextRequest('http://localhost/api/auth/order/car-rental?customer_id=12'), params);
  assert.equal(response.status, 200);
  assert(queries.at(-1).sql.includes('o.customer_id=$1'));
  assert(queries.at(-1).sql.includes("o.order_status <> 'draft'"));
  assert.deepEqual(queries.at(-1).values, [12]);
  const queryCount = queries.length;
  for (const value of ['', '0', '-1', '1 OR 1=1', '9007199254740992']) {
    const denied = await GET(new NextRequest(`http://localhost/api/auth/order/car-rental?customer_id=${encodeURIComponent(value)}`), params);
    assert.equal(denied.status, 400);
  }
  assert.equal(queries.length, queryCount);
  checks.push('customer contract filtering is parameterized, excludes drafts, and rejects invalid IDs before querying');
  const staffParams = { params: Promise.resolve({ path: ['hr', 'staff'] }) };
  assert.equal((await GET(new NextRequest('http://localhost/api/auth/hr/staff?store_id=3'), staffParams)).status, 200);
  assert(queries.at(-1).sql.includes('WHERE p.store_id=$1'));
  assert.deepEqual(queries.at(-1).values, [3]);
  assert.equal((await GET(new NextRequest('http://localhost/api/auth/hr/staff?store_id=0'), staffParams)).status, 400);
  checks.push('composer staff requests filter by the chosen store in SQL rather than downloading all staff');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

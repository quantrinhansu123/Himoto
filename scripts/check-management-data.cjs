const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sourceRoot = path.resolve(__dirname, '../src');
const cache = new Map();

// Load the pure TypeScript modules with the project's existing compiler.
function load(filename) {
  const resolved = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const module = { exports: {} }; cache.set(resolved, module);
  const javascript = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = specifier => specifier.startsWith('@/') ? load(path.join(sourceRoot, specifier.slice(2))) : specifier.startsWith('.') ? load(path.resolve(path.dirname(resolved), specifier)) : require(specifier);
  new Function('require', 'module', 'exports', javascript)(localRequire, module, module.exports);
  return module.exports;
}

async function run() {
  const { createDemoDataset } = load(path.join(sourceRoot, 'fixtures/management-data'));
  const { createDemoRepository, createApiRepository, mapApiRow, READ_ENDPOINTS } = load(path.join(sourceRoot, 'lib/management/repository'));
  const { filterRows, sortRows, EMPTY_QUERY, formatValue, csvCell } = load(path.join(sourceRoot, 'lib/management/table-utils'));
  const results = [];
  const check = (name, test) => { test(); results.push(name); };
  const dataset = createDemoDataset();
  check('consistent synthetic fixtures and derived totals', () => {
    assert.equal(dataset.staff.length, 28); assert.equal(dataset.customers.length, 32); assert.equal(dataset.vehicles.length, 40); assert.equal(dataset.contracts.length, 32);
    for (const store of dataset.stores) {
      assert.equal(store.staff_count, dataset.staff.filter(row => row.store_id === store.id).length);
      assert.equal(store.vehicle_count, dataset.vehicles.filter(row => row.store_id === store.id).length);
    }
    for (const contract of dataset.contracts) {
      assert(dataset.customers.some(row => row.id === contract.customer_id));
      assert(dataset.vehicles.some(row => row.id === contract.vehicle_id));
      if (['renting', 'overdue'].includes(contract.status)) assert.equal(dataset.vehicles.find(row => row.id === contract.vehicle_id).status, 'using');
    }
    assert(dataset.customers.every(row => row.email.endsWith('@example.test') && row.id_card.startsWith('DEMO-')));
  });
  check('search without Vietnamese accents', () => {
    const rows = filterRows(dataset.staff, { ...EMPTY_QUERY, search: 'dang thanh ha' }, 'all');
    assert(rows.length > 0 && rows.every(row => row.name === 'Đặng Thanh Hà'));
  });
  check('combined branch, status and vehicle type filters', () => {
    const rows = filterRows(dataset.vehicles, { ...EMPTY_QUERY, status: 'ready', filters: { type: 'xega' } }, '2');
    assert(rows.length > 0 && rows.every(row => row.store_id === 2 && row.status === 'ready' && row.type === 'xega'));
  });
  check('inclusive date range and numeric sorting', () => {
    const rows = filterRows(dataset.contracts, { ...EMPTY_QUERY, startDate: '2026-10-03', endDate: '2026-10-05' }, 'all');
    assert(rows.length > 0 && rows.every(row => row.start_date >= '2026-10-03' && row.start_date <= '2026-10-05'));
    const sorted = sortRows(dataset.vehicles, 'daily_price', 'desc');
    for (let i = 1; i < sorted.length; i++) assert(sorted[i - 1].daily_price >= sorted[i].daily_price);
  });
  check('missing values and CSV formula escaping', () => {
    assert.equal(formatValue(undefined, 'money'), '—'); assert.equal(formatValue('2026-10-06', 'date'), '06/10/2026');
    assert.equal(formatValue('2026-10-12T17:00:00.000Z', 'date'), '13/10/2026');
    assert.equal(formatValue('2026-10-13T00:00', 'date'), '13/10/2026');
    assert.equal(formatValue('2026-10-12T17:00:00.000Z', 'datetime'), '13/10/2026 00:00');
    assert.equal(csvCell('=SUM(1,2)'), '"\'=SUM(1,2)"'); assert.equal(csvCell('a"b'), '"a""b"');
  });
  const repository = createDemoRepository();
  const snapshot = await repository.load(); snapshot.vehicles[0].name = 'Mutated copy';
  assert.notEqual((await repository.load()).vehicles[0].name, 'Mutated copy');
  const updated = await repository.save('vehicles', { ...dataset.vehicles[0], store_id: 2, name: 'Xe mẫu đã sửa' });
  assert.equal(updated.stores.find(row => row.id === 1).vehicle_count, 9);
  assert.equal(updated.stores.find(row => row.id === 2).vehicle_count, 11);
  assert.equal(updated.contracts[0].vehicle_name, 'Xe mẫu đã sửa');
  assert.equal(updated.contracts[0].store_id, dataset.contracts[0].store_id);
  await assert.rejects(repository.save('contracts', dataset.contracts[0]), /chỉ đọc/);
  assert.equal((await repository.reset()).vehicles[0].name, dataset.vehicles[0].name);
  results.push('demo copy isolation, related updates, immutable contract branch, reset, and blocked contract writes');
  check('API view mapping preserves unknown states and missing amounts', () => {
    const row = mapApiRow('contracts', { id: 1, status: 'future', vehicles: [{ name: 'A', license: 'DEMO-A' }, { name: 'B', license: 'DEMO-B' }] });
    assert.equal(row.status, 'future'); assert.equal(row.total_amount, undefined); assert.equal(row.deposit_amount, undefined);
    assert.equal(row.license, 'DEMO-A, DEMO-B');
    assert.throws(() => mapApiRow('vehicles', { name: 'Missing ID' }), /ID/);
  });
  const originalFetch = global.fetch;
  const requests = [];
  try {
    global.fetch = async (url, options) => {
      requests.push({ url, method: options.method });
      const kind = Object.keys(READ_ENDPOINTS).find(key => String(url).includes(READ_ENDPOINTS[key]));
      const page = Number(new URL(url).searchParams.get('page'));
      const paginated = ['customers', 'contracts', 'vehicles'].includes(kind);
      return { ok: true, json: async () => ({ status: 'success', data: paginated ? { data: [{ id: page, name: 'API sample', status: 'unknown' }], total: 2, last_page: 2 } : [{ id: 1, name: 'API sample' }] }) };
    };
    const api = createApiRepository('https://api.example.test/api');
    const data = await api.load(); assert.equal(data.contracts.length, 2); assert.equal(data.customers.length, 2);
    assert(requests.every(request => request.method === 'GET'));
    await assert.rejects(api.save('vehicles', dataset.vehicles[0]), /chưa được tích hợp/);
    const errors = [
      { ok: false, status: 503 },
      { ok: true, json: async () => ({ status: 'success', data: 'invalid' }) },
      { ok: true, json: async () => ({ status: 'error', data: [] }) },
    ];
    for (const error of errors) { global.fetch = async () => error; await assert.rejects(api.load()); }
    global.fetch = async () => { throw new Error('network unavailable'); };
    await assert.rejects(api.load(), /network unavailable/);
    results.push('read-only API pagination and failure propagation without mock fallback');
  } finally { global.fetch = originalFetch; }
  console.log(JSON.stringify({ passed: results.length, checks: results }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

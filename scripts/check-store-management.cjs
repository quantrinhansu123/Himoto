const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', javascript)(localRequire, module, module.exports);
  return module.exports;
}

async function run() {
  const checks = [];
  const server = load(path.join(root, 'lib/server/store-management'));
  const shared = load(path.join(root, 'lib/management/store-management'));
  const repository = load(path.join(root, 'lib/management/repository'));
  const edits = { name: 'Cơ sở QA', phone: '0900000001', address: 'Địa chỉ QA', status: 'active', user_id: 8, revision: 'revision-1' };
  assert.deepEqual(server.parseStoreEdits(edits), edits);
  for (const patch of [{ name: '' }, { name: 'x'.repeat(256) }, { address: 'x'.repeat(256) }, { status: 'opening' }, { phone: 'abc' }, { user_id: '8' }, { user_id: -1 }, { code: 'new-code' }, { email: 'qa@example.invalid' }]) assert.throws(() => server.parseStoreEdits({ ...edits, ...patch }));
  assert.deepEqual(shared.validateStoreEdits({ ...edits, phone: '', address: '', user_id: null }), {});
  const mapped = repository.mapApiRow('stores', { id: 2, store_name: 'QA', status: 'opening', user_id: '8', store_revision: 'revision-1' });
  assert.equal(mapped.status, 'active'); assert.equal(mapped.user_id, 8); assert.equal(mapped.store_revision, 'revision-1');
  checks.push('store payload accepts only schema-backed fields, validates text/phone/manager/status and maps legacy opening status + revision');

  const creation = { name: 'Cơ sở mới QA', phone: '', address: '', status: 'active', user_id: null, code: '', kind: 'physical' };
  assert.deepEqual(server.parseStoreCreation(creation), creation);
  assert.equal(server.parseStoreCreation({ ...creation, code: ' cs-qa-new ' }).code, 'CS-QA-NEW');
  for (const patch of [{ name: '' }, { code: 'Mã có dấu' }, { code: 'x'.repeat(192) }, { kind: 'invalid' }, { user_id: '9' }, { phone: 'x' }, { status: 'opening' }, { revision: 'invalid' }]) assert.throws(() => server.parseStoreCreation({ ...creation, ...patch }));
  const creationQueries = [];
  let conflict = false, invalidManager = false, codeCollision = true, insertFailure = false;
  const creator = { query: async (sql, params) => {
    creationQueries.push({ sql, params });
    if (sql.startsWith('SELECT id FROM himoto.stores WHERE lower')) return { rows: conflict ? [{ id: 9 }] : [], rowCount: conflict ? 1 : 0 };
    if (sql.startsWith('SELECT id FROM himoto.users')) return { rows: invalidManager ? [] : [{ id: 9 }], rowCount: invalidManager ? 0 : 1 };
    if (sql.startsWith('INSERT')) {
      if (insertFailure) throw new Error('mock insert failure');
      return { rows: [{ id: 10 }], rowCount: 1 };
    }
    if (sql.startsWith('SELECT id FROM himoto.stores WHERE upper')) {
      const used = codeCollision && params[0] === 'CS-010';
      return { rows: used ? [{ id: 9 }] : [], rowCount: used ? 1 : 0 };
    }
    if (sql.startsWith('SELECT s.id')) return { rows: [{ id: 10, code: 'CS-010-1', store_name: creation.name, status: 'opening', kind: 'physical', store_revision: 'revision-1', vehicle_count: 0, staff_count: 0 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }, release() { creationQueries.push({ sql: 'RELEASE' }); } };
  const created = await server.createDatabaseStore(creator, creation);
  assert.equal(created.id, 10); assert.equal(created.vehicle_count, 0);
  assert.deepEqual(creationQueries.find(query => query.sql.startsWith('INSERT')).params, [creation.name, '', '', null, 'opening', '', 'physical']);
  assert.deepEqual(creationQueries.find(query => query.sql.startsWith('UPDATE')).params, [10, 'CS-010-1']);
  assert(creationQueries.findIndex(query => query.sql.startsWith('LOCK TABLE')) < creationQueries.findIndex(query => query.sql.startsWith('INSERT')));
  creationQueries.length = 0;
  await server.createDatabaseStore(creator, { ...creation, code: 'QA-CUSTOM', kind: 'lease_to_own', status: 'inactive', user_id: 9 });
  assert(!creationQueries.some(query => query.sql.startsWith('UPDATE')));
  assert.equal(creationQueries.find(query => query.sql.startsWith('INSERT')).params[4], 'inactive');
  assert.equal(creationQueries.find(query => query.sql.startsWith('INSERT')).params[6], 'lease_to_own');
  conflict = true; creationQueries.length = 0;
  await assert.rejects(server.createDatabaseStore(creator, creation), error => error.status === 409);
  assert(!creationQueries.some(query => query.sql.startsWith('INSERT')));
  conflict = false; invalidManager = true;
  await assert.rejects(server.createDatabaseStore(creator, { ...creation, user_id: 9 }), error => error.status === 400);
  invalidManager = false;
  checks.push('creation validates names/codes/kinds, serializes duplicate checks, rejects inactive managers and generates an unused code without changing schema or existing stores');

  let current = { id: 2, user_id: 7, revision: 'revision-1' }, duplicate = false, managerValid = true, failWrite = false;
  let linked = new Set(), references = [{ table_name: 'customers', column_name: 'store_id' }, { table_name: 'orders', column_name: 'store_id' }, { table_name: 'users', column_name: 'store_id' }, { table_name: 'vehicles', column_name: 'store_id' }, { table_name: 'vehicles', column_name: 'current_store_id' }];
  const queries = [];
  const client = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('information_schema.columns')) return { rows: references, rowCount: references.length };
    if (sql.startsWith('SELECT id, user_id') || sql.startsWith('SELECT id FROM himoto.stores WHERE id=')) return { rows: current ? [current] : [], rowCount: current ? 1 : 0 };
    if (sql.startsWith('SELECT id FROM himoto.stores WHERE id <>')) return { rows: duplicate ? [{ id: 3 }] : [], rowCount: duplicate ? 1 : 0 };
    if (sql.startsWith('SELECT id FROM himoto.users')) return { rows: managerValid ? [{ id: 8 }] : [], rowCount: managerValid ? 1 : 0 };
    if (sql.startsWith('SELECT 1 FROM')) return { rows: [...linked].some(table => sql.includes(`himoto."${table}"`)) ? [{ value: 1 }] : [], rowCount: [...linked].some(table => sql.includes(`himoto."${table}"`)) ? 1 : 0 };
    if (sql.startsWith('UPDATE') || sql.startsWith('DELETE')) {
      if (failWrite) throw new Error('mock write failure');
      return { rows: [{ id: 2 }], rowCount: 1 };
    }
    if (sql.startsWith('SELECT s.id')) return { rows: [{ id: 2, store_name: edits.name, status: 'opening', user_id: 8, store_revision: 'revision-2', vehicle_count: 3, staff_count: 2 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }, release() { queries.push({ sql: 'RELEASE' }); } };
  const saved = await server.saveDatabaseStore(client, 2, edits);
  assert.equal(saved.vehicle_count, 3);
  const update = queries.find(query => query.sql.startsWith('UPDATE'));
  assert.deepEqual(update.params, [2, edits.name, edits.phone, edits.address, 8, 'opening']);
  assert(!update.sql.includes('code=')); assert(!update.sql.includes('kind='));
  assert(queries.some(query => query.sql.includes("status='active' FOR SHARE")));
  queries.length = 0;
  await server.saveDatabaseStore(client, 2, { ...edits, status: 'inactive', user_id: null });
  assert.equal(queries.find(query => query.sql.startsWith('UPDATE')).params.at(-1), 'inactive');
  queries.length = 0;
  await assert.rejects(server.saveDatabaseStore(client, 2, { ...edits, revision: 'stale' }), error => error.status === 409);
  assert(!queries.some(query => query.sql.startsWith('UPDATE')));
  duplicate = true;
  await assert.rejects(server.saveDatabaseStore(client, 2, edits), error => error.status === 409);
  duplicate = false; managerValid = false;
  await assert.rejects(server.saveDatabaseStore(client, 2, edits), error => error.status === 400);
  await server.saveDatabaseStore(client, 2, { ...edits, user_id: 7 }); // Preserve an unchanged legacy assignment.
  managerValid = true;
  checks.push('store save preserves code/kind/counts, binds real manager ID, writes legacy statuses and rejects stale revision/duplicate name/inactive new manager');

  for (const table of ['customers', 'orders', 'users', 'vehicles']) {
    linked = new Set([table]); queries.length = 0;
    await assert.rejects(server.deleteDatabaseStore(client, 2), error => error.status === 409);
    assert(!queries.some(query => query.sql.startsWith('DELETE')));
    const check = queries.find(query => query.sql.startsWith('SELECT 1 FROM himoto."vehicles"'));
    assert(check.sql.includes('"store_id"=$1 OR "current_store_id"=$1'));
    assert(queries.findIndex(query => query.sql.includes('IN SHARE MODE')) < queries.findIndex(query => query.sql.startsWith('SELECT 1')));
  }
  linked = new Set(); queries.length = 0;
  await server.deleteDatabaseStore(client, 2);
  assert.deepEqual(queries.find(query => query.sql.startsWith('DELETE')).params, [2]);
  assert(queries.filter(query => query.sql.startsWith('SELECT 1')).every(query => !query.sql.includes('deleted_at')));
  current = null;
  await assert.rejects(server.deleteDatabaseStore(client, 2), error => error.status === 404);
  await assert.rejects(server.saveDatabaseStore(client, 2, edits), error => error.status === 404);
  current = { id: 2, user_id: 7, revision: 'revision-1' };
  checks.push('delete discovers and locks legacy references, blocks customers/orders/users/vehicle origin/current links including archived rows and deletes only an unused store');

  const session = load(path.join(root, 'lib/server/management-session'));
  const pool = load(path.join(root, 'lib/server/himoto-database')).himotoPool;
  const oldEnv = { DATABASE_URL: process.env.DATABASE_URL, MANAGEMENT_SESSION_SECRET: process.env.MANAGEMENT_SESSION_SECRET, NODE_ENV: process.env.NODE_ENV };
  const oldQuery = Object.getOwnPropertyDescriptor(pool, 'query'), oldConnect = Object.getOwnPropertyDescriptor(pool, 'connect');
  try {
    process.env.DATABASE_URL = 'postgresql://mock.invalid/test'; process.env.MANAGEMENT_SESSION_SECRET = 'store-unit-tests-only-not-a-real-secret'; process.env.NODE_ENV = 'production';
    Object.defineProperty(pool, 'query', { configurable: true, value: async sql => sql.includes('FROM himoto.users u') ? { rows: [{ id: 7, name: 'QA', status: 'active', role_id: 1 }] } : { rows: [{ id: 8, name: 'Manager QA' }] } });
    Object.defineProperty(pool, 'connect', { configurable: true, value: async () => client });
    const route = load(path.join(root, 'app/api/auth/stores/[id]/route'));
    const managers = load(path.join(root, 'app/api/auth/stores/managers/route'));
    const cookie = `${session.SESSION_COOKIE}=${session.signSession(7)}`;
    const request = (method, body, headers = {}) => new NextRequest('https://himoto.example/api/auth/stores/2', { method, headers: { Host: 'himoto.example', Origin: 'https://himoto.example', Cookie: cookie, 'Content-Type': 'application/json', ...headers }, ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    const params = { params: Promise.resolve({ id: '2' }) };
    queries.length = 0;
    assert.equal((await route.PATCH(request('PATCH', edits, { Cookie: '' }), params)).status, 401);
    assert.equal((await route.DELETE(request('DELETE', null, { Origin: 'https://other.invalid' }), params)).status, 403);
    assert.equal((await route.PATCH(request('PATCH', '{'), params)).status, 400);
    assert.equal((await route.DELETE(request('DELETE'), { params: Promise.resolve({ id: '2abc' }) })).status, 400);
    assert.equal(queries.length, 0);
    const changed = await route.PATCH(request('PATCH', edits), params);
    assert.equal(changed.status, 200); assert.equal(changed.headers.get('cache-control'), 'no-store');
    assert.equal(queries.at(-2).sql, 'COMMIT');
    linked = new Set(['orders']); queries.length = 0;
    assert.equal((await route.DELETE(request('DELETE'), params)).status, 409); assert.equal(queries.at(-2).sql, 'ROLLBACK');
    linked = new Set(); queries.length = 0;
    assert.equal((await route.DELETE(request('DELETE'), params)).status, 200); assert.equal(queries.at(-2).sql, 'COMMIT');
    failWrite = true; queries.length = 0;
    assert.equal((await route.PATCH(request('PATCH', edits), params)).status, 500); assert.equal(queries.at(-2).sql, 'ROLLBACK');
    failWrite = false;
    const collection = load(path.join(root, 'app/api/auth/stores/route'));
    Object.defineProperty(pool, 'connect', { configurable: true, value: async () => creator });
    creationQueries.length = 0;
    assert.equal((await collection.POST(request('POST', creation, { Cookie: '' }))).status, 401);
    assert.equal((await collection.POST(request('POST', creation, { Origin: 'https://other.invalid' }))).status, 403);
    assert.equal((await collection.POST(request('POST', '{'))).status, 400);
    assert.equal(creationQueries.length, 0);
    const newStore = await collection.POST(request('POST', creation));
    assert.equal(newStore.status, 201); assert.equal((await newStore.json()).data.id, 10);
    assert.equal(creationQueries.at(-2).sql, 'COMMIT');
    conflict = true; creationQueries.length = 0;
    assert.equal((await collection.POST(request('POST', creation))).status, 409); assert.equal(creationQueries.at(-2).sql, 'ROLLBACK');
    conflict = false; insertFailure = true; creationQueries.length = 0;
    assert.equal((await collection.POST(request('POST', creation))).status, 500); assert.equal(creationQueries.at(-2).sql, 'ROLLBACK');
    insertFailure = false;
    assert.equal((await collection.GET(request('GET'))).status, 200);
    assert.equal((await collection.GET(request('GET', null, { Cookie: '' }))).status, 401);
    checks.push('collection route preserves GET and enforces authenticated same-origin POST; creation success commits, conflicts and insertion failures roll back');
    const managerResponse = await managers.GET(request('GET'));
    assert.equal(managerResponse.status, 200); assert.deepEqual((await managerResponse.json()).data, [{ id: 8, name: 'Manager QA' }]);
    assert.equal((await managers.GET(request('GET', null, { Cookie: '' }))).status, 401);
  } finally {
    Object.defineProperty(pool, 'query', oldQuery); Object.defineProperty(pool, 'connect', oldConnect);
    for (const [key, value] of Object.entries(oldEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  checks.push('PATCH/DELETE/managers routes enforce session and origin guards; success commits, dependency/write failures roll back and managers expose only IDs/names');

  const adapter = load(path.join(root, 'lib/management/store-repository'));
  const oldFetch = global.fetch;
  try {
    const requests = [];
    global.fetch = async (url, options) => { requests.push({ url, options }); return Response.json({ status: 'success', data: url.endsWith('/managers') ? [{ id: '8', name: 'QA' }] : options.method === 'POST' ? { id: 10, code: 'CS-010', store_name: creation.name, status: 'opening' } : { id: 2, store_name: edits.name, status: 'opening' } }); };
    assert.equal((await adapter.loadStoreManagers())[0].id, 8);
    assert.equal((await adapter.updateStoreRecord(2, edits)).status, 'active');
    await adapter.deleteStoreRecord(2);
    assert.equal((await adapter.createStoreRecord(creation)).code, 'CS-010');
    assert.deepEqual(requests.map(request => request.options.method || 'GET'), ['GET', 'PATCH', 'DELETE', 'POST']);
    assert.equal(requests.at(-1).url, '/api/auth/stores');
    global.fetch = async () => Response.json({ status: 'error', message: 'Blocked by linked data' }, { status: 409 });
    await assert.rejects(adapter.deleteStoreRecord(2), /Blocked by linked data/);
    global.fetch = async () => Response.json({ status: 'success', data: { id: 3 } });
    await assert.rejects(adapter.updateStoreRecord(2, edits), /Chưa xác nhận/);
    await assert.rejects(adapter.createStoreRecord(creation), /Chưa xác nhận/);
  } finally { global.fetch = oldFetch; }
  checks.push('browser adapter calls exact manager/POST/PATCH/DELETE endpoints and propagates failed or mismatched saves');
  console.log(JSON.stringify({ passed: checks.length, checks, databaseWrites: 'mock only' }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

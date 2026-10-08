const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Excel = require('exceljs');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', javascript)(localRequire, module, module.exports);
  return module.exports;
}
const shared = load(path.join(root, 'lib/management/customer-store-import'));
const excel = load(path.join(root, 'lib/management/customer-excel'));
const server = load(path.join(root, 'lib/server/customer-store-import'));
const batching = load(path.join(root, 'lib/management/customer-store-batches'));
const stores = [{ id: 23, name: 'CH Giáp Bát', code: 'GB' }, { id: 31, name: 'CS láng', code: 'LANG' }];
const original = [
  { id: 1, name: 'Khách QA một', id_card: '001234567890', store_id: null },
  { id: 2, name: 'Khách QA hai', id_card: '001234567891', store_id: 23 },
  { id: 3, name: 'Khách QA ba', id_card: '001234567892', store_id: 31 },
];
const input = (card = original[0].id_card, store = stores[0].name, rowNumber = 2) => ({ rowNumber, values: { id_card: card, store } });
function workbook(headers, data) {
  const book = new Excel.Workbook(); const sheet = book.addWorksheet('Sheet1');
  sheet.addRow(headers); data.forEach(row => sheet.addRow(row)); return book;
}

async function main() {
  const checks = [];
  const buffer = await excel.createCustomerStoreTemplate(stores);
  const template = new Excel.Workbook(); await template.xlsx.load(buffer);
  const sheet = template.worksheets[0];
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['Căn cước', 'Cơ sở']);
  assert.equal(sheet.columnCount, 2); assert.equal(sheet.getCell('A2').numFmt, '@'); assert.equal(sheet.getCell('A2').value, null);
  assert.equal(sheet.getCell('B2').dataValidation.type, 'list'); assert.equal(template.getWorksheet('Cơ sở').getCell('C2').value, stores[0].name);
  assert.throws(() => excel.parseCustomerStoreWorkbook(template), /chưa có dữ liệu/);
  sheet.addRow([]); sheet.getRow(2).values = [original[0].id_card, stores[0].name];
  const roundtrip = new Excel.Workbook(); await roundtrip.xlsx.load(await template.xlsx.writeBuffer());
  assert.equal(excel.parseCustomerStoreWorkbook(roundtrip)[0].values.id_card, original[0].id_card);
  assert.deepEqual(excel.parseCustomerStoreWorkbook(workbook(['Tên cơ sở', 'CCCD'], [['GB', original[0].id_card]]))[0].values, { id_card: original[0].id_card, store: 'GB' });
  checks.push('two-column blank template includes live branch names/dropdown, Text identity formatting and reordered header aliases preserve leading zeros');

  for (const headers of [['Căn cước'], ['Căn cước', 'Cơ sở', 'CCCD'], ['Căn cước', 'Cơ sở', 'Khác']]) assert.throws(() => excel.parseCustomerStoreWorkbook(workbook(headers, [])));
  const numeric = workbook(['Căn cước', 'Cơ sở'], [[1234567890, 'GB']]);
  assert.match(excel.parseCustomerStoreWorkbook(numeric)[0].errors.join(' '), /phải là Text/);
  numeric.worksheets[0].getCell('A2').numFmt = '000000000000';
  assert.equal(excel.parseCustomerStoreWorkbook(numeric)[0].values.id_card, original[0].id_card);
  numeric.worksheets[0].getCell('A2').value = { formula: '"001234567890"', result: original[0].id_card };
  assert.match(excel.parseCustomerStoreWorkbook(numeric)[0].errors.join(' '), /công thức/);
  const hidden = workbook(['Căn cước', 'Cơ sở'], [[original[0].id_card, 'GB', 'hidden']]);
  assert.match(excel.parseCustomerStoreWorkbook(hidden)[0].errors.join(' '), /ngoài các cột/);
  assert.equal(excel.parseCustomerStoreWorkbook(workbook(['Căn cước', 'Cơ sở'], Array.from({ length: 10005 }, () => [original[0].id_card, 'GB']))).length, 10005);
  const sparse = workbook(['Căn cước', 'Cơ sở'], []); sparse.worksheets[0].getRow(50001).values = [original[0].id_card, 'GB'];
  assert.equal(excel.parseCustomerStoreWorkbook(sparse)[0].rowNumber, 50001);
  await assert.rejects(excel.readCustomerStoreExcel({ name: 'qa.xls', size: 1 }), /\.xlsx/);
  await assert.rejects(excel.readCustomerStoreExcel({ name: 'qa.xlsx', size: 6 * 1024 * 1024 }), /5 MB/);
  await assert.rejects(excel.readCustomerStoreExcel({ name: 'qa.xlsx', size: 1, arrayBuffer: async () => new ArrayBuffer(1) }), /Không đọc được/);
  checks.push('10,005 data rows and sparse row 50,001 parse without truncation; malformed columns/formulas/unsafe identities and oversized/corrupt/unsupported files still reject');

  const match = (inputs, branches = stores, customers = original) => shared.matchCustomerStores(inputs, branches, customers);
  assert.equal(match([input()])[0].state, 'ready'); assert.equal(match([input()])[0].previous_store_id, null);
  assert.equal(match([input(original[1].id_card)])[0].state, 'unchanged');
  assert.equal(match([input(original[2].id_card, 'ch giap bat')])[0].store_id, 23);
  assert.equal(match([input(original[0].id_card, '31')])[0].store_id, 31);
  assert.equal(match([input('001 234 567 890', 'lang')])[0].store_id, 31);
  assert.equal(match([input('123456789', 'GB')], stores, [{ ...original[0], id_card: '123456789' }])[0].state, 'ready');
  for (const item of [input('', 'GB'), input('1234', 'GB'), input('999999999999', 'GB'), input(original[0].id_card, ''), input(original[0].id_card, 'Không có')]) assert.equal(match([item])[0].state, 'invalid');
  assert(match([input(), input(original[0].id_card, '31', 3)]).every(row => row.state === 'invalid'));
  assert.equal(match([input()], stores, [...original, { ...original[0], id: 9 }])[0].state, 'invalid');
  assert.equal(match([input()], [...stores, { ...stores[0], id: 99 }])[0].state, 'invalid');
  assert.equal(match([{ ...input(), errors: ['Excel bị mất số 0'] }])[0].state, 'invalid');
  checks.push('unique identity plus exact normalized branch name/code/ID supports empty/current branch; unknown, ambiguous, duplicate and malformed identities never update');

  for (const body of [{ rows: [], commit: false }, { rows: [input(), input()], commit: false }, { rows: [input()], commit: 'false' }, { rows: [input()], commit: true }, { rows: [input(1234)], commit: false }, { rows: [{ ...input(), values: { ...input().values, customer_id: 99 } }], commit: false }, { rows: [input()], commit: false, revision: 1 }]) assert.throws(() => server.customerStoreRequest(body));
  assert.equal(server.customerStoreRequest({ rows: [input()], commit: false }).revision, '');
  assert.equal(server.customerStoreRequest({ rows: [input(original[0].id_card, 'GB', 50001)], commit: false }).rows[0].rowNumber, 50001);
  assert.throws(() => server.customerStoreRequest({ rows: Array.from({ length: 1001 }, (_, i) => input(original[0].id_card, 'GB', i + 2)), commit: false }));
  assert.throws(() => server.customerStoreRequest({ rows: [input(original[0].id_card, 'GB', 1048577)], commit: false }));
  checks.push('request requires typed two-column data, unique row numbers, explicit mode and a valid preview revision for updates');

  let customers = structuredClone(original), failUpdate = false, shortUpdate = false;
  const queries = [];
  const client = { query: async (sql, parameters) => {
    queries.push({ sql, parameters });
    if (sql.includes('FROM himoto.stores')) return { rows: stores.map(store => ({ ...store, id: String(store.id) })) };
    if (sql.includes('FROM himoto.customers')) return { rows: customers.map(customer => ({ ...customer, id: String(customer.id), store_id: customer.store_id == null ? null : String(customer.store_id) })) };
    if (sql.startsWith('UPDATE')) {
      if (failUpdate) throw new Error('private database error');
      return { rows: [], rowCount: shortUpdate ? 0 : parameters.length / 3 };
    }
    return { rows: [], rowCount: 0 };
  }, release() { queries.push({ sql: 'RELEASE' }); } };
  const inputs = [input(), input(original[1].id_card, '23', 3), input('999999999999', 'GB', 4), input(original[2].id_card, 'GB', 5)];
  const preview = await server.importCustomerStores(client, inputs, false);
  assert.equal(preview.ready, 2); assert.equal(preview.unchanged, 1); assert.equal(preview.invalid, 1);
  assert(queries.every(query => query.sql.startsWith('SELECT')));
  queries.length = 0;
  const saved = await server.importCustomerStores(client, inputs, true, preview.revision);
  assert.equal(saved.updated, 2); assert.equal(saved.committed, true);
  assert(queries.findIndex(query => query.sql.startsWith('LOCK')) < queries.findIndex(query => query.sql.includes('FROM himoto.customers')));
  const update = queries.find(query => query.sql.startsWith('UPDATE'));
  assert.deepEqual(update.parameters, [1, null, 23, 3, 31, 23]);
  assert.match(update.sql, /SET store_id = mapping.store_id, updated_at = now\(\)/);
  assert(!update.sql.includes('001234567890')); assert(!queries.some(query => /INSERT|DELETE/.test(query.sql)));
  customers[0].store_id = 31; queries.length = 0;
  await assert.rejects(server.importCustomerStores(client, inputs, true, preview.revision), error => error.status === 409);
  assert(!queries.some(query => query.sql.startsWith('UPDATE')));
  customers = structuredClone(original); shortUpdate = true;
  await assert.rejects(server.importCustomerStores(client, inputs, true, preview.revision), error => error.status === 409); shortUpdate = false;
  checks.push('preview is SELECT-only; commit locks and rechecks revision, handles bigint IDs, updates only eligible customer store fields with parameters and rejects stale/partial updates');

  const largeCustomers = Array.from({ length: 2005 }, (_, i) => ({ id: i + 100, name: `QA ${i}`, id_card: String(100000000000 + i), store_id: null }));
  const largeInputs = largeCustomers.map((customer, i) => input(customer.id_card, 'GB', i + 2));
  largeInputs.at(-1).values.id_card = largeInputs[0].values.id_card;
  let batchCustomers = structuredClone(largeCustomers), calls = [], failCommit = 0, loseCommit = 0, failPreview = 0, commitCount = 0, previewCount = 0;
  const batchCheck = async (rows, commit, revision) => {
    assert(rows.length <= shared.CUSTOMER_STORE_BATCH_SIZE);
    server.customerStoreRequest({ rows, commit, revision });
    calls.push({ rows, commit, revision });
    if (!commit && ++previewCount === failPreview) throw new Error('preview offline');
    if (commit && ++commitCount === failCommit) throw new Error('save offline');
    const matched = shared.matchCustomerStores(rows, stores, batchCustomers);
    const currentRevision = require('node:crypto').createHash('sha256').update(JSON.stringify(matched)).digest('hex');
    const result = { rows: matched, total: rows.length, ready: matched.filter(row => row.state === 'ready').length, unchanged: matched.filter(row => row.state === 'unchanged').length, invalid: matched.filter(row => row.state === 'invalid').length, updated: 0, committed: commit, revision: currentRevision };
    if (commit) {
      assert.equal(revision, currentRevision);
      for (const row of matched.filter(row => row.state === 'ready')) batchCustomers.find(customer => customer.id === row.customer_id).store_id = row.store_id;
      result.updated = result.ready;
      if (commitCount === loseCommit) throw new Error('save response lost');
    }
    return result;
  };
  const progress = [];
  const largePreview = await batching.previewCustomerStoreBatches(largeInputs, batchCheck, (state, result) => progress.push({ ...state, ready: result.ready }));
  assert.deepEqual(calls.map(call => call.rows.length), [1000,1000,5]);
  assert.deepEqual(progress.map(state => state.processed), [1000,2000,2005]);
  assert.equal(largePreview.result.ready, 2003); assert.equal(largePreview.result.invalid, 2);
  assert(largePreview.result.rows[0].errors.some(error => error.includes('trùng trong file')));
  assert(largePreview.result.rows.at(-1).errors.some(error => error.includes('trùng trong file')));
  assert(calls.every(call => !call.commit));
  const savedProgress = [];
  const savedLarge = await batching.saveCustomerStoreBatches(largePreview, batchCheck, state => savedProgress.push(state));
  assert.equal(savedLarge.updated, 2003); assert.equal(savedLarge.total, 2005); assert.equal(savedLarge.committed, true);
  assert.deepEqual(savedProgress.map(state => state.updated), [999,1999,2003]);
  assert.equal(batchCustomers[0].store_id, null); assert.equal(batchCustomers.at(-1).store_id, null);
  assert.equal(calls.filter(call => call.commit).length, 3);
  checks.push('2,005-row file previews and saves sequentially in 1,000/1,000/5-row parts with cumulative progress; both cross-part duplicate occurrences are excluded before any save');

  batchCustomers = structuredClone(largeCustomers); calls = []; failCommit = 2; commitCount = 0; previewCount = 0;
  await assert.rejects(batching.saveCustomerStoreBatches(largePreview, batchCheck, () => {}), error => error.updated === 999 && /Đã xác nhận cập nhật 999/.test(error.message));
  assert.equal(calls.length, 2);
  assert.equal(batchCustomers.filter(customer => customer.store_id === 23).length, 999);
  failCommit = 0; commitCount = 0;
  const remaining = await batching.previewCustomerStoreBatches(largeInputs, batchCheck, () => {});
  assert.equal(remaining.result.unchanged, 999); assert.equal(remaining.result.ready, 1004);
  assert.equal((await batching.saveCustomerStoreBatches(remaining, batchCheck, () => {})).updated, 1004);

  batchCustomers = structuredClone(largeCustomers); calls = []; loseCommit = 2; commitCount = 0;
  await assert.rejects(batching.saveCustomerStoreBatches(largePreview, batchCheck, () => {}), error => error.updated === 999);
  assert.equal(batchCustomers.filter(customer => customer.store_id === 23).length, 1999);
  loseCommit = 0; commitCount = 0;
  const afterLostResponse = await batching.previewCustomerStoreBatches(largeInputs, batchCheck, () => {});
  assert.equal(afterLostResponse.result.unchanged, 1999); assert.equal(afterLostResponse.result.ready, 4);
  assert.equal((await batching.saveCustomerStoreBatches(afterLostResponse, batchCheck, () => {})).updated, 4);
  failPreview = 2; previewCount = 0; calls = [];
  await assert.rejects(batching.previewCustomerStoreBatches(largeInputs, batchCheck, () => {}), /preview offline/);
  assert.equal(calls.length, 2); assert(calls.every(call => !call.commit)); failPreview = 0;
  checks.push('interrupted preview stops without writes; failed second save reports confirmed partial count; retry and lost-response recovery skip previously saved rows without reapplying them');

  const session = load(path.join(root, 'lib/server/management-session'));
  const pool = load(path.join(root, 'lib/server/himoto-database')).himotoPool;
  const previousEnv = { DATABASE_URL: process.env.DATABASE_URL, MANAGEMENT_SESSION_SECRET: process.env.MANAGEMENT_SESSION_SECRET, NODE_ENV: process.env.NODE_ENV };
  const queryDescriptor = Object.getOwnPropertyDescriptor(pool, 'query'), connectDescriptor = Object.getOwnPropertyDescriptor(pool, 'connect');
  try {
    process.env.DATABASE_URL = 'postgresql://mock.invalid/test'; process.env.MANAGEMENT_SESSION_SECRET = 'qa-only-customer-store-session-key-0000'; process.env.NODE_ENV = 'production';
    Object.defineProperty(pool, 'query', { configurable: true, value: async () => ({ rows: [{ id: 7, name: 'QA', status: 'active', role_id: 1 }] }) });
    Object.defineProperty(pool, 'connect', { configurable: true, value: async () => client });
    const route = load(path.join(root, 'app/api/auth/customers/match-stores/route'));
    const send = (body, headers = {}) => route.POST(new NextRequest('https://himoto.example/api/auth/customers/match-stores', { method: 'POST', headers: { Host: 'himoto.example', Origin: 'https://himoto.example', Cookie: `${session.SESSION_COOKIE}=${session.signSession(7)}`, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
    queries.length = 0;
    assert.equal((await send({ rows: inputs, commit: false }, { Cookie: '' })).status, 401);
    assert.equal((await send({ rows: inputs, commit: false }, { Origin: 'https://other.invalid' })).status, 403);
    assert.equal((await send('{')).status, 400);
    assert.equal((await send(' '.repeat(2 * 1024 * 1024 + 1))).status, 413);
    assert.equal((await send('{}', { 'Content-Length': String(2 * 1024 * 1024 + 1) })).status, 413);
    assert.equal(queries.length, 0);
    const response = await send({ rows: inputs, commit: false });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(queries[0].sql, 'BEGIN READ ONLY'); assert(!queries.some(query => query.sql.startsWith('UPDATE')));
    const revision = (await response.json()).data.revision;
    queries.length = 0;
    assert.equal((await send({ rows: inputs, commit: true, revision })).status, 200); assert.equal(queries.at(-2).sql, 'COMMIT');
    queries.length = 0; customers[0].store_id = 31;
    assert.equal((await send({ rows: inputs, commit: true, revision })).status, 409); assert.equal(queries.at(-2).sql, 'ROLLBACK');
    customers = structuredClone(original); failUpdate = true; queries.length = 0;
    const failure = await send({ rows: inputs, commit: true, revision });
    assert.equal(failure.status, 500); assert.equal(queries.at(-2).sql, 'ROLLBACK'); assert(!JSON.stringify(await failure.json()).includes('private database error'));
    failUpdate = false;
  } finally {
    Object.defineProperty(pool, 'query', queryDescriptor); Object.defineProperty(pool, 'connect', connectDescriptor);
    for (const [key, value] of Object.entries(previousEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  checks.push('API enforces session/origin/byte limits, read-only preview, transaction commit and whole-batch rollback on stale revision or database failure');

  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const c = await pool.connect();
    const proxy = { query: (sql, parameters) => {
      const rewritten = sql.replaceAll('himoto.customers', 'pg_temp.qa_customers').replaceAll('himoto.stores', 'pg_temp.qa_stores');
      assert(!rewritten.includes('himoto.'), 'QA must use TEMP tables only');
      return c.query(rewritten, parameters);
    } };
    const transaction = async work => { await c.query('SAVEPOINT store_case'); try { const result = await work(); await c.query('RELEASE SAVEPOINT store_case'); return result; } catch (error) { await c.query('ROLLBACK TO SAVEPOINT store_case'); await c.query('RELEASE SAVEPOINT store_case'); throw error; } };
    try {
      await c.query('BEGIN');
      await c.query('CREATE TEMP TABLE qa_customers (LIKE himoto.customers INCLUDING DEFAULTS)');
      await c.query('ALTER TABLE pg_temp.qa_customers ALTER COLUMN id DROP DEFAULT');
      await c.query('ALTER TABLE pg_temp.qa_customers ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY');
      await c.query('CREATE TEMP TABLE qa_stores (id bigint PRIMARY KEY, store_name text, code text)');
      for (const store of stores) await c.query('INSERT INTO pg_temp.qa_stores VALUES ($1,$2,$3)', [store.id, store.name, store.code]);
      for (const customer of original) await c.query('INSERT INTO pg_temp.qa_customers (id,name,id_card,store_id) VALUES ($1,$2,$3,$4)', [customer.id, customer.name, customer.id_card, customer.store_id]);
      const before = (await c.query('SELECT * FROM pg_temp.qa_customers ORDER BY id')).rows;
      const preview = await transaction(() => server.importCustomerStores(proxy, inputs, false));
      assert.deepEqual((await c.query('SELECT * FROM pg_temp.qa_customers ORDER BY id')).rows, before);
      await c.query('ALTER TABLE pg_temp.qa_customers ADD CONSTRAINT qa_reject_second CHECK (id <> 3 OR store_id <> 23)');
      await assert.rejects(transaction(() => server.importCustomerStores(proxy, inputs, true, preview.revision)), error => error.code === '23514');
      assert.deepEqual((await c.query('SELECT * FROM pg_temp.qa_customers ORDER BY id')).rows, before);
      await c.query('ALTER TABLE pg_temp.qa_customers DROP CONSTRAINT qa_reject_second');
      const saved = await transaction(() => server.importCustomerStores(proxy, inputs, true, preview.revision));
      assert.equal(saved.updated, 2);
      const after = (await c.query('SELECT * FROM pg_temp.qa_customers ORDER BY id')).rows;
      assert.deepEqual(after.map(row => Number(row.store_id)), [23,23,23]);
      after.forEach((row, i) => { const { store_id, updated_at, ...rest } = row; const { store_id: oldStore, updated_at: oldUpdated, ...oldRest } = before[i]; assert.deepEqual(rest, oldRest); });
      assert.deepEqual(after[1], before[1]);
      await assert.rejects(transaction(() => server.importCustomerStores(proxy, inputs, true, preview.revision)), error => error.status === 409);
      const repeated = await transaction(() => server.importCustomerStores(proxy, inputs, false));
      assert.equal(repeated.ready, 0); assert.equal(repeated.unchanged, 3);
      checks.push('real PostgreSQL TEMP with production customer schema verifies mixed-row update, preservation of all other fields/unchanged rows, constraint-failure atomic rollback and replay protection');
    } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks, permanentBusinessWrites: 0, data: process.argv.includes('--live-temp') ? 'mocks and PostgreSQL TEMP only' : 'mocks only' }, null, 2));
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });

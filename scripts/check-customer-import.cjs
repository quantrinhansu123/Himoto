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
const shared = load(path.join(root, 'lib/management/customer-import'));
const excel = load(path.join(root, 'lib/management/customer-excel'));
const server = load(path.join(root, 'lib/server/customer-import'));
const columns = shared.CUSTOMER_IMPORT_COLUMNS;
const stores = [{ id: 2, name: 'Cơ sở QA', code: 'CS-QA' }];
const values = { name: 'Khách QA', phone: '0900000001', id_card: '001234567890', email: 'qa@example.invalid', address: 'Địa chỉ QA', store: 'Cơ sở QA', status: '', warning_note: '' };
const input = (patch = {}, rowNumber = 2) => ({ rowNumber, values: { ...values, ...patch } });
function workbook(data, reversed = false) {
  const book = new Excel.Workbook();
  const sheet = book.addWorksheet('Khách hàng');
  const fields = reversed ? [...columns].reverse() : columns;
  sheet.addRow(fields.map(column => column.label + (column.required ? ' *' : '')));
  for (const row of data) sheet.addRow(fields.map(column => row[column.key] ?? ''));
  return book;
}

async function run() {
  const checks = [];
  const templateBuffer = await excel.createCustomerTemplate(stores);
  const template = new Excel.Workbook(); await template.xlsx.load(templateBuffer);
  assert.deepEqual(template.worksheets.map(sheet => sheet.name), ['Khách hàng', 'Cơ sở', 'Hướng dẫn']);
  assert.equal(template.getWorksheet('Cơ sở').getCell('C2').value, stores[0].name);
  assert.equal(template.getWorksheet('Khách hàng').getColumn(2).numFmt, '@');
  assert.equal(template.getWorksheet('Khách hàng').getCell('B2').numFmt, '@');
  assert.equal(template.getWorksheet('Khách hàng').getCell('F2').dataValidation.type, 'list');
  assert.throws(() => excel.parseCustomerWorkbook(template), /chưa có khách hàng/);
  template.getWorksheet('Khách hàng').getRow(2).values = columns.map(column => values[column.key]);
  const roundtrip = new Excel.Workbook(); await roundtrip.xlsx.load(await template.xlsx.writeBuffer());
  const parsed = excel.parseCustomerWorkbook(roundtrip);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].values.id_card, '001234567890'); assert.equal(parsed[0].values.phone, '0900000001');
  checks.push('blank template contains live branches, dropdowns, Text columns and no sample customers; XLSX roundtrip preserves leading zeros');

  const reversed = excel.parseCustomerWorkbook(workbook([values], true));
  assert.deepEqual(reversed[0].values, values);
  const missing = workbook([values]); missing.worksheets[0].getCell('A1').value = null;
  assert.throws(() => excel.parseCustomerWorkbook(missing), /Thiếu cột/);
  const unknown = workbook([values]); unknown.worksheets[0].getCell('I1').value = 'Unsupported';
  assert.throws(() => excel.parseCustomerWorkbook(unknown), /không thuộc mẫu/);
  const duplicateHeader = workbook([values]); duplicateHeader.worksheets[0].getCell('I1').value = 'name';
  assert.throws(() => excel.parseCustomerWorkbook(duplicateHeader), /nhiều lần/);
  const hiddenData = workbook([values]); hiddenData.worksheets[0].getCell('I2').value = 'Unmapped';
  assert.match(excel.parseCustomerWorkbook(hiddenData)[0].errors.join(' '), /ngoài các cột/);
  checks.push('column mapping supports reordered headers and rejects missing/duplicate/unknown headers and unmapped values');

  const numeric = workbook([{ ...values, id_card: 1234567890, phone: 900000001 }]);
  assert.equal(excel.parseCustomerWorkbook(numeric)[0].errors.length, 2);
  numeric.worksheets[0].getCell('C2').numFmt = '000000000000';
  numeric.worksheets[0].getCell('B2').numFmt = '0000000000';
  const padded = excel.parseCustomerWorkbook(numeric)[0];
  assert.equal(padded.errors.length, 0); assert.equal(padded.values.id_card, values.id_card); assert.equal(padded.values.phone, values.phone);
  numeric.worksheets[0].getCell('A2').value = { formula: '"QA"', result: 'QA' };
  assert.match(excel.parseCustomerWorkbook(numeric)[0].errors.join(' '), /công thức/);
  await assert.rejects(excel.readCustomerExcel({ name: 'test.xls', size: 1 }), /\.xlsx/);
  await assert.rejects(excel.readCustomerExcel({ name: 'test.xlsx', size: 6 * 1024 * 1024 }), /5 MB/);
  await assert.rejects(excel.readCustomerExcel({ name: 'test.xlsx', size: 5, arrayBuffer: async () => new ArrayBuffer(5) }), /Không đọc được/);
  const many = workbook(Array.from({ length: 1001 }, () => values));
  assert.throws(() => excel.parseCustomerWorkbook(many), /giới hạn/);
  checks.push('numeric identity cells are rejected unless explicit zero formatting preserves digits; formulas, wrong file types, corrupt/oversized/overlong workbooks are rejected');

  let result = shared.validateCustomerImport([input()], stores, []);
  assert.equal(result.valid, 1); assert.equal(result.rows[0].store_id, 2); assert.equal(result.rows[0].values.status, 'active');
  assert.equal(shared.validateCustomerImport([input({ store: '2', status: 'Nợ xấu' })], stores, []).rows[0].values.status, 'blacklist');
  assert.equal(shared.validateCustomerImport([input({ store: 'cs-qa', warning_note: 'Ghi chú QA' })], stores, []).rows[0].values.status, 'warning');
  for (const patch of [{ phone: '090' }, { id_card: '1234567890' }, { name: '' }, { address: '' }, { email: 'x' }, { store: 'Missing' }, { status: 'Unsupported' }, { status: 'Cần lưu ý' }, { name: 'x'.repeat(192) }, { address: 'x'.repeat(192) }, { warning_note: 'x'.repeat(192) }]) {
    assert.equal(shared.validateCustomerImport([input(patch)], stores, []).invalid, 1);
  }
  result = shared.validateCustomerImport([input(), input({ name: 'Other' }, 4)], stores, []);
  assert.equal(result.duplicate, 2); assert(result.rows.every(row => row.errors.some(error => /trong file/.test(error))));
  result = shared.validateCustomerImport([input({ phone: '+84900000001' })], stores, [{ id: 9, phone: '0900000001' }]);
  assert.equal(result.duplicate, 1);
  assert.equal(shared.validateCustomerImport([input({ phone: '0084900000001' })], stores, [{ id: 9, phone: '0900000001' }]).duplicate, 1);
  assert.equal(shared.validateCustomerImport([input()], stores, [{ id: 9, id_card: '001 234 567 890' }]).duplicate, 1);
  checks.push('server validates required fields, branches, statuses and warnings; all conflicting file rows and existing phone/ID matches are skipped, including +84/0084');

  const partial = input({ id_card: '', address: '', status: 'Chưa hoàn tất', warning_note: 'Bổ sung hồ sơ QA' });
  assert.equal(shared.validateCustomerImport([partial], stores, []).invalid, 1);
  result = shared.validateCustomerImport([partial], stores, [], true);
  assert.equal(result.valid, 1); assert.equal(result.incomplete, 1); assert.equal(result.rows[0].values.status, 'draft'); assert.equal(result.rows[0].warnings.length, 2);
  for (const patch of [{ status: 'active' }, { status: 'warning' }, { status: 'blacklist' }, { phone: '' }, { name: '' }, { store: '' }, { id_card: '1234' }]) assert.equal(shared.validateCustomerImport([{ ...partial, values: { ...partial.values, ...patch } }], stores, [], true).invalid, 1);
  result = shared.validateCustomerImport([partial, { ...partial, rowNumber: 3, values: { ...partial.values, phone: '0900000008' } }], stores, [{ id: 9, id_card: null }], true);
  assert.equal(result.valid, 2); assert.equal(result.duplicate, 0);
  const repository = load(path.join(root, 'lib/management/repository'));
  assert.equal(repository.mapApiRow('customers', { id: 1, name: 'QA', status: 'draft', warning: 'Bổ sung QA' }).status, 'draft');
  checks.push('incomplete mode requires explicit opt-in and draft status, keeps mandatory phone/name/store, rejects malformed nonblank ID, warns about missing documents and preserves draft status with notes');

  assert.throws(() => server.customerImportRequest({ rows: [], commit: true }));
  assert.throws(() => server.customerImportRequest({ rows: [input(), input()], commit: false }));
  assert.throws(() => server.customerImportRequest({ rows: [input({ phone: 900000001 })], commit: false }));
  assert.throws(() => server.customerImportRequest({ rows: [input()], commit: 'true' }));
  assert.throws(() => server.customerImportRequest({ rows: [partial], commit: true, allowIncomplete: 'true' }));
  assert.equal(server.customerImportRequest({ rows: [partial], commit: false }).allowIncomplete, false);
  assert.equal(server.customerImportRequest({ rows: [partial], commit: false, allowIncomplete: true }).allowIncomplete, true);
  assert.throws(() => server.customerImportRequest({ rows: Array.from({ length: 1001 }, (_, index) => input({}, index + 2)), commit: false }));
  checks.push('API input validation rejects malformed rows, types, duplicate row numbers, missing mode and batches over 1000');

  let existing = [], failInsert = false;
  const queries = [];
  const client = { query: async (sql, parameters) => {
    queries.push({ sql, parameters });
    if (sql.includes('FROM himoto.stores')) return { rows: stores, rowCount: stores.length };
    if (sql.includes('FROM himoto.customers')) return { rows: existing, rowCount: existing.length };
    if (sql.startsWith('INSERT')) {
      if (failInsert) throw new Error('mock insert failure');
      return { rows: [{ id: 100 }], rowCount: parameters.length / 8 };
    }
    return { rows: [], rowCount: 0 };
  }, release() { queries.push({ sql: 'RELEASE' }); } };
  result = await server.importDatabaseCustomers(client, [input()], false);
  assert.equal(result.valid, 1); assert(queries.every(query => query.sql.startsWith('SELECT')));
  queries.length = 0;
  result = await server.importDatabaseCustomers(client, [input({ name: "QA'); DROP TABLE customers; --", warning_note: 'Note QA' })], true);
  assert.equal(result.imported, 1); assert.equal(result.committed, true);
  assert(queries.findIndex(query => query.sql.startsWith('LOCK TABLE')) < queries.findIndex(query => query.sql.includes('FROM himoto.customers')));
  const insert = queries.find(query => query.sql.startsWith('INSERT'));
  assert(!insert.sql.includes('DROP TABLE')); assert.equal(insert.parameters[0], "QA'); DROP TABLE customers; --");
  assert.equal(insert.parameters[4], values.id_card); assert.equal(insert.parameters[6], 2); assert.equal(insert.parameters[7], 'Note QA');
  existing = [{ id: 9, id_card: values.id_card }]; queries.length = 0;
  await assert.rejects(server.importDatabaseCustomers(client, [input()], true), error => error.status === 409);
  assert(!queries.some(query => query.sql.startsWith('INSERT')));
  existing = [];
  checks.push('preview performs SELECT only; commit locks before rechecking, uses parameterized bulk insert, preserves notes and rejects newly introduced duplicates');

  queries.length = 0;
  result = await server.importDatabaseCustomers(client, [partial], true, true);
  const partialInsert = queries.find(query => query.sql.startsWith('INSERT'));
  assert.equal(result.imported, 1); assert.equal(partialInsert.parameters[3], null); assert.equal(partialInsert.parameters[4], null); assert.equal(partialInsert.parameters[5], 0);
  await assert.rejects(server.importDatabaseCustomers(client, [partial], true), error => error.status === 409);
  checks.push('incomplete insert stores missing address/identity as NULL and status 0; commit rechecks opt-in rather than trusting preview');

  const session = load(path.join(root, 'lib/server/management-session'));
  const pool = load(path.join(root, 'lib/server/himoto-database')).himotoPool;
  const oldEnv = { DATABASE_URL: process.env.DATABASE_URL, MANAGEMENT_SESSION_SECRET: process.env.MANAGEMENT_SESSION_SECRET, NODE_ENV: process.env.NODE_ENV };
  const queryDescriptor = Object.getOwnPropertyDescriptor(pool, 'query'), connectDescriptor = Object.getOwnPropertyDescriptor(pool, 'connect');
  try {
    process.env.DATABASE_URL = 'postgresql://mock.invalid/test';
    process.env.MANAGEMENT_SESSION_SECRET = 'customer-import-tests-only-not-a-real-secret'; process.env.NODE_ENV = 'production';
    Object.defineProperty(pool, 'query', { configurable: true, value: async () => ({ rows: [{ id: 7, name: 'QA', email: 'qa@example.invalid', status: 'active', role_id: 1 }] }) });
    Object.defineProperty(pool, 'connect', { configurable: true, value: async () => client });
    const route = load(path.join(root, 'app/api/auth/customers/import/route'));
    const cookie = `${session.SESSION_COOKIE}=${session.signSession(7)}`;
    const send = (body, options = {}) => route.POST(new NextRequest('https://himoto.example/api/auth/customers/import', {
      method: 'POST', headers: { Host: 'himoto.example', Origin: 'https://himoto.example', Cookie: cookie, 'Content-Type': 'application/json', ...(options.headers || {}) }, body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
    queries.length = 0;
    assert.equal((await send({ rows: [input()], commit: false }, { headers: { Cookie: '' } })).status, 401);
    assert.equal((await send({ rows: [input()], commit: true }, { headers: { Origin: 'https://other.invalid' } })).status, 403);
    assert.equal((await send('{')).status, 400);
    assert.equal((await send({ rows: [input()], commit: false }, { headers: { 'Content-Length': String(server.CUSTOMER_IMPORT_BODY_LIMIT + 1) } })).status, 413);
    assert.equal((await send(' '.repeat(server.CUSTOMER_IMPORT_BODY_LIMIT + 1))).status, 413);
    assert.equal(queries.length, 0);
    const preview = await send({ rows: [input()], commit: false });
    assert.equal(preview.status, 200); assert.equal(preview.headers.get('cache-control'), 'no-store');
    assert.equal(queries[0].sql, 'BEGIN READ ONLY'); assert(!queries.some(query => query.sql.startsWith('INSERT')));
    queries.length = 0;
    assert.equal((await send({ rows: [input()], commit: true })).status, 201);
    assert.equal(queries.at(-2).sql, 'COMMIT'); assert.equal(queries.at(-1).sql, 'RELEASE');
    assert.equal((await send({ rows: [partial], commit: true })).status, 409);
    assert.equal((await send({ rows: [partial], commit: true, allowIncomplete: true })).status, 201);
    existing = [{ id: 9, phone: values.phone }]; queries.length = 0;
    assert.equal((await send({ rows: [input()], commit: true })).status, 409); assert.equal(queries.at(-2).sql, 'ROLLBACK');
    existing = []; failInsert = true; queries.length = 0;
    const failed = await send({ rows: [input()], commit: true });
    assert.equal(failed.status, 500); assert.equal(queries.at(-2).sql, 'ROLLBACK'); assert(!JSON.stringify(await failed.json()).includes('mock insert failure'));
  } finally {
    Object.defineProperty(pool, 'query', queryDescriptor); Object.defineProperty(pool, 'connect', connectDescriptor);
    for (const [key, value] of Object.entries(oldEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  checks.push('route enforces real session/origin guards and byte limits; read-only preview, successful commit, conflict and insert-failure rollback verified with DB mocks');
  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
    const proxy = { query: (sql, params) => {
      const rewritten = sql.replaceAll('himoto.customers', 'pg_temp.qa_customers').replaceAll('himoto.stores', 'pg_temp.qa_stores');
      assert(!rewritten.includes('himoto.'), 'Business tables must be TEMP tables in QA');
      return c.query(rewritten, params);
    } };
    const transaction = async work => { await c.query('SAVEPOINT customer_case'); try { const result = await work(); await c.query('RELEASE SAVEPOINT customer_case'); return result; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT customer_case'); await c.query('RELEASE SAVEPOINT customer_case'); throw e; } };
    try {
      await c.query('BEGIN');
      await c.query(`CREATE TEMP TABLE qa_stores(id bigint PRIMARY KEY,store_name text,code text);
        CREATE TEMP TABLE qa_customers(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,name varchar(191) NOT NULL,phone varchar(191),email varchar(191),address varchar(191),id_card varchar(191),status smallint NOT NULL DEFAULT 1,store_id integer,warning varchar(191),created_at timestamptz,updated_at timestamptz);
        INSERT INTO qa_stores VALUES(2,'Cơ sở QA','CS-QA');`);
      assert.equal((await transaction(() => server.importDatabaseCustomers(proxy, [partial], false, true))).valid, 1);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM pg_temp.qa_customers')).rows[0].n, 0);
      const inserted = await transaction(() => server.importDatabaseCustomers(proxy, [partial], true, true));
      assert.equal(inserted.imported, 1);
      const saved = (await c.query('SELECT * FROM pg_temp.qa_customers')).rows[0];
      assert.equal(saved.id_card, null); assert.equal(saved.address, null); assert.equal(saved.status, 0); assert.equal(saved.warning, partial.values.warning_note); assert.equal(saved.phone, values.phone);
      await assert.rejects(transaction(() => server.importDatabaseCustomers(proxy, [partial], true, true)), e => e.status === 409);
      const second = { ...partial, rowNumber: 3, values: { ...partial.values, phone: '0900000008' } };
      await c.query("ALTER TABLE pg_temp.qa_customers ADD CONSTRAINT reject_test_phone CHECK(phone <> '0900000008')");
      await assert.rejects(transaction(() => server.importDatabaseCustomers(proxy, [input({ phone: '0900000007' }), second], true, true)), e => e.code === '23514');
      assert.equal((await c.query('SELECT count(*)::int AS n FROM pg_temp.qa_customers')).rows[0].n, 1);
      checks.push('real PostgreSQL TEMP tables verify read-only preview, NULL fields/status 0, duplicate rejection and whole-batch rollback on an insert constraint failure');
    } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks, permanentBusinessWrites: 0, databaseWrites: process.argv.includes('--live-temp') ? 'TEMP tables and mocks only' : 'mock only' }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

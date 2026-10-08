const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(localRequire, module, module.exports);
  return module.exports;
}
async function main() {
  const { parseBlacklistChange, changeCustomerBlacklist } = load(path.join(root, 'lib/server/customer-blacklist'));
  const { updateCustomerBlacklist } = load(path.join(root, 'lib/management/customer-blacklist'));
  const checks = [];
  for (const input of [null, [], {}, { blacklisted: 'false', revision: '1' }, { blacklisted: false, revision: '' }, { blacklisted: true, revision: 1 }, { blacklisted: true, revision: '1', name: 'overwrite' }]) assert.throws(() => parseBlacklistChange(input));
  assert.deepEqual(parseBlacklistChange({ blacklisted: false, revision: '123' }), { blacklisted: false, revision: '123' });
  checks.push('typed explicit state and revision required; profile fields cannot be submitted');
  let revision = '123', exists = true;
  const queries = [];
  const client = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.startsWith('SELECT')) return { rowCount: exists ? 1 : 0, rows: exists ? [{ id: '7', customer_revision: revision }] : [] };
    if (sql.startsWith('UPDATE')) return { rowCount: 1, rows: [{ id: '7', status: 'blacklist', customer_revision: '124' }] };
    return { rows: [] };
  } };
  const row = await changeCustomerBlacklist(client, 7, { blacklisted: true, revision });
  assert.equal(row.status, 'blacklist');
  assert(queries.find(q => q.sql.startsWith('SELECT')).sql.endsWith('FOR UPDATE'));
  assert(queries.findIndex(q => q.sql.startsWith('LOCK TABLE')) < queries.findIndex(q => q.sql.startsWith('SELECT')));
  const update = queries.find(q => q.sql.startsWith('UPDATE'));
  assert.deepEqual(update.params, [7, true]);
  assert.match(update.sql, /SET status = CASE/);
  assert(!/SET (name|phone|id_card|warning|store_id)|INSERT|DELETE/.test(update.sql));
  queries.length = 0; revision = '125';
  await assert.rejects(changeCustomerBlacklist(client, 7, { blacklisted: false, revision: '123' }), error => error.status === 409);
  assert(!queries.some(q => q.sql.startsWith('UPDATE')));
  exists = false;
  await assert.rejects(changeCustomerBlacklist(client, 7, { blacklisted: false, revision: '125' }), error => error.status === 404);
  await assert.rejects(changeCustomerBlacklist(client, -1, { blacklisted: false, revision: '125' }));
  checks.push('row lock and stale revision prevent overwrites; update touches only status/timestamp; absent customer rejected');

  const originalFetch = global.fetch;
  const customer = { id: 7, code: 'QA-7', name: 'QA', status: 'active', customer_revision: '123' };
  try {
    const calls = [];
    global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ status: 'success', data: { id: '7', status: 'blacklist', customer_revision: '124' } }) }; };
    assert.deepEqual(await updateCustomerBlacklist(customer, true), { status: 'blacklist', customer_revision: '124' });
    assert.equal(calls[0].options.method, 'PATCH'); assert.equal(calls[0].url, '/api/auth/customers/7/blacklist');
    assert.deepEqual(JSON.parse(calls[0].options.body), { blacklisted: true, revision: '123' });
    await assert.rejects(updateCustomerBlacklist({ ...customer, customer_revision: '' }, true));
    assert.equal(calls.length, 1);
    for (const response of [
      { ok: false, json: async () => ({ message: 'conflict' }) },
      { ok: true, json: async () => ({ status: 'success', data: { id: 8, status: 'blacklist', customer_revision: '124' } }) },
      { ok: true, json: async () => ({ status: 'success', data: { id: 7, status: 'active', customer_revision: '124' } }) },
      { ok: true, json: async () => ({ status: 'success', data: { id: 7, status: 'blacklist' } }) },
    ]) { global.fetch = async () => response; await assert.rejects(updateCustomerBlacklist(customer, true)); }
    global.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(updateCustomerBlacklist(customer, true));
    checks.push('client sends only state/revision; no optimistic success for failed, lost, mismatched or incomplete response');
  } finally { global.fetch = originalFetch; }

  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
    let localUpdates = 0;
    try {
      await c.query('BEGIN');
      await c.query('CREATE TEMP TABLE qa_blacklist_customers (LIKE himoto.customers INCLUDING DEFAULTS) ON COMMIT DROP');
      await c.query('ALTER TABLE qa_blacklist_customers ALTER COLUMN id DROP DEFAULT');
      await c.query('ALTER TABLE qa_blacklist_customers ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY');
      await c.query(`INSERT INTO qa_blacklist_customers (name,phone,address,id_card,status,warning,store_id,created_at,updated_at)
        VALUES ('QA active','0900000001','QA address','001234567890',1,NULL,23,'2026-01-01','2026-01-01'),
          ('QA warning','0900000002','QA address','001234567891',1,'Giữ cảnh báo',31,'2026-01-01','2026-01-01'),
          ('QA draft','0900000003',NULL,NULL,0,'Giữ ghi chú',23,'2026-01-01','2026-01-01')`);
      const before = (await c.query('SELECT *,xmin::text AS customer_revision FROM qa_blacklist_customers ORDER BY id')).rows;
      const tempClient = { query: async (sql, params) => {
        if (!sql.startsWith('SET LOCAL') && !sql.includes('himoto.customers')) throw new Error('Unexpected SQL');
        if (sql.startsWith('UPDATE')) localUpdates++;
        return c.query(sql.replaceAll('himoto.customers', 'pg_temp.qa_blacklist_customers'), params);
      } };
      for (const original of before) {
        const marked = await changeCustomerBlacklist(tempClient, Number(original.id), { blacklisted: true, revision: original.customer_revision });
        assert.equal(marked.status, 'blacklist');
        const afterMark = (await c.query('SELECT * FROM qa_blacklist_customers WHERE id=$1', [original.id])).rows[0];
        for (const field of Object.keys(afterMark).filter(key => !['status', 'updated_at'].includes(key))) assert.deepEqual(afterMark[field], original[field]);
        const removed = await changeCustomerBlacklist(tempClient, Number(original.id), { blacklisted: false, revision: marked.customer_revision });
        assert.equal(removed.status, original.name === 'QA active' ? 'active' : original.name === 'QA warning' ? 'warning' : 'draft');
        const restored = (await c.query('SELECT * FROM qa_blacklist_customers WHERE id=$1', [original.id])).rows[0];
        for (const field of Object.keys(restored).filter(key => key !== 'updated_at')) assert.deepEqual(restored[field], original[field]);
      }
      await assert.rejects(changeCustomerBlacklist(tempClient, 1, { blacklisted: false, revision: '0' }), error => error.status === 409);
      assert.equal(localUpdates, 6);
      checks.push('PostgreSQL TEMP: mark/remove active, warning and incomplete profiles; every other field preserved; private identity; outer rollback; zero operational writes');
    } finally { await c.query('ROLLBACK'); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

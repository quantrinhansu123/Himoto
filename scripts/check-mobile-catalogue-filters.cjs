require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const catalogue = load(path.join(root, 'lib/server/mobile-catalogue'));
const table = load(path.join(root, 'lib/server/management-table'));
const domain = load(path.join(root, 'lib/management/management-table'));
const { dataAccess } = load(path.join(root, 'lib/server/access-context'));
const { himotoPool } = load(path.join(root, 'lib/server/himoto-database'));
const { isPage } = load(path.resolve('mobile/src/lib/response-validation'));
const descriptor = Object.getOwnPropertyDescriptor(himotoPool, 'connect');
const original = table.readManagementTable, checks = [], sql = [], scopes = [];
const actor = { id: 7, role: 'staff', access_role: 'custom', store_id: 23, scope_all: false, permissions: ['contracts.read'] };
const source = [
  { id: 1, code: 'QA-1', customer_id: 101, customer_name: 'Same Name', name: 'Same Name', status: 'draft', store_id: 23 },
  { id: 2, code: 'QA-2', customer_id: 101, customer_name: 'Same Name', name: 'Same Name', status: 'completed', store_id: 23 },
  { id: 3, code: 'QA-3', customer_id: 102, customer_name: 'Same Name', name: 'Same Name', status: 'draft', store_id: 23 },
  { id: 4, code: 'QA-4', customer_id: 101, customer_name: 'Same Name', name: 'Same Name', status: 'draft', store_id: 24 },
];
let connects = 0;
Object.defineProperty(himotoPool, 'connect', { configurable: true, value: async () => {
  connects++; scopes.push(dataAccess.getStore());
  return { release() {}, async query(statement) { sql.push(statement); return { rows: [] }; } };
} });
async function main() {
  try {
    for (const invalid of ['customer_id=', 'customer_id=0', 'customer_id=01', 'customer_id=1e2', 'customer_id=101%20OR%201=1',
      'customer_id=101&customer_id=102', 'filter_customer_id=101', 'statistics=0', 'statistics=1&statistics=1', 'statistics_only=1']) {
      await assert.rejects(() => catalogue.readMobilePage(actor, 'contracts', new URLSearchParams(invalid)), error => error.status === 400);
    }
    for (const kind of ['customers','vehicles']) for (const value of ['customer_id=101','statistics=1'])
      assert.throws(() => catalogue.mobileTableParams(new URLSearchParams(value), kind));
    assert.equal(connects, 0);
    checks.push('Strict singular customer IDs and explicit statistics mode apply only to contracts; malformed/duplicate/raw filters fail before DB access');
    table.readManagementTable = async (_db, kind, params) => {
      assert.equal(kind, 'contracts'); assert.equal(params.get('filter_customer_id'), '101'); assert(!params.has('customer_id'));
      const scope = dataAccess.getStore(); assert.equal(scope.scope_all, false); assert.equal(scope.store_id, 23);
      // Synthetic RLS boundary excludes the foreign branch before the real projection.
      const rows = source.filter(row => row.store_id === scope.store_id);
      const projected = domain.projectManagementTable(rows, table.parseManagementTable('contracts', params), false);
      return params.get('statistics_only') === '1' ? { ...projected, rows: [] } : projected;
    };
    const filtered = await catalogue.readMobilePage(actor, 'contracts', new URLSearchParams('customer_id=101&status=draft'));
    assert(isPage(filtered)); assert.deepEqual(filtered.rows.map(row => row.id), [1]); assert.equal(filtered.total, 1);
    assert.equal(filtered.tabCount, undefined);
    const stats = await catalogue.readMobilePage(actor, 'contracts', new URLSearchParams('statistics=1&customer_id=101&size=1'));
    assert(isPage(stats)); assert.deepEqual(stats.rows, []); assert.equal(stats.tabCount, 2);
    assert.deepEqual(new Map(stats.statusCounts), new Map([['draft',1],['completed',1]]));
    assert.equal(stats.total, 2); assert(scopes.every(scope => scope.scope_all === false && scope.store_id === 23));
    assert(sql.every(statement => /^(BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY|SET LOCAL|COMMIT)/.test(statement)));
    const none = await catalogue.readMobilePage(actor, 'contracts', new URLSearchParams('customer_id=101&status=cancelled'));
    assert.equal(none.total, 0); assert.deepEqual(none.rows, []); assert.equal(stats.tabCount, 2);
    await assert.rejects(() => catalogue.readMobilePage({ ...actor, permissions: [] }, 'contracts', new URLSearchParams('customer_id=101')), error => error.status === 403);
    checks.push('Exact ID excludes another customer with the same name; branch context stays scoped, independent counters include all lifecycle states while an empty selected tab stays zero');
    table.readManagementTable = original;
    const statements = [];
    const read = await table.readManagementTable({ async query(statement) {
      statements.push(statement);
      if (statement.startsWith('SELECT count(*)::int AS total')) return { rows: [{ total: 0 }] };
      if (statement.includes(' LIMIT $1 OFFSET $2')) return { rows: [] };
      throw Error('Unexpected query: ' + statement.slice(0,100));
    } }, 'contracts', catalogue.mobileTableParams(new URLSearchParams('customer_id=101&store=23')));
    assert.equal(read.total, 0); assert.equal(statements.length, 2);
    assert(statements.every(statement => statement.includes('o.customer_id=101')));
    assert(statements.every(statement => statement.includes('o.deleted_at IS NULL')));
    checks.push('The real paged SQL reader applies exact customer identity before counting and LIMIT without hydrating unrelated contracts');
    assert(!isPage({ ...stats, tabCount: -1 })); assert(!isPage({ ...stats, tabCount: '2' }));
    assert(isPage({ ...stats, tabCount: undefined }));
    checks.push('Counter validation rejects malformed totals while previous mobile page responses remain readable');
    console.log(JSON.stringify({ passed: checks.length, checks, operationalWrites: 0, realDatabaseUsed: false }, null, 2));
  } finally {
    table.readManagementTable = original;
    Object.defineProperty(himotoPool, 'connect', descriptor);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

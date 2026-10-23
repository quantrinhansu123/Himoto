const assert = require('node:assert/strict');
const path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const { listCashbook, CashbookQueryError } = load(path.join(root, 'lib/server/cashbook-list'));
const { mapCashbookRow, loadCashbookPage, DEFAULT_CASHBOOK_PAGINATION } = load(path.join(root, 'lib/management/cashbook-repository'));
const { filterCashbookRows, EMPTY_CASHBOOK_FILTERS } = load(path.join(root, 'lib/management/cashbook'));

async function main() {
  const checks = [];
  const never = { query() { throw Error('Validation reached database'); } };
  for (const query of ['income_limit=1000', 'income_page=-1', 'income_sort=id;DROP TABLE', 'expense_direction=invalid', 'actor=id:abc', 'from=2026-02-30', 'from=2026-10-03&to=2026-10-02', 'store_id=1 OR 1=1', 'mode=unknown']) {
    await assert.rejects(listCashbook(new URLSearchParams(query), never), CashbookQueryError);
  }
  checks.push('invalid dates, branch/actor IDs, oversized pages and injected sorting fail before querying');
  const originalFetch = global.fetch;
  try {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ status: 'success', data: { total: 76483,
        income: { total: 52889, amount: 100, page: 2, pageSize: 5, rows: [{ id: 10, type: 'in' }] },
        expense: { total: 23594, amount: 50, page: 1, pageSize: 5, rows: [{ id: 11, type: 'out' }] }, actors: [['id:7', 'QA · #7']] } }) };
    };
    const result = await loadCashbookPage({ ...EMPTY_CASHBOOK_FILTERS, search: 'QA', actor: 'id:7', startDate: '2026-10-02', endDate: '2026-10-02' }, '31', { ...DEFAULT_CASHBOOK_PAGINATION, page: 2 }, DEFAULT_CASHBOOK_PAGINATION);
    assert.equal(calls.length, 1); assert.equal(result.total, 76483); assert.equal(result.income.total, 52889);
    assert.equal(result.income.rows.length, 1); assert.equal(result.income.page, 2);
    const query = new URL(calls[0].url, 'http://localhost').searchParams;
    assert.equal(query.get('income_page'), '2'); assert.equal(query.get('expense_page'), '1');
    assert.equal(query.get('actor'), 'id:7'); assert.equal(query.get('store_id'), '31'); assert.equal(calls[0].options.method, 'GET');
    const aborted = new AbortController(); aborted.abort();
    global.fetch = async (_, options) => { options.signal?.throwIfAborted(); throw Error('unexpected request'); };
    await assert.rejects(loadCashbookPage(EMPTY_CASHBOOK_FILTERS, 'all', DEFAULT_CASHBOOK_PAGINATION, DEFAULT_CASHBOOK_PAGINATION, aborted.signal), { name: 'AbortError' });
    checks.push('one bounded GET loads only visible rows, preserves full totals and independent pages, forwards shared filters and cancellation');
  } finally { global.fetch = originalFetch; }
  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const { himotoPool } = load(path.join(root, 'lib/server/himoto-database'));
    const client = await himotoPool.connect();
    try {
      await client.query('BEGIN');
      for (const table of ['transactions', 'users', 'cash', 'orders', 'battery_contracts', 'stores', 'banks', 'management_contract_payments']) {
        await client.query(`CREATE TEMP TABLE ${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
      }
      await client.query("INSERT INTO pg_temp.users(id,name) VALUES (7,'Trần Hoài Linh'),(8,'Trần Hoài Linh')");
      await client.query("INSERT INTO pg_temp.stores(id,store_name) VALUES (1,'Cơ sở QA'),(2,'Cơ sở khác')");
      await client.query("INSERT INTO pg_temp.orders(id,contract_number) VALUES (42,'HD-QA-42')");
      await client.query(`INSERT INTO pg_temp.transactions(id,type,user_id,store_id,created_at,value,name,note,order_id) VALUES
        (1,'in',7,1,'2026-10-01T16:59:59Z',100,'order:payment','Trước ngày',42),
        (2,'in',7,1,'2026-10-01T17:00:00Z',200,'order:payment','Đầu ngày',42),
        (3,'addon',8,1,'2026-10-02T16:59:59Z',0,'order:extra','Cuối ngày',42),
        (4,'out',7,1,'2026-10-02T08:00:00Z',300,'Bảo dưỡng','Chi QA',42),
        (5,'out',7,1,'2026-10-02T17:00:00Z',400,'Bảo dưỡng','Sau ngày',42),
        (6,'in',7,2,NULL,500,NULL,NULL,42),
        (7,'out',8,2,'2026-10-02T08:00:00Z',600,'Chi khác',NULL,42),
        (8,'in',999,1,'2026-10-02T09:00:00Z',700,NULL,'100%_literal',42)`);
      await client.query(`INSERT INTO pg_temp.transactions(id,type,user_id,store_id,created_at,value,name,note,order_id)
        SELECT 100+g,'in',7,1,'2026-10-02T10:00:00Z'::timestamptz+g*interval '1 minute',g*100,'order:payment','Thu QA',42 FROM generate_series(1,12) g`);
      await client.query("UPDATE pg_temp.transactions SET status='approved'");
      await client.query("INSERT INTO pg_temp.users(id,name) VALUES (9,'Người lập phiếu hủy')");
      await client.query(`INSERT INTO pg_temp.transactions(id,type,user_id,store_id,created_at,value,name,note,order_id,status) VALUES
        (900,'in',9,1,'2026-10-02T10:00:00Z',99999999,'order:payment','Phiếu thử đã hủy',42,'cancelled'),
        (901,'out',9,1,'2026-10-02T10:00:00Z',88888888,'Chi thử','Chờ duyệt',42,'pending')`);
      // All application SQL is redirected to these disposable copies; no real writes or sequences.
      const database = { query: (sql, values) => client.query(sql.replaceAll('himoto.', 'pg_temp.'), values) };
      const full = JSON.parse(JSON.stringify(await listCashbook(new URLSearchParams('mode=all'), database))).map(mapCashbookRow);
      assert.equal(full.length,20);
      assert(!full.some(row=>['900','901'].includes(row.id)));
      const approved = await listCashbook(new URLSearchParams(), database);
      assert(!approved.actors.some(([id])=>id==='id:9'));
      checks.push('cancelled/test and pending vouchers do not affect cashbook rows, totals, exports, selection IDs or creator filters');
      for (const [filters, store] of [
        [EMPTY_CASHBOOK_FILTERS, 'all'],
        [{ ...EMPTY_CASHBOOK_FILTERS, startDate: '2026-10-02', endDate: '2026-10-02' }, '1'],
        [{ ...EMPTY_CASHBOOK_FILTERS, actor: 'id:8' }, '1'],
        [{ ...EMPTY_CASHBOOK_FILTERS, search: 'bao duong' }, 'all'],
        [{ ...EMPTY_CASHBOOK_FILTERS, search: 'tran hoai linh', actor: 'id:7' }, '1'],
        [{ ...EMPTY_CASHBOOK_FILTERS, search: '100%_literal' }, 'all'],
        [{ ...EMPTY_CASHBOOK_FILTERS, search: 'phieu chi' }, 'all'],
        [{ ...EMPTY_CASHBOOK_FILTERS, search: 'no match' }, 'all'],
      ]) {
        const params = new URLSearchParams({ search: filters.search, actor: filters.actor, from: filters.startDate, to: filters.endDate, store_id: store });
        const result = await listCashbook(params, database), expected = filterCashbookRows(full, filters, store);
        assert.equal(result.total, filterCashbookRows(full, EMPTY_CASHBOOK_FILTERS, store).length);
        for (const type of ['income', 'expense']) {
          const rows = expected.filter(row => row.type === type);
          assert.equal(result[type].total, rows.length); assert.equal(result[type].amount, rows.reduce((sum, row) => sum + (row.amount || 0), 0));
          assert(result[type].rows.length <= 5);
          const exported = await listCashbook(new URLSearchParams({ ...Object.fromEntries(params), mode: 'all', type }), database);
          const ids = await listCashbook(new URLSearchParams({ ...Object.fromEntries(params), mode: 'ids', type }), database);
          assert.deepEqual(exported.map(row => String(row.id)).sort(), rows.map(row => row.id).sort());
          assert.deepEqual(ids.map(row => String(row.id)).sort(), rows.map(row => row.id).sort());
        }
      }
      checks.push('PostgreSQL TEMP data matches existing accent-insensitive filtering, creator identity, branch and inclusive Vietnam dates; totals/sums and full export/delete IDs span every page');
      const first = await listCashbook(new URLSearchParams('income_sort=id&income_direction=asc'), database);
      const second = await listCashbook(new URLSearchParams('income_sort=id&income_direction=asc&income_page=2'), database);
      assert.equal(first.income.rows.length, 5); assert.equal(second.income.rows.length, 5);
      assert.equal(new Set([...first.income.rows, ...second.income.rows].map(row => row.id)).size, 10);
      assert.deepEqual(first.expense.rows, second.expense.rows);
      const clamped = await listCashbook(new URLSearchParams('income_page=999&income_limit=10'), database);
      assert.equal(clamped.income.page, 2); assert.equal(clamped.income.rows.length, 7);
      checks.push('server pagination is stable, clamps removed/out-of-range pages, preserves the other table and includes addon/zero amounts');
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });

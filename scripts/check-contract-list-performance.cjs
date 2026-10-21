const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { load, root } = require('./lib/load-typescript.cjs');

async function main() {
  const { CONTRACT_LIST_SQL, CONTRACT_PAGE_SQL } = load(path.join(root, 'lib/server/contract-drafts'));
  const { readManagementTable } = load(path.join(root, 'lib/server/management-table'));
  let hydrate, indexSql;
  await readManagementTable({ async query(sql, values) {
    if (!values) { indexSql=sql; return { rows: [{id: 1, status: 'renting', vehicles: []}] }; }
    hydrate = { sql, values };
    return { rows: [{id: 1, status: 'renting', vehicles: []}] };
  } }, 'contracts', new URLSearchParams('table=1&size=10'));
  assert.equal(hydrate.sql, CONTRACT_PAGE_SQL);
  assert.deepEqual(hydrate.values, [[1]]);
  assert(!indexSql.includes('JOIN himoto.vehicles'));
  assert(indexSql.includes('min(d.rent_at)'));
  for (const params of ['search=12345','sort=vehicle_name','scope=overdue']) {
    let indexed;
    await readManagementTable({async query(sql) { indexed=sql;return {rows:[]}; }}, 'contracts', new URLSearchParams(params));
    assert(indexed.includes('LEFT JOIN himoto.vehicles'), params);
  }
  const {dataAccess}=load(path.join(root,'lib/server/access-context'));
  await dataAccess.run({id:1,access_role:'staff',store_id:1,scope_all:false,operation:'contracts.read'}, async () => {
    let scoped;
    await readManagementTable({async query(sql) { scoped=sql;return {rows:[]}; }}, 'contracts', new URLSearchParams('search=12345'));
    assert(scoped.includes('himoto.contract_vehicle_labels()'));
  });
  console.log('PASS: normal index skips vehicle labels; search, sorting and scoped access retain them');
  console.log('PASS: paged list hydrates only visible IDs');
  if (!process.argv.includes('--live-read')) return;
  require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const db = load(path.join(root, 'lib/server/himoto-database')).ownerDatabase;
  const client = await db.connect();
  console.log('Connected; starting read-only benchmark');
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='30s'");
    const ids = (await client.query('SELECT id FROM himoto.orders WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 10')).rows.map(row => row.id);
    console.log(`Selected ${ids.length} IDs`);
    const normalize = rows => [...rows].sort((a,b) => Number(a.id)-Number(b.id));
    let expected;
    for (const [name, sql] of [['before', `${CONTRACT_LIST_SQL} AND o.id=ANY($1::bigint[])`], ['after', CONTRACT_PAGE_SQL]].filter(([name]) => !process.argv.includes('--after-only') || name==='after')) {
      const samples = [];
      for (let i=0;i<3;i++) {
        await client.query('SAVEPOINT measure');
        const start = performance.now();
        let result;
        try { result = await client.query(sql, [ids]); }
        catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT measure');
          console.log(JSON.stringify({stage:name,ms:Math.round(performance.now()-start),error:error.code}));
          if (error.code !== '57014') throw error;
          break;
        }
        await client.query('RELEASE SAVEPOINT measure');
        samples.push(Math.round(performance.now()-start));
        if (!expected) expected = normalize(result.rows);
        else assert.deepEqual(normalize(result.rows), expected);
      }
      console.log(JSON.stringify({stage:name, samplesMs:samples, rows:expected?.length}));
    }
    const start = performance.now();
    const page = await readManagementTable(client, 'contracts', new URLSearchParams('table=1&size=10&recent=30'));
    console.log(JSON.stringify({stage:'complete-list', ms:Math.round(performance.now()-start), rows:page.rows.length,total:page.total}));
  } finally { await client.query('ROLLBACK'); client.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; }).finally(async () => { await globalThis.himotoPool?.end(); });

const assert = require('node:assert/strict');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { load, root } = require('./lib/load-typescript.cjs');
const { estimatedSales } = load(path.join(root, 'lib/server/estimated-sales'));
const { ownerDatabase } = load(path.join(root, 'lib/server/himoto-database'));

async function main() {
  const client = await ownerDatabase.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE qa_value_orders (
      id bigint, total text, rent_at timestamptz, store_id bigint, order_status text,
      draft_payload jsonb, deleted_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE qa_value_lines (order_id bigint, vehicle_id bigint, rent_at timestamptz,
      completed_at timestamptz, deleted_at timestamptz) ON COMMIT DROP;
      INSERT INTO qa_value_orders VALUES
      (1,'1000','2026-10-31T23:59+07',1,'renting',NULL,NULL),
      (2,'2000','2026-10-01T00:00+07',1,'completed',NULL,NULL),
      (3,'1500',NULL,2,'overdue',NULL,NULL),
      (4,'9999','2026-10-12T09:00+07',1,'draft',NULL,NULL),
      (5,'9999','2026-11-01T00:00+07',1,'renting',NULL,NULL),
      (6,'9999','2026-09-30T23:59+07',1,'renting',NULL,NULL);
      INSERT INTO qa_value_lines VALUES
      (1,11,'2026-10-31T23:59+07',NULL,NULL),(1,12,'2026-10-31T23:59+07',NULL,NULL),
      (2,21,'2026-10-01T00:00+07','2026-12-01T10:00+07',NULL),
      (3,31,'2026-10-15T09:00+07',NULL,NULL);`);
    const db = { query(sql, args) {
      sql = sql.replaceAll('himoto.order_vehicle_details', 'pg_temp.qa_value_lines').replaceAll('himoto.orders', 'pg_temp.qa_value_orders');
      assert(!sql.includes('himoto.'));
      return client.query(sql, args);
    } };
    const all = await estimatedSales(db, '2026-10-01', '2026-10-31');
    assert.equal(all.sales, 4500);
    assert.equal(all.contracts, 3);
    assert.equal(all.vehicles, 4);
    assert.equal(all.active_contracts, 2);
    assert.equal(all.finished_contracts, 1);
    assert.equal((await estimatedSales(db, '2026-10-01', '2026-10-31', 1)).sales, 3000);
    assert.equal((await estimatedSales(db, '2026-10-31', '2026-10-31', 1)).sales, 1000);
    assert.equal((await estimatedSales(db, '2026-10-01', '2026-10-31', 99)).sales, 0);
    console.log('PASS: full contract values, no multi-vehicle duplicates, no day allocation, branch/date bounds, legacy date fallback and empty scope. Real business writes: 0.');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await globalThis.himotoPool?.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

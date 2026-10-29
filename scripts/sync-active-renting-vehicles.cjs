const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, {info(){}, error(){}});
const {load, root} = require('./lib/load-typescript.cjs');
const {ownerDatabase} = load(path.join(root, 'lib/server/himoto-database'));

async function main() {
  console.log('Running sync-active-renting-vehicles migration...');
  const beforeCount = await ownerDatabase.query(`
    SELECT count(*)::int AS count
    FROM himoto.vehicles v
    WHERE v.deleted_at IS NULL
      AND COALESCE(v.current_store_id, v.store_id) = 35
      AND v.status = 'ready'
  `);
  console.log(`CS Thuê sở hữu: Số xe 'ready' trước khi sync: ${beforeCount.rows[0].count}`);

  const sql = fs.readFileSync(path.join(__dirname, '../docs/sql/2026-10-29-sync-active-renting-vehicles.sql'), 'utf8');
  await ownerDatabase.query(sql);

  const afterCount = await ownerDatabase.query(`
    SELECT count(*)::int AS count
    FROM himoto.vehicles v
    WHERE v.deleted_at IS NULL
      AND COALESCE(v.current_store_id, v.store_id) = 35
      AND v.status = 'ready'
  `);
  console.log(`CS Thuê sở hữu: Số xe 'ready' sau khi sync: ${afterCount.rows[0].count}`);

  const usingCount = await ownerDatabase.query(`
    SELECT count(*)::int AS count
    FROM himoto.vehicles v
    WHERE v.deleted_at IS NULL
      AND COALESCE(v.current_store_id, v.store_id) = 35
      AND v.status = 'using'
  `);
  console.log(`CS Thuê sở hữu: Số xe 'using' sau khi sync: ${usingCount.rows[0].count}`);

  const remainingReady = await ownerDatabase.query(`
    SELECT id, license, name, status
    FROM himoto.vehicles
    WHERE deleted_at IS NULL
      AND COALESCE(current_store_id, store_id) = 35
      AND status = 'ready'
  `);
  console.log('Các xe thực tế còn lại trong kho lưu kho CS Thuê sở hữu:');
  console.table(remainingReady.rows);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => process.exit());

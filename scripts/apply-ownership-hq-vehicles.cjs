const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, {info(){}, error(){}});
const {load, root} = require('./lib/load-typescript.cjs');
const {ownerDatabase} = load(path.join(root, 'lib/server/himoto-database'));

async function main() {
  await ownerDatabase.query(fs.readFileSync('docs/sql/2026-10-23-ownership-hq-vehicles.sql', 'utf8'));
  const stores = await ownerDatabase.query(`
    SELECT id, store_name, kind, himoto.is_headquarters_store(id) AS hq
    FROM himoto.stores
    WHERE himoto.is_headquarters_store(id) OR kind='lease_to_own'
    ORDER BY id`);
  const staff = await ownerDatabase.query(`
    SELECT count(*)::int AS n
    FROM himoto.management_account_access
    WHERE access_role='ownership_staff'
      AND permissions ? 'contracts.return'
      AND permissions ? 'vehicles.transfer'`);
  console.log(JSON.stringify({ok: true, stores: stores.rows, ownership_staff_updated: staff.rows[0].n}, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

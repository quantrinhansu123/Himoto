const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, {info(){}, error(){}});
const {load, root} = require('./lib/load-typescript.cjs');
const {ownerDatabase} = load(path.join(root, 'lib/server/himoto-database'));

async function main() {
  const sqlPath = path.resolve('docs/sql/2026-10-30-sync-contract-renewal-versions.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running migration:', sqlPath);
  const client = await ownerDatabase.connect();
  try {
    await client.query(sql);
    console.log('Migration completed successfully.');

    const vps = (await client.query("SELECT draft_payload->'management_composer'->'versions' as versions FROM himoto.orders WHERE id=57380")).rows[0];
    console.log('VPS-31414 versions:', JSON.stringify(vps.versions, null, 2));
  } finally {
    client.release();
  }
}

main().catch(console.error).finally(() => process.exit());

// Additive migration only. Run explicitly against the configured database.
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./check-contract-payments.cjs');
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Use --apply to create the shift registration tables in the configured database.');
  require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const db = load(path.resolve('src/lib/server/himoto-database')).himotoPool;
  const client = await db.connect();
  try {
    await client.query(fs.readFileSync(path.resolve('docs/sql/2026-11-14-shift-registrations.sql'), 'utf8'));
    const result = await client.query('SELECT count(*)::int AS registrations FROM himoto.staff_shift_registrations');
    console.log(JSON.stringify({ migration: 'applied', ...result.rows[0] }));
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
main().catch(error => { console.error('Migration failed:', error.code || error.message); process.exitCode = 1; }).finally(() => globalThis.himotoPool?.end());

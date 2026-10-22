const fs = require('node:fs'), path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { load, root } = require('./lib/load-typescript.cjs');
const { ownerDatabase } = load(path.join(root, 'lib/server/himoto-database'));
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Dùng --apply để bổ sung nơi lưu video CloudFly.');
  await ownerDatabase.query(fs.readFileSync(path.join(process.cwd(), 'docs/sql/2026-10-22-cloudfly-videos.sql'), 'utf8'));
  const result = await ownerDatabase.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='himoto' AND table_name IN('management_record_photos','management_shift_media')
    AND column_name IN('object_bucket','object_key','object_etag') ORDER BY table_name,column_name`);
  if (result.rows.length !== 6) throw new Error('Chưa đủ cột lưu video.');
  console.log(JSON.stringify({ migration: 'cloudfly-videos', passed: true, columns: result.rows.length, businessRowsWritten: 0 }));
}
main().catch(error => { console.error(JSON.stringify({ migration: 'cloudfly-videos', passed: false, code: /^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : 'MIGRATION_FAILED' })); process.exitCode = 1; })
  .finally(async () => { await globalThis.himotoPool?.end(); });

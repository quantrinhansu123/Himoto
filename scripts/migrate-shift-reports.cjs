const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { load, root } = require('./lib/load-typescript.cjs');
const { ownerDatabase } = load(path.join(root, 'lib/server/himoto-database'));
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Dùng --apply để tạo bảng báo cáo cuối ca và phân quyền PGD.');
  if (!process.argv.includes('--requests-only')) await ownerDatabase.query(fs.readFileSync(path.join(process.cwd(), 'docs/sql/2026-10-22-shift-reports.sql'), 'utf8'));
  await ownerDatabase.query(fs.readFileSync(path.join(process.cwd(), 'docs/sql/2026-10-22-shift-report-requests.sql'), 'utf8'));
  await ownerDatabase.query(fs.readFileSync(path.join(process.cwd(), 'docs/sql/2026-10-22-shift-audits.sql'), 'utf8'));
  console.log('Đã tạo bảng báo cáo cuối ca, ảnh và xác nhận lưu, phân quyền theo PGD.');
}
main().catch(() => { console.error('Không áp dụng được migration báo cáo cuối ca.'); process.exitCode = 1; }).finally(async () => { await globalThis.himotoPool?.end(); });

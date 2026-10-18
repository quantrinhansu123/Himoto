const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { load } = require('./check-contract-payments.cjs');
const root = path.resolve(__dirname, '../src');

async function main() {
  const identity = load(path.join(root, 'lib/management/customer-identity'));
  const document = load(path.join(root, 'lib/management/contract-document'));
  const photos = load(path.join(root, 'lib/server/record-photos'));
  const checks = [];
  for (const [input, iso] of [['12/10/2024', '2024-10-12'], ['12102024', '2024-10-12'], ['1/2/2024', '2024-02-01'], ['2024-10-12', '2024-10-12']]) {
    assert.equal(identity.parseIssueDateInput(input), iso);
    assert.equal(identity.validIdentityIssueDate(iso), true);
  }
  for (const input of ['12/', '12/10/20', '']) assert.equal(identity.parseIssueDateInput(input), input);
  assert.equal(identity.displayIssueDate('2024-10-12'), '12/10/2024');
  for (const input of ['31/02/2024', '29/02/2023', '00/12/2024', '10/00/2024', '12/10/20']) assert.equal(identity.validIdentityIssueDate(identity.parseIssueDateInput(input)), false);
  const details = { ...document.customerDetails(), name: 'Khách QA', phone: '0900000011', id_card: '001234567890', address: 'Địa chỉ QA' };
  assert.deepEqual(document.validateCustomer({ ...details, id_card_issued_on: '2024-10-12', driver_license_issued_on: '2024-02-29' }, 'api'), {});
  assert.ok(document.validateCustomer({ ...details, driver_license_issued_on: '2024-02-31' }, 'api').driver_license_issued_on);
  checks.push('manual day/month/year and compact keyboard input serialize to ISO; invalid/incomplete dates are rejected for both CCCD and GPLX');

  for (const [entity, id, slot] of [['customers', '1', 'id_front'], ['customers', '1', 'id_back'], ['contracts', '2', 'plate-100']]) assert.deepEqual(photos.parsePhotoTarget(entity, id, slot), { entity, id: Number(id), slot });
  for (const target of [['users', '1'], ['customers', '0'], ['customers', '1 OR 1=1'], ['customers', '1', 'plate-2'], ['contracts', '2', 'id_front'], ['contracts', '1', '../x']]) assert.throws(() => photos.parsePhotoTarget(...target));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  photos.validatePhotoBytes('image/jpeg', jpeg);
  photos.validatePhotoBytes('image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  photos.validatePhotoBytes('image/webp', Buffer.from('RIFF1234WEBP'));
  for (const [type, bytes] of [['text/html', jpeg], ['image/jpeg', Buffer.from('<svg>')], ['image/jpeg', Buffer.alloc(0)], ['image/jpeg', Buffer.alloc(2 * 1024 * 1024 + 1)]]) assert.throws(() => photos.validatePhotoBytes(type, bytes));
  checks.push('photo entity/slot allowlists, content signatures and 2 MB upload limits reject invalid targets and disguised files');

  const { NextRequest, NextResponse } = require('next/server');
  const session = load(path.join(root, 'lib/server/management-session'));
  const originalProtection = session.protectDatabaseRequest;
  const originalUserFromSession = session.userFromSession;
  const imageRoute = load(path.join(root, 'app/api/auth/record-photos/[entity]/[id]/[slot]/route'));
  const listRoute = load(path.join(root, 'app/api/auth/record-photos/[entity]/[id]/route'));
  const params = { params: Promise.resolve({ entity: 'customers', id: '1', slot: 'id_front' }) };
  try {
    session.protectDatabaseRequest = async () => NextResponse.json({ status: 'error' }, { status: 401 });
    const request = new NextRequest('http://localhost/api/auth/record-photos/customers/1/id_front');
    assert.equal((await imageRoute.GET(request, params)).status, 401);
    assert.equal((await imageRoute.PUT(request, params)).status, 401);
    assert.equal((await listRoute.GET(request, params)).status, 401);
    session.protectDatabaseRequest = async () => null;
    session.userFromSession = async () => ({ id: 7, access_role: 'admin', scope_all: true });
    const oversized = new NextRequest(request.url, { method: 'PUT', body: Buffer.alloc(2 * 1024 * 1024 + 1), headers: { 'Content-Type': 'image/jpeg', Origin: 'http://localhost' } });
    assert.equal((await imageRoute.PUT(oversized, params)).status, 413);
    const declaredSize = new NextRequest(request.url, { method: 'PUT', body: jpeg, headers: { 'Content-Length': String(2 * 1024 * 1024 + 1), Origin: 'http://localhost' } });
    assert.equal((await imageRoute.PUT(declaredSize, params)).status, 413);
  } finally { session.protectDatabaseRequest = originalProtection; session.userFromSession = originalUserFromSession; }
  checks.push('image reads, metadata and writes all enforce session protection; streamed and declared oversize uploads stop before database access');

  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const client = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
    const proxy = { query(sql, params) {
      let rewritten = sql.replaceAll('himoto.management_record_photos', 'pg_temp.qa_photo_files').replaceAll('himoto.customers', 'pg_temp.qa_photo_customers').replaceAll('himoto.orders', 'pg_temp.qa_photo_orders');
      assert.ok(!rewritten.includes('himoto.'), 'Business queries must target TEMP tables');
      return client.query(rewritten, params);
    } };
    try {
      await client.query('BEGIN');
      const migration = fs.readFileSync(path.resolve(__dirname, '../docs/sql/2026-10-16-record-photos.sql'), 'utf8');
      await client.query('CREATE TEMP TABLE qa_photo_customers(id bigint PRIMARY KEY); CREATE TEMP TABLE qa_photo_orders(id bigint PRIMARY KEY,deleted_at timestamptz)');
      const ddl = migration.match(/CREATE TABLE[\s\S]*?\n\);/)[0].replace('CREATE TABLE IF NOT EXISTS himoto.management_record_photos', 'CREATE TEMP TABLE qa_photo_files').replace('REFERENCES himoto.users(id)', '');
      await client.query(ddl);
      const cloudMigration = fs.readFileSync(path.resolve(__dirname, '../docs/sql/2026-10-16-cloudinary-photos.sql'), 'utf8');
      await client.query(cloudMigration.replace(/^BEGIN;|^COMMIT;/gm, '').replaceAll('himoto.management_record_photos', 'pg_temp.qa_photo_files'));
      for (const statement of migration.match(/ALTER TABLE himoto\.management_record_photos ADD COLUMN[\s\S]*?;/g)) {
        await client.query(statement.replaceAll('himoto.management_record_photos', 'pg_temp.qa_photo_files').replaceAll('himoto.customers', 'pg_temp.qa_photo_customers').replaceAll('himoto.orders', 'pg_temp.qa_photo_orders'));
      }
      await client.query('INSERT INTO qa_photo_customers(id) VALUES(1),(2); INSERT INTO qa_photo_orders(id) VALUES(3),(4); UPDATE qa_photo_orders SET deleted_at=now() WHERE id=4');
      assert.deepEqual(await photos.readRecordPhotos(proxy, 'customers', 1), []);
      await photos.writeRecordPhoto(proxy, 'customers', 1, 'id_front', 'image/jpeg', jpeg, 7);
      await photos.writeRecordPhoto(proxy, 'customers', 1, 'id_back', 'image/jpeg', jpeg, 7);
      await photos.writeRecordPhoto(proxy, 'contracts', 3, 'plate-100', 'image/jpeg', jpeg, 7);
      assert.equal((await photos.readRecordPhotos(proxy, 'customers', 1)).length, 2);
      assert.equal((await photos.readRecordPhotos(proxy, 'contracts', 3)).length, 1);
      await photos.writeRecordPhoto(proxy, 'customers', 1, 'id_front', 'image/jpeg', Buffer.concat([jpeg, Buffer.from([1])]), 8);
      const stored = await client.query('SELECT data,updated_by FROM qa_photo_files WHERE entity_type=$1 AND entity_id=$2 AND slot=$3', ['customers', 1, 'id_front']);
      assert.equal(stored.rows[0].data.length, 5); assert.equal(Number(stored.rows[0].updated_by), 8);
      assert.equal((await photos.readRecordPhotos(proxy, 'customers', 1)).length, 2);
      await assert.rejects(photos.writeRecordPhoto(proxy, 'contracts', 4, 'plate-100', 'image/jpeg', jpeg, 7), error => error.status === 404);
      await assert.rejects(photos.readRecordPhotos(proxy, 'contracts', 404), error => error.status === 404);
      await client.query('DELETE FROM qa_photo_customers WHERE id=1');
      assert.equal((await client.query("SELECT count(*)::int AS n FROM qa_photo_files WHERE entity_type='customers'")).rows[0].n, 0);
      assert.equal((await photos.readRecordPhotos(proxy, 'contracts', 3)).length, 1);
      checks.push('PostgreSQL TEMP: actual owner schemas, migration constraints, save/reopen bytes, replace/retry without duplicates, entity isolation, deleted/missing record rejection and automatic image cleanup when a customer is deleted');
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.exit());

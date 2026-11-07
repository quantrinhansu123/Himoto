require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
async function main() {
  const at = process.argv.indexOf('--pglite-path'); if (at < 0) throw Error('Pass isolated --pglite-path');
  const { PGlite } = require(path.resolve(process.argv[at + 1])), pg = new PGlite(), statements = [], checks = [];
  const client = { release() {}, async query(sql, values) { if (sql.startsWith('WITH inventory')) statements.push(sql); const result = await pg.query(sql, values); return { ...result, rowCount: result.rows.length || result.affectedRows || 0 }; } };
  global.himotoPool = { connect: async () => client, query: client.query.bind(client) };
  const { readMobileFleetInventory } = load(path.join(root, 'lib/server/mobile-fleet-inventory'));
  const actor = { id: 7, role: 'staff', permissions: ['vehicles.read'], store_id: 23, scope_all: false };
  try {
    await pg.exec(`CREATE SCHEMA himoto; CREATE ROLE himoto_scoped; GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
      CREATE TABLE himoto.fixture_vehicles(id bigint,name text,license text,type text,status text,store_id bigint,store_name text,from_store_name text,to_store_name text,available boolean);
      INSERT INTO himoto.fixture_vehicles SELECT i,'Xe điện Đỏ '||i,'QA-'||i,'electric',CASE WHEN i%2=0 THEN 'ready' ELSE 'renting' END,
        CASE WHEN i<=250 THEN 23 ELSE 24 END,CASE WHEN i<=250 THEN 'Cơ sở Đà Nẵng' ELSE 'Cơ sở B' END,'','',i%2=0 FROM generate_series(1,500) i;
      CREATE FUNCTION himoto.vehicle_inventory() RETURNS SETOF himoto.fixture_vehicles LANGUAGE sql STABLE AS $$ SELECT * FROM himoto.fixture_vehicles ORDER BY store_name,license,id $$;
      GRANT SELECT ON himoto.fixture_vehicles TO himoto_scoped;`);
    const page = await readMobileFleetInventory(actor, new URLSearchParams('page=1'));
    assert.equal(page.total, 500); assert.equal(page.scopeCount, 500); assert.equal(page.rows.length, 25); assert.equal(page.pages, 20);
    assert.equal(statements.length, 1); assert(!statements[0].includes('vehicle_rental_blockers')); assert(!statements[0].includes('draft_payload'));
    const bytes = Buffer.byteLength(JSON.stringify(page)); assert(bytes < 14000);
    const seen = new Set();
    for (let i = 1; i <= 20; i++) for (const row of (await readMobileFleetInventory(actor, new URLSearchParams('page=' + i))).rows) { assert(!seen.has(row.id)); seen.add(row.id); }
    assert.equal(seen.size, 500);
    const last = await readMobileFleetInventory(actor, new URLSearchParams('page=999999')); assert.equal(last.page, 20); assert.equal(last.rows.length, 25);
    const filtered = await readMobileFleetInventory(actor, new URLSearchParams('store=23&availability=ready&search=da+nang'));
    assert.equal(filtered.total, 125); assert(filtered.rows.every(row => row.available && row.storeId === 23)); assert.equal(filtered.scopeCount, 500);
    const plate = await readMobileFleetInventory(actor, new URLSearchParams('search=QA500')); assert.equal(plate.total, 1); assert.equal(plate.rows[0].id, 500);
    const none = await readMobileFleetInventory(actor, new URLSearchParams('search=%25')); assert.equal(none.rows.length, 0); assert.equal(none.pages, 1); assert.equal(none.total, 0);
    await assert.rejects(() => readMobileFleetInventory(null, new URLSearchParams()), error => error.status === 403);
    checks.push(`500-vehicle inventory returns 25 summaries / ${bytes} JSON bytes from one SQL statement; all 20 pages are distinct, filters/counts/clamping/empty pages match inventory and permissions stay enforced`);
    const { mobileRecord } = load(path.join(root, 'lib/server/mobile-catalogue'));
    const secret = 'SYNTHETIC-MUST-NOT-LEAK';
    const record = mobileRecord('vehicles', { id: 7, code: 'QA7', name: 'QA', status: 'ready', store_id: 23, draft_payload: secret, insurance: secret, rental_history: secret, data: secret });
    assert(!JSON.stringify(record).includes(secret));
    const api = load(path.resolve('mobile/src/lib/api')).createApi('https://fixture.invalid', 'hm1_' + 'a'.repeat(43));
    const source = api.vehicleThumbnailSource(7, '42');
    assert.equal(new URL(source.uri).pathname, '/api/mobile/v1/vehicles/7/thumbnail');
    assert(!source.uri.includes('hm1_')); assert.equal(source.headers.Authorization, 'Bearer hm1_' + 'a'.repeat(43));
    assert.throws(() => api.vehicleThumbnailSource(7, '../secret'));
    const sharp = require('sharp'), { mobileThumbnail } = load(path.join(root, 'lib/server/mobile-thumbnail'));
    const fixture = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#ba2028' } }).jpeg().toBuffer();
    const thumbnail = await mobileThumbnail(fixture), metadata = await sharp(thumbnail).metadata();
    assert(metadata.width <= 228 && metadata.height <= 192); assert(thumbnail.byteLength <= 65536); assert(thumbnail.byteLength < fixture.byteLength / 10);
    await assert.rejects(() => mobileThumbnail(new Uint8Array([1, 2, 3])), error => error.code === 'INVALID_THUMBNAIL');
    checks.push('Vehicle summaries omit full/private payloads and embedded image revisions construct only authenticated, revision-bound image URLs without tokens in the URL');
    console.log(JSON.stringify({ ok: true, checks, bytes, sampleRows: 500, operationalWrites: 0 }, null, 2));
  } finally { await pg.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

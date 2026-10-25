const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { load, root } = require('./lib/load-typescript.cjs');
const sdk = require('@aws-sdk/client-s3'), cloudinary = require('cloudinary').v2;
const videos = load(path.join(root, 'lib/server/cloudfly-videos'));
const cloud = load(path.join(root, 'lib/server/cloudinary-photos'));
const { ownerDatabase, himotoPool } = load(path.join(root, 'lib/server/himoto-database'));
const originalEnv = { ...process.env }, originalSend = sdk.S3Client.prototype.send;
const originalFetch = global.fetch, originalResource = cloudinary.api.resource, originalDestroy = cloudinary.uploader.destroy;
const ownerQuery = Object.getOwnPropertyDescriptor(ownerDatabase, 'query');
const poolConnect = Object.getOwnPropertyDescriptor(himotoPool, 'connect');
const checks = [];
async function mockChecks() {
  Object.assign(process.env, { VIDEO_STORAGE_PROVIDER: 'cloudfly', CLOUDFLY_S3_ENDPOINT: 'https://s3.cloudfly.vn', CLOUDFLY_S3_BUCKET: 'qa-himoto-videos',
    CLOUDFLY_S3_ACCESS_KEY_ID: 'qa-only-access', CLOUDFLY_S3_SECRET_ACCESS_KEY: 'qa-only-secret',
    CLOUDINARY_CLOUD_NAME: 'qa-cloud', CLOUDINARY_API_KEY: 'qa-cloud-key', CLOUDINARY_API_SECRET: 'qa-cloud-secret' });
  delete process.env.CLOUDINARY_URL;
  const objects = new Map(), commands = [], downloads = [], deletes = [];
  let putFailure = false, referenced = false, metadataReads = 0;
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(80)]);
  const receipt = { public_id: `himoto/management-video/151/${randomUUID()}`, version: 1800000000, resource_type: 'video' };
  receipt.signature = cloudinary.utils.api_sign_request({ public_id: receipt.public_id, version: receipt.version }, 'qa-cloud-secret');
  let asset = { resource_type: 'video', format: 'mp4', version: receipt.version, bytes: mp4.length, duration: 12, video: { codec: 'h264' } };
  sdk.S3Client.prototype.send = async function(command) {
    commands.push(command.constructor.name); const input = command.input;
    if (command instanceof sdk.HeadObjectCommand) {
      if (!objects.has(input.Key)) throw Object.assign(Error('QA missing'), { $metadata: { httpStatusCode: 404 } });
      return objects.get(input.Key).head;
    }
    if (command instanceof sdk.PutObjectCommand) {
      if (putFailure) throw Error('QA storage outage');
      assert.equal(input.ACL, 'private'); assert.equal(input.IfNoneMatch, '*'); assert.equal(input.ContentType, 'video/mp4');
      assert.equal(input.ContentMD5, createHash('md5').update(input.Body).digest('base64'));
      assert.equal(input.Metadata.sha256, createHash('sha256').update(input.Body).digest('hex'));
      const etag = '"qa-etag"';
      objects.set(input.Key, { bytes: input.Body, head: { ContentType: input.ContentType, ContentLength: input.Body.length, ETag: etag, Metadata: input.Metadata } });
      return { ETag: etag };
    }
    if (command instanceof sdk.GetObjectCommand) {
      const stored = objects.get(input.Key); assert(stored); assert.equal(input.IfMatch, stored.head.ETag);
      return { ...stored.head, Body: { transformToWebStream: () => new Response(stored.bytes).body } };
    }
    throw Error('Unexpected S3 request');
  };
  cloudinary.api.resource = async () => { metadataReads++; return asset; };
  cloudinary.uploader.destroy = async id => { deletes.push(id); return { result: 'ok' }; };
  Object.defineProperty(ownerDatabase, 'query', { configurable: true, value: async () => ({ rows: [{ referenced }] }) });
  global.fetch = async url => { downloads.push(String(url)); assert.match(String(url), /^https:\/\/api\.cloudinary\.com\/v1_1\/qa-cloud\/video\/download[?]/); return new Response(mp4); };
  assert.deepEqual(cloud.verifyPhotoReceipt(receipt, 151), receipt);
  assert.throws(() => cloud.verifyPhotoReceipt(receipt, 152));
  assert.throws(() => cloud.verifyPhotoReceipt({ ...receipt, signature: 'f'.repeat(40) }, 151));
  const stored = await cloud.cloudinaryVideoObject(receipt, 60);
  assert.equal(objects.size, 1); assert.equal(metadataReads, 1); assert.equal(downloads.length, 1);
  assert.deepEqual(await cloud.cloudinaryVideoObject(receipt, 60), stored);
  assert.equal(metadataReads, 1); assert.equal(downloads.length, 1);
  checks.push('Signed actor receipts, private MP4 copies, MD5/SHA-256 checks and deterministic retries preserve a single durable object');
  assert.deepEqual(await videos.readObjectVideo(stored), mp4);
  const url = new URL(await videos.objectVideoUrl(stored));
  assert.equal(url.protocol, 'https:'); assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  assert(!url.searchParams.get('X-Amz-SignedHeaders').includes('if-match'));
  await assert.rejects(() => videos.objectVideoUrl({ ...stored, object_bucket: 'other-bucket' }));
  await assert.rejects(() => videos.objectVideoUrl({ ...stored, object_key: '../other' }));
  checks.push('Playback uses five-minute GET signatures without browser-only header requirements; Telegram reads bounded object bytes and foreign bucket/key references fail closed');
  referenced = true; await cloud.cleanupConvertedVideo(receipt); assert.equal(deletes.length, 0);
  referenced = false; await cloud.cleanupConvertedVideo(receipt); assert.deepEqual(deletes, [receipt.public_id]);
  cloudinary.api.resource = async () => { throw Error('Cloudinary source was removed'); };
  assert.deepEqual(await cloud.cloudinaryVideoObject(receipt, 60), stored);
  checks.push('Cleanup preserves referenced legacy assets; a successfully archived conversion remains retryable after its temporary source is removed');
  const other = { ...receipt, public_id: `himoto/management-video/151/${randomUUID()}` };
  cloudinary.api.resource = async () => asset;
  asset = { ...asset, duration: 181 }; await assert.rejects(() => cloud.cloudinaryVideoObject(other, 180));
  asset = { ...asset, duration: 61 }; await assert.rejects(() => cloud.cloudinaryVideoObject(other, 60));
  asset = { ...asset, duration: 12, video: { codec: 'hevc' } }; await assert.rejects(() => cloud.cloudinaryVideoObject(other, 60));
  asset = { ...asset, codec: 'hevc', video: undefined }; await assert.rejects(() => cloud.cloudinaryVideoObject(other, 60));
  delete asset.codec;
  asset = { ...asset, video: { codec: 'h264' }, bytes: mp4.length + 1 }; await assert.rejects(() => cloud.cloudinaryVideoObject(other, 60));
  asset = { ...asset, bytes: mp4.length }; putFailure = true; await assert.rejects(() => cloud.cloudinaryVideoObject(other, 60)); putFailure = false;
  assert.equal(objects.size, 1);
  checks.push('Oversized duration, incompatible codecs, incomplete downloads and storage failures never return a saved object');

  const session = load(path.join(root, 'lib/server/management-session'));
  const oldSession = { readSessionUser: session.readSessionUser, userFromSession: session.userFromSession, protectDatabaseRequest: session.protectDatabaseRequest };
  let user = { id: 151, access_role: 'branch_staff', store_id: 23, scope_all: false, permissions: ['contracts.read', 'contracts.draft'] };
  let visible = true, commitFailure = false, savedPhoto = null, committed = false;
  const client = { release() {}, query: async (sql, values) => {
    if (sql === 'COMMIT') { if (commitFailure) throw Error('QA commit failed'); committed = true; return { rows: [] }; }
    if (/^(BEGIN|ROLLBACK)/.test(sql)) return { rows: [] };
    if (sql.includes('SELECT id FROM himoto.orders')) return { rowCount: visible ? 1 : 0, rows: visible ? [{ id: 1 }] : [] };
    if (sql.includes('INSERT INTO himoto.management_record_photos')) {
      savedPhoto = { mime_type: 'video/mp4', object_bucket: values[4], object_key: values[5], object_etag: values[6] }; return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('SELECT mime_type,data,')) return { rowCount: savedPhoto ? 1 : 0, rows: savedPhoto ? [savedPhoto] : [] };
    throw Error('Unexpected record SQL');
  } };
  const { NextRequest } = require('next/server');
  const route = load(path.join(root, 'app/api/auth/record-photos/[entity]/[id]/[slot]/route'));
  const params = { params: Promise.resolve({ entity: 'contracts', id: '1', slot: 'rental-video-1' }) };
  const request = method => new NextRequest('http://localhost/api/auth/record-photos/contracts/1/rental-video-1', { method, headers: { Origin: 'http://localhost', ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) }, ...(method === 'PUT' ? { body: JSON.stringify(receipt) } : {}) });
  try {
    session.readSessionUser = session.userFromSession = async () => user;
    session.protectDatabaseRequest = async () => null;
    Object.defineProperty(himotoPool, 'connect', { configurable: true, value: async () => client });
    const destroyCount = deletes.length;
    commitFailure = true; assert.equal((await route.PUT(request('PUT'), params)).status, 500); assert.equal(deletes.length, destroyCount);
    commitFailure = false; assert.equal((await route.PUT(request('PUT'), params)).status, 200); assert(committed);
    const playback = await route.GET(request('GET'), params); assert.equal(playback.status, 307); assert.equal(playback.headers.get('Cache-Control'), 'private, no-store');
    visible = false; const denied = await route.GET(request('GET'), params); assert.equal(denied.status, 404); assert.equal(denied.headers.get('Location'), null);
    visible = true; user = null; assert.equal((await route.GET(request('GET'), params)).status, 401);
    checks.push('Actual record handlers archive before COMMIT, never clean up on failed COMMIT and issue playback redirects only after login and record-scope checks');
  } finally { Object.assign(session, oldSession); Object.defineProperty(himotoPool, 'connect', poolConnect); }
  const delivery = load(path.join(root, 'lib/server/telegram-delivery'));
  const batches = [];
  for await (const batch of delivery.telegramMediaBatches([{ slot: 'rental-video-1', mime_type: 'video/mp4', ...stored }], 0, Date.now() + 300000)) batches.push(batch);
  assert.deepEqual(batches.map(b => b.map(f => f.data)), [[mp4]]);
  checks.push('The Telegram batching path resolves object-storage references without calling Telegram');
  const content = load(path.join(root, 'lib/server/contract-notification-content'));
  const legacyPhoto = { slot:'rental-1',mime_type:'image/jpeg',bytes:null,cloudinary_public_id:'qa-photo',cloudinary_cloud_name:'qa-cloud',cloudinary_version:1 };
  const legacy = await content.notificationPhotos({query:async()=>({rows:[{...legacyPhoto,object_bucket:null,object_key:null,object_etag:null}]})},1,['rental']);
  assert.deepEqual(legacy,[legacyPhoto]);
  checks.push('Adding object-storage columns preserves legacy notification payload shapes and content hashes');
  const longReceipt = { ...receipt, public_id: `himoto/management-video/151/${randomUUID()}` };
  asset = { ...asset, duration: 120 };
  const longStored = await cloud.shiftCloudAsset(longReceipt);
  assert(longStored.object_key);
  await assert.rejects(() => cloud.cloudinaryVideoObject(longReceipt, 60));
  checks.push('PGD/KTNB accepts up to three-minute converted video while contract slots keep their one-minute limit, including on retry');
}
async function tempChecks() {
  const c = await ownerDatabase.connect();
  try {
    await c.query('BEGIN');
    await c.query('CREATE TEMP TABLE qa_record_photos (LIKE himoto.management_record_photos INCLUDING DEFAULTS INCLUDING CONSTRAINTS)');
    await c.query('CREATE TEMP TABLE qa_shift_media (LIKE himoto.management_shift_media INCLUDING DEFAULTS INCLUDING CONSTRAINTS)');
    const migration = fs.readFileSync('docs/sql/2026-10-22-cloudfly-videos.sql', 'utf8').replace(/^BEGIN;|^COMMIT;/gm, '')
      .replaceAll('himoto.management_record_photos', 'pg_temp.qa_record_photos').replaceAll('himoto.management_shift_media', 'pg_temp.qa_shift_media');
    await c.query(migration); await c.query(migration);
    const key = `himoto/videos/qa-cloud/151/${randomUUID()}/v1.mp4`;
    await c.query(`INSERT INTO pg_temp.qa_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,object_bucket,object_key,object_etag)
      VALUES('contracts',90000001,'rental-video-1','video/mp4',NULL,151,'qa-bucket',$1,'qa-etag')`, [key]);
    await c.query(`INSERT INTO pg_temp.qa_shift_media(id,report_id,store_id,category,stage,filename,mime_type,created_by,object_bucket,object_key,object_etag)
      VALUES($1,90000001,23,'vehicles','pgd','qa.mp4','video/mp4',151,'qa-bucket',$2,'qa-etag')`, [randomUUID(), key]);
    for (const update of ["SET object_etag=NULL", "SET mime_type='image/jpeg'", "SET data=decode('ffd8ff','hex')", "SET cloudinary_public_id='mixed-provider'", "SET object_key='../other'"]) {
      await c.query('SAVEPOINT invalid_video');
      await assert.rejects(() => c.query(`UPDATE pg_temp.qa_record_photos ${update}`), error => error.code === '23514');
      await c.query('ROLLBACK TO SAVEPOINT invalid_video');
    }
    assert.equal((await c.query('SELECT count(*)::int AS n FROM pg_temp.qa_record_photos')).rows[0].n, 1);
    checks.push('PostgreSQL TEMP: migration is repeatable; object videos are accepted and mixed providers, missing metadata, traversal keys and image/object combinations are rejected');
  } finally { await c.query('ROLLBACK'); c.release(); }
}
async function main() {
  try { await mockChecks(); }
  finally {
    sdk.S3Client.prototype.send = originalSend; global.fetch = originalFetch;
    cloudinary.api.resource = originalResource; cloudinary.uploader.destroy = originalDestroy;
    Object.defineProperty(ownerDatabase, 'query', ownerQuery); Object.defineProperty(himotoPool, 'connect', poolConnect);
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
  if (process.argv.includes('--live-temp')) await tempChecks();
  console.log(JSON.stringify({ passed: checks.length, checks, realBusinessWrites: 0, realTelegramRequests: 0 }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { await globalThis.himotoPool?.end(); });

const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { load } = require('./check-contract-payments.cjs');
const root = path.resolve(__dirname, '../src');

async function main() {
  const shared = load(path.join(root, 'lib/management/photo-ocr'));
  const server = load(path.join(root, 'lib/server/photo-ocr'));
  const cloud = load(path.join(root, 'lib/server/cloudinary-photos'));
  const photos = load(path.join(root, 'lib/management/record-photos'));
  const document = load(path.join(root, 'lib/management/contract-document'));
  const original = Object.fromEntries(['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_OCR_MODEL', 'CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map(key => [key, process.env[key]]));
  const originalFetch = global.fetch, checks = [];
  const jpeg = Buffer.from([255, 216, 255, 217]);
  try {
    assert.deepEqual(shared.cleanOcrFields({ id_card: '001234567890', name: 'Tên QA', id_card_issued_on: '2024-02-31', phone: '0900000000' }, 'cccd_front'), { id_card: '001234567890', name: 'Tên QA' });
    assert.deepEqual(shared.cleanOcrFields({ license: '29B1-123.45', id_card: '001234567890' }, 'plate'), { license: '29B1-123.45' });
    assert.deepEqual(shared.cleanOcrFields({ license: 'cannot read' }, 'plate'), {});
    const before = document.customerDetails();
    const current = { ...before, name: 'Tên gõ tay' };
    const result = shared.mergeOcrCustomer(current, { name: 'Tên AI', id_card: '001234567890', id_card_issued_on: '2024-01-02' }, before, {});
    assert.equal(result.customer.name, 'Tên gõ tay'); assert.equal(result.customer.id_card, '001234567890');
    const corrected = shared.mergeOcrCustomer({ ...before, name: 'Tên AI cũ' }, { name: 'Tên AI mới' }, { ...before, name: 'Tên AI cũ' }, { name: 'Tên AI cũ' });
    assert.equal(corrected.customer.name, 'Tên AI mới');
    assert.throws(() => shared.mergeOcrCustomer({ ...before, id_card: '009876543210' }, { id_card: '001234567890', name: 'Không điền' }, before, {}));
    checks.push('allowlisted fields and real date/identity/plate validation; leading zeroes preserved; manual edits and a different person\'s identity are never overwritten');

    process.env.GEMINI_API_KEY = 'unit-test-gemini-key'; delete process.env.GOOGLE_API_KEY; delete process.env.GEMINI_OCR_MODEL;
    const response = fields => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(fields) }] } }] });
    const extracted = await server.extractPhoto('cccd_back', 'image/jpeg', jpeg, undefined, async (url, init) => {
      assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-/);
      assert.ok(!url.includes(process.env.GEMINI_API_KEY)); assert.equal(init.headers['x-goog-api-key'], process.env.GEMINI_API_KEY);
      const body = JSON.parse(init.body), image = body.contents[0].parts[1].inlineData;
      assert.equal(image.data, jpeg.toString('base64')); assert.equal(image.mimeType, 'image/jpeg');
      assert.equal(body.generationConfig.responseMimeType, 'application/json'); assert.ok(!init.body.includes('fileData'));
      return response({ id_card_issued_on: '2024-10-12', id_card_issued_by: 'Cơ quan QA' });
    });
    assert.equal(extracted.fields.id_card_issued_on, '2024-10-12');
    await assert.rejects(server.extractPhoto('plate', 'image/jpeg', jpeg, undefined, async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] })), error => error.status === 422);
    await assert.rejects(server.extractPhoto('plate', 'image/jpeg', jpeg, undefined, async () => Response.json({ message: 'provider secret details' }, { status: 429 })), error => error.status === 503 && !error.message.includes('provider secret'));
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(server.extractPhoto('plate', 'image/jpeg', jpeg, undefined, async () => { throw new Error('Must not call Google'); }), error => error.status === 503);
    for (let i = 0; i < 30; i++) server.limitPhotoOcr(999, 1000);
    assert.throws(() => server.limitPhotoOcr(999, 1000), error => error.status === 429);
    server.limitPhotoOcr(999, 61001);
    checks.push('Gemini receives the original inline bytes and a strict JSON schema, never a Cloudinary URL; key stays in server headers; missing config, rate limits, quota errors and truncated results fail explicitly');

    delete process.env.CLOUDINARY_URL;
    Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'qa-cloud', CLOUDINARY_API_KEY: 'qa-api-key', CLOUDINARY_API_SECRET: 'unit-test-cloudinary-secret' });
    const signed = cloud.signPhotoUpload(7, randomUUID(), 1800000000000);
    assert.equal(signed.params.type, 'authenticated'); assert.equal(signed.params.overwrite, false);
    assert.ok(!JSON.stringify(signed).includes(process.env.CLOUDINARY_API_SECRET));
    const version = 1800000000;
    const signature = require('cloudinary').v2.utils.api_sign_request({ public_id: signed.params.public_id, version }, process.env.CLOUDINARY_API_SECRET);
    const receipt = { public_id: signed.params.public_id, version, signature };
    assert.deepEqual(cloud.verifyPhotoReceipt(receipt, 7), receipt);
    assert.throws(() => cloud.verifyPhotoReceipt(receipt, 8));
    assert.throws(() => cloud.verifyPhotoReceipt({ ...receipt, version: version + 1 }, 7));
    assert.throws(() => cloud.verifyPhotoReceipt({ ...receipt, url: 'https://example.invalid' }, 7));
    global.fetch = async url => {
      const parsed = new URL(url);
      assert.equal(parsed.hostname, 'api.cloudinary.com'); assert.equal(parsed.searchParams.get('type'), 'authenticated');
      assert.ok(parsed.searchParams.get('signature')); assert.ok(parsed.searchParams.get('expires_at'));
      return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
    };
    assert.equal((await cloud.readCloudinaryPhoto({ cloudinary_public_id: receipt.public_id, cloudinary_cloud_name: 'qa-cloud', cloudinary_version: version })).status, 200);
    checks.push('Cloudinary signed uploads use authenticated delivery; server checks ownership and response signatures; forged versions, foreign owners and arbitrary URLs are rejected; reads use short-lived private URLs');

    let releaseUpload, cloudStarted = false, cloudDone = false, ocrBeforeCloud = false, attached;
    const hold = new Promise(resolve => { releaseUpload = resolve; });
    const file = new File([jpeg], 'qa.jpg', { type: 'image/jpeg' });
    global.fetch = async (url, init) => {
      if (url === '/api/auth/photo-uploads/sign') return Response.json({ status: 'success', data: signed });
      if (String(url).startsWith('https://api.cloudinary.com/')) { cloudStarted = true; await hold; cloudDone = true; return Response.json(receipt); }
      if (url === '/api/auth/photo-ocr') { ocrBeforeCloud = !cloudDone; return Response.json({ status: 'success', data: { fields: { license: '29B1-123.45' } } }); }
      attached = JSON.parse(init.body); return Response.json({ status: 'success' });
    };
    const uploading = photos.uploadRecordPhoto(file);
    const reading = shared.readPhotoWithAi('plate', file, new AbortController().signal);
    assert.equal((await reading).fields.license, '29B1-123.45');
    await new Promise(resolve => setImmediate(resolve)); assert.ok(cloudStarted && !cloudDone && ocrBeforeCloud);
    releaseUpload(); await uploading; await photos.saveRecordPhotos('contracts', 3, { 'plate-100': file });
    assert.deepEqual(attached, receipt);
    checks.push('delayed Cloudinary upload and OCR start independently; OCR completes before upload; saving later attaches the verified receipt without uploading the image again');
    global.fetch = originalFetch;
    if (process.argv.includes('--live-temp')) {
      require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
      const client = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
      const proxy = { query(sql, params) {
        const rewritten = sql.replaceAll('himoto.management_record_photos', 'pg_temp.qa_cloud_photos').replaceAll('himoto.orders', 'pg_temp.qa_cloud_orders');
        assert.ok(!rewritten.includes('himoto.'), 'All business queries must target TEMP');
        return client.query(rewritten, params);
      } };
      try {
        await client.query('BEGIN');
        await client.query('CREATE TEMP TABLE qa_cloud_photos (LIKE himoto.management_record_photos INCLUDING ALL) ON COMMIT DROP');
        await client.query('CREATE TEMP TABLE qa_cloud_orders(id bigint PRIMARY KEY,deleted_at timestamptz) ON COMMIT DROP; INSERT INTO qa_cloud_orders(id) VALUES(3)');
        await cloud.writeCloudinaryPhoto(proxy, 'contracts', 3, 'plate-100', 7, receipt);
        const row = (await client.query('SELECT data,cloudinary_public_id,cloudinary_version FROM qa_cloud_photos')).rows[0];
        assert.equal(row.data, null); assert.equal(row.cloudinary_public_id, receipt.public_id); assert.equal(Number(row.cloudinary_version), receipt.version);
        const legacy = load(path.join(root, 'lib/server/record-photos'));
        await legacy.writeRecordPhoto(proxy, 'contracts', 3, 'plate-100', 'image/jpeg', jpeg, 7);
        const replaced = (await client.query('SELECT data,cloudinary_public_id FROM qa_cloud_photos')).rows[0];
        assert.deepEqual(replaced.data, jpeg); assert.equal(replaced.cloudinary_public_id, null);
        checks.push('PostgreSQL TEMP: Cloudinary receipts persist without image bytes; legacy replacements clear Cloudinary references; storage remains readable for both providers');
      } finally { await client.query('ROLLBACK'); client.release(); }
    }
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.exit());

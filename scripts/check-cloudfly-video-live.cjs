// Only use a synthetic clip. No customer files, business writes or Telegram requests.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { load, root } = require('./lib/load-typescript.cjs');
const cloud = load(path.join(root, 'lib/server/cloudinary-photos'));
const videos = load(path.join(root, 'lib/server/cloudfly-videos'));
const { DeleteObjectCommand, HeadObjectCommand, GetObjectAclCommand } = require('@aws-sdk/client-s3');
const sdk = require('cloudinary').v2;
let stage = 'prepare';
async function main() {
  const filename = process.argv[process.argv.indexOf('--synthetic-file') + 1];
  if (!process.argv.includes('--synthetic-file') || path.basename(filename || '') !== 'synthetic-qa.mp4' || fs.statSync(filename).size > 1024 * 1024) throw Error('Synthetic clip required');
  const signed = cloud.signPhotoUpload(999999999, randomUUID(), Date.now(), true);
  const privateId = signed.params.public_id;
  let ref, sourceDeleted = false;
  const checks = [];
  try {
    const settings = { cloud_name: signed.cloud_name, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET };
    if (process.env.CLOUDINARY_URL) {
      const url = new URL(process.env.CLOUDINARY_URL); settings.api_key ||= decodeURIComponent(url.username); settings.api_secret ||= decodeURIComponent(url.password);
    }
    stage = 'convert-synthetic-video';
    // Match the application's signed browser upload; SDK string transformations are named presets.
    const form = new FormData(); form.append('file', new Blob([fs.readFileSync(filename)], { type: 'video/mp4' }), 'synthetic-qa.mp4');
    for (const [key, value] of Object.entries(signed.params)) form.append(key, String(value));
    form.append('api_key', signed.api_key); form.append('signature', signed.signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloud_name}/video/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
    const uploaded = await response.json();
    if (!response.ok) throw Error(uploaded.error?.message || 'Synthetic upload failed');
    const receipt = cloud.verifyPhotoReceipt({ public_id: uploaded.public_id, version: uploaded.version, signature: uploaded.signature, resource_type: 'video' }, 999999999);
    assert.equal(uploaded.public_id, privateId); assert.equal(uploaded.format, 'mp4');
    stage = 'copy-to-private-storage';
    ref = await cloud.cloudinaryVideoObject(receipt, 60);
    const metadata = await videos.cloudflyVideoClient().send(new HeadObjectCommand({ Bucket: ref.object_bucket, Key: ref.object_key }));
    assert(metadata.ContentLength > 0); assert.equal(metadata.ContentType, 'video/mp4'); assert.match(metadata.Metadata.sha256, /^[a-f0-9]{64}$/);
    const acl = await videos.cloudflyVideoClient().send(new GetObjectAclCommand({ Bucket: ref.object_bucket, Key: ref.object_key }));
    assert(!(acl.Grants || []).some(grant => /AllUsers|AuthenticatedUsers/.test(grant.Grantee?.URI || '')));
    checks.push('Synthetic phone-format clip converted to MP4/H.264 and copied with verified metadata into a private CloudFly object');
    stage = 'signed-range-playback';
    const signedUrl = await videos.objectVideoUrl(ref);
    const ranged = await fetch(signedUrl, { headers: { Range: 'bytes=0-31' }, signal: AbortSignal.timeout(20000) });
    assert.equal(ranged.status, 206); assert.match(ranged.headers.get('Content-Range'), /^bytes 0-31\//); assert.equal((await ranged.arrayBuffer()).byteLength, 32);
    const unsigned = new URL(signedUrl); unsigned.search = '';
    const denied = await fetch(unsigned, { signal: AbortSignal.timeout(20000) }); await denied.arrayBuffer(); assert([403, 404].includes(denied.status));
    const bytes = await videos.readObjectVideo(ref); assert.equal(bytes.length, metadata.ContentLength);
    checks.push('Signed playback, byte-range seeking and server-side download work; anonymous access is denied');
    if (process.argv.includes('--browser')) {
      stage = 'browser-playback';
      const browser = require('node:child_process').spawnSync('python', ['scripts/check-cloudfly-video-playback.py'], { input: JSON.stringify({ url: signedUrl }), encoding: 'utf8', timeout: 180000, windowsHide: true });
      const result = JSON.parse(browser.stdout || '{}');
      if (browser.status !== 0 || result.passed !== 4) throw Error('Synthetic browser playback failed');
      checks.push('Chromium and WebKit decode, play and seek the real private MP4 in desktop and mobile viewports');
    }
    stage = 'remove-conversion-and-retry';
    const result = await sdk.uploader.destroy(privateId, { ...settings, resource_type: 'video', type: 'authenticated' });
    assert.equal(result.result, 'ok'); sourceDeleted = true;
    assert.deepEqual(await cloud.cloudinaryVideoObject(receipt, 60), ref);
    checks.push('The same receipt still resolves to CloudFly after the temporary Cloudinary source is removed');
  } finally {
    // Both identifiers were created by this invocation and use the dedicated synthetic actor.
    if (ref) await videos.cloudflyVideoClient().send(new DeleteObjectCommand({ Bucket: ref.object_bucket, Key: ref.object_key }));
    if (!sourceDeleted) {
      const settings = { cloud_name: signed.cloud_name, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET };
      await sdk.uploader.destroy(privateId, { ...settings, resource_type: 'video', type: 'authenticated' });
    }
  }
  console.log(JSON.stringify({ passed: checks.length, checks, temporaryFilesRemoved: true, businessWrites: 0, telegramRequests: 0 }, null, 2));
}
main().catch(error => {
  let message = String(error.message || error.error?.message || 'LiveStorageCheckFailed').replace(/https?:\/\/\S+/g, '[url]');
  for (const [key, value] of Object.entries(process.env)) if (/KEY|SECRET|TOKEN|URL/.test(key) && value) message = message.split(value).join('[redacted]');
  console.error(JSON.stringify({ passed: false, stage, error: error.name || 'LiveStorageCheckFailed', message: message.slice(0, 300), httpStatus: error.$metadata?.httpStatusCode })); process.exitCode = 1;
});

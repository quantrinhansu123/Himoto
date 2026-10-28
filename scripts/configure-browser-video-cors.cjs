// Preserve existing portal rules. This adds only the application's signed PUT origin.
const fs = require('node:fs'), path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { load, root } = require('./lib/load-typescript.cjs');
const { cloudflyVideoClient, cloudflyVideoSettings } = load(path.join(root, 'lib/server/cloudfly-videos'));
const { GetBucketCorsCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
async function main() {
  const client = cloudflyVideoClient(), Bucket = cloudflyVideoSettings().bucket;
  let before = [];
  try { before = (await client.send(new GetBucketCorsCommand({ Bucket }))).CORSRules || []; }
  catch (error) { if (!['NoSuchCORSConfiguration','NoSuchCORS','NoSuchConfiguration'].includes(error.name)) throw error; }
  const existing=before.find(item=>item.ID==='himoto-browser-video');
  const rule = { ...existing, ID: 'himoto-browser-video', AllowedOrigins: [...new Set([...(existing?.AllowedOrigins||[]),'https://himoto.vercel.app','https://app.himoto.vn'])], AllowedMethods: [...new Set([...(existing?.AllowedMethods||[]),'PUT'])], AllowedHeaders: [...new Set([...(existing?.AllowedHeaders||[]),'*'])], ExposeHeaders: [...new Set([...(existing?.ExposeHeaders||[]),'ETag'])], MaxAgeSeconds: existing?.MaxAgeSeconds??300 };
  const after = [...before.filter(item => item.ID !== rule.ID), rule];
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ dryRun: true, existingRules: before.length, proposedRule: rule })); return;
  }
  const dir = path.join(process.cwd(), '.backups/browser-video-20261025'); fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `cors-before-${Date.now()}.json`); fs.writeFileSync(backup, JSON.stringify(before, null, 2));
  await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: after } }));
  const actual = (await client.send(new GetBucketCorsCommand({ Bucket }))).CORSRules || [];
  const found = actual.find(item => item.ID === rule.ID);
  if (!['https://himoto.vercel.app','https://app.himoto.vn'].every(origin=>found?.AllowedOrigins?.includes(origin)) || !found.AllowedMethods?.includes('PUT')) throw Error('CORS verification failed');
  console.log(JSON.stringify({ applied: true, preservedOtherRules: before.filter(item => item.ID !== rule.ID).length, backup: path.relative(process.cwd(), backup) }));
}
main().catch(error => { console.error(JSON.stringify({ passed: false, code: error.name || 'CORS_FAILED' })); process.exitCode = 1; });

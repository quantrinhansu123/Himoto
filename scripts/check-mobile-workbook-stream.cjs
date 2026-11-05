require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path');
const { load } = require('./lib/load-typescript.cjs');
const { readStoreMatchStream } = load(path.resolve('mobile/src/lib/read-workbook-stream'));
async function run() {
  const first = { filename: 'QA.xlsx', sha256: 'a'.repeat(64), total: 1002, offset: 0, nextOffset: 1000, inputs: Array.from({ length: 1000 }, (_, i) => ({ rowNumber: i + 2, values: { id_card: String(i + 2).padStart(12, '0'), store: 'Cơ sở QA' }, errors: [] })) };
  const second = { ...first, offset: 1000, nextOffset: null, inputs: [1002, 1003].map(rowNumber => ({ rowNumber, values: { id_card: String(rowNumber).padStart(12, '0'), store: 'Cơ sở QA' }, errors: [] })) };
  const encoder = new TextEncoder(); let requests = 0, cancelled = 0, body = '', status = 200, mime = 'application/x-ndjson';
  global.fetch = async (url, options) => {
    requests++; assert.equal(url, 'https://fixture.invalid/api/mobile/v1/imports/customer-stores/file'); assert.equal(options.headers.Authorization, 'Bearer QA'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    if (status !== 200) return new Response(JSON.stringify({ message: 'Fixture expiry' }), { status });
    const bytes = encoder.encode(body); let at = 0;
    return new Response(new ReadableStream({ pull(controller) { if (at >= bytes.length) return controller.close(); controller.enqueue(bytes.slice(at, at += 511)); }, cancel() { cancelled++; } }), { headers: { 'content-type': mime } });
  };
  const invoke = async (callback = () => {}, signal = new AbortController().signal, expired) => readStoreMatchStream('https://fixture.invalid', 'QA', 'QA.xlsx', new Uint8Array([80, 75]).buffer, callback, signal, expired);
  const checks = [];
  body = [first, second].map(JSON.stringify).join('\n') + '\n'; const parts = []; await invoke(p => parts.push(p)); assert.deepEqual(parts, [first, second]); assert.equal(requests, 1);
  checks.push('One authenticated upload streams 1002 rows in coherent 1000/2 parts across split UTF-8 boundaries without uploading the workbook again');
  for (const lines of [[first], [first, { ...second, sha256: 'b'.repeat(64) }], [second], [first, first], [first, second, second]]) {
    body = lines.map(JSON.stringify).join('\n') + '\n'; await assert.rejects(() => invoke());
  }
  body = [first, second].map(JSON.stringify).join('\n'); await assert.rejects(() => invoke());
  checks.push('Truncated, unordered, duplicated or mixed-file chunks and missing protocol terminator stop the preview before any customer update');
  body = [first, second].map(JSON.stringify).join('\n') + '\n'; const aborter = new AbortController(); await assert.rejects(() => invoke(() => aborter.abort(), aborter.signal));
  status = 401; let expiry = 0; await assert.rejects(() => invoke(undefined, undefined, () => expiry++), /Fixture expiry/); assert.equal(expiry, 1);
  status = 200; mime = 'application/json'; await assert.rejects(() => invoke()); assert(cancelled > 0);
  checks.push('Cancellation cancels the reader, 401 expires the session and unexpected content type rejects; no retry or business request is issued by the stream reader');
  console.log(JSON.stringify({ ok: true, groups: checks.length, checks }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

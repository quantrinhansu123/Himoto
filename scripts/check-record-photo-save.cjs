const assert = require('node:assert/strict'), path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const { saveRecordPhotos, deleteRecordPhoto } = load(path.join(root, 'lib/management/record-photos'));

async function main() {
  const originalFetch = global.fetch, checks = [], requests = [];
  const photos = { 'return-101-1': new File(['qa'], 'qa.jpg', { type: 'image/jpeg' }), 'return-101-document-2': new File(['qa-qr'], 'qr.jpg', { type: 'image/jpeg' }) };
  try {
    for (const invalid of [() => new Response('<html>login</html>'), () => Response.json({ status: 'error', message: 'Chưa lưu ảnh' }), () => Response.json({})]) {
      global.fetch = async () => invalid();
      await assert.rejects(() => saveRecordPhotos('contracts', 1, photos));
    }
    checks.push('A 200 HTML page, error envelope or missing acknowledgement cannot report a saved photo');
    for (const failRead of [() => Response.json({ status: 'success', data: [] }), () => Response.json({ status: 'success', data: [{ slot: 'return-101-1' }] }), () => new Response('', { status: 503 }), () => { throw Error('Network lost'); }]) {
      global.fetch = async (_url, init) => init.method === 'PUT' ? Response.json({ status: 'success' }) : failRead();
      await assert.rejects(() => saveRecordPhotos('contracts', 1, photos));
      assert.equal(Object.keys(photos).length, 2);
    }
    checks.push('Missing/partial attachments and failed verification keep both source files available for retry');
    global.fetch = async (url, init) => {
      requests.push([url, init.method || 'GET']);
      if (init.method === 'PUT') return Response.json({ status: 'success' });
      assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'same-origin');
      return Response.json({ status: 'success', data: Object.keys(photos).map(slot => ({ slot, updated_at: '2026-10-21T13:00:00Z' })) });
    };
    await saveRecordPhotos('contracts', 1, photos);
    assert.deepEqual(requests.map(row => row[1]), ['PUT', 'PUT', 'GET']);
    checks.push('Success requires both acknowledged writes and a fresh list containing every saved slot');
    global.fetch = async () => { throw Error('Empty batches must not fetch'); };
    await saveRecordPhotos('contracts', 1, {});
    requests.length = 0;
    global.fetch = async (url, init) => {
      requests.push([String(url), init.method || 'GET']);
      if (init.method === 'DELETE') return Response.json({ status: 'success' });
      throw Error('Delete must not issue other requests');
    };
    await deleteRecordPhoto('contracts', 1, 'return-101-1');
    assert.deepEqual(requests, [['/api/auth/record-photos/contracts/1/return-101-1', 'DELETE']]);
    global.fetch = async () => Response.json({ status: 'error', message: 'QA chưa xóa được ảnh' }, { status: 503 });
    await assert.rejects(() => deleteRecordPhoto('contracts', 1, 'return-101-1'), /QA chưa xóa được ảnh/);
    checks.push('A mistaken saved photo can be deleted through the same slot URL; a failed delete keeps the file on the record');
  } finally { global.fetch = originalFetch; }
  console.log(JSON.stringify({ passed: checks.length, checks, realProviderRequests: 0, realBusinessWrites: 0 }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const { readRenewalPhotoContext } = load(path.join(root, 'lib/server/contract-renewal-version'));
const { loadRenewalPhotoVersion } = load(path.join(root, 'lib/management/contract-renewals'));

async function main() {
  const calls = [];
  const db = { query: async (sql, args) => {
    calls.push({ sql, args });
    if (sql.includes('FROM himoto.orders')) return { rows: [{ versions: [{ kind: 'renewal', version: 3 }] }] };
    return { rows: [{ version: '7' }, { version: null }, { version: 'invalid' }] };
  } };
  // A reconciled contract must not reuse a receipt/notice version even if its JSON is older.
  assert.deepEqual(await readRenewalPhotoContext(db, 123), { next_renewal_version: 8 });
  assert.equal(calls.length, 2);
  calls.forEach(call => assert.deepEqual(call.args, [123]));
  assert.equal(calls[0].sql.includes('deleted_at IS NULL'), true);
  let missingCalls = 0;
  assert.equal(await readRenewalPhotoContext({ query: async () => { missingCalls++; return { rows: [] }; } }, 123), null);
  assert.equal(missingCalls, 1);
  await assert.rejects(readRenewalPhotoContext({ query: async () => { throw Error('unavailable'); } }, 123), /unavailable/);

  const originalFetch = global.fetch;
  try {
    const controller = new AbortController();
    global.fetch = async (url, options) => {
      assert.equal(url, '/api/auth/order/car-rental/123/renewals');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.signal, controller.signal);
      return { ok: true, json: async () => ({ status: 'success', data: { next_renewal_version: 8 } }) };
    };
    assert.equal(await loadRenewalPhotoVersion(123, controller.signal), 8);
    for (const version of [null, 0, 1, '2', 2.5, Number.MAX_SAFE_INTEGER + 1]) {
      global.fetch = async () => ({ ok: true, json: async () => ({ status: 'success', data: { next_renewal_version: version } }) });
      await assert.rejects(loadRenewalPhotoVersion(123), /Không tải được mục ảnh/);
    }
    global.fetch = async () => ({ ok: false, json: async () => ({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }) });
    await assert.rejects(loadRenewalPhotoVersion(123), /Phiên đăng nhập/);
    global.fetch = async () => ({ ok: false, json: async () => { throw SyntaxError('not JSON'); } });
    await assert.rejects(loadRenewalPhotoVersion(123), /Không tải được mục ảnh/);
    global.fetch = async () => { throw new DOMException('Aborted', 'AbortError'); };
    await assert.rejects(loadRenewalPhotoVersion(123), { name: 'AbortError' });
  } finally { global.fetch = originalFetch; }
  console.log('Renewal upload context: version allocation, missing/scoped records, API failures and cancellation passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

// Real SQLite, synthetic data only. This suite never opens an app/user database.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { load } = require('./lib/load-typescript.cjs');
const mobile = file => load(path.resolve('mobile/src/lib', file));
const policy = mobile('offline-policy');
const { createOfflineStore } = mobile('offline-store');
const { createOfflineTransport } = mobile('offline-transport');
const { offlineStatus } = mobile('offline-status');
const { ApiError, createApi } = mobile('api');
const adapter = db => ({
  execAsync: async sql => { db.exec(sql); },
  runAsync: async (sql, ...values) => db.prepare(sql).run(...values),
  getFirstAsync: async (sql, ...values) => db.prepare(sql).get(...values) || null,
  getAllAsync: async (sql, ...values) => db.prepare(sql).all(...values),
});
async function main() {
  const checks = [], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'himoto-offline-qa-'));
  const filename = path.join(dir, 'synthetic.db'); let db = new DatabaseSync(filename), second;
  let now = Date.now(); const clock = () => now;
  const user = { id: 7, role: 'staff', storeId: 23, allStores: false, permissions: ['vehicles.read', 'contracts.draft'], name: 'Fixture', email: 'qa@example.invalid' };
  const scope = policy.offlineScopeKey({ origin: 'https://qa.invalid', user });
  try {
    let store = await createOfflineStore(adapter(db), () => {}, clock);
    await store.cache(scope, '/workspace', { id: 7 });
    db.close(); db = new DatabaseSync(filename); store = await createOfflineStore(adapter(db), () => {}, clock);
    assert.deepEqual((await store.read(scope, '/workspace')).data, { id: 7 });
    for (const change of [{ id: 8 }, { storeId: 24 }, { permissions: ['vehicles.read'] }, { role: 'admin' }, { allStores: true }])
      assert.equal(await store.read(policy.offlineScopeKey({ origin: 'https://qa.invalid', user: { ...user, ...change } }), '/workspace'), null);
    assert.equal(await store.read(policy.offlineScopeKey({ origin: 'https://other.invalid', user }), '/workspace'), null);
    assert.equal(policy.offlineScopeKey({ origin: 'https://qa.invalid', user: { ...user, permissions: [...user.permissions].reverse() } }), scope);
    now += policy.OFFLINE_TTL; assert.equal(await store.read(scope, '/workspace'), null);
    for (let i = 0; i < 220; i++) { now++; await store.cache(scope, '/catalogue/vehicles?page=' + i, { i }); }
    assert.equal(db.prepare('SELECT count(*) AS n FROM offline_cache').get().n, policy.MAX_CACHE_PAGES);
    assert.equal(await store.read(scope, '/catalogue/vehicles?page=0'), null);
    checks.push('SQLite survives reopen; cached pages expire at 24h, stay bounded, and cannot cross server/account/store/permission scopes');

    const key = randomUUID(), body = JSON.stringify({ revision: '3', draft: { name: 'Synthetic' } });
    await store.enqueue(scope, key, '/drafts/41', 'PATCH', body, 30000);
    await assert.rejects(() => store.enqueue(scope, key, '/drafts/41', 'PATCH', '{}', 30000), /nội dung khác/);
    assert.equal(await store.claim(scope, key), false);
    now += 30001;
    second = new DatabaseSync(filename); const worker = await createOfflineStore(adapter(second), () => {}, clock);
    assert.equal(await worker.claim(scope, key), true); assert.equal(await store.claim(scope, key), false);
    await store.failed(scope, key, 'No network', true, 0); assert.equal((await store.list(scope))[0].state, 'queued');
    assert.equal(await store.claim(scope, key), false); now += 5001; assert.equal(await store.claim(scope, key), true);
    await store.failed(scope, key, 'Vehicle changed', false, 1); now += 100000;
    assert.equal(await store.claim(scope, key), false); assert.equal((await store.list(scope))[0].state, 'conflict');
    checks.push('Durable immutable UUID/body, exclusive leases across two SQLite connections, timed retry and permanent conflict stop');

    for (let i = 0; i < 7; i++) await store.enqueue(scope, randomUUID(), '/customers', 'POST', '{}', 1000);
    await assert.rejects(() => store.enqueue(scope, randomUUID(), '/customers', 'POST', '{}', 1000), /8 thao tác/);
    assert.equal((await store.list(scope)).length, 8);
    await store.committed(scope, key); assert.equal((await store.list(scope)).find(row => row.key === key).body, '');
    assert.equal(await store.read(scope, '/catalogue/vehicles?page=219'), null);
    for (const row of await store.list(scope)) await store.remove(scope, row.key);
    checks.push('Queue capacity fails closed without evicting pending intents; confirmed writes remove sensitive bodies and invalidate stale lookup cache');

    const transport = createOfflineTransport(store, scope, () => true);
    const valid = value => !!value && value.ok === true;
    offlineStatus.update({ connected: true });
    await transport.execute('/workspace', valid, {}, async () => ({ ok: true }), 1000);
    offlineStatus.update({ connected: false });
    let sends = 0;
    assert.deepEqual(await transport.execute('/workspace', valid, {}, async () => { sends++; }, 1000), { ok: true }); assert.equal(sends, 0);
    await assert.rejects(() => transport.execute('/catalogue/customers?page=999', valid, {}, async () => { sends++; }, 1000), error => error.code === 'OFFLINE_CACHE_MISS');
    const queuedKey = randomUUID(), options = { method: 'POST', body: '{}', headers: { 'Idempotency-Key': queuedKey } };
    await assert.rejects(() => transport.execute('/customers', valid, options, async () => { sends++; }, 1000), error => error.code === 'OFFLINE_QUEUED');
    assert.equal(sends, 0); assert.equal((await store.list(scope))[0].key, queuedKey);
    await store.remove(scope, queuedKey);
    offlineStatus.update({ connected: true });
    await assert.rejects(() => transport.execute('/customers', valid, { ...options, headers: { 'Idempotency-Key': randomUUID() } }, async () => { throw new ApiError('Changed', 409, 'REVIEW_REQUIRED'); }, 1000), error => error.status === 409);
    assert.equal((await store.list(scope))[0].state, 'conflict');
    await assert.rejects(() => transport.execute('/workspace', valid, {}, async () => { throw new ApiError('Revoked', 401, 'SESSION_EXPIRED'); }, 1000), error => error.status === 401);
    await assert.rejects(() => createOfflineTransport(store, scope, () => false).execute('/workspace', valid, {}, async () => ({ ok: true }), 1000), error => error.code === 'SESSION_CHANGED');
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(() => transport.execute('/customers', valid, { ...options, signal: aborted.signal }, async () => ({}), 1000), error => error.name === 'AbortError');
    checks.push('Transport serves cached reads immediately offline, queues writes without claiming success, and rejects 401/409, cancelled requests and changed sessions');

    for (const row of await store.list(scope)) await store.remove(scope, row.key);
    const originalFetch = global.fetch; let committed = 0, lost = true, receivedKey;
    const receipt = { id: 90, revision: '1', replayed: false };
    try {
      const api = createApi('https://qa.invalid', 'hm1_' + 'a'.repeat(43), undefined, transport);
      const requestKey = randomUUID();
      global.fetch = async (_url, init) => {
        const current = new Headers(init.headers).get('Idempotency-Key');
        assert.equal(current, requestKey); receivedKey = current;
        if (!committed) committed++;
        if (lost) { lost = false; throw new TypeError('Lost response after commit'); }
        return Response.json({ ...receipt, replayed: true });
      };
      await assert.rejects(() => api.saveCustomer(null, {}, requestKey), error => error.code === 'OFFLINE_QUEUED');
      const row = (await store.list(scope))[0]; assert.equal(row.key, receivedKey);
      offlineStatus.update({ connected: true });
      const replayApi = createApi('https://qa.invalid', 'hm1_' + 'a'.repeat(43));
      assert.equal((await replayApi.saveCustomer(null, JSON.parse(row.body), row.key)).replayed, true);
      await store.committed(scope, row.key); assert.equal(committed, 1);
    } finally { global.fetch = originalFetch; }
    for (const route of ['/session', '/accounts', '/integrations', '/record-media/vehicles/1/vehicle/1/vehicle-photo', '/exports/vehicles']) assert(!policy.cacheableRead(route));
    for (const route of ['/session/password', '/accounts', '/integrations', '/vehicles/1/transfers', '/contracts/1/telegram']) assert.equal(policy.offlineOperation(route, 'POST'), null);
    checks.push('Lost post-commit response replays exactly the original UUID/body and creates one business write; credentials, secrets, media and unapproved operations are excluded');
    const historyScope = policy.offlineScopeKey({ origin: 'https://qa.invalid', user: { ...user, id: 99 } });
    for (let i = 0; i < 45; i++) db.prepare("INSERT INTO offline_outbox(scope,key,path,method,operation,body,state,created_at) VALUES(?,?,?,'POST','customer.create','','committed',?)").run(historyScope, randomUUID(), '/customers', now - 10000 + i);
    const newest = randomUUID(); await store.enqueue(historyScope, newest, '/customers', 'POST', '{}', 0);
    assert.equal((await store.list(historyScope))[0].key, newest); assert.equal((await store.listActor('https://qa.invalid', 99))[0].key, newest);
    checks.push('More than 40 historic sync receipts cannot hide or starve a newer pending write');
    console.log(JSON.stringify({ ok: true, checks }, null, 2));
  } finally { second?.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

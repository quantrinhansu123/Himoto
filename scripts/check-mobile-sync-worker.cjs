require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite'), { randomUUID } = require('node:crypto');
const { load } = require('./lib/load-typescript.cjs');
const lib = path.resolve('mobile/src/lib'), api = load(path.join(lib, 'api')), policy = load(path.join(lib, 'offline-policy'));
const status = load(path.join(lib, 'offline-status'));
async function main() {
  const db = new DatabaseSync(':memory:'), checks = [], oldFetch = global.fetch;
  const adapter = { execAsync: async sql => { db.exec(sql); }, runAsync: async (sql, ...v) => db.prepare(sql).run(...v), getFirstAsync: async (sql, ...v) => db.prepare(sql).get(...v) || null, getAllAsync: async (sql, ...v) => db.prepare(sql).all(...v) };
  const store = await load(path.join(lib, 'offline-store')).createOfflineStore(adapter);
  const origin = 'https://qa.invalid', user = { id: 7, name: 'Fixture', email: 'qa@example.invalid', role: 'staff', storeId: 23, allStores: false, permissions: ['customers.read', 'customers.write'] };
  const initial = { origin, user, token: 'hm1_' + 'a'.repeat(43), expiresAt: new Date(Date.now() + 600000).toISOString(), sessionId: randomUUID() };
  let credentials = structuredClone(initial), posts = 0, mode = 'ok', lost = true, committed = 0, returnedUser = user;
  const scope = policy.offlineScopeKey({ origin, user });
  const sessionStore = {
    read: async () => credentials ? structuredClone(credentials) : null,
    update: async (_origin, token, next) => { if (credentials?.token !== token) return false; credentials = structuredClone(next); return true; },
    clearFamily: async (_origin, family) => { if ((credentials?.sessionId || credentials?.token) !== family) return false; credentials = null; return true; },
  };
  const module = { exports: {} }, file = path.join(lib, 'offline-sync.ts');
  const localRequire = name => name === './api' ? api : name === './session-store' ? { sessionStore } : name === './offline-native' ? { openOfflineStore: async () => store } : name === './offline-policy' ? policy : name === './offline-status' ? status : name === './session-refresh' ? {
    freshSession: async () => structuredClone(credentials), sessionFamily: value => value.sessionId || value.token,
    sessionAccess: (_origin, value) => ({ token: async () => value.token, current: () => value.token }),
  } : (() => { throw Error('Unexpected dependency ' + name); })();
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(localRequire, module, module.exports);
  const { syncOffline } = module.exports;
  global.fetch = async (url, options) => {
    const route = new URL(url).pathname;
    assert(!route.endsWith('/resolve'), 'An automatic retry must never tombstone an absent intent');
    if (route.endsWith('/session')) {
      if (mode === 'revoked' || mode === 'late-revoked') {
        if (mode === 'late-revoked') credentials = { ...initial, user: { ...user, id: 8 }, sessionId: 'different-new-login', token: 'hm1_' + 'z'.repeat(43) };
        return Response.json({ message: 'Revoked', code: 'SESSION_EXPIRED' }, { status: 401 });
      }
      return Response.json({ user: returnedUser, expiresAt: initial.expiresAt });
    }
    assert.equal(route, '/api/mobile/v1/customers'); posts++;
    if (mode === 'conflict') return Response.json({ message: 'Customer changed', code: 'REVIEW_REQUIRED' }, { status: 409 });
    if (mode === 'lost' && lost) { lost = false; committed++; throw new TypeError('Lost response after write'); }
    if (mode !== 'lost') committed++;
    return Response.json({ id: 90, revision: '1', replayed: mode === 'lost' });
  };
  const enqueue = async name => { const key = randomUUID(); await store.enqueue(scope, key, '/customers', 'POST', JSON.stringify({ name }), 0); return key; };
  const reset = async () => { for (const row of await store.list(scope)) await store.remove(scope, row.key); credentials = structuredClone(initial); returnedUser = user; posts = 0; };
  try {
    await enqueue('First'); assert.equal(await syncOffline(origin), true); assert.equal(posts, 1); assert.equal((await store.list(scope))[0].state, 'committed');
    checks.push('The real worker authorizes the session before sending, commits the durable outbox and removes request bodies');
    await reset(); mode = 'lost'; committed = 0; await enqueue('Lost');
    assert.equal(await syncOffline(origin), false); const original = (await store.list(scope))[0]; assert.equal(original.state, 'queued');
    await store.retryNow(scope); assert.equal(await syncOffline(origin), true); assert.equal(committed, 1); assert.equal((await store.list(scope))[0].key, original.key);
    checks.push('Worker retries a lost committed write through the same handler/key without calling the cancellation resolver');
    await reset(); mode = 'conflict'; await enqueue('Conflict'); await enqueue('Later');
    assert.equal(await syncOffline(origin), false); assert.equal(posts, 1); assert.equal((await store.list(scope))[0].state, 'conflict');
    await syncOffline(origin); assert.equal(posts, 1);
    checks.push('A 409 stops the failed intent and later dependent intents, including subsequent automatic drains');
    await reset(); mode = 'ok'; await enqueue('Moved'); returnedUser = { ...user, storeId: 24 };
    assert.equal(await syncOffline(origin), false); assert.equal(posts, 0); assert.equal((await store.list(scope))[0].state, 'conflict');
    checks.push('Changed branch/grants hold the original payload and UUID for manual reconciliation instead of sending under a new scope');
    await reset(); mode = 'revoked'; await store.cache(scope, '/workspace', { private: 'synthetic' });
    assert.equal(await syncOffline(origin), false); assert.equal(credentials, null); assert.equal(await store.read(scope, '/workspace'), null);
    await reset(); mode = 'late-revoked'; assert.equal(await syncOffline(origin), false); assert.equal(credentials.user.id, 8);
    checks.push('A known revoked session removes offline access/cache; a late 401 from the previous actor cannot erase the new login');
    console.log(JSON.stringify({ ok: true, checks }, null, 2));
  } finally { global.fetch = oldFetch; db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

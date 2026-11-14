require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { load } = require('./lib/load-typescript.cjs');
const lib = path.resolve('mobile/src/lib'), api = load(path.join(lib, 'api')), codec = load(path.join(lib, 'session-codec'));
const values = new Map(), modules = new Map(); let failSave = false;
function nativeLoad(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const localRequire = name => {
    if (name === 'expo') return { uuid: { v4: randomUUID } };
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'expo-secure-store') return {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-device-only',
      getItemAsync: async key => values.get(key) || null,
      setItemAsync: async (key, value, options) => {
        assert.equal(options.keychainAccessible, 'after-first-unlock-device-only');
        if (failSave) throw Error('Synthetic Keychain failure'); values.set(key, value);
      },
      deleteItemAsync: async key => { values.delete(key); },
    };
    if (name === './api') return api;
    if (name === './session-codec') return codec;
    if (name.startsWith('.')) return nativeLoad(path.resolve(path.dirname(file), name + '.ts'));
    throw Error('Unexpected native dependency ' + name);
  };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(localRequire, module, module.exports);
  return module.exports;
}
async function main() {
  const { sessionStore } = nativeLoad(path.join(lib, 'session-store.ts'));
  let lifecycle = nativeLoad(path.join(lib, 'session-refresh.ts'));
  const origin = 'https://fixture.invalid', checks = [], originalFetch = global.fetch;
  const user = { id: 7, name: 'QA', email: 'qa@example.invalid', role: 'staff', permissions: ['vehicles.read'], storeId: 23, allStores: false };
  const first = { token: 'hm1_' + 'a'.repeat(43), expiresAt: new Date(Date.now() - 1000).toISOString(), refreshToken: 'hmr2_' + 'b'.repeat(43), refreshExpiresAt: new Date(Date.now() + 86400000).toISOString(), sessionId: randomUUID(), user };
  const next = { ...first, token: 'hm1_' + 'c'.repeat(43), refreshToken: 'hmr2_' + 'd'.repeat(43), expiresAt: new Date(Date.now() + 900000).toISOString() };
  try {
    await sessionStore.save(first, origin);
    assert.equal((await sessionStore.read(origin)).refreshToken, first.refreshToken);
    assert.equal(codec.decodeStoredSession(JSON.stringify({ ...first, origin }), 'https://another.invalid'), null);
    assert.equal(codec.decodeStoredSession(JSON.stringify({ ...first, refreshToken: 'bad', origin }), origin), null);
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++; assert.equal(new URL(url).pathname, '/api/mobile/v1/session/refresh');
      assert.equal(options.credentials, 'omit'); assert(!new Headers(options.headers).has('authorization'));
      const body = JSON.parse(options.body); assert.equal(body.refreshToken, first.refreshToken); assert.match(body.rotationId, /^[0-9a-f-]{36}$/);
      await new Promise(resolve => setTimeout(resolve, 5)); return Response.json(next);
    };
    const refreshed = await Promise.all(Array.from({ length: 12 }, () => lifecycle.freshSession(origin, first.sessionId)));
    assert.equal(calls, 1); assert(refreshed.every(value => value.token === next.token));
    assert.equal((await sessionStore.read(origin)).refreshToken, next.refreshToken);
    checks.push('Access may expire while refresh stays valid; native credentials remain origin/device scoped; 12 concurrent requests perform one refresh and persist the new token first');

    await sessionStore.save(first, origin); let lostId, seenId;
    global.fetch = async (_url, options) => { lostId = JSON.parse(options.body).rotationId; throw new TypeError('Synthetic lost network response'); };
    await assert.rejects(() => lifecycle.freshSession(origin, first.sessionId), error => error.code === 'NETWORK');
    assert.equal((await sessionStore.read(origin)).rotationId, lostId);
    await sessionStore.update(origin, first.token, { ...first, user });
    assert.equal((await sessionStore.read(origin)).rotationId, lostId, 'A concurrent profile update must preserve the reserved rotation UUID');
    modules.delete(path.join(lib, 'session-refresh.ts')); lifecycle = nativeLoad(path.join(lib, 'session-refresh.ts'));
    global.fetch = async (_url, options) => { seenId = JSON.parse(options.body).rotationId; return Response.json(next); };
    await lifecycle.freshSession(origin, first.sessionId); assert.equal(seenId, lostId);
    checks.push('The rotation UUID is stored before sending and survives a JS restart/lost response, allowing exactly the same refresh to be recovered');

    await sessionStore.save(first, origin); let release, started;
    const entered = new Promise(resolve => { started = resolve; });
    global.fetch = async () => { started(); return new Promise(resolve => { release = () => resolve(Response.json(next)); }); };
    const pending = lifecycle.freshSession(origin, first.sessionId); await entered;
    await sessionStore.clear(); release(); await assert.rejects(() => pending, error => error.status === 401);
    assert.equal(await sessionStore.read(origin), null);
    await sessionStore.save(first, origin); failSave = true; let sent = 0;
    global.fetch = async () => { sent++; return Response.json(next); };
    await assert.rejects(() => lifecycle.freshSession(origin, first.sessionId), /Keychain failure/); assert.equal(sent, 0); failSave = false;
    checks.push('Late refresh cannot resurrect logout, and secure-storage failure prevents sending a rotation that cannot be recovered');

    let refreshed401 = 0, expired = 0, requests = 0;
    const transport = api.createApi(origin, first.token, () => expired++, undefined, { current: () => requests ? next.token : first.token, token: async force => { if (force) refreshed401++; return force ? next.token : first.token; } });
    global.fetch = async () => { requests++; return requests === 1 ? Response.json({ code: 'SESSION_EXPIRED' }, { status: 401 }) : Response.json({ user, stores: [] }); };
    assert.deepEqual((await transport.workspace()).stores, []); assert.equal(refreshed401, 1); assert.equal(expired, 0); assert.equal(requests, 2);
    checks.push('A server-side access expiry refreshes and retries once without signing the user out');
    const other = { ...next, sessionId: randomUUID(), token: 'hm1_' + 'z'.repeat(43) };
    await sessionStore.save(other, origin);
    assert.equal(await sessionStore.clearFamily(origin, first.sessionId), false);
    assert.equal((await sessionStore.read(origin)).token, other.token);
    assert.equal(await sessionStore.clearFamily(origin, other.sessionId), true);
    assert.equal(await sessionStore.read(origin), null);
    console.log(JSON.stringify({ ok: true, checks }, null, 2));
  } finally { failSave = false; global.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

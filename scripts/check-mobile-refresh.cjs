// Credential rotation integration tests run only in isolated PostgreSQL/WASM.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { NextRequest } = require('next/server');
const { load, root } = require('./lib/load-typescript.cjs');
async function main() {
  const at = process.argv.indexOf('--pglite-path');
  if (at < 0) throw Error('Pass --pglite-path for the isolated PostgreSQL package');
  const { PGlite } = require(path.resolve(process.argv[at + 1])), pg = new PGlite(), checks = [];
  Object.assign(process.env, { NODE_ENV: 'production', HIMOTO_MOBILE_ENABLED: 'true', DATABASE_URL: 'postgresql://fixture.invalid/never-connect', MANAGEMENT_SESSION_SECRET: 'synthetic-refresh-test-secret-at-least-32-bytes' });
  const sql = file => fs.readFileSync(path.resolve(file), 'utf8');
  let loseCommit = false;
  const client = { release() {}, async query(sql, values) {
    const result = await pg.query(sql, values);
    if (sql === 'COMMIT' && loseCommit) { loseCommit = false; throw Error('Lost commit response'); }
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  } };
  const database = { connect: async () => client, query: client.query.bind(client) };
  const actor = { id: 7, name: 'QA Session', email: 'qa-session@example.invalid', role: 'staff', access_role: 'branch_staff', permissions: ['vehicles.read', 'customers.read'], store_id: 23, scope_all: false, password_version: 3 };
  const sessions = load(path.join(root, 'lib/server/mobile-session'));
  const refresh = load(path.join(root, 'lib/server/mobile-refresh'));
  const request = token => new NextRequest('https://qa.invalid/api/mobile/v1/session', { headers: { Authorization: `Bearer ${token}` } });
  try {
    await pg.exec(`CREATE SCHEMA himoto; CREATE ROLE himoto_scoped; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text,email text,role text,role_id bigint,status text,management_password_version integer,deleted_at timestamptz);
      CREATE TABLE himoto.roles(id bigint PRIMARY KEY,slug text); INSERT INTO himoto.roles VALUES(2,'staff');
      CREATE TABLE himoto.management_account_access(user_id bigint PRIMARY KEY,access_role text,permissions text[],store_id bigint,scope_all boolean,enabled boolean);
      INSERT INTO himoto.users VALUES(7,'QA Session','qa-session@example.invalid','staff',2,'active',3,NULL);
      INSERT INTO himoto.management_account_access VALUES(7,'branch_staff',ARRAY['vehicles.read','customers.read'],23,false,true);`);
    await pg.exec(sql('docs/sql/2026-10-31-mobile-sessions.sql'));
    const legacy = await sessions.createMobileSession(actor, 'QA old app', 'android', database);
    const before = JSON.stringify((await pg.query('SELECT * FROM himoto.management_mobile_sessions')).rows);
    await pg.exec(sql('docs/sql/2026-11-06-mobile-refresh-tokens.sql'));
    await pg.exec(sql('docs/sql/2026-11-06-mobile-refresh-tokens.sql'));
    assert.equal(JSON.stringify((await pg.query('SELECT * FROM himoto.management_mobile_sessions')).rows), before);
    assert.equal((await sessions.requireMobileSession(request(legacy.token), database)).user.id, 7);
    checks.push('Additive refresh migration is repeatable and preserves the existing app/session without changing its credentials or expiry');

    const first = await refresh.createRotatingMobileSession(actor, 'QA new app', 'android', database);
    assert.match(first.refreshToken, /^hmr2_/); assert.match(first.token, /^hm1_/);
    assert(Math.abs(Date.parse(first.expiresAt) - Date.now() - 900000) < 3000);
    assert(Math.abs(Date.parse(first.refreshExpiresAt) - Date.now() - 30 * 86400000) < 3000);
    const originalSession = (await sessions.requireMobileSession(request(first.token), database)).sessionId;
    const rotation = randomUUID(), next = await refresh.rotateMobileSession(first.refreshToken, rotation, database);
    assert.notEqual(next.token, first.token); assert.notEqual(next.refreshToken, first.refreshToken); assert.equal(next.sessionId, originalSession);
    await assert.rejects(() => sessions.requireMobileSession(request(first.token), database), error => error.status === 401);
    assert.equal((await sessions.requireMobileSession(request(next.token), database)).user.id, 7);
    assert.deepEqual(await refresh.rotateMobileSession(first.refreshToken, rotation, database), next);
    const raw = JSON.stringify((await pg.query('SELECT * FROM himoto.management_mobile_refresh_sessions')).rows);
    assert(!raw.includes(first.refreshToken)); assert(!raw.includes(next.refreshToken));
    checks.push('15-minute access/30-day refresh, stable device session, rotation invalidates the previous access, stores only hashes and repeats the same rotation UUID safely');

    const lostFirst = await refresh.createRotatingMobileSession(actor, 'QA lost response', 'ios', database), lostId = randomUUID();
    loseCommit = true;
    await assert.rejects(() => refresh.rotateMobileSession(lostFirst.refreshToken, lostId, database), /Lost commit response/);
    const recovered = await refresh.rotateMobileSession(lostFirst.refreshToken, lostId, database);
    assert.equal((await sessions.requireMobileSession(request(recovered.token), database)).user.id, 7);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM himoto.management_mobile_used_refresh_tokens WHERE session_id=$1', [recovered.sessionId])).rows[0].n, 1);
    await assert.rejects(() => refresh.rotateMobileSession(first.refreshToken, randomUUID(), database), error => error.status === 401);
    await assert.rejects(() => sessions.requireMobileSession(request(next.token), database), error => error.status === 401);
    assert.equal((await sessions.requireMobileSession(request(recovered.token), database)).user.id, 7);
    checks.push('Lost commit response recovers one rotation; reuse with another UUID revokes only the affected device family');

    await pg.query('UPDATE himoto.management_account_access SET permissions=ARRAY[\'vehicles.read\'] WHERE user_id=7');
    const changed = await refresh.rotateMobileSession(recovered.refreshToken, randomUUID(), database);
    assert(changed.user.permissions.includes('vehicles.read')); assert(!changed.user.permissions.includes('customers.read'));
    await pg.query('UPDATE himoto.users SET management_password_version=4 WHERE id=7');
    await assert.rejects(() => refresh.rotateMobileSession(changed.refreshToken, randomUUID(), database), error => error.status === 401);
    await assert.rejects(() => sessions.requireMobileSession(request(changed.token), database), error => error.status === 401);
    const disabled = await refresh.createRotatingMobileSession({ ...actor, password_version: 4 }, 'QA disabled', 'android', database);
    await pg.query('UPDATE himoto.management_account_access SET enabled=false WHERE user_id=7');
    await assert.rejects(() => refresh.rotateMobileSession(disabled.refreshToken, randomUUID(), database), error => error.status === 401);
    await pg.query('UPDATE himoto.management_account_access SET enabled=true WHERE user_id=7');
    const expired = await refresh.createRotatingMobileSession({ ...actor, password_version: 4 }, 'QA expired', 'android', database);
    await pg.query("UPDATE himoto.management_mobile_refresh_sessions SET expires_at=now()-interval '1 second' WHERE session_id=$1", [expired.sessionId]);
    await assert.rejects(() => refresh.rotateMobileSession(expired.refreshToken, randomUUID(), database), error => error.status === 401);
    for (const role of ['himoto_scoped', 'anon', 'authenticated']) for (const table of ['management_mobile_refresh_sessions', 'management_mobile_used_refresh_tokens'])
      for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal((await pg.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [role, `himoto.${table}`, verb])).rows[0].allowed, false);
    checks.push('Refresh rechecks current grants; password changes, disabling and expiry stop access; application/browser database roles cannot read or modify refresh credentials');

    const route = load(path.join(root, 'app/api/mobile/v1/session/refresh/route'));
    const invalid = await route.POST(new NextRequest('https://qa.invalid/api/mobile/v1/session/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: 'bad', rotationId: randomUUID() }) }));
    assert.equal(invalid.status, 401); assert.equal(invalid.headers.get('cache-control'), 'private, no-store');
    const browser = await route.POST(new NextRequest('https://qa.invalid/api/mobile/v1/session/refresh', { method: 'POST', headers: { origin: 'https://qa.invalid', 'Content-Type': 'application/json' }, body: '{}' }));
    assert.equal(browser.status, 403);
    console.log(JSON.stringify({ ok: true, checks }, null, 2));
  } finally { await pg.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

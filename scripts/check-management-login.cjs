const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '../src');
const {load} = require('./lib/load-typescript.cjs');

async function run() {
  const session = load(path.join(root, 'lib/server/management-session'));
  const checks = [];
  const key = 'unit-test-session-key-not-for-real-use';
  const now = 1_800_000_000_000;
  const token = session.signSession(7, key, now);
  assert.equal(session.verifySession(token, key, now), 7);
  assert.equal(session.verifySession(token, 'wrong-key', now), null);
  assert.equal(session.verifySession(token, key, now + session.SESSION_SECONDS * 1000), null);
  const [body, signature] = token.split('.');
  const modified = Buffer.from(JSON.stringify({ id: 1, expires: now + 999999 })).toString('base64url');
  assert.equal(session.verifySession(`${modified}.${signature}`, key, now), null);
  for (const invalid of [undefined, '', 'x.y', `${body}.${signature}.extra`, 'x'.repeat(513)]) assert.equal(session.verifySession(invalid, key, now), null);
  checks.push('signed sessions reject tampering, wrong keys, expiry, and malformed cookies');

  const password = 'A test password used only in unit tests';
  const account = { id: '7', name: 'QA administrator', email: 'qa@example.invalid', password: (await bcrypt.hash(password, 10)).replace('$2b$', '$2y$'), role_id: '1', role: 'admin', role_slug: 'quan-tri-vien', status: 'active' };
  let row = account;
  const queries = [];
  const database = { query: async (sql, values) => { queries.push({ sql, values }); return { rows: row ? [row] : [] }; } };
  const expectedUser={id:7,name:account.name,email:account.email,role:'admin',role_slug:'quan-tri-vien',access_role:'admin',permissions:[...load(path.join(root,'lib/management/permissions')).ACCESS_PERMISSIONS],store_id:null,scope_all:true};
  assert.deepEqual(await session.authenticateAccount(account.email, password, database), expectedUser);
  assert.deepEqual(queries[0].values, [account.email]);
  assert(queries.every(query => query.sql.startsWith('SELECT')));
  await assert.rejects(session.authenticateAccount(account.email, 'wrong', database), error => error.status === 401);
  row = null;
  await assert.rejects(session.authenticateAccount(account.email, password, database), error => error.status === 401);
  row = { ...account, status: 'deactive' };
  await assert.rejects(session.authenticateAccount(account.email, password, database), error => error.status === 401);
  row = { ...account, role_id: '3', role: 'nhan-vien', role_slug: 'nhan-vien' };
  await assert.rejects(session.authenticateAccount(account.email, password, database), error => error.status === 403);
  checks.push('existing Laravel bcrypt hashes work; invalid, missing, inactive, and non-admin accounts are rejected without writes');
  row={...account,access_role:'branch_staff',permissions:['contracts.read'],access_store_id:'23',scope_all:false,access_enabled:true};
  const branch=await session.authenticateAccount('nv.qa',password,database);
  assert.equal(branch.store_id,23);assert.equal(branch.scope_all,false);assert.equal(branch.access_role,'branch_staff');
  assert(!branch.permissions.includes('accounts.manage'));
  row={...row,access_enabled:false};
  await assert.rejects(session.authenticateAccount('nv.qa',password,database),error=>error.status===403);
  checks.push('Explicit branch access overrides the legacy admin role; disabled managed accounts cannot sign in');

  const previousKey = process.env.MANAGEMENT_SESSION_SECRET;
  process.env.MANAGEMENT_SESSION_SECRET = key;
  try {
    const current = session.signSession(7);
    row = account;
    assert.equal((await session.userFromSession(current, database)).id, 7);
    row = { ...account, status: 'deactive' };
    assert.equal(await session.userFromSession(current, database), null);
    row = { ...account, role_id: '3', role: 'nhan-vien', role_slug: 'nhan-vien' };
    assert.equal(await session.userFromSession(current, database), null);
    row = null;
    assert.equal(await session.userFromSession(current, database), null);
  } finally { if (previousKey === undefined) delete process.env.MANAGEMENT_SESSION_SECRET; else process.env.MANAGEMENT_SESSION_SECRET = previousKey; }
  checks.push('sessions re-check account activity, deletion, and administrator permissions');

  const email = 'rate-limit@example.invalid';
  session.clearLoginLimit(email);
  for (let i = 0; i < 10; i++) session.checkLoginLimit(email, now);
  assert.throws(() => session.checkLoginLimit(email.toUpperCase(), now), error => error.status === 429);
  session.checkLoginLimit(email, now + 15 * 60 * 1000);
  session.clearLoginLimit(email);
  session.checkLoginLimit(email, now);
  session.clearLoginLimit(email);
  checks.push('login throttling is case-insensitive and allows retry after the interval');

  const previousEnv = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_MANAGEMENT_DATA_SOURCE: process.env.NEXT_PUBLIC_MANAGEMENT_DATA_SOURCE, NEXT_PUBLIC_MANAGEMENT_API_MODE: process.env.NEXT_PUBLIC_MANAGEMENT_API_MODE, DATABASE_URL: process.env.DATABASE_URL, SUPABASE_DATABASE_URL: process.env.SUPABASE_DATABASE_URL, MANAGEMENT_SESSION_SECRET: process.env.MANAGEMENT_SESSION_SECRET };
  try {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_MANAGEMENT_DATA_SOURCE = 'api';
    process.env.NEXT_PUBLIC_MANAGEMENT_API_MODE = 'supabase-local';
    delete process.env.DATABASE_URL; delete process.env.SUPABASE_DATABASE_URL; delete process.env.MANAGEMENT_SESSION_SECRET;
    const request = new NextRequest('http://localhost/api/auth/customers');
    assert.equal((await session.protectDatabaseRequest(request)).status, 503);
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    assert.equal(session.isManagementConfigured(), false);
    assert.throws(() => session.signSession(7), /MANAGEMENT_SESSION_SECRET/);
    process.env.MANAGEMENT_SESSION_SECRET = key;
    assert.equal(session.isManagementConfigured(), true);
    assert.equal((await session.protectDatabaseRequest(request)).status, 401);
    const repository = load(path.join(root, 'lib/management/repository')).createManagementRepository();
    process.env.NEXT_PUBLIC_MANAGEMENT_DATA_SOURCE = 'demo';
    assert.equal(repository.source, 'api');
    assert.equal(load(path.join(root, 'lib/management/repository')).createManagementRepository().source, 'api');
    assert.equal(repository.supportsContractDrafts, true);
    checks.push('production requires server credentials and a stable secret; legacy demo flags cannot activate sample data');
    process.env.NODE_ENV = 'development';
    assert.equal((await session.protectDatabaseRequest(request)).status, 401);
    assert.equal((await session.protectDatabaseRequest(new NextRequest('http://localhost/api/auth/customers', { method: 'POST', headers: { Origin: 'https://other.invalid' } }))).status, 403);
    assert.equal(session.sameOrigin(new NextRequest('http://localhost/api/session', { method: 'POST', headers: { Origin: 'http://localhost' } })), true);
    assert.equal(session.sameOrigin(new NextRequest('http://127.0.0.1:3000/api/session', { method: 'POST', headers: { Host: '127.0.0.1:3000', Origin: 'http://127.0.0.1:3000' } })), true);
    assert.equal(session.sameOrigin(new NextRequest('http://127.0.0.1:3000/api/session', { method: 'POST', headers: { Host: '127.0.0.1:3000', Origin: 'http://localhost:3000' } })), false);
    const dbModule=load(path.join(root,'lib/server/himoto-database'));
    const pool=dbModule.himotoPool;
    const ownerDescriptor=Object.getOwnPropertyDescriptor(dbModule.ownerDatabase,'query');
    Object.defineProperty(dbModule.ownerDatabase,'query',{configurable:true,value:database.query});
    const queryDescriptor = Object.getOwnPropertyDescriptor(pool, 'query');
    Object.defineProperty(pool, 'query', { configurable: true, value: database.query });
    try {
      const handler = load(path.join(root, 'app/api/session/route'));
      row = account;
      const response = await handler.POST(new NextRequest('http://127.0.0.1:3000/api/session', { method: 'POST', headers: { Host: '127.0.0.1:3000', Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password }) }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { user: expectedUser });
      const cookie = response.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i); assert.match(cookie, /Max-Age=28800/i);
      const authenticated = new NextRequest('http://127.0.0.1:3000/api/session', { headers: { Cookie: cookie.split(';')[0] } });
      assert.equal((await handler.GET(authenticated)).status, 200);
      const logout = await handler.DELETE(new NextRequest('http://127.0.0.1:3000/api/session', { method: 'DELETE', headers: { Host: '127.0.0.1:3000', Origin: 'http://127.0.0.1:3000' } }));
      assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i);
      row = { ...account, role_id: '3', role: 'nhan-vien', role_slug: 'nhan-vien' };
      assert.equal((await handler.GET(authenticated)).status, 401);
      process.env.NODE_ENV = 'production';
      row = account;
      const secureLogin = await handler.POST(new NextRequest('https://himoto.example/api/session', { method: 'POST', headers: { Host: 'himoto.example', Origin: 'https://himoto.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password }) }));
      assert.equal(secureLogin.status, 200);
      assert.match(secureLogin.headers.get('set-cookie'), /Secure/i);
      const authorized = new NextRequest('https://himoto.example/api/auth/customers', { headers: { Host: 'himoto.example', Cookie: secureLogin.headers.get('set-cookie').split(';')[0] } });
      assert.equal(await session.protectDatabaseRequest(authorized), null);
      checks.push('production HTTPS login and protected API use real account authentication and Secure cookies');
      const connectDescriptor = Object.getOwnPropertyDescriptor(pool, 'connect');
      const writes = [];
      const client = { query: async (sql, values) => {
        writes.push({ sql, values });
        return { rows: sql.includes('INSERT INTO himoto.customers') ? [{ id: 99 }] : [], rowCount: 0 };
      }, release() {} };
      Object.defineProperty(pool, 'connect', { configurable: true, value: async () => client });
      try {
        const customers = load(path.join(root, 'app/api/auth/[...path]/route'));
        const cookieHeader = secureLogin.headers.get('set-cookie').split(';')[0];
        const send = (body, apiPath = ['customers']) => customers.POST(new NextRequest('https://himoto.example/api/auth/' + apiPath.join('/'), {
          method: 'POST', headers: { Host: 'himoto.example', Origin: 'https://himoto.example', Cookie: cookieHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }), { params: Promise.resolve({ path: apiPath }) });
        const customer = { name: 'QA Customer', phone: '0900000001', id_card: '001234567890', address: 'QA Address', status: 'warning', store_id: 2, warning_note: 'QA warning' };
        assert.equal((await send(customer)).status, 201);
        const insert = writes.find(write => write.sql.includes('INSERT INTO himoto.customers'));
        assert.match(insert.sql, /store_id, warning/);
        assert.deepEqual(insert.values.slice(5,8), [1, 2, 'QA warning']);
        assert.equal(writes.at(-1).sql, 'COMMIT');
        writes.length = 0;
        assert.equal((await send({ ...customer, status: 'blacklist', warning_note: '' })).status, 201);
        assert.deepEqual(writes.find(write => write.sql.includes('INSERT INTO himoto.customers')).values.slice(5,8), [2, 2, 'Blacklist']);
        writes.length = 0;
        assert.equal((await send({ ...customer, warning_note: '' })).status, 400);
        assert.equal((await send({}, ['hr', 'staff', 'refill-branches'])).status, 404);
        assert.equal(writes.length, 0);
      } finally { Object.defineProperty(pool, 'connect', connectDescriptor); }
      checks.push('customer API binds branch/status/warning correctly; invalid warnings and removed bulk staff writes never open a transaction (mock database only)');
      checks.push('login handler issues an HttpOnly cookie without password data; session lookup and logout work');
    } finally { Object.defineProperty(pool, 'query', queryDescriptor); Object.defineProperty(dbModule.ownerDatabase,'query',ownerDescriptor); }
  } finally { for (const [name, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
  checks.push('missing configuration, anonymous and cross-origin requests are rejected; production authentication stays enabled');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

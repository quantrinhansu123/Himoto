const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const ExcelJS = require('exceljs');
const { NextRequest } = require('next/server');
const { load, root } = require('./lib/load-typescript.cjs');
const { readStaffWorkbook, staffPlan } = require('./sync-staff-workbook.cjs');

async function run() {
  const checks = [];
  const roles = load(path.join(root, 'lib/management/staff-positions'));
  for (const value of ['NVKD Giáp Bát', 'Nhân viên kinh doanh', ' NVKD ', 'nhân viên kinh doanh CS Láng']) assert.equal(roles.normalizeStaffPosition(value), 'NVKD');
  assert.equal(roles.normalizeStaffPosition('PT Thuốc Bắc'), 'PT');
  assert.equal(roles.normalizeStaffPosition('Leader công nợ / Kế toán / Leader thuê sở hữu'), 'QLCN / KT / Leader');
  assert.equal(roles.branchStaffPosition('QLCN / KT / Leader'), 'Leader');
  assert.equal(roles.normalizeStaffPosition('Chức vụ mới QA'), 'Chức vụ mới QA');
  assert.equal(roles.staffPositionSuggestions(['NVKD Láng', 'Nhân viên kinh doanh']).filter(role => role === 'NVKD').length, 1);
  const table = load(path.join(root, 'lib/management/table-utils'));
  assert.equal(table.filterRows([{ id: 1, name: 'QA', code: 'QA', status: 'active', position: 'TLS / NVKD' }], { ...table.EMPTY_QUERY, filters: { position: 'NVKD' } }, 'all').length, 1);
  checks.push('canonical titles, branch suffix removal, custom titles, unique suggestions, multi-role filtering');

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'himoto-staff-'));
  const file = path.join(folder, 'staff.xlsx');
  try {
    const w = new ExcelJS.Workbook(), s = w.addWorksheet('Sơ đồ tổ chức');
    s.getCell('F3').value = 'Quản lý công nợ\nNgười QA (Leader)\n☎ 0900000001';
    s.getCell('M3').value = 'Kế toán (KT)\nNgười QA\n☎ 0900000001';
    s.getCell('AB12').value = 'Người QA\n(Leader)\n☎ 0900000001\n☎ 0900000002';
    s.getCell('V17').value = 'PT\nNhân sự QA – PT\n☎ 0900000003';
    for (const [cell, label] of [['B10','Nguyễn Hoàng'],['D10','Láng'],['J10','Thuốc Bắc'],['P10','Hà Đông'],['V10','Giáp Bát'],['AB10','Thuê sở hữu']]) s.getCell(cell).value = `Cơ sở ${label}\n☎ 0900000010`;
    await w.xlsx.writeFile(file);
    const source = await readStaffWorkbook(file);
    assert.equal(source.staff.length, 2); assert.equal(source.staff[0].position, 'QLCN / KT / Leader'); assert.equal(source.staff[0].storeCode, 'CS6');
    assert.deepEqual(source.staff[0].phones, ['0900000001','0900000002']);
    const before = [{ id: '9', full_name: 'Tên cũ QA', phone: '0900000001', staff_code: 'ORG-QA', status: 'active' }, { id: '10', full_name: 'Cũ QA', phone: '0900000004', staff_code: 'ORG-OLD', status: 'active' }, { id: '11', staff_code: 'NV0011', status: 'active' }];
    const stores = source.stores.map((store, index) => ({ id: String(index + 1), code: store.code }));
    const plan = staffPlan(source, before, stores);
    assert.equal(plan.rows[0].id, '9'); assert.equal(plan.rows[1].id, null); assert.deepEqual(plan.departed.map(row => row.id), ['10']);
    assert.throws(() => staffPlan(source, [...before, { ...before[0], id: '12' }], stores), /Nhiều hồ sơ/);
    checks.push('Excel cell parser, NFC names, secondary phones, unique multi-department profile, stable IDs, new rows and non-destructive retirement');
  } finally { fs.unlinkSync(file); fs.rmdirSync(folder); }

  const issue = load(path.join(root, 'lib/management/customer-identity'));
  for (const date of ['', '2024-02-29', '2020-01-31']) assert(issue.validIdentityIssueDate(date));
  for (const date of ['2025-02-29', '2024-02-30', 'invalid', '15/01/2024']) assert(!issue.validIdentityIssueDate(date));
  const mapper = load(path.join(root, 'lib/management/repository'));
  assert.equal(mapper.mapApiRow('customers', { id: 1, id_card_issued_on: '2024-01-15T00:00:00.000Z' }).id_card_issued_on, '2024-01-15');
  checks.push('identity issue dates reject impossible calendar days and map to date input format');

  const db = load(path.join(root, 'lib/server/himoto-database')).himotoPool;
  const owner=load(path.join(root,'lib/server/himoto-database')).ownerDatabase,ownerDescriptors=Object.getOwnPropertyDescriptors(owner);
  const staffAccounts=load(path.join(root,'lib/server/staff-accounts')),originalStaffSync=staffAccounts.syncStaffAccount;
  const {dataAccess}=load(path.join(root,'lib/server/access-context'));
  const staffActor={id:7,access_role:'admin',scope_all:true,permissions:[]};
  staffAccounts.syncStaffAccount=async()=>null; // Atomic provisioning is covered by check-staff-accounts.cjs.
  const dbDescriptors = Object.getOwnPropertyDescriptors(db);
  const session = load(path.join(root, 'lib/server/management-session'));
  const auth = session.protectDatabaseRequest,originalUser=session.userFromSession;
  session.userFromSession=async()=>({id:7,access_role:'admin',scope_all:true,permissions:[]});
  session.protectDatabaseRequest = async () => null; // Unit handlers: auth is covered by the login suite.
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if(sql.includes('himoto.find_customer_duplicate'))return {rowCount:0,rows:[]};
    if (sql.includes('FROM himoto.customers')&&sql.includes('FOR SHARE')===false&&sql.includes('SELECT')) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [{ id: 1, staff_code: 'NV0001' }] };
  };
  Object.defineProperty(db, 'query', { configurable: true, value: query });
  Object.defineProperty(db, 'connect', { configurable: true, value: async () => ({ query, release() {} }) });
  Object.defineProperty(owner,'connect',{configurable:true,value:async()=>({query,release(){}})});
  const request = (method, data) => new NextRequest('http://localhost/api/auth/customers', { method, headers: { Origin:'http://localhost','Content-Type': 'application/json' }, body: JSON.stringify(data) });
  try {
    const accountServer = load(path.join(root, 'lib/server/cashbook-accounts'));
    const account = { owner_type: 'company', store_id: '23', bank_name: 'QA Bank', owner_name: 'QA', account_number: '0001', status: 'active', opening_balance: 0 };
    assert.equal((await accountServer.createAccount('bank', request('POST', account))).status, 201);
    assert.equal(queries.find(q => q.sql.startsWith('INSERT INTO himoto.banks')).params[0], 23);
    queries.length = 0;
    assert.equal((await accountServer.updateAccount('bank', 1, request('PATCH', { ...account, store_id: '0' }))).status, 200);
    assert.equal(queries.find(q => q.sql.startsWith('UPDATE himoto.banks')).params[1], 0);
    assert.equal((await accountServer.createAccount('bank', request('POST', { ...account, store_id: '-1' }))).status, 400);
    assert.equal((await accountServer.createAccount('cash', request('POST', { ...account, store_id: '0' }))).status, 400);
    checks.push('company account create/edit honors branch or shared scope; invalid scope and shared cash rejected');

    const staffServer = load(path.join(root, 'lib/server/staff-management'));
    queries.length = 0;
    assert.equal((await dataAccess.run(staffActor,()=>staffServer.createStaff(request('POST', { name: 'QA', phone: '0900000001', email: '', position: 'Nhân viên kinh doanh', status: 'active', store_id: 23 })))).status, 201);
    assert.equal(queries.find(q => q.sql.includes('INSERT INTO himoto.staff_profiles')).params[3], 'NVKD');
    checks.push('staff API stores canonical role before writing');

    const route = load(path.join(root, 'app/api/auth/[...path]/route'));
    const customer = { name: 'QA', phone: '0900000001', address: 'QA', id_card: '000000000001', id_card_issued_on: '2024-01-15', id_card_issued_by: 'Nơi cấp QA' };
    queries.length = 0;
    const createdCustomer=await route.POST(request('POST', customer), { params: Promise.resolve({ path: ['customers'] }) });
    assert.equal(createdCustomer.status,201,JSON.stringify(await createdCustomer.json()));
    const insert = queries.find(q => q.sql.includes('INSERT INTO himoto.customers'));
    assert.deepEqual(insert.params.slice(11,13), ['2024-01-15','Nơi cấp QA']);
    queries.length = 0;
    assert.equal((await route.PATCH(request('PATCH', { ...customer, status: 'active' }), { params: Promise.resolve({ path: ['customers','1'] }) })).status, 200);
    assert.deepEqual(queries.find(q => q.sql.includes('UPDATE himoto.customers')).params.slice(11,15), [true,'2024-01-15',true,'Nơi cấp QA']);
    assert.equal((await route.POST(request('POST', { ...customer, id_card_issued_on: '2025-02-29' }), { params: Promise.resolve({ path: ['customers'] }) })).status, 400);
    checks.push('customer create/edit API sends both identity fields to SQL and rejects invalid issue dates');
  } finally { session.protectDatabaseRequest = auth;session.userFromSession=originalUser; Object.defineProperties(db, dbDescriptors);Object.defineProperties(owner,ownerDescriptors); }
  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const client = await db.connect();
    const proxy = async (sql, params) => {
      if(sql.includes('himoto.find_customer_duplicate')){
        const updating=sql.includes('find_customer_duplicate($2');
        return client.query('SELECT id FROM pg_temp.qa_profile_customers WHERE id_card=$1 AND ($2::bigint IS NULL OR id<>$2)',[params[updating?1:0],updating?params[0]:null]);
      }
      let rewritten = sql;
      for (const table of ['staff_profiles','customers','banks','cash','stores']) rewritten = rewritten.replaceAll(`himoto.${table}`, `pg_temp.qa_profile_${table}`);
      assert(!rewritten.includes('himoto.'), 'All writes must target TEMP tables');
      return client.query(rewritten, params);
    };
    const operation = async work => { await client.query('SAVEPOINT profile_case'); const result = await work(); await client.query('RELEASE SAVEPOINT profile_case'); return result; };
    try {
      await client.query('BEGIN');
      for (const table of ['customers','banks','cash','staff_profiles']) {
        await client.query(`CREATE TEMP TABLE qa_profile_${table} (LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
        await client.query(`ALTER TABLE qa_profile_${table} ALTER COLUMN id DROP DEFAULT`);
        await client.query(`ALTER TABLE qa_profile_${table} ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY`);
      }
      await client.query('CREATE TEMP TABLE qa_profile_stores(id bigint) ON COMMIT DROP; INSERT INTO qa_profile_stores VALUES(23),(31)');
      Object.defineProperty(db, 'query', { configurable: true, value: proxy });
      // Route transactions use savepoints inside the outer rollback.
      Object.defineProperty(db, 'connect', { configurable: true, value: async () => ({ query: (sql, params) => proxy(sql === 'BEGIN' ? 'SAVEPOINT customer_write' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT customer_write' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT customer_write' : sql, params), release() {} }) });
      Object.defineProperty(owner,'connect',{configurable:true,value:async()=>({query:(sql,params)=>proxy(sql==='BEGIN'?'SAVEPOINT staff_write':sql==='COMMIT'?'RELEASE SAVEPOINT staff_write':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT staff_write':sql,params),release(){}})});
      session.protectDatabaseRequest = async () => null;
      session.userFromSession=async()=>({id:7,access_role:'admin',scope_all:true,permissions:[]});
      const accounts = load(path.join(root, 'lib/server/cashbook-accounts'));
      const values = { owner_type: 'company', store_id: '23', bank_name: 'QA', owner_name: 'QA', account_number: '0001', status: 'active', opening_balance: 0 };
      const response = await operation(() => accounts.createAccount('bank', request('POST', values)));
      assert.equal(response.status, 201);
      const accountId = (await response.json()).data.id;
      assert.equal((await proxy('SELECT store_id FROM himoto.banks WHERE id=$1',[accountId])).rows[0].store_id, '23');
      assert.equal((await accounts.updateAccount('bank', accountId, request('PATCH', { ...values, store_id: '31' }))).status, 200);
      assert.equal((await proxy('SELECT store_id FROM himoto.banks WHERE id=$1',[accountId])).rows[0].store_id, '31');
      const staff = load(path.join(root, 'lib/server/staff-management'));
      assert.equal((await dataAccess.run(staffActor,()=>staff.createStaff(request('POST', { name: 'QA', phone: '0900000001', email: '', position: 'Nhân viên kinh doanh Giáp Bát', status: 'active', store_id: 23 })))).status, 201);
      assert.equal((await proxy('SELECT position FROM himoto.staff_profiles')).rows[0].position, 'NVKD');
      const route = load(path.join(root, 'app/api/auth/[...path]/route'));
      const customer = { name: 'QA', phone: '0900000001', address: 'QA', id_card: '000000000001', id_card_issued_on: '2024-01-15', id_card_issued_by: 'Nơi cấp QA', status: 'active', store_id: 23 };
      const created = await route.POST(request('POST', customer), { params: Promise.resolve({ path: ['customers'] }) });
      assert.equal(created.status, 201); const customerId = (await created.json()).data.id;
      const identity = async () => (await proxy('SELECT id_card_issued_on::text AS day,id_card_issued_by AS place FROM himoto.customers WHERE id=$1',[customerId])).rows[0];
      assert.deepEqual(await identity(), { day: '2024-01-15', place: 'Nơi cấp QA' });
      const params = { params: Promise.resolve({ path: ['customers',String(customerId)] }) };
      const { id_card_issued_on, id_card_issued_by, ...withoutIssue } = customer;
      assert.equal((await route.PATCH(request('PATCH', withoutIssue), params)).status, 200);
      assert.deepEqual(await identity(), { day: '2024-01-15', place: 'Nơi cấp QA' });
      assert.equal((await route.PATCH(request('PATCH', { ...customer, id_card_issued_on: '', id_card_issued_by: '' }), params)).status, 200);
      assert.deepEqual(await identity(), { day: null, place: null });
      checks.push('PostgreSQL TEMP rollback: branch company account roundtrip, canonical staff insert, customer identity create/update/preserve/clear; no operational writes');
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); session.protectDatabaseRequest = auth;session.userFromSession=originalUser; Object.defineProperties(db, dbDescriptors);Object.defineProperties(owner,ownerDescriptors); }
  }
  staffAccounts.syncStaffAccount=originalStaffSync;
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });

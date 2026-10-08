const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), Excel = require('exceljs');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(localRequire, module, module.exports); return module.exports;
}
const shared = load(path.join(root, 'lib/management/contract-import'));
const legacy = load(path.join(root, 'lib/management/customer-order-excel'));
const server = load(path.join(root, 'lib/server/contract-import'));
const order = patch => ({ filename: 'KH QA.xlsx', rowNumber: 2, sourceId: '900', storeId: 23, createdAt: '2026-10-06 10:00:01', name: 'Khách QA', phone: '0900000001', originalPhone: '0900000001', vehicleName: 'Xe QA', license: 'QA-00100', start: '2026-10-06 09:00:02', end: '2026-10-07 09:00:03', note: '', paid: '1100000', total: '100000', status: 'renting', errors: [], ...patch });
const snapshot = () => ({ stores: [{ id: 23, name: 'Cơ sở QA' }], customers: [{ id: 7, name: 'Khách QA', phone: '0900000001', store_id: 23, id_card: null, address: null }],
  vehicles: [100, 101, 102].map(id => ({ id, name: 'Xe QA', license: `QA-00${id}`, store_id: 23, current_store_id: 23, status: 'ready' })), orders: [], details: [] });
function book(row = []) { const b = new Excel.Workbook(), s = b.addWorksheet('Worksheet'); s.addRow(legacy.ORDER_CUSTOMER_HEADERS); s.addRow(row.length ? row : [900, '2026-10-06 10:00:01', 'Khách QA', '0900000001', 'Xe QA', 'QA-00100', '2026-10-06 09:00:02', '2026-10-07 09:00:03', '', 1100000, 100000, 'renting']); return b; }
async function main() {
  const checks = [];
  let b = book(), source = shared.parseContractOrderWorkbook(b, 'KH QA.xlsx', 23)[0];
  assert.equal(source.phone, '0900000001'); assert.equal(source.paid, '1100000'); assert.equal(source.total, '100000'); assert(!Object.hasOwn(source, 'deposit'));
  assert.equal(shared.contractImportTimestamp(source.start), '2026-10-06T09:00:02+07:00');
  assert.equal(shared.contractExcelDate('2026-02-29 12:00:00'), ''); assert.equal(shared.contractExcelDate('2026-01-01 24:00:00'), ''); assert.equal(shared.contractExcelDate('07/10/2026'), '');
  assert.equal(shared.contractExcelDate(new Date('2026-10-06T09:00:02Z')), '2026-10-06 09:00:02');
  b.worksheets[0].getCell('D2').value = 900000001; source = shared.parseContractOrderWorkbook(b, 'KH QA.xlsx', 23)[0]; assert.equal(source.phone, ''); assert(source.errors.length);
  b.worksheets[0].getCell('D2').numFmt = '0000000000'; assert.equal(shared.parseContractOrderWorkbook(b, 'KH QA.xlsx', 23)[0].phone, '0900000001');
  for (const [cell, value] of [['G2', '2026-02-30 12:00:00'], ['H2', '2026-10-01 12:00:00'], ['J2', -1], ['K2', 1.5], ['J2', { formula: '1+1', result: 2 }], ['C2', { formula: '1+1', result: 2 }], ['L2', 'completed']]) {
    b = book(); b.worksheets[0].getCell(cell).value = value; assert(shared.parseContractOrderWorkbook(b, 'QA.xlsx', 23)[0].errors.length);
  }
  b = book(); b.worksheets[0].getCell('M2').value = 'extra'; assert.throws(() => shared.parseContractOrderWorkbook(b, 'QA.xlsx', 23));
  checks.push('strict source schema preserves Text phones, treats old deposit label as total paid, rejects numeric identity/formulas/money/date/status errors and uses explicit Vietnam timestamps');

  let db = snapshot(), plans = shared.planContractImport([order(), order({ rowNumber: 3, license: 'QA-00101' })], db);
  assert.equal(plans.length, 1); assert.equal(plans[0].state, 'new'); assert.deepEqual(plans[0].vehicleIds, [100, 101]); assert.equal(plans[0].sources[0].paid, '1100000');
  plans = shared.planContractImport([order(), order({ rowNumber: 3, license: 'qa.00100' })], db); assert.equal(plans[0].vehicleIds.length, 1);
  for (const patch of [{ paid: '200' }, { name: 'Tên khác' }, { storeId: 31 }, { start: '2026-10-05 09:00:02' }]) assert.equal(shared.planContractImport([order(), order({ rowNumber: 3, ...patch })], db)[0].state, 'blocked');
  plans = shared.planContractImport([order(), order({ sourceId: '901', rowNumber: 3 })], db); assert(plans.every(plan => plan.state === 'blocked'));
  checks.push('multi-vehicle source IDs form one complete order without summing money, exact repeated vehicles deduplicate, inconsistent rows and plates across active orders block all affected groups');

  for (const transform of [d => d.customers.push({ ...d.customers[0], id: 8 }), d => d.vehicles.push({ ...d.vehicles[0], id: 103 }), d => d.customers[0].phone = '0900000099', d => d.customers[0].store_id = 31, d => d.vehicles[0].current_store_id = 31, d => d.vehicles[0].status = 'sold', d => d.vehicles.shift()]) {
    db = snapshot(); transform(db); assert.equal(shared.planContractImport([order()], db)[0].state, 'blocked');
  }
  db = snapshot(); db.orders = [{ id: 50, store_id: 23, customer_id: 8, order_status: 'renting' }]; db.details = [{ id: 1, order_id: 50, vehicle_id: 100, completed_at: null }];
  assert.equal(shared.planContractImport([order()], db)[0].state, 'blocked');
  checks.push('exact customer/plate uniqueness, customer and current vehicle branch, operational status and active contract conflicts protect against assigning the wrong customer or vehicle');

  db = snapshot(); db.orders = [{ id: 900, store_id: 23, customer_id: 7, order_status: 'renting', created_at: '2026-10-06T10:00:01Z', pid: '1000000', total: '100000' }];
  db.details = [{ id: 1, order_id: 900, vehicle_id: 100, rent_at: '2026-10-06T09:00:02Z', return_at: '2026-10-07T09:00:03Z' }];
  plans = shared.planContractImport([order()], db); assert.equal(plans[0].state, 'existing'); assert.equal(plans[0].targetId, 900); assert(plans[0].warnings.some(w => w.includes('Số tiền'))); assert(plans[0].warnings.some(w => w.includes('múi giờ')));
  for (const change of [d => d.orders[0].customer_id = 8, d => d.orders[0].created_at = '2026-10-05T10:00:01Z', d => d.details[0].vehicle_id = 101, d => d.orders[0].order_status = 'completed', d => d.orders[0].deleted_at = '2026-10-07']) {
    const changed = structuredClone(db); change(changed); const result = shared.planContractImport([order()], changed)[0]; assert.notEqual(result.state, 'existing');
  }
  checks.push('legacy ID matching requires customer/branch/complete vehicle set/created and rent start; drift is reported, and closed/deleted contracts are never silently reopened');
  assert.equal(server.contractSnapshotHash({ a: 1, b: new Date('2026-10-07T00:00:00Z') }), server.contractSnapshotHash({ b: '2026-10-07T00:00:00.000Z', a: 1 }));
  checks.push('snapshot digest is stable after JSON serialization and reordered object keys');

  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
    const tableNames = ['orders', 'order_vehicle_details', 'customers', 'vehicles', 'stores', 'staff_profiles', 'transactions'];
    let inserts = 0, failSecond = false;
    const proxy = { query: async (sql, params) => {
      let rewritten = sql; for (const table of [...tableNames].sort((a, b) => b.length - a.length)) rewritten = rewritten.replaceAll(`himoto.${table}`, `pg_temp.qa_${table}`);
      assert(!rewritten.includes('himoto.'), 'Every business query must use TEMP tables');
      if (rewritten.startsWith('INSERT INTO pg_temp.qa_orders') && ++inserts === 2 && failSecond) throw new Error('Simulated second insert failure');
      return c.query(rewritten, params);
    } };
    const transaction = async work => { await c.query('SAVEPOINT import_case'); try { const r = await work(); await c.query('RELEASE SAVEPOINT import_case'); return r; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT import_case'); await c.query('RELEASE SAVEPOINT import_case'); throw e; } };
    const counts = async () => ({ orders: Number((await c.query('SELECT count(*) AS n FROM pg_temp.qa_orders')).rows[0].n), details: Number((await c.query('SELECT count(*) AS n FROM pg_temp.qa_order_vehicle_details')).rows[0].n) });
    try {
      await c.query('BEGIN');
      // LIKE copies no rows, triggers or FKs. Replace all copied ID defaults
      // before any INSERT so a QA run cannot consume production sequences.
      for (const table of ['orders', 'order_vehicle_details', 'customers', 'vehicles', 'transactions']) {
        await c.query(`CREATE TEMP TABLE qa_${table} (LIKE himoto.${table} INCLUDING DEFAULTS)`);
        await c.query(`ALTER TABLE pg_temp.qa_${table} ALTER COLUMN id DROP DEFAULT`);
        await c.query(`ALTER TABLE pg_temp.qa_${table} ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY`);
      }
      await c.query(`CREATE TEMP TABLE qa_stores(id bigint,store_name text,code text); CREATE TEMP TABLE qa_staff_profiles(id bigint,store_id bigint,user_id bigint);
        INSERT INTO qa_stores VALUES(23,'Cơ sở QA','QA-23');
        INSERT INTO qa_customers(id,name,phone,status,store_id) VALUES(7,'Khách QA','0900000001',0,23);
        INSERT INTO qa_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES(100,'Xe QA','Honda','xeso',2026,23,23,'QA-00100','ready',143),(101,'Xe QA','Honda','xeso',2026,23,23,'QA-00101','ready',143),(102,'Xe QA','Honda','xeso',2026,23,23,'QA-00102','ready',143);
        INSERT INTO qa_orders(id,order_status,total,pid) VALUES(50,'completed','123','456');`);
      // Legacy stock may have only store_id. An explicit current_store_id must
      // still take priority and a genuinely different branch must be rejected.
      await c.query('UPDATE pg_temp.qa_vehicles SET current_store_id=NULL WHERE id=100');
      const inputs = [order(), order({ rowNumber: 3, license: 'QA-00101' }), order({ sourceId: '902', rowNumber: 4, license: 'QA-00102' })];
      const preview = await server.previewDatabaseContracts(proxy, inputs);
      const originalOrders = (await c.query('SELECT * FROM pg_temp.qa_orders ORDER BY id')).rows;
      const originalVehicles = (await c.query('SELECT * FROM pg_temp.qa_vehicles ORDER BY id')).rows;
      assert.deepEqual(await counts(), { orders: 1, details: 0 });
      failSecond = true;
      await assert.rejects(transaction(() => server.importDatabaseContractDrafts(proxy, inputs, preview.revision, 2, 143)), /second insert failure/);
      assert.deepEqual(await counts(), { orders: 1, details: 0 }); failSecond = false; inserts = 0;
      checks.push('real PostgreSQL TEMP preview writes nothing and a failed second draft insert rolls back the whole batch');

      await assert.rejects(transaction(() => server.importDatabaseContractDrafts(proxy, inputs, preview.revision, 3, 143)), /count/);
      await c.query("UPDATE pg_temp.qa_vehicles SET status='broken' WHERE id=100");
      await assert.rejects(transaction(() => server.importDatabaseContractDrafts(proxy, inputs, preview.revision, 2, 143)), /Data changed/);
      await c.query("UPDATE pg_temp.qa_vehicles SET status='ready' WHERE id=100");
      const next = await server.previewDatabaseContracts(proxy, inputs);
      const imported = await transaction(() => server.importDatabaseContractDrafts(proxy, inputs, next.revision, 2, 143));
      assert.equal(imported.added.length, 2); assert.deepEqual(await counts(), { orders: 3, details: 0 });
      assert.equal(server.contractSnapshotHash((await c.query('SELECT * FROM pg_temp.qa_vehicles ORDER BY id')).rows), server.contractSnapshotHash(originalVehicles));
      assert.equal(server.contractSnapshotHash((await c.query('SELECT * FROM pg_temp.qa_orders WHERE id=50')).rows), server.contractSnapshotHash(originalOrders));
      const drafts = (await c.query("SELECT * FROM pg_temp.qa_orders WHERE order_status='draft' ORDER BY id")).rows;
      assert.equal(drafts.length, 2);
      for (const draft of drafts) {
        const snapshot = draft.draft_payload.management_composer.draft;
        assert.equal(draft.customer_id, '7'); assert.equal(draft.store_id, '23'); assert.equal(draft.pid, '0'); assert.equal(draft.total, '0'); assert.equal(draft.first_deposit_amount, null); assert.equal(draft.additional_deposit_amount, null);
        assert.equal(snapshot.paid_amount, '1100000'); assert.equal(snapshot.total_amount, '100000'); assert.equal(snapshot.deposit_amount, ''); assert.equal(snapshot.unit_price, ''); assert.equal(snapshot.signed_on, '');
        assert.equal(draft.draft_payload.order_items[0].rent_at, '2026-10-06T09:00:02+07:00'); assert.equal(draft.draft_payload.order_items[0].return_at, '2026-10-07T09:00:03+07:00');
      }
      const repeated = await server.previewDatabaseContracts(proxy, inputs);
      assert(repeated.plans.every(plan => plan.state === 'existing'));
      await assert.rejects(transaction(() => server.importDatabaseContractDrafts(proxy, inputs, repeated.revision, 2, 143)), /count/);
      checks.push('stale revision and wrong counts abort; safe draft import preserves old orders/vehicle state, leaves financial columns/cọc untouched, preserves seconds in snapshot and blocks repeated import');

      await c.query(`INSERT INTO qa_order_vehicle_details(order_id,vehicle_id,rent_at,return_at) VALUES(50,100,'2026-10-06T09:00:02+07:00','2026-10-07T09:00:03+07:00');
        INSERT INTO qa_order_vehicle_details(order_id,vehicle_id,rent_at,return_at,deleted_at) VALUES(50,101,'2026-01-01T09:00:00+07:00','2027-01-01T09:00:00+07:00',now());`);
      const sql = load(path.join(root, 'lib/server/contract-drafts')).CONTRACT_LIST_SQL;
      const list = (await proxy.query(`${sql} AND o.id=50`)).rows[0];
      assert.equal(list.start_date.toISOString(), '2026-10-06T02:00:02.000Z'); assert.equal(list.end_date.toISOString(), '2026-10-07T02:00:03.000Z'); assert.equal(list.paid_amount, '456');
      assert.equal(list.deposit_amount, null); assert.equal(list.vehicles.length, 1);
      await c.query("UPDATE pg_temp.qa_orders SET rent_at='2026-10-05T09:00:00+07:00',return_at='2026-10-08T09:00:00+07:00' WHERE id=50");
      const explicit = (await proxy.query(`${sql} AND o.id=50`)).rows[0]; assert.equal(explicit.start_date.toISOString(), '2026-10-05T02:00:00.000Z'); assert.equal(explicit.end_date.toISOString(), '2026-10-08T02:00:00.000Z');
      checks.push('real contract list SQL uses live detail dates only when parent dates are missing, ignores deleted details, exposes total paid separately and retains NULL for unknown deposit');
      await c.query(`INSERT INTO qa_transactions(order_id,name,type,value,note,status,user_id,store_id,bank_owner_type)
        VALUES(50,'QA','in',400,'QA','approved',143,23,'company'),
          (50,'QA','in',100,'QA','pending',143,23,'company'),
          (50,'QA','out',200,'QA','approved',143,23,'company'),
          (50,'QA','in',300,'QA','approved',143,23,'personal');`);
      const company = (await proxy.query(`${sql} AND o.id=50`)).rows[0];
      assert.equal(Number(company.company_paid_amount),400); assert.equal(company.company_payment_count,1);
      assert.equal(company.paid_amount,'456'); assert.equal(company.deposit_amount,null);
      checks.push('real contract list VAT fields aggregate only approved company income; pending, expense and personal transfers excluded without changing paid/deposit');
    } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks, permanentBusinessWrites: 0 }, null, 2));
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });

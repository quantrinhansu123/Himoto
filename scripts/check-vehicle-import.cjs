const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const Excel = require('exceljs');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', javascript)(localRequire, module, module.exports); return module.exports;
}
const shared = load(path.join(root, 'lib/management/vehicle-import'));
const excel = load(path.join(root, 'lib/management/vehicle-excel'));
const server = load(path.join(root, 'lib/server/vehicle-import'));
const values = patch => ({ id: '', name: 'Xe QA', brand: 'Honda', type: 'Xe điện', year: '2025', license: 'QA-01001', color: 'Đen', chassis: '0012345', engine: '006789', store: 'Cơ sở QA', status: 'Sẵn sàng', odometer: '100', ...patch });
const input = (patch = {}, rowNumber = 2) => ({ rowNumber, values: values(patch), errors: [], warnings: [] });
const stores = [{ id: 23, name: 'Cơ sở QA', code: 'QA-23' }];
const request = (rows, patch = {}) => server.vehicleImportRequest({ rows, mode: 'sync', commit: false, revision: '', acceptWarnings: false, skipUnknownStores: false, ...patch });

async function main() {
  const checks = [];
  let result = shared.validateVehicleImport([input()], stores, [], 'sync');
  assert.equal(result[0].state, 'valid'); assert.equal(result[0].values.type, 'xe_dien'); assert.equal(result[0].storeId, 23);
  for (const patch of [{ license: '' }, { license: 'x'.repeat(26) }, { year: '4' }, { odometer: '-1' }, { id: '9007199254740992' }, { color: '4' }, { type: 'unknown' }, { store: 'Không có' }, { status: 'unknown' }]) assert.equal(shared.validateVehicleImport([input(patch)], stores, [], 'sync')[0].state, 'invalid');
  result = shared.validateVehicleImport([input({ color: '' })], stores, [], 'sync');
  assert.equal(result[0].state, 'valid'); assert(result[0].warnings.length);
  checks.push('schema length, numeric IDs/year/km, license/type/status/store validation and missing/numeric color handling');

  const current = [{ id: '101', license: 'QA-01001', store_id: '23', current_store_id: '31', color: 'Đỏ', status: 'using' }];
  assert.equal(shared.validateVehicleImport([input({ id: '101', store: 'Cơ sở cũ #4' })], stores, current, 'sync')[0].state, 'valid');
  assert.equal(shared.validateVehicleImport([input({ id: '102' })], stores, current, 'sync')[0].state, 'invalid');
  assert.equal(shared.validateVehicleImport([input({ id: '101', license: 'QA-OTHER' })], stores, current, 'sync')[0].state, 'invalid');
  const duplicates = shared.validateVehicleImport([input(), input({ license: 'qa.01001' }, 3)], stores, [], 'sync');
  assert(duplicates.every(row => row.state === 'invalid'));
  result = shared.validateVehicleImport([input({ store: 'Cơ sở cũ #23' }), input({ store: 'Cơ sở cũ #4', color: '4' }, 3)], stores, [], 'sync', true);
  assert.deepEqual(result.map(row => row.state), ['valid', 'skipped']);
  assert.equal(shared.validateVehicleImport([input({ store: 'Cơ sở cũ #23' })], stores, [], 'sync', false)[0].state, 'invalid');
  checks.push('preserves matched identity, rejects conflicting IDs/duplicate normalized plates and only skips unknown stores when explicitly selected');

  for (const patch of [{ commit: 'true' }, { mode: 'clear' }, { revision: 4 }, { rows: [] }, { rows: [input(), input()] }, { rows: [input({ surprise: 'SQL' })] }, { skipUnknownStores: 'true' }]) assert.throws(() => request([input()], patch));
  await assert.rejects(server.readVehicleRequestBody(new Request('http://qa.invalid', { method: 'POST', body: 'x'.repeat(server.VEHICLE_IMPORT_BODY_LIMIT + 1) })), error => error.status === 413);
  checks.push('strict bounded server payload rejects invalid flags, duplicate row numbers, extra fields and oversized streamed bodies');

  const template = new Excel.Workbook(); await template.xlsx.load(await excel.createVehicleTemplate(stores));
  assert.equal(template.worksheets[0].getCell('G1').value, 'Màu sắc');
  assert.equal(template.worksheets[0].getCell('F2').numFmt, '@'); assert.equal(template.worksheets[0].getCell('H2').numFmt, '@');
  assert.equal(template.worksheets[0].getCell('J2').dataValidation.formulae[0], 'HimotoVehicleStores');
  const standard = new Excel.Workbook(); const s = standard.addWorksheet('Xe');
  s.addRow([...shared.VEHICLE_IMPORT_COLUMNS.map(c => c.label), '2', '4']);
  s.addRow([...shared.VEHICLE_IMPORT_COLUMNS.map(c => values()[c.key]), 'Không rõ', 123]);
  const parsed = excel.parseVehicleWorkbook(standard);
  assert.equal(parsed.rows[0].values.license, 'QA-01001'); assert.equal(parsed.rows[0].values.color, 'Đen'); assert.equal(parsed.ignoredColumns.length, 2);
  s.getCell('F2').value = { formula: '1+1', result: 2 }; assert(excel.parseVehicleWorkbook(standard).rows[0].errors.length);
  s.getCell('M1').value = 'Biển số'; assert.throws(() => excel.parseVehicleWorkbook(standard), /hai lần/);
  checks.push('download template includes Text formats and real branch dropdown; header matching ignores extras and rejects formulas/duplicate core columns');

  const legacy = new Excel.Workbook(), old = legacy.addWorksheet('Worksheet');
  old.addRow(['Tên','Brand','Loại xe','Đời xe','Biển số','Màu sắc','Cửa hàng','Giá mua','Giá bán','Trạng thái','Ngày tạo']);
  old.addRow([101,'Xe QA','Honda','xega',2025,23,'QA-01001','00123','00456','ready',null,null,null,143,'2026-01-01','2026-01-02','Đen',2,0,0,200]);
  const repaired = excel.parseVehicleWorkbook(legacy);
  assert.equal(repaired.legacy, true); assert.equal(repaired.rows[0].values.license, 'QA-01001'); assert.equal(repaired.rows[0].values.color, 'Đen'); assert.equal(repaired.rows[0].values.year, '2025'); assert.equal(repaired.rows[0].values.store, 'Cơ sở cũ #23'); assert.equal(repaired.rows[0].values.odometer, '200');
  old.getCell('E2').value = 'xega'; assert.throws(() => excel.parseVehicleWorkbook(legacy), /không khớp/);
  checks.push('verified 21-column legacy signature maps G plate/Q color/E year/F store/U km and refuses an inconsistent positional row');

  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
    let failBackup = false, failInsert = false; const queries = [];
    const refs = [{ table_schema: 'pg_temp', table_name: 'qa_orders', column_name: 'vehicle_id', data_type: 'bigint' }];
    const proxy = { query: async (sql, params) => {
      queries.push(sql);
      if (sql.includes('information_schema.columns')) return { rows: refs, rowCount: refs.length };
      if (sql.includes('pg_constraint')) return { rows: [], rowCount: 0 };
      const rewritten = sql.replaceAll('himoto.vehicle_import_backups', 'pg_temp.qa_backups').replaceAll('himoto.vehicles_id_seq', 'pg_temp.qa_vehicles_id_seq').replaceAll('himoto.vehicles', 'pg_temp.qa_vehicles').replaceAll('himoto.stores', 'pg_temp.qa_stores');
      assert(!rewritten.includes('himoto.'), 'Every business table MUST be rewritten to temporary tables');
      if (failBackup && rewritten.startsWith('INSERT INTO pg_temp.qa_backups')) throw new Error('simulated backup failure');
      if (failInsert && rewritten.startsWith('INSERT INTO pg_temp.qa_vehicles')) throw new Error('simulated insert failure');
      return c.query(rewritten, params);
    } };
    // Pin one PostgreSQL backend through transaction-pooling Supabase. Nested
    // cases use savepoints; the outer rollback removes all TEMP objects/data.
    const transaction = async work => { await c.query('SAVEPOINT vehicle_case'); try { const r = await work(); await c.query('RELEASE SAVEPOINT vehicle_case'); return r; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT vehicle_case'); await c.query('RELEASE SAVEPOINT vehicle_case'); throw e; } };
    const count = async table => Number((await c.query(`SELECT count(*) AS n FROM pg_temp.${table}`)).rows[0].n);
    try {
      await c.query('BEGIN');
      await c.query(`CREATE TEMP SEQUENCE qa_vehicles_id_seq;
        CREATE TEMP TABLE qa_vehicles (id bigint PRIMARY KEY DEFAULT nextval('pg_temp.qa_vehicles_id_seq'),name varchar(255) NOT NULL,brand varchar(255) NOT NULL,type varchar(25) NOT NULL,year bigint NOT NULL,store_id bigint NOT NULL,license varchar(25) NOT NULL,color varchar(255),chassis varchar(255),engine varchar(255),status varchar(255) NOT NULL,cost_price varchar(255),sale_price varchar(255),price_range text,created_by bigint NOT NULL,created_at timestamptz,updated_at timestamptz,type_of_service_id smallint NOT NULL DEFAULT 1,price_min bigint DEFAULT 0,price_max bigint DEFAULT 0,odometer bigint,current_store_id bigint);
        CREATE TEMP TABLE qa_stores(id bigint PRIMARY KEY,store_name text,code text);
        CREATE TEMP TABLE qa_orders(vehicle_id bigint);
        CREATE TEMP TABLE qa_backups(id uuid PRIMARY KEY,action text,created_by bigint,row_count integer,sha256 text,payload jsonb);
        INSERT INTO qa_stores VALUES(23,'Cơ sở QA','QA-23');
        INSERT INTO qa_vehicles(id,name,brand,type,year,store_id,license,color,status,created_by,current_store_id,cost_price) VALUES(101,'Cũ QA','Honda','xega',2024,23,'QA-01001','Đỏ','using',143,31,'123');`);
      let preview = await transaction(() => server.importDatabaseVehicles(proxy, request([input({ id: '101', color: '', chassis: '', engine: '', odometer: '' }), input({ id: '105', license: 'QA-01005' }, 3), input({ store: 'Cơ sở cũ #4' }, 4)], { skipUnknownStores: true }), 143));
      assert.equal(preview.valid, 2); assert.equal(preview.skipped, 1); assert.equal(await count('qa_backups'), 0);
      const committed = await transaction(() => server.importDatabaseVehicles(proxy, request([input({ id: '101', color: '', chassis: '', engine: '', odometer: '' }), input({ id: '105', license: 'QA-01005' }, 3), input({ store: 'Cơ sở cũ #4' }, 4)], { skipUnknownStores: true, commit: true, revision: preview.revision, acceptWarnings: true }), 143));
      assert.equal(committed.updated, 1); assert.equal(committed.inserted, 1); assert.equal(await count('qa_vehicles'), 2); assert.equal(await count('qa_backups'), 1);
      const backup = (await c.query('SELECT sha256,payload FROM pg_temp.qa_backups')).rows[0];
      assert.equal(server.vehicleSnapshotHash(backup.payload), backup.sha256);
      const saved = (await c.query('SELECT * FROM pg_temp.qa_vehicles WHERE id=101')).rows[0];
      assert.equal(saved.status, 'using'); assert.equal(saved.current_store_id, '31'); assert.equal(saved.store_id, '23'); assert.equal(saved.cost_price, '123'); assert.equal(saved.color, 'Đỏ');
      checks.push('real PostgreSQL TEMP-table sync preserves IDs/store/status/prices/nonblank color, inserts explicit ID, skips selected outside-store rows and saves exact pre-change snapshot');

      preview = await transaction(() => server.importDatabaseVehicles(proxy, request([input({ license: 'QA-01006' })]), 143));
      await c.query("UPDATE pg_temp.qa_vehicles SET color='Xanh' WHERE id=101");
      await assert.rejects(transaction(() => server.importDatabaseVehicles(proxy, request([input({ license: 'QA-01006' })], { commit: true, revision: preview.revision, acceptWarnings: true }), 143)), e => e.status === 409);
      preview = await transaction(() => server.importDatabaseVehicles(proxy, request([input({ license: 'QA-01006' })]), 143));
      failBackup = true;
      await assert.rejects(transaction(() => server.importDatabaseVehicles(proxy, request([input({ license: 'QA-01006' })], { commit: true, revision: preview.revision, acceptWarnings: true }), 143)), /backup failure/);
      failBackup = false; assert.equal(await count('qa_vehicles'), 2); assert.equal(await count('qa_backups'), 1);
      checks.push('stale DB revision and failed durable backup abort before writes');

      await c.query('INSERT INTO pg_temp.qa_orders VALUES(101)');
      const blocked = await transaction(() => server.importDatabaseVehicles(proxy, request([input()], { mode: 'replace' }), 143));
      assert(blocked.blocking.length);
      await assert.rejects(transaction(() => server.importDatabaseVehicles(proxy, request([input()], { mode: 'replace', commit: true, revision: blocked.revision, acceptWarnings: true }), 143)), e => e.status === 409);
      const reset = await transaction(() => server.previewVehicleReset(proxy));
      assert(reset.blocking.length);
      await assert.rejects(transaction(() => server.resetDatabaseVehicles(proxy, { revision: reset.revision, confirmation: 'XÓA HẾT XE' }, 143)), e => e.status === 409);
      assert.equal(await count('qa_vehicles'), 2);
      checks.push('linked rows block both replace and reset without deleting history or vehicles');

      await c.query('DELETE FROM pg_temp.qa_orders');
      const replacement = request([input({ license: 'QA-01006' })], { mode: 'replace' });
      preview = await transaction(() => server.importDatabaseVehicles(proxy, replacement, 143));
      failInsert = true;
      await assert.rejects(transaction(() => server.importDatabaseVehicles(proxy, { ...replacement, commit: true, revision: preview.revision, acceptWarnings: true }, 143)), /insert failure/);
      failInsert = false; assert.equal(await count('qa_vehicles'), 2); assert.equal(await count('qa_backups'), 1);
      const replaced = await transaction(() => server.importDatabaseVehicles(proxy, { ...replacement, commit: true, revision: preview.revision, acceptWarnings: true }, 143));
      assert.equal(replaced.inserted, 1); assert.equal(await count('qa_vehicles'), 1); assert.equal(await count('qa_backups'), 2);
      const newId = Number((await c.query('SELECT id FROM pg_temp.qa_vehicles')).rows[0].id); assert(newId > 105);
      checks.push('failed insert rolls back the preceding delete and backup; successful atomic replace keeps sequence above existing/imported IDs');
      const safe = await transaction(() => server.previewVehicleReset(proxy));
      const cleared = await transaction(() => server.resetDatabaseVehicles(proxy, { revision: safe.revision, confirmation: 'XÓA HẾT XE' }, 143));
      assert.equal(cleared.removed, 1); assert.equal(await count('qa_vehicles'), 0); assert.equal(await count('qa_backups'), 3);
      assert(queries.some(sql => sql.includes('LOCK TABLE')));
      checks.push('unlinked reset backs up before delete and checks the exact removed count');
    } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks, permanentBusinessWrites: 0 }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

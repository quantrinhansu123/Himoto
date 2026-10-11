const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', javascript)(localRequire, module, module.exports);
  return module.exports;
}
async function run() {
  const { createDemoRepository, createApiRepository, mapApiRow } = load(path.join(root, 'lib/management/repository'));
  const { createContractDraft } = load(path.join(root, 'lib/management/contract-document'));
  const { DEMO_DRAFT_STORAGE_KEY, readDemoDrafts } = load(path.join(root, 'lib/management/contract-drafts'));
  const { CONTRACT_STATUSES, MANAGEMENT_CONFIG, optionLabel } = load(path.join(root, 'lib/management/config'));
  const { parseDraftEdits, saveDatabaseDraft, CONTRACT_LIST_SQL } = load(path.join(root, 'lib/server/contract-drafts'));
  const checks = [];
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const repository = createDemoRepository(storage);
  const before = await repository.load();
  const draft = createContractDraft(before, 'all');
  draft.customer_lookup = '0900012345'; draft.customer_source = 'Đang nhập';
  const edits = { draft, status: 'draft', rental_type: 'daily', notes: 'Chưa chọn khách và xe' };
  const saved = await repository.saveContractDraft(null, edits);
  assert.equal(saved.row.status, 'draft'); assert.equal(saved.dataset.contracts.length, before.contracts.length + 1);
  assert.equal(saved.row.customer_id, undefined); assert.equal(saved.row.total_amount, undefined);
  assert.deepEqual(saved.dataset.vehicles, before.vehicles);
  const fresh = createDemoRepository(storage); const restored = await fresh.load();
  assert.deepEqual(restored.contracts.find(row => row.id === saved.row.id), JSON.parse(JSON.stringify(saved.row)));
  const reopened = createContractDraft(restored, 'all', saved.row);
  assert.equal(reopened.customer_lookup, '0900012345'); assert.equal(reopened.customer_source, 'Đang nhập');
  checks.push('incomplete drafts save and survive reload without allocating a customer, vehicle, payment, or deposit');
  reopened.customer_source = 'Tiếp tục sửa';
  const updated = await fresh.saveContractDraft(saved.row.id, { ...edits, draft: reopened, notes: 'Đã sửa' });
  assert.equal(updated.row.code, saved.row.code); assert.equal(updated.dataset.contracts.length, restored.contracts.length);
  assert.equal(createContractDraft(updated.dataset, 'all', updated.row).customer_source, 'Tiếp tục sửa');
  await assert.rejects(fresh.saveContractDraft(before.contracts[0].id, edits), /Chỉ cập nhật bản nháp/);
  await assert.rejects(fresh.saveContractDraft(null, { ...edits, draft: { ...draft, total_amount: '-1' } }), /số tiền/);
  await assert.rejects(fresh.saveContractDraft(null, { ...edits, draft: { ...draft, store_id: '99999' } }), /Cơ sở/);
  await assert.rejects(fresh.saveContractDraft(null, { ...edits, draft: { ...draft, contract_number: saved.row.code } }), /đã được sử dụng/);
  assert(CONTRACT_STATUSES.some(option => option.value === 'draft' && option.label === 'Lưu nháp'));
  assert.equal(optionLabel(MANAGEMENT_CONFIG.contracts, 'status', 'bad_debt'), 'Nợ xấu');
  checks.push('updates preserve ID/code; issued contracts, invalid values, and duplicate numbers are rejected; statuses are Vietnamese');
  const broken = createDemoRepository({ ...storage, setItem: () => { throw new Error('Quota exceeded'); } });
  const unchanged = await broken.load();
  await assert.rejects(broken.saveContractDraft(null, edits), /Không lưu được/);
  assert.deepEqual(await broken.load(), unchanged);
  values.set(DEMO_DRAFT_STORAGE_KEY, 'broken'); assert.throws(() => readDemoDrafts(storage), /Dữ liệu lưu vẫn được giữ nguyên/);
  assert.equal(values.get(DEMO_DRAFT_STORAGE_KEY), 'broken');
  values.delete(DEMO_DRAFT_STORAGE_KEY);
  checks.push('storage errors are reported without partial writes or silently deleting unreadable drafts');
  assert.deepEqual(parseDraftEdits(edits), edits);
  for (const invalid of [null, {}, { ...edits, status: 'renting' }, { ...edits, draft: { ...draft, store_id: '1 OR 1=1' } }, { ...edits, draft: { ...draft, customer: null } }]) assert.throws(() => parseDraftEdits(invalid));
  const snapshot = { ...draft, contract_number: 'NHAP-9000' };
  const raw = { id: 9000, draft_reference: 'NHAP-9000', status: 'draft', draft_revision: '100', draft_payload: { management_composer: { version: 1, ...edits, draft: snapshot } } };
  const mapped = mapApiRow('contracts', raw);
  assert.deepEqual(createContractDraft(before, 'all', mapped), snapshot);
  assert.equal(mapped.draft_revision, '100'); assert.equal(mapped.total_amount, undefined);
  const legacy = mapApiRow('contracts', { id: 1, draft_reference: 'OLD-DRAFT', order_status: 'draft', store_id: 1,
    draft_payload: { order_items: [{ vehicle_id: before.vehicles[0].id, driver_name: 'Người lái cũ', borrow_hats: 2, borrow_raincoats: 1 }] } });
  assert.equal(legacy.code, 'OLD-DRAFT'); assert.equal(legacy.status, 'draft');
  const legacyDraft = createContractDraft(before, 'all', legacy);
  assert.equal(legacyDraft.vehicles[0].driver_name, 'Người lái cũ'); assert.equal(legacyDraft.vehicles[0].borrow_hats, '2');
  const legacyClient = { query: async sql => {
    if (sql.includes('FOR UPDATE')) return { rows: [{ id: 99, order_status: 'draft', contract_number: 'PUBLIC-NUMBER', draft_reference: 'DRAFT-REFERENCE', draft_revision: '1' }] };
    if (sql.startsWith(CONTRACT_LIST_SQL)) return { rows: [{ id: 99, status: 'draft', contract_number: 'PUBLIC-NUMBER' }] };
    if (sql.includes('COALESCE(SUM(value),0) AS paid')) return {rows:[{paid:0}],rowCount:1};
    return { rows: [], rowCount: 0 };
  } };
  const numbered = await saveDatabaseDraft(legacyClient, 99, { ...edits, draft: { ...draft, contract_number: 'PUBLIC-NUMBER' }, revision: '1' });
  assert.equal(numbered.contract_number, 'PUBLIC-NUMBER');
  checks.push('server validates untrusted draft bodies; API snapshots and legacy draft payloads retain editable details');
  const originalFetch = global.fetch;
  const calls = [];
  try {
    const api = createApiRepository('/api');
    await assert.rejects(api.saveContractDraft(null, edits), /Chưa tích hợp/);
    const connected = createApiRepository('/api', { drafts: true });
    global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ status: 'success', data: [] }) }; };
    await connected.load();
    assert(calls.every(call => call.options.cache === 'no-store'));
    global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ status: 'success', data: raw }) }; };
    const created = await connected.saveContractDraft(null, edits);
    assert.equal(calls.at(-1).options.method, 'POST'); assert.equal(calls.at(-1).url, '/api/auth/order/car-rental');
    assert.equal(created.row.status, 'draft');
    await connected.saveContractDraft(9000, { ...edits, revision: '100' });
    assert.equal(calls.at(-1).options.method, 'PUT'); assert.equal(calls.at(-1).url, '/api/auth/order/car-rental/9000');
    global.fetch = async () => ({ ok: false, status: 409, json: async () => ({ status: 'error', message: 'Bản nháp đã được người khác cập nhật.' }) });
    await assert.rejects(connected.saveContractDraft(9000, edits), /người khác/);
  } finally { global.fetch = originalFetch; }
  checks.push('API reads bypass cache; draft writes use only the existing rental URL and propagate conflicts');
  if (process.argv.includes('--database')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), true);
    const { Pool } = require('pg'); const url = new URL(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL); url.searchParams.delete('sslmode');
    const pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 8000 });
    const client = await pool.connect();
    let tempId;
    try {
      await client.query('BEGIN');
      const financeBefore = await client.query("SELECT (SELECT count(*) FROM himoto.transactions) AS transactions, (SELECT count(*) FROM himoto.order_vehicle_details) AS items");
      const legacySource = await client.query(`${CONTRACT_LIST_SQL} AND o.order_status='draft' ORDER BY o.id LIMIT 1`);
      if (legacySource.rowCount) {
        const source = JSON.parse(JSON.stringify(legacySource.rows[0]));
        const customerRows = await client.query('SELECT * FROM himoto.customers WHERE id=$1', [source.customer_id]);
        const vehicleRows = await client.query('SELECT id,name,license,brand,type,year,current_store_id FROM himoto.vehicles WHERE current_store_id=$1', [source.store_id]);
        const staffRows = await client.query('SELECT id,full_name,store_id,status FROM himoto.staff_profiles WHERE store_id=$1', [source.store_id]);
        const legacyDataset = { stores: [{ id: Number(source.store_id) }], staff: staffRows.rows.map(row => mapApiRow('staff', row)),
          customers: JSON.parse(JSON.stringify(customerRows.rows)).map(row => mapApiRow('customers', row)), vehicles: vehicleRows.rows.map(row => mapApiRow('vehicles', row)), contracts: [] };
        const sourceDraft = createContractDraft(legacyDataset, 'all', mapApiRow('contracts', source));
        const legacyUpdated = await saveDatabaseDraft(client, Number(source.id), { draft: sourceDraft, status: 'draft', rental_type: source.rental_type,
          notes: source.notes || '', revision: source.draft_revision });
        assert.equal(legacyUpdated.status, 'draft');
        const originalItems = source.draft_payload?.order_items || [];
        const preservedKeys = ['price_id', 'total_money', 'substitute_unit_price', 'order_item_fees', 'hiringFee', 'rent_at', 'return_at'];
        for (const item of originalItems) {
          const updatedItem = legacyUpdated.draft_payload.order_items.find(row => String(row.vehicle_id) === String(item.vehicle_id));
          assert(updatedItem);
          for (const key of preservedKeys) if (key in item) assert.deepEqual(updatedItem[key], item[key]);
        }
      }
      const testDraft = createContractDraft(before, 'all');
      testDraft.customer_source = 'QA transaction, rolled back';
      const inserted = await saveDatabaseDraft(client, null, { ...edits, draft: testDraft });
      tempId = Number(inserted.id); assert.equal(inserted.status, 'draft');
      assert.equal(inserted.draft_reference, `NHAP-${tempId}`);
      const savedSnapshot = createContractDraft(before, 'all', mapApiRow('contracts', inserted));
      const oldRevision = inserted.draft_revision;
      const changed = await saveDatabaseDraft(client, tempId, { ...edits, draft: { ...savedSnapshot, customer_source: 'QA update' }, revision: oldRevision });
      assert.equal(changed.draft_payload.management_composer.draft.customer_source, 'QA update');
      await assert.rejects(saveDatabaseDraft(client, tempId, { ...edits, draft: savedSnapshot, revision: '0' }), /người khác/);
      const issued = await client.query("SELECT id FROM himoto.orders WHERE order_status = 'renting' AND deleted_at IS NULL LIMIT 1");
      if (issued.rowCount) await assert.rejects(saveDatabaseDraft(client, Number(issued.rows[0].id), { ...edits, revision: '0' }), /Chỉ được cập nhật/);
      const financeAfter = await client.query("SELECT (SELECT count(*) FROM himoto.transactions) AS transactions, (SELECT count(*) FROM himoto.order_vehicle_details) AS items");
      assert.deepEqual(financeAfter.rows, financeBefore.rows);
      await client.query('ROLLBACK');
      const remains = await client.query(`${CONTRACT_LIST_SQL} AND o.id = $1`, [tempId]);
      assert.equal(remains.rowCount, 0);
      checks.push('real Supabase transaction updates a legacy draft without losing item pricing, creates/updates drafts, rejects stale revisions and issued contracts, leaves financial/items tables unchanged, and rolls back all QA changes');
    } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
  }
  process.stdout.write(JSON.stringify({ passed: checks.length, checks }, null, 2) + '\n');
}
run().catch(error => { console.error('Draft checks failed:', error.message); process.exitCode = 1; });

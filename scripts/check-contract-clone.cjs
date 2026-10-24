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
  const localRequire = specifier => specifier.startsWith('@/') ? load(path.join(root, specifier.slice(2))) : specifier.startsWith('.') ? load(path.resolve(path.dirname(file), specifier)) : require(specifier);
  new Function('require', 'module', 'exports', javascript)(localRequire, module, module.exports);
  return module.exports;
}
async function run() {
  const { createDemoRepository, createApiRepository, mapApiRow } = load(path.join(root, 'lib/management/repository'));
  const { cloneContractRecord } = load(path.join(root, 'lib/management/contract-record'));
  const { createContractDraft, customerDetails, vehicleDetails } = load(path.join(root, 'lib/management/contract-document'));
  const { createDemoAutofillRepository, createApiAutofillRepository } = load(path.join(root, 'lib/management/contract-autofill'));
  const { filterRows, EMPTY_QUERY } = load(path.join(root, 'lib/management/table-utils'));
  const { CUSTOMER_STATUSES, statusTone } = load(path.join(root, 'lib/management/config'));
  const checks = [];
  const repository = createDemoRepository(); const before = await repository.load();
  const source = before.contracts.find(row => row.status === 'cancelled'); assert(source);
  const result = await repository.cloneContract(source.id);
  assert.equal(result.dataset.contracts.length, before.contracts.length + 1);
  assert.equal(result.row.id, Math.max(...before.contracts.map(row => row.id)) + 1);
  assert.notEqual(result.row.code, source.code); assert.equal(result.row.status, 'cancelled');
  for (const [key, value] of Object.entries(source)) if (!['id', 'code', 'name'].includes(key)) assert.deepEqual(result.row[key], value, key);
  assert.deepEqual(result.dataset.contracts.find(row => row.id === source.id), source);
  result.row.notes = 'Mutation outside repository';
  assert.equal((await repository.load()).contracts.find(row => row.id === result.row.id).notes, source.notes);
  checks.push('cancelled contract creates a distinct stored ID/code, preserves every other source field and isolates returned records');

  const simultaneous = await Promise.all([repository.cloneContract(source.id), repository.cloneContract(source.id)]);
  assert.equal(new Set(simultaneous.map(item => item.row.id)).size, 2);
  assert.equal(new Set(simultaneous.map(item => item.row.code)).size, 2);
  const count = (await repository.load()).contracts.length;
  await assert.rejects(repository.cloneContract(-1), /Không tìm thấy/);
  assert.equal((await repository.load()).contracts.length, count);
  const unknown = structuredClone(before); unknown.contracts[0].legacy_parameter = 'Keep this unknown parameter';
  assert.equal(cloneContractRecord(unknown, unknown.contracts[0].id).legacy_parameter, 'Keep this unknown parameter');
  checks.push('rapid copies allocate unique identities; missing records leave data untouched and unknown parameters survive');

  const current = await repository.load(); const copy = current.contracts.find(row => row.id === result.row.id);
  const draft = createContractDraft(current, 'all', copy);
  assert.equal(draft.contract_number, copy.code);
  draft.staff_id = String(current.staff.find(row => row.store_id === copy.store_id && row.status === 'active').id);
  draft.customer.name = 'Tên riêng trên hợp đồng'; draft.customer.relatives_text = 'Người thân của bản sao';
  draft.start_date = '2026-10-10T09:15'; draft.end_date = '2026-10-12T10:45';
  draft.vehicles.push(vehicleDetails(current.vehicles.find(row => row.store_id === copy.store_id && String(row.id) !== draft.vehicles[0].id), draft.customer));
  draft.vehicles[1].color = 'Màu riêng'; draft.vehicles[1].driver_license_number = 'GPLX-MAU';
  draft.collateral_description = 'Giấy tờ mẫu'; draft.customer_source = 'Nguồn riêng'; draft.total_amount = '888000';
  const edits = { draft, status: 'pending', rental_type: 'monthly', notes: 'Bản tạo lại từ hợp đồng hủy' };
  const saved = await repository.saveContract(copy.id, edits);
  assert.deepEqual(createContractDraft(saved.dataset, 'all', saved.row), draft);
  assert.equal(saved.row.total_amount, 888000); assert.equal(saved.row.status, 'pending'); assert.equal(saved.row.notes, edits.notes);
  assert.equal(saved.row.license, draft.vehicles.map(vehicle => vehicle.license).join(', '));
  assert.deepEqual(saved.dataset.contracts.find(row => row.id === source.id), source);
  assert.deepEqual(saved.dataset.vehicles, before.vehicles);
  checks.push('edit stores the full customer/multiple-vehicle/print snapshot plus metadata, without changing the source or rental resources');

  const master = saved.dataset.customers.find(row => row.id === draft.customer_id);
  const renamed = await repository.save('customers', { ...master, name: 'Hồ sơ được đổi tên' });
  const snapshot = renamed.contracts.find(row => row.id === saved.row.id);
  assert.equal(snapshot.customer_name, draft.customer.name);
  assert.deepEqual(createContractDraft(renamed, 'all', snapshot), draft);
  const secondCopy = await repository.cloneContract(snapshot.id);
  const expected = { ...draft, contract_number: secondCopy.row.code };
  assert.deepEqual(createContractDraft(secondCopy.dataset, 'all', secondCopy.row), expected);
  assert.equal(secondCopy.row.notes, edits.notes); assert.equal(secondCopy.row.status, 'pending');
  checks.push('reopen and clone preserve saved snapshots even after the master customer profile changes');

  const invalid = { ...edits, draft: { ...draft, staff_id: '99999' } };
  const unchanged = await repository.load();
  await assert.rejects(repository.saveContract(copy.id, invalid), /người làm hợp đồng/);
  await assert.rejects(repository.saveContract(copy.id, { ...edits, draft: { ...draft, contract_number: source.code } }), /Mã hợp đồng/);
  assert.deepEqual(await repository.load(), unchanged);
  checks.push('invalid updates and duplicate identity changes fail without partially writing data');

  const demo = createDemoAutofillRepository(repository);
  const customer = await demo.createCustomer({ ...customerDetails(), name: 'Khách nợ xấu mẫu', id_card: '009876543210', phone: '0900001234', address: 'Địa chỉ mẫu' }, { status: 'blacklist', store_id: 3 });
  assert.equal(customer.status, 'blacklist'); assert.equal(customer.store_id, 3);
  const data = await repository.load();
  assert.equal(data.customers.find(row => row.id === customer.id).store_name, data.stores.find(row => row.id === 3).name);
  assert(filterRows(data.customers, EMPTY_QUERY, '3').some(row => row.id === customer.id));
  assert(!filterRows(data.customers, EMPTY_QUERY, '1').some(row => row.id === customer.id));
  assert.equal(data.contracts.some(row => row.customer_id === customer.id), false);
  assert(CUSTOMER_STATUSES.some(option => option.value === 'blacklist')); assert.equal(statusTone('blacklist'), 'red');
  assert.equal(mapApiRow('customers', { id: 9, status: 'blacklist', warning_note: 'Nợ xấu', store_id: 2 }).status, 'blacklist');
  assert.equal(mapApiRow('customers', { id: 9, status: 'bad_debt', store_id: 2 }).store_id, 2);
  checks.push('Blacklist stays distinct from warnings; customer branch filtering uses the assigned branch even without contracts');

  let requests = 0; const originalFetch = global.fetch;
  global.fetch = async () => { requests++; throw new Error('Unexpected API mutation'); };
  try {
    const api = createApiRepository('/api');
    await assert.rejects(api.cloneContract(1), /Chưa có API/);
    await assert.rejects(api.saveContract(1, edits), /Chưa tích hợp/);
    await assert.rejects(createApiAutofillRepository('/api').createCustomer(draft.customer, { status: 'blacklist', store_id: 1 }), /CCCD/);
    assert.equal(requests, 0);
  } finally { global.fetch = originalFetch; }
  checks.push('unconnected contract APIs and invalid real customer identities fail before any request');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

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
  const { createDemoRepository, mapApiRow } = load(path.join(root, 'lib/management/repository'));
  const { createDemoAutofillRepository, createApiAutofillRepository } = load(path.join(root, 'lib/management/contract-autofill'));
  const { createContractDraft, customerDetails, vehicleDetails, buildContractDocument, validateContractDraft, validIdCard, staffMatchesStore, dateTimeInput } = load(path.join(root, 'lib/management/contract-document'));
  const checks = [];
  const repository = createDemoRepository(); const data = await repository.load();
  const demo = createDemoAutofillRepository(repository);
  assert.equal(validIdCard('001234567890', 'api'), true);
  assert.equal(validIdCard('001234567', 'api'), true);
  assert.equal(validIdCard('DEMO-000001', 'api'), false);
  assert.equal(validIdCard('DEMO-000001', 'demo'), true);
  assert.equal(validIdCard('0012345678', 'demo'), false);
  checks.push('CCCD/CMND validation preserves leading zeroes and excludes fixture IDs from real APIs');
  const customer = await demo.lookupCustomer(' demo-000001 ');
  assert.equal(customer.id, 1); assert.equal(customer.id_card_issued_on, '2024-01-15');
  assert.equal(await demo.lookupCustomer('001234567890'), null);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(demo.lookupCustomer('DEMO-000001', controller.signal), { name: 'AbortError' });
  checks.push('exact identity lookup, full profile autofill, explicit missing and cancellation');
  const details = { ...customerDetails(), name: 'Khách mới mẫu', phone: '0900001234', address: 'Địa chỉ mẫu', email: 'moi@example.test', id_card: '001234567890', id_card_issued_by: 'Nơi cấp mẫu' };
  const created = await demo.createCustomer(details);
  assert.equal(created.id, 33); assert.equal((await demo.lookupCustomer(details.id_card)).id_card, '001234567890');
  await assert.rejects(demo.createCustomer(details), /đã có/);
  assert.equal((await repository.load()).contracts.length, data.contracts.length);
  checks.push('new customer persists in the shared demo, blocks duplicate identity, and creates no rental order');
  assert.equal((await demo.loadStaff('2')).length, data.staff.filter(row => row.store_id === 2).length);
  assert(staffMatchesStore(data.staff, '2').every(row => row.store_id === 2));
  assert.equal(staffMatchesStore(data.staff, '').length, 0);
  checks.push('staff IDs and branch relationships prevent cross-branch selection');
  const draft = createContractDraft(data, '1');
  draft.customer_id = customer.id; draft.customer = customerDetails(customer); draft.staff_id = '1';
  draft.vehicles = [vehicleDetails(data.vehicles[0], draft.customer), vehicleDetails(data.vehicles[4], draft.customer)];
  draft.start_date = '2026-10-06T09:15'; draft.end_date = '2026-10-07T10:45'; draft.signed_on = '2026-10-06';
  draft.unit_price = '150000'; draft.total_amount = '300000'; draft.paid_amount = ''; draft.deposit_amount = '1000000';
  assert.deepEqual(validateContractDraft(draft, data, data.staff, 'demo'), {});
  const invalid = { ...draft, staff_id: '2', end_date: draft.start_date, unit_price: '-1', vehicles: [draft.vehicles[0], draft.vehicles[0]], customer_source_url: 'javascript:alert(1)' };
  const errors = validateContractDraft(invalid, data, data.staff, 'demo');
  for (const key of ['staff_id', 'end_date', 'unit_price', 'vehicle_1', 'customer_source_url']) assert(errors[key]);
  checks.push('print validation rejects wrong branch, duplicate vehicle, reversed dates, negative money and unsafe source links');
  const doc = buildContractDocument(draft, data.stores[0], data.staff[0]);
  assert.equal(doc.contract_number, 'Chưa cấp số'); assert.equal(doc.is_preview, true);
  assert.equal(doc.customer.id_card_issued_on, '15/01/2024'); assert.equal(doc.customer.id_card, 'DEMO-000001');
  assert.equal(doc.vehicles_count, 2); assert.equal(doc.signers.signer_a_name, data.staff[0].name);
  assert.equal(doc.rent_time.start.hour, '09'); assert.equal(doc.rent_time.end.minute, '45');
  assert.equal(doc.pricing.paid_amount_formatted, '........................');
  assert.equal(doc.return_confirmation.refund_amount_formatted, '');
  checks.push('legacy print DTO retains signatures, full identity, local dates, multiple vehicles, draft watermark and missing values');
  const full = mapApiRow('customers', { id: 1, name: 'Khách', id_card: '001234567890', id_card_issued_on: '2024-01-15', id_card_issued_by: 'Nơi cấp', birthday: '1990-02-03', relatives_text: 'Người thân', warning: 'Lưu ý' });
  assert.equal(full.id_card_issued_by, 'Nơi cấp'); assert.equal(full.relatives_text, 'Người thân'); assert.equal(full.birthday, '1990-02-03');
  assert.equal(mapApiRow('customers', { id: 1, relatives: [{ name: 'Người thân', relationship: 'Anh', phone: '0900001234' }] }).relatives_text, 'Người thân (Anh): 0900001234');
  assert.equal(mapApiRow('customers', { id: 1, relatives: '[{"name":"Người thân","phone":"0900001234"}]' }).relatives_text, 'Người thân: 0900001234');
  checks.push('API mapper retains supplemental identity fields');
  const detachedCustomer = createContractDraft({ ...data, customers: [] }, 'all', mapApiRow('contracts', {
    id: 97, status: 'renting', customer_id: 999, customer_name: 'Khách từ dữ liệu hợp đồng',
    customer_phone: '0900000097', customer_id_card: '001234567897',
    customer_address: 'Địa chỉ từ dữ liệu hợp đồng', customer_email: 'contract@example.test',
  })).customer;
  assert.equal(detachedCustomer.name, 'Khách từ dữ liệu hợp đồng');
  assert.equal(detachedCustomer.id_card, '001234567897');
  assert.equal(detachedCustomer.address, 'Địa chỉ từ dữ liệu hợp đồng');
  assert.equal(detachedCustomer.email, 'contract@example.test');
  checks.push('contract details retain identity, address and email when the customer master record is unavailable');
  assert.equal(dateTimeInput('2026-10-06T02:15:00.000Z'), '2026-10-06T09:15');
  assert.equal(dateTimeInput('2026-10-06T09:15'), '2026-10-06T09:15');
  assert.equal(dateTimeInput('2026-10-06'), '');
  checks.push('UTC timestamps convert to Vietnam time and missing times remain missing');
  const requests = []; let missing = false;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requests.push({ url, method: options.method, body: options.body });
    if (url.includes('/hr/staff')) return { ok: true, json: async () => ({ status: 'success', data: [{ id: 2, full_name: 'Nhân sự cơ sở 2', store_id: 2, status: 1 }, { id: 1, full_name: 'Sai cơ sở', store_id: 1, status: 1 }] }) };
    if (options.method === 'POST') return { ok: true, json: async () => ({ status: 'success', data: { id: 99, ...JSON.parse(options.body) } }) };
    return { ok: true, json: async () => ({ status: 'success', data: missing ? null : { id: 10, name: 'Khách', id_card: '001234567890' } }) };
  };
  try {
    const api = createApiAutofillRepository('/api');
    assert.equal((await api.loadStaff('2'))[0].id, 2); assert.equal((await api.loadStaff('2')).length, 1);
    assert.equal((await api.lookupCustomer('001234567890')).id, 10);
    await assert.rejects(api.createCustomer(details), /đã có/);
    assert.equal(requests.filter(request => request.method === 'POST').length, 0);
    missing = true;
    const saved = await api.createCustomer(details); assert.equal(saved.id, 99);
    const writes = requests.filter(request => request.method === 'POST');
    assert.equal(writes.length, 1); assert.equal(writes[0].url, '/api/auth/customers');
    assert.deepEqual(Object.keys(JSON.parse(writes[0].body)).sort(), ['address', 'email', 'id_card', 'name', 'phone', 'warning_note']);
    const assigned = await api.createCustomer({ ...details, warning_note: 'Cần đối chiếu hồ sơ' }, { status: 'warning', store_id: 2 });
    assert.equal(assigned.store_id, 2); assert.equal(assigned.status, 'warning');
    assert.equal(JSON.parse(requests.filter(request => request.method === 'POST').at(-1).body).warning_note, 'Cần đối chiếu hồ sơ');
    assert(!requests.some(request => request.url.includes('/order/')));
    checks.push('existing API routes enforce exact lookup, branch scope, duplicate preflight and customer-only writes');
    for (const response of [
      { ok: false, status: 401 },
      { ok: true, json: async () => ({ status: 'error', data: null }) },
      { ok: true, json: async () => ({ status: 'success', data: {} }) },
      { ok: true, json: async () => ({ status: 'success', data: { id: 1, id_card: '999999999999' } }) },
    ]) { global.fetch = async () => response; await assert.rejects(api.lookupCustomer('001234567890')); }
    global.fetch = async () => { throw new Error('offline'); }; await assert.rejects(api.createCustomer(details), /offline/);
    checks.push('auth, malformed, mismatched and offline errors never become missing customers or false saves');
  } finally { global.fetch = originalFetch; }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

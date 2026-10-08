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
  const { createDemoCashbookRepository, createApiCashbookRepository, mapCashbookRow, cashbookDateTime } = load(path.join(root, 'lib/management/cashbook-repository'));
  const { CASHBOOK_COLUMNS, EMPTY_CASHBOOK_FILTERS, filterCashbookRows, sortCashbookRows, cashbookCsv, cashbookCell } = load(path.join(root, 'lib/management/cashbook'));
  const checks = [];
  const demo = createDemoCashbookRepository(); const data = await demo.load();
  assert.equal(data.length, 48); assert.equal(new Set(data.map(row => row.id)).size, 48);
  for (const type of ['income', 'expense']) assert.equal(data.filter(row => row.type === type).length, 24);
  assert.deepEqual(CASHBOOK_COLUMNS.map(column => column.label), ['ID', 'Ngày', 'Giờ', 'Loại phiếu', 'Người thực hiện', 'Số tiền', 'Mã hợp đồng', 'Hình thức thanh toán', 'Tài khoản nhận / chi', 'Cơ sở', 'Lý do', 'Nội dung']);
  const mutated = await demo.load(); mutated[0].content = 'Changed externally';
  assert.notEqual((await demo.load())[0].content, mutated[0].content);
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(demo.load(aborted.signal), { name: 'AbortError' });
  checks.push('two fixture groups have distinct IDs and shared twelve-field schema; reads are isolated and cancellable');

  const selected = filterCashbookRows(data, { ...EMPTY_CASHBOOK_FILTERS, search: 'phi dich vu', actor: 'id:1', startDate: '2026-10-01', endDate: '2026-10-01' }, '1');
  assert.equal(selected.length, 1); assert.equal(selected[0].actor_id, '1'); assert.equal(selected[0].type, 'income');
  assert(filterCashbookRows(data, EMPTY_CASHBOOK_FILTERS, '2').every(row => row.store_id === '2'));
  assert.equal(filterCashbookRows(data, { ...EMPTY_CASHBOOK_FILTERS, startDate: '2026-10-06', endDate: '2026-10-01' }, 'all').length, 0);
  assert.equal(filterCashbookRows(data, { ...EMPTY_CASHBOOK_FILTERS, search: 'Không có nội dung này' }, 'all').length, 0);
  checks.push('accent-insensitive search combines with exact actor, branch and inclusive dates; reversed/missing filters produce no fabricated matches');

  const sorted = sortCashbookRows([{ ...data[0], id: '10', date: '2026-10-01', time: '09:00' }, { ...data[0], id: '2', date: '2026-10-01', time: '08:00' }, { ...data[0], id: '3', date: undefined }], 'id', 'asc');
  assert.deepEqual(sorted.map(row => row.id), ['2', '3', '10']);
  assert.equal(sortCashbookRows(sorted, 'date', 'desc')[2].date, undefined);
  assert.equal(sortCashbookRows(sorted, 'date', 'asc')[0].time, '08:00');
  assert.equal(data[0].id, 'PT-2610-001');
  const csv = cashbookCsv([{ ...data[0], reason: '=SUM(1,2)', content: 'Một nội dung, có "dấu ngoặc"' }]);
  assert(csv.includes('"\'=SUM(1,2)"')); assert(csv.includes('có ""dấu ngoặc""'));
  assert.equal(cashbookCell({ ...data[0], time: undefined }, 'time'), '—');
  assert.deepEqual(sortCashbookRows([{ ...data[0], amount: 100 }, { ...data[0], amount: 20 }, { ...data[0], amount: 0 }], 'amount', 'asc').map(row => row.amount), [0,20,100]);
  assert.equal(cashbookCell({ ...data[0], amount: 0 }, 'amount'), '0 ₫');
  assert.equal(filterCashbookRows([{ ...data[0], contract_code: 'HD-123' }], { ...EMPTY_CASHBOOK_FILTERS, search: 'hd-123' }, 'all').length, 1);
  checks.push('numeric ID/money and timestamp sorting; zero amount valid; exports preserve twelve columns and escape spreadsheet formulas');

  assert.deepEqual(cashbookDateTime('2026-10-05T18:15:45Z'), { date: '2026-10-06', time: '01:15:45' });
  assert.deepEqual(cashbookDateTime('2026-10-06 08:30:05'), { date: '2026-10-06', time: '08:30:05' });
  assert.deepEqual(cashbookDateTime('2026-10-06'), { date: '2026-10-06' }); assert.deepEqual(cashbookDateTime(null), {});
  for (const input of ['2026-02-31', '2026-10-06T24:00:00', 'invalid']) assert.throws(() => cashbookDateTime(input), /không hợp lệ/);
  const row = mapCashbookRow({ id: '0009', type: 'in', created_at: '2026-10-06T08:30:00+07:00', user_name: 'Người tạo', created_by: 2, store_id: 3, note: 'Nội dung được lưu' });
  assert.equal(row.id, '0009'); assert.equal(row.actor_name, 'Người tạo'); assert.equal(row.reason, undefined); assert.equal(row.content, 'Nội dung được lưu');
  const receipt = mapCashbookRow({ id: 1, type: 'in', amount: '300', order_id: 7, contract_code: 'HD-7', payment_method: 'Tiền mặt', account: 'Két #1', store_name: 'QA' });
  assert.equal(receipt.amount, 300); assert.equal(receipt.order_id, '7'); assert.equal(receipt.contract_code, 'HD-7'); assert.equal(receipt.account, 'Két #1');
  assert.equal(mapCashbookRow({ id: 1, type: 'addon', user: { id: 8, name: 'Người tạo PHP' } }).type, 'income');
  assert.equal(mapCashbookRow({ id: 1, type: 'out', payer_receiver: 'Người nhận' }).actor_name, undefined);
  assert.throws(() => mapCashbookRow({ id: 1, type: 'transfer' }), /chưa được xác nhận/);
  assert.throws(() => mapCashbookRow({ type: 'in' }), /thiếu ID/);
  checks.push('API mapping preserves IDs, creator identity and missing reason/time; Vietnam timezone crosses days correctly and unknown directions fail explicitly');

  const originalFetch = global.fetch; const requests = [];
  try {
    global.fetch = async (url, options) => {
      requests.push({ url, options }); const page = Number(new URL(url).searchParams.get('page'));
      return { ok: true, json: async () => ({ status: 'success', data: { total: 2, last_page: 2, current_page: page, data: [{ id: page, type: page === 1 ? 'in' : 'out', created_at: '2026-10-06 08:30:00', note: 'Nội dung mẫu' }] } }) };
    };
    const api = createApiCashbookRepository('https://api.example.test/api'); const records = await api.load();
    assert.equal(records.length, 2); assert.equal(requests.length, 2);
    assert(requests.every(request => new URL(request.url).pathname === '/api/auth/transactions' && request.options.method === 'GET' && !request.options.body));
    requests.length = 0; await assert.rejects(api.load(aborted.signal), { name: 'AbortError' }); assert.equal(requests.length, 0);
    checks.push('verified Nest GET endpoint reads every page, performs no financial writes and respects aborted loads');

    global.fetch = async () => ({ ok: false, status: 403 }); await assert.rejects(api.load(), /HTTP 403/);
    global.fetch = async () => { throw new Error('Offline'); }; await assert.rejects(api.load(), /Offline/);
    for (const payload of [
      { status: 'failed', data: [] }, { status: 'success', data: { data: [] } },
      { status: 'success', data: { total: null, last_page: 1, data: [] } },
      { status: 'success', data: { total: 2, last_page: 1, data: [{ id: 1, type: 'in' }] } },
      { status: 'success', data: [{ id: 1, type: 'in' }, { id: 1, type: 'out' }] },
      { status: 'success', data: [{ id: 1, type: 'unknown' }] },
    ]) { global.fetch = async () => ({ ok: true, json: async () => payload }); await assert.rejects(api.load()); }
    checks.push('auth/offline/malformed/incomplete/duplicate/type errors fail without silently substituting fixtures or dropping vouchers');
  } finally { global.fetch = originalFetch; }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });

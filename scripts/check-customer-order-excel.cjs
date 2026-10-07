const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), Excel = require('exceljs');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name), module, module.exports);
  return module.exports;
}
const source = load(path.join(root, 'lib/management/customer-order-excel'));
const customerExcel = load(path.join(root, 'lib/management/customer-excel'));
function workbook(data) {
  const book = new Excel.Workbook(), sheet = book.addWorksheet('Worksheet');
  sheet.addRow(source.ORDER_CUSTOMER_HEADERS); data.forEach(row => sheet.addRow(row)); return book;
}
const order = (id, name = 'Khách QA', phone = '0900000001') => [id, '2026-10-07', name, phone, 'Xe QA', 'QA-10001', '2026-10-07', '2026-10-10', 'Ghi chú đơn QA', 100000, 500000, 'bad_debt'];
async function main() {
  const checks = [];
  const rows = source.parseOrderCustomerWorkbook(workbook([order(990)]), 'KH QA.xlsx');
  assert.equal(rows[0].name, 'Khách QA'); assert.equal(rows[0].phone, '0900000001'); assert.equal(rows[0].orderId, '990');
  assert(!Object.hasOwn(rows[0], 'id_card')); assert(!Object.hasOwn(rows[0], 'customerId')); assert(!Object.hasOwn(rows[0], 'status')); assert(!Object.hasOwn(rows[0], 'warning_note')); assert(!rows[0].errors.length);
  checks.push('order export extracts only customer identity; never treats order ID, rental status, deposits or order note as customer fields');
  const bad = workbook([order(990)]); bad.worksheets[0].getCell('C1').value = 'Tên xe';
  assert.throws(() => source.parseOrderCustomerWorkbook(bad, 'bad.xlsx'), /12 cột/);
  const shifted = workbook([order(990)]); shifted.worksheets[0].getCell('M2').value = 123;
  assert.throws(() => source.parseOrderCustomerWorkbook(shifted, 'shifted.xlsx'), /12 cột/);
  for (const formulaColumn of ['C2', 'D2']) {
    const formulas = workbook([order(990)]); formulas.worksheets[0].getCell(formulaColumn).value = { formula: '1+1', result: 2 };
    assert.throws(() => source.parseOrderCustomerWorkbook(formulas, 'formula.xlsx'), /không nhận công thức/);
  }
  checks.push('misaligned headers, extra data columns and formulas are refused before positional extraction');
  const numeric = workbook([order(991, 'Khách số QA', 900000001)]);
  const uncertain = source.parseOrderCustomerWorkbook(numeric, 'numeric.xlsx');
  assert.equal(uncertain[0].phone, ''); assert.equal(uncertain[0].originalPhone, '900000001'); assert(uncertain[0].errors.length);
  numeric.worksheets[0].getCell('D2').numFmt = '0000000000';
  const explicit = source.parseOrderCustomerWorkbook(numeric, 'explicit.xlsx');
  assert.equal(explicit[0].phone, '0900000001'); assert.equal(explicit[0].errors.length, 0);
  const long = source.parseOrderCustomerWorkbook(workbook([order(992, 'Khách sai QA', '09000000010000')]), 'long.xlsx');
  assert(long[0].errors.length); assert.equal(long[0].phone, '09000000010000');
  checks.push('unformatted numeric phones remain blank for import with original digits retained for review; explicit zero format is honored and malformed text is reported');
  const merged = source.groupOrderCustomers([...rows, ...source.parseOrderCustomerWorkbook(workbook([order(991, 'Khách QA', '+84900000001')]), 'KH QA 2.xlsx')]);
  assert.equal(merged.length, 1); assert.equal(merged[0].sources.length, 2); assert.deepEqual(merged[0].sources.map(r => r.orderId), ['990', '991']);
  assert.equal(merged[0].phone, '0900000001');
  const conflict = source.groupOrderCustomers([...rows, ...source.parseOrderCustomerWorkbook(workbook([order(992, 'Tên khác QA', '0900000001')]), 'conflict.xlsx')]);
  assert.equal(conflict.length, 2); assert(conflict.every(row => row.errors.length));
  const missing = source.groupOrderCustomers(source.parseOrderCustomerWorkbook(workbook([order(993, 'Khách QA', ''), order(994, 'Khách QA', '')]), 'missing.xlsx'));
  assert.equal(missing.length, 2);
  checks.push('repeated rentals merge by phone and name with every source retained; conflicting names and absent phones never merge by name alone');
  const book = new Excel.Workbook(); await book.xlsx.load(await customerExcel.createCustomerTemplate([{ id: 23, name: 'QA', code: 'QA-23' }]));
  const main = book.getWorksheet('Khách hàng');
  ['Khách QA', '', '', '', '', '', 'Chưa hoàn tất', ''].forEach((value, i) => { main.getCell(2, i + 1).value = value; });
  book.addWorksheet('Đối chiếu').addRow(['900000001']);
  const prepared = customerExcel.parseCustomerWorkbook(book);
  assert.equal(prepared.length, 1); assert.equal(prepared[0].values.phone, ''); assert.equal(main.getCell('B2').numFmt, '@');
  checks.push('review workbook keeps eight canonical customer columns; unresolved phones cannot silently become importable text and separate audit sheet is ignored');
  console.log(JSON.stringify({ passed: checks.length, checks, businessWrites: 0 }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

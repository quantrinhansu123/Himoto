// Read-only preparation: never inserts, updates or deletes a customer/order.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), Excel = require('exceljs');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', javascript)(localRequire, module, module.exports); return module.exports;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--branch-map')) throw new Error('Usage: node scripts/prepare-customer-workbooks.cjs [--branch-map path.json]');
  const project = path.resolve(__dirname, '..');
  require('@next/env').loadEnvConfig(project, false, { info() {}, error() {} });
  const folder = path.join(project, 'excel-import');
  const mapping = args.length ? JSON.parse(fs.readFileSync(path.resolve(project, args[1]), 'utf8')) : {};
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || Object.values(mapping).some(id => id !== null && (!Number.isSafeInteger(id) || id <= 0))) throw new Error('Branch map must contain source filenames and positive store IDs or null to exclude a file');
  const shared = load(path.join(root, 'lib/management/customer-import'));
  const excel = load(path.join(root, 'lib/management/customer-excel'));
  const legacy = load(path.join(root, 'lib/management/customer-order-excel'));
  const sources = [], sourceHashes = {};
  // A space after KH is essential: /^KH/i would also include Kho xe tổng.
  const files = fs.readdirSync(folder).filter(name => /^KH\s.*\.xlsx$/i.test(name)).sort();
  if (!files.length) throw new Error('No KH customer source workbooks');
  if (Object.keys(mapping).some(name => !files.includes(name))) throw new Error('Branch map includes an unknown source filename');
  for (const filename of files) {
    const bytes = fs.readFileSync(path.join(folder, filename));
    sourceHashes[filename] = createHash('sha256').update(bytes).digest('hex');
    const workbook = new Excel.Workbook(); await workbook.xlsx.load(bytes);
    sources.push(...legacy.parseOrderCustomerWorkbook(workbook, filename));
  }
  const acceptedSources = sources.filter(source => mapping[source.filename] !== null);
  const groups = legacy.groupOrderCustomers(acceptedSources);
  const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL statement_timeout='30s'");
    const customers = (await c.query('SELECT * FROM himoto.customers ORDER BY id')).rows;
    const stores = (await c.query('SELECT id,store_name AS name,code FROM himoto.stores ORDER BY id')).rows.map(row => ({ ...row, id: Number(row.id) }));
    if (Object.values(mapping).some(id => id !== null && !stores.some(store => store.id === id))) throw new Error('Mapped branch no longer exists');
    let known = 0, ambiguous = 0, invalidPhones = 0, unresolvedStores = 0;
    const rows = groups.map((group, i) => {
      const candidates = group.phone ? customers.filter(row => shared.importPhone(row.phone || '') === shared.importPhone(group.phone)) : [];
      const existing = candidates.length === 1 && shared.importText(candidates[0].name) === shared.importText(group.name) ? candidates[0] : undefined;
      const errors = [...group.errors];
      if (candidates.length && !existing) { ambiguous++; errors.push('SĐT có ở CSDL nhưng tên khác hoặc trùng nhiều hồ sơ. Không tự ghi đè.'); }
      if (existing) known++;
      if (group.errors.length) invalidPhones++;
      const ids = [...new Set(group.sources.map(source => mapping[source.filename]))];
      const store = ids.length === 1 && ids[0] ? stores.find(store => store.id === ids[0]) : undefined;
      if (!store) { unresolvedStores++; errors.push('Chưa xác định một cơ sở duy nhất từ các file nguồn. Cần đối chiếu trước khi nhập.'); }
      const card = /^(\d{9}|\d{12})$/.test(String(existing?.id_card || '')) ? String(existing.id_card) : '';
      const values = { name: group.name, phone: group.phone, id_card: card, email: existing?.email || '', address: existing?.address || '', store: store?.name || '', status: 'Chưa hoàn tất', warning_note: '' };
      return { rowNumber: i + 2, values, errors, existingId: existing ? String(existing.id) : '', sources: group.sources };
    });
    const result = shared.validateCustomerImport(rows, stores, customers, true);
    const eligible = result.rows.filter(row => row.state === 'valid');
    const book = new Excel.Workbook(); await book.xlsx.load(await excel.createCustomerTemplate(stores));
    const sheet = book.getWorksheet('Khách hàng');
    const review = book.addWorksheet('Đối chiếu');
    review.columns = [
      { header: 'Dòng trong mẫu', key: 'outputRow', width: 18 }, { header: 'Tên khách hàng', key: 'name', width: 32 },
      { header: 'SĐT gốc', key: 'originalPhone', width: 22, style: { numFmt: '@' } },
      { header: 'Khách CSDL', key: 'existingId', width: 18, style: { numFmt: '@' } },
      { header: 'File gốc', key: 'file', width: 28 }, { header: 'Dòng gốc', key: 'sourceRow', width: 12 },
      { header: 'ID đơn nguồn (không phải ID khách)', key: 'orderId', width: 34, style: { numFmt: '@' } },
      { header: 'Kết quả / cần bổ sung', key: 'notes', width: 110 },
    ];
    for (const row of rows) {
      for (let j = 0; j < shared.CUSTOMER_IMPORT_COLUMNS.length; j++) sheet.getCell(row.rowNumber, j + 1).value = String(row.values[shared.CUSTOMER_IMPORT_COLUMNS[j].key]);
      const checked = result.rows.find(item => item.rowNumber === row.rowNumber);
      const notes = [...checked.errors, ...checked.warnings];
      if (row.existingId) notes.push('Khách đã có: giữ nguyên ID và lịch sử, không nhập thêm / cập nhật đè.');
      for (const source of row.sources) review.addRow({ outputRow: row.rowNumber, name: row.values.name, originalPhone: source.originalPhone, existingId: row.existingId, file: source.filename, sourceRow: source.rowNumber, orderId: source.orderId, notes: [...new Set(notes)].join(' ') });
    }
    review.getRow(1).font = { bold: true }; review.autoFilter = 'A1:H1';
    const guide = book.getWorksheet('Hướng dẫn');
    guide.addRow(['BẢN ĐỐI CHIẾU: gồm cả khách đã có và dòng chưa xác minh. File gốc là xuất đơn thuê, không có CCCD/địa chỉ.']);
    guide.addRow(['Không dùng ID đơn nguồn làm ID khách. Không dùng trạng thái thuê xe / tiền cọc / ghi chú đơn làm trạng thái hoặc cảnh báo khách.']);
    guide.addRow(['Điện thoại dạng số chưa xác minh được bỏ trống ở sheet Khách hàng; xem SĐT gốc ở Đối chiếu để sửa từ nguồn đáng tin cậy. Không tự thêm số 0.']);
    guide.addRow(['Khách có nhiều cơ sở nguồn khác nhau được để riêng chờ đối chiếu. Không lấy cơ sở hiện tại của xe để gán khách.']);
    await book.xlsx.writeFile(path.join(folder, 'HIMOTO-khach-hang-doi-chieu.xlsx'));
    const clean = new Excel.Workbook(); await clean.xlsx.load(await excel.createCustomerTemplate(stores));
    const cleanSheet = clean.getWorksheet('Khách hàng');
    eligible.forEach((row, i) => shared.CUSTOMER_IMPORT_COLUMNS.forEach((column, j) => { cleanSheet.getCell(i + 2, j + 1).value = String(row.values[column.key]); }));
    clean.getWorksheet('Hướng dẫn').addRow(['Chỉ gồm khách mới đã đối chiếu điện thoại/cơ sở. Bật Cho phép hồ sơ Chưa hoàn tất thiếu CCCD/địa chỉ trước khi nhập; CCCD/địa chỉ được để trống chờ bổ sung.']);
    await clean.xlsx.writeFile(path.join(folder, 'HIMOTO-khach-hang-da-khop-cot.xlsx'));
    const pending = new Excel.Workbook(); await pending.xlsx.load(await excel.createCustomerTemplate(stores));
    const pendingReview = pending.addWorksheet('Đối chiếu');
    pendingReview.columns = review.columns.map(column => ({ header: column.header, key: column.key, width: column.width, style: column.style }));
    rows.filter((row, i) => result.rows[i].state === 'invalid').forEach((row, i) => {
      shared.CUSTOMER_IMPORT_COLUMNS.forEach((column, j) => { pending.getWorksheet('Khách hàng').getCell(i + 2, j + 1).value = String(row.values[column.key]); });
      const checked = result.rows.find(item => item.rowNumber === row.rowNumber);
      for (const source of row.sources) pendingReview.addRow({ outputRow: i + 2, name: row.values.name, originalPhone: source.originalPhone, existingId: row.existingId,
        file: source.filename, sourceRow: source.rowNumber, orderId: source.orderId, notes: [...checked.errors, ...checked.warnings].join(' ') });
    });
    pending.getWorksheet('Hướng dẫn').addRow(['CHƯA NHẬP: chỉ gồm khách chưa đủ thông tin điện thoại/cơ sở. Sửa từ nguồn đã xác minh trước khi kiểm tra và nhập.']);
    await pending.xlsx.writeFile(path.join(folder, 'HIMOTO-khach-hang-can-doi-chieu.xlsx'));
    const backupFolder = path.join(project, '.backups/customers'); fs.mkdirSync(backupFolder, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(backupFolder, `before-prepare-${timestamp}.json`), JSON.stringify({ createdAt: new Date().toISOString(), table: 'himoto.customers', rowCount: customers.length, rows: customers }, null, 2), { flag: 'wx' });
    const report = { files: files.map(file => ({ file, rows: sources.filter(source => source.filename === file).length, storeId: mapping[file] ?? null })), sourceHashes,
      sourceRows: sources.length, excludedSourceRows: sources.length - acceptedSources.length, uniqueCustomers: groups.length, duplicatesMerged: acceptedSources.length - groups.length,
      existingCustomers: known, newCandidates: groups.length - known - ambiguous, eligibleNewCustomers: eligible.length, ambiguousCustomers: ambiguous, phoneGroupsNeedReview: invalidPhones,
      storeGroupsNeedReview: unresolvedStores, databaseCustomers: customers.length, allowIncomplete: true, committed: false, businessWrites: 0 };
    fs.writeFileSync(path.join(folder, 'customer-preview.json'), JSON.stringify({ ...report, rows: rows.map((row, i) => ({ ...row, validation: result.rows[i] })) }, null, 2));
    await c.query('ROLLBACK');
    console.log(JSON.stringify(report));
  } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
  finally { c.release(); }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });

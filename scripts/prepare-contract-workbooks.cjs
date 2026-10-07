// Read-only reconciliation; never changes contracts, vehicles or money.
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
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main() {
  const project = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--branch-map') throw new Error('Usage: node scripts/prepare-contract-workbooks.cjs --branch-map filename.json');
  require('@next/env').loadEnvConfig(project, false, { info() {}, error() {} });
  const folder = path.join(project, 'excel-import');
  const map = JSON.parse(fs.readFileSync(path.resolve(project, args[1]), 'utf8'));
  if (!map || typeof map !== 'object' || Array.isArray(map) || Object.values(map).some(id => id !== null && (!Number.isSafeInteger(id) || id <= 0))) throw new Error('Invalid branch map');
  const shared = load(path.join(root, 'lib/management/contract-import'));
  const plates = load(path.join(root, 'lib/management/vehicle-import'));
  const files = fs.readdirSync(folder).filter(file => /^KH\s.*\.xlsx$/i.test(file)).sort();
  if (Object.keys(map).some(file => !files.includes(file))) throw new Error('Branch map contains an unknown source filename');
  const sources = [], sourceHashes = {};
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(folder, file)); sourceHashes[file] = createHash('sha256').update(bytes).digest('hex');
    if (map[file] === null) continue;
    const book = new Excel.Workbook(); await book.xlsx.load(bytes);
    sources.push(...shared.parseContractOrderWorkbook(book, file, map[file] || null));
  }
  const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL statement_timeout='30s'");
    const snapshot = {};
    for (const [key, table] of [['customers', 'customers'], ['vehicles', 'vehicles'], ['orders', 'orders'], ['details', 'order_vehicle_details']]) snapshot[key] = (await c.query(`SELECT * FROM himoto.${table} ORDER BY id`)).rows;
    snapshot.stores = (await c.query('SELECT *,store_name AS name FROM himoto.stores ORDER BY id')).rows;
    const plans = shared.planContractImport(sources, snapshot);
    const importedDraftIds = new Set(snapshot.orders.filter(order => {
      try { return order.order_status === 'draft' && JSON.parse(order.metadata || '{}').excel_import?.namespace === shared.CONTRACT_IMPORT_NAMESPACE; }
      catch { return false; }
    }).map(order => Number(order.id)));
    const isImportedDraft = plan => plan.state === 'existing' && importedDraftIds.has(plan.targetId);
    const columns = [
      ['sourceId','ID đơn nguồn',18],['name','Khách hàng',30],['phone','SĐT nguồn',22],['customerId','ID khách khớp',18],['vehicle','Tên xe',25],['license','Biển số',20],['vehicleId','ID xe khớp',16],
      ['store','Cơ sở file',25],['vehicleStore','Cơ sở xe hiện tại',25],['created','Ngày tạo nguồn',24],['start','Ngày mượn nguồn',24],['end','Ngày trả nguồn',24],
      ['paid','Tổng đã thu (cột Đặt cọc cũ)',32],['total','Tạm tính',20],['status','Trạng thái nguồn',20],['targetId','ID hợp đồng đã có',22],['state','Kết quả',30],['issues','Cần đối chiếu',110],
      ['file','File gốc',28],['row','Dòng gốc',12],['note','Ghi chú đơn',45],
    ];
    const book = new Excel.Workbook(); book.creator = 'HIMOTO';
    const labels = { new: 'Khớp mới, chưa ghi', existing: 'Đã có, giữ nguyên', blocked: 'Chờ đối chiếu' };
    for (const [sheetName, accepted] of [['Đối chiếu', null], ['Đơn khớp mới', 'new'], ['Đã có', 'existing'], ['Đã lưu Log', 'imported-draft'], ['Chờ đối chiếu', 'blocked']]) {
      const sheet = book.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = columns.map(([key, header, width]) => ({ key, header, width, style: { numFmt: '@' } }));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB5121B' } };
      sheet.autoFilter = 'A1:U1';
      for (const plan of plans.filter(plan => !accepted || (accepted === 'imported-draft' ? isImportedDraft(plan) : plan.state === accepted && !isImportedDraft(plan)))) for (const source of plan.sources) {
        const vehicle = snapshot.vehicles.filter(vehicle => plates.vehiclePlate(vehicle.license) === plates.vehiclePlate(source.license));
        const chosen = vehicle.length === 1 ? vehicle[0] : undefined;
        sheet.addRow({ sourceId: source.sourceId, name: source.name, phone: source.originalPhone, customerId: plan.customerId ? String(plan.customerId) : '', vehicle: source.vehicleName, license: source.license,
          vehicleId: chosen ? String(chosen.id) : '', store: snapshot.stores.find(store => Number(store.id) === source.storeId)?.name || '',
          vehicleStore: snapshot.stores.find(store => String(store.id) === String(chosen?.current_store_id ?? chosen?.store_id))?.name || '', created: source.createdAt, start: source.start, end: source.end,
          paid: source.paid, total: source.total, status: source.status, targetId: plan.targetId ? String(plan.targetId) : '', state: isImportedDraft(plan) ? 'Đã lưu Log, tiếp tục bổ sung' : labels[plan.state], issues: [...plan.errors, ...plan.warnings].join(' '), file: source.filename, row: source.rowNumber, note: source.note });
      }
    }
    const branches = book.addWorksheet('Cơ sở'); branches.columns = [{ header: 'ID', key: 'id', width: 18 }, { header: 'Cơ sở', key: 'name', width: 30 }]; snapshot.stores.forEach(store => branches.addRow({ id: String(store.id), name: store.name }));
    const guide = book.addWorksheet('Hướng dẫn'); guide.getColumn(1).width = 120;
    [
      'BẢN ĐỐI CHIẾU tại thời điểm xuất. Helper này chỉ đọc; sheet Đã lưu Log nhận diện những nháp đã nhập trước đó. Mỗi dòng gốc là một xe; cùng ID đơn là một hợp đồng, không cộng lại số tiền cho từng xe.',
      'Chỉ khớp khách theo cả tên + điện thoại, xe theo biển số duy nhất, và kiểm tra cơ sở hiện tại. Không tự chuyển xe hoặc đóng hợp đồng đang hoạt động.',
      'ID nguồn không phải ID khách; chỉ khớp hợp đồng cũ khi có thêm khách, cơ sở, đầy đủ xe, ngày tạo và ngày bắt đầu. ID mới phải do database cấp.',
      'Cột Đặt cọc trong file cũ xuất orders.pid (tổng đã thu), KHÔNG phải first_deposit_amount + additional_deposit_amount. Chưa biết tiền cọc riêng thì để trống.',
      'Không sinh phiếu thu/chi, giá thuê từng xe, gia hạn, hợp đồng ký hoặc dữ liệu giấy tờ còn thiếu chỉ từ file tổng hợp này.',
      'Ngày Excel là giờ Việt Nam. Một số dữ liệu CSDL cũ được lưu với cùng giờ hiển thị nhưng timezone UTC; không tự sửa hàng loạt. Ngày trả/số tiền lệch được giữ để đối chiếu.',
      'Sheet Đơn khớp mới chỉ có những nhóm không xung đột khách/xe/cơ sở/hợp đồng khác. Helper nhập chỉ lưu nháp để bổ sung giá/cọc/chứng từ. Đã lưu Log thì mở nháp hiện có, không nhập lại.',
    ].forEach(line => guide.addRow([line]));
    await book.xlsx.writeFile(path.join(folder, 'HIMOTO-hop-dong-dang-thue-doi-chieu.xlsx'));
    const pending = plans.filter(plan => plan.state === 'blocked');
    const revision = load(path.join(root, 'lib/server/contract-import')).contractSnapshotHash({ sources, snapshot });
    const report = { revision, sourceRows: sources.length, sourceOrders: plans.length, multiVehicleOrders: plans.filter(plan => new Set(plan.sources.map(source => plates.vehiclePlate(source.license))).size > 1).length,
      matchedExisting: plans.filter(plan => plan.state === 'existing' && !isImportedDraft(plan)).length, matchedDrafts: plans.filter(isImportedDraft).length, matchedNew: plans.filter(plan => plan.state === 'new').length, pending: pending.length,
      reasons: { phone: pending.filter(plan => plan.errors.some(error => /Điện thoại|điện thoại/.test(error))).length, customer: pending.filter(plan => plan.errors.some(error => /khách hàng|Khách hàng/.test(error))).length,
        missingVehicle: pending.filter(plan => plan.errors.some(error => error.includes('chưa có xe'))).length, branchMismatch: pending.filter(plan => plan.errors.some(error => error.includes('cơ sở hiện tại'))).length,
        activeConflict: pending.filter(plan => plan.errors.some(error => error.includes('hoạt động khác'))).length, duplicateActivePlate: pending.filter(plan => plan.errors.some(error => error.includes('nhiều đơn đang thuê'))).length },
      existingChanges: { dates: plans.filter(plan => plan.state === 'existing' && plan.warnings.some(warning => warning.includes('Thời gian trả'))).length, money: plans.filter(plan => plan.state === 'existing' && plan.warnings.some(warning => warning.includes('Số tiền'))).length },
      database: { customers: snapshot.customers.length, vehicles: snapshot.vehicles.length, orders: snapshot.orders.length, details: snapshot.details.length }, sourceHashes, committed: false, businessWrites: 0 };
    fs.writeFileSync(path.join(folder, 'contract-preview.json'), JSON.stringify({ ...report, plans, sources }, null, 2));
    const backupFolder = path.join(project, '.backups/contracts'); fs.mkdirSync(backupFolder, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(backupFolder, `before-${timestamp}.json`), JSON.stringify({ createdAt: new Date().toISOString(), sha256: hash(snapshot), snapshot }, null, 2), { flag: 'wx' });
    await c.query('ROLLBACK'); console.log(JSON.stringify(report));
  } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
  finally { c.release(); }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });

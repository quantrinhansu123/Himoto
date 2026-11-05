require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path'), { NextRequest } = require('next/server');
const { load, root } = require('./lib/load-typescript.cjs');
async function run() {
  const statements = [], queries = [];
  global.himotoPool = { async connect() { return { async query(sql) { statements.push(sql); return { rows: [], rowCount: 0 }; }, release() {} }; } };
  const table = load(path.join(root, 'lib/server/management-table')), context = load(path.join(root, 'lib/server/access-context'));
  // Set before loading the server module so the DB getter never opens a pool.
  const api = load(path.join(root, 'lib/server/mobile-catalogue-export')), shape = load(path.resolve('shared/mobile-catalogue-export'));
  const fileShape = load(path.resolve('shared/mobile-export')), { buildManagementCsv } = load(path.join(root, 'lib/management/management-export'));
  const { MANAGEMENT_CONFIG } = load(path.join(root, 'lib/management/config'));
  const original = table.readManagementTable, source = Array.from({ length: 53 }, (_, i) => ({ id: i + 1, code: `QA-${i + 1}`, name: i ? `QA ${i + 1}` : '=SUM(1,2)', customer_name: i ? `QA ${i + 1}` : '=SUM(1,2)', phone: '0900000002', status: 'active', store_name: 'QA Store', id_card: '001234000002', address: 'Address, "QA"', private_secret: 'MUST_NOT_EXPORT' }));
  let failCount = false, duplicate = false;
  table.readManagementTable = async (client, kind, params) => {
    const scope = context.dataAccess.getStore(); assert.equal(scope.id, 7); assert.equal(scope.scope_all, false); assert.equal(scope.operation, kind === 'vehicles' ? 'fleet_read' : '');
    queries.push({ kind, query: new URLSearchParams(params) }); table.parseManagementTable(kind, params);
    const page = Number(params.get('page') || 1), all = params.get('all') === '1';
    return { rows: all ? source : page === 1 ? source.slice(0, 50) : duplicate ? source.slice(0, 3) : source.slice(50), total: failCount ? 54 : 53, page, pages: 2 };
  };
  const user = { id: 7, name: 'QA', role: 'staff', access_role: 'branch_staff', store_id: 23, scope_all: false, permissions: ['customers.read', 'vehicles.read', 'contracts.read', 'hr.read'] };
  const req = query => new NextRequest(`https://fixture.invalid/exports?${query}`);
  const checks = [];
  try {
    for (const kind of ['customers', 'vehicles', 'contracts', 'staff', 'stores']) {
      const profile = api.mobileCatalogueExportColumns(user, kind, new URLSearchParams(kind === 'contracts' ? 'scope=drafts' : ''));
      assert(shape.isMobileExportColumns(profile)); assert(profile.columns.some(c => c.selected)); assert(!profile.columns.some(c => c.key === 'private_secret'));
      const result = await api.exportMobileCatalogue(user, kind, req(`${kind === 'contracts' ? 'scope=drafts&' : ''}search=QA&status=active&store=23&columns=code,${kind === 'contracts' ? 'customer_name' : 'name'}`));
      assert(fileShape.isMobileFileExport(result)); assert.equal(result.rowCount, 53); assert.equal(result.content.split('\r\n').length, 54); assert(!result.content.includes('MUST_NOT_EXPORT')); assert(result.content.includes(`"'=SUM(1,2)"`));
      const calls = queries.filter(q => q.kind === kind); assert(calls.every(c => c.query.get('search') === 'QA' && c.query.get('status') === 'active' && c.query.get('store') === '23'));
      assert.equal(calls.length, kind === 'customers' || kind === 'contracts' ? 1 : 2);
    }
    assert.equal(statements.filter(s => s === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length, 5); assert.equal(statements.filter(s => s === 'COMMIT').length, 5); assert(!statements.some(s => /INSERT|UPDATE|DELETE/.test(s)));
    checks.push('Five catalogue adapters keep role/branch/fleet_read and every filter; exact web all reader or all pages inside one read-only snapshot, including pages not mounted in the UI');
    const config = MANAGEMENT_CONFIG.customers, columns = config.columns.filter(c => ['name', 'phone', 'address', 'status'].includes(c.key));
    const csv = buildManagementCsv(config, columns, [source[0]]);
    assert(csv.startsWith('\uFEFF')); assert(csv.includes('Bình thường')); assert(csv.includes('0900000002')); assert(csv.includes('Address, ""QA""'));
    const rental = buildManagementCsv(MANAGEMENT_CONFIG.contracts, [{ key: 'rental_period', label: 'Thời gian thuê' }], [{ ...source[0], start_date: '2026-11-01', end_date: '2026-11-04' }]); assert(rental.includes('01/11/2026')); assert(rental.includes('04/11/2026'));
    checks.push('Web/native share one CSV builder: exact labels, BOM, leading zero text, money/date/rental-period formatting, quotes and spreadsheet-formula escaping');
    for (const [scope, required] of [['ownership', 'contract_type_name'], ['overdue', 'rental_debt_amount'], ['due', 'billing_due_amount'], ['vat', 'company_paid_amount']]) {
      const p = api.mobileCatalogueExportColumns(user, 'contracts', new URLSearchParams({ scope })); assert(p.columns.some(c => c.key === required)); assert(p.columns.some(c => c.key === 'collection_notes'));
    }
    const p = api.mobileCatalogueExportColumns(user, 'staff', new URLSearchParams('position=QA'));
    assert(p.columns.length); await api.exportMobileCatalogue(user, 'staff', req('position=QA&columns=name')); assert.equal(queries.at(-1).query.get('filter_position'), 'QA');
    checks.push('Contract workspace columns follow compact web presets including ownership/due/VAT/overdue and followup notes; staff role filter survives export');
    for (const bad of ['columns=private_secret', 'columns=name,name', 'columns=', 'all=1', 'filter_id=1', 'search=a&search=b', 'scope=unknown', 'from=2026-02-30', 'position=x']) assert.throws(() => api.mobileCatalogueExportColumns(user, 'customers', new URLSearchParams(bad)));
    for (const kind of ['customers', 'staff', 'stores', 'contracts']) await assert.rejects(() => api.exportMobileCatalogue({ ...user, permissions: [] }, kind, req('')), e => e.status === 403);
    assert(shape.isMobileExportColumns(api.mobileCatalogueExportColumns({ ...user, permissions: [] }, 'vehicles', new URLSearchParams())), 'Authenticated fleet reading is universally granted by actual web policy');
    failCount = true; await assert.rejects(() => api.exportMobileCatalogue(user, 'customers', req('')), e => e.code === 'EXPORT_INCOMPLETE'); failCount = false;
    duplicate = true; await assert.rejects(() => api.exportMobileCatalogue(user, 'vehicles', req('')), e => e.code === 'EXPORT_INCOMPLETE');
    assert.equal(statements.filter(s => s === 'ROLLBACK').length, 2);
    checks.push('Unknown/duplicate columns or filters and foreign grants reject; incomplete counts/duplicate page rows roll back and never produce a truncated or mixed file');
    duplicate=false;
    const excel=await api.exportMobileCatalogue(user,'customers',req('format=xlsx&columns=name,phone,id_card'));
    assert(fileShape.isMobileFileExport(excel));assert.equal(excel.rowCount,53);assert(excel.filename.endsWith('.xlsx'));
    const {Workbook}=require('exceljs'),book=new Workbook();await book.xlsx.load(Buffer.from(excel.contentBase64,'base64'));
    const sheet=book.worksheets[0];assert.equal(sheet.rowCount,54);assert.equal(sheet.getCell('B2').value,'0900000002');assert.equal(sheet.getCell('C2').value,'001234000002');assert.equal(sheet.getCell('A2').value,'=SUM(1,2)');assert.equal(sheet.getCell('A2').type,3);assert.equal(sheet.views[0].ySplit,1);assert(sheet.autoFilter);
    for(const filters of ['format=pdf','format=xlsx&format=csv'])await assert.rejects(()=>api.exportMobileCatalogue(user,'customers',req(filters)),e=>e.status===400);
    checks.push('Pulled Excel action reuses actual web workbook builder and current filter/column snapshot; XLSX reopens with 53 complete rows, literal formula text, leading zeros, freeze/filter and strict format');
    const out=process.argv.indexOf('--output');
    if(out>=0){const fs=require('node:fs'),folder=path.resolve(process.argv[out+1]);assert(folder.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(folder));fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'catalogue.json'),JSON.stringify({fixtureOnly:true,file:excel,columns:{kind:'customers',title:'Khách hàng',columns:[{key:'name',label:'Khách hàng',selected:true},{key:'phone',label:'Số điện thoại',selected:true},{key:'id_card',label:'Giấy tờ định danh',selected:true}]}},null,2));}
    console.log(JSON.stringify({ ok: true, groups: checks.length, checks, adapterOnly: true, stagingAcceptance: false }, null, 2));
  } finally { table.readManagementTable = original; }
}
run().catch(error => { console.error(error); process.exitCode = 1; });

// Excel is source data. This helper reads named org-chart cells, never executes workbook content.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { load, root } = require('./lib/load-typescript.cjs');
const { normalizeStaffPosition } = load(path.join(root, 'lib/management/staff-positions'));
const clean = text => String(text || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const blocks = [
  ['B3', 'HCNS'], ['F3', 'QLCN'], ['M3', 'KT'], ['T3', 'BPSC'], ['Z3', 'TLS'], ['A12', 'NVKD'],
  ['B12', 'NVKD', 'CS2'], ['D12', 'NVKD', 'CS1'], ['J12', 'NVKD', 'CS3'], ['P12', 'NVKD', 'CS5'], ['V12', 'NVKD', 'CS4'], ['AB12', 'Leader', 'CS6'],
  ['B17', 'PT', 'CS2'], ['D17', 'PT', 'CS1'], ['J17', 'PT', 'CS3'], ['V17', 'PT', 'CS4'],
];
const branchCells = [['B10', 'CS2', 'CS Nguyễn Hoàng'], ['D10', 'CS1', 'CS Láng'], ['J10', 'CS3', 'CS Thuốc Bắc'], ['P10', 'CS5', 'CS Hà Đông'], ['V10', 'CS4', 'CS Giáp Bát'], ['AB10', 'CS6', 'CS Thuê sở hữu']];

async function readStaffWorkbook(filename) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(filename);
  const sheet = workbook.getWorksheet('Sơ đồ tổ chức');
  if (!sheet) throw new Error('Không tìm thấy sheet Sơ đồ tổ chức.');
  const members = new Map();
  for (const [address, fallback, storeCode = null] of blocks) {
    let current;
    const parsed = [];
    for (const raw of sheet.getCell(address).text.split('\n')) {
      const line = clean(raw);
      if (!line || /^(HCNS|BPSC|NVKD|PT|TPKD & NVKD|QL PTKD & NVKD|Hành chính nhân sự.*|Quản lý công nợ|Kế toán.*|Telesales.*)$/iu.test(line)) continue;
      const phones = line.match(/\b0\d{9}\b/g);
      if (phones) { if (!current) throw new Error(`SĐT không có nhân sự ở ô ${address}`); current.phones.push(...phones); continue; }
      if (line === '(Leader)') continue;
      const [fullName, role] = line.replace(/\s*\(Leader\)$/, '').split(/\s+[–-]\s+/);
      current = { name: fullName, position: normalizeStaffPosition(role || fallback), storeCode, phones: [], cells: [address] };
      parsed.push(current);
    }
    for (const person of parsed) {
      if (!person.name || !person.phones.length) throw new Error(`Thiếu tên hoặc SĐT ở ô ${address}`);
      const existing = members.get(person.phones[0]);
      if (existing) {
        if (existing.name !== person.name || (existing.storeCode && person.storeCode && existing.storeCode !== person.storeCode)) throw new Error('Nhân sự trùng SĐT nhưng khác tên/cơ sở.');
        existing.position = normalizeStaffPosition(`${existing.position} / ${person.position}`);
        existing.storeCode ||= person.storeCode;
        existing.phones = [...new Set([...existing.phones, ...person.phones])];
        existing.cells.push(address);
      } else members.set(person.phones[0], person);
    }
  }
  const stores = branchCells.map(([address, code, name]) => ({ code, name, phone: sheet.getCell(address).text.match(/\b0\d{9}\b/)?.[0] }));
  if (stores.some(store => !store.phone)) throw new Error('Thiếu SĐT cơ sở trong Excel.');
  return { staff: [...members.values()], stores };
}

function staffPlan(source, before, stores) {
  const matched = new Set();
  const rows = source.staff.map(person => {
    const found = before.filter(row => clean(row.full_name).toLocaleLowerCase('vi') === person.name.toLocaleLowerCase('vi') || String(row.phone).replace(/\D/g, '') === person.phones[0]);
    if (found.length > 1) throw new Error(`Nhiều hồ sơ khớp ${person.name}; cần đối chiếu.`);
    const old = found[0];
    if (old && matched.has(old.id)) throw new Error('Một hồ sơ khớp nhiều nhân sự Excel.');
    if (old) matched.add(old.id);
    const store = person.storeCode ? stores.find(row => row.code === person.storeCode) : null;
    if (person.storeCode && !store) throw new Error(`Không tìm thấy cơ sở ${person.storeCode}`);
    return { ...person, id: old?.id || null, store_id: store?.id || null };
  });
  return { rows, departed: before.filter(row => String(row.staff_code).startsWith('ORG-') && row.status !== 'leave' && !matched.has(row.id)) };
}

async function main() {
  const args = process.argv.slice(2), commit = args.includes('--commit');
  const fileFlag = args.indexOf('--file');
  if (args.some((arg, index) => !['--commit', '--file'].includes(arg) && !(fileFlag >= 0 && index === fileFlag + 1)) || (fileFlag >= 0 && (!args[fileFlag + 1] || args[fileFlag + 1].startsWith('--')))) throw new Error('Tham số không hợp lệ.');
  const filename = fileFlag >= 0 ? args[fileFlag + 1] : fs.readdirSync('.').find(file => file.startsWith('Sơ Đồ Tổ Chức') && file.endsWith('.xlsx'));
  if (!filename) throw new Error('Cần --file đường dẫn Excel.');
  const source = await readStaffWorkbook(filename);
  if (!source.staff.length) throw new Error('Excel không có nhân sự; không đồng bộ.');
  require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const client = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('LOCK TABLE himoto.staff_profiles, himoto.stores IN SHARE ROW EXCLUSIVE MODE');
    const before = (await client.query('SELECT * FROM himoto.staff_profiles ORDER BY id')).rows;
    const storesBefore = (await client.query('SELECT * FROM himoto.stores ORDER BY id')).rows;
    const plan = staffPlan(source, before, storesBefore);
    const preview = { sourceStaff: source.staff.length, existingStaff: before.length, matched: plan.rows.filter(row => row.id).length, added: plan.rows.filter(row => !row.id).length,
      departed: plan.departed.map(row => ({ id: row.id, name: row.full_name })), stores: source.stores, rows: plan.rows, committed: false };
    if (!commit) { await client.query('ROLLBACK'); console.log(JSON.stringify(preview, null, 2)); return; }
    // Save the complete source and affected tables before any write. Never delete linked history.
    const folder = path.resolve('.backups/staff'); fs.mkdirSync(folder, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(folder, `before-${stamp}.json`);
    fs.writeFileSync(backup, JSON.stringify({ source, staff: before, stores: storesBefore }, null, 2), { flag: 'wx' });
    const audit = async () => {
      const result = {};
      for (const table of ['staff_attendances', 'store_duty_schedules', 'orders', 'transactions']) result[table] = (await client.query(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS hash FROM himoto.${table} t`)).rows[0];
      return result;
    };
    const historyBefore = await audit();
    for (const store of source.stores) {
      const saved = await client.query('UPDATE himoto.stores SET store_name=$2, store_phone=$3, updated_at=now() WHERE code=$1 RETURNING id', [store.code, store.name, store.phone]);
      if (saved.rowCount !== 1) throw new Error(`Cơ sở ${store.code} không khớp duy nhất.`);
    }
    for (const row of plan.rows) {
      const old = before.find(person => person.id === row.id);
      const otherPhones = row.phones.slice(1).filter(phone => !String(old?.notes || '').includes(phone));
      const notes = [old?.notes, otherPhones.length ? `SĐT khác (Excel): ${otherPhones.join(' | ')}` : ''].filter(Boolean).join('\n');
      if (row.id) await client.query('UPDATE himoto.staff_profiles SET full_name=$2,phone=$3,position=$4,store_id=$5,status=\'active\',notes=NULLIF($6,\'\'),updated_at=now() WHERE id=$1', [row.id, row.name, row.phones[0], row.position, row.store_id, notes]);
      else {
        const result = await client.query(`WITH next AS (SELECT nextval('himoto.staff_profiles_id_seq') AS id)
          INSERT INTO himoto.staff_profiles(id,staff_code,full_name,phone,position,store_id,status,notes,created_at,updated_at)
          SELECT id,'NV' || lpad(id::text,4,'0'),$1,$2,$3,$4,'active',NULLIF($5,''),now(),now() FROM next RETURNING id`, [row.name, row.phones[0], row.position, row.store_id, notes]);
        row.id = result.rows[0].id;
      }
    }
    for (const row of plan.departed) await client.query("UPDATE himoto.staff_profiles SET status='leave',updated_at=now() WHERE id=$1", [row.id]);
    const after = (await client.query('SELECT * FROM himoto.staff_profiles ORDER BY id')).rows;
    const storesAfter = (await client.query('SELECT * FROM himoto.stores ORDER BY id')).rows;
    for (const row of plan.rows) {
      const saved = after.find(person => person.id === row.id);
      assert.equal(saved.full_name, row.name); assert.equal(saved.phone, row.phones[0]); assert.equal(saved.position, row.position); assert.equal(saved.store_id, row.store_id); assert.equal(saved.status, 'active');
    }
    const updated = new Set(plan.rows.map(row => row.id));
    for (const old of before) {
      const saved = after.find(row => row.id === old.id); assert(saved, 'Existing staff removed');
      const allowed = new Set(updated.has(old.id) ? ['full_name','phone','position','store_id','status','notes','updated_at'] : plan.departed.some(row => row.id === old.id) ? ['status','updated_at'] : []);
      for (const field of Object.keys(old)) if (!allowed.has(field)) assert.deepEqual(saved[field], old[field], `Protected staff field ${field}`);
    }
    for (const old of storesBefore) for (const field of Object.keys(old)) if (!['store_name','store_phone','updated_at'].includes(field)) assert.deepEqual(storesAfter.find(row => row.id === old.id)[field], old[field], `Protected store field ${field}`);
    assert.deepEqual(await audit(), historyBefore, 'History changed');
    await client.query('COMMIT');
    const report = { sourceStaff: source.staff.length, matched: preview.matched, added: preview.added, departed: plan.departed.length, staffAfter: after.length, committed: true, backup, historyPreserved: true };
    fs.writeFileSync(path.join(folder, `result-${stamp}.json`), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
module.exports = { readStaffWorkbook, staffPlan };
if (require.main === module) main().then(() => process.exit(0)).catch(error => { console.error(error.code ? `Database error ${error.code}` : error.message); process.exit(1); });

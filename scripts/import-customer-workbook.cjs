// Operational helper. Defaults to read-only preview; inserts only, never resets
// customers or overwrites profiles/history. Real commit requires exact counts.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
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
const args = process.argv.slice(2), flags = new Map();
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (!['--file', '--actor-id', '--expect-added', '--allow-incomplete', '--commit'].includes(flag) || flags.has(flag)) throw new Error('Unknown or repeated argument');
  if (['--commit', '--allow-incomplete'].includes(flag)) flags.set(flag, true);
  else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing argument'); flags.set(flag, args[++i]); }
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main() {
  const project = path.resolve(__dirname, '..');
  require('@next/env').loadEnvConfig(project, false, { info() {}, error() {} });
  const file = path.resolve(project, flags.get('--file') || 'excel-import/HIMOTO-khach-hang-da-khop-cot.xlsx');
  const bytes = fs.readFileSync(file);
  const excel = load(path.join(root, 'lib/management/customer-excel'));
  const server = load(path.join(root, 'lib/server/customer-import'));
  const request = server.customerImportRequest({ rows: await excel.readCustomerExcel(new File([bytes], path.basename(file))), commit: flags.has('--commit'), allowIncomplete: flags.has('--allow-incomplete') });
  const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
  const backupFolder = path.join(project, '.backups/customers'); fs.mkdirSync(backupFolder, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const preview = await server.importDatabaseCustomers(c, request.rows, false, request.allowIncomplete);
    const before = (await c.query('SELECT * FROM himoto.customers ORDER BY id')).rows;
    const snapshot = { createdAt: new Date().toISOString(), table: 'himoto.customers', rowCount: before.length, sha256: hash(before), rows: before };
    const backupFile = `before-import-${timestamp}.json`;
    fs.writeFileSync(path.join(backupFolder, backupFile), JSON.stringify(snapshot, null, 2), { flag: 'wx' });
    if (hash(JSON.parse(fs.readFileSync(path.join(backupFolder, backupFile), 'utf8')).rows) !== snapshot.sha256) throw new Error('Local snapshot verification failed');
    await c.query('ROLLBACK');
    console.log(JSON.stringify({ total: preview.total, eligible: preview.valid, invalid: preview.invalid, duplicate: preview.duplicate, incomplete: preview.incomplete, databaseCustomers: before.length, localSnapshotVerified: true, committed: false }));
    if (!request.commit) return;
    if (preview.invalid || preview.duplicate || !preview.valid) throw new Error('File contains errors/duplicates or no eligible rows; nothing imported');
    if (!/^\d+$/.test(flags.get('--expect-added') || '') || Number(flags.get('--expect-added')) !== preview.valid) throw new Error('Missing or mismatched --expect-added; nothing imported');
    const actorId = Number(flags.get('--actor-id'));
    if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('Commit requires an existing active administrator --actor-id');
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query("SET LOCAL statement_timeout='30s'");
    const admin = await c.query(`SELECT u.id FROM himoto.users u LEFT JOIN himoto.roles r ON r.id=u.role_id WHERE u.id=$1 AND u.deleted_at IS NULL AND u.status='active'
      AND (u.role_id=1 OR u.role='admin' OR r.slug='quan-tri-vien')`, [actorId]);
    if (admin.rowCount !== 1) throw new Error('Actor is not an active administrator');
    await c.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
    const current = (await c.query('SELECT * FROM himoto.customers ORDER BY id')).rows;
    if (hash(current) !== snapshot.sha256) throw new Error('Customers changed after the snapshot; nothing imported. Prepare and preview again.');
    const audit = async () => {
      const result = {};
      for (const table of ['orders', 'order_vehicle_details', 'vehicles', 'stores']) result[table] = (await c.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS hash FROM himoto.${table} t`)).rows[0];
      return result;
    };
    const relatedBefore = await audit();
    const sequence = (await c.query("SELECT pg_get_serial_sequence('himoto.customers','id') AS name")).rows[0].name;
    if (sequence !== 'himoto.customers_id_seq') throw new Error('Unexpected customer ID sequence');
    const state = (await c.query('SELECT last_value,is_called FROM himoto.customers_id_seq')).rows[0];
    const maximum = current.reduce((max, row) => BigInt(row.id) > max ? BigInt(row.id) : max, 0n);
    const sequenceAdvanced = BigInt(state.last_value) < maximum || (!state.is_called && BigInt(state.last_value) === maximum);
    if (sequenceAdvanced) await c.query("SELECT setval('himoto.customers_id_seq'::regclass,$1::bigint,true)", [maximum.toString()]);
    const imported = await server.importDatabaseCustomers(c, request.rows, true, request.allowIncomplete);
    const after = (await c.query('SELECT * FROM himoto.customers ORDER BY id')).rows;
    const oldIds = new Set(before.map(row => String(row.id)));
    const originals = after.filter(row => oldIds.has(String(row.id)));
    const added = after.filter(row => !oldIds.has(String(row.id)));
    if (hash(originals) !== snapshot.sha256 || added.length !== preview.valid || after.length !== before.length + preview.valid) throw new Error('Original profiles or inserted counts changed; rolling back');
    for (const row of added) {
      const checked = imported.rows.find(item => item.values.phone === row.phone && item.values.name === row.name);
      if (!checked || Number(row.store_id) !== checked.store_id || row.id_card !== (checked.values.id_card || null) || row.address !== (checked.values.address || null)
        || (checked.values.status === 'draft' && row.status !== 0)) throw new Error('Inserted profile does not match the reviewed workbook; rolling back');
    }
    const relatedAfter = await audit();
    if (JSON.stringify(relatedBefore) !== JSON.stringify(relatedAfter)) throw new Error('Related data changed; rolling back import');
    const report = { importedAt: new Date().toISOString(), sourceFilename: path.basename(file), sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      imported: imported.imported, incomplete: imported.incomplete, customersBefore: before.length, customersAfter: after.length, originalProfilesPreserved: before.length,
      insertedIds: added.map(row => String(row.id)), branchCounts: added.reduce((counts, row) => ({ ...counts, [row.store_id]: (counts[row.store_id] || 0) + 1 }), {}),
      relatedTablesUnchanged: relatedBefore, localBackupFile: backupFile, localBackupVerified: true, sequenceAdvanced, committed: true };
    const pending = path.join(backupFolder, `pending-${timestamp}.json`), completed = path.join(backupFolder, `import-${timestamp}.json`);
    fs.writeFileSync(pending, JSON.stringify(report, null, 2), { flag: 'wx' });
    await c.query('COMMIT');
    fs.renameSync(pending, completed);
    console.log(JSON.stringify({ ...report, insertedIds: undefined }));
  } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
  finally { c.release(); }
}
main().catch(error => { console.error(error.code ? `Database operation failed (${error.code}); inspect counts before retrying` : error.message); process.exitCode = 1; });

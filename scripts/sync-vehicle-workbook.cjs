// Operational helper: defaults to preview. Never implements an unconditional reset.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
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
  if (!['--file', '--actor-id', '--expect-eligible', '--expect-updated', '--expect-added', '--skip-unknown-stores', '--commit'].includes(args[i]) || flags.has(args[i])) throw new Error('Unknown or repeated argument');
  if (['--commit', '--skip-unknown-stores'].includes(args[i])) flags.set(args[i], true);
  else { const key = args[i]; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing argument'); flags.set(key, args[++i]); }
}
const summary = result => ({ total: result.total, eligible: result.valid, invalid: result.invalid, skipped: result.skipped, updated: result.updated, added: result.inserted, retained: result.retained, blankColors: result.blankColors, committed: result.committed, backupId: result.backupId });
async function main() {
  const project = path.resolve(__dirname, '..');
  require('@next/env').loadEnvConfig(project, false, { info() {}, error() {} });
  const source = path.resolve(project, flags.get('--file') || 'excel-import/Kho xe tổng.xlsx');
  const excel = load(path.join(root, 'lib/management/vehicle-excel')), server = load(path.join(root, 'lib/server/vehicle-import'));
  const parsed = await excel.readVehicleExcel(new File([fs.readFileSync(source)], path.basename(source)));
  const request = server.vehicleImportRequest({ rows: parsed.rows, mode: 'sync', commit: false, revision: '', acceptWarnings: false, skipUnknownStores: flags.has('--skip-unknown-stores') });
  const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
  const backupFolder = path.join(project, '.backups/vehicles'); fs.mkdirSync(backupFolder, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const preview = await server.importDatabaseVehicles(c, request, 0);
    const before = (await c.query('SELECT * FROM himoto.vehicles ORDER BY id')).rows;
    const preChange = { createdAt: new Date().toISOString(), schema: 'himoto', table: 'vehicles', rowCount: before.length, sha256: server.vehicleSnapshotHash(before), rows: before };
    fs.writeFileSync(path.join(backupFolder, `before-${timestamp}.json`), JSON.stringify(preChange, null, 2), { flag: 'wx' });
    await c.query('ROLLBACK');
    console.log(JSON.stringify({ preview: summary(preview), localSnapshotSaved: true }));
    if (!flags.has('--commit')) return;
    const expectations = [['--expect-eligible', preview.valid], ['--expect-updated', preview.updated], ['--expect-added', preview.inserted]];
    for (const [flag, actual] of expectations) if (!flags.has(flag) || !/^\d+$/.test(flags.get(flag)) || Number(flags.get(flag)) !== actual) throw new Error(`Count mismatch or missing ${flag}; nothing imported`);
    if (preview.invalid || !preview.valid || preview.blocking.length) throw new Error('Preview contains errors or no eligible vehicles; nothing imported');
    const actorId = Number(flags.get('--actor-id'));
    if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('Commit requires --actor-id for an existing active administrator');
    const admin = await c.query(`SELECT u.id FROM himoto.users u LEFT JOIN himoto.roles r ON r.id=u.role_id WHERE u.id=$1 AND u.deleted_at IS NULL AND u.status='active'
      AND (u.role_id=1 OR u.role='admin' OR r.slug='quan-tri-vien')`, [actorId]);
    if (admin.rowCount !== 1) throw new Error('Actor is not an active administrator');
    await c.query('BEGIN');
    await c.query("SET LOCAL statement_timeout='30s'");
    await c.query("SET LOCAL lock_timeout='5s'");
    // Verify relationship tables in the same transaction. Concurrent updates
    // between this read and acquiring import locks cause an abort, never data loss.
    const audit = async () => {
      const result = {};
      for (const table of ['orders', 'order_vehicle_details', 'vehicle_images', 'vehicle_location_events', 'vehicle_transfer_items']) {
        const r = await c.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS hash FROM himoto.${table} t`);
        result[table] = r.rows[0];
      }
      return result;
    };
    const relatedBefore = await audit();
    const imported = await server.importDatabaseVehicles(c, { ...request, commit: true, revision: preview.revision, acceptWarnings: true }, actorId);
    const after = (await c.query('SELECT * FROM himoto.vehicles ORDER BY id')).rows;
    const relatedAfter = await audit();
    if (JSON.stringify(relatedBefore) !== JSON.stringify(relatedAfter)) throw new Error('Related data changed; rolling back import');
    const updatedIds = new Set(imported.rows.filter(row => row.state === 'valid' && row.action === 'update').map(row => row.targetId));
    const editable = new Set(['name','brand','type','year','license','color','chassis','engine','odometer','updated_at']);
    for (const old of before) {
      const saved = after.find(row => String(row.id) === String(old.id));
      if (!saved) throw new Error('Existing vehicle was removed; rolling back');
      for (const key of Object.keys(old)) if ((!updatedIds.has(Number(old.id)) || !editable.has(key)) && JSON.stringify(old[key]) !== JSON.stringify(saved[key])) throw new Error('Protected vehicle field changed; rolling back');
    }
    const durable = (await c.query('SELECT row_count,sha256,payload FROM himoto.vehicle_import_backups WHERE id=$1::uuid', [imported.backupId])).rows[0];
    if (!durable || durable.row_count !== before.length || durable.sha256 !== server.vehicleSnapshotHash(durable.payload) || durable.sha256 !== server.vehicleSnapshotHash(before)) throw new Error('Durable snapshot mismatch; rolling back');
    const report = { sourceFilename: path.basename(source), importedAt: new Date().toISOString(), ...summary(imported), vehiclesBefore: before.length, vehiclesAfter: after.length,
      originalVehicleIdsPreserved: before.length, relatedTablesUnchanged: relatedBefore, durableBackupVerified: true };
    // Save the report before COMMIT so a local write failure still cancels DB work.
    fs.writeFileSync(path.join(backupFolder, `pending-${timestamp}.json`), JSON.stringify(report, null, 2), { flag: 'wx' });
    await c.query('COMMIT');
    fs.renameSync(path.join(backupFolder, `pending-${timestamp}.json`), path.join(backupFolder, `import-${timestamp}.json`));
    console.log(JSON.stringify(report));
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { c.release(); }
}
main().catch(error => { console.error(error.code ? `Database operation failed (${error.code}); inspect counts before retrying` : error.message); process.exitCode = 1; });

// Imports only reviewed drafts. Defaults to SELECT-only preview. Existing
// contracts, customers, vehicle state, rental details and cash remain intact.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(localRequire, module, module.exports); return module.exports;
}
const flags = new Map(), args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (!['--branch-map', '--actor-id', '--expect-added', '--commit'].includes(flag) || flags.has(flag)) throw new Error('Unknown or duplicate flag');
  if (flag === '--commit') flags.set(flag, true);
  else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing argument'); flags.set(flag, args[++i]); }
}
async function main() {
  const project = path.resolve(__dirname, '..'); require('@next/env').loadEnvConfig(project, false, { info() {}, error() {} });
  if (!flags.has('--branch-map')) throw new Error('A reviewed --branch-map is required');
  const folder = path.join(project, 'excel-import');
  const prepared = JSON.parse(fs.readFileSync(path.join(folder, 'contract-preview.json'), 'utf8'));
  const mapping = JSON.parse(fs.readFileSync(path.resolve(project, flags.get('--branch-map')), 'utf8'));
  const shared = load(path.join(root, 'lib/management/contract-import')), server = load(path.join(root, 'lib/server/contract-import'));
  const sources = [];
  const Excel = require('exceljs');
  const files = fs.readdirSync(folder).filter(file => /^KH\s.*\.xlsx$/i.test(file)).sort();
  if (server.contractSnapshotHash(files) !== server.contractSnapshotHash(Object.keys(prepared.sourceHashes).sort())) throw new Error('Source file list changed; prepare again');
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(folder, file));
    if (createHash('sha256').update(bytes).digest('hex') !== prepared.sourceHashes[file]) throw new Error('Source workbook changed; prepare again');
    if (mapping[file] === null) continue;
    const book = new Excel.Workbook(); await book.xlsx.load(bytes);
    sources.push(...shared.parseContractOrderWorkbook(book, file, mapping[file] || null));
  }
  const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
  const backupFolder = path.join(project, '.backups/contracts'); fs.mkdirSync(backupFolder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const preview = await server.previewDatabaseContracts(c, sources);
    const newPlans = preview.plans.filter(plan => plan.state === 'new');
    const snapshot = { createdAt: new Date().toISOString(), sha256: server.contractSnapshotHash(preview.snapshot), snapshot: preview.snapshot };
    const backupFile = `before-import-${stamp}.json`;
    fs.writeFileSync(path.join(backupFolder, backupFile), JSON.stringify(snapshot, null, 2), { flag: 'wx' });
    if (server.contractSnapshotHash(JSON.parse(fs.readFileSync(path.join(backupFolder, backupFile), 'utf8')).snapshot) !== snapshot.sha256) throw new Error('Backup failed verification');
    await c.query('ROLLBACK');
    console.log(JSON.stringify({ sourceOrders: preview.plans.length, newDraftCandidates: newPlans.length, existing: preview.plans.filter(plan => plan.state === 'existing').length,
      pending: preview.plans.filter(plan => plan.state === 'blocked').length, preparedRevisionMatches: prepared.revision === preview.revision, backupVerified: true, committed: false }));
    if (!flags.has('--commit')) return;
    if (prepared.revision !== preview.revision) throw new Error('Source/database changed since prepared Excel; prepare and review again');
    if (!/^\d+$/.test(flags.get('--expect-added') || '') || Number(flags.get('--expect-added')) !== newPlans.length || !newPlans.length) throw new Error('Missing or mismatched --expect-added');
    const actorId = Number(flags.get('--actor-id'));
    if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('Existing administrator actor is required');
    await c.query('BEGIN'); await c.query("SET LOCAL lock_timeout='5s'"); await c.query("SET LOCAL statement_timeout='30s'");
    const admin = await c.query(`SELECT u.id FROM himoto.users u LEFT JOIN himoto.roles r ON r.id=u.role_id WHERE u.id=$1 AND u.deleted_at IS NULL AND u.status='active'
      AND (u.role_id=1 OR u.role='admin' OR r.slug='quan-tri-vien')`, [actorId]);
    if (admin.rowCount !== 1) throw new Error('Actor is not an active administrator');
    await c.query('LOCK TABLE himoto.orders IN SHARE ROW EXCLUSIVE MODE');
    const audit = async () => {
      const result = {};
      for (const table of ['transactions', 'order_vehicle_details', 'vehicles', 'customers', 'stores']) result[table] = (await c.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS hash FROM himoto.${table} t`)).rows[0];
      return result;
    };
    const relatedBefore = await audit();
    const serial = (await c.query("SELECT pg_get_serial_sequence('himoto.orders','id') AS name")).rows[0].name;
    if (serial !== 'himoto.orders_id_seq') throw new Error('Unexpected order sequence');
    const sequence = (await c.query('SELECT last_value,is_called FROM himoto.orders_id_seq')).rows[0];
    const maximum = preview.snapshot.orders.reduce((max, row) => BigInt(row.id) > max ? BigInt(row.id) : max, 0n);
    const advanced = BigInt(sequence.last_value) < maximum || (!sequence.is_called && BigInt(sequence.last_value) === maximum);
    if (advanced) await c.query("SELECT setval('himoto.orders_id_seq'::regclass,$1::bigint,true)", [maximum.toString()]);
    const imported = await server.importDatabaseContractDrafts(c, sources, preview.revision, newPlans.length, actorId);
    const after = await server.previewDatabaseContracts(c, sources);
    const oldIds = new Set(preview.snapshot.orders.map(order => String(order.id)));
    const originals = after.snapshot.orders.filter(order => oldIds.has(String(order.id)));
    const added = after.snapshot.orders.filter(order => !oldIds.has(String(order.id)));
    if (server.contractSnapshotHash(originals) !== server.contractSnapshotHash(preview.snapshot.orders) || added.length !== newPlans.length) throw new Error('Original contracts or inserted count changed; rolling back');
    for (const order of added) {
      const payload = order.draft_payload?.management_composer?.draft;
      const metadata = JSON.parse(order.metadata || '{}').excel_import;
      if (order.order_status !== 'draft' || !payload || payload.deposit_amount !== '' || payload.unit_price !== '' || payload.signed_on !== ''
        || String(order.pid) !== '0' || String(order.total) !== '0' || order.first_deposit_amount !== null || order.additional_deposit_amount !== null || !metadata || metadata.financialReconciled !== false) throw new Error('Draft unexpectedly changed operational/financial state; rolling back');
    }
    const relatedAfter = await audit();
    if (JSON.stringify(relatedBefore) !== JSON.stringify(relatedAfter)) throw new Error('Protected related tables changed; rolling back');
    if (after.plans.filter(plan => plan.state === 'new').length !== 0 || imported.added.some(added => !after.plans.some(plan => plan.sourceId === added.sourceId && plan.state === 'existing' && plan.targetId === added.id))) throw new Error('Imported drafts were not recognized for duplicate prevention');
    const report = { importedAt: new Date().toISOString(), added: imported.added, ordersBefore: preview.snapshot.orders.length, ordersAfter: after.snapshot.orders.length,
      oldContractsPreserved: originals.length, draftCountBefore: preview.snapshot.orders.filter(order => order.order_status === 'draft' && !order.deleted_at).length,
      draftCountAfter: after.snapshot.orders.filter(order => order.order_status === 'draft' && !order.deleted_at).length, relatedTablesUnchanged: relatedBefore,
      localBackupFile: backupFile, backupVerified: true, sequenceAdvanced: advanced, committed: true };
    const pendingFile = path.join(backupFolder, `pending-${stamp}.json`), completed = path.join(backupFolder, `import-${stamp}.json`);
    fs.writeFileSync(pendingFile, JSON.stringify(report, null, 2), { flag: 'wx' }); await c.query('COMMIT'); fs.renameSync(pendingFile, completed);
    console.log(JSON.stringify(report));
  } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
  finally { c.release(); }
}
main().catch(error => { console.error(error.code ? `Database operation failed (${error.code}); verify counts before retrying` : error.message); process.exitCode = 1; });

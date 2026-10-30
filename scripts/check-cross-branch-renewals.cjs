const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { load, root } = require('./lib/load-typescript.cjs');
const { renewContractAndCollect } = load(path.join(root, 'lib/server/contract-renewal-collection'));
const { recordContractPayment } = load(path.join(root, 'lib/server/contract-payments'));
const { queueContractNotification } = load(path.join(root, 'lib/server/contract-notifications'));
const { dataAccess } = load(path.join(root, 'lib/server/access-context'));
const pool = load(path.join(root, 'lib/server/himoto-database')).ownerDatabase;
global.fetch = async () => { throw Error('No provider/Telegram calls allowed'); };
const scope = { id: 151, access_role: 'branch_staff', store_id: 23, scope_all: false, operation: '' };
const tables = ['orders','order_vehicle_details','vehicles','banks','cash','transactions','management_contract_payments','stores','users','management_record_photos','customers','staff_profiles','staff_account_attribution','management_contract_notifications'];
const table = name => `pg_temp.qa_xrenew_${name}`;
const rewrite = sql => tables.reduce((value, name) => value.replaceAll(`himoto.${name}`, table(name)), sql)
  .replaceAll('himoto.vehicle_inventory()', 'pg_temp.qa_xrenew_inventory()')
  .replaceAll('himoto.contract_vehicle_labels()', 'pg_temp.qa_xrenew_inventory()')
  .replaceAll('himoto.extend_contract_vehicle_line', 'pg_temp.qa_xrenew_extend');
const local = value => new Date(value + 7 * 3600000).toISOString().slice(0, 16);

async function main() {
  const c = await pool.connect(), checks = [];
  const db = { query(sql, args) {
    sql = rewrite(sql);
    assert(!/himoto\.(?!access_store|access_actor)/.test(sql), `Every business query must target isolated TEMP tables: ${[...sql.matchAll(/himoto\.\w+/g)].map(row=>row[0]).join(',')}`);
    return c.query(sql, args);
  } };
  const atomic = async work => {
    await c.query('SAVEPOINT action');
    try { const result = await work(); await c.query('RELEASE SAVEPOINT action'); return result; }
    catch (error) { await c.query('ROLLBACK TO SAVEPOINT action'); await c.query('RELEASE SAVEPOINT action'); throw error; }
  };
  const revisions = async () => (await db.query('SELECT o.xmin::text AS order_revision,d.xmin::text AS item_revision FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id WHERE d.id=101')).rows[0];
  const snapshot = async () => JSON.stringify((await db.query(`SELECT total,pid,draft_payload,
    (SELECT return_at FROM himoto.order_vehicle_details WHERE id=101) AS end,
    (SELECT count(*) FROM himoto.transactions) AS receipts FROM himoto.orders WHERE id=1`)).rows[0]);
  try {
    await c.query('BEGIN');
    for (const name of tables) await c.query(`CREATE TEMP TABLE qa_xrenew_${name}(LIKE himoto.${name} INCLUDING DEFAULTS) ON COMMIT DROP`);
    await c.query('ALTER TABLE pg_temp.qa_xrenew_management_contract_notifications ADD UNIQUE(event_key); ALTER TABLE pg_temp.qa_xrenew_management_contract_payments ADD UNIQUE(request_id)');
    await c.query("CREATE TEMP SEQUENCE qa_xrenew_seq START 99000; ALTER TABLE qa_xrenew_transactions ALTER COLUMN id SET DEFAULT nextval('qa_xrenew_seq')");
    await db.query(`INSERT INTO himoto.stores(id,store_name) VALUES(23,'Contract QA'),(32,'Stock QA');
      INSERT INTO himoto.orders(id,store_id,contract_number,order_status,total,pid) VALUES
        (1,23,'QA-XBRANCH','renting','400000',2400000),(2,32,'QA-FOREIGN','renting','400000',0);
      INSERT INTO himoto.vehicles(id,name,license,type,year,store_id,current_store_id,status,created_by) VALUES
        (700,'Vision QA','QA-700','xega',2026,32,32,'using',151),(701,'Wave QA','QA-701','xeso',2026,23,23,'using',151);
      INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_money,total_renewal_amount) VALUES
        (101,1,700,now()-interval '2 days',now()-interval '1 hour',400000,0),
        (102,1,700,now()-interval '2 days',now()-interval '1 hour',400000,0),
        (201,2,701,now()-interval '2 days',now()-interval '1 hour',400000,0);
      UPDATE himoto.order_vehicle_details SET completed_at=now() WHERE id=102;
      INSERT INTO himoto.transactions(id,order_id,name,type,status,value,store_id,note,user_id,created_at) VALUES
        (100,1,'order:deposit','in','approved',2000000,23,'',151,now()),(101,1,'order:rental_fees','in','approved',400000,23,'',151,now());
      INSERT INTO himoto.cash(id,store_id,name,status,opening_balance) VALUES(5,23,'Cash QA','Active',0);`);
    for (const name of tables) await c.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${table(name)} TO himoto_scoped`);
    await c.query('GRANT USAGE,SELECT ON SEQUENCE pg_temp.qa_xrenew_seq TO himoto_scoped');
    await c.query(`ALTER TABLE ${table('orders')} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY qa_scope ON ${table('orders')} TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
      ALTER TABLE ${table('vehicles')} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY qa_stock ON ${table('vehicles')} TO himoto_scoped USING(himoto.access_store(COALESCE(current_store_id,store_id))) WITH CHECK(himoto.access_store(COALESCE(current_store_id,store_id)));
      ALTER TABLE ${table('order_vehicle_details')} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY qa_read ON ${table('order_vehicle_details')} FOR SELECT TO himoto_scoped USING(EXISTS(SELECT 1 FROM ${table('orders')} o WHERE o.id=order_id));
      CREATE POLICY qa_update ON ${table('order_vehicle_details')} FOR UPDATE TO himoto_scoped USING(EXISTS(SELECT 1 FROM ${table('orders')} o WHERE o.id=order_id))
        WITH CHECK(EXISTS(SELECT 1 FROM ${table('orders')} o WHERE o.id=order_id) AND EXISTS(SELECT 1 FROM ${table('vehicles')} v WHERE v.id=vehicle_id));
      CREATE FUNCTION pg_temp.qa_xrenew_inventory() RETURNS SETOF ${table('vehicles')} LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT * FROM ${table('vehicles')}';
      REVOKE ALL ON FUNCTION pg_temp.qa_xrenew_inventory() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION pg_temp.qa_xrenew_inventory() TO himoto_scoped;`);
    const migration = fs.readFileSync(path.resolve('docs/sql/2026-10-21-cross-branch-renewals.sql'), 'utf8').replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
    await c.query(rewrite(migration));
    await c.query("SELECT set_config('himoto.actor_id','151',true),set_config('himoto.store_id','23',true),set_config('himoto.scope_all','false',true)");
    await c.query('SET LOCAL ROLE himoto_scoped');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.orders')).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.vehicles WHERE id=700')).rows[0].n, 0);
    await assert.rejects(() => atomic(() => db.query("UPDATE himoto.order_vehicle_details SET return_at=now()+interval '1 day' WHERE id=101")), error => error.code === '42501');
    checks.push('Reproduces production RLS failure: own contract is visible, foreign stock is hidden, direct rental-line UPDATE is rejected');
    await c.query('SAVEPOINT baseline');
    await db.query("INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',1,'renewal-2-document-1','image/jpeg',$1,151)",[Buffer.from([255,216,255])]);
    const input = { ...await revisions(), request_id: randomUUID(), item_id: 101, return_at: local(Date.now()+86400000), amount: '140000', note: 'QA', receipt: { method: 'cash', account_id: 5, paid_at: local(Date.now()-60000) } };
    const renew = body => dataAccess.run(scope, () => renewContractAndCollect(db, 1, 151, body));
    const paid = await atomic(() => renew(input));
    assert.equal(paid.payment.context.total_amount, 540000); assert.equal(paid.payment.context.paid_amount, 540000);
    const version = (await db.query('SELECT draft_payload FROM himoto.orders WHERE id=1')).rows[0].draft_payload.management_composer.versions[0];
    await queueContractNotification(db, 1, 'renewal', 'renewal:1:2', 151, 'renewal-2', version);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.management_contract_notifications')).rows[0].n, 1);
    assert.equal(Number((await db.query('SELECT vehicle_id,total_renewal_amount FROM himoto.order_vehicle_details WHERE id=101')).rows[0].total_renewal_amount), 140000);
    checks.push('Scoped paid renewal saves the new deadline, fee, version, linked receipt and manual Telegram preview atomically');
    const once = await snapshot(); const replay = await atomic(() => renew(input));
    assert.equal(replay.replayed, true); assert.equal(replay.payment.replayed, true); assert.equal(await snapshot(), once);
    checks.push('Repeated UUID does not extend or collect twice');
    const rev = (await revisions()).item_revision;
    for (const args of [[201,2,rev],[101,2,rev],[102,1,rev],[101,1,'0']]) {
      await assert.rejects(() => atomic(() => db.query('SELECT himoto.extend_contract_vehicle_line($1,$2,$3,now()+interval \'3 days\',1000)', args)), error => error.code === '42501');
    }
    for (const fee of [-1,10000000000000]) await assert.rejects(() => atomic(() => db.query('SELECT himoto.extend_contract_vehicle_line(101,1,$1,now()+interval \'3 days\',$2)', [rev, fee])), error => error.code === '42501');
    for (const patch of ["order_status='cancelled'", "draft_payload='{\"management_composer\":{\"installment_plan\":{}}}'::json"]) {
      await assert.rejects(() => atomic(async () => {
        await db.query(`UPDATE himoto.orders SET ${patch} WHERE id=1`);
        await db.query('SELECT himoto.extend_contract_vehicle_line(101,1,$1,now()+interval \'3 days\',0)', [rev]);
      }), error => error.code === '42501');
    }
    await assert.rejects(() => atomic(() => db.query('SELECT himoto.extend_contract_vehicle_line(101,1,$1,now()-interval \'3 days\',0)', [rev])), error => error.code === '42501');
    await assert.rejects(() => atomic(async () => {
      await c.query("SELECT set_config('himoto.actor_id','',true)");
      await db.query('SELECT himoto.extend_contract_vehicle_line(101,1,$1,now()+interval \'3 days\',0)', [rev]);
    }), error => error.code === '42501');
    assert.equal((await db.query("UPDATE himoto.vehicles SET status='ready' WHERE id=700")).rowCount, 0);
    assert.equal(await snapshot(), once);
    checks.push('Foreign contract, wrong contract/line pair, completed line, stale revision, missing actor, invalid fees/earlier dates are rejected; foreign vehicle writes stay blocked');
    await c.query('ROLLBACK TO SAVEPOINT baseline');
    await db.query("INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',1,'renewal-2-document-1','image/jpeg',$1,151)",[Buffer.from([255,216,255])]);
    const original = await snapshot();
    const failing = { query(sql, args) { if (sql.startsWith('UPDATE himoto.orders SET draft_payload=jsonb_set')) throw Error('Injected after receipt'); return db.query(sql,args); } };
    await assert.rejects(() => atomic(() => dataAccess.run(scope, () => renewContractAndCollect(failing,1,151,input))), /Injected/);
    assert.equal(await snapshot(), original);
    checks.push('Failure after receipt insertion rolls back deadline, totals, version and receipt together under branch scope');
    const unpaid = { ...input, request_id: randomUUID() }; delete unpaid.receipt;
    assert.equal((await atomic(() => renew(unpaid))).payment, undefined);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.transactions')).rows[0].n, 2);
    checks.push('Unpaid cross-branch renewal saves debt without fabricating a receipt');
    await c.query('ROLLBACK TO SAVEPOINT baseline');
    const r = await revisions();
    const legacy = await atomic(() => dataAccess.run(scope, () => recordContractPayment(db,1,151,{request_id:randomUUID(),revision:r.order_revision,amount:'140000',method:'cash',account_id:5,paid_at:input.receipt.paid_at,note:'QA',purpose:'renewal',item_id:101,item_revision:r.item_revision,return_at:input.return_at})));
    assert.equal(legacy.context.total_amount,540000); assert.equal(legacy.context.paid_amount,540000);
    checks.push('Cashbook renewal path uses the same restricted line helper for foreign stock');
    await c.query('RESET ROLE');
    assert.deepEqual((await db.query('SELECT store_id,current_store_id,status FROM himoto.vehicles WHERE id=700')).rows[0], { store_id:'32', current_store_id:'32', status:'using' });
  } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); await globalThis.himotoPool?.end(); }
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0,realTelegramRequests:0},null,2));
}
main().catch(error => { console.error(error.name,error.code||'',error.message); process.exitCode=1; });

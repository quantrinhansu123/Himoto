const assert = require('node:assert/strict'), path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { deleteDepositContract } = load(path.join(root, 'lib/server/contract-reservation-delete'));
const { requestPermission } = load(path.join(root, 'lib/server/access-request'));
const { hasPermission, ACCESS_ROLES } = load(path.join(root, 'lib/management/permissions'));
const { canEditIssuedContract } = load(path.join(root, 'lib/management/contract-profile'));
const { ownerDatabase } = load(path.join(root, 'lib/server/himoto-database'));

(async () => {
  const checks = [];
  assert.equal(requestPermission('/api/auth/order/car-rental/900/reservation', 'DELETE'), 'contracts.draft');
  assert.equal(hasPermission({ permissions: ['contracts.read'] }, 'contracts.draft'), false);
  assert(hasPermission({ permissions: [...ACCESS_ROLES.branch_staff.permissions] }, 'contracts.draft'));
  const staff = { access_role: 'branch_staff', store_id: 32, permissions: [...ACCESS_ROLES.branch_staff.permissions] };
  assert(canEditIssuedContract(staff, 32));
  assert(canEditIssuedContract(staff, 33));
  checks.push('Staff with contracts.draft may edit/delete deposit holds; reservation DELETE maps to contracts.draft');

  const c = await ownerDatabase.connect();
  const tables = ['orders', 'order_vehicle_details', 'vehicles', 'transactions', 'stores'];
  const proxy = {
    query(sql, args) {
      for (const table of tables) sql = sql.replaceAll(`himoto.${table}`, `pg_temp.qa_resdel_${table}`);
      assert(!sql.includes('himoto.'), 'All business queries must use TEMP');
      return c.query(sql, args);
    },
  };
  async function revision(id) {
    return (await c.query('SELECT xmin::text AS revision FROM qa_resdel_orders WHERE id=$1', [id])).rows[0].revision;
  }
  async function refuse(id, status, rev) {
    await c.query('SAVEPOINT refused');
    try { await assert.rejects(deleteDepositContract(proxy, id, rev ?? await revision(id), 143), (error) => error.status === status); }
    finally { await c.query('ROLLBACK TO SAVEPOINT refused'); await c.query('RELEASE SAVEPOINT refused'); }
  }
  try {
    await c.query('BEGIN');
    for (const table of tables) {
      await c.query(`CREATE TEMP TABLE qa_resdel_${table}(LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
      await c.query(`ALTER TABLE qa_resdel_${table} ALTER COLUMN id DROP DEFAULT`);
    }
    await c.query(`INSERT INTO qa_resdel_stores(id,store_name) VALUES(32,'CS QA');
      INSERT INTO qa_resdel_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES
        (501,'Xe QA','Honda','xeso',2026,32,32,'QA-501','ready',143),(502,'Xe using','Honda','xeso',2026,32,32,'QA-502','using',143);
      INSERT INTO qa_resdel_orders(id,order_status,store_id,contract_number,draft_payload) VALUES
        (900,'deposit_contract',32,'VPS-QA-900','{}'),
        (901,'renting',32,'VPS-QA-901','{}'),
        (902,'deposit_contract',32,'VPS-QA-902','{"management_composer":{"handover":{"at":"2026-10-27T01:00:00Z"}}}'),
        (903,'deposit_contract',32,'VPS-QA-903','{}'),
        (904,'deposit_contract',32,'VPS-QA-904','{}');
      INSERT INTO qa_resdel_order_vehicle_details(id,order_id,vehicle_id) VALUES(1,900,501),(2,903,502);
      INSERT INTO qa_resdel_order_vehicle_details(id,order_id,vehicle_id,completed_at) VALUES(3,904,501,now());
      INSERT INTO qa_resdel_transactions(id,order_id,name,type,value,note,status,user_id,store_id,created_at)
        VALUES(701,900,'order:deposit','in',200000,'QA','approved',143,32,now());`);

    await refuse(900, 409, '0');
    await refuse(999, 404, '1');
    await refuse(901, 409);
    await refuse(902, 409);
    await refuse(904, 409);
    checks.push('Stale/missing/renting/handed-over/completed-line deposit holds refuse deletion without changes');

    await deleteDepositContract(proxy, 900, await revision(900), 143);
    const deleted = (await c.query('SELECT deleted_at, draft_payload, order_status FROM qa_resdel_orders WHERE id=900')).rows[0];
    assert(deleted.deleted_at);
    assert.equal(deleted.order_status, 'deposit_contract');
    assert.equal(deleted.draft_payload.management_composer.deleted_reservation.actor_id, 143);
    assert.equal(deleted.draft_payload.management_composer.deleted_reservation.code, 'VPS-QA-900');
    assert.equal((await c.query('SELECT count(*)::int n FROM qa_resdel_order_vehicle_details WHERE order_id=900 AND deleted_at IS NOT NULL')).rows[0].n, 1);
    assert.equal((await c.query('SELECT count(*)::int n FROM qa_resdel_transactions WHERE order_id=900')).rows[0].n, 1);
    assert.equal((await c.query("SELECT status FROM qa_resdel_vehicles WHERE id=501")).rows[0].status, 'ready');
    checks.push('Deposit hold soft-deletes order and vehicle line, keeps cashbook receipt, leaves ready stock unchanged');

    await deleteDepositContract(proxy, 903, await revision(903), 160);
    assert.equal((await c.query("SELECT status FROM qa_resdel_vehicles WHERE id=502")).rows[0].status, 'ready');
    checks.push('Deleting a deposit hold releases a vehicle still marked using when no other open rental remains');

    await refuse(900, 404, '1');
    await c.query('ROLLBACK');
    console.log(JSON.stringify({ passed: checks.length, checks, realBusinessWrites: 0 }, null, 2));
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release();
    await globalThis.himotoPool?.end();
  }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });

const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./check-contract-payments.cjs');
const root = path.resolve(__dirname, '../src');

async function main() {
  const server = load(path.join(root, 'lib/server/contract-renewals'));
  const shared = load(path.join(root, 'lib/management/contract-renewals'));
  const checks = [];
  const base = { item_id: 101, item_revision: '1', order_revision: '2', return_at: '2026-01-20T10:00', amount: '300', note: ' QA ' };
  assert.equal(server.parseRenewalInput(base).note, 'QA');
  assert.equal(server.parseRenewalInput({ ...base, amount: '0' }).amount, '0');
  for (const patch of [{ amount: '-1' }, { amount: '1.5' }, { amount: '01' }, { amount: 300 }, { return_at: '2026-02-30T10:00' }, { return_at: '' }, { item_id: 0 }, { item_revision: '' }, { order_revision: 'x' }, { total: '1' }, { note: 'a'.repeat(2001) }]) {
    assert.throws(() => server.parseRenewalInput({ ...base, ...patch }));
  }
  const now = Date.parse('2026-01-03T12:30:00Z');
  assert.deepEqual(shared.overdueParts('2026-01-01T10:00:00Z', now), { minutes: 3030, days: 2, hours: 3 });
  assert.deepEqual(shared.overdueParts('2026-02-01T10:00:00Z', now), { minutes: 0, days: 0, hours: 0 });
  checks.push('strict renewal input (ids, revisions, Vietnam date, integer VNĐ, allowlisted fields); overdue days/hours split');

  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
    const tables = ['order_vehicle_details', 'orders', 'vehicles'];
    const proxy = { query: async (sql, params) => {
      let rewritten = sql;
      for (const table of tables) rewritten = rewritten.replaceAll(`himoto.${table}`, `pg_temp.qa_renewal_${table}`);
      assert(!rewritten.includes('himoto.'), 'All business SQL must use TEMP');
      return c.query(rewritten, params);
    } };
    const savepoint = async work => { await c.query('SAVEPOINT renewal_case'); try { const r = await work(); await c.query('RELEASE SAVEPOINT renewal_case'); return r; } catch (error) { await c.query('ROLLBACK TO SAVEPOINT renewal_case'); await c.query('RELEASE SAVEPOINT renewal_case'); throw error; } };
    const revisions = async (itemId = 101) => (await c.query('SELECT d.xmin::text AS item_revision,o.xmin::text AS order_revision FROM qa_renewal_order_vehicle_details d JOIN qa_renewal_orders o ON o.id=d.order_id WHERE d.id=$1', [itemId])).rows[0];
    const renew = async (patch = {}, orderId = 1) => {
      const fresh = await revisions(patch.item_id || 101);
      return savepoint(() => server.recordContractRenewal(proxy, orderId, 143, server.parseRenewalInput({ ...base, ...fresh, ...patch })));
    };
    try {
      await c.query('BEGIN');
      for (const table of tables) {
        await c.query(`CREATE TEMP TABLE qa_renewal_${table} (LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
        await c.query(`ALTER TABLE qa_renewal_${table} ALTER COLUMN id DROP DEFAULT`);
      }
      await c.query(`INSERT INTO qa_renewal_orders(id,contract_number,order_status,store_id,total,pid,return_at,draft_payload) VALUES
          (1,'QA-1','renting',23,'1000',400,'2026-01-10T10:00:00+07:00','{"order_items":[{"vehicle_id":100}]}'),(2,'QA-2','draft',23,'1000',0,NULL,NULL);
        INSERT INTO qa_renewal_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES(100,'Xe QA','Honda','xeso',2026,23,23,'QA-A','using',143);
        INSERT INTO qa_renewal_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_renewal_amount) VALUES
          (101,1,100,'2026-01-01T10:00:00+07:00','2026-01-10T10:00:00+07:00',0),(102,1,100,'2026-01-01T10:00:00+07:00','2026-01-10T10:00:00+07:00',0),(201,2,100,'2026-01-01T10:00:00+07:00','2026-01-10T10:00:00+07:00',0);
        UPDATE qa_renewal_order_vehicle_details SET completed_at='2026-01-09T10:00:00+07:00' WHERE id=102;`);
      const first = await renew();
      assert.equal(first.version, 2); assert.equal(first.total_amount, 1300); assert.equal(first.amount, 300);
      let order = (await c.query('SELECT total,pid,return_at,draft_payload FROM qa_renewal_orders WHERE id=1')).rows[0];
      assert.equal(order.total, '1300'); assert.equal(Number(order.pid), 400); assert.equal(order.return_at.toISOString(), '2026-01-20T03:00:00.000Z');
      assert.deepEqual(order.draft_payload.order_items, [{ vehicle_id: 100 }]);
      const v2 = order.draft_payload.management_composer.versions[0];
      assert.equal(v2.version, 2); assert.equal(v2.before_return_at, '2026-01-10T03:00:00.000Z'); assert.equal(v2.return_at, '2026-01-20T10:00:00+07:00');
      assert.equal(v2.before_total, 1000); assert.equal(v2.total, 1300); assert.equal(v2.license, 'QA-A'); assert(v2.overdue_minutes > 0);
      const item = (await c.query('SELECT return_at,total_renewal_amount FROM qa_renewal_order_vehicle_details WHERE id=101')).rows[0];
      assert.equal(item.return_at.toISOString(), '2026-01-20T03:00:00.000Z'); assert.equal(Number(item.total_renewal_amount), 300);
      checks.push('PostgreSQL TEMP: renewal moves the vehicle and contract return date, adds the fee to the contract total only (paid unchanged), keeps legacy payload and records version v2 with before/after values');
      const second = await renew({ return_at: '2026-01-25T10:00', amount: '0', note: '' });
      assert.equal(second.version, 3); assert.equal(second.total_amount, 1300);
      order = (await c.query('SELECT total,draft_payload FROM qa_renewal_orders WHERE id=1')).rows[0];
      assert.equal(order.total, '1300'); assert.equal(order.draft_payload.management_composer.versions.length, 2);
      checks.push('PostgreSQL TEMP: a second renewal appends v3; a zero fee keeps the contract total');
      const snapshot = JSON.stringify((await c.query('SELECT o.total,o.return_at,o.draft_payload,d.return_at AS item_return FROM qa_renewal_orders o JOIN qa_renewal_order_vehicle_details d ON d.order_id=o.id AND d.id=101 WHERE o.id=1')).rows[0]);
      await assert.rejects(renew({ return_at: '2026-01-24T10:00' }), e => e.status === 409);
      await assert.rejects(renew({ order_revision: '1' }), e => e.status === 409);
      await assert.rejects(renew({ item_revision: '1' }), e => e.status === 409);
      await assert.rejects(renew({ item_id: 102, return_at: '2026-02-01T10:00' }), e => e.status === 404);
      await assert.rejects(renew({ item_id: 201, return_at: '2026-02-01T10:00' }, 1), e => e.status === 404);
      await assert.rejects(renew({ item_id: 201, return_at: '2026-02-01T10:00' }, 2), e => e.status === 409);
      for (const status of ['completed', 'cancelled']) {
        await c.query('UPDATE qa_renewal_orders SET order_status=$1 WHERE id=1', [status]);
        await assert.rejects(renew({ return_at: '2026-02-01T10:00' }), e => e.status === 409);
      }
      await c.query("UPDATE qa_renewal_orders SET order_status='renting' WHERE id=1");
      assert.equal(JSON.stringify((await c.query('SELECT o.total,o.return_at,o.draft_payload,d.return_at AS item_return FROM qa_renewal_orders o JOIN qa_renewal_order_vehicle_details d ON d.order_id=o.id AND d.id=101 WHERE o.id=1')).rows[0]), snapshot);
      checks.push('PostgreSQL TEMP: earlier date, stale order/vehicle revision, returned vehicle, vehicle of another contract, draft/completed/cancelled contracts change nothing');
    } finally { await c.query('ROLLBACK'); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

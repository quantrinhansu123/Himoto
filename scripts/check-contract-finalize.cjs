const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./check-contract-payments.cjs');
const root = path.resolve(__dirname, '../src');

async function main() {
  const server = load(path.join(root, 'lib/server/contract-finalize'));
  const shared = load(path.join(root, 'lib/management/contract-finalize'));
  const checks = [];
  const paidAt = new Date(Date.now() + 7 * 3600000 - 60000).toISOString().slice(0, 16);
  const base = { revision: '1', paid_at: paidAt, deposit: { method: 'cash', account_id: 5 }, rental: null };
  assert.deepEqual(server.parseFinalizeInput(base), base);
  for (const patch of [{ revision: 'x' }, { paid_at: '2026-02-30T10:00' }, { paid_at: '2999-01-01T10:00' }, { deposit: { method: 'card', account_id: 5 } },
    { deposit: { method: 'cash', account_id: 0 } }, { deposit: { method: 'cash', account_id: 5, amount: 1 } }, { total: '1' }]) {
    assert.throws(() => server.parseFinalizeInput({ ...base, ...patch }));
  }
  assert.throws(() => server.parseFinalizeInput({ revision: '1', paid_at: paidAt, deposit: null }));
  assert.equal(shared.draftPaymentMethod('CK tk công ty, Tiền mặt'), 'company_transfer');
  assert.equal(shared.draftPaymentMethod('CK tài khoản cá nhân'), 'transfer');
  assert.equal(shared.draftPaymentMethod('Chuyển khoản'), 'transfer');
  assert.equal(shared.draftPaymentMethods('CK tài khoản công ty')[0], 'company_transfer');
  assert.equal(shared.draftPaymentMethod(''), 'transfer');
  assert.deepEqual(shared.draftPaymentMethods(''), []);
  assert.deepEqual(shared.PAYMENT_METHOD_FALLBACK, ['transfer', 'company_transfer', 'cash']);
  checks.push('strict finalize input (revision, Vietnam time not in the future, allowlisted receipt fields); draft payment labels map to methods');

  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
    const tables = ['order_vehicle_details', 'orders', 'vehicles', 'transactions', 'banks', 'cash', 'users', 'management_contract_payments', 'stores'];
    const proxy = { query: async (sql, params) => {
      let rewritten = sql;
      for (const table of tables) rewritten = rewritten.replaceAll(`himoto.${table}`, `pg_temp.qa_fin_${table}`);
      assert(!rewritten.includes('himoto.'), 'All business SQL must use TEMP');
      return c.query(rewritten, params);
    } };
    const savepoint = async work => { await c.query('SAVEPOINT fin_case'); try { const r = await work(); await c.query('RELEASE SAVEPOINT fin_case'); return r; } catch (error) { await c.query('ROLLBACK TO SAVEPOINT fin_case'); await c.query('RELEASE SAVEPOINT fin_case'); throw error; } };
    const revision = async id => (await c.query('SELECT xmin::text AS r FROM qa_fin_orders WHERE id=$1', [id])).rows[0].r;
    const finalize = async (id, patch = {}) => savepoint(async () => server.finalizeContractDraft(proxy, id, 143, { ...base, revision: await revision(id), ...patch }));
    const draft = (vehicles, extra = {}) => JSON.stringify({ management_composer: { version: 1, status: 'draft', draft: {
      start_date: '2026-10-11T08:00', end_date: '2026-10-13T08:00', unit_price: '250000', total_amount: '500000', deposit_amount: '1000000', package_name: 'Theo ngày',
      vehicles: vehicles.map(id => ({ id: String(id), driver_name: 'QA', driver_license_number: 'GPLX', driver_license_issued_on: '2020-01-02', borrow_hats: '02', borrow_raincoats: '01' })), ...extra } } });
    try {
      await c.query('BEGIN');
      for (const table of tables) {
        await c.query(`CREATE TEMP TABLE qa_fin_${table} (LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
        if (!['management_contract_payments', 'order_vehicle_details', 'transactions'].includes(table)) await c.query(`ALTER TABLE qa_fin_${table} ALTER COLUMN id DROP DEFAULT`);
      }
      await c.query('CREATE TEMP SEQUENCE qa_fin_seq START 9000');
      for (const table of ['order_vehicle_details', 'transactions']) await c.query(`ALTER TABLE qa_fin_${table} ALTER COLUMN id SET DEFAULT nextval('qa_fin_seq')`);
      const day = (await c.query(`SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') AS day`)).rows[0].day;
      await c.query(`INSERT INTO qa_fin_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES
          (100,'Xe A','Honda','xeso',2026,23,23,'QA-A','ready',143),(101,'Xe B','Honda','xeso',2026,23,23,'QA-B','ready',143),
          (102,'Xe C','Honda','xeso',2026,31,31,'QA-C','repairing',143),(103,'Xe D','Honda','xeso',2026,23,23,'QA-D','using',143);
        INSERT INTO qa_fin_cash(id,store_id,opening_balance,status) VALUES (5,23,0,'Active'),(15,31,0,'Active');
        INSERT INTO qa_fin_banks(id,store_id,bank_name,account_number,owner_name,opening_balance,account_type,status,owner_type) VALUES
          (6,23,'QA Bank','001','QA',0,2,'Active','personal'),(7,1,'QA Corp','002','HIMOTO',0,1,'Active','company');`);
      await c.query(`INSERT INTO qa_fin_orders(id,order_status,order_mode,store_id,customer_id,total,pid,draft_reference,contract_number,draft_payload) VALUES
          (1,'draft','draft',23,9,'0',0,'NHAP-1',NULL,$1),(2,'renting','standard',23,8,'100',0,NULL,'QA-OPEN',NULL),
          (3,'draft','draft',23,9,'0',0,'NHAP-3',NULL,$2),(4,'draft','draft',23,9,'0',0,'NHAP-4',NULL,$3),
          (5,'completed','standard',23,8,'0',0,NULL,$4,NULL),(6,'draft','draft',23,9,'0',0,'NHAP-6',NULL,$5)`,
        [draft([100, 101]), draft([103]), draft([102]), `${day}-0007`, draft([101], { deposit_amount: '', total_amount: '300000' })]);
      await c.query(`INSERT INTO qa_fin_order_vehicle_details(order_id,vehicle_id,rent_at,return_at) VALUES (2,103,'2026-10-01T08:00:00+07:00','2026-10-05T08:00:00+07:00')`);

      const result = await finalize(1, { rental: { method: 'transfer', account_id: 6 } });
      assert.equal(result.code, `${day}-0008`); assert.equal(result.paid_amount, 1500000); assert.equal(result.transaction_ids.length, 2);
      const order = (await c.query('SELECT * FROM qa_fin_orders WHERE id=1')).rows[0];
      assert.equal(order.order_status, 'renting'); assert.equal(order.order_mode, 'standard'); assert.equal(order.contract_number, `${day}-0008`);
      assert.equal(order.total, '500000'); assert.equal(Number(order.pid), 1500000); assert.equal(order.first_deposit_amount, 1000000);
      assert.equal(order.rent_at.toISOString(), '2026-10-11T01:00:00.000Z'); assert.equal(order.return_at.toISOString(), '2026-10-13T01:00:00.000Z');
      assert.equal(order.draft_reference, 'NHAP-1'); assert.equal(order.draft_payload.management_composer.finalized.contract_number, `${day}-0008`);
      const items = (await c.query('SELECT vehicle_id,total_money,hiring_fee,type,borrow_hats,borrow_raincoats,driver_name,completed_at FROM qa_fin_order_vehicle_details WHERE order_id=1 ORDER BY id')).rows;
      assert.deepEqual(items.map(row => [Number(row.vehicle_id), Number(row.total_money), row.hiring_fee, row.type, Number(row.borrow_hats), row.borrow_raincoats, row.driver_name, row.completed_at]),
        [[100, 500000, 250000, 'day', 2, 1, 'QA', null], [101, 0, 250000, 'day', 2, 1, 'QA', null]]);
      assert.deepEqual((await c.query('SELECT status FROM qa_fin_vehicles WHERE id IN (100,101) ORDER BY id')).rows.map(row => row.status), ['using', 'using']);
      const receipts = (await c.query('SELECT name,value,cash_id,bank_id,payment_method,bank_owner_type,store_id,user_id,status,type FROM qa_fin_transactions WHERE order_id=1 ORDER BY id')).rows;
      assert.deepEqual(receipts.map(row => [row.name, Number(row.value), row.cash_id && Number(row.cash_id), row.bank_id && Number(row.bank_id), Number(row.payment_method), row.bank_owner_type, Number(row.store_id), row.status, row.type]),
        [['order:deposit', 1000000, 5, null, 1, null, 23, 'approved', 'in'], ['order:rental_fees', 500000, null, 6, 2, 'personal', 23, 'approved', 'in']]);
      checks.push('PostgreSQL TEMP: a draft becomes Đang thuê with the next YYMMDD-NNNN number, vehicle lines, vehicles marked using, deposit + rental receipts in the cashbook and pid = collected amount');

      const before = JSON.stringify((await c.query('SELECT o.id,o.order_status,o.pid,o.contract_number,(SELECT count(*) FROM qa_fin_order_vehicle_details d WHERE d.order_id=o.id) AS lines FROM qa_fin_orders o ORDER BY o.id')).rows)
        + JSON.stringify((await c.query('SELECT count(*) FROM qa_fin_transactions')).rows) + JSON.stringify((await c.query('SELECT id,status FROM qa_fin_vehicles ORDER BY id')).rows);
      await assert.rejects(finalize(1), error => error.status === 409);
      await assert.rejects(finalize(3), error => error.status === 409 && /QA-D/.test(error.message) && /QA-OPEN/.test(error.message));
      await assert.rejects(finalize(4), error => error.status === 409 && /QA-C/.test(error.message));
      await assert.rejects(finalize(6, { revision: '1', deposit: null }), error => error.status === 409);
      await assert.rejects(finalize(6, { deposit: null, rental: { method: 'company_transfer', account_id: 6 } }), error => error.status === 409);
      await assert.rejects(finalize(6, { deposit: { method: 'cash', account_id: 15 }, rental: null }), error => error.status === 400);
      await assert.rejects(finalize(6, { deposit: null, rental: { method: 'cash', account_id: 15 } }), error => error.status === 409);
      const after = JSON.stringify((await c.query('SELECT o.id,o.order_status,o.pid,o.contract_number,(SELECT count(*) FROM qa_fin_order_vehicle_details d WHERE d.order_id=o.id) AS lines FROM qa_fin_orders o ORDER BY o.id')).rows)
        + JSON.stringify((await c.query('SELECT count(*) FROM qa_fin_transactions')).rows) + JSON.stringify((await c.query('SELECT id,status FROM qa_fin_vehicles ORDER BY id')).rows);
      assert.equal(after, before);
      checks.push('PostgreSQL TEMP: already-final contract, vehicle on another open contract, unavailable vehicle, stale revision, wrong-method or other-branch account and a deposit receipt with no deposit are rejected without any change');

      await c.query("UPDATE qa_fin_vehicles SET status='ready' WHERE id=101");
      await c.query("UPDATE qa_fin_order_vehicle_details SET completed_at=now() WHERE order_id=1 AND vehicle_id=101");
      for(const status of ['renting','wait_payment']) {
        await c.query('UPDATE qa_fin_orders SET order_status=$1 WHERE id=1',[status]);
        await c.query('SAVEPOINT returned_vehicle');
        const reuse=await finalize(6,{deposit:null,rental:null});assert.equal(reuse.status,'renting');
        await c.query('ROLLBACK TO SAVEPOINT returned_vehicle');await c.query('RELEASE SAVEPOINT returned_vehicle');
      }
      await c.query("UPDATE qa_fin_orders SET order_status='completed' WHERE id=1");
      await c.query("UPDATE qa_fin_vehicles SET status='using' WHERE id=101");
      await assert.rejects(finalize(6,{deposit:null,rental:null}),error=>error.status===409);
      await c.query("UPDATE qa_fin_vehicles SET status='ready' WHERE id=101");
      checks.push('A returned line no longer blocks ready stock even while its parent awaits settlement; a true open rental and orphan using status still block checkout');
      const later = await finalize(6, { deposit: null, rental: null });
      assert.equal(later.code, `${day}-0009`); assert.equal(later.paid_amount, 0); assert.deepEqual(later.transaction_ids, []);
      const debt = (await c.query('SELECT total,pid,created_without_collect_deposit,created_without_collect_rental_fees,first_deposit_amount FROM qa_fin_orders WHERE id=6')).rows[0];
      assert.deepEqual([debt.total, Number(debt.pid), debt.created_without_collect_deposit, debt.created_without_collect_rental_fees, debt.first_deposit_amount], ['300000', 0, false, true, null]);
      checks.push('PostgreSQL TEMP: finalizing without collecting leaves the rental fee as debt (no receipts, pid 0) and numbers continue in sequence');

      await c.query(`INSERT INTO qa_fin_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES
          (104,'Xe E','Honda','xeso',2026,23,23,'QA-E','ready',143),(105,'Xe F','Honda','xeso',2026,23,23,'QA-F','ready',143)`);
      await c.query(`INSERT INTO qa_fin_orders(id,order_status,order_mode,store_id,customer_id,total,pid,draft_reference,draft_payload) VALUES
          (7,'draft','draft',23,9,'0',0,'NHAP-7',$1),(8,'draft','draft',23,9,'0',0,'NHAP-8',$2)`, [draft([104]), draft([105])]);
      await c.query(`INSERT INTO qa_fin_order_vehicle_details(order_id,vehicle_id,rent_at,return_at,total_money) VALUES
          (7,105,'2026-10-05T08:00:00+07:00','2026-10-05T08:00:00+07:00',0),(8,104,'2026-10-05T08:00:00+07:00','2026-10-05T08:00:00+07:00',100000)`);
      const legacy = await finalize(7, { deposit: null, rental: null });
      const lines7 = (await c.query('SELECT vehicle_id,deleted_at FROM qa_fin_order_vehicle_details WHERE order_id=7 ORDER BY id')).rows;
      assert.deepEqual(lines7.map(row => [Number(row.vehicle_id), row.deleted_at !== null]), [[105, true], [104, false]]);
      assert.equal((await c.query('SELECT draft_payload FROM qa_fin_orders WHERE id=7')).rows[0].draft_payload.management_composer.finalized.retired_legacy_item_ids.length, 1);
      assert.equal(legacy.code, `${day}-0010`);
      await assert.rejects(finalize(8, { deposit: null, rental: null }), error => error.status === 409 && /hệ thống cũ/.test(error.message));
      assert.equal((await c.query('SELECT order_status FROM qa_fin_orders WHERE id=8')).rows[0].order_status, 'draft');
      checks.push('PostgreSQL TEMP: an empty legacy placeholder line is soft-deleted and replaced by the draft vehicles; a legacy line with money still blocks finalizing without change');

      const bulk = load(path.join(root, 'lib/server/bulk-delete'));
      const remove = (kind, ids) => savepoint(() => bulk.bulkDelete(proxy, kind, bulk.parseBulkDelete(kind, { ids }).ids));
      for (const bad of [{}, { ids: [] }, { ids: [0] }, { ids: [8, 8] }, { ids: ['8'] }, { ids: Array.from({ length: 501 }, (_, i) => i + 1) }]) {
        assert.throws(() => bulk.parseBulkDelete('contracts', bad), error => error.status === 400);
      }
      assert.throws(() => bulk.parseBulkDelete('users', { ids: [1] }), error => error.status === 404);
      const vehicleStatus = async id => (await c.query('SELECT status FROM qa_fin_vehicles WHERE id=$1', [id])).rows[0].status;
      const receiptCount = async () => (await c.query('SELECT count(*)::int AS n FROM qa_fin_transactions')).rows[0].n;
      const receiptsBefore = await receiptCount();
      await assert.rejects(remove('contracts', [8, 404]), error => error.status === 409);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM qa_fin_orders WHERE deleted_at IS NOT NULL')).rows[0].n, 0);
      assert.equal(await vehicleStatus(104), 'using');
      assert.deepEqual(await remove('contracts', [8]), [8]);
      assert.notEqual((await c.query('SELECT deleted_at FROM qa_fin_orders WHERE id=8')).rows[0].deleted_at, null);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM qa_fin_order_vehicle_details WHERE order_id=8 AND deleted_at IS NULL')).rows[0].n, 0);
      assert.equal(await vehicleStatus(104), 'using');
      await assert.rejects(remove('contracts', [8]), error => error.status === 409);
      assert.deepEqual(await remove('contracts', [1, 7]), [1, 7]);
      assert.deepEqual([await vehicleStatus(100), await vehicleStatus(101), await vehicleStatus(104), await vehicleStatus(103)], ['ready', 'using', 'ready', 'using']);
      assert.equal(await receiptCount(), receiptsBefore);
      checks.push('PostgreSQL TEMP: bulk contract delete is soft (orders + vehicle lines), all-or-nothing on missing/already-deleted ids, works on finalized contracts with receipts (receipts stay), and frees vehicles only when no other open contract still holds them');

      const rental = (await c.query("SELECT id FROM qa_fin_transactions WHERE order_id=1 AND name='order:rental_fees'")).rows[0].id;
      await c.query("UPDATE qa_fin_orders SET pid=200000,total='500000' WHERE id=6");
      const renewal = (await c.query(`INSERT INTO qa_fin_transactions(order_id,name,type,value,note,status,user_id,store_id) VALUES (6,'order:renewal','in',200000,'QA','approved',143,23) RETURNING id`)).rows[0].id;
      await c.query(`INSERT INTO qa_fin_management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash) VALUES (gen_random_uuid(),6,$1,143,repeat('a',64))`, [renewal]);
      await assert.rejects(remove('transactions', [Number(rental), 999999]), error => error.status === 409);
      assert.equal(Number((await c.query('SELECT pid FROM qa_fin_orders WHERE id=1')).rows[0].pid), 1500000);
      assert.deepEqual(await remove('transactions', [Number(rental), Number(renewal)]), [Number(rental), Number(renewal)]);
      const [o1, o6] = (await c.query('SELECT total,pid FROM qa_fin_orders WHERE id IN (1,6) ORDER BY id')).rows;
      assert.deepEqual([o1.total, Number(o1.pid), o6.total, Number(o6.pid)], ['500000', 1000000, '300000', 0]);
      assert.equal(await receiptCount(), receiptsBefore - 1);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM qa_fin_management_contract_payments')).rows[0].n, 0);
      checks.push('PostgreSQL TEMP: bulk voucher delete is hard and all-or-nothing; it takes receipts back out of the contract pid (and out of total for renewal/extra) and drops the payment-ledger rows');
      await c.query(`INSERT INTO qa_fin_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES
        (106,'Paper QA','Honda','xeso',2026,23,23,'QA-PAPER','ready',143),(107,'Auto QA','Honda','xeso',2026,23,23,'QA-AUTO','ready',143)`);
      await c.query(`INSERT INTO qa_fin_orders(id,order_status,order_mode,store_id,customer_id,total,pid,draft_reference,draft_payload) VALUES
        (20,'draft','draft',23,9,'0',0,'000867',$1),(21,'draft','draft',23,9,'0',0,'NHAP-21',$2),(22,'draft','draft',23,9,'0',0,'EXCEL-22',$3)`,
        [draft([106],{contract_number:'000867'}),draft([107],{contract_number:'000867'}),draft([107],{contract_number:'EXCEL-22'})]);
      const paper=await finalize(20,{rental:null});assert.equal(paper.code,'000867');
      const issuedPaper=(await c.query('SELECT contract_number,draft_payload FROM qa_fin_orders WHERE id=20')).rows[0];
      assert.equal(issuedPaper.contract_number,'000867');assert.equal(issuedPaper.draft_payload.management_composer.draft.contract_number,'000867');
      assert((await c.query('SELECT note FROM qa_fin_transactions WHERE order_id=20')).rows.every(row=>row.note.includes('000867')));
      const moneyBefore=Number((await c.query('SELECT count(*) AS n FROM qa_fin_transactions')).rows[0].n);
      await assert.rejects(finalize(21,{deposit:null,rental:null}),error=>error.status===409&&/Số hợp đồng đã được sử dụng/.test(error.message));
      assert.equal(Number((await c.query('SELECT count(*) AS n FROM qa_fin_transactions')).rows[0].n),moneyBefore);
      await c.query('UPDATE qa_fin_orders SET draft_reference=$1 WHERE id=21',[`${day}-0011`]);
      const auto=await finalize(22,{deposit:null,rental:null});assert.equal(auto.code,`${day}-0012`);
      checks.push('PostgreSQL TEMP: paper numbers retain leading zeros in issued contracts, snapshots and receipts; duplicate numbers change no money; automatic numbering skips a number reserved by another draft');
    } finally { await c.query('ROLLBACK'); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.exit());

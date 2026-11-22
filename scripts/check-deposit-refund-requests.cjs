const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { NextRequest } = require('next/server');
const sharp = require('sharp');
const { load, root } = require('./lib/load-typescript.cjs');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

const { ownerDatabase, himotoPool } = load(path.join(root, 'lib/server/himoto-database'));
const {
  submitDepositRefund, decideDepositRefund, readDepositRefundState, readDepositRefundEvidence, listDepositRefundRequests,
} = load(path.join(root, 'lib/server/deposit-refunds'));
const { notificationPayload, contractNotificationText } = load(path.join(root, 'lib/server/contract-notification-content'));
const { correctReturn, readReturnCorrection } = load(path.join(root, 'lib/server/return-corrections'));
const schema = `qa_refund_requests_${process.pid}`;
const staff = { id: 143, access_role: 'branch_staff', permissions: ['contracts.return'], store_id: 23, scope_all: false };
const finance = { id: 144, access_role: 'accounting', permissions: ['finance.write'], store_id: null, scope_all: true };
const evidence = Buffer.from('synthetic evidence, no customer image');

async function main() {
  const client = await ownerDatabase.connect();
  const sqlForQa = sql => sql.replaceAll('himoto.', schema + '.').replaceAll(schema + '.access_order_store(', 'himoto.access_order_store(');
  const db = { query: (sql, values) => client.query(sqlForQa(sql), values) };
  const predicate = status => error => error.status === status;
  const transactionCount = async orderId => Number((await db.query("SELECT count(*) n FROM himoto.transactions WHERE order_id=$1 AND type='out'", [orderId])).rows[0].n);
  async function ledger(orderId) {
    return (await db.query("SELECT id,status,value,cash_id,order_item_id,user_id FROM himoto.transactions WHERE order_id=$1 AND type='out' ORDER BY id", [orderId])).rows;
  }
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    for (const table of ['orders','customers','stores','users','vehicles','order_vehicle_details','transactions','banks','cash',
      'management_contract_payments','management_contract_notifications','management_record_photos','management_contract_vehicle_swaps','management_mobile_requests',
      'staff_profiles','management_shift_reports','battery_contracts']) {
      await client.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING INDEXES)`);
    }
    await db.query(`CREATE SEQUENCE himoto.qa_transaction_ids START 10000;
      ALTER TABLE himoto.transactions ALTER COLUMN id SET DEFAULT nextval('himoto.qa_transaction_ids');
      CREATE VIEW himoto.staff_account_attribution AS SELECT id,user_id,full_name,store_id FROM himoto.staff_profiles;
      CREATE FUNCTION himoto.contract_vehicles_for_orders(order_ids bigint[]) RETURNS SETOF himoto.vehicles
        LANGUAGE sql STABLE AS 'SELECT v.* FROM himoto.vehicles v WHERE EXISTS (
          SELECT 1 FROM himoto.order_vehicle_details d WHERE d.order_id=ANY(order_ids) AND d.vehicle_id=v.id)';
      INSERT INTO himoto.stores(id,store_name) VALUES(23,'QA Branch'),(31,'QA Other');
      INSERT INTO himoto.users(id,name,email,password,role_id) VALUES
        (143,'QA Branch Staff','refund-staff@example.invalid','unused',1),(144,'QA Finance','refund-finance@example.invalid','unused',1);
      INSERT INTO himoto.vehicles(id,name,brand,type,year,store_id,current_store_id,license,color,status,odometer,created_by)
        VALUES(101,'QA Bike','Honda','xeso',2024,23,23,'QA-101','Black','using',0,143);
      INSERT INTO himoto.orders(id,contract_number,store_id,order_status,total,pid,total_rental_fees,first_deposit_amount,draft_payload)
        VALUES(1,'QA-OPEN',23,'completed','150000',2150000,150000,2000000,'{}'),
          (2,'QA-CLOSED',23,'completed','150000',2150000,150000,2000000,'{}'),
          (3,'QA-OTHER-BRANCH',31,'completed','150000',2150000,150000,2000000,'{}');
      INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,completed_at,type,hiring_fee)
        SELECT id+1000,id,101,now()-interval '2 days',now(),now()-interval '1 min','day',150000 FROM himoto.orders;
      INSERT INTO himoto.cash(id,store_id,name,opening_balance,status) VALUES(99,23,'Két QA',0,'Active'),(98,31,'Két cơ sở khác',0,'Active');
      INSERT INTO himoto.transactions(id,order_id,name,type,status,value,store_id,cash_id,payment_method,note,user_id)
        SELECT id+100,id,'order:deposit','in','approved',2000000,store_id,NULL,1,'QA deposit',143 FROM himoto.orders;`);
    const migration = fs.readFileSync('docs/sql/2026-11-22-deposit-refund-requests.sql', 'utf8').replace(/^BEGIN;|^COMMIT;/gm, '');
    await db.query(migration);
    await db.query(migration);
    const { today, paid_at: paidAt } = (await db.query(`SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text today,
      to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD"T"HH24:MI') paid_at`)).rows[0];
    const input = { id: randomUUID(), item_id: 1001, amount: '2000000', method: 'cash', account_id: 99,
      paid_at: paidAt, reason: 'QA cash disbursed', evidence, replaces_id: null, replaces_revision: null };
    await db.query("INSERT INTO himoto.management_shift_reports(id,store_id,report_date,payload,created_by,status) VALUES(1,23,$1,'{\"report_type\":\"mid_shift\"}',143,'submitted')", [today]);
    await assert.rejects(() => submitDepositRefund(db, { ...staff, store_id: 31 }, input), predicate(404));
    await assert.rejects(() => submitDepositRefund(db, staff, { ...input, account_id: 98 }), predicate(409));
    await assert.rejects(() => submitDepositRefund(db, staff, { ...input, amount: '2000001' }), predicate(409));
    const posted = await submitDepositRefund(db, staff, input);
    assert.equal(posted.status, 'posted');
    assert.equal((await ledger(1))[0].user_id, '143');
    assert.deepEqual(await submitDepositRefund(db, staff, input), posted);
    await assert.rejects(() => submitDepositRefund(db, staff, { ...input, id: randomUUID() }), predicate(409));
    assert.equal(await transactionCount(1), 1);
    assert.deepEqual(await readDepositRefundEvidence(db, staff, input.id), evidence);
    await assert.rejects(() => readDepositRefundEvidence(db, { ...staff, store_id: 31 }, input.id), predicate(404));
    assert.equal((await readDepositRefundState(db, staff, 1001)).held, 0);
    const preview = async (order, item) => contractNotificationText('return', await notificationPayload(db, order, 'return', 143, [`return-${item}`]));
    assert.match(await preview(1, 1001), /Hoàn cọc: 2\.000\.000[\s\S]*Tiền mặt/);

    await db.query("UPDATE himoto.management_shift_reports SET status='draft',submitted_at=now(),payload='{\"report_type\":\"end_shift\"}'");
    const closed = { ...input, id: randomUUID(), item_id: 1002 };
    assert.equal((await submitDepositRefund(db, staff, closed)).status, 'pending');
    assert.equal(await transactionCount(2), 0);
    assert.match(await preview(2, 1002), /Hoàn cọc: 0/);
    await assert.rejects(() => submitDepositRefund(db, staff, { ...closed, id: randomUUID() }), predicate(409));
    await assert.rejects(() => listDepositRefundRequests(db, staff, 1), predicate(403));
    assert.equal((await listDepositRefundRequests(db, { ...finance, scope_all: false, store_id: 31 }, 1)).rows.length, 0);
    assert.deepEqual((await listDepositRefundRequests(db, finance, 1)).rows.map(row => row.id), [closed.id]);
    await assert.rejects(() => decideDepositRefund(db, { ...finance, id: staff.id }, closed.id, 'approve', ''), predicate(403));
    const approved = await decideDepositRefund(db, finance, closed.id, 'approve', 'Đã đối chiếu');
    assert.equal(approved.status, 'approved');
    assert.deepEqual(await decideDepositRefund(db, finance, closed.id, 'approve', ''), approved);
    assert.equal(await transactionCount(2), 1);
    assert.match(await preview(2, 1002), /Hoàn cọc: 2\.000\.000/);

    const original = (await readDepositRefundState(db, staff, 1001)).vouchers[0];
    const replace = { ...input, id: randomUUID(), amount: '1700000', replaces_id: original.id, replaces_revision: original.revision };
    assert.equal((await submitDepositRefund(db, staff, replace)).status, 'pending');
    const rejected = await decideDepositRefund(db, finance, replace.id, 'reject', 'Chứng từ cần bổ sung');
    assert.equal(rejected.review_note, 'Chứng từ cần bổ sung');
    assert.equal((await ledger(1))[0].status, 'approved');
    const resubmission = { ...replace, id: randomUUID() };
    await submitDepositRefund(db, staff, resubmission);
    await decideDepositRefund(db, finance, resubmission.id, 'approve', '');
    assert.deepEqual((await ledger(1)).map(row => [row.status, row.value, row.order_item_id]), [
      ['cancelled', '2000000', '1001'], ['approved', '1700000', '1001'],
    ]);
    assert.match(await preview(1, 1001), /Hoàn cọc: 1\.700\.000/);
    assert.equal((await readDepositRefundState(db, staff, 1001)).held, 300000);

    const correction = await readReturnCorrection(db, 1001);
    const legacyEdit = { item_id: 1001, revision: correction.revision, request_id: randomUUID(), reason: '', note: '',
      items: [{ item_id: 1001, item_revision: correction.lines[0].item_revision, returned_at: paidAt,
        hourly_rate: '20000', fee_override: '0', repair_fee: '0', early_discount: '0' }],
      settlement: { order_id: 1, revision: correction.settlement.revision, receipts: [],
        refund: { request_id: randomUUID(), amount: '300000', method: 'cash', account_id: 99, paid_at: paidAt } } };
    await assert.rejects(() => correctReturn(db, staff.id, legacyEdit, { useDepositRefundWorkflow: true }), predicate(409));
    assert.equal(await transactionCount(1), 2);
    console.log('Pass: scoped evidence, open and closed shift, duplicate prevention, queue permissions, review, replacement, Telegram and web edit guard (rolled back).');

    const descriptor = Object.getOwnPropertyDescriptor(himotoPool, 'connect');
    Object.defineProperty(himotoPool, 'connect', { configurable: true, value: async () => ({
      query: (sql, values) => db.query(
        /^BEGIN/.test(sql) ? 'SAVEPOINT mobile_refund' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT mobile_refund'
          : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT mobile_refund; RELEASE SAVEPOINT mobile_refund' : sql, values),
      release() {},
    }) });
    try {
      const mobile = load(path.join(root, 'lib/server/mobile-deposit-refunds'));
      const recovery = load(path.join(root, 'lib/server/mobile-write-recovery'));
      const dto = load(path.resolve('shared/deposit-refunds'));
      const actor = { ...staff, store_id: 31, permissions: ['contracts.read', 'contracts.return'] };
      const jpeg = await sharp({ create: { width: 4,height: 4,channels: 3,background: '#f2f2f2' } }).jpeg().toBuffer();
      const formRequest = (key, overrides = {}) => {
        const body = new FormData();
        for (const [name,value] of Object.entries({ id:key,item_id:'1003',amount:'2000000',method:'cash',account_id:'98',paid_at:paidAt,reason:'Synthetic app receipt', ...overrides })) body.set(name,value);
        body.set('evidence',new Blob([jpeg],{type:'image/jpeg'}),'qa.jpg');
        return new NextRequest('https://qa.invalid/api/mobile/v1/contracts/3/deposit-refunds/1003',{method:'POST',headers:{'Idempotency-Key':key},body});
      };
      const json = (body,method='PATCH') => new NextRequest('https://qa.invalid/api/mobile/v1/deposit-refunds',{
        method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      });
      const initial = await mobile.mobileDepositRefundState(actor,'3','1003');
      assert(dto.isDepositRefundState(initial));assert.equal(initial.held,2000000);
      await assert.rejects(() => mobile.mobileDepositRefundState(actor,'2','1003'),predicate(404));
      const cancelledKey=randomUUID();
      assert.equal((await recovery.resolveMobileWrite(actor,cancelledKey,json({operation:'return.refund:3'},'POST'))).status,'cancelled');
      await assert.rejects(() => mobile.saveMobileDepositRefund(actor,'3','1003',formRequest(cancelledKey)),error=>error.code==='REQUEST_CANCELLED');
      const key = randomUUID();
      const saved = await mobile.saveMobileDepositRefund(actor,'3','1003',formRequest(key));
      assert(dto.isDepositRefundRequest(saved));assert.equal(saved.status,'posted');
      assert.deepEqual(await mobile.saveMobileDepositRefund(actor,'3','1003',formRequest(key)),saved);
      assert.equal(await transactionCount(3),1);
      assert.equal((await recovery.resolveMobileWrite(actor,key,json({operation:'return.refund:3'},'POST'))).status,'committed');
      await assert.rejects(() => mobile.mobileDepositRefundRequest({...actor,store_id:23},key,new URLSearchParams('evidence=1')),predicate(404));
      assert((await mobile.mobileDepositRefundRequest(actor,key,new URLSearchParams('evidence=1'))).evidence.length > 0);
      const refundVoucher=(await mobile.mobileDepositRefundState(actor,'3','1003')).vouchers[0];
      const replacementKey=randomUUID();
      const pending=await mobile.saveMobileDepositRefund(actor,'3','1003',formRequest(replacementKey,{amount:'1800000',
        replaces_id:String(refundVoucher.id),replaces_revision:refundVoucher.revision}));
      assert.equal(pending.status,'pending');assert.equal(await transactionCount(3),1);
      assert.deepEqual((await mobile.mobileDepositRefundQueue(finance,new URLSearchParams())).rows.map(row=>row.id),[replacementKey]);
      await assert.rejects(() => mobile.decideMobileDepositRefund({...finance,id:actor.id},replacementKey,json({decision:'approve'})),predicate(403));
      const final=await mobile.decideMobileDepositRefund(finance,replacementKey,json({decision:'approve'}));
      assert.equal(final.status,'approved');
      assert.match(await preview(3,1003),/Hoàn cọc: 1\.800\.000/);
      assert.equal((await ledger(3)).filter(row=>row.status==='approved').length,1);
      console.log('Pass: app multipart proof, order binding, write recovery, replay, branch scoping and finance replacement on the same vouchers (rolled back).');
    } finally {
      if (descriptor) Object.defineProperty(himotoPool,'connect',descriptor);
      else delete himotoPool.connect;
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await globalThis.himotoPool?.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const path = require('node:path');
const { NextRequest } = require('next/server');
const { load, root } = require('./lib/load-typescript.cjs');

async function main() {
  const pglitePath = process.argv[2] || '@electric-sql/pglite';
  const { PGlite } = require(pglitePath.startsWith('.') ? path.resolve(pglitePath) : pglitePath);
  const db = new PGlite();
  const { himotoPool } = load(path.join(root, 'lib/server/himoto-database'));
  const tableReader = load(path.join(root, 'lib/server/management-table'));
  const originalConnect = Object.getOwnPropertyDescriptor(himotoPool, 'connect');
  const originalRead = tableReader.readManagementTable;
  const loadShared = name => load(path.resolve('shared', name));
  const { isCollectionReport, isCollectionFollowupView } = loadShared('collection-report');
  const { isSePayReceiptEvents } = loadShared('sepay-events');
  const { isMobileFileExport } = loadShared('mobile-export');
  try {
    await db.exec(`
      CREATE SCHEMA himoto;
      CREATE TABLE himoto.stores (id bigint PRIMARY KEY, store_name text);
      CREATE TABLE himoto.orders (id bigint PRIMARY KEY, store_id bigint, contract_number text, draft_reference text,
        customer_id bigint, draft_payload json, deleted_at timestamptz);
      CREATE TABLE himoto.customers (id bigint PRIMARY KEY, status int, warning boolean);
      CREATE TABLE himoto.order_vehicle_details (order_id bigint, vehicle_id bigint, deleted_at timestamptz, completed_at timestamptz);
      CREATE TABLE himoto.vehicles (id bigint PRIMARY KEY);
      CREATE TABLE himoto.gps_devices (id bigint, vehicle_id bigint, source_account_id bigint, provider_status text,
        management_status text, heartbeat_at timestamptz, provider_reported_at timestamptz, position_recorded_at timestamptz,
        last_ignition int, last_latitude float8, last_longitude float8, provider text, sync_received_at timestamptz);
      CREATE TABLE himoto.management_gps_accounts (id bigint, last_success_at timestamptz);
      CREATE TABLE himoto.management_collection_followups (order_id bigint PRIMARY KEY, store_id bigint, contact_status text,
        handling_status text, customer_condition text, notes text, updated_by bigint, revision int NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE himoto.management_collection_history (order_id bigint, store_id bigint, snapshot jsonb, updated_by bigint);
      CREATE TABLE himoto.management_report_deliveries (delivery_key text PRIMARY KEY, store_id bigint, route text,
        text text, attachments jsonb, status text DEFAULT 'pending', message_id bigint);
      CREATE TABLE himoto.management_sepay_events (id bigint, order_id bigint, mode text, status text, amount bigint, received_at timestamptz);
      INSERT INTO himoto.stores VALUES (23,'PGD QA A'),(31,'PGD QA B');
      INSERT INTO himoto.customers VALUES (1,2,false);
      INSERT INTO himoto.orders VALUES (1,23,'QA-01',NULL,1,'{}',NULL),(2,31,'QA-02',NULL,1,'{}',NULL),
        (3,23,'QA-03',NULL,1,'{}',now());
      INSERT INTO himoto.vehicles VALUES (8);
      INSERT INTO himoto.order_vehicle_details VALUES (1,8,NULL,NULL);
      INSERT INTO himoto.gps_devices(id,vehicle_id,management_status,sync_received_at) VALUES (1,8,'online',now());
      INSERT INTO himoto.management_sepay_events VALUES (1,1,'live','matched',100000,now()),(2,1,'live','unmatched',120000,now()),
        (3,2,'test','simulated',125000,now()),(4,3,'live','matched',130000,now()),(5,NULL,'test','simulated',90000,now());
    `);
    Object.defineProperty(himotoPool, 'connect', {
      configurable: true,
      value: async () => ({ query: (sql, values) => db.query(sql, values), release() {} }),
    });
    // Keep catalogue pagination out of this fixture. Row metadata, edits, preview, export and outbox use the real readers/writers.
    tableReader.readManagementTable = async (_client, kind, params) => {
      assert.equal(kind, 'contracts');
      assert.equal(params.get('scope'), 'collection');
      assert.equal(params.get('store'), '23');
      return { rows: [{ id: 1, code: 'QA-01', status: 'overdue', customer_name: 'QA Customer', customer_phone: '0000000000',
        store_id: 23, store_name: 'PGD QA A', license: 'QA-08', overdue_days: 3, rental_debt_amount: 100000, overdue_fee_estimate: 2000 }] };
    };
    const report = load(path.join(root, 'lib/server/mobile-collection-report'));
    const manager = { id: 202, access_role: 'admin', store_id: null, scope_all: true, permissions: ['contracts.read', 'contracts.draft'] };
    const reader = { id: 321, access_role: 'branch_staff', store_id: 23, scope_all: false, permissions: ['contracts.read'] };
    const params = new URLSearchParams('store=23');
    const body = (value, method = 'PATCH') => new NextRequest('https://qa.invalid/api/mobile/v1/collection-report', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    const initial = await report.readMobileCollectionReport(manager, params);
    assert(isCollectionReport(initial));
    assert.equal(initial.rows[0].followup.updated_at, undefined);
    assert.deepEqual(initial.rows[0].gps, ['online']);
    await assert.rejects(async () => report.readMobileCollectionReport(reader, new URLSearchParams('store=31')), error => error.status === 403);
    const initialNote = await report.readMobileCollectionFollowup(manager, '1');
    assert(isCollectionFollowupView(initialNote));
    const note = { ...initialNote.followup, order_id: 1, contact_status: 'promised', notes: 'QA promised to pay' };
    await assert.rejects(() => report.saveMobileCollectionFollowup(reader, '1', body(note)), error => error.status === 403);
    await assert.rejects(() => report.saveMobileCollectionFollowup(manager, '2', body(note)), error => error.status === 400);
    assert.deepEqual(await report.saveMobileCollectionFollowup(manager, '1', body(note)), { revision: 1 });
    await assert.rejects(() => report.saveMobileCollectionFollowup(manager, '1', body(note)), error => error.status === 409);
    assert.equal(Number((await db.query('SELECT count(*) n FROM himoto.management_collection_history')).rows[0].n), 1);
    const current = await report.readMobileCollectionReport(manager, params);
    assert(isCollectionReport(current));
    assert.match(current.messages[0], /QA promised to pay/);
    assert.notEqual(current.hash, initial.hash);
    const exportFile = await report.exportMobileCollectionReport(manager, new URLSearchParams('store=23&search=promised'));
    assert(isMobileFileExport(exportFile));
    assert.equal(exportFile.filename, 'himoto-no-cham.xlsx');
    assert.equal(exportFile.rowCount, 1);
    const send = hash => report.sendMobileCollectionReport(manager, body({ store_id: 23, hash }, 'POST'));
    await assert.rejects(() => send(initial.hash), error => error.status === 409);
    const keys = await send(current.hash);
    assert.deepEqual(await send(current.hash), keys);
    assert.equal(Number((await db.query('SELECT count(*) n FROM himoto.management_report_deliveries')).rows[0].n), 1);
    assert.deepEqual((await report.readMobileCollectionReport(manager, params)).deliveries.map(row => row.status), ['pending']);

    const { readSePayReceiptEvents } = load(path.join(root, 'lib/server/sepay-events'));
    const receipts = await readSePayReceiptEvents(db, '0');
    assert(isSePayReceiptEvents(receipts));
    assert.deepEqual(receipts.map(row => row.id), [3, 1]);
    assert.deepEqual((await readSePayReceiptEvents(db, '1')).map(row => row.id), [3]);
    console.log('Pass: app collection reads, legacy notes, branch/grant checks, CAS, Excel, same-preview outbox replay and SePay receipt filtering. No network or Telegram sends.');
  } finally {
    tableReader.readManagementTable = originalRead;
    Object.defineProperty(himotoPool, 'connect', originalConnect);
    await db.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

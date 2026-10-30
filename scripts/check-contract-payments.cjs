const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  filename=path.normalize(filename);
  if (filename.endsWith('.json')) return JSON.parse(fs.readFileSync(filename,'utf8'));
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(localRequire, module, module.exports);
  return module.exports;
}
async function main() {
  const server = load(path.join(root, 'lib/server/contract-payments'));
  const shared = load(path.join(root, 'lib/management/contract-payments'));
  const checks = [];
  const qr=load(path.join(root,'lib/management/transfer-qr'));
  assert.equal(qr.bankBin('VietinBank'),'970415');assert.equal(qr.bankBin('MB Bank'),'970422');assert.equal(qr.bankBin('VP Bank'),'970432');assert.equal(qr.bankBin('unverified bank'),undefined);
  const qrAccount={id:3,kind:'bank',store_id:0,owner_type:'company',bank_name:'VietinBank',account_number:'000000000000',owner_name:'QA ONLY'};
  const qrInput={amount:'1000000',note:'Gia hạn hợp đồng_#19074'};
  const generated=qr.transferQr(qrAccount,qrInput,'#19074'),qrUrl=new URL(generated.url);
  assert.equal(qrUrl.origin,'https://img.vietqr.io');assert.equal(qrUrl.pathname,'/image/970415-000000000000-qr_only.png');assert.equal(qrUrl.searchParams.get('amount'),'1000000');assert.equal(qrUrl.searchParams.get('addInfo'),'Gia han hop dong 19074');assert.equal(qrUrl.searchParams.get('accountName'),'QA ONLY');
  for(const account of [{...qrAccount,bank_name:'unknown'},{...qrAccount,account_number:'../evil'},{...qrAccount,owner_name:''}])assert.throws(()=>qr.transferQr(account,qrInput,'#19074'));
  for(const input of [{...qrInput,amount:'1.000'},{...qrInput,amount:'0'},{...qrInput,note:'a'.repeat(51)}])assert.throws(()=>qr.transferQr(qrAccount,input,'#19074'));
  checks.push('VietQR: verified bank aliases, exact receiving account/amount/content, safe URL encoding; missing/unknown account and unsupported amounts/content blocked');
  const base = { request_id: randomUUID(), revision: '123', amount: '300', method: 'cash', account_id: 1, paid_at: '2026-01-01T10:01', note: ' QA ' };
  assert.equal(server.parseContractPayment(base).note, 'QA');
  assert.equal(server.parseContractPayment({ ...base, renewal_version: 2 }).renewal_version, 2);
  for (const patch of [{ renewal_version: 1 }, { renewal_version: '2' }, { renewal_version: 2, purpose: 'extra' }, { renewal_version: 2, purpose: 'renewal' }]) assert.throws(() => server.parseContractPayment({ ...base, ...patch }));
  for (const patch of [{ amount: '0' }, { amount: '-1' }, { amount: '1.2' }, { amount: '1e3' }, { amount: 300 }, { amount: '10000000000000' }, { revision: '' }, { request_id: 'anything' }, { method: 'split' }, { account_id: '1' }, { account_id: -1 }, { paid_at: '2026-02-30T12:00' }, { paid_at: '2099-01-01T10:00' }, { pid: '999' }, { user_id: 1 }, { note: 'a'.repeat(2001) }]) assert.throws(() => server.parseContractPayment({ ...base, ...patch }));
  for (const input of [null, [], {}, 'cash']) assert.throws(() => server.parseContractPayment(input));
  const renewalInput = { ...base,purpose:'renewal',item_id:101,item_revision:'1',return_at:'2026-01-20T10:01' };
  assert.equal(server.parseContractPayment(renewalInput).purpose,'renewal');
  for (const patch of [{ purpose:'advance' },{ item_id:0 },{ item_revision:'' },{ return_at:'2026-02-30T10:01' },{ return_at:'' }]) assert.throws(() => server.parseContractPayment({...renewalInput,...patch}));
  assert.throws(() => server.parseContractPayment({...base,item_id:101}));
  assert.equal(server.parseContractPayment({ ...base, purpose: 'extra' }).purpose, 'extra');
  for (const note of ['', '  ', 'x']) assert.equal(server.parseContractPayment({...base,purpose:'extra',note}).note,note.trim());
  for (const patch of [{ item_id: 101 }, { return_at: '2026-01-20T10:01' }]) assert.throws(() => server.parseContractPayment({ ...base, purpose: 'extra', ...patch }));
  assert.equal(shared.canAddExtraReceipt('completed'), true); assert.equal(shared.canAddExtraReceipt('draft'), false); assert.equal(shared.canAddExtraReceipt('cancelled'), false);
  checks.push('strict positive integer money, UUID, revision, Vietnam dates and allowlisted fields; actor and totals cannot be supplied');

  const context = { id: 1, code: 'QA', revision: '123', status: 'renting', store_id: 23, total_amount: 1000, paid_amount: 300, remaining: 700, company_paid_amount: 0, company_payment_count: 0, history: [],items:[],end_date:null, accounts: [
    { id: 1, kind: 'cash', store_id: 23, owner_type: '' }, { id: 2, kind: 'cash', store_id: 31, owner_type: '' },
    { id: 1, kind: 'bank', store_id: 23, owner_type: 'unknown' }, { id: 2, kind: 'bank', store_id: 31, owner_type: 'personal' }, { id: 3, kind: 'bank', store_id: 31, owner_type: 'company' },
    { id: 4, kind: 'bank', store_id: 23, owner_type: 'company' }, { id: 5, kind: 'bank', store_id: 0, owner_type: 'company' },
  ] };
  assert.deepEqual(shared.paymentAccounts(context, 'cash').map(a => a.id), [1]);
  assert.deepEqual(shared.paymentAccounts(context, 'transfer').map(a => a.id), [1]);
  assert.deepEqual(shared.paymentAccounts(context, 'company_transfer').map(a => a.id), [3, 4, 5]);
  assert.equal(shared.vietnamPaymentTime(new Date('2026-01-01T20:30:00Z')), '2026-01-02T03:30');
  checks.push('cash and ordinary transfers scoped by contract branch; company accounts explicit; no inference from unknown ownership');
  const originalFetch = global.fetch;
  try {
    const calls = [];
    global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ status: 'success', data: options.method === 'GET' ? context : { context, transaction_id: 9, replayed: false, company_transfer: false } }) }; };
    await shared.loadPaymentContext(1); await shared.saveContractPayment(1, base);
    assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[1].options.method, 'POST'); assert.deepEqual(JSON.parse(calls[1].options.body), base);
    for (const response of [
      { ok: false, status: 409, json: async () => ({ message: 'stale' }) },
      { ok: true, json: async () => ({ status: 'success', data: { context, transaction_id: 9, replayed: false, company_transfer: true } }) },
      { ok: true, json: async () => ({ status: 'success', data: { context: { ...context, id: 2 }, transaction_id: 9, replayed: false, company_transfer: false } }) },
    ]) { global.fetch = async () => response; await assert.rejects(shared.saveContractPayment(1, base)); }
    global.fetch = async () => { throw Error('offline'); }; await assert.rejects(shared.saveContractPayment(1, base));
    checks.push('client rejects stale, lost, malformed and mismatched responses without optimistic success');
  } finally { global.fetch = originalFetch; }

  if (process.argv.includes('--live-temp')) {
    require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, { info() {}, error() {} });
    const c = await load(path.join(root, 'lib/server/himoto-database')).himotoPool.connect();
    const tables = ['management_record_photos','management_contract_notifications','management_contract_payments', 'order_vehicle_details', 'transactions', 'orders', 'banks', 'cash', 'users', 'vehicles'];
    let failAfterIncome = false;
    const proxy = { query: async (sql, params) => {
      let rewritten = sql;
      for (const table of tables) rewritten = rewritten.replaceAll(`himoto.${table}`, `pg_temp.qa_payment_${table}`);
      assert(!rewritten.includes('himoto.'), 'All business SQL must use TEMP');
      if (failAfterIncome && rewritten.startsWith('UPDATE pg_temp.qa_payment_orders')) throw Error('Simulated failure after income');
      return c.query(rewritten, params);
    } };
    const transaction = async work => { await c.query('SAVEPOINT payment_case'); try { const r = await work(); await c.query('RELEASE SAVEPOINT payment_case'); return r; } catch (error) { await c.query('ROLLBACK TO SAVEPOINT payment_case'); await c.query('RELEASE SAVEPOINT payment_case'); throw error; } };
    const pay = async (patch = {}, id = 1) => {
      const fresh = await server.readPaymentContext(proxy, id);
      return transaction(() => server.recordContractPayment(proxy, id, 143, server.parseContractPayment({ ...base, request_id: randomUUID(), revision: fresh.revision, ...patch })));
    };
    const balance = async () => (await c.query('SELECT pid,total,first_deposit_amount,additional_deposit_amount,order_status FROM qa_payment_orders WHERE id=1')).rows[0];
    const count = async table => Number((await c.query(`SELECT count(*) n FROM pg_temp.qa_payment_${table}`)).rows[0].n);
    try {
      await c.query('BEGIN');
      await c.query('CREATE TEMP TABLE qa_payment_management_contract_notifications (LIKE himoto.management_contract_notifications INCLUDING DEFAULTS) ON COMMIT DROP');
      await c.query('CREATE TEMP TABLE qa_payment_management_record_photos (LIKE himoto.management_record_photos INCLUDING DEFAULTS) ON COMMIT DROP');
      for (const table of ['orders', 'transactions', 'banks', 'cash', 'order_vehicle_details', 'vehicles']) {
        await c.query(`CREATE TEMP TABLE qa_payment_${table} (LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
        await c.query(`ALTER TABLE qa_payment_${table} ALTER COLUMN id DROP DEFAULT`);
        await c.query(`ALTER TABLE qa_payment_${table} ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY`);
      }
      await c.query(`CREATE TEMP TABLE qa_payment_users(id bigint,name text) ON COMMIT DROP;
        CREATE TEMP TABLE qa_payment_management_contract_payments(request_id uuid PRIMARY KEY,order_id bigint,transaction_id bigint UNIQUE,actor_id bigint,request_hash char(64),renewal_payload jsonb) ON COMMIT DROP;
        INSERT INTO qa_payment_users VALUES(143,'QA');
        INSERT INTO qa_payment_orders(id,contract_number,order_status,store_id,total,pid,first_deposit_amount,additional_deposit_amount) VALUES(1,'QA-1','renting',23,'1000',100,50,20),(2,'QA-2','draft',23,'1000',0,0,0),(3,'QA-3','renting',23,'1000',2000,50,20),(4,'QA-4','renting',23,'1000',300,50,20);
        INSERT INTO qa_payment_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES(100,'Xe QA A','Honda','xeso',2026,23,23,'QA-A','renting',143),(101,'Xe QA B','Honda','xeso',2026,23,23,'QA-B','renting',143);
        INSERT INTO qa_payment_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_renewal_amount) VALUES(101,1,100,'2026-01-01T10:01:00+07:00','2026-01-10T10:01:00+07:00',500),(102,1,101,'2026-01-01T10:01:00+07:00','2026-02-10T10:01:00+07:00',0),(201,2,100,'2026-01-01T10:01:00+07:00','2026-01-10T10:01:00+07:00',0),(301,3,100,'2026-01-01T10:01:00+07:00','2026-02-01T10:01:00+07:00',2000),(401,4,100,'2026-01-01T10:01:00+07:00','2026-02-01T10:01:00+07:00',0);
        UPDATE qa_payment_orders SET return_at='2026-02-01T10:01:00+07:00' WHERE id=3;
        INSERT INTO qa_payment_cash(id,store_id,opening_balance) VALUES(1,23,0),(2,31,0);
        INSERT INTO qa_payment_banks(id,store_id,bank_name,account_number,owner_name,account_type,owner_type) VALUES(1,23,'QA','QA-1','QA',1,'unknown'),(2,31,'QA','QA-2','QA',1,'personal'),(3,0,'QA','QA-3','QA',1,'company'),(4,0,'QA','QA-4','QA',2,'company'),(5,23,'QA','QA-5','QA',2,'unknown'),(6,0,'QA','QA-6','QA',2,'company'),(7,31,'QA','QA-7','QA',2,'unknown');
        UPDATE qa_payment_banks SET status='Inactive' WHERE id=4;`);
      const legacyAccounts=await server.readPaymentContext(proxy,1);
      assert.deepEqual(shared.paymentAccounts(legacyAccounts,'transfer').map(row=>row.id),[1,5]);
      assert.deepEqual(shared.paymentAccounts(legacyAccounts,'company_transfer').map(row=>row.id),[3,6]);
      checks.push('PostgreSQL TEMP: active legacy account_type=2 works by branch and owner_type; inactive and foreign personal banks stay unavailable');
      const before = await balance();
      const firstId = randomUUID();
      const first = await pay({ request_id: firstId });
      assert.equal(first.context.paid_amount, 400); assert.equal(first.context.remaining, 600); assert.equal(first.replayed, false);
      const second = await pay({ method: 'transfer', amount: '200', account_id:5 });
      assert.equal(second.context.paid_amount, 600); assert.equal(await count('transactions'), 2);
      const replay = await pay({ request_id: firstId, revision: '0' });
      assert.equal(replay.replayed, true); assert.equal(replay.transaction_id, first.transaction_id); assert.equal(replay.context.paid_amount, 600); assert.equal(await count('transactions'), 2);
      checks.push('PostgreSQL TEMP: multiple partial payments each create income and increment paid; exact UUID replay returns same receipt after later payments');
      await assert.rejects(pay({ request_id: firstId, amount: '301' }), e => e.status === 409);
      for (const patch of [{ amount: '401' }, { account_id: 2 }, { method: 'transfer', account_id: 2 }, { method: 'company_transfer', account_id: 1 }, { method: 'company_transfer', account_id: 4 }, { revision: '0' }]) await assert.rejects(pay(patch), e => e.status === 409);
      await assert.rejects(pay({}, 2), e => e.status === 409);
      await c.query("UPDATE qa_payment_orders SET total='' WHERE id=1"); await assert.rejects(pay(), e => e.status === 409);
      await c.query("UPDATE qa_payment_orders SET total='1000' WHERE id=1");
      assert.equal(await count('transactions'), 2);
      checks.push('PostgreSQL TEMP: overpayment, draft, missing finances, stale revision, reused UUID and wrong branch/unknown company account produce no income');
      failAfterIncome = true; await assert.rejects(pay({ amount: '50' }), /Simulated failure/); failAfterIncome = false;
      assert.equal(await count('transactions'), 2); assert.equal(await count('management_contract_payments'), 2); assert.equal((await balance()).pid, '600');
      checks.push('PostgreSQL TEMP: failure between income and paid update rolls back income, total and receipt together');
      const company = await pay({ amount: '400', method: 'company_transfer', account_id: 6 });
      assert.equal(company.company_transfer, true); assert.equal(company.context.remaining, 0); assert.equal(company.context.company_paid_amount, 400); assert.equal(company.context.company_payment_count, 1);
      await assert.rejects(pay({ amount: '1' }), e => e.status === 409);
      const after = await balance();
      for (const field of ['total', 'first_deposit_amount', 'additional_deposit_amount', 'order_status']) assert.equal(after[field], before[field]);
      const receipts = (await c.query('SELECT * FROM qa_payment_transactions ORDER BY id')).rows;
      assert(receipts.every(row => row.type === 'in' && row.status === 'approved' && row.user_id === '143' && row.store_id === '23' && row.order_id === '1'));
      assert.equal(Number(receipts[1].bank_id),5);assert.equal(receipts[2].bank_owner_type, 'company'); assert.equal(receipts[2].cash_id, null); assert.equal(Number(receipts[2].bank_id), 6);
      assert.equal(receipts[0].created_at.toISOString(), '2026-01-01T03:01:00.000Z');
      assert.equal((await c.query('SELECT sum(opening_balance) n FROM qa_payment_banks')).rows[0].n, '0');
      checks.push('PostgreSQL TEMP: company income flags VAT, fee/deposit/status/opening balances preserved, zero balance rejects further payments; private identities and outer rollback');
      const renew = async (patch={},id=1) => {
        const fresh=await server.readPaymentContext(proxy,id),item=fresh.items[0];
        return pay({purpose:'renewal',item_id:item?.id,item_revision:item?.revision,return_at:'2026-01-20T10:01',...patch},id);
      };
      const originalItems=(await c.query('SELECT * FROM qa_payment_order_vehicle_details WHERE order_id=1 ORDER BY id')).rows;
      for(const paid_at of ['2026-01-01T10:01','2026-01-25T10:01']){
        await c.query('SAVEPOINT coverage_quote');
        await c.query("UPDATE qa_payment_order_vehicle_details SET type='day',hiring_fee=30 WHERE id=101");
        const request_id=randomUUID();
        await renew({request_id,paid_at});
        const period=(await c.query('SELECT renewal_payload FROM qa_payment_management_contract_payments WHERE request_id=$1',[request_id])).rows[0].renewal_payload;
        assert.equal(period.expected_amount,300,'Ten days of coverage remain ten days for both early and late collections');
        assert.equal(period.before_return_at,'2026-01-10T03:01:00.000Z');assert.equal(period.return_at,'2026-01-20T10:01:00+07:00');
        assert.equal(period.created_at,paid_at+':00+07:00');
        await c.query('ROLLBACK TO SAVEPOINT coverage_quote; RELEASE SAVEPOINT coverage_quote');
      }
      checks.push('TEMP early and late receipt dates preserve the same renewal coverage and expected fee; receipt time stays separate');
      const renewalId=randomUUID();
      const renewed=await renew({request_id:renewalId});
      assert.equal(renewed.context.total_amount,1300);assert.equal(renewed.context.paid_amount,1300);assert.equal(renewed.context.remaining,0);
      assert.equal(renewed.context.items[0].renewal_amount,800);assert.equal(renewed.context.end_date,'2026-02-10T03:01:00.000Z');
      const repeated=await renew({request_id:renewalId,revision:'0',item_revision:'0'});
      assert.equal(repeated.replayed,true);assert.equal(repeated.transaction_id,renewed.transaction_id);assert.equal(repeated.context.items[0].renewal_amount,800);
      const actualItems=(await c.query('SELECT * FROM qa_payment_order_vehicle_details WHERE order_id=1 ORDER BY id')).rows;
      assert.deepEqual(actualItems[1],originalItems[1]);
      for(const key of Object.keys(originalItems[0]).filter(k=>!['return_at','total_renewal_amount','updated_at'].includes(k))) assert.deepEqual(actualItems[0][key],originalItems[0][key]);
      const renewalReceipt=(await c.query('SELECT * FROM qa_payment_transactions WHERE id=$1',[renewed.transaction_id])).rows[0];
      assert.equal(renewalReceipt.name,'order:renewal');assert.equal(renewalReceipt.type,'in');assert.equal(renewalReceipt.order_item_id,'101');assert.equal(renewalReceipt.object_id,'101');
      const payload=(await c.query('SELECT renewal_payload FROM qa_payment_management_contract_payments WHERE request_id=$1',[renewalId])).rows[0].renewal_payload;
      assert.equal(payload.before_return_at,'2026-01-10T03:01:00.000Z');assert.equal(payload.return_at,'2026-01-20T10:01:00+07:00');assert.equal(payload.before_renewal_amount,500);
      checks.push('PostgreSQL TEMP: fully paid contract renews selected vehicle; equal new fee/payment preserves debt, other vehicle untouched, dates and fee audited, exact replay changes nothing twice');
      const n=await count('transactions');
      for(const patch of [{item_id:9999},{item_id:201},{item_revision:'0'},{return_at:'2026-01-20T10:01'},{return_at:'2026-01-19T10:01'},{request_id:renewalId,return_at:'2026-03-01T10:01'}]) await assert.rejects(renew(patch),e=>e.status===409);
      await c.query('UPDATE qa_payment_order_vehicle_details SET completed_at=now() WHERE id=101');await assert.rejects(renew({item_id:101}),e=>e.status===409);await c.query('UPDATE qa_payment_order_vehicle_details SET completed_at=NULL WHERE id=101');
      await c.query('UPDATE qa_payment_order_vehicle_details SET deleted_at=now() WHERE id=101');await assert.rejects(renew({item_id:101}),e=>e.status===409);await c.query('UPDATE qa_payment_order_vehicle_details SET deleted_at=NULL WHERE id=101');
      for(const status of ['completed','cancelled','draft','bad_debt','wait_payment']) {await c.query('UPDATE qa_payment_orders SET order_status=$1 WHERE id=1',[status]);await assert.rejects(renew({return_at:'2026-03-01T10:01'}),e=>e.status===409);}await c.query("UPDATE qa_payment_orders SET order_status='renting' WHERE id=1");
      assert.equal(await count('transactions'),n);
      const beforeRollback=await server.readPaymentContext(proxy,1);
      failAfterIncome=true;await assert.rejects(renew({return_at:'2026-03-01T10:01'}),/Simulated failure/);failAfterIncome=false;
      const afterRollback=await server.readPaymentContext(proxy,1);
      for(const key of ['total_amount','paid_amount','items','end_date']) assert.deepEqual(afterRollback[key],beforeRollback[key]);assert.equal(await count('transactions'),n);
      checks.push('PostgreSQL TEMP: wrong/returned/deleted/stale vehicle, old date, UUID changed details and non-renting statuses rejected; failure after vehicle update rolls back dates, fee, income and receipt');
      const legacyRenewal=await renew({return_at:'2026-03-01T10:01',method:'company_transfer',account_id:3},3);
      assert.equal(legacyRenewal.context.total_amount,1300);assert.equal(legacyRenewal.context.paid_amount,2300);assert.equal(legacyRenewal.context.remaining,0);assert.equal(legacyRenewal.context.end_date,'2026-03-01T03:01:00.000Z');assert.equal(legacyRenewal.company_transfer,true);
      const debtBefore=(await server.readPaymentContext(proxy,4)).remaining;const withDebt=await renew({return_at:'2026-03-01T10:01'},4);assert.equal(withDebt.context.remaining,debtBefore);
      checks.push('PostgreSQL TEMP: legacy paid greater than original total accepts a new company renewal and updates explicit parent date; old outstanding debt stays unchanged on renewal');
      await c.query("UPDATE qa_payment_orders SET order_status='completed' WHERE id=4");
      const extraBefore=await server.readPaymentContext(proxy,4);
      const extraReceipt=await pay({purpose:'extra',amount:'150',note:''},4);
      assert.equal(extraReceipt.context.total_amount,extraBefore.total_amount+150);assert.equal(extraReceipt.context.paid_amount,extraBefore.paid_amount+150);assert.equal(extraReceipt.context.remaining,extraBefore.remaining);
      const extraRow=(await c.query('SELECT * FROM qa_payment_transactions WHERE id=$1',[extraReceipt.transaction_id])).rows[0];
      assert.equal(extraRow.name,'order:extra');assert.equal(extraRow.type,'in');assert.equal(extraRow.status,'approved');assert.equal(extraRow.note,'Gia hạn hợp đồng_QA-4');
      const extraCount=await count('transactions');
      for(const status of ['draft','cancelled']){await c.query('UPDATE qa_payment_orders SET order_status=$1 WHERE id=4',[status]);await assert.rejects(pay({purpose:'extra',amount:'150',note:'Phụ thu QA'},4),e=>e.status===409);}
      assert.equal(await count('transactions'),extraCount);
      checks.push('PostgreSQL TEMP: extra receipt on a completed contract writes an approved cashbook income, raises total and paid equally and keeps debt; draft/cancelled rejected');
      await c.query('SAVEPOINT saved_renewal_receipts');
      const renewals = load(path.join(root, 'lib/server/contract-renewals'));
      const state = (await c.query(`SELECT o.xmin::text AS order_revision,d.xmin::text AS item_revision FROM qa_payment_orders o JOIN qa_payment_order_vehicle_details d ON d.order_id=o.id WHERE d.id=101`)).rows[0];
      const version = await renewals.recordContractRenewal(proxy, 1, 143, { item_id:101, ...state, return_at:'2026-04-01T10:01', amount:'300', note:'' });
      const beforeCollection = await server.readPaymentContext(proxy,1);
      const linkedRequest = randomUUID();
      const linked = await pay({ request_id:linkedRequest, amount:'100', method:'transfer', renewal_version:version.version });
      const linkedPayload = (await c.query('SELECT renewal_payload FROM qa_payment_management_contract_payments WHERE transaction_id=$1',[linked.transaction_id])).rows[0].renewal_payload;
      assert.equal(linkedPayload.version,version.version);assert.equal(linkedPayload.license,'QA-A');assert.equal(linkedPayload.collected_amount,100);
      assert.equal(linked.context.total_amount,beforeCollection.total_amount);assert.deepEqual(linked.context.items,beforeCollection.items);
      assert.equal(linked.context.paid_amount,beforeCollection.paid_amount+100);
      assert.equal((await pay({request_id:linkedRequest,revision:'0',amount:'100',method:'transfer',renewal_version:version.version})).replayed,true);
      await assert.rejects(pay({amount:'1',renewal_version:999}),e=>e.status===409);
      await assert.rejects(pay({amount:'201',renewal_version:version.version}),e=>e.status===409);
      await pay({amount:'100',method:'cash',renewal_version:version.version});
      await pay({amount:'100',method:'company_transfer',account_id:3,renewal_version:version.version});
      await assert.rejects(pay({amount:'1',renewal_version:version.version}),e=>e.status===409);
      await c.query('ROLLBACK TO SAVEPOINT saved_renewal_receipts');
      checks.push('PostgreSQL TEMP: saved renewal receipts link the exact version for personal/company/cash payments, preserve dates and fee, replay once and reject missing versions or overcollection');
      await c.query('SAVEPOINT missing_deposit');
      const initial=await server.readPaymentContext(proxy,1),key=randomUUID(),beforeDeposit=await balance();
      const amount=String(initial.deposit_remaining);assert(Number(amount)>0);
      const depositResult=await pay({request_id:key,purpose:'deposit',amount,paid_at:'2026-01-03T11:00',note:'Forgot original deposit receipt'});
      assert.equal(depositResult.context.paid_amount,initial.paid_amount);assert.equal(depositResult.context.total_amount,initial.total_amount);
      assert.equal(depositResult.context.deposit_remaining,0);assert.equal(depositResult.context.deposit_paid,initial.deposit_paid+Number(amount));
      const depositTx=(await c.query('SELECT name,created_at FROM qa_payment_transactions WHERE id=$1',[depositResult.transaction_id])).rows[0];
      assert.equal(depositTx.name,'order:deposit');assert.equal(depositTx.created_at.toISOString(),'2026-01-03T04:00:00.000Z');
      assert.equal((await pay({request_id:key,revision:'0',purpose:'deposit',amount,paid_at:'2026-01-03T11:00',note:'Forgot original deposit receipt'})).replayed,true);
      await assert.rejects(pay({purpose:'deposit',amount:'1'}),e=>e.status===409);
      const afterDeposit=await balance();assert.equal(afterDeposit.total,beforeDeposit.total);
      assert.equal(Number(afterDeposit.pid),Number(beforeDeposit.pid)+Number(amount));
      checks.push('TEMP supplemental deposit records the original transaction date, increases held deposit only, preserves rental debt/total, rejects excess and replays one receipt');
      await c.query('ROLLBACK TO SAVEPOINT missing_deposit');await c.query('RELEASE SAVEPOINT missing_deposit');
      await c.query('SAVEPOINT historical_renewal_collection');
      await c.query(`DELETE FROM qa_payment_transactions WHERE order_id=1;
        UPDATE qa_payment_orders SET order_status='completed',total='1000',pid=1000,first_deposit_amount=0,additional_deposit_amount=0 WHERE id=1;
        UPDATE qa_payment_order_vehicle_details SET rent_at='2026-01-01T10:00+07',return_at='2026-01-10T10:00+07',completed_at='2026-01-15T10:00+07' WHERE order_id=1`);
      const beforeHistory=await server.readPaymentContext(proxy,1),lineRevision=(await c.query('SELECT xmin::text AS revision FROM qa_payment_order_vehicle_details WHERE id=101')).rows[0].revision;
      const historicalInput={request_id:randomUUID(),item_id:101,item_revision:lineRevision,order_revision:beforeHistory.revision,occurred_at:'2026-01-09T10:00',return_at:'2026-01-12T10:00',amount:'300',note:'',receipt:{method:'cash',account_id:1,paid_at:'2026-01-09T11:00'}};
      const collector=load(path.join(root,'lib/server/contract-renewal-collection'));
      const savedVersions=(await c.query('SELECT draft_payload FROM qa_payment_orders WHERE id=1')).rows[0].draft_payload?.management_composer?.versions;
      const billVersion=await load(path.join(root,'lib/server/contract-renewal-version')).nextContractRenewalVersion(proxy,1,savedVersions);
      await c.query("INSERT INTO qa_payment_management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',1,$1,'image/jpeg',$2,143)",[ `renewal-${billVersion}-document-1`,Buffer.from([255,216,255])]);
      const historicalResult=await transaction(()=>collector.renewContractAndCollect(proxy,1,143,historicalInput));
      assert.equal(historicalResult.payment.context.status,'completed');assert.equal(historicalResult.payment.context.total_amount,1300);assert.equal(historicalResult.payment.context.paid_amount,1300);
      assert.equal((await c.query('SELECT completed_at FROM qa_payment_order_vehicle_details WHERE id=101')).rows[0].completed_at.toISOString(),'2026-01-15T03:00:00.000Z');
      const replayHistory=await transaction(()=>collector.renewContractAndCollect(proxy,1,143,historicalInput));assert.equal(replayHistory.replayed,true);assert.equal(replayHistory.payment.replayed,true);
      assert.equal((await c.query('SELECT count(*)::int AS count FROM qa_payment_transactions WHERE order_id=1')).rows[0].count,1);
      checks.push('TEMP historical renewal and original-date receipt commit together, restore completed status when fully paid, preserve actual vehicle return and replay without a second fee/receipt');
      await c.query('ROLLBACK TO SAVEPOINT historical_renewal_collection');await c.query('RELEASE SAVEPOINT historical_renewal_collection');
      await c.query('SAVEPOINT ordinary_returned_payment');
      for(const [id,status,lineCount,open]of [[10,'wait_payment',2,false],[11,'wait_payment',2,true],[12,'renting',1,true],[13,'overdue',1,true],[14,'wait_payment',0,false],[15,'reserved',1,false],[16,'bad_debt',1,false],[17,'wait_payment',1,false],[18,'wait_payment',1,false]]){
        await c.query("INSERT INTO qa_payment_orders(id,contract_number,order_status,store_id,total,pid,first_deposit_amount,additional_deposit_amount,draft_payload) VALUES($1,$2,$3,23,'1000',0,0,0,'{}')",[id,'QA-RETURNED-'+id,status]);
        for(let n=0;n<lineCount;n++)await c.query("INSERT INTO qa_payment_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,completed_at,deleted_at) VALUES($1,$2,$3,'2026-01-01T10:00+07','2026-01-10T10:00+07',$4::timestamptz,$5::timestamptz)",[10000+id*10+n,id,100+n,open&&n===lineCount-1?null:'2026-01-15T10:00+07',id===18?'2026-01-16T10:00+07':null]);
      }
      await c.query("UPDATE qa_payment_orders SET pid=700,first_deposit_amount=500 WHERE id=10;UPDATE qa_payment_orders SET pid=1000,first_deposit_amount=500 WHERE id=17");
      await c.query("INSERT INTO qa_payment_transactions(order_id,name,type,status,value,store_id,user_id,cash_id,note,created_at) VALUES(10,'order:deposit','in','approved',500,23,143,1,'Returned-contract deposit QA','2026-01-01T10:00+07')");
      const beforeReturnedLines=(await c.query('SELECT * FROM qa_payment_order_vehicle_details WHERE order_id=10 ORDER BY id')).rows;
      const beforeVehicles=(await c.query('SELECT * FROM qa_payment_vehicles ORDER BY id')).rows;
      const partialReturned=await pay({amount:'300',paid_at:'2026-01-20T10:01'},10);
      assert.equal(partialReturned.context.status,'wait_payment');assert.equal(partialReturned.context.remaining,500);
      const finalKey=randomUUID(),fullReturned=await pay({request_id:finalKey,amount:'500',paid_at:'2026-01-20T10:01'},10);
      assert.equal(fullReturned.context.status,'completed');assert.equal(fullReturned.context.remaining,0);assert.equal(fullReturned.context.paid_amount,1000);assert.equal(fullReturned.context.deposit_held,500);
      assert.equal(fullReturned.context.total_amount,1000);
      assert.deepEqual((await c.query('SELECT * FROM qa_payment_order_vehicle_details WHERE order_id=10 ORDER BY id')).rows,beforeReturnedLines);
      assert.deepEqual((await c.query('SELECT * FROM qa_payment_vehicles ORDER BY id')).rows,beforeVehicles);
      const replayReturned=await pay({request_id:finalKey,revision:'0',amount:'500',paid_at:'2026-01-20T10:01'},10);
      assert(replayReturned.replayed);assert.equal(replayReturned.transaction_id,fullReturned.transaction_id);assert.equal(replayReturned.context.status,'completed');
      assert.equal((await c.query('SELECT count(*)::int AS n FROM qa_payment_transactions WHERE order_id=10')).rows[0].n,3);
      checks.push('TEMP ordinary return: partial late payments keep wait_payment, the exact final receipt completes both returned vehicles, and replay preserves one receipt, original returns, inventory, rental total and held deposit');
      for(const [id,status]of [[11,'wait_payment'],[12,'renting'],[13,'overdue'],[14,'wait_payment'],[15,'reserved'],[16,'bad_debt'],[18,'wait_payment']]){
        const result=await pay({amount:'1000',paid_at:'2026-01-20T10:01'},id);assert.equal(result.context.remaining,0);assert.equal(result.context.status,status==='renting'?'overdue':status,'Unexpected automatic completion: '+id);
        assert.equal((await c.query('SELECT order_status FROM qa_payment_orders WHERE id=$1',[id])).rows[0].order_status,status);
      }
      checks.push('TEMP full payment never closes an active/unreturned rental, a mixed returned/open contract, an empty/deleted-only contract, a hold or unconfirmed bad debt');
      const depositOnly=await pay({purpose:'deposit',amount:'500',paid_at:'2026-01-20T10:01'},17);
      assert.equal(depositOnly.context.status,'wait_payment');assert.equal(depositOnly.context.paid_amount,1000);assert.equal(depositOnly.context.deposit_held,500);
      const depositRefund=await pay({purpose:'deposit_refund',amount:'500',paid_at:'2026-01-20T10:02'},17);
      assert.equal(depositRefund.context.status,'wait_payment');assert.equal(depositRefund.context.paid_amount,1000);assert.equal(depositRefund.context.deposit_held,0);
      checks.push('TEMP deposit collection/refund remains separate and does not trigger a rental-debt completion');
      await c.query('ROLLBACK TO SAVEPOINT ordinary_returned_payment');await c.query('RELEASE SAVEPOINT ordinary_returned_payment');
    } finally { await c.query('ROLLBACK'); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
module.exports = { load };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(()=>globalThis.himotoPool?.end());

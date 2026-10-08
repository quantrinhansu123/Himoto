const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function load(filename) {
  const file = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(localRequire, module, module.exports);
  return module.exports;
}
async function main() {
  const server = load(path.join(root, 'lib/server/contract-payments'));
  const shared = load(path.join(root, 'lib/management/contract-payments'));
  const checks = [];
  const base = { request_id: randomUUID(), revision: '123', amount: '300', method: 'cash', account_id: 1, paid_at: '2026-01-01T10:01', note: ' QA ' };
  assert.equal(server.parseContractPayment(base).note, 'QA');
  for (const patch of [{ amount: '0' }, { amount: '-1' }, { amount: '1.2' }, { amount: '1e3' }, { amount: 300 }, { amount: '10000000000000' }, { revision: '' }, { request_id: 'anything' }, { method: 'split' }, { account_id: '1' }, { account_id: -1 }, { paid_at: '2026-02-30T12:00' }, { paid_at: '2099-01-01T10:00' }, { pid: '999' }, { user_id: 1 }, { note: 'a'.repeat(2001) }]) assert.throws(() => server.parseContractPayment({ ...base, ...patch }));
  for (const input of [null, [], {}, 'cash']) assert.throws(() => server.parseContractPayment(input));
  const renewalInput = { ...base,purpose:'renewal',item_id:101,item_revision:'1',return_at:'2026-01-20T10:01' };
  assert.equal(server.parseContractPayment(renewalInput).purpose,'renewal');
  for (const patch of [{ purpose:'advance' },{ item_id:0 },{ item_revision:'' },{ return_at:'2026-02-30T10:01' },{ return_at:'' }]) assert.throws(() => server.parseContractPayment({...renewalInput,...patch}));
  assert.throws(() => server.parseContractPayment({...base,item_id:101}));
  checks.push('strict positive integer money, UUID, revision, Vietnam dates and allowlisted fields; actor and totals cannot be supplied');

  const context = { id: 1, code: 'QA', revision: '123', status: 'renting', store_id: 23, total_amount: 1000, paid_amount: 300, remaining: 700, company_paid_amount: 0, company_payment_count: 0, history: [],items:[],end_date:null, accounts: [
    { id: 1, kind: 'cash', store_id: 23, owner_type: '' }, { id: 2, kind: 'cash', store_id: 31, owner_type: '' },
    { id: 1, kind: 'bank', store_id: 23, owner_type: 'unknown' }, { id: 2, kind: 'bank', store_id: 31, owner_type: 'personal' }, { id: 3, kind: 'bank', store_id: 31, owner_type: 'company' },
  ] };
  assert.deepEqual(shared.paymentAccounts(context, 'cash').map(a => a.id), [1]);
  assert.deepEqual(shared.paymentAccounts(context, 'transfer').map(a => a.id), [1]);
  assert.deepEqual(shared.paymentAccounts(context, 'company_transfer').map(a => a.id), [3]);
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
    const tables = ['management_contract_payments', 'order_vehicle_details', 'transactions', 'orders', 'banks', 'cash', 'users', 'vehicles'];
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
        INSERT INTO qa_payment_banks(id,store_id,bank_name,account_number,owner_name,account_type,owner_type) VALUES(1,23,'QA','QA-1','QA',1,'unknown'),(2,31,'QA','QA-2','QA',1,'personal'),(3,0,'QA','QA-3','QA',1,'company'),(4,0,'QA','QA-4','QA',2,'company');`);
      const before = await balance();
      const firstId = randomUUID();
      const first = await pay({ request_id: firstId });
      assert.equal(first.context.paid_amount, 400); assert.equal(first.context.remaining, 600); assert.equal(first.replayed, false);
      const second = await pay({ method: 'transfer', amount: '200' });
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
      const company = await pay({ amount: '400', method: 'company_transfer', account_id: 3 });
      assert.equal(company.company_transfer, true); assert.equal(company.context.remaining, 0); assert.equal(company.context.company_paid_amount, 400); assert.equal(company.context.company_payment_count, 1);
      await assert.rejects(pay({ amount: '1' }), e => e.status === 409);
      const after = await balance();
      for (const field of ['total', 'first_deposit_amount', 'additional_deposit_amount', 'order_status']) assert.equal(after[field], before[field]);
      const receipts = (await c.query('SELECT * FROM qa_payment_transactions ORDER BY id')).rows;
      assert(receipts.every(row => row.type === 'in' && row.status === 'approved' && row.user_id === '143' && row.store_id === '23' && row.order_id === '1'));
      assert.equal(receipts[2].bank_owner_type, 'company'); assert.equal(receipts[2].cash_id, null); assert.equal(Number(receipts[2].bank_id), 3);
      assert.equal(receipts[0].created_at.toISOString(), '2026-01-01T03:01:00.000Z');
      assert.equal((await c.query('SELECT sum(opening_balance) n FROM qa_payment_banks')).rows[0].n, '0');
      checks.push('PostgreSQL TEMP: company income flags VAT, fee/deposit/status/opening balances preserved, zero balance rejects further payments; private identities and outer rollback');
      const renew = async (patch={},id=1) => {
        const fresh=await server.readPaymentContext(proxy,id),item=fresh.items[0];
        return pay({purpose:'renewal',item_id:item?.id,item_revision:item?.revision,return_at:'2026-01-20T10:01',...patch},id);
      };
      const originalItems=(await c.query('SELECT * FROM qa_payment_order_vehicle_details WHERE order_id=1 ORDER BY id')).rows;
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
    } finally { await c.query('ROLLBACK'); c.release(); }
  }
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
module.exports = { load };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

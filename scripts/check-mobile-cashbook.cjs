// In-memory PostgreSQL only. No env files, network or operational database.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path');
const { randomUUID } = require('node:crypto'), { NextRequest } = require('next/server');
const { load, root } = require('./lib/load-typescript.cjs');
async function main() {
  const at = process.argv.indexOf('--pglite-path');
  if (at < 0 || !process.argv[at + 1]) throw Error('Provide an isolated PGlite installation; no operational DB fallback');
  const sql = new (require(path.resolve(process.argv[at + 1])).PGlite)();
  const db = load(path.join(root, 'lib/server/himoto-database')), server = load(path.join(root, 'lib/server/mobile-cashbook'));
  const web = load(path.join(root, 'lib/server/cashbook-accounts')), domain = load(path.join(root, 'lib/server/cashbook-account-domain'));
  const { dataAccess } = load(path.join(root, 'lib/server/access-context'));
  const { withMobileData } = load(path.join(root, 'lib/server/mobile-context'));
  const { resolveMobileWrite } = load(path.join(root, 'lib/server/mobile-write-recovery'));
  const dto = load(path.resolve('shared/mobile-cashbook'));
  const actor = { id: 7, name: 'QA Finance', access_role: 'custom', role: 'staff', store_id: 23, scope_all: false, permissions: ['finance.read', 'finance.write'] };
  const descriptors = Object.fromEntries(['connect','query'].map(key => [key,Object.getOwnPropertyDescriptor(db.himotoPool,key)]));
  let expectedScope={storeId:23,all:false};
  const query = async (text, values) => { const r = await sql.query(text, values); return { rows:r.rows, rowCount:r.rows.length || r.affectedRows || 0 }; };
  Object.defineProperty(db.himotoPool, 'query', { configurable:true, value:query });
  Object.defineProperty(db.himotoPool, 'connect', { configurable:true, value:async () => {
    const scope=dataAccess.getStore(); assert.equal(scope.store_id,expectedScope.storeId); assert.equal(scope.scope_all,expectedScope.all); assert.equal(scope.operation,'');
    return { query,release(){} };
  } });
  const req = (key, body) => new NextRequest('https://qa.invalid/api/mobile/v1/cashbook/accounts/cash', { method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body) });
  const save = (kind,id,action,body,key=randomUUID()) => server.saveMobileCashbookAccount(actor,kind,id,action,req(key,body));
  const params = value => new URLSearchParams(value);
  const checks=[];
  try {
    await sql.exec(`CREATE SCHEMA himoto;
      CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);
      CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);
      CREATE TABLE himoto.cash(id bigserial PRIMARY KEY,store_id bigint,opening_balance numeric,status text,name text,created_at timestamptz,updated_at timestamptz);
      CREATE TABLE himoto.banks(id bigserial PRIMARY KEY,store_id bigint,opening_balance numeric,status text,bank_name text,owner_name text,account_number text,owner_type text,account_type int,created_at timestamptz,updated_at timestamptz);
      CREATE TABLE himoto.orders(id bigint PRIMARY KEY,contract_number text,draft_reference text);
      CREATE TABLE himoto.battery_contracts(id bigint PRIMARY KEY,code text);
      CREATE TABLE himoto.management_contract_payments(transaction_id bigint,renewal_payload jsonb);
      CREATE TABLE himoto.transactions(id bigserial PRIMARY KEY,created_at timestamptz,type text,user_id bigint,store_id bigint,name text,"desc" text,note text,value numeric,order_id bigint,object_type text,object_id bigint,payment_method int,bank_id bigint,cash_id bigint,bank_owner_type text,status text);
      CREATE TABLE himoto.management_mobile_requests(user_id bigint,request_id uuid,operation varchar(64),fingerprint char(64),resource_id bigint,resource_revision varchar(32),PRIMARY KEY(user_id,request_id));
      INSERT INTO himoto.stores VALUES(23,'QA Store'); INSERT INTO himoto.users VALUES(7,'QA Finance');
      INSERT INTO himoto.orders VALUES(101,'QA-101',NULL);`);
    const input={store_id:'23',name:'QA cash',status:'active',opening_balance:'-1000'};
    const createKey=randomUUID(), created=await save('cash',null,'create',input,createKey);
    assert.equal(created.id,1); assert((await save('cash',null,'create',input,createKey)).replayed);
    const account=await server.readMobileCashbookAccount(actor,'cash','1'); assert(dto.isCashbookAccount(account)); assert.equal(account.opening,-1000);
    const webRows=await query(`${domain.CASHBOOK_ACCOUNTS_SQL} WHERE a.kind='cash' AND a.id=1`); assert.equal(Number(webRows.rows[0].opening_balance),account.opening);
    await assert.rejects(server.saveMobileCashbookAccount({...actor,permissions:['finance.read']},'cash',null,'create',req(randomUUID(),input)),e=>e.status===403);
    await assert.rejects(save('cash',null,'create',{...input,opening_balance:'1.5'}),e=>e.status===400);
    await assert.rejects(save('cash',null,'create',{...input,store_id:'24'}),e=>e.status===400);
    const webCreate=await withMobileData(actor,'',()=>web.createAccount('bank',new Request('https://qa.invalid',{method:'POST',body:JSON.stringify({store_id:'',status:'active',owner_type:'company',bank_name:'QA bank',owner_name:'Company',account_number:'001',opening_balance:'2000'})})));
    assert.equal(webCreate.status,201); assert.equal((await webCreate.json()).data.id,1);
    const bank=await server.readMobileCashbookAccount(actor,'bank','1'); assert.equal(bank.storeId,0); assert.equal(bank.status,'active'); assert.equal(bank.opening,2000);
    assert.deepEqual((await server.readMobileCashbookAccounts(actor,params({store_id:'23'}))).rows.map(r=>r.kind).sort(),['bank','cash']);
    checks.push('Mobile-created cash and web-created company bank are immediately read by the other surface on the same tables; signed opening/defaults/store validation and finance permission match shared web domain');

    const changed=await save('cash','1','update',{...input,name:'QA renamed',opening_balance:'1000',revision:account.revision});
    await assert.rejects(save('cash','1','update',{...input,revision:account.revision}),e=>e.status===409);
    const proof=await server.readMobileCashbookAccountResult(actor,createKey); assert(dto.isCashbookAccountResult(proof)); assert.equal(proof.receipt.revision,created.revision); assert.equal(proof.current.revision,changed.revision);
    await assert.rejects(server.readMobileCashbookAccountResult({...actor,id:8},createKey),e=>e.status===404);
    const inactive=await save('cash','1','status',{revision:changed.revision,status:'inactive'});
    assert.deepEqual((await server.readMobileCashbookAccounts(actor,params(''))).rows.map(r=>r.kind),['bank']);
    await save('cash','1','status',{revision:inactive.revision,status:'active'});
    checks.push('CAS rejects stale account changes; immutable original receipt stays separate from current account; archive/reactivate affects availability without changing balances; receipts are actor-owned');

    const seeds=[
      ['in','order:deposit',100,'2026-11-02T17:00:00Z'],['in','order:payment',200,'2026-11-03T00:01:00Z'],
      ['addon','addon',300,'2026-11-03T00:02:00Z'],['in','order:return_late',40,'2026-11-03T00:03:00Z'],
      ['in','order:return_repair',50,'2026-11-03T00:04:00Z'],['in','order:extra',60,'2026-11-03T00:05:00Z'],
      ['in','other',70,'2026-11-03T00:06:00Z'],['out','order:deposit_refund',80,'2026-11-03T00:07:00Z'],
      ['out','order:rental_refund',90,'2026-11-03T00:08:00Z'],['out','other',20,'2026-11-03T00:09:00Z'],
      ['in','order:additional_deposit',10,'2026-11-02T16:59:59Z'],['in','order:payment',999,'2026-11-03T17:00:00Z']
    ];
    for(const [type,name,value,date] of seeds) await query(`INSERT INTO himoto.transactions(created_at,type,name,value,user_id,store_id,order_id,cash_id,bank_id,status,payment_method) VALUES($1,$2,$3,$4,7,23,101,1,1,'approved',3)`,[date,type,name,value]);
    await query(`INSERT INTO himoto.transactions(created_at,type,name,value,user_id,store_id,cash_id,status) VALUES(now(),'in','other',99999,7,23,1,'pending')`);
    const page=await server.readMobileCashbook(actor,params({from:'2026-11-03',to:'2026-11-03',income_limit:'2',income_sort:'amount',income_direction:'asc'}));
    assert(dto.isCashbookPage(page)); assert.equal(page.income.total,7); assert.equal(page.expense.total,3); assert.equal(page.total,12);
    assert.deepEqual(page.income.rows.map(r=>r.amount),[40,50]); assert.equal(page.income.amount,820); assert.equal(page.expense.amount,190);
    // Rental revenue is 200 + 300 - 90; the 40 late fee belongs in receipts only.
    assert.deepEqual(dto.cashbookRentalTotals(page.breakdown),{revenue:410,income:640,expense:170});
    const second=await server.readMobileCashbook(actor,params({from:'2026-11-03',to:'2026-11-03',income_limit:'2',income_page:'2',income_sort:'amount',income_direction:'asc'})); assert.deepEqual(second.income.rows.map(r=>r.amount),[60,70]);
    const filtered=await server.readMobileCashbook(actor,params({search:'QA-101',actor:'id:7',store_id:'23',from:'2026-11-03',to:'2026-11-03'})); assert.equal(filtered.income.total,7);
    const cash=await server.readMobileCashbookAccount(actor,'cash','1'); assert.equal(cash.income,1829); assert.equal(cash.expense,190); assert.equal(cash.balance,2639); assert.equal(cash.voucherCount,12);
    assert.equal((await server.readMobileCashbookAccount(actor,'bank','1')).balance,2000,'Account totals give mixed vouchers to cash first, like web');
    const tx=await server.readMobileCashbookTransactions(actor,'cash','1',params({from:'2026-11-03',to:'2026-11-03'})); assert(dto.isCashbookTransactions(tx)); assert.equal(tx.rows.length,10); assert(tx.rows.every(r=>r.date==='2026-11-03'));
    const webTx=await withMobileData(actor,'',()=>web.listAccountTransactions('cash',1,params({from:'2026-11-03',to:'2026-11-03'}))); assert.equal((await webTx.json()).data.length,tx.rows.length);
    await assert.rejects(server.readMobileCashbook(actor,params('from=2026-02-30')),e=>e.status===400);
    await assert.rejects(server.readMobileCashbook(actor,params('mode=all')),e=>e.status===400);
    await assert.rejects(server.readMobileCashbook(actor,params('actor=id:7&actor=id:8')),e=>e.status===400);
    assert.equal(dto.isCashbookPage({...page,income:{...page.income,amount:page.income.amount+1}}),false);
    const artifact=await server.exportMobileCashbook(actor,params({from:'2026-11-03',to:'2026-11-03',store_id:'23'}));
    const {isMobileCsvExport}=load(path.resolve('shared/mobile-export'));
    assert(isMobileCsvExport(artifact)); assert.equal(artifact.rowCount,10); assert(artifact.content.includes('03/11/2026')); assert(artifact.content.includes('QA-101'));
    const {listCashbook}=load(path.join(root,'lib/server/cashbook-list')), {cashbookCsv}=load(path.join(root,'lib/management/cashbook')), {mapCashbookRow}=load(path.join(root,'lib/management/cashbook-repository'));
    const webExport=await listCashbook(params({from:'2026-11-03',to:'2026-11-03',store_id:'23',mode:'all'}),{query});
    assert.equal(artifact.content,'\uFEFF'+cashbookCsv(webExport.map(row=>mapCashbookRow({...row,created_at:row.created_at.toISOString()}))));
    assert.equal((await server.exportMobileCashbook(actor,params({from:'2026-11-04',to:'2026-11-04'}))).rowCount,1);
    await assert.rejects(server.exportMobileCashbook({...actor,permissions:[]},params('')),e=>e.status===403);
    await assert.rejects(server.exportMobileCashbook(actor,params('income_page=1')),e=>e.status===400);
    checks.push('Actual web SQL classifies every cash category, reconciles amounts, pages/sorts/filters and Vietnam midnight; account balances stay all-time, approved-only and cash-first, distinct from period rental summaries');
      checks.push('CSV exports every filtered voucher beyond the visible page with exactly the web column formatting, Vietnam dates and UTF-8 BOM; permission and parameter validation apply');
      const xlsx=await server.exportMobileCashbook(actor,params({from:'2026-11-03',to:'2026-11-03',store_id:'23',format:'xlsx'}));
      const {Workbook}=require('exceljs'),workbook=new Workbook();await workbook.xlsx.load(Buffer.from(xlsx.contentBase64,'base64'));
      assert.equal(xlsx.rowCount,10);assert.equal(workbook.worksheets[0].rowCount,11);
      const {CASHBOOK_COLUMNS,cashbookCell}=load(path.join(root,'lib/management/cashbook'));
      const mapped=webExport.map(row=>mapCashbookRow({...row,created_at:row.created_at.toISOString()}));
      assert.deepEqual(workbook.worksheets[0].getRow(2).values.slice(1),CASHBOOK_COLUMNS.map(c=>c.key==='amount'?mapped[0].amount:cashbookCell(mapped[0],c.key)));
      assert.equal(typeof workbook.worksheets[0].getCell('F2').value,'number');
      checks.push('Pulled filtered Excel action includes all ten scoped vouchers and exactly the actual web columns with numeric money cells; original CSV stays readable');

    let current=await server.readMobileCashbookAccount(actor,'cash','1');
    await assert.rejects(save('cash','1','delete',{revision:current.revision}),e=>e.status===409);
    const unused=await save('cash',null,'create',{...input,name:'QA unused'});
    await query(`INSERT INTO himoto.transactions(created_at,type,name,value,user_id,store_id,cash_id,status) VALUES(now(),'in','other',1,7,23,$1,'pending')`,[unused.id]);
    await assert.rejects(save('cash',String(unused.id),'delete',{revision:unused.revision}),e=>e.status===409);
    await query('DELETE FROM himoto.transactions WHERE cash_id=$1',[unused.id]);
    const deleteKey=randomUUID(); await save('cash',String(unused.id),'delete',{revision:unused.revision},deleteKey);
    assert((await save('cash',String(unused.id),'delete',{revision:unused.revision},deleteKey)).replayed);
    assert(dto.isCashbookAccountResult(await server.readMobileCashbookAccountResult(actor,deleteKey)));
    const resolve=(key,operation)=>resolveMobileWrite(actor,key,new NextRequest('https://qa.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation})}));
    assert.equal((await resolve(deleteKey,`cash.delete:${unused.id}`)).status,'committed');
    const cancelled=randomUUID(); assert.equal((await resolve(cancelled,'bank.create')).status,'cancelled');
    await assert.rejects(save('bank',null,'create',{store_id:'23',status:'active',bank_name:'QA',account_number:'123',owner_name:'QA'},cancelled),e=>e.code==='REQUEST_CANCELLED');
    assert.equal((await query('SELECT count(*)::int AS count FROM himoto.cash')).rows[0].count,1);
    checks.push('Actual web deletion blocks every referenced voucher including pending; unused-account delete/replay and actor-owned recovery work after removal; cancellation prevents a late request using the same UUID');
    const settingsActor={...actor,permissions:['finance.read','settings.write']};
    const deleteRequest=(ids,key=randomUUID())=>new NextRequest('https://qa.invalid/api/mobile/v1/cashbook/vouchers',{method:'DELETE',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({ids})});
    const beforeBulk=Number((await query('SELECT count(*)::int AS count FROM himoto.transactions')).rows[0].count);
    await sql.exec(`ALTER TABLE himoto.orders ADD COLUMN pid numeric,ADD COLUMN total text,ADD COLUMN updated_at timestamptz;
      ALTER TABLE himoto.battery_contracts ADD COLUMN paid_amount numeric,ADD COLUMN deposit_amount numeric,ADD COLUMN updated_at timestamptz;
      UPDATE himoto.orders SET pid=2000,total='5000' WHERE id=101;
      INSERT INTO himoto.battery_contracts(id,code,paid_amount,deposit_amount) VALUES(201,'QA-PIN',600,300);`);
    const batchSeeds=[
      [20001,'in','order:payment',100,101,null,'approved'],[20002,'in','order:extra',70,101,null,'approved'],[20003,'in','order:renewal',50,101,null,'approved'],
      [20004,'in','order:outside',30,101,null,'approved'],[20005,'out','order:rental_refund',20,101,null,'approved'],[20006,'in','order:payment',9999,101,null,'pending'],
      [20007,'in','battery:rental',100,null,201,'approved'],[20008,'in','battery:renewal',60,null,201,'approved'],[20009,'in','battery:deposit',40,null,201,'approved'],[20010,'in','battery:deposit',9999,null,201,'pending']
    ];
    for(const [id,type,name,value,order,object,status] of batchSeeds) await query(`INSERT INTO himoto.transactions(id,created_at,type,name,value,order_id,object_id,object_type,status,user_id,store_id,"desc") VALUES($1,'2026-11-03T01:00:00Z',$2,$3,$4,$5,$6,$7,$8,7,23,'BulkQA0311')`,[id,type,name,value,order,object,object?'battery_contract':null,status]);
    await sql.exec(`INSERT INTO himoto.management_contract_payments VALUES(20001,NULL),(20003,'{}');`);
    const bulkDto=load(path.resolve('shared/mobile-cashbook-delete'));
    const selectedIncome=await server.readMobileVoucherDeleteSelection(settingsActor,params({search:'BulkQA0311',store_id:'23',type:'income',from:'2026-11-03',to:'2026-11-03'}));
    assert(bulkDto.isVoucherDeleteSelection(selectedIncome)); assert.equal(selectedIncome.rows.length,7);
    assert.equal((await server.readMobileVoucherDeleteSelection(settingsActor,params({search:'BulkQA0311',type:'expense'}))).rows.length,1);
    await assert.rejects(server.deleteMobileVouchers(actor,deleteRequest([20001])),e=>e.status===403,'finance.write must not substitute for web settings.write');
    await assert.rejects(server.readMobileVoucherDeleteSelection(actor,params({type:'income'})),e=>e.status===403);
    await assert.rejects(server.readMobileVoucherDeleteSelection(settingsActor,params('type=income&type=expense')),e=>e.status===400);
    for(const ids of [[],[1,1],Array.from({length:501},(_,i)=>i+1)]) await assert.rejects(server.deleteMobileVouchers(settingsActor,deleteRequest(ids)),e=>e.status===400);
    checks.push('Bulk selection uses actual web mode=ids across the whole filter and approved voucher types; settings.write remains mandatory, and empty/duplicate/over-500 batches reject before business writes');
    const bulkIds=batchSeeds.map(row=>row[0]),bulkKey=randomUUID();
    const removed=await server.deleteMobileVouchers(settingsActor,deleteRequest(bulkIds,bulkKey)); assert(bulkDto.isVoucherDeletion(removed)); assert.equal(removed.deletedCount,10); assert(!removed.replayed);
    const orderAfter=(await query('SELECT pid,total FROM himoto.orders WHERE id=101')).rows[0]; assert.equal(Number(orderAfter.pid),1800); assert.equal(orderAfter.total,'4880');
    const batteryAfter=(await query('SELECT paid_amount,deposit_amount FROM himoto.battery_contracts WHERE id=201')).rows[0]; assert.equal(Number(batteryAfter.paid_amount),440); assert.equal(Number(batteryAfter.deposit_amount),260);
    assert.equal((await query('SELECT count(*)::int AS count FROM himoto.management_contract_payments WHERE transaction_id>=20001')).rows[0].count,0);
    assert.equal((await query('SELECT count(*)::int AS count FROM himoto.transactions')).rows[0].count,beforeBulk);
    assert((await server.deleteMobileVouchers(settingsActor,deleteRequest([...bulkIds].reverse(),bulkKey))).replayed);
    assert.deepEqual((await query('SELECT pid,total FROM himoto.orders WHERE id=101')).rows[0],orderAfter);
    assert.deepEqual((await query('SELECT paid_amount,deposit_amount FROM himoto.battery_contracts WHERE id=201')).rows[0],batteryAfter);
    await assert.rejects(server.deleteMobileVouchers(settingsActor,deleteRequest([1],bulkKey)),e=>e.code==='REQUEST_KEY_REUSED');
    assert.equal((await server.readMobileVoucherDeletion(settingsActor,bulkKey)).deletedCount,10);
    await assert.rejects(server.readMobileVoucherDeletion({...settingsActor,id:8},bulkKey),e=>e.status===404);
    checks.push('Actual web bulkDelete atomically reverses collected/extra/renewal/refund money, ignores pending and outside receipts, updates battery paid/deposit and removes linked payment proofs; replay never reverses money twice');
    const resolveBulk=(key,operation='cashbook.delete',user=settingsActor)=>resolveMobileWrite(user,key,new NextRequest('https://qa.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation})}));
    assert.equal((await resolveBulk(bulkKey)).receipt.id,10);
    const late=randomUUID();assert.equal((await resolveBulk(late)).status,'cancelled');await assert.rejects(server.deleteMobileVouchers(settingsActor,deleteRequest([1],late)),e=>e.code==='REQUEST_CANCELLED');
    const rollbackKey=randomUUID();await assert.rejects(server.deleteMobileVouchers(settingsActor,deleteRequest([1,999999999],rollbackKey)),e=>e.status===409);
    assert.equal((await query('SELECT count(*)::int AS count FROM himoto.management_mobile_requests WHERE request_id=$1',[rollbackKey])).rows[0].count,0);
    assert.equal((await query('SELECT count(*)::int AS count FROM himoto.transactions WHERE id=1')).rows[0].count,1);
    expectedScope={storeId:24,all:true};
    assert.equal((await server.readMobileVoucherDeletion({...settingsActor,store_id:24,scope_all:true},bulkKey)).deletedCount,10);
    expectedScope={storeId:23,all:false};
    await assert.rejects(resolveBulk(bulkKey,'cashbook.delete',actor),e=>e.status===403);
    checks.push('Batch receipt stores confirmed count/version only for cashbook.delete; own recovery survives deletion/store change, rejects lost permission, cancellation blocks late writes, and a partially missing batch rolls back its entire ledger/business transaction');
    console.log(JSON.stringify({passed:checks.length,checks,operationalWrites:0,database:'isolated PGlite; no deployed RLS, concurrency or native acceptance'},null,2));
  } finally { for(const key of ['connect','query']) { if(descriptors[key]) Object.defineProperty(db.himotoPool,key,descriptors[key]); else delete db.himotoPool[key]; } await sql.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

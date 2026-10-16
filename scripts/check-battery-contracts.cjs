const assert = require('node:assert/strict');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
const api = load(path.join(root,'lib/management/battery-contracts'));
const server = load(path.join(root,'lib/server/battery-contracts'));
const billing = load(path.join(root,'lib/management/contract-billing'));
const checks = [];
function input(method='cash',account=5) {
  return {store_id:35,customer_id:null,status:'renting',staff_name:'QA',signed_on:'2026-01-31',signed_place:'Cơ sở QA',
    customer_name:'Khách pin QA',customer_phone:'0900000001',customer_address:'Địa chỉ QA',customer_id_card:'001234567890',id_card_issued_on:'',id_card_issued_by:'',
    battery_name:api.DEFAULT_BATTERY_NAME,vehicle_license:'QA-PIN',vehicle_brand:'Vinfast',vehicle_type:'Xe điện',vehicle_color:'Đen',vehicle_year:'2026',
    starts_at:'2026-01-31T09:30',ends_at:billing.addRentalMonths('2026-01-31T09:30',1),rent_price:300000,price_unit:'tháng',package_name:'1 tháng',
    paid_amount:300000,paid_method:method==='cash'?'TM':'CK',paid_account_type:method,paid_account_id:account,
    deposit_amount:3000000,deposit_note:'',deposit_method:'TM',deposit_account_type:'cash',deposit_account_id:5,
    notes:'',collected_at:'2026-01-31T09:30',request_id:randomUUID()};
}
const accounts = [
  {id:5,kind:'cash',store_id:35,owner_type:'',status:'Active',label:'Két QA'},
  {id:11,kind:'bank',store_id:35,owner_type:'unknown',status:'Active',label:'Cá nhân QA'},
  {id:12,kind:'bank',store_id:0,owner_type:'company',status:'Active',label:'Công ty QA'},
  {id:13,kind:'bank',store_id:36,owner_type:'unknown',status:'Active',label:'Sai cơ sở'},
  {id:14,kind:'bank',store_id:35,owner_type:'company',status:'Inactive',label:'Ngừng dùng'},
];
for (const [method,id] of [['cash',5],['transfer',11],['company_transfer',12]]) assert.deepEqual(api.batteryPaymentAccounts(accounts,35,method).map(a=>a.id),[id]);
checks.push('cash, personal and company accounts are filtered by active status, ownership and branch scope');
assert.equal(server.parseBatteryInput(input()).ends_at,'2026-02-28T09:30');
assert.throws(()=>server.parseBatteryInput({...input(),paid_account_id:null}),/Chọn tài khoản/);
assert.throws(()=>server.parseBatteryInput({...input(),paid_account_type:'company_transfer'}),/chưa khớp/);
assert.throws(()=>server.parseBatteryInput({...input(),collected_at:'2026-02-30T09:30'}),/Thời điểm nhận/);
checks.push('positive rent/deposit require valid accounts, consistent CK/TM methods and a real receipt timestamp');
assert.equal(api.batteryProductKind(api.DEFAULT_BATTERY_CHARGER_NAME),'battery_charger');
assert.equal(server.parseBatteryInput({...input(),vehicle_contract_id:901}).vehicle_contract_id,901);
assert.throws(()=>server.parseBatteryInput({...input(),vehicle_contract_id:-1}));
checks.push('Pin + charger preset and strict linked vehicle contract IDs');
async function live() {
  const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool;
  const c=await pool.connect();
  const tables=['battery_contracts','stores','customers','banks','cash','transactions','orders','users','management_contract_payments'];
  const proxy={query(sql,params){let rewritten=sql;for(const table of tables)rewritten=rewritten.replaceAll(`himoto.${table}`,`pg_temp.qa_pin_${table}`);assert(!rewritten.includes('himoto.'),'Business SQL must target TEMP');return c.query(rewritten,params);}};
  const attempt=async work=>{await c.query('SAVEPOINT pin_case');try{const r=await work();await c.query('RELEASE SAVEPOINT pin_case');return r;}catch(e){await c.query('ROLLBACK TO SAVEPOINT pin_case');await c.query('RELEASE SAVEPOINT pin_case');throw e;}};
  const edit=(row,patch={})=>{const body=input(row.paid_account_type,row.paid_account_id);delete body.request_id;return {...body,paid_amount:row.paid_amount,deposit_amount:row.deposit_amount,revision:row.revision,...patch};};
  try {
    await c.query('BEGIN');
    for(const table of tables) await c.query(`CREATE TEMP TABLE qa_pin_${table} (LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`);
    await c.query('ALTER TABLE qa_pin_orders ADD PRIMARY KEY(id)');
    await proxy.query(fs.readFileSync(path.join(__dirname,'../docs/sql/2026-10-16-battery-contract-links.sql'),'utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
    await c.query('CREATE TEMP SEQUENCE qa_pin_seq START 99000');
    for(const table of ['battery_contracts','transactions']) await c.query(`ALTER TABLE qa_pin_${table} ALTER COLUMN id SET DEFAULT nextval('qa_pin_seq')`);
    await c.query("INSERT INTO qa_pin_stores(id,store_name,status) VALUES(35,'CS Thuê sở hữu QA','opening')");
    await c.query("INSERT INTO qa_pin_cash(id,store_id,status,opening_balance) VALUES(5,35,'Active',0)");
    for(const account of accounts.filter(a=>a.kind==='bank')) await c.query("INSERT INTO qa_pin_banks(id,store_id,status,owner_type,bank_name,owner_name,account_number,account_type) VALUES($1,$2,$3,$4,'QA Bank','QA','QA',1)",[account.id,account.store_id,account.status,account.owner_type]);
    const saved=[];
    for(const [method,id] of [['cash',5],['transfer',11],['company_transfer',12]]) {
      const body=input(method,id);
      const row=await attempt(()=>server.saveBatteryContract(proxy,143,body));saved.push(row);
      assert.equal(row.paid_account_type,method);assert.equal(row.paid_account_id,id);
      assert.equal(row.deposit_account_id,5);assert.equal(row.paid_amount,300000);assert.equal(row.deposit_amount,3000000);
      const receipts=(await c.query("SELECT * FROM qa_pin_transactions WHERE object_type='battery_contract' AND object_id=$1 ORDER BY id",[row.id])).rows;
      assert.equal(receipts.length,2);assert.equal(Number(receipts[0].value),300000);assert.equal(Number(receipts[1].value),3000000);
      assert.equal(Number(method==='cash'?receipts[0].cash_id:receipts[0].bank_id),id);assert.equal(receipts[0].order_id,null);
      await server.saveBatteryContract(proxy,143,body);
      assert.equal(Number((await c.query('SELECT count(*) AS n FROM qa_pin_transactions WHERE object_id=$1',[row.id])).rows[0].n),2);
    }
    const balances=(await c.query("SELECT COALESCE(cash_id,bank_id) AS id,sum(value)::bigint AS amount FROM qa_pin_transactions WHERE status='approved' GROUP BY 1 ORDER BY 1")).rows;
    assert.deepEqual(balances.map(r=>[Number(r.id),Number(r.amount)]),[[5,9300000],[11,300000],[12,300000]]);
    checks.push('TEMP: all three methods create separate rent/deposit receipts, update exact account balances and UUID retries never duplicate money');
    const row=saved[1];
    await attempt(()=>server.saveBatteryContract(proxy,143,edit(row,{notes:'Sửa ghi chú'}),row.id));
    assert.equal(Number((await c.query('SELECT count(*) AS n FROM qa_pin_transactions WHERE object_id=$1',[row.id])).rows[0].n),2);
    const revised=(await server.listBatteryContracts(proxy,35)).find(r=>r.id===row.id);
    await attempt(()=>server.saveBatteryContract(proxy,143,edit(revised,{paid_amount:450000}),row.id));
    const receipts=(await c.query('SELECT value FROM qa_pin_transactions WHERE object_id=$1 ORDER BY id',[row.id])).rows;
    assert.deepEqual(receipts.map(r=>Number(r.value)),[300000,3000000,150000]);
    checks.push('TEMP: nonfinancial edits create no receipts; increasing cumulative paid amount records only the 150k delta');
    const current=(await server.listBatteryContracts(proxy,35)).find(r=>r.id===row.id);
    await assert.rejects(()=>attempt(()=>server.saveBatteryContract(proxy,143,edit(current,{paid_amount:400000}),row.id)),/thấp hơn phiếu thu/);
    await assert.rejects(()=>attempt(()=>server.saveBatteryContract(proxy,143,edit(current,{paid_amount:500000,paid_account_id:13}),row.id)),/không khớp/);
    await assert.rejects(()=>attempt(()=>server.saveBatteryContract(proxy,143,edit(current,{paid_amount:500000,paid_account_id:12}),row.id)),/không khớp/);
    await assert.rejects(()=>attempt(()=>server.saveBatteryContract(proxy,143,edit(current,{paid_account_id:13}),row.id)),/Không đổi tài khoản/);
    await assert.rejects(()=>attempt(()=>server.saveBatteryContract(proxy,143,edit(current,{revision:'0'}),row.id)),/người khác cập nhật/);
    checks.push('TEMP: decreases, wrong-branch/company accounts, silent reassignment and stale revisions roll back without moving money');
    const del=load(path.join(root,'lib/server/bulk-delete'));
    const receiptId=Number((await c.query("SELECT id FROM qa_pin_transactions WHERE object_id=$1 AND name='battery:rental' ORDER BY id DESC LIMIT 1",[row.id])).rows[0].id);
    await attempt(()=>del.bulkDelete(proxy,'transactions',[receiptId]));
    const afterDelete=(await server.listBatteryContracts(proxy,35)).find(r=>r.id===row.id);
    assert.equal(afterDelete.paid_amount,300000);assert.equal(afterDelete.deposit_amount,3000000);
    await server.deleteBatteryContract(proxy,row.id,afterDelete.revision,143);
    assert.equal(Number((await c.query('SELECT count(*) AS n FROM qa_pin_transactions WHERE object_id=$1',[row.id])).rows[0].n),2);
    checks.push('TEMP: explicit cashbook receipt deletion reconciles battery totals; removing a contract preserves existing financial receipts');
    await c.query("INSERT INTO qa_pin_orders(id,store_id,customer_id,order_status,contract_number) VALUES(901,35,NULL,'renting','QA-901'),(902,36,NULL,'renting','QA-902'),(903,35,NULL,'draft',NULL),(904,35,77,'renting','QA-904'),(905,35,NULL,'cancelled','QA-905')");
    const linked=await attempt(()=>server.saveBatteryContract(proxy,143,{...input(),vehicle_contract_id:901,battery_name:api.DEFAULT_BATTERY_CHARGER_NAME}));
    assert.equal(linked.vehicle_contract_id,901);assert.equal(linked.vehicle_contract_code,'QA-901');
    assert.deepEqual((await server.listBatteryContracts(proxy,undefined,901)).map(r=>r.id),[linked.id]);
    assert.equal((await server.listBatteryContracts(proxy,36,901)).length,0);
    const linkedReceipts=(await c.query('SELECT order_id,object_type FROM qa_pin_transactions WHERE object_id=$1',[linked.id])).rows;
    assert.equal(linkedReceipts.length,2);assert(linkedReceipts.every(r=>r.order_id===null && r.object_type==='battery_contract'));
    const edited=await attempt(()=>server.saveBatteryContract(proxy,143,edit(linked,{notes:'Linked edit'}),linked.id));
    assert.equal(edited.vehicle_contract_id,901);
    await assert.rejects(()=>attempt(()=>server.saveBatteryContract(proxy,143,edit(edited,{vehicle_contract_id:null}),linked.id)),/Giữ nguyên/);
    for(const source of [902,903,904,905,999])await assert.rejects(()=>attempt(()=>server.saveBatteryContract(proxy,143,{...input(),vehicle_contract_id:source})),server.BatteryContractError);
    checks.push('TEMP: source FK, Pin + charger, reverse filtering and edit persistence work; invalid sources rejected and receipts stay separate from vehicle contracts');
  } finally {await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
}
(async()=>{if(process.argv.includes('--live-temp'))await live();console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));})().catch(e=>{console.error(e);process.exitCode=1;});

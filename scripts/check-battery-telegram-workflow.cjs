// Synthetic PostgreSQL only: no credentials, operational writes or Telegram delivery.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const at=process.argv.indexOf('--pglite-path');
  if(at<0)throw Error('Provide an isolated PGlite package with --pglite-path');
  const sql=new(require(path.resolve(process.argv[at+1])).PGlite)();
  const query=async(text,values)=>{const result=await sql.query(text,values);return {rows:result.rows,rowCount:result.rows.length||result.affectedRows||0};};
  const db={query},api=load(path.join(root,'lib/server/battery-telegram'));
  const {CONTRACT_TELEGRAM_ROUTE_SQL}=load(path.join(root,'lib/server/contract-telegram-routing'));
  const actor={id:7,name:'QA Operator',access_role:'custom',scope_all:false,store_id:23,permissions:['contracts.read','contracts.draft','contracts.renew','contracts.return']};
  const renewal=randomUUID(),collection=randomUUID(),unpaid=randomUUID(),returned=randomUUID();
  const history=[
    {request_id:renewal,action:'renew',at:'2026-11-01T02:00:00Z',actor_name:'QA',before_ends_at:'2026-11-01T09:00',ends_at:'2026-12-01T09:00',amount:300,transaction_id:3,note:'First period'},
    {request_id:collection,action:'collect_renewal',renewal_id:renewal,at:'2026-11-02T02:00:00Z',actor_name:'QA',amount:50,transaction_id:4,note:'Partial collection'},
    {request_id:unpaid,action:'renew',at:'2026-11-02T03:00:00Z',actor_name:'QA',before_ends_at:'2026-12-01T09:00',ends_at:'2027-01-01T09:00',amount:400,note:'Unpaid period'},
    {request_id:returned,action:'return',at:'2026-11-03T06:08:00Z',actor_name:'QA',returned_at:'2026-11-03T13:08',note:'Received battery and charger'},
  ];
  const checks=[];
  try{
    await sql.exec(`CREATE SCHEMA himoto;
      CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text,store_address text,store_phone text,kind text);
      CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,contract_number text,draft_reference text,draft_payload jsonb,order_type text);
      CREATE TABLE himoto.battery_contracts(id bigint PRIMARY KEY,code text,store_id bigint,status text,staff_name text,signed_on date,id_card_issued_on date,
        vehicle_contract_id bigint,customer_name text,customer_phone text,battery_name text,vehicle_license text,starts_at timestamptz,ends_at timestamptz,
        rent_price numeric,package_name text,paid_amount numeric,deposit_amount numeric,legacy_paid_amount numeric,legacy_deposit_amount numeric,notes text,
        created_at timestamptz,deleted_at timestamptz,workflow_history jsonb);
      CREATE TABLE himoto.transactions(id bigint PRIMARY KEY,object_type text,object_id bigint,name text,type text,status text,value numeric,
        cash_id bigint,bank_id bigint,payment_method int,bank_owner_type text,created_at timestamptz);
      CREATE TABLE himoto.management_contract_notifications(id uuid PRIMARY KEY,order_id bigint,vehicle_event_id bigint,battery_contract_id bigint,
        store_id bigint,event_key text UNIQUE,root_event_key text,event_type text,payload jsonb,delivery_mode text,status text,error_code text,
        message_ids jsonb DEFAULT '[]',created_at timestamptz DEFAULT now());
      INSERT INTO himoto.stores VALUES(23,'QA ownership','','','lease_to_own'),(24,'QA branch','','','rental');
      INSERT INTO himoto.battery_contracts(id,code,store_id,status,staff_name,customer_name,battery_name,vehicle_license,starts_at,ends_at,rent_price,
        package_name,paid_amount,deposit_amount,legacy_paid_amount,legacy_deposit_amount,created_at,notes)
        VALUES(1,'PIN-QA',23,'returned','QA','QA Customer','Pin + Sạc','QA-001','2026-10-01T02:00:00Z','2027-01-01T02:00:00Z',300,'1 tháng',550,1000,0,0,'2026-10-01T02:00:00Z','');
      INSERT INTO himoto.transactions VALUES
        (1,'battery_contract',1,'battery:rental','in','approved',300,1,NULL,1,NULL,'2026-10-01T02:00:00Z'),
        (2,'battery_contract',1,'battery:deposit','in','approved',1000,1,NULL,1,NULL,'2026-10-01T02:00:00Z'),
        (3,'battery_contract',1,'battery:renewal','in','approved',200,NULL,1,2,'company','2026-11-01T02:00:00Z'),
        (4,'battery_contract',1,'battery:renewal','in','approved',50,1,NULL,1,NULL,'2026-11-02T02:00:00Z'),
        (5,'battery_contract',2,'battery:renewal','in','approved',999,1,NULL,1,NULL,'2026-11-02T02:00:00Z');`);
    await query('UPDATE himoto.battery_contracts SET workflow_history=$1',[JSON.stringify(history)]);
    const migration=fs.readFileSync(path.resolve('docs/sql/2026-11-11-battery-rental-telegram.sql'),'utf8');
    await sql.exec(migration);await sql.exec(migration);
    const rental=await api.readBatteryTelegram(db,1,'rental',actor);
    assert.equal(rental.kind,'battery_rental');assert.equal(rental.payload.battery_details.collected,300);
    assert.match(rental.state.text,/Khách thuê pin \/ sạc: QA Customer/);assert.match(rental.state.text,/Pin \+ Sạc/);
    assert.match(rental.state.text,/01\/10\/2026 09:00 → 01\/11\/2026 09:00/);
    assert.deepEqual(rental.payload.payment_amounts.rental,[{method:'Tiền mặt',amount:300}]);
    assert.deepEqual(rental.payload.payment_amounts.deposit,[{method:'Tiền mặt',amount:1000}]);
    checks.push('Rental preview preserves the original period and separates rent/deposit from later renewals');
    const renew=await api.readBatteryTelegram(db,1,renewal,actor),collect=await api.readBatteryTelegram(db,1,collection,actor),noPayment=await api.readBatteryTelegram(db,1,unpaid,actor);
    assert.equal(renew.kind,'battery_renewal');assert.match(renew.state.text,/Khách gia hạn pin \/ sạc/);
    assert.equal(renew.payload.battery_details.collected,250);assert.equal(renew.payload.battery_details.remaining,50);
    assert.deepEqual(renew.payload.payment_amounts.renewal,[{method:'Tiền mặt',amount:50},{method:'CK TK công ty',amount:200}]);
    assert.deepEqual(collect.payload.payment_amounts.renewal,[{method:'Tiền mặt',amount:50}]);
    assert.equal(collect.payload.battery_details.collected,250);assert.notEqual(renew.key,collect.key);
    assert.equal(noPayment.payload.battery_details.collected,0);assert.equal(noPayment.payload.battery_details.remaining,400);
    assert.match(noPayment.state.text,/Chưa ghi nhận thanh toán/);assert.deepEqual(noPayment.payload.payment_amounts.renewal,[]);
    checks.push('Renewal/late collection previews isolate the correct period and receipt, show real totals/debt, and unpaid periods cannot inherit initial or unrelated payments');
    const returnedState=await api.readBatteryTelegram(db,1,returned,actor);
    assert.match(returnedState.state.text,/Khách trả pin \/ sạc/);assert.match(returnedState.state.text,/Nợ gia hạn còn: 450/);
    assert.equal(returnedState.key,`battery-return:1:${returned}`);
    for(const key of ['rental',renewal,collection,unpaid,returned]){
      await query('BEGIN');try{await api.saveBatteryTelegram(db,1,key,actor);await api.saveBatteryTelegram(db,1,key,actor);await query('COMMIT');}catch(e){await query('ROLLBACK');throw e;}
    }
    assert.equal((await query('SELECT * FROM himoto.management_contract_notifications')).rowCount,5);
    const routes=(await query(`SELECT n.event_type,${CONTRACT_TELEGRAM_ROUTE_SQL} AS route FROM himoto.management_contract_notifications n
      LEFT JOIN himoto.orders o ON o.id=n.order_id LEFT JOIN himoto.stores s ON s.id=o.store_id`)).rows;
    assert(routes.every(row=>row.route===(row.event_type==='battery_renewal'?'ownership_renewal':'ownership_new')));
    await query("UPDATE himoto.stores SET kind='rental' WHERE id=23");
    assert.match((await api.readBatteryTelegram(db,1,renewal,actor)).state.destination_label,/Nhóm cơ sở/);
    const branchRoutes=(await query(`SELECT ${CONTRACT_TELEGRAM_ROUTE_SQL} AS route FROM himoto.management_contract_notifications n
      LEFT JOIN himoto.orders o ON o.id=n.order_id LEFT JOIN himoto.stores s ON s.id=o.store_id`)).rows;
    assert(branchRoutes.every(row=>row.route==='store'));
    checks.push('Migration is repeatable; rental/renewal/collection/return enqueue once with stable return keys; ownership renewal and ordinary branch routes match the preview');
    for(const [key,grant] of [['rental','contracts.draft'],[renewal,'contracts.renew'],[returned,'contracts.return']]){
      await assert.rejects(api.saveBatteryTelegram(db,1,key,{...actor,permissions:['contracts.read']}),e=>e.status===403);
      assert.equal((await api.readBatteryTelegram(db,1,key,{...actor,permissions:['contracts.read',grant]})).allowed,true);
    }
    await assert.rejects(api.readBatteryTelegram(db,1,returned,{...actor,store_id:24}),e=>e.status===403);
    await assert.rejects(api.readBatteryTelegram(db,1,randomUUID(),actor),e=>e.status===404);
    await assert.rejects(api.readBatteryTelegram(db,1,'bogus',actor),e=>e.status===400);
    for(const status of ['sent','pending','sending','unknown']){
      await query('UPDATE himoto.management_contract_notifications SET status=$1 WHERE event_key=$2',[status,renew.key]);
      assert.equal((await api.readBatteryTelegram(db,1,renewal,actor)).state.can_send,false);
      if(status==='unknown')await assert.rejects(api.saveBatteryTelegram(db,1,renewal,actor),e=>e.status===409);
      else assert.equal((await api.saveBatteryTelegram(db,1,renewal,actor)).status,status);
    }
    await query("UPDATE himoto.management_contract_notifications SET status='failed' WHERE event_key=$1",[renew.key]);
    assert.equal((await api.saveBatteryTelegram(db,1,renewal,actor)).status,'pending');
    await query("UPDATE himoto.battery_contracts SET status='cancelled' WHERE id=1");
    await assert.rejects(api.saveBatteryTelegram(db,1,'rental',actor),e=>e.status===403);
    checks.push('Per-action permissions and branch boundaries enforced; cancelled contracts and unknown deliveries block sending, pending/sent stay idempotent, confirmed failures can requeue');
    history.push({request_id:randomUUID(),action:'collect_renewal',renewal_id:unpaid,at:'2026-11-03T03:00:00Z',transaction_id:6,amount:75,note:''});
    await query("INSERT INTO himoto.transactions VALUES(6,'battery_contract',1,'battery:renewal','in','approved',75,1,NULL,1,NULL,'2026-11-03T03:00:00Z')");
    await query("UPDATE himoto.battery_contracts SET status='returned',workflow_history=$1 WHERE id=1",[JSON.stringify(history)]);
    const paidLater=await api.readBatteryTelegram(db,1,unpaid,actor);
    assert.equal(paidLater.payload.battery_details.collected,75);assert.equal(paidLater.payload.battery_details.remaining,325);
    assert.equal(paidLater.payload.method,'Tiền mặt');assert.deepEqual(paidLater.payload.payment_amounts.renewal,[{method:'Tiền mặt',amount:75}]);
    assert(!paidLater.state.text.includes('Chưa ghi nhận thanh toán'));
    checks.push('An initially unpaid renewal includes later approved collections of that exact period in its methods and amounts, without importing other-period receipts');
    console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,telegramSends:0},null,2));
  }finally{await sql.close();}
}
main().catch(error=>{console.error(error.name,error.message);process.exitCode=1;});

const assert = require('node:assert/strict'), path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');

async function run() {
  require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const time = load(path.join(root, 'lib/management/rental-time'));
  const document = load(path.join(root, 'lib/management/contract-document'));
  const checks = [];
  const receiptNow = new Date('2026-10-27T04:00:00Z');
  assert.equal(time.historicalReceiptTime('2026-10-25T15:30', receiptNow), '2026-10-25T15:30');
  assert.equal(time.historicalReceiptTime('2026-10-27T09:00', receiptNow), '2026-10-27T11:00');
  assert.equal(time.historicalReceiptTime('2026-10-28T09:00', receiptNow), '2026-10-27T11:00');
  assert.equal(time.historicalReceiptTime('nope', receiptNow), '2026-10-27T11:00');
  assert.equal(time.vietnamRentalTime(new Date('2026-10-11T08:30:00Z')), '2026-10-11T15:30');
  assert.equal(time.vietnamRentalTime(new Date('2026-12-31T17:00:00Z')), '2027-01-01T00:00');
  assert.equal(time.addRentalDuration('2026-10-12T17:00:00.000Z', 1, 'day'), '2026-10-14T00:00');
  assert.equal(time.addRentalDuration('2026-10-13T00:00', 1, 'day'), '2026-10-14T00:00');
  assert.equal(time.addRentalDuration('2026-10-13T00:00', 2, 'hour'), '2026-10-13T02:00');
  for (const [start, days, end] of [
    ['2026-10-31T15:30','2','2026-11-02T15:30'],
    ['2026-12-31T15:30','1','2027-01-01T15:30'],
    ['2028-02-28T15:30','2','2028-03-01T15:30'],
    ['2026-02-28T15:30','1','2026-03-01T15:30'],
  ]) { assert.equal(time.addRentalDays(start,days),end); assert.equal(time.rentalDayCount(start,end),days); }
  for (const days of ['0','-1','1.5','1e3','NaN','999999999999999999999']) assert.equal(time.addRentalDays('2026-10-11T15:30',days),'');
  assert.equal(time.addRentalDays('2026-02-30T15:30','1'),'');
  assert.equal(time.addRentalDays('2026-10-11T24:00','1'),'');
  assert.equal(time.rentalDayCount('2026-10-11T15:30','2026-10-12T16:30'),'2');
  assert.equal(time.rentalDayCount('2026-10-11T15:30','2026-10-11T15:30'),'');
  const empty = { stores:[],staff:[],vehicles:[],customers:[],contracts:[] };
  const fresh = document.createContractDraft(empty,'all');
  assert.equal(fresh.start_date.slice(0,10),time.vietnamRentalTime().slice(0,10));
  assert.equal(fresh.end_date,time.addRentalDays(fresh.start_date,'1'));
  const existing = document.createContractDraft(empty,'all',{id:1,status:'draft',draft_json:JSON.stringify({...fresh,start_date:'2020-02-29T15:30',end_date:'2020-03-01T15:30'})});
  assert.equal(existing.start_date,'2020-02-29T15:30');
  checks.push('Vietnam 24-hour defaults, past-day receipt time, leap days, month/year rollover, invalid durations/dates and saved draft times');

  if (process.argv.includes('--live-temp')) {
    const db = load(path.join(root,'lib/server/himoto-database')).himotoPool;
    const { saveDatabaseDraft, CONTRACT_LIST_SQL } = load(path.join(root,'lib/server/contract-drafts'));
    const { finalizeContractDraft } = load(path.join(root,'lib/server/contract-finalize'));
    const { updateDatabaseVehicle } = load(path.join(root,'lib/server/vehicle-management'));
    const { replaceContractVehicle, recordVehicleReturn } = load(path.join(root,'lib/server/contract-returns'));
    const { mapApiRow } = load(path.join(root,'lib/management/repository'));
    const c = await db.connect();
    const tables = ['stores','customers','staff_profiles','vehicles','orders','order_vehicle_details','transactions','users','banks','cash','management_contract_payments','management_contract_vehicle_swaps','vehicle_location_events'];
    const proxy = { query: (sql, values) => {
      sql=sql.replaceAll('himoto.store_directory()','pg_temp.qa_cross_stores');
      sql=sql.replaceAll('himoto.staff_account_attribution','pg_temp.qa_cross_staff_account_attribution');
      for (const table of tables) sql = sql.replaceAll(`himoto.${table}`,`pg_temp.qa_cross_${table}`);
      assert(!sql.includes('himoto.'),'Every business query must use TEMP tables');
      return c.query(sql,values);
    } };
    async function isolated(callback) {
      await c.query('SAVEPOINT qa_case');
      try { const result = await callback(); await c.query('RELEASE SAVEPOINT qa_case'); return result; }
      catch (error) { await c.query('ROLLBACK TO SAVEPOINT qa_case'); await c.query('RELEASE SAVEPOINT qa_case'); throw error; }
    }
    const vehicle = async id => (await c.query('SELECT id,status,store_id,current_store_id FROM qa_cross_vehicles WHERE id=$1',[id])).rows[0];
    const values = (id,status,store_id=32) => ({name:`Vehicle QA ${id}`,license:`QA-${id}`,brand:'Honda',type:'xeso',year:2026,store_id,status,color:'',chassis:'',engine:'',odometer:null});
    try {
      await c.query('BEGIN');
      for (const table of tables) {
        if (table === 'management_contract_vehicle_swaps') {
          // Schema from docs/sql/2026-10-09-contract-vehicle-swaps.sql; that older
          // migration is not installed on every environment. Never apply it here.
          await c.query('CREATE TEMP TABLE qa_cross_management_contract_vehicle_swaps (id bigint GENERATED BY DEFAULT AS IDENTITY, order_id bigint, order_item_id bigint, from_vehicle_id bigint, to_vehicle_id bigint, actor_id bigint, created_at timestamptz DEFAULT now())');
          continue;
        }
        await c.query(`CREATE TEMP TABLE qa_cross_${table} (LIKE himoto.${table} INCLUDING DEFAULTS)`);
        if (table !== 'management_contract_payments') {
          await c.query(`ALTER TABLE qa_cross_${table} ALTER COLUMN id DROP DEFAULT`);
          await c.query(`ALTER TABLE qa_cross_${table} ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 10000)`);
        }
      }
      await c.query('CREATE TEMP VIEW qa_cross_staff_account_attribution AS SELECT id,user_id,full_name,store_id FROM qa_cross_staff_profiles');
      await c.query(`INSERT INTO qa_cross_users(id,name,email,password,role_id) VALUES (143,'Người thao tác QA','qa-cross@example.invalid','unused',1);
        INSERT INTO qa_cross_stores(id,store_name) VALUES (31,'CS Láng'),(32,'CS Nguyễn Hoàng'),(34,'CS Thuốc Bắc');
        INSERT INTO qa_cross_customers(id,name,phone,id_card,status,store_id,address,relatives) VALUES (7,'Customer QA','0900000011','001234567890',1,31,'Address QA','[]');
        INSERT INTO qa_cross_staff_profiles(id,staff_code,full_name,phone,store_id) VALUES (700,'QA700','Staff Láng QA','0900000091',31);
        INSERT INTO qa_cross_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES
          (100,'Vehicle QA 100','Honda','xeso',2026,32,32,'QA-100','ready',143),
          (101,'Vehicle QA 101','Honda','xeso',2026,34,34,'QA-101','ready',143);
        INSERT INTO qa_cross_cash(id,store_id,opening_balance,status) VALUES (5,31,0,'Active'),(15,32,0,'Active');`);
      await updateDatabaseVehicle(proxy,100,values(100,'using'),143);
      const checkout = await vehicle(100);
      assert.deepEqual([checkout.status,Number(checkout.store_id),Number(checkout.current_store_id)],['using',32,32]);
      const statusEvent = (await c.query("SELECT event_type,ref_type,notes,created_by FROM qa_cross_vehicle_location_events WHERE vehicle_id=100")).rows;
      assert.deepEqual(statusEvent.map(row=>[row.event_type,row.ref_type,row.notes,Number(row.created_by)]),[['status_change','using',null,143]]);
      const audit=(await c.query('SELECT audit_snapshot FROM qa_cross_vehicle_location_events WHERE vehicle_id=100')).rows[0].audit_snapshot;
      assert(audit.changes.some(change=>change.field==='status'&&change.from_value==='ready'&&change.to_value==='using'));
      checks.push('PostgreSQL TEMP: Nguyễn Hoàng can reconcile a checkout as using before a contract exists, preserving both inventory branches');

      const customer = mapApiRow('customers',(await c.query('SELECT * FROM qa_cross_customers WHERE id=7')).rows[0]);
      const dataset = {stores:[{id:31,name:'CS Láng'}],staff:[{id:700,store_id:31}],vehicles:[{id:100,name:'Vehicle QA 100',license:'QA-100',store_id:32,store_name:'CS Nguyễn Hoàng'}],customers:[customer],contracts:[]};
      const draft = document.createContractDraft(dataset,'31');
      draft.customer_id=7; draft.customer=document.customerDetails(customer); draft.staff_id='700';
      draft.vehicles=[document.vehicleDetails(dataset.vehicles[0],draft.customer)];
      draft.vehicles[0].stock_store_id='31'; draft.vehicles[0].stock_store_name='Client must not override inventory';
      draft.start_date=time.vietnamRentalTime(new Date(Date.now()-3600000)); draft.end_date=time.addRentalDays(draft.start_date,'1');
      draft.unit_price='150000'; draft.total_amount='150000'; draft.deposit_amount='1000000';
      const save = () => saveDatabaseDraft(proxy,null,{draft,status:'draft',rental_type:'daily',notes:'QA TEMP'});
      const saved = await save();
      const id = Number(saved.id);
      const snapshot = (await c.query('SELECT store_id,draft_payload,customer_source_url FROM qa_cross_orders WHERE id=$1',[id])).rows[0];
      assert.equal(Number(snapshot.store_id),31); assert.equal(snapshot.customer_source_url,'CS Láng');
      assert.equal(snapshot.draft_payload.management_composer.draft.vehicles[0].stock_store_id,'32');
      assert.equal(snapshot.draft_payload.management_composer.draft.vehicles[0].stock_store_name,'CS Nguyễn Hoàng');
      assert.equal((await c.query('SELECT count(*)::int AS n FROM qa_cross_transactions')).rows[0].n,0);
      const duplicate = await save();
      checks.push('PostgreSQL TEMP: source Láng saves an NH vehicle already using, inventory snapshot is verified by the server and drafts create no receipts');
      // Current issue policy requires ready stock even when a previous using flag has no open contract.
      await updateDatabaseVehicle(proxy,100,values(100,'ready'),143);
      await c.query('SAVEPOINT qa_old_draft_sales');
      try {
        const oldDraft={...structuredClone(draft),contract_number:'005807'};
        delete oldDraft.sales_staff_id;delete oldDraft.sales_staff_name;
        const old=await saveDatabaseDraft(proxy,null,{draft:oldDraft,status:'draft',rental_type:'daily',notes:'QA pre-update draft'});
        const oldId=Number(old.id);
        assert.equal(old.draft_reference,'005807');
        assert.equal((await c.query('SELECT count(*)::int AS n FROM qa_cross_transactions WHERE order_id=$1',[oldId])).rows[0].n,0);
        const issued=await finalizeContractDraft(proxy,oldId,143,{revision:old.draft_revision,paid_at:time.vietnamRentalTime(new Date(Date.now()-60000)),deposit:{method:'cash',account_id:5},rental:{method:'cash',account_id:5}});
        assert.equal(issued.code,'005807');
        assert.equal((await c.query('SELECT order_status FROM qa_cross_orders WHERE id=$1',[oldId])).rows[0].order_status,'renting');
        checks.push('PostgreSQL TEMP: an older 005807 draft without optional sales ID/name saves and issues with its original paper number; draft save creates no receipt');
      } finally { await c.query('ROLLBACK TO SAVEPOINT qa_old_draft_sales');await c.query('RELEASE SAVEPOINT qa_old_draft_sales'); }
      // Generic TLS works without a person. An optional real TLS id also checks legacy profile compatibility.
      const tlsProfileId=Number(process.argv.find(arg=>arg.startsWith('--tls-profile-id='))?.split('=')[1]);
      {
        await c.query('SAVEPOINT qa_tls');
        try {
          await c.query("INSERT INTO qa_cross_stores(id,store_name) VALUES(36,'Trụ Sở Chính'); INSERT INTO qa_cross_cash(id,store_id,opening_balance,status) VALUES(16,36,0,'Active'); INSERT INTO qa_cross_staff_profiles(id,staff_code,full_name,phone,store_id) VALUES(701,'QA701','Đại diện NH QA','0900000092',32)");
          const tlsDraft={...structuredClone(draft),store_id:'36',vehicle_store_id:'32',staff_id:'701',customer_source:'TLS',tls_staff_id:Number.isSafeInteger(tlsProfileId)&&tlsProfileId>0?String(tlsProfileId):''};
          const tlsSave=()=>saveDatabaseDraft(proxy,null,{draft:tlsDraft,status:'draft',rental_type:'daily',notes:'QA TLS TEMP'});
          tlsDraft.staff_id='700';
          const supported=await tlsSave();
          assert.equal((await c.query('SELECT draft_payload FROM qa_cross_orders WHERE id=$1',[supported.id])).rows[0].draft_payload.management_composer.draft.staff_id,'700');
          tlsDraft.staff_id='';tlsDraft.staff_name='Nhân viên mới hỗ trợ QA';
          const freeText=await tlsSave();
          assert.equal((await c.query('SELECT draft_payload FROM qa_cross_orders WHERE id=$1',[freeText.id])).rows[0].draft_payload.management_composer.draft.staff_name,'Nhân viên mới hỗ trợ QA');
          tlsDraft.staff_id='999999';
          const stale=await tlsSave();
          assert.equal((await c.query('SELECT draft_payload FROM qa_cross_orders WHERE id=$1',[stale.id])).rows[0].draft_payload.management_composer.draft.staff_id,'');
          tlsDraft.staff_id='701';
          tlsDraft.staff_name='';
          const tlsSaved=await tlsSave();
          const issued=await finalizeContractDraft(proxy,Number(tlsSaved.id),143,{revision:tlsSaved.draft_revision,paid_at:time.vietnamRentalTime(new Date(Date.now()-60000)),deposit:{method:'cash',account_id:16},rental:{method:'cash',account_id:16}});
          assert.equal(issued.transaction_ids.length,2);
          const tlsOrder=(await c.query('SELECT store_id,draft_payload FROM qa_cross_orders WHERE id=$1',[tlsSaved.id])).rows[0];
          const composer=tlsOrder.draft_payload.management_composer;
          assert.equal(Number(tlsOrder.store_id),36);assert.equal(composer.draft.vehicle_store_id,'32');assert.equal(composer.draft.staff_id,'701');
          assert.equal(composer.draft.customer_source,'TLS');
          if(Number.isSafeInteger(tlsProfileId)&&tlsProfileId>0){
            assert.equal(composer.draft.tls_staff_id,String(tlsProfileId));
            assert.equal(composer.sales_attribution?.TLS?.staff_id,tlsProfileId);
          }else{
            assert.equal(composer.draft.tls_staff_id,'');assert(!composer.sales_attribution);
          }
          assert.equal(Number((await vehicle(100)).current_store_id),32);
          const listing=()=>proxy.query(CONTRACT_LIST_SQL+' AND o.id=$1',[tlsSaved.id]);
          let projected=(await listing()).rows[0];
          let reopened=document.createContractDraft(dataset,'all',mapApiRow('contracts',projected));
          assert.equal(reopened.vehicle_store_id,'32');assert.equal(reopened.staff_id,'701');
          assert.equal(reopened.tls_staff_id,Number.isSafeInteger(tlsProfileId)&&tlsProfileId>0?String(tlsProfileId):'');
          const profile=load(path.join(root,'lib/management/contract-profile')).contractProfile(tlsDraft);
          profile.customer.address='Địa chỉ hồ sơ bổ sung QA';
          const {updateContractProfile}=load(path.join(root,'lib/server/contract-profile'));
          await updateContractProfile(proxy,Number(tlsSaved.id),143,{revision:String((await c.query('SELECT xmin::text AS r FROM qa_cross_orders WHERE id=$1',[tlsSaved.id])).rows[0].r),profile});
          projected=(await listing()).rows[0];
          reopened=document.createContractDraft(dataset,'all',mapApiRow('contracts',projected));
          assert.equal(reopened.customer.address,'Địa chỉ hồ sơ bổ sung QA');assert.equal(reopened.tls_staff_id,profile.tls_staff_id || '');
          assert.equal(projected.draft_payload.management_composer.draft,undefined,'Issued lists must not restore the full draft blob');
          checks.push('PostgreSQL TEMP: TLS source stays valid with or without a chosen TLS employee; supporting staff from another branch, new free-text names and stale IDs with a typed name save; issue preserves the stock/revenue branches');
          checks.push('PostgreSQL TEMP: reopening an issued contract preserves its vehicle branch, representative without a login, TLS and subsequent profile changes without sending the full draft blob');
        } finally {await c.query('ROLLBACK TO SAVEPOINT qa_tls');await c.query('RELEASE SAVEPOINT qa_tls');}
      }
      await c.query('SAVEPOINT qa_manual_sales');
      try {
        await c.query("UPDATE qa_cross_stores SET kind='lease_to_own',store_name='CS Thuê sở hữu QA' WHERE id=32");
        const billing=load(path.join(root,'lib/management/contract-billing'));
        const manualDraft={...structuredClone(draft),sales_staff_id:'',sales_staff_name:'  NVKD chưa có hồ sơ QA  ',customer_source:'Giới thiệu ngoài danh sách QA',ownership:true,ownership_term_months:'12',package_name:'Theo tháng',end_date:billing.addRentalMonths(draft.start_date,1)};
        const edits={draft:manualDraft,status:'draft',rental_type:'ownership',notes:'QA manual source'};
        const manual=await saveDatabaseDraft(proxy,null,edits);
        const manualId=Number(manual.id);
        let reopened=document.createContractDraft(dataset,'all',mapApiRow('contracts',manual));
        assert.equal(reopened.customer_source,manualDraft.customer_source);assert.equal(reopened.sales_staff_name,'NVKD chưa có hồ sơ QA');assert.equal(reopened.sales_staff_id,'');
        assert.equal(manual.draft_payload.management_composer.sales_attribution.NVKD.staff_id,null);
        await assert.rejects(isolated(()=>saveDatabaseDraft(proxy,null,{...edits,draft:{...manualDraft,sales_staff_name:'x'.repeat(192)}})),/191/);
        await assert.rejects(isolated(()=>saveDatabaseDraft(proxy,null,{...edits,draft:{...manualDraft,sales_staff_name:17}})),/không hợp lệ|191/);
        const issued=await finalizeContractDraft(proxy,manualId,143,{revision:manual.draft_revision,paid_at:time.vietnamRentalTime(new Date(Date.now()-60000)),deposit:{method:'cash',account_id:5},rental:{method:'cash',account_id:5}});
        const listing=()=>proxy.query(`${CONTRACT_LIST_SQL} AND o.id=$1`,[manualId]);
        reopened=document.createContractDraft(dataset,'all',mapApiRow('contracts',(await listing()).rows[0]));
        assert.equal(reopened.sales_staff_name,'NVKD chưa có hồ sơ QA');assert.equal(reopened.sales_staff_id,'');assert.equal(issued.total_amount,150000);
        const {contractProfile}=load(path.join(root,'lib/management/contract-profile'));
        const {updateContractProfile}=load(path.join(root,'lib/server/contract-profile'));
        const before=(await c.query('SELECT total,pid,return_at,order_status,xmin::text AS revision FROM qa_cross_orders WHERE id=$1',[manualId])).rows[0];
        const receiptsBefore=(await c.query('SELECT count(*)::int AS n FROM qa_cross_transactions')).rows[0].n;
        const profile={...contractProfile(reopened),sales_staff_id:'',sales_staff_name:'NVKD nhập tay khác QA',customer_source:'Nguồn nhập tay sau phát hành QA'};
        const updated=await updateContractProfile(proxy,manualId,143,{revision:before.revision,profile});
        let projected=(await listing()).rows[0];
        reopened=document.createContractDraft(dataset,'all',mapApiRow('contracts',projected));
        assert.equal(reopened.sales_staff_name,profile.sales_staff_name);assert.equal(projected.sales_staff_name,profile.sales_staff_name);assert.equal(reopened.customer_source,profile.customer_source);assert.equal(projected.customer_source,profile.customer_source);
        await updateContractProfile(proxy,manualId,143,{revision:updated.revision,profile:{...profile,sales_staff_name:''}});
        projected=(await listing()).rows[0];
        reopened=document.createContractDraft(dataset,'all',mapApiRow('contracts',projected));
        assert.equal(reopened.sales_staff_name,'');assert.equal(projected.sales_staff_name,'');
        const after=(await c.query('SELECT total,pid,return_at,order_status FROM qa_cross_orders WHERE id=$1',[manualId])).rows[0];
        for(const key of ['total','pid','order_status'])assert.equal(after[key],before[key]);assert.equal(String(after.return_at),String(before.return_at));
        assert.equal((await c.query('SELECT count(*)::int AS n FROM qa_cross_transactions')).rows[0].n,receiptsBefore);
        checks.push('PostgreSQL TEMP: ownership manual source/NVKD survive draft, issue, profile edit and reopen; clearing never restores an old name; invalid names rejected and profile edits preserve receipts/money/dates');
      } finally {await c.query('ROLLBACK TO SAVEPOINT qa_manual_sales');await c.query('RELEASE SAVEPOINT qa_manual_sales');}
      const input = {revision:saved.draft_revision,paid_at:time.vietnamRentalTime(new Date(Date.now()-60000)),deposit:{method:'cash',account_id:5},rental:{method:'cash',account_id:5}};
      await assert.rejects(isolated(()=>finalizeContractDraft(proxy,id,143,{...input,rental:{method:'cash',account_id:15}})),/không thuộc cơ sở|không khớp hình thức/);
      const final = await finalizeContractDraft(proxy,id,143,input);
      assert.equal(final.transaction_ids.length,2);
      const order = (await c.query('SELECT * FROM qa_cross_orders WHERE id=$1',[id])).rows[0];
      assert.equal(Number(order.store_id),31); assert.equal(order.order_status,'renting');
      const receipts = (await c.query('SELECT store_id,cash_id,value FROM qa_cross_transactions WHERE order_id=$1 ORDER BY id',[id])).rows;
      assert.deepEqual(receipts.map(r=>[Number(r.store_id),Number(r.cash_id),Number(r.value)]),[[31,5,1000000],[31,5,150000]]);
      assert.equal(Number((await vehicle(100)).current_store_id),32); assert.equal((await vehicle(100)).status,'using');
      assert.equal(Number((await c.query('SELECT store_id FROM qa_cross_customers WHERE id=7')).rows[0].store_id),31);
      const { filterRows, EMPTY_QUERY } = load(path.join(root,'lib/management/table-utils'));
      const { summarizeContracts } = load(path.join(root,'lib/management/contract-summary'));
      const mappedOrder = mapApiRow('contracts',order);
      assert.equal(summarizeContracts(filterRows([mappedOrder],EMPTY_QUERY,'31'),[customer]).totalAmount,150000);
      assert.equal(summarizeContracts(filterRows([mappedOrder],EMPTY_QUERY,'32'),[customer]).totalAmount,0);
      checks.push('PostgreSQL TEMP: ready stock finalizes without transfer; rental revenue and deposit receipts use Láng accounts, NH accounts are rejected and customer ownership stays Láng');

      await assert.rejects(isolated(()=>finalizeContractDraft(proxy,Number(duplicate.id),143,{...input,revision:duplicate.draft_revision})),/hợp đồng/);
      await assert.rejects(isolated(()=>updateDatabaseVehicle(proxy,100,values(100,'ready'),143)),/hợp đồng mở/);
      await assert.rejects(isolated(()=>updateDatabaseVehicle(proxy,100,values(100,'using',31),143)),/không được đổi cơ sở/);
      await updateDatabaseVehicle(proxy,100,{...values(100,'using'),color:'Black'},143);
      checks.push('PostgreSQL TEMP: an actual open contract blocks double rental, manual status reset and stock transfer; harmless profile edits remain possible');
      const line = (await c.query('SELECT id,xmin::text AS revision FROM qa_cross_order_vehicle_details WHERE order_id=$1',[id])).rows[0];
      await replaceContractVehicle(proxy,143,{item_id:Number(line.id),item_revision:line.revision,vehicle_id:101});
      assert.equal((await vehicle(100)).status,'ready'); assert.equal(Number((await vehicle(100)).current_store_id),32);
      assert.equal((await vehicle(101)).status,'using'); assert.equal(Number((await vehicle(101)).current_store_id),34);
      const revision = (await c.query('SELECT xmin::text AS r FROM qa_cross_order_vehicle_details WHERE id=$1',[line.id])).rows[0].r;
      await recordVehicleReturn(proxy,143,{item_id:Number(line.id),item_revision:revision,returned_at:time.vietnamRentalTime(),hourly_rate:'0'});
      assert.equal((await vehicle(101)).status,'ready'); assert.equal(Number((await vehicle(101)).current_store_id),34);
      assert.equal(Number((await c.query('SELECT store_id FROM qa_cross_orders WHERE id=$1',[id])).rows[0].store_id),31);
      checks.push('PostgreSQL TEMP: replacement from a third stock branch and return release vehicles at their physical branches while all revenue remains Láng');
    } finally { await c.query('ROLLBACK'); c.release(); }
  }
  console.log(JSON.stringify({passed:checks.length,checks,permanentBusinessWrites:0},null,2));
}
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const task=process.argv.includes('--admin-scope')?dataAccess.run({id:143,access_role:'admin',scope_all:true,store_id:null,operation:''},run):run();
task.then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});

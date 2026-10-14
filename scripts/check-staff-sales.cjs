const assert = require('node:assert/strict');
const path = require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), false, {info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
const {staffSales} = load(path.join(root,'lib/server/staff-sales'));
const {createInstallmentPlan} = load(path.join(root,'lib/management/contract-billing'));
const {parseContractProfile,updateContractProfile} = load(path.join(root,'lib/server/contract-profile'));
const {contractProfile} = load(path.join(root,'lib/management/contract-profile'));
const doc = load(path.join(root,'lib/management/contract-document'));
const pool = load(path.join(root,'lib/server/himoto-database')).himotoPool;
const checks = [];
async function main(){
  const c=await pool.connect();
  const tables=['orders','transactions','staff_profiles','vehicles','order_vehicle_details'];
  const proxy={query(sql,params){let q=sql;for(const table of tables)q=q.replaceAll(`himoto.${table}`,`pg_temp.qa_sales_${table}`);assert(!q.includes('himoto.'),'Every business query must use TEMP');return c.query(q,params);}};
  const attempt=async work=>{await c.query('SAVEPOINT sales_case');try{const r=await work();await c.query('RELEASE SAVEPOINT sales_case');return r;}catch(error){await c.query('ROLLBACK TO SAVEPOINT sales_case');await c.query('RELEASE SAVEPOINT sales_case');throw error;}};
  const customer={...doc.customerDetails(),name:'Khách QA',phone:'0900000077'};
  try{
    await c.query('BEGIN');
    for(const table of tables)await c.query(`CREATE TEMP TABLE qa_sales_${table} (LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`);
    await c.query("INSERT INTO qa_sales_staff_profiles(id,staff_code,full_name,phone,position,status,store_id) VALUES(10,'QA-10','NVKD QA','0900000010','NVKD','active',35),(20,'QA-20','TLS QA','0900000020','TLS','active',35)");
    async function order(id,customerId,store,date,rent,patch={}){
      const draft={sales_staff_id:'10',tls_staff_id:'20',total_amount:String(rent),extra_charges:[],...patch.draft};
      const payload={management_composer:{draft,...patch.composer}};
      await c.query(`INSERT INTO qa_sales_orders(id,customer_id,store_id,order_status,order_mode,rent_at,created_at,total,total_rental_fees,pid,draft_payload)
        VALUES($1,$2,$3,$4,'standard',$5,$5,$6,$7,0,$8)`,[id,customerId,store,patch.status || 'renting',`${date}T09:00:00+07:00`,String(patch.total || rent),rent,JSON.stringify(payload)]);
    }
    let tid=1;
    const receipt=(id,date,amount,name='order:rental_fees',status='approved')=>c.query(`INSERT INTO qa_sales_transactions(id,order_id,store_id,user_id,note,created_at,value,name,type,status) VALUES($1,$2,35,143,'QA',$3,$4,$5,'in',$6)`,[tid++,id,`${date}T09:00:00+07:00`,amount,name,status]);
    await order(1,77,35,'2026-09-01',3000000,{total:7000000,draft:{extra_charges:[{name:'Phí ban đầu',amount:'100000'}]}});
    await receipt(1,'2026-09-01',90000);
    await receipt(1,'2026-10-11',20000,'order:payment');
    await receipt(1,'2026-10-11',2000000,'order:renewal');
    await receipt(1,'2026-10-11',3000000,'order:deposit');
    await receipt(1,'2026-10-11',500000,'order:extra');
    await order(2,77,36,'2026-10-12',3000000);
    await receipt(2,'2026-10-12',1000000);
    await order(3,78,35,'2026-10-13',6000000); // New, entirely unpaid.
    const plan=createInstallmentPlan('2026-10-13T09:00','2027-10-13T09:00','Theo tháng',3000000);
    await order(4,79,35,'2026-10-13',3000000,{composer:{installment_plan:plan}});
    await receipt(4,'2026-10-13',3000000);
    await receipt(4,'2026-10-13',3000000,'order:deposit');
    await receipt(4,'2026-10-13',7000000,'order:rental_fees','pending');
    await order(5,90,35,'2026-10-13',200000,{draft:{sales_staff_id:'',tls_staff_id:''}});
    await receipt(5,'2026-10-13',200000);
    await order(6,78,35,'2026-01-01',9000000,{status:'draft'});
    await order(7,79,35,'2026-01-01',9000000,{status:'cancelled'});
    const custom=createInstallmentPlan('2026-10-13T09:00','2026-11-13T09:00','Tùy chọn',100000,[{due_at:'2026-10-20T09:00',amount:'200000'},{due_at:'2026-11-01T09:00',amount:'300000'}]);
    assert(custom);
    await order(8,80,35,'2026-10-13',100000,{composer:{installment_plan:custom}});
    await order(9,81,35,'2026-10-13',3000000,{composer:{rental_type:'ownership'},draft:{ownership:true,ownership_term_months:'12'}});
    await receipt(9,'2026-10-13',3000000);
    await receipt(9,'2026-10-13',3000000,'order:deposit');
    await order(10,81,35,'2026-10-14',1000000);
    await receipt(10,'2026-10-14',1000000);
    let result=await staffSales(proxy,'2026-10-01','2026-10-31');
    const row=role=>result.rows.find(r=>r.department===role);
    assert.equal(row('NVKD').revenue,10010000);assert.equal(row('TLS').revenue,6000000);
    assert.equal(row('TLS').contracts,1);assert.equal(row('TLS').new_customers,1);
    assert.equal(result.unassigned_revenue,200000);assert.equal(result.unassigned_contracts,1);
    checks.push('NVKD = real rent + renewals, no deposit/fees/pending receipts; TLS excludes all ownership contracts, including legacy schedules and manual labels');
    result=await staffSales(proxy,'2026-10-01','2026-10-31',36);
    assert.equal(row('NVKD').revenue,1000000);assert(!row('TLS'));
    checks.push('Repeat customers, including former ownership renters, never become new when filtering branch/date; drafts/cancellations do not consume the first rental');
    await receipt(4,'2026-11-13',3000000,'order:payment');
    result=await staffSales(proxy,'2026-11-01','2026-11-30');
    assert.equal(row('NVKD').revenue,3000000);assert(!row('TLS'));
    checks.push('Later installment receipts count once for NVKD; TLS is never credited again when the same contract is paid or renewed');
    await assert.rejects(()=>staffSales(proxy,'2026-02-30','2026-10-01'),/khoảng ngày/);
    await c.query('UPDATE qa_sales_orders SET total=$1 WHERE id=3',['12000000']);
    result=await staffSales(proxy,'2026-10-01','2026-10-31');assert.equal(row('TLS').revenue,6000000);
    checks.push('Renewals increasing current debt never inflate the original TLS contract value; invalid date filters are rejected');

    const dataset={stores:[{id:35}],vehicles:[{id:101}],staff:[],customers:[],contracts:[]};
    const draft={...doc.createContractDraft(dataset,'35'),customer_id:77,customer,vehicles:[{...doc.emptyVehicle(),id:'101'}],start_date:'2026-10-13T09:00',end_date:'2026-10-14T09:00',total_amount:'300000',unit_price:'300000',deposit_amount:'3000000'};
    assert.deepEqual(doc.validateOperationalDraft(draft,dataset,[],'api'),{});
    assert(doc.validateContractDraft(draft,dataset,[],'api').relative_0_name);
    const requirements={phone:true,id_card:false,address:false,representative:false,relatives:0};
    assert.deepEqual(doc.validateContractDraft({...draft,document_requirements:requirements},dataset,[],'api'),{});
    checks.push('Operational issue accepts missing legal paperwork, while printing follows explicit per-contract requirements');
    const profile=contractProfile({...draft,document_requirements:requirements,sales_staff_id:'10',tls_staff_id:'20',ownership_term_months:'24'});
    assert.throws(()=>parseContractProfile({revision:'1',profile:{...profile,total_amount:'1'}}),/Chỉ cập nhật/);
    const before=(await c.query('SELECT total,total_rental_fees,pid,order_status,customer_id,rent_at,return_at,xmin::text AS revision FROM qa_sales_orders WHERE id=4')).rows[0];
    const receiptCount=(await c.query('SELECT count(*)::int AS n FROM qa_sales_transactions')).rows[0].n;
    const updated=await attempt(()=>updateContractProfile(proxy,4,143,{revision:before.revision,profile:{...profile,customer:{...customer,id_card:'001234567877',address:'Địa chỉ bổ sung'}}}));
    assert(updated.revision);
    const after=(await c.query('SELECT total,total_rental_fees,pid,order_status,customer_id,rent_at,return_at,draft_payload FROM qa_sales_orders WHERE id=4')).rows[0];
    for(const key of ['total','total_rental_fees','pid','order_status','customer_id'])assert.equal(after[key],before[key]);
    for(const key of ['rent_at','return_at'])assert.equal(String(after[key]),String(before[key]));
    assert.equal(after.draft_payload.management_composer.profile.customer.id_card,'001234567877');
    assert.equal(after.draft_payload.management_composer.profile.ownership_term_months,'24');
    assert.throws(()=>parseContractProfile({revision:updated.revision,profile:{...profile,ownership_term_months:'60'}}),/Phân loại/);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM qa_sales_transactions')).rows[0].n,receiptCount);
    await assert.rejects(()=>attempt(()=>updateContractProfile(proxy,4,143,{revision:updated.revision,profile:{...profile,sales_staff_id:'20'}})),/NVKD/);
    checks.push('Supplementing issued paperwork/employee attribution preserves debt, dates, customer identity and receipts; wrong department or financial keys rejected');
    console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

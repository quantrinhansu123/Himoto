const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const service=load(path.join(root,'lib/server/contract-edit'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
const {createContractDraft,emptyVehicle}=load(path.join(root,'lib/management/contract-document'));
const staff={id:70001,access_role:'branch_staff',store_id:32,scope_all:false,permissions:[...ACCESS_ROLES.branch_staff.permissions],operation:''};
const draft=createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all');
Object.assign(draft,{contract_number:'000123',store_id:'32',vehicle_store_id:'32',customer_id:1,start_date:'2026-10-01T09:00',end_date:'2026-10-03T09:00',unit_price:'100000',total_amount:'200000',deposit_amount:'1000000',created_on:'2026-10-01'});
Object.assign(draft.customer,{name:'Khách kiểm tra',phone:'0900000001',id_card:'001234567890'});
draft.vehicles=[{...emptyVehicle(),id:'1',license:'QA-001'}];
const body=()=>({revision:'1',draft:structuredClone(draft),status:'renting',rental_type:'daily',notes:'Sửa toàn bộ hợp đồng'});
async function main(){
 assert.equal(service.parseContractEdit(body()).draft.deposit_amount,'1000000');
 for(const patch of [{deposit_amount:'-1'},{unit_price:'abc'},{total_amount:'1.5'},{start_date:'2026-02-30T09:00'}])assert.throws(()=>service.parseContractEdit({...body(),draft:{...draft,...patch}}));
 for(const patch of [{status:'draft'},{status:'bogus'},{total:'100'}])assert.throws(()=>service.parseContractEdit({...body(),...patch}));
 assert.equal(service.parseContractEdit({...body(),revision:'bad',draft:{...draft,end_date:draft.start_date}}).revision,'0');
 assert.equal(service.parseContractEdit({...body(),draft:{...draft,vehicles:[draft.vehicles[0],draft.vehicles[0]]}}).ids.length,1);
 assert.equal(load(path.join(root,'lib/server/access-request')).requestPermission('/api/auth/order/car-rental/1/edit','PATCH'),'contracts.draft');
 if(!process.argv.includes('--live-temp')){console.log('Full edit parsing and permission checks passed.');return;}
 const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool,c=await pool.connect(),schema='qa_full_edit_'+process.pid;
 const proxy={query:async(sql,values)=>{
   if(sql.includes('himoto.vehicle_inventory()'))sql=sql.replace('himoto.vehicle_inventory()','himoto.vehicles');
   if(sql.includes('himoto.lock_vehicles_for_contract('))sql='SELECT id,status,store_id FROM himoto.vehicles WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE';
   if(sql.includes('himoto.mark_vehicles_using('))sql="UPDATE himoto.vehicles SET status='using' WHERE id=ANY($1::bigint[])";
   if(sql.includes('himoto.release_returned_contract_vehicle('))sql="UPDATE himoto.vehicles SET status='ready' WHERE id=(SELECT vehicle_id FROM himoto.order_vehicle_details WHERE id=$1)";
   if(sql.includes('himoto.vehicle_window_conflicts('))sql="SELECT d.vehicle_id FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id WHERE d.vehicle_id=ANY($1::bigint[]) AND d.order_id<>$2 AND d.deleted_at IS NULL AND d.rent_at<$4::timestamptz AND COALESCE(d.completed_at,d.return_at)>$3::timestamptz";
   return c.query(sql.replaceAll('himoto.',schema+'.'),values);
 }};
 try{
   await c.query('BEGIN');
   await c.query(`CREATE SCHEMA ${schema};
     CREATE TABLE ${schema}.orders(LIKE himoto.orders INCLUDING DEFAULTS);
     CREATE TABLE ${schema}.order_vehicle_details(LIKE himoto.order_vehicle_details INCLUDING DEFAULTS);
     CREATE SEQUENCE ${schema}.line_ids START 100;
     ALTER TABLE ${schema}.order_vehicle_details ALTER id SET DEFAULT nextval('${schema}.line_ids');
     CREATE TABLE ${schema}.vehicles(id bigint,status text,store_id bigint,license text,store_name text,updated_at timestamptz);
     CREATE TABLE ${schema}.stores(id bigint,store_name text,kind text);
     CREATE TABLE ${schema}.customers(id bigint,deleted_at timestamptz);
     CREATE TABLE ${schema}.users(id bigint,name text);
     CREATE TABLE ${schema}.management_contract_notifications(order_id bigint,status text);
     CREATE TABLE ${schema}.management_contract_payments(order_id bigint,transaction_id bigint,renewal_payload jsonb);
     ALTER TABLE ${schema}.orders ENABLE ROW LEVEL SECURITY;
     CREATE POLICY branch_scope ON ${schema}.orders USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
     GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped;
     GRANT SELECT,UPDATE,INSERT,DELETE ON ALL TABLES IN SCHEMA ${schema} TO himoto_scoped;
     GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO himoto_scoped;
     INSERT INTO ${schema}.stores VALUES(32,'QA',NULL);INSERT INTO ${schema}.customers VALUES(1,NULL);
     INSERT INTO ${schema}.vehicles VALUES(1,'using',32,'QA-001','QA',now()),(2,'ready',32,'QA-002','QA',now());
     CREATE FUNCTION ${schema}.contract_number_available(target text,excluded_order bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
     GRANT EXECUTE ON FUNCTION ${schema}.contract_number_available(text,bigint) TO himoto_scoped;`);
   await c.query(`INSERT INTO ${schema}.orders(id,store_id,customer_id,order_status,order_type,contract_number,total,pid,first_deposit_amount,rent_at,return_at,draft_payload)
     VALUES(1,32,1,'renting','daily','000123','200000',1200000,1000000,'2026-10-01T09:00+07','2026-10-03T09:00+07',$1),
     (2,33,1,'renting','daily','FOREIGN','0',0,0,NULL,NULL,'{}')`,[JSON.stringify({management_composer:{draft,rental_type:'daily'}})]);
   await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,hiring_fee,total_money,type)VALUES(1,1,1,'2026-10-01T09:00+07','2026-10-03T09:00+07',100000,200000,'day')`);
   await c.query("SELECT set_config('himoto.store_id','32',true),set_config('himoto.scope_all','false',true),set_config('himoto.actor_id','70001',true)");
   await c.query('SET LOCAL ROLE himoto_scoped');
   const revision=async()=>String((await proxy.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=1')).rows[0].revision);
   const apply=async(input,id=1,user=staff)=>dataAccess.run(user,()=>service.updateIssuedContract(proxy,id,user.id,input));
   await assert.rejects(()=>apply(body(),2),error=>error.status===404);
   await assert.rejects(()=>apply(body(),1,{...staff,access_role:'accounting',permissions:[...ACCESS_ROLES.accounting.permissions]}),error=>error.status===403);
   await proxy.query("INSERT INTO himoto.management_contract_notifications VALUES(1,'sending')");
   let input=body();input.revision='0';input.draft.deposit_amount='1500000';input.draft.unit_price='120000';input.draft.total_amount='365000';input.draft.end_date='2026-10-04T09:00';input.draft.extra_charges=[{name:'Phí giao xe',amount:'5000',method:'cash'}];
   input.draft.vehicles[0].driver_name='Người lái mới';
   await apply(input);
   let order=(await proxy.query('SELECT * FROM himoto.orders WHERE id=1')).rows[0],line=(await proxy.query('SELECT * FROM himoto.order_vehicle_details WHERE id=1')).rows[0];
   assert.equal(Number(order.first_deposit_amount),1500000);assert.equal(Number(order.total),365000);assert.equal(Number(order.total_rental_fees),360000);assert.equal(Number(order.pid),1200000);
   assert.equal(Number(line.hiring_fee),120000);assert.equal(line.driver_name,'Người lái mới');assert.equal(new Date(line.return_at).toISOString(),'2026-10-04T02:00:00.000Z');
   assert.equal(order.draft_payload.management_composer.full_contract_edits.length,1);
   const mapped=load(path.join(root,'lib/management/repository')).mapApiRow('contracts',{...order,status:order.order_status,draft_revision:await revision()});
   const reopened=createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all',mapped);
   assert.equal(reopened.deposit_amount,'1500000');assert.equal(reopened.total_amount,'365000');
   const productionSQL=load(path.join(root,'lib/server/contract-drafts')).CONTRACT_LIST_SQL;
   const projection=productionSQL.match(/CASE WHEN o.order_status='draft' THEN jsonb_build_object\([\s\S]*?END AS draft_payload/)[0];
   const projected=(await proxy.query(`SELECT ${projection},o.contract_number,o.order_status AS status,o.total AS total_amount,
     o.draft_payload #>> '{management_composer,draft,unit_price}' AS unit_price,
     o.first_deposit_amount AS deposit_amount,o.rent_at AS start_date,o.return_at AS end_date,o.id,o.store_id
     FROM himoto.orders o WHERE o.id=1`)).rows[0];
   const productionReopened=createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all',load(path.join(root,'lib/management/repository')).mapApiRow('contracts',projected));
   assert.equal(productionReopened.unit_price,'120000');assert.equal(productionReopened.extra_charges[0].amount,'5000');assert.equal(productionReopened.total_amount,'365000');
   assert.equal(productionReopened.vehicles[0].driver_name,'Người lái mới');
   assert.equal(createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all',{id:1,code:'legacy',name:'legacy',status:'renting',unit_price:123456}).unit_price,'123456');
   // Old directory details and incomplete identities do not block contract corrections.
   input.draft.customer.phone='';input.draft.customer.id_card='';input.draft.relatives[0].phone='Chưa có';input.draft.created_on='';
   input.draft.customer.address='Địa chỉ sửa trên hợp đồng';input.draft.customer_source_url='Nguồn khách đã sửa';input.draft.collateral_description='Tài sản sửa';input.draft.authorization_date='2026-10-02';
   await apply(input);
   const corrected=(await proxy.query('SELECT * FROM himoto.orders WHERE id=1')).rows[0];
   assert.equal(corrected.customer_source_url,'Nguồn khách đã sửa');assert.equal(corrected.contract_collateral_description,'Tài sản sửa');
   assert.equal(corrected.draft_payload.management_composer.profile.customer.address,'Địa chỉ sửa trên hợp đồng');
   await proxy.query("UPDATE himoto.vehicles SET status='using',store_id=33 WHERE id=2");
   input.revision=await revision();input.draft.vehicles=[{...emptyVehicle(),id:'2',license:'QA-002'}];await apply(input);
   assert.equal((await proxy.query('SELECT status FROM himoto.vehicles WHERE id=1')).rows[0].status,'ready');
   assert.equal((await proxy.query('SELECT status FROM himoto.vehicles WHERE id=2')).rows[0].status,'using');
   assert.equal(Number((await proxy.query('SELECT vehicle_id FROM himoto.order_vehicle_details WHERE order_id=1 AND deleted_at IS NULL')).rows[0].vehicle_id),2);
   await proxy.query("UPDATE himoto.stores SET kind='lease_to_own' WHERE id=32");
   const approval=load(path.join(root,'lib/server/contract-approval'));
   const approvalBody={revision:await revision()};
   await assert.rejects(()=>dataAccess.run(staff,()=>approval.approveIssuedContract(proxy,1,staff,approvalBody)),error=>error.status===403);
   const manager={...staff,access_role:'ownership_manager',permissions:[...ACCESS_ROLES.ownership_manager.permissions]};
   await assert.rejects(()=>dataAccess.run(manager,()=>approval.approveIssuedContract(proxy,1,manager,{revision:'0'})),error=>error.status===409);
   const beforeApproval=(await proxy.query('SELECT * FROM himoto.orders WHERE id=1')).rows[0];
   const approved=await dataAccess.run(manager,()=>approval.approveIssuedContract(proxy,1,manager,approvalBody));
   assert(approved.approved_at);assert.equal(approved.can_approve,false);
   const afterApproval=(await proxy.query('SELECT * FROM himoto.orders WHERE id=1')).rows[0];
   for(const key of ['total','pid','first_deposit_amount','order_status','store_id','rent_at','return_at'])assert.deepEqual(afterApproval[key],beforeApproval[key],key);
   assert.equal(afterApproval.draft_payload.management_composer.approval.actor_id,manager.id);
   const repeated=await dataAccess.run(manager,()=>approval.approveIssuedContract(proxy,1,manager,approvalBody));
   assert.equal(repeated.approved_at,approved.approved_at);
   input.revision=await revision();await apply(input);
   assert.equal((await proxy.query('SELECT * FROM himoto.orders WHERE id=1')).rows[0].draft_payload.management_composer.approval,undefined);
   assert(load(path.join(root,'lib/management/contract-approval')).isOwnershipApprovalContract({rental_type:'daily',store_kind:'lease_to_own'}));
   const incomplete=structuredClone(input);Object.assign(incomplete.draft,{start_date:'',end_date:'',vehicles:[],unit_price:'',total_amount:'',deposit_amount:'',customer_id:null});
   incomplete.draft.customer.name='';await apply(incomplete);
   const emptyOrder=(await proxy.query('SELECT * FROM himoto.orders WHERE id=1')).rows[0];assert.equal(Number(emptyOrder.total),0);assert.equal(emptyOrder.rent_at,null);
   const emptyReopened=createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all',load(path.join(root,'lib/management/repository')).mapApiRow('contracts',{...emptyOrder,status:'renting'}));
   assert.equal(emptyReopened.vehicles[0].id,'');assert.equal(emptyReopened.customer.name,'');
   console.log('Ownership approval passed: daily contracts at ownership stores are eligible, staff cannot approve, managers approve with revision checks, repeated approval is stable, money/stock unchanged, editing reopens review.');
   console.log('Full edit PostgreSQL fixtures passed: production read projection preserves price, fees and drivers; incomplete customer/relative data, stale form, Telegram sending, foreign/using stock do not block corrections. Money/deposit/dates, stock, audit, approval and receipts checked; all fixtures rolled back.');
 }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});


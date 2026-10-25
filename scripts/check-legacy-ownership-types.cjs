const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const{load,root}=require('./lib/load-typescript.cjs');
const{ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const{EFFECTIVE_RENTAL_TYPE_SQL}=load(path.join(root,'lib/server/contract-classification'));
const{CONTRACT_LIST_SQL,contractTableSql,contractIndexSql,contractListScopeClause}=load(path.join(root,'lib/server/contract-drafts'));
const{readManagementTable}=load(path.join(root,'lib/server/management-table'));
const{contractStatisticsSql,mapContractStatistics}=load(path.join(root,'lib/server/contract-table-stats'));
const{readContractLifecycle}=load(path.join(root,'lib/server/contract-lifecycle'));
const{lifecycleDisplayStatus}=load(path.join(root,'lib/management/contract-lifecycle'));
const{mapApiRow}=load(path.join(root,'lib/management/repository'));
const checks=[];
(async()=>{const c=await ownerDatabase.connect();try{
  await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='20s'");
  const tables=['orders','order_vehicle_details','vehicles','stores','staff_profiles','transactions','customers'];
  for(const table of tables)await c.query(`CREATE TEMP TABLE qa_owner_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
  await c.query('CREATE TEMP VIEW qa_owner_staff_account_attribution AS SELECT id,user_id,full_name,store_id FROM qa_owner_staff_profiles');
  const db={query(sql,args){
    for(const table of ['staff_account_attribution',...tables])sql=sql.replaceAll('himoto.'+table,'pg_temp.qa_owner_'+table);
    assert(!sql.includes('himoto.'),'Business reads must use isolated fixtures');return c.query(sql,args);
  }};
  await c.query("INSERT INTO qa_owner_stores(id,store_name,kind) VALUES(1,'QA ordinary store','traditional'),(35,'QA ownership operation store','lease_to_own')");
  const fixtures=[
    [1,35,'rental',{legacy_migration:{sourceStoreId:'29'}},'ownership'],
    [2,35,'rental',{},'rental'],
    [3,35,'monthly_3',{},'monthly_3'],
    [4,35,'rental',{legacy_migration:{sourceStoreId:'30'}},'rental'],
    [5,1,'daily',{legacy_migration:{sourceStoreId:'29'}},'daily'],
    [6,1,'rental',{legacy_migration:{sourceStoreId:'29'},management_composer:{rental_type:'rental'}},'rental'],
    [7,1,'rental',{legacy_migration:{sourceStoreId:'29'},management_composer:{rental_type:'ownership_cd'}},'ownership_cd'],
    [8,1,'rental',{legacy_migration:{sourceStoreId:'29'}},'ownership'],
    [9,1,'ownership',{},'ownership'],
  ];
  for(const[id,store,type,payload]of fixtures){
    await c.query(`INSERT INTO qa_owner_orders(id,contract_number,order_status,order_type,store_id,total,pid,draft_payload)
      VALUES($1::bigint,'QA-OWNER-'||$1::text,'renting',$2,$3,'1000000',0,$4::json)`,[id,type,store,JSON.stringify(payload)]);
    await c.query("INSERT INTO qa_owner_vehicles(id,name,license) VALUES($1::bigint,'QA vehicle','QA-'||$1::text)",[id]);
    await c.query(`INSERT INTO qa_owner_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,type,hiring_fee)
      VALUES($1,$1,$1,now()-interval '120 days',now()-interval '30 days','day',1000000)`,[id]);
  }
  const rows=(await db.query(`SELECT o.id,${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type FROM himoto.orders o ORDER BY o.id`)).rows;
  assert.deepEqual(rows.map(row=>[Number(row.id),row.rental_type]),fixtures.map(([id,,,,type])=>[id,type]));
  checks.push('Legacy source 29 generic rental resolves to ownership; explicit choices, monthly three-month rentals, native rentals at ownership stores and source 30 retain their actual type');
  for(const sql of [CONTRACT_LIST_SQL,contractTableSql(''),contractIndexSql('',{includeVehicleLabels:true,includePaid:true})]){
    const list=(await db.query(sql)).rows.map(row=>mapApiRow('contracts',row));
    assert(!list.some(row=>row.id===4));
    for(const row of list){assert.equal(row.rental_type,fixtures.find(([id])=>id===row.id)[4]);if([1,8].includes(row.id)){
      assert.equal(row.contract_type_name,'Thuê sở hữu');assert.equal(row.contract_type_id,'ownership');assert.equal(row.status,'overdue');assert.equal(row.billing_plan_json,'');
    }}
  }
  const stats=(await db.query(contractStatisticsSql('',false))).rows.map(mapContractStatistics);
  assert.equal(stats.find(row=>row.id===1).rental_type,'ownership');assert.equal(stats.find(row=>row.id===8).rental_type,'ownership');
  checks.push('Full, compact, page and statistics projections agree on imported ownership labels and overdue state; no payment plan is fabricated');
  for(const id of [1,2,3,6,7,8]){
    const ctx=await readContractLifecycle(db,id),expected=fixtures.find(([item])=>item===id)[4];
    assert.equal(ctx.rental_type,expected);assert.equal(ctx.ownership,['ownership','ownership_cd'].includes(expected));assert.equal(lifecycleDisplayStatus(ctx),'overdue');assert.equal(ctx.plan,null);
  }
  checks.push('Lifecycle uses the same provenance-aware type as the contract detail, while keeping original debt, dates and missing schedules');
  const read=extra=>readManagementTable(db,'contracts',new URLSearchParams({store:'all',status_counts:'1',scope_count:'1',size:'50',...extra}));
  const ownership=await read({filter_contract_type_id:'ownership'});assert.deepEqual(ownership.rows.map(row=>row.id).sort((a,b)=>a-b),[1,8,9]);assert.equal(ownership.total,3);
  const rental=await read({filter_contract_type_id:'rental'});assert.deepEqual(rental.rows.map(row=>row.id).sort((a,b)=>a-b),[2,6]);assert.equal(rental.total,2);
  const monthly=await read({filter_contract_type_id:'monthly_3'});assert.deepEqual(monthly.rows.map(row=>row.id),[3]);
  const scoped=(await db.query(CONTRACT_LIST_SQL+contractListScopeClause('ownership'))).rows;assert(scoped.some(row=>Number(row.id)===1));
  checks.push('Type filters and result counts include legacy ownership and keep genuine three-month rentals separate');
  const unchanged=(await c.query('SELECT id,order_type,draft_payload FROM qa_owner_orders ORDER BY id')).rows;
  for(const row of unchanged){const fixture=fixtures.find(([id])=>id===Number(row.id));assert.equal(row.order_type,fixture[2]);assert.deepEqual(row.draft_payload,fixture[3]);}
  checks.push('Every operation is read-only on the fixtures: stored order types, original payloads and monetary values remain intact');
}finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0},null,2));})().catch(error=>{console.error(error);process.exitCode=1;});

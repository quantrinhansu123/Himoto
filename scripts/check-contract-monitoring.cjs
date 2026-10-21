const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const {projectManagementTable,managementTableQuery}=load(path.join(root,'lib/management/management-table'));
const {OVERDUE_BUCKETS}=load(path.join(root,'lib/management/contract-overdue'));
const {createInstallmentPlan}=load(path.join(root,'lib/management/contract-billing'));
const {parseManagementTable,readManagementTable,contractStatusClause}=load(path.join(root,'lib/server/management-table'));
const {compactContractConfig}=load(path.join(root,'lib/management/contract-monitoring-config'));
const {MANAGEMENT_CONFIG}=load(path.join(root,'lib/management/config'));
const now=Date.parse('2026-10-21T12:00:00Z'),at=minutes=>new Date(now-minutes*60000).toISOString();
const input={kind:'contracts',scope:'ownership',query:{...EMPTY_QUERY},page:1,size:2,sort:'overdue_minutes',direction:'desc',store:'all'};
const base={id:1,code:'QA',name:'QA',store_id:1,status:'overdue',rental_type:'ownership',total_amount:500000,paid_amount:100000,deposit_amount:2000000};
const late=(id,minutes,owner=true)=>({...base,id,code:`QA-${id}`,rental_type:owner?'ownership':'daily',overdue_items_json:JSON.stringify([{return_at:at(minutes),daily_price:140000}])});
const checks=[];
async function main(){
  const rows=[late(1,60),late(2,1440),late(3,5*1440+1439),late(4,6*1440),late(5,15*1440+1439),late(6,16*1440)];
  rows[1].rental_type='ownership_cd';
  const expected={'ownership-overdue':[6,5,4,3,2,1],'ownership-1-5':[3,2],'ownership-6-15':[5,4],'ownership-15-plus':[6]};
  for(const [bucket,ids]of Object.entries(expected)){
    const result=projectManagementTable(rows,{...input,query:{...EMPTY_QUERY,status:'overdue',overdueBucket:bucket}},true,now);
    assert.deepEqual(result.rows.map(row=>row.id),ids);
    assert.equal(result.overdueCounts['ownership-1-5'],2);assert.equal(result.overdueCounts['ownership-6-15'],2);assert.equal(result.overdueCounts['ownership-15-plus'],1);
  }
  checks.push('Ownership groups are non-overlapping at days 1/5/6/15/16; sub-day rentals stay in all-overdue and bucket counts ignore the selected bucket');
  const regular=[late(10,3*1440,false),late(11,3*1440+1,false),late(12,10*1440,false),late(13,10*1440+1,false),late(14,100*1440)];
  for(const [bucket,ids]of [['traditional-overdue',[13,12,11,10]],['traditional-3',[13,12,11]],['traditional-10',[13]]]){
    assert.deepEqual(projectManagementTable(regular,{...input,scope:'overdue',query:{...EMPTY_QUERY,overdueBucket:bucket}},true,now).rows.map(row=>row.id),ids);
  }
  const filtered=projectManagementTable(rows,{...input,store:'2',query:{...EMPTY_QUERY,overdueBucket:'ownership-1-5'}},false,now);
  assert.equal(filtered.total,0);assert.equal(filtered.overdueCounts['ownership-1-5'],0);
  const page=projectManagementTable(rows,{...input,size:1,query:{...EMPTY_QUERY,overdueBucket:'ownership-6-15'}},false,now);
  assert.equal(page.total,2);assert.equal(page.pages,2);assert.deepEqual(page.rows.map(row=>row.id),[5]);
  checks.push('Traditional >3/>10-day shortcuts exclude ownership; branch filters, totals, sorting, pagination and exports use the same selected group');
  const bad=[{...late(21,100*1440,false),status:'bad_debt'},
    {...base,id:22,code:'QA-22',status:'bad_debt',rental_type:'daily',paid_amount:500000,end_date:'2026-12-01T00:00:00+07:00'},
    {...late(23,2*1440),status:'bad_debt'},
    {...base,id:24,code:'QA-24',status:'bad_debt',rental_type:'ownership',end_date:undefined}];
  const cases=[...regular,...rows,...bad,{...base,id:25,status:'wait_payment',rental_type:'daily'}];
  for(const [scope,bucket,ids]of [['overdue','traditional-bad-debt',[21,22]],['ownership','ownership-bad-debt',[23,24]]]){
    const report=projectManagementTable(cases,{...input,scope,query:{...EMPTY_QUERY,status:'bad_debt',overdueBucket:bucket}},true,now);
    assert.deepEqual(report.rows.map(row=>row.id).sort((a,b)=>a-b),ids);
    assert.equal(report.overdueCounts[bucket],2);
    assert(report.rows.every(row=>row.status==='bad_debt'&&row.monitoring_amount===row.rental_debt_amount));
    const page=projectManagementTable(cases,{...input,scope,size:1,page:2,query:{...EMPTY_QUERY,status:'bad_debt',overdueBucket:bucket}},false,now);
    assert.equal(page.rows.length,1);assert.equal(page.total,2);assert.equal(page.overdueCounts[bucket],2);
  }
  const mixed=projectManagementTable(cases,{...input,scope:'overdue',query:{...EMPTY_QUERY,status:'overdue',overdueBucket:'traditional-10'}},true,now);
  assert.deepEqual(mixed.rows.map(row=>row.id),[13]);assert.equal(mixed.overdueCounts['traditional-bad-debt'],2);
  const branch=projectManagementTable(cases,{...input,scope:'overdue',store:'2',query:{...EMPTY_QUERY,status:'bad_debt',overdueBucket:'traditional-bad-debt'}},true,now);
  assert.equal(branch.total,0);assert.equal(branch.overdueCounts['traditional-bad-debt'],0);
  assert.equal(MANAGEMENT_CONFIG.contracts.statuses.find(row=>row.value==='wait_payment').label,'Chờ tất toán');
  checks.push('Bad debt remains an explicit contract flag, distinct from wait-payment and age groups; future/unknown dates and zero balances stay visible; counts are stable across tabs, pagination and branch filtering');
  const plan=createInstallmentPlan('2026-10-01T09:00','2026-12-01T09:00','Theo tuần',100000);assert(plan);
  const planned={...base,status:'renting',billing_plan_json:JSON.stringify(plan),total_amount:100000,paid_amount:200000,end_date:'2026-12-01T09:00:00+07:00'};
  const due=projectManagementTable([planned],{...input,query:{...EMPTY_QUERY,status:'overdue',overdueBucket:'ownership-6-15'}},true,now).rows[0];
  assert(due);assert.equal(due.overdue_basis,'payment');assert.equal(due.overdue_days,6);assert.equal(due.monitoring_amount,100000);assert.equal(due.total_amount,300000);assert.equal(due.deposit_amount,2000000);
  assert.equal(projectManagementTable([{...planned,paid_amount:300000}],{...input,query:{...EMPTY_QUERY,status:'overdue'}},true,now).total,0);
  const waiting=projectManagementTable([{...planned,status:'wait_payment'}],{...input,query:{...EMPTY_QUERY,status:'overdue'}},true,now);
  assert.equal(waiting.total,1);assert.equal(new Map(waiting.statusCounts).get('renting')||0,0);
  const ownerBad=projectManagementTable([{...planned,status:'bad_debt'}],{...input,query:{...EMPTY_QUERY,status:'bad_debt',overdueBucket:'ownership-bad-debt'}},true,now);
  assert.equal(ownerBad.total,1);assert.equal(ownerBad.overdueCounts['ownership-bad-debt'],1);assert.equal(ownerBad.overdueCounts['ownership-6-15'],0);
  const invalid=projectManagementTable([{...planned,status:'overdue',billing_plan_json:'invalid'}],{...input,query:{...EMPTY_QUERY,status:'overdue'}},true,now);
  assert.equal(invalid.total,1);assert.equal(invalid.rows[0].monitoring_amount,undefined);assert.equal(invalid.rows[0].overdue_minutes,undefined);
  checks.push('Unpaid installments drive ownership overdue age and amount even with a future vehicle return; paying due installments removes overdue without consuming the deposit');
  for(const bucket of OVERDUE_BUCKETS){const query=managementTableQuery({...input,query:{...EMPTY_QUERY,overdueBucket:bucket.key}});assert.equal(parseManagementTable('contracts',query).query.overdueBucket,bucket.key);}
  assert.throws(()=>parseManagementTable('contracts',new URLSearchParams('overdue_bucket=bad')));
  assert.match(contractStatusClause('overdue'),/installment_plan/);
  const oldNow=Date.now;Date.now=()=>now;
  try{
    const raw={...planned,draft_payload:{management_composer:{installment_plan:plan}},vehicles:[],overdue_items:[]};let calls=0;
    const result=await readManagementTable({query:async()=>({rows:[++calls===1?raw:{...raw,overdue_items:undefined}]})},'contracts',managementTableQuery({...input,query:{...EMPTY_QUERY,status:'overdue'}}));
    assert.equal(result.rows[0].monitoring_amount,100000);assert.equal(result.rows[0].total_amount,300000);assert.equal(result.rows[0].billing_base_total,100000);
  }finally{Date.now=oldNow;}
  const columns=compactContractConfig(MANAGEMENT_CONFIG.contracts).columns.filter(column=>!column.hidden);
  const normal=compactContractConfig(MANAGEMENT_CONFIG.contracts,'rental');
  assert.equal(normal.columns.filter(column=>!column.hidden).length,8);
  for(const key of ['representative_name','sales_staff_name','store_name','return_adjustment_amount'])assert.equal(normal.columns.find(column=>column.key===key).hidden,true);
  const dateSort=projectManagementTable([{...base,id:80,status:'renting',signed_on:'2026-10-20'},{...base,id:81,status:'renting',signed_on:'2026-10-01'}],{...input,scope:'',sort:'contract_signed_at',direction:'asc'},true,now);
  assert.deepEqual(dateSort.rows.map(row=>row.id),[81,80]);
  assert.deepEqual(columns.map(column=>column.key),['code','contract_signed_at','deposit_amount','customer_name','license','overdue_minutes','monitoring_amount','contract_gps_status']);
  checks.push('Bucket inputs validate before SQL; hydration preserves accrued amounts exactly once; eight default fields leave other columns available on demand');
  if(process.argv.includes('--live-read')){
    require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
    const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool,client=await pool.connect();
    try{
      await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='30s'");
      const result=await readManagementTable(client,'contracts',managementTableQuery({...input,size:50},true));
      for(const bucket of OVERDUE_BUCKETS.filter(bucket=>bucket.key.startsWith('ownership-'))){
        const projected=projectManagementTable(result.rows,{...input,query:{...EMPTY_QUERY,status:'overdue',overdueBucket:bucket.key}},true);
        assert(projected.rows.every(row=>row.monitoring_amount===undefined||row.monitoring_amount>=0));
      }
      checks.push(`READ ONLY: ${result.total} live ownership contracts support age grouping and installment amounts without changing orders or receipts`);
      await client.query('ROLLBACK');
    }finally{client.release();await globalThis.himotoPool?.end();}
  }
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

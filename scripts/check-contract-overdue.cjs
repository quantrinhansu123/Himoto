const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {withContractOverdue}=load(path.join(root,'lib/management/contract-overdue'));
const {formatValue,EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const {projectManagementTable,managementTableQuery}=load(path.join(root,'lib/management/management-table'));
const {readManagementTable,parseManagementTable}=load(path.join(root,'lib/server/management-table'));
const now=Date.parse('2026-10-21T12:00:00Z'),checks=[];
const at=minutes=>new Date(now-minutes*60000).toISOString();
const row={id:901,code:'QA-OVERDUE',name:'QA-OVERDUE',status:'overdue',total_amount:1000000,paid_amount:200000,deposit_amount:2000000};
const view=items=>withContractOverdue({...row,overdue_items_json:JSON.stringify(items)},now);
const input={kind:'contracts',query:{...EMPTY_QUERY},store:'all',scope:'overdue',page:1,size:10,sort:'overdue_minutes',direction:'desc'};
async function main(){
  for(const [minutes,fee]of [[1,20000],[60,20000],[61,40000],[480,160000],[481,140000],[1440,140000],[1561,200000]]){
    const result=view([{return_at:at(minutes),daily_price:140000}]);
    assert.equal(result.overdue_minutes,minutes);assert.equal(result.overdue_days,Math.floor(minutes/1440));assert.equal(result.overdue_fee_estimate,fee);
    assert.equal(result.total_amount,1000000);assert.equal(result.rental_debt_amount,800000);assert.equal(result.deposit_amount,2000000);
  }
  assert.match(formatValue(1561,'duration'),/1.*2.*1/);
  checks.push('Days, hours and minute remainders retain real elapsed time; fee boundaries match the return fee policy without changing rent, debt or deposit');
  const mixed=view([{return_at:at(1561),daily_price:140000},{return_at:at(60),daily_price:170000},{return_at:at(99999),daily_price:500000,completed_at:at(10)},{return_at:at(-60),daily_price:300000}]);
  assert.equal(mixed.overdue_minutes,1561);assert.equal(mixed.overdue_fee_estimate,220000);
  checks.push('Multi-vehicle estimates add only currently late vehicles, use the longest elapsed time and ignore returned/future vehicles');
  assert.equal(view([{return_at:at(1440),daily_price:null}]).overdue_fee_estimate,undefined);
  assert.equal(view([{return_at:at(60),daily_price:null}]).overdue_fee_estimate,20000);
  assert.equal(view([{return_at:'bad-date',daily_price:140000}]).overdue_minutes,undefined);
  assert.equal(view([]).overdue_minutes,undefined);
  assert.equal(withContractOverdue({...row,paid_amount:undefined},now).rental_debt_amount,undefined);
  checks.push('Missing day prices or dates stay visibly unconfirmed rather than becoming zero; hourly-only estimates remain valid');
  const rows=[{...row,id:1,overdue_items_json:JSON.stringify([{return_at:at(120),daily_price:140000}])},{...row,id:2,overdue_items_json:JSON.stringify([{return_at:at(180),daily_price:140000}])}];
  assert.deepEqual(projectManagementTable(rows,{...input,size:1},false,now).rows.map(row=>row.id),[2]);
  assert.equal(projectManagementTable(rows,{...input,query:{...EMPTY_QUERY,overdueDays:'0',overdueCompare:'eq'}},true,now).total,2);
  assert.deepEqual(projectManagementTable(rows,{...input,sort:'overdue_fee_estimate',direction:'asc'},true,now).rows.map(row=>row.id),[1,2]);
  for(const sort of ['overdue_minutes','overdue_fee_estimate','rental_debt_amount'])assert.equal(parseManagementTable('contracts',managementTableQuery({...input,sort})).sort,sort);
  checks.push('Sub-day rentals sort correctly before pagination; day filters, fee sorting and exports use the same projection');
  const raw={id:901,contract_number:'QA-OVERDUE',status:'overdue',total_amount:1000000,paid_amount:200000,vehicles:[],overdue_items:[{return_at:new Date(Date.now()-119*60000).toISOString(),daily_price:140000}]};
  const queries=[];const client={query:async(sql)=>{queries.push(sql);return {rows:[queries.length===1?raw:{...raw,overdue_items:undefined}]};}};
  const hydrated=await readManagementTable(client,'contracts',managementTableQuery(input));
  assert.equal(hydrated.rows[0].overdue_fee_estimate,40000);assert.equal(hydrated.rows[0].rental_debt_amount,800000);
  assert.match(queries[0],/d\.completed_at IS NULL/);assert.match(queries[0],/substitute_unit_price/);
  assert.match(queries[0],/JOIN himoto\.vehicles v ON v\.id=d\.vehicle_id/);
  assert.doesNotMatch(queries[1],/AS overdue_items/);
  assert.equal(hydrated.rows[0].overdue_items_json,JSON.stringify(raw.overdue_items));
  queries.length=0;const exported=await readManagementTable(client,'contracts',managementTableQuery(input,true));
  assert.equal(exported.rows[0].overdue_fee_estimate,40000);
  checks.push('Paged hydration and all-row exports preserve per-line estimates; SQL reads the same legacy/current day prices as returns and excludes recovered vehicles');
  if(process.argv.includes('--live-read')){
    require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
    const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool,client=await pool.connect();
    try{
      await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='30s'");
      const started=performance.now(),result=await readManagementTable(client,'contracts',managementTableQuery(input));
      for(const row of result.rows){assert(Array.isArray(JSON.parse(row.overdue_items_json)));assert(row.overdue_fee_estimate===undefined||row.overdue_fee_estimate>=0);}
      checks.push(`READ ONLY: live overdue list hydrated ${result.rows.length}/${result.total} rows in ${Math.round(performance.now()-started)}ms without writing fees or receipts`);
      const {loadContractReturnableItems}=load(path.join(root,'lib/server/contract-returns'));
      for(const row of result.rows){
        const returned=await loadContractReturnableItems(client,row.id);
        const expected=returned.filter(item=>!item.completed_at).map(item=>[Date.parse(item.scheduled_return_at),item.daily_price]).sort();
        const actual=JSON.parse(row.overdue_items_json).map(item=>[Date.parse(item.return_at),Number(item.daily_price)>0?Number(item.daily_price):null]).sort();
        assert.deepEqual(actual,expected,'List day price and timestamp must match the actual return screen');
      }
      checks.push('READ ONLY: every visible vehicle deadline/timezone and day price matches the existing return screen');
      await client.query('ROLLBACK');
    }finally{client.release();await globalThis.himotoPool?.end();}
  }
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

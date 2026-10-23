const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const {managementTableQuery}=load(path.join(root,'lib/management/management-table'));
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
const base={kind:'contracts',scope:'ownership',store:'all',page:1,size:10,sort:'code',direction:'asc',query:EMPTY_QUERY};
const past=new Date(Date.now()-86400000).toISOString(),future=new Date(Date.now()+86400000).toISOString();
const history=Array.from({length:239},(_,i)=>({id:1000-i,contract_number:i<5?`NEW-${i}`:`VPS-${1000-i}`,
  status:i<146?'renting':i<237?'completed':'wait_payment',store_id:35,store_kind:'lease_to_own',
  start_date:past,end_date:future,vehicles:[]}));
function database(rows,commands=[]){return {query:async(sql,args)=>{
  commands.push({sql,args});
  if(sql.includes('LIMIT $1 OFFSET $2'))return {rows:rows.slice(args[1],args[1]+args[0]).map(row=>({...row,__total_count:rows.length}))};
  assert.match(sql,/ANY\(\$1::bigint\[\]\)/);
  return {rows:rows.filter(row=>args[0].includes(row.id))};
}};}
async function read(rows,change={},commands=[]){return readManagementTable(database(rows,commands),'contracts',managementTableQuery({...base,...change}));}
async function main(){
  const checks=[],commands=[];
  const first=await read(history,{},commands),last=await read(history,{page:24},commands);
  assert.equal(first.total,239);assert.equal(first.pages,24);assert.equal(first.rows.length,10);
  assert.equal(last.total,239);assert.equal(last.page,24);assert.equal(last.rows.length,9);
  assert.equal(last.rows.at(-1).code,'VPS-762');
  assert.match(commands[0].sql,/count\(\*\) OVER\(\)::int AS __total_count/);
  assert.match(commands[0].sql,/lease_to_own/);
  assert.equal(commands.length,4);
  assert.deepEqual(commands[1].args,[history.slice(0,10).map(row=>row.id)]);
  assert.deepEqual(commands[3].args,[history.slice(230).map(row=>row.id)]);
  checks.push('239 contracts report 24 real pages on both first and last page; hydration reads only the requested 10/9 contracts');
  const ids=[];
  for(let page=1;page<=first.pages;page++){
    const result=await read(history,{page});
    assert.equal(result.total,239);assert.equal(result.pages,24);
    ids.push(...result.rows.map(row=>row.id));
  }
  assert.deepEqual(ids,history.map(row=>row.id));assert.equal(new Set(ids).size,239);
  checks.push('Every imported and recent contract can be reached without duplicates, gaps or a changing total');
  const active=history.filter(row=>row.status==='renting');
  const activeLast=await read(active,{page:15,query:{...EMPTY_QUERY,status:'renting'}});
  assert.equal(activeLast.total,146);assert.equal(activeLast.pages,15);assert.equal(activeLast.rows.length,6);
  const completed=await read(history.filter(row=>row.status==='completed'),{query:{...EMPTY_QUERY,status:'completed'}});
  assert.equal(completed.total,91);assert.equal(completed.pages,10);
  assert.equal((await read([],{query:{...EMPTY_QUERY,status:'draft'}})).pages,1);
  const searchCommands=[];
  const oldSearch=await read([history.at(-1)],{query:{...EMPTY_QUERY,search:'VPS-762'}},searchCommands);
  assert.equal(oldSearch.total,1);assert.equal(oldSearch.rows[0].code,'VPS-762');
  assert.match(searchCommands[0].sql,/contract_number ILIKE \$3/);
  assert.deepEqual(searchCommands[0].args,[10,0,'%VPS-762%']);
  checks.push('Active/completed/empty tabs have their own exact totals; an old contract is searchable independently of the visible page');
  const clamped=await read(history,{page:999});
  assert.equal(clamped.page,24);assert.equal(clamped.rows.at(-1).code,'VPS-762');
  const shrunk=await read(history.slice(0,14),{page:24});
  assert.equal(shrunk.page,2);assert.equal(shrunk.total,14);assert.equal(shrunk.rows.length,4);
  const empty=await read([],{page:24});assert.equal(empty.page,1);assert.equal(empty.total,0);assert.deepEqual(empty.rows,[]);
  checks.push('Out-of-range pages recover the current last page after deletions or changed filters, including an empty result');
  const overdue=Array.from({length:120},(_,i)=>({...history[0],id:1000-i,status:i<50?'renting':'overdue',end_date:i<50?future:past,
    overdue_items:[{return_at:i<50?future:past,daily_price:100}]}));
  const overdueFirst=await read(overdue,{query:{...EMPTY_QUERY,status:'overdue'}});
  const overdueLast=await read(overdue,{page:999,query:{...EMPTY_QUERY,status:'overdue'}});
  assert.equal(overdueFirst.total,70);assert.equal(overdueFirst.pages,7);assert.equal(overdueFirst.rows[0].id,950);
  assert.equal(overdueLast.total,70);assert.equal(overdueLast.page,7);assert.equal(overdueLast.rows.at(-1).id,881);
  const datedActive=await read(overdue,{query:{...EMPTY_QUERY,status:'renting',startDate:past.slice(0,10)}});
  assert.equal(datedActive.total,120);
  checks.push('Derived overdue counts cover the whole selected candidate set before pagination; dated active rentals still include overdue vehicles');
  await assert.rejects(readManagementTable({query:async()=>({rows:[history[0]]})},'contracts',managementTableQuery(base)),/Không đọc được tổng/);
  checks.push('A missing count fails visibly instead of reporting a false successful total');
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

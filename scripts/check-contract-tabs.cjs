const assert = require('node:assert/strict');
const path = require('node:path');
const {load,root} = require('./lib/load-typescript.cjs');
const {CONTRACT_STATUS_TABS} = load(path.join(root,'lib/management/contract-tabs'));
const {managementTableQuery} = load(path.join(root,'lib/management/management-table'));
const {EMPTY_QUERY} = load(path.join(root,'lib/management/table-utils'));
const {readManagementTable} = load(path.join(root,'lib/server/management-table'));
const {managementPageSession} = load(path.join(root,'lib/server/management-session'));
const {isTransientSessionRead} = load(path.join(root,'lib/server/session-read'));
const input = {kind:'contracts',query:EMPTY_QUERY,scope:'',store:'all',page:1,size:1,sort:'code',direction:'desc'};
async function main() {
  const checks=[];
  assert.deepEqual(CONTRACT_STATUS_TABS.map(tab=>[tab.value,tab.label]),[['','Tất cả'],['renting','Đang thuê'],['draft','Nháp'],['overdue','Quá hạn'],['completed','Hoàn thành']]);
  for(const status of ['', 'renting','draft','completed']) {
    const commands=[];
    const row={id:9,contract_number:'QA-9',status:status||'renting',vehicles:[],__total_count:1};
    const result=await readManagementTable({query:async(sql,args)=>{commands.push({sql,args});return {rows:[row]};}},'contracts',managementTableQuery({...input,query:{...EMPTY_QUERY,status}}));
    assert.equal(result.rows.length,1);
    assert.equal(commands.length,2);
    assert.match(commands[0].sql,/LIMIT \$1 OFFSET \$2/);
    assert.equal(commands[0].args[0],1);
    assert.match(commands[0].sql,/count\(\*\) OVER\(\)::int AS __total_count/);
    assert.doesNotMatch(commands[0].sql,/GROUP BY/i);
    if(status==='renting')assert.match(commands[0].sql,/order_status IN \('renting','overdue'\)/);
    if(status==='draft'||status==='completed')assert(commands[0].sql.includes(`o.order_status='${status}'`));
    assert.deepEqual(commands[1].args,[[9]]);
    assert.match(commands[1].sql,/COALESCE\(o\.rent_at,ov\.start_date\) AS start_date/);
    assert.match(commands[1].sql,/COALESCE\(o\.return_at,ov\.end_date\) AS end_date/);
  }
  checks.push('Five permanent status tabs; each simple tab reads only its own current page and hydrates only that page');
  const future=new Date(Date.now()+86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString();
  const candidates=Array.from({length:52},(_,i)=>({id:100-i,contract_number:`QA-${i}`,status:i<50?'renting':'overdue',rental_type:'daily',start_date:past,end_date:i<50?future:past,total_amount:100,paid_amount:0,vehicles:[],overdue_items:[{return_at:i<50?future:past,daily_price:100}]}));
  const commands=[];
  const database={query:async(sql,args)=>{
    commands.push({sql,args});
    return {rows:sql.includes('LIMIT $1 OFFSET $2')?candidates.slice(args[1],args[1]+args[0]):candidates.filter(row=>args[0].includes(row.id))};
  }};
  const first=await readManagementTable(database,'contracts',managementTableQuery({...input,query:{...EMPTY_QUERY,status:'overdue'}}));
  assert.deepEqual(first.rows.map(row=>row.id),[49]);assert.equal(first.pages,2);
  assert.deepEqual(commands.filter(row=>row.sql.includes('LIMIT')).map(row=>row.args),[[50,0],[50,50]]);
  const second=await readManagementTable(database,'contracts',managementTableQuery({...input,page:2,query:{...EMPTY_QUERY,status:'overdue'}}));
  assert.deepEqual(second.rows.map(row=>row.id),[50]);assert.equal(second.pages,2);
  candidates[50].overdue_items[0].return_at=new Date(Date.now()-2*86400000).toISOString();
  const oldest=await readManagementTable(database,'contracts',managementTableQuery({...input,sort:'overdue_minutes',direction:'desc',query:{...EMPTY_QUERY,status:'overdue'}}));
  assert.deepEqual(oldest.rows.map(row=>row.id),[50]);
  const bucket=await readManagementTable(database,'contracts',managementTableQuery({...input,query:{...EMPTY_QUERY,status:'overdue',overdueBucket:'traditional-3'}}));
  assert.equal(bucket.rows.length,0);
  checks.push('Overdue filters run before pagination across bounded candidate batches; future rentals never fill overdue slots and age buckets are respected');
  let reads=0;
  await assert.rejects(readManagementTable({query:async()=>{if(++reads===1)return {rows:[{...candidates[0],__total_count:52}]};throw Error('QA detail unavailable');}},'contracts',managementTableQuery(input)),/QA detail unavailable/);
  checks.push('A failed hydration is retryable and cannot report partially loaded dates/balances as a successful page');
  const user={id:7,name:'QA',email:'qa@example.invalid',role:'admin',role_slug:'quan-tri-vien'};
  let attempts=0;
  const recovered=await managementPageSession(async()=>{if(++attempts===1)throw Object.assign(Error('Connection terminated unexpectedly'),{code:'08006'});return user;});
  assert.deepEqual(recovered,{user,unavailable:false});assert.equal(attempts,2);
  assert.deepEqual(await managementPageSession(async()=>null),{user:null,unavailable:false});
  const oldError=console.error;console.error=()=>{};
  try{assert.deepEqual(await managementPageSession(async()=>{throw Object.assign(Error('QA outage'),{code:'08006'});}),{user:null,unavailable:true});}finally{console.error=oldError;}
  const frameworkSignal=Object.assign(Error('QA framework control flow'),{digest:'DYNAMIC_SERVER_USAGE'});
  await assert.rejects(managementPageSession(async()=>{throw frameworkSignal;}),error=>error===frameworkSignal);
  assert(isTransientSessionRead(Object.assign(Error('(ECHECKOUTTIMEOUT) unable to check out connection from the pool after 15000ms in Transaction mode'),{code:'XX000'})));
  assert(!isTransientSessionRead(Object.assign(Error('unrelated internal error'),{code:'XX000'})));
  checks.push('Temporary session failures retry once; DB outages stay distinct from expired sessions and Next.js control-flow errors are rethrown');
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

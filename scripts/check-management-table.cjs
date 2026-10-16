const assert=require('node:assert/strict'),path=require('node:path');
const {isDeepStrictEqual}=require('node:util');
const {load,root}=require('./lib/load-typescript.cjs');
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const shared=load(path.join(root,'lib/management/management-table'));
const server=load(path.join(root,'lib/server/management-table'));
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
const {summarizeContracts}=load(path.join(root,'lib/management/contract-summary'));
const base={kind:'contracts',query:{...EMPTY_QUERY},store:'all',scope:'',page:1,size:10,sort:'code',direction:'asc'};
const rows=Array.from({length:31},(_,i)=>({id:i+1,code:`HD-${i+1}`,name:`HD-${i+1}`,customer_id:i%9,customer_name:`Khách QA ${i}`,customer_status:i%4===0?'blacklist':'active',store_id:i%2+1,status:i===30?'draft':i%5===0?'bad_debt':'renting',total_amount:100+i,paid_amount:i,company_payment_count:i%3===0?1:0,rental_type:'daily',contract_type_id:'daily',start_date:'2026-10-10T09:00:00Z'}));
const checks=[];
async function main(){
  const first=shared.projectManagementTable(rows,base),second=shared.projectManagementTable(rows,{...base,page:2});
  assert.equal(first.rows.length,10);assert.equal(first.total,31);assert.equal(first.pages,4);assert.equal(first.rows[0].id,31);
  assert.deepEqual(first.summary,summarizeContracts(rows,[]));assert.deepEqual(first.statusCounts,second.statusCounts);assert.deepEqual(first.summary,second.summary);
  assert(!first.rows.some(row=>second.rows.some(other=>other.id===row.id)));
  assert.equal(shared.projectManagementTable(rows,{...base,page:999}).page,4);
  checks.push('Page slicing keeps whole-result totals, blacklist counts, draft pinning, status counts and stable non-overlapping pages');
  const input={...base,query:{...EMPTY_QUERY,status:'renting',search:'khach qa',filters:{}},store:'1'};
  const filtered=rows.filter(row=>row.status==='renting'&&row.store_id===1);
  const result=shared.projectManagementTable(rows,input,true);
  assert.equal(result.total,filtered.length);assert.equal(result.rows.length,filtered.length);assert.deepEqual(result.summary,summarizeContracts(filtered,[]));
  assert.equal(result.tabCount,16);assert.equal(result.scopeCount,16);
  assert.equal(shared.projectManagementTable(rows,{...base,scope:'drafts'}).total,1);
  assert.equal(shared.projectManagementTable(rows,{...base,scope:'vat'}).total,11);
  const overdue=shared.projectManagementTable([{...rows[0],status:'overdue',end_date:'2026-10-15T13:00:00Z'}],{...base,scope:'overdue'},false,Date.parse('2026-10-16T12:59:00Z'));
  assert.equal(overdue.rows[0].overdue_days,0);
  checks.push('Accent-insensitive search, combined store/status filters, status tabs, VAT/draft scopes, full export and floor-based overdue days preserve existing behavior');
  assert.deepEqual(server.parseManagementTable('contracts',shared.managementTableQuery(base)),base);
  for(const query of ['size=51','page=0','page=NaN','direction=x','scope=x','sort=sql','filter_unknown=x','store=0','overdue_compare=x','all=0'])assert.throws(()=>server.parseManagementTable('contracts',new URLSearchParams(query)),server.ManagementTableError);
  let called=false;await assert.rejects(()=>server.readManagementTable({query(){called=true;}},'contracts',new URLSearchParams('size=999')),server.ManagementTableError);assert.equal(called,false);
  assert.equal(mapApiRow('contracts',{id:1,rent_at:new Date('2026-10-10T09:00:00Z')}).start_date,'2026-10-10T09:00:00.000Z');
  checks.push('Page/filter bounds are validated before SQL; PostgreSQL Date values map exactly like the original JSON API');
  if(process.argv.includes('--live-read')){
    require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
    const db=load(path.join(root,'lib/server/himoto-database')).himotoPool,c=await db.connect();
    try{
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='30s'");
      const sql=load(path.join(root,'lib/server/contract-drafts')).CONTRACT_LIST_SQL;
      const started=performance.now(),raw=(await c.query(sql)).rows,queryMs=Math.round(performance.now()-started);
      const direct=raw.map(row=>mapApiRow('contracts',row)),old=JSON.parse(JSON.stringify(raw)).map(row=>mapApiRow('contracts',row));
      for(const scope of ['','drafts','vat','overdue','ownership','due']){
        const page=shared.projectManagementTable(direct,{...base,scope}),legacy=shared.projectManagementTable(old,{...base,scope});
        assert(isDeepStrictEqual(page,legacy),`Contract mapping mismatch: ${scope||'all'}`);
        const paged=await server.readManagementTable(c,'contracts',shared.managementTableQuery({...base,scope}));
        assert(isDeepStrictEqual(paged,legacy),`Contract compact projection mismatch: ${scope||'all'}`);
      }
      for(const change of [{page:2},{sort:'vehicle_name',direction:'desc'},{store:'31'},{query:{...EMPTY_QUERY,status:'completed',search:'honda'}}]){
        const input={...base,...change};
        assert(isDeepStrictEqual(await server.readManagementTable(c,'contracts',shared.managementTableQuery(input)),shared.projectManagementTable(old,input)),`Contract filter/sort mismatch: ${JSON.stringify(change)}`);
      }
      const customers=(await c.query(load(path.join(root,'lib/server/customer-search')).CUSTOMER_PROFILE_SQL)).rows.map(row=>mapApiRow('customers',row));
      for(const change of [{},{page:2},{sort:'contract_count',direction:'desc'},{query:{...EMPTY_QUERY,status:'blacklist',search:'nguyen'}}]){
        const input={...base,kind:'customers',...change};
        assert(isDeepStrictEqual(await server.readManagementTable(c,'customers',shared.managementTableQuery(input)),shared.projectManagementTable(customers,input)),`Customer filter/sort mismatch: ${JSON.stringify(change)}`);
      }
      const stats=await load(path.join(root,'lib/server/page-summaries')).readOperationsSummary(c);
      assert.equal(stats.stores.reduce((sum,row)=>sum+row.active,0),old.filter(row=>['renting','overdue','wait_payment'].includes(row.status)).length);
      assert.equal(stats.stores.reduce((sum,row)=>sum+row.overdue,0),old.filter(row=>row.status==='overdue').length);
      const sales=load(path.join(root,'lib/management/source-sales')),staff=(await c.query('SELECT id,full_name AS name FROM himoto.staff_profiles')).rows;
      for(const [from,to,store]of [['2026-10-01','2026-10-16','all'],['2025-01-01','2026-10-16','31']]){
        const expected={sources:sales.summarizeBySalesStaff(old,from,to,store,staff),stores:sales.summarizeByStore(old,from,to,store),kpis:sales.summarizeSalesKpis(old,from,to,store)};
        const actual=await load(path.join(root,'lib/server/page-summaries')).readSalesSummary(c,new URLSearchParams({from,to,store}));
        assert(isDeepStrictEqual(actual,expected),'Bounded sales summary differs from full-history aggregation');
      }
      checks.push(`READ ONLY: ${raw.length} contracts and ${customers.length} customers preserve full detail rows, totals, filtering and sorting with compact reads/page hydration; six scopes and operations counts match (${queryMs}ms full SQL)`);
      checks.push('READ ONLY: Bounded sales summaries preserve full-history financial KPIs, customer counts and chart values for month/all-store and long-range/store filters');
      await c.query('ROLLBACK');
    }finally{c.release();await globalThis.himotoPool?.end();}
  }
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

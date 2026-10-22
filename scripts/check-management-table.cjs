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
  const plateRows=[
    ...Array.from({length:25},(_,i)=>({...rows[0],id:100+i,code:`QA-${i}`,status:'completed',license:'QA-123.45',start_date:'2026-10-17T09:00:00Z'})),
    {...rows[0],id:130,code:'000001',status:'draft',license:'QA-123.45',start_date:'2026-10-20T09:00:00Z'},
    {...rows[0],id:131,code:'QA-999',status:'overdue',license:'QA-123.45',start_date:'2026-10-14T09:00:00Z'},
    {...rows[0],id:132,code:'QA-998',status:'renting',license:'QA-123.45',start_date:'2026-10-16T09:00:00Z'},
    {...rows[0],id:133,code:'QA-997',status:'overdue',license:'QA-123.45',start_date:'2026-10-16T09:00:00Z'},
    {...rows[0],id:134,code:'QA-996',status:'overdue',license:'QA-999.99',start_date:'2026-10-18T09:00:00Z',store_id:2},
  ];
  const plateInput={...base,query:{...EMPTY_QUERY,search:'123.45'},size:2,store:'1'};
  const plate=shared.projectManagementTable(plateRows,plateInput),plateNext=shared.projectManagementTable(plateRows,{...plateInput,page:2});
  for(const search of ['QA12345','qa 12345','QA-123.45','12345','123 45']){
    const found=shared.projectManagementTable(plateRows,{...plateInput,query:{...EMPTY_QUERY,search}});
    assert.equal(found.total,29);assert.deepEqual(found.rows.map(row=>row.id),[133,132]);
  }
  assert.equal(plate.total,29);assert.deepEqual(plate.rows.map(row=>row.id),[133,132]);assert.deepEqual(plateNext.rows.map(row=>row.id),[131,130]);
  assert.deepEqual(shared.projectManagementTable(plateRows,{...plateInput,direction:'desc'}).rows.map(row=>row.id),[133,132]);
  assert.deepEqual(shared.projectManagementTable(plateRows,{...plateInput,sort:'start_date'}).rows.map(row=>row.id),[133,132]);
  assert.equal(shared.projectManagementTable(plateRows,{...base,store:'1'}).rows[0].id,130);
  assert.equal(shared.projectManagementTable(plateRows,{...plateInput,query:{...plateInput.query,status:'completed'}}).total,25);
  assert.equal(shared.projectManagementTable(plateRows,{...plateInput,scope:'drafts'}).rows[0].id,130);
  const onRent=shared.projectManagementTable(plateRows,{...plateInput,query:{...plateInput.query,status:'renting'}},true);
  assert.deepEqual(onRent.rows.map(row=>row.id),[133,132,131]);assert.equal(new Map(onRent.statusCounts).get('renting'),3);assert.equal(new Map(onRent.statusCounts).get('overdue'),2);
  assert.equal(shared.projectManagementTable(plateRows,{...plateInput,scope:'overdue'},true).rows.length,2);
  const exported=shared.projectManagementTable(plateRows,plateInput,true);
  assert.equal(exported.rows.length,29);assert.deepEqual(exported.rows.slice(0,4).map(row=>row.id),[133,132,131,130]);
  assert.deepEqual(plate.summary,summarizeContracts(plateRows.filter(row=>row.store_id===1),[]));
  checks.push('All-contract search pins renting/overdue newest-first before drafts and 25 completed rentals, including stable ties, pagination and export; store/status filters and draft-only/default lists stay scoped');
  assert.deepEqual(server.parseManagementTable('contracts',shared.managementTableQuery(base)),base);
  for(const query of ['size=51','page=0','page=NaN','direction=x','scope=x','sort=sql','filter_unknown=x','store=0','overdue_compare=x','all=0','recent=0','recent=99999'])assert.throws(()=>server.parseManagementTable('contracts',new URLSearchParams(query)),server.ManagementTableError);
  assert.equal(server.parseManagementTable('contracts',shared.managementTableQuery({...base,recentDays:30})).recentDays,30);
  assert.match(server.contractRecentClause(30),/interval '30 days'/);
  const pageSql=server.contractPageSql(server.contractRecentClause(30));
  assert.match(pageSql,/FROM himoto\.orders o/);
  assert.match(pageSql,/order_status='draft' THEN o\.draft_payload/);
  assert.doesNotMatch(pageSql,/himoto\.customers/);
  assert.doesNotMatch(pageSql,/himoto\.transactions/);
  assert.doesNotMatch(pageSql,/himoto\.vehicles/);
  const drafts=load(path.join(root,'lib/server/contract-drafts'));
  const indexSql=drafts.contractIndexSql('');
  assert.doesNotMatch(indexSql,/LEFT JOIN LATERAL/);
  assert.doesNotMatch(indexSql,/GROUP BY order_id/);
  assert.doesNotMatch(indexSql,/himoto\.transactions/);
  assert.doesNotMatch(indexSql,/LEFT JOIN himoto\.vehicles/);
  assert.match(drafts.contractIndexSql('',{includePaid:true}),/himoto\.transactions/);
  assert.match(drafts.contractIndexSql('',{includeVehicleLabels:true}),/LEFT JOIN himoto\.vehicles v ON v\.id = d\.vehicle_id/);
  assert.match(drafts.contractIndexSql('',{includeCompany:true}),/bank_owner_type='company'/);
  checks.push('Recent-window param is validated and embeds a bounded open-or-recent SQL clause');
  checks.push('Default contract index skips vehicle/company/transaction laterals until search or paid sort needs them');
  const sqlCommands=[];
  const paged=await server.readManagementTable({async query(sql,params){
    sqlCommands.push(sql);
    if(sql.includes('LIMIT')){
      assert.equal(params[0],11);
      return {rows:Array.from({length:11},(_,i)=>({id:i+1,status:'renting',contract_number:`HD-${i+1}`,vehicles:[]}))};
    }
    assert.deepEqual(params[0],[1,2,3,4,5,6,7,8,9,10]);
    return {rows:params[0].map(id=>({id,status:'renting',contract_number:`HD-${id}`,vehicles:[{id:9,name:'Vision',license:'29A-123'}],total:1500000}))};
  }},'contracts',shared.managementTableQuery({...base,recentDays:30}));
  assert.equal(paged.rows.length,10);assert.equal(paged.rows[0].id,1);assert.equal(paged.pages,2);
  assert.equal(paged.rows[0].license,'29A-123');assert.equal(paged.rows[0].total_amount,1500000);
  assert(sqlCommands[0]&&/\bLIMIT \$1\b/.test(sqlCommands[0])&&sqlCommands[0].includes('OFFSET'));
  assert(!sqlCommands[0].includes('GROUP BY')&&!sqlCommands[0].includes('himoto.transactions'));
  assert(sqlCommands[1]&&sqlCommands[1].includes('ANY($1'));
  assert.match(sqlCommands[1],/order_status='draft'/);
  assert.match(sqlCommands[1],/draft_payload::jsonb->'management_composer'/);
  assert.match(sqlCommands[1],/draft_payload::jsonb->'order_items'/);
  assert.match(sqlCommands[1],/xmin::text AS draft_revision/);
  checks.push('Default recent list fetches only the current page from orders');
  checks.push('Page hydrate returns the saved composer draft and revision so a reopened draft is not reconstructed empty');
  let called=false;await assert.rejects(()=>server.readManagementTable({query(){called=true;}},'contracts',new URLSearchParams('size=999')),server.ManagementTableError);assert.equal(called,false);
  assert.equal(mapApiRow('contracts',{id:1,rent_at:new Date('2026-10-10T09:00:00Z')}).start_date,'2026-10-10T16:00');
  assert.equal(mapApiRow('contracts',{id:2,return_at:new Date('2026-10-12T17:00:00Z')}).end_date,'2026-10-13T00:00');
  checks.push('Page/filter bounds are validated before SQL; PostgreSQL Date values map to Vietnam local time so midnight +07 does not shift a calendar day');
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
      for(const change of [{page:2},{sort:'vehicle_name',direction:'desc'},{store:'31'},{query:{...EMPTY_QUERY,status:'completed',search:'honda'}},{query:{...EMPTY_QUERY,search:'188.94'}},{query:{...EMPTY_QUERY,search:'188.94'},page:2},{query:{...EMPTY_QUERY,search:'188.94'},direction:'desc'}]){
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

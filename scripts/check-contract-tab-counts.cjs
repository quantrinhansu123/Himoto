const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){
  const c=await ownerDatabase.connect(),checks=[];
  try{
    await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='20s'");
    const tables=['orders','order_vehicle_details','vehicles','stores','staff_profiles','transactions','customers','pricing','users'];
    for(const table of tables)await c.query(`CREATE TEMP TABLE qa_tab_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
    await c.query('CREATE TEMP VIEW qa_tab_staff_account_attribution AS SELECT id,user_id,full_name,store_id FROM qa_tab_staff_profiles');
    const ownershipFunction=fs.readFileSync(path.join(__dirname,'../docs/sql/2026-11-01-ownership-hq-customer-source.sql'),'utf8').match(/CREATE OR REPLACE FUNCTION himoto[.]is_ownership_customer_source_store[\s\S]*?\$\$;/)[0];
    await c.query(ownershipFunction.replaceAll('himoto.','pg_temp.qa_tab_').replaceAll("'himoto'","'pg_temp'"));
    const db={async query(sql,args){
      for(const table of ['is_ownership_customer_source_store','staff_account_attribution',...tables])sql=sql.replaceAll('himoto.'+table,'pg_temp.qa_tab_'+table);
      assert(!sql.includes('himoto.'),'Every business read must use isolated fixtures: '+[...new Set(sql.match(/himoto[.]\w+/g)||[])].join(', '));
      return c.query(sql,args);
    }};
    await c.query("INSERT INTO qa_tab_stores(id,store_name,kind) VALUES(1,'QA branch','traditional'),(2,'QA foreign','traditional'),(3,'QA ownership','lease_to_own')");
    const fixtures=[
      [1,'renting',1,-1],[2,'renting',1,4],[3,'overdue',1,12],[4,'bad_debt',1,20],
      [5,'draft',1,-1],[6,'completed',1,3],[7,'overdue',2,15],[8,'overdue',3,8],
      [9,'renting',1,5],
    ];
    for(const[id,status,store,days]of fixtures){
      await c.query(`INSERT INTO qa_tab_orders(id,contract_number,order_type,order_status,store_id,total,pid,rent_at,return_at,draft_payload)
        VALUES($1::bigint,'QA-'||$1::text,'daily',$2,$3,'1000',0,now()-interval '30 days',CASE WHEN $1::bigint=9 THEN NULL ELSE now()-$4::int*interval '1 day' END,'{}')`,[id,status,store,days]);
      await c.query(`INSERT INTO qa_tab_vehicles(id,name,license) VALUES($1::bigint,'QA vehicle','QA-'||$1::text)` ,[id]);
      await c.query(`INSERT INTO qa_tab_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,type,hiring_fee)
        VALUES($1,$1,$1,now()-interval '30 days',now()-$2::int*interval '1 day','day',100)`,[id,days]);
    }
    const read=extra=>readManagementTable(db,'contracts',new URLSearchParams({store:'1',size:'1',status_counts:'1',scope_count:'1',...extra}));
    const counts=result=>Object.fromEntries(result.statusCounts);
    const all=await read({});
    assert.equal(all.total,7);assert.equal(all.tabCount,7);assert.equal(counts(all).draft,1);assert.equal(counts(all).completed,1);assert.equal(counts(all).bad_debt,1);assert.equal(counts(all).overdue,3);
    const late=await read({scope:'overdue',status:'overdue',overdue_bucket:'traditional-3'});
    assert.equal(late.total,3);assert.equal(late.tabCount,4);assert.equal(counts(late).overdue,3);assert.equal(counts(late).bad_debt,1);
    assert.equal(late.overdueCounts['traditional-overdue'],3);assert.equal(late.overdueCounts['traditional-3'],3);assert.equal(late.overdueCounts['traditional-10'],1);assert.equal(late.overdueCounts['traditional-bad-debt'],1);
    const bad=await read({scope:'overdue',status:'bad_debt',overdue_bucket:'traditional-bad-debt'});
    assert.equal(bad.total,1);assert.deepEqual(bad.statusCounts,late.statusCounts);assert.deepEqual(bad.overdueCounts,late.overdueCounts);
    const page2=await read({scope:'overdue',status:'overdue',overdue_bucket:'traditional-3',page:'2'});
    assert.deepEqual(page2.statusCounts,late.statusCounts);assert.deepEqual(page2.overdueCounts,late.overdueCounts);
    checks.push('Every status/age badge counts the whole branch result independent of selected tab, age group and page; bad debt and legacy per-vehicle deadlines stay visible');
    const plate=await read({search:'QA-9',status:'overdue'});assert.equal(plate.total,1);assert.equal(plate.tabCount,1);assert.equal(counts(plate).overdue,1);
    const foreign=await read({store:'2',scope:'overdue',status:'overdue'});assert.equal(foreign.tabCount,1);assert.equal(foreign.total,1);
    const empty=await read({search:'NO-MATCH'});assert.equal(empty.tabCount,0);assert.deepEqual(empty.statusCounts,[]);
    const owner=await read({store:'3',scope:'ownership',status:'overdue',overdue_bucket:'ownership-6-15'});
    assert.equal(owner.tabCount,1);assert.equal(owner.overdueCounts['ownership-6-15'],1);
    checks.push('Plate searches, empty results, store changes and ownership age groups preserve accurate counts without reading business rows');
    for(const scope of ['', 'overdue'])for(const status of ['', 'renting', 'overdue', 'bad_debt', 'draft']){
      const params={scope,status,size:'2'};
      const page=await read({...params,status_counts:'0',scope_count:'0'});
      const stats=await read({...params,statistics_only:'1'});
      const exported=await read({...params,all:'1'});
      assert.equal(page.total,stats.total,`${scope}/${status}: page and statistics agree`);
      assert.equal(exported.total,stats.total,`${scope}/${status}: export and statistics agree`);
      assert.equal(exported.rows.length,stats.total);
      if(status==='overdue'){
        assert.equal(page.total,4);assert(exported.rows.some(row=>String(row.id)==='4'),'Bad debt belongs to overdue');
        assert(exported.rows.some(row=>String(row.id)==='9'),'Legacy per-vehicle return date belongs to overdue');
      }
      if(scope==='overdue')assert.equal(stats.scopeCount,4,'Heading counts hydrated overdue membership, not open candidates');
    }
    const global=await read({store:'all',scope:'overdue',status:'overdue'});
    assert.equal(global.total,6);assert.equal(global.scopeCount,6);
    const scopedSearch=await read({store:'all',scope:'overdue',search:'QA-9',statistics_only:'1'});
    assert.equal(scopedSearch.total,1);assert.equal(scopedSearch.scopeCount,6);
    const scopedFilter=await read({store:'all',scope:'overdue',filter_store_id:'1',statistics_only:'1'});
    assert.equal(scopedFilter.total,4);assert.equal(scopedFilter.scopeCount,6);
    checks.push('Separate page/statistics requests and Excel exports agree across all tabs, including bad debt and legacy deadlines; overdue headings count the real scope');
    await c.query("UPDATE qa_tab_orders SET created_at=now()-interval '60 days'");
    const recent=await read({recent:'3',size:'50'});
    assert.equal(recent.total,6);assert(!recent.rows.some(row=>String(row.id)==='6'),'Old closed history is bounded');
    assert(recent.rows.some(row=>String(row.id)==='4'),'Old bad debt stays visible');
    assert(recent.rows.some(row=>String(row.id)==='5'),'Old draft stays visible');
    const recentOverdue=await read({recent:'3',status:'overdue',statistics_only:'1'});
    assert.equal(recentOverdue.total,4);
    await c.query("UPDATE qa_tab_orders SET created_at=now() WHERE id=6");
    assert.equal((await read({recent:'3'})).total,7,'Recent closed history stays visible');
    assert.equal((await read({})).total,7,'Full history retains closed contracts');
    checks.push('Default recent window retains every old open contract, hides old closed history, and includes recently created closed history');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

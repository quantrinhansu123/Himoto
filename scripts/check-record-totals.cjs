const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
const {requestManagementTable}=load(path.join(root,'lib/management/management-table'));
const {countBatteryContracts}=load(path.join(root,'lib/server/battery-contracts'));
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const checks=[];
async function main(){
  const c=await ownerDatabase.connect();
  try{
    await c.query('BEGIN');
    for(const table of ['customers','vehicles','staff_profiles','stores','users','orders','order_vehicle_details','gps_devices','management_gps_accounts','battery_contracts'])
      await c.query(`CREATE TEMP TABLE qa_totals_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
    await c.query(`CREATE FUNCTION pg_temp.qa_totals_headquarters(bigint) RETURNS boolean LANGUAGE sql AS 'SELECT false'`);
    await c.query(`INSERT INTO qa_totals_stores(id,store_name,status) SELECT g,'QA '||g,CASE WHEN g%3=0 THEN 'inactive' ELSE 'opening' END FROM generate_series(1,43) g`);
    await c.query(`INSERT INTO qa_totals_customers(id,name,phone,id_card,store_id,status,warning)
      SELECT g,'QA '||g,'0900000000','QA-'||g,CASE WHEN g<=31 THEN 1 ELSE 2 END,CASE WHEN g%3=0 THEN 2 ELSE 1 END,'' FROM generate_series(1,43) g`);
    await c.query(`INSERT INTO qa_totals_staff_profiles(id,full_name,staff_code,position,store_id,status)
      SELECT g,'QA '||g,'QA-'||g,'QA',CASE WHEN g<=31 THEN 1 ELSE 2 END,CASE WHEN g%3=0 THEN 'inactive' ELSE '1' END FROM generate_series(1,43) g`);
    await c.query(`INSERT INTO qa_totals_vehicles(id,name,license,type,status,store_id,current_store_id)
      SELECT g,'QA '||g,'QA-'||g,'xeso',CASE WHEN g%3=0 THEN 'rent' ELSE 'ready' END,CASE WHEN g<=31 THEN 1 ELSE 2 END,CASE WHEN g<=31 THEN 1 ELSE 2 END FROM generate_series(1,43) g`);
    const commands=[];
    const proxy={async query(sql,args){
      commands.push({sql,args});
      // Details are irrelevant to counts. Prove only the selected vehicle IDs
      // are hydrated without querying live rental/GPS/transfer tables.
      if(sql.includes('WHERE v.id=ANY($1::bigint[])'))return c.query('SELECT * FROM qa_totals_vehicles WHERE id=ANY($1::bigint[])',args);
      sql=sql.replaceAll('himoto.ownership_may_use_headquarters_vehicle','pg_temp.qa_totals_headquarters');
      for(const table of ['customers','vehicles','staff_profiles','stores','users','orders','order_vehicle_details','gps_devices','management_gps_accounts','battery_contracts'])sql=sql.replaceAll(`himoto.${table}`,`pg_temp.qa_totals_${table}`);
      assert(!sql.includes('himoto.'),'All reads must use temporary fixtures');
      return c.query(sql,args);
    }};
    for(const kind of ['customers','vehicles','staff','stores']){
      const read=extra=>readManagementTable(proxy,kind,new URLSearchParams({size:'10',...extra}));
      const first=await read({}),last=await read({page:'5'}),clamped=await read({page:'999'});
      assert.equal(first.total,43);assert.equal(first.scopeCount,43);assert.equal(first.tabCount,43);assert.equal(first.pages,5);assert.equal(first.rows.length,10);
      assert.equal(last.rows.length,3);assert.equal(last.page,5);assert.equal(clamped.page,5);assert.deepEqual(last.rows,clamped.rows);
      const ids=[];for(let page=1;page<=5;page++)ids.push(...(await read({page:String(page)})).rows.map(row=>row.id));
      assert.equal(ids.length,43);assert.equal(new Set(ids).size,43);
      const selected=kind==='vehicles'?'using':kind==='customers'?'blacklist':'inactive';
      const status=await read({status:selected});
      assert.equal(status.total,14);assert.equal(status.scopeCount,43);assert.equal(status.tabCount,43);assert.equal(status.pages,2);assert.equal(new Map(status.statusCounts).get(selected),14);
      const absent=await read({search:'absent',page:'999'});
      assert.equal(absent.total,0);assert.equal(absent.scopeCount,43);assert.equal(absent.page,1);assert.equal(absent.pages,1);assert.equal(absent.rows.length,0);
      const search=await read({search:'QA 43'});assert.equal(search.total,1);assert.equal(search.scopeCount,43);assert.equal(search.rows[0].id,43);
      const up=await read({sort:'name',direction:'asc'}),down=await read({sort:'name',direction:'desc'});
      assert.notDeepEqual(up.rows.map(row=>row.id),down.rows.map(row=>row.id));
      assert.equal(up.rows[0].name,'QA 1');assert.equal(down.rows[0].name,'QA 9');
      if(kind!=='stores'){
        const scoped=await read({store:'1'}),scopedStatus=await read({store:'1',status:selected});
        assert.equal(scoped.total,31);assert.equal(scoped.scopeCount,31);assert.equal(scopedStatus.scopeCount,31);assert.equal(scopedStatus.total,10);
        assert.equal((await read({store:'99'})).scopeCount,0);
      }
      checks.push(`${kind}: exact totals over 5 pages, no gaps, clamped last/empty pages, stable global count through status/search and scoped store counts`);
    }
    await c.query(`CREATE OR REPLACE FUNCTION pg_temp.qa_totals_headquarters(bigint) RETURNS boolean LANGUAGE sql AS 'SELECT $1=1'`);
    const shared=await readManagementTable(proxy,'vehicles',new URLSearchParams({store:'2',size:'50'}));
    assert.equal(shared.scopeCount,43);assert.equal(shared.total,43);assert.equal(shared.rows.length,43);
    checks.push('Vehicle counts and rows both include headquarters stock when the same ownership permission allows it');
    await c.query(`INSERT INTO qa_totals_orders(id,store_id,order_status,total,pid) VALUES(101,1,'renting','100',100)`);
    await c.query(`INSERT INTO qa_totals_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES
      (201,101,1,now()-interval '8 days',now()-interval '5 days'),
      (202,101,2,now()-interval '8 days',now()-interval '2 days'),
      (203,101,3,now(),now()+interval '2 days')`);
    const vehicles=extra=>readManagementTable(proxy,'vehicles',new URLSearchParams({size:'10',...extra}));
    const late=await vehicles({overdue_days:'3',overdue_compare:'gt'}),exact=await vehicles({overdue_days:'2'}),none=await vehicles({overdue_days:'99999'});
    assert.equal(late.total,1);assert.equal(late.rows[0].id,1);assert.equal(exact.total,1);assert.equal(exact.rows[0].id,2);assert.equal(none.total,0);assert.equal(none.scopeCount,43);
    checks.push('Vehicle overdue age filters run before pagination/counting; future rentals remain current and empty filters preserve the whole-catalogue counter');
    await c.query("UPDATE qa_totals_customers SET name='Nguyễn Đức Anh',address='Đống Đa' WHERE id=1; UPDATE qa_totals_staff_profiles SET full_name='Nguyễn Đức Anh' WHERE id=1; UPDATE qa_totals_vehicles SET license='29B1-123.45' WHERE id=1; UPDATE qa_totals_orders SET customer_id=1 WHERE id=101");
    for(const kind of ['customers','staff']){
      const found=await readManagementTable(proxy,kind,new URLSearchParams({search:'nguyen duc anh'}));assert.equal(found.total,1);assert.equal(found.rows[0].id,1);assert.equal(found.scopeCount,43);
    }
    const plate=await vehicles({search:'29b112345'});assert.equal(plate.total,1);assert.equal(plate.rows[0].id,1);
    const holder=await vehicles({search:'nguyen duc anh'});assert.equal(holder.total,3);assert.equal(holder.scopeCount,43);
    checks.push('Unaccented Vietnamese names match customers/staff and active vehicle holders; punctuation-free plates resolve the correct vehicle before pagination');
    await c.query('UPDATE qa_totals_orders SET store_id=2 WHERE id=101');
    const beneficiary=await vehicles({filter_beneficiary_store_id:'2'});assert.equal(beneficiary.total,15);
    const holderSort=await vehicles({sort:'holder_name',direction:'desc'});assert(holderSort.rows.slice(0,3).every(row=>[1,2,3].includes(row.id)));
    checks.push('Beneficiary filtering follows the active rental branch for cross-branch stock; customer-holder sorting is applied before slicing');
    await c.query(`INSERT INTO qa_totals_battery_contracts(id,store_id,deleted_at) SELECT g,CASE WHEN g<=5001 THEN 1 ELSE 2 END,CASE WHEN g=5003 THEN now() ELSE NULL END FROM generate_series(1,5003) g`);
    assert.equal(await countBatteryContracts(proxy),5002);assert.equal(await countBatteryContracts(proxy,1),5001);assert.equal(await countBatteryContracts(proxy,2),1);assert.equal(await countBatteryContracts(proxy,99),0);
    checks.push('Battery totals are not capped at 5,000 rows and exclude deleted contracts and other stores');
    for(const kind of ['customers','vehicles','staff','stores'])await assert.rejects(readManagementTable({query:async()=>({rows:[]})},kind,new URLSearchParams()),/Không đọc được tổng/);
    checks.push('A missing count fails the read instead of inventing zero or a page-length total');
    const originalFetch=global.fetch;
    try{
      const input={kind:'customers',query:{search:'',status:'',startDate:'',endDate:'',overdueDays:'',overdueCompare:'eq',filters:{}},scope:'',store:'all',page:1,size:10,sort:'code',direction:'asc'};
      for(const invalid of [undefined,null,-1,1.5,'43']){
        global.fetch=async()=>({ok:true,json:async()=>({status:'success',data:{rows:[],total:0,scopeCount:invalid,tabCount:0,statusCounts:[]}})});
        await assert.rejects(requestManagementTable(input),/Danh sách trả về không hợp lệ/);
      }
      checks.push('The client rejects missing, negative, fractional or string totals instead of displaying a successful zero');
    }finally{global.fetch=originalFetch;}
    assert(commands.filter(({sql})=>sql.includes('WHERE v.id=ANY')).every(({args})=>args[0].length<=50));
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

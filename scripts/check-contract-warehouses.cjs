const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const {projectManagementTable,managementTableQuery,managementStatisticsKey}=load(path.join(root,'lib/management/management-table'));
const {parseManagementTable,readManagementTable,ManagementTableError}=load(path.join(root,'lib/server/management-table'));
const {contractWarehouseStoreSql}=load(path.join(root,'lib/server/contract-warehouses'));
const checks=[];
const vehicle=(id,store,name,completed_at=null)=>({id,name:'Xe QA',license:`QA-${id}`,warehouse_store_id:store,warehouse_store_name:name,completed_at});
const raw={id:1,contract_number:'QA-NH-LANG',status:'renting',store_id:31,store_name:'CS Láng',vehicles:[vehicle(1,32,'CS Nguyễn Hoàng')]};
async function main(){
 const row=mapApiRow('contracts',raw);assert.equal(row.store_id,31);assert.equal(row.store_name,'CS Láng');assert.equal(row.warehouse_store_name,'CS Nguyễn Hoàng');assert.equal(row.warehouse_store_ids_json,'[32]');
 const swapped=mapApiRow('contracts',{...raw,id:2,vehicles:[vehicle(1,32,'CS Nguyễn Hoàng','2026-10-01'),vehicle(2,23,'CS Giáp Bát')]});
 assert.equal(swapped.warehouse_store_name,'CS Giáp Bát');
 const unknown=mapApiRow('contracts',{...raw,id:3,vehicles:[]});assert.equal(unknown.warehouse_store_name,'');assert.equal(unknown.warehouse_store_ids_json,'[]');
 const input={kind:'contracts',query:{...EMPTY_QUERY},store:'32',storeBasis:'warehouse',scope:'',page:1,size:10,sort:'code',direction:'asc'};
 const rows=[row,swapped,unknown,{...row,id:4,store_id:32,store_name:'CS Nguyễn Hoàng'}];
 assert.equal(projectManagementTable(rows,input).total,2);
 assert.equal(projectManagementTable(rows,{...input,store:'31'}).total,3);
 const source=projectManagementTable(rows,{...input,query:{...EMPTY_QUERY,filters:{store_id:'31'}}});assert.equal(source.total,1);assert.equal(source.scopeCount,2);assert.equal(source.rows[0].id,1);
 const legacy=projectManagementTable(rows,{...input,storeBasis:undefined});assert.equal(legacy.total,1);assert.equal(legacy.rows[0].id,4);
 checks.push('Branch picker matches warehouse or customer source; active replacement lines override returned vehicles; missing stock never inherits the customer source');
 const many=Array.from({length:21},(_,i)=>({...row,id:i+10,code:`QA-${i}`}));
 const p1=projectManagementTable(many,input),p2=projectManagementTable(many,{...input,page:2});assert.equal(p1.total,21);assert.equal(p2.total,21);assert.equal(p1.scopeCount,21);assert(!p1.rows.some(a=>p2.rows.some(b=>a.id===b.id)));
 assert.equal(projectManagementTable(many,input,true).rows.length,21);
 const query=managementTableQuery(input);assert.equal(query.get('store_basis'),'warehouse');assert.equal(parseManagementTable('contracts',query).storeBasis,'warehouse');
 assert.notEqual(managementStatisticsKey(query.toString()),managementStatisticsKey(managementTableQuery({...input,storeBasis:undefined}).toString()));
 assert.throws(()=>parseManagementTable('vehicles',query),ManagementTableError);
 checks.push('Warehouse scope preserves pagination, export and whole-result counts; source defaults stay compatible and statistics caches distinguish the two modes');
 if(process.argv.includes('--live-temp')||process.argv.includes('--live-read')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const db=load(path.join(root,'lib/server/himoto-database')),c=await db.ownerDatabase.connect();
  try{
   if(process.argv.includes('--live-temp')){
    await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='15s'");
    await c.query(`CREATE TEMP TABLE qa_warehouse_orders(id bigint,store_id bigint,order_status text,draft_payload jsonb);
      CREATE TEMP TABLE qa_warehouse_lines(order_id bigint,vehicle_id bigint,completed_at timestamptz,deleted_at timestamptz);
      CREATE TEMP TABLE qa_warehouse_vehicles(id bigint,store_id bigint,current_store_id bigint);
      CREATE TEMP TABLE qa_warehouse_stores(id bigint,store_name text);
      INSERT INTO qa_warehouse_stores VALUES(31,'CS Láng'),(32,'CS Nguyễn Hoàng'),(23,'CS Giáp Bát');
      INSERT INTO qa_warehouse_vehicles VALUES(1,31,32),(2,23,23);
      INSERT INTO qa_warehouse_orders VALUES(1,31,'renting',NULL),(2,31,'renting',NULL),(3,31,'completed',NULL),
       (4,31,'draft','{"management_composer":{"draft":{"vehicle_store_id":"32"}}}'),(5,31,'renting',NULL),(6,31,'renting',NULL),(7,31,'renting',NULL),(8,32,'renting',NULL);
      INSERT INTO qa_warehouse_lines VALUES(1,1,NULL,NULL),(2,1,now(),NULL),(2,2,NULL,NULL),(3,1,now(),NULL),(6,1,NULL,now()),(7,1,NULL,NULL),(7,2,NULL,NULL),(8,1,NULL,NULL);`);
    const rewrite=sql=>sql.replaceAll('himoto.order_vehicle_details','pg_temp.qa_warehouse_lines').replaceAll('himoto.orders','pg_temp.qa_warehouse_orders').replaceAll('himoto.vehicles','pg_temp.qa_warehouse_vehicles').replaceAll('himoto.stores','pg_temp.qa_warehouse_stores');
    const select=async(store,source='')=>(await c.query(rewrite(`SELECT o.id FROM himoto.orders o WHERE true${contractWarehouseStoreSql(store)}${source?' AND o.store_id='+Number(source):''} ORDER BY o.id`))).rows.map(r=>Number(r.id));
    assert.deepEqual(await select('32'),[1,3,4,7,8]);assert.deepEqual(await select('32','31'),[1,3,4,7]);assert.deepEqual(await select('23'),[2,7]);assert.deepEqual(await select('31'),[1,2,3,4,5,6,7]);
    await c.query('ROLLBACK');checks.push('TEMP PostgreSQL: branch picker matches warehouse or source; ignore returned swap/deleted lines; include closed history and planned draft stock; deduplicate multi-vehicle orders');
   }
   if(process.argv.includes('--live-read')){
    await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='25s'");
    for(const [code,id] of [['VPS-28521',56598],['VPS-28404',56548]]){
     for(const store of ['32','31']){
      const page=await readManagementTable(c,'contracts',new URLSearchParams({search:code,store,store_basis:'warehouse',filter_store_id:'31',scope_count:'1',status_counts:'1'}));
      assert.equal(page.total,1);assert.equal(page.rows[0].id,id);assert.equal(page.rows[0].warehouse_store_name,'CS Nguyễn Hoàng');assert.equal(page.rows[0].store_id,31);assert.equal(new Map(page.statusCounts).get('renting'),1);
     }
     const full=await readManagementTable(c,'contracts',new URLSearchParams({all:'1',store:'31',store_basis:'warehouse',filter_id:String(id)}));assert.equal(full.total,1);assert.equal(full.rows[0].warehouse_store_name,'CS Nguyễn Hoàng');assert.equal(full.rows[0].store_id,31);
    }
    await c.query('ROLLBACK');checks.push('READ ONLY: both reported contracts appear under Nguyễn Hoàng stock and under Láng customer source; labels keep warehouse/source distinct');
   }
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
 }
 console.log(JSON.stringify({passed:checks.length,checks,businessWrites:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});

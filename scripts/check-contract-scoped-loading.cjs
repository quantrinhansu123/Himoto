const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {contractVehicleDetailsSql}=load(path.join(root,'lib/server/contract-vehicle-reads'));
const {contractWarehouseJoinSql}=load(path.join(root,'lib/server/contract-warehouses'));
const scope={id:162,store_id:35,scope_all:false,access_role:'ownership_manager',permissions:[],operation:''};
async function main(){
 const raw='SELECT o.id FROM himoto.orders o LEFT JOIN LATERAL (SELECT v.id FROM himoto.order_vehicle_details d LEFT JOIN himoto.vehicles v ON v.id = d.vehicle_id) labels ON true';
 assert.equal(contractVehicleDetailsSql(raw),raw);
 dataAccess.run(scope,()=>{
  const query=contractVehicleDetailsSql(raw+' '+contractWarehouseJoinSql()+' LEFT JOIN himoto.contract_vehicle_labels() other ON other.id=o.id');
  assert.equal(query.split('himoto.contract_vehicle_labels()').length-1,1);
  assert.equal(query.split('himoto.vehicle_inventory()').length-1,1);
  assert(query.includes('AS MATERIALIZED'));
  assert(!query.includes('LEFT JOIN himoto.vehicles'));
  assert.equal(contractVehicleDetailsSql('SELECT 1'),'SELECT 1');
 });
 if(!process.argv.includes('--live-read'))return console.log('PASS: scoped label/warehouse helpers materialize once; owner reads stay unchanged');
 require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
 const {himotoPool}=load(path.join(root,'lib/server/himoto-database'));
 const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
 const checks=[];
 try{
  for(const actor of [scope,{...scope,id:151,store_id:23,access_role:'branch_staff'}])await dataAccess.run(actor,async()=>{
   const c=await himotoPool.connect();
   try{
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='20s'");
    const started=Date.now();let hydration;
    const result=await readManagementTable({query:async(sql,args)=>{
     if(sql.includes('ANY($1::bigint[])'))hydration={sql,args};
     return c.query(sql,args);
    }},'contracts',new URLSearchParams({size:'10',store:String(actor.store_id),scope:actor.store_id===35?'ownership':''}));
    assert.equal(result.rows.length,10);assert(result.total>=10);
    const pageMs=Date.now()-started;
    console.log(JSON.stringify({store:actor.store_id,pageMs,phase:'optimized-page'}));
    assert(hydration.sql.includes('AS MATERIALIZED'));
    // Verify the returned page against the actual scoped order and vehicle
    // relationships; a shared label set must never cross-wire adjacent rows.
    const ids=result.rows.map(row=>row.id);
    const expectedOrders=(await c.query('SELECT id,contract_number,store_id FROM himoto.orders WHERE id=ANY($1::bigint[])',[ids])).rows;
    const lines=(await c.query('SELECT order_id,vehicle_id FROM himoto.order_vehicle_details WHERE order_id=ANY($1::bigint[]) AND deleted_at IS NULL',[ids])).rows;
    const labels=(await c.query('SELECT * FROM himoto.contract_vehicle_labels()')).rows;
    console.log(JSON.stringify({store:actor.store_id,phase:'scoped-reference-reads'}));
    const byVehicle=new Map(labels.map(row=>[Number(row.id),row]));
    for(const row of result.rows){
     const order=expectedOrders.find(order=>Number(order.id)===row.id);assert(order);
     assert.equal(row.code,order.contract_number);assert.equal(row.store_id,Number(order.store_id));
     const vehicles=JSON.parse(row.vehicles_json||'[]');
     const expectedIds=lines.filter(line=>Number(line.order_id)===row.id).map(line=>Number(line.vehicle_id)).sort((a,b)=>a-b);
     assert.deepEqual(vehicles.map(vehicle=>Number(vehicle.id)).sort((a,b)=>a-b),expectedIds);
     for(const vehicle of vehicles){const label=byVehicle.get(Number(vehicle.id));assert(label);assert.equal(vehicle.license,label.license);assert.equal(vehicle.name,label.name);}
    }
    if(actor.store_id===35){
     const found=await readManagementTable(c,'contracts',new URLSearchParams('store=35&scope=ownership&filter_id=59254&size=10'));
     assert.equal(found.total,1);assert.equal(found.rows[0].code,'3110264');assert.equal(found.rows[0].store_id,35);
    }
    checks.push({store:actor.store_id,pageMs,rows:result.rows.length,total:result.total,scopedRelationshipsMatch:true});
   }finally{await c.query('ROLLBACK');c.release();}
  });
  console.log(JSON.stringify({checks,businessWrites:0},null,2));
 }finally{await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

const assert=require('node:assert/strict'),path=require('node:path');
const openFixture=require('./lib/peak-staging.cjs'),{load,root}=require('./lib/load-typescript.cjs');
async function main(){
 const qa=await openFixture(process.argv[2]),checks=[];
 const{dataAccess}=load(path.join(root,'lib/server/access-context'));
 const vehicle=load(path.join(root,'lib/server/contract-vehicle-reads')),original=vehicle.contractVehicleDetailsSql;
 const{readManagementTable}=load(path.join(root,'lib/server/management-table'));
 let captured;
 vehicle.contractVehicleDetailsSql=(sql,ids)=>{const generated=original(sql,ids);if(ids)captured={sql,ids,generated};return generated;};
 try{
  const users=(await qa.pool.query('SELECT user_id,access_role,store_id,scope_all,permissions FROM himoto.management_account_access WHERE user_id IN(1,2,42,43) ORDER BY user_id')).rows;
  for(const u of users){const scope={id:Number(u.user_id),access_role:u.access_role,store_id:u.store_id==null?null:Number(u.store_id),scope_all:u.scope_all,permissions:u.permissions,operation:''};
   await dataAccess.run(scope,async()=>{
    const c=await qa.pool.connect();try{
     await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='25s'");
     if(scope.access_role!=='admin'){
      await c.query("SELECT set_config('himoto.actor_id',$1,true),set_config('himoto.store_id',$2,true),set_config('himoto.scope_all',$3,true)",[String(scope.id),String(scope.store_id),String(scope.scope_all)]);
      await c.query('SET LOCAL ROLE himoto_scoped');
      const oldLocations=(await c.query('SELECT id,store_id,store_name FROM himoto.vehicle_inventory() ORDER BY id')).rows;
      assert.deepEqual((await c.query('SELECT * FROM himoto.contract_vehicle_locations() ORDER BY id')).rows,oldLocations);
      for(const needle of ['%QA-000004%','%qa000007%','%100%','',null]){
        const old=(await c.query("SELECT id,license FROM himoto.vehicle_inventory() WHERE license ILIKE $1 OR regexp_replace(upper(COALESCE(license,'')),'[^A-Z0-9]','','g') LIKE '%'||regexp_replace(upper($1),'[^A-Z0-9]','','g')||'%' ORDER BY id",[needle])).rows;
        assert.deepEqual((await c.query('SELECT * FROM himoto.contract_search_vehicles($1) ORDER BY id',[needle])).rows,old);
      }
     }
     for(const query of ['page=1&size=10','page=7&size=10&direction=desc','page=1&size=10&status=renting','page=1&size=10&filter_id=3','page=1&size=10&search=QA-0000003','page=1&size=10&scope=overdue']){
      captured=null;let hydrated;
      const db={query:async(sql,args)=>{if(captured&&sql===captured.generated)hydrated={sql,args};return c.query(sql,args);}};
      const result=await readManagementTable(db,'contracts',new URLSearchParams(query+'&store=all'));
      if(captured&&hydrated){
       const before=(await c.query(original(captured.sql),hydrated.args)).rows;
       const after=(await c.query(original(captured.sql,captured.ids),hydrated.args)).rows;
       assert.deepEqual(after,before,`${scope.access_role}/${query}`);
       if(scope.access_role!=='admin'){
        assert(hydrated.sql.includes('contract_vehicles_for_orders($1::bigint[])'));
        assert(!hydrated.sql.includes('vehicle_inventory()'));assert(!hydrated.sql.includes('contract_vehicle_labels()'));
        const ids=hydrated.args[0];
        if(query.includes('scope=overdue')){assert(ids.length<=250);assert(result.rows.every(row=>ids.map(Number).includes(row.id)));}
        else{assert(ids.length<=10);assert.deepEqual(ids.map(Number).sort((a,b)=>a-b),result.rows.map(r=>r.id).sort((a,b)=>a-b));}
       }
      }
      checks.push({role:scope.access_role,case:query,rows:result.rows.length,parity:true});
     }
     if(scope.access_role==='branch_staff'&&scope.store_id===32){
      assert.equal((await c.query('SELECT count(*)::int AS n FROM himoto.contract_vehicles_for_orders(ARRAY[1::bigint])')).rows[0].n,0);
      const rows=(await c.query('SELECT * FROM himoto.contract_vehicles_for_orders(ARRAY[3,3,NULL]::bigint[])')).rows;
      assert.equal(rows.length,1);assert.equal(Number(rows[0].id),4);assert.equal(rows[0].warehouse_id,null);assert(rows[0].license);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM himoto.contract_vehicles_for_orders(NULL)')).rows[0].n,0);
      await c.query("SELECT set_config('himoto.actor_id','',true)");
      assert.equal((await c.query('SELECT count(*)::int AS n FROM himoto.contract_vehicles_for_orders(ARRAY[3::bigint])')).rows[0].n,0);
      checks.push({case:'foreign order denied, archived label retained with absent warehouse, duplicate/null IDs and missing actor',parity:true});
     }
    }finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
   });
  }
  console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,productionWrites:0},null,2));
 }finally{vehicle.contractVehicleDetailsSql=original;await qa.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});

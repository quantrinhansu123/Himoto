const assert=require('node:assert/strict'),path=require('node:path');
const open=require('./lib/peak-staging.cjs'),{load,root}=require('./lib/load-typescript.cjs');
const fold=v=>`lower(translate(regexp_replace(normalize(COALESCE(${v},''),NFD) COLLATE "C",'[\u0300-\u036f]','','g'),'đĐ','dD'))`;
(async()=>{const qa=await open(process.argv[2]),c=await qa.pool.connect();let cases=0;
 const{dataAccess}=load(path.join(root,'lib/server/access-context')),{contractSearchSql}=load(path.join(root,'lib/server/management-table'));
 try{
  for(const [id,store,role]of [[2,32,'branch_staff'],[42,35,'ownership_manager'],[43,31,'branch_staff']]){
   await dataAccess.run({id,store_id:store,access_role:role,scope_all:false,permissions:[],operation:''},async()=>{
    await c.query('BEGIN READ ONLY');try{await c.query("SELECT set_config('himoto.actor_id',$1,true),set_config('himoto.store_id',$2,true),set_config('himoto.scope_all','false',true)",[String(id),String(store)]);await c.query('SET LOCAL ROLE himoto_scoped');
     for(const search of ['QA-0000300','Khach QA 301','0900000301','QA000301','%','_','QA-0000004','unmatched-needle']){
      const needle=contractSearchSql(search).value;
      const old=` AND o.id IN(SELECT matched.id FROM himoto.orders matched WHERE matched.contract_number ILIKE $1 OR matched.draft_reference ILIKE $1 OR ${fold('matched.customer_name')} LIKE ${fold('$1')} OR COALESCE(matched.customer_phone,'') ILIKE $1 OR COALESCE(matched.customer_idnumber,'') ILIKE $1
        UNION SELECT linked_order.id FROM himoto.orders linked_order JOIN himoto.customers linked_customer ON linked_customer.id=linked_order.customer_id WHERE ${fold('linked_customer.name')} LIKE ${fold('$1')} OR COALESCE(linked_customer.phone,'') ILIKE $1 OR COALESCE(linked_customer.id_card,'') ILIKE $1
        UNION SELECT d.order_id FROM himoto.order_vehicle_details d JOIN himoto.vehicle_inventory() v ON v.id=d.vehicle_id WHERE d.deleted_at IS NULL AND (v.license ILIKE $1 OR regexp_replace(upper(COALESCE(v.license,'')),'[^A-Z0-9]','','g') LIKE '%'||regexp_replace(upper($1),'[^A-Z0-9]','','g')||'%'))`;
      const base='SELECT o.id FROM himoto.orders o WHERE o.deleted_at IS NULL';
      const expected=(await c.query(base+old+' ORDER BY o.id',[needle])).rows;
      const current=contractSearchSql(search);assert.equal(current.value,needle);
      const actual=(await c.query(base+current.sql.replaceAll('$3','$1')+' ORDER BY o.id',[current.value])).rows;
      assert.deepEqual(actual,expected,`${role}/${search}`);cases++;
     }
    }finally{await c.query('ROLLBACK');}
   });
  }
  console.log(JSON.stringify({passed:cases,checks:['Search IDs identical to the original RLS query','Codes, accent folding, phones, normalized plates, escaped wildcards and missing results','Branch, foreign branch and ownership scopes'],fixtureOnly:true,productionWrites:0}));
 }finally{c.release();await qa.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

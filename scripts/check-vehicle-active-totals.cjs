// Execute the production list/count SQL against an isolated PostgreSQL engine.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const { readManagementTable, parseManagementTable } = load(path.join(root,'lib/server/management-table'));
const { projectManagementTable } = load(path.join(root,'lib/management/management-table'));
async function main() {
  const at = process.argv.indexOf('--pglite-path'); assert(at >= 0, 'Pass an isolated --pglite-path');
  const pg = new (require(path.resolve(process.argv[at+1])).PGlite)();
  let cases = 0;
  try {
    await pg.exec(`CREATE SCHEMA himoto;
      CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);
      INSERT INTO himoto.stores VALUES(23,'QA A'),(24,'QA B');
      CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,name text,license text,brand text,type text,year int,status text,odometer int,color text,chassis text,engine text,store_id bigint,current_store_id bigint,deleted_at timestamptz);
      CREATE TABLE himoto.orders(id bigint PRIMARY KEY,order_status text,deleted_at timestamptz,draft_payload jsonb,customer_id bigint,customer_name text);
      CREATE TABLE himoto.customers(id bigint PRIMARY KEY,name text);
      CREATE TABLE himoto.order_vehicle_details(id bigint,vehicle_id bigint,order_id bigint,deleted_at timestamptz,completed_at timestamptz);
      CREATE FUNCTION himoto.ownership_may_use_headquarters_vehicle(bigint) RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE FUNCTION himoto.vehicle_rental_sources(bigint[]) RETURNS TABLE(vehicle_id bigint,store_id bigint) LANGUAGE sql AS 'SELECT NULL::bigint,NULL::bigint WHERE false';
      INSERT INTO himoto.vehicles(id,name,license,status,store_id,current_store_id)
      SELECT g,'QA '||g,'QA-'||g,CASE g%5 WHEN 0 THEN 'sold' WHEN 1 THEN 'ready' WHEN 2 THEN 'rent' WHEN 3 THEN 'maintenance' ELSE 'broken' END,CASE WHEN g<=31 THEN 23 ELSE 24 END,CASE WHEN g<=31 THEN 23 ELSE 24 END FROM generate_series(1,43) g;
      INSERT INTO himoto.vehicles(id,name,license,status,store_id,current_store_id,deleted_at) VALUES(99,'Deleted','QA-deleted','ready',23,23,now()),(100,'No store','QA-none','ready',NULL,NULL,NULL);`);
    const source = (await pg.query("SELECT id,name,license,CASE status WHEN 'rent' THEN 'using' WHEN 'maintenance' THEN 'repairing' ELSE status END AS status,COALESCE(current_store_id,store_id) AS store_id FROM himoto.vehicles WHERE deleted_at IS NULL AND COALESCE(current_store_id,store_id)>0")).rows.map(r=>({...r,id:Number(r.id),store_id:Number(r.store_id),code:String(r.id)}));
    const db = { async query(sql,args) {
      // Hydration is irrelevant to list membership; keep it on the same local rows.
      if (sql.includes('WHERE v.id=ANY($1::bigint[])')) return pg.query('SELECT * FROM himoto.vehicles v WHERE id=ANY($1::bigint[])',args);
      return pg.query(sql,args);
    } };
    for (const store of ['all','23','24','999']) for (const status of ['','sold','using','ready','repairing','broken']) for (const page of ['1','2','999']) {
      const params = new URLSearchParams({store,status,page,size:'10',sort:'code',direction:'asc'});
      const expected = projectManagementTable(source,parseManagementTable('vehicles',params));
      const actual = await readManagementTable(db,'vehicles',params);
      for (const key of ['total','scopeCount','tabCount','page','pages']) assert.equal(actual[key],expected[key],`${store}:${status}:${page}:${key}`);
      assert.deepEqual(actual.rows.map(r=>r.id),expected.rows.map(r=>r.id));
      assert.deepEqual(new Map(actual.statusCounts),new Map(expected.statusCounts));
      if (!status) assert(actual.rows.every(r=>r.status!=='sold'));
      if (status==='sold') assert(actual.rows.every(r=>r.status==='sold'));
      cases++;
    }
    const all = await readManagementTable(db,'vehicles',new URLSearchParams({size:'50'}));
    assert.equal(all.total,35); assert.equal(new Map(all.statusCounts).get('sold'),8);
    assert.equal(all.tabCount,35); assert.equal(all.scopeCount,35);
    for(const status of ['','sold'])for(const search of ['QA 5','QA-10','missing-qa']){
      const params=new URLSearchParams({status,search,size:'50'}),page=await readManagementTable(db,'vehicles',params);
      assert.equal(page.tabCount,status==='sold'&&search!=='missing-qa'?0:page.total);
      if(status==='sold'&&search!=='missing-qa')assert(page.total>0);
      if(!status)assert(page.rows.every(row=>row.status!=='sold'));
      cases++;
    }
    await pg.exec(`CREATE FUNCTION himoto.vehicle_inventory() RETURNS TABLE(id bigint,name text,license text,type text,status text,store_id bigint,store_name text,from_store_name text,to_store_name text,available boolean) LANGUAGE sql AS $$
      SELECT v.id,v.name,v.license,coalesce(v.type,''),v.status,coalesce(v.current_store_id,v.store_id),s.store_name,''::text,''::text,v.status='ready'
      FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=coalesce(v.current_store_id,v.store_id) WHERE v.deleted_at IS NULL AND coalesce(v.current_store_id,v.store_id)>0 $$;`);
    const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool,descriptor=Object.getOwnPropertyDescriptor(pool,'query');
    try {
      Object.defineProperty(pool,'query',{configurable:true,value:(sql,params)=>pg.query(sql,params)});
      const inventory=await load(path.join(root,'lib/server/mobile-fleet-inventory')).readMobileFleetInventory({id:7,role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['vehicles.read']},new URLSearchParams());
      assert.equal(inventory.total,35);assert.equal(inventory.scopeCount,35);assert(inventory.rows.every(row=>row.status!=='sold'));cases++;
    }finally{Object.defineProperty(pool,'query',descriptor);}
    console.log(JSON.stringify({ok:true,cases,checks:['Default fleet and global/search tab totals exclude sold stock; the sold tab remains independently readable','Real SQL and web projection agree across stores, statuses, clamped pagination and normalized legacy states','Deleted stock and vehicles without a valid warehouse remain excluded'],externalRequests:0,businessWrites:0}));
  } finally { await pg.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

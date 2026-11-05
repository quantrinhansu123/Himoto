// Isolated PostgreSQL; no network or production data.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
async function run(){
 const arg=process.argv.indexOf('--pglite-path');assert(arg>=0);
 const {PGlite}=require(path.resolve(process.argv[arg+1])),db=new PGlite();
 try {
  await db.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
    CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT current_setting('qa.all',true)='true' OR id=NULLIF(current_setting('qa.store',true),'')::bigint $$;
    CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,order_status text,draft_payload json,deleted_at timestamptz,contract_number text,draft_reference text);
    CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,store_id bigint,deleted_at timestamptz,license text,name text);
    CREATE TABLE himoto.transactions(id bigint PRIMARY KEY,order_id bigint,store_id bigint,status text,type text,name text);
    CREATE TABLE himoto.vehicle_location_events(id bigint PRIMARY KEY,vehicle_id bigint,from_store_id bigint,to_store_id bigint,event_type text);
    CREATE TABLE himoto.management_mobile_push_devices(token_hash char(64) PRIMARY KEY);
    GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
    GRANT SELECT ON himoto.orders,himoto.vehicles TO himoto_scoped;
    ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;ALTER TABLE himoto.vehicles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY orders_scope ON himoto.orders TO himoto_scoped USING(himoto.access_store(store_id));
    CREATE POLICY vehicles_scope ON himoto.vehicles TO himoto_scoped USING(himoto.access_store(store_id));
    INSERT INTO himoto.orders(id,store_id,order_status,draft_payload) VALUES(101,23,'draft','{}'),(102,24,'draft','{}');
    INSERT INTO himoto.vehicles(id,store_id) VALUES(201,23),(202,24);`);
  const migration=fs.readFileSync('docs/sql/2026-11-05-mobile-activity-events.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec(`UPDATE himoto.orders SET order_status='renting' WHERE id=101;
    UPDATE himoto.orders SET draft_payload='{"management_composer":{"versions":[{"kind":"renewal","version":2}]}}' WHERE id=101;
    UPDATE himoto.orders SET draft_payload='{"management_composer":{"versions":[{"kind":"renewal","version":2}],"return_adjustments":[{"item_id":31}]}}' WHERE id=101;
    INSERT INTO himoto.transactions VALUES(1,101,23,'approved','in','order:payment'),(2,101,23,'approved','out','order:refund');
    INSERT INTO himoto.vehicle_location_events VALUES(1,201,23,24,'manual_transfer'),(2,201,23,24,'unrelated');
    UPDATE himoto.orders SET order_status='renting' WHERE id=102;`);
  let rows=(await db.query('SELECT kind,resource_id FROM himoto.management_mobile_activity_events ORDER BY id')).rows;
  assert.deepEqual(rows.map(x=>x.kind),['contract_created','renewal','return','payment','transfer','contract_created']);
  await db.exec("UPDATE himoto.orders SET draft_payload=draft_payload WHERE id=101");
  assert.equal((await db.query('SELECT count(*)::int n FROM himoto.management_mobile_activity_events')).rows[0].n,6);
  await db.exec(`INSERT INTO himoto.orders(id,store_id,order_status,draft_payload) VALUES(103,23,'renting','{}');
    INSERT INTO himoto.transactions VALUES(4,103,23,'approved','addon','addon');`);
  assert.deepEqual((await db.query("SELECT kind FROM himoto.management_mobile_activity_events WHERE resource_id=103 ORDER BY id")).rows.map(row=>row.kind),['contract_created','payment']);
  await db.exec('BEGIN');
  await db.exec("INSERT INTO himoto.transactions VALUES(3,101,23,'approved','in','order:payment')");
  await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM himoto.management_mobile_activity_events')).rows[0].n,8);
  await db.exec("SET ROLE himoto_scoped;SELECT set_config('qa.store','23',false);SELECT set_config('qa.all','false',false)");
  rows=(await db.query('SELECT kind,resource_id FROM himoto.management_mobile_activity_events ORDER BY id')).rows;
  assert.deepEqual(rows.map(x=>x.kind),['contract_created','renewal','return','payment','transfer','contract_created','payment']);
  const activity=load(path.join(root,'lib/server/mobile-activity'));
  const viewer={id:7,access_role:'custom',permissions:['contracts.read']};
  const scoped={query:(sql,values)=>db.query(sql,values)};
  const page=await activity.scopedActivity(scoped,viewer,null);
  assert(!page.rows.some(row=>row.kind==='payment'));
  assert(page.rows.some(row=>row.kind==='contract_created'));
  assert((await activity.scopedActivity(scoped,{...viewer,permissions:['contracts.read','finance.read']},null)).rows.some(row=>row.kind==='payment'));
  assert(!(await activity.scopedActivity(scoped,{...viewer,permissions:['finance.read']},null)).rows.some(row=>row.kind==='payment'));
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT has_table_privilege('himoto_scoped','himoto.management_mobile_activity_deliveries','SELECT') ok")).rows[0].ok,false);
  console.log(JSON.stringify({ok:true,checks:['migration reruns','five event kinds','no duplicate for unchanged payload','business rollback removes event','branch RLS','private delivery ledger'],productionWrites:0}));
 } finally {await db.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1});

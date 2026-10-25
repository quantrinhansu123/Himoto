const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {ownedFleetRevenue}=load(path.join(root,'lib/server/owned-fleet-revenue'));
const {vehicleRevenue}=load(path.join(root,'lib/server/rental-reports'));
const {validOwnedFleetReport,FLEET_TOTAL_FIELDS}=load(path.join(root,'lib/management/owned-fleet-revenue'));
const {canViewOwnedFleetRevenue}=load(path.join(root,'lib/management/permissions'));
const query=(patch={})=>new URLSearchParams({from:'2026-10-23',to:'2026-10-23',...patch});
async function main(){const checks=[];
 for(const id of [145,160])assert(canViewOwnedFleetRevenue({id,access_role:'admin'}));
 assert(!canViewOwnedFleetRevenue({id:160,access_role:'branch_staff'}));
 for(const id of [98,713,157,159,112,81,0,undefined,'145','160'])assert(!canViewOwnedFleetRevenue({id,access_role:'admin'}));
 assert(!canViewOwnedFleetRevenue(null));checks.push('Private entitlement is tied to the confirmed active account; other administrators/managers and the deleted former login never inherit it');
 const unused={query(){throw Error('Invalid query reached SQL');}};
 for(const patch of [{from:'2026-02-30'},{to:'2026-10-22'},{store_id:'0'},{view:'invalid'},{view:'vehicles'},{view:'vehicles',store_id:'1',page:'0'},{view:'vehicles',store_id:'1',size:'51'}])await assert.rejects(ownedFleetRevenue(unused,query(patch)),/không hợp lệ/);
 checks.push('Invalid dates, scope, detail without an owner branch and pagination are rejected before querying data');
 if(process.argv.includes('--live-temp')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database')),c=await ownerDatabase.connect();
  const tables=['vehicles','orders','order_vehicle_details','stores'];
  const db={query(sql,values){for(const table of tables)sql=sql.replaceAll('himoto.'+table,'pg_temp.qa_fleet_'+table);assert(!sql.includes('himoto.'));return c.query(sql,values);}};
  try{await c.query('BEGIN');
   for(const table of tables)await c.query(`CREATE TEMP TABLE qa_fleet_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
   await c.query("INSERT INTO qa_fleet_stores(id,store_name) VALUES(1,'QA Nguyen Hoang'),(2,'QA Borrower'),(3,'QA Unknown')");
   for(let i=1;i<=80;i++){
    const operating=i<=40?1:2;
    await c.query("INSERT INTO qa_fleet_vehicles(id,name,license,store_id,current_store_id,status) VALUES($1,$2,$3,1,$4,'ready')",[i,'QA '+i,'QA-'+String(i).padStart(3,'0'),operating]);
    if(i===1)continue; // This vehicle stays in the full 80 even without a hire.
    await c.query("INSERT INTO qa_fleet_orders(id,store_id,contract_number,order_status) VALUES($1,$2,$3,'completed')",[i,operating,'QA-'+i]);
    await c.query("INSERT INTO qa_fleet_order_vehicle_details(id,order_id,vehicle_id,rent_at,total_money) VALUES($1,$1,$1,'2026-10-23T00:00:00+07:00',$2)",[i,i<=40?100:200]);
   }
   // Incoming borrowed stock belongs to its original branch, even when branch 1 lets it.
   await c.query(`INSERT INTO qa_fleet_vehicles(id,name,license,store_id,current_store_id,status) VALUES(81,'Incoming','QA-IN',2,1,'ready'),(82,'Unknown','QA-UNKNOWN',3,3,'ready'),(83,'Deleted','QA-DEL',1,1,'ready');
    UPDATE qa_fleet_vehicles SET deleted_at=now() WHERE id=83;
    INSERT INTO qa_fleet_orders(id,store_id,contract_number,order_status) VALUES(81,1,'INCOMING','completed'),(82,NULL,'UNKNOWN','completed'),(83,1,'DELETED','completed');
    INSERT INTO qa_fleet_order_vehicle_details(id,order_id,vehicle_id,rent_at,total_money) VALUES(81,81,81,'2026-10-23T10:00:00+07:00',300),(82,82,82,'2026-10-23T10:00:00+07:00',50),(83,83,83,'2026-10-23T10:00:00+07:00',999999);`);
   let report=await ownedFleetRevenue(db,query({store_id:'1'})),nh=report.rows[0];
   assert.equal(nh.vehicles,80);assert.equal(nh.local_vehicles,40);assert.equal(nh.away_vehicles,40);assert.equal(nh.direct_revenue,3900);assert.equal(nh.loan_revenue,8000);assert.equal(nh.revenue,11900);
   assert(validOwnedFleetReport(report,query({store_id:'1'})));
   let all=await ownedFleetRevenue(db,query());assert.equal(all.total.vehicles,82);assert.equal(all.rows.find(r=>r.store_id===2).loan_revenue,300);assert.equal(all.total.unassigned_revenue,50);assert.equal(all.total.unassigned_rentals,1);assert.equal(all.total.revenue,12250);
   checks.push('TEMP: 80 owned vehicles remain 40 local + 40 away, including zero-revenue stock; loan revenue stays with its owner, incoming borrowed stock is excluded, deleted stock excluded and unknown operating branches remain explicit');
   const seen=new Set();for(let page=1;page<=8;page++){
    const params=query({view:'vehicles',store_id:'1',page:String(page)}),part=await ownedFleetRevenue(db,params);
    assert(validOwnedFleetReport(part,params));assert.equal(part.total.vehicles,80);assert.equal(part.total.revenue,11900);assert.equal(part.rows.length,10);
    for(const row of part.rows){assert(!seen.has(row.id));seen.add(row.id);}
   }assert.equal(seen.size,80);assert(seen.has(1));assert(!seen.has(81));
   const last=await ownedFleetRevenue(db,query({view:'vehicles',store_id:'1',page:'999',size:'50'}));assert.equal(last.page,2);assert.equal(last.rows.length,30);
   const emptyQuery=query({view:'vehicles',store_id:'999'}),empty=await ownedFleetRevenue(db,emptyQuery);assert(validOwnedFleetReport(empty,emptyQuery));assert.equal(empty.page,1);assert.equal(empty.total.vehicles,0);
   checks.push('TEMP: eight pages expose all 80 distinct vehicles and preserve whole-fleet totals, including the zero-revenue vehicle; last/empty pages clamp correctly');
   // A change in parking branch must not relabel historical hire revenue.
   await c.query('UPDATE qa_fleet_vehicles SET current_store_id=2 WHERE id=2; UPDATE qa_fleet_vehicles SET current_store_id=1 WHERE id=41');
   report=await ownedFleetRevenue(db,query({store_id:'1'}));assert.equal(report.total.direct_revenue,3900);assert.equal(report.total.loan_revenue,8000);
   checks.push('TEMP: loan/direct classification uses the saved hiring branch rather than the current vehicle location; later transfers leave past revenue intact');
   // A native shared-rate contract spans vehicles owned by different branches.
   await c.query(`INSERT INTO qa_fleet_orders(id,store_id,contract_number,order_status,total_rental_fees,draft_payload) VALUES(100,2,'NATIVE','completed',101,'{"management_composer":{"draft":{},"return_adjustments":[{"item_id":101,"late_fee":5,"repair_fee":50,"fee":55},{"item_id":102,"late_fee":0,"early_discount":10,"fee":-10}]}}');
    INSERT INTO qa_fleet_order_vehicle_details(id,order_id,vehicle_id,rent_at,total_money,total_renewal_amount) VALUES(101,100,1,'2026-10-23T09:00:00+07:00',151,20),(102,100,81,'2026-10-23T09:00:00+07:00',0,30);
    INSERT INTO qa_fleet_orders(id,store_id,contract_number,order_status,draft_payload) VALUES(200,1,'DRAFT','draft',NULL),(201,1,'BATTERY','completed','{"legacy_migration":{"sourceStoreId":30}}'),(202,1,'OLD','completed',NULL);
    INSERT INTO qa_fleet_order_vehicle_details(id,order_id,vehicle_id,rent_at,total_money) VALUES(201,200,1,'2026-10-23T12:00:00+07:00',999999),(202,201,1,'2026-10-23T12:00:00+07:00',999999),(203,202,1,'2026-10-22T23:59:59+07:00',999999),(204,202,1,'2026-10-24T00:00:00+07:00',999999);`);
   const native=await ownedFleetRevenue(db,query());assert.equal(native.rows.find(r=>r.store_id===1).loan_revenue,8076);assert.equal(native.rows.find(r=>r.store_id===2).direct_revenue,70);
   const old=await vehicleRevenue(db,new URLSearchParams({from:'2026-10-23',to:'2026-10-23',mode:'all'}));
   assert.equal(native.total.revenue,old.rows.filter(r=>r.id!==83).reduce((n,r)=>n+r.revenue,0));
   for(const key of FLEET_TOTAL_FIELDS)assert.equal(native.rows.reduce((n,r)=>n+r[key],0),native.total[key]);
   checks.push('TEMP: shared native rent splits odd dong once across owners; renewal/early-late adjustment reconcile with the existing per-vehicle report, excluding repairs, draft/battery anchors and out-of-day hires');
   assert(!validOwnedFleetReport({...native,rows:[]},query()));assert(!validOwnedFleetReport({...native,total:{...native.total,revenue:native.total.revenue+1}},query()));
   assert(!validOwnedFleetReport({...last,rows:[]},query({view:'vehicles',store_id:'1'})));
   checks.push('Client rejects missing vehicles, invalid totals and non-reconciling source amounts instead of showing false zeros');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
 }
 // Authenticate through the normal wrapper and prove denial before owner reads.
 const session=load(path.join(root,'lib/server/management-session')),database=load(path.join(root,'lib/server/himoto-database'));
 const oldRead=session.readSessionUser,oldUser=session.userFromSession,descriptor=Object.getOwnPropertyDescriptor(database.ownerDatabase,'connect');
 let actor=null,connections=0;const statements=[];
 session.readSessionUser=async()=>actor;session.userFromSession=async()=>actor;
 Object.defineProperty(database.ownerDatabase,'connect',{configurable:true,get:()=>async()=>{connections++;return {query:async sql=>{statements.push(sql);assert(!/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i.test(sql));return {rows:[]};},release(){}};}});
 try{
  const {NextRequest}=require('next/server'),route=load(path.join(root,'app/api/auth/staff-sales/owned-fleet-revenue/route'));
  assert.deepEqual(['POST','PUT','PATCH','DELETE'].filter(method=>method in route),[]);
  const req=()=>new NextRequest('http://localhost/api/auth/staff-sales/owned-fleet-revenue?from=2026-10-23&to=2026-10-23&user_id=145',{headers:{cookie:'himoto_management_session=qa'}});
  assert.equal((await route.GET(req())).status,401);
  for(const [id,role]of [[98,'admin'],[713,'admin'],[157,'ownership_manager'],[159,'accounting'],[156,'ownership_staff'],[81,'admin']]){actor={id,access_role:role,permissions:['contracts.read'],scope_all:true};assert.equal((await route.GET(req())).status,403);}
  assert.equal(connections,0);
  actor={id:145,access_role:'admin',scope_all:true};const response=await route.GET(req());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  actor={id:160,access_role:'admin',scope_all:true};assert.equal((await route.GET(req())).status,200);
  assert(statements.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert(statements.includes('COMMIT'));assert.equal(connections,2);
  checks.push('API rejects other admins/managers, unauthenticated requests and forged user_id before any global read; both primary administrators get a no-store, read-only transaction; no mutation handlers exist');
 }finally{session.readSessionUser=oldRead;session.userFromSession=oldUser;Object.defineProperty(database.ownerDatabase,'connect',descriptor);}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0},null,2));
}
main().catch(error=>{console.error(error.name,error.code||'',error.message);process.exitCode=1;});

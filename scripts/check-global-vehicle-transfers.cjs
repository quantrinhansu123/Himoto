const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs'),{ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {applyVehicleAction}=load(path.join(root,'lib/server/vehicle-actions'));
const {ACCESS_ROLES,hasPermission}=load(path.join(root,'lib/management/permissions'));
const schema='qa_global_vehicle_transfers',checks=[];
async function main(){const c=await ownerDatabase.connect();try{
  await c.query('BEGIN');await c.query(`SET LOCAL lock_timeout='5s'; CREATE SCHEMA ${schema}`);
  const tables=['users','roles','stores','staff_profiles','customers','orders','vehicles','banks','cash','transactions','order_vehicle_details','activity_logs','battery_contracts','store_duty_schedules','management_contract_payments','management_contract_vehicle_swaps','management_record_photos','gps_devices','gps_positions','vehicle_location_events','vehicle_transfers','management_contract_types'];
  for(const table of tables)await c.query(`CREATE TABLE ${schema}.${table} (LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING INDEXES)`);
  async function migration(file){let sql=fs.readFileSync(path.join('docs/sql',file),'utf8').replaceAll('himoto.',schema+'.').replaceAll('SCHEMA himoto','SCHEMA '+schema).replaceAll('pg_catalog,himoto','pg_catalog,'+schema).replaceAll("'himoto'","'"+schema+"'").replace(/^BEGIN;|^COMMIT;/gm,'');
    for(const key of ['scope_all','store_id','actor_id','operation','transfer_vehicle_id'])sql=sql.replaceAll(`${schema}.${key}'`,`himoto.${key}'`);await c.query(sql);}
  for(const file of ['2026-10-17-account-access.sql','2026-10-18-shared-vehicle-inventory.sql','2026-10-20-reservation-window-conflicts.sql','2026-10-20-returned-vehicle-availability.sql','2026-10-20-cross-branch-contract-vehicles.sql','2026-10-21-contract-vehicle-labels.sql','2026-10-23-ownership-hq-vehicles.sql','2026-10-19-vehicle-swap-photo.sql','2026-10-23-vehicle-documents.sql'])await migration(file);
  await migration('2026-10-24-global-vehicle-transfers.sql');await migration('2026-10-24-global-vehicle-transfers.sql');
  await migration('2026-10-25-multiple-record-images.sql');await migration('2026-10-25-multiple-record-images.sql');
  for(const table of tables){
    if(!(await c.query('SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=\'id\'',[schema,table])).rowCount)continue;
    await c.query(`CREATE SEQUENCE ${schema}.qa_${table}_seq START 1000000; ALTER TABLE ${schema}.${table} ALTER COLUMN id SET DEFAULT nextval('${schema}.qa_${table}_seq')`);
  }
  await c.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO himoto_scoped`);
  await c.query(`INSERT INTO ${schema}.stores(id,store_name,status) VALUES(80001,'Account branch QA','opening'),(80002,'Source branch QA','opening'),(80003,'Destination branch QA','opening')`);
  await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status,store_id) VALUES(70001,'Dispatcher QA','dispatch@example.invalid','unused',3,'active',80001),(70002,'Receiver QA','receive@example.invalid','unused',3,'active',80002)`);
  await c.query(`INSERT INTO ${schema}.vehicles(id,name,license,type,brand,year,color,odometer,status,store_id,current_store_id,created_by) VALUES(91001,'Transfer QA','QA-GLOBAL-1','xeso','Honda',2024,'Red',0,'ready',80002,80002,70001),(91002,'Unrelated QA','QA-GLOBAL-2','xeso','Honda',2024,'Red',0,'ready',80003,80003,70001),(91003,'Rented QA','QA-GLOBAL-3','xeso','Honda',2024,'Red',0,'ready',80003,80003,70001)`);
  await c.query(`INSERT INTO ${schema}.customers(id,name,status,store_id) VALUES(90001,'Foreign customer QA',1,80003)`);
  await c.query(`INSERT INTO ${schema}.orders(id,contract_number,order_status,store_id,total,pid) VALUES(92001,'QA-BLOCKER','bad_debt',80003,'100000',0)`);
  await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id) VALUES(92101,92001,91003)`);
  const scope={id:70001,access_role:'hr',permissions:[],store_id:80001,scope_all:false,operation:''};
  const q={query:(sql,params)=>c.query(sql.replaceAll('himoto.',schema+'.').replaceAll("'"+schema+'.',"'himoto."),params)};
  async function context(extra,fn){const s={...scope,...extra};await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.actor_id',$1,true),set_config('himoto.store_id',$2,true),set_config('himoto.operation',$3,true),set_config('himoto.transfer_vehicle_id',$4,true)",[String(s.id),String(s.store_id),s.operation,s.transfer_vehicle_id||'']);return dataAccess.run(s,fn);}
  await c.query('SET LOCAL ROLE himoto_scoped');
  await context({},async()=>{
    assert.equal((await q.query('SELECT id FROM himoto.vehicles')).rowCount,0);
    assert.equal((await q.query("UPDATE himoto.vehicles SET name='Forbidden' WHERE id=91001")).rowCount,0);
  });
  await context({operation:'fleet_read'},async()=>{
    assert.equal((await q.query('SELECT id FROM himoto.vehicles')).rowCount,3);
    assert.equal((await q.query('SELECT id FROM himoto.stores')).rowCount,3);
    assert.equal((await q.query('SELECT id FROM himoto.orders')).rowCount,0);assert.equal((await q.query('SELECT id FROM himoto.customers')).rowCount,0);
    assert.equal((await q.query("UPDATE himoto.vehicles SET name='Forbidden' WHERE id=91001")).rowCount,0);
  });checks.push('Fleet-only reads see every vehicle and store; foreign contracts, customers and profile writes remain restricted');
  const dispatched=await context({operation:'transfer',transfer_vehicle_id:'91001'},()=>applyVehicleAction(q,91001,{action:'transfer',to_store_id:80003,note:'Global dispatcher QA'},70001));
  assert(dispatched.event_id);
  await context({operation:'transfer',transfer_vehicle_id:'91001'},async()=>{
    const v=(await q.query('SELECT status,current_store_id,store_id FROM himoto.vehicles WHERE id=91001')).rows[0];
    assert.equal(v.status,'in_transit');assert.equal(Number(v.current_store_id),80003);assert.equal(Number(v.store_id),80002);
    assert.equal((await q.query("UPDATE himoto.vehicles SET name='Forbidden' WHERE id=91002")).rowCount,0);
    const e=(await q.query('SELECT * FROM himoto.vehicle_location_events WHERE id=$1',[dispatched.event_id])).rows[0];assert.equal(Number(e.created_by),70001);assert.equal(Number(e.from_store_id),80002);assert.equal(Number(e.to_store_id),80003);
  });checks.push('An account outside both route branches transfers a pinned vehicle, retaining its owner and recording actor/from/to; other vehicles stay protected');
  await context({operation:'receive',transfer_vehicle_id:'91001'},async()=>{
    await assert.rejects(()=>applyVehicleAction(q,91001,{action:'receive',transfer_event_id:dispatched.event_id,note:''},70001),e=>e.status===403);
  });
  await context({id:70002,store_id:80002,operation:'receive',transfer_vehicle_id:'91001'},async()=>{
    await assert.rejects(()=>applyVehicleAction(q,91001,{action:'receive',transfer_event_id:dispatched.event_id+1,note:''},70002),e=>e.status===409);
    await applyVehicleAction(q,91001,{action:'receive',transfer_event_id:dispatched.event_id,note:'Physical arrival QA'},70002);
    assert.equal((await q.query('SELECT status FROM himoto.vehicles WHERE id=91001')).rows[0].status,'ready');
    await assert.rejects(()=>applyVehicleAction(q,91001,{action:'receive',transfer_event_id:dispatched.event_id,note:''},70002),e=>e.status===409);
  });checks.push('Receipt works outside the destination account scope; different receiver, matching event and duplicate-receipt checks remain enforced');
  await context({operation:'transfer',transfer_vehicle_id:'91003'},async()=>{
    await assert.rejects(()=>applyVehicleAction(q,91003,{action:'transfer',to_store_id:80002,note:''},70001),e=>e.status===409&&/QA-BLOCKER/.test(e.message));
  });
  await context({operation:'transfer',transfer_vehicle_id:'91002'},async()=>{
    await assert.rejects(()=>applyVehicleAction(q,91002,{action:'transfer',to_store_id:80002,note:'',revision:'99999999'},70001),e=>e.status===409);
    await assert.rejects(()=>applyVehicleAction(q,91002,{action:'transfer',to_store_id:80003,note:''},70001),e=>e.status===400);
  });checks.push('Live rental/debt blockers, stale revisions and same-store dispatch still reject');
  const {deleteRecordPhoto,requireContractPhotoSlot,writeRecordPhoto}=load(path.join(root,'lib/server/record-photos'));
  await context({operation:'transfer',transfer_vehicle_id:'91001'},async()=>{
    // Exercise actual photo insert/delete through RLS with a generated fixture.
    for(const suffix of ['', '-extra-2','-extra-3']){
      const slot='transfer-'+dispatched.event_id+'-1'+suffix;
      await requireContractPhotoSlot(q,'vehicles',91001,slot);
      await writeRecordPhoto(q,'vehicles',91001,slot,'image/jpeg',Buffer.from([255,216,255,217]),70001);
    }
    assert.equal((await q.query("SELECT entity_id FROM himoto.management_record_photos WHERE entity_type='vehicles' AND entity_id=91001")).rowCount,3);
    await assert.rejects(()=>requireContractPhotoSlot(q,'vehicles',91002,'transfer-'+dispatched.event_id+'-1-extra-2'),e=>e.status===404);
    for(const suffix of ['','-extra-2','-extra-3'])await deleteRecordPhoto(q,'vehicles',91001,'transfer-'+dispatched.event_id+'-1'+suffix);
    assert.equal((await q.query("SELECT entity_id FROM himoto.management_record_photos WHERE entity_type='vehicles' AND entity_id=91001")).rowCount,0);
  });checks.push('Multiple transfer images can be saved/read/deleted after the vehicle moves; event association and unrelated-vehicle guards remain enforced under real RLS');
  for(const role of Object.keys(ACCESS_ROLES))for(const permission of ['vehicles.read','vehicles.transfer','vehicles.receive'])assert(hasPermission({access_role:role,permissions:[]},permission));
  assert(!hasPermission(null,'vehicles.transfer'));assert(!hasPermission({access_role:'hr',permissions:[]},'vehicles.write'));assert(!hasPermission({access_role:'hr',permissions:[]},'finance.write'));
  checks.push('All seven account roles have fleet read/transfer/receipt; anonymous users and unrelated edit/finance permissions remain denied');
  await c.query('RESET ROLE');await c.query('ROLLBACK');
}finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0,realTelegramRequests:0},null,2));}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

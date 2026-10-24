const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database')),{dataAccess}=load(path.join(root,'lib/server/access-context'));
const returns=load(path.join(root,'lib/server/contract-returns'));
const {extendContractVehicleLine}=load(path.join(root,'lib/server/contract-renewal-line'));
const {contractBackfillErrors}=load(path.join(root,'lib/management/contract-backfill'));
const {requestPermission}=load(path.join(root,'lib/server/access-request'));
const checks=[],schema='qa_operating_history';
async function main(){
 assert.equal(requestPermission('/api/auth/returns/recover','POST'),'contracts.return');
 assert.deepEqual(contractBackfillErrors(undefined,''),{});
 assert(contractBackfillErrors({note:'test',returned_at:'2999-01-01T10:00'},'2026-10-01T10:00').backfill_returned_at);
 assert(contractBackfillErrors({note:'valid reason',returned_at:'2026-09-30T10:00'},'2026-10-01T10:00').backfill_returned_at);
 assert.deepEqual(contractBackfillErrors({note:'forgot original entry',returned_at:'2026-10-03T10:00'},'2026-10-01T10:00'),{});
 checks.push('Backfill validates real past dates/reason; recovery requires the existing return permission');
 const c=await ownerDatabase.connect();
 const db={query:(sql,values)=>c.query(sql.replaceAll('himoto.',schema+'.'),values)};
 const scope={id:143,access_role:'branch_staff',store_id:1,scope_all:false,operation:'',permissions:['contracts.read','contracts.return','contracts.finalize','contracts.renew']};
 const run=work=>dataAccess.run(scope,work);
 const asStaff=async work=>{await c.query('SAVEPOINT qa_staff');await c.query("SELECT set_config('himoto.actor_id','143',true),set_config('himoto.store_id','1',true),set_config('himoto.scope_all','false',true)");await c.query('SET LOCAL ROLE himoto_scoped');try{const result=await run(work);await c.query('RESET ROLE');await c.query('RELEASE SAVEPOINT qa_staff');return result;}catch(error){await c.query('ROLLBACK TO SAVEPOINT qa_staff');await c.query('RELEASE SAVEPOINT qa_staff');throw error;}};
 const isolated=async work=>{await c.query('SAVEPOINT qa_case');try{return await work();}finally{await c.query('ROLLBACK TO SAVEPOINT qa_case');await c.query('RELEASE SAVEPOINT qa_case');}};
 const rev=async id=>(await c.query(`SELECT xmin::text AS revision FROM ${schema}.order_vehicle_details WHERE id=$1`,[id])).rows[0].revision;
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");
  await c.query(`CREATE SCHEMA ${schema};GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped`);
  for(const table of ['stores','vehicles','orders','order_vehicle_details','vehicle_location_events'])await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS)`);
  await c.query(`CREATE FUNCTION ${schema}.access_actor() RETURNS bigint LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('himoto.actor_id',true),'')::bigint$$;
    CREATE FUNCTION ${schema}.access_store(target bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('himoto.scope_all',true),'false')='true' OR target=nullif(current_setting('himoto.store_id',true),'')::bigint$$`);
  for(const file of ['docs/sql/2026-10-24-bad-debt-recovery.sql','docs/sql/2026-10-24-contract-history-backfill.sql']){
    const sql=fs.readFileSync(file,'utf8').replaceAll('himoto.',schema+'.').replaceAll('pg_catalog,himoto','pg_catalog,'+schema).replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(sql);await c.query(sql);
  }
  await c.query(`GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA ${schema} TO himoto_scoped;
    ALTER TABLE ${schema}.orders ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_orders ON ${schema}.orders TO himoto_scoped USING(${schema}.access_store(store_id)) WITH CHECK(${schema}.access_store(store_id));
    ALTER TABLE ${schema}.order_vehicle_details ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_details ON ${schema}.order_vehicle_details TO himoto_scoped USING(EXISTS(SELECT 1 FROM ${schema}.orders o WHERE o.id=order_id)) WITH CHECK(EXISTS(SELECT 1 FROM ${schema}.orders o WHERE o.id=order_id));
    ALTER TABLE ${schema}.vehicles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_vehicles ON ${schema}.vehicles TO himoto_scoped USING(${schema}.access_store(COALESCE(current_store_id,store_id))) WITH CHECK(${schema}.access_store(COALESCE(current_store_id,store_id)));`);
  await c.query(`INSERT INTO ${schema}.stores(id,store_name) VALUES(1,'QA own'),(2,'QA other');
    INSERT INTO ${schema}.vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES
    (10,'QA recovered','Honda','xeso',2026,2,2,'QA-RECOVER','bad_debt',143),(11,'QA history','Honda','xeso',2026,2,2,'QA-HISTORY','using',143),(12,'QA repair','Honda','xeso',2026,1,1,'QA-REPAIR','repairing',143);
    INSERT INTO ${schema}.orders(id,store_id,order_status,order_mode,contract_number,total,pid,draft_payload) VALUES
    (100,1,'bad_debt','standard','QA-DEBT','1000000',200000,'{}'),(101,2,'renting','standard','QA-OTHER','1000000',0,'{}'),
    (102,1,'draft','draft',NULL,'0',0,'{}'),(103,2,'completed','standard','QA-PAST-OTHER','1000000',1000000,'{}'),(104,1,'completed','standard','QA-PAST-OWN','1000000',1000000,'{}');
    INSERT INTO ${schema}.order_vehicle_details(id,vehicle_id,order_id,rent_at,return_at,completed_at) VALUES
    (1000,10,100,'2026-10-01T08:00+07','2026-10-03T08:00+07',NULL),
    (1101,11,103,'2026-10-01T08:00+07','2026-10-03T08:00+07','2026-10-03T08:00+07'),
    (1102,12,104,'2026-10-01T08:00+07','2026-10-03T08:00+07','2026-10-07T08:00+07');`);
  const input={item_id:1000,item_revision:await rev(1000),request_id:randomUUID(),recovered_at:'2026-10-04T10:00',note:'Vehicle physically recovered at branch'};
  await isolated(async()=>{
    const before=(await c.query(`SELECT total,pid,order_status FROM ${schema}.orders WHERE id=100`)).rows[0];
    await asStaff(async()=>{
      assert.equal((await db.query('SELECT id FROM himoto.vehicles WHERE id=10')).rowCount,0);
      const result=await returns.recordBadDebtRecovery(db,143,input);assert.equal(result.replayed,false);
      const replay=await returns.recordBadDebtRecovery(db,143,input);assert.equal(replay.replayed,true);
      await assert.rejects(()=>returns.recordBadDebtRecovery(db,143,{...input,note:'Different recovery reason'}),e=>e.status===409);
      await assert.rejects(()=>returns.recordBadDebtRecovery(db,143,{...input,request_id:randomUUID()}),e=>e.status===409);
    });
    assert.deepEqual((await c.query(`SELECT total,pid,order_status FROM ${schema}.orders WHERE id=100`)).rows[0],before);
    assert.equal((await c.query(`SELECT status FROM ${schema}.vehicles WHERE id=10`)).rows[0].status,'ready');
    assert.equal((await c.query(`SELECT draft_payload FROM ${schema}.orders WHERE id=100`)).rows[0].draft_payload.management_composer.vehicle_recoveries.length,1);
  });
  checks.push('Real branch RLS: explicit recovery releases a foreign-stock vehicle through guarded RPC, preserves bad debt/total/paid, writes one audit and replays safely');
  await isolated(async()=>{
    await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,vehicle_id,order_id,rent_at,return_at) VALUES(1001,10,101,'2026-10-01T08:00+07','2026-10-10T08:00+07')`);
    await asStaff(()=>returns.recordBadDebtRecovery(db,143,{...input,request_id:randomUUID()}));
    assert.equal((await c.query(`SELECT status FROM ${schema}.vehicles WHERE id=10`)).rows[0].status,'bad_debt');
  });
  checks.push('A different branch active rental still blocks stock after recovering the chosen old bad-debt line');
  await isolated(async()=>{
    await c.query(`UPDATE ${schema}.vehicles SET status='repairing' WHERE id=10`);
    await asStaff(()=>returns.recordBadDebtRecovery(db,143,{...input,request_id:randomUUID()}));
    assert.equal((await c.query(`SELECT status FROM ${schema}.vehicles WHERE id=10`)).rows[0].status,'repairing');
  });
  checks.push('Physical recovery does not overwrite maintenance/broken/sold states');
  await isolated(async()=>{
    await asStaff(async()=>{
      await assert.rejects(()=>returns.recordBadDebtRecovery(db,143,{...input,item_id:1101,request_id:randomUUID()}),e=>e.status===404);
      await assert.rejects(()=>returns.recordBadDebtRecovery(db,143,{...input,item_revision:'0',request_id:randomUUID()}),e=>e.status===409);
      await assert.rejects(()=>returns.recordBadDebtRecovery(db,143,{...input,recovered_at:'2026-09-30T10:00',request_id:randomUUID()}),e=>e.status===400);
    });
    assert.equal((await c.query(`SELECT completed_at FROM ${schema}.order_vehicle_details WHERE id=1000`)).rows[0].completed_at,null);
  });
  checks.push('Foreign contract, stale revision and recovery before rental start change no rows');
  await asStaff(async()=>{
    const conflict=await db.query('SELECT vehicle_id FROM himoto.vehicle_history_conflict_ids($1,$2,$3,$4)',[[11],102,'2026-10-02T08:00+07','2026-10-04T08:00+07']);assert.equal(Number(conflict.rows[0].vehicle_id),11);
    assert.equal((await db.query('SELECT vehicle_id FROM himoto.vehicle_history_conflict_ids($1,$2,$3,$4)',[[11],102,'2026-10-05T08:00+07','2026-10-06T08:00+07'])).rowCount,0);
  });
  checks.push('Historical overlap RPC detects foreign-branch completed rentals without exposing contract/customer details; disjoint history stays allowed');
  await isolated(async()=>{
    const revision=await rev(1102);
    const before=(await c.query(`SELECT completed_at FROM ${schema}.order_vehicle_details WHERE id=1102`)).rows[0].completed_at;
    await asStaff(()=>extendContractVehicleLine(db,104,1102,revision,'2026-10-06T08:00+07',200000,'2026-10-03T08:00+07'));
    const after=(await c.query(`SELECT completed_at,total_renewal_amount FROM ${schema}.order_vehicle_details WHERE id=1102`)).rows[0];
    assert.deepEqual(after.completed_at,before);assert.equal(Number(after.total_renewal_amount),200000);assert.equal((await c.query(`SELECT status FROM ${schema}.vehicles WHERE id=12`)).rows[0].status,'repairing');
  });
  checks.push('Historical renewal extends the recorded due date/fee while preserving actual return time and present stock state');
  await isolated(async()=>{await assert.rejects(()=>asStaff(()=>extendContractVehicleLine(db,103,1101,'0','2026-10-06T08:00+07',200000,'2026-10-03T08:00+07')),e=>e.code==='42501');});
  checks.push('Historical renewal RPC rejects another branch contract; both migrations are idempotent in a rollback-only schema');
 }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
 console.log(JSON.stringify({passed:checks.length,checks,permanentBusinessWrites:0,productionSchemaChanges:0},null,2));
}
main().catch(error=>{console.error(error.name,error.message);process.exitCode=1;});

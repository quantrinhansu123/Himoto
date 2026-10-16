const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {readTransferHistory,parseTransferHistory,TransferHistoryError}=load(path.join(root,'lib/server/vehicle-transfer-history'));
const {managementKindsForPath}=load(path.join(root,'lib/management/data-loader'));
const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool;
const checks=[];
async function main(){
  const c=await pool.connect();
  const proxy={query(sql,values){
    for(const table of ['vehicle_location_events','vehicle_transfers','vehicles','stores','users'])sql=sql.replaceAll(`himoto.${table}`,`pg_temp.qa_history_${table}`);
    assert(!sql.includes('himoto.'),'History reads must target TEMP fixtures');return c.query(sql,values);
  }};
  const query=values=>readTransferHistory(proxy,new URLSearchParams({from:'2026-10-16',to:'2026-10-16',...values}));
  try{
    await c.query('BEGIN');
    await c.query(`CREATE TEMP TABLE qa_history_vehicle_location_events(id bigint,vehicle_id bigint,event_type text,ref_type text,ref_id bigint,from_store_id bigint,to_store_id bigint,created_by bigint,created_at timestamp,notes text,audit_snapshot jsonb) ON COMMIT DROP;
      CREATE TEMP TABLE qa_history_vehicles(id bigint,name text,license text) ON COMMIT DROP;
      CREATE TEMP TABLE qa_history_stores(id bigint,store_name text) ON COMMIT DROP;
      CREATE TEMP TABLE qa_history_users(id bigint,name text) ON COMMIT DROP;
      CREATE TEMP TABLE qa_history_vehicle_transfers(id bigint,transfer_code text,reason text) ON COMMIT DROP`);
    await c.query("INSERT INTO qa_history_vehicles VALUES(701,'Tên xe đã sửa QA','QA-NEW'),(702,'Xe khác QA','QA-702')");
    await c.query("INSERT INTO qa_history_stores VALUES(31,'Cơ sở đi đã đổi tên QA'),(32,'Cơ sở nhận QA'),(33,'Cơ sở khác QA')");
    await c.query("INSERT INTO qa_history_users VALUES(143,'Người dùng đã đổi tên QA')");
    const snapshot={version:1,vehicle_name:'Tên xe lúc chuyển QA',license:'QA-701',actor_name:'Người chuyển QA',from_store_name:'Cơ sở đi QA',to_store_name:'Cơ sở nhận QA',changes:[{field:'status',label:'Trạng thái',from:'Lưu kho',to:'Chờ luân chuyển',from_value:'ready',to_value:'in_transit'}]};
    const event=async(id,type,at,vehicle=701,from=31,to=32,audit=snapshot,refType=null,refId=null)=>c.query(`INSERT INTO qa_history_vehicle_location_events VALUES($1,$2,$3,$4,$5,$6,$7,143,$8,'Ghi chú QA',$9::jsonb)`,[id,vehicle,type,refType,refId,from,to,at,audit&&JSON.stringify(audit)]);
    await event(1,'manual_transfer','2026-10-15 23:59:59');
    await event(2,'manual_transfer','2026-10-16 00:00:00');
    const received={...snapshot,actor_name:'Người nhận QA',changes:[{field:'status',label:'Trạng thái',from:'Chờ luân chuyển',to:'Lưu kho',from_value:'in_transit',to_value:'ready'}]};
    await event(3,'manual_transfer_receive','2026-10-16 10:00:00',701,31,32,received,'vehicle_location_events',2);
    await event(4,'transfer_dispatch','2026-10-16 20:30:00',702,32,33,null,'vehicle_transfers',5);
    await event(5,'transfer_receive','2026-10-16 21:00:00',702,32,33,null,'vehicle_transfers',5);
    await c.query("INSERT INTO qa_history_vehicle_transfers VALUES(5,'QA-TRANSFER-5','Điều chuyển cũ QA')");
    await event(6,'uat_rebalance','2026-10-16 23:00:00');
    await event(7,'status_change','2026-10-16 22:00:00',701,31,32,null,'using');
    await event(9,'manual_transfer','2026-10-16 10:30:00');
    await event(10,'status_change','2026-10-16 11:00:00',701,32,32,{...received,from_store_name:'Cơ sở nhận QA'},'ready');
    await event(11,'manual_transfer','2026-10-17 00:00:00');
    for(let id=100;id<126;id++)await event(id,'manual_transfer','2026-10-16 12:00:00',702,32,33,null);
    const all=await query({}),second=await query({page:'2'});
    assert.equal(all.total,32);assert.equal(all.rows.length,25);assert.equal(second.total,32);assert.equal(second.rows.length,7);
    const combined=[...all.rows,...second.rows];assert.equal(new Set(combined.map(v=>v.id)).size,32);
    assert(!combined.some(v=>[1,6,7,11].includes(v.id)));assert.equal(all.rows[0].id,5);
    assert(combined.find(v=>v.id===2).at.startsWith('2026-10-15T17:00:00'));
    checks.push('Vietnam day boundaries include midnight and exclude adjacent days; stable server pagination retains every event once and ignores unrelated edits/rentals');
    const route=await query({from_store:'31',to_store:'32'});
    assert.equal(route.total,4);assert.equal((await query({action:'receive'})).total,3);assert.equal((await query({action:'transfer'})).total,29);
    assert.equal((await query({store:'31'})).total,4);assert.equal((await query({store:'33'})).total,28);
    assert.equal((await query({from_store:'33'})).total,0);
    checks.push('Origin, destination, either-branch scope and transfer/receipt filters combine without per-vehicle requests');
    const frozen=route.rows.find(v=>v.id===2);
    assert.equal(frozen.license,'QA-701');assert.equal(frozen.vehicle_name,'Tên xe lúc chuyển QA');assert.equal(frozen.actor,'Người chuyển QA');assert.equal(frozen.from_store,'Cơ sở đi QA');assert.equal(frozen.changes[0].to,'Chờ luân chuyển');
    const oldReceipt=route.rows.find(v=>v.id===10);assert.equal(oldReceipt.from_store,'Cơ sở đi QA');assert.equal(oldReceipt.action,'receive');
    assert(all.rows[0].note.includes('QA-TRANSFER-5'));assert.deepEqual(all.rows[0].changes,[]);
    checks.push('Frozen actor/vehicle/branch names and old/new fields remain intact; legacy transfer and status-based receipt logs remain visible without invented changes');
    assert.equal((await query({search:'QA-701'})).total,4);assert.equal((await query({search:'Người nhận QA'})).total,2);
    assert.equal((await query({search:"' OR 1=1 --"})).total,0);assert.equal((await query({search:'%'})).total,0);
    assert.equal((await query({page:'99'})).total,32);assert.deepEqual((await query({page:'99'})).rows,[]);
    checks.push('Search matches frozen history literally, safely binds SQL-like text and keeps totals for empty pages');
    for(const values of [{from:'2026-02-30'},{from:'2026-10-17',to:'2026-10-16'},{to:''},{page:'0'},{page:'1000001'},{from_store:'-1'},{to_store:'1;SELECT'},{store:'0'},{action:'delete'},{search:'a'.repeat(201)}]){
      assert.throws(()=>parseTransferHistory(new URLSearchParams(values)),TransferHistoryError);
    }
    assert.deepEqual(managementKindsForPath('/vehicles/transfers'),['stores']);
    checks.push('Invalid dates/filters/pages are rejected before SQL; history page loads branch options without downloading the vehicle fleet');
    await c.query('ROLLBACK');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

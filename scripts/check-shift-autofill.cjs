const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {parseShiftAutofill,readShiftAutofill}=load(path.join(root,'lib/server/shift-autofill'));
const {vietnamDate}=load(path.join(root,'lib/management/duty-roster'));
const {emptyShiftSummary,shiftVehicleTotal}=load(path.join(root,'lib/management/shift-reports'));
const input=(section,date=vietnamDate())=>({store_id:1,date,section});
async function main(){
  assert.equal(parseShiftAutofill(new URLSearchParams({store_id:'1',date:'2026-10-21',section:'summary'})).store_id,1);
  for(const patch of [{store_id:'0'},{store_id:'1 OR 1=1'},{date:'2026-02-30'},{date:'2999-01-01'},{section:'invalid'}])assert.throws(()=>parseShiftAutofill(new URLSearchParams({store_id:'1',date:'2026-10-21',section:'summary',...patch})));
  const sqls=[];
  let rows=[];
  const db={query:async(sql,params)=>{
    assert(!/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(sql));assert.equal(params[0],1);sqls.push(sql);
    if(sql==='SELECT id FROM himoto.stores WHERE id=$1::bigint')return {rows:[{id:1}],rowCount:1};
    if(sql.includes('FROM himoto.battery_contracts'))return {rows:[{rented_batteries:3}]};
    if(sql.includes('management_shift_reports') && !rows[0]?.payload)return {rows:[]};
    return {rows};
  }};
  rows=[{staff_name:'A'},{staff_name:'B'}];
  const info=await readShiftAutofill(db,input('information'));assert.equal(info.values.staff,'A, B');assert.match(sqls.at(-1),/starts_at</);
  rows=[];assert.equal((await readShiftAutofill(db,input('information'))).values.staff,undefined);
  rows=[{kind:'cash',balance:'1865000'},{kind:'personal',balance:'-10'}];
  const accounts=await readShiftAutofill(db,input('accounts'));assert.equal(accounts.values.cash,1865000);assert.equal(accounts.values.personal,undefined);assert.equal(accounts.values.company,undefined);assert(accounts.notices.length>=3);
  rows=[{payload:{electrical_devices:'Đèn, quạt',electricity_off:true,notes:'Không'}}];
  const safety=await readShiftAutofill(db,input('safety'));assert.equal(safety.values.electrical_devices,'Đèn, quạt');assert.equal(safety.values.electricity_off,undefined);assert.equal(safety.values.notes,undefined);
  rows=[{vehicles:20,daily_vehicles:16,monthly_vehicles:7}];const inventory=await readShiftAutofill(db,input('inventory'));assert.equal(inventory.values.daily_vehicles,16);assert.equal(shiftVehicleTotal(inventory.values),43);assert.equal(inventory.values.batteries,undefined);assert.equal(inventory.values.charged,undefined);
  const coreSql=sqls.at(-1);assert(coreSql.includes("status='ready'"));assert(coreSql.includes('o.store_id=$1::bigint'));assert(coreSql.includes("rental_type='daily'"));assert(!coreSql.includes('management_shift_reports'));assert(!coreSql.includes('vehicle_location_events'));
  assert.equal((await readShiftAutofill(db,input('inventory','2026-01-01'))).values.vehicles,20);
  const historical={query:async(sql,params)=>{
    assert.equal(params[0],1);assert(!sql.includes('FROM himoto.vehicles'));
    if(sql==='SELECT id FROM himoto.stores WHERE id=$1::bigint')return {rows:[{id:1}],rowCount:1};
    if(sql.includes('FROM himoto.battery_contracts'))return {rows:[{rented_batteries:3}]};
    if(sql.includes('vehicle_location_events'))return {rows:[{total:1}]};
    return {rows:[{payload:{vehicles:20,daily_vehicles:16,monthly_vehicles:7,batteries:4,charged:2}}]};
  }};
  const past=await readShiftAutofill(historical,input('batteries','2026-01-01'));assert.equal(past.values.vehicles,undefined);assert.equal(past.values.charged,2);
  assert.equal(past.values.rented_batteries,3);
  rows=[{total:1}];assert.equal((await readShiftAutofill(db,input('transfers'))).values.transfers,1);
  rows=[{...emptyShiftSummary(),income_total:'770000',income_renewal:'570000',income_rental:'200000'}];
  assert.equal((await readShiftAutofill(db,input('summary'))).values.summary.income_total,770000);
  assert(sqls.some(sql=>sql.includes("status='approved'")));assert(sqls.some(sql=>sql.includes("created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'")));
  console.log('PASS: current vehicles from contracts/ready stock for the selected PGD, total 16+7+20=43; pin and transfers load independently; approved receipts and safety checks.');
  {
    const {NextRequest}=require('next/server');
    const session=load(path.join(root,'lib/server/management-session'));
    const database=load(path.join(root,'lib/server/himoto-database'));
    const original=session.readSessionUser,descriptors=Object.getOwnPropertyDescriptors(database.himotoPool);
    let actor={id:7,access_role:'branch_staff',store_id:1,scope_all:false,permissions:['contracts.read','contracts.draft']};
    const statements=[];
    let transientFailure=false,connections=0;
    try{
      session.readSessionUser=async()=>actor;
      Object.defineProperty(database.himotoPool,'connect',{configurable:true,value:async()=>{connections++;return {release(){},query:async(sql)=>{
        statements.push(sql);
        if(sql==='SELECT id FROM himoto.stores WHERE id=$1::bigint'&&transientFailure){transientFailure=false;throw Object.assign(new Error('QA transient timeout'),{code:'57014'});}
        if(sql==='SELECT id FROM himoto.stores WHERE id=$1::bigint')return {rows:[{id:1}],rowCount:1};
        if(sql.includes('store_duty_schedules'))return {rows:[{staff_name:'QA'}]};
        return {rows:[]};
      }};}});
      const {GET}=load(path.join(root,'app/api/auth/shift-reports/autofill/route'));
      const request=(store='1',section='information')=>GET(new NextRequest(`http://localhost/api/auth/shift-reports/autofill?store_id=${store}&date=2026-10-21&section=${section}`));
      const filled=await request();assert.equal(filled.status,200);assert.equal((await filled.json()).data.values.staff,'QA');
      assert(statements.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert(statements.includes('COMMIT'));
      transientFailure=true;
      const beforeRetry=connections;
      assert.equal((await request()).status,200);assert.equal(connections-beforeRetry,2);assert(statements.includes('ROLLBACK'));
      const count=statements.length;assert.equal((await request('2')).status,403);assert.equal(statements.length,count);
      actor={...actor,permissions:[]};assert.equal((await request()).status,403);
      actor=null;assert.equal((await request()).status,401);
      session.readSessionUser=async()=>{throw Error('QA DB unavailable');};
      assert.equal((await request()).status,503);
      actor={id:7,access_role:'branch_staff',store_id:1,scope_all:false,permissions:['contracts.read','contracts.draft']};
      let authReads=0;
      session.readSessionUser=async()=>{if(++authReads===1)throw Error('QA transient auth failure');return actor;};
      assert.equal((await request()).status,200);assert.equal(authReads,2);
      console.log('PASS API: snapshot read-only, branch restrictions, permission and session checks.');
    }finally{session.readSessionUser=original;Object.defineProperties(database.himotoPool,descriptors);}
  }
  if(process.argv.includes('--live-read')){
    require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
    const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
    const c=await ownerDatabase.connect();
    try{
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='15s'");
      const store=(await c.query('SELECT id FROM himoto.stores ORDER BY id LIMIT 1')).rows[0];assert(store);
      for(const section of process.argv.includes('--inventory-only')?['inventory']:['information','inventory','batteries','transfers','summary','accounts','safety']){
        const result=await readShiftAutofill(c,{...input(section),store_id:Number(store.id)});
        assert.equal(result.section,section);console.log('PASS live DB: '+section);
      }
    }finally{await c.query('ROLLBACK');c.release();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});

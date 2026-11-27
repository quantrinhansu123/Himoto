const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./check-contract-payments.cjs');
const shared = load(path.resolve('src/lib/management/shift-registration'));
const server = load(path.resolve('src/lib/server/shift-registration'));
const self = load(path.resolve('src/lib/server/self-shift-registration'));
async function main() {
  assert.equal(shared.monthDates('2028-02').length, 29);
  assert.equal(shared.monthDates('2026-02').length, 28);
  assert.equal(shared.monthDates('2026-11').length, 30);
  assert.equal(shared.monthDates('2026-12').length, 31);
  assert.deepEqual(shared.registrationMonthRange('2026-11'),{from:'2026-11-01',to:'2026-11-30'});
  assert.equal(shared.registrationDates('2026-11-01','2026-11-30').length,30);
  assert.deepEqual(shared.registrationDates('2026-12-31','2027-01-02'),['2026-12-31','2027-01-01','2027-01-02']);
  assert.equal(shared.registrationDates('2028-02-28','2028-03-01').length,3);
  for(const range of [['2026-02-30','2026-03-01'],['2026-11-30','2026-11-01'],['2026-01-01','2026-12-31'],['','2026-11-30']])assert.throws(()=>shared.registrationDates(...range));
  for (const month of ['2026-13', '2026-00', '1999-12', '2101-01', '2026-2', '']) assert.throws(() => shared.monthDates(month));
  for (const [code, credit] of [['S',1],['G1',0.5],['G2',0.5],['G3',0.5],['C',1],['F',1.5],['O',0],['G1+G3',1],[null,0]]) assert.equal(shared.registrationCredit(code),credit);
  const base = { staff_id: 1, store_id: 23, work_date: '2026-11-01', shift_code: 'S', revision: null };
  assert.deepEqual(server.parseRegistration(base), base);
  for (const patch of [{staff_id:0},{staff_id:'1'},{store_id:-1},{work_date:'2026-02-30'},{work_date:'2101-01-01'},{shift_code:'X'},{shift_code:''},{revision:'0'},{revision:1},{revision:undefined},{actor_id:1}]) assert.throws(() => server.parseRegistration({...base,...patch}));
  assert.equal(server.parseRegistration({...base,shift_code:null,revision:'2'}).shift_code,null);
  const access = load(path.resolve('src/lib/server/access-request'));
  assert.equal(access.requestPermission('/api/auth/duty-roster/registrations','GET'),null);
  assert.equal(access.requestPermission('/api/auth/duty-roster/registrations','PUT'),null);
  assert.equal(access.requestPermission('/api/auth/duty-roster/registrations','PATCH'),null);
  const { canLockShiftRegistration, canManageShiftRegistration } = load(path.resolve('src/lib/management/permissions'));
  assert.equal(canManageShiftRegistration({access_role:'hr', permissions:['hr.write']}), true);
  const delegated = {access_role:'branch_manager',permissions:['shift_registration.manage']};
  assert.equal(canManageShiftRegistration(delegated), true);
  assert.equal(canLockShiftRegistration(delegated), false);
  assert.equal(canLockShiftRegistration({...delegated,scope_all:true}),true);
  assert.equal(canManageShiftRegistration({access_role:'admin'}),true);
  const hcns = {access_role:'custom', has_hr_position:true, permissions:[]};
  assert.equal(canManageShiftRegistration(hcns),true);
  assert.equal(canLockShiftRegistration({...hcns,scope_all:true}),false);
  for (const account of [{access_role:'hr', permissions:['hr.read']}, {access_role:'custom', permissions:['hr.write']}]) {
    assert.equal(canManageShiftRegistration(account), false);
  }
  assert.equal(access.requestPermission('/api/auth/attendance/shift-registration','GET'),null);
  assert.equal(access.requestPermission('/api/auth/attendance/shift-registration','PUT'),null);
  assert.deepEqual(self.selfRegistrationDates('2026-11-02','2026-11-03'),['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
  for (const week of ['2026-10-26','2026-11-03','2026-02-30']) assert.throws(()=>self.selfRegistrationDates(week,'2026-11-03'));
  console.log('PASS: month boundaries, shift credits, strict input validation, HR read/write permissions');
  if (!process.argv.includes('--live-temp')) return;
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const c = await load(path.resolve('src/lib/server/himoto-database')).himotoPool.connect();
  if (process.argv.includes('--verify-installed')) {
    try {
      await c.query('BEGIN READ ONLY');
      await c.query("SELECT set_config('himoto.scope_all','true',true),set_config('himoto.operation','duty_roster',true)");
      await c.query('SET LOCAL ROLE himoto_scoped');
      const installed = await server.readRegistrationMonth(c, '2026-11');
      assert.deepEqual((await server.readRegistrationMonth(c, '2026-11', -1)).staff, []);
      console.log(JSON.stringify({ installedSchema: 'PASS', scopedMonthlyRead: 'PASS', staffCount: installed.staff.length, storeCount: installed.stores.length, registrationCount: installed.registrations.length }));
      await c.query("SELECT set_config('himoto.operation','',true)");
      assert.equal((await c.query('SELECT count(*)::int n FROM himoto.staff_shift_registrations')).rows[0].n,0);
    } finally { await c.query('ROLLBACK'); }
  }
  const tables = ['staff_shift_registration_week_locks','staff_shift_registration_history','staff_shift_registrations','staff_profiles','stores'];
  let failHistory = false;
  const db = {query: async (sql,args) => {
    if (failHistory && sql.startsWith('INSERT INTO himoto.staff_shift_registration_history')) throw new Error('simulated audit failure');
    for (const table of tables) sql = sql.replaceAll('himoto.'+table, 'pg_temp.qa_registration_'+table);
    assert(!sql.includes('himoto.')); return c.query(sql,args);
  }};
  const atomic = async fn => {
    await c.query('SAVEPOINT registration_case');
    try { const value = await fn(); await c.query('RELEASE SAVEPOINT registration_case'); return value; }
    catch (error) { await c.query('ROLLBACK TO SAVEPOINT registration_case'); await c.query('RELEASE SAVEPOINT registration_case'); throw error; }
  };
  const save = (patch={}) => atomic(() => server.saveRegistration(db, 143, {...base,...patch}));
  try {
    await c.query('BEGIN');
    await c.query(`CREATE TEMP TABLE qa_registration_staff_shift_registration_week_locks(week_start date PRIMARY KEY,locked_by bigint) ON COMMIT DROP;
      CREATE TEMP TABLE qa_registration_staff_profiles(id bigint,full_name text,position text,store_id bigint,status text) ON COMMIT DROP;
      INSERT INTO qa_registration_staff_profiles VALUES(1,'QA Active','PT',23,'active'),(2,'QA Inactive','PT',23,'inactive'),(3,'QA No store','PT',null,'active');
      CREATE TEMP TABLE qa_registration_stores(id bigint,store_name text,status text,store_address text) ON COMMIT DROP;
      INSERT INTO qa_registration_stores VALUES(23,'QA Store','opening'),(24,'QA Closed','inactive');
      CREATE TEMP TABLE qa_registration_staff_shift_registrations(staff_id bigint,work_date date,store_id bigint,shift_code text,revision bigint DEFAULT 1,created_by bigint,updated_by bigint,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),PRIMARY KEY(staff_id,work_date)) ON COMMIT DROP;
      CREATE TEMP TABLE qa_registration_staff_shift_registration_history(staff_id bigint,work_date date,store_id bigint,previous_code text,shift_code text,revision bigint,actor_id bigint) ON COMMIT DROP`);
    const first = await save(); assert.equal(first.revision,'1'); assert.equal(first.shift_code,'S');
    await assert.rejects(save(), e=>e.status===409);
    const changed = await save({shift_code:'G1+G3',revision:first.revision}); assert.equal(changed.revision,'2');
    await assert.rejects(save({revision:first.revision,shift_code:'O'}),e=>e.status===409);
    const rest = await save({revision:changed.revision,shift_code:'O'}); assert.equal(rest.shift_code,'O');
    const cleared = await save({revision:rest.revision,shift_code:null}); assert.equal(cleared.revision,'4');
    await assert.rejects(save(), e=>e.status===409); // Tombstone prevents an old empty-cell edit.
    for (const patch of [{staff_id:2},{staff_id:99},{store_id:24}]) await assert.rejects(save(patch),e=>e.status===409);
    let result = await server.readRegistrationMonth(db,'2026-11');
    assert.equal(result.registrations.length,1); assert.equal(result.staff.length,2); assert.equal(result.stores.length,2);
    assert.equal((await server.readRegistrationMonth(db,'2026-12')).registrations.length,0);
    const filteredRange=await server.readRegistrationRange(db,'2026-10-31','2026-11-02');
    assert.equal(filteredRange.from,'2026-10-31');assert.equal(filteredRange.to,'2026-11-02');assert.equal(filteredRange.registrations.length,1);
    assert.equal((await server.readRegistrationRange(db,'2026-11-02','2026-11-30')).registrations.length,0);
    assert.equal((await c.query('SELECT count(*)::int n FROM qa_registration_staff_shift_registration_history')).rows[0].n,4);
    failHistory = true;
    await assert.rejects(save({revision:cleared.revision,shift_code:'F'}), /simulated audit failure/);
    failHistory = false;
    result = await server.readRegistrationMonth(db,'2026-11'); assert.equal(result.registrations[0].shift_code,null); assert.equal(result.registrations[0].revision,'4');
    console.log('PASS: TEMP DB create/change/rest/clear, stale writes, duplicate create, archived staff, store validation, monthly reads, audit and full rollback on failure; no operational rows written');
    await c.query('ALTER TABLE qa_registration_staff_profiles ADD COLUMN user_id bigint');
    await c.query('UPDATE qa_registration_staff_profiles SET user_id=901 WHERE id=1');
    await c.query('UPDATE qa_registration_staff_profiles SET user_id=902 WHERE id=2');
    const employee={id:901,access_role:'branch_staff',store_id:23,scope_all:false,permissions:[]};
    const week='2026-11-02',today='2026-11-03';
    const read=await self.readSelfRegistrationWeek(db,employee,week,today);
    assert.equal(read.staff.id,1);assert.equal(read.dates.length,7);assert.equal(read.registrations.length,0);
    const input={week,days:[{work_date:today,shift_code:'G1',revision:null},{work_date:'2026-11-04',shift_code:'O',revision:null}]};
    const own=await atomic(()=>self.saveSelfRegistrationWeek(db,employee,input,today));
    assert.equal(own.registrations.length,2);assert(own.registrations.every(row=>row.staff_id===1&&row.store_id===23));
    for(const body of [{...input,staff_id:2},{...input,store_id:24},{...input,days:[{...input.days[0],staff_id:2}]},{...input,days:[input.days[0],input.days[0]]},{...input,days:[{...input.days[0],work_date:'2026-11-02'}]},{...input,days:[{...input.days[0],work_date:'2026-11-09'}]}])await assert.rejects(atomic(()=>self.saveSelfRegistrationWeek(db,employee,body,today)),e=>e.status===400);
    await assert.rejects(atomic(()=>self.readSelfRegistrationWeek(db,{...employee,id:902},week,today)),e=>e.status===409);
    await assert.rejects(atomic(()=>self.readSelfRegistrationWeek(db,{...employee,id:999},week,today)),e=>e.status===409);
    const beforePartial=(await self.readSelfRegistrationWeek(db,employee,week,today)).registrations.length;
    await assert.rejects(atomic(()=>self.saveSelfRegistrationWeek(db,employee,{week,days:[{work_date:'2026-11-05',shift_code:'F',revision:null},{work_date:'2026-11-06',shift_code:'S',revision:'9'}]},today)),e=>e.status===409);
    assert.equal((await self.readSelfRegistrationWeek(db,employee,week,today)).registrations.length,beforePartial);
    const managerMonth=await server.readRegistrationMonth(db,'2026-11');assert(managerMonth.registrations.some(row=>row.work_date===today&&row.shift_code==='G1'));
    assert.deepEqual(managerMonth.staff.map(row=>row.id).sort(), [1,3]);
    const employeeMonth = await server.readRegistrationMonth(db, '2026-11', employee.id);
    assert.deepEqual(employeeMonth.staff.map(row=>row.id), [1]);
    assert.deepEqual(employeeMonth.stores.map(row=>row.id), [23]);
    assert(employeeMonth.registrations.length > 0 && employeeMonth.registrations.every(row=>row.staff_id===1));
    const unlinked = await server.readRegistrationMonth(db, '2026-11', 999);
    assert.deepEqual([unlinked.staff, unlinked.stores, unlinked.registrations], [[], [], []]);
    await server.setRegistrationWeekLock(db, 143, {week, locked:true});
    assert.equal((await self.readSelfRegistrationWeek(db, employee, week, today)).locked, true);
    await assert.rejects(atomic(()=>self.saveSelfRegistrationWeek(db, employee, input, today)), e=>e.status===409 && e.message.includes('đã khóa'));
    const changedAfterLock = await save({work_date:today, shift_code:'G2', revision:'1'});
    assert.equal(changedAfterLock.shift_code, 'G2');
    assert.equal((await self.readSelfRegistrationWeek(db, employee, week, today)).locked, true);
    console.log('PASS: isolated schedule visibility, missing profile fails closed, weekly lock blocks self-service while the HR edit path remains available');
    console.log('PASS: self-service staff needs no HR permission; actor-bound profile/store; weekly choices appear in manager month; forged identity, missing/inactive staff, past/outside/duplicate days rejected; multi-day conflict rolls back all days');
  } finally { await c.query('ROLLBACK'); c.release(); }
}
main().catch(error => { console.error(error.name,error.message); process.exitCode=1; }).finally(() => globalThis.himotoPool?.end());

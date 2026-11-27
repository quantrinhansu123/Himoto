const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
const {ownerDatabase} = load(path.join(root,'lib/server/himoto-database'));
const {ATTENDANCE_SCHEDULE_OFFSET,ATTENDANCE_SHIFT_JOIN,compareRegisteredAttendance,recordAttendance,manageAttendance,parseAttendanceLocation,attendanceDistanceMeters,attendancePhotoMime,attendanceScope} = load(path.join(root,'lib/server/attendance'));
const {attendanceLocationLabel,nearestAttendanceStore} = load(path.resolve(root,'../shared/mobile-support'));
const {setRegistrationWeekLock,lockedRegistrationWeeks} = load(path.join(root,'lib/server/shift-registration'));
const {saveSelfRegistrationWeek} = load(path.join(root,'lib/server/self-shift-registration'));
const {canExportAttendance,canManageShiftRegistration} = load(path.resolve(root,'../shared/access-permissions'));
const {requestPermission} = load(path.join(root,'lib/server/access-request'));
async function main() {
  const location = parseAttendanceLocation(JSON.stringify({latitude:21.03,longitude:105.85,accuracy:15,timestamp:Date.now()}));
  assert.equal(attendanceDistanceMeters(location,location),0);
  assert.equal(attendanceDistanceMeters({latitude:0,longitude:0.01},{latitude:0,longitude:0}),1112);
  assert.equal(attendanceDistanceMeters(location,null),null);
  const near = nearestAttendanceStore(location,[{latitude:0,longitude:0,store_name:'Far'},{...location,store_name:'Near'}]);
  assert.deepEqual(near,{store_name:'Near',distance_m:0});
  assert.equal(attendanceLocationLabel(location,{...near,distance_m:100}),'Near');
  assert.match(attendanceLocationLabel(location,{...near,distance_m:100.1}),/101 m$/);
  assert.match(attendanceLocationLabel(location,{...near,distance_m:1100}),/1,1 km$/);
  assert.equal(requestPermission('/api/auth/duty-roster/registrations','GET'),null);
  assert.equal(canManageShiftRegistration({access_role:'branch_manager',permissions:['hr.write']}),false);
  assert.equal(canManageShiftRegistration({access_role:'hr',permissions:['hr.write']}),true);
  assert.throws(()=>parseAttendanceLocation(JSON.stringify({...location,latitude:91})));
  assert.throws(()=>parseAttendanceLocation(JSON.stringify({...location,timestamp:Date.now()-600000})));
  assert.throws(()=>attendancePhotoMime(Buffer.from('not an image')));
  assert.equal(requestPermission('/api/auth/attendance','POST'),null);
  for (const access_role of ['branch_staff','ownership_staff','branch_manager','ownership_manager']) {
    assert.equal(attendanceScope({id:1,access_role,permissions:['hr.read'],store_id:2,store_kind:'lease_to_own',scope_all:false}).reviewer,false);
  }
  const hr = {id:1,access_role:'hr',permissions:['hr.read'],store_id:2};
  assert.deepEqual(attendanceScope({id:1,access_role:'branch_staff',scope_all:true,permissions:['attendance.review']}),{reviewer:false,all:false,store:null});
  assert.equal(attendanceScope(hr).reviewer,false);
  assert.deepEqual(attendanceScope({...hr,has_hr_position:true}),{reviewer:true,all:false,store:2});
  for (const account of [{id:1,access_role:'admin'},{id:1,permissions:['attendance.review','attendance.export','attendance.note']}]) {
    assert.equal(attendanceScope(account).reviewer,false);
    assert.equal(canExportAttendance(account),false);
    assert.equal(attendanceScope({...account,has_hr_position:true}).reviewer,true);
    assert.equal(canExportAttendance({...account,has_hr_position:true}),true);
  }
  const compare = (code, clockIn, clockOut) => compareRegisteredAttendance(
    {work_date:'2026-11-05',shift_code:code}, clockIn, clockOut,
  );
  const lateAndEarly = compare('S','2026-11-05T08:07:01+07:00','2026-11-05T16:45+07:00');
  assert.equal(lateAndEarly.late_minutes,8);
  assert.equal(lateAndEarly.early_leave_minutes,15);
  assert.equal(lateAndEarly.earned_credit,1-23/480);
  const fullShift = compare('S','2026-11-05T07:55+07:00','2026-11-05T17:00+07:00');
  assert.equal(fullShift.late_minutes,0);
  assert.equal(fullShift.early_leave_minutes,0);
  assert.equal(fullShift.earned_credit,1);
  assert.equal(compare('S','2026-11-05T08:00+07:00',null).early_leave_minutes,null);
  assert.equal(compare('S','2026-11-05T08:00+07:00',null).earned_credit,null);
  assert.equal(compare('S','2026-11-05T16:00+07:00','2026-11-05T16:00+07:00').earned_credit,0);
  assert.equal(compare('G1','2026-11-05T08:30+07:00','2026-11-05T11:30+07:00').earned_credit,0.375);
  assert.equal(compare('F','2026-11-05T08:00+07:00','2026-11-05T21:00+07:00').earned_credit,1.5);
  for (const code of [null,'O']) {
    const ungraded = compare(code,'2026-11-05T08:07+07:00','2026-11-05T16:45+07:00');
    assert.equal(ungraded.late_minutes,null);
    assert.equal(ungraded.early_leave_minutes,null);
    assert.equal(ungraded.earned_credit,code==='O'?0:null);
  }
  assert.equal(compare('G1+G3','2026-11-05T08:00+07:00','2026-11-05T11:55+07:00').early_leave_minutes,5);
  const evening = compare('G1+G3','2026-11-05T17:03+07:00','2026-11-05T21:00+07:00');
  assert.equal(evening.late_minutes,3);
  assert.equal(evening.early_leave_minutes,0);
  assert.equal(evening.earned_credit,0.5-3/480);
  const client=await ownerDatabase.connect();
  try {
    await client.query('BEGIN');
    const {rows: offsets} = await client.query(`SELECT ${ATTENDANCE_SCHEDULE_OFFSET} AS minutes
      FROM (VALUES (1,'Trụ Sở Chính','physical','2026-11-20'),(2,'CS Thuê sở hữu','lease_to_own','2026-11-20'),
        (3,'PGD Nguyễn Hoàng','physical','2026-11-20'),(4,'Trụ Sở Chính','physical','2026-11-19')) s(id,store_name,kind,day)
      CROSS JOIN LATERAL (SELECT s.day::date AS work_date) registration ORDER BY s.id`);
    assert.deepEqual(offsets.map(row=>row.minutes),[15,15,0,0]);
    const day='2026-11-20';
    const shifted = compareRegisteredAttendance({work_date:day,shift_code:'S'}, `${day}T08:16:00+07:00`, `${day}T17:14:00+07:00`, offsets[0].minutes);
    assert.equal(shifted.scheduled_in,'2026-11-20T01:15:00.000Z');
    assert.equal(shifted.scheduled_out,'2026-11-20T10:15:00.000Z');
    assert.equal(shifted.late_minutes,1);
    assert.equal(shifted.early_leave_minutes,1);
    assert.equal(compareRegisteredAttendance({work_date:day,shift_code:'G1+G3'}, `${day}T12:10:00+07:00`, null, 15).scheduled_out,'2026-11-20T05:15:00.000Z');
    assert.equal(compareRegisteredAttendance({work_date:day,shift_code:'O'}, null, null, 15).scheduled_in,null);
    await client.query(`CREATE TEMP TABLE qa_attendance (LIKE himoto.management_staff_attendance INCLUDING ALL EXCLUDING INDEXES) ON COMMIT DROP;
      ALTER TABLE qa_attendance ADD PRIMARY KEY (id), ADD UNIQUE (in_request), ADD UNIQUE (out_request);
      CREATE UNIQUE INDEX management_staff_attendance_open ON qa_attendance(staff_id) WHERE clock_out_at IS NULL`);
    const migration = fs.readFileSync('docs/sql/2026-11-17-attendance-open-per-day.sql','utf8')
      .replace(/^(BEGIN|COMMIT);$/gm,'')
      .replace('ON himoto.management_staff_attendance(','ON pg_temp.qa_attendance(')
      .replace('DROP INDEX IF EXISTS himoto.', 'DROP INDEX IF EXISTS pg_temp.');
    await client.query(migration);
    const staff = {id:900001,full_name:'QA chấm công',store_id:2,store_name:'Home',store_address:'Home address'};
    await client.query('CREATE TEMP TABLE qa_week_locks (week_start date PRIMARY KEY,locked_by bigint NOT NULL) ON COMMIT DROP');
    let linked=true, punchTime;
    const db = {query(sql,args) {
      if(punchTime && sql==='SELECT clock_timestamp() AS now') return Promise.resolve({rows:[{now:punchTime}]});
      if(sql.includes('FROM himoto.staff_profiles')) return Promise.resolve({rows:linked?[staff]:[]});
      if(sql.includes('SELECT store_name,store_address FROM himoto.stores')) return Promise.resolve({rows:args[0]==='3'?[{store_name:'Other',store_address:'Other address'}]:[]});
      sql=sql.replaceAll('himoto.management_staff_attendance','pg_temp.qa_attendance');
      sql=sql.replaceAll('himoto.staff_shift_registration_week_locks','pg_temp.qa_week_locks');
      assert(!sql.includes('himoto.'));
      return client.query(sql,args);
    }};
    const user={id:900001,access_role:'branch_staff',store_id:2}, photo=Buffer.from([255,216,255,224]);
    const into='11111111-1111-4111-8111-111111111111',out='22222222-2222-4222-8222-222222222222';
    await assert.rejects(recordAttendance(db,user,'in',into,photo,location,'3',' '), /Nhập lý do/);
    const first=await recordAttendance(db,user,'in',into,photo,location,'3','  Support shift  ');
    assert.equal((await recordAttendance(db,user,'in',into,photo,location)).replayed,true);
    await assert.rejects(recordAttendance(db,user,'in','33333333-3333-4333-8333-333333333333',photo,location),e=>e.status===409);
    await assert.rejects(recordAttendance(db,user,'out',into,photo,location),e=>e.status===409);
    assert.equal((await recordAttendance(db,user,'out',out,photo,location,'2','  Ghi chú ra ca  ')).id,first.id);
    assert.equal((await recordAttendance(db,user,'out',out,photo,location)).replayed,true);
    await assert.rejects(recordAttendance(db,user,'out','44444444-4444-4444-8444-444444444444',photo,location),e=>e.status===409);
    const row=(await client.query('SELECT * FROM qa_attendance')).rows[0];
    assert(row.clock_out_at>=row.clock_in_at);assert.equal(row.staff_name,staff.full_name);assert(row.in_photo.equals(photo));assert(row.out_photo.equals(photo));
    assert.equal(row.in_location.store_name,'Other');assert.equal(row.in_location.note,'Support shift');assert.equal(row.out_location.store_name,'Home');assert.equal(row.in_location.store_address,'Other address');assert.equal(row.out_location.store_address,'Home address');
    assert.equal(row.out_location.note,'Ghi chú ra ca');
    const week='2026-11-16', days=[{work_date:week,shift_code:'S',revision:null}];
    await setRegistrationWeekLock(db,user.id,{week,locked:true});
    assert.deepEqual(await lockedRegistrationWeeks(db,'2026-11-17','2026-11-19'),[week]);
    await assert.rejects(saveSelfRegistrationWeek(db,user,{week,days},week), /Tuần đăng ký đã khóa/);
    await setRegistrationWeekLock(db,user.id,{week,locked:false});
    assert.deepEqual(await lockedRegistrationWeeks(db,week,week),[]);
    await client.query(`CREATE TEMP TABLE qa_attendance_registrations (LIKE himoto.staff_shift_registrations INCLUDING ALL) ON COMMIT DROP;
      INSERT INTO qa_attendance_registrations(staff_id,store_id,work_date,shift_code,created_by,updated_by)
      VALUES (900001,2,'2026-11-04','G3',900001,900001),(900001,2,'2026-11-05','S',900001,900001),(900002,2,'2026-11-06','G2',900001,900001);`);
    const shiftJoin=ATTENDANCE_SHIFT_JOIN.replace('himoto.staff_shift_registrations','pg_temp.qa_attendance_registrations');
    const match=async time=>(await client.query(`SELECT registration.shift_code FROM (SELECT 900001::bigint AS staff_id,$1::timestamptz AS clock_in_at) a ${shiftJoin}`,[time])).rows[0].shift_code;
    assert.equal(await match('2026-11-04T16:59Z'),'G3');
    assert.equal(await match('2026-11-04T17:00Z'),'S');
    assert.equal(await match('2026-11-06T08:00+07'),null);
    const manager = {...user,access_role:'branch_manager',permissions:['hr.read','hr.write']};
    const hr = {...manager,access_role:'hr',scope_all:true};
    const admin = {...user,access_role:'admin'};
    const original = {id:first.id,original_in:row.clock_in_at.toISOString(),original_out:row.clock_out_at.toISOString()};
    const note = {id:first.id,hr_note:' Đã xác minh ',original_hr_note:null};
    await assert.rejects(manageAttendance(db,user,'PATCH',note),e=>e.status===403);
    const noteWriter = {...manager,has_hr_position:true,permissions:['attendance.note']};
    await assert.rejects(manageAttendance(db,{...noteWriter,store_id:3},'PATCH',note),e=>e.status===409);
    await manageAttendance(db,noteWriter,'PATCH',note);
    await assert.rejects(manageAttendance(db,noteWriter,'PATCH',note),e=>e.status===409);
    const noted = (await client.query('SELECT hr_note,hr_note_by,clock_in_at FROM qa_attendance WHERE id=$1',[first.id])).rows[0];
    assert.equal(noted.hr_note,'Đã xác minh');assert.equal(Number(noted.hr_note_by),user.id);
    assert.equal(noted.clock_in_at.toISOString(),original.original_in);
    const correction = {...original,clock_in_at:new Date(row.clock_in_at.getTime()-60000).toISOString(),clock_out_at:original.original_out};
    for (const nonAdmin of [user,manager,hr]) {
      await assert.rejects(manageAttendance(db,nonAdmin,'DELETE',original),e=>e.status===403);
      await assert.rejects(manageAttendance(db,nonAdmin,'PATCH',correction),e=>e.status===403);
    }
    await manageAttendance(db,admin,'PATCH',correction);
    const revised = (await client.query('SELECT * FROM qa_attendance WHERE id=$1',[first.id])).rows[0];
    assert.equal(revised.clock_in_at.toISOString(),correction.clock_in_at);
    assert(revised.in_photo.equals(photo));
    await assert.rejects(manageAttendance(db,admin,'DELETE',original),e=>e.status===409);
    await manageAttendance(db,admin,'DELETE',{...original,original_in:correction.clock_in_at});
    assert.equal((await client.query('SELECT id FROM qa_attendance WHERE id=$1',[first.id])).rowCount,0);
    const yesterdayId='66666666-6666-4666-8666-666666666666', todayId='77777777-7777-4777-8777-777777777777',
      checkoutId='88888888-8888-4888-8888-888888888888';
    punchTime = new Date('2026-11-15T16:59:59Z');
    const yesterday = await recordAttendance(db,user,'in',yesterdayId,photo,location);
    punchTime = new Date('2026-11-15T17:00:00Z');
    await assert.rejects(recordAttendance(db,user,'out',checkoutId,photo,location),e=>e.status===409);
    const today = await recordAttendance(db,user,'in',todayId,photo,location);
    assert.equal((await recordAttendance(db,user,'in',yesterdayId,photo,location)).id,yesterday.id);
    await assert.rejects(recordAttendance(db,user,'in','99999999-9999-4999-8999-999999999999',photo,location),e=>e.status===409);
    assert.equal((await recordAttendance(db,user,'out',checkoutId,photo,location)).id,today.id);
    const punches = (await client.query('SELECT clock_out_at,out_request,out_photo FROM qa_attendance ORDER BY id')).rows;
    assert.deepEqual(punches[0],{clock_out_at:null,out_request:null,out_photo:null});
    assert.equal(punches[1].clock_out_at.toISOString(),punchTime.toISOString());
    linked=false;
    await assert.rejects(recordAttendance(db,user,'in','55555555-5555-4555-8555-555555555555',photo,location),e=>e.status===409);
    console.log('PASS: in/out pairing, Vietnam midnight rollover, request safety, shift matching, scoped reads and admin-only edits/deletes. Real attendance writes: 0 (TEMP only).');
  } finally {await client.query('ROLLBACK');client.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
const {ownerDatabase} = load(path.join(root,'lib/server/himoto-database'));
const {ATTENDANCE_SHIFT_JOIN,compareRegisteredAttendance,recordAttendance,manageAttendance,parseAttendanceLocation,attendanceDistanceMeters,attendancePhotoMime,attendanceScope} = load(path.join(root,'lib/server/attendance'));
const {requestPermission} = load(path.join(root,'lib/server/access-request'));
async function main() {
  const location = parseAttendanceLocation(JSON.stringify({latitude:21.03,longitude:105.85,accuracy:15,timestamp:Date.now()}));
  assert.equal(attendanceDistanceMeters(location,location),0);
  assert.equal(attendanceDistanceMeters({latitude:0,longitude:0.01},{latitude:0,longitude:0}),1112);
  assert.equal(attendanceDistanceMeters(location,null),null);
  assert.throws(()=>parseAttendanceLocation(JSON.stringify({...location,latitude:91})));
  assert.throws(()=>parseAttendanceLocation(JSON.stringify({...location,timestamp:Date.now()-600000})));
  assert.throws(()=>attendancePhotoMime(Buffer.from('not an image')));
  assert.equal(requestPermission('/api/auth/attendance','POST'),null);
  assert.equal(attendanceScope({id:1,access_role:'branch_staff',store_id:2}).reviewer,false);
  const reviewer = {id:1,access_role:'hr',permissions:['hr.read'],store_id:2};
  assert.equal(attendanceScope(reviewer).reviewer,false);
  assert.equal(attendanceScope({id:1,access_role:'admin'}).reviewer,false);
  assert.equal(attendanceScope({id:1,access_role:'admin',has_hr_position:true}).reviewer,true);
  assert.deepEqual(attendanceScope({...reviewer,has_hr_position:true}),{reviewer:true,all:false,store:2});
  const compare = (code, clockIn, clockOut) => compareRegisteredAttendance(
    {work_date:'2026-11-05',shift_code:code}, clockIn, clockOut,
  );
  const lateAndEarly = compare('S','2026-11-05T08:07:01+07:00','2026-11-05T16:45+07:00');
  assert.equal(lateAndEarly.late_minutes,7);
  assert.equal(lateAndEarly.early_leave_minutes,15);
  assert.equal(lateAndEarly.earned_credit,1-22/480);
  for (const code of ['G2','C']) {
    const onTime = compare(code,'2026-11-05T13:00:59+07:00',null);
    assert.equal(onTime.scheduled_in,'2026-11-05T06:00:00.000Z');
    assert.equal(onTime.late_minutes,0);
    assert.equal(compare(code,'2026-11-05T13:08:59+07:00',null).late_minutes,8);
  }
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
    await client.query(`CREATE TEMP TABLE qa_attendance (LIKE himoto.management_staff_attendance INCLUDING ALL EXCLUDING INDEXES) ON COMMIT DROP;
      ALTER TABLE qa_attendance ADD PRIMARY KEY (id), ADD UNIQUE (in_request), ADD UNIQUE (out_request);
      CREATE UNIQUE INDEX management_staff_attendance_open ON qa_attendance(staff_id) WHERE clock_out_at IS NULL`);
    const migration = fs.readFileSync('docs/sql/2026-11-17-attendance-open-per-day.sql','utf8')
      .replace(/^(BEGIN|COMMIT);$/gm,'')
      .replace('ON himoto.management_staff_attendance(','ON pg_temp.qa_attendance(')
      .replace('DROP INDEX IF EXISTS himoto.', 'DROP INDEX IF EXISTS pg_temp.');
    await client.query(migration);
    const staff = {id:900001,full_name:'QA chấm công',store_id:2};
    let linked=true, punchTime;
    const db = {query(sql,args) {
      if(punchTime && sql==='SELECT clock_timestamp() AS now') return Promise.resolve({rows:[{now:punchTime}]});
      if(sql.includes('FROM himoto.staff_profiles')) return Promise.resolve({rows:linked?[staff]:[]});
      sql=sql.replaceAll('himoto.management_staff_attendance','pg_temp.qa_attendance');
      assert(!sql.includes('himoto.'));
      return client.query(sql,args);
    }};
    const user={id:900001,access_role:'branch_staff',store_id:2}, photo=Buffer.from([255,216,255,224]);
    const into='11111111-1111-4111-8111-111111111111',out='22222222-2222-4222-8222-222222222222';
    const first=await recordAttendance(db,user,'in',into,photo,location);
    assert.equal((await recordAttendance(db,user,'in',into,photo,location)).replayed,true);
    await assert.rejects(recordAttendance(db,user,'in','33333333-3333-4333-8333-333333333333',photo,location),e=>e.status===409);
    await assert.rejects(recordAttendance(db,user,'out',into,photo,location),e=>e.status===409);
    assert.equal((await recordAttendance(db,user,'out',out,photo,location,'  Ghi chú ra ca  ')).id,first.id);
    assert.equal((await recordAttendance(db,user,'out',out,photo,location)).replayed,true);
    await assert.rejects(recordAttendance(db,user,'out','44444444-4444-4444-8444-444444444444',photo,location),e=>e.status===409);
    const row=(await client.query('SELECT * FROM qa_attendance')).rows[0];
    assert(row.clock_out_at>=row.clock_in_at);assert.equal(row.staff_name,staff.full_name);assert(row.in_photo.equals(photo));assert(row.out_photo.equals(photo));
    assert.equal(row.out_location.note,'Ghi chú ra ca');
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
    await assert.rejects(manageAttendance(db,{...admin,id:900002},'DELETE',original),e=>e.status===404);
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

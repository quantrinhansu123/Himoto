const assert = require('node:assert/strict'), path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
const {ownerDatabase} = load(path.join(root,'lib/server/himoto-database'));
const {ATTENDANCE_SHIFT_JOIN,attendanceLateMinutes,recordAttendance,parseAttendanceLocation,attendancePhotoMime,attendanceScope} = load(path.join(root,'lib/server/attendance'));
const {requestPermission} = load(path.join(root,'lib/server/access-request'));
async function main() {
  const location = parseAttendanceLocation(JSON.stringify({latitude:21.03,longitude:105.85,accuracy:15,timestamp:Date.now()}));
  assert.throws(()=>parseAttendanceLocation(JSON.stringify({...location,latitude:91})));
  assert.throws(()=>parseAttendanceLocation(JSON.stringify({...location,timestamp:Date.now()-600000})));
  assert.throws(()=>attendancePhotoMime(Buffer.from('not an image')));
  assert.equal(requestPermission('/api/auth/attendance','POST'),null);
  assert.equal(attendanceScope({id:1,access_role:'branch_staff',store_id:2}).reviewer,false);
  assert.deepEqual(attendanceScope({id:1,access_role:'branch_manager',permissions:['hr.read'],store_id:2}),{reviewer:true,all:false,store:2});
  assert.equal(attendanceLateMinutes('2026-11-05T08:07:01+07:00','2026-11-05T08:00:00+07:00'),8);
  assert.equal(attendanceLateMinutes('2026-11-05T07:55:00+07:00','2026-11-05T08:00:00+07:00'),0);
  assert.equal(attendanceLateMinutes('2026-11-05T08:00:00+07:00',null),null);
  const client=await ownerDatabase.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE qa_attendance (LIKE himoto.management_staff_attendance INCLUDING ALL) ON COMMIT DROP');
    const staff = {id:900001,full_name:'QA chấm công',store_id:2};
    let linked=true;
    const db = {query(sql,args) {
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
    assert.equal((await recordAttendance(db,user,'out',out,photo,location)).id,first.id);
    assert.equal((await recordAttendance(db,user,'out',out,photo,location)).replayed,true);
    await assert.rejects(recordAttendance(db,user,'out','44444444-4444-4444-8444-444444444444',photo,location),e=>e.status===409);
    const row=(await client.query('SELECT * FROM qa_attendance')).rows[0];
    assert(row.clock_out_at>=row.clock_in_at);assert.equal(row.staff_name,staff.full_name);assert(row.in_photo.equals(photo));assert(row.out_photo.equals(photo));
    await client.query(`CREATE TEMP TABLE qa_attendance_duties(id bigint,staff_id bigint,store_id bigint,shift_name text,starts_at timestamptz,ends_at timestamptz,deleted_at timestamptz) ON COMMIT DROP;
      INSERT INTO qa_attendance_duties VALUES(1,900001,2,'Ca đêm','2026-11-04T22:00+07','2026-11-05T06:00+07',NULL),(2,900001,2,'Ca ngày','2026-11-05T08:00+07','2026-11-05T17:00+07',NULL),(3,900001,99,'Khác cơ sở','2026-11-05T00:00+07','2026-11-05T23:00+07',NULL);`);
    const shiftJoin=ATTENDANCE_SHIFT_JOIN.replaceAll('himoto.store_duty_schedules','pg_temp.qa_attendance_duties');
    const match=async time=>(await client.query(`SELECT duty.* FROM (SELECT 900001::bigint AS staff_id,2::bigint AS store_id,$1::timestamptz AS clock_in_at) a ${shiftJoin}`,[time])).rows[0];
    assert.equal((await match('2026-11-05T01:00+07')).shift_name,'Ca đêm');
    assert.equal((await match('2026-11-05T08:07+07')).shift_name,'Ca ngày');
    linked=false;
    await assert.rejects(recordAttendance(db,user,'in','55555555-5555-4555-8555-555555555555',photo,location),e=>e.status===409);
    console.log('PASS: linked identity, in/out pairing, repeat-request safety, double in/out rejection, server timestamps, photos/GPS validation and HR scope. Real attendance writes: 0 (TEMP only).');
  } finally {await client.query('ROLLBACK');client.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

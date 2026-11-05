import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { ATTENDANCE_SHIFT_JOIN, attendanceLateMinutes, AttendanceError, attendanceScope, attendanceStaff, attendancePhotoMime, parseAttendanceLocation, recordAttendance } from '@/lib/server/attendance';
import { failureResponse } from '@/lib/server/public-failure';
import { vietnamDate } from '@/lib/management/duty-roster';
export const runtime = 'nodejs';

async function handle(request: NextRequest) {
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
  let client;
  try {
    client = await ownerDatabase.connect();
    const scope = attendanceScope(user);
    // Personal history is always actor-bound; HR can review only its permitted branches.
    const where = `(a.actor_id=$1 OR ($2::boolean AND ($3::boolean OR a.store_id=$4)))`;
    const values = [user.id,scope.reviewer,scope.all,scope.store];
    if (request.method === 'GET') {
      const params = request.nextUrl.searchParams;
      if (params.has('photo')) {
        const id = params.get('photo') || '', side = params.get('side');
        if (!/^[1-9]\d{0,14}$/.test(id) || !['in','out'].includes(side || '')) throw new AttendanceError('Ảnh chấm công không hợp lệ.');
        const result = await client.query(`SELECT ${side}_photo AS photo,${side}_mime AS mime FROM himoto.management_staff_attendance a WHERE a.id=$5 AND ${where}`,[...values,id]);
        if (!result.rows[0]?.photo) throw new AttendanceError('Không tìm thấy ảnh chấm công.',404);
        return new NextResponse(new Uint8Array(result.rows[0].photo),{headers:{'Content-Type':result.rows[0].mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
      }
      const from = params.get('from') || vietnamDate().slice(0,7)+'-01', to = params.get('to') || from;
      const valid = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
      const store = params.get('store') || 'all', page = Number(params.get('page') || 1);
      if (!valid(from)||!valid(to)||from>to||Date.parse(to)-Date.parse(from)>93*86400000||store!=='all'&&!/^[1-9]\d{0,14}$/.test(store)||!Number.isSafeInteger(page)||page<1||page>100000) throw new AttendanceError('Chọn khoảng ngày tối đa 93 ngày và cơ sở hợp lệ.');
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const staff = await attendanceStaff(client,user);
      const open = staff ? (await client.query('SELECT id,clock_in_at FROM himoto.management_staff_attendance WHERE staff_id=$1 AND clock_out_at IS NULL',[staff.id])).rows[0] : null;
      const latest = staff ? (await client.query(`SELECT clock_in_at,clock_out_at FROM himoto.management_staff_attendance WHERE staff_id=$1 AND (clock_out_at IS NULL OR (clock_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) ORDER BY clock_in_at DESC LIMIT 1`,[staff.id])).rows[0] : null;
      const shift = staff ? (await client.query(`SELECT duty.* FROM (SELECT $1::bigint AS staff_id,$2::bigint AS store_id,$3::timestamptz AS clock_in_at) a ${ATTENDANCE_SHIFT_JOIN}`,[staff.id,staff.store_id,latest?.clock_in_at || new Date()])).rows[0] : null;
      const filtered = `${where} AND a.clock_in_at>=($5::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND a.clock_in_at<(($6::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND ($7::bigint IS NULL OR a.store_id=$7)`;
      const args = [...values,from,to,store==='all'?null:store];
      const total = Number((await client.query(`SELECT count(*) AS total FROM himoto.management_staff_attendance a WHERE ${filtered}`,args)).rows[0].total);
      const currentPage = Math.min(page,Math.max(1,Math.ceil(total/50)));
      const rows = (await client.query(`SELECT a.id,a.staff_id,a.staff_name,s.store_name,a.clock_in_at,a.clock_out_at,a.in_location,a.out_location,duty.shift_name,duty.starts_at AS scheduled_in,duty.ends_at AS scheduled_out FROM himoto.management_staff_attendance a LEFT JOIN himoto.stores s ON s.id=a.store_id ${ATTENDANCE_SHIFT_JOIN} WHERE ${filtered} ORDER BY a.clock_in_at DESC,a.id DESC LIMIT 50 OFFSET $8`,[...args,(currentPage-1)*50])).rows;
      await client.query('COMMIT');
      return NextResponse.json({status:'success',data:{staff:staff?{name:staff.full_name}:null,open:open||null,latest:latest||null,shift:shift?.id?shift:null,late_minutes:latest?attendanceLateMinutes(latest.clock_in_at,shift?.starts_at):null,server_now:new Date().toISOString(),rows:rows.map(row=>({...row,late_minutes:attendanceLateMinutes(row.clock_in_at,row.scheduled_in)})),total,page:currentPage}},{headers:{'Cache-Control':'no-store'}});
    }
    if (Number(request.headers.get('content-length'))>2300000) throw new AttendanceError('Ảnh chấm công tối đa 2 MB.');
    const form = await request.formData(), file = form.get('photo');
    if (!(file instanceof File) || file.size>2*1024*1024) throw new AttendanceError('Chụp ảnh chấm công, tối đa 2 MB.');
    const photo = Buffer.from(await file.arrayBuffer()); attendancePhotoMime(photo);
    const location = parseAttendanceLocation(String(form.get('location') || ''));
    await client.query('BEGIN');
    const data = await recordAttendance(client,user,String(form.get('action')),String(form.get('request_id')),photo,location);
    await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    if(client) await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof AttendanceError) return NextResponse.json({status:'error',message:error.message},{status:error.status});
    return failureResponse('Không thực hiện được chấm công. Vui lòng tải lại để kiểm tra trước khi thử lại.',error);
  } finally {client?.release();}
}
export const GET = withAccessRequest(handle);
export const POST = withAccessRequest(handle);

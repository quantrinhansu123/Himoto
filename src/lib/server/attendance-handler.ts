import { NextRequest, NextResponse } from 'next/server';
import type { SessionUser } from '@/lib/server/management-session';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { ATTENDANCE_SHIFT_JOIN, SPLIT_SHIFT_MORNING_END, compareRegisteredAttendance, AttendanceError, attendanceDistanceMeters, attendanceScope, attendanceStaff, attendancePhotoMime, manageAttendance, parseAttendanceLocation, recordAttendance } from '@/lib/server/attendance';
import { failureResponse } from '@/lib/server/public-failure';
import { vietnamDate } from '@/lib/management/duty-roster';
import { isAdminAccount } from '@/lib/management/permissions';

export async function handleAttendance(request: NextRequest, user: SessionUser) {
  let client;
  try {
    client = await ownerDatabase.connect();
    const scope = attendanceScope(user);
    // Personal history is always actor-bound; HR can review only its permitted branches.
    const where = `(a.actor_id=$1 OR ($2::boolean AND ($3::boolean OR a.store_id=$4)))`;
    const values = [user.id,scope.reviewer,scope.all,scope.store];
    if (request.method === 'GET') {
      const params = request.nextUrl.searchParams;
      if (params.has('request_id')) {
        const key = params.get('request_id') || '';
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new AttendanceError('Mã chấm công không hợp lệ.');
        const row = (await client.query(`SELECT id,CASE WHEN in_request=$2 THEN 'in' ELSE 'out' END AS action,clock_in_at,clock_out_at FROM himoto.management_staff_attendance WHERE actor_id=$1 AND (in_request=$2 OR out_request=$2)`,[user.id,key])).rows[0];
        return NextResponse.json({status:'success',data:{result:row?{...row,id:Number(row.id)}:null}},{headers:{'Cache-Control':'private, no-store'}});
      }
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
      const exporting=params.get('export')==='1';
      if(exporting&&!isAdminAccount(user))throw new AttendanceError('Chỉ quản trị viên được xuất lịch sử chấm công.',403);
      if (!valid(from)||!valid(to)||from>to||Date.parse(to)-Date.parse(from)>93*86400000||store!=='all'&&!/^[1-9]\d{0,14}$/.test(store)||!Number.isSafeInteger(page)||page<1||page>100000) throw new AttendanceError('Chọn khoảng ngày tối đa 93 ngày và cơ sở hợp lệ.');
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const staff = await attendanceStaff(client,user);
      const open = staff ? (await client.query('SELECT id,clock_in_at FROM himoto.management_staff_attendance WHERE staff_id=$1 AND clock_out_at IS NULL',[staff.id])).rows[0] : null;
      const latest = staff ? (await client.query(`SELECT clock_in_at,clock_out_at FROM himoto.management_staff_attendance WHERE staff_id=$1 AND (clock_out_at IS NULL OR (clock_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) ORDER BY clock_in_at DESC LIMIT 1`,[staff.id])).rows[0] : null;
      const registration = staff ? (await client.query(`SELECT registration.work_date::text,registration.shift_code FROM (SELECT $1::bigint AS staff_id,$2::timestamptz AS clock_in_at) a ${ATTENDANCE_SHIFT_JOIN}`,[staff.id,latest?.clock_in_at || new Date()])).rows[0] : undefined;
      const comparison = compareRegisteredAttendance(registration, latest?.clock_in_at, latest?.clock_out_at);
      const shift = comparison.scheduled_in && comparison.scheduled_out
        ? { shift_name: comparison.shift_name, starts_at: comparison.scheduled_in, ends_at: comparison.scheduled_out }
        : null;
      const summary = {
        staff:staff?{name:staff.full_name,store_id:staff.store_id,store_name:staff.store_name}:null,
        open:open||null,latest:latest||null,shift,shift_code:comparison.shift_name,
        late_minutes:comparison.late_minutes,early_leave_minutes:comparison.early_leave_minutes,
        server_now:new Date().toISOString(),
      };
      if (params.get('view') === 'summary') {
        await client.query('COMMIT');
        return NextResponse.json({status:'success',data:summary},{headers:{'Cache-Control':'no-store'}});
      }
      // The profile supplies a display/filter reference for older punches with no recorded branch.
      const attendanceSource = `FROM himoto.management_staff_attendance a
        LEFT JOIN himoto.staff_profiles profile ON profile.id=a.staff_id AND a.store_id IS NULL`;
      const displayStore = 'COALESCE(a.store_id,profile.store_id)';
      const rangeScope = `${where} AND a.clock_in_at>=($5::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND a.clock_in_at<(($6::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
      const args = [...values,from,to,store==='all'?null:store];
      const total = Number((await client.query(`SELECT count(*) AS total ${attendanceSource}
        WHERE ${rangeScope} AND ($7::bigint IS NULL OR ${displayStore}=$7)`,args)).rows[0].total);
      if(exporting&&total>50000)throw new AttendanceError('Khoảng ngày có quá nhiều chấm công. Chọn khoảng ngắn hơn để xuất đầy đủ.');
      const currentPage = exporting?1:Math.min(page,Math.max(1,Math.ceil(total/50)));
      const rows = (await client.query(`WITH punches AS (
        SELECT a.id,a.staff_id,a.staff_name,${displayStore} AS display_store_id,s.store_name,a.clock_in_at,a.clock_out_at,
        a.in_location,a.out_location,a.out_photo IS NOT NULL AS has_out_photo,
        profile.store_id IS NOT NULL AS store_from_profile,
        location.latitude AS store_latitude,location.longitude AS store_longitude,
        registration.work_date::text,registration.shift_code,
        min(a.clock_in_at) OVER shift_punches AS first_in,
        max(a.clock_out_at) OVER shift_punches AS last_out,
        bool_or(a.clock_out_at IS NULL) OVER shift_punches AS shift_open,
        count(*) OVER shift_punches AS punch_count,
        row_number() OVER (shift_punches ORDER BY a.clock_in_at DESC,a.id DESC) AS credit_rank
        ${attendanceSource}
        LEFT JOIN himoto.stores s ON s.id=${displayStore}
        LEFT JOIN himoto.management_attendance_locations location ON location.store_id=s.id
        ${ATTENDANCE_SHIFT_JOIN} WHERE ${rangeScope}
        WINDOW shift_punches AS (PARTITION BY a.staff_id,(a.clock_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          CASE WHEN registration.shift_code='G1+G3'
            THEN (a.clock_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < $9::time END)
      )
      SELECT * FROM punches WHERE ($7::bigint IS NULL OR display_store_id=$7)
      ORDER BY clock_in_at DESC,id DESC LIMIT $10 OFFSET $8`,[...args,(currentPage-1)*50,SPLIT_SHIFT_MORNING_END,exporting?50000:50])).rows;
      await client.query('COMMIT');
      const canManage = isAdminAccount(user);
      return NextResponse.json({status:'success',data:{
        ...summary,
        rows:rows.map(({work_date,shift_code,store_latitude,store_longitude,display_store_id:_displayStoreId,
          first_in,last_out,shift_open,punch_count,credit_rank,...row})=>{
          const storeLocation = store_latitude != null && store_longitude != null
            ? {latitude:Number(store_latitude),longitude:Number(store_longitude)}
            : null;
          const registration = {work_date,shift_code};
          const comparison = compareRegisteredAttendance(registration,row.clock_in_at,row.clock_out_at);
          const creditRow = Number(credit_rank) === 1;
          const aggregated = comparison.standard_credit !== null && Number(punch_count) > 1;
          const credit = creditRow && aggregated
            ? compareRegisteredAttendance(registration,first_in,shift_open?null:last_out).earned_credit
            : comparison.earned_credit;
          return {...row,
            can_manage:canManage,
            has_store_location:storeLocation !== null,
            in_distance_m:attendanceDistanceMeters(row.in_location,storeLocation),
            out_distance_m:attendanceDistanceMeters(row.out_location,storeLocation),
            ...comparison,
            earned_credit:creditRow?credit:null,
            credit_aggregated:aggregated && creditRow,
            credit_on_other_row:!creditRow && comparison.standard_credit !== null,
          };
        }),
        total,page:currentPage,
      }},{headers:{'Cache-Control':'no-store'}});
    }
    if (request.method === 'PATCH' || request.method === 'DELETE') {
      const input = await request.json().catch(()=>null);
      await client.query('BEGIN');
      await manageAttendance(client,user,request.method,input);
      await client.query('COMMIT');
      return NextResponse.json({status:'success',data:null},{headers:{'Cache-Control':'no-store'}});
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


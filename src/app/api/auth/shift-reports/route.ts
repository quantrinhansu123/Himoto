import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { parseShiftInput, SHIFT_PHOTOS } from '@/lib/management/shift-reports';
import { hasPermission } from '@/lib/management/permissions';

export const runtime = 'nodejs';
export const GET = withAccessRequest(async (request: NextRequest) => {
  try {
    const store = request.nextUrl.searchParams.get('store_id');
    if (store && !/^[1-9]\d*$/.test(store)) return NextResponse.json({ message: 'PGD không hợp lệ.' }, { status: 400 });
    const result = await himotoPool.query(`SELECT r.id,r.payload,r.status,r.revision,r.updated_at,s.store_name,COALESCE(u.name,'Nhân sự') AS created_by_name,
      ARRAY(SELECT p.slot FROM himoto.management_shift_photos p WHERE p.report_id=r.id) AS photos
      FROM himoto.management_shift_reports r JOIN himoto.stores s ON s.id=r.store_id LEFT JOIN himoto.users u ON u.id=r.created_by
      WHERE ($1::bigint IS NULL OR r.store_id=$1) ORDER BY r.report_date DESC,r.id DESC LIMIT 100`, [store || null]);
    return NextResponse.json({ data: result.rows.map(r => ({ ...r, id: Number(r.id) })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ message: 'Không tải được báo cáo cuối ca. Kiểm tra kết nối và cấu hình dữ liệu.' }, { status: 500 }); }
});
export const POST = withAccessRequest(async (request: NextRequest) => {
  const user = dataAccess.getStore();
  if (!hasPermission(user,'contracts.draft') && !hasPermission(user,'finance.write')) return NextResponse.json({ message: 'Không có quyền lập báo cáo.' }, { status: 403 });
  let client;
  try {
    const raw = await request.json();
    let input;
    try { input = parseShiftInput(raw.payload); } catch (e) { return NextResponse.json({ message: (e as Error).message }, { status: 400 }); }
    if (!['draft','submitted'].includes(raw.status) || (raw.id != null && (!Number.isSafeInteger(raw.id) || raw.id <= 0 || !Number.isSafeInteger(raw.revision)))) return NextResponse.json({ message: 'Báo cáo không hợp lệ.' }, { status: 400 });
    const actor = dataAccess.getStore()!;
    if (!actor.scope_all && input.store_id !== actor.store_id) return NextResponse.json({ message: 'PGD nằm ngoài phạm vi được phân công.' }, { status: 403 });
    client = await himotoPool.connect(); await client.query('BEGIN');
    if (!(await client.query('SELECT id FROM himoto.stores WHERE id=$1', [input.store_id])).rowCount) throw new Error('PGD không tồn tại.');
    if (raw.id != null) {
      const existing = (await client.query('SELECT * FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE', [raw.id])).rows[0];
      if (!existing || existing.status !== 'draft' || existing.revision !== raw.revision || Number(existing.store_id) !== input.store_id || existing.payload.date !== input.date) {
        await client.query('ROLLBACK'); return NextResponse.json({ message: 'Báo cáo đã thay đổi hoặc đã chốt. Mở lại từ danh sách để kiểm tra.' }, { status: 409 });
      }
    }
    if (raw.status === 'submitted') {
      const photos = raw.id ? (await client.query('SELECT slot FROM himoto.management_shift_photos WHERE report_id=$1', [raw.id])).rows.map(r => r.slot) : [];
      if (!input.electricity_off || SHIFT_PHOTOS.some(([slot]) => !photos.includes(slot))) throw new Error('Bổ sung đủ 6 ảnh và xác nhận đã tắt thiết bị điện trước khi chốt.');
    }
    const result = raw.id != null
      ? await client.query('UPDATE himoto.management_shift_reports SET payload=$1,status=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,revision', [input, raw.status, raw.id])
      : await client.query('INSERT INTO himoto.management_shift_reports(store_id,report_date,payload,created_by) VALUES($1,$2,$3,$4) RETURNING id,revision', [input.store_id,input.date,input,actor.id]);
    await client.query('COMMIT');
    return NextResponse.json({ data: { id: Number(result.rows[0].id), revision: result.rows[0].revision } });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    const code = (e as { code?: string }).code;
    return NextResponse.json({ message: code === '23505' ? 'PGD đã có báo cáo ngày này. Mở báo cáo trong danh sách.' : code ? 'Chưa lưu được báo cáo. Vui lòng thử lại.' : e instanceof Error ? e.message : 'Thông tin không hợp lệ.' }, { status: code === '23505' ? 409 : code ? 500 : 400 });
  } finally { client?.release(); }
});

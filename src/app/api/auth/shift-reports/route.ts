import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { parseShiftInput } from '@/lib/management/shift-reports';
import { hasPermission } from '@/lib/management/permissions';
import { ShiftRequestError, shiftRequestId, shiftRequestHash, readShiftReceipt, writeShiftReceipt } from '@/lib/server/shift-report-requests';
import { readShiftSnapshot } from '@/lib/server/shift-audits';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const GET = withAccessRequest(async (request: NextRequest) => {
  try {
    const store = request.nextUrl.searchParams.get('store_id');
    const date=request.nextUrl.searchParams.get('date');
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))return NextResponse.json({message:'Ngày báo cáo không hợp lệ.'},{status:400});
    if (store && !/^[1-9]\d*$/.test(store)) return NextResponse.json({ message: 'PGD không hợp lệ.' }, { status: 400 });
    const result = await himotoPool.query(`SELECT r.id,r.payload,r.status,r.revision,r.updated_at,r.app_snapshot,s.store_name,COALESCE(u.name,'Nhân sự') AS created_by_name,
      ARRAY(SELECT p.slot FROM himoto.management_shift_photos p WHERE p.report_id=r.id) AS legacy_photos,
      ARRAY(SELECT p.slot FROM himoto.management_shift_photos p WHERE p.report_id=r.id UNION SELECT m.category FROM himoto.management_shift_media m WHERE m.report_id=r.id AND m.stage='pgd' AND m.mime_type LIKE 'image/%') AS photos,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'category',m.category,'stage',m.stage,'mime_type',m.mime_type,'filename',m.filename,
        'url','/api/auth/shift-reports/'||r.id||'/media/'||m.id) ORDER BY m.created_at,m.id) FROM himoto.management_shift_media m WHERE m.report_id=r.id),'[]'::jsonb) AS media,
      CASE WHEN a.report_id IS NOT NULL THEN jsonb_build_object('input',a.input,'snapshot',a.app_snapshot,'status',a.status,'result',a.result,'revision',a.revision,'reviewer_name',COALESCE(a.reviewer_name,reviewer.name,'KTNB'),'updated_at',a.updated_at,'confirmed_at',a.confirmed_at) END AS audit
      FROM himoto.management_shift_reports r JOIN himoto.stores s ON s.id=r.store_id LEFT JOIN himoto.users u ON u.id=r.created_by
      LEFT JOIN himoto.management_shift_audits a ON a.report_id=r.id LEFT JOIN himoto.users reviewer ON reviewer.id=a.reviewer_id
      WHERE ($1::bigint IS NULL OR r.store_id=$1) AND ($2::date IS NULL OR r.report_date=$2) ORDER BY r.report_date DESC,r.id DESC LIMIT 100`, [store || null,date||null]);
    return NextResponse.json({ data: result.rows.map(r => ({ ...r, id: Number(r.id) })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failureResponse('Không tải được báo cáo cuối ca.', error); }
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
    const requestId = shiftRequestId(request.headers);
    const hash = shiftRequestHash(JSON.stringify({ actor: actor.id, id: raw.id ?? null, revision: raw.revision ?? null, input, status: raw.status }));
    client = await himotoPool.connect(); await client.query('BEGIN');
    const receipt = await readShiftReceipt(client, requestId, actor.id, hash);
    if (receipt) { await client.query('COMMIT'); return NextResponse.json({ data: receipt }); }
    if (!(await client.query('SELECT id FROM himoto.stores WHERE id=$1', [input.store_id])).rowCount) throw new Error('PGD không tồn tại.');
    if (raw.id != null) {
      const existing = (await client.query('SELECT * FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE', [raw.id])).rows[0];
      if (!existing || existing.status !== 'draft' || existing.revision !== raw.revision || Number(existing.store_id) !== input.store_id || existing.payload.date !== input.date) {
        await client.query('ROLLBACK'); return NextResponse.json({ message: 'Báo cáo đã thay đổi hoặc đã chốt. Mở lại từ danh sách để kiểm tra.' }, { status: 409 });
      }
    }
    if (raw.status === 'submitted' && !input.electricity_off) throw new Error('Xác nhận đã tắt thiết bị điện trước khi chốt.');

    const result = raw.id != null
      ? await client.query('UPDATE himoto.management_shift_reports SET payload=$1,status=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,revision', [input, raw.status, raw.id])
      : await client.query('INSERT INTO himoto.management_shift_reports(store_id,report_date,payload,created_by,status) VALUES($1,$2,$3,$4,$5) RETURNING id,revision', [input.store_id,input.date,input,actor.id,raw.status]);
    const saved = { id: Number(result.rows[0].id), revision: result.rows[0].revision };
    if(raw.status==='submitted'){
      await client.query('SAVEPOINT shift_snapshot');
      try{
        const snapshot=await readShiftSnapshot(client,{payload:input},true);
        await client.query('UPDATE himoto.management_shift_reports SET app_snapshot=$2,submitted_at=now() WHERE id=$1',[saved.id,snapshot]);
      }catch{
        // A temporary analytics outage must not undo the PGD's verified report
        // and evidence. KTNB will see that no historical app snapshot is available.
        await client.query('ROLLBACK TO SAVEPOINT shift_snapshot');
        await client.query('UPDATE himoto.management_shift_reports SET submitted_at=now() WHERE id=$1',[saved.id]);
      }
      await client.query('RELEASE SAVEPOINT shift_snapshot');
    }
    await writeShiftReceipt(client, requestId, actor.id, input.store_id, hash, saved);
    await client.query('COMMIT');
    return NextResponse.json({ data: saved });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (e instanceof ShiftRequestError) return NextResponse.json({ message: e.message }, { status: e.status });
    const code = (e as { code?: string }).code;
    if (code === '23505') return failureResponse('PGD đã có báo cáo ngày này. Mở báo cáo trong danh sách.', e);
    if (code) return failureResponse('Chưa lưu được báo cáo.', e);
    return NextResponse.json({ message: e instanceof Error && e.message ? e.message : 'Thông tin không hợp lệ.' }, { status: 400 });
  } finally { client?.release(); }
});

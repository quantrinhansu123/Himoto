import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { hasPermission } from '@/lib/management/permissions';
import { parseAuditInput,validateAuditConfirmation } from '@/lib/management/shift-audits';
import { readShiftSnapshot } from '@/lib/server/shift-audits';
import { ShiftRequestError,shiftRequestId,shiftRequestHash,readShiftReceipt,writeShiftReceipt } from '@/lib/server/shift-report-requests';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export const GET=withAccessRequest(async(_request:NextRequest,context:Context)=>{
  const {id}=await context.params;
  if(!/^[1-9]\d{0,14}$/.test(id))return NextResponse.json({message:'Báo cáo không hợp lệ.'},{status:400});
  const client=await himotoPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const report=(await client.query('SELECT payload,status,app_snapshot FROM himoto.management_shift_reports WHERE id=$1',[id])).rows[0];
    if(!report||report.status!=='submitted'){await client.query('ROLLBACK');return NextResponse.json({message:'PGD cần chốt kiểm kê trước khi đối soát.'},{status:409});}
    const snapshot=await readShiftSnapshot(client,report);await client.query('COMMIT');
    return NextResponse.json({data:snapshot},{headers:{'Cache-Control':'private, no-store'}});
  }catch{await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({message:'Không lấy được số liệu đối soát từ app. Thử lại sau.'},{status:500});}finally{client.release();}
});
export const POST=withAccessRequest(async(request:NextRequest,context:Context)=>{
  const actor=dataAccess.getStore()!;
  if(!hasPermission(actor,'shift.review'))return NextResponse.json({message:'Chỉ tài khoản được cấp quyền KTNB mới được đối soát.'},{status:403});
  const {id}=await context.params;let client;
  try{
    if(!/^[1-9]\d{0,14}$/.test(id))throw Error('Báo cáo không hợp lệ.');
    const raw=await request.json(),input=parseAuditInput(raw.input);
    if(!Number.isSafeInteger(raw.revision)||raw.revision<0||!Number.isSafeInteger(raw.report_revision)||raw.report_revision<1||!['draft','confirmed'].includes(raw.status)||typeof raw.fingerprint!=='string')throw Error('Phiên bản đối soát không hợp lệ.');
    const key=shiftRequestId(request.headers);if(!key)throw Error('Thiếu mã thao tác đối soát.');
    const hash=shiftRequestHash(JSON.stringify({kind:'audit',actor:actor.id,id,revision:raw.revision,report_revision:raw.report_revision,input,status:raw.status,fingerprint:raw.fingerprint}));
    client=await himotoPool.connect();await client.query('BEGIN');
    const receipt=await readShiftReceipt(client,key,actor.id,hash);
    if(receipt){await client.query('COMMIT');return NextResponse.json({data:receipt});}
    const report=(await client.query('SELECT store_id,payload,status,revision,app_snapshot FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!report||report.status!=='submitted')throw new ShiftRequestError('PGD chưa chốt hoặc báo cáo ngoài phạm vi.',409);
    if(report.revision!==raw.report_revision)throw new ShiftRequestError('Minh chứng đã thay đổi. Mở lại báo cáo trước khi đối soát.',409);
    const existing=(await client.query('SELECT revision,status FROM himoto.management_shift_audits WHERE report_id=$1',[id])).rows[0];
    if((existing?.revision??0)!==raw.revision||existing?.status==='confirmed')throw new ShiftRequestError('Đối soát đã thay đổi hoặc đã xác nhận. Tải lại trước khi thao tác.',409);
    const snapshot=await readShiftSnapshot(client,report);
    if(snapshot.fingerprint!==raw.fingerprint)throw new ShiftRequestError('Số liệu app đã thay đổi. Lấy lại số liệu app, kiểm tra chênh lệch rồi lưu.',409);
    const result=raw.status==='confirmed'?validateAuditConfirmation(report.payload,input,snapshot):'pending';
    const reviewerName=(actor as {name?:string}).name||'KTNB';
    const saved=(await client.query(`INSERT INTO himoto.management_shift_audits(report_id,store_id,input,app_snapshot,status,result,reviewer_id,reviewer_name,confirmed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $5='confirmed' THEN now() END)
      ON CONFLICT(report_id) DO UPDATE SET input=EXCLUDED.input,app_snapshot=EXCLUDED.app_snapshot,status=EXCLUDED.status,result=EXCLUDED.result,
        revision=management_shift_audits.revision+1,reviewer_id=EXCLUDED.reviewer_id,reviewer_name=EXCLUDED.reviewer_name,updated_at=now(),confirmed_at=EXCLUDED.confirmed_at RETURNING revision,updated_at,confirmed_at`,
      [id,report.store_id,input,snapshot,raw.status,result,actor.id,reviewerName])).rows[0];
    const data={id:Number(id),revision:saved.revision,audit:{input,snapshot,status:raw.status,result,revision:saved.revision,
      reviewer_name:reviewerName,updated_at:saved.updated_at,confirmed_at:saved.confirmed_at}};
    await writeShiftReceipt(client,key,actor.id,Number(report.store_id),hash,data);
    await client.query('COMMIT');return NextResponse.json({data});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({message:error instanceof ShiftRequestError||!(error as {code?:string}).code?(error as Error).message:'Không lưu được đối soát. Giữ form và thử lại.'},{status:error instanceof ShiftRequestError?error.status:(error as {code?:string}).code?500:400});}finally{client?.release();}
});

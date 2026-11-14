import 'server-only';
import type { PoolClient } from 'pg';
import type { DataAccess } from './access-context';
import { hasPermission } from '@/lib/management/permissions';
import { parseAuditInput,validateAuditConfirmation } from '@/lib/management/shift-audits';
import { readShiftSnapshot } from './shift-audits';
import { ShiftRequestError,shiftRequestHash,readShiftReceipt,writeShiftReceipt } from './shift-report-requests';
import {queueReportTelegram,shiftTelegramAttachments} from './report-telegram';
type Database=Pick<PoolClient,'query'>;
export async function readShiftAuditSnapshot(client:Database,id:string) {
  const report=(await client.query('SELECT payload,status,app_snapshot FROM himoto.management_shift_reports WHERE id=$1',[id])).rows[0];
  if(!report||report.status!=='submitted')throw new ShiftRequestError('PGD cần chốt kiểm kê trước khi đối soát.',409);
  return readShiftSnapshot(client,report);
}
export async function saveShiftAudit(client:Database,actor:Omit<DataAccess,'operation'>,id:string,raw:{input:unknown;revision:number;report_revision:number;status:string;fingerprint:string},key:string) {
  if(!hasPermission(actor,'shift.review'))throw new ShiftRequestError('Chỉ tài khoản được cấp quyền KTNB mới được đối soát.',403);
  const input=parseAuditInput(raw.input);
  if(!Number.isSafeInteger(raw.revision)||raw.revision<0||!Number.isSafeInteger(raw.report_revision)||raw.report_revision<1||!['draft','confirmed'].includes(raw.status)||typeof raw.fingerprint!=='string')throw new ShiftRequestError('Phiên bản đối soát không hợp lệ.');
  const hash=shiftRequestHash(JSON.stringify({kind:'audit',actor:actor.id,id,revision:raw.revision,report_revision:raw.report_revision,input,status:raw.status,fingerprint:raw.fingerprint}));
  const receipt=await readShiftReceipt(client,key,actor.id,hash);if(receipt)return receipt;
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
    if(raw.status==='confirmed')await queueReportTelegram(client,`shift-audit:${id}`,Number(report.store_id),`KTNB ĐỐI SOÁT CA · PGD #${report.store_id}\nNgày: ${report.payload.date}\nNgười xác nhận: ${reviewerName}\nKết quả: ${result}`,report.payload.ownership_report?'ownership_new':'store',await shiftTelegramAttachments(client,Number(id),'audit'));
    await writeShiftReceipt(client,key,actor.id,Number(report.store_id),hash,data);

    return data;
}

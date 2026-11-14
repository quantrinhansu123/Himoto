import 'server-only';
import type { PoolClient } from 'pg';
import type { DataAccess } from './access-context';
import { hasPermission } from '@/lib/management/permissions';
import { parseShiftInput,type ShiftReport } from '@/lib/management/shift-reports';
import { ShiftRequestError,shiftRequestHash,readShiftReceipt,writeShiftReceipt } from './shift-report-requests';
import { readShiftSnapshot } from './shift-audits';
import { readOwnershipReport } from './ownership-report';
import { ownershipReportText,validateOwnershipSubmission } from '@/lib/management/ownership-report';
import { queueReportTelegram } from './report-telegram';
type Database=Pick<PoolClient,'query'>;
export async function listShiftReports(client:Database,store:string|null,date:string|null,id?:number,all=false):Promise<ShiftReport[]> {
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new ShiftRequestError('Ngày báo cáo không hợp lệ.');
  if(store&&!/^[1-9]\d*$/.test(store))throw new ShiftRequestError('PGD không hợp lệ.');
    const result = await client.query(`SELECT r.id,r.payload,r.status,r.revision,r.updated_at,r.app_snapshot,s.store_name,COALESCE(u.name,'Nhân sự') AS created_by_name,
      (SELECT jsonb_build_object('status',n.status,'message_id',n.message_id,'error_code',n.error_code) FROM himoto.management_report_deliveries n WHERE n.delivery_key='shift:'||r.id::text) AS telegram,
      ARRAY(SELECT p.slot FROM himoto.management_shift_photos p WHERE p.report_id=r.id) AS legacy_photos,
      ARRAY(SELECT p.slot FROM himoto.management_shift_photos p WHERE p.report_id=r.id UNION SELECT m.category FROM himoto.management_shift_media m WHERE m.report_id=r.id AND m.stage='pgd' AND m.mime_type LIKE 'image/%') AS photos,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'category',m.category,'stage',m.stage,'mime_type',m.mime_type,'filename',m.filename,
        'url','/api/auth/shift-reports/'||r.id||'/media/'||m.id) ORDER BY m.created_at,m.id) FROM himoto.management_shift_media m WHERE m.report_id=r.id),'[]'::jsonb) AS media,
      CASE WHEN a.report_id IS NOT NULL THEN jsonb_build_object('input',a.input,'snapshot',a.app_snapshot,'status',a.status,'result',a.result,'revision',a.revision,'reviewer_name',COALESCE(a.reviewer_name,reviewer.name,'KTNB'),'updated_at',a.updated_at,'confirmed_at',a.confirmed_at) END AS audit
      FROM himoto.management_shift_reports r JOIN himoto.stores s ON s.id=r.store_id LEFT JOIN himoto.users u ON u.id=r.created_by
      LEFT JOIN himoto.management_shift_audits a ON a.report_id=r.id LEFT JOIN himoto.users reviewer ON reviewer.id=a.reviewer_id
      WHERE ($1::bigint IS NULL OR r.store_id=$1) AND ($2::date IS NULL OR r.report_date=$2) AND ($3::bigint IS NULL OR r.id=$3) ORDER BY r.report_date DESC,r.id DESC${all?'':' LIMIT 100'}`, [store || null,date||null,id??null]);
  return result.rows.map(r=>({...r,id:Number(r.id)}));
}

// Caller owns the scoped transaction. Web and mobile execute this same domain.
export async function saveShiftReport(client:Database,actor:Omit<DataAccess,'operation'>,raw:{payload:unknown;id?:number;revision?:number;status:string},requestId:string|null) {
  if(!hasPermission(actor,'contracts.draft')&&!hasPermission(actor,'finance.write'))throw new ShiftRequestError('Không có quyền lập báo cáo.',403);
  const input=parseShiftInput(raw.payload);
  if(!['draft','submitted'].includes(raw.status)||(raw.id!=null&&(!Number.isSafeInteger(raw.id)||raw.id<=0||!Number.isSafeInteger(raw.revision))))throw new ShiftRequestError('Báo cáo không hợp lệ.');
  if(!actor.scope_all&&input.store_id!==actor.store_id)throw new ShiftRequestError('PGD nằm ngoài phạm vi được phân công.',403);
  const hash=shiftRequestHash(JSON.stringify({actor:actor.id,id:raw.id??null,revision:raw.revision??null,input,status:raw.status}));
  const receipt=await readShiftReceipt(client,requestId,actor.id,hash);if(receipt)return receipt;
    if (!(await client.query('SELECT id FROM himoto.stores WHERE id=$1', [input.store_id])).rowCount) throw new ShiftRequestError('PGD không tồn tại.');
    if (raw.id != null) {
      const existing = (await client.query('SELECT * FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE', [raw.id])).rows[0];
      if (!existing || existing.status !== 'draft' || existing.revision !== raw.revision || Number(existing.store_id) !== input.store_id || existing.payload.date !== input.date) {
        throw new ShiftRequestError('Báo cáo đã thay đổi hoặc đã chốt. Mở lại từ danh sách để kiểm tra.',409);
      }
    }
    if (raw.status === 'submitted' && !input.electricity_off) throw new ShiftRequestError('Xác nhận đã tắt thiết bị điện trước khi chốt.');
    if(raw.status==='submitted'&&input.ownership_report){
      validateOwnershipSubmission(input.ownership_report);
      const fresh=await readOwnershipReport(client,input.store_id,input.date);
      input.ownership_report={...fresh,values:input.ownership_report.values,manual:input.ownership_report.manual};
    }

    const result = raw.id != null
      ? await client.query('UPDATE himoto.management_shift_reports SET payload=$1,status=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,revision', [input, raw.status, raw.id])
      : await client.query('INSERT INTO himoto.management_shift_reports(store_id,report_date,payload,created_by,status) VALUES($1,$2,$3,$4,$5) RETURNING id,revision', [input.store_id,input.date,input,actor.id,raw.status]);
    const saved = { id: Number(result.rows[0].id), revision: result.rows[0].revision,...(raw.status==='submitted'&&input.ownership_report?{ownership_report:input.ownership_report}:{}) };
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
      if(input.ownership_report)await queueReportTelegram(client,`shift:${saved.id}`,input.store_id,ownershipReportText(input.date,input.ownership_report),'ownership_new');
    }
    await writeShiftReceipt(client, requestId, actor.id, input.store_id, hash, saved);

    return saved;
}

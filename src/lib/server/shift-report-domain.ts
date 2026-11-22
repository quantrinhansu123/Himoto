import 'server-only';
import type { PoolClient } from 'pg';
import type { DataAccess } from './access-context';
import { hasPermission } from '@/lib/management/permissions';
import { parseShiftInput,shiftReportTypeLabel,type ShiftReport } from '@/lib/management/shift-reports';
import { ShiftRequestError,shiftRequestHash,readShiftReceipt,writeShiftReceipt } from './shift-report-requests';
import { readShiftSnapshot } from './shift-audits';
import { readOwnershipReport } from './ownership-report';
import { ownershipReportText,validateOwnershipSubmission } from '@/lib/management/ownership-report';
import { queueReportTelegram,shiftTelegramAttachments } from './report-telegram';
import { compareShiftStock,isShiftStockDay,SHIFT_STOCK_CATEGORY,type ShiftStockCapture,type ShiftStockVehicle } from '../../../shared/shift-stock-check';
import { expectedShiftStock,storedShiftStock } from './shift-stock-photos';
import { lockShiftClose } from './shift-close-lock';
import {
  buildShiftGpsAlerts, evaluateVehicleGpsSnapshot, hasGpsTable, readBranchCoords,
  stripStockCaptureForNonAdmin, type BranchCoords, type VehicleGpsSnapshotItem,
} from './gps-audit';
type Database=Pick<PoolClient,'query'>;
export async function listShiftReports(client:Database,store:string|null,date:string|null,id?:number,all=false,reportType:string|null=null,isAdmin=false):Promise<ShiftReport[]> {
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new ShiftRequestError('Ngày báo cáo không hợp lệ.');
  if(store&&!/^[1-9]\d*$/.test(store))throw new ShiftRequestError('PGD không hợp lệ.');
  if(reportType!==null&&reportType!=='mid_shift'&&reportType!=='end_shift')throw new ShiftRequestError('Loại báo cáo không hợp lệ.');
    const result = await client.query(`SELECT r.id,r.store_id,r.payload-'stock_captures'-'stock_expected'-'media_gps'-'stock_gps_audit' AS payload,r.status,r.revision,r.updated_at,r.app_snapshot,s.store_name,COALESCE(u.name,'Nhân sự') AS created_by_name,
      CASE WHEN NOT $5::boolean THEN r.payload->'stock_captures' END AS stock_captures,
      CASE WHEN $6::boolean AND NOT $5::boolean THEN r.payload->'media_gps' END AS media_gps,
      CASE WHEN $6::boolean AND NOT $5::boolean THEN r.payload->'stock_gps_audit' END AS stock_gps_audit,
      (SELECT jsonb_build_object('status',n.status,'message_id',n.message_id,'error_code',n.error_code) FROM himoto.management_report_deliveries n WHERE n.delivery_key='shift:'||r.id::text) AS telegram,
      ARRAY(SELECT p.slot FROM himoto.management_shift_photos p WHERE p.report_id=r.id) AS legacy_photos,
      ARRAY(SELECT p.slot FROM himoto.management_shift_photos p WHERE p.report_id=r.id UNION SELECT m.category FROM himoto.management_shift_media m WHERE m.report_id=r.id AND m.stage='pgd' AND m.mime_type LIKE 'image/%' AND m.category<>'${SHIFT_STOCK_CATEGORY}') AS photos,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'category',m.category,'stage',m.stage,'mime_type',m.mime_type,'filename',m.filename,
        'url','/api/auth/shift-reports/'||r.id||'/media/'||m.id) ORDER BY m.created_at,m.id) FROM himoto.management_shift_media m WHERE m.report_id=r.id AND m.category<>'${SHIFT_STOCK_CATEGORY}'),'[]'::jsonb) AS media,
      CASE WHEN a.report_id IS NOT NULL THEN jsonb_build_object('input',a.input,'snapshot',a.app_snapshot,'status',a.status,'result',a.result,'revision',a.revision,'reviewer_name',COALESCE(a.reviewer_name,reviewer.name,'KTNB'),'updated_at',a.updated_at,'confirmed_at',a.confirmed_at) END AS audit
      FROM himoto.management_shift_reports r JOIN himoto.stores s ON s.id=r.store_id LEFT JOIN himoto.users u ON u.id=r.created_by
      LEFT JOIN himoto.management_shift_audits a ON a.report_id=r.id LEFT JOIN himoto.users reviewer ON reviewer.id=a.reviewer_id
      WHERE ($1::bigint IS NULL OR r.store_id=$1) AND ($2::date IS NULL OR r.report_date=$2) AND ($3::bigint IS NULL OR r.id=$3)
      AND ($4::text IS NULL OR COALESCE(r.payload->>'report_type','end_shift')=$4)
      ORDER BY r.report_date DESC,r.id DESC${all?'':' LIMIT 100'}`, [store || null,date||null,id??null,reportType,all,isAdmin]);
  const branchMap = new Map<number, BranchCoords>();
  if (isAdmin && !all && result.rows.length > 0 && await hasGpsTable(client, 'management_attendance_locations')) {
    const storeIds = [...new Set(result.rows.map(r => Number(r.store_id)).filter(n => Number.isSafeInteger(n) && n > 0))];
    if (storeIds.length) {
      const locs = await client.query<{ store_id: string | number; latitude: string | number; longitude: string | number }>(
        'SELECT store_id, latitude, longitude FROM himoto.management_attendance_locations WHERE store_id = ANY($1::bigint[])',
        [storeIds],
      );
      for (const loc of locs.rows) {
        const lat = Number(loc.latitude), lng = Number(loc.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) branchMap.set(Number(loc.store_id), { latitude: lat, longitude: lng });
      }
    }
  }
  const rows: ShiftReport[] = [];
  for (const { store_id, stock_captures, media_gps, stock_gps_audit, ...r } of result.rows) {
    const rawCaptures = Array.isArray(stock_captures) ? (stock_captures as ShiftStockCapture[]) : undefined;
    let gpsAlerts = undefined;
    if (isAdmin && !all) {
      const branch = branchMap.get(Number(store_id)) ?? null;
      let liveVehicles: VehicleGpsSnapshotItem[] | undefined;
      if (id != null && r.status === 'draft' && (r.payload?.report_type ?? 'end_shift') === 'end_shift' && await hasGpsTable(client, 'gps_devices')) {
        const hasStockFn = (await client.query<{ ok: boolean }>(`SELECT to_regclass('himoto.vehicles') IS NOT NULL AND to_regprocedure('himoto.vehicle_rental_blockers(bigint[])') IS NOT NULL AS ok`)).rows[0]?.ok;
        if (hasStockFn) {
          const expected = await expectedShiftStock(client, Number(store_id), {});
          liveVehicles = await evaluateVehicleGpsSnapshot(client, expected, branch);
        }
      }
      gpsAlerts = buildShiftGpsAlerts({ stock_captures: rawCaptures, media_gps, stock_gps_audit }, branch, liveVehicles);
    }
    const visibleCaptures = rawCaptures
      ? (isAdmin ? rawCaptures : rawCaptures.map(stripStockCaptureForNonAdmin))
      : undefined;
    rows.push({
      ...r,
      id: Number(r.id),
      ...(visibleCaptures ? { stock_captures: visibleCaptures } : {}),
      ...(isAdmin && gpsAlerts ? { gps_alerts: gpsAlerts } : {}),
    });
  }
  return rows;
}

// Caller owns the scoped transaction. Web and mobile execute this same domain.
export async function saveShiftReport(client:Database,actor:Omit<DataAccess,'operation'>,raw:{payload:unknown;id?:number;revision?:number;status:string},requestId:string|null) {
  if(!hasPermission(actor,'contracts.draft')&&!hasPermission(actor,'finance.write'))throw new ShiftRequestError('Không có quyền lập báo cáo.',403);
  const input=parseShiftInput(raw.payload);
  if(!['draft','submitted'].includes(raw.status)||(raw.id!=null&&(!Number.isSafeInteger(raw.id)||raw.id<=0||!Number.isSafeInteger(raw.revision))))throw new ShiftRequestError('Báo cáo không hợp lệ.');
  if(raw.status==='submitted'&&input.draft_missing?.length)throw new ShiftRequestError('Bổ sung các mục còn thiếu trong bản nháp trước khi chốt.',422,'SHIFT_FIELDS_MISSING');
  if(!actor.scope_all&&input.store_id!==actor.store_id)throw new ShiftRequestError('PGD nằm ngoài phạm vi được phân công.',403);
  const hash=shiftRequestHash(JSON.stringify({actor:actor.id,id:raw.id??null,revision:raw.revision??null,input,status:raw.status}));
  const receipt=await readShiftReceipt(client,requestId,actor.id,hash);if(receipt)return receipt;
  if (raw.status === 'submitted' && (input.report_type ?? 'end_shift') === 'end_shift') {
    await lockShiftClose(client, input.store_id, input.date);
  }
    if (!(await client.query('SELECT id FROM himoto.stores WHERE id=$1', [input.store_id])).rowCount) throw new ShiftRequestError('PGD không tồn tại.');
    let stockCaptures = storedShiftStock({});
    let hasStockEvidence = false;
    let savedPayload:Record<string,unknown>={};
    let priorSnapshot;
    if (raw.id != null) {
      const existing = (await client.query('SELECT * FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE', [raw.id])).rows[0];
      if (!existing || existing.status !== 'draft' || existing.revision !== raw.revision || Number(existing.store_id) !== input.store_id || existing.payload.date !== input.date) {
        throw new ShiftRequestError('Báo cáo đã thay đổi hoặc đã chốt. Mở lại từ danh sách để kiểm tra.',409);
      }
      if ((existing.payload.report_type ?? 'end_shift') !== (input.report_type ?? 'end_shift')) {
        throw new ShiftRequestError('Loại báo cáo đã lưu không thể thay đổi.', 409);
      }
      stockCaptures = storedShiftStock(existing.payload);
      hasStockEvidence = existing.payload.stock_captures !== undefined;
      savedPayload=existing.payload;
      priorSnapshot=existing.app_snapshot;
    }
    if (raw.status === 'submitted' && !input.electricity_off) throw new ShiftRequestError('Xác nhận đã tắt thiết bị điện trước khi chốt.');
    const stockApplies = (input.report_type ?? 'end_shift') === 'end_shift' &&
      (isShiftStockDay(input.date) || hasStockEvidence);
    const verifyStock = raw.status === 'submitted' && stockApplies;
    let expectedForAudit: ShiftStockVehicle[] | null = null;
    if (stockApplies) input.vehicles = stockCaptures.length;
    if (verifyStock) {
      const expected = await expectedShiftStock(client, input.store_id, savedPayload);
      const {missing,unexpected} = compareShiftStock(expected, stockCaptures);
      if (missing.length || unexpected.length) {
        throw new ShiftRequestError(`Còn ${missing.length} xe thiếu ảnh, ${unexpected.length} xe đã chụp lệch kho. Mở Kiểm kê xe bằng ảnh để xử lý.`, 422, 'SHIFT_STOCK_INCOMPLETE');
      }
      input.vehicles = expected.length;
      expectedForAudit = expected;
    }
    if(raw.status==='submitted'&&input.ownership_report){
      validateOwnershipSubmission(input.ownership_report);
      const fresh=await readOwnershipReport(client,input.store_id,input.date);
      input.ownership_report={...fresh,values:input.ownership_report.values,manual:input.ownership_report.manual};
    }

    let stockGpsAudit: VehicleGpsSnapshotItem[] | undefined;
    if (raw.status === 'submitted' && (input.report_type ?? 'end_shift') === 'end_shift' && await hasGpsTable(client, 'gps_devices')) {
      const branch = await readBranchCoords(client, input.store_id);
      if (!expectedForAudit) {
        const hasStockFn = (await client.query<{ ok: boolean }>(`SELECT to_regclass('himoto.vehicles') IS NOT NULL AND to_regprocedure('himoto.vehicle_rental_blockers(bigint[])') IS NOT NULL AS ok`)).rows[0]?.ok;
        if (hasStockFn) expectedForAudit = await expectedShiftStock(client, input.store_id, savedPayload);
      }
      if (expectedForAudit?.length) {
        stockGpsAudit = await evaluateVehicleGpsSnapshot(client, expectedForAudit, branch);
      }
    }

    const payload = {
      ...(stockApplies ? {
        ...input,
        stock_captures: stockCaptures,
        ...(savedPayload.stock_expected !== undefined ? { stock_expected: savedPayload.stock_expected } : {}),
      } : input),
      ...(savedPayload.media_gps !== undefined ? { media_gps: savedPayload.media_gps } : {}),
      ...(stockGpsAudit !== undefined ? { stock_gps_audit: stockGpsAudit }
        : savedPayload.stock_gps_audit !== undefined ? { stock_gps_audit: savedPayload.stock_gps_audit } : {}),
    };
    const result = raw.id != null
      ? await client.query('UPDATE himoto.management_shift_reports SET payload=$1,status=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,revision', [payload, raw.status, raw.id])
      : await client.query('INSERT INTO himoto.management_shift_reports(store_id,report_date,payload,created_by,status) VALUES($1,$2,$3,$4,$5) RETURNING id,revision', [input.store_id,input.date,payload,actor.id,raw.status]);
    const saved = { id: Number(result.rows[0].id), revision: result.rows[0].revision,
      ...(stockApplies?{vehicles:input.vehicles}:{}),
      ...(raw.status==='submitted'&&input.ownership_report?{ownership_report:input.ownership_report}:{}) };
    if(raw.status==='submitted'){
      await client.query('SAVEPOINT shift_snapshot');
      try{
        const snapshot=(savedPayload.stock_expected!==undefined||!isShiftStockDay(input.date))&&priorSnapshot
          ? priorSnapshot : await readShiftSnapshot(client,{payload:input},true);
        await client.query('UPDATE himoto.management_shift_reports SET app_snapshot=$2,submitted_at=now() WHERE id=$1',[saved.id,snapshot]);
      }catch{
        // A temporary analytics outage must not undo the PGD's verified report
        // and evidence. KTNB will see that no historical app snapshot is available.
        await client.query('ROLLBACK TO SAVEPOINT shift_snapshot');
        await client.query('UPDATE himoto.management_shift_reports SET submitted_at=now(),app_snapshot=NULL WHERE id=$1',[saved.id]);
      }
      await client.query('RELEASE SAVEPOINT shift_snapshot');
      const text=input.ownership_report?ownershipReportText(input.date,input.ownership_report):`BÁO CÁO ${shiftReportTypeLabel(input.report_type).toUpperCase()} · PGD #${input.store_id}\nNgày: ${input.date}\nNhân sự: ${input.staff}\nXe tại cơ sở: ${input.vehicles}\nPin: ${input.batteries}\nTiền mặt: ${input.cash.toLocaleString('vi-VN')} đ\nTK cá nhân: ${input.personal.toLocaleString('vi-VN')} đ\nTK công ty: ${input.company.toLocaleString('vi-VN')} đ\n${input.notes}`.slice(0,3900);
      await queueReportTelegram(client,`shift:${saved.id}`,input.store_id,text,input.ownership_report?'ownership_new':'store',await shiftTelegramAttachments(client,saved.id,'pgd'));
    }
    await writeShiftReceipt(client, requestId, actor.id, input.store_id, hash, saved);

    return saved;
}

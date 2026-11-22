import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { hasPermission } from '@/lib/management/permissions';
import type { DataAccess } from './access-context';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { reportTelegramSettings } from './report-telegram';
import { telegramBotIdentity, type DeliveryTarget } from './telegram-retractions';
import { ShiftRequestError } from './shift-report-requests';
import { storedShiftStock } from './shift-stock-photos';

type Database = Pick<PoolClient, 'query'>;
type Actor = Omit<DataAccess, 'operation'>;
export type ReopenRequest = {
  request_id: string;
  actor_id: number;
  revision: number;
  reason: string;
  manual: boolean;
  state: 'pending' | 'running' | 'failed';
  attempt_id?: string;
  attempt_at?: string;
  error?: string;
};
const keysFor = (id: number) => [`shift:${id}`, `shift-audit:${id}`];
const canWrite = (actor: Actor) => hasPermission(actor, 'contracts.draft') || hasPermission(actor, 'finance.write');
const bad = (message: string, status = 409): never => { throw new ShiftRequestError(message, status); };
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export async function readShiftReopen(db: Database, actor: Actor, id: number) {
  const report = (await db.query(`SELECT r.status,r.revision,r.store_id,r.reopen_request,
    (SELECT status FROM himoto.management_shift_audits WHERE report_id=r.id) AS audit_status
    FROM himoto.management_shift_reports r WHERE r.id=$1`, [id])).rows[0];
  if (!report) return bad('Không tìm thấy báo cáo trong phạm vi được giao.', 404);
  const finance = hasPermission(actor, 'finance.write');
  const allowed = canWrite(actor) && (actor.scope_all && !('cross_store_read' in actor && actor.cross_store_read) || actor.store_id === Number(report.store_id));
  const blocked = !allowed ? 'Tài khoản chưa có quyền mở lại báo cáo ở PGD này.'
    : report.audit_status === 'confirmed' && !finance && !hasPermission(actor, 'shift.review')
      ? 'Báo cáo đã được KTNB xác nhận. Cần quản trị hoặc kế toán mở lại để đối soát lại.' : '';
  const request = report.reopen_request as ReopenRequest | null;
  const history = (await db.query(`SELECT h.revision,h.reason,h.reopened_at,h.manual_retraction,
    COALESCE(u.name,'') AS actor FROM himoto.management_shift_report_revisions h
    LEFT JOIN himoto.users u ON u.id=h.actor_id WHERE h.report_id=$1 ORDER BY revision DESC LIMIT 20`, [id])).rows;
  return { status: String(report.status), revision: Number(report.revision), can_manual: allowed && finance,
    blocked_reason: blocked, history,
    request: request ? { state: request.state, reason: request.reason, error: request.error,
      retry_at: request.attempt_at ? new Date(Date.parse(request.attempt_at) + 120_000).toISOString() : null } : null };
}

export async function queueShiftReopen(db: Database, actor: Actor, id: number, raw: unknown): Promise<string | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('Thông tin mở lại báo cáo không hợp lệ.', 400);
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some(k => !['request_id','revision','reason','manual'].includes(k))
    || typeof input.request_id !== 'string' || !uuid.test(input.request_id) || !Number.isSafeInteger(input.revision)
    || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500 || typeof input.manual !== 'boolean') {
    return bad('Nhập lý do mở lại báo cáo, tối đa 500 ký tự, và tải đúng phiên bản báo cáo.', 400);
  }
  const report = (await db.query(`SELECT id,store_id,status,revision,reopen_request,payload
    FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE`, [id])).rows[0];
  if (!report || !actor.scope_all && actor.store_id !== Number(report.store_id)) return bad('Báo cáo nằm ngoài phạm vi PGD được giao.', 404);
  if (!canWrite(actor)) return bad('Tài khoản chưa có quyền mở lại báo cáo.', 403);
  if (input.manual && !hasPermission(actor, 'finance.write')) return bad('Kế toán hoặc quản trị viên cần xác nhận thu hồi thủ công.', 403);
  if (report.status !== 'submitted') {
    if ((await db.query('SELECT 1 FROM himoto.management_shift_report_revisions WHERE report_id=$1 AND request_id=$2 AND actor_id=$3',
      [id,input.request_id,actor.id])).rowCount) return null;
    return bad('Báo cáo đang là bản nháp. Mở báo cáo để tiếp tục chỉnh sửa.');
  }
  if (Number(report.revision) !== input.revision) return bad('Báo cáo đã thay đổi. Tải lại trước khi mở.');
  if ((report.payload.report_type ?? 'end_shift') !== 'end_shift') return bad('Thao tác này dùng cho báo cáo Hết ca.');
  const audit=(await db.query('SELECT status FROM himoto.management_shift_audits WHERE report_id=$1',[id])).rows[0];
  if (audit?.status==='confirmed' && !hasPermission(actor,'shift.review') && !hasPermission(actor,'finance.write')) {
    return bad('Báo cáo đã được KTNB xác nhận. Cần quản trị hoặc kế toán mở lại để đối soát lại.',403);
  }
  const previous=report.reopen_request as ReopenRequest | null;
  if (previous && previous.state !== 'failed') return previous.request_id;
  const keys=keysFor(id);
  const deliveries=(await db.query(`SELECT status,updated_at FROM himoto.management_report_deliveries
    WHERE delivery_key=ANY($1::text[]) ORDER BY delivery_key FOR UPDATE`,[keys])).rows;
  const active=deliveries.some(row=>row.status==='sending' && Date.parse(row.updated_at)>Date.now()-360_000);
  if (active) return bad('Báo cáo đang gửi Telegram. Chờ phản hồi trước khi thu hồi và mở lại.');
  if (!input.manual && deliveries.some(row=>['sending','unknown'].includes(row.status))) {
    return bad('Kết quả gửi chưa rõ. Cần quản trị nhóm kiểm tra và gỡ tin, sau đó kế toán xác nhận thu hồi thủ công.');
  }
  const pending:ReopenRequest={request_id:input.request_id.toLowerCase(),actor_id:actor.id,revision:Number(report.revision),
    reason:input.reason.trim(),manual:input.manual,state:'pending'};
  await db.query(`UPDATE himoto.management_report_deliveries SET suppressed_at=COALESCE(suppressed_at,now())
    WHERE delivery_key=ANY($1::text[])`,[keys]);
  await db.query('UPDATE himoto.management_shift_reports SET reopen_request=$2::jsonb WHERE id=$1',[id,JSON.stringify(pending)]);
  return pending.request_id;
}

type Delivery = {delivery_key:string;route:string;store_id:string|number;created_at:Date;delivery_target:DeliveryTarget|null;
  message_id:string|number|null;media_ids:number[];text_sent:boolean;status:string;retracted_at:Date|null};
async function retractDelivery(db: Database, row: Delivery, manual: boolean, send: typeof fetch) {
  if (row.retracted_at) return;
  const ids=[...(row.media_ids||[]),...(row.message_id ? [Number(row.message_id)] : [])];
  if (!manual && (row.status==='sent' || row.text_sent) && !row.message_id) {
    return bad('Tin cũ thiếu mã tin nhắn. Cần thu hồi thủ công trong nhóm.');
  }
  if (!manual && ids.length) {
    if (ids.length>100 || ids.some(id=>!Number.isSafeInteger(id)||id<=0) || new Set(ids).size!==ids.length) {
      return bad('Lịch sử Telegram thiếu mã tin hợp lệ. Cần thu hồi thủ công trong nhóm.');
    }
    const {settings,target:configured}=await reportTelegramSettings(db,row.route,Number(row.store_id));
    if (!settings?.bot_cipher) return bad('Chưa cấu hình bot Telegram. Nhờ quản trị kiểm tra hoặc thu hồi thủ công.');
    const {token}=openIntegrationSecret<{token:string}>(settings.bot_cipher);
    const botId=telegramBotIdentity(token);
    const created=Date.parse(String(row.created_at));
    const canUseLegacy=configured?.enabled && configured.chat_id && [settings.updated_at,configured.updated_at]
      .every(at=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=created);
    const target=row.delivery_target || (canUseLegacy ? {chat_id:String(configured.chat_id),bot_id:botId,started_at:new Date(created).toISOString()} : null);
    if (!target || !/^-[0-9]{5,18}$/.test(target.chat_id) || target.bot_id!==botId) {
      return bad('Chưa xác minh được nhóm nhận hoặc bot cũ. Nhờ quản trị nhóm thu hồi thủ công.');
    }
    const started=Date.parse(target.started_at);
    if (!Number.isFinite(started) || started+48*3_600_000<=Date.now()+30_000) {
      return bad('Tin đã sát hoặc quá giới hạn 48 giờ của bot Telegram. Nhờ quản trị nhóm thu hồi thủ công.');
    }
    const response=await send(`https://api.telegram.org/bot${token}/deleteMessages`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:target.chat_id,message_ids:ids}),signal:AbortSignal.timeout(15_000),redirect:'error',cache:'no-store',
    });
    const result=await response.json().catch(()=>null);
    if (!response.ok || result?.ok!==true || result.result!==true) {
      return bad(response.status===429?'Telegram đang giới hạn thao tác. Chờ một lúc rồi thử thu hồi lại.':
        'Telegram chưa xác nhận thu hồi. Kiểm tra quyền bot và trạng thái trong nhóm rồi thử lại hoặc xác nhận thu hồi thủ công.');
    }
  }
  await db.query('UPDATE himoto.management_report_deliveries SET retracted_at=now() WHERE delivery_key=$1 AND suppressed_at IS NOT NULL',[row.delivery_key]);
}

/** The web request commits suppression before any external delete. Only one lease may finish reopening. */
export async function runShiftReopen(id: number, requestId: string, database=ownerDatabase, send:typeof fetch=fetch) {
  const attempt=randomUUID();
  const claimed=(await database.query(`UPDATE himoto.management_shift_reports
    SET reopen_request=reopen_request||jsonb_build_object('state','running','attempt_id',$3::text,'attempt_at',now())
    WHERE id=$1 AND status='submitted' AND reopen_request->>'request_id'=$2
      AND (reopen_request->>'state'='pending' OR reopen_request->>'state'='running'
        AND (reopen_request->>'attempt_at')::timestamptz<now()-interval '2 minutes')
    RETURNING reopen_request`,[id,requestId,attempt])).rows[0];
  if (!claimed) return;
  const request=claimed.reopen_request as ReopenRequest;
  const keys=keysFor(id);
  try {
    const rows=(await database.query<Delivery>(`SELECT delivery_key,store_id,route,status,created_at,delivery_target,media_ids,
      message_id,text_sent,retracted_at FROM himoto.management_report_deliveries
      WHERE delivery_key=ANY($1::text[]) AND suppressed_at IS NOT NULL ORDER BY delivery_key`,[keys])).rows;
    for(const row of rows) await retractDelivery(database,row,request.manual,send);

    const client=await database.connect();
    try{
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      const report=(await client.query(`SELECT * FROM himoto.management_shift_reports WHERE id=$1
        AND status='submitted' AND reopen_request->>'attempt_id'=$2 FOR UPDATE`,[id,attempt])).rows[0];
      if (!report) { await client.query('ROLLBACK'); return; }
      const unresolved=await client.query(`SELECT 1 FROM himoto.management_report_deliveries
        WHERE delivery_key=ANY($1::text[]) AND retracted_at IS NULL`,[keys]);
      if (unresolved.rowCount || Number(report.revision)!==request.revision) {
        return bad('Báo cáo hoặc trạng thái Telegram đã thay đổi. Tải lại để đối chiếu.');
      }
      await client.query(`INSERT INTO himoto.management_shift_report_revisions
        (report_id,revision,store_id,request_id,actor_id,reason,manual_retraction,report,audit)
        SELECT r.id,r.revision,r.store_id,$2,$3,$4,$5,to_jsonb(r)-'reopen_request',
          (SELECT to_jsonb(a) FROM himoto.management_shift_audits a WHERE a.report_id=r.id)
        FROM himoto.management_shift_reports r WHERE r.id=$1`,
        [id,requestId,request.actor_id,request.reason,request.manual]);
      // Preserve the submitted inventory roster so a later rental/return does not change this report's context.
      const payload=report.payload;
      if (payload.stock_captures !== undefined && payload.stock_expected === undefined) {
        payload.stock_expected=storedShiftStock(payload).map(row=>row.vehicle);
      }
      await client.query(`UPDATE himoto.management_report_deliveries
        SET delivery_key=delivery_key||':previous:'||$2::text WHERE delivery_key=ANY($1::text[])`,[keys,request.revision]);
      await client.query(`UPDATE himoto.management_shift_audits SET status='draft',result='pending',
        confirmed_at=NULL,revision=revision+1,updated_at=now() WHERE report_id=$1`,[id]);
      await client.query(`UPDATE himoto.management_shift_reports SET status='draft',revision=revision+1,
        payload=$2::jsonb,updated_at=now(),reopen_request=NULL WHERE id=$1`,[id,JSON.stringify(payload)]);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { client.release(); }
  } catch(error) {
    const message=error instanceof ShiftRequestError ? error.message :
      'Chưa xác nhận xong việc thu hồi. Kiểm tra nhóm rồi thử lại. Các tin đã gỡ được giữ kết quả.';
    await database.query(`UPDATE himoto.management_shift_reports
      SET reopen_request=reopen_request||jsonb_build_object('state','failed','error',$3::text)
      WHERE id=$1 AND reopen_request->>'attempt_id'=$2`,[id,attempt,message]);
  }
}

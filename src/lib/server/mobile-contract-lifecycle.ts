import 'server-only';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import { hasPermission } from '@/lib/management/permissions';
import { canHoldContract, canMarkBadDebtContract, lifecycleActionLabel, localLifecycleTime, resumedHoldEnd, resumeInstallmentPlan, validLifecycleTime, type ContractLifecycleAction, type ContractLifecycleContext } from '@/lib/management/contract-lifecycle';
import { addRentalMonths, installmentSchedule, parseInstallmentPlan } from '@/lib/management/contract-billing';
import { readContractLifecycle, applyContractLifecycle, parseContractLifecycle, ContractLifecycleError } from './contract-lifecycle';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { MobileError } from './mobile-session';
import { mobileContractId } from './mobile-contracts';
import { mapDraftInventoryRow } from './mobile-draft-lookups';
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from './mobile-writes';
import { mobileLifecycleActions,isMobileLifecycleContext, isMobileLifecyclePreview, isMobileLifecycleResult, isMobileLifecycleInventory, type MobileLifecycleContext, type MobileLifecycleResult } from '../../../shared/mobile-contract-lifecycle';

export function requireMobileLifecycle(user: SessionUser, action?: string) {
  if (!hasPermission(user, 'contracts.read') || action && !(hasPermission(user, 'contracts.return') || action === 'settle' && hasPermission(user, 'finance.write'))) throw new MobileError('Tài khoản không có quyền thao tác tình trạng hợp đồng.', 403, 'FORBIDDEN');
}
async function transaction<T>(user: SessionUser, action: string | undefined, task: (client: PoolClient) => Promise<T>, operation = '') {
  requireMobileLifecycle(user, action);
  return withMobileData(user, operation || action || '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(action ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='30s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const result = await task(client); await client.query('COMMIT'); return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ContractLifecycleError) throw new MobileError(error.message, error.status, error.status === 409 ? 'LIFECYCLE_CONFLICT' : 'INVALID_LIFECYCLE');
      if (error && typeof error === 'object' && 'code' in error && ['42501', 'P0001', '55P03', '40P01', '23505'].includes(String(error.code))) throw new MobileError('Xe hoặc hợp đồng đã thay đổi, đang được xử lý hoặc trùng lịch. Tải lại tình trạng và chọn xe đang rảnh.', 409, 'LIFECYCLE_CONFLICT');
      throw error;
    } finally { client.release(); }
  });
}
async function visible(client: PoolClient, id: number) {
  const row = (await client.query(`SELECT o.id,o.xmin::text AS revision FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
  if (!row) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND'); return row;
}
function project(context: ContractLifecycleContext, user: SessionUser): MobileLifecycleContext {
  const actions: MobileLifecycleContext['actions'] = [];
  const add = (action: MobileLifecycleContext['actions'][number]['action'], enabled = true, reason = '') => {
    if (hasPermission(user, 'contracts.return') || action === 'settle' && hasPermission(user, 'finance.write')) actions.push({ action, label: lifecycleActionLabel[action], enabled, reason });
  };
  if (canMarkBadDebtContract(context)) add('mark_bad_debt');
  if (context.status === 'bad_debt' && !context.settled) add('settle', context.can_settle, context.can_settle ? '' : context.settlement_note);
  if (canHoldContract(context)) add('hold');
  if (context.status === 'reserved') { add('update_hold'); add('resume'); add('complete_hold'); }
  let suggestedResumeEnd: string | null = null;
  if (context.status === 'reserved') { try { suggestedResumeEnd = resumedHoldEnd(context, localLifecycleTime()); } catch { suggestedResumeEnd = addRentalMonths(localLifecycleTime(), 1); } }
  const result = {
    id: context.id, code: context.code, status: context.status, revision: context.revision, ownership: context.ownership, overdue: context.overdue,
    items: context.items.map(i => ({ id: i.id, vehicleId: i.vehicle_id, name: i.name, license: i.license, startsAt: i.rent_at, endsAt: i.return_at, completedAt: i.completed_at, reconciled: i.return_reconciled === true })),
    allReturned: context.all_returned, returnedCount: context.returned_count, totalAmount: context.total_amount, rentalPaid: context.paid_amount, remaining: context.remaining,
    depositHeld: context.deposit_held, overpayment: context.overpayment, settled: context.settled, settlementNote: context.settlement_note,
    heldAt: context.held_at, holdUntil: context.hold_until || null, holdExpired: context.hold_expired === true, resumeVehicleCount: context.resume_vehicle_count,
    completedFromHold: context.completed_from_hold === true, waivedAmount: context.waived_amount ?? null, suggestedResumeEnd,
    actions, events: context.events.map(e => ({ action: e.action, label: lifecycleActionLabel[e.action as ContractLifecycleAction] || e.action, at: e.at, recordedAt: e.recorded_at, actorId: e.actor_id, actorName: e.actor_name, note: e.note, from: e.from, to: e.to })),
  };
  if (!isMobileLifecycleContext(result)) throw new MobileError('Tình trạng hợp đồng cần đối chiếu dữ liệu trên web.', 409, 'DATA_REVIEW_REQUIRED'); return result;
}
export async function readMobileLifecycle(user: SessionUser, value: string) {
  const id = mobileContractId(value); return transaction(user, undefined, async client => { await visible(client, id); return project(await readContractLifecycle(client, id), user); });
}
export async function readMobileLifecycleInventory(user: SessionUser, value: string, params: URLSearchParams) {
  const id = mobileContractId(value); requireMobileLifecycle(user, 'resume');
  if (!hasPermission(user, 'vehicles.read')) throw new MobileError('Không có quyền chọn xe thuê lại.', 403, 'FORBIDDEN');
  for (const k of params.keys()) if (!['search', 'store', 'page'].includes(k) || params.getAll(k).length !== 1) throw new MobileError('Bộ lọc kho xe chưa hợp lệ.');
  const search = (params.get('search') || '').trim(), store = params.get('store') || '', page = params.get('page') || '1';
  if (search.length > 120 || store && !/^[1-9]\d{0,14}$/.test(store) || !/^[1-9]\d{0,3}$/.test(page)) throw new MobileError('Bộ lọc kho xe chưa hợp lệ.');
  return transaction(user, undefined, async client => {
    await visible(client, id);
    const rows = (await client.query(`SELECT stock.id,stock.name,stock.license,stock.type,stock.status,stock.store_id,stock.store_name,v.brand,v.color,v.year
      FROM himoto.vehicle_inventory() stock JOIN himoto.vehicles v ON v.id=stock.id
      WHERE stock.store_id>0 AND v.deleted_at IS NULL AND ($1::bigint IS NULL OR stock.store_id=$1)
        AND ($2='' OR stock.name ILIKE $3 OR stock.license ILIKE $3)
      ORDER BY stock.store_name,stock.license,stock.id LIMIT 21 OFFSET $4`, [store || null, search, `%${search.replace(/[\\%_]/g, '\\$&')}%`, (Number(page) - 1) * 20])).rows;
    const stores = (await client.query('SELECT id,store_name FROM himoto.store_directory() ORDER BY store_name,id')).rows;
    const result = { page: Number(page), hasMore: rows.length > 20, rows: rows.slice(0, 20).map(mapDraftInventoryRow), stores: stores.map(s => ({ id: Number(s.id), name: String(s.store_name) })) };
    if (!isMobileLifecycleInventory(result)) throw new MobileError('Kho xe cần kiểm tra dữ liệu.', 409, 'DATA_REVIEW_REQUIRED'); return result;
  }, 'fleet_read');
}
export async function readMobileLifecyclePreview(user: SessionUser, value: string, request: NextRequest) {
  const id = mobileContractId(value), body = await mobileBody(request, 1024); requireMobileLifecycle(user, 'resume');
  if (Object.keys(body).some(k => !['at', 'resume_end'].includes(k)) || !validLifecycleTime(body.at) || body.resume_end !== undefined && !validLifecycleTime(body.resume_end)) throw new MobileError('Ngày giờ thuê lại hoặc hạn trả mới chưa hợp lệ.');
  return transaction(user, undefined, async client => {
    await visible(client, id); const context = await readContractLifecycle(client, id);
    if (context.status !== 'reserved') throw new MobileError('Hợp đồng không còn ở trạng thái bảo lưu.', 409, 'LIFECYCLE_CONFLICT');
    let plan = null, end: string;
    try {
      if (context.plan) plan = resumeInstallmentPlan(context.plan, context.held_at || '', body.at as string);
      end = String(body.resume_end || plan?.end || resumedHoldEnd(context, body.at as string));
    } catch (cause) { throw new MobileError((cause as Error).message, 409, 'LIFECYCLE_CONFLICT'); }
    if (plan && body.resume_end) plan = { ...plan, end };
    if (end <= String(body.at) || plan && !parseInstallmentPlan(plan)) throw new MobileError('Hạn trả mới chưa khớp thời gian thuê lại hoặc các kỳ đóng tiền.');
    const result = { id, revision: context.revision, at: body.at, end, totalPeriods: plan ? installmentSchedule(plan).length : 0, periods: plan ? installmentSchedule(plan).slice(0, 120).map(p => ({ dueAt: p.due_at, amount: p.amount })) : [] };
    if (!isMobileLifecyclePreview(result)) throw new MobileError('Chưa lập được lịch thuê lại.', 409, 'DATA_REVIEW_REQUIRED'); return result;
  });
}
async function result(client: PoolClient, user: SessionUser, key: string): Promise<MobileLifecycleResult | null> {
  const row = (await client.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  if (!row || !/^lifecycle\.(mark_bad_debt|settle|hold|resume|update_hold|complete_hold):[1-9]\d{0,14}$/.test(String(row.operation)) || row.resource_id == null) return null;
  requireMobileLifecycle(user, String(row.operation).split('.')[1].split(':')[0]);
  const found = { key, operation: row.operation, receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true } };
  if (!isMobileLifecycleResult(found)) throw new MobileError('Kết quả tình trạng hợp đồng cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT');
  await visible(client, found.receipt.id); return found;
}
export async function readMobileLifecycleResult(user: SessionUser, key: string) { mobileRequestKey(key); return transaction(user, undefined, async client => ({ result: await result(client, user, key) })); }
export async function writeMobileLifecycle(user: SessionUser, value: string, request: NextRequest): Promise<MobileLifecycleResult> {
  const id = mobileContractId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 16384);
  if ('request_id' in body || typeof body.action !== 'string' || !mobileLifecycleActions.includes(body.action as typeof mobileLifecycleActions[number])) throw new MobileError('Loại thao tác tình trạng hợp đồng chưa hợp lệ.');
  return transaction(user, body.action, async client => {
    await visible(client, id); const input = parseContractLifecycle({ ...body, request_id: key });
    const receipt = await idempotentMobileWrite(client, user.id, key, `lifecycle.${input.action}:${id}`, { id, input }, async () => {
      await applyContractLifecycle(client, id, user.id, input); return { id, revision: String((await visible(client, id)).revision) };
    });
    const found = await result(client, user, key); if (!found) throw new MobileError('Chưa xác nhận được thao tác. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT');
    return { ...found, receipt: { ...found.receipt, replayed: receipt.replayed } };
  });
}

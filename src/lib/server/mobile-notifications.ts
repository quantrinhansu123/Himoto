import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { SessionUser } from './management-session';
import { hasPermission } from '@/lib/management/permissions';
import { canApproveOwnershipContract, isOwnershipApprovalContract } from '@/lib/management/contract-approval';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import { readContractAttentionRows } from './management-table';
import { VEHICLE_TRANSFER_JOIN_SQL } from './vehicle-transfers';
import { EFFECTIVE_RENTAL_TYPE_SQL, VEHICLE_ORDER_SQL } from './contract-classification';
import { isMobileNotifications, isMobileNotificationList, NOTIFICATION_KINDS, type MobileNotifications, type MobileNotificationList, type MobileNotificationKind } from '../../../shared/mobile-notifications';
import { MobileError } from './mobile-session';

type Database = Pick<PoolClient, 'query'>;
export interface NotificationState { kind: MobileNotificationKind; count: number; fingerprint: string; rows: {id: number; label: string}[] }
function state(kind: MobileNotificationKind, rows: {id: number; label: string; member: string}[]): NotificationState {
  return {kind, count: rows.length, rows: rows.map(({id,label}) => ({id,label})),
    fingerprint: createHash('sha256').update(JSON.stringify(rows.map(r => r.member).sort())).digest('hex')};
}
export function contractAttentionGroups(rows:Awaited<ReturnType<typeof readContractAttentionRows>>,now=Date.now()){
  const overdue=rows.filter(r=>r.status==='overdue'||r.status==='bad_debt'||r.collection_overdue===1);
  const overdueIds=new Set(overdue.map(r=>r.id));
  const due=rows.filter(r=>{
    if(overdueIds.has(r.id)||r.billing_error||!['renting','wait_payment'].includes(r.status))return false;
    const value=String(r.billing_next_due_at||r.end_date||'');
    const at=Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?`${value}:00+07:00`:value);
    return Number.isFinite(at)&&at>now&&at<=now+24*60*60*1000;
  });
  return {due,overdue};
}
/** Same web billing projection and scoped role, in one read-only snapshot. */
export async function readNotificationState(db: Database, user: SessionUser,kinds:readonly MobileNotificationKind[]=NOTIFICATION_KINDS): Promise<NotificationState[]> {
  const result: NotificationState[] = [];
  if (kinds.includes('transfer')&&hasPermission(user, 'vehicles.read') && hasPermission(user, 'vehicles.receive')) {
    const rows = (await db.query(`SELECT v.id,v.license,v.name,pending_transfer.id AS event_id FROM himoto.vehicles v
      ${VEHICLE_TRANSFER_JOIN_SQL} WHERE v.deleted_at IS NULL AND v.status='in_transit'
      AND pending_transfer.receivable=1 AND ($1::boolean OR pending_transfer.to_store_id=$2::bigint) ORDER BY pending_transfer.id DESC`,
      [user.scope_all === true, user.store_id ?? null])).rows;
    result.push(state('transfer', rows.map(r => ({id: Number(r.id), label: String(r.license || r.name || `Xe #${r.id}`), member: `${r.id}:${r.event_id}`}))));
  }
  if (hasPermission(user, 'contracts.read')) {
    if(kinds.includes('due')||kinds.includes('overdue')){
      const now=Date.now(),rows=await readContractAttentionRows(db,now);
      const {due,overdue}=contractAttentionGroups(rows,now);
      for(const kind of ['due','overdue'] as const)if(kinds.includes(kind))result.push(state(kind,(kind==='due'?due:overdue).map(r=>({id:r.id,label:r.code||`Hợp đồng #${r.id}`,member:`${r.id}:${kind==='due'?r.billing_next_due_at||r.end_date:r.billing_overdue_at||r.end_date}`}))));
    }
    if (kinds.includes('approval')&&canApproveOwnershipContract(user)) {
      const rows = (await db.query(`SELECT o.id,o.contract_number,o.draft_reference,s.kind AS store_kind,s.store_name,${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type
        FROM himoto.orders o LEFT JOIN himoto.stores s ON s.id=o.store_id
        WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} AND o.order_status IN ('renting','overdue','wait_payment','reserved','pending','deposit_contract')
        AND (s.kind='lease_to_own' OR ${EFFECTIVE_RENTAL_TYPE_SQL} IN('ownership','ownership_cd')
          OR lower(translate(regexp_replace(normalize(COALESCE(s.store_name,''),NFD) COLLATE "C",'[̀-ͯ]','','g'),'đĐ','dD')) LIKE '%thue so huu%'
          OR lower(translate(regexp_replace(normalize(COALESCE(s.store_name,''),NFD) COLLATE "C",'[̀-ͯ]','','g'),'đĐ','dD')) LIKE '%tru so chinh%')
        AND NULLIF(o.draft_payload #>> '{management_composer,approval,at}','') IS NULL ORDER BY o.id DESC`)).rows;
      result.push(state('approval', rows.filter(isOwnershipApprovalContract).map(r => ({id: Number(r.id),
        label: String(r.contract_number || r.draft_reference || `Hợp đồng #${r.id}`), member: String(r.id)}))));
    }
  }
  return result;
}
export function withNotificationSnapshot<T>(user: SessionUser, task: (db: PoolClient) => Promise<T>) {
  return withMobileData(user, 'fleet_read', async () => {
    const db = await himotoPool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='20s'");
      const result = await task(db);
      await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  });
}
export async function readMobileNotifications(user: SessionUser): Promise<MobileNotifications> {
  const states = await withNotificationSnapshot(user, db => readNotificationState(db, user));
  const result = {groups: states.map(({kind, count}) => ({kind, count})), observedAt: new Date().toISOString()};
  if (!isMobileNotifications(result)) throw new Error('Invalid notification response');
  return result;
}
export async function readMobileNotificationList(user: SessionUser, kind: string, params: URLSearchParams): Promise<MobileNotificationList> {
  if (!NOTIFICATION_KINDS.includes(kind as MobileNotificationKind)) throw new MobileError('Không tìm thấy nhóm thông báo.',404,'NOT_FOUND');
  if ([...params.keys()].some(k => k !== 'page' || params.getAll(k).length !== 1) || !/^[1-9]\d{0,5}$/.test(params.get('page') || '1'))
    throw new MobileError('Trang thông báo không hợp lệ.');
  const states = await withNotificationSnapshot(user, db => readNotificationState(db, user,[kind as MobileNotificationKind]));
  const group = states.find(g => g.kind === kind);
  if (!group) throw new MobileError('Không có quyền xem nhóm công việc này.',403,'FORBIDDEN');
  const pages = Math.max(1, Math.ceil(group.count / 20)), page = Math.min(Number(params.get('page') || '1'), pages);
  const result = {kind: group.kind, rows: group.rows.slice((page-1)*20,page*20), total: group.count,page,pages,observedAt:new Date().toISOString()};
  if (!isMobileNotificationList(result)) throw new Error('Invalid notification list');
  return result;
}

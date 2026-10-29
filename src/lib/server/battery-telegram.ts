import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { hasPermission, type PermissionAccount } from '@/lib/management/permissions';
import type { BatteryTelegramState } from '@/lib/management/battery-telegram';
import { contractNotificationText, type NotificationPayload } from './contract-notification-content';
import { OWNERSHIP_TELEGRAM_DESTINATIONS } from '@/lib/management/telegram-destinations';
import { readBatteryWorkflow } from './battery-workflow';

type Database = Pick<PoolClient, 'query'>;
type User = PermissionAccount & { store_id?: number | null; scope_all?: boolean; name?: string };
export class BatteryTelegramError extends Error { constructor(message: string, public status = 400) { super(message); } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noticeStatus(rows: { status: string; message_ids?: unknown }[]) {
  if (!rows.length) return { status: null as string | null, message_count: 0, can_requeue: true };
  const statuses = rows.map(row => row.status);
  const message_count = rows.reduce((sum, row) => sum + (Array.isArray(row.message_ids) ? row.message_ids.length : 0), 0);
  if (statuses.some(status => status === 'unknown')) return { status: 'unknown', message_count, can_requeue: false };
  if (statuses.some(status => status === 'sending' || status === 'pending')) return { status: statuses.find(status => status === 'sending') || 'pending', message_count, can_requeue: false };
  if (statuses.every(status => status === 'sent')) return { status: 'sent', message_count, can_requeue: false };
  if (statuses.some(status => status === 'failed' || status === 'awaiting_config')) return { status: statuses.find(status => status === 'failed') || 'awaiting_config', message_count, can_requeue: true };
  return { status: statuses[0] || null, message_count, can_requeue: false };
}

function eventKey(batteryId: number, requestId: string) {
  return `battery-return:${batteryId}:${requestId}`;
}

export async function readBatteryTelegram(db: Database, batteryId: number, requestId: string, user: User) {
  if (!Number.isSafeInteger(batteryId) || batteryId <= 0 || !UUID.test(requestId)) throw new BatteryTelegramError('Mã hợp đồng pin hoặc lượt trả không hợp lệ.');
  const context = await readBatteryWorkflow(db, batteryId, false);
  const entry = context.history.find(event => event.action === 'return' && event.request_id === requestId.toLowerCase());
  if (!entry) throw new BatteryTelegramError('Không tìm thấy lượt trả pin / sạc.', 404);
  const contract = context.contract;
  const all = user.scope_all === true || user.access_role === 'admin';
  if (!all && Number(contract.store_id) !== Number(user.store_id)) throw new BatteryTelegramError('Không có quyền xem hợp đồng pin của cơ sở khác.', 403);
  const allowed = hasPermission(user, 'contracts.return') && (all || Number(contract.store_id) === Number(user.store_id));
  const store = (await db.query('SELECT id,store_name,kind FROM himoto.stores WHERE id=$1', [contract.store_id])).rows[0];
  const ownership = store?.kind === 'lease_to_own';
  const destination_label = ownership
    ? (OWNERSHIP_TELEGRAM_DESTINATIONS.find(item => item.route === 'ownership_new')?.label || 'Nhóm thuê sở hữu')
    : `Nhóm cơ sở ${store?.store_name || contract.store_name || 'của hợp đồng'}`;
  const actor = String(user.name || '').trim() || entry.actor_name || 'Chưa ghi nhận';
  const returnedAt = entry.returned_at ? (entry.returned_at.length === 16 ? `${entry.returned_at}:00+07:00` : entry.returned_at) : entry.at;
  const payload: NotificationPayload = {
    code: contract.code, customer: contract.customer_name || '—', phone: contract.customer_phone || '', store: contract.store_name || store?.store_name || '',
    actor, vehicles: '', vehicle_names: contract.battery_name || 'Pin / sạc', total: String(context.renewal_remaining || 0),
    at: new Date(entry.at).toISOString(), photos: [], deposit: contract.deposit_amount ?? null,
    return_details: { note: entry.note || '', returned_at: [returnedAt] },
  };
  const notices = (await db.query(
    `SELECT status,message_ids FROM himoto.management_contract_notifications
     WHERE battery_contract_id=$1 AND (event_key=$2 OR root_event_key=$2) ORDER BY created_at,id`,
    [batteryId, eventKey(batteryId, requestId.toLowerCase())],
  )).rows;
  const aggregate = noticeStatus(notices);
  const eligible = Number.isSafeInteger(Number(contract.store_id)) && Number(contract.store_id) > 0;
  const state: BatteryTelegramState = {
    eligible, battery_contract_id: batteryId, request_id: requestId.toLowerCase(), destination_label,
    text: contractNotificationText('battery_return', payload), status: aggregate.status, message_count: aggregate.message_count,
    can_send: eligible && allowed && (aggregate.can_requeue || !notices.length),
  };
  return { state, payload, store_id: Number(contract.store_id), allowed, ownership };
}

export async function saveBatteryTelegram(db: Database, batteryId: number, requestId: string, user: User) {
  await db.query('SELECT id FROM himoto.battery_contracts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [batteryId]);
  const read = await readBatteryTelegram(db, batteryId, requestId, user);
  if (!read.allowed) throw new BatteryTelegramError('Chỉ người có quyền trả xe tại cơ sở hợp đồng được gửi Telegram trả pin / sạc.', 403);
  if (!read.state.eligible) throw new BatteryTelegramError('Không xác định được cơ sở của hợp đồng pin.');
  if (!read.state.can_send) {
    if (['sent', 'pending', 'sending'].includes(read.state.status || '')) return read.state;
    throw new BatteryTelegramError('Không gửi lại được lượt chưa rõ kết quả. Kiểm tra nhóm Telegram trước.', 409);
  }
  const key = eventKey(batteryId, requestId.toLowerCase());
  await db.query(`INSERT INTO himoto.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status,battery_contract_id)
    VALUES ($1,NULL,$2,$3,$3,'battery_return',$4,'manual','pending',$5)
    ON CONFLICT(event_key) DO UPDATE SET status='pending',error_code=NULL,store_id=EXCLUDED.store_id,payload=EXCLUDED.payload,battery_contract_id=EXCLUDED.battery_contract_id
      WHERE management_contract_notifications.status IN ('failed','awaiting_config')`,
  [randomUUID(), read.store_id, key, JSON.stringify(read.payload), batteryId]);
  return (await readBatteryTelegram(db, batteryId, requestId, user)).state;
}

import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { hasPermission, type PermissionAccount } from '@/lib/management/permissions';
import type { BatteryTelegramState } from '@/lib/management/battery-telegram';
import { contractNotificationText, notificationPaymentAmounts, type NotificationPayload } from './contract-notification-content';
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

export async function readBatteryTelegram(db: Database, batteryId: number, requestId: string, user: User) {
  if (!Number.isSafeInteger(batteryId) || batteryId <= 0 || requestId !== 'rental' && !UUID.test(requestId)) throw new BatteryTelegramError('Mã hợp đồng pin hoặc giao dịch không hợp lệ.');
  requestId = requestId.toLowerCase();
  const context = await readBatteryWorkflow(db, batteryId, false);
  const entry = context.history.find(event => event.request_id === requestId);
  if (requestId !== 'rental' && !entry) throw new BatteryTelegramError('Không tìm thấy giao dịch pin / sạc.', 404);
  const contract = context.contract;
  const all = user.scope_all === true || user.access_role === 'admin';
  if (!all && Number(contract.store_id) !== Number(user.store_id)) throw new BatteryTelegramError('Không có quyền xem hợp đồng pin của cơ sở khác.', 403);
  const kind = requestId === 'rental' ? 'battery_rental' : entry?.action === 'return' ? 'battery_return' : 'battery_renewal';
  const grant = kind === 'battery_rental' ? 'contracts.draft' : kind === 'battery_return' ? 'contracts.return' : 'contracts.renew';
  const allowed = hasPermission(user, grant) && contract.status !== 'cancelled';
  const key = kind === 'battery_rental' ? `battery-rental:${batteryId}` : `battery-${kind === 'battery_return' ? 'return' : 'renewal'}:${batteryId}:${requestId}`;
  const store = (await db.query('SELECT id,store_name,kind FROM himoto.stores WHERE id=$1', [contract.store_id])).rows[0];
  const ownership = store?.kind === 'lease_to_own';
  const route = kind === 'battery_renewal' ? 'ownership_renewal' : 'ownership_new';
  const destination_label = ownership
    ? (OWNERSHIP_TELEGRAM_DESTINATIONS.find(item => item.route === route)?.label || 'Nhóm thuê sở hữu')
    : `Nhóm cơ sở ${store?.store_name || contract.store_name || 'của hợp đồng'}`;
  const actor = String(user.name || '').trim() || entry?.actor_name || contract.staff_name || 'Chưa ghi nhận';
  const at = entry?.at || contract.created_at;
  const time = (value: string) => value.length === 16 ? `${value}:00+07:00` : value;
  const payload: NotificationPayload = {
    code: contract.code, customer: contract.customer_name || '—', phone: contract.customer_phone || '', store: contract.store_name || store?.store_name || '',
    actor, vehicles: contract.vehicle_license || '', vehicle_names: contract.battery_name || 'Pin / sạc', total: String(context.renewal_remaining || 0),
    at: new Date(at).toISOString(), photos: [], deposit: contract.deposit_amount ?? null,
  };
  if (kind === 'battery_return') {
    payload.return_details = { note: entry!.note || '', returned_at: [time(entry!.returned_at || at)] };
  } else {
    const renewal = entry?.action === 'collect_renewal' ? context.history.find(event => event.action === 'renew' && event.request_id === entry.renewal_id) : entry;
    if (kind === 'battery_renewal' && !renewal) throw new BatteryTelegramError('Không tìm thấy kỳ gia hạn pin / sạc.', 404);
    const rental = kind === 'battery_rental';
    const paymentIds = rental ? [] : context.history.filter(event => event.request_id === requestId || entry?.action === 'renew' && event.action === 'collect_renewal' && event.renewal_id === requestId)
      .flatMap(event => event.transaction_id ? [event.transaction_id] : []);
    const receipts = (await db.query(`SELECT t.value,t.name,t.payment_method,
      CASE WHEN t.payment_method=3 THEN 'Tiền mặt + CK (chưa tách số tiền)' WHEN t.cash_id IS NOT NULL OR t.payment_method=1 THEN 'Tiền mặt'
        WHEN t.bank_owner_type='company' THEN 'CK TK công ty' WHEN t.bank_owner_type='personal' THEN 'CK TK cá nhân' ELSE 'Chưa xác định' END AS method
      FROM himoto.transactions t WHERE t.object_type='battery_contract' AND t.object_id=$1 AND t.type='in' AND t.status='approved'
        AND (($3::boolean AND t.name IN ('battery:rental','battery:deposit')) OR (t.id=ANY($2::bigint[]) AND t.name='battery:renewal'))
      ORDER BY t.created_at,t.id`, [batteryId, paymentIds, rental])).rows;
    // An unpaid renewal must never pick up the initial rental or another period's receipts.
    const paid = rental ? receipts.filter(row => row.name === 'battery:rental') : receipts;
    const amounts = notificationPaymentAmounts(paid);
    const collected = rental ? contract.legacy_paid_amount + paid.reduce((sum, row) => sum + Number(row.value), 0) : Number(renewal!.collected || 0);
    payload.battery_details = {
      starts_at: time(rental ? contract.starts_at : renewal!.before_ends_at || contract.starts_at),
      ends_at: (rental ? context.history.find(event => event.action === 'renew')?.before_ends_at || contract.ends_at : renewal!.ends_at) || null,
      package_name: contract.package_name, amount: rental ? contract.rent_price : Number(renewal!.amount || 0), collected,
      remaining: rental ? null : Number(renewal!.remaining || 0), note: entry?.note || '',
    };
    if (payload.battery_details.ends_at) payload.battery_details.ends_at = time(payload.battery_details.ends_at);
    payload.method = amounts.map(row => row.method).join(' · ') || (collected > 0 && rental ? 'Theo lịch sử app cũ' : 'Chưa ghi nhận thanh toán');
    payload.payment_amounts = rental ? { rental: amounts, deposit: notificationPaymentAmounts(receipts.filter(row => row.name === 'battery:deposit')) } : { renewal: amounts };
  }
  const notices = (await db.query(
    `SELECT status,message_ids FROM himoto.management_contract_notifications
     WHERE battery_contract_id=$1 AND (event_key=$2 OR root_event_key=$2) ORDER BY created_at,id`,
    [batteryId, key],
  )).rows;
  const aggregate = noticeStatus(notices);
  const eligible = Number.isSafeInteger(Number(contract.store_id)) && Number(contract.store_id) > 0;
  const state: BatteryTelegramState = {
    eligible, battery_contract_id: batteryId, request_id: requestId.toLowerCase(), destination_label,
    text: contractNotificationText(kind, payload), status: aggregate.status, message_count: aggregate.message_count,
    can_send: eligible && allowed && (aggregate.can_requeue || !notices.length),
  };
  return { state, payload, store_id: Number(contract.store_id), allowed, ownership, kind, key };
}

export async function saveBatteryTelegram(db: Database, batteryId: number, requestId: string, user: User) {
  await db.query('SELECT id FROM himoto.battery_contracts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [batteryId]);
  const read = await readBatteryTelegram(db, batteryId, requestId, user);
  if (!read.allowed) throw new BatteryTelegramError('Không có quyền gửi Telegram cho giao dịch pin / sạc này.', 403);
  if (!read.state.eligible) throw new BatteryTelegramError('Không xác định được cơ sở của hợp đồng pin.');
  if (!read.state.can_send) {
    if (['sent', 'pending', 'sending'].includes(read.state.status || '')) return read.state;
    throw new BatteryTelegramError('Không gửi lại được lượt chưa rõ kết quả. Kiểm tra nhóm Telegram trước.', 409);
  }
  await db.query(`INSERT INTO himoto.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status,battery_contract_id)
    VALUES ($1,NULL,$2,$3,$3,$6,$4,'manual','pending',$5)
    ON CONFLICT(event_key) DO UPDATE SET status='pending',error_code=NULL,store_id=EXCLUDED.store_id,payload=EXCLUDED.payload,battery_contract_id=EXCLUDED.battery_contract_id
      WHERE management_contract_notifications.status IN ('failed','awaiting_config')`,
  [randomUUID(), read.store_id, read.key, JSON.stringify(read.payload), batteryId, read.kind]);
  return (await readBatteryTelegram(db, batteryId, requestId, user)).state;
}

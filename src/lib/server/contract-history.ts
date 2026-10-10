import 'server-only';
import type { PoolClient } from 'pg';
import type { ContractCashflow, ContractChange, ContractHistory } from '@/lib/management/contract-history';
import { formatMoney } from '@/lib/formatters';

type Database = Pick<PoolClient, 'query'>;
export class ContractHistoryError extends Error { constructor(message: string, public status = 400) { super(message); } }

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
const vietnamTime = (value: unknown) => {
  const date = new Date(iso(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
};
const amountOrNull = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const STATUS_LABELS: Record<string, string> = { approved: 'Đã duyệt', pending: 'Chờ duyệt', rejected: 'Từ chối', cancelled: 'Đã hủy' };

const CASHFLOW_SELECT = `SELECT t.id,t.order_id,t.created_at,t.type,t.name,t.value,COALESCE(t."desc",t.note) AS note,t.status,u.name AS actor,
    COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||t.order_id::text) AS contract_code,
    CASE WHEN t.name='order:payment' THEN 'Thanh toán hợp đồng' WHEN t.name='order:renewal' THEN 'Thu tiền gia hạn'
      WHEN t.name='order:extra' THEN 'Phiếu thu thêm hợp đồng' ELSE t.name END AS reason,
    CASE WHEN t.payment_method=3 THEN 'Tiền mặt + Chuyển khoản' WHEN t.cash_id IS NOT NULL OR t.payment_method=1 THEN 'Tiền mặt'
      WHEN t.bank_owner_type='company' THEN 'CK tài khoản công ty' WHEN t.bank_id IS NOT NULL OR t.payment_method=2 THEN 'Chuyển khoản' END AS method,
    CASE WHEN t.cash_id IS NOT NULL THEN 'Két tiền mặt #' || t.cash_id::text ELSE b.bank_name || ' · ' || b.owner_name || ' · ' || b.account_number END AS account,
    r.renewal_payload
  FROM himoto.transactions t
  JOIN himoto.orders o ON o.id=t.order_id
  LEFT JOIN himoto.users u ON u.id=t.user_id
  LEFT JOIN himoto.banks b ON b.id=t.bank_id
  LEFT JOIN himoto.management_contract_payments r ON r.transaction_id=t.id`;
const mapCashflow = (row: Record<string, unknown>): ContractCashflow => ({
  id: Number(row.id), at: iso(row.created_at), type: row.type === 'out' ? 'expense' : 'income', reason: String(row.reason || '—'),
  note: String(row.note || ''), amount: Number(row.value) || 0, method: String(row.method || '—'), account: String(row.account || '—'),
  actor: String(row.actor || '—'), status: STATUS_LABELS[String(row.status)] || String(row.status || '—'),
  order_id: Number(row.order_id) || undefined, contract_code: String(row.contract_code || ''),
});

export async function readCustomerCashflow(client: Database, customerId: number): Promise<ContractCashflow[]> {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new ContractHistoryError('Mã khách hàng không hợp lệ.');
  const result = await client.query(`${CASHFLOW_SELECT}
    WHERE o.customer_id=$1 AND o.deleted_at IS NULL AND t.type IN ('in','addon','out')
    ORDER BY t.created_at DESC,t.id DESC LIMIT 1000`, [customerId]);
  return result.rows.map(mapCashflow);
}

export async function readContractHistory(client: Database, id: number): Promise<ContractHistory> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ContractHistoryError('Mã hợp đồng không hợp lệ.');
  const order = await client.query(`SELECT o.id,o.created_at,u.name AS actor,
      COALESCE(o.draft_payload::jsonb #> '{management_composer,return_adjustments}','[]'::jsonb) AS return_adjustments,
      COALESCE(o.draft_payload::jsonb #> '{management_composer,versions}','[]'::jsonb) AS versions
    FROM himoto.orders o LEFT JOIN himoto.users u ON u.id=o.contract_responsible_user_id
    WHERE o.id=$1 AND o.deleted_at IS NULL`, [id]);
  if (!order.rowCount) throw new ContractHistoryError('Không tìm thấy hợp đồng.', 404);

  const transactions = await client.query(`${CASHFLOW_SELECT} WHERE t.order_id=$1 AND t.type IN ('in','addon','out')
    ORDER BY t.created_at DESC,t.id DESC`, [id]);
  const cashflow = transactions.rows.map(mapCashflow);

  const changes: ContractChange[] = [{ id: `created-${id}`, kind: 'created', at: iso(order.rows[0].created_at), actor: String(order.rows[0].actor || '—'),
    title: 'Tạo hợp đồng', detail: '', amount: null }];
  for (const row of transactions.rows) {
    if (row.status !== 'approved') continue;
    if (row.name === 'order:renewal') {
      const payload = row.renewal_payload as Record<string, unknown> | null;
      const vehicle = payload ? String(payload.license || payload.vehicle_name || '') : '';
      changes.push({ id: `renewal-${row.id}`, kind: 'renewal', at: iso(row.created_at), actor: String(row.actor || '—'), amount: Number(row.value) || 0,
        title: `Gia hạn${vehicle ? ` xe ${vehicle}` : ''}`,
        detail: payload ? `Hẹn trả ${vietnamTime(payload.before_return_at)} → ${vietnamTime(payload.return_at)} · Phiếu Thu #${row.id}` : `Phiếu Thu #${row.id}` });
    } else if (row.name === 'order:extra') {
      changes.push({ id: `extra-${row.id}`, kind: 'extra', at: iso(row.created_at), actor: String(row.actor || '—'), amount: Number(row.value) || 0,
        title: 'Thu thêm', detail: `${row.note ? `${row.note} · ` : ''}Cộng vào tiền hợp đồng · Phiếu Thu #${row.id}` });
    }
  }

  const swapTable = await client.query("SELECT to_regclass('himoto.management_contract_vehicle_swaps') IS NOT NULL AS ready");
  if (swapTable.rows[0]?.ready) {
    const swaps = await client.query(`SELECT w.id,w.created_at,u.name AS actor,f.license AS from_license,f.name AS from_name,t.license AS to_license,t.name AS to_name
      FROM himoto.management_contract_vehicle_swaps w
      LEFT JOIN himoto.users u ON u.id=w.actor_id
      LEFT JOIN himoto.vehicles f ON f.id=w.from_vehicle_id
      LEFT JOIN himoto.vehicles t ON t.id=w.to_vehicle_id
      WHERE w.order_id=$1`, [id]);
    for (const row of swaps.rows) changes.push({ id: `swap-${row.id}`, kind: 'swap', at: iso(row.created_at), actor: String(row.actor || '—'), amount: null,
      title: 'Đổi xe', detail: `${row.from_license || row.from_name || '—'} → ${row.to_license || row.to_name || '—'}` });
  }

  const adjustments = Array.isArray(order.rows[0].return_adjustments) ? order.rows[0].return_adjustments as Record<string, unknown>[] : [];
  if (adjustments.length) {
    const vehicleIds = adjustments.map(item => Number(item.vehicle_id)).filter(Number.isSafeInteger);
    const actorIds = adjustments.map(item => Number(item.actor_id)).filter(Number.isSafeInteger);
    const [vehicles, actors] = await Promise.all([
      client.query('SELECT id,name,license FROM himoto.vehicles WHERE id = ANY($1::bigint[])', [vehicleIds]),
      client.query('SELECT id,name FROM himoto.users WHERE id = ANY($1::bigint[])', [actorIds]),
    ]);
    adjustments.forEach((item, index) => {
      const vehicle = vehicles.rows.find(row => Number(row.id) === Number(item.vehicle_id));
      const actor = actors.rows.find(row => Number(row.id) === Number(item.actor_id));
      const fee = amountOrNull(item.fee);
      const late = Number(item.late_minutes) || 0;
      changes.push({ id: `return-${index}`, kind: 'return', at: iso(item.actual_return_at), actor: String(actor?.name || '—'), amount: fee,
        title: `Trả xe${vehicle ? ` ${vehicle.license || vehicle.name}` : ''}`,
        detail: `Hẹn trả ${vietnamTime(item.scheduled_return_at)}${late ? ` · Trễ ${Math.ceil(late / 60)} giờ${fee ? ` · Phí trả muộn ${formatMoney(fee)}` : ''}` : ' · Đúng hạn'}` });
    });
  }

  const versions = Array.isArray(order.rows[0].versions) ? order.rows[0].versions as Record<string, unknown>[] : [];
  if (versions.length) {
    const actors = await client.query('SELECT id,name FROM himoto.users WHERE id = ANY($1::bigint[])', [versions.map(item => Number(item.actor_id)).filter(Number.isSafeInteger)]);
    for (const item of versions) {
      const actor = actors.rows.find(row => Number(row.id) === Number(item.actor_id));
      const overdue = Number(item.overdue_minutes) || 0;
      const before = amountOrNull(item.before_total), after = amountOrNull(item.total);
      changes.push({ id: `version-${item.version}`, kind: 'renewal', at: iso(item.created_at), actor: String(actor?.name || '—'), amount: amountOrNull(item.amount) || null,
        title: `Phiên bản v${item.version} · Gia hạn${item.license || item.vehicle_name ? ` xe ${item.license || item.vehicle_name}` : ''}`,
        detail: [`Hẹn trả ${vietnamTime(item.before_return_at)} → ${vietnamTime(item.return_at)}`,
          overdue ? `Quá hạn ${Math.floor(overdue / 1440)} ngày ${Math.ceil((overdue % 1440) / 60)} giờ` : '',
          before !== null && after !== null && before !== after ? `Tiền hợp đồng ${formatMoney(before)} → ${formatMoney(after)}` : '',
          item.note ? String(item.note) : ''].filter(Boolean).join(' · ') });
    }
  }

  changes.sort((a, b) => (new Date(b.at).getTime() || 0) - (new Date(a.at).getTime() || 0));
  return { changes, cashflow };
}

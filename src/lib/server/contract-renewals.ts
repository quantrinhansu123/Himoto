import 'server-only';
import type { PoolClient } from 'pg';
import { MAX_PAYMENT_AMOUNT } from '@/lib/management/contract-payments';
import { nextRenewalVersion, type RenewalInput, type RenewalResult, type RenewalVersion } from '@/lib/management/contract-renewals';
import { rentalPaid } from './contract-deposits';
import { parseContractPayment, ContractPaymentError } from './contract-payments';

type Database = Pick<PoolClient, 'query'>;
export class ContractRenewalError extends Error { constructor(message: string, public status = 400) { super(message); } }
const RENEWAL_STATUSES = ['renting', 'overdue', 'wait_payment'];
const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value == null ? null : String(value);

export function parseRenewalInput(body: unknown): RenewalInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractRenewalError('Thông tin gia hạn không hợp lệ.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['item_id', 'item_revision', 'order_revision', 'return_at', 'amount', 'expected_amount', 'note', 'request_id', 'receipt'].includes(key)) ||
      !Number.isSafeInteger(input.item_id) || Number(input.item_id) <= 0 ||
      typeof input.item_revision !== 'string' || !/^\d{1,20}$/.test(input.item_revision) ||
      typeof input.order_revision !== 'string' || !/^\d{1,20}$/.test(input.order_revision) ||
      typeof input.return_at !== 'string' || !LOCAL_MINUTE.test(input.return_at) ||
      typeof input.amount !== 'string' || !/^(0|[1-9]\d{0,12})$/.test(input.amount) || Number(input.amount) > MAX_PAYMENT_AMOUNT ||
      (input.expected_amount !== undefined && (typeof input.expected_amount !== 'string' || !/^(0|[1-9]\d{0,12})$/.test(input.expected_amount) || Number(input.expected_amount) > MAX_PAYMENT_AMOUNT)) ||
      typeof input.note !== 'string' || input.note.trim().length > 2000) throw new ContractRenewalError('Kiểm tra xe, ngày trả mới và chi phí gia hạn.');
  const returnAt = new Date(`${input.return_at}:00+07:00`);
  if (!Number.isFinite(returnAt.getTime()) || new Date(returnAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 16) !== input.return_at) throw new ContractRenewalError('Ngày trả mới không hợp lệ.');
  const result: RenewalInput = { item_id: Number(input.item_id), item_revision: input.item_revision, order_revision: input.order_revision, return_at: input.return_at, amount: input.amount, note: input.note.trim(),
    ...(input.expected_amount === undefined ? {} : { expected_amount: input.expected_amount }) };
  if (input.request_id !== undefined) {
    if (typeof input.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id)) throw new ContractRenewalError('Mã lần gia hạn không hợp lệ.');
    result.request_id = input.request_id.toLowerCase();
  }
  if (input.receipt !== undefined) {
    const receipt = input.receipt as Record<string, unknown>;
    if (!result.request_id || !receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).some(key => !['method','account_id','paid_at'].includes(key))) throw new ContractRenewalError('Khoản thu gia hạn không hợp lệ.');
    try {
      const parsed = parseContractPayment({...receipt,request_id:result.request_id,revision:result.order_revision,amount:result.amount,note:result.note});
      result.receipt = {method:parsed.method,account_id:parsed.account_id,paid_at:parsed.paid_at};
    } catch (error) { if (error instanceof ContractPaymentError) throw new ContractRenewalError(error.message,error.status); throw error; }
  }
  return result;
}

// Caller owns BEGIN/COMMIT. Return date, renewal fee, contract total and the version record change together.
export async function recordContractRenewal(client: Database, orderId: number, actorId: number, input: RenewalInput): Promise<RenewalResult> {
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new ContractRenewalError('Hợp đồng hoặc người thực hiện không hợp lệ.');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const locked = await client.query(`SELECT d.id,d.vehicle_id,d.rent_at,d.return_at,d.xmin::text AS item_revision,
      o.total,o.pid,o.order_status,o.draft_payload,o.xmin::text AS order_revision,
      COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,v.name AS vehicle_name,v.license
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id LEFT JOIN himoto.vehicles v ON v.id=d.vehicle_id
    WHERE d.id=$1 AND d.order_id=$2 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
    FOR UPDATE OF d,o`, [input.item_id, orderId]);
  const item = locked.rows[0];
  if (!item) throw new ContractRenewalError('Xe đã trả, đã xóa hoặc không thuộc hợp đồng này.', 404);
  if (item.draft_payload?.management_composer?.installment_plan) throw new ContractRenewalError('Thuê sở hữu đóng tiền theo lịch đã lập. Không cộng kỳ đóng tiền thành phí gia hạn.', 409);
  if (!RENEWAL_STATUSES.includes(String(item.order_status))) throw new ContractRenewalError('Chỉ gia hạn hợp đồng đang thuê, quá hạn hoặc chờ thanh toán.', 409);
  if (item.order_revision !== input.order_revision || item.item_revision !== input.item_revision) throw new ContractRenewalError('Hợp đồng vừa được cập nhật. Đóng và mở lại Gia hạn để xem số liệu mới.', 409);
  const beforeReturn = iso(item.return_at);
  const newReturn = `${input.return_at}:00+07:00`;
  if (beforeReturn && new Date(newReturn).getTime() <= new Date(beforeReturn).getTime()) throw new ContractRenewalError('Ngày trả mới phải sau ngày hẹn trả hiện tại.', 409);
  const amount = Number(input.amount);
  const beforeTotal = item.total == null || item.total === '' ? null : Number(item.total);
  if (amount && (beforeTotal === null || !Number.isSafeInteger(beforeTotal) || beforeTotal + amount > MAX_PAYMENT_AMOUNT)) throw new ContractRenewalError('Tiền hợp đồng hiện tại chưa hợp lệ để cộng chi phí gia hạn.', 409);

  const payload = item.draft_payload && typeof item.draft_payload === 'object' && !Array.isArray(item.draft_payload) ? structuredClone(item.draft_payload) as Record<string, unknown> : {};
  const composer = payload.management_composer && typeof payload.management_composer === 'object' && !Array.isArray(payload.management_composer)
    ? payload.management_composer as Record<string, unknown> : {};
  const versions = Array.isArray(composer.versions) ? composer.versions as RenewalVersion[] : [];
  const overdueMinutes = beforeReturn ? Math.max(0, Math.floor((Date.now() - new Date(beforeReturn).getTime()) / 60_000)) : 0;
  const total = beforeTotal === null ? null : beforeTotal + amount;
  const paid = await rentalPaid(client, orderId, item.pid);
  const expected = input.expected_amount === undefined ? null : Number(input.expected_amount);
  const mismatch = expected !== null && amount !== expected;
  const warning = mismatch
    ? `Cảnh báo: chi phí gia hạn ${amount.toLocaleString('vi-VN')} đ khác gợi ý theo hợp đồng ${expected.toLocaleString('vi-VN')} đ.`
    : undefined;
  const version: RenewalVersion = { version: nextRenewalVersion(versions), kind: 'renewal', created_at: new Date().toISOString(), actor_id: actorId,
    item_id: input.item_id, vehicle_id: Number(item.vehicle_id), vehicle_name: String(item.vehicle_name || ''), license: String(item.license || ''),
    rent_at: iso(item.rent_at), before_return_at: beforeReturn, return_at: newReturn, overdue_minutes: overdueMinutes,
    amount, before_total: beforeTotal, total, paid, note: input.note,
    ...(expected === null ? {} : { expected_amount: expected, amount_mismatch: mismatch, ...(warning ? { warning } : {}) }) };
  payload.management_composer = { ...composer, versions: [...versions, version] };

  await client.query(`UPDATE himoto.order_vehicle_details SET return_at=$2::timestamptz,
    total_renewal_amount=COALESCE(total_renewal_amount,0)+$3,updated_at=now() WHERE id=$1`, [input.item_id, newReturn, amount]);
  await client.query(`UPDATE himoto.orders SET
      total=CASE WHEN $2::bigint=0 THEN total ELSE (total::numeric+$2)::text END,
      return_at=CASE WHEN return_at IS NULL THEN NULL ELSE GREATEST(return_at,
        (SELECT max(d.return_at) FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.deleted_at IS NULL)) END,
      draft_payload=$3::json,updated_at=now() WHERE id=$1`, [orderId, amount, JSON.stringify(payload)]);
  return { order_id: orderId, code: String(item.code), version: version.version, return_at: newReturn, total_amount: total, amount };
}

import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  findPaymentAccount, paymentAccountMatchesMethod, type PaymentContext, type PaymentMethod,
} from '@/lib/management/contract-payments';
import { hasPermission, canRecordContractPayment } from '@/lib/management/permissions';
import type { DepositRefundRequest, DepositRefundState } from '@/lib/management/deposit-refunds';
import type { DataAccess } from './access-context';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { ContractPaymentError, parseContractPayment, readPaymentContext, recordContractPayment } from './contract-payments';
import { lockShiftClose } from './shift-close-lock';

type Database = Pick<PoolClient, 'query'>;
type Actor = Pick<DataAccess, 'id' | 'role' | 'access_role' | 'role_slug' | 'permissions' | 'store_id' | 'store_kind' | 'scope_all'>;
type Order = { id: number; item_id: number; store_id: number };
type Voucher = DepositRefundState['vouchers'][number] & { item_id: number | null };
const TABLE = 'himoto.management_deposit_refund_requests';
const requestSelect = `SELECT r.id,r.order_id,r.item_id,r.store_id,r.created_by,r.request_hash,r.replaces_revision,r.refund_snapshot,
  COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||r.order_id::text) AS code,
  COALESCE(s.store_name,'') AS store,COALESCE(author.name,'') AS actor,COALESCE(reviewer.name,'') AS reviewer,
  r.status,r.amount,r.method,r.account_id,r.account_label,to_char(r.paid_at,'YYYY-MM-DD"T"HH24:MI') AS paid_at,
  r.reason,r.review_reason,r.review_note,r.replaces_id,r.transaction_id
  FROM ${TABLE} r LEFT JOIN himoto.orders o ON o.id=r.order_id
  LEFT JOIN himoto.stores s ON s.id=r.store_id
  LEFT JOIN himoto.users author ON author.id=r.created_by LEFT JOIN himoto.users reviewer ON reviewer.id=r.reviewed_by`;

const canSubmit = (actor: Actor, storeId: number) => hasPermission(actor, 'contracts.return') &&
  (actor.store_id === storeId || actor.scope_all && canRecordContractPayment(actor));
const canReview = (actor: Actor, storeId: number) => canRecordContractPayment(actor) &&
  (actor.scope_all || actor.store_id === storeId);
const fail = (message: string, status = 409): never => { throw new ContractPaymentError(message, status); };

export function refundRequestId(value: unknown) {
  if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)) {
    throw new ContractPaymentError('Mã yêu cầu hoàn cọc chưa hợp lệ.');
  }
  return value.toLowerCase();
}

export function refundItemId(value: unknown) {
  const id = Number(value);
  if (!/^[1-9]\d{0,14}$/.test(String(value)) || !Number.isSafeInteger(id)) {
    throw new ContractPaymentError('Chọn đúng lượt trả xe để bổ sung hoàn cọc.');
  }
  return id;
}

async function returnedOrder(db: Database, actor: Actor, itemId: number, lock = false): Promise<Order> {
  const { rows } = await db.query(`SELECT o.id,o.store_id,d.id AS item_id
    FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id
    WHERE d.id=$1 AND d.completed_at IS NOT NULL AND d.deleted_at IS NULL
      AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
    ${lock ? 'FOR UPDATE OF o' : ''}`, [itemId]);
  const row = rows[0];
  if (!row || !(canSubmit(actor, Number(row.store_id)) || canReview(actor, Number(row.store_id)))) {
    return fail('Không tìm thấy lượt trả xe trong cơ sở được phép xử lý hoàn cọc.', 404);
  }
  return { id: Number(row.id), item_id: Number(row.item_id), store_id: Number(row.store_id) };
}

function mapRequest(row: Record<string, unknown>): DepositRefundRequest {
  return {
    id: String(row.id), order_id: Number(row.order_id), code: String(row.code), store: String(row.store),
    actor_id: Number(row.created_by), actor: String(row.actor), reviewer: String(row.reviewer), status: row.status as DepositRefundRequest['status'],
    amount: Number(row.amount), method: row.method as PaymentMethod, account_label: String(row.account_label),
    paid_at: String(row.paid_at), reason: String(row.reason), review_reason: String(row.review_reason),
    review_note: String(row.review_note || ''), replaces_id: row.replaces_id == null ? null : Number(row.replaces_id),
    transaction_id: row.transaction_id == null ? null : Number(row.transaction_id),
  };
}

async function findRequest(db: Database, id: string, lock = false) {
  return (await db.query(`${requestSelect} WHERE r.id=$1 ${lock ? 'FOR UPDATE OF r' : ''}`, [id])).rows[0];
}

async function vouchers(db: Database, orderId: number): Promise<Voucher[]> {
  const { rows } = await db.query(`SELECT t.id,t.xmin::text AS revision,t.value AS amount,t.created_at AS paid_at,t.order_item_id,
    CASE WHEN t.cash_id IS NOT NULL OR t.payment_method=1 THEN 'Tiền mặt'
      WHEN t.bank_owner_type='company' THEN 'CK tài khoản công ty'
      WHEN t.bank_id IS NOT NULL OR t.payment_method=2 THEN 'Chuyển khoản' ELSE 'Chưa xác định' END AS method,
    COALESCE(c.name,b.bank_name || ' · ' || b.owner_name,'') AS account
    FROM himoto.transactions t LEFT JOIN himoto.cash c ON c.id=t.cash_id LEFT JOIN himoto.banks b ON b.id=t.bank_id
    WHERE t.order_id=$1 AND t.type='out' AND t.status='approved' AND (t.name='order:deposit_refund' OR t.name LIKE 'order:complete:%')
    ORDER BY t.created_at DESC,t.id DESC`, [orderId]);
  return rows.map(row => ({
    id: Number(row.id), revision: String(row.revision), amount: Number(row.amount),
    paid_at: new Date(row.paid_at).toISOString(), method: row.method, account: row.account,
    item_id: row.order_item_id == null ? null : Number(row.order_item_id),
  }));
}
const voucherSnapshot = (existing: Voucher[]) => JSON.stringify(existing.map(voucher => [voucher.id, voucher.revision]));

function eligibility(context: PaymentContext) {
  if (context.status !== 'completed' || !context.all_returned) return 'Cần trả đủ xe và hoàn thành hợp đồng trước khi bổ sung hoàn cọc.';
  if (context.remaining !== 0) return 'Cần đối chiếu công nợ hợp đồng trước khi bổ sung hoàn cọc.';
  return '';
}

async function todayAndClosed(db: Database, storeId: number, day?: string) {
  const { rows } = await db.query(`SELECT t.today,EXISTS(
    SELECT 1 FROM himoto.management_shift_reports r
    WHERE r.store_id=$1 AND r.report_date=COALESCE($2,t.today)::date AND r.status='submitted'
      AND COALESCE(r.payload->>'report_type','end_shift')='end_shift'
    ) AS closed FROM (SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS today) t`,
    [storeId, day ?? null]);
  return rows[0] as { today: string; closed: boolean };
}

export async function readDepositRefundState(db: Database, actor: Actor, itemId: number): Promise<DepositRefundState> {
  const order = await returnedOrder(db, actor, itemId);
  const context = await readPaymentContext(db, order.id, { page: 1, size: 0 });
  const existing = await vouchers(db, order.id);
  const { closed } = await todayAndClosed(db, order.store_id);
  const { rows } = await db.query(`${requestSelect} WHERE r.order_id=$1 AND r.store_id=$2
    ORDER BY (r.status='pending') DESC,r.created_at DESC,r.id DESC LIMIT 12`, [order.id, order.store_id]);
  return {
    code: context.code, held: context.deposit_held, can_submit: canSubmit(actor, order.store_id),
    can_send_telegram: hasPermission(actor, 'contracts.return'),
    blocked_reason: eligibility(context) || (!existing.length && !context.deposit_held ? 'Hợp đồng không còn tiền cọc để bổ sung.' : ''),
    review_reason: closed ? 'Báo cáo cuối ca hôm nay đã chốt. Khoản bổ sung cần kế toán duyệt.' : '',
    accounts: context.accounts.map(account => ({
      id: account.id,
      method: account.kind === 'cash' ? 'cash' : account.owner_type === 'company' ? 'company_transfer' : 'transfer',
      label: account.label,
    })),
    vouchers: existing, requests: rows.map(mapRequest),
  };
}

export async function listDepositRefundRequests(db: Database, actor: Actor, page: number) {
  if (!canRecordContractPayment(actor)) return fail('Chỉ kế toán hoặc quản trị viên được xem danh sách chờ duyệt.', 403);
  const { rows } = await db.query(`${requestSelect} WHERE r.status='pending' AND ($1::boolean OR r.store_id=$2)
    ORDER BY r.created_at,r.id LIMIT 26 OFFSET $3`, [actor.scope_all, actor.store_id, (page - 1) * 25]);
  return { rows: rows.slice(0, 25).map(mapRequest), has_more: rows.length > 25 };
}

export async function readDepositRefundEvidence(db: Database, actor: Actor, id: string): Promise<Buffer> {
  const row = (await db.query(`SELECT store_id,evidence FROM ${TABLE} WHERE id=$1`, [id])).rows[0];
  if (!row || !(canSubmit(actor, Number(row.store_id)) || canReview(actor, Number(row.store_id)))) {
    return fail('Không tìm thấy ảnh chứng từ trong phạm vi tài khoản.', 404);
  }
  return row.evidence;
}

function paymentFor(context: PaymentContext, input: { id: string; amount: string; method: unknown; account_id: number; paid_at: string; reason: string }) {
  return parseContractPayment({
    request_id: input.id, revision: context.revision, amount: input.amount, method: input.method,
    account_id: input.account_id, paid_at: input.paid_at, note: input.reason, purpose: 'deposit_refund',
  });
}

function validAmountAndAccount(context: PaymentContext, payment: ReturnType<typeof paymentFor>, previous?: Voucher) {
  if (Number(payment.amount) > context.deposit_held + (previous?.amount ?? 0)) {
    return fail('Số tiền hoàn vượt số cọc còn giữ sau khi đối chiếu phiếu hiện tại.');
  }
  const account = findPaymentAccount(context, payment.method, payment.account_id);
  if (!account || !paymentAccountMatchesMethod(account, payment.method)) {
    return fail('Chọn đúng két hoặc tài khoản chi đang hoạt động của cơ sở.');
  }
  return account.label;
}

async function postRefund(db: Database, order: Order, actor: Actor, payment: ReturnType<typeof paymentFor>, previous?: Voucher) {
  const unresolved = await db.query(`SELECT 1 FROM himoto.management_contract_notifications
    WHERE order_id=$1 AND event_type='return' AND COALESCE(retraction->>'state','')<>'done'
      AND (status IN ('pending','sending','unknown') OR status='failed' AND jsonb_array_length(COALESCE(message_ids,'[]'::jsonb))>0
        OR retraction->>'state' IN ('pending','processing','failed'))
    LIMIT 1`, [order.id]);
  if (unresolved.rowCount) return fail('Hồ sơ trả xe đang gửi hoặc cần đối chiếu Telegram. Hoàn tất lượt đó rồi ghi nhận phiếu.');
  if (previous) {
    const stopped = await db.query(`UPDATE himoto.transactions SET status='cancelled',updated_at=now()
      WHERE id=$1 AND order_id=$2 AND status='approved' AND xmin::text=$3`, [previous.id, order.id, previous.revision]);
    if (!stopped.rowCount) return fail('Phiếu chi gốc đã thay đổi. Tải lại để đối chiếu.');
  }
  const saved = await recordContractPayment(db, order.id, actor.id, {
    ...payment, note: `Bổ sung hoàn cọc · ${payment.note}`,
  }, { page: 1, size: 0 });
  const linked = previous && (await db.query(`SELECT s->'item_ids' AS ids FROM himoto.orders o
    CROSS JOIN LATERAL jsonb_array_elements(CASE
      WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,return_settlements}')='array'
      THEN o.draft_payload::jsonb #> '{management_composer,return_settlements}' ELSE '[]'::jsonb END) WITH ORDINALITY a(s,n)
    WHERE o.id=$1 AND s->>'refund_transaction_id'=$2 ORDER BY n DESC LIMIT 1`, [order.id, String(previous.id)])).rows[0]?.ids;
  const itemId = previous?.item_id ?? (Array.isArray(linked) && linked.length ? Number(linked[0]) : order.item_id);
  await db.query('UPDATE himoto.transactions SET order_item_id=$2 WHERE id=$1', [saved.transaction_id, itemId]);
  return saved.transaction_id;
}

export type DepositRefundSubmission = {
  id: string;
  item_id: number;
  amount: string;
  method: unknown;
  account_id: number;
  paid_at: string;
  reason: string;
  evidence: Buffer;
  replaces_id: number | null;
  replaces_revision: string | null;
};

export async function submitDepositRefund(db: Database, actor: Actor, input: DepositRefundSubmission) {
  const order = await returnedOrder(db, actor, input.item_id, true);
  if (!canSubmit(actor, order.store_id)) return fail('Tài khoản chưa có quyền bổ sung hoàn cọc ở cơ sở này.', 403);
  const { evidence, ...fields } = input;
  const hash = createHash('sha256').update(JSON.stringify({ actor: actor.id, ...fields })).update(evidence).digest('hex');
  const replay = await findRequest(db, input.id);
  if (replay) {
    if (replay.request_hash !== hash) return fail('Mã yêu cầu đã dùng cho nội dung khác. Tải lại hồ sơ để đối chiếu.');
    return mapRequest(replay);
  }
  const context = await readPaymentContext(db, order.id, { page: 1, size: 0 });
  const blocked = eligibility(context);
  if (blocked) return fail(blocked);
  const pending = await db.query(`SELECT 1 FROM ${TABLE} WHERE order_id=$1 AND status='pending'`, [order.id]);
  if (pending.rowCount) return fail('Hợp đồng đã có yêu cầu chờ kế toán duyệt. Vui lòng theo dõi yêu cầu hiện tại.');
  const payment = paymentFor(context, input);
  const existing = await vouchers(db, order.id);
  const previous = existing.find(row => row.id === input.replaces_id);
  if (input.replaces_id !== null && (!previous || previous.revision !== input.replaces_revision)) {
    return fail('Phiếu chi cần sửa đã thay đổi. Tải lại để đối chiếu trước khi gửi yêu cầu.');
  }
  const label = validAmountAndAccount(context, payment, previous);
  const day = payment.paid_at.slice(0, 10);
  await lockShiftClose(db, order.store_id, day);
  const { today, closed } = await todayAndClosed(db, order.store_id, day);
  const reasons = [
    ...(previous ? ['Sửa phiếu đã ghi'] : existing.length ? ['Hợp đồng đã có phiếu hoàn cọc'] : []),
    ...(day !== today || closed ? ['Ca đã chốt hoặc ngày chi đã qua'] : []),
    ...(payment.method !== 'cash' ? ['Hoàn qua chuyển khoản'] : []),
  ];
  const reviewReason = reasons.join(' · ');
  const transactionId = reviewReason ? null : await postRefund(db, order, actor, payment);
  await db.query(`INSERT INTO ${TABLE} (id,order_id,item_id,store_id,created_by,request_hash,amount,method,
    account_id,account_label,paid_at,reason,evidence,replaces_id,replaces_revision,refund_snapshot,review_reason,status,transaction_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamp,$12,$13,$14,$15,$16,$17,$18,$19)`, [
    input.id, order.id, order.item_id, order.store_id, actor.id, hash, payment.amount, payment.method,
    payment.account_id, label, payment.paid_at, input.reason, evidence, input.replaces_id, input.replaces_revision,
    voucherSnapshot(existing), reviewReason, transactionId ? 'posted' : 'pending', transactionId,
  ]);
  return mapRequest(await findRequest(db, input.id));
}

export async function decideDepositRefund(db: Database, actor: Actor, id: string, decision: 'approve' | 'reject', note: string) {
  const first = await findRequest(db, id);
  if (!first || !canReview(actor, Number(first.store_id))) return fail('Yêu cầu không thuộc cơ sở được phép duyệt.', 404);
  if (Number(first.created_by) === actor.id) return fail('Cần kế toán hoặc quản trị viên khác duyệt yêu cầu do mình gửi.', 403);
  // Match submission lock order. Rejection can clear a request whose contract was archived.
  const order = decision === 'approve' ? await returnedOrder(db, actor, Number(first.item_id), true) : null;
  const request = await findRequest(db, id, true);
  const targetStatus = decision === 'approve' ? 'approved' : 'rejected';
  if (request.status === targetStatus) return mapRequest(request);
  if (request.status !== 'pending') return fail('Yêu cầu đã được xử lý. Tải lại danh sách để xem kết quả.');
  let transactionId: number | null = null;
  if (order) {
    if (order.id !== Number(request.order_id) || order.store_id !== Number(request.store_id)) {
      return fail('Hợp đồng đã đổi cơ sở hoặc lượt trả. Từ chối yêu cầu này và đối chiếu lại.');
    }
    const context = await readPaymentContext(db, order.id, { page: 1, size: 0 });
    const blocked = eligibility(context);
    if (blocked) return fail(blocked);
    const payment = paymentFor(context, {
      id, amount: String(request.amount), method: request.method, account_id: Number(request.account_id),
      paid_at: request.paid_at, reason: request.reason,
    });
    const existing = await vouchers(db, order.id);
    if (request.refund_snapshot !== voucherSnapshot(existing)) {
      return fail('Các phiếu hoàn cọc đã thay đổi sau khi gửi yêu cầu. Từ chối yêu cầu này để nhân viên đối chiếu lại.');
    }
    const previous = existing.find(row => row.id === Number(request.replaces_id));
    if (request.replaces_id !== null && (!previous || previous.revision !== request.replaces_revision)) {
      return fail('Phiếu chi gốc đã thay đổi. Từ chối yêu cầu này và đối chiếu lại.');
    }
    validAmountAndAccount(context, payment, previous);
    const dates = new Set([payment.paid_at.slice(0, 10)]);
    if (previous) dates.add(new Date(Date.parse(previous.paid_at) + 7 * 3_600_000).toISOString().slice(0, 10));
    for (const day of [...dates].sort()) await lockShiftClose(db, order.store_id, day);
    transactionId = await postRefund(db, order, actor, payment, previous);
  }
  await db.query(`UPDATE ${TABLE}
    SET status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4,transaction_id=$5 WHERE id=$1`,
    [id, targetStatus, actor.id, note, transactionId]);
  return mapRequest(await findRequest(db, id));
}

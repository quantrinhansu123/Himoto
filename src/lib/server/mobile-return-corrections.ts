import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import { paymentAccounts } from '@/lib/management/contract-payments';
import type { ReturnRefund } from '@/lib/management/contract-returns';
import { readReturnCorrection, correctReturn } from './return-corrections';
import { ContractReturnError, parseReturnInput } from './contract-returns';
import { ContractPaymentError } from './contract-payments';
import { parseMobileReturnMoney } from './mobile-return-settlement';
import { requireMobileReturn } from './mobile-returns';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { contractVehicleLabelSource } from './contract-vehicle-reads';
import { mobileContractId } from './mobile-contracts';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { MobileError } from './mobile-session';
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from './mobile-writes';
import { isMobileReturnCorrectionOptions, isMobileReturnCorrectionProfile, isMobileReturnCorrectionResult, type MobileReturnCorrectionProfile, type MobileReturnCorrectionResult } from '../../../shared/mobile-return-corrections';

async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireMobileReturn(user);
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='30s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const result = await task(client); await client.query('COMMIT'); return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ContractReturnError || error instanceof ContractPaymentError) throw new MobileError(error.message, error.status, error.status === 409 ? 'RETURN_CORRECTION_CONFLICT' : 'INVALID_RETURN_CORRECTION');
      throw error;
    } finally { client.release(); }
  });
}
async function visible(client: PoolClient, id: number) {
  const row = (await client.query(`SELECT o.id,o.xmin::text AS revision,COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text)AS code FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
  if (!row) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND'); return row;
}
export async function readMobileReturnCorrectionOptions(user: SessionUser, value: string, params: URLSearchParams) {
  const id = mobileContractId(value), page = params.get('page') || '1';
  if ([...params.keys()].some(k => k !== 'page' || params.getAll(k).length !== 1) || !/^[1-9]\d{0,5}$/.test(page)) throw new MobileError('Trang lượt trả chưa hợp lệ.');
  return transaction(user, false, async client => {
    const order = await visible(client, id);
    const count = Number((await client.query('SELECT count(*) AS n FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL AND completed_at IS NOT NULL', [id])).rows[0].n);
    const pages = Math.max(1, Math.ceil(count / 25)), current = Math.min(Number(page), pages);
    const rows = (await client.query(`SELECT d.id,d.vehicle_id,d.completed_at,v.name,v.license FROM himoto.order_vehicle_details d LEFT JOIN ${contractVehicleLabelSource('ARRAY[$1::bigint]')} v ON v.id=d.vehicle_id
      WHERE d.order_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NOT NULL ORDER BY d.completed_at DESC,d.id DESC LIMIT 25 OFFSET $2`, [id, (current - 1) * 25])).rows;
    const result = { id, code: String(order.code), page: current, pages, total: count, rows: rows.map(r => ({ itemId: Number(r.id), vehicleId: Number(r.vehicle_id), license: String(r.license || ''), name: String(r.name || ''), returnedAt: new Date(r.completed_at).toISOString() })) };
    if (!isMobileReturnCorrectionOptions(result)) throw new MobileError('Danh sách lượt trả cần đối chiếu.', 409, 'DATA_REVIEW_REQUIRED'); return result;
  });
}
const money = (v: ReturnRefund) => ({ amount: v.amount, method: v.method, account_id: v.account_id, paid_at: v.paid_at,
  ...(v.recipient_bank === undefined ? {} : { recipient_bank: v.recipient_bank }), ...(v.recipient_account === undefined ? {} : { recipient_account: v.recipient_account }), ...(v.recipient_name === undefined ? {} : { recipient_name: v.recipient_name }) });
export async function readMobileReturnCorrection(user: SessionUser, value: string, item: string): Promise<MobileReturnCorrectionProfile> {
  const id = mobileContractId(value), itemId = mobileContractId(item);
  return transaction(user, false, async client => {
    await visible(client, id); const context = await readReturnCorrection(client, itemId);
    if (context.order_id !== id) throw new MobileError('Lượt trả không thuộc hợp đồng đang mở.', 404, 'NOT_FOUND');
    const s = context.settlement, result = {
      id, anchorItemId: itemId, code: context.code, customer: context.customer, revision: context.revision, eventKey: context.event_key,
      note: context.note, blockedReason: context.blocked_reason || null, previousAdjustment: context.previous_adjustment,
      totalAmount: context.payment.total_amount, rentalPaid: context.payment.paid_amount, depositHeld: context.payment.deposit_held, billing: !!context.payment.billing,
      lines: context.lines.map(l => ({ id: l.item_id, vehicleId: l.vehicle_id, revision: l.item_revision, license: l.license, name: l.vehicle_name,
        startsAt: l.scheduled_start_at, scheduledReturnAt: l.scheduled_return_at, returnedAt: l.completed_at, reconciled: l.return_reconciled === true,
        lateFee: l.late_fee, repairFee: l.repair_fee, repairNote: l.repair_note, earlyDiscount: l.early_discount, hourlyRate: l.hourly_rate })),
      accounts: (['cash', 'transfer', 'company_transfer'] as const).flatMap(method => paymentAccounts(context.payment, method).map(a => ({ id: a.id, method, label: a.label }))),
      settlement: { revision: s.revision, receipts: s.receipts.map(r => ({ ...money(r), kind: r.kind })), ...(s.refund ? { refund: money(s.refund) } : {}), ...(s.rental_refund ? { rental_refund: money(s.rental_refund) } : {}), ...(s.refund_deferred ? { refund_deferred: true as const } : {}), ...(s.refund_recipient ? { refund_recipient: { ...s.refund_recipient } } : {}) },
    };
    if (!isMobileReturnCorrectionProfile(result)) throw new MobileError('Lượt trả cần kiểm tra dữ liệu trên web trước khi sửa.', 409, 'DATA_REVIEW_REQUIRED'); return result;
  });
}
async function result(client: PoolClient, user: SessionUser, key: string): Promise<MobileReturnCorrectionResult | null> {
  const row = (await client.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  if (!row || !/^return\.correct:[1-9]\d{0,14}$/.test(String(row.operation)) || row.resource_id == null) return null;
  const found = { key, operation: row.operation, receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true } };
  if (!isMobileReturnCorrectionResult(found)) throw new MobileError('Kết quả sửa trả xe cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT'); await visible(client, found.receipt.id); return found;
}
export async function readMobileReturnCorrectionResult(user: SessionUser, key: string) { mobileRequestKey(key); return transaction(user, false, async client => ({ result: await result(client, user, key) })); }
export async function writeMobileReturnCorrection(user: SessionUser, value: string, request: NextRequest): Promise<MobileReturnCorrectionResult> {
  requireMobileReturn(user); const id = mobileContractId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 98304);
  return transaction(user, true, async client => {
    await visible(client, id);
    const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    if (Object.keys(body).some(k => !['item_id', 'revision', 'reason', 'note', 'items', 'settlement'].includes(k)) || !Number.isSafeInteger(body.item_id) || Number(body.item_id) <= 0 || typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision) || typeof body.reason !== 'string' || body.reason.trim().length > 1000 || typeof body.note !== 'string' || body.note.length > 1000 || !Array.isArray(body.items) || !body.items.length || body.items.length > 50 || !object(body.settlement) || typeof body.settlement.revision !== 'string' || !/^[1-9]\d{0,19}$/.test(body.settlement.revision)) throw new MobileError('Thông tin sửa lượt trả chưa hợp lệ.', 400, 'INVALID_RETURN_CORRECTION');
    const { revision, ...rawMoney } = body.settlement, settlement = parseMobileReturnMoney(rawMoney, revision), items = body.items.map(parseReturnInput);
    if (!(await client.query('SELECT id FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2 AND deleted_at IS NULL AND completed_at IS NOT NULL', [body.item_id, id])).rowCount) throw new MobileError('Lượt trả không thuộc hợp đồng đang sửa.', 404, 'NOT_FOUND');
    const input = { item_id: Number(body.item_id), revision: body.revision, reason: body.reason.trim(), note: body.note.trim(), items, settlement: { revision, ...settlement } };
    const receipt = await idempotentMobileWrite(client, user.id, key, `return.correct:${id}`, { id, input }, async () => {
      // Allocate replacement voucher IDs only inside the same atomic transaction.
      // Replay returns the outer original receipt without creating another set.
      const receipt = <T extends object>(v: T) => ({ ...v, request_id: randomUUID() });
      await correctReturn(client, user.id, { ...input, request_id: key, settlement: { order_id: id, revision,
        receipts: settlement.receipts.map(receipt), ...(settlement.refund ? { refund: receipt(settlement.refund) } : {}), ...(settlement.rental_refund ? { rental_refund: receipt(settlement.rental_refund) } : {}),
        ...(settlement.refund_deferred ? { refund_deferred: true } : {}), ...(settlement.refund_recipient ? { refund_recipient: settlement.refund_recipient } : {}) } });
      return { id, revision: String((await visible(client, id)).revision) };
    });
    const found = await result(client, user, key); if (!found) throw new MobileError('Chưa xác nhận được sửa lượt trả. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT');
    return { ...found, receipt: { ...found.receipt, replayed: receipt.replayed } };
  });
}

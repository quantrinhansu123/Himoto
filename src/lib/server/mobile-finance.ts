import "server-only";
import type { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./management-session";
import type { PaymentContext } from "@/lib/management/contract-payments";
import { canAddExtraReceipt, PAYABLE_STATUSES,RENEWABLE_STATUSES, paymentAccounts } from "@/lib/management/contract-payments";
import { hasPermission } from "@/lib/management/permissions";
import { ContractPaymentError, parseContractPayment, readPaymentContext, recordContractPayment } from "./contract-payments";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from "./mobile-writes";
import { MOBILE_PAYMENT_PURPOSES, isMobileFinanceContext, isMobilePaymentReceipt, validPaymentRevision, paymentImpact } from "../../../shared/mobile-finance";
import type { MobileFinanceContext, MobilePaymentInput, MobilePaymentPurpose, MobilePaymentReceipt } from "../../../shared/mobile-finance";

export function mobileFinanceId(value: string) {
  if (!/^[1-9]\d{0,14}$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new MobileError("Mã hợp đồng không hợp lệ.", 400, "INVALID_ID");
  return Number(value);
}
export function requireMobileFinance(user: SessionUser, writing = false) {
  if (!hasPermission(user, "contracts.read") || (writing
    ? !hasPermission(user, "finance.write")
    : !hasPermission(user, "finance.read") && !hasPermission(user, "finance.write")))
    throw new MobileError("Tài khoản không có quyền xem hoặc ghi thu/chi hợp đồng.", 403, "FORBIDDEN");
}
async function transaction<T>(user: SessionUser, writing: boolean, task: (client: PoolClient) => Promise<T>) {
  requireMobileFinance(user, writing);
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(writing ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await task(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ContractPaymentError)
        throw new MobileError(error.message, error.status, error.status === 409 ? "PAYMENT_CONFLICT" : "INVALID_PAYMENT");
      throw error;
    } finally { client.release(); }
  });
}
function purposes(context: PaymentContext): MobilePaymentPurpose[] {
  const result: MobilePaymentPurpose[] = [], active = canAddExtraReceipt(context.status);
  const amounts = context.total_amount !== null && context.paid_amount !== null && context.remaining !== null;
  if (!context.completed_from_hold && amounts && PAYABLE_STATUSES.includes(context.status)) result.push("debt");
  if(!context.completed_from_hold&&!context.billing&&RENEWABLE_STATUSES.includes(context.status)&&context.items.length&&amounts)result.push('renewal');
  if (!context.completed_from_hold && active && (context.deposit_remaining ?? 0) > 0) result.push("deposit");
  if (!context.completed_from_hold && !context.hold_active && active && amounts) result.push("extra");
  if (active && context.deposit_held > 0) result.push("deposit_refund");
  if (active && (context.rental_refundable ?? 0) > 0) result.push("rental_refund");
  return result;
}
function project(context: PaymentContext, user: SessionUser): MobileFinanceContext {
  const result: MobileFinanceContext = {
    id: context.id, code: context.code, status: context.status, storeId: context.store_id,
    revision: context.revision, canWrite: hasPermission(user, "finance.write"),
    totalAmount: context.total_amount, rentalPaid: context.paid_amount, rentalRemaining: context.remaining,
    depositPaid: context.deposit_paid, depositRefunded: context.deposit_refunded, depositHeld: context.deposit_held,
    depositRemaining: context.deposit_remaining ?? 0, rentalRefundable: context.rental_refundable ?? 0,
    holdActive: context.hold_active === true, completedFromHold: context.completed_from_hold === true,
    purposes: purposes(context),
    renewalItems:context.items.map(item=>({id:item.id,vehicleId:item.vehicle_id,name:item.name,license:item.license,revision:item.revision,returnAt:item.return_at,dailyPrice:item.daily_price,renewalAmount:item.renewal_amount})),
    accounts: (["cash", "transfer", "company_transfer"] as const).flatMap((method) =>
      paymentAccounts(context, method).map((row) => ({ id: row.id, method, label: row.label }))),
    billing: context.billing ? {
      expectedTotal: context.billing.expected_total, periodCount: context.billing.period_count,
      paidPeriods: context.billing.paid_periods, dueAmount: context.billing.due_amount,
      remainingToOwn: context.billing.remaining_to_own, nextDueAt: context.billing.next_due_at,
    } : null,
    history: {
      page: context.history_page ?? 1, pages: context.history_pages ?? 1, total: context.history_total ?? context.history.length,
      rows: context.history.map((row) => ({
        id: row.id, direction: row.type, deposit: row.deposit, amount: row.amount, paidAt: row.paid_at,
        method: row.method, account: row.account, note: row.note.slice(0, 2000), noteTruncated: row.note.length > 2000,
        actor: row.actor, status: row.status ?? "approved", renewalVersion: Number.isSafeInteger(row.renewal?.version) && Number(row.renewal?.version) > 0 ? Number(row.renewal?.version) : null,
      })),
    },
    observedAt: new Date().toISOString(),
  };
  if (!isMobileFinanceContext(result))
    throw new MobileError("Số liệu thu/chi cần đối chiếu trước khi thao tác.", 409, "DATA_REVIEW_REQUIRED");
  return result;
}
export async function readMobileFinance(user: SessionUser, value: string, request: NextRequest) {
  requireMobileFinance(user);
  const id = mobileFinanceId(value), params = request.nextUrl.searchParams;
  if ([...params.keys()].some((key) => key !== "page") || params.getAll("page").length > 1 || !/^[1-9]\d{0,5}$/.test(params.get("page") ?? "1") || Number(params.get("page") ?? 1) > 100000)
    throw new MobileError("Trang lịch sử thu/chi không hợp lệ.", 400, "INVALID_PAGE");
  return transaction(user, false, async (client) => project(await readPaymentContext(client, id, { page: Number(params.get("page") ?? 1), size: 25 }), user));
}
async function receipt(client: PoolClient, user: SessionUser, key: string): Promise<MobilePaymentReceipt | null> {
  const row = (await client.query(
    `SELECT r.operation,r.resource_id,r.resource_revision,p.transaction_id FROM himoto.management_mobile_requests r
    LEFT JOIN himoto.management_contract_payments p ON p.request_id=r.request_id AND p.actor_id=r.user_id AND p.order_id=r.resource_id
    WHERE r.user_id=$1 AND r.request_id=$2`, [user.id, key],
  )).rows[0];
  if (!row || row.resource_id == null || !/^payment\.record:[1-9]\d{0,14}$/.test(String(row.operation))) return null;
  const id = Number(row.resource_id), transactionId = Number(row.transaction_id);
  if (!Number.isSafeInteger(id) || id <= 0 || !String(row.operation).endsWith(`:${id}`))
    throw new MobileError("Kết quả thu/chi cần được đối chiếu.", 409, "INVALID_WRITE_RECEIPT");
  const visible = await client.query("SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL", [id]);
  if (!visible.rowCount) throw new MobileError("Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.", 403, "FORBIDDEN");
  // Payment RLS can hide the joined row when the contract leaves this scope.
  // Report current visibility before interpreting that missing transaction.
  if (!Number.isSafeInteger(transactionId) || transactionId <= 0)
    throw new MobileError("Kết quả thu/chi cần được đối chiếu.", 409, "INVALID_WRITE_RECEIPT");
  const found = { id, transactionId, revision: String(row.resource_revision), replayed: true };
  if (!isMobilePaymentReceipt(found)) throw new MobileError("Phiên bản phiếu thu/chi cần đối chiếu.", 409, "INVALID_WRITE_RECEIPT");
  return found;
}
export async function readMobilePaymentReceipt(user: SessionUser, key: string) {
  requireMobileFinance(user, true);
  mobileRequestKey(key);
  return transaction(user, false, async (client) => ({ receipt: await receipt(client, user, key) }));
}
export async function recordMobilePayment(user: SessionUser, value: string, request: NextRequest): Promise<MobilePaymentReceipt> {
  requireMobileFinance(user, true);
  const id = mobileFinanceId(value), key = mobileRequestKey(request.headers.get("idempotency-key")), body = await mobileBody(request, 16384);
  if (Object.keys(body).some((key) => !["revision", "expected_total", "expected_remaining", "purpose", "amount", "method", "account_id", "paid_at", "note", "items", "acknowledge_overpayment"].includes(key)) ||
      !validPaymentRevision(body.revision) || ![body.expected_total, body.expected_remaining].every((v) => v === null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0)) ||
      !MOBILE_PAYMENT_PURPOSES.includes(body.purpose as MobilePaymentPurpose) || ("acknowledge_overpayment" in body && body.acknowledge_overpayment !== true))
    throw new MobileError("Thông tin thu/chi không hợp lệ.", 400, "INVALID_PAYMENT");
  try {
    const { purpose, expected_total, expected_remaining, acknowledge_overpayment: acknowledgement, ...fields } = body;
    if(purpose!=='renewal'&&'items'in fields)throw new MobileError('Chỉ chọn xe khi ghi thu tiền và gia hạn.',400,'INVALID_PAYMENT');
    const input = parseContractPayment({ ...fields, request_id: key, ...(purpose === "debt" ? {} : { purpose }) });
    // Fingerprints use the shared parser's trimmed/normalized values.
    const normalized: MobilePaymentInput = { revision: input.revision, expected_total: expected_total as number | null, expected_remaining: expected_remaining as number | null, amount: input.amount, purpose: purpose as MobilePaymentPurpose,
      method: input.method, account_id: input.account_id, paid_at: input.paid_at, note: input.note,
      ...(acknowledgement === true ? { acknowledge_overpayment: true } : {}),
      ...(input.items?{items:input.items}:{}),
    };
    return await transaction(user, true, async (client) => {
      const saved = await idempotentMobileWrite(client, user.id, key, `payment.record:${id}`, { id, input: normalized }, async () => {
        // Freeze installment accrual at one server time for validation and the
        // domain write. A month/day boundary must not change a reviewed total
        // between these calls, even if PostgreSQL xmin stays the same.
        const readOptions = { page: 1, size: 0, asOf: Date.now() };
        const context = await readPaymentContext(client, id, readOptions);
        if (normalized.expected_total !== context.total_amount || normalized.expected_remaining !== context.remaining)
          throw new MobileError("Số dư đã thay đổi từ lúc rà soát. Đối chiếu và tải lại số liệu trước khi ghi.", 409, "PAYMENT_CONFLICT");
        if (!purposes(context).includes(normalized.purpose))
          throw new MobileError("Nghiệp vụ này không còn khả dụng. Đối chiếu số liệu mới trước khi ghi.", 409, "PAYMENT_CONFLICT");
        const impact = paymentImpact({ totalAmount: context.total_amount, rentalRemaining: context.remaining }, normalized.purpose, Number(input.amount));
        if (impact.overpayment && acknowledgement !== true)
          throw new MobileError("Số tiền thu vượt số còn thiếu. Xác nhận tác động tới tổng hợp đồng trước khi ghi.", 409, "OVERPAYMENT_ACK_REQUIRED");
        const result = await recordContractPayment(client, id, user.id, input, readOptions);
        if (!Number.isSafeInteger(result.transaction_id) || result.transaction_id <= 0)
          throw new MobileError("Chưa xác nhận được phiếu thu/chi. Giữ mã để đối chiếu.", 503, "INVALID_WRITE_RECEIPT");
        return { id, revision: result.context.revision };
      });
      const found = await receipt(client, user, key);
      if (!found) throw new MobileError("Chưa tìm thấy phiếu thu/chi đã ghi. Giữ mã để đối chiếu.", 503, "INVALID_WRITE_RECEIPT");
      return { ...found, replayed: saved.replayed };
    });
  } catch (error) {
    if (error instanceof ContractPaymentError) throw new MobileError(error.message, error.status, "INVALID_PAYMENT");
    throw error;
  }
}

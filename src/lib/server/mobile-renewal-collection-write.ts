import "server-only";
import type { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./management-session";
import { isMobileRenewalCollectionReceipt, type MobileRenewalCollectionReceipt } from "../../../shared/mobile-renewal-collection";
import { validPaymentRevision } from "../../../shared/mobile-finance";
import { requireMobileFinance, mobileFinanceId } from "./mobile-finance";
import { ContractPaymentError, parseContractPayment, recordContractPayment } from "./contract-payments";
import { readRenewalCollectionContext } from "./mobile-renewal-collection";
import { renewalCollectionPeriod, RenewalCollectionPeriodError } from "./renewal-collection-period";
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from "./mobile-writes";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";

async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireMobileFinance(user, write);
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const result = await task(client); await client.query("COMMIT"); return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ContractPaymentError) throw new MobileError(error.message, error.status, "RENEWAL_COLLECTION_CONFLICT");
      if (error instanceof RenewalCollectionPeriodError) throw new MobileError(error.message, 409, "RENEWAL_COLLECTION_REVIEW_REQUIRED");
      throw error;
    } finally { client.release(); }
  });
}
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
const nullableIso = (value: unknown) => value == null ? null : iso(value);
async function receipt(client: PoolClient, user: SessionUser, key: string): Promise<MobileRenewalCollectionReceipt | null> {
  const row = (await client.query(`SELECT r.operation,r.resource_id,r.resource_revision,c.*
    FROM himoto.management_mobile_requests r LEFT JOIN himoto.management_mobile_renewal_collections c
      ON c.user_id=r.user_id AND c.request_id=r.request_id AND c.order_id=r.resource_id
    WHERE r.user_id=$1 AND r.request_id=$2`, [user.id, key])).rows[0];
  if (!row || row.resource_id == null || !String(row.operation).startsWith("payment.renewal:")) return null;
  const id = Number(row.resource_id);
  if (!Number.isSafeInteger(id) || id <= 0 || row.operation !== `payment.renewal:${id}`)
    throw new MobileError("Kết quả thu theo kỳ cần đối chiếu.", 409, "INVALID_WRITE_RECEIPT");
  const order = (await client.query("SELECT draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL", [id])).rows[0];
  if (!order) throw new MobileError("Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.", 403, "FORBIDDEN");
  if (row.transaction_id == null) throw new MobileError("Chưa có đủ phiếu thu theo kỳ. Giữ mã để đối chiếu.", 503, "INVALID_WRITE_RECEIPT");
  const result: MobileRenewalCollectionReceipt = {
    id, revision: String(row.resource_revision), replayed: true, version: Number(row.renewal_version), transactionId: Number(row.transaction_id),
    amount: Number(row.amount), periodAmount: Number(row.period_amount), collectedBefore: Number(row.collected_before),
    remainingAfter: Number(row.period_amount) - Number(row.collected_before) - Number(row.amount), itemId: Number(row.item_id), vehicleId: Number(row.vehicle_id),
    beforeReturnAt: nullableIso(row.before_return_at), returnAt: iso(row.return_at), periodCreatedAt: nullableIso(row.period_created_at),
    method: row.method, accountId: Number(row.account_id), paidAt: iso(row.paid_at), billRevision: String(row.bill_revision), current: false, billCurrent: false,
  };
  if (!isMobileRenewalCollectionReceipt(result)) throw new MobileError("Phiếu thu theo kỳ cần đối chiếu.", 409, "INVALID_WRITE_RECEIPT");
  const payment = (await client.query(`SELECT t.name,t.type,t.status,t.value,t.created_at,t.bank_id,t.cash_id,t.bank_owner_type,p.renewal_payload
    FROM himoto.transactions t LEFT JOIN himoto.management_contract_payments p ON p.transaction_id=t.id AND p.order_id=t.order_id AND p.request_id=$3 AND p.actor_id=$4
    WHERE t.id=$1 AND t.order_id=$2`, [result.transactionId, id, key, user.id])).rows[0];
  try {
    const period = renewalCollectionPeriod(id, order.draft_payload?.management_composer?.versions, result.version, []);
    const linked = payment?.renewal_payload;
    result.current = period.itemId === result.itemId && period.vehicleId === result.vehicleId && period.amount === result.periodAmount &&
      period.returnAt === result.returnAt && period.beforeReturnAt === result.beforeReturnAt && period.createdAt === result.periodCreatedAt &&
      payment?.name === "order:payment" && payment.type === "in" && payment.status === "approved" && Number(payment.value) === result.amount && iso(payment.created_at) === result.paidAt &&
      Number(linked?.version) === result.version && Number(linked?.item_id) === result.itemId && Number(linked?.amount) === result.periodAmount &&
      nullableIso(linked?.before_return_at) === result.beforeReturnAt && nullableIso(linked?.created_at) === result.periodCreatedAt && iso(linked?.return_at) === result.returnAt &&
      (result.method === "cash" ? Number(payment.cash_id) === result.accountId && payment.bank_id == null :
        Number(payment.bank_id) === result.accountId && payment.cash_id == null && (result.method === "company_transfer" ? payment.bank_owner_type === "company" : payment.bank_owner_type !== "company"));
  } catch (error) {
    // A later malformed/deleted period does not erase the original receipt.
    if (!(error instanceof RenewalCollectionPeriodError) && !(error instanceof RangeError)) throw error;
  }
  const photo = (await client.query(`SELECT xmin::text AS revision FROM himoto.management_record_photos
    WHERE entity_type='contracts' AND entity_id=$1 AND slot=$2`, [id, `renewal-${result.version}-document-1`])).rows[0];
  result.billCurrent = photo?.revision === result.billRevision;
  return result;
}
export async function readMobileRenewalCollectionReceipt(user: SessionUser, key: string) {
  requireMobileFinance(user); mobileRequestKey(key);
  return transaction(user, false, async client => ({ receipt: await receipt(client, user, key) }));
}
export async function recordMobileRenewalCollection(user: SessionUser, value: string, versionValue: string, request: NextRequest): Promise<MobileRenewalCollectionReceipt> {
  requireMobileFinance(user, true);
  const id = mobileFinanceId(value), version = mobileFinanceId(versionValue), key = mobileRequestKey(request.headers.get("idempotency-key")), body = await mobileBody(request, 16384);
  const money = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 9_999_999_999_999;
  if (Object.keys(body).some(name => !["version", "snapshot", "revision", "expected_total", "expected_remaining", "amount", "method", "account_id", "paid_at", "note", "bill_revision", "acknowledge_overpayment"].includes(name)) ||
    version < 2 || body.version !== version || typeof body.snapshot !== "string" || !/^[a-f0-9]{64}$/.test(body.snapshot) ||
    !validPaymentRevision(body.revision) || !validPaymentRevision(body.bill_revision) || !money(body.expected_total) || !money(body.expected_remaining) ||
    (body.acknowledge_overpayment !== undefined && body.acknowledge_overpayment !== true))
    throw new MobileError("Thông tin thu theo kỳ hoặc bill đã rà soát chưa hợp lệ.", 400, "INVALID_RENEWAL_COLLECTION");
  let input;
  try { input = parseContractPayment({ request_id: key, revision: body.revision, amount: body.amount, method: body.method, account_id: body.account_id, paid_at: body.paid_at, note: body.note, renewal_version: version }); }
  catch (error) { if (error instanceof ContractPaymentError) throw new MobileError(error.message, error.status, "INVALID_RENEWAL_COLLECTION"); throw error; }
  return transaction(user, true, async client => {
    const saved = await idempotentMobileWrite(client, user.id, key, `payment.renewal:${id}`, { id, version, input, snapshot: body.snapshot, expectedTotal: body.expected_total, expectedRemaining: body.expected_remaining, bill: body.bill_revision, overpayment: body.acknowledge_overpayment === true }, async () => {
      const locked = (await client.query("SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id])).rows[0];
      if (!locked) throw new MobileError("Không tìm thấy hợp đồng.", 404, "NOT_FOUND");
      if (locked.revision !== input.revision) throw new MobileError("Hợp đồng vừa thay đổi. Đối chiếu trước khi thu theo kỳ.", 409, "RENEWAL_COLLECTION_CONFLICT");
      const before = await readRenewalCollectionContext(client, user, id, version);
      if (!before.available || before.period.snapshot !== body.snapshot || before.totalAmount !== body.expected_total || before.rentalRemaining !== body.expected_remaining || Number(input.amount) > before.period.remaining)
        throw new MobileError(before.blockedReason || "Kỳ gia hạn hoặc số tiền còn thu đã thay đổi. Rà soát lại trước khi ghi.", 409, "RENEWAL_COLLECTION_CONFLICT");
      if (Number(input.amount) > before.rentalRemaining! && body.acknowledge_overpayment !== true)
        throw new MobileError("Khoản thu vượt số tiền hợp đồng còn thiếu. Xác nhận rõ khoản đã thực nhận; tổng hợp đồng sẽ được giữ nguyên.", 409, "OVERPAYMENT_ACK_REQUIRED");
      const photo = (await client.query(`SELECT xmin::text AS revision,mime_type FROM himoto.management_record_photos
        WHERE entity_type='contracts' AND entity_id=$1 AND slot=$2 FOR SHARE`, [id, `renewal-${version}-document-1`])).rows[0];
      if (!photo || photo.revision !== body.bill_revision || !["image/jpeg", "image/png", "image/webp"].includes(photo.mime_type))
        throw new MobileError("Bill đã thay đổi hoặc chưa được lưu. Rà soát đúng ảnh của kỳ gia hạn.", 409, "RENEWAL_COLLECTION_CONFLICT");
      const payment = await recordContractPayment(client, id, user.id, input, { page: 1, size: 0 });
      const after = await readRenewalCollectionContext(client, user, id, version);
      if (after.totalAmount !== before.totalAmount || after.period.amount !== before.period.amount || after.period.returnAt !== before.period.returnAt ||
        after.period.beforeReturnAt !== before.period.beforeReturnAt || after.period.collected !== before.period.collected + Number(input.amount))
        throw new MobileError("Chưa xác nhận được khoản thu theo đúng kỳ. Giữ mã để đối chiếu.", 503, "INVALID_WRITE_RECEIPT");
      await client.query(`INSERT INTO himoto.management_mobile_renewal_collections(user_id,request_id,order_id,renewal_version,transaction_id,item_id,vehicle_id,
        before_return_at,return_at,period_created_at,period_amount,collected_before,amount,method,account_id,paid_at,bill_revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [user.id,key,id,version,payment.transaction_id,before.period.itemId,before.period.vehicleId,before.period.beforeReturnAt,before.period.returnAt,before.period.createdAt,
        before.period.amount,before.period.collected,Number(input.amount),input.method,input.account_id,`${input.paid_at}:00+07:00`,body.bill_revision]);
      return { id, revision: after.revision };
    });
    const found = await receipt(client, user, key);
    if (!found) throw new MobileError("Chưa tìm thấy phiếu thu theo kỳ. Giữ mã để đối chiếu.", 503, "INVALID_WRITE_RECEIPT");
    return { ...found, replayed: saved.replayed };
  });
}

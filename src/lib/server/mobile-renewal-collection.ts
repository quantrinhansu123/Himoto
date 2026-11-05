import "server-only";
import type { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { PAYABLE_STATUSES, paymentAccounts } from "@/lib/management/contract-payments";
import { requireMobileFinance, mobileFinanceId } from "./mobile-finance";
import { ContractPaymentError, readPaymentContext } from "./contract-payments";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { renewalCollectionPeriod, RenewalCollectionPeriodError } from "./renewal-collection-period";
import { isMobileRenewalCollectionPreparation, isMobileRenewalPeriods, type MobileRenewalCollectionPreparation, type MobileRenewalPeriods } from "../../../shared/mobile-renewal-collection";

/** Read-only preparation for collecting a previously saved renewal's remaining
 * rental fee. It neither extends a date nor imports a fee into the contract.
 * The writer reuses this projection inside its locked transaction.
 */
export async function readMobileRenewalCollection(user: SessionUser, value: string, versionValue: string, request: NextRequest): Promise<MobileRenewalCollectionPreparation> {
  requireMobileFinance(user);
  const id = mobileFinanceId(value), version = mobileFinanceId(versionValue);
  if (version < 2 || [...request.nextUrl.searchParams].length)
    throw new MobileError("Phiên bản hoặc bộ lọc khoản thu gia hạn không hợp lệ.", 400, "INVALID_RENEWAL_COLLECTION");
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await readRenewalCollectionContext(client,user,id,version);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ContractPaymentError)
        throw new MobileError(error.message, error.status, error.status === 404 ? "NOT_FOUND" : "RENEWAL_COLLECTION_CONFLICT");
      if (error instanceof RenewalCollectionPeriodError)
        throw new MobileError(error.message, 409, "RENEWAL_COLLECTION_REVIEW_REQUIRED");
      throw error;
    } finally { client.release(); }
  });
}

/** Discover actual saved versions; never infer them from nextVersion or receipts. */
export async function readMobileRenewalPeriods(user: SessionUser, value: string, request: NextRequest): Promise<MobileRenewalPeriods> {
  requireMobileFinance(user);
  const id = mobileFinanceId(value), params = request.nextUrl.searchParams, rawPage = params.get("page") ?? "1";
  if ([...params].some(([name]) => name !== "page") || params.getAll("page").length > 1 || !/^[1-9]\d{0,3}$/.test(rawPage))
    throw new MobileError("Trang kỳ gia hạn không hợp lệ.", 400, "INVALID_RENEWAL_COLLECTION");
  const page = Number(rawPage);
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const context = await readPaymentContext(client, id, { page: 1, size: 0, asOf: Date.now() });
      const order = (await client.query("SELECT draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL", [id])).rows[0];
      if (!order) throw new MobileError("Không tìm thấy hợp đồng.", 404, "NOT_FOUND");
      const saved = order.draft_payload?.management_composer?.versions ?? [];
      if (!Array.isArray(saved) || saved.length > 10000) throw new RenewalCollectionPeriodError("Lịch sử gia hạn cần đối chiếu.");
      const versions: number[] = [];
      for (const row of saved) {
        if (!row || typeof row !== "object" || row.kind !== "renewal") continue;
        if (!(typeof row.version === "number" || typeof row.version === "string" && /^[1-9]\d{0,14}$/.test(row.version)) ||
          !Number.isSafeInteger(Number(row.version)) || Number(row.version) < 2 || Number(row.version) > 999999999999999)
          throw new RenewalCollectionPeriodError("Có kỳ gia hạn chưa có số phiên bản rõ ràng. Đối chiếu hồ sơ trước khi thu.");
        versions.push(Number(row.version));
      }
      if (new Set(versions).size !== versions.length) throw new RenewalCollectionPeriodError("Có kỳ gia hạn trùng phiên bản. Đối chiếu trước khi thu.");
      versions.sort((a, b) => b - a);
      const pages = Math.max(1, Math.ceil(versions.length / 25));
      if (page > pages) throw new MobileError("Trang kỳ gia hạn không còn tồn tại. Tải lại danh sách.", 400, "INVALID_PAGE");
      const selected = versions.slice((page - 1) * 25, page * 25);
      const grouped = selected.length ? await client.query(`SELECT selected.version,g.* FROM unnest($2::text[]) selected(version)
        CROSS JOIN LATERAL (SELECT jsonb_build_object('item_id',r.renewal_payload->'item_id','created_at',r.renewal_payload->'created_at',
            'before_return_at',r.renewal_payload->'before_return_at','return_at',r.renewal_payload->'return_at') AS period,sum(t.value::numeric)::text AS amount
          FROM himoto.management_contract_payments r JOIN himoto.transactions t ON t.id=r.transaction_id AND t.order_id=r.order_id
          WHERE r.order_id=$1 AND r.renewal_payload->>'version'=selected.version AND t.status='approved' AND t.type='in'
          GROUP BY 1 LIMIT 1001) g`, [id, selected.map(String)]) : {rows:[]};
      const blockedReason = collectionBlockedReason(context);
      const result = { id, code: context.code, canWrite: hasPermission(user,"finance.write"), available: blockedReason === null, blockedReason,
        page, pages, total: versions.length, rows: selected.map(version => renewalCollectionPeriod(id, saved, version,
          grouped.rows.filter(row => row.version === String(version)).map(row => ({ version: row.version, period: row.period, amount: row.amount })))) };
      if (!isMobileRenewalPeriods(result)) throw new RenewalCollectionPeriodError("Danh sách kỳ gia hạn cần đối chiếu.");
      await client.query("COMMIT"); return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ContractPaymentError) throw new MobileError(error.message, error.status, error.status === 404 ? "NOT_FOUND" : "RENEWAL_COLLECTION_CONFLICT");
      if (error instanceof RenewalCollectionPeriodError) throw new MobileError(error.message,409,"RENEWAL_COLLECTION_REVIEW_REQUIRED");
      throw error;
    } finally { client.release(); }
  });
}

function collectionBlockedReason(context: Awaited<ReturnType<typeof readPaymentContext>>) {
  return context.billing ? "Thuê sở hữu thu theo lịch đã lập, không cộng hoặc thu lại như phí gia hạn."
    : context.completed_from_hold ? "Hợp đồng đã hoàn thành sau bảo lưu; đối chiếu khoản được miễn trước khi thu."
    : !PAYABLE_STATUSES.includes(context.status) ? "Trạng thái hợp đồng hiện chưa cho phép thu tiền."
    : context.total_amount === null || context.paid_amount === null ? "Số liệu hợp đồng cần đối chiếu trước khi thu." : null;
}

/** Caller owns the scoped transaction; writes reuse the exact reviewed projection. */
export async function readRenewalCollectionContext(client: PoolClient, user: SessionUser, id: number, version: number): Promise<MobileRenewalCollectionPreparation> {
  requireMobileFinance(user);
  const context = await readPaymentContext(client, id, { page: 1, size: 0, asOf: Date.now() });
  const order = (await client.query("SELECT draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL", [id])).rows[0];
  if (!order) throw new MobileError("Không tìm thấy hợp đồng.", 404, "NOT_FOUND");
  // Aggregate repeated partial receipts before projection, without loading
  // the whole cashbook. The domain uses the same exact saved version text.
  const grouped = await client.query(`SELECT jsonb_build_object(
      'item_id',r.renewal_payload->'item_id','created_at',r.renewal_payload->'created_at',
      'before_return_at',r.renewal_payload->'before_return_at','return_at',r.renewal_payload->'return_at') AS period,
      sum(t.value::numeric)::text AS amount
    FROM himoto.management_contract_payments r JOIN himoto.transactions t
      ON t.id=r.transaction_id AND t.order_id=r.order_id
    WHERE r.order_id=$1 AND r.renewal_payload->>'version'=$2 AND t.status='approved' AND t.type='in'
    GROUP BY 1 LIMIT 1001`, [id, String(version)]);
  const period = renewalCollectionPeriod(id, order.draft_payload?.management_composer?.versions, version,
    grouped.rows.map(row => ({ version: String(version), period: row.period, amount: row.amount })));
  const blockedReason = collectionBlockedReason(context) ?? (period.remaining === 0 ? "Phiên bản gia hạn này không còn tiền thuê phải thu." : null);
  const result = {
    id: context.id, code: context.code, storeId: context.store_id, revision: context.revision,
    totalAmount: context.total_amount, rentalPaid: context.paid_amount, rentalRemaining: context.remaining,
    canWrite: hasPermission(user, "finance.write"), available: blockedReason === null, blockedReason, period,
    accounts: (["cash", "transfer", "company_transfer"] as const).flatMap(method =>
      paymentAccounts(context, method).map(account => ({ id: account.id, method, label: account.label }))),
    observedAt: new Date().toISOString(),
  };
  if (!isMobileRenewalCollectionPreparation(result))
    throw new MobileError("Số liệu thu theo kỳ gia hạn cần đối chiếu.", 409, "RENEWAL_COLLECTION_REVIEW_REQUIRED");
  return result;
}

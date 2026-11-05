import "server-only";
import type { PoolClient } from "pg";
import { loadContractReturnableItems,ContractReturnError } from "./contract-returns";
import type { NextRequest } from "next/server";
import { hasPermission } from "@/lib/management/permissions";
import { paymentAccounts } from "@/lib/management/contract-payments";
import type { PaymentContext } from "@/lib/management/contract-payments";
import type { MobileRenewalPreparation } from "../../../shared/mobile-renewals";
import { isMobileRenewalPreparation } from "../../../shared/mobile-renewals";
import type { SessionUser } from "./management-session";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { mobileFinanceId } from "./mobile-finance";
import { ContractPaymentError, readPaymentContext } from "./contract-payments";
import { nextContractRenewalVersion } from "./contract-renewal-version";

export function requireMobileRenewal(user: SessionUser) {
  if (!hasPermission(user, "contracts.read") || !hasPermission(user, "contracts.renew"))
    throw new MobileError("Tài khoản không có quyền gia hạn hợp đồng.", 403, "FORBIDDEN");
}
const searchText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
export function mobileRenewalBlockedReason(context: PaymentContext, hasInstallments: boolean, backfill=false, itemCount=context.items.length) {
  return hasInstallments ? "Thuê sở hữu đóng tiền theo lịch đã lập; không cộng kỳ đóng tiền thành phí gia hạn."
    : context.completed_from_hold ? "Hợp đồng đã hoàn thành sau bảo lưu."
    : !backfill && context.hold_active ? "Hợp đồng đang bảo lưu; cần xử lý bảo lưu trước khi gia hạn."
    : !(backfill ? ["renting","overdue","wait_payment","completed","bad_debt"] : ["renting", "overdue", "wait_payment"]).includes(context.status) ? "Chỉ gia hạn hợp đồng đang thuê, quá hạn hoặc chờ thanh toán còn xe chưa trả."
    : itemCount === 0 ? "Hợp đồng không còn xe đang thuê."
    : !backfill && (context.total_amount === null || context.paid_amount === null) ? "Số liệu hợp đồng cần đối chiếu trước khi gia hạn."
    : null;
}

export async function mobileRenewalItems(client:PoolClient,id:number,context:PaymentContext,backfill:boolean):Promise<MobileRenewalPreparation["items"]["rows"]>{
  if(backfill)return(await loadContractReturnableItems(client,id,true)).map(item=>({id:item.item_id,vehicleId:item.vehicle_id,name:item.vehicle_name,license:item.license,revision:item.item_revision,returnAt:item.scheduled_return_at,dailyPrice:item.daily_price,renewalAmount:null,startedAt:item.scheduled_start_at,completedAt:item.completed_at}));
  return context.items.map(item=>({id:item.id,vehicleId:item.vehicle_id,name:item.name,license:item.license,revision:item.revision,returnAt:item.return_at,dailyPrice:item.daily_price,renewalAmount:item.renewal_amount}));
}

export async function readMobileRenewalPreparation(user: SessionUser, value: string, request: NextRequest): Promise<MobileRenewalPreparation> {
  requireMobileRenewal(user);
  const id = mobileFinanceId(value), params = request.nextUrl.searchParams;
  const backfill=params.get("backfill")==="1";
  if (params.has("backfill")&&!backfill || [...params.keys()].some(key => !["page", "search", "backfill"].includes(key)) || ["page", "search", "backfill"].some(key => params.getAll(key).length > 1) ||
    !/^[1-9]\d{0,5}$/.test(params.get("page") ?? "1") || Number(params.get("page") ?? 1) > 100000 || (params.get("search") ?? "").length > 80)
    throw new MobileError("Bộ lọc xe gia hạn không hợp lệ.", 400, "INVALID_QUERY");
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const context = await readPaymentContext(client, id, { page: 1, size: 0, asOf: Date.now() });
      const order = (await client.query("SELECT draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL", [id])).rows[0];
      if (!order) throw new MobileError("Không tìm thấy hợp đồng.", 404, "NOT_FOUND");
      const composer = order.draft_payload?.management_composer;
      const nextVersion = await nextContractRenewalVersion(client, id, composer?.versions);
      const slot = `renewal-${nextVersion}-document-1`;
      const evidence = await client.query(`SELECT 1 FROM himoto.management_record_photos
        WHERE entity_type='contracts' AND entity_id=$1 AND
          (slot=$2 OR slot LIKE $3 OR regexp_replace(slot,'-extra-[1-9][0-9]{0,14}$','')=$2) LIMIT 1`, [id, slot, `renewal-${nextVersion}-document-%`]);
      const availableItems=await mobileRenewalItems(client,id,context,backfill);
      const blockedReason = mobileRenewalBlockedReason(context, !!composer?.installment_plan,backfill,availableItems.length);
      const term = searchText((params.get("search") ?? "").trim());
      const items = availableItems.filter(item => searchText(`${item.name} ${item.license}`).includes(term));
      const pages = Math.max(1, Math.ceil(items.length / 25)), page = Math.min(Number(params.get("page") ?? 1), pages);
      const result: MobileRenewalPreparation = {
        id: context.id, code: context.code, status: context.status, storeId: context.store_id, revision: context.revision,
        available: blockedReason === null, blockedReason, nextVersion,...(backfill?{backfill:true as const}:{}),
        totalAmount: context.total_amount, rentalPaid: context.paid_amount, rentalRemaining: context.remaining,
        items: { page, pages, total: items.length, rows: items.slice((page-1)*25, page*25) },
        accounts: (["cash", "transfer", "company_transfer"] as const).flatMap(method => paymentAccounts(context, method).map(account => ({id:account.id,method,label:account.label}))),
        evidence: {requiredForCollection:true,slot,present:!!evidence.rowCount}, observedAt:new Date().toISOString(),
      };
      if (!isMobileRenewalPreparation(result)) throw new MobileError("Số liệu gia hạn cần kiểm tra trên web trước khi tiếp tục.", 409, "DATA_REVIEW_REQUIRED");
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ContractPaymentError || error instanceof ContractReturnError) throw new MobileError(error.message,error.status,error.status===404?"NOT_FOUND":"RENEWAL_CONFLICT");
      throw error;
    } finally { client.release(); }
  });
}

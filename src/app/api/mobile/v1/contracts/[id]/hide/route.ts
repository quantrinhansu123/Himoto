import { NextRequest } from "next/server";
import { hasPermission } from "@/lib/management/permissions";
import { requireMobileSession, MobileError } from "@/lib/server/mobile-session";
import { mobileContractId } from "@/lib/server/mobile-contracts";
import { withMobileData } from "@/lib/server/mobile-context";
import { himotoPool } from "@/lib/server/himoto-database";
import { VEHICLE_ORDER_SQL } from "@/lib/server/contract-classification";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { user } = await requireMobileSession(request);
    if (!hasPermission(user, "contracts.delete") || !hasPermission(user, "contracts.read")) {
      throw new MobileError("Tài khoản chưa được cấp quyền ẩn hợp đồng.", 403, "FORBIDDEN");
    }
    const id = mobileContractId((await context.params).id);
    const result = await withMobileData(user, "", async () => {
      const client = await himotoPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout='5s'");
        const row = (
          await client.query(
            `SELECT id,order_status FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} FOR UPDATE`,
            [id],
          )
        ).rows[0];
        if (!row) throw new MobileError("Không tìm thấy hợp đồng.", 404, "NOT_FOUND");
        if (row.order_status !== "completed") {
          throw new MobileError("Chỉ ẩn được hợp đồng đã hoàn thành.", 409, "INVALID_STATUS");
        }
        await client.query("UPDATE himoto.orders SET deleted_at=now(),updated_at=now() WHERE id=$1", [id]);
        await client.query("COMMIT");
        return { id, hidden: true as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    });
    return mobileJson(result);
  } catch (error) {
    return mobileFailure(error);
  }
}

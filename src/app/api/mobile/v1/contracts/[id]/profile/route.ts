import { NextRequest } from "next/server";
import { hasPermission } from "@/lib/management/permissions";
import { canEditIssuedContract } from "@/lib/management/contract-profile";
import { requireMobileSession, MobileError } from "@/lib/server/mobile-session";
import { mobileContractId } from "@/lib/server/mobile-contracts";
import { withMobileData } from "@/lib/server/mobile-context";
import { himotoPool } from "@/lib/server/himoto-database";
import { mobileBody } from "@/lib/server/mobile-writes";
import { updateContractProfile, ContractProfileError } from "@/lib/server/contract-profile";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { user } = await requireMobileSession(request);
    if (!hasPermission(user, "contracts.read") || !canEditIssuedContract(user, user.store_id)) {
      throw new MobileError("Tài khoản chưa được cấp quyền bổ sung hồ sơ hợp đồng.", 403, "FORBIDDEN");
    }
    const id = mobileContractId((await context.params).id);
    const body = await mobileBody(request, 262144);
    const saved = await withMobileData(user, "", async () => {
      const client = await himotoPool.connect();
      try {
        await client.query("BEGIN");
        const result = await updateContractProfile(client, id, user.id, body, { allowIncomplete: true });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        if (error instanceof ContractProfileError) {
          throw new MobileError(error.message, error.status, error.status === 409 ? "CONTRACT_CHANGED" : "INVALID_PROFILE");
        }
        throw error;
      } finally {
        client.release();
      }
    });
    return mobileJson({ id, revision: saved.revision, code: saved.code });
  } catch (error) {
    return mobileFailure(error);
  }
}

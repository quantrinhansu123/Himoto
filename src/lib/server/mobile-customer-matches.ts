import "server-only";
import type { NextRequest } from "next/server";
import { hasPermission, isAdminAccount } from "@/lib/management/permissions";
import { customerDetails, relativesFromRow } from "@/lib/management/contract-document";
import { mapApiRow } from "@/lib/management/repository";
import { customerMatchIdentity, type MobileCustomerMatches } from "../../../shared/mobile-customer-matches";
import type { SessionUser } from "./management-session";
import { CUSTOMER_PROFILE_SQL, CUSTOMER_SEARCH_SQL } from "./customer-search";
import { ownerDatabase, himotoPool } from "./himoto-database";
import { withMobileData } from "./mobile-context";
import { MobileError } from "./mobile-session";
import { mobileBody } from "./mobile-writes";

export async function readMobileCustomerMatches(user: SessionUser, request: NextRequest): Promise<MobileCustomerMatches> {
  if (!hasPermission(user, "customers.read") || !hasPermission(user, "customers.write"))
    throw new MobileError("Tài khoản không có quyền kiểm tra hồ sơ trùng.", 403, "FORBIDDEN");
  if (request.nextUrl.searchParams.size) throw new MobileError("Bộ lọc hồ sơ trùng không hợp lệ.");
  const parsed = customerMatchIdentity(await mobileBody(request, 4096));
  if (!parsed) throw new MobileError("Nhập số giấy tờ hoặc điện thoại đã dùng khi lưu khách hàng.");
  const identity = parsed;
  // Same explicit, exact global lookup purpose as CustomerCreateDialog. This
  // owner connection is read-only; no actor/scope override reaches a writer.
  async function read(pool: Pick<typeof ownerDatabase, "connect">) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='10s'");
      const documents = identity.id !== null ? (await client.query(`${CUSTOMER_PROFILE_SQL} WHERE c.id=$1 LIMIT 1`, [identity.id])).rows : identity.idCard ? (await client.query(
        `${CUSTOMER_PROFILE_SQL} WHERE upper(regexp_replace(COALESCE(c.id_card,''),'[[:space:]]','','g'))=$1 ORDER BY c.id DESC LIMIT 11`,
        [identity.idCard],
      )).rows : [];
      const contacts = identity.id === null && /^\d{6,15}$/.test(identity.phoneDigits) ? (await client.query(`${CUSTOMER_SEARCH_SQL} LIMIT 11`, [identity.phoneDigits])).rows : [];
      const unique = [...new Map([...documents, ...contacts].map((row) => [Number(row.id), row])).values()];
      const result: MobileCustomerMatches = {
        ...identity,
        hasMore: unique.length > 10 || documents.length > 10 || contacts.length > 10,
        rows: unique.slice(0, 10).map((raw) => {
          const row = mapApiRow("customers", raw);
          return {
            customer: {
              id: row.id, storeId: row.store_id == null ? null : Number(row.store_id),
              storeName: String(row.store_name || ""), status: row.status,
              details: customerDetails(row), relatives: relativesFromRow(row),
            },
            canEdit: isAdminAccount(user) || user.scope_all === true || row.store_id != null && Number(row.store_id) === user.store_id,
          };
        }),
      };
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  // ID-based reload/edit is scoped; only an explicit exact identity lookup may
  // read a foreign profile, with the same limited purpose as the web form.
  return identity.id !== null ? withMobileData(user, "", () => read(himotoPool)) : read(ownerDatabase);
}

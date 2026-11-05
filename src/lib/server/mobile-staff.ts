import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { staffPositionSuggestions } from "@/lib/management/staff-positions";
import { withMobileData } from "./mobile-context";
import { himotoPool, ownerDatabase } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { AccountAccessError } from "./account-management";
import { AccountPasswordError } from "./account-passwords";
import { requireStaffAccountScope } from "./staff-accounts";
import { parseStaffProfile, saveDatabaseStaff } from "./staff-profile-write";
import { bulkDelete, BulkDeleteError } from "./bulk-delete";
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from "./mobile-writes";
import { isStaffProfile, type MobileStaffProfile, type MobileStaffResult, type MobileStaffCredentials, type MobileStaffWriteResult, type MobileStaffOptions } from "../../../shared/mobile-staff";

function allowed(user: SessionUser, write = false) {
  if (!hasPermission(user, write ? "hr.write" : "hr.read")) throw new MobileError("Tài khoản không có quyền thực hiện thao tác nhân sự.", 403, "FORBIDDEN");
}
function staffId(raw: string) {
  if (!/^[1-9]\d{0,14}$/.test(raw)) throw new MobileError("Mã nhân sự không hợp lệ.");
  return Number(raw);
}
async function transaction<T>(user: SessionUser, read: boolean, owner: boolean, run: (client: PoolClient) => Promise<T>) {
  return withMobileData(user, "", async () => {
    const client = await (owner ? ownerDatabase : himotoPool).connect();
    try {
      await client.query(read ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      await client.query("SET LOCAL statement_timeout='20s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const value = await run(client); await client.query("COMMIT"); return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof AccountAccessError || error instanceof AccountPasswordError || error instanceof BulkDeleteError) throw new MobileError(error.message, error.status, error.status === 409 ? "CONFLICT" : "INVALID_REQUEST");
      throw error;
    } finally { client.release(); }
  });
}
async function profile(client: PoolClient, id: number): Promise<MobileStaffProfile | null> {
  const row = (await client.query(`SELECT p.id,p.staff_code,p.full_name,p.phone,p.email,p.position,p.store_id,s.store_name,p.status,p.joined_at::text,p.notes,p.user_id,p.xmin::text AS revision
    FROM himoto.staff_profiles p LEFT JOIN himoto.stores s ON s.id=p.store_id WHERE p.id=$1`, [id])).rows[0];
  if (!row) return null;
  const str = (value: unknown) => value == null ? "" : String(value);
  const result = { id: Number(row.id), revision: String(row.revision), code: str(row.staff_code), name: str(row.full_name), phone: str(row.phone), email: str(row.email), position: str(row.position),
    storeId: row.store_id == null ? null : Number(row.store_id), storeName: str(row.store_name), status: str(row.status), joinedAt: str(row.joined_at), notes: str(row.notes), userId: row.user_id == null ? null : Number(row.user_id) };
  if (!isStaffProfile(result)) throw new MobileError("Thông tin nhân sự cần được đối chiếu trên web.", 409, "STAFF_REVIEW_REQUIRED");
  return result;
}
export async function readMobileStaff(user: SessionUser, rawId: string) {
  allowed(user); const id = staffId(rawId);
  return transaction(user, true, false, async client => {
    const row = await profile(client, id);
    if (!row) throw new MobileError("Nhân sự không tồn tại hoặc ngoài phạm vi hiện tại.", 404, "NOT_FOUND");
    return row;
  });
}
export async function readMobileStaffOptions(user: SessionUser): Promise<MobileStaffOptions> {
  allowed(user, true);
  return transaction(user, true, false, async client => ({
    stores: (await client.query("SELECT id,store_name FROM himoto.stores ORDER BY store_name,id")).rows.map(row => ({ id: Number(row.id), name: String(row.store_name || "") })),
    positions: staffPositionSuggestions((await client.query("SELECT DISTINCT position FROM himoto.staff_profiles WHERE position IS NOT NULL ORDER BY position")).rows.map(row => row.position)),
  }));
}
export async function saveMobileStaff(user: SessionUser, request: NextRequest, method: "POST" | "PATCH" | "DELETE", rawId?: string): Promise<MobileStaffWriteResult> {
  allowed(user, true);
  if (request.nextUrl.searchParams.size) throw new MobileError("Lưu nhân sự không nhận bộ lọc.");
  const id = method === "POST" ? null : staffId(rawId || ""), key = mobileRequestKey(request.headers.get("Idempotency-Key")), body = await mobileBody(request, 16384);
  const keys = method === "DELETE" ? ["revision"] : ["name", "phone", "email", "position", "store_id", "status", ...(id === null ? ["joined_at"] : ["revision"])];
  if (Object.keys(body).some(key => !keys.includes(key)) || id !== null && (typeof body.revision !== "string" || !/^[1-9]\d{0,19}$/.test(body.revision))) throw new MobileError("Thông tin hoặc phiên bản nhân sự không hợp lệ.");
  let input: ReturnType<typeof parseStaffProfile> | null = null;
  try { if (method !== "DELETE") { input = parseStaffProfile(body, id === null); requireStaffAccountScope(user, input.store_id); } }
  catch (error) { if (error instanceof AccountAccessError) throw new MobileError(error.message, error.status); throw error; }
  const operation = method === "POST" ? "staff.create" : `staff.${method === "DELETE" ? "delete" : "update"}:${id}`;
  // Create/update use the web's owner transaction plus explicit old/new staff
  // and linked-account scope checks. Delete retains the web's scoped bulk writer.
  return transaction(user, false, method !== "DELETE", async client => {
    let credentials: MobileStaffCredentials | null = null;
    const receipt = await idempotentMobileWrite(client, user.id, key, operation, { ...input, ...(id === null ? {} : { revision: body.revision }) }, async () => {
      if (id !== null) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["management-accounts"]);
        const row = (await client.query("SELECT store_id,xmin::text AS revision FROM himoto.staff_profiles WHERE id=$1 FOR UPDATE", [id])).rows[0];
        if (!row) throw new AccountAccessError("Nhân sự không tồn tại hoặc ngoài phạm vi hiện tại.", 404);
        if (method !== "DELETE") requireStaffAccountScope(user, row.store_id);
        if (String(row.revision) !== body.revision) throw new AccountAccessError("Hồ sơ nhân sự đã thay đổi. Tải lại trước khi thao tác.", 409);
        if (method === "DELETE") { await bulkDelete(client, "staff", [id]); return { id, revision: String(row.revision) }; }
      }
      const saved = await saveDatabaseStaff(client, user, input!, id ?? undefined); credentials = saved.credentials;
      const row = (await client.query("SELECT id,xmin::text AS revision FROM himoto.staff_profiles WHERE id=$1", [saved.id])).rows[0];
      if (!row) throw new MobileError("Chưa xác nhận được nhân sự đã lưu. Giữ mã để đối chiếu.", 503);
      return { id: Number(row.id), revision: String(row.revision) };
    });
    // Generated credentials are returned once, never written into the mobile
    // request ledger, query cache, route params or recovery receipt.
    return { ...receipt, credentials: receipt.replayed ? null : credentials };
  });
}
export async function readMobileStaffResult(user: SessionUser, key: string): Promise<MobileStaffResult> {
  allowed(user); mobileRequestKey(key);
  return transaction(user, true, false, async client => {
    const row = (await client.query("SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 AND operation ~ '^staff[.](create|(update|delete):[1-9][0-9]*)$'", [user.id, key])).rows[0];
    if (!row || !row.resource_id) throw new MobileError("Chưa có xác nhận nhân sự. Giữ mã và đối chiếu trong Tài khoản.", 404, "NOT_FOUND");
    const current = await profile(client, Number(row.resource_id));
    if (!current && !String(row.operation).startsWith("staff.delete:")) throw new MobileError("Hồ sơ nhân sự không còn trong phạm vi truy cập. Giữ mã để đối chiếu.", 403, "FORBIDDEN");
    return { key, operation: String(row.operation), receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true }, current, deleted: !current };
  });
}

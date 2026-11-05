import "server-only";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { deleteDuty, DutyError, listDuties, parseDutyInput, saveDuty } from "./duty-roster";
import { MobileError } from "./mobile-session";
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from "./mobile-writes";
import { dutyToday, type MobileDutyResult, type MobileDutySchedule } from "../../../shared/mobile-duty-roster";

function allowed(user: SessionUser, write = false) {
  if (!hasPermission(user, "hr.read") || write && !hasPermission(user, "hr.write"))
    throw new MobileError("Tài khoản không có quyền thực hiện thao tác lịch trực.", 403, "FORBIDDEN");
}
export async function readMobileDuties(user: SessionUser, params: URLSearchParams) {
  allowed(user);
  for (const [key] of params) if (!["week", "store_id"].includes(key) || params.getAll(key).length !== 1) throw new MobileError("Bộ lọc lịch trực không hợp lệ.");
  const store = params.get("store_id");
  if (store !== null && (!/^[1-9]\d{0,14}$/.test(store) || !Number.isSafeInteger(Number(store)))) throw new MobileError("Cơ sở không hợp lệ.");
  return transaction(user, true, client => listDuties(client, params.get("week") || dutyToday(), store === null ? undefined : Number(store)));
}
async function transaction<T>(user: SessionUser, read: boolean, run: (client: import("pg").PoolClient) => Promise<T>) {
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(read ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof DutyError) throw new MobileError(error.message, error.status, error.status === 409 ? "CONFLICT" : "INVALID_REQUEST");
      throw error;
    } finally { client.release(); }
  });
}
export async function writeMobileDuty(user: SessionUser, request: NextRequest, method: "POST" | "PATCH" | "DELETE", rawId?: string) {
  allowed(user, true);
  if (request.nextUrl.searchParams.size) throw new MobileError("Thao tác lịch trực không nhận bộ lọc.");
  if (method !== "POST" && (!rawId || !/^[1-9]\d{0,14}$/.test(rawId))) throw new MobileError("Mã ca trực không hợp lệ.");
  const id = rawId ? Number(rawId) : undefined;
  const key = mobileRequestKey(request.headers.get("Idempotency-Key"));
  const body = await mobileBody(request, 12288);
  if ("request_id" in body) throw new MobileError("Mã lần lưu chỉ nhận qua header.");
  const operation = method === "POST" ? "duty.create" : `duty.${method === "PATCH" ? "update" : "delete"}:${id}`;
  if (method === "DELETE" && (Object.keys(body).length !== 1 || typeof body.revision !== "string" || !/^[1-9]\d{0,19}$/.test(body.revision))) throw new MobileError("Phiên bản ca trực không hợp lệ.");
  let input: ReturnType<typeof parseDutyInput> | null;
  try { input = method === "DELETE" ? null : parseDutyInput({ ...body, ...(method === "POST" ? { request_id: key } : {}) }, method === "PATCH"); }
  catch (error) { if (error instanceof DutyError) throw new MobileError(error.message, error.status); throw error; }
  return transaction(user, false, client => idempotentMobileWrite(client, user.id, key, operation, input || body, async () => {
    if (method !== "DELETE") return saveDuty(client, user.id, input!, id);
    await deleteDuty(client, id!, String(body.revision), user.id);
    // Soft deletion retains the original resource for exact request recovery.
    const row = (await client.query("SELECT id,xmin::text AS revision FROM himoto.store_duty_schedules WHERE id=$1", [id])).rows[0];
    if (!row) throw new MobileError("Chưa xác nhận được ca trực đã xóa.", 503);
    return { id: Number(row.id), revision: String(row.revision) };
  }));
}
export async function readMobileDutyResult(user: SessionUser, key: string): Promise<MobileDutyResult> {
  allowed(user);
  mobileRequestKey(key);
  return transaction(user, true, async client => {
    const result = await client.query(`SELECT r.operation,r.resource_id,r.resource_revision,
      d.id,d.store_id,s.store_name,d.staff_id,d.staff_name,d.staff_phone,d.duty_date::text,
      d.shift_name,d.role_in_shift,d.notes,d.starts_at,d.ends_at,d.xmin::text AS revision,d.deleted_at
      FROM himoto.management_mobile_requests r
      JOIN himoto.store_duty_schedules d ON d.id=r.resource_id
      LEFT JOIN himoto.stores s ON s.id=d.store_id
      WHERE r.user_id=$1 AND r.request_id=$2 AND r.operation ~ '^duty[.](create|(update|delete):[1-9][0-9]*)$'`, [user.id, key]);
    const row = result.rows[0];
    if (!row) throw new MobileError("Chưa có xác nhận hoặc ca trực ngoài phạm vi hiện tại. Giữ mã và đối chiếu trong Tài khoản.", 404, "NOT_FOUND");
    const time = (value: unknown) => value == null ? null : value instanceof Date ? value.toISOString() : String(value);
    const current: MobileDutySchedule | null = row.deleted_at ? null : {
      id: Number(row.id), store_id: Number(row.store_id), store_name: String(row.store_name || ""),
      staff_id: row.staff_id == null ? null : Number(row.staff_id), staff_name: String(row.staff_name || ""), staff_phone: String(row.staff_phone || ""),
      duty_date: String(row.duty_date), shift_name: String(row.shift_name || ""), role_in_shift: String(row.role_in_shift || ""), notes: String(row.notes || ""),
      starts_at: time(row.starts_at), ends_at: time(row.ends_at), revision: String(row.revision),
    };
    return { key, operation: String(row.operation), receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true }, current, deleted: !!row.deleted_at };
  });
}

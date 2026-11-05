import "server-only";
import type { PoolClient } from "pg";
import type { PermissionAccount } from "@/lib/management/permissions";
import { AccountAccessError } from "./account-management";
import { syncStaffAccount, requireStaffAccountScope } from "./staff-accounts";
import { staffProfileValues, validateStaffProfile, type StaffProfileInput } from "../../../shared/staff-profile";

export function parseStaffProfile(body: unknown, creating: boolean): StaffProfileInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AccountAccessError("Thông tin nhân sự không hợp lệ.");
  const raw = body as Record<string, unknown>, input = staffProfileValues(raw);
  if (creating) input.joined_at = typeof raw.joined_at === "string" ? raw.joined_at.trim() : "";
  if (Object.keys(validateStaffProfile(input)).length) throw new AccountAccessError("Kiểm tra họ tên, số điện thoại, email, chức vụ, ngày vào làm, cơ sở và trạng thái.");
  return input;
}
/** Caller owns the transaction. Profile and login always commit together. */
export async function saveDatabaseStaff(client: Pick<PoolClient, "query">, actor: PermissionAccount & { id: number }, input: StaffProfileInput, id?: number) {
  const { name, phone, email, position, status, store_id: storeId } = input;
  requireStaffAccountScope(actor, storeId);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["management-accounts"]);
  const before = id ? (await client.query("SELECT store_id,status FROM himoto.staff_profiles WHERE id=$1 FOR UPDATE", [id])).rows[0] : null;
  if (id && !before) throw new AccountAccessError("Không tìm thấy nhân sự cần cập nhật.", 404);
  if (before) requireStaffAccountScope(actor, before.store_id);
  if (storeId !== null && !(await client.query("SELECT 1 FROM himoto.stores WHERE id=$1", [storeId])).rowCount) throw new AccountAccessError("Cơ sở đã chọn không còn tồn tại.");
  let code: string | undefined;
  if (!id) {
    const inserted = (await client.query(`WITH next AS (SELECT nextval('himoto.staff_profiles_id_seq') AS id)
      INSERT INTO himoto.staff_profiles (id, staff_code, full_name, phone, email, position, store_id, status, joined_at, created_at, updated_at)
      SELECT next.id, 'NV' || lpad(next.id::text, GREATEST(4,length(next.id::text)), '0'), $1, $2, NULLIF($3,''), NULLIF($4,''), $5, $6, NULLIF($7,'')::date, now(), now() FROM next
      RETURNING id,staff_code`, [name, phone, email, position, storeId, status, input.joined_at || ""])).rows[0];
    id = Number(inserted.id); code = String(inserted.staff_code);
  } else {
    const result = await client.query(`UPDATE himoto.staff_profiles SET full_name=$2,phone=$3,email=NULLIF($4,''),position=NULLIF($5,''),store_id=$6,status=$7,updated_at=now() WHERE id=$1 RETURNING id`, [id, name, phone, email, position, storeId, status]);
    if (!result.rowCount) throw new AccountAccessError("Không tìm thấy nhân sự cần cập nhật.", 404);
  }
  const credentials = await syncStaffAccount(client, actor.id, id, actor, undefined, !!before && before.status !== "active" && status === "active");
  return { id, ...(code ? { staff_code: code } : {}), credentials };
}

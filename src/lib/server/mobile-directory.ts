import "server-only";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { readManagementTable, ManagementTableError } from "./management-table";
import { mobileTableParams } from "./mobile-catalogue";
import { MobileError } from "./mobile-session";
import type { MobileDirectoryKind, MobileDirectoryPage } from "../../../shared/mobile-directory";

export function directoryKind(value: string): MobileDirectoryKind {
  if (value !== "staff" && value !== "stores") throw new MobileError("Không tìm thấy danh bạ.", 404, "NOT_FOUND");
  return value;
}
export async function readMobileDirectory(user: SessionUser, kind: MobileDirectoryKind, params: URLSearchParams): Promise<MobileDirectoryPage> {
  if (!hasPermission(user, kind === "staff" ? "hr.read" : "contracts.read")) throw new MobileError("Tài khoản không có quyền xem danh bạ này.", 403, "FORBIDDEN");
  const base = new URLSearchParams(params), position = base.get("position") || "";
  if (base.has("position") && (kind !== "staff" || base.getAll("position").length !== 1 || position.length > 100)) throw new MobileError("Bộ lọc chức vụ không hợp lệ.");
  base.delete("position");
  const query = mobileTableParams(base, "customers");
  if (position) query.set("filter_position", position);
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'");
      const page = await readManagementTable(client, kind, query);
      const text = (value: unknown) => value == null ? "" : String(value);
      const count = (value: unknown) => value == null || value === "" ? null : Number(value);
      const result = { rows: page.rows.map(row => ({
        id: row.id, code: row.code, name: row.name, status: row.status,
        storeId: row.store_id == null ? null : Number(row.store_id), storeName: text(row.store_name),
        phone: text(row.phone), email: text(row.email), address: text(row.address),
        position: text(row.position), managerName: text(row.manager_name), joinedAt: text(row.hire_date), notes: text(row.notes),
        vehicleCount: count(row.vehicle_count), staffCount: count(row.staff_count),
      })), total: page.total, page: page.page, pages: page.pages };
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ManagementTableError) throw new MobileError(error.message);
      throw error;
    } finally { client.release(); }
  });
}

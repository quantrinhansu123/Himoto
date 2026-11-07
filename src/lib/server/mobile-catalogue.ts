import "server-only";
import { contractWorkspace } from "../../../shared/mobile-contract-workspaces";
import { isRemindableContract } from "@/lib/management/debt-reminders";
import {
  hasPermission,
  type AccessPermission,
} from "@/lib/management/permissions";
import type { ManagementRow } from "@/lib/management/types";
import { mapApiRow } from "@/lib/management/repository";
import { dataAccess } from "./access-context";
import { himotoPool } from "./himoto-database";
import {
  readManagementTable,
  vehicleHydrateSql,
  customerPageSql,
  ManagementTableError,
} from "./management-table";
import type { SessionUser } from "./management-session";
import { MobileError, mobileUser } from "./mobile-session";
import type {
  CatalogueKind,
  MobilePage,
  MobileRecord,
  MobileWorkspace,
} from "../../../shared/mobile-contract";

const permissions: Record<CatalogueKind, AccessPermission> = {
  vehicles: "vehicles.read",
  contracts: "contracts.read",
  customers: "customers.read",
};
export function catalogueKind(value: string): CatalogueKind {
  if (!Object.hasOwn(permissions, value))
    throw new MobileError("Không tìm thấy danh mục.", 404, "NOT_FOUND");
  return value as CatalogueKind;
}
function assertPermission(user: SessionUser, kind: CatalogueKind) {
  if (!hasPermission(user, permissions[kind]))
    throw new MobileError(
      "Tài khoản không có quyền xem danh mục này.",
      403,
      "FORBIDDEN",
    );
}
function scope<T>(
  user: SessionUser,
  kind: CatalogueKind | null,
  read: () => Promise<T>,
) {
  // Same fleet visibility policy as withAccessRequest; never broaden the actor's
  // scope_all flag. Customers and contracts continue to use the existing RLS.
  return dataAccess.run(
    {
      ...user,
      store_id: user.store_id ?? null,
      scope_all: user.scope_all === true,
      operation: kind === "vehicles" ? "fleet_read" : "",
    },
    read,
  );
}
const text = (value: unknown) => (value == null ? "" : String(value));
const number = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
export function mobileRecord(
  kind: CatalogueKind,
  row: ManagementRow,
): MobileRecord {
  // Explicit projection: never return draft payloads, identity documents, signed
  // URLs, GPS coordinates, revisions or arbitrary columns added to the web API.
  return {
    id: row.id,
    code: row.code,
    name: kind === "contracts" ? text(row.customer_name) : row.name,
    status: row.status,
    ...(kind === "contracts" ? { reminderEligible: isRemindableContract(row) } : {}),
    storeId: number(row.store_id),
    storeName: text(row.store_name),
    license: kind === "customers" ? "" : text(row.license),
    vehicleName: text(row.vehicle_name),
    phone:
      kind === "vehicles"
        ? ""
        : text(kind === "contracts" ? row.customer_phone : row.phone),
    startsAt: text(row.start_date),
    endsAt: text(row.end_date),
    totalAmount: kind === "contracts" ? number(row.total_amount) : null,
    paidAmount: kind === "contracts" ? number(row.paid_amount) : null,
    brand: kind === "vehicles" ? text(row.brand) : "",
    color: kind === "vehicles" ? text(row.color) : "",
    odometer: kind === "vehicles" ? number(row.odometer) : null,
    ...(kind === "contracts" ? { monitoring: {
      rentalType: text(row.rental_type),
      contractTypeName: text(row.contract_type_name),
      nextDueAt: text(row.billing_next_due_at),
      overdueAt: text(row.billing_overdue_at),
      dueAmount: number(row.billing_due_amount),
      rentalDebt: number(row.rental_debt_amount),
      lateFeeEstimate: number(row.overdue_fee_estimate),
      overdueMinutes: number(row.overdue_minutes),
      companyPaidAmount: number(row.company_paid_amount),
      collectionOverdue: row.collection_overdue === 1,
      basis: row.overdue_basis === "payment" ? "payment" as const : "return" as const,
    } } : {}),
    ...(kind === "customers"
      ? {
          email: text(row.email),
          address: text(row.address),
          contactChannel: text(row.contact_channel),
          contactDetail: text(row.contact_detail),
          customerNote: text(row.warning_note),
        }
      : {}),
  };
}
export function mobileTableParams(params: URLSearchParams, kind: CatalogueKind = "contracts") {
  const allowed = new Set(["page", "size", "search", "status", "store", ...(kind === "contracts" ? ["scope", "from", "to", "store_basis"] : [])]);
  for (const [key] of params)
    if (!allowed.has(key) || params.getAll(key).length !== 1) {
      throw new MobileError("Bộ lọc không hợp lệ.");
    }
  const result = new URLSearchParams(params);
  if (kind === "contracts" && !contractWorkspace(result.get("scope") || ""))
    throw new MobileError("Nhóm hợp đồng không hợp lệ.");
  for (const key of ["from", "to"]) {
    const date = result.get(key);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date))
      throw new MobileError("Khoảng ngày không hợp lệ.");
  }
  if (result.get("from") && result.get("to") && result.get("from")! > result.get("to")!)
    throw new MobileError("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
  if (
    (result.get("search")?.length || 0) > 120 ||
    !/^[a-z_]{0,40}$/.test(result.get("status") || "")
  )
    throw new MobileError("Bộ lọc không hợp lệ.");
  result.set("size", result.get("size") || "20");
  result.set("sort", "code");
  result.set("direction", "desc");
  if (result.get("scope") === "overdue") result.set("sort", "overdue_minutes");
  return result;
}
export async function readMobilePage(
  user: SessionUser,
  kind: CatalogueKind,
  params: URLSearchParams,
): Promise<MobilePage> {
  assertPermission(user, kind);
  const query = mobileTableParams(params, kind);
  return scope(user, kind, async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'");
      const data = await readManagementTable(client, kind, query);
      const thumbnails = kind === 'vehicles' && data.rows.length ? await client.query(
        `SELECT entity_id,xmin::text AS revision FROM himoto.management_record_photos
         WHERE entity_type='vehicles' AND entity_id=ANY($1::bigint[]) AND slot='vehicle-photo'
         AND mime_type IN ('image/jpeg','image/png','image/webp')
         AND (data IS NOT NULL OR cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL)
         AND (data IS NULL OR octet_length(data) BETWEEN 1 AND 2097152)`, [data.rows.map(row => row.id)],
      ) : { rows: [] };
      const thumbnailRevisions = new Map(thumbnails.rows.map(row => [Number(row.entity_id), String(row.revision)]));
      await client.query("COMMIT");
      return {
        rows: data.rows.map((row) => ({ ...mobileRecord(kind, row), ...(kind === 'vehicles' ? { thumbnailRevision: thumbnailRevisions.get(row.id) ?? null } : {}) })),
        total: data.total,
        page: data.page,
        pages: data.pages,
        statusCounts: data.statusCounts,
        updatedAt: new Date().toISOString(),
        ...(kind === "contracts" ? { scope: contractWorkspace(query.get("scope") || "")!.key } : {}),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ManagementTableError)
        throw new MobileError(error.message);
      throw error;
    } finally {
      client.release();
    }
  });
}
export async function readMobileRecord(
  user: SessionUser,
  kind: CatalogueKind,
  id: string,
): Promise<MobileRecord> {
  assertPermission(user, kind);
  if (!/^[1-9]\d{0,14}$/.test(id))
    throw new MobileError("Mã hồ sơ không hợp lệ.");
  return scope(user, kind, async () => {
    let row: ManagementRow | undefined;
    if (kind === "contracts") {
      const data = await readManagementTable(
        himotoPool,
        kind,
        new URLSearchParams({ filter_id: id, size: "1" }),
      );
      row = data.rows[0];
    } else {
      const result = await himotoPool.query(
        kind === "vehicles"
          ? `${vehicleHydrateSql()} AND v.deleted_at IS NULL AND COALESCE(v.current_store_id,v.store_id)>0`
          : customerPageSql(" AND c.id=$1"),
        [kind === "vehicles" ? [Number(id)] : Number(id)],
      );
      row = result.rows[0] ? mapApiRow(kind, result.rows[0]) : undefined;
    }
    if (!row)
      throw new MobileError(
        "Hồ sơ không tồn tại hoặc ngoài phạm vi truy cập.",
        404,
        "NOT_FOUND",
      );
    return mobileRecord(kind, row);
  });
}
export async function readMobileWorkspace(
  user: SessionUser,
): Promise<MobileWorkspace> {
  return scope(user, null, async () => {
    // Existing limited directory function exposes store labels to staff across
    // branches; it does not broaden contracts/customer RLS or expose profiles.
    const result = await himotoPool.query(
      "SELECT id,store_name FROM himoto.store_directory() ORDER BY store_name,id",
    );
    return {
      user: mobileUser(user),
      stores: result.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.store_name),
      })),
    };
  });
}

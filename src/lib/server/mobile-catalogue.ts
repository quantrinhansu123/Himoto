import "server-only";
import { contractWorkspace } from "../../../shared/mobile-contract-workspaces";
import { isRemindableContract } from "@/lib/management/debt-reminders";
import {
  hasPermission,
  type AccessPermission,
} from "@/lib/management/permissions";
import type { ManagementRow } from "@/lib/management/types";
import { mapApiRow } from "@/lib/management/repository";
import { vehicleHolderLabel, vehicleMissingOpenContract } from "@/lib/management/vehicle-holder";
import { vehicleTransferRoute } from "@/lib/management/vehicle-history";
import { canMobileCrossStoreRead, withMobileReadData } from "./mobile-context";
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
  // Same fleet and cross-store read-only visibility policy as withAccessRequest.
  return withMobileReadData(user, kind === "vehicles" ? "fleet_read" : "", read);
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
    ...(kind === "contracts" ? {
      reminderEligible: isRemindableContract(row),
      ...(text(row.approval_at) ? { approvedAt: text(row.approval_at) } : {}),
      ...(text(row.hold_until) ? { holdUntil: text(row.hold_until) } : {}),
    } : {}),
    ...(kind === "vehicles" ? {
      ...(vehicleHolderLabel(row.status, row.holder_name) && vehicleHolderLabel(row.status, row.holder_name) !== "—" ? { holderName: vehicleHolderLabel(row.status, row.holder_name) } : {}),
      ...(text(row.beneficiary_store_name) ? { beneficiaryStoreName: text(row.beneficiary_store_name) } : {}),
      ...(text(row.location_status) ? { locationStatus: text(row.location_status) } : {}),
      ...(number(row.overdue_days) !== null ? { overdueDays: number(row.overdue_days) } : {}),
      ...(vehicleMissingOpenContract(row) ? { missingOpenContract: true } : {}),
      ...(vehicleTransferRoute(row) ? { transferRoute: vehicleTransferRoute(row) } : {}),
    } : {}),
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
      referencePrice:row.overdue_reference_price===1,
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
  const allowed = new Set([
    "page", "size", "search", "status", "store", "sort", "direction",
    ...(kind === "contracts" ? ["scope", "from", "to", "store_basis", "customer_id", "statistics", "rental_type", "ownership_term_months", "contract_type_id", "overdue_bucket", "overdue_days", "overdue_compare", "recent"] : []),
    ...(kind === "vehicles" ? ["vehicle_type", "warehouse_store_id", "beneficiary_store_id", "missing_contract"] : []),
  ]);
  for (const [key] of params)
    if (!allowed.has(key) || params.getAll(key).length !== 1) {
      throw new MobileError("Bộ lọc không hợp lệ.");
    }
  const result = new URLSearchParams(params);
  if (result.has("customer_id")) {
    const id = result.get("customer_id")!;
    if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new MobileError("Khách hàng cần lọc chưa hợp lệ.");
    result.delete("customer_id");
    result.set("filter_customer_id", id);
  }
  if (result.has("rental_type")) {
    const rt = result.get("rental_type")!;
    result.delete("rental_type");
    if (rt) {
      if (!/^[a-z0-9_]{1,40}$/.test(rt)) throw new MobileError("Loại hợp đồng lọc chưa hợp lệ.");
      result.set("filter_rental_type", rt);
    }
  }
  if (result.has("contract_type_id")) {
    const ctid = result.get("contract_type_id")!;
    result.delete("contract_type_id");
    if (ctid) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(ctid)) throw new MobileError("Mã loại hợp đồng lọc chưa hợp lệ.");
      result.set("filter_contract_type_id", ctid);
    }
  }
  if (result.has("ownership_term_months")) {
    const term = result.get("ownership_term_months")!;
    result.delete("ownership_term_months");
    if (term) {
      if (!/^(6|9|12|18|24|custom)$/.test(term)) throw new MobileError("Thời hạn sở hữu lọc chưa hợp lệ.");
      result.set("filter_ownership_term_months", term);
    }
  }
  if (result.has("overdue_bucket")) {
    const bucket = result.get("overdue_bucket")!;
    if (bucket && !/^(d1_3|d4_7|d8_15|d16_30|gt30)$/.test(bucket)) throw new MobileError("Nhóm quá hạn không hợp lệ.");
    if (!bucket) result.delete("overdue_bucket");
  }
  if (result.has("overdue_days")) {
    const days = result.get("overdue_days")!;
    if (days && !/^\d{1,5}$/.test(days)) throw new MobileError("Số ngày quá hạn không hợp lệ.");
    if (!days) result.delete("overdue_days");
  }
  if (result.has("overdue_compare")) {
    const cmp = result.get("overdue_compare")!;
    if (cmp && !/^(eq|gt|lt)$/.test(cmp)) throw new MobileError("Phép so sánh quá hạn không hợp lệ.");
    if (!cmp) result.delete("overdue_compare");
  }
  if (result.has("vehicle_type")) {
    const vt = result.get("vehicle_type")!;
    result.delete("vehicle_type");
    if (vt) {
      if (!/^(xega|xeso|xecon|xesh|xe_dien)$/.test(vt)) throw new MobileError("Loại xe lọc chưa hợp lệ.");
      result.set("filter_type", vt);
    }
  }
  if (result.has("missing_contract")) {
    const mc = result.get("missing_contract")!;
    result.delete("missing_contract");
    if (mc) {
      if (mc !== "1") throw new MobileError("Bộ lọc xe thiếu hợp đồng chưa hợp lệ.");
      result.set("filter_missing_contract", "1");
    }
  }
  for (const storeKey of ["warehouse_store_id", "beneficiary_store_id"] as const) {
    if (result.has(storeKey)) {
      const val = result.get(storeKey)!;
      result.delete(storeKey);
      if (val) {
        if (!/^[1-9]\d{0,14}$/.test(val) || !Number.isSafeInteger(Number(val))) throw new MobileError("Cơ sở lọc xe chưa hợp lệ.");
        result.set(`filter_${storeKey}`, val);
      }
    }
  }
  if (result.has("statistics")) {
    if (result.get("statistics") !== "1") throw new MobileError("Yêu cầu số lượng chưa hợp lệ.");
    result.delete("statistics");
    result.set("statistics_only", "1");
  }
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
  const customSort = result.get("sort");
  const customDir = result.get("direction");
  if (customSort && !/^[a-z_]{1,40}$/.test(customSort)) throw new MobileError("Cột sắp xếp không hợp lệ.");
  if (customDir && !/^(asc|desc)$/.test(customDir)) throw new MobileError("Chiều sắp xếp không hợp lệ.");
  result.set("size", result.get("size") || "20");
  result.set("sort", customSort || (result.get("scope") === "overdue" ? "overdue_minutes" : "code"));
  result.set("direction", customDir || "desc");
  return result;
}
export async function readMobilePage(
  user: SessionUser,
  kind: CatalogueKind,
  params: URLSearchParams,
): Promise<MobilePage> {
  assertPermission(user, kind);
  const query = mobileTableParams(params, kind);
  if (!canMobileCrossStoreRead(user) && user.store_id && !query.has('store') && kind !== 'vehicles') {
    query.set('store', String(user.store_id));
  }
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
         AND (data IS NOT NULL OR cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL OR object_key IS NOT NULL AND object_bucket IS NOT NULL AND object_etag IS NOT NULL)
         AND (data IS NULL OR octet_length(data) BETWEEN 1 AND 2097152)`, [data.rows.map(row => row.id)],
      ) : { rows: [] };
      const thumbnailRevisions = new Map(thumbnails.rows.map(row => [Number(row.entity_id), String(row.revision)]));
      await client.query("COMMIT");
      return {
        rows: data.rows.map((row) => ({ ...mobileRecord(kind, row), ...(kind === 'vehicles' ? { thumbnailRevision: thumbnailRevisions.get(row.id) ?? null } : {}) })),
        total: data.total,
        ...(query.get("statistics_only") === "1" || kind !== "contracts" ? { tabCount: data.tabCount } : {}),
        page: data.page,
        pages: data.pages,
        statusCounts: data.statusCounts,
        updatedAt: new Date().toISOString(),
        ...(kind === "contracts" ? {
          scope: contractWorkspace(query.get("scope") || "")!.key,
          ...(data.summary ? { summary: data.summary } : {}),
          ...(typeof data.dueCount === "number" ? { dueCount: data.dueCount } : {}),
          ...(Array.isArray(data.overdueCounts) ? { overdueCounts: data.overdueCounts } : {}),
        } : {}),
        ...(kind === "vehicles" && typeof data.missingOpenContractCount === "number" ? { missingOpenContractCount: data.missingOpenContractCount } : {}),
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

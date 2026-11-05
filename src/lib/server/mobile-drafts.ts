import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { hasPermission } from "@/lib/management/permissions";
import { createContractDraft } from "@/lib/management/contract-document";
import { mapApiRow } from "@/lib/management/repository";
import {
  CONTRACT_LIST_SQL,
  DraftSaveError,
  saveDatabaseDraft,
} from "./contract-drafts";
import { contractVehicleDetailsSql } from "./contract-vehicle-reads";
import { listContractTypes } from "./contract-types";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import type { SessionUser } from "./management-session";
import { MobileError } from "./mobile-session";
import {
  idempotentMobileWrite,
  mobileBody,
  mobileRequestKey,
} from "./mobile-writes";
import { mobileDraftDocument, parseMobileDraft } from "./mobile-draft-shape";
import type {
  MobileDraftOptions,
  MobileDraftProfile,
} from "../../../shared/mobile-contract";

export function requireMobileDraft(user: SessionUser) {
  if (
    !hasPermission(user, "contracts.read") ||
    !hasPermission(user, "contracts.draft")
  )
    throw new MobileError(
      "Tài khoản không có quyền soạn hợp đồng.",
      403,
      "FORBIDDEN",
    );
}
export function mobileDraftId(value: string) {
  const id = Number(value);
  if (!/^[1-9]\d{0,14}$/.test(value) || !Number.isSafeInteger(id))
    throw new MobileError("Mã bản nháp không hợp lệ.");
  return id;
}
export async function withMobileDraft<T>(
  user: SessionUser,
  operation: string,
  task: (client: PoolClient) => Promise<T>,
  write = false,
): Promise<T> {
  requireMobileDraft(user);
  return withMobileData(user, operation, async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(
        write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await task(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof DraftSaveError)
        throw new MobileError(
          error.message,
          error.status,
          error.status === 409 ? "DRAFT_CONFLICT" : "INVALID_DRAFT",
          error.fields,
        );
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function readMobileDraftOptions(
  user: SessionUser,
): Promise<MobileDraftOptions> {
  return withMobileDraft(user, "", async (client) => {
    const stores = await client.query(
      "SELECT id,store_name FROM himoto.stores WHERE status='opening' ORDER BY store_name,id",
    );
    const directory = await client.query(
      "SELECT id,store_name FROM himoto.store_directory() ORDER BY store_name,id",
    );
    const types = await listContractTypes(client);
    const draft = createContractDraft(
      { stores: [], staff: [], customers: [], contracts: [], vehicles: [] },
      user.store_id == null ? "all" : String(user.store_id),
    );
    draft.staff_name = user.name;
    return {
      initial: {
        draft: mobileDraftDocument(draft),
        rental_type: "daily",
        status: "draft",
        notes: "",
      },
      stores: stores.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.store_name),
      })),
      vehicleStores: directory.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.store_name),
      })),
      types: types.map((type) => ({
        id: type.id,
        label: type.label,
        rentalType: type.rental_type,
        termMonths: type.term_months,
        active: type.active,
      })),
    };
  });
}
export async function readMobileDraft(
  user: SessionUser,
  id: number,
): Promise<MobileDraftProfile> {
  return withMobileDraft(user, "", async (client) => {
    const result = await client.query(
      contractVehicleDetailsSql(`${CONTRACT_LIST_SQL} AND o.id=$1`),
      [id],
    );
    const raw = result.rows[0];
    if (!raw)
      throw new MobileError(
        "Không tìm thấy bản nháp trong phạm vi được cấp.",
        404,
        "NOT_FOUND",
      );
    if (raw.status !== "draft")
      throw new MobileError(
        "Hợp đồng đã chuyển trạng thái. Mở hồ sơ để xem thông tin mới.",
        409,
        "DRAFT_CONFLICT",
      );
    const row = mapApiRow("contracts", raw);
    try {
      const draft = createContractDraft(
        { stores: [], staff: [], customers: [], contracts: [], vehicles: [] },
        "all",
        row,
      );
      const input = parseMobileDraft({
        draft: mobileDraftDocument(draft),
        rental_type: String(row.rental_type || "daily"),
        notes: String(row.notes || ""),
        status: "draft",
        revision: String(raw.draft_revision),
      });
      if (Buffer.byteLength(JSON.stringify(input), "utf8") > 524288)
        throw new Error("Oversized saved document");
      return {
        id: Number(raw.id),
        code: row.code,
        revision: String(raw.draft_revision),
        input,
      };
    } catch (error) {
      if (error instanceof MobileError && error.status === 409) throw error;
      throw new MobileError(
        "Bản nháp cần được kiểm tra dữ liệu trên web trước khi chỉnh sửa trong app.",
        409,
        "DATA_REVIEW_REQUIRED",
      );
    }
  });
}
export async function writeMobileDraft(
  user: SessionUser,
  request: NextRequest,
  id: number | null,
) {
  requireMobileDraft(user);
  const requestId = mobileRequestKey(request.headers.get("idempotency-key"));
  const input = parseMobileDraft(await mobileBody(request, 524288));
  if (
    !/^[1-9]\d{0,14}$/.test(input.draft.store_id) ||
    !Number.isSafeInteger(Number(input.draft.store_id))
  )
    throw new MobileError(
      "Chọn cơ sở ghi nhận hợp đồng.",
      400,
      "STORE_REQUIRED",
    );
  if (!user.scope_all && Number(input.draft.store_id) !== user.store_id)
    throw new MobileError(
      "Chỉ được lưu hợp đồng tại cơ sở được phân công.",
      403,
      "FORBIDDEN",
    );
  if (
    id !== null &&
    (!input.revision || !/^[1-9]\d{0,19}$/.test(input.revision))
  )
    throw new MobileError(
      "Thiếu phiên bản bản nháp. Tải lại trước khi lưu.",
      400,
      "REVISION_REQUIRED",
    );
  return withMobileDraft(
    user,
    "",
    async (client) => {
      const receipt = await idempotentMobileWrite(
        client,
        user.id,
        requestId,
        id === null ? "draft.create" : `draft.update:${id}`,
        { id, input },
        async () => {
          const row = await saveDatabaseDraft(client, id, input);
          return { id: Number(row.id), revision: String(row.draft_revision) };
        },
      );
      if (receipt.replayed) {
        const visible = await client.query(
          "SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL",
          [receipt.id],
        );
        if (!visible.rowCount)
          throw new MobileError(
            "Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.",
            403,
            "FORBIDDEN",
          );
      }
      return receipt;
    },
    true,
  );
}
export async function readMobileDraftReceipt(user: SessionUser, key: string) {
  requireMobileDraft(user);
  mobileRequestKey(key);
  return withMobileDraft(user, "", async (client) => {
    const result = await client.query(
      `SELECT resource_id,resource_revision FROM himoto.management_mobile_requests
      WHERE user_id=$1 AND request_id=$2 AND resource_id IS NOT NULL AND (operation='draft.create' OR operation LIKE 'draft.update:%')`,
      [user.id, key],
    );
    const row = result.rows[0];
    if (!row) return { receipt: null };
    const visible = await client.query(
      "SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL",
      [row.resource_id],
    );
    if (!visible.rowCount)
      throw new MobileError(
        "Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.",
        403,
        "FORBIDDEN",
      );
    return {
      receipt: {
        id: Number(row.resource_id),
        revision: String(row.resource_revision),
        replayed: true,
      },
    };
  });
}

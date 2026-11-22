import "server-only";
import type { NextRequest } from "next/server";
import { hasPermission } from "@/lib/management/permissions";
import { parseCustomerRelatives } from "@/lib/management/customer-relatives";
import type { MobileCustomerDetail, MobileCustomerPayment, MobileCustomerProfile } from "../../../shared/mobile-contract";
import type { SessionUser } from "./management-session";
import {
  CustomerWriteError,
  CustomerDuplicateError,
  insertCustomer,
  parseCustomerWrite,
  updateCustomer,
} from "./customer-writes";
import {
  CustomerBlacklistError,
  changeCustomerBlacklist,
  parseBlacklistChange,
} from "./customer-blacklist";
import { readCustomerCashflow } from "./contract-history";
import { MobileError } from "./mobile-session";
import { withMobileData, withMobileReadData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import {
  idempotentMobileWrite,
  mobileBody,
  mobileRequestKey,
} from "./mobile-writes";

const customerFields = new Set([
  "name",
  "phone",
  "email",
  "address",
  "id_card",
  "customer_type",
  "nationality",
  "contact_channel",
  "contact_detail",
  "store_id",
  "status",
  "warning_note",
  "driver_license_number",
  "driver_license_issued_on",
  "id_card_issued_on",
  "id_card_issued_by",
  "relatives",
  "allow_incomplete",
  "revision",
]);
function requireCustomerWrite(user: SessionUser) {
  if (
    !hasPermission(user, "customers.write") ||
    !hasPermission(user, "customers.read")
  )
    throw new MobileError(
      "Tài khoản không có quyền chỉnh sửa khách hàng.",
      403,
      "FORBIDDEN",
    );
}
export function mobileCustomerId(value: string) {
  const id = Number(value);
  if (!/^[1-9]\d{0,14}$/.test(value) || !Number.isSafeInteger(id))
    throw new MobileError("Mã khách hàng không hợp lệ.");
  return id;
}
export async function readMobileCustomer(
  user: SessionUser,
  id: number,
): Promise<MobileCustomerProfile> {
  requireCustomerWrite(user);
  return withMobileData(user, "", async () => {
    const result = await himotoPool.query(
      `SELECT id,name,phone,email,address,id_card,customer_type,nationality,contact_channel,contact_detail,
      store_id,status,warning,driver_license_number,driver_license_issued_on::text AS driver_license_issued_on,
      id_card_issued_on::text AS id_card_issued_on,id_card_issued_by,relatives,xmin::text AS revision
      FROM himoto.customers WHERE id=$1`,
      [id],
    );
    const row = result.rows[0];
    if (!row)
      throw new MobileError(
        "Không tìm thấy hồ sơ khách hàng trong phạm vi được cấp.",
        404,
        "NOT_FOUND",
      );
    const text = (key: string) => (row[key] == null ? "" : String(row[key]));
    let relatives: MobileCustomerProfile["relatives"];
    try {
      relatives = parseCustomerRelatives(row.relatives ?? []);
    } catch {
      throw new MobileError(
        "Thông tin người thân cần được kiểm tra lại trước khi chỉnh sửa hồ sơ.",
        409,
        "DATA_REVIEW_REQUIRED",
      );
    }
    return {
      id: Number(row.id),
      name: text("name"),
      phone: text("phone"),
      email: text("email"),
      address: text("address"),
      id_card: text("id_card"),
      customer_type: row.customer_type === "foreign" ? "foreign" : "vietnam",
      nationality: text("nationality"),
      contact_channel: text("contact_channel"),
      contact_detail: text("contact_detail"),
      store_id: row.store_id == null ? null : Number(row.store_id),
      status:
        Number(row.status) === 2
          ? "blacklist"
          : Number(row.status) === 0
            ? "draft"
            : text("warning").trim()
              ? "warning"
              : "active",
      warning_note: text("warning"),
      driver_license_number: text("driver_license_number"),
      driver_license_issued_on: text("driver_license_issued_on"),
      id_card_issued_on: text("id_card_issued_on"),
      id_card_issued_by: text("id_card_issued_by"),
      relatives,
      revision: text("revision"),
    };
  });
}
export async function writeMobileCustomer(
  user: SessionUser,
  request: NextRequest,
  id: number | null,
) {
  requireCustomerWrite(user);
  const requestId = mobileRequestKey(request.headers.get("idempotency-key"));
  const body = await mobileBody(request);
  if (
    body.allow_incomplete !== undefined &&
    typeof body.allow_incomplete !== "boolean"
  )
    throw new MobileError("Trạng thái hồ sơ chưa hoàn tất không hợp lệ.");
  if (body.relatives !== undefined && !Array.isArray(body.relatives))
    throw new MobileError("Thông tin người thân không hợp lệ.");
  for (const key of Object.keys(body))
    if (!customerFields.has(key))
      throw new MobileError("Biểu mẫu chứa trường không được hỗ trợ.");
  for (const key of customerFields) {
    if (
      body[key] !== undefined &&
      !["store_id", "allow_incomplete", "relatives"].includes(key) &&
      typeof body[key] !== "string"
    )
      throw new MobileError("Thông tin nhập không hợp lệ.");
  }
  const limits: Record<string, number> = {
    name: 200,
    email: 254,
    address: 2000,
    warning_note: 2000,
  };
  for (const [key, max] of Object.entries(limits))
    if (typeof body[key] === "string" && body[key].length > max)
      throw new MobileError(
        "Thông tin nhập quá dài. Rút gọn nội dung và thử lại.",
        400,
        "INVALID_CUSTOMER",
      );
  if (
    id !== null &&
    (typeof body.revision !== "string" ||
      !/^[1-9]\d{0,19}$/.test(body.revision))
  )
    throw new MobileError(
      "Thiếu phiên bản hồ sơ. Tải lại thông tin khách hàng.",
      400,
      "REVISION_REQUIRED",
    );
  if (!Number.isSafeInteger(body.store_id) || Number(body.store_id) <= 0)
    throw new MobileError(
      "Chọn cơ sở quản lý khách hàng.",
      400,
      "STORE_REQUIRED",
    );
  if (!user.scope_all && Number(body.store_id) !== user.store_id)
    throw new MobileError(
      "Chỉ được lưu khách hàng tại cơ sở được phân công.",
      403,
      "FORBIDDEN",
    );
  let data: ReturnType<typeof parseCustomerWrite>;
  try {
    data = parseCustomerWrite(body, id === null ? "create" : "update");
  } catch (error) {
    if (error instanceof CustomerWriteError)
      throw new MobileError(error.message, error.status, "INVALID_CUSTOMER");
    throw error;
  }
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const receipt = await idempotentMobileWrite(
        client,
        user.id,
        requestId,
        id === null ? "customer.create" : `customer.update:${id}`,
        { id, data, revision: body.revision },
        async () => {
          const row =
            id === null
              ? insertCustomer(client, data)
              : updateCustomer(client, id, data, {
                  revision: String(body.revision),
                  updateEmail: true,
                });
          const saved = await row;
          return {
            id: Number(saved.id),
            revision: String(saved.customer_revision),
          };
        },
      );
      if (receipt.replayed) {
        const visible = await client.query(
          "SELECT id FROM himoto.customers WHERE id=$1",
          [receipt.id],
        );
        if (!visible.rowCount)
          throw new MobileError(
            "Hồ sơ đã ra ngoài phạm vi truy cập hiện tại.",
            403,
            "FORBIDDEN",
          );
      }
      await client.query("COMMIT");
      return receipt;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof CustomerWriteError)
        throw new MobileError(
          error.message,
          error.status,
          error instanceof CustomerDuplicateError ? "CUSTOMER_EXISTS" : error.status === 409 ? "CUSTOMER_CONFLICT" : "INVALID_CUSTOMER",
        );
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function readMobileCustomerReceipt(
  user: SessionUser,
  requestId: string,
) {
  requireCustomerWrite(user);
  mobileRequestKey(requestId);
  return withMobileData(user, "", async () => {
    const result = await himotoPool.query(
      `SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests
      WHERE user_id=$1 AND request_id=$2 AND resource_id IS NOT NULL AND (operation='customer.create' OR operation LIKE 'customer.update:%')`,
      [user.id, requestId],
    );
    const row = result.rows[0];
    if (!row) return { receipt: null };
    const visible = await himotoPool.query(
      "SELECT id FROM himoto.customers WHERE id=$1",
      [row.resource_id],
    );
    if (!visible.rowCount)
      throw new MobileError(
        "Hồ sơ đã ra ngoài phạm vi truy cập hiện tại.",
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

export async function readMobileCustomerDetail(
  user: SessionUser,
  id: number,
): Promise<MobileCustomerDetail> {
  if (!hasPermission(user, "customers.read"))
    throw new MobileError("Tài khoản không có quyền xem khách hàng.", 403, "FORBIDDEN");
  return withMobileReadData(user, "", async () => {
    const result = await himotoPool.query(
      `SELECT c.id,c.name,c.phone,c.email,c.address,c.id_card,c.customer_type,c.nationality,c.contact_channel,c.contact_detail,
        c.store_id,COALESCE(s.store_name,'') AS store_name,c.status,c.warning,c.driver_license_number,
        c.driver_license_issued_on::text AS driver_license_issued_on,c.id_card_issued_on::text AS id_card_issued_on,
        c.id_card_issued_by,c.relatives,c.xmin::text AS revision,
        (SELECT count(*)::int FROM himoto.orders o WHERE o.customer_id=c.id AND o.deleted_at IS NULL) AS contract_count
       FROM himoto.customers c
       LEFT JOIN himoto.store_directory() s ON s.id=c.store_id
       WHERE c.id=$1`,
      [id],
    );
    const row = result.rows[0];
    if (!row)
      throw new MobileError("Không tìm thấy hồ sơ khách hàng trong phạm vi được cấp.", 404, "NOT_FOUND");
    const text = (key: string) => (row[key] == null ? "" : String(row[key]));
    let relatives: MobileCustomerDetail["relatives"] = [];
    try {
      relatives = parseCustomerRelatives(row.relatives ?? []);
    } catch {
      relatives = [];
    }
    return {
      id: Number(row.id),
      code: `KH-${String(row.id).padStart(4, "0")}`,
      name: text("name"),
      phone: text("phone"),
      email: text("email"),
      address: text("address"),
      id_card: text("id_card"),
      customer_type: row.customer_type === "foreign" ? "foreign" : "vietnam",
      nationality: text("nationality"),
      contact_channel: text("contact_channel"),
      contact_detail: text("contact_detail"),
      store_id: row.store_id == null ? null : Number(row.store_id),
      store_name: text("store_name"),
      status:
        Number(row.status) === 2
          ? "blacklist"
          : Number(row.status) === 0
            ? "draft"
            : text("warning").trim()
              ? "warning"
              : "active",
      warning_note: text("warning"),
      driver_license_number: text("driver_license_number"),
      driver_license_issued_on: text("driver_license_issued_on"),
      id_card_issued_on: text("id_card_issued_on"),
      id_card_issued_by: text("id_card_issued_by"),
      relatives,
      revision: text("revision"),
      contract_count: Number(row.contract_count || 0),
    };
  });
}

export async function readMobileCustomerPayments(
  user: SessionUser,
  id: number,
): Promise<{ id: number; rows: MobileCustomerPayment[] }> {
  if (!hasPermission(user, "customers.read"))
    throw new MobileError("Tài khoản không có quyền xem thanh toán khách hàng.", 403, "FORBIDDEN");
  return withMobileReadData(user, "", async () => {
    const visible = await himotoPool.query("SELECT id FROM himoto.customers WHERE id=$1", [id]);
    if (!visible.rowCount)
      throw new MobileError("Không tìm thấy hồ sơ khách hàng trong phạm vi được cấp.", 404, "NOT_FOUND");
    const cashflow = await readCustomerCashflow(himotoPool, id);
    return {
      id,
      rows: cashflow.map((row) => ({
        id: row.id,
        at: row.at,
        type: row.type,
        reason: row.reason,
        note: row.note,
        amount: Number.isFinite(row.amount) ? row.amount : null,
        method: row.method,
        account: row.account,
        actor: row.actor,
        status: row.status,
        status_code: row.status_code || "",
        order_id: row.order_id ?? null,
        contract_code: row.contract_code || "",
      })),
    };
  });
}

export async function writeMobileCustomerBlacklist(
  user: SessionUser,
  request: NextRequest,
  id: number,
): Promise<{ id: number; status: string; revision: string }> {
  requireCustomerWrite(user);
  const body = await mobileBody(request);
  let parsed: ReturnType<typeof parseBlacklistChange>;
  try {
    parsed = parseBlacklistChange(body);
  } catch (error) {
    if (error instanceof CustomerBlacklistError)
      throw new MobileError(error.message, error.status, "INVALID_BLACKLIST");
    throw error;
  }
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='20s'");
      const updated = await changeCustomerBlacklist(client, id, parsed);
      await client.query("COMMIT");
      return {
        id: Number(updated.id),
        status: updated.status,
        revision: String(updated.customer_revision),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof CustomerBlacklistError)
        throw new MobileError(error.message, error.status, error.status === 409 ? "CUSTOMER_CONFLICT" : "INVALID_BLACKLIST");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function deleteMobileCustomer(
  user: SessionUser,
  id: number,
): Promise<{ id: number; deleted: true }> {
  if (!hasPermission(user, "settings.write") || !hasPermission(user, "customers.read"))
    throw new MobileError("Tài khoản không có quyền xóa khách hàng.", 403, "FORBIDDEN");
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const customer = await client.query("SELECT id FROM himoto.customers WHERE id=$1 FOR UPDATE", [id]);
      if (!customer.rowCount) {
        await client.query("ROLLBACK");
        throw new MobileError("Không tìm thấy khách hàng cần xóa.", 404, "NOT_FOUND");
      }
      const linkedOrders = await client.query("SELECT count(*)::int AS count FROM himoto.orders WHERE customer_id=$1", [id]);
      const count = Number(linkedOrders.rows[0]?.count || 0);
      if (count > 0) {
        await client.query("ROLLBACK");
        throw new MobileError(
          `Không thể xóa hồ sơ này vì đang liên kết với ${count} đơn thuê. Hãy giữ lại hồ sơ để bảo toàn lịch sử hợp đồng.`,
          409,
          "CUSTOMER_LINKED_CONTRACTS",
        );
      }
      await client.query("DELETE FROM himoto.customers WHERE id=$1", [id]);
      await client.query("COMMIT");
      return { id, deleted: true as const };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}

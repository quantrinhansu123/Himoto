import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import type { MobileWriteReceipt } from "../../../shared/mobile-contract";
import { MobileError } from "./mobile-session";

export function mobileRequestKey(value: string | null) {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new MobileError(
      "Mã lần lưu không hợp lệ. Mở lại biểu mẫu và thử lại.",
      400,
      "INVALID_REQUEST_KEY",
    );
  return value;
}
export async function mobileBody(
  request: NextRequest,
  maxBytes = 32768,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new MobileError("Nội dung yêu cầu không hợp lệ.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new MobileError("Thiếu thông tin cần lưu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new MobileError("Thông tin nhập quá dài.", 413);
      }
      chunks.push(next.value);
    }
    const bytes = Buffer.concat(chunks);
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid object");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MobileError) throw error;
    throw new MobileError("Thông tin gửi lên không hợp lệ.");
  } finally {
    reader.releaseLock();
  }
}

// Execute inside the same scoped transaction as the business write. The unique
// actor/key and row lock serialize retries; a rolled-back operation leaves no receipt.
export async function idempotentMobileWrite(
  client: PoolClient,
  userId: number,
  requestId: string,
  operation: string,
  normalized: unknown,
  write: () => Promise<{ id: number; revision: string }>,
): Promise<MobileWriteReceipt> {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  await client.query(
    `INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint)
    VALUES($1,$2,$3,$4) ON CONFLICT(user_id,request_id) DO NOTHING`,
    [userId, requestId, operation, fingerprint],
  );
  const result = await client.query(
    `SELECT operation,fingerprint,resource_id,resource_revision FROM himoto.management_mobile_requests
    WHERE user_id=$1 AND request_id=$2 FOR UPDATE`,
    [userId, requestId],
  );
  const previous = result.rows[0];
  if (!previous)
    throw new MobileError("Chưa xác nhận được lần lưu. Vui lòng thử lại.", 503);
  if (String(previous.operation).startsWith("cancelled:"))
    throw new MobileError(
      "Mã thao tác này đã được hủy. Vào Tài khoản để đối chiếu, rồi mở lại hồ sơ trước khi tiếp tục.",
      409,
      "REQUEST_CANCELLED",
    );
  if (previous.operation !== operation || previous.fingerprint !== fingerprint)
    throw new MobileError(
      "Lần lưu trước có nội dung khác. Kiểm tra hồ sơ đã lưu trước khi tiếp tục.",
      409,
      "REQUEST_KEY_REUSED",
    );
  if (previous.resource_id != null)
    return {
      id: Number(previous.resource_id),
      revision: String(previous.resource_revision),
      replayed: true,
    };
  const row = await write();
  if (
    !Number.isSafeInteger(row.id) ||
    row.id <= 0 ||
    typeof row.revision !== "string" ||
    !/^[1-9]\d{0,19}$/.test(row.revision)
  )
    throw new MobileError(
      "Chưa xác nhận được kết quả lưu. Giữ biểu mẫu và thử lại.",
      503,
      "INVALID_WRITE_RECEIPT",
    );
  await client.query(
    `UPDATE himoto.management_mobile_requests SET resource_id=$3,resource_revision=$4
    WHERE user_id=$1 AND request_id=$2`,
    [userId, requestId, row.id, row.revision],
  );
  return {
    id: Number(row.id),
    revision: row.revision,
    replayed: false,
  };
}

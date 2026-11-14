import { NextRequest } from "next/server";
import { authenticateAccount } from "@/lib/server/management-session";
import {
  assertMobileRequest,
  consumeMobileLoginAttempt,
  createMobileSession,
  MobileError,
  mobileUser,
  requireMobileSession,
  revokeMobileSession,
} from "@/lib/server/mobile-session";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
import { createRotatingMobileSession } from '@/lib/server/mobile-refresh';

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  try {
    assertMobileRequest(request);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new MobileError("Dữ liệu đăng nhập không hợp lệ.", 415);
    // Read a bounded stream; never trust Content-Length from a mobile client.
    const reader = request.body?.getReader();
    if (!reader) throw new MobileError("Thiếu thông tin đăng nhập.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          throw new MobileError("Dữ liệu đăng nhập quá lớn.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new MobileError("Dữ liệu đăng nhập không hợp lệ.");
    }
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      !/^[a-zA-Z0-9._@+-]{3,254}$/.test(body.email.trim()) ||
      !body.password ||
      body.password.length > 256 ||
      !["ios", "android"].includes(body.platform) ||
      typeof body.deviceName !== "string" ||
      !body.deviceName.trim() ||
      body.deviceName.length > 100
    ) {
      throw new MobileError("Kiểm tra tài khoản và mật khẩu đã nhập.");
    }
    await consumeMobileLoginAttempt(body.email.trim());
    const user = await authenticateAccount(body.email.trim(), body.password);
    return mobileJson(
      await (body.sessionVersion === 2 ? createRotatingMobileSession : createMobileSession)(user, body.deviceName.trim(), body.platform),
      201,
    );
  } catch (error) {
    return mobileFailure(error);
  }
}
export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    return mobileJson({
      user: mobileUser(session.user),
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return mobileFailure(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    await revokeMobileSession(session.sessionId, session.user.id);
    return mobileJson({ success: true });
  } catch (error) {
    return mobileFailure(error);
  }
}

import "server-only";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ownerDatabase } from "./himoto-database";
import {
  isManagementConfigured,
  sessionUserById,
  SESSION_SECONDS,
  type SessionUser,
} from "./management-session";
import {
  hasPermission,
  ACCESS_PERMISSIONS,
} from "@/lib/management/permissions";
import type {
  MobileUser,
  MobileSession,
} from "../../../shared/mobile-contract";

type Database = Pick<typeof ownerDatabase, "query">;
export class MobileError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_REQUEST",
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export function assertMobileRequest(request: NextRequest) {
  if (
    process.env.HIMOTO_MOBILE_ENABLED !== "true" ||
    !isManagementConfigured()
  ) {
    throw new MobileError(
      "Ứng dụng đang được chuẩn bị. Vui lòng liên hệ quản trị viên.",
      503,
      "MOBILE_UNAVAILABLE",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    request.nextUrl.protocol !== "https:"
  ) {
    throw new MobileError("Kết nối không an toàn.", 403, "HTTPS_REQUIRED");
  }
  // A dedicated native API: browser cookies, cross-origin requests and wildcard
  // CORS never grant access. The existing web session API remains unchanged.
  if (request.headers.has("origin"))
    throw new MobileError(
      "Yêu cầu không hợp lệ.",
      403,
      "NATIVE_CLIENT_REQUIRED",
    );
}
export function mobileUser(user: SessionUser): MobileUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.access_role || user.role,
    permissions: ACCESS_PERMISSIONS.filter((permission) =>
      hasPermission(user, permission),
    ),
    storeId: user.store_id ?? null,
    allStores: user.scope_all === true,
  };
}
export function bearerToken(request: NextRequest): string {
  const header = request.headers.get("authorization") || "";
  if (!/^Bearer hm1_[A-Za-z0-9_-]{43}$/.test(header))
    throw new MobileError("Vui lòng đăng nhập lại.", 401, "SESSION_EXPIRED");
  return header.slice(7);
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function consumeMobileLoginAttempt(
  email: string,
  database: Database = ownerDatabase,
) {
  const secret = process.env.MANAGEMENT_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new MobileError(
      "Chưa cấu hình đăng nhập ứng dụng.",
      503,
      "MOBILE_UNAVAILABLE",
    );
  const hash = createHmac("sha256", secret)
    .update(`mobile-login:${email.toLowerCase()}`)
    .digest("hex");
  const result = await database.query(
    `INSERT INTO himoto.management_mobile_login_limits AS limits (bucket_hash,attempts,expires_at)
    VALUES ($1,1,now()+interval '15 minutes') ON CONFLICT (bucket_hash) DO UPDATE SET
    attempts=CASE WHEN limits.expires_at<=now() THEN 1 ELSE LEAST(limits.attempts+1,11) END,
    expires_at=CASE WHEN limits.expires_at<=now() THEN now()+interval '15 minutes' ELSE limits.expires_at END
    RETURNING attempts`,
    [hash],
  );
  if (Number(result.rows[0]?.attempts) > 10)
    throw new MobileError(
      "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.",
      429,
      "RATE_LIMITED",
    );
}
export async function createMobileSession(
  user: SessionUser,
  deviceName: string,
  platform: "ios" | "android",
  database: Database = ownerDatabase,
): Promise<MobileSession> {
  const token = `hm1_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await database.query(
    `INSERT INTO himoto.management_mobile_sessions
    (id,user_id,token_hash,password_version,device_name,platform,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      user.id,
      tokenHash(token),
      user.password_version || 0,
      deviceName,
      platform,
      expiresAt,
    ],
  );
  return { token, expiresAt, user: mobileUser(user) };
}
export async function requireMobileSession(
  request: NextRequest,
  database: Database = ownerDatabase,
) {
  assertMobileRequest(request);
  const token = bearerToken(request);
  const result = await database.query(
    `SELECT id,user_id,password_version,expires_at FROM himoto.management_mobile_sessions
    WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,
    [tokenHash(token)],
  );
  const session = result.rows[0];
  if (!session)
    throw new MobileError(
      "Phiên đã hết hạn. Vui lòng đăng nhập lại.",
      401,
      "SESSION_EXPIRED",
    );
  const user = await sessionUserById(
    Number(session.user_id),
    Number(session.password_version),
    database,
  );
  if (!user)
    throw new MobileError(
      "Phiên không còn hiệu lực. Vui lòng đăng nhập lại.",
      401,
      "SESSION_EXPIRED",
    );
  return {
    user,
    sessionId: String(session.id),
    expiresAt: new Date(session.expires_at).toISOString(),
  };
}
export async function revokeMobileSession(
  sessionId: string,
  userId: number,
  database: Database = ownerDatabase,
) {
  await database.query(
    "UPDATE himoto.management_mobile_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",
    [sessionId, userId],
  );
}

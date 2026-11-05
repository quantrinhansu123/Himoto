import { NextResponse } from "next/server";
import { MobileError } from "./mobile-session";
import { LoginError } from "./management-session";

export const MOBILE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};
export function mobileJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: MOBILE_HEADERS });
}
export function mobileFailure(error: unknown) {
  if (error instanceof MobileError)
    return NextResponse.json(
      {
        message: error.message,
        code: error.code,
        ...(error.fields && Object.keys(error.fields).length
          ? { fields: error.fields }
          : {}),
      },
      {
        status: error.status,
        headers: {
          ...MOBILE_HEADERS,
          ...(error.status === 429 ? { "Retry-After": "900" } : {}),
        },
      },
    );
  if (error instanceof LoginError)
    return mobileJson(
      { message: error.message, code: "LOGIN_FAILED" },
      error.status,
    );
  // Do not include SQL, tokens, account details or database errors in responses/logs.
  console.error("Mobile API unavailable", {
    code:
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "UNKNOWN",
  });
  return mobileJson(
    {
      message: "Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại.",
      code: "SERVICE_UNAVAILABLE",
    },
    503,
  );
}

import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { resolveMobileWrite } from "@/lib/server/mobile-write-recovery";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { user } = await requireMobileSession(request);
    const { key } = await params;
    return mobileJson(await resolveMobileWrite(user, key, request));
  } catch (error) {
    return mobileFailure(error);
  }
}

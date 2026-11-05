import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { directoryKind, readMobileDirectory } from "@/lib/server/mobile-directory";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await readMobileDirectory(user, directoryKind((await context.params).kind), request.nextUrl.searchParams));
  } catch (error) { return mobileFailure(error); }
}

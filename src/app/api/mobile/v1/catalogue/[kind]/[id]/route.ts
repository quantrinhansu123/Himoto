import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { catalogueKind, readMobileRecord } from "@/lib/server/mobile-catalogue";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { user } = await requireMobileSession(request);
    const { kind, id } = await context.params;
    return mobileJson(await readMobileRecord(user, catalogueKind(kind), id));
  } catch (error) {
    return mobileFailure(error);
  }
}

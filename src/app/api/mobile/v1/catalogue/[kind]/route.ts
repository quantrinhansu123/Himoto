import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { catalogueKind, readMobilePage } from "@/lib/server/mobile-catalogue";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string }> },
) {
  try {
    const { user } = await requireMobileSession(request);
    const { kind } = await context.params;
    return mobileJson(
      await readMobilePage(
        user,
        catalogueKind(kind),
        request.nextUrl.searchParams,
      ),
    );
  } catch (error) {
    return mobileFailure(error);
  }
}

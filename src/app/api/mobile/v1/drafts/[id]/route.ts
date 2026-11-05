import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import {
  mobileDraftId,
  readMobileDraft,
  writeMobileDraft,
} from "@/lib/server/mobile-drafts";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(
      await readMobileDraft(user, mobileDraftId((await context.params).id)),
    );
  } catch (error) {
    return mobileFailure(error);
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(
      await writeMobileDraft(
        user,
        request,
        mobileDraftId((await context.params).id),
      ),
    );
  } catch (error) {
    return mobileFailure(error);
  }
}

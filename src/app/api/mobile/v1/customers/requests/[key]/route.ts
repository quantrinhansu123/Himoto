import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileCustomerReceipt } from "@/lib/server/mobile-customers";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(
      await readMobileCustomerReceipt(user, (await context.params).key),
    );
  } catch (error) {
    return mobileFailure(error);
  }
}

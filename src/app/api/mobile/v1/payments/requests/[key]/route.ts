import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobilePaymentReceipt } from "@/lib/server/mobile-finance";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { key } = await params;
    return mobileJson(await readMobilePaymentReceipt(user, key));
  } catch (error) { return mobileFailure(error); }
}

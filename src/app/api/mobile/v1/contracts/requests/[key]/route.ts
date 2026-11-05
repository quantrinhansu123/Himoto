import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileContractReceipt } from "@/lib/server/mobile-contracts";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { user } = await requireMobileSession(request);
    const { key } = await params;
    return mobileJson(await readMobileContractReceipt(user, key));
  } catch (error) {
    return mobileFailure(error);
  }
}

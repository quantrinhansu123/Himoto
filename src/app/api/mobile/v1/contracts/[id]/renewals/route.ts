import { NextRequest, after } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileRenewalPreparation } from "@/lib/server/mobile-renewals";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
import { recordMobileRenewal, queueMobileRenewalEvent } from "@/lib/server/mobile-renewal-write";

export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { id } = await params;
    return mobileJson(await readMobileRenewalPreparation(user, id, request));
  } catch (error) { return mobileFailure(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { id } = await params;
    const receipt = await recordMobileRenewal(user, id, request);
    after(() => queueMobileRenewalEvent(user, receipt.id, receipt.version));
    return mobileJson(receipt);
  } catch (error) { return mobileFailure(error); }
}

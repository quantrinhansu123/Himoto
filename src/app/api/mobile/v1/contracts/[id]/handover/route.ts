import { NextRequest, after } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import {
  mobileContractId,
  writeMobileContractAction,
  queueMobileContractEvent,
} from "@/lib/server/mobile-contracts";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireMobileSession(request);
    const { id: value } = await params;
    const id = mobileContractId(value);
    const receipt = await writeMobileContractAction(
      user,
      request,
      id,
      "handover",
    );
    after(() => queueMobileContractEvent(user, id, "handover"));
    return mobileJson(receipt);
  } catch (error) {
    return mobileFailure(error);
  }
}

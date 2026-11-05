import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import {
  mobileContractId,
  readMobileContractPreparation,
} from "@/lib/server/mobile-contracts";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireMobileSession(request);
    const { id } = await params;
    return mobileJson(
      await readMobileContractPreparation(user, mobileContractId(id)),
    );
  } catch (error) {
    return mobileFailure(error);
  }
}

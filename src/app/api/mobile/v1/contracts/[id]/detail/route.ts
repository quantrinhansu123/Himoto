import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileContractDetail } from "@/lib/server/mobile-contract-detail";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await readMobileContractDetail(user, (await context.params).id));
  } catch (error) {
    return mobileFailure(error);
  }
}

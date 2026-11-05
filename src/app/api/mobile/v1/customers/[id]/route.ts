import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import {
  mobileCustomerId,
  readMobileCustomer,
  writeMobileCustomer,
} from "@/lib/server/mobile-customers";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(
      await readMobileCustomer(
        user,
        mobileCustomerId((await context.params).id),
      ),
    );
  } catch (error) {
    return mobileFailure(error);
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(
      await writeMobileCustomer(
        user,
        request,
        mobileCustomerId((await context.params).id),
      ),
    );
  } catch (error) {
    return mobileFailure(error);
  }
}

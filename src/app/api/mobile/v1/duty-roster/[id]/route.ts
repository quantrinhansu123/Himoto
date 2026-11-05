import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { writeMobileDuty } from "@/lib/server/mobile-duty-roster";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
async function write(request: NextRequest, context: { params: Promise<{ id: string }> }, method: "PATCH" | "DELETE") {
  try { const { user } = await requireMobileSession(request); return mobileJson(await writeMobileDuty(user, request, method, (await context.params).id)); }
  catch (error) { return mobileFailure(error); }
}
export const PATCH = (request: NextRequest, context: { params: Promise<{ id: string }> }) => write(request, context, "PATCH");
export const DELETE = (request: NextRequest, context: { params: Promise<{ id: string }> }) => write(request, context, "DELETE");
